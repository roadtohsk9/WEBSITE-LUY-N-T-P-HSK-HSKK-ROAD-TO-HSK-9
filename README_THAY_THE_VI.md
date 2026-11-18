# PATCH XANH LÁ · HSK6 — Hướng dẫn cài đặt

## Nội dung gói

Gói này bổ sung **10 bộ luyện tập HSK6 biên soạn mới**, mang nhãn **XANH LÁ**. Đây là bộ luyện tập rút gọn, không phải bản sao của cuốn PDF đã tải lên và không phải đề thi chính thức.

Mỗi bộ gồm:
- Listening: 5 câu trắc nghiệm; audio để trống để Admin tải sau.
- Reading: 5 câu đọc hiểu với đoạn văn tiếng Trung mới.
- Writing: 1 bài 缩写作文, mục tiêu khoảng 400 chữ Hán; có gửi bài sang luồng AI chấm HSK6 hiện có.

Tổng cộng: 30 bản ghi trong database, gồm 10 Listening + 10 Reading + 10 Writing; 50 câu trắc nghiệm có đáp án/giải thích và 10 bài viết.

## Các tệp trong gói

- `data/hsk6_xanh_la_seed.json` — dữ liệu 10 bộ.
- `hsk6-xanhla-seed.js` — hàm nhập dữ liệu an toàn, không ghi đè đề đang có.
- `server.js.patch` — thêm module và gọi hàm seed khi server khởi động.
- `js/practice-test.js.patch` — nhận diện Writing XANH LÁ HSK6, hiển thị bộ đếm chữ Hán và gửi đúng dữ liệu nguồn cho AI chấm.
- `hsk-writing-grading.js.patch` — rubric riêng cho bài tóm tắt HSK6 và giới hạn output để giảm token.
- `js/ai-result.js.patch` và `ai-result.html.patch` — đổi tiêu đề trang kết quả thành nhãn HSK chung, không ghi nhầm HSK 7–9 khi chấm bài HSK6.
- `AUDIO_SCRIPTS_FOR_ADMIN.md` — kịch bản audio tương ứng, chỉ dành cho Admin để thu âm/tạo audio; không được nhúng vào nội dung học viên.

## Cài đặt bằng Git (khuyên dùng)

1. Sao lưu source hiện tại.
2. Giải nén PATCH vào một thư mục riêng.
3. Chép `hsk6-xanhla-seed.js` vào thư mục gốc website (cùng cấp với `server.js`).
4. Chép `data/hsk6_xanh_la_seed.json` vào thư mục `data/` của website.
5. Từ thư mục gốc repo, áp dụng 5 patch:

```bash
git apply PATCH-HSK6-XANH-LA-10-DE/server.js.patch
git apply PATCH-HSK6-XANH-LA-10-DE/js/practice-test.js.patch
git apply PATCH-HSK6-XANH-LA-10-DE/hsk-writing-grading.js.patch
git apply PATCH-HSK6-XANH-LA-10-DE/js/ai-result.js.patch
git apply PATCH-HSK6-XANH-LA-10-DE/ai-result.html.patch
```

Nếu bạn giải nén thư mục patch vào trong repo, chỉnh lại đường dẫn theo vị trí thực tế. Nếu Git báo `patch does not apply`, đừng ghi đè nguyên file; source hiện tại đã khác bản nền. Khi đó dùng các đoạn thay đổi trong file `.patch` để áp dụng thủ công.

## Nếu thao tác trực tiếp trên GitHub web

- Upload `hsk6-xanhla-seed.js` lên thư mục gốc.
- Upload `hsk6_xanh_la_seed.json` vào thư mục `data/`.
- Mở `server.js`, thêm dòng require sau dòng require `hsk-writing-grading`:

```js
const { seedHsk6XanhLaPapers } = require('./hsk6-xanhla-seed');
```

- Trong hàm khởi tạo DB, tìm đoạn `await seedHsk6Papers();` và thêm ngay dòng sau:

```js
await seedHsk6XanhLaPapers({ dbQuery, DATA_DIR });
```

- Áp dụng lần lượt nội dung của 5 patch vào đúng file tương ứng: `server.js`, `js/practice-test.js`, `hsk-writing-grading.js`, `js/ai-result.js` và `ai-result.html`. Với 2 file AI result, nhãn được đổi thành “HSK” chung để không hiện nhầm HSK 7–9 khi học viên nộp bài HSK6.
- Nếu bạn thao tác hoàn toàn trên GitHub web, nên tải repo về máy và chạy các lệnh `git apply` ở trên để tránh dán thiếu các đoạn diff. Không thay nguyên `server.js` hoặc các file JS nếu bạn có chỉnh sửa riêng chưa có trong source nền của gói này.

## Deploy Render

1. Commit các thay đổi lên GitHub.
2. Vào Render → Manual Deploy → Deploy latest commit.
3. Khi server khởi động, seed sẽ tự tạo danh mục `XANH LÁ` và nhập các đề có `test_no` 201–210 trong HSK6.
4. Vào kho HSK6 / VOL 6. Tìm các thẻ có tiêu đề `XANH LÁ · HSK6 · ĐỀ 01` đến `ĐỀ 10`.

Không cần thêm Environment Variables. Writing dùng cấu hình AI server-side sẵn có (`DEEPSEEK_API_KEY`). Giao diện chỉ hiển thị “AI chấm”; không hiện tên nhà cung cấp.

## Upload audio sau này

- Trong Admin, mở từng bài `XANH LÁ · HSK6 · ĐỀ xx · LISTENING` và tải audio tương ứng.
- Dùng `AUDIO_SCRIPTS_FOR_ADMIN.md` để thu âm hoặc tạo file nghe khớp với 5 câu trong mỗi bài.
- Audio của bộ mới không được kèm trong PATCH, tất cả `audioUrl` đang rỗng.
- Hàm seed dùng `ON CONFLICT DO NOTHING`, vì vậy deploy lại không ghi đè audio hoặc nội dung đã tồn tại.

## Lưu ý quan trọng về độ dài

Đây là **bộ luyện tập rút gọn**: 5 câu Listening + 5 câu Reading + 1 bài Writing mỗi bộ. Không phải đề HSK6 đủ 50 câu Listening và 50 câu Reading. Nội dung câu hỏi/đoạn văn được biên soạn mới, không sao chép cuốn sách PDF.
