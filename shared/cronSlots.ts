// Mở một trường cron (dấu sao, danh sách a,b, khoảng a-b, bước n) thành danh sách số.
export function expandField(field: string, min: number, max: number): number[] {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    const [a, b] =
      range === '*' ? [min, max] : range.includes('-') ? range.split('-').map(Number) : [Number(range), stepRaw === undefined ? Number(range) : max]
    if ([a, b, step].some((n) => !Number.isInteger(n)) || step < 1 || a < min || b > max) continue
    for (let v = a; v <= b; v += step) out.add(v)
  }
  return [...out].sort((x, y) => x - y)
}

/** Các điểm chạy trong một tuần của cron 5 trường. `day`: 0 = T2 … 6 = CN. */
export function weekSlots(cron: string): { day: number; hour: number; min: number }[] {
  const [m = '', h = '', , , dow = '*'] = cron.trim().split(/\s+/)
  const mins = expandField(m, 0, 59)
  const hours = expandField(h, 0, 23)
  const days = [...new Set(expandField(dow, 0, 7).map((d) => (d + 6) % 7))].sort((x, y) => x - y)
  return days.flatMap((day) => hours.flatMap((hour) => mins.map((min) => ({ day, hour, min }))))
}
