export type TaskState = 'running' | 'healthy' | 'needs-you' | 'blocked' | 'idle'
export type TaskMode = 'auto' | 'review'
export type SourceKind = 'drive' | 'sheet' | 'doc' | 'local' | 'api'
export type SourceStatus = 'ok' | 'stale' | 'error'
export type RunStatus = 'ok' | 'partial' | 'failed'
export type ConnStatus = 'connected' | 'error' | 'warning' | 'idle'
export type EventLevel = 'ok' | 'error' | 'wait'

export interface Progress { done: number; total: number; unit: string }
export interface Action { label: string; kind: 'run' | 'review' | 'fix'; count?: number }
export interface Metric { label: string; value: string; note: string }
export interface Milestone { title: string; state: 'done' | 'active' | 'todo'; note: string; date: string }
export interface Source { name: string; kind: SourceKind; location: string; status: SourceStatus; syncedAt: string }
export interface Run { at: string; status: RunStatus; duration: string; note: string; log: string[] }
export interface Report { headline: string; body: string[]; blockers: string[]; next: string[] }

export interface Task {
  id: string
  index: string
  name: string
  summary: string
  mode: TaskMode
  state: TaskState
  stateLabel: string
  health: number
  progress: Progress
  lastRun: string
  nextRun: string
  scheduleLabel: string
  cron: string
  action: Action
  trend: number[]
  trendLabel: string
  metrics: Metric[]
  milestones: Milestone[]
  sources: Source[]
  runs: Run[]
  report: Report
}

export interface Registry {
  owner: { name: string; email: string; team: string }
  week: { number: number; label: string; from: string; to: string }
  tasks: { id: string; file: string }[]
}

export interface ActivityEvent { at: string; task: string; level: EventLevel; text: string }
export interface Connection { id: string; name: string; kind: SourceKind; status: ConnStatus; detail: string; usedBy: string[] }
export interface ReflectNote { text: string; task: string; weight?: string }
export interface Reflect {
  week: number
  range: string
  summary: string
  good: ReflectNote[]
  bad: ReflectNote[]
  next: ReflectNote[]
  pattern: string
}

export interface Workspace {
  registry: Registry
  tasks: Task[]
  activity: ActivityEvent[]
  connections: Connection[]
  reflect: Reflect
}
