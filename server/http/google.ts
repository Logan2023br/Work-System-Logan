import { Google, decodeIdToken } from 'arctic'
import type { Config } from '../config.js'
import type { GoogleProfile } from '../core/users.js'

export interface GoogleAuth {
  authorizeUrl(state: string, verifier: string): URL
  exchange(code: string, verifier: string): Promise<GoogleProfile>
}

export function createGoogleAuth(cfg: Config): GoogleAuth {
  const g = new Google(cfg.googleClientId, cfg.googleClientSecret, `${cfg.publicUrl}/auth/google/callback`)
  return {
    authorizeUrl(state, verifier) {
      const url = g.createAuthorizationURL(state, verifier, ['openid', 'email', 'profile'])
      url.searchParams.set('hd', cfg.allowedDomain)
      url.searchParams.set('prompt', 'select_account')
      return url
    },
    async exchange(code, verifier) {
      const tokens = await g.validateAuthorizationCode(code, verifier)
      // ID token nhận trực tiếp từ Google qua TLS ở bước đổi code → không cần tự kiểm chữ ký (OIDC Core 3.1.3.7).
      const c = decodeIdToken(tokens.idToken()) as Record<string, unknown>
      return {
        email: typeof c.email === 'string' ? c.email : '',
        emailVerified: c.email_verified === true,
        hd: typeof c.hd === 'string' ? c.hd : null,
        name: typeof c.name === 'string' ? c.name : '',
        picture: typeof c.picture === 'string' ? c.picture : null,
      }
    },
  }
}
