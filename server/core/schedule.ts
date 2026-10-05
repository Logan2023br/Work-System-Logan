import { CronExpressionParser } from 'cron-parser'
import { TZ } from './time.js'

export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5 || parts[0] === '') return false
  try {
    CronExpressionParser.parse(expr, { tz: TZ })
    return true
  } catch {
    return false
  }
}

export function nextRunAfter(expr: string, after: Date): Date {
  return CronExpressionParser.parse(expr, { currentDate: after, tz: TZ }).next().toDate()
}

export function previewRuns(expr: string, after: Date, n = 3): Date[] {
  const it = CronExpressionParser.parse(expr, { currentDate: after, tz: TZ })
  return Array.from({ length: n }, () => it.next().toDate())
}
