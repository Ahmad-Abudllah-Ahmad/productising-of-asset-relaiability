// Reliability Dashboard, rebuilt on the repository data in the legacy look. Sparse on purpose: four KPI cards, a trend, a
// distribution, the ten biggest risks and one row per line, on one screen at 1920 x 1080.
//
// Every number and row drills down:
//   assets by band chips, distribution and trend segments  -> Asset Registry, that category, filtered to the band
//   open critical and serious findings                      -> Maintenance History > Open findings
//   overdue work orders                                     -> Maintenance History > Work orders, overdue
//   links awaiting review                                   -> Asset Registry > Links
//   a risk row, a worst tower                               -> Asset 360;  a line row, a line name -> Line Health
// The registry shows today's state, so a click on a segment of an earlier campaign's bar opens today's list (the
// tooltip says so). The URL holds view=dashboard. ?healthdelay and ?healthfail slow and fail the load, as on the other screens.

import { h } from '../ui/dom.js';
import { tag, plural, emptyState, mountScreen, asOfNote, writeView, BAND_TONE } from './screenKit.js';
import { loadDashboard, BANDS, BAND_WORD, CATEGORY } from './dashboardModel.js';
import { drawChart, dashboardTrendOption } from './charts.js';
import { openAsset } from './assetPanel.js';
import { openRegistryTab, openScreen } from './navigation.js';

export function createDashboardScreen(deps) {
  return { tabs: [{ name: 'Overview', render: () => '<div class="screen hl dash" data-testid="dashboard" data-hl-root></div>', mount: (stage) => mountDashboard(stage, deps) }] };
}

const TITLE = Object.fromEntries(CATEGORY.map((c) => [c.id, c.title]));
const openBand = (catId, band) => openRegistryTab(TITLE[catId], band ? { 'Health band': BAND_WORD[band] } : {});
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
const BAND_LABEL = { poor: 'poor', moderate: 'moderate', normal: 'normal', none: 'not assessed' };

function mountDashboard(stage, deps) {
  return mountScreen(stage, deps, {
    view: 'dashboard', bare: true, noun: 'the dashboard',
    state() { writeView({ view: 'dashboard' }); return {}; },
    controls() { return []; },
    load: (snap) => loadDashboard(snap),
    draw: (m, ctx) => draw(m, ctx),
  });
}

function draw(m, ctx) {
  if (m.empty) return [emptyState('dashboard-empty', 'Nothing to show yet', 'The registry has no assets. Import assets, then reload.')];
  const kit = ctx.deps.kit;
  const head = h('div', { class: 'hl-head dash-head', 'data-testid': 'hl-head' }, h('div', {}, h('h2', {}, 'Reliability dashboard'), h('p', { class: 'a360-muted a360-small' }, 'Towers, spans, transformers and lines; every number opens the list behind it.')), asOfNote(ctx.snap));
  return [h('div', { class: 'hl-main dash-main' }, head, kpiRow(m, kit), h('div', { class: 'dash-mid' }, trendCard(m, ctx), distributionCard(m)), h('div', { class: 'dash-bottom' }, risksCard(m), linesCard(m)))];
}

// ---------------------------------------------------------------------------------------------------- KPI cards

function sparkSvg(kit, values, id) {
  const w = document.createElement('div');
  w.innerHTML = kit.areaSpark(values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0], `dsp-${id}`);
  return w.firstElementChild;
}

function kpiRow(m, kit) {
  const k = m.kpis;
  const chip = (c, band) => {
    const n = c.counts[band];
    return h('button', { class: `dash-chip${n ? '' : ' is-zero'}`, type: 'button', 'data-cat': c.id, 'data-band': band, title: `${n} ${c.noun}: ${BAND_LABEL[band]}. Open the registry on this band.`, 'aria-label': `${n} ${c.noun}, ${BAND_LABEL[band]}`, onClick: () => openBand(c.id, band) },
      h('i', { class: `hl-swatch hl-band-${band}` }), String(n));
  };
  const assets = h('div', { class: 'kpi card dash-kpi dash-kpi-assets', 'data-testid': 'kpi-assets', role: 'group', 'aria-label': 'Assets by band' },
    h('div', { class: 'k' }, 'Assets by band'),
    h('div', { class: 'dash-rows' }, k.assets.byCategory.map((c) => h('div', { class: 'dash-row', 'data-cat': c.id }, h('button', { class: 'dash-rlabel', type: 'button', onClick: () => openBand(c.id, null), title: `Open the ${c.title} registry` }, c.title), BANDS.map((b) => chip(c, b))))),
    h('div', { class: 'sub sub-warn' }, `${k.assets.attention} need attention`, h('span', { class: 'dash-key' }, 'poor · moderate · normal · not assessed')));
  const button = (id, cls, testid, label, value, sub, tone, series, onClick) => {
    const b = h('button', { class: `kpi card dash-kpi ${cls}`, type: 'button', 'data-testid': testid, 'aria-label': `${label}: ${value}. ${sub}`, onClick });
    b.innerHTML = `<div class="k">${esc(label)}</div><div class="n">${esc(value)}</div><div class="sub sub-${tone}">${esc(sub)}</div>`;
    b.append(sparkSvg(kit, series, id));
    return b;
  };
  const f = k.findings;
  const findings = button('f', 'dash-kpi-findings', 'kpi-findings', 'Open critical and serious findings', String(f.urgent), `${f.critical} critical · ${f.serious} serious · ${f.unreviewedUrgent} unreviewed`, f.critical ? 'bad' : f.urgent ? 'warn' : 'ok', f.series, () => openScreen('history', 'Open findings', { sev: 'urgent' }));
  const o = k.overdue;
  const overdue = button('o', 'dash-kpi-overdue', 'kpi-overdue', 'Overdue work orders', String(o.count), o.count ? `of ${o.open} open · oldest ${o.oldestDays} days late` : `of ${o.open} open`, o.count ? 'warn' : 'ok', o.series, () => openScreen('history', 'Work orders', { status: 'overdue' }));
  const l = k.links;
  const links = button('l', 'dash-kpi-links', 'kpi-links', 'Links awaiting review', String(l.awaiting), l.sub, l.awaiting ? 'warn' : 'ok', [l.awaiting, l.awaiting], () => openRegistryTab('Links'));
  const row = h('div', { class: 'kpi4 dash-kpis', 'data-testid': 'hl-kpis' }, assets, findings, overdue, links);
  row.setAttribute('data-ready', 'true');
  return row;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------------------------------- trend

function bandLegend() {
  return h('div', { class: 'hl-legend dash-legend', 'data-testid': 'band-legend' }, ...BANDS.map((b) => h('span', {}, h('i', { class: `hl-swatch hl-band-${b}` }), BAND_LABEL[b])));
}

function trendCard(m, ctx) {
  const el = h('div', { class: 'dash-chart', 'data-chart': 'trend', 'data-testid': 'trend-chart', role: 'img', 'aria-label': 'Towers and spans by health band at each campaign and today' });
  const card = h('section', { class: 'card hl-card dash-card', 'data-testid': 'trend-card' }, h('h3', {}, 'Condition across campaigns'), bandLegend(), el,
    h('p', { class: 'a360-muted a360-small' }, 'Left bar: towers, right bar: spans. Assets count from the day they were installed. Click a segment to open the registry on that band (it lists today\'s state).'));
  drawChart(el, (p) => dashboardTrendOption(m.trend, p), { onClick: (e) => { const d = e.data; if (d?.cls) openBand(d.cls, d.band); } })
    .then((c) => { ctx.track(() => c.dispose()); el.dataset.ready = 'true'; })
    .catch((e) => { el.replaceChildren(h('p', { class: 'a360-muted a360-note', role: 'status' }, `The chart could not be drawn (${e.message}). The distribution beside it has the same numbers for today.`)); el.dataset.ready = 'failed'; });
  return card;
}

// ---------------------------------------------------------------------------------------------------- distribution

function distributionCard(m) {
  const rows = m.byCategory.map((c) => {
    const total = Math.max(1, BANDS.reduce((n, b) => n + c.counts[b], 0));
    return h('div', { class: 'dash-dist', 'data-cat': c.id },
      h('button', { class: 'dash-rlabel', type: 'button', onClick: () => openBand(c.id, null), title: `Open the ${c.title} registry` }, c.title, h('span', { class: 'a360-muted a360-small' }, ` ${total}`)),
      h('div', { class: 'dash-bar', role: 'img', 'aria-label': `${c.title}: ${BANDS.map((b) => `${c.counts[b]} ${BAND_LABEL[b]}`).join(', ')}` },
        BANDS.filter((b) => c.counts[b]).map((b) => h('button', { class: `dash-seg hl-band-${b}`, type: 'button', 'data-cat': c.id, 'data-band': b, style: { flexGrow: String(c.counts[b]) }, title: `${c.counts[b]} ${c.noun}: ${BAND_LABEL[b]} (${Math.round((c.counts[b] / total) * 100)}%). Open the registry on this band.`, 'aria-label': `${c.counts[b]} ${c.noun}, ${BAND_LABEL[b]}`, onClick: () => openBand(c.id, b) }, String(c.counts[b])))));
  });
  return h('section', { class: 'card hl-card dash-card', 'data-testid': 'distribution-card' }, h('h3', {}, 'Health index by category'), bandLegend(), h('div', { class: 'dash-dists', 'data-testid': 'distribution' }, rows),
    h('p', { class: 'a360-muted a360-small' }, 'One bar per category; the length of a segment is its share. Not assessed means no inspection evidence yet, not a good score.'));
}

// ---------------------------------------------------------------------------------------------------- top risks and lines

function risksCard(m) {
  const rows = m.risks.map((r, i) => h('tr', { 'data-asset': r.id, tabindex: '0', onClick: (e) => openAsset(r.id, { opener: e.currentTarget }), onKeydown: (e) => { if (e.key === 'Enter') openAsset(r.id, { opener: e.currentTarget }); } },
    h('td', { class: 'dash-num' }, String(i + 1)),
    h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: stop((e) => openAsset(r.id, { opener: e.currentTarget })) }, r.name), h('span', { class: 'a360-muted a360-small' }, ` ${r.kind}`)),
    h('td', {}, r.lineId ? h('button', { class: 'a360-link', type: 'button', 'data-testid': 'risk-line', onClick: stop(() => openScreen('lines', null, { line: r.lineId })) }, r.lineName) : r.lineName),
    h('td', {}, tag(`${r.hi} · ${BAND_LABEL[r.band]}`, BAND_TONE[r.band])),
    h('td', { class: 'dash-num' }, String(r.points)), h('td', { class: 'dash-num' }, String(r.criticality)), h('td', { class: 'dash-num' }, String(r.consequence)),
    h('td', { class: 'dash-num' }, h('b', {}, String(Math.round(r.risk))), ' ', tag(r.riskBand, { low: 'g', medium: 'b', high: 'a', critical: 'r' }[r.riskBand]))));
  return h('section', { class: 'card hl-card dash-card', 'data-testid': 'risks-card' }, h('h3', {}, 'Top 10 risks'),
    h('p', { class: 'a360-muted a360-small' }, 'Risk = (100 − health index) × criticality × consequence, with the linked-asset uplift. Towers and transformers together.'),
    m.risks.length ? h('table', { class: 'a360-table dash-table', 'data-testid': 'risks' }, h('thead', {}, h('tr', {}, ...['#', 'Asset', 'Line', 'Health index', 'Condition', 'Criticality', 'Consequence', 'Risk'].map((x, i) => h('th', { scope: 'col', class: i === 0 || i >= 4 ? 'dash-num' : '' }, x)))), h('tbody', {}, rows))
      : h('p', { class: 'a360-muted' }, 'Nothing has a risk score yet.'));
}

function linesCard(m) {
  const goLine = (id) => openScreen('lines', null, { line: id });
  const rows = m.lines.map((l) => h('tr', { 'data-line': l.id, tabindex: '0', onClick: () => goLine(l.id), onKeydown: (e) => { if (e.key === 'Enter') goLine(l.id); } },
    h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: stop(() => goLine(l.id)) }, l.name), h('span', { class: 'a360-muted a360-small' }, ` ${l.kv} kV`)),
    h('td', {}, tag(`${l.hi} · ${BAND_LABEL[l.band]}`, BAND_TONE[l.band])),
    h('td', {}, h('span', { class: 'dash-counts', title: `${l.counts.poor} poor, ${l.counts.moderate} moderate, ${l.counts.normal} normal (towers and spans)` }, ...['poor', 'moderate', 'normal'].map((b) => h('span', { class: `dash-count${l.counts[b] ? '' : ' is-zero'}` }, h('i', { class: `hl-swatch hl-band-${b}` }), String(l.counts[b]))))),
    h('td', {}, l.worstTower ? [h('button', { class: 'a360-link', type: 'button', 'data-testid': 'worst-tower', onClick: stop((e) => openAsset(l.worstTower.id, { opener: e.currentTarget })) }, l.worstTower.name), ' ', tag(String(l.worstTower.score), BAND_TONE[l.worstTower.band])] : h('span', { class: 'a360-muted' }, '–')),
    h('td', { class: 'dash-num' }, l.notAssessed ? h('button', { class: 'a360-link', type: 'button', 'data-testid': 'not-assessed-count', title: `${plural(l.notAssessedTowers, 'tower')} and ${plural(l.notAssessed - l.notAssessedTowers, 'span')} with no inspection evidence yet`, onClick: stop(() => openScreen('towers', null, { line: l.id, band: 'none' })) }, String(l.notAssessed)) : h('span', { class: 'a360-muted' }, '0'))));
  return h('section', { class: 'card hl-card dash-card', 'data-testid': 'lines-card' }, h('h3', {}, 'Lines'),
    h('p', { class: 'a360-muted a360-small' }, 'Length-weighted health index, units by band, the worst tower, and units with no evidence yet. Click a row to open the line.'),
    h('table', { class: 'a360-table dash-table', 'data-testid': 'lines' }, h('thead', {}, h('tr', {}, ...['Line', 'Health index', 'Poor · moderate · normal', 'Worst tower', 'Not assessed'].map((x, i) => h('th', { scope: 'col', class: i === 4 ? 'dash-num' : '' }, x)))), h('tbody', {}, rows)));
}
