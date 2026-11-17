// Editor de la ficha técnica (MongoDB) de un producto: filas nombre/valor
// libres, enlace al datasheet y descripción larga. Va dentro del formulario de
// productos; el padre llama a guardar() después de guardar el producto.
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { gql } from '../../lib/sesion.js'

const CARGAR = `query ($id: ID!) { producto(id: $id) { ficha { especificaciones { nombre valor } datasheetUrl descripcion } } }`
const GUARDAR = `mutation ($id: ID!, $datos: FichaInput!) { guardarFicha(productoId: $id, datos: $datos) { actualizado } }`
const vacia = () => ({ especificaciones: [{ nombre: '', valor: '' }], datasheetUrl: '', descripcion: '' })

const FichaEditor = forwardRef(function FichaEditor({ productoId, disponible }, ref) {
  const [ficha, setFicha] = useState(vacia)
  const [tocada, setTocada] = useState(false)

  useEffect(() => {
    setTocada(false)
    if (!productoId || !disponible) return setFicha(vacia())
    gql(CARGAR, { id: productoId })
      .then(({ producto }) => {
        const f = producto?.ficha
        setFicha(
          f
            ? { especificaciones: f.especificaciones.length ? f.especificaciones : vacia().especificaciones, datasheetUrl: f.datasheetUrl || '', descripcion: f.descripcion || '' }
            : vacia()
        )
      })
      .catch(() => setFicha(vacia()))
  }, [productoId, disponible])

  // El padre la guarda con el id del producto (nuevo o existente).
  useImperativeHandle(ref, () => ({
    async guardar(id) {
      if (!disponible || !tocada) return
      const especificaciones = ficha.especificaciones
        .map((e) => ({ nombre: e.nombre.trim(), valor: e.valor.trim() }))
        .filter((e) => e.nombre || e.valor)
      await gql(GUARDAR, {
        id,
        datos: { especificaciones, datasheetUrl: ficha.datasheetUrl.trim() || null, descripcion: ficha.descripcion.trim() || null },
      })
    },
  }))

  const cambiar = (cambio) => {
    setTocada(true)
    setFicha((f) => ({ ...f, ...cambio(f) }))
  }
  const cambiarFila = (i, campo, valor) =>
    cambiar((f) => ({ especificaciones: f.especificaciones.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)) }))

  if (!disponible) {
    return <p className="ancho form-alterno">La ficha técnica necesita MongoDB (MONGODB_URI en el backend).</p>
  }

  return (
    <fieldset className="ancho ficha-editor">
      <legend>Ficha técnica</legend>
      {ficha.especificaciones.map((e, i) => (
        <div key={i} className="ficha-fila">
          <input aria-label={`Especificación ${i + 1}`} placeholder="Voltaje" maxLength={60} value={e.nombre}
            onChange={(ev) => cambiarFila(i, 'nombre', ev.target.value)} />
          <input aria-label={`Valor ${i + 1}`} placeholder="3.3 V – 5 V" maxLength={200} value={e.valor}
            onChange={(ev) => cambiarFila(i, 'valor', ev.target.value)} />
          <button className="btn-texto" type="button" aria-label={`Quitar especificación ${i + 1}`}
            onClick={() => cambiar((f) => ({ especificaciones: f.especificaciones.filter((_, j) => j !== i) }))}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn-texto" type="button"
        onClick={() => cambiar((f) => ({ especificaciones: [...f.especificaciones, { nombre: '', valor: '' }] }))}>
        + Agregar especificación
      </button>
      <label>
        Enlace al datasheet (PDF del fabricante)
        <input type="url" maxLength={500} placeholder="https://…" value={ficha.datasheetUrl}
          onChange={(ev) => cambiar(() => ({ datasheetUrl: ev.target.value }))} />
      </label>
      <label>
        Descripción larga
        <textarea rows={3} maxLength={2000} value={ficha.descripcion}
          onChange={(ev) => cambiar(() => ({ descripcion: ev.target.value }))} />
      </label>
    </fieldset>
  )
})

export default FichaEditor
