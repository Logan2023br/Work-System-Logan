import { describe, expect, it } from 'vitest'
import { parseMiniMarkdown } from './miniMarkdown'

describe('parseMiniMarkdown', () => {
  it('đoạn văn, đậm, nghiêng, code', () => {
    expect(parseMiniMarkdown('Gửi **41** tin cho *store Pro*, xem `sheet A`')).toEqual([
      { type: 'p', inl: [{ t: 'text', v: 'Gửi ' }, { t: 'b', v: '41' }, { t: 'text', v: ' tin cho ' }, { t: 'i', v: 'store Pro' }, { t: 'text', v: ', xem ' }, { t: 'code', v: 'sheet A' }] },
    ])
  })

  it('danh sách gạch đầu dòng và nhiều đoạn', () => {
    expect(parseMiniMarkdown('Tuần này:\n- một\n- **hai**\n\nHết')).toEqual([
      { type: 'p', inl: [{ t: 'text', v: 'Tuần này:' }] },
      { type: 'ul', items: [[{ t: 'text', v: 'một' }], [{ t: 'b', v: 'hai' }]] },
      { type: 'p', inl: [{ t: 'text', v: 'Hết' }] },
    ])
  })

  it('HTML/script giữ nguyên là chữ (React sẽ escape)', () => {
    expect(parseMiniMarkdown('<script>alert(1)</script>')).toEqual([{ type: 'p', inl: [{ t: 'text', v: '<script>alert(1)</script>' }] }])
  })

  it('dấu ** không đóng → giữ là chữ', () => {
    expect(parseMiniMarkdown('a ** b')).toEqual([{ type: 'p', inl: [{ t: 'text', v: 'a ** b' }] }])
  })

  it('chuỗi rỗng → không có khối', () => {
    expect(parseMiniMarkdown('  \n ')).toEqual([])
  })
})
