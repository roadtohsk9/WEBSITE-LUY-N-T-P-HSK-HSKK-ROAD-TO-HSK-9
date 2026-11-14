(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'eit_hsk6_mock_state_v1';
  const STAGES = [
    {key:'listening',label:'Listening · 听力',short:'LISTENING',title:'Listening · 听力',desc:'Nghe audio và trả lời câu hỏi trong thời gian quy định.'},
    {key:'reading',label:'Reading · 阅读',short:'READING',title:'Reading · 阅读',desc:'Đọc nội dung và hoàn thành các câu hỏi.'},
    {key:'writing',label:'Writing · 写作',short:'WRITING',title:'Writing · 写作',desc:'Hoàn thành các nhiệm vụ viết. Nội dung được lưu để giáo viên xem lại.'},
    {key:'speaking',label:'HSKK Cao cấp · 高级口语',short:'HSKK',title:'HSKK Cao cấp · 高级口语',desc:'Thực hiện phần thi nói và ghi âm câu trả lời bằng microphone.'}
  ];
  let user = readUser(), examList = [], exam = null, stageIndex = -1, answers = {}, minuteSettings = {}, timerId = null, transitionId = null, resumeState = null;
  let stageTotal = 1, deadline = 0, currentVolume = 0.8, fontSize = 18, mediaRecorder = null, recordedChunks = [], recordingBlob = null, recordingUrl = '', recordingStream = null, submitted = false;
  const parse = value => { if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } } return value || {}; };
  function readUser(){ try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; } }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function authHeaders(){ return user?.token ? {Authorization:'Bearer '+user.token} : {}; }
  function saveState(){ try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({examId:exam?.id,stageIndex,answers,deadline,minuteSettings,candidateName:$('candidateName')?.value||'',candidateCode:$('candidateCode')?.value||'',fontSize,currentVolume})); } catch {} }
  function loadState(){ try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'); } catch { return null; } }
  function setFontSize(next){fontSize=Math.max(14,Math.min(25,next));document.documentElement.style.setProperty('--paper-font',fontSize+'px');$('fontValue').textContent=fontSize+' px';}
  function setVolume(next){currentVolume=Math.max(0,Math.min(1,next));$('volumeValue').textContent=Math.round(currentVolume*100)+'%';if($('volumeControl'))$('volumeControl').value=Math.round(currentVolume*100);if($('examVolume'))$('examVolume').value=Math.round(currentVolume*100);document.querySelectorAll('#stagePaper audio').forEach(a=>a.volume=currentVolume);}
  function updateSetupButton(){ $('startMock').disabled = !($('readyCheck').checked && $('examSelect').value && $('candidateName').value.trim() && $('candidateCode').value.trim()); }
  async function api(url,options={}){const response=await fetch(url,{...options,headers:{...authHeaders(),...(options.headers||{})}});let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.message||'Không thể kết nối máy chủ.');return data;}
  async function loadExams(){
    if(!user?.token){localStorage.setItem('loginRedirect',location.pathname+location.search);location.replace('/login.html');return;}
    $('loginIdentity').textContent=`Đã đăng nhập: ${user.username||user.registrationid||user.eitcode||'Học viên'} · ${user.email||''}`;
    $('candidateName').value=user.fullname||user.full_name||'';$('candidateCode').value=user.username||user.registrationid||user.eitcode||'';
    const data=await api('/api/mock-exams');examList=data.exams||[];
    $('examSelect').innerHTML='<option value="">— Chọn bộ đề thi thử —</option>'+examList.map(x=>{const m=parse(x.section_minutes||x.sectionMinutes);return `<option value="${esc(x.id)}">${esc(x.title)} · Nghe ${Number(m.listening||35)}′ / Đọc ${Number(m.reading||50)}′ / Viết ${Number(m.writing||45)}′ / HSKK ${Number(m.hskk||25)}′</option>`}).join('');
    if(!examList.length)$('setupMessage').textContent='Admin chưa xuất bản bộ thi thử HSK 6 nào.';
    const stored=loadState();
    if(stored && examList.some(x=>x.id===stored.examId)){
      resumeState=stored;$('examSelect').value=stored.examId;const resumedExam=examList.find(x=>x.id===stored.examId);$('selectedExamDescription').textContent=resumedExam?.description||'Phiên thi trước được lưu trong trình duyệt này.';$('candidateName').value=stored.candidateName||$('candidateName').value;$('candidateCode').value=stored.candidateCode||$('candidateCode').value;
      setFontSize(Number(stored.fontSize||18));setVolume(Number(stored.currentVolume??.8));
      $('setupMessage').textContent='Đã tìm thấy phiên thi chưa hoàn thành. Câu trả lời và đồng hồ sẽ được khôi phục; bản ghi âm đang thực hiện sẽ không thể khôi phục nếu trang bị tải lại.';
      $('readyCheck').checked=true;
    }
    updateSetupButton();
  }
  function extractQuestions(content){
    if(Array.isArray(content?.questions)&&content.questions.length)return content.questions;
    const out=[];const visit=(node,section='')=>{if(!node)return;if(Array.isArray(node)){node.forEach(v=>visit(v,section));return;}if(typeof node!=='object')return;const isQ=('question'in node||'prompt'in node||'questionText'in node||'options'in node||'choices'in node)&&('number'in node||'id'in node||'question'in node||'prompt'in node||'questionText'in node);if(isQ){out.push({...node,_section:section});return;}const label=node.title||node.name||node.heading||section;['questions','items','parts','sections','groups','passages'].forEach(k=>{if(node[k])visit(node[k],label||k)});};visit(content);return out;
  }
  function questionText(q){return q.questionText||q.question||q.prompt||q.text||q.statement||q.title||'Câu hỏi';}
  function questionOptions(q){const raw=q.options||q.choices||q.answers;if(Array.isArray(raw)&&raw.length)return raw.map((x,i)=>typeof x==='object'?{value:x.value??x.id??x.label??String(i),label:x.text??x.label??x.content??x.value??JSON.stringify(x),image:x.image||''}:{value:String(x),label:String(x)});if(raw&&typeof raw==='object')return Object.entries(raw).map(([value,label])=>({value,label:String(label)}));const t=String(q.type||'').toUpperCase();if(t==='TRUE/FALSE')return [{value:'TRUE',label:'TRUE'},{value:'FALSE',label:'FALSE'}];if(t==='TRUE/FALSE/NOT GIVEN')return ['TRUE','FALSE','NOT GIVEN'].map(x=>({value:x,label:x}));if(t==='YES/NO/NOT GIVEN')return ['YES','NO','NOT GIVEN'].map(x=>({value:x,label:x}));return [];}
  function richText(raw){const box=document.createElement('div');box.innerHTML=String(raw||'');box.querySelectorAll('script,style,iframe,object,embed,form,input,button').forEach(x=>x.remove());box.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(/^on/i.test(a.name)||(/href|src/i.test(a.name)&&/^\s*javascript:/i.test(a.value)))el.removeAttribute(a.name)}));return box.innerHTML;}
  function keyFor(stageKey,q,index){return `${stageKey}:${q.number??index+1}`;}
  function renderQuestion(q,index,stageKey){
    const key=keyFor(stageKey,q,index),value=answers[key]??'',opts=questionOptions(q),text=questionText(q);let control='';
    if(stageKey==='writing'){
      const image=q.imageUrl||q.image||'',isHsk6=Number(exam.tests.writing?.volume)===6;control=`${image?`<img class="prompt-image" src="${esc(image)}" alt="Writing prompt">`:''}<textarea class="answer-area" data-answer="${esc(key)}" placeholder="${isHsk6?'请在此输入中文缩写…':'Nhập câu trả lời của bạn…'}">${esc(value)}</textarea><div class="word-count" data-word-count="${esc(key)}">${isHsk6?`${Array.from(value).length} 字${q.min?` · 目标约 ${Number(q.min)} 字`:''}`:`${wordCount(value)} từ${q.min?` · tối thiểu ${Number(q.min)} từ`:''}`}</div>`;
    } else if(stageKey==='speaking') {
      control=`<div class="task-timing">Thời gian chuẩn bị: ${Number(q.prep||0)} giây · Thời gian trả lời gợi ý: ${Number(q.limit||60)} giây</div>`;
    } else if(opts.length){
      control=opts.map(o=>`<label class="exam-option"><input type="radio" name="${esc(key)}" data-answer="${esc(key)}" value="${esc(o.value)}" ${String(value)===String(o.value)?'checked':''}><span>${o.image?`<img src="${esc(o.image)}" alt="Option image">`:''}${esc(o.label)}</span></label>`).join('');
    } else {
      control=`<input class="answer-input" data-answer="${esc(key)}" value="${esc(value)}" placeholder="Nhập câu trả lời…">`;
    }
    return `<article class="exam-question" id="question-${esc(key)}"><div class="question-title">${esc(q.number??index+1)}. ${esc(text)}</div>${q.imageUrl&&stageKey!=='writing'?`<img class="question-image" src="${esc(q.imageUrl)}" alt="Question image">`:''}${control}</article>`;
  }
  function renderUnitContent(c,stageKey){
    const units=Array.isArray(c.passages)?c.passages:(Array.isArray(c.sections)?c.sections:[]);if(!units.length)return '';
    const titles=Array.isArray(c.passageTitles)?c.passageTitles:(Array.isArray(c.sectionTitles)?c.sectionTitles:[]),images=Array.isArray(c.unitImages)?c.unitImages:[];
    return units.map((unit,i)=>{const img=images.find(x=>Number(x.unit)===i+1)?.url||'';return `<section class="unit-panel"><h3>${esc(titles[i]||`${stageKey==='reading'?'PASSAGE':'SECTION'} ${i+1}`)}</h3><div class="unit-text">${richText(unit)}</div>${img?`<img class="unit-image" src="${esc(img)}" alt="Unit illustration">`:''}</section>`}).join('');
  }
  function renderStagePaper(stageKey){
    const test=exam.tests[stageKey],c=parse(test.content),questions=extractQuestions(c),groups=Array.isArray(c.question_groups)?c.question_groups:[];let html='';
    if(c.instructions||c.description||c.intro)html+=`<p class="instructions">${esc(c.instructions||c.description||c.intro)}</p>`;
    if(test.audioUrl||c.audioUrl)html+=`<div class="audio-box"><b>${stageKey==='speaking'?'Audio đề HSKK':'Audio Listening'}</b><audio controls preload="metadata" src="${esc(test.audioUrl||c.audioUrl)}"></audio></div>`;
    if(stageKey==='writing'){
      if(Number(test.volume)===6&&c.writingSourceText)html+=`<section class="unit-panel writing-source-panel"><h3>阅读材料 · VĂN BẢN NGUỒN</h3><div class="unit-text">${richText(c.writingSourceText)}</div></section>`;
      html+=questions.map((q,i)=>`<section class="hsk-writing-task"><h3>${Number(test.volume)===6?'缩写任务 · HSK 6 WRITING':esc(q.task||`Writing ${i+1}`)}</h3>${renderQuestion(q,i,stageKey)}</section>`).join('')||'<div class="muted">Đề Writing chưa có câu hỏi.</div>';
    } else if(stageKey==='speaking'){
      html+=questions.map((q,i)=>`<section class="hskk-task"><h3>PHẦN ${Number(q.part||i+1)} · CÂU ${i+1}</h3>${renderQuestion(q,i,stageKey)}</section>`).join('')||'<div class="muted">Đề HSKK chưa có câu hỏi.</div>';
      html+='<p class="instructions">Hãy sử dụng phần ghi âm bên dưới để thu lại toàn bộ câu trả lời của bạn. Đảm bảo micro hoạt động trước khi bắt đầu nói.</p>';
    } else {
      html+=renderUnitContent(c,stageKey);
      const rendered=new Set();
      if(groups.length){
        groups.forEach((g,gi)=>{
          const groupQs=Array.isArray(g.questions)&&g.questions.length?g.questions:questions.filter(q=>Number(q.number)>=Number(g.start||0)&&Number(q.number)<=Number(g.end||99999));
          if(!groupQs.length)return;
          html+=`<div class="group-head"><b>${esc(g.title||`Questions ${g.start||''}–${g.end||''}`)}</b><small>${esc(g.instruction||'')}</small></div>`;
          groupQs.forEach(q=>{const idx=questions.findIndex(x=>String(x.number)===String(q.number));const n=idx>=0?idx:rendered.size;html+=renderQuestion(q,n,stageKey);rendered.add(String(q.number));});
        });
      }
      questions.forEach((q,i)=>{if(!rendered.has(String(q.number)))html+=renderQuestion(q,i,stageKey)});
      if(!questions.length)html+='<div class="muted">Đề chưa có câu hỏi. Admin vui lòng kiểm tra lại nội dung đề.</div>';
    }
    $('stagePaper').innerHTML=html;
    $('stagePaper').classList.remove('swap');void $('stagePaper').offsetWidth;$('stagePaper').classList.add('swap');
    $('stagePaper').querySelectorAll('[data-answer]').forEach(el=>{
      const event=el.type==='radio'?'change':'input';el.addEventListener(event,()=>{answers[el.dataset.answer]=el.value;if(el.tagName==='TEXTAREA'){const box=document.querySelector(`[data-word-count="${CSS.escape(el.dataset.answer)}"]`);if(box){if(Number(exam.tests.writing?.volume)===6){const q=extractQuestions(parse(exam.tests.writing.content))[0]||{};box.textContent=`${Array.from(el.value).length} 字${q.min?` · 目标约 ${Number(q.min)} 字`:''}`;}else box.textContent=`${wordCount(el.value)} từ`;}}saveState();updateProgress();});
    });
    setVolume(currentVolume);
    if(stageKey==='speaking')$('recordingPanel').classList.remove('hidden');else $('recordingPanel').classList.add('hidden');
  }
  function wordCount(s){return String(s||'').trim()?String(s).trim().split(/\s+/).length:0;}
  function buildStageStrip(){ $('stageStrip').innerHTML=STAGES.map((s,i)=>`<div class="stage-chip ${i===stageIndex?'active':i<stageIndex?'done':''}"><b>${i<stageIndex?'✓':i+1}</b><span>${s.short}<br><small>${s.label.split('·')[1]||''}</small></span></div>`).join(''); }
  function updateProgress(){const all=Object.keys(answers).filter(k=>String(answers[k]||'').trim()).length;$('answeredCount').textContent=`${all} câu / ý đã nhập`;const p=((stageIndex+1)/4)*100;$('overallProgress').style.width=p+'%';$('sideProgress').textContent=`Phần ${stageIndex+1} / 4`;}
  function startStage(index,resume=false){
    clearInterval(timerId);clearTimeout(transitionId);stageIndex=index;const stage=STAGES[index],test=exam.tests[stage.key];
    $('examPanel').classList.remove('hidden');$('setupPanel').classList.add('hidden');$('finishPanel').classList.add('hidden');$('headerStage').textContent=`${index+1} / 4 · ${stage.short}`;
    $('stageEyebrow').textContent=`PART ${index+1} / 4 · HSK 6 MOCK EXAM`;$('stageTitle').textContent=stage.title;$('stageDescription').textContent=stage.desc;
    $('sideCandidate').textContent=$('candidateName').value.trim();$('sideCode').textContent=$('candidateCode').value.trim();buildStageStrip();renderStagePaper(stage.key);updateProgress();
    $('lockedNotice').classList.add('hidden');
    if(index===3&&!submitted){$('recordStart').disabled=false;$('recordStop').disabled=true;$('recordingPreview').classList.add('hidden');$('recordingStatus').textContent='Bấm “Bắt đầu ghi âm” và trả lời vào microphone. Có thể nghe lại bản ghi trước khi hết giờ.';}
    const duration=Math.max(1,Number(minuteSettings[stage.key]||test.durationMinutes||30))*60;stageTotal=duration;
    if(!resume||!deadline)deadline=Date.now()+duration*1000;else if(deadline<Date.now())deadline=Date.now();
    saveState();tick();timerId=setInterval(tick,250);try{window.scrollTo({top:0,behavior:'smooth'})}catch{}
  }
  function tick(){const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));const value=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;$('stageTimer').textContent=value;$('headerTimer').textContent=value;const clock=$('stageTimer').parentElement;clock.style.setProperty('--pct',Math.max(0,Math.min(100,left/stageTotal*100)).toFixed(2)+'%');clock.classList.toggle('is-urgent',left>0&&left<=300&&left>60);clock.classList.toggle('is-critical',left>0&&left<=60);$('headerTimer').classList.toggle('is-urgent',left>0&&left<=300&&left>60);$('headerTimer').classList.toggle('is-critical',left>0&&left<=60);if(left<=0){clearInterval(timerId);endStage();}}
  function lockStage(){ $('stagePaper').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);$('recordStart').disabled=true;$('recordStop').disabled=true;$('lockedNotice').classList.remove('hidden');if(mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop(); }
  function endStage(){lockStage();const isLast=stageIndex===STAGES.length-1;if(isLast){transitionId=setTimeout(()=>finishExam(),2200);return;}$('headerStage').textContent='ĐÃ HẾT GIỜ';transitionId=setTimeout(()=>{deadline=0;startStage(stageIndex+1,false);},2200);}
  async function beginExam(){
    const id=$('examSelect').value;if(!id)return;
    $('startMock').disabled=true;$('setupMessage').textContent='Đang tải đề thi và kiểm tra quyền truy cập…';
    try{
      const data=await api('/api/mock-exams/'+encodeURIComponent(id));exam=data.exam;minuteSettings=parse(exam.sectionMinutes);recordingBlob=null;recordingUrl='';submitted=false;
      $('lockedNotice').classList.add('hidden');$('recordingPreview').classList.add('hidden');
      const saved=resumeState&&resumeState.examId===id?resumeState:null;
      if(saved){
        answers=parse(saved.answers);stageIndex=Math.max(0,Math.min(STAGES.length-1,Number(saved.stageIndex)||0));deadline=Number(saved.deadline)||0;
        setFontSize(Number(saved.fontSize||18));setVolume(Number(saved.currentVolume??.8));
        if(deadline&&deadline<=Date.now()&&stageIndex<STAGES.length-1){stageIndex+=1;deadline=Date.now()+Math.max(1,Number(minuteSettings[STAGES[stageIndex].key]||30))*60000;}
        else if(deadline&&deadline<=Date.now())deadline=Date.now();
        startStage(stageIndex,true);
      }else{answers={};stageIndex=-1;deadline=0;resumeState=null;startStage(0,false);}
    }catch(e){$('setupMessage').textContent=e.message;$('startMock').disabled=false;}
  }
  async function startRecording(){
    if(stageIndex!==3||Date.now()>=deadline||submitted)return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('recordingStatus').textContent='Trình duyệt không hỗ trợ ghi âm. Hãy dùng phiên bản Chrome/Edge mới và cho phép microphone.';return;}
    try{
      recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});recordedChunks=[];
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t));
      mediaRecorder=new MediaRecorder(recordingStream,mime?{mimeType:mime}:undefined);
      mediaRecorder.ondataavailable=e=>{if(e.data?.size)recordedChunks.push(e.data)};
      mediaRecorder.onstop=()=>{
        recordingBlob=new Blob(recordedChunks,{type:mediaRecorder.mimeType||'audio/webm'});
        if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl=URL.createObjectURL(recordingBlob);
        $('recordingPreview').src=recordingUrl;$('recordingPreview').classList.remove('hidden');$('recordingStatus').textContent=`Đã ghi âm ${Math.round(recordingBlob.size/1024)} KB. Bạn có thể nghe lại bản ghi.`;
        $('recordingIndicator').classList.remove('on');$('recordStart').disabled=(stageIndex!==3||Date.now()>=deadline);$('recordStop').disabled=true;
        recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;
      };
      mediaRecorder.start(1000);$('recordingIndicator').classList.add('on');$('recordingStatus').textContent='Đang ghi âm… Hãy nói rõ ràng và giữ microphone ở khoảng cách phù hợp.';$('recordStart').disabled=true;$('recordStop').disabled=false;
    }catch(e){$('recordingStatus').textContent='Không thể truy cập microphone: '+(e.message||'Vui lòng kiểm tra quyền microphone của trình duyệt.');}
  }
  function stopRecording(){if(mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop();}
  async function finishExam(){
    if(submitted)return;submitted=true;clearInterval(timerId);clearTimeout(transitionId);
    if(mediaRecorder&&mediaRecorder.state==='recording')stopRecording();
    // Wait for the MediaRecorder stop event to flush the final audio chunk.
    await new Promise(resolve=>setTimeout(resolve,450));
    const form=new FormData();form.append('examId',exam.id);form.append('studentName',$('candidateName').value.trim());form.append('candidateCode',$('candidateCode').value.trim());form.append('answers',JSON.stringify(answers));
    if(recordingBlob&&recordingBlob.size){const ext=(recordingBlob.type||'').includes('mp4')?'m4a':'webm';form.append('hskkRecording',recordingBlob,`HSKK-${Date.now()}.${ext}`);}
    $('examPanel').classList.add('hidden');$('finishPanel').classList.remove('hidden');$('headerStage').textContent='ĐÃ NỘP BÀI';$('headerTimer').textContent='DONE';$('finishMessage').textContent='Đang lưu câu trả lời và bản ghi âm (nếu có)…';
    try{
      const data=await api('/api/mock-exams/submit',{method:'POST',body:form});
      $('finishMessage').textContent='Bài thi thử đã được nộp và lưu thành công.';
      $('finishSummary').innerHTML=`<b>Thí sinh:</b> ${esc($('candidateName').value)}<br><b>Số báo danh:</b> ${esc($('candidateCode').value)}<br><b>Bộ đề:</b> ${esc(exam.title)}<br><b>Các phần:</b> Listening → Reading → Writing → HSKK Cao cấp<br><b>Ghi âm HSKK:</b> ${recordingBlob?.size?'Đã lưu lên hệ thống':'Không có file ghi âm'}<br><b>Mã lượt thi:</b> ${esc(data.id||'—')}`;
      sessionStorage.removeItem(STORAGE_KEY);resumeState=null;$('retrySubmit').classList.add('hidden');
    }catch(e){$('finishMessage').textContent='Không thể lưu bài thi: '+e.message;$('finishSummary').textContent='Dữ liệu trả lời vẫn còn trong phiên trình duyệt. Kiểm tra kết nối rồi bấm thử gửi lại.';$('retrySubmit').classList.remove('hidden');submitted=false;}
  }
  $('retrySubmit').addEventListener('click',finishExam);
  $('volumeControl').addEventListener('input',e=>setVolume(Number(e.target.value)/100));$('examVolume').addEventListener('input',e=>setVolume(Number(e.target.value)/100));
  $('fontDown').addEventListener('click',()=>setFontSize(fontSize-1));$('fontUp').addEventListener('click',()=>setFontSize(fontSize+1));$('fontReset').addEventListener('click',()=>setFontSize(18));$('examFontDown').addEventListener('click',()=>setFontSize(fontSize-1));$('examFontUp').addEventListener('click',()=>setFontSize(fontSize+1));
  ['readyCheck','examSelect','candidateName','candidateCode'].forEach(id=>$(id).addEventListener('input',updateSetupButton));
  $('examSelect').addEventListener('change',()=>{const selected=examList.find(x=>x.id===$('examSelect').value);$('selectedExamDescription').textContent=selected?.description||'Bộ đề sẽ thi theo đúng trình tự Listening → Reading → Writing → HSKK Cao cấp.';});$('startMock').addEventListener('click',beginExam);$('recordStart').addEventListener('click',startRecording);$('recordStop').addEventListener('click',stopRecording);
  setFontSize(18);setVolume(.8);loadExams().catch(e=>{$('setupMessage').textContent=e.message;});
})();
