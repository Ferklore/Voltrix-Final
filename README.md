# Voltrix

Tienda en línea de componentes electrónicos, con frontend y backend separados.

```
voltrix/
├── backend/    Node + Express + Apollo Server (GraphQL) + PostgreSQL (Neon)
└── frontend/   Astro + islas de React
```

El frontend no toca la base de datos: todo se lo pide al backend por HTTP.

| Quién | Llama a | Para qué |
|--|--|--|
| Páginas `.astro` (en el servidor) | `POST /graphql` | Catálogo: categorías y productos |
| Islas de React (en el navegador) | `POST /oauth/token`, `/oauth/revoke`, `/registro` | Login, logout y registro |
| Islas de React (en el navegador) | `POST /graphql` con `Authorization: Bearer` | Pedidos, pagos, cuenta y panel admin |
| Panel admin (en el navegador) | WebSocket `ws://…/graphql` (graphql-ws) | Subscriptions: pedidos y productos en tiempo real |
| Botones de PayPal y Card Payment Brick (en el navegador) | SDK de PayPal / Mercado Pago | Aprobar el pago o tokenizar la tarjeta sin salir de la tienda |
| Mercado Pago (sus servidores) | `POST /webhooks/mercadopago` | Avisar que cambió una orden (solo con backend publicado) |

## Backend (`backend/`)

```
src/
  index.js              servidor Express: CORS, rutas y Apollo Server
  db.js                 pool de PostgreSQL
  auth.js               scrypt, tokens OAuth 2.0, bloqueo por intentos
  rutas/oauth.js        POST /oauth/token, /oauth/google y /oauth/revoke
  google.js             verifica el ID token de Google y crea/vincula la cuenta
  cloudinary.js         firma subidas de imágenes y respalda prefacturas en Cloudinary
  mouser.js             búsqueda en el catálogo de Mouser (caché y tope por minuto)
  rutas/registro.js     POST /registro
  rutas/webhooks.js     POST /webhooks/mercadopago
  pagos/index.js        crear orden, cobrar y confirmar pagos (la lógica común)
  pagos/paypal.js       PayPal Orders API v2 (crear y capturar órdenes)
  pagos/mercadopago.js  Mercado Pago Checkout API con la Orders API (POST /v1/orders)
  pedidos.js            cancelar pedido y devolver stock
  direccion.js          valida la dirección física (registro y Mi cuenta)
  correo/enviar.js      envía con Resend (o lo muestra en consola sin RESEND_API_KEY)
  correo/plantillas.js  HTML y texto de cada correo
  correo/avisos.js      pedido creado, pago confirmado (con prefactura) y stock bajo
  rutas/recuperar.js    POST /recuperar y /recuperar/restablecer
  mongo/conexion.js     cliente de MongoDB e índices (se apaga sin MONGODB_URI)
  mongo/fichas.js       ficha técnica de cada producto
  mongo/resenas.js      reseñas y calificaciones
  mongo/pedidos.js      documento de cada pedido + historial de estados
  mongo/bitacora.js     bitácora de eventos (TTL de 90 días)
  catalogo.js           búsqueda del catálogo (la usan GraphQL y MCP)
  kits/plantillas.js    qué piezas lleva cada tipo de proyecto
  kits/recomendador.js  arma el kit con productos en existencia y presupuesto
  mcp/servidor.js       servidor MCP: herramientas, recursos y prompt
  rutas/mcp.js          POST /mcp (MCP por HTTP)
scripts/mcp-stdio.mjs   MCP por stdio, para Claude Desktop (npm run mcp)
scripts/validar.mjs     validación estática: sintaxis, esquema GraphQL, migraciones, XSD
  cfdi/generar.js       arma la prefactura (estructura CFDI) y su XML
  cfdi/validar.js       valida contra el XSD y las reglas/catálogos del SAT
  cfdi/pdf.js           representación impresa (PDF)
  cfdi/catalogos.js     claves del SAT que usa la tienda
  cfdi/esquema/cfdi.xsd esquema XSD de la prefactura
  cfdi/index.js         genera y guarda la prefactura del pedido
  rutas/prefacturas.js  GET /prefacturas/:id/xml y /pdf
  eventos.js            PubSub de las Subscriptions (publicar cambios de pedidos/productos)
  graphql/schema.js     tipos, consultas y mutaciones
  graphql/resolvers.js  lógica de cada campo (incluye la transacción de pedidos)
db.sql                  esquema y catálogo inicial (borra todo y empieza de cero)
migraciones/            cambios de esquema para una base existente, sin borrar nada
  001-pagos.sql         agrega la tabla pago
  002-pago-esquema-viejo.sql  convierte la tabla pago de la primera versión
  003-cfdi.sql          datos fiscales, clave SAT del producto y tabla prefactura
  004-direccion-ofertas.sql  dirección del usuario y precio_anterior (ofertas)
  005-recuperar-password.sql tokens de recuperación de contraseña
  006-google.sql        google_sub y contraseña opcional (cuentas solo con Google)
  007-respaldo-prefactura.sql  dónde quedó la copia de la prefactura en Cloudinary
  008-lista-deseos.sql  lista de deseos (usuario, producto)
scripts/migrar.mjs      corre todas las migraciones en orden (npm run migrar)
scripts/crear-admin.mjs
test/api.test.js        prueba de punta a punta (OAuth, permisos, pedidos)
test/subscripciones.test.js  Subscriptions por WebSocket (solo ADMIN, eventos en vivo)
test/cfdi.test.js       prefactura CFDI: XML, XSD, cálculos y PDF (no necesita la base)
test/correo.test.js     plantillas de correo y modo consola (no necesita la base)
test/mongo.test.js      validaciones de fichas y reseñas; todo apagado sin Mongo
test/kits.test.js       recomendador: elegir kit y ajustar presupuesto (no necesita la base)
test/google.test.js     verificación del ID token de Google con llaves propias
test/cloudinary.test.js firma de Cloudinary (contra el ejemplo oficial) y URLs permitidas
test/mouser.test.js     Mouser simulado: petición, normalización, precios, caché y límites
test/mcp.test.js        cliente MCP real contra /mcp y por stdio (backend corriendo)
test/deseos.test.js     lista de deseos: agregar, sin duplicados, privada, quitar (backend corriendo)
```

## Frontend (`frontend/`)

```
src/
  pages/        rutas de la tienda (.astro, render en el servidor)
  layouts/      plantilla Base (topbar, sidebar, footer)
  components/   islas de React y ProductCard
  components/admin/  panel de administración (resumen, pedidos, productos, usuarios)
  lib/api.js    cliente del backend (URL en PUBLIC_API_URL)
  lib/sesion.js sesión OAuth en localStorage, renovación de tokens
  lib/carrito.js carrito en localStorage
  lib/vivo.js   cliente graphql-ws: Subscriptions del panel admin
  styles/       CSS global
public/         imágenes de productos
```

## CI/CD (GitHub Actions)

```
push / pull request
   ├─ backend:  npm ci → validar → npm audit (bloquea si hay altas) → pruebas unitarias
   │            → Postgres 16 + Mongo 7 (servicios) → db.sql + migraciones + admin
   │            → backend arriba → pruebas de punta a punta (API, Subscriptions, MCP)
   ├─ frontend: npm ci → npm audit (informativo) → pruebas → astro build
   └─ (solo push a main y si los dos pasaron) desplegar:
                migrar base de producción → deploy hook de Render → esperar backend
                → netlify deploy --prod
CodeQL: análisis de seguridad y calidad en cada push/PR a main y cada lunes
        (repo público; actívalo en Settings → Code security → Code scanning).
Dependabot: PRs semanales de dependencias (espera 14 días por versión nueva).
```

| Archivo | Qué hace |
|--|--|
| `.github/workflows/ci.yml` | Validación, pruebas, build y despliegue |
| `.github/workflows/codeql.yml` | Análisis de código (Security → Code scanning) |
| `.github/dependabot.yml` | Actualización de dependencias |
| `render.yaml` | Servicio del backend en Render (Blueprint) |

Scripts del backend: `npm run validar`, `npm run test:unit` (sin base),
`npm run test:e2e` (con el backend corriendo y `admin@voltrix.test`).

### Activar el despliegue (una sola vez)

1. **Render** (backend): New → Blueprint → este repo. Captura las variables
   marcadas como secretas (DATABASE_URL, MONGODB_URI, FRONTEND_URL, …). En
   Settings del servicio, desactiva *Auto-Deploy* si está activo y copia el
   **Deploy Hook**.
2. **Netlify** (frontend): crea el sitio con *Base directory* `frontend` y
   desactiva los builds automáticos (*Stop builds*): los hace el pipeline.
   Copia el **Site ID** y crea un **Personal access token**.
3. **GitHub** → Settings → Secrets and variables → Actions:

| Tipo | Nombre | Valor |
|--|--|--|
| Secret | `RENDER_DEPLOY_HOOK_URL` | Deploy hook de Render |
| Secret | `NETLIFY_AUTH_TOKEN` | Token personal de Netlify |
| Secret | `NETLIFY_SITE_ID` | Site ID de Netlify |
| Secret | `DATABASE_URL_PRODUCCION` | URL de Neon de producción (para migrar) |
| Variable | `API_URL` | URL pública del backend, p. ej. `https://voltrix-backend.onrender.com` |
| Variable | `TIENDA_URL` | URL pública de la tienda en Netlify |

Si falta un secreto, ese paso del despliegue se salta (las pruebas corren igual).
Después agrega la URL de Netlify a `FRONTEND_URL`/`TIENDA_URL` en Render y a
los orígenes autorizados de Google.

## MCP y recomendador de kits

El backend es también un **servidor MCP** (Model Context Protocol): un
asistente como Claude puede usar la tienda como herramienta.

| Herramienta | Quién | Qué hace |
|--|--|--|
| `listar_categorias`, `buscar_productos`, `ver_producto` | Todos | Catálogo, fichas técnicas y calificaciones |
| `listar_kits`, `recomendar_kit` | Todos | Arma la lista de compra de un proyecto (con presupuesto) |
| `mis_pedidos`, `estado_pedido` | Con token de cliente | Sus pedidos |
| `inventario_bajo` | Con token de ADMIN | Productos con poco stock |

Además: recursos `voltrix://categorias` y `voltrix://producto/{id}`, y el prompt `armar_kit`.

**Conectarlo a Claude Code** (con el backend corriendo):

```bash
claude mcp add --transport http voltrix http://localhost:4000/mcp
```

Para que vea tus pedidos, agrega `--header "Authorization: Bearer <access token>"`.

**Claude Desktop** (por stdio), en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "voltrix": {
      "command": "node",
      "args": ["--env-file=.env", "scripts/mcp-stdio.mjs"],
      "cwd": "/ruta/a/backend"
    }
  }
}
```

**En la tienda:** la página `/kit` ("Arma tu kit") usa el mismo recomendador
por GraphQL (`recomendarKit`). El cliente describe su proyecto, elige
alternativas por pieza y agrega todo al carrito. Para enseñarle un kit nuevo,
agrega una plantilla en `src/kits/plantillas.js`.

## MongoDB

PostgreSQL guarda lo transaccional (usuarios, pedidos, pagos, inventario).
MongoDB guarda documentos que no necesitan transacciones:

| Colección | Qué guarda | Dónde se ve |
|--|--|--|
| `fichas` | Especificaciones libres por producto (`[{nombre, valor}]`), datasheet y descripción | Página del producto; se edita en *Admin → Productos* |
| `resenas` | Calificación 1-5, comentario, "compra verificada" (una por cliente y producto) | Página del producto |
| `pedidos` | Foto del pedido al crearlo (nombres, precios, dirección) + historial de estados | *Admin → Pedidos* (al desplegar las piezas) |
| `bitacora` | Pedidos, pagos, cambios al catálogo, registros, logins fallidos, correos | *Admin → Bitácora* |

- **Configurar:** `MONGODB_URI` (Atlas) en `backend/.env`. Los índices se crean solos al conectar.
- **Sin `MONGODB_URI`** la tienda funciona igual: no hay fichas ni reseñas, y la
  bitácora y el historial no se guardan. Al arrancar, el backend avisa.
- La bitácora se borra sola a los 90 días (índice TTL).
- Los pedidos de antes de conectar Mongo obtienen su documento la próxima vez que cambian de estado.

## Correos (Resend)

| Cuándo | A quién | Qué |
|--|--|--|
| Se crea un pedido | Cliente | Detalle, total y dirección; botón para pagar |
| Se aprueba el pago | Cliente | Confirmación con la **prefactura PDF y XML adjuntas** |
| Un producto baja a `STOCK_MINIMO` o menos | Todos los ADMIN | Lista de productos y enlace al inventario |
| Pide recuperar contraseña | Cliente | Enlace a `/restablecer` (30 min, un solo uso) |

- **Sin `RESEND_API_KEY`** los correos no salen: se imprimen en la consola
  del backend (sirve para probar y para copiar el enlace de recuperación).
- **Cuenta gratis de Resend sin dominio:** remitente `onboarding@resend.dev`
  y solo llega al correo de tu cuenta de Resend. Para enviar a cualquier
  cliente, verifica un dominio y cambia `CORREO_REMITENTE`.
- Se envían después del COMMIT y sin esperar: si un correo falla, el pedido o
  el pago ya quedó guardado.
- **Recuperar contraseña:** `/recuperar` responde lo mismo exista o no la
  cuenta; máximo un correo por minuto; al restablecer se cierran todas las
  sesiones y se quita el bloqueo por intentos.

## Catálogo: búsqueda, filtros y ofertas

- **Buscador** en la barra superior → `/buscar?q=…`. Cada palabra debe aparecer
  en el nombre, las especificaciones o la categoría.
- **Filtros** en `/buscar`: categoría, orden (más vendidos, precio, nombre,
  nuevos) y "solo ofertas". Todo va en la URL. En el menú lateral están los
  atajos *Ofertas* y *Más vendidos*, y la portada muestra las dos secciones.
- **Ofertas:** un producto está en oferta si su `precio_anterior` es mayor que
  `precio`; se captura en *Admin → Productos* ("Precio antes de oferta").
- **Más vendidos:** piezas de pedidos PAGADO, ENVIADO o ENTREGADO.
- **Categorías:** CRUD en *Admin → Categorías*; no se borra una con productos.
- **Dirección física:** se pide al registrarse y se edita en *Mi cuenta*.

## Prefactura CFDI

Cuando un pedido queda **PAGADO** el backend genera su prefactura con la
estructura del CFDI del SAT (Anexo 20): `Comprobante`, `InformacionGlobal`
(solo público en general), `Emisor`, `Receptor`, `Conceptos` e `Impuestos`.

- **Receptor:** si el cliente capturó sus datos fiscales en *Mi cuenta* (RFC,
  razón social, CP, régimen y uso del CFDI) sale a su nombre; si no, a
  `XAXX010101000 PUBLICO EN GENERAL`. Con *Regenerar* se rehace con los datos actuales.
- **Importes:** los precios ya traen IVA; cada concepto se desglosa a 6
  decimales para que el total sea exactamente lo cobrado.
- **Validación:** XSD (`src/cfdi/esquema/cfdi.xsd`, con libxml2 en WebAssembly)
  + reglas que el XSD no cubre (RFC vs. régimen, uso permitido, cuentas). El
  resultado se guarda en `prefactura.valida` / `errores`.
- **Descarga:** `GET /prefacturas/:pedidoId/xml` o `/pdf` con `Authorization:
  Bearer`, solo dueño o ADMIN (`?ver=1` lo abre para imprimir). En la tienda: botones en
  *Mi cuenta*; en el admin: *Imprimir*, *PDF* y *XML* en Pedidos.
- **Sin timbrar:** no lleva sello ni certificado (CSD) ni Timbre Fiscal
  Digital; para eso hay que firmar con el CSD del emisor y enviarlo a un PAC.
- **Versión:** el SAT publica el CFDI 4.0 (`http://www.sat.gob.mx/cfd/4`); la
  versión está en `VERSION_CFDI` de `src/cfdi/generar.js`.

## BackOffice en tiempo real (GraphQL Subscriptions)

El panel admin (`/admin`) es el **BackOffice**: resumen con métricas, pedidos,
productos y usuarios. Además de consultas y mutaciones, usa **Subscriptions**:
el backend *empuja* los cambios por un WebSocket y la pantalla se actualiza sin
recargar. En la barra del panel, el punto verde **En vivo** indica que el
WebSocket está conectado.

```graphql
type Subscription {
  pedidoCambio: CambioPedido!     # pedido NUEVO o ACTUALIZADO (pago, estado, cancelación)
  productoCambio: CambioProducto! # producto NUEVO, ACTUALIZADO (incluye stock) o ELIMINADO
}
```

```
Cliente compra / paga / cancela      Otro admin edita
              \                      /
        mutación GraphQL (HTTP) -> COMMIT en PostgreSQL
                         |
              pubsub.publish (src/eventos.js)
                         |
      graphql-ws (WebSocket en /graphql) -> cada admin suscrito
                         |
  Resumen recalcula KPIs · Pedidos inserta/actualiza la fila · Productos cambia el stock
```

| Pantalla | Escucha | Qué hace al recibir |
|--|--|--|
| Resumen | `pedidoCambio`, `productoCambio` | Vuelve a pedir `resumenAdmin` (agrupa eventos en 0.5 s) |
| Pedidos | `pedidoCambio` | Inserta o actualiza la fila y la resalta 3 s |
| Productos | `productoCambio` | Agrega, actualiza (stock) o quita el producto |

- **Seguridad:** el navegador no puede mandar encabezados en un WebSocket, así que
  el token va en `connectionParams.authorization` y se valida en cada suscripción;
  si el usuario no es ADMIN recibe `FORBIDDEN`.
- **Se publica después del COMMIT**, para no avisar de algo que se deshizo.
- **Probar en Apollo Sandbox:** en `http://localhost:4000/graphql`, pon en
  *Connection settings* el encabezado `authorization: Bearer <token de admin>` y
  corre `subscription { pedidoCambio { tipo pedido { id status total } } }`.
  Luego haz un pedido desde la tienda y el evento aparece solo.
- **Límite:** el PubSub vive en memoria, sirve con **una** instancia del backend.
  Con varias réplicas se cambia por Redis o `LISTEN/NOTIFY` de PostgreSQL.

## Correr en local

Requiere Node 22+. Se usan **dos terminales**.

**Terminal 1, backend:**

```bash
cd backend
cp .env.example .env     # pon tu DATABASE_URL de Neon
npm ci
npm run migrar           # pone la base al día (solo la primera vez o tras actualizar)
npm run dev              # http://localhost:4000
```

**Terminal 2, frontend:**

```bash
cd frontend
cp .env.example .env     # PUBLIC_API_URL=http://localhost:4000
npm ci
npm run dev              # http://localhost:4321
```

Primero arranca el backend: sin él, las páginas no pueden cargar el catálogo.

**Probar como admin:** abre `http://localhost:4000/graphql` (Apollo Sandbox),
pide un token en `/oauth/token` y mándalo en el encabezado
`Authorization: Bearer <access_token>`.

**Pruebas:** `npm test` en `frontend/` (carrito) y en `backend/` con el
backend corriendo (OAuth, permisos y pedidos).

**Crear admin:** `npm run crear-admin -- correo@dominio.com "Nombre" 'contraseña'` en `backend/`.

## Pagos: PayPal y Mercado Pago

### Cómo funciona

El cliente **paga sin salir de la tienda** (no hay redirección ni Checkout Pro):

- **PayPal**: botones del JS SDK. El cliente aprueba en una ventana emergente de PayPal
  y regresa solo a la misma página.
- **Mercado Pago**: Checkout API con el **Card Payment Brick**. El formulario de
  tarjeta se dibuja dentro del checkout, pero sus campos son iframes de Mercado Pago:
  nuestra página nunca ve el número de la tarjeta, solo recibe un **token** de un uso.

```
1. Checkout   crearPedido        -> pedido PENDIENTE (el stock ya queda apartado)
2. Elegir     metodosPago        -> el front recibe las llaves PÚBLICAS (client id / public key)

PayPal                                   Mercado Pago
3. crearOrdenPaypal -> id de la orden    3. El Brick convierte la tarjeta en un token
4. Ventana de PayPal: el cliente aprueba 4. pagarConTarjeta(token) -> el backend cobra
5. confirmarPago -> el backend CAPTURA      con POST /v1/orders por el total del
   la orden y revisa monto y moneda         pedido (sale de la base, no del navegador)
                    \                  /
                     -> si coincide: pedido PAGADO
```

La regla importante: **el pedido solo pasa a PAGADO cuando el backend lo
confirmó directamente con el proveedor** (con nuestras credenciales secretas) y el
monto y la moneda cobrados son los del pedido. El monto que muestra el Brick es solo
informativo: el backend cobra `pedido.total` de la base.

| | PayPal | Mercado Pago |
|--|--|--|
| En el navegador | Botones del JS SDK (`@paypal/react-paypal-js`) | Card Payment Brick (`@mercadopago/sdk-react`) |
| El backend crea | Orden (`POST /v2/checkout/orders`) | Orden (`POST /v1/orders` con el token) |
| Se cobra al | **Capturar** la orden aprobada | Crear el pago (respuesta inmediata) |
| Si queda en revisión | — | Webhook o botón **"Verificar pago en revisión"** en *Mis pedidos* |
| Une el pago con el pedido | `custom_id = voltrix-<id>` | `external_reference = voltrix-<id>` |
| Evita cobros dobles | `PayPal-Request-Id` | `X-Idempotency-Key` con el token |

En la tabla `pago` queda cada intento (un pedido puede intentar con PayPal,
cerrar la ventana y pagar con tarjeta). Si el cliente no paga, el pedido queda
PENDIENTE: puede pagarlo después con **Pagar ahora** o cancelarlo desde
**Mis pedidos** (cancelar devuelve el stock).

### Configurar las credenciales de prueba (sandbox)

No se cobra dinero real: se usan cuentas de prueba.

**PayPal**
1. Entra a [developer.paypal.com](https://developer.paypal.com) con tu cuenta de PayPal.
2. *Apps & Credentials* → modo **Sandbox** → *Create App*. Copia el **Client ID** y el **Secret**.
3. En *Sandbox accounts* PayPal ya te crea una cuenta *Personal* (comprador). Con ella pagas.
   Para cobrar en pesos, la cuenta *Business* de prueba debe ser de **México**
   (si no, PayPal deja el pago "pendiente" porque esa cuenta no acepta MXN).
   Si no quieres crear otra, pon `PAYPAL_MONEDA=USD` y PayPal cobrará el mismo número en dólares.

**Mercado Pago (Checkout API)**
1. Entra a [mercadopago.com.mx/developers](https://www.mercadopago.com.mx/developers) → *Tus integraciones* →
   crea una aplicación con el producto **Checkout API** (pagos online).
2. Con **tu cuenta real**, dentro de esa aplicación abre **Credenciales → Prueba** y copia **las dos**:
   la **Public Key** (`MP_PUBLIC_KEY`, la usa el Brick en el navegador) y el **Access Token**
   (`MP_ACCESS_TOKEN`, cobra desde el backend).
   Es normal que empiecen con `APP_USR-` y que pertenezcan a un usuario de prueba con una
   aplicación "TestApp-…": así entrega el panel nuevo las credenciales de prueba.
   Con ellas el backend cobra por la **Orders API** (`/v1/orders`). La API antigua
   (`/v1/payments`) las rechaza con `401 Unauthorized use of live credentials`.
3. Para pagar usa las **tarjetas de prueba** de la documentación de MP ("Tarjetas de prueba"),
   por ejemplo Mastercard `5474 9254 3267 0366`, vencimiento `11/30`, CVV `123`.
   El nombre del titular decide el resultado: `APRO` aprueba, `CONT` queda en revisión y `OTHE` rechaza.
   El comprador no inicia sesión en nada: solo escribe la tarjeta en el checkout.

Pégalas en `backend/.env` (ver `.env.example`) y reinicia el backend. Al arrancar
imprime `Pagos: PayPal listo, Mercado Pago listo`. Si falta alguna, ese método no
aparece en el checkout (si falta solo `MP_PUBLIC_KEY`, el backend lo avisa al arrancar).

**Si ya tienes datos en Neon**, no corras `db.sql` (borra todo); corre solo las
migraciones (no necesitas `psql`, y se pueden repetir sin daño):

```bash
npm run migrar
```

Si al arrancar el backend ves `⚠ La tabla "pago" no tiene el esquema actual`,
es justo esto: tu base tiene la tabla `pago` de la primera versión y los botones
de pago responden "Error interno del servidor" hasta que corras `npm run migrar`.

### Modo prueba (no se cobra dinero real)

La tienda es **de prueba** por defecto (`PAGOS_MODO=prueba`, o sin la variable). Además de usar
credenciales de prueba, el backend pone un candado por si alguien pega credenciales reales:

- **PayPal** solo funciona contra el sandbox (`api-m.sandbox.paypal.com`); con otra `PAYPAL_API`
  se desactiva.
- **Mercado Pago**: si un pago sale `live_mode: true` desde una cuenta real (no un usuario de prueba),
  se rechaza y, si MP alcanzó a aprobarlo, se **reembolsa** en ese momento. El pedido no pasa a PAGADO.

Al arrancar, el backend imprime `Modo de pagos: PRUEBA (no se cobra dinero real)`. Solo con
`PAGOS_MODO=produccion` cobra de verdad.

### Webhook de Mercado Pago (opcional)

Casi todos los pagos con tarjeta se resuelven en el momento. Si uno queda **en revisión**
(`in_process`), Mercado Pago avisa después al webhook `POST /webhooks/mercadopago`.
Con la Orders API el webhook se configura en el panel de la aplicación: **Webhooks** →
evento **Order** → URL `https://<tu-backend>/webhooks/mercadopago` (tiene que ser HTTPS
y pública). En local se usa el botón **"Verificar pago en revisión"** de *Mis pedidos*.

## Panel de administración (`/admin`)

Lo ve solo un usuario con rol ADMIN (aparece el botón **Panel admin** en la barra).
El front solo esconde la página; quien protege los datos es el backend
(`requiereAdmin` en cada resolver), así que un cliente no puede pedir esas
consultas aunque escriba la URL o use Apollo Sandbox.

| Sección | Para qué |
|--|--|
| Resumen | Ventas totales, ticket promedio, pedidos por enviar / esperando pago, clientes, gráfica de ventas por día, pedidos por estado, cobrado por PayPal vs Mercado Pago, más vendidos y stock bajo (`resumenAdmin`) |
| Pedidos | Filtrar por estado y moverlos: Pagado → Enviado → Entregado. Cancelar devuelve el stock |
| Productos | Alta, edición y baja (si ya tiene pedidos, mejor dejar el stock en 0) |
| Usuarios | Lista con pedidos y lo comprado; cambiar rol Cliente/Admin (no el tuyo) |

Después de cambiarle el rol a alguien, tiene que cerrar sesión y volver a entrar.

## Variables de entorno

| Proyecto | Variable | Ejemplo |
|--|--|--|
| backend | `DATABASE_URL` | URL de Neon con `-pooler` |
| backend | `PORT` | `4000` |
| backend | `FRONTEND_URL` | `http://localhost:4321` (CORS; varias separadas por coma) |
| backend | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | credenciales Sandbox de PayPal |
| backend | `PAYPAL_API` | `https://api-m.sandbox.paypal.com` |
| backend | `PAYPAL_MONEDA` | `MXN` (o `USD`) |
| backend | `MP_PUBLIC_KEY` | Public Key de Mercado Pago (se le entrega al Brick) |
| backend | `MP_ACCESS_TOKEN` | Access Token de Mercado Pago (de la misma cuenta) |
| backend | `PAGOS_MODO` | `prueba` (por defecto; no cobra dinero real) o `produccion` |
| frontend | `PUBLIC_API_URL` | `http://localhost:4000` |

## Lista de deseos

- Corazón ♡ en cada tarjeta y en la página del producto; todos los corazones
  de la página se actualizan juntos (`lib/deseos.js`). Sin sesión, lleva al login.
- `/deseos`: lo guardado con precio y stock de hoy (y la oferta si la hay),
  para pasarlo al carrito o quitarlo. Acceso desde el ♡ de la barra superior y el pie.
- Es privada: ni un ADMIN ve la lista de otro cliente. Tabla `lista_deseos`
  en PostgreSQL; si se borra el producto, sale de las listas.

## Importar componentes desde Mouser

En *Admin → Productos → Importar desde Mouser* se busca en el catálogo de
Mouser (Search API) por palabras o por número de parte. Al importar una pieza
se abre "Nuevo producto" ya lleno:

- **Nombre:** fabricante + número de parte; **descripción** de Mouser.
- **Precio sugerido (MXN):** precio de 1 pieza en USD × `MOUSER_TIPO_CAMBIO` ×
  `MOUSER_MARGEN` × IVA, redondeado al peso. El admin lo ajusta.
- **Imagen:** se copia a Cloudinary (no se enlaza la de mouser.com).
- **Ficha técnica (MongoDB):** los atributos de Mouser como especificaciones y el datasheet.
- Stock en 0: el inventario propio lo captura el admin.

La llave gratis permite ~1000 búsquedas al día: hay caché de 10 minutos, tope
de 25 búsquedas por minuto y solo un ADMIN puede buscar. Sin `MOUSER_API_KEY`
el botón no aparece.

## Archivos en Cloudinary

- **Imágenes de productos:** en *Admin → Productos*, "Subir imagen". El
  backend firma la subida (`firmarSubidaImagen`) y el navegador sube el
  archivo **directo a Cloudinary**: el secreto nunca sale del backend y la
  imagen no pasa por nuestro servidor. Máx. 5 MB; Cloudinary la limita a 1600 px.
- **Imágenes optimizadas:** el catálogo pide a Cloudinary la versión del tamaño
  justo y en WebP/AVIF (`f_auto,q_auto,w_…`).
- **Respaldo de prefacturas:** al generarse, el XML y el PDF se copian a
  Cloudinary como archivos privados (`authenticated`), en `voltrix/prefacturas`.
  Sin firma, Cloudinary responde 401; en la base solo se guarda el `public_id`
  (no la URL firmada). Se consultan desde el Media Library de Cloudinary.
- Solo se aceptan imágenes con ruta de la tienda (`/productos/…`) o de `res.cloudinary.com`.
- Sin `CLOUDINARY_URL` el botón no aparece y no se respalda nada.

## Login con Google

Botón "Continuar con Google" en `/login` y `/registro` (Google Identity
Services). Google le da al navegador un ID token; el backend
(`POST /oauth/google`) verifica su firma con las llaves públicas de Google,
que sea para nuestro `GOOGLE_CLIENT_ID`, que no haya vencido y que el correo
esté verificado, y responde con los mismos tokens OAuth que el login normal.

- Primera vez: se crea la cuenta sin contraseña; *Mi cuenta* le pide la dirección.
- Si ya existía una cuenta con ese correo, se le vincula Google y su contraseña sigue sirviendo.
- Quien solo entra con Google puede ponerse contraseña con "¿Olvidaste tu contraseña?".
- Sin `GOOGLE_CLIENT_ID` el botón no aparece.

**Configurar:** console.cloud.google.com → APIs y servicios → Pantalla de
consentimiento de OAuth (externa) → Credenciales → Crear ID de cliente de OAuth
→ Aplicación web → Orígenes autorizados de JavaScript: `http://localhost:4321`,
`http://localhost` y la URL pública de la tienda. Copia el Client ID en
`backend/.env` como `GOOGLE_CLIENT_ID` (no se necesita el secreto).

## OAuth 2.0

Cliente público `voltrix-web`. Access token de 1 hora y refresh de 30 días,
opacos; en la base solo se guarda su SHA-256. Cada refresh se usa una sola vez
(rotación) y revocar cualquiera de los dos cierra la sesión. Contraseñas con
scrypt; 5 intentos fallidos bloquean la cuenta 15 minutos.
