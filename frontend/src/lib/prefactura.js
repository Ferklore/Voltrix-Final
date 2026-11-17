// Descarga de la prefactura (XML o PDF). La ruta pide el token en el
// encabezado Authorization, así que no basta un <a href>: se baja con fetch
// y se entrega al navegador como archivo (o se abre para imprimir).
import { API_URL } from './api.js'
import { tokenVigente } from './sesion.js'

export async function descargarPrefactura(pedidoId, formato, { imprimir = false } = {}) {
  // La ventana se abre antes del fetch: si se abre después, el navegador la
  // bloquea por no venir directo del clic.
  const ventana = imprimir ? window.open('', '_blank') : null
  try {
    const token = await tokenVigente()
    const res = await fetch(`${API_URL}/prefacturas/${pedidoId}/${formato}${imprimir ? '?ver=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      throw new Error(error || 'No pudimos descargar la prefactura.')
    }
    const url = URL.createObjectURL(await res.blob())
    if (ventana) {
      ventana.location.href = url
    } else {
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1]
      const a = Object.assign(document.createElement('a'), { href: url, download: nombre || `prefactura-${pedidoId}.${formato}` })
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    ventana?.close()
    throw err
  }
}
