// Mouser Search API sin gastar la cuota: se simulan sus respuestas.
//   node --test test/mouser.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.MOUSER_API_KEY = 'llave-de-prueba'
process.env.MOUSER_TIPO_CAMBIO = '20'
process.env.MOUSER_MARGEN = '1.5'
const { ErrorMouser, buscarEnMouser, esImagenDeMouser, normalizarParte, precioNumero, precioSugerido } = await import('../src/mouser.js')

// Una parte como la manda Mouser (campos de MouserPart).
const PARTE = {
  MouserPartNumber: '595-LM317T',
  ManufacturerPartNumber: 'LM317T',
  Manufacturer: 'Texas Instruments',
  Description: 'Linear Voltage Regulators 3-Terminal Adj Pos',
  Category: 'Linear Voltage Regulators',
  DataSheetUrl: 'http://www.ti.com/lit/ds/symlink/lm317.pdf',
  ImagePath: 'https://www.mouser.com/images/texasinstruments/images/TO-220-3_t.jpg',
  ProductDetailUrl: 'https://www.mouser.mx/ProductDetail/595-LM317T',
  Availability: '5,240 In Stock',
  AvailabilityInStock: '5240',
  PriceBreaks: [
    { Quantity: 10, Price: '$0.512', Currency: 'USD' },
    { Quantity: 1, Price: '$0.80', Currency: 'USD' },
  ],
  ProductAttributes: [
    { AttributeName: 'Output Voltage', AttributeValue: '1.25 V to 37 V' },
    { AttributeName: 'Packaging', AttributeValue: 'Tube' },
    { AttributeName: 'Packaging', AttributeValue: 'Cut Tape' },
    { AttributeName: '', AttributeValue: 'sin nombre' },
  ],
}

test('precios: texto con formato y RawPrice', () => {
  assert.equal(precioNumero({ Price: '$1,234.56' }), 1234.56)
  assert.equal(precioNumero({ Price: '1.234,56 €' }), 1234.56)
  assert.equal(precioNumero({ Price: '$0.512' }), 0.512)
  assert.equal(precioNumero({ Price: 'x', RawPrice: 2.5 }), 2.5)
  assert.equal(precioNumero({ Price: '' }), 0)
})

test('precio sugerido: USD x tipo de cambio x margen x IVA, al peso hacia arriba', () => {
  // 0.80 * 20 * 1.5 * 1.16 = 27.84 -> 28
  assert.equal(precioSugerido(0.8), 28)
  // En MXN no se convierte: 16 * 1.5 * 1.16 = 27.84 -> 28
  assert.equal(precioSugerido(16, 'MXN'), 28)
  assert.equal(precioSugerido(10, 'EUR'), null)
  assert.equal(precioSugerido(null), null)
})

test('pieza sin precio ni stock (como responde Mouser fuera de su región)', () => {
  const p = normalizarParte({
    ...PARTE, PriceBreaks: [], AvailabilityInStock: null, Availability: null,
    RestrictionMessage: 'Mouser actualmente no vende este producto en su región.',
  })
  assert.equal(p.precioMouser, null)
  assert.equal(p.precioSugeridoMxn, null)
  assert.equal(p.enStock, 0)
  assert.match(p.aviso, /no vende este producto/)
  // Stock leído del texto cuando no viene el número.
  assert.equal(normalizarParte({ ...PARTE, AvailabilityInStock: null, Availability: '1,234 En existencia' }).enStock, 1234)
})

test('normaliza la parte de Mouser', () => {
  const p = normalizarParte(PARTE)
  assert.equal(p.numeroFabricante, 'LM317T')
  assert.equal(p.fabricante, 'Texas Instruments')
  assert.equal(p.enStock, 5240)
  assert.equal(p.precioUsd, 0.8, 'el de 1 pieza, aunque venga después')
  assert.deepEqual(p.precios.map((x) => x.cantidad), [1, 10])
  assert.equal(p.precioSugeridoMxn, 28)
  assert.equal(p.datasheetUrl, 'https://www.ti.com/lit/ds/symlink/lm317.pdf', 'se fuerza https')
  // Sin atributos repetidos ni vacíos (la ficha no los admite).
  assert.deepEqual(p.atributos, [
    { nombre: 'Output Voltage', valor: '1.25 V to 37 V' },
    { nombre: 'Packaging', valor: 'Tube' },
  ])
})

test('solo se importan imágenes de mouser.com por https', () => {
  assert.equal(esImagenDeMouser('https://www.mouser.com/images/x.jpg'), true)
  assert.equal(esImagenDeMouser('https://eu.mouser.com/images/x.jpg'), true)
  assert.equal(esImagenDeMouser('http://www.mouser.com/images/x.jpg'), false)
  assert.equal(esImagenDeMouser('https://mouser.com.evil.com/x.jpg'), false)
  assert.equal(esImagenDeMouser('no es url'), false)
})

test('búsqueda: arma la petición correcta, usa caché y reporta errores de Mouser', async () => {
  const peticiones = []
  globalThis.fetch = async (url, op) => {
    peticiones.push({ url: String(url), cuerpo: JSON.parse(op.body) })
    return Response.json({ Errors: [], SearchResults: { NumberOfResult: 1, Parts: [PARTE] } })
  }
  const r = await buscarEnMouser({ texto: '  lm317  regulador ', limite: 5 })
  assert.equal(r[0].numeroMouser, '595-LM317T')
  assert.match(peticiones[0].url, /\/search\/keyword\?apiKey=llave-de-prueba$/)
  assert.deepEqual(peticiones[0].cuerpo.SearchByKeywordRequest, {
    keyword: 'lm317 regulador', records: 5, startingRecord: 0, searchOptions: 'None', searchWithYourSignUpLanguage: 'false',
  })

  await buscarEnMouser({ texto: 'LM317 regulador', limite: 5 })
  assert.equal(peticiones.length, 1, 'la misma búsqueda sale de la caché')

  await buscarEnMouser({ texto: 'LM317T', porNumeroDeParte: true })
  assert.match(peticiones[1].url, /\/search\/partnumber\?/)
  assert.deepEqual(peticiones[1].cuerpo, { SearchByPartRequest: { mouserPartNumber: 'LM317T', partSearchOptions: 'None' } })

  globalThis.fetch = async () => Response.json({ Errors: [{ Message: 'Invalid unique identifier.' }], SearchResults: null })
  await assert.rejects(buscarEnMouser({ texto: 'otra cosa' }), (e) => e instanceof ErrorMouser && /Invalid unique identifier/.test(e.message))
  await assert.rejects(buscarEnMouser({ texto: 'x' }), /al menos 2/)
})

test('tope propio de búsquedas por minuto', async () => {
  globalThis.fetch = async () => Response.json({ Errors: [], SearchResults: { Parts: [] } })
  let error = null
  for (let i = 0; i < 30 && !error; i++) {
    await buscarEnMouser({ texto: `consulta ${i}` }).catch((e) => (error = e))
  }
  assert.match(error?.message ?? '', /espera un minuto/)
})
