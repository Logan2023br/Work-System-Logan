import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { createSession } from '../core/sessions.js'
import { commands } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb, type UserRow } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
})

const cookie = async (u: UserRow) => `__Host-ws_session=${(await createSession(db, u.id, now)).token}`
const send = async (u: UserRow, method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { cookie: await cookie(u), origin: 'https://ws.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('điều khiển qua API', () => {
  it('chủ task gửi lệnh, hủy lệnh', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const res = await send(u, 'POST', '/api/tasks/a/commands', { actionId: 'run' })
    expect(res.status).toBe(201)
    const c = await res.json()
    expect((await send(u, 'POST', `/api/commands/${c.id}/cancel`)).status).toBe(200)
  })

  it('đồng nghiệp không gửi lệnh / sửa lịch / tạm dừng được task của người khác', async () => {
    const owner = await makeUser(db)
    const mate = await makeUser(db)
    await makeTask(db, owner.id, { slug: 'a' })
    expect((await send(mate, 'POST', '/api/tasks/a/commands', { actionId: 'run' })).status).toBe(404)
    expect((await send(mate, 'PUT', '/api/tasks/a/schedule', { cron: '0 9 * * *' })).status).toBe(404)
    expect((await send(mate, 'PUT', '/api/tasks/a/pause', { paused: true })).status).toBe(404)
    expect(await db.select().from(commands)).toEqual([])
  })

  it('thân sai → 400 kèm trường; origin lạ → 403', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const bad = await send(u, 'PUT', '/api/tasks/a/pause', { paused: 'có' })
    expect(bad.status).toBe(400)
    expect((await bad.json()).message).toContain('paused')
    const evil = await app.request('/api/tasks/a/commands', { method: 'POST', headers: { cookie: await cookie(u), origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{"actionId":"run"}' })
    expect(evil.status).toBe(403)
  })

  it('lịch, tạm dừng, xem trước, khung giờ', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    expect(await (await send(u, 'PUT', '/api/tasks/a/schedule', { cron: '0 16 * * 5' })).json()).toMatchObject({ cron: '0 16 * * 5', scheduleLabel: '16:00 · T6', nextRun: '2026-10-09T09:00:00.000Z' })
    expect(await (await send(u, 'PUT', '/api/tasks/a/pause', { paused: true })).json()).toEqual({ paused: true, nextRun: null })
    expect(await (await send(u, 'GET', '/api/schedule/preview?cron=0%209%20*%20*%201-5')).json()).toMatchObject({ valid: true, label: '09:00 · T2–T6' })
    expect(await (await send(u, 'PUT', '/api/me/work-hours', { workDays: [1, 2, 3], workStart: '09:00', workEnd: '17:00' })).json()).toMatchObject({ workDays: [1, 2, 3], workStart: '09:00' })
  })
})
