(function(){
  const LEGACY_KEY='EIT_PERSONALIZATION_V1';
  const DEFAULT={history:[],vocabulary:[],collocations:[],synonyms:[],antonyms:[],structures:[]};
  const identity=(()=>{try{const u=JSON.parse(localStorage.getItem('currentUser')||'null');return u?.token?(u.username||u.registrationid||u.eitcode||u.userId||u.id||''):''}catch{return ''}})();
  const KEY=identity?`${LEGACY_KEY}:${encodeURIComponent(String(identity).trim().toLowerCase())}`:LEGACY_KEY;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const read=()=>{try{let raw=localStorage.getItem(KEY);if(!raw&&KEY!==LEGACY_KEY){raw=localStorage.getItem(LEGACY_KEY);if(raw){localStorage.setItem(KEY,raw);localStorage.removeItem(LEGACY_KEY)}}return {...DEFAULT,...JSON.parse(raw||'{}')}}catch{return {...DEFAULT}}};
  const write=d=>localStorage.setItem(KEY,JSON.stringify(d));
  function makeId(){return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
  function saveHistory(item){const d=read();const clean={...item,id:item.id||makeId(),completedAt:item.completedAt||new Date().toISOString()};d.history=[clean,...d.history.filter(x=>!(x.testId===clean.testId&&x.completedAt===clean.completedAt))].slice(0,100);write(d);return clean;}
  function add(type,item){if(!['vocabulary','collocations','synonyms','antonyms','structures'].includes(type))return null;const d=read();const word=String(item?.word||item?.term||'').trim();if(!word)return null;const existing=d[type].find(x=>String(x.word||x.term).toLowerCase()===word.toLowerCase());if(existing)return existing;const x={id:makeId(),word,meaning:String(item.meaning||''),example:String(item.example||''),testId:String(item.testId||''),testTitle:String(item.testTitle||''),skill:String(item.skill||''),source:String(item.source||'Manual note'),createdAt:new Date().toISOString()};d[type]=[x,...d[type]].slice(0,300);write(d);return x;}
  function remove(type,id){const d=read();if(d[type])d[type]=d[type].filter(x=>x.id!==id);write(d)}
  async function dictionary(word){
    const q=String(word||'').trim(); if(!q)throw Error('Nhập từ cần tra.');
    const normalize=data=>{const e=data?.[0]||{};const phonetics=(e.phonetics||[]).filter(Boolean);const meanings=(e.meanings||[]).slice(0,6).map(m=>({partOfSpeech:m.partOfSpeech||'',defs:(m.definitions||[]).slice(0,4).map(x=>({definition:x.definition||'',example:x.example||'',synonyms:x.synonyms||[],antonyms:x.antonyms||[]})),synonyms:[...(m.synonyms||[])],antonyms:[...(m.antonyms||[])]}));if(!meanings.length)throw Error('Không có dữ liệu định nghĩa cho từ này.');const synonyms=[...new Set(meanings.flatMap(m=>[...(m.synonyms||[]),...m.defs.flatMap(x=>x.synonyms||[])].filter(Boolean)))].slice(0,12);const antonyms=[...new Set(meanings.flatMap(m=>[...(m.antonyms||[]),...m.defs.flatMap(x=>x.antonyms||[])].filter(Boolean)))].slice(0,12);return {word:e.word||q,phonetic:e.phonetic||phonetics.find(x=>x.text)?.text||'',audio:phonetics.find(x=>x.audio)?.audio||'',meanings,synonyms,antonyms};};
    async function request(url,ms){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),ms);try{const r=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});const data=await r.json().catch(()=>null);if(!r.ok||!data)throw Error('lookup failed');return data}finally{clearTimeout(timer)}}
    const isChinese=/[\u3400-\u9fff]/.test(q);try{return normalize((await request('/api/dictionary?word='+encodeURIComponent(q),8000)).data)}catch(e){if(isChinese)throw Error('Chưa tra được từ tiếng Trung lúc này. Bạn có thể mở từ điển Trung–Việt ở liên kết bên dưới.')}
    if(isChinese)throw Error('Không tìm thấy dữ liệu từ điển Trung–Việt cho từ này.');
    return normalize(await request('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(q),6000));
  }
  function dictionaryHTML(d){
    const meanings=(d.meanings||[]).map(m=>`<div class="dict-def"><b>${esc(m.partOfSpeech)}</b>${(m.defs||[]).map(x=>`<div>${esc(x.definition)}${x.example?`<br><em>${esc(x.example)}</em>`:''}</div>`).join('')}</div>`).join('');
    const syn=(d.synonyms||[]).length?`<div class="dict-related"><b>Synonyms</b><div>${d.synonyms.map(esc).join(' · ')}</div></div>`:'';
    const ant=(d.antonyms||[]).length?`<div class="dict-related"><b>Antonyms</b><div>${d.antonyms.map(esc).join(' · ')}</div></div>`:'';
    const audio=d.audio?`<button type="button" class="dict-audio" data-audio="${esc(d.audio)}">🔊 Phát âm</button>`:'';
    return `<div class="dict-title"><div><b>${esc(d.word)}</b><span class="dict-meta">${esc(d.phonetic)}</span></div>${audio}</div>${meanings}${syn}${ant}`;
  }
  function translateUrl(word){const w=String(word||'');const sl=/[\u3400-\u9fff]/.test(w)?'zh-CN':'en';return 'https://translate.google.com/?sl='+sl+'&tl=vi&text='+encodeURIComponent(w)+'&op=translate'}
  function hanziiUrl(){return 'https://hanzii.net/?hl=vi'}
  window.EITPersonal={KEY,read,write,saveHistory,add,remove,dictionary,dictionaryHTML,translateUrl,hanziiUrl,esc};
})();
