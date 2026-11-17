// Prueba del carrito (lógica pura, no necesita servidor).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carritoReducer } from '../src/lib/carrito.js'

test('carrito: suma repetidos y respeta el stock', () => {
  const p = { id: 1, nombre: 'X', precio: 10, stock: 2 }
  let items = carritoReducer([], { type: 'AGREGAR', payload: p })
  items = carritoReducer(items, { type: 'AGREGAR', payload: p })
  items = carritoReducer(items, { type: 'AGREGAR', payload: p })
  assert.equal(items[0].cantidad, 2)
  items = carritoReducer(items, { type: 'CAMBIAR_CANTIDAD', payload: { id: 1, cantidad: -4 } })
  assert.equal(items[0].cantidad, 1)
  assert.deepEqual(carritoReducer(items, { type: 'QUITAR', payload: 1 }), [])
})
