// Corazón para agregar o quitar un producto de la lista de deseos.
// Sin sesión, lleva al login y regresa a donde estaba.
import { useState } from 'react'
import { alternarDeseo, useDeseos } from '../lib/deseos.js'

export default function BotonDeseo({ productoId, nombre, conTexto = false }) {
  const { sesion, ids } = useDeseos()
  const [error, setError] = useState('')
  const activo = ids.has(String(productoId))

  const alClic = async () => {
    if (!sesion) {
      location.assign(`/login?siguiente=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    setError('')
    try {
      await alternarDeseo(productoId)
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    }
  }

  const etiqueta = activo ? `Quitar ${nombre} de mi lista de deseos` : `Agregar ${nombre} a mi lista de deseos`
  return (
    <>
      <button
        type="button"
        className={`boton-deseo${activo ? ' activo' : ''}${conTexto ? ' con-texto' : ''}`}
        aria-pressed={activo}
        aria-label={conTexto ? undefined : etiqueta}
        title={etiqueta}
        onClick={alClic}
        disabled={sesion === undefined}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2 0 3.4 1.1 4.2 2.3l1.2 1.6 1.2-1.6c.8-1.2 2.2-2.3 4.2-2.3 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"
            fill={activo ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {conTexto && <span>{activo ? 'En tu lista de deseos' : 'Agregar a mi lista'}</span>}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  )
}
