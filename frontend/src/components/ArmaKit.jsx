// "Arma tu kit": el cliente describe su proyecto (o elige uno) y su
// presupuesto, y el recomendador arma la lista con productos en existencia.
// Es la misma lógica que la herramienta recomendar_kit del servidor MCP.
import { useEffect, useState } from 'react'
import { dinero, despachar } from '../lib/carrito.js'
import { gql } from '../lib/sesion.js'

const KITS = `{ kits { id nombre descripcion piezas } }`
const PRODUCTO = 'id nombre precio precioAnterior imagen stock'
const RECOMENDAR = `query ($proyecto: String, $kitId: ID, $presupuesto: Float) {
  recomendarKit(proyecto: $proyecto, kitId: $kitId, presupuesto: $presupuesto) {
    kit { id nombre descripcion notas }
    mensaje total presupuesto dentroDePresupuesto faltantes
    items { rol cantidad opcional subtotal producto { ${PRODUCTO} } alternativas { ${PRODUCTO} } }
  }
}`
const EJEMPLOS = ['Una estación meteorológica con WiFi', 'Un robot seguidor de línea', 'Una PC para juegos']

export default function ArmaKit() {
  const [kits, setKits] = useState([])
  const [proyecto, setProyecto] = useState('')
  const [kitId, setKitId] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [resultado, setResultado] = useState(null)
  // Pieza -> producto elegido (el recomendado o una alternativa).
  const [elegidos, setElegidos] = useState({})
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [agregado, setAgregado] = useState(false)

  useEffect(() => {
    gql(KITS).then((d) => setKits(d.kits)).catch(() => {})
  }, [])

  const recomendar = async (e) => {
    e?.preventDefault()
    setError('')
    setAgregado(false)
    setCargando(true)
    try {
      const { recomendarKit } = await gql(RECOMENDAR, {
        proyecto: kitId ? null : proyecto.trim() || null,
        kitId: kitId || null,
        presupuesto: presupuesto ? Number(presupuesto) : null,
      })
      setResultado(recomendarKit)
      setElegidos(Object.fromEntries(recomendarKit.items.map((it) => [it.rol, it.producto])))
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos armar el kit. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  const items = resultado?.items ?? []
  const total = items.reduce((s, it) => s + elegidos[it.rol].precio * it.cantidad, 0)

  const agregarTodo = () => {
    for (const it of items) {
      const p = elegidos[it.rol]
      despachar({ type: 'AGREGAR', payload: { id: Number(p.id), nombre: p.nombre, precio: p.precio, imagen: p.imagen, stock: p.stock } })
      if (it.cantidad > 1) despachar({ type: 'CAMBIAR_CANTIDAD', payload: { id: Number(p.id), cantidad: it.cantidad } })
    }
    setAgregado(true)
  }

  return (
    <section>
      <h1>Arma tu kit</h1>
      <p className="introduccion">
        Cuéntanos qué quieres construir y te armamos la lista de componentes con lo que tenemos en existencia.
      </p>

      <form className="panel filtros arma-kit-form" onSubmit={recomendar}>
        <label className="arma-kit-proyecto">
          ¿Qué quieres construir?
          <input
            type="search"
            value={proyecto}
            maxLength={500}
            disabled={Boolean(kitId)}
            onChange={(e) => setProyecto(e.target.value)}
            placeholder="Ej. una estación meteorológica con WiFi"
          />
        </label>
        <label>
          O elige un kit
          <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
            <option value="">Según mi descripción</option>
            {kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
          </select>
        </label>
        <label>
          Presupuesto (MXN)
          <input type="search" inputMode="decimal" value={presupuesto} placeholder="Opcional"
            onChange={(e) => setPresupuesto(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <div className="filtros-acciones">
          <button className="btn-primario" type="submit" disabled={cargando || (!proyecto.trim() && !kitId)}>
            {cargando ? 'Armando…' : 'Armar mi kit'}
          </button>
          {!resultado && EJEMPLOS.map((t) => (
            <button key={t} className="btn-texto" type="button" onClick={() => { setKitId(''); setProyecto(t) }}>{t}</button>
          ))}
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {resultado && !resultado.kit && (
        <div className="panel vacio">
          <p>{resultado.mensaje}</p>
          <p>Kits que sabemos armar: {kits.map((k) => k.nombre).join(', ')}.</p>
        </div>
      )}

      {resultado?.kit && (
        <div className="panel arma-kit-resultado" aria-live="polite">
          <h2>{resultado.kit.nombre}</h2>
          <p>{resultado.kit.descripcion}</p>
          {resultado.mensaje && <p className="aviso">{resultado.mensaje}</p>}

          {items.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr><th>Pieza</th><th>Producto</th><th className="num">Cant.</th><th className="num">Subtotal</th></tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const p = elegidos[it.rol]
                    const opciones = [it.producto, ...it.alternativas]
                    return (
                      <tr key={it.rol}>
                        <td>{it.rol}{it.opcional && <small> (opcional)</small>}</td>
                        <td>
                          {opciones.length > 1 ? (
                            <select
                              value={p.id}
                              aria-label={`Producto para ${it.rol}`}
                              onChange={(e) => setElegidos((x) => ({ ...x, [it.rol]: opciones.find((o) => o.id === e.target.value) }))}
                            >
                              {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} — {dinero(o.precio)}</option>)}
                            </select>
                          ) : (
                            <a href={`/producto/${p.id}`}>{p.nombre}</a>
                          )}
                        </td>
                        <td className="num">{it.cantidad}</td>
                        <td className="num">{dinero(p.precio * it.cantidad)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total{resultado.presupuesto ? ` (presupuesto ${dinero(resultado.presupuesto)})` : ''}</th>
                    <th className={`num${resultado.presupuesto && total > resultado.presupuesto ? ' error' : ''}`}>{dinero(total)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {resultado.kit.notas && <p className="form-alterno">💡 {resultado.kit.notas}</p>}

          {items.length > 0 && (
            <div className="pedido-acciones">
              <button className="btn-primario" type="button" onClick={agregarTodo}>Agregar todo al carrito</button>
              {agregado && <span role="status">Listo. <a href="/carrito">Ver carrito</a></span>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
