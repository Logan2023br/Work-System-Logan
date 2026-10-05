function compress(days: number[]): string {
  const out: string[] = []
  for (let i = 0; i < days.length; i += 1) {
    let j = i
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1
    out.push(j > i ? `${days[i]}-${days[j]}` : String(days[i]))
    i = j
  }
  return out.join(',')
}

/** Cron cho tác vụ hẹn giờ "dieu-phoi": mỗi 15 phút trong khung giờ làm việc (giờ VN). Giờ kết thúc không tính. */
export function dispatcherCron(w: { workDays: number[]; workStart: string; workEnd: string }): string {
  const sh = Number(w.workStart.slice(0, 2))
  const eh = Number(w.workEnd.slice(0, 2))
  const last = Number(w.workEnd.slice(3, 5)) > 0 ? eh : eh - 1
  const hours = sh >= last ? String(sh) : `${sh}-${last}`
  const days = [...new Set(w.workDays)].sort((a, b) => a - b)
  return `*/15 ${hours} * * ${days.length === 7 ? '*' : compress(days)}`
}
