// Line Health and Tower Health, rebuilt on the repository data and the Phase 2 scores. Both keep their place in the
// rail and the legacy look (filter column, KPI cards, cards); the content comes from healthModel.js.
//
//   Line Health   line selector, strip of towers in order with the span between each pair, HI profile chart, line score
//                 with its breakdown.
//   Tower Health  tower selector, schematic with the six groups drawn as zones, findings with thumbnails, campaign
//                 comparison of the group conditions.
//
// The selection lives in the URL hash (view=lines|towers, line, tower, band) next to the overlay keys, so a view can be
// shared. Every tower, span and finding opens Asset 360 or the finding viewer. Loading, empty and error states are
// real: ?healthdelay=1200 slows the load, ?healthfail=1 makes the first load fail (see boot.js).

import { h, replace } from '../ui/dom.js';
import { CONFIG } from '../domain/config.js';
import { loadLineHealth, loadTowerHealth, listLines, listTowers, BAND_LABEL, TOWER_GROUPS } from './healthModel.js';
import { SEVERITY } from './assetModel.js';
import { drawChart, profileOption } from './charts.js';
import { openAsset, thumb } from './assetPanel.js';
import { parseHash, parseView, hashFor } from './hashState.js';

const BAND_TONE = { normal: 'g', moderate: 'a', poor: 'r', none: 'x' };
const SEV_TONE = { critical: 'r', serious: 'r', moderate: 'a', minor: 'b', none: 'g' };
const COND_CLASS = (n) => (n === null || n === undefined ? 'hl-cn' : `hl-c${n}`);
const spark = (values) => { const v = values.filter((x) => x !== null && x !== undefined); return v.length > 1 ? v : v.length ? [v[0], v[0]] : [0, 0]; };
const tag = (text, tone, extra = {}) => h('span', { class: `tag ${tone ?? 'x'}`, ...extra }, text);
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const condWord = (n) => (n === null || n === undefined ? 'not assessed' : SEVERITY[n].condition);

const BAND_FILTERS = [['', 'All'], ['poor', 'Poor'], ['moderate', 'Moderate'], ['normal', 'Normal'], ['none', 'Not assessed']];

/**
 * @param {{kit: any, repo: any, getSnapshot: () => any, subscribeSnapshot: (fn: () => void) => (() => void), flags?: object}} deps
 * @returns {{lines: {tabs: any[]}, towers: {tabs: any[]}}} screen overrides for NexusReliability.open()
 */
export function createHealthScreens(deps) {
  const { kit } = deps;
  return {
    lines: { tabs: [{ name: 'Overview', render: () => '<div class="screen hl" data-testid="line-health" data-hl-root></div>', mount: (stage) => mountLines(stage, deps, kit) }] },
    towers: { tabs: [{ name: 'Condition', render: () => '<div class="screen hl" data-testid="tower-health" data-hl-root></div>', mount: (stage) => mountTowers(stage, deps, kit) }] },
  };
}

// ------------------------------------------------------------------------------------------------- shared

/** Write the screen's keys into the hash without adding a history entry, keeping the overlay keys. */
function writeView(view) {
  const target = hashFor({ ...parseHash(location.hash), ...view });
  if (target !== location.hash) history.replaceState(null, '', location.pathname + location.search + target);
}

const skeleton = () => h('div', { class: 'hl-main', 'data-testid': 'hl-loading', 'aria-busy': 'true' },
  h('div', { class: 'a360-skel hl-skel-kpi' }), h('div', { class: 'a360-skel hl-skel-block' }), h('div', { class: 'a360-skel hl-skel-block' }));

const asOfNote = (snap) => h('div', { class: 'asof', 'data-testid': 'as-of', title: 'The demo\'s fixed reference date. Scores use only evidence and repairs up to this date.' }, `Scores as of ${snap.asOf}`);

function field(label, control) { return h('label', {}, label, control); }
function select(testid, label, options, value, onChange) {
  return h('select', { 'data-testid': testid, 'aria-label': label, onChange: (e) => onChange(e.target.value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
}

/**
 * The common shell: filter column on the left, content on the right, with the loading, error and empty states.
 * `spec.controls(state, snap)` returns the filter column's controls; `spec.load(snap, state)` returns the model;
 * `spec.draw(model, ctx)` returns the content nodes (and may register cleanups).
 */
function mountScreen(stage, deps, spec) {
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
  let phase = 'loading'; // loading | ready | error: theme and data changes only redraw a screen that is showing content
  const runCleanups = () => { for (const c of cleanups.splice(0)) { try { c(); } catch { /* a chart that is already gone */ } } };

  async function show({ quiet = false } = {}) {
    const mine = ++seq;
    const snap = deps.getSnapshot();
    const state = spec.state(snap);
    replace(filter, h('div', { class: 'filter-head' }, h('b', {}, 'Filter')), ...spec.controls(state, snap, show), snap ? asOfNote(snap) : null);
    if (!quiet) { phase = 'loading'; runCleanups(); replace(main, skeleton()); }
    try {
      if (!snap) throw new Error('The registry data is not loaded.');
      if (flags.healthDelay && !quiet) await new Promise((r) => setTimeout(r, flags.healthDelay));
      if (flags.healthFail && !failedOnce) { failedOnce = true; throw new Error('The health service did not respond (simulated failure).'); }
      const model = await spec.load(snap, state);
      if (disposed || mine !== seq) return;
      runCleanups();
      phase = 'ready';
      replace(main, ...spec.draw(model, { snap, state, onChange: show, track: (fn) => cleanups.push(fn), deps }));
    } catch (error) {
      if (disposed || mine !== seq) return;
      phase = 'error';
      runCleanups();
      replace(main, h('div', { class: 'card hl-state', role: 'alert', 'data-testid': 'hl-error' }, h('h3', {}, `Could not load ${spec.noun}`), h('p', { class: 'a360-muted' }, error.message),
        h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'hl-retry', onClick: () => show() }, 'Retry')));
    }
  }

  const off = deps.subscribeSnapshot(() => { if (!disposed && phase === 'ready') show({ quiet: true }); }); // a review elsewhere changes scores
  const onHash = () => { if (!disposed && phase !== 'loading' && spec.urlChanged?.()) show({ quiet: phase === 'ready' }); };
  window.addEventListener('hashchange', onHash);
  const onTheme = () => { if (!disposed && phase === 'ready') show({ quiet: true }); }; // the chart reads its colours when it is drawn
  window.addEventListener('reliability-theme', onTheme);
  show();
  return () => {
    disposed = true; off(); window.removeEventListener('hashchange', onHash); window.removeEventListener('reliability-theme', onTheme); runCleanups();
    // leaving the screen: the screen's keys leave the URL; an open panel stays
    writeView({ view: null, line: null, tower: null, band: null });
  };
}

function emptyState(testid, title, text) {
  return h('div', { class: 'card hl-state', 'data-testid': testid }, h('h3', {}, title), h('p', { class: 'a360-muted' }, text));
}

const openAssetFrom = (id, el) => openAsset(id, { opener: el });

// ------------------------------------------------------------------------------------------------- Line Health

function mountLines(stage, deps, kit) {
  return mountScreen(stage, deps, {
    noun: 'this line',
    state(snap) {
      const lines = snap ? listLines(snap) : [];
      const want = parseView(location.hash);
      const line = lines.find((l) => l.id === want.line)?.id ?? lines[0]?.id ?? null;
      writeView({ view: 'lines', line, tower: null, band: null });
      this.last = line;
      return { lines, line };
    },
    urlChanged() { const w = parseView(location.hash); return w.view === 'lines' && w.line !== this.last; },
    controls(st, snap, redo) {
      if (!st.lines.length) return [h('p', { class: 'a360-muted' }, 'No lines in the registry.')];
      return [
        h('div', { class: 'filter-label' }, 'Line'),
        field('Line', select('line-select', 'Line', st.lines.map((l) => [l.id, `${l.name} · ${l.kv} kV`]), st.line, (v) => { writeView({ view: 'lines', line: v }); redo(); })),
        h('p', { class: 'a360-muted a360-small' }, 'Towers and spans in order along the line. Click one to open its Asset 360 panel.'),
      ];
    },
    load: (snap, st) => (st.line ? loadLineHealth(snap, st.line) : { found: false, id: null }),
    draw: (m, ctx) => drawLine(m, ctx, kit),
  });
}

function bandTag(m) { return m.assessed ? tag(`${m.hi} · ${BAND_LABEL[m.band]}`, BAND_TONE[m.band]) : tag('not assessed', 'x'); }

function lineKpis(m, kit) {
  const t = m.trend;
  const spanTower = `${m.counts?.assessedTowers ?? m.towers.filter((u) => u.assessed).length} of ${m.towers.length} towers`;
  return kit.kpis([
    { l: 'Line health index', v: m.assessed ? String(m.hi) : '-', s: m.assessed ? `${BAND_LABEL[m.band]} · length-weighted` : 'not assessed', tip: 'Length-weighted mean of the assessed towers and spans. No condition cap at line level.', spark: spark(t.values) },
    { l: 'Assessed by length', v: m.coverageByLength === null ? '-' : pct(m.coverageByLength), s: `${spanTower} · ${plural(m.notAssessed.length, 'unit')} not assessed`, tip: 'Share of the line length covered by an assessed tower or span. Newly built or never-inspected units are left out of the score, not scored as good.', spark: spark(t.coverage) },
    { l: 'Needs attention', v: String(m.attention.poor + m.attention.moderate), s: `${m.attention.poor} poor · ${m.attention.moderate} moderate`, tip: 'Towers and spans with a health index below 70.', spark: spark(t.attention) },
    { l: 'Open findings', v: String(m.openTotal), s: `${m.unreviewedTotal} unreviewed`, tip: 'Findings on the towers and spans of this line that no repair has closed. Rejected ones are left out.', spark: spark(t.open) },
  ]);
}

function stripUnit(u) {
  const label = u.kind === 'tower'
    ? `${u.name}: ${u.assessed ? `health index ${u.hi}, ${BAND_LABEL[u.band]}` : 'not assessed'}, ${plural(u.open, 'open finding')}`
    : `Span ${u.name}: ${u.assessed ? `health index ${u.hi}, ${BAND_LABEL[u.band]}` : 'not assessed'}, clearance ${u.clearance ?? 'unknown'} m, ${plural(u.open, 'open finding')}`;
  if (u.kind === 'tower') {
    return h('button', { class: `hl-tower hl-band-${u.band}`, type: 'button', 'data-asset': u.id, 'data-band': u.band, 'aria-label': label, title: label, onClick: (e) => openAssetFrom(u.id, e.currentTarget) },
      h('span', { class: 'hl-hi' }, u.assessed ? String(Math.round(u.hi)) : '–'), u.open ? h('span', { class: 'hl-count', 'aria-hidden': 'true' }, String(u.open)) : null);
  }
  return h('button', { class: 'hl-span', type: 'button', 'data-asset': u.id, 'data-band': u.band, 'aria-label': label, title: label, onClick: (e) => openAssetFrom(u.id, e.currentTarget) },
    h('i', { class: `hl-wire hl-band-${u.band}` }, u.open ? h('span', { class: 'hl-count', 'aria-hidden': 'true' }, String(u.open)) : null),
    h('span', { class: 'hl-clear' }, u.clearance === null ? '' : `${u.clearance} m`));
}

function drawLine(m, ctx, kit) {
  if (!m.found) return [emptyState('line-empty', 'No line to show', 'The registry has no lines. Add or import assets, then reload.')];
  const { line } = m;
  const head = h('div', { class: 'hl-head', 'data-testid': 'hl-head' },
    h('div', {}, h('h2', {}, `${line.name}`, h('span', { class: 'a360-muted' }, ` · ${line.kv} kV${line.lengthKm ? ` · ${line.lengthKm} km` : ''}${line.ends.length ? ` · ends ${line.ends.join(', ')}` : ''}`)),
      h('p', { class: 'a360-muted a360-small' }, `${m.towers.length} towers, ${m.spans.length} spans${m.duplicates.length ? `. ${plural(m.duplicates.length, 'duplicate record')} (${m.duplicates.map((d) => d.name).join(', ')}) are not drawn; they are in the registry until merged.` : '.'}`)),
    h('div', { 'data-testid': 'line-score' }, bandTag(m), m.freshness ? h('span', { class: 'a360-muted a360-small' }, ` newest evidence ${m.freshness.newestEvidenceDate}`) : null));

  const kpiHost = h('div', { 'data-testid': 'hl-kpis' });
  kpiHost.innerHTML = lineKpis(m, kit);

  const legend = h('div', { class: 'hl-legend', 'aria-label': 'Legend' },
    ...['normal', 'moderate', 'poor', 'none'].map((b) => h('span', {}, h('i', { class: `hl-swatch hl-band-${b}` }), b === 'none' ? 'not assessed' : `${b} (${b === 'normal' ? `${CONFIG.bands.normalMin}+` : b === 'moderate' ? `${CONFIG.bands.poorBelow}-${CONFIG.bands.normalMin - 1}` : `below ${CONFIG.bands.poorBelow}`})`)),
    h('span', { class: 'a360-muted' }, 'Squares are towers (health index inside, open findings in the corner). The bar between two towers is the span: its clearance in metres is below it.'));
  const strip = h('div', { class: 'hl-strip', 'data-testid': 'strip' });
  for (let i = 0; i < m.units.length; i += 2) {
    const t = m.units[i];
    const s = m.units[i + 1];
    strip.append(h('div', { class: 'hl-seg', 'data-seg': t.id }, h('div', { class: 'hl-segrow' }, stripUnit(t), s ? stripUnit(s) : null), h('span', { class: 'hl-name' }, t.name)));
  }

  const chartEl = h('div', { class: 'hl-chart', 'data-chart': 'profile', 'data-testid': 'profile-chart', role: 'img', 'aria-label': `Health index along ${line.name}, tower by tower` });
  const chartCard = h('section', { class: 'card hl-card' }, h('h3', {}, 'Health index along the line'), chartEl,
    h('p', { class: 'a360-muted a360-small' }, 'Circles are towers, diamonds are spans, grey rings are units with no score. Click a point to open it.'));
  drawChart(chartEl, (p) => profileOption(m, p), { onClick: (e) => { const id = e.data?.id; if (id) openAsset(id, { opener: strip.querySelector(`[data-asset="${CSS.escape(id)}"]`) ?? undefined }); } })
    .then((c) => { ctx.track(() => c.dispose()); chartEl.dataset.ready = 'true'; })
    .catch((e) => { chartEl.replaceChildren(h('p', { class: 'a360-muted a360-note', role: 'status' }, `The chart could not be drawn (${e.message}). The strip above shows the same values.`)); chartEl.dataset.ready = 'failed'; });

  return [h('div', { class: 'hl-main' }, head, kpiHost,
    h('section', { class: 'card hl-card', 'data-testid': 'strip-card' }, h('h3', {}, 'Towers and spans in order'), legend, strip),
    chartCard, breakdownCard(m))];
}

function breakdownCard(m) {
  const bc = m.bandCounts;
  const cell = (n) => h('td', {}, String(n ?? 0));
  const table = bc ? h('table', { class: 'a360-table hl-bands', 'data-testid': 'band-counts' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), ...['normal', 'moderate', 'poor'].map((b) => h('th', { scope: 'col' }, b)))),
    h('tbody', {}, ['tower', 'span', 'all'].map((k) => h('tr', {}, h('th', { scope: 'row' }, k === 'all' ? 'All assessed' : `${k}s`), ...['normal', 'moderate', 'poor'].map((b) => cell(bc[k]?.[b])))))) : null;
  const worst = m.worst.length ? h('ol', { class: 'hl-worst', 'data-testid': 'worst' }, m.worst.map((w) => h('li', {},
    h('button', { class: 'a360-link', type: 'button', 'data-asset': w.assetId, onClick: (e) => openAssetFrom(w.assetId, e.currentTarget) }, w.name), ` ${w.class} `, tag(`${w.score} · ${w.band}`, BAND_TONE[w.band])))) : h('p', { class: 'a360-muted' }, 'Nothing to rank yet.');
  const na = m.notAssessed.length
    ? h('div', { 'data-testid': 'not-assessed' }, h('h4', {}, `Not assessed (${m.notAssessed.length})`),
      h('p', { class: 'a360-muted a360-small' }, 'Left out of the score and the coverage, not scored as good. The reason is the same for each: no inspection evidence on or before the as-of date.'),
      h('ul', { class: 'hl-na' }, m.notAssessed.map((n) => h('li', {}, h('button', { class: 'a360-link', type: 'button', 'data-asset': n.id, onClick: (e) => openAssetFrom(n.id, e.currentTarget) }, n.name), ` ${n.kind}`))))
    : h('p', { class: 'a360-muted a360-small', 'data-testid': 'not-assessed' }, 'Every tower and span has been assessed.');
  return h('section', { class: 'card hl-card hl-breakdown', 'data-testid': 'line-breakdown' }, h('h3', {}, 'How the line score is built'),
    h('p', { class: 'a360-muted a360-small' }, m.formula ?? 'Not assessed.'),
    m.cappedByWorst ? h('p', { class: 'a360-muted a360-small' }, 'The line score is capped by its worst unit.') : null,
    h('div', { class: 'hl-two' },
      h('div', {}, h('h4', {}, 'Units by band'), table, m.coverageByLength !== null ? h('p', { class: 'a360-small' }, `Coverage by length: ${pct(m.coverageByLength)}`) : null,
        h('h4', {}, 'Five worst'), worst),
      na));
}

// ------------------------------------------------------------------------------------------------- Tower Health

function mountTowers(stage, deps, kit) {
  return mountScreen(stage, deps, {
    noun: 'this tower',
    state(snap) {
      if (!snap) return { lines: [], line: '', band: '', list: [], tower: null };
      const lines = listLines(snap);
      const want = parseView(location.hash);
      const line = lines.some((l) => l.id === want.line) ? want.line : '';
      const band = BAND_FILTERS.some(([v]) => v === want.band) ? (want.band ?? '') : '';
      const list = listTowers(snap, { line: line || null, band: band || null });
      const tower = list.find((t) => t.id === want.tower)?.id ?? list[0]?.id ?? null;
      writeView({ view: 'towers', line: line || null, band: band || null, tower });
      this.last = `${line}|${band}|${tower}`;
      return { lines, line, band, list, tower };
    },
    urlChanged() { const w = parseView(location.hash); return w.view === 'towers' && `${w.line ?? ''}|${w.band ?? ''}|${w.tower}` !== this.last; },
    controls(st, snap, redo) {
      const set = (patch) => { writeView({ view: 'towers', ...patch }); redo(); };
      const pos = st.list.findIndex((t) => t.id === st.tower);
      return [
        h('div', { class: 'filter-label' }, 'Find a tower'),
        field('Line', select('line-select', 'Line', [['', 'All lines'], ...st.lines.map((l) => [l.id, `${l.name} · ${l.kv} kV`])], st.line, (v) => set({ line: v || null, band: st.band || null, tower: null }))),
        field('Health band', select('band-select', 'Health band', BAND_FILTERS, st.band, (v) => set({ line: st.line || null, band: v || null, tower: null }))),
        field(`Tower (${st.list.length})`, st.list.length ? select('tower-select', 'Tower', st.list.map((t) => [t.id, `${t.name} · ${t.line}${t.duplicate ? ' (duplicate record)' : ''}`]), st.tower, (v) => set({ line: st.line || null, band: st.band || null, tower: v }))
          : h('select', { 'data-testid': 'tower-select', 'aria-label': 'Tower', disabled: true }, h('option', {}, 'none'))),
        h('div', { class: 'hl-stepper' },
          h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'prev-tower', disabled: pos <= 0, 'aria-label': 'Previous tower', onClick: () => set({ line: st.line || null, band: st.band || null, tower: st.list[pos - 1].id }) }, '‹ Previous'),
          h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'next-tower', disabled: pos < 0 || pos >= st.list.length - 1, 'aria-label': 'Next tower', onClick: () => set({ line: st.line || null, band: st.band || null, tower: st.list[pos + 1].id }) }, 'Next ›')),
        h('button', { class: 'linkish hl-clear-filters', type: 'button', 'data-testid': 'clear-filters', onClick: () => set({ line: null, band: null, tower: null }) }, 'Clear filters'),
      ];
    },
    load: (snap, st) => (st.tower ? loadTowerHealth(deps.repo, snap, st.tower) : { found: false, id: null, empty: true, filtered: Boolean(st.line || st.band) }),
    draw: (m, ctx) => drawTower(m, ctx, kit),
  });
}

function towerKpis(m, kit) {
  const cols = m.compare.columns;
  const f = m.findings;
  return kit.kpis([
    { l: 'Health index', v: m.assessed ? String(m.hi) : '-', s: m.assessed ? `${BAND_LABEL[m.band]}${m.cap?.applied ? ' · condition cap applies' : ''}` : 'not assessed', tip: m.assessed ? 'Weighted roll-up of the six groups, limited by the worst group (the condition cap). See the Asset 360 panel for the full breakdown.' : (m.reason ?? 'No evidence yet.'), spark: spark(cols.map((c) => c.hi)) },
    { l: 'Open findings', v: String(f.total), s: m.worstWord ? `worst: ${m.worstWord} · ${f.unreviewed} unreviewed` : (m.assessed ? 'none open' : 'not inspected'), tip: 'Findings on this tower and its components that no repair has closed. Rejected ones are left out.', spark: spark(m.history.open) },
    { l: 'Risk', v: m.risk ? String(Math.round(m.risk.score)) : '-', s: m.risk ? `${m.risk.band} · criticality ${m.risk.criticality} × consequence ${m.risk.consequence.value}` : 'not assessed', tip: '(100 - health index) x criticality x consequence, with the linked-asset uplift.', spark: spark([m.risk?.score ?? null]) },
    { l: 'Newest evidence', v: m.newest ?? '-', s: m.newest ? `${m.ageDays} days ago${m.stale ? ' · overdue' : ''}` : 'never inspected', tip: 'Date of the newest finding or inspection that counts toward the score, and whether it is older than the inspection interval.', spark: spark([m.ageDays ?? null]) },
  ]);
}

function drawTower(m, ctx, kit) {
  if (!m.found) {
    return [m.empty
      ? emptyState('tower-empty', 'No towers match', m.filtered ? 'No tower matches these filters. Choose All, or press Clear filters.' : 'The registry has no towers.')
      : emptyState('tower-empty', 'Tower not found', `There is no tower with the id "${m.id}". The link may be old.`)];
  }
  const t = m.tower;
  const head = h('div', { class: 'hl-head', 'data-testid': 'hl-head' },
    h('div', {}, h('h2', {}, t.name, h('span', { class: 'a360-muted' }, ` · ${t.lineName} · ${t.kv} kV`)),
      h('p', { class: 'a360-muted a360-small' }, `${t.id}${t.type ? ` · ${t.type}` : ''}${t.height ? ` · ${t.height} m` : ''} · installed ${t.installed}${t.duplicate ? ' · duplicate record, waiting to be merged' : ''}`)),
    h('div', { class: 'hl-headact' }, bandTag(m), h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'open-asset', onClick: (e) => openAssetFrom(t.id, e.currentTarget) }, 'Open Asset 360')));

  const kpiHost = h('div', { 'data-testid': 'hl-kpis' });
  kpiHost.innerHTML = towerKpis(m, kit);

  const banner = !m.assessed ? h('div', { class: 'fv-banner a hl-na-banner', role: 'status', 'data-testid': 'not-assessed-banner' }, h('b', {}, 'Not assessed. '), `${m.reason}. The zones are grey because there is nothing to colour them from; this is not a good score.`) : null;

  const cap = m.cap?.applied ? h('p', { class: 'a360-small', 'data-testid': 'cap-note' }, h('b', {}, 'A condition cap applies. '), `${m.cap.causedBy.map((g) => m.groupLabel[g] ?? g).join(', ')} at condition ${m.cap.condition} limits the score to the ${m.cap.band} band: ${m.cap.uncappedScore} before the cap, ${m.cap.scaledScore} after.`) : null;

  const schematic = h('section', { class: 'card hl-card hl-schematic', 'data-testid': 'schematic-card' }, h('h3', {}, 'Tower schematic'), schematicSvg(m), conditionLegend(),
    h('p', { class: 'a360-muted a360-small' }, 'Each zone takes the colour of its scoring group (the worst component in the group). Crossarms, body and legs are all the steel structure group.'));
  const groupsCard = h('section', { class: 'card hl-card', 'data-testid': 'groups-card' }, h('h3', {}, 'Group conditions'), groupTable(m), cap);

  return [h('div', { class: 'hl-main' }, head, banner, kpiHost, h('div', { class: 'hl-two hl-two-wide' }, schematic, groupsCard), findingsCard(m), compareCard(m))];
}

// ---- schematic

/** The tower drawing: eight zones, each tied to one scoring group, coloured by that group's condition. */
function schematicSvg(m) {
  const score = Object.fromEntries(m.groups.map((g) => [g.id, g.score]));
  const gl = Object.fromEntries(m.groups.map((g) => [g.id, g.label]));
  const zones = [
    { id: 'earthwire peak', group: 'lightning_protection', side: 'L', ly: 34, px: 268, shape: '<polygon points="150,12 137,60 163,60"/><line x1="112" y1="38" x2="188" y2="38" class="hl-wirel"/>' },
    { id: 'crossarms', group: 'steel_structure', side: 'L', ly: 76, px: 172, shape: '<rect x="40" y="70" width="220" height="10"/><rect x="55" y="120" width="190" height="10"/><rect x="70" y="170" width="160" height="10"/>' },
    { id: 'insulator strings', group: 'insulators', side: 'L', ly: 126, px: 180, shape: '<rect x="45" y="82" width="8" height="36"/><rect x="247" y="82" width="8" height="36"/><rect x="60" y="132" width="8" height="36"/><rect x="232" y="132" width="8" height="36"/><rect x="75" y="182" width="8" height="36"/><rect x="217" y="182" width="8" height="36"/>' },
    { id: 'conductor hardware', group: 'conductor_accessories', side: 'L', ly: 176, px: 188, shape: '<circle cx="49" cy="124" r="6"/><circle cx="251" cy="124" r="6"/><circle cx="64" cy="174" r="6"/><circle cx="236" cy="174" r="6"/><circle cx="79" cy="224" r="6"/><circle cx="221" cy="224" r="6"/>' },
    { id: 'body', group: 'steel_structure', side: 'R', ly: 292, px: 330, shape: '<polygon points="125,60 175,60 200,300 100,300"/>' },
    { id: 'fittings', group: 'tower_accessories', side: 'R', ly: 240, px: 292, shape: '<rect x="138" y="230" width="24" height="18"/>' },
    { id: 'legs', group: 'steel_structure', side: 'R', ly: 338, px: 352, shape: '<polygon points="100,300 118,300 92,372 70,372"/><polygon points="182,300 200,300 230,372 208,372"/>' },
    { id: 'foundation', group: 'foundation', side: 'R', ly: 384, px: 372, shape: '<rect x="58" y="372" width="44" height="16"/><rect x="198" y="372" width="44" height="16"/>' },
  ];
  const bracing = '<g class="hl-brace"><line x1="125" y1="60" x2="200" y2="300"/><line x1="175" y1="60" x2="100" y2="300"/><line x1="115" y1="130" x2="185" y2="130"/><line x1="108" y1="200" x2="192" y2="200"/></g>';
  const parts = zones.map((z) => {
    const s = score[z.group] ?? null;
    const label = `${z.id}: ${gl[z.group]}, ${s === null ? 'not assessed' : `condition ${s} (${condWord(s)})`}`;
    const text = s === null ? '–' : String(s);
    const x = z.side === 'L' ? 150 : 410;
    const anchor = z.side === 'L' ? 'end' : 'start';
    const leaderX = z.side === 'L' ? 156 : 404;
    return `<g class="hl-zone ${COND_CLASS(s)}" data-zone="${z.id}" data-group="${z.group}" data-condition="${s ?? ''}" role="img" aria-label="${label}" tabindex="0"><title>${label}</title><g transform="translate(130,0)">${z.shape}</g></g>` +
      `<line class="hl-leader" x1="${leaderX}" y1="${z.ly}" x2="${z.px}" y2="${z.ly}"/>` +
      `<text class="hl-zlabel" x="${x}" y="${z.ly + 4}" text-anchor="${anchor}">${z.id} <tspan class="hl-zval">${text}</tspan></text>`;
  });
  const svg = `<svg class="hl-svg" viewBox="0 0 560 410" role="group" aria-label="Schematic of ${m.tower.name}: each zone coloured by the condition of its group" data-testid="schematic"><line class="hl-ground" x1="40" y1="390" x2="520" y2="390"/>${parts.join('')}<g transform="translate(130,0)">${bracing}</g></svg>`;
  const wrap = h('div', { class: 'hl-svgwrap' });
  wrap.innerHTML = svg;
  return wrap;
}

function conditionLegend() {
  return h('div', { class: 'hl-legend', 'data-testid': 'cond-legend' },
    ...[1, 2, 3, 4, 5].map((n) => h('span', {}, h('i', { class: `hl-swatch ${COND_CLASS(n)}` }, String(n)), `${SEVERITY[n].condition}`)),
    h('span', {}, h('i', { class: 'hl-swatch hl-cn' }, '–'), 'not assessed'));
}

function condChip(n) { return h('span', { class: `hl-cond ${COND_CLASS(n)}` }, n === null ? '–' : String(n)); }

function groupTable(m) {
  return h('table', { class: 'a360-table hl-groups', 'data-testid': 'groups' },
    h('thead', {}, h('tr', {}, ...['Group', 'Zones', 'Condition', 'Worst component', 'Findings'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, m.groups.map((g) => h('tr', { 'data-group': g.id },
      h('th', { scope: 'row' }, g.label),
      h('td', { class: 'a360-muted' }, g.zones.join(', ')),
      h('td', {}, condChip(g.score), ' ', h('span', { class: 'a360-small' }, condWord(g.score))),
      h('td', {}, g.worstComponent ? h('button', { class: 'a360-link', type: 'button', onClick: (e) => openAssetFrom(g.worstComponent.id, e.currentTarget) }, g.worstComponent.name) : h('span', { class: 'a360-muted' }, '–')),
      h('td', {}, String(g.findings))))));
}

// ---- findings and comparison

function findingsCard(m) {
  const f = m.findings;
  if (!f.total) {
    return h('section', { class: 'card hl-card', 'data-testid': 'findings-card' }, h('h3', {}, 'Open findings'), h('p', { class: 'a360-muted' }, m.assessed ? 'No open findings on this tower.' : 'This tower has not been inspected, so it has no findings.'),
      f.closed ? h('p', { class: 'a360-muted a360-small' }, `${plural(f.closed, 'earlier finding')} closed by repairs.`) : null);
  }
  return h('section', { class: 'card hl-card', 'data-testid': 'findings-card' }, h('h3', {}, `Open findings (${f.total})`),
    h('ul', { class: 'a360-findings', 'data-testid': 'findings' }, f.rows.map((r) => h('li', { class: 'a360-finding', 'data-finding-id': r.id },
      thumb(r),
      h('div', { class: 'a360-fbody' },
        h('div', {}, tag(r.severity, SEV_TONE[r.severity]), ' ', h('b', {}, r.label), r.unreviewed ? [' ', tag('unreviewed', 'a', { title: 'AI-proposed, not confirmed by a reviewer' })] : null),
        h('div', { class: 'a360-muted a360-small' }, `${r.id} · condition ${r.condition} (${r.conditionLabel}) · ${r.date} · ${r.campaignName} · ${r.sensor} · confidence ${r.confidence}`),
        h('div', { class: 'a360-small' }, 'on ', r.assetName, r.componentHint ? h('span', { class: 'a360-muted' }, ` (${String(r.componentHint).replace(/_/g, ' ')} not identified)`) : null))))),
    f.more ? h('p', { class: 'a360-muted a360-small' }, `and ${f.more} more, in order of severity.`) : null,
    f.closed ? h('p', { class: 'a360-muted a360-small' }, `${plural(f.closed, 'earlier finding')} closed by repairs.`) : null);
}

const ARROW = { better: '▲', worse: '▼', same: '' };
function compareCard(m) {
  const { columns, rows } = m.compare;
  const any = columns.some((c) => c.flown);
  return h('section', { class: 'card hl-card', 'data-testid': 'compare-card' }, h('h3', {}, 'Campaign comparison'),
    h('p', { class: 'a360-muted a360-small' }, 'The condition of each group (1 very poor to 5 very good, 5 when nothing is recorded) as it stood at the end of each campaign and today. A dash means the tower was not flown yet. ▲ better, ▼ worse than the column before.'),
    h('table', { class: 'a360-table hl-compare', 'data-testid': 'compare' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Group'), ...columns.map((c) => h('th', { scope: 'col', title: c.date }, c.label, h('div', { class: 'a360-muted a360-small' }, c.date))))),
      h('tbody', {},
        h('tr', { class: 'hl-hirow', 'data-row': 'hi' }, h('th', { scope: 'row' }, 'Health index'), ...columns.map((c) => h('td', {}, c.flown ? [h('b', {}, String(c.hi)), ' ', tag(BAND_LABEL[c.band], BAND_TONE[c.band])] : h('span', { class: 'a360-muted' }, 'not flown')))),
        rows.map((r) => h('tr', { 'data-row': r.id }, h('th', { scope: 'row' }, r.label), ...r.cells.map((c) => h('td', { 'data-change': c.change ?? '' }, c.value === null ? h('span', { class: 'a360-muted' }, '–') : [condChip(c.value), c.change && c.change !== 'same' ? h('span', { class: `hl-arrow hl-${c.change}`, 'aria-label': c.change === 'better' ? 'better than before' : 'worse than before' }, ARROW[c.change]) : null])))),
        h('tr', { class: 'hl-reprow', 'data-row': 'repairs' }, h('th', { scope: 'row' }, 'Repairs since the column before'), ...columns.map((c) => h('td', {}, c.repairs.length ? c.repairs.map((r) => h('div', { class: 'a360-small' }, tag('repair', 'g'), ` ${r.date} ${String(r.action).replace(/_/g, ' ')}`)) : h('span', { class: 'a360-muted' }, '–')))))),
    !any ? h('p', { class: 'a360-muted a360-small' }, 'No campaign has flown this tower yet.') : null);
}
