# Báo cáo nhập 5 đề HANBAN HSK5

## Nguồn và phạm vi
- PDF nguồn: `Đề 5-đã gộp.pdf` do người dùng cung cấp và xác nhận quyền sử dụng.
- Năm mã đề phát hiện trên bìa: **H51005, H51004, H51003, H51002, H51001**.
- Mỗi mã được tách thành ba bài độc lập: Listening, Reading, Writing.
- Audio Listening được để trống (`audioUrl: ""`) để Admin upload sau.

## Dữ liệu được chuyển đổi
| Mã đề | Listening | Reading | Writing | Bài đọc | Đáp án nghe | Đáp án đọc | Đáp án viết 91–98 |
|---|---:|---:|---:|---:|---:|---:|---:|
| H51005 | 45 | 45 | 10 | 19 | 45 | 45 | 8 |
| H51004 | 45 | 45 | 10 | 19 | 45 | 45 | 8 |
| H51003 | 45 | 45 | 10 | 19 | 45 | 45 | 8 |
| H51002 | 45 | 45 | 10 | 19 | 45 | 45 | 8 |
| H51001 | 45 | 45 | 10 | 19 | 45 | 45 | 8 |

Tổng số của 5 mã mới: **15 bài tương tác** (5 Listening + 5 Reading + 5 Writing), **500 câu/nhiệm vụ** (225 câu nghe, 225 câu đọc, 50 nhiệm vụ viết), **95 đoạn/bài đọc**, 25 ảnh minh họa Reading và 5 ảnh câu Writing 100.

- Listening: 45 câu mỗi đề; các trường `audioUrl` ở cả cấp bài và `content` đều để trống. Không đính kèm transcript vào dữ liệu làm bài.
- Reading: 45 câu mỗi đề; giữ các đoạn văn, lựa chọn và đáp án từ PDF. Bao gồm bốn nhóm ở phần 46–60, mười đoạn ngắn ở phần 61–70 và năm bài đọc dài ở phần 71–90. Mã H51001 có ranh giới nhóm đọc 71–73, 74–77, 78–81, 82–86, 87–90 đúng theo PDF.
- Writing: 10 nhiệm vụ mỗi đề; câu 91–98 có đáp án mẫu trong PDF, câu 99–100 là bài viết mở nên không tạo đáp án giả. Từ gợi ý câu 99 và ảnh gốc câu 100 được giữ.
- PDF không cung cấp lời giải chi tiết cho từng câu; patch không tự tạo lời giải thay thế.

## Bảo toàn dữ liệu HSK5 trước đó
File seed trong patch là bản tích lũy, gồm:
- 5 bộ HSK5 đầy đủ đã có (15 bản ghi Listening/Reading/Writing, testNo 101–105).
- 20 đề dự đoán HSK5 Reading đã nhập trước đó (testNo 5101–5120).
- 5 mã HANBAN mới (15 bản ghi Listening/Reading/Writing, testNo 106–110).

**Tổng trong file seed sau cập nhật: 50 bản ghi.** Không có xung đột khóa `(skill, volume, testNo)` trong seed tích lũy.

## Audio và ảnh
- Audio của năm đề mới được để rỗng, sẵn sàng cho Admin upload sau.
- Các ảnh gốc được lưu trong `tests/hsk5/`; không xóa các ảnh HSK5 đã có. Hãy gộp thư mục ảnh mới vào thư mục hiện tại.
- Seeder HSK5 hiện có giữ `audio_url` trong database nếu bản seed mới gửi `audioUrl` rỗng, vì vậy audio của các đề HSK5 cũ không bị reset khi redeploy.
