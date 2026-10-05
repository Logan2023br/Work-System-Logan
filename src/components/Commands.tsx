import { useState } from 'react'
import type { Command, Task } from '../lib/types'
import { ago, clock } from '../lib/format'

const STEP: Record<Command['status'], number> = { pending: 0, claimed: 1, done: 2, failed: 2, expired: 2, cancelled: 2 }
const WORD: Record<Command['status'], string> = {
  pending: 'Chờ Claude nhận',
  claimed: 'Claude đang làm',
  done: 'Xong',
  failed: 'Lỗi',
  expired: 'Quá hạn — không thấy báo',
  cancelled: 'Đã hủy',
}

export function CommandTickets({
  commands,
  readOnly,
  now,
  onCancel,
}: {
  commands: Command[]
  readOnly: boolean
  now: Date
  onCancel: (id: string) => Promise<void>
}) {
  if (commands.length === 0) return <p className="sec__note">Chưa có lệnh nào. Lệnh bạn gửi từ đây sẽ hiện thành vé và đi qua từng bước khi Claude xử lý.</p>
  return (
    <ol className="tickets">
      {commands.map((c) => {
        const step = STEP[c.status]
        const end = c.status === 'failed' || c.status === 'expired' ? 'bad' : c.status === 'cancelled' ? 'idle' : 'run'
        return (
          <li key={c.id} className={`ticket ticket--${c.status}`}>
            <div className="ticket__head">
              <span className="ticket__label">{c.label}</span>
              <span className="ticket__time">gửi {ago(c.createdAt, now)}</span>
              {!readOnly && c.status === 'pending' && (
                <button className="ticket__cancel" onClick={() => onCancel(c.id)}>
                  Hủy
                </button>
              )}
            </div>
            {c.note && <p className="ticket__note">“{c.note}”</p>}
            <div className="ticket__track" aria-label={WORD[c.status]}>
              {['Gửi', 'Claude nhận', step === 2 ? WORD[c.status] : 'Xong'].map((label, i) => (
                <div key={i} className={`ticket__stop${i < step ? ' is-past' : ''}${i === step ? ` is-now is-${i === 2 ? end : 'run'}` : ''}`}>
                  <span className="ticket__dot" />
                  <span className="ticket__name">{label}</span>
                  <span className="ticket__at">
                    {i === 0 ? clock(c.createdAt) : i === 1 && c.claimedAt ? clock(c.claimedAt) : i === 2 && c.finishedAt ? clock(c.finishedAt) : ''}
                  </span>
                </div>
              ))}
            </div>
            {c.result && step === 2 && <p className="ticket__result">{c.result}</p>}
          </li>
        )
      })}
    </ol>
  )
}

export function ActionBar({ task, onSend }: { task: Task; onSend: (actionId: string, note?: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const actions = [{ id: 'run', label: 'Chạy ngay', kind: 'run' as const }, ...task.actions.map((a) => ({ id: a.id, label: a.label, kind: a.kind }))]
  const [sending, setSending] = useState<string | null>(null)

  async function send(id: string) {
    setSending(id)
    try {
      await onSend(id, note.trim() || undefined)
      setNote('')
      setOpen(false)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="actbar">
      <div className="actbar__row">
        {actions.map((a) => (
          <button key={a.id} className={`actbtn actbtn--${a.kind}`} disabled={sending !== null} onClick={() => send(a.id)}>
            {sending === a.id ? 'Đang gửi…' : a.label}
          </button>
        ))}
        <button className="actbar__note-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Bỏ ghi chú' : '+ Ghi chú cho Claude'}
        </button>
      </div>
      {open && (
        <textarea
          className="actbar__note"
          maxLength={1000}
          placeholder="Ví dụ: chỉ chạy cho store gói Pro, bỏ qua store đã nhận tin tuần này"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
