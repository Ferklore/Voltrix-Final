// Representación impresa de la prefactura (RF5.3). Se dibuja con pdfkit a
// partir del mismo comprobante que generó el XML, así ambos dicen lo mismo.
import PDFDocument from 'pdfkit'
import { FORMAS_PAGO, METODOS_PAGO, REGIMENES, USOS_CFDI } from './catalogos.js'
import { dinero2, dinero6 } from './generar.js'

const AZUL = '#1d4ed8'
const GRIS = '#555555'
const moneda = (m) => `$${Number(dinero2(m)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const conClave = (clave, catalogo) => {
  const v = catalogo[clave]
  return `${clave} - ${typeof v === 'string' ? v : v?.descripcion ?? ''}`
}

export function pdfPrefactura(c, { valida = true, errores = [] } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: `Prefactura ${c.serie}-${c.folio}` } })
    const partes = []
    doc.on('data', (p) => partes.push(p))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    const ancho = doc.page.width - 80

    // Encabezado
    doc.fillColor(AZUL).fontSize(20).font('Helvetica-Bold').text('Voltrix', 40, 40)
    doc.fillColor(GRIS).fontSize(9).font('Helvetica').text('Componentes electrónicos')
    doc.fillColor('black').fontSize(14).font('Helvetica-Bold').text('PREFACTURA', 40, 40, { align: 'right' })
    doc.fontSize(9).font('Helvetica')
      .text(`Serie y folio: ${c.serie}-${c.folio}`, { align: 'right' })
      .text(`Fecha: ${c.fecha.replace('T', ' ')}`, { align: 'right' })
      .text(`CFDI versión ${c.version} · Tipo: I - Ingreso`, { align: 'right' })

    doc.moveDown(1.2)
    const aviso = 'Documento sin validez fiscal: no está sellado con CSD ni timbrado por un PAC.'
    doc.fillColor(valida ? GRIS : '#b91c1c').fontSize(8).text(valida ? aviso : `${aviso} La validación encontró errores.`, 40)

    // Emisor y receptor en dos columnas
    const y = doc.y + 10
    const col = (titulo, lineas, x) => {
      doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(9).text(titulo, x, y, { width: ancho / 2 - 10 })
      doc.fillColor('black').font('Helvetica').fontSize(8.5)
      for (const l of lineas) doc.text(l, x, doc.y, { width: ancho / 2 - 10 })
      return doc.y
    }
    const finEmisor = col('EMISOR', [
      c.emisor.nombre,
      `RFC: ${c.emisor.rfc}`,
      `Régimen: ${conClave(c.emisor.regimen, REGIMENES)}`,
      `Lugar de expedición (CP): ${c.lugarExpedicion}`,
    ], 40)
    const finReceptor = col('RECEPTOR', [
      c.receptor.nombre,
      `RFC: ${c.receptor.rfc}`,
      `Régimen: ${conClave(c.receptor.regimen, REGIMENES)}`,
      `Domicilio fiscal (CP): ${c.receptor.cp}`,
      `Uso del CFDI: ${conClave(c.receptor.uso, USOS_CFDI)}`,
    ], 40 + ancho / 2 + 10)
    doc.y = Math.max(finEmisor, finReceptor) + 14

    // Tabla de conceptos
    const columnas = [
      { t: 'Clave', w: 58 }, { t: 'Cant.', w: 34, a: 'right' }, { t: 'Unidad', w: 50 },
      { t: 'Descripción', w: 186 }, { t: 'Valor unit.', w: 72, a: 'right' },
      { t: 'IVA 16%', w: 66, a: 'right' }, { t: 'Importe', w: 66, a: 'right' },
    ]
    const fila = (valores, negrita = false) => {
      const yFila = doc.y
      let x = 40
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
      let alto = 0
      columnas.forEach((cdef, i) => {
        const h = doc.heightOfString(String(valores[i]), { width: cdef.w - 4 })
        doc.text(String(valores[i]), x + 2, yFila, { width: cdef.w - 4, align: cdef.a || 'left' })
        alto = Math.max(alto, h)
        x += cdef.w
      })
      doc.y = yFila + alto + 5
      doc.moveTo(40, doc.y - 2).lineTo(40 + ancho, doc.y - 2).strokeColor('#dddddd').stroke()
    }
    doc.fillColor(AZUL)
    fila(columnas.map((cd) => cd.t), true)
    doc.fillColor('black')
    for (const k of c.conceptos) {
      if (doc.y > doc.page.height - 160) doc.addPage()
      fila([
        k.claveProdServ, k.cantidad, `${k.claveUnidad} ${k.unidad}`, k.descripcion,
        `$${dinero6(k.valorUnitario)}`, `$${dinero6(k.traslado.importe)}`, `$${dinero6(k.importe)}`,
      ])
    }

    // Totales
    doc.moveDown(0.5)
    const totales = [['Subtotal', c.subtotal], ['IVA trasladado (16%)', c.totalIva], ['Total', c.total]]
    for (const [etiqueta, monto] of totales) {
      const final = etiqueta === 'Total'
      doc.font(final ? 'Helvetica-Bold' : 'Helvetica').fontSize(final ? 11 : 9)
      const yT = doc.y
      doc.text(etiqueta, 40 + ancho - 240, yT, { width: 140, align: 'right' })
      doc.text(`${moneda(monto)} ${c.moneda}`, 40 + ancho - 100, yT, { width: 100, align: 'right' })
    }

    doc.moveDown(1.5)
    doc.font('Helvetica').fontSize(8.5).fillColor('black')
      .text(`Forma de pago: ${conClave(c.formaPago, FORMAS_PAGO)}`, 40)
      .text(`Método de pago: ${conClave(c.metodoPago, METODOS_PAGO)}`)
      .text(`Moneda: ${c.moneda} · Exportación: 01 - No aplica`)
    if (c.informacionGlobal) {
      const g = c.informacionGlobal
      doc.text(`Información global: periodicidad ${g.periodicidad} (diaria), mes ${g.meses}, año ${g.anio}`)
    }

    if (!valida && errores.length) {
      doc.moveDown().fillColor('#b91c1c').font('Helvetica-Bold').text('Errores de validación:')
      doc.font('Helvetica')
      for (const e of errores) doc.text(`• ${e}`)
    }

    doc.fillColor(GRIS).fontSize(7.5)
      .text('Representación impresa de una prefactura con estructura CFDI (Anexo 20 del SAT).', 40, doc.page.height - 60, { width: ancho, align: 'center' })
    doc.end()
  })
}
