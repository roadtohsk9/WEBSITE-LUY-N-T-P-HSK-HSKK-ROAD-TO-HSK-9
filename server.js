const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const AdmZip = require('adm-zip');
const { URL } = require('url');
const { Pool } = require('pg');
const { gradeWriting, gradeSpeaking, isProWriting, isProSpeaking } = require('./ai-grading');
const { gradeHskkWithDeepSeek, isDeepSeekConfigured: isHskkAiConfigured } = require('./hskk-deepseek');
const { gradeHskWriting, gradeHskTranslation, gradeHsk6SummaryWriting } = require('./hsk-writing-grading');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '27092007');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');
const TOKENS = new Map();
const CANDIDATE_TOKENS = new Map();
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const PRIVATE_DOC_DIR = path.join(ROOT, '.private-documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_DOC_DIR, { recursive: true });

if (!DATABASE_URL) console.warn('WARNING: DATABASE_URL/POSTGRES_URL is not set. PostgreSQL mode is unavailable.');
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 5 }) : null;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readLegacyDB(){ try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch { return []; } }
function json(res,status,payload){ const body=JSON.stringify(payload); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization'}); res.end(body); }
function body(req){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c;if(s.length>20e6){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(new Error('Invalid JSON request'))}});req.on('error',reject)}); }
function tokenFrom(req){ return (req.headers.authorization||'').replace(/^Bearer\s+/,'').trim(); }
function admin(req){ const t=tokenFrom(req); return !!(t && TOKENS.has(t) && TOKENS.get(t)>Date.now()); }
function candidate(req){ const t=tokenFrom(req); const c=t && CANDIDATE_TOKENS.get(t); if(!c || c.expiresAt<Date.now()) return null; return c.user; }
function hashPassword(password){ const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(String(password),salt,64).toString('hex'); return `${salt}:${hash}`; }
function verifyPassword(password, stored){ try { const [salt,hash]=String(stored).split(':'); if(!salt||!hash)return false; const a=Buffer.from(hash,'hex'); const b=crypto.scryptSync(String(password),salt,64); return a.length===b.length && crypto.timingSafeEqual(a,b); } catch { return false; } }
function safeName(s){return String(s||'').replace(/[^a-zA-Z0-9._-]/g,'_')}

async function dbQuery(text, params=[]){ if(!pool) throw new Error('Database is not configured. Please add DATABASE_URL in Vibe Host.'); return pool.query(text,params); }

async function seedPracticeDemos(){
  const seedPath=path.join(DATA_DIR,'practice_seed.json');
  if(!fs.existsSync(seedPath) || !pool) return;
  let pack; try{pack=JSON.parse(fs.readFileSync(seedPath,'utf8'));}catch(e){console.error('Practice seed read failed:',e);return;}
  for(const t of (pack.tests||[])){
    const audioUrl=t.skill==='listening' && Number(t.volume)===9 && Number(t.testNo)===1 && fs.existsSync(path.join(UPLOAD_DIR,'vol9-test1-listening.mp3')) ? '/uploads/vol9-test1-listening.mp3' : String(t.audioUrl||'');
    await dbQuery(`INSERT INTO practice_tests(id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,TRUE)
      ON CONFLICT(skill,volume,test_no) DO UPDATE SET title=EXCLUDED.title,question_type=EXCLUDED.question_type,duration_minutes=EXCLUDED.duration_minutes,total_questions=EXCLUDED.total_questions,content=EXCLUDED.content,answer_key=EXCLUDED.answer_key,explanations=EXCLUDED.explanations,audio_url=EXCLUDED.audio_url,source_file=EXCLUDED.source_file,source_url=EXCLUDED.source_url,published=TRUE,updated_at=NOW() WHERE EXCLUDED.source_file LIKE 'HSK3_H310%_PDF_IMPORT' AND practice_tests.source_file IS DISTINCT FROM EXCLUDED.source_file`,
      [crypto.randomUUID(),String(t.skill).toLowerCase(),Number(t.volume),Number(t.testNo),t.title||'',t.questionType||'',Number(t.durationMinutes||60),Number(t.totalQuestions||40),JSON.stringify({questions:t.questions||[],question_groups:t.question_groups||[],passages:t.passages||[],sections:t.sections||[],unitImages:t.unitImages||[],audioUrl:t.audioUrl||'',rawText:t.rawText||'',instructions:t.instructions||'',transcript:t.transcript||''}),JSON.stringify(t.answerKey||{}),JSON.stringify(t.explanations||{}),audioUrl,t.sourceFile||'VOL9 demo import',t.sourceUrl||'']);
  }
}

async function seedHsk6Papers(){
  const seedPath=path.join(DATA_DIR,'hsk6_papers_seed.json');
  if(!pool || !fs.existsSync(seedPath)) return;
  let pack;
  try{pack=JSON.parse(fs.readFileSync(seedPath,'utf8'));}
  catch(e){console.error('HSK6 paper seed read failed:',e);return;}
  let inserted=0, skipped=0;
  for(const t of (pack.tests||[])){
    try{
      const result=await dbQuery(`INSERT INTO practice_tests(
        id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,
        content,answer_key,explanations,audio_url,source_file,source_url,
        series_label,display_test_label,card_label,card_subtitle,status_label,button_label,cover_url,published
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE)
      ON CONFLICT(skill,volume,test_no) DO NOTHING`,[
        crypto.randomUUID(),String(t.skill||'reading').toLowerCase(),Number(t.volume||6),Number(t.testNo),String(t.title||''),String(t.questionType||'Multiple Choice'),Number(t.durationMinutes||50),Number(t.totalQuestions||50),JSON.stringify(t.content||{}),JSON.stringify(t.answerKey||{}),JSON.stringify(t.explanations||{}),String(t.audioUrl||''),String(t.sourceFile||''),String(t.sourceUrl||''),String(t.seriesLabel||'HSK 6'),String(t.displayTestLabel||`Test ${t.testNo}`),String(t.cardLabel||String(t.skill||'').toUpperCase()),String(t.cardSubtitle||''),String(t.statusLabel||'Chưa hoàn thành'),String(t.buttonLabel||'Làm bài'),String(t.coverUrl||'')
      ]);
      if(result.rowCount) inserted++; else skipped++;
    }catch(e){console.error('HSK6 paper seed failed for',t.title||t.testNo,e?.message||e);}
  }
  if(inserted||skipped) console.log(`HSK6 papers seed: ${inserted} inserted, ${skipped} existing rows skipped.`);
}


async function seedHsk5Papers(){
  const seedPath=path.join(DATA_DIR,'hsk5_full_papers_seed.json');
  if(!pool || !fs.existsSync(seedPath)) return;
  let pack;
  try{pack=JSON.parse(fs.readFileSync(seedPath,'utf8'));}
  catch(e){console.error('HSK5 full paper seed read failed:',e);return;}
  let inserted=0,updated=0,skipped=0;
  for(const t of (pack.tests||[])){
    try{
      const result=await dbQuery(`INSERT INTO practice_tests(
        id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,
        content,answer_key,explanations,audio_url,source_file,source_url,
        series_label,display_test_label,card_label,card_subtitle,status_label,button_label,cover_url,published
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE)
      ON CONFLICT(skill,volume,test_no) DO UPDATE SET
        title=EXCLUDED.title,question_type=EXCLUDED.question_type,duration_minutes=EXCLUDED.duration_minutes,
        total_questions=EXCLUDED.total_questions,content=EXCLUDED.content,answer_key=EXCLUDED.answer_key,
        explanations=EXCLUDED.explanations,
        audio_url=CASE WHEN COALESCE(NULLIF(EXCLUDED.audio_url,''),'')<>'' THEN EXCLUDED.audio_url ELSE COALESCE(practice_tests.audio_url,'') END,
        source_file=EXCLUDED.source_file,source_url=EXCLUDED.source_url,series_label=EXCLUDED.series_label,
        display_test_label=EXCLUDED.display_test_label,card_label=EXCLUDED.card_label,card_subtitle=EXCLUDED.card_subtitle,
        status_label=EXCLUDED.status_label,button_label=EXCLUDED.button_label,cover_url=EXCLUDED.cover_url,
        published=TRUE,updated_at=NOW()
      WHERE EXCLUDED.source_file LIKE 'HSK5_FULL_PDF_IMPORT_%'`,[
        crypto.randomUUID(),String(t.skill||'reading').toLowerCase(),Number(t.volume||5),Number(t.testNo),String(t.title||''),
        String(t.questionType||'Multiple Choice'),Number(t.durationMinutes||45),Number(t.totalQuestions||45),
        JSON.stringify(t.content||{}),JSON.stringify(t.answerKey||{}),JSON.stringify(t.explanations||{}),String(t.audioUrl||''),
        String(t.sourceFile||''),String(t.sourceUrl||''),String(t.seriesLabel||'HSK5 · Đề chính thức'),String(t.displayTestLabel||`Test ${t.testNo}`),
        String(t.cardLabel||String(t.skill||'').toUpperCase()),String(t.cardSubtitle||''),String(t.statusLabel||'Sẵn sàng luyện tập'),
        String(t.buttonLabel||'Làm bài'),String(t.coverUrl||'')
      ]);
      if(result.rowCount){
        const action=String(result.command||'');
        if(action==='INSERT') inserted++; else updated++;
      } else skipped++;
    }catch(e){console.error('HSK5 paper seed failed for',t.title||t.testNo,e?.message||e);}
  }
  if(inserted||updated||skipped) console.log(`HSK5 full papers seed: ${inserted} inserted, ${updated} updated, ${skipped} unchanged.`);
}

async function seedCourses(){
  if(!pool) return;
  const seeds=[
    {slug:'speaking-8-5',skill:'speaking',title:'Học tư duy Speaking với giáo viên 8.5 Speaking',description:'Tư duy triển khai ý, phản xạ và chiến lược Speaking theo định hướng 8.5.',price:500000,student_count:78,poster_url:'course-thumbnails/HINH1.jpg'},
    {slug:'writing-cap-toc-5-6',skill:'writing',title:'Writing cấp tốc · Band 5–6',description:'Củng cố cấu trúc, ý tưởng và cách viết an toàn để kéo band từ 5 lên 6.',price:500000,student_count:56,poster_url:'course-thumbnails/HINH2.jpg'},
    {slug:'writing-cap-toc-6-7',skill:'writing',title:'Writing cấp tốc · Band 6–7',description:'Tăng chất lượng Task 1 & Task 2, phát triển lập luận và kiểm soát lỗi để hướng tới band 7.',price:500000,student_count:34,poster_url:'course-thumbnails/HINH3.jpg'},
    {slug:'listening-core-skills',skill:'listening',title:'Kỹ năng ôn Listening',description:'Chiến thuật nghe, bắt keyword, xử lý distractor và luyện theo từng Section.',price:500000,student_count:67,poster_url:'course-thumbnails/HINH4.jpg'},
    {slug:'combo-writing-speaking',skill:'combo',title:'Combo Writing + Speaking',description:'Kết hợp 2 kỹ năng trọng tâm với lộ trình tối ưu, tiết kiệm chi phí và dễ theo dõi tiến bộ.',price:750000,student_count:41,poster_url:'course-thumbnails/HINH5.jpg'},
    {slug:'combo-speaking-writing-listening',skill:'combo',title:'Combo Speaking Writing Listening',description:'Lộ trình 3 kỹ năng toàn diện, phù hợp cho học viên muốn học đồng thời và tiết kiệm hơn.',price:1200000,student_count:29,poster_url:'course-thumbnails/HINH6.jpg'}
  ];
  for(const c of seeds){
    const exists=await dbQuery('SELECT id,price,student_count,poster_url FROM course_posts WHERE slug=$1 LIMIT 1',[c.slug]);
    if(!exists.rows.length){
      await dbQuery('INSERT INTO course_posts(id,skill,title,description,poster_url,link_url,slug,price,student_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[crypto.randomUUID(),c.skill,c.title,c.description,c.poster_url,'',c.slug,c.price,c.student_count]);
    } else {
      const row=exists.rows[0];
      if((c.slug==='combo-writing-speaking' || c.slug==='combo-speaking-writing-listening') && Number(row.price||0)===500000){
        await dbQuery('UPDATE course_posts SET skill=$1,title=$2,description=$3,price=$4,student_count=$5 WHERE slug=$6',[c.skill,c.title,c.description,c.price,c.student_count,c.slug]);
      }
      if(!row.poster_url){
        await dbQuery('UPDATE course_posts SET poster_url=$1 WHERE slug=$2',[c.poster_url,c.slug]);
      }
    }
  }
}

function readRawBody(req, maxBytes=2*1024*1024){
  return new Promise((resolve,reject)=>{
    const chunks=[]; let size=0;
    req.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(new Error('Webhook payload too large'));req.destroy();return;}chunks.push(chunk);});
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
function makeVietQrUrl(settings, amount, transferCode){
  const bankCode=String(settings?.bank_code||'').trim();
  const account=String(settings?.account_number||'').trim();
  if(!bankCode||!account)return String(settings?.qr_url||'');
  const params=new URLSearchParams({amount:String(Math.round(Number(amount)||0)),addInfo:String(transferCode||''),accountName:String(settings.account_name||'')});
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(account)}-compact2.png?${params.toString()}`;
}
async function fulfillStoreOrder(orderId, transaction){
  if(!pool)throw new Error('Database is unavailable');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const order=(await client.query('SELECT * FROM store_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
    if(!order){await client.query('ROLLBACK');return {ok:false,reason:'order_not_found'};}
    if(order.status==='paid'){await client.query('COMMIT');return {ok:true,alreadyPaid:true};}
    const txnInsert=await client.query(`INSERT INTO payment_transactions(provider,provider_transaction_id,order_id,amount,raw_payload)
      VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(provider,provider_transaction_id) DO NOTHING RETURNING id`,[
      String(transaction.provider||'sepay'),String(transaction.id),order.id,Number(transaction.amount||0),JSON.stringify(transaction.raw||{})
    ]);
    if(!txnInsert.rowCount){await client.query('COMMIT');return {ok:true,duplicate:true};}
    await client.query(`UPDATE store_orders SET status='paid',paid_at=NOW(),provider_transaction_id=$2,updated_at=NOW() WHERE id=$1`,[order.id,String(transaction.id)]);
    const items=(await client.query('SELECT * FROM store_order_items WHERE order_id=$1',[order.id])).rows;
    const proItems=items.filter(x=>x.product_type==='pro');
    if(proItems.length && order.user_id){
      const skillSet=new Set(); let totalDays=0;
      const current=(await client.query(`SELECT skill_access,expires_at,status FROM pro_entitlements WHERE user_id=$1 LIMIT 1`,[order.user_id])).rows[0];
      if(current && current.status==='active' && new Date(current.expires_at)>new Date()){
        (Array.isArray(current.skill_access)?current.skill_access:[]).forEach(s=>skillSet.add(String(s)));
      }
      for(const item of proItems){
        (Array.isArray(item.skill_access)?item.skill_access:[]).forEach(s=>skillSet.add(String(s)));
        totalDays+=Math.max(1,Number(item.duration_days||30))*Math.max(1,Number(item.quantity||1));
      }
      const skills=[...skillSet].filter(x=>ALL_SKILLS.includes(x));
      if(skills.length){
        await client.query(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at)
          VALUES($1,$2,$3,$4::jsonb,'store_purchase','active',NOW(),NOW()+make_interval(days=>$5))
          ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,source='store_purchase',status='active',
          starts_at=CASE WHEN pro_entitlements.expires_at<=NOW() THEN NOW() ELSE pro_entitlements.starts_at END,
          expires_at=GREATEST(pro_entitlements.expires_at,NOW())+make_interval(days=>$5),updated_at=NOW()`,
          [crypto.randomUUID(),order.user_id,Math.min(4,skills.length),JSON.stringify(skills),totalDays]);
      }
    }
    for(const item of items.filter(x=>x.product_type==='document' && x.product_id && order.user_id)){
      await client.query(`INSERT INTO document_access(id,user_id,product_id,order_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_id) DO NOTHING`,[crypto.randomUUID(),order.user_id,item.product_id,order.id]);
    }
    await client.query('COMMIT');
    return {ok:true,activatedPro:proItems.length>0,unlockedDocuments:items.filter(x=>x.product_type==='document').length};
  }catch(err){try{await client.query('ROLLBACK')}catch{};throw err;}finally{client.release();}
}
async function fulfillProOrder(orderId, transaction){
  if(!pool)throw new Error('Database is unavailable');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const order=(await client.query('SELECT * FROM pro_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
    if(!order){await client.query('ROLLBACK');return {ok:false,reason:'order_not_found'};}
    if(order.status==='approved'){
      await client.query('COMMIT');
      return {ok:true,alreadyPaid:true,activatedPro:true};
    }
    const userId=order.user_id || (await client.query(
      `SELECT id FROM users WHERE lower(trim(email))=lower(trim($1)) ORDER BY created_at DESC LIMIT 1`,[order.email]
    )).rows[0]?.id || null;
    if(!userId){await client.query('ROLLBACK');return {ok:false,reason:'account_not_found'};}
    const skillAccess=normalizeSkills(Array.isArray(order.skill_access)?order.skill_access:[]);
    if(!skillAccess.length){await client.query('ROLLBACK');return {ok:false,reason:'invalid_skill_access'};}
    const txnInsert=await client.query(`INSERT INTO pro_payment_transactions(provider,provider_transaction_id,pro_order_id,amount,raw_payload)
      VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(provider,provider_transaction_id) DO NOTHING RETURNING id`,[
      String(transaction.provider||'sepay'),String(transaction.id),order.id,Number(transaction.amount||0),JSON.stringify(transaction.raw||{})
    ]);
    if(!txnInsert.rowCount){await client.query('COMMIT');return {ok:true,duplicate:true};}
    const current=(await client.query('SELECT skill_access,expires_at,status FROM pro_entitlements WHERE user_id=$1 LIMIT 1',[userId])).rows[0];
    const skillSet=new Set(skillAccess);
    if(current && current.status==='active' && new Date(current.expires_at)>new Date()){
      (Array.isArray(current.skill_access)?current.skill_access:[]).forEach(x=>skillSet.add(String(x)));
    }
    const mergedSkills=[...skillSet].filter(x=>ALL_SKILLS.includes(x));
    const days=Math.max(1,Number(order.duration_days||30));
    if(!mergedSkills.length){await client.query('ROLLBACK');return {ok:false,reason:'invalid_skill_access'};}
    await client.query(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at)
      VALUES($1,$2,$3,$4::jsonb,'sepay_pro_purchase','active',NOW(),NOW()+make_interval(days=>$5))
      ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,source='sepay_pro_purchase',status='active',
      starts_at=CASE WHEN pro_entitlements.expires_at<=NOW() THEN NOW() ELSE pro_entitlements.starts_at END,
      expires_at=GREATEST(pro_entitlements.expires_at,NOW())+make_interval(days=>$5),updated_at=NOW()`,
      [crypto.randomUUID(),userId,Math.min(4,mergedSkills.length),JSON.stringify(mergedSkills),days]);
    await client.query(`UPDATE pro_orders SET user_id=$2,status='approved',provider_transaction_id=$3,updated_at=NOW() WHERE id=$1`,
      [order.id,userId,String(transaction.id)]);
    await client.query('COMMIT');
    return {ok:true,activatedPro:true};
  }catch(err){try{await client.query('ROLLBACK')}catch{};throw err;}finally{client.release();}
}

async function seedStoreProducts(){
  if(!pool)return;
  const features=[
    'Mở khóa các đề Writing và HSKK Cao cấp có gắn quyền PRO trong thời hạn gói.',
    'Truy cập kho Prediction PDF dành cho học viên PRO.',
    'Luyện tập và xem lại lịch sử bài làm, kết quả và phản hồi được hệ thống hỗ trợ.',
    'Sử dụng khu vực Cá nhân hóa: sổ từ vựng, collocations, cấu trúc và công cụ ôn tập.',
    'Một tài khoản sử dụng xuyên suốt; thời hạn được cộng nối khi mua gia hạn.'
  ];
  const plans=[
    {slug:'road-pro-1-month',title:'ROAD PRO · 1 tháng',price:39000,duration:30,subtitle:'Khởi động lộ trình học tập nâng cao',features:[...features,'Phù hợp để trải nghiệm trọn bộ quyền PRO trong 30 ngày.']},
    {slug:'road-pro-3-months',title:'ROAD PRO · 3 tháng',price:99000,duration:90,subtitle:'Gói tiết kiệm cho một chặng ôn thi',features:[...features,'Thời hạn 90 ngày; tối ưu chi phí hơn so với gia hạn từng tháng.']},
    {slug:'road-pro-1-year',title:'ROAD PRO · 1 năm',price:399000,duration:365,subtitle:'Đồng hành xuyên suốt cả năm học',features:[...features,'Thời hạn 365 ngày; phù hợp với lộ trình học dài hạn.']}
  ];
  for(const plan of plans){
    await dbQuery(`INSERT INTO store_products(id,slug,product_type,title,subtitle,description,features,price,duration_days,skill_access,vat_rate,published)
      VALUES($1,$2,'pro',$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,NULL,TRUE) ON CONFLICT(slug) DO NOTHING`,[
      crypto.randomUUID(),plan.slug,plan.title,plan.subtitle,
      'Gói thành viên ROAD TO HSK 9, bao gồm các quyền học tập nâng cao được liệt kê bên dưới.',JSON.stringify(plan.features),plan.price,plan.duration,JSON.stringify(ALL_SKILLS)
    ]);
  }
}

async function initDB(){
  if(!pool) return;
  await dbQuery(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    dob DATE,
    registration_id TEXT UNIQUE,
    eit_code TEXT UNIQUE,
    email TEXT DEFAULT '',
    password_hash TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'eit'`);
  await dbQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`);
  await dbQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await dbQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`);
  await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq ON users(google_sub) WHERE google_sub IS NOT NULL AND google_sub<>''`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS users_auth_provider_idx ON users(auth_provider)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL,
    student_email TEXT DEFAULT '',
    student_code TEXT DEFAULT '',
    eit_code TEXT DEFAULT '',
    dob DATE,
    test_id TEXT NOT NULL,
    test_title TEXT DEFAULT '',
    skill TEXT DEFAULT '',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    total INTEGER DEFAULT 40,
    score NUMERIC,
    auto_submitted BOOLEAN DEFAULT FALSE,
    elapsed_seconds INTEGER DEFAULT 0,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS results (
    id UUID PRIMARY KEY,
    submission_id UUID UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    listening NUMERIC,
    reading NUMERIC,
    writing NUMERIC,
    speaking NUMERIC,
    overall NUMERIC,
    message TEXT DEFAULT '',
    published BOOLEAN NOT NULL DEFAULT FALSE,
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    feedback_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`ALTER TABLE results ADD COLUMN IF NOT EXISTS feedback JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await dbQuery(`ALTER TABLE results ADD COLUMN IF NOT EXISTS feedback_published BOOLEAN NOT NULL DEFAULT FALSE`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS ai_skill_reviews (
    id UUID PRIMARY KEY,
    submission_id UUID UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    model TEXT DEFAULT '',
    overall_band NUMERIC,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS ai_skill_reviews_user_idx ON ai_skill_reviews(user_id,skill,created_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS practice_tests (
    id UUID PRIMARY KEY,
    skill TEXT NOT NULL,
    volume INTEGER NOT NULL,
    test_no INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    question_type TEXT DEFAULT '',
    duration_minutes INTEGER DEFAULT 60,
    total_questions INTEGER DEFAULT 40,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    answer_key JSONB NOT NULL DEFAULT '{}'::jsonb,
    explanations JSONB NOT NULL DEFAULT '{}'::jsonb,
    audio_url TEXT DEFAULT '',
    source_file TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    series_label TEXT DEFAULT '',
    display_test_label TEXT DEFAULT '',
    card_label TEXT DEFAULT '',
    card_subtitle TEXT DEFAULT '',
    attempts_count INTEGER DEFAULT 0,
    status_label TEXT DEFAULT 'Chưa hoàn thành',
    button_label TEXT DEFAULT 'Kiểm tra',
    cover_url TEXT DEFAULT '',
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(skill,volume,test_no)
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hsk_mock_exams (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'HSK 6 · Full Mock Exam',
    description TEXT DEFAULT '',
    listening_test_id TEXT NOT NULL,
    reading_test_id TEXT NOT NULL,
    writing_test_id TEXT NOT NULL,
    hskk_test_id TEXT NOT NULL,
    section_minutes JSONB NOT NULL DEFAULT '{"listening":35,"reading":50,"writing":45,"hskk":25}'::jsonb,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hsk_mock_attempts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mock_exam_id UUID REFERENCES hsk_mock_exams(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL DEFAULT '',
    candidate_code TEXT NOT NULL DEFAULT '',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    recording_url TEXT DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS hsk_mock_attempts_exam_idx ON hsk_mock_attempts(mock_exam_id,submitted_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hskk_exams (
    id UUID PRIMARY KEY,
    version TEXT NOT NULL CHECK(version IN ('2.0','3.0')),
    level TEXT NOT NULL,
    level_label TEXT NOT NULL DEFAULT '',
    test_no INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 20,
    prep_minutes INTEGER NOT NULL DEFAULT 0,
    content JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(version,level,test_no)
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS hskk_exams_published_idx ON hskk_exams(published,version,level,updated_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hskk_attempts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    exam_id UUID REFERENCES hskk_exams(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL DEFAULT '',
    candidate_code TEXT NOT NULL DEFAULT '',
    recordings JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_score NUMERIC,
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS hskk_attempts_user_idx ON hskk_attempts(user_id,submitted_at DESC)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS hskk_attempts_exam_idx ON hskk_attempts(exam_id,submitted_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS test_categories (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS test_categories_name_lower_uq ON test_categories (LOWER(name))`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES test_categories(id) ON DELETE SET NULL`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS practice_tests_category_idx ON practice_tests(category_id)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS prediction_files (
    id UUID PRIMARY KEY,
    skill TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    week_label TEXT NOT NULL DEFAULT '',
    pdf_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published BOOLEAN NOT NULL DEFAULT TRUE
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS course_posts (
    id UUID PRIMARY KEY,
    skill TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    poster_url TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    slug TEXT DEFAULT '',
    price INTEGER NOT NULL DEFAULT 500000,
    student_count INTEGER NOT NULL DEFAULT 0,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`ALTER TABLE course_posts ADD COLUMN IF NOT EXISTS slug TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE course_posts ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 500000`);
  await dbQuery(`ALTER TABLE course_posts ADD COLUMN IF NOT EXISTS student_count INTEGER NOT NULL DEFAULT 0`);
  await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS course_posts_slug_uq ON course_posts(slug) WHERE slug<>''`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY,
    course_id UUID REFERENCES course_posts(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    course_title TEXT NOT NULL DEFAULT '',
    student_name TEXT NOT NULL,
    dob DATE,
    current_band NUMERIC(3,1),
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    voucher TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS pro_entitlements (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    skills INTEGER NOT NULL DEFAULT 4 CHECK (skills BETWEEN 1 AND 4),
    skill_access JSONB NOT NULL DEFAULT '[]'::jsonb,
    source TEXT NOT NULL DEFAULT 'purchase',
    status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`ALTER TABLE pro_entitlements ADD COLUMN IF NOT EXISTS skill_access JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS pro_entitlements_expiry_idx ON pro_entitlements(expires_at)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS practice_access (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,test_id)
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS practice_access_user_idx ON practice_access(user_id)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS pro_orders (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    skills INTEGER NOT NULL CHECK (skills BETWEEN 1 AND 4),
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS payment_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
    payment_title TEXT NOT NULL DEFAULT 'THANH TOÁN KHÓA HỌC EIT',
    qr_url TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    account_name TEXT DEFAULT '',
    account_number TEXT DEFAULT '',
    transfer_note TEXT DEFAULT 'EIT COURSE',
    instructions TEXT DEFAULT 'Quét mã QR hoặc chuyển khoản theo thông tin bên dưới. Sau khi thanh toán, EIT sẽ xác nhận và liên hệ với bạn.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`INSERT INTO payment_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING`);
  await dbQuery(`ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS bank_code TEXT NOT NULL DEFAULT ''`);
  await dbQuery(`ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8.00`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS store_products (
    id UUID PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    product_type TEXT NOT NULL CHECK(product_type IN ('pro','document')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    price INTEGER NOT NULL DEFAULT 0 CHECK(price>=0),
    duration_days INTEGER NOT NULL DEFAULT 0,
    skill_access JSONB NOT NULL DEFAULT '[]'::jsonb,
    cover_url TEXT NOT NULL DEFAULT '',
    file_key TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    vat_rate NUMERIC(5,2),
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS store_products_public_idx ON store_products(published,product_type,created_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS store_orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_code TEXT UNIQUE NOT NULL,
    transfer_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','expired')),
    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL DEFAULT 0,
    vat_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL DEFAULT 0,
    vat_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    provider_transaction_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS store_orders_user_idx ON store_orders(user_id,created_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS store_order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES store_products(id) ON DELETE SET NULL,
    product_type TEXT NOT NULL,
    product_title TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL DEFAULT 0,
    line_subtotal INTEGER NOT NULL DEFAULT 0,
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    vat_amount INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 0,
    skill_access JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS document_access (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,product_id)
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS payment_transactions (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_transaction_id TEXT NOT NULL,
    order_id UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider,provider_transaction_id)
  )`);
  // Seed the admin-provided QR once if the DB does not have one yet.
  const defaultQr = '/uploads/eit-payment-qr.png';
  if (fs.existsSync(path.join(UPLOAD_DIR, 'eit-payment-qr.png'))) {
    await dbQuery(`UPDATE payment_settings SET qr_url=$1 WHERE id=1 AND COALESCE(qr_url,'')=''`, [defaultQr]);
  }
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS skill_access JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS transfer_code TEXT NOT NULL DEFAULT ''`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT NOT NULL DEFAULT ''`);
  await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS pro_orders_transfer_code_unique ON pro_orders(transfer_code) WHERE transfer_code<>''`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS pro_payment_transactions (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_transaction_id TEXT NOT NULL,
    pro_order_id UUID NOT NULL REFERENCES pro_orders(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider,provider_transaction_id)
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS course_enrollments_created_idx ON course_enrollments(created_at DESC)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS course_enrollments_course_idx ON course_enrollments(course_id)`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS series_label TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS display_test_label TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS card_label TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS card_subtitle TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS attempts_count INTEGER DEFAULT 0`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS status_label TEXT DEFAULT 'Chưa hoàn thành'`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS button_label TEXT DEFAULT 'Kiểm tra'`);
  await dbQuery(`ALTER TABLE practice_tests ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT ''`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS practice_tests_skill_idx ON practice_tests(skill,volume,test_no)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS prediction_created_idx ON prediction_files(created_at DESC)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions(user_id)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS submissions_submitted_idx ON submissions(submitted_at DESC)`);
  await seedUsers();
  await seedCourses();
  await seedStoreProducts();
  await seedPracticeDemos();
  await seedHsk6Papers();
  await seedHsk5Papers();
  await migrateLegacySubmissions();
}

async function seedUsers(){
  const count=(await dbQuery('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
  if(count>0) return;
  const seeds=[
    {full_name:'TRAN MINH THIEN',dob:'2007-09-27',registration_id:'IELTS001',eit_code:'EIT-X7K4P9',email:'',password:'27092007'},
    {full_name:'Jane Doe',dob:'1998-07-22',registration_id:'IELTS002',eit_code:'EIT789012',email:'',password:'secure456'}
  ];
  for(const u of seeds) await dbQuery(`INSERT INTO users(id,full_name,dob,registration_id,eit_code,email,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[crypto.randomUUID(),u.full_name,u.dob,u.registration_id,u.eit_code,u.email,hashPassword(u.password)]);
}

async function migrateLegacySubmissions(){
  let legacy=[]; try { legacy=readLegacyDB(); } catch { return; }
  if(!Array.isArray(legacy)||!legacy.length)return;
  const count=(await dbQuery('SELECT COUNT(*)::int AS n FROM submissions')).rows[0].n;
  if(count>0)return;
  for(const x of legacy){
    const user=(await dbQuery('SELECT id FROM users WHERE registration_id=$1 OR eit_code=$2 OR lower(email)=lower($3) LIMIT 1',[x.studentCode||'',x.eitCode||'',x.studentEmail||''])).rows[0];
    const sid=x.id||crypto.randomUUID();
    await dbQuery(`INSERT INTO submissions(id,user_id,student_name,student_email,student_code,eit_code,dob,test_id,test_title,skill,answers,highlights,notes,total,score,auto_submitted,elapsed_seconds,submitted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`,[
      sid,user?.id||null,x.studentName||'Unknown',x.studentEmail||'',x.studentCode||'',x.eitCode||'',x.dob||null,x.testId||'UNKNOWN',x.testTitle||'',x.skill||'',JSON.stringify(x.answers||{}),JSON.stringify(x.highlights||[]),JSON.stringify(x.notes||[]),x.total??40,x.score??null,!!x.autoSubmitted,Number(x.elapsedSeconds||0),x.submittedAt||new Date().toISOString()]);
    if(x.result){ await dbQuery(`INSERT INTO results(id,submission_id,user_id,listening,reading,writing,speaking,overall,message,published,feedback,feedback_published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT DO NOTHING`,[crypto.randomUUID(),sid,user?.id||null,x.result.listening??null,x.result.reading??null,x.result.writing??null,x.result.speaking??null,x.result.overall??null,x.result.message||'',!!x.resultPublished,JSON.stringify(x.result.feedback||{}),!!x.result.feedbackPublished]); }
  }
}


function safeUploadName(name){
  const ext=path.extname(String(name||'')).toLowerCase();
  const base=path.basename(String(name||'file'),ext).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80)||'file';
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`;
}
function uploadUrl(name){ return `/uploads/${encodeURIComponent(name)}`; }
function parseDocxText(filePath){
  const zip=new AdmZip(filePath); const entry=zip.getEntry('word/document.xml');
  if(!entry) throw new Error('DOCX không có word/document.xml');
  let xml=entry.getData().toString('utf8');
  xml=xml.replace(/<w:tab\s*\/?>/g,'\t').replace(/<w:br\s*\/?>/g,'\n').replace(/<\/w:p>/g,'\n');
  xml=xml.replace(/<[^>]+>/g,'');
  return xml.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\r/g,'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}
function parseImportedText(text){
  const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const answerIndex=lines.findIndex(x=>/^ANSWER\s*KEY$/i.test(x)||/^ANSWER KEY\s*:/i.test(x));
  const expIndex=lines.findIndex(x=>/^EXPLANATIONS?$/i.test(x)||/^EXPLANATION\s*:/i.test(x));
  const qEnd=Math.min(answerIndex<0?lines.length:answerIndex, expIndex<0?lines.length:expIndex);
  const questionLines=lines.slice(0,qEnd);
  const answers={}; const explanations={};
  if(answerIndex>=0){
    const end=expIndex>answerIndex?expIndex:lines.length;
    lines.slice(answerIndex+1,end).forEach(l=>{ const m=l.match(/^(\d+(?:-\d+)?)\s*[.)．。:：\-]?\s*(.+)$/); if(m) answers[m[1]]=m[2].trim(); });
  }
  if(expIndex>=0){ lines.slice(expIndex+1).forEach(l=>{ const m=l.match(/^(\d+(?:-\d+)?)\s*[.)．。:：\-]?\s*(.+)$/); if(m) explanations[m[1]]=m[2].trim(); }); }
  const questions=[]; let current=null;
  questionLines.forEach(l=>{
    const qm=l.match(/^(\d+(?:-\d+)?)\s*[.)．。:：\-]\s*(.+)$/);
    const om=l.match(/^([A-H])(?:\s*[.)．。:：\-]\s*|\s+)(.+)$/i);
    if(qm){ current={number:qm[1],text:qm[2],options:[]}; questions.push(current); return; }
    if(om && current){ current.options.push(om[2].trim()); }
  });
  return {questions,answerKey:answers,explanations,rawText:text};
}
async function parseMultipart(req){
  return new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{fileSize:100*1024*1024,files:5}});
    const fields={}; const files=[]; const pending=[]; let settled=false;
    const fail=(err)=>{ if(settled)return; settled=true; reject(err); };
    bb.on('field',(name,val)=>fields[name]=val);
    bb.on('file',(name,file,info)=>{
      const filename=safeUploadName(info.filename); const dest=path.join(UPLOAD_DIR,filename); const ws=fs.createWriteStream(dest);
      const entry=new Promise((resolveFile,rejectFile)=>{
        let size=0;
        file.on('data',d=>size+=d.length);
        file.on('error',rejectFile);
        ws.on('error',rejectFile);
        ws.on('finish',()=>resolveFile({field:name,filename,original:info.filename,mime:info.mimeType,size,url:uploadUrl(filename),path:dest}));
      });
      pending.push(entry);
      file.on('limit',()=>{try{fs.unlinkSync(dest)}catch{}; fail(new Error('File quá lớn (tối đa 100MB).'));});
      file.pipe(ws);
    });
    bb.on('error',fail);
    bb.on('finish',async()=>{
      try{
        const written=await Promise.all(pending);
        if(settled)return;
        settled=true; resolve({fields,files:written});
      }catch(err){fail(err)}
    });
    req.pipe(bb);
  });
}
function isAllowedDoc(name){return /\.(docx|txt)$/i.test(name||'');}
function isAllowedAudio(name){return /\.(mp3|wav|m4a|ogg)$/i.test(name||'');}
function isAllowedPdf(name){return /\.pdf$/i.test(name||'');}

const ALL_SKILLS=['listening','reading','writing','speaking'];
function normalizeSkills(list){
  if(!Array.isArray(list))return [];
  return [...new Set(list.map(x=>String(x||'').trim().toLowerCase()).filter(x=>ALL_SKILLS.includes(x)))];
}
async function grantCoursePro(user){
  if(!user?.id)return;
  const email=String(user.email||'').trim().toLowerCase();
  const has=await dbQuery(`SELECT 1 FROM course_enrollments WHERE user_id=$1 OR ($2<>'' AND lower(trim(email))=$2) LIMIT 1`,[user.id,email]);
  if(!has.rows.length)return;
  await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,4,$3::jsonb,'course_enrollment','active',NOW(),NOW()+INTERVAL '30 days') ON CONFLICT(user_id) DO UPDATE SET skills=4,skill_access=$3::jsonb,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+INTERVAL '30 days'),source='course_enrollment',updated_at=NOW()`,[crypto.randomUUID(),user.id,JSON.stringify(ALL_SKILLS)]);
}
async function getEntitlement(userId){
  if(!userId)return null;
  const r=await dbQuery(`SELECT skills,skill_access,status,expires_at,EXTRACT(EPOCH FROM (expires_at-NOW()))::int AS seconds_left FROM pro_entitlements WHERE user_id=$1 AND status='active' AND expires_at>NOW() LIMIT 1`,[userId]);
  if(!r.rows.length)return null;
  const x=r.rows[0];
  let access=normalizeSkills(Array.isArray(x.skill_access)?x.skill_access:[]);
  if(!access.length && Number(x.skills)===4)access=ALL_SKILLS.slice();
  return {skills:Number(x.skills||0),skillAccess:access,expiresAt:x.expires_at,daysRemaining:Math.max(0,Math.ceil(Number(x.seconds_left||0)/86400))};
}
async function hasCourseAccess(user){
  if(!user?.id)return false;
  const email=String(user.email||'').trim().toLowerCase();
  const r=await dbQuery(`SELECT 1 FROM course_enrollments WHERE user_id=$1 OR ($2<>'' AND lower(trim(email))=$2) LIMIT 1`,[user.id,email]);
  return !!r.rows.length;
}
async function getPracticeAccess(user,test){
  // HSK policy: any active candidate account can access every published Reading/Listening paper.
  // No per-test grant, PRO entitlement, or volume-specific unlock is required for these two skills.
  if(!user?.id)return {allowed:false,reason:'login'};
  const skill=String(test.skill||'').toLowerCase();
  if(skill==='reading'||skill==='listening')return {allowed:true,reason:'account'};
  if((skill==='writing'||skill==='speaking') && Number(test.volume)===1) return {allowed:true,reason:'free'};
  const override=(await dbQuery('SELECT allowed FROM practice_access WHERE user_id=$1 AND test_id=$2 LIMIT 1',[user.id,test.id])).rows[0];
  if(override){return {allowed:!!override.allowed,reason:'admin'};}
  const ent=await getEntitlement(user.id);
  if(ent?.skillAccess?.includes(skill))return {allowed:true,reason:'pro'};
  return {allowed:false,reason:'locked'};
}
async function getUserAccessSummary(user){
  if(!user?.id)return {allowedTestIds:[],skillAccess:[],predictionAllowed:false,pro:null,course:false};
  await grantCoursePro(user);
  const ent=await getEntitlement(user.id);
  const course=await hasCourseAccess(user);
  const explicit=(await dbQuery('SELECT test_id FROM practice_access WHERE user_id=$1 AND allowed=TRUE',[user.id])).rows.map(x=>x.test_id);
  return {allowedTestIds:explicit,skillAccess:ent?.skillAccess||[],predictionAllowed:!!ent||course,pro:ent?{skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}:null,course};
}
const PRO_PLANS={
  reading:{label:'PRO Reading',skills:1,skillAccess:['reading'],amount:69000,durationDays:30},
  listening:{label:'PRO Listening',skills:1,skillAccess:['listening'],amount:69000,durationDays:30},
  writing:{label:'PRO Writing',skills:1,skillAccess:['writing'],amount:89000,durationDays:30},
  speaking:{label:'PRO Speaking',skills:1,skillAccess:['speaking'],amount:89000,durationDays:30},
  '4-month':{label:'PRO 4 Skills · 1 tháng',skills:4,skillAccess:['reading','listening','writing','speaking'],amount:329000,durationDays:30},
  '4-2month':{label:'PRO 4 Skills · 6 tháng',skills:4,skillAccess:['reading','listening','writing','speaking'],amount:1799000,durationDays:180},
  '4-year':{label:'PRO 4 Skills · 1 năm',skills:4,skillAccess:['reading','listening','writing','speaking'],amount:3599000,durationDays:365}
};
function getProPlan(plan){ return PRO_PLANS[String(plan||'').trim()]||null; }

async function api(req,res,url){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'});return res.end()}
  if(url.pathname==='/api/webhooks/sepay' && req.method==='POST'){
    const raw=await readRawBody(req);
    const secret=String(process.env.SEPAY_WEBHOOK_SECRET||'');
    const apiKey=String(process.env.SEPAY_API_KEY||'');
    if(secret){
      const timestamp=String(req.headers['x-sepay-timestamp']||'');
      const signature=String(req.headers['x-sepay-signature']||'');
      const seconds=Number(timestamp);
      if(!Number.isFinite(seconds)||Math.abs(Math.floor(Date.now()/1000)-seconds)>300)return json(res,401,{success:false,message:'Webhook timestamp expired'});
      const expected='sha256='+crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
      const a=Buffer.from(expected); const b=Buffer.from(signature);
      if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return json(res,401,{success:false,message:'Invalid webhook signature'});
    }else if(apiKey){
      const authorization=String(req.headers.authorization||'');
      const expected='Apikey '+apiKey;
      const a=Buffer.from(expected); const b=Buffer.from(authorization);
      if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return json(res,401,{success:false,message:'Invalid webhook API key'});
    }else{
      return json(res,503,{success:false,message:'Payment webhook is not configured. Set SEPAY_WEBHOOK_SECRET.'});
    }
    let event; try{event=JSON.parse(raw.toString('utf8'));}catch{return json(res,400,{success:false,message:'Invalid JSON'});}
    const transferType=String(event.transferType||event.transfer_type||'').toLowerCase();
    const content=String(event.content||event.description||event.code||'');
    const amount=Math.round(Number(event.transferAmount??event.amount??0));
    const txnId=String(event.id??event.referenceCode??'').trim();
    if(transferType!=='in'||!txnId||!content||!Number.isFinite(amount)||amount<=0)return json(res,200,{success:true,ignored:true});
    const settings=(await dbQuery('SELECT account_number FROM payment_settings WHERE id=1 LIMIT 1')).rows[0]||{};
    if(settings.account_number && String(event.accountNumber||'').trim()!==String(settings.account_number).trim())return json(res,200,{success:true,ignored:true,reason:'account_mismatch'});
    const order=(await dbQuery(`SELECT id,total_amount FROM store_orders WHERE status='pending' AND position(upper(transfer_code) in upper($1))>0 LIMIT 1`,[content])).rows[0];
    if(order){
      if(Number(order.total_amount)!==amount)return json(res,200,{success:true,amountMismatch:true});
      const fulfilled=await fulfillStoreOrder(order.id,{provider:'sepay',id:txnId,amount,raw:event});
      return json(res,200,{success:true,orderType:'store',...fulfilled});
    }
    const proOrder=(await dbQuery(`SELECT id,amount FROM pro_orders WHERE status='pending' AND transfer_code<>'' AND position(upper(transfer_code) in upper($1))>0 LIMIT 1`,[content])).rows[0];
    if(!proOrder)return json(res,200,{success:true,unmatched:true});
    if(Number(proOrder.amount)!==amount)return json(res,200,{success:true,amountMismatch:true});
    const fulfilled=await fulfillProOrder(proOrder.id,{provider:'sepay',id:txnId,amount,raw:event});
    if(!fulfilled.ok)return json(res,409,{success:false,...fulfilled});
    return json(res,200,{success:true,orderType:'pro',...fulfilled});
  }

  if(url.pathname==='/api/health' && (req.method==='GET'||req.method==='HEAD')){ if(req.method==='HEAD'){res.writeHead(200);return res.end()} return json(res,200,{ok:true,service:'HSK Exam API',database:!!pool}); }
  if(url.pathname==='/api/ai/status' && (req.method==='GET'||req.method==='HEAD')){ if(req.method==='HEAD'){res.writeHead(200);return res.end()} const keyConfigured=!!String(process.env.DEEPSEEK_API_KEY||'').trim(); return json(res,200,{ok:true,configured:keyConfigured,service:'AI',serverSideKey:keyConfigured,writesToDatabase:!!pool}); }
  if(url.pathname==='/api/hskk/ai-status' && (req.method==='GET'||req.method==='HEAD')){ if(req.method==='HEAD'){res.writeHead(200);return res.end()} return json(res,200,{ok:true,configured:isHskkAiConfigured(),service:'AI'}); }

  if(url.pathname==='/api/hskk/exams' && req.method==='GET'){
    const version=String(url.searchParams.get('version')||'').trim();
    const level=String(url.searchParams.get('level')||'').trim();
    const params=[]; let where='published=TRUE';
    if(version){params.push(version);where+=` AND version=$${params.length}`;}
    if(level){params.push(level);where+=` AND level=$${params.length}`;}
    const rows=(await dbQuery(`SELECT id,version,level,level_label,test_no,title,description,duration_minutes,prep_minutes,updated_at FROM hskk_exams WHERE ${where} ORDER BY version,level,test_no,updated_at DESC`,params)).rows;
    return json(res,200,{ok:true,exams:rows});
  }
  if(url.pathname.match(/^\/api\/hskk\/exams\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để mở nội dung đề HSKK.'});
    const id=url.pathname.split('/').pop();
    const row=(await dbQuery('SELECT id,version,level,level_label,test_no,title,description,duration_minutes,prep_minutes,content FROM hskk_exams WHERE id=$1 AND published=TRUE LIMIT 1',[id])).rows[0];
    if(!row)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK hoặc đề chưa được xuất bản.'});
    // Only return candidate-facing fields. Never expose model answers, internal notes or reference transcripts.
    const publicContent={sections:(row.content?.sections||[]).map(sec=>({title:String(sec.title||''),instruction:String(sec.instruction||''),tasks:(sec.tasks||[]).map(t=>({
      id:String(t.id||''),type:String(t.type||'question'),text:t.showText===false?'':String(t.text||''),showText:t.showText!==false,
      audioUrl:String(t.audioUrl||''),imageUrl:String(t.imageUrl||''),pinyin:String(t.pinyin||''),
      prepSeconds:Math.max(0,Number(t.prepSeconds||0)),speakSeconds:Math.max(1,Number(t.speakSeconds||30))
    }))}))};
    return json(res,200,{ok:true,exam:{id:row.id,version:row.version,level:row.level,level_label:row.level_label,test_no:row.test_no,title:row.title,description:row.description,duration_minutes:row.duration_minutes,prep_minutes:row.prep_minutes,content:publicContent}});
  }
  if(url.pathname==='/api/hskk/submit' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'});
    const b=await body(req); const examId=String(b.examId||'');
    const exam=(await dbQuery('SELECT * FROM hskk_exams WHERE id=$1 AND published=TRUE LIMIT 1',[examId])).rows[0];
    if(!exam)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK đang hoạt động.'});
    const recordings=Array.isArray(b.recordings)?b.recordings:[];
    if(!recordings.length)return json(res,400,{ok:false,message:'Bài thi chưa có bản ghi âm.'});
    const taskMap=new Map((exam.content?.sections||[]).flatMap(sec=>(sec.tasks||[]).map(t=>[String(t.id),{...t,sectionTitle:sec.title||''}])));
    let bytes=0; const meta=[];
    for(const r of recordings){
      const task=taskMap.get(String(r.taskId||'')); if(!task)return json(res,400,{ok:false,message:'Bài ghi âm chứa mã câu hỏi không hợp lệ.'});
      const segments=Array.isArray(r.segments)?r.segments:[];
      if(!segments.length)return json(res,400,{ok:false,message:'Một câu trả lời chưa có bản ghi âm đã chuẩn hóa. Hãy tải lại trang thi và làm lại.'});
      for(const segment of segments){
        const audio=String(segment?.audio||'');
        const match=audio.match(/^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/i);
        if(!match)return json(res,400,{ok:false,message:'Định dạng audio không hợp lệ. Hãy tải lại trang thi và ghi âm lại.'});
        const segmentBytes=Math.floor(match[1].length*3/4);
        if(segmentBytes>8*1024*1024)return json(res,413,{ok:false,message:'Một đoạn ghi âm vượt giới hạn cho phép. Hãy thử lại với thời lượng ngắn hơn.'});
        if(Number(segment.durationSeconds||0)>111)return json(res,400,{ok:false,message:'Một đoạn ghi âm quá dài. Hãy tải lại trang thi và thực hiện lại.'});
        bytes+=segmentBytes;
      }
      meta.push({taskId:String(task.id),sectionTitle:String(task.sectionTitle||''),taskType:String(task.type||''),question:String(task.text||''),durationSeconds:segments.reduce((n,x)=>n+Math.max(0,Number(x.durationSeconds||0)),0)});
    }
    if(bytes>12*1024*1024)return json(res,413,{ok:false,message:'Tổng dung lượng ghi âm vượt giới hạn chấm trong một lượt. Hãy giảm thời lượng hoặc chia thành các lượt luyện ngắn hơn.'});
    const submittedIds=new Set(recordings.map(r=>String(r.taskId||'')));
    if(submittedIds.size!==taskMap.size || [...taskMap.keys()].some(taskId=>!submittedIds.has(taskId)))return json(res,400,{ok:false,message:'Bài nộp chưa có bản ghi của tất cả câu hỏi hoặc có câu bị ghi lặp. Vui lòng thi lại để đảm bảo đủ dữ liệu chấm.'});
    const id=crypto.randomUUID();
    await dbQuery(`INSERT INTO hskk_attempts(id,user_id,exam_id,student_name,candidate_code,recordings,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending')`,[id,u.id,examId,u.full_name||'',u.registration_id||u.eit_code||'',JSON.stringify(meta)]);
    const aiRecordings=recordings.map(r=>({...r,sectionTitle:taskMap.get(String(r.taskId||''))?.sectionTitle||'',taskType:taskMap.get(String(r.taskId||''))?.type||'',question:taskMap.get(String(r.taskId||''))?.text||'',referenceText:taskMap.get(String(r.taskId||''))?.referenceText||''}));
    setImmediate(async()=>{
      try{
        const feedback=await gradeHskkWithDeepSeek({exam,recordings:aiRecordings});
        await dbQuery(`UPDATE hskk_attempts SET total_score=$1,feedback=$2::jsonb,status='completed',error_message='',updated_at=NOW() WHERE id=$3`,[Number(feedback.totalScore||0),JSON.stringify(feedback),id]);
      }catch(err){
        console.error('HSKK AI grading failed:',err);
        try{await dbQuery(`UPDATE hskk_attempts SET status='failed',error_message=$1,updated_at=NOW() WHERE id=$2`,['AI_GRADING_FAILED',id]);}
        catch(dbErr){console.error('HSKK failure status update failed:',dbErr);}
      }
    });
    return json(res,202,{ok:true,id,status:'pending',ai:{available:isHskkAiConfigured(),label:'AI chấm'},message:'Đã nhận bài. AI đang xử lý; trang kết quả sẽ tự cập nhật khi hoàn tất.'});
  }
  if(url.pathname.match(/^\/api\/hskk\/result\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Phiên đăng nhập đã hết hạn.'});
    const id=url.pathname.split('/').pop();
    const row=(await dbQuery(`SELECT a.id,a.user_id,a.student_name,a.candidate_code,a.recordings,a.total_score,a.feedback,a.status,a.error_message,a.submitted_at,e.version,e.level,e.level_label,e.title AS exam_title FROM hskk_attempts a LEFT JOIN hskk_exams e ON e.id=a.exam_id WHERE a.id=$1 AND a.user_id=$2 LIMIT 1`,[id,u.id])).rows[0];
    if(!row)return json(res,404,{ok:false,message:'Không tìm thấy kết quả.'});
    return json(res,200,{ok:true,result:{id:row.id,studentName:row.student_name,candidateCode:row.candidate_code,recordingCount:Array.isArray(row.recordings)?row.recordings.length:0,totalScore:row.total_score==null?null:Number(row.total_score),feedback:row.feedback||{},status:row.status,errorMessage:row.error_message||'',submittedAt:row.submitted_at,version:row.version,level:row.level,levelLabel:row.level_label,examTitle:row.exam_title}});
  }
  if(url.pathname==='/api/admin/hskk/exams' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery('SELECT * FROM hskk_exams ORDER BY version,level,test_no,updated_at DESC')).rows;
    return json(res,200,{ok:true,exams:rows});
  }
  if(url.pathname==='/api/admin/hskk/exams' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req); const id=String(b.id||crypto.randomUUID());
    const version=String(b.version||'2.0'); const level=String(b.level||'beginner'); const levelLabel=String(b.levelLabel||''); const title=String(b.title||'').trim();
    const testNo=Math.max(1,Math.floor(Number(b.testNo||1))); const duration=Math.min(240,Math.max(1,Math.floor(Number(b.durationMinutes||20)))); const prep=Math.min(60,Math.max(0,Math.floor(Number(b.prepMinutes||0))));
    const content=b.content&&typeof b.content==='object'?b.content:{}; const sections=Array.isArray(content.sections)?content.sections:[];
    const validLevel=version==='2.0'?['beginner','intermediate','advanced'].includes(level):version==='3.0'?['3','4','5','6'].includes(level):false;
    if(!validLevel)return json(res,400,{ok:false,message:'Phiên bản hoặc cấp độ HSKK không hợp lệ.'});
    if(!title)return json(res,400,{ok:false,message:'Hãy nhập tên đề HSKK trước khi lưu.'});
    if(sections.some(s=>!s||!Array.isArray(s.tasks)))return json(res,400,{ok:false,message:'Dữ liệu phần thi không hợp lệ. Hãy tải lại trang Admin và thử lại.'});
    const isPublishing=b.published===true;
    if(isPublishing&&(!sections.length||sections.some(s=>!s.tasks.length)))return json(res,400,{ok:false,message:'Để xuất bản, đề cần có ít nhất một phần thi và mỗi phần phải có ít nhất một câu hỏi.'});
    const totalTasks=sections.reduce((n,s)=>n+(s.tasks||[]).length,0); if(totalTasks>150)return json(res,400,{ok:false,message:'Một đề không được vượt quá 150 nhiệm vụ.'});
    const allowedTaskTypes=['listen_repeat','listen_answer','listen_recall','picture','question','read_aloud'];
    for(const sec of sections)for(const t of sec.tasks){
      const type=String(t.type||'');
      if(!t.id||(type&&!allowedTaskTypes.includes(type))||(isPublishing&&!allowedTaskTypes.includes(type))||!Number.isFinite(Number(t.prepSeconds||0))||Number(t.prepSeconds||0)<0||Number(t.prepSeconds||0)>1800||!Number.isFinite(Number(t.speakSeconds))||Number(t.speakSeconds)<1||Number(t.speakSeconds)>900)return json(res,400,{ok:false,message:'Mỗi câu cần mã hợp lệ, chọn dạng câu khi xuất bản, thời gian chuẩn bị 0–1800 giây và thời gian trả lời 1–900 giây.'});
      if(isPublishing){
        if(['listen_repeat','listen_answer','listen_recall'].includes(String(t.type))&&!String(t.audioUrl||'').trim())return json(res,400,{ok:false,message:`Không thể xuất bản: câu “${String(t.id)}” thuộc dạng nghe nhưng chưa có audio.`});
        if(String(t.type)==='picture'&&!String(t.imageUrl||'').trim())return json(res,400,{ok:false,message:`Không thể xuất bản: câu “${String(t.id)}” thuộc dạng nhìn tranh nhưng chưa có ảnh.`});
        if(String(t.type)==='read_aloud'&&(!String(t.text||'').trim()||t.showText===false))return json(res,400,{ok:false,message:`Không thể xuất bản: câu đọc thành tiếng “${String(t.id)}” cần có văn bản hiển thị cho học viên.`});
        if(String(t.type)==='question'&&!String(t.text||'').trim()&&!String(t.audioUrl||'').trim())return json(res,400,{ok:false,message:`Không thể xuất bản: câu hỏi “${String(t.id)}” cần có văn bản hoặc audio.`});
      }
    }
    const duplicate=(await dbQuery('SELECT id,title FROM hskk_exams WHERE version=$1 AND level=$2 AND test_no=$3 AND id<>$4 LIMIT 1',[version,level,testNo,id])).rows[0];
    if(duplicate)return json(res,409,{ok:false,message:`Số đề ${testNo} đã được dùng cho “${duplicate.title||'một đề khác'}”. Hãy đổi Test No. hoặc mở đề đó để chỉnh sửa.`});
    const r=await dbQuery(`INSERT INTO hskk_exams(id,version,level,level_label,test_no,title,description,duration_minutes,prep_minutes,content,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,level=EXCLUDED.level,level_label=EXCLUDED.level_label,test_no=EXCLUDED.test_no,title=EXCLUDED.title,description=EXCLUDED.description,duration_minutes=EXCLUDED.duration_minutes,prep_minutes=EXCLUDED.prep_minutes,content=EXCLUDED.content,published=EXCLUDED.published,updated_at=NOW() RETURNING *`,[id,version,level,levelLabel,testNo,title,String(b.description||''),duration,prep,JSON.stringify(content),isPublishing]);
    return json(res,200,{ok:true,exam:r.rows[0],message:'Đã lưu đề HSKK.'});
  }
  if(url.pathname.match(/^\/api\/admin\/hskk\/exams\/[0-9a-f-]+$/i) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop();
    const r=await dbQuery('DELETE FROM hskk_exams WHERE id=$1',[id]); if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK.'}); return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/admin/hskk/attempts' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT a.id,a.student_name,a.candidate_code,a.total_score,a.status,a.error_message,a.submitted_at,e.version,e.level,e.level_label,e.title AS exam_title FROM hskk_attempts a LEFT JOIN hskk_exams e ON e.id=a.exam_id ORDER BY a.submitted_at DESC LIMIT 200`)).rows;
    return json(res,200,{ok:true,attempts:rows});
  }

  if(url.pathname==='/api/admin/login' && req.method==='POST'){
    const b=await body(req); if(b.password!==ADMIN_PASSWORD)return json(res,401,{ok:false,message:'Invalid password'});
    const t=crypto.randomBytes(32).toString('hex'); TOKENS.set(t,Date.now()+8*60*60*1000); return json(res,200,{ok:true,token:t});
  }


  if(url.pathname==='/api/admin/test-categories' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT c.id,c.name,c.created_at,COUNT(p.id)::int AS test_count FROM test_categories c LEFT JOIN practice_tests p ON p.category_id=c.id GROUP BY c.id,c.name,c.created_at ORDER BY LOWER(c.name),c.created_at`)).rows;
    return json(res,200,{ok:true,categories:rows.map(c=>({id:c.id,name:c.name,created_at:c.created_at,test_count:Number(c.test_count||0)}))});
  }
  if(url.pathname==='/api/admin/test-categories' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req); const name=String(b.name||'').trim().replace(/\s+/g,' ');
    if(!name)return json(res,400,{ok:false,message:'Vui lòng nhập tên đề mục.'});
    if(name.length>80)return json(res,400,{ok:false,message:'Tên đề mục tối đa 80 ký tự.'});
    const exists=(await dbQuery('SELECT id FROM test_categories WHERE LOWER(name)=LOWER($1) LIMIT 1',[name])).rows[0];
    if(exists)return json(res,409,{ok:false,message:'Tên đề mục này đã tồn tại.'});
    try{
      const row=(await dbQuery('INSERT INTO test_categories(id,name) VALUES($1,$2) RETURNING id,name,created_at',[crypto.randomUUID(),name])).rows[0];
      return json(res,201,{ok:true,category:{...row,test_count:0}});
    }catch(err){if(err?.code==='23505')return json(res,409,{ok:false,message:'Tên đề mục này đã tồn tại.'});throw err;}
  }
  if(url.pathname.startsWith('/api/admin/test-categories/') && ['PATCH','DELETE'].includes(req.method)){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json(res,400,{ok:false,message:'Mã đề mục không hợp lệ.'});
    if(req.method==='PATCH'){
      const b=await body(req); const name=String(b.name||'').trim().replace(/\s+/g,' ');
      if(!name)return json(res,400,{ok:false,message:'Vui lòng nhập tên đề mục.'});
      if(name.length>80)return json(res,400,{ok:false,message:'Tên đề mục tối đa 80 ký tự.'});
      const exists=(await dbQuery('SELECT id FROM test_categories WHERE LOWER(name)=LOWER($1) AND id<>$2 LIMIT 1',[name,id])).rows[0];
      if(exists)return json(res,409,{ok:false,message:'Tên đề mục này đã tồn tại.'});
      try{
        const row=(await dbQuery('UPDATE test_categories SET name=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,created_at',[name,id])).rows[0];
        if(!row)return json(res,404,{ok:false,message:'Không tìm thấy đề mục.'});
        return json(res,200,{ok:true,category:row});
      }catch(err){if(err?.code==='23505')return json(res,409,{ok:false,message:'Tên đề mục này đã tồn tại.'});throw err;}
    }
    const r=await dbQuery('DELETE FROM test_categories WHERE id=$1 RETURNING id,name',[id]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Không tìm thấy đề mục.'});
    return json(res,200,{ok:true,message:'Đã xóa đề mục. Các đề thi vẫn được giữ nguyên.'});
  }

  if(url.pathname==='/api/test-categories' && req.method==='GET'){
    const rows=(await dbQuery(`SELECT c.id,c.name,COUNT(p.id)::int AS test_count FROM test_categories c LEFT JOIN practice_tests p ON p.category_id=c.id AND p.published=TRUE GROUP BY c.id,c.name,c.created_at ORDER BY LOWER(c.name),c.created_at`)).rows;
    return json(res,200,{ok:true,categories:rows.map(c=>({id:c.id,name:c.name,test_count:Number(c.test_count||0)}))});
  }

  if(url.pathname==='/api/dictionary' && req.method==='GET'){
    const word=String(url.searchParams.get('word')||'').trim();
    if(!word)return json(res,400,{ok:false,message:'Vui lòng nhập từ cần tra.'});
    if(word.length>120)return json(res,400,{ok:false,message:'Từ/cụm từ quá dài.'});
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      if(/[\u3400-\u9fff]/.test(word)){
        const dictUrl='https://api.mymemory.translated.net/get?q='+encodeURIComponent(word)+'&langpair='+encodeURIComponent('zh-CN|vi');
        const upstream=await fetch(dictUrl,{headers:{Accept:'application/json','User-Agent':'HSK-EXAM-Dictionary/1.0'},signal:controller.signal});
        const raw=await upstream.text();let result;try{result=JSON.parse(raw)}catch{result=null}
        const translated=String(result?.responseData?.translatedText||'').trim();
        if(!upstream.ok||!translated||translated.toUpperCase()===word.toUpperCase())return json(res,404,{ok:false,message:'Không tìm thấy nghĩa Trung–Việt cho từ này.'});
        const data=[{word,phonetic:'',meanings:[{partOfSpeech:'中文 → Tiếng Việt',definitions:[{definition:translated,example:''}]}]}];
        return json(res,200,{ok:true,data});
      }
      const upstream=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word),{headers:{Accept:'application/json','User-Agent':'HSK-EXAM-Dictionary/1.0'},signal:controller.signal});
      const text=await upstream.text(); let data; try{data=JSON.parse(text)}catch{data=null}
      if(!upstream.ok)return json(res,upstream.status===404?404:502,{ok:false,message:upstream.status===404?'Không tìm thấy từ này.':'Dictionary service unavailable.'});
      return json(res,200,{ok:true,data});
    }catch(err){return json(res,502,{ok:false,message:err?.name==='AbortError'?'Dictionary request timed out.':'Không thể kết nối dịch vụ từ điển.'});}
    finally{clearTimeout(timeout)}
  }

  if(url.pathname==='/api/practice' && req.method==='GET'){
    const skill=String(url.searchParams.get('skill')||'').toLowerCase(); const volumeParam=url.searchParams.get('volume'); const volume=volumeParam===null||volumeParam===''?null:Number(volumeParam);
    let sql='SELECT id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,audio_url,source_file,published,updated_at,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name FROM practice_tests WHERE published=TRUE'; const params=[];
    if(skill){params.push(skill);sql+=` AND lower(skill)=$${params.length}`;} if(volume!==null && Number.isFinite(volume)){params.push(volume);sql+=` AND volume=$${params.length}`;} sql+=' ORDER BY skill,volume,test_no';
    const rows=(await dbQuery(sql,params)).rows; const u=candidate(req);
    const tests=[];
    for(const t of rows){const a=await getPracticeAccess(u,t);tests.push({...t,allowed:a.allowed,lockReason:a.reason});}
    return json(res,200,{ok:true,tests});
  }
  if(url.pathname==='/api/practice/catalog' && req.method==='GET'){
    const rows=(await dbQuery('SELECT skill,volume,COUNT(*)::int AS test_count FROM practice_tests WHERE published=TRUE GROUP BY skill,volume ORDER BY skill,volume')).rows;
    return json(res,200,{ok:true,volumes:rows});
  }
  if(url.pathname==='/api/mock-exams' && req.method==='GET'){
    const rows=(await dbQuery('SELECT id,title,description,section_minutes,updated_at FROM hsk_mock_exams WHERE published=TRUE ORDER BY updated_at DESC')).rows;
    return json(res,200,{ok:true,exams:rows});
  }
  if(url.pathname.match(/^\/api\/mock-exams\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để tham gia thi thử.'});
    const id=url.pathname.split('/').pop();
    const config=(await dbQuery('SELECT * FROM hsk_mock_exams WHERE id=$1 AND published=TRUE LIMIT 1',[id])).rows[0];
    if(!config)return json(res,404,{ok:false,message:'Bộ đề thi thử không tồn tại hoặc chưa được xuất bản.'});
    const picks=[['listening',config.listening_test_id],['reading',config.reading_test_id],['writing',config.writing_test_id],['speaking',config.hskk_test_id]];
    const tests={};
    const secretQuestionFields=new Set(['answer','answerkey','answer_key','correctanswer','correct_answer','correctoption','correct_option','explanation','explanations','solution']);
    const sanitizeExamContent=value=>Array.isArray(value)?value.map(sanitizeExamContent):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!secretQuestionFields.has(k.toLowerCase())).map(([k,v])=>[k,sanitizeExamContent(v)])):value;
    for(const [key,testId] of picks){
      const test=(await dbQuery('SELECT * FROM practice_tests WHERE id=$1 AND published=TRUE LIMIT 1',[testId])).rows[0];
      if(!test)return json(res,409,{ok:false,message:`Admin chưa publish đề ${key.toUpperCase()} được gắn trong bộ thi thử.`});
      const access=await getPracticeAccess(u,test);
      if(!access.allowed)return json(res,403,{ok:false,message:`Bạn chưa được cấp quyền cho phần ${key.toUpperCase()}.`});
      tests[key]={id:test.id,skill:test.skill,volume:test.volume,testNo:test.test_no,title:test.title,questionType:test.question_type,durationMinutes:test.duration_minutes,totalQuestions:test.total_questions,content:sanitizeExamContent(test.content||{}),audioUrl:test.audio_url,displayTestLabel:test.display_test_label||'',seriesLabel:test.series_label||''};
    }
    return json(res,200,{ok:true,exam:{id:config.id,title:config.title,description:config.description||'',sectionMinutes:config.section_minutes||{},tests}});
  }
  if(url.pathname.startsWith('/api/practice/') && req.method==='GET'){
    const id=url.pathname.split('/').pop(); const r=await dbQuery('SELECT * FROM practice_tests WHERE id=$1 AND published=TRUE',[id]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Practice test not found'}); const x=r.rows[0]; const u=candidate(req);
    const access=await getPracticeAccess(u,x);
    if(!access.allowed)return json(res,u?403:401,{ok:false,message:u?'Bài này đang bị khóa. Vui lòng mua/gia hạn PRO hoặc liên hệ Admin để được mở quyền.':'Vui lòng đăng nhập để làm bài.'});
    return json(res,200,{ok:true,test:{id:x.id,skill:x.skill,volume:x.volume,testNo:x.test_no,title:x.title,questionType:x.question_type,durationMinutes:x.duration_minutes,totalQuestions:x.total_questions,content:x.content,answerKey:x.answer_key,explanations:x.explanations,audioUrl:x.audio_url,sourceFile:x.source_file,seriesLabel:x.series_label,displayTestLabel:x.display_test_label,cardLabel:x.card_label,cardSubtitle:x.card_subtitle,attemptsCount:x.attempts_count,statusLabel:x.status_label,buttonLabel:x.button_label,coverUrl:x.cover_url,accessReason:access.reason}});
  }
  if(url.pathname==='/api/me/access' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,200,{ok:true,loggedIn:false,allowedTestIds:[],skillAccess:[],predictionAllowed:false,pro:null,course:false});
    const a=await getUserAccessSummary(u); return json(res,200,{ok:true,loggedIn:true,...a});
  }
  if(url.pathname==='/api/predictions' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để xem Prediction.'});
    const a=await getUserAccessSummary(u); if(!a.predictionAllowed)return json(res,403,{ok:false,message:'Prediction chỉ dành cho học viên có PRO hoặc đã đăng ký khóa học EIT.'});
    const rows=(await dbQuery('SELECT * FROM prediction_files WHERE published=TRUE ORDER BY created_at DESC')).rows; return json(res,200,{ok:true,predictions:rows});
  }
  if(url.pathname==='/api/courses' && req.method==='GET'){
    const rows=(await dbQuery('SELECT * FROM course_posts WHERE published=TRUE ORDER BY created_at ASC')).rows; return json(res,200,{ok:true,courses:rows});
  }
  if(url.pathname==='/api/store/catalog' && req.method==='GET'){
    const rows=(await dbQuery(`SELECT id,slug,product_type,title,subtitle,description,features,price,duration_days,skill_access,cover_url,vat_rate
      FROM store_products WHERE published=TRUE ORDER BY CASE WHEN product_type='pro' THEN 0 ELSE 1 END,created_at DESC`)).rows;
    const vat=(await dbQuery('SELECT vat_rate FROM payment_settings WHERE id=1 LIMIT 1')).rows[0];
    return json(res,200,{ok:true,defaultVatRate:Number(vat?.vat_rate??8),products:rows.map(x=>({id:x.id,slug:x.slug,type:x.product_type,title:x.title,subtitle:x.subtitle,description:x.description,features:Array.isArray(x.features)?x.features:[],price:Number(x.price),durationDays:Number(x.duration_days||0),skillAccess:Array.isArray(x.skill_access)?x.skill_access:[],coverUrl:x.cover_url||'',vatRate:x.vat_rate===null?null:Number(x.vat_rate)}))});
  }
  if(url.pathname==='/api/store/orders' && req.method==='POST'){
    const user=candidate(req); if(!user)return json(res,401,{ok:false,message:'Vui lòng đăng nhập trước khi thanh toán.'});
    const b=await body(req); const requested=Array.isArray(b.items)?b.items:[];
    if(!requested.length||requested.length>20)return json(res,400,{ok:false,message:'Giỏ hàng trống hoặc có quá nhiều mặt hàng.'});
    const quantities=new Map();
    for(const item of requested){const id=String(item.productId||'').trim();const qty=Math.max(1,Math.min(10,Math.floor(Number(item.quantity||1))));if(!/^[0-9a-f-]{36}$/i.test(id))return json(res,400,{ok:false,message:'Sản phẩm trong giỏ hàng không hợp lệ.'});quantities.set(id,(quantities.get(id)||0)+qty);}
    const client=await pool.connect(); let orderId='',orderCode='',transferCode='',summary=[]; let subtotal=0,vatAmount=0,total=0;
    try{
      await client.query('BEGIN');
      const productIds=[...quantities.keys()];
      const products=(await client.query(`SELECT * FROM store_products WHERE id=ANY($1::uuid[]) AND published=TRUE FOR SHARE`,[productIds])).rows;
      if(products.length!==productIds.length)throw new Error('Một hoặc nhiều sản phẩm đã ngừng bán. Hãy tải lại giỏ hàng.');
      const settings=(await client.query('SELECT * FROM payment_settings WHERE id=1 LIMIT 1')).rows[0]||{vat_rate:8};
      const globalVat=Number(settings.vat_rate??8);
      const items=[];
      for(const product of products){
        const quantity=quantities.get(product.id)||1;
        if(product.product_type==='document'&&quantity!==1)throw new Error('Mỗi tài liệu chỉ cần mua một lần.');
        if(product.product_type==='document'&&!product.file_key)throw new Error(`Tài liệu “${product.title}” chưa có file tải xuống.`);
        const unit=Number(product.price||0),lineSubtotal=unit*quantity;
        const rate=product.vat_rate===null||product.vat_rate===undefined?globalVat:Number(product.vat_rate);
        if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Thuế suất VAT của sản phẩm không hợp lệ.');
        const tax=Math.round(lineSubtotal*rate/100);
        subtotal+=lineSubtotal;vatAmount+=tax;
        items.push({product,quantity,unit,lineSubtotal,rate,tax});
        summary.push({title:product.title,rate,tax});
      }
      total=subtotal+vatAmount;
      orderId=crypto.randomUUID();
      const random=crypto.randomBytes(5).toString('hex').toUpperCase();
      orderCode=`RT9-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${random.slice(0,4)}`;
      transferCode=`RT9${random}`;
      await client.query(`INSERT INTO store_orders(id,user_id,order_code,transfer_code,status,customer_name,customer_email,subtotal,vat_amount,total_amount,vat_breakdown)
        VALUES($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10::jsonb)`,[orderId,user.id,orderCode,transferCode,user.full_name||'',user.email||'',subtotal,vatAmount,total,JSON.stringify(summary)]);
      for(const item of items){
        await client.query(`INSERT INTO store_order_items(id,order_id,product_id,product_type,product_title,quantity,unit_price,line_subtotal,vat_rate,vat_amount,duration_days,skill_access)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[crypto.randomUUID(),orderId,item.product.id,item.product.product_type,item.product.title,item.quantity,item.unit,item.lineSubtotal,item.rate,item.tax,Number(item.product.duration_days||0),JSON.stringify(Array.isArray(item.product.skill_access)?item.product.skill_access:[])]);
      }
      await client.query('COMMIT');
    }catch(err){try{await client.query('ROLLBACK')}catch{};return json(res,400,{ok:false,message:err.message||'Không thể tạo đơn hàng.'});}
    finally{client.release();}
    const settings=(await dbQuery('SELECT payment_title,qr_url,bank_code,bank_name,account_name,account_number,transfer_note,instructions,vat_rate FROM payment_settings WHERE id=1 LIMIT 1')).rows[0]||{};
    const qrUrl=makeVietQrUrl(settings,total,transferCode);
    const orderItems=(await dbQuery('SELECT product_title,product_type,quantity,unit_price,line_subtotal,vat_rate,vat_amount FROM store_order_items WHERE order_id=$1',[orderId])).rows;
    return json(res,201,{ok:true,order:{id:orderId,orderCode,transferCode,status:'pending',subtotal,vatAmount,totalAmount:total,items:orderItems},payment:{title:settings.payment_title||'ROAD TO HSK 9 · THANH TOÁN',qrUrl,qrIsDynamic:!!settings.bank_code&&!!settings.account_number,bankCode:settings.bank_code||'',bankName:settings.bank_name||'',accountName:settings.account_name||'',accountNumber:settings.account_number||'',instructions:settings.instructions||'Quét QR và nhập đúng nội dung chuyển khoản.'}});
  }
  if(url.pathname.match(/^\/api\/store\/orders\/[0-9a-f-]+$/i) && req.method==='GET'){
    const user=candidate(req); if(!user)return json(res,401,{ok:false,message:'Vui lòng đăng nhập lại.'});
    const id=url.pathname.split('/').pop(); const order=(await dbQuery('SELECT * FROM store_orders WHERE id=$1 AND user_id=$2 LIMIT 1',[id,user.id])).rows[0];
    if(!order)return json(res,404,{ok:false,message:'Không tìm thấy đơn hàng.'});
    const items=(await dbQuery('SELECT product_title,product_type,quantity,unit_price,line_subtotal,vat_rate,vat_amount,product_id FROM store_order_items WHERE order_id=$1 ORDER BY created_at',[id])).rows;
    const docs=order.status==='paid'?items.filter(x=>x.product_type==='document'&&x.product_id).map(x=>({title:x.product_title,downloadUrl:`/api/store/documents/${x.product_id}`})):[];
    return json(res,200,{ok:true,order:{id:order.id,orderCode:order.order_code,transferCode:order.transfer_code,status:order.status,subtotal:Number(order.subtotal),vatAmount:Number(order.vat_amount),totalAmount:Number(order.total_amount),createdAt:order.created_at,paidAt:order.paid_at,items,documents:docs}});
  }
  if(url.pathname==='/api/store/my-documents' && req.method==='GET'){
    const user=candidate(req); if(!user)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để xem tài liệu đã mua.'});
    const rows=(await dbQuery(`SELECT p.id,p.title,p.subtitle,p.description,p.features,p.cover_url,p.file_name,a.granted_at
      FROM document_access a JOIN store_products p ON p.id=a.product_id WHERE a.user_id=$1 ORDER BY a.granted_at DESC`,[user.id])).rows;
    return json(res,200,{ok:true,documents:rows.map(x=>({id:x.id,title:x.title,subtitle:x.subtitle,description:x.description,features:Array.isArray(x.features)?x.features:[],coverUrl:x.cover_url||'',fileName:x.file_name||'',grantedAt:x.granted_at,downloadUrl:`/api/store/documents/${x.id}`}))});
  }
  if(url.pathname.match(/^\/api\/store\/documents\/[0-9a-f-]+$/i) && req.method==='GET'){
    const user=candidate(req); if(!user)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để tải tài liệu.'});
    const id=url.pathname.split('/').pop();
    const row=(await dbQuery(`SELECT p.file_key,p.file_name FROM store_products p JOIN document_access a ON a.product_id=p.id WHERE p.id=$1 AND a.user_id=$2 LIMIT 1`,[id,user.id])).rows[0];
    if(!row?.file_key)return json(res,403,{ok:false,message:'Tài liệu chưa được mở khóa trong tài khoản này.'});
    const safeKey=path.basename(row.file_key); const file=path.join(PRIVATE_DOC_DIR,safeKey);
    fs.stat(file,(err,st)=>{if(err||!st.isFile())return json(res,404,{ok:false,message:'File tài liệu không còn tồn tại.'});
      const name=String(row.file_name||'tai-lieu.pdf').replace(/[\r\n"\\]/g,'_');
      res.writeHead(200,{'Content-Type':contentType(file),'Content-Length':st.size,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store'});
      fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    });
    return;
  }

  if(url.pathname==='/api/payment-settings' && req.method==='GET'){
    const r=await dbQuery('SELECT payment_title,qr_url,bank_code,bank_name,account_name,account_number,transfer_note,instructions,vat_rate,updated_at FROM payment_settings WHERE id=1 LIMIT 1');
    return json(res,200,{ok:true,settings:r.rows[0]||{}});
  }
  if(url.pathname==='/api/course-enrollments' && req.method==='POST'){
    const b=await body(req);
    const slug=String(b.courseSlug||'').trim(), studentName=String(b.fullName||'').trim(),
      dob=String(b.dob||'').trim(), band=String(b.currentBand||'').trim(),
      phone=String(b.phone||'').trim(), email=String(b.email||'').trim(), voucher=String(b.voucher||'').trim();
    if(!slug||!studentName||!dob||!band||!phone||!email) return json(res,400,{ok:false,message:'Vui lòng điền đầy đủ thông tin bắt buộc.'});
    const course=(await dbQuery('SELECT id,title FROM course_posts WHERE slug=$1 AND published=TRUE LIMIT 1',[slug])).rows[0];
    if(!course)return json(res,404,{ok:false,message:'Khóa học không tồn tại hoặc đã đóng đăng ký.'});
    const parsedBand=Number(band);
    if(!Number.isFinite(parsedBand)||parsedBand<0||parsedBand>9)return json(res,400,{ok:false,message:'Band hiện tại phải từ 0 đến 9.'});
    const c=candidate(req);
    let userId=c?.id||null;
    if(!userId){const urow=(await dbQuery(`SELECT id,email,full_name FROM users WHERE lower(trim(email))=lower(trim($1)) LIMIT 1`,[email])).rows[0]; userId=urow?.id||null;}
    const r=await dbQuery(`INSERT INTO course_enrollments(id,course_id,user_id,course_title,student_name,dob,current_band,phone,email,voucher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,created_at`,[crypto.randomUUID(),course.id,userId,course.title,studentName,dob,parsedBand,phone,email,voucher]);
    if(userId) await grantCoursePro({id:userId,email});
    return json(res,201,{ok:true,id:r.rows[0].id,courseSlug:slug,courseTitle:course.title,message:'Đăng ký khóa học thành công. Bạn sẽ được chuyển sang trang thanh toán.',proGranted:!!userId,redirect:`/payment.html?enrollment=${encodeURIComponent(r.rows[0].id)}&course=${encodeURIComponent(slug)}`});
  }

  if(url.pathname==='/api/admin/practice/audio' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req); const id=String(b.id||'').trim(); const audioUrl=String(b.audioUrl||'').trim();
    if(!id||!audioUrl)return json(res,400,{ok:false,message:'Thiếu mã đề hoặc đường dẫn audio.'});
    const r=await dbQuery('UPDATE practice_tests SET audio_url=$1,updated_at=NOW() WHERE id=$2 RETURNING id,audio_url',[audioUrl,id]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Không tìm thấy đề thi.'});
    return json(res,200,{ok:true,message:'Đã lưu audio mà không thay đổi câu hỏi.',audioUrl:r.rows[0].audio_url});
  }

  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const r=await dbQuery('SELECT id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name,published FROM practice_tests WHERE id=$1',[id]);
    if(!r.rows[0])return json(res,404,{ok:false,message:'Practice test not found.'});
    return json(res,200,{ok:true,test:r.rows[0]});
  }
  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const r=await dbQuery('DELETE FROM practice_tests WHERE id=$1',[id]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Practice test not found.'});
    return json(res,200,{ok:true,message:'Practice test deleted.'});
  }
  if(url.pathname==='/api/admin/hskk/upload-audio' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Phiên Admin đã hết hạn. Hãy đăng nhập lại.'});
    let files=[];
    try{({files}=await parseMultipart(req));}
    catch(err){
      const message=String(err?.message||'Upload audio thất bại.');
      const status=/quá lớn|too large|file size/i.test(message)?413:400;
      return json(res,status,{ok:false,message});
    }
    const f=files.find(x=>x.field==='audio');
    if(!f)return json(res,400,{ok:false,message:'Không nhận được file audio. Hãy chọn file tại đúng câu hỏi rồi upload lại.'});
    const allowed=/\.(mp3|wav|m4a|ogg|webm|aac|flac|opus)$/i;
    if(!allowed.test(f.original||'')){
      try{fs.unlinkSync(f.path)}catch{}
      return json(res,400,{ok:false,message:'Định dạng chưa hỗ trợ. Hãy dùng MP3, WAV, M4A, OGG, WEBM, AAC, FLAC hoặc OPUS.'});
    }
    if(!Number(f.size)||Number(f.size)>80*1024*1024){
      try{fs.unlinkSync(f.path)}catch{}
      return json(res,413,{ok:false,message:'Audio phải lớn hơn 0 byte và không vượt quá 80 MB.'});
    }
    return json(res,201,{ok:true,url:f.url,filename:f.original,mime:f.mime,size:f.size,message:'Đã upload audio cho câu hỏi.'});
  }
  if(url.pathname==='/api/admin/asset/upload' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {files}=await parseMultipart(req);
    const f=files.find(x=>x.field==='audio' || x.field==='file');
    if(!f)return json(res,400,{ok:false,message:'No file uploaded.'});
    if(!/\.(mp3|wav|m4a|ogg|webm|aac|flac|opus|png|jpe?g|webp|pdf)$/i.test(f.original))return json(res,400,{ok:false,message:'Unsupported file type.'});
    return json(res,201,{ok:true,url:f.url,filename:f.original,mime:f.mime,size:f.size});
  }
  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='PUT'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const b=await body(req);
    const answers=(b.answerKey && typeof b.answerKey==='object')?b.answerKey:{};
    const explanations=(b.explanations && typeof b.explanations==='object')?b.explanations:{};
    const content=(b.content && typeof b.content==='object')?b.content:null;
    await dbQuery('UPDATE practice_tests SET answer_key=$1::jsonb, explanations=$2::jsonb, content=COALESCE($3::jsonb,content), updated_at=NOW() WHERE id=$4',[JSON.stringify(answers),JSON.stringify(explanations),content?JSON.stringify(content):null,id]);
    return json(res,200,{ok:true,message:'Answer key and explanations saved.',answerCount:Object.keys(answers).filter(k=>String(answers[k]??'').trim()!=='').length});
  }
  if(url.pathname==='/api/admin/practice/import' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {fields,files}=await parseMultipart(req); const skill=String(fields.skill||'').toLowerCase(); const volume=Number(fields.volume||0); const testNo=Number(fields.testNo||0);
    if(!['listening','reading','writing','speaking'].includes(skill)||testNo<=0)return json(res,400,{ok:false,message:'Skill và Test number là bắt buộc. Volume có thể bỏ trống cho đề custom.'});
    const doc=files.find(f=>f.field==='document'); const audio=files.find(f=>f.field==='audio');
    if(!doc)return json(res,400,{ok:false,message:'Hãy tải file Word (.docx) hoặc TXT.'});
    if(!isAllowedDoc(doc.original))return json(res,400,{ok:false,message:'Tài liệu phải là DOCX hoặc TXT.'});
    let text=''; if(/\.docx$/i.test(doc.original)) text=parseDocxText(doc.path); else text=fs.readFileSync(doc.path,'utf8');
    let parsed=parseImportedText(text);
    if(!parsed.questions.length && ['writing','speaking'].includes(skill)){
      const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const generic=[]; let current=null;
      for(const line of lines){
        const tm=line.match(/^Task\s*(1|2)\s*[:.-]?\s*(.*)$/i);
        const pm=line.match(/^Part\s*(1|2|3)\s*[:.-]?\s*(.*)$/i);
        const qm=line.match(/^(\d+)\s*[.)\-:]\s*(.+)$/);
        if(tm||pm){ if(current)generic.push(current); current={number:tm?tm[1]:pm[1],text:(tm?tm[2]:pm[2])||line,type:skill,task:tm?`Task ${tm[1]}`:`Part ${pm[1]}`,part:pm?Number(pm[1]):undefined}; }
        else if(qm){ if(current && current.text && current.text!==line) current.questions=(current.questions||[]).concat([{number:qm[1],text:qm[2],type:skill}]); else generic.push({number:qm[1],text:qm[2],type:skill}); }
        else if(current && line.length>2) current.text+=(current.text?'\n':'')+line;
      }
      if(current)generic.push(current);
      parsed.questions=generic.flatMap(x=>x.questions||[x]).map(x=>({number:String(x.number),text:String(x.text||'').trim(),type:skill,task:x.task,part:x.part,limit:x.part===2?90:30}));
    }
    const content={questions:parsed.questions,rawText:parsed.rawText,defaultTextAlign:['left','justify','center','right'].includes(String(fields.textAlign||'justify'))?String(fields.textAlign||'justify'):'justify'};
    const audioUrl=audio && isAllowedAudio(audio.original)?audio.url:'';
    const id=crypto.randomUUID();
    await dbQuery(`INSERT INTO practice_tests(id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,category_id,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,TRUE) ON CONFLICT(skill,volume,test_no) DO UPDATE SET title=EXCLUDED.title,question_type=EXCLUDED.question_type,duration_minutes=EXCLUDED.duration_minutes,total_questions=EXCLUDED.total_questions,content=EXCLUDED.content,answer_key=EXCLUDED.answer_key,explanations=EXCLUDED.explanations,audio_url=CASE WHEN EXCLUDED.audio_url<>'' THEN EXCLUDED.audio_url ELSE practice_tests.audio_url END,source_file=EXCLUDED.source_file,source_url=EXCLUDED.source_url,category_id=EXCLUDED.category_id,updated_at=NOW()`,[id,skill,volume,testNo,fields.title||`${skill.toUpperCase()} VOL ${volume} TEST ${testNo}`,fields.questionType||'',Number(fields.duration||60),parsed.questions.length||Number(fields.totalQuestions||40),JSON.stringify(content),JSON.stringify(parsed.answerKey),JSON.stringify(parsed.explanations),audioUrl,doc.original,doc.url,String(fields.categoryId||'').trim()||null]);
    return json(res,201,{ok:true,message:'Imported successfully.',test:{skill,volume,testNo,questions:parsed.questions.length,answers:Object.keys(parsed.answerKey).length,audioUrl}});
  }
  if(url.pathname==='/api/admin/practice/json' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req);
    const skill=String(b.skill||'').toLowerCase();
    const volume=Number.isFinite(Number(b.volume))?Number(b.volume):0;
    const testNo=Number(b.testNo||0);
    if(!['listening','reading','writing','speaking'].includes(skill)||testNo<=0)return json(res,400,{ok:false,message:'Skill và Test number là bắt buộc. Volume có thể bỏ trống cho đề custom.'});
    const id=b.id||crypto.randomUUID();
    const q=`INSERT INTO practice_tests(id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,TRUE)
      ON CONFLICT(skill,volume,test_no) DO UPDATE SET title=EXCLUDED.title,question_type=EXCLUDED.question_type,duration_minutes=EXCLUDED.duration_minutes,total_questions=EXCLUDED.total_questions,content=EXCLUDED.content,answer_key=EXCLUDED.answer_key,explanations=EXCLUDED.explanations,audio_url=EXCLUDED.audio_url,source_file=CASE WHEN EXCLUDED.source_file<>'' THEN EXCLUDED.source_file ELSE practice_tests.source_file END,source_url=CASE WHEN EXCLUDED.source_url<>'' THEN EXCLUDED.source_url ELSE practice_tests.source_url END,series_label=EXCLUDED.series_label,display_test_label=EXCLUDED.display_test_label,card_label=EXCLUDED.card_label,card_subtitle=EXCLUDED.card_subtitle,attempts_count=EXCLUDED.attempts_count,status_label=EXCLUDED.status_label,button_label=EXCLUDED.button_label,cover_url=EXCLUDED.cover_url,category_id=EXCLUDED.category_id,updated_at=NOW()`;
    await dbQuery(q,[id,skill,volume,testNo,b.title||`${skill.toUpperCase()} TEST ${testNo}`,b.questionType||'',Number(b.durationMinutes||60),Number(b.totalQuestions||40),JSON.stringify(b.content||{}),JSON.stringify(b.answerKey||{}),JSON.stringify(b.explanations||{}),String(b.audioUrl||''),String(b.sourceFile||''),String(b.sourceUrl||''),String(b.seriesLabel||''),String(b.displayTestLabel||''),String(b.cardLabel||''),String(b.cardSubtitle||''),Number(b.attemptsCount||0),String(b.statusLabel||'Chưa hoàn thành'),String(b.buttonLabel||'Kiểm tra'),String(b.coverUrl||''),String(b.categoryId||'').trim()||null]);
    return json(res,201,{ok:true,id,message:'Practice test saved.'});
  }
  if(url.pathname==='/api/admin/prediction/upload' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const {fields,files}=await parseMultipart(req); const pdf=files.find(f=>f.field==='pdf');
    if(!pdf||!isAllowedPdf(pdf.original))return json(res,400,{ok:false,message:'Hãy tải file PDF hợp lệ.'}); const skill=String(fields.skill||'all').toLowerCase();
    await dbQuery('INSERT INTO prediction_files(id,skill,title,week_label,pdf_url) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),skill,fields.title||`IELTS Prediction ${skill}`,fields.weekLabel||'',pdf.url]); return json(res,201,{ok:true,pdfUrl:pdf.url});
  }
  if(url.pathname==='/api/admin/course/upload' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const {fields,files}=await parseMultipart(req); const poster=files.find(f=>f.field==='poster');
    const title=String(fields.title||'IELTS Course').trim();
    const slug=String(fields.slug||title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).trim();
    const price=Math.max(0,Number(fields.price||500000)); const students=Math.max(0,Number(fields.studentCount||0));
    const existing=(await dbQuery('SELECT id FROM course_posts WHERE slug=$1 LIMIT 1',[slug])).rows[0];
    if(existing){
      await dbQuery('UPDATE course_posts SET skill=$1,title=$2,description=$3,poster_url=CASE WHEN $4<>\'\' THEN $4 ELSE poster_url END,link_url=$5,price=$6,student_count=$7 WHERE id=$8',[String(fields.skill||'speaking').toLowerCase(),title,fields.description||'',poster?.url||'',fields.linkUrl||'',price,students,existing.id]);
    }else{
      await dbQuery('INSERT INTO course_posts(id,skill,title,description,poster_url,link_url,slug,price,student_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[crypto.randomUUID(),String(fields.skill||'speaking').toLowerCase(),title,fields.description||'',poster?.url||'',fields.linkUrl||'',slug,price,students]);
    }
    return json(res,201,{ok:true});
  }
  if(url.pathname==='/api/admin/payment-settings' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const r=await dbQuery('SELECT * FROM payment_settings WHERE id=1 LIMIT 1');
    return json(res,200,{ok:true,settings:r.rows[0]||{}});
  }
  if(url.pathname==='/api/admin/payment-settings' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {fields,files}=await parseMultipart(req);
    const qr=files.find(f=>f.field==='qr');
    const current=(await dbQuery('SELECT qr_url FROM payment_settings WHERE id=1 LIMIT 1')).rows[0]||{};
    const qrUrl=qr?.url||current.qr_url||'';
    const vatRaw=String(fields.vatRate??'8').trim();
    const vatRate=vatRaw===''?8:Number(vatRaw);
    if(!Number.isFinite(vatRate)||vatRate<0||vatRate>100)return json(res,400,{ok:false,message:'VAT phải nằm trong khoảng 0–100%.'});
    await dbQuery(`INSERT INTO payment_settings(id,payment_title,qr_url,bank_code,bank_name,account_name,account_number,transfer_note,instructions,vat_rate)
      VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET payment_title=EXCLUDED.payment_title,qr_url=EXCLUDED.qr_url,bank_code=EXCLUDED.bank_code,bank_name=EXCLUDED.bank_name,account_name=EXCLUDED.account_name,account_number=EXCLUDED.account_number,transfer_note=EXCLUDED.transfer_note,instructions=EXCLUDED.instructions,vat_rate=EXCLUDED.vat_rate,updated_at=NOW()`,
      [String(fields.paymentTitle||'ROAD TO HSK 9 · THANH TOÁN').trim(),qrUrl,String(fields.bankCode||'').trim(),String(fields.bankName||'').trim(),String(fields.accountName||'').trim(),String(fields.accountNumber||'').trim(),String(fields.transferNote||'ROAD TO HSK 9').trim(),String(fields.instructions||'').trim(),vatRate]);
    return json(res,200,{ok:true,qrUrl,vatRate});
  }

  if(url.pathname==='/api/admin/store/products' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT id,slug,product_type,title,subtitle,description,features,price,duration_days,skill_access,cover_url,file_name,vat_rate,published,created_at,updated_at FROM store_products ORDER BY created_at DESC`)).rows;
    return json(res,200,{ok:true,products:rows});
  }
  if(url.pathname==='/api/admin/store/products' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {fields,files}=await parseMultipart(req);
    const id=String(fields.id||'').trim()||crypto.randomUUID();
    const type=String(fields.productType||'pro').trim().toLowerCase();
    const title=String(fields.title||'').trim();
    if(!['pro','document'].includes(type)||!title)return json(res,400,{ok:false,message:'Vui lòng nhập tên và loại sản phẩm hợp lệ.'});
    const slug=String(fields.slug||title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).trim().toLowerCase();
    if(!slug||slug.length>120)return json(res,400,{ok:false,message:'Đường dẫn sản phẩm không hợp lệ.'});
    const price=Math.round(Number(fields.price||0));
    if(!Number.isFinite(price)||price<0||price>1000000000)return json(res,400,{ok:false,message:'Giá sản phẩm không hợp lệ.'});
    const durationDays=type==='pro'?Math.max(1,Math.min(3650,Math.floor(Number(fields.durationDays||30)))):0;
    const rawSkills=String(fields.skillAccess||'listening,reading,writing,speaking').split(',').map(x=>x.trim().toLowerCase());
    const skills=type==='pro'?normalizeSkills(rawSkills):[];
    if(type==='pro'&&!skills.length)return json(res,400,{ok:false,message:'Gói PRO cần chọn ít nhất một kỹ năng.'});
    const vatText=String(fields.vatRate??'').trim();
    const vatRate=vatText===''?null:Number(vatText);
    if(vatRate!==null&&(!Number.isFinite(vatRate)||vatRate<0||vatRate>100))return json(res,400,{ok:false,message:'VAT phải từ 0 đến 100%; để trống để dùng mức mặc định.'});
    const features=String(fields.features||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,30);
    const current=(await dbQuery('SELECT cover_url,file_key,file_name FROM store_products WHERE id=$1 LIMIT 1',[id])).rows[0]||{};
    const cover=files.find(f=>f.field==='coverFile');
    const document=files.find(f=>f.field==='documentFile');
    const coverUrl=cover?.url||current.cover_url||'';
    let fileKey=current.file_key||'',fileName=current.file_name||'';
    if(document){
      if(!/\.(pdf|docx|pptx|xlsx|zip|txt)$/i.test(document.original))return json(res,400,{ok:false,message:'Tệp tài liệu chỉ hỗ trợ PDF, DOCX, PPTX, XLSX, ZIP hoặc TXT.'});
      fileKey=`${crypto.randomUUID()}${path.extname(document.original).toLowerCase()}`;
      const target=path.join(PRIVATE_DOC_DIR,fileKey);
      fs.renameSync(document.path,target);
      fileName=String(document.original).replace(/[\r\n]/g,'_').slice(0,180);
    }
    if(type==='document'&&!fileKey)return json(res,400,{ok:false,message:'Tài liệu cần có file tải xuống. Hãy upload file trước khi lưu.'});
    if(type==='pro'){fileKey='';fileName='';}
    const published=String(fields.published??'true')!=='false';
    try{
      await dbQuery(`INSERT INTO store_products(id,slug,product_type,title,subtitle,description,features,price,duration_days,skill_access,cover_url,file_key,file_name,vat_rate,published)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
        ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,product_type=EXCLUDED.product_type,title=EXCLUDED.title,subtitle=EXCLUDED.subtitle,description=EXCLUDED.description,features=EXCLUDED.features,price=EXCLUDED.price,duration_days=EXCLUDED.duration_days,skill_access=EXCLUDED.skill_access,cover_url=EXCLUDED.cover_url,file_key=EXCLUDED.file_key,file_name=EXCLUDED.file_name,vat_rate=EXCLUDED.vat_rate,published=EXCLUDED.published,updated_at=NOW()`,
        [id,slug,type,title,String(fields.subtitle||''),String(fields.description||''),JSON.stringify(features),price,durationDays,JSON.stringify(skills),coverUrl,fileKey,fileName,vatRate,published]);
    }catch(err){if(err.code==='23505')return json(res,409,{ok:false,message:'Đường dẫn (slug) đã tồn tại. Hãy chọn slug khác.'});throw err;}
    return json(res,200,{ok:true,id,message:'Đã lưu sản phẩm/tài liệu.'});
  }
  if(url.pathname.match(/^\/api\/admin\/store\/products\/[0-9a-f-]+$/i) && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop(); const b=await body(req);
    const r=await dbQuery('UPDATE store_products SET published=$2,updated_at=NOW() WHERE id=$1 RETURNING id,published',[id,!!b.published]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy sản phẩm.'});
    return json(res,200,{ok:true,product:r.rows[0]});
  }
  if(url.pathname.match(/^\/api\/admin\/store\/products\/[0-9a-f-]+$/i) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop(); const r=await dbQuery('UPDATE store_products SET published=FALSE,updated_at=NOW() WHERE id=$1 RETURNING id',[id]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy sản phẩm.'});
    return json(res,200,{ok:true,message:'Đã ẩn sản phẩm khỏi cửa hàng.'});
  }
  if(url.pathname==='/api/admin/store/orders' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const orders=(await dbQuery(`SELECT o.*,u.full_name,u.email FROM store_orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 300`)).rows;
    const ids=orders.map(o=>o.id); let items=[];
    if(ids.length)items=(await dbQuery(`SELECT order_id,product_title,product_type,quantity,unit_price,line_subtotal,vat_rate,vat_amount FROM store_order_items WHERE order_id=ANY($1::uuid[]) ORDER BY created_at`,[ids])).rows;
    const grouped=new Map(); for(const item of items){if(!grouped.has(item.order_id))grouped.set(item.order_id,[]);grouped.get(item.order_id).push(item);}
    return json(res,200,{ok:true,orders:orders.map(o=>({id:o.id,orderCode:o.order_code,transferCode:o.transfer_code,status:o.status,customerName:o.full_name||o.customer_name,customerEmail:o.email||o.customer_email,subtotal:Number(o.subtotal),vatAmount:Number(o.vat_amount),totalAmount:Number(o.total_amount),createdAt:o.created_at,paidAt:o.paid_at,transactionId:o.provider_transaction_id,items:grouped.get(o.id)||[]}))});
  }
  if(url.pathname.match(/^\/api\/admin\/store\/orders\/[0-9a-f-]+\/mark-paid$/i) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/')[5]; const b=await body(req);
    const order=(await dbQuery('SELECT id,total_amount,status FROM store_orders WHERE id=$1 LIMIT 1',[id])).rows[0];
    if(!order)return json(res,404,{ok:false,message:'Không tìm thấy đơn hàng.'});
    if(order.status==='paid')return json(res,200,{ok:true,message:'Đơn hàng đã thanh toán trước đó.'});
    const note=String(b.note||'Đối soát thủ công bởi Admin').slice(0,300);
    const result=await fulfillStoreOrder(id,{provider:'admin-manual',id:`manual-${id}`,amount:Number(order.total_amount),raw:{note}});
    return json(res,200,{ok:true,...result,message:'Đã xác nhận đối soát và cấp quyền.'});
  }
  if(url.pathname==='/api/admin/course-enrollments' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase();
    const rows=(await dbQuery(`SELECT ce.*,cp.slug AS course_slug FROM course_enrollments ce LEFT JOIN course_posts cp ON cp.id=ce.course_id WHERE $1='' OR lower(ce.student_name) LIKE '%'||$1||'%' OR lower(ce.email) LIKE '%'||$1||'%' OR lower(ce.phone) LIKE '%'||$1||'%' OR lower(ce.course_title) LIKE '%'||$1||'%' OR lower(COALESCE(ce.voucher,'')) LIKE '%'||$1||'%' ORDER BY ce.created_at DESC`,[q])).rows;
    return json(res,200,{ok:true,enrollments:rows.map(x=>({id:x.id,courseId:x.course_id,courseSlug:x.course_slug||'',courseTitle:x.course_title,studentName:x.student_name,dob:x.dob||'',currentBand:x.current_band==null?null:Number(x.current_band),phone:x.phone,email:x.email,voucher:x.voucher||'',status:x.status,createdAt:x.created_at}))});
  }

  if(url.pathname.match(/^\/api\/admin\/pro-orders\/[^/]+$/) && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop(); const b=await body(req); const order=(await dbQuery('SELECT * FROM pro_orders WHERE id=$1 LIMIT 1',[id])).rows[0]; if(!order)return json(res,404,{ok:false,message:'PRO order không tồn tại.'});
    const status=String(b.status||'pending'); if(status!=='approved' && status!=='rejected' && status!=='pending')return json(res,400,{ok:false,message:'Trạng thái không hợp lệ.'});
    await dbQuery('UPDATE pro_orders SET status=$1,updated_at=NOW() WHERE id=$2',[status,id]);
    if(status==='approved'){
      const user=(order.user_id?(await dbQuery('SELECT id FROM users WHERE id=$1',[order.user_id])).rows[0]:null) || (await dbQuery(`SELECT id FROM users WHERE lower(trim(email))=$1 ORDER BY created_at DESC LIMIT 1`,[String(order.email||'').trim().toLowerCase()])).rows[0];
      if(user){
        const plan=getProPlan(order.plan);
        const skills=Number(plan?.skills||order.skills||0);
        const skillAccess=plan?.skillAccess?.length?plan.skillAccess:normalizeSkills(b.skillAccess);
        const durationDays=Math.max(1,Number(plan?.durationDays||order.duration_days||30));
        if(!skills||skillAccess.length!==skills)return json(res,400,{ok:false,message:`Không xác định được kỹ năng của đơn PRO ${order.id}.`});
        await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'purchase','active',NOW(),NOW()+make_interval(days=>$5)) ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+make_interval(days=>$5)),source='purchase',updated_at=NOW()`,[crypto.randomUUID(),user.id,skills,JSON.stringify(skillAccess),durationDays]);
      }
    }
    return json(res,200,{ok:true,message:status==='approved'?'Đã duyệt PRO.':status==='rejected'?'Đã từ chối đơn PRO.':'Đã cập nhật đơn PRO.'});
  }
  if(url.pathname==='/api/admin/pro-orders' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT id,user_id,student_name,email,phone,skills,amount,status,plan,duration_days,skill_access,transfer_code,provider_transaction_id,created_at FROM pro_orders ORDER BY created_at DESC`)).rows;
    return json(res,200,{ok:true,orders:rows.map(x=>({id:x.id,userId:x.user_id||'',studentName:x.student_name,email:x.email,phone:x.phone||'',skills:Number(x.skills),amount:Number(x.amount),status:x.status,plan:x.plan||'',durationDays:Number(x.duration_days||30),skillAccess:Array.isArray(x.skill_access)?x.skill_access:[],transferCode:x.transfer_code||'',transactionId:x.provider_transaction_id||'',createdAt:x.created_at}))});
  }
  if(url.pathname==='/api/admin/content' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const tests=(await dbQuery('SELECT id,skill,volume,test_no,title,question_type,total_questions,audio_url,source_file,source_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name,published,updated_at FROM practice_tests ORDER BY skill,volume,test_no')).rows; const predictions=(await dbQuery('SELECT * FROM prediction_files ORDER BY created_at DESC')).rows; const courses=(await dbQuery('SELECT * FROM course_posts ORDER BY created_at ASC')).rows; return json(res,200,{ok:true,tests,predictions,courses});
  }
  if(url.pathname==='/api/admin/mock-exams' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const exams=(await dbQuery('SELECT * FROM hsk_mock_exams ORDER BY updated_at DESC')).rows;
    const attempts=(await dbQuery(`SELECT a.id,a.student_name,a.candidate_code,a.answers,a.recording_url,a.submitted_at,e.title AS exam_title FROM hsk_mock_attempts a LEFT JOIN hsk_mock_exams e ON e.id=a.mock_exam_id ORDER BY a.submitted_at DESC LIMIT 100`)).rows;
    return json(res,200,{ok:true,exams,attempts});
  }
  if(url.pathname==='/api/admin/mock-exams' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req), id=String(b.id||crypto.randomUUID());
    const title=String(b.title||'HSK 6 · Full Mock Exam').trim();
    const ids={listening:String(b.listeningTestId||''),reading:String(b.readingTestId||''),writing:String(b.writingTestId||''),hskk:String(b.hskkTestId||'')};
    if(!title||Object.values(ids).some(x=>!x))return json(res,400,{ok:false,message:'Vui lòng nhập tên và chọn đủ 4 đề Listening, Reading, Writing, HSKK.'});
    const expected={listening:'listening',reading:'reading',writing:'writing',hskk:'speaking'};
    for(const [key,testId] of Object.entries(ids)){
      const row=(await dbQuery('SELECT skill,volume,published FROM practice_tests WHERE id=$1 LIMIT 1',[testId])).rows[0];
      if(!row||row.published!==true||Number(row.volume)!==6||String(row.skill).toLowerCase()!==expected[key])return json(res,400,{ok:false,message:`Đề ${key.toUpperCase()} phải là đề HSK 6 đã được lưu trong kho đề.`});
    }
    const minutes={};
    for(const key of ['listening','reading','writing','hskk']){const n=Number(b.sectionMinutes?.[key]??({listening:35,reading:50,writing:45,hskk:25}[key]));if(!Number.isFinite(n)||n<1||n>240)return json(res,400,{ok:false,message:`Thời gian ${key.toUpperCase()} không hợp lệ.`});minutes[key]=Math.round(n)}
    const r=await dbQuery(`INSERT INTO hsk_mock_exams(id,title,description,listening_test_id,reading_test_id,writing_test_id,hskk_test_id,section_minutes,published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,listening_test_id=EXCLUDED.listening_test_id,reading_test_id=EXCLUDED.reading_test_id,writing_test_id=EXCLUDED.writing_test_id,hskk_test_id=EXCLUDED.hskk_test_id,section_minutes=EXCLUDED.section_minutes,published=EXCLUDED.published,updated_at=NOW()
      RETURNING id,title,published,updated_at`,[id,title,String(b.description||''),ids.listening,ids.reading,ids.writing,ids.hskk,JSON.stringify(minutes),b.published!==false]);
    return json(res,200,{ok:true,exam:r.rows[0],message:'Đã lưu cấu hình thi thử HSK 6.'});
  }
  if(url.pathname.match(/^\/api\/admin\/mock-exams\/[0-9a-f-]+$/i) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop();
    const r=await dbQuery('DELETE FROM hsk_mock_exams WHERE id=$1',[id]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy bộ đề thi thử.'});
    return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/admin/mock-exams/attempts' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const attempts=(await dbQuery(`SELECT a.id,a.student_name,a.candidate_code,a.answers,a.recording_url,a.submitted_at,e.title AS exam_title FROM hsk_mock_attempts a LEFT JOIN hsk_mock_exams e ON e.id=a.mock_exam_id ORDER BY a.submitted_at DESC LIMIT 200`)).rows;
    return json(res,200,{ok:true,attempts});
  }

  if(url.pathname==='/api/candidate/login' && req.method==='POST'){
    const b=await body(req);
    const username=String(b.username||b.registrationid||b.eitcode||'').trim().toUpperCase();
    const password=String(b.password||'');
    if(!username||!password) return json(res,400,{ok:false,message:'Vui lòng nhập username và password.'});
    try{
      // Username is the account Registration ID; legacy EITCODEs remain accepted.
      const rows=(await dbQuery(`SELECT * FROM users WHERE (upper(trim(COALESCE(registration_id,'')))=$1 OR upper(trim(COALESCE(eit_code,'')))=$1) AND active=TRUE ORDER BY created_at DESC LIMIT 1`,[username])).rows;
      const u=rows[0];
      if(!u || !verifyPassword(password,u.password_hash))return json(res,401,{ok:false,message:'Username hoặc password chưa chính xác.'});
      await grantCoursePro(u);
      const t=crypto.randomBytes(32).toString('hex'); CANDIDATE_TOKENS.set(t,{expiresAt:Date.now()+12*60*60*1000,user:u});
      return json(res,200,{ok:true,token:t,user:{id:u.id,fullname:u.full_name,username:u.registration_id||u.eit_code,dob:u.dob,registrationid:u.registration_id,eitcode:u.eit_code,email:u.email||''}});
    }catch(err){
      console.error('Candidate login database error:',err);
      return json(res,503,{ok:false,message:'Không thể kết nối dữ liệu tài khoản. Vui lòng thử lại sau.'});
    }
  }

  if(url.pathname.match(/^\/api\/ai\/review\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    const id=url.pathname.split('/').pop();
    const row=(await dbQuery(`SELECT r.*,s.user_id,s.test_id,s.test_title,s.skill,s.submitted_at FROM ai_skill_reviews r JOIN submissions s ON s.id=r.submission_id WHERE r.submission_id=$1`,[id])).rows[0];
    if(!row || String(row.user_id)!==String(u.id)) return json(res,404,{ok:false,message:'AI review not found.'});
    let ent=null; try{await grantCoursePro(u); ent=await getEntitlement(u.id)}catch{}
    const isMockTest=['WRITING-TEST-1','SPEAKING-TEST-1'].includes(String(row.test_id||'')) || String(row.test_id||'').startsWith('HSK6-WRITING-');
    const reviewSkill=String(row.skill).toLowerCase();
    const detailAllowed=isMockTest || (['writing','translation'].includes(reviewSkill)?isProWriting(ent):isProSpeaking(ent));
    const result=typeof row.result==='object'?row.result:{};
    let summary={overallBand:row.overall_band==null?null:Number(row.overall_band)};
    if(String(row.skill).toLowerCase()==='writing'){
      if(Array.isArray(result.taskReviews)){
        summary={...summary,overallScore:result.overallScore??row.overall_band,levelEstimate:result.levelEstimate||'',criteria:result.criteria||[],taskReviews:result.taskReviews.map(x=>({number:x.number,task:x.task||'',score:x.score||0,max:x.max||100,summary:x.summary||'',strengths:(x.strengths||[]).slice(0,2),improvements:(x.improvements||[]).slice(0,3)})),strengths:(result.strengths||[]).slice(0,3),improvements:(result.improvements||[]).slice(0,3),overallFeedback:result.overallFeedback||''};
      }else{
        summary={...summary,task1:{criteria:result.task1?.criteria||{},band:result.task1?.band??null,summary:result.task1?.summary||'',improvements:(result.task1?.improvements||[]).slice(0,3)},task2:{criteria:result.task2?.criteria||{},band:result.task2?.band??null,summary:result.task2?.summary||'',improvements:(result.task2?.improvements||[]).slice(0,3)},examiner_summary:result.examiner_summary||'',priority_fixes:(result.priority_fixes||[]).slice(0,3)};
      }
    } else if(String(row.skill).toLowerCase()==='translation'){summary={...summary,overallScore:result.overallScore??row.overall_band,levelEstimate:result.levelEstimate||'',criteria:result.criteria||[],translationReviews:(result.translationReviews||[]).map(x=>({number:x.number,score:x.score||0,max:x.max||100,direction:x.direction||'',source:x.source||'',studentVersion:x.studentVersion||'',referenceVersion:x.referenceVersion||'',feedback:x.feedback||'',errors:(x.errors||[]).slice(0,3)})),strengths:(result.strengths||[]).slice(0,3),improvements:(result.improvements||[]).slice(0,3),overallFeedback:result.overallFeedback||''};} else if(String(row.skill).toLowerCase()==='speaking'){summary={...summary,criteria:result.criteria||{},part_feedback:(result.part_feedback||[]).map(x=>({part:x.part,summary:x.summary||'',improvements:(x.improvements||[]).slice(0,2)})),examiner_summary:result.examiner_summary||'',priority_fixes:(result.priority_fixes||[]).slice(0,3)};}
    const safe={ok:true,skill:row.skill,testId:row.test_id,submissionId:row.submission_id,model:'AI',status:row.status,errorMessage:row.status==='failed'?'AI chưa thể chấm bài này. Vui lòng thử lại hoặc liên hệ quản trị viên.':'',overallBand:row.overall_band==null?null:Number(row.overall_band),overallScore:row.overall_band==null?null:Number(row.overall_band),detailAllowed,review:detailAllowed?result:summary};
    return json(res,200,safe);
  }

  if(url.pathname.startsWith('/api/admin/ai-review/') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop(); const row=(await dbQuery(`SELECT r.*,s.student_name,s.student_email,s.test_title,s.skill FROM ai_skill_reviews r JOIN submissions s ON s.id=r.submission_id WHERE r.submission_id=$1`,[id])).rows[0];
    if(!row)return json(res,404,{ok:false,message:'AI review not found.'});
    return json(res,200,{ok:true,review:{submissionId:row.submission_id,studentName:row.student_name,studentEmail:row.student_email,skill:row.skill,model:'AI',status:row.status,errorMessage:row.status==='failed'?'AI chưa thể chấm bài này.':'',overallBand:row.overall_band==null?null:Number(row.overall_band),result:row.result&&typeof row.result==='object'?row.result:{}}});
  }

  if(url.pathname==='/api/mock-exams/submit' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'});
    const {fields,files}=await parseMultipart(req);
    const examId=String(fields.examId||'');
    const exam=(await dbQuery('SELECT id FROM hsk_mock_exams WHERE id=$1 AND published=TRUE LIMIT 1',[examId])).rows[0];
    if(!exam)return json(res,404,{ok:false,message:'Không tìm thấy bộ thi thử.'});
    let answers={};try{answers=JSON.parse(fields.answers||'{}')}catch{return json(res,400,{ok:false,message:'Dữ liệu câu trả lời không hợp lệ.'})}
    const recording=files.find(f=>f.field==='hskkRecording');
    if(recording&&!/\.(webm|mp3|wav|m4a|ogg)$/i.test(recording.original))return json(res,400,{ok:false,message:'Định dạng ghi âm không được hỗ trợ.'});
    const id=crypto.randomUUID();
    await dbQuery(`INSERT INTO hsk_mock_attempts(id,user_id,mock_exam_id,student_name,candidate_code,answers,recording_url) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[id,u.id,examId,String(fields.studentName||u.full_name||''),String(fields.candidateCode||u.registration_id||u.eit_code||''),JSON.stringify(answers),recording?.url||'']);
    return json(res,201,{ok:true,id,recordingUrl:recording?.url||'',message:'Đã nộp bài thi thử HSK 6.'});
  }

  if(url.pathname==='/api/submit' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    const b=await body(req); if(!b.testId || !b.answers)return json(res,400,{ok:false,message:'Missing testId or answers'});
    const sid=crypto.randomUUID();
    await dbQuery(`INSERT INTO submissions(id,user_id,student_name,student_email,student_code,eit_code,dob,test_id,test_title,skill,answers,highlights,notes,total,score,auto_submitted,elapsed_seconds)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,NULL,$15,$16)`,[
      sid,u.id,u.full_name,u.email||'',u.registration_id,u.eit_code,u.dob||null,String(b.testId),String(b.testTitle||''),String(b.skill||''),JSON.stringify(b.answers),JSON.stringify(b.highlights||[]),JSON.stringify(b.notes||[]),b.total==null?40:Number(b.total),!!b.autoSubmitted,Number(b.elapsedSeconds||0)]);
    let ai=null; let aiError='';
    try{
      const skill=String(b.skill||'').toLowerCase();
      const testTitle=String(b.testTitle||'');
      const hskVolume=Number(b.volume||0);
      const hskMode=b.hskMode===true || b.isHsk===true || String(b.examSystem||'').toLowerCase()==='hsk' || /^hsk/i.test(String(b.testId||'')) || (hskVolume>=7 && hskVolume<=9) || /\bHSK\s*(?:7|8|9)(?:\s*[-–]\s*9)?\b/i.test(testTitle);
      if(skill==='writing' && !b.hsk5Mode && hskMode){
        const tasks=Array.isArray(b.tasks)?b.tasks:[
          {number:'1',task:'writing',text:String(b.task1Prompt||'')},
          {number:'2',task:'writing',text:String(b.task2Prompt||'')}
        ].filter(t=>t.text);
        const answers=b.answers&&typeof b.answers==='object'?{...b.answers}:{};
        if(b.task1Answer!==undefined)answers['1']=String(b.task1Answer||'');
        if(b.task2Answer!==undefined)answers['2']=String(b.task2Answer||'');
        const rid=crypto.randomUUID();
        await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,status,error_message,result) VALUES($1,$2,$3,'writing','AI','pending','','{}'::jsonb) ON CONFLICT(submission_id) DO UPDATE SET model='AI',status='pending',error_message='',result='{}'::jsonb,overall_band=NULL,updated_at=NOW()`,[rid,sid,u.id]);
        setImmediate(async()=>{
          try{
            const feedback=(Number(b.volume)===6 && b.hsk6Writing===true)
              ? await gradeHsk6SummaryWriting({tasks,answers,testTitle})
              : await gradeHskWriting({tasks,answers,testTitle,volume:b.volume||7});
            await dbQuery(`UPDATE ai_skill_reviews SET model='AI',overall_band=$1,result=$2::jsonb,status='completed',error_message='',updated_at=NOW() WHERE submission_id=$3`,[feedback.overallScore,JSON.stringify(feedback),sid]);
          }catch(err){
            console.error('HSK Writing AI grading failed:',err);
            try{await dbQuery(`UPDATE ai_skill_reviews SET model='AI',status='failed',error_message='AI_GRADING_FAILED',updated_at=NOW() WHERE submission_id=$1`,[sid]);}
            catch(dbErr){console.error('HSK Writing failure status update failed:',dbErr);}
          }
        });
        return json(res,202,{ok:true,id:sid,message:'Đã lưu bài viết. AI đang chấm; kết quả sẽ tự động hiển thị khi hoàn tất.',ai:{available:true,status:'pending',label:'AI chấm'}});
      }
      if(skill==='writing' && !b.hsk5Mode){
        const a=b.answers||{};
        const task1Answer=String(a[1]??a['1']??''); const task2Answer=String(a[2]??a['2']??'');
        const wordCount=v=>{const x=v.trim();return x?x.split(/\s+/).length:0};
        ai=await gradeWriting({task1Prompt:String(b.task1Prompt||''),task1Answer,task1Words:wordCount(task1Answer),task2Prompt:String(b.task2Prompt||''),task2Answer,task2Words:wordCount(task2Answer),taskImages:b.taskImages||{}});
        const rid=crypto.randomUUID();
        await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,'writing','AI',$4,$5::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET model='AI',overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[rid,sid,u.id,ai.overallBand,JSON.stringify(ai)]);
      } else if(skill==='translation' && hskMode){
        const tasks=Array.isArray(b.tasks)?b.tasks:[];
        ai=await gradeHskTranslation({tasks,answers:b.answers||{},testTitle,volume:b.volume||7});
        const rid=crypto.randomUUID();
        await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,'translation','AI',$4,$5::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET model='AI',overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[rid,sid,u.id,ai.overallScore,JSON.stringify(ai)]);
      } else if(skill==='speaking'){
        const rec=Array.isArray(b.answers?.recordings)?b.answers.recordings:[];
        if(rec.length){
          ai=await gradeSpeaking(rec.map(x=>({part:Number(x.part)||1,question:String(x.question||''),mime:String(x.mime||'audio/webm'),audio:String(x.audio||''),transcript:String(x.transcript||'')})));
          const rid=crypto.randomUUID();
          await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,'speaking','AI',$4,$5::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET model='AI',overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[rid,sid,u.id,ai.overallBand,JSON.stringify(ai)]);
        }
      }
    }catch(err){
      console.error('AI grading failed:',err); aiError='AI chưa thể chấm bài. Bài làm đã được lưu; vui lòng thử lại hoặc liên hệ quản trị viên.';
      const skill=String(b.skill||'').toLowerCase();
      if(['writing','translation','speaking'].includes(skill)) await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,status,error_message,result) VALUES($1,$2,$3,$4,'AI','failed',$5,'{}'::jsonb) ON CONFLICT(submission_id) DO UPDATE SET model='AI',status='failed',error_message=EXCLUDED.error_message,updated_at=NOW()`,[crypto.randomUUID(),sid,u.id,skill,'AI_GRADING_FAILED']);
    }
    return json(res,201,{ok:true,id:sid,message:'Your answers have been submitted.',ai:ai?{available:true,overallBand:ai.overallBand??ai.overallScore,label:'AI chấm'}:{available:false,label:'AI chấm',error:aiError||'AI chưa thể chấm bài.'}});
  }

  if(url.pathname==='/api/me/pro' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    await grantCoursePro(u); const ent=await getEntitlement(u.id);
    if(!ent)return json(res,200,{ok:true,pro:{active:false,skills:0,skillAccess:[],daysRemaining:0}});
    return json(res,200,{ok:true,pro:{active:true,skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}});
  }
  if(url.pathname==='/api/pro/purchase-public' && req.method==='POST'){
    const b=await body(req); const plan=String(b.plan||'').trim(); const cfg=getProPlan(plan); if(!cfg)return json(res,400,{ok:false,message:'Gói PRO không hợp lệ.'});
    const c=candidate(req); const fullName=String(b.fullName||c?.full_name||'').trim(); const email=String(c?.email||b.email||'').trim().toLowerCase(); const phone=String(b.phone||'').trim();
    if(!fullName||!email)return json(res,400,{ok:false,message:'Vui lòng nhập họ tên và email để tạo đơn PRO.'});
    if(c?.email && String(b.email||c.email).trim().toLowerCase()!==String(c.email).trim().toLowerCase())return json(res,400,{ok:false,message:'Email mua PRO phải trùng với email của tài khoản đang đăng nhập.'});
    let userId=c?.id||null;
    if(!userId){ userId=(await dbQuery(`SELECT id FROM users WHERE lower(trim(email))=$1 ORDER BY (auth_provider='google') DESC,created_at DESC LIMIT 1`,[email])).rows[0]?.id||null; }
    if(!userId)return json(res,400,{ok:false,message:'Email này chưa liên kết với tài khoản ROAD TO HSK 9. Hãy đăng ký/đăng nhập tài khoản trước, sau đó dùng đúng email tài khoản để mua PRO tự động.'});
    const settings=(await dbQuery('SELECT bank_code,bank_name,account_name,account_number FROM payment_settings WHERE id=1 LIMIT 1')).rows[0]||{};
    if(!String(settings.bank_code||'').trim()||!String(settings.account_number||'').trim())return json(res,400,{ok:false,message:'Admin chưa cấu hình Mã ngân hàng/BIN VietQR và Số tài khoản. Hãy cập nhật tại Admin → Cấu hình thanh toán trước khi tạo QR PRO.'});
    const id=crypto.randomUUID();
    const transferCode=`RT9P${crypto.randomInt(0,10000000000).toString().padStart(10,'0')}`;
    const r=await dbQuery(`INSERT INTO pro_orders(id,user_id,student_name,email,skills,amount,status,phone,plan,duration_days,skill_access,transfer_code)
      VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10::jsonb,$11) RETURNING id,created_at`,
      [id,userId,fullName,email,cfg.skills,cfg.amount,phone,plan,cfg.durationDays,JSON.stringify(cfg.skillAccess),transferCode]);
    const qrUrl=makeVietQrUrl(settings,cfg.amount,transferCode);
    return json(res,201,{ok:true,id:r.rows[0].id,amount:cfg.amount,plan,durationDays:cfg.durationDays,transferCode,
      payment:{qrUrl,qrIsDynamic:true,bankName:settings.bank_name||'',accountName:settings.account_name||'',accountNumber:settings.account_number||''},
      message:'Đã tạo đơn PRO. Quét QR để thanh toán đúng số tiền và nội dung đã được điền sẵn.'});
  }
  if(url.pathname==='/api/pro/purchase' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Please log in before purchasing PRO.'});
    const b=await body(req); const plan=String(b.plan||'').trim(); const cfg=getProPlan(plan); if(!cfg)return json(res,400,{ok:false,message:'Invalid PRO plan.'});
    const r=await dbQuery(`INSERT INTO pro_orders(id,user_id,student_name,email,skills,amount,status,phone,plan,duration_days,skill_access) VALUES($1,$2,$3,$4,$5,$6,'pending','',$7,$8,$9::jsonb) RETURNING id,created_at`,[crypto.randomUUID(),u.id,u.full_name,u.email||'',cfg.skills,cfg.amount,plan,cfg.durationDays,JSON.stringify(cfg.skillAccess)]);
    return json(res,201,{ok:true,id:r.rows[0].id,amount:cfg.amount,plan,durationDays:cfg.durationDays,message:'PRO purchase request created.'});
  }
  if(url.pathname==='/api/results' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    const rows=(await dbQuery(`SELECT r.listening,r.reading,r.writing,r.speaking,r.overall,r.message,r.feedback,r.feedback_published,
      (SELECT COUNT(*) FROM submissions s2 WHERE s2.user_id=r.user_id)::int AS test_session_count
      FROM results r WHERE r.user_id=$1 AND r.published=TRUE ORDER BY r.updated_at DESC LIMIT 1`,[u.id])).rows;
    if(!rows.length)return json(res,200,{ok:true,published:false});
    const r=rows[0]; return json(res,200,{ok:true,published:true,result:{listening:r.listening==null?null:Number(r.listening),reading:r.reading==null?null:Number(r.reading),writing:r.writing==null?null:Number(r.writing),speaking:r.speaking==null?null:Number(r.speaking),overall:r.overall==null?null:Number(r.overall),message:r.message||'',feedback:(r.feedback_published&&r.feedback&&typeof r.feedback==='object')?r.feedback:{},feedbackPublished:!!r.feedback_published,testSessionCount:r.test_session_count}});
  }

  if(url.pathname==='/api/admin/google-users' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT u.id,u.full_name,u.email,u.active,u.avatar_url,u.google_sub,u.google_email_verified,u.created_at,
      pe.skills,pe.skill_access,pe.status,pe.expires_at,pe.source FROM users u LEFT JOIN pro_entitlements pe ON pe.user_id=u.id WHERE u.auth_provider='google' ORDER BY u.created_at DESC`)).rows;
    return json(res,200,{ok:true,users:rows.map(x=>({id:x.id,name:x.full_name,email:x.email,active:x.active,avatarUrl:x.avatar_url||'',googleVerified:!!x.google_email_verified,createdAt:x.created_at,pro:x.skills?{skills:Number(x.skills),skillAccess:normalizeSkills(Array.isArray(x.skill_access)?x.skill_access:[]),status:x.status,expiresAt:x.expires_at,source:x.source}:null}))});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/pro$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const skills=Number(b.skills||0); const days=Math.max(1,Math.min(3650,Number(b.days||30)));
    const u=(await dbQuery(`SELECT id,full_name,email FROM users WHERE id=$1 LIMIT 1`,[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'Tài khoản không tồn tại.'});
    let skillAccess=normalizeSkills(b.skillAccess); if(!skillAccess.length && skills===4)skillAccess=ALL_SKILLS.slice();
    if(![2,3,4].includes(skills))return json(res,400,{ok:false,message:'Gói PRO không hợp lệ. Chọn 2, 3 hoặc 4 skills.'});
    if(skillAccess.length!==skills)return json(res,400,{ok:false,message:`Gói ${skills} skills phải có đúng ${skills} kỹ năng được bật.`});
    await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'admin_grant','active',NOW(),NOW()+make_interval(days=>$5)) ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+make_interval(days=>$5)),source='admin_grant',updated_at=NOW()`,[crypto.randomUUID(),u.id,skills,JSON.stringify(skillAccess),days]);
    return json(res,200,{ok:true,message:`Đã mở PRO ${skills} skills trong ${days} ngày.`,skillAccess});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/course$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const slug=String(b.courseSlug||'').trim();
    if(!slug)return json(res,400,{ok:false,message:'Thiếu courseSlug.'});
    const u=(await dbQuery(`SELECT id,full_name,email,dob FROM users WHERE id=$1 AND auth_provider='google' LIMIT 1`,[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'Google account không tồn tại.'});
    const c=(await dbQuery(`SELECT id,title FROM course_posts WHERE slug=$1 AND published=TRUE LIMIT 1`,[slug])).rows[0]; if(!c)return json(res,404,{ok:false,message:'Khóa học không tồn tại.'});
    await dbQuery(`INSERT INTO course_enrollments(id,course_id,user_id,course_title,student_name,dob,current_band,phone,email,voucher,status) VALUES($1,$2,$3,$4,$5,$6,NULL,'',$7,'','approved')`,[crypto.randomUUID(),c.id,u.id,c.title,u.full_name,u.dob,u.email]);
    await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,4,$3::jsonb,'course_enrollment','active',NOW(),NOW()+INTERVAL '30 days') ON CONFLICT(user_id) DO UPDATE SET skills=4,skill_access=$3::jsonb,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+INTERVAL '30 days'),updated_at=NOW()`,[crypto.randomUUID(),u.id,JSON.stringify(ALL_SKILLS)]);
    return json(res,200,{ok:true,message:'Đã gán khóa học và cấp PRO 4 skills cho Google account.'});
  }

  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/test-access$/) && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0];
    const u=(await dbQuery('SELECT id,full_name,email,auth_provider FROM users WHERE id=$1 LIMIT 1',[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'User not found'});
    const tests=(await dbQuery('SELECT id,skill,volume,test_no,title,series_label,display_test_label,card_label,published FROM practice_tests ORDER BY skill,volume,test_no')).rows;
    const overrides=new Map((await dbQuery('SELECT test_id,allowed,source FROM practice_access WHERE user_id=$1',[id])).rows.map(x=>[x.test_id,x]));
    const ent=await getEntitlement(id); const result=tests.map(t=>{const o=overrides.get(t.id); const skill=String(t.skill||'').toLowerCase(); const accountWide=skill==='reading'||skill==='listening'; const free=Number(t.volume)===1; const pro=!!ent?.skillAccess?.includes(skill); const allowed=accountWide?true:(o?!!o.allowed:(free||pro)); const source=accountWide?'account':(o?'admin':(free?'free':(pro?'pro':'locked'))); return {...t,allowed,override:o?!!o.allowed:null,source}});
    return json(res,200,{ok:true,user:u,tests:result,pro:ent?{skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}:null});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/test-access$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const testId=String(b.testId||''); const allowed=!!b.allowed;
    if(!testId)return json(res,400,{ok:false,message:'Thiếu testId.'});
    const test=(await dbQuery('SELECT id FROM practice_tests WHERE id=$1 LIMIT 1',[testId])).rows[0]; if(!test)return json(res,404,{ok:false,message:'Practice test không tồn tại.'});
    if(b.clear){ await dbQuery('DELETE FROM practice_access WHERE user_id=$1 AND test_id=$2',[id,testId]); return json(res,200,{ok:true,message:'Đã khôi phục quyền mặc định.'}); }
    await dbQuery(`INSERT INTO practice_access(id,user_id,test_id,allowed,source) VALUES($1,$2,$3,$4,'admin') ON CONFLICT(user_id,test_id) DO UPDATE SET allowed=EXCLUDED.allowed,source='admin',updated_at=NOW()`,[crypto.randomUUID(),id,testId,allowed]);
    return json(res,200,{ok:true,message:allowed?'Đã mở quyền bài thi riêng.':'Đã khóa quyền bài thi riêng.'});
  }
  if(url.pathname==='/api/users' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase();
    const rows=(await dbQuery(`SELECT id,full_name,dob,registration_id,eit_code,email,active,created_at,auth_provider,google_sub,google_email_verified,avatar_url FROM users WHERE $1='' OR lower(full_name) LIKE '%'||$1||'%' OR lower(registration_id) LIKE '%'||$1||'%' OR lower(eit_code) LIKE '%'||$1||'%' OR lower(email) LIKE '%'||$1||'%' ORDER BY created_at DESC`,[q])).rows;
    return json(res,200,{ok:true,users:rows});
  }
  if(url.pathname==='/api/users' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const b=await body(req);
    const username=String(b.username||b.registrationid||'').trim();
    const password=String(b.password||'');
    if(!username||!password)return json(res,400,{ok:false,message:'Username và password là bắt buộc.'});
    if(username.length<3)return json(res,400,{ok:false,message:'Username cần có ít nhất 3 ký tự.'});
    if(password.length<4)return json(res,400,{ok:false,message:'Password cần có ít nhất 4 ký tự.'});
    const generatedEitCode='HSK-'+crypto.randomBytes(5).toString('hex').toUpperCase();
    try { const id=crypto.randomUUID(); const r=await dbQuery(`INSERT INTO users(id,full_name,dob,registration_id,eit_code,email,password_hash,active) VALUES($1,$2,NULL,$3,$4,'',$5,TRUE) RETURNING id,full_name,dob,registration_id,eit_code,email,active,created_at`,[id,username,username,generatedEitCode,hashPassword(password)]); return json(res,201,{ok:true,user:r.rows[0]}); }
    catch(e){ if(e.code==='23505')return json(res,409,{ok:false,message:'Username này đã tồn tại. Vui lòng chọn username khác.'}); throw e; }
  }
  if(url.pathname.startsWith('/api/users/') && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const b=await body(req);
    const fields=[]; const vals=[]; const add=(sql,v)=>{fields.push(sql);vals.push(v)};
    if(b.fullname!==undefined)add('full_name=$'+(vals.length+1),String(b.fullname).trim());
    if(b.dob!==undefined)add('dob=$'+(vals.length+1),b.dob||null);
    if(b.registrationid!==undefined)add('registration_id=$'+(vals.length+1),String(b.registrationid).trim());
    if(b.eitcode!==undefined)add('eit_code=$'+(vals.length+1),String(b.eitcode).trim());
    if(b.email!==undefined)add('email=$'+(vals.length+1),String(b.email).trim());
    if(b.active!==undefined)add('active=$'+(vals.length+1),!!b.active);
    if(b.password)add('password_hash=$'+(vals.length+1),hashPassword(b.password));
    if(!fields.length)return json(res,400,{ok:false,message:'Nothing to update.'});
    fields.push('updated_at=NOW()'); vals.push(id);
    try { const r=await dbQuery(`UPDATE users SET ${fields.join(', ')} WHERE id=$${vals.length} RETURNING id,full_name,dob,registration_id,eit_code,email,active,created_at`,vals); if(!r.rows.length)return json(res,404,{ok:false,message:'User not found'}); return json(res,200,{ok:true,user:r.rows[0]}); }
    catch(e){ if(e.code==='23505')return json(res,409,{ok:false,message:'Registration ID or EITCODE already exists.'}); throw e; }
  }
  if(url.pathname.startsWith('/api/users/') && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const r=await dbQuery('DELETE FROM users WHERE id=$1',[id]); if(!r.rowCount)return json(res,404,{ok:false,message:'User not found'}); return json(res,200,{ok:true});
  }

  if(url.pathname==='/api/submissions' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const q=(url.searchParams.get('q')||'').toLowerCase();
    const rows=(await dbQuery(`SELECT s.id,s.student_name,s.student_email,s.student_code,s.eit_code,s.dob,s.test_id,s.test_title,s.skill,s.elapsed_seconds,s.score,s.total,s.submitted_at,COALESCE(r.overall,s.score) AS overall,r.published AS result_published FROM submissions s LEFT JOIN results r ON r.submission_id=s.id WHERE $1='' OR lower(s.student_name) LIKE '%'||$1||'%' OR lower(s.student_code) LIKE '%'||$1||'%' OR lower(s.student_email) LIKE '%'||$1||'%' OR lower(s.skill) LIKE '%'||$1||'%' OR lower(s.test_id) LIKE '%'||$1||'%' ORDER BY s.submitted_at DESC`,[q])).rows;
    return json(res,200,{ok:true,submissions:rows.map(x=>({id:x.id,studentName:x.student_name,studentEmail:x.student_email,studentCode:x.student_code,testId:x.test_id,testTitle:x.test_title,skill:x.skill||'',eitCode:x.eit_code||'',dob:x.dob||'',elapsedSeconds:x.elapsed_seconds,score:x.overall==null?null:Number(x.overall),total:x.total,submittedAt:x.submitted_at,resultPublished:!!x.result_published}))});
  }
  if(url.pathname.startsWith('/api/submissions/') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop();
    const r=await dbQuery(`SELECT s.*,r.listening,r.reading,r.writing,r.speaking,r.overall,r.message,r.published,r.feedback,r.feedback_published,(SELECT jsonb_build_object('skill',ar.skill,'model',ar.model,'status',ar.status,'overallBand',ar.overall_band,'result',ar.result,'errorMessage',ar.error_message) FROM ai_skill_reviews ar WHERE ar.submission_id=s.id LIMIT 1) AS ai_review FROM submissions s LEFT JOIN results r ON r.submission_id=s.id WHERE s.id=$1`,[id]); if(!r.rows.length)return json(res,404,{ok:false,message:'Not found'}); const x=r.rows[0];
    return json(res,200,{ok:true,submission:{id:x.id,studentName:x.student_name,studentEmail:x.student_email,studentCode:x.student_code,eitCode:x.eit_code,dob:x.dob,testId:x.test_id,testTitle:x.test_title,skill:x.skill,answers:x.answers,highlights:x.highlights,notes:x.notes,total:x.total,score:x.score,elapsedSeconds:x.elapsed_seconds,submittedAt:x.submitted_at,result:{listening:x.listening==null?null:Number(x.listening),reading:x.reading==null?null:Number(x.reading),writing:x.writing==null?null:Number(x.writing),speaking:x.speaking==null?null:Number(x.speaking),overall:x.overall==null?null:Number(x.overall),message:x.message||'',feedback:x.feedback&&typeof x.feedback==='object'?x.feedback:{},feedbackPublished:!!x.feedback_published},resultPublished:!!x.published,aiReview:x.ai_review||null}});
  }
  if(url.pathname.startsWith('/api/submissions/') && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const b=await body(req); const exists=await dbQuery('SELECT user_id FROM submissions WHERE id=$1',[id]); if(!exists.rows.length)return json(res,404,{ok:false,message:'Not found'}); const n=v=>v===null||v===undefined||v===''?null:Number(v);
    await dbQuery(`INSERT INTO results(id,submission_id,user_id,listening,reading,writing,speaking,overall,message,published,feedback,feedback_published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT(submission_id) DO UPDATE SET listening=EXCLUDED.listening,reading=EXCLUDED.reading,writing=EXCLUDED.writing,speaking=EXCLUDED.speaking,overall=EXCLUDED.overall,message=EXCLUDED.message,published=EXCLUDED.published,feedback=EXCLUDED.feedback,feedback_published=EXCLUDED.feedback_published,updated_at=NOW()`,[crypto.randomUUID(),id,exists.rows[0].user_id,n(b.listening),n(b.reading),n(b.writing),n(b.speaking),n(b.overall),String(b.message||''),!!b.resultPublished,JSON.stringify(b.feedback&&typeof b.feedback==='object'?b.feedback:{}),!!b.feedbackPublished]);
    return json(res,200,{ok:true});
  }
  if(url.pathname.startsWith('/api/submissions/') && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const r=await dbQuery('DELETE FROM submissions WHERE id=$1',[id]); if(!r.rowCount)return json(res,404,{ok:false,message:'Not found'}); return json(res,200,{ok:true});
  }
  return json(res,404,{ok:false,message:'API route not found'});
}

function contentType(file){return {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'audio/webm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.zip':'application/zip','.ogg':'audio/ogg','.aac':'audio/aac','.flac':'audio/flac','.opus':'audio/opus'}[path.extname(file).toLowerCase()]||'application/octet-stream'}
function sendStaticFile(req,res,file,st){
  const baseHeaders={'Content-Type':contentType(file),'Cache-Control':'no-cache','Accept-Ranges':'bytes'};
  if(req.method==='HEAD'){
    res.writeHead(200,{...baseHeaders,'Content-Length':st.size});
    return res.end();
  }
  const range=String(req.headers.range||'').trim();
  if(range){
    // HTML media elements seek by requesting byte ranges. Without a 206 response,
    // many browsers report an empty seekable range and disable the timeline.
    const match=range.match(/^bytes=(\d*)-(\d*)$/i);
    if(!match || (!match[1]&&!match[2])){
      res.writeHead(416,{...baseHeaders,'Content-Range':`bytes */${st.size}`,'Content-Length':'0'});
      return res.end();
    }
    let start,end;
    if(match[1]===''){
      const suffix=Number(match[2]);
      if(!Number.isFinite(suffix)||suffix<=0){res.writeHead(416,{...baseHeaders,'Content-Range':`bytes */${st.size}`,'Content-Length':'0'});return res.end();}
      start=Math.max(0,st.size-suffix);end=st.size-1;
    }else{
      start=Number(match[1]);end=match[2]===''?st.size-1:Number(match[2]);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>=st.size||end<start){
        res.writeHead(416,{...baseHeaders,'Content-Range':`bytes */${st.size}`,'Content-Length':'0'});return res.end();
      }
      end=Math.min(end,st.size-1);
    }
    const length=end-start+1;
    res.writeHead(206,{...baseHeaders,'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':length});
    fs.createReadStream(file,{start,end}).on('error',()=>{if(!res.headersSent)res.writeHead(500);res.destroy()}).pipe(res);
    return;
  }
  res.writeHead(200,{...baseHeaders,'Content-Length':st.size});
  fs.createReadStream(file).on('error',()=>{if(!res.headersSent)res.writeHead(500);res.destroy()}).pipe(res);
}
function staticFile(req,res,url){
  let pathname;
  try{pathname=decodeURIComponent(url.pathname)}catch{return json(res,400,{message:'Invalid URL path'});}
  if(pathname==='/') pathname='/index.html';
  if(pathname.startsWith('/.private-documents/') || pathname==='/\.private-documents') return json(res,404,{message:'File not found'});
  let file;
  const privateDir=path.resolve(PRIVATE_DOC_DIR);
  if(pathname.startsWith('/uploads/')){
    const uploadName=pathname.slice('/uploads/'.length);
    if(!uploadName || uploadName.includes('/') || uploadName.includes('\\') || uploadName==='.' || uploadName==='..') return json(res,404,{message:'File not found'});
    file=path.resolve(UPLOAD_DIR,uploadName);
    if(file!==UPLOAD_DIR && !file.startsWith(UPLOAD_DIR+path.sep)) return json(res,403,{message:'Forbidden'});
  }else{
    file=path.normalize(path.join(ROOT,pathname));
    if(file===privateDir||file.startsWith(privateDir+path.sep)) return json(res,404,{message:'File not found'});
    if(!file.startsWith(ROOT+path.sep)&&file!==ROOT) return json(res,403,{message:'Forbidden'});
  }
  fs.stat(file,(err,st)=>{
    if(!err && st.isDirectory()){
      file=path.join(file,'index.html');
      fs.stat(file,(e2,s2)=>{
        if(e2 || !s2.isFile()) return json(res,404,{message:'File not found'});
        sendStaticFile(req,res,file,s2);
      });
      return;
    }
    if(err || !st.isFile()) return json(res,404,{message:'File not found'});
    sendStaticFile(req,res,file,st);
  });
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{if(url.pathname.startsWith('/api/'))await api(req,res,url);else staticFile(req,res,url)}catch(e){console.error(e);json(res,500,{ok:false,message:e.message||'Server error'})}});

initDB().then(()=>server.listen(PORT,()=>console.log(`HSK Exam running on port ${PORT}; PostgreSQL=${!!pool}`))).catch(err=>{console.error('Database initialization failed:',err);process.exit(1)});
