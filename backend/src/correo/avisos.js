// Correos que dispara la tienda. Se llaman DESPUÉS del COMMIT y sin await:
// el pedido o el pago ya quedó guardado aunque el correo falle.
import { pool } from '../db.js'
import { direccionDeFila } from '../direccion.js'
import { pdfPrefactura, prefacturaDe } from '../cfdi/index.js'
import { enviarCorreo, urlTienda } from './enviar.js'
import * as plantillas from './plantillas.js'

export const STOCK_MINIMO = Number(process.env.STOCK_MINIMO) || 5

const enSegundoPlano = (nombre, promesa) =>
  promesa.catch((err) => console.warn(`[correo] ${nombre}: ${err.message}`))

async function datosPedido(pedidoId) {
  const { rows: [pedido] } = await pool.query('SELECT * FROM pedido WHERE id = $1', [pedidoId])
  if (!pedido) return null
  const [{ rows: [usuario] }, { rows: detalles }] = await Promise.all([
    pool.query('SELECT id, nombre, email, calle, colonia, ciudad, estado, codigo_postal FROM usuario WHERE id = $1', [pedido.usuario_id]),
    pool.query(
      `SELECT d.cantidad, d.subtotal, p.nombre FROM detalle_pedido d JOIN producto p ON p.id = d.producto_id
        WHERE d.pedido_id = $1 ORDER BY d.id`,
      [pedido.id]
    ),
  ])
  return { pedido, usuario, detalles, direccion: direccionDeFila(usuario), url: urlTienda() }
}

// RF4.4: al confirmar el pedido.
export const avisarPedidoCreado = (pedidoId) =>
  enSegundoPlano('pedido creado', (async () => {
    const datos = await datosPedido(pedidoId)
    if (!datos) return
    await enviarCorreo({ para: datos.usuario.email, ...plantillas.pedidoCreado(datos) })
  })())

// Pago aprobado: correo con la prefactura adjunta (si se pudo generar).
export const avisarPagoConfirmado = (pedidoId, proveedor) =>
  enSegundoPlano('pago confirmado', (async () => {
    const datos = await datosPedido(pedidoId)
    if (!datos) return
    let adjuntos = []
    try {
      const prefactura = await prefacturaDe(datos.pedido)
      if (prefactura) {
        const nombre = `prefactura-${prefactura.serie}${prefactura.folio}`
        adjuntos = [
          { nombre: `${nombre}.pdf`, contenido: await pdfPrefactura(prefactura.datos, prefactura) },
          { nombre: `${nombre}.xml`, contenido: prefactura.xml },
        ]
      }
    } catch (err) {
      console.warn(`[correo] sin prefactura para el pedido ${pedidoId}: ${err.message}`)
    }
    await enviarCorreo({
      para: datos.usuario.email,
      ...plantillas.pagoConfirmado({ ...datos, proveedor, conPrefactura: adjuntos.length > 0 }),
      adjuntos,
    })
  })())

// RF6.2: avisa a los admins de los productos que ACABAN de cruzar el mínimo
// (antes tenían más). Así no llega un correo en cada venta de algo ya bajo.
// cambios: [{ id, antes, despues }]
export const avisarStockBajo = (cambios) =>
  enSegundoPlano('stock bajo', (async () => {
    const cruzaron = cambios.filter((c) => c.antes > STOCK_MINIMO && c.despues <= STOCK_MINIMO).map((c) => c.id)
    if (!cruzaron.length) return
    const [{ rows: productos }, { rows: admins }] = await Promise.all([
      pool.query('SELECT id, nombre, stock FROM producto WHERE id = ANY($1::int[]) ORDER BY stock, id', [cruzaron]),
      pool.query(`SELECT email FROM usuario WHERE rol = 'ADMIN'`),
    ])
    if (!admins.length) return
    await enviarCorreo({
      para: admins.map((a) => a.email),
      ...plantillas.stockBajo({ productos, minimo: STOCK_MINIMO, url: urlTienda() }),
    })
  })())
