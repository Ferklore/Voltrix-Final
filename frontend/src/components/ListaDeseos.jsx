// Página "Mi lista de deseos": lo guardado, con precio y stock de hoy, para
// pasarlo al carrito o quitarlo.
import { useEffect, useState } from 'react'
import { despachar, dinero, useCarrito } from '../lib/carrito.js'
import { gql, useSesion } from '../lib/sesion.js'
import { alternarDeseo, useDeseos } from '../lib/deseos.js'
import { urlImagen } from '../lib/imagen.js'

const LISTA = `{ yo { listaDeseos { id nombre precio precioAnterior descuento imagen stock } } }`

export default function ListaDeseos() {
  const sesion = useSesion()
  const { ids } = useDeseos()
  const { items } = useCarrito()
  const [productos, setProductos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sesion === null) location.replace('/login?siguiente=/deseos')
  }, [sesion])

  const conSesion = Boolean(sesion)
  useEffect(() => {
    if (!conSesion) return
    gql(LISTA)
      .then((d) => setProductos(d.yo.listaDeseos))
      .catch(() => setError('No pudimos cargar tu lista.'))
  }, [conSesion])

  if (error) return <p className="error">{error}</p>
  if (!productos) return <p className="cargando">Cargando…</p>

  // Los que quitó desde aquí (u otra pestaña) desaparecen al momento.
  const visibles = productos.filter((p) => ids.has(String(p.id)))

  const quitar = (p) => alternarDeseo(p.id).catch(() => setError('No se pudo quitar. Intenta de nuevo.'))
  const alCarrito = (p) =>
    despachar({ type: 'AGREGAR', payload: { id: Number(p.id), nombre: p.nombre, precio: p.precio, imagen: p.imagen, stock: p.stock } })

  return (
    <section>
      <h1>Mi lista de deseos</h1>
      {visibles.length === 0 ? (
        <div className="panel vacio">
          <p>Tu lista está vacía. Toca el ♡ de un producto para guardarlo aquí.</p>
          <a className="btn-primario" href="/">Ver productos</a>
        </div>
      ) : (
        <ul className="lista-carrito lista-deseos">
          {visibles.map((p) => {
            const enCarrito = items.some((it) => it.id === Number(p.id))
            return (
              <li key={p.id} className="panel carrito-item">
                <a href={`/producto/${p.id}`} className="lista-deseos-img">
                  {p.imagen && <img src={urlImagen(p.imagen, 160)} alt="" width="80" height="80" loading="lazy" />}
                </a>
                <div className="lista-deseos-info">
                  <a href={`/producto/${p.id}`}><strong>{p.nombre}</strong></a>
                  <p className="precio">
                    {p.precioAnterior && <s className="precio-anterior">{dinero(p.precioAnterior)}</s>}
                    {dinero(p.precio)}
                    {p.precioAnterior && <span className="etiqueta-oferta en-linea">-{p.descuento}%</span>}
                  </p>
                  <p className="stock">{p.stock > 0 ? `${p.stock} disponibles` : 'Agotado por ahora'}</p>
                </div>
                <div className="pedido-acciones">
                  <button className="btn-texto" type="button" disabled={p.stock < 1 || enCarrito} onClick={() => alCarrito(p)}>
                    {enCarrito ? 'En tu carrito' : p.stock < 1 ? 'Agotado' : 'Agregar al carrito'}
                  </button>
                  <button className="btn-texto" type="button" onClick={() => quitar(p)}>Quitar</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
