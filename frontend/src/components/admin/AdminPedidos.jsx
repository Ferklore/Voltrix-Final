// Gestión de pedidos: filtrar por estado y moverlos (Pagado -> Enviado -> Entregado).
// En vivo: los pedidos nuevos, pagos y cambios de otros admins llegan solos.
import { useEffect, useState } from 'react'
import { dinero } from '../../lib/carrito.js'
import { gql } from '../../lib/sesion.js'
import { PEDIDO_CAMBIO, useSuscripcion } from '../../lib/vivo.js'
import { ESTADOS, PROVEEDORES } from './Resumen.jsx'
import { descargarPrefactura } from '../../lib/prefactura.js'

const CAMPOS = `id fecha total status
    usuario { nombre email }
    pagos { proveedor estado idTransaccion }
    prefactura { serie folio valida errores }
    historial { status fecha }
    detalles { id cantidad subtotal producto { nombre } }`
const PEDIDOS = `query ($status: StatusPedido) { pedidos(status: $status) { ${CAMPOS} } }`
const EN_VIVO = PEDIDO_CAMBIO(CAMPOS)
const CAMBIAR = `mutation ($id: ID!, $status: StatusPedido!) {
  cambiarStatusPedido(id: $id, status: $status) { id status }
}`

const piezas = (detalles) => {
  const n = detalles.reduce((s, d) => s + d.cantidad, 0)
  return `${n} ${n === 1 ? 'pieza' : 'piezas'}`
}

const statusDeUrl = () => {
  const s = new URLSearchParams(location.search).get('status')
  return ESTADOS[s] ? s : ''
}

export default function AdminPedidos() {
  const [filtro, setFiltro] = useState(statusDeUrl)
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState('')
  const [recientes, setRecientes] = useState(() => new Set())

  useSuscripcion(EN_VIVO, ({ pedidoCambio: { tipo, pedido } }) => {
    setPedidos((lista) => {
      if (!lista) return lista
      const sinEl = lista.filter((p) => p.id !== pedido.id)
      if (tipo === 'ELIMINADO' || (filtro && pedido.status !== filtro)) return sinEl
      // Mismo orden que la consulta: id descendente.
      return [...sinEl, pedido].sort((a, b) => b.id - a.id)
    })
    // Resalta la fila unos segundos para que se note el cambio.
    setRecientes((s) => new Set(s).add(pedido.id))
    setTimeout(() => setRecientes((s) => new Set([...s].filter((id) => id !== pedido.id))), 3000)
  })

  useEffect(() => {
    setPedidos(null)
    gql(PEDIDOS, { status: filtro || null })
      .then((d) => setPedidos(d.pedidos))
      .catch((err) => setError(err.message))
    // El filtro queda en la URL para poder compartir el enlace o recargar.
    history.replaceState(null, '', filtro ? `?status=${filtro}` : location.pathname)
  }, [filtro])

  const cambiar = async (pedido, status) => {
    if (status === 'CANCELADO' && !confirm(`¿Cancelar el pedido #${pedido.id}? Su stock vuelve al catálogo y ya no se puede reactivar.`)) return
    setError('')
    try {
      const { cambiarStatusPedido } = await gql(CAMBIAR, { id: pedido.id, status })
      setPedidos((lista) =>
        lista
          .map((p) => (p.id === pedido.id ? { ...p, status: cambiarStatusPedido.status } : p))
          // Si hay filtro y ya no coincide, sale de la lista.
          .filter((p) => !filtro || p.status === filtro)
      )
    } catch (err) {
      setError(err.message)
    }
  }

  const prefactura = (id, formato, opciones) => {
    setError('')
    descargarPrefactura(id, formato, opciones).catch((err) => setError(err.message))
  }

  return (
    <section>
      <div className="admin-bloque-cabecera">
        <h1>Pedidos</h1>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos</option>
          {Object.entries(ESTADOS).map(([valor, texto]) => (
            <option key={valor} value={valor}>{texto}</option>
          ))}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {!pedidos ? (
        <p className="cargando"><span className="spinner" /> Cargando pedidos…</p>
      ) : pedidos.length === 0 ? (
        <p className="panel vacio">No hay pedidos {filtro && `con estado "${ESTADOS[filtro]}"`}.</p>
      ) : (
        <div className="panel tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Artículos</th>
                <th>Pago</th>
                <th className="num">Total</th>
                <th>Prefactura</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const pagado = p.pagos.find((x) => x.estado === 'APROBADO')
                return (
                  <tr key={p.id} className={recientes.has(p.id) ? 'fila-reciente' : undefined}>
                    <td>{p.id}</td>
                    <td>{new Date(p.fecha + 'T12:00').toLocaleDateString('es-MX')}</td>
                    <td>
                      {p.usuario.nombre}
                      <br />
                      <small>{p.usuario.email}</small>
                    </td>
                    <td>
                      <details>
                        <summary>{piezas(p.detalles)}</summary>
                        <ul>
                          {p.detalles.map((d) => (
                            <li key={d.id}>{d.cantidad} × {d.producto.nombre}</li>
                          ))}
                        </ul>
                        {p.historial.length > 0 && (
                          <ol className="historial-pedido" aria-label="Historial de estados">
                            {p.historial.map((h, i) => (
                              <li key={i}>
                                {ESTADOS[h.status]} · {new Date(h.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                              </li>
                            ))}
                          </ol>
                        )}
                      </details>
                    </td>
                    <td>
                      {pagado ? (
                        <span title={`Transacción ${pagado.idTransaccion}`}>{PROVEEDORES[pagado.proveedor]}</span>
                      ) : (
                        <small>—</small>
                      )}
                    </td>
                    <td className="num">{dinero(p.total)}</td>
                    <td className="prefactura-acciones">
                      {p.prefactura ? (
                        <>
                          <small title={p.prefactura.errores.join('\n') || 'Validada contra XSD y catálogos'}>
                            {p.prefactura.serie}-{p.prefactura.folio} {p.prefactura.valida ? '✓' : '⚠'}
                          </small>
                          <button className="btn-texto" type="button" onClick={() => prefactura(p.id, 'pdf', { imprimir: true })}>Imprimir</button>
                          <button className="btn-texto" type="button" onClick={() => prefactura(p.id, 'pdf')}>PDF</button>
                          <button className="btn-texto" type="button" onClick={() => prefactura(p.id, 'xml')}>XML</button>
                        </>
                      ) : (
                        <small>—</small>
                      )}
                    </td>
                    <td>
                      <select
                        value={p.status}
                        disabled={p.status === 'CANCELADO'}
                        onChange={(e) => cambiar(p, e.target.value)}
                        aria-label={`Estado del pedido ${p.id}`}
                      >
                        {Object.entries(ESTADOS).map(([valor, texto]) => (
                          <option key={valor} value={valor}>{texto}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
