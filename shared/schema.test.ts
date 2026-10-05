import { describe, expect, it } from 'vitest'
import { LIMITS, blockSchema, blocksSchema, actionsSchema, taskDefinitionSchema, taskPatchSchema, weeklyReportSchema, byteSize } from './schema.js'

const baseTask = {
  slug: 'upsell-q3',
  name: 'Chiến dịch upsell',
  cron: '30 9,15 * * *',
  instructions: 'Đọc sheet, gửi tin qua Crisp.',
}

describe('LIMITS', () => {
  it('khớp spec mục 5', () => {
    expect(LIMITS.blocks).toBe(12)
    expect(LIMITS.actions).toBe(6)
    expect(LIMITS.taskBytes).toBe(256 * 1024)
  })
})

describe('taskDefinitionSchema', () => {
  it('điền mặc định cho task tối thiểu', () => {
    const t = taskDefinitionSchema.parse(baseTask)
    expect(t.state).toBe('idle')
    expect(t.mode).toBe('auto')
    expect(t.metrics).toEqual([])
    expect(t.report).toBeNull()
    expect(t.blocks).toEqual([])
    expect(t.skill).toBeNull()
  })

  it('từ chối slug có chữ hoa hoặc khoảng trắng', () => {
    expect(taskDefinitionSchema.safeParse({ ...baseTask, slug: 'Upsell Q3' }).success).toBe(false)
  })

  it('từ chối task vượt 256 KB', () => {
    const big = { ...baseTask, blocks: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, type: 'note', title: 'x', data: { text: 'a'.repeat(4000) } })), summary: 'x'.repeat(400) }
    // 12 × 4000 = 48 KB — vẫn hợp lệ
    expect(taskDefinitionSchema.safeParse(big).success).toBe(true)
    const rows = Array.from({ length: 200 }, () => Array.from({ length: 12 }, () => 'y'.repeat(300)))
    const huge = { ...baseTask, blocks: [{ id: 't', type: 'table', title: 'T', data: { columns: Array.from({ length: 12 }, (_, i) => `c${i}`), rows } }] }
    const r = taskDefinitionSchema.safeParse(huge)
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('256 KB')
  })

  it('taskPatchSchema chỉ giữ trường được gửi, không chèn mặc định (dùng cho sua_task)', () => {
    expect(taskPatchSchema.parse({ name: 'Mới' })).toEqual({ name: 'Mới' })
    expect(taskPatchSchema.safeParse({ health: 2 }).success).toBe(false)
  })
})

describe('blockSchema', () => {
  it('nhận đủ 4 loại khối', () => {
    const ok = [
      { id: 'b1', type: 'table', title: 'Bảng', data: { columns: ['A', 'B'], rows: [['x', 1]] } },
      { id: 'b2', type: 'checklist', title: 'Việc', data: { items: [{ text: 'a', done: true }] } },
      { id: 'b3', type: 'chart', title: 'Biểu đồ', data: { kind: 'bar', labels: ['T2', 'T3'], series: [{ name: 'Tin', values: [1, 2] }] } },
      { id: 'b4', type: 'note', title: 'Ghi chú', data: { text: '**đậm**' } },
    ]
    for (const b of ok) expect(blockSchema.safeParse(b).success).toBe(true)
  })

  it('từ chối bảng có dòng lệch số cột', () => {
    const r = blockSchema.safeParse({ id: 'b1', type: 'table', title: 'Bảng', data: { columns: ['A', 'B'], rows: [['x']] } })
    expect(r.success).toBe(false)
  })

  it('từ chối biểu đồ có series lệch số nhãn', () => {
    const r = blockSchema.safeParse({ id: 'c', type: 'chart', title: 'C', data: { kind: 'line', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] } })
    expect(r.success).toBe(false)
  })

  it('từ chối id khối trùng', () => {
    const n = { id: 'x', type: 'note', title: 'a', data: { text: '' } }
    expect(blocksSchema.safeParse([n, n]).success).toBe(false)
  })
})

describe('actionsSchema', () => {
  it('cấm id "run" vì là nút có sẵn', () => {
    expect(actionsSchema.safeParse([{ id: 'run', label: 'Chạy', kind: 'custom', instructions: 'x' }]).success).toBe(false)
  })
  it('giới hạn 6 nút', () => {
    const a = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, label: 'x', kind: 'custom', instructions: 'x' }))
    expect(actionsSchema.safeParse(a).success).toBe(false)
  })
})

describe('byteSize', () => {
  it('đếm byte UTF-8', () => {
    expect(byteSize('ạ')).toBe(5) // "\"ạ\"" = 2 + 3 byte
  })
})

describe('weeklyReportSchema', () => {
  it('nhận weight là một cụm ngắn như dữ liệu thật', () => {
    const r = weeklyReportSchema.safeParse({ week: '2026-W39', summary: 's', next: [{ text: 't', task: 'x', weight: 'KR duy nhất đang đi sai hướng' }] })
    expect(r.success).toBe(true)
  })
})
