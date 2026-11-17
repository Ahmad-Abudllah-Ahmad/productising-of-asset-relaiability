// Maintenance History model: the findings, work orders and repairs of one asset, one line, or everything, as plain
// objects. No DOM here; maintenanceHistory.js draws it and the tests read it directly.
//
// Everything is as of net.asOf. A repair is judged ineffective when the defect it closed (same component, same defect
// class) is sighted again afterwards. The health index before a repair is taken the day before it, the one after on the
// day of the repair, both from the evidence and repairs recorded up to that date.

const OWNER_CLASSES = new Set(['tower', 'span', 'power_transformer']);
const dayMs = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => new Date(toMs(d) + n * dayMs).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / dayMs);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);

export const WO_STATUSES = Object.freeze(['open', 'in_progress', 'completed']);
export const SEV_FILTERS = Object.freeze([['urgent', 'Critical and high'], ['all', 'All severities'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]);

/**
 * @param {object} net   the loaded network (loadNetwork): byId, towers, spans, transformers, findings, workOrders, repairs, snap, asOf
 * @param {{line?: string, unit?: string}} scope
 * @param {(id: string, date: string) => number|null} hiOn  health index of an asset as of a date (null when it has none)
 */
export function buildMaintenance(net, { line = '', unit = '' } = {}, hiOn = () => null) {
  const { byId, asOf } = net;
  const nameOf = (id) => byId.get(id)?.name ?? id;

  // the tower, span or transformer an asset belongs to, and the line that owner sits on
  const ownerMemo = new Map();
  const ownerOf = (id) => {
    if (ownerMemo.has(id)) return ownerMemo.get(id);
    let a = byId.get(id); let out = id;
    for (let i = 0; i < 6 && a; i += 1) { if (OWNER_CLASSES.has(a.class)) { out = a.asset_id; break; } a = a.parent_id ? byId.get(a.parent_id) : null; }
    ownerMemo.set(id, out);
    return out;
  };
  const lineMemo = new Map();
  const lineOf = (ownerId) => {
    if (lineMemo.has(ownerId)) return lineMemo.get(ownerId);
    let a = byId.get(ownerId); let out = null;
    while (a) { if (a.class === 'line') { out = a.asset_id; break; } a = a.parent_id ? byId.get(a.parent_id) : null; }
    lineMemo.set(ownerId, out);
    return out;
  };
  const inLine = (owner) => !line || lineOf(owner) === line;
  const inScope = (owner) => inLine(owner) && (!unit || owner === unit);

  const closedBy = new Map(); // finding id -> the first repair (as of asOf) that closed it
  for (const r of net.repairs) if (r.date <= asOf) for (const id of r.closes_finding_ids || []) if (!closedBy.has(id) || closedBy.get(id).date > r.date) closedBy.set(id, r);

  // ---- every finding as of asOf, with its owner
  const allFindings = net.findings.filter((f) => f.date <= asOf).map((f) => {
    const owner = ownerOf(f.asset_id);
    return {
      id: f.finding_id, date: f.date, campaignId: f.campaign_id, defectClass: f.defect_class, label: f.label, condition: f.condition_score, severity: f.severity, status: f.review_status,
      assetId: f.asset_id, assetName: f.assetName || nameOf(f.asset_id), ownerId: owner, ownerName: nameOf(owner), closed: closedBy.has(f.finding_id), rejected: f.review_status === 'rejected',
      counted: f.review_status !== 'rejected' && !closedBy.has(f.finding_id),
    };
  });
  const findings = allFindings.filter((f) => inScope(f.ownerId)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const findingById = new Map(allFindings.map((f) => [f.id, f]));

  // ---- repairs, with the health index just before and after, and whether the defect came back
  const repairs = net.repairs.filter((r) => r.date <= asOf).map((r) => {
    const owner = ownerOf(r.asset_id);
    const closes = (r.closes_finding_ids || []).map((id) => findingById.get(id)).filter(Boolean);
    const again = new Map();
    for (const c of closes) for (const x of allFindings) if (x.assetId === c.assetId && x.defectClass === c.defectClass && x.date > r.date && !x.rejected) again.set(x.id, x);
    const scored = hiOn(owner, asOf) !== null;
    const before = scored ? hiOn(owner, addDays(r.date, -1)) : null;
    const after = scored ? hiOn(owner, r.date) : null;
    return {
      id: r.repair_id, date: r.date, action: r.action, assetId: r.asset_id, assetName: nameOf(r.asset_id), ownerId: owner, ownerName: nameOf(owner), workOrderId: r.work_order_id, wo: r.wo,
      closes: closes.map((c) => ({ id: c.id, label: c.label, date: c.date, days: daysBetween(c.date, r.date) })),
      hiBefore: before, hiAfter: after, delta: before === null || after === null ? null : r1(after - before),
      effective: again.size === 0,
      seenAgain: [...again.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ id: x.id, date: x.date, label: x.label, daysAfter: daysBetween(r.date, x.date) })),
    };
  }).filter((r) => inScope(r.ownerId)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const ineffective = repairs.filter((r) => !r.effective);

  // ---- work orders as they stood at asOf
  const repairByWo = new Map(net.repairs.filter((r) => r.date <= asOf).map((r) => [r.work_order_id, r]));
  const workOrders = net.workOrders.filter((w) => w.created_at <= asOf).map((w) => {
    const owner = ownerOf(w.asset_id);
    const done = w.status === 'completed' && w.completed_at && w.completed_at <= asOf;
    const status = w.status === 'completed' && !done ? 'open' : w.status;
    return {
      id: w.id, type: w.work_type, priority: w.priority, status, assetId: w.asset_id, assetName: nameOf(w.asset_id), ownerId: owner, ownerName: nameOf(owner),
      created: w.created_at, planned: w.planned_date, completed: done ? w.completed_at : null, daysOpen: daysBetween(w.created_at, done ? w.completed_at : asOf),
      overdue: !done && Boolean(w.planned_date) && w.planned_date < asOf, findingIds: w.finding_ids || [], repairId: repairByWo.get(w.work_order_id)?.repair_id ?? null,
    };
  }).filter((w) => inScope(w.ownerId)).sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
  const statusCounts = Object.fromEntries(WO_STATUSES.map((s) => [s, workOrders.filter((w) => w.status === s).length]));

  const days = repairs.flatMap((r) => r.closes.map((c) => c.days));
  const woDays = workOrders.filter((w) => w.completed).map((w) => w.daysOpen);
  const turnaround = { findings: days.length, medianDays: median(days), meanDays: r1(mean(days)), maxDays: days.length ? Math.max(...days) : null, workOrders: woDays.length, woMedianDays: median(woDays), woMeanDays: r1(mean(woDays)) };

  // ---- the assets of the chosen line, with how much history each has (for the asset selector)
  const activity = new Map();
  for (const a of net.byId.values()) if (OWNER_CLASSES.has(a.class) && inLine(a.asset_id)) activity.set(a.asset_id, 0);
  const bump = (id) => { if (activity.has(id)) activity.set(id, activity.get(id) + 1); };
  for (const f of allFindings) if (!f.rejected) bump(f.ownerId);
  for (const r of net.repairs) if (r.date <= asOf) bump(ownerOf(r.asset_id));
  for (const w of net.workOrders) if (w.created_at <= asOf) bump(ownerOf(w.asset_id));
  const units = [...activity.keys()].map((id) => ({ id, name: nameOf(id), class: byId.get(id).class.replace(/_/g, ' '), events: activity.get(id) }))
    .sort((a, b) => a.class.localeCompare(b.class) || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // ---- counts at each campaign date, for the KPI sparklines
  const campaigns = (net.snap.campaigns || []).filter((c) => c.start <= asOf).slice().sort((a, b) => a.end.localeCompare(b.end));
  const series = campaigns.map((c) => ({
    workOrders: workOrders.filter((w) => w.created <= c.end).length,
    repairs: repairs.filter((r) => r.date <= c.end).length,
    ineffective: ineffective.filter((r) => r.date <= c.end).length,
    open: findings.filter((f) => !f.rejected && f.date <= c.end && !(closedBy.get(f.id) && closedBy.get(f.id).date <= c.end)).length,
  }));

  // ---- the health index of the chosen asset (before and after each repair) or line (at each campaign)
  let trend = null;
  const target = unit || line;
  if (target && hiOn(target, asOf) !== null) {
    const points = campaigns.map((c) => ({ date: c.end, kind: 'campaign', name: c.name, hi: hiOn(target, c.end) }));
    if (unit) for (const r of repairs) if (r.hiBefore !== null || r.hiAfter !== null) points.push({ date: addDays(r.date, -1), kind: 'before', repairId: r.id, hi: r.hiBefore }, { date: r.date, kind: 'after', repairId: r.id, hi: r.hiAfter });
    points.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'before' ? -1 : 1));
    trend = { targetId: target, targetName: nameOf(target), perRepair: Boolean(unit), points };
  }

  // ---- no single asset: counts by campaign and by month, and the assets with the most activity
  let aggregate = null;
  if (!unit) {
    const month = (d) => d.slice(0, 7);
    const sevs = ['critical', 'high', 'medium', 'low'];
    const perCampaign = campaigns.map((c) => {
      const mine = findings.filter((f) => f.campaignId === c.campaign_id);
      return { id: c.campaign_id, name: c.name, counts: Object.fromEntries(sevs.map((s) => [s, { open: mine.filter((f) => f.severity === s && !f.rejected && !f.closed).length, closed: mine.filter((f) => f.severity === s && !f.rejected && f.closed).length }])), total: mine.filter((f) => !f.rejected).length };
    });
    const first = [...findings.map((f) => f.date), ...workOrders.map((w) => w.created), ...repairs.map((r) => r.date)].sort()[0] ?? asOf;
    const months = [];
    for (let [y, mo] = first.slice(0, 7).split('-').map(Number); `${y}-${String(mo).padStart(2, '0')}` <= month(asOf); mo += 1) { if (mo > 12) { mo = 1; y += 1; } months.push(`${y}-${String(mo).padStart(2, '0')}`); }
    const lastDay = (mm) => { if (mm === month(asOf)) return asOf; const d = new Date(`${mm}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
    const perMonth = months.map((mm) => {
      const end = lastDay(mm);
      return {
        month: mm, raised: workOrders.filter((w) => month(w.created) === mm).length, completed: workOrders.filter((w) => w.completed && month(w.completed) === mm).length,
        backlog: workOrders.filter((w) => w.created <= end && !(w.completed && w.completed <= end)).length,
        findings: findings.filter((f) => !f.rejected && month(f.date) === mm).length,
        closedFindings: repairs.filter((r) => month(r.date) === mm).reduce((n, r) => n + r.closes.length, 0),
        repairs: repairs.filter((r) => month(r.date) === mm && r.effective).length, ineffective: repairs.filter((r) => month(r.date) === mm && !r.effective).length,
      };
    });
    const busy = new Map();
    const row = (id) => busy.get(id) ?? busy.set(id, { id, findings: 0, workOrders: 0, repairs: 0, ineffective: 0, open: 0 }).get(id);
    for (const f of findings) if (!f.rejected) { row(f.ownerId).findings += 1; if (f.counted) row(f.ownerId).open += 1; }
    for (const w of workOrders) row(w.ownerId).workOrders += 1;
    for (const r of repairs) { row(r.ownerId).repairs += 1; if (!r.effective) row(r.ownerId).ineffective += 1; }
    const busiest = [...busy.values()].map((x) => ({ ...x, name: nameOf(x.id), class: byId.get(x.id).class.replace(/_/g, ' '), line: lineOf(x.id), activity: x.findings + x.workOrders }))
      .sort((a, b) => b.activity - a.activity || a.id.localeCompare(b.id, undefined, { numeric: true })).slice(0, 10);
    aggregate = { perCampaign, perMonth, busiest };
  }

  // ---- one asset: a row per defect (a component and a defect class) with each sighting, work order, repair and re-sighting
  let defects = null;
  if (unit) {
    const groups = new Map();
    for (const f of findings) { const key = `${f.assetId}|${f.defectClass}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(f); }
    defects = [...groups.values()].map((list) => {
      const ids = new Set(list.map((f) => f.id));
      const reps = repairs.filter((r) => r.closes.some((c) => ids.has(c.id))).sort((a, b) => a.date.localeCompare(b.date));
      const wos = workOrders.filter((w) => w.findingIds.some((id) => ids.has(id))).sort((a, b) => a.created.localeCompare(b.created));
      const head = list[0];
      return {
        key: head.id, component: head.assetName, className: head.label, firstDate: head.date,
        sightings: list.map((f) => ({ id: f.id, date: f.date, severity: f.severity, status: f.status, closed: f.closed, label: f.label, again: reps.some((r) => !r.effective && f.date > r.date) })),
        workOrders: wos.map((w) => ({ id: w.id, type: w.type, created: w.created, to: w.completed ?? asOf, completed: w.completed, status: w.status })),
        repairs: reps.map((r) => ({ id: r.id, date: r.date, action: r.action, effective: r.effective })),
        cameBack: reps.some((r) => !r.effective),
      };
    }).sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.key.localeCompare(b.key));
  }

  const open = findings.filter((f) => f.counted).length;
  const unreviewed = findings.filter((f) => f.counted && f.status === 'pending').length;
  const dates = [...findings.map((f) => f.date), ...workOrders.map((w) => w.created), ...repairs.map((r) => r.date), ...campaigns.map((c) => c.start)].sort();
  return {
    asOf, line, unit, units, findings, repairs, workOrders, statusCounts, turnaround, ineffective, open, unreviewed, series, campaigns,
    overdue: workOrders.filter((w) => w.overdue).length, trend, aggregate, defects,
    range: { from: dates[0] ?? addDays(asOf, -365), to: asOf },
    empty: !findings.length && !repairs.length && !workOrders.length,
  };
}
