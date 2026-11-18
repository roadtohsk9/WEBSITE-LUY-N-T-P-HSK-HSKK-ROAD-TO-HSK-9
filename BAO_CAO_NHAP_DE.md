# Báo cáo PATCH XANH LÁ · HSK6

## Số lượng

| Kỹ năng | Số bộ | Số câu/nhiệm vụ | Audio |
|---|---:|---:|---|
| Listening | 10 | 50 câu trắc nghiệm | Để trống |
| Reading | 10 | 50 câu đọc hiểu | Không cần |
| Writing | 10 | 10 bài tóm tắt | Không cần |
| **Tổng** | **30 bản ghi** | **100 câu trắc nghiệm + 10 bài viết** | **10 audio chờ Admin** |

## Cách lưu

- Cấp độ: HSK6 (`volume=6`).
- Mã nội bộ: `test_no` 201–210 theo từng kỹ năng. Vì `skill` nằm trong khóa duy nhất, mỗi mã có thể có một bản ghi Listening, Reading và Writing.
- Nhãn hiển thị: `XANH LÁ · HSK6`.
- Danh mục database: `XANH LÁ`.
- Audio: trường `audio_url` rỗng ở cả 10 bài Listening.
- Seed chỉ thêm bản ghi chưa có, không update bản ghi đã tồn tại.

## Nội dung và chấm Writing

- 10 bài đọc và 10 bài nghe được biên soạn mới cho gói luyện tập.
- Mỗi Writing có một văn bản nguồn và yêu cầu 缩写 khoảng 400 chữ Hán.
- AI chấm theo rubric luyện tập: trung thành nguồn 40, độ bao quát ý 25, bố cục/liên kết 20, ngôn ngữ 15.
- Giới hạn đầu ra AI HSK6 trong module này là 1.800 tokens để giảm chi phí; nội dung phản hồi tập trung vào điểm, thiếu/sai ý và sửa lỗi quan trọng.
- Frontend hiển thị bộ đếm chữ Hán, trạng thái “AI chấm” và không hiện tên nhà cung cấp. Trang kết quả dùng nhãn HSK chung để phục vụ cả HSK6 và HSK7–9, không hiện nhầm HSK7–9 cho bộ này.

## Kiểm tra đã thực hiện

- 30 bản ghi JSON hợp lệ.
- 10 Listening, 10 Reading, 10 Writing.
- 5 câu/đề cho mỗi kỹ năng trắc nghiệm; đủ lựa chọn A–D, đáp án và giải thích.
- 10 bài Writing có `sourceText`, yêu cầu và giới hạn độ dài.
- 10 `audioUrl` Listening đều rỗng.
- Các file JavaScript đã được kiểm tra cú pháp Node.js; 5 patch áp dụng thành công lên snapshot source nền.
- Mô phỏng seed kiểm tra `ON CONFLICT DO NOTHING`, không ghi đè bản ghi/audio hiện có.

## Giới hạn

Đây là bộ luyện tập rút gọn biên soạn mới, không phải bản sao nội dung PDF và không phải đề HSK6 hoàn chỉnh theo thời lượng chính thức. Chưa kết nối vào PostgreSQL hoặc deploy Render production của người dùng.
