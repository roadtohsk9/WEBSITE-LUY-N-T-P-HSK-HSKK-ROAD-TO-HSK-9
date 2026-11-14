# Hướng dẫn cửa hàng ROAD TO HSK 9

## Cửa hàng học viên

- Mở `/store.html` để xem gói PRO và tài liệu đã xuất bản.
- Người dùng có thể thêm nhiều sản phẩm vào giỏ, thay đổi số lượng gói PRO, xóa/giảm số lượng và đi tới `/checkout.html`.
- Một tài liệu số chỉ được thêm một lần trong cùng giỏ hàng.
- Checkout tạo đơn ở máy chủ, lấy giá hiện tại từ database, tính tiền hàng + VAT và tạo mã chuyển khoản riêng.
- Người dùng đăng nhập trước khi thanh toán. Trạng thái đơn được tự kiểm tra định kỳ; đơn chỉ thành công khi webhook/đối soát đã xác nhận.
- Sau mua tài liệu, tệp xuất hiện tại **Tài liệu đã mua**. Tải xuống cần phiên đăng nhập và quyền `document_access` tương ứng.

## Admin

Mở `/admin/` → **Sản phẩm & Tài liệu**.

- **Gói PRO**: nhập tên, slug, mô tả, giá, thời hạn theo ngày, các kỹ năng được mở, VAT riêng tùy chọn, quyền lợi và ảnh bìa.
- **Tài liệu bán riêng**: nhập mô tả/giá/VAT, upload ảnh bìa và file PDF/DOCX/PPTX/XLSX/ZIP/TXT. File nội dung nằm trong `.private-documents` và không được phục vụ tĩnh công khai.
- Bật/tắt **Xuất bản** để mở bán hoặc ẩn sản phẩm.
- Bảng đơn hàng hỗ trợ xem tổng tiền/VAT và đối soát thủ công sau khi xác minh giao dịch.

## Gói PRO mặc định được tạo khi khởi động DB lần đầu

| Gói | Giá gốc | Thời hạn |
|---|---:|---:|
| ROAD PRO 1 tháng | 39.000 ₫ | 30 ngày |
| ROAD PRO 3 tháng | 99.000 ₫ | 90 ngày |
| ROAD PRO 1 năm | 399.000 ₫ | 365 ngày |

Quyền lợi mô tả: mở các đề Writing/HSKK có gắn PRO; truy cập kho Prediction; lịch sử bài làm/kết quả/feedback được hệ thống hỗ trợ; sổ từ vựng, collocations, cấu trúc và công cụ cá nhân hóa; thời hạn gói được cộng nối khi gia hạn. Admin có thể sửa giá, mô tả, quyền được mở và thời hạn.

## Cá nhân hóa nâng cấp

- Mục tiêu phút học mỗi ngày và ghi nhận thời lượng học.
- Focus timer 25 phút; khi hoàn thành tự cộng 25 phút vào nhật ký hôm nay.
- Streak ngày học liên tiếp, checklist tùy chỉnh theo ngày và thống kê nhịp học 7 ngày.
- Gợi ý ôn tập dựa trên sổ từ vựng/collocations và lịch sử bài làm đang lưu trong trình duyệt.

## Ghi chú kỹ thuật

- Giỏ hàng, nhật ký học, mục tiêu và kế hoạch cá nhân lưu trong localStorage của trình duyệt.
- Đơn hàng, sản phẩm, giao dịch, quyền PRO và quyền tài liệu lưu trong PostgreSQL.
- Tự động kích hoạt cần `SEPAY_WEBHOOK_SECRET` và webhook thật. Xem `PAYMENTS_SEPAY_SETUP_VI.md`.
