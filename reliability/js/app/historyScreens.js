// Maintenance History, rebuilt on the repository data: what was found, what was ordered, what was repaired, and whether
// the repair held. Three tabs share one filter column (line and asset) and the same hash keys:
//
//   Timeline     findings by severity, work orders as bars, repairs as diamonds, the campaigns behind them, and the
//                health index of the asset (before and after each repair) or of the line (at each campaign)
//   Repairs      every repair with the health index just before and after, and whether the defect came back
//   Work orders  status counts, how long they took, and which are overdue
//
// Keys in the URL hash: view=history, line, unit (the asset), show=ineffective (Repairs), status (Work orders).
// Findings open the finding viewer; assets, work orders and repairs open Asset 360.

import { h } from '../ui/dom.js';
import { spark, tag, plural, humanize, SEV_TONE, STATUS_TONE, writeView, field, select, emptyState, mountScreen } from './screenKit.js';
import { loadHistory, WO_STATUSES } from './historyModel.js';
import { drawChart, historyTrendOption } from './charts.js';
import { openAsset } from './assetPanel.js';
import { openFinding } from './findingViewer.js';
import { parseView } from './hashState.js';

const STATUS_LABEL = { open: 'open', in_progress: 'in progress', completed: 'completed', cancelled: 'cancelled' };
const STATUS_SUB = { open: 'warn', in_progress: 'neutral', completed: 'ok' };
const SHOW = [['', 'All repairs'], ['ineffective', 'Ineffective only']];

export function createHistoryScreen(deps) {
  const tab = (name, kind) => ({ name, render: () => `<div class="screen hl" data-testid="maintenance-${kind}" data-hl-root></div>`, mount: (stage) => mountHistory(stage, deps, kind) });
  return { tabs: [tab('Timeline', 'timeline'), tab('Repairs', 'repairs'), tab('Work orders', 'workorders')] };
}

const openAssetFrom = (id, el) => openAsset(id, { opener: el });
const openFindingFrom = (id, el) => openFinding(id, { opener: el });
const fnum = (x, d = 1) => (x === null || x === undefined ? '–' : String(Math.round(x * 10 ** d) / 10 ** d));
const dayWord = (x) => (x === null || x === undefined ? '–' : `${fnum(x)} day${x === 1 ? '' : 's'}`);

function mountHistory(stage, deps, kind) {
  return mountScreen(stage, deps, {
    view: 'history',
    noun: 'the maintenance history',
    state(snap) {
      const want = parseView(location.hash);
      const lines = snap ? snap.assets.filter((a) => a.class === 'line').map((a) => a.asset_id).sort() : [];
      const line = lines.includes(want.line) ? want.line : '';
      let unit = want.unit ?? '';
      let units = [];
      if (snap) {
        units = loadHistory(snap, { line: line || null }).units;
        if (!units.some((u) => u.id === unit)) unit = '';
      }
      const show = kind === 'repairs' && want.show === 'ineffective' ? 'ineffective' : '';
      const status = kind === 'workorders' && WO_STATUSES.includes(want.status) ? want.status : '';
      writeView({ view: 'history', line: line || null, unit: unit || null, show: show || null, status: status || null });
      this.last = [line, unit, show, status].join('|');
      return { line, unit, show, status, units };
    },
    urlChanged() { const w = parseView(location.hash); return w.view === 'history' && [w.line ?? '', w.unit ?? '', w.show ?? '', w.status ?? ''].join('|') !== this.last; },
    controls(st, snap, redo) {
      if (!snap) return [];
      const set = (patch) => { writeView({ view: 'history', line: st.line || null, unit: st.unit || null, show: st.show || null, status: st.status || null, ...patch }); redo(); };
      const lines = snap.assets.filter((a) => a.class === 'line').sort((a, b) => a.voltage_kv - b.voltage_kv);
      return [
        h('div', { class: 'filter-label' }, 'Scope'),
        field('Line', select('line-select', 'Line', [['', 'All lines'], ...lines.map((l) => [l.asset_id, `${l.name} · ${l.voltage_kv} kV`])], st.line, (v) => set({ line: v || null, unit: null }))),
        field(`Asset (${st.units.length} with a history)`, select('unit-select', 'Asset', [['', 'All assets'], ...st.units.map((u) => [u.id, `${u.name} · ${u.class}`])], st.unit, (v) => set({ unit: v || null }))),
        kind === 'repairs' ? field('Show', select('show-select', 'Show', SHOW, st.show, (v) => set({ show: v || null }))) : null,
        kind === 'workorders' ? field('Status', select('status-select', 'Status', [['', 'All statuses'], ...WO_STATUSES.map((s) => [s, STATUS_LABEL[s]])], st.status, (v) => set({ status: v || null }))) : null,
        h('button', { class: 'linkish hl-clear-filters', type: 'button', 'data-testid': 'clear-filters', onClick: () => set({ line: null, unit: null, show: null, status: null }) }, 'Clear filters'),
        h('p', { class: 'a360-muted a360-small' }, 'Transformers have no line: they are listed under All lines.'),
      ];
    },
    load: (snap, st) => loadHistory(snap, { line: st.line || null, unit: st.unit || null }),
    draw: (m, ctx) => draw(m, ctx, kind),
  });
}

// ---------------------------------------------------------------------------------------------------- KPI cards

function kpiCards(m, kit) {
  const t = m.turnaround;
  const c = m.statusCounts;
  const bad = m.ineffective.length;
  return kit.kpis([
    { l: 'Work orders', v: String(m.workOrders.length), s: `${c.open} open · ${c.in_progress} in progress · ${c.completed} completed`, tone: m.overdue ? 'warn' : 'neutral',
      tip: `Work orders raised for the findings of this selection. ${m.overdue} are past their planned date and not done.`, spark: spark(m.series.map((x) => x.workOrders)) },
    { l: 'Finding to repair', v: t.medianDays === null ? '-' : dayWord(t.medianDays), s: t.findings ? `median of ${plural(t.findings, 'finding')} · mean ${fnum(t.meanDays)} · slowest ${t.maxDays}` : 'no repair yet', tone: 'neutral',
      tip: 'Days from the date a finding was recorded to the date of the repair that closed it.', spark: spark(m.series.map((x) => x.repairs)) },
    { l: 'Repairs', v: String(m.repairs.length), s: bad ? `${bad} ineffective · defect seen again` : (m.repairs.length ? 'all held so far' : 'none yet'), tone: bad ? 'bad' : m.repairs.length ? 'ok' : 'neutral',
      tip: 'A repair is ineffective when the defect it closed is sighted again afterwards (a confirmed repeat-sighting link to a later finding).', spark: spark(m.series.map((x) => x.ineffective)) },
    { l: 'Open findings', v: String(m.open), s: `${m.unreviewed} unreviewed · ${plural(m.overdue, 'work order')} overdue`, tone: m.overdue || m.unreviewed ? 'warn' : 'neutral',
      tip: 'Findings on this selection that no repair has closed. Rejected ones are left out.', spark: spark(m.series.map((x) => x.open)) },
  ]);
}

// ---------------------------------------------------------------------------------------------------- drawing

function draw(m, ctx, kind) {
  const kit = ctx.deps.kit;
  const kpiHost = h('div', { 'data-testid': 'hl-kpis' });
  kpiHost.innerHTML = kpiCards(m, kit);
  const head = h('div', { class: 'hl-head', 'data-testid': 'hl-head' },
    h('div', {}, h('h2', {}, scopeTitle(m, ctx.snap)), h('p', { class: 'a360-muted a360-small' }, `${plural(m.findings.length, 'finding')} · ${plural(m.workOrders.length, 'work order')} · ${plural(m.repairs.length, 'repair')} up to ${m.asOf}`)));
  if (m.empty) {
    return [h('div', { class: 'hl-main' }, head, kpiHost, emptyState('history-empty', 'Nothing recorded for this selection', 'No finding, work order or repair is recorded for it. Choose All assets, or press Clear filters.'))];
  }
  const body = kind === 'repairs' ? repairsView(m, ctx) : kind === 'workorders' ? workOrdersView(m, ctx) : timelineView(m, ctx);
  return [h('div', { class: 'hl-main' }, head, kpiHost, ...body)];
}

function scopeTitle(m, snap) {
  if (m.unit) { const a = snap.byId.get(m.unit); return h('span', {}, a.name, h('span', { class: 'a360-muted' }, ` · ${humanize(a.class)} · ${a.asset_id}`)); }
  if (m.line) return h('span', {}, m.line, h('span', { class: 'a360-muted' }, ' · every tower and span'));
  return h('span', {}, 'All lines', h('span', { class: 'a360-muted' }, ' · every tower, span and transformer'));
}

// ---- timeline

const pos = (m, date) => {
  const a = Date.parse(`${m.range.from}T00:00:00Z`);
  const b = Date.parse(`${m.range.to}T00:00:00Z`);
  return b === a ? 0 : Math.min(100, Math.max(0, ((Date.parse(`${date}T00:00:00Z`) - a) / (b - a)) * 100));
};
const SEV_ROWS = [['critical', 1], ['serious', 2], ['moderate', 3], ['minor', 4]];

function monthTicks(m) {
  const out = [];
  const [y0, mo0] = m.range.from.split('-').map(Number);
  for (let y = y0, mo = mo0 + 1; `${y}-${String(mo).padStart(2, '0')}-01` <= m.range.to; mo += 1) {
    if (mo > 12) { mo = 1; y += 1; }
    const date = `${y}-${String(mo).padStart(2, '0')}-01`;
    if (date > m.range.to) break;
    out.push({ date, label: new Date(`${date}T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' }) });
  }
  return out;
}

/** Greedy packing of bars into rows so that bars in one row do not overlap. */
function packRows(items) {
  const ends = [];
  const rows = new Map();
  for (const it of [...items].sort((a, b) => a.from.localeCompare(b.from))) {
    let r = ends.findIndex((e) => e < it.from);
    if (r < 0) { r = ends.length; ends.push(it.to); } else ends[r] = it.to;
    rows.set(it, r);
  }
  return { rows, count: ends.length };
}

function timelineView(m, ctx) {
  const axis = h('div', { class: 'mh-axis' },
    m.campaigns.map((c) => h('span', { class: 'mh-camp', style: { left: `${pos(m, c.start)}%`, width: `${Math.max(0.5, pos(m, c.end) - pos(m, c.start))}%` }, title: `${c.name}: ${c.start} to ${c.end}` }, h('b', {}, c.name))),
    monthTicks(m).map((t) => h('span', { class: 'mh-tick', style: { left: `${pos(m, t.date)}%` } }, t.label)));

  // findings: one row per severity
  const fRows = SEV_ROWS.map(([word, cond]) => h('div', { class: 'mh-row', 'data-sev': word },
    h('span', { class: 'mh-rlabel' }, word),
    h('div', { class: 'mh-track' }, m.findings.filter((f) => f.condition === cond).map((f) => h('button', {
      class: `mh-dot hl-c${cond}${f.status === 'rejected' ? ' is-rejected' : ''}${!f.counted && f.status !== 'rejected' ? ' is-closed' : ''}`, type: 'button', 'data-finding': f.id, style: { left: `${pos(m, f.date)}%` },
      title: `${f.id} · ${f.label} · ${f.date} · ${f.severity}${f.status === 'rejected' ? ' · rejected' : f.counted ? '' : ' · closed by a repair'}${m.unit ? '' : ` · ${f.ownerName}`}`,
      'aria-label': `Finding ${f.id}, ${f.label}, ${f.severity}, ${f.date}`, onClick: (e) => openFindingFrom(f.id, e.currentTarget),
    })))));

  // work orders: bars from creation to completion (or to the as-of date while they are open)
  const bars = m.workOrders.map((w) => ({ w, from: w.created, to: w.completed ?? m.asOf }));
  const packed = packRows(bars);
  const wo = h('div', { class: 'mh-wo', 'data-testid': 'wo-lane', style: { height: `${Math.max(1, packed.count) * 13 + 4}px` } },
    bars.map((b) => { const { w, from, to } = b; return h('button', {
      class: `mh-bar mh-${w.status}${w.overdue ? ' is-overdue' : ''}`, type: 'button', 'data-wo': w.id, style: { left: `${pos(m, from)}%`, width: `${Math.max(0.7, pos(m, to) - pos(m, from))}%`, top: `${packed.rows.get(b) * 13 + 2}px` },
      title: `${w.id} · ${w.type} · ${STATUS_LABEL[w.status]}${w.overdue ? ' · overdue' : ''} · ${w.created} to ${w.completed ?? 'now'} (${w.daysOpen} days) · ${w.ownerName}`,
      'aria-label': `Work order ${w.id}, ${w.type}, ${STATUS_LABEL[w.status]}`, onClick: (e) => openAssetFrom(w.assetId, e.currentTarget),
    }); }));

  const rep = h('div', { class: 'mh-row mh-reprow' }, h('span', { class: 'mh-rlabel' }, 'repairs'),
    h('div', { class: 'mh-track' }, m.repairs.map((r) => h('button', {
      class: `mh-diamond ${r.effective ? 'is-ok' : 'is-bad'}`, type: 'button', 'data-repair': r.id, style: { left: `${pos(m, r.date)}%` },
      title: `${r.id} · ${r.action} · ${r.date} · ${r.effective ? 'effective so far' : `ineffective: ${r.seenAgain[0].id} seen again on ${r.seenAgain[0].date}`} · ${r.ownerName}`,
      'aria-label': `Repair ${r.id}, ${r.action}, ${r.effective ? 'effective' : 'ineffective'}`, onClick: (e) => openAssetFrom(r.ownerId, e.currentTarget),
    }))));

  const legend = h('div', { class: 'hl-legend' },
    ...SEV_ROWS.map(([word, cond]) => h('span', {}, h('i', { class: `hl-swatch hl-c${cond}` }), word)),
    h('span', {}, h('i', { class: 'mh-key mh-key-closed' }), 'closed by a repair'), h('span', {}, h('i', { class: 'mh-key mh-key-rej' }), 'rejected'),
    ...['open', 'in_progress', 'completed'].map((s) => h('span', {}, h('i', { class: `mh-key mh-${s}` }), `${STATUS_LABEL[s]} work order`)),
    h('span', {}, h('i', { class: 'mh-key mh-key-od' }), 'overdue'),
    h('span', {}, h('i', { class: 'mh-key mh-key-d ok' }), 'repair held'), h('span', {}, h('i', { class: 'mh-key mh-key-d bad' }), 'ineffective repair (defect seen again)'));

  const card = h('section', { class: 'card hl-card', 'data-testid': 'timeline-card' }, h('h3', {}, 'Findings, work orders and repairs over time'), legend,
    h('div', { class: 'mh-tl', 'data-testid': 'timeline' }, axis, h('div', { class: 'mh-lane' }, h('h4', {}, 'Findings'), ...fRows), h('div', { class: 'mh-lane' }, h('h4', {}, `Work orders (${m.workOrders.length})`), h('div', { class: 'mh-wowrap' }, wo)), h('div', { class: 'mh-lane' }, h('h4', {}, `Repairs (${m.repairs.length})`), rep)),
    h('p', { class: 'a360-muted a360-small' }, 'Click a finding to open it, a work order or repair to open its asset. Bars run from the day a work order was raised to the day it was completed, or to the as-of date while it is open.'));

  return [card, trendCard(m, ctx)];
}

function trendCard(m, ctx) {
  if (!m.trend) {
    return h('section', { class: 'card hl-card', 'data-testid': 'trend-card' }, h('h3', {}, 'Health index'), h('p', { class: 'a360-muted' }, 'Choose a line or an asset to see its health index. A single score for all lines together is not defined.'));
  }
  const el = h('div', { class: 'hl-chart hl-chart-s', 'data-chart': 'history-trend', 'data-testid': 'trend-chart', role: 'img', 'aria-label': `Health index of ${m.trend.targetName}` });
  const card = h('section', { class: 'card hl-card', 'data-testid': 'trend-card' }, h('h3', {}, `Health index of ${m.trend.targetName}`), el,
    h('p', { class: 'a360-muted a360-small' }, m.trend.perRepair ? 'Hollow points are the day before a repair, filled points the day of it; dashed lines are repairs. The score uses only evidence and repairs up to each date.' : 'The line score at the end of each campaign and today. Choose one asset to see its score before and after each repair.'));
  drawChart(el, (p) => historyTrendOption(m.trend, m, p))
    .then((c) => { ctx.track(() => c.dispose()); el.dataset.ready = 'true'; })
    .catch((e) => { el.replaceChildren(h('p', { class: 'a360-muted a360-note', role: 'status' }, `The chart could not be drawn (${e.message}).`)); el.dataset.ready = 'failed'; });
  return card;
}

// ---- repairs

const hiText = (r) => (r.hiBefore === null && r.hiAfter === null ? '–' : `${fnum(r.hiBefore)} → ${fnum(r.hiAfter)}`);

function repairsView(m, ctx) {
  const show = ctx.state.show === 'ineffective' ? m.repairs.filter((r) => !r.effective) : m.repairs;
  if (!show.length) return [emptyState('repairs-empty', 'No repairs', ctx.state.show ? 'No repair in this selection was followed by the same defect. Choose All repairs to see them.' : 'No repair is recorded for this selection.')];
  const rows = show.map((r) => h('tr', { 'data-repair': r.id, class: r.effective ? '' : 'is-bad' },
    h('td', {}, r.date),
    h('td', {}, h('b', {}, r.id), h('div', { class: 'a360-muted a360-small' }, `${r.action} · ${r.workOrderId}`)),
    h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: (e) => openAssetFrom(r.ownerId, e.currentTarget) }, r.ownerName), r.assetId !== r.ownerId ? h('div', { class: 'a360-muted a360-small' }, `on ${r.assetName}`) : null),
    h('td', {}, r.closes.map((c) => h('div', {}, h('button', { class: 'a360-link', type: 'button', onClick: (e) => openFindingFrom(c.id, e.currentTarget) }, c.id), h('span', { class: 'a360-muted a360-small' }, ` ${c.label} · ${c.days} d`)))),
    h('td', { 'data-testid': 'hi-change' }, hiText(r), r.delta !== null ? h('div', { class: `a360-small ${r.delta > 0 ? 'hl-better' : r.delta < 0 ? 'hl-worse' : 'a360-muted'}` }, `${r.delta > 0 ? '+' : ''}${r.delta}`) : null),
    h('td', {}, r.effective ? tag('held', 'g') : [tag('ineffective', 'r'), ...r.seenAgain.map((x) => h('div', { class: 'a360-small' }, 'seen again ', h('button', { class: 'a360-link', type: 'button', onClick: (e) => openFindingFrom(x.id, e.currentTarget) }, x.id), ` ${x.date} (+${x.daysAfter} d)`))])));
  return [h('section', { class: 'card hl-card', 'data-testid': 'repairs-card' }, h('h3', {}, `Repairs (${show.length}${show.length !== m.repairs.length ? ` of ${m.repairs.length}` : ''})`),
    h('p', { class: 'a360-muted a360-small' }, 'The health index of the repaired tower, span or transformer as of the day before the repair and as of the repair day. A repair is ineffective when the defect it closed is sighted again afterwards.'),
    h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'repairs' },
      h('thead', {}, h('tr', {}, ...['Date', 'Repair', 'Asset', 'Findings closed (days from finding)', 'Health index before → after', 'Result'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows))))];
}

// ---- work orders

function workOrdersView(m, ctx) {
  const st = ctx.state.status;
  const list = st ? m.workOrders.filter((w) => w.status === st) : m.workOrders;
  const total = Math.max(1, m.workOrders.length);
  const bar = h('div', { class: 'mh-stack', 'data-testid': 'status-bar', role: 'img', 'aria-label': WO_STATUSES.map((s) => `${m.statusCounts[s]} ${STATUS_LABEL[s]}`).join(', ') },
    WO_STATUSES.filter((s) => m.statusCounts[s]).map((s) => h('span', { class: `mh-seg mh-${s}`, 'data-status': s, style: { width: `${(m.statusCounts[s] / total) * 100}%` } }, `${m.statusCounts[s]} ${STATUS_LABEL[s]}`)));
  const t = m.turnaround;
  const counts = h('section', { class: 'card hl-card', 'data-testid': 'status-card' }, h('h3', {}, 'Work order status'), bar,
    h('p', { class: 'a360-small', 'data-testid': 'turnaround' }, `Completed work orders took a median of ${dayWord(t.woMedianDays)} (mean ${fnum(t.woMeanDays)}) from being raised to being completed. From finding to repair: median ${dayWord(t.medianDays)}, slowest ${t.maxDays ?? '–'} days. ${plural(m.overdue, 'work order')} ${m.overdue === 1 ? 'is' : 'are'} past the planned date and not completed.`));
  if (!list.length) return [counts, emptyState('wo-empty', 'No work orders', 'No work order has this status in this selection.')];
  const rows = list.map((w) => h('tr', { 'data-wo': w.id },
    h('td', {}, h('b', {}, w.id)), h('td', {}, w.type, h('div', { class: 'a360-muted a360-small' }, `${w.priority} priority`)),
    h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: (e) => openAssetFrom(w.ownerId, e.currentTarget) }, w.ownerName), w.assetId !== w.ownerId ? h('div', { class: 'a360-muted a360-small' }, `on ${w.assetName}`) : null),
    h('td', {}, tag(STATUS_LABEL[w.status], STATUS_TONE[w.status]), w.overdue ? [' ', tag('overdue', 'r')] : null),
    h('td', {}, w.created), h('td', {}, w.planned), h('td', {}, w.completed ?? '–'), h('td', {}, `${w.daysOpen}`),
    h('td', {}, w.findingIds.slice(0, 3).map((id) => h('button', { class: 'a360-link mh-fid', type: 'button', onClick: (e) => openFindingFrom(id, e.currentTarget) }, id)), w.findingIds.length > 3 ? h('span', { class: 'a360-muted a360-small' }, ` +${w.findingIds.length - 3}`) : null),
    h('td', {}, w.repairId ?? '–')));
  return [counts, h('section', { class: 'card hl-card', 'data-testid': 'wo-card' }, h('h3', {}, `Work orders (${list.length}${list.length !== m.workOrders.length ? ` of ${m.workOrders.length}` : ''})`),
    h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'workorders' },
      h('thead', {}, h('tr', {}, ...['Work order', 'Type', 'Asset', 'Status', 'Raised', 'Planned', 'Completed', 'Days open', 'Findings', 'Repair'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows))))];
}
