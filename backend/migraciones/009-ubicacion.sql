-- Ubicación de envío en el mapa (SRS §3.3, servicios de mapas).
-- Coordenadas de la dirección del cliente: las calcula HERE al guardar la
-- dirección o las pone el cliente moviendo el pin. NULL = sin ubicar.
-- No borra nada y se puede repetir.
--   npm run migrar
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS lng double precision;
