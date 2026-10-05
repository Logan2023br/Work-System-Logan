import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { oauthClients, oauthCodes, oauthTokens, runs, sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { cleanup } from './cleanup.js'

const now = new Date('2026-10-05T03:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('cleanup', () => {
  it('xóa log run cũ hơn 30 ngày nhưng giữ tóm tắt; giữ log mới', async () => {
    const u = await makeUser(db)
    const t = await makeTask(db, u.id)
    await db.insert(runs).values([
      { taskId: t.id, trigger: 'manual', status: 'ok', startedAt: daysAgo(31), finishedAt: daysAgo(31), note: 'cũ', log: ['a'] },
      { taskId: t.id, trigger: 'manual', status: 'ok', startedAt: daysAgo(2), finishedAt: daysAgo(2), note: 'mới', log: ['b'] },
    ])
    const r = await cleanup(db, now)
    expect(r.logsCleared).toBe(1)
    const rows = await db.select().from(runs)
    expect(rows.find((x) => x.note === 'cũ')?.log).toBeNull()
    expect(rows.find((x) => x.note === 'mới')?.log).toEqual(['b'])
  })

  it('xóa session hết hạn, code cũ, token hết hạn hoặc thu hồi lâu, client DCR bỏ hoang', async () => {
    const u = await makeUser(db)
    await db.insert(sessions).values([
      { idHash: 'het', userId: u.id, expiresAt: daysAgo(1) },
      { idHash: 'con', userId: u.id, expiresAt: new Date(now.getTime() + 86_400_000) },
    ])
    await db.insert(oauthCodes).values({ codeHash: 'c', clientId: 'x', userId: u.id, redirectUri: 'r', codeChallenge: 'h', expiresAt: daysAgo(2) })
    const base = { userId: u.id, clientName: 'Claude', resource: 'https://ws.test/mcp', accessExpiresAt: now }
    await db.insert(oauthTokens).values([
      { ...base, clientId: 'dcr_dung', accessHash: 'a1', refreshHash: 'r1', refreshExpiresAt: new Date(now.getTime() + 86_400_000) },
      { ...base, clientId: 'dcr_het', accessHash: 'a2', refreshHash: 'r2', refreshExpiresAt: daysAgo(1) },
      { ...base, clientId: 'dcr_thu', accessHash: 'a3', refreshHash: 'r3', refreshExpiresAt: new Date(now.getTime() + 86_400_000), revokedAt: daysAgo(8) },
    ])
    await db.insert(oauthClients).values([
      { clientId: 'dcr_dung', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: daysAgo(5) },
      { clientId: 'dcr_bo', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: daysAgo(5) },
      { clientId: 'dcr_moi', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: now },
    ])
    expect(await cleanup(db, now)).toEqual({ logsCleared: 0, sessions: 1, codes: 1, tokens: 2, clients: 1 })
    expect((await db.select().from(oauthClients)).map((c) => c.clientId).sort()).toEqual(['dcr_dung', 'dcr_moi'])
  })
})
