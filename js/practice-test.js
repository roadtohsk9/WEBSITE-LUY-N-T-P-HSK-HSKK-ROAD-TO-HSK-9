const qs=new URLSearchParams(location.search),testId=qs.get('id');const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let TEST=null,timer=null,seconds=0,answers={},summaryAnswers={},writingAnswers={},recordings=[],recorder=null,recChunks=[],activeTask=1,activePart=1,activeListeningSection=1,activeReadingPassage=1;
const BAND=[[39,40,9],[37,38,8.5],[35,36,8],[33,34,7.5],[30,32,7],[27,29,6.5],[23,26,6],[20,22,5.5],[16,19,5],[13,15,4.5],[10,12,4],[7,9,3.5],[5,6,3],[3,4,2.5]];
function showAIGradingLoader(skill){if(document.getElementById('eitAIGradingLoader'))return;const el=document.createElement('div');el.id='eitAIGradingLoader';el.className='eit-ai-loading';el.innerHTML=`<div class="eit-ai-loading-card" role="status" aria-live="polite"><div class="eit-ai-spinner"></div><h2>AI đang chấm ${skill}</h2><p>Hệ thống đang xử lý bài làm và chuẩn bị phản hồi. Vui lòng không đóng trang hoặc gửi lại bài.</p><div class="ai-load-dots"><span>●</span><span>●</span><span>●</span></div></div>`;document.body.appendChild(el)}function hideAIGradingLoader(){document.getElementById('eitAIGradingLoader')?.remove()}
function band(n){const x=BAND.find(r=>n>=r[0]&&n<=r[1]);return x?.[2]??null}function norm(x){return String(x??'').trim().toLowerCase()}function variants(k){return String(k??'').split(/\s*\|\s*|\s*,\s*/).map(x=>x.trim()).filter(Boolean)}
function eq(a,b){return variants(b).some(v=>norm(a)===norm(v))}
function correct(ans,key,q){if(eq(ans,key))return true;const k=String(key??'').trim();const m=k.match(/^([A-H])(?:[.)]|\s+)\s*(.+)$/i);if(m){if(eq(ans,m[1])||eq(ans,m[2]))return true;const i=m[1].toUpperCase().charCodeAt(0)-65;if(q?.options?.length&&i<q.options.length&&(eq(ans,q.options[i])||eq(ans,String(q.options[i]).replace(/^[A-H][.)]\s*/i,''))))return true}if(/^[A-H][.)]$/i.test(k)&&q?.options?.length){const i=k[0].toUpperCase().charCodeAt(0)-65;return i<q.options.length&&eq(ans,q.options[i])}if(/^[A-H]$/i.test(k)&&q?.options?.length){const i=k.toUpperCase().charCodeAt(0)-65;return i<q.options.length&&eq(ans,q.options[i])}return false}
function startTimer(sec){
 clearInterval(timer);
 const duration=Math.max(1,Number(sec)||1), key='eitTimerDeadline:'+TEST.id;
 let deadline=Number(localStorage.getItem(key));
 if(!Number.isFinite(deadline)||deadline<=Date.now()){deadline=Date.now()+duration*1000;localStorage.setItem(key,String(deadline));}
 const update=()=>{seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));tick();if(seconds<=0){clearInterval(timer);localStorage.removeItem(key);submit(true)}};
 update();timer=setInterval(update,250);
 window.__eitTimerKey=key;window.__eitTimerDeadline=deadline;
}
function tick(){const e=$('#examTimer');if(e)e.textContent=String(Math.floor(Math.max(0,seconds)/60)).padStart(2,'0')+':'+String(Math.max(0,seconds)%60).padStart(2,'0')}
function clearTestTimer(){clearInterval(timer);if(window.__eitTimerKey)localStorage.removeItem(window.__eitTimerKey)}
async function load(){if(!testId||!user()?.token)return lock();const r=await fetch('/api/practice/'+encodeURIComponent(testId),{headers:authHeaders()});const d=await r.json();if(!r.ok||!d.ok)return lock(d.message||'Không tìm thấy bài luyện.');TEST=d.test;loadPracticeDraft();loadPracticeSummary();render()}
function lock(msg='Bạn cần đăng nhập tài khoản EIT để mở bài luyện này.'){document.body.innerHTML=`<main class="lock-screen"><div class="lock-card"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><h1>Bài luyện đã khóa</h1><p>${esc(msg)}<br>Đăng nhập để mở đề, làm bài và lưu kết quả.</p><a class="go-login" href="login.html">ĐĂNG NHẬP TÀI KHOẢN</a></div></main>`}
function personalMeta(){return {testId:TEST.id,testTitle:TEST.title||`${TEST.skill||''} Practice`,skill:TEST.skill||'',volume:TEST.volume||'',testNo:TEST.testNo||'',completedAt:new Date().toISOString()};}
function practiceDraftKey(){return 'eitPracticeDraft:'+TEST.id;}
function practiceSummaryKey(){return 'eitPracticeSummaryAnswers:'+TEST.id;}
function loadPracticeDraft(){
  try{
    const raw=localStorage.getItem(practiceDraftKey()) || sessionStorage.getItem(practiceDraftKey());
    if(raw){
      const d=JSON.parse(raw);
      if(d && typeof d==='object') answers={...d};
    }
  }catch(e){console.warn('practice draft restore failed',e)}
}
function loadPracticeSummary(){
  try{
    const raw=localStorage.getItem(practiceSummaryKey()) || sessionStorage.getItem(practiceSummaryKey());
    if(raw){const d=JSON.parse(raw);if(d && typeof d==='object') summaryAnswers={...d};}
  }catch(e){console.warn('practice summary restore failed',e)}
}
function persistPracticeSummary(){
  const raw=JSON.stringify(summaryAnswers);
  try{localStorage.setItem(practiceSummaryKey(),raw)}catch(e){}
  try{sessionStorage.setItem(practiceSummaryKey(),raw)}catch(e){}
}
function getAnswer(n){const k=String(n);return Object.prototype.hasOwnProperty.call(summaryAnswers,k)?summaryAnswers[k]:(answers[k]??answers[n]??'');}
function isAnswered(n){return String(getAnswer(n)??'').trim()!=='';}
function mergeSummaryAnswers(){Object.keys(summaryAnswers).forEach(k=>{answers[k]=summaryAnswers[k]});}
function captureSummaryFromDOM(selector){
  const root=document.querySelector(selector); if(!root)return;
  root.querySelectorAll('input[data-summary-q],textarea[data-summary-q],select[data-summary-q]').forEach(e=>{
    const n=String(e.dataset.summaryQ||'').trim(); if(!n)return;
    if(e.type==='checkbox'){
      const arr=[...root.querySelectorAll(`[data-summary-q="${CSS.escape(n)}"]`)].filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value).filter(Boolean);
      summaryAnswers[n]=arr.join(', ');
    }else if(e.type==='radio'){
      if(e.checked)summaryAnswers[n]=e.value;
    }else{
      summaryAnswers[n]=String(e.value??'');
    }
  });
  persistPracticeSummary();
}
function bindSummaryInputs(selector){
  const root=document.querySelector(selector); if(!root)return;
  root.querySelectorAll('input[data-summary-q],textarea[data-summary-q],select[data-summary-q]').forEach(e=>{
    const handler=()=>{
      const n=String(e.dataset.summaryQ||'').trim(); if(!n)return;
      if(e.type==='checkbox'){
        summaryAnswers[n]=[...root.querySelectorAll(`[data-summary-q="${CSS.escape(n)}"]`)].filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value).filter(Boolean).join(', ');
      }else if(e.type==='radio'){
        if(e.checked)summaryAnswers[n]=e.value;
      }else{
        summaryAnswers[n]=String(e.value??'');
      }
      answers[n]=summaryAnswers[n];
      persistPracticeSummary();
      persistAnswerSnapshot();
      syncNav();
    };
    e.addEventListener('input',handler);e.addEventListener('change',handler);
  });
}
function persistPracticeDraft(){
  const raw=JSON.stringify(answers);
  try{localStorage.setItem(practiceDraftKey(),raw)}catch(e){}
  try{sessionStorage.setItem(practiceDraftKey(),raw)}catch(e){}
}
function persistAnswerSnapshot(){persistPracticeDraft();}
function commitCurrentAnswers(selector){
  try{collectAnswersFromDOM(selector);persistPracticeDraft();syncNav()}catch(e){console.warn('answer snapshot failed',e)}
}
function rememberPracticeHistory(score,total){try{window.EITPersonal?.saveHistory({...personalMeta(),score,total,band:total===40?band(score):null})}catch(e){console.warn('personalization history save failed',e)}}
function openPersonalDictionary(){const old=document.getElementById('personalDictDrawer');if(old){old.remove();document.getElementById('personalDictBackdrop')?.remove();return;}if(!window.EITPersonal){location.href='personalization.html';return;}
 const back=document.createElement('div');back.id='personalDictBackdrop';back.className='drawer-backdrop';document.body.appendChild(back);
 const box=document.createElement('aside');box.id='personalDictDrawer';box.className='dict-drawer';box.innerHTML=`<div class="drawer-head"><div><h3>Từ điển & Cá nhân hóa</h3><div class="drawer-message">Tra nhanh từ vựng trong lúc làm bài. Từ đã lưu sẽ xuất hiện ở trang Cá nhân hóa.</div></div><button class="drawer-close" id="closePersonalDict">×</button></div><div class="vocab-search"><input id="drawerWord" placeholder="Nhập từ / cụm từ tiếng Anh…" autocomplete="off"><div class="dict-btns"><button class="btn-red" id="drawerSearch">Xem nghĩa</button><button class="btn-outline" id="drawerHanziiBtn" type="button">Hanzii</button><button class="btn-outline" id="drawerGoogleBtn" type="button">Google</button></div></div><div id="drawerResult" class="dict-result hidden"></div><div class="external-links"><a id="drawerGoogle" target="_blank" rel="noopener">Google Translate</a><a id="drawerHanzii" target="_blank" rel="noopener">Từ điển Hanzii</a></div><div class="context-note">Bạn có thể lưu từ, collocation, synonym hoặc antonym để ôn lại sau khi hoàn thành bài.</div>`;document.body.appendChild(box);
 const close=()=>{box.remove();back.remove()};back.onclick=close;box.querySelector('#closePersonalDict').onclick=close; const openHanzii=()=>{const w=box.querySelector('#drawerWord').value.trim();window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer');if(w&&navigator.clipboard?.writeText)navigator.clipboard.writeText(w).catch(()=>{});}; const openGoogle=()=>{const w=box.querySelector('#drawerWord').value.trim();if(w)window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')}; box.querySelector('#drawerHanziiBtn').onclick=openHanzii; box.querySelector('#drawerGoogleBtn').onclick=openGoogle;
 const search=async()=>{const w=box.querySelector('#drawerWord').value.trim(), out=box.querySelector('#drawerResult');if(!w)return;out.classList.remove('hidden');out.innerHTML='<div class="loading">Đang tra từ…</div>';try{const d=await EITPersonal.dictionary(w);out.innerHTML=`<div class="dict-title"><b>${EITPersonal.esc(d.word)}</b><span class="dict-meta">${EITPersonal.esc(d.phonetic)}</span></div>${d.meanings.map(m=>`<div class="dict-def"><b>${EITPersonal.esc(m.partOfSpeech)}</b>${m.defs.map(x=>`<div>${EITPersonal.esc(x.definition)}${x.example?`<br><em>${EITPersonal.esc(x.example)}</em>`:''}</div>`).join('')}</div>`).join('')}<button class="btn-red save-dict" id="saveDrawerWord">+ Lưu vào Từ vựng</button>`;box.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>new Audio(b.dataset.audio).play());box.querySelector('#saveDrawerWord').onclick=()=>{EITPersonal.add('vocabulary',{word:d.word,meaning:d.meanings?.[0]?.defs?.[0]?.definition||'',example:d.meanings?.[0]?.defs?.[0]?.example||'',...personalMeta(),source:'Dictionary'});box.querySelector('#saveDrawerWord').textContent='✓ Đã lưu';};box.querySelector('#drawerGoogle').href=EITPersonal.translateUrl(d.word);box.querySelector('#drawerHanzii').href=EITPersonal.hanziiUrl(d.word);}catch(e){const w=box.querySelector('#drawerWord').value.trim();out.innerHTML=`<div class="dict-fallback"><b>Không tải được dữ liệu tra nhanh.</b><p>Mở từ điển Hanzii hoặc Google Translate với từ bạn vừa nhập.</p><div class="fallback-actions"><button class="btn-red" type="button" id="fallbackHanzii">Từ điển Hanzii</button><button class="btn-outline" type="button" id="fallbackGoogle">Google Translate</button></div></div>`; out.querySelector('#fallbackHanzii').onclick=()=>window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer'); out.querySelector('#fallbackGoogle').onclick=()=>window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')}};box.querySelector('#drawerSearch').onclick=search;box.querySelector('#drawerWord').addEventListener('keydown',e=>{if(e.key==='Enter')search()});}
function practicePersonalButtons(){return `<div class="personalize-header-actions"><button type="button" class="personalize-tool-btn" onclick="openPersonalDictionary()">⌕ Từ điển</button><a class="personalize-tool-btn" href="personalization.html">✦ Cá nhân hóa</a></div>`}

function setupLearningRail(){
  if(document.getElementById('eitSideRail'))return;
  const rail=document.createElement('aside');
  rail.id='eitSideRail'; rail.className='eit-side-rail'; rail.setAttribute('aria-label','Công cụ học tập');
  const tools=[
    ['overview','⌘','Tổng quan'],['dictionary','Aa','Từ điển'],['vocabulary','V','Từ vựng'],
    ['collocations','C','Collocations'],['synonyms','S','Synonyms'],['antonyms','A','Antonyms'],
    ['structures','ƒ','Cấu trúc'],['vocab-pdf','PDF','Từ vựng PDF']
  ];
  rail.innerHTML=tools.map(([id,icon,title])=>`<button type="button" class="rail-btn ${id==='overview'?'active':''}" data-tool="${id}" title="${title}" aria-label="${title}">${icon}</button>`).join('');
  document.body.appendChild(rail);
  const drawer=document.createElement('aside');
  drawer.id='eitToolDrawer'; drawer.className='eit-tool-drawer'; drawer.setAttribute('aria-hidden','true');
  drawer.innerHTML=`<div class="eit-tool-head"><div><span class="tool-kicker">EIT LEARNING TOOLS</span><h3 id="eitToolTitle">Học tập cá nhân</h3></div><button type="button" id="eitToolClose" class="drawer-close" aria-label="Đóng">×</button></div><div id="eitToolBody" class="eit-tool-body"></div>`;
  document.body.appendChild(drawer);
  const overlay=document.createElement('div');overlay.id='eitToolOverlay';overlay.className='eit-tool-overlay';document.body.appendChild(overlay);
  const state=()=>{try{return EITPersonal?.read?.()||{vocabulary:[],collocations:[],synonyms:[],antonyms:[],structures:[]}}catch{return {vocabulary:[],collocations:[],synonyms:[],antonyms:[],structures:[]}}};
  const itemHtml=(x,type)=>`<article class="rail-item"><div><b>${esc(x.word||x.term||'')}</b>${x.meaning?`<p>${esc(x.meaning)}</p>`:''}${x.example?`<small>${esc(x.example)}</small>`:''}</div><button type="button" class="rail-save-copy" data-copy="${esc(x.word||x.term||'')}">Copy</button></article>`;
  const open=(tool)=>{
    const body=drawer.querySelector('#eitToolBody'), title=drawer.querySelector('#eitToolTitle');
    const d=state();
    const labels={overview:'Học nhanh',dictionary:'Từ điển',vocabulary:'Từ vựng đã lưu',collocations:'Collocations',synonyms:'Synonyms',antonyms:'Antonyms',structures:'Cấu trúc hay', 'vocab-pdf':'Tài liệu từ vựng PDF'};
    title.textContent=labels[tool]||'Công cụ';
    if(tool==='overview'){
      body.innerHTML=`<div class="rail-overview"><div class="rail-stat"><strong>${d.vocabulary?.length||0}</strong><span>Từ vựng</span></div><div class="rail-stat"><strong>${d.collocations?.length||0}</strong><span>Collocations</span></div><div class="rail-stat"><strong>${d.structures?.length||0}</strong><span>Cấu trúc</span></div><div class="rail-context"><b>${esc(TEST.title||'Bài đang làm')}</b><span>${TEST.skill==='reading'?'Reading':'Listening'} · ${testSeriesLabel(TEST)}</span></div><a class="rail-main-link" href="personalization.html">Mở Cá nhân hóa →</a></div>`;
    }else if(tool==='dictionary'){
      body.innerHTML=`<div class="rail-dict"><div class="rail-dict-row"><input id="railDictInput" placeholder="Nhập từ / cụm từ..." autocomplete="off"><button type="button" class="btn-red" id="railDictSearch">Tra</button></div><div id="railDictResult" class="dict-result"></div><div class="rail-external"><button type="button" id="railCam">Hanzii ↗</button><button type="button" id="railGoogle">Google ↗</button></div></div>`;
      const search=async()=>{const w=body.querySelector('#railDictInput').value.trim();const out=body.querySelector('#railDictResult');if(!w)return;out.innerHTML='<div class="loading">Đang tra từ…</div>';try{const d=await EITPersonal.dictionary(w);out.innerHTML=EITPersonal.dictionaryHTML(d)+`<button type="button" class="btn-red rail-save-word" id="railSaveWord">+ Lưu vào Từ vựng</button>`;out.querySelector('#railSaveWord').onclick=()=>{EITPersonal.add('vocabulary',{word:d.word,meaning:d.meanings?.[0]?.defs?.[0]?.definition||'',example:d.meanings?.[0]?.defs?.[0]?.example||'',...personalMeta(),source:'Dictionary'});out.querySelector('#railSaveWord').textContent='✓ Đã lưu'};out.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>new Audio(b.dataset.audio).play())}catch(e){out.innerHTML=`<div class="dict-fallback"><b>Không tra được nhanh.</b><p>Bạn vẫn có thể mở từ điển ngoài để xem đầy đủ thông tin.</p></div>`}};
      body.querySelector('#railDictSearch').onclick=search;body.querySelector('#railDictInput').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
      body.querySelector('#railCam').onclick=()=>{const w=body.querySelector('#railDictInput').value.trim();if(w){window.open(EITPersonal.hanziiUrl(),'_blank','noopener,noreferrer');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(w).catch(()=>{})}};
      body.querySelector('#railGoogle').onclick=()=>{const w=body.querySelector('#railDictInput').value.trim();if(w)window.open(EITPersonal.translateUrl(w),'_blank','noopener,noreferrer')};
    }else if(tool==='vocab-pdf'){
      const url=String(TEST.content?.vocabPdfUrl||'').trim();
      body.innerHTML=url?`<div class="pdf-tool-card"><div class="pdf-icon">PDF</div><h4>Tài liệu từ vựng của bài</h4><p>File do Admin gắn với ${esc(testSeriesLabel(TEST))} · Test ${esc(TEST.testNo)}.</p><a class="btn-red rail-pdf-link" target="_blank" rel="noopener" href="${esc(url)}">Mở tài liệu PDF ↗</a></div>`:`<div class="empty-tool"><b>Chưa có PDF từ vựng.</b><p>Admin chưa gắn tài liệu từ vựng cho bài này.</p></div>`;
    }else{
      const arr=Array.isArray(d[tool])?d[tool].filter(x=>!x.testId||x.testId===TEST.id):[];
      body.innerHTML=arr.length?`<div class="rail-list">${arr.map(x=>itemHtml(x,tool)).join('')}</div><a class="rail-main-link" href="personalization.html">Xem toàn bộ trong Cá nhân hóa →</a>`:`<div class="empty-tool"><b>Chưa có dữ liệu.</b><p>Hãy lưu nội dung trong lúc học, dữ liệu sẽ xuất hiện ở đây và trong Cá nhân hóa.</p><a class="rail-main-link" href="personalization.html">Mở Cá nhân hóa →</a></div>`;
      body.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='✓'}catch{}});
    }
    drawer.classList.add('open');overlay.classList.add('show');drawer.setAttribute('aria-hidden','false');rail.querySelectorAll('.rail-btn').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  };
  const close=()=>{drawer.classList.remove('open');overlay.classList.remove('show');drawer.setAttribute('aria-hidden','true');rail.querySelectorAll('.rail-btn').forEach(b=>b.classList.toggle('active',b.dataset.tool==='overview'))};
  rail.addEventListener('click',e=>{const b=e.target.closest('.rail-btn');if(b)open(b.dataset.tool)});
  drawer.querySelector('#eitToolClose').onclick=close;overlay.onclick=close;
}

function render(){if(TEST.skill==='reading'||TEST.skill==='listening')renderRL();else if(TEST.skill==='writing'&&isHSK5Imported())renderHSK5Writing();else if(TEST.skill==='writing')renderWriting();else renderSpeaking()}
function isHSK5Imported(t=TEST){return String(t?.seriesLabel||'').startsWith('HSK5')||String(t?.sourceFile||'').startsWith('HSK5_FULL_PDF_IMPORT_')}
window.addEventListener('pagehide',()=>{try{captureActiveAnswers()}catch{}});
function head(title,sub,time){return `<header class="module-head"><div class="module-brand"><img src="/logo.png"><div><div class="module-title">${esc(title)}</div><div class="module-sub"><span class="time" id="examTimer">${time}</span><span>${esc(sub)}</span></div></div></div><div class="header-actions">${(TEST.skill==='reading'||TEST.skill==='listening')?practicePersonalButtons():''}<button class="icon-btn" onclick="location.href='practice.html?skill=${TEST.skill}&volume=${TEST.volume}'" aria-label="Back"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button></div></header>`}
function renderRL(){
 const qs=TEST.content?.questions||[]; const isR=TEST.skill==='reading';
 if(isR){
   document.body.innerHTML=head(`${TEST.skill.toUpperCase()} · ${testSeriesLabel(TEST)} · TEST ${esc(TEST.displayTestLabel||TEST.testNo)}`,'time remaining','60:00')+`<div class="module-shell"><main class="module-body split-reading"><section class="pane passage" id="passagePane"></section><div class="divider" id="readingDivider" role="separator" aria-label="Điều chỉnh độ rộng Passage và Questions"></div><section class="pane" id="questionPane"></section></main><footer class="question-nav-bottom" id="qnav"></footer></div><div class="selection-menu" id="selectionMenu"><button id="highlightBtn">Highlight</button><button id="noteBtn">Note</button></div><div class="notes-panel" id="notesPanel"><div class="notes-title">Notes <button class="icon-btn" id="closeNotes"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><textarea id="noteInput" placeholder="Write a note..."></textarea><button class="primary-red" id="saveNote">Save note</button></div>`;
   renderReadingPassage(); setupLearningRail(); setupTools(); initPracticeReadingResizer(); startTimer(Number(TEST.durationMinutes||60)*60);
 }else{
   document.body.innerHTML=head(`${TEST.skill.toUpperCase()} · ${testSeriesLabel(TEST)} · TEST ${esc(TEST.displayTestLabel||TEST.testNo)}`,'time remaining','40:00')+`<div class="module-shell"><main class="module-body listening-layout"><section class="listening-main" id="listeningPane"><div class="listening-audio" id="listeningAudioBar"><audio id="practiceListeningAudio" class="eit-custom-audio" data-player-label="LISTENING · AUDIO" preload="metadata"></audio></div><div id="listeningContent"></div></section></main><footer class="question-nav-bottom listening-nav" id="qnav"></footer></div><div class="selection-menu" id="selectionMenu"><button id="highlightBtn">Highlight</button><button id="noteBtn">Note</button></div><div class="notes-panel" id="notesPanel"><div class="notes-title">Notes <button class="icon-btn" id="closeNotes"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><textarea id="noteInput" placeholder="Write a note..."></textarea><button class="primary-red" id="saveNote">Save note</button></div>`;
   renderListeningSection(); setupLearningRail(); setupTools(); startTimer(Number(TEST.durationMinutes||40)*60);
   const audio=$('#practiceListeningAudio'),bar=$('#listeningAudioBar'); if(audio){if(TEST.audioUrl){audio.src=TEST.audioUrl;bar?.classList.remove('hidden');if(window.mountEITAudioPlayer)window.mountEITAudioPlayer(audio,{label:'LISTENING · AUDIO'})}else{bar?.classList.add('hidden')}}
 }
}
function renderReadingPassage(){
 // Snapshot currently visible answers before replacing question DOM.
 if(document.getElementById('questionPane')){try{capturePaneAnswers('#questionPane');captureSummaryFromDOM('#questionPane')}catch(e){console.warn('reading pre-render snapshot failed',e)}}
 const ps=TEST.content?.passages||[]; const qs=TEST.content?.questions||[]; const groups=TEST.content?.question_groups||[];
 const count=Math.max(1,ps.length); const idx=Math.min(count,Math.max(1,Number(activeReadingPassage||1)))-1; activeReadingPassage=idx+1;
 const pane=$('#passagePane'), qpane=$('#questionPane'); if(!pane||!qpane)return;
 const p=ps[idx]||''; const pText=(p&&typeof p==='object')?String(p.text||''):String(p||''); const lines=pText.split(/\n+/).filter(Boolean);
 const title=(p&&typeof p==='object'&&p.title)||'';
 let h=`<div class="reading-passage-head"><div class="passage-head-row"><div><div class="passage-kicker">READING · PASSAGE ${idx+1}</div><div class="passage-title">${esc(title)}</div><div class="passage-meta">Read the text and answer the questions for Passage ${idx+1}</div></div></div></div>`;
 h+=pText?`<div class="passage-text">${lines.map(x=>`<p>${esc(x.trim())}</p>`).join('')}</div>`:'<div class="empty">Chưa có nội dung Passage.</div>';
 pane.innerHTML=h;
 pane.querySelectorAll('[data-top-passage]').forEach(b=>b.onclick=()=>{activeReadingPassage=Number(b.dataset.topPassage);renderReadingPassage();requestAnimationFrame(()=>{pane.scrollTop=0;qpane.scrollTop=0;});});
 const pqs=qs.filter(q=>Number(q.passage||1)===idx+1); const pGroups=groups.filter(g=>Number(g.unit||g.passage||1)===idx+1);
 try{if(pGroups.length){qpane.innerHTML=pGroups.map((g,gi)=>renderReadingGroup(g,pqs,gi)).join('')}else{qpane.innerHTML=pqs.map(q=>renderQuestionCard(q,q.type)).join('')}}catch(err){console.error('renderReadingPassage: question render failed',err)}
 try{bindQuestionInputs('#questionPane')}catch(err){console.error('bindQuestionInputs failed',err)}
 try{bindSummaryInputs('#questionPane')}catch(err){console.error('bindSummaryInputs failed',err)}
 try{bindDragDrop('#questionPane')}catch(err){console.error('bindDragDrop failed',err)}
 try{renderReadingNav()}catch(err){console.error('renderReadingNav failed',err)}
 try{restorePracticeHighlights()}catch(err){console.error('restorePracticeHighlights failed',err)}
}
function renderReadingGroup(g,pqs,gi){const title=g.title||`Questions ${g.start}–${g.end}`, shared=g.sharedOptions||'',info=TYPE_INFO_CLIENT(g.type), parts=[];parts.push(`<section class="q-group-live" id="reading-group-${gi}"><h2>${esc(title)}</h2>${groupInstruction(g)}`);
 if(info==='completion'||info==='dragdrop'){let src=g.body||'';if(!src&&g.completionRows?.length)src=g.completionRows.map(r=>`${r.before||''} {{${r.number}}} ${r.after||''}`).join('<br>');
   if(info==='dragdrop') parts.push(renderDragDropGroup(g,src)); else parts.push(renderSummarySheet('reading',g,src,pqs))}
 else if(info==='map'){if(g.body){parts.push(`<div class="group-body-preview map-group-summary">${inlineBlankHTML(g.body,g)}</div>`)}if(g.mapImageUrl)parts.push(`<div class="reading-map-wrap"><img src="${esc(g.mapImageUrl)}" alt="Map / Plan / Diagram"></div>`);parts.push((g.questions||[]).map(q=>renderQuestionCard(q,g.type,shared)).join(''))}
 else {if(/matching\s+(names|information)/i.test(g.type||'')) parts.push(renderMatchingReference(g)); parts.push((g.questions||[]).map(q=>renderQuestionCard(q,g.type,shared)).join(''));}
 return parts.join('')+'</section>'}
function dragWords(v){return String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map((x,i)=>({letter:String.fromCharCode(65+i),text:x.replace(/^[A-J][.)\-:]\s*/i,'')}));}
function renderDragDropGroup(g,src){const words=dragWords(g.dragOptions||'');return `<div class="dragdrop-exam-sheet"><div class="dragdrop-title-row"><div class="drag-wordbank-title">Complete the summary using the list of words, A–${words.length?words[words.length-1].letter:'J'}, below.</div></div><div class="drag-wordbank">${words.map(w=>`<button type="button" class="drag-chip" data-drag-word="${esc(w.text)}"><b>${w.letter}</b> ${esc(w.text)}</button>`).join('')}</div><div class="dragdrop-body">${src?inlineDragBlankHTML(src, g):''}</div></div>`}
function inlineDragBlankHTML(text,group){const safe=htmlRich(text);return safe.replace(/\{\{(\d+)\}\}|\[\[(\d+)\]\]/g,(m,a,b)=>{const n=Number(a||b),val=getAnswer(n)||'';return `<span class="drag-blank" data-q="${n}" tabindex="0"><span class="summary-num">${n}</span><span class="drag-value" data-drag-value="${n}">${esc(val||'Drop here')}</span><button type="button" class="drag-clear" data-clear-drag="${n}" aria-label="Clear">×</button></span>`});}
function renderMatchingReference(g){const rows=String(g.sharedOptions||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!rows.length)return '';const title=/names/i.test(g.type||'')?'LIST OF NAMES':'LIST OF INFORMATION';return `<div class="matching-reference"><div class="matching-reference-title">${title}</div><div class="matching-reference-table">${rows.map((r,i)=>{const m=r.match(/^([A-J])\s*[.)\-:]?\s*(.*)$/i);return `<div class="matching-reference-row"><span class="matching-ref-code">${m?m[1].toUpperCase():String.fromCharCode(65+i)}</span><span>${esc(m?m[2]:r)}</span></div>`}).join('')}</div></div>`;}

function answerKeyId(value){return String(value??'').trim();}
function capturePaneAnswers(selector){
  const root=document.querySelector(selector);
  if(!root)return;
  const controls=root.querySelectorAll('input[data-q], textarea[data-q], select[data-q], [contenteditable="true"][data-q]');
  const seen=new Set();
  controls.forEach(e=>{
    const n=answerKeyId(e.dataset.q);
    if(!n)return;
    if(e.type==='checkbox'){
      if(seen.has(n))return;
      seen.add(n);
      answers[n]=[...root.querySelectorAll(`[data-q="${CSS.escape(n)}"]`)]
        .filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value).filter(Boolean).join(', ');
    }else if(e.type==='radio'){
      if(e.checked)answers[n]=e.value;
      else if(!(n in answers))answers[n]='';
    }else{
      answers[n]=typeof e.value==='string'?e.value:e.textContent||'';
    }
  });
  persistAnswerSnapshot();
}
function collectAnswersFromDOM(selector){capturePaneAnswers(selector)}
function captureActiveAnswers(){
  if(TEST?.skill==='reading')capturePaneAnswers('#questionPane');
  if(TEST?.skill==='listening')capturePaneAnswers('#listeningPane');
  syncNav();
}
function bindQuestionInputs(selector){
  const nodes=`${selector} input[data-q],${selector} textarea[data-q],${selector} select[data-q],${selector} [contenteditable="true"][data-q]`;
  document.querySelectorAll(nodes).forEach(e=>{
    const handler=()=>{
      const n=answerKeyId(e.dataset.q);
      if(!n)return;
      if(e.type==='checkbox'){
        answers[n]=[...document.querySelectorAll(`${selector} [data-q="${CSS.escape(n)}"]`)]
          .filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value).filter(Boolean).join(', ');
      }else if(e.type==='radio'){
        if(e.checked)answers[n]=e.value;
      }else{
        answers[n]=typeof e.value==='string'?e.value:e.textContent||'';
      }
      persistAnswerSnapshot();
      syncNav();
    };
    const eventName=(e.tagName==='INPUT' && ['text','search','number','email'].includes(e.type)) || e.tagName==='TEXTAREA' || e.isContentEditable ? 'input' : 'change';
    e.addEventListener(eventName,handler);
    e.addEventListener('change',handler);
    e.addEventListener('blur',()=>{capturePaneAnswers(selector);syncNav()});
  });
}

function bindDragDrop(root){
  if(!root)return;
  let dragState=null;
  let selectedWord=null;
  const clearOver=()=>root.querySelectorAll('.drag-blank.drag-over').forEach(x=>x.classList.remove('drag-over'));
  const clearSelected=()=>{root.querySelectorAll('.drag-chip.drag-selected').forEach(x=>x.classList.remove('drag-selected'));selectedWord=null;};
  const cleanup=()=>{clearOver();if(dragState?.clone)dragState.clone.remove();if(dragState?.word)dragState.word.classList.remove('dragging');dragState=null;};
  const getBlankAt=(x,y)=>{const el=document.elementFromPoint(x,y);return el instanceof Element?el.closest('.drag-blank'):null;};
  const setAnswer=(box,value)=>{if(!box||!value)return;answers[box.dataset.q]=value;clearSelected();renderReadingPassage();};

  root.querySelectorAll('[data-drag-word]').forEach(w=>{
    w.addEventListener('pointerdown',e=>{
      if(e.button!==undefined && e.button!==0)return;
      const value=w.dataset.dragWord||'';if(!value)return;
      e.preventDefault();
      try{w.setPointerCapture?.(e.pointerId)}catch{}
      const rect=w.getBoundingClientRect();
      const clone=w.cloneNode(true);
      clone.classList.add('drag-floating');
      clone.style.width=`${Math.max(90,rect.width)}px`;
      clone.style.left=`${e.clientX+10}px`;
      clone.style.top=`${e.clientY+10}px`;
      document.body.appendChild(clone);
      dragState={word:w,value,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false,clone,box:null};
      clearSelected();
      w.classList.add('dragging');
    });
  });

  const move=e=>{
    if(!dragState||dragState.pointerId!==e.pointerId)return;
    const dx=e.clientX-dragState.startX,dy=e.clientY-dragState.startY;
    if(!dragState.moved && Math.hypot(dx,dy)<5)return;
    dragState.moved=true;
    if(dragState.clone){dragState.clone.style.left=`${e.clientX+10}px`;dragState.clone.style.top=`${e.clientY+10}px`;}
    clearOver();
    const box=getBlankAt(e.clientX,e.clientY);
    if(box){box.classList.add('drag-over');dragState.box=box;}else dragState.box=null;
  };
  const up=e=>{
    if(!dragState||dragState.pointerId!==e.pointerId)return;
    const state=dragState;
    const box=state.moved?(getBlankAt(e.clientX,e.clientY)||state.box):null;
    cleanup();
    if(state.moved){if(box)setAnswer(box,state.value);else state.word.classList.remove('dragging');}
    else{
      state.word.classList.add('drag-selected');
      selectedWord=state.word;
    }
    e.preventDefault?.();
  };
  const cancel=e=>{if(dragState&&dragState.pointerId===e.pointerId)cleanup();};
  document.addEventListener('pointermove',move,true);
  document.addEventListener('pointerup',up,true);
  document.addEventListener('pointercancel',cancel,true);

  // Click-to-place fallback: select a word, then click the target blank.
  root.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(!target)return;
    const clear=target.closest('[data-clear-drag]');
    if(clear){e.stopPropagation();delete answers[clear.dataset.clearDrag];clearSelected();renderReadingPassage();return;}
    const word=target.closest('[data-drag-word]');
    if(word && !dragState){
      const value=word.dataset.dragWord||'';if(!value)return;
      if(selectedWord===word){clearSelected();return;}
      clearSelected();word.classList.add('drag-selected');selectedWord=word;return;
    }
    const blank=target.closest('.drag-blank');
    if(blank && selectedWord){setAnswer(blank,selectedWord.dataset.dragWord||'');}
  });

  // Native HTML5 drop fallback.
  root.querySelectorAll('[data-drag-word]').forEach(word=>word.setAttribute('draggable','true'));
  root.addEventListener('dragstart',e=>{
    const word=e.target instanceof Element?e.target.closest('[data-drag-word]'):null;if(!word)return;
    try{e.dataTransfer.setData('text/plain',word.dataset.dragWord||'');e.dataTransfer.effectAllowed='copy';}catch{}
  });
  root.addEventListener('dragover',e=>{
    const box=getBlankAt(e.clientX,e.clientY);if(!box)return;
    e.preventDefault();clearOver();box.classList.add('drag-over');
    try{e.dataTransfer.dropEffect='copy';}catch{}
  });
  root.addEventListener('drop',e=>{
    const box=getBlankAt(e.clientX,e.clientY);if(!box)return;
    e.preventDefault();e.stopPropagation();
    let value='';try{value=e.dataTransfer.getData('text/plain')||'';}catch{}
    clearOver();if(value)setAnswer(box,value);
  });
}

function renderReadingNav(){
 const qs=TEST.content?.questions||[],nav=$('#qnav');if(!nav)return;
 const ps=TEST.content?.passages||[];const passageCount=Math.max(1,ps.length, ...qs.map(q=>Number(q.passage||1)));
 const pqs=qs.filter(q=>Number(q.passage||1)===Number(activeReadingPassage)).sort((a,b)=>Number(a.number)-Number(b.number));
 const btns=Array.from({length:passageCount},(_,j)=>j+1).map(i=>{
   const list=qs.filter(q=>Number(q.passage||1)===i).sort((a,b)=>Number(a.number)-Number(b.number));
   const done=list.filter(q=>isAnswered(q.number)).length;
   return `<button class="nav-section ${i===Number(activeReadingPassage)?'active':''}" data-reading-passage="${i}">PASSAGE ${i} <small>${list.length?`${done}/${list.length}`:'0/0'}</small></button>`;
 }).join('');
 nav.innerHTML=btns+pqs.map(q=>`<button class="nav-q ${isAnswered(q.number)?'answered':''}" data-nav="${esc(q.number)}" data-nav-passage="${Number(q.passage||activeReadingPassage)}">${esc(q.number)}</button>`).join('')+
   `<button class="bottom-submit" id="submitBtn" title="Submit" aria-label="Submit test"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button>`;
 nav.querySelectorAll('[data-reading-passage]').forEach(b=>b.onclick=()=>{
  captureActiveAnswers();
  activeReadingPassage=Number(b.dataset.readingPassage);
  renderReadingPassage();
  requestAnimationFrame(()=>{const pp=$('#passagePane'),qp=$('#questionPane');if(pp)pp.scrollTo({top:0,behavior:'smooth'});if(qp)qp.scrollTo({top:0,behavior:'smooth'});});
});
 nav.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
   const n=b.dataset.nav,p=Number(b.dataset.navPassage||activeReadingPassage);
   const go=()=>{const el=document.getElementById('qcard-'+n)||document.querySelector(`[data-q="${CSS.escape(n)}"]`)?.closest('.q-card,.completion-row');scrollQuestionIntoView(el);};
   if(p!==Number(activeReadingPassage)){captureActiveAnswers();activeReadingPassage=p;renderReadingPassage();requestAnimationFrame(go)}else go();
 });
 $('#submitBtn').onclick=()=>openSubmitConfirm(false);syncNav();
}
function restorePracticeHighlights(){
  let saved=[];
  try{saved=JSON.parse(localStorage.getItem('practiceHighlights:'+TEST.id)||'[]')}catch{}
  const roots={
    passage:$('#passagePane'),
    question:$('#questionPane'),
    listening:$('#listeningPane')||$('#listeningContent')
  };
  ['passage','question','listening'].forEach(pane=>{
    const root=roots[pane]; if(!root)return;
    saved.filter(h=>h.pane===pane && (pane==='listening' || Number(h.passage||activeReadingPassage)===Number(activeReadingPassage)))
      .sort((a,b)=>Number(b.start)-Number(a.start))
      .forEach(h=>{
        const r=rangeFromOffsets(root,Number(h.start),Number(h.end));
        if(r)wrapSelection(r,h.cls||'hl-brown');
      });
  });
}
function initPracticeReadingResizer(){
 const body=document.querySelector('.split-reading'),divider=document.getElementById('readingDivider');
 if(!body||!divider)return;
 const MIN_LEFT=280,MIN_RIGHT=280,DIVIDER=28;
 divider.setAttribute('aria-valuemin','25');divider.setAttribute('aria-valuemax','75');
 const saved=Number(localStorage.getItem('eitReadingSplitV20'));
 let split=Number.isFinite(saved)&&saved>=25&&saved<=75?saved:50;
 const apply=p=>{
   const r=body.getBoundingClientRect();
   const total=Math.max(600,r.width-DIVIDER);
   const minPct=Math.min(48,(MIN_LEFT/total)*100);
   const maxPct=Math.max(52,100-(MIN_RIGHT/total)*100);
   split=Math.max(minPct,Math.min(maxPct,Number(p)||50));
   const left=Math.round(total*split/100),right=Math.round(total-left);
   body.style.setProperty('grid-template-columns',`${left}px ${DIVIDER}px ${right}px`,'important');
   divider.setAttribute('aria-valuenow',split.toFixed(0));
   localStorage.setItem('eitReadingSplitV20',String(split));
 };
 apply(split);
 let dragging=false,pointerId=null;
 const move=e=>{
   if(!dragging)return;
   const r=body.getBoundingClientRect();
   const total=Math.max(600,r.width-DIVIDER);
   const x=Math.max(MIN_LEFT,Math.min(total-MIN_RIGHT,e.clientX-r.left));
   apply((x/total)*100);
   e.preventDefault?.();
 };
 const stop=e=>{
   if(!dragging)return;
   dragging=false;pointerId=null;body.classList.remove('resizing');document.documentElement.classList.remove('eit-resizing');
   try{if(e&&divider.releasePointerCapture&&e.pointerId!=null&&divider.hasPointerCapture?.(e.pointerId))divider.releasePointerCapture(e.pointerId)}catch{}
   window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',stop,true);window.removeEventListener('pointercancel',stop,true);window.removeEventListener('mousemove',move,true);window.removeEventListener('mouseup',stop,true);
 };
 const start=e=>{
   if(e.type==='mousedown'&&window.PointerEvent)return;
   if(e.button!==undefined&&e.button!==0)return;
   dragging=true;pointerId=e.pointerId??null;body.classList.add('resizing');document.documentElement.classList.add('eit-resizing');
   try{if(divider.setPointerCapture&&e.pointerId!=null)divider.setPointerCapture(e.pointerId)}catch{}
   window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',stop,true);window.addEventListener('pointercancel',stop,true);window.addEventListener('mousemove',move,true);window.addEventListener('mouseup',stop,true);
   e.preventDefault?.();e.stopPropagation?.();
 };
 divider.addEventListener('pointerdown',start,{passive:false});
 divider.addEventListener('mousedown',start,{passive:false});
 divider.addEventListener('dblclick',()=>apply(50));
 divider.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){apply(split-2);e.preventDefault()}if(e.key==='ArrowRight'){apply(split+2);e.preventDefault()}if(e.key==='Home'){apply(25);e.preventDefault()}if(e.key==='End'){apply(75);e.preventDefault()}});
 window.addEventListener('resize',()=>apply(split));
}

function renderListeningSection(){
 // Snapshot the currently visible section before replacing its DOM.
 // This prevents Summary/Completion answers from disappearing on section changes.
 if(document.getElementById('listeningPane')){try{capturePaneAnswers('#listeningPane');captureSummaryFromDOM('#listeningPane')}catch(e){console.warn('listening pre-render snapshot failed',e)}}
 const all=TEST.content?.questions||[], groups=TEST.content?.question_groups||[];
 const sec=activeListeningSection;
 const sectionQs=all.filter(q=>Number(q.section||1)===sec);
 const sectionMeta=(TEST.content?.sections||[])[sec-1]; const sectionIntro=(sectionMeta&&typeof sectionMeta==='object')?(sectionMeta.title||`Questions ${sectionMeta.start||''}–${sectionMeta.end||''}`):(sectionMeta||`Read the text and answer questions ${sectionQs[0]?.number||''}–${sectionQs[sectionQs.length-1]?.number||''}`);
 const pane=$('#listeningPane'),content=$('#listeningContent')||pane; if(!pane)return;
 const nums=sectionQs.map(q=>Number(String(q.number).match(/\d+/)?.[0])).filter(Number.isFinite);
 const start=nums.length?Math.min(...nums):((sec-1)*10+1), end=nums.length?Math.max(...nums):sec*10;
 let html=`<div class="listening-section-banner"><div class="listening-section-kicker">SECTION ${sec}</div><div class="listening-section-title">${esc(sectionIntro)}</div></div>`;
 let sectionGroups=groups.filter(g=>{
   if(g.section!=null)return Number(g.section)===sec;
   const a=Number(g.start),b=Number(g.end);return Number.isFinite(a)&&Number.isFinite(b)&&b>=start&&a<=end;
 });
 if(sectionGroups.length){
   sectionGroups.forEach(g=>{html+=renderListeningGroup(g,sectionQs)})
 }else{
   const completions=sectionQs.filter(q=>TYPE_INFO_CLIENT(q.type)==='completion');
   const hasMap=sectionQs.some(q=>TYPE_INFO_CLIENT(q.type)==='map');
   if(completions.length===sectionQs.length && completions.length){
     html+=`<section class="listening-completion-sheet"><div class="completion-heading">${esc(TEST.title||'Listening')}</div>`;
     completions.forEach(q=>{
       const text=String(q.text||'').replace(/_{2,}/g,'');
       html+=`<div class="completion-row"><div class="completion-text">${esc(text)}</div><span class="blank-wrap"><span class="blank-number">${esc(q.number)}</span><input class="inline-answer listening-answer" data-q="${esc(q.number)}" data-summary-q="${esc(q.number)}" value="${esc(summaryAnswers[String(q.number)]||answers[q.number]||'')}" autocomplete="off"></span></div>`;
     });
     html+='</section>';
   }else{
     if(hasMap){sectionQs.filter(q=>TYPE_INFO_CLIENT(q.type)==='map'&&q.mapImageUrl).forEach(q=>html+=`<div class="listening-map-wrap"><img src="${esc(q.mapImageUrl)}" alt="Map / Plan / Diagram"></div>`)}
     html+=sectionQs.map(q=>renderQuestionCard(q,q.type)).join('');
   }
 }
 content.innerHTML=html;
 try{bindSummaryInputs('#listeningPane')}catch(err){console.error('bindSummaryInputs listening failed',err)}
 try{restorePracticeHighlights()}catch(err){console.error('restorePracticeHighlights listening failed',err)}
 document.querySelectorAll('#listeningPane [data-q]').forEach(e=>e.addEventListener(e.tagName==='SELECT'?'change':'input',()=>{
   const n=e.dataset.q;
   if(e.type==='checkbox'){const arr=[...document.querySelectorAll(`#listeningPane [data-q="${CSS.escape(n)}"]`)].filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value);answers[n]=arr.join(', ')}else answers[n]=e.value;
   persistAnswerSnapshot();
   syncNav();
 }));
 renderNav();
}
function renderListeningGroup(g,sectionQs){
 const title=g.title||`Questions ${g.start}–${g.end}`; let h=`<section class="listening-group"><h2>${esc(title)}</h2>${groupInstruction(g)}`;
 const type=TYPE_INFO_CLIENT(g.type), shared=g.sharedOptions||'';
 if(type==='completion'){
   let src=g.body||''; if(!src&&Array.isArray(g.completionRows)&&g.completionRows.length)src=g.completionRows.map(r=>`${r.before||''} {{${r.number}}} ${r.after||''}`).join('<br>');
   h+=renderSummarySheet('listening',g,src,sectionQs);
 }else if(type==='map'){
   if(g.body)h+=`<div class="group-body-preview map-group-summary">${inlineBlankHTML(g.body,g)}</div>`;
   if(g.mapImageUrl)h+=`<div class="listening-map-wrap"><img src="${esc(g.mapImageUrl)}" alt="Map / Plan / Diagram"></div>`;
   h+=(g.questions||[]).map(q=>renderQuestionCard(q,g.type,shared)).join('');
  }else{
   if(/matching\s+(names|information)/i.test(g.type||'')) h+=renderMatchingReference(g);
   h+=(g.questions||[]).map(q=>renderQuestionCard(q,g.type,shared)).join('');
 }
 return h+'</section>';
}
function renderSummarySheet(kind,g,src,questions){
  const title=String(g?.title||'').trim();
  const start=Number(g?.start); const end=Number(g?.end);
  const list=Array.isArray(questions)?questions.filter(q=>{const n=Number(q.number); return (!Number.isFinite(start)||n>=start)&&(!Number.isFinite(end)||n<=end)}):[];
  const fallback=list.map(q=>`<div class="completion-row"><div class="completion-text">${esc(q.text||'')}</div><span class="blank-wrap"><span class="blank-number">${esc(q.number)}</span><input class="inline-answer ${kind==='listening'?'listening-answer':''}" data-q="${esc(q.number)}" data-summary-q="${esc(q.number)}" value="${esc(summaryAnswers[String(q.number)]||answers[q.number]||'')}" autocomplete="off"></span></div>`).join('');
  return `<div class="summary-sheet-ielts ${kind==='listening'?'summary-sheet-listening':'summary-sheet-reading'}">${title?`<div class="summary-sheet-title">${esc(title).toUpperCase()}</div>`:''}<div class="summary-sheet-divider"></div><div class="summary-sheet-body">${src?inlineBlankHTML(src,g):fallback}</div></div>`;
}
function htmlRich(x){return String(x||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/\son\w+\s*=\s*(['"]).*?\1/gi,'')}
function inlineBlankHTML(text, group){
  const safe=htmlRich(text); return safe.replace(/\{\{(\d+)\}\}|\[\[(\d+)\]\]/g,(m,a,b)=>{const n=Number(a||b);return `<span class="summary-fill"><span class="summary-num">${n}</span><input data-q="${n}" data-summary-q="${n}" class="inline-answer" value="${esc(summaryAnswers[String(n)]||answers[n]||'')}" placeholder="" autocomplete="off"></span>`});
}
function optionsArray(v){return String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/^[A-H][.)\-:]\s*/i,''));}
function groupInstruction(g){return g.instruction?`<div class="q-instruction">${htmlRich(g.instruction).replace(/\n/g,'<br>')}</div>`:''}
function renderQuestionCard(q,mode,shared=''){
  const typ=q.type||mode||'Multiple Choice', info=TYPE_INFO_CLIENT(typ); let input='';
  const current=String(getAnswer(q.number)??'').trim();
  const selectedMulti=new Set(current.split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean));
  if(info==='choice'){input=(q.options||[]).map((o,i)=>`<label class="option"><input type="radio" name="q_${esc(q.number)}" value="${esc(o)}" data-q="${esc(q.number)}" ${current===String(o).trim()?'checked':''}><span>${esc(String.fromCharCode(65+i))}. ${esc(o)}</span></label>`).join('');}
  else if(info==='multi'){input=(q.options||[]).map((o,i)=>`<label class="option"><input type="checkbox" value="${esc(o)}" data-q="${esc(q.number)}" ${selectedMulti.has(String(o).trim())?'checked':''}><span>${esc(String.fromCharCode(65+i))}. ${esc(o)}</span></label>`).join('');}
  else if(info==='tfng'){input=['TRUE','FALSE','NOT GIVEN'].map(o=>`<label class="option"><input type="radio" name="q_${esc(q.number)}" value="${o}" data-q="${esc(q.number)}" ${current===o?'checked':''}><span>${o}</span></label>`).join('');}
  else if(info==='ynng'){input=['YES','NO','NOT GIVEN'].map(o=>`<label class="option"><input type="radio" name="q_${esc(q.number)}" value="${o}" data-q="${esc(q.number)}" ${current===o?'checked':''}><span>${o}</span></label>`).join('');}
  else if(info==='matching'){const opts=optionsArray(shared);input=`<select class="match-select" data-q="${esc(q.number)}"><option value="">Choose...</option>${opts.map((o,i)=>`<option value="${esc(o)}" ${current===String(o).trim()?'selected':''}>${esc(String.fromCharCode(65+i))}. ${esc(o)}</option>`).join('')}</select>`}
  else if(info==='dates'){const opts=optionsArray(shared);input=`<select class="match-select" data-q="${esc(q.number)}"><option value="">Choose date...</option>${opts.map(o=>`<option value="${esc(o)}" ${current===String(o).trim()?'selected':''}>${esc(o)}</option>`).join('')}</select>`}
  else if(info==='completion'){input='';}
  else if(info==='map'){const opts=optionsArray(shared);input=`<select class="match-select" data-q="${esc(q.number)}"><option value="">Choose...</option>${opts.map((o,i)=>`<option value="${esc(o)}" ${current===String(o).trim()?'selected':''}>${esc(String.fromCharCode(65+i))}. ${esc(o)}</option>`).join('')}</select>`}
  else input=`<span class="fill-line"><input data-q="${esc(q.number)}" value="${esc(current)}" placeholder="Answer" autocomplete="off"></span>`;
  const body=info==='completion'&&q.body?inlineBlankHTML(q.body):esc(q.text||'');
  return `<article class="q-card" id="qcard-${esc(q.number)}"><div class="q-number">QUESTION ${esc(q.number)}</div><div class="q-text">${body}</div>${input}</article>`;
}
function TYPE_INFO_CLIENT(t){
 const s=String(t||'').toLowerCase();
 if(s.includes('multiple select'))return 'multi'; if(s.includes('multiple choice'))return 'choice'; if(s.includes('true/false')||s.includes('tfng'))return 'tfng'; if(s.includes('yes/no'))return 'ynng'; if(s.includes('heading')||s.includes('information')||s.includes('name')||s==='matching')return 'matching'; if(s.includes('date'))return 'dates'; if(s.includes('drag')&&s.includes('summary'))return 'dragdrop'; if(s.includes('summary')||s.includes('completion')||s.includes('table')||s.includes('note')||s.includes('form')||s.includes('sentence'))return 'completion'; if(s.includes('map')||s.includes('plan')||s.includes('diagram'))return 'map'; return 'short';
}
function renderQuestions(){
 const qs=TEST.content?.questions||[], groups=TEST.content?.question_groups||[]; const pane=$('#questionPane');
 if(!groups.length){pane.innerHTML=qs.map(q=>renderQuestionCard(q,q.type)).join('');}
 else {pane.innerHTML=groups.map((g,gi)=>{const title=g.title||`Questions ${g.start}–${g.end}`;const shared=g.sharedOptions||'';let body='';const isComp=['completion','dragdrop'].includes(TYPE_INFO_CLIENT(g.type));if(isComp){let src=g.body||'';if(!src && Array.isArray(g.completionRows)&&g.completionRows.length)src=g.completionRows.map(r=>`${r.before||''} {{${r.number}}} ${r.after||''}`).join('<br>');if(src)body=`<div class="group-body-preview">${inlineBlankHTML(src,g)}</div>`;}let drag='';if(TYPE_INFO_CLIENT(g.type)==='dragdrop'){drag=renderDragDropGroup(g,body);} let map='';if(TYPE_INFO_CLIENT(g.type)==='map'&&g.mapImageUrl)map=`<div class="map-question-image"><img src="${esc(g.mapImageUrl)}" alt="Map / Plan / Diagram"></div>`;const showCards=!isComp;const qcards=showCards?(g.questions||[]).map(q=>renderQuestionCard(q,g.type,shared)).join(''):'';return `<section class="q-group-live" id="group-${gi}"><h2>${esc(title)}</h2>${groupInstruction(g)}${map}${TYPE_INFO_CLIENT(g.type)==='dragdrop'?drag:body}${qcards}</section>`}).join('');}
 document.querySelectorAll('#questionPane [data-q]').forEach(e=>e.addEventListener('input',()=>{const n=e.dataset.q;if(e.type==='checkbox'){const arr=[...document.querySelectorAll(`[data-q="${CSS.escape(n)}"]`)].filter(x=>x.type==='checkbox'&&x.checked).map(x=>x.value);answers[n]=arr.join(', ')}else answers[n]=e.value;persistAnswerSnapshot();syncNav()}));
 document.querySelectorAll('#questionPane .match-select').forEach(e=>e.addEventListener('change',()=>{answers[e.dataset.q]=e.value;syncNav()})); bindDragDrop('#questionPane'); renderNav();
}
function scrollQuestionIntoView(el){
  const pane=document.getElementById('questionPane');
  if(!pane||!el)return;
  const pr=pane.getBoundingClientRect(), er=el.getBoundingClientRect();
  const target=pane.scrollTop+(er.top-pr.top)-(pane.clientHeight-er.height)/2;
  pane.scrollTo({top:Math.max(0,target),behavior:'smooth'});
}
function renderNav(){
 const qs=TEST.content?.questions||[]; const nav=$('#qnav'); if(!nav)return;
 if(TEST.skill==='listening'){
   const secs=(TEST.content?.sections||[]).map((x,i)=>Number(typeof x==='object'?(x.id||x.section||i+1):i+1)).filter((n,i,a)=>Number.isFinite(n)&&n>0&&a.indexOf(n)===i); if(!secs.length)secs.push(1,2,3,4);
   nav.innerHTML=secs.map(sec=>`<button class="nav-section ${sec===activeListeningSection?'active':''}" data-listening-section="${sec}">SECTION ${sec} <small>${qs.filter(q=>Number(q.section||1)===sec&&answers[q.number]).length}/${Math.max(10,qs.filter(q=>Number(q.section||1)===sec).length)}</small></button>`).join('')+
     qs.filter(q=>Number(q.section||1)===activeListeningSection).map(q=>{const n=String(q.number);return `<button class="nav-q ${isAnswered(n)?'answered':''}" data-nav="${esc(n)}">${esc(n)}</button>`}).join('')+
     `<button class="bottom-submit" id="submitBtn" title="Submit"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button>`;
   nav.querySelectorAll('[data-listening-section]').forEach(b=>b.onclick=()=>{
  captureActiveAnswers();
  activeListeningSection=Number(b.dataset.listeningSection);
  renderListeningSection();
  requestAnimationFrame(()=>{const lp=$('#listeningPane');if(lp)lp.scrollTo({top:0,behavior:'smooth'});});
});
 }else{
   nav.innerHTML=`<span style="font-weight:900">${TEST.skill.toUpperCase()}</span>`+qs.map(q=>`<button class="nav-q" data-nav="${esc(q.number)}">${esc(q.number)}</button>`).join('')+`<button class="bottom-submit" id="submitBtn" title="Submit"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button>`;
 }
 nav.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
   const el=document.querySelector(`[data-q="${CSS.escape(b.dataset.nav)}"]`)?.closest('.q-card,.completion-row')||document.getElementById('qcard-'+b.dataset.nav);
   if(TEST.skill==='reading') scrollQuestionIntoView(el); else { const pane=document.getElementById('listeningPane'); if(pane&&el){const pr=pane.getBoundingClientRect(),er=el.getBoundingClientRect();pane.scrollTo({top:Math.max(0,pane.scrollTop+(er.top-pr.top)-(pane.clientHeight-er.height)/2),behavior:'smooth'});}}
 });
 $('#submitBtn').onclick=()=>openSubmitConfirm(false); syncNav();
}
function syncNav(){document.querySelectorAll('.nav-q').forEach(b=>b.classList.toggle('answered',isAnswered(b.textContent.trim())))}
function setupTools(){
  let lastSelection=null;
  const menu=$('#selectionMenu');
  if(!menu)return;
  const rootForPane=pane=>{
    if(pane==='passage') return $('#passagePane');
    if(pane==='listening') return $('#listeningPane')||$('#listeningContent');
    return $('#questionPane');
  };
  const roots=()=>[document.getElementById('passagePane'),document.getElementById('questionPane'),document.getElementById('listeningPane'),document.getElementById('listeningContent')].filter(Boolean);
  document.addEventListener('selectionchange',()=>{
    const sel=window.getSelection(), text=sel?.toString().trim()||'';
    if(!sel||sel.isCollapsed||!text)return;
    const r=sel.getRangeAt(0);
    const root=roots().find(x=>x.contains(r.startContainer)&&x.contains(r.endContainer))||roots().find(x=>x.contains(r.commonAncestorContainer));
    if(!root){menu.classList.remove('show');lastSelection=null;return;}
    const pane = root.id==='passagePane' ? 'passage' : (root.id==='listeningPane'||root.id==='listeningContent') ? 'listening' : 'question';
    lastSelection={text,range:r.cloneRange(),pane,rootId:root.id};
    const rect=r.getBoundingClientRect();
    menu.style.left=Math.max(6,Math.min(window.innerWidth-150,rect.left+rect.width/2-65))+'px';
    menu.style.top=Math.max(6,rect.top-44)+'px';
    menu.classList.add('show');
  });
  document.addEventListener('mousedown',e=>{if(!e.target.closest('#selectionMenu'))menu.classList.remove('show')});
  $('#highlightBtn').onclick=()=>{
    if(!lastSelection)return;
    const root=rootForPane(lastSelection.pane);
    if(!root)return;
    const range=lastSelection.range.cloneRange();
    const start=textOffset(root,range.startContainer,range.startOffset);
    const end=textOffset(root,range.endContainer,range.endOffset);
    if(end<=start)return;
    let all=[]; try{all=JSON.parse(localStorage.getItem('practiceHighlights:'+TEST.id)||'[]')}catch{}
    const exact=all.find(h=>Number(h.passage||activeReadingPassage)===Number(activeReadingPassage)&&h.pane===lastSelection.pane&&Number(h.start)===start&&Number(h.end)===end);
    if(exact){
      const target=findHighlightElement(range,root);
      if(exact.cls==='hl-brown'){
        exact.cls='hl-pink';
        if(target){
          target.classList.remove('hl-brown');target.classList.add('hl-pink');
          target.setAttribute('style','background-color:#FF007F!important;color:#FFF!important;display:inline!important;padding:2px 4px!important;border-radius:2px!important;');
        }else rerenderCurrentHighlights();
      }else{
        if(target?.parentNode){
          const p=target.parentNode;
          while(target.firstChild)p.insertBefore(target.firstChild,target);
          p.removeChild(target);
        }
        all=all.filter(x=>x!==exact);
      }
      localStorage.setItem('practiceHighlights:'+TEST.id,JSON.stringify(all));
    }else{
      // Crucially, use the selection-aware wrapper on Listening too.
      wrapSelectedRange(range,'hl-brown',root);
      all.push({text:lastSelection.text,start,end,cls:'hl-brown',pane:lastSelection.pane,passage:activeReadingPassage});
      localStorage.setItem('practiceHighlights:'+TEST.id,JSON.stringify(all));
    }
    menu.classList.remove('show');window.getSelection()?.removeAllRanges();lastSelection=null;
  };
  $('#noteBtn').onclick=()=>{if(!lastSelection)return;$('#notesPanel').classList.add('open');$('#noteInput').value=lastSelection.text;menu.classList.remove('show')};
  $('#closeNotes').onclick=()=>$('#notesPanel').classList.remove('open');
  $('#saveNote').onclick=()=>{$('#notesPanel').classList.remove('open');$('#noteInput').value=''};
}
function wrapSelection(range,colorClass='hl-brown'){
  if(!range||range.collapsed)return null;
  const wrapper=document.createElement('span');wrapper.className=colorClass;
  let bgColor='#352315';
  if(colorClass==='hl-pink') bgColor='#FF007F';
  wrapper.setAttribute('style',`background-color:${bgColor}!important;color:#FFF!important;display:inline!important;padding:2px 4px!important;border-radius:2px!important;`);
  try{range.surroundContents(wrapper);}catch(error){const fragment=range.extractContents();wrapper.appendChild(fragment);range.insertNode(wrapper);}
  return wrapper;
}
function wrapSelectedRange(range, cls, root){
  if(!root)root=document.getElementById('listeningPane')||document.getElementById('listeningContent');
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[]; let node;
  while(node=walker.nextNode()){
    if(!node.nodeValue)continue;
    try{if(range.intersectsNode(node))nodes.push(node);}catch{}
  }
  nodes.forEach(node=>{
    const start=node===range.startContainer?range.startOffset:0;
    const end=node===range.endContainer?range.endOffset:node.nodeValue.length;
    if(end<=start)return;
    const before=node.nodeValue.slice(0,start),selected=node.nodeValue.slice(start,end),after=node.nodeValue.slice(end);
    const frag=document.createDocumentFragment();
    if(before)frag.appendChild(document.createTextNode(before));
    const mark=document.createElement('mark');
    mark.className=cls;mark.textContent=selected;
    let bgColor='#352315';
    if(cls==='hl-pink') bgColor='#FF007F';
    mark.setAttribute('style',`background-color:${bgColor}!important;color:#FFF!important;display:inline!important;padding:2px 4px!important;border-radius:2px!important;`);
    frag.appendChild(mark);
    if(after)frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag,node);
  });
}
function findHighlightElement(range,root){
  let n=range.commonAncestorContainer;
  if(n.nodeType===Node.TEXT_NODE)n=n.parentElement;
  return n?.closest?.('span.hl-brown, span.hl-pink, mark.hl-brown, mark.hl-pink');
}
function rangeFromOffsets(root,start,end){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let total=0,sn=null,en=null,so=0,eo=0,n;
  while(n=w.nextNode()){
    const nx=total+n.nodeValue.length;
    if(!sn&&start>=total&&start<=nx){sn=n;so=start-total;}
    if(end>=total&&end<=nx){en=n;eo=end-total;break;}
    total=nx;
  }
  if(!sn||!en)return null;
  const r=document.createRange();r.setStart(sn,so);r.setEnd(en,eo);return r;
}
function textOffset(root,node,offset){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let total=0,n;while(n=w.nextNode()){if(n===node)return total+offset;total+=n.nodeValue.length}return total}
function cycleHighlight(sel){
 const root=TEST.skill==='listening'?$('#listeningPane'):$('#passagePane');
 const start=textOffset(root,sel.range.startContainer,sel.range.startOffset),end=textOffset(root,sel.range.endContainer,sel.range.endOffset);
 let all=JSON.parse(localStorage.getItem('practiceHighlights:'+TEST.id)||'[]'); const hit=all.find(h=>Number(h.start)===start&&Number(h.end)===end);
 if(hit){if(hit.cls==='hl-brown')hit.cls='hl-pink';else{all=all.filter(h=>h!==hit);localStorage.setItem('practiceHighlights:'+TEST.id,JSON.stringify(all));rerenderCurrentHighlights();return}localStorage.setItem('practiceHighlights:'+TEST.id,JSON.stringify(all));rerenderCurrentHighlights();return}
 const r=sel.range.cloneRange(),sp=document.createElement('span');sp.className='hl-brown';try{r.surroundContents(sp)}catch{const frag=r.extractContents();sp.appendChild(frag);r.insertNode(sp)}all.push({text:sel.text,start,end,cls:'hl-brown'});localStorage.setItem('practiceHighlights:'+TEST.id,JSON.stringify(all));
}
function rerenderCurrentHighlights(){
 const root=TEST.skill==='listening'?$('#listeningPane'):$('#passagePane'); if(!root)return;
 const saved=JSON.parse(localStorage.getItem('practiceHighlights:'+TEST.id)||'[]');root.querySelectorAll('span.hl-brown,span.hl-pink').forEach(sp=>sp.replaceWith(document.createTextNode(sp.textContent)));
 saved.sort((a,b)=>Number(b.start)-Number(a.start)).forEach(h=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let total=0,sn=null,en=null,so=0,eo=0,n;while(n=w.nextNode()){const nx=total+n.nodeValue.length;if(sn===null&&Number(h.start)>=total&&Number(h.start)<=nx){sn=n;so=Number(h.start)-total}if(Number(h.end)>=total&&Number(h.end)<=nx){en=n;eo=Number(h.end)-total;break}total=nx}if(sn&&en){const r=document.createRange();r.setStart(sn,so);r.setEnd(en,eo);const sp=document.createElement('span');sp.className=h.cls;try{r.surroundContents(sp)}catch{const f=r.extractContents();sp.appendChild(f);r.insertNode(sp)}}});
}
function openSubmitConfirm(auto=false){
  if(auto) return submit(true);
  if(document.getElementById('submitConfirmModal')) return;
  const modal=document.createElement('div'); modal.id='submitConfirmModal'; modal.className='submit-confirm-overlay';
  const hsk5Write=TEST?.skill==='writing'&&isHSK5Imported();
  modal.innerHTML=`<div class="submit-confirm-card" role="dialog" aria-modal="true" aria-labelledby="submitConfirmTitle">
    <button class="submit-confirm-close" id="submitConfirmClose" aria-label="Close">×</button>
    <h2 id="submitConfirmTitle">${hsk5Write?'Nộp bài HSK5 Writing?':'Are you ready to submit<br>your test?'}</h2>
    <div class="submit-confirm-copy"><p>- Sau khi nộp, bạn sẽ không thể chỉnh sửa bài làm này.</p><p>- Hãy kiểm tra lại câu trả lời trước khi tiếp tục.</p><p>- ${hsk5Write?'Câu 91–98 lưu đáp án để đối chiếu; bài viết 99–100 cần giáo viên xem xét.':'Bài sẽ được lưu và gửi tới hệ thống chấm bài.'}</p></div>
    <div class="submit-confirm-actions"><button class="submit-now" id="submitNowBtn">${hsk5Write?'Nộp bài':'Submit & AI Grade'}</button><button class="check-again" id="checkAgainBtn">Kiểm tra lại</button></div>
  </div>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();
  document.getElementById('submitConfirmClose').onclick=close;
  document.getElementById('checkAgainBtn').onclick=close;
  document.getElementById('submitNowBtn').onclick=()=>{close();submit(false)};
  modal.addEventListener('click',e=>{if(e.target===modal)close()});
}
async function submit(auto){
  if(window.__eitSubmitting)return;
  window.__eitSubmitting=true;
  clearInterval(timer);
  if(typeof prepTimer!=='undefined'&&prepTimer)clearInterval(prepTimer);
  if(TEST.skill==='writing')return isHSK5Imported()?submitHSK5Writing(auto):submitWriting();
  if(TEST.skill==='speaking')return submitSpeaking();
  try{
    // Always take a final snapshot from the live form before grading/submitting.
    // This is especially important for Summary/Note/Completion inputs because
    // their value may not have fired an input event yet (paste, autofill, IME, etc.).
    captureActiveAnswers();
    captureSummaryFromDOM(TEST.skill==='reading'?'#questionPane':'#listeningPane');
    mergeSummaryAnswers();
    persistPracticeDraft();
    const qs=TEST.content?.questions||[],key=TEST.answerKey||{},exp=TEST.explanations||{};
    let correctCount=0,rows=[];
    for(const q of qs){
      const n=String(q.number);
      const a=getAnswer(n);
      answers[n]=a;
      const ok=correct(a,key[q.number],q);
      if(ok)correctCount++;
      rows.push({n:q.number,a,key:key[q.number]??'',ok,exp:exp[q.number]||''});
    }
    const total=qs.length||40;
    const b=total===40?band(correctCount):null;
    const elapsed=Math.max(0,(Number(TEST.durationMinutes||40)*60)-Number(seconds||0));
    await saveSubmission({answers,score:correctCount,total,autoSubmitted:auto,elapsedSeconds:elapsed});
    rememberPracticeHistory(correctCount,total);
    try{localStorage.removeItem(practiceDraftKey())}catch{}
    try{localStorage.removeItem(practiceSummaryKey())}catch{}
    try{sessionStorage.removeItem(practiceSummaryKey())}catch{}
    clearTestTimer();showRLResult(correctCount,total,b,rows)
  }catch(e){
    window.__eitSubmitting=false;
    startTimer(Number(TEST.durationMinutes|| (TEST.skill==='reading'?60:40))*60);
    alert('Unable to submit: '+(e?.message||'Unknown error')+'\n\nPlease try again.')
  }
}
async function blobToDataURL(blob){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function getInlineImage(url){try{const u=String(url||'');if(!u)return '';const r=await fetch(u);if(!r.ok)return '';return await blobToDataURL(await r.blob())}catch{return ''}}
function isHsk79WritingTest(){
  if(String(TEST?.skill||'').toLowerCase()!=='writing')return false;
  const volume=Number(TEST?.volume||0);
  const title=[TEST?.title,TEST?.seriesLabel,TEST?.displayTestLabel,TEST?.questionType].filter(Boolean).join(' ');
  return (volume>=7&&volume<=9)||/\bHSK\s*(?:7|8|9)(?:\s*[-–]\s*9)?\b/i.test(title)||/^HSK[789]/i.test(String(TEST?.id||''));
}
async function saveSubmission(extra){
  const payload={testId:TEST.id,testTitle:TEST.title,skill:TEST.skill,answers:extra.answers,total:extra.total,score:extra.score,autoSubmitted:!!extra.autoSubmitted,elapsedSeconds:Number(extra.elapsedSeconds||0)};
  if(TEST.skill==='writing'&&isHSK5Imported()){
    payload.hsk5Mode=true;
  }else if(TEST.skill==='writing'){
    const qs=TEST.content?.questions||[];
    if(isHsk79WritingTest()){
      payload.hskMode=true;
      payload.volume=Number(TEST.volume)||7;
      payload.tasks=qs.map((q,i)=>({number:String(q.number??i+1),task:String(q.task||q.type||'writing'),text:String(q.text||q.prompt||q.question||''),sourceText:String(q.sourceText||q.source||q.originalText||''),direction:String(q.direction||''),min:Number(q.minLength||q.min||0),max:Number(q.maxLength||q.max||0)}));
    }else{
      const q1=qs.find(q=>+q.number===1)||{};const q2=qs.find(q=>+q.number===2)||{};
      const [img1,img2]=await Promise.all([getInlineImage(q1.imageUrl),getInlineImage(q2.imageUrl)]);
      payload.task1Prompt=String(q1.text||'');payload.task2Prompt=String(q2.text||'');payload.taskImages={task1:img1,task2:img2};
    }
  }
  if(TEST.skill==='speaking' && Array.isArray(extra.audioRecordings)){payload.answers={recordings:extra.audioRecordings};}
  const r=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(payload)});const text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch{d={message:text||'Invalid server response'}}if(!r.ok||!d.ok)throw Error(d.message||`Submit failed (HTTP ${r.status})`);return d;
}
function bandTable(current){return `<div class="band-table-wrap"><div class="band-table-title">BẢNG QUY ĐỔI ACADEMIC</div><table><thead><tr><th>Số câu đúng</th><th>Band Score</th></tr></thead><tbody>${BAND.map(r=>`<tr class="${current>=r[0]&&current<=r[1]?'active':''}"><td>${r[0]} – ${r[1]}</td><td>${r[2].toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`}

function reviewGroups(rows){
 const skill=(TEST.skill||'').toLowerCase();
 const readingUnits=(TEST.content?.questions||[]).map(q=>Number(q.passage||q.section||q.unit||q.part||1)).filter(n=>Number.isFinite(n)&&n>0);
 const count=skill==='reading'?Math.max(3,...readingUnits):4;
 const groups=[];
 for(let i=1;i<=count;i++){
   const key=skill==='reading'?'passage':'section';
   const items=rows.filter(r=>Number((TEST.content?.questions||[]).find(q=>Number(q.number)===Number(r.n))?.[key]||1)===i);
   if(items.length) groups.push({index:i,label:`${key==='passage'?'PASSAGE':'SECTION'} ${i}`,items});
 }
 if(!groups.length) groups.push({index:1,label:skill==='reading'?'PASSAGE 1':'SECTION 1',items:rows});
 return groups;
}

function showRLResult(c,total,b,rows){
  const payload={testId:TEST.id,rows};
  sessionStorage.setItem('eitPracticeResult',JSON.stringify(payload));
  location.href='practice-result.html';
}

function scrollToReview(){document.getElementById('reviewArea')?.scrollIntoView({behavior:'smooth',block:'start'})}
function openReview(groupIndex,itemIndex){
 const st=window.__eitReview;st.detailGroup=groupIndex;st.detailIndex=itemIndex;
 const g=st.groups[groupIndex]; const r=g.items[itemIndex];
 const left=TEST.skill==='reading'?`PASSAGE ${g.index}`:`SECTION ${g.index}`;
 const detail=document.getElementById('reviewDetail');
 detail.classList.remove('hidden');
 detail.innerHTML=`<div class="detail-panel"><div class="detail-top"><div><div class="result-kicker">${left}</div><h2>Question ${esc(r.n)}</h2></div><button class="close-detail" onclick="closeReview()">×</button></div><div class="detail-progress"><div class="detail-tabs">${st.groups.map((x,i)=>`<button class="${i===groupIndex?'active':''}" onclick="openReview(${i},0)">${x.label}</button>`).join('')}</div><div class="detail-qnav">${g.items.map((x,i)=>`<button class="${i===itemIndex?'active':''} ${x.ok?'ok':'bad'}" onclick="openReview(${groupIndex},${i})">${x.n}</button>`).join('')}</div></div><div class="answer-compare"><div class="answer-box ${r.ok?'good':'wrong'}"><span>Your answer</span><strong>${esc(r.a||'—')}</strong></div><div class="answer-box correct"><span>Correct answer</span><strong>${esc(r.key||'—')}</strong></div></div>${r.exp?`<div class="explanation-card"><div class="explanation-tag">? Explanation</div><p><strong>${esc(r.key||'Answer')}:</strong> ${esc(r.exp)}</p></div>`:`<div class="explanation-card empty-exp"><div class="explanation-tag">? Explanation</div><p>Explanation has not been added for this question yet.</p></div>`}<div class="detail-actions"><button class="secondary-detail" onclick="closeReview()">← Danh sách câu hỏi</button><div><button class="secondary-detail" onclick="prevReview()">← Câu trước</button><button class="primary-detail" onclick="nextReview()">Câu tiếp theo →</button></div></div></div>`;
 detail.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeReview(){document.getElementById('reviewDetail')?.classList.add('hidden')}
function prevReview(){const st=window.__eitReview;const g=st.groups[st.detailGroup];openReview(st.detailGroup,Math.max(0,st.detailIndex-1))}
function nextReview(){const st=window.__eitReview;const g=st.groups[st.detailGroup];if(st.detailIndex<g.items.length-1)return openReview(st.detailGroup,st.detailIndex+1);if(st.detailGroup<st.groups.length-1)return openReview(st.detailGroup+1,0);scrollToReview()}
function renderHSK5Writing(){
 const qs=TEST.content?.questions||[];const code=TEST.displayTestLabel||TEST.testNo;
 const taskHtml=qs.map(q=>{
   const n=Number(q.number),text=esc(q.text||'');
   if(n>=91&&n<=98)return `<article class="hsk5-writing-card"><div class="hsk5-writing-kicker">QUESTION ${n} · 完成句子</div><h2>请将下面的词语组成正确的句子。</h2><div class="hsk5-word-bank">${text}</div><input class="hsk5-sentence-input" type="text" data-write-q="${n}" value="${esc(writingAnswers[n]||'')}" placeholder="在这里写出完整句子……" autocomplete="off"></article>`;
   if(n===99)return `<article class="hsk5-writing-card"><div class="hsk5-writing-kicker">QUESTION 99 · 短文写作</div><h2>${text}</h2><p class="hsk5-writing-help">请尽量使用以下所有词语，写一篇约80字的短文。</p><div class="hsk5-vocab-list">${(q.vocab||[]).map(v=>`<span>${esc(v)}</span>`).join('')}</div><textarea class="hsk5-short-write" data-write-q="99" id="hsk5-write-99" placeholder="请在这里写短文……">${esc(writingAnswers[99]||'')}</textarea><div class="hsk5-char-count" id="hsk5-count-99">${Array.from(String(writingAnswers[99]||'').replace(/\s/g,'')).length} 字</div></article>`;
   if(n===100)return `<article class="hsk5-writing-card"><div class="hsk5-writing-kicker">QUESTION 100 · 看图写作</div><h2>${text}</h2>${q.imageUrl?`<img class="hsk5-picture-prompt" src="${esc(q.imageUrl)}" alt="HSK5 写作图片">`:''}<textarea class="hsk5-short-write" data-write-q="100" id="hsk5-write-100" placeholder="请观察图片并写一篇约80字的短文……">${esc(writingAnswers[100]||'')}</textarea><div class="hsk5-char-count" id="hsk5-count-100">${Array.from(String(writingAnswers[100]||'').replace(/\s/g,'')).length} 字</div></article>`;
   return '';
 }).join('');
 document.body.innerHTML=head(`WRITING · ${testSeriesLabel(TEST)} · TEST ${esc(code)}`,'HSK5 Writing · 10 tasks','40:00')+`<div class="module-shell hsk5-writing-shell"><main class="hsk5-writing-scroll"><div class="hsk5-writing-list"><div class="hsk5-writing-intro"><h1>HSK（五级）书写 · ${esc(code)}</h1><p>第91–98题：完成句子；第99–100题：写短文。听力音频不会影响本部分。</p></div>${taskHtml}</div></main><footer class="question-nav-bottom"><span style="font-weight:900">HSK5 Writing</span><span id="hsk5-writing-progress" style="color:#667085">0/10 已填写</span><button class="bottom-submit" id="submitBtn" title="Nộp bài" aria-label="Nộp bài"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button></footer></div>`;
 const sync=()=>{
   document.querySelectorAll('[data-write-q]').forEach(el=>{writingAnswers[el.dataset.writeQ]=el.value});
   [99,100].forEach(n=>{const ta=document.querySelector(`[data-write-q="${n}"]`),cnt=$(`#hsk5-count-${n}`);if(ta&&cnt)cnt.textContent=Array.from(ta.value.replace(/\s/g,'')).length+' 字'});
   const filled=qs.filter(q=>String(writingAnswers[q.number]||'').trim()).length;const prog=$('#hsk5-writing-progress');if(prog)prog.textContent=`${filled}/10 已填写`;
 };
 document.querySelectorAll('[data-write-q]').forEach(el=>el.addEventListener('input',sync));
 $('#submitBtn').onclick=()=>openSubmitConfirm(false);sync();startTimer(Number(TEST.durationMinutes||40)*60);
}
async function submitHSK5Writing(auto=false){
 const btn=$('#submitBtn');
 try{
   document.querySelectorAll('[data-write-q]').forEach(el=>{writingAnswers[el.dataset.writeQ]=el.value});
   if(btn){btn.disabled=true;btn.classList.add('is-loading')}
   const elapsed=Math.max(0,(Number(TEST.durationMinutes||40)*60)-Number(seconds||0));
   const d=await saveSubmission({answers:writingAnswers,total:10,score:null,autoSubmitted:!!auto,elapsedSeconds:elapsed,hsk5Mode:true});
   clearTestTimer();alert('Đã lưu bài HSK5 Writing. Câu 91–98 được lưu để đối chiếu đáp án; câu 99–100 cần giáo viên đánh giá.');
   location.href='practice.html?skill=writing&volume=5';
 }catch(e){window.__eitSubmitting=false;if(btn){btn.disabled=false;btn.classList.remove('is-loading')}startTimer(Number(TEST.durationMinutes||40)*60);alert('Không thể lưu bài: '+(e?.message||'Lỗi không xác định'))}
}
function renderWriting(){const qs=TEST.content?.questions||[];document.body.innerHTML=head(`${TEST.skill.toUpperCase()} · ${testSeriesLabel(TEST)} · TEST ${esc(TEST.displayTestLabel||TEST.testNo)}`,'time remaining','60:00')+`<div class="module-shell"><main class="module-body writing-body"><section class="writing-pane" id="writingPrompt"></section><section class="writing-right"><div class="answer-toolbar"><div class="task-switch">${qs.map(q=>`<button class="prompt-tab ${+q.number===1?'active':''}" data-task="${q.number}">${esc(q.task||'Task '+q.number)}</button>`).join('')}</div><div class="wordcount" id="wordCount">0 words</div></div><textarea class="essay" id="essay" placeholder="Write your answer here..."></textarea></section></main><footer class="question-nav-bottom"><span style="font-weight:900">Writing</span><span style="color:#667085">Task 1 · Task 2</span><button class="bottom-submit" id="submitWriting" title="Submit & AI Grade" aria-label="Submit & AI Grade Writing"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button></footer></div>`;function draw(){const q=qs.find(x=>+x.number===activeTask)||qs[0];$('#writingPrompt').innerHTML=`<div class="part-kicker">WRITING ${esc(q.task||'TASK')}</div><h1 class="pane-title">${esc(q.task||'Task')}</h1><div class="task-prompt">${q.imageUrl?`<img src="${esc(q.imageUrl)}" style="max-width:100%;border-radius:12px;margin-bottom:14px" alt="Task image">`:''}<p>${esc(q.text)}</p><p><b>Write at least ${q.min||150} words.</b></p></div><div class="scratch-title">Scratch pad</div><textarea class="scratch" id="scratch" placeholder="Use this area to plan your ideas..."></textarea>`;$('#essay').value=writingAnswers[q.number]||'';count();$('#scratch').value=localStorage.getItem('practiceScratch'+TEST.id+q.number)||'';$('#scratch').oninput=e=>localStorage.setItem('practiceScratch'+TEST.id+q.number,e.target.value);document.querySelectorAll('[data-task]').forEach(b=>b.classList.toggle('active',+b.dataset.task===activeTask))}function count(){const n=$('#essay').value.trim().split(/\s+/).filter(Boolean).length;$('#wordCount').textContent=n+' words'}$('#essay').oninput=()=>{writingAnswers[activeTask]=$('#essay').value;count()};document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{writingAnswers[activeTask]=$('#essay').value;activeTask=+b.dataset.task;draw()});$('#submitWriting').onclick=()=>openSubmitConfirm(false);draw();startTimer(3600)}
async function submitWriting(){const btn=$('#submitWriting');try{clearInterval(timer);if(btn){btn.disabled=true;btn.classList.add('is-loading');btn.setAttribute('aria-busy','true')}showAIGradingLoader('Writing');writingAnswers[activeTask]=$('#essay')?.value||writingAnswers[activeTask]||'';const status=await fetch('/api/ai/status',{headers:authHeaders(),cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.message||'AI service is unavailable.');return d});if(!status.configured)throw Error('AI Writing chưa được cấu hình trên server. Hãy kiểm tra Environment Variables và triển khai lại.');const d=await saveSubmission({answers:writingAnswers,total:(TEST.content?.questions||[]).length||2,score:null,autoSubmitted:false});if(!d.ai?.available)throw Error(d.ai?.error||'Bài đã nộp nhưng AI chưa thể trả kết quả.');clearTestTimer();const resultPage=isHsk79WritingTest()?'ai-result.html':'writing-result.html';location.href=resultPage+'?id='+encodeURIComponent(d.id)}catch(e){hideAIGradingLoader();window.__eitSubmitting=false;if(btn){btn.disabled=false;btn.classList.remove('is-loading');btn.removeAttribute('aria-busy')}startTimer(3600);alert('Không thể chấm bài: '+(e?.message||'Lỗi không xác định')+'\n\nBài làm đã được lưu nếu máy chủ đã nhận yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị viên.')}}
function renderSpeaking(){const qs=TEST.content?.questions||[];document.body.innerHTML=head(`${TEST.skill.toUpperCase()} · ${testSeriesLabel(TEST)} · TEST ${esc(TEST.displayTestLabel||TEST.testNo)}`,'test session','15:00')+`<div class="module-shell"><main class="speaking-body"><aside class="speaking-side"><button class="part-btn active" data-part="1">Part 1 · Introduction</button><button class="part-btn" data-part="2">Part 2 · Long Turn</button><button class="part-btn" data-part="3">Part 3 · Discussion</button></aside><section class="speaking-main" id="speakingMain"></section></main><footer class="question-nav-bottom"><span style="font-weight:900">Speaking</span><span style="color:#667085">Part 1 · Part 2 · Part 3</span><button class="bottom-submit" id="submitSpeaking" title="Submit & AI Grade" aria-label="Submit & AI Grade Speaking"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 8-10"/></svg></button></footer></div>`;document.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>{if(prepTimer)clearInterval(prepTimer);prepTimer=null;activePart=+b.dataset.part;document.querySelectorAll('[data-part]').forEach(x=>x.classList.toggle('active',+x.dataset.part===activePart));drawSpeak()});$('#submitSpeaking').onclick=()=>openSubmitConfirm(false);drawSpeak();startTimer(900)}
let prepTimer=null;function drawSpeak(){if(prepTimer)clearInterval(prepTimer);const qs=(TEST.content?.questions||[]).filter(q=>+q.part===activePart);$('#speakingMain').innerHTML=qs.map((q)=>`<article class="record-panel"><div class="part-kicker">QUESTION ${esc(q.number)}</div><h2 class="speak-question">${esc(q.text)}</h2>${q.prep?`<div class="prep-box"><b>Preparation time</b><div class="prep-clock" id="prep-${q.number}">${Math.floor((q.prep||0)/60).toString().padStart(2,'0')}:${String((q.prep||0)%60).padStart(2,'0')}</div><p id="prep-text-${q.number}">Prepare your ideas and make brief notes. Speaking starts after preparation.</p></div>`:''}<div class="record-status" id="status-${q.number}">${q.prep?'Preparation in progress…':'Ready to record'} · ${q.limit||30}s maximum</div><div class="speak-clock" id="clock-${q.number}">00:${String(q.limit||30).padStart(2,'0')}</div><div class="record-actions"><button class="record-btn primary" data-rec="${q.number}" ${q.prep?'disabled':''}>Start recording</button></div><div id="recording-${q.number}" class="recordings"></div></article>`).join('');document.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>record(+b.dataset.rec));const prepQ=activePart===2?qs.find(q=>q.prep):null;if(prepQ){let left=Math.max(0,Number(prepQ.prep)||120);const tick=()=>{const el=$('#prep-'+prepQ.number);if(el)el.textContent=format(left);if(left<=0){clearInterval(prepTimer);prepTimer=null;const st=$('#status-'+prepQ.number);if(st)st.textContent=`Ready to record · ${prepQ.limit||30}s maximum`;const b=document.querySelector(`[data-rec="${prepQ.number}"]`);if(b)b.disabled=false;const txt=$('#prep-text-'+prepQ.number);if(txt)txt.textContent='Preparation complete. You can start speaking now.';return}left--;};tick();prepTimer=setInterval(tick,1000)}}
function record(n){const q=TEST.content.questions.find(x=>+x.number===n);if(!navigator.mediaDevices?.getUserMedia)return alert('Microphone access is required.');const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;let recognition=null,transcript='';if(SpeechRecognition){try{recognition=new SpeechRecognition();recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;recognition.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript+' ';transcript=t.trim()};recognition.onerror=()=>{};recognition.start()}catch{recognition=null}}navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{recChunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>e.data.size&&recChunks.push(e.data);recorder.onstop=()=>{if(recognition){try{recognition.stop()}catch{}}const blob=new Blob(recChunks,{type:'audio/webm'});const url=URL.createObjectURL(blob);recordings.push({question:n,url,mime:blob.type,transcript});const box=$('#recording-'+n);box.innerHTML=`<div class="recording"><span>Recording saved${transcript?' · transcript captured':''}</span><audio controls src="${url}"></audio></div>`;stream.getTracks().forEach(t=>t.stop())};recorder.start();let s=q.limit||30;const clock=$('#clock-'+n);const status=$('#status-'+n);status.textContent='Recording...';const int=setInterval(()=>{s--;clock.textContent='00:'+String(Math.max(0,s)).padStart(2,'0');if(s<=0){clearInterval(int);if(recorder.state!=='inactive')recorder.stop();status.textContent='Recording saved.'}},1000)}).catch(()=>{if(recognition){try{recognition.stop()}catch{}}alert('Microphone access is required to record your answer.')})}
async function submitSpeaking(){const btn=$('#submitSpeaking');try{clearInterval(timer);if(btn){btn.disabled=true;btn.classList.add('is-loading');btn.setAttribute('aria-busy','true')}showAIGradingLoader('Speaking');const status=await fetch('/api/ai/status',{headers:authHeaders(),cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.message||'AI service is unavailable.');return d});if(!status.configured)throw Error('AI Speaking chưa được cấu hình trên server. Hãy kiểm tra cấu hình dịch vụ AI trên máy chủ và triển khai lại.');const serial=[];for(const r of recordings){const res=await fetch(r.url);const blob=await res.blob();serial.push({part:Number(r.part)||Number(TEST.content?.questions?.find(q=>+q.number===Number(r.question))?.part)||1,question:String(TEST.content?.questions?.find(q=>+q.number===Number(r.question))?.text||''),recorded:true,mime:blob.type||r.mime||'audio/webm',audio:await blobToDataURL(blob),transcript:String(r.transcript||'')});}if(!serial.length)throw Error('Please record at least one Speaking answer before submitting.');const d=await saveSubmission({answers:{recordings:serial},audioRecordings:serial,total:qsCount(),score:null,autoSubmitted:false});if(!d.ai?.available)throw Error((d.ai?.error?('Bài đã nộp nhưng AI Speaking chưa trả điểm: '+d.ai.error):'Bài đã nộp nhưng AI Speaking chưa trả điểm.'));clearTestTimer();location.href='speaking-result.html?id='+encodeURIComponent(d.id)}catch(e){hideAIGradingLoader();window.__eitSubmitting=false;if(btn){btn.disabled=false;btn.classList.remove('is-loading');btn.removeAttribute('aria-busy')}startTimer(900);alert('Unable to submit: '+(e?.message||'Unknown error')+'\n\nPlease try again.')}}function qsCount(){return TEST.content?.questions?.length||0}
load()
function testSeriesLabel(t){if(t?.seriesLabel)return String(t.seriesLabel);return (t.skill==='writing'||t.skill==='speaking')?`Practice Test ${t.volume}`:`VOL ${t.volume}`};