export interface PaletteItem {
  id: string
  label: string
  hint?: string
}

export function normalizeVi(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
}

export function filterItems<T extends PaletteItem>(items: T[], q: string, limit = 8): T[] {
  const words = normalizeVi(q).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items.slice(0, limit)
  return items
    .map((it) => {
      const label = normalizeVi(it.label)
      const hay = `${label} ${normalizeVi(it.hint ?? '')}`
      if (!words.every((w) => hay.includes(w))) return null
      const score = label.startsWith(words[0]) ? 0 : label.includes(` ${words[0]}`) ? 1 : 2
      return { it, score }
    })
    .filter((x): x is { it: T; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.it)
}
