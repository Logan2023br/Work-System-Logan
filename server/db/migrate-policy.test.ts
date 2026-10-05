import { describe, expect, it } from 'vitest'
import { migrateDecision } from './migrate-policy.js'

describe('migrateDecision', () => {
  it('bỏ qua khi chưa có DATABASE_URL', () => {
    expect(migrateDecision({})).toEqual({ run: false, reason: 'chưa có DATABASE_URL' })
  })
  it('bỏ qua trên bản preview của Vercel (không đụng DB production)', () => {
    expect(migrateDecision({ DATABASE_URL: 'x', VERCEL_ENV: 'preview' }).run).toBe(false)
  })
  it('chạy trên production', () => {
    expect(migrateDecision({ DATABASE_URL: 'x', VERCEL_ENV: 'production' }).run).toBe(true)
  })
  it('chạy khi gọi tay ngoài Vercel', () => {
    expect(migrateDecision({ DATABASE_URL: 'x' }).run).toBe(true)
  })
})
