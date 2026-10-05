# Work System — Kế hoạch 2/4: MCP server + connector OAuth cho Claude

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude desktop của từng người thêm được connector "Work System" (đăng nhập Google một lần) và dùng 5 tool để khai báo task, cập nhật, xem, báo kết quả chạy và nộp báo cáo tuần; chủ tài khoản thấy và ngắt được các kết nối Claude trên web.

**Architecture:** Project tự làm OAuth 2.1 Authorization Server (DCR + CIMD, PKCE S256, refresh xoay vòng, token gắn `resource`) trên chính app Hono, bước đăng nhập dùng lại Google login của kế hoạch 1. `/mcp` là MCP server stateless (`mcp-handler` 2.x + `@modelcontextprotocol/server` 2.x) bọc bởi `withMcpAuth`. Mọi thao tác dữ liệu đi qua lõi `server/core/tasks.ts`; tool MCP chỉ là vỏ mỏng.

**Tech Stack:** như kế hoạch 1 + `mcp-handler@^2.2`, `@modelcontextprotocol/server@^2.3`.

**Spec:** `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md` (mục 4, 6–7; mục 6 phần lease/`dieu_phoi` thuộc kế hoạch 3)

**Nguồn chuẩn đã đọc:** MCP Authorization 2026-07-28 (resource bắt buộc, PKCE S256, CIMD được khuyến nghị, `iss` trong phản hồi authorize); tài liệu connector của Claude (callback `https://claude.ai/api/mcp/auth_callback`; Claude dùng CIMD khi metadata có `client_id_metadata_document_supported: true` **và** `"none"` trong `token_endpoint_auth_methods_supported`, nếu không thì DCR; Claude Code dùng loopback `http://localhost/callback` / `http://127.0.0.1/callback` bất kỳ cổng; refresh token phải xoay vòng và trả `invalid_grant` khi hết hiệu lực; `/token` nhận `application/x-www-form-urlencoded`; endpoint OAuth phải trả lời trong 10 giây).

## Global Constraints

- Mọi ràng buộc chung của kế hoạch 1 (Node ≥ 22, ESM, import tương đối có `.js` trong `server/` `shared/` `api/`, giờ VN, snake_case DB / camelCase API, chữ tiếng Việt, màu = trạng thái, không commit bí mật).
- Resource canonical của MCP = `${PUBLIC_URL}/mcp`; issuer = `PUBLIC_URL`.
- Access token 1 giờ, refresh token 90 ngày, authorization code 60 giây dùng một lần; chỉ lưu **hash** của code/token.
- Mọi client là public client (`token_endpoint_auth_method: "none"`), PKCE S256 bắt buộc.
- Redirect URI chỉ nhận `https://…` hoặc loopback `http://localhost|127.0.0.1|[::1]`; loopback so khớp bỏ qua cổng.
- Không bao giờ redirect tới `redirect_uri` chưa được xác minh với client.
- Tool MCP: tên tiếng Việt không dấu (`tao_task`, `sua_task`, `xem_task`, `bao_ket_qua`, `nop_bao_cao_tuan`); tham số camelCase; lỗi trả `isError: true` với thông điệp tiếng Việt chỉ rõ trường sai.
- Dữ liệu Claude ghi chỉ thuộc về **người sở hữu token**; không tham số nào chọn được người dùng khác.

## Review Focus

1. Yêu cầu authorize với `redirect_uri` không thuộc client → trang lỗi, tuyệt đối không redirect tới URI đó. (Task 5)
2. Cùng một authorization code đổi hai lần → lần hai `invalid_grant`, không phát token thứ hai. (Task 4)
3. Access token phát cho resource khác (audience khác) → `/mcp` trả 401. (Task 4)
4. Người dùng bị vô hiệu hóa nhưng Claude còn access token hợp lệ → 401 ngay; refresh → `invalid_grant`. (Task 4, Task 6)
5. `sua_task` chỉ gửi một trường → các trường khác giữ nguyên (không bị mặc định ghi đè). (Task 2, Task 6)

---

## File Structure

```
shared/schema.ts            (sửa) runReportSchema, weeklyReportInputSchema, zodMessage
shared/dto.ts               (sửa) ClaudeLinkDTO, MyConnectionsDTO
server/db/schema.ts         (sửa) oauth_clients.updated_at, oauth_tokens.resource
server/db/migrations/0001_* (sinh)
server/core/tasks.ts        tạo/sửa/xem task, báo kết quả, nộp báo cáo tuần (thuộc chủ token)
server/core/tasks.test.ts
server/core/oauth-error.ts  OAuthError (mã lỗi chuẩn RFC 6749)
server/core/oauth-clients.ts  DCR, CIMD, so khớp redirect
server/core/oauth-clients.test.ts
server/core/oauth-tokens.ts   code, đổi token, refresh xoay vòng, xác minh, danh sách/ngắt kết nối
server/core/oauth-tokens.test.ts
server/http/consent.ts      HTML màn hình chấp thuận + trang lỗi OAuth
server/http/oauth.ts        /.well-known/*, /oauth/register, /oauth/authorize, /oauth/token
server/http/oauth.test.ts
server/mcp/tools.ts         5 tool MCP
server/http/mcp.ts          gắn /mcp + xác thực bearer
server/http/mcp.test.ts
server/http/api.ts          (sửa) /api/connections, /api/connections/:id/revoke
server/http/app.ts          (sửa) gắn oauthRoutes, /mcp; AppDeps.fetchClientMetadata
server/http/connections.test.ts
api/router.ts, server/dev.ts (sửa) truyền fetchClientMetadata
src/lib/data.ts, src/lib/types.ts, src/App.tsx, src/components/Connections.tsx, src/styles/team.css (sửa)
README.md (sửa) mục "Nối Claude desktop"
```

---

### Task 1: Schema dữ liệu cho kết quả chạy, báo cáo tuần và OAuth

**Files:**
- Modify: `shared/schema.ts`, `shared/schema.test.ts`, `shared/dto.ts`, `server/db/schema.ts`
- Generated: `server/db/migrations/0001_*.sql`

**Interfaces:**
- Produces: `runReportSchema`, `type RunReport`; `weeklyReportInputSchema`, `type WeeklyReportInputOptionalWeek`; `zodMessage(e: z.ZodError): string`; DTO `ClaudeLinkDTO { id: string; clientName: string; createdAt: string; lastUsedAt: string | null }`, `MyConnectionsDTO { connectorUrl: string; links: ClaudeLinkDTO[] }`; cột `oauthClients.updatedAt`, `oauthTokens.resource`.

- [ ] **Step 1: Thêm test vào cuối `shared/schema.test.ts`**

```ts
import { runReportSchema, weeklyReportInputSchema, zodMessage } from './schema.js'

describe('runReportSchema', () => {
  it('mặc định note rỗng, log rỗng; trường cập nhật đều tùy chọn', () => {
    expect(runReportSchema.parse({ slug: 'a', status: 'ok' })).toEqual({ slug: 'a', status: 'ok', note: '', log: [] })
  })
  it('từ chối log quá 200 dòng hoặc dòng quá 500 ký tự', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', log: Array(201).fill('x') }).success).toBe(false)
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', log: ['x'.repeat(501)] }).success).toBe(false)
  })
  it('từ chối status lạ', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'done' }).success).toBe(false)
  })
})

describe('weeklyReportInputSchema', () => {
  it('week tùy chọn', () => {
    expect(weeklyReportInputSchema.parse({ summary: 's' }).week).toBeUndefined()
  })
})

describe('zodMessage', () => {
  it('ghi rõ đường dẫn trường', () => {
    const r = runReportSchema.safeParse({ slug: 'A B', status: 'ok' })
    expect(r.success).toBe(false)
    expect(zodMessage(r.error!)).toMatch(/^slug: /)
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run shared/schema.test.ts`
Expected: FAIL — `runReportSchema` chưa export.

- [ ] **Step 3: Thêm vào cuối `shared/schema.ts`**

```ts
export const runReportSchema = z.object({
  slug: slugSchema,
  status: z.enum(RUN_STATUSES),
  note: text(500).default(''),
  log: z
    .array(z.string().max(LIMITS.logLineChars, `Mỗi dòng log tối đa ${LIMITS.logLineChars} ký tự`))
    .max(LIMITS.logLines, `Log tối đa ${LIMITS.logLines} dòng`)
    .default([]),
  durationMs: z.number().int().min(0).max(24 * 3_600_000).optional(),
  state: z.enum(TASK_STATES).optional(),
  stateLabel: text(60).optional(),
  health: z.number().min(0).max(1).optional(),
  progress: progressSchema.optional(),
  metrics: z.array(metricSchema).max(LIMITS.metrics).optional(),
  trendThem: z.array(z.number()).max(LIMITS.trend).optional(),
  milestones: z.array(milestoneSchema).max(LIMITS.milestones).optional(),
  blocks: blocksSchema.optional(),
  report: taskReportSchema.optional(),
})
export type RunReport = z.output<typeof runReportSchema>

export const weeklyReportInputSchema = weeklyReportSchema.extend({ week: weeklyReportSchema.shape.week.optional() })
export type WeeklyReportInputOptionalWeek = z.output<typeof weeklyReportInputSchema>

export function zodMessage(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.length ? i.path.join('.') : '(gốc)'}: ${i.message}`).join('; ')
}
```

- [ ] **Step 4: Thêm DTO vào cuối `shared/dto.ts`**

```ts
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
```

- [ ] **Step 5: Sửa bảng trong `server/db/schema.ts`**

Trong `oauthClients` thêm sau `createdAt`:

```ts
  updatedAt: ts('updated_at').notNull().defaultNow(),
```

Trong `oauthTokens` thêm sau `clientName`:

```ts
  resource: text('resource').notNull(),
```

- [ ] **Step 6: Sinh migration và chạy toàn bộ test**

Run: `npm run db:generate && npx vitest run`
Expected: tạo `server/db/migrations/0001_*.sql` (ALTER TABLE thêm 2 cột); mọi test PASS — riêng `server/core/users.test.ts` sẽ FAIL ở chỗ insert `oauthTokens` thiếu `resource`. Sửa test đó: thêm `resource: 'https://ws.test/mcp',` vào object `values({...})` của `oauthTokens` rồi chạy lại → PASS.

- [ ] **Step 7: Commit**

```bash
git add shared server/db server/core/users.test.ts
git commit -m "feat: schema kết quả chạy, báo cáo tuần, cột OAuth cho connector"
```

---

### Task 2: Lõi ghi dữ liệu task cho chủ token

**Files:**
- Create: `server/core/tasks.ts`, `server/core/tasks.test.ts`

**Interfaces:**
- Consumes: `taskDefinitionSchema`, `TaskDefinition`, `TaskPatch`, `RunReport`, `WeeklyReportInputOptionalWeek`, `LIMITS`, `byteSize`, `zodMessage` (shared); `isValidCron`, `nextRunAfter`; `vnWeek`; `toTaskDTO`, `TaskRow`; `notFound`, `invalid`, `conflict`; `User`.
- Produces:
  - `STATE_LABEL: Record<TaskState, string>`
  - `createTask(db, owner: User, input: TaskDefinition, now: Date): Promise<TaskRow>`
  - `updateTask(db, owner: User, slug: string, patch: TaskPatch, now: Date): Promise<TaskRow>`
  - `listMyTasks(db, owner: User): Promise<MyTaskSummary[]>` với `MyTaskSummary = { slug; name; state; stateLabel; cron; scheduleLabel; paused; lastRun: string | null; nextRun: string | null }`
  - `getMyTask(db, owner: User, slug: string): Promise<TaskDTO>`
  - `reportRun(db, owner: User, input: RunReport, now: Date): Promise<{ runId: string; task: TaskRow }>`
  - `submitWeeklyReport(db, owner: User, input: WeeklyReportInputOptionalWeek, now: Date): Promise<{ week: string }>`

- [ ] **Step 1: Viết test `server/core/tasks.test.ts`**

```ts
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
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/tasks.test.ts`
Expected: FAIL — không tìm thấy `./tasks.js`.

- [ ] **Step 3: Viết `server/core/tasks.ts`**

```ts
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
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server/core/tasks.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Typecheck, toàn bộ test, commit**

Run: `npx tsc -b && npx vitest run`
Expected: sạch, PASS.

```bash
git add server/core/tasks.ts server/core/tasks.test.ts
git commit -m "feat: lõi tạo/sửa/xem task, báo kết quả chạy, nộp báo cáo tuần"
```

---

### Task 3: OAuth — client (DCR, CIMD) và so khớp redirect

**Files:**
- Create: `server/core/oauth-error.ts`, `server/core/oauth-clients.ts`, `server/core/oauth-clients.test.ts`

**Interfaces:**
- Produces:
  - `class OAuthError extends Error { readonly error: string; readonly status: 400 | 401 }` — `new OAuthError(error, description, status = 400)`
  - `CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'`
  - `interface ClientInfo { clientId: string; name: string; redirectUris: string[]; kind: 'dcr' | 'cimd' }`
  - `type MetadataFetcher = (url: string) => Promise<unknown>`
  - `isLoopback(u: URL): boolean`; `isAcceptableRedirect(raw: string): boolean`; `redirectMatches(registered: string[], requested: string): boolean`
  - `registerClient(db, body: unknown, now: Date): Promise<Record<string, unknown>>` (thân phản hồi RFC 7591)
  - `resolveClient(db, clientId: string, fetcher: MetadataFetcher, now: Date): Promise<ClientInfo | null>`
  - `fetchClientMetadata: MetadataFetcher` (production: HTTPS, 5 giây, ≤ 64 KB, không theo redirect)
  - `CIMD_TTL_MS = 24 * 3_600_000`

- [ ] **Step 1: Viết test `server/core/oauth-clients.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { oauthClients } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { resetDb, testDb } from '../test/db.js'
import { CIMD_TTL_MS, isAcceptableRedirect, redirectMatches, registerClient, resolveClient } from './oauth-clients.js'

const now = new Date('2026-10-05T03:00:00Z')
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('redirect', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', true],
    ['http://localhost:3118/callback', true],
    ['http://127.0.0.1/callback', true],
    ['http://evil.com/cb', false],
    ['https://claude.ai/cb#x', false],
    ['javascript:alert(1)', false],
    ['không phải url', false],
  ])('chấp nhận %s → %s', (u, ok) => expect(isAcceptableRedirect(u)).toBe(ok))

  it('so khớp chính xác với https', () => {
    expect(redirectMatches(['https://claude.ai/api/mcp/auth_callback'], 'https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(redirectMatches(['https://claude.ai/api/mcp/auth_callback'], 'https://claude.ai/api/mcp/auth_callback/x')).toBe(false)
    expect(redirectMatches(['https://claude.ai/api/mcp/auth_callback'], 'https://claude.ai.evil.com/api/mcp/auth_callback')).toBe(false)
  })

  it('loopback bỏ qua cổng nhưng giữ host và path', () => {
    const reg = ['http://localhost/callback', 'http://127.0.0.1/callback']
    expect(redirectMatches(reg, 'http://localhost:51234/callback')).toBe(true)
    expect(redirectMatches(reg, 'http://127.0.0.1:9/callback')).toBe(true)
    expect(redirectMatches(reg, 'http://localhost:51234/other')).toBe(false)
    expect(redirectMatches(['https://x.com/cb'], 'http://localhost:1/cb')).toBe(false)
  })
})

describe('registerClient (DCR)', () => {
  it('đăng ký public client, trả thân RFC 7591', async () => {
    const res = await registerClient(db, { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'client_secret_post' }, now)
    expect(res).toMatchObject({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] })
    expect(String(res.client_id)).toMatch(/^dcr_/)
    const c = await resolveClient(db, String(res.client_id), async () => { throw new Error('không được gọi') }, now)
    expect(c).toMatchObject({ kind: 'dcr', name: 'Claude' })
  })

  it('từ chối redirect không an toàn', async () => {
    await expect(registerClient(db, { redirect_uris: ['http://evil.com/cb'] }, now)).rejects.toMatchObject({ error: 'invalid_redirect_uri' })
  })

  it('từ chối thân sai dạng', async () => {
    await expect(registerClient(db, { redirect_uris: [] }, now)).rejects.toMatchObject({ error: 'invalid_client_metadata' })
    await expect(registerClient(db, 'rác', now)).rejects.toMatchObject({ error: 'invalid_client_metadata' })
  })
})

describe('resolveClient (CIMD)', () => {
  const url = 'https://claude.ai/oauth/claude-code-client-metadata'
  const doc = { client_id: url, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' }

  it('tải tài liệu, kiểm client_id khớp URL, lưu cache', async () => {
    let calls = 0
    const fetcher = async () => { calls += 1; return doc }
    expect(await resolveClient(db, url, fetcher, now)).toMatchObject({ kind: 'cimd', name: 'Claude Code', redirectUris: doc.redirect_uris })
    await resolveClient(db, url, fetcher, new Date(now.getTime() + 60_000))
    expect(calls).toBe(1)
    await resolveClient(db, url, fetcher, new Date(now.getTime() + CIMD_TTL_MS + 1))
    expect(calls).toBe(2)
  })

  it('client_id trong tài liệu khác URL → null', async () => {
    expect(await resolveClient(db, url, async () => ({ ...doc, client_id: 'https://evil.com/x' }), now)).toBeNull()
  })

  it('tài liệu có redirect không an toàn → null', async () => {
    expect(await resolveClient(db, url, async () => ({ ...doc, redirect_uris: ['http://evil.com/cb'] }), now)).toBeNull()
  })

  it('URL không hợp lệ cho CIMD (http, IP, localhost, không có path) → null mà không tải', async () => {
    const boom = async () => { throw new Error('không được gọi') }
    for (const u of ['http://claude.ai/x', 'https://10.0.0.1/x', 'https://localhost/x', 'https://claude.ai', 'https://claude.ai/']) {
      expect(await resolveClient(db, u, boom, now)).toBeNull()
    }
  })

  it('tải lỗi nhưng còn cache cũ → dùng cache cũ; không có cache → null', async () => {
    await resolveClient(db, url, async () => doc, now)
    const later = new Date(now.getTime() + CIMD_TTL_MS + 1)
    expect(await resolveClient(db, url, async () => { throw new Error('mạng') }, later)).toMatchObject({ name: 'Claude Code' })
    await db.delete(oauthClients)
    expect(await resolveClient(db, url, async () => { throw new Error('mạng') }, later)).toBeNull()
  })

  it('client_id DCR không tồn tại → null', async () => {
    expect(await resolveClient(db, 'dcr_khong_co', async () => doc, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/oauth-clients.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/core/oauth-error.ts`**

```ts
/** Lỗi theo RFC 6749 §5.2 / RFC 7591 §3.2.2 — trả về `{ error, error_description }`. */
export class OAuthError extends Error {
  readonly error: string
  readonly status: 400 | 401
  constructor(error: string, description: string, status: 400 | 401 = 400) {
    super(description)
    this.error = error
    this.status = status
  }
}
```

- [ ] **Step 4: Viết `server/core/oauth-clients.ts`**

```ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { oauthClients } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { OAuthError } from './oauth-error.js'
import { newToken } from './tokens.js'

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
export const CIMD_TTL_MS = 24 * 3_600_000

export interface ClientInfo {
  clientId: string
  name: string
  redirectUris: string[]
  kind: 'dcr' | 'cimd'
}

export type MetadataFetcher = (url: string) => Promise<unknown>

export function isLoopback(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
}

export function isAcceptableRedirect(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  return u.protocol === 'https:' || isLoopback(u)
}

/** Khớp chính xác; riêng loopback (RFC 8252 §7.3) bỏ qua cổng. */
export function redirectMatches(registered: string[], requested: string): boolean {
  let req: URL
  try {
    req = new URL(requested)
  } catch {
    return false
  }
  return registered.some((r) => {
    if (r === requested) return true
    const reg = new URL(r)
    return isLoopback(reg) && isLoopback(req) && reg.hostname === req.hostname && reg.pathname === req.pathname && reg.search === req.search
  })
}

const registerBody = z.object({
  redirect_uris: z.array(z.string()).min(1).max(5),
  client_name: z.string().trim().min(1).max(100).optional(),
})

export async function registerClient(db: Db, body: unknown, now: Date): Promise<Record<string, unknown>> {
  const parsed = registerBody.safeParse(body)
  if (!parsed.success) throw new OAuthError('invalid_client_metadata', 'Cần redirect_uris (1–5 URI) và client_name tối đa 100 ký tự')
  const bad = parsed.data.redirect_uris.find((u) => !isAcceptableRedirect(u))
  if (bad) throw new OAuthError('invalid_redirect_uri', `Redirect URI không được chấp nhận: ${bad}`)

  const clientId = `dcr_${newToken().slice(0, 32)}`
  const name = parsed.data.client_name ?? 'Ứng dụng MCP'
  await db.insert(oauthClients).values({ clientId, kind: 'dcr', name, redirectUris: parsed.data.redirect_uris, createdAt: now, updatedAt: now })
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
}

const cimdDoc = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
})

function isCimdUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  const host = u.hostname
  const ipLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
  return u.protocol === 'https:' && !ipLiteral && !local && u.pathname.length > 1 && !u.hash && !u.username
}

export async function resolveClient(db: Db, clientId: string, fetcher: MetadataFetcher, now: Date): Promise<ClientInfo | null> {
  const cached = await db.query.oauthClients.findFirst({ where: eq(oauthClients.clientId, clientId) })
  const toInfo = (r: typeof oauthClients.$inferSelect): ClientInfo => ({ clientId: r.clientId, name: r.name, redirectUris: r.redirectUris, kind: r.kind })

  if (!clientId.startsWith('https://')) return cached && cached.kind === 'dcr' ? toInfo(cached) : null
  if (!isCimdUrl(clientId)) return null
  if (cached && now.getTime() - cached.updatedAt.getTime() < CIMD_TTL_MS) return toInfo(cached)

  let doc: z.infer<typeof cimdDoc>
  try {
    const parsed = cimdDoc.safeParse(await fetcher(clientId))
    if (!parsed.success) return null
    doc = parsed.data
  } catch (e) {
    console.error('[oauth] không tải được Client ID Metadata Document', clientId, e)
    return cached ? toInfo(cached) : null
  }
  if (doc.client_id !== clientId || !doc.redirect_uris.every(isAcceptableRedirect)) return null

  const values = { kind: 'cimd' as const, name: doc.client_name ?? new URL(clientId).hostname, redirectUris: doc.redirect_uris, updatedAt: now }
  await db
    .insert(oauthClients)
    .values({ clientId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: oauthClients.clientId, set: values })
  return { clientId, name: values.name, redirectUris: values.redirectUris, kind: 'cimd' }
}

export const fetchClientMetadata: MetadataFetcher = async (url) => {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.length > 64 * 1024) throw new Error('Tài liệu vượt 64 KB')
  return JSON.parse(text) as unknown
}
```

- [ ] **Step 5: Chạy test**

Run: `npx vitest run server/core/oauth-clients.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add server/core/oauth-error.ts server/core/oauth-clients.ts server/core/oauth-clients.test.ts
git commit -m "feat: OAuth client — DCR, Client ID Metadata Document, so khớp redirect loopback"
```

---

### Task 4: OAuth — code, token, refresh xoay vòng, xác minh, kết nối của tôi

**Files:**
- Create: `server/core/oauth-tokens.ts`, `server/core/oauth-tokens.test.ts`

**Interfaces:**
- Consumes: `OAuthError`, `ClientInfo`; `newToken`, `hashToken`; bảng `oauthCodes`, `oauthTokens`, `users`; `notFound`.
- Produces:
  - `ACCESS_TTL_S = 3600`, `REFRESH_TTL_MS = 90 * 86_400_000`, `CODE_TTL_MS = 60_000`, `SCOPE = 'work'`
  - `s256(verifier: string): string`
  - `createAuthCode(db, p: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; resource: string }, now: Date): Promise<string>`
  - `interface TokenPair { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }`
  - `exchangeCode(db, p: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string }, client: ClientInfo, now: Date): Promise<TokenPair>`
  - `refreshTokens(db, p: { refreshToken: string; clientId: string; resource?: string }, now: Date): Promise<TokenPair>`
  - `interface AccessInfo { userId: string; clientId: string; tokenId: string; expiresAt: Date }`
  - `verifyAccessToken(db, token: string, resource: string, now: Date): Promise<AccessInfo | null>` (đồng thời cập nhật `lastUsedAt` và `users.lastSeenAt`, tối đa mỗi phút một lần)
  - `listConnections(db, userId: string, now: Date): Promise<ClaudeLinkDTO[]>`
  - `revokeConnection(db, userId: string, id: string, now: Date): Promise<void>`

- [ ] **Step 1: Viết test `server/core/oauth-tokens.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import type { ClientInfo } from './oauth-clients.js'
import { createAuthCode, exchangeCode, listConnections, refreshTokens, revokeConnection, s256, verifyAccessToken } from './oauth-tokens.js'

const now = new Date('2026-10-05T03:00:00Z')
const RES = 'https://ws.test/mcp'
const client: ClientInfo = { clientId: 'dcr_1', name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], kind: 'dcr' }
const verifier = 'v'.repeat(50)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

async function issue(userId: string) {
  const code = await createAuthCode(db, { clientId: 'dcr_1', userId, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
  return exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES }, client, now)
}

describe('s256', () => {
  it('khớp ví dụ RFC 7636 phụ lục B', () => {
    expect(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('exchangeCode', () => {
  it('đổi code lấy cặp token Bearer 1 giờ', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'work' })
    expect(await verifyAccessToken(db, t.access_token, RES, now)).toMatchObject({ userId: u.id, clientId: 'dcr_1' })
  })

  it('code chỉ dùng được một lần', async () => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    const p = { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES }
    await exchangeCode(db, p, client, now)
    await expect(exchangeCode(db, p, client, now)).rejects.toMatchObject({ error: 'invalid_grant' })
  })

  it.each([
    ['verifier sai', { codeVerifier: 'x'.repeat(50) }, 'invalid_grant'],
    ['redirect khác', { redirectUri: 'https://claude.ai/khac' }, 'invalid_grant'],
    ['client khác', { clientId: 'dcr_2' }, 'invalid_grant'],
    ['resource khác', { resource: 'https://khac.test/mcp' }, 'invalid_target'],
  ])('%s → %s', async (_n, over, err) => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    await expect(exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier, resource: RES, ...over }, client, now)).rejects.toMatchObject({ error: err })
  })

  it('code hết hạn sau 60 giây', async () => {
    const u = await makeUser(db)
    const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256(verifier), resource: RES }, now)
    await expect(exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: verifier }, client, new Date(now.getTime() + 61_000))).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('verifyAccessToken', () => {
  it('token cho resource khác → null; hết hạn → null; người bị vô hiệu → null', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    expect(await verifyAccessToken(db, t.access_token, 'https://khac.test/mcp', now)).toBeNull()
    expect(await verifyAccessToken(db, t.access_token, RES, new Date(now.getTime() + 3601_000))).toBeNull()
    await db.update(users).set({ active: false }).where(eq(users.id, u.id))
    expect(await verifyAccessToken(db, t.access_token, RES, now)).toBeNull()
  })

  it('ghi lastSeenAt cho người dùng (hiện diện Claude)', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await verifyAccessToken(db, t.access_token, RES, now)
    const [row] = await db.select().from(users).where(eq(users.id, u.id))
    expect(row.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })
})

describe('refreshTokens', () => {
  it('xoay vòng: cặp mới dùng được, refresh cũ và access cũ hết hiệu lực', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    const later = new Date(now.getTime() + 3000_000)
    const t2 = await refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: RES }, later)
    expect(t2.refresh_token).not.toBe(t.refresh_token)
    expect(await verifyAccessToken(db, t2.access_token, RES, later)).not.toBeNull()
    expect(await verifyAccessToken(db, t.access_token, RES, later)).toBeNull()
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1' }, later)).rejects.toMatchObject({ error: 'invalid_grant' })
  })

  it('client khác hoặc người bị vô hiệu → invalid_grant', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_2' }, now)).rejects.toMatchObject({ error: 'invalid_grant' })
    await db.update(users).set({ active: false }).where(eq(users.id, u.id))
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1' }, now)).rejects.toMatchObject({ error: 'invalid_grant' })
  })
})

describe('listConnections / revokeConnection', () => {
  it('liệt kê kết nối của mình; ngắt → token chết; không ngắt được của người khác', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    const ta = await issue(a.id)
    await issue(b.id)
    const links = await listConnections(db, a.id, now)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ clientName: 'Claude', lastUsedAt: null })
    await expect(revokeConnection(db, b.id, links[0].id, now)).rejects.toMatchObject({ code: 'not_found' })
    await revokeConnection(db, a.id, links[0].id, now)
    expect(await verifyAccessToken(db, ta.access_token, RES, now)).toBeNull()
    expect(await listConnections(db, a.id, now)).toEqual([])
  })

  it('id không phải UUID → not_found', async () => {
    const a = await makeUser(db)
    await expect(revokeConnection(db, a.id, 'abc', now)).rejects.toMatchObject({ code: 'not_found' })
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/oauth-tokens.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/core/oauth-tokens.ts`**

```ts
import { createHash } from 'node:crypto'
import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import type { ClaudeLinkDTO } from '../../shared/dto.js'
import { oauthCodes, oauthTokens, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { notFound } from './errors.js'
import type { ClientInfo } from './oauth-clients.js'
import { OAuthError } from './oauth-error.js'
import { hashToken, isUuid, newToken } from './tokens.js'

export const ACCESS_TTL_S = 3600
export const REFRESH_TTL_MS = 90 * 86_400_000
export const CODE_TTL_MS = 60_000
export const SCOPE = 'work'
const TOUCH_EVERY_MS = 60_000

export interface TokenPair {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export interface AccessInfo {
  userId: string
  clientId: string
  tokenId: string
  expiresAt: Date
}

export const s256 = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url')

const grant = (m: string) => new OAuthError('invalid_grant', m)

export async function createAuthCode(
  db: Db,
  p: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; resource: string },
  now: Date,
): Promise<string> {
  const code = newToken()
  await db.insert(oauthCodes).values({ codeHash: hashToken(code), ...p, expiresAt: new Date(now.getTime() + CODE_TTL_MS) })
  return code
}

function newPair(now: Date) {
  const access = newToken()
  const refresh = newToken()
  return {
    access,
    refresh,
    cols: {
      accessHash: hashToken(access),
      refreshHash: hashToken(refresh),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  }
}

const toPair = (access: string, refresh: string): TokenPair => ({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE })

export async function exchangeCode(
  db: Db,
  p: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string },
  client: ClientInfo,
  now: Date,
): Promise<TokenPair> {
  // Đánh dấu đã dùng NGUYÊN TỬ: hai yêu cầu đổi cùng code thì chỉ một bên nhận được hàng.
  const [row] = await db
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.codeHash, hashToken(p.code)), isNull(oauthCodes.usedAt)))
    .returning()
  if (!row) throw grant('Mã ủy quyền không hợp lệ hoặc đã được dùng')
  if (row.expiresAt <= now) throw grant('Mã ủy quyền đã hết hạn')
  if (row.clientId !== p.clientId || row.clientId !== client.clientId) throw grant('Mã ủy quyền không thuộc client này')
  if (row.redirectUri !== p.redirectUri) throw grant('redirect_uri không khớp với lúc ủy quyền')
  if (s256(p.codeVerifier) !== row.codeChallenge) throw grant('code_verifier không khớp (PKCE)')
  if (p.resource && p.resource.replace(/\/+$/, '') !== row.resource) throw new OAuthError('invalid_target', 'resource không khớp với lúc ủy quyền')

  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  if (!owner?.active) throw grant('Tài khoản không còn hoạt động')

  const pair = newPair(now)
  await db.insert(oauthTokens).values({ userId: row.userId, clientId: client.clientId, clientName: client.name, resource: row.resource ?? '', ...pair.cols })
  return toPair(pair.access, pair.refresh)
}

export async function refreshTokens(db: Db, p: { refreshToken: string; clientId: string; resource?: string }, now: Date): Promise<TokenPair> {
  const pair = newPair(now)
  // Xoay vòng nguyên tử: refresh cũ hết hiệu lực trong cùng câu lệnh phát cặp mới.
  const [row] = await db
    .update(oauthTokens)
    .set(pair.cols)
    .where(
      and(
        eq(oauthTokens.refreshHash, hashToken(p.refreshToken)),
        eq(oauthTokens.clientId, p.clientId),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.refreshExpiresAt, now),
      ),
    )
    .returning()
  if (!row) throw grant('Refresh token không hợp lệ, đã dùng hoặc đã hết hạn')
  if (p.resource && p.resource.replace(/\/+$/, '') !== row.resource) throw new OAuthError('invalid_target', 'resource không khớp')
  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  if (!owner?.active) {
    await db.update(oauthTokens).set({ revokedAt: now }).where(eq(oauthTokens.id, row.id))
    throw grant('Tài khoản không còn hoạt động')
  }
  return toPair(pair.access, pair.refresh)
}

export async function verifyAccessToken(db: Db, token: string, resource: string, now: Date): Promise<AccessInfo | null> {
  const [hit] = await db
    .select({ t: oauthTokens })
    .from(oauthTokens)
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(
        eq(oauthTokens.accessHash, hashToken(token)),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.accessExpiresAt, now),
        eq(oauthTokens.resource, resource),
        eq(users.active, true),
      ),
    )
    .limit(1)
  if (!hit) return null
  const stale = new Date(now.getTime() - TOUCH_EVERY_MS)
  await db.update(oauthTokens).set({ lastUsedAt: now }).where(and(eq(oauthTokens.id, hit.t.id), or(isNull(oauthTokens.lastUsedAt), lt(oauthTokens.lastUsedAt, stale))))
  await db.update(users).set({ lastSeenAt: now }).where(and(eq(users.id, hit.t.userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, stale))))
  return { userId: hit.t.userId, clientId: hit.t.clientId, tokenId: hit.t.id, expiresAt: hit.t.accessExpiresAt }
}

export async function listConnections(db: Db, userId: string, now: Date): Promise<ClaudeLinkDTO[]> {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt), gt(oauthTokens.refreshExpiresAt, now)))
    .orderBy(desc(oauthTokens.createdAt))
  return rows.map((r) => ({ id: r.id, clientName: r.clientName, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null }))
}

export async function revokeConnection(db: Db, userId: string, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) throw notFound('Không tìm thấy kết nối')
  const done = await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(and(eq(oauthTokens.id, id), eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id })
  if (done.length === 0) throw notFound('Không tìm thấy kết nối')
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server/core/oauth-tokens.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
git add server/core/oauth-tokens.ts server/core/oauth-tokens.test.ts
git commit -m "feat: OAuth token — code một lần, PKCE, refresh xoay vòng, gắn resource, ngắt kết nối"
```

---

### Task 5: OAuth qua HTTP — metadata, đăng ký, màn hình chấp thuận, token

**Files:**
- Create: `server/http/consent.ts`, `server/http/oauth.ts`, `server/http/oauth.test.ts`
- Modify: `server/http/app.ts` (AppDeps thêm `fetchClientMetadata`; gắn `oauthRoutes`), `server/http/app.test.ts` (truyền `fetchClientMetadata`), `api/router.ts`, `server/dev.ts`

**Interfaces:**
- Consumes: Task 3, Task 4, `requireUser`, `sameOrigin`, `sessionCookieName`, `userFromSession`.
- Produces:
  - `AppDeps.fetchClientMetadata: MetadataFetcher`
  - `mcpResource(cfg: Config): string` = `${publicUrl}/mcp`
  - `oauthRoutes(deps: AppDeps): Hono<AppEnv>` với: `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-protected-resource/mcp`, `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/authorize`, `POST /oauth/token`
  - `renderConsent(p: ConsentView): string`, `renderOAuthError(message: string): string`, `escapeHtml(s: string): string`

- [ ] **Step 1: Viết test `server/http/oauth.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { s256 } from '../core/oauth-tokens.js'
import { createSession } from '../core/sessions.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://accounts.google.test/auth'), exchange: async () => { throw new Error('không dùng') } }
const CB = 'https://claude.ai/api/mcp/auth_callback'
const verifier = 'v'.repeat(60)

let db: Db
let app: ReturnType<typeof createApp>
let cimdDoc: unknown
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  cimdDoc = null
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => cimdDoc })
})

async function login() {
  const u = await makeUser(db, { name: 'Logan' })
  const s = await createSession(db, u.id, now)
  return { user: u, cookie: `__Host-ws_session=${s.token}` }
}

async function register() {
  const res = await app.request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CB] }) })
  expect(res.status).toBe(201)
  return (await res.json()).client_id as string
}

function authorizeQuery(clientId: string, over: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: CB, code_challenge: s256(verifier), code_challenge_method: 'S256',
    state: 'st-1', scope: 'work', resource: 'https://ws.test/mcp', ...over,
  })
}

async function approve(cookie: string, q: URLSearchParams) {
  const form = new URLSearchParams(q)
  form.set('decision', 'allow')
  return app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://ws.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
}

async function token(body: Record<string, string>) {
  return app.request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
}

describe('metadata', () => {
  it('authorization server metadata đủ điều kiện để Claude dùng CIMD', async () => {
    const m = await (await app.request('/.well-known/oauth-authorization-server')).json()
    expect(m).toMatchObject({
      issuer: 'https://ws.test',
      authorization_endpoint: 'https://ws.test/oauth/authorize',
      token_endpoint: 'https://ws.test/oauth/token',
      registration_endpoint: 'https://ws.test/oauth/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    })
  })

  it('protected resource metadata ở cả hai đường dẫn', async () => {
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      expect(await (await app.request(p)).json()).toMatchObject({ resource: 'https://ws.test/mcp', authorization_servers: ['https://ws.test'] })
    }
  })
})

describe('authorize', () => {
  it('chưa đăng nhập → chuyển sang Google kèm next quay lại đúng yêu cầu', async () => {
    const id = await register()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id)}`)
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!, 'https://ws.test')
    expect(loc.pathname).toBe('/auth/google')
    expect(loc.searchParams.get('next')).toMatch(/^\/oauth\/authorize\?/)
  })

  it('đã đăng nhập → màn hình chấp thuận có tên client, host redirect, chống nhúng iframe', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id)}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Claude')
    expect(html).toContain('claude.ai')
    expect(html).toContain('name="decision"')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('redirect_uri không thuộc client → trang lỗi 400, không redirect', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id, { redirect_uri: 'https://evil.com/cb' })}`, { headers: { cookie } })
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('client lạ → trang lỗi 400', async () => {
    const res = await app.request(`/oauth/authorize?${authorizeQuery('dcr_khong_co')}`)
    expect(res.status).toBe(400)
  })

  it('thiếu PKCE → redirect lỗi invalid_request kèm state và iss', async () => {
    const id = await register()
    const { cookie } = await login()
    const q = authorizeQuery(id)
    q.delete('code_challenge')
    const res = await app.request(`/oauth/authorize?${q}`, { headers: { cookie } })
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(CB)
    expect(loc.searchParams.get('error')).toBe('invalid_request')
    expect(loc.searchParams.get('state')).toBe('st-1')
    expect(loc.searchParams.get('iss')).toBe('https://ws.test')
  })

  it('resource lạ → redirect lỗi invalid_target', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await app.request(`/oauth/authorize?${authorizeQuery(id, { resource: 'https://khac.test/mcp' })}`, { headers: { cookie } })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invalid_target')
  })

  it('từ chối → access_denied', async () => {
    const id = await register()
    const { cookie } = await login()
    const form = authorizeQuery(id)
    form.set('decision', 'deny')
    const res = await app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://ws.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('access_denied')
  })

  it('POST chấp thuận từ origin lạ → 403', async () => {
    const id = await register()
    const { cookie } = await login()
    const form = authorizeQuery(id)
    form.set('decision', 'allow')
    const res = await app.request('/oauth/authorize', { method: 'POST', headers: { cookie, origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
    expect(res.status).toBe(403)
  })
})

describe('luồng đầy đủ', () => {
  it('DCR → chấp thuận → đổi code → refresh xoay vòng', async () => {
    const id = await register()
    const { cookie } = await login()
    const res = await approve(cookie, authorizeQuery(id))
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.searchParams.get('state')).toBe('st-1')
    expect(loc.searchParams.get('iss')).toBe('https://ws.test')
    const code = loc.searchParams.get('code')!

    const t1 = await token({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: id, code_verifier: verifier, resource: 'https://ws.test/mcp' })
    expect(t1.status).toBe(200)
    expect(t1.headers.get('cache-control')).toBe('no-store')
    const b1 = await t1.json()
    expect(b1).toMatchObject({ token_type: 'Bearer', expires_in: 3600 })

    const again = await token({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: id, code_verifier: verifier })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ error: 'invalid_grant' })

    const t2 = await token({ grant_type: 'refresh_token', refresh_token: b1.refresh_token, client_id: id })
    expect(t2.status).toBe(200)
    const old = await token({ grant_type: 'refresh_token', refresh_token: b1.refresh_token, client_id: id })
    expect(await old.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('CIMD: client_id là URL, Claude Code redirect loopback cổng bất kỳ', async () => {
    const url = 'https://claude.ai/oauth/claude-code-client-metadata'
    cimdDoc = { client_id: url, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'] }
    const { cookie } = await login()
    const q = authorizeQuery(url, { redirect_uri: 'http://localhost:51234/callback' })
    const page = await app.request(`/oauth/authorize?${q}`, { headers: { cookie } })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('máy của bạn')
    const res = await approve(cookie, q)
    const code = new URL(res.headers.get('location')!).searchParams.get('code')!
    const t = await token({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:51234/callback', client_id: url, code_verifier: verifier })
    expect(t.status).toBe(200)
  })

  it('grant_type lạ → unsupported_grant_type; thiếu tham số → invalid_request', async () => {
    expect(await (await token({ grant_type: 'password' })).json()).toMatchObject({ error: 'unsupported_grant_type' })
    expect(await (await token({ grant_type: 'authorization_code' })).json()).toMatchObject({ error: 'invalid_request' })
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/http/oauth.test.ts`
Expected: FAIL — `fetchClientMetadata` không có trong `AppDeps` / route chưa có (404).

- [ ] **Step 3: Viết `server/http/consent.ts`**

```ts
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

const PAGE_CSS = `
:root{--ink:#14161c;--paper:#efe9dc;--on-paper:#23201b;--on-paper-2:#5d564a;--needs:#ffb01f;--bad:#ff5c4d}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--ink);font-family:'Schibsted Grotesk',system-ui,sans-serif;display:grid;place-items:center;padding:24px;color:var(--on-paper)}
.card{width:min(460px,100%);background:var(--paper);border-radius:22px;padding:34px 32px 26px;box-shadow:0 40px 90px rgba(0,0,0,.55)}
.mark{width:46px;height:46px;border-radius:13px;background:var(--ink);color:var(--needs);display:grid;place-items:center;font:700 22px 'Bricolage Grotesque',system-ui;margin-bottom:18px}
h1{font:700 26px/1.15 'Bricolage Grotesque',system-ui;letter-spacing:-.02em;margin:0 0 8px}
p{margin:0 0 14px;color:var(--on-paper-2);font-size:15px;line-height:1.5}
.who{font-family:'DM Mono',ui-monospace,monospace;font-size:12.5px;color:var(--on-paper-2);margin-bottom:18px}
ul{margin:0 0 18px;padding-left:20px;font-size:14.5px;line-height:1.6}
.host{font-family:'DM Mono',ui-monospace,monospace;font-size:13px;background:rgba(20,22,28,.07);border-radius:8px;padding:8px 10px;margin-bottom:16px;word-break:break-all}
.warn{background:rgba(255,176,31,.18);border-radius:10px;padding:10px 12px;font-size:13.5px;color:#6b4a00;margin-bottom:16px}
.err{background:rgba(255,92,77,.14);border-radius:10px;padding:12px;font-size:14px;color:#a3271c}
.row{display:flex;gap:10px}
button{flex:1;height:48px;border-radius:13px;border:0;font:600 15px 'Schibsted Grotesk',system-ui;cursor:pointer}
.allow{background:var(--ink);color:#e8eaf0}.deny{background:transparent;border:1px solid rgba(20,22,28,.25);color:var(--on-paper)}
button:focus-visible{outline:2px solid var(--needs);outline-offset:3px}
`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Work System</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Schibsted+Grotesk:wght@400..700&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style></head><body><main class="card"><div class="mark">W</div>${body}</main></body></html>`
}

export interface ConsentView {
  userName: string
  userEmail: string
  clientName: string
  redirectHost: string
  loopback: boolean
  hidden: Record<string, string>
}

export function renderConsent(v: ConsentView): string {
  const inputs = Object.entries(v.hidden)
    .map(([k, val]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(val)}">`)
    .join('')
  return page(
    'Cho phép kết nối',
    `<h1>${escapeHtml(v.clientName)} muốn nối vào Work System của bạn</h1>
<div class="who">${escapeHtml(v.userName)} · ${escapeHtml(v.userEmail)}</div>
<p>Khi cho phép, ứng dụng này sẽ thay bạn:</p>
<ul><li>Đọc, tạo và cập nhật task của bạn</li><li>Ghi kết quả mỗi lần chạy và báo cáo tuần</li><li>Không đọc hay ghi được dữ liệu của người khác</li></ul>
<p>Sau khi cho phép, bạn sẽ được đưa về:</p>
<div class="host">${escapeHtml(v.redirectHost)}</div>
${v.loopback ? '<div class="warn">Ứng dụng này chạy trên máy của bạn (localhost). Chỉ cho phép nếu bạn vừa bấm kết nối từ Claude Code.</div>' : ''}
<form method="post" action="/oauth/authorize">${inputs}
<div class="row"><button class="deny" name="decision" value="deny">Từ chối</button><button class="allow" name="decision" value="allow" autofocus>Cho phép</button></div>
</form>
<p style="margin:16px 0 0;font-size:12.5px">Bạn có thể ngắt kết nối bất cứ lúc nào ở mục Kết nối trên Work System.</p>`,
  )
}

export function renderOAuthError(message: string): string {
  return page('Không kết nối được', `<h1>Không kết nối được</h1><div class="err">${escapeHtml(message)}</div><p style="margin-top:14px">Quay lại Claude và thử thêm connector lần nữa. Nếu vẫn lỗi, gửi ảnh màn hình này cho admin.</p>`)
}
```

- [ ] **Step 4: Viết `server/http/oauth.ts`**

```ts
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import type { Config } from '../config.js'
import { isLoopback, redirectMatches, registerClient, resolveClient, type ClientInfo } from '../core/oauth-clients.js'
import { OAuthError } from '../core/oauth-error.js'
import { SCOPE, createAuthCode, exchangeCode, refreshTokens } from '../core/oauth-tokens.js'
import { userFromSession } from '../core/sessions.js'
import { renderConsent, renderOAuthError } from './consent.js'
import { sameOrigin, sessionCookieName, type AppDeps, type AppEnv } from './app.js'

export const mcpResource = (cfg: Config) => `${cfg.publicUrl}/mcp`
const AUTH_PARAMS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const

type AuthorizeCheck =
  | { kind: 'page'; message: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'ok'; client: ClientInfo; params: Record<string, string> }

export function oauthRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>()
  const pub = deps.config.publicUrl
  const resource = mcpResource(deps.config)

  const metaCors = cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'authorization', 'mcp-protocol-version'] })
  r.use('/.well-known/*', metaCors)
  r.use('/oauth/token', metaCors)
  r.use('/oauth/register', metaCors)

  r.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer: pub,
      authorization_endpoint: `${pub}/oauth/authorize`,
      token_endpoint: `${pub}/oauth/token`,
      registration_endpoint: `${pub}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    }),
  )

  const prm = (c: Context<AppEnv>) =>
    c.json({ resource, authorization_servers: [pub], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'Work System' })
  r.get('/.well-known/oauth-protected-resource', prm)
  r.get('/.well-known/oauth-protected-resource/mcp', prm)

  const oauthJson = (c: Context<AppEnv>, e: unknown) => {
    if (e instanceof OAuthError) return c.json({ error: e.error, error_description: e.message }, e.status)
    throw e
  }

  r.post('/oauth/register', async (c) => {
    try {
      const body = await c.req.json().catch(() => null)
      return c.json(await registerClient(deps.db, body, deps.now()), 201)
    } catch (e) {
      return oauthJson(c, e)
    }
  })

  function errorRedirect(redirectUri: string, error: string, description: string, state: string | undefined): string {
    const u = new URL(redirectUri)
    u.searchParams.set('error', error)
    u.searchParams.set('error_description', description)
    if (state) u.searchParams.set('state', state)
    u.searchParams.set('iss', pub)
    return u.toString()
  }

  async function checkAuthorize(params: Record<string, string>): Promise<AuthorizeCheck> {
    const client = params.client_id ? await resolveClient(deps.db, params.client_id, deps.fetchClientMetadata, deps.now()) : null
    if (!client) return { kind: 'page', message: 'Ứng dụng yêu cầu kết nối không xác định được (client_id không hợp lệ).' }
    if (!params.redirect_uri || !redirectMatches(client.redirectUris, params.redirect_uri)) {
      return { kind: 'page', message: 'Địa chỉ quay về (redirect_uri) không thuộc ứng dụng này.' }
    }
    const back = (error: string, d: string): AuthorizeCheck => ({ kind: 'redirect', url: errorRedirect(params.redirect_uri, error, d, params.state) })
    if (params.response_type !== 'code') return back('unsupported_response_type', 'Chỉ hỗ trợ response_type=code')
    if (!params.code_challenge || params.code_challenge_method !== 'S256') return back('invalid_request', 'Cần PKCE với code_challenge_method=S256')
    if (params.resource && params.resource.replace(/\/+$/, '') !== resource) return back('invalid_target', `resource phải là ${resource}`)
    return { kind: 'ok', client, params }
  }

  const pickParams = (src: Record<string, unknown>) =>
    Object.fromEntries(AUTH_PARAMS.flatMap((k) => (typeof src[k] === 'string' && src[k] !== '' ? [[k, src[k] as string]] : [])))

  const htmlHeaders = { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'cache-control': 'no-store' }

  r.get('/oauth/authorize', async (c) => {
    const params = pickParams(c.req.query())
    const check = await checkAuthorize(params)
    if (check.kind === 'page') return c.html(renderOAuthError(check.message), 400, htmlHeaders)
    if (check.kind === 'redirect') return c.redirect(check.url)

    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) {
      const here = `/oauth/authorize?${new URLSearchParams(params).toString()}`
      return c.redirect(`/auth/google?next=${encodeURIComponent(here)}`)
    }
    const target = new URL(params.redirect_uri)
    return c.html(
      renderConsent({
        userName: user.name, userEmail: user.email, clientName: check.client.name,
        redirectHost: target.host, loopback: isLoopback(target), hidden: params,
      }),
      200,
      htmlHeaders,
    )
  })

  r.post('/oauth/authorize', sameOrigin(deps), async (c) => {
    const token = getCookie(c, sessionCookieName(deps.config))
    const user = token ? await userFromSession(deps.db, token, deps.now()) : null
    if (!user) return c.html(renderOAuthError('Phiên đăng nhập đã hết. Quay lại Claude và thử kết nối lại.'), 401, htmlHeaders)

    const form = await c.req.parseBody()
    const params = pickParams(form)
    const check = await checkAuthorize(params)
    if (check.kind === 'page') return c.html(renderOAuthError(check.message), 400, htmlHeaders)
    if (check.kind === 'redirect') return c.redirect(check.url)
    if (form.decision !== 'allow') return c.redirect(errorRedirect(params.redirect_uri, 'access_denied', 'Người dùng đã từ chối', params.state))

    const code = await createAuthCode(
      deps.db,
      { clientId: check.client.clientId, userId: user.id, redirectUri: params.redirect_uri, codeChallenge: params.code_challenge, resource },
      deps.now(),
    )
    const u = new URL(params.redirect_uri)
    u.searchParams.set('code', code)
    if (params.state) u.searchParams.set('state', params.state)
    u.searchParams.set('iss', pub)
    return c.redirect(u.toString())
  })

  r.post('/oauth/token', async (c) => {
    c.header('cache-control', 'no-store')
    try {
      const ct = c.req.header('content-type') ?? ''
      const raw = ct.includes('application/json') ? ((await c.req.json().catch(() => ({}))) as Record<string, unknown>) : await c.req.parseBody()
      const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : undefined)
      const need = (k: string) => {
        const v = s(k)
        if (!v) throw new OAuthError('invalid_request', `Thiếu tham số ${k}`)
        return v
      }

      if (s('grant_type') === 'authorization_code') {
        const clientId = need('client_id')
        const client = await resolveClient(deps.db, clientId, deps.fetchClientMetadata, deps.now())
        if (!client) throw new OAuthError('invalid_client', 'client_id không xác định', 401)
        const pair = await exchangeCode(
          deps.db,
          { code: need('code'), clientId, redirectUri: need('redirect_uri'), codeVerifier: need('code_verifier'), resource: s('resource') },
          client,
          deps.now(),
        )
        return c.json(pair)
      }
      if (s('grant_type') === 'refresh_token') {
        return c.json(await refreshTokens(deps.db, { refreshToken: need('refresh_token'), clientId: need('client_id'), resource: s('resource') }, deps.now()))
      }
      throw new OAuthError('unsupported_grant_type', 'Chỉ hỗ trợ authorization_code và refresh_token')
    } catch (e) {
      return oauthJson(c, e)
    }
  })

  return r
}
```

Lưu ý thứ tự trong `grant_type=authorization_code`: test "thiếu tham số → invalid_request" chỉ gửi `grant_type`, nên `need('client_id')` ném `invalid_request` trước khi tra client.

- [ ] **Step 5: Sửa `server/http/app.ts`**

Thêm import và trường `AppDeps`:

```ts
import type { MetadataFetcher } from '../core/oauth-clients.js'
import { oauthRoutes } from './oauth.js'
```

```ts
export interface AppDeps {
  db: Db
  config: Config
  google: GoogleAuth
  now: () => Date
  fetchClientMetadata: MetadataFetcher
}
```

Trong `createApp`, trước `app.route('/auth', …)`:

```ts
  app.route('/', oauthRoutes(deps))
```

- [ ] **Step 6: Truyền `fetchClientMetadata` ở mọi nơi tạo app**

- `server/http/app.test.ts`: trong `createApp({ db, config, google, now: () => now })` (2 chỗ) thêm `, fetchClientMetadata: async () => null`.
- `api/router.ts` và `server/dev.ts`: thêm `import { fetchClientMetadata } from '../server/core/oauth-clients.js'` (dev: `'./core/oauth-clients.js'`) và truyền `fetchClientMetadata` vào `createApp({...})`.

- [ ] **Step 7: Chạy test**

Run: `npx vitest run server/http`
Expected: tất cả PASS.

- [ ] **Step 8: Typecheck, toàn bộ test, commit**

Run: `npx tsc -b && npx vitest run`
Expected: sạch, PASS.

```bash
git add server api
git commit -m "feat: OAuth 2.1 cho connector — metadata, DCR, CIMD, màn hình chấp thuận, token"
```

---

### Task 6: MCP server — 5 tool cho Claude

**Files:**
- Create: `server/mcp/tools.ts`, `server/http/mcp.ts`, `server/http/mcp.test.ts`
- Modify: `server/http/app.ts` (gắn `/mcp`), `package.json`

**Interfaces:**
- Consumes: Task 2 (`createTask`, `updateTask`, `listMyTasks`, `getMyTask`, `reportRun`, `submitWeeklyReport`), Task 4 (`verifyAccessToken`, `SCOPE`), `mcpResource`, schema shared (`taskDefinitionSchema`, `taskPatchSchema`, `slugSchema`, `runReportSchema`, `weeklyReportInputSchema`), `AppError`.
- Produces: `registerTools(server: McpServer, deps: ToolDeps): void` với `ToolDeps = { db: Db; now: () => Date; publicUrl: string }`; `MCP_INSTRUCTIONS: string`; `mcpHandler(deps: AppDeps): (req: Request) => Promise<Response>`; route `ALL /mcp`.

- [ ] **Step 1: Cài thư viện MCP**

```bash
npm i mcp-handler@^2.2 @modelcontextprotocol/server@^2.3
```

- [ ] **Step 2: Viết test `server/http/mcp.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Config } from '../config.js'
import { createAuthCode, exchangeCode, s256 } from '../core/oauth-tokens.js'
import { tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb, type UserRow } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
const client = { clientId: 'dcr_1', name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], kind: 'dcr' as const }

let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
})

async function tokenFor(u: UserRow, resource = 'https://ws.test/mcp') {
  const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256('v'.repeat(50)), resource }, now)
  return (await exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: 'v'.repeat(50) }, client, now)).access_token
}

let rpcId = 0
async function rpc(token: string | null, method: string, params: unknown = {}) {
  rpcId += 1
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params }),
  })
  const text = await res.text()
  const data = text.split('\n').find((l) => l.startsWith('data: '))
  return { status: res.status, headers: res.headers, body: data ? JSON.parse(data.slice(6)) : text ? JSON.parse(text) : null }
}
const call = async (token: string, name: string, args: unknown) => (await rpc(token, 'tools/call', { name, arguments: args })).body.result as { isError?: boolean; content: { text: string }[] }

const newTask = { slug: 'upsell', name: 'Upsell', cron: '30 9,15 * * *', instructions: 'Gửi tin.', metrics: [{ label: 'Tin', value: '6' }] }

describe('/mcp xác thực', () => {
  it('không có token → 401 kèm resource_metadata', async () => {
    const r = await rpc(null, 'tools/list')
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata="https://ws.test/.well-known/oauth-protected-resource/mcp"')
  })

  it('token phát cho resource khác → 401', async () => {
    const u = await makeUser(db)
    expect((await rpc(await tokenFor(u, 'https://khac.test/mcp'), 'tools/list')).status).toBe(401)
  })

  it('người bị vô hiệu hóa → 401 ngay', async () => {
    const u = await makeUser(db)
    const t = await tokenFor(u)
    await db.update(users).set({ active: false }).where(eq(users.id, u.id))
    expect((await rpc(t, 'tools/list')).status).toBe(401)
  })

  it('liệt kê đúng 5 tool', async () => {
    const u = await makeUser(db)
    const r = await rpc(await tokenFor(u), 'tools/list')
    expect(r.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['bao_ket_qua', 'nop_bao_cao_tuan', 'sua_task', 'tao_task', 'xem_task'])
  })
})

describe('tool', () => {
  it('tao_task tạo task cho đúng chủ token và hiện diện Claude được ghi', async () => {
    const u = await makeUser(db)
    const res = await call(await tokenFor(u), 'tao_task', newTask)
    expect(res.isError).toBeFalsy()
    expect(res.content[0].text).toContain('upsell')
    const [row] = await db.select().from(tasks)
    expect(row.ownerId).toBe(u.id)
    const [me] = await db.select().from(users).where(eq(users.id, u.id))
    expect(me.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })

  it('tao_task trùng slug → isError có hướng dẫn dùng sua_task', async () => {
    const u = await makeUser(db)
    const t = await tokenFor(u)
    await call(t, 'tao_task', newTask)
    const res = await call(t, 'tao_task', newTask)
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('sua_task')
  })

  it('sua_task chỉ gửi một trường → các trường khác giữ nguyên', async () => {
    const u = await makeUser(db)
    const t = await tokenFor(u)
    await call(t, 'tao_task', newTask)
    expect((await call(t, 'sua_task', { slug: 'upsell', summary: 'Mới' })).isError).toBeFalsy()
    const [row] = await db.select().from(tasks)
    expect(row.summary).toBe('Mới')
    expect(row.metrics).toEqual([{ label: 'Tin', value: '6', note: '' }])
    expect(row.instructions).toBe('Gửi tin.')
  })

  it('bao_ket_qua cập nhật trạng thái; xem_task đọc lại được', async () => {
    const u = await makeUser(db)
    const t = await tokenFor(u)
    await call(t, 'tao_task', newTask)
    expect((await call(t, 'bao_ket_qua', { slug: 'upsell', status: 'failed', note: 'Crisp 500' })).isError).toBeFalsy()
    const res = await call(t, 'xem_task', { slug: 'upsell' })
    expect(res.content[0].text).toContain('"state": "blocked"')
    const list = await call(t, 'xem_task', {})
    expect(list.content[0].text).toContain('upsell')
  })

  it('không đụng được task của người khác', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await call(await tokenFor(a), 'tao_task', newTask)
    const res = await call(await tokenFor(b), 'bao_ket_qua', { slug: 'upsell', status: 'ok' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('không có task')
  })

  it('tham số sai kiểu → isError chỉ rõ trường', async () => {
    const u = await makeUser(db)
    const res = await call(await tokenFor(u), 'tao_task', { ...newTask, slug: 'Có Dấu' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('slug')
  })

  it('cron sai → isError có ví dụ cron đúng', async () => {
    const u = await makeUser(db)
    const res = await call(await tokenFor(u), 'tao_task', { ...newTask, cron: '0 25 * * *' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('0 9 * * 1-5')
  })

  it('nop_bao_cao_tuan mặc định tuần hiện tại', async () => {
    const u = await makeUser(db)
    const res = await call(await tokenFor(u), 'nop_bao_cao_tuan', { summary: 'Tuần ổn' })
    expect(res.content[0].text).toContain('2026-W41')
  })
})
```

- [ ] **Step 3: Chạy để thấy fail**

Run: `npx vitest run server/http/mcp.test.ts`
Expected: FAIL — `/mcp` trả 404 (chưa gắn route).

- [ ] **Step 4: Viết `server/mcp/tools.ts`**

```ts
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { runReportSchema, slugSchema, taskDefinitionSchema, taskPatchSchema, weeklyReportInputSchema } from '../../shared/schema.js'
import { users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { AppError, unauthorized } from '../core/errors.js'
import { createTask, getMyTask, listMyTasks, reportRun, submitWeeklyReport, updateTask } from '../core/tasks.js'
import type { User } from '../core/users.js'
import { eq } from 'drizzle-orm'

export interface ToolDeps {
  db: Db
  now: () => Date
  publicUrl: string
}

export const MCP_INSTRUCTIONS = [
  'Work System là bàn điều phối công việc của team BraveBits.',
  'Dùng tao_task để khai báo một việc định kỳ, sua_task để cập nhật, xem_task để xem, bao_ket_qua sau MỖI lần chạy (kể cả khi lỗi), nop_bao_cao_tuan cho báo cáo tuần.',
  'Đồng nghiệp xem được mọi thứ ghi vào đây: KHÔNG BAO GIỜ ghi mật khẩu, API key, token hay dữ liệu cá nhân của khách hàng.',
  'slug: chữ thường không dấu, số và dấu gạch ngang. cron: 5 trường, theo giờ Việt Nam.',
].join(' ')

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
const ok = (summary: string, data: unknown): ToolResult => ({ content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }] })
const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } }

export function registerTools(server: McpServer, deps: ToolDeps) {
  async function owner(ctx: Ctx): Promise<User> {
    const id = ctx.http?.authInfo?.extra?.userId
    if (typeof id !== 'string') throw unauthorized('Thiếu danh tính người dùng')
    const u = await deps.db.query.users.findFirst({ where: eq(users.id, id) })
    if (!u?.active) throw unauthorized('Tài khoản không còn hoạt động')
    return u
  }

  /** Bọc handler: lỗi nghiệp vụ → isError với thông điệp để Claude tự sửa; lỗi khác → thông điệp chung + log. */
  function guarded<A>(fn: (args: A, me: User) => Promise<ToolResult>) {
    return async (args: A, ctx: Ctx): Promise<ToolResult> => {
      try {
        return await fn(args, await owner(ctx))
      } catch (e) {
        if (e instanceof AppError) return fail(e.message)
        console.error('[mcp] lỗi tool', e)
        return fail('Máy chủ Work System gặp lỗi, thử lại sau ít phút.')
      }
    }
  }

  server.registerTool(
    'tao_task',
    {
      title: 'Tạo task',
      description: 'Khai báo một việc định kỳ mới của bạn trên Work System: tên, lịch cron (giờ VN), hướng dẫn Claude làm gì khi đến hạn, chỉ số, tiến độ, nút hành động, khối tùy chọn.',
      inputSchema: taskDefinitionSchema,
    },
    guarded(async (args: z.output<typeof taskDefinitionSchema>, me) => {
      const t = await createTask(deps.db, me, args, deps.now())
      return ok(`Đã tạo task "${t.name}" (slug: ${t.slug}). Lần chạy kế tiếp: ${t.nextRunAt?.toISOString() ?? 'chưa có'}. Xem tại ${deps.publicUrl}`, { slug: t.slug })
    }),
  )

  const patchInput = taskPatchSchema.extend({ slug: slugSchema })
  server.registerTool(
    'sua_task',
    {
      title: 'Sửa task',
      description: 'Cập nhật một phần task của bạn theo slug. Chỉ gửi những trường muốn đổi; mảng (metrics, blocks, actions, milestones…) được thay nguyên mảng.',
      inputSchema: patchInput,
    },
    guarded(async (args: z.output<typeof patchInput>, me) => {
      const { slug, ...patch } = args
      const t = await updateTask(deps.db, me, slug, patch, deps.now())
      return ok(`Đã cập nhật task "${t.name}".`, { slug: t.slug, nextRunAt: t.nextRunAt?.toISOString() ?? null })
    }),
  )

  const viewInput = z.object({ slug: slugSchema.optional() })
  server.registerTool(
    'xem_task',
    {
      title: 'Xem task',
      description: 'Không truyền slug: danh sách task của bạn. Truyền slug: chi tiết task cùng 10 lần chạy và 10 lệnh gần nhất.',
      inputSchema: viewInput,
    },
    guarded(async (args: z.output<typeof viewInput>, me) =>
      args.slug ? ok(`Chi tiết task ${args.slug}:`, await getMyTask(deps.db, me, args.slug)) : ok('Task của bạn:', await listMyTasks(deps.db, me)),
    ),
  )

  server.registerTool(
    'bao_ket_qua',
    {
      title: 'Báo kết quả chạy',
      description: 'Ghi kết quả MỘT lần chạy task (kể cả khi lỗi): status ok/partial/failed, ghi chú, log từng bước, và tùy chọn cập nhật trạng thái, chỉ số, tiến độ, xu hướng (trendThem), mốc, khối, báo cáo.',
      inputSchema: runReportSchema,
    },
    guarded(async (args: z.output<typeof runReportSchema>, me) => {
      const { task } = await reportRun(deps.db, me, args, deps.now())
      return ok(`Đã ghi kết quả cho "${task.name}". Trạng thái: ${task.stateLabel}.`, { slug: task.slug, state: task.state, nextRunAt: task.nextRunAt?.toISOString() ?? null })
    }),
  )

  server.registerTool(
    'nop_bao_cao_tuan',
    {
      title: 'Nộp báo cáo tuần',
      description: 'Nộp báo cáo tuần của bạn: tóm tắt, điều tốt, điều chưa ổn, việc tuần sau, mẫu hình lặp lại. Bỏ trống week = tuần hiện tại (ISO, giờ VN). Nộp lại cùng tuần sẽ ghi đè.',
      inputSchema: weeklyReportInputSchema,
    },
    guarded(async (args: z.output<typeof weeklyReportInputSchema>, me) => {
      const { week } = await submitWeeklyReport(deps.db, me, args, deps.now())
      return ok(`Đã nộp báo cáo tuần ${week}.`, { week })
    }),
  )
}
```

Nếu `registerTool` không nhận `taskDefinitionSchema` (schema có `.refine` ở cấp object) khi sinh JSON Schema cho `tools/list`, dùng `taskDefinitionBase` làm `inputSchema` và trong handler gọi `taskDefinitionSchema.safeParse(args)`; lỗi → `fail(zodMessage(error))`.

- [ ] **Step 5: Viết `server/http/mcp.ts`**

```ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { SCOPE, verifyAccessToken } from '../core/oauth-tokens.js'
import { MCP_INSTRUCTIONS, registerTools } from '../mcp/tools.js'
import type { AppDeps } from './app.js'
import { mcpResource } from './oauth.js'

export function mcpHandler(deps: AppDeps): (req: Request) => Promise<Response> {
  const resource = mcpResource(deps.config)
  const handler = createMcpHandler((server) => registerTools(server, { db: deps.db, now: deps.now, publicUrl: deps.config.publicUrl }), {
    serverInfo: { name: 'work-system', version: '1.0.0' },
    instructions: MCP_INSTRUCTIONS,
  })
  return withMcpAuth(
    handler,
    async (_req, bearer) => {
      if (!bearer) return undefined
      const info = await verifyAccessToken(deps.db, bearer, resource, deps.now())
      if (!info) return undefined
      return {
        token: bearer,
        clientId: info.clientId,
        scopes: [SCOPE],
        expiresAt: Math.floor(info.expiresAt.getTime() / 1000),
        resource: new URL(resource),
        extra: { userId: info.userId },
      }
    },
    { required: true, resourceUrl: deps.config.publicUrl, resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp' },
  )
}
```

- [ ] **Step 6: Gắn `/mcp` trong `server/http/app.ts`**

Thêm import `import { mcpHandler } from './mcp.js'` và trong `createApp`, sau `app.route('/', oauthRoutes(deps))`:

```ts
  const mcp = mcpHandler(deps)
  app.all('/mcp', (c) => mcp(c.req.raw))
```

- [ ] **Step 7: Chạy test**

Run: `npx vitest run server/http/mcp.test.ts`
Expected: tất cả PASS. Nếu header `www-authenticate` có đường dẫn khác `/.well-known/oauth-protected-resource/mcp`, đọc lại chữ ký `withMcpAuth` trong `node_modules/mcp-handler/dist/index.d.ts` (tham số `resourceMetadataPath`) và sửa cho khớp — cả hai đường dẫn metadata đều đã phục vụ ở Task 5.

- [ ] **Step 8: Typecheck, toàn bộ test, commit**

Run: `npx tsc -b && npx vitest run`
Expected: sạch, PASS.

```bash
git add package.json package-lock.json server/mcp server/http
git commit -m "feat: MCP server — tao_task, sua_task, xem_task, bao_ket_qua, nop_bao_cao_tuan"
```

---

### Task 7: Web — Claude của bạn: URL connector, danh sách kết nối, ngắt kết nối

**Files:**
- Modify: `server/http/api.ts`, `src/lib/types.ts`, `src/lib/data.ts`, `src/App.tsx`, `src/components/Connections.tsx`, `src/styles/team.css`
- Create: `server/http/connections.test.ts`

**Interfaces:**
- Consumes: `listConnections`, `revokeConnection`, `mcpResource`; DTO `MyConnectionsDTO`.
- Produces: `GET /api/connections` → `MyConnectionsDTO`; `POST /api/connections/:id/revoke` → `{ ok: true }`; `loadMyConnections()`, `revokeLink(id)`; `Connections` nhận thêm `claude: MyConnections | null`, `onRevoke: (id: string) => Promise<void>`.

- [ ] **Step 1: Viết test `server/http/connections.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { createAuthCode, exchangeCode, s256 } from '../core/oauth-tokens.js'
import { createSession } from '../core/sessions.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb, type UserRow } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
const client = { clientId: 'dcr_1', name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], kind: 'dcr' as const }

let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
})

async function link(u: UserRow) {
  const code = await createAuthCode(db, { clientId: 'dcr_1', userId: u.id, redirectUri: client.redirectUris[0], codeChallenge: s256('v'.repeat(50)), resource: 'https://ws.test/mcp' }, now)
  return exchangeCode(db, { code, clientId: 'dcr_1', redirectUri: client.redirectUris[0], codeVerifier: 'v'.repeat(50) }, client, now)
}
async function cookieFor(u: UserRow) {
  return `__Host-ws_session=${(await createSession(db, u.id, now)).token}`
}

describe('/api/connections', () => {
  it('trả URL connector và kết nối của chính mình', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await link(a)
    await link(b)
    const body = await (await app.request('/api/connections', { headers: { cookie: await cookieFor(a) } })).json()
    expect(body.connectorUrl).toBe('https://ws.test/mcp')
    expect(body.links).toHaveLength(1)
    expect(body.links[0].clientName).toBe('Claude')
  })

  it('ngắt kết nối của mình được; của người khác → 404; sai origin → 403', async () => {
    const a = await makeUser(db)
    const b = await makeUser(db)
    await link(a)
    const ca = await cookieFor(a)
    const id = (await (await app.request('/api/connections', { headers: { cookie: ca } })).json()).links[0].id
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: ca, origin: 'https://evil.test' } })).status).toBe(403)
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: await cookieFor(b), origin: 'https://ws.test' } })).status).toBe(404)
    expect((await app.request(`/api/connections/${id}/revoke`, { method: 'POST', headers: { cookie: ca, origin: 'https://ws.test' } })).status).toBe(200)
    expect((await (await app.request('/api/connections', { headers: { cookie: ca } })).json()).links).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/http/connections.test.ts`
Expected: FAIL — 404 cho `/api/connections`.

- [ ] **Step 3: Thêm route vào `server/http/api.ts`**

Import:

```ts
import { listConnections, revokeConnection } from '../core/oauth-tokens.js'
import { mcpResource } from './oauth.js'
```

Trước `return r`:

```ts
  r.get('/connections', async (c) =>
    c.json({ connectorUrl: mcpResource(deps.config), links: await listConnections(deps.db, c.get('user').id, deps.now()) }),
  )

  r.post('/connections/:id/revoke', async (c) => {
    await revokeConnection(deps.db, c.get('user').id, c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server/http/connections.test.ts`
Expected: PASS.

- [ ] **Step 5: Frontend — dữ liệu**

`src/lib/types.ts` thêm vào khối `export type { … } from '../../shared/dto'`: `ClaudeLinkDTO as ClaudeLink, MyConnectionsDTO as MyConnections`.

`src/lib/data.ts` thêm:

```ts
import type { MyConnections } from './types'

export const loadMyConnections = () => api<MyConnections>('/api/connections')
export const revokeLink = (id: string) => api<{ ok: true }>(`/api/connections/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
```

(gộp `MyConnections` vào dòng import kiểu đã có.)

- [ ] **Step 6: Frontend — `src/App.tsx`**

Trong `Shell`:
- Thêm state `const [claude, setClaude] = useState<MyConnections | null>(null)` (import `MyConnections` từ `./lib/types`, `loadMyConnections`, `revokeLink` từ `./lib/data`).
- Trong `refresh`, đổi `Promise.all([loadWorkspace(viewing), loadPeople()])` thành:

```ts
    Promise.all([loadWorkspace(viewing), loadPeople(), viewing === me.id ? loadMyConnections() : Promise.resolve(null)])
      .then(([w, p, cl]) => {
        setWs(w)
        setPeople(p)
        setClaude(cl)
        setErr(null)
      })
```

  và thêm `me.id` vào mảng phụ thuộc của `useCallback`: `[viewing, me.id]`.
- Thêm hàm:

```ts
  async function revoke(id: string) {
    await revokeLink(id)
    setToast('Đã ngắt kết nối Claude')
    refresh()
  }
```

- Đổi chỗ render Connections thành:

```tsx
              <Connections connections={ws.connections} tasks={ws.tasks} claude={ws.isMine ? claude : null} onRevoke={revoke} />
```

- [ ] **Step 7: Frontend — `src/components/Connections.tsx`**

Đổi chữ ký và thêm phần "Claude của bạn" ngay dưới `</header>`:

```tsx
import { useState } from 'react'
import type { ClaudeLink, Connection, MyConnections, Task } from '../lib/types'
import { ago } from '../lib/format'
```

```tsx
function ClaudePanel({ claude, onRevoke }: { claude: MyConnections; onRevoke: (id: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const now = new Date()

  async function copy() {
    try {
      await navigator.clipboard.writeText(claude.connectorUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="claude rise">
      <div className="claude__head">
        <h2 className="claude__title">Claude của bạn</h2>
        <span className={`lamp lamp--${claude.links.length ? 'run' : 'idle'}`}>
          <span className="lamp__dot" />
          {claude.links.length ? `${claude.links.length} kết nối` : 'Chưa nối'}
        </span>
      </div>
      <p className="claude__lede">
        Claude desktop → <b>Settings</b> → <b>Connectors</b> → <b>Add custom connector</b>, dán địa chỉ dưới đây rồi đăng nhập Google như bình thường.
      </p>
      <div className="claude__url">
        <code>{claude.connectorUrl}</code>
        <button onClick={copy}>{copied ? 'Đã chép' : 'Chép'}</button>
      </div>
      {claude.links.length > 0 && (
        <ul className="claude__links">
          {claude.links.map((l: ClaudeLink) => (
            <li key={l.id}>
              <div>
                <div className="claude__name">{l.clientName}</div>
                <div className="claude__meta">
                  Nối {ago(l.createdAt, now)} · {l.lastUsedAt ? `dùng gần nhất ${ago(l.lastUsedAt, now)}` : 'chưa gọi lần nào'}
                </div>
              </div>
              <button
                className={`claude__revoke${armed === l.id ? ' claude__revoke--armed' : ''}`}
                onClick={() => (armed === l.id ? onRevoke(l.id).finally(() => setArmed(null)) : setArmed(l.id))}
                onBlur={() => setArmed((a) => (a === l.id ? null : a))}
              >
                {armed === l.id ? 'Bấm lần nữa để ngắt' : 'Ngắt kết nối'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Đổi khai báo component chính:

```tsx
export default function Connections({
  connections,
  tasks,
  claude,
  onRevoke,
}: {
  connections: Connection[]
  tasks: Task[]
  claude: MyConnections | null
  onRevoke: (id: string) => Promise<void>
}) {
```

và chèn `{claude && <ClaudePanel claude={claude} onRevoke={onRevoke} />}` ngay sau thẻ `</header>` của trang.

- [ ] **Step 8: CSS — thêm vào cuối `src/styles/team.css`**

```css
/* ---------- Claude của bạn ---------- */
.claude {
  margin: 0 0 30px;
  padding: 22px 22px 18px;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--ink-raised), var(--ink));
  border: 1px solid var(--line);
}
.claude__head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.claude__title { font-family: var(--display); font-size: 20px; font-weight: 650; margin: 0; letter-spacing: -.01em; }
.claude__lede { color: var(--fg-2); font-size: 14px; margin: 0 0 14px; max-width: 70ch; }
.claude__lede b { color: var(--fg); font-weight: 600; }
.claude__url {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 14px;
  border-radius: 11px;
  background: var(--ink-sunken);
  border: 1px solid var(--line-soft);
}
.claude__url code { flex: 1; min-width: 0; font-family: var(--mono); font-size: 13.5px; color: var(--needs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.claude__url button {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  font-size: 13px;
  transition: border-color .2s var(--ease), background .2s var(--ease);
}
.claude__url button:hover { border-color: var(--needs); background: var(--needs-dim); }
.claude__links { list-style: none; margin: 16px 0 0; padding: 0; }
.claude__links li {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--line-soft);
}
.claude__name { font-weight: 600; }
.claude__meta { color: var(--fg-3); font-size: 12.5px; font-family: var(--mono); margin-top: 2px; }
.claude__revoke {
  flex: none;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  color: var(--fg-2);
  font-size: 13px;
  transition: all .2s var(--ease);
}
.claude__revoke:hover { color: var(--bad); border-color: rgba(255, 92, 77, .45); }
.claude__revoke--armed { color: var(--bad); border-color: var(--bad); background: var(--bad-dim); }
@media (max-width: 720px) {
  .claude__links li { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 9: Typecheck, build, toàn bộ test, xem giao diện**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

Chạy `npm run dev`, đăng nhập dev, mở mục **Kết nối**: thấy khối "Claude của bạn" với URL `http://localhost:5173/mcp`, nút Chép hoạt động; xem bàn đồng nghiệp → khối này không hiện.

- [ ] **Step 10: Commit**

```bash
git add server/http src
git commit -m "feat(web): Claude của bạn — URL connector, danh sách và ngắt kết nối"
```

---

### Task 8: Tài liệu và kiểm tra thật với Claude desktop

**Files:**
- Modify: `README.md`

**Interfaces:** không có.

- [ ] **Step 1: Thêm mục vào `README.md`, sau mục "Triển khai (Vercel)"**

````markdown
## Nối Claude desktop

Claude nối vào Work System qua máy chủ của Anthropic, nên app phải có **địa chỉ HTTPS công khai** (bản Vercel). `localhost` không dùng được cho connector.

1. Trên Work System (bản Vercel) → mục **Kết nối** → chép địa chỉ connector (`https://<domain>/mcp`).
2. Claude desktop → **Settings → Connectors → Add custom connector** → dán địa chỉ → **Connect**.
3. Trình duyệt mở trang đăng nhập Google → màn hình "Claude muốn nối vào Work System của bạn" → **Cho phép**.
4. Trong một cuộc trò chuyện mới: "Dùng Work System, xem task của tôi" — Claude gọi `xem_task`.

Kiểm tra máy chủ MCP không cần Claude: `npx @modelcontextprotocol/inspector` → Transport *Streamable HTTP* → URL `https://<domain>/mcp` → *Connect* (đi qua đúng luồng OAuth).

Ngắt kết nối: mục **Kết nối** → **Ngắt kết nối** (bấm hai lần). Admin vô hiệu hóa một người cũng ngắt mọi kết nối Claude của người đó.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: hướng dẫn nối Claude desktop"
```

- [ ] **Step 3: Kiểm tra thật** (cần người dùng: đã deploy Vercel theo README kế hoạch 1, thêm `https://<domain>/auth/google/callback` vào Google OAuth client)

```bash
curl -s https://<domain>/.well-known/oauth-authorization-server | head -c 300   # Expected: JSON có client_id_metadata_document_supported
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<domain>/mcp         # Expected: 401
```

Nối Claude desktop theo README → gõ "tạo task thử tên 'thu-ket-noi', chạy 9h sáng các ngày trong tuần, hướng dẫn: chỉ báo kết quả ok" → task xuất hiện trên bàn điều phối; "báo kết quả task thu-ket-noi là ok" → lần chạy hiện trong tab Lần chạy; Đội ngũ hiện "Claude đang trực".
