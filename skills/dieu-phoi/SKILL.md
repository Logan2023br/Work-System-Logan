---
name: dieu-phoi
description: Vòng Điều phối Work System chạy mỗi 15 phút — gọi dieu_phoi, làm từng việc được giao, luôn báo kết quả kèm leaseId. Dùng cho tác vụ hẹn giờ "dieu-phoi".
---

# Điều phối Work System

Bạn đang chạy **tự động** theo lịch, không có ai ngồi trước màn hình. Không hỏi lại người dùng. Làm xong thì dừng.

## Quy trình

1. Gọi tool `dieu_phoi` của connector **Work System**.
2. Nếu kết quả nói **không có việc** → kết thúc ngay, không làm gì thêm.
3. Với **từng** việc trong `viec` (lệnh trước, lịch sau):
   1. Ghi lại thời điểm bắt đầu.
   2. Đọc `task.instructions` — đó là việc cần làm. Nếu là **lệnh** (`loai: "lenh"`), làm theo `lenh.instructions` và ưu tiên `lenh.note` (ghi chú người dùng gửi kèm).
   3. Nếu `task.skill` có giá trị, dùng skill đó cho phần chuyên môn.
   4. Thực hiện bằng các connector/công cụ bạn có (Google Sheets, Drive, Crisp…). Ghi từng bước quan trọng thành một dòng log ngắn.
   5. Gọi `bao_ket_qua` với:
      - `slug`: `task.slug`
      - `leaseId`: **đúng** `leaseId` của việc này
      - `status`: `ok` (xong), `partial` (xong một phần, cần người xem), `failed` (không làm được)
      - `note`: một câu tóm tắt kết quả, viết cho người đọc nhanh
      - `log`: các dòng bước đã làm (tối đa 200 dòng, mỗi dòng ≤ 500 ký tự)
      - `durationMs`: thời gian đã chạy
      - Khi có số liệu mới: `metrics`, `progress`, `trendThem` (số mới thêm vào xu hướng), `milestones`, `report` (headline, body, blockers, next), `blocks`
4. Một việc lỗi **không** được làm dừng các việc khác: báo `failed` kèm lý do trong `note` rồi làm việc tiếp theo.
5. Nếu `bao_ket_qua` trả lỗi về dữ liệu, sửa đúng trường được nêu và gửi lại **cùng** `leaseId` (gửi lại cùng leaseId là an toàn, không bị ghi hai lần).

## Quy tắc

- **Luôn** gọi `bao_ket_qua` cho mọi việc đã nhận — kể cả khi lỗi, kể cả khi không có gì thay đổi.
- Không bao giờ ghi mật khẩu, API key, token hay dữ liệu cá nhân của khách hàng vào Work System — đồng nghiệp xem được mọi thứ.
- Nếu connector Work System không gọi được (mất kết nối, 401), dừng lại: lần Điều phối sau sẽ thử lại.
- Biểu đồ trong `blocks` tối đa 3 series.
