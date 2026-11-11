/* NEXUS OS homepage — motion & visual layer (pairs with nexus-home-fx.css).
   Additive only: adds a scroll-progress bar, a cursor glow, a hero particle field, pointer-tracked spotlights
   and scroll-triggered reveals. It never removes or repositions existing content; if it fails, the page is
   exactly the original. Respects prefers-reduced-motion. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    try { init(); } catch (e) { if (window.console) console.warn('home fx skipped', e); }
  });

  function init() {
    /* -------- scroll progress + navbar glass */
    var bar = document.createElement('div'); bar.className = 'fx-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
    var nav = document.querySelector('.navbar5_component');
    var ticking = false;
    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var y = window.scrollY || window.pageYOffset;
        bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0).toFixed(4) + ')';
        if (nav) nav.classList.toggle('fx-scrolled', y > 40);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    /* -------- cursor glow (desktop) */
    if (fine && !reduce) {
      var glow = document.createElement('div'); glow.className = 'fx-cursor'; glow.setAttribute('aria-hidden', 'true'); document.body.appendChild(glow);
      var gx = 0, gy = 0, tx = 0, ty = 0, gOn = false;
      window.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; if (!gOn) { gOn = true; glow.classList.add('is-on'); gx = tx; gy = ty; } }, { passive: true });
      document.addEventListener('pointerleave', function () { gOn = false; glow.classList.remove('is-on'); });
      (function follow() { gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12; glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)'; requestAnimationFrame(follow); })();
    }

    /* -------- hero: clip frame for the slow zoom, light sweep, scan line and drifting sparks */
    var logos = document.querySelector('.section_logos');
    var video = logos && logos.querySelector('.home_logo-image');
    if (video && !video.parentNode.classList.contains('fx-hero-clip')) {
      var clip = document.createElement('div'); clip.className = 'fx-hero-clip';
      video.parentNode.insertBefore(clip, video); clip.appendChild(video);
      var hero = document.createElement('div'); hero.className = 'fx-hero'; hero.setAttribute('aria-hidden', 'true');
      hero.innerHTML = '<canvas></canvas><div class="fx-scan"></div>';
      clip.appendChild(hero);
      if (!reduce) sparks(hero.querySelector('canvas'), clip);
    }
    var heading = document.querySelector('.home-hero-heading');
    if (heading && !heading.querySelector('.spark-word')) heading.classList.add('fx-plain');

    /* -------- pointer-tracked spotlight / glare (module cards, imagery) */
    var spotSel = '.layout353_content-item.module-card, .features_image-wrapper, .layout307_image-wrapper, .slider-testimonial_image-wrapper';
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest(spotSel); if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });

    /* -------- scroll reveals: image wipes, heading rules, lifecycle step bars */
    var reveal = [];
    if (!reduce) document.querySelectorAll('.features_image-wrapper, .layout307_image-wrapper').forEach(function (n) { n.classList.add('fx-wipe'); reveal.push(n); });
    document.querySelectorAll('.layout353_dynamic-heading, .section_features .hero_grid h2, .layout307_component .max-width-large h2, .section_solution .hero_grid h2, .faq6_content-left .heading-style-h2, .footer-title').forEach(function (n) { n.classList.add('fx-rule'); reveal.push(n); });
    document.querySelectorAll('.layout307_item').forEach(function (n) { reveal.push(n); });
    if ('IntersectionObserver' in window) {
      // a wipe starts fully clipped, which the observer reads as zero visible area, so watch its parent instead
      var watch = new Map();
      reveal.forEach(function (n) { var t = n.classList.contains('fx-wipe') ? n.parentElement : n; if (!watch.has(t)) watch.set(t, []); watch.get(t).push(n); });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { (watch.get(en.target) || []).forEach(function (n) { n.classList.add('fx-in'); }); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
      watch.forEach(function (_, t) { io.observe(t); });
    } else reveal.forEach(function (n) { n.classList.add('fx-in'); });
    // never leave anything hidden: reveal whatever is still pending after a while
    setTimeout(function () { reveal.forEach(function (n) { var r = n.getBoundingClientRect(); if (r.top < window.innerHeight * 1.5) n.classList.add('fx-in'); }); }, 2500);
  }

  /* drifting light particles over the hero film, with occasional rising sparks near the substation */
  function sparks(canvas, host) {
    var ctx = canvas.getContext('2d'); if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2); var W = 0, H = 0; var P = [];
    function size() { W = host.clientWidth; H = host.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function spawn(init) {
      var warm = Math.random() < 0.45;
      return { x: Math.random() * W, y: init ? Math.random() * H : H * (0.62 + Math.random() * 0.38), vx: (Math.random() - 0.5) * 0.18, vy: -(0.12 + Math.random() * 0.45), r: 0.6 + Math.random() * 1.6, life: 0, max: 380 + Math.random() * 520, c: warm ? '255,190,110' : '147,210,255', tw: Math.random() * 6.28 };
    }
    size(); for (var i = 0; i < 70; i += 1) P.push(spawn(true));
    window.addEventListener('resize', size);
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(host);
    (function loop() {
      requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < P.length; i += 1) {
        var p = P[i]; p.life += 1; p.x += p.vx; p.y += p.vy; p.tw += 0.05;
        var k = Math.min(1, p.life / 60) * Math.max(0, 1 - p.life / p.max);
        var a = k * (0.35 + 0.35 * Math.sin(p.tw));
        if (p.life > p.max || p.y < -10) { P[i] = spawn(false); continue; }
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, 'rgba(' + p.c + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + p.c + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.2832); ctx.fill();
      }
    })();
  }
})();
