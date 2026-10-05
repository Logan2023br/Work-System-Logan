// server/db/migrate.ts
import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('Bỏ qua migration: chưa có DATABASE_URL')
  process.exit(0)
}
const pool = new Pool({ connectionString: url })
await migrate(drizzle({ client: pool }), { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) })
await pool.end()
console.log('Migration xong')
