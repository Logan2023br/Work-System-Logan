/** Chỉ migrate DB production từ bản build production; bản preview không được đụng vào schema thật. */
export function migrateDecision(env: Record<string, string | undefined>): { run: boolean; reason: string } {
  if (!env.DATABASE_URL) return { run: false, reason: 'chưa có DATABASE_URL' }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return { run: false, reason: `bản ${env.VERCEL_ENV} không chạy migration` }
  return { run: true, reason: 'ok' }
}
