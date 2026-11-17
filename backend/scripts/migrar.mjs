// Corre en orden todas las migraciones de migraciones/ contra DATABASE_URL.
// Cada archivo va en su propia transacción y todos se pueden repetir sin daño.
//   npm run migrar
import { readdir, readFile } from 'node:fs/promises'
import { pool } from '../src/db.js'

const carpeta = new URL('../migraciones/', import.meta.url)
const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort()
const conn = await pool.connect()

try {
  for (const archivo of archivos) {
    const sql = await readFile(new URL(archivo, carpeta), 'utf8')
    await conn.query('BEGIN')
    await conn.query(sql)
    await conn.query('COMMIT')
    console.log(`✔ ${archivo}`)
  }
} catch (err) {
  await conn.query('ROLLBACK')
  console.error(`✘ ${err.message}`)
  process.exitCode = 1
} finally {
  conn.release()
  await pool.end()
}
