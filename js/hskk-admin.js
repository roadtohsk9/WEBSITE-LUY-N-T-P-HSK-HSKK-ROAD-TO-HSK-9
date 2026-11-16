(() => {
  const $h = id => document.getElementById(id);
  const editor = () => $h('hskkSectionsEditor');
  const escH = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const AUDIO_MAX = 80 * 1024 * 1024;
  const taskTypeLabels = {
    listen_repeat: '听后重复 · Nghe rồi nhắc lại',
    listen_answer: '听后回答 · Nghe rồi trả lời',
    listen_recall: '听后复述 · Nghe rồi thuật lại',
    picture: '看图说话 · Nhìn tranh nói',
    question: '回答问题 · Trả lời câu hỏi',
    read_aloud: '朗读 · Đọc thành tiếng'
  };
  const audioTypes = new Set(['listen_repeat','listen_answer','listen_recall']);
  const validTypes = new Set(Object.keys(taskTypeLabels));
  let HSKK_EXAMS = [];

  function adminToken(){ return localStorage.getItem('eitAdminToken') || ''; }
  function newId(prefix='q') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`; }
  function blankTask(){
    return { id:newId(), type:'', text:'', referenceText:'', pinyin:'', audioUrl:'', imageUrl:'', showText:false, prepSeconds:0, speakSeconds:60, notes:'' };
  }
  function levelLabel(version, level) {
    if(version==='2.0') return ({beginner:'HSKK Sơ cấp',intermediate:'HSKK Trung cấp',advanced:'HSKK Cao cấp'})[level] || level;
    return ({'3':'HSK 3 · Speaking · Sơ cấp','4':'HSK 4 · Speaking · Trung cấp','5':'HSK 5 · Speaking · Cao cấp','6':'HSK 6 · Speaking · Cao cấp'})[level] || `HSK ${level} · Speaking`;
  }
  function nextTestNo(version, level){
    const nums = HSKK_EXAMS.filter(x=>x.version===version && x.level===level).map(x=>Number(x.test_no)||0);
    return Math.max(0,...nums)+1;
  }
  function defaultDuration(v,l){ return v==='2.0' ? (l==='beginner'?17:l==='intermediate'?21:24) : (l==='3'?20:l==='4'?23:25); }
  function updateLevelOptions(preserve=true) {
    const version=$h('hskkVersion').value, select=$h('hskkLevel'), old=preserve?select.value:'';
    const options=version==='2.0'
      ? [['beginner','Sơ cấp'],['intermediate','Trung cấp'],['advanced','Cao cấp']]
      : [['3','HSK 3 · Sơ cấp'],['4','HSK 4 · Trung cấp'],['5','HSK 5 · Cao cấp'],['6','HSK 6 · Cao cấp']];
    select.innerHTML=options.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
    select.value=options.some(x=>x[0]===old)?old:options[0][0];
    const level=select.value;
    $h('hskkTitle').placeholder=`${levelLabel(version,level)} · Tên đề do Admin tự đặt`;
    $h('hskkFormatHint').textContent='Chế độ tự thiết kế: không áp dụng cấu trúc hoặc số câu cố định. Admin tự thêm phần, thêm câu, chọn dạng câu, đặt thời gian và tải audio riêng cho từng câu.';
    if(!$h('hskkExamId').value){
      $h('hskkDuration').value=defaultDuration(version,level);
      $h('hskkPrepTotal').value=0;
    }
  }
  function renderTask(t,si,ti){
    const typeOptions = `<option value="">— Chưa chọn dạng câu —</option>` + Object.entries(taskTypeLabels).map(([v,l])=>`<option value="${v}" ${t.type===v?'selected':''}>${l}</option>`).join('');
    const audioUrl=String(t.audioUrl||'');
    const audioPreview=audioUrl?`<audio controls preload="metadata" src="${escH(audioUrl)}"></audio>`:'';
    const imagePreview=t.imageUrl?`<img class="ht-image-preview" src="${escH(t.imageUrl)}" alt="Preview" style="display:block;max-width:240px;max-height:150px;object-fit:contain;margin-top:8px;border-radius:10px">`:'';
    return `<article class="hskk-task-row hskk-question-card" data-task-index="${ti}">
      <header class="hskk-task-head"><div><span class="hskk-task-number">CÂU ${ti+1}</span><span class="hskk-task-help">Thiết lập độc lập cho câu hỏi này</span></div><button type="button" class="btn danger" data-remove-task="${si}-${ti}">Xóa câu</button></header>
      <input type="hidden" class="ht-id" value="${escH(t.id||newId())}">
      <div class="grid3 hskk-task-meta">
        <div class="field"><label>Dạng câu hỏi</label><select class="select ht-type">${typeOptions}</select></div>
        <div class="field"><label>Prep seconds · Giây chuẩn bị</label><input class="input ht-prep" type="number" min="0" max="1800" value="${Number(t.prepSeconds)||0}"></div>
        <div class="field"><label>Answer seconds · Giây ghi âm</label><input class="input ht-speak" type="number" min="1" max="900" value="${Number(t.speakSeconds)||60}"></div>
      </div>
      <div class="field"><label>Nội dung hiển thị / câu hỏi / chủ đề</label><textarea class="textarea ht-text" rows="3" placeholder="Nhập nội dung câu hỏi. Với câu chỉ nghe audio, có thể để trống.">${escH(t.text||'')}</textarea></div>
      <div class="field"><label>Văn bản chuẩn riêng của câu này (chỉ Admin và AI sử dụng)</label><textarea class="textarea ht-reference" rows="3" placeholder="Dán transcript / đáp án tham chiếu để Gemini đối chiếu. Nội dung này không hiển thị cho học viên.">${escH(t.referenceText||'')}</textarea></div>
      <section class="hskk-audio-uploader">
        <div class="hskk-upload-title"><div><strong>🎧 AUDIO CỦA CÂU ${ti+1}</strong><small>Chọn file ở đây; audio chỉ gắn vào đúng câu hiện tại.</small></div><span class="hskk-upload-state ${audioUrl?'is-ready':''}">${audioUrl?'ĐÃ CÓ AUDIO':'CHƯA CÓ AUDIO'}</span></div>
        <div class="hskk-upload-controls"><input type="file" class="file ht-audio-file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.opus"><button type="button" class="btn red" data-upload-audio="${si}-${ti}">Upload audio câu này</button><button type="button" class="btn ghost" data-remove-audio="${si}-${ti}" ${audioUrl?'':'disabled'}>Gỡ audio</button></div>
        <div class="ht-audio-selected helper" aria-live="polite">Chưa chọn file. Hỗ trợ MP3, WAV, M4A, OGG, WEBM, AAC, FLAC, OPUS · tối đa 80 MB.</div>
        <div class="ht-audio-status helper" aria-live="polite">${audioUrl?'✓ Audio đã được gắn với câu hỏi này.':'Sau khi chọn file, nhấn “Upload audio câu này”.'}</div>
        <div class="ht-audio-preview">${audioPreview}</div>
        <details class="hskk-audio-url"><summary>Nhập đường dẫn audio có sẵn (nếu không upload từ máy)</summary><input class="input ht-audio" value="${escH(audioUrl)}" placeholder="https://... hoặc /uploads/ten-file.mp3"><div class="helper">Đường dẫn sẽ được lưu cùng câu hỏi này.</div></details>
      </section>
      <div class="grid2 hskk-extra-fields">
        <div class="field"><label>Ảnh câu hỏi / tranh (nếu có)</label><input class="input ht-image" value="${escH(t.imageUrl||'')}" placeholder="URL ảnh"><input type="file" class="file ht-image-file" accept="image/png,image/jpeg,image/webp" style="margin-top:7px">${imagePreview}</div>
        <div class="field"><label>Pinyin / ghi chú nội bộ</label><input class="input ht-pinyin" value="${escH(t.pinyin||'')}" placeholder="Pinyin (nếu cần)"><textarea class="textarea ht-notes" rows="2" style="margin-top:8px" placeholder="Ghi chú riêng của Admin">${escH(t.notes||'')}</textarea></div>
      </div>
      <label class="hskk-show-text"><input type="checkbox" class="ht-showtext" ${t.showText?'checked':''}> Hiển thị phần văn bản cho học viên</label>
    </article>`;
  }
  function renderSections(content={sections:[]}){
    const sections=Array.isArray(content.sections)?content.sections:[];
    editor().innerHTML=sections.length?sections.map((s,si)=>`<article class="hskk-section-row" data-section-index="${si}" data-section-id="${escH(s.id||newId('sec'))}">
      <header class="hskk-section-head"><div><span class="hskk-section-kicker">SECTION ${String(si+1).padStart(2,'0')}</span><h3>Phần ${si+1}</h3></div><div class="inline-actions"><button type="button" class="btn ghost" data-add-task="${si}">＋ Thêm câu hỏi</button><button type="button" class="btn danger" data-remove-section="${si}">Xóa phần</button></div></header>
      <div class="grid2"><div class="field"><label>Tên phần thi</label><input class="input hs-title" value="${escH(s.title||'')}" placeholder="Ví dụ: 第一部分 · 听后复述"></div><div class="field"><label>Hướng dẫn thí sinh</label><input class="input hs-instruction" value="${escH(s.instruction||'')}" placeholder="Nhập hướng dẫn riêng cho phần này"></div></div>
      <div class="hskk-task-list">${(s.tasks||[]).length?(s.tasks||[]).map((t,ti)=>renderTask(t,si,ti)).join(''):'<div class="hskk-empty-tasks">Phần này chưa có câu hỏi. Nhấn <b>“Thêm câu hỏi”</b> để tự thiết kế câu đầu tiên.</div>'}</div>
    </article>`).join(''):`<div class="hskk-blank-state"><div class="hskk-blank-icon">＋</div><h3>Đề đang trống – bắt đầu tự thiết kế</h3><p>Không có mẫu đề hoặc số câu được tạo sẵn. Hãy thêm phần thi, rồi tự thêm từng câu hỏi và upload audio ở đúng câu.</p><button type="button" class="btn red" id="hskkBlankAddSection">＋ Tạo phần đầu tiên</button></div>`;
    updateComposerSummary();
  }
  function collectSections(){
    return [...editor().querySelectorAll('.hskk-section-row')].map((node,si)=>({
      id:node.dataset.sectionId||`sec-${si+1}-${Date.now().toString(36)}`,
      title:node.querySelector('.hs-title')?.value.trim()||`Phần ${si+1}`,
      instruction:node.querySelector('.hs-instruction')?.value.trim()||'',
      tasks:[...node.querySelectorAll('.hskk-task-row')].map((row,ti)=>({
        id:row.querySelector('.ht-id')?.value||newId(),
        type:row.querySelector('.ht-type')?.value||'',
        text:row.querySelector('.ht-text')?.value||'',
        referenceText:row.querySelector('.ht-reference')?.value||'',
        audioUrl:row.querySelector('.ht-audio')?.value.trim()||'',
        imageUrl:row.querySelector('.ht-image')?.value.trim()||'',
        pinyin:row.querySelector('.ht-pinyin')?.value||'',
        notes:row.querySelector('.ht-notes')?.value||'',
        showText:!!row.querySelector('.ht-showtext')?.checked,
        prepSeconds:Math.max(0,Number(row.querySelector('.ht-prep')?.value||0)),
        speakSeconds:Math.max(1,Number(row.querySelector('.ht-speak')?.value||60))
      }))
    }));
  }
  function updateComposerSummary(){
    const sections=editor().querySelectorAll('.hskk-section-row').length;
    const tasks=editor().querySelectorAll('.hskk-task-row').length;
    const uploaded=[...editor().querySelectorAll('.ht-audio')].filter(x=>x.value.trim()).length;
    const summary=$h('hskkComposerSummary');
    if(summary)summary.textContent=`${sections} phần thi · ${tasks} câu hỏi · ${uploaded} audio đã gắn`;
  }
  function reset(){
    $h('hskkExamId').value='';$h('hskkVersion').value='2.0';updateLevelOptions(false);$h('hskkLevel').value='advanced';
    $h('hskkTestNo').value=nextTestNo('2.0','advanced');$h('hskkTitle').value='';$h('hskkDuration').value=24;$h('hskkPrepTotal').value=0;
    $h('hskkTitle').placeholder='Nhập tên đề HSKK Cao cấp của bạn';$h('hskkDescription').value='';$h('hskkPublished').checked=false;$h('hskkSaveMsg').textContent='';renderSections({sections:[]});
    $h('hskkSaveMsg').textContent='Biểu mẫu trống đã sẵn sàng. Tự thêm phần thi và từng câu hỏi.';
  }
  async function createAdvancedCustom(){
    try{await loadExams()}catch{}
    if(editor().querySelector('.hskk-section-row') && !confirm('Tạo đề trống mới? Nội dung đang soạn sẽ được thay thế.'))return;
    reset();
    $h('hskkVersion').value='2.0';updateLevelOptions(false);$h('hskkLevel').value='advanced';
    $h('hskkTestNo').value=nextTestNo('2.0','advanced');$h('hskkTitle').value='';$h('hskkTitle').placeholder='Nhập tên đề HSKK Cao cấp của bạn';
    $h('hskkDuration').value=24;$h('hskkPrepTotal').value=0;
    $h('hskkDescription').value='';$h('hskkPublished').checked=false;
    renderSections({sections:[]});
    $h('hskkSaveMsg').textContent='Đã tạo biểu mẫu trống. Không có phần hoặc câu hỏi mẫu; Admin tự thiết kế từ đầu.';
    $h('hskk')?.scrollIntoView({behavior:'smooth',block:'start'});
    $h('hskkTitle')?.focus();
  }
  function addSection(){
    const sections=collectSections();
    sections.push({id:newId('sec'),title:'',instruction:'',tasks:[]});
    renderSections({sections});
    const nodes=editor().querySelectorAll('.hskk-section-row');
    nodes[nodes.length-1]?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function addTask(sectionIndex){
    const sections=collectSections();
    if(!sections[sectionIndex])return;
    sections[sectionIndex].tasks.push(blankTask());
    renderSections({sections});
    const cards=editor().querySelectorAll('.hskk-section-row');
    cards[sectionIndex]?.querySelector('.hskk-task-row:last-child')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function checkGemini(){
    try{const r=await fetch('/api/hskk/ai-status',{cache:'no-store'});const d=await r.json();$h('hskkGeminiStatus').className='notice '+(d.configured?'ok':'err');$h('hskkGeminiStatus').textContent=d.configured?`✓ Google Gemini đã sẵn sàng · Model ${d.model}`:'Chưa cấu hình GEMINI_API_KEY trên Render. Hãy thêm key trong Environment Variables và redeploy để bật chấm HSKK.';}
    catch{$h('hskkGeminiStatus').className='notice err';$h('hskkGeminiStatus').textContent='Không kiểm tra được trạng thái Gemini.';}
  }
  async function loadExams(){
    const d=await api('/admin/hskk/exams');HSKK_EXAMS=d.exams||[];
    $h('hskkExamList').innerHTML=HSKK_EXAMS.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Phiên bản</th><th>Cấp</th><th>Đề</th><th>Câu</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>${HSKK_EXAMS.map(x=>`<tr><td>${escH(x.version)}</td><td>${escH(x.level_label)}</td><td><b>${escH(x.title)}</b><br><small>${Number(x.duration_minutes)} phút · Test ${Number(x.test_no)}</small></td><td>${(x.content?.sections||[]).reduce((n,s)=>n+(s.tasks||[]).length,0)}</td><td>${x.published?'<span class="pill" style="color:#166534;background:#ecfdf3">PUBLISHED</span>':'<span class="pill">DRAFT</span>'}</td><td><div class="existing-actions"><button type="button" class="btn ghost" data-edit-hskk="${x.id}">Sửa</button><button type="button" class="btn danger" data-delete-hskk="${x.id}">Xóa</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Chưa có đề HSKK. Nhấn “Tạo đề trống” để tự thiết kế.</div>';
    $h('hskkExamList').querySelectorAll('[data-edit-hskk]').forEach(b=>b.onclick=()=>editExam(b.dataset.editHskk));
    $h('hskkExamList').querySelectorAll('[data-delete-hskk]').forEach(b=>b.onclick=()=>deleteExam(b.dataset.deleteHskk));
  }
  async function loadAttempts(){
    const d=await api('/admin/hskk/attempts');const rows=d.attempts||[];
    $h('hskkAttemptsList').innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Học viên</th><th>Đề</th><th>Thời gian</th><th>Điểm AI</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${escH(a.student_name)}</b><br><small>${escH(a.candidate_code)}</small></td><td>${escH(a.exam_title||'Đề đã xóa')}<br><small>${escH(a.version||'')} · ${escH(a.level_label||'')}</small></td><td>${new Date(a.submitted_at).toLocaleString('vi-VN')}</td><td>${a.total_score==null?'—':Number(a.total_score).toFixed(0)+'/100'}</td><td>${a.status==='completed'?'<span class="pill" style="color:#166534;background:#ecfdf3">Đã chấm</span>':a.status==='failed'?`<span title="${escH(a.error_message)}" class="pill" style="color:#991b1b;background:#fef2f2">Lỗi Gemini</span>`:'<span class="pill">Đang chấm</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Chưa có học viên nộp bài.</div>';
  }
  function editExam(id){
    const x=HSKK_EXAMS.find(e=>e.id===id);if(!x)return;
    $h('hskkExamId').value=x.id;$h('hskkVersion').value=x.version;updateLevelOptions(false);$h('hskkLevel').value=x.level;
    $h('hskkTestNo').value=x.test_no;$h('hskkTitle').value=x.title;$h('hskkDuration').value=x.duration_minutes;$h('hskkPrepTotal').value=x.prep_minutes;
    $h('hskkDescription').value=x.description||'';$h('hskkPublished').checked=!!x.published;renderSections(x.content||{sections:[]});
    $h('hskkSaveMsg').textContent='Đang chỉnh sửa đề đã lưu. Mỗi câu có thể thay audio riêng.';$h('hskk').scrollIntoView({behavior:'smooth'});
  }
  async function deleteExam(id){if(!confirm('Xóa đề HSKK này?'))return;try{await api('/admin/hskk/exams/'+encodeURIComponent(id),{method:'DELETE'});await loadExams()}catch(e){alert(e.message)}}

  function updateAudioPreview(row,url){
    const preview=row.querySelector('.ht-audio-preview');
    const badge=row.querySelector('.hskk-upload-state');
    const remove=row.querySelector('[data-remove-audio]');
    if(preview)preview.innerHTML=url?`<audio controls preload="metadata" src="${escH(url)}"></audio>`:'';
    if(badge){badge.textContent=url?'ĐÃ CÓ AUDIO':'CHƯA CÓ AUDIO';badge.classList.toggle('is-ready',!!url)}
    if(remove)remove.disabled=!url;
    updateComposerSummary();
  }
  function uploadAudioForRow(file,row,button){
    return new Promise((resolve,reject)=>{
      if(!file){reject(new Error('Bạn chưa chọn file audio cho câu hỏi này.'));return}
      if(!adminToken()){reject(new Error('Phiên Admin hết hạn. Vui lòng đăng nhập lại.'));return}
      if(!file.size){reject(new Error('File audio đang trống.'));return}
      if(file.size>AUDIO_MAX){reject(new Error('File vượt quá 80 MB. Hãy nén audio rồi thử lại.'));return}
      const status=row.querySelector('.ht-audio-status');
      const urlInput=row.querySelector('.ht-audio');
      const fileInput=row.querySelector('.ht-audio-file');
      const fd=new FormData();fd.append('audio',file,file.name);
      const xhr=new XMLHttpRequest();let finished=false;
      const done=(err,data)=>{if(finished)return;finished=true;button.disabled=false;if(fileInput)fileInput.disabled=false;if(err)reject(err);else resolve(data)};
      xhr.open('POST','/api/admin/hskk/upload-audio',true);
      xhr.setRequestHeader('Authorization','Bearer '+adminToken());
      xhr.timeout=240000;
      button.disabled=true;if(fileInput)fileInput.disabled=true;
      if(status)status.textContent='Đang upload audio của câu này… 0%';
      xhr.upload.onprogress=e=>{if(e.lengthComputable&&status)status.textContent=`Đang upload audio của câu này… ${Math.round(e.loaded/e.total*100)}%`};
      xhr.onerror=()=>done(new Error('Không kết nối được máy chủ upload. Kiểm tra mạng hoặc thử lại.'));
      xhr.onabort=()=>done(new Error('Upload đã bị hủy.'));
      xhr.ontimeout=()=>done(new Error('Upload quá thời gian chờ. Hãy giảm dung lượng file rồi thử lại.'));
      xhr.onload=()=>{
        let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}
        if(xhr.status<200||xhr.status>=300||!data.ok||!data.url){done(new Error(data.message||`Máy chủ từ chối upload (HTTP ${xhr.status}).`));return}
        const url=`${data.url}${String(data.url).includes('?')?'&':'?'}v=${Date.now()}`;
        urlInput.value=url;updateAudioPreview(row,url);
        if(status)status.textContent=`✓ Upload thành công · ${data.filename||file.name} · ${(Number(data.size||file.size)/1024/1024).toFixed(2)} MB`;
        if(fileInput)fileInput.value='';
        const selected=row.querySelector('.ht-audio-selected');if(selected)selected.textContent='File đã upload và gắn với câu hỏi hiện tại.';
        done(null,data);
      };
      xhr.send(fd);
    });
  }

  $h('hskkVersion')?.addEventListener('change',()=>{updateLevelOptions(false);if(!$h('hskkExamId').value)$h('hskkTestNo').value=nextTestNo($h('hskkVersion').value,$h('hskkLevel').value)});
  $h('hskkLevel')?.addEventListener('change',()=>{
    const v=$h('hskkVersion').value,l=$h('hskkLevel').value;
    if(!$h('hskkExamId').value){$h('hskkDuration').value=defaultDuration(v,l);$h('hskkPrepTotal').value=0;$h('hskkTestNo').value=nextTestNo(v,l)}
  });
  $h('hskkCreateCustom')?.addEventListener('click',()=>{createAdvancedCustom()});
  $h('hskkAddSection')?.addEventListener('click',addSection);
  editor()?.addEventListener('click',async e=>{
    const addFirst=e.target.closest('#hskkBlankAddSection');if(addFirst){addSection();return}
    const add=e.target.closest('[data-add-task]');if(add){addTask(Number(add.dataset.addTask));return}
    const rmS=e.target.closest('[data-remove-section]');if(rmS){const sections=collectSections();sections.splice(Number(rmS.dataset.removeSection),1);renderSections({sections});return}
    const rm=e.target.closest('[data-remove-task]');if(rm){const [si,ti]=rm.dataset.removeTask.split('-').map(Number);const sections=collectSections();sections[si]?.tasks.splice(ti,1);renderSections({sections});return}
    const upload=e.target.closest('[data-upload-audio]');if(upload){
      const row=upload.closest('.hskk-task-row');const file=row?.querySelector('.ht-audio-file')?.files?.[0];
      const status=row?.querySelector('.ht-audio-status');
      try{await uploadAudioForRow(file,row,upload)}catch(err){if(status)status.textContent='✕ Upload thất bại: '+err.message;}
      return;
    }
    const removeAudio=e.target.closest('[data-remove-audio]');if(removeAudio){
      const row=removeAudio.closest('.hskk-task-row');row.querySelector('.ht-audio').value='';
      const status=row.querySelector('.ht-audio-status');if(status)status.textContent='Đã gỡ đường dẫn audio khỏi câu hỏi. File gốc vẫn ở kho upload.';
      updateAudioPreview(row,'');return;
    }
  });
  editor()?.addEventListener('change',async e=>{
    const input=e.target.closest('.ht-audio-file,.ht-image-file');if(!input)return;
    const row=input.closest('.hskk-task-row');
    if(input.classList.contains('ht-audio-file')){
      const selected=row.querySelector('.ht-audio-selected');
      if(selected)selected.textContent=input.files?.[0]?`Đã chọn: ${input.files[0].name} · ${(input.files[0].size/1024/1024).toFixed(2)} MB. Nhấn Upload audio câu này.`:'Chưa chọn file.';
      return;
    }
    const target=row.querySelector('.ht-image');const status=row.querySelector('.ht-audio-status');
    try{
      const fd=new FormData();fd.append('file',input.files[0],input.files[0].name);
      const d=await api('/admin/asset/upload',{method:'POST',body:fd});target.value=d.url;
      const old=row.querySelector('.ht-image-preview');if(old)old.remove();target.insertAdjacentHTML('afterend',`<img class="ht-image-preview" src="${escH(d.url)}" alt="Preview" style="display:block;max-width:240px;max-height:150px;object-fit:contain;margin-top:8px;border-radius:10px">`);
    }catch(err){if(status)status.textContent='✕ Upload ảnh thất bại: '+err.message;}
    finally{input.value=''}
  });
  editor()?.addEventListener('change',e=>{
    const input=e.target.closest('.ht-audio');if(!input)return;
    updateAudioPreview(input.closest('.hskk-task-row'),input.value.trim());
  });
  $h('hskkExamForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const msg=$h('hskkSaveMsg');msg.className='helper';msg.textContent='Đang kiểm tra và lưu đề…';
    const version=$h('hskkVersion').value,level=$h('hskkLevel').value,published=$h('hskkPublished').checked;
    const sections=collectSections();
    if(!$h('hskkTitle').value.trim()){msg.className='notice err';msg.textContent='Hãy nhập tên đề trước khi lưu.';$h('hskkTitle').focus();return}
    if(published){
      if(!sections.length||sections.some(s=>!s.tasks.length)){msg.className='notice err';msg.textContent='Để xuất bản, hãy thêm ít nhất một phần và mỗi phần cần có ít nhất một câu hỏi.';return}
      for(let si=0;si<sections.length;si++)for(let ti=0;ti<sections[si].tasks.length;ti++){
        const t=sections[si].tasks[ti],prefix=`Phần ${si+1} · Câu ${ti+1}`;
        if(!validTypes.has(t.type)){msg.className='notice err';msg.textContent=`${prefix}: hãy chọn dạng câu hỏi.`;return}
        if(audioTypes.has(t.type)&&!t.audioUrl){msg.className='notice err';msg.textContent=`${prefix}: dạng nghe cần upload audio hoặc nhập URL audio.`;return}
        if(t.type==='picture'&&!t.imageUrl){msg.className='notice err';msg.textContent=`${prefix}: dạng nhìn tranh cần upload ảnh.`;return}
        if(t.type==='read_aloud'&&!t.text.trim()){msg.className='notice err';msg.textContent=`${prefix}: dạng đọc thành tiếng cần có văn bản.`;return}
        if(t.type==='question'&&!t.text.trim()&&!t.audioUrl){msg.className='notice err';msg.textContent=`${prefix}: cần nhập câu hỏi hoặc gắn audio.`;return}
      }
    }
    const body={id:$h('hskkExamId').value||undefined,version,level,levelLabel:levelLabel(version,level),testNo:Number($h('hskkTestNo').value||1),title:$h('hskkTitle').value.trim(),description:$h('hskkDescription').value,durationMinutes:Number($h('hskkDuration').value||20),prepMinutes:Number($h('hskkPrepTotal').value||0),content:{sections},published};
    try{
      const d=await api('/admin/hskk/exams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      msg.className='notice ok';msg.textContent=published?'✓ Đã lưu và xuất bản đề HSKK. Đề sẽ xuất hiện trong mục HSKK cao cấp trên trang chủ.':'✓ Đã lưu bản nháp. Bạn có thể tiếp tục chỉnh sửa rồi xuất bản sau.';
      if(d.exam?.id)$h('hskkExamId').value=d.exam.id;
      await loadExams();
    }catch(err){msg.className='notice err';msg.textContent='✕ '+err.message}
  });
  $h('hskkReset')?.addEventListener('click',reset);
  $h('hskkRefresh')?.addEventListener('click',loadExams);
  $h('hskkAttemptsRefresh')?.addEventListener('click',loadAttempts);
  window.loadHskkAdmin=async()=>{try{await Promise.all([checkGemini(),loadExams(),loadAttempts()])}catch(e){$h('hskkExamList').innerHTML=`<div class="notice err">${escH(e.message)}</div>`}};
  updateLevelOptions(false);
  $h('hskkLevel').value='advanced';
  $h('hskkTitle').placeholder='Nhập tên đề HSKK Cao cấp của bạn';
  $h('hskkDuration').value=24;
  $h('hskkTestNo').value=nextTestNo('2.0','advanced');
  renderSections({sections:[]});
})();
