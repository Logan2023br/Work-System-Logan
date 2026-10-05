import { createHash } from 'node:crypto'
import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import type { ClaudeLinkDTO } from '../../shared/dto.js'
import { oauthClients, oauthCodes, oauthTokens, users } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { notFound } from './errors.js'
import type { ClientInfo } from './oauth-clients.js'
import { OAuthError } from './oauth-error.js'
import { hashToken, isUuid, newToken } from './tokens.js'

export const ACCESS_TTL_S = 3600
export const REFRESH_TTL_MS = 90 * 86_400_000
export const CODE_TTL_MS = 60_000
export const SCOPE = 'work'
const TOUCH_EVERY_MS = 60_000

export interface TokenPair {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export interface AccessInfo {
  userId: string
  clientId: string
  tokenId: string
  expiresAt: Date
}

export const s256 = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url')

const grant = (m: string) => new OAuthError('invalid_grant', m)

export async function createAuthCode(
  db: Db,
  p: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; resource: string },
  now: Date,
): Promise<string> {
  const code = newToken()
  await db.insert(oauthCodes).values({ codeHash: hashToken(code), ...p, expiresAt: new Date(now.getTime() + CODE_TTL_MS) })
  return code
}

function newPair(now: Date) {
  const access = newToken()
  const refresh = newToken()
  return {
    access,
    refresh,
    cols: {
      accessHash: hashToken(access),
      refreshHash: hashToken(refresh),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  }
}

const toPair = (access: string, refresh: string): TokenPair => ({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE })

export async function exchangeCode(
  db: Db,
  p: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string },
  client: ClientInfo,
  now: Date,
): Promise<TokenPair> {
  // Đánh dấu đã dùng NGUYÊN TỬ: hai yêu cầu đổi cùng code thì chỉ một bên nhận được hàng.
  const [row] = await db
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.codeHash, hashToken(p.code)), isNull(oauthCodes.usedAt)))
    .returning()
  if (!row) throw grant('Mã ủy quyền không hợp lệ hoặc đã được dùng')
  if (row.expiresAt <= now) throw grant('Mã ủy quyền đã hết hạn')
  if (row.clientId !== p.clientId || row.clientId !== client.clientId) throw grant('Mã ủy quyền không thuộc client này')
  if (row.redirectUri !== p.redirectUri) throw grant('redirect_uri không khớp với lúc ủy quyền')
  if (s256(p.codeVerifier) !== row.codeChallenge) throw grant('code_verifier không khớp (PKCE)')
  if (p.resource && p.resource.replace(/\/+$/, '') !== row.resource) throw new OAuthError('invalid_target', 'resource không khớp với lúc ủy quyền')

  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  if (!owner?.active) throw grant('Tài khoản không còn hoạt động')

  const pair = newPair(now)
  await db.insert(oauthTokens).values({ userId: row.userId, clientId: client.clientId, clientName: client.name, resource: row.resource ?? '', ...pair.cols })
  await db.update(oauthClients).set({ lastUsedAt: now }).where(eq(oauthClients.clientId, client.clientId))
  return toPair(pair.access, pair.refresh)
}

export async function refreshTokens(db: Db, p: { refreshToken: string; clientId: string; resource?: string }, now: Date): Promise<TokenPair> {
  if (p.resource) {
    const hit = await db.query.oauthTokens.findFirst({ where: eq(oauthTokens.refreshHash, hashToken(p.refreshToken)), columns: { resource: true } })
    if (hit && hit.resource !== p.resource.replace(/\/+$/, '')) throw new OAuthError('invalid_target', 'resource không khớp')
  }
  const pair = newPair(now)
  // Xoay vòng nguyên tử: refresh cũ hết hiệu lực trong cùng câu lệnh phát cặp mới.
  const [row] = await db
    .update(oauthTokens)
    .set(pair.cols)
    .where(
      and(
        eq(oauthTokens.refreshHash, hashToken(p.refreshToken)),
        eq(oauthTokens.clientId, p.clientId),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.refreshExpiresAt, now),
      ),
    )
    .returning()
  if (!row) throw grant('Refresh token không hợp lệ, đã dùng hoặc đã hết hạn')
  const owner = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  if (!owner?.active) {
    await db.update(oauthTokens).set({ revokedAt: now }).where(eq(oauthTokens.id, row.id))
    throw grant('Tài khoản không còn hoạt động')
  }
  return toPair(pair.access, pair.refresh)
}

export async function verifyAccessToken(db: Db, token: string, resource: string, now: Date): Promise<AccessInfo | null> {
  const [hit] = await db
    .select({ t: oauthTokens })
    .from(oauthTokens)
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(
        eq(oauthTokens.accessHash, hashToken(token)),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.accessExpiresAt, now),
        eq(oauthTokens.resource, resource),
        eq(users.active, true),
      ),
    )
    .limit(1)
  if (!hit) return null
  const stale = new Date(now.getTime() - TOUCH_EVERY_MS)
  await db.update(oauthTokens).set({ lastUsedAt: now }).where(and(eq(oauthTokens.id, hit.t.id), or(isNull(oauthTokens.lastUsedAt), lt(oauthTokens.lastUsedAt, stale))))
  await db.update(users).set({ lastSeenAt: now }).where(and(eq(users.id, hit.t.userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, stale))))
  return { userId: hit.t.userId, clientId: hit.t.clientId, tokenId: hit.t.id, expiresAt: hit.t.accessExpiresAt }
}

export async function listConnections(db: Db, userId: string, now: Date): Promise<ClaudeLinkDTO[]> {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt), gt(oauthTokens.refreshExpiresAt, now)))
    .orderBy(desc(oauthTokens.createdAt))
  return rows.map((r) => ({ id: r.id, clientName: r.clientName, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null }))
}

export async function revokeConnection(db: Db, userId: string, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) throw notFound('Không tìm thấy kết nối')
  const done = await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(and(eq(oauthTokens.id, id), eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id })
  if (done.length === 0) throw notFound('Không tìm thấy kết nối')
}
