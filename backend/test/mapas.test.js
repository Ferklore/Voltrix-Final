// Mapas (HERE Geocoding) sin internet: se simulan las respuestas de HERE.
//   node --test test/mapas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.HERE_API_KEY = 'llave-de-prueba'
const { consultaHere, coordenadasValidas, geocodificar, leerRespuestaHere, ubicacionParaGuardar } = await import('../src/mapas.js')

const DIR = { calle: 'Av. Juárez 976', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' }

// Respuesta de HERE para una dirección de Guadalajara.
const RESPUESTA = {
  items: [{
    title: 'Avenida Juárez 976, Centro, 44100 Guadalajara, Jal., México',
    resultType: 'houseNumber',
    address: { label: 'Avenida Juárez 976, Centro, 44100 Guadalajara, Jal., México' },
    position: { lat: 20.6747123456789, lng: -103.3567987654321 },
  }],
}

test('consulta calificada: cada parte por separado y país MEX', () => {
  assert.equal(
    consultaHere(DIR),
    'street=Av. Juárez 976;district=Centro;city=Guadalajara;state=Jalisco;postalCode=44100;country=MEX'
  )
  // Un ";" dentro de un campo no rompe la consulta.
  assert.match(consultaHere({ ...DIR, calle: 'Calle 5; int 2' }), /street=Calle 5  int 2;/)
})

test('coordenadas: solo dentro de México', () => {
  assert.equal(coordenadasValidas(20.67, -103.35), true) // Guadalajara
  assert.equal(coordenadasValidas(32.5, -117.0), true) // Tijuana
  assert.equal(coordenadasValidas(21.16, -86.85), true) // Cancún
  assert.equal(coordenadasValidas(40.71, -74.0), false) // Nueva York
  assert.equal(coordenadasValidas(0, 0), false)
  assert.equal(coordenadasValidas(NaN, -103), false)
})

test('lee la respuesta de HERE y redondea a 6 decimales', () => {
  assert.deepEqual(leerRespuestaHere(RESPUESTA), {
    lat: 20.674712,
    lng: -103.356799,
    etiqueta: 'Avenida Juárez 976, Centro, 44100 Guadalajara, Jal., México',
    precision: 'número exterior',
  })
  assert.equal(leerRespuestaHere({ items: [] }), null)
  // Un resultado fuera de México se descarta.
  assert.equal(leerRespuestaHere({ items: [{ position: { lat: 34.05, lng: -118.24 } }] }), null)
})

test('geocodificar: arma la URL, usa caché y reporta errores de HERE', async () => {
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(new URL(url))
    return Response.json(RESPUESTA)
  }
  const u = await geocodificar(DIR)
  assert.equal(u.lat, 20.674712)
  const p = urls[0].searchParams
  assert.equal(urls[0].origin + urls[0].pathname, 'https://geocode.search.hereapi.com/v1/geocode')
  assert.equal(p.get('in'), 'countryCode:MEX')
  assert.equal(p.get('apiKey'), 'llave-de-prueba')
  assert.match(p.get('qq'), /^street=Av\. Juárez 976;/)

  await geocodificar(DIR)
  assert.equal(urls.length, 1, 'la misma dirección sale de la caché')

  globalThis.fetch = async () => Response.json({ title: 'Unauthorized', error_description: 'apiKey invalid' }, { status: 401 })
  await assert.rejects(geocodificar({ ...DIR, calle: 'Otra 1' }), /apiKey invalid/)
})

test('al guardar: gana el pin del cliente; si HERE falla, se guarda sin ubicación', async () => {
  let llamadas = 0
  globalThis.fetch = async () => {
    llamadas++
    throw new Error('sin red')
  }
  assert.deepEqual(await ubicacionParaGuardar(DIR, { lat: 20.1234567, lng: -103.7654321 }), { lat: 20.123457, lng: -103.765432 })
  assert.equal(llamadas, 0, 'con pin no se consulta HERE')
  // Pin fuera de México: se ignora y se consulta HERE (que aquí falla) -> null, sin lanzar.
  assert.equal(await ubicacionParaGuardar({ ...DIR, calle: 'Falla 1' }, { lat: 48.85, lng: 2.35 }), null)
  assert.equal(llamadas, 1)
})
