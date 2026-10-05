import { describe, expect, it } from 'vitest'
import { describeCron } from './cronText.js'

describe('describeCron', () => {
  it.each([
    ['0 16 * * 5', '16:00 · T6'],
    ['30 9,15 * * *', '09:30 và 15:30 · mỗi ngày'],
    ['0 9 * * 1-5', '09:00 · T2–T6'],
    ['0 8 * * 0,6', '08:00 · T7, CN'],
    ['0 6,12,18 * * 1,3,5', '06:00, 12:00 và 18:00 · T2, T4, T6'],
    ['*/15 8-18 * * 1-5', 'mỗi 15 phút, 08:00–18:59 · T2–T6'],
    ['0 * * * *', 'mỗi giờ, phút 00 · mỗi ngày'],
  ])('%s → %s', (e, t) => expect(describeCron(e)).toBe(t))

  it('có ngày-trong-tháng hoặc tháng → null (hiển thị cron thô)', () => {
    expect(describeCron('0 9 1 * *')).toBeNull()
    expect(describeCron('0 9 * 3 *')).toBeNull()
  })

  it('cron sai → null', () => {
    expect(describeCron('x')).toBeNull()
    expect(describeCron('0 25 * * *')).toBeNull()
  })
})
