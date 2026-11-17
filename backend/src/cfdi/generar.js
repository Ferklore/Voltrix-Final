// Arma la prefactura de un pedido con la estructura del CFDI del SAT (Anexo 20):
// Comprobante > [InformacionGlobal] > Emisor > Receptor > Conceptos > Impuestos.
// Funciones puras: no tocan la base, así se pueden probar solas (test/cfdi.test.js).
//
// Los precios de la tienda YA incluyen IVA. El CFDI pide el valor SIN IVA y el
// impuesto aparte, así que cada renglón se divide entre 1.16. Para que la suma
// cuadre con lo que pagó el cliente, los importes por concepto llevan 6
// decimales (lo permite el Anexo 20) y solo SubTotal/Total se redondean a 2.
//
// ponytail: es una PRE-factura. No lleva Sello ni Certificado (requieren el CSD
// del emisor y la cadena original) ni Timbre Fiscal Digital (lo pone un PAC).
// Para timbrar: firmar con el CSD y mandar este XML al PAC (RF5.4, opcional).
import { FORMA_PAGO_PROVEEDOR, RFC_PUBLICO_GENERAL } from './catalogos.js'

export const VERSION_CFDI = '4.0'
export const NAMESPACE = 'http://www.sat.gob.mx/cfd/4'
const SCHEMA_LOCATION = `${NAMESPACE} http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd`
const SIN_CERTIFICADO = '0'.repeat(20)
const IVA_MICROS_POR_MILLON = 160_000 // 0.16 expresado en millonésimas

// Emisor: la tienda. Por defecto, el RFC de pruebas que publica el SAT.
export const emisorDeEntorno = (env = process.env) => ({
  rfc: env.CFDI_EMISOR_RFC || 'EKU9003173C9',
  nombre: env.CFDI_EMISOR_NOMBRE || 'ESCUELA KEMPER URGATE',
  regimen: env.CFDI_EMISOR_REGIMEN || '601',
  cp: env.CFDI_LUGAR_EXPEDICION || '44100',
})
export const serieDeEntorno = (env = process.env) => env.CFDI_SERIE || 'V'

// --- Aritmética en millonésimas (enteros) para no arrastrar errores de float ---
const aMicros = (n) => Math.round(Number(n) * 1e6)
const redondea6 = (n) => Math.round(n)
const microsACentavos = (m) => Math.round(m / 1e4)

function formatoMicros(m, decimales = 6) {
  const unidades = decimales === 6 ? m : microsACentavos(m) * 1e4
  const signo = unidades < 0 ? '-' : ''
  const abs = Math.abs(unidades)
  const entero = Math.floor(abs / 1e6)
  const fraccion = String(abs % 1e6).padStart(6, '0').slice(0, decimales)
  return `${signo}${entero}.${fraccion}`
}
export const dinero2 = (m) => formatoMicros(m, 2)
export const dinero6 = (m) => formatoMicros(m, 6)

// Fecha local de la Ciudad de México en el formato del SAT: AAAA-MM-DDThh:mm:ss.
export function fechaSat(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(fecha)
  return partes.replace(' ', 'T')
}

// Si el cliente no capturó datos fiscales se factura a público en general.
export function receptorDe(usuario, emisor) {
  if (usuario?.rfc && usuario.rfc !== RFC_PUBLICO_GENERAL) {
    return {
      rfc: usuario.rfc,
      nombre: usuario.razon_social,
      cp: usuario.cp_fiscal,
      regimen: usuario.regimen_fiscal,
      uso: usuario.uso_cfdi,
      publicoGeneral: false,
    }
  }
  return { rfc: RFC_PUBLICO_GENERAL, nombre: 'PUBLICO EN GENERAL', cp: emisor.cp, regimen: '616', uso: 'S01', publicoGeneral: true }
}

// Calcula conceptos, impuestos y totales. renglones: [{ productoId, nombre,
// claveProdServ, cantidad, subtotal (con IVA) }].
export function calcular(renglones) {
  const conceptos = renglones.map((r) => {
    const conIva = aMicros(r.subtotal)
    // Valor unitario sin IVA (6 decimales) e importe = cantidad × valor unitario.
    const valorUnitario = redondea6((conIva / 1.16) / r.cantidad)
    const importe = valorUnitario * r.cantidad
    const iva = redondea6((importe * IVA_MICROS_POR_MILLON) / 1e6)
    return {
      claveProdServ: r.claveProdServ || '01010101',
      noIdentificacion: String(r.productoId),
      cantidad: r.cantidad,
      claveUnidad: 'H87',
      unidad: 'Pieza',
      descripcion: r.nombre,
      valorUnitario,
      importe,
      objetoImp: '02',
      traslado: { base: importe, impuesto: '002', tipoFactor: 'Tasa', tasa: '0.160000', importe: iva },
    }
  })
  const base = conceptos.reduce((s, c) => s + c.importe, 0)
  const iva = conceptos.reduce((s, c) => s + c.traslado.importe, 0)
  const subtotal = microsACentavos(base) * 1e4
  const totalIva = microsACentavos(iva) * 1e4
  return { conceptos, base, iva, subtotal, totalIva, total: subtotal + totalIva }
}

// Datos completos del comprobante (lo que se vuelve XML y PDF).
export function armarComprobante({ pedido, renglones, usuario, proveedorPago, fecha = new Date(), emisor = emisorDeEntorno(), serie = serieDeEntorno() }) {
  const receptor = receptorDe(usuario, emisor)
  const calculo = calcular(renglones)
  const fechaTexto = fechaSat(fecha)
  return {
    version: VERSION_CFDI,
    serie,
    folio: String(pedido.id),
    fecha: fechaTexto,
    formaPago: FORMA_PAGO_PROVEEDOR[proveedorPago] || '99',
    metodoPago: 'PUE',
    moneda: 'MXN',
    tipoDeComprobante: 'I',
    exportacion: '01',
    lugarExpedicion: emisor.cp,
    // Público en general exige el nodo InformacionGlobal (periodicidad diaria).
    informacionGlobal: receptor.publicoGeneral
      ? { periodicidad: '01', meses: fechaTexto.slice(5, 7), anio: fechaTexto.slice(0, 4) }
      : null,
    emisor,
    receptor,
    ...calculo,
    totalPedido: aMicros(pedido.total),
  }
}

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const attrs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ')

const traslado = (t) =>
  `<cfdi:Traslado ${attrs({ Base: dinero6(t.base), Impuesto: t.impuesto, TipoFactor: t.tipoFactor, TasaOCuota: t.tasa, Importe: dinero6(t.importe) })}/>`

export function aXml(c) {
  const comprobante = attrs({
    'xmlns:cfdi': NAMESPACE,
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': SCHEMA_LOCATION,
    Version: c.version,
    Serie: c.serie,
    Folio: c.folio,
    Fecha: c.fecha,
    Sello: '',
    FormaPago: c.formaPago,
    NoCertificado: SIN_CERTIFICADO,
    Certificado: '',
    SubTotal: dinero2(c.subtotal),
    Moneda: c.moneda,
    Total: dinero2(c.total),
    TipoDeComprobante: c.tipoDeComprobante,
    Exportacion: c.exportacion,
    MetodoPago: c.metodoPago,
    LugarExpedicion: c.lugarExpedicion,
  })
  const lineas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<cfdi:Comprobante ${comprobante}>`,
  ]
  if (c.informacionGlobal) {
    const g = c.informacionGlobal
    lineas.push(`  <cfdi:InformacionGlobal ${attrs({ Periodicidad: g.periodicidad, Meses: g.meses, Año: g.anio })}/>`)
  }
  lineas.push(`  <cfdi:Emisor ${attrs({ Rfc: c.emisor.rfc, Nombre: c.emisor.nombre, RegimenFiscal: c.emisor.regimen })}/>`)
  lineas.push(
    `  <cfdi:Receptor ${attrs({
      Rfc: c.receptor.rfc,
      Nombre: c.receptor.nombre,
      DomicilioFiscalReceptor: c.receptor.cp,
      RegimenFiscalReceptor: c.receptor.regimen,
      UsoCFDI: c.receptor.uso,
    })}/>`
  )
  lineas.push('  <cfdi:Conceptos>')
  for (const k of c.conceptos) {
    lineas.push(
      `    <cfdi:Concepto ${attrs({
        ClaveProdServ: k.claveProdServ,
        NoIdentificacion: k.noIdentificacion,
        Cantidad: k.cantidad,
        ClaveUnidad: k.claveUnidad,
        Unidad: k.unidad,
        Descripcion: k.descripcion,
        ValorUnitario: dinero6(k.valorUnitario),
        Importe: dinero6(k.importe),
        ObjetoImp: k.objetoImp,
      })}>`,
      `      <cfdi:Impuestos><cfdi:Traslados>${traslado(k.traslado)}</cfdi:Traslados></cfdi:Impuestos>`,
      '    </cfdi:Concepto>'
    )
  }
  lineas.push('  </cfdi:Conceptos>')
  // Resumen: un solo traslado (IVA 16 %) con la suma de bases e importes.
  lineas.push(
    `  <cfdi:Impuestos TotalImpuestosTrasladados="${dinero2(c.totalIva)}">`,
    `    <cfdi:Traslados><cfdi:Traslado ${attrs({
      Base: dinero2(c.base),
      Impuesto: '002',
      TipoFactor: 'Tasa',
      TasaOCuota: '0.160000',
      Importe: dinero2(c.iva),
    })}/></cfdi:Traslados>`,
    '  </cfdi:Impuestos>',
    '</cfdi:Comprobante>'
  )
  return lineas.join('\n') + '\n'
}

export { RFC_PUBLICO_GENERAL }
