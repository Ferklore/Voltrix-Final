// Reseñas y calificaciones (colección "resenas"). Una por cliente y producto:
// si vuelve a opinar, se actualiza la suya.
//   { productoId, usuarioId, autor, calificacion (1-5), comentario, compraVerificada, fecha, editada }
// "Compra verificada" = el cliente tiene un pedido pagado con ese producto
// (se consulta en PostgreSQL, que es donde viven los pedidos).
import { ObjectId } from 'mongodb'
import { pool } from '../db.js'
import { coleccion } from './conexion.js'

// "Fernando Rodríguez Sánchez" -> "Fernando R.": no se publica el nombre completo.
export function nombrePublico(nombre) {
  const [primero, segundo] = String(nombre ?? '').trim().split(/\s+/)
  if (!primero) return 'Cliente'
  return segundo ? `${primero} ${segundo[0].toUpperCase()}.` : primero
}

export function normalizarResena({ calificacion, comentario }) {
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    throw new Error('La calificación va de 1 a 5 estrellas.')
  }
  const texto = String(comentario ?? '').trim()
  if (texto.length > 1000) throw new Error('El comentario es muy largo (máx. 1000 caracteres).')
  return { calificacion, comentario: texto || null }
}

async function compro(usuarioId, productoId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM detalle_pedido d JOIN pedido p ON p.id = d.pedido_id
      WHERE p.usuario_id = $1 AND d.producto_id = $2 AND p.status IN ('PAGADO', 'ENVIADO', 'ENTREGADO') LIMIT 1`,
    [usuarioId, productoId]
  )
  return rowCount > 0
}

export async function listarResenas(productoId, limite = 20) {
  const col = await coleccion('resenas')
  if (!col) return []
  return col.find({ productoId: Number(productoId) }).sort({ fecha: -1 }).limit(Math.min(limite, 50)).toArray()
}

// { promedio, total, porEstrellas: [5★, 4★, 3★, 2★, 1★] }
export async function resumenResenas(productoId) {
  const col = await coleccion('resenas')
  const vacio = { promedio: 0, total: 0, porEstrellas: [0, 0, 0, 0, 0] }
  if (!col) return vacio
  const grupos = await col
    .aggregate([{ $match: { productoId: Number(productoId) } }, { $group: { _id: '$calificacion', n: { $sum: 1 } } }])
    .toArray()
  if (!grupos.length) return vacio
  const porEstrellas = [5, 4, 3, 2, 1].map((e) => grupos.find((g) => g._id === e)?.n ?? 0)
  const total = porEstrellas.reduce((s, n) => s + n, 0)
  const suma = grupos.reduce((s, g) => s + g._id * g.n, 0)
  return { promedio: Math.round((suma / total) * 10) / 10, total, porEstrellas }
}

// Crea o actualiza la reseña del usuario para ese producto. null si no hay Mongo.
export async function guardarResena(usuario, productoId, datos) {
  const col = await coleccion('resenas')
  if (!col) return null
  const id = Number(productoId)
  const ahora = new Date()
  return col.findOneAndUpdate(
    { productoId: id, usuarioId: usuario.id },
    {
      $set: { ...datos, autor: nombrePublico(usuario.nombre), compraVerificada: await compro(usuario.id, id), editada: ahora },
      $setOnInsert: { fecha: ahora },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

// El autor borra la suya; un ADMIN puede borrar cualquiera (moderación).
export async function eliminarResena(usuario, id) {
  const col = await coleccion('resenas')
  if (!col || !ObjectId.isValid(id)) return false
  const filtro = { _id: new ObjectId(id), ...(usuario.rol === 'ADMIN' ? {} : { usuarioId: usuario.id }) }
  const { deletedCount } = await col.deleteOne(filtro)
  return deletedCount > 0
}

export async function borrarResenasDeProducto(productoId) {
  const col = await coleccion('resenas')
  await col?.deleteMany({ productoId: Number(productoId) })
}
