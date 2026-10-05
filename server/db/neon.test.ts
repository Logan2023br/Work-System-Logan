import { describe, expect, it } from 'vitest'
import { createNeonPool } from './neon.js'

describe('createNeonPool', () => {
  it('lỗi socket rảnh của pool không làm sập tiến trình', () => {
    const pool = createNeonPool('postgres://u:p@localhost:5432/db')
    expect(() => pool.emit('error', new Error('socket chết'))).not.toThrow()
  })
})
