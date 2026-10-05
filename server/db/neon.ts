import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema.js'
import type { Db } from './types.js'

/** Pool dùng chung cho mọi request của một instance. Socket rảnh có thể chết khi Vercel/Neon tạm dừng — chỉ ghi log, không để tiến trình sập. */
export function createNeonPool(url: string): Pool {
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 })
  pool.on('error', (e: Error) => console.error('[neon] kết nối rảnh bị lỗi', e))
  return pool
}

export function createNeonDb(url: string): Db {
  return drizzle({ client: createNeonPool(url), schema }) as unknown as Db
}
