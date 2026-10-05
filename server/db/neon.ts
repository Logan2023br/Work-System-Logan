// server/db/neon.ts
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema.js'
import type { Db } from './types.js'

/** Một Pool dùng chung cho mọi request của một instance function. */
export function createNeonDb(url: string): Db {
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 })
  return drizzle({ client: pool, schema }) as unknown as Db
}
