// Servidor del backend: Express con OAuth 2.0, registro y GraphQL (Apollo Server).
// Las Subscriptions viajan por WebSocket (graphql-ws) en la misma ruta /graphql.
import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import { unwrapResolverError } from '@apollo/server/errors'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'
import { GraphQLError } from 'graphql'
import { typeDefs } from './graphql/schema.js'
import { resolvers } from './graphql/resolvers.js'
import { bearer, usuarioDeToken } from './auth.js'
import { oauth } from './rutas/oauth.js'
import { registro } from './rutas/registro.js'
import { webhooks } from './rutas/webhooks.js'
import { prefacturas } from './rutas/prefacturas.js'
import { recuperar } from './rutas/recuperar.js'
import { mcp } from './rutas/mcp.js'
import { correoConfigurado } from './correo/enviar.js'
import { mongo, mongoConfigurado } from './mongo/conexion.js'
import { googleConfigurado } from './google.js'
import { proveedoresDisponibles } from './pagos/index.js'
import { esquemaAlDia } from './db.js'
import { MODO_PRUEBA } from './pagos/modo.js'

const PORT = Number(process.env.PORT) || 4000
// "voltrixf.netlify.app/", "https://voltrixf.netlify.app" -> https://voltrixf.netlify.app
// (el navegador manda el Origin sin "/" final; si no coincide exacto, CORS lo bloquea).
const normalizarOrigen = (s) => {
  const limpio = s.trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(limpio) ? limpio : `https://${limpio}`
}
const ORIGENES = (process.env.FRONTEND_URL || 'http://localhost:4321').split(',').filter((s) => s.trim()).map(normalizarOrigen)

const schema = makeExecutableSchema({ typeDefs, resolvers })
const app = express()
// Detrás del proxy de Render/Netlify: req.ip es la IP real del cliente (X-Forwarded-For).
app.set('trust proxy', 1)
const httpServer = createServer(app)

// WebSocket para Subscriptions. El token va en connectionParams.authorization
// (el navegador no deja mandar encabezados en un WebSocket) y se revisa en
// cada suscripción: el resolver decide si el usuario puede escucharla.
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' })
const wsLimpieza = useServer(
  {
    schema,
    context: async (ctx) => ({ usuario: await usuarioDeToken(bearer(ctx.connectionParams?.authorization)) }),
  },
  wsServer
)

const apollo = new ApolloServer({
  schema,
  // Al apagar: primero deja de aceptar HTTP y luego cierra los WebSocket.
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    { serverWillStart: async () => ({ drainServer: async () => wsLimpieza.dispose() }) },
  ],
  // En local muestra Apollo Sandbox en GET /graphql (para probar como admin).
  introspection: process.env.NODE_ENV !== 'production',
  includeStacktraceInErrorResponses: false,
  // Los errores de negocio (con código propio) pasan tal cual; los inesperados
  // se registran en consola y al cliente le llega un mensaje genérico.
  formatError: (formateado, error) => {
    const original = unwrapResolverError(error)
    if (original instanceof GraphQLError || formateado.extensions?.code !== 'INTERNAL_SERVER_ERROR') {
      return formateado
    }
    console.error(original)
    return { message: 'Error interno del servidor.' }
  },
})
await apollo.start()

// CORS: solo el front puede llamar a esta API desde el navegador.
app.use(cors({ origin: ORIGENES, exposedHeaders: ['Content-Disposition'] }))
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: false, limit: '10kb' }))

app.get('/', (_req, res) => res.json({ servicio: 'voltrix-backend', ok: true }))
app.use('/oauth', oauth)
app.use('/registro', registro)
app.use('/webhooks', webhooks)
app.use('/prefacturas', prefacturas)
app.use('/recuperar', recuperar)
app.use('/mcp', mcp)
app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => ({ usuario: await usuarioDeToken(bearer(req.get('authorization'))) }),
  })
)

// Errores no atrapados en las rutas REST.
app.use((err, _req, res, _next) => {
  console.error(err)
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' })
  res.status(500).json({ error: 'Error interno del servidor.' })
})

// Errores de listen (p. ej. puerto ocupado).
httpServer.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `El puerto ${PORT} ya está en uso. ¿Hay otro backend corriendo? Ciérralo o cambia PORT en .env.`
      : err
  )
  process.exit(1)
})

httpServer.listen(PORT, async () => {
  console.log(`Backend listo en http://localhost:${PORT}`)
  console.log(`GraphQL en http://localhost:${PORT}/graphql`)
  console.log(`Subscriptions en ws://localhost:${PORT}/graphql`)
  console.log(`MCP en http://localhost:${PORT}/mcp`)
  console.log(`CORS permitido para: ${ORIGENES.join(', ')}`)
  const { paypal, mercadoPago } = proveedoresDisponibles()
  console.log(`Pagos: PayPal ${paypal ? 'listo' : 'sin configurar'}, Mercado Pago ${mercadoPago ? 'listo' : 'sin configurar'}`)
  console.log(googleConfigurado() ? 'Login con Google: listo' : 'Login con Google: sin GOOGLE_CLIENT_ID (el botón no aparece)')
  console.log(correoConfigurado() ? 'Correo: Resend listo' : 'Correo: sin RESEND_API_KEY, los correos se muestran en esta consola')
  console.log(MODO_PRUEBA ? 'Modo de pagos: PRUEBA (no se cobra dinero real)' : '⚠ Modo de pagos: PRODUCCIÓN (cobros reales)')
  if (MODO_PRUEBA && paypal === false && process.env.PAYPAL_CLIENT_ID && !/sandbox/.test(process.env.PAYPAL_API || 'sandbox')) {
    console.warn('⚠ PayPal desactivado: PAYPAL_API no es el sandbox y la tienda está en modo prueba.')
  }
  if (process.env.MP_ACCESS_TOKEN && !process.env.MP_PUBLIC_KEY) {
    console.warn('⚠ Falta MP_PUBLIC_KEY en .env: sin ella no se puede dibujar el formulario de tarjeta de Mercado Pago.')
  }
  if (!mongoConfigurado()) {
    console.warn('⚠ Sin MONGODB_URI: fichas técnicas, reseñas, historial de pedidos y bitácora quedan apagados.')
  } else {
    mongo()
      .then(() => console.log('MongoDB: conectado'))
      .catch((err) => console.warn(`⚠ MongoDB no responde (${err.message}). Revisa MONGODB_URI y el acceso de red en Atlas.`))
  }
  // Solo es un aviso: si la base no responde ahora (Neon despertando, red), el
  // servidor sigue arriba y las consultas reintentan con conexiones nuevas.
  try {
    if (!(await esquemaAlDia())) {
      console.warn('⚠ La tabla "pago" no tiene el esquema actual: los pagos van a fallar. Corre: npm run migrar')
    }
  } catch (err) {
    console.warn(`⚠ No se pudo revisar la base al arrancar (${err.code || err.message}). Revisa DATABASE_URL o tu conexión.`)
  }
})
