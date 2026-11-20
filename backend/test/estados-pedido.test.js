// Flujo de estados que puede seguir el ADMIN (RF-28). No necesita la base:
// el pool de PostgreSQL no se conecta al importarse.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ||= 'postgresql://prueba@localhost/prueba'
const { estadosSiguientes } = await import('../src/pedidos.js')

test('Pagado -> Enviado -> Entregado, y cancelar solo antes del envío', () => {
  assert.deepEqual(estadosSiguientes('PAGADO'), ['ENVIADO', 'CANCELADO'])
  assert.deepEqual(estadosSiguientes('ENVIADO'), ['ENTREGADO'])
  assert.deepEqual(estadosSiguientes('ENTREGADO'), [])
  assert.deepEqual(estadosSiguientes('CANCELADO'), [])
})

test('Pendiente -> Pagado a mano solo en modo de prueba', () => {
  assert.deepEqual(estadosSiguientes('PENDIENTE', true), ['PAGADO', 'CANCELADO'])
  assert.deepEqual(estadosSiguientes('PENDIENTE', false), ['CANCELADO'])
})
