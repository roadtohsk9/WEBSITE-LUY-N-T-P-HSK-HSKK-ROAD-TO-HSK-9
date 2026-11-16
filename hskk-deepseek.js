'use strict';
const https = require('https');
const crypto = require('crypto');

// Server-only integration. Never expose the API key or provider details to the browser.
function envInt(name,fallback,min,max){const n=Number(process.env[name]);return Math.max(min,Math.min(max,Number.isFinite(n)&&n>0?n:fallback));}
const MODEL = String(process.env.HSKK_DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim() || 'deepseek-flash';
const MAX_OUTPUT_TOKENS = envInt('HSKK_DEEPSEEK_MAX_TOKENS',4200,2200,6500);
const SYSTEM_PROMPT = `Bạn là giám khảo luyện nói HSKK. Chỉ dựa trên transcript ASR, không giả vờ nghe audio. Đánh giá bằng tiếng Việt, ví dụ tiếng Trung giản thể. Chấm nghiêm, công bằng, nêu bằng chứng cụ thể và viết ngắn gọn theo từng mục.\n\nGIỚI HẠN BẰNG CHỨNG: Không chấm thanh điệu, thanh mẫu, vận mẫu, âm lượng, ngữ điệu hoặc tốc độ nói. pronunciation.available=false, score=null; ghi rõ cần phân tích âm thanh chuyên dụng. Fluency chỉ là độ liền mạch thể hiện qua câu chữ, không suy luận ngập ngừng/tốc độ. ASR có thể sai; cảnh báo transcript bất thường và không tự quy lỗi cho học viên.\n\nĐÁNH GIÁ: taskAchievement, độ chính xác/đủ ý, coherence, ideaDevelopment, grammar, vocabulary và fluency qua transcript. Với 听后重复/听后复述, đối chiếu referenceText: xác định ý thiếu, ý thêm, sai nghĩa; không bắt buộc đúng nguyên văn với dạng thuật lại. Tổng điểm 0-100 chỉ tính 6 tiêu chí văn bản, không phải điểm thi chính thức.\n\nTRẢ VỀ JSON duy nhất, theo cấu trúc: {totalScore,levelEstimate,overallSummary,dimensions:{pronunciation:{available:false,score:null,summary,strengths,issues,practiceDrills},fluency:{available:true,score,summary,strengths,issues,practiceDrills},coherence:{available:true,score,summary,strengths,issues,practiceDrills},ideaDevelopment:{available:true,score,summary,strengths,issues,practiceDrills},grammar:{available:true,score,summary,strengths,issues,examples:[{original,improved,why}]},vocabulary:{available:true,score,summary,strengths,issues,upgrades:[{basic,natural,context}]},taskAchievement:{available:true,score,summary,strengths,issues,practiceDrills}},pronunciationAnalysis:{toneAccuracy,initialFinal,rhythm,intelligibility,caution},logicAnalysis:{structure,relevance,examples,transitions},perQuestion:[{taskId,score,summary,strengths,issues,suggestedResponse,repeatAccuracy:{missing,added,note}}],priorityFixes,actionPlan:[{focus,practice,frequency,successMeasure}],confidenceNote}.\n\nGIỚI HẠN ĐỘ DÀI: Mỗi summary 1-2 câu; mỗi dimension tối đa 2 strengths, 3 issues, 2 drills/examples/upgrades; mỗi câu hỏi tối đa 2 strengths, 3 issues và một suggestedResponse ngắn; tối đa 5 priorityFixes và 4 actionPlan. Một mục không có bằng chứng thì dùng mảng rỗng. Không lặp lại transcript trong kết quả; hệ thống sẽ tự gắn transcript gốc.`;
const API_KEY = () => String(process.env.DEEPSEEK_API_KEY || '').trim();
const REQUEST_TIMEOUT_MS = Math.max(30000, Number(process.env.HSKK_AI_TIMEOUT_MS || 240000));
const ASR_MAX_BYTES = 8 * 1024 * 1024;
const ASR_MAX_SECONDS = 120;

function requestJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw || '{}'); }
        catch { return reject(new Error(`AI request returned invalid JSON (HTTP ${res.statusCode}).`)); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(data?.error?.message || `AI request failed (HTTP ${res.statusCode}).`);
          err.httpStatus = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('AI request timed out.')));
    req.write(body);
    req.end();
  });
}

function multipartRequest(url, audioBuffer, filename = 'speech.wav') {
  const boundary = `----RoadHskk${crypto.randomBytes(12).toString('hex')}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, audioBuffer, tail]);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY()}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(raw || '{}'); }
        catch { return reject(new Error(`Speech recognition returned invalid JSON (HTTP ${res.statusCode}).`)); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(data?.error?.message || `Speech recognition failed (HTTP ${res.statusCode}).`);
          err.httpStatus = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Speech recognition timed out.')));
    req.write(body);
    req.end();
  });
}

function audioBufferFromDataUrl(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error('Audio phải được chuyển thành WAV PCM trước khi chấm. Hãy tải lại trang thi và thực hiện lại.');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length) throw new Error('Một bản ghi âm bị rỗng.');
  if (buffer.length > ASR_MAX_BYTES) throw new Error('Một đoạn audio vượt giới hạn cho phép.');
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Định dạng audio không hợp lệ.');
  }
  return buffer;
}

async function transcribeSegment(segment) {
  const seconds = Number(segment?.durationSeconds || 0);
  if (seconds > ASR_MAX_SECONDS + 1) throw new Error('Mỗi đoạn ghi âm cần ngắn hơn 120 giây.');
  const audio = audioBufferFromDataUrl(segment?.audio);
  const result = await multipartRequest('https://api.deepseek.com/v1/tools/asr', audio);
  return { text: String(result?.text || '').trim(), durationMs: Math.max(0, Number(result?.duration_ms || 0)) };
}

function parseJson(text) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('Không thể đọc cấu trúc feedback.');
}

function clampScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

async function gradeHskkWithDeepSeek({ exam, recordings }) {
  const key = API_KEY();
  if (!key) throw new Error('SCORING_NOT_CONFIGURED');
  if (!Array.isArray(recordings) || !recordings.length) throw new Error('NO_RECORDINGS');

  // ASR is billed by audio seconds (not LLM text tokens). Keep transcripts compact
  // and avoid sending duplicated exam/task metadata to the language model.
  const transcribed = [];
  let totalAudioBytes = 0;
  let totalAsrSeconds = 0;
  for (const recording of recordings) {
    const segments = Array.isArray(recording.segments) ? recording.segments : [];
    if (!segments.length) throw new Error('AUDIO_FORMAT_OUTDATED');
    const transcriptParts = [];
    for (const segment of segments) {
      const audio = audioBufferFromDataUrl(segment.audio);
      totalAudioBytes += audio.length;
      if (totalAudioBytes > 12 * 1024 * 1024) throw new Error('AUDIO_TOTAL_TOO_LARGE');
      const asr = await transcribeSegment(segment);
      totalAsrSeconds += asr.durationMs ? asr.durationMs / 1000 : Number(segment.durationSeconds || 0);
      if (asr.text) transcriptParts.push(asr.text);
    }
    transcribed.push({
      taskId: String(recording.taskId || ''),
      sectionTitle: String(recording.sectionTitle || ''),
      taskType: String(recording.taskType || ''),
      question: String(recording.question || ''),
      referenceText: String(recording.referenceText || ''),
      transcript: transcriptParts.join(' ')
    });
  }

  const compactInput = {
    exam: { version: String(exam.version || ''), level: String(exam.level_label || exam.level || ''), title: String(exam.title || '') },
    answers: transcribed.map(x => ({
      id: x.taskId,
      type: x.taskType,
      question: x.question,
      ...(x.referenceText ? { reference: x.referenceText } : {}),
      transcript: x.transcript
    }))
  };
  const response = await requestJson('https://api.deepseek.com/chat/completions', {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(compactInput) }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS
  }, { Authorization: `Bearer ${key}` });

  if (response?.usage) {
    const u = response.usage, d = u.prompt_tokens_details || {}, o = u.completion_tokens_details || {};
    console.info('[DEEPSEEK_HSKK_USAGE]', JSON.stringify({
      model: response.model || MODEL,
      input: u.prompt_tokens || 0,
      output: u.completion_tokens || 0,
      total: u.total_tokens || 0,
      cacheHit: u.prompt_cache_hit_tokens ?? d.cached_tokens ?? 0,
      cacheMiss: u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens || 0) - (u.prompt_cache_hit_tokens ?? d.cached_tokens ?? 0)),
      reasoning: o.reasoning_tokens || 0,
      asrSeconds: Math.round(totalAsrSeconds * 10) / 10
    }));
  }
  const output = response?.choices?.[0]?.message?.content || '';
  const result = parseJson(output);
  const dimensions = result.dimensions || {};
  const scoreKeys = ['fluency', 'coherence', 'ideaDevelopment', 'grammar', 'vocabulary', 'taskAchievement'];
  const scores = scoreKeys.map(key => {
    if (!dimensions[key]) dimensions[key] = {};
    dimensions[key].available = true;
    dimensions[key].score = clampScore(dimensions[key].score);
    return dimensions[key].score;
  });
  result.totalScore = Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length);
  if (!dimensions.pronunciation) dimensions.pronunciation = {};
  dimensions.pronunciation.available = false;
  dimensions.pronunciation.score = null;
  dimensions.pronunciation.summary = 'Chưa thể chấm trực tiếp phát âm và thanh điệu từ transcript. Cần công cụ phân tích âm thanh chuyên dụng để đánh giá chính xác.';
  dimensions.pronunciation.strengths = [];
  dimensions.pronunciation.issues = ['Phát âm, thanh điệu, thanh mẫu và vận mẫu chưa được đánh giá trong lượt này.'];
  dimensions.pronunciation.practiceDrills = [];
  result.dimensions = dimensions;

  // Keep ASR transcripts authoritative and guarantee one feedback card per submitted question.
  const modelQuestionMap = new Map((Array.isArray(result.perQuestion) ? result.perQuestion : []).map(q => [String(q.taskId || ''), q]));
  result.perQuestion = transcribed.map(item => {
    const modelItem = modelQuestionMap.get(item.taskId) || {};
    const repeatAccuracy = modelItem.repeatAccuracy && typeof modelItem.repeatAccuracy === 'object' ? modelItem.repeatAccuracy : {};
    return {
      ...modelItem,
      taskId: item.taskId,
      sectionTitle: item.sectionTitle,
      taskType: item.taskType,
      transcript: item.transcript,
      summary: String(modelItem.summary || (item.transcript ? 'Transcript đã được nhận dạng; xem các góp ý bên dưới.' : 'Không nhận dạng được nội dung lời nói rõ ràng.')),
      strengths: Array.isArray(modelItem.strengths) ? modelItem.strengths : [],
      issues: Array.isArray(modelItem.issues) ? modelItem.issues : [],
      score: clampScore(modelItem.score),
      repeatAccuracy: {
        reference: item.referenceText || String(repeatAccuracy.reference || ''),
        missing: String(repeatAccuracy.missing || ''),
        added: String(repeatAccuracy.added || ''),
        note: String(repeatAccuracy.note || '')
      }
    };
  });
  // Provider/model metadata is intentionally kept server-side and omitted from learner feedback.
  result.confidenceNote = [
    result.confidenceNote || '',
    'Bài nói được chuyển thành văn bản trước khi đánh giá. Nhận dạng có thể sai hoặc bỏ sót từ; hãy xem transcript như dữ liệu tham khảo. Điểm không bao gồm phát âm, thanh điệu hoặc tốc độ nói.'
  ].filter(Boolean).join(' ');
  return result;
}

function isDeepSeekConfigured() { return !!API_KEY(); }
module.exports = { gradeHskkWithDeepSeek, isDeepSeekConfigured };
