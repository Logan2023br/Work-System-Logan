import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { activity, commands, tasks } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { cancelCommand, createCommand, previewSchedule, setPaused, setSchedule, setWorkHours } from './control.js'

const now = new Date('2026-10-05T03:00:00Z')
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

const action = { id: 'duyet', label: 'Duyệt mẫu', kind: 'review' as const, instructions: 'Duyệt 3 mẫu chờ' }

describe('createCommand', () => {
  it('"Chạy ngay" chụp chỉ thị của task; ghi hoạt động chờ', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', instructions: 'Gửi tin' })
    const c = await createCommand(db, u, 'a', { actionId: 'run', note: 'Ưu tiên store lớn' }, now)
    expect(c).toMatchObject({ actionId: 'run', label: 'Chạy ngay', status: 'pending', note: 'Ưu tiên store lớn' })
    const [row] = await db.select().from(commands).where(eq(commands.id, c.id))
    expect(row.instructions).toBe('Gửi tin')
    const [ev] = await db.select().from(activity)
    expect(ev.level).toBe('wait')
  })

  it('nút khai báo trong task dùng nhãn và chỉ thị của nút', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', actions: [action] })
    const c = await createCommand(db, u, 'a', { actionId: 'duyet' }, now)
    expect(c.label).toBe('Duyệt mẫu')
    expect((await db.select().from(commands))[0].instructions).toBe('Duyệt 3 mẫu chờ')
  })

  it('nút không tồn tại → invalid; task của người khác → not_found', async () => {
    const u = await makeUser(db)
    const other = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    await expect(createCommand(db, u, 'a', { actionId: 'khong-co' }, now)).rejects.toMatchObject({ code: 'invalid' })
    await expect(createCommand(db, other, 'a', { actionId: 'run' }, now)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('tối đa 5 lệnh chờ mỗi task', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    for (let i = 0; i < 5; i += 1) await createCommand(db, u, 'a', { actionId: 'run' }, now)
    await expect(createCommand(db, u, 'a', { actionId: 'run' }, now)).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('cancelCommand', () => {
  it('chỉ hủy được lệnh đang chờ của mình', async () => {
    const u = await makeUser(db)
    const other = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const c = await createCommand(db, u, 'a', { actionId: 'run' }, now)
    await expect(cancelCommand(db, other, c.id, now)).rejects.toMatchObject({ code: 'not_found' })
    await cancelCommand(db, u, c.id, now)
    expect((await db.select().from(commands))[0].status).toBe('cancelled')
    await expect(cancelCommand(db, u, c.id, now)).rejects.toMatchObject({ code: 'conflict' })
    await expect(cancelCommand(db, u, 'abc', now)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('setSchedule / setPaused', () => {
  it('đổi cron → nhãn mặc định tiếng Việt, tính lại lần kế tiếp', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const t = await setSchedule(db, u, 'a', { cron: '0 16 * * 5' }, now)
    expect(t).toMatchObject({ cron: '0 16 * * 5', scheduleLabel: '16:00 · T6' })
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-09T09:00:00.000Z')
    await expect(setSchedule(db, u, 'a', { cron: '0 25 * * *' }, now)).rejects.toMatchObject({ code: 'invalid' })
  })

  it('tạm dừng xóa lần kế tiếp; bỏ tạm dừng tính từ now (không chạy bù)', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', cron: '0 9 * * *', nextRunAt: new Date('2026-10-01T02:00:00Z') })
    expect((await setPaused(db, u, 'a', true, now)).nextRunAt).toBeNull()
    const t = await setPaused(db, u, 'a', false, now)
    expect(t.paused).toBe(false)
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-06T02:00:00.000Z')
    const [row] = await db.select().from(tasks)
    expect(row.paused).toBe(false)
  })

  it('đổi cron khi đang tạm dừng → vẫn không có lần kế tiếp', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    await setPaused(db, u, 'a', true, now)
    expect((await setSchedule(db, u, 'a', { cron: '0 8 * * *' }, now)).nextRunAt).toBeNull()
  })
})

describe('setWorkHours / previewSchedule', () => {
  it('lưu khung giờ', async () => {
    const u = await makeUser(db)
    const r = await setWorkHours(db, u, { workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:00' })
    expect(r).toMatchObject({ workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:00' })
  })

  it('xem trước cron', () => {
    expect(previewSchedule('30 9,15 * * *', now)).toEqual({
      valid: true,
      label: '09:30 và 15:30 · mỗi ngày',
      next: ['2026-10-05T08:30:00.000Z', '2026-10-06T02:30:00.000Z', '2026-10-06T08:30:00.000Z'],
    })
    expect(previewSchedule('x', now)).toEqual({ valid: false, label: null, next: [] })
  })
})

describe('setPaused không đổi trạng thái', () => {
  it('bỏ tạm dừng một task vốn đang chạy → giữ nguyên lần chạy (không mất lần chạy bù)', async () => {
    const u = await makeUser(db)
    const overdue = new Date('2026-10-05T02:00:00Z')
    await makeTask(db, u.id, { slug: 'a', nextRunAt: overdue })
    const t = await setPaused(db, u, 'a', false, now)
    expect(t.nextRunAt?.toISOString()).toBe(overdue.toISOString())
    expect(await db.select().from(activity)).toEqual([])
  })
})
