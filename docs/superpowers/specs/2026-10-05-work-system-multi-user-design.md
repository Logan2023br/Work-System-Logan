# Work System nhiều người dùng — Thiết kế

Ngày: 2026-10-05 · Chủ sản phẩm: Logan (tutnv@bravebits.vn)
Chuẩn chất lượng: sản phẩm doanh nghiệp có thể bán — đúng, an toàn, bền, giao diện cao cấp. Không thêm gì không phục vụ mục tiêu.

## 1. Mục tiêu

Biến dashboard một người (Work-System-Logan: React + Vite đọc `public/data/*.json`) thành hệ thống cho team ~10 người:

1. Đăng nhập → thấy **việc và báo cáo của mình**.
2. Mục **Đồng nghiệp** → xem **toàn bộ** không gian của bất kỳ ai (chỉ đọc).
3. Mỗi người kết nối **Claude desktop app** của mình. Claude (theo bộ skill chung) khai báo task, chạy việc theo lịch, đẩy tiến độ / chỉ số / log / báo cáo tuần lên.
4. Chủ task **điều khiển từ web**: đổi lịch, tạm dừng, bấm nút hành động; Claude nhận và thực thi.
5. Công việc mỗi người khác nhau: khung chung, chỉ số và nội dung riêng.

**Tiêu chí thành công (đo được):**
- Bấm nút trên web → Claude thực thi trong ≤ 15 phút (giờ làm việc, máy chủ task đang bật) và web hiện kết quả trong ≤ 30 giây sau khi Claude báo.
- Không có lần chạy trùng, không mất kết quả khi Claude gửi lại.
- Không ai ghi được dữ liệu của người khác, bằng bất kỳ đường nào.
- Trang chủ hiện nội dung ≤ 1,5 giây (không tính cold start DB).

## 2. Ràng buộc đã chốt

| Mục | Quyết định |
|---|---|
| Quan hệ với CPM – BraveBits | Tách riêng hoàn toàn |
| Đăng nhập | Google, chỉ `@bravebits.vn` |
| Nơi Claude chạy | Claude desktop app (tab Code → Routines → Local) |
| Hosting | Vercel (Hobby để thử; dùng chính thức nên lên Pro — Hobby là phi thương mại) |
| Database | Postgres tạo trong Vercel Storage (Neon), gói miễn phí |
| Độ linh hoạt | Khung chuẩn + khối tùy chọn |
| Điều khiển từ web | Có, qua hàng lệnh chờ |
| Điều phối | 15 phút/lần, T2–T6 08:00–19:00 giờ VN, mỗi người chỉnh được |

**Sự thật kỹ thuật làm nền:**
- Project **không đọc được** tài khoản Claude và **không gọi xuống được** Claude desktop. Mọi giao tiếp đi một chiều: Claude gọi MCP của project.
- Tác vụ hẹn giờ local của Claude desktop chỉ chạy khi **app mở và máy thức**; lỡ giờ thì chạy bù đúng một lần khi máy thức. Chu kỳ 15 phút đặt được (nhờ Claude đặt bằng lời). Routine cloud tối thiểu 1 giờ → không dùng cho Điều phối.
- Lần chạy đầu của tác vụ hẹn giờ phải "always allow" các tool MCP, nếu không các lần sau treo chờ duyệt. Không tool nào được đánh dấu `requiresUserInteraction`.

## 3. Kiến trúc

```
┌──────────────────── Vercel (1 repo) ─────────────────────┐
│  Web SPA (React + Vite)                                  │
│  /api/*    REST cho web — session cookie                 │
│  /mcp      MCP cho Claude — OAuth bearer token           │
│  /oauth/*  OAuth 2.1 (DCR + PKCE), bước login = Google   │
│  core/     logic + phân quyền dùng chung cho /api, /mcp  │
│  Postgres (Neon qua Vercel Storage)                      │
└──────────────────────────────────────────────────────────┘
        ▲ mỗi 15' trong giờ làm
Claude desktop từng người: connector "Work System" + bộ skill + tác vụ "dieu-phoi"
```

**Nguyên tắc:**
- **Project giữ lịch, Claude chỉ thực thi.** Đổi lịch trên web có hiệu lực ở lần Điều phối kế tiếp.
- **Một lõi logic (`core/`)** chứa mọi thao tác và kiểm tra quyền. `/api` và `/mcp` là vỏ mỏng, không tự truy vấn DB.
- **Một nguồn kiểu dữ liệu:** schema zod → validate API, MCP và sinh kiểu TS cho frontend.

**Công nghệ:** React 19 + Vite + framer-motion (giữ); Vercel Functions (Node, TS); Drizzle ORM + `@neondatabase/serverless`; zod; `@modelcontextprotocol/sdk` (Streamable HTTP, stateless) qua `mcp-handler`; Google OAuth bằng `arctic`; `cron-parser` (múi giờ `Asia/Ho_Chi_Minh`); Vitest.

## 4. Xác thực, phân quyền, bảo mật

**Web:** Google OAuth → kiểm tra `email_verified` và `hd = bravebits.vn` → upsert `users` → session lưu DB (cookie httpOnly, Secure, SameSite=Lax, hạn 30 ngày). Mọi request ghi kiểm tra Origin (chống CSRF).

**Connector Claude (đặc tả MCP authorization):**
- `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`.
- Đăng ký client động (DCR); `/oauth/authorize` với PKCE bắt buộc: chưa có session thì qua Google login → màn hình chấp thuận → code (sống 60 giây, dùng một lần).
- `/oauth/token`: access token 1 giờ, refresh token 90 ngày, xoay vòng refresh. Lưu **hash** trong DB. Người dùng xem và thu hồi trên trang Kết nối.

**Vai trò:** `member` (mặc định) và `admin` (Logan). Admin có đúng một quyền thêm: **vô hiệu hóa người dùng** (nghỉ việc) → xóa session + thu hồi mọi token ngay lập tức; dữ liệu giữ nguyên, hiển thị "đã rời".

**Ma trận quyền:**
| Hành động | Chủ | Đồng nghiệp | Admin |
|---|---|---|---|
| Xem toàn bộ không gian một người | ✓ | ✓ | ✓ |
| Đổi lịch, tạm dừng, khung giờ, bấm nút | ✓ | ✗ | ✗ (chỉ chủ) |
| Ghi qua MCP | chỉ dữ liệu của chính chủ token | ✗ | ✗ |
| Vô hiệu hóa người dùng | ✗ | ✗ | ✓ |

**Bất biến bảo mật (test bắt buộc):**
1. Danh tính chỉ lấy từ session/token, không bao giờ từ tham số client.
2. **Chỉ chủ task tạo ra được nội dung mà Claude của chủ đó sẽ thực thi** (`instructions`, `actions`, `payload` lệnh). Đồng nghiệp không có đường nào đưa chỉ thị vào Claude của người khác.
3. Không bao giờ lưu bí mật (API key, mật khẩu) trong task: mọi trường hiển thị cho đồng nghiệp. Skill cấm điều này; Claude dùng connector có sẵn của người dùng để truy cập dịch vụ.
4. Dữ liệu Claude đẩy lên hiển thị dạng văn bản (React escape; markdown của khối `note` render qua whitelist, không HTML thô).

## 5. Mô hình dữ liệu

Thời gian lưu `timestamptz`; hiển thị và tính lịch theo giờ VN. Tuần = tuần ISO theo giờ VN.

**`users`** — `id`, `email` (unique), `name`, `avatar_url`, `role` (`member`|`admin`), `active` (bool), `work_days` (mặc định `1-5`), `work_start` (`08:00`), `work_end` (`19:00`), `last_seen_at`, `created_at`.

**`tasks`**
- `id`, `owner_id`, `slug` (unique theo owner, `[a-z0-9-]`), `position`, `created_at`, `updated_at`.
- **Khung chuẩn:** `name`, `summary`, `mode` (`auto`|`review`), `state` (`running`|`healthy`|`needs-you`|`blocked`|`idle`), `state_label`, `health` (0–1), `progress {done,total,unit}`, `metrics [{label,value,note}]`, `trend number[]` (tối đa 30 điểm), `trend_label`, `milestones [{title,state,note,date}]`, `sources [{name,kind,location,status,syncedAt}]`, `report {headline,body[],blockers[],next[]}`.
- **Lịch:** `cron`, `schedule_label`, `paused`, `next_run_at`, `last_run_at`, `lease_id`, `lease_until`.
- **Khối tùy chọn `blocks`** (≤ 12): `{id, type, title, data}`:
  - `table`: `{columns: string[], rows: (string|number)[][]}` (≤ 200 dòng)
  - `checklist`: `{items: [{text, done}]}` (≤ 100 mục)
  - `chart`: `{kind: 'line'|'bar', labels: string[], series: [{name, values: number[]}]}` (≤ 4 series, ≤ 60 điểm)
  - `note`: `{text}` (markdown giới hạn, ≤ 4.000 ký tự)
- **Chỉ thị:** `instructions` (bắt buộc, ≤ 8.000 ký tự), `skill` (tùy chọn).
- **Nút `actions`** (≤ 6): `{id, label, kind: 'review'|'fix'|'custom', instructions}`. Nút **"Chạy ngay"** có sẵn cho mọi task, không khai báo.
- Tổng JSON một task ≤ 256 KB.

**`runs`** — `id`, `task_id`, `command_id?`, `lease_id?` (unique khi có), `trigger` (`schedule`|`command`|`manual`), `status` (`ok`|`partial`|`failed`), `started_at`, `finished_at`, `duration_ms`, `note`, `log string[]` (≤ 200 dòng × 500 ký tự). **Giữ log 30 ngày**, sau đó xóa `log`, giữ phần tóm tắt (dung lượng gói miễn phí).

**`commands`** — `id`, `task_id`, `owner_id`, `action_id` (`run` hoặc id trong `actions`), `label`, `instructions` (chụp lại tại thời điểm bấm), `note?` (người dùng ghi thêm khi bấm, ≤ 1.000 ký tự), `status` (`pending`|`claimed`|`done`|`failed`|`expired`|`cancelled`), `result`, `created_at`, `claimed_at`, `finished_at`. Mỗi task tối đa 5 lệnh `pending`.

**`weekly_reports`** — `owner_id`, `week` (`2026-W40`), `summary`, `good`/`bad`/`next [{text, task, weight?}]`, `pattern`, `submitted_at`. Khóa (`owner_id`,`week`); nộp lại = ghi đè.

**`activity`** — `owner_id`, `task_id?`, `at`, `level` (`ok`|`error`|`wait`), `text`. Do `core` tự ghi, không có API ghi trực tiếp.

**`sessions`, `oauth_clients`, `oauth_codes`, `oauth_tokens`** — phục vụ mục 4.

Trang **Kết nối** suy ra từ `tasks.sources` gộp theo `kind` + danh sách token connector; không có bảng riêng.

## 6. Giao thức Điều phối (phần lõi — phải đúng tuyệt đối)

**Lease (hợp đồng nhận việc):** mỗi việc giao cho Claude kèm `lease_id` duy nhất, hạn 60 phút.

**`dieu_phoi()`** chạy trong một transaction:
1. Ghi `last_seen_at = now`.
2. Lệnh: chọn `pending` của chủ token → `claimed`, gắn lease. Lệnh `claimed` quá 60' → `expired`.
3. Task đến hạn: `!paused` ∧ `next_run_at ≤ now` ∧ (`lease_until` rỗng ∨ `< now`) → gắn lease mới. Dùng `UPDATE … WHERE … RETURNING` để hai lần Điều phối chồng nhau không nhận cùng một việc.
4. **Gộp trùng:** task vừa đến hạn vừa có lệnh "Chạy ngay" chờ → chỉ giao **một** việc (loại lệnh); lần chạy đó đồng thời tính là lần chạy theo lịch.
5. Trả `{viec: [{lease_id, loai: 'lich'|'lenh', task: {slug,name,instructions,skill}, lenh?: {label, instructions, note}}]}`, sắp lệnh trước, lịch sau. Rỗng → Claude dừng ngay (chi phí gần như bằng 0).

**`bao_ket_qua({lease_id?, slug, status, ...})`:**
- Có `lease_id`: **idempotent** — lease đã dùng thì trả "đã ghi" và không ghi lại. Lease hết hạn vẫn được nhận (công việc đã làm thật), miễn chưa dùng; lệnh đã `expired` vẫn được đóng thành `done`/`failed`.
- Không có `lease_id`: lần chạy `manual` (người dùng nhờ Claude chạy trong cuộc trò chuyện).
- Ghi `runs`; đóng lệnh liên quan (`done` nếu `ok`/`partial`, `failed` nếu `failed`) với `result = note`; cập nhật task; xóa lease **chỉ khi** `task.lease_id` trùng lease được báo (không xóa lease mới của lần giao khác); `last_run_at = now`; `next_run_at` = lần kế tiếp của cron **sau now** (lỡ nhiều lần chỉ chạy bù một lần); ghi `activity`.
- Trạng thái mặc định nếu Claude không chỉ định: `failed` → `blocked`, `ok` → `healthy`, `partial` → `needs-you`.

**Đổi lịch trên web:** kiểm tra cron hợp lệ → tính lại `next_run_at` từ now. **Bỏ tạm dừng:** `next_run_at` tính từ now (không chạy bù thời gian dừng).

**Khung giờ làm việc** chỉ quyết định khi nào tác vụ hẹn giờ của Claude chạy, và dùng để xác định "offline" (quá 30' không heartbeat trong khung giờ). Server không chặn theo giờ.

## 7. MCP tools (6 tool, tên tiếng Việt không dấu)

| Tool | Việc |
|---|---|
| `dieu_phoi` | Mục 6. |
| `bao_ket_qua` | Mục 6. Trường cập nhật tùy chọn: `state`, `state_label`, `health`, `progress`, `metrics`, `trend_them` (số thêm vào cuối, giữ 30 điểm gần nhất), `milestones`, `blocks`, `report`, `log`, `note`. |
| `tao_task` | Tạo task: khung chuẩn + `cron`, `instructions`, `actions`, `blocks`. |
| `sua_task` | Cập nhật một phần theo `slug`; các mảng thay nguyên. Không đổi được `owner`, lease, lịch sử. |
| `xem_task` | Không `slug` → danh sách gọn task của mình; có `slug` → chi tiết + 10 run gần nhất. |
| `nop_bao_cao_tuan` | Upsert báo cáo tuần (mặc định tuần hiện tại). |

Mọi lỗi validate trả thông điệp chỉ rõ trường và giới hạn, để Claude tự sửa và gửi lại; không ghi gì khi lỗi.

## 8. Bộ skill Work System

1. **`dieu-phoi`** — nội dung tác vụ hẹn giờ: gọi `dieu_phoi`; rỗng thì dừng; làm từng việc theo `instructions`/`skill` (+ `note` của lệnh); **luôn** `bao_ket_qua` kèm `lease_id`, kể cả khi lỗi; lỗi một việc không dừng việc khác; không hỏi người dùng.
2. **`tao-task`** — phỏng vấn ngắn (việc, lịch, chỉ số, đơn vị tiến độ, nút, khối) → `tao_task` → đưa link task trên web. Cấm đưa bí mật vào task.
3. **`bao-cao-tuan`** — đọc task + run của tuần qua `xem_task` → viết good/bad/next/pattern → `nop_bao_cao_tuan`. Thường được gắn làm `skill` của một task cron chiều thứ 6.

Việc chuyên môn từng người nằm trong `instructions`; quy trình phức tạp → skill riêng, ghi tên vào `task.skill`.

## 9. Giao diện

**Định hướng:** giữ và nâng cấp ngôn ngữ "Bàn điều phối" đang có — mặt bàn graphite (máy chạy) + tờ giấy (người đọc); **màu chỉ mang nghĩa trạng thái** (`--needs` vàng hổ phách = cần bạn, `--run` xanh ngọc = chạy tốt, `--bad` đỏ = hỏng, `--idle` xám xanh = nằm chờ); chữ Bricolage Grotesque / Schibsted Grotesk / DM Mono; chuyển động framer-motion có chủ đích. Cảm giác: phòng điều hành cao cấp, yên tĩnh, đọc được trong 3 giây.

**Màn hình:**
1. **Bàn điều phối (của tôi)** — hiện có; thêm thanh trạng thái Claude (online / offline từ HH:MM / lần Điều phối kế tiếp) và hàng lệnh đang xử lý.
2. **Đội ngũ** — lưới thẻ đồng nghiệp: avatar, chấm heartbeat sống (nhịp nhẹ khi online), vòng sức khỏe tổng, số task theo trạng thái, việc nổi bật nhất cần chú ý. Bấm → không gian người đó với dải "Đang xem không gian của X · chỉ đọc", mọi nút điều khiển ẩn.
3. **Không gian task** — hiện có; thêm render `blocks`, các nút `actions` + "Chạy ngay" (có ô ghi chú tùy chọn), **dòng đời lệnh** hiển thị như vé di chuyển qua các trạng thái *Chờ → Claude đã nhận → Xong/Lỗi*, kèm thời gian.
4. **Lịch chạy** — hiện có; thêm sửa cron với mô tả tiếng Việt dễ đọc và xem trước 3 lần chạy kế; công tắc tạm dừng.
5. **Nhìn lại tuần** — hiện có; đọc từ `weekly_reports`, chọn tuần.
6. **Kết nối** — nguồn dữ liệu + token connector (thu hồi được) + **hướng dẫn thiết lập 4 bước** có tiến trình tự đánh dấu (connector đã nối? đã có heartbeat? đã có task?), câu lệnh mẫu copy một chạm để nhờ Claude tạo tác vụ "dieu-phoi" theo khung giờ của người đó; chỉnh khung giờ ở đây.
7. **Đăng nhập** — một màn hình, một nút Google, đúng tinh thần thương hiệu.

**Chuẩn hoàn thiện (bắt buộc, không phải "nếu kịp"):**
- **Bảng lệnh ⌘K**: nhảy tới người, task, màn hình.
- Trạng thái **tải** bằng skeleton đúng hình bố cục; trạng thái **trống** có hướng dẫn hành động kế tiếp (vd người mới: đi thẳng vào hướng dẫn thiết lập); trạng thái **lỗi** có nút thử lại.
- **Cập nhật lạc quan** khi bấm nút / đổi lịch, hoàn tác khi server từ chối.
- Dữ liệu tự làm mới mỗi 30 giây **chỉ khi tab đang hiển thị**; thay đổi mới chạy hiệu ứng nhẹ ở đúng phần tử đổi.
- Tôn trọng `prefers-reduced-motion`; điều hướng bàn phím đầy đủ; tương phản đạt WCAG AA.
- Ưu tiên desktop; tablet dùng tốt; điện thoại xem đầy đủ (điều khiển vẫn dùng được).
- Thời gian tương đối tiếng Việt ("3 phút trước"), số dùng `tabular-nums`.

## 10. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Claude offline | Hiện "offline từ HH:MM"; lệnh giữ `pending`; online lại thì nhận. Chủ có thể hủy lệnh `pending`. |
| Claude nhận việc rồi im lặng | Lease hết 60' → task đến hạn lại; lệnh → `expired`, bấm lại được. |
| Claude gửi kết quả hai lần | Lease idempotent → ghi một lần. |
| Điều phối chạy chồng | Gắn lease bằng `UPDATE … RETURNING` trong transaction. |
| Dữ liệu sai khung / vượt giới hạn | zod từ chối, thông điệp chỉ rõ trường; không ghi gì. |
| Cron không hợp lệ | Từ chối, giữ cron cũ. |
| Token hết hạn / bị thu hồi / người dùng bị vô hiệu | MCP trả 401; Claude refresh hoặc yêu cầu nối lại. |
| Email ngoài domain | Từ chối đăng nhập, thông báo rõ. |
| DB cold start | Skeleton che; request có timeout và thử lại một lần ở client. |

## 11. Kiểm thử

- **Unit:** tính `next_run_at` (cron, giờ VN, chạy bù một lần, bỏ tạm dừng); gộp trùng lệnh/lịch; idempotency lease; giới hạn dữ liệu trong zod.
- **Tích hợp (Postgres thật — Neon branch hoặc Postgres local):** từng MCP tool và route `/api`; hai `dieu_phoi` đồng thời không nhận trùng; **mọi bất biến bảo mật mục 4** (đồng nghiệp ghi qua API → 403; token người A ghi task người B → không tìm thấy; người bị vô hiệu → 401).
- **E2E (Playwright):** đăng nhập giả lập → bấm "Chạy ngay" → giả lập Claude gọi `dieu_phoi` + `bao_ket_qua` → web hiện "Xong".
- **Thử thật:** Logan nối Claude desktop, seed 4 task hiện có, chạy ≥ 1 ngày làm việc trước khi mời team.

## 12. Thứ tự triển khai

1. **Nền:** Vercel + Postgres + schema/migration + đăng nhập Google + `core/` + `/api` đọc; web đọc từ API; seed dữ liệu Logan; màn hình Đội ngũ + xem đồng nghiệp.
2. **MCP:** OAuth 2.1/DCR + `/mcp` với `tao_task`, `sua_task`, `xem_task`, `bao_ket_qua` (chưa lease), `nop_bao_cao_tuan`.
3. **Điều phối & điều khiển:** lease, `dieu_phoi`, lệnh từ web, sửa lịch, tạm dừng, nút `actions`, heartbeat, render `blocks`.
4. **Hoàn thiện & ra mắt:** bộ skill, hướng dẫn thiết lập, ⌘K, các trạng thái tải/trống/lỗi, vô hiệu hóa người dùng, dọn log 30 ngày (Vercel Cron hằng ngày), chạy thử với Logan → mời team.

## 13. Cố ý không làm

Thông báo Slack/email; trang quản lý riêng (màn hình Đội ngũ đã đủ); tạo/sửa toàn bộ task trên web; phân quyền nhiều cấp; chế độ sáng riêng; Điều phối trên cloud; tích hợp CPM; đa tổ chức.
