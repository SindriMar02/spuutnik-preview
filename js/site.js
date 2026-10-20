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
      closeDd(); if (mega && mega.contains(document.activeElement)) ddBtn.focus();
      closeSearch(true);
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

    /* the two bars under the header (shop menu, search): the same paper sheet, the same wipe. One open at a time.
       Hover intent on a fine pointer for the shop menu (70ms in, 160ms grace out), click toggles both, Esc closes and
       returns focus, scrolling closes. A pointer open of the menu focuses nothing (Safari would draw a ring); a keyboard
       open focuses the first link. The search always focuses its field: a text field is where the ring belongs. */
    const hdr = $('#hdr');
    const bars = [];
    function makeBar(el, btn, opts) {
      if (!el || !btn) return null;
      let hideT = 0;
      const bar = {
        el, btn,
        isOpen: () => el.classList.contains('is-open'),
        open(viaKeyboard) {
          clearTimeout(hideT);
          if (bar.isOpen()) return;
          bars.forEach((o) => { if (o !== bar) o.close(); });
          if (root.classList.contains('menu-open')) setMenu(false);
          el.style.display = 'block'; el.inert = false;
          void el.offsetHeight; /* the wipe needs a painted closed state first */
          el.classList.add('is-open'); hdr.classList.add('is-mega');
          btn.setAttribute('aria-expanded', 'true');
          if (opts.focus === 'always' || viaKeyboard) { const f = $(opts.first, el); f && f.focus({ preventScroll: true }); }
        },
        close(restore) {
          clearTimeout(hideT);
          if (!bar.isOpen()) return;
          const hadFocus = el.contains(document.activeElement);
          el.classList.remove('is-open');
          if (!bars.some((o) => o.isOpen())) hdr.classList.remove('is-mega');
          btn.setAttribute('aria-expanded', 'false');
          el.inert = true;
          if (restore || hadFocus) btn.focus({ preventScroll: true });
          hideT = setTimeout(() => { if (!bar.isOpen()) el.style.display = 'none'; }, 220);
        },
      };
      btn.addEventListener('click', (e) => { bar.isOpen() ? bar.close() : bar.open(e.detail === 0); });
      el.addEventListener('focusout', (e) => { if (bar.isOpen() && !hdr.contains(e.relatedTarget) && e.relatedTarget) bar.close(); });
      bars.push(bar);
      return bar;
    }
    const dd = $('.dd');
    const ddBtn = $('.dd__btn');
    const mega = $('#mega');
    const shopBar = makeBar(mega, ddBtn, { first: 'a', focus: 'keyboard' });
    if (shopBar && dd) {
      let megaT = 0;
      const hover = (el) => {
        el.addEventListener('pointerenter', (e) => { if (fine && e.pointerType === 'mouse') { clearTimeout(megaT); megaT = setTimeout(() => shopBar.open(false), 70); } });
        el.addEventListener('pointerleave', (e) => {
          if (!fine || e.pointerType !== 'mouse') return;
          clearTimeout(megaT);
          megaT = setTimeout(() => { if (!mega.contains(document.activeElement)) shopBar.close(); }, 160);
        });
      };
      hover(dd); hover(mega);
      ddBtn.addEventListener('click', () => clearTimeout(megaT));
    }
    const search = $('#search');
    const input = $('#q');
    const searchBtn = $('[data-search-open]');
    const searchBar = makeBar(search, searchBtn, { first: '#q', focus: 'always' });
    function closeDd() { shopBar && shopBar.close(); }
    function closeSearch(restore = false) { searchBar && searchBar.close(restore); }
    $$('[data-search-close]').forEach((b) => b.addEventListener('click', () => closeSearch(true)));
    document.addEventListener('click', (e) => { if (!hdr.contains(e.target)) bars.forEach((b) => b.close()); });
    addEventListener('scroll', () => { bars.forEach((b) => { if (b.isOpen() && !hdr.contains(document.activeElement)) b.close(); }); }, { passive: true });

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

  /* ------------------------------------------------------------------ the signature */
  /* Their real signature, revealed by one calm wipe. The glyph is a CSS mask over a plain layer: liquid chrome on the hero
     (the texture slides behind the mask, a pure transform, so the highlight never repaints the glyph), solid ink in the
     footer. The star is their own star, placed where it sits in the logo, and arrives as the wipe ends. No pen, no strokes. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function mountSig(host, mode) {
    if (!host) return null;
    const canMask = !!(window.CSS && CSS.supports && (CSS.supports('mask-image', 'url(x.svg)') || CSS.supports('-webkit-mask-image', 'url(x.svg)')));
    if (!canMask) return null; /* the static signature stays */
    const layer = document.createElement('div'); layer.className = 'sigchrome'; layer.setAttribute('aria-hidden', 'true');
    const m = document.createElement('div'); m.className = 'sigchrome__m';
    let img = null;
    if (mode === 'chrome') { img = new Image(); img.alt = ''; img.decoding = 'async'; img.src = 'img/chrome-smooth.webp'; m.appendChild(img); }
    else m.classList.add('sigchrome__m--ink');
    layer.appendChild(m);
    const star = document.createElementNS(SVGNS, 'svg'); star.setAttribute('class', 'sig__star'); star.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVGNS, 'use'); use.setAttribute('href', '#sp-star'); star.appendChild(use);
    host.classList.add('is-live'); host.appendChild(layer); host.appendChild(star);
    const W = 2640 * 1.7; /* the texture is 170% of the glyph box wide */
    function setSheen(off) { if (img) img.style.transform = `translate3d(${(-off / W * 100).toFixed(3)}%,0,0)`; }
    return { layer, star, setSheen };
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

    /* hero: one wipe reveals the chrome signature, left to right, as the curtain lifts; the highlight sweeps with it and the
       star arrives as the wipe ends. The models rise in front of it. */
    const sig = mountSig(heroSig, 'chrome');
    const sh = { idle: 0, scroll: 0, ptr: 0, intro: 0 };
    const paint = () => { if (sig && heroActive) sig.setSheen(sh.idle + sh.scroll + sh.ptr + sh.intro); };
    sheenState = sh; sheenApply = paint;
    const tl = gsap.timeline({ delay: 1.3, defaults: { ease: 'expo.out' } });
    if (sig) {
      gsap.set(sig.layer, { clipPath: 'inset(0% 100% 0% 0%)' });
      gsap.set(sig.star, { opacity: 0, scale: 0.5, transformOrigin: '50% 50%' });
      tl.to(sig.layer, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power3.inOut' }, 0)
        .fromTo(sh, { intro: 1100 }, { intro: 0, duration: 1.6, ease: 'power2.out', onUpdate: paint }, 0)
        .to(sig.star, { opacity: 1, scale: 1, duration: 0.6 }, 1.1);
      heroEntrance = tl;
    }
    tl.fromTo('.hero__fig img', { yPercent: 14, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.6, stagger: 0.22 }, 0.5)
      .fromTo('.hero__lab span', { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.08 }, 1.0)
      .fromTo('.hdr__in > *', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.06 }, 0.9)
      /* the one invitation, after the star has arrived */
      .fromTo('.hero__new', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 2.2);

    /* the highlight slides through the chrome: slowly on its own, further as you scroll, and with the pointer (below).
       A transform on a plain layer, so it costs nothing; skipped while the hero is off screen. */
    if (sig) {
      sheenTw = gsap.to(sh, { idle: 760, duration: 13, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: paint });
      gsap.to(sh, { scroll: 820, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }, onUpdate: paint });
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
    /* the wordmark follows the page: as the hero leaves it sinks down behind the models (slower than the page, a little
       smaller), the way the Hotel Laugar name sinks behind the land */
    gsap.to(heroSig, { yPercent: 46, scale: 0.9, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

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

    /* the footer signature: the same wipe in ink, once the signature is in view; un-wiped at double speed when you scroll back above it */
    $$('[data-pen="ink"]').forEach((host) => {
      const fs = mountSig(host, 'ink');
      if (!fs) return;
      gsap.set(fs.layer, { clipPath: 'inset(0% 100% 0% 0%)' });
      gsap.set(fs.star, { opacity: 0, scale: 0.5, transformOrigin: '50% 50%' });
      const w = gsap.timeline({ paused: true })
        .to(fs.layer, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power3.inOut' }, 0)
        .to(fs.star, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' }, 1.1);
      ScrollTrigger.create({ trigger: host, start: 'top 82%', onEnter: () => w.timeScale(1).play(), onLeaveBack: () => w.timeScale(2).reverse() });
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
