// Validación de la prefactura en dos capas (RF5.2):
//   1. XSD: estructura, tipos, patrones y claves de catálogo (esquema/cfdi.xsd),
//      con libxml2 compilado a WebAssembly (xmllint-wasm).
//   2. Reglas del Anexo 20 que un XSD no puede expresar: RFC vs. régimen,
//      uso del CFDI permitido para el régimen, público en general y que las
//      cuentas (importes, IVA, subtotal, total) cuadren.
import { readFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'
import {
  PATRON_RFC, REGIMENES, RFC_EXTRANJERO, RFC_PUBLICO_GENERAL, TASA_IVA, USOS_CFDI, nombreTipoRfc, tipoRfc,
} from './catalogos.js'
import { VERSION_CFDI, dinero2 } from './generar.js'

const ESQUEMA = readFileSync(new URL('./esquema/cfdi.xsd', import.meta.url), 'utf8')

export async function validarXsd(xml) {
  const r = await validateXML({
    xml: [{ fileName: 'prefactura.xml', contents: xml }],
    schema: [{ fileName: 'cfdi.xsd', contents: ESQUEMA }],
  })
  return r.valid ? [] : r.errors.map((e) => `XSD: ${e.message.trim()}`)
}

// Límites del Anexo 20 para el importe de un traslado: el IVA tiene que caer
// entre (Base - ½ unidad del último decimal) × tasa y (Base + ½ unidad) × tasa.
// Con 6 decimales eso es ±0.0000005 × 0.16 alrededor del valor exacto.
function ivaDentroDeLimites(base, importe) {
  const inferior = Math.floor(((base - 0.5) * 16) / 100)
  const superior = Math.ceil(((base + 0.5) * 16) / 100)
  return importe >= inferior && importe <= superior
}

export function validarReglas(c) {
  const errores = []
  const err = (m) => errores.push(m)

  if (c.version !== VERSION_CFDI) err(`Version debe ser ${VERSION_CFDI}.`)

  // Emisor
  if (!PATRON_RFC.test(c.emisor.rfc)) err(`El RFC del emisor (${c.emisor.rfc}) no tiene un formato válido.`)
  const regEmisor = REGIMENES[c.emisor.regimen]
  if (!regEmisor) err(`El régimen fiscal del emisor (${c.emisor.regimen}) no está en el catálogo.`)
  else if (!regEmisor[tipoRfc(c.emisor.rfc)]) err(`El régimen ${c.emisor.regimen} no aplica a una persona ${nombreTipoRfc(c.emisor.rfc)}.`)

  // Receptor
  const r = c.receptor
  if (!PATRON_RFC.test(r.rfc)) err(`El RFC del receptor (${r.rfc}) no tiene un formato válido.`)
  if (!r.nombre) err('Falta el nombre o razón social del receptor.')
  if (!/^\d{5}$/.test(r.cp || '')) err('El código postal fiscal del receptor debe tener 5 dígitos.')
  const regReceptor = REGIMENES[r.regimen]
  if (!regReceptor) err(`El régimen fiscal del receptor (${r.regimen}) no está en el catálogo.`)
  else if (r.rfc !== RFC_PUBLICO_GENERAL && !regReceptor[tipoRfc(r.rfc)]) {
    err(`El régimen ${r.regimen} no aplica a una persona ${nombreTipoRfc(r.rfc)} (RFC de ${r.rfc.length} caracteres).`)
  }
  const uso = USOS_CFDI[r.uso]
  if (!uso) err(`El uso del CFDI (${r.uso}) no está en el catálogo.`)
  else if (!uso.regimenes.includes(r.regimen)) err(`El uso ${r.uso} no se permite con el régimen ${r.regimen}.`)

  if (r.rfc === RFC_PUBLICO_GENERAL) {
    if (r.nombre !== 'PUBLICO EN GENERAL') err('Con RFC genérico el nombre del receptor debe ser "PUBLICO EN GENERAL".')
    if (r.regimen !== '616' || r.uso !== 'S01') err('Con RFC genérico el régimen debe ser 616 y el uso S01.')
    if (r.cp !== c.lugarExpedicion) err('Con RFC genérico el domicilio fiscal debe ser el lugar de expedición.')
    if (!c.informacionGlobal) err('Con RFC genérico es obligatorio el nodo InformacionGlobal.')
  } else if (c.informacionGlobal) {
    err('InformacionGlobal solo se usa con el RFC genérico de público en general.')
  }
  if (r.rfc === RFC_EXTRANJERO) err('Las ventas al extranjero no están contempladas en la prefactura.')

  // Conceptos e impuestos (en millonésimas)
  if (!c.conceptos.length) err('El comprobante no tiene conceptos.')
  for (const [i, k] of c.conceptos.entries()) {
    const n = `Concepto ${i + 1} (${k.descripcion})`
    if (k.importe !== k.valorUnitario * k.cantidad) err(`${n}: Importe no es Cantidad × ValorUnitario.`)
    if (k.traslado.base !== k.importe) err(`${n}: la base del IVA debe ser igual al importe.`)
    if (k.traslado.tasa !== TASA_IVA) err(`${n}: la tasa de IVA debe ser ${TASA_IVA}.`)
    if (!ivaDentroDeLimites(k.traslado.base, k.traslado.importe)) err(`${n}: el IVA no corresponde al 16 % de la base.`)
  }
  const sumaImportes = c.conceptos.reduce((s, k) => s + k.importe, 0)
  const sumaIva = c.conceptos.reduce((s, k) => s + k.traslado.importe, 0)
  if (dinero2(c.subtotal) !== dinero2(sumaImportes)) err('SubTotal no es la suma de los importes de los conceptos.')
  if (dinero2(c.totalIva) !== dinero2(sumaIva)) err('TotalImpuestosTrasladados no es la suma del IVA de los conceptos.')
  if (c.total !== c.subtotal + c.totalIva) err('Total no es SubTotal + impuestos trasladados.')

  // Lo que se factura tiene que ser lo que se cobró.
  if (c.totalPedido !== undefined && dinero2(c.total) !== dinero2(c.totalPedido)) {
    err(`El total de la prefactura (${dinero2(c.total)}) no coincide con el total cobrado (${dinero2(c.totalPedido)}).`)
  }
  return errores
}

// Valida el XML y el comprobante; errores vacío = válida.
export async function validar(xml, comprobante) {
  return [...(await validarXsd(xml)), ...validarReglas(comprobante)]
}

// Datos fiscales que captura el cliente en su cuenta. Devuelve los datos
// normalizados o lanza un mensaje que se le puede mostrar.
export function normalizarDatosFiscales(d) {
  const rfc = String(d.rfc ?? '').trim().toUpperCase()
  const datos = {
    rfc,
    razonSocial: String(d.razonSocial ?? '').trim().toUpperCase().replace(/\s+/g, ' '),
    codigoPostal: String(d.codigoPostal ?? '').trim(),
    regimenFiscal: String(d.regimenFiscal ?? '').trim(),
    usoCfdi: String(d.usoCfdi ?? '').trim().toUpperCase(),
  }
  if (!PATRON_RFC.test(rfc)) throw new Error('El RFC no tiene un formato válido (12 caracteres para empresa, 13 para persona).')
  if (rfc === RFC_PUBLICO_GENERAL || rfc === RFC_EXTRANJERO) throw new Error('Usa tu RFC propio; el genérico se pone solo si no capturas datos.')
  if (!datos.razonSocial || datos.razonSocial.length > 254 || datos.razonSocial.includes('|')) {
    throw new Error('Escribe tu nombre o razón social tal como aparece en tu constancia de situación fiscal.')
  }
  if (!/^\d{5}$/.test(datos.codigoPostal)) throw new Error('El código postal fiscal debe tener 5 dígitos.')
  const regimen = REGIMENES[datos.regimenFiscal]
  if (!regimen) throw new Error('Elige un régimen fiscal del catálogo.')
  if (!regimen[tipoRfc(rfc)]) throw new Error(`El régimen ${datos.regimenFiscal} no aplica a una persona ${nombreTipoRfc(rfc)}.`)
  const uso = USOS_CFDI[datos.usoCfdi]
  if (!uso) throw new Error('Elige un uso del CFDI del catálogo.')
  if (!uso.regimenes.includes(datos.regimenFiscal)) throw new Error(`El uso ${datos.usoCfdi} no se permite con el régimen ${datos.regimenFiscal}.`)
  return datos
}
