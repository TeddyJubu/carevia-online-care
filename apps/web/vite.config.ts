import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser sees one origin: /app/ is this app, /api is proxied to the API (port 4001 for this thread, see PLAN.md).
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4001' },
    // Content files live in ../../content (owned by the content thread).
    fs: { allow: ['../..'] },
  },
  preview: { port: 5180, strictPort: true, proxy: { '/api': process.env.API_URL ?? 'http://localhost:4001' } },
})
