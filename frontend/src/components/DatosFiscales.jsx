// Datos fiscales del cliente para su prefactura. Si no los captura, la
// prefactura sale a "PUBLICO EN GENERAL" (RFC XAXX010101000).
import { useEffect, useState } from 'react'
import { gql } from '../lib/sesion.js'

const CARGAR = `{
  yo { id datosFiscales { rfc razonSocial codigoPostal regimenFiscal usoCfdi } }
  catalogosCfdi { regimenesFiscales { clave descripcion } usosCfdi { clave descripcion } }
}`
const GUARDAR = `mutation ($datos: DatosFiscalesInput!) {
  guardarDatosFiscales(datos: $datos) { id datosFiscales { rfc razonSocial codigoPostal regimenFiscal usoCfdi } }
}`
const BORRAR = `mutation { borrarDatosFiscales { id } }`
const VACIO = { rfc: '', razonSocial: '', codigoPostal: '', regimenFiscal: '', usoCfdi: 'G03' }

export default function DatosFiscales() {
  const [catalogos, setCatalogos] = useState(null)
  const [guardados, setGuardados] = useState(null)
  const [datos, setDatos] = useState(VACIO)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    gql(CARGAR)
      .then((d) => {
        setCatalogos(d.catalogosCfdi)
        setGuardados(d.yo.datosFiscales)
        if (d.yo.datosFiscales) setDatos(d.yo.datosFiscales)
      })
      .catch(() => setError('No pudimos cargar tus datos fiscales.'))
  }, [])

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setAviso('')
    setEnviando(true)
    try {
      const { guardarDatosFiscales } = await gql(GUARDAR, { datos })
      setGuardados(guardarDatosFiscales.datosFiscales)
      setDatos(guardarDatosFiscales.datosFiscales)
      setEditando(false)
      setAviso('Guardado. Tus próximas prefacturas saldrán a tu nombre; para una anterior usa "Regenerar".')
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos guardar tus datos fiscales.')
    } finally {
      setEnviando(false)
    }
  }

  const borrar = async () => {
    if (!confirm('¿Borrar tus datos fiscales? Tus próximas prefacturas saldrán a público en general.')) return
    try {
      await gql(BORRAR)
      setGuardados(null)
      setDatos(VACIO)
      setEditando(false)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos borrar tus datos fiscales.')
    }
  }

  if (!catalogos) return error ? <p className="error">{error}</p> : null

  return (
    <section className="panel datos-fiscales">
      <h2>Datos fiscales</h2>
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!editando ? (
        <>
          {guardados ? (
            <p>
              <strong>{guardados.razonSocial}</strong> · RFC {guardados.rfc} · CP {guardados.codigoPostal}
              <br />
              <small>Régimen {guardados.regimenFiscal} · Uso del CFDI {guardados.usoCfdi}</small>
            </p>
          ) : (
            <p>Tus prefacturas salen a <strong>público en general</strong>. Captura tus datos si necesitas una a tu nombre.</p>
          )}
          <div className="pedido-acciones">
            <button className="btn-texto" type="button" onClick={() => setEditando(true)}>
              {guardados ? 'Editar' : 'Capturar datos fiscales'}
            </button>
            {guardados && (
              <button className="btn-texto" type="button" onClick={borrar}>Borrar</button>
            )}
          </div>
        </>
      ) : (
        <form className="form" onSubmit={guardar}>
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
          <button className="btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn-texto" type="button" onClick={() => { setEditando(false); setDatos(guardados || VACIO) }}>
            Cancelar
          </button>
        </form>
      )}
    </section>
  )
}
