// The shell and small helpers shared by the screens rebuilt on repository data (Line Health, Tower Health,
// Maintenance History, Risk Map): filter column on the left, content on the right, with the loading, error and
// empty states, the "Scores as of" note, and the screen's selection kept in the URL hash.

import { h, replace } from '../ui/dom.js';
import { SEVERITY } from './assetModel.js';
import { parseHash, parseView, hashFor, VIEW_KEYS } from './hashState.js';

export const BAND_TONE = { normal: 'g', moderate: 'a', poor: 'r', none: 'x' };
/** What a KPI subtitle means, so a bad count is never green: ok, warn, bad or neutral. */
export const BAND_SUB = { normal: 'ok', moderate: 'warn', poor: 'bad', none: 'neutral' };
export const RISK_SUB = { low: 'ok', medium: 'warn', high: 'bad', critical: 'bad' };
export const SEV_TONE = { critical: 'r', serious: 'r', moderate: 'a', minor: 'b', none: 'g' };
export const STATUS_TONE = { open: 'a', in_progress: 'b', completed: 'g', cancelled: 'x' };
export const COND_CLASS = (n) => (n === null || n === undefined ? 'hl-cn' : `hl-c${n}`);
export const condWord = (n) => (n === null || n === undefined ? 'not assessed' : SEVERITY[n].condition);

/** A sparkline needs two points; a single value is drawn flat. */
export const spark = (values) => { const v = values.filter((x) => x !== null && x !== undefined); return v.length > 1 ? v : v.length ? [v[0], v[0]] : [0, 0]; };
export const tag = (text, tone, extra = {}) => h('span', { class: `tag ${tone ?? 'x'}`, ...extra }, text);
export const pct = (x) => `${Math.round(x * 1000) / 10}%`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const humanize = (s) => String(s ?? '').replace(/_/g, ' ');

/** Write the screen's keys into the hash without adding a history entry, keeping the overlay keys. */
export function writeView(view) {
  const target = hashFor({ ...parseHash(location.hash), ...view });
  if (target !== location.hash) history.replaceState(null, '', location.pathname + location.search + target);
}
const clearAll = () => writeView(Object.fromEntries(VIEW_KEYS.map((k) => [k, null])));
let pendingClear = null; // leaving a screen clears its keys, unless the next tab of the same screen mounts straight away

export const skeleton = () => h('div', { class: 'hl-main', 'data-testid': 'hl-loading', 'aria-busy': 'true' },
  h('div', { class: 'a360-skel hl-skel-kpi' }), h('div', { class: 'a360-skel hl-skel-block' }), h('div', { class: 'a360-skel hl-skel-block' }));

export const asOfNote = (snap) => h('div', { class: 'asof', 'data-testid': 'as-of', title: 'The demo\'s fixed reference date. Scores use only evidence and repairs up to this date.' }, `Scores as of ${snap.asOf}`);

export function field(label, control) { return h('label', {}, label, control); }
export function select(testid, label, options, value, onChange) {
  return h('select', { 'data-testid': testid, 'aria-label': label, onChange: (e) => onChange(e.target.value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
}
export function emptyState(testid, title, text) {
  return h('div', { class: 'card hl-state', 'data-testid': testid }, h('h3', {}, title), h('p', { class: 'a360-muted' }, text));
}

/**
 * Mount a screen. The spec:
 *   view                 the screen's id in the hash (view=...). Keys left by another screen are dropped on mount.
 *   noun                 "this tower", used in "Could not load ..."
 *   state(snap)          the selection, read from the hash (and written back, so the hash is always valid)
 *   controls(state, snap, redo)   nodes for the filter column
 *   load(snap, state)    the model (may be async)
 *   draw(model, ctx)     the content nodes. ctx = { snap, state, track(cleanup), deps }
 *   redraw?(model, ctx)  optional: update what is drawn after a data or theme change (a map keeps its view this way)
 *   urlChanged?()        true when the hash changed in a way that needs a reload
 * Loading, error (with Retry) and the "Scores as of" note are handled here. ?healthdelay and ?healthfail slow or fail the first load.
 */
export function mountScreen(stage, deps, spec) {
  clearTimeout(pendingClear);
  if (parseView(location.hash).view !== spec.view) clearAll();
  const root = stage.querySelector('[data-hl-root]');
  const flags = deps.flags ?? {};
  const grid = h('div', { class: 'hl-grid' });
  const filter = h('aside', { class: 'filter-col hl-filter' });
  const main = h('div', { class: 'hl-main-wrap' });
  grid.append(filter, main);
  root.append(grid);
  const cleanups = [];
  let seq = 0;
  let failedOnce = false;
  let disposed = false;
  let drawn = false;
  let phase = 'loading'; // loading | ready | error: theme and data changes only redraw a screen that is showing content
  const runCleanups = () => { for (const c of cleanups.splice(0)) { try { c(); } catch { /* a chart that is already gone */ } } };

  async function show({ quiet = false } = {}) {
    const mine = ++seq;
    const snap = deps.getSnapshot();
    const state = spec.state(snap);
    replace(filter, h('div', { class: 'filter-head' }, h('b', {}, 'Filter')), ...spec.controls(state, snap, show), snap ? asOfNote(snap) : null);
    if (!quiet) { phase = 'loading'; drawn = false; runCleanups(); replace(main, skeleton()); }
    try {
      if (!snap) throw new Error('The registry data is not loaded.');
      if (flags.healthDelay && !quiet) await new Promise((r) => setTimeout(r, flags.healthDelay));
      if (flags.healthFail && !failedOnce) { failedOnce = true; throw new Error('The health service did not respond (simulated failure).'); }
      const model = await spec.load(snap, state);
      if (disposed || mine !== seq) return;
      const ctx = { snap, state, track: (fn) => cleanups.push(fn), deps };
      if (quiet && drawn && spec.redraw) { spec.redraw(model, ctx); phase = 'ready'; return; }
      runCleanups();
      phase = 'ready';
      replace(main, ...spec.draw(model, ctx));
      drawn = true;
    } catch (error) {
      if (disposed || mine !== seq) return;
      phase = 'error'; drawn = false;
      runCleanups();
      replace(main, h('div', { class: 'card hl-state', role: 'alert', 'data-testid': 'hl-error' }, h('h3', {}, `Could not load ${spec.noun}`), h('p', { class: 'a360-muted' }, error.message),
        h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'hl-retry', onClick: () => show() }, 'Retry')));
    }
  }

  const off = deps.subscribeSnapshot(() => { if (!disposed && phase === 'ready') show({ quiet: true }); }); // a review elsewhere changes scores
  const onHash = () => { if (!disposed && phase !== 'loading' && spec.urlChanged?.()) show({ quiet: phase === 'ready' }); };
  window.addEventListener('hashchange', onHash);
  const onTheme = () => { if (!disposed && phase === 'ready') show({ quiet: true }); }; // charts and maps read their colours when drawn
  window.addEventListener('reliability-theme', onTheme);
  show();
  return () => {
    disposed = true; off(); window.removeEventListener('hashchange', onHash); window.removeEventListener('reliability-theme', onTheme); runCleanups();
    pendingClear = setTimeout(clearAll, 0); // leaving the screen: its keys leave the URL (an open panel stays), unless another tab of it mounts now
  };
}
