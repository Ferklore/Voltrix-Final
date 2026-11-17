// Usuarios registrados: cuántos pedidos tiene cada uno y su rol.
import { useEffect, useState } from 'react'
import { dinero } from '../../lib/carrito.js'
import { gql, useSesion } from '../../lib/sesion.js'

const USUARIOS = `{ usuarios { id nombre email rol pedidos { total status } } }`
const CAMBIAR_ROL = `mutation ($id: ID!, $rol: Rol!) { cambiarRol(id: $id, rol: $rol) { id rol } }`
const VENDIDO = new Set(['PAGADO', 'ENVIADO', 'ENTREGADO'])

export default function AdminUsuarios() {
  const sesion = useSesion()
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    gql(USUARIOS)
      .then((d) => setUsuarios(d.usuarios))
      .catch((err) => setError(err.message))
  }, [])

  const cambiarRol = async (u, rol) => {
    if (rol === 'ADMIN' && !confirm(`¿Dar permisos de administrador a ${u.nombre}?`)) return
    setError('')
    try {
      const { cambiarRol } = await gql(CAMBIAR_ROL, { id: u.id, rol })
      setUsuarios((l) => l.map((x) => (x.id === u.id ? { ...x, rol: cambiarRol.rol } : x)))
    } catch (err) {
      setError(err.message)
    }
  }

  if (!usuarios) return error ? <p className="error">{error}</p> : <p className="cargando"><span className="spinner" /> Cargando usuarios…</p>

  return (
    <section>
      <h1>Usuarios</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="panel tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th className="num">Pedidos</th>
              <th className="num">Ha comprado</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const yo = String(u.id) === String(sesion?.usuario?.id)
              return (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.nombre}{yo && <small> (tú)</small>}</td>
                  <td>{u.email}</td>
                  <td className="num">{u.pedidos.length}</td>
                  <td className="num">{dinero(u.pedidos.filter((p) => VENDIDO.has(p.status)).reduce((s, p) => s + p.total, 0))}</td>
                  <td>
                    <select
                      value={u.rol}
                      disabled={yo}
                      onChange={(e) => cambiarRol(u, e.target.value)}
                      aria-label={`Rol de ${u.nombre}`}
                    >
                      <option value="CLIENTE">Cliente</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
