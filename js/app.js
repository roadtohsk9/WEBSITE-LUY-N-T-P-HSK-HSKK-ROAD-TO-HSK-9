function user(){try{return JSON.parse(localStorage.getItem('currentUser')||'null')}catch{return null}}
function authHeaders(){const u=user();return u?.token?{Authorization:'Bearer '+u.token}: {}}
function logout(){localStorage.removeItem('currentUser');location.href='index.html'}
function displayName(fullname){const parts=String(fullname||'').trim().split(/\s+/).filter(Boolean);if(parts.length<=2)return parts.join(' ');return `${parts[0]} ${parts[parts.length-1]}`;}
function greeting(fullname){return `Xin chào, ${displayName(fullname)||'Học viên'}`;}

function goToLogin(target){
  if(target) localStorage.setItem('loginRedirect', target);
  location.href='login.html';
}

function normalizeLoginData(form){
  const d=Object.fromEntries(new FormData(form));
  d.username=String(d.username||'').trim();
  d.password=String(d.password||'');
  return d;
}

async function readApiResponse(r){
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{}
  if(!data){
    throw Error(r.ok?'Unexpected server response. Please try again.':'Unable to connect to the EIT server. Please make sure the server is running.');
  }
  return data;
}

// Login page: after a successful login, return the candidate to the page
// they originally selected (HSK Reading / Listening).
if(location.pathname.endsWith('/login.html')){
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.target;
    const err=document.getElementById('errorMessage');
    const button=form.querySelector('button[type=submit]');
    err.textContent='';
    const d=normalizeLoginData(form);
    if(button){button.disabled=true;button.textContent='Đang đăng nhập...';}
    try{
      const r=await fetch('/api/candidate/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(d)});
      const x=await readApiResponse(r);
      if(!r.ok || !x.ok)throw Error(x.message||'Username hoặc password chưa chính xác. Vui lòng thử lại.');
      if(!x.token || !x.user)throw Error('Login succeeded but the server did not return a valid session. Please try again.');
      localStorage.setItem('currentUser',JSON.stringify({...x.user,token:x.token}));
      const redirect=localStorage.getItem('loginRedirect')||'index.html';
      localStorage.removeItem('loginRedirect');
      location.href=redirect;
    }catch(ex){
      err.textContent=ex.message||'Unable to sign in.';
    }finally{
      if(button){button.disabled=false;button.textContent='ĐĂNG NHẬP';}
    }
  });
}

// Test Centre requires an EIT-issued student account.
if(location.pathname.endsWith('/test-centre.html')){
  if(!user()?.token){goToLogin('test-centre.html');}
  else document.addEventListener('DOMContentLoaded',()=>{
    const u=user(); document.getElementById('userName').textContent=greeting(u.username||u.registrationid||u.eitcode||u.fullname);
    const logoutBtn=document.getElementById('logout'); if(logoutBtn) logoutBtn.onclick=logout;
    if(localStorage.getItem('listeningCompleted')==='1')document.getElementById('listenStatus').textContent='Completed →';
    if(localStorage.getItem('readingCompleted')==='1')document.getElementById('readStatus')?.replaceChildren(document.createTextNode('Completed →'));
    if(localStorage.getItem('writingCompleted')==='1')document.getElementById('writeStatus')?.replaceChildren(document.createTextNode('Completed →'));
    if(localStorage.getItem('speakingCompleted')==='1')document.getElementById('speakStatus')?.replaceChildren(document.createTextNode('Completed →'));
    const done=['listening','reading','writing','speaking'].filter(k=>localStorage.getItem(k+'Completed')==='1').length;
    const banner=document.querySelector('.pro-card-compact'); if(done>0&&banner){banner.querySelector('h3').textContent=`Bạn đã hoàn thành ${done}/4 kỹ năng`; banner.querySelector('p').textContent='Tiếp tục luyện hoặc gia hạn EIT PRO để nhận feedback kỹ hơn, phân tích lỗi sai và tài liệu độc quyền.';}
  });
}

// Protect direct visits to an exam page as well.
// This prevents bypassing the login by typing exam-reading.html, etc.
const protectedExamPages=['exam-listening.html','exam-reading.html','exam-writing.html','exam-speaking.html','practice-test.html'];
const currentPage=location.pathname.split('/').pop();
if(protectedExamPages.includes(currentPage) && !user()?.token){
  goToLogin(currentPage);
}


// Shared header auth state for public/practice pages.
document.addEventListener('DOMContentLoaded',()=>{
  const u=user();
  const loginLink=document.getElementById('loginLink');
  const menu=document.getElementById('studentMenu');
  const logoutBtn=document.getElementById('studentLogout');
  if(u?.token){
    loginLink?.classList.add('hidden');
    if(menu){menu.classList.remove('hidden');menu.textContent=greeting(u.username||u.registrationid||u.eitcode||u.fullname);}
    if(logoutBtn){logoutBtn.hidden=false;logoutBtn.addEventListener('click',logout);}
    document.getElementById('loginNotice')?.classList.add('hidden');
  }else{
    menu?.classList.add('hidden');
    if(logoutBtn)logoutBtn.hidden=true;
  }
});

// Generic public navigation auth state: normalize each public navbar to exactly one greeting and one logout control.
document.addEventListener('DOMContentLoaded',()=>{
  const u=user();
  document.querySelectorAll('.nav-actions').forEach(actions=>{
    // Remove only controls previously injected by this normalizer.
    actions.querySelectorAll('.site-student-name,.site-auth-logout,[data-auth-logout]').forEach(el=>el.remove());
    // Keep one canonical pair if the page already provides placeholders.
    const login=actions.querySelector('a[href="login.html"]');
    const menus=[...actions.querySelectorAll('.student-menu')];
    const outs=[...actions.querySelectorAll('#studentLogout,.student-logout')];
    menus.slice(1).forEach(el=>el.remove());
    outs.slice(1).forEach(el=>el.remove());
    let name=menus[0]||null;
    let out=outs[0]||null;
    if(u?.token){
      login?.classList.add('hidden');
      if(!name){
        name=document.createElement('span'); name.className='btn student-menu'; name.type='button';
        actions.insertBefore(name,login||actions.firstChild);
      }
      name.classList.remove('hidden'); name.removeAttribute('hidden'); name.textContent=greeting(u.username||u.registrationid||u.eitcode||u.fullname);
      if(!out){
        out=document.createElement('button'); out.type='button'; out.className='btn site-auth-logout';
        actions.insertBefore(out,login||null);
      }
      out.classList.remove('hidden'); out.removeAttribute('hidden'); out.textContent='Đăng xuất';
      out.onclick=logout;
      // Hide any stale duplicate logout links/buttons with legacy text.
      actions.querySelectorAll('button,a').forEach(el=>{
        if(el===login||el===name||el===out||el.classList.contains('btn-red')) return;
        if((el.textContent||'').trim().toLowerCase()==='đăng xuất') el.classList.add('hidden');
      });
    }else{
      login?.classList.remove('hidden');
      if(name){name.classList.add('hidden');name.setAttribute('hidden','hidden');}
      if(out){out.classList.add('hidden');out.setAttribute('hidden','hidden');}
    }
  });
});

// Lock all practice / mock-test entry points behind EIT login.
document.addEventListener('DOMContentLoaded',()=>{
  if(user()?.token)return;
  document.querySelectorAll('a[href*="practice.html"],a[href="test-centre.html"],a[href*="exam-"]').forEach(a=>{
    a.addEventListener('click',e=>{e.preventDefault();goToLogin(a.getAttribute('href'));});
  });
});
