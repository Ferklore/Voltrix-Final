// CRUD de categorías (RF7.1). Una categoría con productos no se puede borrar:
// el backend responde CATEGORIA_CON_PRODUCTOS y aquí se muestra el mensaje.
import { useEffect, useState } from 'react'
import { gql } from '../../lib/sesion.js'

const CAMPOS = 'id nombre descripcion cantidadProductos'
const LISTA = `{ categorias { ${CAMPOS} } }`
const CREAR = `mutation ($datos: CategoriaInput!) { crearCategoria(datos: $datos) { ${CAMPOS} } }`
const ACTUALIZAR = `mutation ($id: ID!, $datos: CategoriaInput!) { actualizarCategoria(id: $id, datos: $datos) { ${CAMPOS} } }`
const ELIMINAR = `mutation ($id: ID!) { eliminarCategoria(id: $id) }`
const VACIA = { nombre: '', descripcion: '' }

export default function AdminCategorias() {
  const [categorias, setCategorias] = useState(null)
  const [editando, setEditando] = useState(null) // null = cerrado, 'nueva' o el id
  const [form, setForm] = useState(VACIA)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    gql(LISTA)
      .then((d) => setCategorias(d.categorias))
      .catch((err) => setError(err.message))
  }, [])

  const abrir = (c) => {
    setError('')
    setEditando(c ? c.id : 'nueva')
    setForm(c ? { nombre: c.nombre, descripcion: c.descripcion || '' } : VACIA)
  }

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const datos = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null }
    try {
      if (editando === 'nueva') {
        const { crearCategoria } = await gql(CREAR, { datos })
        setCategorias((l) => [...l, crearCategoria])
      } else {
        const { actualizarCategoria } = await gql(ACTUALIZAR, { id: editando, datos })
        setCategorias((l) => l.map((c) => (c.id === editando ? actualizarCategoria : c)))
      }
      setEditando(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return
    setError('')
    try {
      await gql(ELIMINAR, { id: c.id })
      setCategorias((l) => l.filter((x) => x.id !== c.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const campo = (nombre) => ({
    value: form[nombre],
    onChange: (e) => setForm((f) => ({ ...f, [nombre]: e.target.value })),
  })

  if (!categorias) {
    return error ? <p className="error">{error}</p> : <p className="cargando"><span className="spinner" /> Cargando categorías…</p>
  }

  return (
    <section>
      <div className="admin-bloque-cabecera">
        <h1>Categorías</h1>
        <button className="btn-primario" type="button" onClick={() => abrir(null)}>
          Nueva categoría
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {editando && (
        <form className="panel form-admin" onSubmit={guardar}>
          <h2>{editando === 'nueva' ? 'Nueva categoría' : `Editar categoría #${editando}`}</h2>
          <label>
            Nombre
            <input required maxLength={100} {...campo('nombre')} />
          </label>
          <label className="ancho">
            Descripción
            <input maxLength={255} {...campo('descripcion')} />
          </label>
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

      {categorias.length === 0 ? (
        <p className="panel vacio">Todavía no hay categorías.</p>
      ) : (
        <div className="panel tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th className="num">Productos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>
                    <a href={`/categoria/${c.id}`}>{c.nombre}</a>
                  </td>
                  <td>{c.descripcion || '—'}</td>
                  <td className="num">{c.cantidadProductos}</td>
                  <td className="tabla-acciones">
                    <button className="btn-texto" type="button" onClick={() => abrir(c)}>Editar</button>
                    <button
                      className="btn-texto"
                      type="button"
                      onClick={() => eliminar(c)}
                      title={c.cantidadProductos ? 'Tiene productos: muévelos a otra categoría antes' : undefined}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
