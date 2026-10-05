import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { s256 } from '../core/oauth-tokens.js'
import { createSession } from '../core/sessions.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://accounts.google.test/auth'), exchange: async () => { throw new Error('không dùng') } }
const CB = 'https://claude.ai/api/mcp/auth_callback'
const verifier = 'v'.repeat(60)

let db: Db
let app: ReturnType<typeof createApp>
let cimdDoc: unknown
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  cimdDoc = null
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => cimdDoc })
})

async function login() {
  const u = await makeUser(db, { name: 'Logan' })
  const s = await createSession(db, u.id, now)
  return { user: u, cookie: `__Host-ws_session=${s.token}` }
}

async function register() {
  const res = await app.request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CB] }) })
  expect(res.status).toBe(201)
  return (await res.json()).client_id as string
}

function authorizeQuery(clientId: string, over: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: CB, code_challenge: s256(verifier), code_challenge_method: 'S256',
    state: 'st-1', scope: 'work', resource: 'https://ws.test/mcp', ...over,
  })
}

async function approve(cookie: string, q: URLSearchParams) {
  const form = new URLSearchParams(q)
  form.set('decision', 'allow')
  return app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://ws.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
}

async function token(body: Record<string, string>) {
  return app.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
}

describe('metadata', () => {
  it('authorization server metadata đủ điều kiện để Claude dùng CIMD', async () => {
    const m = await (await app.request('/.well-known/oauth-authorization-server')).json()
    expect(m).toMatchObject({
      issuer: 'https://ws.test',
      authorization_endpoint: 'https://ws.test/oauth/authorize',
      token_endpoint: 'https://ws.test/oauth/token',
      registration_endpoint: 'https://ws.test/oauth/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    })
  })

  it('protected resource metadata ở cả hai đường dẫn', async () => {
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      expect(await (await app.request(p)).json()).toMatchObject({ resource: 'https://ws.test/mcp', authorization_servers: ['https://ws.test'] })
    }
  })
})

describe('authorize', () => {
  it('chưa đăng nhập → chuyển sang Google kèm next quay lại đúng yêu cầu', async () => {
    const id = await register()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id)}`)
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!, 'https://ws.test')
    expect(loc.pathname).toBe('/auth/google')
    expect(loc.searchParams.get('next')).toMatch(/^\/oauth\/authorize\?/)
  })

  it('đã đăng nhập → màn hình chấp thuận có tên client, host redirect, chống nhúng iframe', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id)}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Claude')
    expect(html).toContain('claude.ai')
    expect(html).toContain('name="decision"')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('redirect_uri không thuộc client → trang lỗi 400, không redirect', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id, { redirect_uri: 'https://evil.com/cb' })}`, { headers: { cookie } })
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('client lạ → trang lỗi 400', async () => {
    const res = await app.request(`/oauth/authorize?${authorizeQuery('dcr_khong_co')}`)
    expect(res.status).toBe(400)
  })

  it('thiếu PKCE → redirect lỗi invalid_request kèm state và iss', async () => {
    const id = await register()
    const { cookie } = await login()
    const q = authorizeQuery(id)
    q.delete('code_challenge')
    const res = await app.request(`/oauth/authorize?${q}`, { headers: { cookie } })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(CB)
    expect(loc.searchParams.get('error')).toBe('invalid_request')
    expect(loc.searchParams.get('state')).toBe('st-1')
    expect(loc.searchParams.get('iss')).toBe('https://ws.test')
  })

  it('resource lạ → redirect lỗi invalid_target', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id, { resource: 'https://khac.test/mcp' })}`, { headers: { cookie } })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invalid_target')
  })

  it('từ chối → access_denied', async () => {
    const id = await register()
    const { cookie } = await login()
    const form = authorizeQuery(id)
    form.set('decision', 'deny')
    const res = await app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://ws.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('access_denied')
  })

  it('POST chấp thuận từ origin lạ → 403', async () => {
    const id = await register()
    const { cookie } = await login()
    const form = authorizeQuery(id)
    form.set('decision', 'allow')
    const res = await app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
    expect(res.status).toBe(403)
  })
})

describe('luồng đầy đủ', () => {
  it('DCR → chấp thuận → đổi code → refresh xoay vòng', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await approve(cookie, authorizeQuery(id))
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.searchParams.get('state')).toBe('st-1')
    expect(loc.searchParams.get('iss')).toBe('https://ws.test')
    const code = loc.searchParams.get('code')!

    const t1 = await token({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: id, code_verifier: verifier, resource: 'https://ws.test/mcp' })
    expect(t1.status).toBe(200)
    expect(t1.headers.get('cache-control')).toBe('no-store')
    const b1 = await t1.json()
    expect(b1).toMatchObject({ token_type: 'Bearer', expires_in: 3600 })

    const again = await token({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: id, code_verifier: verifier })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ error: 'invalid_grant' })

    const t2 = await token({ grant_type: 'refresh_token', refresh_token: b1.refresh_token, client_id: id })
    expect(t2.status).toBe(200)
    const old = await token({ grant_type: 'refresh_token', refresh_token: b1.refresh_token, client_id: id })
    expect(await old.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('CIMD: client_id là URL, Claude Code redirect loopback cổng bất kỳ', async () => {
    const url = 'https://claude.ai/oauth/claude-code-client-metadata'
    cimdDoc = { client_id: url, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'] }
    const { cookie } = await login()
    const q = authorizeQuery(url, { redirect_uri: 'http://localhost:51234/callback' })
    const page = await app.request(`/oauth/authorize?${q}`, { headers: { cookie } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('máy của bạn')
    const res = await approve(cookie, q)
    const code = new URL(res.headers.get('location')!).searchParams.get('code')!
    const t = await token({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:51234/callback', client_id: url, code_verifier: verifier })
    expect(t.status).toBe(200)
  })

  it('grant_type lạ → unsupported_grant_type; thiếu tham số → invalid_request', async () => {
    expect(await (await token({ grant_type: 'password' })).json()).toMatchObject({ error: 'unsupported_grant_type' })
    expect(await (await token({ grant_type: 'authorization_code' })).json()).toMatchObject({ error: 'invalid_request' })
  })
})
