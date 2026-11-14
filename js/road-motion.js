/* ROAD TO HSK 9 — lớp chuyển động dùng chung (progressive enhancement).
   Nếu script lỗi hoặc người dùng bật "giảm chuyển động", nội dung vẫn hiển thị đầy đủ. */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  /* ---------- Thanh tiến độ cuộn ---------- */
  const bar = document.createElement('div');
  bar.className = 'rm-scroll';
  bar.setAttribute('aria-hidden', 'true');
  body.appendChild(bar);
  let scrollQueued = false;
  const updateScroll = () => {
    scrollQueued = false;
    const max = root.scrollHeight - window.innerHeight;
    bar.style.setProperty('--rm-p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
  };
  window.addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); } }, { passive: true });
  window.addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  if (reduce) return; // Từ đây trở đi chỉ là hiệu ứng.
  root.classList.add('rm-ready');

  /* ---------- Aurora nền ---------- */
  const aurora = document.createElement('div');
  aurora.className = 'rm-aurora';
  aurora.setAttribute('aria-hidden', 'true');
  body.prepend(aurora);

  /* ---------- Chuyển trang mượt khi bấm liên kết nội bộ ---------- */
  body.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || /\.(pdf|zip|mp3|docx?)$/i.test(href)) return;
    let url; try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    body.classList.add('rm-leaving');
    setTimeout(() => { location.href = url.href; }, 230);
  });
  window.addEventListener('pageshow', e => { if (e.persisted) body.classList.remove('rm-leaving'); });

  /* ---------- Tách tiêu đề thành từng từ ---------- */
  function splitWords(h) {
    if (h.dataset.rmSplit) return;
    h.dataset.rmSplit = '1';
    let index = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'rm-word';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--rm-d', (index++ * 55) + 'ms');
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.nodeName !== 'BR' && child.nodeName !== 'SCRIPT') {
          walk(child);
        }
      });
    };
    walk(h);
    root.classList.add('rm-ready');
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('rm-split-in')));
  }
  document.querySelectorAll('.hero h1, .setup-panel h1, .home-head h1, .personal-hero h1, .result-hero h1').forEach(splitWords);

  /* ---------- Hiện nội dung khi cuộn tới ---------- */
  const NO_REVEAL = body.dataset.rm === 'no-reveal';
  const TARGETS = [
    '.section-head', '.skill', '.level', '.stat', '.pred', '.test-card', '.mock-card', '.card',
    '.pro-plan', '.skill-card', '.course-card', '.login-card', '.score-card', '.result-card',
    '.personal-card', '.bank-row', '.payment-card', '.exam-unit', '.passage',
    '.hero-grid > *', '.hero-inner > *', '.levels > *', '.skills > *', '.tests > *', '.stats > *',
    '.personal-grid > *', '.score-grid > *', '.result-actions > *', '.filterrow > *'
  ].join(',');
  const SPOT = '.skill, .level, .pred, .test-card, .mock-card, .card, .pro-plan, .skill-card, .score-card, .course-card';
  const MAG = '.btn, .btn-red, .primary, .go-login, .pro-button';
  const LINKS = '.navlinks a, .topbar nav a, .nav-links a';

  const seen = new WeakSet();
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          en.target.classList.add('rm-in');
          cleanupAfter(en.target);
          io.unobserve(en.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    : null;

  function cleanupAfter(el) {
    const done = () => {
      el.classList.remove('rm-reveal', 'rm-in');
      el.style.removeProperty('--rm-d');
      el.removeEventListener('transitionend', done);
    };
    el.addEventListener('transitionend', e => { if (e.propertyName === 'opacity') done(); });
    setTimeout(done, 1600);
  }

  function prepare(el) {
    if (seen.has(el)) return;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') return;
    if (el.closest('.rm-skip')) return;
    if (el.matches(SPOT) && fine && cs.position === 'static') el.style.position = 'relative';
    if (el.matches(SPOT)) el.classList.add('rm-spot');
    if (el.matches(MAG) && fine) { el.classList.add('rm-mag', 'rm-press'); }
    else if (el.matches('.btn, .btn-red, .primary, .level, .go-login')) el.classList.add('rm-press');
    if (el.matches(LINKS)) el.classList.add('rm-link');
    if (NO_REVEAL) return;
    el.classList.add('rm-reveal');
    if (io) io.observe(el); else el.classList.add('rm-in');
  }

  function scan(root = document) {
    // Đếm thứ tự trong cùng một nhóm để tạo độ trễ so le
    const counts = new Map();
    root.querySelectorAll ? root.querySelectorAll(TARGETS + ',' + SPOT + ',' + MAG + ',' + LINKS).forEach(el => {
      if (seen.has(el)) return;
      const parent = el.parentElement || body;
      const n = counts.get(parent) || 0;
      counts.set(parent, n + 1);
      if (el.matches(TARGETS) && !NO_REVEAL) el.style.setProperty('--rm-d', Math.min(n, 6) * 80 + 'ms');
      prepare(el);
    }) : null;
  }

  // Các phần tử hiện ra đã có sẵn (đã qua vùng nhìn thấy ngay khi tải) cũng được xử lý
  scan(document);

  // Nội dung render bằng JS sau khi tải trang
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; scan(document); });
  }).observe(body, { childList: true, subtree: true });

  /* ---------- Nút kéo nhẹ & ánh sáng thẻ theo con trỏ ---------- */
  if (fine) {
    let magEl = null;
    const reset = el => { if (el) { el.style.setProperty('--rm-mx', '0px'); el.style.setProperty('--rm-my', '0px'); } };
    document.addEventListener('pointermove', e => {
      const mag = e.target.closest && e.target.closest('.rm-mag');
      if (magEl && magEl !== mag) { reset(magEl); magEl = null; }
      if (mag && !mag.disabled) {
        const r = mag.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.16;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.22;
        mag.style.setProperty('--rm-mx', Math.max(-6, Math.min(6, dx)).toFixed(1) + 'px');
        mag.style.setProperty('--rm-my', Math.max(-5, Math.min(5, dy)).toFixed(1) + 'px');
        magEl = mag;
      }
      const spot = e.target.closest && e.target.closest('.rm-spot');
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--rm-sx', (e.clientX - r.left) + 'px');
        spot.style.setProperty('--rm-sy', (e.clientY - r.top) + 'px');
      }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { reset(magEl); magEl = null; }, true);
  }
})();
