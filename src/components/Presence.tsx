import type { Person } from '../lib/types'
import { ago, clock } from '../lib/format'

export function PresenceBar({ owner, isMine, now, onConnect }: { owner: Person; isMine: boolean; now: Date; onConnect: () => void }) {
  const who = isMine ? 'Claude của bạn' : `Claude của ${owner.name}`
  const next = owner.nextDispatchAt ? `Điều phối kế tiếp khoảng ${clock(owner.nextDispatchAt)}` : ''
  const map = {
    online: { tone: 'run', text: `${who} đang trực`, sub: next },
    offline: { tone: 'bad', text: `${who} offline từ ${owner.lastSeenAt ? clock(owner.lastSeenAt) : '—'}`, sub: 'Lệnh mới sẽ nằm chờ tới khi máy và Claude desktop mở lại.' },
    resting: { tone: 'idle', text: `${who} nghỉ ngoài giờ`, sub: owner.lastSeenAt ? `Liên lạc lần cuối ${ago(owner.lastSeenAt, now)} · ${next}` : next },
    never: { tone: 'needs', text: `${who} chưa nối`, sub: isMine ? 'Nối Claude desktop để task tự chạy và báo kết quả lên đây.' : '' },
  } as const
  const s = map[owner.presence]
  return (
    <div className={`presence-bar presence-bar--${s.tone}`} role="status">
      <span className={`lamp lamp--${s.tone}`}>
        <span className="lamp__dot" />
      </span>
      <span className="presence-bar__text">{s.text}</span>
      {s.sub && <span className="presence-bar__sub">{s.sub}</span>}
      {isMine && owner.presence === 'never' && (
        <button className="presence-bar__cta" onClick={onConnect}>
          Hướng dẫn nối
        </button>
      )}
    </div>
  )
}
