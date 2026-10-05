import { useState } from 'react'
import type { Person, TaskState } from '../lib/types'
import { ago, tone } from '../lib/format'
import { Lamp } from './Bits'

const ORDER: TaskState[] = ['blocked', 'needs-you', 'running', 'healthy', 'idle']
const STATE_WORD: Record<TaskState, string> = { blocked: 'lỗi', 'needs-you': 'chờ duyệt', running: 'đang chạy', healthy: 'ổn', idle: 'nằm chờ' }

function presenceText(p: Person, now: Date): string {
  if (!p.active) return 'Đã rời team'
  if (p.presence === 'online') return 'Claude đang trực'
  if (p.presence === 'never') return 'Chưa nối Claude'
  return `Claude offline · ${ago(p.lastSeenAt, now)}`
}

function Ring({ value }: { value: number | null }) {
  const r = 22
  const c = 2 * Math.PI * r
  const v = value ?? 0
  const t = value === null ? 'idle' : v >= 0.75 ? 'run' : v >= 0.45 ? 'needs' : 'bad'
  return (
    <svg className="ring" width="56" height="56" viewBox="0 0 56 56" aria-label={value === null ? 'Chưa có task' : `Sức khỏe ${Math.round(v * 100)}%`}>
      <circle cx="28" cy="28" r={r} className="ring__track" />
      <circle
        cx="28" cy="28" r={r}
        className={`ring__value ring__value--${t}`}
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" className="ring__label">{value === null ? '—' : Math.round(v * 100)}</text>
    </svg>
  )
}

export default function Team({
  people,
  meId,
  now,
  onVisit,
  isAdmin,
  onDeactivate,
}: {
  people: Person[]
  meId: string
  now: Date
  onVisit: (id: string) => void
  isAdmin: boolean
  onDeactivate: (id: string) => Promise<void>
}) {
  const [armed, setArmed] = useState<string | null>(null)
  const active = people.filter((p) => p.active)
  const online = active.filter((p) => p.presence === 'online').length
  const attention = active.filter((p) => p.attention).length

  return (
    <div className="wrap">
      <header className="hero">
        <h1 className="hero__line rise">
          <em>{online}</em> trên {active.length} Claude đang trực
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          {attention > 0 ? `${attention} người đang có việc cần quyết. Bấm vào ai để xem toàn bộ bàn của người đó.` : 'Không ai đang bị chặn. Bấm vào ai để xem toàn bộ bàn của người đó.'}
        </p>
      </header>

      <div className="team">
        {people.map((p, i) => (
          <div key={p.id} className={`mate rise${p.active ? '' : ' mate--gone'}`} style={{ animationDelay: `${0.04 * i}s` }}>
            <div className="mate__top">
              <span className={`avatar avatar--lg presence presence--${p.active ? p.presence : 'never'}`}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" /> : p.name[0]}
              </span>
              <div className="mate__who">
                <div className="mate__name">
                  {/* Nút thật, phủ cả thẻ bằng ::after — thẻ bấm được bằng chuột lẫn bàn phím, không lồng nút trong nút. */}
                  <button className="mate__open" onClick={() => onVisit(p.id)} aria-label={`Mở bàn của ${p.name}`}>
                    {p.name}
                  </button>
                  {p.id === meId && <span className="mate__me">bạn</span>}
                </div>
                <div className="mate__presence">{presenceText(p, now)}</div>
              </div>
              <Ring value={p.health} />
            </div>

            <div className="mate__bar" aria-hidden="true">
              {ORDER.flatMap((s) => Array.from({ length: p.counts[s] }, (_, k) => <span key={`${s}${k}`} className={`mate__seg mate__seg--${tone(s)}`} />))}
            </div>
            <div className="mate__counts">
              {p.taskCount === 0
                ? 'Chưa có task'
                : ORDER.filter((s) => p.counts[s] > 0).map((s) => `${p.counts[s]} ${STATE_WORD[s]}`).join(' · ')}
            </div>

            <div className="mate__focus">
              {p.attention ? (
                <>
                  <Lamp tone={tone(p.attention.state)} label={p.attention.stateLabel || STATE_WORD[p.attention.state]} />
                  <span className="mate__task">{p.attention.taskName}</span>
                </>
              ) : (
                <span className="mate__calm">Không có gì cần chú ý</span>
              )}
            </div>
            {isAdmin && p.active && p.id !== meId && (
              <button
                className={`mate__admin${armed === p.id ? ' is-armed' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (armed === p.id) onDeactivate(p.id).finally(() => setArmed(null))
                  else setArmed(p.id)
                }}
                onBlur={() => setArmed((a) => (a === p.id ? null : a))}
              >
                {armed === p.id ? 'Bấm lần nữa: khóa tài khoản và ngắt mọi Claude' : 'Vô hiệu hóa'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
