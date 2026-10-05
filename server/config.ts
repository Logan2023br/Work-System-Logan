export interface Config {
  publicUrl: string
  allowedDomain: string
  adminEmails: string[]
  googleClientId: string
  googleClientSecret: string
  secureCookies: boolean
  devLogin: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Thiếu biến môi trường ${k}`)
    return v
  }
  const publicUrl = need('PUBLIC_URL').replace(/\/+$/, '')
  const isLocal = publicUrl.startsWith('http://localhost') || publicUrl.startsWith('http://127.0.0.1')
  return {
    publicUrl,
    allowedDomain: (env.ALLOWED_DOMAIN ?? 'bravebits.vn').toLowerCase(),
    adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    googleClientId: isLocal && env.DEV_LOGIN === '1' ? env.GOOGLE_CLIENT_ID ?? '' : need('GOOGLE_CLIENT_ID'),
    googleClientSecret: isLocal && env.DEV_LOGIN === '1' ? env.GOOGLE_CLIENT_SECRET ?? '' : need('GOOGLE_CLIENT_SECRET'),
    secureCookies: publicUrl.startsWith('https://'),
    // Đăng nhập không cần Google, CHỈ cho máy local qua http — không thể bật trên production (https).
    devLogin: isLocal && env.DEV_LOGIN === '1',
  }
}
