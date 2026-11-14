(()=>{
  const u=(()=>{try{return JSON.parse(localStorage.getItem('currentUser')||'null')}catch{return null}})();
  const ctas=[...document.querySelectorAll('.road-pro-top,.road-pro-float')];
  const show=()=>ctas.forEach(x=>x.classList.remove('hidden'));
  if(u?.token){fetch('/api/me/access',{headers:{Authorization:'Bearer '+u.token},cache:'no-store'}).then(r=>r.json()).then(d=>{if(!d.pro)show();}).catch(show);}else show();
  const count=()=>{try{return JSON.parse(localStorage.getItem('roadStoreCart')||'[]').reduce((a,x)=>a+Number(x.quantity||1),0)}catch{return 0}};
  const refresh=()=>document.querySelectorAll('[data-road-cart-count]').forEach(x=>x.textContent=count());refresh();window.addEventListener('storage',refresh);
})();
