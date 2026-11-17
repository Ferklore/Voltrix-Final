// Webhook de Mercado Pago: MP avisa que hubo movimiento en una orden.
// No se confía en el cuerpo: solo se toma el id y se consulta a MP con nuestro
// token (pagos/index.js). Así un aviso falso no puede marcar nada como pagado.
// Se configura en el panel de MP (Webhooks, evento "Order") con la URL HTTPS
// del backend publicado: https://<tu-backend>/webhooks/mercadopago
import { Router } from 'express'
import { notificacionMercadoPago } from '../pagos/index.js'

export const webhooks = Router()

webhooks.post('/mercadopago', async (req, res) => {
  // MP manda el aviso en el cuerpo ({ type: 'order', data: { id } }) o en la query (?type=order&data.id=...).
  const tipo = req.body?.type || req.query.type || req.query.topic
  const id = req.body?.data?.id || req.query['data.id'] || req.query.id
  // Se responde rápido; si MP no recibe 200/201 reintenta.
  res.sendStatus(200)
  if (tipo !== 'order' || !id) return
  try {
    await notificacionMercadoPago(String(id))
  } catch (err) {
    console.error('[webhook mercadopago]', err.message)
  }
})
