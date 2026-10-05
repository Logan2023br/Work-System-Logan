# Work System — Kế hoạch 1/4: Nền móng (DB, đăng nhập, API đọc, Đội ngũ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy được bản nhiều người dùng chỉ đọc: đăng nhập Google @bravebits.vn, dữ liệu nằm trong Postgres, web đọc qua API, xem không gian của mình và của đồng nghiệp (chỉ đọc), admin vô hiệu hóa được người dùng.

**Architecture:** Một repo Vite + React. Backend là một app Hono (`server/http/app.ts`) gọi lõi logic (`server/core/*`) trên Drizzle. Production: một Vercel Function `api/router.ts` nhận mọi đường dẫn backend qua rewrite và dùng Neon Postgres. Dev và test: PGlite (Postgres chạy trong tiến trình, không cần Docker), app Hono được gắn vào Vite dev server, chỉ cần một lệnh `npm run dev`.

**Tech Stack:** React 19, Vite 8, framer-motion, Hono 4, Drizzle ORM 0.45 + drizzle-kit 0.31, @neondatabase/serverless 1.2, @electric-sql/pglite 0.5, zod 4, cron-parser 5, arctic 3, Vitest 5, tsx.

**Spec:** `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md`

**Kế hoạch tiếp theo (viết sau khi kế hoạch này xong):** 2 — MCP + OAuth connector; 3 — Điều phối & điều khiển; 4 — Hoàn thiện & ra mắt.

## Global Constraints

- Node ≥ 22, ESM (`"type": "module"`), TypeScript strict, `erasableSyntaxOnly` (không dùng parameter properties, enum).
- Mọi import tương đối trong `server/`, `shared/`, `api/` **phải có đuôi `.js`** (Vercel chạy ESM thuần).
- Mọi tính toán lịch và tuần dùng múi giờ `Asia/Ho_Chi_Minh`; DB lưu `timestamptz`.
- Cột DB snake_case; TS/JSON/API camelCase.
- Mọi chữ hiển thị cho người dùng bằng tiếng Việt.
- Màu chỉ mang nghĩa trạng thái: `--needs`, `--run`, `--bad`, `--idle`; font giữ Bricolage Grotesque / Schibsted Grotesk / DM Mono.
- Chỉ email `@bravebits.vn` (claim `hd` = `bravebits.vn`, `email_verified` = true). Admin xác định bằng biến môi trường `ADMIN_EMAILS`.
- Không commit bí mật; `.env` và `.pglite/` bị ignore. Dữ liệu mẫu không được nằm trong `public/`.
- Giới hạn dữ liệu đúng như `LIMITS` trong `shared/schema.ts` (lấy từ spec mục 5).

## Review Focus

1. Mở URL đồng nghiệp với id không phải UUID hoặc không tồn tại → 404 có thông điệp, không phải 500. (Task 6)
2. Task chưa chạy lần nào (`lastRun`/`nextRun` null, không có report/trend/metrics) → API trả mặc định an toàn, UI không vỡ. (Task 6, Task 9)
3. Email viết hoa, hoặc `hd` khác domain dù email đúng đuôi → chuẩn hóa chữ thường và từ chối. (Task 5)
4. Người bị vô hiệu hóa vẫn còn cookie session → 401 ngay lập tức. (Task 5, Task 7)
5. Tham số `next` dạng `//evil.com` hoặc `/\evil.com` sau đăng nhập → về `/`, không redirect ra ngoài. (Task 7)

---

## File Structure

```
shared/
  schema.ts            zod: khung task, khối, nút, báo cáo tuần, LIMITS, hằng số enum
  schema.test.ts
  dto.ts               kiểu dữ liệu API trả cho web
server/
  config.ts            đọc biến môi trường
  db/schema.ts         bảng Drizzle (toàn bộ, kể cả bảng cho kế hoạch 2–3)
  db/types.ts          kiểu Db
  db/pglite.ts         mở PGlite + chạy migration (dev, test)
  db/neon.ts           Pool Neon dùng chung (production)
  db/migrate.ts        chạy migration lên Neon
  db/migrations/       SQL do drizzle-kit sinh
  core/errors.ts       AppError
  core/time.ts         giờ VN, tuần ISO
  core/schedule.ts     cron
  core/tokens.ts       sinh/hash token
  core/users.ts        đăng nhập Google, vô hiệu hóa
  core/sessions.ts     session web
  core/dto.ts          map hàng DB → DTO
  core/workspace.ts    đọc danh sách người, không gian một người
  http/app.ts          app Hono + xử lý lỗi
  http/auth.ts         /auth/*
  http/api.ts          /api/*
  http/google.ts       Google OAuth (arctic)
  dev.ts               app cho Vite dev server
  seed.ts              nạp dữ liệu Logan (+ đồng nghiệp demo)
  seed-data/           JSON chuyển từ public/data
  test/db.ts           tiện ích test DB
api/router.ts          Vercel Function duy nhất
vercel.json
vitest.config.ts
drizzle.config.ts
tsconfig.server.json
src/
  lib/api.ts           fetch + ApiError
  lib/types.ts         re-export DTO
  lib/data.ts          gọi API
  lib/usePoll.ts       làm mới khi tab hiển thị
  lib/format.ts        (sửa) giờ VN, null-safe
  App.tsx              (viết lại) cổng đăng nhập + khung
  components/Login.tsx
  components/Team.tsx
  components/Desk.tsx, TaskSpace.tsx, Schedule.tsx, Reflect.tsx, Connections.tsx  (sửa: readOnly, null-safe)
  styles/team.css
```

---

### Task 1: Công cụ, cấu hình, bộ test chạy được

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `tsconfig.server.json`, `vitest.config.ts`, `shared/schema.ts` (khung rỗng để test chạy), `shared/schema.test.ts`

**Interfaces:**
- Produces: `npm test` chạy Vitest trên `server/**/*.test.ts` và `shared/**/*.test.ts`; `npm run typecheck` kiểm tra cả app lẫn server.

- [ ] **Step 1: Cài thư viện**

```bash
cd "/Users/bbuser/Documents/Work System/Work-System-Logan"
npm i hono@^4.13 drizzle-orm@^0.45.3 @neondatabase/serverless@^1.2 zod@^4.6 cron-parser@^5.10 arctic@^3.7
npm i -D drizzle-kit@^0.31 @electric-sql/pglite@^0.5.8 @hono/node-server@^2.1 vitest@^5 tsx@^4.23
```

- [ ] **Step 2: Sửa `package.json` scripts và engines**

Thay khối `"scripts"` bằng:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "vercel-build": "npm run db:migrate && npm run build",
    "typecheck": "tsc -b",
    "lint": "oxlint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx server/db/migrate.ts",
    "seed": "tsx server/seed.ts",
    "preview": "vite preview"
  },
  "engines": { "node": ">=22" },
```

- [ ] **Step 3: Tạo `tsconfig.server.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "moduleDetection": "force",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["server", "shared", "api", "vitest.config.ts", "drizzle.config.ts"]
}
```

Sửa `tsconfig.json` thêm reference:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

Sửa `tsconfig.app.json`: `"include": ["src", "shared"]`.

- [ ] **Step 4: Tạo `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
```

- [ ] **Step 5: Thêm vào `.gitignore`**

```
.env
.pglite
.vercel
```

- [ ] **Step 6: Viết test khói `shared/schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { LIMITS } from './schema.js'

describe('LIMITS', () => {
  it('khớp spec mục 5', () => {
    expect(LIMITS.blocks).toBe(12)
    expect(LIMITS.actions).toBe(6)
    expect(LIMITS.taskBytes).toBe(256 * 1024)
  })
})
```

- [ ] **Step 7: Chạy để thấy fail**

Run: `npx vitest run shared/schema.test.ts`
Expected: FAIL — không tìm thấy `./schema.js`.

- [ ] **Step 8: Tạo `shared/schema.ts` tối thiểu**

```ts
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
```

- [ ] **Step 9: Chạy test và typecheck**

Run: `npx vitest run shared/schema.test.ts && npx tsc -b`
Expected: 1 test PASS; tsc không lỗi.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.server.json vitest.config.ts .gitignore shared/
git commit -m "chore: công cụ backend, Vitest, tsconfig server"
```

---

### Task 2: Schema dùng chung (zod) và DTO

**Files:**
- Modify: `shared/schema.ts`, `shared/schema.test.ts`
- Create: `shared/dto.ts`

**Interfaces:**
- Produces (từ `shared/schema.ts`): `LIMITS`, `TASK_STATES`, `TASK_MODES`, `SOURCE_KINDS`, `RUN_STATUSES`, `COMMAND_STATUSES`, `ACTION_KINDS`, `slugSchema`, `progressSchema`, `metricSchema`, `milestoneSchema`, `sourceSchema`, `taskReportSchema`, `blockSchema`, `blocksSchema`, `actionSchema`, `actionsSchema`, `taskFrameSchema`, `taskDefinitionBase` (ZodObject, dùng `.partial()` được), `taskDefinitionSchema` (có kiểm tra 256 KB), `reflectNoteSchema`, `weeklyReportSchema`, `byteSize(v): number`; kiểu `TaskState`, `TaskMode`, `SourceKind`, `RunStatus`, `CommandStatus`, `ActionKind`, `Progress`, `Metric`, `Milestone`, `Source`, `TaskReport`, `Block`, `Action`, `TaskFrame`, `TaskDefinition`, `ReflectNote`, `WeeklyReportInput`.
- Produces (từ `shared/dto.ts`): `MeDTO`, `Presence`, `PersonDTO`, `RunDTO`, `CommandDTO`, `PrimaryAction`, `TaskDTO`, `ActivityDTO`, `ConnectionDTO`, `ReflectDTO`, `WeekDTO`, `WorkspaceDTO`.

- [ ] **Step 1: Viết test (thay toàn bộ `shared/schema.test.ts`)**

```ts
import { describe, expect, it } from 'vitest'
import { LIMITS, blockSchema, blocksSchema, actionsSchema, taskDefinitionSchema, taskDefinitionBase, byteSize } from './schema.js'

const baseTask = {
  slug: 'upsell-q3',
  name: 'Chiến dịch upsell',
  cron: '30 9,15 * * *',
  instructions: 'Đọc sheet, gửi tin qua Crisp.',
}

describe('LIMITS', () => {
  it('khớp spec mục 5', () => {
    expect(LIMITS.blocks).toBe(12)
    expect(LIMITS.actions).toBe(6)
    expect(LIMITS.taskBytes).toBe(256 * 1024)
  })
})

describe('taskDefinitionSchema', () => {
  it('điền mặc định cho task tối thiểu', () => {
    const t = taskDefinitionSchema.parse(baseTask)
    expect(t.state).toBe('idle')
    expect(t.mode).toBe('auto')
    expect(t.metrics).toEqual([])
    expect(t.report).toBeNull()
    expect(t.blocks).toEqual([])
    expect(t.skill).toBeNull()
  })

  it('từ chối slug có chữ hoa hoặc khoảng trắng', () => {
    expect(taskDefinitionSchema.safeParse({ ...baseTask, slug: 'Upsell Q3' }).success).toBe(false)
  })

  it('từ chối task vượt 256 KB', () => {
    const big = { ...baseTask, blocks: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, type: 'note', title: 'x', data: { text: 'a'.repeat(4000) } })), summary: 'x'.repeat(400) }
    // 12 × 4000 = 48 KB — vẫn hợp lệ
    expect(taskDefinitionSchema.safeParse(big).success).toBe(true)
    const rows = Array.from({ length: 200 }, () => Array.from({ length: 12 }, () => 'y'.repeat(300)))
    const huge = { ...baseTask, blocks: [{ id: 't', type: 'table', title: 'T', data: { columns: Array.from({ length: 12 }, (_, i) => `c${i}`), rows } }] }
    const r = taskDefinitionSchema.safeParse(huge)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('256 KB')
  })

  it('taskDefinitionBase cho phép partial (dùng cho sua_task)', () => {
    expect(taskDefinitionBase.partial().parse({ name: 'Mới' })).toEqual({ name: 'Mới' })
  })
})

describe('blockSchema', () => {
  it('nhận đủ 4 loại khối', () => {
    const ok = [
      { id: 'b1', type: 'table', title: 'Bảng', data: { columns: ['A', 'B'], rows: [['x', 1]] } },
      { id: 'b2', type: 'checklist', title: 'Việc', data: { items: [{ text: 'a', done: true }] } },
      { id: 'b3', type: 'chart', title: 'Biểu đồ', data: { kind: 'bar', labels: ['T2', 'T3'], series: [{ name: 'Tin', values: [1, 2] }] } },
      { id: 'b4', type: 'note', title: 'Ghi chú', data: { text: '**đậm**' } },
    ]
    for (const b of ok) expect(blockSchema.safeParse(b).success).toBe(true)
  })

  it('từ chối bảng có dòng lệch số cột', () => {
    const r = blockSchema.safeParse({ id: 'b1', type: 'table', title: 'Bảng', data: { columns: ['A', 'B'], rows: [['x']] } })
    expect(r.success).toBe(false)
  })

  it('từ chối biểu đồ có series lệch số nhãn', () => {
    const r = blockSchema.safeParse({ id: 'c', type: 'chart', title: 'C', data: { kind: 'line', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] } })
    expect(r.success).toBe(false)
  })

  it('từ chối id khối trùng', () => {
    const n = { id: 'x', type: 'note', title: 'a', data: { text: '' } }
    expect(blocksSchema.safeParse([n, n]).success).toBe(false)
  })
})

describe('actionsSchema', () => {
  it('cấm id "run" vì là nút có sẵn', () => {
    expect(actionsSchema.safeParse([{ id: 'run', label: 'Chạy', kind: 'custom', instructions: 'x' }]).success).toBe(false)
  })
  it('giới hạn 6 nút', () => {
    const a = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, label: 'x', kind: 'custom', instructions: 'x' }))
    expect(actionsSchema.safeParse(a).success).toBe(false)
  })
})

describe('byteSize', () => {
  it('đếm byte UTF-8', () => {
    expect(byteSize('ạ')).toBe(5) // "\"ạ\"" = 2 + 3 byte
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run shared/schema.test.ts`
Expected: FAIL — các export chưa tồn tại.

- [ ] **Step 3: Viết `shared/schema.ts` đầy đủ**

```ts
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

export const reflectNoteSchema = z.object({ text: label(500), task: text(60).default(''), weight: text(20).optional() })
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
export type ReflectNote = z.output<typeof reflectNoteSchema>
export type WeeklyReportInput = z.output<typeof weeklyReportSchema>
```

- [ ] **Step 4: Viết `shared/dto.ts`**

```ts
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

export type Presence = 'online' | 'offline' | 'never'

export interface PersonDTO {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  team: string
  active: boolean
  presence: Presence
  lastSeenAt: string | null
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
```

- [ ] **Step 5: Chạy test và typecheck**

Run: `npx vitest run shared && npx tsc -b`
Expected: tất cả PASS, tsc sạch.

- [ ] **Step 6: Commit**

```bash
git add shared/
git commit -m "feat: schema zod dùng chung và DTO"
```

---

### Task 3: Bảng Drizzle, migration, PGlite và tiện ích test

**Files:**
- Create: `server/db/schema.ts`, `server/db/types.ts`, `server/db/pglite.ts`, `server/db/neon.ts`, `server/db/migrate.ts`, `drizzle.config.ts`, `server/test/db.ts`, `server/db/db.test.ts`
- Generated: `server/db/migrations/*`

**Interfaces:**
- Consumes: kiểu từ `shared/schema.ts`.
- Produces: bảng `users`, `sessions`, `tasks`, `runs`, `commands`, `weeklyReports`, `activity`, `oauthClients`, `oauthCodes`, `oauthTokens`; kiểu `Db`; `openPglite(dataDir?: string): Promise<Db>`; `createNeonDb(url: string): Db`; test helpers `testDb(): Promise<Db>`, `resetDb(db): Promise<void>`, `makeUser(db, over?): Promise<UserRow>`, `makeTask(db, ownerId, over?): Promise<TaskRow>`; kiểu `UserRow = typeof users.$inferSelect`, `TaskRow = typeof tasks.$inferSelect`.

- [ ] **Step 1: Viết `server/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type {
  Action, Block, Metric, Milestone, Progress, ReflectNote, Source, TaskReport,
} from '../../shared/schema.js'
import { COMMAND_STATUSES, RUN_STATUSES, TASK_MODES, TASK_STATES } from '../../shared/schema.js'

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  team: text('team').notNull().default('BraveBits'),
  role: text('role', { enum: ['member', 'admin'] }).notNull().default('member'),
  active: boolean('active').notNull().default(true),
  workDays: integer('work_days').array().notNull().default(sql`'{1,2,3,4,5}'`),
  workStart: text('work_start').notNull().default('08:00'),
  workEnd: text('work_end').notNull().default('19:00'),
  lastSeenAt: ts('last_seen_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    slug: text('slug').notNull(),
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    mode: text('mode', { enum: TASK_MODES }).notNull().default('auto'),
    state: text('state', { enum: TASK_STATES }).notNull().default('idle'),
    stateLabel: text('state_label').notNull().default(''),
    health: real('health').notNull().default(1),
    progress: jsonb('progress').$type<Progress>().notNull().default({ done: 0, total: 0, unit: '' }),
    metrics: jsonb('metrics').$type<Metric[]>().notNull().default([]),
    trend: jsonb('trend').$type<number[]>().notNull().default([]),
    trendLabel: text('trend_label').notNull().default(''),
    milestones: jsonb('milestones').$type<Milestone[]>().notNull().default([]),
    sources: jsonb('sources').$type<Source[]>().notNull().default([]),
    report: jsonb('report').$type<TaskReport | null>(),
    blocks: jsonb('blocks').$type<Block[]>().notNull().default([]),
    actions: jsonb('actions').$type<Action[]>().notNull().default([]),
    instructions: text('instructions').notNull(),
    skill: text('skill'),
    cron: text('cron').notNull(),
    scheduleLabel: text('schedule_label').notNull().default(''),
    paused: boolean('paused').notNull().default(false),
    nextRunAt: ts('next_run_at'),
    lastRunAt: ts('last_run_at'),
    leaseId: uuid('lease_id'),
    leaseUntil: ts('lease_until'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tasks_owner_slug').on(t.ownerId, t.slug), index('tasks_due').on(t.ownerId, t.nextRunAt)],
)

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    commandId: uuid('command_id'),
    leaseId: uuid('lease_id').unique(),
    trigger: text('trigger', { enum: ['schedule', 'command', 'manual'] }).notNull(),
    status: text('status', { enum: RUN_STATUSES }).notNull(),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at').notNull(),
    durationMs: integer('duration_ms'),
    note: text('note').notNull().default(''),
    log: jsonb('log').$type<string[]>(),
  },
  (t) => [index('runs_task_time').on(t.taskId, t.startedAt)],
)

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    actionId: text('action_id').notNull(),
    label: text('label').notNull(),
    instructions: text('instructions').notNull(),
    note: text('note'),
    status: text('status', { enum: COMMAND_STATUSES }).notNull().default('pending'),
    leaseId: uuid('lease_id'),
    result: text('result'),
    createdAt: ts('created_at').notNull().defaultNow(),
    claimedAt: ts('claimed_at'),
    finishedAt: ts('finished_at'),
  },
  (t) => [index('commands_owner_status').on(t.ownerId, t.status), index('commands_task_time').on(t.taskId, t.createdAt)],
)

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    week: text('week').notNull(),
    summary: text('summary').notNull(),
    good: jsonb('good').$type<ReflectNote[]>().notNull().default([]),
    bad: jsonb('bad').$type<ReflectNote[]>().notNull().default([]),
    next: jsonb('next').$type<ReflectNote[]>().notNull().default([]),
    pattern: text('pattern').notNull().default(''),
    submittedAt: ts('submitted_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('weekly_owner_week').on(t.ownerId, t.week)],
)

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    at: ts('at').notNull().defaultNow(),
    level: text('level', { enum: ['ok', 'error', 'wait'] }).notNull(),
    text: text('text').notNull(),
  },
  (t) => [index('activity_owner_time').on(t.ownerId, t.at)],
)

export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  kind: text('kind', { enum: ['dcr', 'cimd'] }).notNull(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const oauthCodes = pgTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  resource: text('resource'),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
})

export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  accessHash: text('access_hash').notNull().unique(),
  refreshHash: text('refresh_hash').notNull().unique(),
  accessExpiresAt: ts('access_expires_at').notNull(),
  refreshExpiresAt: ts('refresh_expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  lastUsedAt: ts('last_used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
})
```

- [ ] **Step 2: Viết `server/db/types.ts`, `drizzle.config.ts`**

```ts
// server/db/types.ts
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as schema from './schema.js'

// `any` cho query-result HKT để cùng một kiểu nhận cả PGlite (dev/test) và Neon (production).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://unused' },
})
```

- [ ] **Step 3: Sinh migration**

Run: `npm run db:generate`
Expected: tạo `server/db/migrations/0000_*.sql` và `server/db/migrations/meta/`. Mở file SQL kiểm tra có đủ 10 bảng.

- [ ] **Step 4: Viết `server/db/pglite.ts`, `server/db/neon.ts`, `server/db/migrate.ts`**

```ts
// server/db/pglite.ts
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from './schema.js'
import type { Db } from './types.js'

const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url))

/** Postgres trong tiến trình cho dev và test. Không truyền dataDir → chỉ trong bộ nhớ. */
export async function openPglite(dataDir?: string): Promise<Db> {
  const db = drizzle({ client: new PGlite(dataDir), schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return db as unknown as Db
}
```

```ts
// server/db/neon.ts
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema.js'
import type { Db } from './types.js'

/** Một Pool dùng chung cho mọi request của một instance function. */
export function createNeonDb(url: string): Db {
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 })
  return drizzle({ client: pool, schema }) as unknown as Db
}
```

```ts
// server/db/migrate.ts
import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('Bỏ qua migration: chưa có DATABASE_URL')
  process.exit(0)
}
const pool = new Pool({ connectionString: url })
await migrate(drizzle({ client: pool }), { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) })
await pool.end()
console.log('Migration xong')
```

- [ ] **Step 5: Viết `server/test/db.ts`**

```ts
import { sql } from 'drizzle-orm'
import { openPglite } from '../db/pglite.js'
import { tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'

export type UserRow = typeof users.$inferSelect
export type TaskRow = typeof tasks.$inferSelect

export function testDb(): Promise<Db> {
  return openPglite()
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE users, sessions, tasks, runs, commands, weekly_reports, activity, oauth_clients, oauth_codes, oauth_tokens CASCADE`)
}

let seq = 0
export async function makeUser(db: Db, over: Partial<typeof users.$inferInsert> = {}): Promise<UserRow> {
  seq += 1
  const [u] = await db
    .insert(users)
    .values({ email: `nguoi${seq}@bravebits.vn`, name: `Người ${seq}`, ...over })
    .returning()
  return u
}

export async function makeTask(db: Db, ownerId: string, over: Partial<typeof tasks.$inferInsert> = {}): Promise<TaskRow> {
  seq += 1
  const [t] = await db
    .insert(tasks)
    .values({ ownerId, slug: `task-${seq}`, name: `Task ${seq}`, instructions: 'Làm việc mẫu', cron: '0 9 * * 1-5', ...over })
    .returning()
  return t
}
```

- [ ] **Step 6: Viết test `server/db/db.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { tasks } from './schema.js'
import type { Db } from './types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'

let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })
afterAll(async () => {})

describe('schema', () => {
  it('tạo người dùng với khung giờ mặc định', async () => {
    const u = await makeUser(db)
    expect(u.workDays).toEqual([1, 2, 3, 4, 5])
    expect(u.workStart).toBe('08:00')
    expect(u.role).toBe('member')
  })

  it('task có mặc định jsonb và slug duy nhất theo người', async () => {
    const u = await makeUser(db)
    const t = await makeTask(db, u.id, { slug: 'a' })
    expect(t.metrics).toEqual([])
    expect(t.progress).toEqual({ done: 0, total: 0, unit: '' })
    await expect(makeTask(db, u.id, { slug: 'a' })).rejects.toThrow()
    const other = await makeUser(db)
    await expect(makeTask(db, other.id, { slug: 'a' })).resolves.toBeTruthy()
  })

  it('UPDATE … RETURNING chỉ nhận một lần (nền cho lease)', async () => {
    const u = await makeUser(db)
    const t = await makeTask(db, u.id)
    const first = await db.update(tasks).set({ leaseId: crypto.randomUUID() }).where(eq(tasks.id, t.id)).returning()
    expect(first).toHaveLength(1)
  })
})
```

- [ ] **Step 7: Chạy test**

Run: `npx vitest run server/db`
Expected: 3 test PASS.

- [ ] **Step 8: Typecheck và commit**

Run: `npx tsc -b`
Expected: sạch.

```bash
git add server/db server/test drizzle.config.ts
git commit -m "feat: bảng Drizzle, migration, PGlite cho dev/test, Neon cho production"
```

---

### Task 4: Giờ Việt Nam, tuần ISO, cron

**Files:**
- Create: `server/core/time.ts`, `server/core/time.test.ts`, `server/core/schedule.ts`, `server/core/schedule.test.ts`, `server/core/errors.ts`

**Interfaces:**
- Produces: `TZ = 'Asia/Ho_Chi_Minh'`; `vnWeek(now: Date): WeekDTO`; `vnDate(d: Date): string` (YYYY-MM-DD theo giờ VN); `isValidCron(expr: string): boolean`; `nextRunAfter(expr: string, after: Date): Date`; `previewRuns(expr: string, after: Date, n?: number): Date[]`; `AppError` với `code: ErrorCode`, `status: number`; các hàm tạo nhanh `notFound(msg)`, `forbidden(msg)`, `unauthorized(msg)`, `invalid(msg)`, `conflict(msg)`.

- [ ] **Step 1: Viết test `server/core/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { vnDate, vnWeek } from './time.js'

describe('vnWeek', () => {
  it('thứ 2 5/10/2026 là tuần 41', () => {
    const w = vnWeek(new Date('2026-10-05T03:00:00Z'))
    expect(w).toEqual({ key: '2026-W41', number: 41, label: 'Tuần 41', from: '2026-10-05', to: '2026-10-11', range: '5 – 11 tháng 10, 2026' })
  })

  it('dùng giờ VN: 18:00Z chủ nhật 4/10 đã là thứ 2 ở VN', () => {
    expect(vnWeek(new Date('2026-10-04T18:00:00Z')).key).toBe('2026-W41')
    expect(vnWeek(new Date('2026-10-04T16:59:00Z')).key).toBe('2026-W40')
  })

  it('tuần vắt qua hai tháng', () => {
    expect(vnWeek(new Date('2026-09-30T05:00:00Z')).range).toBe('28/9 – 4/10, 2026')
  })

  it('1/1/2027 thuộc tuần 53 của 2026', () => {
    expect(vnWeek(new Date('2027-01-01T05:00:00Z')).key).toBe('2026-W53')
  })

  it('khớp dữ liệu mẫu: 21–27/9/2026 là tuần 39', () => {
    expect(vnWeek(new Date('2026-09-23T05:00:00Z')).range).toBe('21 – 27 tháng 9, 2026')
    expect(vnWeek(new Date('2026-09-23T05:00:00Z')).number).toBe(39)
  })
})

describe('vnDate', () => {
  it('đổi sang ngày VN', () => {
    expect(vnDate(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05')
  })
})
```

- [ ] **Step 2: Viết test `server/core/schedule.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { isValidCron, nextRunAfter, previewRuns } from './schedule.js'

describe('isValidCron', () => {
  it.each(['0 16 * * 5', '30 9,15 * * *', '*/15 8-18 * * 1-5'])('nhận %s', (e) => expect(isValidCron(e)).toBe(true))
  it.each(['', 'abc', '61 * * * *', '0 25 * * *', '0 0 * * * *', '* * *'])('từ chối "%s"', (e) => expect(isValidCron(e)).toBe(false))
})

describe('nextRunAfter', () => {
  it('tính theo giờ VN: 16:00 thứ 6 = 09:00Z', () => {
    expect(nextRunAfter('0 16 * * 5', new Date('2026-10-05T03:00:00Z')).toISOString()).toBe('2026-10-09T09:00:00.000Z')
  })
  it('đúng lúc trùng mốc thì lấy mốc kế tiếp', () => {
    expect(nextRunAfter('0 9 * * *', new Date('2026-10-05T02:00:00Z')).toISOString()).toBe('2026-10-06T02:00:00.000Z')
  })
})

describe('previewRuns', () => {
  it('trả 3 lần kế tiếp', () => {
    const r = previewRuns('30 9,15 * * *', new Date('2026-10-05T03:00:00Z'))
    expect(r.map((d) => d.toISOString())).toEqual([
      '2026-10-05T08:30:00.000Z',
      '2026-10-06T02:30:00.000Z',
      '2026-10-06T08:30:00.000Z',
    ])
  })
})
```

- [ ] **Step 3: Chạy để thấy fail**

Run: `npx vitest run server/core`
Expected: FAIL — module chưa có.

- [ ] **Step 4: Viết `server/core/errors.ts`**

```ts
export type ErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'conflict'

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  conflict: 409,
}

export class AppError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
  get status() {
    return STATUS[this.code]
  }
}

export const unauthorized = (m = 'Bạn cần đăng nhập') => new AppError('unauthorized', m)
export const forbidden = (m = 'Bạn không có quyền làm việc này') => new AppError('forbidden', m)
export const notFound = (m = 'Không tìm thấy') => new AppError('not_found', m)
export const invalid = (m: string) => new AppError('invalid', m)
export const conflict = (m: string) => new AppError('conflict', m)
```

- [ ] **Step 5: Viết `server/core/time.ts`**

```ts
import type { WeekDTO } from '../../shared/dto.js'

export const TZ = 'Asia/Ho_Chi_Minh'
const OFFSET = 7 * 3_600_000 // Việt Nam không có giờ mùa hè
const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Mốc 00:00 của ngày VN chứa `d`, biểu diễn như thời điểm UTC (để làm toán ngày). */
function vnMidnight(d: Date): number {
  const v = new Date(d.getTime() + OFFSET)
  return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
}

export function vnDate(d: Date): string {
  return ymd(vnMidnight(d))
}

export function vnWeek(now: Date): WeekDTO {
  const day = vnMidnight(now)
  const dow = (new Date(day).getUTCDay() + 6) % 7 // thứ 2 = 0
  const monday = day - dow * DAY
  const sunday = monday + 6 * DAY
  const isoYear = new Date(monday + 3 * DAY).getUTCFullYear()
  const jan4 = Date.UTC(isoYear, 0, 4)
  const week1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY
  const number = 1 + Math.round((monday - week1) / (7 * DAY))

  const a = new Date(monday)
  const b = new Date(sunday)
  const range =
    a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()} – ${b.getUTCDate()} tháng ${b.getUTCMonth() + 1}, ${b.getUTCFullYear()}`
      : `${a.getUTCDate()}/${a.getUTCMonth() + 1} – ${b.getUTCDate()}/${b.getUTCMonth() + 1}, ${b.getUTCFullYear()}`

  return { key: `${isoYear}-W${pad(number)}`, number, label: `Tuần ${number}`, from: ymd(monday), to: ymd(sunday), range }
}
```

- [ ] **Step 6: Viết `server/core/schedule.ts`**

```ts
import { CronExpressionParser } from 'cron-parser'
import { TZ } from './time.js'

export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5 || parts[0] === '') return false
  try {
    CronExpressionParser.parse(expr, { tz: TZ, strict: true })
    return true
  } catch {
    return false
  }
}

export function nextRunAfter(expr: string, after: Date): Date {
  return CronExpressionParser.parse(expr, { currentDate: after, tz: TZ }).next().toDate()
}

export function previewRuns(expr: string, after: Date, n = 3): Date[] {
  const it = CronExpressionParser.parse(expr, { currentDate: after, tz: TZ })
  return Array.from({ length: n }, () => it.next().toDate())
}
```

Nếu `strict: true` từ chối cả biểu thức hợp lệ trong test (ví dụ cron-parser yêu cầu không được đặt cả ngày-trong-tháng lẫn thứ), bỏ `strict` và giữ kiểm tra số trường; chạy lại test để xác nhận `61 * * * *` và `0 25 * * *` vẫn bị từ chối.

- [ ] **Step 7: Chạy test**

Run: `npx vitest run server/core`
Expected: tất cả PASS.

- [ ] **Step 8: Commit**

```bash
git add server/core
git commit -m "feat: giờ VN, tuần ISO, cron, AppError"
```

---

### Task 5: Người dùng, session, vô hiệu hóa

**Files:**
- Create: `server/core/tokens.ts`, `server/core/users.ts`, `server/core/sessions.ts`, `server/core/users.test.ts`

**Interfaces:**
- Consumes: `Db`, bảng `users`, `sessions`, `oauthTokens`; `AppError` helpers.
- Produces:
  - `newToken(): string` (32 byte base64url), `hashToken(t: string): string` (sha256 hex)
  - `type User = typeof users.$inferSelect`
  - `interface GoogleProfile { email: string; emailVerified: boolean; hd: string | null; name: string; picture: string | null }`
  - `interface AuthPolicy { allowedDomain: string; adminEmails: string[] }`
  - `signInWithGoogle(db, p: GoogleProfile, policy: AuthPolicy): Promise<{ ok: true; user: User } | { ok: false; reason: 'unverified' | 'domain' | 'inactive' }>`
  - `deactivateUser(db, actor: User, targetId: string, now: Date): Promise<void>`
  - `toMeDTO(u: User): MeDTO`
  - `SESSION_DAYS = 30`; `createSession(db, userId, now): Promise<{ token: string; expiresAt: Date }>`; `userFromSession(db, token, now): Promise<User | null>`; `deleteSession(db, token): Promise<void>`

- [ ] **Step 1: Viết test `server/core/users.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { oauthTokens, sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createSession, deleteSession, userFromSession } from './sessions.js'
import { deactivateUser, signInWithGoogle, type GoogleProfile } from './users.js'

const policy = { allowedDomain: 'bravebits.vn', adminEmails: ['tutnv@bravebits.vn'] }
const now = new Date('2026-10-05T03:00:00Z')
const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  email: 'an@bravebits.vn', emailVerified: true, hd: 'bravebits.vn', name: 'An', picture: null, ...over,
})

let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('signInWithGoogle', () => {
  it('tạo người dùng mới, email chữ thường', async () => {
    const r = await signInWithGoogle(db, profile({ email: 'An@BraveBits.vn' }), policy)
    expect(r.ok && r.user.email).toBe('an@bravebits.vn')
    expect(r.ok && r.user.role).toBe('member')
  })

  it('cập nhật tên/ảnh khi đăng nhập lại, không tạo trùng', async () => {
    await signInWithGoogle(db, profile(), policy)
    const r = await signInWithGoogle(db, profile({ name: 'An Nguyễn', picture: 'https://x/a.png' }), policy)
    expect(r.ok && r.user.name).toBe('An Nguyễn')
    expect(r.ok && r.user.avatarUrl).toBe('https://x/a.png')
  })

  it('admin theo ADMIN_EMAILS, và mất quyền khi bị gỡ khỏi danh sách', async () => {
    const a = await signInWithGoogle(db, profile({ email: 'tutnv@bravebits.vn' }), policy)
    expect(a.ok && a.user.role).toBe('admin')
    const b = await signInWithGoogle(db, profile({ email: 'tutnv@bravebits.vn' }), { ...policy, adminEmails: [] })
    expect(b.ok && b.user.role).toBe('member')
  })

  it('từ chối email chưa xác minh', async () => {
    expect(await signInWithGoogle(db, profile({ emailVerified: false }), policy)).toEqual({ ok: false, reason: 'unverified' })
  })

  it('từ chối domain khác, kể cả khi đuôi email đúng nhưng hd sai', async () => {
    expect(await signInWithGoogle(db, profile({ email: 'x@gmail.com', hd: null }), policy)).toEqual({ ok: false, reason: 'domain' })
    expect(await signInWithGoogle(db, profile({ hd: null }), policy)).toEqual({ ok: false, reason: 'domain' })
    expect(await signInWithGoogle(db, profile({ email: 'x@evilbravebits.vn', hd: 'bravebits.vn' }), policy)).toEqual({ ok: false, reason: 'domain' })
  })

  it('từ chối người đã bị vô hiệu hóa', async () => {
    await makeUser(db, { email: 'an@bravebits.vn', active: false })
    expect(await signInWithGoogle(db, profile(), policy)).toEqual({ ok: false, reason: 'inactive' })
  })
})

describe('sessions', () => {
  it('tạo, đọc, xóa session; token chỉ lưu dạng hash', async () => {
    const u = await makeUser(db)
    const s = await createSession(db, u.id, now)
    const rows = await db.select().from(sessions)
    expect(rows[0].idHash).not.toBe(s.token)
    expect((await userFromSession(db, s.token, now))?.id).toBe(u.id)
    await deleteSession(db, s.token)
    expect(await userFromSession(db, s.token, now)).toBeNull()
  })

  it('session hết hạn sau 30 ngày', async () => {
    const u = await makeUser(db)
    const s = await createSession(db, u.id, now)
    expect(await userFromSession(db, s.token, new Date(now.getTime() + 31 * 86_400_000))).toBeNull()
  })

  it('token rác trả null', async () => {
    expect(await userFromSession(db, 'khong-ton-tai', now)).toBeNull()
  })
})

describe('deactivateUser', () => {
  it('admin vô hiệu hóa → session chết ngay, token connector bị thu hồi', async () => {
    const admin = await makeUser(db, { role: 'admin' })
    const u = await makeUser(db)
    const s = await createSession(db, u.id, now)
    await db.insert(oauthTokens).values({
      userId: u.id, clientId: 'c', clientName: 'Claude', accessHash: 'a', refreshHash: 'r',
      accessExpiresAt: now, refreshExpiresAt: now,
    })
    await deactivateUser(db, admin, u.id, now)
    expect(await userFromSession(db, s.token, now)).toBeNull()
    const [t] = await db.select().from(oauthTokens).where(eq(oauthTokens.userId, u.id))
    expect(t.revokedAt).not.toBeNull()
  })

  it('người thường không vô hiệu hóa được ai', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await expect(deactivateUser(db, a, b.id, now)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('admin không tự vô hiệu hóa mình; id lạ → not_found', async () => {
    const admin = await makeUser(db, { role: 'admin' })
    await expect(deactivateUser(db, admin, admin.id, now)).rejects.toMatchObject({ code: 'invalid' })
    await expect(deactivateUser(db, admin, crypto.randomUUID(), now)).rejects.toMatchObject({ code: 'not_found' })
    await expect(deactivateUser(db, admin, 'khong-phai-uuid', now)).rejects.toMatchObject({ code: 'not_found' })
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/users.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/core/tokens.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'

export const newToken = (): string => randomBytes(32).toString('base64url')
export const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex')
export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
```

- [ ] **Step 4: Viết `server/core/users.ts`**

```ts
import { and, eq, isNull } from 'drizzle-orm'
import type { MeDTO } from '../../shared/dto.js'
import { oauthTokens, sessions, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { forbidden, invalid, notFound } from './errors.js'
import { isUuid } from './tokens.js'

export type User = typeof users.$inferSelect

export interface GoogleProfile {
  email: string
  emailVerified: boolean
  hd: string | null
  name: string
  picture: string | null
}

export interface AuthPolicy {
  allowedDomain: string
  adminEmails: string[]
}

export type SignInResult = { ok: true; user: User } | { ok: false; reason: 'unverified' | 'domain' | 'inactive' }

export async function signInWithGoogle(db: Db, p: GoogleProfile, policy: AuthPolicy): Promise<SignInResult> {
  const email = p.email.trim().toLowerCase()
  if (!p.emailVerified) return { ok: false, reason: 'unverified' }
  if (!email.endsWith(`@${policy.allowedDomain}`) || p.hd !== policy.allowedDomain) return { ok: false, reason: 'domain' }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing && !existing.active) return { ok: false, reason: 'inactive' }

  const role = policy.adminEmails.includes(email) ? 'admin' : 'member'
  const name = p.name.trim() || email
  const [user] = await db
    .insert(users)
    .values({ email, name, avatarUrl: p.picture, role })
    .onConflictDoUpdate({ target: users.email, set: { name, avatarUrl: p.picture, role } })
    .returning()
  return { ok: true, user }
}

export async function deactivateUser(db: Db, actor: User, targetId: string, now: Date): Promise<void> {
  if (actor.role !== 'admin') throw forbidden('Chỉ admin mới vô hiệu hóa được người dùng')
  if (actor.id === targetId) throw invalid('Không thể tự vô hiệu hóa chính mình')
  if (!isUuid(targetId)) throw notFound('Không tìm thấy người dùng')

  await db.transaction(async (tx) => {
    const done = await tx.update(users).set({ active: false }).where(eq(users.id, targetId)).returning({ id: users.id })
    if (done.length === 0) throw notFound('Không tìm thấy người dùng')
    await tx.delete(sessions).where(eq(sessions.userId, targetId))
    await tx
      .update(oauthTokens)
      .set({ revokedAt: now })
      .where(and(eq(oauthTokens.userId, targetId), isNull(oauthTokens.revokedAt)))
  })
}

export function toMeDTO(u: User): MeDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    team: u.team,
    role: u.role,
    workDays: u.workDays,
    workStart: u.workStart,
    workEnd: u.workEnd,
  }
}
```

- [ ] **Step 5: Viết `server/core/sessions.ts`**

```ts
import { and, eq, gt } from 'drizzle-orm'
import { sessions, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { hashToken, newToken } from './tokens.js'
import type { User } from './users.js'

export const SESSION_DAYS = 30

export async function createSession(db: Db, userId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000)
  await db.insert(sessions).values({ idHash: hashToken(token), userId, expiresAt })
  return { token, expiresAt }
}

export async function userFromSession(db: Db, token: string, now: Date): Promise<User | null> {
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, hashToken(token)), gt(sessions.expiresAt, now), eq(users.active, true)))
    .limit(1)
  return rows[0]?.user ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)))
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run server/core/users.test.ts`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add server/core
git commit -m "feat: đăng nhập Google theo domain, session, vô hiệu hóa người dùng"
```

---

### Task 6: Đọc dữ liệu — danh sách người và không gian một người

**Files:**
- Create: `server/core/dto.ts`, `server/core/workspace.ts`, `server/core/workspace.test.ts`

**Interfaces:**
- Consumes: `Db`, mọi bảng, `vnWeek`, `notFound`, `isUuid`, `User`.
- Produces:
  - `ONLINE_WINDOW_MS = 30 * 60_000`; `presenceOf(lastSeenAt: Date | null, now: Date): Presence`
  - `formatDuration(ms: number | null): string`
  - `primaryAction(t: Pick<TaskRow, 'state' | 'actions'>): PrimaryAction`
  - `toTaskDTO(row: TaskRow, i: number, runs: RunRow[], cmds: CommandRow[]): TaskDTO`
  - `deriveConnections(rows: TaskRow[]): ConnectionDTO[]`
  - `listPeople(db, now): Promise<PersonDTO[]>`
  - `getWorkspace(db, viewer: User, ownerId: string, now: Date): Promise<WorkspaceDTO>`

- [ ] **Step 1: Viết test `server/core/workspace.test.ts`**

```ts
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
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/workspace.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/core/dto.ts`**

```ts
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
```

- [ ] **Step 4: Viết `server/core/workspace.ts`**

```ts
import { asc, desc, eq } from 'drizzle-orm'
import type { PersonDTO, Presence, ReflectDTO, WorkspaceDTO } from '../../shared/dto.js'
import { TASK_STATES, type TaskState } from '../../shared/schema.js'
import { activity, commands, runs, tasks, users, weeklyReports } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { deriveConnections, toTaskDTO, type TaskRow } from './dto.js'
import { notFound } from './errors.js'
import { vnWeek } from './time.js'
import { isUuid } from './tokens.js'
import type { User } from './users.js'

export const ONLINE_WINDOW_MS = 30 * 60_000
const RECENT = 10
const ACTIVITY_LIMIT = 30

export function presenceOf(lastSeenAt: Date | null, now: Date): Presence {
  if (!lastSeenAt) return 'never'
  return now.getTime() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS ? 'online' : 'offline'
}

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
    presence: presenceOf(u.lastSeenAt, now),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
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
  const [y, w] = r.week.split('-W').map(Number)
  // Thứ 5 của tuần ISO luôn nằm trong năm ISO → lấy mốc đó để vnWeek tính range.
  const jan4 = Date.UTC(y, 0, 4)
  const week1Mon = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000
  const thursday = new Date(week1Mon + ((w - 1) * 7 + 3) * 86_400_000 + 5 * 3_600_000)
  return {
    week: w,
    weekKey: r.week,
    range: vnWeek(thursday).range,
    summary: r.summary,
    good: r.good,
    bad: r.bad,
    next: r.next,
    pattern: r.pattern,
    submittedAt: r.submittedAt.toISOString(),
  }
}
```

- [ ] **Step 5: Chạy test**

Run: `npx vitest run server/core/workspace.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Typecheck và commit**

Run: `npx tsc -b`
Expected: sạch.

```bash
git add server/core
git commit -m "feat: đọc danh sách đồng nghiệp và không gian một người"
```

---

### Task 7: HTTP — app Hono, /auth, /api, cấu hình, Google

**Files:**
- Create: `server/config.ts`, `server/http/google.ts`, `server/http/app.ts`, `server/http/auth.ts`, `server/http/api.ts`, `server/http/app.test.ts`

**Interfaces:**
- Consumes: mọi hàm core ở Task 5–6.
- Produces:
  - `interface Config { publicUrl: string; allowedDomain: string; adminEmails: string[]; googleClientId: string; googleClientSecret: string; secureCookies: boolean; devLogin: boolean }`; `loadConfig(env?): Config`
  - `interface GoogleAuth { authorizeUrl(state: string, verifier: string): URL; exchange(code: string, verifier: string): Promise<GoogleProfile> }`; `createGoogleAuth(cfg: Config): GoogleAuth`
  - `interface AppDeps { db: Db; config: Config; google: GoogleAuth; now: () => Date }`
  - `type AppEnv = { Variables: { user: User } }`
  - `createApp(deps: AppDeps): Hono<AppEnv>`
  - `sessionCookieName(cfg: Config): string` — `__Host-ws_session` khi https, `ws_session` khi http
  - `requireUser(deps)` middleware, `sameOrigin(deps)` middleware (dùng lại ở kế hoạch 2–3)
  - `safeNext(n: string | undefined): string`
  - Routes: `GET /auth/google?next=`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/dev?email=` (chỉ khi `devLogin`), `GET /api/me`, `GET /api/people`, `GET /api/workspace/:id` (`me` = chính mình), `POST /api/admin/users/:id/deactivate`

- [ ] **Step 1: Viết test `server/http/app.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import type { Db } from '../db/types.js'
import { createSession } from '../core/sessions.js'
import type { GoogleProfile } from '../core/users.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { createApp, safeNext } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: ['boss@bravebits.vn'],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
let nextProfile: GoogleProfile
const google = {
  authorizeUrl: (state: string) => new URL(`https://accounts.google.test/auth?state=${state}`),
  exchange: async () => nextProfile,
}

let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now })
  nextProfile = { email: 'an@bravebits.vn', emailVerified: true, hd: 'bravebits.vn', name: 'An', picture: null }
})

const cookieOf = (res: Response, name: string) => {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  return raw?.split(';')[0]
}
async function loggedIn(over = {}) {
  const u = await makeUser(db, over)
  const s = await createSession(db, u.id, now)
  return { user: u, cookie: `__Host-ws_session=${s.token}` }
}

describe('safeNext', () => {
  it.each([[undefined, '/'], ['/x?y=1', '/x?y=1'], ['//evil.com', '/'], ['/\\evil.com', '/'], ['https://evil.com', '/'], ['x', '/']])('%s → %s', (a, b) =>
    expect(safeNext(a)).toBe(b))
})

describe('/auth/google', () => {
  it('chuyển sang Google và đặt cookie state', async () => {
    const res = await app.request('/auth/google?next=/team')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.test\/auth\?state=/)
    expect(cookieOf(res, 'ws_oauth')).toBeTruthy()
  })

  it('callback thành công → tạo session, về đúng next', async () => {
    const start = await app.request('/auth/google?next=/team')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const res = await app.request(`/auth/google/callback?code=c&state=${state}`, { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/team')
    const sc = res.headers.getSetCookie().find((c) => c.startsWith('__Host-ws_session='))!
    expect(sc).toMatch(/HttpOnly/i)
    expect(sc).toMatch(/Secure/i)
    expect(sc).toMatch(/SameSite=Lax/i)
  })

  it('state sai → /login?error=state', async () => {
    const start = await app.request('/auth/google')
    const res = await app.request('/auth/google/callback?code=c&state=sai', { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.headers.get('location')).toBe('/login?error=state')
  })

  it('email ngoài domain → /login?error=domain', async () => {
    nextProfile = { ...nextProfile, email: 'x@gmail.com', hd: null }
    const start = await app.request('/auth/google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const res = await app.request(`/auth/google/callback?code=c&state=${state}`, { headers: { cookie: cookieOf(start, 'ws_oauth')! } })
    expect(res.headers.get('location')).toBe('/login?error=domain')
  })

  it('/auth/dev không tồn tại khi devLogin=false', async () => {
    expect((await app.request('/auth/dev?email=an@bravebits.vn')).status).toBe(404)
  })
})

describe('/api', () => {
  it('chưa đăng nhập → 401 JSON', async () => {
    const res = await app.request('/api/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('/api/me trả MeDTO', async () => {
    const { cookie, user } = await loggedIn({ name: 'An' })
    const res = await app.request('/api/me', { headers: { cookie } })
    expect(await res.json()).toMatchObject({ id: user.id, name: 'An', role: 'member' })
  })

  it('/api/people và /api/workspace/:id cho xem đồng nghiệp', async () => {
    const { cookie } = await loggedIn()
    const an = await makeUser(db, { name: 'An' })
    await makeTask(db, an.id, { slug: 'upsell' })
    const people = await (await app.request('/api/people', { headers: { cookie } })).json()
    expect(people).toHaveLength(2)
    const ws = await (await app.request(`/api/workspace/${an.id}`, { headers: { cookie } })).json()
    expect(ws).toMatchObject({ isMine: false, tasks: [{ id: 'upsell' }] })
    const mine = await (await app.request('/api/workspace/me', { headers: { cookie } })).json()
    expect(mine.isMine).toBe(true)
  })

  it('workspace id rác → 404', async () => {
    const { cookie } = await loggedIn()
    expect((await app.request('/api/workspace/abc', { headers: { cookie } })).status).toBe(404)
  })

  it('người bị vô hiệu hóa còn cookie → 401', async () => {
    const { cookie } = await loggedIn({ active: false })
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401)
  })

  it('POST thiếu/ sai Origin → 403 (chống CSRF)', async () => {
    const { cookie } = await loggedIn({ role: 'admin' })
    const b = await makeUser(db)
    const bad = await app.request(`/api/admin/users/${b.id}/deactivate`, { method: 'POST', headers: { cookie, origin: 'https://evil.test' } })
    expect(bad.status).toBe(403)
    const ok = await app.request(`/api/admin/users/${b.id}/deactivate`, { method: 'POST', headers: { cookie, origin: 'https://ws.test' } })
    expect(ok.status).toBe(200)
  })

  it('logout xóa session', async () => {
    const { cookie } = await loggedIn()
    const res = await app.request('/auth/logout', { method: 'POST', headers: { cookie, origin: 'https://ws.test' } })
    expect(res.status).toBe(200)
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401)
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/http`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/config.ts`**

```ts
export interface Config {
  publicUrl: string
  allowedDomain: string
  adminEmails: string[]
  googleClientId: string
  googleClientSecret: string
  secureCookies: boolean
  devLogin: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Thiếu biến môi trường ${k}`)
    return v
  }
  const publicUrl = need('PUBLIC_URL').replace(/\/+$/, '')
  const isLocal = publicUrl.startsWith('http://localhost') || publicUrl.startsWith('http://127.0.0.1')
  return {
    publicUrl,
    allowedDomain: (env.ALLOWED_DOMAIN ?? 'bravebits.vn').toLowerCase(),
    adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    googleClientId: isLocal && env.DEV_LOGIN === '1' ? env.GOOGLE_CLIENT_ID ?? '' : need('GOOGLE_CLIENT_ID'),
    googleClientSecret: isLocal && env.DEV_LOGIN === '1' ? env.GOOGLE_CLIENT_SECRET ?? '' : need('GOOGLE_CLIENT_SECRET'),
    secureCookies: publicUrl.startsWith('https://'),
    // Đăng nhập không cần Google, CHỈ cho máy local qua http — không thể bật trên production (https).
    devLogin: isLocal && env.DEV_LOGIN === '1',
  }
}
```

- [ ] **Step 4: Viết `server/http/google.ts`**

```ts
import { Google, decodeIdToken } from 'arctic'
import type { Config } from '../config.js'
import type { GoogleProfile } from '../core/users.js'

export interface GoogleAuth {
  authorizeUrl(state: string, verifier: string): URL
  exchange(code: string, verifier: string): Promise<GoogleProfile>
}

export function createGoogleAuth(cfg: Config): GoogleAuth {
  const g = new Google(cfg.googleClientId, cfg.googleClientSecret, `${cfg.publicUrl}/auth/google/callback`)
  return {
    authorizeUrl(state, verifier) {
      const url = g.createAuthorizationURL(state, verifier, ['openid', 'email', 'profile'])
      url.searchParams.set('hd', cfg.allowedDomain)
      url.searchParams.set('prompt', 'select_account')
      return url
    },
    async exchange(code, verifier) {
      const tokens = await g.validateAuthorizationCode(code, verifier)
      // ID token nhận trực tiếp từ Google qua TLS ở bước đổi code → không cần tự kiểm chữ ký (OIDC Core 3.1.3.7).
      const c = decodeIdToken(tokens.idToken()) as Record<string, unknown>
      return {
        email: typeof c.email === 'string' ? c.email : '',
        emailVerified: c.email_verified === true,
        hd: typeof c.hd === 'string' ? c.hd : null,
        name: typeof c.name === 'string' ? c.name : '',
        picture: typeof c.picture === 'string' ? c.picture : null,
      }
    },
  }
}
```

- [ ] **Step 5: Viết `server/http/app.ts`**

```ts
import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Config } from '../config.js'
import { AppError, forbidden, unauthorized } from '../core/errors.js'
import { userFromSession } from '../core/sessions.js'
import type { User } from '../core/users.js'
import type { Db } from '../db/types.js'
import { apiRoutes } from './api.js'
import { authRoutes } from './auth.js'
import type { GoogleAuth } from './google.js'

export interface AppDeps {
  db: Db
  config: Config
  google: GoogleAuth
  now: () => Date
}

export type AppEnv = { Variables: { user: User } }

export const sessionCookieName = (cfg: Config) => (cfg.secureCookies ? '__Host-ws_session' : 'ws_session')

export function safeNext(n: string | undefined): string {
  if (!n || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\')) return '/'
  return n
}

export function requireUser(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) throw unauthorized()
    c.set('user', user)
    await next()
  }
}

/** Chống CSRF: mọi request ghi từ trình duyệt phải đến từ chính origin của app. */
export function sameOrigin(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const origin = new URL(deps.config.publicUrl).origin
  return async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== origin) {
      throw forbidden('Yêu cầu không đến từ Work System')
    }
    await next()
  }
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.code, message: err.message }, err.status as ContentfulStatusCode)
    console.error(err)
    return c.json({ error: 'internal', message: 'Máy chủ gặp lỗi, thử lại sau ít phút' }, 500)
  })
  app.notFound((c) => c.json({ error: 'not_found', message: 'Không có đường dẫn này' }, 404))
  app.route('/auth', authRoutes(deps))
  app.route('/api', apiRoutes(deps))
  return app
}
```

- [ ] **Step 6: Viết `server/http/auth.ts`**

```ts
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createSession, deleteSession, SESSION_DAYS } from '../core/sessions.js'
import { newToken } from '../core/tokens.js'
import { signInWithGoogle, type GoogleProfile } from '../core/users.js'
import { safeNext, sameOrigin, sessionCookieName, type AppDeps, type AppEnv } from './app.js'

const FLOW_COOKIE = 'ws_oauth'

export function authRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  const { config } = deps
  const flowOpts = { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax' as const, path: '/auth', maxAge: 600 }

  async function finish(c: Parameters<Parameters<typeof r.get>[1]>[0], profile: GoogleProfile, next: string) {
    const res = await signInWithGoogle(deps.db, profile, config)
    if (!res.ok) return c.redirect(`/login?error=${res.reason}`)
    const s = await createSession(deps.db, res.user.id, deps.now())
    setCookie(c, sessionCookieName(config), s.token, {
      httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86_400,
    })
    return c.redirect(next)
  }

  r.get('/google', (c) => {
    const state = newToken()
    const verifier = newToken()
    setCookie(c, FLOW_COOKIE, JSON.stringify({ state, verifier, next: safeNext(c.req.query('next')) }), flowOpts)
    return c.redirect(deps.google.authorizeUrl(state, verifier).toString())
  })

  r.get('/google/callback', async (c) => {
    const raw = getCookie(c, FLOW_COOKIE)
    deleteCookie(c, FLOW_COOKIE, { path: '/auth', secure: config.secureCookies })
    let flow: { state: string; verifier: string; next: string } | null = null
    try {
      flow = raw ? JSON.parse(raw) : null
    } catch {
      flow = null
    }
    if (!flow || flow.state !== c.req.query('state')) return c.redirect('/login?error=state')
    const code = c.req.query('code')
    if (!code) return c.redirect('/login?error=cancelled')
    let profile: GoogleProfile
    try {
      profile = await deps.google.exchange(code, flow.verifier)
    } catch (e) {
      console.error('Google exchange lỗi', e)
      return c.redirect('/login?error=google')
    }
    return finish(c, profile, safeNext(flow.next))
  })

  if (config.devLogin) {
    r.get('/dev', (c) =>
      finish(c, { email: c.req.query('email') ?? '', emailVerified: true, hd: config.allowedDomain, name: c.req.query('name') ?? '', picture: null }, safeNext(c.req.query('next'))),
    )
  }

  r.post('/logout', sameOrigin(deps), async (c) => {
    const name = sessionCookieName(config)
    const token = getCookie(c, name)
    if (token) await deleteSession(deps.db, token)
    deleteCookie(c, name, { path: '/', secure: config.secureCookies })
    return c.json({ ok: true })
  })

  return r
}
```

Nếu kiểu `Parameters<Parameters<typeof r.get>[1]>[0]` không suy ra được, thay bằng `import type { Context } from 'hono'` và `c: Context<AppEnv>`.

- [ ] **Step 7: Viết `server/http/api.ts`**

```ts
import { Hono } from 'hono'
import { deactivateUser, toMeDTO } from '../core/users.js'
import { getWorkspace, listPeople } from '../core/workspace.js'
import { requireUser, sameOrigin, type AppDeps, type AppEnv } from './app.js'

export function apiRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  r.use('*', requireUser(deps))
  r.use('*', sameOrigin(deps))

  r.get('/me', (c) => c.json(toMeDTO(c.get('user'))))

  r.get('/people', async (c) => c.json(await listPeople(deps.db, deps.now())))

  r.get('/workspace/:id', async (c) => {
    const viewer = c.get('user')
    const id = c.req.param('id')
    return c.json(await getWorkspace(deps.db, viewer, id === 'me' ? viewer.id : id, deps.now()))
  })

  r.post('/admin/users/:id/deactivate', async (c) => {
    await deactivateUser(deps.db, c.get('user'), c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })

  return r
}
```

Lưu ý thứ tự: `requireUser` chạy trước `sameOrigin`, nên request ghi chưa đăng nhập nhận 401, đã đăng nhập mà sai origin nhận 403 — đúng như test.

- [ ] **Step 8: Chạy test**

Run: `npx vitest run server/http`
Expected: tất cả PASS. Nếu `app.request` không trả `getSetCookie`, dùng Node ≥ 22 (đã ràng buộc).

- [ ] **Step 9: Typecheck, chạy toàn bộ test, commit**

Run: `npx tsc -b && npm test`
Expected: sạch, mọi test PASS.

```bash
git add server/config.ts server/http
git commit -m "feat: HTTP — đăng nhập Google, session cookie, API đọc, chống CSRF"
```

---

### Task 8: Chạy được — Vercel entry, dev server, dữ liệu mẫu

**Files:**
- Create: `api/router.ts`, `vercel.json`, `server/dev.ts`, `server/seed.ts`, `.env.example`
- Move: `public/data/*` → `server/seed-data/*` (gỡ khỏi bản build công khai)
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `createApp`, `loadConfig`, `createGoogleAuth`, `createNeonDb`, `openPglite`, `nextRunAfter`, `vnWeek`, schema zod.
- Produces: `npm run dev` (web + backend một cổng 5173), `npm run seed [-- --demo]`, deploy Vercel.

- [ ] **Step 1: Chuyển dữ liệu mẫu ra khỏi `public/`**

```bash
mkdir -p server/seed-data
git mv public/data/* server/seed-data/
rmdir public/data
```

- [ ] **Step 2: Viết `server/seed.ts`**

```ts
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
```

- [ ] **Step 3: Viết `server/dev.ts`**

```ts
import type { Hono } from 'hono'
import { loadConfig } from './config.js'
import { createNeonDb } from './db/neon.js'
import { openPglite } from './db/pglite.js'
import type { Db } from './db/types.js'
import { createApp, type AppEnv } from './http/app.js'
import { createGoogleAuth } from './http/google.js'

const g = globalThis as typeof globalThis & { __wsDevDb?: Promise<Db> }

/** Vite có thể nạp lại module này; giữ một DB duy nhất để PGlite không mở trùng thư mục. */
function devDb(): Promise<Db> {
  const url = process.env.DATABASE_URL
  g.__wsDevDb ??= url ? Promise.resolve(createNeonDb(url)) : openPglite(process.env.PGLITE_DIR ?? '.pglite')
  return g.__wsDevDb
}

export async function getDevApp(): Promise<Hono<AppEnv>> {
  const config = loadConfig()
  return createApp({ db: await devDb(), config, google: createGoogleAuth(config), now: () => new Date() })
}
```

- [ ] **Step 4: Sửa `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { getRequestListener } from '@hono/node-server'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const BACKEND = /^\/(api|auth|mcp|oauth|\.well-known)(\/|\?|$)/

/** Gắn backend Hono vào Vite dev server — một lệnh `npm run dev` chạy cả hai. */
function devBackend(): Plugin {
  return {
    name: 'work-system-backend',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !BACKEND.test(req.url)) return next()
        try {
          const mod = (await server.ssrLoadModule('/server/dev.ts')) as typeof import('./server/dev')
          const app = await mod.getDevApp()
          await getRequestListener(app.fetch)(req, res)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), devBackend()] }
})
```

Nếu `tsconfig.node.json` không bao gồm `server/dev.ts` và báo lỗi kiểu ở `typeof import('./server/dev')`, thay bằng kiểu `{ getDevApp: () => Promise<{ fetch: (r: Request) => Response | Promise<Response> }> }`.

- [ ] **Step 5: Viết `api/router.ts`**

```ts
import { loadConfig } from '../server/config.js'
import { createNeonDb } from '../server/db/neon.js'
import { createApp } from '../server/http/app.js'
import { createGoogleAuth } from '../server/http/google.js'

const config = loadConfig()
const url = process.env.DATABASE_URL
if (!url) throw new Error('Thiếu biến môi trường DATABASE_URL')
const app = createApp({ db: createNeonDb(url), config, google: createGoogleAuth(config), now: () => new Date() })

/** vercel.json rewrite mọi đường dẫn backend về đây kèm `__p` = đường dẫn gốc. */
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const original = url.searchParams.get('__p')
  if (original) {
    url.searchParams.delete('__p')
    url.pathname = original
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()
  return app.fetch(new Request(url, { method: req.method, headers: req.headers, body }))
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS }
```

- [ ] **Step 6: Viết `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/router", "destination": "/api/router" },
    { "source": "/api/:path*", "destination": "/api/router?__p=/api/:path*" },
    { "source": "/auth/:path*", "destination": "/api/router?__p=/auth/:path*" },
    { "source": "/oauth/:path*", "destination": "/api/router?__p=/oauth/:path*" },
    { "source": "/mcp", "destination": "/api/router?__p=/mcp" },
    { "source": "/.well-known/:path*", "destination": "/api/router?__p=/.well-known/:path*" },
    { "source": "/((?!assets/|favicon\\.svg|icons\\.svg).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 7: Viết `.env.example`**

```bash
# Địa chỉ công khai của app (dev: http://localhost:5173)
PUBLIC_URL=http://localhost:5173
ALLOWED_DOMAIN=bravebits.vn
ADMIN_EMAILS=tutnv@bravebits.vn

# Google Cloud Console → APIs & Services → Credentials → OAuth client (Web)
# Authorized redirect URI: <PUBLIC_URL>/auth/google/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Production: do Vercel Storage (Neon) tự gắn. Dev: bỏ trống để dùng PGlite trong .pglite/
DATABASE_URL=

# Chỉ dev (http://localhost): đăng nhập không cần Google qua /auth/dev?email=...
DEV_LOGIN=1
```

- [ ] **Step 8: Chạy thử local**

```bash
cp .env.example .env
npm run seed -- --demo
npm run dev
```

Kiểm tra bằng curl ở terminal khác:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/api/me        # Expected: 401
curl -s -c /tmp/ws.txt -o /dev/null -w "%{http_code}\n" "http://localhost:5173/auth/dev?email=tutnv@bravebits.vn&name=Logan"   # Expected: 302
curl -s -b /tmp/ws.txt http://localhost:5173/api/workspace/me | head -c 300   # Expected: JSON có "isMine":true và 4 task
curl -s -b /tmp/ws.txt http://localhost:5173/api/people | head -c 300         # Expected: 3 người (Logan + 2 demo)
```

- [ ] **Step 9: Commit**

```bash
git add -A api vercel.json server/dev.ts server/seed.ts server/seed-data vite.config.ts .env.example public
git commit -m "feat: chạy local một lệnh, Vercel entry, dữ liệu mẫu ra khỏi public"
```

---

### Task 9: Web — cổng đăng nhập, dữ liệu từ API, chế độ chỉ đọc

**Files:**
- Create: `src/lib/api.ts`, `src/lib/usePoll.ts`, `src/components/Login.tsx`
- Modify: `src/lib/types.ts` (thay toàn bộ), `src/lib/data.ts` (thay toàn bộ), `src/lib/format.ts`, `src/App.tsx` (viết lại), `src/components/Desk.tsx`, `src/components/TaskSpace.tsx`, `src/components/Schedule.tsx`, `src/components/Reflect.tsx`, `src/components/Connections.tsx`, `index.html`

**Interfaces:**
- Consumes: `GET /api/me`, `GET /api/people`, `GET /api/workspace/:id`, `POST /auth/logout`, DTO từ `shared/dto.ts`.
- Produces: `ApiError` (`status`, `code`), `api<T>(path, init?)`; `loadMe()`, `loadPeople()`, `loadWorkspace(id)`, `logout()`; `usePoll(fn, ms)`; `Desk`/`TaskSpace` nhận thêm `readOnly: boolean`, `who: string`; `Reflect` nhận `reflect: Reflect | null`.

- [ ] **Step 1: Thay `src/lib/types.ts`**

```ts
export type {
  ActivityDTO as ActivityEvent,
  CommandDTO as Command,
  ConnectionDTO as Connection,
  MeDTO as Me,
  PersonDTO as Person,
  Presence,
  ReflectDTO as Reflect,
  RunDTO as Run,
  TaskDTO as Task,
  WeekDTO as Week,
  WorkspaceDTO as Workspace,
} from '../../shared/dto'
export type { Block, Metric, Milestone, SourceKind, TaskState } from '../../shared/schema'
export type ReflectNote = import('../../shared/schema').ReflectNote
```

- [ ] **Step 2: Viết `src/lib/api.ts`**

```ts
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http', body?.message ?? `Lỗi ${res.status}`)
  return body as T
}
```

- [ ] **Step 3: Thay `src/lib/data.ts`**

```ts
import { api } from './api'
import type { Me, Person, Workspace } from './types'

export const loadMe = () => api<Me>('/api/me')
export const loadPeople = () => api<Person[]>('/api/people')
export const loadWorkspace = (id: string) => api<Workspace>(`/api/workspace/${encodeURIComponent(id)}`)
export const logout = () => api<{ ok: true }>('/auth/logout', { method: 'POST' })
```

- [ ] **Step 4: Viết `src/lib/usePoll.ts`**

```ts
import { useEffect, useRef } from 'react'

/** Gọi `fn` mỗi `ms` khi tab đang hiển thị; gọi ngay khi người dùng quay lại tab. */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let id: number | undefined
    const start = () => {
      stop()
      id = window.setInterval(() => ref.current(), ms)
    }
    const stop = () => {
      if (id !== undefined) window.clearInterval(id)
      id = undefined
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        ref.current()
        start()
      } else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms])
}
```

- [ ] **Step 5: Sửa `src/lib/format.ts` — giờ VN và chịu được null**

Thay các hàm `clock`, `dayAndClock`, `shortDate`, `ago`, `until` bằng:

```ts
const TZ = 'Asia/Ho_Chi_Minh'
const parts = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  )
  return { wd: p.weekday as string, d: p.day as string, m: p.month as string, hh: p.hour as string, mm: p.minute as string }
}
const WD: Record<string, string> = { Sun: 'CN', Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7' }

export function clock(iso: string): string {
  const p = parts(iso)
  return `${p.hh}:${p.mm}`
}

export function dayAndClock(iso: string | null): string {
  if (!iso) return 'chưa có lịch'
  const p = parts(iso)
  return `${WD[p.wd]} ${p.d}/${p.m} · ${p.hh}:${p.mm}`
}

export function shortDate(iso: string): string {
  const p = parts(iso.length === 10 ? `${iso}T12:00:00+07:00` : iso)
  return `${p.d}/${p.m}`
}

/** "2 giờ trước", "hôm qua" — mốc thời gian tương đối, tiếng Việt. */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return 'chưa chạy lần nào'
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'hôm qua'
  return `${days} ngày trước`
}

/** Đếm ngược tới lần chạy kế tiếp. */
export function until(iso: string | null, now: Date): string {
  if (!iso) return '—'
  const secs = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  if (secs <= 0) return 'đến hạn'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}n ${h}g`
  if (h > 0) return `${h}g ${String(m).padStart(2, '0')}p`
  return `${m}p ${String(s).padStart(2, '0')}s`
}
```

Giữ nguyên `tone` và `TONE_HEX`. Xóa hằng `DAYS` cũ.

- [ ] **Step 6: Sửa các component cho null-safe và chỉ đọc**

`src/components/Desk.tsx`:
- Props thêm `readOnly: boolean` và `who: string` (`'bạn'` hoặc tên đồng nghiệp).
- Trong `Strip`, thêm prop `readOnly`; bọc `<Key …/>` bằng `{!readOnly && (…)}`.
- Đổi `const pct = Math.round((task.progress.done / task.progress.total) * 100)` thành `const pct = task.progress.total > 0 ? Math.round((task.progress.done / task.progress.total) * 100) : 0`.
- Đổi `upcoming` để bỏ task không có lịch:

```ts
  const upcoming = tasks
    .filter((t): t is typeof t & { nextRun: string } => !!t.nextRun && !t.paused)
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
    .slice(0, 4)
```

- Thay tiêu đề hero:

```tsx
        <h1 className="hero__line rise">
          {tasks.length === 0 ? (
            <>{who === 'bạn' ? 'Bạn chưa có task nào' : `${who} chưa có task nào`}</>
          ) : waiting.length > 0 ? (
            <>
              <em>{count} việc</em> đang chờ {who} quyết
            </>
          ) : (
            <>{tasks.length} việc đang tự chạy, không việc nào cần {who}</>
          )}
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          {tasks.length === 0
            ? who === 'bạn'
              ? 'Mở Claude và nói "tạo task mới" — skill tao-task sẽ hỏi bạn vài câu rồi đưa task lên đây.'
              : 'Khi họ tạo task bằng Claude, task sẽ xuất hiện ở đây.'
            : waiting.length > 0
              ? `${waiting.map((t) => t.name).join(' và ')} không đi tiếp được nếu không có ${who}. Những việc còn lại vẫn chạy theo lịch.`
              : 'Mọi task đều chạy đúng lịch và không báo lỗi nào.'}
        </p>
```

- Truyền `readOnly` xuống: `<Strip … readOnly={readOnly} />`.
- Đổi điều kiện cảnh báo dưới "Sắp chạy" thành `tasks.some((t) => t.state === 'blocked')` (giữ), và đổi chữ thành: `Có task đang dừng vì lỗi. Lịch vẫn chạy nhưng việc ở bước lỗi chưa được làm.`

`src/components/TaskSpace.tsx`:
- Props thêm `readOnly: boolean`; nút back nhận nhãn `backLabel: string`.
- Bọc `<div className="space__act">…</div>` bằng `{!readOnly && (…)}`.
- `Báo cáo`: nếu `!task.report.headline && task.report.body.length === 0` thì hiện `<article className="paper"><p className="paper__lede">Chưa có báo cáo. Báo cáo xuất hiện sau lần chạy đầu tiên.</p></article>` thay cho bài báo cáo; ẩn mục "Đang tắc ở đâu" khi `blockers` rỗng.
- `Lần chạy`: khi `task.runs.length === 0` hiện `<p className="sec__note">Chưa có lần chạy nào.</p>`.

`src/components/Schedule.tsx`, `src/components/Connections.tsx`: mọi chỗ dùng `t.nextRun`/`t.lastRun` đi qua `dayAndClock`/`ago`/`until` (đã chịu null). Sắp xếp theo `nextRun` dùng `new Date(t.nextRun ?? 8.64e15).getTime()`.

`src/components/Reflect.tsx`: nhận `reflect: ReflectData | null`; khi `null` trả:

```tsx
    return (
      <div className="wrap">
        <header className="pagehead">
          <h1 className="sec">Nhìn lại tuần</h1>
          <p className="sec__note">Chưa có báo cáo tuần nào. Claude sẽ nộp báo cáo khi task "bao-cao-tuan" chạy, thường vào chiều thứ 6.</p>
        </header>
      </div>
    )
```

- [ ] **Step 7: Viết `src/components/Login.tsx`**

```tsx
const REASONS: Record<string, string> = {
  domain: 'Chỉ email @bravebits.vn mới vào được Work System.',
  unverified: 'Email Google này chưa được xác minh.',
  inactive: 'Tài khoản đã bị vô hiệu hóa. Liên hệ admin nếu đây là nhầm lẫn.',
  state: 'Phiên đăng nhập đã hết hạn, thử lại nhé.',
  cancelled: 'Bạn đã hủy đăng nhập.',
  google: 'Google không phản hồi, thử lại sau ít phút.',
}

export default function Login({ error }: { error: string | null }) {
  const next = new URLSearchParams(window.location.search).get('next') ?? '/'
  return (
    <main className="login">
      <div className="login__card rise">
        <div className="login__mark">W</div>
        <h1 className="login__title">Work System</h1>
        <p className="login__lede">Bàn điều phối của team — mọi việc Claude đang chạy cho bạn, ở một chỗ.</p>
        {error && (
          <p className="login__error" role="alert">
            {REASONS[error] ?? 'Đăng nhập không thành công, thử lại nhé.'}
          </p>
        )}
        <a className="login__btn" href={`/auth/google?next=${encodeURIComponent(next)}`}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Đăng nhập bằng Google
        </a>
        <p className="login__fine">Chỉ dành cho tài khoản @bravebits.vn</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Viết lại `src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Me, Person, Task, Workspace } from './lib/types'
import { ApiError } from './lib/api'
import { loadMe, loadPeople, loadWorkspace, logout } from './lib/data'
import { usePoll } from './lib/usePoll'
import { clock } from './lib/format'
import Desk from './components/Desk'
import TaskSpace from './components/TaskSpace'
import Schedule from './components/Schedule'
import Connections from './components/Connections'
import Reflect from './components/Reflect'
import Team from './components/Team'
import Login from './components/Login'
import { IconDesk, IconClock, IconPlug, IconThink, IconTeam } from './components/Icons'

type View = 'desk' | 'team' | 'schedule' | 'connections' | 'reflect'

const NAV: { id: View; label: string; Icon: () => ReactElement }[] = [
  { id: 'desk', label: 'Bàn điều phối', Icon: IconDesk },
  { id: 'team', label: 'Đội ngũ', Icon: IconTeam },
  { id: 'schedule', label: 'Lịch chạy', Icon: IconClock },
  { id: 'connections', label: 'Kết nối', Icon: IconPlug },
  { id: 'reflect', label: 'Nhìn lại tuần', Icon: IconThink },
]

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [fatal, setFatal] = useState<string | null>(null)
  const loginError = new URLSearchParams(window.location.search).get('error')

  useEffect(() => {
    if (window.location.pathname === '/login') {
      setMe(null)
      return
    }
    loadMe()
      .then(setMe)
      .catch((e: unknown) => (e instanceof ApiError && e.status === 401 ? setMe(null) : setFatal((e as Error).message)))
  }, [])

  if (fatal) return <div className="loading loading--bad">{fatal}</div>
  if (me === undefined) return <div className="loading">đang mở bàn điều phối…</div>
  if (me === null) return <Login error={loginError} />
  return <Shell me={me} />
}

function Shell({ me }: { me: Me }) {
  const [view, setView] = useState<View>('desk')
  const [viewing, setViewing] = useState<string>(me.id)
  const [ws, setWs] = useState<Workspace | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)
  const [now, setNow] = useState(new Date())
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([loadWorkspace(viewing), loadPeople()])
      .then(([w, p]) => {
        setWs(w)
        setPeople(p)
        setErr(null)
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) window.location.href = '/login'
        else setErr((e as Error).message)
      })
  }, [viewing])

  useEffect(() => {
    setWs(null)
    setBooted(false)
    refresh()
  }, [refresh])
  usePoll(refresh, 30_000)

  useEffect(() => {
    if (!ws) return
    const id = window.setTimeout(() => setBooted(true), 90)
    return () => window.clearTimeout(id)
  }, [ws])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  function go(v: View) {
    setOpenTask(null)
    setView(v)
  }
  function visit(personId: string) {
    setOpenTask(null)
    setViewing(personId)
    setView('desk')
  }
  async function signOut() {
    await logout().catch(() => undefined)
    window.location.href = '/login'
  }
  function fire(t: Task) {
    setToast(`${t.action.label} · ${t.name}`)
  }

  const readOnly = ws ? !ws.isMine : true
  const who = ws && !ws.isMine ? ws.owner.name : 'bạn'
  const waiting = ws ? ws.tasks.filter((t) => t.state === 'needs-you' || t.state === 'blocked').length : 0
  const task = ws && openTask ? ws.tasks.find((t) => t.id === openTask) ?? null : null

  return (
    <div className="shell">
      <nav className="rail" aria-label="Khu vực">
        <button className="rail__mark" aria-label="Về bàn của tôi" onClick={() => visit(me.id)}>W</button>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="rail__btn"
            aria-current={view === id && !task ? 'page' : undefined}
            aria-label={label}
            onClick={() => go(id)}
          >
            <Icon />
            {id === 'desk' && ws?.isMine && waiting > 0 && <span className="rail__badge">{waiting}</span>}
            <span className="rail__tip">{label}</span>
          </button>
        ))}
        <div className="rail__spacer" />
        <button className="rail__btn" aria-label={`Đăng xuất ${me.name}`} onClick={signOut}>
          <span className="avatar avatar--sm">
            {me.avatarUrl ? <img src={me.avatarUrl} alt="" referrerPolicy="no-referrer" /> : me.name[0]}
          </span>
          <span className="rail__tip">{me.name} · Đăng xuất</span>
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <span className="topbar__title">{view === 'team' ? 'Đội ngũ' : ws && !ws.isMine ? `Bàn của ${ws.owner.name}` : 'Bàn điều phối'}</span>
          {ws && view !== 'team' && (
            <span className="topbar__sub">
              {ws.week.label} · {ws.tasks.length} việc đang theo dõi
            </span>
          )}
          <span className="topbar__spacer" />
          {ws?.isMine && waiting > 0 && view !== 'team' && (
            <span className="pill" style={{ color: 'var(--needs)', borderColor: 'var(--needs-dim)', background: 'var(--needs-dim)' }}>
              {waiting} việc cần bạn
            </span>
          )}
          <span className="clock">{clock(now.toISOString())}</span>
        </header>

        {ws && !ws.isMine && view !== 'team' && (
          <div className="viewing" role="status">
            <span className="avatar avatar--xs">
              {ws.owner.avatarUrl ? <img src={ws.owner.avatarUrl} alt="" referrerPolicy="no-referrer" /> : ws.owner.name[0]}
            </span>
            Đang xem không gian của <strong>{ws.owner.name}</strong> · chỉ đọc
            <button className="viewing__back" onClick={() => visit(me.id)}>Về bàn của tôi</button>
          </div>
        )}

        {err && (
          <div className="banner banner--bad" role="alert">
            {err}
            <button onClick={refresh}>Thử lại</button>
          </div>
        )}

        {view === 'team' ? (
          <Team people={people} meId={me.id} now={now} onVisit={visit} />
        ) : !ws ? (
          <div className="loading">đang đọc dữ liệu…</div>
        ) : (
          <div key={task ? `task-${task.id}` : `${viewing}-${view}`} className="fadein">
            {task ? (
              <TaskSpace task={task} readOnly={readOnly} backLabel={ws.isMine ? 'Bàn điều phối' : `Bàn của ${ws.owner.name}`} onBack={() => setOpenTask(null)} onFire={fire} />
            ) : view === 'desk' ? (
              <Desk tasks={ws.tasks} activity={ws.activity} booted={booted} now={now} readOnly={readOnly} who={who} onOpen={setOpenTask} onFire={fire} />
            ) : view === 'schedule' ? (
              <Schedule tasks={ws.tasks} now={now} />
            ) : view === 'connections' ? (
              <Connections connections={ws.connections} tasks={ws.tasks} />
            ) : (
              <Reflect reflect={ws.reflect} tasks={ws.tasks} />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="lamp lamp--run">
              <span className="lamp__dot" />
            </span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 9: Thêm `IconTeam` vào `src/components/Icons.tsx`** (cùng phong cách nét với các icon hiện có)

```tsx
export const IconTeam = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M15.6 14.2c2.3-.3 4.4 1.2 4.9 4.3" />
  </svg>
)
```

Kiểm tra kích thước/strokeWidth của các icon khác trong file và dùng đúng giá trị đó nếu khác 20/1.7.

- [ ] **Step 10: Sửa `index.html`** — `<title>Work System · Bàn điều phối</title>`.

- [ ] **Step 11: Typecheck và build**

Run: `npx tsc -b && npx vite build`
Expected: không lỗi. Trước bước này tạo `src/components/Team.tsx` tạm với nội dung `export default function Team(_: { people: unknown; meId: string; now: Date; onVisit: (id: string) => void }) { return null }`; Task 10 thay bằng bản thật.

- [ ] **Step 12: Commit**

```bash
git add src index.html
git commit -m "feat(web): cổng đăng nhập, đọc dữ liệu từ API, chế độ xem đồng nghiệp chỉ đọc"
```

---

### Task 10: Web — màn hình Đội ngũ và hoàn thiện giao diện

**Files:**
- Create: `src/components/Team.tsx`, `src/styles/team.css`
- Modify: `src/main.tsx` (import `./styles/team.css`)

**Interfaces:**
- Consumes: `Person` DTO, `tone`, `ago`, `Lamp`, `Meter` từ `Bits`.
- Produces: `<Team people meId now onVisit />`.

- [ ] **Step 1: Viết `src/components/Team.tsx`**

```tsx
import type { Person, TaskState } from '../lib/types'
import { ago, tone } from '../lib/format'
import { Lamp } from './Bits'

const ORDER: TaskState[] = ['blocked', 'needs-you', 'running', 'healthy', 'idle']
const STATE_WORD: Record<TaskState, string> = { blocked: 'lỗi', 'needs-you': 'chờ duyệt', running: 'đang chạy', healthy: 'ổn', idle: 'nằm chờ' }

function presenceText(p: Person, now: Date): string {
  if (!p.active) return 'Đã rời team'
  if (p.presence === 'online') return 'Claude đang trực'
  if (p.presence === 'never') return 'Chưa nối Claude'
  return `Claude offline · ${ago(p.lastSeenAt, now)}`
}

function Ring({ value }: { value: number | null }) {
  const r = 22
  const c = 2 * Math.PI * r
  const v = value ?? 0
  const t = value === null ? 'idle' : v >= 0.75 ? 'run' : v >= 0.45 ? 'needs' : 'bad'
  return (
    <svg className="ring" width="56" height="56" viewBox="0 0 56 56" aria-label={value === null ? 'Chưa có task' : `Sức khỏe ${Math.round(v * 100)}%`}>
      <circle cx="28" cy="28" r={r} className="ring__track" />
      <circle
        cx="28" cy="28" r={r}
        className={`ring__value ring__value--${t}`}
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" className="ring__label">{value === null ? '—' : Math.round(v * 100)}</text>
    </svg>
  )
}

export default function Team({ people, meId, now, onVisit }: { people: Person[]; meId: string; now: Date; onVisit: (id: string) => void }) {
  const active = people.filter((p) => p.active)
  const online = active.filter((p) => p.presence === 'online').length
  const attention = active.filter((p) => p.attention).length

  return (
    <div className="wrap">
      <header className="hero">
        <h1 className="hero__line rise">
          <em>{online}</em> trên {active.length} Claude đang trực
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          {attention > 0 ? `${attention} người đang có việc cần quyết. Bấm vào ai để xem toàn bộ bàn của người đó.` : 'Không ai đang bị chặn. Bấm vào ai để xem toàn bộ bàn của người đó.'}
        </p>
      </header>

      <div className="team">
        {people.map((p, i) => (
          <button
            key={p.id}
            className={`mate rise${p.active ? '' : ' mate--gone'}`}
            style={{ animationDelay: `${0.04 * i}s` }}
            onClick={() => onVisit(p.id)}
          >
            <div className="mate__top">
              <span className={`avatar avatar--lg presence presence--${p.active ? p.presence : 'never'}`}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" /> : p.name[0]}
              </span>
              <div className="mate__who">
                <div className="mate__name">
                  {p.name}
                  {p.id === meId && <span className="mate__me">bạn</span>}
                </div>
                <div className="mate__presence">{presenceText(p, now)}</div>
              </div>
              <Ring value={p.health} />
            </div>

            <div className="mate__bar" aria-hidden="true">
              {ORDER.flatMap((s) => Array.from({ length: p.counts[s] }, (_, k) => <span key={`${s}${k}`} className={`mate__seg mate__seg--${tone(s)}`} />))}
            </div>
            <div className="mate__counts">
              {p.taskCount === 0
                ? 'Chưa có task'
                : ORDER.filter((s) => p.counts[s] > 0).map((s) => `${p.counts[s]} ${STATE_WORD[s]}`).join(' · ')}
            </div>

            <div className="mate__focus">
              {p.attention ? (
                <>
                  <Lamp tone={tone(p.attention.state)} label={p.attention.stateLabel || STATE_WORD[p.attention.state]} />
                  <span className="mate__task">{p.attention.taskName}</span>
                </>
              ) : (
                <span className="mate__calm">Không có gì cần chú ý</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Viết `src/styles/team.css`**

```css
/* ============================================================
   Đội ngũ, đăng nhập, khung chung cho nhiều người dùng.
   Chỉ dùng token đã có trong app.css — màu vẫn là trạng thái.
   ============================================================ */

/* ---------- avatar + hiện diện ---------- */
.avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  background: var(--ink-high);
  border: 1px solid var(--line);
  color: var(--fg-2);
  font-weight: 600;
  overflow: visible;
}
.avatar img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.avatar--xs { width: 20px; height: 20px; border-radius: 6px; font-size: 10px; }
.avatar--sm { width: 27px; height: 27px; border-radius: 9px; font-size: 12px; }
.avatar--lg { width: 46px; height: 46px; border-radius: 14px; font-size: 18px; font-family: var(--display); }

.presence::after {
  content: '';
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--ink-raised);
  background: var(--idle);
}
.presence--online::after { background: var(--run); box-shadow: 0 0 0 0 rgba(0, 194, 168, .55); animation: breathe 2.6s var(--ease) infinite; }
.presence--offline::after { background: var(--needs); }
.presence--never::after { background: var(--line); }

@keyframes breathe {
  0%   { box-shadow: 0 0 0 0 rgba(0, 194, 168, .5); }
  70%  { box-shadow: 0 0 0 7px rgba(0, 194, 168, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 194, 168, 0); }
}

/* ---------- lưới đồng nghiệp ---------- */
.team {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
  padding-bottom: 60px;
}

.mate {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--ink-raised), var(--ink));
  border: 1px solid var(--line-soft);
  transition: transform .25s var(--ease), border-color .25s var(--ease), box-shadow .25s var(--ease);
}
.mate:hover {
  transform: translateY(-3px);
  border-color: var(--line);
  box-shadow: 0 18px 40px rgba(0, 0, 0, .35);
}
.mate:active { transform: translateY(-1px); transition-timing-function: var(--ease-press); }
.mate--gone { opacity: .5; }

.mate__top { display: flex; align-items: center; gap: 13px; }
.mate__who { flex: 1; min-width: 0; }
.mate__name {
  font-family: var(--display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mate__me {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--fg-3);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 1px 5px;
}
.mate__presence { color: var(--fg-3); font-size: 13px; margin-top: 2px; }

.mate__bar { display: flex; gap: 3px; height: 6px; }
.mate__bar:empty { background: var(--line-soft); border-radius: 3px; }
.mate__seg { flex: 1; border-radius: 3px; }
.mate__seg--run { background: var(--run); }
.mate__seg--needs { background: var(--needs); }
.mate__seg--bad { background: var(--bad); }
.mate__seg--idle { background: var(--idle); opacity: .55; }
.mate__counts { color: var(--fg-2); font-size: 13px; margin-top: -6px; }

.mate__focus {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
  min-height: 34px;
  font-size: 13.5px;
}
.mate__task { color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mate__calm { color: var(--fg-3); }

/* ---------- vòng sức khỏe ---------- */
.ring__track { fill: none; stroke: var(--line-soft); stroke-width: 4; }
.ring__value { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray .9s var(--ease); }
.ring__value--run { stroke: var(--run); }
.ring__value--needs { stroke: var(--needs); }
.ring__value--bad { stroke: var(--bad); }
.ring__value--idle { stroke: var(--idle); }
.ring__label { font-family: var(--mono); font-size: 12px; fill: var(--fg-2); }

/* ---------- dải "đang xem" ---------- */
.viewing {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 40px;
  padding: 10px 14px;
  border-radius: 11px;
  background: var(--idle-dim);
  border: 1px solid var(--line);
  color: var(--fg-2);
  font-size: 13.5px;
}
.viewing strong { color: var(--fg); font-weight: 600; }
.viewing__back {
  margin-left: auto;
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid var(--line);
  color: var(--fg);
  font-size: 13px;
}
.viewing__back:hover { border-color: var(--needs); background: var(--needs-dim); }

/* ---------- banner lỗi ---------- */
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 40px 0;
  padding: 10px 14px;
  border-radius: 11px;
  font-size: 13.5px;
}
.banner--bad { background: var(--bad-dim); border: 1px solid rgba(255, 92, 77, .3); }
.banner button { margin-left: auto; text-decoration: underline; text-underline-offset: 3px; }

/* ---------- toast ---------- */
.toast {
  position: fixed;
  left: calc(var(--rail) + 40px);
  bottom: 30px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 17px;
  border-radius: 11px;
  background: var(--ink-high);
  border: 1px solid var(--line);
  box-shadow: 0 14px 36px rgba(0, 0, 0, .5);
  font-size: 14px;
}

.loading--bad { color: var(--bad); text-align: center; padding: 24px; }

/* ---------- đăng nhập ---------- */
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
  position: relative;
  z-index: 1;
}
.login__card {
  width: min(420px, 100%);
  padding: 40px 36px 30px;
  border-radius: 22px;
  background: var(--paper);
  color: var(--on-paper);
  box-shadow: 0 40px 90px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255, 255, 255, .04);
  text-align: center;
}
.login__mark {
  width: 52px;
  height: 52px;
  margin: 0 auto 18px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--needs);
  font-family: var(--display);
  font-size: 26px;
  font-weight: 700;
}
.login__title { font-family: var(--display); font-size: 34px; font-weight: 700; letter-spacing: -.02em; margin: 0; }
.login__lede { color: var(--on-paper-2); margin: 10px 0 26px; font-size: 15px; }
.login__error {
  margin: -8px 0 18px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 92, 77, .12);
  color: #a3271c;
  font-size: 14px;
}
.login__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  width: 100%;
  height: 50px;
  border-radius: 13px;
  background: var(--ink);
  color: var(--fg);
  font-weight: 600;
  text-decoration: none;
  transition: transform .2s var(--ease), box-shadow .2s var(--ease);
}
.login__btn:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(20, 22, 28, .35); }
.login__btn:active { transform: translateY(1px); }
.login__fine { margin: 14px 0 0; color: var(--on-paper-2); font-size: 12.5px; font-family: var(--mono); }

@media (max-width: 720px) {
  .viewing, .banner { margin-left: 16px; margin-right: 16px; }
  .team { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .presence--online::after { animation: none; }
  .mate, .ring__value, .login__btn { transition: none; }
}
```

- [ ] **Step 2b: Đảm bảo `.rail__mark` vẫn đúng kiểu khi đổi thành `<button>`**

Thêm vào cuối `team.css`:

```css
button.rail__mark { cursor: pointer; }
button.rail__mark:hover { color: var(--needs); }
```

- [ ] **Step 3: Import CSS trong `src/main.tsx`**

Thêm dòng `import './styles/team.css'` ngay sau `import './styles/app.css'`.

- [ ] **Step 4: Typecheck, build, chạy thử bằng trình duyệt**

Run: `npx tsc -b && npx vite build`
Expected: không lỗi.

Run: `npm run dev`, mở `http://localhost:5173/auth/dev?email=tutnv@bravebits.vn&name=Logan`.
Expected:
- Về `/`, thấy Bàn điều phối với 4 task của Logan, giờ hiển thị theo giờ VN.
- Bấm icon Đội ngũ → 3 thẻ (Logan có nhãn "bạn", 2 demo). Logan hiển thị "Chưa nối Claude".
- Bấm thẻ "Bình (demo)" → dải "Đang xem không gian của Bình (demo) · chỉ đọc", không còn nút hành động trên thẻ task; mở một task → không có nút ở góc phải.
- "Về bàn của tôi" → quay lại.
- Thu hẹp cửa sổ còn 390px → không cuộn ngang, lưới Đội ngũ một cột.
- Bấm avatar ở đáy rail → đăng xuất, về màn hình đăng nhập.
- Mở `/login?error=domain` → hiện thông báo "Chỉ email @bravebits.vn…".

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(web): màn hình Đội ngũ, đăng nhập, dải chỉ đọc khi xem đồng nghiệp"
```

---

### Task 11: Triển khai lên Vercel và tài liệu vận hành

**Files:**
- Modify: `README.md` (thay toàn bộ)

**Interfaces:**
- Produces: hướng dẫn deploy; app chạy trên Vercel với Neon.

- [ ] **Step 1: Viết `README.md`**

````markdown
# Work System

Bàn điều phối của team: mỗi người nối Claude desktop của mình, Claude chạy việc theo lịch và báo tiến độ, chỉ số, báo cáo tuần lên đây. Mọi người xem được bàn của nhau (chỉ đọc).

Thiết kế: `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md`

## Chạy trên máy

```bash
npm install
cp .env.example .env      # DEV_LOGIN=1 cho phép đăng nhập không cần Google trên localhost
npm run seed -- --demo    # dừng `npm run dev` trước khi seed (PGlite chỉ mở được một lần)
npm run dev               # http://localhost:5173
```

Đăng nhập nhanh khi dev: `http://localhost:5173/auth/dev?email=tutnv@bravebits.vn&name=Logan`

Test: `npm test` · Kiểm tra kiểu: `npm run typecheck`

## Triển khai (Vercel)

1. **Google OAuth:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   Authorized redirect URI: `https://<domain>/auth/google/callback` (thêm `http://localhost:5173/auth/google/callback` nếu muốn test Google thật ở local).
   OAuth consent screen: *Internal* (chỉ người trong Workspace bravebits.vn).
2. **Vercel project:** import repo; Framework = Vite.
3. **Database:** tab *Storage* → *Create Database* → Neon Postgres (Free) → *Connect* vào project. Vercel tự thêm `DATABASE_URL`.
4. **Biến môi trường (Production + Preview):**
   `PUBLIC_URL=https://<domain>` · `ALLOWED_DOMAIN=bravebits.vn` · `ADMIN_EMAILS=tutnv@bravebits.vn` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET`. **Không** đặt `DEV_LOGIN`.
5. **Deploy:** push lên nhánh chính. Lệnh `vercel-build` tự chạy migration rồi build.
6. **Nạp dữ liệu mẫu (một lần):** `DATABASE_URL=<chuỗi Neon> npm run seed`.

## Cấu trúc

- `shared/` — schema zod và kiểu DTO dùng chung cho web và server
- `server/core/` — toàn bộ logic và phân quyền
- `server/http/` — app Hono: `/auth/*`, `/api/*`
- `api/router.ts` — Vercel Function duy nhất; `vercel.json` rewrite mọi đường backend về đây
- `src/` — web React
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: hướng dẫn chạy local và triển khai Vercel"
```

- [ ] **Step 3: Deploy và kiểm tra trên Vercel** (cần người dùng: tạo Google OAuth client, Vercel project, Neon — làm theo README)

Sau khi deploy:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/api/me              # Expected: 401
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<domain>/auth/google   # Expected: 302 tới accounts.google.com
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/team                 # Expected: 200 (SPA)
```

Đăng nhập bằng Google trên trình duyệt → thấy bàn của mình; tài khoản ngoài domain → thông báo từ chối.
Nếu `/api/me` trả 404 thay vì 401: rewrite chưa truyền `__p` — mở Vercel Function logs kiểm tra `req.url`, và nếu Vercel đã giữ nguyên đường dẫn gốc thì `handle` vẫn đúng vì chỉ ghi đè khi có `__p`.
