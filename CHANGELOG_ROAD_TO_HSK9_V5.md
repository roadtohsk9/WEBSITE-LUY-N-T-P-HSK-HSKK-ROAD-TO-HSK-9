# ROAD TO HSK 9 — V5

## Đăng nhập / tạo tài khoản bằng Google (không có PRO)
- `login.html`: thêm nút "Tiếp tục với Google" (ẩn tự động nếu chưa cấu hình).
- Server: `POST /api/candidate/google` xác thực ID token với Google, kiểm tra `aud` + email đã verify.
- Lần đầu đăng nhập sẽ tự tạo tài khoản `auth_provider='google'` **không có PRO, không có khóa học**.
- Cấu hình: biến môi trường `GOOGLE_CLIENT_ID` (xem `.env.example`).

## PRO theo từng kỹ năng — áp dụng cho cả 4 kỹ năng
- Trước đây Reading/Listening mở tự do; nay **Listening, Reading, Writing, Speaking** đều theo cùng quy tắc:
  1. Admin mở/khóa riêng từng đề (ưu tiên cao nhất)
  2. Test 1 của mỗi kỹ năng ở mỗi cấp HSK: miễn phí
  3. Kỹ năng nằm trong gói PRO còn hạn (hoặc đăng ký khóa học = PRO 4 kỹ năng)
  4. Còn lại: khóa
- Admin → tab mới **★ PRO kỹ năng**: bảng mọi tài khoản + chip từng kỹ năng, nút **Chỉnh PRO** mở hộp thoại tick Listening/Reading/Writing/Speaking, chọn số ngày (30/90/180/365), Lưu hoặc **Thu hồi toàn bộ PRO**.
- Danh sách Accounts và Google Accounts hiển thị chip PRO theo kỹ năng; nút PRO cũ dùng chung hộp thoại mới.
- API mới: `DELETE /api/admin/users/:id/pro`; `POST .../pro` nhận `replace:true` để đặt lại hạn chính xác.
