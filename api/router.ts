import { loadConfig } from '../server/config.js'
import { createNeonDb } from '../server/db/neon.js'
import { createApp } from '../server/http/app.js'
import { createGoogleAuth } from '../server/http/google.js'
import { fetchClientMetadata } from '../server/core/oauth-clients.js'

const config = loadConfig()
const url = process.env.DATABASE_URL
if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')
const app = createApp({ db: createNeonDb(url), config, google: createGoogleAuth(config), now: () => new Date(), fetchClientMetadata })

/** vercel.json rewrite mọi đường dẫn backend về đây kèm `__p` = đường dẫn gốc. */
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const original = url.searchParams.get('__p')
  if (original) {
    url.searchParams.delete('__p')
    url.pathname = original
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()
  return app.fetch(new Request(url, { method: req.method, headers: req.headers, body }))
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS }
