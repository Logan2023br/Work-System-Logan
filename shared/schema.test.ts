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
import { runReportSchema, weeklyReportInputSchema, zodMessage } from './schema.js'

describe('runReportSchema', () => {
  it('mặc định note rỗng, log rỗng; trường cập nhật đều tùy chọn', () => {
    expect(runReportSchema.parse({ slug: 'a', status: 'ok' })).toEqual({ slug: 'a', status: 'ok', note: '', log: [] })
  })
  it('từ chối log quá 200 dòng hoặc dòng quá 500 ký tự', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', log: Array(201).fill('x') }).success).toBe(false)
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', log: ['x'.repeat(501)] }).success).toBe(false)
  })
  it('từ chối status lạ', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'done' }).success).toBe(false)
  })
})

describe('weeklyReportInputSchema', () => {
  it('week tùy chọn', () => {
    expect(weeklyReportInputSchema.parse({ summary: 's' }).week).toBeUndefined()
  })
})

describe('zodMessage', () => {
  it('ghi rõ đường dẫn trường', () => {
    const r = runReportSchema.safeParse({ slug: 'A B', status: 'ok' })
    expect(r.success).toBe(false)
    expect(zodMessage(r.error!)).toMatch(/^slug: /)
  })
})
import { commandInputSchema, workHoursSchema } from './schema.js'

describe('giới hạn biểu đồ', () => {
  it('tối đa 3 series (giới hạn bảng màu an toàn cho mù màu)', () => {
    const s = (name: string) => ({ name, values: [1, 2] })
    const chart = (n: number) => ({ id: 'c', type: 'chart', title: 'C', data: { kind: 'line', labels: ['a', 'b'], series: Array.from({ length: n }, (_, i) => s(`s${i}`)) } })
    expect(blockSchema.safeParse(chart(3)).success).toBe(true)
    expect(blockSchema.safeParse(chart(4)).success).toBe(false)
  })
})

describe('runReportSchema.leaseId', () => {
  it('nhận uuid, từ chối chuỗi rác', () => {
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', leaseId: '6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f' }).success).toBe(true)
    expect(runReportSchema.safeParse({ slug: 'a', status: 'ok', leaseId: 'abc' }).success).toBe(false)
  })
})

describe('commandInputSchema', () => {
  it('ghi chú tối đa 1000 ký tự', () => {
    expect(commandInputSchema.safeParse({ actionId: 'run', note: 'x'.repeat(1000) }).success).toBe(true)
    expect(commandInputSchema.safeParse({ actionId: 'run', note: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('workHoursSchema', () => {
  it('nhận khung giờ hợp lệ', () => {
    expect(workHoursSchema.safeParse({ workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }).success).toBe(true)
  })
  it.each([
    [{ workDays: [], workStart: '08:00', workEnd: '19:00' }],
    [{ workDays: [1], workStart: '19:00', workEnd: '08:00' }],
    [{ workDays: [1], workStart: '8:00', workEnd: '19:00' }],
    [{ workDays: [1, 1], workStart: '08:00', workEnd: '19:00' }],
    [{ workDays: [7], workStart: '08:00', workEnd: '19:00' }],
  ])('từ chối %j', (v) => expect(workHoursSchema.safeParse(v).success).toBe(false))
})
