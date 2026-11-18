# PATCH HSK4 VOL 4 – 20 BỘ ĐỀ ĐỌC & VIẾT

## 1. Patch này bổ sung gì?

Patch chuyển nội dung từ file PDF `HSK4_20_de_sieu_kho_2.0.pdf` vào website thành hai danh sách riêng:

- **HSK4 → Đọc → HSK4 · VOL 4:** 20 đề, mỗi đề 40 câu, thời gian 40 phút.
- **HSK4 → Viết → HSK4 · VOL 4:** 20 đề, mỗi đề 10 câu sắp xếp từ/cụm từ thành câu, thời gian 15 phút.

Tất cả nội dung câu hỏi, lựa chọn và các đoạn văn tiếng Trung được trích trực tiếp từ PDF. Đáp án, bản dịch và giải thích tiếng Việt cũng được đưa vào dữ liệu đề.

Phạm vi giữ đúng PDF: không thêm Listening và không thêm Writing phần 2 (nhìn tranh đặt câu).

## 2. Các file trong patch

| File trong ZIP | Vị trí trên GitHub | Thao tác |
|---|---|---|
| `server.js` | `/server.js` | Thay thế |
| `hsk-writing-grading.js` | `/hsk-writing-grading.js` | Thay thế |
| `js/practice.js` | `/js/practice.js` | Thay thế |
| `js/practice-test.js` | `/js/practice-test.js` | Thay thế |
| `js/practice-result.js` | `/js/practice-result.js` | Thay thế |
| `data/hsk4_vol4_20_papers_seed.json` | `/data/hsk4_vol4_20_papers_seed.json` | Thêm mới |

**Quan trọng:** sao lưu các file đang chạy trước khi thay thế. Giữ nguyên những seed JSON cũ trong thư mục `data/`, đặc biệt:

- `data/hsk5_full_papers_seed.json`
- `data/hsk6_papers_seed.json`
- `data/hsk6_november_reading_seed.json`
- `data/practice_seed.json` (nếu đang sử dụng)

Không xóa hoặc thay thế các file dữ liệu trên bằng seed HSK4.

## 3. Cách cập nhật GitHub và Render

1. Tải ZIP và giải nén trên máy tính.
2. Sao lưu các file cũ trong source website.
3. Tải 5 file source vào đúng đường dẫn trong bảng trên; thêm file JSON mới vào thư mục `data/`.
4. Commit các thay đổi lên GitHub.
5. Mở Render → chọn Web Service của website → **Manual Deploy** → **Deploy latest commit**.
6. Mở Logs của Render và tìm dòng tương tự:

   `HSK4 VOL4 seed: 40 inserted/updated, 0 skipped.`

7. Sau khi deploy thành công, vào trang luyện tập:
   - Chọn **Đọc → HSK4 · VOL 4** để thấy 20 đề đọc.
   - Chọn **Viết → HSK4 · VOL 4** để thấy 20 đề sắp xếp từ thành câu.

Không cần nhập thủ công 1.000 câu trong Admin và không cần thêm Environment Variables. Server dùng `DATABASE_URL` hiện tại để seed vào bảng `practice_tests` khi khởi động.

## 4. Cách nhập dữ liệu an toàn

- Mỗi kỹ năng có 20 đề độc lập; `volume = 4`, `test_no = 401–420`.
- `source_file` mang tiền tố riêng `HSK4_20_DE_SIEU_KHO_PDF_IMPORT_`.
- Seed dùng khóa hiện có `(skill, volume, test_no)` và chỉ cập nhật bản ghi có đúng tiền tố nguồn HSK4 này. Nếu một số `test_no` bị một đề khác sử dụng, seed sẽ không ghi đè đề đó.
- Có thể deploy lại nhiều lần: seed chỉ thêm/cập nhật các đề thuộc bộ import này, không tạo bản sao sau mỗi lần khởi động.

## 5. Cách làm bài

### Đọc

- 1–10: chọn từ điền vào chỗ trống.
- 11–20: xem ba câu A/B/C và chọn một trong sáu thứ tự sắp xếp.
- 21–40: đọc 10 đoạn văn (mỗi đoạn 2 câu hỏi). Văn bản nguồn của từng đoạn được giữ trong dữ liệu và hiển thị ở khung Passage.

PDF cung cấp ba câu A/B/C và đáp án thứ tự; giao diện chuyển đáp án thứ tự thành sáu lựa chọn `ABC`, `ACB`, `BAC`, `BCA`, `CAB`, `CBA` để học viên chọn.

### Viết

- 10 câu sắp xếp các từ/cụm từ đã cho thành một câu tiếng Trung hoàn chỉnh.
- Học viên nhập câu hoàn chỉnh vào ô trả lời.
- Website đối chiếu với câu mẫu trong PDF, bỏ qua khoảng trắng và dấu câu cơ bản khi so sánh; phần giải thích tiếng Việt được hiển thị trong trang kết quả.
- Đây là dạng sắp xếp câu, không gọi AI chấm bài luận.

## 6. Quyền truy cập

Patch giữ nguyên chính sách phân quyền đang có của website. Theo backend hiện tại, Reading yêu cầu đăng nhập; Writing ở VOL 4 vẫn tuân theo quyền PRO/cấp quyền hiện tại. Patch không tự mở khóa quyền cho tài khoản học viên.

## 7. Những phần cũ được giữ lại

Bản `server.js` trong patch được ghép từ các thay đổi trước trong source làm việc, gồm luồng lưu audio HSKK vào PostgreSQL và các nhánh seed HSK5/HSK6; `hsk-writing-grading.js` giữ hàm chấm HSK6 Writing bằng AI. Hai nhánh chấm Writing AI được loại trừ khi request mang `hsk4Mode`, để đề sắp xếp câu HSK4 không bị gửi nhầm sang AI chấm bài luận.

Nếu source GitHub của bạn đã được chỉnh sửa thêm sau các patch trước, hãy so sánh/merge những thay đổi riêng của bạn trước khi ghi đè `server.js`.

## 8. Giới hạn kiểm tra

Patch đã được kiểm tra cú pháp JavaScript, cấu trúc JSON, số lượng câu/đáp án/giải thích và ZIP. Mình không có quyền truy cập GitHub, Render hoặc PostgreSQL production của bạn, nên chưa thể xác nhận deploy hay dữ liệu đã xuất hiện trên website thật. Cần kiểm tra Logs Render và trang luyện tập sau khi bạn deploy.
