-- READ-ONLY preview: inspect HANBAN HSK6 rows and possible duplicates.
-- Row-specific names are checked before file names so a merged PDF named
-- H61328-đã gộp.pdf is NOT mistaken as the code for every row in that PDF.
WITH target_rows AS (
  SELECT
    id, skill, volume, test_no, title, source_file, audio_url, published,
    COALESCE(
      substring(UPPER(CONCAT_WS(' ', title, display_test_label, card_label, card_subtitle))
        FROM '(H61328|H61327|H61006|H61005|H61003|H61001)'),
      substring(UPPER(CONCAT_WS(' ', source_file, source_url))
        FROM '(H61328|H61327|H61006|H61005|H61003|H61001)\.PDF$')
    ) AS hanban_code
  FROM practice_tests
  WHERE volume = 6 AND LOWER(skill) IN ('listening', 'reading')
)
SELECT skill, hanban_code, COUNT(*) AS rows_found,
       ARRAY_AGG(test_no ORDER BY test_no) AS test_numbers,
       BOOL_OR(COALESCE(audio_url, '') <> '') AS has_any_audio,
       ARRAY_AGG(id ORDER BY test_no) AS row_ids
FROM target_rows
WHERE hanban_code IS NOT NULL
GROUP BY skill, hanban_code
ORDER BY hanban_code, skill;
