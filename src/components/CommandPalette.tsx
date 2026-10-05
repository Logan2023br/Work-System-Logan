import { useEffect, useRef, useState } from 'react'
import { filterItems, type PaletteItem } from '../lib/search'

export type Command = PaletteItem & { run: () => void }

export default function CommandPalette({ open, items, onClose }: { open: boolean; items: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = filterItems(items, q)

  useEffect(() => {
    if (!open) return
    setQ('')
    setI(0)
    const id = window.setTimeout(() => input.current?.focus(), 10)
    return () => window.clearTimeout(id)
  }, [open])

  if (!open) return null

  function choose(c: Command | undefined) {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <div className="pal" role="presentation" onMouseDown={onClose}>
      <div className="pal__box" role="dialog" aria-modal="true" aria-label="Tìm nhanh" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="pal__input"
          placeholder="Tìm task, người, mục… (gõ không dấu cũng được)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setI(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setI((x) => Math.min(x + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setI((x) => Math.max(x - 1, 0))
            } else if (e.key === 'Enter') choose(results[i])
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={results[i] ? `pal-${results[i].id}` : undefined}
        />
        <ul id="pal-list" className="pal__list" role="listbox">
          {results.length === 0 && <li className="pal__empty">Không thấy gì khớp "{q}"</li>}
          {results.map((r, k) => (
            <li
              key={r.id}
              id={`pal-${r.id}`}
              role="option"
              aria-selected={k === i}
              className="pal__item"
              onMouseEnter={() => setI(k)}
              onClick={() => choose(r)}
            >
              <span>{r.label}</span>
              {r.hint && <span className="pal__hint">{r.hint}</span>}
            </li>
          ))}
        </ul>
        <div className="pal__foot">↑↓ chọn · Enter mở · Esc đóng</div>
      </div>
    </div>
  )
}
