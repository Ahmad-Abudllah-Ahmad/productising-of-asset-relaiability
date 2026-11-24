/* NEXUS OS homepage: the 3D module showcase and scroll reveals (pairs with nexus-landing.css).
   The showcase is a sliding window over the eight modules. Each slide renders that module's real-time Three.js scene,
   the same scenes as the sign-in page (/login/scene.js), on one reused canvas so only one WebGL context ever exists.
   It autoplays, pauses on hover, focus or when scrolled out of view, and falls back to a static poster without WebGL.
   Nothing here touches the modules or the dashboards. */
(function () {
  'use strict';
  var root = document.querySelector('[data-nxl]');
  if (!root) return;
  var data = [];
  try { data = JSON.parse(document.getElementById('nxl-data').textContent); } catch (e) { return; }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DUR = 7000;

  var show = root.querySelector('[data-nxl-show]');
  var stage = root.querySelector('[data-nxl-stage]');
  var canvas = root.querySelector('[data-nxl-canvas]');
  var labelsEl = root.querySelector('[data-nxl-labels]');
  var bar = root.querySelector('[data-nxl-bar]');
  var q = function (s) { return root.querySelector(s); };
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-slide]'));

  var cur = 0; var timer = null; var paused = false; var visible = true; var scene = null; var sceneMod = null; var swapToken = 0; var nodes = [];
  var gl = (function () { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function paintText(m) {
    show.style.setProperty('--acc', m.acc);
    show.style.setProperty('--nxl-glow', hexA(m.acc, 0.3));
    stage.style.setProperty('--acc', m.sceneAcc);
    paintCopy(m);
    q('[data-nxl-name]').textContent = m.name;
    q('[data-nxl-tag]').textContent = m.tag;
    q('[data-nxl-open]').setAttribute('href', m.href);
    q('[data-nxl-open]').setAttribute('aria-label', 'Open ' + m.name);
    q('[data-nxl-out]').textContent = m.output;
    q('[data-nxl-kpis]').innerHTML = m.kpis.map(function (k) { return '<div><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>'; }).join('');
    tabs.forEach(function (b, i) { var on = i === cur; b.parentElement.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
  }
  // the hero copy beside the window follows the active module, with a short crossfade
  var copy = q('[data-nxl-copy]'); var copyTimer = null; var painted = null;
  function paintCopy(m) {
    if (!copy || !m.hero || painted === m.code) return;
    var first = painted === null; painted = m.code;
    var write = function () {
      q('[data-nxl-h1]').textContent = m.hero.h1;
      q('[data-nxl-lead]').textContent = m.hero.lead;
      q('[data-nxl-sub]').textContent = m.hero.sub;
      copy.classList.remove('is-swap');
    };
    clearTimeout(copyTimer);
    if (first || reduce) { write(); return; }
    copy.classList.add('is-swap');
    copyTimer = setTimeout(write, 220);
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

  function stopScene() { if (scene) { try { scene.dispose(); } catch (e) { /* ignore */ } scene = null; } labelsEl.innerHTML = ''; nodes = []; }
  function mount3d() {
    if (!gl || !visible) return;
    var token = ++swapToken; var m = data[cur];
    stage.classList.remove('is-on');
    setTimeout(function () {
      if (token !== swapToken) return;
      stopScene();
      var load = sceneMod ? Promise.resolve(sceneMod) : import('/login/scene.js').then(function (mod) { sceneMod = mod; return mod; });
      load.then(function (mod) {
        if (token !== swapToken || !visible) return;
        scene = mod.mountScene(canvas, m.key, {
          accent: m.sceneAcc,
          onLabels: function (ls) {
            while (nodes.length < ls.length) { var n = document.createElement('div'); n.className = 'lbl'; labelsEl.appendChild(n); nodes.push(n); }
            // keep every label fully inside the window: clamp its centre so neither half crosses an edge
            var W = stage.clientWidth; var H = stage.clientHeight;
            ls.forEach(function (l, i) {
              var n = nodes[i]; if (n.textContent !== l.text) n.textContent = l.text;
              var half = (n.offsetWidth || 0) / 2 + 8; var h = n.offsetHeight || 22;
              var x = Math.min(W - half, Math.max(half, l.x)); var y = Math.min(H - 8, Math.max(h + 8, l.y - 10));
              n.className = 'lbl t-' + l.tone + (l.vis ? '' : ' is-hidden'); n.style.left = x.toFixed(1) + 'px'; n.style.top = y.toFixed(1) + 'px';
            });
          },
        });
        requestAnimationFrame(function () { requestAnimationFrame(function () { if (token === swapToken) stage.classList.add('is-on'); }); });
      }).catch(function (err) { if (window.console) console.warn('Module 3D scene unavailable; showing the poster.', err); });
    }, scene ? 320 : 0);
  }

  function restartProgress() {
    if (!bar) return;
    bar.classList.remove('is-run'); void bar.offsetWidth; // restart the CSS animation
    if (!reduce && !paused && visible) { bar.style.setProperty('--nxl-dur', DUR + 'ms'); bar.classList.add('is-run'); }
  }
  function schedule() {
    clearTimeout(timer);
    if (reduce || paused || !visible) return;
    timer = setTimeout(function () { go(cur + 1); }, DUR);
  }
  function go(i, focusTab) {
    cur = (i + data.length) % data.length;
    var changed = painted !== null && painted !== data[cur].code;
    paintText(data[cur]);
    if (changed) swing();
    mount3d();
    restartProgress(); schedule();
    if (focusTab) tabs[cur].focus();
  }

  // controls
  tabs.forEach(function (b) { b.addEventListener('click', function () { go(Number(b.getAttribute('data-slide'))); }); });
  root.querySelector('[data-nxl-prev]').addEventListener('click', function () { go(cur - 1); });
  root.querySelector('[data-nxl-next]').addEventListener('click', function () { go(cur + 1); });
  root.querySelector('.nxl-tabs').addEventListener('keydown', function (e) {
    var k = e.key; var n = k === 'ArrowRight' || k === 'ArrowDown' ? cur + 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? cur - 1 : k === 'Home' ? 0 : k === 'End' ? data.length - 1 : null;
    if (n === null) return; e.preventDefault(); go(n, true);
  });
  var pause = function (on) { paused = on; show.classList.toggle('is-paused', on); if (on) clearTimeout(timer); else { restartProgress(); schedule(); } };
  show.addEventListener('mouseenter', function () { pause(true); });
  show.addEventListener('mouseleave', function () { pause(false); });
  show.addEventListener('focusin', function () { pause(true); });
  show.addEventListener('focusout', function (e) { if (!show.contains(e.relatedTarget)) pause(false); });

  // the window card is a 3D object: it tilts toward the pointer, with a moving highlight and a deeper shadow,
  // and swings in when the module changes; it rests flat so nothing below it is ever overlapped
  var win = q('[data-nxl-win]');
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (win && fine && !reduce) {
    var raf = 0; var px = 0.5; var py = 0.5;
    var apply = function () { raf = 0; win.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg'); win.style.setProperty('--rx', ((0.5 - py) * 6).toFixed(2) + 'deg'); win.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); win.style.setProperty('--gy', (py * 100).toFixed(1) + '%'); };
    win.addEventListener('pointermove', function (e) { var r = win.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; py = (e.clientY - r.top) / r.height; win.classList.add('is-tilt'); if (!raf) raf = requestAnimationFrame(apply); });
    win.addEventListener('pointerleave', function () { win.classList.remove('is-tilt'); win.style.setProperty('--rx', '0deg'); win.style.setProperty('--ry', '0deg'); });
  }
  var swing = function () { if (!win || reduce) return; win.classList.remove('is-swing'); void win.offsetWidth; win.classList.add('is-swing'); };

  // "View in 3D" on a module card: bring the showcase into view on that module
  Array.prototype.forEach.call(root.querySelectorAll('[data-nxl-preview]'), function (b) {
    b.addEventListener('click', function () { go(Number(b.getAttribute('data-nxl-preview'))); show.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); });
  });

  // only render while the showcase is on screen: a hidden WebGL scene would still cost a GPU frame every 16 ms
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      var v = es[0].isIntersecting;
      if (v === visible) return;
      visible = v;
      if (v) { mount3d(); restartProgress(); schedule(); } else { swapToken += 1; stopScene(); stage.classList.remove('is-on'); clearTimeout(timer); }
    }, { threshold: 0.05 }).observe(show);
  }

  // scroll reveals for the sections below the hero
  var reveal = root.querySelectorAll('.nxl-sec .nxl-head, .nxl-mod, .nxl-step, .nxl-sector, .nxl-feat, .nxl-faq details, .nxl-cta'); // the hero, stats included, is on screen at once and never waits for a reveal
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(reveal, function (el, i) { el.setAttribute('data-reveal', ''); el.style.transitionDelay = ((i % 4) * 70) + 'ms'; io.observe(el); });
  }

  // the call-to-action film plays only while it is on screen (and never for reduced motion)
  var film = root.querySelector('[data-nxl-film]');
  if (film) {
    film.muted = true;
    if (reduce) film.removeAttribute('autoplay');
    else if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) { var p = film.play(); if (p && p.catch) p.catch(function () { /* autoplay blocked: the poster stays */ }); } else film.pause(); }, { threshold: 0.1 }).observe(film);
  }

  go(0);

  // a link such as /#module-card-03 (the "Back to suite" link in every module) lands on that module's card once the
  // layout has settled; the browser's own jump happens before the page is laid out
  var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && root.contains(target)) {
    var land = function () { target.scrollIntoView({ block: 'start', behavior: 'auto' }); };
    if (document.readyState === 'complete') setTimeout(land, 60); else window.addEventListener('load', function () { setTimeout(land, 60); });
  }
})();
