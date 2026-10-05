import { describe, expect, it } from 'vitest'
import { filterItems, normalizeVi } from './search'

const items = [
  { id: '1', label: 'Báo cáo tuần BOO X LOGAN', hint: 'Task' },
  { id: '2', label: 'Chiến dịch upsell Q3/2026', hint: 'Task' },
  { id: '3', label: 'Đội ngũ', hint: 'Mục' },
  { id: '4', label: 'Bình (demo)', hint: 'Đồng nghiệp' },
]

describe('normalizeVi', () => {
  it('bỏ dấu, đ → d, chữ thường', () => {
    expect(normalizeVi('Đội Ngũ Báo Cáo')).toBe('doi ngu bao cao')
  })
})

describe('filterItems', () => {
  it('tìm không dấu', () => {
    expect(filterItems(items, 'bao cao').map((i) => i.id)).toEqual(['1'])
    expect(filterItems(items, 'doi ngu').map((i) => i.id)).toEqual(['3'])
  })
  it('tìm theo nhiều từ không theo thứ tự, theo cả gợi ý', () => {
    expect(filterItems(items, 'q3 upsell').map((i) => i.id)).toEqual(['2'])
    expect(filterItems(items, 'dong nghiep').map((i) => i.id)).toEqual(['4'])
  })
  it('ưu tiên khớp đầu nhãn; rỗng → trả tất cả theo giới hạn', () => {
    expect(filterItems(items, 'b')[0].id).toBe('1')
    expect(filterItems(items, '', 2)).toHaveLength(2)
  })
})
