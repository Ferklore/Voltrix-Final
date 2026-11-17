// Recuperación de contraseña (RF1.3).
//   modo="pedir":       /recuperar   -> el cliente escribe su correo y recibe un enlace
//   modo="restablecer": /restablecer -> abre el enlace (?token=...) y elige la nueva
import { useState } from 'react'
import { API_URL } from '../lib/api.js'

async function enviar(ruta, cuerpo) {
  let res
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No pudimos conectar con la tienda. Revisa tu conexión.')
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error || 'No pudimos completar la operación.')
  return datos
}

export default function RecuperarPassword({ modo = 'pedir' }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState('')
  const restablecer = modo === 'restablecer'
  const token = restablecer ? new URLSearchParams(location.search).get('token') : null

  const alEnviar = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError('')
    if (restablecer && f.get('password') !== f.get('confirmar')) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    try {
      const { mensaje } = restablecer
        ? await enviar('/recuperar/restablecer', { token, password: f.get('password') })
        : await enviar('/recuperar', { email: f.get('email') })
      setListo(mensaje)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (restablecer && !token) {
    return (
      <section className="panel form">
        <h1>Enlace incompleto</h1>
        <p>Abre el enlace tal como llegó a tu correo o pide uno nuevo.</p>
        <a className="btn-primario" href="/recuperar">Pedir otro enlace</a>
      </section>
    )
  }

  if (listo) {
    return (
      <section className="panel form">
        <h1>{restablecer ? 'Contraseña actualizada' : 'Revisa tu correo'}</h1>
        <p role="status">{listo}</p>
        {restablecer
          ? <a className="btn-primario" href="/login">Iniciar sesión</a>
          : <p className="form-alterno">El enlace vence en 30 minutos. <a href="/login">Volver a iniciar sesión</a></p>}
      </section>
    )
  }

  return (
    <form className="panel form" onSubmit={alEnviar}>
      <h1>{restablecer ? 'Elige tu contraseña nueva' : '¿Olvidaste tu contraseña?'}</h1>
      {restablecer ? (
        <>
          <label>
            Contraseña nueva
            <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </label>
          <label>
            Repite la contraseña
            <input name="confirmar" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </label>
          <p className="form-alterno">Al cambiarla se cerrará tu sesión en todos tus dispositivos.</p>
        </>
      ) : (
        <>
          <p>Escribe el correo de tu cuenta y te mandamos un enlace para elegir una nueva.</p>
          <label>
            Correo
            <input name="email" type="email" required maxLength={150} autoComplete="email" />
          </label>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-primario" type="submit" disabled={enviando}>
        {enviando ? 'Un momento…' : restablecer ? 'Guardar contraseña' : 'Enviar enlace'}
      </button>
      {!restablecer && <p className="form-alterno"><a href="/login">Volver a iniciar sesión</a></p>}
    </form>
  )
}
