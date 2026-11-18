# PATCH HANBAN cho HSK6

Patch này đối chiếu file PDF `H61328-đã gộp.pdf` với source website bạn đã cung cấp. Sáu mã H61328, H61327, H61006, H61005, H61003 và H61001 đã có sẵn trong `data/hsk6_papers_seed.json` dưới dạng 12 bài Listening/Reading. Vì vậy patch chỉ thêm nhãn `HANBAN`, không tạo bản trùng.

## Cách áp dụng (khuyên dùng - tự động theo mỗi lần server khởi động)

1. Giải nén ZIP.
2. Chép `hsk6-hanban-labels.js` vào thư mục gốc dự án, cùng cấp với `server.js`.
3. Mở `server.js`, tìm dòng:

   ```js
   const { Pool } = require('pg');
   ```

   Thêm ngay dưới dòng đó:

   ```js
   const { applyHanbanHsk6Labels } = require('./hsk6-hanban-labels');
   ```

4. Tìm đoạn:

   ```js
   await seedHsk6Papers();
   await seedHsk5Papers();
   ```

   Đổi thành:

   ```js
   await seedHsk6Papers();
   if (pool) {
     const hanbanUpdated = await applyHanbanHsk6Labels(dbQuery);
     if (hanbanUpdated) console.log(`HANBAN HSK6 labels: ${hanbanUpdated} practice rows updated; audio and exam content preserved.`);
   }
   await seedHsk5Papers();
   ```

5. Commit lên GitHub rồi Render → Manual Deploy → Deploy latest commit.

File `server.js.diff` ghi đúng hai thay đổi trên để bạn đối chiếu.

## Cách khác: chạy SQL một lần

Nếu bạn muốn tự chạy trong SQL Editor của PostgreSQL, mở `HANBAN_HSK6_LABELS.sql` và chạy toàn bộ câu lệnh. Khi dùng cách này, không cần thêm file JS hoặc sửa server.js. Không chạy cả hai cách là bắt buộc; migration tự động là lựa chọn dễ duy trì hơn.

## Sau khi áp dụng

- Các thẻ Reading và Listening của sáu mã trên sẽ bắt đầu bằng `HANBAN`.
- Dòng series trên trang làm bài cũng sẽ hiện `HANBAN`.
- Các mã khác H61329, H61330, H61333 không bị đổi vì không nằm trong PDF gộp bạn vừa gửi.
- Audio không bị chỉnh sửa; `audio_url` hiện có (kể cả URL Admin đã upload) được giữ nguyên. Nếu đang trống, Admin có thể upload sau.
- Câu hỏi, đáp án và lời giải hiện tại được giữ nguyên.

## Lưu ý về phạm vi

PDF có phần Writing câu 101 (bài tóm tắt), nhưng source seed hiện tại chỉ có 6 Listening và 6 Reading tương ứng; patch này không tạo đề Writing placeholder. Báo cáo chi tiết nằm trong `BAO_CAO_KIEM_TRA.md`.
