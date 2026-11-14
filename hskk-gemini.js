'use strict';
const https = require('https');

const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
const TIMEOUT_MS = Math.max(20000, Number(process.env.GEMINI_TIMEOUT_MS || 180000));
const apiKey = () => String(process.env.GEMINI_API_KEY || '').trim();

function requestJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw || '{}'); }
        catch { return reject(new Error('Gemini trả về dữ liệu không phải JSON.')); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = data?.error?.message || `Gemini API ${res.statusCode}`;
          const err = new Error(message); err.httpStatus = res.statusCode; return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`Gemini timeout sau ${Math.round(TIMEOUT_MS / 1000)} giây.`)));
    req.write(body); req.end();
  });
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(raw); } catch {}
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch {} }
  throw new Error('Không đọc được JSON feedback từ Gemini.');
}

function safeMime(mime) {
  const value = String(mime || 'audio/webm').toLowerCase().split(';')[0].trim();
  return ['audio/webm','audio/wav','audio/mp3','audio/mpeg','audio/mp4','audio/m4a','audio/ogg','audio/aac','audio/flac','audio/opus'].includes(value) ? value : 'audio/webm';
}

async function gradeHskkWithGemini({ exam, recordings }) {
  const key = apiKey();
  if (!key) throw new Error('GEMINI_API_KEY chưa được cấu hình trong Environment Variables của Render.');
  if (!Array.isArray(recordings) || !recordings.length) throw new Error('Không có bản ghi âm để chấm.');

  const examInfo = {
    version: exam.version,
    level: exam.level,
    levelLabel: exam.level_label,
    title: exam.title,
    sections: (exam.content?.sections || []).map(s => ({ title: s.title, tasks: (s.tasks || []).map(t => ({ id: t.id, type: t.type, text: t.text, referenceText: t.referenceText, expectedDuration: t.speakSeconds })) }))
  };
  const parts = [{ text: `Bạn là giám khảo luyện thi khẩu ngữ tiếng Trung phổ thông (普通话) cho ROAD TO HSK 9. Hãy nghe trực tiếp từng bản ghi âm được đính kèm và đánh giá tiếng Trung của người học. Không được giả vờ đo được âm vị học chính xác hơn chất lượng âm thanh thực tế. Phân biệt phát âm, thanh điệu, độ rõ, tốc độ, ngập ngừng; phân biệt độ trôi chảy, liên kết, logic, phát triển ý, ngữ pháp, từ vựng và mức độ hoàn thành nhiệm vụ. Với dạng 听后重复 / 听后复述, so sánh với referenceText nếu có; nếu không có văn bản chuẩn thì không được bịa lỗi lặp lại. Với câu hỏi tự do, đánh giá mức độ trả lời đúng trọng tâm, ví dụ, lập luận và độ tự nhiên. Không áp dụng band IELTS. Chấm điểm luyện tập 0-100, đây là ước lượng tham khảo, không phải điểm chính thức của CTI. Phản hồi bằng tiếng Việt, ví dụ tiếng Trung ngắn gọn khi cần. Không suy diễn đặc điểm cá nhân.\n\nTHÔNG TIN ĐỀ:\n${JSON.stringify(examInfo)}\n\nCÁC BẢN GHI ÂM THEO THỨ TỰ (mỗi nhãn ngay trước file audio tương ứng):` }];

  let totalBytes = 0;
  for (let i = 0; i < recordings.length; i++) {
    const r = recordings[i] || {};
    const audio = String(r.audio || '').replace(/^data:[^,]*;base64,/, '');
    if (!audio || !/^[A-Za-z0-9+/=]+$/.test(audio)) continue;
    const estimated = Math.floor(audio.length * 3 / 4);
    totalBytes += estimated;
    if (totalBytes > 12 * 1024 * 1024) throw new Error('Tổng dung lượng ghi âm vượt giới hạn chấm trong một lượt. Hãy giảm số lần ghi hoặc thời lượng ghi âm.');
    parts.push({ text: `\nBẢN GHI ÂM ${i + 1}: taskId=${String(r.taskId || '')}; section=${String(r.sectionTitle || '')}; taskType=${String(r.taskType || '')}; question=${String(r.question || '')}; referenceText=${String(r.referenceText || '')}; prepSeconds=${Number(r.prepSeconds || 0)}; answerSeconds=${Number(r.answerSeconds || 0)}.` });
    parts.push({ inlineData: { mimeType: safeMime(r.mime), data: audio } });
  }

  parts.push({ text: `\nHãy trả về CHỈ JSON hợp lệ theo cấu trúc sau, không dùng Markdown:\n{
  "totalScore": 0,
  "levelEstimate": "...",
  "overallSummary": "...",
  "dimensions": {
    "pronunciation": {"score":0,"level":"...","summary":"...","strengths":["..."],"issues":["..."],"practiceDrills":["..."]},
    "fluency": {"score":0,"summary":"...","strengths":["..."],"issues":["..."],"practiceDrills":["..."]},
    "coherence": {"score":0,"summary":"...","strengths":["..."],"issues":["..."],"practiceDrills":["..."]},
    "ideaDevelopment": {"score":0,"summary":"...","strengths":["..."],"issues":["..."],"practiceDrills":["..."]},
    "grammar": {"score":0,"summary":"...","strengths":["..."],"issues":["..."],"examples":[{"original":"...","improved":"...","why":"..."}]},
    "vocabulary": {"score":0,"summary":"...","strengths":["..."],"issues":["..."],"upgrades":[{"basic":"...","natural":"...","context":"..."}]},
    "taskAchievement": {"score":0,"summary":"...","strengths":["..."],"issues":["..."]}
  },
  "pronunciationAnalysis": {"toneAccuracy":"...","initialFinal":"...","rhythm":"...","intelligibility":"...","caution":"..."},
  "logicAnalysis": {"structure":"...","relevance":"...","examples":"...","transitions":"..."},
  "perQuestion": [{"taskId":"...","sectionTitle":"...","taskType":"...","score":0,"transcript":"...","summary":"...","strengths":["..."],"issues":["..."],"suggestedResponse":"...","repeatAccuracy":{"reference":"...","missing":"...","added":"...","note":"..."}}],
  "priorityFixes":["..."],
  "actionPlan":[{"focus":"...","practice":"...","frequency":"...","successMeasure":"..."}],
  "confidenceNote":"..."
}\nĐiền điểm từ 0 đến 100; dùng mảng rỗng khi không có dữ liệu. Không được kết luận phát âm chi tiết nếu audio không đủ rõ. Transcript là bản nghe được, đánh dấu [không rõ] nếu không chắc.` });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await requestJson(endpoint, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  });
  const text = (response?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  const result = parseJson(text);
  const n = Number(result.totalScore);
  result.totalScore = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  result.model = GEMINI_MODEL;
  return result;
}

module.exports = { gradeHskkWithGemini, GEMINI_MODEL, isGeminiConfigured: () => !!apiKey() };
