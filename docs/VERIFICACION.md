# Registro de verificación — Voltrix

Versión 2.0 · 25 de noviembre de 2026 · código verificado: commit 2b8df49 y rama docs/srs-v2 (EVIDENCIA_COMMIT.md).

Este documento registra **qué se ejecutó, cuándo y con qué resultado**. Las definiciones de cada verificación (qué comprueba y qué resultado se espera) están en el Apéndice F del SRS, y la relación con cada requerimiento, en TRAZABILIDAD.md. Aquí no se declara cumplido nada que no se haya ejecutado: lo pendiente aparece como pendiente.

## 1. Pruebas automatizadas (PA)

Fuente: corrida 44674351700 del workflow CI/CD sobre el commit 2b8df49 (https://github.com/Ferklore/Voltrix-Final/actions/runs/44674351700), 2026-11-20 04:25:54 UTC. Totales del log: pruebas unitarias 51 de 51 pasan; punta a punta 8, de las cuales 7 pasan y 1 se omite; frontend 1 de 1 pasa. Ninguna falla.

Segunda fuente, para las correcciones de v2.0: corrida 45562259035 sobre la rama docs/srs-v2 del fork (https://github.com/FieldRayo/Voltrix-Final/actions/runs/45562259035, commit 9a48e8e), 2026-11-25 06:39 a 06:40 UTC. Totales: unitarias 52 de 52 pasan (incluida PA-66); punta a punta 8, de las cuales 7 pasan y 1 se omite (la misma PA-55); frontend 1 de 1 pasa y el build compila; el despliegue se omite porque la rama no es main. Las pruebas PA-01 a PA-60 pasaron en ambas corridas.

| ID | Archivo:línea | Prueba | Resultado en CI |
|---|---|---|---|
| PA-01 | backend/test/cfdi.test.js:17 | público en general: XML con InformacionGlobal, válido contra XSD y reglas | Pasó |
| PA-02 | backend/test/cfdi.test.js:30 | cliente con RFC: sin InformacionGlobal, con su régimen y uso | Pasó |
| PA-03 | backend/test/cfdi.test.js:39 | el total de la prefactura siempre es lo que se cobró (precios con IVA) | Pasó |
| PA-04 | backend/test/cfdi.test.js:57 | el XSD rechaza estructura y claves fuera de catálogo | Pasó |
| PA-05 | backend/test/cfdi.test.js:67 | las reglas detectan cuentas que no cuadran y combinaciones inválidas | Pasó |
| PA-06 | backend/test/cfdi.test.js:78 | datos fiscales del cliente: normaliza y rechaza lo inválido | Pasó |
| PA-07 | backend/test/cfdi.test.js:89 | fechaSat usa la hora de la Ciudad de México | Pasó |
| PA-08 | backend/test/cfdi.test.js:93 | genera el PDF | Pasó |
| PA-09 | backend/test/correo.test.js:13 | pedido creado: detalles, total, dirección y HTML escapado | Pasó |
| PA-10 | backend/test/correo.test.js:24 | pago confirmado menciona el método y la prefactura adjunta | Pasó |
| PA-11 | backend/test/correo.test.js:32 | recuperar contraseña lleva el enlace y la vigencia | Pasó |
| PA-12 | backend/test/correo.test.js:39 | stock bajo: uno o varios productos, agotado resaltado | Pasó |
| PA-13 | backend/test/correo.test.js:47 | sin RESEND_API_KEY el correo se muestra en consola y no truena | Pasó |
| PA-14 | backend/test/mongo.test.js:15 | ficha: limpia filas vacías y espacios | Pasó |
| PA-15 | backend/test/mongo.test.js:29 | ficha: rechaza filas incompletas, repetidas, demasiadas y URLs raras | Pasó |
| PA-16 | backend/test/mongo.test.js:38 | reseña: calificación 1-5 y comentario opcional | Pasó |
| PA-17 | backend/test/mongo.test.js:47 | nombre público: nombre + inicial | Pasó |
| PA-18 | backend/test/mongo.test.js:54 | sin MONGODB_URI todo se apaga sin errores | Pasó |
| PA-19 | backend/test/kits.test.js:10 | normaliza acentos, mayúsculas y espacios | Pasó |
| PA-20 | backend/test/kits.test.js:14 | elige la plantilla por las palabras del proyecto | Pasó |
| PA-21 | backend/test/kits.test.js:29 | todas las plantillas tienen ids únicos y piezas válidas | Pasó |
| PA-22 | backend/test/kits.test.js:45 | presupuesto: sin presupuesto o si alcanza, la opción preferida | Pasó |
| PA-23 | backend/test/kits.test.js:51 | presupuesto: primero quita lo opcional, luego abarata lo que más ahorra | Pasó |
| PA-24 | backend/test/kits.test.js:61 | presupuesto: cuenta la cantidad y respeta piezas sin stock | Pasó |
| PA-25 | backend/test/google.test.js:30 | token válido: devuelve sub, correo normalizado y nombre | Pasó |
| PA-26 | backend/test/google.test.js:38 | rechaza firma ajena, otro client id, otro emisor y tokens vencidos | Pasó |
| PA-27 | backend/test/google.test.js:49 | rechaza correo sin verificar o ausente | Pasó |
| PA-28 | backend/test/google.test.js:54 | sin GOOGLE_CLIENT_ID o sin token, error claro | Pasó |
| PA-29 | backend/test/cloudinary.test.js:9 | firma igual al ejemplo de la documentación de Cloudinary | Pasó |
| PA-30 | backend/test/cloudinary.test.js:15 | la firma ignora vacíos y no depende del orden | Pasó |
| PA-31 | backend/test/cloudinary.test.js:20 | firma de subida: carpeta, límite de tamaño y sin el secreto | Pasó |
| PA-32 | backend/test/cloudinary.test.js:31 | imágenes permitidas: rutas propias y Cloudinary por https | Pasó |
| PA-33 | backend/test/mouser.test.js:35 | precios: texto con formato y RawPrice | Pasó |
| PA-34 | backend/test/mouser.test.js:43 | precio sugerido: USD x tipo de cambio x margen x IVA, al peso hacia arriba | Pasó |
| PA-35 | backend/test/mouser.test.js:52 | pieza sin precio ni stock (como responde Mouser fuera de su región) | Pasó |
| PA-36 | backend/test/mouser.test.js:65 | normaliza la parte de Mouser | Pasó |
| PA-37 | backend/test/mouser.test.js:81 | solo se importan imágenes de mouser.com por https | Pasó |
| PA-38 | backend/test/mouser.test.js:89 | búsqueda: arma la petición correcta, usa caché y reporta errores de Mouser | Pasó |
| PA-39 | backend/test/mouser.test.js:114 | tope propio de búsquedas por minuto | Pasó |
| PA-40 | backend/test/mapas.test.js:21 | consulta calificada: cada parte por separado y país MEX | Pasó |
| PA-41 | backend/test/mapas.test.js:30 | coordenadas: solo dentro de México | Pasó |
| PA-42 | backend/test/mapas.test.js:39 | lee la respuesta de HERE y redondea a 6 decimales | Pasó |
| PA-43 | backend/test/mapas.test.js:51 | geocodificar: arma la URL, usa caché y reporta errores de HERE | Pasó |
| PA-44 | backend/test/mapas.test.js:72 | al guardar: gana el pin del cliente; si HERE falla, se guarda sin ubicación | Pasó |
| PA-45 | backend/test/modo-prueba.test.js:34 | orden real desde una cuenta real: se rechaza y se reembolsa | Pasó |
| PA-46 | backend/test/modo-prueba.test.js:41 | orden de prueba (ORDTST…): se acepta sin consultar la cuenta | Pasó |
| PA-47 | backend/test/modo-prueba.test.js:50 | cuenta de usuario de prueba: se acepta aunque el id no sea ORDTST | Pasó |
| PA-48 | backend/test/modo-prueba.test.js:57 | el monto que se cobra sale del pedido y la tarjeta de débito se manda como debit_card | Pasó |
| PA-49 | backend/test/modo-prueba.test.js:65 | tarjeta sin fondos (402): no se aprueba y trae el motivo tal como lo manda MP | Pasó |
| PA-50 | backend/test/estados-pedido.test.js:9 | Pagado -> Enviado -> Entregado, y cancelar solo antes del envío | Pasó |
| PA-51 | backend/test/estados-pedido.test.js:16 | Pendiente -> Pagado a mano solo en modo de prueba | Pasó |
| PA-52 | backend/test/api.test.js:30 | registro, OAuth password/refresh/revoke, permisos y pedido | Pasó |
| PA-53 | backend/test/subscripciones.test.js:60 | solo un ADMIN puede suscribirse y recibe los cambios de pedidos en vivo | Pasó. En la corrida 45562259035, con la medición de v2.0: «RNF-82 pedido nuevo: 9 ms» y «RNF-82 cambio de estado: 5 ms» |
| PA-54 | backend/test/mcp.test.js:34 | MCP por HTTP sin token: catálogo, kits, recursos y prompt | Pasó |
| PA-55 | backend/test/mcp.test.js:74 | MCP por HTTP: token inválido es 401; con token salen los pedidos | Omitida (SKIP «sin MCP_EMAIL/MCP_PASSWORD»). Las aserciones anteriores al t.skip (401 con token inválido y 405 en GET /mcp, mcp.test.js:80-81) sí se ejecutaron; la parte con token válido no. |
| PA-56 | backend/test/mcp.test.js:100 | MCP por stdio (Claude Desktop) | Pasó |
| PA-57 | backend/test/deseos.test.js:30 | lista de deseos: agregar, sin duplicados, privada y quitar | Pasó |
| PA-58 | backend/test/facturacion.test.js:32 | factura opcional: público en general salvo que el pedido la pida | Pasó |
| PA-59 | backend/test/facturacion.test.js:77 | el admin mueve el pedido solo en orden: Pagado -> Enviado -> Entregado | Pasó |
| PA-60 | frontend/test/carrito.test.js:6 | carrito: suma repetidos y respeta el stock | Pasó |
| PA-66 | backend/test/cloudinary.test.js:40 | imagen de más de 5 MB: se rechaza al guardar el producto (RNF-92) | Pasó (corrida 45562259035) |
| PA-61 | .github/workflows/ci.yml | Validar (sintaxis, esquema GraphQL, migraciones, XSD): npm run validar | Pasó (paso en verde en la corrida) |
| PA-62 | .github/workflows/ci.yml | npm audit --omit=dev --audit-level=high (backend) | Pasó (paso en verde en la corrida) |
| PA-63 | .github/workflows/ci.yml | Preparar base de datos: psql -f db.sql y npm run migrar | Pasó (paso en verde en la corrida) |
| PA-64 | .github/workflows/ci.yml | Levantar el backend: curl -sf http://localhost:4000/ | Pasó (paso en verde en la corrida) |
| PA-65 | .github/workflows/ci.yml | Frontend: npm run build | Pasó (paso en verde en la corrida) |

Las pruebas PA-07, PA-19, PA-21, PA-29, PA-30, PA-33, PA-35, PA-36, PA-42, PA-46 y PA-47 no trazan a ningún requerimiento: comprueban funciones auxiliares, como el formato de fecha del SAT, la normalización de textos, la firma de Cloudinary o la lectura de precios de Mouser. No son un error. Si alguna protege una regla que el cliente necesita, esa regla debería escribirse como requerimiento.

## 2. Demostraciones (PM)

Las ejecutó la auditoría con curl desde fuera de la red del proyecto. Las pendientes deben ejecutarlas el equipo en la aplicación desplegada y registrar aquí la fecha, quién la ejecutó y el resultado observado.

| ID | Requisitos | Fecha | Ejecutó | Resultado observado | ¿Cumple? |
|---|---|---|---|---|---|
| PM-01 | RF-05; RNF-04, RNF-15, RNF-16, RNF-19, RNF-20 |  |  | Pendiente |  |
| PM-02 | RF-06 |  |  | Pendiente |  |
| PM-03 | RF-08 |  |  | Pendiente |  |
| PM-04 | RF-09; RNF-23 |  |  | Pendiente |  |
| PM-05 | RF-10; RNF-24 |  |  | Pendiente |  |
| PM-06 | RF-14; RNF-33 |  |  | Pendiente |  |
| PM-07 | RF-23 |  |  | Pendiente |  |
| PM-08 | RF-29; RNF-54, RNF-55, RNF-57, RNF-58.2 |  |  | Pendiente |  |
| PM-09 | RF-32; RNF-54 |  |  | Pendiente |  |
| PM-10 | RF-33; RNF-61, RNF-62 |  |  | Pendiente |  |
| PM-11 | RF-35; RNF-67 |  |  | Pendiente |  |
| PM-12 | RF-37; RNF-70, RNF-71, RNF-72 |  |  | Pendiente |  |
| PM-13 | RF-44; RNF-80.1 a RNF-80.7 |  |  | Pendiente |  |
| PM-14 | RF-46; RNF-83, RNF-84 |  |  | Pendiente |  |
| PM-15 | RF-47 |  |  | Pendiente |  |
| PM-16 | RF-48 |  |  | Pendiente |  |
| PM-17 | RF-53; RNF-105 |  |  | Pendiente |  |
| PM-18 | RF-54; RNF-60 |  |  | Pendiente |  |
| PM-19 | RF-55; RNF-85 |  |  | Pendiente |  |
| PM-20 | RF-56; RNF-86 |  |  | Pendiente |  |
| PM-21 | RF-57; RNF-87 |  |  | Pendiente |  |
| PM-22 | RF-58; RNF-88, RNF-90, RNF-91, RNF-93 |  |  | Pendiente |  |
| PM-23 | RF-59; RNF-88, RNF-90, RNF-91, RNF-93 |  |  | Pendiente |  |
| PM-24 | RF-60; RNF-46, RNF-94, RNF-95 |  |  | Pendiente |  |
| PM-25 | RF-66; RNF-106 |  |  | Pendiente |  |
| PM-26 | RF-67; RNF-107.9, RNF-108 |  |  | Pendiente |  |
| PM-27 | RF-69; RNF-67 |  |  | Pendiente |  |
| PM-28 | RF-70; RNF-77, RNF-110 |  |  | Pendiente |  |
| PM-29 | RNF-82, RNF-84 |  |  | Pendiente |  |
| PM-30 | RNF-119 | 2026-11-25 06:12 UTC | Auditoría (curl) | 20 cargas de https://voltrixf.netlify.app/buscar?q=sensor, todas HTTP 200: mín. 0.60 s, p50 0.67 s, p95 0.86 s, máx. 2.12 s. Mide el tiempo hasta recibir el HTML completo; no incluye el render del navegador. | Parcial: cumple el p95 con curl; falta la medición en el navegador |
| PM-31 | RNF-120 |  |  | Pendiente |  |
| PM-32 | RNF-123 |  |  | Pendiente |  |
| PM-33 | RNF-114 | 2026-11-25 | Auditoría (curl) | http://voltrix-backend-akbc.onrender.com/ → 301 a https; http://voltrixf.netlify.app/ → 301 a https. backend/.env.example usa sslmode=verify-full (línea 2) y mongodb+srv (línea 62). | Sí |
| PM-34 | RNF-115 | 2026-11-25 | Auditoría (curl) | OPTIONS /graphql con Origin: https://evil.example → 204 sin Access-Control-Allow-Origin. Con Origin: https://voltrixf.netlify.app → 204 con access-control-allow-origin: https://voltrixf.netlify.app. | Sí |
| PM-35 | RNF-112 | 2026-11-25 05:59 UTC | Auditoría (curl) | GET / → 200 {"servicio":"voltrix-backend","ok":true,"version":"2b8df49142797f6f6b2405a7491c1e455d0e6e77"}. | Sí |
| PM-36 | RF-43; RNF-77 |  |  | Pendiente |  |
| PM-37 | RF-65 |  |  | Pendiente |  |
| PM-38 | Sección 2.5 (supuesto de bases de datos) |  |  | Pendiente |  |
| PM-39 | D-10 |  |  | Pendiente: requiere desplegar la rama en producción |  |

## 3. Mediciones de rendimiento

Se separa el **valor objetivo** (lo que exige el requerimiento) del **valor medido** (lo que se observó). Un valor medido solo vale para las condiciones en que se midió.

| Requerimiento | Valor objetivo | Valor medido | Condiciones | Fecha |
|---|---|---|---|---|
| RNF-119 (página de búsqueda) | p95 ≤ 2 s en 20 solicitudes | p95 0.86 s (p50 0.67 s, máx. 2.12 s) | curl desde una sola conexión doméstica; servidor activo; HTML completo | 2026-11-25 06:12 UTC |
| Referencia: consulta GraphQL del catálogo | — | p95 0.20 s (p50 0.18 s, máx. 1.15 s) | `{ productos(busqueda:"sensor") { … } }` con POST /graphql, 20 solicitudes | 2026-11-25 06:06 UTC |
| RNF-82 (evento de pedido nuevo) | < 2 s | 9 ms | PA-53 en CI: backend, PostgreSQL y MongoDB en el mismo equipo; no incluye la red ni el navegador | 2026-11-25 06:40 UTC |
| RNF-82 (evento de cambio de estado) | < 2 s | 5 ms | Igual que la fila anterior | 2026-11-25 06:40 UTC |
| RNF-82 (fila visible en /admin/pedidos) | < 2 s | Sin medir | Requiere una cuenta ADMIN en producción (PM-29) | — |
| RNF-83 (stock en el panel) | < 2 s | Sin medir | Requiere una cuenta ADMIN (PM-14) | — |

Por qué el objetivo de RNF-119 es un percentil y no «cada consulta»: en la medición, 1 de 20 cargas tardó 2.12 s. Con la redacción de v1.0 («cada consulta en menos de 2 segundos»), un solo valor atípico de la red habría hecho fallar el requerimiento, aunque el 95 % de las cargas tardó menos de 0.86 s. El percentil 95 sobre 20 muestras tolera un valor atípico y sigue detectando un sistema lento.

La primera carga después de la suspensión del plan gratuito no cuenta para RNF-119: el requerimiento se mide con el servidor activo (sección 2.5 del SRS). En la auditoría, la primera carga del frontend tardó 4.70 s.

## 4. Pendientes de verificación

- RNF-82: verificado en CI por PA-53 (9 ms y 5 ms). Falta PM-29 para medirlo en producción con la red y el navegador.
- RNF-77 y RF-43: PA-55 se omite en CI. Opciones: configurar los secretos MCP_EMAIL y MCP_PASSWORD en GitHub Actions (lo hace el dueño del repositorio) o ejecutar PM-36.
- D-10: el aviso queda publicado en /privacidad cuando se despliegue la rama (PM-39). Faltan los datos del responsable.
- RNF-111: la tolerancia a fallos se prueba por servicio (MongoDB, Resend, Google, HERE), pero no hay una prueba de punta a punta que compre con un servicio caído.
- RNF-119: falta la medición en el navegador (PM-30).
- RNF-120 y RNF-123: demostraciones PM-31 y PM-32 sin ejecutar.
- PM-01 a PM-29, PM-31, PM-32 y PM-36 a PM-39: sin ejecutar.
