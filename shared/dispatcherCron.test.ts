import { describe, expect, it } from 'vitest'
import { dispatcherCron } from './dispatcherCron.js'

describe('dispatcherCron', () => {
  it.each([
    [{ workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '19:00' }, '*/15 8-18 * * 1-5'],
    [{ workDays: [1, 2, 3, 4, 5, 6], workStart: '07:30', workEnd: '20:15' }, '*/15 7-20 * * 1-6'],
    [{ workDays: [1, 3, 5], workStart: '09:00', workEnd: '10:00' }, '*/15 9 * * 1,3,5'],
    [{ workDays: [0, 1, 2, 3, 4, 5, 6], workStart: '08:00', workEnd: '18:00' }, '*/15 8-17 * * *'],
    [{ workDays: [1, 2, 3, 5, 6], workStart: '08:00', workEnd: '18:00' }, '*/15 8-17 * * 1-3,5-6'],
  ])('%j → %s', (w, cron) => expect(dispatcherCron(w)).toBe(cron))
})
