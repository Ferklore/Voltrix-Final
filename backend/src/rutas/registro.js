// Alta de clientes con nombre, correo, contraseña y dirección física (RF1.1). Devuelve los tokens OAuth para dejar la sesión abierta.
import { Router } from 'express'
import { pool } from '../db.js'
import { emitirTokens, hashPassword, normalizarEmail, validarPasswordNueva } from '../auth.js'
import { normalizarDireccion } from '../direccion.js'
import { ubicacionParaGuardar } from '../mapas.js'
import { registrar } from '../mongo/bitacora.js'

export const registro = Router()

registro.post('/', async (req, res) => {
  const { nombre, email, password, direccion } = req.body ?? {}
  const correo = normalizarEmail(email)
  const nombreLimpio = String(nombre ?? '').trim()
  res.set('Cache-Control', 'no-store')

  if (!nombreLimpio || nombreLimpio.length > 150) return res.status(400).json({ error: 'Escribe tu nombre.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 150) {
    return res.status(400).json({ error: 'Escribe un correo válido.' })
  }
  const problema = validarPasswordNueva(password)
  if (problema) return res.status(400).json({ error: problema })
  let dir
  try {
    dir = normalizarDireccion(direccion)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO usuario (nombre, email, password, calle, colonia, ciudad, estado, codigo_postal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [nombreLimpio, correo, await hashPassword(password), dir.calle, dir.colonia, dir.ciudad, dir.estado, dir.codigoPostal]
    )
    registrar('REGISTRO', `Nueva cuenta: ${correo}`, { usuarioId: rows[0].id })
    ubicacionParaGuardar(dir)
      .then((u) => u && pool.query('UPDATE usuario SET lat = $1, lng = $2 WHERE id = $3', [u.lat, u.lng, rows[0].id]))
      .catch(() => {})
    res.status(201).json(await emitirTokens(rows[0].id))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya hay una cuenta con ese correo.' })
    throw err
  }
})
