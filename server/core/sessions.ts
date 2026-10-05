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
