import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import type { Db } from '../db/types.js'
import { createSession } from '../core/sessions.js'
import type { GoogleProfile } from '../core/users.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { createApp, safeNext } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: ['boss@bravebits.vn'],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
let nextProfile: GoogleProfile
const google = {
  authorizeUrl: (state: string) => new URL(`https://accounts.google.test/auth?state=${state}`),
  exchange: async () => nextProfile,
}

let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
  nextProfile = { email: 'an@bravebits.vn', emailVerified: true, hd: 'bravebits.vn', name: 'An', picture: null }
})

const cookieOf = (res: Response, name: string) => {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  return raw?.split(';')[0]
}
async function loggedIn(over = {}) {
  const u = await makeUser(db, over)
  const s = await createSession(db, u.id, now)
  return { user: u, cookie: `__Host-ws_session=${s.token}` }
}

describe('safeNext', () => {
  it.each([
    [undefined, '/'], ['/x?y=1', '/x?y=1'], ['/team#a', '/team#a'], ['//evil.com', '/'], ['/\\evil.com', '/'], ['https://evil.com', '/'], ['x', '/'],
    ['/\t/evil.com', '/'], ['/\n/x', '/'], ['/a\\b', '/'], ['/\u0000', '/'],
  ])('%s → %s', (a, b) =>
    expect(safeNext(a)).toBe(b))
})

describe('/auth/google', () => {
  it('chuyển sang Google và đặt cookie state', async () => {
    const res = await app.request('/auth/google?next=/team')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.test\/auth\?state=/)
    expect(cookieOf(res, 'ws_oauth')).toBeTruthy()
  })

  it('callback thành công → tạo session, về đúng next', async () => {
    const start = await app.request('/auth/google?next=/team')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const res = await app.request(`/auth/google/callback?code=c&state=${state}`, { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/team')
    const sc = res.headers.getSetCookie().find((c) => c.startsWith('__Host-ws_session='))!
    expect(sc).toMatch(/HttpOnly/i)
    expect(sc).toMatch(/Secure/i)
    expect(sc).toMatch(/SameSite=Lax/i)
  })

  it('state sai → /login?error=state', async () => {
    const start = await app.request('/auth/google')
    const res = await app.request('/auth/google/callback?code=c&state=sai', { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.headers.get('location')).toBe('/login?error=state')
  })

  it('email ngoài domain → /login?error=domain', async () => {
    nextProfile = { ...nextProfile, email: 'x@gmail.com', hd: null }
    const start = await app.request('/auth/google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const res = await app.request(`/auth/google/callback?code=c&state=${state}`, { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.headers.get('location')).toBe('/login?error=domain')
  })

  it('chưa cấu hình GOOGLE_CLIENT_ID → về /login?error=setup, không gửi sang Google', async () => {
    const bare = createApp({ db, config: { ...config, googleClientId: '' }, google, now: () => now, fetchClientMetadata: async () => null })
    const res = await bare.request('/auth/google')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login?error=setup')
  })

  it('/auth/dev không tồn tại khi devLogin=false', async () => {
    expect((await app.request('/auth/dev?email=an@bravebits.vn')).status).toBe(404)
  })
})

describe('/api', () => {
  it('chưa đăng nhập → 401 JSON', async () => {
    const res = await app.request('/api/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('/api/me trả MeDTO', async () => {
    const { cookie, user } = await loggedIn({ name: 'An' })
    const res = await app.request('/api/me', { headers: { cookie } })
    expect(await res.json()).toMatchObject({ id: user.id, name: 'An', role: 'member' })
  })

  it('/api/people và /api/workspace/:id cho xem đồng nghiệp', async () => {
    const { cookie } = await loggedIn()
    const an = await makeUser(db, { name: 'An' })
    await makeTask(db, an.id, { slug: 'upsell' })
    const people = await (await app.request('/api/people', { headers: { cookie } })).json()
    expect(people).toHaveLength(2)
    const ws = await (await app.request(`/api/workspace/${an.id}`, { headers: { cookie } })).json()
    expect(ws).toMatchObject({ isMine: false, tasks: [{ id: 'upsell' }] })
    const mine = await (await app.request('/api/workspace/me', { headers: { cookie } })).json()
    expect(mine.isMine).toBe(true)
  })

  it('workspace id rác → 404', async () => {
    const { cookie } = await loggedIn()
    expect((await app.request('/api/workspace/abc', { headers: { cookie } })).status).toBe(404)
  })

  it('người bị vô hiệu hóa còn cookie → 401', async () => {
    const { cookie } = await loggedIn({ active: false })
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401)
  })

  it('POST thiếu/ sai Origin → 403 (chống CSRF)', async () => {
    const { cookie } = await loggedIn({ role: 'admin' })
    const b = await makeUser(db)
    const bad = await app.request(`/api/admin/users/${b.id}/deactivate`, { method: 'POST', headers: { cookie, origin: 'https://evil.test' } })
    expect(bad.status).toBe(403)
    const ok = await app.request(`/api/admin/users/${b.id}/deactivate`, { method: 'POST', headers: { cookie, origin: 'https://ws.test' } })
    expect(ok.status).toBe(200)
  })

  it('logout xóa session', async () => {
    const { cookie } = await loggedIn()
    const res = await app.request('/auth/logout', { method: 'POST', headers: { cookie, origin: 'https://ws.test' } })
    expect(res.status).toBe(200)
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401)
  })
})
