// Botones de PayPal (JS SDK). El cliente aprueba en una ventana emergente y
// nunca sale de la tienda. El backend crea la orden y, al aprobarla, la captura.
import { FUNDING, PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { gql } from '../lib/sesion.js'

const CREAR_ORDEN = `mutation ($pedidoId: ID!) { crearOrdenPaypal(pedidoId: $pedidoId) }`
const CAPTURAR = `mutation ($pedidoId: ID!, $referencia: String) {
  confirmarPago(pedidoId: $pedidoId, proveedor: PAYPAL, referencia: $referencia) { estado mensaje }
}`

export default function PagoPaypal({ pedidoId, clientId, moneda, onResultado, onError }) {
  const crearOrden = async () => (await gql(CREAR_ORDEN, { pedidoId })).crearOrdenPaypal

  const aprobar = async ({ orderID }) => {
    try {
      const { confirmarPago } = await gql(CAPTURAR, { pedidoId, referencia: orderID })
      onResultado(confirmarPago)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <PayPalScriptProvider options={{ clientId, currency: moneda, intent: 'capture', locale: 'es_MX' }}>
      <p className="aviso">Se abrirá una ventana de PayPal; al terminar regresas aquí mismo.</p>
      <PayPalButtons
        // Solo el botón de PayPal: la tarjeta se paga con Mercado Pago.
        fundingSource={FUNDING.PAYPAL}
        style={{ shape: 'pill', label: 'pay', height: 45 }}
        createOrder={crearOrden}
        onApprove={aprobar}
        onCancel={() => onResultado({ estado: 'CANCELADO' })}
        onError={onError}
      />
    </PayPalScriptProvider>
  )
}
