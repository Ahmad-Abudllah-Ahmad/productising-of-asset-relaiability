import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createContext } from '../domain/context.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { lineHi } from '../domain/health/lineHi.js';
import { risk } from '../domain/risk.js';
import { WORK_ORDER_STATUSES } from '../domain/types.js';

const seed = generateSeed();
const ctx = createContext(seed);
const NOW = '2026-11-11';
const findingById = new Map(seed.findings.map((f) => [f.finding_id, f]));
const woById = new Map(seed.workOrders.map((w) => [w.work_order_id, w]));
const BANDS = new Set(['normal', 'moderate', 'poor']);

// --------------------------------------------- work orders and repairs

test('work orders and repairs are deterministic', () => {
  const again = generateSeed();
  assert.equal(JSON.stringify([again.workOrders, again.repairs, again.groundTruth.repairs]), JSON.stringify([seed.workOrders, seed.repairs, seed.groundTruth.repairs]));
});

test('there are open, in-progress and completed work orders', () => {
  const by = (s) => seed.workOrders.filter((w) => w.status === s).length;
  assert.ok(by('open') >= 10 && by('in_progress') >= 5 && by('completed') >= 50, JSON.stringify([by('open'), by('in_progress'), by('completed')]));
  for (const w of seed.workOrders) assert.ok(WORK_ORDER_STATUSES.includes(w.status));
});

test('every work order points at a real asset and real, non-rejected findings; ids are unique and ordered by creation', () => {
  assert.equal(new Set(seed.workOrders.map((w) => w.work_order_id)).size, seed.workOrders.length);
  for (const w of seed.workOrders) {
    assert.ok(seed.assets.some((a) => a.asset_id === w.asset_id), w.work_order_id);
    assert.ok(w.finding_ids.length >= 1);
    for (const id of w.finding_ids) {
      const f = findingById.get(id);
      assert.ok(f && f.review_status !== 'rejected', `${w.work_order_id} ${id}`);
    }
    // raised after the first sighting; later sightings of the same defect are attached to it
    assert.ok(Math.min(...w.finding_ids.map((id) => Date.parse(findingById.get(id).date))) < Date.parse(w.created_at), `${w.work_order_id} created before its first finding`);
  }
  const created = seed.workOrders.map((w) => w.created_at);
  assert.deepEqual(created, [...created].sort());
});

test('a completed work order has exactly one repair that closes exactly its findings; open ones have none', () => {
  for (const w of seed.workOrders) {
    const rs = seed.repairs.filter((r) => r.work_order_id === w.work_order_id);
    if (w.status === 'completed') {
      assert.equal(rs.length, 1, w.work_order_id);
      assert.deepEqual([...rs[0].closes_finding_ids].sort(), [...w.finding_ids].sort());
      assert.equal(rs[0].date, w.completed_at);
      assert.equal(rs[0].asset_id, w.asset_id);
    } else {
      assert.equal(rs.length, 0, w.work_order_id);
      assert.equal(w.completed_at, null);
    }
  }
  for (const r of seed.repairs) assert.ok(woById.get(r.work_order_id)?.status === 'completed');
});

test('repairs come after the findings they close, and before the reference date', () => {
  for (const r of seed.repairs) {
    for (const id of r.closes_finding_ids) assert.ok(findingById.get(id).date < r.date, `${r.repair_id} closes ${id} before it was found`);
    assert.ok(r.date < NOW, r.repair_id);
  }
});

test('no finding is closed by two repairs', () => {
  const all = seed.repairs.flatMap((r) => r.closes_finding_ids);
  assert.equal(new Set(all).size, all.length);
});

test('ground truth separates effective repairs (never sighted again) from ineffective ones (sighted again)', () => {
  const gt = seed.groundTruth.repairs;
  assert.equal(gt.length, seed.repairs.length);
  assert.ok(gt.some((r) => r.effective) && gt.some((r) => !r.effective));
  const groups = new Map(seed.groundTruth.repeatSightings.map((g) => [g.defect_id, g.finding_ids.map((id) => findingById.get(id))]));
  for (const r of gt) {
    const date = seed.repairs.find((x) => x.repair_id === r.repair_id).date;
    const later = (groups.get(r.defect_id) ?? []).filter((f) => f.review_status !== 'rejected' && f.date > date);
    if (r.effective) assert.equal(later.length, 0, `${r.repair_id} was effective but the defect was sighted again`);
    else assert.ok(later.length > 0, `${r.repair_id} was ineffective but the defect was not sighted again`);
  }
});

// ------------------------------------------------------ whole-seed scoring

test('every line and transformer scores 0-100 with a valid band and a breakdown, today', () => {
  for (const id of ['L-132-01', 'L-220-03', 'L-500-01', 'TX-1A', 'TX-1B', 'TX-1C', 'TX-2A', 'TX-2B', 'TX-2C']) {
    const r = healthIndex(ctx, id, NOW);
    assert.ok(r.score >= 0 && r.score <= 100, id);
    assert.ok(BANDS.has(r.band), id);
    assert.equal(r.breakdown.assessed, true);
    assert.equal(r.breakdown.asOf, NOW);
    assert.ok(r.breakdown.freshness.newestEvidenceDate <= NOW);
  }
});

test('before the first campaign nothing is assessed; the picture fills in as campaigns end', () => {
  assert.equal(lineHi(ctx, 'L-220-03', '2026-01-01').score, null);
  const q1 = lineHi(ctx, 'L-220-03', '2026-03-31');
  assert.ok(q1.score !== null && q1.breakdown.counts.assessedTowers > 40);
  assert.ok(lineHi(ctx, 'L-220-03', NOW).breakdown.counts.assessedTowers >= q1.breakdown.counts.assessedTowers);
});

test('the transformer with an arcing DGA profile scores lower on DGA than the healthy ones, and shows a discharge zone', () => {
  const dga = (id) => healthIndex(ctx, id, NOW).breakdown.inputs.find((i) => i.input === 'dga');
  assert.ok(dga('TX-2C').score < dga('TX-2B').score - 20);
  assert.ok(['D1', 'D2', 'DT'].includes(healthIndex(ctx, 'TX-2C', NOW).breakdown.duval.zone));
  assert.ok(dga('TX-2A').detail.trend.penalty > 0, 'the thermal profile is rising fast');
});

test('seed duplicates: merging them (merged_into) does not change any line HI', () => {
  const merged = generateSeed();
  const dupToOriginal = new Map(merged.groundTruth.duplicates.map((d) => [d.duplicate, d.original]));
  for (const a of merged.assets) if (dupToOriginal.has(a.asset_id)) a.merged_into = dupToOriginal.get(a.asset_id);
  const mctx = createContext(merged);
  for (const id of ['L-132-01', 'L-220-03', 'L-500-01']) {
    assert.equal(lineHi(mctx, id, NOW).score, lineHi(ctx, id, NOW).score, id);
  }
  assert.ok(lineHi(mctx, 'L-132-01', NOW).breakdown.counts.towers < lineHi(ctx, 'L-132-01', NOW).breakdown.counts.towers, 'merged records are no longer counted as towers');
  assert.equal(healthIndex(mctx, merged.groundTruth.duplicates[0].duplicate, NOW).score, null);
});

test('a completed repair raises its tower HI and lowers its risk (checked on every effective tower repair)', () => {
  let checked = 0;
  for (const r of seed.repairs) {
    const owner = ctx.ownerOf(r.asset_id);
    const a = ctx.asset(owner);
    if (!a || a.class !== 'tower') continue;
    const dayBefore = new Date(Date.parse(r.date) - 86400000).toISOString().slice(0, 10);
    const f = ctx.findingsFor(owner, r.date);
    if (f.evidence.some((x) => x.date > dayBefore)) continue; // a new finding the same day would muddy the comparison
    const before = healthIndex(ctx, owner, dayBefore);
    const after = healthIndex(ctx, owner, r.date);
    if (before.score === null) continue;
    const closedCounted = r.closes_finding_ids.some((id) => ctx.findingsFor(owner, dayBefore).counted.some((x) => x.finding_id === id));
    if (!closedCounted) continue;
    assert.ok(after.score >= before.score, `${r.repair_id} on ${owner}: ${before.score} -> ${after.score}`);
    assert.ok(risk(ctx, owner, r.date).score <= risk(ctx, owner, dayBefore).score + 1e-9, `${r.repair_id} risk`);
    checked += 1;
  }
  assert.ok(checked >= 20, `only ${checked} repairs were checked`);
});

test('risk for every transformer is a number with a band; unassessed towers have none', () => {
  for (const id of ['TX-1A', 'TX-1B', 'TX-1C', 'TX-2A', 'TX-2B', 'TX-2C']) {
    const r = risk(ctx, id, NOW);
    assert.ok(r.score > 0 && ['low', 'medium', 'high', 'critical'].includes(r.band), id);
  }
  assert.equal(risk(ctx, 'TWR-220-03-001', '2026-01-01').score, null);
});

test('scoring never changes the data', () => {
  const copy = generateSeed();
  const c2 = createContext(copy);
  const before = JSON.stringify(copy);
  for (const id of ['L-132-01', 'L-220-03', 'L-500-01', 'TX-2A']) risk(c2, id, NOW);
  assert.equal(JSON.stringify(copy), before);
});

test('the newly built towers and spans are not assessed, and left out of the line roll-up', () => {
  const ns = seed.groundTruth.newSection;
  for (const id of [...ns.tower_ids, ...ns.span_ids]) {
    const r = healthIndex(ctx, id, NOW);
    assert.equal(r.score, null, id);
    assert.equal(r.band, null, id);
    assert.match(r.breakdown.reason, /no evidence/, id);
  }
  const line = lineHi(ctx, 'L-132-01', NOW);
  assert.equal(line.breakdown.counts.towers, 44 + 3, '44 towers plus the 3 duplicate records of this line, none of them assessed');
  for (const id of [...ns.tower_ids, ...ns.span_ids]) assert.ok(line.breakdown.notAssessed.includes(id), `${id} is listed as not assessed`);
  assert.ok(line.breakdown.coverageByLength < 1);
  assert.equal(risk(ctx, ns.tower_ids[0], NOW).score, null);
});
