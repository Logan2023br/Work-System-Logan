import { describe, expect, it } from 'vitest'
import { inWorkHours, nextDispatchAt, presenceOf } from './presence.js'

const win = { workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }
const at = (iso: string) => new Date(iso)

describe('inWorkHours (giờ VN)', () => {
  it.each([
    ['2026-10-05T03:00:00Z', true], // T2 10:00
    ['2026-10-05T01:00:00Z', true], // T2 08:00 (biên đầu tính)
    ['2026-10-05T12:00:00Z', false], // T2 19:00 (biên cuối không tính)
    ['2026-10-05T00:59:00Z', false], // T2 07:59
    ['2026-10-10T03:00:00Z', false], // T7
    ['2026-10-04T18:30:00Z', false], // CN 23:59 UTC… = T2 01:30 VN → ngoài giờ
  ])('%s → %s', (iso, ok) => expect(inWorkHours(win, at(iso))).toBe(ok))
})

describe('presenceOf', () => {
  const now = at('2026-10-05T03:00:00Z')
  it('online trong 30 phút', () => {
    expect(presenceOf({ ...win, lastSeenAt: new Date(now.getTime() - 29 * 60_000) }, now)).toBe('online')
  })
  it('quá 30 phút trong giờ làm → offline', () => {
    expect(presenceOf({ ...win, lastSeenAt: new Date(now.getTime() - 31 * 60_000) }, now)).toBe('offline')
  })
  it('quá 30 phút nhưng ngoài giờ → resting', () => {
    const evening = at('2026-10-05T12:30:00Z') // 19:30
    expect(presenceOf({ ...win, lastSeenAt: at('2026-10-05T11:50:00Z') }, evening)).toBe('resting')
  })
  it('chưa từng nối → never', () => {
    expect(presenceOf({ ...win, lastSeenAt: null }, now)).toBe('never')
  })
})

describe('nextDispatchAt', () => {
  it('làm tròn lên bước 15 phút trong giờ làm', () => {
    expect(nextDispatchAt(win, at('2026-10-05T03:07:00Z'))?.toISOString()).toBe('2026-10-05T03:15:00.000Z')
  })
  it('đúng mốc thì là chính mốc đó', () => {
    expect(nextDispatchAt(win, at('2026-10-05T03:15:00Z'))?.toISOString()).toBe('2026-10-05T03:15:00.000Z')
  })
  it('sau giờ làm → 08:00 ngày làm kế tiếp', () => {
    expect(nextDispatchAt(win, at('2026-10-05T11:50:00Z'))?.toISOString()).toBe('2026-10-06T01:00:00.000Z')
  })
  it('tối thứ 6 → 08:00 thứ 2', () => {
    expect(nextDispatchAt(win, at('2026-10-09T12:00:00Z'))?.toISOString()).toBe('2026-10-12T01:00:00.000Z')
  })
})
