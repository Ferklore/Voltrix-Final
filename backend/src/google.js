// Inicio de sesión con Google ("Sign in with Google", Google Identity Services).
// El botón de Google, en el navegador, le entrega al front un ID token (JWT
// firmado por Google). Aquí se verifica la firma con las llaves públicas de
// Google, que sea para NUESTRO client id, que no haya vencido y que el correo
// esté verificado. Solo se necesita GOOGLE_CLIENT_ID (no hay secreto).
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { pool } from './db.js'
import { normalizarEmail } from './auth.js'

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
export const googleConfigurado = () => Boolean(GOOGLE_CLIENT_ID)

const EMISORES = ['https://accounts.google.com', 'accounts.google.com']
// jose guarda las llaves en caché y las vuelve a pedir cuando Google las rota.
const LLAVES_GOOGLE = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export class ErrorGoogle extends Error {}

// Devuelve { sub, email, nombre } o lanza ErrorGoogle. llaves y clientId se
// pueden cambiar en las pruebas (test/google.test.js firma con una llave propia).
export async function verificarTokenGoogle(credential, { llaves = LLAVES_GOOGLE, clientId = GOOGLE_CLIENT_ID } = {}) {
  if (!clientId) throw new ErrorGoogle('El inicio de sesión con Google no está configurado.')
  if (typeof credential !== 'string' || credential.length > 4096) throw new ErrorGoogle('Falta el token de Google.')
  let payload
  try {
    ;({ payload } = await jwtVerify(credential, llaves, { issuer: EMISORES, audience: clientId, algorithms: ['RS256'] }))
  } catch {
    throw new ErrorGoogle('Google no pudo confirmar tu identidad. Intenta de nuevo.')
  }
  if (!payload.sub || !payload.email) throw new ErrorGoogle('Google no compartió tu correo.')
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new ErrorGoogle('Tu correo de Google no está verificado.')
  }
  return {
    sub: String(payload.sub),
    email: normalizarEmail(payload.email),
    nombre: String(payload.name || payload.given_name || payload.email.split('@')[0]).trim().slice(0, 150),
  }
}

// Busca la cuenta por "sub"; si no, por correo (y la vincula); si no, la crea.
// Vincular por correo es seguro porque Google confirmó que el correo es suyo.
// Devuelve { usuario, nuevo }.
export async function usuarioDeGoogle({ sub, email, nombre }) {
  const conn = await pool.connect()
  try {
    await conn.query('BEGIN')
    let { rows: [usuario] } = await conn.query('SELECT id, nombre, email, rol FROM usuario WHERE google_sub = $1', [sub])
    let nuevo = false
    if (!usuario) {
      ;({ rows: [usuario] } = await conn.query(
        'UPDATE usuario SET google_sub = $1 WHERE email = $2 AND google_sub IS NULL RETURNING id, nombre, email, rol',
        [sub, email]
      ))
    }
    if (!usuario) {
      ;({ rows: [usuario] } = await conn.query(
        'INSERT INTO usuario (nombre, email, google_sub) VALUES ($1, $2, $3) RETURNING id, nombre, email, rol',
        [nombre, email, sub]
      ))
      nuevo = true
    }
    await conn.query('COMMIT')
    return { usuario, nuevo }
  } catch (err) {
    await conn.query('ROLLBACK')
    // El correo ya está ligado a OTRA cuenta de Google.
    if (err.code === '23505') throw new ErrorGoogle('Ese correo ya está ligado a otra cuenta de Google.')
    throw err
  } finally {
    conn.release()
  }
}
