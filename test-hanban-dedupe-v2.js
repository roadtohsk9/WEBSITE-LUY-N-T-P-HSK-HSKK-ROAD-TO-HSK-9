'use strict';
const assert = require('node:assert/strict');
const { repairHanbanHsk6Duplicates } = require('./hsk6-hanban-dedupe-v2');

const rows = [
  {
    id: 'canonical-listen', skill: 'listening', volume: 6, test_no: 101,
    title: 'HSK 6 · H61001 · LISTENING 听力',
    source_file: 'HSK6_PDF_IMPORT:H61001.pdf', source_url: '',
    content: { questions: Array.from({ length: 50 }, (_, i) => ({ number: i + 1 })) },
    answer_key: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), 'A'])),
    audio_url: '', series_label: 'HSK 6', display_test_label: 'H61001',
    card_label: 'LISTENING', card_subtitle: '', attempts_count: 0,
    published: true, category_id: null
  },
  {
    id: 'duplicate-listen', skill: 'listening', volume: 6, test_no: 111,
    title: 'Bài import thủ công H61001 Listening',
    source_file: 'H61328-đã gộp.pdf', source_url: '',
    content: { questions: Array.from({ length: 50 }, (_, i) => ({ number: i + 1 })) },
    answer_key: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), 'A'])),
    audio_url: '/uploads/H61001.mp3', series_label: 'HANBAN',
    display_test_label: 'H61001', card_label: 'LISTENING', card_subtitle: '',
    attempts_count: 0, published: true, category_id: 'cat-1'
  },
  {
    id: 'generic-duplicate-listen', skill: 'listening', volume: 6, test_no: 112,
    title: 'Old HSK6 Listening copy',
    source_file: 'H61328-đã gộp.pdf', source_url: '',
    content: { questions: Array.from({ length: 50 }, (_, i) => ({ number: i + 1 })) },
    answer_key: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), 'A'])),
    audio_url: '', series_label: 'HSK 6', display_test_label: 'LISTENING TEST',
    card_label: 'LISTENING', card_subtitle: '', attempts_count: 0,
    published: true, category_id: null
  },
  {
    id: 'canonical-read', skill: 'reading', volume: 6, test_no: 101,
    title: 'HSK 6 · H61001 · READING 阅读',
    source_file: 'HSK6_PDF_IMPORT:H61001.pdf', source_url: '',
    content: { questions: Array.from({ length: 50 }, (_, i) => ({ number: i + 1 })) },
    answer_key: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), 'B'])),
    audio_url: '', series_label: 'HSK 6', display_test_label: 'H61001',
    card_label: 'READING', card_subtitle: '', attempts_count: 0,
    published: true, category_id: null
  }
];

async function mockDbQuery(sql, params = []) {
  if (sql.includes('SELECT id, skill, volume')) {
    return { rows: rows.filter(r => r.volume === 6 && ['listening', 'reading'].includes(r.skill) && r.series_label !== 'HANBAN_DUPLICATE_HIDDEN') };
  }
  if (sql.includes('UPDATE practice_tests')) {
    const id = params[0];
    const row = rows.find(r => r.id === id);
    assert.ok(row, `row ${id} exists`);
    if (sql.includes("series_label = 'HANBAN'")) {
      row.title = params[1];
      row.series_label = 'HANBAN';
      row.display_test_label = params[2];
      row.card_label = params[3];
      row.card_subtitle = params[4];
      if (!row.audio_url) row.audio_url = params[5];
      if (!row.category_id) row.category_id = params[6];
      row.published = params[7];
    } else {
      row.title = row.title.startsWith('BẢN TRÙNG (đã ẩn) · ')
        ? row.title : `BẢN TRÙNG (đã ẩn) · ${row.title}`;
      row.series_label = params[1];
      row.display_test_label = params[2];
      row.card_label = 'BẢN TRÙNG';
      row.card_subtitle = params[3];
      row.published = false;
    }
    return { rowCount: 1 };
  }
  throw new Error(`Unexpected SQL: ${sql}`);
}

(async () => {
  const first = await repairHanbanHsk6Duplicates(mockDbQuery);
  assert.equal(first.labelledRows, 2);
  assert.equal(first.hiddenDuplicates, 2);
  assert.equal(rows.find(r => r.id === 'canonical-listen').audio_url, '/uploads/H61001.mp3');
  assert.equal(rows.find(r => r.id === 'duplicate-listen').published, false);
  assert.equal(rows.find(r => r.id === 'generic-duplicate-listen').published, false);
  assert.equal(rows.find(r => r.id === 'canonical-listen').series_label, 'HANBAN');

  const second = await repairHanbanHsk6Duplicates(mockDbQuery);
  assert.equal(second.hiddenDuplicates, 0, 'second run must not re-hide or re-count old duplicates');
  assert.equal(rows.find(r => r.id === 'canonical-listen').audio_url, '/uploads/H61001.mp3');
  console.log('PASS: HANBAN migration labels existing records, hides duplicate copies, preserves audio, and is idempotent.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
