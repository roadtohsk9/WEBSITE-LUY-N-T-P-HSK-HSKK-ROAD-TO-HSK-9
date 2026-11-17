'use strict';

// HSK Writing (HSK 6 summary + HSK 7–9) and Translation grading through the server-side AI service.
// The API key is never sent to the browser.
const https = require('https');

const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim() || 'deepseek-flash';
const DEEPSEEK_TIMEOUT_MS = Math.max(15000, Number(process.env.DEEPSEEK_TIMEOUT_MS || 120000));
const DEEPSEEK_WRITING_MAX_TOKENS = Math.max(3500, Math.min(10000, Number(process.env.DEEPSEEK_WRITING_MAX_TOKENS || 8000)));
const DEEPSEEK_API_KEY = () => String(process.env.DEEPSEEK_API_KEY || '').trim();

function requestDeepSeek(prompt, maxTokens = DEEPSEEK_WRITING_MAX_TOKENS) {
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
    max_tokens: Math.max(700, Math.min(10000, Number(maxTokens) || DEEPSEEK_WRITING_MAX_TOKENS))
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


// Compact rubric for the HSK 6 source-based summary task (缩写).
// It deliberately caps the response length to reduce API usage while keeping actionable feedback.
const HSK6_WRITING_MAX_TOKENS = Math.max(700, Math.min(2000, Number(process.env.HSK6_WRITING_MAX_TOKENS || 1300)));

async function gradeHsk6SummaryWriting({ tasks, answers, testTitle }) {
  const normalized = cleanTasks(tasks, answers);
  if (!normalized.length) throw new Error('HSK6_WRITING_TASKS_EMPTY');
  const task = normalized[0];
  const studentAnswer = String(task.answer || '').trim();
  const sourceText = String(task.source || '').trim();
  const instruction = String(task.prompt || '请根据阅读材料进行缩写，字数约400字。').trim();
  const targetLength = Number(task.minLength || 400) || 400;
  const actualLength = Array.from(studentAnswer.replace(/\s/g, '')).length;
  if (!studentAnswer) {
    const result = { overallScore: 0, criteria: [
      { name: '内容与要点', score: 0, max: 40, feedback: 'Chưa có bài làm để đánh giá.' },
      { name: '忠实与准确', score: 0, max: 25, feedback: 'Chưa có bài làm để đối chiếu với văn bản nguồn.' },
      { name: '结构与衔接', score: 0, max: 20, feedback: 'Chưa có bài làm để đánh giá.' },
      { name: '语言表达', score: 0, max: 15, feedback: 'Chưa có bài làm để đánh giá.' }
    ], overallFeedback: 'Bài viết chưa có nội dung. Hãy hoàn thành phần tóm tắt trước khi nộp.', missingOrDistortedPoints: [], corrections: [], referenceSummary: '', actionPlan: ['Viết bản tóm tắt khoảng 400 chữ Hán theo đúng văn bản nguồn.'], taskReviews: [{ number: String(task.number || '1'), task: '缩写', score: 0, max: 100, summary: 'Bài làm trống.', strengths: [], improvements: ['Hoàn thành bài viết trước khi nộp.'] }] };
    return result;
  }
  const evidence = {
    instruction,
    sourceText,
    targetLength,
    studentAnswer,
    actualChineseCharacters: actualLength
  };
  const prompt = `你是HSK六级写作“缩写”任务的评分教师。只依据给出的原文和学生答案评分，不得编造原文信息或学生错误。请用越南语写反馈，保留中文例句。按100分给出内部估分（非官方成绩）：内容/要点40分、忠实准确25分、结构衔接20分、语言表达15分。重点检查是否抓住中心、覆盖关键事件/信息、是否遗漏或歪曲事实、是否加入原文没有的信息、是否符合约400个汉字、是否连贯简洁。评分应公平；同义改写不算错。\n只返回紧凑JSON，不要Markdown。字段格式：{"overallScore":0,"criteria":[{"name":"内容与要点","score":0,"max":40,"feedback":""},{"name":"忠实与准确","score":0,"max":25,"feedback":""},{"name":"结构与衔接","score":0,"max":20,"feedback":""},{"name":"语言表达","score":0,"max":15,"feedback":""}],"overallFeedback":"","missingOrDistortedPoints":[],"corrections":[{"original":"","corrected":"","reason":""}],"referenceSummary":"","actionPlan":[]}.\n限制：missingOrDistortedPoints最多3项；corrections最多4项，只列真实且有代表性的错误；actionPlan最多2项；referenceSummary如确有必要，最多220个汉字，若不能从原文可靠概括则留空。评语简短具体。若答案为空，不得虚构答案或给分，overallScore为0。overallScore应与四项得分之和一致。\n题目：${String(testTitle || '')}\n材料与答案：${JSON.stringify(evidence)}`;
  const result = parseJson(await requestDeepSeek(prompt, HSK6_WRITING_MAX_TOKENS));
  const rubric = [
    ['内容与要点', 40], ['忠实与准确', 25], ['结构与衔接', 20], ['语言表达', 15]
  ];
  const suppliedCriteria = Array.isArray(result.criteria) ? result.criteria : [];
  result.criteria = rubric.map(([name, max], index) => {
    const item = suppliedCriteria[index] || {};
    return { name, max, score: Math.max(0, Math.min(max, Math.round(Number(item.score) || 0))), feedback: String(item.feedback || '').slice(0, 280) };
  });
  result.overallScore = result.criteria.reduce((sum, item) => sum + item.score, 0);
  result.missingOrDistortedPoints = Array.isArray(result.missingOrDistortedPoints) ? result.missingOrDistortedPoints.slice(0, 3) : [];
  result.corrections = Array.isArray(result.corrections) ? result.corrections.slice(0, 4) : [];
  result.actionPlan = Array.isArray(result.actionPlan) ? result.actionPlan.slice(0, 2) : [];
  result.referenceSummary = String(result.referenceSummary || '').slice(0, 1200);
  result.taskReviews = [{ number: String(task.number || '1'), task: '缩写', score: result.overallScore, max: 100, summary: String(result.overallFeedback || ''), strengths: [], improvements: result.actionPlan }];
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
module.exports = { gradeHskWriting, gradeHskTranslation, gradeHsk6SummaryWriting, DEEPSEEK_MODEL, isDeepSeekConfigured };
