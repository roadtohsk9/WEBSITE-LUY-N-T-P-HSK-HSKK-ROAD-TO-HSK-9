# Cấu hình chấm bài AI cho website HSK 7–9

Website dùng Google Gemini để chấm **Writing HSK**, **Translation** và mô-đun **HSKK Speaking** được bổ sung riêng. Listening và Reading vẫn chấm theo đáp án/giải thích do Admin nhập. HSKK không thay thế Writing HSK và không tham gia bài thi thử bốn kỹ năng dùng để ước tính HSK7/8/9.

## 1. Tạo API key

1. Mở Google AI Studio: https://aistudio.google.com/apikey
2. Tạo API key cho dự án Google của bạn.
3. Không dán key vào HTML, JavaScript phía trình duyệt, nội dung đề hoặc GitHub công khai.

## 2. Khai báo biến môi trường trên máy chủ

Thêm các biến sau vào phần Environment Variables của dịch vụ đang host website:

```env
GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_API_KEY
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TIMEOUT_MS=90000
```

`GEMINI_MODEL` có thể được thay bằng một model Gemini khác được tài khoản/API của bạn hỗ trợ. Sau khi lưu biến môi trường, hãy redeploy hoặc restart ứng dụng.

## 3. Kiểm tra cấu hình

Mở endpoint `/api/ai/status`. Trường `configured` phải là `true`, provider hiển thị Google Gemini và model là model đang cấu hình. Endpoint không trả API key về trình duyệt.

## 4. Luồng chấm điểm

- **Writing:** Gemini đọc từng task, bài làm và yêu cầu của đề; trả điểm tổng, tiêu chí, điểm mạnh, lỗi/câu cần sửa, cách diễn đạt tốt hơn và kế hoạch luyện tập.
- **Translation:** Gemini được cung cấp chiều dịch, văn bản nguồn và bài dịch; đánh giá độ chính xác, độ đầy đủ, ngữ pháp, từ vựng và tính tự nhiên. Bản dịch tham khảo chỉ là gợi ý; cách diễn đạt tương đương đúng nghĩa vẫn được chấp nhận.
- **HSKK:** Gemini nhận từng bản ghi giọng nói, audio câu hỏi gốc và hình đề (đối với mô tả tranh) nếu có; chấm mức độ hoàn thành, phát âm/thanh điệu, lưu loát, ngữ pháp, từ vựng và khả năng diễn đạt. Kết quả có feedback từng câu và kế hoạch cải thiện. HSKK dùng thang 100 nội bộ, không dùng IELTS band và không bị cộng vào bài thi thử HSK7–9 bốn kỹ năng.
- Kết quả gồm điểm 100, feedback theo task, phần cần cải thiện và gợi ý ghi chú. Người học có thể lưu ghi chú trong trang kết quả.
- Nếu Gemini chưa được cấu hình hoặc trả lỗi, bài nộp vẫn được lưu; trang kết quả sẽ thông báo để người quản trị kiểm tra cấu hình.

## 5. Bảo mật

- Chỉ cấu hình `GEMINI_API_KEY` ở phía máy chủ.
- Không commit file `.env` lên repository.
- Nên đặt giới hạn chi phí/quota và theo dõi mức sử dụng trong Google AI Studio/Google Cloud.
