import { createHash, randomBytes } from 'node:crypto'

export const newToken = (): string => randomBytes(32).toString('base64url')
export const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex')
export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
