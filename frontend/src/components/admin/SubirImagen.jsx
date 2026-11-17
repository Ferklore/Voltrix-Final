// Campo de imagen del producto: vista previa, subir a Cloudinary (si el
// backend lo tiene configurado) o escribir una ruta de public/.
import { useState } from 'react'
import { gql } from '../../lib/sesion.js'
import { TIPOS_IMAGEN, subirImagen, urlImagen } from '../../lib/imagen.js'

const FIRMA = `mutation { firmarSubidaImagen { url apiKey cloudName folder timestamp transformation signature } }`

export default function SubirImagen({ valor, onChange, disponible }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const elegir = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!archivo) return
    setError('')
    setSubiendo(true)
    try {
      const { firmarSubidaImagen } = await gql(FIRMA)
      onChange(await subirImagen(archivo, firmarSubidaImagen))
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="ancho subir-imagen">
      <div className="subir-imagen-vista">
        {valor ? <img src={urlImagen(valor, 240)} alt="Vista previa" /> : <span>Sin imagen</span>}
      </div>
      <div className="subir-imagen-campos">
        <label>
          Imagen (ruta en public/ o URL de Cloudinary)
          <input maxLength={255} value={valor} onChange={(e) => onChange(e.target.value)} placeholder="/productos/esp32.svg" />
        </label>
        {disponible ? (
          <label className="btn-texto subir-imagen-boton">
            {subiendo ? 'Subiendo…' : 'Subir imagen'}
            <input type="file" accept={TIPOS_IMAGEN.join(',')} onChange={elegir} disabled={subiendo} hidden />
          </label>
        ) : (
          <small>Para subir imágenes configura CLOUDINARY_URL en el backend.</small>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
