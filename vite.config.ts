/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Solo para pruebas locales: redirige /rest/v1 a un PostgREST local (ver docs/pruebas.md)
  server: process.env.LOCAL_POSTGREST ? { proxy: { '/rest/v1': { target: process.env.LOCAL_POSTGREST, rewrite: (p) => p.replace(/^\/rest\/v1/, '') } } } : undefined,
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], setupFiles: ['src/test/setup.ts'] },
})
