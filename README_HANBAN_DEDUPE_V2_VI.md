# PATCH HANBAN HSK6 – SỬA TRÙNG ĐỀ (V2)

## Đây là patch sửa đúng vấn đề nào?

Patch HANBAN cũ chỉ thêm nhãn `HANBAN` cho 6 mã đề đã có trong source. Nó **không tạo đề mới** và cũng **không ẩn bản trùng** nếu bạn đã import lại cùng PDF qua Admin bằng số đề khác.

Trong source website đã nhận được trước đây, sáu mã từ file `H61328-đã gộp.pdf` đã có sẵn thành 12 bản ghi:

| Mã đề | Listening | Reading |
|---|---:|---:|
| H61001 | Test no. 101 | Test no. 101 |
| H61003 | Test no. 102 | Test no. 102 |
| H61005 | Test no. 103 | Test no. 103 |
| H61006 | Test no. 104 | Test no. 104 |
| H61327 | Test no. 105 | Test no. 105 |
| H61328 | Test no. 106 | Test no. 106 |

Do đó, **không được seed/import lại 12 bản ghi này bằng test number mới**. Làm vậy sẽ tạo thêm thẻ đề có cùng nội dung.

## V2 xử lý như thế nào?

- Không `INSERT` đề mới; không `DELETE` bất kỳ bản ghi nào.
- Mỗi mã đề + kỹ năng chỉ giữ một bản hiển thị cho học viên.
- Chọn bản có dữ liệu câu hỏi/đáp án đầy đủ nhất làm bản chính; ưu tiên file import gốc khi độ đầy đủ bằng nhau.
- Đổi tiêu đề bản chính thành `HANBAN · HSK6 · <MÃ ĐỀ> · LISTENING/READING`.
- Các bản trùng được đặt `published = FALSE` và đánh dấu `HANBAN_DUPLICATE_HIDDEN`; nội dung, ID, audio, lịch sử nộp bài và quyền truy cập của chúng vẫn được giữ trong database.
- Nếu bản chính chưa có audio nhưng một bản trùng có audio, URL audio được sao chép sang bản chính. Bản gốc vẫn còn nguyên audio.
- Có nhận diện dự phòng theo dấu vân tay nội dung + đáp án khi hàng import có tên chung nhưng nội dung khớp chính xác với một mã đề đã biết.
- Chạy lại khi deploy không tiếp tục ẩn/gộp lại các bản đã được đánh dấu.

## Cài đặt trên GitHub

1. Sao lưu database PostgreSQL trước khi deploy.
2. Giải nén ZIP.
3. Chép `hsk6-hanban-dedupe-v2.js` vào thư mục gốc dự án, cùng cấp với `server.js`.
4. Mở `server.js`, thêm dòng require ngay dưới `const { Pool } = require('pg');`:

   ```js
   const { repairHanbanHsk6Duplicates } = require('./hsk6-hanban-dedupe-v2');
   ```

5. Tìm đoạn khởi động có:

   ```js
   await seedHsk6Papers();
   await seedHsk5Papers();
   ```

   Chèn đoạn sau giữa hai dòng:

   ```js
   if (pool) {
     const hanbanRepair = await repairHanbanHsk6Duplicates(dbQuery);
     console.log(
       `HANBAN HSK6 repair: ${hanbanRepair.labelledRows} canonical rows labelled; ` +
       `${hanbanRepair.hiddenDuplicates} duplicate rows hidden; ` +
       `${hanbanRepair.missing.length} code/skill pairs not found.`
     );
   }
   ```

6. Nếu bạn đã cài patch cũ `hsk6-hanban-labels.js`, hãy bỏ **dòng require và lời gọi `applyHanbanHsk6Labels`** cũ trong `server.js`. Không cần xóa file cũ khỏi GitHub; chỉ không gọi nó nữa.
7. Commit lên GitHub → Render → Manual Deploy → Deploy latest commit.

File `server.js.patch` trong ZIP là diff để đối chiếu/apply trên đúng bản source đã dùng khi tạo patch. Nếu bạn chỉnh `server.js` nhiều sau đó, dùng hướng dẫn chèn thủ công ở trên để tránh ghi đè thay đổi mới.

## Kiểm tra trước/sau deploy

- Có thể chạy `HANBAN_DEDUPE_AUDIT.sql` trong SQL Editor để xem số bản ghi theo từng mã và kỹ năng. Đây là câu lệnh chỉ đọc.
- Sau deploy, xem log Render: `canonical rows labelled`, `duplicate rows hidden`, `code/skill pairs not found`.
- Mục HSK6 trên trang học viên chỉ còn một thẻ Listening và một thẻ Reading cho mỗi mã tìm được.
- Các bản trùng không bị xóa; Admin vẫn có thể tìm thấy chúng trong danh sách quản trị với trạng thái chưa xuất bản.

## Giới hạn nhận diện

Migration nhận mã từ tiêu đề/nhãn từng bài, tên file PDF riêng lẻ, hoặc so khớp chính xác nội dung + đáp án với một bài đã biết. Nó cố ý **không** đoán mã từ tên file gộp `H61328-đã gộp.pdf`, vì file đó chứa nhiều mã đề khác nhau. Nếu bản import trùng có tiêu đề chung, không có mã và nội dung đã bị thay đổi, migration sẽ bỏ qua bản đó thay vì ẩn nhầm một đề khác. Khi ấy cần xem danh sách Admin để xác định thủ công.

## Những gì không thay đổi

- Không sửa câu hỏi, lựa chọn, đáp án hoặc giải thích của bản chính.
- Không thay số đề hiện có (101–106) và không tạo `test_no` mới.
- Không xóa lịch sử làm bài, submission, quyền truy cập hay bản ghi cũ.
- Không xóa hoặc ghi đè audio. Nếu bản chính trống audio, chỉ copy URL có sẵn từ bản trùng.
- Không cần thêm Environment Variables hoặc thư viện npm mới.
