import { describe, expect, it } from 'vitest'
import { LIMITS } from './schema.js'

describe('LIMITS', () => {
  it('khớp spec mục 5', () => {
    expect(LIMITS.blocks).toBe(12)
    expect(LIMITS.actions).toBe(6)
    expect(LIMITS.taskBytes).toBe(256 * 1024)
  })
})
