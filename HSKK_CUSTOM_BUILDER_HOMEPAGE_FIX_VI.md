# ROAD TO HSK 9 — HSKK custom builder & homepage display fix

## Những thay đổi

### 1. Admin tạo đề hoàn toàn từ trang trắng
- Bỏ nút áp dụng cấu trúc mẫu cố định trong tab HSKK.
- Nút **Tạo đề cao cấp trống** mở biểu mẫu HSKK 2.0 Cao cấp ở trạng thái Draft, không tự chèn phần hoặc câu hỏi.
- Admin tự thêm/xóa phần thi, tự thêm/xóa câu hỏi, tự đặt tên phần, hướng dẫn, dạng câu, nội dung, thời gian chuẩn bị và thời gian trả lời.
- Có thể đổi phiên bản/cấp độ để tạo đề HSKK 2.0 hoặc HSK Speaking 3.0.
- Số Test No. tự lấy số kế tiếp dựa trên đề hiện có. Server trả lỗi dễ hiểu nếu số đề bị trùng trong cùng phiên bản/cấp độ.

### 2. Upload audio riêng cho từng câu
- Mỗi câu có vùng upload audio riêng, có nút **Upload audio câu này**, trạng thái upload, phần trăm tiến trình, nghe thử và nút gỡ liên kết audio.
- File upload gắn vào đúng câu đang thao tác; URL được lưu trong `audioUrl` của câu.
- Có thể dán URL audio có sẵn nếu audio đã được lưu trên một host khác.
- Hỗ trợ MP3, WAV, M4A, OGG, WEBM, AAC, FLAC và OPUS; giới hạn giao diện 80 MB mỗi file.
- Upload qua endpoint `/api/admin/hskk/upload-audio`, có xác thực phiên Admin.

### 3. Lưu Draft và xuất bản
- Draft có thể lưu khi chưa có phần/câu hỏi hoặc đang xây dựng dở.
- Khi bật **Xuất bản đề cho học viên**, hệ thống kiểm tra cấu trúc và nội dung bắt buộc: mỗi phần có câu hỏi; mỗi câu đã chọn dạng; câu nghe có audio; câu nhìn tranh có ảnh; câu đọc thành tiếng có văn bản.
- Đề chưa xuất bản không được hiển thị công khai.

### 4. Đề HSKK cao cấp xuất hiện ở trang chủ
- `index.html` gọi endpoint công khai `/api/hskk/exams`.
- Khu vực **Đề HSKK cao cấp đã xuất bản** hiển thị HSKK 2.0 `advanced` và HSK 3.0 Speaking levels `5`/`6`.
- Mỗi card có tên đề, phiên bản/cấp, thời lượng và nút bắt đầu.
- Người dùng chưa đăng nhập sẽ được chuyển tới đăng nhập rồi quay lại đúng đề; người dùng đã đăng nhập được mở `/hskk-test.html?examId=...`.
- Khu vực tự tải lại danh sách khi trang được focus/hiện lại.

## Cách cập nhật

Giải nén ZIP patch vào thư mục gốc GitHub repository, ghi đè theo đúng đường dẫn:

- `index.html`
- `admin/index.html`
- `js/hskk-admin.js`
- `server.js`

Sau đó Commit changes và chờ Render deploy. Không thay `hskk.html`, `hskk-test.html`, `hskk-result.html` hoặc `hskk-deepseek.js` trong bản patch này.

## Cách sử dụng trong Admin

1. Mở `/admin/` → tab **HSKK 2.0 / 3.0**.
2. Nhấn **Tạo đề cao cấp trống**.
3. Điền tên đề và chọn phiên bản/cấp độ phù hợp.
4. Nhấn **Thêm phần thi**.
5. Trong phần mới, nhấn **Thêm câu hỏi**.
6. Chọn dạng câu, nhập nội dung và thời gian; với dạng nghe, chọn file rồi nhấn **Upload audio câu này**. Nghe thử audio để kiểm tra.
7. Lưu Draft khi đang soạn; chỉ bật **Xuất bản đề cho học viên** khi đã hoàn thiện.
8. Mở trang chủ và tải lại để xem card trong mục **Đề HSKK cao cấp đã xuất bản**.

## Lưu file upload trên Render

File audio được ghi vào `UPLOAD_DIR`. Để không mất file sau khi service restart/redeploy, gắn Persistent Disk (ví dụ mount path `/var/data`) và đặt biến môi trường:

`UPLOAD_DIR=/var/data/uploads`

Đảm bảo service có quyền ghi vào thư mục này.
