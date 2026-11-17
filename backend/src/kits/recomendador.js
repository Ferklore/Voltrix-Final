// Recomendador de kits (propuesta: "asistente de recomendación técnica").
// Lo usan la página "Arma tu kit" (GraphQL) y el servidor MCP.
//
// 1. Elige la plantilla según las palabras de la descripción del proyecto.
// 2. Para cada pieza busca en el catálogo productos con stock suficiente,
//    prefiriendo los más vendidos y luego los más baratos.
// 3. Si hay presupuesto y no alcanza: primero quita lo opcional y luego cambia
//    piezas por alternativas más baratas, empezando por la que más ahorra.
//
// ponytail: no revisa compatibilidad eléctrica ni de sockets; eso lo dice la
// nota del kit. Un asistente (vía MCP) puede razonarlo con las fichas técnicas.
import { pool } from '../db.js'
import { PLANTILLAS } from './plantillas.js'

const VENDIDO = `status IN ('PAGADO', 'ENVIADO', 'ENTREGADO')`
const ALTERNATIVAS = 3

// "Estación Meteorológica" -> "estacion meteorologica"
export const normalizar = (t) =>
  String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Puntaje de cada plantilla para un texto: palabras que empiezan igual
// (prefijo de palabra, así "pc" no coincide dentro de "capacitor").
// Las frases de varias palabras valen doble.
export function elegirPlantilla(proyecto, plantillas = PLANTILLAS) {
  const texto = normalizar(proyecto)
  let mejor = null
  for (const p of plantillas) {
    const puntaje = p.palabras.reduce(
      (s, palabra) => s + (new RegExp(`\\b${escaparRegex(palabra)}`).test(texto) ? (palabra.includes(' ') ? 2 : 1) : 0),
      0
    )
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) mejor = { plantilla: p, puntaje }
  }
  return mejor?.plantilla ?? null
}

async function candidatos({ buscar, cantidad }) {
  const patrones = buscar.map((t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS categoria_nombre, coalesce(v.vendidos, 0)::int AS vendidos
       FROM producto p
       LEFT JOIN categoria c ON c.id = p.categoria_id
       LEFT JOIN (SELECT d.producto_id, sum(d.cantidad) AS vendidos
                    FROM detalle_pedido d JOIN pedido pe ON pe.id = d.pedido_id AND pe.${VENDIDO}
                   GROUP BY d.producto_id) v ON v.producto_id = p.id
      WHERE p.stock >= $2
        AND (p.nombre ILIKE ANY($1) OR p.especificaciones ILIKE ANY($1) OR c.nombre ILIKE ANY($1))
      ORDER BY vendidos DESC, p.precio, p.id
      LIMIT 8`,
    [patrones, cantidad]
  )
  return rows
}

// Elige qué opción va en cada pieza para respetar el presupuesto. Función pura
// (se prueba sola). piezas: [{ componente, opciones: [producto...] }] con la
// opción preferida primero. Devuelve el índice elegido de cada pieza (-1 = fuera).
export function ajustarPresupuesto(piezas, presupuesto) {
  const elegido = piezas.map((p) => (p.opciones.length ? 0 : -1))
  const costo = (i, j) => piezas[i].opciones[j].precio * piezas[i].componente.cantidad
  const total = () => elegido.reduce((s, j, i) => s + (j >= 0 ? costo(i, j) : 0), 0)
  if (!presupuesto || total() <= presupuesto) return elegido

  // 1) Fuera lo opcional, de lo más caro a lo más barato.
  const opcionales = piezas
    .map((p, i) => i)
    .filter((i) => piezas[i].componente.opcional && elegido[i] >= 0)
    .sort((a, b) => costo(b, elegido[b]) - costo(a, elegido[a]))
  for (const i of opcionales) {
    if (total() <= presupuesto) break
    elegido[i] = -1
  }

  // 2) Cambiar por la opción más barata de la pieza que más ahorra.
  while (total() > presupuesto) {
    let mejor = null
    piezas.forEach((p, i) => {
      if (elegido[i] < 0) return
      p.opciones.forEach((_, j) => {
        const ahorro = costo(i, elegido[i]) - costo(i, j)
        if (ahorro > 0 && (!mejor || ahorro > mejor.ahorro)) mejor = { i, j, ahorro }
      })
    })
    if (!mejor) break
    elegido[mejor.i] = mejor.j
  }
  return elegido
}

export const listarKits = () =>
  PLANTILLAS.map(({ id, nombre, descripcion, componentes }) => ({
    id,
    nombre,
    descripcion,
    piezas: componentes.map((c) => c.rol),
  }))

// { proyecto?, kitId?, presupuesto? } -> recomendación lista para mostrar.
export async function recomendarKit({ proyecto, kitId, presupuesto }) {
  const plantilla = kitId ? PLANTILLAS.find((p) => p.id === kitId) : elegirPlantilla(proyecto)
  if (!plantilla) {
    return {
      kit: null,
      mensaje: 'No reconocí el tipo de proyecto. Elige uno de los kits disponibles o descríbelo con otras palabras.',
      items: [],
      faltantes: [],
      total: 0,
      presupuesto: presupuesto ?? null,
      dentroDePresupuesto: true,
    }
  }

  const piezas = await Promise.all(
    plantilla.componentes.map(async (componente) => ({ componente, opciones: await candidatos(componente) }))
  )
  const elegido = ajustarPresupuesto(piezas, presupuesto)

  const items = []
  const faltantes = []
  piezas.forEach(({ componente, opciones }, i) => {
    if (!opciones.length) {
      if (!componente.opcional) faltantes.push(componente.rol)
      return
    }
    if (elegido[i] < 0) return // opcional que no cupo
    const producto = opciones[elegido[i]]
    items.push({
      rol: componente.rol,
      cantidad: componente.cantidad,
      opcional: Boolean(componente.opcional),
      producto,
      subtotal: Math.round(producto.precio * componente.cantidad * 100) / 100,
      alternativas: opciones.filter((_, j) => j !== elegido[i]).slice(0, ALTERNATIVAS),
    })
  })
  const total = Math.round(items.reduce((s, it) => s + it.subtotal, 0) * 100) / 100
  const dentroDePresupuesto = !presupuesto || total <= presupuesto

  let mensaje = null
  if (faltantes.length) mensaje = `No tenemos en existencia: ${faltantes.join(', ')}.`
  if (!dentroDePresupuesto) {
    mensaje = [mensaje, `Lo más barato que podemos armar cuesta $${total.toFixed(2)}, arriba de tu presupuesto.`].filter(Boolean).join(' ')
  }

  return {
    kit: { id: plantilla.id, nombre: plantilla.nombre, descripcion: plantilla.descripcion, notas: plantilla.notas ?? null },
    mensaje,
    items,
    faltantes,
    total,
    presupuesto: presupuesto ?? null,
    dentroDePresupuesto,
  }
}
