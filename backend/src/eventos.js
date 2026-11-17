// Eventos en tiempo real para el panel admin (GraphQL Subscriptions).
// Las mutaciones publican aquí y graphql-ws los empuja por WebSocket a cada
// admin suscrito.
import { PubSub } from 'graphql-subscriptions'
import { pool } from './db.js'
import { registrar } from './mongo/bitacora.js'
import { guardarDocumentoPedido, registrarEstadoPedido } from './mongo/pedidos.js'

// ponytail: PubSub en memoria, sirve con UNA instancia del backend. Con varias
// réplicas, cambiar por graphql-redis-subscriptions o LISTEN/NOTIFY de Postgres.
export const pubsub = new PubSub()

export const PEDIDO_CAMBIO = 'PEDIDO_CAMBIO'
export const PRODUCTO_CAMBIO = 'PRODUCTO_CAMBIO'

// tipo: NUEVO | ACTUALIZADO | ELIMINADO. Se llama después del COMMIT, para no
// avisar de algo que luego se deshace con ROLLBACK.
export function publicarPedido(tipo, pedido) {
  if (!pedido) return
  pubsub.publish(PEDIDO_CAMBIO, { tipo, pedido })
  // MongoDB: documento del pedido + historial de estados, y bitácora.
  const enMongo = tipo === 'NUEVO' ? guardarDocumentoPedido(pedido.id) : registrarEstadoPedido(pedido.id, pedido.status)
  enMongo.catch((err) => console.warn(`[mongo] pedido ${pedido.id}: ${err.message}`))
  if (tipo === 'NUEVO') {
    registrar('PEDIDO_CREADO', `Pedido #${pedido.id} por $${pedido.total}`, { usuarioId: pedido.usuario_id, datos: { pedidoId: pedido.id } })
  } else {
    registrar('PEDIDO_ESTADO', `Pedido #${pedido.id} pasó a ${pedido.status}`, { datos: { pedidoId: pedido.id, status: pedido.status } })
  }
}

export const publicarProducto = (tipo, producto) =>
  producto && pubsub.publish(PRODUCTO_CAMBIO, { tipo, producto })

// Tras mover stock (pedido creado o cancelado) avisa de cada producto tocado.
export async function publicarStock(productoIds) {
  if (!productoIds.length) return
  // Un aviso que falla no debe tumbar la mutación que ya se guardó.
  try {
    const { rows } = await pool.query('SELECT * FROM producto WHERE id = ANY($1::int[])', [productoIds])
    rows.forEach((p) => publicarProducto('ACTUALIZADO', p))
  } catch (err) {
    console.error('[eventos] no se pudo avisar del stock:', err.message)
  }
}
