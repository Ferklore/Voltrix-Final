-- Prefactura CFDI: datos fiscales del cliente, clave SAT de cada producto y la
-- tabla donde se guarda el XML generado. No borra nada y se puede repetir.
--   npm run migrar

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
  errores      jsonb NOT NULL DEFAULT '[]'
);
