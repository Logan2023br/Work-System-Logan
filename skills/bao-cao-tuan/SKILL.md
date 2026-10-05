---
name: bao-cao-tuan
description: Viết báo cáo tuần trên Work System từ kết quả các task trong tuần (tốt, chưa ổn, tuần tới, mẫu hình) rồi nộp bằng nop_bao_cao_tuan. Dùng chiều thứ 6 hoặc khi được nhờ.
---

# Báo cáo tuần Work System

1. Gọi `xem_task` (không slug) để lấy danh sách task; với mỗi task gọi `xem_task` kèm `slug` để đọc 10 lần chạy gần nhất, chỉ số, báo cáo.
2. Chỉ xét các lần chạy trong tuần hiện tại (thứ 2 → chủ nhật, giờ Việt Nam).
3. Viết:
   - `summary`: 2–3 câu, nói thẳng điều quan trọng nhất của tuần.
   - `good`: việc chạy tốt, có số liệu; mỗi mục ghi `task` = slug liên quan.
   - `bad`: việc hỏng/chậm, nguyên nhân nếu biết; `weight` là cụm ngắn nói mức ảnh hưởng (≤ 80 ký tự).
   - `next`: việc nên làm tuần tới, cụ thể, có người/việc rõ ràng.
   - `pattern`: điểm chung của các sự cố trong tuần (nếu có).
4. Gọi `nop_bao_cao_tuan` (bỏ trống `week` để dùng tuần hiện tại). Nộp lại cùng tuần sẽ ghi đè.
5. Nếu đang chạy trong vòng Điều phối (task có `skill: "bao-cao-tuan"`), sau khi nộp gọi `bao_ket_qua` với `leaseId` của việc đó.

Không đưa mật khẩu, token hay dữ liệu cá nhân khách hàng vào báo cáo.
