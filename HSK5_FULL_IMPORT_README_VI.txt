HSK5 FULL PAPER IMPORT — HƯỚNG DẪN
===================================

Bản này đã nhập nội dung từ 5 PDF người dùng cung cấp:
- H51333
- H51332
- H51328
- H51008
- H51006

Mỗi mã đề có 3 bài tương tác dưới kỹ năng tương ứng (Volume 5):
- Listening: 45 câu trắc nghiệm, đáp án A/B/C/D đã nhập; trường audio_url để trống.
- Reading: 45 câu, đủ ba phần; 19 Passage (4 đoạn điền từ/ cụm từ, 10 đoạn ngắn, 5 bài đọc dài) hoặc bố cục tương ứng với đề gốc.
- Writing: 10 nhiệm vụ (91–98 hoàn thành câu, 99 viết ngắn theo từ gợi ý, 100 viết theo tranh); ảnh câu 100 được đính kèm.

TỔNG: 15 bài tương tác. Test number nội bộ là 101–105 để tránh đè lên bài kiểm tra VOL 5 hiện có; giao diện hiển thị mã đề gốc H51333/H51332/H51328/H51008/H51006.

DỮ LIỆU
- data/hsk5_full_papers_seed.json chứa toàn bộ nội dung, đáp án, passage, cấu trúc nhóm câu hỏi và metadata.
- tests/hsk5/*_task100.png là ảnh của câu viết 100 lấy từ từng PDF.
- server.js tự chạy seedHsk5Papers() khi khởi tạo DB. Nếu chưa cấu hình DATABASE_URL/POSTGRES_URL, dữ liệu chỉ nằm trong JSON chứ chưa xuất hiện trên website.
- Audio deliberately remains blank; upload audio từ chức năng Admin sau khi triển khai. Seeder giữ nguyên audio_url đã tải lên khi server khởi động lại.

LƯU Ý TRIỂN KHAI
1. Thay mã nguồn website bằng nội dung của gói ZIP này và kiểm tra biến môi trường DATABASE_URL/POSTGRES_URL.
2. Deploy/restart. Xem log `HSK5 full papers seed` để xác nhận seed đã chạy.
3. Vào kỹ năng Listening, chọn VOL 5, rồi tìm theo mã đề (ví dụ H51333). Upload audio bằng chức năng Admin của website.
4. Reading và Writing cùng mã đề xuất hiện ở kỹ năng Reading/Writing, VOL/Practice Test 5.
5. Câu 99–100 là bài viết mở; không có đáp án mẫu chấm tự động trong tài liệu nguồn. Câu 91–98 có đáp án tham khảo trong `answerKey`.

PHÂN LOẠI CẤU TRÚC
- Listening PDF chỉ có lựa chọn; phần thoại được phát bằng audio mà Admin tự tải lên. Hai đề có transcript trong phụ lục PDF được lưu trong raw source metadata, không hiển thị như câu hỏi.
- Các PDF còn lại không chứa transcript/audio nên không tự tạo nội dung thoại.
