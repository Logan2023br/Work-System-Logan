import { useState } from 'react'
import type { Task } from '../lib/types'
import { tone, TONE_HEX, until, dayAndClock } from '../lib/format'
import { Switch } from './Bits'

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const FROM = 4
const TO = 21

/** Đọc `m h * * d` — đủ cho các lịch đang dùng, trả về các điểm chạy trong tuần. */
function slots(cron: string): { day: number; hour: number; min: number }[] {
  const [m, h, , , dow] = cron.trim().split(/\s+/)
  const hours = h.split(',').map(Number).filter((n) => !Number.isNaN(n))
  const mins = Number(m) || 0
  // dow theo cron: 0 = CN. Lưới hiển thị bắt đầu từ T2.
  const days = dow === '*' ? [0, 1, 2, 3, 4, 5, 6] : dow.split(',').map((d) => (Number(d) + 6) % 7)
  return days.flatMap((day) => hours.map((hour) => ({ day, hour, min: mins })))
}

export default function Schedule({ tasks, now }: { tasks: Task[]; now: Date }) {
  const [off, setOff] = useState<Record<string, boolean>>({})
  const today = (now.getDay() + 6) % 7

  return (
    <div className="wrap">
      <header className="pagehead">
        <h1 className="sec">Lịch chạy</h1>
        <p className="sec__note">
          Bảy ngày tới, từ {FROM}:00 đến {TO}:00. Tắt một lịch thì task vẫn mở được bằng tay, chỉ là
          không tự chạy nữa.
        </p>
      </header>

      <div className="week">
        <div className="week__hours">
          {Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i).map((hh) => (
            <span
              key={hh}
              className="week__hour"
              style={{ top: `${((hh - FROM) / (TO - FROM)) * 100}%` }}
            >
              {String(hh).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        <div className="week__grid">
          {Array.from({ length: TO - FROM + 1 }, (_, i) => (
            <span key={i} className="week__rule" style={{ top: `${(i / (TO - FROM)) * 100}%` }} />
          ))}
          {DAY_NAMES.map((_, d) => (
            <span
              key={d}
              className={`week__day ${d === today ? 'week__day--today' : ''}`}
              style={{ left: `${(d / 7) * 100}%`, width: `${100 / 7}%` }}
            />
          ))}

          {tasks.flatMap((task) =>
            slots(task.cron)
              .filter((s) => s.hour >= FROM && s.hour <= TO && !off[task.id])
              .map((s, i) => {
                const top = ((s.hour + s.min / 60 - FROM) / (TO - FROM)) * 100
                return (
                  <div
                    key={`${task.id}-${i}`}
                    className="slot fadein"
                    title={`${task.name} — ${String(s.hour).padStart(2, '0')}:${String(s.min).padStart(2, '0')}`}
                    style={{
                      left: `calc(${(s.day / 7) * 100}% + 4px)`,
                      width: `calc(${100 / 7}% - 8px)`,
                      top: `calc(${top}% - 10px)`,
                      background: TONE_HEX[tone(task.state)],
                    }}
                  >
                    {task.index} · {String(s.hour).padStart(2, '0')}:{String(s.min).padStart(2, '0')}
                  </div>
                )
              })
          )}
        </div>
      </div>

      <div className="week__names">
        {DAY_NAMES.map((d, i) => (
          <span key={d} className={`week__name ${i === today ? 'week__name--today' : ''}`}>
            {d}
          </span>
        ))}
      </div>

      <h2 className="sec" style={{ fontSize: 21, margin: '44px 0 16px' }}>
        Từng lịch
      </h2>
      {tasks.map((t) => (
        <div key={t.id} className="job">
          <span className="job__cron">{t.cron}</span>
          <div style={{ minWidth: 0 }}>
            <div className="job__n">{t.name}</div>
            <div className="job__w">{t.scheduleLabel}</div>
          </div>
          <div className="job__r">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: off[t.id] ? 'var(--fg-3)' : 'var(--needs)' }}>
                {off[t.id] ? 'đã tắt' : until(t.nextRun, now)}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                {dayAndClock(t.nextRun)}
              </div>
            </div>
            <Switch
              on={!off[t.id]}
              label={`Lịch chạy của ${t.name}`}
              onToggle={() => setOff((s) => ({ ...s, [t.id]: !s[t.id] }))}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
