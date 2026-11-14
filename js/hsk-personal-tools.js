(function () {
  if (!window.EITPersonal || document.getElementById('hskToolDock')) return;
  const esc = window.EITPersonal.esc;
  let activeDrawer = null;
  let reviewIndex = 0;
  let meaningShown = false;

  function meta() {
    try { return typeof window.getHSKPersonalMeta === 'function' ? window.getHSKPersonalMeta() : {}; }
    catch { return {}; }
  }
  function closeDrawer() {
    document.getElementById('hskToolBackdrop')?.remove();
    document.getElementById('hskToolDrawer')?.remove();
    activeDrawer = null;
  }
  function dock() {
    const el = document.createElement('nav');
    el.id = 'hskToolDock';
    el.className = 'hsk-tool-dock';
    el.setAttribute('aria-label', 'Tiện ích học tập');
    el.innerHTML = `
      <button class="hsk-tool-btn primary" type="button" data-tool="dictionary" title="Tra từ điển">⌕ <span>Từ điển</span></button>
      <button class="hsk-tool-btn" type="button" data-tool="note" title="Ghi chú từ mới">✎ <span>Ghi chú</span></button>
      <button class="hsk-tool-btn" type="button" data-tool="review" title="Ôn từ vựng đã lưu">▣ <span>Ôn từ</span></button>
      <a class="hsk-tool-btn" href="/personalization.html" title="Kho cá nhân">✦ <span>Cá nhân</span></a>`;
    el.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => openDrawer(btn.dataset.tool)));
    document.body.appendChild(el);
  }
  function openDrawer(mode) {
    closeDrawer();
    activeDrawer = mode;
    const back = document.createElement('div');
    back.id = 'hskToolBackdrop'; back.className = 'hsk-tool-backdrop'; back.addEventListener('click', closeDrawer);
    const drawer = document.createElement('aside');
    drawer.id = 'hskToolDrawer'; drawer.className = 'hsk-tool-drawer';
    const titles = { dictionary: ['Từ điển nhanh', 'Tra từ tiếng Trung hoặc tiếng Anh, xem nghĩa và lưu ngay vào sổ từ vựng.'], note: ['Ghi chú từ mới', 'Ghi từ, nghĩa và ví dụ từ bài đọc/nghe để ôn lại sau.'], review: ['Ôn từ vựng', 'Tự kiểm tra nghĩa của các từ bạn đã lưu.'] };
    const [title, desc] = titles[mode] || titles.dictionary;
    let body = '';
    if (mode === 'dictionary') body = `
      <form id="hskToolDictionaryForm"><div class="field"><label for="hskToolWord">Từ / cụm từ cần tra</label><input id="hskToolWord" autocomplete="off" placeholder="Ví dụ: 坚持 / 影响 / improve" required></div><div class="hsk-tool-actions"><button type="submit">Tra từ</button><a id="hskToolTranslate" href="https://translate.google.com/" target="_blank" rel="noopener">Google Translate</a><a id="hskToolExternalDict" href="https://hanzii.net/?hl=vi" target="_blank" rel="noopener">Từ điển Hanzii</a></div></form>
      <div id="hskToolDictStatus" class="hsk-tool-status" aria-live="polite"></div><div id="hskToolDictResult" class="dict-result hidden"></div>`;
    else if (mode === 'note') body = `
      <form id="hskToolNoteForm"><div class="field"><label for="hskNoteWord">Từ vựng / cụm từ *</label><input id="hskNoteWord" autocomplete="off" placeholder="汉字 / pinyin / từ tiếng Anh" required></div><div class="field"><label for="hskNoteMeaning">Nghĩa tiếng Việt</label><textarea id="hskNoteMeaning" placeholder="Ghi nghĩa, cách dùng hoặc mẹo ghi nhớ…"></textarea></div><div class="field"><label for="hskNoteExample">Câu ví dụ / ngữ cảnh</label><textarea id="hskNoteExample" placeholder="Chép câu có chứa từ mới…"></textarea></div><div class="hsk-tool-actions"><button type="submit">Lưu vào sổ từ vựng</button><button id="hskNoteLookup" type="button">Tra từ này</button></div><div id="hskNoteStatus" class="hsk-tool-status" aria-live="polite"></div></form>`;
    else body = `<div id="hskFlashcardArea"></div><div class="hsk-tool-actions"><button type="button" id="hskRevealMeaning">Hiện nghĩa</button><button type="button" id="hskNextFlashcard">Từ tiếp theo →</button><a href="/personalization.html">Quản lý danh sách từ</a></div><div id="hskFlashStatus" class="hsk-tool-status"></div>`;
    drawer.innerHTML = `<div class="hsk-tool-head"><div><h3>${title}</h3><p>${desc}</p></div><button type="button" id="hskToolClose" class="hsk-tool-close" aria-label="Đóng">×</button></div>${body}`;
    document.body.append(back, drawer);
    drawer.querySelector('#hskToolClose').addEventListener('click', closeDrawer);
    if (mode === 'dictionary') wireDictionary(drawer);
    if (mode === 'note') wireNote(drawer);
    if (mode === 'review') wireReview(drawer);
    drawer.querySelector('input')?.focus({ preventScroll: true });
  }
  function wireDictionary(drawer) {
    const form = drawer.querySelector('#hskToolDictionaryForm');
    const input = drawer.querySelector('#hskToolWord');
    const status = drawer.querySelector('#hskToolDictStatus');
    const out = drawer.querySelector('#hskToolDictResult');
    const translate = drawer.querySelector('#hskToolTranslate');
    const external = drawer.querySelector('#hskToolExternalDict');
    const setLinks = word => {
      translate.href = window.EITPersonal.translateUrl(word);
      external.href = window.EITPersonal.hanziiUrl();
      external.textContent = 'Từ điển Hanzii';
    };
    external.addEventListener('click', e => {
      e.preventDefault();
      const word = input.value.trim();
      window.open(window.EITPersonal.hanziiUrl(), '_blank', 'noopener,noreferrer');
      const statusText = word ? 'Đã mở Hanzii. Hãy dán hoặc nhập từ cần tra vào ô tìm kiếm của Hanzii.' : 'Đã mở từ điển Hanzii.';
      if (word && navigator.clipboard?.writeText) navigator.clipboard.writeText(word).then(() => { status.textContent = `Đã sao chép “${word}”. ${statusText}`; }).catch(() => { status.textContent = statusText; });
      else status.textContent = statusText;
    });
    const search = async word => {
      word = String(word || input.value || '').trim(); if (!word) { input.focus(); return; }
      input.value = word; setLinks(word); out.classList.remove('hidden'); out.innerHTML = '<div class="muted">Đang tra từ…</div>'; status.textContent = '';
      try {
        const d = await window.EITPersonal.dictionary(word);
        const first = d.meanings?.[0]?.defs?.[0] || {};
        out.innerHTML = window.EITPersonal.dictionaryHTML(d) + '<div class="hsk-tool-actions"><button type="button" id="hskSaveDictionaryWord">+ Lưu vào từ vựng</button></div>';
        out.querySelectorAll('[data-audio]').forEach(b => b.addEventListener('click', () => { try { new Audio(b.dataset.audio).play(); } catch {} }));
        out.querySelector('#hskSaveDictionaryWord').addEventListener('click', () => {
          window.EITPersonal.add('vocabulary', { word: d.word, meaning: first.definition || '', example: first.example || '', ...meta(), source: 'Từ điển' });
          status.textContent = `Đã lưu “${d.word}” vào sổ từ vựng.`;
        });
        setLinks(d.word);
      } catch (err) {
        out.innerHTML = `<div class="dict-fallback"><b>Chưa lấy được nghĩa tự động.</b><p>Bạn vẫn có thể mở từ điển Hanzii hoặc Google Translate để tra từ này.</p></div>`;
        status.textContent = err?.message || 'Không thể tra từ lúc này.';
      }
    };
    form.addEventListener('submit', e => { e.preventDefault(); search(input.value); });
    input.addEventListener('input', () => { const w = input.value.trim(); if (w) setLinks(w); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    drawer._searchWord = search;
  }
  function wireNote(drawer) {
    const form = drawer.querySelector('#hskToolNoteForm');
    const word = drawer.querySelector('#hskNoteWord');
    const status = drawer.querySelector('#hskNoteStatus');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const w = word.value.trim(); if (!w) { word.focus(); return; }
      window.EITPersonal.add('vocabulary', { word: w, meaning: drawer.querySelector('#hskNoteMeaning').value.trim(), example: drawer.querySelector('#hskNoteExample').value.trim(), ...meta(), source: 'Ghi chú nhanh' });
      status.textContent = `✓ Đã lưu “${w}” vào danh sách từ vựng cá nhân.`;
      drawer.querySelector('#hskNoteForm').reset(); word.focus();
    });
    drawer.querySelector('#hskNoteLookup').addEventListener('click', () => {
      const w = word.value.trim(); if (!w) { word.focus(); return; }
      closeDrawer(); openDrawer('dictionary');
      const input = document.getElementById('hskToolWord'); input.value = w;
      document.getElementById('hskToolDictionaryForm').requestSubmit();
    });
  }
  function wireReview(drawer) {
    const area = drawer.querySelector('#hskFlashcardArea');
    const status = drawer.querySelector('#hskFlashStatus');
    const items = () => (window.EITPersonal.read().vocabulary || []).filter(x => String(x.word || x.term || '').trim());
    function renderCard() {
      const list = items();
      if (!list.length) {
        area.innerHTML = '<div class="empty-personal">Chưa có từ vựng được lưu. Dùng nút Ghi chú hoặc Từ điển để thêm từ đầu tiên.</div>';
        status.textContent = ''; drawer.querySelector('#hskRevealMeaning').disabled = true; drawer.querySelector('#hskNextFlashcard').disabled = true; return;
      }
      reviewIndex = ((reviewIndex % list.length) + list.length) % list.length;
      const item = list[reviewIndex];
      area.innerHTML = `<div class="hsk-flashcard"><small>TỪ ${reviewIndex + 1} / ${list.length}</small><strong>${esc(item.word || item.term)}</strong><p class="${meaningShown ? '' : 'hidden-meaning'}">${esc(item.meaning || 'Chưa thêm nghĩa. Bấm Ghi chú để bổ sung.')}</p>${item.example ? `<small>Ví dụ: ${esc(item.example)}</small>` : ''}</div>`;
      drawer.querySelector('#hskRevealMeaning').disabled = false; drawer.querySelector('#hskNextFlashcard').disabled = false;
    }
    drawer.querySelector('#hskRevealMeaning').addEventListener('click', () => { meaningShown = !meaningShown; renderCard(); drawer.querySelector('#hskRevealMeaning').textContent = meaningShown ? 'Ẩn nghĩa' : 'Hiện nghĩa'; });
    drawer.querySelector('#hskNextFlashcard').addEventListener('click', () => { reviewIndex++; meaningShown = false; renderCard(); drawer.querySelector('#hskRevealMeaning').textContent = 'Hiện nghĩa'; status.textContent = 'Cố gắng nhớ nghĩa trước khi bấm Hiện nghĩa.'; });
    renderCard();
  }
  dock();
})();
