# Admin update: tài liệu nguồn và passage tùy ý

## Điểm mới

- Thêm tab **Nhập tài liệu** trong Admin.
- Tải file `.docx` hoặc `.txt` để tạo/cập nhật đề trong question bank; có thể chọn kỹ năng, cấp HSK, số đề, thời gian, tổng câu, tiêu đề và audio tùy chọn.
- File gốc được giữ trong `content.rawText` để đối chiếu; số câu/đáp án nhận diện được phụ thuộc định dạng văn bản đầu vào.
- Khi mở đề nhập trong HSK Exam Studio, có khu vực **Tài liệu nguồn đã nhập** và nút nạp toàn bộ văn bản nguồn vào Passage 1.
- Reading có nút **+ THÊM PASSAGE**; Listening có **+ THÊM SECTION**. Có thể tạo số lượng tùy ý, đặt tên, nhập nội dung/định dạng, gắn ảnh và xóa từng phần.
- Question Group có thể gán vào các passage/section mới; khi xóa một phần, hệ thống đánh lại số phần và chuyển các nhóm liên quan sang phần gần nhất.
- Lưu `passageTitles` / `sectionTitles` cùng `passages` / `sections` trong content JSON.
- Bộ nhập văn bản chấp nhận thêm dấu câu full-width thường gặp trong tài liệu tiếng Trung và lựa chọn dạng `A nội dung`.

## Kiểm tra

- `node --check server.js`: passed.
- JavaScript inline trong `admin/index.html` được trích xuất và kiểm tra bằng `node --check`: passed.

## Lưu ý

- Mục nhập tài liệu hỗ trợ DOCX/TXT, chưa nhận PDF trực tiếp.
- Tự nhận diện chỉ là bộ phân tích văn bản cơ bản; luôn kiểm tra câu hỏi, lựa chọn và answer key sau khi nhập. Tài liệu gốc vẫn được giữ để đối chiếu.
