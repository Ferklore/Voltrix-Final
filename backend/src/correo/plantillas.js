// Plantillas de los correos. Cada una devuelve { asunto, html, texto }: el
// texto plano es para clientes de correo sin HTML (y para la consola en desarrollo).
// Funciones puras: se prueban en test/correo.test.js.

const AZUL = '#1d4ed8'
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const dinero = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`

// Marco común: tablas y estilos en línea porque muchos clientes de correo
// ignoran <style> y flexbox.
function marco(titulo, cuerpoHtml) {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#e9ebf1;font-family:Arial,Helvetica,sans-serif;color:#222">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #eee">
  <span style="font-weight:bold;letter-spacing:3px;color:${AZUL}">VOLTRIX</span>
</td></tr>
<tr><td style="padding:24px 28px">
  <h1 style="margin:0 0 16px;font-size:20px">${esc(titulo)}</h1>
  ${cuerpoHtml}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eee;font-size:12px;color:#777">
  Voltrix · Componentes electrónicos. Este correo se envió automáticamente.
</td></tr>
</table></body></html>`
}

const boton = (url, texto) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background:${AZUL};color:#fff;text-decoration:none;border-radius:999px">${esc(texto)}</a></p>`

function tablaDetalles(detalles, total) {
  const filas = detalles
    .map(
      (d) => `<tr>
        <td style="padding:6px 0">${esc(d.cantidad)} × ${esc(d.nombre)}</td>
        <td style="padding:6px 0;text-align:right">${esc(dinero(d.subtotal))}</td>
      </tr>`
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
    ${filas}
    <tr><td style="padding:10px 0;border-top:1px solid #ddd;font-weight:bold">Total (IVA incluido)</td>
        <td style="padding:10px 0;border-top:1px solid #ddd;text-align:right;font-weight:bold">${esc(dinero(total))}</td></tr>
  </table>`
}

const textoDetalles = (detalles, total) =>
  detalles.map((d) => `  ${d.cantidad} x ${d.nombre} — ${dinero(d.subtotal)}`).join('\n') + `\n  Total: ${dinero(total)}`

const textoDireccion = (d) => (d ? `${d.calle}, col. ${d.colonia}, ${d.ciudad}, ${d.estado}, CP ${d.codigoPostal}` : null)

// RF4.4: pedido recibido (todavía pendiente de pago).
export function pedidoCreado({ pedido, usuario, detalles, direccion, url }) {
  const dir = textoDireccion(direccion)
  const asunto = `Recibimos tu pedido #${pedido.id}`
  const html = marco(asunto, `
    <p>Hola ${esc(usuario.nombre)}, registramos tu pedido. Está <strong>pendiente de pago</strong>: los productos quedan apartados mientras lo pagas.</p>
    ${tablaDetalles(detalles, pedido.total)}
    ${dir ? `<p style="font-size:14px;color:#555">Envío a: ${esc(dir)}</p>` : ''}
    ${boton(`${url}/cuenta`, 'Pagar mi pedido')}`)
  const texto = `Hola ${usuario.nombre}, registramos tu pedido #${pedido.id} (pendiente de pago).\n\n${textoDetalles(detalles, pedido.total)}\n` +
    (dir ? `\nEnvío a: ${dir}\n` : '') + `\nPágalo en ${url}/cuenta`
  return { asunto, html, texto }
}

// Pago confirmado; la prefactura va adjunta (XML y PDF).
export function pagoConfirmado({ pedido, usuario, detalles, direccion, proveedor, url, conPrefactura }) {
  const dir = textoDireccion(direccion)
  const metodo = { PAYPAL: 'PayPal', MERCADOPAGO: 'Mercado Pago' }[proveedor] || 'tu método de pago'
  const asunto = `Pago confirmado · pedido #${pedido.id}`
  const html = marco(asunto, `
    <p>Hola ${esc(usuario.nombre)}, recibimos tu pago con ${esc(metodo)}. Ya estamos preparando tu pedido.</p>
    ${tablaDetalles(detalles, pedido.total)}
    ${dir ? `<p style="font-size:14px;color:#555">Envío a: ${esc(dir)}</p>` : ''}
    ${conPrefactura ? '<p style="font-size:14px">Te adjuntamos tu prefactura en PDF y XML.</p>' : ''}
    ${boton(`${url}/cuenta`, 'Ver mi pedido')}`)
  const texto = `Hola ${usuario.nombre}, recibimos tu pago con ${metodo} del pedido #${pedido.id}.\n\n${textoDetalles(detalles, pedido.total)}\n` +
    (dir ? `\nEnvío a: ${dir}\n` : '') + (conPrefactura ? '\nAdjuntamos tu prefactura (PDF y XML).\n' : '') + `\nSíguelo en ${url}/cuenta`
  return { asunto, html, texto }
}

// RF1.3: enlace para elegir una contraseña nueva.
export function recuperarPassword({ usuario, enlace, minutos }) {
  const asunto = 'Restablece tu contraseña de Voltrix'
  const html = marco(asunto, `
    <p>Hola ${esc(usuario.nombre)}, alguien pidió restablecer la contraseña de tu cuenta.</p>
    ${boton(enlace, 'Elegir contraseña nueva')}
    <p style="font-size:14px;color:#555">El enlace sirve una sola vez y vence en ${esc(minutos)} minutos.
    Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>`)
  const texto = `Hola ${usuario.nombre}, para elegir una contraseña nueva abre:\n${enlace}\n\n` +
    `Sirve una vez y vence en ${minutos} minutos. Si no fuiste tú, ignora este correo.`
  return { asunto, html, texto }
}

// RF6.2: productos que bajaron del mínimo.
export function stockBajo({ productos, minimo, url }) {
  const asunto = productos.length === 1
    ? `Stock bajo: ${productos[0].nombre}`
    : `Stock bajo en ${productos.length} productos`
  const filas = productos
    .map((p) => `<tr><td style="padding:6px 0">${esc(p.nombre)}</td>
      <td style="padding:6px 0;text-align:right;font-weight:bold;color:${p.stock === 0 ? '#b91c1c' : '#222'}">${p.stock === 0 ? 'Agotado' : `${esc(p.stock)} pzas`}</td></tr>`)
    .join('')
  const html = marco(asunto, `
    <p>Estos productos quedaron en ${esc(minimo)} piezas o menos:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${filas}</table>
    ${boton(`${url}/admin/productos`, 'Revisar inventario')}`)
  const texto = `Productos con ${minimo} piezas o menos:\n` +
    productos.map((p) => `  ${p.nombre}: ${p.stock === 0 ? 'agotado' : `${p.stock} pzas`}`).join('\n') +
    `\n\nRevisa el inventario en ${url}/admin/productos`
  return { asunto, html, texto }
}
