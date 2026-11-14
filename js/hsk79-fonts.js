(function(){
  'use strict';
  const DEFAULTS={zh:'Noto Sans SC',vi:'Be Vietnam Pro'};
  const OPTIONS={
    zh:['Noto Sans SC','Microsoft YaHei','SimSun','Arial'],
    vi:['Be Vietnam Pro','Arial','system-ui']
  };
  const $=id=>document.getElementById(id);
  function read(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem('hsk79Fonts')||'{}')}}catch{return {...DEFAULTS}}}
  function apply(p=read()){
    const clean=v=>String(v||'').replace(/["'\\;]/g,'');
    document.documentElement.style.setProperty('--font-zh',`"${clean(p.zh)}"`);
    document.documentElement.style.setProperty('--font-vn',`"${clean(p.vi)}"`);
    if(document.body){document.body.style.fontFamily=`var(--font-vn),"Noto Sans SC",sans-serif`;}
    const styleId='hsk79-font-overrides';let style=$(styleId);
    if(!style){style=document.createElement('style');style.id=styleId;document.head.appendChild(style)}
    style.textContent=`:lang(zh),:lang(zh-CN),:lang(zh-TW),[lang="zh"],[lang="zh-CN"],.hanzi,.chinese,.chinese-text,.hanzi-text,.zh-text{font-family:var(--font-zh),"Noto Sans SC",sans-serif!important}input,textarea,select,button{font-family:var(--font-vn),"Noto Sans SC",sans-serif}`;
    try{localStorage.setItem('hsk79Fonts',JSON.stringify(p))}catch{}
  }
  function populate(id,key){const el=$(id);if(!el)return;const p=read();el.innerHTML=OPTIONS[key].map(f=>`<option value="${f.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" ${p[key]===f?'selected':''}>${f}</option>`).join('');el.addEventListener('change',()=>{const next=read();next[key]=el.value;apply(next)})}
  function init(){apply();populate('adminFontChinese','zh');populate('adminFontVietnamese','vi')}
  window.HSK79Fonts={read,apply};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
