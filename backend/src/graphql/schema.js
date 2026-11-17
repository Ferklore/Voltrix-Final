// Esquema GraphQL: qué tipos, consultas y mutaciones expone la API.
export const typeDefs = /* GraphQL */ `
  type Categoria {
    id: ID!
    nombre: String!
    descripcion: String
    productos: [Producto!]!
    cantidadProductos: Int!
  }

  type Producto {
    id: ID!
    nombre: String!
    precio: Float!
    "Precio antes de la oferta. Solo viene si es mayor que precio."
    precioAnterior: Float
    enOferta: Boolean!
    "Porcentaje de descuento redondeado (0 si no está en oferta)."
    descuento: Int!
    "Piezas vendidas (pedidos PAGADO, ENVIADO o ENTREGADO)."
    vendidos: Int!
    imagen: String
    especificaciones: String
    stock: Int!
    "Clave del catálogo c_ClaveProdServ del SAT (para la prefactura)."
    claveProdServ: String!
    categoria: Categoria
    "Ficha técnica (MongoDB). null si todavía no tiene."
    ficha: Ficha
    "Promedio y conteo de reseñas (MongoDB)."
    calificacion: ResumenResenas!
    "Más recientes primero."
    resenas(limite: Int = 20): [Resena!]!
  }

  # --- MongoDB: fichas técnicas, reseñas, historial y bitácora ---
  type Especificacion { nombre: String!, valor: String! }
  input EspecificacionInput { nombre: String!, valor: String! }

  type Ficha {
    especificaciones: [Especificacion!]!
    datasheetUrl: String
    descripcion: String
    actualizado: String!
  }

  input FichaInput {
    especificaciones: [EspecificacionInput!]!
    datasheetUrl: String
    descripcion: String
  }

  type ResumenResenas {
    promedio: Float!
    total: Int!
    "Cuántas reseñas de 5, 4, 3, 2 y 1 estrellas (en ese orden)."
    porEstrellas: [Int!]!
  }

  type Resena {
    id: ID!
    "Nombre corto, p. ej. Fernando R."
    autor: String!
    calificacion: Int!
    comentario: String
    "El autor compró el producto (pedido pagado)."
    compraVerificada: Boolean!
    fecha: String!
    "Es del usuario del token (para mostrarle Editar/Borrar)."
    propia: Boolean!
  }

  type CambioEstado { status: StatusPedido!, fecha: String! }

  # --- Recomendador de kits (también disponible por MCP) ---
  type Kit {
    id: ID!
    nombre: String!
    descripcion: String!
    "Piezas que lleva (rol de cada una)."
    piezas: [String!]!
  }

  type KitElegido {
    id: ID!
    nombre: String!
    descripcion: String!
    "Advertencias de compatibilidad o armado."
    notas: String
  }

  type ItemKit {
    rol: String!
    cantidad: Int!
    opcional: Boolean!
    producto: Producto!
    subtotal: Float!
    "Otras opciones con stock para la misma pieza."
    alternativas: [Producto!]!
  }

  type RecomendacionKit {
    "null si no se reconoció el proyecto."
    kit: KitElegido
    mensaje: String
    items: [ItemKit!]!
    "Piezas necesarias sin producto en existencia."
    faltantes: [String!]!
    total: Float!
    presupuesto: Float
    dentroDePresupuesto: Boolean!
  }

  type EventoBitacora {
    id: ID!
    tipo: String!
    fecha: String!
    usuarioId: ID
    resumen: String!
    "Detalles en JSON."
    datos: String
  }

  enum OrdenProductos { NOMBRE PRECIO_ASC PRECIO_DESC MAS_VENDIDOS NUEVOS }

  input CategoriaInput {
    nombre: String!
    descripcion: String
  }

  "Dirección física de envío."
  type Direccion {
    calle: String!
    colonia: String!
    ciudad: String!
    estado: String!
    codigoPostal: String!
  }

  input DireccionInput {
    calle: String!
    colonia: String!
    ciudad: String!
    estado: String!
    codigoPostal: String!
  }

  enum Rol { CLIENTE ADMIN }

  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: Rol!
    pedidos: [Pedido!]!
    "Solo el propio usuario o ADMIN. null si no la ha capturado."
    direccion: Direccion
    "Solo el propio usuario o ADMIN. null si no ha capturado datos fiscales."
    datosFiscales: DatosFiscales
  }

  # --- Prefactura CFDI ---
  "Datos del receptor para la prefactura (constancia de situación fiscal)."
  type DatosFiscales {
    rfc: String!
    razonSocial: String!
    codigoPostal: String!
    regimenFiscal: String!
    usoCfdi: String!
  }

  input DatosFiscalesInput {
    rfc: String!
    razonSocial: String!
    codigoPostal: String!
    regimenFiscal: String!
    usoCfdi: String!
  }

  type ClaveCatalogo { clave: String!, descripcion: String! }

  "Claves del SAT que acepta la tienda, para llenar los selectores."
  type CatalogosCfdi {
    regimenesFiscales: [ClaveCatalogo!]!
    usosCfdi: [ClaveCatalogo!]!
  }

  "Prefactura con estructura CFDI (Anexo 20). No está timbrada por un PAC."
  type Prefactura {
    serie: String!
    folio: String!
    fecha: String!
    receptorRfc: String!
    subtotal: Float!
    iva: Float!
    total: Float!
    "true si pasó el XSD y las reglas de catálogos y cálculo."
    valida: Boolean!
    errores: [String!]!
    xml: String!
  }

  enum StatusPedido { PENDIENTE PAGADO ENVIADO ENTREGADO CANCELADO }

  type DetallePedido {
    id: ID!
    producto: Producto!
    cantidad: Int!
    subtotal: Float!
  }

  type Pedido {
    id: ID!
    fecha: String!
    total: Float!
    status: StatusPedido!
    usuario: Usuario!
    detalles: [DetallePedido!]!
    "Intentos de pago (PayPal / Mercado Pago), del más reciente al más viejo."
    pagos: [Pago!]!
    "Se genera al pagar. null si el pedido no está pagado."
    prefactura: Prefactura
    "Historial de estados (documento del pedido en MongoDB)."
    historial: [CambioEstado!]!
  }

  enum ProveedorPago { PAYPAL MERCADOPAGO }
  enum EstadoPago { CREADO PENDIENTE APROBADO RECHAZADO }

  type Pago {
    id: ID!
    proveedor: ProveedorPago!
    estado: EstadoPago!
    monto: Float!
    "Id de la captura (PayPal) o del pago (Mercado Pago) cuando ya se cobró."
    idTransaccion: String
    creado: String!
  }

  "Qué métodos de pago tiene configurados el backend y las llaves PÚBLICAS para dibujarlos."
  type MetodosPago {
    paypal: Boolean!
    "Client id de PayPal para cargar los botones del JS SDK."
    paypalClientId: String
    paypalMoneda: String!
    mercadoPago: Boolean!
    "Public key de Mercado Pago para el Card Payment Brick."
    mercadoPagoPublicKey: String
  }

  input IdentificacionInput {
    tipo: String!
    numero: String!
  }

  "Lo que entrega el Card Payment Brick. Nunca trae el número de la tarjeta, solo un token."
  input TarjetaInput {
    token: String!
    metodoPagoId: String!
    "credit_card, debit_card o prepaid_card (lo detecta el Brick)."
    tipo: String
    emisorId: String
    cuotas: Int!
    email: String!
    identificacion: IdentificacionInput
  }

  type ResultadoPago {
    estado: EstadoPago!
    mensaje: String
    pedido: Pedido!
  }

  # --- Admin dashboard ---
  type ConteoStatus { status: StatusPedido!, pedidos: Int!, monto: Float! }
  type VentaDia { fecha: String!, pedidos: Int!, monto: Float! }
  type ProductoVendido { producto: Producto!, unidades: Int!, monto: Float! }
  type VentaProveedor { proveedor: ProveedorPago!, pagos: Int!, monto: Float! }

  type ResumenAdmin {
    "Suma de pedidos PAGADO, ENVIADO y ENTREGADO."
    ventas: Float!
    pedidosVendidos: Int!
    ticketPromedio: Float!
    pendientesDePago: Int!
    "Pagados que falta enviar."
    porEnviar: Int!
    clientes: Int!
    porStatus: [ConteoStatus!]!
    ventasPorDia: [VentaDia!]!
    masVendidos: [ProductoVendido!]!
    stockBajo: [Producto!]!
    porProveedor: [VentaProveedor!]!
  }

  input ProductoInput {
    nombre: String!
    precio: Float!
    "Vacío = sin oferta. Si viene, tiene que ser mayor que precio."
    precioAnterior: Float
    "8 dígitos; si no viene se queda la actual (o 01010101 en un producto nuevo)."
    claveProdServ: String
    imagen: String
    especificaciones: String
    categoriaId: ID
    stock: Int!
  }

  # --- Tiempo real (Subscriptions por WebSocket) ---
  enum TipoCambio { NUEVO ACTUALIZADO ELIMINADO }

  type CambioPedido {
    tipo: TipoCambio!
    pedido: Pedido!
  }

  type CambioProducto {
    tipo: TipoCambio!
    producto: Producto!
  }

  input ItemPedidoInput {
    productoId: ID!
    cantidad: Int!
  }

  type Query {
    """
    Catálogo con búsqueda y filtros. busqueda: palabras que deben aparecer en el
    nombre, las especificaciones o la categoría. Sin orden, por id.
    """
    productos(
      busqueda: String
      categoriaId: ID
      soloOfertas: Boolean
      orden: OrdenProductos
      limite: Int
      desde: Int
    ): [Producto!]!
    producto(id: ID!): Producto
    categorias: [Categoria!]!
    categoria(id: ID!): Categoria
    "Usuario dueño del token."
    yo: Usuario
    "Solo ADMIN."
    usuarios: [Usuario!]!
    "Solo ADMIN. Con status filtra."
    pedidos(status: StatusPedido): [Pedido!]!
    "Del usuario o ADMIN."
    pedido(id: ID!): Pedido
    metodosPago: MetodosPago!
    "Solo ADMIN. Métricas del panel; dias = ventana de la gráfica (máx. 90)."
    resumenAdmin(dias: Int = 14, stockMinimo: Int = 5): ResumenAdmin!
    catalogosCfdi: CatalogosCfdi!
    "Client id PÚBLICO de Google para dibujar el botón. null si no está configurado."
    googleClientId: String
    "Kits que sabe armar el recomendador."
    kits: [Kit!]!
    "Arma un kit con productos en existencia. proyecto = descripción libre; o kitId para elegir uno."
    recomendarKit(proyecto: String, kitId: ID, presupuesto: Float): RecomendacionKit!
    "Solo ADMIN. Eventos del sistema, más recientes primero. antesDe = id del último de la página anterior."
    bitacora(tipo: String, limite: Int = 50, antesDe: ID): [EventoBitacora!]!
    "Tipos de evento para filtrar la bitácora."
    tiposBitacora: [String!]!
    "true si el backend tiene MongoDB conectado (fichas, reseñas, bitácora)."
    mongoDisponible: Boolean!
  }

  type Mutation {
    "Solo ADMIN. Crea o reemplaza la ficha técnica del producto."
    guardarFicha(productoId: ID!, datos: FichaInput!): Ficha!
    "Requiere sesión. Una reseña por producto: si ya tenías, se actualiza."
    guardarResena(productoId: ID!, calificacion: Int!, comentario: String): Resena!
    "El autor o un ADMIN."
    eliminarResena(id: ID!): Boolean!
    "Guarda la dirección de envío del usuario del token."
    guardarDireccion(datos: DireccionInput!): Usuario!
    "Solo ADMIN."
    crearCategoria(datos: CategoriaInput!): Categoria!
    "Solo ADMIN."
    actualizarCategoria(id: ID!, datos: CategoriaInput!): Categoria
    "Solo ADMIN. Falla si la categoría todavía tiene productos."
    eliminarCategoria(id: ID!): Boolean!
    "Guarda los datos fiscales del usuario del token (para sus próximas prefacturas)."
    guardarDatosFiscales(datos: DatosFiscalesInput!): Usuario!
    "Borra los datos fiscales: las prefacturas salen a público en general."
    borrarDatosFiscales: Usuario!
    "Dueño del pedido o ADMIN. Vuelve a generar la prefactura con los datos fiscales actuales."
    regenerarPrefactura(pedidoId: ID!): Prefactura!
    "Solo ADMIN."
    crearProducto(datos: ProductoInput!): Producto!
    "Solo ADMIN."
    actualizarProducto(id: ID!, datos: ProductoInput!): Producto
    "Solo ADMIN."
    eliminarProducto(id: ID!): Boolean!
    "El pedido queda a nombre del usuario del token."
    crearPedido(items: [ItemPedidoInput!]!): Pedido!
    "Solo ADMIN. A CANCELADO devuelve el stock."
    cambiarStatusPedido(id: ID!, status: StatusPedido!): Pedido
    "Solo ADMIN. No puedes cambiar tu propio rol."
    cambiarRol(id: ID!, rol: Rol!): Usuario
    "Dueño del pedido (solo PENDIENTE). Devuelve el stock."
    cancelarPedido(id: ID!): Pedido
    "Crea la orden en PayPal y devuelve su id para los botones del JS SDK."
    crearOrdenPaypal(pedidoId: ID!): String!
    "Cobra con Mercado Pago (Checkout API) usando el token del Card Payment Brick."
    pagarConTarjeta(pedidoId: ID!, tarjeta: TarjetaInput!): ResultadoPago!
    """
    Verifica con el proveedor y, si cobró, marca el pedido PAGADO.
    referencia: PayPal = id de la orden aprobada (se captura); Mercado Pago = id del pago (opcional).
    """
    confirmarPago(pedidoId: ID!, proveedor: ProveedorPago!, referencia: String): ResultadoPago!
  }

  type Subscription {
    "Solo ADMIN. Pedido nuevo, cambio de estado, pago aprobado o cancelación."
    pedidoCambio: CambioPedido!
    "Solo ADMIN. Alta, edición, baja o movimiento de stock de un producto."
    productoCambio: CambioProducto!
  }
`
