# Cuestionario — Métodos de pago (PayPal y Mercado Pago) en Voltrix

## 1. Conceptos generales

**1. ¿Qué es una pasarela de pago?**
Un servicio que procesa cobros en línea entre el comprador, la tienda y el banco. Recibe los datos de tarjeta o cuenta de forma segura, los valida y transfiere el dinero, así la tienda no maneja información bancaria.

**2. ¿Qué pasarelas se usaron en Voltrix y qué tipo de flujo tienen?**
PayPal y Mercado Pago, ambas con flujo de **redirección**: el cliente paga en la página del proveedor y nuestra página nunca ve datos de tarjeta.

**3. ¿Qué es el entorno sandbox?**
Un entorno de pruebas donde se usan credenciales, cuentas y tarjetas de prueba para simular cobros sin mover dinero real.

**4. En el sandbox de Mercado Pago, ¿qué nombre de titular aprueba el pago y cuál lo rechaza?**
`APRO` aprueba y `OTHE` rechaza.

**5. ¿Qué es la idempotencia y por qué importa en pagos?**
Una operación es idempotente si ejecutarla varias veces da el mismo resultado que ejecutarla una vez. Evita cobros duplicados por doble clic o reintentos de red.

**6. ¿Cómo se aplicó la idempotencia en el proyecto?**
Con el encabezado `PayPal-Request-Id` en PayPal, `X-Idempotency-Key` en Mercado Pago, y la restricción `UNIQUE (proveedor, id_transaccion)` en la tabla `pago`.

**7. ¿Qué es un webhook?**
Una petición HTTP que un servicio externo envía automáticamente a nuestro servidor cuando ocurre un evento, en lugar de que nosotros preguntemos a cada rato.

**8. ¿Cuál es la "regla de oro" del servicio de pagos?**
El pedido pasa a `PAGADO` solo cuando el backend le preguntó al proveedor y este confirmó el cobro por el monto y la moneda correctos. Nada de lo que mande el navegador (como el `status` en la URL) cuenta como prueba.

## 2. PayPal (Orders API v2)

**9. ¿En cuántos pasos funciona la Orders API v2 y cuáles son?**
En dos: (1) **crear la orden** con monto y moneda, (2) **capturarla** después de que el cliente la aprueba. La captura es cuando realmente se cobra.

**10. ¿Qué pasa si se crea la orden pero nunca se captura?**
No hay cobro. Sin captura no hay dinero.

**11. ¿Cómo obtiene el backend el token para hablar con PayPal?**
Con `POST /v1/oauth2/token` y `grant_type=client_credentials`, mandando `CLIENT_ID:SECRET` en Base64 en el encabezado `Authorization: Basic`.

**12. ¿Cuánto dura ese token y cómo se maneja?**
Unas 9 horas. Se guarda en memoria y se pide otro un minuto antes de que venza.

**13. ¿A qué endpoint se crea la orden y con qué `intent`?**
`POST /v2/checkout/orders` con `intent: 'CAPTURE'`.

**14. ¿Qué campos de la orden sirven para ligarla con nuestro pedido?**
`reference_id` (id del pedido) y `custom_id` (`voltrix-<id>`).

**15. ¿Qué link de la respuesta se usa para mandar al cliente a pagar?**
El link con `rel` igual a `payer-action` (o `approve`).

**16. Al regresar de PayPal, ¿qué parámetro trae la URL?**
`?token=<id de la orden>`.

**17. ¿Qué hace el backend si al capturar recibe error 422 `ORDER_ALREADY_CAPTURED`?**
Consulta la orden con `GET /v2/checkout/orders/:id` y usa ese resultado (pasa cuando el cliente recarga la página).

**18. ¿Cuándo se considera aprobado un pago de PayPal?**
Cuando el `status` de la orden es `COMPLETED` y la captura también es `COMPLETED`.

**19. ¿Qué significa una captura en estado `PENDING`?**
PayPal retuvo el dinero (por ejemplo, la cuenta no acepta esa moneda). El pago queda pendiente.

**20. ¿Por qué se verifica que la orden exista en la tabla `pago` antes de capturar?**
Para solo capturar órdenes que nosotros creamos para **ese** pedido; si no coincide, se lanza `PAGO_NO_COINCIDE`.

## 3. Mercado Pago (Checkout Pro)

**21. ¿Qué es una "preferencia" en Checkout Pro?**
El objeto que crea la tienda con los productos del pedido; Mercado Pago devuelve una URL (`init_point`) donde el cliente paga.

**22. ¿A qué endpoint se crea la preferencia?**
`POST /checkout/preferences`.

**23. ¿Qué es `external_reference` y qué valor tiene?**
El campo que une el pago de MP con nuestro pedido. Vale `voltrix-<id del pedido>`.

**24. ¿Para qué sirven `back_urls` y `auto_return`?**
`back_urls` (success, pending, failure) indican a dónde regresa el cliente; `auto_return: 'approved'` lo regresa automáticamente si el pago se aprobó.

**25. ¿Por qué no se mandan `auto_return` ni `notification_url` cuando la URL es localhost?**
Porque Mercado Pago no acepta localhost; el cliente vería "Algo ha salido mal". Solo se mandan si la URL es pública y `https`.

**26. Si el cliente no regresa a nuestra página (p. ej. en local), ¿cómo se confirma el pago?**
Con el botón "Ya pagué, verificar" en su cuenta, que busca el pago con `GET /v1/payments/search` por `external_reference`.

**27. ¿Por qué no se confía en el `status` que viene en la URL de regreso?**
Porque el usuario lo puede modificar. El backend siempre consulta `GET /v1/payments/:id` con su propio token.

**28. ¿Qué estados de MP se toman como pendientes?**
`pending`, `in_process` y `authorized`. Solo `approved` cuenta como aprobado.

**29. ¿Cómo funciona el webhook de Mercado Pago en Voltrix?**
MP llama a `POST /webhooks/mercadopago`. No se confía en el contenido: solo se toma el id del pago, se consulta a MP y luego se llama a `confirmarPago` (con `usuario = null`).

## 4. Backend, base de datos y seguridad

**30. ¿Qué mutaciones GraphQL se agregaron para pagos y pedidos?**
`iniciarPago`, `confirmarPago`, `cancelarPedido`, `cambiarStatusPedido` y `cambiarRol`.

**31. ¿Qué hace `iniciarPago`?**
Verifica que el pedido sea del usuario y esté `PENDIENTE`, crea la orden (PayPal) o la preferencia (MP), inserta un registro en `pago` con estado `CREADO` y devuelve la URL del proveedor.

**32. ¿Qué tres cosas se comparan en `confirmarPago` para aceptar un pago?**
Que el `pedidoId` coincida, que la **moneda** sea la esperada (MXN) y que el **monto** sea igual al total (diferencia < 0.01).

**33. ¿Qué pasa si el proveedor aprobó el pago pero el monto no coincide?**
No se marca `PAGADO`; el pago se marca `RECHAZADO`, se deja un aviso en consola y un admin lo revisa.

**34. ¿Qué columnas tiene la tabla `pago`?**
`id`, `pedido_id`, `proveedor` (PAYPAL | MERCADOPAGO), `referencia`, `id_transaccion`, `estado`, `monto`, `creado`, `actualizado`.

**35. ¿Qué estados puede tener un pago?**
`CREADO`, `PENDIENTE`, `APROBADO` y `RECHAZADO`.

**36. ¿Cuál es la diferencia entre `referencia` e `id_transaccion`?**
`referencia` es el id de la orden (PayPal) o de la preferencia (MP); `id_transaccion` es el id de la captura o del pago real.

**37. ¿Por qué `registrarAprobado` usa una transacción con `SELECT ... FOR UPDATE`?**
Para bloquear el pedido y que, si el regreso del cliente y el webhook llegan al mismo tiempo, el pago no se registre dos veces.

**38. ¿Qué hacen `BEGIN`, `COMMIT` y `ROLLBACK`?**
`BEGIN` inicia la transacción, `COMMIT` confirma los cambios y `ROLLBACK` los deshace si algo falla.

**39. ¿Qué pasa si llega un pago aprobado de un pedido ya `CANCELADO`?**
Se registra el pago pero el pedido no cambia; se deja un aviso para que un admin decida si reembolsa desde el panel del proveedor.

**40. ¿Por qué un pedido `CANCELADO` no se puede reactivar?**
Porque al cancelarlo ya se devolvió su stock.

## 5. Estados del pedido y panel de administración

**41. ¿Cuál es el flujo de estados de un pedido?**
`PENDIENTE` → `PAGADO` → `ENVIADO` → `ENTREGADO`. Desde `PENDIENTE` también puede pasar a `CANCELADO`.

**42. ¿Quién puede mover un pedido de `PENDIENTE` a `PAGADO`?**
Solo `confirmarPago`, cuando el backend verificó el cobro con el proveedor. `ENVIADO` y `ENTREGADO` los asigna el admin.

**43. ¿Qué es RBAC y qué roles hay en Voltrix?**
Control de acceso basado en roles: los permisos se asignan a roles. Hay `CLIENTE` y `ADMIN`.

**44. ¿Quién protege realmente los datos del panel admin, el frontend o el backend?**
El backend. El frontend solo esconde el panel; cada resolver de admin llama a `requiereAdmin`, que responde `FORBIDDEN` si el token no es de un administrador.

**45. ¿Qué métricas muestra el resumen del dashboard?**
Ventas totales, ticket promedio, pedidos por enviar y pendientes de pago, clientes, ventas por día, pedidos por estado, cobrado por proveedor, más vendidos y stock bajo.

**46. ¿Con qué se hicieron las gráficas del dashboard?**
Solo con CSS, sin librerías.

**47. ¿Por qué se consumieron las APIs de PayPal y Mercado Pago con `fetch` en lugar de un SDK?**
Porque son APIs REST simples; con `fetch` se controlan directamente los encabezados (token, idempotencia) y no se agregan dependencias.
