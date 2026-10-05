/** Hình học sparkline. Dưới 2 điểm thì không có đường để vẽ → null. */
export function sparkGeometry(data: number[], w: number, h: number): { path: string; last: [number, number] } | null {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const pt = (v: number, i: number): [number, number] => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 7)]
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${pt(v, i)[0].toFixed(2)},${pt(v, i)[1].toFixed(2)}`).join(' ')
  return { path, last: pt(data[data.length - 1], data.length - 1) }
}
