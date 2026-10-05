import { describe, expect, it } from 'vitest'
import { weekSlots } from './cronSlots.js'

describe('weekSlots', () => {
  it('giờ và phút đơn lẻ, thứ 6 (lưới bắt đầu từ T2 → index 4)', () => {
    expect(weekSlots('0 16 * * 5')).toEqual([{ day: 4, hour: 16, min: 0 }])
  })
  it('danh sách giờ, mọi ngày', () => {
    expect(weekSlots('30 9,15 * * *')).toHaveLength(14)
  })
  it('khoảng ngày 1-5 → T2..T6', () => {
    expect(weekSlots('0 9 * * 1-5').map((s) => s.day)).toEqual([0, 1, 2, 3, 4])
  })
  it('bước phút */15 trong khoảng giờ 8-18', () => {
    const s = weekSlots('*/15 8-18 * * 1')
    expect(s).toHaveLength(11 * 4)
    expect(s[1]).toEqual({ day: 0, hour: 8, min: 15 })
  })
  it('CN viết là 0 hoặc 7 đều về index 6, không trùng', () => {
    expect(weekSlots('0 8 * * 0,7')).toEqual([{ day: 6, hour: 8, min: 0 }])
  })
  it('trường rác bị bỏ qua, không ném lỗi', () => {
    expect(weekSlots('x y * * *')).toEqual([])
  })
})
