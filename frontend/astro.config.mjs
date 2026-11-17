import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import netlify from '@astrojs/netlify'

// El frontend solo dibuja: los datos los pide al backend (PUBLIC_API_URL).
export default defineConfig({
  output: 'server',
  // Sin Edge Functions: evita que el adapter intente levantar Deno en local.
  adapter: netlify({ devFeatures: { edgeFunctions: false } }),
  integrations: [react()],
})
