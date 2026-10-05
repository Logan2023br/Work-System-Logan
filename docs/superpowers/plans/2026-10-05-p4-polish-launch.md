# Work System — Kế hoạch 4/4: Hoàn thiện & ra mắt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa Work System tới mức dùng được cho cả team: bộ skill Claude tải về được, trang "Nối Claude" 4 bước tự đánh dấu, ⌘K, khung chờ dạng skeleton, admin vô hiệu hóa người dùng trên giao diện, chọn tuần báo cáo, dọn dữ liệu định kỳ, E2E tự động, và xử lý các lỗi nhỏ còn để dành từ kế hoạch 1–3.

**Architecture:** Giữ nguyên kiến trúc. Thêm `server/core/cleanup.ts` + route cron có bí mật; `shared/dispatcherCron.ts`; thư mục `skills/` (3 skill) đóng gói bằng `scripts/pack-skills.mjs` (fflate) vào `public/downloads/`; component `Guide`, `CommandPalette`, `Skeleton`; Playwright E2E chạy trên PGlite riêng.

**Tech Stack:** như trước + `fflate@^0.8` (dev), `@playwright/test@1.63` (dev).

**Spec:** `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md` (mục 8, 9, 11, 12 bước 4)

## Global Constraints

- Mọi ràng buộc của kế hoạch 1–3.
- Skill cho claude.ai: `name` chữ thường/số/gạch nối, trùng tên thư mục, ≤ 64 ký tự; `description` ≤ **200** ký tự; mỗi zip chứa **một thư mục** skill có `SKILL.md`.
- Log của run giữ **30 ngày**; cron dọn dẹp chạy hằng ngày, chỉ chạy khi có header `Authorization: Bearer <CRON_SECRET>`.
- Tạm dừng/bỏ tạm dừng không đổi gì khi trạng thái không đổi (không làm mất lần chạy bù).
- Mọi `localStorage` bọc try/catch; trang vẫn đúng khi không có storage.
- Giao diện tôn trọng `prefers-reduced-motion`; ⌘K điều khiển được bằng bàn phím.

## Review Focus

1. Gọi route dọn dẹp không có hoặc sai `CRON_SECRET` → 403, không xóa gì. (Task 2)
2. Claude refresh token kèm `resource` sai → báo `invalid_target` nhưng kết nối không mất (refresh đúng sau đó vẫn được). (Task 1)
3. Xem báo cáo một tuần không có hoặc khóa tuần sai dạng → 404 có thông điệp, không 500. (Task 3)
4. Tìm trong ⌘K bằng tiếng Việt không dấu ("bao cao", "upsell") vẫn ra kết quả. (Task 8)
5. Mô tả skill > 200 ký tự (claude.ai từ chối upload) → test chặn trước khi đóng gói. (Task 6)

---

## File Structure

```
server/core/oauth-tokens.ts   (sửa) refresh: kiểm resource trước khi xoay vòng
server/core/tasks.ts          (sửa) leaseId lạ → manual; khóa user trước; trùng slug → conflict
server/core/control.ts        (sửa) tạm dừng no-op; giới hạn lệnh chờ trong transaction
server/http/consent.ts, oauth.ts (sửa) hiện host định danh của client CIMD
server/core/cleanup.ts        dọn log, session, code, token, client DCR bỏ hoang
server/config.ts, server/http/app.ts, vercel.json (sửa) cron
server/core/time.ts           (sửa) weekFromKey
server/core/workspace.ts      (sửa) listReportWeeks, getReport
server/http/api.ts            (sửa) route báo cáo theo tuần
shared/cronText.ts            (sửa) giờ rời rạc
shared/dispatcherCron.ts      cron cho tác vụ "dieu-phoi" theo khung giờ
skills/{dieu-phoi,tao-task,bao-cao-tuan}/SKILL.md
scripts/pack-skills.mjs       đóng gói zip vào public/downloads
server/skills.test.ts         kiểm frontmatter skill
src/lib/search.ts             chuẩn hóa không dấu + lọc cho ⌘K
src/components/{Guide,CommandPalette,Skeleton}.tsx
src/components/{Team,Reflect,Schedule,Blocks,WorkHours,Presence,Desk}.tsx, src/App.tsx (sửa)
src/styles/polish.css
playwright.config.ts, e2e/loop.spec.ts
vite.config.ts (sửa) không ghi đè biến môi trường đã có
README.md (sửa)
```

---

### Task 1: Gia cố backend (lỗi nhỏ từ kế hoạch 2–3)

**Files:**
- Modify: `server/core/oauth-tokens.ts`, `server/core/oauth-tokens.test.ts`, `server/core/tasks.ts`, `server/core/tasks.test.ts`, `server/core/control.ts`, `server/core/control.test.ts`, `server/http/consent.ts`, `server/http/oauth.ts`, `server/http/oauth.test.ts`

**Interfaces:**
- Produces: `ConsentView.clientHost: string | null`; `isUniqueViolation(e: unknown): boolean` trong `server/core/errors.ts`.
- Hành vi: refresh với `resource` sai → `invalid_target` **không** xoay vòng; `reportRun` với `leaseId` không thuộc lệnh nào và không phải lease hiện tại của task → `trigger: 'manual'`; `leaseId` đã dùng cho task khác → `invalid`; `setPaused` cùng trạng thái → trả task nguyên trạng; `createTask` đụng unique → `conflict`.

- [ ] **Step 1: Viết test**

Thêm vào cuối `server/core/oauth-tokens.test.ts`:

```ts
describe('refresh với resource sai', () => {
  it('báo invalid_target mà không làm mất kết nối', async () => {
    const u = await makeUser(db)
    const t = await issue(u.id)
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: 'https://khac.test/mcp' }, now)).rejects.toMatchObject({ error: 'invalid_target' })
    await expect(refreshTokens(db, { refreshToken: t.refresh_token, clientId: 'dcr_1', resource: RES }, now)).resolves.toMatchObject({ token_type: 'Bearer' })
  })
})
```

Thêm vào cuối `server/core/tasks.test.ts`:

```ts
describe('reportRun — leaseId lạ hoặc của task khác', () => {
  it('leaseId không khớp lệnh hay lease hiện tại → ghi như chạy tay', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    const { runId } = await reportRun(db, u, { slug: 'upsell', status: 'ok', note: '', log: [], leaseId: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f' }, now)
    const [run] = await db.select().from(runs).where(eq(runs.id, runId))
    expect(run.trigger).toBe('manual')
  })

  it('leaseId đã dùng cho task khác → invalid, không bị coi là trùng', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    await createTask(db, u, def({ slug: 'khac' }), now)
    const lease = '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f'
    await reportRun(db, u, { slug: 'upsell', status: 'ok', note: '', log: [], leaseId: lease }, now)
    await expect(reportRun(db, u, { slug: 'khac', status: 'ok', note: '', log: [], leaseId: lease }, now)).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('createTask — đụng unique khi chạy song song', () => {
  it('trả conflict thay vì lỗi máy chủ', async () => {
    const u = await makeUser(db)
    await createTask(db, u, def(), now)
    // Giả lập yêu cầu thứ hai đã qua bước kiểm trùng trước khi yêu cầu đầu ghi xong.
    const blind = new Proxy(db, {
      get(target, prop, recv) {
        if (prop === 'query') return { ...target.query, tasks: { findFirst: async () => undefined } }
        return Reflect.get(target, prop, recv)
      },
    }) as Db
    await expect(createTask(blind, u, def(), now)).rejects.toMatchObject({ code: 'conflict' })
  })
})
```

Thêm vào cuối `server/core/control.test.ts`:

```ts
describe('setPaused không đổi trạng thái', () => {
  it('bỏ tạm dừng một task vốn đang chạy → giữ nguyên lần chạy (không mất lần chạy bù)', async () => {
    const u = await makeUser(db)
    const overdue = new Date('2026-10-05T02:00:00Z')
    await makeTask(db, u.id, { slug: 'a', nextRunAt: overdue })
    const t = await setPaused(db, u, 'a', false, now)
    expect(t.nextRunAt?.toISOString()).toBe(overdue.toISOString())
    expect(await db.select().from(activity)).toEqual([])
  })
})
```

Trong `server/http/oauth.test.ts`, test CIMD: sau dòng `expect(await page.text()).toContain('máy của bạn')` đổi thành:

```ts
    const html = await page.text()
    expect(html).toContain('máy của bạn')
    expect(html).toContain('Định danh ứng dụng: claude.ai')
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server`
Expected: FAIL ở 5 test mới (refresh invalid_target hiện làm mất grant; leaseId lạ ghi `schedule`; leaseId của task khác trả duplicate; createTask trả lỗi thô; setPaused tính lại lịch; consent thiếu dòng định danh).

- [ ] **Step 3: `server/core/errors.ts`** — thêm:

```ts
/** Lỗi unique của Postgres (23505), kể cả khi driver bọc trong `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (typeof x === 'object' && x !== null && 'code' in x ? (x as { code: unknown }).code : undefined)
  return code(e) === '23505' || code((e as { cause?: unknown } | null)?.cause) === '23505'
}
```

- [ ] **Step 4: `server/core/oauth-tokens.ts`** — trong `refreshTokens`, thêm trước `const pair = newPair(now)`:

```ts
  if (p.resource) {
    const hit = await db.query.oauthTokens.findFirst({ where: eq(oauthTokens.refreshHash, hashToken(p.refreshToken)), columns: { resource: true } })
    if (hit && hit.resource !== p.resource.replace(/\/+$/, '')) throw new OAuthError('invalid_target', 'resource không khớp')
  }
```

và xóa dòng kiểm `invalid_target` cũ nằm sau câu `UPDATE`.

- [ ] **Step 5: `server/core/tasks.ts`**

- Import thêm `users` từ `../db/schema.js` và `conflict, invalid, notFound, isUniqueViolation` từ `./errors.js` (gộp với import sẵn có).
- Trong `createTask`, bọc câu `insert(tasks)…returning()` bằng:

```ts
  let row: TaskRow
  try {
    ;[row] = await db
      .insert(tasks)
      .values({ /* giữ nguyên nội dung values hiện tại */ })
      .returning()
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`Bạn đã có task "${input.slug}" — dùng sua_task để cập nhật`)
    throw e
  }
```

  (giữ nguyên object `values` hiện có; chỉ đổi `const [row] =` thành gán trong `try`.)
- Trong `reportRun`, thay khối `if (input.leaseId) { … }` bằng:

```ts
  if (input.leaseId) {
    const prior = await db.query.runs.findFirst({ where: eq(runs.leaseId, input.leaseId) })
    if (prior && prior.taskId === row.id) return { runId: prior.id, task: row, duplicate: true }
    if (prior) throw invalid('leaseId này đã dùng cho một task khác — kiểm tra lại slug')
    cmd = await db.query.commands.findFirst({ where: and(eq(commands.leaseId, input.leaseId), eq(commands.ownerId, owner.id)) })
    if (cmd && cmd.taskId !== row.id) throw invalid('leaseId này thuộc một task khác — kiểm tra lại slug')
    trigger = cmd ? 'command' : row.leaseId === input.leaseId ? 'schedule' : 'manual'
  }
```

- Đầu callback `db.transaction(async (tx) => {` trong `reportRun`, thêm dòng khóa theo đúng thứ tự của `dispatch` (user trước, rồi task) để tránh deadlock:

```ts
    await tx.select({ id: users.id }).from(users).where(eq(users.id, owner.id)).for('update')
```

- [ ] **Step 6: `server/core/control.ts`**

- `setPaused`: ngay sau `const task = await findOwnTask(…)` thêm `if (task.paused === paused) return task`.
- `createCommand`: bọc phần đếm + insert + activity trong transaction và khóa hàng task trước khi đếm:

```ts
  return db.transaction(async (tx) => {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, task.id)).for('update')
    const [{ n }] = await tx.select({ n: count() }).from(commands).where(and(eq(commands.taskId, task.id), eq(commands.status, 'pending')))
    if (n >= LIMITS.pendingCommandsPerTask) throw conflict(`Đã có ${LIMITS.pendingCommandsPerTask} lệnh đang chờ Claude cho task này`)
    const [row] = await tx
      .insert(commands)
      .values({ taskId: task.id, ownerId: owner.id, actionId: input.actionId, label: action.label, instructions: action.instructions, note: input.note || null, createdAt: now })
      .returning()
    await tx.insert(activity).values({ ownerId: owner.id, taskId: task.id, at: now, level: 'wait', text: `Gửi lệnh "${action.label}" — chờ Claude nhận` })
    return toCommandDTO(row)
  })
```

  (thay cho phần đếm/insert/return hiện có.)

- [ ] **Step 7: Consent hiện host định danh của client CIMD**

`server/http/consent.ts`: trong `ConsentView` thêm `clientHost: string | null`; trong `renderConsent`, ngay sau dòng `<div class="who">…</div>` thêm:

```ts
${v.clientHost ? `<div class="who">Định danh ứng dụng: ${escapeHtml(v.clientHost)}</div>` : ''}
```

`server/http/oauth.ts`: trong lời gọi `renderConsent({...})` thêm `clientHost: check.client.kind === 'cimd' ? new URL(check.client.clientId).host : null,`.

- [ ] **Step 8: Chạy test, typecheck, commit**

Run: `npx vitest run && npx tsc -b`
Expected: PASS, sạch.

```bash
git add server
git commit -m "fix: refresh resource sai không mất kết nối, lease lạ là chạy tay, tạm dừng no-op, trùng slug song song → conflict, consent hiện định danh CIMD"
```

---

### Task 2: Dọn dữ liệu định kỳ (cron Vercel)

**Files:**
- Create: `server/core/cleanup.ts`, `server/core/cleanup.test.ts`, `server/http/cron.test.ts`
- Modify: `server/config.ts`, `server/http/app.ts`, `vercel.json`, `.env.example`

**Interfaces:**
- Produces: `cleanup(db, now): Promise<CleanupResult>` với `CleanupResult = { logsCleared: number; sessions: number; codes: number; tokens: number; clients: number }`; `Config.cronSecret?: string | null`; route `GET /api/cron/cleanup`.

- [ ] **Step 1: Viết test `server/core/cleanup.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { oauthClients, oauthCodes, oauthTokens, runs, sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeTask, makeUser, resetDb, testDb } from '../test/db.js'
import { cleanup } from './cleanup.js'

const now = new Date('2026-10-05T03:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('cleanup', () => {
  it('xóa log run cũ hơn 30 ngày nhưng giữ tóm tắt; giữ log mới', async () => {
    const u = await makeUser(db)
    const t = await makeTask(db, u.id)
    await db.insert(runs).values([
      { taskId: t.id, trigger: 'manual', status: 'ok', startedAt: daysAgo(31), finishedAt: daysAgo(31), note: 'cũ', log: ['a'] },
      { taskId: t.id, trigger: 'manual', status: 'ok', startedAt: daysAgo(2), finishedAt: daysAgo(2), note: 'mới', log: ['b'] },
    ])
    const r = await cleanup(db, now)
    expect(r.logsCleared).toBe(1)
    const rows = await db.select().from(runs)
    expect(rows.find((x) => x.note === 'cũ')?.log).toBeNull()
    expect(rows.find((x) => x.note === 'mới')?.log).toEqual(['b'])
  })

  it('xóa session hết hạn, code cũ, token hết hạn hoặc thu hồi lâu, client DCR bỏ hoang', async () => {
    const u = await makeUser(db)
    await db.insert(sessions).values([
      { idHash: 'het', userId: u.id, expiresAt: daysAgo(1) },
      { idHash: 'con', userId: u.id, expiresAt: new Date(now.getTime() + 86_400_000) },
    ])
    await db.insert(oauthCodes).values({ codeHash: 'c', clientId: 'x', userId: u.id, redirectUri: 'r', codeChallenge: 'h', expiresAt: daysAgo(2) })
    const base = { userId: u.id, clientName: 'Claude', resource: 'https://ws.test/mcp', accessExpiresAt: now }
    await db.insert(oauthTokens).values([
      { ...base, clientId: 'dcr_dung', accessHash: 'a1', refreshHash: 'r1', refreshExpiresAt: new Date(now.getTime() + 86_400_000) },
      { ...base, clientId: 'dcr_het', accessHash: 'a2', refreshHash: 'r2', refreshExpiresAt: daysAgo(1) },
      { ...base, clientId: 'dcr_thu', accessHash: 'a3', refreshHash: 'r3', refreshExpiresAt: new Date(now.getTime() + 86_400_000), revokedAt: daysAgo(8) },
    ])
    await db.insert(oauthClients).values([
      { clientId: 'dcr_dung', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: daysAgo(5) },
      { clientId: 'dcr_bo', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: daysAgo(5) },
      { clientId: 'dcr_moi', kind: 'dcr', name: 'C', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], createdAt: now },
    ])
    expect(await cleanup(db, now)).toEqual({ logsCleared: 0, sessions: 1, codes: 1, tokens: 2, clients: 1 })
    expect((await db.select().from(oauthClients)).map((c) => c.clientId).sort()).toEqual(['dcr_dung', 'dcr_moi'])
  })
})
```

Tạo `server/http/cron.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { makeUser, resetDb, testDb } from '../test/db.js'
import { createApp } from './app.js'

const now = new Date('2026-10-05T03:00:00Z')
const base: Config = {
  publicUrl: 'https://ws.test', allowedDomain: 'bravebits.vn', adminEmails: [],
  googleClientId: 'id', googleClientSecret: 'secret', secureCookies: true, devLogin: false,
}
const google = { authorizeUrl: () => new URL('https://g.test'), exchange: async () => { throw new Error('x') } }
let db: Db
beforeAll(async () => { db = await testDb() })
beforeEach(async () => { await resetDb(db) })

describe('/api/cron/cleanup', () => {
  it('thiếu hoặc sai bí mật → 403, không xóa gì', async () => {
    const u = await makeUser(db)
    await db.insert(sessions).values({ idHash: 'het', userId: u.id, expiresAt: new Date(now.getTime() - 1000) })
    const app = createApp({ db, config: { ...base, cronSecret: 'dung' }, google, now: () => now, fetchClientMetadata: async () => null })
    expect((await app.request('/api/cron/cleanup')).status).toBe(403)
    expect((await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer sai' } })).status).toBe(403)
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('chưa cấu hình CRON_SECRET → 403 kể cả khi gửi Bearer rỗng', async () => {
    const app = createApp({ db, config: base, google, now: () => now, fetchClientMetadata: async () => null })
    expect((await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer ' } })).status).toBe(403)
  })

  it('đúng bí mật → chạy dọn dẹp, không cần đăng nhập', async () => {
    const app = createApp({ db, config: { ...base, cronSecret: 'dung' }, google, now: () => now, fetchClientMetadata: async () => null })
    const res = await app.request('/api/cron/cleanup', { headers: { authorization: 'Bearer dung' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sessions: 0 })
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/cleanup.test.ts server/http/cron.test.ts`
Expected: FAIL — module/route chưa có.

- [ ] **Step 3: Viết `server/core/cleanup.ts`**

```ts
import { and, eq, isNotNull, lt, or, sql } from 'drizzle-orm'
import { oauthClients, oauthCodes, oauthTokens, runs, sessions } from '../db/schema.js'
import type { Db } from '../db/types.js'

export const LOG_RETENTION_DAYS = 30

export interface CleanupResult {
  logsCleared: number
  sessions: number
  codes: number
  tokens: number
  clients: number
}

export async function cleanup(db: Db, now: Date): Promise<CleanupResult> {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000)
  const logs = await db
    .update(runs)
    .set({ log: null })
    .where(and(lt(runs.startedAt, ago(LOG_RETENTION_DAYS)), isNotNull(runs.log)))
    .returning({ id: runs.id })
  const s = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.idHash })
  const c = await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, ago(1))).returning({ id: oauthCodes.codeHash })
  const t = await db
    .delete(oauthTokens)
    .where(or(lt(oauthTokens.refreshExpiresAt, now), lt(oauthTokens.revokedAt, ago(7))))
    .returning({ id: oauthTokens.id })
  const cl = await db
    .delete(oauthClients)
    .where(
      and(
        eq(oauthClients.kind, 'dcr'),
        lt(oauthClients.createdAt, ago(1)),
        sql`not exists (select 1 from oauth_tokens t where t.client_id = ${oauthClients.clientId})`,
      ),
    )
    .returning({ id: oauthClients.clientId })
  return { logsCleared: logs.length, sessions: s.length, codes: c.length, tokens: t.length, clients: cl.length }
}
```

- [ ] **Step 4: Cấu hình và route**

`server/config.ts`: trong `interface Config` thêm `cronSecret?: string | null`; trong object trả về của `loadConfig` thêm `cronSecret: env.CRON_SECRET || null,`.

`server/http/app.ts`: import `import { cleanup } from '../core/cleanup.js'`; trong `createApp`, **trước** `app.route('/', oauthRoutes(deps))`:

```ts
  // Vercel Cron gửi "Authorization: Bearer <CRON_SECRET>". Không cần phiên đăng nhập.
  app.get('/api/cron/cleanup', async (c) => {
    const secret = deps.config.cronSecret
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'forbidden', message: 'Sai hoặc thiếu CRON_SECRET' }, 403)
    return c.json(await cleanup(deps.db, deps.now()))
  })
```

`vercel.json`: thêm khóa cấp cao

```json
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 20 * * *" }],
```

(20:00 UTC = 03:00 giờ VN.)

`.env.example`: thêm

```bash
# Bí mật cho Vercel Cron dọn dữ liệu hằng ngày (chuỗi ngẫu nhiên dài). Vercel tự gửi kèm header.
CRON_SECRET=
```

- [ ] **Step 5: Chạy test, typecheck, commit**

Run: `npx vitest run && npx tsc -b`
Expected: PASS, sạch.

```bash
git add server vercel.json .env.example
git commit -m "feat: cron dọn dữ liệu hằng ngày — log 30 ngày, session, code, token, client DCR bỏ hoang"
```

---

### Task 3: Chọn tuần cho "Nhìn lại tuần"

**Files:**
- Modify: `server/core/time.ts`, `server/core/time.test.ts`, `server/core/workspace.ts`, `server/core/workspace.test.ts`, `server/http/api.ts`, `src/lib/data.ts`, `src/components/Reflect.tsx`, `src/App.tsx`, `shared/dto.ts`

**Interfaces:**
- Produces: `weekFromKey(key: string): WeekDTO | null`; `ReportWeekDTO { weekKey: string; week: number; range: string }`; `listReportWeeks(db, ownerId): Promise<ReportWeekDTO[]>` (mới nhất trước, tối đa 26); `getReport(db, ownerId, weekKey): Promise<ReflectDTO>`; route `GET /api/workspace/:id/reports`, `GET /api/workspace/:id/reports/:week` (`me` = chính mình); `loadReportWeeks(id)`, `loadReport(id, week)`; `Reflect` nhận `ownerId: string`.

- [ ] **Step 1: Viết test**

`server/core/time.test.ts` thêm:

```ts
import { weekFromKey } from './time.js'

describe('weekFromKey', () => {
  it('2026-W40 → 28/9 – 4/10', () => {
    expect(weekFromKey('2026-W40')).toMatchObject({ key: '2026-W40', number: 40, range: '28/9 – 4/10, 2026' })
  })
  it('khóa sai → null', () => {
    expect(weekFromKey('2026-40')).toBeNull()
    expect(weekFromKey('2026-W60')).toBeNull()
  })
})
```

`server/core/workspace.test.ts` thêm:

```ts
import { getReport, listReportWeeks } from './workspace.js'

describe('báo cáo theo tuần', () => {
  it('liệt kê tuần mới nhất trước; đọc từng tuần; tuần không có/khóa sai → not_found', async () => {
    const u = await makeUser(db)
    await db.insert(weeklyReports).values([
      { ownerId: u.id, week: '2026-W39', summary: 'cũ' },
      { ownerId: u.id, week: '2026-W40', summary: 'mới' },
    ])
    expect(await listReportWeeks(db, u.id)).toEqual([
      { weekKey: '2026-W40', week: 40, range: '28/9 – 4/10, 2026' },
      { weekKey: '2026-W39', week: 39, range: '21 – 27 tháng 9, 2026' },
    ])
    expect((await getReport(db, u.id, '2026-W39')).summary).toBe('cũ')
    await expect(getReport(db, u.id, '2026-W41')).rejects.toMatchObject({ code: 'not_found' })
    await expect(getReport(db, u.id, 'rac')).rejects.toMatchObject({ code: 'not_found' })
    await expect(listReportWeeks(db, 'rac')).rejects.toMatchObject({ code: 'not_found' })
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/core/time.test.ts server/core/workspace.test.ts`
Expected: FAIL — hàm chưa có.

- [ ] **Step 3: `server/core/time.ts`** — thêm:

```ts
/** Tuần ISO từ khóa "2026-W40" (tính theo giờ VN); khóa sai → null. */
export function weekFromKey(key: string): WeekDTO | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key)
  if (!m) return null
  const [y, w] = [Number(m[1]), Number(m[2])]
  if (w < 1 || w > 53) return null
  const jan4 = Date.UTC(y, 0, 4)
  const week1Mon = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY
  const thursday = new Date(week1Mon + ((w - 1) * 7 + 3) * DAY + 5 * 3_600_000)
  const out = vnWeek(thursday)
  return out.key === key ? out : null
}
```

- [ ] **Step 4: `shared/dto.ts`** — thêm `export interface ReportWeekDTO { weekKey: string; week: number; range: string }`.

- [ ] **Step 5: `server/core/workspace.ts`**

- Import `weekFromKey` cùng `vnWeek`, `and` từ drizzle, `type ReportWeekDTO`.
- Thay thân `toReflectDTO` để dùng `weekFromKey`:

```ts
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
```

- Thêm:

```ts
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
```

- [ ] **Step 6: Route trong `server/http/api.ts`** (import `getReport, listReportWeeks`):

```ts
  const ownerOf = (c: Context<AppEnv>) => (c.req.param('id') === 'me' ? c.get('user').id : c.req.param('id')!)
  r.get('/workspace/:id/reports', async (c) => c.json(await listReportWeeks(deps.db, ownerOf(c))))
  r.get('/workspace/:id/reports/:week', async (c) => c.json(await getReport(deps.db, ownerOf(c), c.req.param('week'))))
```

- [ ] **Step 7: Web**

`src/lib/types.ts`: thêm `ReportWeekDTO as ReportWeek` vào khối re-export.
`src/lib/data.ts`: thêm

```ts
export const loadReportWeeks = (id: string) => api<ReportWeek[]>(`/api/workspace/${encodeURIComponent(id)}/reports`)
export const loadReport = (id: string, week: string) => api<Reflect>(`/api/workspace/${encodeURIComponent(id)}/reports/${encodeURIComponent(week)}`)
```

(gộp `ReportWeek`, `Reflect` vào import kiểu.)

`src/components/Reflect.tsx`: đổi chữ ký thành `Reflect({ reflect: latest, tasks, ownerId }: { reflect: ReflectData | null; tasks: Task[]; ownerId: string })`, và ở đầu thân hàm:

```tsx
  const [weeks, setWeeks] = useState<ReportWeek[]>([])
  const [picked, setPicked] = useState<ReflectData | null>(null)
  useEffect(() => {
    setPicked(null)
    loadReportWeeks(ownerId).then(setWeeks).catch(() => setWeeks([]))
  }, [ownerId])
  const reflect = picked ?? latest
  async function pick(key: string) {
    try {
      setPicked(await loadReport(ownerId, key))
    } catch {
      setPicked(null)
    }
  }
  const chips = weeks.length > 1 && (
    <div className="weeks" role="tablist" aria-label="Chọn tuần">
      {weeks.map((w) => (
        <button key={w.weekKey} role="tab" className="weeks__chip" aria-selected={reflect?.weekKey === w.weekKey} onClick={() => pick(w.weekKey)} title={w.range}>
          Tuần {w.week}
        </button>
      ))}
    </div>
  )
```

  (import `useEffect, useState`, `ReportWeek`, `loadReport`, `loadReportWeeks`.) Hiển thị `{chips}` ngay dưới `</header>` ở cả nhánh có báo cáo; nhánh `!reflect` giữ nguyên.

`src/App.tsx`: `<Reflect reflect={ws.reflect} tasks={ws.tasks} ownerId={ws.owner.id} />`.

CSS thêm vào `src/styles/control.css`:

```css
.weeks { display: flex; flex-wrap: wrap; gap: 6px; margin: -8px 0 22px; }
.weeks__chip { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--fg-3); font: 500 12.5px var(--mono); }
.weeks__chip[aria-selected='true'] { border-color: var(--needs); color: var(--needs); background: var(--needs-dim); }
```

- [ ] **Step 8: Chạy test, typecheck, build, commit**

Run: `npx vitest run && npx tsc -b && npx vite build`
Expected: PASS, sạch.

```bash
git add server shared src
git commit -m "feat: chọn tuần trong Nhìn lại tuần"
```

---

### Task 4: Admin vô hiệu hóa người dùng trên giao diện

**Files:**
- Modify: `src/lib/data.ts`, `src/components/Team.tsx`, `src/App.tsx`, `src/styles/polish.css` (tạo mới), `src/main.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/users/:id/deactivate` (kế hoạch 1, đã có test quyền).
- Produces: `deactivateUserApi(id)`; `Team` nhận thêm `isAdmin: boolean`, `onDeactivate: (id: string) => Promise<void>`.

- [ ] **Step 1: `src/lib/data.ts`**

```ts
export const deactivateUserApi = (id: string) => api<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/deactivate`, { method: 'POST' })
```

- [ ] **Step 2: `src/components/Team.tsx`**

Đổi chữ ký:

```tsx
export default function Team({
  people,
  meId,
  now,
  onVisit,
  isAdmin,
  onDeactivate,
}: {
  people: Person[]
  meId: string
  now: Date
  onVisit: (id: string) => void
  isAdmin: boolean
  onDeactivate: (id: string) => Promise<void>
}) {
  const [armed, setArmed] = useState<string | null>(null)
```

(import `useState`.) Đổi thẻ ngoài của mỗi người từ `<button className="mate …" onClick={…}>` thành `<div className=… role="button" tabIndex={0} onClick={() => onVisit(p.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onVisit(p.id))}>` (và thẻ đóng `</div>`), rồi thêm ở cuối nội dung thẻ, sau khối `.mate__focus`:

```tsx
            {isAdmin && p.active && p.id !== meId && (
              <button
                className={`mate__admin${armed === p.id ? ' is-armed' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (armed === p.id) onDeactivate(p.id).finally(() => setArmed(null))
                  else setArmed(p.id)
                }}
                onBlur={() => setArmed((a) => (a === p.id ? null : a))}
              >
                {armed === p.id ? 'Bấm lần nữa: khóa tài khoản và ngắt mọi Claude' : 'Vô hiệu hóa'}
              </button>
            )}
```

- [ ] **Step 3: `src/App.tsx`**

Import `deactivateUserApi`; thêm hàm:

```ts
  async function deactivate(id: string) {
    try {
      await deactivateUserApi(id)
      setToast('Đã vô hiệu hóa — phiên đăng nhập và mọi kết nối Claude của người này đã bị ngắt')
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    }
  }
```

Render: `<Team people={people} meId={me.id} now={now} onVisit={visit} isAdmin={me.role === 'admin'} onDeactivate={deactivate} />`.

- [ ] **Step 4: Tạo `src/styles/polish.css`, import trong `src/main.tsx` (sau `control.css`)**

```css
/* ============================================================
   Hoàn thiện: admin, hướng dẫn, ⌘K, skeleton.
   ============================================================ */

.mate { cursor: pointer; }
.mate:focus-visible { outline: 2px solid var(--needs); outline-offset: 3px; }
.mate__admin {
  align-self: flex-start;
  margin-top: -4px;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid var(--line);
  color: var(--fg-3);
  font-size: 12px;
}
.mate__admin:hover { color: var(--bad); border-color: rgba(255, 92, 77, .45); }
.mate__admin.is-armed { color: var(--bad); border-color: var(--bad); background: var(--bad-dim); }
```

- [ ] **Step 5: Typecheck, build, commit**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

```bash
git add src
git commit -m "feat(web): admin vô hiệu hóa người dùng ngay trên Đội ngũ"
```

---

### Task 5: Sửa lỗi nhỏ phía web và mô tả cron

**Files:**
- Modify: `shared/cronText.ts`, `shared/cronText.test.ts`, `src/App.tsx`, `src/components/Schedule.tsx`, `src/components/Blocks.tsx`, `src/components/WorkHours.tsx`

**Interfaces:** không đổi giao diện công khai.

- [ ] **Step 1: Test mô tả cron giờ rời rạc** — thêm vào `shared/cronText.test.ts` trong `it.each` đầu:

```ts
    ['*/15 9,14 * * *', 'mỗi 15 phút trong các giờ 09, 14 · mỗi ngày'],
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run shared/cronText.test.ts`
Expected: FAIL — đang ra "mỗi 15 phút, 09:00–14:59 · mỗi ngày".

- [ ] **Step 3: `shared/cronText.ts`** — thay dòng `if (m.startsWith('*/') && step > 0) return …` bằng:

```ts
    if (m.startsWith('*/') && step > 0) {
      const contiguous = hours.every((hh, i) => i === 0 || hh === hours[i - 1] + 1)
      return contiguous
        ? `mỗi ${step} phút, ${pad(hours[0])}:00–${pad(hours.at(-1)!)}:59 · ${d}`
        : `mỗi ${step} phút trong các giờ ${hours.map(pad).join(', ')} · ${d}`
    }
```

- [ ] **Step 4: Chạy test** — `npx vitest run shared` → PASS.

- [ ] **Step 5: `src/App.tsx` — bỏ phản hồi cũ khi chuyển người, xử lý bàn không mở được**

- Import `useRef`.
- Thêm `const seq = useRef(0)` trong `Shell`.
- Thay `refresh` bằng:

```ts
  const refresh = useCallback(() => {
    const mine = ++seq.current
    Promise.all([loadWorkspace(viewing), loadPeople(), viewing === me.id ? loadMyConnections() : Promise.resolve(null)])
      .then(([w, p, cl]) => {
        if (mine !== seq.current) return // đã chuyển sang người khác — bỏ phản hồi cũ
        setWs(w)
        setPeople(p)
        setClaude(cl)
        setErr(null)
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return
        if (e instanceof ApiError && e.status === 401) window.location.href = '/login'
        else if (e instanceof ApiError && e.status === 404 && viewing !== me.id) {
          setToast('Không mở được bàn này — quay về bàn của bạn')
          setViewing(me.id)
        } else setErr((e as Error).message)
      })
  }, [viewing, me.id])
```

- [ ] **Step 6: `src/components/Schedule.tsx` — công tắc tạm dừng**

- Thêm state `const [busy, setBusy] = useState<Record<string, boolean>>({})`.
- Thêm hiệu ứng dọn giá trị lạc quan khi dữ liệu máy chủ đã khớp:

```tsx
  useEffect(() => {
    setPausing((s) => Object.fromEntries(Object.entries(s).filter(([id, v]) => tasks.find((t) => t.id === id)?.paused !== v)))
  }, [tasks])
```

- Trong `togglePause`: `if (busy[t.id]) return` ở đầu; `setBusy((s) => ({ ...s, [t.id]: true }))` trước `try`; thêm `finally { setBusy((s) => ({ ...s, [t.id]: false })) }`.
- Lưới tuần: đổi điều kiện `!task.paused` thành `!(pausing[task.id] ?? task.paused)`.

- [ ] **Step 7: `src/components/Blocks.tsx` — biểu đồ chịu dữ liệu xấu**

- Trong `Chart`, ngay sau các `useState/useEffect`, thêm `const series = data.series.slice(0, SERIES.length)` và đổi mọi `data.series` phía dưới thành `series` (legend, tính `all`, `k`, vẽ, tooltip, bảng).
- Sau khai báo `n`, thêm `if (n === 0) return <p className="sec__note">Biểu đồ chưa có dữ liệu.</p>` (đặt **sau** các hook để không vi phạm thứ tự hook).
- Đổi `key={s.name}` thành `key={si}` ở legend và các nhóm series.

- [ ] **Step 8: `src/components/WorkHours.tsx`** — đổi điều kiện `dirty` thành so mảng đã sắp:

```tsx
  const sorted = [...days].sort((a, b) => a - b)
  const dirty = sorted.join() !== [...me.workDays].sort((a, b) => a - b).join() || start !== me.workStart || end !== me.workEnd
```

và truyền `workDays: sorted` khi lưu.

- [ ] **Step 9: Typecheck, build, test, commit**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

```bash
git add shared src
git commit -m "fix(web): bỏ phản hồi cũ khi chuyển người, công tắc tạm dừng không lệch, biểu đồ chịu dữ liệu xấu, mô tả cron giờ rời rạc"
```

---

### Task 6: Bộ skill Claude + đóng gói

**Files:**
- Create: `skills/dieu-phoi/SKILL.md`, `skills/tao-task/SKILL.md`, `skills/bao-cao-tuan/SKILL.md`, `scripts/pack-skills.mjs`, `server/skills.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `public/downloads/dieu-phoi.zip`, `tao-task.zip`, `bao-cao-tuan.zip`, `work-system-skills.zip` (sinh lúc `dev`/`build`, không commit).

- [ ] **Step 1: Viết test `server/skills.test.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../skills/', import.meta.url)
const names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

function frontmatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md)
  if (!m) return {}
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
}

describe('bộ skill Work System', () => {
  it('có đủ 3 skill', () => {
    expect(names.sort()).toEqual(['bao-cao-tuan', 'dieu-phoi', 'tao-task'])
  })

  it.each(names)('%s: frontmatter hợp lệ cho claude.ai', (n) => {
    const fm = frontmatter(readFileSync(new URL(`${n}/SKILL.md`, root), 'utf8'))
    expect(fm.name).toBe(n)
    expect(fm.name).toMatch(/^[a-z0-9-]{1,64}$/)
    expect(fm.description.length).toBeGreaterThan(20)
    expect(fm.description.length).toBeLessThanOrEqual(200)
  })

  it('dieu-phoi bắt buộc gọi dieu_phoi và luôn báo kết quả kèm leaseId', () => {
    const md = readFileSync(new URL('dieu-phoi/SKILL.md', root), 'utf8')
    for (const s of ['dieu_phoi', 'bao_ket_qua', 'leaseId']) expect(md).toContain(s)
  })

  it('tao-task dùng tao_task và cấm ghi bí mật', () => {
    const md = readFileSync(new URL('tao-task/SKILL.md', root), 'utf8')
    expect(md).toContain('tao_task')
    expect(md).toMatch(/mật khẩu|API key/)
  })

  it('bao-cao-tuan dùng xem_task và nop_bao_cao_tuan', () => {
    const md = readFileSync(new URL('bao-cao-tuan/SKILL.md', root), 'utf8')
    expect(md).toContain('xem_task')
    expect(md).toContain('nop_bao_cao_tuan')
  })
})
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run server/skills.test.ts`
Expected: FAIL — thư mục `skills/` chưa có.

- [ ] **Step 3: Viết `skills/dieu-phoi/SKILL.md`**

````markdown
---
name: dieu-phoi
description: Vòng Điều phối Work System chạy mỗi 15 phút — gọi dieu_phoi, làm từng việc được giao, luôn báo kết quả kèm leaseId. Dùng cho tác vụ hẹn giờ "dieu-phoi".
---

# Điều phối Work System

Bạn đang chạy **tự động** theo lịch, không có ai ngồi trước màn hình. Không hỏi lại người dùng. Làm xong thì dừng.

## Quy trình

1. Gọi tool `dieu_phoi` của connector **Work System**.
2. Nếu kết quả nói **không có việc** → kết thúc ngay, không làm gì thêm.
3. Với **từng** việc trong `viec` (lệnh trước, lịch sau):
   1. Ghi lại thời điểm bắt đầu.
   2. Đọc `task.instructions` — đó là việc cần làm. Nếu là **lệnh** (`loai: "lenh"`), làm theo `lenh.instructions` và ưu tiên `lenh.note` (ghi chú người dùng gửi kèm).
   3. Nếu `task.skill` có giá trị, dùng skill đó cho phần chuyên môn.
   4. Thực hiện bằng các connector/công cụ bạn có (Google Sheets, Drive, Crisp…). Ghi từng bước quan trọng thành một dòng log ngắn.
   5. Gọi `bao_ket_qua` với:
      - `slug`: `task.slug`
      - `leaseId`: **đúng** `leaseId` của việc này
      - `status`: `ok` (xong), `partial` (xong một phần, cần người xem), `failed` (không làm được)
      - `note`: một câu tóm tắt kết quả, viết cho người đọc nhanh
      - `log`: các dòng bước đã làm (tối đa 200 dòng, mỗi dòng ≤ 500 ký tự)
      - `durationMs`: thời gian đã chạy
      - Khi có số liệu mới: `metrics`, `progress`, `trendThem` (số mới thêm vào xu hướng), `milestones`, `report` (headline, body, blockers, next), `blocks`
4. Một việc lỗi **không** được làm dừng các việc khác: báo `failed` kèm lý do trong `note` rồi làm việc tiếp theo.
5. Nếu `bao_ket_qua` trả lỗi về dữ liệu, sửa đúng trường được nêu và gửi lại **cùng** `leaseId` (gửi lại cùng leaseId là an toàn, không bị ghi hai lần).

## Quy tắc

- **Luôn** gọi `bao_ket_qua` cho mọi việc đã nhận — kể cả khi lỗi, kể cả khi không có gì thay đổi.
- Không bao giờ ghi mật khẩu, API key, token hay dữ liệu cá nhân của khách hàng vào Work System — đồng nghiệp xem được mọi thứ.
- Nếu connector Work System không gọi được (mất kết nối, 401), dừng lại: lần Điều phối sau sẽ thử lại.
- Biểu đồ trong `blocks` tối đa 3 series.
````

- [ ] **Step 4: Viết `skills/tao-task/SKILL.md`**

````markdown
---
name: tao-task
description: Khai báo một việc định kỳ mới lên Work System — hỏi ngắn vài câu (việc gì, lịch, chỉ số, nút), rồi gọi tao_task. Dùng khi người dùng nói "tạo task", "thêm việc tự chạy".
---

# Tạo task Work System

Mục tiêu: biến một việc định kỳ của người dùng thành task chạy tự động qua vòng Điều phối.

## Hỏi người dùng (gọn, từng nhóm, đề xuất sẵn câu trả lời)

1. **Việc gì?** Tên ngắn và một câu mô tả. Kết quả mong muốn sau mỗi lần chạy.
2. **Khi nào chạy?** Đổi sang cron 5 trường theo **giờ Việt Nam**:
   - "9 giờ sáng các ngày trong tuần" → `0 9 * * 1-5`
   - "9:30 và 15:30 mỗi ngày" → `30 9,15 * * *`
   - "16 giờ thứ 6" → `0 16 * * 5`
3. **Claude cần làm gì khi đến hạn?** Viết thành `instructions` rõ ràng, từng bước, nêu nguồn dữ liệu (sheet nào, thư mục nào) và cách xác định thành công/thất bại.
4. **Đo bằng gì?** 1–8 `metrics` (`label`, `value`, `note`), `progress` (`done`/`total`/`unit`), `trendLabel` cho chuỗi số theo thời gian.
5. **Nút trên web?** Tối đa 6 `actions` ngoài nút "Chạy ngay" có sẵn, ví dụ `{ id: "duyet", label: "Duyệt mẫu", kind: "review", instructions: "…" }`. `kind`: `review` (chờ duyệt), `fix` (xử lý lỗi), `custom`.
6. **Khối tùy chọn** nếu cần: `table`, `checklist`, `chart` (tối đa 3 series), `note` (markdown đơn giản).

## Tạo

- `slug`: chữ thường không dấu, số, gạch nối (ví dụ `bao-cao-ticket`).
- Tóm tắt lại cho người dùng rồi gọi `tao_task`.
- Nếu báo trùng slug → đề nghị dùng `sua_task` hoặc slug khác.
- Sau khi tạo: nhắc người dùng xem task trên Work System; nếu họ chưa có tác vụ hẹn giờ "dieu-phoi" thì hướng dẫn mở mục **Nối Claude** trên web.

## Tuyệt đối không

- Không ghi mật khẩu, API key, token, cookie hay dữ liệu cá nhân khách hàng vào bất kỳ trường nào — đồng nghiệp xem được toàn bộ task. Dùng connector có sẵn của người dùng để truy cập dịch vụ.
````

- [ ] **Step 5: Viết `skills/bao-cao-tuan/SKILL.md`**

````markdown
---
name: bao-cao-tuan
description: Viết báo cáo tuần trên Work System từ kết quả các task trong tuần (tốt, chưa ổn, tuần tới, mẫu hình) rồi nộp bằng nop_bao_cao_tuan. Dùng chiều thứ 6 hoặc khi được nhờ.
---

# Báo cáo tuần Work System

1. Gọi `xem_task` (không slug) để lấy danh sách task; với mỗi task gọi `xem_task` kèm `slug` để đọc 10 lần chạy gần nhất, chỉ số, báo cáo.
2. Chỉ xét các lần chạy trong tuần hiện tại (thứ 2 → chủ nhật, giờ Việt Nam).
3. Viết:
   - `summary`: 2–3 câu, nói thẳng điều quan trọng nhất của tuần.
   - `good`: việc chạy tốt, có số liệu; mỗi mục ghi `task` = slug liên quan.
   - `bad`: việc hỏng/chậm, nguyên nhân nếu biết; `weight` là cụm ngắn nói mức ảnh hưởng (≤ 80 ký tự).
   - `next`: việc nên làm tuần tới, cụ thể, có người/việc rõ ràng.
   - `pattern`: điểm chung của các sự cố trong tuần (nếu có).
4. Gọi `nop_bao_cao_tuan` (bỏ trống `week` để dùng tuần hiện tại). Nộp lại cùng tuần sẽ ghi đè.
5. Nếu đang chạy trong vòng Điều phối (task có `skill: "bao-cao-tuan"`), sau khi nộp gọi `bao_ket_qua` với `leaseId` của việc đó.

Không đưa mật khẩu, token hay dữ liệu cá nhân khách hàng vào báo cáo.
````

- [ ] **Step 6: Chạy test** — `npx vitest run server/skills.test.ts` → PASS.

- [ ] **Step 7: Đóng gói**

```bash
npm i -D fflate@^0.8
```

Tạo `scripts/pack-skills.mjs`:

```js
// Đóng gói mỗi skill thành zip chứa đúng một thư mục <tên>/SKILL.md (định dạng upload của claude.ai),
// cộng một zip gộp cả bộ cho ~/.claude/skills.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const root = new URL('../skills/', import.meta.url)
const out = new URL('../public/downloads/', import.meta.url)
mkdirSync(out, { recursive: true })

const all = {}
for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
  const files = {}
  for (const f of readdirSync(new URL(`${d.name}/`, root))) {
    files[`${d.name}/${f}`] = strToU8(readFileSync(new URL(`${d.name}/${f}`, root), 'utf8'))
  }
  Object.assign(all, files)
  writeFileSync(new URL(`${d.name}.zip`, out), zipSync(files, { level: 9 }))
}
writeFileSync(new URL('work-system-skills.zip', out), zipSync(all, { level: 9 }))
console.log(`Đã đóng gói ${Object.keys(all).length} file skill vào public/downloads/`)
```

`package.json` scripts: `"dev": "node scripts/pack-skills.mjs && vite"`, `"build": "node scripts/pack-skills.mjs && tsc -b && vite build"`, thêm `"skills": "node scripts/pack-skills.mjs"`.

`.gitignore` thêm `public/downloads`.

`vercel.json`: trong rewrite SPA cuối, thêm `downloads/` vào nhóm loại trừ: `"/((?!assets/|downloads/|favicon\\.svg|icons\\.svg).*)"`.

- [ ] **Step 8: Kiểm tra đóng gói**

Run: `npm run skills && unzip -l public/downloads/dieu-phoi.zip && unzip -l public/downloads/work-system-skills.zip`
Expected: `dieu-phoi/SKILL.md` trong zip đơn; zip gộp có 3 thư mục.

- [ ] **Step 9: Commit**

```bash
git add skills scripts server/skills.test.ts package.json package-lock.json .gitignore vercel.json
git commit -m "feat: bộ skill Claude (dieu-phoi, tao-task, bao-cao-tuan) và đóng gói zip"
```

---

### Task 7: Trang "Nối Claude" — 4 bước tự đánh dấu

**Files:**
- Create: `shared/dispatcherCron.ts`, `shared/dispatcherCron.test.ts`, `src/components/Guide.tsx`
- Modify: `src/components/Icons.tsx`, `src/App.tsx`, `src/components/Presence.tsx`, `src/components/Desk.tsx`, `src/components/WorkHours.tsx`, `src/styles/polish.css`

**Interfaces:**
- Produces: `dispatcherCron(w: { workDays: number[]; workStart: string; workEnd: string }): string`; view `'guide'`; `<Guide me claude tasks presence onGo />`; `Desk` nhận `onGuide: () => void`.

- [ ] **Step 1: Viết test `shared/dispatcherCron.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { dispatcherCron } from './dispatcherCron.js'

describe('dispatcherCron', () => {
  it.each([
    [{ workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }, '*/15 8-18 * * 1-5'],
    [{ workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:15' }, '*/15 7-20 * * 1-6'],
    [{ workDays: [1, 3, 5], workStart: '09:00', workEnd: '10:00' }, '*/15 9 * * 1,3,5'],
    [{ workDays: [0, 1, 2, 3, 4, 5, 6], workStart: '08:00', workEnd: '18:00' }, '*/15 8-17 * * *'],
    [{ workDays: [1, 2, 3, 5, 6], workStart: '08:00', workEnd: '18:00' }, '*/15 8-17 * * 1-3,5-6'],
  ])('%j → %s', (w, cron) => expect(dispatcherCron(w)).toBe(cron))
})
```

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run shared/dispatcherCron.test.ts` → FAIL (module chưa có).

- [ ] **Step 3: Viết `shared/dispatcherCron.ts`**

```ts
function compress(days: number[]): string {
  const out: string[] = []
  for (let i = 0; i < days.length; i += 1) {
    let j = i
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1
    out.push(j > i ? `${days[i]}-${days[j]}` : String(days[i]))
    i = j
  }
  return out.join(',')
}

/** Cron cho tác vụ hẹn giờ "dieu-phoi": mỗi 15 phút trong khung giờ làm việc (giờ VN). Giờ kết thúc không tính. */
export function dispatcherCron(w: { workDays: number[]; workStart: string; workEnd: string }): string {
  const sh = Number(w.workStart.slice(0, 2))
  const eh = Number(w.workEnd.slice(0, 2))
  const last = Number(w.workEnd.slice(3, 5)) > 0 ? eh : eh - 1
  const hours = sh >= last ? String(sh) : `${sh}-${last}`
  const days = [...new Set(w.workDays)].sort((a, b) => a - b)
  return `*/15 ${hours} * * ${days.length === 7 ? '*' : compress(days)}`
}
```

- [ ] **Step 4: Chạy test** — `npx vitest run shared/dispatcherCron.test.ts` → PASS.

- [ ] **Step 5: `src/components/WorkHours.tsx`** — import `dispatcherCron` từ `../../shared/dispatcherCron` và thay biểu thức `hint` bằng:

```tsx
  const hint = valid ? `Lịch cho tác vụ hẹn giờ "dieu-phoi": ${dispatcherCron({ workDays: days, workStart: start, workEnd: end })}` : ''
```

  (xóa các biến `startH`, `endH`, `dow` không còn dùng.)

- [ ] **Step 6: Icon** — thêm vào `src/components/Icons.tsx`:

```tsx
export const IconGuide = () => (
  <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
)
```

- [ ] **Step 7: Viết `src/components/Guide.tsx`**

```tsx
import { useState } from 'react'
import type { Me, MyConnections, Presence, Task } from '../lib/types'
import { dispatcherCron } from '../../shared/dispatcherCron'

const SKILLS_KEY = 'ws.skillsInstalled'
const readFlag = () => {
  try {
    return window.localStorage.getItem(SKILLS_KEY) === '1'
  } catch {
    return false
  }
}
const writeFlag = (v: boolean) => {
  try {
    window.localStorage.setItem(SKILLS_KEY, v ? '1' : '0')
  } catch {
    /* trình duyệt chặn storage — trạng thái chỉ giữ trong phiên này */
  }
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="copy">
      <pre>{text}</pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setDone(true)
            window.setTimeout(() => setDone(false), 1800)
          } catch {
            setDone(false)
          }
        }}
      >
        {done ? 'Đã chép' : 'Chép'}
      </button>
    </div>
  )
}

export default function Guide({ me, claude, tasks, presence }: { me: Me; claude: MyConnections | null; tasks: Task[]; presence: Presence }) {
  const [skills, setSkills] = useState(readFlag)
  const cron = dispatcherCron(me)
  const steps = [
    { done: !!claude && claude.links.length > 0, title: 'Nối connector Work System vào Claude desktop' },
    { done: skills, title: 'Cài bộ skill Work System' },
    { done: presence !== 'never', title: 'Tạo tác vụ hẹn giờ "dieu-phoi"' },
    { done: tasks.length > 0, title: 'Tạo task đầu tiên' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const scheduled = `Tạo một tác vụ hẹn giờ local tên "dieu-phoi" với lịch cron "${cron}" (giờ Việt Nam, mỗi 15 phút trong giờ làm của tôi). Nội dung tác vụ: "Dùng skill dieu-phoi với connector Work System." Quyền: tự động cho các tool của Work System.`

  return (
    <div className="wrap">
      <header className="hero">
        <h1 className="hero__line rise">
          {doneCount === 4 ? <>Claude của bạn đã sẵn sàng</> : <><em>{doneCount}/4</em> bước để Claude tự chạy việc</>}
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          Làm một lần trên Claude desktop. Các bước tự đánh dấu khi Work System thấy kết quả.
        </p>
        <div className="guide__bar" aria-hidden="true"><span style={{ width: `${(doneCount / 4) * 100}%` }} /></div>
      </header>

      <ol className="guide">
        <li className={`guide__step${steps[0].done ? ' is-done' : ''}`}>
          <h2>1. {steps[0].title}</h2>
          <p>Claude desktop → <b>Settings</b> → <b>Connectors</b> → <b>Add custom connector</b> → dán địa chỉ dưới đây → <b>Connect</b> → đăng nhập Google → <b>Cho phép</b>.</p>
          {claude && <Copy text={claude.connectorUrl} />}
        </li>

        <li className={`guide__step${steps[1].done ? ' is-done' : ''}`}>
          <h2>2. {steps[1].title}</h2>
          <p>
            Tải từng skill và upload trong Claude desktop → <b>Settings</b> → <b>Capabilities</b> → <b>Skills</b>:{' '}
            <a href="/downloads/dieu-phoi.zip" download>dieu-phoi</a>, <a href="/downloads/tao-task.zip" download>tao-task</a>,{' '}
            <a href="/downloads/bao-cao-tuan.zip" download>bao-cao-tuan</a>.
          </p>
          <p>
            Dùng tab Code của Claude desktop? Tải <a href="/downloads/work-system-skills.zip" download>cả bộ</a> và giải nén vào thư mục <code>~/.claude/skills/</code>.
          </p>
          <label className="guide__check">
            <input type="checkbox" checked={skills} onChange={(e) => { setSkills(e.target.checked); writeFlag(e.target.checked) }} /> Tôi đã cài xong
          </label>
        </li>

        <li className={`guide__step${steps[2].done ? ' is-done' : ''}`}>
          <h2>3. {steps[2].title}</h2>
          <p>Mở tab <b>Code</b> trên Claude desktop, dán câu dưới đây vào một phiên mới. Tạo xong, mở tác vụ trong <b>Routines</b>, bấm <b>Run now</b> một lần và chọn <b>Always allow</b> cho các tool Work System — nếu không, các lần sau sẽ đứng chờ duyệt quyền.</p>
          <Copy text={scheduled} />
          <p className="guide__fine">Tác vụ chỉ chạy khi máy bật và Claude desktop đang mở. Bật <b>Keep computer awake</b> trong Settings để máy không ngủ giữa giờ. Bước này tự đánh dấu khi Claude gọi Work System lần đầu.</p>
        </li>

        <li className={`guide__step${steps[3].done ? ' is-done' : ''}`}>
          <h2>4. {steps[3].title}</h2>
          <p>Trong Claude, nói:</p>
          <Copy text="Dùng skill tao-task để tạo một task Work System mới cho tôi." />
        </li>
      </ol>
    </div>
  )
}
```

- [ ] **Step 8: Nối vào `src/App.tsx`**

- `type View` thêm `'guide'`; `NAV` thêm `{ id: 'guide', label: 'Nối Claude', Icon: IconGuide }` (cuối danh sách; import `IconGuide`, `Guide`).
- Render: thêm nhánh trước `view === 'schedule'`:

```tsx
            ) : view === 'guide' ? (
              ws.isMine ? <Guide me={me} claude={claude} tasks={ws.tasks} presence={ws.owner.presence} /> : <Guide me={me} claude={null} tasks={[]} presence="never" />
```

  (khi đang xem đồng nghiệp, chuyển sang trang hướng dẫn thì `go('guide')` cũng nên quay về bàn mình: trong `go`, nếu `v === 'guide' && viewing !== me.id` thì `setViewing(me.id)`.)
- `PresenceBar onConnect={() => go('guide')}`.
- Desk: truyền `onGuide={() => go('guide')}`.

`src/components/Desk.tsx`: prop `onGuide: () => void`; trong hero khi `tasks.length === 0 && who === 'bạn'`, thêm sau `<p className="hero__note">`:

```tsx
        {tasks.length === 0 && who === 'bạn' && (
          <button className="hero__jump rise" style={{ animationDelay: '.24s' }} onClick={onGuide}>
            Mở hướng dẫn Nối Claude
          </button>
        )}
```

- [ ] **Step 9: CSS — thêm vào `src/styles/polish.css`**

```css
/* ---------- Nối Claude ---------- */
.guide__bar { height: 4px; border-radius: 2px; background: var(--line-soft); margin-top: 22px; max-width: 520px; overflow: hidden; }
.guide__bar span { display: block; height: 100%; background: var(--run); transition: width .8s var(--ease); }
.guide { list-style: none; margin: 0 0 60px; padding: 0; display: grid; gap: 14px; max-width: 860px; }
.guide__step { position: relative; padding: 20px 22px 18px 58px; border-radius: 16px; background: var(--ink-raised); border: 1px solid var(--line-soft); }
.guide__step::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 22px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--line);
}
.guide__step.is-done::before { background: var(--run); border-color: var(--run); box-shadow: 0 0 0 4px var(--run-dim); }
.guide__step.is-done::after { content: '✓'; position: absolute; left: 26px; top: 22px; color: #14161c; font-weight: 700; font-size: 14px; }
.guide__step h2 { margin: 0 0 8px; font-family: var(--display); font-size: 18px; font-weight: 650; }
.guide__step.is-done h2 { color: var(--fg-2); }
.guide__step p { margin: 0 0 10px; color: var(--fg-2); font-size: 14px; line-height: 1.6; }
.guide__step b { color: var(--fg); font-weight: 600; }
.guide__step a { color: var(--needs); }
.guide__step code { font-family: var(--mono); font-size: 13px; }
.guide__fine { font-size: 12.5px !important; color: var(--fg-3) !important; }
.guide__check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--fg-2); cursor: pointer; }
.copy { display: flex; align-items: flex-start; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 11px; background: var(--ink-sunken); border: 1px solid var(--line-soft); margin-bottom: 10px; }
.copy pre { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; word-break: break-word; font: 13px/1.55 var(--mono); color: var(--needs); }
.copy button { flex: none; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; }
.copy button:hover { border-color: var(--needs); background: var(--needs-dim); }
```

- [ ] **Step 10: Typecheck, build, test, commit**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

```bash
git add shared src
git commit -m "feat(web): trang Nối Claude 4 bước tự đánh dấu, cron Điều phối theo khung giờ"
```

---

### Task 8: ⌘K và khung chờ skeleton

**Files:**
- Create: `src/lib/search.ts`, `src/lib/search.test.ts`, `src/components/CommandPalette.tsx`, `src/components/Skeleton.tsx`
- Modify: `src/App.tsx`, `src/styles/polish.css`

**Interfaces:**
- Produces: `normalizeVi(s: string): string`; `filterItems<T extends PaletteItem>(items: T[], q: string, limit?: number): T[]` với `PaletteItem = { id: string; label: string; hint?: string }`; `<CommandPalette open items onClose />` với item có `run: () => void`; `<DeskSkeleton />`.

- [ ] **Step 1: Viết test `src/lib/search.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { filterItems, normalizeVi } from './search'

const items = [
  { id: '1', label: 'Báo cáo tuần BOO X LOGAN', hint: 'Task' },
  { id: '2', label: 'Chiến dịch upsell Q3/2026', hint: 'Task' },
  { id: '3', label: 'Đội ngũ', hint: 'Mục' },
  { id: '4', label: 'Bình (demo)', hint: 'Đồng nghiệp' },
]

describe('normalizeVi', () => {
  it('bỏ dấu, đ → d, chữ thường', () => {
    expect(normalizeVi('Đội Ngũ Báo Cáo')).toBe('doi ngu bao cao')
  })
})

describe('filterItems', () => {
  it('tìm không dấu', () => {
    expect(filterItems(items, 'bao cao').map((i) => i.id)).toEqual(['1'])
    expect(filterItems(items, 'doi ngu').map((i) => i.id)).toEqual(['3'])
  })
  it('tìm theo nhiều từ không theo thứ tự, theo cả gợi ý', () => {
    expect(filterItems(items, 'q3 upsell').map((i) => i.id)).toEqual(['2'])
    expect(filterItems(items, 'dong nghiep').map((i) => i.id)).toEqual(['4'])
  })
  it('ưu tiên khớp đầu nhãn; rỗng → trả tất cả theo giới hạn', () => {
    expect(filterItems(items, 'b')[0].id).toBe('1')
    expect(filterItems(items, '', 2)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run src/lib/search.test.ts` → FAIL.

- [ ] **Step 3: Viết `src/lib/search.ts`**

```ts
export interface PaletteItem {
  id: string
  label: string
  hint?: string
}

export function normalizeVi(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
}

export function filterItems<T extends PaletteItem>(items: T[], q: string, limit = 8): T[] {
  const words = normalizeVi(q).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items.slice(0, limit)
  return items
    .map((it) => {
      const label = normalizeVi(it.label)
      const hay = `${label} ${normalizeVi(it.hint ?? '')}`
      if (!words.every((w) => hay.includes(w))) return null
      const score = label.startsWith(words[0]) ? 0 : label.includes(` ${words[0]}`) ? 1 : 2
      return { it, score }
    })
    .filter((x): x is { it: T; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.it)
}
```

- [ ] **Step 4: Chạy test** — PASS.

- [ ] **Step 5: Viết `src/components/CommandPalette.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { filterItems, type PaletteItem } from '../lib/search'

export type Command = PaletteItem & { run: () => void }

export default function CommandPalette({ open, items, onClose }: { open: boolean; items: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = filterItems(items, q)

  useEffect(() => {
    if (!open) return
    setQ('')
    setI(0)
    const id = window.setTimeout(() => input.current?.focus(), 10)
    return () => window.clearTimeout(id)
  }, [open])

  if (!open) return null

  function choose(c: Command | undefined) {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <div className="pal" role="presentation" onMouseDown={onClose}>
      <div className="pal__box" role="dialog" aria-modal="true" aria-label="Tìm nhanh" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="pal__input"
          placeholder="Tìm task, người, mục… (gõ không dấu cũng được)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setI(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setI((x) => Math.min(x + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setI((x) => Math.max(x - 1, 0))
            } else if (e.key === 'Enter') choose(results[i])
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={results[i] ? `pal-${results[i].id}` : undefined}
        />
        <ul id="pal-list" className="pal__list" role="listbox">
          {results.length === 0 && <li className="pal__empty">Không thấy gì khớp "{q}"</li>}
          {results.map((r, k) => (
            <li
              key={r.id}
              id={`pal-${r.id}`}
              role="option"
              aria-selected={k === i}
              className="pal__item"
              onMouseEnter={() => setI(k)}
              onClick={() => choose(r)}
            >
              <span>{r.label}</span>
              {r.hint && <span className="pal__hint">{r.hint}</span>}
            </li>
          ))}
        </ul>
        <div className="pal__foot">↑↓ chọn · Enter mở · Esc đóng</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Viết `src/components/Skeleton.tsx`**

```tsx
export function DeskSkeleton() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Đang tải bàn điều phối">
      <div className="sk sk--title" />
      <div className="sk sk--line" />
      <div className="desk" style={{ marginTop: 34 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk sk--card" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Nối vào `src/App.tsx`**

- Import `CommandPalette, { type Command }` và `DeskSkeleton`.
- State `const [palette, setPalette] = useState(false)`.
- Phím tắt:

```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
```

- Danh sách lệnh:

```ts
  const commands: Command[] = [
    ...NAV.map((n) => ({ id: `v-${n.id}`, label: n.label, hint: 'Mục', run: () => go(n.id) })),
    ...(ws?.tasks ?? []).map((t) => ({ id: `t-${t.id}`, label: t.name, hint: ws?.isMine ? 'Task của bạn' : `Task của ${ws?.owner.name}`, run: () => { setView('desk'); setOpenTask(t.id) } })),
    ...people.filter((p) => p.active).map((p) => ({ id: `p-${p.id}`, label: p.name, hint: p.id === me.id ? 'Bàn của bạn' : 'Đồng nghiệp', run: () => visit(p.id) })),
  ]
```

- Topbar: thêm trước `<span className="clock">` nút `<button className="kbd" onClick={() => setPalette(true)} aria-label="Tìm nhanh">⌘K</button>`.
- Render `<CommandPalette open={palette} items={commands} onClose={() => setPalette(false)} />` cạnh `AnimatePresence` toast.
- Thay `<div className="loading">đang đọc dữ liệu…</div>` (nhánh `!ws`) bằng `<DeskSkeleton />`.

- [ ] **Step 8: CSS — thêm vào `src/styles/polish.css`**

```css
/* ---------- ⌘K ---------- */
.kbd { height: 26px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--line); color: var(--fg-3); font: 500 12px var(--mono); margin-right: 12px; }
.kbd:hover { color: var(--fg); border-color: var(--fg-3); }
.pal { position: fixed; inset: 0; z-index: 80; background: rgba(8, 9, 12, .55); backdrop-filter: blur(3px); display: grid; justify-items: center; align-items: start; padding: 12vh 16px 16px; }
.pal__box { width: min(620px, 100%); border-radius: 16px; background: var(--ink-high); border: 1px solid var(--line); box-shadow: 0 30px 80px rgba(0, 0, 0, .6); overflow: hidden; animation: pal-in .18s var(--ease); }
.pal__input { width: 100%; height: 56px; padding: 0 20px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--fg); font: 500 17px var(--ui); }
.pal__input:focus { outline: none; }
.pal__list { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow-y: auto; }
.pal__item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 14.5px; }
.pal__item[aria-selected='true'] { background: var(--ink-raised); box-shadow: inset 2px 0 0 var(--needs); }
.pal__hint { color: var(--fg-3); font: 12px var(--mono); flex: none; }
.pal__empty { padding: 18px 14px; color: var(--fg-3); font-size: 14px; }
.pal__foot { padding: 8px 16px; border-top: 1px solid var(--line-soft); color: var(--fg-3); font: 11.5px var(--mono); }
@keyframes pal-in { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }

/* ---------- skeleton ---------- */
.sk { border-radius: 12px; background: linear-gradient(90deg, var(--ink-raised) 0%, var(--ink-high) 50%, var(--ink-raised) 100%); background-size: 200% 100%; animation: sk 1.4s ease-in-out infinite; }
.sk--title { height: 54px; width: min(620px, 80%); margin-top: 54px; }
.sk--line { height: 18px; width: min(460px, 60%); margin-top: 16px; }
.sk--card { height: 300px; border-radius: 16px; }
@keyframes sk { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

@media (prefers-reduced-motion: reduce) {
  .pal__box, .sk { animation: none; }
  .guide__bar span { transition: none; }
}
```

- [ ] **Step 9: Typecheck, build, test, commit**

Run: `npx tsc -b && npx vite build && npx vitest run`
Expected: sạch, PASS.

```bash
git add src
git commit -m "feat(web): ⌘K tìm nhanh không dấu, khung chờ skeleton"
```

---

### Task 9: E2E tự động bằng Playwright

**Files:**
- Create: `playwright.config.ts`, `e2e/loop.spec.ts`
- Modify: `vite.config.ts`, `package.json`, `.gitignore`

**Interfaces:**
- Produces: `npm run e2e` — dựng PGlite riêng (`.pglite-e2e`), seed demo, chạy dev server cổng 5174, kiểm vòng đầy đủ.

- [ ] **Step 1: Cài và cấu hình**

```bash
npm i -D @playwright/test@1.63.0
npx playwright install chromium
```

`.gitignore` thêm `.pglite-e2e`, `test-results`, `playwright-report`.

`package.json` scripts thêm `"e2e": "playwright test"`.

`vite.config.ts`: thay `Object.assign(process.env, loadEnv(mode, process.cwd(), ''))` bằng (để biến môi trường do Playwright truyền không bị `.env` ghi đè):

```ts
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[k] ??= v
```

Tạo `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

const PORT = 5174
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: `rm -rf .pglite-e2e && npx tsx server/seed.ts --demo && npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PGLITE_DIR: '.pglite-e2e',
      PUBLIC_URL: `http://localhost:${PORT}`,
      DEV_LOGIN: '1',
      DATABASE_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ADMIN_EMAILS: 'tutnv@bravebits.vn',
    },
  },
})
```

- [ ] **Step 2: Viết `e2e/loop.spec.ts`**

```ts
import { createHash } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'

const CB = 'https://claude.ai/api/mcp/auth_callback'

async function claudeToken(page: import('@playwright/test').Page, request: APIRequestContext, base: string) {
  const reg = await (await request.post('/oauth/register', { data: { client_name: 'Claude', redirect_uris: [CB] } })).json()
  const verifier = 'v'.repeat(60)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: challenge, code_challenge_method: 'S256', state: 's', resource: `${base}/mcp` })
  await page.route('https://claude.ai/**', (r) => r.fulfill({ status: 200, body: 'ok' }))
  await page.goto(`/oauth/authorize?${q}`)
  const [req] = await Promise.all([page.waitForRequest((r) => r.url().startsWith(CB)), page.getByRole('button', { name: 'Cho phép' }).click()])
  const code = new URL(req.url()).searchParams.get('code')!
  const tok = await (await request.post('/oauth/token', { form: { grant_type: 'authorization_code', code, redirect_uri: CB, client_id: reg.client_id, code_verifier: verifier } })).json()
  return tok.access_token as string
}

async function tool(request: APIRequestContext, token: string, name: string, args: unknown) {
  const res = await request.post('/mcp', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const line = (await res.text()).split('\n').find((l) => l.startsWith('data: '))!
  return JSON.parse(line.slice(6)).result as { isError?: boolean; content: { text: string }[] }
}

test('vòng Điều phối: web gửi lệnh → Claude nhận → báo kết quả → web cập nhật', async ({ page, baseURL }) => {
  await page.goto('/auth/dev?email=tutnv@bravebits.vn&name=Logan')
  await expect(page.getByText('Bàn điều phối').first()).toBeVisible()
  const token = await claudeToken(page, page.request, baseURL!)

  await page.goto('/')
  await page.locator('.strip', { hasText: 'upsell' }).getByRole('button', { name: 'Mở không gian riêng' }).click()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await page.getByRole('button', { name: '+ Ghi chú cho Claude' }).click()
  await page.locator('.actbar__note').fill('Ưu tiên store gói Pro')
  await page.locator('.actbtn--run').click()
  await expect(page.locator('.ticket--pending').first()).toBeVisible()

  const d = await tool(page.request, token, 'dieu_phoi', {})
  const txt = d.content[0].text
  const viec = JSON.parse(txt.slice(txt.indexOf('{'))).viec as { leaseId: string; loai: string; task: { slug: string }; lenh?: { note: string } }[]
  const lenh = viec.find((v) => v.loai === 'lenh')!
  expect(lenh.lenh?.note).toBe('Ưu tiên store gói Pro')

  const r = await tool(page.request, token, 'bao_ket_qua', {
    slug: lenh.task.slug, status: 'ok', note: 'Đã gửi 12 tin', leaseId: lenh.leaseId,
    blocks: [{ id: 'ghi-chu', type: 'note', title: 'Ghi chú', data: { text: '<script>window.__xss = 1</script> **ổn**' } }],
  })
  expect(r.isError).toBeFalsy()
  const again = await tool(page.request, token, 'bao_ket_qua', { slug: lenh.task.slug, status: 'ok', leaseId: lenh.leaseId })
  expect(again.content[0].text).toContain('đã ghi trước đó')

  await page.reload()
  await page.locator('.strip', { hasText: 'upsell' }).getByRole('button', { name: 'Mở không gian riêng' }).click()
  await expect(page.locator('.blk__note')).toContainText('<script>')
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await expect(page.locator('.ticket--done').first()).toContainText('Đã gửi 12 tin')
  await expect(page.getByText('Claude của bạn đang trực')).toBeVisible()
})

test('đồng nghiệp chỉ đọc; ⌘K tìm không dấu', async ({ page }) => {
  await page.goto('/auth/dev?email=tutnv@bravebits.vn&name=Logan')
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByPlaceholder(/Tìm task/).fill('binh')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Đang xem không gian của/)).toBeVisible()
  await page.getByRole('button', { name: 'Mở không gian riêng' }).first().click()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await expect(page.locator('.actbar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Lịch chạy' }).click()
  await expect(page.getByRole('switch')).toHaveCount(0)
})
```

- [ ] **Step 3: Chạy**

Run: `npm run e2e`
Expected: 2 passed. (Nếu cổng 5174 bận, đổi `PORT`.)

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e vite.config.ts package.json package-lock.json .gitignore
git commit -m "test: E2E Playwright cho vòng Điều phối, chế độ chỉ đọc và ⌘K"
```

---

### Task 10: Tài liệu ra mắt và kiểm tra cuối

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Cập nhật `README.md`**

- Mục "Chạy trên máy": thêm `npm run e2e` (E2E Playwright).
- Mục "Triển khai (Vercel)" bước 4: thêm `CRON_SECRET` (chuỗi ngẫu nhiên dài) — Vercel Cron gọi `/api/cron/cleanup` lúc 03:00 giờ VN mỗi ngày.
- Thay mục "Nối Claude desktop" bằng:

````markdown
## Nối Claude desktop

Trên Work System (bản Vercel) mở mục **Nối Claude** — 4 bước, tự đánh dấu khi xong:

1. Thêm connector `https://<domain>/mcp` (Settings → Connectors → Add custom connector).
2. Cài bộ skill: `dieu-phoi`, `tao-task`, `bao-cao-tuan` (tải zip ngay trên trang).
3. Tạo tác vụ hẹn giờ local "dieu-phoi" trong tab Code (câu lệnh mẫu có sẵn, lịch theo khung giờ của từng người), **Run now** một lần và **Always allow**.
4. Nhờ Claude "Dùng skill tao-task để tạo task mới".

Claude chỉ gọi tới được địa chỉ HTTPS công khai — `localhost` không dùng cho connector.
````

- Thêm mục mới:

````markdown
## Danh sách kiểm tra trước khi mời team

- [ ] Tạo **Client Secret mới** cho Google OAuth (secret cũ từng được dán vào chat) và chỉ đặt trong biến môi trường Vercel.
- [ ] Vercel: gói Pro cho mục đích công ty (Hobby là phi thương mại); `PUBLIC_URL`, `ADMIN_EMAILS`, `CRON_SECRET` đã đặt; **không** đặt `DEV_LOGIN`.
- [ ] Google OAuth: redirect `https://<domain>/auth/google/callback`; Audience = Internal (nếu project thuộc Workspace bravebits.vn).
- [ ] Logan nối Claude desktop, chạy Điều phối ≥ 1 ngày làm việc: vé lệnh đi hết vòng, báo cáo tuần nộp được.
- [ ] Mời team: gửi link Work System, mọi người làm 4 bước ở mục **Nối Claude**.
````

- [ ] **Step 2: Kiểm tra cuối**

Run: `npx tsc -b && npm run build && npx vitest run && npm run e2e`
Expected: tất cả sạch / PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: hướng dẫn Nối Claude, cron dọn dữ liệu, danh sách kiểm tra ra mắt"
```
