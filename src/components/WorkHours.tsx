import { useState } from 'react'
import type { Me } from '../lib/types'
import { saveWorkHours } from '../lib/data'

const DAYS = [
  { d: 1, l: 'T2' }, { d: 2, l: 'T3' }, { d: 3, l: 'T4' }, { d: 4, l: 'T5' }, { d: 5, l: 'T6' }, { d: 6, l: 'T7' }, { d: 0, l: 'CN' },
]

export function WorkHoursEditor({ me, onSaved, onToast }: { me: Me; onSaved: (m: Me) => void; onToast: (m: string) => void }) {
  const [days, setDays] = useState<number[]>(me.workDays)
  const [start, setStart] = useState(me.workStart)
  const [end, setEnd] = useState(me.workEnd)
  const [saving, setSaving] = useState(false)
  const sorted = [...days].sort((a, b) => a - b)
  const dirty = sorted.join() !== [...me.workDays].sort((a, b) => a - b).join() || start !== me.workStart || end !== me.workEnd
  const valid = days.length > 0 && start < end

  async function save() {
    setSaving(true)
    try {
      onSaved(await saveWorkHours({ workDays: sorted, workStart: start, workEnd: end }))
      onToast('Đã lưu khung giờ Điều phối')
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const startH = Number(start.slice(0, 2))
  const endH = Number(end.slice(0, 2)) - (end.endsWith(':00') ? 1 : 0)
  const dow = [...days].sort((a, b) => a - b).join(',')
  const hint = valid ? `Lịch cho tác vụ hẹn giờ "dieu-phoi": mỗi 15 phút (*/15 ${startH}-${endH} * * ${dow})` : ''

  return (
    <section className="hours rise">
      <h2 className="claude__title">Khung giờ Điều phối</h2>
      <p className="claude__lede">Claude kiểm việc mỗi 15 phút trong khung này. Ngoài khung, bàn của bạn hiện "nghỉ ngoài giờ" thay vì báo offline.</p>
      <div className="hours__days" role="group" aria-label="Ngày làm việc">
        {DAYS.map(({ d, l }) => (
          <button
            key={d}
            className="hours__day"
            aria-pressed={days.includes(d)}
            onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="hours__times">
        <label>Từ <input type="time" value={start} onChange={(e) => setStart(e.target.value)} step={900} /></label>
        <label>đến <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} step={900} /></label>
        <button className="actbtn actbtn--run" disabled={!dirty || !valid || saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
      {!valid && <p className="hours__err">Chọn ít nhất một ngày và giờ bắt đầu phải trước giờ kết thúc.</p>}
      {hint && <p className="hours__hint">{hint}</p>}
    </section>
  )
}
