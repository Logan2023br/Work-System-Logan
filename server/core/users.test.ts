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
      userId: u.id, clientId: 'c', clientName: 'Claude', resource: 'https://ws.test/mcp', accessHash: 'a', refreshHash: 'r',
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
