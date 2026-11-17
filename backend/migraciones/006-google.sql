-- Inicio de sesión con Google (autenticación externa, SRS §3.3).
-- No borra nada y se puede repetir.
--   npm run migrar

-- "sub" de Google: el identificador estable de la cuenta (el correo puede cambiar).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS google_sub varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_google_sub_idx ON usuario (google_sub);

-- Quien entra solo con Google no tiene contraseña. Puede ponerse una después
-- con "¿Olvidaste tu contraseña?".
ALTER TABLE usuario ALTER COLUMN password DROP NOT NULL;
