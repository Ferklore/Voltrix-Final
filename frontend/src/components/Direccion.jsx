// Dirección de envío en "Mi cuenta" (RF1.1) con su ubicación en el mapa.
// "Ubicar en el mapa" le pregunta a HERE (vía backend) dónde queda la
// dirección; si el pin no quedó exacto, el cliente lo arrastra o toca el mapa.
import { useEffect, useState } from 'react'
import { gql } from '../lib/sesion.js'
import CamposDireccion from './CamposDireccion.jsx'
import Mapa from './Mapa.jsx'

const CAMPOS = 'calle colonia ciudad estado codigoPostal lat lng'
const CARGAR = `{ yo { id direccion { ${CAMPOS} } } mapasDisponible }`
const GUARDAR = `mutation ($datos: DireccionInput!) { guardarDireccion(datos: $datos) { id direccion { ${CAMPOS} } } }`
const UBICAR = `query ($datos: DireccionInput!) { ubicarDireccion(datos: $datos) { lat lng etiqueta precision } }`
const VACIA = { calle: '', colonia: '', ciudad: '', estado: '', codigoPostal: '', lat: null, lng: null }

// Solo los campos de texto (para comparar si cambió la dirección escrita).
const texto = (d) => ['calle', 'colonia', 'ciudad', 'estado', 'codigoPostal'].map((k) => d[k]).join('|')

export default function Direccion() {
  const [cargada, setCargada] = useState(false)
  const [guardada, setGuardada] = useState(null)
  const [datos, setDatos] = useState(VACIA)
  const [editando, setEditando] = useState(false)
  const [mapas, setMapas] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ubicando, setUbicando] = useState(false)

  useEffect(() => {
    gql(CARGAR)
      .then((d) => {
        setMapas(d.mapasDisponible)
        setGuardada(d.yo.direccion)
        if (d.yo.direccion) setDatos(d.yo.direccion)
        else setEditando(true)
        setCargada(true)
      })
      .catch(() => setError('No pudimos cargar tu dirección.'))
  }, [])

  const cambiar = (campo, valor) =>
    // Si cambia la dirección escrita, el pin anterior ya no vale.
    setDatos((d) => ({ ...d, [campo]: valor, lat: null, lng: null }))

  const ubicar = async () => {
    setError('')
    setAviso('')
    setUbicando(true)
    try {
      const { ubicarDireccion: u } = await gql(UBICAR, { datos: { ...datos, lat: null, lng: null } })
      if (!u) {
        setAviso('No encontramos esa dirección en el mapa. Revisa los datos o toca el mapa para poner el pin.')
        return
      }
      setDatos((d) => ({ ...d, lat: u.lat, lng: u.lng }))
      setAviso(`Ubicada${u.precision ? ` (hasta ${u.precision})` : ''}. Si el pin no quedó en tu casa, arrástralo.`)
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos ubicar la dirección.')
    } finally {
      setUbicando(false)
    }
  }

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const { guardarDireccion } = await gql(GUARDAR, { datos })
      setGuardada(guardarDireccion.direccion)
      setDatos(guardarDireccion.direccion)
      setEditando(false)
      setAviso(guardarDireccion.direccion.lat == null && mapas ? 'Guardada, pero no pudimos ubicarla en el mapa.' : '')
    } catch (err) {
      setError(err.codigo ? err.message : 'No pudimos guardar tu dirección.')
    } finally {
      setEnviando(false)
    }
  }

  if (!cargada) return error ? <p className="error">{error}</p> : null

  const completa = texto(datos).split('|').every(Boolean)

  return (
    <section className="panel datos-fiscales">
      <h2>Dirección de envío</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {!editando ? (
        <>
          <p>
            {guardada.calle}, col. {guardada.colonia}
            <br />
            {guardada.ciudad}, {guardada.estado}, CP {guardada.codigoPostal}
          </p>
          {(guardada.lat != null || mapas) && <Mapa lat={guardada.lat} lng={guardada.lng} alto={220} />}
          <div className="pedido-acciones">
            <button className="btn-texto" type="button" onClick={() => { setAviso(''); setEditando(true) }}>Editar</button>
          </div>
        </>
      ) : (
        <form className="form form-direccion" onSubmit={guardar}>
          {!guardada && <p className="aviso">Todavía no tenemos tu dirección. Captúrala para que podamos enviarte tus pedidos.</p>}
          <CamposDireccion leyenda={false} valores={datos} onChange={cambiar} />
          <div className="direccion-mapa">
            <div className="pedido-acciones">
              <strong>Ubicación en el mapa</strong>
              {mapas && (
                <button className="btn-texto" type="button" onClick={ubicar} disabled={ubicando || !completa}>
                  {ubicando ? 'Ubicando…' : 'Ubicar en el mapa'}
                </button>
              )}
            </div>
            <Mapa
              editable
              lat={datos.lat}
              lng={datos.lng}
              onMover={({ lat, lng }) => setDatos((d) => ({ ...d, lat, lng }))}
            />
          </div>
          <button className="btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar dirección'}
          </button>
          {guardada && (
            <button className="btn-texto" type="button" onClick={() => { setEditando(false); setDatos(guardada); setAviso('') }}>
              Cancelar
            </button>
          )}
        </form>
      )}
    </section>
  )
}
