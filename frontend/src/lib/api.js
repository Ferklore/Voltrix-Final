// Cliente del backend. Lo usan las páginas en el servidor (catálogo) y
// sesion.js en el navegador (OAuth y GraphQL con token).
export const API_URL = (import.meta.env.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')

// Consulta GraphQL pública (sin token), para el catálogo que se dibuja en el servidor.
async function consulta(query, variables = {}) {
  let res
  try {
    res = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new Error(`No se pudo conectar con el backend en ${API_URL}. ¿Está corriendo?`)
  }
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const CAMPOS = 'id nombre precio precioAnterior descuento imagen stock'

export const categorias = async () => (await consulta('{ categorias { id nombre } }')).categorias

export const productos = async () => (await consulta(`{ productos { ${CAMPOS} } }`)).productos

// Búsqueda y filtros del catálogo (página /buscar y secciones de la portada).
export const buscarProductos = async ({ busqueda, categoriaId, soloOfertas, orden, limite } = {}) =>
  (
    await consulta(
      `query ($busqueda: String, $categoriaId: ID, $soloOfertas: Boolean, $orden: OrdenProductos, $limite: Int) {
        productos(busqueda: $busqueda, categoriaId: $categoriaId, soloOfertas: $soloOfertas, orden: $orden, limite: $limite) {
          ${CAMPOS} vendidos
        }
      }`,
      { busqueda: busqueda || null, categoriaId: categoriaId || null, soloOfertas: Boolean(soloOfertas), orden: orden || null, limite: limite || null }
    )
  ).productos

export const ORDENES = {
  '': 'Recomendados',
  MAS_VENDIDOS: 'Más vendidos',
  PRECIO_ASC: 'Precio: menor a mayor',
  PRECIO_DESC: 'Precio: mayor a menor',
  NOMBRE: 'Nombre (A-Z)',
  NUEVOS: 'Más nuevos',
}

// Categoría con sus productos en una sola petición.
export const categoria = async (id) =>
  (
    await consulta(
      `query ($id: ID!) { categoria(id: $id) { id nombre descripcion productos { ${CAMPOS} } } }`,
      { id }
    )
  ).categoria

export const producto = async (id) =>
  (
    await consulta(
      `query ($id: ID!) {
        producto(id: $id) {
          ${CAMPOS} especificaciones categoria { id nombre }
          ficha { especificaciones { nombre valor } datasheetUrl descripcion }
          calificacion { promedio total }
        }
      }`,
      { id }
    )
  ).producto

// Ids de la URL: solo enteros positivos, lo demás es 404.
export const idValido = (s) => (/^[1-9]\d{0,8}$/.test(s ?? '') ? Number(s) : null)
