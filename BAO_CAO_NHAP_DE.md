# BÁO CÁO CHUYỂN ĐỔI – HSK6 20 ĐỀ READING

Nguồn: `HSK6_20_Bo_De_Doc_Hieu.pdf` (286 trang).

## Thống kê dữ liệu

| Hạng mục | Số lượng |
|---|---:|
| Đề thi độc lập | 20 |
| Câu hỏi | 1.000 |
| Đáp án | 1.000 |
| Giải thích tiếng Việt | 1.000 |
| Bài đọc dài (phần 4) | 40 |
| Câu mỗi đề | 50 |
| Thời gian mỗi đề | 50 phút |

## Cấu trúc mỗi đề

| Phần | Dạng bài | Câu | Số câu |
|---|---|---:|---:|
| 1 | Nhận diện câu sai ngữ pháp | 51–60 | 10 |
| 2 | Chọn từ điền vào đoạn văn (mỗi câu có 3 chỗ trống) | 61–70 | 10 |
| 3 | Chọn câu điền vào đoạn văn (2 nhóm, mỗi nhóm 5 chỗ trống, bộ lựa chọn A–F) | 71–80 | 10 |
| 4 | Đọc hiểu hai bài đọc dài | 81–100 | 20 |

Dữ liệu được chia thành 4 `passages` để phù hợp trang làm bài; trang kết quả có 6 nhóm con để tách hai bài điền câu và hai bài đọc dài. Câu hỏi phần 3 dùng dạng chọn câu (Matching) và ánh xạ đáp án A–F theo bộ câu của từng nhóm.

## Tên đề và danh mục

Danh mục được tạo tự động với tên chính xác:

`BỘ ĐỀ MÔ PHỎNG THÁNG 11 - ĐỌC`

20 đề được đặt ở kỹ năng `reading`, volume `6`, test_no `61101`–`61120`, và được publish sau khi seed.

## Kiểm tra đã thực hiện

- Đã đọc cấu trúc cả 20 chương trong PDF.
- Đã xác nhận mỗi đề có đủ số câu 51–100.
- Đã kiểm tra 50 đáp án và 50 giải thích cho từng đề.
- Đã xác nhận phần 3 có 6 lựa chọn chung và hai nhóm 5 câu.
- Đã xác nhận phần 4 có hai bài đọc và đủ 20 câu.
- Đã kiểm tra JSON có thể parse và số lượng từng nhóm đúng.
- Đã chạy `node --check` cho `server.js`, `js/practice-test.js`, `js/practice-result.js`.
- Đã chạy kiểm tra logic nhóm kết quả: 4 phần hiển thị lần lượt 10, 10, 10, 20 câu.

## Giới hạn xác minh

Chưa kết nối trực tiếp tới PostgreSQL production hoặc deploy Render trong tài khoản của bạn. Việc nhập dữ liệu vào website production sẽ diễn ra khi patch được push lên GitHub và Render khởi động với `DATABASE_URL` hợp lệ. Nội dung phụ lục từ vựng/cấu trúc của PDF chưa được chuyển thành tài liệu riêng trong website.
