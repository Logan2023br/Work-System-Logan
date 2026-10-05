import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { SCOPE, verifyAccessToken } from '../core/oauth-tokens.js'
import { MCP_INSTRUCTIONS, registerTools } from '../mcp/tools.js'
import type { AppDeps } from './app.js'
import { mcpResource } from './oauth.js'

export function mcpHandler(deps: AppDeps): (req: Request) => Promise<Response> {
  const resource = mcpResource(deps.config)
  const handler = createMcpHandler((server) => registerTools(server, { db: deps.db, now: deps.now, publicUrl: deps.config.publicUrl }), {
    serverInfo: { name: 'work-system', version: '1.0.0' },
    instructions: MCP_INSTRUCTIONS,
  })
  return withMcpAuth(
    handler,
    async (_req, bearer) => {
      if (!bearer) return undefined
      const info = await verifyAccessToken(deps.db, bearer, resource, deps.now())
      if (!info) return undefined
      return {
        token: bearer,
        clientId: info.clientId,
        scopes: [SCOPE],
        // Hạn token đã được verifyAccessToken kiểm theo đồng hồ của app; không đưa expiresAt để thư viện khỏi kiểm lần hai bằng đồng hồ khác.
        resource: new URL(resource),
        extra: { userId: info.userId },
      }
    },
    { required: true, resourceUrl: deps.config.publicUrl, resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp' },
  )
}
