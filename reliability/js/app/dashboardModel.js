// Reliability Dashboard: everything the screen shows, as plain objects. No DOM here; dashboardScreen.js renders it.
// Scores are the Phase 2 scores in the snapshot (as of snap.asOf). Counts include every record in the registry (duplicate
// records sit in "not assessed"), so a click on a number opens a registry list with exactly that many rows.

import { healthIndex } from '../domain/health/healthIndex.js';
import { CONFIG } from '../domain/config.js';
import { linksKpis } from './registryModel.js';
import { listLines } from './healthModel.js';
import { freshnessOf } from './freshness.js';

export const BANDS = Object.freeze(['poor', 'moderate', 'normal', 'none']);
export const BAND_WORD = Object.freeze({ poor: 'poor', moderate: 'moderate', normal: 'normal', none: 'not assessed' });
/** The registry tab each category lives in, and its title in the tab strip. */
export const CATEGORY = Object.freeze([
  { id: 'lines', title: 'Lines', classes: ['line'], noun: 'lines' },
  { id: 'towers', title: 'Towers', classes: ['tower'], noun: 'towers' },
  { id: 'spans', title: 'Spans', classes: ['span'], noun: 'spans' },
  { id: 'transformers', title: 'Transformers', classes: ['power_transformer'], noun: 'transformers' },
]);

const bandOf = (hi) => (!hi || hi.score === null || hi.score === undefined ? 'none' : hi.band);
const blank = () => ({ poor: 0, moderate: 0, normal: 0, none: 0 });
const dayMs = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

/** @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap */
export function loadDashboard(snap) {
  const { asOf } = snap;
  const nowCounts = (cls, date = asOf) => {
    const c = blank();
    for (const a of snap.assets) {
      if (a.class !== cls || (a.install_date && a.install_date > date)) continue;
      c[bandOf(date === asOf ? snap.scores.get(a.asset_id)?.hi : healthIndex(snap.ctx, a.asset_id, date))] += 1;
    }
    return c;
  };

  // ---- assets by band, by category (the same counts feed the KPI card, the distribution and the registry drill-down)
  const byCategory = CATEGORY.map((c) => ({ ...c, counts: nowCounts(c.classes[0]), total: snap.assets.filter((a) => c.classes.includes(a.class)).length }));
  const cat = (id) => byCategory.find((c) => c.id === id);
  const attention = ['towers', 'spans', 'transformers'].reduce((n, id) => n + cat(id).counts.poor + cat(id).counts.moderate, 0);
  const stale = snap.assets.filter((a) => ['tower', 'span', 'power_transformer'].includes(a.class) && freshnessOf(snap, a.asset_id).stale).length;

  // ---- open findings by severity, at each campaign date and today
  const owners = snap.assets.filter((a) => ['tower', 'span', 'power_transformer'].includes(a.class));
  const openAt = (date) => { let crit = 0; let serious = 0; let all = 0; for (const o of owners) for (const f of snap.ctx.findingsFor(o.asset_id, date).counted) { all += 1; if (f.condition_score === 1) crit += 1; else if (f.condition_score === 2) serious += 1; } return { crit, serious, all }; };
  const findingsSeries = snap.dates.map(openAt);
  const nowF = findingsSeries.at(-1);
  const unreviewedUrgent = owners.reduce((n, o) => n + snap.ctx.findingsFor(o.asset_id, asOf).unreviewed.filter((f) => f.condition_score <= 2).length, 0);

  // ---- work orders overdue (planned date passed, not completed, not cancelled), at each date and today
  const workOrders = snap.workOrders.filter((w) => snap.inScope(w.asset_id));
  const overdueAt = (date) => workOrders.filter((w) => w.created_at <= date && w.planned_date < date && w.status !== 'cancelled' && !(w.completed_at && w.completed_at <= date)).length;
  const openOrders = workOrders.filter((w) => w.created_at <= asOf && w.status !== 'cancelled' && !(w.completed_at && w.completed_at <= asOf));
  const overdueList = openOrders.filter((w) => w.planned_date < asOf);
  const oldest = overdueList.length ? Math.max(...overdueList.map((w) => daysBetween(w.planned_date, asOf))) : 0;

  // ---- links awaiting review
  const links = linksKpis(snap)[0];
  const awaiting = Number(links.v);

  // ---- trend: tower and span band counts at each campaign date and today
  const trend = {
    dates: snap.dates,
    labels: snap.dates.map((d) => snap.endLabel(d)),
    asOf,
    towers: snap.dates.map((d) => nowCounts('tower', d)),
    spans: snap.dates.map((d) => nowCounts('span', d)),
  };

  // ---- top 10 risks: towers and transformers together
  const ranked = owners.filter((a) => a.class !== 'span' && snap.scores.get(a.asset_id)?.risk && snap.scores.get(a.asset_id).risk.score !== null && !snap.dupRecord.has(a.asset_id)).map((a) => {
    const s = snap.scores.get(a.asset_id);
    const f = s.risk.breakdown.factors;
    const line = lineOf(snap, a);
    return {
      id: a.asset_id, name: a.name, kind: a.class === 'tower' ? 'tower' : 'transformer', lineId: line, lineName: line ? snap.byId.get(line).name : (stationOf(snap, a)?.name ?? '–'),
      fresh: freshnessOf(snap, a.asset_id), hi: s.hi.score, band: bandOf(s.hi), points: f.condition.conditionPoints, criticality: f.criticality.value, consequence: f.consequence.value, risk: s.risk.score, riskBand: s.risk.band,
    };
  }).sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id, undefined, { numeric: true })).slice(0, 10);

  // ---- one row per line
  const lineRows = listLines(snap).map((l) => {
    const b = snap.scores.get(l.id).hi.breakdown;
    const worstTower = (b.worst ?? []).find((w) => w.class === 'tower') ?? null;
    const na = (b.notAssessed ?? []).filter((id) => !snap.dupRecord.has(id));
    const counts = b.bandCounts?.all ?? blank();
    return { fresh: freshnessOf(snap, l.id), id: l.id, name: l.name, kv: l.kv, hi: l.hi, band: l.band, counts: { poor: counts.poor ?? 0, moderate: counts.moderate ?? 0, normal: counts.normal ?? 0 }, worstTower: worstTower && { id: worstTower.assetId, name: worstTower.name, score: worstTower.score, band: worstTower.band }, notAssessed: na.length, notAssessedTowers: na.filter((id) => snap.byId.get(id)?.class === 'tower').length };
  });

  return {
    found: true, asOf, byCategory, attention,
    kpis: {
      assets: { byCategory: ['towers', 'spans', 'transformers'].map(cat), attention, stale },
      findings: { critical: nowF.crit, serious: nowF.serious, urgent: nowF.crit + nowF.serious, all: nowF.all, unreviewedUrgent, series: findingsSeries.map((x) => x.crit + x.serious) },
      overdue: { count: overdueList.length, open: openOrders.length, oldestDays: oldest, series: snap.dates.map(overdueAt) },
      links: { awaiting, sub: links.s },
    },
    trend, risks: ranked, lines: lineRows,
    empty: !snap.assets.length,
  };
}

function lineOf(snap, a) {
  for (let cur = a, i = 0; cur && i < 6; cur = cur.parent_id ? snap.byId.get(cur.parent_id) : null, i += 1) if (cur.class === 'line') return cur.asset_id;
  return null;
}
function stationOf(snap, tx) { const bay = snap.byId.get(tx.parent_id); return bay ? snap.byId.get(bay.parent_id) : null; }

export const BAND_NORMAL_MIN = CONFIG.bands.normalMin;
