# Evidencia del código especificado — Voltrix

El SRS v2.0 describe y verifica el código de este commit. Cualquier persona puede repetir cada comprobación con los comandos indicados.

| Dato | Valor |
|---|---|
| Repositorio | https://github.com/Ferklore/Voltrix-Final |
| Rama | main |
| Commit | `2b8df49142797f6f6b2405a7491c1e455d0e6e77` |
| Árbol (tree) | `a4f98bd45e669898a127640ff2b77b9be6c97582` |
| Fecha del commit | 2026-11-19 22:24:37 −06:00 (2026-11-20 04:24:37 UTC) |
| Mensaje | Quitar configuración local del editor del repositorio |
| Fecha de sincronización de esta auditoría | 2026-11-25 (UTC) |

## Cuatro fuentes que coinciden

| Fuente | Cómo comprobarlo | Resultado el 2026-11-25 |
|---|---|---|
| Archivo de entrega `Voltrix_PWebII_8C.zip` | `unzip -z Voltrix_PWebII_8C.zip` (comentario que GitHub escribe al descargar el zip) | `2b8df49142797f6f6b2405a7491c1e455d0e6e77` |
| | `sha256sum Voltrix_PWebII_8C.zip` | `b4f1bfd278f4beeec0e1ff9efd04e1b3fab7fe122e6369ed3fa5279d22cbc08b` |
| | Comparar el contenido del zip con un clon del commit: `diff -rq` | Sin diferencias |
| Rama main en GitHub | `git ls-remote https://github.com/Ferklore/Voltrix-Final main` | `2b8df49…` |
| Backend en producción | `curl https://voltrix-backend-akbc.onrender.com/` | `{"servicio":"voltrix-backend","ok":true,"version":"2b8df49142797f6f6b2405a7491c1e455d0e6e77"}` |
| Pipeline de CI/CD | https://github.com/Ferklore/Voltrix-Final/actions/runs/44674351700 | head_sha `2b8df49…`, conclusión success (2026-11-20 04:25:54 a 04:28:31 UTC); jobs Backend, Frontend y Desplegar en éxito |

El backend reporta su versión en `GET /` (backend/src/index.js:88), y el paso «Esperar a que el backend nuevo esté arriba» del CI no publica el frontend hasta que esa versión es igual a `GITHUB_SHA`. Por eso la versión que responde Render es evidencia de qué código está desplegado.

## Documento evaluado

| Dato | Valor |
|---|---|
| SRS v1.0 evaluado (`SRS_VOLTRIX.md`) | sha256 `d7c1dc4dc5fdf38cb5b7a9192cc191740b4d7472357746355557a3574b969140` |
| Copia sin cambios en este repositorio | Commit `5ab8b0f` de la rama `docs/srs-v2`, archivo docs/SRS.md |

Todos los cambios de v2.0 se ven con `git diff 5ab8b0f -- docs/SRS.md`.

## Observación de la auditoría anterior

La auditoría anterior registró que el backend de Render no respondió (HTTP 000). El 2026-11-25 respondió 200 en `GET /`, `POST /graphql` y `POST /mcp`. Lo más probable es que el plan gratuito estuviera suspendido por inactividad (sección 2.5 del SRS): la primera petición después de unos 15 minutos sin tráfico puede tardar cerca de un minuto. Antes de una revisión conviene abrir la URL del backend uno o dos minutos antes.
