# HƯỚNG DẪN CẤU HÌNH HSKK / HSK 3.0 SPEAKING

## 1. Những phần được bổ sung

- Trang học viên: `/hskk.html` để chọn HSKK 2.0 hoặc HSK 3.0 Speaking, sau đó chọn cấp và đề đã xuất bản.
- Trang làm bài: `/hskk-test.html?examId=...`; phát audio / hiển thị tranh / câu hỏi, đếm thời gian chuẩn bị, tự ghi âm trong thời gian trả lời và chuyển câu.
- Trang kết quả: `/hskk-result.html?id=...`; phân chia feedback Gemini theo tab: Tổng quan, Phát âm, Độ trôi chảy, Logic & ý tưởng, Ngôn ngữ, Từng câu, Kế hoạch cải thiện.
- Admin: tab `HSKK 2.0 / 3.0` trong `/admin/`; tạo đề từ template, chỉnh số câu / nội dung / audio / hình / thời gian / văn bản tham chiếu, lưu nháp hoặc publish.
- PostgreSQL: hai bảng `hskk_exams` và `hskk_attempts` được tạo tự động khi server khởi động.

## 2. Format mẫu trong Admin

### HSKK 2.0

| Cấp | Cấu trúc mẫu | Tổng thời lượng mẫu |
|---|---|---:|
| Sơ cấp | 15 câu 听后重复; 10 câu 听后回答; 2 câu 回答问题 | khoảng 17 phút, gồm 7 phút chuẩn bị |
| Trung cấp | 10 câu 听后重复; 2 câu 看图说话; 2 câu 回答问题 | khoảng 21 phút, gồm 10 phút chuẩn bị |
| Cao cấp | 3 câu 听后复述; 1 câu 朗读; 2 câu 回答问题 | khoảng 24 phút, gồm 10 phút chuẩn bị |

Số lượng và thời lượng tổng nêu trên dựa trên cấu trúc HSKK công bố; thời lượng ghi âm riêng từng câu trong template là giá trị khởi tạo để Admin điều chỉnh theo bộ đề thực tế. Học viên không nên xem từng thời lượng mặc định là đồng hồ chính thức của kỳ thi.

### HSK 3.0 · Speaking

Admin có template độc lập cho HSK 3, HSK 4, HSK 5 và HSK 6. Trên trang học viên, các đề được gắn nhãn Sơ cấp / Trung cấp / Cao cấp nhưng vẫn giữ rõ HSK level gốc. Theo thông báo CTI về thử nghiệm HSK 3.0, HSK 3–6 đăng ký cùng phần khẩu ngữ tương ứng; HSK 3 được ghép với khẩu ngữ sơ cấp, HSK 4 với trung cấp, HSK 5–6 với cao cấp. Trang cấu trúc HSK Speaking hiện công bố các khung: sơ cấp 27 câu / 20 phút (7 phút chuẩn bị), trung cấp 14 câu / 23 phút (10 phút chuẩn bị), cao cấp 6 câu / 25 phút (10 phút chuẩn bị). Lưu ý: thông báo riêng cho đợt thử nghiệm ngày 20/09/2026 ghi thời lượng khẩu ngữ khoảng 15 / 20 / 23 phút theo HSK 3 / 4 / 5–6; do đó có thể có chênh lệch giữa trang cấu trúc chung và hướng dẫn từng đợt. Template hiện khởi tạo theo trang cấu trúc HSK Speaking, nhưng Admin phải chỉnh thời lượng theo thông báo của điểm thi/đợt thi mà website đang mô phỏng. HSK 1–2 không nằm trong nhóm phải đăng ký khẩu ngữ theo thông báo thử nghiệm nói trên.

| HSK được ghép | Cấp khẩu ngữ | Cấu trúc khởi tạo | Tổng thời lượng khung hiện công bố |
|---|---|---|---:|
| HSK 3 | Sơ cấp | 15 听后重复; 10 听后回答; 2 回答问题 | khoảng 20 phút, gồm 7 phút chuẩn bị |
| HSK 4 | Trung cấp | 10 听后重复; 2 看图说话; 2 回答问题 | khoảng 23 phút, gồm 10 phút chuẩn bị |
| HSK 5 / HSK 6 | Cao cấp | 3 听后重复; 1 朗读; 2 回答问题 | khoảng 25 phút, gồm 10 phút chuẩn bị |

Điểm khác biệt cần nhớ: template HSKK 2.0 cao cấp giữ dạng 听后复述 (nghe đoạn rồi thuật lại); template HSK Speaking 3.0 cao cấp theo cấu trúc hiện công bố dùng 听后重复 (nghe rồi nhắc lại). Tài liệu/đợt thi có thể có thông báo thời lượng riêng; Admin nên chỉnh thời gian ở từng câu theo hướng dẫn đúng của đợt thi.

Template tạo cấu trúc luyện tập ban đầu. Trước khi publish, Admin cần so khớp audio, hình ảnh, nội dung và timing với đề cụ thể đang sử dụng; không dùng template này để khẳng định đó là đề chính thức hay bản sao nguyên văn của đề thi.

## 3. Cách tạo / xuất bản đề

1. Đăng nhập Admin như hiện tại.
2. Mở tab `HSKK 2.0 / 3.0`.
3. Chọn phiên bản và cấp độ; kiểm tra số đề, thời lượng.
4. Chọn `Tạo cấu trúc mẫu theo phiên bản / cấp độ`.
5. Với các câu 听后重复 / 听后回答 / 听后复述: tải audio câu hỏi lên tại trường Audio đề. Có thể nhập `Văn bản chuẩn để Gemini so sánh` nếu có transcript chính xác.
6. Với 看图说话: tải ảnh đề / tranh lên.
7. Với 回答问题 / 朗读: nhập văn bản câu hỏi hoặc đoạn đọc và chọn hiển thị cho học viên.
8. Điều chỉnh `Thời gian chuẩn bị` và `Thời gian ghi âm` cho từng câu.
9. Chọn Xuất bản và lưu. Backend chặn publish nếu câu nghe thiếu audio, câu tranh thiếu ảnh, hoặc câu hỏi/đọc thiếu văn bản lẫn audio.

Các loại tác vụ hỗ trợ:
- `听后重复`: nghe audio xong ghi âm nhắc lại.
- `听后回答`: nghe câu hỏi trong audio xong ghi âm câu trả lời.
- `听后复述`: nghe đoạn audio xong ghi âm kể lại.
- `看图说话`: xem tranh, có thể có thời gian chuẩn bị, sau đó ghi âm.
- `回答问题`: đọc/nghe câu hỏi, chuẩn bị nếu cần, sau đó ghi âm.
- `朗读`: đọc văn bản hiển thị và ghi âm.

## 4. Google Gemini trên Render

Trong Render → Web Service → Environment, thêm:

- `GEMINI_API_KEY`: API key do quản trị viên tạo trong Google AI Studio.
- `GEMINI_MODEL`: `gemini-3.8-flash` (có thể bỏ qua vì đây là mặc định trong code).
- `GEMINI_TIMEOUT_MS`: `180000` (tùy chọn).

Sau đó Save Changes và deploy lại. API key chỉ được giữ phía server, không đặt trong HTML, JavaScript công khai hoặc repository. Admin có thể mở tab HSKK để xem trạng thái cấu hình Gemini.

Gemini nhận các file ghi âm ở định dạng WebM/Opus của trình duyệt hoặc các định dạng audio được hỗ trợ, phân tích lời nói trực tiếp và trả JSON cho giao diện feedback. Google công bố Gemini audio understanding hỗ trợ WebM, WAV, MP3, M4A, OGG và một số định dạng khác. Luồng hiện tại dùng dữ liệu audio nội tuyến và giới hạn tổng audio gốc ở 12 MB/lượt để giữ payload an toàn dưới ngưỡng 20 MB của inline audio; bitrate ghi âm đặt ở 64 kbps. Nếu bài có tổng audio vượt giới hạn, cần tách thành các đề/lượt luyện ngắn hơn hoặc nâng cấp luồng sang Gemini Files API.

## 5. Luồng thi và quyền micro

1. Học viên đăng nhập và mở một đề đã publish.
2. Học viên xác nhận đồng ý ghi âm/gửi audio để phân tích.
3. Học viên bấm Bắt đầu; trình duyệt hiện lời nhắc cấp quyền micro. Phải cho phép quyền này.
4. Audio câu hỏi phát trước. Khi audio kết thúc, đồng hồ chuẩn bị (nếu có) chạy; sau đó đồng hồ trả lời chạy và MediaRecorder tự ghi âm.
5. Khi đồng hồ về 00:00, bản ghi của câu được lưu tạm trong trình duyệt và hệ thống chuyển sang câu kế tiếp.
6. Sau câu cuối, các bản ghi gửi đến backend và Gemini. Kết quả được lưu trong `hskk_attempts` và mở ở trang feedback.

Mic chỉ được phép bật sau thao tác bắt đầu rõ ràng và quyền trình duyệt; website không ghi âm âm thầm. Nên sử dụng HTTPS (Render deploy mặc định có HTTPS), Chrome hoặc Edge mới và kiểm tra quyền micro của website.

## 6. Nội dung feedback

Feedback chia theo từng tab, gồm: điểm tổng quan; phát âm / thanh điệu / thanh mẫu-vận mẫu / nhịp điệu; độ trôi chảy; mạch lạc / logic / ví dụ / liên kết ý; ngữ pháp; từ vựng; mức độ hoàn thành yêu cầu; transcript và feedback từng câu; kế hoạch luyện tập. Đây là điểm luyện tập do AI ước lượng, không phải điểm chính thức của CTI. Độ chính xác phân tích phát âm chịu ảnh hưởng bởi micro, tiếng ồn, codec và độ dài audio.

## 7. Kiểm tra sau deploy

- Mở `/hskk.html`, kiểm tra bộ lọc 2.0 / 3.0 và các cấp.
- Trong Admin tạo một đề thử ngắn 1–2 câu, gắn audio / ảnh và để ở trạng thái nháp trước khi publish.
- Publish đề thử, đăng nhập một tài khoản học viên và làm bài trên HTTPS.
- Kiểm tra audio kết thúc thì đồng hồ chuyển qua chuẩn bị/trả lời; đèn micro chuyển đỏ khi ghi âm; câu tự chuyển khi hết giờ.
- Nộp bài, kiểm tra Gemini status và tab feedback; kiểm tra Admin → HSKK → Bài nói đã nộp.

## 8. Dữ liệu và quyền riêng tư

Ứng dụng lưu thông tin lượt thi, metadata bản ghi và feedback trong PostgreSQL; file audio không được lưu thành file phát lại trong hồ sơ học viên bởi luồng này, nhưng được truyền tới Google Gemini để phân tích. Cần công bố mục đích xử lý, bên nhận dữ liệu, thời hạn lưu, cách yêu cầu xóa và xin sự đồng ý phù hợp trước khi cho người học sử dụng; đặc biệt lưu ý nếu người dùng là trẻ vị thành niên. Hãy rà soát chính sách Google API và yêu cầu pháp lý tại nơi website phục vụ trước khi mở cho người dùng thật.
