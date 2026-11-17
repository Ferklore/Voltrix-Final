// Descarga de la prefactura (RF5.3 y RF5.5):
//   GET /prefacturas/:pedidoId/xml   -> XML con estructura CFDI
//   GET /prefacturas/:pedidoId/pdf   -> representación impresa
// Con ?ver=1 el archivo se muestra en el navegador (para imprimir) en vez de
// descargarse. Pide "Authorization: Bearer"; solo el dueño del pedido o un ADMIN.
import { Router } from 'express'
import { bearer, usuarioDeToken } from '../auth.js'
import { pool } from '../db.js'
import { pdfPrefactura, prefacturaDe } from '../cfdi/index.js'

export const prefacturas = Router()

prefacturas.get('/:pedidoId/:formato', async (req, res) => {
  const { pedidoId, formato } = req.params
  if (!/^[1-9]\d{0,8}$/.test(pedidoId) || !['xml', 'pdf'].includes(formato)) {
    return res.status(404).json({ error: 'No encontrado.' })
  }
  const usuario = await usuarioDeToken(bearer(req.get('authorization')))
  if (!usuario) return res.status(401).json({ error: 'Inicia sesión para continuar.' })

  const { rows: [pedido] } = await pool.query('SELECT * FROM pedido WHERE id = $1', [pedidoId])
  // A quien no es dueño se le responde igual que si no existiera.
  if (!pedido || (pedido.usuario_id !== usuario.id && usuario.rol !== 'ADMIN')) {
    return res.status(404).json({ error: 'No encontramos ese pedido.' })
  }
  const prefactura = await prefacturaDe(pedido)
  if (!prefactura) {
    const error = pedido.status === 'CANCELADO'
      ? 'El pedido está cancelado; su prefactura ya no aplica.'
      : 'El pedido todavía no está pagado; aún no tiene prefactura.'
    return res.status(409).json({ error })
  }

  const nombre = `prefactura-${prefactura.serie}${prefactura.folio}.${formato}`
  res.set('Content-Disposition', `${req.query.ver ? 'inline' : 'attachment'}; filename="${nombre}"`)
  res.set('Cache-Control', 'private, no-store')
  if (formato === 'xml') return res.type('application/xml; charset=utf-8').send(prefactura.xml)
  const pdf = await pdfPrefactura(prefactura.datos, { valida: prefactura.valida, errores: prefactura.errores })
  res.type('application/pdf').send(pdf)
})
