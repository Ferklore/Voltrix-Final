// Envío de correo transaccional con Resend (API REST, sin SDK).
// Sin RESEND_API_KEY el correo no sale: se escribe en la consola del backend
// (modo desarrollo), así todo el flujo se puede probar sin cuenta de Resend.
//
// Con la cuenta gratis de Resend y sin dominio propio, el remitente tiene que
// ser onboarding@resend.dev y solo se puede enviar al correo con el que te
// registraste en Resend. Para mandar a cualquier cliente hay que verificar un
// dominio en resend.com/domains y poner CORREO_REMITENTE con ese dominio.

import { registrar } from '../mongo/bitacora.js'

const API = 'https://api.resend.com/emails'
const CLAVE = process.env.RESEND_API_KEY || ''
const REMITENTE = process.env.CORREO_REMITENTE || 'Voltrix <onboarding@resend.dev>'

export const correoConfigurado = () => Boolean(CLAVE)

// Dirección pública de la tienda para los enlaces de los correos.
export const urlTienda = () =>
  (process.env.TIENDA_URL || (process.env.FRONTEND_URL || 'http://localhost:4321').split(',')[0]).trim().replace(/\/$/, '')

// mensaje: { para, asunto, html, texto, adjuntos: [{ nombre, contenido: Buffer|string }] }
// Devuelve { enviado, id } o { enviado: false, motivo }. Nunca lanza: un correo
// que falla no debe deshacer el pedido o el pago que lo provocó.
export async function enviarCorreo({ para, asunto, html, texto, adjuntos = [] }) {
  const destinatarios = [para].flat().filter(Boolean)
  if (!destinatarios.length) return { enviado: false, motivo: 'sin destinatario' }

  if (!CLAVE) {
    console.log(
      `\n[correo] (sin RESEND_API_KEY, no se envía) Para: ${destinatarios.join(', ')}\n` +
        `[correo] Asunto: ${asunto}\n` +
        (adjuntos.length ? `[correo] Adjuntos: ${adjuntos.map((a) => a.nombre).join(', ')}\n` : '') +
        `${texto}\n`
    )
    return { enviado: false, motivo: 'modo desarrollo' }
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: destinatarios,
        subject: asunto,
        html,
        text: texto,
        attachments: adjuntos.map((a) => ({
          filename: a.nombre,
          content: Buffer.from(a.contenido).toString('base64'),
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const cuerpo = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn(`[correo] Resend respondió ${res.status}: ${cuerpo.message || JSON.stringify(cuerpo)}`)
      registrar('CORREO_FALLIDO', `"${asunto}" no se envió: ${cuerpo.message || res.status}`, { datos: { para: destinatarios } })
      return { enviado: false, motivo: cuerpo.message || `HTTP ${res.status}` }
    }
    registrar('CORREO_ENVIADO', `"${asunto}"`, { datos: { para: destinatarios, id: cuerpo.id } })
    return { enviado: true, id: cuerpo.id }
  } catch (err) {
    console.warn(`[correo] no se pudo enviar "${asunto}": ${err.message}`)
    registrar('CORREO_FALLIDO', `"${asunto}" no se envió: ${err.message}`, { datos: { para: destinatarios } })
    return { enviado: false, motivo: err.message }
  }
}
