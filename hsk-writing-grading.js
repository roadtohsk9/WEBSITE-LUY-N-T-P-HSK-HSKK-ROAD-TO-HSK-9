'use strict';

// HSK 7–9 Writing and Translation grading through the server-side AI service.
// The API key is never sent to the browser.
const https = require('https');

const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim() || 'deepseek-flash';
const DEEPSEEK_TIMEOUT_MS = Math.max(15000, Number(process.env.DEEPSEEK_TIMEOUT_MS || 120000));
const DEEPSEEK_WRITING_MAX_TOKENS = Math.max(3500, Math.min(10000, Number(process.env.DEEPSEEK_WRITING_MAX_TOKENS || 8000)));
const DEEPSEEK_API_KEY = () => String(process.env.DEEPSEEK_API_KEY || '').trim();

function requestDeepSeek(prompt) {
  const key = DEEPSEEK_API_KEY();
  if (!key) return Promise.reject(new Error('AI_NOT_CONFIGURED'));
  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: 'You are a careful HSK 7–9 examiner. Return valid JSON only. Follow the user instructions and do not invent evidence.' },
      { role: 'user', content: String(prompt || '') }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0.1,
    max_tokens: DEEPSEEK_WRITING_MAX_TOKENS
  };
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${key}`
      }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw || '{}'); }
        catch { return reject(new Error('AI_INVALID_RESPONSE')); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(data?.error?.message || 'AI_REQUEST_FAILED');
          error.httpStatus = res.statusCode;
          return reject(error);
        }
        const text = String(data?.choices?.[0]?.message?.content || '').trim();
        if (!text) return reject(new Error('AI_EMPTY_RESPONSE'));
        resolve(text);
      });
    });
    req.on('error', reject);
    req.setTimeout(DEEPSEEK_TIMEOUT_MS, () => req.destroy(new Error('AI_TIMEOUT')));
    req.write(body);
    req.end();
  });
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
  }
  throw new Error('AI_INVALID_JSON');
}

function cleanTasks(tasks, answers) {
  const map = answers && typeof answers === 'object' ? answers : {};
  return (Array.isArray(tasks) ? tasks : []).map((q, i) => {
    const number = String(q.number ?? i + 1);
    return {
      number,
      task: String(q.task || q.type || ''),
      prompt: String(q.text || q.prompt || q.question || ''),
      source: String(q.sourceText || q.source || q.originalText || ''),
      direction: String(q.direction || q.translationDirection || ''),
      minLength: Number(q.min || q.minLength || 0),
      maxLength: Number(q.max || q.maxLength || 0),
      answer: String(map[number] ?? map[q.number] ?? q.answer ?? '')
    };
  });
}

function baseInstruction() {
  return `Bạn là giám khảo chuyên môn HSK 7–9. Hãy đánh giá nghiêm túc nhưng công bằng, chỉ dựa trên bài làm được cung cấp. Toàn bộ giải thích, nhận xét và hướng dẫn phải viết bằng tiếng Việt tự nhiên, cụ thể; ví dụ tiếng Trung phải giữ nguyên tiếng Trung và có thể kèm nghĩa tiếng Việt. Không bịa lỗi. Phân biệt lỗi ngữ pháp thật với cách diễn đạt chưa tự nhiên. Chấm theo thang 100 điểm, có tiêu chí, bằng chứng cụ thể, điểm mạnh, điểm cần cải thiện, sửa lỗi và kế hoạch luyện tập. Không tự giả định có rubric chính thức nếu đề không cung cấp. Trả về duy nhất JSON hợp lệ, không markdown.`;
}

async function gradeHskWriting({ tasks, answers, testTitle, volume }) {
  const normalized = cleanTasks(tasks, answers);
  if (!normalized.length) throw new Error('HSK_WRITING_TASKS_EMPTY');
  const prompt = `${baseInstruction()}
NHIỆM VỤ: Chấm kỹ năng VIẾT HSK ${volume || '7–9'}.
Xem từng yêu cầu, độ hoàn thành nhiệm vụ, bố cục, mạch lạc, độ chính xác ngữ pháp, vốn từ và văn phong học thuật/ứng dụng phù hợp với đề. Nếu bài gồm văn bản ứng dụng và bài viết theo chủ đề, đánh giá riêng từng phần rồi tính điểm tổng có trọng số hợp lý; nói rõ trọng số đã dùng.
JSON SHAPE:
{"overallScore":0,"levelEstimate":"","criteria":[{"name":"Hoàn thành yêu cầu","score":0,"max":100,"feedback":""},{"name":"Bố cục và liên kết","score":0,"max":100,"feedback":""},{"name":"Từ vựng và diễn đạt","score":0,"max":100,"feedback":""},{"name":"Ngữ pháp và độ chính xác","score":0,"max":100,"feedback":""}],"taskReviews":[{"number":"1","score":0,"max":100,"summary":"","strengths":[],"improvements":[]}],"strengths":[],"improvements":[],"corrections":[{"original":"","corrected":"","category":"","explanation":"","betterOption":"","context":""}],"vocabularyUpgrades":[{"original":"","suggestion":"","meaning":"","usage":""}],"overallFeedback":"","actionPlan":[],"takeNotePrompts":[]}
Giới hạn: tối đa 30 corrections và 15 vocabularyUpgrades. Với nội dung bỏ trống, không tự tạo bài làm và không chấm điểm giả; overallScore phải phản ánh bài nộp trống. Bằng chứng và ví dụ phải lấy từ câu trả lời thực tế.
ĐỀ: ${String(testTitle || '')}
DỮ LIỆU BÀI VIẾT:
${JSON.stringify(normalized)}`;
  const result = parseJson(await requestDeepSeek(prompt));
  result.overallScore = Math.max(0, Math.min(100, Math.round(Number(result.overallScore) || 0)));
  delete result.model;
  return result;
}

async function gradeHskTranslation({ tasks, answers, testTitle, volume }) {
  const normalized = cleanTasks(tasks, answers);
  if (!normalized.length) throw new Error('HSK_TRANSLATION_TASKS_EMPTY');
  const prompt = `${baseInstruction()}
NHIỆM VỤ: Chấm kỹ năng DỊCH HSK ${volume || '7–9'} (có thể Trung→Việt hoặc Việt→Trung; dựa vào hướng dịch ghi trong đề, không được tự đoán khi đề có nêu rõ).
Ưu tiên độ chính xác ý nghĩa, độ đầy đủ, thuật ngữ/từ vựng, ngữ pháp, tự nhiên và đúng văn phong. Với câu dịch tiếng Trung, kiểm tra dùng từ, trật tự câu, kết cấu và văn phong. Với câu dịch tiếng Việt, kiểm tra bảo toàn nghĩa và cách diễn đạt tiếng Việt. Đưa bản dịch tham khảo, nhưng chấp nhận phương án tương đương hợp lý.
JSON SHAPE:
{"overallScore":0,"levelEstimate":"","criteria":[{"name":"Độ chính xác ý nghĩa","score":0,"max":100,"feedback":""},{"name":"Độ đầy đủ","score":0,"max":100,"feedback":""},{"name":"Ngữ pháp và cấu trúc","score":0,"max":100,"feedback":""},{"name":"Từ vựng và tính tự nhiên","score":0,"max":100,"feedback":""}],"translationReviews":[{"number":"1","score":0,"max":100,"direction":"","source":"","studentVersion":"","referenceVersion":"","feedback":"","errors":[{"original":"","corrected":"","explanation":""}]}],"strengths":[],"improvements":[],"overallFeedback":"","actionPlan":[],"takeNotePrompts":[]}
Không phạt khác biệt từ ngữ nếu giữ đúng ý và văn phong. Tối đa 20 lỗi cho toàn bài. Không bịa câu gốc hay phần bài làm bị thiếu.
ĐỀ: ${String(testTitle || '')}
DỮ LIỆU BÀI DỊCH:
${JSON.stringify(normalized)}`;
  const result = parseJson(await requestDeepSeek(prompt));
  result.overallScore = Math.max(0, Math.min(100, Math.round(Number(result.overallScore) || 0)));
  delete result.model;
  return result;
}

function isDeepSeekConfigured() { return !!DEEPSEEK_API_KEY(); }
module.exports = { gradeHskWriting, gradeHskTranslation, DEEPSEEK_MODEL, isDeepSeekConfigured };
