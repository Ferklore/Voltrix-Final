// Prueba de GraphQL Subscriptions por WebSocket contra el backend corriendo.
// Necesita el admin de prueba (admin@voltrix.test); si no existe, se salta.
//   BASE=http://localhost:4000 npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from 'graphql-ws'
import WebSocket from 'ws'
const DIRECCION = { calle: 'Av. Siempre Viva 742', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' }

const BASE = process.env.BASE || 'http://localhost:4000'
// Admin de prueba (el CI lo crea con npm run crear-admin).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@voltrix.test'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPrueba123'

const token = (params) =>
  fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 'voltrix-web', ...params }),
  }).then((r) => r.json())

const gql = (query, access) =>
  fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
    body: JSON.stringify({ query }),
  }).then((r) => r.json())

const conectar = (access) =>
  createClient({
    url: `${BASE.replace(/^http/, 'ws')}/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { authorization: `Bearer ${access}` },
    retryAttempts: 0,
  })

// Junta los eventos que llegan y deja esperar al siguiente.
function escuchar(cliente, query) {
  const cola = []
  let avisar = null
  const fin = cliente.subscribe({ query }, {
    next: (r) => (cola.push(r), avisar?.()),
    error: (e) => (cola.push({ errors: e }), avisar?.()),
    complete: () => {},
  })
  // Si en 10 s no llega nada, falla en vez de quedarse colgada.
  const siguiente = async () => {
    const limite = Date.now() + 10_000
    while (!cola.length) {
      if (Date.now() > limite) throw new Error('No llegó ningún evento por el WebSocket.')
      await new Promise((ok) => ((avisar = ok), setTimeout(ok, 250)))
    }
    return cola.shift()
  }
  return { siguiente, fin }
}

const PEDIDOS = 'subscription { pedidoCambio { tipo pedido { id status total } } }'

test('solo un ADMIN puede suscribirse y recibe los cambios de pedidos en vivo', async (t) => {
  const admin = await token({ grant_type: 'password', username: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  if (admin.error) return t.skip('no existe admin@voltrix.test')

  const email = `vivo${Date.now()}@voltrix.test`
  const registro = await fetch(`${BASE}/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Vivo', email, password: 'contraseña-segura', direccion: DIRECCION }),
  }).then((r) => r.json())

  // Un cliente normal recibe FORBIDDEN.
  const cliente = conectar(registro.access_token)
  const rechazo = await escuchar(cliente, PEDIDOS).siguiente()
  assert.equal(rechazo.errors[0].extensions.code, 'FORBIDDEN')
  await cliente.dispose()

  // El admin escucha mientras el cliente compra y cancela.
  const ws = conectar(admin.access_token)
  const sub = escuchar(ws, PEDIDOS)
  t.after(() => (sub.fin(), ws.dispose()))
  // El servidor valida el token contra la base antes de registrar la
  // suscripción; con Neon eso puede tardar, así que se le da margen.
  await new Promise((ok) => setTimeout(ok, 2000))

  // Producto 2: api.test.js corre en paralelo y mide el stock del 3.
  // Producto 2: api.test.js corre en paralelo y mide el stock del 3.
  // RNF-82: el aviso llega en menos de 2 s. Se mide desde antes de enviar la
  // mutación, así que el tiempo incluye también la ida y vuelta de la petición.
  const MAX_MS = 2000
  let inicio = Date.now()
  const { data } = await gql('mutation { crearPedido(items: [{ productoId: 2, cantidad: 1 }]) { id } }', registro.access_token)
  const id = data.crearPedido.id
  // Pueden colarse pedidos de otras pruebas: solo cuentan los de este.
  const delPedido = async () => {
    for (;;) {
      const { pedidoCambio } = (await sub.siguiente()).data
      if (pedidoCambio.pedido.id === id) return pedidoCambio
    }
  }
  let e = await delPedido()
  assert.deepEqual([e.tipo, e.pedido.status], ['NUEVO', 'PENDIENTE'])
  let ms = Date.now() - inicio
  t.diagnostic(`RNF-82 pedido nuevo: ${ms} ms`)
  assert.ok(ms < MAX_MS, `pedido nuevo: ${ms} ms`)

  inicio = Date.now()
  await gql(`mutation { cancelarPedido(id: ${id}) { id } }`, registro.access_token)
  e = await delPedido()
  assert.deepEqual([e.tipo, e.pedido.status], ['ACTUALIZADO', 'CANCELADO'])
  ms = Date.now() - inicio
  t.diagnostic(`RNF-82 cambio de estado: ${ms} ms`)
  assert.ok(ms < MAX_MS, `cambio de estado: ${ms} ms`)

})
