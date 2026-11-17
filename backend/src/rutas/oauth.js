// Servidor de autorización OAuth 2.0 (RFC 6749): grants "password" (§4.3) y
// "refresh_token" (§6), más revocación (RFC 7009). Cliente público único: el front.
import { Router } from 'express'
import { autenticar, canjearRefresh, emitirTokens, normalizarEmail, revocar } from '../auth.js'
import { registrar } from '../mongo/bitacora.js'
import { ErrorGoogle, usuarioDeGoogle, verificarTokenGoogle } from '../google.js'

const CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'voltrix-web'

export const oauth = Router()

// Las respuestas con tokens no se guardan en caché (RFC 6749 §5.1).
const responder = (res, cuerpo, status = 200) =>
  res.status(status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(cuerpo)

const error = (res, codigo, descripcion, status = 400) =>
  responder(res, { error: codigo, error_description: descripcion }, status)

oauth.post('/token', async (req, res) => {
  if (!req.is('application/x-www-form-urlencoded')) {
    return error(res, 'invalid_request', 'Se espera application/x-www-form-urlencoded.')
  }
  const p = req.body ?? {}
  if (p.client_id !== CLIENT_ID) return error(res, 'invalid_client', 'Cliente desconocido.', 401)

  switch (p.grant_type) {
    case 'password': {
      if (!p.username || !p.password) return error(res, 'invalid_request', 'Faltan username o password.')
      const usuario = await autenticar(p.username, p.password)
      if (!usuario) {
        registrar('LOGIN_FALLIDO', `Intento fallido para ${normalizarEmail(p.username)}`, { datos: { ip: req.ip } })
        return error(res, 'invalid_grant', 'Correo o contraseña incorrectos.')
      }
      return responder(res, await emitirTokens(usuario.id))
    }
    case 'refresh_token': {
      const tokens = p.refresh_token && (await canjearRefresh(p.refresh_token))
      if (!tokens) return error(res, 'invalid_grant', 'La sesión expiró. Vuelve a iniciar sesión.')
      return responder(res, tokens)
    }
    default:
      return error(res, 'unsupported_grant_type', 'Usa grant_type=password o refresh_token.')
  }
})

// Inicio de sesión con Google: el front manda el ID token que le dio el botón
// de Google ({ credential }) y recibe nuestros tokens OAuth, igual que con
// contraseña. Si es la primera vez, se crea la cuenta (sin contraseña ni
// dirección: la captura en "Mi cuenta").
oauth.post('/google', async (req, res) => {
  const { credential, client_id } = req.body ?? {}
  if (client_id !== CLIENT_ID) return error(res, 'invalid_client', 'Cliente desconocido.', 401)
  let perfil
  try {
    perfil = await verificarTokenGoogle(credential)
  } catch (err) {
    if (err instanceof ErrorGoogle) return error(res, 'invalid_grant', err.message)
    throw err
  }
  let resultado
  try {
    resultado = await usuarioDeGoogle(perfil)
  } catch (err) {
    if (err instanceof ErrorGoogle) return error(res, 'invalid_grant', err.message)
    throw err
  }
  const { usuario, nuevo } = resultado
  registrar(nuevo ? 'REGISTRO' : 'LOGIN_GOOGLE', `${nuevo ? 'Nueva cuenta con Google' : 'Entró con Google'}: ${usuario.email}`, { usuarioId: usuario.id })
  return responder(res, { ...(await emitirTokens(usuario.id)), nuevo })
})

// Siempre responde 200, exista o no el token, para no revelar cuáles son válidos.
oauth.post('/revoke', async (req, res) => {
  const token = req.body?.token
  if (token) await revocar(String(token))
  res.status(200).end()
})
