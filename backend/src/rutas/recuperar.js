// Recuperación de contraseña por correo (RF1.3).
//   POST /recuperar               { email }            -> manda el enlace
//   POST /recuperar/restablecer   { token, password }  -> pone la contraseña nueva
//
// - La respuesta de /recuperar es la misma exista o no el correo, para no
//   delatar qué cuentas están registradas.
// - El token es aleatorio (32 bytes), vence en 30 min, sirve una vez y en la
//   base solo se guarda su sha256.
// - Al cambiar la contraseña se cierran todas las sesiones abiertas (se
//   revocan sus tokens OAuth) y se quita el bloqueo por intentos fallidos.
import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db.js'
import { hashPassword, normalizarEmail, validarPasswordNueva } from '../auth.js'
import { enviarCorreo, urlTienda } from '../correo/enviar.js'
import { recuperarPassword } from '../correo/plantillas.js'
import { registrar } from '../mongo/bitacora.js'

export const recuperar = Router()

const MINUTOS = 30
// No más de un correo por minuto a la misma cuenta.
const ESPERA_SEG = 60
const MENSAJE = 'Si hay una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.'

const sha256 = (t) => createHash('sha256').update(t).digest('hex')

recuperar.post('/', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const correo = normalizarEmail(req.body?.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' })

  const { rows: [usuario] } = await pool.query('SELECT id, nombre, email FROM usuario WHERE email = $1', [correo])
  if (usuario) {
    const { rowCount: reciente } = await pool.query(
      'SELECT 1 FROM password_reset WHERE usuario_id = $1 AND creado > now() - make_interval(secs => $2)',
      [usuario.id, ESPERA_SEG]
    )
    if (!reciente) {
      const token = randomBytes(32).toString('base64url')
      // Un enlace nuevo invalida los anteriores; de paso se limpian los vencidos.
      await pool.query('DELETE FROM password_reset WHERE usuario_id = $1 OR expira < now()', [usuario.id])
      await pool.query(
        'INSERT INTO password_reset (hash, usuario_id, expira) VALUES ($1, $2, now() + make_interval(mins => $3))',
        [sha256(token), usuario.id, MINUTOS]
      )
      const enlace = `${urlTienda()}/restablecer?token=${encodeURIComponent(token)}`
      // Sin await: el tiempo de respuesta no debe delatar si la cuenta existe.
      enviarCorreo({ para: usuario.email, ...recuperarPassword({ usuario, enlace, minutos: MINUTOS }) })
    }
  }
  res.json({ mensaje: MENSAJE })
})

recuperar.post('/restablecer', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const { token, password } = req.body ?? {}
  if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'Falta el enlace de recuperación.' })
  const problema = validarPasswordNueva(password)
  if (problema) return res.status(400).json({ error: problema })

  const conn = await pool.connect()
  try {
    await conn.query('BEGIN')
    // DELETE ... RETURNING: el token se consume en el mismo paso, así dos
    // peticiones con el mismo enlace no pueden usarlo las dos.
    const { rows: [fila] } = await conn.query(
      'DELETE FROM password_reset WHERE hash = $1 AND expira > now() RETURNING usuario_id',
      [sha256(token)]
    )
    if (!fila) {
      await conn.query('ROLLBACK')
      return res.status(400).json({ error: 'El enlace ya no es válido o venció. Pide uno nuevo.' })
    }
    await conn.query(
      'UPDATE usuario SET password = $1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $2',
      [await hashPassword(password), fila.usuario_id]
    )
    await conn.query('DELETE FROM password_reset WHERE usuario_id = $1', [fila.usuario_id])
    await conn.query('DELETE FROM oauth_token WHERE usuario_id = $1', [fila.usuario_id])
    await conn.query('COMMIT')
    registrar('PASSWORD_RESTABLECIDO', 'Contraseña restablecida por correo', { usuarioId: fila.usuario_id })
    res.json({ mensaje: 'Listo, ya puedes iniciar sesión con tu contraseña nueva.' })
  } catch (err) {
    await conn.query('ROLLBACK')
    throw err
  } finally {
    conn.release()
  }
})
