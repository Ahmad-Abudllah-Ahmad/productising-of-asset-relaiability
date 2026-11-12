// Maintenance History: the findings, work orders and repairs of an asset (or a line, or everything), as plain objects.
// No DOM here. historyScreens.js renders it; the tests read it directly.
//
// Everything is as of snap.asOf. A repair is judged ineffective when the defect it closed is sighted again afterwards,
// found through the confirmed same-defect links between findings (the repeat-sighting links of Phase 3). The seed's
// ground truth says which repairs are ineffective; the tests compare the two, the screen never reads it.

import { healthIndex } from '../domain/health/healthIndex.js';
import { DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { SEVERITY } from './assetModel.js';
import { listLines } from './healthModel.js';

const OWNERS = new Set(['tower', 'span', 'power_transformer']);
const LABEL = Object.fromEntries([...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => [d.id, d.label]));
const dayMs = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (date, n) => new Date(toMs(date) + n * dayMs).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / dayMs);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
const nameOf = (snap, id) => snap.byId.get(id)?.name ?? id;

export const WO_STATUSES = Object.freeze(['open', 'in_progress', 'completed', 'cancelled']);

/** The line an asset sits on, walking up its parents; null for transformers, bays and stations. */
function lineOf(snap, id, memo) {
  if (memo.has(id)) return memo.get(id);
  let cur = snap.byId.get(id);
  let line = null;
  while (cur) { if (cur.class === 'line') { line = cur.asset_id; break; } cur = cur.parent_id ? snap.byId.get(cur.parent_id) : null; }
  memo.set(id, line);
  return line;
}

/** Connected groups of findings that show the same defect in different campaigns (confirmed links only). */
function chains(snap) {
  const adj = new Map();
  for (const l of snap.links) {
    if (l.type !== 'same_asset' || l.relation !== 'same_defect' || l.status !== 'confirmed' || l.obsolete || l.from_kind !== 'finding') continue;
    for (const [a, b] of [[l.from_asset, l.to_asset], [l.to_asset, l.from_asset]]) (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b);
  }
  const memo = new Map();
  return (id) => {
    if (memo.has(id)) return memo.get(id);
    const seen = new Set([id]);
    const stack = [id];
    while (stack.length) for (const n of adj.get(stack.pop()) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    for (const m of seen) memo.set(m, seen);
    return seen;
  };
}

/** What a thumbnail needs: the capture image and the box (a demo image, until there is a real one). */
export const thumbOf = (snap, f) => ({ id: f.finding_id, label: LABEL[f.defect_class] ?? f.defect_class.replace(/_/g, ' '), image: snap.captures.get(f.capture_id)?.image ?? null, bbox: f.bbox ?? null, sensor: f.sensor });

const findingView = (snap, f) => ({ thumb: thumbOf(snap, f),
  id: f.finding_id, date: f.date, campaignId: f.campaign_id, defectClass: f.defect_class, label: LABEL[f.defect_class] ?? f.defect_class.replace(/_/g, ' '),
  condition: f.condition_score, severity: SEVERITY[f.condition_score].word, status: f.review_status,
  assetId: f.asset_id, assetName: nameOf(snap, f.asset_id),
});

/**
 * @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap
 * @param {{line?: string|null, unit?: string|null}} [scope]
 */
export function loadHistory(snap, { line = null, unit = null } = {}) {
  const { ctx, asOf } = snap;
  const lineMemo = new Map();
  const ownerOf = (id) => ctx.ownerOf(id) ?? id;
  const inLine = (ownerId) => !line || lineOf(snap, ownerId, lineMemo) === line;
  const inScope = (ownerId) => inLine(ownerId) && (!unit || ownerId === unit);

  const sameDefect = chains(snap);
  const repairsAll = snap.repairs.filter((r) => r.date <= asOf && snap.inScope(r.asset_id));
  const woAll = snap.workOrders.filter((w) => w.created_at <= asOf && snap.inScope(w.asset_id));
  const ownerIds = snap.assets.filter((a) => OWNERS.has(a.class)).map((a) => a.asset_id);

  // ---- the units on the chosen line (for the asset selector), with how much history each has. Duplicate records are not offered.
  const activity = new Map();
  const bump = (id) => activity.set(id, (activity.get(id) ?? 0) + 1);
  for (const id of ownerIds) if (inLine(id) && !snap.dupRecord.has(id)) { activity.set(id, 0); for (const _ of ctx.findingsFor(id, asOf).evidence) bump(id); }
  for (const r of repairsAll) if (activity.has(ownerOf(r.asset_id))) bump(ownerOf(r.asset_id));
  for (const w of woAll) if (activity.has(ownerOf(w.asset_id))) bump(ownerOf(w.asset_id));
  const units = [...activity.keys()].map((id) => { const a = snap.byId.get(id); return { id, name: a.name, class: a.class.replace(/_/g, ' '), events: activity.get(id) }; })
    .sort((a, b) => a.class.localeCompare(b.class) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // ---- findings
  const findings = [];
  let open = 0; let unreviewed = 0;
  for (const id of ownerIds) {
    if (!inScope(id)) continue;
    const f = ctx.findingsFor(id, asOf);
    open += f.counted.length; unreviewed += f.unreviewed.length;
    for (const x of f.evidence) findings.push({ ...findingView(snap, x), ownerId: id, ownerName: nameOf(snap, id), counted: f.counted.includes(x), closed: f.closed.includes(x) });
  }
  findings.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // ---- repairs, with the health index just before and just after, and whether the defect came back
  const repairs = repairsAll.filter((r) => inScope(ownerOf(r.asset_id))).map((r) => {
    const owner = ownerOf(r.asset_id);
    const scored = snap.scores.has(owner);
    const before = scored ? healthIndex(ctx, owner, addDays(r.date, -1)).score : null;
    const after = scored ? healthIndex(ctx, owner, r.date).score : null;
    const closes = r.closes_finding_ids.map((id) => snap.findingsById.get(id)).filter(Boolean);
    const again = new Map();
    for (const c of closes) for (const id of sameDefect(c.finding_id)) {
      const x = snap.findingsById.get(id);
      if (x && x.date > r.date && x.date <= asOf && x.review_status !== 'rejected') again.set(id, x);
    }
    const wo = snap.workOrders.find((w) => w.work_order_id === r.work_order_id) ?? null;
    return {
      id: r.repair_id, date: r.date, action: r.action, assetId: r.asset_id, assetName: nameOf(snap, r.asset_id), ownerId: owner, ownerName: nameOf(snap, owner),
      workOrderId: r.work_order_id, priority: wo?.priority ?? null,
      closes: closes.map((c) => ({ thumb: thumbOf(snap, c), id: c.finding_id, label: LABEL[c.defect_class] ?? c.defect_class, date: c.date, days: daysBetween(c.date, r.date) })),
      hiBefore: before, hiAfter: after, delta: before === null || after === null ? null : r1(after - before),
      effective: again.size === 0,
      seenAgain: [...again.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ id: x.finding_id, date: x.date, label: LABEL[x.defect_class] ?? x.defect_class, daysAfter: daysBetween(r.date, x.date) })),
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  // ---- work orders as they stood at asOf
  const repairByWo = new Map(repairsAll.map((r) => [r.work_order_id, r]));
  const workOrders = woAll.filter((w) => inScope(ownerOf(w.asset_id))).map((w) => {
    const done = w.status === 'completed' && w.completed_at && w.completed_at <= asOf;
    const status = w.status === 'completed' && !done ? 'open' : w.status;
    const end = done ? w.completed_at : asOf;
    return {
      id: w.work_order_id, type: w.work_type, priority: w.priority, status, assetId: w.asset_id, assetName: nameOf(snap, w.asset_id), ownerId: ownerOf(w.asset_id),
      ownerName: nameOf(snap, ownerOf(w.asset_id)), created: w.created_at, planned: w.planned_date, completed: done ? w.completed_at : null,
      daysOpen: daysBetween(w.created_at, end), overdue: !done && status !== 'cancelled' && w.planned_date < asOf, findingIds: w.finding_ids, thumbs: w.finding_ids.map((id) => snap.findingsById.get(id)).filter(Boolean).map((f) => thumbOf(snap, f)),
      repairId: repairByWo.get(w.work_order_id)?.repair_id ?? null,
    };
  }).sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id));

  const statusCounts = Object.fromEntries(WO_STATUSES.map((s) => [s, workOrders.filter((w) => w.status === s).length]));
  const days = repairs.flatMap((r) => r.closes.map((c) => c.days));
  const woDays = workOrders.filter((w) => w.completed).map((w) => w.daysOpen);
  const turnaround = { findings: days.length, medianDays: median(days), meanDays: r1(mean(days)), maxDays: days.length ? Math.max(...days) : null,
    workOrders: woDays.length, woMedianDays: median(woDays), woMeanDays: r1(mean(woDays)) };
  const ineffective = repairs.filter((r) => !r.effective);

  // ---- cumulative counts at each campaign date and today, for the KPI sparklines
  const series = snap.dates.map((d) => ({
    workOrders: workOrders.filter((w) => w.created <= d).length,
    repairs: repairs.filter((r) => r.date <= d).length,
    ineffective: ineffective.filter((r) => r.date <= d).length,
    open: ownerIds.filter(inScope).reduce((n, id) => n + ctx.findingsFor(id, d).counted.length, 0),
  }));

  // ---- the health index of the chosen unit (before and after each repair) or line (at each campaign)
  let trend = null;
  const target = unit ?? line;
  if (target && snap.scores.has(target)) {
    const points = [];
    const campaignDates = snap.dates;
    for (const d of campaignDates) points.push({ date: d, kind: d === asOf && !snap.campaigns.some((c) => c.end === d) ? 'today' : 'campaign', hi: healthIndex(ctx, target, d).score });
    if (unit) for (const r of repairs) if (r.hiBefore !== null || r.hiAfter !== null) points.push({ date: addDays(r.date, -1), kind: 'before', repairId: r.id, hi: r.hiBefore }, { date: r.date, kind: 'after', repairId: r.id, hi: r.hiAfter });
    points.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'before' ? -1 : 1));
    trend = { targetId: target, targetName: nameOf(snap, target), perRepair: Boolean(unit), points };
  }

  // ---- no single asset: counts by campaign and by month, and the busiest assets (nothing is drawn one by one)
  const month = (d) => d.slice(0, 7);
  let aggregate = null;
  if (!unit) {
    const sevs = [1, 2, 3, 4];
    const perCampaign = snap.campaigns.filter((c) => c.start <= asOf).map((c) => {
      const mine = findings.filter((f) => f.campaignId === c.campaign_id);
      const cell = (cond, closed) => mine.filter((f) => f.condition === cond && f.status !== 'rejected' && f.closed === closed).length;
      return { id: c.campaign_id, name: c.name, start: c.start, end: c.end, counts: Object.fromEntries(sevs.map((n) => [n, { open: cell(n, false), closed: cell(n, true) }])), rejected: mine.filter((f) => f.status === 'rejected').length, total: mine.filter((f) => f.status !== 'rejected').length };
    });
    const first = [...workOrders.map((w) => w.created), ...repairs.map((r) => r.date)].sort()[0] ?? asOf;
    const months = [];
    for (let [y, mo] = first.slice(0, 7).split('-').map(Number); `${y}-${String(mo).padStart(2, '0')}` <= month(asOf); mo += 1) { if (mo > 12) { mo = 1; y += 1; } months.push(`${y}-${String(mo).padStart(2, '0')}`); }
    const lastDay = (mm) => { if (mm === month(asOf)) return asOf; const d = new Date(`${mm}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
    const perMonth = months.map((mm) => {
      const end = lastDay(mm);
      return {
        month: mm, raised: workOrders.filter((w) => month(w.created) === mm).length, completed: workOrders.filter((w) => w.completed && month(w.completed) === mm).length,
        backlog: workOrders.filter((w) => w.created <= end && !(w.completed && w.completed <= end) && w.status !== 'cancelled').length,
        repairs: repairs.filter((r) => month(r.date) === mm && r.effective).length, ineffective: repairs.filter((r) => month(r.date) === mm && !r.effective).length,
      };
    });
    const busy = new Map();
    const row = (id) => busy.get(id) ?? busy.set(id, { id, findings: 0, workOrders: 0, repairs: 0, ineffective: 0, open: 0 }).get(id);
    for (const f of findings) if (f.status !== 'rejected') { row(f.ownerId).findings += 1; if (f.counted) row(f.ownerId).open += 1; }
    for (const w of workOrders) row(w.ownerId).workOrders += 1;
    for (const r of repairs) { row(r.ownerId).repairs += 1; if (!r.effective) row(r.ownerId).ineffective += 1; }
    const busiest = [...busy.values()].map((x) => { const a = snap.byId.get(x.id); return { ...x, name: a.name, class: a.class.replace(/_/g, ' '), line: lineOf(snap, x.id, lineMemo), activity: x.findings + x.workOrders }; })
      .sort((a, b) => b.activity - a.activity || a.id.localeCompare(b.id, undefined, { numeric: true })).slice(0, 10);
    aggregate = { perCampaign, perMonth, busiest };
  }

  // ---- one asset: a row per defect (a component and a class), with each sighting, the work order, the repair and any re-sighting
  let defects = null;
  if (unit) {
    // one row per component and defect class; sightings of the same component and class are the same defect
    const groups = new Map();
    for (const f of findings) {
      const key = `${f.assetId}|${f.defectClass}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push(f);
    }
    defects = [...groups.values()].map((list) => {
      list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const ids = new Set(list.map((f) => f.id));
      const reps = repairs.filter((r) => r.closes.some((c) => ids.has(c.id))).sort((a, b) => a.date.localeCompare(b.date));
      const wos = workOrders.filter((w) => w.findingIds.some((id) => ids.has(id))).sort((a, b) => a.created.localeCompare(b.created));
      const firstRepair = reps[0]?.date ?? null;
      const head = list[0];
      return {
        key: head.id, label: `${head.assetName} · ${head.label}`, component: head.assetName, className: head.label,
        sightings: list.map((f) => ({ id: f.id, date: f.date, condition: f.condition, severity: f.severity, status: f.status, closed: f.closed, counted: f.counted, label: f.label, again: reps.some((r) => !r.effective && f.date > r.date) })),
        workOrders: wos.map((w) => ({ id: w.id, type: w.type, created: w.created, to: w.completed ?? asOf, completed: w.completed, status: w.status })),
        repairs: reps.map((r) => ({ id: r.id, date: r.date, action: r.action, effective: r.effective })),
        cameBack: reps.some((r) => !r.effective), firstDate: head.date, firstRepair,
      };
    }).sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.key.localeCompare(b.key));
  }

  const dates = [...findings.map((f) => f.date), ...workOrders.map((w) => w.created), ...repairs.map((r) => r.date), ...snap.campaigns.map((c) => c.start)].sort();
  return {
    found: true, asOf, line, unit, units, lines: listLines(snap),
    findings, repairs, workOrders, aggregate, defects, statusCounts, turnaround, ineffective: ineffective.map((r) => r.id),
    open, unreviewed, series,
    overdue: workOrders.filter((w) => w.overdue).length,
    campaigns: snap.campaigns.filter((c) => c.start <= asOf).map((c) => ({ id: c.campaign_id, name: c.name, start: c.start, end: c.end })),
    range: { from: dates[0] ?? addDays(asOf, -365), to: asOf },
    trend, empty: !findings.length && !repairs.length && !workOrders.length,
  };
}
