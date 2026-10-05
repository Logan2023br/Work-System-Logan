import { describe, expect, it } from 'vitest'
import { vnDate, vnWeek } from './time.js'

describe('vnWeek', () => {
  it('thứ 2 5/10/2026 là tuần 41', () => {
    const w = vnWeek(new Date('2026-10-05T03:00:00Z'))
    expect(w).toEqual({ key: '2026-W41', number: 41, label: 'Tuần 41', from: '2026-10-05', to: '2026-10-11', range: '5 – 11 tháng 10, 2026' })
  })

  it('dùng giờ VN: 18:00Z chủ nhật 4/10 đã là thứ 2 ở VN', () => {
    expect(vnWeek(new Date('2026-10-04T18:00:00Z')).key).toBe('2026-W41')
    expect(vnWeek(new Date('2026-10-04T16:59:00Z')).key).toBe('2026-W40')
  })

  it('tuần vắt qua hai tháng', () => {
    expect(vnWeek(new Date('2026-09-30T05:00:00Z')).range).toBe('28/9 – 4/10, 2026')
  })

  it('1/1/2027 thuộc tuần 53 của 2026', () => {
    expect(vnWeek(new Date('2027-01-01T05:00:00Z')).key).toBe('2026-W53')
  })

  it('khớp dữ liệu mẫu: 21–27/9/2026 là tuần 39', () => {
    expect(vnWeek(new Date('2026-09-23T05:00:00Z')).range).toBe('21 – 27 tháng 9, 2026')
    expect(vnWeek(new Date('2026-09-23T05:00:00Z')).number).toBe(39)
  })
})

describe('vnDate', () => {
  it('đổi sang ngày VN', () => {
    expect(vnDate(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05')
  })
})
import { weekFromKey } from './time.js'

describe('weekFromKey', () => {
  it('2026-W40 → 28/9 – 4/10', () => {
    expect(weekFromKey('2026-W40')).toMatchObject({ key: '2026-W40', number: 40, range: '28/9 – 4/10, 2026' })
  })
  it('khóa sai → null', () => {
    expect(weekFromKey('2026-40')).toBeNull()
    expect(weekFromKey('2026-W60')).toBeNull()
  })
})
