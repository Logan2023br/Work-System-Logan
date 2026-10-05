import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { createAuthCode, exchangeCode, s256 } from '../core/oauth-tokens.js'
import { createSession } from '../core/sessions.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb, type UserRow } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
const client = { clientId: 'dcr_1', name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], kind: 'dcr' as const }

let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
})

async function link(u: UserRow) {
  const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256('v'.repeat(50)), resource: 'https://ws.test/mcp' }, now)
  return exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: 'v'.repeat(50) }, client, now)
}
async function cookieFor(u: UserRow) {
  return `__Host-ws_session=${(await createSession(db, u.id, now)).token}`
}

describe('/api/connections', () => {
  it('trả URL connector và kết nối của chính mình', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await link(a)
    await link(b)
    const body = await (await app.request('/api/connections', { headers: { cookie: await cookieFor(a) } })).json()
    expect(body.connectorUrl).toBe('https://ws.test/mcp')
    expect(body.links).toHaveLength(1)
    expect(body.links[0].clientName).toBe('Claude')
  })

  it('ngắt kết nối của mình được; của người khác → 404; sai origin → 403', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await link(a)
    const ca = await cookieFor(a)
    const id = (await (await app.request('/api/connections', { headers: { cookie: ca } })).json()).links[0].id
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: ca, origin: 'https://evil.test' } })).status).toBe(403)
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: await cookieFor(b), origin: 'https://ws.test' } })).status).toBe(404)
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: ca, origin: 'https://ws.test' } })).status).toBe(200)
    expect((await (await app.request('/api/connections', { headers: { cookie: ca } })).json()).links).toEqual([])
  })
})
