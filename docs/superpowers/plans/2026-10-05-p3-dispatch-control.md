# Work System — Kế hoạch 3/4: Điều phối & điều khiển từ web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude của mỗi người gọi `dieu_phoi` mỗi 15 phút để nhận việc đến hạn và lệnh từ web (có lease chống chạy trùng, báo kết quả idempotent); chủ task trên web bấm nút hành động, xem vé lệnh đi qua từng trạng thái, sửa lịch cron, tạm dừng, chỉnh khung giờ; web hiện trạng thái Claude (trực / offline / ngoài giờ) và hiển thị khối tùy chọn (bảng, checklist, biểu đồ, ghi chú).

**Architecture:** Lõi mới `server/core/dispatch.ts` (gắn lease bằng `UPDATE … RETURNING` trong một transaction), `server/core/control.ts` (lệnh, lịch, tạm dừng, khung giờ — chỉ chủ task), `server/core/presence.ts` (giờ làm việc, hiện diện, lần Điều phối kế tiếp). `reportRun` nhận `leaseId` để idempotent và đóng lệnh. Web gọi các route mới qua `/api`; MCP thêm tool `dieu_phoi`.

**Tech Stack:** như kế hoạch 1–2. Biểu đồ vẽ bằng SVG thuần trong React.

**Spec:** `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md` (mục 5 `commands`, mục 6, mục 7 `dieu_phoi`, mục 9, mục 10)

## Global Constraints

- Mọi ràng buộc chung của kế hoạch 1–2.
- Lease hạn **60 phút**; lệnh `claimed` quá 60 phút → `expired`; tối đa **5** lệnh `pending` mỗi task; ghi chú lệnh ≤ **1.000** ký tự.
- Lỡ lịch chỉ chạy bù **một** lần; bỏ tạm dừng tính `nextRunAt` từ **now**.
- "Offline" = quá **30 phút** không có heartbeat **trong** khung giờ làm việc; ngoài khung giờ là "ngoài giờ", không báo động.
- Điều phối chạy theo bước **15 phút** trong khung giờ làm việc (giờ VN).
- Chỉ chủ task tạo/hủy lệnh, sửa lịch, tạm dừng; đồng nghiệp chỉ xem (API trả 404 với task không phải của mình).
- Biểu đồ khối `chart`: tối đa **3** series (xem Task 1 — ràng buộc màu), màu series lần lượt `#3987e5`, `#008300`, `#d55181` (đã chạy `validate_palette.js --pairs all --mode dark --surface #1c1f27`: ALL PASS); legend luôn có khi ≥ 2 series, nhãn trực tiếp giá trị cuối, có tooltip khi rê chuột và nút xem dạng bảng.

## Review Focus

1. Hai lần `dieu_phoi` gọi liền nhau (lần đầu Claude chưa báo xong) → lần hai không trả lại việc đã giao. (Task 3)
2. Claude gửi `bao_ket_qua` hai lần với cùng `leaseId` (thử lại sau timeout) → chỉ một run, lệnh không bị đóng hai lần. (Task 4)
3. Bấm "Chạy ngay" đúng lúc task đến lịch → chỉ giao một việc. (Task 3)
4. Đồng nghiệp gọi API tạo lệnh / sửa lịch trên task của người khác → 404, không tạo gì. (Task 5)
5. Khối ghi chú chứa HTML/script do Claude gửi → hiển thị như chữ, không chạy. (Task 8)

---

## File Structure

```
shared/schema.ts        (sửa) chartSeries=3; runReport.leaseId; commandInput, scheduleInput, pauseInput, workHours
shared/cronSlots.ts     (sửa) export expandField
shared/cronText.ts      describeCron — mô tả cron tiếng Việt
shared/dto.ts           (sửa) Presence 'resting'; PersonDTO.nextDispatchAt; DispatchItem; SchedulePreviewDTO
server/core/time.ts     (sửa) vnClock
server/core/presence.ts inWorkHours, presenceOf, nextDispatchAt
server/core/dispatch.ts dispatch (lease)
server/core/tasks.ts    (sửa) export findOwnTask/assertCron; reportRun nhận leaseId
server/core/control.ts  createCommand, cancelCommand, setSchedule, setPaused, setWorkHours, previewSchedule
server/core/workspace.ts (sửa) dùng presence.ts
server/http/api.ts      (sửa) route điều khiển
server/mcp/tools.ts     (sửa) dieu_phoi; hướng dẫn
src/lib/miniMarkdown.ts markdown giới hạn → cây an toàn
src/lib/data.ts, src/lib/types.ts (sửa)
src/components/Bits.tsx (sửa) Key chờ Promise
src/components/Blocks.tsx  bảng, checklist, biểu đồ, ghi chú
src/components/Commands.tsx  vé lệnh + thanh hành động
src/components/Presence.tsx  thanh trạng thái Claude
src/components/WorkHours.tsx khung giờ Điều phối
src/components/TaskSpace.tsx, Desk.tsx, Schedule.tsx, Connections.tsx, src/App.tsx (sửa)
src/styles/control.css  CSS mới
```

---

### Task 1: Schema, mô tả cron tiếng Việt, DTO

**Files:**
- Modify: `shared/schema.ts`, `shared/schema.test.ts`, `shared/cronSlots.ts`, `shared/dto.ts`
- Create: `shared/cronText.ts`, `shared/cronText.test.ts`

**Interfaces:**
- Produces: `LIMITS.chartSeries = 3`; `runReportSchema` thêm `leaseId?: string (uuid)`; `commandInputSchema` (`{ actionId: string; note?: string }`), `scheduleInputSchema` (`{ cron: string; scheduleLabel?: string }`), `pauseInputSchema` (`{ paused: boolean }`), `workHoursSchema` (`{ workDays: number[]; workStart: string; workEnd: string }`) cùng kiểu `CommandInput`, `ScheduleInput`, `WorkHours`; `expandField(field: string, min: number, max: number): number[]`; `describeCron(expr: string): string | null`; DTO `Presence = 'online' | 'offline' | 'resting' | 'never'`, `PersonDTO.nextDispatchAt: string | null`, `DispatchItem`, `SchedulePreviewDTO { valid: boolean; label: string | null; next: string[] }`.

- [ ] **Step 1: Viết test**

Thêm vào cuối `shared/schema.test.ts`:

```ts
import { commandInputSchema, workHoursSchema } from './schema.js'

describe('giới hạn biểu đồ', () => {
  it('tối đa 3 series (giới hạn bảng màu an toàn cho mù màu)', () => {
    const s = (name: string) => ({ name, values: [1, 2] })
    const chart = (n: number) => ({ id: 'c', type: 'chart', title: 'C', data: { kind: 'line', labels: ['a', 'b'], series: Array.from({ length: n }, (_, i) => s(`s${i}`)) } })
    expect(blockSchema.safeParse(chart(3)).success).toBe(true)
    expect(blockSchema.safeParse(chart(4)).success).toBe(false)
  })
})

describe('runReportSchema.leaseId', () => {
  it('nhận uuid, từ chối chuỗi rác', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', leaseId: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f' }).success).toBe(true)
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', leaseId: 'abc' }).success).toBe(false)
  })
})

describe('commandInputSchema', () => {
  it('ghi chú tối đa 1000 ký tự', () => {
    expect(commandInputSchema.safeParse({ actionId: 'run', note: 'x'.repeat(1000) }).success).toBe(true)
    expect(commandInputSchema.safeParse({ actionId: 'run', note: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('workHoursSchema', () => {
  it('nhận khung giờ hợp lệ', () => {
    expect(workHoursSchema.safeParse({ workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }).success).toBe(true)
  })
  it.each([
    [{ workDays: [], workStart: '08:00', workEnd: '19:00' }],
    [{ workDays: [1], workStart: '19:00', workEnd: '08:00' }],
    [{ workDays: [1], workStart: '8:00', workEnd: '19:00' }],
    [{ workDays: [1, 1], workStart: '08:00', workEnd: '19:00' }],
    [{ workDays: [7], workStart: '08:00', workEnd: '19:00' }],
  ])('từ chối %j', (v) => expect(workHoursSchema.safeParse(v).success).toBe(false))
})
```

Tạo `shared/cronText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describeCron } from './cronText.js'

describe('describeCron', () => {
  it.each([
    ['0 16 * * 5', '16:00 · T6'],
    ['30 9,15 * * *', '09:30 và 15:30 · mỗi ngày'],
    ['0 9 * * 1-5', '09:00 · T2–T6'],
    ['0 8 * * 0,6', '08:00 · T7, CN'],
    ['0 6,12,18 * * 1,3,5', '06:00, 12:00 và 18:00 · T2, T4, T6'],
    ['*/15 8-18 * * 1-5', 'mỗi 15 phút, 08:00–18:59 · T2–T6'],
    ['0 * * * *', 'mỗi giờ, phút 00 · mỗi ngày'],
  ])('%s → %s', (e, t) => expect(describeCron(e)).toBe(t))

  it('có ngày-trong-tháng hoặc tháng → null (hiển thị cron thô)', () => {
    expect(describeCron('0 9 1 * *')).toBeNull()
    expect(describeCron('0 9 * 3 *')).toBeNull()
  })

  it('cron sai → null', () => {
    expect(describeCron('x')).toBeNull()
    expect(describeCron('0 25 * * *')).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run shared`
Expected: FAIL — `commandInputSchema`, `./cronText.js` chưa có; test 4 series vẫn PASS (chartSeries đang 4) nên FAIL ở `chart(4)`.

- [ ] **Step 3: Sửa `shared/schema.ts`**

Đổi `chartSeries: 4,` thành `chartSeries: 3,`.

Trong `runReportSchema`, thêm sau `slug: slugSchema,`:

```ts
  leaseId: z.uuid('leaseId phải là UUID nhận từ dieu_phoi').optional(),
```

Thêm vào cuối file:

```ts
export const commandInputSchema = z.object({
  actionId: z.string().trim().min(1).max(60),
  note: text(LIMITS.commandNoteChars).optional(),
})
export type CommandInput = z.output<typeof commandInputSchema>

export const scheduleInputSchema = z.object({
  cron: z.string().trim().min(9).max(100),
  scheduleLabel: text(80).optional(),
})
export type ScheduleInput = z.output<typeof scheduleInputSchema>

export const pauseInputSchema = z.object({ paused: z.boolean() })

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM, ví dụ 08:00')
export const workHoursSchema = z
  .object({ workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), workStart: hhmm, workEnd: hhmm })
  .refine((v) => v.workStart < v.workEnd, 'Giờ bắt đầu phải trước giờ kết thúc')
  .refine((v) => new Set(v.workDays).size === v.workDays.length, 'Ngày bị trùng')
export type WorkHours = z.output<typeof workHoursSchema>
```

- [ ] **Step 4: Sửa `shared/cronSlots.ts`** — đổi `function expand(` thành `export function expandField(` và mọi lời gọi `expand(` trong file thành `expandField(`.

- [ ] **Step 5: Viết `shared/cronText.ts`**

```ts
import { expandField } from './cronSlots.js'

const DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (n: number) => String(n).padStart(2, '0')
const joinVi = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} và ${xs.at(-1)}`)

function days(field: string): string | null {
  if (field === '*') return 'mỗi ngày'
  const ds = [...new Set(expandField(field, 0, 7).map((d) => d % 7))]
  if (ds.length === 0) return null
  if (ds.length === 7) return 'mỗi ngày'
  // Sắp T2 → CN
  const order = ds.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const contiguous = order.length >= 3 && order.every((d, i) => i === 0 || (order[i - 1] + 1) % 7 === d)
  return contiguous ? `${DAY[order[0]]}–${DAY[order.at(-1)!]}` : order.map((d) => DAY[d]).join(', ')
}

/** Mô tả tiếng Việt cho cron 5 trường thường gặp; null khi không mô tả gọn được (giao diện hiện cron thô). */
export function describeCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, dom, mon, dow] = parts
  if (dom !== '*' || mon !== '*') return null
  const mins = expandField(m, 0, 59)
  const hours = expandField(h, 0, 23)
  const d = days(dow)
  if (!mins.length || !hours.length || !d) return null
  if ((m !== '*' && !/^\d/.test(m)) || m.includes('/')) {
    const step = Number(m.split('/')[1])
    if (m.startsWith('*/') && step > 0) return `mỗi ${step} phút, ${pad(hours[0])}:00–${pad(hours.at(-1)!)}:59 · ${d}`
  }
  if (h === '*' && mins.length === 1) return `mỗi giờ, phút ${pad(mins[0])} · ${d}`
  const times = hours.flatMap((hh) => mins.map((mm) => `${pad(hh)}:${pad(mm)}`))
  if (times.length > 6) return `${times.length} lần mỗi ngày · ${d}`
  return `${joinVi(times)} · ${d}`
}
```

Lưu ý: `expandField` trả mảng rỗng với trường vượt khoảng (vd giờ 25), nên `'0 25 * * *'` → null.

- [ ] **Step 6: Sửa `shared/dto.ts`**

Đổi `export type Presence = 'online' | 'offline' | 'never'` thành:

```ts
export type Presence = 'online' | 'offline' | 'resting' | 'never'
```

Trong `PersonDTO` thêm sau `lastSeenAt: string | null`:

```ts
  nextDispatchAt: string | null
```

Thêm vào cuối file:

```ts
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
```

- [ ] **Step 7: Chạy test**

Run: `npx vitest run shared`
Expected: PASS. (`npx tsc -b` sẽ báo lỗi ở `server/core/workspace.ts` vì `PersonDTO` thiếu `nextDispatchAt` — Task 2 sửa; chưa chạy tsc ở bước này.)

- [ ] **Step 8: Commit**

```bash
git add shared
git commit -m "feat: schema điều khiển, mô tả cron tiếng Việt, giới hạn biểu đồ 3 series"
```

---

### Task 2: Giờ làm việc, hiện diện Claude, lần Điều phối kế tiếp

**Files:**
- Modify: `server/core/time.ts`, `server/core/workspace.ts`, `server/core/workspace.test.ts`
- Create: `server/core/presence.ts`, `server/core/presence.test.ts`

**Interfaces:**
- Consumes: `User`, `Presence`.
- Produces: `vnClock(d: Date): { dow: number; minutes: number }`; `ONLINE_WINDOW_MS`, `DISPATCH_STEP_MIN = 15`; `inWorkHours(u: WorkWindow, at: Date): boolean`; `presenceOf(u: WorkWindow & { lastSeenAt: Date | null }, now: Date): Presence`; `nextDispatchAt(u: WorkWindow, now: Date): Date | null` với `WorkWindow = { workDays: number[]; workStart: string; workEnd: string }`.

- [ ] **Step 1: Viết test `server/core/presence.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { inWorkHours, nextDispatchAt, presenceOf } from './presence.js'

const win = { workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }
const at = (iso: string) => new Date(iso)

describe('inWorkHours (giờ VN)', () => {
  it.each([
    ['2026-10-05T03:00:00Z', true], // T2 10:00
    ['2026-10-05T01:00:00Z', true], // T2 08:00 (biên đầu tính)
    ['2026-10-05T12:00:00Z', false], // T2 19:00 (biên cuối không tính)
    ['2026-10-05T00:59:00Z', false], // T2 07:59
    ['2026-10-10T03:00:00Z', false], // T7
    ['2026-10-04T18:30:00Z', false], // CN 23:59 UTC… = T2 01:30 VN → ngoài giờ
  ])('%s → %s', (iso, ok) => expect(inWorkHours(win, at(iso))).toBe(ok))
})

describe('presenceOf', () => {
  const now = at('2026-10-05T03:00:00Z')
  it('online trong 30 phút', () => {
    expect(presenceOf({ ...win, lastSeenAt: new Date(now.getTime() - 29 * 60_000) }, now)).toBe('online')
  })
  it('quá 30 phút trong giờ làm → offline', () => {
    expect(presenceOf({ ...win, lastSeenAt: new Date(now.getTime() - 31 * 60_000) }, now)).toBe('offline')
  })
  it('quá 30 phút nhưng ngoài giờ → resting', () => {
    const evening = at('2026-10-05T12:30:00Z') // 19:30
    expect(presenceOf({ ...win, lastSeenAt: at('2026-10-05T11:50:00Z') }, evening)).toBe('resting')
  })
  it('chưa từng nối → never', () => {
    expect(presenceOf({ ...win, lastSeenAt: null }, now)).toBe('never')
  })
})

describe('nextDispatchAt', () => {
  it('làm tròn lên bước 15 phút trong giờ làm', () => {
    expect(nextDispatchAt(win, at('2026-10-05T03:07:00Z'))?.toISOString()).toBe('2026-10-05T03:15:00.000Z')
  })
  it('đúng mốc thì là chính mốc đó', () => {
    expect(nextDispatchAt(win, at('2026-10-05T03:15:00Z'))?.toISOString()).toBe('2026-10-05T03:15:00.000Z')
  })
  it('sau giờ làm → 08:00 ngày làm kế tiếp', () => {
    expect(nextDispatchAt(win, at('2026-10-05T11:50:00Z'))?.toISOString()).toBe('2026-10-06T01:00:00.000Z')
  })
  it('tối thứ 6 → 08:00 thứ 2', () => {
    expect(nextDispatchAt(win, at('2026-10-09T12:00:00Z'))?.toISOString()).toBe('2026-10-12T01:00:00.000Z')
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/presence.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Thêm vào `server/core/time.ts`**

```ts
/** Thứ (0 = CN) và số phút trong ngày theo giờ VN. */
export function vnClock(d: Date): { dow: number; minutes: number } {
  const v = new Date(d.getTime() + OFFSET)
  return { dow: v.getUTCDay(), minutes: v.getUTCHours() * 60 + v.getUTCMinutes() }
}
```

- [ ] **Step 4: Viết `server/core/presence.ts`**

```ts
import type { Presence } from '../../shared/dto.js'
import { vnClock } from './time.js'

export const ONLINE_WINDOW_MS = 30 * 60_000
export const DISPATCH_STEP_MIN = 15

export interface WorkWindow {
  workDays: number[]
  workStart: string
  workEnd: string
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function inWorkHours(u: WorkWindow, at: Date): boolean {
  const { dow, minutes } = vnClock(at)
  return u.workDays.includes(dow) && minutes >= toMin(u.workStart) && minutes < toMin(u.workEnd)
}

export function presenceOf(u: WorkWindow & { lastSeenAt: Date | null }, now: Date): Presence {
  if (!u.lastSeenAt) return 'never'
  if (now.getTime() - u.lastSeenAt.getTime() <= ONLINE_WINDOW_MS) return 'online'
  return inWorkHours(u, now) ? 'offline' : 'resting'
}

/** Mốc 15 phút gần nhất (≥ now) nằm trong khung giờ làm việc; tìm tối đa 8 ngày. */
export function nextDispatchAt(u: WorkWindow, now: Date): Date | null {
  if (u.workDays.length === 0) return null
  const step = DISPATCH_STEP_MIN * 60_000
  let t = Math.ceil(now.getTime() / step) * step
  const limit = now.getTime() + 8 * 86_400_000
  for (; t <= limit; t += step) if (inWorkHours(u, new Date(t))) return new Date(t)
  return null
}
```

Ghi chú: bước 15 phút tính theo UTC trùng với giờ VN vì lệch +7:00 là bội số của 15 phút.

- [ ] **Step 5: Sửa `server/core/workspace.ts`**

- Xóa hàm `presenceOf` và hằng `ONLINE_WINDOW_MS` trong file này; thêm `import { nextDispatchAt, presenceOf } from './presence.js'`.
- Trong `toPerson`, đổi `presence: presenceOf(u.lastSeenAt, now),` thành:

```ts
    presence: presenceOf(u, now),
```

  và thêm sau dòng `lastSeenAt: …`:

```ts
    nextDispatchAt: nextDispatchAt(u, now)?.toISOString() ?? null,
```

- [ ] **Step 6: Sửa `server/core/workspace.test.ts`**

- Đổi import thành `import { getWorkspace, listPeople } from './workspace.js'` và xóa khối `describe('presenceOf', …)` (đã chuyển sang `presence.test.ts`).
- Trong test `listPeople`, `makeUser(db, { name: 'An', lastSeenAt: now })` giữ nguyên; kỳ vọng `presence` vẫn `'online'`.

- [ ] **Step 7: Chạy test và typecheck**

Run: `npx vitest run server/core && npx tsc -b`
Expected: PASS, tsc sạch.

- [ ] **Step 8: Commit**

```bash
git add server/core shared
git commit -m "feat: giờ làm việc, hiện diện Claude (trực/offline/ngoài giờ), lần Điều phối kế tiếp"
```

---

### Task 3: `dispatch` — giao việc có lease

**Files:**
- Create: `server/core/dispatch.ts`, `server/core/dispatch.test.ts`

**Interfaces:**
- Consumes: bảng `users`, `tasks`, `commands`, `activity`; `DispatchItem`; `User`.
- Produces: `LEASE_MS = 3_600_000`; `dispatch(db, owner: User, now: Date): Promise<DispatchItem[]>` — lệnh trước (theo thời điểm tạo), việc theo lịch sau (theo `position`).

- [ ] **Step 1: Viết test `server/core/dispatch.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb, type TaskRow, type UserRow } from '../test/db.js'
import { dispatch, LEASE_MS } from './dispatch.js'

const now = new Date('2026-10-05T03:00:00Z')
const past = new Date(now.getTime() - 60_000)
const later = new Date(now.getTime() + 60_000)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

async function cmd(t: TaskRow, actionId = 'run', createdAt = now) {
  const [c] = await db.insert(commands).values({ taskId: t.id, ownerId: t.ownerId, actionId, label: actionId === 'run' ? 'Chạy ngay' : 'Duyệt', instructions: 'Làm theo nút', createdAt }).returning()
  return c
}
const lookup = async (id: string) => (await db.select().from(commands).where(eq(commands.id, id)))[0]

describe('dispatch', () => {
  let u: UserRow
  beforeEach(async () => { u = await makeUser(db) })

  it('không có gì → rỗng nhưng vẫn ghi heartbeat', async () => {
    expect(await dispatch(db, u, now)).toEqual([])
    const [me] = await db.select().from(users).where(eq(users.id, u.id))
    expect(me.lastSeenAt?.toISOString()).toBe(now.toISOString())
  })

  it('giao task đến hạn kèm lease 60 phút; task chưa đến hạn hoặc tạm dừng thì không', async () => {
    const due = await makeTask(db, u.id, { slug: 'den-han', nextRunAt: past, instructions: 'Gửi tin' })
    await makeTask(db, u.id, { slug: 'chua', nextRunAt: later })
    await makeTask(db, u.id, { slug: 'dung', nextRunAt: past, paused: true })
    const items = await dispatch(db, u, now)
    expect(items).toEqual([{ leaseId: expect.any(String), loai: 'lich', task: { slug: 'den-han', name: due.name, instructions: 'Gửi tin', skill: null } }])
    const [row] = await db.select().from(tasks).where(eq(tasks.id, due.id))
    expect(row.leaseId).toBe(items[0].leaseId)
    expect(row.leaseUntil?.getTime()).toBe(now.getTime() + LEASE_MS)
  })

  it('gọi liền lần hai → không giao lại việc đã giao', async () => {
    await makeTask(db, u.id, { nextRunAt: past })
    const t = await makeTask(db, u.id, { nextRunAt: later })
    await cmd(t, 'duyet')
    expect(await dispatch(db, u, now)).toHaveLength(2)
    expect(await dispatch(db, u, new Date(now.getTime() + 15 * 60_000))).toEqual([])
  })

  it('lease hết hạn → task được giao lại', async () => {
    await makeTask(db, u.id, { nextRunAt: past })
    await dispatch(db, u, now)
    expect(await dispatch(db, u, new Date(now.getTime() + LEASE_MS + 1000))).toHaveLength(1)
  })

  it('lệnh trước lịch, theo thứ tự tạo; lệnh mang chỉ thị chụp lúc bấm', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: past, slug: 'a' })
    const t2 = await makeTask(db, u.id, { nextRunAt: later, slug: 'b' })
    const c1 = await cmd(t2, 'duyet', new Date(now.getTime() - 5000))
    const items = await dispatch(db, u, now)
    expect(items.map((i) => i.loai)).toEqual(['lenh', 'lich'])
    expect(items[0].lenh).toEqual({ id: c1.id, actionId: 'duyet', label: 'Duyệt', instructions: 'Làm theo nút', note: null })
    expect(items[1].task.slug).toBe(t.slug)
    expect((await lookup(c1.id)).status).toBe('claimed')
  })

  it('"Chạy ngay" trùng lúc task đến hạn → chỉ một việc', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: past })
    await cmd(t, 'run')
    const items = await dispatch(db, u, now)
    expect(items).toHaveLength(1)
    expect(items[0].loai).toBe('lenh')
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(row.leaseId).toBe(items[0].leaseId)
  })

  it('hai lệnh "Chạy ngay" cùng task → giao một, lệnh kia đóng là gộp', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: later })
    const a = await cmd(t, 'run', new Date(now.getTime() - 2000))
    const b = await cmd(t, 'run', new Date(now.getTime() - 1000))
    const items = await dispatch(db, u, now)
    expect(items).toHaveLength(1)
    expect(items[0].lenh?.id).toBe(a.id)
    expect(await lookup(b.id)).toMatchObject({ status: 'done', result: expect.stringContaining('Gộp') })
  })

  it('lệnh nhận quá 60 phút chưa báo → expired', async () => {
    const t = await makeTask(db, u.id, { nextRunAt: later })
    const c = await cmd(t, 'duyet')
    await dispatch(db, u, now)
    await dispatch(db, u, new Date(now.getTime() + LEASE_MS + 1000))
    expect((await lookup(c.id)).status).toBe('expired')
  })

  it('chỉ giao việc của chính chủ token', async () => {
    const other = await makeUser(db)
    await makeTask(db, other.id, { nextRunAt: past })
    const t = await makeTask(db, other.id, { nextRunAt: later })
    await cmd(t)
    expect(await dispatch(db, u, now)).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/dispatch.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `server/core/dispatch.ts`**

```ts
import { and, eq, inArray, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import type { DispatchItem } from '../../shared/dto.js'
import { activity, commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import type { CommandRow, TaskRow } from './dto.js'
import type { User } from './users.js'

export const LEASE_MS = 60 * 60_000

const brief = (t: TaskRow) => ({ slug: t.slug, name: t.name, instructions: t.instructions, skill: t.skill })

/**
 * Giao việc cho Claude của `owner`: lệnh từ web đang chờ + task đến hạn.
 * Mỗi việc nhận một lease 60 phút; `UPDATE … WHERE … RETURNING` bảo đảm hai lần gọi chồng nhau không nhận cùng một việc.
 */
export async function dispatch(db: Db, owner: User, now: Date): Promise<DispatchItem[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS)
  const stale = new Date(now.getTime() - LEASE_MS)

  return db.transaction(async (tx) => {
    await tx.update(users).set({ lastSeenAt: now }).where(eq(users.id, owner.id))

    await tx
      .update(commands)
      .set({ status: 'expired', finishedAt: now, result: 'Claude đã nhận nhưng không báo kết quả trong 60 phút' })
      .where(and(eq(commands.ownerId, owner.id), eq(commands.status, 'claimed'), lt(commands.claimedAt, stale)))

    const claimed = (
      await tx
        .update(commands)
        .set({ status: 'claimed', claimedAt: now, leaseId: sql`gen_random_uuid()` })
        .where(and(eq(commands.ownerId, owner.id), eq(commands.status, 'pending')))
        .returning()
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    // Nhiều "Chạy ngay" cho cùng task → giữ lệnh sớm nhất, đóng phần còn lại.
    const runByTask = new Map<string, CommandRow>()
    const keep: CommandRow[] = []
    const merged: string[] = []
    for (const c of claimed) {
      if (c.actionId === 'run') {
        if (runByTask.has(c.taskId)) {
          merged.push(c.id)
          continue
        }
        runByTask.set(c.taskId, c)
      }
      keep.push(c)
    }
    if (merged.length) {
      await tx.update(commands).set({ status: 'done', finishedAt: now, result: 'Gộp với một lệnh "Chạy ngay" khác' }).where(inArray(commands.id, merged))
    }
    // "Chạy ngay" khóa luôn task để lần chạy theo lịch không chạy trùng.
    for (const c of runByTask.values()) {
      await tx.update(tasks).set({ leaseId: c.leaseId, leaseUntil }).where(eq(tasks.id, c.taskId))
    }

    const runTaskIds = [...runByTask.keys()]
    const due = (
      await tx
        .update(tasks)
        .set({ leaseId: sql`gen_random_uuid()`, leaseUntil })
        .where(
          and(
            eq(tasks.ownerId, owner.id),
            eq(tasks.paused, false),
            lte(tasks.nextRunAt, now),
            or(isNull(tasks.leaseUntil), lt(tasks.leaseUntil, now)),
            runTaskIds.length ? notInArray(tasks.id, runTaskIds) : undefined,
          ),
        )
        .returning()
    ).sort((a, b) => a.position - b.position)

    const ids = [...new Set(keep.map((c) => c.taskId))]
    const byId = new Map((ids.length ? await tx.select().from(tasks).where(inArray(tasks.id, ids)) : []).map((t) => [t.id, t]))

    if (keep.length) {
      await tx.insert(activity).values(
        keep.map((c) => ({ ownerId: owner.id, taskId: c.taskId, at: now, level: 'wait' as const, text: `Claude đã nhận lệnh "${c.label}"` })),
      )
    }

    return [
      ...keep.map((c) => ({
        leaseId: c.leaseId!,
        loai: 'lenh' as const,
        task: brief(byId.get(c.taskId)!),
        lenh: { id: c.id, actionId: c.actionId, label: c.label, instructions: c.instructions, note: c.note },
      })),
      ...due.map((t) => ({ leaseId: t.leaseId!, loai: 'lich' as const, task: brief(t) })),
    ]
  })
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server/core/dispatch.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
git add server/core/dispatch.ts server/core/dispatch.test.ts
git commit -m "feat: dieu_phoi lõi — giao lệnh và task đến hạn có lease, gộp trùng, lệnh quá hạn"
```

---

### Task 4: `reportRun` nhận `leaseId` — idempotent và đóng lệnh

**Files:**
- Modify: `server/core/tasks.ts`, `server/core/tasks.test.ts`

**Interfaces:**
- Consumes: `dispatch` (trong test), bảng `commands`, `runs`.
- Produces: `findOwnTask(db, owner, slug): Promise<TaskRow>` và `assertCron(cron): void` được **export**; `reportRun(...)` trả `{ runId: string; task: TaskRow; duplicate: boolean }`.
  - Có `leaseId` và đã có run với lease đó → `duplicate: true`, không ghi gì.
  - `leaseId` thuộc một lệnh của chủ → `trigger: 'command'`, đóng lệnh (`done` nếu ok/partial, `failed` nếu failed; `result` = note hoặc chữ mặc định), kể cả lệnh đã `expired`. Lệnh thuộc task khác slug → `invalid`.
  - `leaseId` không thuộc lệnh nào → `trigger: 'schedule'`.
  - Không có `leaseId` → `trigger: 'manual'`.
  - `lastRunAt`/`nextRunAt` chỉ đổi khi trigger là `schedule`, `manual`, hoặc lệnh `run`; lệnh `review`/`fix`/`custom` không đẩy lịch.
  - Xóa lease của task **chỉ khi** `task.leaseId === leaseId`.

- [ ] **Step 1: Thêm test vào cuối `server/core/tasks.test.ts`**

```ts
import { commands } from '../db/schema.js'
import { dispatch } from './dispatch.js'

describe('reportRun với leaseId', () => {
  const past = new Date(now.getTime() - 60_000)

  it('lần chạy theo lịch: trigger schedule, xóa lease, đẩy lịch', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    await db.update(tasks).set({ nextRunAt: past }).where(eq(tasks.id, t.id))
    const [item] = await dispatch(db, u, now)
    const r = await reportRun(db, u, { slug: 'upsell', status: 'ok', note: '', log: [], leaseId: item.leaseId }, now)
    expect(r.duplicate).toBe(false)
    expect(r.task.leaseId).toBeNull()
    expect(r.task.nextRunAt?.toISOString()).toBe('2026-10-05T08:30:00.000Z')
    const [run] = await db.select().from(runs).where(eq(runs.id, r.runId))
    expect(run).toMatchObject({ trigger: 'schedule', leaseId: item.leaseId })
  })

  it('gửi lại cùng leaseId → không tạo run thứ hai', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    await db.update(tasks).set({ nextRunAt: past }).where(eq(tasks.id, t.id))
    const [item] = await dispatch(db, u, now)
    const p = { slug: 'upsell', status: 'ok' as const, note: '', log: [], leaseId: item.leaseId }
    const a = await reportRun(db, u, p, now)
    const b = await reportRun(db, u, p, now)
    expect(b).toMatchObject({ duplicate: true, runId: a.runId })
    expect(await db.select().from(runs)).toHaveLength(1)
  })

  it('lệnh "Duyệt": trigger command, đóng lệnh, KHÔNG đẩy lịch', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    const [c] = await db.insert(commands).values({ taskId: t.id, ownerId: u.id, actionId: 'duyet', label: 'Duyệt', instructions: 'x' }).returning()
    const [item] = await dispatch(db, u, now)
    const r = await reportRun(db, u, { slug: 'upsell', status: 'partial', note: 'Duyệt 2/3', log: [], leaseId: item.leaseId }, now)
    expect(r.task.lastRunAt).toBeNull()
    expect(r.task.nextRunAt?.toISOString()).toBe(t.nextRunAt?.toISOString())
    const [closed] = await db.select().from(commands).where(eq(commands.id, c.id))
    expect(closed).toMatchObject({ status: 'done', result: 'Duyệt 2/3' })
    const [run] = await db.select().from(runs).where(eq(runs.id, r.runId))
    expect(run).toMatchObject({ trigger: 'command', commandId: c.id })
  })

  it('lệnh "Chạy ngay" thất bại: lệnh failed, task bị đẩy lịch và mở lease', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    const [c] = await db.insert(commands).values({ taskId: t.id, ownerId: u.id, actionId: 'run', label: 'Chạy ngay', instructions: 'x' }).returning()
    const [item] = await dispatch(db, u, now)
    const r = await reportRun(db, u, { slug: 'upsell', status: 'failed', note: '', log: [], leaseId: item.leaseId }, now)
    expect(r.task.lastRunAt?.toISOString()).toBe(now.toISOString())
    expect(r.task.leaseId).toBeNull()
    const [closed] = await db.select().from(commands).where(eq(commands.id, c.id))
    expect(closed).toMatchObject({ status: 'failed', result: 'Chạy thất bại' })
  })

  it('báo muộn cho lệnh đã expired vẫn đóng được', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    const [c] = await db.insert(commands).values({ taskId: t.id, ownerId: u.id, actionId: 'duyet', label: 'Duyệt', instructions: 'x' }).returning()
    const [item] = await dispatch(db, u, now)
    await db.update(commands).set({ status: 'expired' }).where(eq(commands.id, c.id))
    await reportRun(db, u, { slug: 'upsell', status: 'ok', note: '', log: [], leaseId: item.leaseId }, now)
    expect((await db.select().from(commands).where(eq(commands.id, c.id)))[0].status).toBe('done')
  })

  it('lease của lệnh thuộc task khác slug → invalid', async () => {
    const u = await makeUser(db)
    const t = await createTask(db, u, def(), now)
    await createTask(db, u, def({ slug: 'khac' }), now)
    await db.insert(commands).values({ taskId: t.id, ownerId: u.id, actionId: 'duyet', label: 'Duyệt', instructions: 'x' })
    const [item] = await dispatch(db, u, now)
    await expect(reportRun(db, u, { slug: 'khac', status: 'ok', note: '', log: [], leaseId: item.leaseId }, now)).rejects.toMatchObject({ code: 'invalid' })
  })
})
```

Đồng thời sửa test cũ `'ghi run thủ công…'` — chỗ `const { task } = await reportRun(…)` vẫn đúng; thêm kỳ vọng `trigger: 'manual'` đã có.

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/tasks.test.ts`
Expected: FAIL — `duplicate` undefined, trigger luôn `manual`.

- [ ] **Step 3: Sửa `server/core/tasks.ts`**

- Đổi `function assertCron(` thành `export function assertCron(` và `async function findOwnTask(` thành `export async function findOwnTask(`.
- Thêm `commands` vào import bảng (đã có) và `type CommandRow` từ `./dto.js`: `import { toTaskDTO, type CommandRow, type TaskRow } from './dto.js'`.
- Thay toàn bộ hàm `reportRun` bằng:

```ts
export async function reportRun(
  db: Db,
  owner: User,
  input: RunReport,
  now: Date,
): Promise<{ runId: string; task: TaskRow; duplicate: boolean }> {
  const row = await findOwnTask(db, owner, input.slug)

  let trigger: 'manual' | 'schedule' | 'command' = 'manual'
  let cmd: CommandRow | undefined
  if (input.leaseId) {
    const prior = await db.query.runs.findFirst({ where: eq(runs.leaseId, input.leaseId) })
    if (prior) return { runId: prior.id, task: row, duplicate: true }
    cmd = await db.query.commands.findFirst({ where: and(eq(commands.leaseId, input.leaseId), eq(commands.ownerId, owner.id)) })
    if (cmd && cmd.taskId !== row.id) throw invalid('leaseId này thuộc một task khác — kiểm tra lại slug')
    trigger = cmd ? 'command' : 'schedule'
  }
  const advancesSchedule = trigger !== 'command' || cmd?.actionId === 'run'

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
      .values({
        taskId: row.id, trigger, status: input.status, startedAt, finishedAt: now, durationMs: input.durationMs ?? null,
        note: input.note, log: input.log, leaseId: input.leaseId ?? null, commandId: cmd?.id ?? null,
      })
      .onConflictDoNothing({ target: runs.leaseId })
      .returning({ id: runs.id })
    if (!run) {
      const prior = await tx.query.runs.findFirst({ where: eq(runs.leaseId, input.leaseId!) })
      return { runId: prior!.id, task: row, duplicate: true }
    }

    const schedule = advancesSchedule ? { lastRunAt: now, nextRunAt: row.paused ? row.nextRunAt : nextRunAfter(row.cron, now) } : {}
    const release = input.leaseId && row.leaseId === input.leaseId ? { leaseId: null, leaseUntil: null } : {}
    const [task] = await tx
      .update(tasks)
      .set({ ...updates, ...schedule, ...release, updatedAt: now })
      .where(eq(tasks.id, row.id))
      .returning()

    if (cmd) {
      await tx
        .update(commands)
        .set({ status: input.status === 'failed' ? 'failed' : 'done', result: input.note || TEXT_FROM_STATUS[input.status], finishedAt: now })
        .where(eq(commands.id, cmd.id))
    }
    const text = cmd ? `${cmd.label}: ${input.note || TEXT_FROM_STATUS[input.status]}` : input.note || TEXT_FROM_STATUS[input.status]
    await tx.insert(activity).values({ ownerId: owner.id, taskId: row.id, at: now, level: LEVEL_FROM_STATUS[input.status], text })
    return { runId: run.id, task, duplicate: false }
  })
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server/core && npx tsc -b`
Expected: PASS, tsc sạch. (Nếu `server/mcp/tools.ts` báo lỗi kiểu ở chỗ dùng `reportRun`, chỉ cần giữ nguyên `const { task } = await reportRun(…)` — trường thêm không làm hỏng destructuring.)

- [ ] **Step 5: Commit**

```bash
git add server/core
git commit -m "feat: bao_ket_qua idempotent theo lease, đóng lệnh, chỉ lệnh chạy mới đẩy lịch"
```

---

### Task 5: Điều khiển từ web — lệnh, lịch, tạm dừng, khung giờ (lõi + API)

**Files:**
- Create: `server/core/control.ts`, `server/core/control.test.ts`, `server/http/control.test.ts`
- Modify: `server/http/api.ts`

**Interfaces:**
- Consumes: `findOwnTask`, `assertCron`, `toCommandDTO`, `nextRunAfter`, `previewRuns`, `isValidCron`, `describeCron`, schema `commandInputSchema`, `scheduleInputSchema`, `pauseInputSchema`, `workHoursSchema`, `zodMessage`, `toMeDTO`.
- Produces:
  - `createCommand(db, owner, slug, input: CommandInput, now): Promise<CommandDTO>`
  - `cancelCommand(db, owner, id, now): Promise<void>`
  - `setSchedule(db, owner, slug, input: ScheduleInput, now): Promise<TaskRow>`
  - `setPaused(db, owner, slug, paused: boolean, now): Promise<TaskRow>`
  - `setWorkHours(db, owner, input: WorkHours): Promise<User>`
  - `previewSchedule(cron: string, now: Date): SchedulePreviewDTO`
  - Route: `POST /api/tasks/:slug/commands` (201 → `CommandDTO`), `POST /api/commands/:id/cancel`, `PUT /api/tasks/:slug/schedule` (→ `{ cron, scheduleLabel, nextRun }`), `PUT /api/tasks/:slug/pause` (→ `{ paused, nextRun }`), `GET /api/schedule/preview?cron=` (→ `SchedulePreviewDTO`), `PUT /api/me/work-hours` (→ `MeDTO`)

- [ ] **Step 1: Viết test lõi `server/core/control.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { activity, commands, tasks } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { cancelCommand, createCommand, previewSchedule, setPaused, setSchedule, setWorkHours } from './control.js'

const now = new Date('2026-10-05T03:00:00Z')
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

const action = { id: 'duyet', label: 'Duyệt mẫu', kind: 'review' as const, instructions: 'Duyệt 3 mẫu chờ' }

describe('createCommand', () => {
  it('"Chạy ngay" chụp chỉ thị của task; ghi hoạt động chờ', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', instructions: 'Gửi tin' })
    const c = await createCommand(db, u, 'a', { actionId: 'run', note: 'Ưu tiên store lớn' }, now)
    expect(c).toMatchObject({ actionId: 'run', label: 'Chạy ngay', status: 'pending', note: 'Ưu tiên store lớn' })
    const [row] = await db.select().from(commands).where(eq(commands.id, c.id))
    expect(row.instructions).toBe('Gửi tin')
    const [ev] = await db.select().from(activity)
    expect(ev.level).toBe('wait')
  })

  it('nút khai báo trong task dùng nhãn và chỉ thị của nút', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', actions: [action] })
    const c = await createCommand(db, u, 'a', { actionId: 'duyet' }, now)
    expect(c.label).toBe('Duyệt mẫu')
    expect((await db.select().from(commands))[0].instructions).toBe('Duyệt 3 mẫu chờ')
  })

  it('nút không tồn tại → invalid; task của người khác → not_found', async () => {
    const u = await makeUser(db)
    const other = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    await expect(createCommand(db, u, 'a', { actionId: 'khong-co' }, now)).rejects.toMatchObject({ code: 'invalid' })
    await expect(createCommand(db, other, 'a', { actionId: 'run' }, now)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('tối đa 5 lệnh chờ mỗi task', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    for (let i = 0; i < 5; i += 1) await createCommand(db, u, 'a', { actionId: 'run' }, now)
    await expect(createCommand(db, u, 'a', { actionId: 'run' }, now)).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('cancelCommand', () => {
  it('chỉ hủy được lệnh đang chờ của mình', async () => {
    const u = await makeUser(db)
    const other = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const c = await createCommand(db, u, 'a', { actionId: 'run' }, now)
    await expect(cancelCommand(db, other, c.id, now)).rejects.toMatchObject({ code: 'not_found' })
    await cancelCommand(db, u, c.id, now)
    expect((await db.select().from(commands))[0].status).toBe('cancelled')
    await expect(cancelCommand(db, u, c.id, now)).rejects.toMatchObject({ code: 'conflict' })
    await expect(cancelCommand(db, u, 'abc', now)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('setSchedule / setPaused', () => {
  it('đổi cron → nhãn mặc định tiếng Việt, tính lại lần kế tiếp', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const t = await setSchedule(db, u, 'a', { cron: '0 16 * * 5' }, now)
    expect(t).toMatchObject({ cron: '0 16 * * 5', scheduleLabel: '16:00 · T6' })
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-09T09:00:00.000Z')
    await expect(setSchedule(db, u, 'a', { cron: '0 25 * * *' }, now)).rejects.toMatchObject({ code: 'invalid' })
  })

  it('tạm dừng xóa lần kế tiếp; bỏ tạm dừng tính từ now (không chạy bù)', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a', cron: '0 9 * * *', nextRunAt: new Date('2026-10-01T02:00:00Z') })
    expect((await setPaused(db, u, 'a', true, now)).nextRunAt).toBeNull()
    const t = await setPaused(db, u, 'a', false, now)
    expect(t.paused).toBe(false)
    expect(t.nextRunAt?.toISOString()).toBe('2026-10-06T02:00:00.000Z')
    const [row] = await db.select().from(tasks)
    expect(row.paused).toBe(false)
  })

  it('đổi cron khi đang tạm dừng → vẫn không có lần kế tiếp', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    await setPaused(db, u, 'a', true, now)
    expect((await setSchedule(db, u, 'a', { cron: '0 8 * * *' }, now)).nextRunAt).toBeNull()
  })
})

describe('setWorkHours / previewSchedule', () => {
  it('lưu khung giờ', async () => {
    const u = await makeUser(db)
    const r = await setWorkHours(db, u, { workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:00' })
    expect(r).toMatchObject({ workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:00' })
  })

  it('xem trước cron', () => {
    expect(previewSchedule('30 9,15 * * *', now)).toEqual({
      valid: true,
      label: '09:30 và 15:30 · mỗi ngày',
      next: ['2026-10-05T08:30:00.000Z', '2026-10-06T02:30:00.000Z', '2026-10-06T08:30:00.000Z'],
    })
    expect(previewSchedule('x', now)).toEqual({ valid: false, label: null, next: [] })
  })
})
```

- [ ] **Step 2: Viết test HTTP `server/http/control.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { createSession } from '../core/sessions.js'
import { commands } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb, type UserRow } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const config: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
let db: Db
let app: ReturnType<typeof createApp>
beforeAll(async () => { db = await testDb() })
beforeEach(async () => {
  await resetDb(db)
  app = createApp({ db, config, google, now: () => now, fetchClientMetadata: async () => null })
})

const cookie = async (u: UserRow) => `__Host-ws_session=${(await createSession(db, u.id, now)).token}`
const send = async (u: UserRow, method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { cookie: await cookie(u), origin: 'https://ws.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('điều khiển qua API', () => {
  it('chủ task gửi lệnh, hủy lệnh', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const res = await send(u, 'POST', '/api/tasks/a/commands', { actionId: 'run' })
    expect(res.status).toBe(201)
    const c = await res.json()
    expect((await send(u, 'POST', `/api/commands/${c.id}/cancel`)).status).toBe(200)
  })

  it('đồng nghiệp không gửi lệnh / sửa lịch / tạm dừng được task của người khác', async () => {
    const owner = await makeUser(db)
    const mate = await makeUser(db)
    await makeTask(db, owner.id, { slug: 'a' })
    expect((await send(mate, 'POST', '/api/tasks/a/commands', { actionId: 'run' })).status).toBe(404)
    expect((await send(mate, 'PUT', '/api/tasks/a/schedule', { cron: '0 9 * * *' })).status).toBe(404)
    expect((await send(mate, 'PUT', '/api/tasks/a/pause', { paused: true })).status).toBe(404)
    expect(await db.select().from(commands)).toEqual([])
  })

  it('thân sai → 400 kèm trường; origin lạ → 403', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    const bad = await send(u, 'PUT', '/api/tasks/a/pause', { paused: 'có' })
    expect(bad.status).toBe(400)
    expect((await bad.json()).message).toContain('paused')
    const evil = await app.request('/api/tasks/a/commands', { method: 'POST', headers: { cookie: await cookie(u), origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{"actionId":"run"}' })
    expect(evil.status).toBe(403)
  })

  it('lịch, tạm dừng, xem trước, khung giờ', async () => {
    const u = await makeUser(db)
    await makeTask(db, u.id, { slug: 'a' })
    expect(await (await send(u, 'PUT', '/api/tasks/a/schedule', { cron: '0 16 * * 5' })).json()).toMatchObject({ cron: '0 16 * * 5', scheduleLabel: '16:00 · T6', nextRun: '2026-10-09T09:00:00.000Z' })
    expect(await (await send(u, 'PUT', '/api/tasks/a/pause', { paused: true })).json()).toEqual({ paused: true, nextRun: null })
    expect(await (await send(u, 'GET', '/api/schedule/preview?cron=0%209%20*%20*%201-5')).json()).toMatchObject({ valid: true, label: '09:00 · T2–T6' })
    expect(await (await send(u, 'PUT', '/api/me/work-hours', { workDays: [1, 2, 3], workStart: '09:00', workEnd: '17:00' })).json()).toMatchObject({ workDays: [1, 2, 3], workStart: '09:00' })
  })
})
```

- [ ] **Step 3: Chạy để thấy fail**

Run: `npx vitest run server/core/control.test.ts server/http/control.test.ts`
Expected: FAIL — module và route chưa có.

- [ ] **Step 4: Viết `server/core/control.ts`**

```ts
import { and, count, eq } from 'drizzle-orm'
import type { CommandDTO, SchedulePreviewDTO } from '../../shared/dto.js'
import { describeCron } from '../../shared/cronText.js'
import { LIMITS, type CommandInput, type ScheduleInput, type WorkHours } from '../../shared/schema.js'
import { activity, commands, tasks, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { toCommandDTO, type TaskRow } from './dto.js'
import { conflict, invalid, notFound } from './errors.js'
import { isValidCron, nextRunAfter, previewRuns } from './schedule.js'
import { assertCron, findOwnTask } from './tasks.js'
import { isUuid } from './tokens.js'
import type { User } from './users.js'

export async function createCommand(db: Db, owner: User, slug: string, input: CommandInput, now: Date): Promise<CommandDTO> {
  const task = await findOwnTask(db, owner, slug)
  const action =
    input.actionId === 'run'
      ? { label: 'Chạy ngay', instructions: task.instructions }
      : task.actions.find((a) => a.id === input.actionId)
  if (!action) throw invalid(`Task "${task.name}" không có nút "${input.actionId}"`)

  const [{ n }] = await db
    .select({ n: count() })
    .from(commands)
    .where(and(eq(commands.taskId, task.id), eq(commands.status, 'pending')))
  if (n >= LIMITS.pendingCommandsPerTask) throw conflict(`Đã có ${LIMITS.pendingCommandsPerTask} lệnh đang chờ Claude cho task này`)

  const [row] = await db
    .insert(commands)
    .values({ taskId: task.id, ownerId: owner.id, actionId: input.actionId, label: action.label, instructions: action.instructions, note: input.note || null, createdAt: now })
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: 'wait', text: `Gửi lệnh "${action.label}" — chờ Claude nhận` })
  return toCommandDTO(row)
}

export async function cancelCommand(db: Db, owner: User, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) throw notFound('Không tìm thấy lệnh')
  const row = await db.query.commands.findFirst({ where: and(eq(commands.id, id), eq(commands.ownerId, owner.id)) })
  if (!row) throw notFound('Không tìm thấy lệnh')
  const done = await db
    .update(commands)
    .set({ status: 'cancelled', finishedAt: now, result: 'Bạn đã hủy' })
    .where(and(eq(commands.id, id), eq(commands.status, 'pending')))
    .returning({ id: commands.id })
  if (done.length === 0) throw conflict('Lệnh đã được Claude nhận hoặc đã xong, không hủy được nữa')
}

export async function setSchedule(db: Db, owner: User, slug: string, input: ScheduleInput, now: Date): Promise<TaskRow> {
  const task = await findOwnTask(db, owner, slug)
  assertCron(input.cron)
  const [row] = await db
    .update(tasks)
    .set({
      cron: input.cron,
      scheduleLabel: input.scheduleLabel || describeCron(input.cron) || input.cron,
      nextRunAt: task.paused ? null : nextRunAfter(input.cron, now),
      updatedAt: now,
    })
    .where(eq(tasks.id, task.id))
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: 'ok', text: `Đổi lịch thành ${row.scheduleLabel}` })
  return row
}

export async function setPaused(db: Db, owner: User, slug: string, paused: boolean, now: Date): Promise<TaskRow> {
  const task = await findOwnTask(db, owner, slug)
  const [row] = await db
    .update(tasks)
    .set({ paused, nextRunAt: paused ? null : nextRunAfter(task.cron, now), updatedAt: now })
    .where(eq(tasks.id, task.id))
    .returning()
  await db.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: paused ? 'wait' : 'ok', text: paused ? 'Tạm dừng lịch' : 'Chạy lại theo lịch' })
  return row
}

export async function setWorkHours(db: Db, owner: User, input: WorkHours): Promise<User> {
  const [row] = await db
    .update(users)
    .set({ workDays: [...input.workDays].sort((a, b) => a - b), workStart: input.workStart, workEnd: input.workEnd })
    .where(eq(users.id, owner.id))
    .returning()
  return row
}

export function previewSchedule(cron: string, now: Date): SchedulePreviewDTO {
  if (!isValidCron(cron)) return { valid: false, label: null, next: [] }
  return { valid: true, label: describeCron(cron), next: previewRuns(cron, now).map((d) => d.toISOString()) }
}
```

- [ ] **Step 5: Thêm route vào `server/http/api.ts`**

Import thêm:

```ts
import type { Context } from 'hono'
import type { z } from 'zod'
import { commandInputSchema, pauseInputSchema, scheduleInputSchema, workHoursSchema, zodMessage } from '../../shared/schema.js'
import { cancelCommand, createCommand, previewSchedule, setPaused, setSchedule, setWorkHours } from '../core/control.js'
import { invalid } from '../core/errors.js'
```

Thêm trên `export function apiRoutes`:

```ts
async function bodyOf<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.output<S>> {
  const raw = await c.req.json().catch(() => null)
  const r = schema.safeParse(raw)
  if (!r.success) throw invalid(zodMessage(r.error))
  return r.data
}
```

Trước `return r`:

```ts
  r.post('/tasks/:slug/commands', async (c) => {
    const cmd = await createCommand(deps.db, c.get('user'), c.req.param('slug'), await bodyOf(c, commandInputSchema), deps.now())
    return c.json(cmd, 201)
  })

  r.post('/commands/:id/cancel', async (c) => {
    await cancelCommand(deps.db, c.get('user'), c.req.param('id'), deps.now())
    return c.json({ ok: true })
  })

  r.put('/tasks/:slug/schedule', async (c) => {
    const t = await setSchedule(deps.db, c.get('user'), c.req.param('slug'), await bodyOf(c, scheduleInputSchema), deps.now())
    return c.json({ cron: t.cron, scheduleLabel: t.scheduleLabel, nextRun: t.nextRunAt?.toISOString() ?? null })
  })

  r.put('/tasks/:slug/pause', async (c) => {
    const { paused } = await bodyOf(c, pauseInputSchema)
    const t = await setPaused(deps.db, c.get('user'), c.req.param('slug'), paused, deps.now())
    return c.json({ paused: t.paused, nextRun: t.nextRunAt?.toISOString() ?? null })
  })

  r.get('/schedule/preview', (c) => c.json(previewSchedule(c.req.query('cron') ?? '', deps.now())))

  r.put('/me/work-hours', async (c) => c.json(toMeDTO(await setWorkHours(deps.db, c.get('user'), await bodyOf(c, workHoursSchema)))))
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run server && npx tsc -b`
Expected: PASS, tsc sạch.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: điều khiển từ web — lệnh, hủy lệnh, sửa lịch, tạm dừng, khung giờ, xem trước cron"
```

---

### Task 6: MCP — tool `dieu_phoi` và `leaseId` trong `bao_ket_qua`

**Files:**
- Modify: `server/mcp/tools.ts`, `server/http/mcp.test.ts`

**Interfaces:**
- Consumes: `dispatch`.
- Produces: tool `dieu_phoi` (không tham số) → văn bản hướng dẫn + JSON `{ viec: DispatchItem[] }`; `MCP_INSTRUCTIONS` mô tả vòng Điều phối.

- [ ] **Step 1: Thêm test vào `server/http/mcp.test.ts`**

Trong test `'liệt kê đúng 5 tool'` đổi tên thành `'liệt kê đúng 6 tool'` và mảng kỳ vọng thành `['bao_ket_qua', 'dieu_phoi', 'nop_bao_cao_tuan', 'sua_task', 'tao_task', 'xem_task']`.

Thêm vào cuối `describe('tool', …)`:

```ts
  it('dieu_phoi: không việc → bảo dừng; có việc → trả leaseId, bao_ket_qua kèm leaseId đóng vòng', async () => {
    const u = await makeUser(db)
    const t = await tokenFor(u)
    expect((await call(t, 'dieu_phoi', {})).content[0].text).toContain('Không có việc')
    await call(t, 'tao_task', newTask)
    await db.update(tasks).set({ nextRunAt: new Date(now.getTime() - 60_000) })
    const res = await call(t, 'dieu_phoi', {})
    const json = JSON.parse(res.content[0].text.slice(res.content[0].text.indexOf('{')))
    expect(json.viec).toHaveLength(1)
    const leaseId = json.viec[0].leaseId
    expect((await call(t, 'bao_ket_qua', { slug: 'upsell', status: 'ok', leaseId })).isError).toBeFalsy()
    const again = await call(t, 'bao_ket_qua', { slug: 'upsell', status: 'ok', leaseId })
    expect(again.content[0].text).toContain('đã ghi trước đó')
  })
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/http/mcp.test.ts`
Expected: FAIL — chưa có `dieu_phoi`.

- [ ] **Step 3: Sửa `server/mcp/tools.ts`**

Thêm import `import { dispatch } from '../core/dispatch.js'`.

Thay `MCP_INSTRUCTIONS` bằng:

```ts
export const MCP_INSTRUCTIONS = [
  'Work System là bàn điều phối công việc của team BraveBits.',
  'Vòng Điều phối (tác vụ hẹn giờ 15 phút): gọi dieu_phoi; nếu không có việc thì kết thúc ngay. Với mỗi việc: làm theo instructions của task (và instructions/note của lệnh nếu là lệnh), dùng skill được ghi nếu có, rồi LUÔN gọi bao_ket_qua kèm đúng leaseId — kể cả khi lỗi. Lỗi một việc không được làm dừng các việc khác. Không hỏi lại người dùng trong vòng Điều phối.',
  'Ngoài vòng Điều phối: tao_task để khai báo việc định kỳ, sua_task để cập nhật, xem_task để xem, bao_ket_qua (không leaseId) khi người dùng nhờ chạy tay, nop_bao_cao_tuan cho báo cáo tuần.',
  'Đồng nghiệp xem được mọi thứ ghi vào đây: KHÔNG BAO GIỜ ghi mật khẩu, API key, token hay dữ liệu cá nhân của khách hàng.',
  'slug: chữ thường không dấu, số và dấu gạch ngang. cron: 5 trường, theo giờ Việt Nam.',
].join(' ')
```

Đăng ký tool mới (đặt trước `tao_task`):

```ts
  const empty = z.object({})
  server.registerTool(
    'dieu_phoi',
    {
      title: 'Điều phối',
      description: 'Nhận việc cần làm ngay: lệnh từ web và task đến hạn của bạn. Gọi đầu tiên trong mỗi vòng Điều phối. Mỗi việc có leaseId — gửi lại leaseId đó trong bao_ket_qua.',
      inputSchema: empty,
    },
    guarded(async (_args: z.output<typeof empty>, me) => {
      const viec = await dispatch(deps.db, me, deps.now())
      if (viec.length === 0) return ok('Không có việc nào đến hạn. Kết thúc vòng Điều phối.', { viec })
      return ok(
        `Có ${viec.length} việc. Làm lần lượt, lệnh trước. Sau mỗi việc gọi bao_ket_qua với slug và leaseId tương ứng.`,
        { viec },
      )
    }),
  )
```

Trong handler `bao_ket_qua`, đổi phần thân thành:

```ts
      const { task, duplicate } = await reportRun(deps.db, me, args, deps.now())
      if (duplicate) return ok(`Kết quả cho lease này đã ghi trước đó — không ghi lại.`, { slug: task.slug })
      return ok(`Đã ghi kết quả cho "${task.name}". Trạng thái: ${task.stateLabel}.`, { slug: task.slug, state: task.state, nextRunAt: task.nextRunAt?.toISOString() ?? null })
```

và mô tả tool `bao_ket_qua` thêm câu: `' Trong vòng Điều phối, BẮT BUỘC gửi leaseId nhận từ dieu_phoi.'`.

Lưu ý: hàm `ok` ghép `summary` + `\n\n` + JSON; test cắt từ dấu `{` đầu tiên — summary không được chứa `{`.

- [ ] **Step 4: Chạy test**

Run: `npx vitest run server && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(mcp): tool dieu_phoi và leaseId trong bao_ket_qua"
```

---

### Task 7: Web — nút hành động gửi lệnh thật, vé lệnh, thanh trạng thái Claude

**Files:**
- Create: `src/components/Commands.tsx`, `src/components/Presence.tsx`, `src/styles/control.css`
- Modify: `src/lib/data.ts`, `src/lib/types.ts`, `src/components/Bits.tsx`, `src/components/Desk.tsx`, `src/components/TaskSpace.tsx`, `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: route Task 5; DTO.
- Produces: `sendCommand(slug, actionId, note?)`, `cancelCommandApi(id)`, `saveSchedule(slug, cron, label?)`, `savePaused(slug, paused)`, `previewCron(cron)`, `saveWorkHours(v)`; `Key.onPress?: () => void | Promise<void>`; `<ActionBar task readOnly onSend />`, `<CommandTickets commands onCancel readOnly />`, `<PresenceBar owner isMine now />`.

- [ ] **Step 1: `src/lib/types.ts`** — thêm vào khối re-export từ `shared/dto`: `SchedulePreviewDTO as SchedulePreview`; và `export type { WorkHours } from '../../shared/schema'`.

- [ ] **Step 2: `src/lib/data.ts`** — thêm:

```ts
import type { Command, SchedulePreview, WorkHours } from './types'

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const sendCommand = (slug: string, actionId: string, note?: string) =>
  api<Command>(`/api/tasks/${encodeURIComponent(slug)}/commands`, json('POST', { actionId, note: note || undefined }))
export const cancelCommandApi = (id: string) => api<{ ok: true }>(`/api/commands/${encodeURIComponent(id)}/cancel`, json('POST'))
export const saveSchedule = (slug: string, cron: string, scheduleLabel?: string) =>
  api<{ cron: string; scheduleLabel: string; nextRun: string | null }>(`/api/tasks/${encodeURIComponent(slug)}/schedule`, json('PUT', { cron, scheduleLabel: scheduleLabel || undefined }))
export const savePaused = (slug: string, paused: boolean) =>
  api<{ paused: boolean; nextRun: string | null }>(`/api/tasks/${encodeURIComponent(slug)}/pause`, json('PUT', { paused }))
export const previewCron = (cron: string) => api<SchedulePreview>(`/api/schedule/preview?cron=${encodeURIComponent(cron)}`)
export const saveWorkHours = (v: WorkHours) => api<Me>('/api/me/work-hours', json('PUT', v))
```

(gộp import kiểu với dòng import hiện có; `Me` đã import.)

- [ ] **Step 3: `src/components/Bits.tsx` — `Key` chờ Promise thật**

Thay thân hàm `press` và phần hiển thị:

```tsx
  async function press(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await onPress?.()
    } finally {
      timer.current = window.setTimeout(() => setBusy(false), 250)
    }
  }
```

và đổi chữ `'Đang chạy…'` thành `'Đang gửi…'`. Kiểu prop: `onPress?: () => void | Promise<void>`.

- [ ] **Step 4: Viết `src/components/Commands.tsx`**

```tsx
import { useState } from 'react'
import type { Command, Task } from '../lib/types'
import { ago, clock } from '../lib/format'

const STEP: Record<Command['status'], number> = { pending: 0, claimed: 1, done: 2, failed: 2, expired: 2, cancelled: 2 }
const WORD: Record<Command['status'], string> = {
  pending: 'Chờ Claude nhận',
  claimed: 'Claude đang làm',
  done: 'Xong',
  failed: 'Lỗi',
  expired: 'Quá hạn — không thấy báo',
  cancelled: 'Đã hủy',
}

export function CommandTickets({
  commands,
  readOnly,
  now,
  onCancel,
}: {
  commands: Command[]
  readOnly: boolean
  now: Date
  onCancel: (id: string) => Promise<void>
}) {
  if (commands.length === 0) return <p className="sec__note">Chưa có lệnh nào. Lệnh bạn gửi từ đây sẽ hiện thành vé và đi qua từng bước khi Claude xử lý.</p>
  return (
    <ol className="tickets">
      {commands.map((c) => {
        const step = STEP[c.status]
        const end = c.status === 'failed' || c.status === 'expired' ? 'bad' : c.status === 'cancelled' ? 'idle' : 'run'
        return (
          <li key={c.id} className={`ticket ticket--${c.status}`}>
            <div className="ticket__head">
              <span className="ticket__label">{c.label}</span>
              <span className="ticket__time">gửi {ago(c.createdAt, now)}</span>
              {!readOnly && c.status === 'pending' && (
                <button className="ticket__cancel" onClick={() => onCancel(c.id)}>
                  Hủy
                </button>
              )}
            </div>
            {c.note && <p className="ticket__note">“{c.note}”</p>}
            <div className="ticket__track" aria-label={WORD[c.status]}>
              {['Gửi', 'Claude nhận', step === 2 ? WORD[c.status] : 'Xong'].map((label, i) => (
                <div key={i} className={`ticket__stop${i < step ? ' is-past' : ''}${i === step ? ` is-now is-${i === 2 ? end : 'run'}` : ''}`}>
                  <span className="ticket__dot" />
                  <span className="ticket__name">{label}</span>
                  <span className="ticket__at">
                    {i === 0 ? clock(c.createdAt) : i === 1 && c.claimedAt ? clock(c.claimedAt) : i === 2 && c.finishedAt ? clock(c.finishedAt) : ''}
                  </span>
                </div>
              ))}
            </div>
            {c.result && step === 2 && <p className="ticket__result">{c.result}</p>}
          </li>
        )
      })}
    </ol>
  )
}

export function ActionBar({ task, onSend }: { task: Task; onSend: (actionId: string, note?: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const actions = [{ id: 'run', label: 'Chạy ngay', kind: 'run' as const }, ...task.actions.map((a) => ({ id: a.id, label: a.label, kind: a.kind }))]
  const [sending, setSending] = useState<string | null>(null)

  async function send(id: string) {
    setSending(id)
    try {
      await onSend(id, note.trim() || undefined)
      setNote('')
      setOpen(false)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="actbar">
      <div className="actbar__row">
        {actions.map((a) => (
          <button key={a.id} className={`actbtn actbtn--${a.kind}`} disabled={sending !== null} onClick={() => send(a.id)}>
            {sending === a.id ? 'Đang gửi…' : a.label}
          </button>
        ))}
        <button className="actbar__note-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Bỏ ghi chú' : '+ Ghi chú cho Claude'}
        </button>
      </div>
      {open && (
        <textarea
          className="actbar__note"
          maxLength={1000}
          placeholder="Ví dụ: chỉ chạy cho store gói Pro, bỏ qua store đã nhận tin tuần này"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Viết `src/components/Presence.tsx`**

```tsx
import type { Person } from '../lib/types'
import { ago, clock } from '../lib/format'

export function PresenceBar({ owner, isMine, now, onConnect }: { owner: Person; isMine: boolean; now: Date; onConnect: () => void }) {
  const who = isMine ? 'Claude của bạn' : `Claude của ${owner.name}`
  const next = owner.nextDispatchAt ? `Điều phối kế tiếp khoảng ${clock(owner.nextDispatchAt)}` : ''
  const map = {
    online: { tone: 'run', text: `${who} đang trực`, sub: next },
    offline: { tone: 'bad', text: `${who} offline từ ${owner.lastSeenAt ? clock(owner.lastSeenAt) : '—'}`, sub: 'Lệnh mới sẽ nằm chờ tới khi máy và Claude desktop mở lại.' },
    resting: { tone: 'idle', text: `${who} nghỉ ngoài giờ`, sub: owner.lastSeenAt ? `Liên lạc lần cuối ${ago(owner.lastSeenAt, now)} · ${next}` : next },
    never: { tone: 'needs', text: `${who} chưa nối`, sub: isMine ? 'Nối Claude desktop để task tự chạy và báo kết quả lên đây.' : '' },
  } as const
  const s = map[owner.presence]
  return (
    <div className={`presence-bar presence-bar--${s.tone}`} role="status">
      <span className={`lamp lamp--${s.tone}`}>
        <span className="lamp__dot" />
      </span>
      <span className="presence-bar__text">{s.text}</span>
      {s.sub && <span className="presence-bar__sub">{s.sub}</span>}
      {isMine && owner.presence === 'never' && (
        <button className="presence-bar__cta" onClick={onConnect}>
          Hướng dẫn nối
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Nối vào `src/App.tsx`**

- Import: `import { cancelCommandApi, sendCommand } from './lib/data'` (gộp vào dòng import data), `import { PresenceBar } from './components/Presence'`.
- Thay hàm `fire` bằng:

```ts
  async function send(t: Task, actionId: string, note?: string) {
    try {
      const c = await sendCommand(t.id, actionId, note)
      const when = ws?.owner.nextDispatchAt ? `khoảng ${clock(ws.owner.nextDispatchAt)}` : 'ở lần Điều phối kế tiếp'
      setToast(`Đã gửi "${c.label}" — Claude nhận ${when}`)
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    }
  }
  const fire = (t: Task) => send(t, t.action.actionId)
  async function cancel(id: string) {
    try {
      await cancelCommandApi(id)
      setToast('Đã hủy lệnh')
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    }
  }
```

- Ngay dưới khối `.viewing` (và trên `err`), khi `ws && view !== 'team'` thêm:

```tsx
        {ws && view !== 'team' && <PresenceBar owner={ws.owner} isMine={ws.isMine} now={now} onConnect={() => go('connections')} />}
```

- Truyền xuống TaskSpace: `onSend={(actionId, note) => send(task, actionId, note)} onCancel={cancel} now={now}`.

- [ ] **Step 7: `src/components/TaskSpace.tsx`**

- Props thêm `onSend: (actionId: string, note?: string) => Promise<void>`, `onCancel: (id: string) => Promise<void>`, `now: Date`; `onFire` giữ để nút chính ở đầu trang dùng (`onFire: (t: Task) => void | Promise<void>`).
- `TABS` thành `['Báo cáo', 'Tiến độ', 'Lệnh', 'Nguồn dữ liệu', 'Lần chạy'] as const`; nhãn tab "Lệnh" kèm số lệnh đang chờ/đang làm: trong `TABS.map`, hiển thị `{x}{x === 'Lệnh' && live > 0 && <span className="tab__count">{live}</span>}` với `const live = task.commands.filter((c) => c.status === 'pending' || c.status === 'claimed').length`.
- Thêm nội dung tab:

```tsx
          {tab === 'Lệnh' && (
            <div>
              {!readOnly && <ActionBar task={task} onSend={onSend} />}
              <CommandTickets commands={task.commands} readOnly={readOnly} now={now} onCancel={onCancel} />
            </div>
          )}
```

  (import `ActionBar`, `CommandTickets` từ `./Commands`.)

- [ ] **Step 8: `src/components/Desk.tsx`** — kiểu `onFire: (t: Task) => void | Promise<void>` cho `Strip` và `Desk`; `Key onPress={() => onFire(task)}` giữ nguyên.

- [ ] **Step 9: Viết `src/styles/control.css` và import trong `src/main.tsx`** (sau `team.css`)

```css
/* ============================================================
   Điều khiển: thanh trạng thái Claude, thanh hành động, vé lệnh,
   khối tùy chọn, sửa lịch, khung giờ. Màu = trạng thái.
   ============================================================ */

.presence-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 16px 40px 0;
  padding: 10px 14px;
  border-radius: 11px;
  border: 1px solid var(--line-soft);
  background: var(--ink-raised);
  font-size: 13.5px;
}
.presence-bar--bad { background: var(--bad-dim); border-color: rgba(255, 92, 77, .3); }
.presence-bar--needs { background: var(--needs-dim); border-color: rgba(255, 176, 31, .3); }
.presence-bar__text { font-weight: 600; }
.presence-bar__sub { color: var(--fg-2); }
.presence-bar__cta {
  margin-left: auto;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--needs);
  color: var(--needs);
  font-size: 13px;
}
.presence-bar__cta:hover { background: var(--needs-dim); }

.tab__count {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--needs);
  color: #14161c;
  font: 600 11px/18px var(--mono);
}

.actbar { margin: 4px 0 22px; }
.actbar__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.actbtn {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--ink-raised);
  font-weight: 600;
  font-size: 14px;
  transition: transform .15s var(--ease-press), border-color .2s var(--ease), background .2s var(--ease);
}
.actbtn:hover:not(:disabled) { transform: translateY(-1px); }
.actbtn:active:not(:disabled) { transform: translateY(1px); }
.actbtn:disabled { opacity: .55; cursor: progress; }
.actbtn--run { border-color: rgba(0, 194, 168, .5); color: var(--run); }
.actbtn--run:hover:not(:disabled) { background: var(--run-dim); }
.actbtn--review { border-color: rgba(255, 176, 31, .5); color: var(--needs); }
.actbtn--review:hover:not(:disabled) { background: var(--needs-dim); }
.actbtn--fix { border-color: rgba(255, 92, 77, .5); color: var(--bad); }
.actbtn--fix:hover:not(:disabled) { background: var(--bad-dim); }
.actbtn--custom:hover:not(:disabled) { border-color: var(--fg-3); }
.actbar__note-toggle { margin-left: 4px; color: var(--fg-3); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
.actbar__note {
  display: block;
  width: 100%;
  min-height: 70px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--ink-sunken);
  color: var(--fg);
  font: inherit;
  resize: vertical;
}

.tickets { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.ticket {
  position: relative;
  padding: 14px 16px 12px;
  border-radius: 14px;
  background: var(--ink-raised);
  border: 1px solid var(--line-soft);
  overflow: hidden;
}
.ticket::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--idle); }
.ticket--pending::before { background: var(--needs); }
.ticket--claimed::before { background: var(--run); }
.ticket--done::before { background: var(--run); }
.ticket--failed::before, .ticket--expired::before { background: var(--bad); }
.ticket__head { display: flex; align-items: baseline; gap: 10px; }
.ticket__label { font-weight: 650; font-family: var(--display); font-size: 16px; }
.ticket__time { color: var(--fg-3); font-size: 12.5px; }
.ticket__cancel { margin-left: auto; color: var(--fg-3); font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px; }
.ticket__cancel:hover { color: var(--bad); }
.ticket__note { margin: 6px 0 0; color: var(--fg-2); font-size: 13.5px; font-style: italic; }
.ticket__track { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 14px; position: relative; }
.ticket__track::before { content: ''; position: absolute; left: 6px; right: 6px; top: 6px; height: 2px; background: var(--line); }
.ticket__stop { position: relative; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--fg-3); }
.ticket__stop:nth-child(2) { align-items: center; text-align: center; }
.ticket__stop:nth-child(3) { align-items: flex-end; text-align: right; }
.ticket__dot { width: 14px; height: 14px; border-radius: 50%; background: var(--ink-raised); border: 2px solid var(--line); z-index: 1; }
.ticket__stop.is-past .ticket__dot { background: var(--run); border-color: var(--run); }
.ticket__stop.is-past { color: var(--fg-2); }
.ticket__stop.is-now { color: var(--fg); font-weight: 600; }
.ticket__stop.is-now.is-run .ticket__dot { border-color: var(--run); box-shadow: 0 0 0 4px var(--run-dim); }
.ticket__stop.is-now.is-bad .ticket__dot { border-color: var(--bad); background: var(--bad); box-shadow: 0 0 0 4px var(--bad-dim); }
.ticket__stop.is-now.is-idle .ticket__dot { border-color: var(--idle); background: var(--idle); }
.ticket--pending .ticket__stop.is-now .ticket__dot { border-color: var(--needs); box-shadow: 0 0 0 4px var(--needs-dim); animation: breathe-amber 2.4s var(--ease) infinite; }
.ticket--claimed .ticket__stop.is-now .ticket__dot { animation: breathe 2.4s var(--ease) infinite; }
.ticket--done .ticket__stop:last-child .ticket__dot { background: var(--run); border-color: var(--run); }
.ticket__at { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }
.ticket__result { margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--line-soft); font-size: 13.5px; color: var(--fg-2); }
@keyframes breathe-amber {
  0% { box-shadow: 0 0 0 0 rgba(255, 176, 31, .45); }
  70% { box-shadow: 0 0 0 8px rgba(255, 176, 31, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 176, 31, 0); }
}

@media (max-width: 720px) {
  .presence-bar { margin-left: 16px; margin-right: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .ticket__dot { animation: none !important; }
  .actbtn { transition: none; }
}
```

- [ ] **Step 10: Typecheck, build, test**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

- [ ] **Step 11: Commit**

```bash
git add src
git commit -m "feat(web): nút gửi lệnh thật, vé lệnh theo trạng thái, thanh trạng thái Claude"
```

---

### Task 8: Web — hiển thị khối tùy chọn (bảng, checklist, biểu đồ, ghi chú)

**Files:**
- Create: `src/lib/miniMarkdown.ts`, `src/lib/miniMarkdown.test.ts`, `src/components/Blocks.tsx`
- Modify: `src/components/TaskSpace.tsx`, `src/styles/control.css`

**Interfaces:**
- Produces: `parseMiniMarkdown(text: string): MdBlock[]` với `MdBlock = { type: 'p'; inl: MdInline[] } | { type: 'ul'; items: MdInline[][] }`, `MdInline = { t: 'text' | 'b' | 'i' | 'code'; v: string }`; `<Blocks blocks={Block[]} />`.

- [ ] **Step 1: Viết test `src/lib/miniMarkdown.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { parseMiniMarkdown } from './miniMarkdown'

describe('parseMiniMarkdown', () => {
  it('đoạn văn, đậm, nghiêng, code', () => {
    expect(parseMiniMarkdown('Gửi **41** tin cho *store Pro*, xem `sheet A`')).toEqual([
      { type: 'p', inl: [{ t: 'text', v: 'Gửi ' }, { t: 'b', v: '41' }, { t: 'text', v: ' tin cho ' }, { t: 'i', v: 'store Pro' }, { t: 'text', v: ', xem ' }, { t: 'code', v: 'sheet A' }] },
    ])
  })

  it('danh sách gạch đầu dòng và nhiều đoạn', () => {
    expect(parseMiniMarkdown('Tuần này:\n- một\n- **hai**\n\nHết')).toEqual([
      { type: 'p', inl: [{ t: 'text', v: 'Tuần này:' }] },
      { type: 'ul', items: [[{ t: 'text', v: 'một' }], [{ t: 'b', v: 'hai' }]] },
      { type: 'p', inl: [{ t: 'text', v: 'Hết' }] },
    ])
  })

  it('HTML/script giữ nguyên là chữ (React sẽ escape)', () => {
    expect(parseMiniMarkdown('<script>alert(1)</script>')).toEqual([{ type: 'p', inl: [{ t: 'text', v: '<script>alert(1)</script>' }] }])
  })

  it('dấu ** không đóng → giữ là chữ', () => {
    expect(parseMiniMarkdown('a ** b')).toEqual([{ type: 'p', inl: [{ t: 'text', v: 'a ** b' }] }])
  })

  it('chuỗi rỗng → không có khối', () => {
    expect(parseMiniMarkdown('  \n ')).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run src/lib/miniMarkdown.test.ts`
Expected: FAIL — module chưa có.

- [ ] **Step 3: Viết `src/lib/miniMarkdown.ts`**

```ts
export type MdInline = { t: 'text' | 'b' | 'i' | 'code'; v: string }
export type MdBlock = { type: 'p'; inl: MdInline[] } | { type: 'ul'; items: MdInline[][] }

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`/g

/** Markdown giới hạn (đậm, nghiêng, code, gạch đầu dòng). Không bao giờ sinh HTML — chỉ trả cây để React render như chữ. */
export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = []
  let last = 0
  for (const m of s.matchAll(INLINE)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'b', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'i', v: m[2] })
    else out.push({ t: 'code', v: m[3] })
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) })
  return out
}

export function parseMiniMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  for (const chunk of text.split(/\n\s*\n/)) {
    let para: string[] = []
    let list: MdInline[][] | null = null
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', inl: parseInline(para.join(' ')) })
      para = []
    }
    const flushList = () => {
      if (list) blocks.push({ type: 'ul', items: list })
      list = null
    }
    for (const raw of chunk.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const item = /^[-*]\s+(.*)$/.exec(line)
      if (item) {
        flushPara()
        ;(list ??= []).push(parseInline(item[1]))
      } else {
        flushList()
        para.push(line)
      }
    }
    flushPara()
    flushList()
  }
  return blocks
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/lib/miniMarkdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết `src/components/Blocks.tsx`**

```tsx
import { useState } from 'react'
import type { Block } from '../lib/types'
import { parseMiniMarkdown, type MdInline } from '../lib/miniMarkdown'

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)']
const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, notation: 'compact' })

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'b' ? <strong key={i}>{p.v}</strong> : p.t === 'i' ? <em key={i}>{p.v}</em> : p.t === 'code' ? <code key={i}>{p.v}</code> : <span key={i}>{p.v}</span>,
      )}
    </>
  )
}

function Note({ text }: { text: string }) {
  return (
    <div className="blk__note">
      {parseMiniMarkdown(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>
            <Inline parts={b.inl} />
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline parts={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

function Table({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="blk__scroll">
      <table className="blk__table">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'is-num' : undefined}>
                  {typeof v === 'number' ? v.toLocaleString('vi-VN') : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Checklist({ items }: { items: { text: string; done: boolean }[] }) {
  const done = items.filter((i) => i.done).length
  return (
    <>
      <div className="blk__meter" aria-label={`${done} trên ${items.length} mục xong`}>
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="blk__check">
        {items.map((it, i) => (
          <li key={i} className={it.done ? 'is-done' : undefined}>
            <span className="blk__box" aria-hidden="true">{it.done ? '✓' : ''}</span>
            <span>{it.text}</span>
            <span className="sr-only">{it.done ? '(xong)' : '(chưa xong)'}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

type ChartData = Extract<Block, { type: 'chart' }>['data']

function Chart({ data }: { data: ChartData }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const W = 640
  const H = 220
  const P = { l: 44, r: 64, t: 14, b: 28 }
  const n = data.labels.length
  const all = data.series.flatMap((s) => s.values)
  const max = Math.max(0, ...all)
  const min = Math.min(0, ...all)
  const span = max - min || 1
  const iw = W - P.l - P.r
  const ih = H - P.t - P.b
  const y = (v: number) => P.t + ih - ((v - min) / span) * ih
  const band = iw / Math.max(n, 1)
  const cx = (i: number) => (data.kind === 'line' ? P.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw) : P.l + band * i + band / 2)
  const ticks = [min, min + span / 2, max]
  const k = data.series.length
  const group = band * 0.7
  const bw = Math.max(2, (group - 2 * (k - 1)) / k)

  const bar = (x: number, v: number) => {
    const y0 = y(0)
    const y1 = y(v)
    const r = Math.min(4, bw / 2, Math.abs(y0 - y1))
    if (v >= 0) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`
    return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 - r} V${y0} Z`
  }

  if (asTable) {
    return (
      <>
        <Table columns={['', ...data.series.map((s) => s.name)]} rows={data.labels.map((l, i) => [l, ...data.series.map((s) => s.values[i])])} />
        <button className="blk__toggle" onClick={() => setAsTable(false)}>Xem biểu đồ</button>
      </>
    )
  }

  return (
    <div className="blk__chart">
      {k >= 2 && (
        <ul className="blk__legend">
          {data.series.map((s, i) => (
            <li key={s.name}>
              <span className="blk__swatch" style={{ background: SERIES[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="blk__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Biểu đồ ${data.kind === 'line' ? 'đường' : 'cột'}: ${data.series.map((s) => s.name).join(', ')}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="blk__grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="blk__tick">{fmt.format(t)}</text>
            </g>
          ))}
          {data.labels.map((l, i) =>
            n <= 12 || i % Math.ceil(n / 12) === 0 ? (
              <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className="blk__tick">{l}</text>
            ) : null,
          )}
          {data.kind === 'line'
            ? data.series.map((s, si) => (
                <g key={s.name}>
                  <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(n - 1)} cy={y(s.values[n - 1])} r={4} fill={SERIES[si]} stroke="var(--ink-raised)" strokeWidth={2} />
                  <text x={cx(n - 1) + 8} y={y(s.values[n - 1]) + 4} className="blk__direct">{fmt.format(s.values[n - 1])}</text>
                </g>
              ))
            : data.series.map((s, si) => (
                <g key={s.name}>
                  {s.values.map((v, i) => (
                    <path key={i} d={bar(cx(i) - group / 2 + si * (bw + 2), v)} fill={SERIES[si]} opacity={hover === null || hover === i ? 1 : 0.45} />
                  ))}
                </g>
              ))}
          {hover !== null && data.kind === 'line' && <line x1={cx(hover)} x2={cx(hover)} y1={P.t} y2={P.t + ih} className="blk__cross" />}
          {hover !== null &&
            data.kind === 'line' &&
            data.series.map((s, si) => <circle key={si} cx={cx(hover)} cy={y(s.values[hover])} r={4} fill={SERIES[si]} stroke="var(--ink-raised)" strokeWidth={2} />)}
          {data.labels.map((_, i) => (
            <rect key={i} x={cx(i) - band / 2} y={P.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="blk__tip" style={{ left: `${(cx(hover) / W) * 100}%` }}>
            <div className="blk__tip-h">{data.labels[hover]}</div>
            {data.series.map((s, si) => (
              <div key={si} className="blk__tip-row">
                <span className="blk__swatch" style={{ background: SERIES[si] }} />
                <span>{s.name}</span>
                <b>{s.values[hover].toLocaleString('vi-VN')}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="blk__toggle" onClick={() => setAsTable(true)}>Xem dạng bảng</button>
    </div>
  )
}

export default function Blocks({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="blocks">
      {blocks.map((b) => (
        <section key={b.id} className={`blk blk--${b.type}`}>
          <h3 className="blk__title">{b.title}</h3>
          {b.type === 'note' && <Note text={b.data.text} />}
          {b.type === 'table' && <Table columns={b.data.columns} rows={b.data.rows} />}
          {b.type === 'checklist' && <Checklist items={b.data.items} />}
          {b.type === 'chart' && <Chart data={b.data} />}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Gắn vào `src/components/TaskSpace.tsx`**

`import Blocks from './Blocks'`; trong tab `'Báo cáo'`, ngay sau thẻ đóng `</div>` của `<div className="cols">`, thêm `<Blocks blocks={task.blocks} />`. (Bọc tab Báo cáo trong `<>…</>` nếu cần.)

- [ ] **Step 7: CSS — thêm vào cuối `src/styles/control.css`**

```css
/* ---------- khối tùy chọn ---------- */
:root { --s1: #3987e5; --s2: #008300; --s3: #d55181; }

.blocks { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 22px; }
.blk { padding: 16px 18px; border-radius: 14px; background: var(--ink-raised); border: 1px solid var(--line-soft); min-width: 0; }
.blk--chart, .blk--table { grid-column: 1 / -1; }
.blk__title { margin: 0 0 12px; font-family: var(--display); font-size: 16px; font-weight: 650; }
.blk__note p { margin: 0 0 10px; color: var(--fg-2); line-height: 1.6; }
.blk__note ul { margin: 0 0 10px; padding-left: 18px; color: var(--fg-2); line-height: 1.6; }
.blk__note strong { color: var(--fg); }
.blk__note code { font-family: var(--mono); font-size: .92em; padding: 1px 5px; border-radius: 5px; background: var(--ink-sunken); }
.blk__scroll { overflow-x: auto; }
.blk__table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.blk__table th { text-align: left; font-weight: 600; color: var(--fg-3); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; padding: 0 10px 8px; border-bottom: 1px solid var(--line); }
.blk__table td { padding: 9px 10px; border-bottom: 1px solid var(--line-soft); }
.blk__table td.is-num { text-align: right; font-family: var(--mono); }
.blk__table tr:last-child td { border-bottom: 0; }
.blk__meter { height: 4px; border-radius: 2px; background: var(--line-soft); overflow: hidden; margin-bottom: 12px; }
.blk__meter span { display: block; height: 100%; background: var(--run); border-radius: 2px; transition: width .6s var(--ease); }
.blk__check { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14px; }
.blk__check li { display: flex; gap: 10px; align-items: flex-start; }
.blk__check li.is-done { color: var(--fg-3); text-decoration: line-through; }
.blk__box { flex: none; width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 12px; color: #14161c; }
.is-done .blk__box { background: var(--run); border-color: var(--run); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.blk__legend { list-style: none; display: flex; gap: 16px; margin: 0 0 8px; padding: 0; font-size: 13px; color: var(--fg-2); }
.blk__legend li { display: flex; align-items: center; gap: 6px; }
.blk__swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.blk__plot { position: relative; }
.blk__plot svg { display: block; width: 100%; height: auto; overflow: visible; }
.blk__grid { stroke: var(--line-soft); stroke-width: 1; }
.blk__tick { fill: var(--fg-3); font-family: var(--mono); font-size: 11px; }
.blk__direct { fill: var(--fg-2); font-family: var(--mono); font-size: 12px; }
.blk__cross { stroke: var(--fg-3); stroke-width: 1; stroke-dasharray: 3 3; }
.blk__tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  pointer-events: none;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--ink-high);
  border: 1px solid var(--line);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .45);
  font-size: 12.5px;
  white-space: nowrap;
  z-index: 2;
}
.blk__tip-h { color: var(--fg-3); font-family: var(--mono); font-size: 11px; margin-bottom: 4px; }
.blk__tip-row { display: flex; align-items: center; gap: 6px; }
.blk__tip-row b { margin-left: auto; padding-left: 12px; font-family: var(--mono); font-weight: 500; }
.blk__toggle { margin-top: 10px; color: var(--fg-3); font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px; }
```

- [ ] **Step 8: Typecheck, build, test**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(web): hiển thị khối tùy chọn — ghi chú an toàn, bảng, checklist, biểu đồ có tooltip và bảng"
```

---

### Task 9: Web — sửa lịch, tạm dừng thật, khung giờ Điều phối

**Files:**
- Create: `src/components/WorkHours.tsx`
- Modify: `src/components/Schedule.tsx`, `src/components/Connections.tsx`, `src/App.tsx`, `src/styles/control.css`

**Interfaces:**
- Consumes: `saveSchedule`, `savePaused`, `previewCron`, `saveWorkHours`, `Switch`, `dayAndClock`, `Me`.
- Produces: `Schedule` nhận `readOnly`, `onChanged: () => void`, `onToast: (m: string) => void`; `<WorkHoursEditor me onSaved />`.

- [ ] **Step 1: `src/components/Schedule.tsx` — sửa lịch và tạm dừng**

Thêm import:

```tsx
import { useEffect, useState } from 'react'
import type { SchedulePreview } from '../lib/types'
import { previewCron, savePaused, saveSchedule } from '../lib/data'
import { Switch } from './Bits'
```

Thêm component trên `export default function Schedule`:

```tsx
function CronEditor({ task, onDone, onToast }: { task: Task; onDone: () => void; onToast: (m: string) => void }) {
  const [cron, setCron] = useState(task.cron)
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      previewCron(cron).then(setPreview).catch(() => setPreview(null))
    }, 350)
    return () => window.clearTimeout(id)
  }, [cron])

  async function save() {
    setSaving(true)
    try {
      await saveSchedule(task.id, cron)
      onToast(`Đã đổi lịch "${task.name}"`)
      onDone()
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cron-ed">
      <label className="cron-ed__field">
        <span>Cron (giờ Việt Nam)</span>
        <input value={cron} onChange={(e) => setCron(e.target.value)} spellCheck={false} autoFocus />
      </label>
      <div className={`cron-ed__preview${preview && !preview.valid ? ' is-bad' : ''}`} aria-live="polite">
        {!preview ? '…' : !preview.valid ? 'Cron chưa hợp lệ — cần 5 trường, ví dụ 0 9 * * 1-5' : (
          <>
            <b>{preview.label ?? cron}</b>
            <span>Ba lần kế tiếp: {preview.next.map((d) => dayAndClock(d)).join(' · ')}</span>
          </>
        )}
      </div>
      <div className="cron-ed__actions">
        <button className="actbtn" onClick={onDone}>Hủy</button>
        <button className="actbtn actbtn--run" disabled={saving || !preview?.valid || cron === task.cron} onClick={save}>
          {saving ? 'Đang lưu…' : 'Lưu lịch'}
        </button>
      </div>
    </div>
  )
}
```

Đổi chữ ký component chính:

```tsx
export default function Schedule({
  tasks,
  now,
  readOnly,
  onChanged,
  onToast,
}: {
  tasks: Task[]
  now: Date
  readOnly: boolean
  onChanged: () => void
  onToast: (m: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [pausing, setPausing] = useState<Record<string, boolean>>({})

  async function togglePause(t: Task) {
    const next = !(pausing[t.id] ?? t.paused)
    setPausing((s) => ({ ...s, [t.id]: next }))
    try {
      await savePaused(t.id, next)
      onToast(next ? `Đã tạm dừng "${t.name}"` : `"${t.name}" chạy lại theo lịch`)
      onChanged()
    } catch (e) {
      setPausing((s) => ({ ...s, [t.id]: !next }))
      onToast((e as Error).message)
    }
  }
```

Trong danh sách "Từng lịch", với mỗi `t`:
- `const paused = pausing[t.id] ?? t.paused` (dùng thay cho `t.paused` ở các chỗ hiển thị trong dòng này).
- Thêm nút sửa cạnh `job__cron` (chỉ khi `!readOnly`): `<button className="job__edit" onClick={() => setEditing(editing === t.id ? null : t.id)}>{editing === t.id ? 'Đóng' : 'Sửa lịch'}</button>`.
- Trong `job__r`, sau khối thời gian, thêm (khi `!readOnly`): `<Switch on={!paused} label={`Lịch chạy của ${t.name}`} onToggle={() => togglePause(t)} />`.
- Ngay sau `</div>` của `.job`, thêm `{editing === t.id && <CronEditor task={t} onDone={() => { setEditing(null); onChanged() }} onToast={onToast} />}` (bọc mỗi dòng trong `<Fragment key={t.id}>`, import `Fragment` từ react, chuyển `key` lên Fragment).

Đổi câu mô tả đầu trang thành: `Bảy ngày tới, từ {FROM}:00 đến {TO}:00, theo giờ Việt Nam.{readOnly ? '' : ' Bấm "Sửa lịch" để đổi giờ, công tắc để tạm dừng — Claude áp dụng ở lần Điều phối kế tiếp.'}`

- [ ] **Step 2: Viết `src/components/WorkHours.tsx`**

```tsx
import { useState } from 'react'
import type { Me } from '../lib/types'
import { saveWorkHours } from '../lib/data'

const DAYS = [
  { d: 1, l: 'T2' }, { d: 2, l: 'T3' }, { d: 3, l: 'T4' }, { d: 4, l: 'T5' }, { d: 5, l: 'T6' }, { d: 6, l: 'T7' }, { d: 0, l: 'CN' },
]

export function WorkHoursEditor({ me, onSaved, onToast }: { me: Me; onSaved: (m: Me) => void; onToast: (m: string) => void }) {
  const [days, setDays] = useState<number[]>(me.workDays)
  const [start, setStart] = useState(me.workStart)
  const [end, setEnd] = useState(me.workEnd)
  const [saving, setSaving] = useState(false)
  const dirty = days.join() !== me.workDays.join() || start !== me.workStart || end !== me.workEnd
  const valid = days.length > 0 && start < end

  async function save() {
    setSaving(true)
    try {
      onSaved(await saveWorkHours({ workDays: days, workStart: start, workEnd: end }))
      onToast('Đã lưu khung giờ Điều phối')
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const startH = Number(start.slice(0, 2))
  const endH = Number(end.slice(0, 2)) - (end.endsWith(':00') ? 1 : 0)
  const dow = [...days].sort((a, b) => a - b).join(',')
  const hint = valid ? `Lịch cho tác vụ hẹn giờ "dieu-phoi": mỗi 15 phút (*/15 ${startH}-${endH} * * ${dow})` : ''

  return (
    <section className="hours rise">
      <h2 className="claude__title">Khung giờ Điều phối</h2>
      <p className="claude__lede">Claude kiểm việc mỗi 15 phút trong khung này. Ngoài khung, bàn của bạn hiện "nghỉ ngoài giờ" thay vì báo offline.</p>
      <div className="hours__days" role="group" aria-label="Ngày làm việc">
        {DAYS.map(({ d, l }) => (
          <button
            key={d}
            className="hours__day"
            aria-pressed={days.includes(d)}
            onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="hours__times">
        <label>Từ <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={900} /></label>
        <label>đến <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} step={900} /></label>
        <button className="actbtn actbtn--run" disabled={!dirty || !valid || saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
      {!valid && <p className="hours__err">Chọn ít nhất một ngày và giờ bắt đầu phải trước giờ kết thúc.</p>}
      {hint && <p className="hours__hint">{hint}</p>}
    </section>
  )
}
```

- [ ] **Step 3: Gắn vào `Connections.tsx` và `App.tsx`**

`Connections` thêm props `me: Me | null`, `onMeSaved: (m: Me) => void`, `onToast: (m: string) => void`; ngay sau `{claude && <ClaudePanel … />}` thêm `{me && <WorkHoursEditor me={me} onSaved={onMeSaved} onToast={onToast} />}` (import `WorkHoursEditor` từ `./WorkHours`, `Me` từ types).

`App.tsx`:
- `App` giữ `me` trong state và truyền `setMe` xuống: `return <Shell me={me} onMe={setMe} />`; `Shell({ me, onMe }: { me: Me; onMe: (m: Me) => void })`.
- Render Connections: `<Connections connections={ws.connections} tasks={ws.tasks} claude={ws.isMine ? claude : null} onRevoke={revoke} me={ws.isMine ? me : null} onMeSaved={(m) => { onMe(m); refresh() }} onToast={setToast} />`.
- Render Schedule: `<Schedule tasks={ws.tasks} now={now} readOnly={readOnly} onChanged={refresh} onToast={setToast} />`.

- [ ] **Step 4: CSS — thêm vào cuối `src/styles/control.css`**

```css
/* ---------- sửa lịch ---------- */
.job__edit { margin-left: 8px; color: var(--fg-3); font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px; }
.job__edit:hover { color: var(--needs); }
.cron-ed {
  margin: -6px 0 14px;
  padding: 16px;
  border-radius: 0 0 14px 14px;
  background: var(--ink-sunken);
  border: 1px solid var(--line-soft);
  border-top: 0;
  display: grid;
  gap: 12px;
}
.cron-ed__field { display: grid; gap: 6px; font-size: 12.5px; color: var(--fg-3); }
.cron-ed__field input {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--ink);
  color: var(--needs);
  font: 500 15px var(--mono);
}
.cron-ed__field input:focus { outline: none; border-color: var(--needs); }
.cron-ed__preview { display: grid; gap: 4px; font-size: 13.5px; color: var(--fg-2); }
.cron-ed__preview b { color: var(--fg); font-weight: 600; }
.cron-ed__preview.is-bad { color: var(--bad); }
.cron-ed__actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ---------- khung giờ ---------- */
.hours { margin: 0 0 30px; padding: 22px; border-radius: 16px; background: linear-gradient(180deg, var(--ink-raised), var(--ink)); border: 1px solid var(--line); }
.hours__days { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.hours__day {
  width: 46px;
  height: 36px;
  border-radius: 9px;
  border: 1px solid var(--line);
  color: var(--fg-3);
  font: 600 13px var(--mono);
}
.hours__day[aria-pressed='true'] { background: var(--needs-dim); border-color: var(--needs); color: var(--needs); }
.hours__times { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 14px; color: var(--fg-2); }
.hours__times input {
  margin-left: 6px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--ink-sunken);
  color: var(--fg);
  font: 500 14px var(--mono);
  color-scheme: dark;
}
.hours__err { color: var(--bad); font-size: 13px; margin: 10px 0 0; }
.hours__hint { color: var(--fg-3); font: 12px var(--mono); margin: 12px 0 0; }
```

- [ ] **Step 5: Typecheck, build, test**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(web): sửa lịch có xem trước, công tắc tạm dừng thật, khung giờ Điều phối"
```

---

### Task 10: Kiểm tra trọn vòng trên dev server

**Files:** không đổi code (chỉ sửa nếu kiểm tra phát hiện lỗi — mỗi lỗi kèm test).

- [ ] **Step 1: Khởi động lại dev server** (để PGlite chạy migration và nạp code mới): dừng `npm run dev`, `npm run dev` lại.

- [ ] **Step 2: Kịch bản bằng Playwright (script tạm ngoài repo)**

1. Đăng nhập dev (`/auth/dev?email=tutnv@bravebits.vn&name=Logan`).
2. Lấy access token qua luồng OAuth như kế hoạch 2 (register → authorize → allow → token).
3. Trên web: mở task "Chiến dịch upsell Q3/2026" → tab **Lệnh** → bấm **Chạy ngay** kèm ghi chú → vé hiện "Chờ Claude nhận".
4. Gọi MCP `dieu_phoi` bằng token → nhận 1 lệnh (và các task đến hạn) kèm `leaseId`.
5. Tải lại web → vé ở bước "Claude nhận"; thanh trạng thái hiện "Claude của bạn đang trực".
6. Gọi `bao_ket_qua` với `leaseId` của lệnh, `status: ok`, kèm `blocks` gồm 1 chart line 2 series và 1 note có `**đậm**` và `<script>` → vé "Xong"; tab Báo cáo hiện biểu đồ có legend, rê chuột hiện tooltip, "Xem dạng bảng" hoạt động; note hiện `<script>` dạng chữ.
7. Mục **Lịch chạy**: "Sửa lịch" → nhập `0 16 * * 5` → hiện "16:00 · T6" và 3 lần kế tiếp → Lưu; bật/tắt công tắc tạm dừng.
8. Mục **Kết nối**: đổi khung giờ (bỏ T6) → Lưu → toast.
9. Mở bàn đồng nghiệp demo → không có thanh hành động, không có nút Sửa lịch/công tắc; tab Lệnh chỉ đọc.
10. Thu hẹp còn 390px: vé lệnh, khối, sửa lịch không tràn ngang.

Expected: mọi bước như mô tả; không có lỗi console (trừ 403 khi trình duyệt bị chuyển sang claude.ai trong bước OAuth).

- [ ] **Step 3: Commit** (nếu có sửa)

```bash
git add -A src server shared
git commit -m "fix: chỉnh sau kiểm tra trọn vòng Điều phối"
```
