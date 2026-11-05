import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { toNodeHandler } from 'better-auth/node'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { auth } from './server/auth.ts'

// ponytail: auth runs inside the Vite dev and preview servers for the demo. Move it to a real server (Hono, Express) before launch.
function betterAuth(): Plugin {
  const handler = toNodeHandler(auth)
  const mount = ({ middlewares }: { middlewares: Connect.Server }) => {
    // Matched by hand, not with use('/api/auth', ...): connect would strip the prefix and Better Auth would see the wrong path.
    middlewares.use((req, res, next) => (req.url?.startsWith('/api/auth/') ? handler(req, res) : next()))
  }
  return { name: 'better-auth', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), betterAuth()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // ponytail: copy and prices are read from ../src (shared with designs 03 and 04.2), so the dev server may read the repo root.
  server: { fs: { allow: ['..'] } },
})
