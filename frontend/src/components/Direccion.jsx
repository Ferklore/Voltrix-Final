// Dirección de envío en "Mi cuenta" (RF1.1). Las cuentas creadas antes de
// pedir dirección en el registro la capturan aquí.
import { useEffect, useState } from 'react'
import { gql } from '../lib/sesion.js'
import CamposDireccion from './CamposDireccion.jsx'

const CAMPOS = 'calle colonia ciudad estado codigoPostal'
const CARGAR = `{ yo { id direccion { ${CAMPOS} } } }`
const GUARDAR = `mutation ($datos: DireccionInput!) { guardarDireccion(datos: $datos) { id direccion { ${CAMPOS} } } }`
const VACIA = { calle: '', colonia: '', ciudad: '', estado: '', codigoPostal: '' }

export default function Direccion() {
  const [cargada, setCargada] = useState(false)
  const [guardada, setGuardada] = useState(null)
  const [datos, setDatos] = useState(VACIA)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    gql(CARGAR)
      .then((d) => {
        setGuardada(d.yo.direccion)
        if (d.yo.direccion) setDatos(d.yo.direccion)
        else setEditando(true)
        setCargada(true)
      })
      .catch(() => setError('No pudimos cargar tu dirección.'))
  }, [])

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const { guardarDireccion } = await gql(GUARDAR, { datos })
      setGuardada(guardarDireccion.direccion)
      setDatos(guardarDireccion.direccion)
      setEditando(false)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos guardar tu dirección.')
    } finally {
      setEnviando(false)
    }
  }

  if (!cargada) return error ? <p className="error">{error}</p> : null

  return (
    <section className="panel datos-fiscales">
      <h2>Dirección de envío</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!editando ? (
        <>
          <p>
            {guardada.calle}, col. {guardada.colonia}
            <br />
            {guardada.ciudad}, {guardada.estado}, CP {guardada.codigoPostal}
          </p>
          <div className="pedido-acciones">
            <button className="btn-texto" type="button" onClick={() => setEditando(true)}>Editar</button>
          </div>
        </>
      ) : (
        <form className="form" onSubmit={guardar}>
          {!guardada && <p className="aviso">Todavía no tenemos tu dirección. Captúrala para que podamos enviarte tus pedidos.</p>}
          <CamposDireccion leyenda={false} valores={datos} onChange={(campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }))} />
          <button className="btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar dirección'}
          </button>
          {guardada && (
            <button className="btn-texto" type="button" onClick={() => { setEditando(false); setDatos(guardada) }}>
              Cancelar
            </button>
          )}
        </form>
      )}
    </section>
  )
}
