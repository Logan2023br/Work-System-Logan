import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../skills/', import.meta.url)
const names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

function frontmatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md)
  if (!m) return {}
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
}

describe('bộ skill Work System', () => {
  it('có đủ 3 skill', () => {
    expect(names.sort()).toEqual(['bao-cao-tuan', 'dieu-phoi', 'tao-task'])
  })

  it.each(names)('%s: frontmatter hợp lệ cho claude.ai', (n) => {
    const fm = frontmatter(readFileSync(new URL(`${n}/SKILL.md`, root), 'utf8'))
    expect(fm.name).toBe(n)
    expect(fm.name).toMatch(/^[a-z0-9-]{1,64}$/)
    expect(fm.description.length).toBeGreaterThan(20)
    expect(fm.description.length).toBeLessThanOrEqual(200)
  })

  it('dieu-phoi bắt buộc gọi dieu_phoi và luôn báo kết quả kèm leaseId', () => {
    const md = readFileSync(new URL('dieu-phoi/SKILL.md', root), 'utf8')
    for (const s of ['dieu_phoi', 'bao_ket_qua', 'leaseId']) expect(md).toContain(s)
  })

  it('tao-task dùng tao_task và cấm ghi bí mật', () => {
    const md = readFileSync(new URL('tao-task/SKILL.md', root), 'utf8')
    expect(md).toContain('tao_task')
    expect(md).toMatch(/mật khẩu|API key/)
  })

  it('bao-cao-tuan dùng xem_task và nop_bao_cao_tuan', () => {
    const md = readFileSync(new URL('bao-cao-tuan/SKILL.md', root), 'utf8')
    expect(md).toContain('xem_task')
    expect(md).toContain('nop_bao_cao_tuan')
  })
})
