import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { TaskDTO } from '../../shared/dto.js'
import {
  LIMITS, byteSize, taskDefinitionSchema, zodMessage,
  type RunReport, type RunStatus, type TaskDefinition, type TaskPatch, type TaskState, type WeeklyReportInputOptionalWeek,
} from '../../shared/schema.js'
import { activity, commands, runs, tasks, weeklyReports } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { toTaskDTO, type TaskRow } from './dto.js'
import { conflict, invalid, notFound } from './errors.js'
import { isValidCron, nextRunAfter } from './schedule.js'
import { vnWeek } from './time.js'
import type { User } from './users.js'

export const STATE_LABEL: Record<TaskState, string> = {
  running: 'Đang chạy',
  healthy: 'Chạy tốt',
  'needs-you': 'Cần bạn xem',
  blocked: 'Có lỗi',
  idle: 'Nằm chờ',
}
const STATE_FROM_STATUS: Record<RunStatus, TaskState> = { ok: 'healthy', partial: 'needs-you', failed: 'blocked' }
const LEVEL_FROM_STATUS: Record<RunStatus, 'ok' | 'wait' | 'error'> = { ok: 'ok', partial: 'wait', failed: 'error' }
const TEXT_FROM_STATUS: Record<RunStatus, string> = { ok: 'Chạy xong', partial: 'Chạy xong một phần', failed: 'Chạy thất bại' }

export interface MyTaskSummary {
  slug: string
  name: string
  state: TaskState
  stateLabel: string
  cron: string
  scheduleLabel: string
  paused: boolean
  lastRun: string | null
  nextRun: string | null
}

function assertCron(cron: string) {
  if (!isValidCron(cron)) throw invalid(`Cron "${cron}" không hợp lệ — cần đúng 5 trường theo giờ Việt Nam, ví dụ "0 9 * * 1-5"`)
}

async function findOwnTask(db: Db, owner: User, slug: string): Promise<TaskRow> {
  const t = await db.query.tasks.findFirst({ where: and(eq(tasks.ownerId, owner.id), eq(tasks.slug, slug)) })
  if (!t) throw notFound(`Bạn không có task "${slug}". Gọi xem_task để xem danh sách slug.`)
  return t
}

/** Phần "định nghĩa" của một task (mọi thứ Claude khai báo được), lấy từ hàng DB. */
function definitionOf(row: TaskRow) {
  return {
    slug: row.slug, name: row.name, summary: row.summary, mode: row.mode, state: row.state, stateLabel: row.stateLabel,
    health: row.health, progress: row.progress, metrics: row.metrics, trend: row.trend, trendLabel: row.trendLabel,
    milestones: row.milestones, sources: row.sources, report: row.report, cron: row.cron, scheduleLabel: row.scheduleLabel,
    instructions: row.instructions, skill: row.skill, blocks: row.blocks, actions: row.actions,
  }
}

/** Các cột ghi được từ một định nghĩa (bỏ slug — slug không đổi được). */
function columnsOf(d: TaskDefinition) {
  return {
    name: d.name, summary: d.summary, mode: d.mode, state: d.state, stateLabel: d.stateLabel, health: d.health,
    progress: d.progress, metrics: d.metrics, trend: d.trend, trendLabel: d.trendLabel, milestones: d.milestones,
    sources: d.sources, report: d.report, cron: d.cron, scheduleLabel: d.scheduleLabel, instructions: d.instructions,
    skill: d.skill, blocks: d.blocks, actions: d.actions,
  }
}

export async function createTask(db: Db, owner: User, input: TaskDefinition, now: Date): Promise<TaskRow> {
  assertCron(input.cron)
  const exists = await db.query.tasks.findFirst({ where: and(eq(tasks.ownerId, owner.id), eq(tasks.slug, input.slug)), columns: { id: true } })
  if (exists) throw conflict(`Bạn đã có task "${input.slug}" — dùng sua_task để cập nhật`)
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${tasks.position}), -1) + 1` })
    .from(tasks)
    .where(eq(tasks.ownerId, owner.id))
  const [row] = await db
    .insert(tasks)
    .values({
      ...columnsOf(input),
      slug: input.slug,
      stateLabel: input.stateLabel || STATE_LABEL[input.state],
      ownerId: owner.id,
      position: Number(next),
      nextRunAt: nextRunAfter(input.cron, now),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: row.id, at: now, level: 'ok', text: `Tạo task "${row.name}"` })
  return row
}

export async function updateTask(db: Db, owner: User, slug: string, patch: TaskPatch, now: Date): Promise<TaskRow> {
  const row = await findOwnTask(db, owner, slug)
  const merged = taskDefinitionSchema.safeParse({ ...definitionOf(row), ...patch })
  if (!merged.success) throw invalid(zodMessage(merged.error))
  const d = merged.data
  const cronChanged = d.cron !== row.cron
  if (cronChanged) assertCron(d.cron)
  const stateLabel = patch.state !== undefined && patch.stateLabel === undefined ? STATE_LABEL[d.state] : d.stateLabel
  const [updated] = await db
    .update(tasks)
    .set({ ...columnsOf(d), stateLabel, nextRunAt: cronChanged && !row.paused ? nextRunAfter(d.cron, now) : row.nextRunAt, updatedAt: now })
    .where(eq(tasks.id, row.id))
    .returning()
  return updated
}

export async function listMyTasks(db: Db, owner: User): Promise<MyTaskSummary[]> {
  const rows = await db.select().from(tasks).where(eq(tasks.ownerId, owner.id)).orderBy(asc(tasks.position), asc(tasks.createdAt))
  return rows.map((t) => ({
    slug: t.slug, name: t.name, state: t.state, stateLabel: t.stateLabel, cron: t.cron, scheduleLabel: t.scheduleLabel,
    paused: t.paused, lastRun: t.lastRunAt?.toISOString() ?? null, nextRun: t.nextRunAt?.toISOString() ?? null,
  }))
}

export async function getMyTask(db: Db, owner: User, slug: string): Promise<TaskDTO> {
  const row = await findOwnTask(db, owner, slug)
  const [r, c] = await Promise.all([
    db.select().from(runs).where(eq(runs.taskId, row.id)).orderBy(desc(runs.startedAt)).limit(10),
    db.select().from(commands).where(eq(commands.taskId, row.id)).orderBy(desc(commands.createdAt)).limit(10),
  ])
  return toTaskDTO(row, row.position, r, c)
}

export async function reportRun(db: Db, owner: User, input: RunReport, now: Date): Promise<{ runId: string; task: TaskRow }> {
  const row = await findOwnTask(db, owner, input.slug)
  const state = input.state ?? STATE_FROM_STATUS[input.status]
  const updates = {
    state,
    stateLabel: input.stateLabel ?? STATE_LABEL[state],
    health: input.health ?? row.health,
    progress: input.progress ?? row.progress,
    metrics: input.metrics ?? row.metrics,
    milestones: input.milestones ?? row.milestones,
    blocks: input.blocks ?? row.blocks,
    report: input.report ?? row.report,
    trend: input.trendThem ? [...row.trend, ...input.trendThem].slice(-LIMITS.trend) : row.trend,
  }
  if (byteSize({ ...definitionOf(row), ...updates }) > LIMITS.taskBytes) throw invalid('Task sau khi cập nhật vượt giới hạn 256 KB — rút gọn blocks hoặc report')

  const startedAt = input.durationMs !== undefined ? new Date(now.getTime() - input.durationMs) : now
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(runs)
      .values({ taskId: row.id, trigger: 'manual', status: input.status, startedAt, finishedAt: now, durationMs: input.durationMs ?? null, note: input.note, log: input.log })
      .returning({ id: runs.id })
    const [task] = await tx
      .update(tasks)
      .set({ ...updates, lastRunAt: now, nextRunAt: row.paused ? row.nextRunAt : nextRunAfter(row.cron, now), updatedAt: now })
      .where(eq(tasks.id, row.id))
      .returning()
    await tx.insert(activity).values({ ownerId: owner.id, taskId: row.id, at: now, level: LEVEL_FROM_STATUS[input.status], text: input.note || TEXT_FROM_STATUS[input.status] })
    return { runId: run.id, task }
  })
}

export async function submitWeeklyReport(db: Db, owner: User, input: WeeklyReportInputOptionalWeek, now: Date): Promise<{ week: string }> {
  const week = input.week ?? vnWeek(now).key
  const values = { summary: input.summary, good: input.good, bad: input.bad, next: input.next, pattern: input.pattern, submittedAt: now }
  await db
    .insert(weeklyReports)
    .values({ ownerId: owner.id, week, ...values })
    .onConflictDoUpdate({ target: [weeklyReports.ownerId, weeklyReports.week], set: values })
  await db.insert(activity).values({ ownerId: owner.id, at: now, level: 'ok', text: `Nộp báo cáo ${week.replace(/^\d{4}-W0?/, 'tuần ')}` })
  return { week }
}
