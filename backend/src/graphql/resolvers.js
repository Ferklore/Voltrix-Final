// Resolvers: el código que responde cada campo del esquema contra PostgreSQL.
import { GraphQLError } from 'graphql'
import { pool } from '../db.js'
import { cancelarPedido } from '../pedidos.js'
import { PEDIDO_CAMBIO, PRODUCTO_CAMBIO, publicarPedido, publicarProducto, publicarStock, pubsub } from '../eventos.js'
import { confirmarPago, crearOrdenPaypal, pagarConTarjeta, proveedoresDisponibles } from '../pagos/index.js'
import { generarPrefactura, prefacturaDe } from '../cfdi/index.js'
import { normalizarDatosFiscales } from '../cfdi/validar.js'
import { REGIMENES, USOS_CFDI } from '../cfdi/catalogos.js'
import { direccionDeFila, normalizarDireccion } from '../direccion.js'
import { avisarPedidoCreado, avisarStockBajo } from '../correo/avisos.js'
import { coleccion } from '../mongo/conexion.js'
import { borrarFicha, guardarFicha, normalizarFicha, obtenerFicha } from '../mongo/fichas.js'
import { borrarResenasDeProducto, eliminarResena, guardarResena, listarResenas, normalizarResena, resumenResenas } from '../mongo/resenas.js'
import { TIPOS_EVENTO, listarBitacora, registrar } from '../mongo/bitacora.js'
import { historialPedido } from '../mongo/pedidos.js'
import { listarKits, recomendarKit } from '../kits/recomendador.js'
import { buscarProductos } from '../catalogo.js'
import { GOOGLE_CLIENT_ID } from '../google.js'
import { cloudinaryConfigurado, copiarImagenRemota, firmaSubidaImagen, imagenPermitida } from '../cloudinary.js'
import { ErrorMouser, buscarEnMouser, esImagenDeMouser, mouserConfigurado } from '../mouser.js'

// Error de negocio: el código le dice al front que puede mostrar el mensaje.
const errorDeNegocio = (mensaje, code) => new GraphQLError(mensaje, { extensions: { code } })

function requiereUsuario(ctx) {
  if (!ctx.usuario) throw errorDeNegocio('Inicia sesión para continuar.', 'UNAUTHENTICATED')
  return ctx.usuario
}

function requiereAdmin(ctx) {
  if (requiereUsuario(ctx).rol !== 'ADMIN') throw errorDeNegocio('No tienes permiso.', 'FORBIDDEN')
}

const uno = async (sql, params) => (await pool.query(sql, params)).rows[0] || null
const varios = async (sql, params) => (await pool.query(sql, params)).rows

export const resolvers = {
  Query: {
    productos: (_, filtros) => buscarProductos(filtros),
    producto: (_, { id }) => uno('SELECT * FROM producto WHERE id = $1', [id]),
    categorias: () => varios('SELECT * FROM categoria ORDER BY id'),
    categoria: (_, { id }) => uno('SELECT * FROM categoria WHERE id = $1', [id]),
    yo: (_, __, ctx) => ctx.usuario,
    usuarios: (_, __, ctx) => {
      requiereAdmin(ctx)
      return varios('SELECT id, nombre, email, rol FROM usuario ORDER BY id')
    },
    pedidos: (_, { status }, ctx) => {
      requiereAdmin(ctx)
      return status
        ? varios('SELECT * FROM pedido WHERE status = $1 ORDER BY id DESC', [status])
        : varios('SELECT * FROM pedido ORDER BY id DESC')
    },
    pedido: async (_, { id }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const pedido = await uno('SELECT * FROM pedido WHERE id = $1', [id])
      // A quien no es dueño se le responde igual que si no existiera.
      if (!pedido || (pedido.usuario_id !== usuario.id && usuario.rol !== 'ADMIN')) return null
      return pedido
    },
    metodosPago: () => proveedoresDisponibles(),
    bitacora: (_, filtros, ctx) => {
      requiereAdmin(ctx)
      return listarBitacora(filtros)
    },
    tiposBitacora: () => TIPOS_EVENTO,
    kits: () => listarKits(),
    googleClientId: () => GOOGLE_CLIENT_ID || null,
    subidaImagenesDisponible: () => cloudinaryConfigurado(),
    mouserDisponible: () => mouserConfigurado(),
    buscarEnMouser: async (_, filtros, ctx) => {
      requiereAdmin(ctx)
      try {
        return await buscarEnMouser(filtros)
      } catch (err) {
        if (err instanceof ErrorMouser) throw errorDeNegocio(err.message, 'MOUSER')
        throw err
      }
    },
    recomendarKit: (_, { proyecto, kitId, presupuesto }) => {
      if (!proyecto?.trim() && !kitId) throw errorDeNegocio('Describe tu proyecto o elige un kit.', 'KIT_SIN_DATOS')
      if (proyecto && proyecto.length > 500) throw errorDeNegocio('Describe tu proyecto en menos de 500 caracteres.', 'KIT_SIN_DATOS')
      if (presupuesto != null && !(presupuesto > 0)) throw errorDeNegocio('El presupuesto tiene que ser mayor que cero.', 'KIT_SIN_DATOS')
      return recomendarKit({ proyecto, kitId, presupuesto })
    },
    mongoDisponible: async () => Boolean(await coleccion('fichas')),
    catalogosCfdi: () => ({
      regimenesFiscales: Object.entries(REGIMENES).map(([clave, r]) => ({ clave, descripcion: r.descripcion })),
      usosCfdi: Object.entries(USOS_CFDI).map(([clave, u]) => ({ clave, descripcion: u.descripcion })),
    }),
    resumenAdmin: (_, { dias, stockMinimo }, ctx) => {
      requiereAdmin(ctx)
      return resumenAdmin(Math.min(Math.max(dias, 1), 90), stockMinimo)
    },
  },

  Mutation: {
    agregarADeseos: async (_, { productoId }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const producto = await uno('SELECT * FROM producto WHERE id = $1', [productoId])
      if (!producto) throw errorDeNegocio('Ese producto no existe.', 'PRODUCTO_NO_EXISTE')
      await pool.query(
        'INSERT INTO lista_deseos (usuario_id, producto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [usuario.id, producto.id]
      )
      return producto
    },

    quitarDeDeseos: async (_, { productoId }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const { rowCount } = await pool.query('DELETE FROM lista_deseos WHERE usuario_id = $1 AND producto_id = $2', [usuario.id, productoId])
      return rowCount > 0
    },

    importarImagenMouser: async (_, { url }, ctx) => {
      requiereAdmin(ctx)
      if (!cloudinaryConfigurado()) throw errorDeNegocio('Para importar imágenes configura CLOUDINARY_URL.', 'CLOUDINARY_NO_CONFIGURADO')
      if (!esImagenDeMouser(url)) throw errorDeNegocio('Solo se importan imágenes de mouser.com.', 'IMAGEN_INVALIDA')
      try {
        return await copiarImagenRemota(url, esImagenDeMouser)
      } catch (err) {
        throw errorDeNegocio(`No se pudo copiar la imagen: ${err.message}`, 'IMAGEN_INVALIDA')
      }
    },

    firmarSubidaImagen: (_, __, ctx) => {
      requiereAdmin(ctx)
      const firma = firmaSubidaImagen()
      if (!firma) throw errorDeNegocio('La subida de imágenes no está configurada (CLOUDINARY_URL).', 'CLOUDINARY_NO_CONFIGURADO')
      return firma
    },

    guardarFicha: async (_, { productoId, datos }, ctx) => {
      requiereAdmin(ctx)
      if (!(await uno('SELECT 1 AS ok FROM producto WHERE id = $1', [productoId]))) {
        throw errorDeNegocio('Ese producto no existe.', 'PRODUCTO_NO_EXISTE')
      }
      let ficha
      try {
        ficha = normalizarFicha(datos)
      } catch (err) {
        throw errorDeNegocio(err.message, 'FICHA_INVALIDA')
      }
      const guardada = await guardarFicha(productoId, ficha)
      if (!guardada) throw sinMongo()
      registrar('PRODUCTO_ACTUALIZADO', `Ficha técnica del producto #${productoId}`, { usuarioId: ctx.usuario.id, datos: { productoId: Number(productoId) } })
      return guardada
    },

    guardarResena: async (_, { productoId, calificacion, comentario }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const producto = await uno('SELECT id, nombre FROM producto WHERE id = $1', [productoId])
      if (!producto) throw errorDeNegocio('Ese producto no existe.', 'PRODUCTO_NO_EXISTE')
      let datos
      try {
        datos = normalizarResena({ calificacion, comentario })
      } catch (err) {
        throw errorDeNegocio(err.message, 'RESENA_INVALIDA')
      }
      const resena = await guardarResena(usuario, producto.id, datos)
      if (!resena) throw sinMongo()
      registrar('RESENA', `${calificacion}★ a "${producto.nombre}"`, { usuarioId: usuario.id, datos: { productoId: producto.id } })
      return resena
    },

    eliminarResena: (_, { id }, ctx) => eliminarResena(requiereUsuario(ctx), id),

    guardarDatosFiscales: async (_, { datos }, ctx) => {
      const usuario = requiereUsuario(ctx)
      let d
      try {
        d = normalizarDatosFiscales(datos)
      } catch (err) {
        throw errorDeNegocio(err.message, 'DATOS_FISCALES_INVALIDOS')
      }
      await pool.query(
        `UPDATE usuario SET rfc = $1, razon_social = $2, cp_fiscal = $3, regimen_fiscal = $4, uso_cfdi = $5 WHERE id = $6`,
        [d.rfc, d.razonSocial, d.codigoPostal, d.regimenFiscal, d.usoCfdi, usuario.id]
      )
      return usuario
    },

    borrarDatosFiscales: async (_, __, ctx) => {
      const usuario = requiereUsuario(ctx)
      await pool.query(
        'UPDATE usuario SET rfc = NULL, razon_social = NULL, cp_fiscal = NULL, regimen_fiscal = NULL, uso_cfdi = NULL WHERE id = $1',
        [usuario.id]
      )
      return usuario
    },

    regenerarPrefactura: async (_, { pedidoId }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const pedido = await uno('SELECT * FROM pedido WHERE id = $1', [pedidoId])
      if (!pedido || (pedido.usuario_id !== usuario.id && usuario.rol !== 'ADMIN')) {
        throw errorDeNegocio('No encontramos ese pedido.', 'PEDIDO_NO_EXISTE')
      }
      return generarPrefactura(pedido.id)
    },

    crearProducto: async (_, { datos }, ctx) => {
      requiereAdmin(ctx)
      const { nombre, precio, imagen, especificaciones, categoriaId, stock, precioAnterior, claveProdServ } = validarProducto(datos)
      const producto = await uno(
        `INSERT INTO producto (nombre, precio, imagen, especificaciones, stock, categoria_id, precio_anterior, clave_prod_serv)
         VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8, '01010101')) RETURNING *`,
        [nombre, precio, imagen || null, especificaciones || null, stock, categoriaId || null, precioAnterior, claveProdServ]
      )
      publicarProducto('NUEVO', producto)
      registrar('PRODUCTO_CREADO', `"${producto.nombre}" ($${producto.precio}, ${producto.stock} pzas)`, { usuarioId: ctx.usuario.id, datos: { productoId: producto.id } })
      return producto
    },

    actualizarProducto: async (_, { id, datos }, ctx) => {
      requiereAdmin(ctx)
      const { nombre, precio, imagen, especificaciones, categoriaId, stock, precioAnterior, claveProdServ } = validarProducto(datos)
      const producto = await uno(
        `UPDATE producto
            SET nombre = $1, precio = $2, imagen = $3, especificaciones = $4, stock = $5, categoria_id = $6,
                precio_anterior = $8, clave_prod_serv = coalesce($9, clave_prod_serv)
          WHERE id = $7 RETURNING *`,
        [nombre, precio, imagen || null, especificaciones || null, stock, categoriaId || null, id, precioAnterior, claveProdServ]
      )
      publicarProducto('ACTUALIZADO', producto)
      if (producto) {
        registrar('PRODUCTO_ACTUALIZADO', `"${producto.nombre}" ($${producto.precio}, ${producto.stock} pzas)`, { usuarioId: ctx.usuario.id, datos: { productoId: producto.id } })
      }
      return producto
    },

    eliminarProducto: async (_, { id }, ctx) => {
      requiereAdmin(ctx)
      try {
        const { rows } = await pool.query('DELETE FROM producto WHERE id = $1 RETURNING *', [id])
        publicarProducto('ELIMINADO', rows[0])
        if (rows[0]) {
          registrar('PRODUCTO_ELIMINADO', `"${rows[0].nombre}"`, { usuarioId: ctx.usuario.id, datos: { productoId: rows[0].id } })
          borrarFicha(rows[0].id).catch(() => {})
          borrarResenasDeProducto(rows[0].id).catch(() => {})
        }
        return rows.length > 0
      } catch (err) {
        if (err.code === '23503') {
          throw errorDeNegocio('El producto tiene pedidos; mejor deja su stock en 0.', 'PRODUCTO_CON_PEDIDOS')
        }
        throw err
      }
    },

    crearCategoria: (_, { datos }, ctx) => {
      requiereAdmin(ctx)
      const { nombre, descripcion } = validarCategoria(datos)
      return uno('INSERT INTO categoria (nombre, descripcion) VALUES ($1, $2) RETURNING *', [nombre, descripcion])
    },

    actualizarCategoria: (_, { id, datos }, ctx) => {
      requiereAdmin(ctx)
      const { nombre, descripcion } = validarCategoria(datos)
      return uno('UPDATE categoria SET nombre = $1, descripcion = $2 WHERE id = $3 RETURNING *', [nombre, descripcion, id])
    },

    eliminarCategoria: async (_, { id }, ctx) => {
      requiereAdmin(ctx)
      try {
        const { rowCount } = await pool.query('DELETE FROM categoria WHERE id = $1', [id])
        return rowCount > 0
      } catch (err) {
        if (err.code === '23503') {
          throw errorDeNegocio('La categoría tiene productos; muévelos a otra antes de eliminarla.', 'CATEGORIA_CON_PRODUCTOS')
        }
        throw err
      }
    },

    guardarDireccion: async (_, { datos }, ctx) => {
      const usuario = requiereUsuario(ctx)
      let d
      try {
        d = normalizarDireccion(datos)
      } catch (err) {
        throw errorDeNegocio(err.message, 'DIRECCION_INVALIDA')
      }
      await pool.query(
        'UPDATE usuario SET calle = $1, colonia = $2, ciudad = $3, estado = $4, codigo_postal = $5 WHERE id = $6',
        [d.calle, d.colonia, d.ciudad, d.estado, d.codigoPostal, usuario.id]
      )
      return usuario
    },

    cambiarStatusPedido: async (_, { id, status }, ctx) => {
      requiereAdmin(ctx)
      const actual = await uno('SELECT * FROM pedido WHERE id = $1', [id])
      if (!actual) return null
      if (actual.status === status) return actual
      // Cancelar devuelve el stock; por eso un cancelado ya no se puede revivir.
      if (actual.status === 'CANCELADO') {
        throw errorDeNegocio('Un pedido cancelado ya devolvió su stock; no se puede reactivar.', 'PEDIDO_CANCELADO')
      }
      if (status === 'CANCELADO') return cancelarPedido(id)
      const pedido = await uno('UPDATE pedido SET status = $1 WHERE id = $2 RETURNING *', [status, id])
      publicarPedido('ACTUALIZADO', pedido)
      return pedido
    },

    cambiarRol: (_, { id, rol }, ctx) => {
      requiereAdmin(ctx)
      if (String(ctx.usuario.id) === String(id)) {
        throw errorDeNegocio('No puedes cambiar tu propio rol.', 'ROL_PROPIO')
      }
      return uno('UPDATE usuario SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, rol', [rol, id])
    },

    cancelarPedido: async (_, { id }, ctx) => {
      const usuario = requiereUsuario(ctx)
      const pedido = await uno('SELECT * FROM pedido WHERE id = $1', [id])
      if (!pedido || pedido.usuario_id !== usuario.id) return null
      if (pedido.status !== 'PENDIENTE') {
        throw errorDeNegocio('Solo puedes cancelar pedidos que no has pagado.', 'PEDIDO_NO_PENDIENTE')
      }
      return cancelarPedido(id)
    },

    crearOrdenPaypal: (_, { pedidoId }, ctx) => crearOrdenPaypal(requiereUsuario(ctx), pedidoId),

    pagarConTarjeta: (_, { pedidoId, tarjeta }, ctx) => pagarConTarjeta(requiereUsuario(ctx), pedidoId, tarjeta),

    confirmarPago: (_, { pedidoId, proveedor, referencia }, ctx) =>
      confirmarPago(requiereUsuario(ctx), pedidoId, proveedor, referencia),

    // Registra el pedido, sus renglones y descuenta stock en una transacción.
    crearPedido: async (_, { items }, ctx) => {
      const usuario = requiereUsuario(ctx)
      if (!items.length) throw errorDeNegocio('Tu carrito está vacío.', 'CARRITO_VACIO')

      // Un producto repetido suma cantidades antes de validar contra el stock.
      const pedidas = new Map()
      for (const { productoId, cantidad } of items) {
        if (!Number.isInteger(cantidad) || cantidad < 1) {
          throw errorDeNegocio('La cantidad de cada producto tiene que ser un entero mayor que cero.', 'CANTIDAD_INVALIDA')
        }
        pedidas.set(productoId, (pedidas.get(productoId) || 0) + cantidad)
      }

      const conn = await pool.connect()
      try {
        await conn.query('BEGIN')
        let total = 0
        const detalles = []
        const cambiosStock = []
        // Orden fijo de ids: dos pedidos simultáneos bloquean en el mismo orden
        // y no se traban entre sí.
        for (const [productoId, cantidad] of [...pedidas].sort((a, b) => a[0] - b[0])) {
          const { rows } = await conn.query('SELECT * FROM producto WHERE id = $1 FOR UPDATE', [productoId])
          const producto = rows[0]
          if (!producto) {
            throw errorDeNegocio('Uno de los productos de tu carrito ya no está disponible.', 'PRODUCTO_NO_EXISTE')
          }
          if (producto.stock < cantidad) {
            throw errorDeNegocio(
              producto.stock === 0
                ? `Nos quedamos sin "${producto.nombre}".`
                : `Solo quedan ${producto.stock} de "${producto.nombre}" y pediste ${cantidad}.`,
              'STOCK_INSUFICIENTE'
            )
          }
          cambiosStock.push({ id: producto.id, antes: producto.stock, despues: producto.stock - cantidad })
          const subtotal = Math.round(producto.precio * cantidad * 100) / 100
          total += subtotal
          detalles.push({ productoId, cantidad, subtotal })
        }

        const { rows } = await conn.query(
          'INSERT INTO pedido (total, usuario_id) VALUES ($1, $2) RETURNING *',
          [Math.round(total * 100) / 100, usuario.id]
        )
        const pedido = rows[0]
        for (const d of detalles) {
          await conn.query(
            'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, subtotal) VALUES ($1, $2, $3, $4)',
            [pedido.id, d.productoId, d.cantidad, d.subtotal]
          )
          await conn.query('UPDATE producto SET stock = stock - $1 WHERE id = $2', [d.cantidad, d.productoId])
        }
        await conn.query('COMMIT')
        publicarPedido('NUEVO', pedido)
        publicarStock(detalles.map((d) => d.productoId))
        avisarPedidoCreado(pedido.id) // RF4.4
        avisarStockBajo(cambiosStock) // RF6.2
        return pedido
      } catch (err) {
        await conn.query('ROLLBACK')
        throw err
      } finally {
        conn.release()
      }
    },
  },

  // Cada suscripción revisa el token de la conexión; solo un ADMIN escucha.
  Subscription: {
    pedidoCambio: {
      subscribe: (_, __, ctx) => {
        requiereAdmin(ctx)
        return pubsub.asyncIterableIterator(PEDIDO_CAMBIO)
      },
      resolve: (evento) => evento,
    },
    productoCambio: {
      subscribe: (_, __, ctx) => {
        requiereAdmin(ctx)
        return pubsub.asyncIterableIterator(PRODUCTO_CAMBIO)
      },
      resolve: (evento) => evento,
    },
  },

  Producto: {
    categoria: (p) => p.categoria_id && uno('SELECT * FROM categoria WHERE id = $1', [p.categoria_id]),
    precioAnterior: (p) => (enOferta(p) ? p.precio_anterior : null),
    enOferta: (p) => enOferta(p),
    descuento: (p) => (enOferta(p) ? Math.round((1 - p.precio / p.precio_anterior) * 100) : 0),
    claveProdServ: (p) => p.clave_prod_serv || '01010101',
    ficha: (p) => obtenerFicha(p.id),
    enMiLista: async (p, _, ctx) =>
      Boolean(ctx.usuario && (await uno('SELECT 1 AS si FROM lista_deseos WHERE usuario_id = $1 AND producto_id = $2', [ctx.usuario.id, p.id]))),
    calificacion: (p) => resumenResenas(p.id),
    resenas: (p, { limite }) => listarResenas(p.id, limite),
    // buscarProductos ya lo trae calculado; las demás consultas lo piden aparte.
    vendidos: async (p) =>
      p.vendidos ??
      (await uno(
        `SELECT coalesce(sum(d.cantidad), 0)::int AS n FROM detalle_pedido d
           JOIN pedido pe ON pe.id = d.pedido_id AND pe.${VENDIDO} WHERE d.producto_id = $1`,
        [p.id]
      )).n,
  },
  Categoria: {
    productos: (c) => varios('SELECT * FROM producto WHERE categoria_id = $1 ORDER BY id', [c.id]),
    cantidadProductos: async (c) =>
      (await uno('SELECT count(*)::int AS n FROM producto WHERE categoria_id = $1', [c.id])).n,
  },
  Usuario: {
    pedidos: (u, _, ctx) => {
      requiereUsuario(ctx)
      if (ctx.usuario.id !== u.id && ctx.usuario.rol !== 'ADMIN') return []
      return varios('SELECT * FROM pedido WHERE usuario_id = $1 ORDER BY id DESC', [u.id])
    },
    listaDeseos: (u, _, ctx) => {
      requiereUsuario(ctx)
      // Es privada: ni un ADMIN ve la lista de otro.
      if (ctx.usuario.id !== u.id) return []
      return varios(
        `SELECT p.* FROM lista_deseos l JOIN producto p ON p.id = l.producto_id
          WHERE l.usuario_id = $1 ORDER BY l.creado DESC`,
        [u.id]
      )
    },
    direccion: async (u, _, ctx) => {
      requiereUsuario(ctx)
      if (ctx.usuario.id !== u.id && ctx.usuario.rol !== 'ADMIN') return null
      return direccionDeFila(await uno('SELECT calle, colonia, ciudad, estado, codigo_postal FROM usuario WHERE id = $1', [u.id]))
    },
    datosFiscales: async (u, _, ctx) => {
      requiereUsuario(ctx)
      if (ctx.usuario.id !== u.id && ctx.usuario.rol !== 'ADMIN') return null
      const f = await uno('SELECT rfc, razon_social, cp_fiscal, regimen_fiscal, uso_cfdi FROM usuario WHERE id = $1', [u.id])
      if (!f?.rfc) return null
      return { rfc: f.rfc, razonSocial: f.razon_social, codigoPostal: f.cp_fiscal, regimenFiscal: f.regimen_fiscal, usoCfdi: f.uso_cfdi }
    },
  },
  Pedido: {
    usuario: (p) => uno('SELECT id, nombre, email, rol FROM usuario WHERE id = $1', [p.usuario_id]),
    detalles: (p) => varios('SELECT * FROM detalle_pedido WHERE pedido_id = $1 ORDER BY id', [p.id]),
    pagos: (p) => varios('SELECT * FROM pago WHERE pedido_id = $1 ORDER BY id DESC', [p.id]),
    // Quien ve el pedido (dueño o ADMIN) ve su prefactura.
    prefactura: (p) => prefacturaDe(p),
    historial: (p) => historialPedido(p.id),
  },
  Ficha: {
    actualizado: (f) => f.actualizado.toISOString(),
  },
  Resena: {
    id: (r) => String(r._id),
    fecha: (r) => r.fecha.toISOString(),
    propia: (r, _, ctx) => Boolean(ctx.usuario && ctx.usuario.id === r.usuarioId),
  },
  CambioEstado: {
    fecha: (c) => c.fecha.toISOString(),
  },
  EventoBitacora: {
    id: (e) => String(e._id),
    fecha: (e) => e.fecha.toISOString(),
    datos: (e) => (e.datos == null ? null : JSON.stringify(e.datos)),
  },
  Prefactura: {
    fecha: (f) => f.fecha.toISOString(),
    receptorRfc: (f) => f.receptor_rfc,
    respaldada: (f) => Boolean(f.respaldo),
  },
  Pago: {
    idTransaccion: (p) => p.id_transaccion,
    creado: (p) => p.creado.toISOString(),
  },
  ProductoVendido: {
    producto: (v) => uno('SELECT * FROM producto WHERE id = $1', [v.producto_id]),
  },
  DetallePedido: {
    producto: (d) => uno('SELECT * FROM producto WHERE id = $1', [d.producto_id]),
  },
}

const sinMongo = () =>
  errorDeNegocio('Esta función necesita MongoDB y no está disponible ahora. Intenta más tarde.', 'MONGO_NO_DISPONIBLE')

const enOferta = (p) => p.precio_anterior != null && p.precio_anterior > p.precio

// Valida lo que manda el formulario de productos del admin.
function validarProducto(datos) {
  const { precio, precioAnterior } = datos
  if (!(precio >= 0)) throw errorDeNegocio('El precio no puede ser negativo.', 'PRODUCTO_INVALIDO')
  if (precioAnterior != null && !(precioAnterior > precio)) {
    throw errorDeNegocio('El precio anterior tiene que ser mayor que el precio de oferta.', 'PRODUCTO_INVALIDO')
  }
  if (!imagenPermitida(datos.imagen?.trim())) {
    throw errorDeNegocio('La imagen debe ser una ruta de la tienda (/productos/…) o una URL de Cloudinary.', 'PRODUCTO_INVALIDO')
  }
  const clave = datos.claveProdServ?.trim() || null
  if (clave && !/^\d{8}$/.test(clave)) {
    throw errorDeNegocio('La clave SAT del producto son 8 dígitos (p. ej. 01010101).', 'PRODUCTO_INVALIDO')
  }
  return { ...datos, precioAnterior: precioAnterior ?? null, claveProdServ: clave }
}

function validarCategoria(datos) {
  const nombre = String(datos.nombre ?? '').trim()
  const descripcion = String(datos.descripcion ?? '').trim() || null
  if (!nombre || nombre.length > 100) throw errorDeNegocio('Escribe el nombre de la categoría (máx. 100).', 'CATEGORIA_INVALIDA')
  if (descripcion && descripcion.length > 255) throw errorDeNegocio('La descripción es muy larga (máx. 255).', 'CATEGORIA_INVALIDA')
  return { nombre, descripcion }
}

// Métricas del admin dashboard. "Vendido" = PAGADO, ENVIADO o ENTREGADO.
const VENDIDO = `status IN ('PAGADO', 'ENVIADO', 'ENTREGADO')`

async function resumenAdmin(dias, stockMinimo) {
  const [totales, porStatus, ventasPorDia, masVendidos, stockBajo, porProveedor] = await Promise.all([
    uno(`SELECT coalesce(sum(total) FILTER (WHERE ${VENDIDO}), 0)::float AS ventas,
                count(*) FILTER (WHERE ${VENDIDO})::int                 AS pedidos_vendidos,
                count(*) FILTER (WHERE status = 'PENDIENTE')::int       AS pendientes,
                count(*) FILTER (WHERE status = 'PAGADO')::int          AS por_enviar,
                (SELECT count(*) FROM usuario WHERE rol = 'CLIENTE')::int AS clientes
           FROM pedido`),
    varios(`SELECT s.status, count(p.id)::int AS pedidos, coalesce(sum(p.total), 0)::float AS monto
              FROM unnest(enum_range(NULL::status_pedido)) AS s(status)
              LEFT JOIN pedido p ON p.status = s.status
             GROUP BY s.status ORDER BY s.status`),
    // generate_series rellena con 0 los días sin ventas, para que la gráfica no tenga huecos.
    varios(`SELECT to_char(d, 'YYYY-MM-DD') AS fecha, count(p.id)::int AS pedidos, coalesce(sum(p.total), 0)::float AS monto
              FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') AS d
              LEFT JOIN pedido p ON p.fecha = d::date AND p.${VENDIDO}
             GROUP BY d ORDER BY d`, [dias]),
    varios(`SELECT d.producto_id, sum(d.cantidad)::int AS unidades, sum(d.subtotal)::float AS monto
              FROM detalle_pedido d JOIN pedido p ON p.id = d.pedido_id AND p.${VENDIDO}
             GROUP BY d.producto_id ORDER BY unidades DESC, monto DESC LIMIT 5`),
    varios('SELECT * FROM producto WHERE stock <= $1 ORDER BY stock, id', [stockMinimo]),
    varios(`SELECT proveedor, count(*)::int AS pagos, sum(monto)::float AS monto
              FROM pago WHERE estado = 'APROBADO' GROUP BY proveedor ORDER BY proveedor`),
  ])
  return {
    ventas: totales.ventas,
    pedidosVendidos: totales.pedidos_vendidos,
    ticketPromedio: totales.pedidos_vendidos ? Math.round((totales.ventas / totales.pedidos_vendidos) * 100) / 100 : 0,
    pendientesDePago: totales.pendientes,
    porEnviar: totales.por_enviar,
    clientes: totales.clientes,
    porStatus,
    ventasPorDia,
    masVendidos,
    stockBajo,
    porProveedor,
  }
}

// ponytail: sin DataLoader; las relaciones hacen una consulta por renglón (N+1).
// Con catálogos de cientos de productos, agrupar con dataloader.
