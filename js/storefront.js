(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const money=n=>Math.round(Number(n)||0).toLocaleString('vi-VN')+' ₫';
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const user=()=>{try{return JSON.parse(localStorage.getItem('currentUser')||'null')}catch{return null}};
  let products=[],defaultVatRate=8,catalogLoaded=false;
  const cartKey='roadStoreCart';
  const getCart=()=>{try{const value=JSON.parse(localStorage.getItem(cartKey)||'[]');return Array.isArray(value)?value:[]}catch{return []}};
  const product=id=>products.find(p=>String(p.id)===String(id));
  const toast=msg=>{const el=$('storeToast');if(!el)return;el.textContent=msg;el.classList.remove('hidden');clearTimeout(window.storeToastTimer);window.storeToastTimer=setTimeout(()=>el.classList.add('hidden'),2600)};
  const taxRate=p=>p.vatRate===null||p.vatRate===undefined?defaultVatRate:Number(p.vatRate);

  function setCart(cart){
    const normalized=(Array.isArray(cart)?cart:[]).filter(x=>x&&x.productId!==undefined)
      .map(x=>({productId:String(x.productId),quantity:Math.max(1,Math.min(10,Math.floor(Number(x.quantity)||1)))}));
    localStorage.setItem(cartKey,JSON.stringify(normalized));
    renderCart();
    window.dispatchEvent(new CustomEvent('road:cart-updated'));
  }

  function renderCards(type,target){
    const node=$(target);if(!node)return;
    const rows=products.filter(p=>p.type===type);
    node.innerHTML=rows.length?rows.map((p,i)=>`<article class="product-card" style="animation-delay:${Math.min(i,8)*55}ms"><div class="product-cover">${p.coverUrl?`<img src="${safe(p.coverUrl)}" alt="${safe(p.title)}" loading="lazy">`:`<div class="cover-mark">${type==='pro'?'PRO ✦':'▤'}</div>`}</div><div class="product-body"><div class="product-type">${type==='pro'?'✦ ROAD MEMBERSHIP':'▤ DIGITAL MATERIAL'}</div><h3>${safe(p.title)}</h3><div class="product-sub">${safe(p.subtitle||'')}</div><div class="product-desc">${safe(p.description||'')}</div><ul class="product-features">${(p.features||[]).slice(0,7).map(x=>`<li>${safe(x)}</li>`).join('')}</ul><div class="price-row"><div class="price">${money(p.price)}<small>${p.durationDays?`${p.durationDays} ngày sử dụng`:type==='document'?'Sở hữu trong tài khoản':''}</small></div><div class="product-tax">VAT ${taxRate(p)}%<br>được tính ở checkout</div></div><div class="product-actions"><button class="btn-add" type="button" data-add="${safe(p.id)}">＋ Giỏ hàng</button><button class="btn-buy" type="button" data-buy="${safe(p.id)}">Mua ngay</button></div></div></article>`).join(''):`<div class="doc-empty">${type==='pro'?'Chưa có gói PRO đang bán.':'Admin chưa đăng tài liệu nào. Hãy quay lại sau nhé.'}</div>`;
  }

  function renderCart(){
    const raw=getCart();
    if(!catalogLoaded){
      const count=raw.reduce((n,x)=>n+Math.max(1,Math.min(10,Math.floor(Number(x?.quantity)||1))),0);
      if($('topCartCount'))$('topCartCount').textContent=count;
      if($('taskCartCount'))$('taskCartCount').textContent=count;
      if($('cartSubtotal'))$('cartSubtotal').textContent='Đang cập nhật…';
      if($('cartItems'))$('cartItems').innerHTML='<div class="cart-empty">Đang tải thông tin sản phẩm để cập nhật giỏ hàng…</div>';
      $('checkoutLink')?.classList.add('hidden');
      return;
    }
    const rows=raw.map(x=>({productId:String(x?.productId??''),quantity:Math.max(1,Math.min(10,Math.floor(Number(x?.quantity)||1)))}))
      .filter(x=>product(x.productId)).map(x=>({...x,p:product(x.productId)}));
    // Remove stale catalog IDs so checkout and the visible cart always match.
    if(JSON.stringify(raw)!==JSON.stringify(rows.map(({productId,quantity})=>({productId,quantity})))){
      localStorage.setItem(cartKey,JSON.stringify(rows.map(({productId,quantity})=>({productId,quantity}))));
    }
    const sum=rows.reduce((a,x)=>a+(Number(x.p.price)||0)*x.quantity,0);
    const count=rows.reduce((a,x)=>a+x.quantity,0);
    if($('topCartCount'))$('topCartCount').textContent=count;
    if($('taskCartCount'))$('taskCartCount').textContent=count;
    if($('cartSubtotal'))$('cartSubtotal').textContent=money(sum);
    if($('cartVatLine'))$('cartVatLine').textContent='VAT sẽ được tính theo cấu hình sản phẩm tại bước thanh toán.';
    const el=$('cartItems');if(!el)return;
    if(!rows.length){
      el.innerHTML='<div class="cart-empty">Giỏ hàng đang trống. Chọn gói PRO hoặc tài liệu phía trên để thêm vào nhé.</div>';
      $('checkoutLink')?.classList.add('hidden');return;
    }
    $('checkoutLink')?.classList.remove('hidden');
    el.innerHTML=rows.map(x=>`<div class="cart-line" data-cart-product="${safe(x.productId)}"><div class="cart-product-info"><b>${safe(x.p.title)}</b><small>${x.p.type==='pro'?'Gói PRO':'Tài liệu'} · ${money(x.p.price)}/món</small></div><div class="qty-ctrl"><button type="button" data-dec="${safe(x.productId)}" aria-label="Giảm số lượng ${safe(x.p.title)}">−</button><em>${x.quantity}</em>${x.p.type==='document'?'<span class="qty-fixed" title="Mỗi tài liệu một bản">×1</span>':`<button type="button" data-inc="${safe(x.productId)}" aria-label="Tăng số lượng ${safe(x.p.title)}">+</button>`}</div><strong>${money((Number(x.p.price)||0)*x.quantity)}</strong><button class="cart-remove" type="button" data-remove="${safe(x.productId)}" aria-label="Xóa ${safe(x.p.title)} khỏi giỏ hàng">Xóa</button></div>`).join('');
  }

  function add(id,go=false){
    const p=product(id);if(!p){toast('Không tìm thấy sản phẩm. Vui lòng tải lại cửa hàng.');return;}
    const cart=getCart();const row=cart.find(x=>String(x.productId)===String(id));
    if(row){
      if(p.type==='document'){toast('Tài liệu này đã có trong giỏ hàng.');return;}
      if(Number(row.quantity)>=10){toast('Mỗi sản phẩm tối đa 10 món trong một đơn.');return;}
      row.quantity=Math.min(10,(Number(row.quantity)||1)+1);
    }else cart.push({productId:String(id),quantity:1});
    setCart(cart);toast(`Đã thêm “${p.title}” vào giỏ hàng.`);if(go)location.href='/checkout.html';
  }

  function removeItem(id){
    const before=getCart();const after=before.filter(x=>String(x?.productId)!==String(id));
    if(after.length===before.length)return;
    setCart(after);const p=product(id);toast(`Đã xóa “${p?.title||'sản phẩm'}” khỏi giỏ hàng.`);
  }

  function changeQuantity(id,delta){
    const cart=getCart();const row=cart.find(x=>String(x?.productId)===String(id));if(!row)return;
    const p=product(id);
    if(delta>0&&p?.type==='document'){toast('Mỗi tài liệu chỉ mua một lần trong một đơn hàng.');return;}
    const next=(Number(row.quantity)||1)+delta;
    if(next<=0){removeItem(id);return;}
    row.quantity=Math.min(10,next);setCart(cart);
  }

  document.addEventListener('click',async e=>{
    const download=e.target.closest('[data-download]');
    if(download){
      e.preventDefault();const u=user();if(!u?.token){location.href='/login.html';return;}
      download.textContent='Đang tải…';
      try{const r=await fetch(download.dataset.download,{headers:{Authorization:'Bearer '+u.token}});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.message||'Không thể tải tài liệu.');}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=download.dataset.filename||'tai-lieu';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);download.textContent='Tải về ↓';}
      catch(err){toast(err.message);download.textContent='Tải về ↓';}return;
    }
    const addBtn=e.target.closest('[data-add]'),buyBtn=e.target.closest('[data-buy]'),inc=e.target.closest('[data-inc]'),dec=e.target.closest('[data-dec]'),remove=e.target.closest('[data-remove]');
    if(remove){e.preventDefault();removeItem(remove.dataset.remove);return;}
    if(addBtn){add(addBtn.dataset.add);return;}
    if(buyBtn){add(buyBtn.dataset.buy,true);return;}
    if(inc){changeQuantity(inc.dataset.inc,1);return;}
    if(dec){changeQuantity(dec.dataset.dec,-1);return;}
  });

  async function loadOwned(){
    const u=user(),el=$('myDocuments');if(!el)return;
    if(!u?.token){el.innerHTML='<div class="mydocs-empty">Đăng nhập để xem tài liệu bạn đã mua. <a href="/login.html" style="color:#1d4ed8;font-weight:900">Đăng nhập ↗</a></div>';return;}
    try{const r=await fetch('/api/store/my-documents',{headers:{Authorization:'Bearer '+u.token}});const d=await r.json();if(!r.ok)throw Error(d.message);el.innerHTML=d.documents?.length?d.documents.map(x=>`<article class="mydoc"><div class="mydoc-icon">▤</div><div><h3>${safe(x.title)}</h3><p>${safe(x.fileName||'Tài liệu đã mở khóa')}</p></div><a href="#" data-download="${safe(x.downloadUrl)}" data-filename="${safe(x.fileName||x.title+'.pdf')}">Tải về ↓</a></article>`).join(''):'<div class="mydocs-empty">Bạn chưa sở hữu tài liệu nào. Các tài liệu đã mua sẽ xuất hiện ở đây.</div>';}
    catch(e){el.innerHTML=`<div class="mydocs-empty">${safe(e.message)}</div>`;}
  }

  async function loadProStatus(){
    const u=user();if(!u?.token)return;
    try{const r=await fetch('/api/me/access',{headers:{Authorization:'Bearer '+u.token}});const d=await r.json();if(r.ok&&d.pro){if($('activeProNotice'))$('activeProNotice').style.display='block';if($('activeProText'))$('activeProText').textContent=`Đang có quyền PRO đến ${new Date(d.pro.expiresAt).toLocaleDateString('vi-VN')}. Bạn vẫn có thể mua riêng tài liệu trong cửa hàng.`;$('pro')?.classList.add('hidden');}}
    catch{}
  }

  async function init(){
    renderCart();
    try{const r=await fetch('/api/store/catalog');const d=await r.json();if(!r.ok)throw Error(d.message||'Không thể tải cửa hàng.');products=Array.isArray(d.products)?d.products:[];defaultVatRate=Number(d.defaultVatRate??8);catalogLoaded=true;renderCards('pro','proProducts');renderCards('document','documentProducts');renderCart();await Promise.all([loadOwned(),loadProStatus()]);}
    catch(e){if($('proProducts'))$('proProducts').innerHTML=`<div class="doc-empty">${safe(e.message)}</div>`;if($('documentProducts'))$('documentProducts').innerHTML='<div class="doc-empty">Không thể tải tài liệu.</div>';}
  }

  window.addEventListener('storage',e=>{if(e.key===cartKey)renderCart();});
  window.addEventListener('road:cart-updated',renderCart);
  init();
})();
