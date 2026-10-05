import type { TaskState } from './types'

const TZ = 'Asia/Ho_Chi_Minh'
const parts = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  )
  return { wd: p.weekday as string, d: p.day as string, m: p.month as string, hh: p.hour as string, mm: p.minute as string }
}
const WD: Record<string, string> = { Sun: 'CN', Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7' }

export function clock(iso: string): string {
  const p = parts(iso)
  return `${p.hh}:${p.mm}`
}

export function dayAndClock(iso: string | null): string {
  if (!iso) return 'chưa có lịch'
  const p = parts(iso)
  return `${WD[p.wd]} ${p.d}/${p.m} · ${p.hh}:${p.mm}`
}

export function shortDate(iso: string): string {
  const p = parts(iso.length === 10 ? `${iso}T12:00:00+07:00` : iso)
  return `${p.d}/${p.m}`
}

/** "2 giờ trước", "hôm qua" — mốc thời gian tương đối, tiếng Việt. */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return 'chưa chạy lần nào'
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'hôm qua'
  return `${days} ngày trước`
}

/** Đếm ngược tới lần chạy kế tiếp. */
export function until(iso: string | null, now: Date): string {
  if (!iso) return '—'
  const secs = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  if (secs <= 0) return 'đến hạn'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}n ${h}g`
  if (h > 0) return `${h}g ${String(m).padStart(2, '0')}p`
  return `${m}p ${String(s).padStart(2, '0')}s`
}

/** Màu là trạng thái, không phải trang trí. */
export function tone(state: TaskState): 'needs' | 'run' | 'bad' | 'idle' {
  if (state === 'needs-you') return 'needs'
  if (state === 'running' || state === 'healthy') return 'run'
  if (state === 'blocked') return 'bad'
  return 'idle'
}

export const TONE_HEX: Record<'needs' | 'run' | 'bad' | 'idle', string> = {
  needs: '#ffb01f',
  run: '#00c2a8',
  bad: '#ff5c4d',
  idle: '#7787a3',
}
