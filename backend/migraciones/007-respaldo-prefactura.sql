-- Respaldo de cada prefactura en Cloudinary (archivos privados).
-- { xml: { publicId, bytes }, pdf: { publicId, bytes }, fecha } o NULL si no se ha respaldado.
-- No se guarda la URL: la que devuelve Cloudinary trae una firma que abre el archivo.
-- No borra nada y se puede repetir.
--   npm run migrar
ALTER TABLE prefactura ADD COLUMN IF NOT EXISTS respaldo jsonb;
