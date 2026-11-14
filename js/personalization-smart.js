/* ROAD TO HSK 9 — Học thông minh (từ vựng)
   - Thanh task 3 trạng thái: Mới · Đang học · Đã thuộc
   - Lặp lại ngắt quãng (spaced repetition) cho flashcard
   - Mục tiêu mỗi ngày, chuỗi ngày học, gợi ý cá nhân hóa từ lịch sử làm bài
   Dữ liệu SRS lưu riêng theo tài khoản, KHÔNG sửa cấu trúc dữ liệu từ vựng cũ. */
(function () {
  'use strict';
  if (!window.EITPersonal) return;
  const esc = EITPersonal.esc;
  const SRS_KEY = EITPersonal.KEY + ':SRS_V1';
  const DAY = 86400000;
  const STEP_DAYS = [0, 1, 3, 7, 14, 30, 60];      // khoảng cách theo "hộp" ghi nhớ
  const MASTERED_BOX = 4;                           // từ hộp 4 (≥14 ngày) tính là đã thuộc
  const NEW_PER_SESSION = 10;
  const isHan = t => /[\u3400-\u9fff]/.test(String(t || ''));
  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------------- lưu trữ ---------------- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SRS_KEY) || '{}');
      return { cards: d.cards || {}, daily: d.daily || {}, streak: d.streak || { days: 0, last: '' }, goal: d.goal || 10, mode: d.mode || 'front' };
    } catch { return { cards: {}, daily: {}, streak: { days: 0, last: '' }, goal: 10, mode: 'front' }; }
  }
  let S = load();
  const save = () => { try { localStorage.setItem(SRS_KEY, JSON.stringify(S)); } catch (e) { /* bộ nhớ đầy: bỏ qua */ } };
  const today = () => new Date().toISOString().slice(0, 10);
  function reviewedToday() { return S.daily[today()] || 0; }

  /* ---------------- trạng thái từ ---------------- */
  const stateOf = x => S.cards[x.id] || null;
  function statusOf(x) {
    const c = stateOf(x);
    if (!c || !c.reps) return 'new';
    return c.box >= MASTERED_BOX ? 'mastered' : 'learning';
  }
  const isDue = x => { const c = stateOf(x); return !!(c && c.reps && c.due <= Date.now()); };
  const STATUS = { new: ['Mới', 'new'], learning: ['Đang học', 'learning'], mastered: ['Đã thuộc', 'mastered'] };

  function nextState(c, grade) {
    const box0 = c ? c.box : 0;
    let box = box0, due;
    const now = Date.now();
    if (grade === 1) { box = 0; due = now + 10 * 60000; }
    else if (grade === 2) { box = Math.max(1, box0); due = now + Math.max(0.3, STEP_DAYS[box] * 0.5) * DAY; }
    else if (grade === 3) { box = Math.min(6, box0 + 1); due = now + STEP_DAYS[box] * DAY; }
    else { box = Math.min(6, box0 + 2); due = now + STEP_DAYS[box] * DAY; }
    return { box, due, reps: (c ? c.reps : 0) + 1, lapses: (c ? c.lapses : 0) + (grade === 1 ? 1 : 0), last: now };
  }
  function previewLabel(c, grade) {
    const n = nextState(c, grade), ms = n.due - Date.now();
    if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + ' phút';
    if (ms < DAY) return Math.round(ms / 3600000) + ' giờ';
    const d = Math.round(ms / DAY);
    return d >= 30 ? Math.round(d / 30) + ' tháng' : d + ' ngày';
  }
  function grade(x, g) {
    const wasNew = !(stateOf(x) && stateOf(x).reps);
    S.cards[x.id] = nextState(stateOf(x), g);
    const t = today();
    if (S.streak.last !== t) {
      const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
      S.streak.days = S.streak.last === y ? S.streak.days + 1 : 1;
      S.streak.last = t;
    }
    S.daily[t] = (S.daily[t] || 0) + 1;
    // giữ gọn dữ liệu: chỉ nhớ 60 ngày gần nhất
    Object.keys(S.daily).sort().slice(0, -60).forEach(k => delete S.daily[k]);
    save();
    return wasNew;
  }

  /* ---------------- bộ lọc + sắp xếp cho danh sách thẻ ---------------- */
  let filter = 'all';
  function filterItems(items) {
    let out = items.slice();
    if (filter === 'due') out = out.filter(isDue);
    else if (filter !== 'all') out = out.filter(x => statusOf(x) === filter);
    const rank = x => (isDue(x) ? 0 : statusOf(x) === 'new' ? 1 : statusOf(x) === 'learning' ? 2 : 3);
    return out.sort((a, b) => rank(a) - rank(b));
  }
  function badge(x) {
    const [label, cls] = STATUS[statusOf(x)];
    const speak = isHan(x.word) ? '<button class="sm-speak" type="button" data-speak="' + esc(x.word) + '" aria-label="Phát âm">🔊</button>' : '';
    return '<span class="sm-badge ' + cls + '">' + (isDue(x) ? '⏰ ' : '') + label + '</span>' + speak;
  }

  /* ---------------- gợi ý cá nhân hóa từ lịch sử ---------------- */
  function insights(d) {
    const out = [];
    const vocab = d.vocabulary || [];
    const due = vocab.filter(isDue).length;
    if (due) out.push({ icon: '⏰', title: due + ' từ đến hạn ôn', text: 'Ôn đúng lúc sắp quên giúp nhớ lâu hơn.', act: 'study', label: 'Ôn ngay' });
    else if (vocab.length && !vocab.some(x => statusOf(x) !== 'new')) out.push({ icon: '✨', title: 'Bắt đầu vòng ôn đầu tiên', text: 'Bạn đã lưu ' + vocab.length + ' từ nhưng chưa ôn lần nào.', act: 'study', label: 'Bắt đầu' });
    const hist = (d.history || []).filter(h => Number(h.total) > 0);
    if (hist.length) {
      const bySkill = {};
      hist.forEach(h => { const k = String(h.skill || '').toLowerCase(); if (!k) return; const b = bySkill[k] || (bySkill[k] = { c: 0, t: 0 }); b.c += Number(h.score) || 0; b.t += Number(h.total) || 0; });
      const list = Object.entries(bySkill).filter(([, v]) => v.t >= 10).map(([k, v]) => [k, Math.round(v.c / v.t * 100)]).sort((a, b) => a[1] - b[1]);
      if (list.length > 1 || (list.length === 1 && list[0][1] < 75)) {
        const [k, pct] = list[0];
        out.push({ icon: '🎯', title: 'Nên luyện thêm ' + (k === 'reading' ? 'Reading' : k === 'listening' ? 'Listening' : k), text: 'Độ chính xác hiện ' + pct + '% — thấp nhất trong các kỹ năng bạn đã làm.', href: 'index.html#de-thi', label: 'Chọn đề' });
      }
      const byLv = {};
      hist.slice(0, 12).forEach(h => { const lv = Number(h.volume ?? h.level); if (lv >= 3) (byLv[lv] = byLv[lv] || []).push((Number(h.score) || 0) / Number(h.total)); });
      const top = Object.keys(byLv).map(Number).sort((a, b) => b - a)[0];
      if (top && byLv[top].length >= 2) {
        const avg = byLv[top].slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, byLv[top].length);
        const nameOf = n => (n === 7 ? 'HSK 7–9' : 'HSK ' + n);
        if (avg >= 0.8 && top < 7) out.push({ icon: '🚀', title: 'Sẵn sàng thử ' + nameOf(top + 1), text: 'Trung bình gần đây ở ' + nameOf(top) + ' đạt ' + Math.round(avg * 100) + '%.', href: 'index.html#cach-thi', label: 'Xem cấp độ' });
        else if (avg < 0.55) out.push({ icon: '🧱', title: 'Củng cố nền ' + nameOf(top), text: 'Điểm gần đây khoảng ' + Math.round(avg * 100) + '%. Ôn từ vựng đã lưu trước khi làm đề mới.', act: 'study', label: 'Ôn từ' });
      }
    } else if (!vocab.length) {
      out.push({ icon: '📝', title: 'Chưa có dữ liệu cá nhân', text: 'Làm một đề Reading/Listening và lưu từ mới để hệ thống gợi ý riêng cho bạn.', href: 'index.html#de-thi', label: 'Làm đề' });
    }
    return out.slice(0, 3);
  }

  /* ---------------- bảng điều khiển ---------------- */
  let rerender = function () {};
  function counts(vocab) {
    const c = { new: 0, learning: 0, mastered: 0, due: 0 };
    vocab.forEach(x => { c[statusOf(x)]++; if (isDue(x)) c.due++; });
    return c;
  }
  function panelHTML(d) {
    const vocab = d.vocabulary || [];
    const c = counts(vocab), total = vocab.length || 1;
    const pct = k => (vocab.length ? (c[k] / total * 100) : 0);
    const done = reviewedToday(), goal = S.goal, gp = Math.min(100, Math.round(done / goal * 100));
    const chip = (k, label, n) => '<button type="button" class="sm-chip ' + k + (filter === k ? ' on' : '') + '" data-sm-filter="' + k + '"><i></i><b>' + n + '</b><span>' + label + '</span></button>';
    const ins = insights(d).map(i => '<div class="sm-insight"><span class="sm-ic">' + i.icon + '</span><div><b>' + esc(i.title) + '</b><p>' + esc(i.text) + '</p></div>' +
      (i.act ? '<button type="button" class="sm-link" data-sm-act="' + i.act + '">' + esc(i.label) + ' →</button>' : '<a class="sm-link" href="' + esc(i.href) + '">' + esc(i.label) + ' →</a>') + '</div>').join('');
    return '<section class="sm-panel" aria-label="Học từ vựng thông minh">' +
      '<div class="sm-head"><div><h3>Tiến độ ghi nhớ</h3><p>' + (vocab.length ? vocab.length + ' từ · ' + Math.round(pct('mastered')) + '% đã thuộc' : 'Lưu từ khi làm bài để bắt đầu theo dõi.') + '</p></div>' +
      '<div class="sm-streak" title="Chuỗi ngày ôn liên tiếp">🔥 <b>' + (S.streak.last === today() || S.streak.last === new Date(Date.now() - DAY).toISOString().slice(0, 10) ? S.streak.days : 0) + '</b><span>ngày</span></div></div>' +
      '<div class="sm-bar" role="img" aria-label="Phân bố trạng thái từ vựng"><i class="new" style="width:' + pct('new') + '%"></i><i class="learning" style="width:' + pct('learning') + '%"></i><i class="mastered" style="width:' + pct('mastered') + '%"></i></div>' +
      '<div class="sm-chips">' + chip('new', 'Mới', c.new) + chip('learning', 'Đang học', c.learning) + chip('mastered', 'Đã thuộc', c.mastered) + chip('due', 'Đến hạn', c.due) + '<button type="button" class="sm-chip all' + (filter === 'all' ? ' on' : '') + '" data-sm-filter="all"><b>' + vocab.length + '</b><span>Tất cả</span></button></div>' +
      '<div class="sm-goal"><div class="sm-goal-text"><span>Mục tiêu hôm nay</span><b>' + done + '/' + goal + ' thẻ</b></div><div class="sm-goal-track"><i style="transform:scaleX(' + (gp / 100) + ')"></i></div>' +
      '<select id="smGoal" aria-label="Mục tiêu mỗi ngày">' + [5, 10, 20, 30, 50].map(n => '<option value="' + n + '"' + (n === goal ? ' selected' : '') + '>' + n + ' thẻ/ngày</option>').join('') + '</select>' +
      '<button type="button" class="btn-red sm-start" data-sm-act="study"' + (vocab.length ? '' : ' disabled') + '>▶ Ôn thẻ thông minh</button></div>' +
      (ins ? '<div class="sm-insights">' + ins + '</div>' : '') + '</section>';
  }

  function render(active, redraw) {
    rerender = redraw || rerender;
    const host = $('#smartPanel');
    if (!host) return;
    if (active !== 'vocabulary') { host.innerHTML = ''; return; }
    S = load();
    const prev = host.querySelectorAll('.sm-bar i');
    const before = [...prev].map(i => i.style.width);
    host.innerHTML = panelHTML(EITPersonal.read());
    // animate thanh từ độ rộng cũ sang mới cho mượt
    const after = [...host.querySelectorAll('.sm-bar i')];
    if (before.length === after.length) {
      const targets = after.map(i => i.style.width);
      after.forEach((i, n) => { i.style.width = before[n]; });
      requestAnimationFrame(() => requestAnimationFrame(() => after.forEach((i, n) => { i.style.width = targets[n]; })));
    }
  }

  /* ---------------- phiên flashcard ---------------- */
  let session = null, keyHandler = null;
  function buildQueue() {
    const vocab = EITPersonal.read().vocabulary || [];
    const due = vocab.filter(isDue).sort((a, b) => stateOf(a).due - stateOf(b).due);
    const fresh = vocab.filter(x => statusOf(x) === 'new');
    const left = Math.max(0, S.goal - reviewedToday());
    const freshN = Math.min(NEW_PER_SESSION, Math.max(left, 5), fresh.length);
    let q = due.slice(0, 30).concat(fresh.slice(0, freshN));
    if (!q.length) q = vocab.filter(x => statusOf(x) === 'learning').sort((a, b) => stateOf(a).due - stateOf(b).due).slice(0, 15); // học trước
    return q;
  }
  function openSession() {
    const queue = buildQueue();
    closeSession();
    const wrap = document.createElement('div');
    wrap.className = 'sm-overlay';
    wrap.innerHTML = '<div class="sm-modal" role="dialog" aria-modal="true" aria-label="Flashcard"><div class="sm-modal-top"><div class="sm-prog"><i></i></div><span class="sm-count"></span>' +
      '<button type="button" class="sm-mode" title="Đổi chiều thẻ">⇄ <span></span></button><button type="button" class="sm-x" aria-label="Đóng">✕</button></div><div class="sm-stage"></div></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('sm-lock');
    requestAnimationFrame(() => wrap.classList.add('in'));
    session = { wrap, queue, total: queue.length, done: 0, right: 0, fresh: 0, flipped: false, busy: false };
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.sm-x')) closeSession(); });
    $('.sm-mode', wrap).addEventListener('click', () => { S.mode = S.mode === 'front' ? 'back' : 'front'; save(); showCard(true); });
    keyHandler = e => {
      if (!session) return;
      if (e.key === 'Escape') return closeSession();
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!session.flipped) flip(); }
      else if (session.flipped && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key));
      else if (e.key === 'p' || e.key === 'P') speakCurrent();
    };
    document.addEventListener('keydown', keyHandler);
    showCard(false);
  }
  function closeSession() {
    if (!session) return;
    const w = session.wrap; session = null;
    document.removeEventListener('keydown', keyHandler);
    w.classList.remove('in');
    setTimeout(() => w.remove(), 260);
    document.documentElement.classList.remove('sm-lock');
    rerender();
  }
  function frontBack(x) {
    const word = x.word || x.term || '', meaning = x.meaning || '', ex = x.example || '';
    return S.mode === 'front'
      ? { front: '<div class="sm-big' + (word.length > 6 ? ' long' : '') + '">' + esc(word) + '</div>', backHead: '<div class="sm-mean">' + (meaning ? esc(meaning) : '<em>Chưa có nghĩa — hãy tra Hanzii rồi lưu lại.</em>') + '</div>', hint: 'Nhớ nghĩa của từ' }
      : { front: '<div class="sm-big meaning' + (meaning.length > 40 ? ' long' : '') + '">' + (meaning ? esc(meaning) : '<em>Chưa có nghĩa</em>') + '</div>', backHead: '<div class="sm-mean han">' + esc(word) + '</div>', hint: 'Nhớ từ tương ứng' };
  }
  function showCard(keepFlip) {
    if (!session) return;
    const s = session, wrap = s.wrap, stage = $('.sm-stage', wrap);
    $('.sm-mode span', wrap).textContent = S.mode === 'front' ? 'Từ → Nghĩa' : 'Nghĩa → Từ';
    const pct = s.total ? Math.min(1, s.done / s.total) : 0;
    $('.sm-prog i', wrap).style.transform = 'scaleX(' + pct + ')';
    $('.sm-count', wrap).textContent = s.queue.length ? Math.min(s.done + 1, s.total) + ' / ' + s.total : '';
    if (!s.queue.length) return summary(stage);
    const x = s.queue[0], fb = frontBack(x), c = stateOf(x);
    s.flipped = !!keepFlip && s.flipped;
    stage.innerHTML = '<div class="sm-card' + (s.flipped ? ' flip' : '') + ' enter"><div class="sm-face front"><span class="sm-tag ' + statusOf(x) + '">' + STATUS[statusOf(x)][0] + '</span>' + fb.front +
      '<small>' + esc(fb.hint) + ' · nhấn <kbd>Space</kbd> để lật</small></div><div class="sm-face back"><span class="sm-tag ' + statusOf(x) + '">' + STATUS[statusOf(x)][0] + '</span>' + fb.backHead +
      '<div class="sm-word-sub">' + (S.mode === 'front' ? '' : '') + '</div>' + (x.example ? '<div class="sm-ex">' + esc(x.example) + '</div>' : '') +
      (x.testTitle ? '<div class="sm-src">' + esc(x.testTitle) + '</div>' : '') + '</div></div>' +
      '<div class="sm-actions"><button type="button" class="sm-flip">Lật thẻ</button>' +
      '<div class="sm-grades" hidden>' + [[1, 'Quên', 'again'], [2, 'Khó', 'hard'], [3, 'Được', 'good'], [4, 'Dễ', 'easy']].map(g => '<button type="button" class="sm-g ' + g[2] + '" data-g="' + g[0] + '"><b>' + g[1] + '</b><small>' + previewLabel(c, g[0]) + ' · ' + g[0] + '</small></button>').join('') + '</div></div>' +
      (isHan(x.word) ? '<button type="button" class="sm-voice" aria-label="Phát âm (P)">🔊</button>' : '');
    const card = $('.sm-card', stage);
    requestAnimationFrame(() => card.classList.remove('enter'));
    $('.sm-flip', stage).addEventListener('click', flip);
    card.addEventListener('click', () => { if (!s.flipped) flip(); });
    stage.querySelectorAll('.sm-g').forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.g))));
    $('.sm-voice', stage)?.addEventListener('click', speakCurrent);
    if (s.flipped) revealGrades(stage);
    s.busy = false;
  }
  function revealGrades(stage) { $('.sm-flip', stage).hidden = true; $('.sm-grades', stage).hidden = false; }
  function flip() {
    if (!session || session.flipped) return;
    session.flipped = true;
    const stage = $('.sm-stage', session.wrap);
    $('.sm-card', stage).classList.add('flip');
    revealGrades(stage);
  }
  function answer(g) {
    const s = session; if (!s || s.busy || !s.flipped) return;
    s.busy = true;
    const x = s.queue.shift();
    const wasNew = grade(x, g);
    if (wasNew) s.fresh++;
    if (g >= 3) { s.right++; s.done++; }
    else if (g === 2) { s.done++; }
    else { s.queue.splice(Math.min(3, s.queue.length), 0, x); }   // "Quên": quay lại sau vài thẻ
    const card = $('.sm-card', $('.sm-stage', s.wrap));
    card.classList.add(g === 1 ? 'out-left' : 'out-right');
    s.flipped = false;
    setTimeout(() => showCard(false), 240);
  }
  function summary(stage) {
    const s = session, acc = s.total ? Math.round(s.right / s.total * 100) : 0;
    $('.sm-prog i', s.wrap).style.transform = 'scaleX(1)';
    if (!s.total) {
      stage.innerHTML = '<div class="sm-done"><div class="sm-done-ic">🎉</div><h3>Hôm nay không còn thẻ cần ôn</h3><p>Hãy quay lại sau, hoặc lưu thêm từ mới khi làm đề.</p><div class="sm-done-actions"><button class="btn-red" type="button" data-sm-close>Đóng</button></div></div>';
    } else {
      stage.innerHTML = '<div class="sm-done"><div class="sm-done-ic">✅</div><h3>Hoàn thành phiên ôn</h3><div class="sm-done-stats"><div><b>' + s.total + '</b><span>thẻ đã ôn</span></div><div><b>' + acc + '%</b><span>nhớ tốt</span></div><div><b>' + s.fresh + '</b><span>từ mới bắt đầu học</span></div></div>' +
        '<p>Các từ bạn chọn “Quên/Khó” sẽ quay lại sớm hơn.</p><div class="sm-done-actions"><button class="btn-outline" type="button" data-sm-close>Đóng</button><button class="btn-red" type="button" data-sm-again>Ôn tiếp</button></div></div>';
    }
    stage.querySelector('[data-sm-close]')?.addEventListener('click', closeSession);
    stage.querySelector('[data-sm-again]')?.addEventListener('click', () => { closeSession(); setTimeout(openSession, 280); });
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 0.85; speechSynthesis.speak(u); } catch (e) { /* trình duyệt không hỗ trợ */ }
  }
  function speakCurrent() { if (session && session.queue[0]) speak(session.queue[0].word); }

  /* ---------------- sự kiện chung ---------------- */
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-sm-filter]');
    if (f) { filter = filter === f.dataset.smFilter && filter !== 'all' ? 'all' : f.dataset.smFilter; rerender(); return; }
    const a = e.target.closest('[data-sm-act="study"]');
    if (a) { openSession(); return; }
    const sp = e.target.closest('[data-speak]');
    if (sp) speak(sp.dataset.speak);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'smGoal') { S.goal = Number(e.target.value) || 10; save(); rerender(); }
  });

  window.EITSmart = { render, filter: filterItems, badge, statusOf, isDue, openSession };
})();
