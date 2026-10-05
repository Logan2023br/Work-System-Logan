// server/db/types.ts
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as schema from './schema.js'

// `any` cho query-result HKT để cùng một kiểu nhận cả PGlite (dev/test) và Neon (production).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>
