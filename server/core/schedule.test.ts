import { describe, expect, it } from 'vitest'
import { isValidCron, nextRunAfter, previewRuns } from './schedule.js'

describe('isValidCron', () => {
  it.each(['0 16 * * 5', '30 9,15 * * *', '*/15 8-18 * * 1-5'])('nhận %s', (e) => expect(isValidCron(e)).toBe(true))
  it.each(['', 'abc', '61 * * * *', '0 25 * * *', '0 0 * * * *', '* * *'])('từ chối "%s"', (e) => expect(isValidCron(e)).toBe(false))
})

describe('nextRunAfter', () => {
  it('tính theo giờ VN: 16:00 thứ 6 = 09:00Z', () => {
    expect(nextRunAfter('0 16 * * 5', new Date('2026-10-05T03:00:00Z')).toISOString()).toBe('2026-10-09T09:00:00.000Z')
  })
  it('đúng lúc trùng mốc thì lấy mốc kế tiếp', () => {
    expect(nextRunAfter('0 9 * * *', new Date('2026-10-05T02:00:00Z')).toISOString()).toBe('2026-10-06T02:00:00.000Z')
  })
})

describe('previewRuns', () => {
  it('trả 3 lần kế tiếp', () => {
    const r = previewRuns('30 9,15 * * *', new Date('2026-10-05T03:00:00Z'))
    expect(r.map((d) => d.toISOString())).toEqual([
      '2026-10-05T08:30:00.000Z',
      '2026-10-06T02:30:00.000Z',
      '2026-10-06T08:30:00.000Z',
    ])
  })
})
