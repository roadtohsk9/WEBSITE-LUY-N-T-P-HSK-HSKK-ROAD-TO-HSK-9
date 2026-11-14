# Image placeholders — mapping

Tất cả ảnh dưới đây là placeholder .jpg đã tạo sẵn. Website đã trỏ sẵn vào đúng các
tên file này. **Sau này chỉ cần thay ảnh thật, giữ nguyên tên file** — không cần
sửa lại HTML/JS.

## Ảnh giáo viên / trợ giảng (trang chủ `index.html`, mục "Đội ngũ")

| File | Dùng cho |
|---|---|
| `teacher-1.jpg` | Giáo viên Speaking 8.5+ |
| `teacher-2.jpg` | Giáo viên Writing |
| `teacher-3.jpg` | Trợ giảng Listening |
| `teacher-4.jpg` | Trợ giảng IELTS |

Khuyến nghị ảnh thật: tỉ lệ dọc ~4:5 (ví dụ 600×750px), ảnh chân dung/poster rõ mặt.

## Ảnh khóa học (`course-thumbnails/`)

| File | Khóa học (slug) |
|---|---|
| `HINH1.jpg` | `speaking-8-5` — Học tư duy Speaking với giáo viên 8.5 |
| `HINH2.jpg` | `writing-cap-toc-5-6` — Writing cấp tốc Band 5–6 |
| `HINH3.jpg` | `writing-cap-toc-6-7` — Writing cấp tốc Band 6–7 |
| `HINH4.jpg` | `listening-core-skills` — Kỹ năng ôn Listening |
| `HINH5.jpg` | `combo-writing-speaking` — Combo Writing + Speaking |
| `HINH6.jpg` | `combo-speaking-writing-listening` — Combo Speaking Writing Listening |
| `HINH7.jpg` | Dự phòng — dùng làm ảnh mặc định cho khóa học mới chưa có ảnh riêng (fallback trong `courses.html`) |

Khuyến nghị ảnh thật: tỉ lệ ngang ~8:5 (ví dụ 800×500px hoặc 1600×1000px).

## Nơi các file này được tham chiếu trong code

- `index.html` — 4 thẻ `team-card` (ảnh giáo viên) và 6 thẻ `course-card` +
  bảng `poster_url` trong script nội tuyến (ảnh khóa học).
- `courses.html` — mảng `FALLBACK` (dùng khi API `/api/courses` lỗi) và hàm
  `render()` (ảnh mặc định khi một khóa học chưa có `poster_url`).
- `server.js` — hàm `seedCourses()`: khi khởi tạo database lần đầu (bảng
  `course_posts` trống), server tự gán `poster_url` theo đúng bảng ở trên.
  Nếu một khóa đã tồn tại trong DB mà `poster_url` đang rỗng, server cũng sẽ tự
  điền vào lần khởi động kế tiếp.

## Đổi ảnh admin qua giao diện

Admin vẫn có thể tải ảnh khóa học riêng qua trang Admin (ghi đè `poster_url`
trong DB) — không bắt buộc phải sửa file `HINH*.jpg`. Việc thay file vật lý chỉ
cần thiết nếu bạn muốn giữ cách quản lý ảnh tĩnh, không qua admin upload.
