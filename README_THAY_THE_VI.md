PATCH FIX HSK 6 WRITING — HIỂN THỊ VĂN BẢN NGUỒN + AI CHẤM

Trong ZIP này chỉ có 3 file source cần thay thế:
1. hsk-exam.html
2. server.js
3. hsk-writing-grading.js

ĐƯỜNG DẪN
Cả 3 file đều nằm ở thư mục gốc (root) của source website, cùng cấp với package.json.
Không tải các file này vào một thư mục con mới.

CÁCH THAY THẾ
1. Tải ZIP patch và giải nén trên máy tính.
2. Mở source website hiện tại của bạn.
3. Sao lưu 3 file cũ: hsk-exam.html, server.js, hsk-writing-grading.js.
4. Chép 3 file trong patch vào thư mục gốc source website và chọn Replace/Overwrite.
5. Upload/commit 3 file đã thay thế lên đúng GitHub repository.
6. Chờ Render deploy commit mới (hoặc bấm Manual Deploy → Deploy latest commit).

KHÔNG CẦN
- Không thay toàn bộ source website.
- Không xóa dữ liệu/database.
- Không tạo bảng database mới.
- Không đưa API key vào frontend.
- Không cần thêm Environment Variable mới để chạy. Hệ thống dùng DEEPSEEK_API_KEY hiện có.

TỐI ƯU TOKEN
- HSK6 Writing dùng prompt chuyên biệt cho bài 缩写.
- Đầu ra bị giới hạn mặc định tối đa 1.300 tokens; có thể đặt HSK6_WRITING_MAX_TOKENS (700–2.000) nếu muốn đổi giới hạn, nhưng không bắt buộc.
- Văn bản nguồn và bài làm chỉ được gửi một lần trong một request chấm.
- Bài trống được trả 0 điểm ở backend mà không gọi AI.
- HSK7–9 Writing và Translation tiếp tục dùng luồng chấm cũ.

SAU KHI DEPLOY, KIỂM TRA
1. Vào Admin → kho đề → mở đề HSK 6 Writing.
2. Kiểm tra trường “Văn bản nguồn / 阅读材料” có nội dung và lưu/publish đề.
3. Mở đề ở tài khoản học viên: văn bản nguồn phải hiện phía trên đề bài; ô trả lời là khung nhập nhiều dòng.
4. Nhập bài và bấm một trong hai nút “Nộp bài”.
5. Trang sẽ báo “AI đang chấm bài Writing”, sau đó hiển thị điểm /100, 4 tiêu chí, ý chính thiếu/sai, sửa lỗi, hướng cải thiện và bản tóm tắt tham khảo nếu có.

GHI CHÚ
Điểm hiển thị là mức đánh giá tham khảo theo rubric nội bộ bám dạng HSK6 缩写, không phải điểm thi chính thức. Frontend chỉ hiển thị “AI chấm”; không hiển thị tên nhà cung cấp/mô hình.
