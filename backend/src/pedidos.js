// Cancelar un pedido devuelve su stock. Se usa desde la cuenta del cliente
// (solo pendientes) y desde el panel de admin (cambiarStatusPedido a CANCELADO).
import { pool } from './db.js'
import { publicarPedido, publicarStock } from './eventos.js'
import { MODO_PRUEBA } from './pagos/modo.js'

// Flujo que puede seguir el ADMIN: Pagado -> Enviado -> Entregado, y cancelar
// mientras no se haya enviado (cancelar devuelve el stock). Entregado y
// Cancelado son finales. Pendiente -> Pagado lo hace el proveedor de pagos al
// confirmar el cobro; a mano solo se permite en modo de prueba.
const TRANSICIONES = {
  PENDIENTE: ['CANCELADO'],
  PAGADO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
}

export function estadosSiguientes(status, modoPrueba = MODO_PRUEBA) {
  const siguientes = TRANSICIONES[status] ?? []
  return status === 'PENDIENTE' && modoPrueba ? ['PAGADO', ...siguientes] : siguientes
}

// Devuelve el pedido cancelado, o null si ya estaba cancelado / no existe.
export async function cancelarPedido(pedidoId) {
  const conn = await pool.connect()
  try {
    await conn.query('BEGIN')
    const { rows } = await conn.query(
      `UPDATE pedido SET status = 'CANCELADO' WHERE id = $1 AND status <> 'CANCELADO' RETURNING *`,
      [pedidoId]
    )
    if (!rows[0]) {
      await conn.query('ROLLBACK')
      return null
    }
    // Mismo orden de ids que crearPedido, para no trabarse con un pedido en curso.
    const devueltos = await conn.query(
      `UPDATE producto p SET stock = p.stock + d.cantidad
         FROM (SELECT producto_id, sum(cantidad)::int AS cantidad
                 FROM detalle_pedido WHERE pedido_id = $1 GROUP BY producto_id ORDER BY producto_id) d
        WHERE p.id = d.producto_id
        RETURNING p.id`,
      [pedidoId]
    )
    await conn.query('COMMIT')
    publicarPedido('ACTUALIZADO', rows[0])
    publicarStock(devueltos.rows.map((p) => p.id))
    return rows[0]
  } catch (err) {
    await conn.query('ROLLBACK')
    throw err
  } finally {
    conn.release()
  }
}
