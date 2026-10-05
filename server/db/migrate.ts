import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { migrateDecision } from './migrate-policy.js'

const decision = migrateDecision(process.env)
if (!decision.run) {
  console.log(`Bỏ qua migration: ${decision.reason}`)
  process.exit(0)
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await migrate(drizzle({ client: pool }), { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) })
await pool.end()
console.log('Migration xong')
