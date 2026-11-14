# Cập nhật: Admin 4 kỹ năng + phòng thi thử HSK 6

## Các thay đổi

- HSK Exam Studio trong Admin có thêm mục **Writing** và **HSKK Cao cấp** (dữ liệu nội bộ dùng skill `speaking` để tương thích với hệ thống hiện tại).
- Admin có thể soạn Writing; riêng HSK 6 có trường văn bản nguồn tiếng Trung + yêu cầu viết tóm tắt + số chữ mục tiêu (mặc định khoảng 400 chữ), còn các cấp khác vẫn dùng mẫu Task 1/Task 2. HSKK được soạn theo Part 1/2/3; có thể upload audio cho Listening và HSKK.
- Tab **Thi thử HSK 6** cho phép ghép bốn đề HSK 6 đã publish thành một bộ thi: Listening → Reading → Writing → HSKK Cao cấp. Thời gian từng phần có thể tùy chỉnh.
- Trang học viên: `/hsk6-mock.html`. Thí sinh đăng nhập qua tài khoản học viên hiện có, xác nhận họ tên/số báo danh, chỉnh âm lượng và cỡ chữ rồi bắt đầu.
- Mỗi phần có đồng hồ riêng; khi hết giờ, hệ thống khóa câu trả lời và tự chuyển phần tiếp theo. Không có nút bỏ qua phần.
- HSKK có microphone recorder, nút bắt đầu/dừng, nghe lại file ghi âm và gửi file lên máy chủ khi nộp bài.
- Admin xem lượt thi đã nộp, đáp án thí sinh và phát lại recording HSKK tại tab **Thi thử HSK 6**.
- Trang **Cá nhân hóa** có thanh điều hướng đóng/mở; mặc định thu gọn, tự thu lại sau khi chọn chức năng.

## Cách cấu hình

1. Đăng nhập Admin → HSK Exam Studio. Tạo và publish các đề HSK 6 cho Reading, Listening, Writing và HSKK Cao cấp. Với Writing HSK 6, dán cả văn bản nguồn và yêu cầu viết tóm tắt; chỉnh số chữ mục tiêu theo bộ đề bạn sử dụng.
2. Với Listening/HSKK, chọn file audio trong builder hoặc nhập URL; chờ thông báo upload thành công trước khi lưu đề.
3. Mở tab **Thi thử HSK 6**, chọn đúng bốn đề thành phần, nhập thời lượng Listening/Reading/Writing/HSKK, rồi publish bộ đề.
4. Học viên đăng nhập từ trang chính và mở **Thi thử HSK 6**. Microphone cần được cấp quyền; trình duyệt thường yêu cầu HTTPS hoặc localhost để ghi âm.
5. Sau khi nộp, Admin có thể mở lại tab này để xem bài làm và nghe file HSKK.

## Lưu ý quyền truy cập

Trang thi thử yêu cầu tài khoản học viên hợp lệ. Reading/Listening theo quy tắc hiện hành của hệ thống; Writing/HSKK vẫn tuân theo quyền PRO hoặc quyền đề được Admin cấp trong phần quản lý truy cập. Nếu muốn một học viên thi đủ cả bốn phần, hãy cấp quyền Writing và Speaking/HSKK cho tài khoản đó.

Các bảng `hsk_mock_exams` và `hsk_mock_attempts` được tạo tự động khi server khởi động (trong bước `initDB`).
