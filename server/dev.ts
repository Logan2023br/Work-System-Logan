import type { Hono } from 'hono'
import { loadConfig } from './config.js'
import { createNeonDb } from './db/neon.js'
import { openPglite } from './db/pglite.js'
import type { Db } from './db/types.js'
import { createApp, type AppEnv } from './http/app.js'
import { createGoogleAuth } from './http/google.js'
import { fetchClientMetadata } from './core/oauth-clients.js'

const g = globalThis as typeof globalThis & { __wsDevDb?: Promise<Db> }

/** Vite có thể nạp lại module này; giữ một DB duy nhất để PGlite không mở trùng thư mục. */
function devDb(): Promise<Db> {
  const url = process.env.DATABASE_URL
  g.__wsDevDb ??= url ? Promise.resolve(createNeonDb(url)) : openPglite(process.env.PGLITE_DIR ?? '.pglite')
  return g.__wsDevDb
}

export async function getDevApp(): Promise<Hono<AppEnv>> {
  const config = loadConfig()
  return createApp({ db: await devDb(), config, google: createGoogleAuth(config), now: () => new Date(), fetchClientMetadata })
}
