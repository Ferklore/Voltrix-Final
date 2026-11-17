-- Factura opcional: el cliente marca "¿Necesitas factura?" en el checkout.
-- false (lo normal) -> la prefactura sale a PUBLICO EN GENERAL.
-- true              -> sale a nombre del cliente con sus datos fiscales.
-- Los pedidos de antes quedan en false. No borra nada y se puede repetir.
--   npm run migrar
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS requiere_factura boolean NOT NULL DEFAULT false;

-- Pedidos que ya tenían prefactura a nombre de alguien: se respeta.
UPDATE pedido SET requiere_factura = true
 WHERE NOT requiere_factura
   AND id IN (SELECT pedido_id FROM prefactura WHERE receptor_rfc <> 'XAXX010101000');
