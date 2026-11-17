// Pago de un pedido PENDIENTE sin salir de la tienda: el cliente elige PayPal
// (botones con ventana emergente) o tarjeta con Mercado Pago (Card Payment Brick).
// El backend es quien cobra y confirma; aquí solo se muestra el resultado.
import { useEffect, useState } from 'react'
import { gql } from '../lib/sesion.js'
import PagoPaypal from './PagoPaypal.jsx'
import PagoTarjeta from './PagoTarjeta.jsx'

const METODOS = `{ metodosPago { paypal paypalClientId paypalMoneda mercadoPago mercadoPagoPublicKey } }`

// Una sola consulta de métodos aunque haya varios componentes en pantalla.
let metodosPromesa = null
const cargarMetodos = () =>
  (metodosPromesa ??= gql(METODOS)
    .then((d) => d.metodosPago)
    .catch((err) => {
      metodosPromesa = null
      throw err
    }))

const mensajeDeError = (err) =>
  err?.codigo ? err.message : 'No pudimos procesar el pago. Revisa tu conexión e inténtalo de nuevo.'

export default function PagarPedido({ pedidoId, total, email, onPagado }) {
  const [metodos, setMetodos] = useState(null)
  const [metodo, setMetodo] = useState('')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  // Cada intento rechazado vuelve a montar el formulario: el token de tarjeta es de un solo uso.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    cargarMetodos()
      .then((m) => {
        setMetodos(m)
        setMetodo(m.paypal ? 'PAYPAL' : m.mercadoPago ? 'MERCADOPAGO' : '')
      })
      .catch(() => setError('No pudimos cargar los métodos de pago.'))
  }, [])

  const terminar = (r) => {
    setError('')
    setResultado(r)
    if (r.estado === 'APROBADO') onPagado?.()
    if (r.estado === 'RECHAZADO') setIntento((n) => n + 1)
  }

  const elegir = (m) => {
    setMetodo(m)
    setResultado(null)
    setError('')
  }

  if (!metodos) {
    return error ? <p className="error">{error}</p> : <p className="cargando"><span className="spinner" /> Cargando métodos de pago…</p>
  }
  if (!metodos.paypal && !metodos.mercadoPago) {
    return <p className="aviso">Por ahora no hay métodos de pago disponibles. Tu pedido queda apartado.</p>
  }

  if (resultado?.estado === 'APROBADO') {
    return (
      <div className="pago-resultado" role="status">
        <h2>¡Pago recibido!</h2>
        <p>Te avisaremos cuando tu pedido salga a envío.</p>
      </div>
    )
  }
  if (resultado?.estado === 'PENDIENTE') {
    return (
      <div className="pago-resultado" role="status">
        <h2>Pago en revisión</h2>
        <p>{resultado.mensaje}</p>
      </div>
    )
  }

  return (
    <div className="pagar">
      {metodos.paypal && metodos.mercadoPago && (
        <div className="metodos-pago" role="group" aria-label="Método de pago">
          <button className="btn-pago btn-paypal" type="button" aria-pressed={metodo === 'PAYPAL'} onClick={() => elegir('PAYPAL')}>
            PayPal
          </button>
          <button className="btn-pago btn-mp" type="button" aria-pressed={metodo === 'MERCADOPAGO'} onClick={() => elegir('MERCADOPAGO')}>
            Tarjeta · Mercado Pago
          </button>
        </div>
      )}

      {resultado?.estado === 'RECHAZADO' && <p className="error" role="alert">{resultado.mensaje}</p>}
      {resultado?.estado === 'CANCELADO' && <p className="aviso">Cerraste la ventana de PayPal; no se hizo ningún cargo.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="pago-formulario">
        {metodo === 'PAYPAL' && (
          <PagoPaypal
            pedidoId={pedidoId}
            clientId={metodos.paypalClientId}
            moneda={metodos.paypalMoneda}
            onResultado={terminar}
            onError={(err) => setError(mensajeDeError(err))}
          />
        )}
        {metodo === 'MERCADOPAGO' && (
          <PagoTarjeta
            key={intento}
            pedidoId={pedidoId}
            total={total}
            email={email}
            publicKey={metodos.mercadoPagoPublicKey}
            onResultado={terminar}
            onError={(err) => setError(mensajeDeError(err))}
          />
        )}
      </div>
    </div>
  )
}
