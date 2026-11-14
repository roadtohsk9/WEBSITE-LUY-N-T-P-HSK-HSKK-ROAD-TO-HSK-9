# HSK Exam Practice — HSK 3–6

Nền tảng luyện thi HSK 3–6 với kho đề Reading/Listening và bộ quản trị mở rộng thêm Writing + HSKK Cao cấp để tạo ca thi thử HSK 6 đầy đủ. Học viên đăng nhập bằng tài khoản/mật khẩu do Admin cấp. Trang thi thử `/hsk6-mock.html` mô phỏng bốn chặng Listening → Reading → Writing → HSKK Cao cấp; Admin tải đề/audio và ghép bộ đề trong tab “Thi thử HSK 6”. Cá nhân hóa có thanh điều hướng thu gọn/mở rộng. Xem `README_HSK6_HSKK_MOCK_UPDATE_VI.md` để biết quy trình cấu hình.

## Chạy local
- Cài Node.js 18+
- `npm install`
- Cấu hình `DATABASE_URL` trỏ tới PostgreSQL
- `npm start` rồi mở `http://localhost:3000`

## Cửa hàng, PRO và tài liệu bán riêng
- Cửa hàng học viên: `/store.html`; giỏ hàng và checkout: `/checkout.html`.
- Khi database khởi tạo, hệ thống tạo ba gói mặc định: PRO 1 tháng 39.000 ₫, 3 tháng 99.000 ₫, 1 năm 399.000 ₫. Có thể sửa/ẩn và tạo gói mới trong Admin → **Sản phẩm & Tài liệu**.
- Admin có thể upload ảnh bìa và tài liệu số. File tài liệu được lưu trong `.private-documents`, không phải thư mục upload công khai; học viên chỉ tải được sau khi quyền mua được cấp.
- Cấu hình tài khoản ngân hàng, BIN VietQR và VAT trong Admin → **Thanh toán**. Tự động mở khóa cần cấu hình SePay; làm theo `PAYMENTS_SEPAY_SETUP_VI.md`.
- Hướng dẫn quản trị sản phẩm và tài liệu: `STORE_ADMIN_GUIDE_VI.md`.

## Admin
- URL: `/admin/`
- Đăng nhập Admin bằng mật khẩu quản trị `ADMIN_PASSWORD` trong biến môi trường hosting; nếu chưa cấu hình, bản tương thích cũ dùng mật khẩu mặc định đang có trong `server.js`. Hãy đặt mật khẩu mạnh riêng trước khi đưa web công khai. Học viên đăng nhập bằng thông tin tài khoản được Admin tạo/cấp.
- Khi tạo đề thường, chọn Reading hoặc Listening. Với bộ thi thử HSK 6, Admin có thể chọn thêm Writing hoặc HSKK Cao cấp; hai kỹ năng này sử dụng volume 6 và TEST number riêng theo từng skill.
- Đề cần được publish trước khi ghép vào bộ thi thử. Listening và HSKK có thể gắn audio URL/tải audio trực tiếp trong builder.

## Lưu ý dữ liệu
- Backend và các API PostgreSQL hiện có được giữ nguyên nhằm bảo toàn các chức năng Admin như quản lý đề, tài khoản, quyền truy cập và bài nộp.
- Front-end mới đọc các đề đã publish qua `/api/practice` và mở bài qua `/hsk-exam.html?id=...`.
- Cấu trúc `content` của câu hỏi tùy thuộc định dạng mà Admin builder lưu. Trang thi hỗ trợ các cấu trúc câu hỏi phổ biến gồm `questions`, `items`, `parts`, `sections`, `groups`, `passages`, các trường `question/prompt/questionText`, và `options/choices`. Nên kiểm tra một đề thực tế sau khi nhập để xác nhận hiển thị đúng.
- Đã loại bỏ chức năng và cấu hình đăng nhập Google. Hệ thống tiếp tục sử dụng luồng tài khoản học viên được Admin cấp.


## HSKK / HSK 3.0 Speaking

See `HSKK_MODULE_SETUP_VI.md` for admin publishing, microphone recording, Gemini configuration, and test steps. Candidate entry: `/hskk.html`; Admin tab: `HSKK 2.0 / 3.0`.
