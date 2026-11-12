// Finding viewer: a modal for one finding. It opens from any finding thumbnail (Asset 360, Link Review) through
// openFinding(), which is also exposed as NexusReliability.openFinding for other screens.
//
//   RGB      the photograph with the AI's box, class, confidence and severity
//   Thermal  a generated false-colour view with a temperature scale and min / max readouts
//   Compare  the same defect in other campaigns (confirmed and auto-linked repeat-sighting links), side by side,
//            with the condition at each campaign and any repair between them
//
// Reviewer actions: confirm, correct (class, severity, box), reject, and "link to asset" with the matcher's
// suggestions. They go through the repository, so they persist in the browser overlay and scores recompute.
// Keyboard: arrows move between findings of the same asset, Escape closes, focus stays inside while it is open.
// State is in the URL hash: #finding=<id>&mode=thermal. Every image is labelled "Demo image".

import { h, replace } from '../ui/dom.js';
import { loadFindingDetail, DEFECT_OPTIONS } from './findingModel.js';
import { parseHash, hashFor } from './hashState.js';
import { loadImage, drawPhoto, drawThermal, drawCrop, SCALE_GRADIENT, DEMO_LABEL, SIZE } from './demoImage.js';
import { openAsset } from './assetPanel.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEV_TONE = { critical: 'r', serious: 'r', moderate: 'a', minor: 'b', none: 'g' };
const STATUS_TONE = { confirmed: 'g', pending: 'a', rejected: 'r' };
const MODES = [['rgb', 'RGB', '1'], ['thermal', 'Thermal', '2'], ['compare', 'Compare', '3']];
const SEVERITIES = [[1, 'critical', 'very poor'], [2, 'serious', 'poor'], [3, 'moderate', 'fair'], [4, 'minor', 'good']];
const REJECT_REASONS = ['Not a defect', 'Wrong location', 'Same defect already recorded', 'Image unusable', 'Other'];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const humanize = (s) => String(s).replace(/_/g, ' ');
const pct = (n) => Math.round(n * 1000) / 10;

const ctl = {
  deps: null, root: null, dialog: null, body: null, toastEl: null, imageCache: new Map(),
  state: {
    open: false, id: null, mode: 'rgb', token: 0, view: 'loading', detail: null, error: null, opener: null, restore: null,
    editing: null, rejecting: false, linking: false, cmp: null, impact: null, toast: '', busy: false,
  },
};
const tag = (text, tone, extra = {}) => h('span', { class: `tag ${tone ?? 'x'}`, ...extra }, text);

// ---------------------------------------------------------------- public API

/** @param {{repo: any, getSnapshot: () => any, subscribeSnapshot: (fn: () => void) => (() => void), flags?: object}} deps */
export function initFindingViewer(deps) {
  ctl.deps = deps;
  window.addEventListener('hashchange', sync);
  deps.subscribeSnapshot(() => { if (ctl.state.open && ctl.state.view === 'ready' && !ctl.state.editing) load({ quiet: true }); });
  sync();
}

/** Open the viewer. The finding goes into the URL hash (next to the asset, if the panel is open), so Back closes it. */
export function openFinding(id, { mode = 'rgb', opener } = {}) {
  ctl.state.opener = opener ?? document.activeElement;
  const { asset } = parseHash(location.hash);
  const target = hashFor({ asset, finding: id, mode });
  if (location.hash === target) { if (!ctl.state.open) show(id, mode); } else location.hash = target;
}

export function closeFinding() {
  if (!ctl.state.open) return;
  const { asset } = parseHash(location.hash);
  if (parseHash(location.hash).finding) history.pushState(null, '', location.pathname + location.search + hashFor({ asset }));
  hide();
}

function sync() {
  const { finding, mode } = parseHash(location.hash);
  if (finding) { if (!ctl.state.open || ctl.state.id !== finding || ctl.state.mode !== mode) show(finding, mode); } else if (ctl.state.open) hide();
}

/** Change what the viewer shows without adding a history entry. */
function replaceHash(finding, mode) {
  const { asset } = parseHash(location.hash);
  history.replaceState(null, '', location.pathname + location.search + hashFor({ asset, finding, mode }));
}

// -------------------------------------------------------------- open / close

function ensureDom() {
  if (ctl.root) return;
  ctl.body = h('div', { class: 'fv-body' });
  ctl.toastEl = h('div', { class: 'fv-toast', role: 'status', 'aria-live': 'polite' });
  ctl.dialog = h('section', { class: 'fv', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fv-title', tabindex: '-1', 'data-testid': 'finding-viewer' }, ctl.body, ctl.toastEl);
  ctl.root = h('div', { class: 'fv-root', hidden: true }, h('div', { class: 'fv-backdrop', onClick: closeFinding }), ctl.dialog);
  document.body.append(ctl.root);
  ctl.dialog.addEventListener('keydown', trapTab);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', keepFocusInside);
}

/** While the viewer is open the page and the asset panel behind it are inert. The page stays inert if the panel is still open. */
function setInert(on) {
  const shell = document.querySelector('.shell');
  const panel = document.querySelector('.a360-root');
  const set = (el, value) => { if (!el) return; if (value) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } };
  set(panel, on);
  set(shell, on || document.body.classList.contains('a360-open'));
}

function show(id, mode = 'rgb') {
  ensureDom();
  const s = ctl.state;
  const first = !s.open;
  const changedFinding = s.id !== id;
  s.id = id; s.mode = mode; s.open = true;
  if (changedFinding) { s.editing = null; s.rejecting = false; s.linking = false; s.cmp = null; s.impact = null; }
  if (first) {
    s.restore = s.opener ?? document.activeElement;
    ctl.root.hidden = false;
    document.body.classList.add('fv-open');
    setInert(true);
    requestAnimationFrame(() => ctl.dialog.classList.add('is-in'));
  }
  load({ quiet: !first && !changedFinding && s.view === 'ready' });
}

function hide() {
  const s = ctl.state;
  s.open = false; s.id = null; s.token += 1; s.editing = null; s.rejecting = false; s.linking = false; s.cmp = null; s.impact = null;
  if (ctl.root) { ctl.root.hidden = true; ctl.dialog.classList.remove('is-in'); }
  document.body.classList.remove('fv-open');
  setInert(false);
  const back = s.restore;
  s.restore = null; s.opener = null;
  const target = back && back.isConnected ? back : document.querySelector('.a360-close') ?? null;
  if (target && typeof target.focus === 'function') target.focus();
}

function trapTab(e) {
  if (e.key !== 'Tab') return;
  const items = [...ctl.dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) { e.preventDefault(); ctl.dialog.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === ctl.dialog)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function keepFocusInside(e) {
  if (ctl.state.open && ctl.dialog && !ctl.dialog.contains(e.target)) (ctl.dialog.querySelector('.fv-close') ?? ctl.dialog).focus();
}

// ------------------------------------------------------------------ keyboard

const typing = (el) => el && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable);

function onKey(e) {
  const s = ctl.state;
  if (!s.open) return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (s.editing) { s.editing = null; draw(); focusMain(); } else if (s.rejecting) { s.rejecting = false; draw(); } else if (s.linking) { s.linking = false; draw(); } else closeFinding();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || s.view !== 'ready') return;
  if (s.editing && e.target.closest?.('.fv-hit')) return;
  const k = e.key;
  // A handled key must not also reach the control that gets focus next (the "e" would pick a class in the dropdown).
  const handled = () => { e.preventDefault(); e.stopPropagation(); };
  if (k === 'ArrowRight' || k === 'ArrowLeft') { if (!s.editing) { handled(); step(k === 'ArrowRight' ? 1 : -1); } }
  else if (k === '1' || k === '2' || k === '3') { handled(); setMode(MODES[Number(k) - 1][0]); }
  else if (k === 'c' && !s.editing && s.detail.finding.reviewStatus !== 'confirmed') { handled(); act('confirm'); }
  else if (k === 'e' && !s.editing && !s.detail.finding.rejected) { handled(); startEdit(); }
  else if (k === 'r' && !s.editing && !s.detail.finding.rejected) { handled(); s.rejecting = true; draw(); ctl.dialog.querySelector('[data-testid="reject-reason"]')?.focus(); }
}

function focusMain() { (ctl.dialog.querySelector('.fv-tab[aria-selected="true"]') ?? ctl.dialog).focus(); }

function step(delta) {
  const d = ctl.state.detail;
  if (!d || d.siblings.length < 2) return;
  const next = d.siblings[(d.index + delta + d.siblings.length) % d.siblings.length];
  replaceHash(next.id, ctl.state.mode);
  show(next.id, ctl.state.mode);
}

function setMode(mode) {
  if (ctl.state.mode === mode) return;
  ctl.state.mode = mode;
  replaceHash(ctl.state.id, mode);
  draw();
}

// ------------------------------------------------------------------- loading

async function load({ quiet = false } = {}) {
  const s = ctl.state;
  const mine = ++s.token;
  if (!quiet) { s.view = 'loading'; draw(); }
  try {
    const { flags = {}, repo, getSnapshot } = ctl.deps;
    if (flags.viewerDelay && !quiet) await sleep(flags.viewerDelay);
    if (flags.viewerFail) throw new Error('The finding service did not respond (simulated failure).');
    const detail = await loadFindingDetail(repo, getSnapshot(), s.id);
    if (mine !== s.token) return;
    s.detail = detail;
    s.view = detail.found ? 'ready' : 'missing';
    if (detail.found) reportImpact();
  } catch (e) {
    if (mine !== s.token) return;
    s.error = e; s.view = 'error';
  }
  draw();
  if (!quiet && s.view === 'ready') ctl.dialog.querySelector('.fv-close')?.focus();
}

/** After a reviewer action the scores recompute; say what happened to the owning asset. */
function reportImpact() {
  const s = ctl.state;
  if (!s.impact) return;
  const { ids, scores } = s.impact;
  const snap = ctl.deps.getSnapshot();
  const parts = ids.map((id) => {
    const a = snap.byId.get(id);
    const nowScore = snap.scores.get(id)?.hi;
    const was = scores[id];
    if (!a || !nowScore) return null;
    if (was === nowScore.score) return `${a.name} health index unchanged at ${nowScore.score ?? 'not assessed'}`;
    return `${a.name} health index ${was ?? 'not assessed'} → ${nowScore.score ?? 'not assessed'}${nowScore.band ? ` (${nowScore.band})` : ''}`;
  }).filter(Boolean);
  s.impact = null;
  if (parts.length) s.impactText = `Scores recomputed: ${parts.join('; ')}.`;
}

// -------------------------------------------------------------------- images

async function photo(src) {
  if (!src) return null;
  if (!ctl.imageCache.has(src)) ctl.imageCache.set(src, loadImage(src).catch(() => null));
  return ctl.imageCache.get(src);
}

const svgEl = (name, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/**
 * One image with the box over it. `kind` is 'rgb' or 'thermal'. Returns { el, setBox, readout }.
 * The box is an SVG rectangle; while editing, a transparent hit area and a corner handle let it be dragged.
 */
function stage(f, kind, { editable = false, onBox = () => {}, size = 'l' } = {}) {
  const canvas = h('canvas', { class: 'fv-canvas', width: SIZE.w, height: SIZE.h, role: 'img', 'aria-label': `${kind === 'thermal' ? 'Generated thermal view' : 'Photograph'} of ${f.label}, demo image` });
  const svg = svgEl('svg', { class: 'fv-overlay', viewBox: '0 0 1 1', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const rect = svgEl('rect', { class: 'fv-bbox', 'vector-effect': 'non-scaling-stroke' });
  svg.append(rect);
  const label = h('span', { class: 'fv-boxlabel', 'data-testid': 'box-label' }, `${f.label} · ${f.confidence}`);
  const hit = h('div', { class: 'fv-hit', tabindex: '0', role: 'group', 'aria-label': 'Box. Drag to move; arrow keys nudge it.', hidden: !editable });
  const handle = h('span', { class: 'fv-handle', hidden: !editable, 'aria-hidden': 'true' });
  const readout = { value: null };
  const wrap = h('div', { class: `fv-stage fv-stage-${size}`, 'data-testid': `stage-${kind}`, 'data-demo': 'true' }, canvas, svg, label, hit, handle, h('span', { class: 'fv-demo', 'data-testid': 'demo-label' }, DEMO_LABEL));

  let box = f.bbox ? { ...f.bbox } : null;
  const place = () => {
    if (!box) { rect.setAttribute('width', '0'); label.hidden = true; hit.hidden = true; handle.hidden = true; return; }
    rect.setAttribute('x', box.x); rect.setAttribute('y', box.y); rect.setAttribute('width', box.w); rect.setAttribute('height', box.h);
    label.hidden = false;
    label.style.left = `${box.x * 100}%`; label.style.top = `${box.y * 100}%`;
    for (const el of [hit]) Object.assign(el.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
    Object.assign(handle.style, { left: `${(box.x + box.w) * 100}%`, top: `${(box.y + box.h) * 100}%` });
  };
  place();

  if (editable && box) {
    const rectOf = () => wrap.getBoundingClientRect();
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const drag = (target, move) => target.addEventListener('pointerdown', (e) => {
      e.preventDefault(); target.setPointerCapture(e.pointerId);
      const r = rectOf(); const start = { ...box }; const x0 = e.clientX; const y0 = e.clientY;
      const onMove = (ev) => { move(start, (ev.clientX - x0) / r.width, (ev.clientY - y0) / r.height); place(); onBox({ ...box }); };
      const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); };
      target.addEventListener('pointermove', onMove); target.addEventListener('pointerup', onUp);
    });
    drag(hit, (s0, dx, dy) => { box.x = clamp(s0.x + dx, 0, 1 - s0.w); box.y = clamp(s0.y + dy, 0, 1 - s0.h); });
    drag(handle, (s0, dx, dy) => { box.w = clamp(s0.w + dx, 0.02, 1 - s0.x); box.h = clamp(s0.h + dy, 0.02, 1 - s0.y); });
    hit.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.02 : 0.005;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      if (e.altKey) { box.w = clamp(box.w + d[0], 0.02, 1 - box.x); box.h = clamp(box.h + d[1], 0.02, 1 - box.y); } else { box.x = clamp(box.x + d[0], 0, 1 - box.w); box.y = clamp(box.y + d[1], 0, 1 - box.h); }
      place(); onBox({ ...box });
    });
  }

  const ready = photo(f.image).then((img) => {
    if (kind === 'thermal') readout.value = drawThermal(canvas, img, f);
    else drawPhoto(canvas, img, f);
    wrap.dataset.ready = 'true';
    return readout.value;
  });
  return { el: wrap, ready, setBox: (b) => { box = { ...b }; place(); } };
}

// --------------------------------------------------------------------- views

function draw() {
  const s = ctl.state;
  ctl.dialog.setAttribute('aria-busy', String(s.view === 'loading'));
  if (s.view === 'loading') {
    replace(ctl.body, bar(s.id), h('div', { class: 'fv-pad', 'data-testid': 'viewer-loading' }, h('div', { class: 'fv-skel fv-skel-block' }), h('div', { class: 'fv-skel fv-skel-line' }), h('div', { class: 'fv-skel fv-skel-line' })));
  } else if (s.view === 'error') {
    replace(ctl.body, bar(s.id), h('div', { class: 'fv-pad fv-error', role: 'alert', 'data-testid': 'viewer-error' }, h('h2', {}, 'Could not load this finding'), h('p', {}, s.error?.message ?? String(s.error)),
      h('button', { class: 'lr-btn lr-primary', type: 'button', onClick: () => { ctl.deps.flags.viewerFail = false; load(); } }, 'Retry')));
  } else if (s.view === 'missing') {
    replace(ctl.body, bar(s.id), h('div', { class: 'fv-pad fv-empty', role: 'status', 'data-testid': 'viewer-missing' }, h('h2', {}, 'Finding not found'),
      h('p', { class: 'fv-muted' }, `There is no finding with the id "${s.id}". The link may be old.`), h('button', { class: 'lr-btn', type: 'button', onClick: closeFinding }, 'Close')));
  } else {
    drawReady(s.detail);
  }
}

function bar(id, d) {
  const prev = h('button', { class: 'lr-btn', type: 'button', 'aria-label': 'Previous finding', title: 'Previous finding (←)', disabled: !d || d.siblings.length < 2, onClick: () => step(-1), 'data-testid': 'prev' }, '‹');
  const next = h('button', { class: 'lr-btn', type: 'button', 'aria-label': 'Next finding', title: 'Next finding (→)', disabled: !d || d.siblings.length < 2, onClick: () => step(1), 'data-testid': 'next' }, '›');
  return h('div', { class: 'fv-bar' },
    h('span', { class: 'fv-id' }, id ?? ''), h('span', { class: 'fv-spacer' }),
    d ? h('span', { class: 'fv-muted', 'data-testid': 'position' }, `${d.index + 1} of ${d.siblings.length}${d.owner ? ` on ${d.owner.name}` : ''}`) : null,
    d ? prev : null, d ? next : null,
    h('button', { class: 'fv-close', type: 'button', 'aria-label': 'Close finding viewer', title: 'Close (Esc)', onClick: closeFinding }, '×'));
}

function drawReady(d) {
  const s = ctl.state;
  const f = d.finding;
  const title = h('div', { class: 'fv-title' },
    h('h2', { id: 'fv-title' }, f.label), tag(f.severity, SEV_TONE[f.severity], { 'data-testid': 'severity' }),
    tag(f.rejected ? 'rejected' : f.unreviewed ? 'unreviewed' : 'confirmed', STATUS_TONE[f.reviewStatus], { 'data-testid': 'review-status' }),
    f.edit?.corrected ? tag('corrected', 'b') : null, f.edit?.relinked ? tag('relinked', 'b') : null);

  const tabs = h('div', { class: 'fv-tabs', role: 'tablist', 'aria-label': 'View' }, MODES.map(([id, label, key]) =>
    h('button', { class: 'fv-tab', role: 'tab', type: 'button', 'aria-selected': String(s.mode === id), 'data-mode': id, title: `${label} (${key})`, onClick: () => setMode(id) }, label, ' ', h('kbd', {}, key))));

  const left = h('div', { class: 'fv-left' }, tabs, s.mode === 'compare' ? compareView(d) : singleView(d, s.mode));
  const right = h('div', { class: 'fv-side' }, ...sideView(d));
  replace(ctl.body, bar(d.id, d), h('div', { class: 'fv-pad' }, title, h('div', { class: 'fv-main' }, left, right)));
  if (s.editing) updateSave();
  if (s.impactText) { toast(s.impactText); s.impactText = null; }
}

// ---- RGB and thermal

function singleView(d, mode) {
  const s = ctl.state;
  const f = { ...d.finding, label: d.finding.label };
  const live = s.editing;
  const kind = mode === 'thermal' ? 'thermal' : 'rgb';
  const view = { ...f, bbox: live?.bbox ?? f.bbox, label: live ? (DEFECT_OPTIONS.find((o) => o.id === live.defect_class)?.label ?? f.label) : f.label };
  const st = stage(view, kind, { editable: Boolean(live), onBox: (b) => { live.bbox = b; syncBoxInputs(b); updateSave(); } });
  ctl.stage = st;
  const root = h('div', { class: 'fv-view' }, st.el);

  const crop = h('canvas', { class: 'fv-crop', role: 'img', 'aria-label': 'Marked area, enlarged, demo image' });
  const cropBox = h('div', { class: 'fv-cropbox', 'data-demo': 'true' }, crop, h('span', { class: 'fv-demo', 'data-testid': 'demo-label-crop' }, DEMO_LABEL), h('p', { class: 'fv-muted fv-small' }, 'The marked area, enlarged.'));
  photo(f.image).then((img) => drawCrop(crop, img, view));

  if (kind === 'thermal') {
    const read = h('dl', { class: 'fv-readouts', 'data-testid': 'thermal-readouts' }, h('dt', {}, 'Max'), h('dd', { 'data-testid': 'temp-max' }, '…'), h('dt', {}, 'Min'), h('dd', { 'data-testid': 'temp-min' }, '…'),
      h('dt', {}, 'Max in the box'), h('dd', { 'data-testid': 'temp-box' }, '…'));
    const scale = h('div', { class: 'fv-scale', 'data-demo': 'true', 'data-testid': 'thermal-scale' },
      h('span', { class: 'fv-scale-max', 'data-testid': 'scale-max' }, '…'), h('span', { class: 'fv-scale-bar', style: { background: SCALE_GRADIENT } }), h('span', { class: 'fv-scale-min', 'data-testid': 'scale-min' }, '…'),
      h('span', { class: 'fv-demo', 'data-testid': 'demo-label-scale' }, DEMO_LABEL));
    st.ready.then((r) => {
      if (!r) return;
      read.querySelector('[data-testid="temp-max"]').textContent = `${r.max} °C`;
      read.querySelector('[data-testid="temp-min"]').textContent = `${r.min} °C`;
      read.querySelector('[data-testid="temp-box"]').textContent = r.boxMax === null ? '–' : `${r.boxMax} °C`;
      scale.querySelector('[data-testid="scale-max"]').textContent = `${r.max}°`;
      scale.querySelector('[data-testid="scale-min"]').textContent = `${r.min}°`;
    });
    root.append(h('div', { class: 'fv-thermal-row' }, scale, h('div', {}, read, h('p', { class: 'fv-muted fv-small' }, 'A generated false-colour view with made-up temperatures. It shows where a thermal image would be.'))));
  }
  root.append(cropBox);
  if (!f.bbox) root.append(h('p', { class: 'fv-muted fv-small' }, 'This finding has no box (LiDAR findings are positions, not pictures).'));
  return root;
}

// ---- compare

function compareView(d) {
  const s = ctl.state;
  const sg = d.compare.sightings;
  if (sg.length < 2) {
    return h('div', { class: 'fv-compare-empty', role: 'status', 'data-testid': 'compare-empty' }, h('h3', {}, 'No other sightings'),
      h('p', { class: 'fv-muted' }, 'No other campaign has a confirmed or automatic link to this finding, so there is nothing to compare. Proposed links wait in the Links tab until a reviewer decides.'));
  }
  const cur = sg.findIndex((x) => x.current);
  if (!s.cmp || !sg.some((x) => x.id === s.cmp.a) || !sg.some((x) => x.id === s.cmp.b)) {
    s.cmp = cur > 0 ? { a: sg[cur - 1].id, b: sg[cur].id } : { a: sg[0].id, b: sg[1].id };
  }
  const A = sg.find((x) => x.id === s.cmp.a);
  const B = sg.find((x) => x.id === s.cmp.b);
  const pick = (which, label) => h('label', { class: 'fv-pick' }, label, h('select', { 'aria-label': label, 'data-testid': `cmp-${which}`, onChange: (e) => { s.cmp[which] = e.target.value; draw(); } },
    sg.map((x) => h('option', { value: x.id, selected: x.id === s.cmp[which] }, `${x.campaignName} · ${x.date}`))));

  const pane = (x, role) => {
    const st = stage({ ...x, label: x.label }, 'rgb', { size: 's' });
    return h('div', { class: 'fv-pane', 'data-testid': `pane-${role}` },
      h('h4', {}, `${x.campaignName} `, h('span', { class: 'fv-muted' }, x.date)), st.el,
      h('div', { class: 'fv-paneinfo' }, tag(`condition ${x.condition}`, x.condition <= 1 ? 'r' : x.condition === 2 ? 'a' : 'b', { 'data-testid': `cond-${role}` }), ' ', tag(x.severity, SEV_TONE[x.severity]), ' ',
        tag(x.reviewStatus === 'pending' ? 'unreviewed' : x.reviewStatus, STATUS_TONE[x.reviewStatus]),
        h('div', { class: 'fv-muted fv-small' }, `${x.id} · ${x.label} · confidence ${x.confidence}`),
        x.closedBy ? h('div', { class: 'fv-small' }, `Closed by repair ${x.closedBy.id} on ${x.closedBy.date}`) : null));
  };

  const ia = sg.indexOf(A);
  const ib = sg.indexOf(B);
  const lo = Math.min(ia, ib);
  const hi = Math.max(ia, ib);
  const repairs = d.compare.between.filter((b) => sg.findIndex((x) => x.id === b.from) >= lo && sg.findIndex((x) => x.id === b.to) <= hi).flatMap((b) => b.items);
  const [older, newer] = ia <= ib ? [A, B] : [B, A];
  const change = newer.condition === older.condition ? 'unchanged' : newer.condition < older.condition ? 'worse' : 'better';
  const timeline = h('ol', { class: 'fv-timeline', 'data-testid': 'timeline' }, sg.flatMap((x, i) => {
    const between = d.compare.between[i - 1]?.items ?? [];
    return [
      i > 0 ? h('li', { class: 'fv-tl-gap', 'aria-hidden': between.length ? 'false' : 'true' }, between.length ? tag(`${between.length} repair${between.length === 1 ? '' : 's'}`, 'g') : '→') : null,
      h('li', { class: `fv-tl${x.current ? ' is-current' : ''}` }, h('b', {}, x.campaignName), h('span', {}, `cond ${x.condition}`)),
    ];
  }).filter(Boolean));

  return h('div', { class: 'fv-compare', 'data-testid': 'compare' },
    h('div', { class: 'fv-picks' }, pick('a', 'Left'), pick('b', 'Right')),
    timeline,
    h('div', { class: 'fv-panes' }, pane(A, 'a'), pane(B, 'b')),
    h('div', { class: 'fv-change', 'data-testid': 'cmp-change' },
      h('b', {}, `Condition ${older.condition} → ${newer.condition}: ${change}`), ` between ${older.campaignName} and ${newer.campaignName}.`),
    h('div', { class: 'fv-repairs', 'data-testid': 'cmp-repairs' }, repairs.length
      ? [h('h4', {}, 'Repairs in between'), h('ul', {}, repairs.map((r) => h('li', {}, tag(r.id, 'g'), ` ${r.date} · ${r.action} on ${r.assetName}`, r.closesThis ? ' · closed this finding' : h('span', { class: 'fv-muted' }, ' · a different finding on the same asset'))))]
      : h('p', { class: 'fv-muted' }, 'No repair between these two campaigns.')));
}

// ---- the side column

function sideView(d) {
  const s = ctl.state;
  const f = d.finding;
  const out = [];
  if (f.rejected) out.push(h('div', { class: 'fv-banner r', 'data-testid': 'rejected-banner' }, h('b', {}, 'Rejected. '), `A reviewer decided this is not a defect${f.edit?.rejected_reason ? ` (${f.edit.rejected_reason})` : ''}. It no longer counts toward any score.`));
  if (f.edit?.corrected && d.original) {
    const o = d.original;
    const bits = [];
    if (o.changed.defectClass) bits.push(`class ${o.label} → ${f.label}`);
    if (o.changed.condition) bits.push(`severity ${o.condition} (${o.severity}) → ${f.condition} (${f.severity})`);
    if (o.changed.bbox) bits.push('box adjusted');
    out.push(h('div', { class: 'fv-banner b', 'data-testid': 'corrected-banner' }, h('b', {}, 'Corrected by a reviewer. '), bits.join('; ') || 'No visible change.', ` The AI proposed ${o.label}, condition ${o.condition}.`));
  }
  if (f.unreviewed) out.push(h('div', { class: 'fv-banner a' }, 'The AI proposed this finding and no reviewer has confirmed it. It still counts toward scores.'));

  out.push(h('dl', { class: 'fv-facts', 'data-testid': 'facts' },
    h('dt', {}, 'Class'), h('dd', { 'data-testid': 'fact-class' }, f.label),
    h('dt', {}, 'Severity'), h('dd', { 'data-testid': 'fact-severity' }, `${f.severity} · condition ${f.condition} (${f.conditionLabel})`),
    h('dt', {}, 'Confidence'), h('dd', { 'data-testid': 'fact-confidence' }, String(f.confidence)),
    h('dt', {}, 'Review'), h('dd', {}, f.rejected ? 'rejected' : f.unreviewed ? 'unreviewed (AI proposal)' : 'confirmed'),
    h('dt', {}, 'Campaign'), h('dd', {}, `${f.campaignName} · ${f.date}`),
    h('dt', {}, 'Sensor'), h('dd', {}, `${f.sensor} · capture ${f.captureId}`),
    h('dt', {}, 'Location'), h('dd', {}, f.location ? `${f.location.lat.toFixed(5)}, ${f.location.lng.toFixed(5)}` : '-'),
    h('dt', {}, 'Recorded on'), h('dd', {}, h('button', { class: 'a360-link', type: 'button', onClick: () => { const a = f.assetId; closeFinding(); openAsset(a); } }, f.assetName), ` ${f.assetClass}`, f.componentHint ? h('span', { class: 'fv-muted' }, ` (${humanize(f.componentHint)} not identified)`) : null),
    d.owner ? [h('dt', {}, 'Owner'), h('dd', { 'data-testid': 'owner-hi' }, `${d.owner.name} · health index ${d.owner.hi ?? 'not assessed'}`, d.owner.band ? [' ', tag(d.owner.band, { normal: 'g', moderate: 'a', poor: 'r' }[d.owner.band])] : null)] : null));

  out.push(s.editing ? editForm(d) : actions(d));
  out.push(linkSection(d));
  out.push(historySection(d));
  return out;
}

function actions(d) {
  const s = ctl.state;
  const f = d.finding;
  if (s.rejecting) {
    return h('div', { class: 'fv-sec fv-reject', role: 'group', 'aria-label': 'Reject this finding', 'data-testid': 'reject-confirm' },
      h('h3', {}, 'Reject this finding?'), h('p', { class: 'fv-muted fv-small' }, 'It will no longer count toward any score, and links that waited on it leave the review queue.'),
      h('label', { class: 'fv-field' }, 'Reason', h('select', { 'data-testid': 'reject-reason', 'aria-label': 'Reason' }, REJECT_REASONS.map((r) => h('option', { value: r }, r)))),
      h('div', { class: 'fv-actions' },
        h('button', { class: 'lr-btn lr-danger', type: 'button', 'data-testid': 'reject-yes', disabled: s.busy, onClick: () => act('reject', ctl.dialog.querySelector('[data-testid="reject-reason"]').value) }, 'Reject'),
        h('button', { class: 'lr-btn', type: 'button', onClick: () => { s.rejecting = false; draw(); } }, 'Cancel')));
  }
  return h('div', { class: 'fv-sec', role: 'group', 'aria-label': 'Reviewer actions' },
    h('h3', {}, 'Reviewer'),
    h('div', { class: 'fv-actions' },
      h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'confirm', disabled: s.busy || f.reviewStatus === 'confirmed', onClick: () => act('confirm') }, 'Confirm ', h('kbd', {}, 'c')),
      h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'correct', disabled: s.busy || f.rejected, onClick: startEdit }, 'Correct ', h('kbd', {}, 'e')),
      h('button', { class: 'lr-btn lr-danger', type: 'button', 'data-testid': 'reject', disabled: s.busy || f.rejected, onClick: () => { s.rejecting = true; draw(); ctl.dialog.querySelector('[data-testid="reject-reason"]')?.focus(); } }, 'Reject ', h('kbd', {}, 'r')),
      d.original ? h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'revert', disabled: s.busy, onClick: () => act('revert') }, 'Revert to the AI proposal') : null),
    h('p', { class: 'fv-muted fv-small' }, 'Arrow keys move between findings on this asset. Esc closes.'));
}

// ---- correction

function startEdit() {
  const s = ctl.state;
  const f = s.detail.finding;
  s.editing = { defect_class: f.defectClass, condition_score: f.condition, bbox: f.bbox ? { ...f.bbox } : null };
  s.mode = s.mode === 'compare' ? 'rgb' : s.mode;
  draw();
  ctl.dialog.querySelector('[data-testid="edit-class"]')?.focus();
}

function boxInputs() { return ['x', 'y', 'w', 'h'].map((k) => ctl.dialog.querySelector(`[data-testid="box-${k}"]`)); }
/** A drag changed the box: show the new numbers in every field (typing does not come through here). */
function syncBoxInputs(b) { for (const [i, k] of ['x', 'y', 'w', 'h'].entries()) { const el = boxInputs()[i]; if (el) el.value = String(pct(b[k])); } }

function editProblems() {
  const e = ctl.state.editing;
  const b = e.bbox;
  if (!b) return [];
  const out = [];
  if (!(b.w >= 0.01 && b.h >= 0.01)) out.push('The box is too small.');
  if (b.x < 0 || b.y < 0 || b.x + b.w > 1.0001 || b.y + b.h > 1.0001) out.push('The box must stay inside the image.');
  return out;
}

function changes() {
  const s = ctl.state;
  const f = s.detail.finding;
  const e = s.editing;
  const c = {};
  if (e.defect_class !== f.defectClass) c.defect_class = e.defect_class;
  if (e.condition_score !== f.condition) c.condition_score = e.condition_score;
  if (e.bbox && f.bbox && ['x', 'y', 'w', 'h'].some((k) => Math.abs(e.bbox[k] - f.bbox[k]) > 0.0005)) c.bbox = e.bbox;
  return c;
}

function updateSave() {
  const save = ctl.dialog.querySelector('[data-testid="save-correction"]');
  const note = ctl.dialog.querySelector('[data-testid="edit-problems"]');
  if (!save) return;
  const problems = editProblems();
  save.disabled = ctl.state.busy || problems.length > 0 || Object.keys(changes()).length === 0;
  if (note) note.textContent = problems.join(' ');
  const summary = ctl.dialog.querySelector('[data-testid="edit-summary"]');
  if (summary) { const k = Object.keys(changes()); summary.textContent = k.length ? `Will change: ${k.map((x) => ({ defect_class: 'class', condition_score: 'severity', bbox: 'box' }[x])).join(', ')}.` : 'No change yet.'; }
}

function editForm(d) {
  const s = ctl.state;
  const e = s.editing;
  const f = d.finding;
  const groups = [...new Set(d.classes.map((c) => c.group))];
  const num = (k) => h('label', { class: 'fv-num' }, k.toUpperCase(), h('input', {
    type: 'number', step: '0.5', min: '0', max: '100', value: e.bbox ? String(pct(e.bbox[k])) : '', disabled: !e.bbox, 'data-testid': `box-${k}`, 'aria-label': `Box ${k} in percent`,
    onInput: (ev) => { const v = Number(ev.target.value) / 100; if (Number.isFinite(v)) { e.bbox = { ...e.bbox, [k]: v }; ctl.stage?.setBox(e.bbox); updateSave(); } },
  }));
  return h('div', { class: 'fv-sec fv-edit', role: 'group', 'aria-label': 'Correct this finding', 'data-testid': 'edit-form' },
    h('h3', {}, 'Correct this finding'),
    h('label', { class: 'fv-field' }, 'Class', h('select', { 'data-testid': 'edit-class', 'aria-label': 'Class', onChange: (ev) => { e.defect_class = ev.target.value; draw(); ctl.dialog.querySelector('[data-testid="edit-class"]')?.focus(); } },
      groups.map((g) => h('optgroup', { label: humanize(g) }, d.classes.filter((c) => c.group === g).map((c) => h('option', { value: c.id, selected: c.id === e.defect_class }, c.label)))))),
    h('label', { class: 'fv-field' }, 'Severity', h('select', { 'data-testid': 'edit-severity', 'aria-label': 'Severity', onChange: (ev) => { e.condition_score = Number(ev.target.value); updateSave(); } },
      SEVERITIES.map(([n, word, cond]) => h('option', { value: String(n), selected: n === e.condition_score }, `${word} (condition ${n}, ${cond})`)))),
    e.bbox ? h('div', {}, h('p', { class: 'fv-muted fv-small' }, 'Drag the box or its corner on the image, or type the numbers (percent of the image). Arrow keys nudge the box when it has focus; Alt+arrows resize it.'),
      h('div', { class: 'fv-nums' }, num('x'), num('y'), num('w'), num('h'))) : h('p', { class: 'fv-muted fv-small' }, 'This finding has no box to adjust.'),
    h('label', { class: 'fv-field' }, 'Reason (optional)', h('input', { type: 'text', maxlength: '200', 'data-testid': 'edit-reason', 'aria-label': 'Reason for the correction', value: e.reason ?? '', onInput: (ev) => { e.reason = ev.target.value; } })),
    h('p', { class: 'fv-small', 'data-testid': 'edit-summary' }, 'No change yet.'), h('p', { class: 'fv-problem fv-small', role: 'alert', 'data-testid': 'edit-problems' }),
    h('p', { class: 'fv-muted fv-small' }, `AI proposal: ${f.label}, condition ${f.condition}. Saving confirms the finding with your changes.`),
    h('div', { class: 'fv-actions' },
      h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'save-correction', disabled: true, onClick: () => act('correct', changes(), ctl.state.editing.reason?.trim() || null) }, 'Save correction'),
      h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'cancel-correction', onClick: () => { s.editing = null; draw(); focusMain(); } }, 'Cancel')));
}

// ---- review history (from the audit log)

const ACTION_WORDS = { finding_confirm: 'Confirmed', finding_reject: 'Rejected', finding_correct: 'Corrected', finding_relink: 'Linked to another asset', finding_revert: 'Reverted to the AI proposal' };
const stampText = (iso) => String(iso).replace('T', ' ').replace(/\.\d+Z$/, 'Z');

function historySection(d) {
  const rows = d.history ?? [];
  return h('div', { class: 'fv-sec', 'data-testid': 'history' }, h('h3', {}, 'Review history'),
    rows.length ? h('ol', { class: 'fv-history' }, rows.map((e) => h('li', { 'data-action': e.action },
      h('span', { class: 'fv-muted fv-small' }, h('time', { datetime: e.at }, stampText(e.at)), ` · ${e.actor}`), ' ',
      h('b', {}, ACTION_WORDS[e.action] ?? e.action), e.detail && ['finding_correct', 'finding_relink'].includes(e.action) ? h('span', { class: 'fv-small' }, ` ${e.detail.replace(/^\w+ F-\d+:? ?/, '')}`) : null,
      e.reason ? h('div', { class: 'fv-small', 'data-testid': 'history-reason' }, `Reason: ${e.reason}`) : null)))
      : h('p', { class: 'fv-muted fv-small' }, 'No reviewer has acted on this finding yet.'));
}

// ---- link to asset

function linkSection(d) {
  const s = ctl.state;
  const f = d.finding;
  const head = h('div', { class: 'fv-linkhead' }, h('span', {}, 'Recorded on ', h('b', {}, f.assetName), ` (${f.assetClass})`), ' ',
    h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'link-toggle', 'aria-expanded': String(s.linking), onClick: () => { s.linking = !s.linking; draw(); } }, s.linking ? 'Hide suggestions' : 'Change…'));
  if (!s.linking) return h('div', { class: 'fv-sec', 'data-testid': 'link-asset' }, h('h3', {}, 'Link to asset'), head);
  return h('div', { class: 'fv-sec', 'data-testid': 'link-asset' }, h('h3', {}, 'Link to asset'), head,
    h('p', { class: 'fv-muted fv-small' }, 'Suggested by the matcher from the finding’s GPS point and where this kind of defect is recorded. Pick one to move the finding; both assets’ scores recompute.'),
    h('ul', { class: 'fv-suggest', 'data-testid': 'suggestions' }, d.suggestions.map((x) => h('li', { class: x.current ? 'is-current' : '', 'data-asset': x.assetId },
      h('div', { class: 'fv-sugg-main' }, h('b', {}, x.name), h('span', { class: 'fv-muted fv-small' }, ` ${x.class} · ${x.assetId}${x.distance !== null ? ` · ${x.distance} m away` : ''}`)),
      h('div', { class: 'fv-sugg-score' }, h('span', { class: 'fv-mini', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round(x.score * 100)}%` } })), ` ${x.score.toFixed(2)}`),
      h('details', { class: 'fv-small' }, h('summary', {}, 'why'), h('ul', {}, x.reasons.map((r) => h('li', {}, `${r.signal} ${r.value.toFixed(2)} (+${r.contribution.toFixed(2)}): ${r.detail}`)))),
      x.current ? tag('current', 'b') : h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'link-here', disabled: s.busy, onClick: () => act('relink', x.assetId) }, 'Link here')))));
}

// -------------------------------------------------------------------- actions

function toast(text) {
  ctl.state.toast = text;
  ctl.toastEl.textContent = text;
  ctl.toastEl.classList.add('is-show');
  clearTimeout(ctl.toastTimer);
  ctl.toastTimer = setTimeout(() => { ctl.toastEl.classList.remove('is-show'); }, 5000);
}

async function act(kind, payload, reason = null) {
  const s = ctl.state;
  const d = s.detail;
  if (!d || s.busy) return;
  const { repo, getSnapshot } = ctl.deps;
  const snap = getSnapshot();
  const ids = new Set();
  if (d.owner) ids.add(d.owner.id);
  if (kind === 'relink') { const o = snap.ctx.ownerOf(payload); if (o) ids.add(o); }
  s.impact = { ids: [...ids], scores: Object.fromEntries([...ids].map((id) => [id, snap.scores.get(id)?.hi.score ?? null])) };
  s.busy = true;
  try {
    if (kind === 'confirm') await repo.confirmFinding(d.id);
    else if (kind === 'reject') { await repo.rejectFinding(d.id, { reason: payload }); s.rejecting = false; }
    else if (kind === 'correct') { await repo.correctFinding(d.id, payload, { reason }); s.editing = null; }
    else if (kind === 'relink') { await repo.relinkFinding(d.id, payload); s.linking = false; }
    else if (kind === 'revert') await repo.revertFinding(d.id);
    toast({ confirm: 'Finding confirmed.', reject: 'Finding rejected.', correct: 'Correction saved and the finding confirmed.', relink: 'Finding linked to the new asset.', revert: 'Reverted to the AI proposal.' }[kind]);
  } catch (e) {
    s.impact = null;
    toast(`Could not ${kind}: ${e.message}`);
  } finally {
    s.busy = false;
    draw();
  }
}
