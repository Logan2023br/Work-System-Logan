import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createSession, deleteSession, SESSION_DAYS } from '../core/sessions.js'
import { newToken } from '../core/tokens.js'
import { signInWithGoogle, type GoogleProfile } from '../core/users.js'
import { safeNext, sameOrigin, sessionCookieName, type AppDeps, type AppEnv } from './app.js'

const FLOW_COOKIE = 'ws_oauth'

export function authRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  const { config } = deps
  const flowOpts = { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax' as const, path: '/auth', maxAge: 600 }

  async function finish(c: Context<AppEnv>, profile: GoogleProfile, next: string) {
    const res = await signInWithGoogle(deps.db, profile, config)
    if (!res.ok) return c.redirect(`/login?error=${res.reason}`)
    const s = await createSession(deps.db, res.user.id, deps.now())
    setCookie(c, sessionCookieName(config), s.token, {
      httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86_400,
    })
    return c.redirect(next)
  }

  r.get('/google', (c) => {
    const state = newToken()
    const verifier = newToken()
    setCookie(c, FLOW_COOKIE, JSON.stringify({ state, verifier, next: safeNext(c.req.query('next')) }), flowOpts)
    return c.redirect(deps.google.authorizeUrl(state, verifier).toString())
  })

  r.get('/google/callback', async (c) => {
    const raw = getCookie(c, FLOW_COOKIE)
    deleteCookie(c, FLOW_COOKIE, { path: '/auth', secure: config.secureCookies })
    let flow: { state: string; verifier: string; next: string } | null = null
    try {
      flow = raw ? JSON.parse(raw) : null
    } catch {
      flow = null
    }
    if (!flow || flow.state !== c.req.query('state')) return c.redirect('/login?error=state')
    const code = c.req.query('code')
    if (!code) return c.redirect('/login?error=cancelled')
    let profile: GoogleProfile
    try {
      profile = await deps.google.exchange(code, flow.verifier)
    } catch (e) {
      console.error('Google exchange lỗi', e)
      return c.redirect('/login?error=google')
    }
    return finish(c, profile, safeNext(flow.next))
  })

  if (config.devLogin) {
    r.get('/dev', (c) =>
      finish(c, { email: c.req.query('email') ?? '', emailVerified: true, hd: config.allowedDomain, name: c.req.query('name') ?? '', picture: null }, safeNext(c.req.query('next'))),
    )
  }

  r.post('/logout', sameOrigin(deps), async (c) => {
    const name = sessionCookieName(config)
    const token = getCookie(c, name)
    if (token) await deleteSession(deps.db, token)
    deleteCookie(c, name, { path: '/', secure: config.secureCookies })
    return c.json({ ok: true })
  })

  return r
}
