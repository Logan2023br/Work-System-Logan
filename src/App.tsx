import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace, Task } from './lib/types'
import { loadWorkspace } from './lib/data'
import { clock } from './lib/format'
import Desk from './components/Desk'
import TaskSpace from './components/TaskSpace'
import Schedule from './components/Schedule'
import Connections from './components/Connections'
import Reflect from './components/Reflect'
import { IconDesk, IconClock, IconPlug, IconThink } from './components/Icons'

type View = 'desk' | 'schedule' | 'connections' | 'reflect'

const NAV: { id: View; label: string; Icon: () => ReactElement }[] = [
  { id: 'desk', label: 'Bàn điều phối', Icon: IconDesk },
  { id: 'schedule', label: 'Lịch chạy', Icon: IconClock },
  { id: 'connections', label: 'Kết nối', Icon: IconPlug },
  { id: 'reflect', label: 'Nhìn lại tuần', Icon: IconThink },
]

export default function App() {
  const [ws, setWs] = useState<Workspace | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<View>('desk')
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)
  const [now, setNow] = useState(new Date())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    loadWorkspace().then(setWs).catch((e: Error) => setErr(e.message))
  }, [])

  // Khoảnh khắc bàn khởi động — chạy đúng một lần.
  useEffect(() => {
    if (!ws) return
    const id = window.setTimeout(() => setBooted(true), 90)
    return () => window.clearTimeout(id)
  }, [ws])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  if (err) {
    return (
      <div className="loading" style={{ color: 'var(--bad)', textAlign: 'center', padding: 24 }}>
        {err}
        <br />
        <span style={{ color: 'var(--fg-3)' }}>Kiểm tra lại các file trong public/data.</span>
      </div>
    )
  }
  if (!ws) return <div className="loading">đang đọc dữ liệu…</div>

  const waiting = ws.tasks.filter((t) => t.state === 'needs-you' || t.state === 'blocked').length
  const task = openTask ? ws.tasks.find((t) => t.id === openTask) ?? null : null

  function go(v: View) {
    setOpenTask(null)
    setView(v)
  }

  function fire(t: Task) {
    setToast(
      t.action.kind === 'review'
        ? `Mở phần chờ duyệt của ${t.name}`
        : t.action.kind === 'fix'
          ? `Mở nhật ký lỗi của ${t.name}`
          : `${t.name} bắt đầu chạy`
    )
  }

  return (
    <div className="shell">
      <nav className="rail" aria-label="Khu vực">
        <div className="rail__mark">L</div>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="rail__btn"
            aria-current={view === id && !task ? 'page' : undefined}
            aria-label={label}
            onClick={() => go(id)}
          >
            <Icon />
            {id === 'desk' && waiting > 0 && <span className="rail__badge">{waiting}</span>}
            <span className="rail__tip">{label}</span>
          </button>
        ))}
        <div className="rail__spacer" />
        <button className="rail__btn" aria-label={ws.registry.owner.name}>
          <span
            style={{
              width: 27,
              height: 27,
              borderRadius: 9,
              background: 'var(--ink-high)',
              border: '1px solid var(--line)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--fg-2)',
            }}
          >
            {ws.registry.owner.name[0]}
          </span>
          <span className="rail__tip">
            {ws.registry.owner.name} · {ws.registry.owner.team}
          </span>
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <span className="topbar__title">Bàn điều phối</span>
          <span className="topbar__sub">
            {ws.registry.week.label} · {ws.tasks.length} việc đang theo dõi
          </span>
          <span className="topbar__spacer" />
          {waiting > 0 && (
            <span className="pill" style={{ color: 'var(--needs)', borderColor: 'var(--needs-dim)', background: 'var(--needs-dim)' }}>
              {waiting} việc cần bạn
            </span>
          )}
          <span className="clock">{clock(now.toISOString())}</span>
        </header>

        <div key={task ? `task-${task.id}` : view} className="fadein">
            {task ? (
              <TaskSpace task={task} onBack={() => setOpenTask(null)} onFire={fire} />
            ) : view === 'desk' ? (
              <Desk
                tasks={ws.tasks}
                activity={ws.activity}
                booted={booted}
                now={now}
                onOpen={setOpenTask}
                onFire={fire}
              />
            ) : view === 'schedule' ? (
              <Schedule tasks={ws.tasks} now={now} />
            ) : view === 'connections' ? (
              <Connections connections={ws.connections} tasks={ws.tasks} />
            ) : (
              <Reflect reflect={ws.reflect} tasks={ws.tasks} />
            )}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              left: 'calc(var(--rail) + 40px)',
              bottom: 30,
              zIndex: 60,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 17px',
              borderRadius: 11,
              background: 'var(--ink-high)',
              border: '1px solid var(--line)',
              boxShadow: '0 14px 36px rgba(0,0,0,.5)',
              fontSize: 14,
            }}
          >
            <span className="lamp lamp--run">
              <span className="lamp__dot" />
            </span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
