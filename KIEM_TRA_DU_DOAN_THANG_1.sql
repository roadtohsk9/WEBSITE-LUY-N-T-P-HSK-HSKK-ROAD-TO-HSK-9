-- Kiểm tra danh mục Dự đoán tháng 1 và các đề Reading HSK6
SELECT
  c.name AS category_name,
  p.id,
  p.skill,
  p.volume,
  p.test_no,
  p.title,
  p.total_questions,
  p.published,
  p.source_file
FROM practice_tests p
JOIN test_categories c ON c.id = p.category_id
WHERE LOWER(c.name) = LOWER('Dự đoán tháng 1')
  AND LOWER(p.skill) = 'reading'
  AND p.volume = 6
ORDER BY p.test_no;

-- Kết quả kỳ vọng sau khi seed thành công: 10 dòng, mỗi dòng 50 câu.
SELECT COUNT(*) AS total_papers,
       COALESCE(SUM(p.total_questions), 0) AS total_reading_questions
FROM practice_tests p
JOIN test_categories c ON c.id = p.category_id
WHERE LOWER(c.name) = LOWER('Dự đoán tháng 1')
  AND LOWER(p.skill) = 'reading'
  AND p.volume = 6
  AND p.series_label = 'Dự đoán tháng 1 · HSK 6 2.0';
