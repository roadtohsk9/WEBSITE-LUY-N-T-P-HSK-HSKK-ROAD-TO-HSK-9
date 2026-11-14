'use strict';

const https = require('https');

const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
const GEMINI_TIMEOUT_MS = Math.max(15000, Number(process.env.GEMINI_TIMEOUT_MS || 90000));
const apiKey = () => String(process.env.GEMINI_API_KEY || '').trim();

function requestGemini(prompt) {
  const key = apiKey();
  if (!key) return Promise.reject(new Error('Chưa cấu hình GEMINI_API_KEY trên máy chủ.'));
  const body = JSON.stringify({
    model: GEMINI_MODEL,
    input: prompt,
    response_format: { type: 'text', mime_type: 'application/json' },
    generation_config: { temperature: 0.15, max_output_tokens: 12000 }
  });
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/interactions');
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-goog-api-key': key
      }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { return reject(new Error('Google Gemini trả về dữ liệu không hợp lệ.')); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = data?.error?.message || data?.message || `Google Gemini API ${res.statusCode}`;
          const error = new Error(message); error.statusCode = res.statusCode; return reject(error);
        }
        const stepText = Array.isArray(data?.steps)
          ? data.steps.filter(step => step?.type === 'model_output')
              .flatMap(step => Array.isArray(step.content) ? step.content : [])
              .filter(part => part?.type === 'text')
              .map(part => part.text || '').join('\n')
          : '';
        const text = String(data?.output_text || stepText || '').trim();
        if (!text) return reject(new Error(data?.status === 'failed' ? (data?.error?.message || 'Google Gemini không thể chấm bài.') : 'Google Gemini không trả về nội dung chấm điểm.'));
        resolve(text);
      });
    });
    req.on('error', reject);
    req.setTimeout(GEMINI_TIMEOUT_MS, () => req.destroy(new Error(`Google Gemini timeout sau ${Math.round(GEMINI_TIMEOUT_MS / 1000)} giây.`)));
    req.write(body); req.end();
  });
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
  }
  throw new Error('Không thể đọc kết quả JSON từ Google Gemini. Hãy thử nộp lại bài.');
}

function cleanTasks(tasks, answers) {
  const map = answers && typeof answers === 'object' ? answers : {};
  return (Array.isArray(tasks) ? tasks : []).map((q, i) => ({
    number: String(q.number ?? i + 1),
    task: String(q.task || q.type || ''),
    prompt: String(q.text || q.prompt || q.question || ''),
    source: String(q.sourceText || q.source || q.originalText || ''),
    direction: String(q.direction || q.translationDirection || ''),
    minLength: Number(q.min || q.minLength || 0),
    maxLength: Number(q.max || q.maxLength || 0),
    answer: String(map[q.number] ?? map[String(q.number)] ?? '')
  }));
}

function baseInstruction() {
  return `Bạn là giám khảo chuyên môn HSK 7–9. Hãy đánh giá nghiêm túc nhưng công bằng, chỉ dựa trên bài làm được cung cấp. Toàn bộ giải thích, nhận xét và hướng dẫn phải viết bằng tiếng Việt tự nhiên, cụ thể; ví dụ tiếng Trung phải giữ nguyên tiếng Trung và có thể kèm nghĩa tiếng Việt. Không bịa lỗi. Phân biệt lỗi ngữ pháp thật với cách diễn đạt chưa tự nhiên. Chấm theo thang 100 điểm, có tiêu chí, bằng chứng cụ thể, điểm mạnh, điểm cần cải thiện, sửa lỗi và kế hoạch luyện tập. Không tự giả định có rubric chính thức nếu đề không cung cấp rubric. Trả về duy nhất JSON hợp lệ, không markdown.`;
}

async function gradeHskWriting({ tasks, answers, testTitle, volume }) {
  const normalized = cleanTasks(tasks, answers);
  const prompt = `${baseInstruction()}
NHIỆM VỤ: Chấm kỹ năng VIẾT HSK ${volume || '7–9'}.
Xem từng yêu cầu, độ hoàn thành nhiệm vụ, bố cục, mạch lạc, độ chính xác ngữ pháp, vốn từ và văn phong học thuật/ứng dụng phù hợp với đề. Nếu bài gồm văn bản ứng dụng và bài viết theo chủ đề, đánh giá riêng từng phần rồi tính điểm tổng có trọng số hợp lý; nói rõ trọng số đã dùng.
JSON SHAPE:
{"overallScore":0,"levelEstimate":"","model":"${GEMINI_MODEL}","criteria":[{"name":"Hoàn thành yêu cầu","score":0,"max":100,"feedback":""},{"name":"Bố cục và liên kết","score":0,"max":100,"feedback":""},{"name":"Từ vựng và diễn đạt","score":0,"max":100,"feedback":""},{"name":"Ngữ pháp và độ chính xác","score":0,"max":100,"feedback":""}],"taskReviews":[{"number":"1","score":0,"max":100,"summary":"","strengths":[],"improvements":[]}],"strengths":[],"improvements":[],"corrections":[{"original":"","corrected":"","category":"","explanation":"","betterOption":"","context":""}],"vocabularyUpgrades":[{"original":"","suggestion":"","meaning":"","usage":""}],"overallFeedback":"","actionPlan":[""],"takeNotePrompts":[""]}
Giới hạn: tối đa 30 corrections và 15 vocabularyUpgrades. Với nội dung bỏ trống, không tự tạo bài làm và không chấm điểm giả; overallScore phải phản ánh bài nộp trống.
ĐỀ: ${String(testTitle || '')}
DỮ LIỆU BÀI VIẾT:
${JSON.stringify(normalized, null, 2)}`;
  const result = parseJson(await requestGemini(prompt));
  result.overallScore = Math.max(0, Math.min(100, Number(result.overallScore) || 0));
  result.model = GEMINI_MODEL;
  return result;
}

async function gradeHskTranslation({ tasks, answers, testTitle, volume }) {
  const normalized = cleanTasks(tasks, answers);
  const prompt = `${baseInstruction()}
NHIỆM VỤ: Chấm kỹ năng DỊCH HSK ${volume || '7–9'} (có thể Trung→Việt hoặc Việt→Trung; dựa vào hướng dịch ghi trong đề, không được tự đoán khi đề có nêu rõ).
Ưu tiên độ chính xác ý nghĩa, độ đầy đủ, thuật ngữ/từ vựng, ngữ pháp, tự nhiên và đúng văn phong. Với câu dịch tiếng Trung, kiểm tra dùng từ, trật tự câu, kết cấu và văn phong. Với câu dịch tiếng Việt, kiểm tra bảo toàn nghĩa và cách diễn đạt tiếng Việt. Đưa bản dịch tham khảo, nhưng chấp nhận phương án tương đương hợp lý.
JSON SHAPE:
{"overallScore":0,"levelEstimate":"","model":"${GEMINI_MODEL}","criteria":[{"name":"Độ chính xác ý nghĩa","score":0,"max":100,"feedback":""},{"name":"Độ đầy đủ","score":0,"max":100,"feedback":""},{"name":"Ngữ pháp và cấu trúc","score":0,"max":100,"feedback":""},{"name":"Từ vựng và tính tự nhiên","score":0,"max":100,"feedback":""}],"translationReviews":[{"number":"1","score":0,"max":100,"direction":"","source":"","studentVersion":"","referenceVersion":"","feedback":"","errors":[{"original":"","corrected":"","explanation":""}]}],"strengths":[],"improvements":[],"overallFeedback":"","actionPlan":[""],"takeNotePrompts":[""]}
Không phạt khác biệt từ ngữ nếu giữ đúng ý và văn phong. Tối đa 20 lỗi cho toàn bài. Không bịa câu gốc hay phần bài làm bị thiếu.
ĐỀ: ${String(testTitle || '')}
DỮ LIỆU BÀI DỊCH:
${JSON.stringify(normalized, null, 2)}`;
  const result = parseJson(await requestGemini(prompt));
  result.overallScore = Math.max(0, Math.min(100, Number(result.overallScore) || 0));
  result.model = GEMINI_MODEL;
  return result;
}


// HSKK 2.0 / HSK Speaking 3.0: audio-first assessment, kept separate from HSK Writing/Translation.
const hskkSchema = {
  type:'object', additionalProperties:false,
  properties:{
    overallScore:{type:'number',minimum:0,maximum:100},
    criteria:{type:'object',additionalProperties:false,properties:{
      taskCompletion:{type:'number',minimum:0,maximum:100},
      pronunciation:{type:'number',minimum:0,maximum:100},
      fluency:{type:'number',minimum:0,maximum:100},
      grammar:{type:'number',minimum:0,maximum:100},
      vocabulary:{type:'number',minimum:0,maximum:100},
      comprehensibility:{type:'number',minimum:0,maximum:100}
    },required:['taskCompletion','pronunciation','fluency','grammar','vocabulary','comprehensibility']},
    examinerSummary:{type:'string'},
    questionFeedback:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      questionNumber:{type:'integer',minimum:1}, questionType:{type:'string'}, transcript:{type:'string'},
      score:{type:'number',minimum:0,maximum:100}, feedback:{type:'string'},
      strengths:{type:'array',items:{type:'string'},maxItems:3}, improvements:{type:'array',items:{type:'string'},maxItems:5}
    },required:['questionNumber','questionType','transcript','score','feedback','strengths','improvements']},maxItems:30},
    priorityFixes:{type:'array',items:{type:'string'},maxItems:8},
    practicePlan:{type:'array',items:{type:'string'},maxItems:8}
  },required:['overallScore','criteria','examinerSummary','questionFeedback','priorityFixes','practicePlan']
};

function hskkDataUrlPart(value, allowedPrefix='audio/') {
  const m=String(value||'').match(/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if(!m)return null;
  const mimeType=m[1].toLowerCase().split(';')[0];
  if(allowedPrefix && !mimeType.startsWith(allowedPrefix))return null;
  const data=m[2].replace(/\s/g,'');
  if(!data || data.length>24*1024*1024)return null;
  return {mimeType,data};
}

async function requestGeminiAudioParts(parts, options={}) {
  const key=apiKey();
  if(!key)throw new Error('Chưa cấu hình GEMINI_API_KEY trên máy chủ.');
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  let response;
  try {
    response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0.1,maxOutputTokens:options.maxOutputTokens||16000,responseMimeType:'application/json'}}),
      signal:AbortSignal.timeout(Math.max(30000,Number(process.env.GEMINI_TIMEOUT_MS||180000)))
    });
  } catch(err) {
    if(err?.name==='TimeoutError'||err?.name==='AbortError')throw new Error('Gemini mất quá nhiều thời gian để chấm audio HSKK. Vui lòng thử lại.');
    throw new Error(`Không thể kết nối Google Gemini: ${String(err?.message||err)}`);
  }
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){const e=new Error(data?.error?.message||`Google Gemini API ${response.status}`);e.statusCode=response.status;throw e;}
  const text=(data?.candidates?.[0]?.content?.parts||[]).filter(x=>typeof x?.text==='string').map(x=>x.text).join('\n').trim();
  if(!text)throw new Error('Gemini không trả về kết quả chấm HSKK.');
  return {text,model:GEMINI_MODEL};
}

async function gradeHskkSpeaking(items, meta={}) {
  if(!Array.isArray(items)||!items.length)throw new Error('Chưa có bản ghi HSKK.');
  const valid=items.map(i=>({...i,audioPart:hskkDataUrlPart(i.audio),promptAudioPart:hskkDataUrlPart(i.promptAudio),promptImagePart:hskkDataUrlPart(i.promptImage,'image/')}));
  if(!valid.some(i=>i.audioPart))throw new Error('Không tìm thấy file ghi âm HSKK hợp lệ. Vui lòng ghi âm lại.');
  const totalBytes=valid.reduce((sum,x)=>sum+(x.audioPart?Math.floor(x.audioPart.data.length*3/4):0)+(x.promptAudioPart?Math.floor(x.promptAudioPart.data.length*3/4):0)+(x.promptImagePart?Math.floor(x.promptImagePart.data.length*3/4):0),0);
  if(totalBytes>14*1024*1024)throw new Error('Tổng dung lượng audio và hình đề vượt 14 MB. Hãy nén file hoặc giảm thời lượng ghi âm rồi nộp lại.');
  const version=String(meta.version||'2.0')==='3.0'?'3.0':'2.0';
  const level=String(meta.level||'beginner');
  const levelVi={beginner:'Sơ cấp',intermediate:'Trung cấp',advanced:'Cao cấp'}[level]||'Sơ cấp';
  const typeVi={listen_repeat:'Nghe và nhắc lại',listen_answer:'Nghe và trả lời',picture_description:'Mô tả tranh',answer_question:'Trả lời câu hỏi',listen_restate:'Nghe nhắc lại/kể lại',read_aloud:'Đọc thành tiếng'};
  const prompt=`你是HSKK/HSK口语考试中文口语考官。考试版本：${version==='3.0'?'HSK Speaking 3.0':'HSKK 2.0'}；级别：${levelVi}。请直接听取每一道题的学生录音，以普通话口语考试标准进行严格、公平的评估。不要使用IELTS或英语口语评分标准。总分0-100。\n\n评分维度：任务完成度、声母韵母声调及语音清晰度、流利度与停顿、语法准确性、词汇恰当性、整体可理解度。对于听后重复，检查音节、声调、词语和顺序是否准确；对于听后回答，检查是否直接回答、内容是否相关及展开程度；对于看图说话，检查是否覆盖人物、场景、动作、关系和合理细节；对于朗读，检查发音、声调、停顿和节奏。不要因为可理解的地区口音而扣分。\n\n请认真听每段音频，为每道题提供尽可能忠实的中文转写。总评、反馈、优势和建议必须使用越南语；transcript保留中文。若录音缺失或音质不足，明确指出，绝不编造。\n\n只返回符合以下JSON结构的对象：\n${JSON.stringify(hskkSchema)}\n\n题目与录音信息：\n${valid.map((x,i)=>`第${i+1}题；题号=${Number(x.questionNumber||i+1)}；题型=${typeVi[x.questionType]||x.questionType||'口语回答'}；题目/提示=${x.prompt||''}；准备时间=${Number(x.preparationSeconds||0)}秒；作答时间=${Number(x.responseSeconds||0)}秒；浏览器识别文本（仅供参考）=${x.transcript||'无'}；原题音频=${x.promptAudioPart?'已附上':'未附上'}；原题图片=${x.promptImagePart?'已附上':'未附上'}；学生录音=${x.audioPart?'已附上':'未附上'}`).join('\n')}`;
  const parts=[{text:prompt}];
  valid.forEach((x,i)=>{
    if(x.promptAudioPart){parts.push({text:`第${i+1}题原始题目音频。对于听后重复/复述，请以此为标准，与学生回答录音比较。`});parts.push({inlineData:{mimeType:x.promptAudioPart.mimeType,data:x.promptAudioPart.data}})}
    if(x.promptImagePart){parts.push({text:`第${i+1}题原题图片。若题型是看图说话/描述图片，请以图片为依据评价学生描述是否覆盖主体、场景、动作、关系和细节。`});parts.push({inlineData:{mimeType:x.promptImagePart.mimeType,data:x.promptImagePart.data}})}
    if(x.audioPart){parts.push({text:`学生第${i+1}题原始普通话回答录音。题型：${typeVi[x.questionType]||x.questionType||''}；题目：${x.prompt||''}。请直接听录音评价，不要只依赖识别文本。`});parts.push({inlineData:{mimeType:x.audioPart.mimeType,data:x.audioPart.data}})}
  });
  const result=await requestGeminiAudioParts(parts,{maxOutputTokens:16000});
  const parsed=parseJson(result.text);
  if(!parsed.criteria||!Array.isArray(parsed.questionFeedback))throw new Error('Gemini không trả đủ tiêu chí và phản hồi từng câu HSKK.');
  const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));
  for(const k of ['taskCompletion','pronunciation','fluency','grammar','vocabulary','comprehensibility'])parsed.criteria[k]=clamp(parsed.criteria[k]);
  parsed.overallScore=clamp(parsed.overallScore);
  parsed.examMode='hskk';parsed.hskkVersion=version;parsed.hskkLevel=level;parsed.hskkLevelLabel=levelVi;parsed.model=result.model;
  return parsed;
}

module.exports = { gradeHskWriting, gradeHskTranslation, gradeHskkSpeaking, GEMINI_MODEL, isGeminiConfigured: () => !!apiKey() };
