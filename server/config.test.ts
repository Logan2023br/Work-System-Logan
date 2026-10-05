import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

const base = { PUBLIC_URL: 'http://localhost:5173', GOOGLE_CLIENT_ID: 'i', GOOGLE_CLIENT_SECRET: 's' }

describe('loadConfig — đăng nhập dev', () => {
  it('bật trên localhost khi DEV_LOGIN=1', () => {
    expect(loadConfig({ ...base, DEV_LOGIN: '1' }).devLogin).toBe(true)
  })
  it('không bật với host giả dạng localhost', () => {
    expect(loadConfig({ ...base, PUBLIC_URL: 'http://localhost.evil.com', DEV_LOGIN: '1' }).devLogin).toBe(false)
  })
  it('từ chối khởi động nếu DEV_LOGIN được đặt trên Vercel', () => {
    expect(() => loadConfig({ ...base, DEV_LOGIN: '1', VERCEL: '1' })).toThrow(/DEV_LOGIN/)
  })
  it('từ chối khởi động nếu DEV_LOGIN được đặt khi NODE_ENV=production', () => {
    expect(() => loadConfig({ ...base, DEV_LOGIN: '1', NODE_ENV: 'production' })).toThrow(/DEV_LOGIN/)
  })
})
