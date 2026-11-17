// Candado del modo prueba: una orden REAL de Mercado Pago no se acepta y se
// reembolsa. No necesita el backend ni la base: se simulan las respuestas de MP.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.MP_ACCESS_TOKEN = 'token-falso'
process.env.MP_PUBLIC_KEY = 'llave-falsa'
delete process.env.PAGOS_MODO

const pedido = { id: 7, total: 45 }
const tarjeta = { token: 'tok', metodoPagoId: 'master', cuotas: 1, email: 'a@b.com' }

// Simula a MP: la orden sale cobrada con el id y la cuenta indicados.
function simularMP({ ordenId, tags, status = 201, cuerpoOrden }) {
  const llamadas = []
  globalThis.fetch = async (url, opciones = {}) => {
    const ruta = new URL(url).pathname
    llamadas.push({ ruta: `${opciones.method || 'GET'} ${ruta}`, cuerpo: opciones.body && JSON.parse(opciones.body) })
    if (ruta === '/users/me') return Response.json({ tags })
    if (ruta.endsWith('/refund')) return Response.json({ id: ordenId, status: 'refunded' })
    return Response.json(
      cuerpoOrden ?? { id: ordenId, status: 'processed', status_detail: 'accredited', total_amount: '45.00', total_paid_amount: '45.00', currency: 'MXN', external_reference: 'voltrix-7' },
      { status }
    )
  }
  return llamadas
}

// Cada caso importa el módulo de nuevo para que no comparta la caché de la cuenta.
let n = 0
const cargar = () => import(`../src/pagos/mercadopago.js?caso=${++n}`)
const rutas = (llamadas) => llamadas.map((l) => l.ruta)

test('orden real desde una cuenta real: se rechaza y se reembolsa', async () => {
  const llamadas = simularMP({ ordenId: 'ORD01REAL', tags: ['normal'] })
  const r = await (await cargar()).crearPago({ pedido, tarjeta })
  assert.equal(r.aprobado, false)
  assert.ok(rutas(llamadas).includes('POST /v1/orders/ORD01REAL/refund'), 'debe reembolsar')
})

test('orden de prueba (ORDTST…): se acepta sin consultar la cuenta', async () => {
  const llamadas = simularMP({ ordenId: 'ORDTST01ABC', tags: ['normal'] })
  const r = await (await cargar()).crearPago({ pedido, tarjeta })
  assert.equal(r.aprobado, true)
  assert.equal(r.monto, 45)
  assert.equal(r.pedidoId, 7)
  assert.ok(!rutas(llamadas).includes('GET /users/me'))
})

test('cuenta de usuario de prueba: se acepta aunque el id no sea ORDTST', async () => {
  const llamadas = simularMP({ ordenId: 'ORD01XYZ', tags: ['test_user'] })
  const r = await (await cargar()).crearPago({ pedido, tarjeta })
  assert.equal(r.aprobado, true)
  assert.ok(!rutas(llamadas).some((x) => x.endsWith('/refund')))
})

test('el monto que se cobra sale del pedido y la tarjeta de débito se manda como debit_card', async () => {
  const llamadas = simularMP({ ordenId: 'ORDTST01DEB', tags: ['normal'] })
  await (await cargar()).crearPago({ pedido, tarjeta: { ...tarjeta, metodoPagoId: 'debvisa' } })
  const orden = llamadas.find((l) => l.ruta === 'POST /v1/orders').cuerpo
  assert.equal(orden.total_amount, '45.00')
  assert.equal(orden.transactions.payments[0].payment_method.type, 'debit_card')
})

test('tarjeta sin fondos (402): no se aprueba y trae el motivo tal como lo manda MP', async () => {
  simularMP({
    ordenId: 'x',
    tags: ['normal'],
    status: 402,
    cuerpoOrden: {
      errors: [{ code: 'failed', details: ['PAY01: insufficient_amount'] }],
      data: {
        id: 'ORDTST01FALLA', status: 'failed', status_detail: 'failed', total_amount: '45.00', currency: 'MXN',
        external_reference: 'voltrix-7', transactions: { payments: [{ status: 'failed', status_detail: 'insufficient_amount' }] },
      },
    },
  })
  const r = await (await cargar()).crearPago({ pedido, tarjeta })
  assert.equal(r.aprobado, false)
  assert.equal(r.pendiente, false)
  assert.equal(r.motivo, 'insufficient_amount')
  assert.equal(r.idTransaccion, 'ORDTST01FALLA')
})
