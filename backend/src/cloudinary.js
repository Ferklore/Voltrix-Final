// Almacenamiento de archivos en Cloudinary (API de terceros, SRS §3.3):
//   - Imágenes de productos: el admin las sube DIRECTO del navegador a
//     Cloudinary con una firma que da el backend (el secreto nunca sale de aquí
//     y la imagen no pasa por nuestro servidor).
//   - Respaldo de prefacturas: el backend sube el XML y el PDF como archivos
//     privados ("authenticated"): no se pueden abrir con solo conocer la URL.
// Sin API REST de SDK: la firma es SHA-1 de los parámetros ordenados + secreto.
//
// Config: CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
// (la que muestra el Dashboard de Cloudinary). Sin ella todo esto se apaga.
import { createHash } from 'node:crypto'

function leerConfig() {
  const url = process.env.CLOUDINARY_URL || ''
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@([\w-]+)$/.exec(url.trim())
  return m ? { apiKey: m[1], apiSecret: m[2], cloudName: m[3] } : null
}
const CONFIG = leerConfig()

export const cloudinaryConfigurado = () => Boolean(CONFIG)
export const CARPETA = process.env.CLOUDINARY_CARPETA || 'voltrix'

// Firma de Cloudinary: parámetros (sin file, api_key, resource_type) en orden
// alfabético "a=1&b=2" + api_secret, SHA-1 en hexadecimal.
export function firmar(params, apiSecret = CONFIG?.apiSecret) {
  const cadena = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(cadena + apiSecret).digest('hex')
}

// Lo que necesita el navegador para subir UNA imagen de producto. La firma
// vale ~1 hora (Cloudinary rechaza timestamps viejos) y fija la carpeta y el
// tamaño máximo: el navegador no puede cambiarlos sin invalidarla.
export function firmaSubidaImagen() {
  if (!CONFIG) return null
  const params = {
    folder: `${CARPETA}/productos`,
    timestamp: Math.floor(Date.now() / 1000),
    transformation: 'c_limit,w_1600,h_1600', // no guarda originales gigantes
  }
  return {
    ...params,
    url: `https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/image/upload`,
    apiKey: CONFIG.apiKey,
    cloudName: CONFIG.cloudName,
    signature: firmar(params),
  }
}

// Sube un archivo desde el servidor. resourceType: image | raw (XML, PDF…).
export async function subirArchivo(contenido, { nombre, carpeta, publicId, resourceType = 'raw', tipo = 'authenticated' }) {
  if (!CONFIG) return null
  const params = {
    folder: `${CARPETA}/${carpeta}`,
    overwrite: 'true',
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    type: tipo,
  }
  const form = new FormData()
  for (const [k, v] of Object.entries(params)) form.append(k, String(v))
  form.append('api_key', CONFIG.apiKey)
  form.append('signature', firmar(params))
  form.append('file', new Blob([contenido]), nombre)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(cuerpo.error?.message || `Cloudinary respondió ${res.status}`)
  return { publicId: cuerpo.public_id, url: cuerpo.secure_url, bytes: cuerpo.bytes }
}

const MAX_BYTES_IMAGEN = 5 * 1024 * 1024

// Copia una imagen pública (p. ej. la de Mouser) a nuestra carpeta de
// productos. La descarga el backend y le entrega los bytes a Cloudinary:
// Mouser bloquea al descargador de Cloudinary (responde HTML), pero no a nosotros.
// permitida(url): el que llama decide de qué sitios se aceptan imágenes; se
// revisa también la URL final, por si hubo una redirección a otro sitio.
export async function copiarImagenRemota(url, permitida = () => false) {
  if (!CONFIG) return null
  if (!permitida(url)) throw new Error('origen de la imagen no permitido')
  const origen = await fetch(url, { headers: { Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  if (!permitida(origen.url)) throw new Error('la imagen redirige a un sitio no permitido')
  const tipo = origen.headers.get('content-type') || ''
  if (!origen.ok || !tipo.startsWith('image/')) throw new Error(`la imagen no se pudo descargar (${origen.status} ${tipo || 'sin tipo'})`)
  const bytes = Buffer.from(await origen.arrayBuffer())
  if (bytes.length > MAX_BYTES_IMAGEN) throw new Error('la imagen pesa más de 5 MB')

  const params = { folder: `${CARPETA}/productos`, timestamp: Math.floor(Date.now() / 1000), transformation: 'c_limit,w_1600,h_1600' }
  const form = new FormData()
  for (const [k, v] of Object.entries(params)) form.append(k, String(v))
  form.append('api_key', CONFIG.apiKey)
  form.append('signature', firmar(params))
  form.append('file', new Blob([bytes], { type: tipo }), 'mouser')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(cuerpo.error?.message || `Cloudinary respondió ${res.status}`)
  return cuerpo.secure_url
}

// Solo URLs nuestras o de Cloudinary para la imagen de un producto: evita
// guardar enlaces a sitios de terceros (rastreo) o esquemas raros.
export function imagenPermitida(url) {
  if (!url) return true
  if (url.startsWith('/') && !url.startsWith('//')) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com'
  } catch {
    return false
  }
}
