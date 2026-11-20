'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORY_NAME = 'Dự đoán tháng 1';
const SOURCE_PREFIX = 'HSK6_JAN_PREDICTION_READING_V1:';
const SEED_FILE = path.join(__dirname, 'data', 'hsk6_jan_reading_seed_v1.json');

function validatePack(rows) {
  if (!Array.isArray(rows) || rows.length !== 10) {
    throw new Error('Gói HSK6 tháng 1 phải chứa đúng 10 bộ đề.');
  }
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const setNo = index + 1;
    const questions = row?.content?.questions;
    const groups = row?.content?.question_groups;
    if (String(row.skill).toLowerCase() !== 'reading' || Number(row.volume) !== 6) {
      throw new Error(`Bộ ${setNo}: chỉ được phép nạp HSK6 Reading.`);
    }
    if (Number(row.totalQuestions) !== 50 || !Array.isArray(questions) || questions.length !== 50) {
      throw new Error(`Bộ ${setNo}: số lượng câu hỏi không bằng 50.`);
    }
    if (!Array.isArray(groups) || groups.length !== 9) {
      throw new Error(`Bộ ${setNo}: cấu trúc phải gồm 9 nhóm câu hỏi.`);
    }
    const nums = new Set(questions.map(q => String(q.number)));
    for (let n = 51; n <= 100; n += 1) {
      if (!nums.has(String(n))) throw new Error(`Bộ ${setNo}: thiếu câu ${n}.`);
      if (!row.answerKey || !/^[A-E]$/.test(String(row.answerKey[String(n)] || ''))) {
        throw new Error(`Bộ ${setNo}: thiếu đáp án hợp lệ cho câu ${n}.`);
      }
    }
    for (const q of questions) {
      const values = (Array.isArray(q.options) ? q.options : []).map(o => String(o.value));
      if (!values.includes(String(q.answer))) {
        throw new Error(`Bộ ${setNo}, câu ${q.number}: đáp án không nằm trong lựa chọn.`);
      }
    }
    const marker = String(row.sourceFile || '');
    if (!marker.startsWith(SOURCE_PREFIX) || seen.has(marker)) {
      throw new Error(`Bộ ${setNo}: source marker không hợp lệ hoặc bị trùng.`);
    }
    seen.add(marker);
  }
}

function asJson(value) {
  return JSON.stringify(value ?? {});
}

async function getOrCreateCategory(dbQuery) {
  let result = await dbQuery(
    'SELECT id FROM test_categories WHERE LOWER(name)=LOWER($1) ORDER BY created_at ASC LIMIT 1',
    [CATEGORY_NAME]
  );
  if (result.rows?.[0]?.id) return result.rows[0].id;

  await dbQuery(
    'INSERT INTO test_categories(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [crypto.randomUUID(), CATEGORY_NAME]
  );
  result = await dbQuery(
    'SELECT id FROM test_categories WHERE LOWER(name)=LOWER($1) ORDER BY created_at ASC LIMIT 1',
    [CATEGORY_NAME]
  );
  if (!result.rows?.[0]?.id) throw new Error(`Không tạo/đọc được danh mục "${CATEGORY_NAME}".`);
  return result.rows[0].id;
}

async function updateOwnedRow(dbQuery, id, row, categoryId) {
  await dbQuery(`UPDATE practice_tests SET
      title=$1, question_type=$2, duration_minutes=$3, total_questions=$4,
      content=$5::jsonb, answer_key=$6::jsonb, explanations=$7::jsonb,
      audio_url='', source_url=$8, series_label=$9, display_test_label=$10,
      card_label=$11, card_subtitle=$12, status_label=$13, button_label=$14,
      cover_url=$15, category_id=$16, published=TRUE, updated_at=NOW()
    WHERE id=$17`, [
    row.title, row.questionType, row.durationMinutes, row.totalQuestions,
    asJson(row.content), asJson(row.answerKey), asJson(row.explanations),
    row.sourceUrl || '', row.seriesLabel || '', row.displayTestLabel || '',
    row.cardLabel || 'READING · ĐỌC', row.cardSubtitle || '',
    row.statusLabel || 'Chưa hoàn thành', row.buttonLabel || 'Làm bài',
    row.coverUrl || '', categoryId, id
  ]);
}

async function updateReusedExactRow(dbQuery, id, row, categoryId) {
  // Reuse an exact content+answer match, but do not overwrite its source_file or
  // its question/answer payload. This avoids making a second copy of an existing paper.
  await dbQuery(`UPDATE practice_tests SET
      title=$1, question_type=$2, duration_minutes=$3, total_questions=$4,
      series_label=$5, display_test_label=$6, card_label=$7, card_subtitle=$8,
      status_label=$9, button_label=$10, cover_url=$11, category_id=$12,
      published=TRUE, updated_at=NOW()
    WHERE id=$13`, [
    row.title, row.questionType, row.durationMinutes, row.totalQuestions,
    row.seriesLabel || '', row.displayTestLabel || '', row.cardLabel || 'READING · ĐỌC',
    row.cardSubtitle || '', row.statusLabel || 'Chưa hoàn thành',
    row.buttonLabel || 'Làm bài', row.coverUrl || '', categoryId, id
  ]);
}

async function insertRow(dbQuery, row, categoryId, testNo) {
  const result = await dbQuery(`INSERT INTO practice_tests(
      id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,
      content,answer_key,explanations,audio_url,source_file,source_url,series_label,
      display_test_label,card_label,card_subtitle,status_label,button_label,cover_url,
      category_id,published
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,
      $15,$16,$17,$18,$19,$20,$21,$22,TRUE
    ) ON CONFLICT(skill,volume,test_no) DO NOTHING RETURNING id`, [
    crypto.randomUUID(), 'reading', 6, testNo, row.title, row.questionType,
    row.durationMinutes, row.totalQuestions, asJson(row.content), asJson(row.answerKey),
    asJson(row.explanations), '', row.sourceFile, row.sourceUrl || '',
    row.seriesLabel || '', row.displayTestLabel || '', row.cardLabel || 'READING · ĐỌC',
    row.cardSubtitle || '', row.statusLabel || 'Chưa hoàn thành',
    row.buttonLabel || 'Làm bài', row.coverUrl || '', categoryId
  ]);
  return result.rows?.[0]?.id || null;
}

async function seedHsk6JanPredictionReading(dbQuery, options = {}) {
  if (typeof dbQuery !== 'function') throw new TypeError('Cần truyền hàm dbQuery của máy chủ.');
  const seedFile = options.seedFile || SEED_FILE;
  if (!fs.existsSync(seedFile)) throw new Error(`Không tìm thấy file dữ liệu: ${seedFile}`);

  const rows = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  validatePack(rows);
  const categoryId = await getOrCreateCategory(dbQuery);
  const summary = { category: CATEGORY_NAME, categoryId, inserted: 0, updated: 0, reused: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const marker = row.sourceFile;

    // 1) The seed's own marker is the strongest idempotency key.
    const owned = await dbQuery(
      'SELECT id FROM practice_tests WHERE skill=$1 AND source_file=$2 ORDER BY created_at ASC LIMIT 1',
      ['reading', marker]
    );
    if (owned.rows?.[0]?.id) {
      await updateOwnedRow(dbQuery, owned.rows[0].id, row, categoryId);
      summary.updated += 1;
      continue;
    }

    // 2) Reuse a byte-for-byte JSONB-equivalent paper that is not already assigned
    // to a different category. This is an additional guard against duplicate imports.
    const exact = await dbQuery(`SELECT id FROM practice_tests
      WHERE LOWER(skill)='reading' AND volume=6
        AND content=$1::jsonb AND answer_key=$2::jsonb
        AND (category_id IS NULL OR category_id=$3)
      ORDER BY CASE WHEN category_id=$3 THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`, [asJson(row.content), asJson(row.answerKey), categoryId]);
    if (exact.rows?.[0]?.id) {
      await updateReusedExactRow(dbQuery, exact.rows[0].id, row, categoryId);
      summary.reused += 1;
      continue;
    }

    // 3) Reserve high, dedicated test numbers to avoid colliding with existing
    // HSK6 official/imported papers. If a slot is taken, move upward without
    // overwriting it. The source_file marker keeps later runs idempotent.
    let testNo = Number(row.testNo);
    let allocated = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const occupied = await dbQuery(
        'SELECT id, source_file FROM practice_tests WHERE skill=$1 AND volume=$2 AND test_no=$3 LIMIT 1',
        ['reading', 6, testNo]
      );
      if (!occupied.rows?.length) { allocated = true; break; }
      if (occupied.rows[0].source_file === marker) {
        await updateOwnedRow(dbQuery, occupied.rows[0].id, row, categoryId);
        summary.updated += 1;
        allocated = false;
        break;
      }
      testNo += 1000;
    }
    if (!allocated) {
      // A row was updated by the marker branch above, or all fallback slots were busy.
      if (testNo >= Number(row.testNo) + 100000) {
        summary.skipped += 1;
        console.warn(`[HSK6 Jan Reading] No free test_no for set ${index + 1}; left existing data untouched.`);
      }
      continue;
    }

    const newId = await insertRow(dbQuery, row, categoryId, testNo);
    if (newId) summary.inserted += 1;
    else {
      // A concurrent deployment may have inserted the same unique key. Re-check
      // the marker once; never update a row belonging to another source.
      const concurrent = await dbQuery(
        'SELECT id FROM practice_tests WHERE skill=$1 AND source_file=$2 LIMIT 1',
        ['reading', marker]
      );
      if (concurrent.rows?.[0]?.id) {
        await updateOwnedRow(dbQuery, concurrent.rows[0].id, row, categoryId);
        summary.updated += 1;
      } else {
        summary.skipped += 1;
        console.warn(`[HSK6 Jan Reading] Unique-key collision for set ${index + 1}; no existing row was overwritten.`);
      }
    }
  }

  console.log(`[HSK6 Jan Reading] ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = { seedHsk6JanPredictionReading, validatePack };
