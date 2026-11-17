// Verificación del ID token de Google sin internet: firmamos tokens con una
// llave propia y se la damos a verificarTokenGoogle en lugar de las de Google.
//   node --test test/google.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'

process.env.DATABASE_URL ||= 'postgresql://prueba@localhost/prueba'
const { ErrorGoogle, verificarTokenGoogle } = await import('../src/google.js')

const CLIENT_ID = 'voltrix-prueba.apps.googleusercontent.com'
const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'llave-1', alg: 'RS256', use: 'sig' }
const llaves = createLocalJWKSet({ keys: [jwk] })
const otra = await generateKeyPair('RS256')

function firmar(payload, { clave = privateKey, aud = CLIENT_ID, iss = 'https://accounts.google.com', exp = '1h' } = {}) {
  return new SignJWT({ email_verified: true, ...payload })
    .setProtectedHeader({ alg: 'RS256', kid: 'llave-1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(payload.sub ?? '1234567890')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(clave)
}

const verificar = (t, opciones = {}) => verificarTokenGoogle(t, { llaves, clientId: CLIENT_ID, ...opciones })

test('token válido: devuelve sub, correo normalizado y nombre', async () => {
  const t = await firmar({ email: 'Ana.Lopez@Gmail.com', name: 'Ana López' })
  assert.deepEqual(await verificar(t), { sub: '1234567890', email: 'ana.lopez@gmail.com', nombre: 'Ana López' })
  // Sin nombre usa la parte de antes de la @. El emisor sin https también es válido.
  const t2 = await firmar({ email: 'beto@gmail.com' }, { iss: 'accounts.google.com' })
  assert.equal((await verificar(t2)).nombre, 'beto')
})

test('rechaza firma ajena, otro client id, otro emisor y tokens vencidos', async () => {
  const casos = [
    await firmar({ email: 'a@gmail.com' }, { clave: otra.privateKey }),
    await firmar({ email: 'a@gmail.com' }, { aud: 'otra-app.apps.googleusercontent.com' }),
    await firmar({ email: 'a@gmail.com' }, { iss: 'https://evil.example.com' }),
    await firmar({ email: 'a@gmail.com' }, { exp: Math.floor(Date.now() / 1000) - 60 }),
    'no.es.un.jwt',
  ]
  for (const t of casos) await assert.rejects(verificar(t), ErrorGoogle)
})

test('rechaza correo sin verificar o ausente', async () => {
  await assert.rejects(verificar(await firmar({ email: 'a@gmail.com', email_verified: false })), /no está verificado/)
  await assert.rejects(verificar(await firmar({})), /correo/)
})

test('sin GOOGLE_CLIENT_ID o sin token, error claro', async () => {
  await assert.rejects(verificar(await firmar({ email: 'a@gmail.com' }), { clientId: '' }), /no está configurado/)
  await assert.rejects(verificar(undefined), /Falta el token/)
  await assert.rejects(verificar('x'.repeat(5000)), /Falta el token/)
})
