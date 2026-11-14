# Cập nhật trình phát Audio (file tĩnh, không phải Live)

Đã thêm trình phát audio dùng chung cho các trang làm bài Listening.

## Các chức năng
- Phát / tạm dừng thủ công; không tự phát khi mở trang.
- Tua lùi 10 giây và tua tới 10 giây.
- Thanh tiến độ có thể kéo để tới vị trí mong muốn.
- Điều chỉnh tốc độ phát: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x và 2x.
- Tắt/bật âm thanh và chỉnh âm lượng.
- Trạng thái tải audio, lỗi tải, thời lượng và vị trí phát.
- Ghi nhớ tốc độ/âm lượng đã chọn trong trình duyệt hiện tại.

## File được sửa/thêm
- `js/audio-player.js`: logic điều khiển audio.
- `css/audio-player.css`: giao diện đáp ứng màn hình nhỏ/lớn.
- `hsk-exam.html`: dùng custom player cho các đề HSK mở trực tiếp.
- `practice-test.html` + `js/practice-test.js`: dùng custom player cho Practice Test.
- `exam-listening.html` + `js/listening.js`: thay nút Play tối giản và bỏ autoplay ở trang Listening cũ.

## Lưu ý
Audio dùng file đã upload (ví dụ MP3/WAV/M4A/OGG) hoặc URL file tĩnh có thể truy cập. Không phải livestream. Tua 10 giây và thanh tiến độ yêu cầu file audio có metadata và hỗ trợ seek; nếu URL là luồng trực tiếp không seek được, trình phát sẽ hiện thông báo.

Đã giữ nguyên API upload/lưu audio ở Admin. Admin vẫn có thể tải file audio lên theo quy trình hiện tại; không cần thay đổi cơ sở dữ liệu.
