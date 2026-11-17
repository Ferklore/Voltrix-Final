import { useEffect, useState } from 'react'
import { dinero } from '../lib/carrito.js'
import { gql, useSesion } from '../lib/sesion.js'
import PagarPedido from './PagarPedido.jsx'
import DatosFiscales from './DatosFiscales.jsx'
import Direccion from './Direccion.jsx'
import { descargarPrefactura } from '../lib/prefactura.js'

const MIS_PEDIDOS = `{
  yo {
    nombre
    email
    pedidos {
      id fecha total status
      pagos { proveedor estado }
      requiereFactura
      prefactura { serie folio valida receptorRfc }
      detalles { cantidad subtotal producto { id nombre } }
    }
  }
}`

const REGENERAR = `mutation ($id: ID!) { regenerarPrefactura(pedidoId: $id) { folio } }`
const FACTURAR = `mutation ($id: ID!) { facturarAMiNombre(pedidoId: $id) { folio } }`
const CANCELAR = `mutation ($id: ID!) { cancelarPedido(id: $id) { id } }`
const VERIFICAR_MP = `mutation ($id: ID!) { confirmarPago(pedidoId: $id, proveedor: MERCADOPAGO) { estado mensaje } }`
const PROVEEDORES = { PAYPAL: 'PayPal', MERCADOPAGO: 'Mercado Pago' }

const ESTADOS = {
  PENDIENTE: 'Pendiente de pago',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}

export default function Cuenta() {
  const sesion = useSesion()
  const [yo, setYo] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [recarga, setRecarga] = useState(0)
  // Solo un pedido a la vez muestra el formulario de pago.
  const [pagando, setPagando] = useState(null)
  const recargar = () => setRecarga((n) => n + 1)

  useEffect(() => {
    if (sesion === null) location.replace('/login?siguiente=/cuenta')
  }, [sesion])

  const conSesion = Boolean(sesion)
  useEffect(() => {
    if (!conSesion) return
    gql(MIS_PEDIDOS)
      .then((d) => setYo(d.yo))
      .catch(() => setError('No pudimos cargar tus pedidos.'))
  }, [conSesion, recarga])

  const cancelar = async (id) => {
    if (!confirm(`¿Cancelar el pedido #${id}? Los productos vuelven a la tienda.`)) return
    try {
      await gql(CANCELAR, { id })
      recargar()
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos cancelar el pedido.')
    }
  }

  // Un pago con tarjeta puede quedar "en revisión"; aquí se le vuelve a preguntar a MP.
  const verificar = async (id) => {
    setAviso('')
    try {
      const { confirmarPago } = await gql(VERIFICAR_MP, { id })
      if (confirmarPago.estado === 'APROBADO') recargar()
      else setAviso(confirmarPago.mensaje)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos verificar el pago.')
    }
  }

  const descargar = (id, formato) =>
    descargarPrefactura(id, formato).catch((err) => setError(err.message))

  // Pedido que salió a público en general -> pasarlo a su nombre; si ya era a
  // su nombre, regenerarlo con sus datos fiscales actuales.
  const facturar = async (p) => {
    setAviso('')
    try {
      await gql(p.requiereFactura ? REGENERAR : FACTURAR, { id: p.id })
      setAviso(`Prefactura del pedido #${p.id} generada a tu nombre con tus datos fiscales actuales.`)
      recargar()
    } catch (err) {
      // Sin datos fiscales: el mensaje del backend dice qué hacer.
      setAviso(err.codigo ? err.message : 'No pudimos generar la prefactura.')
    }
  }

  if (error) return <p className="error">{error}</p>
  if (!yo) return <p className="cargando">Cargando…</p>

  return (
    <section>
      <h1>Hola, {yo.nombre}</h1>
      <p className="introduccion">{yo.email}</p>
      <Direccion />
      <DatosFiscales />
      <h2>Mis pedidos</h2>
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {yo.pedidos.length === 0 ? (
        <p>
          Todavía no tienes pedidos. <a href="/">Ver productos</a>
        </p>
      ) : (
        <ul className="lista-carrito">
          {yo.pedidos.map((p) => (
            <li key={p.id} className="panel pedido">
              <div className="pedido-cabecera">
                <strong>Pedido #{p.id}</strong>
                <span>{new Date(p.fecha + 'T12:00').toLocaleDateString('es-MX', { dateStyle: 'long' })}</span>
                <span className="categoria-tag">{ESTADOS[p.status]}</span>
                <strong>{dinero(p.total)}</strong>
              </div>
              <ul className="pedido-detalles">
                {p.detalles.map((d) => (
                  <li key={d.producto.id}>
                    {d.cantidad} × <a href={`/producto/${d.producto.id}`}>{d.producto.nombre}</a> — {dinero(d.subtotal)}
                  </li>
                ))}
              </ul>
              {p.pagos.some((x) => x.estado === 'APROBADO') && (
                <p className="aviso">
                  Pagado con {PROVEEDORES[p.pagos.find((x) => x.estado === 'APROBADO').proveedor]}
                </p>
              )}
              {p.prefactura && (
                <div className="pedido-acciones">
                  <span>
                    Prefactura {p.prefactura.serie}-{p.prefactura.folio}
                    {p.prefactura.receptorRfc === 'XAXX010101000' ? ' (público en general)' : ` (RFC ${p.prefactura.receptorRfc})`}
                    {!p.prefactura.valida && ' — con errores de validación'}
                  </span>
                  <button className="btn-texto" type="button" onClick={() => descargar(p.id, 'pdf')}>Descargar PDF</button>
                  <button className="btn-texto" type="button" onClick={() => descargar(p.id, 'xml')}>Descargar XML</button>
                  <button className="btn-texto" type="button" onClick={() => facturar(p)}>
                    {p.requiereFactura ? 'Regenerar con mis datos' : 'Facturar a mi nombre'}
                  </button>
                </div>
              )}
              {p.status === 'PENDIENTE' && (
                <div className="pedido-acciones">
                  <button className="btn-texto" type="button" onClick={() => setPagando(pagando === p.id ? null : p.id)}>
                    {pagando === p.id ? 'Ocultar pago' : 'Pagar ahora'}
                  </button>
                  {p.pagos.some((x) => x.proveedor === 'MERCADOPAGO' && x.estado === 'PENDIENTE') && (
                    <button className="btn-texto" type="button" onClick={() => verificar(p.id)}>
                      Verificar pago en revisión
                    </button>
                  )}
                  <button className="btn-texto" type="button" onClick={() => cancelar(p.id)}>
                    Cancelar pedido
                  </button>
                  {pagando === p.id && (
                    <PagarPedido pedidoId={p.id} total={p.total} email={yo.email} onPagado={recargar} />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
