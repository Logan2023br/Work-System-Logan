import { defineConfig } from '@playwright/test'

const PORT = 5174
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: `rm -rf .pglite-e2e && npx tsx server/seed.ts --demo && npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PGLITE_DIR: '.pglite-e2e',
      PUBLIC_URL: `http://localhost:${PORT}`,
      DEV_LOGIN: '1',
      DATABASE_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ADMIN_EMAILS: 'tutnv@bravebits.vn',
    },
  },
})
