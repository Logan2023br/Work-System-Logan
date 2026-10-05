import type { Task, ActivityEvent } from '../lib/types'
import { tone, clock, ago, until, dayAndClock } from '../lib/format'
import { Lamp, Meter, Sparkline, Key, useCountUp } from './Bits'
import { IconChev, IconAlert } from './Icons'

function Strip({
  task,
  booted,
  order,
  readOnly,
  onOpen,
  onFire,
}: {
  task: Task
  booted: boolean
  order: number
  readOnly: boolean
  onOpen: () => void
  onFire: (t: Task) => void
}) {
  const t = tone(task.state)
  const pct = task.progress.total > 0 ? Math.round((task.progress.done / task.progress.total) * 100) : 0

  return (
    <div className={`strip strip--${t} rise`} style={{ animationDelay: `${0.06 * order}s` }}>
      <div className="strip__head">
        <span className="strip__no">{task.index}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="strip__name">{task.name}</h3>
          <div style={{ marginTop: 7 }}>
            <Lamp tone={t} label={task.stateLabel} />
          </div>
        </div>
      </div>

      <p className="strip__summary">{task.summary}</p>

      <div className="strip__mid">
        <Meter value={task.health} tone={t} booted={booted} />
        <div className="strip__stats">
          <div>
            <div className="stat__value">
              {task.progress.done}
              <span style={{ color: 'var(--fg-3)', fontSize: 17 }}>/{task.progress.total}</span>
            </div>
            <div className="stat__label">
              {task.progress.unit} · {pct}%
            </div>
          </div>
          <div>
            <Sparkline data={task.trend} tone={t} booted={booted} />
            <div className="stat__label" style={{ marginTop: 5 }}>{task.trendLabel}</div>
          </div>
        </div>
      </div>

      <div className="strip__foot">
        <div className="strip__when">
          <span>chạy {ago(task.lastRun, new Date())}</span>
          <span>{task.scheduleLabel}</span>
        </div>
        {!readOnly && <Key label={task.action.label} kind={task.action.kind} tone={t} onPress={() => onFire(task)} />}
        <button
          className="hero__jump"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8, height: 32 }}
          onClick={onOpen}
        >
          Mở không gian riêng <IconChev />
        </button>
      </div>
    </div>
  )
}

export default function Desk({
  tasks,
  activity,
  booted,
  now,
  readOnly,
  who,
  onOpen,
  onFire,
}: {
  tasks: Task[]
  activity: ActivityEvent[]
  booted: boolean
  now: Date
  readOnly: boolean
  who: string
  onOpen: (id: string) => void
  onFire: (t: Task) => void
}) {
  const waiting = tasks.filter((t) => t.state === 'needs-you' || t.state === 'blocked')
  const count = useCountUp(waiting.length, booted, 700)
  const name = (id: string) => tasks.find((t) => t.id === id)?.name ?? id

  const upcoming = tasks
    .filter((t): t is typeof t & { nextRun: string } => !!t.nextRun && !t.paused)
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())
    .slice(0, 4)

  return (
    <div className="wrap">
      <header className="hero">
        <h1 className="hero__line rise">
          {tasks.length === 0 ? (
            <>{who === 'bạn' ? 'Bạn chưa có task nào' : `${who} chưa có task nào`}</>
          ) : waiting.length > 0 ? (
            <>
              <em>{count} việc</em> đang chờ {who} quyết
            </>
          ) : (
            <>{tasks.length} việc đang tự chạy, không việc nào cần {who}</>
          )}
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          {tasks.length === 0
            ? who === 'bạn'
              ? 'Mở Claude và nói "tạo task mới" — skill tao-task sẽ hỏi bạn vài câu rồi đưa task lên đây.'
              : 'Khi họ tạo task bằng Claude, task sẽ xuất hiện ở đây.'
            : waiting.length > 0
              ? `${waiting.map((t) => t.name).join(' và ')} không đi tiếp được nếu không có ${who}. Những việc còn lại vẫn chạy theo lịch.`
              : 'Mọi task đều chạy đúng lịch và không báo lỗi nào.'}
        </p>
      </header>

      <div className="desk">
        {tasks.map((t, i) => (
          <Strip key={t.id} task={t} booted={booted} order={i} readOnly={readOnly} onOpen={() => onOpen(t.id)} onFire={onFire} />
        ))}
      </div>

      <div className="underdesk">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Hoạt động</h2>
            <span className="panel__count">{activity.length} sự kiện gần nhất</span>
          </div>
          <div className="panel__body">
            {activity.map((e, i) => (
              <div key={i} className={`ev ev--${e.level}`}>
                <span className="ev__time">{clock(e.at)}</span>
                <span className="ev__dot" />
                <span className="ev__text">
                  {e.text}
                  <span className="ev__task">
                    {name(e.task)} · {ago(e.at, now)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Sắp chạy</h2>
          </div>
          <div style={{ padding: '2px 0' }}>
            {upcoming.map((t) => (
              <div key={t.id} className="next">
                <span className="next__cd">{until(t.nextRun, now)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="next__name">{t.name}</div>
                  <div className="next__at">{dayAndClock(t.nextRun)}</div>
                </div>
              </div>
            ))}
          </div>
          {tasks.some((t) => t.state === 'blocked') && (
            <div
              style={{
                margin: '4px 14px 14px',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--bad-dim)',
                border: '1px solid rgba(255,92,77,.3)',
                fontSize: 13,
                lineHeight: 1.5,
                display: 'flex',
                gap: 10,
              }}
            >
              <span style={{ color: 'var(--bad)', flex: 'none', paddingTop: 2 }}>
                <IconAlert />
              </span>
              <span>
                Có task đang dừng vì lỗi. Lịch vẫn chạy nhưng việc ở bước lỗi chưa được làm.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
