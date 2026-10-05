import { useState } from 'react'
import type { ClaudeLink, Connection, MyConnections, Task } from '../lib/types'
import { ago } from '../lib/format'
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

function ClaudePanel({ claude, onRevoke }: { claude: MyConnections; onRevoke: (id: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const now = new Date()

  async function copy() {
    try {
      await navigator.clipboard.writeText(claude.connectorUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="claude rise">
      <div className="claude__head">
        <h2 className="claude__title">Claude của bạn</h2>
        <span className={`lamp lamp--${claude.links.length ? 'run' : 'idle'}`}>
          <span className="lamp__dot" />
          {claude.links.length ? `${claude.links.length} kết nối` : 'Chưa nối'}
        </span>
      </div>
      <p className="claude__lede">
        Claude desktop → <b>Settings</b> → <b>Connectors</b> → <b>Add custom connector</b>, dán địa chỉ dưới đây rồi đăng nhập Google như bình thường.
      </p>
      <div className="claude__url">
        <code>{claude.connectorUrl}</code>
        <button onClick={copy}>{copied ? 'Đã chép' : 'Chép'}</button>
      </div>
      {claude.links.length > 0 && (
        <ul className="claude__links">
          {claude.links.map((l: ClaudeLink) => (
            <li key={l.id}>
              <div>
                <div className="claude__name">{l.clientName}</div>
                <div className="claude__meta">
                  Nối {ago(l.createdAt, now)} · {l.lastUsedAt ? `dùng gần nhất ${ago(l.lastUsedAt, now)}` : 'chưa gọi lần nào'}
                </div>
              </div>
              <button
                className={`claude__revoke${armed === l.id ? ' claude__revoke--armed' : ''}`}
                onClick={() => (armed === l.id ? onRevoke(l.id).finally(() => setArmed(null)) : setArmed(l.id))}
                onBlur={() => setArmed((a) => (a === l.id ? null : a))}
              >
                {armed === l.id ? 'Bấm lần nữa để ngắt' : 'Ngắt kết nối'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Connections({
  connections,
  tasks,
  claude,
  onRevoke,
}: {
  connections: Connection[]
  tasks: Task[]
  claude: MyConnections | null
  onRevoke: (id: string) => Promise<void>
}) {
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

      {claude && <ClaudePanel claude={claude} onRevoke={onRevoke} />}

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
