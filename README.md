# HSK STUDIO · HSK 7–9

Website luyện tập cho **một chương trình HSK 7–9 thống nhất**. Không có lựa chọn kho đề riêng HSK 7, HSK 8 hoặc HSK 9. Học viên luyện tập trong cùng một hệ thống; chỉ sau khi hoàn thành và chấm **bài thi thử tổng hợp** thì website mới đối chiếu điểm với các ngưỡng do Admin thiết lập để đưa ra mức ước tính HSK 7, HSK 8 hoặc HSK 9.

Website giữ nguyên bốn kỹ năng HSK 7–9: **Listening, Reading, Writing và Translation**. Ngoài ra, bổ sung **HSKK Speaking** thành một mô-đun độc lập (HSKK 2.0 và HSK Speaking 3.0, mỗi cấp Sơ/Trung/Cao cấp), không thay thế Writing HSK hoặc bốn kỹ năng hiện có.

## Chức năng học viên

- Thanh điều hướng: Làm đề, Luyện đề, Cá nhân hóa, Từ vựng, Take notes và Flashcard.
- Kho đề và luyện theo kỹ năng trong **một kho HSK 7–9 chung**; không có bộ lọc/selector HSK 7, 8, 9 riêng.
- Listening/Reading: làm bài, nộp bài, xem đáp án và giải thích trong giao diện hai khung, có thanh kéo điều chỉnh kích thước.
- Writing/Translation: gửi bài để Google Gemini chấm, nhận điểm, phản hồi theo tiêu chí và đề xuất cải thiện.
- HSKK (bổ sung, không thay thế các phần cũ): mô-đun luyện nói riêng, có sáu cấu hình HSKK 2.0/HSK Speaking 3.0 × Sơ/Trung/Cao cấp; microphone tự ghi âm sau khi audio câu hỏi kết thúc, đếm ngược thời gian trả lời và tự chuyển câu; Gemini nhận cả audio gốc, hình đề (nếu có) và bản ghi học viên để chấm phát âm, thanh điệu, độ lưu loát, ngữ pháp, từ vựng và mức độ hoàn thành yêu cầu.
- Thi thử tổng hợp: một bài thi gồm Listening, Reading, Writing và Translation. Hệ thống chỉ quy đổi mức HSK sau khi chấm đủ bốn phần; trong khi luyện tập thông thường không hiển thị mức HSK.
- Sổ tay nổi có thể mở/đóng, lưu ghi chú và từ vựng; có thể tùy chỉnh font tiếng Trung và tiếng Việt.
- PRO và cửa hàng tài liệu lấy gói/sản phẩm từ Admin, không khóa danh sách cứng trong frontend.

## Chạy local

Yêu cầu Node.js 18+ và PostgreSQL.

```bash
npm install
```

Tạo file `.env` dựa trên `.env.example`, sau đó cấu hình ít nhất:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
ADMIN_PASSWORD=CHANGE_THIS_TO_A_STRONG_PASSWORD
```

Để bật AI chấm Writing, Translation và HSKK Speaking, thêm API key của Google AI Studio:

```env
GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_API_KEY
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TIMEOUT_MS=90000
```

Chạy ứng dụng:

```bash
npm start
```

Mở `http://localhost:3000`. Server tạo/cập nhật bảng khi khởi động. Không commit `.env` hoặc API key vào GitHub.

## Trang quản trị

- Đường dẫn: `/admin/`.
- Đăng nhập bằng mật khẩu Admin đặt trong `ADMIN_PASSWORD`.
- **Nhập đề HSK 7–9:** chỉ có một chương trình chung. Admin nhập đề theo Listening, Reading, Writing hoặc Translation, không chọn cấp HSK riêng.
- **HSKK Studio:** mở tại `/admin/hskk.html`, nhập riêng HSKK 2.0 / HSK Speaking 3.0 theo Sơ cấp (27 câu), Trung cấp (14 câu), Cao cấp (6 câu), thêm audio/ảnh và đặt thời gian chuẩn bị/trả lời từng câu.
- **Thi thử tổng hợp:** chọn một đề đã publish cho từng kỹ năng, đặt thời lượng và cấu hình ngưỡng điểm ước tính HSK7/8/9. Các ngưỡng mặc định trong code là 60/75/88 trên thang 100; Admin có thể thay đổi theo thang điểm nội bộ mong muốn.
- **PRO:** tạo/sửa/xóa gói, giá, thời hạn và các kỹ năng được mở.
- **Tài liệu:** tạo/sửa/xóa sản phẩm, giá, mô tả, link tải; theo dõi và xử lý đơn mua.
- **Thanh toán:** cập nhật ngân hàng, QR và nội dung chuyển khoản.

## Cách quy đổi kết quả thi thử

Điểm tổng là trung bình phần trăm của bốn kỹ năng. Sau khi cả Listening, Reading, Writing và Translation đã chấm thành công:

- Đạt ngưỡng HSK9 trở lên → mức ước tính HSK 9.
- Đạt ngưỡng HSK8 nhưng chưa tới HSK9 → mức ước tính HSK 8.
- Đạt ngưỡng HSK7 nhưng chưa tới HSK8 → mức ước tính HSK 7.
- Dưới ngưỡng HSK7 → chưa đạt ngưỡng quy đổi.

**Lưu ý:** Ngưỡng mặc định 60/75/88 chỉ là ngưỡng tham khảo nội bộ của website, không phải công thức chấm hoặc quy đổi chứng chỉ chính thức. Bài thi mô phỏng trong website có bốn kỹ năng; kết quả hiển thị phải được hiểu là mức ước tính tham khảo.

## Dữ liệu khi nâng cấp

Khi server khởi động, migration sẽ:

1. Xóa các dòng đề ngoài chương trình (các volume HSK3–6 và các volume không thuộc 7–9) khỏi bảng `practice_tests`.
2. Gộp các đề volume 7, 8, 9 về cùng một mã nội bộ `79`, đổi số thứ tự liên tục theo từng kỹ năng để tránh các bộ đề tách cấp trong hệ thống.
3. Giữ riêng HSKK Speaking ở các volume nội bộ 20/21/22 (2.0) và 30/31/32 (3.0); không gộp HSKK vào kho HSK 7–9 hoặc bài thi thử dùng để quy đổi HSK.
4. Không xóa tài khoản, quyền PRO, đơn hàng, lịch sử nộp bài hoặc dữ liệu ghi chú. HSKK được lưu riêng và không bị migration kho HSK7–9 xóa.

Lưu ý: thao tác migration trên là thay đổi dữ liệu thực trong PostgreSQL. Hãy sao lưu database trước khi deploy bản nâng cấp.

## Checklist sau khi deploy

1. Đặt `DATABASE_URL`, `ADMIN_PASSWORD` và `GEMINI_API_KEY` trong Environment Variables.
2. Đăng nhập Admin, tạo và publish đề thuộc cả bốn kỹ năng. Bộ dữ liệu demo đi kèm hiện có Listening, Reading và Writing; cần nhập/publish ít nhất một đề Translation trước khi cấu hình thi thử.
3. Vào tab **Thi thử tổng hợp**, chọn đủ bốn đề và lưu cấu hình.
4. Kiểm tra một bài Listening/Reading để xác nhận answer key và explanation đầy đủ.
5. Kiểm tra Writing/Translation với Gemini API key hợp lệ.
6. Hoàn thành thi thử để kiểm tra trang kết quả; mức HSK chỉ xuất hiện sau chấm đủ bốn kỹ năng.
