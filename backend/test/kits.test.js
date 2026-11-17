// Recomendador de kits sin base de datos: elegir plantilla y ajustar presupuesto.
//   node --test test/kits.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ||= 'postgresql://prueba@localhost/prueba'
const { ajustarPresupuesto, elegirPlantilla, normalizar } = await import('../src/kits/recomendador.js')
const { PLANTILLAS } = await import('../src/kits/plantillas.js')

test('normaliza acentos, mayúsculas y espacios', () => {
  assert.equal(normalizar('  Estación   METEOROLÓGICA '), 'estacion meteorologica')
})

test('elige la plantilla por las palabras del proyecto', () => {
  const casos = {
    'Quiero una estación meteorológica con ESP32': 'estacion-meteorologica',
    'una fuente regulada para mi laboratorio': 'fuente-regulada',
    'robot seguidor de línea para el concurso': 'robot-seguidor',
    'prender el foco desde el celular con wifi': 'domotica-wifi',
    'quiero armar una PC para juegos': 'pc-gamer',
    'pc para la escuela': 'pc-escuela',
  }
  for (const [texto, id] of Object.entries(casos)) assert.equal(elegirPlantilla(texto)?.id, id, texto)
  // "pc" solo cuenta como palabra completa: no dentro de "capacitor".
  assert.equal(elegirPlantilla('necesito un capacitor de 10uF'), null)
  assert.equal(elegirPlantilla(''), null)
})

test('todas las plantillas tienen ids únicos y piezas válidas', () => {
  assert.equal(new Set(PLANTILLAS.map((p) => p.id)).size, PLANTILLAS.length)
  for (const p of PLANTILLAS) {
    assert.ok(p.palabras.length && p.componentes.length, p.id)
    for (const c of p.componentes) {
      assert.ok(c.rol && c.buscar.length && Number.isInteger(c.cantidad) && c.cantidad > 0, `${p.id}: ${c.rol}`)
      assert.ok(c.buscar.every((t) => t === normalizar(t) || t.endsWith(' ')), `${p.id}: términos en minúsculas y sin acentos`)
    }
  }
})

const pieza = (rol, precios, { cantidad = 1, opcional = false } = {}) => ({
  componente: { rol, cantidad, opcional },
  opciones: precios.map((precio, i) => ({ id: `${rol}${i}`, precio })),
})

test('presupuesto: sin presupuesto o si alcanza, la opción preferida', () => {
  const piezas = [pieza('micro', [300, 150]), pieza('sensor', [80, 40])]
  assert.deepEqual(ajustarPresupuesto(piezas), [0, 0])
  assert.deepEqual(ajustarPresupuesto(piezas, 1000), [0, 0])
})

test('presupuesto: primero quita lo opcional, luego abarata lo que más ahorra', () => {
  const piezas = [pieza('micro', [300, 150]), pieza('sensor', [80, 40]), pieza('protoboard', [60], { opcional: true })]
  // 440 > 400: basta con quitar la protoboard.
  assert.deepEqual(ajustarPresupuesto(piezas, 400), [0, 0, -1])
  // 380 > 300: además cambia el micro (ahorra 150) antes que el sensor (ahorra 40).
  assert.deepEqual(ajustarPresupuesto(piezas, 300), [1, 0, -1])
  // Aunque no alcance, devuelve lo más barato posible.
  assert.deepEqual(ajustarPresupuesto(piezas, 10), [1, 1, -1])
})

test('presupuesto: cuenta la cantidad y respeta piezas sin stock', () => {
  const piezas = [pieza('motor', [100, 60], { cantidad: 2 }), pieza('sensor', [])]
  assert.deepEqual(ajustarPresupuesto(piezas, 150), [1, -1])
})
