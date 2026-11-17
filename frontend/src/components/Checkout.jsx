import { useEffect, useState } from 'react'
import { despachar, dinero, useCarrito } from '../lib/carrito.js'
import { gql, useSesion } from '../lib/sesion.js'
import PagarPedido from './PagarPedido.jsx'
import Mapa from './Mapa.jsx'
import DatosFiscales from './DatosFiscales.jsx'

const DIRECCION = `{ yo { id direccion { calle colonia ciudad estado codigoPostal lat lng } } }`

const CREAR_PEDIDO = `
  mutation ($items: [ItemPedidoInput!]!, $requiereFactura: Boolean) {
    crearPedido(items: $items, requiereFactura: $requiereFactura) { id total status fecha requiereFactura }
  }
`

export default function Checkout() {
  const sesion = useSesion()
  const { items, total } = useCarrito()
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')
  // undefined = cargando; null = no tiene dirección.
  const [direccion, setDireccion] = useState(undefined)
  // Factura opcional: si la pide, hacen falta sus datos fiscales.
  const [quiereFactura, setQuiereFactura] = useState(false)
  const [datosFiscales, setDatosFiscales] = useState(null)

  useEffect(() => {
    if (sesion === null) location.replace('/login?siguiente=/checkout')
  }, [sesion])

  const conSesion = Boolean(sesion)
  useEffect(() => {
    if (!conSesion) return
    gql(DIRECCION)
      .then((d) => setDireccion(d.yo.direccion))
      .catch(() => setDireccion(null))
  }, [conSesion])

  if (!sesion) return <p className="cargando">Cargando…</p>

  const confirmar = async () => {
    setEnviando(true)
    setError('')
    try {
      const { crearPedido } = await gql(CREAR_PEDIDO, {
        items: items.map((it) => ({ productoId: it.id, cantidad: it.cantidad })),
        requiereFactura: quiereFactura,
      })
      setPedido(crearPedido)
      despachar({ type: 'VACIAR' })
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos registrar tu pedido. Inténtalo de nuevo en unos minutos.')
    } finally {
      setEnviando(false)
    }
  }

  // Paso 2: el pedido ya existe (stock apartado) y falta pagarlo.
  if (pedido) {
    return (
      <section className="panel checkout-confirmado">
        <h1>Pedido #{pedido.id} registrado</h1>
        <p>Total: {dinero(pedido.total)}. Elige cómo quieres pagar:</p>
        {pedido.requiereFactura && <p className="form-alterno">Tu prefactura saldrá a tu nombre y la recibirás por correo al pagar.</p>}
        <PagarPedido pedidoId={pedido.id} total={pedido.total} email={sesion.usuario?.email} />
        <p className="aviso">
          Si prefieres pagar después, tu pedido queda apartado en <a href="/cuenta">Mis pedidos</a>.
        </p>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="panel vacio">
        <h1>No hay nada que pagar</h1>
        <a className="btn-primario" href="/">
          Ver productos
        </a>
      </section>
    )
  }

  return (
    <section>
      <h1>Confirmar pedido</h1>
      <p className="introduccion">A nombre de {sesion.usuario?.nombre} ({sesion.usuario?.email}).</p>
      <ul className="lista-carrito">
        {items.map((it) => (
          <li key={it.id} className="carrito-item">
            <span className="carrito-nombre">
              {it.nombre} × {it.cantidad}
            </span>
            <span className="carrito-subtotal">{dinero(it.precio * it.cantidad)}</span>
          </li>
        ))}
      </ul>
      <p className="carrito-total">Total a pagar: {dinero(total)}</p>
      <section className="panel envio">
        <h2>Enviar a</h2>
        {direccion === undefined ? (
          <p className="cargando">Cargando tu dirección…</p>
        ) : direccion === null ? (
          <p className="aviso">
            Necesitamos tu dirección para enviarte el pedido. <a href="/cuenta">Captúrala en Mi cuenta</a> y regresa aquí.
          </p>
        ) : (
          <>
            <p>
              {direccion.calle}, col. {direccion.colonia}, {direccion.ciudad}, {direccion.estado}, CP {direccion.codigoPostal}
              {' · '}<a href="/cuenta">Cambiar</a>
            </p>
            <Mapa lat={direccion.lat} lng={direccion.lng} alto={200} />
          </>
        )}
      </section>
      <section className="panel envio">
        <label className="filtro-check casilla-factura">
          <input type="checkbox" checked={quiereFactura} onChange={(e) => setQuiereFactura(e.target.checked)} />
          ¿Necesitas factura?
        </label>
        {quiereFactura ? (
          <DatosFiscales modo="checkout" onCambio={setDatosFiscales} />
        ) : (
          <p className="form-alterno">Si no la necesitas, tu comprobante sale a público en general.</p>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn-primario"
        type="button"
        disabled={enviando || !direccion || (quiereFactura && !datosFiscales)}
        onClick={confirmar}
      >
        {enviando ? 'Registrando pedido…' : 'Continuar al pago'}
      </button>
    </section>
  )
}
