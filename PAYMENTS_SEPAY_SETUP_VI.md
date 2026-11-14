# Hướng dẫn cấu hình thanh toán tự động ROAD TO HSK 9

## 1. Cấu hình tài khoản ngân hàng trong Admin

Mở `/admin/` → **Thanh toán** và điền:

- **Tên ngân hàng**: tên ngân hàng nhận tiền.
- **Mã ngân hàng / BIN VietQR**: mã định danh ngân hàng được VietQR hỗ trợ, đúng với tài khoản nhận tiền.
- **Chủ tài khoản** và **Số tài khoản**: thông tin nhận chuyển khoản.
- **VAT mặc định (%)**: mức áp dụng chung. Có thể cấu hình VAT riêng ở từng sản phẩm; để trống VAT của sản phẩm thì hệ thống dùng mức mặc định.

Khi có bank code và số tài khoản, checkout tạo ảnh QR VietQR theo từng đơn, đã điền đúng số tiền và mã chuyển khoản riêng. Nếu chưa khai báo bank code, hệ thống dùng QR tĩnh (nếu có) và hiện hướng dẫn chuyển khoản thủ công; không thể bảo đảm QR tĩnh tự mang đủ số tiền/nội dung cho từng đơn.

## 2. Kết nối SePay để nhận giao dịch và mở khóa ngay

Luồng tự động yêu cầu tài khoản SePay đã kết nối đúng tài khoản ngân hàng nhận tiền.

1. Trong SePay Dashboard, tạo **Webhook** nhận giao dịch tiền vào (inbound).
2. Đặt URL webhook là `https://TEN-MIEN-CUA-BAN/api/webhooks/sepay`.
3. Chọn xác thực chữ ký **HMAC-SHA256** (khuyến nghị) và sao chép Secret Key.
4. Trong phần biến môi trường của hosting, đặt `SEPAY_WEBHOOK_SECRET` bằng Secret Key vừa tạo. Không đưa secret vào file JavaScript hoặc giao diện Admin.
5. Khởi động lại ứng dụng sau khi lưu biến môi trường.
6. Dùng giao dịch thử giá trị nhỏ và kiểm tra đơn hàng trong Admin → **Sản phẩm & Tài liệu**.

Backend kiểm tra chữ ký HMAC, thời gian webhook, loại giao dịch tiền vào, số tài khoản nhận, mã chuyển khoản trong nội dung và số tiền khớp tuyệt đối. Mã giao dịch SePay được ghi với ràng buộc duy nhất để webhook gửi lặp không cấp quyền lần hai. Chỉ sau khi các bước này hợp lệ, hệ thống đánh dấu đơn đã thanh toán, cộng thời hạn PRO và mở quyền tài liệu.

Có thể dùng `SEPAY_API_KEY` thay cho HMAC trong cấu hình đặc biệt, nhưng HMAC được khuyến nghị. Không khai báo đồng thời hai biến nếu bạn chưa chủ động chọn phương thức xác thực.


## 2A. Thanh toán PRO từ trang mua PRO cũ (`payment.html`)

Các nút mua PRO ở `practice.html` và `courses.html` dùng luồng đơn PRO riêng. Bản cập nhật này tạo mã chuyển khoản riêng cho từng đơn theo dạng `RT9P` + 10 chữ số; QR trả về có sẵn số tiền gói PRO và đúng mã chuyển khoản. Khi SePay xác nhận giao dịch hợp lệ, backend đối soát `pro_orders`, ghi nhận mã giao dịch duy nhất và tự kích hoạt quyền PRO cho tài khoản khớp email.

Để SePay nhận diện mã nếu bạn bật bộ lọc “Chỉ gửi khi có mã thanh toán”, vào **Cấu hình Công ty → Cấu hình chung → Cấu trúc mã thanh toán**, thêm mẫu:

- Tiền tố: `RT9P`
- Hậu tố tối thiểu: `10`
- Hậu tố tối đa: `10`
- Loại ký tự: **Số nguyên**

Nếu webhook đang bật bộ lọc “Chỉ gửi khi có mã thanh toán”, phải lưu cấu trúc trên trước khi thử giao dịch. Nếu không bật bộ lọc này, SePay vẫn cần gửi nội dung chuyển khoản nguyên bản để server tìm mã `RT9P...`.

Email ở trang mua PRO phải thuộc một tài khoản ROAD TO HSK 9 đã đăng ký. PRO được cấp cho tài khoản gắn với email đó; việc nhập một email chưa có tài khoản sẽ bị từ chối để tránh nhận tiền nhưng không có tài khoản để mở quyền.

**Lưu ý về ngân hàng:** nếu nhận tiền vào tài khoản KienLongBank trong ảnh SePay, mã BIN VietQR là `970452` (có thể dùng mã ngắn `KLB` nếu hệ thống VietQR đang dùng mã ngắn). Số tài khoản phải là số tài khoản nhận tiền mà webhook đang theo dõi; không tự thay bằng số tài khoản ảo (VA) trừ khi webhook cũng được cấu hình nhận đúng VA đó.

## 3. Đối soát trong Admin

Admin → **Sản phẩm & Tài liệu** có danh sách đơn hàng, mã đơn, mã chuyển khoản, học viên, sản phẩm, tiền hàng, VAT, tổng tiền và trạng thái. Nút **Đối soát** chỉ dùng khi Admin đã kiểm tra khoản tiền thực tế vào tài khoản. Khi xác nhận, quyền PRO/tài liệu được mở ngay. Không dùng nút này chỉ dựa trên ảnh chụp do người mua gửi.

## 4. VAT và giá bán

Checkout tính VAT theo từng dòng sản phẩm:

`VAT dòng = làm tròn (số lượng × đơn giá × thuế suất)`

`Tổng thanh toán = tiền hàng + tổng VAT`

Admin có thể đặt VAT riêng từng sản phẩm (0–100%) hoặc để trống để dùng VAT mặc định. Mức thuế thực tế phụ thuộc vào phân loại hàng hóa/dịch vụ và hồ sơ kinh doanh; cần kiểm tra với kế toán/đơn vị tư vấn thuế trước khi xuất hóa đơn hoặc vận hành chính thức. Không mặc định mọi hoạt động giáo dục, tài liệu số và quyền truy cập nền tảng đều có cùng cách áp dụng VAT.

## 5. Kiểm tra nhanh trước khi công khai

- Website chạy trên HTTPS.
- Tài khoản ngân hàng trong Admin đúng với tài khoản đã kết nối ở SePay.
- Webhook inbound trỏ đúng domain công khai.
- `SEPAY_WEBHOOK_SECRET` đã được lưu ở biến môi trường của hosting.
- Mã ngân hàng/BIN VietQR đã được thử với tài khoản nhận tiền.
- Đã thử một giao dịch thành công, một giao dịch sai số tiền và một webhook gửi lặp.
- File tài liệu được upload bằng Admin và không thể tải bằng phiên đăng nhập chưa mua.

**Lưu ý:** Bản code đã có endpoint webhook và luồng xác nhận. Không thể kích hoạt thanh toán tự động trong môi trường chưa được kết nối SePay/ngân hàng và chưa cấu hình secret trên hosting.
