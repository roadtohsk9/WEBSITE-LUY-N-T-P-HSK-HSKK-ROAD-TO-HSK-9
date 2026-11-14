const $=id=>document.getElementById(id);
function currentUser(){try{return JSON.parse(localStorage.getItem("currentUser")||"null")}catch{return null}}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function hasText(v){return String(v??'').trim()!==''}
function renderFeedback(fb){
  if(!fb||typeof fb!=='object')return '';
  const criteria=fb.criteria||{};
  const rows=Object.entries(criteria).filter(([,v])=>hasText(v));
  const labels={taskResponse:'Task Response / Task Achievement',coherence:'Coherence & Cohesion',lexical:'Lexical Resource',grammar:'Grammatical Range & Accuracy',fluency:'Fluency & Coherence',pronunciation:'Pronunciation'};
  const criteriaHtml=rows.length?`<div class="feedback-criteria">${rows.map(([k,v])=>`<div class="feedback-criterion"><span>${esc(labels[k]||k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`:'';
  const section=(title,val)=>hasText(val)?`<div class="feedback-block"><h4>${esc(title)}</h4><p>${esc(val)}</p></div>`:'';
  return `<section class="feedback-result"><div class="section-kicker">TEACHER FEEDBACK</div><h2>Feedback từ EIT</h2>${criteriaHtml}${section('Task 1',fb.task1)}${section('Task 2',fb.task2)}${section('Part 1',fb.part1)}${section('Part 2',fb.part2)}${section('Part 3',fb.part3)}${section('Điểm mạnh',fb.strengths)}${section('Điểm cần cải thiện',fb.improvements)}${section('Gợi ý học tiếp / sửa bài',fb.nextSteps)}${section('Nhận xét chung',fb.summary)}</section>`;
}
async function loadResult(){
  const u=currentUser();if(!u){location.href="login.html";return}
  $("logout").onclick=()=>{localStorage.removeItem("currentUser");location.href="login.html"};
  const q=new URLSearchParams({studentCode:u.registrationid||"",eitCode:u.eitcode||"",studentEmail:u.email||""});
  try{const r=await fetch("/api/results?"+q.toString(),{cache:"no-store",headers:(u.token?{Authorization:"Bearer "+u.token}:{})});const d=await r.json();if(!r.ok)throw Error(d.message||"Unable to load results");
    if(!d.published){$("resultState").innerHTML='<div class="state-card"><div class="state-icon line-icon"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/></svg></div><h2>Results are not available yet</h2><p>Your test has been submitted. EIT will publish your results here when they are ready.</p></div>';return}
    $("resultState").classList.add("hidden");$("resultContent").classList.remove("hidden");const x=d.result;
    const set=(id,v)=>$(id).textContent=v==null||v===""?"—":Number(v).toFixed(1);
    set("scoreListening",x.listening);set("scoreReading",x.reading);set("scoreWriting",x.writing);set("scoreSpeaking",x.speaking);set("overallScore",x.overall);set("overallRing",x.overall);
    $("resultSub").textContent=`${x.testSessionCount||0} completed skill submission${x.testSessionCount===1?"":"s"} · Results released by EIT`;
    $("statusTitle").textContent="Results released";$("statusText").textContent=x.message||"Your results have been released by EIT.";
    const feedback=renderFeedback(x.feedback); let old=document.getElementById('feedbackResult'); if(!old){old=document.createElement('div');old.id='feedbackResult';document.getElementById('resultContent').appendChild(old)} old.innerHTML=feedback;
  }catch(e){$("resultState").innerHTML=`<div class="state-card error-state"><h2>Unable to load results</h2><p>${esc(e.message)}</p></div>`}}
loadResult();
