// Reseñas y calificaciones de un producto (guardadas en MongoDB).
// Cualquiera las ve; con sesión se puede dejar (o editar) la propia.
import { useEffect, useState } from 'react'
import { gql, useSesion } from '../lib/sesion.js'

const CARGAR = `query ($id: ID!) {
  mongoDisponible
  producto(id: $id) {
    calificacion { promedio total porEstrellas }
    resenas(limite: 30) { id autor calificacion comentario compraVerificada fecha propia }
  }
}`
const GUARDAR = `mutation ($id: ID!, $calificacion: Int!, $comentario: String) {
  guardarResena(productoId: $id, calificacion: $calificacion, comentario: $comentario) { id }
}`
const ELIMINAR = `mutation ($id: ID!) { eliminarResena(id: $id) }`

function Estrellas({ valor, tamano = '1rem' }) {
  return (
    <span className="estrellas" role="img" aria-label={`${valor} de 5 estrellas`} style={{ fontSize: tamano }}>
      <span className="estrellas-fondo" aria-hidden="true">★★★★★</span>
      <span className="estrellas-relleno" style={{ width: `${valor * 20}%` }} aria-hidden="true">★★★★★</span>
    </span>
  )
}

// Selector de 1 a 5 estrellas accesible: radios con etiqueta.
function ElegirEstrellas({ valor, onChange }) {
  return (
    <fieldset className="elegir-estrellas">
      <legend>Tu calificación</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= valor ? 'activa' : undefined}>
          <input type="radio" name="calificacion" value={n} checked={valor === n} onChange={() => onChange(n)} />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{n} {n === 1 ? 'estrella' : 'estrellas'}</span>
        </label>
      ))}
    </fieldset>
  )
}

export default function Resenas({ productoId }) {
  const sesion = useSesion()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ calificacion: 0, comentario: '' })
  const [escribiendo, setEscribiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [recarga, setRecarga] = useState(0)

  // Se vuelve a pedir al cambiar la sesión, para saber cuál reseña es "propia".
  // undefined = todavía hidratando; entonces se espera a saber si hay sesión.
  const estadoSesion = sesion === undefined ? 'cargando' : sesion ? 'con' : 'sin'
  useEffect(() => {
    if (estadoSesion === 'cargando') return
    gql(CARGAR, { id: productoId })
      .then((d) => setDatos({ disponible: d.mongoDisponible, ...d.producto }))
      .catch(() => setError('No pudimos cargar las reseñas.'))
  }, [productoId, estadoSesion, recarga])

  const propia = datos?.resenas.find((r) => r.propia)

  const abrir = () => {
    setError('')
    setForm(propia ? { calificacion: propia.calificacion, comentario: propia.comentario || '' } : { calificacion: 0, comentario: '' })
    setEscribiendo(true)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.calificacion) return setError('Elige de 1 a 5 estrellas.')
    setEnviando(true)
    setError('')
    try {
      await gql(GUARDAR, { id: productoId, calificacion: form.calificacion, comentario: form.comentario.trim() || null })
      setEscribiendo(false)
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos guardar tu reseña.')
    } finally {
      setEnviando(false)
    }
  }

  const eliminar = async (r) => {
    if (!confirm('¿Borrar tu reseña?')) return
    try {
      await gql(ELIMINAR, { id: r.id })
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos borrar la reseña.')
    }
  }

  if (!datos) return error ? <p className="error">{error}</p> : null
  // Sin MongoDB la sección no se muestra.
  if (!datos.disponible) return null

  const { calificacion: c, resenas } = datos
  return (
    <section id="resenas" className="panel resenas">
      <h2>Reseñas</h2>

      {c.total > 0 ? (
        <div className="resenas-resumen">
          <div className="resenas-promedio">
            <strong>{c.promedio.toFixed(1)}</strong>
            <Estrellas valor={c.promedio} tamano="1.2rem" />
            <small>{c.total} {c.total === 1 ? 'reseña' : 'reseñas'}</small>
          </div>
          <ul className="resenas-barras" aria-label="Reseñas por estrellas">
            {c.porEstrellas.map((n, i) => (
              <li key={i}>
                <span>{5 - i} ★</span>
                <span className="barra"><span style={{ width: `${(n / c.total) * 100}%` }} /></span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Todavía nadie opina sobre este producto.</p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {!escribiendo && (
        sesion ? (
          <button className="btn-texto" type="button" onClick={abrir}>
            {propia ? 'Editar mi reseña' : 'Escribir una reseña'}
          </button>
        ) : (
          <p className="form-alterno">
            <a href={`/login?siguiente=${encodeURIComponent(`/producto/${productoId}#resenas`)}`}>Inicia sesión</a> para dejar tu reseña.
          </p>
        )
      )}

      {escribiendo && (
        <form className="resena-form" onSubmit={guardar}>
          <ElegirEstrellas valor={form.calificacion} onChange={(n) => setForm((f) => ({ ...f, calificacion: n }))} />
          <label>
            Comentario (opcional)
            <textarea
              rows={3}
              maxLength={1000}
              value={form.comentario}
              onChange={(e) => setForm((f) => ({ ...f, comentario: e.target.value }))}
              placeholder="¿Te funcionó para tu proyecto? ¿Llegó bien?"
            />
          </label>
          <div className="pedido-acciones">
            <button className="btn-primario" type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Publicar'}
            </button>
            <button className="btn-texto" type="button" onClick={() => setEscribiendo(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <ul className="resenas-lista">
        {resenas.map((r) => (
          <li key={r.id}>
            <div className="resena-cabecera">
              <Estrellas valor={r.calificacion} />
              <strong>{r.autor}</strong>
              {r.compraVerificada && <span className="categoria-tag">Compra verificada</span>}
              <small>{new Date(r.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</small>
            </div>
            {r.comentario && <p>{r.comentario}</p>}
            {(r.propia || sesion?.usuario?.rol === 'ADMIN') && (
              <button className="btn-texto" type="button" onClick={() => eliminar(r)}>
                {r.propia ? 'Borrar mi reseña' : 'Borrar (moderación)'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
