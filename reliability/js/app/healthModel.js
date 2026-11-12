// Line Health and Tower Health: everything the two screens show, gathered into plain objects.
// No DOM here. healthScreens.js renders it; the tests read it directly.
//
// All scores are the Phase 2 scores in the snapshot (snap.scores), as of snap.asOf. Nothing is recomputed
// except the campaign-by-campaign history, which asks the same scoring functions for earlier dates.

import { CONFIG } from '../domain/config.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { loadAssetDetail, SEVERITY } from './assetModel.js';

export const BAND_LABEL = Object.freeze({ normal: 'normal', moderate: 'moderate', poor: 'poor', none: 'not assessed' });
export const BAND_ORDER = Object.freeze(['poor', 'moderate', 'normal', 'none']);

/** The six scoring groups of a tower, with the part of the tower each one is drawn on. */
export const TOWER_GROUPS = Object.freeze([
  { id: 'lightning_protection', label: 'Lightning protection', zones: ['earthwire peak'] },
  { id: 'insulators', label: 'Insulators', zones: ['insulator strings'] },
  { id: 'conductor_accessories', label: 'Conductor accessories', zones: ['conductor hardware'] },
  { id: 'steel_structure', label: 'Steel structure', zones: ['crossarms', 'body', 'legs'] },
  { id: 'tower_accessories', label: 'Tower accessories', zones: ['fittings'] },
  { id: 'foundation', label: 'Foundation', zones: ['foundation'] },
]);
const GROUP_LABEL = Object.fromEntries(TOWER_GROUPS.map((g) => [g.id, g.label]));

const dayMs = 86400000;
const ageDays = (date, asOf) => Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / dayMs);
/** Scoring reasons say "asOf"; the screens say the date, and start with a capital. */
const sentence = (text, asOf) => { const t = String(text ?? '').replace(/\basOf\b/g, asOf); return t.charAt(0).toUpperCase() + t.slice(1); };
const bandOf = (hi) => (hi?.score === null || hi?.score === undefined ? 'none' : hi.band);

/** Campaign names for the snapshot dates, then "Today" for the as-of date when it is not a campaign end. */
function dateLabels(snap) {
  const byEnd = new Map(snap.campaigns.map((c) => [c.end, c.name]));
  return snap.dates.map((d) => byEnd.get(d) ?? 'Today');
}

// ---------------------------------------------------------------------------------------------- lists

/** Lines for the selector: id, name, voltage, and the line's score. */
export function listLines(snap) {
  return snap.assets.filter((a) => a.class === 'line').map((a) => {
    const hi = snap.scores.get(a.asset_id)?.hi;
    return { id: a.asset_id, name: a.name, kv: a.voltage_kv, lengthKm: a.ext?.length_km ?? null, hi: hi?.score ?? null, band: bandOf(hi) };
  }).sort((a, b) => a.kv - b.kv || a.name.localeCompare(b.name));
}

/** Towers for the selector, optionally of one line and one band. Duplicate records are listed, and say so. */
export function listTowers(snap, { line = null, band = null } = {}) {
  return snap.assets.filter((a) => a.class === 'tower' && (!line || a.parent_id === line)).map((a) => {
    const hi = snap.scores.get(a.asset_id)?.hi;
    return { id: a.asset_id, name: a.name, line: a.parent_id, hi: hi?.score ?? null, band: bandOf(hi), duplicate: snap.dupRecord.has(a.asset_id) };
  }).filter((t) => !band || t.band === band)
    .sort((a, b) => Number(a.duplicate) - Number(b.duplicate) || a.line.localeCompare(b.line) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ----------------------------------------------------------------------------------------------- line

/**
 * Towers of a line in order along it, with the span between each pair.
 * The order follows the spans (from_tower to to_tower); a tower no span reaches goes at the end.
 */
export function orderAlong(towers, spans) {
  const next = new Map();
  const hasPrev = new Set();
  for (const s of spans) { next.set(s.ext?.from_tower, s); hasPrev.add(s.ext?.to_tower); }
  const byId = new Map(towers.map((t) => [t.asset_id, t]));
  const placed = new Set();
  const units = [];
  const heads = towers.filter((t) => next.has(t.asset_id) && !hasPrev.has(t.asset_id));
  for (const head of heads) {
    let cur = head;
    while (cur && !placed.has(cur.asset_id)) {
      placed.add(cur.asset_id);
      units.push({ tower: cur, spanAfter: null });
      const s = next.get(cur.asset_id);
      const nxt = s ? byId.get(s.ext.to_tower) : null;
      if (s && nxt) units[units.length - 1].spanAfter = s;
      cur = nxt;
    }
  }
  for (const t of towers) if (!placed.has(t.asset_id)) units.push({ tower: t, spanAfter: null });
  return units;
}

/**
 * @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap
 * @param {string} lineId
 */
export function loadLineHealth(snap, lineId) {
  const line = snap.byId.get(lineId);
  if (!line || line.class !== 'line' || line.merged_into) return { found: false, id: lineId };
  const hi = snap.scores.get(lineId).hi;
  const kids = snap.assets.filter((a) => a.parent_id === lineId);
  const records = kids.filter((a) => a.class === 'tower' && snap.dupRecord.has(a.asset_id));
  const towers = kids.filter((a) => a.class === 'tower' && !snap.dupRecord.has(a.asset_id));
  const spans = kids.filter((a) => a.class === 'span');

  const cell = (a) => {
    const s = snap.scores.get(a.asset_id)?.hi;
    const open = snap.findingsByOwner.get(a.asset_id)?.length ?? 0;
    return { id: a.asset_id, name: a.name, hi: s?.score ?? null, band: bandOf(s), assessed: s?.score !== null && s?.score !== undefined, open, unreviewed: snap.unreviewedByOwner.get(a.asset_id) ?? 0,
      risk: snap.scores.get(a.asset_id)?.risk?.score ?? null, reason: s?.score === null || s?.score === undefined ? sentence(s?.breakdown?.reason ?? 'No evidence yet', snap.asOf) : null };
  };
  const units = [];
  for (const { tower, spanAfter } of orderAlong(towers, spans)) {
    units.push({ kind: 'tower', ...cell(tower), index: units.length });
    if (spanAfter) units.push({ kind: 'span', ...cell(spanAfter), clearance: spanAfter.ext?.min_clearance_m ?? null, lengthM: spanAfter.ext?.length_m ?? null, index: units.length });
  }
  const T = units.filter((u) => u.kind === 'tower');
  const S = units.filter((u) => u.kind === 'span');

  // the line's score at each campaign date and today, for the trend card
  const labels = dateLabels(snap);
  const atDate = snap.dates.map((d) => {
    const lh = healthIndex(snap.ctx, lineId, d);
    let attention = 0; let open = 0;
    for (const u of units) {
      const uh = healthIndex(snap.ctx, u.id, d);
      if (uh.score !== null && uh.score < CONFIG.bands.normalMin) attention += 1;
      open += snap.ctx.findingsFor(u.id, d).counted.length;
    }
    return { hi: lh.score, coverage: lh.breakdown?.coverageByLength ?? null, attention, open };
  });
  const trend = { labels, dates: snap.dates, values: atDate.map((x) => x.hi), coverage: atDate.map((x) => x.coverage), attention: atDate.map((x) => x.attention), open: atDate.map((x) => x.open) };

  const b = hi.breakdown;
  const openTotal = units.reduce((n, u) => n + u.open, 0);
  return {
    found: true, id: lineId, asOf: snap.asOf,
    line: { id: lineId, name: line.name, kv: line.voltage_kv, lengthKm: line.ext?.length_km ?? null, ends: String(line.ext?.end_substations ?? '').split(',').filter(Boolean) },
    assessed: hi.score !== null, hi: hi.score, band: bandOf(hi), reason: hi.score === null ? sentence(b.reason ?? 'No evidence yet', snap.asOf) : null,
    units, towers: T, spans: S,
    duplicates: records.map((r) => ({ id: r.asset_id, name: r.name })),
    counts: b.counts ?? null, coverageByLength: b.coverageByLength ?? null, bandCounts: b.bandCounts ?? null,
    worst: (b.worst ?? []).map((w) => ({ ...w })),
    notAssessed: units.filter((u) => !u.assessed).map((u) => ({ id: u.id, name: u.name, kind: u.kind, reason: u.reason })),
    cappedByWorst: Boolean(b.cappedByWorst), formula: b.formula ?? null, freshness: b.freshness ?? null,
    trend, openTotal, unreviewedTotal: units.reduce((n, u) => n + u.unreviewed, 0),
    attention: { poor: units.filter((u) => u.band === 'poor').length, moderate: units.filter((u) => u.band === 'moderate').length },
  };
}

// ---------------------------------------------------------------------------------------------- tower

/**
 * One tower: its score, the condition of each group (and so of each zone of the drawing), its findings, and how the
 * groups looked at each campaign.
 */
export async function loadTowerHealth(repo, snap, towerId) {
  const asset = snap.byId.get(towerId);
  if (!asset || asset.class !== 'tower' || asset.merged_into) return { found: false, id: towerId };
  const d = await loadAssetDetail(repo, snap, towerId);
  const hi = snap.scores.get(towerId).hi;
  const assessed = hi.score !== null;
  const b = hi.breakdown;
  const groups = TOWER_GROUPS.map((g) => {
    const x = assessed ? b.groups.find((y) => y.group === g.id) : null;
    const worst = x?.components?.length ? [...x.components].sort((p, q) => p.score - q.score)[0] : null;
    return {
      id: g.id, label: g.label, zones: g.zones, score: x ? x.score : null, capped: Boolean(x?.capped), findings: x?.findingIds?.length ?? 0,
      worstComponent: worst ? { id: worst.componentId, name: snap.byId.get(worst.componentId)?.name ?? worst.componentId, score: worst.score } : null,
      untouched: x?.untouchedComponents ?? 0,
    };
  });

  // groups at each campaign date and today; a column where the tower was not flown has no scores
  const labels = dateLabels(snap);
  const repairs = snap.ctx.repairsFor(towerId);
  const columns = snap.dates.map((date, i) => {
    const h = healthIndex(snap.ctx, towerId, date);
    const flown = h.score !== null;
    const prev = i ? snap.dates[i - 1] : null;
    return {
      date, label: labels[i], today: labels[i] === 'Today', flown, hi: h.score, band: bandOf(h), reason: flown ? null : sentence(h.breakdown?.reason ?? 'Not assessed', date),
      scores: Object.fromEntries(TOWER_GROUPS.map((g) => [g.id, flown ? (h.breakdown.groups.find((y) => y.group === g.id)?.score ?? null) : null])),
      repairs: repairs.filter((r) => r.date <= date && (!prev || r.date > prev)).map((r) => ({ id: r.repair_id, date: r.date, action: r.action })),
    };
  });
  // the same rows as before, plus what changed since the last column that has scores
  const rows = TOWER_GROUPS.map((g) => {
    let last = null;
    const cells = columns.map((c) => {
      const v = c.scores[g.id];
      const change = v === null || last === null ? null : v > last ? 'better' : v < last ? 'worse' : 'same';
      if (v !== null) last = v;
      return { value: v, change };
    });
    return { id: g.id, label: g.label, cells };
  });

  const newest = hi.breakdown?.freshness ?? null;
  const worstFinding = d.findings.rows.length ? Math.min(...d.findings.rows.map((r) => r.condition)) : null;
  return {
    found: true, id: towerId, asOf: snap.asOf,
    tower: { id: towerId, name: asset.name, lineId: asset.parent_id, lineName: snap.byId.get(asset.parent_id)?.name ?? asset.parent_id, kv: asset.voltage_kv, installed: asset.install_date, duplicate: snap.dupRecord.has(towerId), type: asset.ext?.tower_type ?? null, height: asset.ext?.height_m ?? null },
    assessed, hi: hi.score, band: bandOf(hi), reason: assessed ? null : sentence(b.reason ?? 'No evidence yet', snap.asOf),
    risk: d.riskFactors, cap: assessed ? b.cap : null,
    groups, newest: newest?.newestEvidenceDate ?? null, ageDays: newest?.newestEvidenceDate ? ageDays(newest.newestEvidenceDate, snap.asOf) : null, stale: Boolean(newest?.stale),
    findings: d.findings, worstFinding, worstWord: worstFinding ? SEVERITY[worstFinding].word : null,
    compare: { columns, rows },
    history: d.history,
    groupLabel: GROUP_LABEL,
  };
}
