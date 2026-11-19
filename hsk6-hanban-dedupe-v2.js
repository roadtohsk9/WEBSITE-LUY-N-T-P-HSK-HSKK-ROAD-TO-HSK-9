'use strict';

const crypto = require('crypto');

/**
 * HANBAN HSK6 repair migration.
 *
 * IMPORTANT:
 * - Does not INSERT or DELETE practice_tests rows.
 * - Does not modify question content, answer keys, explanations, or submissions.
 * - Groups existing HSK6 Listening/Reading rows by the exact HANBAN paper code.
 * - Keeps the richest row as canonical and hides extra copies with published=false.
 * - Preserves an existing audio URL by copying it to the canonical row only when
 *   the canonical row has no audio URL.
 * - Safe to run on every server start (hidden duplicates remain marked).
 */

const HANBAN_CODES = Object.freeze([
  'H61328',
  'H61327',
  'H61006',
  'H61005',
  'H61003',
  'H61001'
]);

const HIDDEN_DUPLICATE_SERIES = 'HANBAN_DUPLICATE_HIDDEN';

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function countQuestions(value) {
  const content = asObject(value);
  if (Array.isArray(content.questions) && content.questions.length) {
    return content.questions.length;
  }
  const groups = Array.isArray(content.question_groups) ? content.question_groups : [];
  return groups.reduce((sum, group) => {
    const questions = group && Array.isArray(group.questions) ? group.questions : [];
    return sum + questions.length;
  }, 0);
}

function countLeaves(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countLeaves(item), 0);
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countLeaves(item), 0);
  }
  return value === undefined || value === null || value === '' ? 0 : 1;
}

function findCodeInText(value) {
  const searchable = String(value || '').toUpperCase();
  const matches = HANBAN_CODES.map((code) => {
    const index = searchable.indexOf(code);
    if (index < 0) return null;
    const before = index === 0 ? '' : searchable[index - 1];
    const after = searchable[index + code.length] || '';
    if ((before && /[A-Z0-9]/.test(before)) || (after && /[A-Z0-9]/.test(after))) return null;
    return { code, index };
  }).filter(Boolean).sort((a, b) => a.index - b.index);
  return matches[0]?.code || null;
}

function getCode(row) {
  // A combined PDF filename may start with H61328 even when the row being
  // imported is H61001, H61003, etc. Prefer row-specific labels first.
  const rowSpecific = [row.title, row.display_test_label, row.card_subtitle, row.card_label]
    .filter(Boolean).join(' ');
  const direct = findCodeInText(rowSpecific);
  if (direct) return direct;

  // Only accept an individual PDF filename such as HSK6_PDF_IMPORT:H61001.pdf.
  // Do not infer a row code from a merged file name like H61328-đã gộp.pdf,
  // because that single file contains several different paper codes.
  const sourceText = [row.source_file, row.source_url].filter(Boolean).join(' ').toUpperCase();
  const individualFileMatch = sourceText.match(/(?:^|[^A-Z0-9])(H61328|H61327|H61006|H61005|H61003|H61001)\.PDF(?:$|[?#\s])/);
  return individualFileMatch ? individualFileMatch[1] : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (['audioUrl', 'audio_url', 'uploadedAt', 'updatedAt'].includes(key)) continue;
      output[key] = stableValue(value[key]);
    }
    return output;
  }
  return value;
}

function contentFingerprint(row) {
  const content = asObject(row.content);
  const answerKey = asObject(row.answer_key);
  const payload = JSON.stringify(stableValue({ content, answerKey }));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function rankRow(row, code) {
  const exactSource = String(row.source_file || '').trim().toUpperCase() ===
    `HSK6_PDF_IMPORT:${code}.PDF`;
  const questionCount = countQuestions(row.content);
  const answerCount = countLeaves(row.answer_key);
  const hasAudio = Boolean(String(row.audio_url || '').trim());
  const attempts = Math.max(0, Number(row.attempts_count || 0));
  const isPublished = row.published === true || row.published === 't';

  // Prefer the most complete version first; break ties in favor of the known
  // source import, audio-bearing row, existing published row, and history count.
  return questionCount * 1_000_000 + answerCount * 1_000 +
    (exactSource ? 500 : 0) + (hasAudio ? 250 : 0) +
    (isPublished ? 50 : 0) + Math.min(attempts, 49);
}

async function repairHanbanHsk6Duplicates(dbQuery) {
  if (typeof dbQuery !== 'function') {
    throw new TypeError('repairHanbanHsk6Duplicates requires the database query function.');
  }

  const selected = await dbQuery(
    `SELECT id, skill, volume, test_no, title, question_type, total_questions,
            content, answer_key, explanations, audio_url, source_file, source_url,
            series_label, display_test_label, card_label, card_subtitle,
            attempts_count, status_label, button_label, cover_url, category_id,
            published, created_at
       FROM practice_tests
      WHERE volume = 6
        AND LOWER(skill) IN ('listening', 'reading')
        AND COALESCE(series_label, '') <> '${HIDDEN_DUPLICATE_SERIES}'`
  );

  const allRows = selected.rows || [];
  const groups = new Map();
  const codeByFingerprint = new Map();

  // First pass: code is read from row-specific title/labels or an individual
  // PDF filename. This avoids interpreting the merged filename H61328-đã gộp.pdf
  // as the code for every row inside that merged PDF.
  for (const row of allRows) {
    const code = getCode(row);
    const skill = String(row.skill || '').toLowerCase();
    if (!code || !['listening', 'reading'].includes(skill)) continue;
    const key = `${code}:${skill}`;
    if (!groups.has(key)) groups.set(key, { code, skill, rows: [] });
    groups.get(key).rows.push(row);
    const fingerprint = contentFingerprint(row);
    const fingerprintKey = `${skill}:${fingerprint}`;
    const previous = codeByFingerprint.get(fingerprintKey);
    if (!previous) codeByFingerprint.set(fingerprintKey, { code, ambiguous: false });
    else if (previous.code !== code) previous.ambiguous = true;
  }

  // Second pass: an Admin-imported copy may have a generic title and a merged
  // source filename. If its question content + answer key exactly matches one
  // known coded row, associate it with that code so it can be deduplicated too.
  for (const row of allRows) {
    if (getCode(row)) continue;
    const skill = String(row.skill || '').toLowerCase();
    if (!['listening', 'reading'].includes(skill)) continue;
    const match = codeByFingerprint.get(`${skill}:${contentFingerprint(row)}`);
    if (!match || match.ambiguous) continue;
    const key = `${match.code}:${skill}`;
    if (!groups.has(key)) groups.set(key, { code: match.code, skill, rows: [] });
    if (!groups.get(key).rows.some((candidate) => candidate.id === row.id)) {
      groups.get(key).rows.push(row);
    }
  }

  const summary = {
    matchedGroups: 0,
    labelledRows: 0,
    hiddenDuplicates: 0,
    missing: []
  };

  for (const code of HANBAN_CODES) {
    for (const skill of ['listening', 'reading']) {
      const group = groups.get(`${code}:${skill}`);
      if (!group || !group.rows.length) {
        summary.missing.push(`${code}:${skill}`);
        continue;
      }

      group.rows.sort((a, b) => rankRow(b, code) - rankRow(a, code));
      const canonical = group.rows[0];
      const duplicates = group.rows.slice(1);
      const skillLabel = skill === 'listening' ? 'LISTENING 听力' : 'READING 阅读';
      const inheritedAudio = String(canonical.audio_url || '').trim() ||
        (group.rows.find((row) => String(row.audio_url || '').trim()) || {}).audio_url || '';
      const inheritedCategory = canonical.category_id ||
        (group.rows.find((row) => row.category_id) || {}).category_id || null;
      const anyPublished = group.rows.some((row) => row.published === true || row.published === 't');
      const canonicalSubtitle = skill === 'listening'
        ? `HANBAN · HSK6 · ${code} · ${Number(canonical.total_questions || 50)} câu · Audio do Admin bổ sung`
        : `HANBAN · HSK6 · ${code} · ${Number(canonical.total_questions || 50)} câu`;

      await dbQuery(
        `UPDATE practice_tests
            SET title = $2,
                series_label = 'HANBAN',
                display_test_label = $3,
                card_label = $4,
                card_subtitle = $5,
                audio_url = CASE WHEN COALESCE(audio_url, '') = '' THEN $6 ELSE audio_url END,
                category_id = COALESCE(category_id, $7),
                published = $8,
                updated_at = NOW()
          WHERE id = $1`,
        [
          canonical.id,
          `HANBAN · HSK6 · ${code} · ${skillLabel}`,
          code,
          skill === 'listening' ? 'LISTENING' : 'READING',
          canonicalSubtitle,
          inheritedAudio,
          inheritedCategory,
          anyPublished
        ]
      );
      summary.matchedGroups += 1;
      summary.labelledRows += 1;

      for (const duplicate of duplicates) {
        await dbQuery(
          `UPDATE practice_tests
              SET title = CASE
                    WHEN COALESCE(title, '') ILIKE 'BẢN TRÙNG (đã ẩn) · %' THEN title
                    ELSE 'BẢN TRÙNG (đã ẩn) · ' || COALESCE(title, '')
                  END,
                  series_label = $2,
                  display_test_label = $3,
                  card_label = 'BẢN TRÙNG',
                  card_subtitle = $4,
                  published = FALSE,
                  updated_at = NOW()
            WHERE id = $1`,
          [
            duplicate.id,
            HIDDEN_DUPLICATE_SERIES,
            `${code} · DUPLICATE`,
            `Đã ẩn khỏi danh sách học viên vì trùng mã ${code}; dữ liệu và lịch sử vẫn được giữ trong database.`
          ]
        );
        summary.hiddenDuplicates += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  HANBAN_CODES,
  HIDDEN_DUPLICATE_SERIES,
  repairHanbanHsk6Duplicates
};
