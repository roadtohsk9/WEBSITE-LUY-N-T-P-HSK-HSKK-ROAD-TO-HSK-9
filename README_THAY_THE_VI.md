# PATCH HSK6 – 20 ĐỀ MÔ PHỎNG THÁNG 11 · READING

## 1. File có trong patch

Patch chỉ gồm các file cần thêm/thay thế:

| File trong ZIP | Thao tác trên source GitHub |
|---|---|
| `server.js` | Thay thế file `server.js` ở thư mục gốc |
| `js/practice-test.js` | Thay thế `js/practice-test.js` |
| `js/practice-result.js` | Thay thế `js/practice-result.js` |
| `data/hsk6_november_reading_seed.json` | Thêm file mới vào thư mục `data/` (không ghi đè seed HSK6 cũ) |

## 2. Cách cập nhật GitHub

1. Tải ZIP và giải nén.
2. Sao lưu 3 file cũ `server.js`, `js/practice-test.js`, `js/practice-result.js`.
3. Upload/ghi đè đúng 3 file trên vào đúng đường dẫn trong repository.
4. Thêm file mới `data/hsk6_november_reading_seed.json` vào thư mục `data/`.
5. Commit changes và push lên GitHub.
6. Mở Render → chọn service website → **Manual Deploy** → **Deploy latest commit**.

Không thay `data/hsk6_papers_seed.json`, không xóa các đề HSK6 đang có và không cần thêm Environment Variable mới. Website phải đang kết nối PostgreSQL bằng `DATABASE_URL`/`POSTGRES_URL`.

## 3. Cách tìm bộ đề sau khi deploy

1. Mở trang chủ website.
2. Đến khu vực **Kho đề thi**.
3. Mở bộ lọc cấp độ; trong nhóm **Đề mục tùy chỉnh**, chọn đúng tên:
   `BỘ ĐỀ MÔ PHỎNG THÁNG 11 - ĐỌC`
4. Ở bộ lọc kỹ năng, chọn **Reading**.
5. Danh sách sẽ hiển thị 20 đề từ **THÁNG 11 · ĐỌC 01** đến **THÁNG 11 · ĐỌC 20**.

Backend tự tạo đề mục nếu chưa tồn tại và tự nhập 20 đề khi khởi động. Nếu redeploy lần sau, seed nhận diện các bản ghi thuộc chính gói này để cập nhật nội dung; không ghi đè đề HSK6 khác. Số đề dùng trong database là 61101–61120 để tránh trùng dải đề 101–109 đang có trong seed HSK6 ban đầu.

## 4. Kiểm tra nếu chưa thấy danh mục

- Kiểm tra Render Logs có dòng `HSK6 November Reading seed`.
- Kiểm tra file seed đã nằm đúng đường dẫn `data/hsk6_november_reading_seed.json` trên GitHub.
- Kiểm tra `DATABASE_URL`/`POSTGRES_URL` vẫn kết nối được PostgreSQL.
- Tải lại trang chủ sau khi deploy xong để danh mục được tải lại từ API.

Nếu log báo đề bị skipped, có thể số đề 61101–61120 đã được dùng bởi một đề Reading HSK6 khác trong database. Seed cố ý không ghi đè các bản ghi không thuộc gói import này.

## 5. Lưu ý

- Đây là patch source để bạn đưa lên GitHub/Render; mình không đăng nhập trực tiếp vào GitHub hoặc Render production của bạn.
- Nội dung câu hỏi, bài đọc, đáp án và giải thích được lấy từ PDF bạn gửi. Patch nhập phần đề thi/đáp án/giải thích; các bảng từ vựng và cấu trúc ôn tập ở phụ lục PDF không được chuyển thành một trang tài liệu riêng.
- Tài liệu là đề mô phỏng tự biên soạn, không phải đề thi chính thức.
