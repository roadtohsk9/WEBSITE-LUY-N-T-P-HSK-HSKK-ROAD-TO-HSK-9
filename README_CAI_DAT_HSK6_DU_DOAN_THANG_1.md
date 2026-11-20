# PATCH HSK6 – DỰ ĐOÁN THÁNG 1 – READING V1

## Mục tiêu

Thêm 10 bộ đề HSK 6 bản 2.0 vào danh mục **Dự đoán tháng 1** trên website, chỉ ở kỹ năng **Reading / Đọc**.

- 10 bộ đề, mỗi bộ 50 câu (câu 51–100).
- Tổng cộng 500 câu hỏi và 500 đáp án.
- Bao gồm phần giải thích từng câu có trong PDF.
- Giữ đủ 4 phần Đọc: chọn câu sai, điền từ, điền câu và đọc hiểu.
- Không nhập câu 101 hoặc nội dung Writing.
- Không thay đổi các đề HSK6 cũ và không yêu cầu thêm biến môi trường hay package npm.

**Lưu ý về tên tài liệu nguồn:** PDF người dùng tải lên có bìa ghi “định hướng ôn luyện kỳ thi tháng 12/2026”. Theo yêu cầu, patch đưa các bộ đề này vào danh mục website **Dự đoán tháng 1**; nội dung câu hỏi gốc được giữ nguyên, không tự sửa thành một tài liệu nguồn khác.

## Các tệp trong ZIP

| Tệp | Vị trí cần đặt | Công dụng |
|---|---|---|
| `hsk6-jan-reading-seed-v1.js` | Thư mục gốc, cùng cấp `server.js` | Module nhập đề idempotent |
| `data/hsk6_jan_reading_seed_v1.json` | Thư mục `data/` | Dữ liệu 10 bộ Reading |
| `server.js.patch` | Dùng để sửa `server.js` | Thêm một dòng require và một dòng gọi seed |
| `KIEM_TRA_DU_DOAN_THANG_1.sql` | Chạy trong SQL editor nếu cần | Kiểm tra dữ liệu sau deploy |
| `BAO_CAO_KIEM_TRA.md` | Tùy chọn | Kết quả kiểm tra gói dữ liệu |
| `test-hsk6-jan-reading-seed-v1.js` | Tùy chọn | Test idempotence với database giả lập |

## Cách đưa lên GitHub

1. Giải nén ZIP.
2. Upload `hsk6-jan-reading-seed-v1.js` vào thư mục gốc của source code, cùng cấp với `server.js`.
3. Upload `hsk6_jan_reading_seed_v1.json` vào thư mục `data/`. Nếu chưa có thư mục `data`, tạo thư mục đó trước.
4. Mở `server.js` và thêm dòng require bên dưới nhóm `require` hiện có:

```js
const { seedHsk6JanPredictionReading } = require('./hsk6-jan-reading-seed-v1');
```

5. Trong hàm khởi tạo database `initDB()`, tìm hai dòng:

```js
await seedHsk6Papers();
await seedHsk5Papers();
```

Thêm dòng gọi seed ngay sau `await seedHsk5Papers();`:

```js
await seedHsk6JanPredictionReading(dbQuery).catch(e => console.error('HSK6 Jan prediction Reading seed failed:', e?.message || e));
```

6. Commit các thay đổi lên GitHub. Sau đó vào Render và chọn **Manual Deploy → Deploy latest commit**.

Nếu `server.js.patch` áp dụng được với phiên bản `server.js` hiện tại, có thể dùng patch để chèn hai dòng trên. Nếu GitHub báo conflict vì `server.js` đã được cập nhật bởi các patch khác, chỉ thêm thủ công đúng hai đoạn như trên; không thay thế toàn bộ `server.js` bằng bản cũ.

## Cơ chế chống tạo bản trùng

- Tạo hoặc tái sử dụng danh mục có tên chính xác `Dự đoán tháng 1`.
- Mỗi bộ có `source_file` marker riêng dạng `HSK6_JAN_PREDICTION_READING_V1:01` đến `:10`.
- Chạy lại seed sẽ cập nhật 10 bản ghi do chính module tạo, không tạo thêm 10 bản khác.
- Trước khi insert, module kiểm tra đề đã tồn tại với cùng nội dung JSONB và answer key hay chưa. Nếu tìm thấy bản khớp chính xác chưa gắn danh mục khác, module tái sử dụng bản ghi đó thay vì insert bản sao.
- Các slot `test_no` bắt đầu ở 9201–9210 để tách khỏi dải đề HSK6 thông thường. Nếu slot bị chiếm, module tìm slot dự phòng; không ghi đè bản ghi khác.
- Không xóa đề nào. Không đổi dữ liệu của đề khác có nội dung không khớp chính xác.

Việc nhận diện bản trùng bằng JSONB chỉ áp dụng khi cả `content` và `answer_key` khớp chính xác. Nếu một đề cũ được nhập với cấu trúc dữ liệu khác, patch sẽ không tự nhận là cùng đề để tránh gộp nhầm hai bộ đề.

## Kiểm tra sau Deploy

- Trang chủ → Kho đề thi → bộ lọc đề mục riêng → **Dự đoán tháng 1**.
- Chọn bộ lọc **Reading**. Phải thấy 10 bộ HSK6.
- Mở một bộ bất kỳ, kiểm tra các câu 51–100.
- Nộp thử để kiểm tra đáp án và giải thích từng câu.

Chạy nội dung trong `KIEM_TRA_DU_DOAN_THANG_1.sql` ở SQL Editor để xem số lượng đề được gắn danh mục.

## Ghi chú

Patch này chỉ tạo dữ liệu và hook seed ở backend. Nó không triển khai thay người dùng và không thể xác nhận dữ liệu production cho đến khi người dùng commit và deploy trên GitHub/Render.
