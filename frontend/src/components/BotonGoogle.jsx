// Botón "Continuar con Google" (Google Identity Services). Google dibuja el
// botón y, al elegir la cuenta, nos da un ID token que el backend verifica en
// POST /oauth/google. Si el backend no tiene GOOGLE_CLIENT_ID, no se muestra.
import { useEffect, useRef, useState } from 'react'
import { gql, iniciarSesionConGoogle } from '../lib/sesion.js'

const SCRIPT = 'https://accounts.google.com/gsi/client'
let cargaScript = null

// El script de Google se carga una sola vez aunque haya varios botones.
function cargarGoogle() {
  cargaScript ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google)
    const s = Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true })
    s.onload = () => resolve(window.google)
    s.onerror = () => {
      cargaScript = null
      reject(new Error('No se pudo cargar Google.'))
    }
    document.head.append(s)
  })
  return cargaScript
}

// alEntrar(nuevo): se llama con la sesión ya abierta.
export default function BotonGoogle({ texto = 'continue_with', alEntrar }) {
  const contenedor = useRef(null)
  const [clientId, setClientId] = useState(null)
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    gql('{ googleClientId }').then((d) => setClientId(d.googleClientId)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientId) return
    let vivo = true
    cargarGoogle()
      .then((google) => {
        if (!vivo || !contenedor.current) return
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            setError('')
            setEntrando(true)
            try {
              alEntrar(await iniciarSesionConGoogle(credential))
            } catch (err) {
              setError(err.message)
              setEntrando(false)
            }
          },
        })
        google.accounts.id.renderButton(contenedor.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: texto,
          locale: 'es-419',
          width: contenedor.current.offsetWidth || 320,
        })
      })
      .catch((err) => setError(err.message))
    return () => {
      vivo = false
    }
  }, [clientId])

  if (!clientId) return null
  return (
    <div className="boton-google">
      <p className="separador"><span>o</span></p>
      <div ref={contenedor} aria-busy={entrando} />
      {entrando && <p className="cargando">Entrando con Google…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
