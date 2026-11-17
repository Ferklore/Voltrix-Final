// Mapa con Leaflet (teselas de OpenStreetMap) y un pin en la ubicación de envío.
// editable: el pin se puede arrastrar (o tocar el mapa para moverlo) y avisa
// con onMover({ lat, lng }). Leaflet usa window, así que se carga en el navegador.
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

// Centro de México, para cuando todavía no hay ubicación.
const MEXICO = { lat: 23.6345, lng: -102.5528 }

export default function Mapa({ lat, lng, editable = false, onMover, alto = 260, etiqueta = 'Ubicación de envío' }) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const pin = useRef(null)
  const alMover = useRef(onMover)
  alMover.current = onMover
  const hayUbicacion = Number.isFinite(lat) && Number.isFinite(lng)
  // Últimas coordenadas recibidas: se aplican en cuanto Leaflet termina de cargar.
  const coords = useRef(null)
  coords.current = hayUbicacion ? [lat, lng] : null
  // true cuando el cambio vino del propio mapa (toque o arrastre): el pin ya
  // está donde debe y la vista no se mueve de golpe.
  const movidoAqui = useRef(false)

  const aplicar = () => {
    const m = mapa.current
    const p = pin.current
    if (!m || !p) return
    if (movidoAqui.current) {
      movidoAqui.current = false
      return
    }
    if (coords.current) {
      p.setLatLng(coords.current).addTo(m)
      m.setView(coords.current, 16)
    } else {
      p.remove()
      m.setView([MEXICO.lat, MEXICO.lng], 4)
    }
  }

  // Crear el mapa una sola vez.
  useEffect(() => {
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !contenedor.current) return
      const m = L.map(contenedor.current, { scrollWheelZoom: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Ubicación: HERE',
      }).addTo(m)
      // Pin con CSS (los íconos PNG de Leaflet no sobreviven al empaquetador).
      const icono = L.divIcon({ className: 'pin-envio', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] })
      const p = L.marker([MEXICO.lat, MEXICO.lng], { icon: icono, draggable: editable, keyboard: editable, title: etiqueta })
      if (editable) {
        p.on('dragend', () => {
          const ll = p.getLatLng()
          movidoAqui.current = true
          alMover.current?.({ lat: ll.lat, lng: ll.lng })
        })
        // Tocar el mapa pone el pin y acerca de a poco (4 niveles por toque),
        // así se puede ir afinando sin perder de vista dónde quedó.
        m.on('click', (e) => {
          p.setLatLng(e.latlng).addTo(m)
          m.setView(e.latlng, Math.min(m.getZoom() + 4, 18))
          movidoAqui.current = true
          alMover.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
        })
      }
      mapa.current = m
      pin.current = p
      aplicar()
      // El contenedor puede medir 0 al montarse (paneles que se despliegan).
      setTimeout(() => m.invalidateSize(), 0)
    })
    return () => {
      vivo = false
      mapa.current?.remove()
      mapa.current = null
      pin.current = null
    }
  }, [editable])

  // Mover el pin cuando cambian las coordenadas.
  useEffect(aplicar, [lat, lng])

  return (
    <div className="mapa">
      <div ref={contenedor} className="mapa-lienzo" style={{ height: alto }} role="region" aria-label={etiqueta} />
      {hayUbicacion ? (
        <a className="mapa-enlace" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
          Abrir en el mapa ↗
        </a>
      ) : (
        <small className="mapa-sin">Sin ubicación todavía{editable ? ': toca el mapa para poner el pin.' : '.'}</small>
      )}
    </div>
  )
}
