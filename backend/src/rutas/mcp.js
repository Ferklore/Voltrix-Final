// Endpoint MCP por HTTP (transporte "Streamable HTTP" del protocolo), sin
// sesión: cada POST crea su servidor y su transporte, así escala igual que el
// resto de la API.
//   POST /mcp   con "Authorization: Bearer <access token>" opcional
// Sin token: herramientas públicas del catálogo. Con token de cliente: además
// sus pedidos. Con token de ADMIN: además inventario bajo.
import { Router } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { bearer, usuarioDeToken } from '../auth.js'
import { crearServidorMcp } from '../mcp/servidor.js'

export const mcp = Router()

const errorJsonRpc = (res, status, mensaje) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message: mensaje }, id: null })

mcp.post('/', async (req, res) => {
  const token = bearer(req.get('authorization'))
  const usuario = token ? await usuarioDeToken(token) : null
  // Un token que no sirve es un error (no se trata como anónimo), para que el
  // cliente sepa que tiene que renovarlo.
  if (token && !usuario) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"')
    return errorJsonRpc(res, 401, 'Token inválido o vencido.')
  }

  const server = crearServidorMcp(usuario)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// Sin sesión no hay stream de servidor (GET) ni sesión que cerrar (DELETE).
mcp.all('/', (_req, res) => {
  res.set('Allow', 'POST')
  errorJsonRpc(res, 405, 'Usa POST.')
})
