// Campos de la dirección física. Los usan el registro y "Mi cuenta".
// Con "valores" + "onChange" es controlado; sin ellos, los lee el FormData del form.
import { ESTADOS_MX } from '../lib/estados.js'

// leyenda=false cuando el formulario ya tiene su propio título.
export default function CamposDireccion({ valores, onChange, leyenda = true }) {
  const prop = (nombre) =>
    valores ? { value: valores[nombre], onChange: (e) => onChange(nombre, e.target.value) } : { name: nombre }
  return (
    <fieldset className="campos-direccion">
      {leyenda && <legend>Dirección de envío</legend>}
      <label>
        Calle y número
        <input required maxLength={150} autoComplete="street-address" {...prop('calle')} />
      </label>
      <label>
        Colonia
        <input required maxLength={100} {...prop('colonia')} />
      </label>
      <label>
        Ciudad o municipio
        <input required maxLength={100} autoComplete="address-level2" {...prop('ciudad')} />
      </label>
      <label>
        Estado
        <select required autoComplete="address-level1" defaultValue={valores ? undefined : ''} {...prop('estado')}>
          <option value="" disabled>Elige…</option>
          {ESTADOS_MX.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <label>
        Código postal
        <input required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" {...prop('codigoPostal')} />
      </label>
    </fieldset>
  )
}
