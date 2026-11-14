NHẬP ĐỀ HSK 6 - HƯỚNG DẪN TIẾNG VIỆT
====================================

Nội dung đã tích hợp
--------------------
- 9 mã đề PDF có bảng đáp án: H61001, H61003, H61005, H61006, H61327, H61328,
  H61329, H61330, H61333.
- Mỗi mã đề được tách thành 2 bài trên web: LISTENING (50 câu) và READING (50 câu),
  tổng cộng 18 bài luyện.
- Đề Reading giữ số câu gốc 51-100. Câu 71-80 hiển thị dưới dạng một ngân hàng lựa chọn
  dùng chung cho nhóm, không lặp A-E như 10 câu trắc nghiệm độc lập.
- Đáp án lấy từ bảng đáp án ở PDF nguồn. Phần giải thích trên web là ghi chú hướng dẫn
  làm bài dựa trên đáp án/đoạn văn từ nguồn; không phải lời giải chính thức của nhà xuất bản.
- H61001, H61003, H61005, H61333 có lời thoại nghe được trích từ tài liệu. Các đề còn lại
  không có transcript trong PDF đã gửi; hệ thống ghi rõ giới hạn, không tự bịa lời thoại.

Cách nhập vào website
---------------------
1. Giải nén gói website này vào thư mục dự án.
2. Giữ nguyên file data/hsk6_papers_seed.json.
3. Cấu hình DATABASE_URL hoặc POSTGRES_URL trỏ đến PostgreSQL của website.
4. Cài các package (npm install) và chạy npm start; hàm seedHsk6Papers() tự đưa đề vào
   bảng practice_tests khi server khởi tạo DB. Nếu deploy trên host, tải lên các file đã sửa
   và khởi động lại/redeploy để chạy seeding.
5. Các đề được gán test_no nội bộ 101-109 để tránh đè lên bộ HSK6 đang có sẵn trong database;
   trên thẻ web, mã đề vẫn hiện như H61001, H61003, v.v.
6. URL audio đang để trống. Với Listening, web sẽ hiện trạng thái “Đang chờ Admin tải audio”
   và chưa cho bắt đầu làm bài cho tới khi Admin thêm file nghe. Đáp án vẫn được giữ sẵn.
7. Sau khi nộp bài, học viên mở từng câu để xem lựa chọn của mình, đáp án đúng và giải thích.

Giới hạn với PDF “tiengtrungthuonghai.vn_Tinh giảng HSK6.pdf”
--------------------------------------------------------------
File 215 trang này chứa 8 đề mô phỏng nhưng bản đã cung cấp không có bảng đáp án hoặc lời thoại
nghe có thể xác minh. Vì yêu cầu là phải có đáp án và giải thích, 8 đề này chưa được công khai
như bài có chấm điểm. Không gắn nhãn “TINH GIẢNG” cho 9 bộ H610xx/H613xx riêng lẻ, vì chúng
là những PDF mã đề khác chứ không phải 8 đề trong sách Tinh Giảng. Khi có đáp án chính thức/
transcript hoặc PDF đáp án đi kèm, có thể nhập 8 bộ này với tiêu đề “TINH GIẢNG · Đề 1-8”.

Lưu ý
----
- Không có audio trong gói import; Admin sẽ tải audio sau.
- Không có thay đổi nào được đẩy trực tiếp lên hosting từ môi trường này. Gói ZIP là bản dự án
  đã cập nhật để bạn deploy lên host đang sử dụng.
