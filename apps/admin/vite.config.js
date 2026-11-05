import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production: served at https://carevia.claudemod.tech/admin/ next to the patient app (/app/) and the API (/api),
// so it calls /api relatively and shares the origin. Development stays at http://localhost:5174/.
// The app has no router (screens are state), so there is no basename to keep in step.
export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` runs with command "serve", so it needs isPreview to serve the build at /admin/ too.
  base: command === 'build' || isPreview ? '/admin/' : '/',
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.API_URL || 'http://127.0.0.1:4000' },
  },
  preview: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.API_URL || 'http://127.0.0.1:4000' },
  },
}))
