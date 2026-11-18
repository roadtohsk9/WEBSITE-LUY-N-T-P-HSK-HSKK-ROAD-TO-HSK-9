const qs=new URLSearchParams(location.search),$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function user(){try{return JSON.parse(localStorage.getItem('currentUser')||'null')}catch{return null}}
function authHeaders(){const u=user();return u?.token?{Authorization:'Bearer '+u.token}: {}}
function norm(x){return String(x??'').trim().toLowerCase()}
function variants(k){return String(k??'').split(/\s*\|\s*|\s*,\s*/).map(x=>x.trim()).filter(Boolean)}
function eq(a,b){return variants(b).some(v=>norm(a)===norm(v))}
function correct(ans,key,q){
 if(eq(ans,key))return true;
 const k=String(key??'').trim(),m=k.match(/^([A-H])(?:[.)]|\s+)(.+)$/i);
 if(m){if(eq(ans,m[1])||eq(ans,m[2]))return true;const i=m[1].toUpperCase().charCodeAt(0)-65;if(q?.options?.length&&i<q.options.length&&(eq(ans,q.options[i])||eq(ans,String(q.options[i]).replace(/^[A-H][.)]\s*/i,''))))return true}
 if(/^[A-H][.)]$/i.test(k)&&q?.options?.length){const i=k[0].toUpperCase().charCodeAt(0)-65;return i<q.options.length&&eq(ans,q.options[i])}
 return false
}
const BAND=[[39,40,9],[37,38,8.5],[35,36,8],[33,34,7.5],[30,32,7],[27,29,6.5],[23,26,6],[20,22,5.5],[16,19,5],[13,15,4.5],[10,12,4],[7,9,3.5],[5,6,3],[3,4,2.5]];
function band(n){if(n<=0)return 0;if(n<3)return 1;return BAND.find(r=>n>=r[0]&&n<=r[1])?.[2]??null}
function typeInfo(t){const s=String(t||'').toLowerCase();if(s.includes('multiple select'))return'multi';if(s.includes('multiple choice'))return'choice';if(s.includes('true/false')||s.includes('tfng'))return'tfng';if(s.includes('yes/no'))return'ynng';if(s.includes('heading')||s.includes('information')||s.includes('name')||s==='matching')return'matching';if(s.includes('date'))return'dates';if(s.includes('drag')&&s.includes('summary'))return'dragdrop';if(s.includes('summary')||s.includes('completion')||s.includes('table')||s.includes('note')||s.includes('form')||s.includes('sentence'))return'completion';if(s.includes('map')||s.includes('plan')||s.includes('diagram'))return'map';return'short'}
function isHSK4ImportedTest(test){return String(test?.sourceFile||'').startsWith('HSK4_20_DE_SIEU_KHO_PDF_IMPORT_')}
function isHSK4WritingTest(test){return String(test?.skill||'').toLowerCase()==='writing'&&isHSK4ImportedTest(test)}
function questionGroups(test,rows){
 const qs=test.content?.questions||[], source=test.content?.question_groups||[], skill=String(test.skill||'').toLowerCase(), unitKey=skill==='reading'?'passage':'section';
 const units=isHSK4WritingTest(test)?1:(skill==='reading'?Math.max(1,(test.content?.passages||[]).length,...qs.map(q=>Number(q[unitKey]||1))):Math.max(4,...qs.map(q=>Number(q[unitKey]||1))));
 const byUnit=[];
 for(let unit=1;unit<=units;unit++){
   const unitRows=rows.filter(r=>{const q=qs.find(x=>Number(x.number)===Number(r.n));return Number(q?.[unitKey]||1)===unit});
   const subs=source.filter(g=>Number(g.unit||g.passage||g.section||1)===unit).map(g=>{
     const items=unitRows.filter(r=>(!g.start||Number(r.n)>=Number(g.start))&&(!g.end||Number(r.n)<=Number(g.end)));
     return items.length?{title:g.title||`Questions ${items[0].n}–${items.at(-1).n}`,instruction:g.instruction||'',explanation:g.explanation||g.groupExplanation||'',body:g.body||'',type:g.type||'',items}:null
   }).filter(Boolean);
   if(!subs.length)subs.push({title:unitRows.length?`Questions ${unitRows[0].n}–${unitRows.at(-1).n}`:`Questions —`,instruction:'',explanation:'',body:'',type:'',items:unitRows});
   const passageMeta=skill==='reading'?(test.content?.passages||[])[unit-1]:null;
   const unitLabel=skill==='reading'?(passageMeta?.sectionLabel||`PASSAGE ${unit}`):`SECTION ${unit}`;
   const unitTitle=unitRows.length?(subs.length===1?subs[0].title:(passageMeta?.title||`Questions ${unitRows[0].n}–${unitRows.at(-1).n}`)):(passageMeta?.title||'No questions added');
   byUnit.push({index:unit,label:unitLabel,title:unitTitle,items:unitRows,subgroups:subs});
 }
 if(byUnit.length)return byUnit;
 return [{index:1,label:skill==='reading'?'PASSAGE 1':'SECTION 1',title:`Questions ${rows[0]?.n||1}–${rows.at(-1)?.n||1}`,items:rows,subgroups:[{title:`Questions ${rows[0]?.n||1}–${rows.at(-1)?.n||1}`,instruction:'',explanation:'',body:'',type:'',items:rows}]}];
}
function optionIsSelected(a,o,letter){const parts=String(a||'').split(/\s*[,|]\s*/).map(norm).filter(Boolean);return parts.includes(norm(o))||parts.includes(norm(letter))}
function optionIsCorrect(key,o,letter){const k=String(key||'').trim();return norm(k)===norm(o)||norm(k)===norm(letter)||norm(k).startsWith(letter+'.')||norm(k).startsWith(letter+')')}
function renderChoice(q,r){
 const info=typeInfo(q.type),opts=info==='tfng'?['TRUE','FALSE','NOT GIVEN']:info==='ynng'?['YES','NO','NOT GIVEN']:(q.options||[]), key=String(r.key||'');
 if(info==='matching'||info==='dates'){
   const km=key.match(/^([A-H])(?:[.)])?$/i),ki=km?km[1].toUpperCase().charCodeAt(0)-65:-1;
   const correctText=km&&q?.options?.[ki]?`${km[1].toUpperCase()}. ${q.options[ki]}`:key;
   return `<div class="rv-answer-line ${r.ok?'is-good':'is-bad'}"><span class="rv-line-label">Câu trả lời của bạn</span><strong class="${r.ok?'answer-green':'answer-red'}">${esc(r.a||'Chưa trả lời')}</strong>${!r.ok?`<span class="rv-arrow">→</span><span class="rv-line-label">Đáp án đúng</span><strong class="answer-green">${esc(correctText||'—')}</strong>`:''}</div>`
 }
 return `<div class="rv-choice-list">${opts.map((o,i)=>{const letter=String.fromCharCode(65+i),sel=optionIsSelected(r.a,o,letter),right=optionIsCorrect(key,o,letter);let cls='rv-choice';if(right)cls+=' right-option';if(sel&&!right)cls+=' wrong-option';if(sel&&right)cls+=' selected-right';return `<div class="${cls}"><span class="rv-radio ${right?'radio-right':''} ${sel?'radio-selected':''}"></span><span class="rv-option-text ${sel&&!right?'wrong-text':''} ${right?'right-text':''}">${esc(o)}</span>${sel&&!right?'<del class="rv-you">Câu trả lời của bạn</del>':''}${right?'<span class="rv-correct-tag">CORRECT</span>':''}</div>`}).join('')}</div>`
}
function safeRich(x){return String(x||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/\son\w+\s*=\s*(['"]).*?\1/gi,'')}
function renderCompletion(group,rows){
 const src=group.body||rows.map(r=>`${r.before||''} {{${r.n}}} ${r.after||''}`).join('<br>');
 const map=new Map(rows.map(r=>[Number(r.n),r]));
 const replaceBlank=(m,n)=>{
   const r=map.get(Number(n)); if(!r)return '';
   const answer=String(r.a??'').trim(), key=String(r.key??'').trim();
   const ok=!!r.ok, answered=answer!=='';
   return `<span class="rv-blank-result ${ok?'blank-correct':'blank-wrong'}"><small>${n}</small>${answered?`<b class="rv-student-answer">${esc(answer)}</b>`:`<b class="rv-student-answer muted-answer">Chưa trả lời</b>`}${!ok?`<i>→</i><b class="rv-correct-answer">${esc(key||'—')}</b>`:''}</span>`;
 };
 const rendered=safeRich(src).replace(/\{\{(\d+)\}\}|\[\[(\d+)\]\]/g,(m,a,b)=>replaceBlank(m,a||b));
 return `<div class="rv-completion-sheet">${rendered}</div>`;
}
function renderGroupQuestion(test,g,r){
 const q=(test.content?.questions||[]).find(x=>Number(x.number)===Number(r.n))||{},info=typeInfo(q.type);
 const completionLike=info==='completion'||info==='dragdrop'||/\{\{\d+\}\}|\[\[\d+\]\]/.test(String(g.body||q.body||''));
 const body=completionLike?renderCompletion(g,[r]):info==='choice'||info==='multi'||info==='tfng'||info==='ynng'||info==='matching'||info==='dates'||info==='map'?renderChoice(q,r):`<div class="rv-answer-line ${r.ok?'is-good':'is-bad'}"><span class="rv-line-label">Câu trả lời của bạn</span><strong class="${r.ok?'answer-green':'answer-red'} ${!r.ok?'wrong-strike':''}">${esc(r.a||'Chưa trả lời')}</strong>${!r.ok?`<span class="rv-arrow">→</span><span class="rv-line-label">Đáp án đúng</span><strong class="answer-green">${esc(r.key||'—')}</strong>`:''}</div>`;
 const sentenceItems=Array.isArray(q.sentenceItems)&&q.sentenceItems.length?`<div class="hsk4-order-lines" style="display:grid;gap:8px;margin:12px 0">${q.sentenceItems.map(x=>`<div style="display:flex;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fbff;line-height:1.65"><b style="color:#2458aa;min-width:22px">${esc(x.label)}.</b><span>${esc(x.text)}</span></div>`).join('')}</div>`:'';
 return `<article class="answer-question ${r.ok?'question-correct':'question-wrong'}"><div class="answer-question-head"><span>Câu ${esc(r.n)}</span><strong class="${r.ok?'status-good':'status-bad'}">${r.ok?'✓ ĐÚNG':'✕ SAI'}</strong></div><div class="answer-question-prompt">${esc(q.text||'')}</div>${sentenceItems}${body}${(r.key||r.a)?`<button type="button" class="add-answer-word" data-add-personal="${esc(r.key||r.a||'')}">+ Lưu đáp án vào Từ vựng</button>`:''}${!r.ok&&info!=='choice'&&info!=='multi'&&info!=='tfng'&&info!=='ynng'&&info!=='matching'&&info!=='dates'&&info!=='map'?`<div class="wrong-correct-line"><span>Câu trả lời của bạn:</span> <del>${esc(r.a||'Chưa trả lời')}</del> <b>→ ${esc(r.key||'—')}</b></div>`:''}</article>`
}
function renderResult(test,payload){
 const rows=payload.rows||[],groups=payload.groups||[],c=rows.filter(r=>r.ok).length,total=rows.length,answered=rows.filter(r=>String(r.a||'').trim()!=='').length,wrong=Math.max(0,answered-c),skipped=total-answered,pct=total?Math.round(c/total*100):0;
 const skill=String(test.skill||'').toUpperCase(),duration=test.durationMinutes||60,isHsk4Writing=isHSK4WritingTest(test);
 document.body.innerHTML=`<main class="practice-result-page"><div class="pr-shell"><header class="pr-header"><button class="pr-back" id="resultBack">←</button><div><div class="pr-kicker">ROAD TO HSK 9 · ${esc(skill)}</div><h1>Kết quả làm bài</h1><p>${esc(test.title||'Practice Test')} · ${esc(test.seriesLabel||`VOL ${test.volume}`)}</p></div></header><section class="result-hero-v31"><div class="result-main-score"><span class="result-eyebrow">KẾT QUẢ</span><div class="result-score-big">${c}<small>/${total}</small></div><div class="result-score-caption">Bạn đã trả lời ${answered} / ${total} câu.</div></div><div class="result-band-circle"><span>${pct}%</span><small>ĐỘ CHÍNH XÁC</small></div></section><section class="result-stat-grid"><div><span>Đúng</span><b class="green-stat">${c}</b><small>câu</small></div><div><span>Sai</span><b class="red-stat">${wrong}</b><small>câu</small></div><div><span>Bỏ trống</span><b>${skipped}</b><small>câu</small></div><div><span>Chính xác</span><b>${pct}%</b><small>trên tổng số câu</small></div></section><section class="result-message"><div class="result-message-icon">✓</div><div><b>${pct>=85?'Làm rất tốt!':pct>=60?'Bạn đang tiến bộ — hãy tiếp tục.':'Hãy xem lại đáp án và thử sức lần nữa.'}</b><p>Bạn trả lời đúng <strong>${c}/${total}</strong> câu (${pct}%). Xem phần giải thích để biết nội dung cần củng cố.</p></div></section><section class="result-review-cta"><div><div class="pr-kicker">ÔN TẬP SAU BÀI THI</div><h2>Đáp án và giải thích chi tiết</h2><p>Chọn ${skill==='READING'?'bài đọc':isHsk4Writing?'phần Viết':'phần nghe'} để đối chiếu câu trả lời, sau đó mở giải thích khi cần.</p></div><div class="result-action-grid"><button class="pr-primary result-big-btn" id="viewAnswers">Xem đáp án <span>→</span></button><button class="pr-secondary result-big-btn" id="viewExplain">Xem giải thích chi tiết <span>→</span></button></div></section></div></main>`;
 $('#resultBack').onclick=()=>location.href=`practice.html?skill=${encodeURIComponent(test.skill)}&volume=${encodeURIComponent(test.volume)}`;
 $('#viewAnswers').onclick=()=>renderAnswerPage(test,payload);$('#viewExplain').onclick=()=>renderExplanationPage(test,payload);
}
function groupCard(g,active){const correctCount=g.items.filter(x=>x.ok).length;return `<button class="review-unit-card ${active?'active':''}" data-g="${g.index}"><span class="unit-number">${String(g.index).padStart(2,'0')}</span><span class="unit-card-copy"><b>${g.label}</b><small>${esc(g.title||'Questions')}</small></span><span class="unit-score"><strong>${correctCount}/${g.items.length}</strong><small>đúng</small></span><span class="unit-chevron">→</span></button>`}
function personalPanel(test){
 const meta={testId:test.id,testTitle:test.title||'Practice Test',skill:test.skill||'',volume:test.volume||'',testNo:test.testNo||''};
 return `<section class="inline-personal-card" id="reviewPersonalPanel"><div class="personal-toolbar"><div><h4>✦ Từ điển & Cá nhân hóa</h4><p>Tra từ ngay trong phần review và lưu vào kho học tập cá nhân.</p></div><a class="personal-back" href="personalization.html">Mở kho cá nhân</a></div><div class="vocab-mini-row"><input id="reviewWordInput" placeholder="Nhập chữ Hán, pinyin hoặc từ cần tra…"><div class="dict-btns"><button id="reviewWordSearch">Xem nghĩa</button><button id="reviewHanziiBtn" type="button">Hanzii</button><button id="reviewGoogleBtn" type="button">Google</button></div></div><div id="reviewDictResult" class="dict-result hidden"></div><div class="external-links"><a id="reviewGoogle" target="_blank" rel="noopener">Google Translate</a><a id="reviewHanzii" target="_blank" rel="noopener">Từ điển Hanzii</a></div></section>`;
}
function bindPersonalPanel(test){
 const panel=document.getElementById('reviewPersonalPanel');if(!panel||!window.EITPersonal)return;
 const meta={testId:test.id,testTitle:test.title||'Practice Test',skill:test.skill||'',volume:test.volume||'',testNo:test.testNo||''};
 const openHanzii=()=>{const w=panel.querySelector('#reviewWordInput')?.value.trim();window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer');if(w&&navigator.clipboard?.writeText)navigator.clipboard.writeText(w).catch(()=>{});}; const openGoogle=()=>{const w=panel.querySelector('#reviewWordInput')?.value.trim();if(w)window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')}; panel.querySelector('#reviewHanziiBtn').onclick=openHanzii; panel.querySelector('#reviewGoogleBtn').onclick=openGoogle; const search=async()=>{const w=panel.querySelector('#reviewWordInput')?.value.trim();if(!w)return;const out=panel.querySelector('#reviewDictResult');out.classList.remove('hidden');out.innerHTML='<div class="loading">Đang tra từ…</div>';try{const d=await EITPersonal.dictionary(w);out.innerHTML=`<div class="dict-title"><b>${EITPersonal.esc(d.word)}</b><span class="dict-meta">${EITPersonal.esc(d.phonetic)}</span></div>${d.meanings.map(m=>`<div class="dict-def"><b>${EITPersonal.esc(m.partOfSpeech)}</b>${m.defs.map(x=>`<div>${EITPersonal.esc(x.definition)}${x.example?`<br><em>${EITPersonal.esc(x.example)}</em>`:''}</div>`).join('')}</div>`).join('')}<button class="btn-red save-dict" id="saveReviewWord">+ Lưu vào Từ vựng</button>`;panel.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>new Audio(b.dataset.audio).play());panel.querySelector('#saveReviewWord').onclick=()=>{EITPersonal.add('vocabulary',{word:d.word,meaning:d.meanings?.[0]?.defs?.[0]?.definition||'',example:d.meanings?.[0]?.defs?.[0]?.example||'',...meta,source:'Answer Review Dictionary'});panel.querySelector('#saveReviewWord').textContent='✓ Đã lưu'};panel.querySelector('#reviewGoogle').href=EITPersonal.translateUrl(d.word);panel.querySelector('#reviewHanzii').href=EITPersonal.hanziiUrl(d.word)}catch(e){const w=panel.querySelector('#reviewWordInput')?.value.trim()||'';out.innerHTML=`<div class="dict-fallback"><b>Tra nhanh trong hệ thống không khả dụng.</b><p>Bạn vẫn có thể tra bằng Hanzii hoặc Google Translate.</p><div class="fallback-actions"><button class="btn-red" type="button" id="fallbackHanziiReview">Từ điển Hanzii</button><button class="btn-outline" type="button" id="fallbackGoogleReview">Google Translate</button></div></div>`; out.querySelector('#fallbackHanziiReview').onclick=()=>window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer'); out.querySelector('#fallbackGoogleReview').onclick=()=>window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')}};
 panel.querySelector('#reviewWordSearch').onclick=search;panel.querySelector('#reviewWordInput').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
 panel.closest('.pr-shell')?.addEventListener('click',e=>{const b=e.target.closest('[data-add-personal]');if(!b)return;const word=String(b.dataset.addPersonal||'').trim();if(!word)return;EITPersonal.add('vocabulary',{word,...meta,source:'Answer Review Quick Save'});b.textContent='✓ Đã lưu';b.disabled=true});
}
function setupReviewLearningRail(test){
 if(document.getElementById('eitSideRail'))return;
 if(!window.EITPersonal)return;
 const meta={testId:test.id,testTitle:test.title||'Practice Test',skill:test.skill||'',volume:test.volume||'',testNo:test.testNo||''};
 const rail=document.createElement('aside');rail.id='eitSideRail';rail.className='eit-side-rail';rail.setAttribute('aria-label','Công cụ học tập');
 const tools=[['overview','⌘','Tổng quan'],['dictionary','Aa','Từ điển'],['vocabulary','V','Từ vựng'],['collocations','C','Collocations'],['synonyms','S','Synonyms'],['antonyms','A','Antonyms'],['structures','ƒ','Cấu trúc'],['vocab-pdf','PDF','Từ vựng PDF']];
 rail.innerHTML=tools.map(([id,icon,title])=>`<button type="button" class="rail-btn ${id==='overview'?'active':''}" data-tool="${id}" title="${title}" aria-label="${title}">${icon}</button>`).join('');document.body.appendChild(rail);
 const drawer=document.createElement('aside');drawer.id='eitToolDrawer';drawer.className='eit-tool-drawer';drawer.setAttribute('aria-hidden','true');drawer.innerHTML=`<div class="eit-tool-head"><div><span class="tool-kicker">HSK LEARNING TOOLS</span><h3 id="eitToolTitle">Học tập cá nhân</h3></div><button type="button" id="eitToolClose" class="drawer-close" aria-label="Đóng">×</button></div><div id="eitToolBody" class="eit-tool-body"></div>`;document.body.appendChild(drawer);
 const overlay=document.createElement('div');overlay.id='eitToolOverlay';overlay.className='eit-tool-overlay';document.body.appendChild(overlay);
 const state=()=>{try{return EITPersonal.read()||{history:[],vocabulary:[],collocations:[],synonyms:[],antonyms:[],structures:[]}}catch{return {history:[],vocabulary:[],collocations:[],synonyms:[],antonyms:[],structures:[]}}};
 const esc2=window.EITPersonal.esc;
 const names={vocabulary:'Từ vựng',collocations:'Collocations',synonyms:'Synonyms',antonyms:'Antonyms',structures:'Cấu trúc'};
 const itemHtml=x=>`<article class="rail-item"><div><b>${esc2(x.word||x.term||'')}</b>${x.meaning?`<p>${esc2(x.meaning)}</p>`:''}${x.example?`<small>${esc2(x.example)}</small>`:''}</div></article>`;
 const close=()=>{drawer.classList.remove('open');overlay.classList.remove('open');drawer.setAttribute('aria-hidden','true');rail.querySelectorAll('.rail-btn').forEach(b=>b.classList.remove('active'));};
 const saveQuick=(type,input,meaning)=>{const v=String(input.value||'').trim();if(!v){input.focus();return}EITPersonal.add(type,{word:v,meaning:String(meaning||'').trim(),...meta,source:'Review Quick Note'});input.value='';open(type);};
 const open=tool=>{
   const body=drawer.querySelector('#eitToolBody'),title=drawer.querySelector('#eitToolTitle');const d=state();
   const labels={overview:'Học nhanh',dictionary:'Từ điển',vocabulary:'Từ vựng đã lưu',collocations:'Collocations',synonyms:'Synonyms',antonyms:'Antonyms',structures:'Cấu trúc hay','vocab-pdf':'Tài liệu từ vựng PDF'};title.textContent=labels[tool]||'Công cụ';
   if(tool==='overview'){
     body.innerHTML=`<div class="rail-overview"><div class="rail-stat"><strong>${d.vocabulary?.length||0}</strong><span>Từ vựng</span></div><div class="rail-stat"><strong>${d.collocations?.length||0}</strong><span>Collocations</span></div><div class="rail-stat"><strong>${d.structures?.length||0}</strong><span>Cấu trúc</span></div><div class="rail-context"><b>${esc2(test.title||'Practice Test')}</b><span>${String(test.skill||'').toUpperCase()} · ${esc2(String(test.volume||''))} · Test ${esc2(String(test.testNo||''))}</span></div><a class="rail-main-link" href="personalization.html">Mở Cá nhân hóa →</a></div>`;
   }else if(tool==='dictionary'){
     body.innerHTML=`<div class="rail-dict"><div class="rail-dict-row"><input id="railDictInput" placeholder="Nhập từ / cụm từ..." autocomplete="off"><button type="button" class="btn-red" id="railDictSearch">Tra</button></div><div id="railDictResult" class="dict-result"></div><div class="rail-external"><button type="button" id="railCam">Hanzii ↗</button><button type="button" id="railGoogle">Google ↗</button></div></div>`;
     const search=async()=>{const input=body.querySelector('#railDictInput'),w=input.value.trim(),out=body.querySelector('#railDictResult');if(!w)return;out.innerHTML='<div class="loading">Đang tra từ…</div>';try{const d=await EITPersonal.dictionary(w);out.innerHTML=EITPersonal.dictionaryHTML(d)+`<button type="button" class="btn-red rail-save-word" id="railSaveWord">+ Lưu vào Từ vựng</button>`;out.querySelector('#railSaveWord').onclick=()=>{EITPersonal.add('vocabulary',{word:d.word,meaning:d.meanings?.[0]?.defs?.[0]?.definition||'',example:d.meanings?.[0]?.defs?.[0]?.example||'',...meta,source:'Review Dictionary'});out.querySelector('#railSaveWord').textContent='✓ Đã lưu'};out.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>new Audio(b.dataset.audio).play())}catch(e){out.innerHTML=`<div class="dict-fallback"><b>Không tra được nhanh.</b><p>Hãy kiểm tra mạng hoặc mở Hanzii/Google bên dưới.</p></div>`}};
     body.querySelector('#railDictSearch').onclick=search;body.querySelector('#railDictInput').addEventListener('keydown',e=>{if(e.key==='Enter')search()});body.querySelector('#railCam').onclick=()=>{const w=body.querySelector('#railDictInput').value.trim();if(w){window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(w).catch(()=>{})}};body.querySelector('#railGoogle').onclick=()=>{const w=body.querySelector('#railDictInput').value.trim();if(w)window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')};
   }else if(tool==='vocab-pdf'){
     const url=String(test.content?.vocabPdfUrl||'').trim();body.innerHTML=url?`<div class="pdf-tool-card"><div class="pdf-icon">PDF</div><h4>Tài liệu từ vựng</h4><p>PDF được Admin gắn riêng cho đề này.</p><a class="btn-red rail-pdf-link" target="_blank" rel="noopener" href="${esc2(url)}">Mở PDF ↗</a></div>`:`<div class="empty-tool"><b>Chưa có PDF từ vựng.</b><p>Admin chưa gắn tài liệu cho bài này.</p></div>`;
   }else{
     const arr=Array.isArray(d[tool])?d[tool].filter(x=>!x.testId||x.testId===String(test.id)):[];
     body.innerHTML=`<div class="rail-quick-note"><input id="railQuickInput" placeholder="Ghi nhanh ${labels[tool]||'nội dung'}..." autocomplete="off"><button type="button" class="btn-red" id="railQuickSave">+ Lưu</button></div>${arr.length?`<div class="rail-list">${arr.map(itemHtml).join('')}</div>`:`<div class="empty-tool"><b>Chưa có ${labels[tool]||'dữ liệu'}.</b><p>Ghi nhanh nội dung ngay phía trên để lưu vào Cá nhân hóa.</p></div>`}<a class="rail-main-link" href="personalization.html">Xem toàn bộ trong Cá nhân hóa →</a>`;
     body.querySelector('#railQuickSave').onclick=()=>saveQuick(tool,body.querySelector('#railQuickInput'));body.querySelector('#railQuickInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveQuick(tool,e.currentTarget)});
   }
   drawer.classList.add('open');overlay.classList.add('open');drawer.setAttribute('aria-hidden','false');rail.querySelectorAll('.rail-btn').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
 };
 rail.querySelectorAll('.rail-btn').forEach(b=>b.onclick=()=>{if(drawer.classList.contains('open')&&b.classList.contains('active'))close();else open(b.dataset.tool)});drawer.querySelector('#eitToolClose').onclick=close;overlay.onclick=close;
}

function renderAnswerPage(test,payload){
 const groups=payload.groups||[],qs=test.content?.questions||[];let active=0;
 const shell=document.createElement('main');shell.className='practice-result-page';shell.innerHTML=`<div class="pr-shell"><header class="pr-header"><button class="pr-back" id="ansBack">←</button><div><div class="pr-kicker">${esc(String(test.skill||'').toUpperCase())} · ĐÁP ÁN</div><h1>Đối chiếu đáp án</h1><p>${esc(test.title||'Đề thi HSK')}</p></div></header><section class="review-unit-grid">${groups.map((g,i)=>groupCard(g,i===0)).join('')}</section><section id="answerReviewBody"></section>${personalPanel(test)}<div class="pr-footer-actions"><button class="pr-secondary" id="backResult">← Kết quả</button><button class="pr-primary" id="toExplain">Xem giải thích chi tiết →</button></div></div>`;
 document.body.innerHTML='';document.body.appendChild(shell);
 setupReviewLearningRail(test);
 const render=()=>{const g=groups[active];shell.querySelectorAll('[data-g]').forEach(b=>b.classList.toggle('active',Number(b.dataset.g)===g.index));
   const subHtml=g.subgroups.map(sg=>{const info=typeInfo(sg.type||((qs.find(q=>Number(q.number)===Number(sg.items[0]?.n))||{}).type));const items=sg.items;const completionLike=info==='completion'||info==='dragdrop'||/\{\{\d+\}\}|\[\[\d+\]\]/.test(String(sg.body||''));const body=completionLike?renderCompletion(sg,items):items.map(r=>renderGroupQuestion(test,g,r)).join('');return `<section class="review-subgroup"><div class="review-subgroup-head"><div><h3>${esc(sg.title)}</h3></div><strong>${items.filter(x=>x.ok).length}/${items.length}</strong></div>${sg.instruction?`<div class="review-instruction">${esc(sg.instruction)}</div>`:''}<div class="answer-question-list">${body}</div></section>`}).join('');
   $('#answerReviewBody').innerHTML=`<div class="review-section-title review-section-title-clean"><div><span>${g.label}</span><h2>Đối chiếu đáp án</h2></div><strong>${g.items.filter(x=>x.ok).length}/${g.items.length} đúng</strong></div>${subHtml}`;
 };
 shell.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{active=Math.max(0,groups.findIndex(g=>g.index===Number(b.dataset.g)));render();window.scrollTo({top:0,behavior:'smooth'})});
 $('#ansBack').onclick=()=>renderResult(test,payload);$('#backResult').onclick=()=>renderResult(test,payload);$('#toExplain').onclick=()=>renderExplanationPage(test,payload);render();bindPersonalPanel(test);
}
function renderExplanationPage(test,payload){
 const groups=payload.groups||[],qs=test.content?.questions||[];let active=0;
 const skill=String(test.skill||'').toLowerCase(), isReading=skill==='reading', isHsk4Writing=isHSK4WritingTest(test);
 const shell=document.createElement('main');shell.className='practice-result-page explanation-wide-page';
 shell.innerHTML=`<div class="pr-shell"><header class="pr-header"><button class="pr-back" id="exBack">←</button><div><div class="pr-kicker">${esc(String(test.skill||'').toUpperCase())} · GIẢI THÍCH</div><h1>Giải thích chi tiết</h1><p>${isReading?'Đọc lại bài và đối chiếu với đáp án ở hai khung.':isHsk4Writing?'Đối chiếu nhóm từ gợi ý, câu bạn đã sắp xếp và lời giải mẫu.':'Nghe lại nội dung và đối chiếu transcript với đáp án ở hai khung.'}</p></div></header><section class="review-unit-grid">${groups.map((g,i)=>groupCard(g,i===0)).join('')}</section><section id="explainBody"></section>${personalPanel(test)}<div class="pr-footer-actions"><button class="pr-primary" id="exBackBottom">← Xem đáp án</button></div></div>`;
 document.body.innerHTML='';document.body.appendChild(shell);
 setupReviewLearningRail(test);
 const sourceForUnit=(g)=>{
   if(isReading){
     const ps=test.content?.passages||[];const raw=ps[Math.max(0,(Number(g.index)||1)-1)]||'';
     if(typeof raw==='object') return String(raw.body||raw.text||raw.content||'');
     return String(raw||'');
   }
   if(isHsk4Writing){
     const items=(test.content?.questions||[]).map(q=>`<article class="hsk4-review-bank-item" style="padding:12px 0;border-bottom:1px solid #e2e8f0"><b style="display:block;margin-bottom:8px">Câu ${esc(q.number)}</b><div style="display:flex;flex-wrap:wrap;gap:6px">${(q.wordBank||[]).map(w=>`<span class="hsk4-word-chip" style="display:inline-flex;padding:6px 9px;border:1px solid #d7e3f4;border-radius:8px;background:#f3f7ff;color:#193d78">${esc(w)}</span>`).join('')}</div></article>`).join('');
     return `<div class="hsk4-review-word-banks">${items}</div>`;
   }
   return String(test.content?.transcript||'');
 };
 const formatSource=(raw)=>{
   const safe=safeRich(raw);
   if(!safe.trim()) return `<div class="transcript-empty">${isReading?'Admin chưa thêm nội dung Passage cho bài này.':'Admin chưa thêm <b>Listening Transcript</b> cho bài này. Bạn có thể nhập transcript trong Admin → Test Builder → Listening Transcript.'}</div>`;
   if(/<\/?[a-z][^>]*>/i.test(safe)) return safe;
   return safe.split(/\n{2,}|\n/).map(x=>`<p>${esc(x.trim())}</p>`).join('');
 };
 const render=()=>{
   const g=groups[active];if(!g)return;
   shell.querySelectorAll('[data-g]').forEach(b=>b.classList.toggle('active',Number(b.dataset.g)===g.index));
   const groupSource=formatSource(sourceForUnit(g));
   const subHtml=g.subgroups.map(sg=>{
     const groupExp=sg.explanation||'';
     const qhtml=sg.items.map(r=>{
       const q=qs.find(x=>Number(x.number)===Number(r.n))||{},info=typeInfo(q.type);
       let mini;
       if(info==='choice'||info==='multi'||info==='tfng'||info==='ynng'||info==='matching'||info==='dates'||info==='map') mini=renderChoice(q,r);
       else if(info==='completion'||info==='dragdrop'||/\{\{\d+\}\}|\[\[\d+\]\]/.test(String(sg.body||q.body||''))) mini=`<div class="rv-answer-line ${r.ok?'is-good':'is-bad'}"><span class="rv-line-label">Answer</span>${r.ok?`<strong class="answer-green">${esc(r.key||'—')}</strong>`:`<del class="answer-red">${esc(r.a||'Chưa trả lời')}</del><span class="rv-arrow">→</span><strong class="answer-green">${esc(r.key||'—')}</strong>`}</div>`;
       else mini=`<div class="rv-answer-line ${r.ok?'is-good':'is-bad'}"><span class="rv-line-label">Đáp án đúng</span><strong class="answer-green">${esc(r.key||'—')}</strong></div>`;
       return `<article class="explanation-question"><div class="ex-question-head"><div><span>QUESTION ${esc(r.n)}</span><h3>${esc(q.text||'')}</h3></div><strong class="${r.ok?'status-good':'status-bad'}">${r.ok?'✓':'✕'}</strong></div><div class="ex-answer-preview">${mini}</div>${(r.key||r.a)?`<button type="button" class="add-answer-word" data-add-personal="${esc(r.key||r.a||'')}">+ Lưu đáp án / từ này</button>`:''}<button class="ex-toggle-v31" data-exp="${esc(r.n)}" aria-expanded="false">GIẢI THÍCH <span>+</span></button><div class="explanation-hidden hidden" id="exp-${esc(r.n)}">${r.exp?esc(r.exp):'Admin chưa thêm explanation cho câu này.'}</div></article>`;
     }).join('');
     return `<section class="explanation-subgroup"><div class="review-subgroup-head"><div><h3>${esc(sg.title)}</h3></div><strong>${sg.items.filter(x=>x.ok).length}/${sg.items.length}</strong></div>${sg.instruction?`<div class="review-instruction">${esc(sg.instruction)}</div>`:''}${groupExp?`<section class="group-explanation-v31"><div class="explanation-label">GIẢI THÍCH · ${esc(sg.title)}</div><p>${esc(groupExp)}</p></section>`:''}<div class="explanation-question-list">${qhtml}</div></section>`;
   }).join('');
   const sourceMeta=isReading?(test.content?.passages||[])[g.index-1]:null;
   const sourceTitle=isReading?(sourceMeta?.title||g.label):(isHsk4Writing?'TỪ/CỤM TỪ GỢI Ý':'LISTENING TRANSCRIPT');
   const sourceLabel=isReading?esc(g.label):(isHsk4Writing?'WORD BANK':'TRANSCRIPT');
   $('#explainBody').innerHTML=`<div class="review-exam-layout"><section class="review-source-pane"><div class="review-source-head"><span>${sourceLabel}</span><h2>${esc(sourceTitle)}</h2></div><div class="review-source-body">${groupSource}</div></section><section class="review-question-pane"><div class="review-question-head"><span>${g.label}</span><h2>${esc(g.title)}</h2></div><div class="review-question-body"><div class="review-section-title"><div><span>${g.label}</span><h2>Answers & explanations</h2></div><strong>${g.items.filter(x=>x.ok).length}/${g.items.length} đúng</strong></div>${subHtml}</div></section></div>`;
 };
 shell.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{active=Math.max(0,groups.findIndex(g=>g.index===Number(b.dataset.g)));render();window.scrollTo({top:0,behavior:'smooth'})});
 shell.addEventListener('click',e=>{const b=e.target.closest('.ex-toggle-v31');if(!b)return;const box=document.getElementById('exp-'+b.dataset.exp);if(!box)return;const open=box.classList.toggle('hidden')===false;b.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open));b.querySelector('span').textContent=open?'−':'+'});
 $('#exBack').onclick=()=>renderAnswerPage(test,payload);$('#exBackBottom').onclick=()=>renderAnswerPage(test,payload);render();bindPersonalPanel(test);
}
async function boot(){
 const u=user();if(!u?.token){location.href='login.html';return}
 const raw=sessionStorage.getItem('eitPracticeResult');if(!raw){location.href='practice.html';return}
 let p;try{p=JSON.parse(raw)}catch{location.href='practice.html';return}
 try{const r=await fetch('/api/practice/'+encodeURIComponent(p.testId),{headers:authHeaders(),cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'Unable to load result');p.groups=questionGroups(d.test,p.rows||[]);renderResult(d.test,p)}catch(e){document.body.innerHTML=`<main class="practice-result-page"><div class="pr-shell"><div class="result-error"><h1>Unable to load result</h1><p>${esc(e.message)}</p><button class="pr-primary" onclick="history.back()">Go back</button></div></div></main>`}}
boot();
