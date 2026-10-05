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
