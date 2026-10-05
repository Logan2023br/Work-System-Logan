import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import type { Config } from '../config.js'
import { isLoopback, redirectMatches, registerClient, resolveClient, type ClientInfo } from '../core/oauth-clients.js'
import { OAuthError } from '../core/oauth-error.js'
import { SCOPE, createAuthCode, exchangeCode, refreshTokens } from '../core/oauth-tokens.js'
import { userFromSession } from '../core/sessions.js'
import { renderConsent, renderOAuthError } from './consent.js'
import { sameOrigin, sessionCookieName, type AppDeps, type AppEnv } from './app.js'

export const mcpResource = (cfg: Config) => `${cfg.publicUrl}/mcp`
const AUTH_PARAMS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const

type AuthorizeCheck =
  | { kind: 'page'; message: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'ok'; client: ClientInfo; params: Record<string, string> }

export function oauthRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  const pub = deps.config.publicUrl
  const resource = mcpResource(deps.config)

  const metaCors = cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'authorization', 'mcp-protocol-version'] })
  r.use('/.well-known/*', metaCors)
  r.use('/oauth/token', metaCors)
  r.use('/oauth/register', metaCors)

  r.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer: pub,
      authorization_endpoint: `${pub}/oauth/authorize`,
      token_endpoint: `${pub}/oauth/token`,
      registration_endpoint: `${pub}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    }),
  )

  const prm = (c: Context<AppEnv>) =>
    c.json({ resource, authorization_servers: [pub], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'Work System' })
  r.get('/.well-known/oauth-protected-resource', prm)
  r.get('/.well-known/oauth-protected-resource/mcp', prm)

  const oauthJson = (c: Context<AppEnv>, e: unknown) => {
    if (e instanceof OAuthError) return c.json({ error: e.error, error_description: e.message }, e.status)
    throw e
  }

  r.post('/oauth/register', async (c) => {
    try {
      const body = await c.req.json().catch(() => null)
      return c.json(await registerClient(deps.db, body, deps.now()), 201)
    } catch (e) {
      return oauthJson(c, e)
    }
  })

  function errorRedirect(redirectUri: string, error: string, description: string, state: string | undefined): string {
    const u = new URL(redirectUri)
    u.searchParams.set('error', error)
    u.searchParams.set('error_description', description)
    if (state) u.searchParams.set('state', state)
    u.searchParams.set('iss', pub)
    return u.toString()
  }

  async function checkAuthorize(params: Record<string, string>): Promise<AuthorizeCheck> {
    const client = params.client_id ? await resolveClient(deps.db, params.client_id, deps.fetchClientMetadata, deps.now()) : null
    if (!client) return { kind: 'page', message: 'Ứng dụng yêu cầu kết nối không xác định được (client_id không hợp lệ).' }
    if (!params.redirect_uri || !redirectMatches(client.redirectUris, params.redirect_uri)) {
      return { kind: 'page', message: 'Địa chỉ quay về (redirect_uri) không thuộc ứng dụng này.' }
    }
    const back = (error: string, d: string): AuthorizeCheck => ({ kind: 'redirect', url: errorRedirect(params.redirect_uri, error, d, params.state) })
    if (params.response_type !== 'code') return back('unsupported_response_type', 'Chỉ hỗ trợ response_type=code')
    if (!params.code_challenge || params.code_challenge_method !== 'S256') return back('invalid_request', 'Cần PKCE với code_challenge_method=S256')
    if (params.resource && params.resource.replace(/\/+$/, '') !== resource) return back('invalid_target', `resource phải là ${resource}`)
    return { kind: 'ok', client, params }
  }

  const pickParams = (src: Record<string, unknown>) =>
    Object.fromEntries(AUTH_PARAMS.flatMap((k) => (typeof src[k] === 'string' && src[k] !== '' ? [[k, src[k] as string]] : [])))

  const htmlHeaders = { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'cache-control': 'no-store' }

  r.get('/oauth/authorize', async (c) => {
    const params = pickParams(c.req.query())
    const check = await checkAuthorize(params)
    if (check.kind === 'page') return c.html(renderOAuthError(check.message), 400, htmlHeaders)
    if (check.kind === 'redirect') return c.redirect(check.url)

    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) {
      const here = `/oauth/authorize?${new URLSearchParams(params).toString()}`
      return c.redirect(`/auth/google?next=${encodeURIComponent(here)}`)
    }
    const target = new URL(params.redirect_uri)
    return c.html(
      renderConsent({
        userName: user.name, userEmail: user.email, clientName: check.client.name,
        redirectHost: target.host, loopback: isLoopback(target), hidden: params,
      }),
      200,
      htmlHeaders,
    )
  })

  r.post('/oauth/authorize', sameOrigin(deps), async (c) => {
    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) return c.html(renderOAuthError('Phiên đăng nhập đã hết. Quay lại Claude và thử kết nối lại.'), 401, htmlHeaders)

    const form = await c.req.parseBody()
    const params = pickParams(form)
    const check = await checkAuthorize(params)
    if (check.kind === 'page') return c.html(renderOAuthError(check.message), 400, htmlHeaders)
    if (check.kind === 'redirect') return c.redirect(check.url)
    if (form.decision !== 'allow') return c.redirect(errorRedirect(params.redirect_uri, 'access_denied', 'Người dùng đã từ chối', params.state))

    const code = await createAuthCode(
      deps.db,
      { clientId: check.client.clientId, userId: user.id, redirectUri: params.redirect_uri, codeChallenge: params.code_challenge, resource },
      deps.now(),
    )
    const u = new URL(params.redirect_uri)
    u.searchParams.set('code', code)
    if (params.state) u.searchParams.set('state', params.state)
    u.searchParams.set('iss', pub)
    return c.redirect(u.toString())
  })

  r.post('/oauth/token', async (c) => {
    c.header('cache-control', 'no-store')
    try {
      const ct = c.req.header('content-type') ?? ''
      const raw = ct.includes('application/json') ? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>) : await c.req.parseBody()
      const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : undefined)
      const need = (k: string) => {
        const v = s(k)
        if (!v) throw new OAuthError('invalid_request', `Thiếu tham số ${k}`)
        return v
      }

      if (s('grant_type') === 'authorization_code') {
        const clientId = need('client_id')
        const client = await resolveClient(deps.db, clientId, deps.fetchClientMetadata, deps.now())
        if (!client) throw new OAuthError('invalid_client', 'client_id không xác định', 401)
        const pair = await exchangeCode(
          deps.db,
          { code: need('code'), clientId, redirectUri: need('redirect_uri'), codeVerifier: need('code_verifier'), resource: s('resource') },
          client,
          deps.now(),
        )
        return c.json(pair)
      }
      if (s('grant_type') === 'refresh_token') {
        return c.json(await refreshTokens(deps.db, { refreshToken: need('refresh_token'), clientId: need('client_id'), resource: s('resource') }, deps.now()))
      }
      throw new OAuthError('unsupported_grant_type', 'Chỉ hỗ trợ authorization_code và refresh_token')
    } catch (e) {
      return oauthJson(c, e)
    }
  })

  return r
}
