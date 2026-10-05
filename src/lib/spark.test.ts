import { describe, expect, it } from 'vitest'
import { sparkGeometry } from './spark'

describe('sparkGeometry', () => {
  it('dưới 2 điểm → null (không vẽ biểu đồ hỏng)', () => {
    expect(sparkGeometry([], 100, 30)).toBeNull()
    expect(sparkGeometry([5], 100, 30)).toBeNull()
  })
  it('đường đi và điểm cuối là số hữu hạn', () => {
    const g = sparkGeometry([1, 3, 2], 100, 30)!
    expect(g.path.startsWith('M0.00,')).toBe(true)
    expect(g.path).not.toContain('NaN')
    expect(g.last[0]).toBe(100)
    expect(Number.isFinite(g.last[1])).toBe(true)
  })
})
