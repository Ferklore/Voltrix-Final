// Datos fiscales (RFC, razón social, CP, régimen, uso del CFDI) para facturar
// a nombre del cliente. Son opcionales: sin ellos la prefactura sale a
// "PUBLICO EN GENERAL", que es lo que pide casi todo mundo.
//   modo="cuenta"   (Mi cuenta): una línea discreta; el formulario se abre solo si se pide.
//   modo="checkout" (casilla "¿Necesitas factura?"): muestra los datos o el formulario.
// onCambio(datos | null): avisa al padre qué datos hay guardados.
import { useEffect, useState } from 'react'
import { gql } from '../lib/sesion.js'

const CAMPOS = 'rfc razonSocial codigoPostal regimenFiscal usoCfdi'
const CARGAR = `{
  yo { id datosFiscales { ${CAMPOS} } }
  catalogosCfdi { regimenesFiscales { clave descripcion } usosCfdi { clave descripcion } }
}`
const GUARDAR = `mutation ($datos: DatosFiscalesInput!) { guardarDatosFiscales(datos: $datos) { id datosFiscales { ${CAMPOS} } } }`
const BORRAR = `mutation { borrarDatosFiscales { id } }`
const VACIO = { rfc: '', razonSocial: '', codigoPostal: '', regimenFiscal: '', usoCfdi: 'G03' }

export default function DatosFiscales({ modo = 'cuenta', onCambio }) {
  const checkout = modo === 'checkout'
  const [catalogos, setCatalogos] = useState(null)
  const [guardados, setGuardados] = useState(null)
  const [datos, setDatos] = useState(VACIO)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const actualizar = (nuevos) => {
    setGuardados(nuevos)
    setDatos(nuevos || VACIO)
    onCambio?.(nuevos)
  }

  useEffect(() => {
    gql(CARGAR)
      .then((d) => {
        setCatalogos(d.catalogosCfdi)
        actualizar(d.yo.datosFiscales)
        // En el checkout, si no hay datos, el formulario sale de una vez.
        if (checkout && !d.yo.datosFiscales) setEditando(true)
      })
      .catch(() => setError('No pudimos cargar tus datos fiscales.'))
  }, [])

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const { guardarDatosFiscales } = await gql(GUARDAR, { datos })
      actualizar(guardarDatosFiscales.datosFiscales)
      setEditando(false)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos guardar tus datos fiscales.')
    } finally {
      setEnviando(false)
    }
  }

  const borrar = async () => {
    if (!confirm('¿Borrar tus datos de facturación?')) return
    try {
      await gql(BORRAR)
      actualizar(null)
      setEditando(false)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos borrar tus datos fiscales.')
    }
  }

  if (!catalogos) return error ? <p className="error">{error}</p> : null

  const resumen = guardados && (
    <>
      <strong>{guardados.razonSocial}</strong> · RFC {guardados.rfc}
      <small> · CP {guardados.codigoPostal} · Régimen {guardados.regimenFiscal} · Uso {guardados.usoCfdi}</small>
    </>
  )

  const formulario = (
    <form className="form form-fiscal" onSubmit={guardar}>
      <label>
        RFC
        <input value={datos.rfc} onChange={cambiar('rfc')} required maxLength={13} autoComplete="off"
          placeholder="12 o 13 caracteres" style={{ textTransform: 'uppercase' }} />
      </label>
      <label>
        Nombre o razón social (como en tu constancia)
        <input value={datos.razonSocial} onChange={cambiar('razonSocial')} required maxLength={254}
          style={{ textTransform: 'uppercase' }} />
      </label>
      <label>
        Código postal fiscal
        <input value={datos.codigoPostal} onChange={cambiar('codigoPostal')} required inputMode="numeric"
          pattern="\d{5}" maxLength={5} />
      </label>
      <label>
        Régimen fiscal
        <select value={datos.regimenFiscal} onChange={cambiar('regimenFiscal')} required>
          <option value="">Elige…</option>
          {catalogos.regimenesFiscales.map((r) => (
            <option key={r.clave} value={r.clave}>{r.clave} - {r.descripcion}</option>
          ))}
        </select>
      </label>
      <label>
        Uso del CFDI
        <select value={datos.usoCfdi} onChange={cambiar('usoCfdi')} required>
          {catalogos.usosCfdi.map((u) => (
            <option key={u.clave} value={u.clave}>{u.clave} - {u.descripcion}</option>
          ))}
        </select>
      </label>
      <div className="pedido-acciones">
        <button className="btn-primario" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : checkout ? 'Guardar y facturar a este RFC' : 'Guardar'}
        </button>
        {(guardados || !checkout) && (
          <button className="btn-texto" type="button" onClick={() => { setEditando(false); setDatos(guardados || VACIO) }}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )

  // Checkout: va dentro de la casilla "¿Necesitas factura?".
  if (checkout) {
    return (
      <div className="facturacion-checkout">
        {error && <p className="error" role="alert">{error}</p>}
        {editando ? formulario : (
          <p>
            Factura a: {resumen}{' · '}
            <button className="btn-enlace" type="button" onClick={() => setEditando(true)}>Cambiar</button>
          </p>
        )}
      </div>
    )
  }

  // Mi cuenta: una línea, sin hacer ruido.
  return (
    <section className="panel facturacion">
      {error && <p className="error" role="alert">{error}</p>}
      {editando ? (
        <>
          <h2>Datos de facturación</h2>
          <p className="form-alterno">Solo si necesitas factura a tu nombre. Usa los datos de tu constancia de situación fiscal.</p>
          {formulario}
        </>
      ) : (
        <p className="facturacion-linea">
          <span className="facturacion-etiqueta">Facturación</span>
          {guardados ? <span>{resumen}</span> : <span>Público en general</span>}
          <span className="pedido-acciones">
            <button className="btn-texto" type="button" onClick={() => setEditando(true)}>
              {guardados ? 'Editar' : 'Agregar datos de facturación'}
            </button>
            {guardados && <button className="btn-texto" type="button" onClick={borrar}>Borrar</button>}
          </span>
        </p>
      )}
    </section>
  )
}
