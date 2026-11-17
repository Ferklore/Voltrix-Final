// Servidor MCP contra el backend corriendo (npm run dev), con un cliente MCP
// real del SDK oficial. Prueba HTTP (/mcp) y stdio (scripts/mcp-stdio.mjs).
//   BASE=http://localhost:4000 node --test test/mcp.test.js
// Los pedidos se prueban si existe MCP_EMAIL/MCP_PASSWORD (un cliente con pedidos).
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const BASE = process.env.BASE || 'http://localhost:4000'

async function conectar(token) {
  const client = new Client({ name: 'prueba-voltrix', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', BASE), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  })
  await client.connect(transport)
  return client
}

const datos = (r) => JSON.parse(r.content[0].text)

async function token(email, password) {
  const r = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 'voltrix-web', grant_type: 'password', username: email, password }),
  }).then((x) => x.json())
  return r.access_token
}

test('MCP por HTTP sin token: catálogo, kits, recursos y prompt', async () => {
  const c = await conectar()
  try {
    assert.equal(c.getServerVersion().name, 'voltrix')
    const herramientas = (await c.listTools()).tools.map((t) => t.name).sort()
    assert.deepEqual(herramientas, ['buscar_productos', 'listar_categorias', 'listar_kits', 'recomendar_kit', 'ver_producto'])

    const cats = datos(await c.callTool({ name: 'listar_categorias', arguments: {} }))
    assert.ok(cats.length > 0 && 'productos' in cats[0])

    const productos = datos(await c.callTool({ name: 'buscar_productos', arguments: { limite: 3, orden: 'PRECIO_ASC' } }))
    assert.ok(productos.length > 0 && productos.length <= 3)
    assert.ok(productos.every((p, i) => i === 0 || productos[i - 1].precio <= p.precio))

    const p = datos(await c.callTool({ name: 'ver_producto', arguments: { id: productos[0].id } }))
    assert.equal(p.id, productos[0].id)
    assert.ok('fichaTecnica' in p)
    assert.equal((await c.callTool({ name: 'ver_producto', arguments: { id: 999999 } })).isError, true)

    const kits = datos(await c.callTool({ name: 'listar_kits', arguments: {} }))
    assert.ok(kits.some((k) => k.id === 'estacion-meteorologica'))
    const sinNada = await c.callTool({ name: 'recomendar_kit', arguments: {} })
    assert.equal(sinNada.isError, true)
    const desconocido = datos(await c.callTool({ name: 'recomendar_kit', arguments: { proyecto: 'zzzz' } }))
    assert.equal(desconocido.kit, null)
    assert.ok(desconocido.kitsDisponibles.length > 0)

    // Validación de argumentos por el esquema (zod)
    const malo = await c.callTool({ name: 'buscar_productos', arguments: { limite: 500 } })
    assert.equal(malo.isError, true)

    const recurso = await c.readResource({ uri: 'voltrix://categorias' })
    assert.ok(JSON.parse(recurso.contents[0].text).length > 0)
    const prompt = await c.getPrompt({ name: 'armar_kit', arguments: { proyecto: 'un robot', presupuesto: '800' } })
    assert.match(prompt.messages[0].content.text, /robot.*\$800/s)
  } finally {
    await c.close()
  }
})

test('MCP por HTTP: token inválido es 401; con token salen los pedidos', async (t) => {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer no-sirve' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assert.equal(r.status, 401)
  assert.equal((await fetch(`${BASE}/mcp`)).status, 405)

  if (!process.env.MCP_EMAIL) return t.skip('sin MCP_EMAIL/MCP_PASSWORD')
  const c = await conectar(await token(process.env.MCP_EMAIL, process.env.MCP_PASSWORD))
  try {
    const nombres = (await c.listTools()).tools.map((x) => x.name)
    assert.ok(nombres.includes('mis_pedidos') && nombres.includes('estado_pedido'))
    const pedidos = datos(await c.callTool({ name: 'mis_pedidos', arguments: { limite: 2 } }))
    assert.ok(Array.isArray(pedidos))
    if (pedidos[0]) {
      const e = datos(await c.callTool({ name: 'estado_pedido', arguments: { pedidoId: pedidos[0].id } }))
      assert.equal(e.id, pedidos[0].id)
      assert.ok(!('usuario_id' in e))
    }
  } finally {
    await c.close()
  }
})

test('MCP por stdio (Claude Desktop)', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--env-file-if-exists=.env', 'scripts/mcp-stdio.mjs'],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stderr: 'ignore',
  })
  const c = new Client({ name: 'prueba-stdio', version: '1.0.0' })
  await c.connect(transport)
  try {
    const kits = datos(await c.callTool({ name: 'listar_kits', arguments: {} }))
    assert.ok(kits.length >= 5)
  } finally {
    await c.close()
  }
})
