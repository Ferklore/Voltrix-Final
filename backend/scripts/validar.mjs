// Validación estática del backend (primer paso del pipeline de CI):
//   1. Todos los .js/.mjs tienen sintaxis válida.
//   2. El esquema GraphQL (SDL) y los resolvers forman un esquema ejecutable:
//      tipos que existen, resolvers que corresponden a campos reales.
//   3. Cada migración está también en db.sql (una base nueva queda igual que
//      una migrada).
//   4. El XSD de la prefactura es XML bien formado.
// No necesita base de datos.
//   npm run validar
import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

process.env.DATABASE_URL ||= 'postgresql://validar@localhost/validar' // el pool no se conecta al importarse

const raiz = fileURLToPath(new URL('..', import.meta.url))
let errores = 0
const falla = (m) => {
  errores++
  console.error(`✘ ${m}`)
}

// 1. Sintaxis
async function archivos(dir) {
  const salida = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const ruta = join(dir, e.name)
    if (e.isDirectory()) salida.push(...(await archivos(ruta)))
    else if (/\.(m?js)$/.test(e.name)) salida.push(ruta)
  }
  return salida
}
const js = await archivos(raiz)
for (const f of js) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) falla(`sintaxis en ${relative(raiz, f)}\n${r.stderr}`)
}
console.log(`✔ sintaxis: ${js.length} archivos`)

// 2. Esquema GraphQL + resolvers
const { makeExecutableSchema } = await import('@graphql-tools/schema')
const { typeDefs } = await import('../src/graphql/schema.js')
const { resolvers } = await import('../src/graphql/resolvers.js')
try {
  const schema = makeExecutableSchema({ typeDefs, resolvers, resolverValidationOptions: { requireResolversToMatchSchema: 'error' } })
  console.log(`✔ GraphQL: ${Object.keys(schema.getQueryType().getFields()).length} consultas, ${Object.keys(schema.getMutationType().getFields()).length} mutaciones`)
} catch (err) {
  falla(`esquema GraphQL: ${err.message}`)
}

// 3. Migraciones reflejadas en db.sql
const dbSql = await readFile(join(raiz, 'db.sql'), 'utf8')
for (const m of (await readdir(join(raiz, 'migraciones'))).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = await readFile(join(raiz, 'migraciones', m), 'utf8')
  // Cada tabla o columna que agrega la migración debe aparecer en db.sql.
  const objetos = [...sql.matchAll(/(?:CREATE TABLE IF NOT EXISTS|ADD COLUMN IF NOT EXISTS)\s+(\w+)/g)].map((x) => x[1])
  const faltan = objetos.filter((o) => !new RegExp(`\\b${o}\\b`).test(dbSql))
  if (faltan.length) falla(`${m}: db.sql no tiene ${faltan.join(', ')}`)
}
console.log('✔ migraciones reflejadas en db.sql')

// 4. XSD de la prefactura
const { validateXML } = await import('xmllint-wasm')
const xsd = await readFile(join(raiz, 'src/cfdi/esquema/cfdi.xsd'), 'utf8')
const r = await validateXML({ xml: [{ fileName: 'cfdi.xsd', contents: xsd }], normalization: 'format' }).catch((e) => ({ valid: false, errors: [e] }))
if (r.errors?.length) falla(`cfdi.xsd mal formado: ${r.errors.map((e) => e.message ?? e).join('; ')}`)
else console.log('✔ cfdi.xsd bien formado')

if (errores) {
  console.error(`\n${errores} problema(s).`)
  process.exit(1)
}
console.log('\nTodo en orden.')
process.exit(0)
