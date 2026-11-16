# Cập nhật chấm AI cho HSK Writing và HSKK

## Đã thay đổi

- HSK Writing cấp 7–9 được chuyển sang mô-đun chấm HSK chuyên biệt, sử dụng `DEEPSEEK_API_KEY` và `DEEPSEEK_WRITING_MAX_TOKENS` phía máy chủ.
- Luồng làm bài gửi đầy đủ danh sách tác vụ, hướng dịch (nếu có), cấp độ và câu trả lời; bài HSK Writing được lưu trước, chấm nền và trang phân tích HSK tự kiểm tra trạng thái để hiện kết quả ngay khi hoàn tất (không phải chờ một request dài).
- HSKK dùng mô-đun nhận dạng audio và phân tích transcript; audio được trình duyệt chuẩn hóa thành WAV PCM 16-bit mono 16 kHz, chia đoạn ngắn trước khi gửi.
- Trang thi HSKK có vòng xoay khi chuẩn hóa/nộp bài; trang kết quả có trạng thái đang chấm và tự tải kết quả sau khi backend hoàn tất.
- Giao diện học viên và Admin chỉ hiển thị “AI chấm”, không nêu tên nhà cung cấp/mô hình.

## Biến môi trường

Source dùng các biến bạn đã cấu hình: `DEEPSEEK_API_KEY`, `DEEPSEEK_WRITING_MAX_TOKENS`, `HSKK_DEEPSEEK_MODEL`, `HSKK_DEEPSEEK_MAX_TOKENS`. Không cần đưa API key vào mã nguồn hoặc trình duyệt.

## Lưu ý về HSKK

Điểm HSKK hiện dựa trên transcript nhận dạng được. Hệ thống không trực tiếp chấm thanh điệu, thanh mẫu, vận mẫu, ngữ điệu hoặc tốc độ nói; các mục này được hiển thị là “Chưa đánh giá”. Đây là giới hạn kỹ thuật hiện tại, không phải điểm 0.

## Triển khai

1. Thay source trên Render bằng source trong gói ZIP đã cập nhật.
2. Giữ nguyên Environment Variables hiện có.
3. Deploy lại service.
4. Thử một bài HSK Writing 7–9 và một bài HSKK ngắn để kiểm tra kết quả.
