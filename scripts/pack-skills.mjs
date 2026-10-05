// Đóng gói mỗi skill thành zip chứa đúng một thư mục <tên>/SKILL.md (định dạng upload của claude.ai),
// cộng một zip gộp cả bộ cho ~/.claude/skills.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const root = new URL('../skills/', import.meta.url)
const out = new URL('../public/downloads/', import.meta.url)
mkdirSync(out, { recursive: true })

const all = {}
for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
  const files = {}
  for (const f of readdirSync(new URL(`${d.name}/`, root))) {
    files[`${d.name}/${f}`] = strToU8(readFileSync(new URL(`${d.name}/${f}`, root), 'utf8'))
  }
  Object.assign(all, files)
  writeFileSync(new URL(`${d.name}.zip`, out), zipSync(files, { level: 9 }))
}
writeFileSync(new URL('work-system-skills.zip', out), zipSync(all, { level: 9 }))
console.log(`Đã đóng gói ${Object.keys(all).length} file skill vào public/downloads/`)
