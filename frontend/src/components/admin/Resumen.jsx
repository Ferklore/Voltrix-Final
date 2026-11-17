// Portada del panel: indicadores (KPIs), ventas por día y alertas de stock.
// Se recalcula sola cuando llega un evento de pedido o producto.
import { useEffect, useRef, useState } from 'react'
import { dinero } from '../../lib/carrito.js'
import { gql } from '../../lib/sesion.js'
import { PEDIDO_CAMBIO, PRODUCTO_CAMBIO, useSuscripcion } from '../../lib/vivo.js'

const RESUMEN = `query ($dias: Int) {
  resumenAdmin(dias: $dias) {
    ventas pedidosVendidos ticketPromedio pendientesDePago porEnviar clientes
    porStatus { status pedidos monto }
    ventasPorDia { fecha pedidos monto }
    masVendidos { unidades monto producto { id nombre } }
    stockBajo { id nombre stock }
    porProveedor { proveedor pagos monto }
  }
}`

// Solo interesa saber que algo cambió: el resumen se vuelve a pedir completo.
const EN_PEDIDOS = PEDIDO_CAMBIO('id')
const EN_PRODUCTOS = PRODUCTO_CAMBIO('id')

export const ESTADOS = {
  PENDIENTE: 'Pendiente de pago',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}
export const PROVEEDORES = { PAYPAL: 'PayPal', MERCADOPAGO: 'Mercado Pago' }

const fechaCorta = (f) => new Date(f + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

export default function Resumen() {
  const [dias, setDias] = useState(14)
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    gql(RESUMEN, { dias })
      .then((d) => setR(d.resumenAdmin))
      .catch((err) => setError(err.message))
  }, [dias, version])

  // Un pedido mueve varios eventos juntos (pedido + stock de cada producto):
  // se espera medio segundo y se recarga una sola vez.
  const espera = useRef()
  const recargar = () => {
    clearTimeout(espera.current)
    espera.current = setTimeout(() => setVersion((v) => v + 1), 500)
  }
  useEffect(() => () => clearTimeout(espera.current), [])
  useSuscripcion(EN_PEDIDOS, recargar)
  useSuscripcion(EN_PRODUCTOS, recargar)

  if (error) return <p className="error">{error}</p>
  if (!r) return <p className="cargando"><span className="spinner" /> Cargando métricas…</p>

  const maximo = Math.max(1, ...r.ventasPorDia.map((d) => d.monto))
  const ventasVentana = r.ventasPorDia.reduce((s, d) => s + d.monto, 0)

  return (
    <section>
      <h1>Resumen</h1>

      <div className="kpis">
        <Kpi titulo="Ventas totales" valor={dinero(r.ventas)} nota={`${r.pedidosVendidos} pedidos pagados`} />
        <Kpi titulo="Ticket promedio" valor={dinero(r.ticketPromedio)} />
        <Kpi titulo="Por enviar" valor={r.porEnviar} nota="Pagados sin enviar" href="/admin/pedidos?status=PAGADO" />
        <Kpi titulo="Esperando pago" valor={r.pendientesDePago} href="/admin/pedidos?status=PENDIENTE" />
        <Kpi titulo="Clientes" valor={r.clientes} href="/admin/usuarios" />
      </div>

      <div className="panel admin-bloque">
        <div className="admin-bloque-cabecera">
          <h2>Ventas por día</h2>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Periodo">
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
          </select>
        </div>
        <p className="aviso">{dinero(ventasVentana)} en los últimos {dias} días</p>
        <div className="grafica" role="img" aria-label={`Ventas por día de los últimos ${dias} días`}>
          {r.ventasPorDia.map((d) => (
            <div key={d.fecha} className="grafica-col" title={`${fechaCorta(d.fecha)}: ${dinero(d.monto)} (${d.pedidos} pedidos)`}>
              <div className="grafica-barra" style={{ height: `${(d.monto / maximo) * 100}%` }} />
              <span className="grafica-etiqueta">{fechaCorta(d.fecha)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-columnas">
        <div className="panel admin-bloque">
          <h2>Pedidos por estado</h2>
          <ul className="admin-lista">
            {r.porStatus.map((s) => (
              <li key={s.status}>
                <a href={`/admin/pedidos?status=${s.status}`}>{ESTADOS[s.status]}</a>
                <span>{s.pedidos}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel admin-bloque">
          <h2>Cobrado por método</h2>
          {r.porProveedor.length === 0 ? (
            <p className="aviso">Todavía no hay pagos aprobados.</p>
          ) : (
            <ul className="admin-lista">
              {r.porProveedor.map((p) => (
                <li key={p.proveedor}>
                  <span>{PROVEEDORES[p.proveedor]} · {p.pagos} pagos</span>
                  <strong>{dinero(p.monto)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel admin-bloque">
          <h2>Más vendidos</h2>
          {r.masVendidos.length === 0 ? (
            <p className="aviso">Sin ventas todavía.</p>
          ) : (
            <ol className="admin-lista">
              {r.masVendidos.map((v) => (
                <li key={v.producto.id}>
                  <span>{v.producto.nombre}</span>
                  <span>{v.unidades} u.</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel admin-bloque">
          <h2>Stock bajo</h2>
          {r.stockBajo.length === 0 ? (
            <p className="aviso">Todo el catálogo tiene más de 5 piezas.</p>
          ) : (
            <ul className="admin-lista">
              {r.stockBajo.map((p) => (
                <li key={p.id}>
                  <a href="/admin/productos">{p.nombre}</a>
                  <span className={p.stock === 0 ? 'error' : undefined}>{p.stock === 0 ? 'Agotado' : p.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function Kpi({ titulo, valor, nota, href }) {
  const Etiqueta = href ? 'a' : 'div'
  return (
    <Etiqueta className="kpi" href={href}>
      <span className="kpi-titulo">{titulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {nota && <span className="kpi-nota">{nota}</span>}
    </Etiqueta>
  )
}
