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
