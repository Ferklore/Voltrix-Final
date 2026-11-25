// Firma de Cloudinary y reglas de imágenes, sin conectarse a Cloudinary.
//   node --test test/cloudinary.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.CLOUDINARY_URL = 'cloudinary://123456789012345:secreto-de-prueba@voltrix-demo'
const { firmar, firmaSubidaImagen, imagenExcedePeso, imagenPermitida } = await import('../src/cloudinary.js')

test('firma igual al ejemplo de la documentación de Cloudinary', () => {
  // docs: "eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510" + "abcd"
  const params = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' }
  assert.equal(firmar(params, 'abcd'), 'bfd09f95f331f558cbd1320e67aa8d488770583e')
})

test('la firma ignora vacíos y no depende del orden', () => {
  assert.equal(firmar({ b: 2, a: 1, c: '' }, 'x'), firmar({ a: 1, b: 2 }, 'x'))
  assert.notEqual(firmar({ a: 1 }, 'x'), firmar({ a: 2 }, 'x'))
})

test('firma de subida: carpeta, límite de tamaño y sin el secreto', () => {
  const f = firmaSubidaImagen()
  assert.equal(f.cloudName, 'voltrix-demo')
  assert.equal(f.apiKey, '123456789012345')
  assert.equal(f.folder, 'voltrix/productos')
  assert.equal(f.url, 'https://api.cloudinary.com/v1_1/voltrix-demo/image/upload')
  assert.ok(Math.abs(f.timestamp - Date.now() / 1000) < 5)
  assert.equal(f.signature, firmar({ folder: f.folder, timestamp: f.timestamp, transformation: f.transformation }, 'secreto-de-prueba'))
  assert.ok(!JSON.stringify(f).includes('secreto-de-prueba'), 'el secreto no sale al navegador')
})

test('imágenes permitidas: rutas propias y Cloudinary por https', () => {
  for (const ok of [null, '', '/productos/esp32.svg', 'https://res.cloudinary.com/voltrix-demo/image/upload/v1/x.png']) {
    assert.equal(imagenPermitida(ok), true, ok)
  }
  for (const malo of ['//evil.com/x.png', 'http://res.cloudinary.com/x.png', 'https://evil.com/x.png', 'javascript:alert(1)', 'data:image/png;base64,AAA']) {
    assert.equal(imagenPermitida(malo), false, malo)
  }
})

test('imagen de más de 5 MB: se rechaza al guardar el producto (RNF-92)', async () => {
  const pesos = { 'https://res.cloudinary.com/demo/grande.jpg': 5 * 1024 * 1024 + 1, 'https://res.cloudinary.com/demo/justa.jpg': 5 * 1024 * 1024 }
  const pedidas = []
  globalThis.fetch = async (url, op) => {
    pedidas.push(op.method)
    return new Response(null, { headers: { 'content-length': String(pesos[url]) } })
  }
  assert.equal(await imagenExcedePeso('https://res.cloudinary.com/demo/grande.jpg'), true)
  assert.equal(await imagenExcedePeso('https://res.cloudinary.com/demo/justa.jpg'), false)
  assert.deepEqual(pedidas, ['HEAD', 'HEAD'], 'solo pide los encabezados, no descarga la imagen')
  assert.equal(await imagenExcedePeso('/productos/esp32.svg'), false)
  assert.equal(pedidas.length, 2, 'las rutas propias no se consultan')
})
