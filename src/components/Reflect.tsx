import type { Reflect as ReflectData, Task } from '../lib/types'

export default function Reflect({ reflect, tasks }: { reflect: ReflectData | null; tasks: Task[] }) {
  if (!reflect) {
    return (
      <div className="wrap">
        <header className="pagehead">
          <h1 className="sec">Nhìn lại tuần</h1>
          <p className="sec__note">Chưa có báo cáo tuần nào. Claude sẽ nộp báo cáo khi task "bao-cao-tuan" chạy, thường vào chiều thứ 6.</p>
        </header>
      </div>
    )
  }
  const name = (id: string) => tasks.find((t) => t.id === id)?.name ?? id

  const cols = [
    { key: 'good', cls: 'col--good', head: 'Chạy tốt', notes: reflect.good },
    { key: 'bad', cls: 'col--bad', head: 'Chưa ổn', notes: reflect.bad },
    { key: 'next', cls: 'col--next', head: 'Tuần tới', notes: reflect.next },
  ] as const

  return (
    <div className="wrap">
      <header className="pagehead">
        <h1 className="sec">Nhìn lại tuần {reflect.week}</h1>
        <p className="sec__note">{reflect.range} · tổng hợp từ {tasks.length} task</p>
      </header>

      <article className="paper rise">
        <p className="paper__lede">{reflect.summary}</p>
        <hr />
        <h3>Điểm chung của mọi sự cố tuần này</h3>
        <p>{reflect.pattern}</p>
      </article>

      <div className="reflect__grid">
        {cols.map((c, ci) => (
          <section key={c.key} className={`col ${c.cls} rise`} style={{ animationDelay: `${0.09 * ci + 0.12}s` }}>
            <h2 className="col__h">{c.head}</h2>
            <div className="col__c">{c.notes.length} mục</div>
            {c.notes.map((n, i) => (
              <div key={i} className="note">
                {n.text}
                <span className="note__from">{name(n.task)}</span>
                {n.weight && <span className="note__w">{n.weight}</span>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
