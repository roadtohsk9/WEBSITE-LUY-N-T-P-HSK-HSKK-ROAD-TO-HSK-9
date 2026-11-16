# ROAD TO HSK 9 – Tối ưu DeepSeek và sửa giỏ hàng

## 1. Tối ưu sử dụng DeepSeek

Bản cập nhật này tập trung giảm token đầu vào/đầu ra mà vẫn giữ đủ các tab feedback và tiêu chí chấm hiện có.

- Dùng `deepseek-flash` làm model mặc định cho Writing, Speaking và HSKK. Có thể đổi model bằng Environment Variables.
- Tắt thinking cho các tác vụ chấm theo rubric và trả JSON có cấu trúc; không tạo phần suy luận dài không cần thiết.
- Rút gọn phần hướng dẫn/schema lặp lại trong prompt Writing và Speaking.
- HSKK chỉ gửi metadata tối thiểu của đề và dữ liệu theo từng câu: mã câu, dạng câu, câu hỏi, văn bản tham chiếu (nếu có), transcript. Không gửi lại toàn bộ cây đề và không lặp transcript trong phần feedback.
- Giới hạn độ dài feedback theo số mục tối đa; vẫn giữ điểm, nhận xét, điểm mạnh, lỗi và kế hoạch cải thiện.
- Giới hạn output mặc định: Writing 8.000 token, Speaking 5.200 token, JSON repair 4.500 token, HSKK 4.200 token.
- Giữ phần hướng dẫn chấm cố định ở đầu prompt để tăng khả năng tái sử dụng prefix cache tự động.
- Ghi số input/output/total token, cache hit/miss và reasoning token vào Render Logs. Không ghi API key, transcript hoặc câu trả lời của học viên vào log.

**Lưu ý:** các giới hạn là trần tối đa, không có nghĩa mỗi bài luôn tiêu thụ hết số token đó. Không cắt ngắn câu trả lời hợp lệ của học viên chỉ để tiết kiệm token.

### Environment Variables đề xuất trên Render

| Key | Value |
|---|---|
| `DEEPSEEK_API_KEY` | API key bí mật của bạn |
| `DEEPSEEK_MODEL` | `deepseek-flash` |
| `DEEPSEEK_VISION_MODEL` | `deepseek-flash` |
| `HSKK_DEEPSEEK_MODEL` | `deepseek-flash` |
| `DEEPSEEK_WRITING_MAX_TOKENS` | `8000` |
| `DEEPSEEK_SPEAKING_MAX_TOKENS` | `5200` |
| `DEEPSEEK_REPAIR_MAX_TOKENS` | `4500` |
| `HSKK_DEEPSEEK_MAX_TOKENS` | `4200` |
| `DEEPSEEK_TIMEOUT_MS` | `120000` |
| `HSKK_AI_TIMEOUT_MS` | `240000` |

Nếu Render hiện đang lưu `HSKK_DEEPSEEK_MODEL=deepseek-v4-pro`, biến cũ sẽ ghi đè mặc định trong source. Hãy sửa giá trị đó thành `deepseek-flash` để dùng cấu hình tiết kiệm được đề xuất.

### Kiểm tra token usage

Sau khi deploy, mở Render Logs và tìm:

- `[DEEPSEEK_TOKEN_USAGE]`: Writing/Speaking/JSON repair.
- `[DEEPSEEK_HSKK_USAGE]`: HSKK text grading và thời lượng audio ASR.

ASR audio được tính theo thời lượng âm thanh riêng, không phải chat text token. Bản cập nhật không cắt audio hoặc transcript hợp lệ để giảm phí.

## 2. Sửa lỗi giỏ hàng

- Mỗi sản phẩm trong giỏ có nút **Xóa** riêng.
- Nút giảm số lượng `−` ở sản phẩm có số lượng 1 sẽ xóa sản phẩm khỏi giỏ.
- Sản phẩm tài liệu vẫn giới hạn một bản trong mỗi đơn; có thể xóa bằng nút **Xóa**.
- Số lượng trên header, tổng tiền và trạng thái nút thanh toán được render lại ngay sau khi thêm, tăng/giảm hoặc xóa.
- Giỏ hàng được giữ nguyên trong lúc danh mục sản phẩm đang tải; chỉ lọc sản phẩm không còn tồn tại sau khi tải catalog thành công.
- Giỏ hàng đồng bộ khi mở nhiều tab cùng trình duyệt.

## 3. File được cập nhật

- `ai-grading.js`
- `hskk-deepseek.js`
- `js/storefront.js`
- `store.html`
- `.env.example`
- `DEEPSEEK_SETUP.md`
- `AI_SETUP.md`
- `HSKK_DEEPSEEK_SETUP_VI.md`

## 4. Cập nhật GitHub và Render

1. Giải nén Patch ZIP vào đúng thư mục gốc repository, cho phép ghi đè các file trùng tên.
2. Kiểm tra lại Environment Variables của Render, nhất là ba biến model (`DEEPSEEK_MODEL`, `DEEPSEEK_VISION_MODEL`, `HSKK_DEEPSEEK_MODEL`).
3. Commit Changes trên GitHub và chờ Render deploy hoàn tất.
4. Mở `/store.html`, thêm hai sản phẩm, xóa một sản phẩm bằng nút **Xóa**, rồi thử giảm sản phẩm còn một món về 0.
5. Thử một lượt chấm Writing/Speaking/HSKK và xem token usage trong Render Logs.

Không đưa `DEEPSEEK_API_KEY` vào file frontend hoặc commit lên GitHub.

## 5. Kiểm tra đã thực hiện trong bản source

- `node --check` cho `ai-grading.js`, `hskk-deepseek.js`, `js/storefront.js`, `server.js`.
- Parse HTML `store.html`.
- Test logic giỏ hàng bằng harness: giữ dữ liệu lúc catalog đang tải, thêm sản phẩm, hiển thị nút xóa, xóa trực tiếp, giảm số lượng từ 1 về 0 và ẩn nút checkout khi giỏ rỗng.
- Kiểm tra tính toàn vẹn các gói ZIP sau khi đóng gói.

Chưa chạy giao dịch DeepSeek với API key thật hoặc deploy lên Render của tài khoản bạn; cần kiểm tra thực tế sau khi cập nhật.
