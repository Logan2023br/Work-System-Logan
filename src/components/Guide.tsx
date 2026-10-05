import { useState } from 'react'
import type { Me, MyConnections, Presence, Task } from '../lib/types'
import { dispatcherCron } from '../../shared/dispatcherCron'

const SKILLS_KEY = 'ws.skillsInstalled'
const readFlag = () => {
  try {
    return window.localStorage.getItem(SKILLS_KEY) === '1'
  } catch {
    return false
  }
}
const writeFlag = (v: boolean) => {
  try {
    window.localStorage.setItem(SKILLS_KEY, v ? '1' : '0')
  } catch {
    /* trình duyệt chặn storage — trạng thái chỉ giữ trong phiên này */
  }
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="copy">
      <pre>{text}</pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setDone(true)
            window.setTimeout(() => setDone(false), 1800)
          } catch {
            setDone(false)
          }
        }}
      >
        {done ? 'Đã chép' : 'Chép'}
      </button>
    </div>
  )
}

export default function Guide({ me, claude, tasks, presence }: { me: Me; claude: MyConnections | null; tasks: Task[]; presence: Presence }) {
  const [skills, setSkills] = useState(readFlag)
  const cron = dispatcherCron(me)
  const steps = [
    { done: !!claude && claude.links.length > 0, title: 'Nối connector Work System vào Claude desktop' },
    { done: skills, title: 'Cài bộ skill Work System' },
    { done: presence !== 'never', title: 'Tạo tác vụ hẹn giờ "dieu-phoi"' },
    { done: tasks.length > 0, title: 'Tạo task đầu tiên' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const scheduled = `Tạo một tác vụ hẹn giờ local tên "dieu-phoi" với lịch cron "${cron}" (giờ Việt Nam, mỗi 15 phút trong giờ làm của tôi). Nội dung tác vụ: "Dùng skill dieu-phoi với connector Work System." Quyền: tự động cho các tool của Work System.`

  return (
    <div className="wrap">
      <header className="hero">
        <h1 className="hero__line rise">
          {doneCount === 4 ? <>Claude của bạn đã sẵn sàng</> : <><em>{doneCount}/4</em> bước để Claude tự chạy việc</>}
        </h1>
        <p className="hero__note rise" style={{ animationDelay: '.16s' }}>
          Làm một lần trên Claude desktop. Các bước tự đánh dấu khi Work System thấy kết quả.
        </p>
        <div className="guide__bar" aria-hidden="true"><span style={{ width: `${(doneCount / 4) * 100}%` }} /></div>
      </header>

      <ol className="guide">
        <li className={`guide__step${steps[0].done ? ' is-done' : ''}`}>
          <h2>1. {steps[0].title}</h2>
          <p>Claude desktop → <b>Settings</b> → <b>Connectors</b> → <b>Add custom connector</b> → dán địa chỉ dưới đây → <b>Connect</b> → đăng nhập Google → <b>Cho phép</b>.</p>
          {claude && <Copy text={claude.connectorUrl} />}
        </li>

        <li className={`guide__step${steps[1].done ? ' is-done' : ''}`}>
          <h2>2. {steps[1].title}</h2>
          <p>
            Tải từng skill và upload trong Claude desktop → <b>Settings</b> → <b>Capabilities</b> → <b>Skills</b>:{' '}
            <a href="/downloads/dieu-phoi.zip" download>dieu-phoi</a>, <a href="/downloads/tao-task.zip" download>tao-task</a>,{' '}
            <a href="/downloads/bao-cao-tuan.zip" download>bao-cao-tuan</a>.
          </p>
          <p>
            Dùng tab Code của Claude desktop? Tải <a href="/downloads/work-system-skills.zip" download>cả bộ</a> và giải nén vào thư mục <code>~/.claude/skills/</code>.
          </p>
          <label className="guide__check">
            <input type="checkbox" checked={skills} onChange={(e) => { setSkills(e.target.checked); writeFlag(e.target.checked) }} /> Tôi đã cài xong
          </label>
        </li>

        <li className={`guide__step${steps[2].done ? ' is-done' : ''}`}>
          <h2>3. {steps[2].title}</h2>
          <p>Mở tab <b>Code</b> trên Claude desktop, dán câu dưới đây vào một phiên mới. Tạo xong, mở tác vụ trong <b>Routines</b>, bấm <b>Run now</b> một lần và chọn <b>Always allow</b> cho các tool Work System — nếu không, các lần sau sẽ đứng chờ duyệt quyền.</p>
          <Copy text={scheduled} />
          <p className="guide__fine">Tác vụ chỉ chạy khi máy bật và Claude desktop đang mở. Bật <b>Keep computer awake</b> trong Settings để máy không ngủ giữa giờ. Bước này tự đánh dấu khi Claude gọi Work System lần đầu.</p>
        </li>

        <li className={`guide__step${steps[3].done ? ' is-done' : ''}`}>
          <h2>4. {steps[3].title}</h2>
          <p>Trong Claude, nói:</p>
          <Copy text="Dùng skill tao-task để tạo một task Work System mới cho tôi." />
        </li>
      </ol>
    </div>
  )
}
