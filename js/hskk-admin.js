(() => {
  const $h = id => document.getElementById(id);
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const editor = () => $h('hskkSectionsEditor');
  const taskTypeLabels = {
    listen_repeat:'听后重复 · Nghe rồi nhắc lại', listen_answer:'听后回答 · Nghe rồi trả lời',
    listen_recall:'听后复述 · Nghe rồi kể lại', picture:'看图说话 · Nhìn tranh nói',
    question:'回答问题 · Trả lời câu hỏi', read_aloud:'朗读 · Đọc thành tiếng'
  };
  let HSKK_EXAMS = [];

  function task(type, n, prep, speak, text='') {
    return { id:`q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, type, text, referenceText:'', pinyin:'', audioUrl:'', imageUrl:'', showText:type==='question'||type==='read_aloud', prepSeconds:prep, speakSeconds:speak, notes:'' };
  }
  function template(version, level) {
    const sections=[];
    const add=(title,instruction,type,count,prep,speak)=>sections.push({id:`sec-${sections.length+1}`,title,instruction,tasks:Array.from({length:count},(_,i)=>task(type,i+1,prep,speak,''))});
    if(version==='2.0' && level==='beginner'){
      add('第一部分 · 听后重复','Mỗi câu phát audio một lần; học viên nghe xong nhắc lại.','listen_repeat',15,0,16);
      add('第二部分 · 听后回答','Mỗi câu phát audio; học viên trả lời ngắn gọn bằng tiếng Trung.','listen_answer',10,0,18);
      add('第三部分 · 回答问题','Hiển thị câu hỏi (có thể kèm Pinyin); học viên trả lời tối thiểu 5 câu.','question',2,210,90);
    } else if(version==='2.0' && level==='intermediate'){
      add('第一部分 · 听后重复','Nghe câu và nhắc lại một lần.','listen_repeat',10,0,18);
      add('第二部分 · 看图说话','Quan sát tranh và mô tả thành một đoạn nói liên tục.','picture',2,150,120);
      add('第三部分 · 回答问题','Đọc câu hỏi và trả lời bằng một đoạn nói có phát triển ý.','question',2,150,120);
    } else if(version==='2.0' && level==='advanced'){
      add('第一部分 · 听后复述','Nghe đoạn văn và kể lại nội dung chính bằng lời của mình.','listen_recall',3,0,140);
      add('第二部分 · 朗读','Đọc to văn bản hiển thị rõ ràng, đúng nhịp và ngữ điệu.','read_aloud',1,0,120);
      add('第三部分 · 回答问题','Đọc câu hỏi và trình bày quan điểm có lý do, dẫn chứng.','question',2,300,150);
    } else if(version==='3.0' && level==='3'){
      add('第一部分 · 听后重复','15 câu nghe và nhắc lại; thời lượng phần khoảng 6 phút.','listen_repeat',15,0,24);
      add('第二部分 · 听后回答','10 câu nghe câu hỏi và trả lời ngắn; thời lượng phần khoảng 4 phút.','listen_answer',10,0,24);
      add('第三部分 · 回答问题','2 câu trả lời mở; tổng 7 phút chuẩn bị được chia đều cho 2 câu.','question',2,210,90);
    } else if(version==='3.0' && level==='4'){
      add('第一部分 · 听后重复','10 câu nghe và nhắc lại; thời lượng phần khoảng 5 phút.','listen_repeat',10,0,30);
      add('第二部分 · 看图说话','2 câu mô tả tranh; tổng thời gian chuẩn bị 5 phút cho phần này.','picture',2,150,120);
      add('第三部分 · 回答问题','2 câu trả lời mở; tổng thời gian chuẩn bị 5 phút cho phần này.','question',2,150,120);
    } else if(version==='3.0' && ['5','6'].includes(level)){
      add('第一部分 · 听后重复','3 câu nghe và nhắc lại; thời lượng phần khoảng 8 phút.','listen_repeat',3,0,160);
      add('第二部分 · 朗读','1 câu đọc thành tiếng; thời lượng khoảng 2 phút.','read_aloud',1,0,120);
      add('第三部分 · 回答问题','2 câu trả lời mở; tổng 10 phút chuẩn bị được chia đều cho 2 câu.','question',2,300,150);
    }
    return {sections};
  }
  function levelLabel(version, level) {
    if(version==='2.0') return ({beginner:'HSKK Sơ cấp',intermediate:'HSKK Trung cấp',advanced:'HSKK Cao cấp'})[level]||level;
    return ({'3':'HSK 3 · Speaking · Sơ cấp','4':'HSK 4 · Speaking · Trung cấp','5':'HSK 5 · Speaking · Cao cấp','6':'HSK 6 · Speaking · Cao cấp'})[level]||`HSK ${level} · Speaking`;
  }
  function updateLevelOptions(preserve=true) {
    const v=$h('hskkVersion').value, el=$h('hskkLevel'), old=preserve?el.value:'';
    const opts=v==='2.0'?[['beginner','Sơ cấp'],['intermediate','Trung cấp'],['advanced','Cao cấp']]:[['3','HSK 3 · Sơ cấp'],['4','HSK 4 · Trung cấp'],['5','HSK 5 · Cao cấp'],['6','HSK 6 · Cao cấp']];
    el.innerHTML=opts.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(opts.some(x=>x[0]===old))el.value=old;
    const level=el.value;
    $h('hskkTitle').placeholder=`${levelLabel(v,level)} · Practice Test 01`;
    const desc=(v==='2.0'?(level==='beginner'?'27 câu · 3 phần · khoảng 17 phút (gồm thời gian chuẩn bị).':level==='intermediate'?'14 câu · 3 phần · khoảng 21 phút (gồm thời gian chuẩn bị).':'6 câu · 3 phần · khoảng 24 phút (gồm thời gian chuẩn bị).'):(level==='3'?'27 câu · 3 phần · khoảng 20 phút (gồm 7 phút chuẩn bị).':level==='4'?'14 câu · 3 phần · khoảng 23 phút (gồm 10 phút chuẩn bị).':'6 câu · 3 phần · khoảng 25 phút (gồm 10 phút chuẩn bị).'));
    $h('hskkFormatHint')?.replaceChildren(document.createTextNode(desc));
    if(!$h('hskkExamId').value){$h('hskkDuration').value=defaultDuration(v,level);$h('hskkPrepTotal').value=v==='2.0'?(level==='beginner'?7:10):(level==='3'?7:10)}
  }
  function renderSections(content) {
    const sections=content?.sections||[];
    editor().innerHTML=sections.map((s,si)=>`<article class="card hskk-section-row" data-section-index="${si}" style="background:#f8fbff;border:1px solid #dbeafe;margin:12px 0;padding:14px">
      <div class="toolbar"><h3>PHẦN ${si+1}</h3><button type="button" class="btn danger" data-remove-section="${si}">Xóa phần</button></div>
      <div class="grid2"><div class="field"><label>Tên phần</label><input class="input hs-title" value="${escH(s.title||'')}"></div><div class="field"><label>Hướng dẫn</label><input class="input hs-instruction" value="${escH(s.instruction||'')}"></div></div>
      <div class="hskk-task-list">${(s.tasks||[]).map((t,ti)=>renderTask(t,si,ti)).join('')}</div>
      <button type="button" class="btn ghost" data-add-task="${si}">+ Thêm câu vào phần này</button>
    </article>`).join('')||'<div class="empty">Chưa có phần thi. Hãy tạo cấu trúc mẫu hoặc thêm phần mới.</div>';
  }
  function renderTask(t,si,ti){
    const opts=Object.entries(taskTypeLabels).map(([v,l])=>`<option value="${v}" ${t.type===v?'selected':''}>${l}</option>`).join('');
    const audioUrl=String(t.audioUrl||'');
    return `<div class="hskk-task-row" data-task-index="${ti}" style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px;margin:10px 0">
      <div class="toolbar"><b>Câu ${ti+1}</b><button type="button" class="btn danger" data-remove-task="${si}-${ti}">Xóa câu</button></div>
      <input type="hidden" class="ht-id" value="${escH(t.id||`q-${si}-${ti}`)}">
      <div class="grid3"><div class="field"><label>Dạng câu</label><select class="select ht-type">${opts}</select></div><div class="field"><label>Thời gian chuẩn bị (giây)</label><input class="input ht-prep" type="number" min="0" max="1800" value="${Number(t.prepSeconds||0)}"></div><div class="field"><label>Thời gian ghi âm (giây)</label><input class="input ht-speak" type="number" min="1" max="900" value="${Number(t.speakSeconds||30)}"></div></div>
      <div class="field"><label>Nội dung / câu hỏi / chủ đề</label><textarea class="textarea ht-text" rows="2" placeholder="Nội dung hiển thị cho học viên (bỏ trống nếu chỉ nghe audio)">${escH(t.text||'')}</textarea></div>
      <div class="field"><label>Văn bản chuẩn để Gemini so sánh (dành cho nghe-nhắc lại / nghe-kể lại)</label><textarea class="textarea ht-reference" rows="2" placeholder="Nhập nguyên văn câu/đoạn audio nếu có; giúp AI nhận diện thiếu/thừa từ chính xác hơn.">${escH(t.referenceText||'')}</textarea></div>
      <div class="field" style="border:1px solid #bfdbfe;background:#f8fbff;border-radius:10px;padding:12px">
        <label style="color:#1e40af">Audio của riêng câu ${ti+1} (MP3 / WAV / M4A / OGG / WEBM / AAC / FLAC)</label>
        <input class="input ht-audio" value="${escH(audioUrl)}" placeholder="Link audio sẽ tự điền sau khi upload">
        <input type="file" class="file ht-audio-file" accept=".mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,.opus,audio/*" style="margin-top:8px">
        <div class="ht-audio-status muted" aria-live="polite" style="font-size:12px;margin-top:6px">${audioUrl?'✓ Đã có audio cho câu này.':'Chưa có audio. Chọn file để upload riêng cho câu hỏi này.'}</div>
        <div class="ht-audio-preview" style="margin-top:8px">${audioUrl?`<audio controls preload="none" style="width:100%" src="${escH(audioUrl)}"></audio>`:''}</div>
      </div>
      <div class="grid3" style="margin-top:10px"><div class="field"><label>Ảnh đề / tranh</label><input class="input ht-image" value="${escH(t.imageUrl||'')}" placeholder="/uploads/hskk-picture.png"><input type="file" class="file ht-image-file" accept="image/png,image/jpeg,image/webp" style="margin-top:6px"></div><div class="field"><label>Pinyin / ghi chú biên tập</label><input class="input ht-pinyin" value="${escH(t.pinyin||'')}" placeholder="Pinyin (nếu cần)"><input class="input ht-notes" style="margin-top:6px" value="${escH(t.notes||'')}" placeholder="Ghi chú nội bộ"></div></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:12px;font-weight:700"><input type="checkbox" class="ht-showtext" ${t.showText?'checked':''}> Hiển thị văn bản câu hỏi cho học viên (tắt nếu đề chỉ phát audio)</label>
    </div>`;
  }
  function collectSections(){
    return [...editor().querySelectorAll('.hskk-section-row')].map((node,si)=>({id:`sec-${si+1}`,title:node.querySelector('.hs-title')?.value.trim()||`Phần ${si+1}`,instruction:node.querySelector('.hs-instruction')?.value.trim()||'',tasks:[...node.querySelectorAll('.hskk-task-row')].map((r,ti)=>({id:r.querySelector('.ht-id')?.value||`q-${si}-${ti}`,type:r.querySelector('.ht-type')?.value||'question',text:r.querySelector('.ht-text')?.value||'',referenceText:r.querySelector('.ht-reference')?.value||'',audioUrl:r.querySelector('.ht-audio')?.value.trim()||'',imageUrl:r.querySelector('.ht-image')?.value.trim()||'',pinyin:r.querySelector('.ht-pinyin')?.value||'',notes:r.querySelector('.ht-notes')?.value||'',showText:!!r.querySelector('.ht-showtext')?.checked,prepSeconds:Math.max(0,Number(r.querySelector('.ht-prep')?.value||0)),speakSeconds:Math.max(1,Number(r.querySelector('.ht-speak')?.value||30))}))}));
  }
  function reset(){
    $h('hskkExamId').value='';$h('hskkVersion').value='2.0';updateLevelOptions(false);$h('hskkLevel').value='beginner';$h('hskkTestNo').value=1;$h('hskkTitle').value='';$h('hskkDuration').value=17;$h('hskkPrepTotal').value=7;$h('hskkDescription').value='';$h('hskkPublished').checked=true;$h('hskkSaveMsg').textContent='';renderSections({sections:[]});
  }
  function createAdvancedCustom(){
    if(editor().querySelector('.hskk-section-row') && !confirm('Tạo đề tùy chỉnh mới? Nội dung đang soạn sẽ được thay thế.'))return;
    $h('hskkExamId').value='';
    $h('hskkVersion').value='2.0';updateLevelOptions(false);
    $h('hskkLevel').value='advanced';
    $h('hskkTestNo').value=1;
    $h('hskkTitle').value='HSKK 高级 · Custom Practice Test 01';
    $h('hskkDuration').value=24;$h('hskkPrepTotal').value=10;
    $h('hskkDescription').value='Đề HSKK cao cấp tùy chỉnh. Admin tự thiết kế số phần, dạng câu, thời lượng và audio riêng từng câu.';
    $h('hskkPublished').checked=false;
    renderSections({sections:[{
      id:'sec-1',title:'第一部分 · 听后复述',
      instruction:'Nghe đoạn audio; sau đó thuật lại nội dung bằng tiếng Trung theo thời gian đã thiết lập.',
      tasks:[task('listen_recall',1,0,120,'')]
    }]});
    $h('hskkSaveMsg').textContent='Đã tạo khung đề cao cấp tùy chỉnh ở trạng thái nháp. Bạn có thể thêm/xóa phần và câu theo ý muốn.';
    $h('hskk')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function defaultDuration(v,l){return v==='2.0'?(l==='beginner'?17:l==='intermediate'?21:24):(l==='3'?20:l==='4'?23:25)}
  async function checkGemini(){
    try{const r=await fetch('/api/hskk/ai-status',{cache:'no-store'});const d=await r.json();$h('hskkGeminiStatus').className='notice '+(d.configured?'ok':'err');$h('hskkGeminiStatus').textContent=d.configured?`✓ Google Gemini đã sẵn sàng · Model ${d.model}`:'Chưa cấu hình GEMINI_API_KEY trên Render. Hãy thêm key trong Environment Variables và redeploy để bật chấm HSKK.';}
    catch{$h('hskkGeminiStatus').className='notice err';$h('hskkGeminiStatus').textContent='Không kiểm tra được trạng thái Gemini.';}
  }
  async function loadExams(){
    const d=await api('/admin/hskk/exams');HSKK_EXAMS=d.exams||[];
    $h('hskkExamList').innerHTML=HSKK_EXAMS.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Phiên bản</th><th>Cấp</th><th>Đề</th><th>Câu</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>${HSKK_EXAMS.map(x=>`<tr><td>${escH(x.version)}</td><td>${escH(x.level_label)}</td><td><b>${escH(x.title)}</b><br><small>${Number(x.duration_minutes)} phút · Test ${Number(x.test_no)}</small></td><td>${(x.content?.sections||[]).reduce((n,s)=>n+(s.tasks||[]).length,0)}</td><td>${x.published?'<span class="pill" style="color:#166534;background:#ecfdf3">PUBLISHED</span>':'<span class="pill">DRAFT</span>'}</td><td><div class="existing-actions"><button type="button" class="btn ghost" data-edit-hskk="${x.id}">Sửa</button><button type="button" class="btn danger" data-delete-hskk="${x.id}">Xóa</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Chưa có đề HSKK. Tạo đề từ cấu trúc mẫu ở trên.</div>';
    $h('hskkExamList').querySelectorAll('[data-edit-hskk]').forEach(b=>b.onclick=()=>editExam(b.dataset.editHskk));
    $h('hskkExamList').querySelectorAll('[data-delete-hskk]').forEach(b=>b.onclick=()=>deleteExam(b.dataset.deleteHskk));
  }
  async function loadAttempts(){
    const d=await api('/admin/hskk/attempts');const rows=d.attempts||[];
    $h('hskkAttemptsList').innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Học viên</th><th>Đề</th><th>Thời gian</th><th>Điểm AI</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${escH(a.student_name)}</b><br><small>${escH(a.candidate_code)}</small></td><td>${escH(a.exam_title||'Đề đã xóa')}<br><small>${escH(a.version||'')} · ${escH(a.level_label||'')}</small></td><td>${new Date(a.submitted_at).toLocaleString('vi-VN')}</td><td>${a.total_score==null?'—':Number(a.total_score).toFixed(0)+'/100'}</td><td>${a.status==='completed'?'<span class="pill" style="color:#166534;background:#ecfdf3">Đã chấm</span>':a.status==='failed'?`<span title="${escH(a.error_message)}" class="pill" style="color:#991b1b;background:#fef2f2">Lỗi Gemini</span>`:'<span class="pill">Đang chấm</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Chưa có học viên nộp bài.</div>';
  }
  async function editExam(id){
    const x=HSKK_EXAMS.find(e=>e.id===id);if(!x)return;
    $h('hskkExamId').value=x.id;$h('hskkVersion').value=x.version;updateLevelOptions(false);$h('hskkLevel').value=x.level;$h('hskkTestNo').value=x.test_no;$h('hskkTitle').value=x.title;$h('hskkDuration').value=x.duration_minutes;$h('hskkPrepTotal').value=x.prep_minutes;$h('hskkDescription').value=x.description||'';$h('hskkPublished').checked=!!x.published;renderSections(x.content||{sections:[]});$h('hskkSaveMsg').textContent='Đang sửa đề đã lưu.';$h('hskk').scrollIntoView({behavior:'smooth'});
  }
  async function deleteExam(id){if(!confirm('Xóa đề HSKK này?'))return;try{await api('/admin/hskk/exams/'+encodeURIComponent(id),{method:'DELETE'});await loadExams()}catch(e){alert(e.message)}}

  $h('hskkVersion')?.addEventListener('change',()=>updateLevelOptions(false));
  $h('hskkLevel')?.addEventListener('change',()=>{const v=$h('hskkVersion').value,l=$h('hskkLevel').value;$h('hskkDuration').value=defaultDuration(v,l);$h('hskkPrepTotal').value=v==='2.0'?(l==='beginner'?7:10):(l==='3'?7:10)});
  $h('hskkCreateCustom')?.addEventListener('click',createAdvancedCustom);
  $h('hskkApplyTemplate')?.addEventListener('click',()=>{if(editor().querySelector('.hskk-section-row')&&!confirm('Thay thế toàn bộ nội dung đang soạn bằng cấu trúc mẫu?'))return;const v=$h('hskkVersion').value,l=$h('hskkLevel').value;renderSections(template(v,l));$h('hskkDuration').value=defaultDuration(v,l);$h('hskkPrepTotal').value=v==='2.0'?(l==='beginner'?7:10):(l==='3'?7:10);if(!$h('hskkTitle').value)$h('hskkTitle').value=`${levelLabel(v,l)} · Practice Test ${String($h('hskkTestNo').value||1).padStart(2,'0')}`});
  $h('hskkAddSection')?.addEventListener('click',()=>{const s=collectSections();s.push({title:`Phần ${s.length+1}`,instruction:'',tasks:[task('question',1,0,60,'')]});renderSections({sections:s})});
  editor()?.addEventListener('click',e=>{
    const rmS=e.target.closest('[data-remove-section]');if(rmS){const s=collectSections();s.splice(Number(rmS.dataset.removeSection),1);renderSections({sections:s});return}
    const add=e.target.closest('[data-add-task]');if(add){const s=collectSections(),i=Number(add.dataset.addTask);s[i].tasks.push(task('question',s[i].tasks.length+1,0,60,''));renderSections({sections:s});return}
    const rm=e.target.closest('[data-remove-task]');if(rm){const [si,ti]=rm.dataset.removeTask.split('-').map(Number);const s=collectSections();s[si].tasks.splice(ti,1);renderSections({sections:s});}
  });
  function uploadHskkAudio(file,row,input){
    return new Promise((resolve,reject)=>{
      const status=row.querySelector('.ht-audio-status');
      const target=row.querySelector('.ht-audio');
      const preview=row.querySelector('.ht-audio-preview');
      if(file.size<=0){reject(new Error('File audio đang trống.'));return}
      if(file.size>80*1024*1024){reject(new Error('Audio vượt giới hạn 80 MB. Hãy nén audio hoặc giảm bitrate rồi upload lại.'));return}
      const fd=new FormData();fd.append('audio',file,file.name);
      const xhr=new XMLHttpRequest();
      xhr.open('POST','/api/admin/hskk/upload-audio',true);
      xhr.setRequestHeader('Authorization','Bearer '+(localStorage.getItem('eitAdminToken')||''));
      xhr.timeout=180000;
      input.disabled=true;
      if(status)status.textContent='Đang tải audio lên máy chủ… 0%';
      xhr.upload.onprogress=e=>{if(e.lengthComputable&&status)status.textContent=`Đang tải audio lên máy chủ… ${Math.round(e.loaded/e.total*100)}%`};
      xhr.onerror=()=>reject(new Error('Không kết nối được máy chủ upload. Kiểm tra mạng và thử lại.'));
      xhr.ontimeout=()=>reject(new Error('Upload quá thời gian chờ. Hãy thử file nhỏ hơn.'));
      xhr.onload=()=>{
        let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}
        if(xhr.status<200||xhr.status>=300||!data.ok||!data.url){
          reject(new Error(data.message||`Máy chủ từ chối upload (HTTP ${xhr.status}).`));return;
        }
        target.value=data.url;
        if(preview)preview.innerHTML=`<audio controls preload="none" style="width:100%" src="${escH(data.url)}"></audio>`;
        if(status)status.textContent=`✓ Upload thành công: ${escH(data.filename||file.name)} · ${(Number(data.size||file.size)/1024/1024).toFixed(2)} MB`;
        resolve(data);
      };
      xhr.onloadend=()=>{input.disabled=false;input.value=''};
      xhr.send(fd);
    });
  }
  editor()?.addEventListener('change',async e=>{
    const input=e.target.closest('.ht-audio-file,.ht-image-file');if(!input||!input.files?.[0])return;
    const row=input.closest('.hskk-task-row');const isAudio=input.classList.contains('ht-audio-file');
    if(isAudio){
      const status=row.querySelector('.ht-audio-status');
      try{await uploadHskkAudio(input.files[0],row,input)}
      catch(err){if(status)status.textContent='✕ Upload thất bại: '+err.message;alert('Upload audio thất bại: '+err.message)}
      finally{input.disabled=false;input.value=''}
      return;
    }
    const target=row.querySelector('.ht-image');
    try{
      const fd=new FormData();fd.append('file',input.files[0],input.files[0].name);
      const d=await api('/admin/asset/upload',{method:'POST',body:fd});
      target.value=d.url;input.insertAdjacentHTML('afterend',`<small class="muted">Đã upload: ${escH(d.filename)}</small>`);
    }catch(err){alert('Upload ảnh thất bại: '+err.message)}
    finally{input.value=''}
  });
  $h('hskkExamForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const msg=$h('hskkSaveMsg');msg.textContent='Đang lưu…';
    const version=$h('hskkVersion').value,level=$h('hskkLevel').value;
    const body={id:$h('hskkExamId').value||undefined,version,level,levelLabel:levelLabel(version,level),testNo:Number($h('hskkTestNo').value||1),title:$h('hskkTitle').value.trim(),description:$h('hskkDescription').value,durationMinutes:Number($h('hskkDuration').value||20),prepMinutes:Number($h('hskkPrepTotal').value||0),content:{sections:collectSections()},published:$h('hskkPublished').checked};
    try{await api('/admin/hskk/exams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});msg.textContent='✓ Đã lưu đề HSKK.';await loadExams()}catch(err){msg.textContent='✕ '+err.message}
  });
  $h('hskkReset')?.addEventListener('click',reset);$h('hskkRefresh')?.addEventListener('click',loadExams);$h('hskkAttemptsRefresh')?.addEventListener('click',loadAttempts);
  window.loadHskkAdmin=async()=>{try{await Promise.all([checkGemini(),loadExams(),loadAttempts()])}catch(e){$h('hskkExamList').innerHTML=`<div class="notice err">${escH(e.message)}</div>`}};
  updateLevelOptions(false);
})();
