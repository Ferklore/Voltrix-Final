// MongoDB: datos de documentos, semiestructurados (SRS §4.3).
//   fichas    ficha técnica de cada producto (especificaciones distintas por categoría)
//   resenas   reseñas y calificaciones de los clientes
//   pedidos   documento de cada pedido: foto al crearlo + historial de estados
//   bitacora  eventos del sistema (se borran solos a los 90 días)
// PostgreSQL sigue siendo la fuente de verdad de usuarios, pedidos, pagos e
// inventario; aquí va lo que no necesita transacciones ni llaves foráneas.
//
// Sin MONGODB_URI la tienda funciona igual: estas funciones se apagan (fichas
// vacías, sin reseñas, bitácora que no guarda) y se avisa al arrancar.
import { MongoClient } from 'mongodb'

const URI = process.env.MONGODB_URI || ''
const NOMBRE_DB = process.env.MONGODB_DB || 'voltrix'
export const BITACORA_DIAS = 90

let cliente = null
let conectando = null

export const mongoConfigurado = () => Boolean(URI)

async function crearIndices(db) {
  await Promise.all([
    db.collection('fichas').createIndex({ productoId: 1 }, { unique: true }),
    db.collection('resenas').createIndex({ productoId: 1, usuarioId: 1 }, { unique: true }),
    db.collection('resenas').createIndex({ productoId: 1, fecha: -1 }),
    db.collection('pedidos').createIndex({ pedidoId: 1 }, { unique: true }),
    db.collection('pedidos').createIndex({ 'usuario.id': 1 }),
    // TTL: MongoDB borra solo los eventos con más de BITACORA_DIAS días.
    db.collection('bitacora').createIndex({ fecha: 1 }, { expireAfterSeconds: BITACORA_DIAS * 24 * 3600 }),
    db.collection('bitacora').createIndex({ tipo: 1, fecha: -1 }),
  ])
}

// La base, o null si no hay MONGODB_URI. Conecta una sola vez y reutiliza el
// cliente (el driver ya maneja su propio pool de conexiones).
export async function mongo() {
  if (!URI) return null
  if (cliente) return cliente.db(NOMBRE_DB)
  conectando ??= (async () => {
    const c = new MongoClient(URI, { serverSelectionTimeoutMS: 8000, appName: 'voltrix-backend' })
    await c.connect()
    await crearIndices(c.db(NOMBRE_DB))
    cliente = c
    return c
  })().finally(() => {
    conectando = null
  })
  return (await conectando).db(NOMBRE_DB)
}

// Tras un fallo de conexión no se reintenta durante 30 s, para que cada
// petición no espere el timeout completo mientras Mongo está caído.
let sinConexionHasta = 0

// Colección o null. Si Mongo no responde, no tumba la petición: avisa y sigue.
export async function coleccion(nombre) {
  if (Date.now() < sinConexionHasta) return null
  try {
    const db = await mongo()
    return db ? db.collection(nombre) : null
  } catch (err) {
    sinConexionHasta = Date.now() + 30_000
    console.warn(`[mongo] sin conexión, se reintenta en 30 s (${err.message})`)
    return null
  }
}

export async function cerrarMongo() {
  await cliente?.close()
  cliente = null
}
