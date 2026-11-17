// Plantillas de correo y envío en modo desarrollo (sin RESEND_API_KEY).
//   node --test test/correo.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pagoConfirmado, pedidoCreado, recuperarPassword, stockBajo } from '../src/correo/plantillas.js'

const usuario = { nombre: 'Ana <script>', email: 'ana@voltrix.test' }
const detalles = [{ cantidad: 2, nombre: 'Sensor "DHT11" & cables', subtotal: 90 }]
const pedido = { id: 12, total: 90 }
const direccion = { calle: 'Av. Juárez 100', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' }
const url = 'http://localhost:4321'

test('pedido creado: detalles, total, dirección y HTML escapado', () => {
  const c = pedidoCreado({ pedido, usuario, detalles, direccion, url })
  assert.equal(c.asunto, 'Recibimos tu pedido #12')
  assert.match(c.html, /Ana &lt;script&gt;/)
  assert.doesNotMatch(c.html, /<script>/)
  assert.match(c.html, /Sensor &quot;DHT11&quot; &amp; cables/)
  assert.match(c.html, /\$90\.00 MXN/)
  assert.match(c.texto, /Av\. Juárez 100, col\. Centro, Guadalajara, Jalisco, CP 44100/)
  assert.match(c.html, /href="http:\/\/localhost:4321\/cuenta"/)
})

test('pago confirmado menciona el método y la prefactura adjunta', () => {
  const c = pagoConfirmado({ pedido, usuario, detalles, direccion: null, proveedor: 'MERCADOPAGO', url, conPrefactura: true })
  assert.match(c.asunto, /Pago confirmado · pedido #12/)
  assert.match(c.texto, /Mercado Pago/)
  assert.match(c.texto, /prefactura/)
  assert.doesNotMatch(c.texto, /Envío a/)
})

test('recuperar contraseña lleva el enlace y la vigencia', () => {
  const enlace = `${url}/restablecer?token=abc_123`
  const c = recuperarPassword({ usuario, enlace, minutos: 30 })
  assert.ok(c.html.includes(`href="${enlace}"`))
  assert.match(c.texto, /30 minutos/)
})

test('stock bajo: uno o varios productos, agotado resaltado', () => {
  assert.equal(stockBajo({ productos: [{ nombre: 'ESP32', stock: 3 }], minimo: 5, url }).asunto, 'Stock bajo: ESP32')
  const c = stockBajo({ productos: [{ nombre: 'ESP32', stock: 0 }, { nombre: 'OLED', stock: 4 }], minimo: 5, url })
  assert.equal(c.asunto, 'Stock bajo en 2 productos')
  assert.match(c.texto, /ESP32: agotado/)
  assert.match(c.texto, /OLED: 4 pzas/)
})

test('sin RESEND_API_KEY el correo se muestra en consola y no truena', async () => {
  delete process.env.RESEND_API_KEY
  const { enviarCorreo } = await import('../src/correo/enviar.js')
  const original = console.log
  let salida = ''
  console.log = (m) => { salida += m }
  try {
    const r = await enviarCorreo({ para: 'ana@voltrix.test', asunto: 'Hola', html: '<p>x</p>', texto: 'cuerpo', adjuntos: [{ nombre: 'a.pdf', contenido: 'x' }] })
    assert.deepEqual(r, { enviado: false, motivo: 'modo desarrollo' })
  } finally {
    console.log = original
  }
  assert.match(salida, /Para: ana@voltrix\.test/)
  assert.match(salida, /Adjuntos: a\.pdf/)
  assert.deepEqual(await enviarCorreo({ para: null, asunto: 'x', texto: 'x' }), { enviado: false, motivo: 'sin destinatario' })
})
