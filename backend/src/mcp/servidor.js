// Servidor MCP (RF8.5): expone la tienda a asistentes (Claude, etc.) con el
// Model Context Protocol. Un asistente conectado puede buscar componentes, leer
// fichas técnicas, armar kits para un proyecto y, con el token del cliente,
// consultar sus pedidos.
//
//   Herramientas públicas: listar_categorias, buscar_productos, ver_producto,
//                          listar_kits, recomendar_kit
//   Con token de cliente:  mis_pedidos, estado_pedido
//   Solo ADMIN:            inventario_bajo
//   Recursos:              voltrix://categorias, voltrix://producto/{id}
//   Prompt:                armar_kit
//
// El mismo servidor se usa por HTTP (POST /mcp, rutas/mcp.js) y por stdio
// (scripts/mcp-stdio.mjs, para Claude Desktop).
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { pool } from '../db.js'
import { buscarProductos } from '../catalogo.js'
import { listarKits, recomendarKit } from '../kits/recomendador.js'
import { obtenerFicha } from '../mongo/fichas.js'
import { resumenResenas } from '../mongo/resenas.js'
import { STOCK_MINIMO } from '../correo/avisos.js'

const VERSION = '1.0.0'
const json = (datos) => ({ content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }] })
const falla = (mensaje) => ({ content: [{ type: 'text', text: mensaje }], isError: true })
const SOLO_LECTURA = { readOnlyHint: true, openWorldHint: false }

// Lo que ve el asistente de cada producto: corto y sin columnas internas.
const resumenProducto = (p) => ({
  id: p.id,
  nombre: p.nombre,
  precio: p.precio,
  ...(p.precio_anterior > p.precio && { precioAnterior: p.precio_anterior, enOferta: true }),
  stock: p.stock,
  categoria: p.categoria_nombre ?? undefined,
  especificaciones: p.especificaciones ?? undefined,
  vendidos: p.vendidos ?? undefined,
  url: `/producto/${p.id}`,
})

async function detalleProducto(id) {
  const { rows: [p] } = await pool.query(
    `SELECT p.*, c.nombre AS categoria_nombre FROM producto p LEFT JOIN categoria c ON c.id = p.categoria_id WHERE p.id = $1`,
    [id]
  )
  if (!p) return null
  const [ficha, calificacion] = await Promise.all([obtenerFicha(p.id), resumenResenas(p.id)])
  return {
    ...resumenProducto(p),
    fichaTecnica: ficha
      ? { especificaciones: ficha.especificaciones, datasheetUrl: ficha.datasheetUrl, descripcion: ficha.descripcion }
      : null,
    calificacion: calificacion.total ? { promedio: calificacion.promedio, reseñas: calificacion.total } : null,
  }
}

const categorias = async () =>
  (await pool.query(
    `SELECT c.id, c.nombre, c.descripcion, count(p.id)::int AS productos
       FROM categoria c LEFT JOIN producto p ON p.categoria_id = c.id GROUP BY c.id ORDER BY c.id`
  )).rows

// usuario: el dueño del token (o null). Se crea un servidor por petición, así
// las herramientas que se anuncian dependen de quién se conecta.
export function crearServidorMcp(usuario = null) {
  const server = new McpServer(
    { name: 'voltrix', title: 'Voltrix · componentes electrónicos', version: VERSION },
    {
      instructions:
        'Tienda en línea de componentes en México (precios en MXN, IVA incluido). ' +
        'Para recomendar componentes usa recomendar_kit y luego ver_producto para revisar fichas técnicas y compatibilidad. ' +
        'Solo recomienda productos con stock. No puedes comprar por el usuario: dale el enlace /producto/{id} para que lo agregue al carrito.',
    }
  )

  server.registerTool('listar_categorias', {
    title: 'Categorías',
    description: 'Categorías del catálogo con cuántos productos tiene cada una.',
    annotations: SOLO_LECTURA,
  }, async () => json(await categorias()))

  server.registerTool('buscar_productos', {
    title: 'Buscar productos',
    description: 'Busca en el catálogo. Cada palabra debe aparecer en el nombre, las especificaciones o la categoría.',
    inputSchema: {
      busqueda: z.string().max(100).optional().describe('Texto a buscar, p. ej. "esp32" o "ddr5 32gb"'),
      categoriaId: z.number().int().positive().optional().describe('Id de categoría (ver listar_categorias)'),
      soloOfertas: z.boolean().optional(),
      orden: z.enum(['NOMBRE', 'PRECIO_ASC', 'PRECIO_DESC', 'MAS_VENDIDOS', 'NUEVOS']).optional(),
      limite: z.number().int().min(1).max(25).default(10),
    },
    annotations: SOLO_LECTURA,
  }, async ({ busqueda, categoriaId, soloOfertas, orden, limite }) => {
    const filas = await buscarProductos({ busqueda, categoriaId, soloOfertas, orden, limite })
    const nombres = new Map((await categorias()).map((c) => [c.id, c.nombre]))
    return json(filas.map((p) => resumenProducto({ ...p, categoria_nombre: nombres.get(p.categoria_id) })))
  })

  server.registerTool('ver_producto', {
    title: 'Ver producto',
    description: 'Detalle de un producto: precio, stock, ficha técnica (especificaciones y datasheet) y calificación.',
    inputSchema: { id: z.number().int().positive() },
    annotations: SOLO_LECTURA,
  }, async ({ id }) => {
    const p = await detalleProducto(id)
    return p ? json(p) : falla(`No existe el producto ${id}.`)
  })

  server.registerTool('listar_kits', {
    title: 'Kits disponibles',
    description: 'Tipos de proyecto que el recomendador sabe armar y qué piezas lleva cada uno.',
    annotations: SOLO_LECTURA,
  }, async () => json(listarKits()))

  server.registerTool('recomendar_kit', {
    title: 'Recomendar kit',
    description:
      'Arma una lista de compra con productos en existencia para un proyecto. Da la descripción del proyecto ' +
      '(p. ej. "estación meteorológica con WiFi") o un kitId de listar_kits, y opcionalmente un presupuesto en MXN. ' +
      'Devuelve una opción por pieza con alternativas.',
    inputSchema: {
      proyecto: z.string().max(500).optional(),
      kitId: z.string().max(60).optional(),
      presupuesto: z.number().positive().optional().describe('Presupuesto máximo en MXN'),
    },
    annotations: SOLO_LECTURA,
  }, async ({ proyecto, kitId, presupuesto }) => {
    if (!proyecto?.trim() && !kitId) return falla('Da la descripción del proyecto o un kitId.')
    const r = await recomendarKit({ proyecto, kitId, presupuesto })
    if (!r.kit) return json({ ...r, kitsDisponibles: listarKits().map((k) => ({ id: k.id, nombre: k.nombre })) })
    return json({
      kit: r.kit,
      mensaje: r.mensaje,
      total: r.total,
      presupuesto: r.presupuesto,
      dentroDePresupuesto: r.dentroDePresupuesto,
      faltantes: r.faltantes,
      piezas: r.items.map((it) => ({
        rol: it.rol,
        cantidad: it.cantidad,
        opcional: it.opcional,
        producto: resumenProducto(it.producto),
        subtotal: it.subtotal,
        alternativas: it.alternativas.map((a) => ({ id: a.id, nombre: a.nombre, precio: a.precio, stock: a.stock })),
      })),
    })
  })

  // --- Con token de cliente ---
  if (usuario) {
    server.registerTool('mis_pedidos', {
      title: 'Mis pedidos',
      description: `Pedidos de ${usuario.nombre} (el dueño del token), más recientes primero.`,
      inputSchema: { limite: z.number().int().min(1).max(20).default(5) },
      annotations: SOLO_LECTURA,
    }, async ({ limite }) => {
      const { rows } = await pool.query(
        `SELECT p.id, p.fecha, p.total, p.status,
                json_agg(json_build_object('producto', pr.nombre, 'cantidad', d.cantidad, 'subtotal', d.subtotal) ORDER BY d.id) AS productos
           FROM pedido p JOIN detalle_pedido d ON d.pedido_id = p.id JOIN producto pr ON pr.id = d.producto_id
          WHERE p.usuario_id = $1 GROUP BY p.id ORDER BY p.id DESC LIMIT $2`,
        [usuario.id, limite]
      )
      return json(rows)
    })

    server.registerTool('estado_pedido', {
      title: 'Estado de un pedido',
      description: 'Estado, pago y productos de un pedido del dueño del token (un ADMIN puede ver cualquiera).',
      inputSchema: { pedidoId: z.number().int().positive() },
      annotations: SOLO_LECTURA,
    }, async ({ pedidoId }) => {
      const { rows: [p] } = await pool.query('SELECT id, fecha, total, status, usuario_id FROM pedido WHERE id = $1', [pedidoId])
      if (!p || (p.usuario_id !== usuario.id && usuario.rol !== 'ADMIN')) return falla(`No encontramos el pedido ${pedidoId}.`)
      const [{ rows: productos }, { rows: pagos }] = await Promise.all([
        pool.query(
          `SELECT pr.nombre AS producto, d.cantidad, d.subtotal FROM detalle_pedido d JOIN producto pr ON pr.id = d.producto_id
            WHERE d.pedido_id = $1 ORDER BY d.id`,
          [p.id]
        ),
        pool.query(`SELECT proveedor, estado, monto FROM pago WHERE pedido_id = $1 ORDER BY id DESC`, [p.id]),
      ])
      const { usuario_id, ...pedido } = p
      return json({ ...pedido, productos, pagos })
    })
  }

  // --- Solo ADMIN ---
  if (usuario?.rol === 'ADMIN') {
    server.registerTool('inventario_bajo', {
      title: 'Inventario bajo',
      description: 'Productos con pocas piezas en existencia.',
      inputSchema: { maximo: z.number().int().min(0).max(1000).default(STOCK_MINIMO).describe('Piezas o menos') },
      annotations: SOLO_LECTURA,
    }, async ({ maximo }) => {
      const { rows } = await pool.query('SELECT id, nombre, stock FROM producto WHERE stock <= $1 ORDER BY stock, id', [maximo])
      return json(rows)
    })
  }

  // --- Recursos ---
  server.registerResource('categorias', 'voltrix://categorias', {
    title: 'Categorías del catálogo',
    mimeType: 'application/json',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await categorias(), null, 2) }] }))

  server.registerResource('producto', new ResourceTemplate('voltrix://producto/{id}', { list: undefined }), {
    title: 'Producto',
    description: 'Ficha completa de un producto por id.',
    mimeType: 'application/json',
  }, async (uri, { id }) => {
    const p = /^\d{1,9}$/.test(String(id)) ? await detalleProducto(Number(id)) : null
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(p ?? { error: 'No existe' }, null, 2) }] }
  })

  // --- Prompt ---
  server.registerPrompt('armar_kit', {
    title: 'Armar un kit para mi proyecto',
    description: 'Pide al asistente que arme la lista de compra de un proyecto con productos de Voltrix.',
    argsSchema: {
      proyecto: z.string().describe('Qué quieres construir'),
      presupuesto: z.string().optional().describe('Presupuesto en MXN (opcional)'),
    },
  }, ({ proyecto, presupuesto }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text:
          `Quiero armar: ${proyecto}.${presupuesto ? ` Mi presupuesto es de $${presupuesto} MXN.` : ''}\n` +
          'Usa recomendar_kit para armar la lista con productos de Voltrix en existencia, revisa con ver_producto ' +
          'las fichas técnicas de las piezas principales para confirmar que son compatibles, y dame la lista final ' +
          'con precio, total y el enlace de cada producto. Si falta alguna pieza, dímelo.',
      },
    }],
  }))

  return server
}
