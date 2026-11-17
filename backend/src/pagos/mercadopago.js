// Mercado Pago Checkout API con la Orders API (REST, sin SDK). Sin redirección:
//   1. En el front, el Card Payment Brick (iframes de MP) convierte la tarjeta en
//      un token de un solo uso. Nuestra página nunca ve el número de la tarjeta.
//   2. crearPago -> el backend crea una orden (POST /v1/orders) que cobra con ese
//      token. El monto sale del pedido en la base, nunca de lo que mande el navegador.
//   3. consultarPago -> para órdenes en revisión, el webhook o "verificar" preguntan a MP.
// Se usa la Orders API y no /v1/payments: las credenciales de prueba del panel nuevo
// de MP solo cobran por aquí (/v1/payments responde 401 "Unauthorized use of live credentials").
// external_reference = "voltrix-<id del pedido>" une la orden de MP con nuestro pedido.
import { MODO_PRUEBA } from './modo.js'

const API = (process.env.MP_API || 'https://api.mercadopago.com').replace(/\/$/, '')
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN
export const PUBLIC_KEY_MP = process.env.MP_PUBLIC_KEY || null

export const mercadoPagoConfigurado = () => Boolean(ACCESS_TOKEN && PUBLIC_KEY_MP)
export const referenciaMP = (pedidoId) => `voltrix-${pedidoId}`
const pedidoDeReferencia = (ref) => Number(String(ref || '').replace('voltrix-', '')) || null
const pesos = (n) => Number(n).toFixed(2) // la Orders API recibe los montos como texto
// Tipo de tarjeta: lo manda el Brick; si no, en México el débito viene como debvisa/debmaster.
const tipoTarjeta = ({ tipo, metodoPagoId }) => tipo || (/^deb/.test(metodoPagoId) ? 'debit_card' : 'credit_card')

async function llamar(metodo, ruta, cuerpo, idempotencia) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(idempotencia && { 'X-Idempotency-Key': idempotencia }),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, datos }
}

// --- Candado del modo prueba ---
// Las órdenes de prueba tienen id "ORDTST…". Además, una cuenta marcada como
// test_user es ficticia y no mueve dinero real.
let cuentaDePrueba = null
async function esCuentaDePrueba() {
  if (cuentaDePrueba === null) {
    const { ok, datos } = await llamar('GET', '/users/me')
    if (!ok) return false // si no se puede saber, se asume real (lo más seguro)
    cuentaDePrueba = Boolean(datos.tags?.includes('test_user'))
  }
  return cuentaDePrueba
}

const esOrdenDePrueba = (orden) => String(orden.id).startsWith('ORDTST')

// Una orden real no se acepta en modo prueba: si MP alcanzó a cobrarla se
// reembolsa completa y, si estaba en revisión, se cancela.
async function bloquearOrdenReal(orden, pedidoId) {
  if (!MODO_PRUEBA || esOrdenDePrueba(orden) || (await esCuentaDePrueba())) return false
  console.error(`[mercadopago] MODO PRUEBA: el pedido ${pedidoId} generó una orden REAL (${orden.id}). Se rechaza y se reembolsa.`)
  if (orden.status === 'processed') {
    const r = await llamar('POST', `/v1/orders/${orden.id}/refund`, null, `voltrix-reembolso-${orden.id}`)
    if (!r.ok) console.error(`[mercadopago] NO se pudo reembolsar ${orden.id}: ${r.datos.message}. Reembólsala a mano en el panel de MP.`)
  } else if (['processing', 'action_required'].includes(orden.status)) {
    await llamar('POST', `/v1/orders/${orden.id}/cancel`, null, `voltrix-cancelar-${orden.id}`)
  }
  return true
}

// Traduce una orden de MP a nuestro formato. "motivo" es el status_detail del pago
// tal como lo manda MP (insufficient_amount, bad_filled_card_data…).
function normalizar(orden) {
  return {
    aprobado: orden.status === 'processed',
    pendiente: ['processing', 'action_required'].includes(orden.status),
    idTransaccion: String(orden.id),
    monto: Number(orden.total_paid_amount || orden.total_amount),
    moneda: orden.currency,
    pedidoId: pedidoDeReferencia(orden.external_reference),
    motivo: orden.transactions?.payments?.[0]?.status_detail ?? orden.status_detail,
  }
}

// Cobra el pedido con el token del Brick. Devuelve la orden normalizada.
// La llave de idempotencia lleva el token: si el cliente reintenta con el mismo
// token (doble clic, red lenta), MP no cobra dos veces.
export async function crearPago({ pedido, tarjeta }) {
  const { ok, status, datos } = await llamar(
    'POST',
    '/v1/orders',
    {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: pesos(pedido.total),
      external_reference: referenciaMP(pedido.id),
      description: `Voltrix pedido #${pedido.id}`,
      payer: {
        email: tarjeta.email,
        ...(tarjeta.identificacion && {
          identification: { type: tarjeta.identificacion.tipo, number: tarjeta.identificacion.numero },
        }),
      },
      transactions: {
        payments: [
          {
            amount: pesos(pedido.total),
            payment_method: {
              id: tarjeta.metodoPagoId,
              type: tipoTarjeta(tarjeta),
              token: tarjeta.token,
              installments: tarjeta.cuotas,
            },
          },
        ],
      },
    },
    `voltrix-pago-${pedido.id}-${tarjeta.token}`
  )
  if (!ok) {
    // 402 = MP procesó el cobro y lo rechazó (fondos, datos, banco…): la orden
    // viene en datos.data con su status_detail. Otros códigos (credenciales, token
    // inválido…) traen el mensaje de error de la API.
    const detalle = datos.errors?.[0]?.details?.join(', ') || datos.errors?.[0]?.message || datos.message || `HTTP ${status}`
    console.warn(`[mercadopago] pedido ${pedido.id}: orden no cobrada (${status}) ${detalle}`)
    return datos.data ? normalizar(datos.data) : { aprobado: false, pendiente: false, motivo: detalle }
  }
  if (await bloquearOrdenReal(datos, pedido.id)) {
    return { aprobado: false, pendiente: false, motivo: 'Pago real bloqueado: la tienda está en modo prueba.' }
  }
  return normalizar(datos)
}

export async function consultarPago(ordenId) {
  const { ok, datos } = await llamar('GET', `/v1/orders/${encodeURIComponent(ordenId)}`)
  return ok ? normalizar(datos) : null
}
