-- Recuperación de contraseña (RF1.3). Como con los tokens OAuth, solo se
-- guarda el sha256 del token: una copia de la base no sirve para usarlo.
-- No borra nada y se puede repetir.
--   npm run migrar

CREATE TABLE IF NOT EXISTS password_reset (
  hash       char(64) PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  creado     timestamptz NOT NULL DEFAULT now(),
  expira     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_reset_usuario_id_idx ON password_reset (usuario_id);
