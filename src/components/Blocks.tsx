import { useState } from 'react'
import type { Block } from '../lib/types'
import { parseMiniMarkdown, type MdInline } from '../lib/miniMarkdown'

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)']
const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, notation: 'compact' })

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === 'b' ? <strong key={i}>{p.v}</strong> : p.t === 'i' ? <em key={i}>{p.v}</em> : p.t === 'code' ? <code key={i}>{p.v}</code> : <span key={i}>{p.v}</span>,
      )}
    </>
  )
}

function Note({ text }: { text: string }) {
  return (
    <div className="blk__note">
      {parseMiniMarkdown(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>
            <Inline parts={b.inl} />
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline parts={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

function Table({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="blk__scroll">
      <table className="blk__table">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'is-num' : undefined}>
                  {typeof v === 'number' ? v.toLocaleString('vi-VN') : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Checklist({ items }: { items: { text: string; done: boolean }[] }) {
  const done = items.filter((i) => i.done).length
  return (
    <>
      <div className="blk__meter" aria-label={`${done} trên ${items.length} mục xong`}>
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="blk__check">
        {items.map((it, i) => (
          <li key={i} className={it.done ? 'is-done' : undefined}>
            <span className="blk__box" aria-hidden="true">{it.done ? '✓' : ''}</span>
            <span>{it.text}</span>
            <span className="sr-only">{it.done ? '(xong)' : '(chưa xong)'}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

type ChartData = Extract<Block, { type: 'chart' }>['data']

function Chart({ data }: { data: ChartData }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const W = 640
  const H = 220
  const P = { l: 44, r: 64, t: 14, b: 28 }
  const n = data.labels.length
  const all = data.series.flatMap((s) => s.values)
  const max = Math.max(0, ...all)
  const min = Math.min(0, ...all)
  const span = max - min || 1
  const iw = W - P.l - P.r
  const ih = H - P.t - P.b
  const y = (v: number) => P.t + ih - ((v - min) / span) * ih
  const band = iw / Math.max(n, 1)
  const cx = (i: number) => (data.kind === 'line' ? P.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw) : P.l + band * i + band / 2)
  const ticks = [min, min + span / 2, max]
  const k = data.series.length
  const group = band * 0.7
  const bw = Math.max(2, (group - 2 * (k - 1)) / k)

  const bar = (x: number, v: number) => {
    const y0 = y(0)
    const y1 = y(v)
    const r = Math.min(4, bw / 2, Math.abs(y0 - y1))
    if (v >= 0) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`
    return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 - r} V${y0} Z`
  }

  if (asTable) {
    return (
      <>
        <Table columns={['', ...data.series.map((s) => s.name)]} rows={data.labels.map((l, i) => [l, ...data.series.map((s) => s.values[i])])} />
        <button className="blk__toggle" onClick={() => setAsTable(false)}>Xem biểu đồ</button>
      </>
    )
  }

  return (
    <div className="blk__chart">
      {k >= 2 && (
        <ul className="blk__legend">
          {data.series.map((s, i) => (
            <li key={s.name}>
              <span className="blk__swatch" style={{ background: SERIES[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="blk__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Biểu đồ ${data.kind === 'line' ? 'đường' : 'cột'}: ${data.series.map((s) => s.name).join(', ')}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="blk__grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="blk__tick">{fmt.format(t)}</text>
            </g>
          ))}
          {data.labels.map((l, i) =>
            n <= 12 || i % Math.ceil(n / 12) === 0 ? (
              <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className="blk__tick">{l}</text>
            ) : null,
          )}
          {data.kind === 'line'
            ? data.series.map((s, si) => (
                <g key={s.name}>
                  <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(n - 1)} cy={y(s.values[n - 1])} r={4} fill={SERIES[si]} stroke="var(--ink-raised)" strokeWidth={2} />
                  <text x={cx(n - 1) + 8} y={y(s.values[n - 1]) + 4} className="blk__direct">{fmt.format(s.values[n - 1])}</text>
                </g>
              ))
            : data.series.map((s, si) => (
                <g key={s.name}>
                  {s.values.map((v, i) => (
                    <path key={i} d={bar(cx(i) - group / 2 + si * (bw + 2), v)} fill={SERIES[si]} opacity={hover === null || hover === i ? 1 : 0.45} />
                  ))}
                </g>
              ))}
          {hover !== null && data.kind === 'line' && <line x1={cx(hover)} x2={cx(hover)} y1={P.t} y2={P.t + ih} className="blk__cross" />}
          {hover !== null &&
            data.kind === 'line' &&
            data.series.map((s, si) => <circle key={si} cx={cx(hover)} cy={y(s.values[hover])} r={4} fill={SERIES[si]} stroke="var(--ink-raised)" strokeWidth={2} />)}
          {data.labels.map((_, i) => (
            <rect key={i} x={cx(i) - band / 2} y={P.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="blk__tip" style={{ left: `${(cx(hover) / W) * 100}%` }}>
            <div className="blk__tip-h">{data.labels[hover]}</div>
            {data.series.map((s, si) => (
              <div key={si} className="blk__tip-row">
                <span className="blk__swatch" style={{ background: SERIES[si] }} />
                <span>{s.name}</span>
                <b>{s.values[hover].toLocaleString('vi-VN')}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="blk__toggle" onClick={() => setAsTable(true)}>Xem dạng bảng</button>
    </div>
  )
}

export default function Blocks({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="blocks">
      {blocks.map((b) => (
        <section key={b.id} className={`blk blk--${b.type}`}>
          <h3 className="blk__title">{b.title}</h3>
          {b.type === 'note' && <Note text={b.data.text} />}
          {b.type === 'table' && <Table columns={b.data.columns} rows={b.data.rows} />}
          {b.type === 'checklist' && <Checklist items={b.data.items} />}
          {b.type === 'chart' && <Chart data={b.data} />}
        </section>
      ))}
    </div>
  )
}
