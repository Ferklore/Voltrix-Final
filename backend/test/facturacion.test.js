// Factura opcional contra el backend corriendo (npm run dev). Necesita un admin
// para marcar los pedidos como pagados (en CI: admin@voltrix.test).
//   BASE=http://localhost:4000 node --test test/facturacion.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.BASE || 'http://localhost:4000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@voltrix.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPrueba123'
const DIRECCION = { calle: 'Av. Siempre Viva 742', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' }
const FISCALES = { rfc: 'GODE561231GR8', razonSocial: 'Emiliano Gomez Diaz', codigoPostal: '45050', regimenFiscal: '612', usoCfdi: 'G03' }

const gql = (query, variables, access) =>
  fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(access && { Authorization: `Bearer ${access}` }) },
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json())

const token = (username, password) =>
  fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 'voltrix-web', grant_type: 'password', username, password }),
  }).then((r) => r.json())

const PEDIR = `mutation ($f: Boolean) { crearPedido(items: [{ productoId: 1, cantidad: 1 }], requiereFactura: $f) { id requiereFactura } }`
const PAGAR = `mutation ($id: ID!) { cambiarStatusPedido(id: $id, status: PAGADO) { status } }`
const CANCELAR = `mutation ($id: ID!) { cambiarStatusPedido(id: $id, status: CANCELADO) { status } }`
const RECEPTOR = `query ($id: ID!) { pedido(id: $id) { requiereFactura prefactura { receptorRfc valida } } }`

test('factura opcional: público en general salvo que el pedido la pida', async (t) => {
  const admin = await token(ADMIN_EMAIL, ADMIN_PASSWORD)
  if (admin.error) return t.skip(`no existe ${ADMIN_EMAIL}`)
  const A = admin.access_token

  const email = `factura${Date.now()}@voltrix.test`
  const registro = await fetch(`${BASE}/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Factura', email, password: 'contraseña-segura', direccion: DIRECCION }),
  }).then((r) => r.json())
  const C = registro.access_token
  const pedidos = []

  try {
    // Sin datos fiscales no se puede pedir factura.
    assert.equal((await gql(PEDIR, { f: true }, C)).errors[0].extensions.code, 'SIN_DATOS_FISCALES')
    await gql('mutation ($d: DatosFiscalesInput!) { guardarDatosFiscales(datos: $d) { id } }', { d: FISCALES }, C)

    // Con datos guardados pero sin pedir factura: público en general.
    const sinFactura = (await gql(PEDIR, { f: false }, C)).data.crearPedido
    pedidos.push(sinFactura.id)
    assert.equal(sinFactura.requiereFactura, false)
    await gql(PAGAR, { id: sinFactura.id }, A)
    assert.equal((await gql(RECEPTOR, { id: sinFactura.id }, C)).data.pedido.prefactura.receptorRfc, 'XAXX010101000')

    // Pidiendo factura: a su RFC.
    const conFactura = (await gql(PEDIR, { f: true }, C)).data.crearPedido
    pedidos.push(conFactura.id)
    assert.equal(conFactura.requiereFactura, true)
    await gql(PAGAR, { id: conFactura.id }, A)
    const r = (await gql(RECEPTOR, { id: conFactura.id }, C)).data.pedido
    assert.equal(r.prefactura.receptorRfc, 'GODE561231GR8')
    assert.equal(r.prefactura.valida, true)

    // Después: "Facturar a mi nombre" pasa el primero a su RFC.
    const f = await gql('mutation ($id: ID!) { facturarAMiNombre(pedidoId: $id) { receptorRfc } }', { id: sinFactura.id }, C)
    assert.equal(f.data.facturarAMiNombre.receptorRfc, 'GODE561231GR8')
    assert.equal((await gql(RECEPTOR, { id: sinFactura.id }, C)).data.pedido.requiereFactura, true)
  } finally {
    // Devuelve el stock.
    for (const id of pedidos) await gql(CANCELAR, { id }, A)
  }
})
