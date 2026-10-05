import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { activity, commands, runs, weeklyReports } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { formatDuration, primaryAction } from './dto.js'
import { getWorkspace, listPeople, presenceOf } from './workspace.js'

const now = new Date('2026-10-05T03:00:00Z')
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('presenceOf', () => {
  it('online trong 30 phút, offline sau đó, never khi chưa nối', () => {
    expect(presenceOf(new Date(now.getTime() - 29 * 60_000), now)).toBe('online')
    expect(presenceOf(new Date(now.getTime() - 31 * 60_000), now)).toBe('offline')
    expect(presenceOf(null, now)).toBe('never')
  })
})

describe('formatDuration', () => {
  it.each([[null, '—'], [38_000, '38s'], [278_000, '4p 38s'], [3_720_000, '62p 0s']])('%s → %s', (ms, s) =>
    expect(formatDuration(ms)).toBe(s))
})

describe('primaryAction', () => {
  const fix = { id: 'xem-loi', label: 'Xem lỗi', kind: 'fix' as const, instructions: 'x' }
  const review = { id: 'duyet', label: 'Duyệt', kind: 'review' as const, instructions: 'x' }
  it('blocked + có nút fix → nút fix', () => {
    expect(primaryAction({ state: 'blocked', actions: [review, fix] })).toEqual({ label: 'Xem lỗi', kind: 'fix', actionId: 'xem-loi' })
  })
  it('needs-you + có nút review → nút review', () => {
    expect(primaryAction({ state: 'needs-you', actions: [fix, review] })).toEqual({ label: 'Duyệt', kind: 'review', actionId: 'duyet' })
  })
  it('còn lại → Chạy ngay', () => {
    expect(primaryAction({ state: 'blocked', actions: [] })).toEqual({ label: 'Chạy ngay', kind: 'run', actionId: 'run' })
  })
})

describe('listPeople', () => {
  it('đếm task theo trạng thái, chọn việc cần chú ý nhất, sắp người đang hoạt động trước', async () => {
    const an = await makeUser(db, { name: 'An', lastSeenAt: now })
    const binh = await makeUser(db, { name: 'Bình', active: false })
    await makeTask(db, an.id, { state: 'healthy', health: 0.9, position: 0 })
    await makeTask(db, an.id, { state: 'needs-you', health: 0.5, position: 1, name: 'Duyệt template' })
    await makeTask(db, an.id, { state: 'blocked', health: 0.2, position: 2, name: 'Upsell', stateLabel: 'Có lỗi' })
    const people = await listPeople(db, now)
    expect(people.map((p) => p.name)).toEqual(['An', 'Bình'])
    const p = people[0]
    expect(p.presence).toBe('online')
    expect(p.taskCount).toBe(3)
    expect(p.counts).toEqual({ running: 0, healthy: 1, 'needs-you': 1, blocked: 1, idle: 0 })
    expect(p.health).toBeCloseTo((0.9 + 0.5 + 0.2) / 3)
    expect(p.attention).toMatchObject({ taskName: 'Upsell', state: 'blocked', stateLabel: 'Có lỗi' })
    expect(people[1]).toMatchObject({ active: false, health: null, attention: null, presence: 'never' })
    expect(binh.id).toBe(people[1].id)
  })
})

describe('getWorkspace', () => {
  it('trả không gian đầy đủ của đồng nghiệp với isMine=false', async () => {
    const me = await makeUser(db)
    const an = await makeUser(db, { name: 'An' })
    const t = await makeTask(db, an.id, {
      slug: 'upsell', name: 'Upsell', lastRunAt: new Date('2026-10-05T02:30:00Z'), nextRunAt: new Date('2026-10-05T08:30:00Z'),
      sources: [
        { name: 'Sheet A', kind: 'sheet', location: 'x', status: 'ok', syncedAt: now.toISOString() },
        { name: 'Sheet B', kind: 'sheet', location: 'y', status: 'error', syncedAt: now.toISOString() },
      ],
    })
    await db.insert(runs).values({ taskId: t.id, trigger: 'schedule', status: 'ok', startedAt: now, finishedAt: now, durationMs: 4000, note: 'Xong', log: ['a'] })
    await db.insert(commands).values({ taskId: t.id, ownerId: an.id, actionId: 'run', label: 'Chạy ngay', instructions: 'x' })
    await db.insert(activity).values({ ownerId: an.id, taskId: t.id, at: now, level: 'ok', text: 'Gửi 6 tin' })
    await db.insert(weeklyReports).values({ ownerId: an.id, week: '2026-W40', summary: 'Tuần ổn' })

    const ws = await getWorkspace(db, me, an.id, now)
    expect(ws.isMine).toBe(false)
    expect(ws.owner.name).toBe('An')
    expect(ws.week.key).toBe('2026-W41')
    expect(ws.tasks).toHaveLength(1)
    const dto = ws.tasks[0]
    expect(dto).toMatchObject({ id: 'upsell', index: '01', lastRun: '2026-10-05T02:30:00.000Z', nextRun: '2026-10-05T08:30:00.000Z' })
    expect(dto.runs[0]).toMatchObject({ status: 'ok', duration: '4s', note: 'Xong', log: ['a'], trigger: 'schedule' })
    expect(dto.commands[0]).toMatchObject({ actionId: 'run', status: 'pending' })
    expect(ws.activity[0]).toMatchObject({ task: 'upsell', text: 'Gửi 6 tin', level: 'ok' })
    expect(ws.connections).toEqual([
      { id: 'sheet', name: 'Google Sheets', kind: 'sheet', status: 'error', detail: '2 nguồn · 1 task', usedBy: ['upsell'] },
    ])
    expect(ws.reflect).toMatchObject({ weekKey: '2026-W40', week: 40, summary: 'Tuần ổn', range: '28/9 – 4/10, 2026' })
  })

  it('task chưa chạy lần nào trả mặc định an toàn', async () => {
    const me = await makeUser(db)
    await makeTask(db, me.id)
    const ws = await getWorkspace(db, me, me.id, now)
    expect(ws.isMine).toBe(true)
    const t = ws.tasks[0]
    expect(t.lastRun).toBeNull()
    expect(t.nextRun).toBeNull()
    expect(t.report).toEqual({ headline: '', body: [], blockers: [], next: [] })
    expect(t.runs).toEqual([])
    expect(ws.reflect).toBeNull()
  })

  it('id lạ hoặc không phải UUID → not_found', async () => {
    const me = await makeUser(db)
    await expect(getWorkspace(db, me, crypto.randomUUID(), now)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getWorkspace(db, me, '../etc', now)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('log của run đã bị dọn (null) trả mảng rỗng', async () => {
    const me = await makeUser(db)
    const t = await makeTask(db, me.id)
    await db.insert(runs).values({ taskId: t.id, trigger: 'manual', status: 'failed', startedAt: now, finishedAt: now, log: null })
    const ws = await getWorkspace(db, me, me.id, now)
    expect(ws.tasks[0].runs[0].log).toEqual([])
  })
})
