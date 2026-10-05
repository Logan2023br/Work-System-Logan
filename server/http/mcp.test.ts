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
