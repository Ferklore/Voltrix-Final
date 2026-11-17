// Servicio de pagos: une nuestros pedidos con PayPal y Mercado Pago, sin sacar
// al cliente de la tienda (botones de PayPal en ventana emergente y Card Payment
// Brick de Mercado Pago dentro de la página).
// Regla de oro: el pedido pasa a PAGADO solo cuando el backend le preguntó al
// proveedor y este confirmó el cobro, por el monto y la moneda correctos.
// Nada de lo que mande el navegador (montos, estados) cuenta como prueba.
import { GraphQLError } from 'graphql'
import { pool } from '../db.js'
import { publicarPedido } from '../eventos.js'
import { avisarPagoConfirmado } from '../correo/avisos.js'
import { registrar } from '../mongo/bitacora.js'
import * as paypal from './paypal.js'
import * as mp from './mercadopago.js'

const errorDeNegocio = (mensaje, code) => new GraphQLError(mensaje, { extensions: { code } })

// Lo que el front necesita para dibujar los métodos de pago. Client id de PayPal
// y public key de MP son públicos por diseño; los secretos nunca salen de aquí.
export const proveedoresDisponibles = () => ({
  paypal: paypal.paypalConfigurado(),
  paypalClientId: paypal.CLIENT_ID_PAYPAL,
  paypalMoneda: paypal.MONEDA_PAYPAL,
  mercadoPago: mp.mercadoPagoConfigurado(),
  mercadoPagoPublicKey: mp.PUBLIC_KEY_MP,
})

async function pedidoDe(usuario, pedidoId) {
  const { rows } = await pool.query('SELECT * FROM pedido WHERE id = $1', [pedidoId])
  const pedido = rows[0]
  // Si no es tuyo, para ti no existe (igual que la consulta pedido).
  if (!pedido || (usuario && pedido.usuario_id !== usuario.id && usuario.rol !== 'ADMIN')) {
    throw errorDeNegocio('No encontramos ese pedido.', 'PEDIDO_NO_EXISTE')
  }
  return pedido
}

async function pedidoPendiente(usuario, pedidoId) {
  const pedido = await pedidoDe(usuario, pedidoId)
  if (pedido.status !== 'PENDIENTE') throw errorDeNegocio('Este pedido ya no está pendiente de pago.', 'PEDIDO_NO_PENDIENTE')
  return pedido
}

// --- PayPal 1: crea la orden; el id va a los botones del JS SDK ---
export async function crearOrdenPaypal(usuario, pedidoId) {
  if (!paypal.paypalConfigurado()) throw errorDeNegocio('PayPal no está configurado.', 'PROVEEDOR_NO_DISPONIBLE')
  const pedido = await pedidoPendiente(usuario, pedidoId)
  const ordenId = await paypal.crearOrden({ pedido })
  await pool.query(
    `INSERT INTO pago (pedido_id, proveedor, referencia, monto) VALUES ($1, 'PAYPAL', $2, $3)`,
    [pedido.id, ordenId, pedido.total]
  )
  return ordenId
}

// --- Mercado Pago: cobra con el token del Card Payment Brick ---
export async function pagarConTarjeta(usuario, pedidoId, tarjeta) {
  if (!mp.mercadoPagoConfigurado()) throw errorDeNegocio('Mercado Pago no está configurado.', 'PROVEEDOR_NO_DISPONIBLE')
  if (!tarjeta.token || !Number.isInteger(tarjeta.cuotas) || tarjeta.cuotas < 1) {
    throw errorDeNegocio('Los datos de la tarjeta están incompletos.', 'TARJETA_INVALIDA')
  }
  const pedido = await pedidoPendiente(usuario, pedidoId)
  await pool.query(
    `INSERT INTO pago (pedido_id, proveedor, monto) VALUES ($1, 'MERCADOPAGO', $2)`,
    [pedido.id, pedido.total]
  )
  const r = await mp.crearPago({ pedido, tarjeta })
  return resolver(pedido, 'MERCADOPAGO', null, r)
}

// --- Confirmar: PayPal captura la orden aprobada; MP consulta una orden en revisión ---
// usuario = null cuando lo llama el webhook (no hay sesión, pero sí verificación con MP).
export async function confirmarPago(usuario, pedidoId, proveedor, referencia) {
  const pedido = await pedidoDe(usuario, pedidoId)
  if (pedido.status !== 'PENDIENTE') {
    return { estado: pedido.status === 'CANCELADO' ? 'RECHAZADO' : 'APROBADO', mensaje: null, pedido }
  }

  let r
  if (proveedor === 'PAYPAL') {
    // Solo se captura una orden que nosotros creamos para ESTE pedido.
    const { rowCount } = await pool.query(
      `SELECT 1 FROM pago WHERE pedido_id = $1 AND proveedor = 'PAYPAL' AND referencia = $2`,
      [pedido.id, String(referencia || '')]
    )
    if (!rowCount) throw errorDeNegocio('Ese pago de PayPal no corresponde a tu pedido.', 'PAGO_NO_COINCIDE')
    r = await paypal.capturar(referencia)
  } else {
    const ultima = referencia || (await ultimaTransaccionMP(pedido.id))
    r = ultima && (await mp.consultarPago(ultima))
    if (!r) return { estado: 'PENDIENTE', mensaje: 'Mercado Pago todavía no registra un pago para este pedido.', pedido }
  }
  return resolver(pedido, proveedor, proveedor === 'PAYPAL' ? referencia : null, r)
}

async function ultimaTransaccionMP(pedidoId) {
  const { rows } = await pool.query(
    `SELECT id_transaccion FROM pago
      WHERE pedido_id = $1 AND proveedor = 'MERCADOPAGO' AND id_transaccion IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [pedidoId]
  )
  return rows[0]?.id_transaccion ?? null
}

// Renglón de pago al que pertenece una transacción: el que ya la tiene o, si
// ninguno, el intento más reciente que todavía no tiene transacción. Así un aviso
// tardío de un intento viejo no pisa el registro de un intento nuevo.
const RENGLON_PAGO = `
  SELECT id FROM pago
   WHERE pedido_id = $1 AND proveedor = $2
     AND (id_transaccion IS NULL OR id_transaccion = $3)
     AND ($4::text IS NULL OR referencia = $4)
   ORDER BY id_transaccion IS NOT DISTINCT FROM $3 DESC, id DESC
   LIMIT 1`

// Decide qué pasó con el pago y lo registra. r viene ya normalizado del proveedor.
async function resolver(pedido, proveedor, referencia, r) {
  const moneda = proveedor === 'PAYPAL' ? paypal.MONEDA_PAYPAL : 'MXN'
  const coincide = r.pedidoId === pedido.id && r.moneda === moneda && Math.abs(r.monto - pedido.total) < 0.01

  if (r.aprobado && coincide) {
    await registrarAprobado(pedido.id, proveedor, referencia, r.idTransaccion, r.monto)
    return { estado: 'APROBADO', mensaje: null, pedido: await pedidoDe(null, pedido.id) }
  }
  if (r.aprobado) {
    // Cobró, pero no lo que esperábamos: no se marca pagado; lo revisa un admin.
    console.warn(`[pagos] pedido ${pedido.id}: ${proveedor} aprobó ${r.monto} ${r.moneda}, se esperaba ${pedido.total} ${moneda}`)
    await actualizarEstadoPago(pedido.id, proveedor, referencia, 'RECHAZADO', r.idTransaccion)
    return { estado: 'RECHAZADO', mensaje: 'El monto cobrado no coincide con tu pedido. Escríbenos para revisarlo.', pedido }
  }
  if (r.pendiente) {
    await actualizarEstadoPago(pedido.id, proveedor, referencia, 'PENDIENTE', r.idTransaccion)
    return { estado: 'PENDIENTE', mensaje: r.motivo || 'Pago en revisión.', pedido }
  }
  await actualizarEstadoPago(pedido.id, proveedor, referencia, 'RECHAZADO', r.idTransaccion)
  registrar('PAGO_RECHAZADO', `Pedido #${pedido.id}: ${proveedor} rechazó el pago (${r.motivo || 'sin motivo'})`, {
    usuarioId: pedido.usuario_id,
    datos: { pedidoId: pedido.id, proveedor, motivo: r.motivo || null },
  })
  // El motivo se muestra tal como lo manda el proveedor (p. ej. "insufficient_amount").
  return { estado: 'RECHAZADO', mensaje: r.motivo || 'El pago no se completó.', pedido }
}

async function actualizarEstadoPago(pedidoId, proveedor, referencia, estado, idTransaccion) {
  await pool.query(
    `UPDATE pago SET estado = $5, id_transaccion = COALESCE($3, id_transaccion), actualizado = now()
      WHERE id = (${RENGLON_PAGO}) AND estado <> 'APROBADO'`,
    [pedidoId, proveedor, idTransaccion || null, referencia, estado]
  )
}

// Transacción: el pedido se bloquea (FOR UPDATE) para que la respuesta al
// cliente y el webhook, si llegan juntos, no registren el pago dos veces.
async function registrarAprobado(pedidoId, proveedor, referencia, idTransaccion, monto) {
  const conn = await pool.connect()
  let pagado = null
  try {
    await conn.query('BEGIN')
    const { rows } = await conn.query('SELECT status FROM pedido WHERE id = $1 FOR UPDATE', [pedidoId])
    const ya = await conn.query(
      `SELECT 1 FROM pago WHERE proveedor = $1 AND id_transaccion = $2 AND estado = 'APROBADO'`,
      [proveedor, idTransaccion]
    )
    if (!ya.rowCount) {
      const { rowCount } = await conn.query(
        `UPDATE pago SET estado = 'APROBADO', id_transaccion = $3, monto = $5, actualizado = now()
          WHERE id = (${RENGLON_PAGO})`,
        [pedidoId, proveedor, idTransaccion, referencia, monto]
      )
      if (!rowCount) {
        await conn.query(
          `INSERT INTO pago (pedido_id, proveedor, referencia, id_transaccion, estado, monto)
           VALUES ($1, $2, $3, $4, 'APROBADO', $5)`,
          [pedidoId, proveedor, referencia, idTransaccion, monto]
        )
      }
    }
    if (rows[0].status === 'PENDIENTE') {
      pagado = (await conn.query(`UPDATE pedido SET status = 'PAGADO' WHERE id = $1 RETURNING *`, [pedidoId])).rows[0]
    } else if (rows[0].status === 'CANCELADO') {
      // ponytail: llegó un pago de un pedido ya cancelado (stock devuelto). Se
      // registra el pago y un admin decide si reembolsa desde el panel del proveedor.
      console.warn(`[pagos] pedido ${pedidoId} estaba CANCELADO y llegó un pago aprobado (${proveedor} ${idTransaccion})`)
    }
    await conn.query('COMMIT')
    publicarPedido('ACTUALIZADO', pagado)
    // RF5.1: tras cobrar se genera la prefactura y se manda por correo con el
    // aviso de pago (si falla, la prefactura se genera cuando alguien la pida).
    if (pagado) {
      avisarPagoConfirmado(pedidoId, proveedor)
      registrar('PAGO_APROBADO', `Pedido #${pedidoId} pagado con ${proveedor} ($${monto})`, {
        usuarioId: pagado.usuario_id,
        datos: { pedidoId, proveedor, idTransaccion, monto },
      })
    }
  } catch (err) {
    await conn.query('ROLLBACK')
    throw err
  } finally {
    conn.release()
  }
}

// --- Webhook de Mercado Pago: MP avisa "cambió una orden"; nosotros la consultamos ---
export async function notificacionMercadoPago(ordenId) {
  if (!mp.mercadoPagoConfigurado() || !ordenId) return
  const r = await mp.consultarPago(ordenId)
  if (!r?.pedidoId) return
  await confirmarPago(null, r.pedidoId, 'MERCADOPAGO', ordenId)
}
