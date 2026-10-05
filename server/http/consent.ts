export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

const PAGE_CSS = `
:root{--ink:#14161c;--paper:#efe9dc;--on-paper:#23201b;--on-paper-2:#5d564a;--needs:#ffb01f;--bad:#ff5c4d}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--ink);font-family:'Schibsted Grotesk',system-ui,sans-serif;display:grid;place-items:center;padding:24px;color:var(--on-paper)}
.card{width:min(460px,100%);background:var(--paper);border-radius:22px;padding:34px 32px 26px;box-shadow:0 40px 90px rgba(0,0,0,.55)}
.mark{width:46px;height:46px;border-radius:13px;background:var(--ink);color:var(--needs);display:grid;place-items:center;font:700 22px 'Bricolage Grotesque',system-ui;margin-bottom:18px}
h1{font:700 26px/1.15 'Bricolage Grotesque',system-ui;letter-spacing:-.02em;margin:0 0 8px}
p{margin:0 0 14px;color:var(--on-paper-2);font-size:15px;line-height:1.5}
.who{font-family:'DM Mono',ui-monospace,monospace;font-size:12.5px;color:var(--on-paper-2);margin-bottom:18px}
ul{margin:0 0 18px;padding-left:20px;font-size:14.5px;line-height:1.6}
.host{font-family:'DM Mono',ui-monospace,monospace;font-size:13px;background:rgba(20,22,28,.07);border-radius:8px;padding:8px 10px;margin-bottom:16px;word-break:break-all}
.warn{background:rgba(255,176,31,.18);border-radius:10px;padding:10px 12px;font-size:13.5px;color:#6b4a00;margin-bottom:16px}
.err{background:rgba(255,92,77,.14);border-radius:10px;padding:12px;font-size:14px;color:#a3271c}
.row{display:flex;gap:10px}
button{flex:1;height:48px;border-radius:13px;border:0;font:600 15px 'Schibsted Grotesk',system-ui;cursor:pointer}
.allow{background:var(--ink);color:#e8eaf0}.deny{background:transparent;border:1px solid rgba(20,22,28,.25);color:var(--on-paper)}
button:focus-visible{outline:2px solid var(--needs);outline-offset:3px}
`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Work System</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Schibsted+Grotesk:wght@400..700&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style></head><body><main class="card"><div class="mark">W</div>${body}</main></body></html>`
}

export interface ConsentView {
  userName: string
  userEmail: string
  clientName: string
  redirectHost: string
  loopback: boolean
  hidden: Record<string, string>
}

export function renderConsent(v: ConsentView): string {
  const inputs = Object.entries(v.hidden)
    .map(([k, val]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(val)}">`)
    .join('')
  return page(
    'Cho phép kết nối',
    `<h1>${escapeHtml(v.clientName)} muốn nối vào Work System của bạn</h1>
<div class="who">${escapeHtml(v.userName)} · ${escapeHtml(v.userEmail)}</div>
<p>Khi cho phép, ứng dụng này sẽ thay bạn:</p>
<ul><li>Đọc, tạo và cập nhật task của bạn</li><li>Ghi kết quả mỗi lần chạy và báo cáo tuần</li><li>Không đọc hay ghi được dữ liệu của người khác</li></ul>
<p>Sau khi cho phép, bạn sẽ được đưa về:</p>
<div class="host">${escapeHtml(v.redirectHost)}</div>
${v.loopback ? '<div class="warn">Ứng dụng này chạy trên máy của bạn (localhost). Chỉ cho phép nếu bạn vừa bấm kết nối từ Claude Code.</div>' : ''}
<form method="post" action="/oauth/authorize">${inputs}
<div class="row"><button class="deny" name="decision" value="deny">Từ chối</button><button class="allow" name="decision" value="allow">Cho phép</button></div>
</form>
<p style="margin:16px 0 0;font-size:12.5px">Bạn có thể ngắt kết nối bất cứ lúc nào ở mục Kết nối trên Work System.</p>`,
  )
}

export function renderOAuthError(message: string): string {
  return page('Không kết nối được', `<h1>Không kết nối được</h1><div class="err">${escapeHtml(message)}</div><p style="margin-top:14px">Quay lại Claude và thử thêm connector lần nữa. Nếu vẫn lỗi, gửi ảnh màn hình này cho admin.</p>`)
}
