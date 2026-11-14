# HSK 6 Mock Exam — cập nhật giao diện & chuyển động (V2)

Chỉ thay đổi hình thức trang `hsk6-mock.html`. Nội dung đề, văn bản hướng dẫn, thứ tự phần thi và logic chấm/nộp bài giữ nguyên.

## Giao diện
- Header kính mờ, thanh gradient chạy nhẹ ở đáy; logo có hiệu ứng xoay khi rê chuột.
- Thẻ, nút và ô nhập có viền/bóng/trạng thái hover-focus rõ hơn; nút chính có hiệu ứng ánh sáng quét.
- Thanh các phần thi (Listening → HSKK) có trạng thái đang làm (vòng sáng nhấp nháy), đã xong (dấu ✓ bật lên).
- Đồng hồ có thanh tiến độ thời gian. Còn ≤ 5 phút chuyển màu cam; còn ≤ 60 giây chuyển đỏ và rung nhẹ.
- Phương án trả lời có trạng thái chọn nổi bật và hiệu ứng khi rê chuột.

## Chuyển động
- Các khối trên trang chuẩn bị xuất hiện lần lượt; nền có quầng sáng trôi chậm.
- Chuyển phần thi: nội dung đề làm mờ-trượt vào, trang tự cuộn lên đầu phần mới.
- Thanh tiến độ và thanh đồng hồ chạy mượt (không giật).
- Chỉ dùng transform/opacity để giữ khung hình ổn định trên máy yếu.
- Tôn trọng cài đặt "Giảm chuyển động" của hệ điều hành (tắt animation, giữ nguyên bố cục).

## Sửa lỗi phát sinh khi kiểm thử
- HSKK: nút "Bắt đầu ghi âm" bị vô hiệu hóa sau khi hết giờ phần Writing và không được mở lại ở phần HSKK. Đã sửa: phần HSKK luôn mở nút ghi âm khi bắt đầu.
- Thông báo "Đã hết thời gian phần thi…" từ phần trước không còn hiển thị sang phần kế tiếp.

## File thay đổi
- css/hsk6-mock.css (viết lại, giữ đầy đủ các class đang dùng)
- js/hsk6-mock.js (thêm: trạng thái đồng hồ, cuộn đầu trang, sửa 2 lỗi trên)
