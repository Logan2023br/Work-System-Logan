import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Config } from '../config.js'
import { AppError, forbidden, unauthorized } from '../core/errors.js'
import { userFromSession } from '../core/sessions.js'
import type { User } from '../core/users.js'
import type { Db } from '../db/types.js'
import { apiRoutes } from './api.js'
import { authRoutes } from './auth.js'
import type { MetadataFetcher } from '../core/oauth-clients.js'
import { oauthRoutes } from './oauth.js'
import { cleanup } from '../core/cleanup.js'
import { mcpHandler } from './mcp.js'
import type { GoogleAuth } from './google.js'

export interface AppDeps {
  db: Db
  config: Config
  google: GoogleAuth
  now: () => Date
  fetchClientMetadata: MetadataFetcher
}

export type AppEnv = { Variables: { user: User } }

export const sessionCookieName = (cfg: Config) => (cfg.secureCookies ? '__Host-ws_session' : 'ws_session')

const SAFE_BASE = 'https://work-system.invalid'

/** Chỉ nhận đường dẫn nội bộ. Ký tự điều khiển (tab, xuống dòng…) và dấu \ bị từ chối vì trình duyệt bỏ qua/đổi chúng khi phân tích URL. */
export function safeNext(n: string | undefined): string {
  if (!n || !n.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(n)) return '/'
  let url: URL
  try {
    url = new URL(n, SAFE_BASE)
  } catch {
    return '/'
  }
  if (url.origin !== SAFE_BASE) return '/'
  return url.pathname + url.search + url.hash
}

export function requireUser(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) throw unauthorized()
    c.set('user', user)
    await next()
  }
}

/** Chống CSRF: mọi request ghi từ trình duyệt phải đến từ chính origin của app. */
export function sameOrigin(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const origin = new URL(deps.config.publicUrl).origin
  return async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== origin) {
      throw forbidden('Yêu cầu không đến từ Work System')
    }
    await next()
  }
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.code, message: err.message }, err.status as ContentfulStatusCode)
    console.error(err)
    return c.json({ error: 'internal', message: 'Máy chủ gặp lỗi, thử lại sau ít phút' }, 500)
  })
  app.notFound((c) => c.json({ error: 'not_found', message: 'Không có đường dẫn này' }, 404))
  // Vercel Cron gửi "Authorization: Bearer <CRON_SECRET>". Không cần phiên đăng nhập.
  app.get('/api/cron/cleanup', async (c) => {
    const secret = deps.config.cronSecret
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'forbidden', message: 'Sai hoặc thiếu CRON_SECRET' }, 403)
    return c.json(await cleanup(deps.db, deps.now()))
  })
  app.route('/', oauthRoutes(deps))
  const mcp = mcpHandler(deps)
  app.all('/mcp', (c) => mcp(c.req.raw))
  app.route('/auth', authRoutes(deps))
  app.route('/api', apiRoutes(deps))
  return app
}
