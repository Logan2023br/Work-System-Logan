import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { oauthClients } from '../db/schema.js'
import type { Db } from '../db/types.js'
import { OAuthError } from './oauth-error.js'
import { newToken } from './tokens.js'

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
export const CIMD_TTL_MS = 24 * 3_600_000

export interface ClientInfo {
  clientId: string
  name: string
  redirectUris: string[]
  kind: 'dcr' | 'cimd'
}

export type MetadataFetcher = (url: string) => Promise<unknown>

export function isLoopback(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
}

export function isAcceptableRedirect(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  return u.protocol === 'https:' || isLoopback(u)
}

/** Khớp chính xác; riêng loopback (RFC 8252 §7.3) bỏ qua cổng. */
export function redirectMatches(registered: string[], requested: string): boolean {
  let req: URL
  try {
    req = new URL(requested)
  } catch {
    return false
  }
  return registered.some((r) => {
    if (r === requested) return true
    const reg = new URL(r)
    return isLoopback(reg) && isLoopback(req) && reg.hostname === req.hostname && reg.pathname === req.pathname && reg.search === req.search
  })
}

const registerBody = z.object({
  redirect_uris: z.array(z.string()).min(1).max(5),
  client_name: z.string().trim().min(1).max(100).optional(),
})

export async function registerClient(db: Db, body: unknown, now: Date): Promise<Record<string, unknown>> {
  const parsed = registerBody.safeParse(body)
  if (!parsed.success) throw new OAuthError('invalid_client_metadata', 'Cần redirect_uris (1–5 URI) và client_name tối đa 100 ký tự')
  const bad = parsed.data.redirect_uris.find((u) => !isAcceptableRedirect(u))
  if (bad) throw new OAuthError('invalid_redirect_uri', `Redirect URI không được chấp nhận: ${bad}`)

  const clientId = `dcr_${newToken().slice(0, 32)}`
  const name = parsed.data.client_name ?? 'Ứng dụng MCP'
  await db.insert(oauthClients).values({ clientId, kind: 'dcr', name, redirectUris: parsed.data.redirect_uris, createdAt: now, updatedAt: now })
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
}

const cimdDoc = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
})

function isCimdUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  const host = u.hostname
  const ipLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
  return u.protocol === 'https:' && !ipLiteral && !local && u.pathname.length > 1 && !u.hash && !u.username
}

export async function resolveClient(db: Db, clientId: string, fetcher: MetadataFetcher, now: Date): Promise<ClientInfo | null> {
  const cached = await db.query.oauthClients.findFirst({ where: eq(oauthClients.clientId, clientId) })
  const toInfo = (r: typeof oauthClients.$inferSelect): ClientInfo => ({ clientId: r.clientId, name: r.name, redirectUris: r.redirectUris, kind: r.kind })

  if (!clientId.startsWith('https://')) return cached && cached.kind === 'dcr' ? toInfo(cached) : null
  if (!isCimdUrl(clientId)) return null
  if (cached && now.getTime() - cached.updatedAt.getTime() < CIMD_TTL_MS) return toInfo(cached)

  let doc: z.infer<typeof cimdDoc>
  try {
    const parsed = cimdDoc.safeParse(await fetcher(clientId))
    if (!parsed.success) return null
    doc = parsed.data
  } catch (e) {
    console.error('[oauth] không tải được Client ID Metadata Document', clientId, e)
    return cached ? toInfo(cached) : null
  }
  if (doc.client_id !== clientId || !doc.redirect_uris.every(isAcceptableRedirect)) return null

  const values = { kind: 'cimd' as const, name: doc.client_name ?? new URL(clientId).hostname, redirectUris: doc.redirect_uris, updatedAt: now }
  await db
    .insert(oauthClients)
    .values({ clientId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: oauthClients.clientId, set: values })
  return { clientId, name: values.name, redirectUris: values.redirectUris, kind: 'cimd' }
}

export const fetchClientMetadata: MetadataFetcher = async (url) => {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.length > 64 * 1024) throw new Error('Tài liệu vượt 64 KB')
  return JSON.parse(text) as unknown
}
