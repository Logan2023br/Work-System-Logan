import type { Presence } from '../../shared/dto.js'
import { vnClock } from './time.js'

export const ONLINE_WINDOW_MS = 30 * 60_000
export const DISPATCH_STEP_MIN = 15

export interface WorkWindow {
  workDays: number[]
  workStart: string
  workEnd: string
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function inWorkHours(u: WorkWindow, at: Date): boolean {
  const { dow, minutes } = vnClock(at)
  return u.workDays.includes(dow) && minutes >= toMin(u.workStart) && minutes < toMin(u.workEnd)
}

export function presenceOf(u: WorkWindow & { lastSeenAt: Date | null }, now: Date): Presence {
  if (!u.lastSeenAt) return 'never'
  if (now.getTime() - u.lastSeenAt.getTime() <= ONLINE_WINDOW_MS) return 'online'
  return inWorkHours(u, now) ? 'offline' : 'resting'
}

/** Mốc 15 phút gần nhất (≥ now) nằm trong khung giờ làm việc; tìm tối đa 8 ngày. */
export function nextDispatchAt(u: WorkWindow, now: Date): Date | null {
  if (u.workDays.length === 0) return null
  const step = DISPATCH_STEP_MIN * 60_000
  let t = Math.ceil(now.getTime() / step) * step
  const limit = now.getTime() + 8 * 86_400_000
  for (; t <= limit; t += step) if (inWorkHours(u, new Date(t))) return new Date(t)
  return null
}
