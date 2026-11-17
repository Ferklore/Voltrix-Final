// Formulario de tarjeta de Mercado Pago (Card Payment Brick, Checkout API).
// Los campos de la tarjeta son iframes de MP: nuestra página solo recibe un
// token de un solo uso y el backend cobra con él. El monto que se cobra sale
// del pedido en la base; el de aquí solo se muestra.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react'
import { gql } from '../lib/sesion.js'

const PAGAR = `mutation ($pedidoId: ID!, $tarjeta: TarjetaInput!) {
  pagarConTarjeta(pedidoId: $pedidoId, tarjeta: $tarjeta) { estado mensaje }
}`

// El SDK se inicia una sola vez por public key.
let iniciadoCon = null
function iniciar(publicKey) {
  if (iniciadoCon === publicKey) return
  initMercadoPago(publicKey, { locale: 'es-MX' })
  iniciadoCon = publicKey
}

const datosDeTarjeta = (datos, extra) => {
  const identificacion = datos.payer?.identification
  return {
    token: datos.token,
    metodoPagoId: datos.payment_method_id,
    tipo: extra?.paymentTypeId ?? null,
    emisorId: datos.issuer_id ? String(datos.issuer_id) : null,
    cuotas: Number(datos.installments),
    email: datos.payer.email,
    identificacion: identificacion?.number ? { tipo: identificacion.type, numero: identificacion.number } : null,
  }
}

export default function PagoTarjeta({ pedidoId, total, email, publicKey, onResultado, onError }) {
  iniciar(publicKey)
  // El Brick tarda unos segundos en dibujarse; mientras, se avisa que está cargando.
  const [listo, setListo] = useState(false)

  // <CardPayment> destruye y vuelve a crear el formulario (borrando lo que el
  // cliente ya escribió) si cambia cualquiera de sus props. Por eso todas son
  // estables: initialization con useMemo y callbacks que leen lo último de un ref.
  const actual = useRef({ pedidoId, onResultado, onError })
  useEffect(() => {
    actual.current = { pedidoId, onResultado, onError }
  })

  const initialization = useMemo(() => ({ amount: total, payer: { email } }), [total, email])

  const alEstarListo = useCallback(() => setListo(true), [])

  // El Brick muestra su propio "procesando" mientras esta promesa no termina.
  const pagar = useCallback(async (datos, extra) => {
    const { pedidoId, onResultado, onError } = actual.current
    try {
      const { pagarConTarjeta } = await gql(PAGAR, { pedidoId, tarjeta: datosDeTarjeta(datos, extra) })
      onResultado(pagarConTarjeta)
    } catch (err) {
      onError(err)
    }
  }, [])

  // Errores del propio Brick (p. ej. public key inválida); los de la tarjeta los muestra él.
  const alFallar = useCallback((e) => {
    if (e.type === 'critical') {
      actual.current.onError({ codigo: 'BRICK', message: 'No pudimos cargar el formulario de Mercado Pago.' })
    }
  }, [])

  return (
    <>
      {!listo && <p className="cargando"><span className="spinner" /> Cargando formulario de tarjeta…</p>}
      <CardPayment initialization={initialization} locale="es-MX" onReady={alEstarListo} onSubmit={pagar} onError={alFallar} />
    </>
  )
}
