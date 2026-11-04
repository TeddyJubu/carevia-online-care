import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // ponytail: copy and prices are read from ../src (shared with designs 03 and 04.2), so the dev server may read the repo root.
  server: { fs: { allow: ['..'] } },
})
