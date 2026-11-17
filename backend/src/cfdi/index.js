// Prefacturas guardadas en PostgreSQL: se generan cuando el pedido queda
// PAGADO (y, si faltara, la primera vez que alguien la pide). El XML se guarda
// tal cual salió, con los datos del receptor de ese momento; si el cliente
// cambia sus datos fiscales puede regenerarla.
import { GraphQLError } from 'graphql'
import { pool } from '../db.js'
import { armarComprobante, aXml, dinero2 } from './generar.js'
import { validar } from './validar.js'
import { pdfPrefactura } from './pdf.js'
import { cloudinaryConfigurado, subirArchivo } from '../cloudinary.js'
import { registrar } from '../mongo/bitacora.js'

export { pdfPrefactura } from './pdf.js'

const VENDIDO = ['PAGADO', 'ENVIADO', 'ENTREGADO']
const errorDeNegocio = (mensaje, code) => new GraphQLError(mensaje, { extensions: { code } })

// Genera (o vuelve a generar) la prefactura de un pedido pagado y la guarda.
export async function generarPrefactura(pedidoId) {
  const { rows: [pedido] } = await pool.query('SELECT * FROM pedido WHERE id = $1', [pedidoId])
  if (!pedido) throw errorDeNegocio('No encontramos ese pedido.', 'PEDIDO_NO_EXISTE')
  if (!VENDIDO.includes(pedido.status)) {
    throw errorDeNegocio('La prefactura se genera cuando el pedido ya está pagado.', 'PEDIDO_NO_PAGADO')
  }
  const [{ rows: renglones }, { rows: [usuario] }, { rows: [pago] }] = await Promise.all([
    pool.query(
      `SELECT d.producto_id AS "productoId", p.nombre, p.clave_prod_serv AS "claveProdServ", d.cantidad, d.subtotal
         FROM detalle_pedido d JOIN producto p ON p.id = d.producto_id
        WHERE d.pedido_id = $1 ORDER BY d.id`,
      [pedido.id]
    ),
    pool.query('SELECT rfc, razon_social, cp_fiscal, regimen_fiscal, uso_cfdi FROM usuario WHERE id = $1', [pedido.usuario_id]),
    pool.query(`SELECT proveedor FROM pago WHERE pedido_id = $1 AND estado = 'APROBADO' ORDER BY id DESC LIMIT 1`, [pedido.id]),
  ])

  const comprobante = armarComprobante({ pedido, renglones, usuario, proveedorPago: pago?.proveedor })
  const xml = aXml(comprobante)
  const errores = await validar(xml, comprobante)
  if (errores.length) console.warn(`[cfdi] prefactura del pedido ${pedido.id} con errores:`, errores)

  const { rows } = await pool.query(
    `INSERT INTO prefactura (pedido_id, serie, folio, fecha, receptor_rfc, subtotal, iva, total, xml, datos, valida, errores)
     VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (pedido_id) DO UPDATE SET
       serie = EXCLUDED.serie, folio = EXCLUDED.folio, fecha = now(), receptor_rfc = EXCLUDED.receptor_rfc,
       subtotal = EXCLUDED.subtotal, iva = EXCLUDED.iva, total = EXCLUDED.total, xml = EXCLUDED.xml,
       datos = EXCLUDED.datos, valida = EXCLUDED.valida, errores = EXCLUDED.errores
     RETURNING *`,
    [
      pedido.id, comprobante.serie, comprobante.folio, comprobante.receptor.rfc,
      dinero2(comprobante.subtotal), dinero2(comprobante.totalIva), dinero2(comprobante.total),
      xml, JSON.stringify(comprobante), errores.length === 0, JSON.stringify(errores),
    ]
  )
  respaldar(rows[0])
  return rows[0]
}

// Copia el XML y el PDF a Cloudinary como archivos privados. Sin esperar: si
// Cloudinary falla, la prefactura ya quedó guardada en PostgreSQL.
function respaldar(prefactura) {
  if (!cloudinaryConfigurado()) return
  const nombre = `prefactura-${prefactura.serie}${prefactura.folio}`
  ;(async () => {
    const pdf = await pdfPrefactura(prefactura.datos, prefactura)
    const [xml, archivoPdf] = await Promise.all([
      subirArchivo(prefactura.xml, { nombre: `${nombre}.xml`, carpeta: 'prefacturas', publicId: `${nombre}.xml` }),
      subirArchivo(pdf, { nombre: `${nombre}.pdf`, carpeta: 'prefacturas', publicId: `${nombre}.pdf` }),
    ])
    // Solo el public_id: la URL que devuelve Cloudinary trae una firma que
    // da acceso al archivo privado, así que no se guarda.
    // ponytail: para recuperar un respaldo hay que generar una URL firmada
    // con el API secret (o bajarlo desde el Media Library de Cloudinary).
    const sinUrl = ({ publicId, bytes }) => ({ publicId, bytes })
    const respaldo = { xml: sinUrl(xml), pdf: sinUrl(archivoPdf), fecha: new Date().toISOString() }
    await pool.query('UPDATE prefactura SET respaldo = $1 WHERE pedido_id = $2', [JSON.stringify(respaldo), prefactura.pedido_id])
  })().catch((err) => {
    console.warn(`[cloudinary] no se respaldó la prefactura del pedido ${prefactura.pedido_id}: ${err.message}`)
    registrar('RESPALDO_FALLIDO',`Prefactura del pedido #${prefactura.pedido_id}: ${err.message}`, { datos: { pedidoId: prefactura.pedido_id } })
  })
}

// La guardada o, si el pedido está pagado y todavía no tiene, la genera.
// null si el pedido no está pagado o se canceló (la prefactura ya no aplica).
export async function prefacturaDe(pedido) {
  if (!VENDIDO.includes(pedido.status)) return null
  const { rows } = await pool.query('SELECT * FROM prefactura WHERE pedido_id = $1', [pedido.id])
  if (rows[0]) return rows[0]
  return generarPrefactura(pedido.id)
}
