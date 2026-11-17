// Buscar un componente en el catálogo de Mouser e importarlo como producto
// nuevo: llena nombre, descripción, precio sugerido, imagen y ficha técnica
// (atributos + datasheet). El admin revisa y ajusta antes de guardar.
import { useState } from 'react'
import { dinero } from '../../lib/carrito.js'
import { gql } from '../../lib/sesion.js'

const BUSCAR = `query ($texto: String!, $parte: Boolean) {
  buscarEnMouser(texto: $texto, porNumeroDeParte: $parte, limite: 10) {
    numeroMouser numeroFabricante fabricante descripcion categoria datasheetUrl imagenUrl urlMouser
    disponibilidad enStock precioUsd precioMouser moneda aviso precioSugeridoMxn atributos { nombre valor }
  }
}`
const precio = (n, moneda) => `${moneda === 'USD' ? 'US$' : moneda === 'MXN' ? 'MX$' : `${moneda} `}${n.toFixed(n < 1 ? 3 : 2)}`

export default function ImportarMouser({ onImportar }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [porParte, setPorParte] = useState(false)
  const [partes, setPartes] = useState(null)
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [importando, setImportando] = useState(null)

  const buscar = async (e) => {
    e.preventDefault()
    setError('')
    setBuscando(true)
    try {
      const { buscarEnMouser } = await gql(BUSCAR, { texto, parte: porParte })
      setPartes(buscarEnMouser)
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  const importar = async (parte) => {
    setImportando(parte.numeroMouser)
    setError('')
    try {
      await onImportar(parte)
      setAbierto(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setImportando(null)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-texto" type="button" onClick={() => setAbierto(true)}>
        Importar desde Mouser
      </button>
    )
  }

  return (
    <section className="panel importar-mouser">
      <div className="admin-bloque-cabecera">
        <h2>Importar desde Mouser</h2>
        <button className="btn-texto" type="button" onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
      <form className="importar-mouser-form" onSubmit={buscar}>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={porParte ? 'Número de parte, p. ej. LM317T' : 'Palabras, p. ej. esp32 wroom'}
          aria-label="Buscar en Mouser"
          minLength={2}
          maxLength={100}
          required
        />
        <label className="filtro-check">
          <input type="checkbox" checked={porParte} onChange={(e) => setPorParte(e.target.checked)} />
          Por número de parte
        </label>
        <button className="btn-primario" type="submit" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {partes && (partes.length === 0 ? (
        <p>Mouser no encontró resultados.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th />
                <th>Parte</th>
                <th>Descripción</th>
                <th className="num">Stock Mouser</th>
                <th className="num">1 pza</th>
                <th className="num">Sugerido</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {partes.map((p) => (
                <tr key={p.numeroMouser}>
                  <td>{p.imagenUrl && <img className="mouser-miniatura" src={p.imagenUrl} alt="" loading="lazy" />}</td>
                  <td>
                    <strong>{p.numeroFabricante}</strong>
                    <br />
                    <small>{p.fabricante} · {p.urlMouser ? <a href={p.urlMouser} target="_blank" rel="noopener noreferrer">{p.numeroMouser}</a> : p.numeroMouser}</small>
                  </td>
                  <td>
                    {p.descripcion}
                    {p.datasheetUrl && <> · <a href={p.datasheetUrl} target="_blank" rel="noopener noreferrer">datasheet</a></>}
                    {p.aviso && <><br /><small className="error">{p.aviso}</small></>}
                  </td>
                  <td className="num">{p.enStock.toLocaleString('es-MX')}</td>
                  <td className="num">{p.precioMouser ? precio(p.precioMouser, p.moneda) : '—'}</td>
                  <td className="num">{p.precioSugeridoMxn ? dinero(p.precioSugeridoMxn) : '—'}</td>
                  <td>
                    <button className="btn-texto" type="button" disabled={Boolean(importando)} onClick={() => importar(p)}>
                      {importando === p.numeroMouser ? 'Importando…' : 'Importar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="form-alterno">
        El precio sugerido es el de Mouser × tipo de cambio × margen × IVA. Si Mouser no da precio
        (pieza restringida en tu región o descontinuada), captúralo tú. Revisa todo antes de guardar.
      </p>
    </section>
  )
}
