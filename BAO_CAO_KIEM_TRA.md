# Báo cáo kiểm tra – HSK6 Dự đoán tháng 1 / Reading

- Nguồn: `HSK6_2.0_10_bo_de_du_doan_Doc_Viet_12_2026.pdf` (168 trang).
- Đã tách 10 bộ đề, loại bỏ toàn bộ phần Viết.
- 10/10 bộ có đủ câu 51–100 (50 câu/bộ).
- 10/10 bộ có đủ 50 khóa đáp án và phần giải thích từng câu.
- Mỗi bộ có 9 nhóm giao diện: 2 nhóm câu hỏi chọn đáp án đầu, 2 nhóm ghép câu 71–80, và 5 đoạn đọc hiểu 81–100.
- Tổng: 500 câu hỏi, 500 đáp án, 10 bộ đề; chỉ thuộc kỹ năng `reading`.
- Phần 71–75 và 76–80 giữ nguyên ngân hàng lựa chọn chung A–E; mỗi câu có đáp án đúng gắn theo số câu.
- Các đáp án 78 và 80 của Bộ 08 được đọc kiểm tra trực tiếp trên trang đáp án gốc (trang PDF 133; trang in 132): lần lượt D và C.
- Kiểm tra cấu trúc dữ liệu: PASS.
- `node --check hsk6-jan-reading-seed-v1.js`: PASS.
- `node test-hsk6-jan-reading-seed-v1.js`: PASS (10 insert lần đầu, 0 insert lần chạy lại; tái sử dụng bản có content+answer key JSONB khớp chính xác).
- `git apply --check server.js.patch` trên `server.js` của gói source gần nhất trong Library: PASS.
- `node --check server.js` sau khi áp dụng patch thử: PASS.

Lưu ý: Báo cáo này xác nhận gói dữ liệu và logic được kiểm thử trong môi trường cục bộ. Chưa truy cập được PostgreSQL production hoặc Render, do đó không khẳng định dữ liệu đã được deploy lên website thật.
