# ROAD TO HSK 9 — V4

## HSK 7–9
- Trang chủ: thêm thẻ cấp độ **HSK 7–9** + mục lọc; nhãn hiển thị "HSK 7–9" thay cho "HSK 7".
- Admin: chọn cấp **HSK 7–9** trong HSK Exam Studio và form import; có cấu trúc mẫu Reading/Listening (40 câu, chỉnh được), đánh số câu bắt đầu từ 1.
- Lưu ý dữ liệu: HSK 7–9 dùng `volume = 7`. Volume 8/9 không dùng cho HSK để tránh trùng các đề VOL 9 có sẵn trong `data/practice_seed.json`.

## Cá nhân hóa — học thông minh (từ vựng)
- Thanh tiến độ 3 trạng thái **Mới · Đang học · Đã thuộc** (+ lọc "Đến hạn") ; bấm để lọc danh sách thẻ.
- Flashcard lặp lại ngắt quãng: lật thẻ 3D, 4 mức Quên/Khó/Được/Dễ (phím 1–4), đảo chiều Từ↔Nghĩa, phát âm, thẻ "Quên" quay lại sau vài thẻ.
- Mục tiêu mỗi ngày, chuỗi ngày ôn, gợi ý từ lịch sử làm bài (kỹ năng yếu, sẵn sàng lên cấp, từ đến hạn).
- Dữ liệu SRS lưu riêng theo tài khoản (`<key>:SRS_V1`), không đổi cấu trúc từ vựng cũ.

## Chuyển động
- Bỏ hiệu ứng blur khi hiện nội dung, rút ngắn thời lượng, thêm hiệu ứng vào trang.
- Thanh cuộn không còn đo layout mỗi khung hình; con trỏ và quan sát DOM chỉ xử lý phần tử mới, gộp theo khung hình.
- Aurora tạm dừng khi tab ẩn.

## PRO theo từng kỹ năng
- Admin có thể cấp PRO cho **1** kỹ năng (trước đây tối thiểu 2).
