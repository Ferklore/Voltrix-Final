// Servidor MCP por stdio, para clientes que lanzan el proceso (Claude Desktop).
//   node --env-file=.env scripts/mcp-stdio.mjs
// Con VOLTRIX_TOKEN=<access token> en el entorno, también expone los pedidos
// de ese usuario (y el inventario si es ADMIN).
//
// stdout es el canal del protocolo: cualquier console.log del resto del
// backend lo rompería, así que se manda a stderr.
console.log = console.error

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
const { usuarioDeToken } = await import('../src/auth.js')
const { crearServidorMcp } = await import('../src/mcp/servidor.js')

const usuario = process.env.VOLTRIX_TOKEN ? await usuarioDeToken(process.env.VOLTRIX_TOKEN) : null
if (process.env.VOLTRIX_TOKEN && !usuario) console.error('[mcp] VOLTRIX_TOKEN no es válido; solo herramientas públicas.')

await crearServidorMcp(usuario).connect(new StdioServerTransport())
console.error(`[mcp] Voltrix listo por stdio${usuario ? ` como ${usuario.email}` : ''}`)
