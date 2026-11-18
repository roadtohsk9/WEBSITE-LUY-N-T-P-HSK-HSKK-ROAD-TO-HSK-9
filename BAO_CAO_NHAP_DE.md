# BÁO CÁO CHUYỂN ĐỔI – HSK4 VOL 4 (PDF → WEBSITE)

## Nguồn
- File nguồn: `HSK4_20_de_sieu_kho_2.0.pdf`
- Số trang: 327
- Phương pháp trích xuất: lấy text trực tiếp từ PDF, không OCR.
- Phạm vi: HSK4 hệ 2.0, Đọc và Viết phần 1.

## Tổng quan dữ liệu

| Phân loại | Số bộ | Số câu/bộ | Tổng câu |
|---|---:|---:|---:|
| Reading | 20 | 40 | 800 |
| Writing Part 1 | 20 | 10 | 200 |
| **Tổng** | **40 bài luyện độc lập** |  | **1.000** |

Mỗi đề Reading gồm:
- Phần 1: 10 câu chọn từ điền chỗ trống.
- Phần 2: 10 câu sắp xếp ba câu A/B/C.
- Phần 3: 20 câu đọc hiểu, gồm 10 đoạn gốc và 2 câu hỏi cho mỗi đoạn.

Mỗi đề Writing gồm 10 câu sắp xếp từ/cụm từ thành câu hoàn chỉnh.

## Nội dung nguồn được giữ lại

- Câu hỏi tiếng Trung và các lựa chọn tiếng Trung.
- 10 đoạn văn gốc ở phần Reading 3 của mỗi đề; tổng 200 đoạn văn.
- Ba câu A/B/C của từng câu hỏi sắp xếp thứ tự.
- Word bank của 200 câu Writing.
- Đáp án 1.000 câu.
- Giải thích, từ vựng, pinyin, bản dịch và ghi chú tiếng Việt có trong PDF.

Phần Reading 2 trong PDF trình bày ba câu A/B/C và thứ tự đúng (ví dụ `BCA`); giao diện chuyển phần thứ tự thành lựa chọn trong sáu hoán vị có thể có để học viên làm trực tiếp.

## Kiểm tra dữ liệu

- 20/20 đề Reading: mỗi đề có 40 câu, 40 đáp án, 40 lời giải và 10 đoạn đọc gốc.
- 20/20 đề Writing: mỗi đề có 10 câu, 10 đáp án mẫu và 10 lời giải.
- Các câu Reading trắc nghiệm có đủ lựa chọn; câu A/B/C có đủ ba câu nguồn và sáu lựa chọn thứ tự.
- Mọi đề được đưa vào `volume = 4`, với `test_no = 401–420` tách riêng cho từng kỹ năng.
- JavaScript: `node --check` thành công cho `server.js`, `hsk-writing-grading.js`, `js/practice.js`, `js/practice-test.js`, `js/practice-result.js`.
- JSON seed đã parse và kiểm tra số lượng bằng script xác thực.

## Hành vi website

- Reading dùng bố cục Passage + Questions hiện có; 10 đoạn văn gốc hiển thị riêng theo từng passage.
- Writing dùng giao diện nhập câu dựa trên word bank; so sánh câu trả lời với câu mẫu, chuẩn hóa khoảng trắng/dấu câu cơ bản.
- Review hiển thị câu trả lời, đáp án và giải thích; trang giải thích Writing có bảng word bank.
- `hsk4Mode` ngăn hai nhánh AI Writing tổng quát chấm nhầm dạng sắp xếp câu HSK4.
- Danh sách trang luyện tập được gắn nhãn `HSK4 · VOL 4` cho cả Đọc và Viết.

## Ánh xạ lưu trữ

- Seed: `data/hsk4_vol4_20_papers_seed.json`
- Skill: `reading`, `writing`
- Volume: `4`
- Test numbers: `401–420` mỗi kỹ năng
- Source marker: `HSK4_20_DE_SIEU_KHO_PDF_IMPORT_...`

## Giới hạn

Đây là bộ đề luyện tập tự biên soạn theo PDF người dùng cung cấp, không phải đề chính thức. Patch đã kiểm tra ở mức source/JSON; chưa kết nối hoặc deploy lên PostgreSQL/Render production nên việc seed vào website chỉ xảy ra sau khi người dùng cập nhật GitHub và redeploy.
