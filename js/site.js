/* focus-guard (_tools/focus-guard): no focus ring after a tap or click; the README says why */
(function () {
  var root = document.documentElement;
  function set(v) { if (root.getAttribute('data-input') !== v) root.setAttribute('data-input', v); }
  addEventListener('pointerdown', function () { set('pointer'); }, true);
  addEventListener('keydown', function (e) {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    set('key');
  }, true);
})();

/* Spúútnik Reykjavík test prototype. Motion identity: ink and shutter (see ../DESIGN.md section 6).
   Everything here is split in two: ui() always runs, motion() only runs when the visitor has not asked
   for reduced motion and GSAP loaded. If motion() throws, the page falls back to the plain render. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const libs = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  const motionOn = !reduce && libs;
  const ICONS = 'img/icons.svg#';

  let lenis = null;
  let marquee = null;
  let userPaused = false;
  let sheenTw = null;
  let sheenState = null;
  let scrollBusyUntil = 0; /* performance.now() until which the page counts as being scrolled */
  let sheenApply = null;
  let heroEntrance = null;
  let marqueeInView = false;

  /* ------------------------------------------------------------------ scrolling helpers */
  const easeOut4 = (t) => 1 - Math.pow(1 - t, 4);

  function toTop() {
    if (lenis) { lenis.start(); lenis.scrollTo(0, { duration: 1.25, easing: easeOut4, force: true }); }
    else window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }
  function toEl(el) {
    if (!el) return;
    if (lenis) { lenis.start(); lenis.scrollTo(el, { duration: 1.3, easing: easeOut4, force: true }); }
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------------ ui (always) */
  function ui() {
    /* menu (touch + narrow screens) */
    const menu = $('#menu');
    const menuBtn = $('.hdr__menu');
    const menuLabel = menuBtn && $('span', menuBtn);
    const menuUse = menuBtn && $('use', menuBtn);
    function setMenu(open) {
      if (!menu || !menuBtn) return;
      root.classList.toggle('menu-open', open);
      $('#main').inert = open;
      $('.skip').inert = open;
      if (open) closeSearch();
      menu.hidden = !open;
      menu.classList.toggle('is-in', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      if (menuLabel) menuLabel.textContent = open ? 'Loka' : 'Valmynd';
      if (menuUse) menuUse.setAttribute('href', ICONS + (open ? 'i-x-light' : 'i-list-light'));
      if (open) $$('.menu li', menu).forEach((li, i) => li.style.setProperty('--i', i));
      if (lenis) (open ? lenis.stop() : lenis.start());
      else document.body.style.overflow = open ? 'hidden' : '';
      if (open) { const first = $('a', menu); if (first) first.focus({ preventScroll: true }); }
      else if (menu.contains(document.activeElement)) menuBtn.focus({ preventScroll: true });
    }
    if (menuBtn) menuBtn.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
    addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && root.classList.contains('menu-open')) {
        const items = $$('#hdr a, #hdr button, #menu a').filter(el => el.getClientRects().length && !el.disabled);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key !== 'Escape') return;
      if (root.classList.contains('menu-open')) { setMenu(false); menuBtn && menuBtn.focus(); }
      if ((dd && dd.contains(document.activeElement)) || (mega && mega.contains(document.activeElement))) ddBtn.focus();
      closeDd(); closeSearch(true);
    });

    /* in-page links. The logo and every #top link must land at the top, with the menu open too. */
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      e.preventDefault();
      const wasOpen = root.classList.contains('menu-open');
      if (wasOpen) setMenu(false);
      const target = $(id);
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      if (id === '#top' || id === '#main') toTop(); else toEl(target);
    }));

    /* shop menu: the bar under the header. Hover intent on a fine pointer (70ms in, 160ms grace out), click toggles,
       Esc closes and returns focus, scrolling closes. Pointer open focuses nothing (Safari would draw a ring); a keyboard
       open (click with detail 0) focuses the first link. */
    const dd = $('.dd');
    const ddBtn = $('.dd__btn');
    const mega = $('#mega');
    const hdr = $('#hdr');
    let megaT = 0; /* hover intent */
    let hideT = 0; /* display:none after the close wipe */
    const megaOpen = () => mega && mega.classList.contains('is-open');
    function setMega(open, viaKeyboard) {
      if (!mega) return;
      clearTimeout(megaT); clearTimeout(hideT);
      if (open === megaOpen()) return;
      if (open) {
        mega.style.display = 'block'; mega.inert = false;
        void mega.offsetHeight; /* the wipe needs a painted closed state first */
        mega.classList.add('is-open'); hdr.classList.add('is-mega');
        ddBtn.setAttribute('aria-expanded', 'true');
        if (viaKeyboard) { const first = $('a', mega); first && first.focus(); }
      } else {
        mega.classList.remove('is-open'); hdr.classList.remove('is-mega');
        ddBtn.setAttribute('aria-expanded', 'false');
        mega.inert = true;
        hideT = setTimeout(() => { if (!megaOpen()) mega.style.display = 'none'; }, 220);
      }
    }
    function closeDd() { setMega(false); }
    if (dd && mega) {
      const hover = (el) => {
        el.addEventListener('pointerenter', (e) => { if (fine && e.pointerType === 'mouse') { clearTimeout(megaT); megaT = setTimeout(() => setMega(true, false), 70); } });
        el.addEventListener('pointerleave', (e) => {
          if (!fine || e.pointerType !== 'mouse') return;
          clearTimeout(megaT);
          megaT = setTimeout(() => { if (!hdr.contains(document.activeElement) || document.activeElement === document.body) setMega(false); }, 160);
        });
      };
      hover(dd); hover(mega);
      ddBtn.addEventListener('click', (e) => { clearTimeout(megaT); setMega(!megaOpen(), e.detail === 0); });
      document.addEventListener('click', (e) => { if (megaOpen() && !hdr.contains(e.target)) setMega(false); });
      hdr.addEventListener('focusout', (e) => { if (megaOpen() && !hdr.contains(e.relatedTarget)) setMega(false); });
      addEventListener('scroll', () => { if (megaOpen() && !hdr.contains(document.activeElement)) setMega(false); }, { passive: true });
    }

    /* search */
    const search = $('#search');
    const input = $('#q');
    const searchBtn = $('[data-search-open]');
    function closeSearch(restore = false) {
      if (search && !search.hidden) {
        const hadFocus = search.contains(document.activeElement);
        search.hidden = true; searchBtn.setAttribute('aria-expanded', 'false');
        if (restore || hadFocus) searchBtn.focus({ preventScroll: true });
      }
    }
    $$('[data-search-open]').forEach((b) => b.addEventListener('click', () => {
      if (root.classList.contains('menu-open')) setMenu(false);
      search.hidden = !search.hidden;
      b.setAttribute('aria-expanded', String(!search.hidden));
      if (!search.hidden) input.focus();
    }));
    $$('[data-search-close]').forEach((b) => b.addEventListener('click', () => closeSearch(true)));

    /* wishlist (local only) */
    const KEY = 'sp-wish';
    let wish = new Set();
    try { wish = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { /* private mode: keep it in memory */ }
    const counts = $$('[data-wish-count]');
    const paint = () => counts.forEach((c) => { c.textContent = String(wish.size); });
    $$('.heart').forEach((h) => {
      const label = h.getAttribute('aria-label');
      // Preserve existing saved entries when improving the Icelandic action label.
      const id = label.replace('Setja á óskalista:', 'Setja í óskalista:');
      const use = $('use', h);
      const set = (on) => { h.setAttribute('aria-label', on ? label.replace('Setja á óskalista:', 'Fjarlægja af óskalista:') : label); h.setAttribute('aria-pressed', String(on)); use.setAttribute('href', ICONS + (on ? 'i-heart-fill' : 'i-heart-light')); };
      set(wish.has(id));
      h.addEventListener('click', () => {
        const on = h.getAttribute('aria-pressed') !== 'true';
        on ? wish.add(id) : wish.delete(id);
        set(on); paint();
        try { localStorage.setItem(KEY, JSON.stringify([...wish])); } catch (_) { /* ignore */ }
        if (motionOn) gsap.fromTo($('.heart__chip', h), { scale: 0.55 }, { scale: 1, duration: 0.55, ease: 'back.out(3)' });
      });
    });
    paint();

    /* rails: arrows, drag with a mouse, native touch/keyboard */
    $$('[data-rail]').forEach((rail) => {
      rail.addEventListener('dragstart', (e) => e.preventDefault());
      let down = null;
      rail.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        down = { x: e.clientX, left: rail.scrollLeft, moved: false };
      });
      rail.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - down.x;
        if (!down.moved && Math.abs(dx) > 5) { down.moved = true; rail.classList.add('is-drag'); rail.setPointerCapture(e.pointerId); }
        if (down.moved) rail.scrollLeft = down.left - dx;
      });
      const end = () => { down = null; rail.classList.remove('is-drag'); };
      rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);

      const wrap = rail.closest('.rail-wrap');
      const scope = wrap || document;
      const prev = $$('[data-rail-prev]', scope).filter((b) => (b.dataset.for ? b.dataset.for === rail.id : !!wrap))[0];
      const next = $$('[data-rail-next]', scope).filter((b) => (b.dataset.for ? b.dataset.for === rail.id : !!wrap))[0];
      const step = (dir) => rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
      rail.addEventListener('keydown', (e) => {
        if (e.target !== rail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'Home' || e.key === 'End') rail.scrollTo({ left: e.key === 'Home' ? 0 : rail.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
        else step(e.key === 'ArrowLeft' ? -1 : 1);
      });
      if (prev) prev.addEventListener('click', () => step(-1));
      if (next) next.addEventListener('click', () => step(1));
      let raf = 0;
      const sync = () => {
        raf = 0;
        const atStart = rail.scrollLeft < 4;
        const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
        if (prev) { prev.hidden = false; prev.disabled = atStart; }
        if (next) { next.hidden = false; next.disabled = atEnd; }
      };
      rail.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
      sync();
    });

    /* hero video: plays only while the hero is on screen, never for reduced motion or data saver.
       Some browsers pause muted video on their own (throttled or unfocused windows), so a pause that
       we did not ask for is undone a few times while the hero is visible. */
    const video = $('.hero__video');
    const saver = navigator.connection && navigator.connection.saveData;
    let videoInView = false;
    const syncVideo = () => {
      if (!video) return;
      if (!reduce && !saver && videoInView && !document.hidden && !userPaused) video.play().catch(() => {});
      else video.pause();
    };
    if (video && !reduce && !saver) {
      let retries = 0;
      const play = syncVideo;
      video.addEventListener('playing', () => { video.classList.add('is-on'); retries = 0; }, { once: true });
      video.addEventListener('pause', () => {
        if (videoInView && !userPaused && !document.hidden && retries++ < 5) setTimeout(play, 200);
      });
      document.addEventListener('visibilitychange', syncVideo);
      new IntersectionObserver((entries) => entries.forEach((e) => {
        videoInView = e.isIntersecting;
        syncVideo();
      }), { threshold: 0.05 }).observe($('.hero'));
    }

    /* stop/start for the motion that plays on its own for longer than 5 seconds (hero loop, marquee, grain) */
    const toggle = $('[data-motion-toggle]');
    if (toggle) {
      const use = $('use', toggle);
      toggle.addEventListener('click', () => {
        userPaused = !userPaused;
        root.classList.toggle('motion-paused', userPaused);
        toggle.setAttribute('aria-pressed', String(userPaused));
        toggle.setAttribute('aria-label', userPaused ? 'Spila hreyfingu' : 'Stöðva hreyfingu');
        use.setAttribute('href', ICONS + (userPaused ? 'i-play-light' : 'i-pause-light'));
        syncVideo();
        if (marquee) marquee.paused(userPaused || !marqueeInView);
        if (sheenTw) sheenTw.paused(userPaused);
        if (heroEntrance) heroEntrance.paused(userPaused);
      });
    }

    /* header colour change without GSAP (plain render) */
    if (!motionOn) {
      const hdr = $('#hdr');
      new IntersectionObserver(([e]) => hdr.classList.toggle('is-solid', !e.isIntersecting), { rootMargin: `-${hdr.offsetHeight}px 0px 0px 0px` }).observe($('.hero'));
    }
  }

  /* ------------------------------------------------------------------ the pen */
  /* Their real signature is written by a pen. js/sig-strokes.js (tools/trace_strokes.py) holds the centre-line of
     the letterforms in writing order; each chunk is a fat stroke inside an SVG <mask> over the filled signature, so
     the true shapes appear exactly where the pen has been. The hero version is filled with liquid chrome and a
     highlight slides through it. A star rides the pen tip and lands as the logo's own star. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STAR_END = { x: 2118, y: 336, w: 210, h: 114 }; /* where their star sits in the 2853x1524 logo space */
  let penId = 0;
  const mk = (name, attrs, parent) => {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  };
  function mountPen(host, mode) {
    const data = window.SIG_STROKES;
    if (!data || !host) return null;
    const [vx, vy, vw, vh] = data.viewBox;
    const id = ++penId;
    const svg = mk('svg', { class: 'sigpen__fx', viewBox: `${vx} ${vy} ${vw} ${vh}`, 'aria-hidden': 'true' });
    const defs = mk('defs', {}, svg);
    const area = { maskUnits: 'userSpaceOnUse', x: vx, y: vy, width: vw, height: vh };
    const mGlyph = mk('mask', Object.assign({ id: `pg${id}` }, area), defs);
    mk('use', { href: '#sp-body', x: vx, y: vy, width: vw, height: vh, fill: '#fff' }, mGlyph);
    const mPen = mk('mask', Object.assign({ id: `pp${id}` }, area), defs);
    const strokes = mk('g', { fill: 'none', stroke: '#fff', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mPen);
    const lens = data.chunks.map((c) => c.len);
    const paths = data.chunks.map((c) => {
      const pth = mk('path', { d: c.d, 'stroke-width': c.w }, strokes);
      /* gap longer than the chunk plus a cap: with gap == len the NEXT dash starts exactly at the chunk's end and its
         round cap paints a dot there before the pen has arrived (a dotted ghost of the whole word) */
      pth.style.strokeDasharray = `${c.len} ${c.len + c.w + 8}`;
      pth.style.strokeDashoffset = c.len;
      return pth;
    });
    const body = mk('g', { mask: `url(#pp${id})` }, svg);
    let sheen = null;
    if (mode === 'chrome') sheen = mk('image', { href: 'img/chrome-smooth.webp', x: vx, y: vy, width: vw * 1.7, height: vh, preserveAspectRatio: 'none', mask: `url(#pg${id})` }, body);
    else mk('use', { href: '#sp-body', x: vx, y: vy, width: vw, height: vh, fill: 'currentColor' }, body);
    const star = mk('use', { href: '#sp-star', width: 170, height: 92, fill: 'currentColor', opacity: 0 }, svg);
    /* chrome only: once the pen has finished, the texture moves to a plain layer behind a static CSS mask of the glyphs, so the highlight is a
       transform (GPU) and not a repaint of the masked SVG. Without CSS mask support the SVG keeps doing it. */
    const canSettle = mode === 'chrome' && !!(window.CSS && CSS.supports && (CSS.supports('mask-image', 'url(x.svg)') || CSS.supports('-webkit-mask-image', 'url(x.svg)')));
    let layer = null; let layerImg = null; let settled = false; let offNow = 0;
    if (canSettle) {
      layer = document.createElement('div'); layer.className = 'sigchrome'; layer.setAttribute('aria-hidden', 'true');
      const m = document.createElement('div'); m.className = 'sigchrome__m';
      layerImg = new Image(); layerImg.alt = ''; layerImg.decoding = 'async'; layerImg.src = 'img/chrome-smooth.webp';
      m.appendChild(layerImg); layer.appendChild(m);
    }
    function setSheen(off) {
      offNow = off;
      if (settled) layerImg.style.transform = `translate3d(${(-off / (vw * 1.7) * 100).toFixed(3)}%,0,0)`;
      else if (sheen) sheen.setAttribute('x', vx - off);
    }
    function settle() {
      if (!layer || settled) return;
      settled = true; setSheen(offNow);
      layer.classList.add('is-on');
      setTimeout(() => { body.style.display = 'none'; }, 340);
    }
    const cum = []; let total = 0;
    lens.forEach((l) => { cum.push(total); total += l; });
    const last = paths[paths.length - 1];
    const lastPt = last.getPointAtLength(last.getTotalLength());
    const ease = (t) => t * t * (3 - 2 * t);
    /* The pen writes stroke by stroke (data.strokes = index ranges in writing order). Between two strokes it LIFTS: the
       star travels the gap on a shallow arc in a time proportional to the distance, instead of teleporting. The
       schedule below maps progress 0..1 onto [draw S][lift][draw p][lift]... in ink length units. */
    const order = (data.strokes && data.strokes.length ? data.strokes : [{ from: 0, to: paths.length }]).filter((s) => s.to > s.from);
    const sched = []; let span = 0;
    order.forEach((s, i) => {
      const len = cum[s.to - 1] + lens[s.to - 1] - cum[s.from];
      sched.push({ kind: 'draw', s, at: span, len }); span += len;
      if (i < order.length - 1) {
        const a = paths[s.to - 1].getPointAtLength(paths[s.to - 1].getTotalLength());
        const n = order[i + 1]; const b = paths[n.from].getPointAtLength(0);
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const lift = Math.min(d * 0.55, 420);
        sched.push({ kind: 'lift', a, b, at: span, len: lift, ink: cum[s.to - 1] + lens[s.to - 1] }); span += lift;
      }
    });
    let head = 0;
    function fill(drawn) { /* drawn = ink length already on the page, over the flat chunk list */
      let lo = 0; let hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= drawn) lo = mid; else hi = mid - 1; }
      for (let i = Math.max(0, Math.min(head, lo) - 1); i <= Math.min(paths.length - 1, Math.max(head, lo) + 1); i++) {
        const local = Math.max(0, Math.min(1, (drawn - cum[i]) / lens[i]));
        paths[i].style.strokeDashoffset = lens[i] * (1 - local);
      }
      head = lo;
      const f = Math.max(0, Math.min(1, (drawn - cum[lo]) / lens[lo]));
      return paths[lo].getPointAtLength(f * paths[lo].getTotalLength());
    }
    const END = 0.955; /* the writing fits in [0, END]; after that everything is drawn and the star flies home */
    function set(p) {
      p = Math.max(0, Math.min(1, p));
      const t = Math.min(p, END) / END * span;
      let k = 0;
      while (k < sched.length - 1 && sched[k + 1].at <= t) k++;
      const seg = sched[k];
      let cx; let cy;
      if (seg.kind === 'draw') {
        const local = seg.len ? Math.min(1, (t - seg.at) / seg.len) : 1;
        const pt = fill(cum[seg.s.from] + local * seg.len);
        cx = pt.x; cy = pt.y;
      } else {
        const u = ease(Math.min(1, (t - seg.at) / seg.len));
        fill(seg.ink); /* the finished stroke stays full while the pen is in the air */
        cx = seg.a.x + (seg.b.x - seg.a.x) * u;
        cy = seg.a.y + (seg.b.y - seg.a.y) * u - Math.sin(u * Math.PI) * Math.min(60, seg.len * 0.25); /* the lift */
      }
      if (p <= 0) { star.setAttribute('opacity', 0); return; }
      let w = 170;
      if (p > END) { /* the pen lifts and the star settles into its place above the k */
        const u = ease((p - END) / (1 - END));
        cx = lastPt.x + (STAR_END.x + STAR_END.w / 2 - lastPt.x) * u;
        cy = lastPt.y + (STAR_END.y + STAR_END.h / 2 - lastPt.y) * u;
        w = 170 + (STAR_END.w - 170) * u;
      }
      const h = w * 0.543;
      star.setAttribute('x', cx - w / 2); star.setAttribute('y', cy - h / 2);
      star.setAttribute('width', w); star.setAttribute('height', h);
      star.setAttribute('opacity', 1);
      if (p >= 0.999) settle();
    }
    set(0);
    host.classList.add('is-live');
    const ov = host.querySelector('.sig__star'); if (ov) ov.remove();
    host.appendChild(svg);
    if (layer) host.insertBefore(layer, svg); /* under the SVG, so the landing star stays on top */
    return { set, sheen, vx, setSheen, get settled() { return settled; } };
  }

  /* ------------------------------------------------------------------ motion */
  function motion() {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    /* entrances follow the wall clock: a late frame skips ahead instead of slowing the whole timeline */
    gsap.ticker.lagSmoothing(0);

    /* Lenis only for a real wheel. Touch scroll stays native so iOS toolbars keep collapsing. */
    if (fine && typeof Lenis !== 'undefined') {
      lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
    }

    /* only the END of a band is clamped: bands near the page bottom must be able to finish, but a clamped START
       breaks content that is already inside a tall first viewport (progress stays 0) */
    const cl = (s) => `clamp(${s})`;

    const hdr = $('#hdr');
    const hero = $('.hero');
    const heroSig = $('.hero__sig');
    let heroActive = true; /* the hero is on screen */
    ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: (st) => { heroActive = st.isActive; if (st.isActive && sheenApply) sheenApply(); } });

    gsap.set(heroSig, { yPercent: 0 });

    /* header: solid after the hero, tucks away on the way down, returns on the way up */
    const syncHeader = (s) => hdr.classList.toggle('is-solid', s.scroll() >= s.start);
    ScrollTrigger.create({ trigger: hero, start: () => `bottom ${hdr.offsetHeight}px`, end: 'max', onUpdate: syncHeader, onRefresh: syncHeader });
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: (s) => { scrollBusyUntil = performance.now() + 200; hdr.classList.toggle('is-hidden', s.direction === 1 && s.scroll() > 700 && !root.classList.contains('menu-open')); },
    });

    /* hero: the pen writes the chrome signature while the model rises in front of it. Starts as the curtain lifts. */
    const penHero = mountPen(heroSig, 'chrome');
    const wr = { p: 0 };
    const tl = gsap.timeline({ delay: 1.3, defaults: { ease: 'expo.out' } });
    if (penHero) heroEntrance = gsap.to(wr, { delay: 1.3, p: 1, duration: 3.8, ease: 'power1.inOut', onUpdate: () => penHero.set(wr.p) });
    tl.fromTo('.hero__fig img', { yPercent: 14, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.6, stagger: 0.22 }, 0.7)
      .fromTo('.hero__lab span', { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.08 }, 1.2)
      .fromTo('.hdr__in > *', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.06 }, 1.1)
      /* the one invitation: after the star has landed (pen = 1.3s delay + 3.8s), under the right label */
      .fromTo('.hero__new', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 5.3);

    /* the highlight slides through the chrome: slowly on its own, and further as you scroll.
       Once the pen has finished it is a transform on a plain layer (see mountPen). Until then, and without CSS mask support, it is an SVG
       attribute that WebKit repaints on the CPU for every change, so that path is rate-capped (8 a second still, 20 while scrolling) and
       always lands on the exact final value. Both paths skip work while the hero is off screen. */
    if (penHero && penHero.setSheen) {
      const sh = { idle: 0, scroll: 0, ptr: 0 };
      let lastPaint = 0, pending = 0;
      const paint = () => { pending = 0; lastPaint = performance.now(); penHero.setSheen(sh.idle + sh.scroll + sh.ptr); };
      const apply = () => {
        if (penHero.settled) { if (heroActive) paint(); return; }
        if (!heroActive && !pending) return;
        const gap = performance.now() < scrollBusyUntil ? 48 : 120, wait = gap - (performance.now() - lastPaint);
        if (wait <= 0) paint(); else if (!pending) pending = setTimeout(paint, wait);
      };
      sheenState = sh; sheenApply = apply;
      sheenTw = gsap.to(sh, { idle: 760, duration: 13, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: apply });
      gsap.to(sh, { scroll: 820, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }, onUpdate: apply });
    }

    /* depth: the models (near) rise faster than the signature (far) as the hero leaves; the one standing further back rises less */
    gsap.to('.hero__fig--a .hero__fig-par', { yPercent: -9, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__fig--b .hero__fig-par', { yPercent: -5, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    /* two models: the pointer decides who steps forward (the other recedes and darkens, the chrome highlight follows);
       with no hover (touch) they trade places slowly on their own. Pause freezes it. Only translate + scale are written per frame. */
    const figA = $('.hero__fig--a');
    const figB = $('.hero__fig--b');
    if (figA && figB) {
      const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
      const REST = -0.45; /* -1 = the orange model fully forward, 1 = the blue one */
      const orb = { to: REST, v: REST, last: null };
      let heroInView = true;
      ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: (st) => { heroInView = st.isActive; } });
      if (fine) {
        hero.addEventListener('pointermove', (e) => {
          orb.to = gsap.utils.clamp(-1, 1, (e.clientX / innerWidth - 0.5) * 2.6); /* the hero is full width: no layout read per move */
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { orb.to = REST; });
      }
      const smooth = (f) => f * f * (3 - 2 * f);
      const pose = (el, f, dir) => {
        const k = smooth(f);
        el.style.scale = (0.93 + 0.12 * k).toFixed(4);
        el.style.translate = `calc(-50% + ${(dir * (k - 0.5) * 5).toFixed(3)}vw) 0`; /* the forward one steps toward the middle */
      };
      const place = (v) => {
        const fa = (1 - v) / 2;
        pose(figA, fa, 1);
        pose(figB, 1 - fa, -1);
        figA.classList.toggle('is-front', fa > 0.5);
        figB.classList.toggle('is-front', fa <= 0.5);
      };
      place(orb.v);
      gsap.ticker.add((time) => {
        if (userPaused || !heroInView) return;
        if (!fine) orb.to = Math.sin(time * 0.5) * 0.95 - 0.1;
        orb.v += (orb.to - orb.v) * (1 - Math.pow(1 - 0.075, gsap.ticker.deltaRatio()));
        if (Math.abs(orb.to - orb.v) < 0.0005) orb.v = orb.to;
        if (orb.v === orb.last) return;
        orb.last = orb.v;
        place(orb.v);
        if (sheenState) { sheenState.ptr = orb.v * 260; sheenApply(); }
      });
    }
    gsap.to(heroSig, { yPercent: -3, scale: 0.97, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    /* shutter reveals: tied to position over a short band, never to a clock */
    $$('[data-shutter]').forEach((el) => {
      const inner = $('.rv__in', el);
      gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: el, start: 'top 97%', end: cl('top 58%'), scrub: 0.4 } });
      gsap.fromTo(inner, { scale: 1.28 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 97%', end: cl('bottom 36%'), scrub: 0.4 } });
    });

    /* headline lines rise out of a mask */
    $$('[data-lines]').forEach((h) => {
      gsap.fromTo($$('.ln > span', h), { yPercent: 115 }, { yPercent: 0, ease: 'none', stagger: 0.14, scrollTrigger: { trigger: h, start: 'top 94%', end: cl('top 66%'), scrub: 0.5 } });
    });

    /* other signatures (footer): the same pen, ink instead of chrome. A pen writes at its own pace, so this one plays
       once the signature is well inside the viewport (2.6s) and un-writes when you scroll back above it, instead of
       being dragged by the scrollbar. */
    $$('[data-pen="ink"]').forEach((host) => {
      const pen = mountPen(host, 'ink');
      if (!pen) return;
      const w = { p: 0 };
      const write = gsap.to(w, { p: 1, duration: 2.6, ease: 'power1.inOut', paused: true, onUpdate: () => pen.set(w.p) });
      /* un-writing is a system response, so it runs at twice the speed of the write */
      ScrollTrigger.create({ trigger: host, start: 'top 82%', onEnter: () => write.timeScale(1).play(), onLeaveBack: () => write.timeScale(2).reverse() });
    });

    /* NEW: the two outlined lines fill in order */
    $$('.new__l.o').forEach((l, i) => gsap.fromTo(l, { '--f': 0 }, { '--f': 1, ease: 'none', scrollTrigger: { trigger: '.new__h', start: `top ${70 - i * 10}%`, end: `top ${44 - i * 10}%`, scrub: 0.5 } }));

    /* figures stand in front of the type and drift a little against the page */
    [['.new__fig:not(.new__fig--b) img', '.new', 12], ['.new__fig--b img', '.new', 22], ['.about__fig img', '.about__top', 8]].forEach(([sel, trig, from]) => {
      const img = $(sel);
      /* they rise onto the edge they stand on: in place by the time the section's bottom reaches the viewport's bottom */
      if (img) gsap.fromTo(img, { yPercent: from }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: trig, start: 'top bottom', end: 'bottom bottom', scrub: true } });
    });

    /* rails and boxes: cards rise in sequence as the row enters */
    $$('[data-rail]').forEach((rail) => {
      gsap.fromTo(Array.from(rail.children), { yPercent: 7, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'none', stagger: 0.09, scrollTrigger: { trigger: rail, start: 'top 95%', end: cl('top 58%'), scrub: 0.5 } });
    });
    gsap.fromTo('.box', { yPercent: 8, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: '.shops__grid', start: 'top 94%', end: cl('top 60%'), scrub: 0.5 } });

    /* desktop only: the connecting line between the pair labels */
    const mm = gsap.matchMedia();
    mm.add('(min-width: 760px)', () => {
      gsap.fromTo('.pair__line', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.pair__grid', start: 'top 60%', end: 'bottom 70%', scrub: 0.5 } });
    });

    /* every so often the hero signature glitches for under half a second (mono ghosts, no colour) */
    const heroSigEl = $('.hero__sig');
    if (heroSigEl) {
      const glitch = () => {
        if (heroActive && !userPaused && !document.hidden && performance.now() > scrollBusyUntil) {
          heroSigEl.classList.add('is-glitch');
          setTimeout(() => heroSigEl.classList.remove('is-glitch'), 460);
        }
        setTimeout(glitch, 8000 + Math.random() * 5000);
      };
      setTimeout(glitch, 6500);
    }

    /* the one marquee: speeds up with scroll velocity, sleeps off screen */
    const track = $('.strip__track');
    if (track) {
      const tw = gsap.to(track, { xPercent: -50, duration: 40, ease: 'none', repeat: -1, paused: true });
      marquee = tw;
      let vel = 0;
      if (lenis) lenis.on('scroll', (e) => { vel = e.velocity; });
      gsap.ticker.add(() => { tw.timeScale(gsap.utils.interpolate(tw.timeScale(), 1 + Math.min(Math.abs(vel) * 0.35, 6), 0.08)); vel *= 0.9; });
      ScrollTrigger.create({ trigger: '.strip', start: 'top bottom', end: 'bottom top', onToggle: (s) => { marqueeInView = s.isActive; tw.paused(userPaused || !marqueeInView); } });
    }

    /* velocity response: photo frames lean a little with the wheel, then settle (wheel users only) */
    if (lenis) {
      const frames = $$('.sk');
      let cur = 0; let target = 0;
      lenis.on('scroll', (e) => { target = gsap.utils.clamp(-0.6, 0.6, e.velocity * 0.025); });
      gsap.ticker.add(() => {
        cur += (target - cur) * 0.12; target *= 0.9;
        if (Math.abs(cur) > 0.004 || Math.abs(target) > 0.004) gsap.set(frames, { skewY: cur });
      });
    }

    /* GSAP now owns every start state. The css start-hidden rules are scoped to html:not(.ready) because
       GSAP clears an identity transform, which would re-apply a stylesheet one. */
    root.classList.add('ready');

    addEventListener('load', () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ------------------------------------------------------------------ boot */
  ui();
  if (motionOn) {
    try { motion(); } catch (err) {
      console.error('[spuutnik] motion failed, falling back to the plain render', err);
      root.classList.remove('js'); root.classList.add('rm');
    }
  } else {
    root.classList.remove('js'); root.classList.add('rm');
  }
})();
