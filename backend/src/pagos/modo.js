// Modo de pagos. Por defecto la tienda es de PRUEBA: no debe cobrar dinero real
// aunque alguien pegue por error credenciales de producción. Para cobrar de
// verdad hay que escribir a propósito PAGOS_MODO=produccion en el .env.
export const MODO_PRUEBA = (process.env.PAGOS_MODO || 'prueba').trim().toLowerCase() !== 'produccion'
