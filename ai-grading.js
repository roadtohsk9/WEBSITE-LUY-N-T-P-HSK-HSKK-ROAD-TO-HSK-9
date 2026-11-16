const https = require('https');

// DeepSeek is server-side only. Never expose DEEPSEEK_API_KEY to the browser.
function deepseekApiKey(){ return String(process.env.DEEPSEEK_API_KEY || '').trim(); }
function envInt(name,fallback,min,max){const n=Number(process.env[name]);return Math.max(min,Math.min(max,Number.isFinite(n)&&n>0?n:fallback));}
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim() || 'deepseek-flash';
const DEEPSEEK_VISION_MODEL = String(process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash').trim() || 'deepseek-flash';
const WRITING_MAX_TOKENS = envInt('DEEPSEEK_WRITING_MAX_TOKENS',8000,3500,10000);
const SPEAKING_MAX_TOKENS = envInt('DEEPSEEK_SPEAKING_MAX_TOKENS',5200,2500,7000);
const REPAIR_MAX_TOKENS = envInt('DEEPSEEK_REPAIR_MAX_TOKENS',4500,2000,7000);
const AI_REQUEST_TIMEOUT_MS = Math.max(15000, Number(process.env.DEEPSEEK_TIMEOUT_MS || 120000));

function roundHalf(n){ return Math.round(Number(n || 0) * 2) / 2; }
function clampBand(n){ return Math.max(0, Math.min(9, roundHalf(n))); }
function isProWriting(ent){ return !!ent && new Date(ent.expiresAt) > new Date() && Array.isArray(ent.skillAccess) && ent.skillAccess.includes('writing'); }
function isProSpeaking(ent){ return !!ent && new Date(ent.expiresAt) > new Date() && Array.isArray(ent.skillAccess) && ent.skillAccess.includes('speaking'); }

const writingSchema = {
  type:'object', additionalProperties:false,
  properties:{
    task1:{type:'object',additionalProperties:false,properties:{criteria:{type:'object',additionalProperties:false,properties:{task_achievement:{type:'number',minimum:0,maximum:9},coherence_cohesion:{type:'number',minimum:0,maximum:9},lexical_resource:{type:'number',minimum:0,maximum:9},grammar:{type:'number',minimum:0,maximum:9}},required:['task_achievement','coherence_cohesion','lexical_resource','grammar']},summary:{type:'string'},strengths:{type:'array',items:{type:'string'},maxItems:5},improvements:{type:'array',items:{type:'string'},maxItems:8},improvement_plan:{type:'array',items:{type:'string'},maxItems:8},vocabulary_upgrades:{type:'array',items:{type:'string'},maxItems:10},errors:{type:'array',items:{type:'object',additionalProperties:false,properties:{original:{type:'string'},corrected:{type:'string'},error_type:{type:'string'},explanation:{type:'string'},better_option:{type:'string'},context:{type:'string'},rule:{type:'string'}},required:['original','corrected','error_type','explanation','better_option','context','rule']},maxItems:40},paragraph_analysis:{type:'array',items:{type:'object',additionalProperties:false,properties:{paragraph:{type:'integer',minimum:1},excerpt:{type:'string'},summary:{type:'string'},grammar_errors:{type:'array',items:{type:'object',additionalProperties:false,properties:{original:{type:'string'},corrected:{type:'string'},location:{type:'string'},rule:{type:'string'},explanation:{type:'string'}},required:['original','corrected','location','rule','explanation']},maxItems:12},vocabulary_notes:{type:'array',items:{type:'string'},maxItems:8},cohesion_notes:{type:'array',items:{type:'string'},maxItems:8},next_step:{type:'string'}},required:['paragraph','excerpt','summary','grammar_errors','vocabulary_notes','cohesion_notes','next_step']},maxItems:10},revised_excerpt:{type:'string'},band_upgrade_plan:{type:'array',items:{type:'string'},maxItems:6}},required:['criteria','summary','strengths','improvements','improvement_plan','vocabulary_upgrades','errors','paragraph_analysis','revised_excerpt','band_upgrade_plan']},
    task2:{type:'object',additionalProperties:false,properties:{criteria:{type:'object',additionalProperties:false,properties:{task_response:{type:'number',minimum:0,maximum:9},coherence_cohesion:{type:'number',minimum:0,maximum:9},lexical_resource:{type:'number',minimum:0,maximum:9},grammar:{type:'number',minimum:0,maximum:9}},required:['task_response','coherence_cohesion','lexical_resource','grammar']},summary:{type:'string'},strengths:{type:'array',items:{type:'string'},maxItems:5},improvements:{type:'array',items:{type:'string'},maxItems:8},improvement_plan:{type:'array',items:{type:'string'},maxItems:8},vocabulary_upgrades:{type:'array',items:{type:'string'},maxItems:10},paragraph_analysis:{type:'array',items:{type:'object',additionalProperties:false,properties:{paragraph:{type:'integer',minimum:1},excerpt:{type:'string'},summary:{type:'string'},grammar_errors:{type:'array',items:{type:'object',additionalProperties:false,properties:{original:{type:'string'},corrected:{type:'string'},location:{type:'string'},rule:{type:'string'},explanation:{type:'string'}},required:['original','corrected','location','rule','explanation']},maxItems:12},vocabulary_notes:{type:'array',items:{type:'string'},maxItems:8},cohesion_notes:{type:'array',items:{type:'string'},maxItems:8},next_step:{type:'string'}},required:['paragraph','excerpt','summary','grammar_errors','vocabulary_notes','cohesion_notes','next_step']},maxItems:10},errors:{type:'array',items:{type:'object',additionalProperties:false,properties:{original:{type:'string'},corrected:{type:'string'},error_type:{type:'string'},explanation:{type:'string'},better_option:{type:'string'},context:{type:'string'},rule:{type:'string'}},required:['original','corrected','error_type','explanation','better_option','context','rule']},maxItems:60},revised_excerpt:{type:'string'},band_upgrade_plan:{type:'array',items:{type:'string'},maxItems:6}},required:['criteria','summary','strengths','improvements','improvement_plan','vocabulary_upgrades','errors','paragraph_analysis','revised_excerpt','band_upgrade_plan']},
    examiner_summary:{type:'string'},priority_fixes:{type:'array',items:{type:'string'},maxItems:8},style_flags:{type:'array',items:{type:'string'},maxItems:8}
  },required:['task1','task2','examiner_summary','priority_fixes','style_flags']
};

const speakingSchema = {
  type:'object', additionalProperties:false,
  properties:{
    criteria:{type:'object',additionalProperties:false,properties:{fluency_coherence:{type:'number',minimum:0,maximum:9},lexical_resource:{type:'number',minimum:0,maximum:9},grammar:{type:'number',minimum:0,maximum:9},pronunciation:{type:'number',minimum:0,maximum:9}},required:['fluency_coherence','lexical_resource','grammar','pronunciation']},
    part_feedback:{type:'array',items:{type:'object',additionalProperties:false,properties:{part:{type:'integer',minimum:1,maximum:3},summary:{type:'string'},strengths:{type:'array',items:{type:'string'},maxItems:4},improvements:{type:'array',items:{type:'string'},maxItems:6},transcript:{type:'string'}},required:['part','summary','strengths','improvements','transcript']},maxItems:3},
    pronunciation_issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{word:{type:'string'},suggested:{type:'string'},explanation:{type:'string'}},required:['word','suggested','explanation']},maxItems:30},
    detailed_corrections:{type:'array',items:{type:'object',additionalProperties:false,properties:{original:{type:'string'},improved:{type:'string'},reason:{type:'string'},category:{type:'string'},context:{type:'string'},rule:{type:'string'}},required:['original','improved','reason','category','context','rule']},maxItems:40},upgraded_response:{type:'string'},action_plan:{type:'array',items:{type:'string'},maxItems:8},examiner_summary:{type:'string'},priority_fixes:{type:'array',items:{type:'string'},maxItems:8}
  },required:['criteria','part_feedback','pronunciation_issues','examiner_summary','priority_fixes']
};

function extractText(data){
  return data?.choices?.[0]?.message?.content || '';
}

const writingOutputContract = `JSON only. Keep these keys and use concise, evidence-based Vietnamese feedback; English examples remain English.
{"task1":{"criteria":{"task_achievement":0,"coherence_cohesion":0,"lexical_resource":0,"grammar":0},"summary":"","strengths":[],"improvements":[],"improvement_plan":[],"vocabulary_upgrades":[],"errors":[{"original":"","corrected":"","error_type":"","explanation":"","better_option":"","context":"","rule":""}],"paragraph_analysis":[{"paragraph":1,"excerpt":"","summary":"","grammar_errors":[{"original":"","corrected":"","location":"","rule":"","explanation":""}],"vocabulary_notes":[],"cohesion_notes":[],"next_step":""}],"revised_excerpt":"","band_upgrade_plan":[]},"task2":{"criteria":{"task_response":0,"coherence_cohesion":0,"lexical_resource":0,"grammar":0},"summary":"","strengths":[],"improvements":[],"improvement_plan":[],"vocabulary_upgrades":[],"errors":[],"paragraph_analysis":[],"revised_excerpt":"","band_upgrade_plan":[]},"examiner_summary":"","priority_fixes":[],"style_flags":[]}`;
const speakingOutputContract = `JSON only. Use Vietnamese explanations and English examples. Keep every field concise and evidence-based.
{"criteria":{"fluency_coherence":0,"lexical_resource":0,"grammar":0,"pronunciation":0},"part_feedback":[{"part":1,"summary":"","strengths":[],"improvements":[],"transcript":""}],"pronunciation_issues":[],"detailed_corrections":[{"original":"","improved":"","reason":"","category":"","context":"","rule":""}],"upgraded_response":"","action_plan":[],"examiner_summary":"","priority_fixes":[]}`;

function callDeepSeekOnce(payload, model){
  const key=deepseekApiKey();
  if(!key) return Promise.reject(new Error('DEEPSEEK_API_KEY is not configured on the server.'));
  const url='https://api.deepseek.com/chat/completions';
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify({...payload,model:model||DEEPSEEK_MODEL,thinking:{type:'disabled'}});
    const req=https.request(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}},res=>{
      let data=''; res.on('data',c=>data+=c);
      res.on('end',()=>{
        try{
          const j=JSON.parse(data);
          if(res.statusCode>=200&&res.statusCode<300&&j?.usage){
            const u=j.usage, details=u.prompt_tokens_details||{}, out=u.completion_tokens_details||{};
            console.info('[DEEPSEEK_TOKEN_USAGE]',JSON.stringify({model:j.model||model||DEEPSEEK_MODEL,input:u.prompt_tokens||0,output:u.completion_tokens||0,total:u.total_tokens||0,cacheHit:u.prompt_cache_hit_tokens??details.cached_tokens??0,cacheMiss:u.prompt_cache_miss_tokens??Math.max(0,(u.prompt_tokens||0)-(u.prompt_cache_hit_tokens??details.cached_tokens??0)),reasoning:out.reasoning_tokens||0}));
          }
          if(res.statusCode<200||res.statusCode>=300){
            const msg=j?.error?.message||`DeepSeek API ${res.statusCode}`;
            const e=new Error(msg); e.httpStatus=res.statusCode; e.deepseekResponse=j; return reject(e);
          }
          resolve(j);
        }catch(e){ reject(new Error('Invalid DeepSeek response from server.')); }
      });
    });
    req.on('error',reject);
    req.setTimeout(AI_REQUEST_TIMEOUT_MS,()=>req.destroy(new Error(`DeepSeek request timed out after ${Math.round(AI_REQUEST_TIMEOUT_MS/1000)} seconds.`)));
    req.write(body); req.end();
  });
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function isRetryable(err){return !!err&&(err.httpStatus===429||err.httpStatus===500||err.httpStatus===502||err.httpStatus===503||err.httpStatus===504||/rate.?limit|overloaded|temporar|try again/i.test(String(err.message||'')));}
async function callDeepSeek(payload,model){
  let lastErr;
  for(let i=0;i<3;i++){
    try{return await callDeepSeekOnce(payload,model);}catch(err){lastErr=err;if(!isRetryable(err))throw err;if(i<2)await sleep(1200*Math.pow(2,i)+Math.random()*400);}
  }
  throw lastErr;
}

function parseModelJson(text){
  if(text && typeof text==='object' && !Array.isArray(text)) return text;
  let raw=String(text||'').trim();
  if(!raw)throw new Error('DeepSeek returned an empty grading response.');
  // Some DeepSeek responses may contain reasoning/fences around the JSON.
  raw=raw.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  const candidates=[raw,raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()];
  for(const candidate of candidates){
    try{return JSON.parse(candidate)}catch{}
  }
  // Extract the first balanced JSON object without being confused by braces inside strings.
  const source=candidates[1]||candidates[0];
  let start=-1,depth=0,inString=false,escaped=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(start<0){if(ch==='{'){start=i;depth=1;} continue;}
    if(inString){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--;if(depth===0){
      const candidate=source.slice(start,i+1);
      try{return JSON.parse(candidate)}catch{}
      break;
    }}
  }
  const e=new Error('DeepSeek returned invalid grading JSON.'); e.rawModelOutput=raw; throw e;
}

async function repairModelJson(raw,schema,model){
  const repairPrompt=`Convert the following AI grading output into ONE valid JSON object matching the required schema. Preserve the original data and wording as much as possible. Do not add invented grading evidence. Fix only JSON formatting, quoting, commas, escaping, or structural issues. Return JSON only, with no markdown or explanation.\n\nREQUIRED SCHEMA:\n${JSON.stringify(schema)}\n\nBROKEN OUTPUT:\n${String(raw||'').slice(0,90000)}`;
  const data=await callDeepSeek({messages:[
    {role:'system',content:'You are a JSON repair service. Output only valid JSON.'},
    {role:'user',content:repairPrompt}
  ],response_format:{type:'json_object'},temperature:0,max_tokens:REPAIR_MAX_TOKENS},model);
  return parseModelJson(extractText(data));
}

function buildWritingPrompt({task1Prompt,task1Answer,task1Words,task2Prompt,task2Answer,task2Words}){
  return `You are EIT IELTS AI Examiner, a strict and evidence-based IELTS Writing teacher. Use the official IELTS public band-descriptor logic for Task Achievement/Task Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy. Task 2 counts twice as much as Task 1.

STRICT MARKING: do not inflate scores to encourage the student and do not invent faults to be harsh. Award only whole or half bands. Require descriptor-level evidence for higher bands. Distinguish 6.0 vs 6.5, 6.5 vs 7.0, 7.0 vs 7.5 and 7.5 vs 8.0. A recurring weakness that limits a criterion must cap that criterion. Check every sentence for meaningful grammar, article, tense, agreement, preposition, word form, collocation, lexical precision, spelling, punctuation, cohesion, register and naturalness. Check task-specific omissions, weak overview/key features in Task 1, and incomplete or underdeveloped position/support in Task 2. Do not flag acceptable alternatives merely because another wording is preferred.

LANGUAGE OF FEEDBACK: Write ALL explanatory feedback in natural, clear VIETNAMESE. Keep the student's original English, corrected English, better English, vocabulary items, and revised excerpt in ENGLISH. Do not translate the student's English examples. Make Vietnamese explanations teacher-like and concrete, not vague.

DETAILED CORRECTION: find as many genuine, useful errors as the answer contains within the schema limits. Quote the student's exact wording in original. For each error give corrected, error_type IN VIETNAMESE, a detailed Vietnamese explanation, a better option when useful, the CONTEXT where the form is appropriate, and the RULE/LOGIC explaining why. Explicitly explain meaning, grammar logic, collocation/register, and when the alternative should or should not be used. Do not manufacture errors. If wording is acceptable but less precise, label it as a weakness/suggestion rather than an error.

PARAGRAPH-BY-PARAGRAPH REVIEW: split each student's Task 1 and Task 2 answer into its real paragraphs. Create paragraph_analysis for EVERY paragraph. Quote a short exact excerpt. Then identify concrete grammar errors inside that paragraph, giving the exact location/sentence, original wording, correction, rule and explanation. Also note important vocabulary/collocation and cohesion issues only when they genuinely occur. Do not merge paragraph findings into one global block.

TEACHING DEPTH: For every major weakness, explain WHAT is wrong, WHY it matters for IELTS, HOW to fix it, and WHEN to use the corrected form. Give short examples when helpful. Include strengths, high-impact improvements, vocabulary upgrades with Vietnamese meaning + usage context, a practical improvement plan, a band-upgrade plan and a revised excerpt preserving the student's meaning. Be a demanding IELTS teacher, not a friendly score generator.

${writingOutputContract}
LIMITS: strengths <=3; improvements <=5; errors <=12 for Task 1 and <=16 for Task 2; paragraph_analysis must cover each real paragraph (normally <=6 per task); <=3 grammar errors per paragraph; <=5 vocabulary upgrades; <=4 improvement and band-plan items. Never invent errors.

TASK 1 PROMPT:\n${task1Prompt}\n\nTASK 1 WORD COUNT: ${task1Words}\nTASK 1 ANSWER:\n${task1Answer||'(no answer)'}\n\nTASK 2 PROMPT:\n${task2Prompt}\n\nTASK 2 WORD COUNT: ${task2Words}\nTASK 2 ANSWER:\n${task2Answer||'(no answer)'}`;
}

function addTextPart(parts,text){parts.push({type:'text',text:String(text||'')});}
function addImagePart(parts,data,label){const m=String(data||'').match(/^data:([^;]+);base64,(.+)$/);if(m){addTextPart(parts,`REFERENCE IMAGE — ${label}`);parts.push({type:'image_url',image_url:{url:`data:${m[1]};base64,${m[2]}`}});}}

async function gradeWriting(input){
  const content=[{type:'text',text:buildWritingPrompt(input)}];
  addImagePart(content,input.taskImages?.task1,'Task 1 chart/diagram');
  addImagePart(content,input.taskImages?.task2,'Task 2 prompt image');
  const hasImage=content.some(x=>x.type==='image_url');
  const model=hasImage?DEEPSEEK_VISION_MODEL:DEEPSEEK_MODEL;
  const payload={messages:[{role:'user',content}],response_format:{type:'json_object'},temperature:0.1,max_tokens:WRITING_MAX_TOKENS};
  let data;
  try{data=await callDeepSeek(payload,model);}catch(err){
    if(hasImage){
      // If the experimental vision endpoint is unavailable, preserve the grading flow by retrying text-only.
      const textOnly=[{type:'text',text:buildWritingPrompt(input)+`\n\nThe reference images could not be processed. Judge from the prompt text only and explicitly mention any visual limitation in examiner_summary.`}];
      data=await callDeepSeek({messages:[{role:'user',content:textOnly}],response_format:{type:'json_object'},temperature:0.1,max_tokens:WRITING_MAX_TOKENS},DEEPSEEK_MODEL);
    }else throw err;
  }
  const text=extractText(data); let parsed; try{parsed=parseModelJson(text)}catch(err){ parsed=await repairModelJson(err.rawModelOutput||text,writingSchema,model); }
  const t1=parsed.task1.criteria,t2=parsed.task2.criteria;
  const t1Avg=(t1.task_achievement+t1.coherence_cohesion+t1.lexical_resource+t1.grammar)/4;
  const t2Avg=(t2.task_response+t2.coherence_cohesion+t2.lexical_resource+t2.grammar)/4;
  parsed.task1.band=clampBand(t1Avg);parsed.task2.band=clampBand(t2Avg);parsed.overallBand=clampBand((t1Avg+2*t2Avg)/3);parsed.weighting='Task 2 carries twice the weight of Task 1.';delete parsed.model;return parsed;
}

function buildSpeakingPrompt(items){
  const intro=`You are EIT IELTS Speaking AI Examiner. You are grading a transcript, not hearing the original audio. Assess Fluency & Coherence, Lexical Resource, and Grammatical Range & Accuracy strictly from the transcript. For Pronunciation, do NOT invent evidence: use the supplied pronunciation score only if a reliable transcript/acoustic signal is available; otherwise set pronunciation to 0.0 and clearly explain that pronunciation requires audio-capable assessment. Accent itself is never a penalty when intelligibility is strong.

LANGUAGE OF FEEDBACK: Write ALL explanatory feedback in natural, clear VIETNAMESE. Keep transcript, original English phrases, improved English phrases, and upgraded responses in ENGLISH. Pronunciation explanations may use Vietnamese.

STRICT CALIBRATION: whole or half bands only. Look for hesitation/repetition/self-correction reflected in the transcript, limited development, lexical imprecision/repetition, grammar range and recurring errors. Do not inflate scores. Give exact sentence-level corrections and an upgraded response. For every correction explain WHY, the grammar/lexical LOGIC, the CONTEXT in which the form is natural, and WHEN NOT to use it. Preserve the student's meaning. Return JSON only.\n\n${speakingOutputContract}
LIMITS: for each part give <=3 strengths and <=4 improvements; <=12 genuine corrections total; <=5 action steps and <=5 priority fixes. Keep explanations to 1-2 short sentences. Never invent evidence.\n\n`;
  return intro+items.map(i=>`PART ${i.part} · QUESTION:\n${i.question}\nTRANSCRIPT:\n${i.transcript||'(no transcript available)'}\n`).join('\n');
}

async function gradeSpeaking(items){
  if(!items.length || items.every(i=>!String(i.transcript||'').trim())) throw new Error('DeepSeek Speaking grading needs a browser transcript. Please use Chrome/Edge with microphone permission and record again.');
  const data=await callDeepSeek({messages:[{role:'user',content:buildSpeakingPrompt(items)}],response_format:{type:'json_object'},temperature:0.1,max_tokens:SPEAKING_MAX_TOKENS},DEEPSEEK_MODEL);
  let parsed; const text=extractText(data); try{parsed=parseModelJson(text)}catch(err){parsed=await repairModelJson(err.rawModelOutput||text,speakingSchema,DEEPSEEK_MODEL);} const c=parsed.criteria;
  const proxy=clampBand((c.fluency_coherence+c.lexical_resource+c.grammar)/3);
  c.pronunciation=proxy;
  parsed.pronunciationProxy=true;
  parsed.audioLimitation='Lượt chấm này phân tích transcript văn bản, không đo trực tiếp chất lượng âm thanh. Vì vậy, nhận xét về phát âm chỉ là tham khảo và không phải điểm phát âm dựa trên âm học.';
  parsed.overallBand=proxy; delete parsed.model; return parsed;
}

module.exports={gradeWriting,gradeSpeaking,isProWriting,isProSpeaking,DEEPSEEK_MODEL};
