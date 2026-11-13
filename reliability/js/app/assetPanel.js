// Asset 360: a slide-in panel with everything about one asset. It opens from a click on any asset row
// (and, later, from any screen through NexusReliability.openAsset). Its state is the URL hash,
// #asset=<id>, so a link opens the same asset. Escape closes it and keyboard focus stays inside while it is open.
//
// States: loading (skeleton), error (message and Retry), asset not found, and a section-level empty message
// wherever there is nothing to show.
//
// The detail is laid out as six tabs in two groups (management review, 12 Nov 2026):
//   Asset Health, the current condition:   Health & Risk · Components · Condition Trends (forecast: experimental)
//   Operations, maintenance and stock:     Maintenance History · Work Orders (from the ERP) · Inventory & Parts (from the ERP)
// The left group alone is Asset Health. Both groups together are Asset Reliability.

import { h, replace } from '../ui/dom.js';
import { loadAssetDetail } from './assetModel.js';
import { parseHash, hashFor } from './hashState.js';
import { drawChart, historyOption, dgaOption, loadingOption, forecastOption } from './charts.js';
import { assetOperations } from './assetOps.js';
import { openLinkInReview } from './navigation.js';
import { openFinding } from './findingViewer.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEV_TONE = { critical: 'r', serious: 'r', moderate: 'a', minor: 'b', none: 'g' };
const BAND_TONE = { normal: 'g', moderate: 'a', poor: 'r' };
const RISK_TONE = { low: 'g', medium: 'b', high: 'a', critical: 'r' };
const STATUS_TONE = { proposed: 'a', confirmed: 'g', rejected: 'r', open: 'a', in_progress: 'b', completed: 'g', cancelled: 'x' };
const COND_TONE = { 1: 'r', 2: 'a', 3: 'a', 4: 'b', 5: 'g' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ctl = { deps: null, root: null, panel: null, body: null, state: { open: false, id: null, token: 0, view: 'loading', detail: null, ops: null, error: null, opener: null, tab: 'health' }, charts: [] };

/** The six tabs of the asset detail view, in two groups. */
const TAB_GROUPS = [
  { id: 'health', title: 'Asset Health', sub: 'current condition', tabs: [
    { id: 'health', name: 'Health & Risk', hint: 'Current health and risk score of this asset' },
    { id: 'components', name: 'Components', hint: 'Condition of each component' },
    { id: 'trends', name: 'Condition Trends', hint: 'Condition over the inspections, and a forecast', exp: true },
  ] },
  { id: 'ops', title: 'Operations', sub: 'maintenance and stock', tabs: [
    { id: 'maintenance', name: 'Maintenance History', hint: 'Past inspections and maintenance' },
    { id: 'work', name: 'Work Orders', hint: 'Open and planned work, from the ERP', erp: true },
    { id: 'parts', name: 'Inventory & Parts', hint: 'Stock and suppliers, from the ERP', erp: true },
  ] },
];
const TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

const tag = (text, tone, extra = {}) => h('span', { class: `tag ${tone ?? 'x'}`, ...extra }, text);
const humanize = (s) => String(s).replace(/_/g, ' ');
const plain = (text, asOf) => String(text ?? '').replace(/\basOf\b/g, asOf);

// ---------------------------------------------------------------- public API

/** @param {{repo: any, getSnapshot: () => any, subscribeSnapshot: (fn: () => void) => (() => void), flags?: object}} deps */
export function initAssetPanel(deps) {
  ctl.deps = deps;
  window.addEventListener('hashchange', sync);
  deps.subscribeSnapshot(() => { if (ctl.state.open && ctl.state.view === 'ready') load({ quiet: true }); });
  sync();
}

/** Open the panel for an asset. The id goes into the URL hash, so Back closes the panel again. */
export function openAsset(id, { opener } = {}) {
  ctl.state.opener = opener ?? document.activeElement;
  const target = hashFor({ asset: id });
  if (location.hash === target) { if (!ctl.state.open) show(id); } else location.hash = target;
}

export function closeAsset() {
  if (!ctl.state.open) return;
  if (parseHash(location.hash).asset) history.pushState(null, '', location.pathname + location.search);
  hide();
}

function sync() {
  const { asset } = parseHash(location.hash);
  if (asset) { if (!ctl.state.open || ctl.state.id !== asset) show(asset); } else if (ctl.state.open) hide();
}

// -------------------------------------------------------------- open / close

function ensureDom() {
  if (ctl.root) return;
  ctl.body = h('div', { class: 'a360-body' });
  ctl.panel = h('aside', { class: 'a360', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Asset details', tabindex: '-1', 'data-testid': 'asset-panel' }, ctl.body);
  ctl.root = h('div', { class: 'a360-root', hidden: true }, h('div', { class: 'a360-backdrop', onClick: closeAsset }), ctl.panel);
  document.body.append(ctl.root);
  ctl.panel.addEventListener('keydown', trapTab);
  document.addEventListener('keydown', onEscape, true);
  document.addEventListener('focusin', keepFocusInside);
}

function setInert(on) {
  const shell = document.querySelector('.shell');
  if (!shell) return;
  if (on) { shell.setAttribute('inert', ''); shell.setAttribute('aria-hidden', 'true'); } else { shell.removeAttribute('inert'); shell.removeAttribute('aria-hidden'); }
}

function show(id) {
  ensureDom();
  const s = ctl.state;
  const first = !s.open;
  s.id = id; s.open = true;
  if (first) { s.tab = 'health'; s.restore = s.opener ?? document.activeElement; ctl.root.hidden = false; document.body.classList.add('a360-open'); setInert(true); requestAnimationFrame(() => ctl.panel.classList.add('is-in')); }
  load();
}

function hide() {
  const s = ctl.state;
  disposeCharts();
  s.open = false; s.id = null; s.token += 1;
  if (ctl.root) { ctl.root.hidden = true; ctl.panel.classList.remove('is-in'); }
  document.body.classList.remove('a360-open');
  setInert(false);
  const back = s.restore;
  s.restore = null; s.opener = null;
  if (back && back.isConnected && typeof back.focus === 'function') back.focus();
}

function onEscape(e) {
  if (!ctl.state.open || e.key !== 'Escape' || document.body.classList.contains('fv-open')) return;
  e.preventDefault();
  e.stopPropagation();
  closeAsset();
}

function trapTab(e) {
  if (e.key !== 'Tab') return;
  const items = [...ctl.panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) { e.preventDefault(); ctl.panel.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === ctl.panel)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function keepFocusInside(e) {
  if (ctl.state.open && ctl.panel && !ctl.panel.contains(e.target) && !document.body.classList.contains('fv-open')) (ctl.panel.querySelector(FOCUSABLE) ?? ctl.panel).focus();
}

// ----------------------------------------------------------------- loading

async function load({ quiet = false } = {}) {
  const s = ctl.state;
  const mine = ++s.token;
  if (!quiet) { disposeCharts(); s.view = 'loading'; draw(); }
  try {
    const { flags = {}, repo, getSnapshot, getNet } = ctl.deps;
    if (flags.panelDelay && !quiet) await sleep(flags.panelDelay);
    if (flags.panelFail) throw new Error('The asset service did not respond (simulated failure).');
    const detail = await loadAssetDetail(repo, getSnapshot(), s.id);
    if (mine !== s.token) return;
    s.detail = detail;
    s.ops = detail.found ? assetOperations(detail, getNet?.() ?? null) : null;
    s.view = detail.found ? 'ready' : 'missing';
  } catch (e) {
    if (mine !== s.token) return;
    s.error = e;
    s.view = 'error';
  }
  disposeCharts();
  draw();
  if (s.view === 'ready') drawCharts();
  if (!quiet) focusStart();
}

function focusStart() {
  const close = ctl.panel.querySelector('.a360-close');
  (close ?? ctl.panel).focus();
}

function disposeCharts() { for (const c of ctl.charts.splice(0)) c.dispose(); }

// -------------------------------------------------------------------- views

function draw() {
  const s = ctl.state;
  ctl.panel.setAttribute('aria-busy', String(s.view === 'loading'));
  if (s.view === 'loading') {
    replace(ctl.body, closeBar(s.id), h('div', { class: 'a360-pad', 'data-testid': 'panel-loading' }, h('div', { class: 'a360-skel a360-skel-title' }), h('div', { class: 'a360-skel a360-skel-block' }), h('div', { class: 'a360-skel a360-skel-block' }), h('div', { class: 'a360-skel a360-skel-block' })));
  } else if (s.view === 'error') {
    replace(ctl.body, closeBar(s.id), h('div', { class: 'a360-pad a360-error', role: 'alert', 'data-testid': 'panel-error' },
      h('h2', {}, 'Could not load this asset'), h('p', {}, s.error?.message ?? String(s.error)),
      h('button', { class: 'lr-btn lr-primary', type: 'button', onClick: () => { ctl.deps.flags.panelFail = false; load(); } }, 'Retry')));
  } else if (s.view === 'missing') {
    replace(ctl.body, closeBar(s.id), h('div', { class: 'a360-pad a360-empty', role: 'status', 'data-testid': 'panel-missing' },
      h('h2', {}, 'Asset not found'), h('p', { class: 'a360-muted' }, `There is no asset with the id "${s.id}". The link may be old, or the record may have been removed.`),
      h('button', { class: 'lr-btn', type: 'button', onClick: closeAsset }, 'Close')));
  } else {
    replace(ctl.body, renderDetail(s.detail));
  }
}

function closeBar(id) {
  return h('div', { class: 'a360-bar' }, h('span', { class: 'a360-kicker' }, 'Asset detail · Asset Reliability'), h('span', { class: 'a360-id' }, id ?? ''), h('span', { class: 'a360-spacer' }),
    h('button', { class: 'a360-close', type: 'button', 'aria-label': 'Close asset panel', title: 'Close (Esc)', onClick: closeAsset }, '×'));
}

const assetLink = (id, text) => h('button', { class: 'a360-link', type: 'button', 'data-asset': id, onClick: () => openAsset(id) }, text ?? id);
const section = (id, title, ...children) => h('section', { class: 'a360-sec', 'aria-labelledby': `a360-h-${id}`, 'data-section': id }, h('h3', { id: `a360-h-${id}` }, title), ...children);
const note = (text) => h('p', { class: 'a360-muted a360-note' }, text);
const th = (...cols) => h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c))));

function renderDetail(d) {
  const ops = ctl.state.ops;
  const sections = {
    health: [breakdownView(d), ...(d.transformer ? transformerViews(d) : []), findingsView(d), linksView(d)],
    components: [componentsView(d)],
    trends: [historyView(d), forecastView(d, ops)],
    maintenance: [inspectionsView(d), repairsView(d)],
    work: [workView(d, ops)],
    parts: [partsView(d, ops)],
  };
  const counts = { components: d.components.length || null, work: ops?.workOrders.open || null, parts: ops?.parts.short || null };
  const active = TAB_IDS.includes(ctl.state.tab) ? ctl.state.tab : 'health';
  const panels = TAB_IDS.map((id) => h('div', { class: 'a360-pad a360-panel', role: 'tabpanel', id: `a360-panel-${id}`, 'aria-labelledby': `a360-tab-${id}`, 'data-panel': id, hidden: id !== active, tabindex: '0' }, ...sections[id].filter(Boolean)));
  return h('div', {}, closeBar(d.id), headerView(d), tabBar(active, counts), ...panels);
}

/** Two groups of three tabs. The left group alone is Asset Health; both together are Asset Reliability. */
function tabBar(active, counts) {
  const tabBtn = (t) => h('button', {
    class: `a360-tab${t.id === active ? ' is-on' : ''}`, type: 'button', role: 'tab', id: `a360-tab-${t.id}`, 'data-tab': t.id, title: t.hint,
    'aria-selected': String(t.id === active), 'aria-controls': `a360-panel-${t.id}`, tabindex: t.id === active ? '0' : '-1', onClick: () => selectTab(t.id),
  }, t.name, counts[t.id] ? h('span', { class: 'a360-tabcount' }, String(counts[t.id])) : null,
  t.erp ? h('span', { class: 'a360-mark a360-mark-erp', title: 'Read from the ERP through the integration layer' }, 'ERP') : null);
  return h('div', { class: 'a360-tabs', 'data-testid': 'asset-tabs' },
    h('div', { class: 'a360-tabgroups', role: 'tablist', 'aria-label': 'Asset detail', onKeydown: onTabKey },
      TAB_GROUPS.map((g) => h('div', { class: `a360-tabgroup a360-tabgroup-${g.id}`, role: 'presentation', 'data-group': g.id },
        h('div', { class: 'a360-tabgroup-h', role: 'presentation' }, h('b', {}, g.title), h('span', {}, `: ${g.sub}`)),
        h('div', { class: 'a360-tabrow', role: 'presentation' }, g.tabs.map(tabBtn))))),
    h('p', { class: 'a360-tabnote' }, 'Asset Health alone is the current condition. Together with Operations it is Asset Reliability.'));
}

function selectTab(id, { focus = false } = {}) {
  if (!TAB_IDS.includes(id)) return;
  ctl.state.tab = id;
  for (const b of ctl.body.querySelectorAll('.a360-tab')) { const on = b.dataset.tab === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const p of ctl.body.querySelectorAll('.a360-panel')) p.hidden = p.dataset.panel !== id;
  drawCharts();
}

function onTabKey(e) {
  const i = TAB_IDS.indexOf(e.target.closest?.('.a360-tab')?.dataset.tab);
  if (i < 0) return;
  const next = e.key === 'ArrowRight' ? TAB_IDS[(i + 1) % TAB_IDS.length] : e.key === 'ArrowLeft' ? TAB_IDS[(i + TAB_IDS.length - 1) % TAB_IDS.length] : e.key === 'Home' ? TAB_IDS[0] : e.key === 'End' ? TAB_IDS[TAB_IDS.length - 1] : null;
  if (!next) return;
  e.preventDefault();
  selectTab(next, { focus: true });
}

/** Where a set of records comes from: the ERP, through the integration layer. Read-only, never entered here. */
function erpSource(system, what, synced) {
  return h('div', { class: 'a360-source', 'data-testid': 'erp-source' },
    h('span', { class: 'a360-mark a360-mark-erp' }, `ERP · ${system}`),
    h('span', {}, `${what} read from the ERP through the integration layer${synced ? ` · ${synced.replace(/^.*? · /, '')}` : ''}. The ERP is the system of record; nothing is entered here.`));
}

// ------------------------------------------------------------------- header

function headerView(d) {
  const hd = d.header;
  const hi = d.scores.hi;
  const labels = hd.labels.length ? h('div', { class: 'a360-chips' }, hd.labels.map((l) => h('span', { class: 'tag b', title: l.kind.replace(/_/g, ' ') }, l.value))) : null;
  const meta = h('div', { class: 'a360-meta' },
    tag(hd.class, 'x'), tag(hd.category, 'x'),
    hd.parent ? h('span', {}, 'in ', assetLink(hd.parent.id, hd.parent.name)) : null,
    hd.voltage_kv ? h('span', {}, `${hd.voltage_kv} kV`) : null,
    hd.install_date ? h('span', {}, `installed ${hd.install_date}`) : null,
    h('span', {}, `criticality ${hd.criticality}`));

  const banners = [];
  if (d.merged) banners.push(h('div', { class: 'a360-banner b', 'data-testid': 'merged-banner' }, `This record was merged into `, assetLink(d.merged.into, d.merged.intoName), '. Its evidence now belongs to that asset.'));
  if (d.duplicate) {
    const dup = d.duplicate;
    const text = dup.role === 'record'
      ? (dup.status === 'proposed' ? `Possible duplicate of ` : `Duplicate (linked automatically, not merged) of `)
      : (dup.status === 'proposed' ? `Another record may be a duplicate of this one: ` : `Another record is a known duplicate of this one: `);
    banners.push(h('div', { class: `a360-banner ${dup.status === 'proposed' ? 'a' : 'b'}`, 'data-testid': 'duplicate-banner' },
      text, assetLink(dup.otherId, dup.otherName || dup.otherId), ` (match score ${dup.score.toFixed(2)}). `,
      h('button', { class: 'lr-btn', type: 'button', onClick: () => { closeAsset(); openLinkInReview(dup.linkId, dup.status); } }, 'Review in Links')));
  }
  if (d.findings.unreviewed) banners.push(h('div', { class: 'a360-banner a' }, `${d.findings.unreviewed} of ${d.findings.total} open findings have not been confirmed by a reviewer. They still count toward the scores.`));

  return h('header', { class: 'a360-head' },
    h('div', { class: 'a360-titlerow' }, h('h2', { id: 'a360-title' }, hd.name), h('span', { class: 'a360-id', 'data-testid': 'asset-id' }, hd.id)),
    meta, labels, ...banners, scoreRow(d), h('p', { class: 'a360-muted a360-asof' }, `Scores as of ${d.asOf}. ${d.evidence.newest ? `Newest evidence ${d.evidence.newest}.` : ''}`, d.evidence.freshness?.stale ? tag('stale', 'a', { title: 'Older than the inspection interval' }) : null));
}

function scoreRow(d) {
  const hi = d.scores.hi;
  const card = (label, value, sub, extra) => h('div', { class: 'a360-card' }, h('div', { class: 'a360-k' }, label), h('div', { class: 'a360-n' }, value), sub ? h('div', { class: 'a360-sub' }, sub) : null, extra ?? null);
  let hiCard;
  if (hi.score !== null) hiCard = card('Health index', String(hi.score), null, h('div', {}, tag(hi.band, BAND_TONE[hi.band], { 'data-testid': 'hi-band' })));
  else if (['tower', 'span', 'line', 'transformer'].includes(d.kind)) hiCard = card('Health index', 'not assessed', plain(d.evidence.reason, d.asOf), null);
  else if (d.kind === 'component') {
    const worst = d.findings.rows[0];
    hiCard = card('Condition', worst ? `${worst.condition}` : 'OK', worst ? `${worst.conditionLabel} · ${worst.label}` : 'no open findings', null);
  } else hiCard = card('Health index', 'n/a', 'No health index is defined at this level yet.', null);

  const rf = d.riskFactors;
  if (!rf) return h('div', { class: 'a360-scores' }, hiCard, h('div', { class: 'a360-card a360-wide' }, h('div', { class: 'a360-k' }, 'Risk'), h('div', { class: 'a360-sub' }, hi.score === null ? 'Risk needs a health index, so there is none here.' : 'Not available.')));
  const op = (t) => h('span', { class: 'a360-op', 'aria-hidden': 'true' }, t);
  const c = rf.consequence;
  return h('div', { class: 'a360-scores' }, hiCard,
    h('div', { class: 'a360-risk', 'data-testid': 'risk-factors', role: 'group', 'aria-label': 'Risk factors' },
      card('Condition', rf.condition.points.toFixed(1), `100 − ${rf.condition.hi}`),
      op('×'), card('Criticality', String(rf.criticality), 'of 5'),
      op('×'), card('Consequence', String(c.value), c.uplift ? `${c.base} + ${c.uplift} linked${c.capped ? ' (capped at 5)' : ''}` : `${c.base} · ${c.source}`),
      op('='), h('div', { class: 'a360-card a360-result' }, h('div', { class: 'a360-k' }, 'Risk ', ''), h('div', { class: 'a360-n' }, String(Math.round(rf.score))), h('div', {}, tag(rf.band, RISK_TONE[rf.band])))));
}

// ---------------------------------------------------------------- breakdown

function breakdownView(d) {
  const b = d.breakdown;
  if (b.type === 'none') return section('breakdown', 'Health index breakdown', note(d.kind === 'component' ? `${b.reason} A component's condition comes from its open findings and from the score of the tower or span that owns it.` : `${b.reason} It is not rolled up from its children yet.`));
  if (b.type === 'not_assessed') return section('breakdown', 'Health index breakdown', note(`Not assessed: ${plain(b.reason, d.asOf)}. Without evidence the asset has no health index, and it is left out of every roll-up.`));
  if (b.type === 'groups') {
    const cap = b.cap;
    const names = new Map([[d.id, d.header.name], ...d.components.map((c) => [c.id, c.name])]);
    const capView = cap.applied
      ? h('div', { class: 'a360-banner a', 'data-testid': 'cap-note' }, h('b', {}, 'A condition cap applies. '),
        `The weighted score is ${cap.uncappedScore}. A group at condition ${cap.condition} (${cap.causedBy.map(humanize).join(', ')}) scales it into the ${cap.band} band: ${cap.scaledScore} (top of the band ${cap.bandTop}).`)
      : h('p', { class: 'a360-muted a360-note', 'data-testid': 'cap-note' }, cap.causedBy.length ? `No cap applied: the weighted score ${cap.uncappedScore} is already below the capped value.` : 'No cap applied: no group is at condition 1 or 2.');
    return section('breakdown', 'Health index breakdown',
      h('p', { class: 'a360-muted a360-note' }, b.formula),
      h('table', { class: 'a360-table', 'data-testid': 'breakdown-groups' }, th('Group', 'Weight', 'Condition (1–5)', 'Worst component', 'Findings'),
        h('tbody', {}, b.groups.map((g) => h('tr', {},
          h('th', { scope: 'row' }, humanize(g.group)), h('td', {}, String(g.weight)),
          h('td', {}, tag(String(g.score), g.score <= 1.5 ? 'r' : g.score <= 2.5 ? 'a' : 'g'), g.capped ? tag('worst caps group', 'x') : null),
          h('td', {}, g.components.length ? g.components.map((c) => `${names.get(c.componentId) ?? c.componentId} (${c.score})`).join(', ') : '-'),
          h('td', {}, g.findingIds.length ? String(g.findingIds.length) : '0')))),
      ),
      capView,
      h('p', { class: 'a360-muted a360-note' }, `Result ${d.scores.hi.score} (${d.scores.hi.band}).`, b.closedFindingIds?.length ? ` ${b.closedFindingIds.length} finding${b.closedFindingIds.length === 1 ? '' : 's'} closed by a repair${b.lastRepairDate ? ` (latest ${b.lastRepairDate})` : ''}.` : ''));
  }
  if (b.type === 'line') {
    const bc = b.bandCounts.all;
    return section('breakdown', 'Health index breakdown',
      h('p', { class: 'a360-muted a360-note' }, b.formula),
      h('div', { class: 'a360-bands', 'data-testid': 'line-bands' }, tag(`${bc.normal} normal`, 'g'), tag(`${bc.moderate} moderate`, 'a'), tag(`${bc.poor} poor`, 'r'),
        h('span', { class: 'a360-muted' }, `${b.counts.assessedTowers} of ${b.counts.towers} towers and ${b.counts.assessedSpans} of ${b.counts.spans} spans assessed · ${Math.round(b.coverageByLength * 100)}% by length`)),
      h('p', { class: 'a360-muted a360-note' }, 'The line is the length-weighted mean of its towers and spans. It is not capped by the worst one.'),
      h('h4', {}, 'Five worst towers and spans'),
      h('table', { class: 'a360-table', 'data-testid': 'line-worst' }, th('Asset', 'Class', 'Health index'),
        h('tbody', {}, b.worst.map((w) => h('tr', {}, h('th', { scope: 'row' }, assetLink(w.assetId, w.name)), h('td', {}, w.class), h('td', {}, tag(`${w.score} ${w.band}`, BAND_TONE[w.band])))))));
  }
  // transformer
  return section('breakdown', 'Health index breakdown',
    h('p', { class: 'a360-muted a360-note' }, b.formula),
    h('table', { class: 'a360-table', 'data-testid': 'breakdown-inputs' }, th('Input', 'Weight', 'Sub-score', 'Used'),
      h('tbody', {}, b.inputs.map((i) => h('tr', {}, h('th', { scope: 'row' }, i.input), h('td', {}, String(i.weight)),
        h('td', {}, i.used ? [h('span', { class: 'a360-mini' }, h('span', { style: { width: `${Math.round(i.score)}%` } })), ' ', String(i.score)] : '–'),
        h('td', {}, i.used ? 'yes' : 'no data – left out'))))),
    b.missingInputs.length ? note(`No data for: ${b.missingInputs.join(', ')}. Their weight is left out and the rest is rescaled.`) : null);
}

// ------------------------------------------------------------- transformers

function transformerViews(d) {
  const t = d.transformer;
  const out = [];
  const age = h('p', { class: 'a360-muted a360-note' }, `${t.rating_mva} MVA · ${t.ratio} kV · ${t.manufacturer ?? ''} ${t.design_family ?? ''} · serial ${t.serial} · ${t.oil_type} oil${t.ageYears !== null ? ` · ${t.ageYears} years in service` : ''}`);
  out.push(section('tx-nameplate', 'Nameplate', age));

  const dga = t.dga;
  if (dga.samples.length) {
    out.push(section('dga', 'Dissolved gas analysis',
      h('div', { class: 'a360-chart', 'data-chart': 'dga', 'data-testid': 'dga-chart', role: 'img', 'aria-label': 'Gas concentrations over time, log scale' }),
      h('table', { class: 'a360-table', 'data-testid': 'dga-table' }, th(`Latest sample ${dga.latest}`, 'ppm', 'IEEE condition', 'Limits 1 / 2 / 3', 'Score'),
        h('tbody', {}, dga.table.map((g) => h('tr', {}, h('th', { scope: 'row' }, g.gas.toUpperCase()), h('td', {}, String(g.ppm)),
          h('td', {}, tag(String(g.condition), g.condition <= 1 ? 'g' : g.condition === 2 ? 'a' : 'r')), h('td', {}, g.limits.join(' / ')), h('td', {}, g.score === null ? '-' : String(g.score)))))),
      dga.trend && dga.trend.gas ? note(`Trend: ${dga.trend.gas.toUpperCase()} rose ${dga.trend.ratio}× over ${dga.trend.windowDays} days, taking ${dga.trend.penalty} points off the gas score.`) : note('No fast-rising gas over the last year.')));
  } else out.push(section('dga', 'Dissolved gas analysis', note('No DGA samples on or before the reference date.')));

  const dv = t.duval;
  out.push(section('duval', 'Duval triangle', dv && dv.zone ? duvalView(dv) : note('Not enough key gas (CH4, C2H4, C2H2) to place a point.')));

  out.push(section('oil', 'Oil quality', t.oil
    ? h('div', {}, h('table', { class: 'a360-table', 'data-testid': 'oil-table' }, th(`Oil sample ${t.oil.date}`, 'Value', 'Score'),
      h('tbody', {}, t.oil.parameters.map((p) => h('tr', {}, h('th', { scope: 'row' }, humanize(p.parameter)), h('td', {}, String(p.value)),
        h('td', {}, h('span', { class: 'a360-mini' }, h('span', { style: { width: `${Math.round(p.score)}%` } })), ' ', String(p.score)))))), note(`Oil score ${Math.round(t.oil.score * 10) / 10}, the mean of the three.`))
    : note('No oil test on or before the reference date.')));

  out.push(section('tests', 'Electrical tests', t.tests
    ? h('p', {}, tag(t.tests.result, t.tests.result === 'pass' ? 'g' : t.tests.result === 'watch' ? 'a' : 'r', { 'data-testid': 'test-result' }), ` tested ${t.tests.date}`, t.tests.score !== null ? h('span', { class: 'a360-muted' }, ` · sub-score ${t.tests.score}`) : null)
    : note('No electrical test on or before the reference date.')));

  out.push(section('loading', 'Loading', t.loading
    ? h('div', {}, h('div', { class: 'a360-chart a360-chart-s', 'data-chart': 'loading', 'data-testid': 'loading-chart', role: 'img', 'aria-label': 'Loading as percent of rating, last 12 months' }),
      note(`Latest ${t.loading.latest}% · 12-month mean ${t.loading.mean}% · peak ${t.loading.max}% of rating.`))
    : note('No loading history.')));
  return out;
}

/** A small Duval triangle: corners CH4, C2H4, C2H2, with the latest sample as a point. */
function duvalView(dv) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tagName, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tagName); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };
  const A = [110, 14]; const B = [14, 168]; const C = [206, 168]; // C2H2 top, CH4 left, C2H4 right
  const p = dv.percent;
  const x = (p.c2h2 * A[0] + p.ch4 * B[0] + p.c2h4 * C[0]) / 100;
  const y = (p.c2h2 * A[1] + p.ch4 * B[1] + p.c2h4 * C[1]) / 100;
  const svg = el('svg', { viewBox: '0 0 220 190', class: 'a360-duval', role: 'img', 'aria-label': `Duval triangle, zone ${dv.zone}` },
    el('polygon', { points: `${A} ${B} ${C}`, class: 'a360-tri' }),
    el('text', { x: A[0], y: 10, 'text-anchor': 'middle', class: 'a360-tri-l' }, 'C2H2'), el('text', { x: B[0], y: 184, 'text-anchor': 'middle', class: 'a360-tri-l' }, 'CH4'), el('text', { x: C[0], y: 184, 'text-anchor': 'middle', class: 'a360-tri-l' }, 'C2H4'),
    el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 6, class: 'a360-tri-p' }));
  return h('div', { class: 'a360-duvalrow', 'data-testid': 'duval' }, svg,
    h('div', {}, h('p', {}, tag(`Zone ${dv.zone}`, dv.zone === 'T1' || dv.zone === 'PD' ? 'a' : 'r'), ' ', dv.label),
      h('p', { class: 'a360-muted' }, `CH4 ${p.ch4}% · C2H4 ${p.c2h4}% · C2H2 ${p.c2h2}% of ${dv.totalPpm} ppm key gas`),
      h('p', { class: 'a360-muted a360-note' }, 'The zone is shown for the person reading it. It does not change the score.')));
}

// ----------------------------------------------------------------- findings

function thumb(f) {
  const open = (e) => openFinding(f.id, { opener: e.currentTarget });
  if (f.image) {
    return h('button', { class: 'a360-thumb', type: 'button', 'data-finding': f.id, title: `Open ${f.label} (demo image)`, 'aria-label': `Open ${f.label}, ${f.id}`, onClick: open },
      h('img', { src: f.image, alt: '', loading: 'lazy' }),
      f.bbox ? h('span', { class: 'a360-box', style: { left: `${f.bbox.x * 100}%`, top: `${f.bbox.y * 100}%`, width: `${f.bbox.w * 100}%`, height: `${f.bbox.h * 100}%` } }) : null,
      h('span', { class: 'a360-demo' }, 'Demo'));
  }
  return h('button', { class: 'a360-thumb a360-thumb-empty', type: 'button', 'data-finding': f.id, title: `Open ${f.label}`, 'aria-label': `Open ${f.label}, ${f.id}`, onClick: open }, f.sensor === 'lidar' ? 'LiDAR' : 'no image');
}

function findingsView(d) {
  const f = d.findings;
  if (!f.total) {
    return section('findings', 'Open findings', note(d.kind === 'component' ? 'No open findings on this component.' : 'No open findings.'), f.closed ? note(`${f.closed} earlier finding${f.closed === 1 ? '' : 's'} closed by repairs.`) : null);
  }
  return section('findings', `Open findings (${f.total})`,
    h('ul', { class: 'a360-findings', 'data-testid': 'findings' }, f.rows.map((r) => h('li', { class: 'a360-finding', 'data-finding-id': r.id },
      thumb(r),
      h('div', { class: 'a360-fbody' },
        h('div', {}, tag(r.severity, SEV_TONE[r.severity]), ' ', h('b', {}, r.label), r.unreviewed ? [' ', tag('unreviewed', 'a', { title: 'AI-proposed, not confirmed by a reviewer' })] : null),
        h('div', { class: 'a360-muted a360-small' }, `${r.id} · condition ${r.condition} (${r.conditionLabel}) · ${r.date} · ${r.campaignName} · ${r.sensor} · confidence ${r.confidence}`),
        h('div', { class: 'a360-small' }, 'on ', r.assetId === d.id ? r.assetName : assetLink(r.assetId, r.assetName), r.componentHint ? h('span', { class: 'a360-muted' }, ` (${humanize(r.componentHint)} not identified)`) : null))))),
    f.more ? note(`and ${f.more} more, in order of severity.`) : null,
    f.closed ? note(`${f.closed} earlier finding${f.closed === 1 ? '' : 's'} closed by repairs.`) : null);
}

// ------------------------------------------------------------------ history

function historyView(d) {
  const hs = d.history;
  const anyOpen = hs.open.some((n) => n > 0);
  if (!hs.hasHi && !anyOpen) return section('history', 'Condition history', note('No findings on any campaign date, so there is no history to chart.'));
  if (hs.hasHi && !anyOpen && hs.hi.every((x) => x === null)) return section('history', 'Condition history', note('Not assessed on any campaign date, so there is no history to chart.'));
  const rows = hs.dates.map((date, i) => h('tr', {}, h('th', { scope: 'row' }, hs.labels[i]), h('td', {}, date), h('td', {}, hs.hasHi ? (hs.hi[i] === null ? 'not assessed' : String(hs.hi[i])) : '–'), h('td', {}, String(hs.open[i]))));
  return section('history', 'Condition history',
    note('Measured: the health index re-scored at the end of each inspection campaign.'),
    h('div', { class: 'a360-chart a360-chart-s', 'data-chart': 'history', 'data-testid': 'history-chart', role: 'img', 'aria-label': 'Health index and open findings at each campaign date' }),
    h('table', { class: 'a360-table', 'data-testid': 'history-table' }, th('Campaign', 'Date', hs.hasHi ? 'Health index' : '', 'Open findings'), h('tbody', {}, rows)));
}

/** Draw the charts of the tab that is showing. A chart in a hidden tab has no size, so it waits for its tab. */
function drawCharts() {
  const d = ctl.state.detail;
  const ops = ctl.state.ops;
  for (const el of ctl.body.querySelectorAll('.a360-panel:not([hidden]) [data-chart]:not([data-ready])')) {
    const kind = el.dataset.chart;
    const build = kind === 'history' ? (p) => historyOption(d.history, p) : kind === 'forecast' ? (p) => forecastOption(d.history, ops.forecast, p) : kind === 'dga' ? (p) => dgaOption(d.transformer.dga, p) : (p) => loadingOption(d.transformer.loading, p);
    el.dataset.ready = 'pending';
    drawChart(el, build).then((c) => { if (ctl.state.detail === d && ctl.state.open) ctl.charts.push(c); else c.dispose(); el.dataset.ready = 'true'; })
      .catch((e) => { el.replaceChildren(h('p', { class: 'a360-muted a360-note', role: 'status' }, `The chart could not be drawn (${e.message}). The values are in the table.`)); el.dataset.ready = 'failed'; });
  }
}

/** Condition forecast. EXPERIMENTAL: the model is not validated against real data (see models.js). */
function forecastView(d, ops) {
  const f = ops?.forecast;
  const title = h('h3', { id: 'a360-h-forecast' }, 'Condition forecast');
  const wrap = (...kids) => h('section', { class: 'a360-sec', 'aria-labelledby': 'a360-h-forecast', 'data-section': 'forecast', 'data-testid': 'forecast' }, title, ...kids);
  const caveat = null;
  if (!f || !f.available) return wrap(caveat, note(f?.reason ?? 'No forecast is available for this asset.'));
  return wrap(caveat,
    h('div', { class: 'a360-chart a360-chart-s', 'data-chart': 'forecast', 'data-testid': 'forecast-chart', role: 'img', 'aria-label': 'Measured health index and the projection for the next five years' }),
    h('table', { class: 'a360-table', 'data-testid': 'forecast-table' }, th('Horizon', 'Projected health index', 'Band', 'Basis'),
      h('tbody', {}, h('tr', {}, h('th', { scope: 'row' }, 'Today (measured)'), h('td', {}, String(f.now)), h('td', {}, tag(f.band, BAND_TONE[f.band])), h('td', {}, `scored from findings as of ${d.asOf}`)),
        f.points.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.label), h('td', {}, String(p.hi)), h('td', {}, tag(p.band, BAND_TONE[p.band])), h('td', { class: 'a360-muted' }, 'projected, no intervention'))))),
    note(`Exponential decay for corrosivity zone ${f.zone ?? 'n/a'}${f.age != null ? `, age ${f.age} years` : ''}, with open-defect and storm-loss terms. ${f.band === 'poor' ? 'The tower is already in the poor band.' : f.poorIn ? `On this projection the tower would reach the poor band (below 40) in about ${f.poorIn} years.` : 'On this projection the tower stays above the poor band for 15 years.'}`));
}

// --------------------------------------------------------------- components

function componentsView(d) {
  if (!d.components.length) return section('components', 'Components', note(d.kind === 'component' ? 'This is a component. It has no parts of its own in the register; its condition is on the Health & Risk tab.' : 'No components are registered under this asset.'));
  return section('components', `Components (${d.components.length})`,
    note('Condition of each component, from its open findings (1 very poor to 5 very good).'),
    h('table', { class: 'a360-table', 'data-testid': 'components' }, th('Component', 'Class', 'Open findings', 'Worst condition'),
      h('tbody', {}, d.components.map((c) => h('tr', {}, h('th', { scope: 'row' }, assetLink(c.id, c.name)), h('td', {}, c.class), h('td', {}, String(c.open)),
        h('td', {}, c.worst === null ? tag('none', 'g') : tag(String(c.worst), COND_TONE[c.worst])))))));
}

// -------------------------------------------------------------------- links

function linksView(d) {
  if (!d.links.groups.length) return section('links', 'Linked assets', note('No linked assets.'));
  return section('links', `Linked assets (${d.links.total})`, ...d.links.groups.map((g) => h('div', { class: 'a360-linkgroup', 'data-link-type': g.type },
    h('h4', {}, `${g.label} (${g.total})`),
    h('ul', { class: 'a360-links' }, g.items.map((i) => h('li', {},
      h('span', { class: 'a360-muted' }, `${i.phrase} `),
      i.otherKind === 'asset' ? assetLink(i.otherId, i.otherName) : h('span', {}, i.otherName),
      i.otherClass ? h('span', { class: 'a360-muted a360-small' }, ` ${i.otherClass}`) : null, ' ',
      tag(i.merged ? 'merged' : i.status, i.merged ? 'b' : STATUS_TONE[i.status] ?? 'x'),
      i.source === 'resemblance' ? h('span', { class: 'a360-muted a360-small' }, ` score ${i.confidence.toFixed(2)}`) : null,
      i.status === 'proposed' && !i.obsolete ? [' ', h('button', { class: 'a360-link', type: 'button', onClick: () => { closeAsset(); openLinkInReview(i.linkId, i.status); } }, 'review')] : null))),
    g.more ? note(`and ${g.more} more.`) : null)));
}

// ------------------------------------------------------- maintenance history

/** Past inspections: what each campaign found on this asset. */
function inspectionsView(d) {
  const hs = d.history;
  const rows = hs.dates.map((date, i) => ({ date, label: hs.labels[i], hi: hs.hasHi ? hs.hi[i] : null, open: hs.open[i] })).filter((r) => r.label !== 'Today');
  if (!rows.length) return section('inspections', 'Past inspections', note('No inspection campaign is recorded up to the reference date.'));
  return section('inspections', `Past inspections (${rows.length})`,
    note('Aerial inspection campaigns up to the reference date, and what each one left open on this asset.'),
    h('table', { class: 'a360-table', 'data-testid': 'inspections' }, th('Campaign', 'Completed', hs.hasHi ? 'Health index after' : '', 'Open findings after'),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.label), h('td', {}, r.date), h('td', {}, hs.hasHi ? (r.hi === null ? 'not assessed' : String(r.hi)) : '–'), h('td', {}, String(r.open)))))));
}

/** Maintenance carried out: completed repairs and the findings they closed. */
function repairsView(d) {
  const w = d.work;
  if (!w.repairsTotal) return section('repairs', 'Maintenance carried out', note('No repairs are recorded on this asset.'));
  return section('repairs', `Maintenance carried out (${w.repairsTotal})`,
    note('A completed repair closes the findings it fixed, and the health index is re-scored without them.'),
    h('table', { class: 'a360-table', 'data-testid': 'repairs' }, th('Repair', 'Date', 'Action', 'On', 'Work order', 'Closes'),
      h('tbody', {}, w.repairs.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.id), h('td', {}, r.date), h('td', {}, r.action), h('td', {}, r.assetId === d.id ? r.assetName : assetLink(r.assetId, r.assetName)), h('td', {}, r.workOrderId ?? '–'), h('td', {}, `${r.closes} finding${r.closes === 1 ? '' : 's'}`))))),
    w.repairsTotal > w.repairs.length ? note(`Showing the ${w.repairs.length} newest of ${w.repairsTotal} repairs.`) : null);
}

// -------------------------------------------------------------- work orders

/** Open and planned work, from the ERP (SAP PM). Read-only: orders are created and changed in the ERP. */
function workView(d, ops) {
  const w = d.work;
  const wo = ops?.workOrders;
  const source = erpSource('SAP PM', 'Maintenance orders', wo?.synced);
  if (!w.ordersTotal) return section('work', 'Work orders', source, note('No work orders in the ERP for this asset.'));
  const rows = wo?.rows.length ? wo.rows : w.orders;
  return section('work', `Work orders (${w.ordersTotal})`, source,
    h('p', { class: 'a360-muted a360-note' }, `${w.ordersTotal} work order${w.ordersTotal === 1 ? '' : 's'}, ${w.open} open${wo?.committed ? ` · ${money(wo.committed)} estimated on open orders` : ''}.`),
    h('table', { class: 'a360-table', 'data-testid': 'work-orders' }, th('Work order', 'SAP order', 'Work', 'Status', 'Priority', 'On', 'Findings', 'Crew', 'Created', 'Done / due'),
      h('tbody', {}, rows.map((o) => h('tr', {}, h('th', { scope: 'row' }, o.id), h('td', { class: 'a360-id' }, o.sap ?? '–'), h('td', {}, o.workType ?? '–'),
        h('td', {}, tag(humanize(o.stage ?? o.status), STATUS_TONE[o.status])), h('td', {}, o.priority),
        h('td', {}, o.assetId === d.id ? o.assetName : assetLink(o.assetId, o.assetName)), h('td', {}, String(o.findings)), h('td', {}, o.crew ?? '–'), h('td', {}, o.created), h('td', {}, o.completed ?? `due ${o.planned}`))))),
    w.ordersTotal > w.orders.length ? note(`Showing the ${w.orders.length} newest of ${w.ordersTotal} work orders.`) : null);
}

// -------------------------------------------------------- inventory & parts

const STOCK_TAG = { in_stock: ['in stock', 'g'], partial: ['short', 'a'], out: ['out of stock', 'r'] };

/** The materials the open findings on this asset need, their stock and suppliers, from the ERP (SAP MM). */
function partsView(d, ops) {
  const p = ops?.parts;
  const source = erpSource('SAP MM', 'Materials, stock and suppliers', p?.synced);
  if (!p || !ops.available) return section('parts', 'Inventory & parts', source, note('The inventory could not be loaded.'));
  if (!p.rows.length) return section('parts', 'Inventory & parts', source, note(d.findings.total ? 'None of the open findings on this asset needs a catalogue part.' : 'No open findings on this asset, so no parts are needed.'));
  return section('parts', `Inventory & parts (${p.rows.length})`, source,
    h('p', { class: 'a360-muted a360-note' }, `Materials for the ${p.basis} open finding${p.basis === 1 ? '' : 's'} on this asset${p.more ? ' (the 25 most severe)' : ''}: ${p.rows.length} catalogue item${p.rows.length === 1 ? '' : 's'}, ${money(p.value)} at standard cost${p.short ? `, ${p.short} short of stock` : ', all in stock'}.`),
    h('table', { class: 'a360-table', 'data-testid': 'parts' }, th('Material', 'Needed for', 'Need', 'Available', 'Stock by depot', 'Lead time', 'Supplier'),
      h('tbody', {}, p.rows.map((r) => h('tr', { 'data-sku': r.sku }, h('th', { scope: 'row' }, r.sku, h('div', { class: 'a360-muted a360-small' }, r.name)),
        h('td', {}, r.defects.join(', ')), h('td', {}, `${r.qty} ${r.uom}`),
        h('td', {}, `${r.available} of ${r.onHand} `, tag(r.short ? `${STOCK_TAG[r.status][0]} by ${r.short}` : STOCK_TAG[r.status][0], STOCK_TAG[r.status][1])),
        h('td', { class: 'a360-small' }, r.stock.map((x) => `${x.name} ${x.qty}`).join(' · ')), h('td', {}, `${r.leadDays} d`), h('td', {}, r.supplierName))))),
    h('h4', {}, `Suppliers (${p.suppliers.length})`),
    h('table', { class: 'a360-table', 'data-testid': 'suppliers' }, th('Supplier', 'Country', 'Supplies', 'On-time delivery', 'Lead time', 'Quality'),
      h('tbody', {}, p.suppliers.map((x) => h('tr', {}, h('th', { scope: 'row' }, x.name, h('div', { class: 'a360-muted a360-small' }, x.id)), h('td', {}, x.country), h('td', {}, x.category),
        h('td', {}, tag(`${x.onTime}%`, x.onTime >= 92 ? 'g' : x.onTime >= 85 ? 'a' : 'r')), h('td', {}, `${x.leadDays} d`), h('td', {}, `${x.quality}%`))))),
    note('Stock, reservations and supplier records stay in the ERP. To order or reserve, use Supply Chain & Inventory, which sends the request to SAP MM.'));
}
