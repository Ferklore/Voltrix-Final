-- Bases creadas con la primera versión de pagos: la tabla "pago" ya existía con
-- columnas metodo / transaccion / status, así que el CREATE TABLE IF NOT EXISTS
-- de 001 no la tocó y el backend fallaba con "column proveedor does not exist".
-- Aquí se convierte al esquema actual conservando los registros.
-- Se puede correr más de una vez: si la tabla ya está al día, no hace nada.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'pago' AND column_name = 'metodo') THEN
    ALTER TABLE pago DROP CONSTRAINT IF EXISTS pago_metodo_referencia_key;

    -- MERCADO_PAGO -> MERCADOPAGO
    ALTER TABLE pago ADD COLUMN proveedor proveedor_pago;
    UPDATE pago SET proveedor = replace(metodo::text, '_', '')::proveedor_pago;
    ALTER TABLE pago ALTER COLUMN proveedor SET NOT NULL;
    ALTER TABLE pago DROP COLUMN metodo;

    -- EN_PROCESO -> PENDIENTE
    ALTER TABLE pago ADD COLUMN estado varchar(10) NOT NULL DEFAULT 'CREADO'
      CHECK (estado IN ('CREADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO'));
    UPDATE pago SET estado = CASE status::text WHEN 'EN_PROCESO' THEN 'PENDIENTE' ELSE status::text END;
    ALTER TABLE pago DROP COLUMN status;

    ALTER TABLE pago RENAME COLUMN transaccion TO id_transaccion;
    ALTER TABLE pago ALTER COLUMN referencia DROP NOT NULL;
    ALTER TABLE pago ADD CONSTRAINT pago_proveedor_id_transaccion_key UNIQUE (proveedor, id_transaccion);

    DROP TYPE IF EXISTS metodo_pago;
    DROP TYPE IF EXISTS status_pago;
  END IF;
END $$;
