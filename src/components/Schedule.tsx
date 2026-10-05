import { Fragment, useEffect, useState } from 'react'
import type { SchedulePreview, Task } from '../lib/types'
import { previewCron, savePaused, saveSchedule } from '../lib/data'
import { Switch } from './Bits'
import { tone, TONE_HEX, until, dayAndClock } from '../lib/format'
import { weekSlots } from '../../shared/cronSlots'

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const FROM = 4
const TO = 21

function CronEditor({ task, onDone, onToast }: { task: Task; onDone: () => void; onToast: (m: string) => void }) {
  const [cron, setCron] = useState(task.cron)
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      previewCron(cron).then(setPreview).catch(() => setPreview(null))
    }, 350)
    return () => window.clearTimeout(id)
  }, [cron])

  async function save() {
    setSaving(true)
    try {
      await saveSchedule(task.id, cron)
      onToast(`Đã đổi lịch "${task.name}"`)
      onDone()
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cron-ed">
      <label className="cron-ed__field">
        <span>Cron (giờ Việt Nam)</span>
        <input value={cron} onChange={(e) => setCron(e.target.value)} spellCheck={false} autoFocus />
      </label>
      <div className={`cron-ed__preview${preview && !preview.valid ? ' is-bad' : ''}`} aria-live="polite">
        {!preview ? '…' : !preview.valid ? 'Cron chưa hợp lệ — cần 5 trường, ví dụ 0 9 * * 1-5' : (
          <>
            <b>{preview.label ?? cron}</b>
            <span>Ba lần kế tiếp: {preview.next.map((d) => dayAndClock(d)).join(' · ')}</span>
          </>
        )}
      </div>
      <div className="cron-ed__actions">
        <button className="actbtn" onClick={onDone}>Hủy</button>
        <button className="actbtn actbtn--run" disabled={saving || !preview?.valid || cron === task.cron} onClick={save}>
          {saving ? 'Đang lưu…' : 'Lưu lịch'}
        </button>
      </div>
    </div>
  )
}

export default function Schedule({
  tasks,
  now,
  readOnly,
  onChanged,
  onToast,
}: {
  tasks: Task[]
  now: Date
  readOnly: boolean
  onChanged: () => void
  onToast: (m: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [pausing, setPausing] = useState<Record<string, boolean>>({})

  async function togglePause(t: Task) {
    const next = !(pausing[t.id] ?? t.paused)
    setPausing((s) => ({ ...s, [t.id]: next }))
    try {
      await savePaused(t.id, next)
      onToast(next ? `Đã tạm dừng "${t.name}"` : `"${t.name}" chạy lại theo lịch`)
      onChanged()
    } catch (e) {
      setPausing((s) => ({ ...s, [t.id]: !next }))
      onToast((e as Error).message)
    }
  }
  const today = (now.getDay() + 6) % 7

  return (
    <div className="wrap">
      <header className="pagehead">
        <h1 className="sec">Lịch chạy</h1>
        <p className="sec__note">
          Bảy ngày tới, từ {FROM}:00 đến {TO}:00, theo giờ Việt Nam.{readOnly ? '' : ' Bấm "Sửa lịch" để đổi giờ, công tắc để tạm dừng — Claude áp dụng ở lần Điều phối kế tiếp.'}
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
            weekSlots(task.cron)
              .filter((s) => s.hour >= FROM && s.hour <= TO && !task.paused)
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
      {tasks.map((t) => {
        const paused = pausing[t.id] ?? t.paused
        return (
          <Fragment key={t.id}>
            <div className="job">
              <span className="job__cron">{t.cron}</span>
              <div style={{ minWidth: 0 }}>
                <div className="job__n">
                  {t.name}
                  {!readOnly && (
                    <button className="job__edit" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      {editing === t.id ? 'Đóng' : 'Sửa lịch'}
                    </button>
                  )}
                </div>
                <div className="job__w">{t.scheduleLabel}</div>
              </div>
              <div className="job__r">
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: paused ? 'var(--fg-3)' : 'var(--needs)' }}>
                    {paused ? 'đã tạm dừng' : until(t.nextRun, now)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                    {paused ? '—' : dayAndClock(t.nextRun)}
                  </div>
                </div>
                {!readOnly && <Switch on={!paused} label={`Lịch chạy của ${t.name}`} onToggle={() => togglePause(t)} />}
              </div>
            </div>
            {editing === t.id && (
              <CronEditor
                task={t}
                onDone={() => {
                  setEditing(null)
                  onChanged()
                }}
                onToast={onToast}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
