export type MdInline = { t: 'text' | 'b' | 'i' | 'code'; v: string }
export type MdBlock = { type: 'p'; inl: MdInline[] } | { type: 'ul'; items: MdInline[][] }

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`/g

/** Markdown giới hạn (đậm, nghiêng, code, gạch đầu dòng). Không bao giờ sinh HTML — chỉ trả cây để React render như chữ. */
export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = []
  let last = 0
  for (const m of s.matchAll(INLINE)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'b', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'i', v: m[2] })
    else out.push({ t: 'code', v: m[3] })
    last = m.index! + m[0].length
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) })
  return out
}

export function parseMiniMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  for (const chunk of text.split(/\n\s*\n/)) {
    let para: string[] = []
    let list: MdInline[][] | null = null
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', inl: parseInline(para.join(' ')) })
      para = []
    }
    const flushList = () => {
      if (list) blocks.push({ type: 'ul', items: list })
      list = null
    }
    for (const raw of chunk.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const item = /^[-*]\s+(.*)$/.exec(line)
      if (item) {
        flushPara()
        ;(list ??= []).push(parseInline(item[1]))
      } else {
        flushList()
        para.push(line)
      }
    }
    flushPara()
    flushList()
  }
  return blocks
}
