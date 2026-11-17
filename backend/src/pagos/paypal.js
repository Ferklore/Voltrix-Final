// PayPal Orders API v2 (REST, sin SDK en el servidor). Sin redirección:
//   1. crearOrden -> devolvemos el id de la orden a los botones del JS SDK.
//   2. El cliente aprueba en la ventana emergente de PayPal, sin salir de la tienda.
//   3. capturar   -> aquí se cobra de verdad. Sin captura no hay dinero.
import { MODO_PRUEBA } from './modo.js'

const API = (process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '')
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const SECRET = process.env.PAYPAL_CLIENT_SECRET
export const MONEDA_PAYPAL = process.env.PAYPAL_MONEDA || 'MXN'
// El client id es público: el front lo necesita para cargar los botones.
export const CLIENT_ID_PAYPAL = CLIENT_ID || null

// En modo prueba solo se habla con el sandbox: las credenciales de sandbox solo
// aceptan compradores de prueba, así que no hay forma de cobrar dinero real.
export const PAYPAL_EN_SANDBOX = new URL(API).hostname === 'api-m.sandbox.paypal.com'
const permitido = PAYPAL_EN_SANDBOX || !MODO_PRUEBA

export const paypalConfigurado = () => Boolean(CLIENT_ID && SECRET && permitido)

// Token de la app (client_credentials). Dura ~9 horas; se guarda en memoria
// y se pide otro un minuto antes de que venza.
let tokenApp = null
async function token() {
  if (tokenApp && tokenApp.expira > Date.now()) return tokenApp.valor
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const datos = await res.json()
  if (!res.ok) throw new Error(`PayPal no dio token: ${datos.error_description || res.status}`)
  tokenApp = { valor: datos.access_token, expira: Date.now() + (datos.expires_in - 60) * 1000 }
  return tokenApp.valor
}

async function llamar(metodo, ruta, cuerpo, idempotencia) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      // Si la misma petición se repite (doble clic, reintento), PayPal no la duplica.
      ...(idempotencia && { 'PayPal-Request-Id': idempotencia }),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, datos }
}

// Crea la orden y devuelve su id (lo usan los botones de PayPal).
export async function crearOrden({ pedido }) {
  const { ok, datos } = await llamar(
    'POST',
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(pedido.id),
          custom_id: `voltrix-${pedido.id}`,
          description: `Voltrix pedido #${pedido.id}`,
          amount: { currency_code: MONEDA_PAYPAL, value: pedido.total.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Voltrix',
            locale: 'es-MX',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
          },
        },
      },
    },
    `voltrix-orden-${pedido.id}-${Date.now()}`
  )
  if (!ok) throw new Error(`PayPal rechazó la orden: ${datos.message || datos.name}`)
  return datos.id
}

// Captura la orden. Devuelve { aprobado, pendiente, idTransaccion, monto, moneda, pedidoId, motivo }.
// motivo = por qué no se completó, tal como lo manda PayPal.
// Si ya estaba capturada (doble clic o reintento) se consulta y listo.
export async function capturar(ordenId) {
  let { ok, status, datos } = await llamar('POST', `/v2/checkout/orders/${encodeURIComponent(ordenId)}/capture`, {}, `voltrix-captura-${ordenId}`)
  if (!ok && status === 422 && datos.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
    ;({ ok, datos } = await llamar('GET', `/v2/checkout/orders/${encodeURIComponent(ordenId)}`))
  }
  if (!ok) {
    const motivo = datos.details?.[0]?.description || datos.message || datos.details?.[0]?.issue || `HTTP ${status}`
    console.warn(`[paypal] orden ${ordenId}: no se capturó (${status}) ${datos.details?.[0]?.issue}: ${motivo}`)
    return { aprobado: false, pendiente: false, motivo }
  }

  const unidad = datos.purchase_units?.[0]
  const captura = unidad?.payments?.captures?.[0]
  return {
    aprobado: datos.status === 'COMPLETED' && captura?.status === 'COMPLETED',
    // PENDING: PayPal retuvo el dinero (p. ej. la cuenta no acepta esa moneda). Sigue pendiente.
    pendiente: captura?.status === 'PENDING',
    idTransaccion: captura?.id,
    // Captura PENDING o DECLINED: el motivo viene en status_details.reason.
    motivo: captura?.status_details?.reason ?? (captura?.status === 'DECLINED' ? 'DECLINED' : null),
    monto: Number(captura?.amount?.value),
    moneda: captura?.amount?.currency_code,
    // El custom_id viaja en la captura; reference_id en la unidad de compra.
    pedidoId:
      Number(String(captura?.custom_id || unidad?.custom_id || '').replace('voltrix-', '')) ||
      Number(unidad?.reference_id),
  }
}
