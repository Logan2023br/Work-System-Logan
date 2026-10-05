import { z } from 'zod'

export const LIMITS = {
  metrics: 8,
  trend: 30,
  milestones: 20,
  sources: 12,
  blocks: 12,
  actions: 6,
  tableRows: 200,
  tableCols: 12,
  checklistItems: 100,
  chartSeries: 4,
  chartPoints: 60,
  noteChars: 4000,
  instructionsChars: 8000,
  logLines: 200,
  logLineChars: 500,
  commandNoteChars: 1000,
  pendingCommandsPerTask: 5,
  taskBytes: 256 * 1024,
} as const

export const TASK_STATES = ['running', 'healthy', 'needs-you', 'blocked', 'idle'] as const
export const TASK_MODES = ['auto', 'review'] as const
export const SOURCE_KINDS = ['drive', 'sheet', 'doc', 'local', 'api'] as const
export const RUN_STATUSES = ['ok', 'partial', 'failed'] as const
export const COMMAND_STATUSES = ['pending', 'claimed', 'done', 'failed', 'expired', 'cancelled'] as const
export const ACTION_KINDS = ['review', 'fix', 'custom'] as const

export type TaskState = (typeof TASK_STATES)[number]
export type TaskMode = (typeof TASK_MODES)[number]
export type SourceKind = (typeof SOURCE_KINDS)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]
export type CommandStatus = (typeof COMMAND_STATUSES)[number]
export type ActionKind = (typeof ACTION_KINDS)[number]

const text = (max: number) => z.string().trim().max(max)
const label = (max: number) => z.string().trim().min(1).max(max)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD')

export function byteSize(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length
}

const uniqueIds = (arr: { id: string }[]) => new Set(arr.map((x) => x.id)).size === arr.length

export const slugSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Chỉ chữ thường không dấu, số và dấu gạch ngang')

export const progressSchema = z.object({ done: z.number().min(0), total: z.number().min(0), unit: text(40) })
export const metricSchema = z.object({ label: label(60), value: label(40), note: text(200).default('') })
export const milestoneSchema = z.object({
  title: label(120),
  state: z.enum(['done', 'active', 'todo']),
  note: text(300).default(''),
  date: isoDate,
})
export const sourceSchema = z.object({
  name: label(80),
  kind: z.enum(SOURCE_KINDS),
  location: text(300),
  status: z.enum(['ok', 'stale', 'error']),
  syncedAt: z.iso.datetime({ offset: true }),
})
export const taskReportSchema = z.object({
  headline: text(200),
  body: z.array(text(1000)).max(20).default([]),
  blockers: z.array(text(300)).max(10).default([]),
  next: z.array(text(300)).max(10).default([]),
})

const cell = z.union([text(300), z.number()])

export const blockSchema = z.discriminatedUnion('type', [
  z.object({
    id: slugSchema,
    type: z.literal('table'),
    title: label(80),
    data: z
      .object({
        columns: z.array(label(60)).min(1).max(LIMITS.tableCols),
        rows: z.array(z.array(cell).max(LIMITS.tableCols)).max(LIMITS.tableRows),
      })
      .refine((d) => d.rows.every((r) => r.length === d.columns.length), 'Mỗi dòng phải có đúng số cột'),
  }),
  z.object({
    id: slugSchema,
    type: z.literal('checklist'),
    title: label(80),
    data: z.object({ items: z.array(z.object({ text: label(300), done: z.boolean() })).max(LIMITS.checklistItems) }),
  }),
  z.object({
    id: slugSchema,
    type: z.literal('chart'),
    title: label(80),
    data: z
      .object({
        kind: z.enum(['line', 'bar']),
        labels: z.array(text(30)).max(LIMITS.chartPoints),
        series: z
          .array(z.object({ name: label(40), values: z.array(z.number()).max(LIMITS.chartPoints) }))
          .min(1)
          .max(LIMITS.chartSeries),
      })
      .refine((d) => d.series.every((s) => s.values.length === d.labels.length), 'Mỗi series phải có đúng số điểm bằng số nhãn'),
  }),
  z.object({
    id: slugSchema,
    type: z.literal('note'),
    title: label(80),
    data: z.object({ text: text(LIMITS.noteChars) }),
  }),
])
export const blocksSchema = z.array(blockSchema).max(LIMITS.blocks).refine(uniqueIds, 'id khối bị trùng')

export const actionSchema = z.object({
  id: slugSchema.refine((s) => s !== 'run', '"run" là nút "Chạy ngay" có sẵn, hãy đặt id khác'),
  label: label(40),
  kind: z.enum(ACTION_KINDS),
  instructions: label(2000),
})
export const actionsSchema = z.array(actionSchema).max(LIMITS.actions).refine(uniqueIds, 'id nút bị trùng')

export const taskFrameSchema = z.object({
  name: label(120),
  summary: text(400).default(''),
  mode: z.enum(TASK_MODES).default('auto'),
  state: z.enum(TASK_STATES).default('idle'),
  stateLabel: text(60).default(''),
  health: z.number().min(0).max(1).default(1),
  progress: progressSchema.default({ done: 0, total: 0, unit: '' }),
  metrics: z.array(metricSchema).max(LIMITS.metrics).default([]),
  trend: z.array(z.number()).max(LIMITS.trend).default([]),
  trendLabel: text(80).default(''),
  milestones: z.array(milestoneSchema).max(LIMITS.milestones).default([]),
  sources: z.array(sourceSchema).max(LIMITS.sources).default([]),
  report: taskReportSchema.nullable().default(null),
})

export const taskDefinitionBase = taskFrameSchema.extend({
  slug: slugSchema,
  cron: z.string().trim().min(9).max(100),
  scheduleLabel: text(80).default(''),
  instructions: label(LIMITS.instructionsChars),
  skill: text(80).nullable().default(null),
  blocks: blocksSchema.default([]),
  actions: actionsSchema.default([]),
})
export const taskDefinitionSchema = taskDefinitionBase.refine((t) => byteSize(t) <= LIMITS.taskBytes, {
  message: `Task vượt giới hạn 256 KB`,
})

/** Cập nhật một phần: mọi trường tùy chọn và KHÔNG chèn giá trị mặc định (để không ghi đè dữ liệu cũ). */
export const taskPatchSchema = z.object(
  Object.fromEntries(
    Object.entries(taskDefinitionBase.omit({ slug: true }).shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.unwrap() : v).optional()]),
  ) as unknown as { [K in keyof TaskPatchShape]: z.ZodOptional<z.ZodType<z.output<TaskPatchShape[K]>>> },
)
type TaskPatchShape = Omit<typeof taskDefinitionBase.shape, 'slug'>

export const reflectNoteSchema = z.object({ text: label(500), task: text(60).default(''), weight: text(80).optional() })
export const weeklyReportSchema = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/, 'Tuần dạng 2026-W41'),
  summary: text(1500),
  good: z.array(reflectNoteSchema).max(15).default([]),
  bad: z.array(reflectNoteSchema).max(15).default([]),
  next: z.array(reflectNoteSchema).max(15).default([]),
  pattern: text(1000).default(''),
})

export type Progress = z.output<typeof progressSchema>
export type Metric = z.output<typeof metricSchema>
export type Milestone = z.output<typeof milestoneSchema>
export type Source = z.output<typeof sourceSchema>
export type TaskReport = z.output<typeof taskReportSchema>
export type Block = z.output<typeof blockSchema>
export type Action = z.output<typeof actionSchema>
export type TaskFrame = z.output<typeof taskFrameSchema>
export type TaskDefinition = z.output<typeof taskDefinitionSchema>
export type TaskPatch = z.output<typeof taskPatchSchema>
export type ReflectNote = z.output<typeof reflectNoteSchema>
export type WeeklyReportInput = z.output<typeof weeklyReportSchema>
