(function(){
  function currentUser(){try{return JSON.parse(localStorage.getItem('currentUser')||'null')}catch{return null}}
  function authHeaders(){const u=currentUser();return u?.token?{Authorization:'Bearer '+u.token}:{};}
  function openPayment(plan){location.href=`payment.html?type=pro&plan=${encodeURIComponent(plan)}`;}
  function hideProUpsells(){
    document.querySelectorAll('[data-open-pro],[data-pro-plan]').forEach(el=>el.classList.add('pro-hidden'));
    document.querySelectorAll('.pro-banner,.pro-card-compact,#proModal').forEach(el=>el.classList.add('pro-hidden'));
    document.querySelectorAll('[data-pro-upsell]').forEach(el=>el.classList.add('pro-hidden'));
  }
  function showProUpsells(){
    document.querySelectorAll('[data-open-pro],[data-pro-plan],.pro-banner,.pro-card-compact,#proModal,[data-pro-upsell]').forEach(el=>el.classList.remove('pro-hidden'));
  }
  function ensureModal(){
    const modal=document.getElementById('proModal'); if(!modal)return;
    const open=()=>{modal.classList.add('show');modal.setAttribute('aria-hidden','false')};
    const close=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true')};
    document.querySelectorAll('[data-open-pro]').forEach(b=>b.addEventListener('click',open));
    document.querySelectorAll('[data-close-pro]').forEach(b=>b.addEventListener('click',close));
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
    document.querySelectorAll('[data-pro-plan]').forEach(b=>b.addEventListener('click',()=>openPayment(b.dataset.proPlan||'4-month')));
  }
  async function loadPro(){
    const user=currentUser();
    if(!user?.token){showProUpsells();return null;}
    try{
      const r=await fetch('/api/me/pro',{headers:authHeaders(),cache:'no-store'}); const d=await r.json();
      const active=!!(d.ok&&d.pro?.active);
      const status=document.getElementById('homeProStatus');
      if(active){
        hideProUpsells();
        if(status){status.textContent=`PRO ${d.pro.skills} SKILLS · còn ${d.pro.daysRemaining} ngày`;status.className='pro-status';}
        document.querySelectorAll('.site-student-name').forEach(x=>x.classList.add('pro-user'));
      }else{
        showProUpsells();
        if(status){status.textContent='Chưa có PRO';status.className='pro-status';}
      }
      return d.pro||null;
    }catch{
      showProUpsells();
      return null;
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{ensureModal();loadPro()});
})();
