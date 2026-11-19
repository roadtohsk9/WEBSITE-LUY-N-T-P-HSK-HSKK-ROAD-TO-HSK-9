# Báo cáo PATCH HANBAN HSK6 – DEDUPE V2

## Đối chiếu source

Source website đã dùng để làm patch có `data/hsk6_papers_seed.json` gồm 18 hàng HSK6: 9 mã đề × Listening/Reading. Sáu mã trong PDF HANBAN đã có sẵn trong seed:

- H61001: Listening/Reading, test_no 101
- H61003: Listening/Reading, test_no 102
- H61005: Listening/Reading, test_no 103
- H61006: Listening/Reading, test_no 104
- H61327: Listening/Reading, test_no 105
- H61328: Listening/Reading, test_no 106

Như vậy 12 hàng HANBAN đã tồn tại trong source. Patch cũ chỉ đổi metadata/nhãn, không có logic xử lý bản import trùng được tạo thêm bằng test_no khác.

## Thay đổi trong V2

- Thêm module `hsk6-hanban-dedupe-v2.js`.
- Thêm hook sau `seedHsk6Papers()` trong `server.js`.
- Không thêm bất kỳ hàng test mới nào.
- Dò trùng theo cặp mã đề + kỹ năng; dự phòng fingerprint chính xác của nội dung và answer key cho hàng import có tiêu đề chung.
- Bản chính được gắn nhãn `HANBAN`; các bản dư được giữ lại nhưng đặt `published = FALSE` và series `HANBAN_DUPLICATE_HIDDEN`.
- Không xóa row, không sửa câu hỏi/đáp án/giải thích, không xóa audio hay history.

## Kiểm thử đã chạy trong môi trường tạo patch

- `node --check hsk6-hanban-dedupe-v2.js`: PASS.
- `node test-hanban-dedupe-v2.js`: PASS.
  - Hai hàng H61001 Listening được gom về một bản chính.
  - Bản chính nhận audio từ bản trùng nếu đang trống.
  - Bản trùng được ẩn, không bị xóa.
  - H61001 Reading vẫn giữ nguyên và được gắn nhãn HANBAN.
  - Chạy migration lần hai không tiếp tục xử lý bản đã ẩn.
- `git apply --check server.js.patch` trên source archive nền: PASS.
- `node --check server.js` sau khi áp dụng diff: PASS.
- `HANBAN_DEDUPE_AUDIT.sql` chỉ là truy vấn SELECT, không ghi dữ liệu.

## Chưa xác minh

Không có kết nối tới PostgreSQL production của người dùng trong lượt này. Vì vậy số bản trùng thực tế và số hàng bị ẩn sẽ chỉ được xác định trong log Render sau khi deploy.
