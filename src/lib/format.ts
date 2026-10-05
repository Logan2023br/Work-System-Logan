import type { TaskState } from './types'

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function clock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function dayAndClock(iso: string): string {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${clock(iso)}`
}

export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** "2 giờ trước", "hôm qua" — mốc thời gian tương đối, tiếng Việt. */
export function ago(iso: string, now: Date): string {
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
export function until(iso: string, now: Date): string {
  const secs = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  if (secs <= 0) return 'đang tới'
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
