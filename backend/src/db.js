// Pool de PostgreSQL. La URL de la base (Neon) va en .env como DATABASE_URL.
import pg from 'pg'

// numeric llega como string para no perder precisión.
// ponytail: parseFloat alcanza para precios de tienda; con montos grandes,
// quitar este parser y calcular con decimal.js.
pg.types.setTypeParser(1700, parseFloat)       // numeric
pg.types.setTypeParser(1082, (fecha) => fecha) // date -> 'YYYY-MM-DD'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Falta DATABASE_URL en backend/.env')

// Un solo pool para todo el servidor. Con Neon conviene la URL con -pooler.
// keepAlive y el tiempo de espera evitan quedarse colgado cuando Neon "duerme".
export const pool = new pg.Pool({ connectionString, max: 10, keepAlive: true, connectionTimeoutMillis: 15_000 })

// Neon cierra conexiones inactivas; sin este manejador, ese error tumbaría el
// servidor. La conexión rota se descarta y la siguiente consulta abre otra.
pool.on('error', (err) => console.warn(`[db] conexión perdida con la base: ${err.message}`))

// true si la base ya tiene el esquema que espera el código (migraciones/ aplicadas).
export async function esquemaAlDia() {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'pago' AND column_name = 'proveedor'`
  )
  return rowCount > 0
}
