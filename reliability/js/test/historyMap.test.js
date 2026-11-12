import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadHistory, addDays, daysBetween, WO_STATUSES } from '../app/historyModel.js';
import { loadMap, inPolygon, parseLayers, layersParam, LAYERS } from '../app/mapModel.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { risk } from '../domain/risk.js';

const seed = generateSeed();
const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
const ready = async (repo = make()) => ({ repo, snap: await loadSnapshot(repo) });

// ------------------------------------------------------------------------------------------ Maintenance History

test('history: dates are plain day arithmetic', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-02-25', '2026-06-25'), 120);
});

test('history, everything: counts match the data, work orders by status, and nothing after the as-of date', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap);
  assert.deepEqual([m.findings.length, m.repairs.length, m.workOrders.length], [400, 85, 127]);
  assert.deepEqual(Object.keys(m.statusCounts), WO_STATUSES);
  assert.equal(Object.values(m.statusCounts).reduce((a, b) => a + b, 0), m.workOrders.length);
  assert.ok(m.findings.every((f) => f.date <= snap.asOf) && m.repairs.every((r) => r.date <= snap.asOf));
  assert.equal(m.open, snap.assets.filter((a) => ['tower', 'span', 'power_transformer'].includes(a.class)).reduce((n, a) => n + (snap.findingsByOwner.get(a.asset_id)?.length ?? 0), 0));
  assert.equal(m.series.at(-1).open, m.open);
  assert.equal(m.series.at(-1).repairs, m.repairs.length);
  assert.equal(m.trend, null, 'no single score for all lines together');
});

test('history: turnaround from finding to repair, and from a work order being raised to done', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap);
  const days = m.repairs.flatMap((r) => r.closes.map((c) => c.days));
  assert.equal(m.turnaround.findings, days.length);
  assert.ok(days.every((d) => d >= 0));
  assert.equal(m.turnaround.maxDays, Math.max(...days));
  const done = m.workOrders.filter((w) => w.completed);
  assert.equal(m.turnaround.workOrders, done.length);
  assert.ok(done.every((w) => w.daysOpen === daysBetween(w.created, w.completed)));
  assert.ok(m.workOrders.filter((w) => !w.completed).every((w) => w.daysOpen === daysBetween(w.created, snap.asOf)));
  assert.equal(m.overdue, m.workOrders.filter((w) => w.overdue).length);
  assert.ok(m.workOrders.filter((w) => w.overdue).every((w) => w.status !== 'completed' && w.planned < snap.asOf));
});

test('history: the health index before and after a repair is the score as of the day before and the repair day', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap, { unit: 'TWR-132-01-011' });
  assert.equal(m.repairs.length, 1);
  const r = m.repairs[0];
  assert.deepEqual([r.id, r.date, r.hiBefore, r.hiAfter, r.delta], ['RPR-0071', '2026-06-25', 33.2, 34.6, 1.4]);
  assert.equal(r.hiBefore, healthIndex(snap.ctx, 'TWR-132-01-011', '2026-06-24').score);
  assert.equal(r.hiAfter, healthIndex(snap.ctx, 'TWR-132-01-011', '2026-06-25').score);
  assert.equal(r.effective, true);
  assert.deepEqual(m.trend.points.map((p) => [p.date, p.kind]), [['2026-02-25', 'campaign'], ['2026-05-27', 'campaign'], ['2026-06-24', 'before'], ['2026-06-25', 'after'], ['2026-10-28', 'campaign'], ['2026-11-11', 'today']]);
});

test('history: ineffective repairs are found through the repeat-sighting links, and agree with the seed\'s ground truth', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap);
  const truth = new Map(seed.groundTruth.repairs.map((r) => [r.repair_id, r.effective]));
  const found = new Set(m.ineffective);
  const bad = [...truth].filter(([, ok]) => ok === false).map(([id]) => id);
  const hit = bad.filter((id) => found.has(id)).length;
  assert.equal([...found].filter((id) => truth.get(id) !== false).length, 0, 'no repair is flagged that the seed says held');
  assert.ok(hit >= 13 && hit / bad.length >= 0.85, `found ${hit} of ${bad.length} ineffective repairs`);
  const r = m.repairs.find((x) => !x.effective);
  assert.ok(r.seenAgain.length > 0 && r.seenAgain.every((x) => x.date > r.date && x.daysAfter > 0));
});

test('history: a repair is not ineffective just because a different defect shows up later', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap, { unit: 'TWR-132-01-011' });
  // the earthwire has 3 sightings; the repair on the insulator string closed an insulator finding only
  assert.equal(m.repairs[0].effective, true);
  assert.ok(m.findings.some((f) => f.date > m.repairs[0].date), 'other findings came later');
});

test('history: line and unit narrow everything; transformers belong to no line', async () => {
  const { snap } = await ready();
  const all = loadHistory(snap);
  const l = loadHistory(snap, { line: 'L-132-01' });
  assert.ok(l.repairs.length < all.repairs.length && l.repairs.every((r) => /-132-01-/.test(r.ownerId)));
  assert.ok(l.units.every((u) => /-132-01-/.test(u.id)) && l.units.some((u) => u.id === 'TWR-132-01-011'));
  assert.ok(loadHistory(snap, { line: 'L-132-01' }).trend.points.length === 4, 'the line score at each campaign and today');
  const tx = all.units.filter((u) => u.class === 'power transformer');
  assert.ok(tx.length > 0 && !l.units.some((u) => u.class === 'power transformer'));
  const t = loadHistory(snap, { unit: tx[0].id });
  assert.ok(t.findings.every((f) => f.ownerId === tx[0].id));
});

test('history: a reviewer decision moves the numbers (reject a finding and the open count drops)', async () => {
  const repo = make();
  const a = loadHistory((await ready(repo)).snap, { unit: 'TWR-132-01-010' });
  await repo.rejectFinding('F-0090', { reason: 'Wrong location' });
  const b = loadHistory((await ready(repo)).snap, { unit: 'TWR-132-01-010' });
  assert.equal(b.open, a.open - 1);
  assert.equal(b.findings.find((f) => f.id === 'F-0090').status, 'rejected');
});

test('history: an empty selection says so', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap, { line: 'L-132-01', unit: 'TWR-132-01-041' });
  assert.equal(m.empty, true);
});

// ----------------------------------------------------------------------------------------------------- Risk Map

test('map: layers parse from the hash; no key means all, unknown names are dropped, all-on writes no key', () => {
  assert.deepEqual([...parseLayers(null)].sort(), [...LAYERS].sort());
  assert.deepEqual([...parseLayers('spans,towers,bogus')].sort(), ['spans', 'towers']);
  assert.equal(layersParam(new Set(LAYERS)), null);
  assert.equal(layersParam(new Set(['towers', 'spans'])), 'spans,towers');
});

test('map: point in polygon', () => {
  const sq = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }];
  assert.equal(inPolygon({ lat: 5, lng: 5 }, sq), true);
  assert.equal(inPolygon({ lat: 11, lng: 5 }, sq), false);
  assert.equal(inPolygon({ lat: 5, lng: -1 }, sq), false);
});

test('map: spans, towers, substations and findings, coloured by the Phase 2 scores; duplicate records are not drawn', async () => {
  const { snap } = await ready();
  const m = loadMap(snap);
  assert.deepEqual([m.towers.length, m.spans.length, m.stations.length, m.transformers.length], [154, 151, 2, 7]);
  assert.ok(m.towers.every((t) => !t.id.startsWith('MX-')));
  for (const t of m.towers) { const hi = snap.scores.get(t.id).hi; assert.equal(t.hi, hi.score); assert.equal(t.band, hi.score === null ? 'none' : hi.band); }
  assert.deepEqual(m.towers.filter((t) => t.band === 'none').map((t) => t.id).sort(), ['TWR-132-01-041', 'TWR-132-01-042', 'TWR-132-01-043', 'TWR-132-01-044']);
  assert.equal(m.findings.length, 218);
  assert.ok(m.findings.every((f) => f.lat && f.lng && f.condition >= 1));
  assert.equal(m.counts.poor, m.towers.filter((t) => t.hi !== null && t.hi < 40).length);
});

test('map: a substation has no score, so it takes the band of its worst transformer', async () => {
  const { snap } = await ready();
  const m = loadMap(snap);
  const order = ['poor', 'moderate', 'normal', 'none'];
  for (const s of m.stations) {
    assert.equal(s.hi, null);
    const worst = s.transformers.map((t) => t.band).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    assert.equal(s.band, worst);
  }
  assert.deepEqual(m.stations.map((s) => [s.id, s.transformers.length]), [['SUB-S1', 3], ['SUB-S2', 4]]);
});

test('map: the label highlight is everything that carries the label, of any category', async () => {
  const { snap } = await ready();
  const m = loadMap(snap, { label: 'corridor:corridor-coastal' });
  const want = snap.assets.filter((a) => a.labels.includes('corridor:corridor-coastal')).map((a) => a.asset_id);
  assert.equal(m.highlighted.size, want.length);
  assert.ok(want.every((id) => m.highlighted.has(id)));
  assert.ok(m.labels.find((l) => l.id === 'corridor:corridor-coastal').count > 0);
  assert.equal(loadMap(snap).highlighted, null);
  assert.ok(!m.labels.some((l) => l.kind === 'failure_mode'));
});

test('map: the lasso lists what is inside, highest risk first, and adds up the risk of what has a score', async () => {
  const { snap } = await ready();
  const m = loadMap(snap);
  const box = (ids) => { const p = ids.map((id) => m.towers.find((t) => t.id === id)); const lat = p.map((x) => x.lat); const lng = p.map((x) => x.lng); const e = 0.0004; return [{ lat: Math.min(...lat) - e, lng: Math.min(...lng) - e }, { lat: Math.min(...lat) - e, lng: Math.max(...lng) + e }, { lat: Math.max(...lat) + e, lng: Math.max(...lng) + e }, { lat: Math.max(...lat) + e, lng: Math.min(...lng) - e }]; };
  const sel = m.select(box(['TWR-132-01-010', 'TWR-132-01-011', 'TWR-132-01-012']));
  const ids = sel.items.map((x) => x.id);
  for (const id of ['TWR-132-01-010', 'TWR-132-01-011', 'TWR-132-01-012']) assert.ok(ids.includes(id), id);
  assert.ok(ids.some((id) => id.startsWith('SPN-')), 'spans count by their midpoint');
  const risks = sel.items.filter((x) => x.risk !== null).map((x) => x.risk);
  assert.deepEqual(risks, [...risks].sort((a, b) => b - a));
  assert.equal(sel.total, Math.round(risks.reduce((a, b) => a + b, 0) * 10) / 10);
  assert.equal(sel.items.find((x) => x.id === 'TWR-132-01-011').risk, risk(snap.ctx, 'TWR-132-01-011', snap.asOf).score);
  assert.equal(sel.scored, risks.length);
  assert.deepEqual(m.select([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }]).items, []);
});

test('map: the totals and the highest-risk asset', async () => {
  const { snap } = await ready();
  const m = loadMap(snap);
  const all = [...m.towers, ...m.spans, ...m.transformers].filter((x) => x.risk !== null);
  assert.equal(m.totalRisk, Math.round(all.reduce((n, x) => n + x.risk, 0)));
  assert.equal(m.top.risk, Math.max(...all.map((x) => x.risk)));
  assert.equal(m.riskSeries.length, snap.dates.length);
  assert.ok(m.bounds[0][0] < m.bounds[1][0] && m.bounds[0][1] < m.bounds[1][1]);
});

// ------------------------------------------------------------------- Maintenance History: the two timeline views

test('history, fleet: findings per campaign by severity, open or closed by a repair; rejected ones are counted apart', async () => {
  const { snap } = await ready();
  const a = loadHistory(snap).aggregate;
  assert.deepEqual(a.perCampaign.map((c) => c.name), ['2026 Q1', '2026 Q2', '2026 Q4']);
  const all = loadHistory(snap).findings;
  for (const c of a.perCampaign) {
    const mine = all.filter((f) => f.campaignId === c.id);
    assert.equal(c.total, mine.filter((f) => f.status !== 'rejected').length);
    assert.equal(c.rejected, mine.filter((f) => f.status === 'rejected').length);
    const cells = Object.values(c.counts).flatMap((x) => [x.open, x.closed]);
    assert.equal(cells.reduce((p, q) => p + q, 0), c.total);
    for (const n of [1, 2, 3, 4]) {
      assert.equal(c.counts[n].closed, mine.filter((f) => f.condition === n && f.status !== 'rejected' && f.closed).length);
      assert.equal(c.counts[n].open, mine.filter((f) => f.condition === n && f.status !== 'rejected' && !f.closed).length);
    }
  }
  assert.equal(a.perCampaign.reduce((n, c) => n + c.total, 0) + a.perCampaign.reduce((n, c) => n + c.rejected, 0), 400);
});

test('history, fleet: work orders raised and completed per month, the open backlog, and repairs per month with the ineffective ones apart', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap);
  const pm = m.aggregate.perMonth;
  assert.equal(pm[0].month, '2026-02');
  assert.equal(pm.at(-1).month, '2026-11');
  assert.equal(pm.reduce((n, x) => n + x.raised, 0), m.workOrders.length);
  assert.equal(pm.reduce((n, x) => n + x.completed, 0), m.statusCounts.completed);
  assert.equal(pm.reduce((n, x) => n + x.repairs + x.ineffective, 0), m.repairs.length);
  assert.equal(pm.reduce((n, x) => n + x.ineffective, 0), m.ineffective.length);
  assert.equal(pm.at(-1).backlog, m.statusCounts.open + m.statusCounts.in_progress, 'at the as-of date the backlog is what is still open');
  pm.forEach((x, i) => { if (i) assert.equal(x.backlog, pm[i - 1].backlog + x.raised - x.completed, x.month); });
});

test('history, fleet: the ten assets with the most findings and work orders, and the same for one line', async () => {
  const { snap } = await ready();
  const b = loadHistory(snap).aggregate.busiest;
  assert.equal(b.length, 10);
  assert.deepEqual(b.map((x) => x.activity), [...b.map((x) => x.activity)].sort((p, q) => q - p));
  assert.equal(b[0].activity, b[0].findings + b[0].workOrders);
  const l = loadHistory(snap, { line: 'L-132-01' }).aggregate.busiest;
  assert.ok(l.every((x) => x.line === 'L-132-01') && l[0].id === 'TWR-132-01-013');
  assert.equal(loadHistory(snap, { unit: 'TWR-132-01-013' }).aggregate, null, 'one asset: no fleet counts');
});

test('history, one asset: a row per component and defect class, with sightings, work orders, repairs and re-sightings', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap, { unit: 'TWR-132-01-013' });
  assert.equal(m.aggregate, null);
  assert.deepEqual(m.defects.map((d) => d.label), ['T-013 · Earthwire damaged', 'T-013 · Steel corrosion', 'T-013 · Insulator flashover mark']);
  const steel = m.defects[1];
  assert.deepEqual(steel.repairs.map((r) => [r.id, r.effective]), [['RPR-0038', false], ['RPR-0073', true]]);
  assert.equal(steel.cameBack, true);
  assert.deepEqual(steel.sightings.map((s) => s.again), [false, true], 'the later sighting came after the repair that did not hold');
  assert.equal(steel.workOrders.length, 2);
  assert.ok(steel.sightings.every((s) => s.date <= snap.asOf));
  assert.equal(m.defects.flatMap((d) => d.sightings).length, m.findings.length, 'every finding is on exactly one row');
  assert.deepEqual(m.defects.map((d) => d.firstDate), [...m.defects.map((d) => d.firstDate)].sort());
});

test('history, one asset: an asset that was never inspected has no rows and an empty selection', async () => {
  const { snap } = await ready();
  const m = loadHistory(snap, { unit: 'TWR-132-01-041' });
  assert.deepEqual([m.empty, m.defects.length, m.findings.length], [true, 0, 0]);
  assert.ok(m.units.some((u) => u.id === 'TWR-132-01-041' && u.events === 0), 'it is still offered, in the group with no history');
  assert.equal(snap.ctx.coverageDates('TWR-132-01-041', snap.asOf).length, 0);
});

test('history: the asset list offers every tower, span and transformer on the line, and no duplicate records', async () => {
  const { snap } = await ready();
  const l = loadHistory(snap, { line: 'L-132-01' }).units;
  assert.equal(l.length, 44 + 43);
  assert.ok(!l.some((u) => u.id.startsWith('MX-')));
  assert.ok(l.filter((u) => u.events === 0).length > 0 && l.some((u) => u.events > 0));
});
