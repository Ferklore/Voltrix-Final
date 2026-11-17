// Ficha técnica de cada producto (colección "fichas"). Cada categoría tiene
// especificaciones distintas (un sensor: rango y precisión; un micro: núcleos y
// RAM), por eso va en MongoDB como lista libre de { nombre, valor }.
//   { productoId, especificaciones: [{ nombre, valor }], datasheetUrl, descripcion, actualizado }
import { coleccion } from './conexion.js'

export const MAX_ESPECIFICACIONES = 40

const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

// Limpia lo que manda el admin. Lanza un mensaje que se le puede mostrar.
export function normalizarFicha(datos) {
  const especificaciones = (datos.especificaciones ?? [])
    .map((e) => ({ nombre: texto(e.nombre, 60), valor: texto(e.valor, 200) }))
    .filter((e) => e.nombre || e.valor)
  if (especificaciones.length > MAX_ESPECIFICACIONES) {
    throw new Error(`Máximo ${MAX_ESPECIFICACIONES} especificaciones por producto.`)
  }
  if (especificaciones.some((e) => !e.nombre || !e.valor)) {
    throw new Error('Cada especificación necesita nombre y valor.')
  }
  const nombres = especificaciones.map((e) => e.nombre.toLowerCase())
  if (new Set(nombres).size !== nombres.length) throw new Error('Hay especificaciones con el mismo nombre.')

  const datasheetUrl = texto(datos.datasheetUrl, 500) || null
  if (datasheetUrl) {
    let url
    try {
      url = new URL(datasheetUrl)
    } catch {
      throw new Error('El enlace del datasheet no es una URL válida.')
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('El datasheet debe ser un enlace http(s).')
  }
  const descripcion = String(datos.descripcion ?? '').trim().slice(0, 2000) || null
  return { especificaciones, datasheetUrl, descripcion }
}

export async function obtenerFicha(productoId) {
  const col = await coleccion('fichas')
  return col ? col.findOne({ productoId: Number(productoId) }) : null
}

export async function guardarFicha(productoId, datos) {
  const col = await coleccion('fichas')
  if (!col) return null
  return col.findOneAndUpdate(
    { productoId: Number(productoId) },
    { $set: { ...datos, actualizado: new Date() } },
    { upsert: true, returnDocument: 'after' }
  )
}

export async function borrarFicha(productoId) {
  const col = await coleccion('fichas')
  await col?.deleteOne({ productoId: Number(productoId) })
}
