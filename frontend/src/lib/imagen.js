// Imágenes de Cloudinary: se le pide al CDN la versión del tamaño justo y en
// el mejor formato que acepte el navegador (WebP/AVIF), en vez del original.
// Las rutas locales (/productos/x.svg) se devuelven igual.
export function urlImagen(url, ancho) {
  if (!url || !url.startsWith('https://res.cloudinary.com/')) return url
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${ancho}/`)
}

export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024

// Sube un archivo con la firma del backend (mutación firmarSubidaImagen).
// Devuelve la URL https de Cloudinary.
export async function subirImagen(archivo, firma) {
  if (!TIPOS_IMAGEN.includes(archivo.type)) throw new Error('Usa una imagen JPG, PNG, WebP o AVIF.')
  if (archivo.size > MAX_BYTES_IMAGEN) throw new Error('La imagen pesa más de 5 MB.')
  const form = new FormData()
  form.append('file', archivo)
  form.append('api_key', firma.apiKey)
  form.append('timestamp', String(firma.timestamp))
  form.append('folder', firma.folder)
  form.append('transformation', firma.transformation)
  form.append('signature', firma.signature)
  const res = await fetch(firma.url, { method: 'POST', body: form })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error?.message || 'Cloudinary rechazó la imagen.')
  return datos.secure_url
}
