import react from '@vitejs/plugin-react'
import { getRequestListener } from '@hono/node-server'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const BACKEND = /^\/(api|auth|mcp|oauth|\.well-known)(\/|\?|$)/

/** Gắn backend Hono vào Vite dev server — một lệnh `npm run dev` chạy cả hai. */
function devBackend(): Plugin {
  return {
    name: 'work-system-backend',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !BACKEND.test(req.url)) return next()
        try {
          const mod = (await server.ssrLoadModule('/server/dev.ts')) as {
            getDevApp: () => Promise<{ fetch: (r: Request) => Response | Promise<Response> }>
          }
          const app = await mod.getDevApp()
          await getRequestListener(app.fetch)(req, res)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[k] ??= v
  return { plugins: [react(), devBackend()] }
})
