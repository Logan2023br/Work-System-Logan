import { expandField } from './cronSlots.js'

const DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (n: number) => String(n).padStart(2, '0')
const joinVi = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} và ${xs.at(-1)}`)

function days(field: string): string | null {
  if (field === '*') return 'mỗi ngày'
  const ds = [...new Set(expandField(field, 0, 7).map((d) => d % 7))]
  if (ds.length === 0) return null
  if (ds.length === 7) return 'mỗi ngày'
  // Sắp T2 → CN
  const order = ds.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const contiguous = order.length >= 3 && order.every((d, i) => i === 0 || (order[i - 1] + 1) % 7 === d)
  return contiguous ? `${DAY[order[0]]}–${DAY[order.at(-1)!]}` : order.map((d) => DAY[d]).join(', ')
}

/** Mô tả tiếng Việt cho cron 5 trường thường gặp; null khi không mô tả gọn được (giao diện hiện cron thô). */
export function describeCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, dom, mon, dow] = parts
  if (dom !== '*' || mon !== '*') return null
  const mins = expandField(m, 0, 59)
  const hours = expandField(h, 0, 23)
  const d = days(dow)
  if (!mins.length || !hours.length || !d) return null
  if ((m !== '*' && !/^\d/.test(m)) || m.includes('/')) {
    const step = Number(m.split('/')[1])
    if (m.startsWith('*/') && step > 0) {
      const contiguous = hours.every((hh, i) => i === 0 || hh === hours[i - 1] + 1)
      return contiguous
        ? `mỗi ${step} phút, ${pad(hours[0])}:00–${pad(hours.at(-1)!)}:59 · ${d}`
        : `mỗi ${step} phút trong các giờ ${hours.map(pad).join(', ')} · ${d}`
    }
  }
  if (h === '*' && mins.length === 1) return `mỗi giờ, phút ${pad(mins[0])} · ${d}`
  const times = hours.flatMap((hh) => mins.map((mm) => `${pad(hh)}:${pad(mm)}`))
  if (times.length > 6) return `${times.length} lần mỗi ngày · ${d}`
  return `${joinVi(times)} · ${d}`
}
