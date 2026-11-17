// Bitácora de eventos (RNF6.2): pedidos, pagos, cambios al catálogo, accesos
// y correos. Vive en MongoDB y se borra sola a los 90 días.
import { useEffect, useState } from 'react'
import { gql } from '../../lib/sesion.js'

const POR_PAGINA = 50
const LISTA = `query ($tipo: String, $antesDe: ID) {
  mongoDisponible
  tiposBitacora
  bitacora(tipo: $tipo, limite: ${POR_PAGINA}, antesDe: $antesDe) { id tipo fecha usuarioId resumen datos }
}`

const ETIQUETAS = {
  PEDIDO_CREADO: 'Pedido creado',
  PEDIDO_ESTADO: 'Estado de pedido',
  PAGO_APROBADO: 'Pago aprobado',
  PAGO_RECHAZADO: 'Pago rechazado',
  PRODUCTO_CREADO: 'Producto creado',
  PRODUCTO_ACTUALIZADO: 'Producto editado',
  PRODUCTO_ELIMINADO: 'Producto eliminado',
  REGISTRO: 'Cuenta nueva',
  LOGIN_GOOGLE: 'Entró con Google',
  LOGIN_FALLIDO: 'Login fallido',
  PASSWORD_RESTABLECIDO: 'Contraseña restablecida',
  CORREO_ENVIADO: 'Correo enviado',
  CORREO_FALLIDO: 'Correo fallido',
  RESENA: 'Reseña',
  RESPALDO_FALLIDO: 'Respaldo fallido',
}
// Los que conviene ver de un vistazo.
const ALERTA = new Set(['PAGO_RECHAZADO', 'LOGIN_FALLIDO', 'CORREO_FALLIDO', 'PRODUCTO_ELIMINADO', 'RESPALDO_FALLIDO'])

export default function AdminBitacora() {
  const [tipo, setTipo] = useState('')
  const [eventos, setEventos] = useState(null)
  const [tipos, setTipos] = useState([])
  const [disponible, setDisponible] = useState(true)
  const [hayMas, setHayMas] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const cargar = async (antesDe = null) => {
    setCargando(true)
    setError('')
    try {
      const d = await gql(LISTA, { tipo: tipo || null, antesDe })
      setDisponible(d.mongoDisponible)
      setTipos(d.tiposBitacora)
      setEventos((lista) => (antesDe ? [...lista, ...d.bitacora] : d.bitacora))
      setHayMas(d.bitacora.length === POR_PAGINA)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    setEventos(null)
    cargar()
  }, [tipo])

  return (
    <section>
      <div className="admin-bloque-cabecera">
        <h1>Bitácora</h1>
        <div className="pedido-acciones">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo de evento">
            <option value="">Todos los eventos</option>
            {tipos.map((t) => <option key={t} value={t}>{ETIQUETAS[t] || t}</option>)}
          </select>
          <button className="btn-texto" type="button" onClick={() => cargar()} disabled={cargando}>Actualizar</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {!disponible ? (
        <p className="panel vacio">La bitácora necesita MongoDB. Configura MONGODB_URI en el backend.</p>
      ) : !eventos ? (
        <p className="cargando"><span className="spinner" /> Cargando eventos…</p>
      ) : eventos.length === 0 ? (
        <p className="panel vacio">No hay eventos{tipo && ` de tipo "${ETIQUETAS[tipo] || tipo}"`}.</p>
      ) : (
        <>
          <div className="panel tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id} className={ALERTA.has(e.tipo) ? 'fila-alerta' : undefined}>
                    <td><small>{new Date(e.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })}</small></td>
                    <td><span className="categoria-tag">{ETIQUETAS[e.tipo] || e.tipo}</span></td>
                    <td>
                      {e.datos ? (
                        <details>
                          <summary>{e.resumen}</summary>
                          <pre className="bitacora-datos">{JSON.stringify(JSON.parse(e.datos), null, 2)}</pre>
                        </details>
                      ) : e.resumen}
                    </td>
                    <td>{e.usuarioId ? `#${e.usuarioId}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hayMas && (
            <p>
              <button className="btn-texto" type="button" disabled={cargando} onClick={() => cargar(eventos.at(-1).id)}>
                {cargando ? 'Cargando…' : 'Cargar más'}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}
