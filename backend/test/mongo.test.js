// Validaciones de MongoDB (fichas y reseñas) sin conectarse a ninguna base, y
// que todo se apague bien cuando no hay MONGODB_URI.
//   node --test test/mongo.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

// db.js exige DATABASE_URL al importarse; el pool no se conecta hasta usarse.
process.env.DATABASE_URL ||= 'postgresql://prueba@localhost/prueba'
delete process.env.MONGODB_URI
const { normalizarFicha } = await import('../src/mongo/fichas.js')
const { nombrePublico, normalizarResena, listarResenas, resumenResenas } = await import('../src/mongo/resenas.js')
const { listarBitacora, registrar } = await import('../src/mongo/bitacora.js')
const { coleccion, mongoConfigurado } = await import('../src/mongo/conexion.js')

test('ficha: limpia filas vacías y espacios', () => {
  const f = normalizarFicha({
    especificaciones: [{ nombre: ' Voltaje ', valor: '3.3  V' }, { nombre: '', valor: '' }, { nombre: 'Núcleos', valor: '2' }],
    datasheetUrl: ' https://www.espressif.com/esp32.pdf ',
    descripcion: '  Módulo WiFi  ',
  })
  assert.deepEqual(f, {
    especificaciones: [{ nombre: 'Voltaje', valor: '3.3 V' }, { nombre: 'Núcleos', valor: '2' }],
    datasheetUrl: 'https://www.espressif.com/esp32.pdf',
    descripcion: 'Módulo WiFi',
  })
  assert.deepEqual(normalizarFicha({ especificaciones: [] }), { especificaciones: [], datasheetUrl: null, descripcion: null })
})

test('ficha: rechaza filas incompletas, repetidas, demasiadas y URLs raras', () => {
  assert.throws(() => normalizarFicha({ especificaciones: [{ nombre: 'Voltaje', valor: '' }] }), /nombre y valor/)
  assert.throws(() => normalizarFicha({ especificaciones: [{ nombre: 'RAM', valor: '1' }, { nombre: 'ram', valor: '2' }] }), /mismo nombre/)
  const muchas = Array.from({ length: 41 }, (_, i) => ({ nombre: `e${i}`, valor: 'x' }))
  assert.throws(() => normalizarFicha({ especificaciones: muchas }), /Máximo 40/)
  assert.throws(() => normalizarFicha({ especificaciones: [], datasheetUrl: 'no es url' }), /URL válida/)
  assert.throws(() => normalizarFicha({ especificaciones: [], datasheetUrl: 'javascript:alert(1)' }), /http/)
})

test('reseña: calificación 1-5 y comentario opcional', () => {
  assert.deepEqual(normalizarResena({ calificacion: 5, comentario: '  Excelente  ' }), { calificacion: 5, comentario: 'Excelente' })
  assert.deepEqual(normalizarResena({ calificacion: 3, comentario: '   ' }), { calificacion: 3, comentario: null })
  for (const mala of [0, 6, 4.5, '5', null]) {
    assert.throws(() => normalizarResena({ calificacion: mala }), /1 a 5/)
  }
  assert.throws(() => normalizarResena({ calificacion: 4, comentario: 'x'.repeat(1001) }), /muy largo/)
})

test('nombre público: nombre + inicial', () => {
  assert.equal(nombrePublico('Fernando Rodríguez Sánchez'), 'Fernando R.')
  assert.equal(nombrePublico('  ana   lópez '), 'ana L.')
  assert.equal(nombrePublico('Isaac'), 'Isaac')
  assert.equal(nombrePublico(''), 'Cliente')
})

test('sin MONGODB_URI todo se apaga sin errores', async () => {
  assert.equal(mongoConfigurado(), false)
  assert.equal(await coleccion('fichas'), null)
  assert.deepEqual(await listarResenas(1), [])
  assert.deepEqual(await resumenResenas(1), { promedio: 0, total: 0, porEstrellas: [0, 0, 0, 0, 0] })
  assert.deepEqual(await listarBitacora(), [])
  assert.doesNotThrow(() => registrar('PRUEBA', 'no truena'))
})
