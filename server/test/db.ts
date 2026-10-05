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
