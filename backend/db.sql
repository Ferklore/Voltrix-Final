-- Voltrix. Esquema y catálogo inicial (PostgreSQL 13+).
--
--   psql "$DATABASE_URL" -f db.sql
--
-- Empieza con DROP, así que se puede repetir. Ojo: borra pedidos y usuarios.
-- No trae usuarios: los clientes se registran en /registro y el admin se crea
-- con `npm run crear-admin`.

DROP TABLE IF EXISTS lista_deseos, password_reset, prefactura, pago, oauth_token, detalle_pedido, pedido, producto, usuario, categoria;
DROP TYPE  IF EXISTS rol_usuario, status_pedido, proveedor_pago, metodo_pago, status_pago;

CREATE TYPE rol_usuario   AS ENUM ('CLIENTE', 'ADMIN');
CREATE TYPE status_pedido AS ENUM ('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO');

CREATE TABLE categoria (
  id          serial PRIMARY KEY,
  nombre      varchar(100) NOT NULL,
  descripcion varchar(255)
);

CREATE TABLE producto (
  id               serial PRIMARY KEY,
  nombre           varchar(150) NOT NULL,
  precio           numeric(10,2) NOT NULL CHECK (precio >= 0),
  imagen           varchar(255),
  especificaciones varchar(255),
  stock            integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  categoria_id     integer REFERENCES categoria (id)
);
CREATE INDEX producto_categoria_id_idx ON producto (categoria_id);

CREATE TABLE usuario (
  id               serial PRIMARY KEY,
  nombre           varchar(150) NOT NULL,
  email            varchar(150) NOT NULL UNIQUE,  -- siempre en minúsculas
  password         varchar(255) NOT NULL,         -- hash scrypt (src/auth.js); NULL si solo entra con Google
  rol              rol_usuario NOT NULL DEFAULT 'CLIENTE',
  intentos_fallidos integer NOT NULL DEFAULT 0,
  bloqueado_hasta  timestamptz
);

CREATE TABLE pedido (
  id         serial PRIMARY KEY,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  total      numeric(10,2) NOT NULL,
  status     status_pedido NOT NULL DEFAULT 'PENDIENTE',
  usuario_id integer NOT NULL REFERENCES usuario (id)
);
CREATE INDEX pedido_usuario_id_idx ON pedido (usuario_id);

CREATE TABLE detalle_pedido (
  id          serial PRIMARY KEY,
  pedido_id   integer NOT NULL REFERENCES pedido (id),
  producto_id integer NOT NULL REFERENCES producto (id),
  cantidad    integer NOT NULL CHECK (cantidad > 0),
  subtotal    numeric(10,2) NOT NULL
);
CREATE INDEX detalle_pedido_pedido_id_idx   ON detalle_pedido (pedido_id);
CREATE INDEX detalle_pedido_producto_id_idx ON detalle_pedido (producto_id);

-- Pagos con PayPal / Mercado Pago. Un pedido puede tener varios intentos
-- (canceló en PayPal y luego pagó con MP); el que cuenta es el APROBADO.
--   referencia     = id de la orden de PayPal o de la preferencia de MP (al iniciar)
--   id_transaccion = id de la captura de PayPal o del pago de MP (al cobrar)
CREATE TYPE proveedor_pago AS ENUM ('PAYPAL', 'MERCADOPAGO');

CREATE TABLE pago (
  id             serial PRIMARY KEY,
  pedido_id      integer NOT NULL REFERENCES pedido (id),
  proveedor      proveedor_pago NOT NULL,
  referencia     varchar(100),
  id_transaccion varchar(100),
  estado         varchar(10) NOT NULL DEFAULT 'CREADO'
                 CHECK (estado IN ('CREADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO')),
  monto          numeric(10,2) NOT NULL,
  creado         timestamptz NOT NULL DEFAULT now(),
  actualizado    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, id_transaccion)
);
CREATE INDEX pago_pedido_id_idx ON pago (pedido_id);

-- Tokens OAuth 2.0 (access y refresh). Solo se guarda el sha256 del token, así
-- que una copia de la base no sirve para hacerse pasar por nadie. Los tokens
-- emitidos juntos comparten "familia": revocar uno revoca la familia entera.
CREATE TABLE oauth_token (
  hash       char(64) PRIMARY KEY,
  tipo       varchar(7) NOT NULL CHECK (tipo IN ('access', 'refresh')),
  familia    uuid NOT NULL,
  usuario_id integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  expira     timestamptz NOT NULL
);
CREATE INDEX oauth_token_familia_idx ON oauth_token (familia);

-- Prefactura CFDI (igual que migraciones/003-cfdi.sql).

-- Datos fiscales del receptor (opcionales). Si el cliente no los captura, su
-- prefactura sale a "PUBLICO EN GENERAL" (RFC XAXX010101000).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS rfc            varchar(13);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS razon_social   varchar(254);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS cp_fiscal      char(5);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS regimen_fiscal char(3);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS uso_cfdi       varchar(4);

-- Clave del catálogo c_ClaveProdServ del SAT. 01010101 = "No existe en el catálogo".
ALTER TABLE producto ADD COLUMN IF NOT EXISTS clave_prod_serv char(8) NOT NULL DEFAULT '01010101';

-- Una prefactura por pedido. Se guarda el XML tal cual se generó (con los datos
-- del receptor de ese momento) y el resultado de su validación.
CREATE TABLE IF NOT EXISTS prefactura (
  pedido_id    integer PRIMARY KEY REFERENCES pedido (id),
  serie        varchar(25) NOT NULL,
  folio        varchar(40) NOT NULL,
  fecha        timestamptz NOT NULL DEFAULT now(),
  receptor_rfc varchar(13) NOT NULL,
  subtotal     numeric(12,2) NOT NULL,
  iva          numeric(12,2) NOT NULL,
  total        numeric(12,2) NOT NULL,
  xml          text NOT NULL,
  datos        jsonb NOT NULL,                -- el comprobante ya calculado (para el PDF)
  valida       boolean NOT NULL,
  errores      jsonb NOT NULL DEFAULT '[]',
  respaldo     jsonb                          -- copia en Cloudinary (007)
);

-- Dirección y ofertas (igual que migraciones/004-direccion-ofertas.sql).

-- Dirección de envío. Las cuentas que ya existían quedan sin dirección y la
-- capturan en "Mi cuenta"; las nuevas la dan al registrarse.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS calle         varchar(150); -- calle y número
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS colonia       varchar(100);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS ciudad        varchar(100);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS estado        varchar(60);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS codigo_postal char(5);

-- Oferta: si precio_anterior es mayor que precio, el producto está en oferta y
-- la tienda muestra el precio anterior tachado.
ALTER TABLE producto ADD COLUMN IF NOT EXISTS precio_anterior numeric(10,2);
DO $$ BEGIN
  ALTER TABLE producto ADD CONSTRAINT producto_precio_anterior_check
    CHECK (precio_anterior IS NULL OR precio_anterior > precio);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recuperación de contraseña (igual que migraciones/005-recuperar-password.sql).
CREATE TABLE IF NOT EXISTS password_reset (
  hash       char(64) PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  creado     timestamptz NOT NULL DEFAULT now(),
  expira     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_reset_usuario_id_idx ON password_reset (usuario_id);

-- Login con Google (igual que migraciones/006-google.sql).

-- "sub" de Google: el identificador estable de la cuenta (el correo puede cambiar).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS google_sub varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_google_sub_idx ON usuario (google_sub);

-- Quien entra solo con Google no tiene contraseña. Puede ponerse una después
-- con "¿Olvidaste tu contraseña?".
ALTER TABLE usuario ALTER COLUMN password DROP NOT NULL;

-- Lista de deseos (igual que migraciones/008-lista-deseos.sql).
CREATE TABLE IF NOT EXISTS lista_deseos (
  usuario_id  integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES producto (id) ON DELETE CASCADE,
  creado      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, producto_id)
);
CREATE INDEX IF NOT EXISTS lista_deseos_producto_id_idx ON lista_deseos (producto_id);

-- Ubicación de envío (igual que migraciones/009-ubicacion.sql).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS lng double precision;

-- Factura opcional (igual que migraciones/010-factura-opcional.sql).
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS requiere_factura boolean NOT NULL DEFAULT false;

INSERT INTO categoria (id, nombre, descripcion) VALUES
(1, 'Microcontroladores', 'Placas ESP32, Arduino, STM32'),
(2, 'Sensores', 'Sensores de temperatura, humedad, gas'),
(3, 'Displays', 'Pantallas OLED, LCD I2C');

INSERT INTO producto (id, nombre, precio, imagen, especificaciones, stock, categoria_id) VALUES
(1, 'ESP32 WROOM 32D', 145.00, '/productos/esp32.svg', 'Dual core, WiFi/BT, 3.3V', 50, 1),
(2, 'Arduino Mega 2560', 480.00, '/productos/arduino-mega.svg', 'ATmega2560, 54 I/O digital', 20, 1),
(3, 'Sensor DHT11', 45.00, '/productos/dht11.svg', 'Humedad 20-90%, Temp 0-50°C', 100, 2),
(4, 'Pantalla LCD 16x2 I2C', 95.00, '/productos/lcd-1602.svg', 'Fondo azul, dirección 0x27', 35, 3),
(5, 'Display OLED 0.96 I2C', 110.00, '/productos/oled-096.svg', '128x64 pixeles, 3.3V-5V', 40, 3);

-- Dos productos en oferta para que la sección de ofertas no salga vacía.
UPDATE producto SET precio_anterior = 175.00 WHERE id = 1;
UPDATE producto SET precio_anterior = 129.00 WHERE id = 4;

-- Los INSERT traen el id a mano; setval adelanta cada secuencia.
SELECT setval('categoria_id_seq', (SELECT max(id) FROM categoria));
SELECT setval('producto_id_seq',  (SELECT max(id) FROM producto));
