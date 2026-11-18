# PATCH: Thêm 5 đề HANBAN HSK5 (H51005–H51001)

## File cần cập nhật
1. **Ghi đè** `data/hsk5_full_papers_seed.json` bằng file trong PATCH. Đây là bản seed tích lũy đã giữ lại 5 đề HSK5 đầy đủ trước đó và 20 đề dự đoán Reading HSK5 đã nhập ở patch trước, đồng thời bổ sung 5 đề HANBAN mới.
2. **Gộp thêm** toàn bộ ảnh trong `tests/hsk5/` vào thư mục `tests/hsk5/` trên GitHub. Không xóa các ảnh cũ trong thư mục này.

Không cần thay `server.js`, JavaScript frontend hoặc Environment Variables. Source website đã có `seedHsk5Papers()` và seeder chấp nhận `sourceFile` dạng `HSK5_FULL_PDF_IMPORT_...`.

## Nội dung mới
- 5 mã đề HANBAN: H51005, H51004, H51003, H51002, H51001.
- Mỗi mã có Listening 45 câu, Reading 45 câu, Writing 10 nhiệm vụ.
- Tổng 15 bài mới, 500 câu/nhiệm vụ.
- Đề hiển thị nhãn `HANBAN · HSK5 · <mã đề>`; mã đề được hiển thị riêng trên card.
- Listening `audioUrl` để trống để Admin upload sau.

## Cài đặt trên GitHub và Render
1. Sao lưu file `data/hsk5_full_papers_seed.json` hiện tại.
2. Thay file seed bằng bản trong PATCH.
3. Upload/gộp các ảnh mới vào `tests/hsk5/`.
4. Commit changes lên GitHub.
5. Vào Render → Manual Deploy → Deploy latest commit.
6. Mở Render Logs, tìm `HSK5 full papers seed` để xem số bản ghi inserted/updated/skipped.
7. Vào HSK5 → Listening / Reading / Writing, tìm nhãn HANBAN và các mã H51005–H51001.
8. Khi có audio, mở từng đề Listening trong Admin và upload audio như các đề khác.

## Lưu ý quan trọng
- File seed trong PATCH có **50 bản ghi**: 15 bản ghi full exams cũ, 20 bản ghi dự đoán Reading đã có, và 15 bản ghi mới HANBAN. Không dùng lại seed rút gọn chỉ có 15 bài mới, vì sẽ làm mất các đề HSK5 trước đó.
- Các ảnh mới có tên `H5100x_...`; khi gộp thư mục, không ghi đè ảnh khác cùng tên.
- Bản seed gửi audio rỗng. Seeder hiện có giữ lại `audio_url` của bài cũ nếu đã có audio trong database.
- PDF không có lời giải chi tiết cho từng câu; chỉ có đáp án và các bản văn nguồn. Câu Viết 99–100 là bài viết mở, không có đáp án mẫu trong PDF.
- Mình đã chuẩn bị file patch và kiểm tra dữ liệu offline; chưa truy cập hoặc triển khai trực tiếp vào database/Render production của bạn.
