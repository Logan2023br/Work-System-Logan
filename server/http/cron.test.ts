import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const base: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('/api/cron/cleanup', () => {
  it('thiếu hoặc sai bí mật → 403, không xóa gì', async () => {
    const u = await makeUser(db)
    await db.insert(sessions).values({ idHash: 'het', userId: u.id, expiresAt: new Date(now.getTime() - 1000) })
    const app = createApp({ db, config: { ...base, cronSecret: 'dung' }, google, now: () => now, fetchClientMetadata: async () => null })
    expect((await app.request('/api/cron/cleanup')).status).toBe(403)
    expect((await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer sai' } })).status).toBe(403)
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('chưa cấu hình CRON_SECRET → 403 kể cả khi gửi Bearer rỗng', async () => {
    const app = createApp({ db, config: base, google, now: () => now, fetchClientMetadata: async () => null })
    expect((await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer ' } })).status).toBe(403)
  })

  it('đúng bí mật → chạy dọn dẹp, không cần đăng nhập', async () => {
    const app = createApp({ db, config: { ...base, cronSecret: 'dung' }, google, now: () => now, fetchClientMetadata: async () => null })
    const res = await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer dung' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sessions: 0 })
  })
})
