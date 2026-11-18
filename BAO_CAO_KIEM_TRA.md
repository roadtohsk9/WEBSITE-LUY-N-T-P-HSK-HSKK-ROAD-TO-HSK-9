# Báo cáo patch HANBAN HSK6

- PDF nguồn: `H61328-đã gộp.pdf` (159 trang).
- Mã đề nhận diện trong PDF: `H61328, H61327, H61006, H61005, H61003, H61001`.
- Đối chiếu source seed: cả 6 mã đã có sẵn trong `data/hsk6_papers_seed.json`.
- Có sẵn 12 bài trên web: 6 Listening + 6 Reading.
- Mỗi bài có 50 câu; Listening có trường audioUrl để trống trong seed.
- Patch chỉ gắn nhãn HANBAN cho 12 bản ghi hiện có; không nhân bản đề.
- Không sửa `content`, `answer_key`, `explanations`, `audio_url`, `source_file` hoặc quyền truy cập.
- Phần Writing (câu 101 dạng tóm tắt) có trong PDF nhưng không nằm trong 18 bài Listening/Reading của seed hiện tại; patch này không nhập phần Writing.

## Kiểm tra dữ liệu

| Mã đề | Kỹ năng | Test nội bộ | Số câu | Nhóm câu | Audio trong seed |
|---|---|---:|---:|---:|---|
| H61328 | Listening | 106 | 50 | 3 | để trống |
| H61328 | Reading | 106 | 50 | 9 | để trống |
| H61327 | Listening | 105 | 50 | 3 | để trống |
| H61327 | Reading | 105 | 50 | 9 | để trống |
| H61006 | Listening | 104 | 50 | 3 | để trống |
| H61006 | Reading | 104 | 50 | 9 | để trống |
| H61005 | Listening | 103 | 50 | 3 | để trống |
| H61005 | Reading | 103 | 50 | 9 | để trống |
| H61003 | Listening | 102 | 50 | 3 | để trống |
| H61003 | Reading | 102 | 50 | 9 | để trống |
| H61001 | Listening | 101 | 50 | 3 | để trống |
| H61001 | Reading | 101 | 50 | 9 | để trống |

## Giới hạn

Patch này không upload audio và không deploy trực tiếp lên Render. Sau khi áp dụng patch và redeploy, nhãn HANBAN sẽ được cập nhật vào các bản ghi đã seed. Admin có thể upload audio sau; migration không đụng đến audio_url.
