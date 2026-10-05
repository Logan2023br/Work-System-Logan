import type { Connection, Task } from '../lib/types'
import { Lamp } from './Bits'
import { SourceIcon } from './Icons'

const LABEL: Record<string, string> = {
  connected: 'Đã nối',
  error: 'Lỗi',
  warning: 'Cần xem',
  idle: 'Chưa dùng',
}
const TONE: Record<string, 'run' | 'bad' | 'needs' | 'idle'> = {
  connected: 'run',
  error: 'bad',
  warning: 'needs',
  idle: 'idle',
}

export default function Connections({ connections, tasks }: { connections: Connection[]; tasks: Task[] }) {
  const name = (id: string) => tasks.find((t) => t.id === id)?.name ?? id
  const broken = connections.filter((c) => c.status === 'error' || c.status === 'warning')

  return (
    <div className="wrap">
      <header className="pagehead">
        <h1 className="sec">Kết nối</h1>
        <p className="sec__note">
          {broken.length > 0
            ? `${broken.length} kết nối đang có vấn đề. Mỗi task chỉ chạy được khi tất cả nguồn nó dùng còn sống.`
            : 'Tất cả nguồn dữ liệu đều đang trả lời bình thường.'}
        </p>
      </header>

      <div className="conns">
        {connections.map((c, i) => (
          <div key={c.id} className="conn rise" style={{ animationDelay: `${0.035 * i}s` }}>
            <div className="conn__top">
              <span className="conn__ic">
                <SourceIcon kind={c.kind} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="conn__n">{c.name}</div>
                <div style={{ marginTop: 4 }}>
                  <Lamp tone={TONE[c.status]} label={LABEL[c.status]} />
                </div>
              </div>
            </div>
            <div className="conn__d">{c.detail}</div>
            <div className="conn__used">
              {c.usedBy.length > 0 ? (
                c.usedBy.map((u) => (
                  <span key={u} className="chip">
                    {name(u)}
                  </span>
                ))
              ) : (
                <span className="chip chip--empty">chưa task nào dùng</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
