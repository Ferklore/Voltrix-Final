// CRUD de productos con las mutaciones que ya tenía el backend
// (crearProducto, actualizarProducto, eliminarProducto). El stock se
// actualiza en vivo cuando alguien compra o se cancela un pedido.
import { useEffect, useRef, useState } from 'react'
import FichaEditor from './FichaEditor.jsx'
import { dinero } from '../../lib/carrito.js'
import { gql } from '../../lib/sesion.js'
import { PRODUCTO_CAMBIO, useSuscripcion } from '../../lib/vivo.js'

const DATOS = `{
  productos { id nombre precio precioAnterior claveProdServ imagen especificaciones stock categoria { id nombre } }
  categorias { id nombre }
  mongoDisponible
}`
const CAMPOS = 'id nombre precio precioAnterior claveProdServ imagen especificaciones stock categoria { id nombre }'
const CREAR = `mutation ($datos: ProductoInput!) { crearProducto(datos: $datos) { ${CAMPOS} } }`
const ACTUALIZAR = `mutation ($id: ID!, $datos: ProductoInput!) { actualizarProducto(id: $id, datos: $datos) { ${CAMPOS} } }`
const ELIMINAR = `mutation ($id: ID!) { eliminarProducto(id: $id) }`
const EN_VIVO = PRODUCTO_CAMBIO(CAMPOS)

const VACIO = { nombre: '', precio: '', precioAnterior: '', claveProdServ: '01010101', stock: '', categoriaId: '', imagen: '', especificaciones: '' }

export default function AdminProductos() {
  const [productos, setProductos] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [editando, setEditando] = useState(null) // null = cerrado, 'nuevo' o el id
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mongo, setMongo] = useState(false)
  const fichaRef = useRef(null)

  // También llegan los cambios hechos aquí mismo; reemplazar por id los deja igual.
  useSuscripcion(EN_VIVO, ({ productoCambio: { tipo, producto } }) => {
    setProductos((lista) => {
      if (!lista) return lista
      const sinEl = lista.filter((p) => p.id !== producto.id)
      return tipo === 'ELIMINADO' ? sinEl : [...sinEl, producto].sort((a, b) => a.id - b.id)
    })
  })

  useEffect(() => {
    gql(DATOS)
      .then((d) => {
        setProductos(d.productos)
        setCategorias(d.categorias)
        setMongo(d.mongoDisponible)
      })
      .catch((err) => setError(err.message))
  }, [])

  const abrir = (p) => {
    setError('')
    setEditando(p ? p.id : 'nuevo')
    setForm(
      p
        ? {
            nombre: p.nombre,
            precio: String(p.precio),
            precioAnterior: p.precioAnterior ? String(p.precioAnterior) : '',
            claveProdServ: p.claveProdServ,
            stock: String(p.stock),
            categoriaId: p.categoria?.id || '',
            imagen: p.imagen || '',
            especificaciones: p.especificaciones || '',
          }
        : VACIO
    )
  }

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const datos = {
      nombre: form.nombre.trim(),
      precio: Number(form.precio),
      precioAnterior: form.precioAnterior === '' ? null : Number(form.precioAnterior),
      claveProdServ: form.claveProdServ.trim() || null,
      stock: Number(form.stock),
      categoriaId: form.categoriaId || null,
      imagen: form.imagen.trim() || null,
      especificaciones: form.especificaciones.trim() || null,
    }
    try {
      let id = editando
      if (editando === 'nuevo') {
        const { crearProducto } = await gql(CREAR, { datos })
        setProductos((l) => [...l, crearProducto])
        id = crearProducto.id
      } else {
        const { actualizarProducto } = await gql(ACTUALIZAR, { id: editando, datos })
        setProductos((l) => l.map((p) => (p.id === editando ? actualizarProducto : p)))
      }
      // La ficha técnica vive en MongoDB y se guarda aparte, con el id ya conocido.
      await fichaRef.current?.guardar(id)
      setEditando(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return
    setError('')
    try {
      await gql(ELIMINAR, { id: p.id })
      setProductos((l) => l.filter((x) => x.id !== p.id))
    } catch (err) {
      setError(err.message) // p. ej. "El producto tiene pedidos; mejor deja su stock en 0."
    }
  }

  const campo = (nombre) => ({
    name: nombre,
    value: form[nombre],
    onChange: (e) => setForm((f) => ({ ...f, [nombre]: e.target.value })),
  })

  if (!productos) return error ? <p className="error">{error}</p> : <p className="cargando"><span className="spinner" /> Cargando productos…</p>

  return (
    <section>
      <div className="admin-bloque-cabecera">
        <h1>Productos</h1>
        <button className="btn-primario" type="button" onClick={() => abrir(null)}>
          Nuevo producto
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {editando && (
        <form className="panel form-admin" onSubmit={guardar}>
          <h2>{editando === 'nuevo' ? 'Nuevo producto' : `Editar producto #${editando}`}</h2>
          <label>
            Nombre
            <input required maxLength={150} {...campo('nombre')} />
          </label>
          <label>
            Precio (MXN)
            <input type="number" required min="0" step="0.01" {...campo('precio')} />
          </label>
          <label>
            Precio antes de oferta
            <input type="number" min="0" step="0.01" placeholder="Vacío = sin oferta" {...campo('precioAnterior')} />
          </label>
          <label>
            Stock
            <input type="number" required min="0" step="1" {...campo('stock')} />
          </label>
          <label>
            Categoría
            <select {...campo('categoriaId')}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Clave SAT (c_ClaveProdServ)
            <input required inputMode="numeric" pattern="\d{8}" maxLength={8} {...campo('claveProdServ')} />
          </label>
          <label className="ancho">
            Imagen (ruta en public/, p. ej. /productos/esp32.svg)
            <input maxLength={255} {...campo('imagen')} />
          </label>
          <label className="ancho">
            Especificaciones
            <input maxLength={255} {...campo('especificaciones')} />
          </label>
          <FichaEditor ref={fichaRef} productoId={editando === 'nuevo' ? null : editando} disponible={mongo} />
          <div className="ancho form-admin-acciones">
            <button className="btn-primario" type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="btn-texto" type="button" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="panel tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>
                  <a href={`/producto/${p.id}`}>{p.nombre}</a>
                </td>
                <td>{p.categoria?.nombre || '—'}</td>
                <td className="num">
                  {p.precioAnterior && <s className="precio-anterior">{dinero(p.precioAnterior)}</s>}
                  {dinero(p.precio)}
                </td>
                <td className={`num${p.stock <= 5 ? ' error' : ''}`}>{p.stock}</td>
                <td className="tabla-acciones">
                  <button className="btn-texto" type="button" onClick={() => abrir(p)}>Editar</button>
                  <button className="btn-texto" type="button" onClick={() => eliminar(p)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
