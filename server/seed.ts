import { readFile } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import { taskDefinitionSchema, weeklyReportSchema } from '../shared/schema.js'
import { nextRunAfter } from './core/schedule.js'
import { vnWeek } from './core/time.js'
import { createNeonDb } from './db/neon.js'
import { openPglite } from './db/pglite.js'
import { activity, runs, tasks, users, weeklyReports } from './db/schema.js'
import type { Db } from './db/types.js'

const dir = new URL('./seed-data/', import.meta.url)
const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(new URL(p, dir), 'utf8')) as T

type LegacyRun = { at: string; status: 'ok' | 'partial' | 'failed'; duration: string; note: string; log: string[] }
type LegacyTask = Record<string, unknown> & { id: string; summary: string; lastRun: string; runs: LegacyRun[]; report: unknown }

function parseDuration(s: string): number | null {
  const m = /^(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(s.trim())
  if (!m || (!m[1] && !m[2])) return null
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 1000
}

async function upsertUser(db: Db, email: string, name: string, team: string) {
  const [u] = await db.insert(users).values({ email, name, team }).onConflictDoUpdate({ target: users.email, set: { name, team } }).returning()
  return u
}

async function seedOwner(db: Db) {
  const registry = await read<{ owner: { name: string; email: string; team: string }; tasks: { id: string; file: string }[] }>('registry.json')
  const owner = await upsertUser(db, registry.owner.email.toLowerCase(), registry.owner.name, registry.owner.team)
  const now = new Date()

  for (const [position, ref] of registry.tasks.entries()) {
    const legacy = await read<LegacyTask>(ref.file)
    const def = taskDefinitionSchema.parse({
      ...legacy,
      slug: legacy.id,
      instructions: `Task chuyển từ bản Logan. Việc cần làm: ${legacy.summary}. Cập nhật lại phần hướng dẫn này bằng skill tao-task.`,
    })
    const values = {
      ...def,
      ownerId: owner.id,
      position,
      lastRunAt: new Date(legacy.lastRun),
      nextRunAt: nextRunAfter(def.cron, now),
    }
    const [row] = await db
      .insert(tasks)
      .values(values)
      .onConflictDoUpdate({ target: [tasks.ownerId, tasks.slug], set: { ...values, updatedAt: now } })
      .returning()
    await db.delete(runs).where(eq(runs.taskId, row.id))
    if (legacy.runs.length) {
      await db.insert(runs).values(
        legacy.runs.map((r) => ({
          taskId: row.id, trigger: 'schedule' as const, status: r.status, startedAt: new Date(r.at), finishedAt: new Date(r.at),
          durationMs: parseDuration(r.duration), note: r.note, log: r.log,
        })),
      )
    }
  }

  const slugToId = new Map((await db.select({ id: tasks.id, slug: tasks.slug }).from(tasks).where(eq(tasks.ownerId, owner.id))).map((t) => [t.slug, t.id]))
  const events = (await read<{ events: { at: string; task: string; level: 'ok' | 'error' | 'wait'; text: string }[] }>('activity.json')).events
  await db.delete(activity).where(eq(activity.ownerId, owner.id))
  await db.insert(activity).values(events.map((e) => ({ ownerId: owner.id, taskId: slugToId.get(e.task) ?? null, at: new Date(e.at), level: e.level, text: e.text })))

  const reflect = await read<{ week: number; summary: string; good: unknown; bad: unknown; next: unknown; pattern: string }>('reflect.json')
  const week = vnWeek(new Date('2026-09-23T05:00:00Z')).key // dữ liệu mẫu là tuần 39 năm 2026
  const report = weeklyReportSchema.parse({ ...reflect, week })
  await db.delete(weeklyReports).where(and(eq(weeklyReports.ownerId, owner.id), eq(weeklyReports.week, week)))
  await db.insert(weeklyReports).values({ ownerId: owner.id, ...report })

  console.log(`Đã nạp ${registry.tasks.length} task cho ${owner.email}`)
}

async function seedDemo(db: Db) {
  const demo = [
    { email: 'demo.an@bravebits.vn', name: 'An (demo)', state: 'healthy' as const, health: 0.92 },
    { email: 'demo.binh@bravebits.vn', name: 'Bình (demo)', state: 'needs-you' as const, health: 0.55 },
  ]
  for (const d of demo) {
    const u = await upsertUser(db, d.email, d.name, 'BraveBits')
    const def = taskDefinitionSchema.parse({
      slug: 'bao-cao-ngay', name: 'Báo cáo ngày', summary: 'Tổng hợp số liệu ticket mỗi sáng', cron: '0 9 * * 1-5',
      scheduleLabel: '09:00 T2–T6', instructions: 'Đọc sheet ticket, tính số mới/đóng, ghi chỉ số.',
      state: d.state, stateLabel: d.state === 'healthy' ? 'Chạy tốt' : 'Chờ duyệt', health: d.health,
      progress: { done: 3, total: 5, unit: 'ngày có báo cáo' },
      metrics: [{ label: 'Ticket mới', value: '42', note: 'Hôm qua' }],
      trend: [30, 34, 41, 38, 42], trendLabel: 'Ticket mới mỗi ngày',
    })
    await db.insert(tasks).values({ ...def, ownerId: u.id, nextRunAt: nextRunAfter(def.cron, new Date()) }).onConflictDoNothing()
  }
  console.log('Đã nạp 2 đồng nghiệp demo')
}

const url = process.env.DATABASE_URL
const db = url ? createNeonDb(url) : await openPglite(process.env.PGLITE_DIR ?? '.pglite')
await seedOwner(db)
if (process.argv.includes('--demo')) await seedDemo(db)
process.exit(0)
