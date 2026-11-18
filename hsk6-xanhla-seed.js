'use strict';

// Idempotent importer for the original XANH LÁ HSK6 practice set.
// It inserts only missing rows and never overwrites existing tests or audio URLs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function seedHsk6XanhLaPapers({ dbQuery, DATA_DIR }) {
  if (typeof dbQuery !== 'function' || !DATA_DIR) return;
  const seedPath = path.join(DATA_DIR, 'hsk6_xanh_la_seed.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('XANH LÁ HSK6 seed file not found:', seedPath);
    return;
  }

  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (error) {
    console.error('XANH LÁ HSK6 seed JSON is invalid:', error?.message || error);
    return;
  }

  const categoryName = 'XANH LÁ';
  let category = (await dbQuery(
    'SELECT id FROM test_categories WHERE LOWER(name)=LOWER($1) LIMIT 1',
    [categoryName]
  )).rows[0];

  if (!category) {
    category = (await dbQuery(
      'INSERT INTO test_categories(id,name) VALUES($1,$2) RETURNING id',
      [crypto.randomUUID(), categoryName]
    )).rows[0];
  }

  let inserted = 0;
  let skipped = 0;
  for (const test of (pack.tests || [])) {
    try {
      const result = await dbQuery(`
        INSERT INTO practice_tests(
          id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,
          content,answer_key,explanations,audio_url,source_file,source_url,
          series_label,display_test_label,card_label,card_subtitle,status_label,
          button_label,cover_url,category_id,published
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,
          $15,$16,$17,$18,$19,$20,$21,$22,TRUE
        )
        ON CONFLICT(skill,volume,test_no) DO NOTHING
      `, [
        crypto.randomUUID(),
        String(test.skill || 'reading').toLowerCase(),
        6,
        Number(test.testNo),
        String(test.title || ''),
        String(test.questionType || 'Multiple Choice'),
        Number(test.durationMinutes || 10),
        Number(test.totalQuestions || 0),
        JSON.stringify(test.content || {}),
        JSON.stringify(test.answerKey || {}),
        JSON.stringify(test.explanations || {}),
        '', // audio deliberately left blank for Admin upload
        String(test.sourceFile || 'XANH_LA_HSK6_ORIGINAL_PRACTICE_V1'),
        '',
        'XANH LÁ · HSK6',
        String(test.displayTestLabel || `ĐỀ ${test.testNo}`),
        'XANH LÁ',
        String(test.cardSubtitle || ''),
        String(test.statusLabel || 'Sẵn sàng luyện tập'),
        String(test.buttonLabel || 'Làm bài'),
        String(test.coverUrl || ''),
        category.id
      ]);
      if (result.rowCount) inserted++;
      else skipped++;
    } catch (error) {
      console.error('XANH LÁ HSK6 insert failed:', test.title || test.testNo, error?.message || error);
    }
  }

  console.log(`XANH LÁ HSK6 seed: ${inserted} inserted, ${skipped} existing rows skipped.`);
}

module.exports = { seedHsk6XanhLaPapers };
