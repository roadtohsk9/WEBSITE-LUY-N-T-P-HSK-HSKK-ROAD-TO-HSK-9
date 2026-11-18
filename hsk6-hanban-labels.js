'use strict';

// Add the HANBAN label to the six HSK6 exam codes contained in
// H61328-đã gộp.pdf. This is metadata-only: it never changes question
// content, answer keys, explanations, source files, or audio_url.
const HANBAN_CODES = Object.freeze([
  'H61328',
  'H61327',
  'H61006',
  'H61005',
  'H61003',
  'H61001'
]);

const HANBAN_SOURCE_FILES = HANBAN_CODES.map(
  (code) => `HSK6_PDF_IMPORT:${code}.pdf`
);

async function applyHanbanHsk6Labels(dbQuery) {
  if (typeof dbQuery !== 'function') {
    throw new TypeError('applyHanbanHsk6Labels requires the database query function.');
  }

  const result = await dbQuery(
    `UPDATE practice_tests
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
       AND source_file = ANY($1::text[])
     RETURNING id`,
    [HANBAN_SOURCE_FILES]
  );

  return Number(result && result.rowCount ? result.rowCount : 0);
}

module.exports = {
  HANBAN_CODES,
  applyHanbanHsk6Labels
};
