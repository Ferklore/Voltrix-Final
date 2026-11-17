// Contenedor del admin dashboard: revisa que haya sesión de ADMIN y dibuja la
// navegación entre secciones. Ojo: esto solo esconde la interfaz; quien de
// verdad protege los datos es el backend (requiereAdmin en cada resolver).
import { useEffect } from 'react'
import { useSesion } from '../../lib/sesion.js'
import { useEstadoVivo } from '../../lib/vivo.js'
import Resumen from './Resumen.jsx'
import AdminPedidos from './AdminPedidos.jsx'
import AdminProductos from './AdminProductos.jsx'
import AdminCategorias from './AdminCategorias.jsx'
import AdminUsuarios from './AdminUsuarios.jsx'
import AdminBitacora from './AdminBitacora.jsx'

const SECCIONES = [
  { id: 'resumen', ruta: '/admin', titulo: 'Resumen', Componente: Resumen },
  { id: 'pedidos', ruta: '/admin/pedidos', titulo: 'Pedidos', Componente: AdminPedidos },
  { id: 'productos', ruta: '/admin/productos', titulo: 'Productos', Componente: AdminProductos },
  { id: 'categorias', ruta: '/admin/categorias', titulo: 'Categorías', Componente: AdminCategorias },
  { id: 'usuarios', ruta: '/admin/usuarios', titulo: 'Usuarios', Componente: AdminUsuarios },
  { id: 'bitacora', ruta: '/admin/bitacora', titulo: 'Bitácora', Componente: AdminBitacora },
]

export default function PanelAdmin({ seccion = 'resumen' }) {
  const sesion = useSesion()

  useEffect(() => {
    if (sesion === null) location.replace(`/login?siguiente=${encodeURIComponent(location.pathname)}`)
  }, [sesion])

  if (!sesion) return <p className="cargando">Cargando…</p>
  if (sesion.usuario?.rol !== 'ADMIN') {
    return (
      <section className="panel vacio">
        <h1>Solo para administradores</h1>
        <p>Tu cuenta no tiene permiso para ver el panel.</p>
        <a className="btn-primario" href="/">Volver a la tienda</a>
      </section>
    )
  }

  const actual = SECCIONES.find((s) => s.id === seccion) || SECCIONES[0]
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Panel de administración">
        <span className="admin-marca">Panel</span>
        {SECCIONES.map((s) => (
          <a key={s.id} href={s.ruta} aria-current={s.id === actual.id ? 'page' : undefined}>
            {s.titulo}
          </a>
        ))}
        <EstadoVivo />
      </nav>
      <actual.Componente />
    </div>
  )
}

const TEXTO_VIVO = { conectado: 'En vivo', conectando: 'Conectando…', desconectado: 'Sin conexión' }

// Indicador del WebSocket de las Subscriptions.
function EstadoVivo() {
  const estado = useEstadoVivo()
  return (
    <span className={`admin-vivo ${estado}`} role="status" title="Actualizaciones en tiempo real (GraphQL Subscriptions)">
      {TEXTO_VIVO[estado]}
    </span>
  )
}
