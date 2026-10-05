import type { CommandDTO, ConnectionDTO, PrimaryAction, RunDTO, TaskDTO } from '../../shared/dto.js'
import type { SourceKind } from '../../shared/schema.js'
import type { commands, runs, tasks } from '../db/schema.js'

export type TaskRow = typeof tasks.$inferSelect
export type RunRow = typeof runs.$inferSelect
export type CommandRow = typeof commands.$inferSelect

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}p ${s % 60}s`
}

export function primaryAction(t: Pick<TaskRow, 'state' | 'actions'>): PrimaryAction {
  const want = t.state === 'blocked' ? 'fix' : t.state === 'needs-you' ? 'review' : null
  const a = want ? t.actions.find((x) => x.kind === want) : undefined
  if (a && (a.kind === 'fix' || a.kind === 'review')) return { label: a.label, kind: a.kind, actionId: a.id }
  return { label: 'Chạy ngay', kind: 'run', actionId: 'run' }
}

export function toRunDTO(r: RunRow): RunDTO {
  return {
    at: r.startedAt.toISOString(),
    status: r.status,
    duration: formatDuration(r.durationMs),
    note: r.note,
    log: r.log ?? [],
    trigger: r.trigger,
  }
}

export function toCommandDTO(c: CommandRow): CommandDTO {
  return {
    id: c.id,
    actionId: c.actionId,
    label: c.label,
    note: c.note,
    status: c.status,
    result: c.result,
    createdAt: c.createdAt.toISOString(),
    claimedAt: iso(c.claimedAt),
    finishedAt: iso(c.finishedAt),
  }
}

export function toTaskDTO(row: TaskRow, i: number, runRows: RunRow[], cmdRows: CommandRow[]): TaskDTO {
  return {
    id: row.slug,
    index: String(i + 1).padStart(2, '0'),
    name: row.name,
    summary: row.summary,
    mode: row.mode,
    state: row.state,
    stateLabel: row.stateLabel,
    health: row.health,
    progress: row.progress,
    metrics: row.metrics,
    trend: row.trend,
    trendLabel: row.trendLabel,
    milestones: row.milestones,
    sources: row.sources,
    report: row.report ?? { headline: '', body: [], blockers: [], next: [] },
    blocks: row.blocks,
    actions: row.actions,
    instructions: row.instructions,
    skill: row.skill,
    cron: row.cron,
    scheduleLabel: row.scheduleLabel,
    paused: row.paused,
    lastRun: iso(row.lastRunAt),
    nextRun: iso(row.nextRunAt),
    action: primaryAction(row),
    runs: runRows.map(toRunDTO),
    commands: cmdRows.map(toCommandDTO),
  }
}

const KIND_NAME: Record<SourceKind, string> = {
  drive: 'Google Drive',
  sheet: 'Google Sheets',
  doc: 'Google Docs',
  local: 'Máy cục bộ',
  api: 'API',
}
const KIND_ORDER: SourceKind[] = ['drive', 'sheet', 'doc', 'api', 'local']

export function deriveConnections(rows: TaskRow[]): ConnectionDTO[] {
  const out: ConnectionDTO[] = []
  for (const kind of KIND_ORDER) {
    const hits = rows.flatMap((t) => t.sources.filter((s) => s.kind === kind).map((s) => ({ s, slug: t.slug })))
    if (hits.length === 0) continue
    const usedBy = [...new Set(hits.map((h) => h.slug))]
    const status = hits.some((h) => h.s.status === 'error') ? 'error' : hits.some((h) => h.s.status === 'stale') ? 'warning' : 'connected'
    out.push({ id: kind, name: KIND_NAME[kind], kind, status, detail: `${hits.length} nguồn · ${usedBy.length} task`, usedBy })
  }
  return out
}
