import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { taskDefinitionSchema } from '../../shared/schema.js'
import { activity, runs, tasks, weeklyReports } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createTask, getMyTask, listMyTasks, reportRun, submitWeeklyReport, updateTask } from './tasks.js'

const now = new Date('2026-10-05T03:00:00Z') // T2 10:00 giờ VN
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

const def = (over: Record<string, unknown> = {}) =>
  taskDefinitionSchema.parse({ slug: 'upsell', name: 'Upsell', cron: '30 9,15 * * *', instructions: 'Gửi tin.', metrics: [{ label: 'Tin', value: '6' }], ...over })

describe('createTask', () => {
  it('tạo task, tính lần chạy kế tiếp theo giờ VN, xếp cuối danh sách, ghi hoạt động', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def({ slug: 'a' }), now)
    const t = await createTask(db, u, def(), now)
    expect(t.position).toBe(1)
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-05T08:30:00.000Z')
    expect(t.stateLabel).toBe('Nằm chờ')
    const ev = await db.select().from(activity).where(eq(activity.taskId, t.id))
    expect(ev[0].text).toContain('Upsell')
  })

  it('slug trùng của chính mình → conflict; người khác dùng cùng slug được', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    await expect(createTask(db, u, def(), now)).rejects.toMatchObject({ code: 'conflict' })
    await expect(createTask(db, await makeUser(db), def(), now)).resolves.toBeTruthy()
  })

  it('cron sai → invalid với thông điệp có ví dụ', async () => {
    const u = await makeUser(db)
    await expect(createTask(db, u, def({ cron: '0 25 * * *' }), now)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('0 9 * * 1-5') })
  })
})

describe('updateTask', () => {
  it('chỉ đổi trường được gửi, giữ nguyên phần còn lại', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    const t = await updateTask(db, u, 'upsell', { summary: 'Mới' }, now)
    expect(t.summary).toBe('Mới')
    expect(t.metrics).toEqual([{ label: 'Tin', value: '6', note: '' }])
    expect(t.instructions).toBe('Gửi tin.')
  })

  it('đổi cron → tính lại lần chạy kế tiếp; cron sai → invalid', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    const t = await updateTask(db, u, 'upsell', { cron: '0 16 * * 5' }, now)
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-09T09:00:00.000Z')
    await expect(updateTask(db, u, 'upsell', { cron: 'x' }, now)).rejects.toMatchObject({ code: 'invalid' })
  })

  it('đổi state mà không gửi stateLabel → nhãn mặc định theo state', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    expect((await updateTask(db, u, 'upsell', { state: 'blocked' }, now)).stateLabel).toBe('Có lỗi')
  })

  it('không sửa được task của người khác', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await createTask(db, a, def(), now)
    await expect(updateTask(db, b, 'upsell', { name: 'x' }, now)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('reportRun', () => {
  it('ghi run thủ công, cập nhật trạng thái mặc định theo status, nối xu hướng giữ 30 điểm', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def({ trend: Array.from({ length: 30 }, (_, i) => i) }), now)
    const { task } = await reportRun(db, u, { slug: 'upsell', status: 'failed', note: 'Crisp lỗi 500', log: ['b1', 'b2'], durationMs: 4000, trendThem: [99] }, now)
    expect(task.state).toBe('blocked')
    expect(task.stateLabel).toBe('Có lỗi')
    expect(task.trend).toHaveLength(30)
    expect(task.trend.at(-1)).toBe(99)
    expect(task.trend[0]).toBe(1)
    expect(task.lastRunAt?.toISOString()).toBe(now.toISOString())
    expect(task.nextRunAt?.toISOString()).toBe('2026-10-05T08:30:00.000Z')
    const [r] = await db.select().from(runs).where(eq(runs.taskId, task.id))
    expect(r).toMatchObject({ trigger: 'manual', status: 'failed', durationMs: 4000, note: 'Crisp lỗi 500', log: ['b1', 'b2'] })
    expect(r.startedAt.toISOString()).toBe('2026-10-05T02:59:56.000Z')
    const ev = await db.select().from(activity).where(eq(activity.level, 'error'))
    expect(ev[0].text).toBe('Crisp lỗi 500')
  })

  it('state do Claude chỉ định thắng mặc định; metrics/report được cập nhật', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    const { task } = await reportRun(db, u, {
      slug: 'upsell', status: 'ok', note: '', log: [], state: 'needs-you', stateLabel: 'Chờ duyệt 3 mẫu',
      metrics: [{ label: 'Tin', value: '12', note: '' }], report: { headline: 'Ổn', body: [], blockers: [], next: [] },
    }, now)
    expect(task).toMatchObject({ state: 'needs-you', stateLabel: 'Chờ duyệt 3 mẫu', metrics: [{ label: 'Tin', value: '12', note: '' }], report: { headline: 'Ổn' } })
  })

  it('task tạm dừng: không đổi lịch kế tiếp', async () => {
    const u = await makeUser(db)
    const t0 = await createTask(db, u, def(), now)
    await db.update(tasks).set({ paused: true, nextRunAt: null }).where(eq(tasks.id, t0.id))
    const { task } = await reportRun(db, u, { slug: 'upsell', status: 'ok', note: '', log: [] }, now)
    expect(task.nextRunAt).toBeNull()
  })

  it('slug của người khác → not_found', async () => {
    const a = await makeUser(db)
    await createTask(db, a, def(), now)
    await expect(reportRun(db, await makeUser(db), { slug: 'upsell', status: 'ok', note: '', log: [] }, now)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('listMyTasks / getMyTask', () => {
  it('chỉ trả task của chính mình', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await createTask(db, a, def(), now)
    await createTask(db, b, def({ slug: 'khac' }), now)
    expect((await listMyTasks(db, a)).map((t) => t.slug)).toEqual(['upsell'])
    expect((await getMyTask(db, a, 'upsell')).id).toBe('upsell')
    await expect(getMyTask(db, a, 'khac')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('submitWeeklyReport', () => {
  it('mặc định tuần hiện tại theo giờ VN; nộp lại thì ghi đè', async () => {
    const u = await makeUser(db)
    expect(await submitWeeklyReport(db, u, { summary: 'v1', good: [], bad: [], next: [], pattern: '' }, now)).toEqual({ week: '2026-W41' })
    await submitWeeklyReport(db, u, { summary: 'v2', good: [], bad: [], next: [], pattern: '' }, now)
    const rows = await db.select().from(weeklyReports)
    expect(rows).toHaveLength(1)
    expect(rows[0].summary).toBe('v2')
  })
})
