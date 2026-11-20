'use strict';

const assert = require('assert');
const path = require('path');
const { seedHsk6JanPredictionReading } = require('./hsk6-jan-reading-seed-v1');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  }
  return value;
}
function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function makeFakeDb() {
  const categories = [];
  const tests = [];
  async function dbQuery(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (s.startsWith('select id from test_categories')) {
      const name = String(params[0]).toLowerCase();
      const found = categories.filter(c => c.name.toLowerCase() === name).slice(0, 1);
      return { rows: found.map(c => ({ id: c.id })), rowCount: found.length };
    }
    if (s.startsWith('insert into test_categories')) {
      const [id, name] = params;
      if (!categories.some(c => c.name.toLowerCase() === String(name).toLowerCase())) categories.push({ id, name });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('select id from practice_tests where skill=$1 and source_file=$2')) {
      const [skill, marker] = params;
      const row = tests.find(t => t.skill === skill && t.source_file === marker);
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (s.includes('and content=$1::jsonb and answer_key=$2::jsonb')) {
      const [content, answerKey, categoryId] = params;
      const cc = JSON.parse(content), aa = JSON.parse(answerKey);
      const row = tests.find(t => t.skill === 'reading' && t.volume === 6 &&
        sameJson(t.content, cc) && sameJson(t.answer_key, aa) &&
        (t.category_id == null || t.category_id === categoryId));
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (s.startsWith('select id, source_file from practice_tests')) {
      const [skill, volume, testNo] = params;
      const row = tests.find(t => t.skill === skill && t.volume === volume && t.test_no === testNo);
      return { rows: row ? [{ id: row.id, source_file: row.source_file }] : [], rowCount: row ? 1 : 0 };
    }
    if (s.startsWith('insert into practice_tests')) {
      const [id, skill, volume, test_no, title, question_type, duration_minutes, total_questions,
        content, answer_key, explanations, audio_url, source_file, source_url, series_label,
        display_test_label, card_label, card_subtitle, status_label, button_label, cover_url,
        category_id] = params;
      if (tests.some(t => t.skill === skill && t.volume === volume && t.test_no === test_no)) return { rows: [], rowCount: 0 };
      tests.push({ id, skill, volume, test_no, title, question_type, duration_minutes, total_questions,
        content: JSON.parse(content), answer_key: JSON.parse(answer_key), explanations: JSON.parse(explanations),
        audio_url, source_file, source_url, series_label, display_test_label, card_label, card_subtitle,
        status_label, button_label, cover_url, category_id, published: true });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (s.startsWith('update practice_tests set') && s.includes('where id=$17')) {
      const id = params[16];
      const t = tests.find(x => x.id === id);
      if (!t) return { rows: [], rowCount: 0 };
      [t.title,t.question_type,t.duration_minutes,t.total_questions] = params.slice(0,4);
      [t.content,t.answer_key,t.explanations] = params.slice(4,7).map(JSON.parse);
      [t.source_url,t.series_label,t.display_test_label,t.card_label,t.card_subtitle,t.status_label,t.button_label,t.cover_url,t.category_id] = params.slice(7,16);
      t.audio_url = ''; t.published = true;
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('update practice_tests set') && s.includes('where id=$13')) {
      const id = params[12];
      const t = tests.find(x => x.id === id);
      if (!t) return { rows: [], rowCount: 0 };
      [t.title,t.question_type,t.duration_minutes,t.total_questions,t.series_label,t.display_test_label,
        t.card_label,t.card_subtitle,t.status_label,t.button_label,t.cover_url,t.category_id] = params.slice(0,12);
      t.published = true;
      return { rows: [], rowCount: 1 };
    }
    throw new Error('Unhandled fake SQL: ' + s.slice(0,160));
  }
  return { dbQuery, categories, tests };
}

(async () => {
  const seedFile = path.join(__dirname, 'data', 'hsk6_jan_reading_seed_v1.json');
  const fake = makeFakeDb();
  const first = await seedHsk6JanPredictionReading(fake.dbQuery, { seedFile });
  assert.strictEqual(first.inserted, 10);
  assert.strictEqual(fake.categories.length, 1);
  assert.strictEqual(fake.categories[0].name, 'Dự đoán tháng 1');
  assert.strictEqual(fake.tests.length, 10);
  assert(fake.tests.every(t => t.skill === 'reading' && t.volume === 6 && t.category_id === first.categoryId && t.published));
  assert(fake.tests.every(t => t.content.questions.length === 50 && Object.keys(t.answer_key).length === 50));
  assert(fake.tests.every(t => t.source_file.startsWith('HSK6_JAN_PREDICTION_READING_V1:')));

  const second = await seedHsk6JanPredictionReading(fake.dbQuery, { seedFile });
  assert.strictEqual(second.inserted, 0, 'second run must not insert duplicate rows');
  assert.strictEqual(second.updated, 10, 'second run should update the rows owned by this seed');
  assert.strictEqual(fake.tests.length, 10);
  assert.strictEqual(fake.categories.length, 1);

  // Exact pre-existing content is reused instead of inserted again.
  const other = makeFakeDb();
  const rows = require(seedFile);
  const firstRow = rows[0];
  other.tests.push({
    id: 'existing-exact-row', skill: 'reading', volume: 6, test_no: 106,
    source_file: 'LEGACY_ADMIN_IMPORT', content: firstRow.content,
    answer_key: firstRow.answerKey, category_id: null, published: true
  });
  const reused = await seedHsk6JanPredictionReading(other.dbQuery, { seedFile });
  assert.strictEqual(reused.reused, 1);
  assert.strictEqual(other.tests.length, 10, 'reuse should prevent a new copy for the exact existing paper');
  assert.strictEqual(other.tests[0].category_id, reused.categoryId);

  console.log('PASS: 10 papers imported, Reading-only, one category, idempotent re-run, exact duplicate reused.');
})().catch(error => { console.error(error); process.exitCode = 1; });
