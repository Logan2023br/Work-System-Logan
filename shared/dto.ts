import type {
  Action, ActionKind, Block, CommandStatus, ReflectNote, RunStatus, SourceKind, TaskFrame, TaskReport, TaskState,
} from './schema.js'

export interface MeDTO {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  team: string
  role: 'member' | 'admin'
  workDays: number[]
  workStart: string
  workEnd: string
}

export type Presence = 'online' | 'offline' | 'resting' | 'never'

export interface PersonDTO {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  team: string
  active: boolean
  presence: Presence
  lastSeenAt: string | null
  nextDispatchAt: string | null
  taskCount: number
  counts: Record<TaskState, number>
  health: number | null
  attention: { taskId: string; taskName: string; state: TaskState; stateLabel: string } | null
}

export interface RunDTO {
  at: string
  status: RunStatus
  duration: string
  note: string
  log: string[]
  trigger: 'schedule' | 'command' | 'manual'
}

export interface CommandDTO {
  id: string
  actionId: string
  label: string
  note: string | null
  status: CommandStatus
  result: string | null
  createdAt: string
  claimedAt: string | null
  finishedAt: string | null
}

export interface PrimaryAction {
  label: string
  kind: 'run' | Exclude<ActionKind, 'custom'>
  actionId: string
}

export interface TaskDTO extends Omit<TaskFrame, 'report'> {
  id: string
  index: string
  cron: string
  scheduleLabel: string
  paused: boolean
  instructions: string
  skill: string | null
  blocks: Block[]
  actions: Action[]
  lastRun: string | null
  nextRun: string | null
  action: PrimaryAction
  report: TaskReport
  runs: RunDTO[]
  commands: CommandDTO[]
}

export interface ActivityDTO {
  at: string
  task: string
  level: 'ok' | 'error' | 'wait'
  text: string
}

export interface ConnectionDTO {
  id: string
  name: string
  kind: SourceKind
  status: 'connected' | 'error' | 'warning' | 'idle'
  detail: string
  usedBy: string[]
}

export interface WeekDTO {
  key: string
  number: number
  label: string
  from: string
  to: string
  range: string
}

export interface ReflectDTO {
  week: number
  weekKey: string
  range: string
  summary: string
  good: ReflectNote[]
  bad: ReflectNote[]
  next: ReflectNote[]
  pattern: string
  submittedAt: string
}

export interface WorkspaceDTO {
  owner: PersonDTO
  isMine: boolean
  week: WeekDTO
  tasks: TaskDTO[]
  activity: ActivityDTO[]
  connections: ConnectionDTO[]
  reflect: ReflectDTO | null
}
export interface ClaudeLinkDTO {
  id: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
}

export interface MyConnectionsDTO {
  connectorUrl: string
  links: ClaudeLinkDTO[]
}

export interface DispatchItem {
  leaseId: string
  loai: 'lenh' | 'lich'
  task: { slug: string; name: string; instructions: string; skill: string | null }
  lenh?: { id: string; actionId: string; label: string; instructions: string; note: string | null }
}

export interface SchedulePreviewDTO {
  valid: boolean
  label: string | null
  next: string[]
}

export interface ReportWeekDTO {
  weekKey: string
  week: number
  range: string
}
