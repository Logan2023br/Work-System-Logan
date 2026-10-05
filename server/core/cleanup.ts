import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
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
        // Chỉ dọn client đăng ký rồi bỏ đó, CHƯA TỪNG được cấp token và không còn code chờ đổi.
        eq(oauthClients.kind, 'dcr'),
        isNull(oauthClients.lastUsedAt),
        lt(oauthClients.createdAt, ago(1)),
        sql`not exists (select 1 from oauth_tokens t where t.client_id = ${oauthClients.clientId})`,
        sql`not exists (select 1 from oauth_codes c where c.client_id = ${oauthClients.clientId})`,
      ),
    )
    .returning({ id: oauthClients.clientId })
  return { logsCleared: logs.length, sessions: s.length, codes: c.length, tokens: t.length, clients: cl.length }
}
