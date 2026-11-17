-- Dirección física del cliente (RF1.1) y ofertas en el catálogo (RF2.2).
-- No borra nada y se puede repetir.
--   npm run migrar

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
