// Lista de deseos compartida entre islas de React: todos los corazones de la
// página (tarjetas, detalle, menú) leen el mismo conjunto de ids y se
// actualizan juntos. Se carga una vez por sesión desde el backend.
import { useEffect, useSyncExternalStore } from 'react'
import { gql, useSesion } from './sesion.js'

let ids = new Set()
let cargadaPara = null // id del usuario cuya lista está cargada
let cargando = null
const oyentes = new Set()
const avisar = () => oyentes.forEach((fn) => fn())
const suscribir = (fn) => (oyentes.add(fn), () => oyentes.delete(fn))

function cargar(usuarioId) {
  if (cargadaPara === usuarioId) return cargando
  cargadaPara = usuarioId
  cargando = gql('{ yo { listaDeseos { id } } }')
    .then((d) => {
      ids = new Set((d.yo?.listaDeseos ?? []).map((p) => String(p.id)))
      avisar()
    })
    .catch(() => {
      cargadaPara = null
    })
  return cargando
}

export function useDeseos() {
  const sesion = useSesion()
  const usuarioId = sesion?.usuario?.id ?? null
  useEffect(() => {
    if (usuarioId) cargar(usuarioId)
    else if (sesion === null && ids.size) {
      ids = new Set()
      cargadaPara = null
      avisar()
    }
  }, [usuarioId, sesion])
  const actuales = useSyncExternalStore(suscribir, () => ids, () => ids)
  return { sesion, ids: actuales }
}

// Cambia el corazón al instante y lo confirma con el backend; si falla, lo regresa.
export async function alternarDeseo(productoId) {
  const id = String(productoId)
  const estaba = ids.has(id)
  ids = new Set(ids)
  estaba ? ids.delete(id) : ids.add(id)
  avisar()
  try {
    await gql(
      estaba
        ? 'mutation ($id: ID!) { quitarDeDeseos(productoId: $id) }'
        : 'mutation ($id: ID!) { agregarADeseos(productoId: $id) { id } }',
      { id }
    )
  } catch (err) {
    ids = new Set(ids)
    estaba ? ids.add(id) : ids.delete(id)
    avisar()
    throw err
  }
}
