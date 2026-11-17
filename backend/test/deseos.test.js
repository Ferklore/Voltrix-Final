// Lista de deseos contra el backend corriendo (npm run dev).
//   BASE=http://localhost:4000 node --test test/deseos.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.BASE || 'http://localhost:4000'
const DIRECCION = { calle: 'Av. Siempre Viva 742', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' }

const gql = (query, variables, access) =>
  fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(access && { Authorization: `Bearer ${access}` }) },
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json())

async function cuentaNueva(nombre) {
  const email = `deseos${Date.now()}${Math.random().toString(36).slice(2, 6)}@voltrix.test`
  const r = await fetch(`${BASE}/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, email, password: 'contraseña-segura', direccion: DIRECCION }),
  }).then((x) => x.json())
  return r.access_token
}

const AGREGAR = 'mutation ($id: ID!) { agregarADeseos(productoId: $id) { id enMiLista } }'
const QUITAR = 'mutation ($id: ID!) { quitarDeDeseos(productoId: $id) }'
const LISTA = '{ yo { listaDeseos { id } } }'

test('lista de deseos: agregar, sin duplicados, privada y quitar', async () => {
  const ana = await cuentaNueva('Ana')
  const beto = await cuentaNueva('Beto')
  const [p1, p2] = (await gql('{ productos(limite: 2) { id } }')).data.productos.map((p) => p.id)

  assert.equal((await gql(AGREGAR, { id: p1 })).errors[0].extensions.code, 'UNAUTHENTICATED')
  assert.equal((await gql(AGREGAR, { id: 999999 }, ana)).errors[0].extensions.code, 'PRODUCTO_NO_EXISTE')

  assert.equal((await gql(AGREGAR, { id: p1 }, ana)).data.agregarADeseos.enMiLista, true)
  await gql(AGREGAR, { id: p1 }, ana) // repetido: no se duplica
  await gql(AGREGAR, { id: p2 }, ana)
  assert.deepEqual((await gql(LISTA, {}, ana)).data.yo.listaDeseos.map((p) => p.id), [p2, p1], 'lo más reciente primero')

  // Es de Ana: Beto no la ve y para él el producto no está en su lista.
  assert.deepEqual((await gql(LISTA, {}, beto)).data.yo.listaDeseos, [])
  const q = `query ($id: ID!) { producto(id: $id) { enMiLista } }`
  assert.equal((await gql(q, { id: p1 }, beto)).data.producto.enMiLista, false)
  assert.equal((await gql(q, { id: p1 })).data.producto.enMiLista, false, 'sin sesión')

  assert.equal((await gql(QUITAR, { id: p1 }, ana)).data.quitarDeDeseos, true)
  assert.equal((await gql(QUITAR, { id: p1 }, ana)).data.quitarDeDeseos, false, 'ya no estaba')
  assert.deepEqual((await gql(LISTA, {}, ana)).data.yo.listaDeseos.map((p) => p.id), [p2])
  await gql(QUITAR, { id: p2 }, ana)
})
