// Prefactura CFDI sin base de datos: estructura, cálculo y validación.
//   node --test test/cfdi.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarComprobante, aXml, fechaSat } from '../src/cfdi/generar.js'
import { normalizarDatosFiscales, validar, validarReglas, validarXsd } from '../src/cfdi/validar.js'
import { pdfPrefactura } from '../src/cfdi/pdf.js'

const renglones = [
  { productoId: 1, nombre: 'ESP32 WROOM 32D', claveProdServ: '01010101', cantidad: 3, subtotal: 435 },
  { productoId: 3, nombre: 'Sensor DHT11 & "pines" <4>', claveProdServ: '01010101', cantidad: 2, subtotal: 90 },
]
const pedido = { id: 42, total: 525 }
const fecha = new Date('2026-11-16T18:30:00Z')
const persona = { rfc: 'GODE561231GR8', razon_social: 'EMILIANO GOMEZ DIAZ', cp_fiscal: '45050', regimen_fiscal: '612', uso_cfdi: 'G03' }

test('público en general: XML con InformacionGlobal, válido contra XSD y reglas', async () => {
  const c = armarComprobante({ pedido, renglones, usuario: null, proveedorPago: 'PAYPAL', fecha })
  const xml = aXml(c)
  assert.deepEqual(await validar(xml, c), [])
  assert.match(xml, /<cfdi:Comprobante [^>]*Version="4.0"[^>]*Folio="42"[^>]*FormaPago="31"/)
  assert.match(xml, /Fecha="2026-11-16T12:30:00"/, 'hora de la Ciudad de México')
  assert.match(xml, /SubTotal="452.59"[^>]*Total="525.00"/)
  assert.match(xml, /<cfdi:InformacionGlobal Periodicidad="01" Meses="11" Año="2026"\/>/)
  assert.match(xml, /Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" DomicilioFiscalReceptor="44100" RegimenFiscalReceptor="616" UsoCFDI="S01"/)
  assert.match(xml, /Descripcion="Sensor DHT11 &amp; &quot;pines&quot; &lt;4&gt;"/, 'escapa caracteres de XML')
  assert.match(xml, /TotalImpuestosTrasladados="72.41"/)
})

test('cliente con RFC: sin InformacionGlobal, con su régimen y uso', async () => {
  const c = armarComprobante({ pedido, renglones, usuario: persona, proveedorPago: 'MERCADOPAGO', fecha })
  const xml = aXml(c)
  assert.deepEqual(await validar(xml, c), [])
  assert.doesNotMatch(xml, /InformacionGlobal/)
  assert.match(xml, /Rfc="GODE561231GR8"[^>]*RegimenFiscalReceptor="612" UsoCFDI="G03"/)
  assert.match(xml, /FormaPago="04"/)
})

test('el total de la prefactura siempre es lo que se cobró (precios con IVA)', () => {
  for (let centavos = 1; centavos <= 500_000; centavos += 997) {
    for (const cantidad of [1, 2, 3, 7, 13]) {
      const subtotal = Math.round(centavos * cantidad) / 100
      const c = armarComprobante({
        pedido: { id: 1, total: Math.round((subtotal + 45) * 100) / 100 },
        renglones: [
          { productoId: 1, nombre: 'a', cantidad, subtotal },
          { productoId: 2, nombre: 'b', cantidad: 1, subtotal: 45 },
        ],
        usuario: null,
        fecha,
      })
      assert.deepEqual(validarReglas(c), [], `precio ${centavos / 100} × ${cantidad}`)
    }
  }
})

test('el XSD rechaza estructura y claves fuera de catálogo', async () => {
  const xml = aXml(armarComprobante({ pedido, renglones, usuario: null, fecha }))
  const errores = async (x) => (await validarXsd(x)).join('\n')
  assert.match(await errores(xml.replace('Moneda="MXN"', 'Moneda="PESOS"')), /Moneda/)
  assert.match(await errores(xml.replace('ClaveUnidad="H87"', 'ClaveUnidad="PZA"')), /ClaveUnidad/)
  assert.match(await errores(xml.replace(/ Rfc="EKU9003173C9"/, ' Rfc="NO-ES-RFC"')), /Rfc/)
  assert.match(await errores(xml.replace(/<cfdi:Emisor [^>]+\/>/, '')), /Emisor|Receptor/)
  assert.match(await errores(xml.replace('LugarExpedicion="44100"', 'LugarExpedicion="441"')), /LugarExpedicion/)
})

test('las reglas detectan cuentas que no cuadran y combinaciones inválidas', () => {
  const c = armarComprobante({ pedido, renglones, usuario: persona, fecha })
  assert.match(validarReglas({ ...c, total: c.total + 10_000 }).join(), /Total no es SubTotal/)
  assert.match(validarReglas({ ...c, totalPedido: 999e6 }).join(), /no coincide con el total cobrado/)
  const iva = structuredClone(c)
  iva.conceptos[0].traslado.importe += 50
  assert.match(validarReglas(iva).join(), /no corresponde al 16 %/)
  assert.match(validarReglas({ ...c, receptor: { ...c.receptor, regimen: '601' } }).join(), /no aplica a una persona física/)
  assert.match(validarReglas({ ...c, receptor: { ...c.receptor, regimen: '605' } }).join(), /uso G03 no se permite/)
})

test('datos fiscales del cliente: normaliza y rechaza lo inválido', () => {
  const d = normalizarDatosFiscales({ rfc: ' gode561231gr8 ', razonSocial: 'emiliano  gomez', codigoPostal: '45050', regimenFiscal: '612', usoCfdi: 'g03' })
  assert.deepEqual(d, { rfc: 'GODE561231GR8', razonSocial: 'EMILIANO GOMEZ', codigoPostal: '45050', regimenFiscal: '612', usoCfdi: 'G03' })
  const base = { rfc: 'GODE561231GR8', razonSocial: 'X', codigoPostal: '45050', regimenFiscal: '612', usoCfdi: 'G03' }
  assert.throws(() => normalizarDatosFiscales({ ...base, rfc: 'ABC' }), /RFC/)
  assert.throws(() => normalizarDatosFiscales({ ...base, rfc: 'XAXX010101000' }), /genérico/)
  assert.throws(() => normalizarDatosFiscales({ ...base, codigoPostal: '4505' }), /5 dígitos/)
  assert.throws(() => normalizarDatosFiscales({ ...base, regimenFiscal: '601' }), /no aplica/)
  assert.throws(() => normalizarDatosFiscales({ ...base, regimenFiscal: '605' }), /no se permite/)
})

test('fechaSat usa la hora de la Ciudad de México', () => {
  assert.equal(fechaSat(new Date('2026-01-01T05:59:59Z')), '2025-12-31T23:59:59')
})

test('genera el PDF', async () => {
  const c = armarComprobante({ pedido, renglones, usuario: persona, fecha })
  const pdf = await pdfPrefactura(JSON.parse(JSON.stringify(c)))
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.length > 1500)
})
