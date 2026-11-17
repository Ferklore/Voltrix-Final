-- Agrega pagos a una base que ya existe SIN borrar nada (a diferencia de db.sql).
--   psql "$DATABASE_URL" -f migraciones/001-pagos.sql
-- Se puede correr más de una vez.

DO $$ BEGIN
  CREATE TYPE proveedor_pago AS ENUM ('PAYPAL', 'MERCADOPAGO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pago (
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
CREATE INDEX IF NOT EXISTS pago_pedido_id_idx ON pago (pedido_id);
