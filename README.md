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

Test: `npm test` · E2E (Playwright): `npm run e2e` · Kiểm tra kiểu: `npm run typecheck`

## Triển khai (Vercel)

1. **Google OAuth:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   Authorized redirect URI: `https://<domain>/auth/google/callback` (thêm `http://localhost:5173/auth/google/callback` nếu muốn test Google thật ở local).
   OAuth consent screen: *Internal* (chỉ người trong Workspace bravebits.vn).
2. **Vercel project:** import repo; Framework = Vite.
3. **Database:** tab *Storage* → *Create Database* → Neon Postgres (Free) → *Connect* vào project. Vercel tự thêm `DATABASE_URL`.
4. **Biến môi trường (Production + Preview):**
   `PUBLIC_URL=https://<domain>` · `ALLOWED_DOMAIN=bravebits.vn` · `ADMIN_EMAILS=tutnv@bravebits.vn` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `CRON_SECRET` (chuỗi ngẫu nhiên dài — Vercel Cron gọi `/api/cron/cleanup` lúc 03:00 giờ VN mỗi ngày để dọn log > 30 ngày, phiên và token hết hạn). **Không** đặt `DEV_LOGIN`.
5. **Deploy:** push lên nhánh chính. Lệnh `vercel-build` tự chạy migration (chỉ trên bản production, bản preview bỏ qua) rồi build.
6. **Nạp dữ liệu mẫu (một lần):** `DATABASE_URL=<chuỗi Neon> npm run seed`.

## Nối Claude desktop

Trên Work System (bản Vercel) mở mục **Nối Claude** — 4 bước, tự đánh dấu khi xong:

1. Thêm connector `https://<domain>/mcp` (Settings → Connectors → Add custom connector).
2. Cài bộ skill: `dieu-phoi`, `tao-task`, `bao-cao-tuan` (tải zip ngay trên trang).
3. Tạo tác vụ hẹn giờ local "dieu-phoi" trong tab Code (câu lệnh mẫu có sẵn, lịch theo khung giờ của từng người), **Run now** một lần và **Always allow**.
4. Nhờ Claude "Dùng skill tao-task để tạo task mới".

Claude chỉ gọi tới được địa chỉ HTTPS công khai — `localhost` không dùng cho connector.

## Danh sách kiểm tra trước khi mời team

- [ ] Tạo **Client Secret mới** cho Google OAuth (secret cũ từng được dán vào chat) và chỉ đặt trong biến môi trường Vercel.
- [ ] Vercel: gói Pro cho mục đích công ty (Hobby là phi thương mại); `PUBLIC_URL`, `ADMIN_EMAILS`, `CRON_SECRET` đã đặt; **không** đặt `DEV_LOGIN`.
- [ ] Google OAuth: redirect `https://<domain>/auth/google/callback`; Audience = Internal (nếu project thuộc Workspace bravebits.vn).
- [ ] Logan nối Claude desktop, chạy Điều phối ≥ 1 ngày làm việc: vé lệnh đi hết vòng, báo cáo tuần nộp được.
- [ ] Mời team: gửi link Work System, mọi người làm 4 bước ở mục **Nối Claude**.

## Cấu trúc

- `shared/` — schema zod và kiểu DTO dùng chung cho web và server
- `server/core/` — toàn bộ logic và phân quyền
- `server/http/` — app Hono: `/auth/*`, `/api/*`
- `api/router.ts` — Vercel Function duy nhất; `vercel.json` rewrite mọi đường backend về đây
- `src/` — web React
