import { and, asc, desc, eq } from 'drizzle-orm'
import type { PersonDTO, ReflectDTO, ReportWeekDTO, WorkspaceDTO } from '../../shared/dto.js'
import { TASK_STATES, type TaskState } from '../../shared/schema.js'
import { activity, commands, runs, tasks, users, weeklyReports } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { deriveConnections, toTaskDTO, type TaskRow } from './dto.js'
import { notFound } from './errors.js'
import { vnWeek, weekFromKey } from './time.js'
import { nextDispatchAt, presenceOf } from './presence.js'
import { isUuid } from './tokens.js'
import type { User } from './users.js'

const RECENT = 10
const ACTIVITY_LIMIT = 30


const ATTENTION_RANK: Record<TaskState, number> = { blocked: 0, 'needs-you': 1, running: 9, healthy: 9, idle: 9 }

function toPerson(u: User, own: Pick<TaskRow, 'slug' | 'name' | 'state' | 'stateLabel' | 'health' | 'position'>[], now: Date): PersonDTO {
  const counts = Object.fromEntries(TASK_STATES.map((s) => [s, 0])) as Record<TaskState, number>
  for (const t of own) counts[t.state] += 1
  const sorted = [...own].sort((a, b) => ATTENTION_RANK[a.state] - ATTENTION_RANK[b.state] || a.position - b.position)
  const top = sorted[0]
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    team: u.team,
    active: u.active,
    presence: presenceOf(u, now),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    nextDispatchAt: nextDispatchAt(u, now)?.toISOString() ?? null,
    taskCount: own.length,
    counts,
    health: own.length ? own.reduce((s, t) => s + t.health, 0) / own.length : null,
    attention: top && ATTENTION_RANK[top.state] < 9 ? { taskId: top.slug, taskName: top.name, state: top.state, stateLabel: top.stateLabel } : null,
  }
}

export async function listPeople(db: Db, now: Date): Promise<PersonDTO[]> {
  const [all, rows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db
      .select({ ownerId: tasks.ownerId, slug: tasks.slug, name: tasks.name, state: tasks.state, stateLabel: tasks.stateLabel, health: tasks.health, position: tasks.position })
      .from(tasks),
  ])
  return all
    .map((u) => toPerson(u, rows.filter((r) => r.ownerId === u.id), now))
    .sort((a, b) => Number(b.active) - Number(a.active))
}

export async function getWorkspace(db: Db, viewer: User, ownerId: string, now: Date): Promise<WorkspaceDTO> {
  if (!isUuid(ownerId)) throw notFound('Không tìm thấy người này')
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId) })
  if (!owner) throw notFound('Không tìm thấy người này')

  const taskRows = await db.select().from(tasks).where(eq(tasks.ownerId, ownerId)).orderBy(asc(tasks.position), asc(tasks.createdAt))
  const ids = taskRows.map((t) => t.id)

  const [runsBy, cmdsBy, events, report] = await Promise.all([
    Promise.all(ids.map((id) => db.select().from(runs).where(eq(runs.taskId, id)).orderBy(desc(runs.startedAt)).limit(RECENT))),
    Promise.all(ids.map((id) => db.select().from(commands).where(eq(commands.taskId, id)).orderBy(desc(commands.createdAt)).limit(RECENT))),
    db.select().from(activity).where(eq(activity.ownerId, ownerId)).orderBy(desc(activity.at)).limit(ACTIVITY_LIMIT),
    db.query.weeklyReports.findFirst({ where: eq(weeklyReports.ownerId, ownerId), orderBy: desc(weeklyReports.week) }),
  ])

  const slugById = new Map(taskRows.map((t) => [t.id, t.slug]))

  return {
    owner: toPerson(owner, taskRows, now),
    isMine: viewer.id === owner.id,
    week: vnWeek(now),
    tasks: taskRows.map((t, i) => toTaskDTO(t, i, runsBy[i], cmdsBy[i])),
    activity: events.map((e) => ({ at: e.at.toISOString(), task: (e.taskId && slugById.get(e.taskId)) || '', level: e.level, text: e.text })),
    connections: deriveConnections(taskRows),
    reflect: report ? toReflectDTO(report) : null,
  }
}

function toReflectDTO(r: typeof weeklyReports.$inferSelect): ReflectDTO {
  const w = weekFromKey(r.week)
  return {
    week: w?.number ?? 0,
    weekKey: r.week,
    range: w?.range ?? r.week,
    summary: r.summary,
    good: r.good,
    bad: r.bad,
    next: r.next,
    pattern: r.pattern,
    submittedAt: r.submittedAt.toISOString(),
  }
}

export async function listReportWeeks(db: Db, ownerId: string): Promise<ReportWeekDTO[]> {
  if (!isUuid(ownerId)) throw notFound('Không tìm thấy người này')
  const rows = await db.select({ week: weeklyReports.week }).from(weeklyReports).where(eq(weeklyReports.ownerId, ownerId)).orderBy(desc(weeklyReports.week)).limit(26)
  return rows.flatMap((r) => {
    const w = weekFromKey(r.week)
    return w ? [{ weekKey: r.week, week: w.number, range: w.range }] : []
  })
}

export async function getReport(db: Db, ownerId: string, weekKey: string): Promise<ReflectDTO> {
  if (!isUuid(ownerId) || !weekFromKey(weekKey)) throw notFound('Không có báo cáo tuần này')
  const r = await db.query.weeklyReports.findFirst({ where: and(eq(weeklyReports.ownerId, ownerId), eq(weeklyReports.week, weekKey)) })
  if (!r) throw notFound('Không có báo cáo tuần này')
  return toReflectDTO(r)
}
