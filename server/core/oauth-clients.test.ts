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
