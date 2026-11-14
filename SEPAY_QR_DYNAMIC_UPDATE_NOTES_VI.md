# Cập nhật QR động SePay cho nút mua PRO

## Những thay đổi

- `payment.html`: khi mua PRO, người mua tạo đơn trước; sau đó trang hiện QR riêng cho đơn đó. QR chứa đúng số tiền gói PRO và nội dung `RT9P` + 10 chữ số.
- `server.js`: thêm mã chuyển khoản riêng cho `pro_orders`, kiểm tra cấu hình ngân hàng trước khi tạo QR, nhận Webhook SePay cho cả đơn PRO cũ và đơn hàng tại cửa hàng, chống ghi nhận trùng giao dịch, tự kích hoạt/cộng nối thời hạn PRO.
- `admin/index.html`: hiển thị mã chuyển khoản trong danh sách đơn PRO và không còn hiện nút cấp PRO lần nữa cho đơn đã kích hoạt tự động.
- `PAYMENTS_SEPAY_SETUP_VI.md`: bổ sung hướng dẫn cấu hình.

## Cấu hình Admin

Mở Admin → Cấu hình thanh toán khóa học (đây là cấu hình ngân hàng dùng chung cho trang thanh toán) và lưu:

- Tên ngân hàng: `KienLongBank`
- Mã ngân hàng / BIN VietQR: `970452`
- Chủ tài khoản: đúng tên chủ tài khoản tại ngân hàng
- Số tài khoản: số tài khoản KienLongBank thực tế đang gắn với webhook SePay

Không điền số VA thay cho số tài khoản chính, trừ khi Webhook của bạn được thiết lập nhận đúng VA đó.

## Cấu hình SePay

- Webhook nhận giao dịch tiền vào, URL `https://TEN-MIEN-CUA-BAN/api/webhooks/sepay`.
- Dùng HMAC-SHA256 và đặt `SEPAY_WEBHOOK_SECRET` trên hosting.
- Tại Cấu hình Công ty → Cấu hình chung → Cấu trúc mã thanh toán, thêm mẫu tiền tố `RT9P`, hậu tố tối thiểu/tối đa đều là `10`, loại ký tự `Số nguyên`.
- Nếu Webhook bật “Chỉ gửi khi có mã thanh toán”, phải bật và lưu mẫu `RT9P` ở trên. Nếu không dùng bộ lọc này, nội dung chuyển khoản nguyên bản vẫn cần được gửi về webhook.

## Triển khai

Thay các file đã cập nhật trong repository, commit/push lên GitHub và deploy lại Render. Khi server khởi động, các cột và bảng cần thiết sẽ được tạo tự động bằng migration trong `server.js`.

Sau khi deploy, hãy tạo một đơn PRO thử và xác nhận QR khi quét hiển thị đúng số tiền cùng mã `RT9P...`; chỉ thử thanh toán thật sau khi đã xác nhận đúng tài khoản nhận tiền và webhook.
