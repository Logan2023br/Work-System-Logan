import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { oauthClients, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import type { ClientInfo } from './oauth-clients.js'
import { createAuthCode, exchangeCode, listConnections, refreshTokens, revokeConnection, s256, verifyAccessToken } from './oauth-tokens.js'

const now = new Date('2026-10-05T03:00:00Z')
const RES = 'https://ws.test/mcp'
const client: ClientInfo = { clientId: 'dcr_1', name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], kind: 'dcr' }
const verifier = 'v'.repeat(50)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

async function issue(userId: string) {
  const code = await createAuthCode(db, { clientId: 'dcr_1', userId, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
  return exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES }, client, now)
}

describe('s256', () => {
  it('khớp ví dụ RFC 7636 phụ lục B', () => {
    expect(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('exchangeCode', () => {
  it('đổi code lấy cặp token Bearer 1 giờ', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'work' })
    expect(await verifyAccessToken(db, t.access_token, RES, now)).toMatchObject({ userId: u.id, clientId: 'dcr_1' })
  })

  it('code chỉ dùng được một lần', async () => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    const p = { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES }
    await exchangeCode(db, p, client, now)
    await expect(exchangeCode(db, p, client, now)).rejects.toMatchObject({ error: 'invalid_grant' })
  })

  it.each([
    ['verifier sai', { codeVerifier: 'x'.repeat(50) }, 'invalid_grant'],
    ['redirect khác', { redirectUri: 'https://claude.ai/khac' }, 'invalid_grant'],
    ['client khác', { clientId: 'dcr_2' }, 'invalid_grant'],
    ['resource khác', { resource: 'https://khac.test/mcp' }, 'invalid_target'],
  ])('%s → %s', async (_n, over, err) => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    await expect(exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES, ...over }, client, now)).rejects.toMatchObject({ error: err })
  })

  it('code hết hạn sau 60 giây', async () => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    await expect(exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier }, client, new Date(now.getTime() + 61_000))).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('verifyAccessToken', () => {
  it('token cho resource khác → null; hết hạn → null; người bị vô hiệu → null', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    expect(await verifyAccessToken(db, t.access_token, 'https://khac.test/mcp', now)).toBeNull()
    expect(await verifyAccessToken(db, t.access_token, RES, new Date(now.getTime() + 3601_000))).toBeNull()
    await db.update(users).set({ active: false }).where(eq(users.id, u.id))
    expect(await verifyAccessToken(db, t.access_token, RES, now)).toBeNull()
  })

  it('ghi lastSeenAt cho người dùng (hiện diện Claude)', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await verifyAccessToken(db, t.access_token, RES, now)
    const [row] = await db.select().from(users).where(eq(users.id, u.id))
    expect(row.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })
})

describe('refreshTokens', () => {
  it('xoay vòng: cặp mới dùng được, refresh cũ và access cũ hết hiệu lực', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    const later = new Date(now.getTime() + 3000_000)
    const t2 = await refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: RES }, later)
    expect(t2.refresh_token).not.toBe(t.refresh_token)
    expect(await verifyAccessToken(db, t2.access_token, RES, later)).not.toBeNull()
    expect(await verifyAccessToken(db, t.access_token, RES, later)).toBeNull()
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1' }, later)).rejects.toMatchObject({ error: 'invalid_grant' })
  })

  it('client khác hoặc người bị vô hiệu → invalid_grant', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_2' }, now)).rejects.toMatchObject({ error: 'invalid_grant' })
    await db.update(users).set({ active: false }).where(eq(users.id, u.id))
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1' }, now)).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('listConnections / revokeConnection', () => {
  it('liệt kê kết nối của mình; ngắt → token chết; không ngắt được của người khác', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    const ta = await issue(a.id)
    await issue(b.id)
    const links = await listConnections(db, a.id, now)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ clientName: 'Claude', lastUsedAt: null })
    await expect(revokeConnection(db, b.id, links[0].id, now)).rejects.toMatchObject({ code: 'not_found' })
    await revokeConnection(db, a.id, links[0].id, now)
    expect(await verifyAccessToken(db, ta.access_token, RES, now)).toBeNull()
    expect(await listConnections(db, a.id, now)).toEqual([])
  })

  it('id không phải UUID → not_found', async () => {
    const a = await makeUser(db)
    await expect(revokeConnection(db, a.id, 'abc', now)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('refresh với resource sai', () => {
  it('báo invalid_target mà không làm mất kết nối', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: 'https://khac.test/mcp' }, now)).rejects.toMatchObject({ error: 'invalid_target' })
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: RES }, now)).resolves.toMatchObject({ token_type: 'Bearer' })
  })
})

describe('đánh dấu client đã dùng', () => {
  it('đổi code lấy token ghi lastUsedAt cho client', async () => {
    const u = await makeUser(db)
    await db.insert(oauthClients).values({ clientId: 'dcr_1', kind: 'dcr', name: 'Claude', redirectUris: client.redirectUris })
    await issue(u.id)
    const [c] = await db.select().from(oauthClients)
    expect(c.lastUsedAt?.toISOString()).toBe(now.toISOString())
  })
})
