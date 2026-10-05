import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Task, Run } from '../lib/types'
import { tone, ago, dayAndClock, shortDate } from '../lib/format'
import { Lamp, Key } from './Bits'
import { ActionBar, CommandTickets } from './Commands'
import { IconBack, IconChev, SourceIcon } from './Icons'

const TABS = ['Báo cáo', 'Tiến độ', 'Lệnh', 'Nguồn dữ liệu', 'Lần chạy'] as const
type Tab = (typeof TABS)[number]

const SRC_LABEL: Record<string, string> = { ok: 'Đồng bộ tốt', stale: 'Dữ liệu cũ', error: 'Lỗi' }
const SRC_TONE: Record<string, 'run' | 'needs' | 'bad'> = { ok: 'run', stale: 'needs', error: 'bad' }
const RUN_LABEL: Record<string, string> = { ok: 'Xong', partial: 'Xong một phần', failed: 'Thất bại' }
const RUN_TONE: Record<string, 'run' | 'needs' | 'bad'> = { ok: 'run', partial: 'needs', failed: 'bad' }

function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="run">
      <button className="run__bar" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="run__chev" data-open={open}>
          <IconChev />
        </span>
        <span className="run__when">{dayAndClock(run.at)}</span>
        <Lamp tone={RUN_TONE[run.status]} label={RUN_LABEL[run.status]} />
        <span className="run__note">{run.note}</span>
        <span className="run__dur">{run.duration}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="run__log">
              {run.log.map((l, i) => (
                <div key={i}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {l}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TaskSpace({
  task,
  readOnly,
  backLabel,
  onBack,
  onFire,
  onSend,
  onCancel,
  now,
}: {
  task: Task
  readOnly: boolean
  backLabel: string
  onBack: () => void
  onFire: (t: Task) => void | Promise<void>
  onSend: (actionId: string, note?: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
  now: Date
}) {
  const live = task.commands.filter((c) => c.status === 'pending' || c.status === 'claimed').length
  const [tab, setTab] = useState<Tab>('Báo cáo')
  const t = tone(task.state)

  return (
    <div className="wrap space">
      <div className="space__top">
        <button className="back" onClick={onBack}>
          <IconBack /> {backLabel}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="space__name">{task.name}</h1>
          <div className="space__meta">
            <Lamp tone={t} label={task.stateLabel} />
            <span className={`tag tag--${task.mode}`}>
              {task.mode === 'auto' ? 'Tự chạy' : 'Cần bạn duyệt'}
            </span>
            <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>
              {task.scheduleLabel} · {task.lastRun ? `chạy lần cuối ${ago(task.lastRun, new Date())}` : 'chưa chạy lần nào'}
            </span>
          </div>
        </div>
        {!readOnly && (
          <div className="space__act">
            <Key label={task.action.label} kind={task.action.kind} tone={t} onPress={() => onFire(task)} />
          </div>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x} className="tab" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>
            {x}
            {x === 'Lệnh' && live > 0 && <span className="tab__count">{live}</span>}
            {tab === x && <motion.span layoutId="tab-underline" className="tab__underline" />}
          </button>
        ))}
      </div>

      <div key={tab} className="rise">
          {tab === 'Báo cáo' && (
            <div className="cols">
              {!task.report.headline && task.report.body.length === 0 ? (
                <article className="paper">
                  <p className="paper__lede">Chưa có báo cáo. Báo cáo xuất hiện sau lần chạy đầu tiên.</p>
                </article>
              ) : (
              <article className="paper">
                <p className="paper__lede">{task.report.headline}</p>
                {task.report.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {task.report.blockers.length > 0 && (
                  <>
                    <hr />
                    <h3>Đang tắc ở đâu</h3>
                    <ul className="plist plist--bad">
                      {task.report.blockers.map((b, i) => (
                        <li key={i}>
                          <span className="plist__mark">!</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3>Nên làm gì tiếp</h3>
                <ul className="plist">
                  {task.report.next.map((n, i) => (
                    <li key={i}>
                      <span className="plist__mark">{i + 1}</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </article>
              )}
              <div className="figs">
                {task.metrics.map((m, i) => (
                  <div key={i} className="fig">
                    <div className="fig__v">{m.value}</div>
                    <div className="fig__l">{m.label}</div>
                    <div className="fig__n">{m.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Tiến độ' && (
            <div className="cols">
              <div>
                {task.milestones.map((m, i) => (
                  <div key={i} className={`mile mile--${m.state}`}>
                    <div className="mile__rail">
                      <span className="mile__node" />
                      <span className="mile__thread" />
                    </div>
                    <div>
                      <div className="mile__t">{m.title}</div>
                      <div className="mile__n">{m.note}</div>
                      <div className="mile__d">{shortDate(m.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="fig">
                <div className="fig__v">
                  {task.progress.done}
                  <span style={{ color: 'var(--fg-3)', fontSize: 16 }}>/{task.progress.total}</span>
                </div>
                <div className="fig__l">{task.progress.unit} đã xong</div>
                <div className="fig__n">
                  {task.milestones.filter((m) => m.state === 'done').length} trên {task.milestones.length} mốc
                  đã đóng.
                </div>
              </div>
            </div>
          )}

          {tab === 'Lệnh' && (
            <div>
              {!readOnly && <ActionBar task={task} onSend={onSend} />}
              <CommandTickets commands={task.commands} readOnly={readOnly} now={now} onCancel={onCancel} />
            </div>
          )}

          {tab === 'Nguồn dữ liệu' && (
            <div>
              <p className="sec__note">
                Task này đọc và ghi vào {task.sources.length} nơi. Nếu một nguồn lỗi, task dừng ở đúng bước đó.
              </p>
              {task.sources.map((s, i) => (
                <div key={i} className="src">
                  <span className="src__ic">
                    <SourceIcon kind={s.kind} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="src__n">{s.name}</div>
                    <div className="src__p">{s.location}</div>
                  </div>
                  <div className="src__s">
                    <Lamp tone={SRC_TONE[s.status]} label={SRC_LABEL[s.status]} />
                    <div className="src__sync">{ago(s.syncedAt, new Date())}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Lần chạy' && (
            <div>
              <p className="sec__note">{task.runs.length === 0 ? 'Chưa có lần chạy nào.' : 'Bấm vào một dòng để xem nhật ký từng bước.'}</p>
              {task.runs.map((r, i) => (
                <RunRow key={i} run={r} />
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
