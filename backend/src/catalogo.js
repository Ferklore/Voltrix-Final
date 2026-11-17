// Búsqueda del catálogo (RF2.2). La usan GraphQL (Query.productos) y el
// servidor MCP (herramienta buscar_productos).
import { pool } from './db.js'

const VENDIDO = `status IN ('PAGADO', 'ENVIADO', 'ENTREGADO')`
const varios = async (sql, params) => (await pool.query(sql, params)).rows

// Escapa los comodines de LIKE (\ % _) para buscar el texto tal cual.
const literalLike = (t) => t.replace(/[\\%_]/g, (c) => `\\${c}`)

export const ORDENES = {
  NOMBRE: 'p.nombre, p.id',
  PRECIO_ASC: 'p.precio, p.id',
  PRECIO_DESC: 'p.precio DESC, p.id',
  MAS_VENDIDOS: 'vendidos DESC, p.id',
  NUEVOS: 'p.id DESC',
}

// Catálogo con búsqueda y filtros (RF2.2). Cada palabra de la búsqueda tiene
// que aparecer en el nombre, las especificaciones o el nombre de la categoría.
// ponytail: ILIKE recorre la tabla; con miles de productos, índice pg_trgm o
// búsqueda de texto completo.
export async function buscarProductos({ busqueda, categoriaId, soloOfertas, orden, limite, desde }) {
  const condiciones = []
  const params = []
  const palabras = String(busqueda ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8)
  for (const palabra of palabras) {
    params.push(`%${literalLike(palabra)}%`)
    const n = `$${params.length}`
    condiciones.push(`(p.nombre ILIKE ${n} OR p.especificaciones ILIKE ${n} OR c.nombre ILIKE ${n})`)
  }
  if (categoriaId) {
    params.push(categoriaId)
    condiciones.push(`p.categoria_id = $${params.length}`)
  }
  if (soloOfertas) condiciones.push('p.precio_anterior > p.precio')

  let sql = `
    SELECT p.*, coalesce(v.vendidos, 0)::int AS vendidos
      FROM producto p
      LEFT JOIN categoria c ON c.id = p.categoria_id
      LEFT JOIN (SELECT d.producto_id, sum(d.cantidad) AS vendidos
                   FROM detalle_pedido d JOIN pedido pe ON pe.id = d.pedido_id AND pe.${VENDIDO}
                  GROUP BY d.producto_id) v ON v.producto_id = p.id
     ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
     ORDER BY ${ORDENES[orden] || 'p.id'}`
  if (limite) {
    params.push(Math.min(Math.max(limite, 1), 100), Math.max(desde || 0, 0))
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`
  }
  return varios(sql, params)
}
