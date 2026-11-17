// Dirección física del cliente (RF1.1): se pide al registrarse y se puede
// cambiar en "Mi cuenta". Devuelve los datos limpios o lanza un mensaje que se
// le puede mostrar al usuario.
// La misma lista está en frontend/src/lib/estados.js para el selector.
export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

const texto = (v) => String(v ?? '').trim().replace(/\s+/g, ' ')

export function normalizarDireccion(d) {
  if (!d || typeof d !== 'object') throw new Error('Escribe tu dirección.')
  const dir = {
    calle: texto(d.calle),
    colonia: texto(d.colonia),
    ciudad: texto(d.ciudad),
    estado: texto(d.estado),
    codigoPostal: texto(d.codigoPostal),
  }
  if (!dir.calle || dir.calle.length > 150) throw new Error('Escribe la calle y el número.')
  if (!dir.colonia || dir.colonia.length > 100) throw new Error('Escribe la colonia.')
  if (!dir.ciudad || dir.ciudad.length > 100) throw new Error('Escribe la ciudad o municipio.')
  if (!ESTADOS_MX.includes(dir.estado)) throw new Error('Elige un estado de la lista.')
  if (!/^\d{5}$/.test(dir.codigoPostal)) throw new Error('El código postal debe tener 5 dígitos.')
  return dir
}

// Columnas de la dirección en la tabla usuario (para los SELECT).
export const COLUMNAS_DIRECCION = 'calle, colonia, ciudad, estado, codigo_postal, lat, lng'

// Fila de la tabla usuario -> tipo Direccion de GraphQL (null si no tiene).
export const direccionDeFila = (u) =>
  u?.calle
    ? {
        calle: u.calle,
        colonia: u.colonia,
        ciudad: u.ciudad,
        estado: u.estado,
        codigoPostal: u.codigo_postal,
        lat: u.lat ?? null,
        lng: u.lng ?? null,
      }
    : null
