import { useEffect, useRef, useState } from 'react'
import { TONE_HEX } from '../lib/format'
import { IconPlay, IconCheck, IconWrench } from './Icons'

type Tone = 'needs' | 'run' | 'bad' | 'idle'

/* Đèn trạng thái: luôn đi kèm chữ, không bao giờ chỉ dựa vào màu. */
export function Lamp({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`lamp lamp--${tone}`}>
      <span className="lamp__dot" />
      {label}
    </span>
  )
}

/* Đồng hồ mức nằm trong giếng chìm — đo sức khoẻ task, 0..1. */
export function Meter({ value, tone, booted }: { value: number; tone: Tone; booted: boolean }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div
        className="meter"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sức khoẻ ${pct} phần trăm`}
      >
        <div
          className="meter__fill"
          style={{
            height: booted ? `${pct}%` : '0%',
            background: `linear-gradient(180deg, ${TONE_HEX[tone]}, ${TONE_HEX[tone]}99)`,
          }}
        />
        <div className="meter__ticks" aria-hidden>
          {[20, 40, 60, 80].map((t) => (
            <span key={t} className="meter__tick" style={{ bottom: `${t}%` }} />
          ))}
        </div>
      </div>
      <div className="meter__read">{pct}%</div>
    </div>
  )
}

/* Một chuỗi số, một màu, không cần chú giải — tiêu đề bên cạnh đã gọi tên nó. */
export function Sparkline({ data, tone, booted }: { data: number[]; tone: Tone; booted: boolean }) {
  const w = 100
  const h = 30
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const pt = (v: number, i: number) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 7),
  ]
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${pt(v, i)[0].toFixed(2)},${pt(v, i)[1].toFixed(2)}`).join(' ')
  const last = pt(data[data.length - 1], data.length - 1)
  const c = TONE_HEX[tone]

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{
          strokeDasharray: 240,
          strokeDashoffset: booted ? 0 : 240,
          transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)',
        }}
      />
      {/* điểm cuối: giá trị hiện tại, vòng nền 2px tách khỏi đường */}
      <circle cx={last[0]} cy={last[1]} r={4} fill="var(--ink-raised)" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={c} style={{ opacity: booted ? 1 : 0, transition: 'opacity .4s .9s' }} />
    </svg>
  )
}

/* Nút bấm của task — vật thể chính của bàn điều phối. */
export function Key({
  label,
  kind,
  tone,
  onPress,
}: {
  label: string
  kind: 'run' | 'review' | 'fix'
  tone: Tone
  onPress?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function press(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    onPress?.()
    timer.current = window.setTimeout(() => setBusy(false), 1600)
  }

  const Icon = kind === 'run' ? IconPlay : kind === 'review' ? IconCheck : IconWrench
  const cls = tone === 'run' ? 'key--run' : tone === 'bad' ? 'key--bad' : tone === 'idle' ? 'key--idle' : ''

  return (
    <button className={`key ${cls} ${busy ? 'key--busy' : ''}`} data-pressed={busy} onClick={press}>
      {busy ? <span className="key__spin" /> : <Icon />}
      {busy ? 'Đang chạy…' : label}
    </button>
  )
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button className="sw" data-on={on} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <span className="sw__knob" />
    </button>
  )
}

/* Số đếm lên — dùng đúng một lần, trong khoảnh khắc bàn khởi động. */
export function useCountUp(target: number, run: boolean, ms = 900) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, run, ms])
  return n
}
