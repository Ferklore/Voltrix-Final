// Subconjunto de los catálogos del SAT (Anexo 20, catCFDI) que usa la tienda.
// Las mismas claves están como enumeraciones en esquema/cfdi.xsd, así que un
// valor fuera de catálogo lo rechaza también la validación por XSD.
// ponytail: son solo las claves que una tienda en línea necesita; si se vende
// algo más (servicios, exportación), hay que agregar sus claves aquí y en el XSD.

// c_RegimenFiscal. fisica/moral = a qué tipo de RFC aplica.
export const REGIMENES = {
  601: { descripcion: 'General de Ley Personas Morales', fisica: false, moral: true },
  603: { descripcion: 'Personas Morales con Fines no Lucrativos', fisica: false, moral: true },
  605: { descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', fisica: true, moral: false },
  606: { descripcion: 'Arrendamiento', fisica: true, moral: false },
  612: { descripcion: 'Personas Físicas con Actividades Empresariales y Profesionales', fisica: true, moral: false },
  616: { descripcion: 'Sin obligaciones fiscales', fisica: true, moral: false },
  621: { descripcion: 'Incorporación Fiscal', fisica: true, moral: false },
  625: { descripcion: 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', fisica: true, moral: false },
  626: { descripcion: 'Régimen Simplificado de Confianza', fisica: true, moral: true },
}

// c_UsoCFDI con los regímenes del receptor que lo pueden usar.
const GASTOS = ['601', '603', '606', '612', '620', '621', '622', '623', '624', '625', '626']
export const USOS_CFDI = {
  G01: { descripcion: 'Adquisición de mercancías', regimenes: GASTOS },
  G03: { descripcion: 'Gastos en general', regimenes: GASTOS },
  I04: { descripcion: 'Equipo de computo y accesorios', regimenes: GASTOS },
  I08: { descripcion: 'Otra maquinaria y equipo', regimenes: GASTOS },
  S01: { descripcion: 'Sin efectos fiscales', regimenes: Object.keys(REGIMENES) },
}

// c_FormaPago: cómo se cobró. PayPal es un intermediario de pagos (31);
// Mercado Pago cobra con tarjeta (04 crédito / 28 débito).
export const FORMAS_PAGO = {
  '04': 'Tarjeta de crédito',
  28: 'Tarjeta de débito',
  31: 'Intermediario pagos',
  99: 'Por definir',
}
export const FORMA_PAGO_PROVEEDOR = { PAYPAL: '31', MERCADOPAGO: '04' }

export const METODOS_PAGO = { PUE: 'Pago en una sola exhibición' }
export const MONEDAS = { MXN: 2 } // clave -> decimales
export const CLAVES_UNIDAD = { H87: 'Pieza', E48: 'Unidad de servicio', KT: 'Kit' }
export const OBJETOS_IMP = { '02': 'Sí objeto de impuesto' }
export const IMPUESTOS = { '002': 'IVA' }
export const TASA_IVA = '0.160000'

export const RFC_PUBLICO_GENERAL = 'XAXX010101000'
export const RFC_EXTRANJERO = 'XEXX010101000'

// RFC: 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave de 3.
export const PATRON_RFC = /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[012])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$/
export const tipoRfc = (rfc) => (rfc.length === 12 ? 'moral' : 'fisica')
// Para los mensajes al usuario.
export const nombreTipoRfc = (rfc) => (rfc.length === 12 ? 'moral' : 'física')
