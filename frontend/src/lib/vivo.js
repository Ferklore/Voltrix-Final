// GraphQL Subscriptions del panel admin: un solo WebSocket (graphql-ws) que
// comparten todas las secciones. El backend empuja un evento cada vez que
// cambia un pedido o un producto, y la pantalla se actualiza sin recargar.
import { createClient } from 'graphql-ws'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { API_URL } from './api.js'
import { tokenVigente } from './sesion.js'

let cliente = null
let estado = 'conectando' // 'conectando' | 'conectado' | 'desconectado'
const oyentes = new Set()

function cambiarEstado(nuevo) {
  estado = nuevo
  oyentes.forEach((fn) => fn())
}

function obtenerCliente() {
  cliente ??= createClient({
    url: `${API_URL.replace(/^http/, 'ws')}/graphql`,
    // Conecta en cuanto se abre el panel (no espera a la primera suscripción),
    // así el indicador "En vivo" es real en todas las secciones.
    lazy: false,
    // Se llama en cada (re)conexión, así siempre va un token vigente.
    connectionParams: async () => ({ authorization: `Bearer ${await tokenVigente()}` }),
    // Si el backend se reinicia o se cae la red, reintenta solo.
    retryAttempts: Infinity,
    shouldRetry: () => true,
    on: {
      connecting: () => cambiarEstado('conectando'),
      connected: () => cambiarEstado('conectado'),
      closed: () => cambiarEstado('desconectado'),
    },
  })
  return cliente
}

// Escucha una suscripción mientras el componente esté montado.
// alRecibir(data) se llama con cada evento.
export function useSuscripcion(query, alRecibir) {
  const ref = useRef(alRecibir)
  ref.current = alRecibir
  useEffect(
    () =>
      obtenerCliente().subscribe(
        { query },
        {
          next: ({ data }) => data && ref.current(data),
          error: (err) => console.error('[vivo]', err),
          complete: () => {},
        }
      ),
    [query]
  )
}

const suscribir = (fn) => (oyentes.add(fn), () => oyentes.delete(fn))
export function useEstadoVivo() {
  useEffect(() => void obtenerCliente(), [])
  return useSyncExternalStore(suscribir, () => estado, () => 'conectando')
}

// Campos de los eventos, compartidos por las secciones del panel.
export const PEDIDO_CAMBIO = (campos) => `subscription { pedidoCambio { tipo pedido { ${campos} } } }`
export const PRODUCTO_CAMBIO = (campos) => `subscription { productoCambio { tipo producto { ${campos} } } }`
