import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Me, MyConnections, Person, Task, Workspace } from './lib/types'
import { ApiError } from './lib/api'
import { cancelCommandApi, loadMe, loadMyConnections, loadPeople, loadWorkspace, logout, revokeLink, sendCommand } from './lib/data'
import { PresenceBar } from './components/Presence'
import { usePoll } from './lib/usePoll'
import { clock } from './lib/format'
import Desk from './components/Desk'
import TaskSpace from './components/TaskSpace'
import Schedule from './components/Schedule'
import Connections from './components/Connections'
import Reflect from './components/Reflect'
import Team from './components/Team'
import Login from './components/Login'
import { IconDesk, IconClock, IconPlug, IconThink, IconTeam } from './components/Icons'

type View = 'desk' | 'team' | 'schedule' | 'connections' | 'reflect'

const NAV: { id: View; label: string; Icon: () => ReactElement }[] = [
  { id: 'desk', label: 'Bàn điều phối', Icon: IconDesk },
  { id: 'team', label: 'Đội ngũ', Icon: IconTeam },
  { id: 'schedule', label: 'Lịch chạy', Icon: IconClock },
  { id: 'connections', label: 'Kết nối', Icon: IconPlug },
  { id: 'reflect', label: 'Nhìn lại tuần', Icon: IconThink },
]

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [fatal, setFatal] = useState<string | null>(null)
  const loginError = new URLSearchParams(window.location.search).get('error')

  useEffect(() => {
    if (window.location.pathname === '/login') {
      setMe(null)
      return
    }
    loadMe()
      .then(setMe)
      .catch((e: unknown) => (e instanceof ApiError && e.status === 401 ? setMe(null) : setFatal((e as Error).message)))
  }, [])

  if (fatal) return <div className="loading loading--bad">{fatal}</div>
  if (me === undefined) return <div className="loading">đang mở bàn điều phối…</div>
  if (me === null) return <Login error={loginError} />
  return <Shell me={me} onMe={setMe} />
}

function Shell({ me, onMe }: { me: Me; onMe: (m: Me) => void }) {
  const [view, setView] = useState<View>('desk')
  const [viewing, setViewing] = useState<string>(me.id)
  const [ws, setWs] = useState<Workspace | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [claude, setClaude] = useState<MyConnections | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)
  const [now, setNow] = useState(new Date())
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([loadWorkspace(viewing), loadPeople(), viewing === me.id ? loadMyConnections() : Promise.resolve(null)])
      .then(([w, p, cl]) => {
        setWs(w)
        setPeople(p)
        setClaude(cl)
        setErr(null)
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) window.location.href = '/login'
        else setErr((e as Error).message)
      })
  }, [viewing, me.id])

  useEffect(() => {
    setWs(null)
    setBooted(false)
    refresh()
  }, [refresh])
  usePoll(refresh, 30_000)

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

  function go(v: View) {
    setOpenTask(null)
    setView(v)
  }
  function visit(personId: string) {
    setOpenTask(null)
    setViewing(personId)
    setView('desk')
  }
  async function signOut() {
    await logout().catch(() => undefined)
    window.location.href = '/login'
  }
  async function revoke(id: string) {
    await revokeLink(id)
    setToast('Đã ngắt kết nối Claude')
    refresh()
  }
  async function send(t: Task, actionId: string, note?: string) {
    try {
      const c = await sendCommand(t.id, actionId, note)
      const when = ws?.owner.nextDispatchAt ? `khoảng ${clock(ws.owner.nextDispatchAt)}` : 'ở lần Điều phối kế tiếp'
      setToast(`Đã gửi "${c.label}" — Claude nhận ${when}`)
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    }
  }
  const fire = (t: Task) => send(t, t.action.actionId)
  async function cancel(id: string) {
    try {
      await cancelCommandApi(id)
      setToast('Đã hủy lệnh')
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    }
  }


  const readOnly = ws ? !ws.isMine : true
  const who = ws && !ws.isMine ? ws.owner.name : 'bạn'
  const waiting = ws ? ws.tasks.filter((t) => t.state === 'needs-you' || t.state === 'blocked').length : 0
  const task = ws && openTask ? ws.tasks.find((t) => t.id === openTask) ?? null : null

  return (
    <div className="shell">
      <nav className="rail" aria-label="Khu vực">
        <button className="rail__mark" aria-label="Về bàn của tôi" onClick={() => visit(me.id)}>W</button>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="rail__btn"
            aria-current={view === id && !task ? 'page' : undefined}
            aria-label={label}
            onClick={() => go(id)}
          >
            <Icon />
            {id === 'desk' && ws?.isMine && waiting > 0 && <span className="rail__badge">{waiting}</span>}
            <span className="rail__tip">{label}</span>
          </button>
        ))}
        <div className="rail__spacer" />
        <button className="rail__btn" aria-label={`Đăng xuất ${me.name}`} onClick={signOut}>
          <span className="avatar avatar--sm">
            {me.avatarUrl ? <img src={me.avatarUrl} alt="" referrerPolicy="no-referrer" /> : me.name[0]}
          </span>
          <span className="rail__tip">{me.name} · Đăng xuất</span>
        </button>
      </nav>

      <div className="main">
        <header className="topbar">
          <span className="topbar__title">{view === 'team' ? 'Đội ngũ' : ws && !ws.isMine ? `Bàn của ${ws.owner.name}` : 'Bàn điều phối'}</span>
          {ws && view !== 'team' && (
            <span className="topbar__sub">
              {ws.week.label} · {ws.tasks.length} việc đang theo dõi
            </span>
          )}
          <span className="topbar__spacer" />
          {ws?.isMine && waiting > 0 && view !== 'team' && (
            <span className="pill" style={{ color: 'var(--needs)', borderColor: 'var(--needs-dim)', background: 'var(--needs-dim)' }}>
              {waiting} việc cần bạn
            </span>
          )}
          <span className="clock">{clock(now.toISOString())}</span>
        </header>

        {ws && !ws.isMine && view !== 'team' && (
          <div className="viewing" role="status">
            <span className="avatar avatar--xs">
              {ws.owner.avatarUrl ? <img src={ws.owner.avatarUrl} alt="" referrerPolicy="no-referrer" /> : ws.owner.name[0]}
            </span>
            Đang xem không gian của <strong>{ws.owner.name}</strong> · chỉ đọc
            <button className="viewing__back" onClick={() => visit(me.id)}>Về bàn của tôi</button>
          </div>
        )}

        {ws && view !== 'team' && <PresenceBar owner={ws.owner} isMine={ws.isMine} now={now} onConnect={() => go('connections')} />}

        {err && (
          <div className="banner banner--bad" role="alert">
            {err}
            <button onClick={refresh}>Thử lại</button>
          </div>
        )}

        {view === 'team' ? (
          <Team people={people} meId={me.id} now={now} onVisit={visit} />
        ) : !ws ? (
          <div className="loading">đang đọc dữ liệu…</div>
        ) : (
          <div key={task ? `task-${task.id}` : `${viewing}-${view}`} className="fadein">
            {task ? (
              <TaskSpace task={task} readOnly={readOnly} backLabel={ws.isMine ? 'Bàn điều phối' : `Bàn của ${ws.owner.name}`} onBack={() => setOpenTask(null)} onFire={fire} onSend={(actionId, note) => send(task, actionId, note)} onCancel={cancel} now={now} />
            ) : view === 'desk' ? (
              <Desk tasks={ws.tasks} activity={ws.activity} booted={booted} now={now} readOnly={readOnly} who={who} onOpen={setOpenTask} onFire={fire} />
            ) : view === 'schedule' ? (
              <Schedule tasks={ws.tasks} now={now} readOnly={readOnly} onChanged={refresh} onToast={setToast} />
            ) : view === 'connections' ? (
              <Connections connections={ws.connections} tasks={ws.tasks} claude={ws.isMine ? claude : null} onRevoke={revoke} me={ws.isMine ? me : null} onMeSaved={(m) => { onMe(m); refresh() }} onToast={setToast} />
            ) : (
              <Reflect reflect={ws.reflect} tasks={ws.tasks} ownerId={ws.owner.id} />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
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
