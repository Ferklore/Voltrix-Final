// Servicio de mapas (SRS §3.3: "servicios de mapas, ubicación de envío").
//   - HERE Geocoding & Search: dirección escrita -> coordenadas. Se llama desde
//     el backend, así la llave (HERE_API_KEY) nunca llega al navegador.
//   - El mapa se dibuja en el navegador con Leaflet (frontend/src/components/Mapa.jsx).
// El cliente puede mover el pin si HERE no lo dejó exacto; esas coordenadas
// se validan aquí (dentro de México) y se guardan con la dirección.
//   GET https://geocode.search.hereapi.com/v1/geocode?qq=…&in=countryCode:MEX&apiKey=…
const API = 'https://geocode.search.hereapi.com/v1/geocode'
const CLAVE = process.env.HERE_API_KEY || ''

export const mapasConfigurado = () => Boolean(CLAVE)
export class ErrorMapas extends Error {}

// Rectángulo que cubre la República Mexicana (con margen para islas y costas).
const MEXICO = { latMin: 14.3, latMax: 32.8, lngMin: -118.5, lngMax: -86.6 }

export function coordenadasValidas(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= MEXICO.latMin && lat <= MEXICO.latMax &&
    lng >= MEXICO.lngMin && lng <= MEXICO.lngMax
  )
}

// Con 6 decimales (~10 cm) sobra; más es ruido.
const redondear = (n) => Math.round(n * 1e6) / 1e6

// Qué tan exacta quedó la ubicación, en palabras para el cliente.
const PRECISION = {
  houseNumber: 'número exterior',
  street: 'calle',
  intersection: 'cruce de calles',
  postalCodePoint: 'código postal',
  locality: 'colonia o ciudad',
  administrativeArea: 'estado',
  place: 'lugar',
}

// Consulta "calificada" (qq): HERE recibe cada parte de la dirección por
// separado y acierta más que con un texto libre.
export function consultaHere(d) {
  const partes = [
    ['street', d.calle],
    ['district', d.colonia],
    ['city', d.ciudad],
    ['state', d.estado],
    ['postalCode', d.codigoPostal],
    ['country', 'MEX'],
  ].filter(([, v]) => v)
  return partes.map(([k, v]) => `${k}=${String(v).replace(/;/g, ' ')}`).join(';')
}

// Respuesta de HERE -> { lat, lng, etiqueta, precision } o null si no encontró.
export function leerRespuestaHere(datos) {
  const item = datos?.items?.[0]
  if (!item?.position) return null
  const { lat, lng } = item.position
  if (!coordenadasValidas(lat, lng)) return null
  return {
    lat: redondear(lat),
    lng: redondear(lng),
    etiqueta: item.address?.label || item.title || null,
    precision: PRECISION[item.resultType] || item.resultType || null,
  }
}

const cache = new Map()

// d: dirección ya normalizada (calle, colonia, ciudad, estado, codigoPostal).
export async function geocodificar(d) {
  if (!CLAVE) throw new ErrorMapas('El servicio de mapas no está configurado (HERE_API_KEY).')
  const qq = consultaHere(d)
  if (cache.has(qq)) return cache.get(qq)

  const url = `${API}?${new URLSearchParams({ qq, in: 'countryCode:MEX', limit: '1', lang: 'es-MX', apiKey: CLAVE })}`
  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    throw new ErrorMapas(`HERE no respondió (${err.message}).`)
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorMapas(`HERE rechazó la búsqueda: ${datos.error_description || datos.title || res.status}`)
  const ubicacion = leerRespuestaHere(datos)
  cache.set(qq, ubicacion)
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return ubicacion
}

// Para guardar: usa el pin del cliente si lo movió (y es válido); si no,
// pregunta a HERE. Nunca lanza: sin ubicación la dirección se guarda igual.
export async function ubicacionParaGuardar(d, pin) {
  if (pin && coordenadasValidas(pin.lat, pin.lng)) return { lat: redondear(pin.lat), lng: redondear(pin.lng) }
  if (!CLAVE) return null
  try {
    const u = await geocodificar(d)
    return u ? { lat: u.lat, lng: u.lng } : null
  } catch (err) {
    console.warn(`[mapas] no se ubicó la dirección: ${err.message}`)
    return null
  }
}
