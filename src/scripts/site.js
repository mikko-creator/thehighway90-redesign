/* site.js - Highway 90 redesign runtime: header, menus, search, age gate, reveals, parallax, rails, tilt, loops.
   No dependencies. Everything degrades: without JS every section is visible and every link works. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  w.__hwy90 = true;
  var reduce = w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = w.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  /* ---------- header state + progress ---------- */
  var hdr = $('[data-hdr]'), prog = $('.progress');
  var onScroll = function () {
    var y = w.scrollY || 0;
    if (hdr) hdr.classList.toggle('is-scrolled', y > 24);
    if (prog) { var h = root.scrollHeight - w.innerHeight; prog.style.setProperty('--p', h > 0 ? Math.min(1, y / h).toFixed(4) : 0); }
  };
  w.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- mega menu (hover is CSS; click/keyboard here) ---------- */
  $$('.has-drop').forEach(function (li) {
    var btn = $('.nav__link', li);
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = !li.classList.contains('is-open');
      $$('.has-drop.is-open').forEach(function (o) { o.classList.remove('is-open'); var b = $('.nav__link', o); if (b) b.setAttribute('aria-expanded', 'false'); });
      li.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  d.addEventListener('click', function (e) { if (!e.target.closest('.has-drop')) $$('.has-drop.is-open').forEach(function (o) { o.classList.remove('is-open'); var b = $('.nav__link', o); if (b) b.setAttribute('aria-expanded', 'false'); }); });
  d.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $$('.has-drop.is-open').forEach(function (o) { o.classList.remove('is-open'); var b = $('.nav__link', o); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); } });
    if (d.body.classList.contains('menu-open')) toggleMenu(false);
  });

  /* ---------- mobile menu ---------- */
  var burger = $('.burger');
  function toggleMenu(open) {
    d.body.classList.toggle('menu-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    var mm = $('.mmenu'); if (mm) mm.setAttribute('aria-hidden', open ? 'false' : 'true');
    d.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) burger.addEventListener('click', function () { toggleMenu(!d.body.classList.contains('menu-open')); });
  $$('.mmenu a').forEach(function (a) { a.addEventListener('click', function () { toggleMenu(false); }); });

  /* ---------- search sheet ---------- */
  var sheet = $('[data-search]'), opener = $('[data-search-open]');
  function openSearch(open) { if (!sheet) return; sheet.hidden = !open; if (open) { var q = $('input', sheet); if (q) setTimeout(function () { q.focus(); }, 30); } else if (opener) opener.focus(); }
  if (opener) opener.addEventListener('click', function () { openSearch(true); });
  if (sheet) sheet.addEventListener('click', function (e) { if (e.target === sheet) openSearch(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet && !sheet.hidden) openSearch(false); });

  /* ---------- age gate ---------- */
  var gate = $('.agegate');
  var okKey = 'hwy90-age-ok', ok = false;
  try { ok = w.localStorage.getItem(okKey) === '1'; } catch (e) { ok = false; }
  if (gate && !ok) {
    gate.hidden = false; d.body.style.overflow = 'hidden';
    var yes = $('[data-age="yes"]', gate), no = $('[data-age="no"]', gate);
    setTimeout(function () { if (yes) yes.focus(); }, 60);
    if (yes) yes.addEventListener('click', function () { try { w.localStorage.setItem(okKey, '1'); } catch (e) { /* private mode */ } gate.hidden = true; d.body.style.overflow = ''; });
    if (no) no.addEventListener('click', function () { gate.classList.add('is-no'); var r = $('.agegate__no a', gate); if (r) r.focus(); });
  }

  /* ---------- split headings (wrap words, keep every character) ---------- */
  $$('.split').forEach(function (el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.textContent.split(/(\s+)/), frag = d.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(d.createTextNode(p)); return; }
            var o = d.createElement('span'); o.className = 'w';
            var inn = d.createElement('span'); inn.textContent = p; inn.style.setProperty('--i', i++);
            o.appendChild(inn); frag.appendChild(o);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains('w')) walk(n);
      });
    })(el);
  });

  /* ---------- reveals ---------- */
  var revealEls = $$('[data-reveal], [data-stagger], .split');
  var release = function (el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-reveal')) setTimeout(function () { el.removeAttribute('data-reveal'); }, 1300);
  };
  if (!('IntersectionObserver' in w) || reduce) revealEls.forEach(release);
  else {
    var delivered = false;
    var io = new IntersectionObserver(function (entries) {
      delivered = true;
      entries.forEach(function (en) { if (en.isIntersecting) { release(en.target); io.unobserve(en.target); } });
    }, { threshold: 0, rootMargin: '0px' });
    revealEls.forEach(function (el) { io.observe(el); });
    // fail-safe only when the observer never delivered (a working one always reports an initial entry)
    setTimeout(function () { if (!delivered && d.visibilityState === 'visible') revealEls.forEach(release); }, 3000);
    w.addEventListener('beforeprint', function () { revealEls.forEach(release); });
  }

  /* ---------- parallax + pinned horizontal rails ---------- */
  var layers = reduce ? [] : $$('[data-depth]');
  var pins = $$('.hpin');
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = w.innerHeight;
    for (var i = 0; i < layers.length; i++) {
      var el = layers[i], r = el.getBoundingClientRect();
      if (r.bottom < -400 || r.top > vh + 400) continue;
      var depth = parseFloat(el.getAttribute('data-depth')) || 0.1;
      var off = (r.top + r.height / 2 - vh / 2) * -depth;
      el.style.setProperty('--py', off.toFixed(1) + 'px');
    }
    for (var j = 0; j < pins.length; j++) {
      var p = pins[j], track = $('.hpin__track', p), stage = $('.hpin__stage', p);
      if (!track || !stage || w.innerWidth <= 900 || reduce) continue;
      var dist = Math.max(0, track.scrollWidth - stage.clientWidth);
      var pr = p.getBoundingClientRect(), total = p.offsetHeight - stage.offsetHeight;
      var prog = total > 0 ? Math.min(1, Math.max(0, -pr.top / total)) : 0;
      track.style.setProperty('--hx', (-dist * prog).toFixed(1) + 'px');
    }
  }
  function sizePins() {
    pins.forEach(function (p) {
      var track = $('.hpin__track', p), stage = $('.hpin__stage', p);
      if (!track || !stage) return;
      if (w.innerWidth <= 900 || reduce) { p.style.height = ''; return; }
      var dist = Math.max(0, track.scrollWidth - stage.clientWidth);
      p.style.height = (stage.offsetHeight + dist + w.innerHeight * 0.25) + 'px';
    });
  }
  var req = function () { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } };
  if (layers.length || pins.length) {
    sizePins(); frame();
    w.addEventListener('scroll', req, { passive: true });
    w.addEventListener('resize', function () { sizePins(); req(); });
    w.addEventListener('load', function () { sizePins(); req(); });
  }

  /* ---------- rails: drag on desktop, arrows ---------- */
  $$('.rail').forEach(function (rail) {
    var track = $('.rail__track', rail); if (!track) return;
    var step = function () { var c = track.children[0]; return c ? c.getBoundingClientRect().width + 20 : 300; };
    var prev = $('[data-rail="prev"]', rail), next = $('[data-rail="next"]', rail);
    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
    if (!fine) return;
    var down = false, sx = 0, sl = 0, moved = false;
    track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
    w.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; track.classList.add('is-drag'); } track.scrollLeft = sl - dx; });
    w.addEventListener('pointerup', function () { if (!down) return; down = false; setTimeout(function () { track.classList.remove('is-drag'); }, 30); });
    track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    track.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });

  /* ---------- tilt + spotlight ---------- */
  if (fine && !reduce) {
    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
        el.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%'); el.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- loop videos: play in view, pause out of view, a visible toggle ---------- */
  var narrow = w.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
  $$('[data-loop]').forEach(function (box) {
    var v = $('video', box); if (!v || reduce) return;
    var src = narrow && v.getAttribute('data-src-phone') ? v.getAttribute('data-src-phone') : null;
    var loaded = false, userPaused = false;
    var load = function () {
      if (loaded) return; loaded = true;
      if (src) { v.src = src; }
      else $$('source', v).forEach(function (s) { if (s.getAttribute('data-src')) s.src = s.getAttribute('data-src'); });
      v.load();
    };
    v.addEventListener('playing', function () { box.classList.add('is-playing'); });
    var btn = $('.loop__toggle', box.parentNode) || $('.loop__toggle', box);
    if (btn) btn.addEventListener('click', function () {
      if (v.paused) { userPaused = false; load(); v.play().catch(function () {}); box.parentNode.classList.remove('is-paused'); btn.setAttribute('aria-label', 'Pause background motion'); }
      else { userPaused = true; v.pause(); box.parentNode.classList.add('is-paused'); btn.setAttribute('aria-label', 'Play background motion'); }
    });
    if (!('IntersectionObserver' in w)) { load(); v.play().catch(function () {}); return; }
    new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { load(); if (!userPaused) v.play().catch(function () {}); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0, rootMargin: '200px 0px' }).observe(box);
  });

  /* ---------- count-up ---------- */
  $$('[data-count]').forEach(function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10); if (!target || reduce || !('IntersectionObserver' in w)) return;
    var done = false;
    var o = new IntersectionObserver(function (es) {
      if (done || !es[0].isIntersecting) return; done = true; o.disconnect();
      var t0 = performance.now(), dur = 1600;
      (function tick(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(target * e).toLocaleString('en-US').replace(/,/g, ''); if (k < 1) w.requestAnimationFrame(tick); else el.textContent = String(target); })(t0);
    }, { threshold: 0 });
    o.observe(el);
  });

  /* ---------- lazy map iframes ---------- */
  $$('iframe[data-src]').forEach(function (f) {
    if (!('IntersectionObserver' in w)) { f.src = f.getAttribute('data-src'); return; }
    new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting) { f.src = f.getAttribute('data-src'); ob.disconnect(); } }, { rootMargin: '400px 0px' }).observe(f);
  });
})();
