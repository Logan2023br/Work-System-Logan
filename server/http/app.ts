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
import type { GoogleAuth } from './google.js'

export interface AppDeps {
  db: Db
  config: Config
  google: GoogleAuth
  now: () => Date
}

export type AppEnv = { Variables: { user: User } }

export const sessionCookieName = (cfg: Config) => (cfg.secureCookies ? '__Host-ws_session' : 'ws_session')

export function safeNext(n: string | undefined): string {
  if (!n || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\')) return '/'
  return n
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
  app.route('/auth', authRoutes(deps))
  app.route('/api', apiRoutes(deps))
  return app
}
