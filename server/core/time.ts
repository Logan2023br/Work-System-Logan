import type { WeekDTO } from '../../shared/dto.js'

export const TZ = 'Asia/Ho_Chi_Minh'
const OFFSET = 7 * 3_600_000 // Việt Nam không có giờ mùa hè
const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Mốc 00:00 của ngày VN chứa `d`, biểu diễn như thời điểm UTC (để làm toán ngày). */
function vnMidnight(d: Date): number {
  const v = new Date(d.getTime() + OFFSET)
  return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
}

export function vnDate(d: Date): string {
  return ymd(vnMidnight(d))
}

export function vnWeek(now: Date): WeekDTO {
  const day = vnMidnight(now)
  const dow = (new Date(day).getUTCDay() + 6) % 7 // thứ 2 = 0
  const monday = day - dow * DAY
  const sunday = monday + 6 * DAY
  const isoYear = new Date(monday + 3 * DAY).getUTCFullYear()
  const jan4 = Date.UTC(isoYear, 0, 4)
  const week1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY
  const number = 1 + Math.round((monday - week1) / (7 * DAY))

  const a = new Date(monday)
  const b = new Date(sunday)
  const range =
    a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()} – ${b.getUTCDate()} tháng ${b.getUTCMonth() + 1}, ${b.getUTCFullYear()}`
      : `${a.getUTCDate()}/${a.getUTCMonth() + 1} – ${b.getUTCDate()}/${b.getUTCMonth() + 1}, ${b.getUTCFullYear()}`

  return { key: `${isoYear}-W${pad(number)}`, number, label: `Tuần ${number}`, from: ymd(monday), to: ymd(sunday), range }
}

/** Thứ (0 = CN) và số phút trong ngày theo giờ VN. */
export function vnClock(d: Date): { dow: number; minutes: number } {
  const v = new Date(d.getTime() + OFFSET)
  return { dow: v.getUTCDay(), minutes: v.getUTCHours() * 60 + v.getUTCMinutes() }
}
