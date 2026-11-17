// Mouser Search API (propuesta: "API de Mouser para buscar por palabra o
// número de parte"). El admin busca un componente en el catálogo de Mouser y
// lo importa a Voltrix con su descripción, ficha técnica (atributos y
// datasheet), imagen y un precio sugerido en MXN.
//   POST https://api.mouser.com/api/v1/search/keyword?apiKey=…
//   POST https://api.mouser.com/api/v1/search/partnumber?apiKey=…
// La llave gratis permite ~30 llamadas por minuto y ~1000 al día: por eso hay
// caché de 10 minutos y un tope propio de 25 por minuto, y solo un ADMIN busca.
const API = 'https://api.mouser.com/api/v1/search'
const CLAVE = process.env.MOUSER_API_KEY || ''
// Para el precio sugerido: USD -> MXN y margen de la tienda. IVA aparte.
const TIPO_CAMBIO = Number(process.env.MOUSER_TIPO_CAMBIO) || 18.5
const MARGEN = Number(process.env.MOUSER_MARGEN) || 1.35
const IVA = 1.16

export const mouserConfigurado = () => Boolean(CLAVE)
export class ErrorMouser extends Error {}

const CACHE_MS = 10 * 60 * 1000
const MAX_POR_MINUTO = 25
const cache = new Map()
let llamadas = []

// "$1,234.56" / "1.234,56 €" -> 1234.56 (Mouser también manda RawPrice numérico).
export function precioNumero(p) {
  if (typeof p.RawPrice === 'number' && p.RawPrice > 0) return p.RawPrice
  const limpio = String(p.Price ?? '').replace(/[^\d.,]/g, '')
  const normal = /,\d{2}$/.test(limpio) ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, '')
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

// Precio de venta sugerido en MXN con IVA, a partir del precio por 1 pieza.
// Con cuenta de México Mouser puede cotizar en MXN: entonces no se convierte.
export function precioSugerido(precio, moneda = 'USD', { tipoCambio = TIPO_CAMBIO, margen = MARGEN } = {}) {
  if (!precio) return null
  const factor = moneda === 'MXN' ? 1 : moneda === 'USD' ? tipoCambio : null
  if (!factor) return null // otra moneda: que el admin ponga el precio
  return Math.ceil(precio * factor * margen * IVA) // redondeado al peso hacia arriba
}

// "1,234 In Stock" / "1,234 En existencia" -> 1234. Sin número -> 0.
export function existencias(p) {
  const directo = Number(String(p.AvailabilityInStock ?? '').replace(/\D/g, ''))
  if (directo) return directo
  const m = /^\s*([\d.,]+)\s/.exec(String(p.Availability ?? ''))
  return m ? Number(m[1].replace(/\D/g, '')) : 0
}

const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

// MouserPart -> lo que usa la tienda.
export function normalizarParte(p) {
  const precios = (p.PriceBreaks ?? [])
    .map((b) => ({ cantidad: Number(b.Quantity) || 1, precio: precioNumero(b), moneda: b.Currency || 'USD' }))
    .filter((b) => b.precio)
    .sort((a, b) => a.cantidad - b.cantidad)
  const unitario = precios.find((b) => b.cantidad === 1) ?? precios[0]
  const atributos = []
  const vistos = new Set()
  for (const a of p.ProductAttributes ?? []) {
    const nombre = texto(a.AttributeName, 60)
    const valor = texto(a.AttributeValue, 200)
    // Mouser repite atributos (p. ej. varias "Packaging"); la ficha no admite nombres repetidos.
    if (!nombre || !valor || vistos.has(nombre.toLowerCase())) continue
    vistos.add(nombre.toLowerCase())
    atributos.push({ nombre, valor })
  }
  const enStock = existencias(p)
  const https = (u) => (u && /^https?:\/\//.test(u) ? u.replace(/^http:/, 'https:') : null)
  return {
    numeroMouser: texto(p.MouserPartNumber, 60),
    numeroFabricante: texto(p.ManufacturerPartNumber, 60),
    fabricante: texto(p.Manufacturer, 80),
    descripcion: texto(p.Description, 255),
    categoria: texto(p.Category, 100),
    datasheetUrl: https(p.DataSheetUrl),
    imagenUrl: https(p.ImagePath),
    urlMouser: https(p.ProductDetailUrl),
    disponibilidad: texto(p.Availability, 100) || null,
    enStock,
    precioUsd: unitario?.moneda === 'USD' ? unitario.precio : null,
    precioMouser: unitario?.precio ?? null,
    moneda: unitario?.moneda ?? null,
    precios,
    precioSugeridoMxn: unitario ? precioSugerido(unitario.precio, unitario.moneda) : null,
    // "Mouser no vende este producto en su región", "Obsolete", etc.
    aviso: texto(p.RestrictionMessage, 200) || (p.LifecycleStatus ? texto(p.LifecycleStatus, 60) : null),
    atributos: atributos.slice(0, 40),
  }
}

async function llamar(ruta, cuerpo) {
  const ahora = Date.now()
  llamadas = llamadas.filter((t) => ahora - t < 60_000)
  if (llamadas.length >= MAX_POR_MINUTO) throw new ErrorMouser('Demasiadas búsquedas en Mouser; espera un minuto.')
  llamadas.push(ahora)

  let res
  try {
    res = await fetch(`${API}/${ruta}?apiKey=${encodeURIComponent(CLAVE)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new ErrorMouser(`Mouser no respondió (${err.message}).`)
  }
  const datos = await res.json().catch(() => ({}))
  const errores = datos.Errors ?? []
  if (!res.ok || errores.length) {
    const msg = errores.map((e) => e.Message).filter(Boolean).join(' ') || `HTTP ${res.status}`
    throw new ErrorMouser(`Mouser rechazó la búsqueda: ${msg}`)
  }
  return datos.SearchResults?.Parts ?? []
}

// texto: palabras ("esp32 wroom") o número de parte ("595-LM317T", "LM317T").
export async function buscarEnMouser({ texto: consulta, porNumeroDeParte = false, limite = 10 }) {
  if (!CLAVE) throw new ErrorMouser('La búsqueda en Mouser no está configurada (MOUSER_API_KEY).')
  const q = texto(consulta, 100)
  if (q.length < 2) throw new ErrorMouser('Escribe al menos 2 caracteres.')
  const n = Math.min(Math.max(limite, 1), 50)
  const clave = `${porNumeroDeParte ? 'parte' : 'palabra'}:${q.toLowerCase()}:${n}`
  const guardado = cache.get(clave)
  if (guardado && Date.now() - guardado.fecha < CACHE_MS) return guardado.partes

  const crudas = porNumeroDeParte
    ? await llamar('partnumber', { SearchByPartRequest: { mouserPartNumber: q, partSearchOptions: 'None' } })
    : await llamar('keyword', {
        SearchByKeywordRequest: { keyword: q, records: n, startingRecord: 0, searchOptions: 'None', searchWithYourSignUpLanguage: 'false' },
      })
  const partes = crudas.slice(0, n).map(normalizarParte)
  cache.set(clave, { fecha: Date.now(), partes })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return partes
}

// Las imágenes de Mouser solo se aceptan de sus propios dominios.
export function esImagenDeMouser(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'www.mouser.com' || u.hostname.endsWith('.mouser.com'))
  } catch {
    return false
  }
}
