# Hướng dẫn cấu hình chấm HSKK tự động

## 1. Cấu hình trên Render

Vào Render → Web Service → Environment và thêm:

- `DEEPSEEK_API_KEY`: khóa API dùng phía máy chủ cho nhận dạng audio và phân tích transcript.
- `HSKK_DEEPSEEK_MODEL`: `deepseek-flash` (khuyến nghị để tiết kiệm chi phí).
- `HSKK_AI_TIMEOUT_MS`: `240000` (tùy chọn, tính bằng mili giây).

Lưu thay đổi và deploy lại service. Không đặt khóa API trong HTML, JavaScript phía trình duyệt, GitHub hoặc nội dung gửi cho học viên. HSKK dùng chung biến `DEEPSEEK_API_KEY` với các chức năng AI hiện có của website.

## 2. Cách xử lý audio

1. Trình duyệt ghi âm câu trả lời bằng MediaRecorder.
2. Trước khi gửi, trình duyệt giải mã bản ghi và chuẩn hóa thành WAV PCM 16-bit, mono, 16 kHz.
3. Audio được chia thành các đoạn tối đa 110 giây để phù hợp giới hạn mỗi tệp nhận dạng.
4. Backend gửi từng đoạn tới dịch vụ nhận dạng giọng nói, sau đó ghép transcript theo đúng thứ tự câu hỏi.
5. Backend gửi transcript, câu hỏi và văn bản tham chiếu (nếu Admin nhập) tới mô hình phân tích để tạo feedback JSON.
6. Kết quả được lưu trong `hskk_attempts`; file ghi âm thô không được lưu làm bản phát lại trong hồ sơ học viên.

Theo giới hạn API nhận dạng hiện hành, mỗi tệp cần là WAV PCM 16-bit hoặc Ogg Opus, tối đa 8 MiB và 120 giây. Luồng hiện tại chuẩn hóa thành WAV PCM và cắt đoạn 110 giây để có khoảng an toàn. Giới hạn tổng audio của một lần nộp ở website là 12 MiB; nếu vượt, học viên cần giảm thời lượng hoặc chia thành các lượt luyện ngắn hơn.

## 3. Phạm vi đánh giá và giới hạn

Hệ thống phân tích dựa trên transcript được nhận dạng từ audio. Có thể đánh giá mức độ hoàn thành đề, giữ ý, độ chính xác nội dung, mạch diễn đạt thể hiện qua văn bản, logic, phát triển ý, ngữ pháp và từ vựng.

**Hệ thống hiện không chấm trực tiếp phát âm, thanh điệu, thanh mẫu, vận mẫu, ngữ điệu, âm lượng, tốc độ nói hoặc khoảng ngập ngừng.** Các tiêu chí âm thanh này sẽ hiển thị là “Chưa đánh giá”, không tự tạo điểm giả. Transcript tự động có thể nhận dạng sai hoặc bỏ sót từ; feedback cần được hiểu là kết quả luyện tập tham khảo, không phải điểm thi chính thức.

Điểm tổng là điểm luyện tập ước lượng từ sáu nhóm tiêu chí có thể quan sát qua transcript: mạch diễn đạt, mạch lạc, phát triển ý, ngữ pháp, từ vựng và hoàn thành nhiệm vụ. Phát âm không được đưa vào điểm tổng.

## 4. Giao diện học viên

Trong thời gian xử lý, trang kết quả chỉ hiển thị:

**“AI đang chấm bài”**

Kèm vòng tròn xoay và thông báo bài làm đang được nhận dạng, đối chiếu với đề và tạo feedback. Giao diện không hiển thị tên nhà cung cấp hay tên mô hình.

## 5. Kiểm tra sau deploy

1. Vào Admin → HSKK và kiểm tra trạng thái dịch vụ chấm tự động.
2. Tạo một đề thử có 1–2 câu, upload audio câu hỏi nếu cần, rồi xuất bản.
3. Dùng tài khoản học viên làm bài trên HTTPS và cho phép micro.
4. Nộp bài; kiểm tra trang kết quả hiển thị vòng tròn chờ trong lúc xử lý.
5. Khi hoàn tất, kiểm tra transcript, điểm từng tiêu chí có thể đánh giá, tab phát âm hiển thị “Chưa đánh giá”, và các gợi ý sửa nội dung.
6. Thử một bản ghi không rõ tiếng để xác nhận hệ thống có cảnh báo transcript không đáng tin thay vì kết luận chắc chắn học viên nói sai.

## 6. Quyền riêng tư

Trước khi bật chức năng cho học viên, cần thông báo rõ audio được gửi tới dịch vụ nhận dạng bên ngoài để chuyển thành văn bản, sau đó transcript được dùng để chấm luyện tập. Cần nêu mục đích, bên xử lý dữ liệu, thời hạn lưu, cơ chế yêu cầu xóa, và xin sự đồng ý phù hợp. Không tuyên bố rằng âm thanh được phân tích trực tiếp về phát âm trong luồng này.


## Tối ưu token

Khuyến nghị đặt `DEEPSEEK_MODEL=deepseek-flash` và `HSKK_DEEPSEEK_MODEL=deepseek-flash`. Hệ thống tắt thinking cho tác vụ chấm JSON, rút gọn prompt/schema, giới hạn số mục feedback và giới hạn output mặc định 4.200 token cho HSKK. Có thể điều chỉnh bằng `HSKK_DEEPSEEK_MAX_TOKENS` (2.200–6.500). Các log `[DEEPSEEK_HSKK_USAGE]` cho biết input/output token, cache hit/miss và số giây audio ASR; audio ASR được tính theo thời lượng riêng, không phải token.
