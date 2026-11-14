const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const AdmZip = require('adm-zip');
const { URL } = require('url');
const { Pool } = require('pg');
const { gradeWriting, gradeSpeaking, isProWriting, isProSpeaking, DEEPSEEK_MODEL } = require('./ai-grading');
const { gradeHskWriting, gradeHskTranslation, gradeHskkSpeaking, GEMINI_MODEL, isGeminiConfigured } = require('./google-hsk-grading');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '27092007');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');
const TOKENS = new Map();
const CANDIDATE_TOKENS = new Map();
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!DATABASE_URL) console.warn('WARNING: DATABASE_URL/POSTGRES_URL is not set. PostgreSQL mode is unavailable.');
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 5 }) : null;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readLegacyDB(){ try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch { return []; } }
function json(res,status,payload){ const body=JSON.stringify(payload); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization'}); res.end(body); }
function body(req){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c;if(s.length>90e6){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(new Error('Invalid JSON request'))}});req.on('error',reject)}); }
function tokenFrom(req){ return (req.headers.authorization||'').replace(/^Bearer\s+/,'').trim(); }
function admin(req){ const t=tokenFrom(req); return !!(t && TOKENS.has(t) && TOKENS.get(t)>Date.now()); }
function candidate(req){ const t=tokenFrom(req); const c=t && CANDIDATE_TOKENS.get(t); if(!c || c.expiresAt<Date.now()) return null; return c.user; }
function hashPassword(password){ const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(String(password),salt,64).toString('hex'); return `${salt}:${hash}`; }
function verifyPassword(password, stored){ try { const [salt,hash]=String(stored).split(':'); if(!salt||!hash)return false; const a=Buffer.from(hash,'hex'); const b=crypto.scryptSync(String(password),salt,64); return a.length===b.length && crypto.timingSafeEqual(a,b); } catch { return false; } }
function safeName(s){return String(s||'').replace(/[^a-zA-Z0-9._-]/g,'_')}

// Strip answer keys and grading metadata from public exam payloads. These are
// returned only by the submission endpoint after the candidate's work is saved.
const PRIVATE_PRACTICE_CONTENT_KEYS=new Set([
  'answer','answers','answerkey','answer_key','correctanswer','correct_answer',
  'correctoption','correct_option','correctoptions','correct_options',
  'explanation','explanations','solution','solutions','modelanswer','model_answer',
  'referenceanswer','reference_answer','gradingrubric','grading_rubric'
]);
function sanitizePracticeContent(value){
  if(Array.isArray(value))return value.map(sanitizePracticeContent);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value)
      .filter(([key])=>!PRIVATE_PRACTICE_CONTENT_KEYS.has(String(key).toLowerCase().replace(/[\s-]/g,'_')))
      .map(([key,item])=>[key,sanitizePracticeContent(item)]));
  }
  return value;
}

function answerNorm(value){return String(value??'').normalize('NFKC').toLowerCase().trim().replace(/[\s\u3000]/g,'').replace(/[.,，。!?！？:：;；'"“”‘’()（）]/g,'')}
function gradeObjectiveTest(test,studentAnswers){
  const questions=Array.isArray(test.content?.questions)?test.content.questions:[];
  const key=test.answer_key&&typeof test.answer_key==='object'?test.answer_key:{};
  const rows=questions.map((q,i)=>{
    const n=String(q.number??i+1),candidateAnswer=studentAnswers?.[n]??studentAnswers?.[`Q${n}`]??'';
    let correct=key[n]??key[`Q${n}`]??key[`q${n}`]??key[`question${n}`];
    if(correct===undefined&&key.answers&&typeof key.answers==='object')correct=key.answers[n];
    const accepted=Array.isArray(correct)?correct:String(correct??'').split(/[;|]/).map(x=>x.trim()).filter(Boolean);
    const ok=accepted.length>0&&accepted.some(x=>answerNorm(x)===answerNorm(candidateAnswer));
    return {number:n,answer:String(candidateAnswer??''),correct:Array.isArray(correct)?correct:String(correct??''),isCorrect:ok,explanation:String(test.explanations?.[n]??'')};
  });
  const scored=rows.filter(x=>String(x.correct??'').trim()!=='' || (Array.isArray(x.correct)&&x.correct.length));
  if(!scored.length)throw new Error(`Đề ${String(test.skill).toUpperCase()} chưa có answer key nên không thể chấm tự động.`);
  const correct=scored.filter(x=>x.isCorrect).length;
  return {score:Math.round(correct/scored.length*10000)/100,correct,total:scored.length,details:scored};
}

async function dbQuery(text, params=[]){ if(!pool) throw new Error('Database is not configured. Please add DATABASE_URL in Vibe Host.'); return pool.query(text,params); }

async function seedPracticeDemos(){
  const seedPath=path.join(DATA_DIR,'practice_seed.json');
  if(!fs.existsSync(seedPath) || !pool) return;
  let pack; try{pack=JSON.parse(fs.readFileSync(seedPath,'utf8'));}catch(e){console.error('Practice seed read failed:',e);return;}
  for(const t of (pack.tests||[])){
    if(![7,8,9,79].includes(Number(t.volume)) || !['listening','reading','writing','translation'].includes(String(t.skill||'').toLowerCase())) continue;
    const audioUrl=t.skill==='listening' && Number(t.volume)===79 && Number(t.testNo)===1 && fs.existsSync(path.join(UPLOAD_DIR,'vol9-test1-listening.mp3')) ? '/uploads/vol9-test1-listening.mp3' : String(t.audioUrl||'');
    await dbQuery(`INSERT INTO practice_tests(id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,TRUE)
      ON CONFLICT(skill,volume,test_no) DO NOTHING`,
      [crypto.randomUUID(),String(t.skill).toLowerCase(),79,Number(t.testNo),t.title||'',t.questionType||'',Number(t.durationMinutes||60),Number(t.totalQuestions||40),JSON.stringify({questions:t.questions||[],question_groups:t.question_groups||[],passages:t.passages||[],sections:t.sections||[],unitImages:t.unitImages||[],audioUrl:t.audioUrl||'',rawText:t.rawText||'',instructions:t.instructions||'',transcript:t.transcript||''}),JSON.stringify(t.answerKey||{}),JSON.stringify(t.explanations||{}),audioUrl,t.sourceFile||'HSK7-9 demo seed',t.sourceUrl||'']);
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
  await dbQuery(`ALTER TABLE results ADD COLUMN IF NOT EXISTS translation NUMERIC`);
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
  await dbQuery(`CREATE TABLE IF NOT EXISTS pro_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0, duration_days INTEGER NOT NULL DEFAULT 30, skill_access JSONB NOT NULL DEFAULT '[]'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS study_materials (id UUID PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', level TEXT DEFAULT 'HSK 7–9', skill TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0, cover_url TEXT DEFAULT '', file_url TEXT DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await dbQuery(`DELETE FROM study_materials WHERE CONCAT_WS(' ',COALESCE(level,''),COALESCE(title,''),COALESCE(description,'')) ~* 'HSK[[:space:]]*[3-6]'`);
  await dbQuery(`UPDATE study_materials SET level='HSK 7–9' WHERE level IS DISTINCT FROM 'HSK 7–9'`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS material_orders (id UUID PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE SET NULL, student_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', items JSONB NOT NULL DEFAULT '[]'::jsonb, amount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS material_orders_created_idx ON material_orders(created_at DESC)`);
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
  await dbQuery(`CREATE TABLE IF NOT EXISTS hsk79_mock_exams (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Thi thử tổng hợp HSK 7–9',
    description TEXT DEFAULT '',
    listening_test_id TEXT NOT NULL,
    reading_test_id TEXT NOT NULL,
    writing_test_id TEXT NOT NULL,
    translation_test_id TEXT NOT NULL,
    section_minutes JSONB NOT NULL DEFAULT '{"listening":45,"reading":70,"writing":90,"translation":100}'::jsonb,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hsk79_mock_attempts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mock_exam_id UUID REFERENCES hsk79_mock_exams(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL DEFAULT '',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    overall_score NUMERIC(6,2),
    estimated_level TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS hsk79_mock_attempts_exam_idx ON hsk79_mock_attempts(mock_exam_id,submitted_at DESC)`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS hsk79_mock_settings (
    id INTEGER PRIMARY KEY CHECK(id=1),
    hsk7_min NUMERIC(5,2) NOT NULL DEFAULT 60,
    hsk8_min NUMERIC(5,2) NOT NULL DEFAULT 75,
    hsk9_min NUMERIC(5,2) NOT NULL DEFAULT 88,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`INSERT INTO hsk79_mock_settings(id,hsk7_min,hsk8_min,hsk9_min) VALUES(1,60,75,88) ON CONFLICT(id) DO NOTHING`);
  // Remove obsolete legacy mock tables; the new mock exam is one unified four-skill programme.
  await dbQuery(`DROP TABLE IF EXISTS hsk_mock_attempts`);
  await dbQuery(`DROP TABLE IF EXISTS hsk_mock_exams`);
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
    skills INTEGER NOT NULL DEFAULT 4 CHECK (skills BETWEEN 1 AND 5),
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
    skills INTEGER NOT NULL CHECK (skills BETWEEN 1 AND 5),
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS payment_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
    payment_title TEXT NOT NULL DEFAULT 'THANH TOÁN HSK 7–9',
    qr_url TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    account_name TEXT DEFAULT '',
    account_number TEXT DEFAULT '',
    transfer_note TEXT DEFAULT 'EIT COURSE',
    instructions TEXT DEFAULT 'Quét mã QR hoặc chuyển khoản theo thông tin bên dưới. Sau khi thanh toán, EIT sẽ xác nhận và liên hệ với bạn.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await dbQuery(`INSERT INTO payment_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING`);
  await dbQuery(`CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const legacySpeakMigration=(await dbQuery(`SELECT 1 FROM app_migrations WHERE name='v8_legacy_speaking_to_translation' LIMIT 1`)).rows.length>0;
  if(!legacySpeakMigration){
    await dbQuery(`UPDATE pro_entitlements SET skill_access=(SELECT COALESCE(jsonb_agg(CASE WHEN v.value='\"speaking\"'::jsonb THEN '\"translation\"'::jsonb ELSE v.value END),'[]'::jsonb) FROM jsonb_array_elements(skill_access) v(value)) WHERE skill_access @> '[\"speaking\"]'::jsonb`);
    await dbQuery(`INSERT INTO app_migrations(name) VALUES('v8_legacy_speaking_to_translation') ON CONFLICT DO NOTHING`);
  }
  // HSKK speaking is now an independent PRO skill. Do not rewrite it on every startup.
  // Seed the admin-provided QR once if the DB does not have one yet.
  const defaultQr = '/uploads/eit-payment-qr.png';
  if (fs.existsSync(path.join(UPLOAD_DIR, 'eit-payment-qr.png'))) {
    await dbQuery(`UPDATE payment_settings SET qr_url=$1 WHERE id=1 AND COALESCE(qr_url,'')=''`, [defaultQr]);
  }
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT ''`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30`);
  await dbQuery(`ALTER TABLE pro_orders ADD COLUMN IF NOT EXISTS skill_access JSONB NOT NULL DEFAULT '[]'::jsonb`);
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
  await dbQuery(`ALTER TABLE practice_tests DROP CONSTRAINT IF EXISTS practice_tests_skill_volume_test_no_key`);
  // Keep the unified HSK 7–9 bank (four existing skills) AND the separate HSKK speaking banks.
  // Do not let the legacy HSK7–9 cleanup remove the newly added HSKK tests.
  await dbQuery(`DELETE FROM practice_tests WHERE NOT ((volume IN (7,8,9,79) AND lower(skill) IN ('listening','reading','writing','translation')) OR (volume IN (20,21,22,30,31,32) AND lower(skill)='speaking'))`);
  await dbQuery(`WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(skill) ORDER BY volume, test_no, created_at, id) AS new_no
    FROM practice_tests WHERE volume IN (7,8,9,79) AND lower(skill) IN ('listening','reading','writing','translation')
  ) UPDATE practice_tests p SET volume=79,skill=lower(p.skill),test_no=ranked.new_no::integer FROM ranked WHERE p.id=ranked.id`);
  // Widen old PRO entitlement/order constraints to allow a fifth optional skill: HSKK speaking.
  await dbQuery(`ALTER TABLE pro_entitlements DROP CONSTRAINT IF EXISTS pro_entitlements_skills_check`);
  await dbQuery(`ALTER TABLE pro_entitlements ADD CONSTRAINT pro_entitlements_skills_check CHECK (skills BETWEEN 1 AND 5)`);
  await dbQuery(`ALTER TABLE pro_orders DROP CONSTRAINT IF EXISTS pro_orders_skills_check`);
  await dbQuery(`ALTER TABLE pro_orders ADD CONSTRAINT pro_orders_skills_check CHECK (skills BETWEEN 1 AND 5)`);
  await dbQuery(`UPDATE practice_tests SET
    title=regexp_replace(title,'HSK[[:space:]]*[789]([[:space:]]*[-–/][[:space:]]*[789])?','HSK 7–9','gi'),
    series_label=regexp_replace(series_label,'HSK[[:space:]]*[789]([[:space:]]*[-–/][[:space:]]*[789])?','HSK 7–9','gi'),
    card_subtitle=regexp_replace(card_subtitle,'HSK[[:space:]]*[789]([[:space:]]*[-–/][[:space:]]*[789])?','HSK 7–9','gi')
    WHERE volume=79`);
  await dbQuery(`ALTER TABLE practice_tests ADD CONSTRAINT practice_tests_skill_volume_test_no_key UNIQUE(skill,volume,test_no)`);

  await dbQuery(`CREATE INDEX IF NOT EXISTS practice_tests_skill_idx ON practice_tests(skill,volume,test_no)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS prediction_created_idx ON prediction_files(created_at DESC)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions(user_id)`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS submissions_submitted_idx ON submissions(submitted_at DESC)`);
  await seedUsers();
  // HSK 7–9 build: do not seed legacy IELTS course cards into this site.
  await seedPracticeDemos();
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


const GOOGLE_CLIENT_ID=String(process.env.GOOGLE_CLIENT_ID||'').trim();
function verifyGoogleIdToken(idToken){
  return new Promise((resolve,reject)=>{
    const https=require('https');
    const req=https.get('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(idToken),r=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d);if(r.statusCode!==200)return reject(new Error('Google từ chối token.'));resolve(j)}catch{reject(new Error('Phản hồi Google không hợp lệ.'))}});
    });
    req.setTimeout(8000,()=>{req.destroy(new Error('Google không phản hồi.'))});
    req.on('error',reject);
  });
}
const ALL_SKILLS=['listening','reading','writing','translation'];
const PRO_SKILLS=[...ALL_SKILLS,'speaking'];
const HSKK_VOLUMES=[20,21,22,30,31,32];
const HSKK_VOLUME_MAP={'2.0':{beginner:20,intermediate:21,advanced:22},'3.0':{beginner:30,intermediate:31,advanced:32}};
function normalizeSkills(list){
  if(!Array.isArray(list))return [];
  return [...new Set(list.map(x=>String(x||'').trim().toLowerCase()).filter(x=>PRO_SKILLS.includes(x)))];
}
async function grantCoursePro(user){
  if(!user?.id)return;
  const email=String(user.email||'').trim().toLowerCase();
  const has=await dbQuery(`SELECT 1 FROM course_enrollments WHERE user_id=$1 OR ($2<>'' AND lower(trim(email))=$2) LIMIT 1`,[user.id,email]);
  if(!has.rows.length)return;
  // Course access continues to unlock the original four HSK 7–9 skills. Preserve an independently purchased/granted HSKK skill instead of overwriting it.
  const existing=(await dbQuery(`SELECT skill_access,expires_at,status FROM pro_entitlements WHERE user_id=$1 LIMIT 1`,[user.id])).rows[0];
  const keepsHskk=existing?.status==='active' && new Date(existing.expires_at)>new Date() && Array.isArray(existing.skill_access) && existing.skill_access.includes('speaking');
  const access=keepsHskk?[...ALL_SKILLS,'speaking']:ALL_SKILLS.slice();
  await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'course_enrollment','active',NOW(),NOW()+INTERVAL '30 days') ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+INTERVAL '30 days'),source='course_enrollment',updated_at=NOW()`,[crypto.randomUUID(),user.id,access.length,JSON.stringify(access)]);
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
// Quy tắc truy cập (áp dụng cho CẢ 4 kỹ năng, mọi tài khoản kể cả Google):
//  1) Admin override theo từng đề (mở/khóa riêng) luôn được ưu tiên.
//  2) Đề miễn phí: Test 1 của mỗi kỹ năng ở mỗi cấp HSK (test_no = 1).
//  3) PRO: kỹ năng nằm trong skill_access của gói PRO còn hạn (hoặc khóa học).
//  4) Còn lại bị khóa.
function resolvePracticeAccess(test,ent,override){
  const skill=String(test.skill||'').toLowerCase();
  if(override)return {allowed:!!override.allowed,reason:'admin'};
  if(Number(test.test_no)===1)return {allowed:true,reason:'free'};
  if(ent?.skillAccess?.includes(skill))return {allowed:true,reason:'pro'};
  return {allowed:false,reason:'locked'};
}
async function getPracticeAccess(user,test){
  if(!user?.id)return {allowed:false,reason:'login'};
  try{await grantCoursePro(user);}catch{}
  const override=(await dbQuery('SELECT allowed FROM practice_access WHERE user_id=$1 AND test_id=$2 LIMIT 1',[user.id,test.id])).rows[0];
  const ent=await getEntitlement(user.id);
  return resolvePracticeAccess(test,ent,override);
}
async function getUserAccessSummary(user){
  if(!user?.id)return {allowedTestIds:[],skillAccess:[],predictionAllowed:false,pro:null,course:false};
  await grantCoursePro(user);
  const ent=await getEntitlement(user.id);
  const course=await hasCourseAccess(user);
  const explicit=(await dbQuery('SELECT test_id FROM practice_access WHERE user_id=$1 AND allowed=TRUE',[user.id])).rows.map(x=>x.test_id);
  return {allowedTestIds:explicit,skillAccess:ent?.skillAccess||[],predictionAllowed:!!ent||course,pro:ent?{skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}:null,course};
}
// PRO packages are managed dynamically from the Admin panel.
function planSkills(plan){ return normalizeSkills(Array.isArray(plan?.skill_access)?plan.skill_access:[]); }

async function api(req,res,url){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'});return res.end()}
  if(url.pathname==='/api/health' && (req.method==='GET'||req.method==='HEAD')){ if(req.method==='HEAD'){res.writeHead(200);return res.end()} return json(res,200,{ok:true,service:'HSK Exam API',database:!!pool}); }
  if(url.pathname==='/api/ai/status' && (req.method==='GET'||req.method==='HEAD')){ if(req.method==='HEAD'){res.writeHead(200);return res.end()} const keyConfigured=isGeminiConfigured(); return json(res,200,{ok:true,configured:keyConfigured,provider:'Google Gemini',model:GEMINI_MODEL,serverSideKey:keyConfigured,writesToDatabase:!!pool}); }

  if(url.pathname==='/api/admin/login' && req.method==='POST'){
    const b=await body(req); if(b.password!==ADMIN_PASSWORD)return json(res,401,{ok:false,message:'Invalid password'});
    const t=crypto.randomBytes(32).toString('hex'); TOKENS.set(t,Date.now()+8*60*60*1000); return json(res,200,{ok:true,token:t});
  }


  if(url.pathname==='/api/admin/test-categories' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT c.id,c.name,c.created_at,COUNT(p.id)::int AS test_count FROM test_categories c LEFT JOIN practice_tests p ON p.category_id=c.id AND p.volume=79 AND lower(p.skill)=ANY(ARRAY['listening','reading','writing','translation']) GROUP BY c.id,c.name,c.created_at ORDER BY LOWER(c.name),c.created_at`)).rows;
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
    const rows=(await dbQuery(`SELECT c.id,c.name,COUNT(p.id)::int AS test_count FROM test_categories c LEFT JOIN practice_tests p ON p.category_id=c.id AND p.published=TRUE AND p.volume=79 AND lower(p.skill)=ANY(ARRAY['listening','reading','writing','translation']) GROUP BY c.id,c.name,c.created_at ORDER BY LOWER(c.name),c.created_at`)).rows;
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

  // HSKK is an additional speaking module. It uses separate volume codes and does not replace HSK 7–9 Reading/Writing/Translation.
  if(url.pathname==='/api/hskk/practice' && req.method==='GET'){
    const version=String(url.searchParams.get('version')||'').trim();
    const level=String(url.searchParams.get('level')||'').trim();
    let volumes=HSKK_VOLUMES;
    if(version && level){const v=HSKK_VOLUME_MAP[version]?.[level];if(!v)return json(res,400,{ok:false,message:'Phiên bản hoặc cấp độ HSKK không hợp lệ.'});volumes=[v];}
    else if(version==='2.0')volumes=[20,21,22];
    else if(version==='3.0')volumes=[30,31,32];
    else if(level && ['beginner','intermediate','advanced'].includes(level))volumes=[HSKK_VOLUME_MAP['2.0'][level],HSKK_VOLUME_MAP['3.0'][level]];
    const rows=(await dbQuery(`SELECT id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,audio_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,published,content FROM practice_tests WHERE published=TRUE AND lower(skill)='speaking' AND volume=ANY($1::int[]) ORDER BY volume,test_no`,[volumes])).rows;
    const u=candidate(req),tests=[];
    for(const t of rows){const a=await getPracticeAccess(u,t);tests.push({...t,content:{hskkVersion:t.content?.hskkVersion||'',hskkLevel:t.content?.hskkLevel||'',hskkLevelLabel:t.content?.hskkLevelLabel||''},allowed:a.allowed,lockReason:a.reason});}
    return json(res,200,{ok:true,program:'HSKK',tests});
  }
  if(url.pathname.match(/^\/api\/hskk\/test\/[0-9a-f-]+$/i) && req.method==='GET'){
    const id=url.pathname.split('/').pop();
    const r=await dbQuery(`SELECT * FROM practice_tests WHERE id=$1 AND published=TRUE AND lower(skill)='speaking' AND volume=ANY($2::int[]) LIMIT 1`,[id,HSKK_VOLUMES]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK.'});
    const x=r.rows[0],u=candidate(req);const access=await getPracticeAccess(u,x);
    if(!access.allowed)return json(res,u?403:401,{ok:false,message:u?'Bài HSKK này đang bị khóa. Vui lòng liên hệ Admin hoặc đăng ký PRO HSKK.':'Vui lòng đăng nhập để làm bài HSKK.'});
    return json(res,200,{ok:true,test:{id:x.id,skill:'speaking',volume:x.volume,testNo:x.test_no,title:x.title,questionType:x.question_type,durationMinutes:x.duration_minutes,totalQuestions:x.total_questions,content:x.content||{},seriesLabel:x.series_label,displayTestLabel:x.display_test_label,cardLabel:x.card_label,cardSubtitle:x.card_subtitle,accessReason:access.reason}});
  }
  if(url.pathname==='/api/hskk/submit' && req.method==='POST'){
    const u=candidate(req);if(!u)return json(res,401,{ok:false,message:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'});
    const b=await body(req);const testId=String(b.testId||'');
    const test=(await dbQuery(`SELECT id,skill,volume,test_no,title,content,published FROM practice_tests WHERE id=$1 AND published=TRUE AND lower(skill)='speaking' AND volume=ANY($2::int[]) LIMIT 1`,[testId,HSKK_VOLUMES])).rows[0];
    if(!test)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK hợp lệ.'});
    const access=await getPracticeAccess(u,test);if(!access.allowed)return json(res,403,{ok:false,message:'Bạn chưa được cấp quyền làm đề HSKK này.'});
    const rec=Array.isArray(b.recordings)?b.recordings:(Array.isArray(b.answers?.recordings)?b.answers.recordings:[]);
    if(!rec.length)return json(res,400,{ok:false,message:'Chưa có bản ghi âm nào. Hãy hoàn thành bài nói trước khi nộp.'});
    const required=Number(test.total_questions||test.content?.questions?.length||0);
    if(rec.length<required)return json(res,400,{ok:false,message:`Bài thi có ${required} câu nhưng mới nhận ${rec.length} bản ghi. Vui lòng làm đủ câu.`});
    const sid=crypto.randomUUID(),version=String(test.content?.hskkVersion||'2.0'),level=String(test.content?.hskkLevel||'beginner');
    const answers={recordings:rec,version,level};
    await dbQuery(`INSERT INTO submissions(id,user_id,student_name,student_email,student_code,eit_code,dob,test_id,test_title,skill,answers,highlights,notes,total,score,auto_submitted,elapsed_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'speaking',$10::jsonb,'[]'::jsonb,'[]'::jsonb,$11,NULL,FALSE,$12)`,[sid,u.id,u.full_name,u.email||'',u.registration_id,u.eit_code,u.dob||null,test.id,test.title,JSON.stringify(answers),required,Number(b.elapsedSeconds||0)]);
    try{
      const tasks=Array.isArray(test.content?.questions)?test.content.questions:[];
      const ai=await gradeHskkSpeaking(rec.map((x,i)=>({questionNumber:Number(x.questionNumber||i+1),part:Number(x.part||x.section||1),questionType:String(x.questionType||tasks[i]?.type||''),prompt:String(x.prompt||tasks[i]?.text||''),preparationSeconds:Number(x.preparationSeconds||0),responseSeconds:Number(x.responseSeconds||0),mime:String(x.mime||'audio/webm'),audio:String(x.audio||''),promptAudio:String(x.promptAudio||''),promptImage:String(x.promptImage||''),transcript:String(x.transcript||'')})),{version,level});
      const score=Number(ai.overallScore||0);
      await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,'speaking',$4,$5,$6::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET model=EXCLUDED.model,overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[crypto.randomUUID(),sid,u.id,ai.model||GEMINI_MODEL,score,JSON.stringify(ai)]);
      return json(res,201,{ok:true,id:sid,message:'Đã nộp bài và chấm HSKK thành công.',ai:{available:true,overallScore:score,model:ai.model||GEMINI_MODEL},resultUrl:'/hskk-result.html?id='+encodeURIComponent(sid)});
    }catch(err){
      console.error('HSKK grading failed:',err);
      await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,status,error_message,result) VALUES($1,$2,$3,'speaking',$4,'failed',$5,'{}'::jsonb) ON CONFLICT(submission_id) DO UPDATE SET status='failed',error_message=EXCLUDED.error_message,updated_at=NOW()`,[crypto.randomUUID(),sid,u.id,GEMINI_MODEL,String(err.message||'HSKK grading failed')]);
      return json(res,201,{ok:true,id:sid,message:'Bài HSKK đã được lưu nhưng AI chưa chấm thành công.',ai:{available:false,error:String(err.message||'AI grading failed')},resultUrl:'/hskk-result.html?id='+encodeURIComponent(sid)});
    }
  }

  // Admin-only HSKK Studio API. The original HSK 7–9 builder remains unchanged.
  if(url.pathname==='/api/admin/hskk/tests' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT id,skill,volume,test_no,title,duration_minutes,total_questions,content,published,updated_at FROM practice_tests WHERE lower(skill)='speaking' AND volume=ANY($1::int[]) ORDER BY volume,test_no`,[HSKK_VOLUMES])).rows;
    return json(res,200,{ok:true,tests:rows});
  }
  if(url.pathname==='/api/admin/hskk/tests' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req),version=String(b.version||''),level=String(b.level||''),testNo=Math.max(1,Math.floor(Number(b.testNo||1)));
    const volume=HSKK_VOLUME_MAP[version]?.[level];
    if(!volume)return json(res,400,{ok:false,message:'Phiên bản và cấp độ HSKK không hợp lệ.'});
    const questions=Array.isArray(b.questions)?b.questions:[];
    const patterns={beginner:[['listen_repeat',15],['listen_answer',10],['answer_question',2]],intermediate:[['listen_repeat',10],['picture_description',2],['answer_question',2]],advanced:[['listen_restate',3],['read_aloud',1],['answer_question',2]]};
    const requiredTypes=patterns[level]||[];const expected=requiredTypes.reduce((n,x)=>n+x[1],0);
    if(questions.length!==expected)return json(res,400,{ok:false,message:`${level==='beginner'?'Sơ cấp':level==='intermediate'?'Trung cấp':'Cao cấp'} cần đúng ${expected} câu.`});
    let expectedIndex=0;for(const [requiredType,count] of requiredTypes){for(let j=0;j<count;j++){if(String(questions[expectedIndex]?.type||'')!==requiredType)return json(res,400,{ok:false,message:`Cấu trúc câu ${expectedIndex+1} chưa đúng. ${version} · ${level} cần dạng ${requiredType}.`});expectedIndex++;}}
    for(const q of questions){
      const type=String(q.type||'');
      if(['listen_repeat','listen_answer','listen_restate'].includes(type)&&!String(q.audioUrl||''))return json(res,400,{ok:false,message:`Câu ${q.number}: câu nghe cần có audio.`});
      if(type==='picture_description'&&!String(q.imageUrl||''))return json(res,400,{ok:false,message:`Câu ${q.number}: câu mô tả tranh cần có hình ảnh.`});
      if(['answer_question','read_aloud'].includes(type)&&!String(q.text||'').trim())return json(res,400,{ok:false,message:`Câu ${q.number}: cần nhập nội dung hiển thị.`});
      if(Number(q.responseSeconds||0)<1||Number(q.responseSeconds||0)>3600)return json(res,400,{ok:false,message:`Câu ${q.number}: thời gian trả lời không hợp lệ.`});
    }
    const id=String(b.id||crypto.randomUUID()),title=String(b.title||`HSKK ${version} · ${level} · Test ${testNo}`).trim();
    const content={program:'hskk',hskkVersion:version,hskkLevel:level,hskkLevelLabel:({beginner:'Sơ cấp',intermediate:'Trung cấp',advanced:'Cao cấp'})[level],hskkPreparationMinutes:Math.max(0,Math.min(60,Number(b.preparationMinutes||0))),questions};
    await dbQuery(`INSERT INTO practice_tests(id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,series_label,display_test_label,card_label,card_subtitle,published) VALUES($1,'speaking',$2,$3,$4,'HSKK',$5,$6,$7::jsonb,'{}'::jsonb,'{}'::jsonb,'',$8,$9,$10,$11,TRUE) ON CONFLICT(skill,volume,test_no) DO UPDATE SET title=EXCLUDED.title,question_type='HSKK',duration_minutes=EXCLUDED.duration_minutes,total_questions=EXCLUDED.total_questions,content=EXCLUDED.content,series_label=EXCLUDED.series_label,display_test_label=EXCLUDED.display_test_label,card_label=EXCLUDED.card_label,card_subtitle=EXCLUDED.card_subtitle,published=TRUE,updated_at=NOW()`,[id,volume,testNo,title,Number(b.durationMinutes||20),questions.length,JSON.stringify(content),`${version==='2.0'?'HSKK 2.0':'HSK Speaking 3.0'} · ${content.hskkLevelLabel}`,`Test ${testNo}`,`${version} · ${content.hskkLevelLabel}`,`${questions.length} câu · ghi âm từng câu`]);
    const saved=(await dbQuery(`SELECT id FROM practice_tests WHERE skill='speaking' AND volume=$1 AND test_no=$2 LIMIT 1`,[volume,testNo])).rows[0];
    return json(res,201,{ok:true,id:saved?.id||id,volume,testNo,totalQuestions:questions.length,message:'Đã lưu đề HSKK.'});
  }
  if(url.pathname.match(/^\/api\/admin\/hskk\/tests\/[0-9a-f-]+$/i) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop();const r=await dbQuery(`DELETE FROM practice_tests WHERE id=$1 AND lower(skill)='speaking' AND volume=ANY($2::int[]) RETURNING id`,[id,HSKK_VOLUMES]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy đề HSKK.'});
    return json(res,200,{ok:true,message:'Đã xóa đề HSKK.'});
  }

  if(url.pathname==='/api/practice' && req.method==='GET'){
    const skill=String(url.searchParams.get('skill')||'').toLowerCase(); const volumeParam=url.searchParams.get('volume'); const volume=volumeParam===null||volumeParam===''?null:Number(volumeParam);
    const allowedSkills=['listening','reading','writing','translation'];
    let sql='SELECT id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,audio_url,source_file,published,updated_at,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name FROM practice_tests WHERE published=TRUE AND volume=79 AND lower(skill)=ANY($1::text[])'; const params=[allowedSkills];
    if(skill && !allowedSkills.includes(skill))return json(res,400,{ok:false,message:'Kỹ năng không thuộc chương trình HSK 7–9.'}); if(skill){params.push(skill);sql+=` AND lower(skill)=$${params.length}`;} if(volume!==null && (!Number.isFinite(volume)||volume!==79))return json(res,200,{ok:true,tests:[]}); sql+=' ORDER BY skill,test_no';
    const rows=(await dbQuery(sql,params)).rows; const u=candidate(req);
    const tests=[];
    for(const t of rows){const a=await getPracticeAccess(u,t);tests.push({...t,allowed:a.allowed,lockReason:a.reason});}
    return json(res,200,{ok:true,tests});
  }
  if(url.pathname==='/api/practice/catalog' && req.method==='GET'){
    const rows=(await dbQuery(`SELECT lower(skill) AS skill,COUNT(*)::int AS test_count FROM practice_tests WHERE published=TRUE AND volume=79 AND lower(skill)=ANY($1::text[]) GROUP BY lower(skill) ORDER BY lower(skill)`,[['listening','reading','writing','translation']])).rows;
    return json(res,200,{ok:true,program:'HSK 7–9',skills:rows});
  }
  if(url.pathname==='/api/mock79' && req.method==='GET'){
    const row=(await dbQuery(`SELECT id,title,description,section_minutes FROM hsk79_mock_exams WHERE published=TRUE ORDER BY updated_at DESC LIMIT 1`)).rows[0];
    return json(res,200,{ok:true,exam:row||null,configured:!!row});
  }
  if(url.pathname.match(/^\/api\/mock79\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để tham gia thi thử.'});
    const id=url.pathname.split('/').pop();
    const config=(await dbQuery('SELECT * FROM hsk79_mock_exams WHERE id=$1 AND published=TRUE LIMIT 1',[id])).rows[0];
    if(!config)return json(res,404,{ok:false,message:'Chưa có cấu hình thi thử tổng hợp HSK 7–9.'});
    const picks=[['listening',config.listening_test_id],['reading',config.reading_test_id],['writing',config.writing_test_id],['translation',config.translation_test_id]];
    const tests={};
    for(const [skill,testId] of picks){
      const test=(await dbQuery('SELECT * FROM practice_tests WHERE id=$1 AND volume=79 AND published=TRUE AND lower(skill)=$2 LIMIT 1',[testId,skill])).rows[0];
      if(!test)return json(res,409,{ok:false,message:`Admin cần chọn và xuất bản một đề ${skill.toUpperCase()} trong bộ thi thử.`});
      const access=await getPracticeAccess(u,test);
      if(!access.allowed)return json(res,403,{ok:false,message:`Tài khoản chưa có quyền làm phần ${skill.toUpperCase()} của bài thi thử tổng hợp.`});
      tests[skill]={id:test.id,skill:test.skill,title:test.title,questionType:test.question_type,durationMinutes:test.duration_minutes,totalQuestions:test.total_questions,content:sanitizePracticeContent(test.content||{}),audioUrl:test.audio_url||''};
    }
    return json(res,200,{ok:true,exam:{id:config.id,title:config.title,description:config.description||'',sectionMinutes:config.section_minutes||{},tests}});
  }
  if(url.pathname==='/api/mock79/submit' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'});
    const b=await body(req),examId=String(b.examId||'');
    const config=(await dbQuery('SELECT * FROM hsk79_mock_exams WHERE id=$1 AND published=TRUE LIMIT 1',[examId])).rows[0];
    if(!config)return json(res,404,{ok:false,message:'Không tìm thấy bộ đề thi thử.'});
    const answers=b.answers&&typeof b.answers==='object'?b.answers:{};
    const tests={};
    for(const [skill,field] of Object.entries({listening:'listening_test_id',reading:'reading_test_id',writing:'writing_test_id',translation:'translation_test_id'})){
      const row=(await dbQuery('SELECT * FROM practice_tests WHERE id=$1 AND volume=79 AND published=TRUE AND lower(skill)=$2 LIMIT 1',[config[field],skill])).rows[0];
      if(!row)return json(res,409,{ok:false,message:`Thiếu đề ${skill.toUpperCase()} trong bộ thi thử.`});
      const access=await getPracticeAccess(u,row); if(!access.allowed)return json(res,403,{ok:false,message:`Bạn chưa có quyền làm phần ${skill.toUpperCase()}.`});
      tests[skill]=row;
    }
    const skillScores={};
    try{
      skillScores.listening=gradeObjectiveTest(tests.listening,answers.listening||{});
      skillScores.reading=gradeObjectiveTest(tests.reading,answers.reading||{});
      const wTasks=Array.isArray(tests.writing.content?.questions)?tests.writing.content.questions:[];
      const tTasks=Array.isArray(tests.translation.content?.questions)?tests.translation.content.questions:[];
      const [writingReview,translationReview]=await Promise.all([
        gradeHskWriting({tasks:wTasks,answers:answers.writing||{},testTitle:tests.writing.title,volume:'7–9'}),
        gradeHskTranslation({tasks:tTasks,answers:answers.translation||{},testTitle:tests.translation.title,volume:'7–9'})
      ]);
      skillScores.writing={score:Number(writingReview.overallScore||0),review:writingReview};
      skillScores.translation={score:Number(translationReview.overallScore||0),review:translationReview};
    }catch(err){
      console.error('Unified mock grading failed:',err);
      return json(res,502,{ok:false,message:`Chưa thể chấm đủ bốn kỹ năng nên chưa thể quy đổi mức HSK. ${String(err?.message||'Vui lòng kiểm tra đáp án và cấu hình Gemini rồi nộp lại.')}`});
    }
    const overall=Math.round((['listening','reading','writing','translation'].reduce((sum,k)=>sum+Number(skillScores[k].score||0),0)/4)*100)/100;
    const settings=(await dbQuery('SELECT hsk7_min,hsk8_min,hsk9_min FROM hsk79_mock_settings WHERE id=1')).rows[0]||{hsk7_min:60,hsk8_min:75,hsk9_min:88};
    const h7=Number(settings.hsk7_min),h8=Number(settings.hsk8_min),h9=Number(settings.hsk9_min);
    const estimated=overall>=h9?'HSK 9':overall>=h8?'HSK 8':overall>=h7?'HSK 7':'Chưa đạt ngưỡng HSK 7';
    const id=crypto.randomUUID();
    const result={scores:skillScores,overallScore:overall,estimatedLevel:estimated,thresholds:{hsk7:h7,hsk8:h8,hsk9:h9},disclaimer:'Đây là mức ước tính nội bộ dựa trên điểm trung bình bốn kỹ năng của website, không phải chứng chỉ hay kết quả phân loại chính thức của CTI.'};
    await dbQuery(`INSERT INTO hsk79_mock_attempts(id,user_id,mock_exam_id,student_name,answers,scores,overall_score,estimated_level) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,[id,u.id,examId,String(u.full_name||''),JSON.stringify(answers),JSON.stringify(result),overall,estimated]);
    return json(res,201,{ok:true,id,result});
  }
  if(url.pathname.match(/^\/api\/mock79\/attempt\/[0-9a-f-]+$/i) && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập.'});
    const id=url.pathname.split('/').pop();
    const row=(await dbQuery('SELECT id,student_name,scores,overall_score,estimated_level,submitted_at FROM hsk79_mock_attempts WHERE id=$1 AND user_id=$2 LIMIT 1',[id,u.id])).rows[0];
    if(!row)return json(res,404,{ok:false,message:'Không tìm thấy kết quả thi thử.'});
    return json(res,200,{ok:true,attempt:row,result:row.scores||{}});
  }
  if(url.pathname.startsWith('/api/admin/mock79') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const exam=(await dbQuery('SELECT * FROM hsk79_mock_exams ORDER BY updated_at DESC LIMIT 1')).rows[0]||null;
    const settings=(await dbQuery('SELECT hsk7_min,hsk8_min,hsk9_min FROM hsk79_mock_settings WHERE id=1')).rows[0];
    const attempts=(await dbQuery(`SELECT a.id,a.student_name,a.overall_score,a.estimated_level,a.submitted_at,e.title AS exam_title FROM hsk79_mock_attempts a LEFT JOIN hsk79_mock_exams e ON e.id=a.mock_exam_id ORDER BY a.submitted_at DESC LIMIT 100`)).rows;
    return json(res,200,{ok:true,exam,settings,attempts});
  }
  if(url.pathname==='/api/admin/mock79' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req),testIds=b.testIds||{};
    const picks={listening:String(testIds.listening||''),reading:String(testIds.reading||''),writing:String(testIds.writing||''),translation:String(testIds.translation||'')};
    if(Object.values(picks).some(x=>!x))return json(res,400,{ok:false,message:'Hãy chọn đủ đề Listening, Reading, Writing và Translation.'});
    for(const [skill,testId] of Object.entries(picks)){
      const row=(await dbQuery('SELECT id,skill,volume,published FROM practice_tests WHERE id=$1 LIMIT 1',[testId])).rows[0];
      if(!row||row.published!==true||Number(row.volume)!==79||String(row.skill).toLowerCase()!==skill)return json(res,400,{ok:false,message:`Đề ${skill.toUpperCase()} phải thuộc kho HSK 7–9 chung và đã xuất bản.`});
    }
    const minutes={}; for(const skill of Object.keys(picks)){const n=Number(b.sectionMinutes?.[skill]||({listening:45,reading:70,writing:90,translation:100}[skill]));if(!Number.isFinite(n)||n<1||n>240)return json(res,400,{ok:false,message:`Thời gian ${skill} không hợp lệ.`});minutes[skill]=Math.round(n)}
    const thresholds=b.thresholds||{}; const h7=Number(thresholds.hsk7??60),h8=Number(thresholds.hsk8??75),h9=Number(thresholds.hsk9??88);
    if(!(Number.isFinite(h7)&&Number.isFinite(h8)&&Number.isFinite(h9)&&h7>=0&&h8>h7&&h9>h8&&h9<=100))return json(res,400,{ok:false,message:'Ngưỡng điểm cần theo thứ tự HSK7 < HSK8 < HSK9 và không vượt quá 100.'});
    const id=String(b.id||crypto.randomUUID()),title=String(b.title||'Thi thử tổng hợp HSK 7–9').trim();
    const exam=(await dbQuery(`INSERT INTO hsk79_mock_exams(id,title,description,listening_test_id,reading_test_id,writing_test_id,translation_test_id,section_minutes,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,listening_test_id=EXCLUDED.listening_test_id,reading_test_id=EXCLUDED.reading_test_id,writing_test_id=EXCLUDED.writing_test_id,translation_test_id=EXCLUDED.translation_test_id,section_minutes=EXCLUDED.section_minutes,published=EXCLUDED.published,updated_at=NOW() RETURNING *`,[id,title,String(b.description||''),picks.listening,picks.reading,picks.writing,picks.translation,JSON.stringify(minutes),b.published!==false])).rows[0];
    await dbQuery(`UPDATE hsk79_mock_exams SET published=FALSE WHERE id<>$1`,[id]);
    await dbQuery(`UPDATE hsk79_mock_settings SET hsk7_min=$1,hsk8_min=$2,hsk9_min=$3,updated_at=NOW() WHERE id=1`,[h7,h8,h9]);
    return json(res,200,{ok:true,exam,settings:{hsk7_min:h7,hsk8_min:h8,hsk9_min:h9}});
  }

  if(url.pathname.startsWith('/api/practice/') && req.method==='GET'){
    const id=url.pathname.split('/').pop(); const r=await dbQuery(`SELECT * FROM practice_tests WHERE id=$1 AND published=TRUE AND volume=79 AND lower(skill)=ANY($2::text[])`,[id,['listening','reading','writing','translation']]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Không tìm thấy đề HSK 7–9.'}); const x=r.rows[0]; const u=candidate(req);
    const access=await getPracticeAccess(u,x);
    if(!access.allowed)return json(res,u?403:401,{ok:false,message:u?'Bài này đang bị khóa. Vui lòng mua/gia hạn PRO hoặc liên hệ Admin để được mở quyền.':'Vui lòng đăng nhập để làm bài.'});
    return json(res,200,{ok:true,test:{id:x.id,skill:x.skill,volume:x.volume,testNo:x.test_no,title:x.title,questionType:x.question_type,durationMinutes:x.duration_minutes,totalQuestions:x.total_questions,content:sanitizePracticeContent(x.content||{}),audioUrl:x.audio_url,sourceFile:x.source_file,seriesLabel:x.series_label,displayTestLabel:x.display_test_label,cardLabel:x.card_label,cardSubtitle:x.card_subtitle,attemptsCount:x.attempts_count,statusLabel:x.status_label,buttonLabel:x.button_label,coverUrl:x.cover_url,accessReason:access.reason}});
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
  if(url.pathname==='/api/payment-settings' && req.method==='GET'){
    const r=await dbQuery('SELECT payment_title,qr_url,bank_name,account_name,account_number,transfer_note,instructions,updated_at FROM payment_settings WHERE id=1 LIMIT 1');
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
    const r=await dbQuery(`UPDATE practice_tests SET audio_url=$1,updated_at=NOW() WHERE id=$2 AND volume=79 AND lower(skill)=ANY(ARRAY['listening','reading','writing','translation']) RETURNING id,audio_url`,[audioUrl,id]);
    if(!r.rows.length)return json(res,404,{ok:false,message:'Không tìm thấy đề thi.'});
    return json(res,200,{ok:true,message:'Đã lưu audio mà không thay đổi câu hỏi.',audioUrl:r.rows[0].audio_url});
  }

  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const r=await dbQuery(`SELECT id,skill,volume,test_no,title,question_type,duration_minutes,total_questions,content,answer_key,explanations,audio_url,source_file,source_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name,published FROM practice_tests WHERE id=$1 AND volume=79 AND lower(skill)=ANY(ARRAY['listening','reading','writing','translation'])`,[id]);
    if(!r.rows[0])return json(res,404,{ok:false,message:'Không tìm thấy đề HSK 7–9.'});
    return json(res,200,{ok:true,test:r.rows[0]});
  }
  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const r=await dbQuery(`DELETE FROM practice_tests WHERE id=$1 AND volume=79 AND lower(skill)=ANY(ARRAY['listening','reading','writing','translation'])`,[id]);
    if(!r.rowCount)return json(res,404,{ok:false,message:'Không tìm thấy đề HSK 7–9.'});
    return json(res,200,{ok:true,message:'Practice test deleted.'});
  }
  if(url.pathname==='/api/admin/asset/upload' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {files}=await parseMultipart(req);
    const f=files.find(x=>x.field==='audio' || x.field==='file');
    if(!f)return json(res,400,{ok:false,message:'No file uploaded.'});
    if(!/\.(mp3|wav|m4a|ogg|png|jpe?g|webp|pdf)$/i.test(f.original))return json(res,400,{ok:false,message:'Unsupported file type.'});
    return json(res,201,{ok:true,url:f.url,filename:f.original,mime:f.mime,size:f.size});
  }
  if(url.pathname.startsWith('/api/admin/practice/') && req.method==='PUT'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const b=await body(req);
    const answers=(b.answerKey && typeof b.answerKey==='object')?b.answerKey:{};
    const explanations=(b.explanations && typeof b.explanations==='object')?b.explanations:{};
    const content=(b.content && typeof b.content==='object')?b.content:null;
    await dbQuery(`UPDATE practice_tests SET answer_key=$1::jsonb, explanations=$2::jsonb, content=COALESCE($3::jsonb,content), updated_at=NOW() WHERE id=$4 AND volume=79 AND lower(skill)=ANY(ARRAY['listening','reading','writing','translation'])`,[JSON.stringify(answers),JSON.stringify(explanations),content?JSON.stringify(content):null,id]);
    return json(res,200,{ok:true,message:'Answer key and explanations saved.',answerCount:Object.keys(answers).filter(k=>String(answers[k]??'').trim()!=='').length});
  }
  if(url.pathname==='/api/admin/practice/import' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const {fields,files}=await parseMultipart(req); const skill=String(fields.skill||'').toLowerCase(); const volume=79; const testNo=Number(fields.testNo||0); if(!['listening','reading','writing','translation'].includes(skill)||testNo<=0)return json(res,400,{ok:false,message:'Chỉ nhập kho HSK 7–9 chung với Listening, Reading, Writing hoặc Translation.'});
    const doc=files.find(f=>f.field==='document'); const audio=files.find(f=>f.field==='audio');
    if(!doc)return json(res,400,{ok:false,message:'Hãy tải file Word (.docx) hoặc TXT.'});
    if(!isAllowedDoc(doc.original))return json(res,400,{ok:false,message:'Tài liệu phải là DOCX hoặc TXT.'});
    let text=''; if(/\.docx$/i.test(doc.original)) text=parseDocxText(doc.path); else text=fs.readFileSync(doc.path,'utf8');
    let parsed=parseImportedText(text);
    if(!parsed.questions.length && ['writing','translation'].includes(skill)){
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
    const volume=79;
    const testNo=Number(b.testNo||0);
    if(!['listening','reading','writing','translation'].includes(skill)||testNo<=0)return json(res,400,{ok:false,message:'Chỉ nhận nội dung HSK 7–9 chung với bốn kỹ năng hợp lệ.'});
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
    await dbQuery(`INSERT INTO payment_settings(id,payment_title,qr_url,bank_name,account_name,account_number,transfer_note,instructions)
      VALUES(1,$1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET payment_title=EXCLUDED.payment_title,qr_url=EXCLUDED.qr_url,bank_name=EXCLUDED.bank_name,account_name=EXCLUDED.account_name,account_number=EXCLUDED.account_number,transfer_note=EXCLUDED.transfer_note,instructions=EXCLUDED.instructions,updated_at=NOW()`,
      [String(fields.paymentTitle||'THANH TOÁN KHÓA HỌC EIT').trim(),qrUrl,String(fields.bankName||'').trim(),String(fields.accountName||'').trim(),String(fields.accountNumber||'').trim(),String(fields.transferNote||'EIT COURSE').trim(),String(fields.instructions||'').trim()]);
    return json(res,200,{ok:true,qrUrl});
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
        const requestedSkills=Number(order.skills||0);
        const requestedAccess=normalizeSkills(Array.isArray(order.skill_access)?order.skill_access:[]);
        const durationDays=Math.max(1,Number(order.duration_days||30));
        if(!requestedSkills||requestedAccess.length!==requestedSkills)return json(res,400,{ok:false,message:`Không xác định được kỹ năng của đơn PRO ${order.id}.`});
        // Treat a new skill package as an additive purchase: adding HSKK must not revoke the original four HSK skills, and vice versa.
        const existing=(await dbQuery(`SELECT skill_access,status,expires_at FROM pro_entitlements WHERE user_id=$1 LIMIT 1`,[user.id])).rows[0];
        const existingActive=existing?.status==='active' && new Date(existing.expires_at)>new Date();
        const mergedAccess=normalizeSkills([...(existingActive&&Array.isArray(existing.skill_access)?existing.skill_access:[]),...requestedAccess]);
        await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'purchase','active',NOW(),NOW()+make_interval(days=>$5)) ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+make_interval(days=>$5)),source='purchase',updated_at=NOW()`,[crypto.randomUUID(),user.id,mergedAccess.length,JSON.stringify(mergedAccess),durationDays]);
      }
    }
    return json(res,200,{ok:true,message:status==='approved'?'Đã duyệt PRO.':status==='rejected'?'Đã từ chối đơn PRO.':'Đã cập nhật đơn PRO.'});
  }
  if(url.pathname==='/api/admin/pro-orders' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT id,user_id,student_name,email,phone,skills,amount,status,plan,duration_days,skill_access,created_at FROM pro_orders ORDER BY created_at DESC`)).rows;
    return json(res,200,{ok:true,orders:rows.map(x=>({id:x.id,userId:x.user_id||'',studentName:x.student_name,email:x.email,phone:x.phone||'',skills:Number(x.skills),amount:Number(x.amount),status:x.status,plan:x.plan||'',durationDays:Number(x.duration_days||30),skillAccess:Array.isArray(x.skill_access)?x.skill_access:[],createdAt:x.created_at}))});
  }
  if(url.pathname==='/api/admin/content' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const tests=(await dbQuery(`SELECT id,skill,volume,test_no,title,question_type,total_questions,audio_url,source_file,source_url,series_label,display_test_label,card_label,card_subtitle,attempts_count,status_label,button_label,cover_url,category_id,(SELECT name FROM test_categories WHERE id=practice_tests.category_id) AS category_name,published,updated_at FROM practice_tests WHERE volume=79 AND lower(skill)=ANY(ARRAY['listening','reading','writing','translation']) ORDER BY skill,volume,test_no`)).rows; const predictions=(await dbQuery('SELECT * FROM prediction_files ORDER BY created_at DESC')).rows; const courses=(await dbQuery('SELECT * FROM course_posts ORDER BY created_at ASC')).rows; return json(res,200,{ok:true,tests,predictions,courses});
  }
  if(url.pathname==='/api/config' && req.method==='GET'){
    return json(res,200,{ok:true,googleClientId:GOOGLE_CLIENT_ID});
  }
  if(url.pathname==='/api/candidate/google' && req.method==='POST'){
    if(!GOOGLE_CLIENT_ID)return json(res,503,{ok:false,message:'Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID).'});
    const b=await body(req); const credential=String(b.credential||'');
    if(!credential)return json(res,400,{ok:false,message:'Thiếu thông tin đăng nhập Google.'});
    try{
      const g=await verifyGoogleIdToken(credential);
      if(g.aud!==GOOGLE_CLIENT_ID)return json(res,401,{ok:false,message:'Token Google không thuộc ứng dụng này.'});
      if(String(g.email_verified)!=='true')return json(res,401,{ok:false,message:'Email Google chưa được xác minh.'});
      const sub=String(g.sub||''); const email=String(g.email||'').trim().toLowerCase(); const name=String(g.name||email.split('@')[0]||'Học viên Google'); const avatar=String(g.picture||'');
      if(!sub||!email)return json(res,401,{ok:false,message:'Không đọc được thông tin tài khoản Google.'});
      let u=(await dbQuery(`SELECT * FROM users WHERE google_sub=$1 LIMIT 1`,[sub])).rows[0];
      if(!u){
        // Tạo tài khoản mới bằng Google: KHÔNG có PRO, chỉ dùng được đề miễn phí.
        const id=crypto.randomUUID(); const eit='GG-'+crypto.randomBytes(5).toString('hex').toUpperCase();
        u=(await dbQuery(`INSERT INTO users(id,full_name,dob,registration_id,eit_code,email,password_hash,active,auth_provider,google_sub,google_email_verified,avatar_url) VALUES($1,$2,NULL,$3,$3,$4,NULL,TRUE,'google',$5,TRUE,$6) RETURNING *`,[id,name,eit,email,sub,avatar])).rows[0];
      }else{
        if(!u.active)return json(res,403,{ok:false,message:'Tài khoản đã bị khóa. Vui lòng liên hệ Admin.'});
        await dbQuery(`UPDATE users SET avatar_url=$2,google_email_verified=TRUE,updated_at=NOW() WHERE id=$1`,[u.id,avatar||u.avatar_url||'']);
      }
      await grantCoursePro(u);
      const t=crypto.randomBytes(32).toString('hex'); CANDIDATE_TOKENS.set(t,{expiresAt:Date.now()+12*60*60*1000,user:u});
      return json(res,200,{ok:true,token:t,user:{id:u.id,fullname:u.full_name,username:u.registration_id||u.eit_code,dob:u.dob,registrationid:u.registration_id,eitcode:u.eit_code,email:u.email||'',avatarUrl:avatar,provider:'google'}});
    }catch(err){
      console.error('Google login error:',err);
      return json(res,401,{ok:false,message:err.message||'Đăng nhập Google thất bại.'});
    }
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
    const row=(await dbQuery(`SELECT r.*,s.user_id,s.test_title,s.skill,s.submitted_at FROM ai_skill_reviews r JOIN submissions s ON s.id=r.submission_id WHERE r.submission_id=$1`,[id])).rows[0];
    if(!row || String(row.user_id)!==String(u.id)) return json(res,404,{ok:false,message:'AI review not found.'});
    const result=typeof row.result==='object'?row.result:{};
    let detailAllowed=['writing','translation'].includes(String(row.skill||'').toLowerCase());
    if(String(row.skill||'').toLowerCase()==='speaking'){
      const ent=await getEntitlement(u.id);
      detailAllowed=isProSpeaking(ent);
    }
    let review=result;
    if(String(row.skill||'').toLowerCase()==='speaking' && result.examMode==='hskk' && !detailAllowed){
      review={overallScore:Number(result.overallScore??row.overall_band??0),examMode:'hskk',hskkVersion:result.hskkVersion||'2.0',hskkLevel:result.hskkLevel||'beginner',hskkLevelLabel:result.hskkLevelLabel||'HSKK',examinerSummary:result.examinerSummary||'',criteria:result.criteria||{},questionFeedback:(result.questionFeedback||[]).slice(0,4).map(x=>({questionNumber:x.questionNumber,questionType:x.questionType,score:x.score,feedback:x.feedback,improvements:(x.improvements||[]).slice(0,2)})),priorityFixes:(result.priorityFixes||[]).slice(0,3),practicePlan:(result.practicePlan||[]).slice(0,3)};
    }
    const safe={ok:true,skill:row.skill,testId:row.test_id,submissionId:row.submission_id,model:row.model||GEMINI_MODEL,status:row.status,errorMessage:row.status==='failed'?String(row.error_message||''):'' ,overallScore:row.overall_band==null?null:Number(row.overall_band),overallBand:row.overall_band==null?null:Number(row.overall_band),examMode:result.examMode||'',hskkVersion:result.hskkVersion||'',hskkLevel:result.hskkLevel||'',hskkLevelLabel:result.hskkLevelLabel||'',detailAllowed,review};
    return json(res,200,safe);
  }

  if(url.pathname.startsWith('/api/admin/ai-review/') && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').pop(); const row=(await dbQuery(`SELECT r.*,s.student_name,s.student_email,s.test_title,s.skill FROM ai_skill_reviews r JOIN submissions s ON s.id=r.submission_id WHERE r.submission_id=$1`,[id])).rows[0];
    if(!row)return json(res,404,{ok:false,message:'AI review not found.'});
    return json(res,200,{ok:true,review:{submissionId:row.submission_id,studentName:row.student_name,studentEmail:row.student_email,skill:row.skill,model:row.model,status:row.status,errorMessage:row.error_message||'',overallBand:row.overall_band==null?null:Number(row.overall_band),result:row.result&&typeof row.result==='object'?row.result:{}}});
  }

  if(url.pathname==='/api/submit' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    const b=await body(req); if(!b.testId || !b.answers)return json(res,400,{ok:false,message:'Missing testId or answers'});
    const testRow=(await dbQuery('SELECT id,skill,volume,test_no,title,content,answer_key,explanations,published FROM practice_tests WHERE id=$1 LIMIT 1',[String(b.testId)])).rows[0];
    const skill=String(testRow?.skill||'').toLowerCase(),volume=Number(testRow?.volume||0);
    const isHsk79=testRow?.published===true && volume===79 && ['listening','reading','writing','translation'].includes(skill);
    const isHskk=testRow?.published===true && skill==='speaking' && HSKK_VOLUMES.includes(volume);
    if(!testRow || (!isHsk79&&!isHskk))return json(res,404,{ok:false,message:'Không tìm thấy bài HSK7–9 hoặc HSKK hợp lệ.'});
    if(String(b.skill||'').toLowerCase()!==skill)return json(res,400,{ok:false,message:'Kỹ năng gửi lên không khớp với đề thi.'});
    const access=await getPracticeAccess(u,testRow); if(!access.allowed)return json(res,403,{ok:false,message:'Bạn chưa được cấp quyền làm đề này.'});
    const sid=crypto.randomUUID();
    await dbQuery(`INSERT INTO submissions(id,user_id,student_name,student_email,student_code,eit_code,dob,test_id,test_title,skill,answers,highlights,notes,total,score,auto_submitted,elapsed_seconds)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,NULL,$15,$16)`,[
      sid,u.id,u.full_name,u.email||'',u.registration_id,u.eit_code,u.dob||null,String(b.testId),String(testRow.title||''),skill,JSON.stringify(b.answers),JSON.stringify(b.highlights||[]),JSON.stringify(b.notes||[]),b.total==null?Number(testRow.total_questions||40):Number(b.total),!!b.autoSubmitted,Number(b.elapsedSeconds||0)]);
    let ai=null; let aiError='';
    try{
      if(skill==='writing' || skill==='translation'){
        const tasks=Array.isArray(testRow?.content?.questions)?testRow.content.questions:[];
        ai=skill==='writing'
          ? await gradeHskWriting({tasks,answers:b.answers||{},testTitle:String(b.testTitle||''),volume})
          : await gradeHskTranslation({tasks,answers:b.answers||{},testTitle:String(b.testTitle||''),volume});
        const score=Number(ai.overallScore||0); const rid=crypto.randomUUID();
        await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET skill=EXCLUDED.skill,model=EXCLUDED.model,overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[rid,sid,u.id,skill,GEMINI_MODEL,score,JSON.stringify(ai)]);
      } else if(skill==='speaking' && isHskk){
        const rec=Array.isArray(b.answers?.recordings)?b.answers.recordings:[];
        if(!rec.length)throw new Error('Chưa có bản ghi âm HSKK.');
        ai=await gradeHskkSpeaking(rec.map((x,i)=>({questionNumber:Number(x.questionNumber||i+1),part:Number(x.part||1),questionType:String(x.questionType||''),prompt:String(x.prompt||''),preparationSeconds:Number(x.preparationSeconds||0),responseSeconds:Number(x.responseSeconds||0),mime:String(x.mime||'audio/webm'),audio:String(x.audio||''),promptAudio:String(x.promptAudio||''),promptImage:String(x.promptImage||''),transcript:String(x.transcript||'')})),{version:String(testRow.content?.hskkVersion||'2.0'),level:String(testRow.content?.hskkLevel||'beginner')});
        const score=Number(ai.overallScore||0),rid=crypto.randomUUID();
        await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,overall_band,result,status) VALUES($1,$2,$3,'speaking',$4,$5,$6::jsonb,'completed') ON CONFLICT(submission_id) DO UPDATE SET model=EXCLUDED.model,overall_band=EXCLUDED.overall_band,result=EXCLUDED.result,status='completed',error_message='',updated_at=NOW()`,[rid,sid,u.id,ai.model||GEMINI_MODEL,score,JSON.stringify(ai)]);
      }
    }catch(err){
      console.error('AI grading failed:',err); aiError=String(err?.message||'AI grading failed');
      const skill=String(b.skill||'').toLowerCase();
      if(skill==='writing'||skill==='translation'||(skill==='speaking'&&isHskk)) await dbQuery(`INSERT INTO ai_skill_reviews(id,submission_id,user_id,skill,model,status,error_message,result) VALUES($1,$2,$3,$4,$5,'failed',$6,'{}'::jsonb) ON CONFLICT(submission_id) DO UPDATE SET status='failed',error_message=EXCLUDED.error_message,updated_at=NOW()`,[crypto.randomUUID(),sid,u.id,skill,(['writing','translation'].includes(skill)?GEMINI_MODEL:DEEPSEEK_MODEL),String(err.message||'AI grading failed')]);
    }
    return json(res,201,{ok:true,id:sid,message:'Your answers have been submitted.',review:(skill==='reading'||skill==='listening')?{answerKey:testRow.answer_key||{},explanations:testRow.explanations||{}}:undefined,ai:ai?{available:true,overallScore:ai.overallScore??ai.overallBand,overallBand:ai.overallBand??null,model:ai.model||GEMINI_MODEL}:{available:false,model:GEMINI_MODEL,error:aiError||'AI grading failed'}});
  }

  if(url.pathname==='/api/pro/plans' && req.method==='GET'){
    const rows=(await dbQuery(`SELECT id,name,description,price,duration_days,skill_access FROM pro_plans WHERE active=TRUE ORDER BY price,duration_days,name`)).rows;
    return json(res,200,{ok:true,plans:rows.map(x=>({id:x.id,name:x.name,description:x.description||'',price:Number(x.price||0),durationDays:Number(x.duration_days||30),skillAccess:normalizeSkills(Array.isArray(x.skill_access)?x.skill_access:[])}))});
  }
  if(url.pathname==='/api/materials' && req.method==='GET'){
    const rows=(await dbQuery(`SELECT id,title,description,level,skill,price,cover_url,file_url FROM study_materials WHERE active=TRUE ORDER BY created_at DESC`)).rows;
    return json(res,200,{ok:true,materials:rows.map(x=>({...x,price:Number(x.price||0)}))});
  }
  if(url.pathname==='/api/material-orders' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để mua tài liệu.'});
    const b=await body(req); const requested=Array.isArray(b.items)?b.items:[]; if(!requested.length)return json(res,400,{ok:false,message:'Giỏ hàng đang trống.'});
    const quantities=new Map(); for(const it of requested){const id=String(it.id||'');const qty=Math.max(1,Math.min(20,Number(it.quantity||1)));if(id)quantities.set(id,(quantities.get(id)||0)+qty);}
    const items=[];let amount=0;
    for(const [id,quantity] of quantities){const row=(await dbQuery('SELECT id,title,price FROM study_materials WHERE id=$1 AND active=TRUE LIMIT 1',[id])).rows[0];if(!row)continue;const price=Number(row.price||0);items.push({id:row.id,title:row.title,price,quantity});amount+=price*quantity;}
    if(!items.length)return json(res,400,{ok:false,message:'Không còn tài liệu nào trong giỏ hàng.'});
    const id=crypto.randomUUID();await dbQuery(`INSERT INTO material_orders(id,user_id,student_name,email,items,amount,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,'pending')`,[id,u.id,u.full_name,u.email||'',JSON.stringify(items),amount]);
    return json(res,201,{ok:true,id,amount,items,message:'Đã tạo đơn mua tài liệu. Vui lòng hoàn tất thanh toán theo thông tin hiện trên trang.'});
  }
  if(url.pathname==='/api/material-orders/mine' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Vui lòng đăng nhập để xem đơn hàng.'});
    const rows=(await dbQuery('SELECT id,items,amount,status,created_at,updated_at FROM material_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[u.id])).rows;
    const orders=[];
    for(const row of rows){
      const source=Array.isArray(row.items)?row.items:[];
      const ready=['fulfilled'].includes(String(row.status||''));
      const items=[];
      for(const item of source){
        let downloadUrl='';
        if(ready && item.id){
          const material=(await dbQuery('SELECT file_url FROM study_materials WHERE id=$1 LIMIT 1',[String(item.id)])).rows[0];
          const candidateUrl=String(material?.file_url||'').trim();
          if(candidateUrl.startsWith('/uploads/') || /^https:\/\//i.test(candidateUrl)) downloadUrl=candidateUrl;
        }
        items.push({...item,downloadUrl});
      }
      orders.push({id:row.id,items,amount:Number(row.amount||0),status:row.status,createdAt:row.created_at,updatedAt:row.updated_at});
    }
    return json(res,200,{ok:true,orders});
  }
  if(url.pathname==='/api/admin/pro-plans' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery('SELECT * FROM pro_plans ORDER BY created_at DESC')).rows;
    return json(res,200,{ok:true,plans:rows.map(x=>({...x,price:Number(x.price||0),duration_days:Number(x.duration_days||30),skill_access:normalizeSkills(Array.isArray(x.skill_access)?x.skill_access:[])}))});
  }
  if(url.pathname==='/api/admin/pro-plans' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const b=await body(req), id=String(b.id||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,60), name=String(b.name||'').trim(), skills=normalizeSkills(b.skillAccess);
    const price=Math.max(0,Math.round(Number(b.price||0))), days=Math.max(1,Math.min(3650,Math.round(Number(b.durationDays||30))));
    if(!id||!name||!skills.length||price<=0)return json(res,400,{ok:false,message:'Nhập mã gói, tên, giá và ít nhất một kỹ năng.'});
    await dbQuery(`INSERT INTO pro_plans(id,name,description,price,duration_days,skill_access,active) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,price=EXCLUDED.price,duration_days=EXCLUDED.duration_days,skill_access=EXCLUDED.skill_access,active=EXCLUDED.active,updated_at=NOW()`,[id,name,String(b.description||''),price,days,JSON.stringify(skills),b.active!==false]);
    return json(res,200,{ok:true,message:'Đã lưu gói PRO.'});
  }
  if(url.pathname.match(/^\/api\/admin\/pro-plans\/[^/]+$/) && ['PATCH','DELETE'].includes(req.method)){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const id=decodeURIComponent(url.pathname.split('/').pop());
    if(req.method==='DELETE'){await dbQuery('DELETE FROM pro_plans WHERE id=$1',[id]);return json(res,200,{ok:true});}
    const b=await body(req),skills=normalizeSkills(b.skillAccess);const price=Math.max(0,Math.round(Number(b.price||0))),days=Math.max(1,Math.min(3650,Math.round(Number(b.durationDays||30))));
    await dbQuery(`UPDATE pro_plans SET name=$1,description=$2,price=$3,duration_days=$4,skill_access=$5::jsonb,active=$6,updated_at=NOW() WHERE id=$7`,[String(b.name||'').trim(),String(b.description||''),price,days,JSON.stringify(skills),b.active!==false,id]);return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/admin/materials' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const rows=(await dbQuery('SELECT * FROM study_materials ORDER BY created_at DESC')).rows;return json(res,200,{ok:true,materials:rows.map(x=>({...x,price:Number(x.price||0)}))});
  }
  if(url.pathname==='/api/admin/materials' && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const b=await body(req),title=String(b.title||'').trim(),price=Math.max(0,Math.round(Number(b.price||0)));if(!title||price<=0)return json(res,400,{ok:false,message:'Tên và giá tài liệu là bắt buộc.'});
    const id=b.id||crypto.randomUUID();await dbQuery(`INSERT INTO study_materials(id,title,description,level,skill,price,cover_url,file_url,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,level=EXCLUDED.level,skill=EXCLUDED.skill,price=EXCLUDED.price,cover_url=EXCLUDED.cover_url,file_url=EXCLUDED.file_url,active=EXCLUDED.active,updated_at=NOW()`,[id,title,String(b.description||''),'HSK 7–9',String(b.skill||''),price,String(b.coverUrl||''),String(b.fileUrl||''),b.active!==false]);return json(res,200,{ok:true,id,message:'Đã lưu tài liệu.'});
  }
  if(url.pathname.match(/^\/api\/admin\/materials\/[^/]+$/) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const id=decodeURIComponent(url.pathname.split('/').pop());await dbQuery('DELETE FROM study_materials WHERE id=$1',[id]);return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/admin/material-orders' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const rows=(await dbQuery('SELECT * FROM material_orders ORDER BY created_at DESC')).rows;return json(res,200,{ok:true,orders:rows.map(x=>({...x,amount:Number(x.amount||0)}))});
  }
  if(url.pathname.match(/^\/api\/admin\/material-orders\/[^/]+$/) && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});const id=decodeURIComponent(url.pathname.split('/').pop()),b=await body(req),status=String(b.status||'pending');if(!['pending','paid','fulfilled','rejected'].includes(status))return json(res,400,{ok:false,message:'Trạng thái không hợp lệ.'});await dbQuery('UPDATE material_orders SET status=$1,updated_at=NOW() WHERE id=$2',[status,id]);return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/me/pro' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    await grantCoursePro(u); const ent=await getEntitlement(u.id);
    if(!ent)return json(res,200,{ok:true,pro:{active:false,skills:0,skillAccess:[],daysRemaining:0}});
    return json(res,200,{ok:true,pro:{active:true,skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}});
  }
  if(url.pathname==='/api/pro/purchase-public' && req.method==='POST'){
    const b=await body(req); const plan=String(b.plan||'').trim(); const row=(await dbQuery('SELECT * FROM pro_plans WHERE id=$1 AND active=TRUE LIMIT 1',[plan])).rows[0]; if(!row)return json(res,400,{ok:false,message:'Gói PRO không còn khả dụng.'}); const skillAccess=planSkills(row); const cfg={skills:skillAccess.length,skillAccess,amount:Number(row.price||0),durationDays:Number(row.duration_days||30)}; if(!cfg.skills||cfg.amount<=0)return json(res,400,{ok:false,message:'Gói PRO chưa được cấu hình hợp lệ.'});
    const c=candidate(req); const fullName=String(b.fullName||c?.full_name||'').trim(); const email=String(b.email||c?.email||'').trim().toLowerCase(); const phone=String(b.phone||'').trim();
    if(!fullName||!email)return json(res,400,{ok:false,message:'Vui lòng nhập họ tên và email để tạo đơn PRO.'});
    let userId=c?.id||null;
    if(!userId){ userId=(await dbQuery(`SELECT id FROM users WHERE lower(trim(email))=$1 ORDER BY (auth_provider='google') DESC,created_at DESC LIMIT 1`,[email])).rows[0]?.id||null; }
    const r=await dbQuery(`INSERT INTO pro_orders(id,user_id,student_name,email,skills,amount,status,phone,plan,duration_days,skill_access) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10::jsonb) RETURNING id,created_at`,[crypto.randomUUID(),userId,fullName,email,cfg.skills,cfg.amount,phone,plan,cfg.durationDays,JSON.stringify(cfg.skillAccess)]);
    return json(res,201,{ok:true,id:r.rows[0].id,amount:cfg.amount,plan,durationDays:cfg.durationDays,message:'Đã tạo yêu cầu PRO.'});
  }
  if(url.pathname==='/api/pro/purchase' && req.method==='POST'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Please log in before purchasing PRO.'});
    const b=await body(req); const plan=String(b.plan||'').trim(); const row=(await dbQuery('SELECT * FROM pro_plans WHERE id=$1 AND active=TRUE LIMIT 1',[plan])).rows[0]; if(!row)return json(res,400,{ok:false,message:'Gói PRO không còn khả dụng.'}); const skillAccess=planSkills(row); const cfg={skills:skillAccess.length,skillAccess,amount:Number(row.price||0),durationDays:Number(row.duration_days||30)}; if(!cfg.skills||cfg.amount<=0)return json(res,400,{ok:false,message:'Gói PRO chưa được cấu hình hợp lệ.'});
    const r=await dbQuery(`INSERT INTO pro_orders(id,user_id,student_name,email,skills,amount,status,phone,plan,duration_days,skill_access) VALUES($1,$2,$3,$4,$5,$6,'pending','',$7,$8,$9::jsonb) RETURNING id,created_at`,[crypto.randomUUID(),u.id,u.full_name,u.email||'',cfg.skills,cfg.amount,plan,cfg.durationDays,JSON.stringify(cfg.skillAccess)]);
    return json(res,201,{ok:true,id:r.rows[0].id,amount:cfg.amount,plan,durationDays:cfg.durationDays,message:'PRO purchase request created.'});
  }
  if(url.pathname==='/api/results' && req.method==='GET'){
    const u=candidate(req); if(!u)return json(res,401,{ok:false,message:'Candidate session expired. Please log in again.'});
    const rows=(await dbQuery(`SELECT r.listening,r.reading,r.writing,r.speaking,r.translation,r.overall,r.message,r.feedback,r.feedback_published,
      (SELECT COUNT(*) FROM submissions s2 WHERE s2.user_id=r.user_id)::int AS test_session_count
      FROM results r WHERE r.user_id=$1 AND r.published=TRUE ORDER BY r.updated_at DESC LIMIT 1`,[u.id])).rows;
    if(!rows.length)return json(res,200,{ok:true,published:false});
    const r=rows[0]; return json(res,200,{ok:true,published:true,result:{listening:r.listening==null?null:Number(r.listening),reading:r.reading==null?null:Number(r.reading),writing:r.writing==null?null:Number(r.writing),speaking:r.speaking==null?null:Number(r.speaking),translation:r.translation==null?null:Number(r.translation),overall:r.overall==null?null:Number(r.overall),message:r.message||'',feedback:(r.feedback_published&&r.feedback&&typeof r.feedback==='object')?r.feedback:{},feedbackPublished:!!r.feedback_published,testSessionCount:r.test_session_count}});
  }

  if(url.pathname==='/api/admin/google-users' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const rows=(await dbQuery(`SELECT u.id,u.full_name,u.email,u.active,u.avatar_url,u.google_sub,u.google_email_verified,u.created_at,
      pe.skills,pe.skill_access,pe.status,pe.expires_at,pe.source FROM users u LEFT JOIN pro_entitlements pe ON pe.user_id=u.id AND pe.status='active' AND pe.expires_at>NOW() WHERE u.auth_provider='google' ORDER BY u.created_at DESC`)).rows;
    return json(res,200,{ok:true,users:rows.map(x=>({id:x.id,name:x.full_name,email:x.email,active:x.active,avatarUrl:x.avatar_url||'',googleVerified:!!x.google_email_verified,createdAt:x.created_at,pro:x.skills?{skills:Number(x.skills),skillAccess:normalizeSkills(Array.isArray(x.skill_access)?x.skill_access:[]),status:x.status,expiresAt:x.expires_at,source:x.source}:null}))});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/pro$/) && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0];
    await dbQuery(`DELETE FROM pro_entitlements WHERE user_id=$1`,[id]);
    return json(res,200,{ok:true,message:'Đã thu hồi PRO của tài khoản.'});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/pro$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const skills=Number(b.skills||0); const days=Math.max(1,Math.min(3650,Number(b.days||30)));
    const u=(await dbQuery(`SELECT id,full_name,email FROM users WHERE id=$1 LIMIT 1`,[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'Tài khoản không tồn tại.'});
    let skillAccess=normalizeSkills(b.skillAccess); if(!skillAccess.length && skills===4)skillAccess=ALL_SKILLS.slice();
    if(![1,2,3,4,5].includes(skills))return json(res,400,{ok:false,message:'Gói PRO không hợp lệ. Chọn từ 1 đến 5 kỹ năng.'});
    if(skillAccess.length!==skills)return json(res,400,{ok:false,message:`Gói ${skills} skills phải có đúng ${skills} kỹ năng được bật.`});
    await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'admin_grant','active',NOW(),NOW()+make_interval(days=>$5)) ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=CASE WHEN $6::boolean THEN NOW()+make_interval(days=>$5) ELSE GREATEST(pro_entitlements.expires_at,NOW()+make_interval(days=>$5)) END,source='admin_grant',updated_at=NOW()`,[crypto.randomUUID(),u.id,skills,JSON.stringify(skillAccess),days,!!b.replace]);
    return json(res,200,{ok:true,message:`Đã mở PRO ${skills} skills trong ${days} ngày.`,skillAccess});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/course$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const slug=String(b.courseSlug||'').trim();
    if(!slug)return json(res,400,{ok:false,message:'Thiếu courseSlug.'});
    const u=(await dbQuery(`SELECT id,full_name,email,dob FROM users WHERE id=$1 AND auth_provider='google' LIMIT 1`,[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'Google account không tồn tại.'});
    const c=(await dbQuery(`SELECT id,title FROM course_posts WHERE slug=$1 AND published=TRUE LIMIT 1`,[slug])).rows[0]; if(!c)return json(res,404,{ok:false,message:'Khóa học không tồn tại.'});
    await dbQuery(`INSERT INTO course_enrollments(id,course_id,user_id,course_title,student_name,dob,current_band,phone,email,voucher,status) VALUES($1,$2,$3,$4,$5,$6,NULL,'',$7,'','approved')`,[crypto.randomUUID(),c.id,u.id,c.title,u.full_name,u.dob,u.email]);
    const existing=(await dbQuery(`SELECT skill_access,status,expires_at FROM pro_entitlements WHERE user_id=$1 LIMIT 1`,[u.id])).rows[0];
    const existingActive=existing?.status==='active' && new Date(existing.expires_at)>new Date();
    const mergedAccess=normalizeSkills([...ALL_SKILLS,...(existingActive&&Array.isArray(existing.skill_access)?existing.skill_access.filter(x=>x==='speaking'):[])]);
    await dbQuery(`INSERT INTO pro_entitlements(id,user_id,skills,skill_access,source,status,starts_at,expires_at) VALUES($1,$2,$3,$4::jsonb,'course_enrollment','active',NOW(),NOW()+INTERVAL '30 days') ON CONFLICT(user_id) DO UPDATE SET skills=EXCLUDED.skills,skill_access=EXCLUDED.skill_access,status='active',expires_at=GREATEST(pro_entitlements.expires_at,NOW()+INTERVAL '30 days'),source='course_enrollment',updated_at=NOW()`,[crypto.randomUUID(),u.id,mergedAccess.length,JSON.stringify(mergedAccess)]);
    return json(res,200,{ok:true,message:'Đã gán khóa học và cấp PRO 4 kỹ năng HSK; quyền HSKK đang còn hạn được giữ nguyên.'});
  }

  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/test-access$/) && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0];
    const u=(await dbQuery('SELECT id,full_name,email,auth_provider FROM users WHERE id=$1 LIMIT 1',[id])).rows[0]; if(!u)return json(res,404,{ok:false,message:'User not found'});
    const tests=(await dbQuery("SELECT id,skill,volume,test_no,title,series_label,display_test_label,card_label,published FROM practice_tests WHERE (volume=79 AND lower(skill)=ANY($1::text[])) OR (volume=ANY($2::int[]) AND lower(skill)='speaking') ORDER BY skill,volume,test_no",[['listening','reading','writing','translation'],HSKK_VOLUMES])).rows;
    const overrides=new Map((await dbQuery('SELECT test_id,allowed,source FROM practice_access WHERE user_id=$1',[id])).rows.map(x=>[x.test_id,x]));
    const ent=await getEntitlement(id); const result=tests.map(t=>{const o=overrides.get(t.id); const a=resolvePracticeAccess(t,ent,o); return {...t,allowed:a.allowed,override:o?!!o.allowed:null,source:a.reason}});
    return json(res,200,{ok:true,user:u,tests:result,pro:ent?{skills:ent.skills,skillAccess:ent.skillAccess,expiresAt:ent.expiresAt,daysRemaining:ent.daysRemaining}:null});
  }
  if(url.pathname.match(/^\/api\/admin\/users\/[^/]+\/test-access$/) && req.method==='POST'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const id=url.pathname.split('/').slice(-2,-1)[0]; const b=await body(req); const testId=String(b.testId||''); const allowed=!!b.allowed;
    if(!testId)return json(res,400,{ok:false,message:'Thiếu testId.'});
    const test=(await dbQuery("SELECT id FROM practice_tests WHERE id=$1 AND ((volume=79 AND lower(skill)=ANY($2::text[])) OR (volume=ANY($3::int[]) AND lower(skill)='speaking')) LIMIT 1",[testId,['listening','reading','writing','translation'],HSKK_VOLUMES])).rows[0]; if(!test)return json(res,404,{ok:false,message:'Chỉ có thể cấp quyền cho đề HSK7–9 hoặc HSKK.'});
    if(b.clear){ await dbQuery('DELETE FROM practice_access WHERE user_id=$1 AND test_id=$2',[id,testId]); return json(res,200,{ok:true,message:'Đã khôi phục quyền mặc định.'}); }
    await dbQuery(`INSERT INTO practice_access(id,user_id,test_id,allowed,source) VALUES($1,$2,$3,$4,'admin') ON CONFLICT(user_id,test_id) DO UPDATE SET allowed=EXCLUDED.allowed,source='admin',updated_at=NOW()`,[crypto.randomUUID(),id,testId,allowed]);
    return json(res,200,{ok:true,message:allowed?'Đã mở quyền bài thi riêng.':'Đã khóa quyền bài thi riêng.'});
  }
  if(url.pathname==='/api/users' && req.method==='GET'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'});
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase();
    const rows=(await dbQuery(`SELECT u.id,u.full_name,u.dob,u.registration_id,u.eit_code,u.email,u.active,u.created_at,u.auth_provider,u.google_sub,u.google_email_verified,u.avatar_url,pe.skills AS pro_skills,pe.skill_access AS pro_skill_access,pe.expires_at AS pro_expires_at FROM users u LEFT JOIN pro_entitlements pe ON pe.user_id=u.id AND pe.status='active' AND pe.expires_at>NOW() WHERE $1='' OR lower(u.full_name) LIKE '%'||$1||'%' OR lower(u.registration_id) LIKE '%'||$1||'%' OR lower(u.eit_code) LIKE '%'||$1||'%' OR lower(u.email) LIKE '%'||$1||'%' ORDER BY u.created_at DESC`,[q])).rows;
    return json(res,200,{ok:true,users:rows.map(x=>({...x,pro:x.pro_skills?{skills:Number(x.pro_skills),skillAccess:normalizeSkills(Array.isArray(x.pro_skill_access)?x.pro_skill_access:[]),expiresAt:x.pro_expires_at}:null}))});
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
    const r=await dbQuery(`SELECT s.*,r.listening,r.reading,r.writing,r.speaking,r.translation,r.overall,r.message,r.published,r.feedback,r.feedback_published,(SELECT jsonb_build_object('skill',ar.skill,'model',ar.model,'status',ar.status,'overallBand',ar.overall_band,'result',ar.result,'errorMessage',ar.error_message) FROM ai_skill_reviews ar WHERE ar.submission_id=s.id LIMIT 1) AS ai_review FROM submissions s LEFT JOIN results r ON r.submission_id=s.id WHERE s.id=$1`,[id]); if(!r.rows.length)return json(res,404,{ok:false,message:'Not found'}); const x=r.rows[0];
    return json(res,200,{ok:true,submission:{id:x.id,studentName:x.student_name,studentEmail:x.student_email,studentCode:x.student_code,eitCode:x.eit_code,dob:x.dob,testId:x.test_id,testTitle:x.test_title,skill:x.skill,answers:x.answers,highlights:x.highlights,notes:x.notes,total:x.total,score:x.score,elapsedSeconds:x.elapsed_seconds,submittedAt:x.submitted_at,result:{listening:x.listening==null?null:Number(x.listening),reading:x.reading==null?null:Number(x.reading),writing:x.writing==null?null:Number(x.writing),speaking:x.speaking==null?null:Number(x.speaking),translation:x.translation==null?null:Number(x.translation),overall:x.overall==null?null:Number(x.overall),message:x.message||'',feedback:x.feedback&&typeof x.feedback==='object'?x.feedback:{},feedbackPublished:!!x.feedback_published},resultPublished:!!x.published,aiReview:x.ai_review||null}});
  }
  if(url.pathname.startsWith('/api/submissions/') && req.method==='PATCH'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const b=await body(req); const exists=await dbQuery('SELECT user_id FROM submissions WHERE id=$1',[id]); if(!exists.rows.length)return json(res,404,{ok:false,message:'Not found'}); const n=v=>v===null||v===undefined||v===''?null:Number(v);
    await dbQuery(`INSERT INTO results(id,submission_id,user_id,listening,reading,writing,speaking,translation,overall,message,published,feedback,feedback_published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) ON CONFLICT(submission_id) DO UPDATE SET listening=EXCLUDED.listening,reading=EXCLUDED.reading,writing=EXCLUDED.writing,speaking=EXCLUDED.speaking,translation=EXCLUDED.translation,overall=EXCLUDED.overall,message=EXCLUDED.message,published=EXCLUDED.published,feedback=EXCLUDED.feedback,feedback_published=EXCLUDED.feedback_published,updated_at=NOW()`,[crypto.randomUUID(),id,exists.rows[0].user_id,n(b.listening),n(b.reading),n(b.writing),n(b.speaking),n(b.translation),n(b.overall),String(b.message||''),!!b.resultPublished,JSON.stringify(b.feedback&&typeof b.feedback==='object'?b.feedback:{}),!!b.feedbackPublished]);
    return json(res,200,{ok:true});
  }
  if(url.pathname.startsWith('/api/submissions/') && req.method==='DELETE'){
    if(!admin(req))return json(res,401,{ok:false,message:'Unauthorized'}); const id=url.pathname.split('/').pop(); const r=await dbQuery('DELETE FROM submissions WHERE id=$1',[id]); if(!r.rowCount)return json(res,404,{ok:false,message:'Not found'}); return json(res,200,{ok:true});
  }
  return json(res,404,{ok:false,message:'API route not found'});
}

function contentType(file){return {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'audio/webm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.ogg':'audio/ogg'}[path.extname(file).toLowerCase()]||'application/octet-stream'}
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
  const retiredScreens=new Set(['/practice.html','/hsk-exam.html','/exam-speaking.html','/speaking-result.html','/exam-writing.html','/writing-result.html','/exam-listening.html','/exam-reading.html','/hsk-exam.html','/courses.html','/prediction.html','/test-centre.html','/writing.html','/speaking.html','/result.html','/payment.html','/test.html','/pure-test.html','/debug-highlight.html','/test-highlight.html','/test-highlight-full.html','/audio-smoke.html']);
  if(retiredScreens.has(pathname)){res.writeHead(302,{Location:'/index.html','Cache-Control':'no-store'});return res.end();}
  if(pathname==='/') pathname='/index.html';
  let file=path.normalize(path.join(ROOT,pathname));
  if(!file.startsWith(ROOT+path.sep)&&file!==ROOT) return json(res,403,{message:'Forbidden'});
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
