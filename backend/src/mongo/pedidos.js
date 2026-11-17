// Documento de cada pedido (colección "pedidos"): una foto de cómo era al
// crearse (nombres y precios de ese momento, dirección de envío) y el
// historial de estados. Aunque luego cambie el precio o el nombre de un
// producto en PostgreSQL, aquí queda lo que se vendió.
//   { pedidoId, creado, usuario: { id, nombre, email }, direccion, items: [...], total, status, historial: [{ status, fecha }] }
import { pool } from '../db.js'
import { direccionDeFila } from '../direccion.js'
import { coleccion } from './conexion.js'

export async function guardarDocumentoPedido(pedidoId) {
  const col = await coleccion('pedidos')
  if (!col) return
  const { rows: [pedido] } = await pool.query('SELECT * FROM pedido WHERE id = $1', [pedidoId])
  if (!pedido) return
  const [{ rows: [u] }, { rows: items }] = await Promise.all([
    pool.query('SELECT id, nombre, email, calle, colonia, ciudad, estado, codigo_postal FROM usuario WHERE id = $1', [pedido.usuario_id]),
    pool.query(
      `SELECT d.producto_id AS "productoId", p.nombre, d.cantidad, d.subtotal,
              round(d.subtotal / d.cantidad, 2)::float AS "precioUnitario"
         FROM detalle_pedido d JOIN producto p ON p.id = d.producto_id WHERE d.pedido_id = $1 ORDER BY d.id`,
      [pedido.id]
    ),
  ])
  const ahora = new Date()
  await col.updateOne(
    { pedidoId: pedido.id },
    {
      $setOnInsert: {
        pedidoId: pedido.id,
        creado: ahora,
        usuario: { id: u.id, nombre: u.nombre, email: u.email },
        direccion: direccionDeFila(u),
        items,
        total: pedido.total,
        status: pedido.status,
        historial: [{ status: pedido.status, fecha: ahora }],
      },
    },
    { upsert: true }
  )
}

// Agrega el estado al historial solo si cambió (llegan avisos repetidos).
export async function registrarEstadoPedido(pedidoId, status) {
  const col = await coleccion('pedidos')
  if (!col) return
  const { matchedCount } = await col.updateOne(
    { pedidoId: Number(pedidoId), status: { $ne: status } },
    { $set: { status }, $push: { historial: { status, fecha: new Date() } } }
  )
  // Pedidos de antes de usar Mongo: se crea su documento con el estado actual.
  if (!matchedCount && !(await col.countDocuments({ pedidoId: Number(pedidoId) }, { limit: 1 }))) {
    await guardarDocumentoPedido(pedidoId)
  }
}

export async function historialPedido(pedidoId) {
  const col = await coleccion('pedidos')
  if (!col) return []
  const doc = await col.findOne({ pedidoId: Number(pedidoId) }, { projection: { historial: 1 } })
  return doc?.historial ?? []
}
