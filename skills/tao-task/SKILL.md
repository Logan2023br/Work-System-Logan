---
name: tao-task
description: Khai báo một việc định kỳ mới lên Work System — hỏi ngắn vài câu (việc gì, lịch, chỉ số, nút), rồi gọi tao_task. Dùng khi người dùng nói "tạo task", "thêm việc tự chạy".
---

# Tạo task Work System

Mục tiêu: biến một việc định kỳ của người dùng thành task chạy tự động qua vòng Điều phối.

## Hỏi người dùng (gọn, từng nhóm, đề xuất sẵn câu trả lời)

1. **Việc gì?** Tên ngắn và một câu mô tả. Kết quả mong muốn sau mỗi lần chạy.
2. **Khi nào chạy?** Đổi sang cron 5 trường theo **giờ Việt Nam**:
   - "9 giờ sáng các ngày trong tuần" → `0 9 * * 1-5`
   - "9:30 và 15:30 mỗi ngày" → `30 9,15 * * *`
   - "16 giờ thứ 6" → `0 16 * * 5`
3. **Claude cần làm gì khi đến hạn?** Viết thành `instructions` rõ ràng, từng bước, nêu nguồn dữ liệu (sheet nào, thư mục nào) và cách xác định thành công/thất bại.
4. **Đo bằng gì?** 1–8 `metrics` (`label`, `value`, `note`), `progress` (`done`/`total`/`unit`), `trendLabel` cho chuỗi số theo thời gian.
5. **Nút trên web?** Tối đa 6 `actions` ngoài nút "Chạy ngay" có sẵn, ví dụ `{ id: "duyet", label: "Duyệt mẫu", kind: "review", instructions: "…" }`. `kind`: `review` (chờ duyệt), `fix` (xử lý lỗi), `custom`.
6. **Khối tùy chọn** nếu cần: `table`, `checklist`, `chart` (tối đa 3 series), `note` (markdown đơn giản).

## Tạo

- `slug`: chữ thường không dấu, số, gạch nối (ví dụ `bao-cao-ticket`).
- Tóm tắt lại cho người dùng rồi gọi `tao_task`.
- Nếu báo trùng slug → đề nghị dùng `sua_task` hoặc slug khác.
- Sau khi tạo: nhắc người dùng xem task trên Work System; nếu họ chưa có tác vụ hẹn giờ "dieu-phoi" thì hướng dẫn mở mục **Nối Claude** trên web.

## Tuyệt đối không

- Không ghi mật khẩu, API key, token, cookie hay dữ liệu cá nhân khách hàng vào bất kỳ trường nào — đồng nghiệp xem được toàn bộ task. Dùng connector có sẵn của người dùng để truy cập dịch vụ.
