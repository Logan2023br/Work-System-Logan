# Work System

Bàn điều phối của team: mỗi người nối Claude desktop của mình, Claude chạy việc theo lịch và báo tiến độ, chỉ số, báo cáo tuần lên đây. Mọi người xem được bàn của nhau (chỉ đọc).

Thiết kế: `docs/superpowers/specs/2026-10-05-work-system-multi-user-design.md`

## Chạy trên máy

```bash
npm install
cp .env.example .env      # bỏ dấu # trước DEV_LOGIN=1 để đăng nhập không cần Google trên localhost
npm run seed -- --demo    # dừng `npm run dev` trước khi seed (PGlite chỉ mở được một lần)
npm run dev               # http://localhost:5173
```

Đăng nhập nhanh khi dev: `http://localhost:5173/auth/dev?email=tutnv@bravebits.vn&name=Logan`

Test: `npm test` · Kiểm tra kiểu: `npm run typecheck`

## Triển khai (Vercel)

1. **Google OAuth:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   Authorized redirect URI: `https://<domain>/auth/google/callback` (thêm `http://localhost:5173/auth/google/callback` nếu muốn test Google thật ở local).
   OAuth consent screen: *Internal* (chỉ người trong Workspace bravebits.vn).
2. **Vercel project:** import repo; Framework = Vite.
3. **Database:** tab *Storage* → *Create Database* → Neon Postgres (Free) → *Connect* vào project. Vercel tự thêm `DATABASE_URL`.
4. **Biến môi trường (Production + Preview):**
   `PUBLIC_URL=https://<domain>` · `ALLOWED_DOMAIN=bravebits.vn` · `ADMIN_EMAILS=tutnv@bravebits.vn` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET`. **Không** đặt `DEV_LOGIN`.
5. **Deploy:** push lên nhánh chính. Lệnh `vercel-build` tự chạy migration (chỉ trên bản production, bản preview bỏ qua) rồi build.
6. **Nạp dữ liệu mẫu (một lần):** `DATABASE_URL=<chuỗi Neon> npm run seed`.

## Nối Claude desktop

Claude nối vào Work System qua máy chủ của Anthropic, nên app phải có **địa chỉ HTTPS công khai** (bản Vercel). `localhost` không dùng được cho connector.

1. Trên Work System (bản Vercel) → mục **Kết nối** → chép địa chỉ connector (`https://<domain>/mcp`).
2. Claude desktop → **Settings → Connectors → Add custom connector** → dán địa chỉ → **Connect**.
3. Trình duyệt mở trang đăng nhập Google → màn hình "Claude muốn nối vào Work System của bạn" → **Cho phép**.
4. Trong một cuộc trò chuyện mới: "Dùng Work System, xem task của tôi" — Claude gọi `xem_task`.

Kiểm tra máy chủ MCP không cần Claude: `npx @modelcontextprotocol/inspector` → Transport *Streamable HTTP* → URL `https://<domain>/mcp` → *Connect* (đi qua đúng luồng OAuth).

Ngắt kết nối: mục **Kết nối** → **Ngắt kết nối** (bấm hai lần). Admin vô hiệu hóa một người cũng ngắt mọi kết nối Claude của người đó.

## Cấu trúc

- `shared/` — schema zod và kiểu DTO dùng chung cho web và server
- `server/core/` — toàn bộ logic và phân quyền
- `server/http/` — app Hono: `/auth/*`, `/api/*`
- `api/router.ts` — Vercel Function duy nhất; `vercel.json` rewrite mọi đường backend về đây
- `src/` — web React
