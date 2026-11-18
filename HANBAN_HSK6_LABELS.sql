-- One-time alternative to the automatic server.js migration.
-- Updates only the six HANBAN HSK6 codes found in the uploaded merged PDF.
-- Does NOT modify content, answer keys, explanations, source files, or audio_url.

UPDATE practice_tests
SET title = CASE
      WHEN COALESCE(title, '') ILIKE 'HANBAN · %' THEN title
      ELSE 'HANBAN · ' || COALESCE(title, '')
    END,
    series_label = 'HANBAN',
    card_subtitle = CASE
      WHEN COALESCE(card_subtitle, '') = '' THEN 'HANBAN · HSK 6'
      WHEN card_subtitle ILIKE 'HANBAN · %' THEN card_subtitle
      ELSE 'HANBAN · ' || card_subtitle
    END,
    updated_at = NOW()
WHERE volume = 6
  AND skill IN ('reading', 'listening')
  AND source_file IN (
    'HSK6_PDF_IMPORT:H61328.pdf',
    'HSK6_PDF_IMPORT:H61327.pdf',
    'HSK6_PDF_IMPORT:H61006.pdf',
    'HSK6_PDF_IMPORT:H61005.pdf',
    'HSK6_PDF_IMPORT:H61003.pdf',
    'HSK6_PDF_IMPORT:H61001.pdf'
  );
