// server/db/pglite.ts
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from './schema.js'
import type { Db } from './types.js'

const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url))

/** Postgres trong tiến trình cho dev và test. Không truyền dataDir → chỉ trong bộ nhớ. */
export async function openPglite(dataDir?: string): Promise<Db> {
  const db = drizzle({ client: new PGlite(dataDir), schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return db as unknown as Db
}
