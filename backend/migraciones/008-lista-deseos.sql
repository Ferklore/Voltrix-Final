-- Lista de deseos (propuesta: "wishlist"). Un renglón por cliente y producto.
-- Si se borra el usuario o el producto, sus renglones se van con él.
-- No borra nada y se puede repetir.
--   npm run migrar
CREATE TABLE IF NOT EXISTS lista_deseos (
  usuario_id  integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES producto (id) ON DELETE CASCADE,
  creado      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, producto_id)
);
CREATE INDEX IF NOT EXISTS lista_deseos_producto_id_idx ON lista_deseos (producto_id);
