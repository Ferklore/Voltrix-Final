// Bitácora de eventos (RNF6.2, colección "bitacora"). Cada evento:
//   { tipo, fecha, usuarioId, resumen, datos }
// Se borra sola a los 90 días (índice TTL en conexion.js).
// registrar() nunca lanza ni se espera: la bitácora no debe frenar ni tumbar
// lo que está registrando.
import { ObjectId } from 'mongodb'
import { coleccion } from './conexion.js'

export const TIPOS_EVENTO = [
  'PEDIDO_CREADO', 'PEDIDO_ESTADO', 'PAGO_APROBADO', 'PAGO_RECHAZADO',
  'PRODUCTO_CREADO', 'PRODUCTO_ACTUALIZADO', 'PRODUCTO_ELIMINADO',
  'REGISTRO', 'LOGIN_GOOGLE', 'LOGIN_FALLIDO', 'PASSWORD_RESTABLECIDO',
  'CORREO_ENVIADO', 'CORREO_FALLIDO', 'RESENA', 'RESPALDO_FALLIDO',
]

export function registrar(tipo, resumen, { usuarioId = null, datos = null } = {}) {
  ;(async () => {
    const col = await coleccion('bitacora')
    await col?.insertOne({ tipo, fecha: new Date(), usuarioId, resumen: String(resumen).slice(0, 300), datos })
  })().catch((err) => console.warn(`[bitacora] no se guardó ${tipo}: ${err.message}`))
}

// Más recientes primero. antesDe = id del último evento de la página anterior.
export async function listarBitacora({ tipo, limite = 50, antesDe } = {}) {
  const col = await coleccion('bitacora')
  if (!col) return []
  const filtro = {}
  if (tipo) filtro.tipo = tipo
  if (antesDe && ObjectId.isValid(antesDe)) filtro._id = { $lt: new ObjectId(antesDe) }
  return col.find(filtro).sort({ _id: -1 }).limit(Math.min(Math.max(limite, 1), 200)).toArray()
}
