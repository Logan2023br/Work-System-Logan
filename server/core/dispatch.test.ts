import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb, type TaskRow, type UserRow } from '../test/db.js'
import { dispatch, LEASE_MS } from './dispatch.js'

const now = new Date('2026-10-05T03:00:00Z')
const past = new Date(now.getTime() - 60_000)
const later = new Date(now.getTime() + 60_000)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

async function cmd(t: TaskRow, actionId = 'run', createdAt = now) {
  const [c] = await db.insert(commands).values({ taskId: t.id, ownerId: t.ownerId, actionId, label: actionId === 'run' ? 'Chạy ngay' : 'Duyệt', instructions: 'Làm theo nút', createdAt }).returning()
  return c
}
const lookup = async (id: string) => (await db.select().from(commands).where(eq(commands.id, id)))[0]

describe('dispatch', () => {
  let u: UserRow
  beforeEach(async () => { u = await makeUser(db) })

  it('không có gì → rỗng nhưng vẫn ghi heartbeat', async () => {
    expect(await dispatch(db, u, now)).toEqual([])
    const [me] = await db.select().from(users).where(eq(users.id, u.id))
    expect(me.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })

  it('giao task đến hạn kèm lease 60 phút; task chưa đến hạn hoặc tạm dừng thì không', async () => {
    const due = await makeTask(db, u.id, { slug: 'den-han', nextRunAt: past, instructions: 'Gửi tin' })
    await makeTask(db, u.id, { slug: 'chua', nextRunAt: later })
    await makeTask(db, u.id, { slug: 'dung', nextRunAt: past, paused: true })
    const items = await dispatch(db, u, now)
    expect(items).toEqual([{ leaseId: expect.any(String), loai: 'lich', task: { slug: 'den-han', name: due.name, instructions: 'Gửi tin', skill: null } }])
    const [row] = await db.select().from(tasks).where(eq(tasks.id, due.id))
    expect(row.leaseId).toBe(items[0].leaseId)
    expect(row.leaseUntil?.getTime()).toBe(now.getTime() + LEASE_MS)
  })

  it('gọi liền lần hai → không giao lại việc đã giao', async () => {
    await makeTask(db, u.id, { nextRunAt: past })
    const t = await makeTask(db, u.id, { nextRunAt: new Date(now.getTime() + 86_400_000) })
    await cmd(t, 'duyet')
    expect(await dispatch(db, u, now)).toHaveLength(2)
    expect(await dispatch(db, u, new Date(now.getTime() + 15 * 60_000))).toEqual([])
  })

  it('lease hết hạn → task được giao lại', async () => {
    await makeTask(db, u.id, { nextRunAt: past })
    await dispatch(db, u, now)
    expect(await dispatch(db, u, new Date(now.getTime() + LEASE_MS + 1000))).toHaveLength(1)
  })

  it('lệnh trước lịch, theo thứ tự tạo; lệnh mang chỉ thị chụp lúc bấm', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: past, slug: 'a' })
    const t2 = await makeTask(db, u.id, { nextRunAt: later, slug: 'b' })
    const c1 = await cmd(t2, 'duyet', new Date(now.getTime() - 5000))
    const items = await dispatch(db, u, now)
    expect(items.map((i) => i.loai)).toEqual(['lenh', 'lich'])
    expect(items[0].lenh).toEqual({ id: c1.id, actionId: 'duyet', label: 'Duyệt', instructions: 'Làm theo nút', note: null })
    expect(items[1].task.slug).toBe(t.slug)
    expect((await lookup(c1.id)).status).toBe('claimed')
  })

  it('"Chạy ngay" trùng lúc task đến hạn → chỉ một việc', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: past })
    await cmd(t, 'run')
    const items = await dispatch(db, u, now)
    expect(items).toHaveLength(1)
    expect(items[0].loai).toBe('lenh')
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(row.leaseId).toBe(items[0].leaseId)
  })

  it('hai lệnh "Chạy ngay" cùng task → giao một, lệnh kia đóng là gộp', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: later })
    const a = await cmd(t, 'run', new Date(now.getTime() - 2000))
    const b = await cmd(t, 'run', new Date(now.getTime() - 1000))
    const items = await dispatch(db, u, now)
    expect(items).toHaveLength(1)
    expect(items[0].lenh?.id).toBe(a.id)
    expect(await lookup(b.id)).toMatchObject({ status: 'done', result: expect.stringContaining('Gộp') })
  })

  it('lệnh nhận quá 60 phút chưa báo → expired', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: later })
    const c = await cmd(t, 'duyet')
    await dispatch(db, u, now)
    await dispatch(db, u, new Date(now.getTime() + LEASE_MS + 1000))
    expect((await lookup(c.id)).status).toBe('expired')
  })

  it('chỉ giao việc của chính chủ token', async () => {
    const other = await makeUser(db)
    await makeTask(db, other.id, { nextRunAt: past })
    const t = await makeTask(db, other.id, { nextRunAt: later })
    await cmd(t)
    expect(await dispatch(db, u, now)).toEqual([])
  })
})
