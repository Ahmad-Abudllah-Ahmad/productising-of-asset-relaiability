import { test } from 'node:test';
import assert from 'node:assert/strict';
import { towerHi, spanHi, lineHi } from '../domain/health/lineHi.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { fixture, F, repair, withConfig } from './fixtures.js';
import { CONFIG } from '../domain/config.js';

const AFTER_C1 = '2026-03-02';

// ---------------------------------------------------------------- asOf

test('every scoring function requires a valid asOf date', () => {
  const { ctx } = fixture();
  for (const bad of [undefined, null, '', '2026-13-45', '11/11/2026', 20261111]) {
    assert.throws(() => towerHi(ctx, 'T2', bad), TypeError);
    assert.throws(() => spanHi(ctx, 'S1', bad), TypeError);
    assert.throws(() => lineHi(ctx, 'L1', bad), TypeError);
    assert.throws(() => healthIndex(ctx, 'T2', bad), TypeError);
  }
});

// ------------------------------------------------------- no evidence

test('an asset with no evidence is not assessed: HI null, no band, reason given', () => {
  const { ctx } = fixture();
  const r = towerHi(ctx, 'T4', AFTER_C1); // never flown, no findings
  assert.equal(r.score, null);
  assert.equal(r.band, null);
  assert.equal(r.breakdown.assessed, false);
  assert.match(r.breakdown.reason, /no evidence/);
});

test('a tower flown with no findings is assessed as fully healthy (100, normal)', () => {
  const { ctx } = fixture();
  const r = towerHi(ctx, 'T2', AFTER_C1);
  assert.equal(r.score, 100);
  assert.equal(r.band, 'normal');
  assert.deepEqual(r.breakdown.findingIds, []);
  assert.equal(r.breakdown.freshness.newestEvidenceDate, '2026-03-01');
});

test('a campaign only counts once it has ended on or before asOf', () => {
  const { ctx } = fixture();
  assert.equal(towerHi(ctx, 'T2', '2026-02-28').score, null);
  assert.equal(towerHi(ctx, 'T2', '2026-03-01').score, 100);
});

test('a span is assessed through the campaign that flew either end tower', () => {
  const { ctx } = fixture();
  assert.equal(spanHi(ctx, 'S1', '2026-02-01').score, null);
  assert.equal(spanHi(ctx, 'S1', AFTER_C1).score, 100);
});

// ------------------------------------------------------- group maths

test('HI formula: one group at condition 2 and five at 5 gives 90', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')] });
  const r = towerHi(ctx, 'T2', AFTER_C1);
  assert.equal(r.score, 90); // (2 + 5*5) / (5*6) * 100
  assert.equal(r.band, 'normal');
  assert.deepEqual(r.breakdown.findingIds, ['F1']);
  const g = r.breakdown.groups.find((x) => x.group === 'insulators');
  assert.equal(g.score, 2);
  assert.equal(g.weight, 1);
  assert.deepEqual(g.components.map((c) => c.componentId), ['T2-INS-A']);
});

test('findings in several groups combine through the weights (equal, then custom)', () => {
  const findings = [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 3, '2026-02-11')];
  assert.equal(towerHi(fixture({ findings }).ctx, 'T2', AFTER_C1).score, 83.3); // (2+3+4*5)/30
  const heavy = withConfig({ weights: { lineGroups: { ...CONFIG.weights.lineGroups, insulators: 4 } } });
  assert.equal(towerHi(fixture({ findings, config: heavy }).ctx, 'T2', AFTER_C1).score, 68.9); // (4*2+3+4*5)/(5*9)
});

test('the worst component caps its group: one broken string is not averaged away', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')] });
  const r = towerHi(ctx, 'T2', AFTER_C1);
  const g = r.breakdown.groups.find((x) => x.group === 'insulators');
  assert.equal(g.mean, 3); // strings A (1) and B (5)
  assert.equal(g.worst, 1);
  assert.equal(g.score, 1);
  assert.equal(g.capped, true);
  assert.equal(r.score, 86.7); // (1 + 25) / 30
});

test('the cap margin setting lets the group rise above its worst component', () => {
  const cfg = withConfig({ scoring: { groupCapMargin: 2 } });
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], config: cfg });
  const g = towerHi(ctx, 'T2', AFTER_C1).breakdown.groups.find((x) => x.group === 'insulators');
  assert.equal(g.score, 3); // min(mean 3, worst 1 + 2)
});

test('within a component the lowest of several findings wins', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 4, '2026-02-10'), F('F2', 'T2-INS-A', 'insulators', 2, '2026-02-12')] });
  assert.equal(towerHi(ctx, 'T2', AFTER_C1).breakdown.groups.find((x) => x.group === 'insulators').components[0].score, 2);
});

test('a finding attached to the tower only (component unknown) still counts and is marked unresolved', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2', 'insulators', 2, '2026-02-10', 'confirmed', { component_hint: 'insulator_string' })] });
  const g = towerHi(ctx, 'T2', AFTER_C1).breakdown.groups.find((x) => x.group === 'insulators');
  assert.equal(g.components[0].unresolved, true);
  assert.equal(g.score, 2);
});

test('a span scores its conductor, accessories and corridor groups', () => {
  const { ctx } = fixture({ findings: [F('F1', 'S1-CND', 'conductor', 2, '2026-02-10')] });
  const r = spanHi(ctx, 'S1', AFTER_C1);
  assert.equal(r.score, 80); // (2+5+5)/15
  assert.deepEqual(r.breakdown.groups.map((g) => g.group), ['conductor', 'conductor_accessories', 'right_of_way']);
  assert.equal(towerHi(ctx, 'T1', AFTER_C1).score, 100, 'a conductor finding does not touch the towers');
});

test('bands: 70 and above normal, 40-69 moderate, below 40 poor', () => {
  // n groups at condition 1 and the rest at 5: n=2 gives 73.3, n=3 gives 60, n=5 gives 33.3, n=6 gives 20
  const g = (id, group, s) => F(id, 'T2', group, s, '2026-02-10');
  const all = ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection', 'tower_accessories'];
  const mk = (n) => fixture({ findings: all.slice(0, n).map((grp, i) => g(`F${i}`, grp, 1)) }).ctx;
  assert.deepEqual([towerHi(mk(2), 'T2', AFTER_C1).score, towerHi(mk(2), 'T2', AFTER_C1).band], [73.3, 'normal']);
  assert.deepEqual([towerHi(mk(3), 'T2', AFTER_C1).score, towerHi(mk(3), 'T2', AFTER_C1).band], [60, 'moderate']);
  assert.deepEqual([towerHi(mk(5), 'T2', AFTER_C1).score, towerHi(mk(5), 'T2', AFTER_C1).band], [33.3, 'poor']);
  assert.deepEqual([towerHi(mk(6), 'T2', AFTER_C1).score, towerHi(mk(6), 'T2', AFTER_C1).band], [20, 'poor']);
});

// ------------------------------------------------ review status rules

test('rejected findings are excluded from the score but still show the tower was looked at', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10', 'rejected')] });
  const r = towerHi(ctx, 'T2', '2026-02-20'); // before campaign C1 ended: only the finding is evidence
  assert.equal(r.score, 100);
  assert.deepEqual(r.breakdown.rejectedFindingIds, ['F1']);
  assert.deepEqual(r.breakdown.findingIds, []);
});

test('AI-proposed (pending) findings count by default and are flagged as unreviewed', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10', 'pending'), F('F2', 'T2-FND', 'foundation', 5, '2026-02-10', 'confirmed')] });
  const r = towerHi(ctx, 'T2', AFTER_C1);
  assert.equal(r.score, 90);
  assert.deepEqual(r.breakdown.findingIds, ['F1', 'F2']);
  assert.deepEqual(r.breakdown.unreviewedFindingIds, ['F1']);
});

test('countUnreviewedFindings = false leaves pending findings out and says so', () => {
  const cfg = withConfig({ scoring: { countUnreviewedFindings: false } });
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10', 'pending')], config: cfg });
  const r = towerHi(ctx, 'T2', AFTER_C1);
  assert.equal(r.score, 100);
  assert.deepEqual(r.breakdown.excludedUnreviewedFindingIds, ['F1']);
  assert.deepEqual(r.breakdown.unreviewedFindingIds, []);
});

test('the default for counting unreviewed findings is true', () => {
  assert.equal(CONFIG.scoring.countUnreviewedFindings, true);
});

// --------------------------------------------------- asOf and repairs

test('findings dated after asOf are ignored (a finding on asOf itself counts)', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-10-01')] });
  assert.equal(towerHi(ctx, 'T2', '2026-09-30').score, 100);
  assert.equal(towerHi(ctx, 'T2', '2026-10-01').score, 90);
});

test('asOf before and after a repair: the repair closes its finding only from its date', () => {
  const { ctx } = fixture({
    findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')],
    repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])],
  });
  const before = towerHi(ctx, 'T2', '2026-03-31');
  const onDay = towerHi(ctx, 'T2', '2026-04-01');
  assert.equal(before.score, 90);
  assert.deepEqual(before.breakdown.findingIds, ['F1']);
  assert.equal(onDay.score, 100);
  assert.deepEqual(onDay.breakdown.findingIds, []);
  assert.deepEqual(onDay.breakdown.closedFindingIds, ['F1']);
  assert.equal(onDay.breakdown.lastRepairDate, '2026-04-01');
  assert.equal(before.breakdown.lastRepairDate, null);
});

test('a repair closes only the findings it lists; others stay open', () => {
  const { ctx } = fixture({
    findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10'), F('F2', 'T2', 'steel_structure', 3, '2026-02-11')],
    repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])],
  });
  const r = towerHi(ctx, 'T2', '2026-04-02');
  assert.deepEqual(r.breakdown.findingIds, ['F2']);
  assert.equal(r.score, 93.3); // (3 + 25) / 30
});

test('a defect that is sighted again after its repair is open again', () => {
  const { ctx } = fixture({
    findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10'), F('F2', 'T2-INS-A', 'insulators', 2, '2026-08-15')],
    repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])],
  });
  assert.equal(towerHi(ctx, 'T2', '2026-05-01').score, 100);
  assert.equal(towerHi(ctx, 'T2', '2026-09-02').score, 90);
});

test('a closed finding still counts as evidence: after a full repair the tower is assessed, not null', () => {
  const { ctx } = fixture({
    findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')],
    repairs: [repair('R1', 'T2-INS-A', '2026-02-20', ['F1'])],
  });
  assert.equal(towerHi(ctx, 'T2', '2026-02-25').score, 100);
});

test('freshness: newest evidence date, age and stale flag against the interval', () => {
  const { ctx } = fixture();
  const fresh = towerHi(ctx, 'T2', '2026-04-01').breakdown.freshness;
  assert.deepEqual([fresh.newestEvidenceDate, fresh.ageDays, fresh.intervalDays, fresh.stale], ['2026-03-01', 31, 180, false]);
  assert.equal(towerHi(ctx, 'T3', '2026-12-01').breakdown.freshness.stale, true); // T3 not re-flown by C2
});

// ------------------------------------------------------------- line HI

test('line HI is the length-weighted mean of assessed towers and spans', () => {
  // weights: towers T1 200, T2 500, T3 300 (half of adjoining spans); spans S1 400, S2 600
  const base = lineHi(fixture().ctx, 'L1', AFTER_C1);
  assert.equal(base.score, 100);
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')] });
  const r = lineHi(ctx, 'L1', AFTER_C1);
  // T2 is 90 with weight 500 out of 2000 total: (2000 - 500*10) / 2000 = 97.5
  assert.equal(r.score, 97.5);
  assert.equal(r.band, 'normal');
});

test('line HI is not capped by its worst tower', () => {
  const { ctx } = fixture({ findings: ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection']
    .map((g, i) => F(`F${i}`, 'T2', g, 1, '2026-02-10')) });
  const worstTower = towerHi(ctx, 'T2', AFTER_C1);
  const r = lineHi(ctx, 'L1', AFTER_C1);
  assert.equal(worstTower.band, 'poor');
  assert.ok(r.score > worstTower.score + 30, `${r.score} vs ${worstTower.score}`);
  assert.equal(r.breakdown.cappedByWorst, false);
});

test('unassessed towers and spans are left out of the mean and listed', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')] });
  const r = lineHi(ctx, 'L1', AFTER_C1);
  assert.deepEqual(r.breakdown.notAssessed, ['T4']);
  assert.equal(r.breakdown.counts.towers, 4);
  assert.equal(r.breakdown.counts.assessedTowers, 3);
  assert.equal(r.breakdown.counts.assessedSpans, 2);
  assert.ok(r.breakdown.coverageByLength < 1 && r.breakdown.coverageByLength > 0.8);
});

test('a line with nothing assessed has HI null', () => {
  const r = lineHi(fixture().ctx, 'L1', '2026-01-01');
  assert.equal(r.score, null);
  assert.equal(r.band, null);
});

test('line breakdown: counts per band and the five worst towers and spans', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10'), F('F2', 'S1-CND', 'conductor', 1, '2026-02-10')] });
  const r = lineHi(ctx, 'L1', AFTER_C1);
  assert.deepEqual(r.breakdown.bandCounts.all, { normal: 5, moderate: 0, poor: 0 });
  assert.deepEqual(r.breakdown.bandCounts.tower, { normal: 3, moderate: 0, poor: 0 });
  assert.equal(r.breakdown.worst.length, 5);
  assert.deepEqual(r.breakdown.worst.map((w) => w.assetId).slice(0, 2), ['S1', 'T2']); // S1 = 73.3, T2 = 90
  assert.ok(r.breakdown.worst.every((w, i, a) => i === 0 || a[i - 1].score <= w.score));
  assert.deepEqual(r.breakdown.findingIds, ['F1', 'F2']);
});

test('line HI follows asOf through a repair', () => {
  const { ctx } = fixture({
    findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')],
    repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])],
  });
  assert.equal(lineHi(ctx, 'L1', '2026-03-31').score, 97.5);
  assert.equal(lineHi(ctx, 'L1', '2026-04-01').score, 100);
});

// ----------------------------------------------------- duplicates

test('a duplicate tower record: unmerged and with evidence it moves the line HI, merged it does not', () => {
  const dupFinding = F('F9', 'T2-DUP', 'steel_structure', 1, '2026-02-12');
  const baseline = lineHi(fixture().ctx, 'L1', AFTER_C1).score;

  const unmerged = fixture({ dup: 'unmerged', findings: [dupFinding] });
  const merged = fixture({ dup: 'merged', findings: [dupFinding] });
  assert.notEqual(lineHi(unmerged.ctx, 'L1', AFTER_C1).score, baseline);
  assert.equal(lineHi(merged.ctx, 'L1', AFTER_C1).score, baseline);
  assert.equal(lineHi(merged.ctx, 'L1', AFTER_C1).breakdown.counts.towers, 4, 'merged record is not counted as a tower');

  const dup = towerHi(merged.ctx, 'T2-DUP', AFTER_C1);
  assert.equal(dup.score, null);
  assert.match(dup.breakdown.reason, /merged into T2/);
});

test('a duplicate tower without evidence never changes the line HI, merged or not', () => {
  const baseline = lineHi(fixture().ctx, 'L1', AFTER_C1).score;
  for (const dup of ['unmerged', 'merged']) assert.equal(lineHi(fixture({ dup }).ctx, 'L1', AFTER_C1).score, baseline);
});

test('findings on a merged record do not reach the survivor or the roll-up', () => {
  const { ctx } = fixture({ dup: 'merged', findings: [F('F9', 'T2-DUP', 'steel_structure', 1, '2026-02-12')] });
  assert.deepEqual(towerHi(ctx, 'T2', AFTER_C1).breakdown.findingIds, []);
});

test('healthIndex picks the scorer by class and says so for classes without one', () => {
  const { ctx } = fixture();
  assert.equal(healthIndex(ctx, 'T2', AFTER_C1).score, 100);
  assert.equal(healthIndex(ctx, 'L1', AFTER_C1).score, 100);
  assert.match(healthIndex(ctx, 'T2-DMP', AFTER_C1).breakdown.reason, /no health index/);
  assert.match(healthIndex(ctx, 'nope', AFTER_C1).breakdown.reason, /unknown asset/);
});

test('scoring does not mutate its inputs', () => {
  const { data, ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 2, '2026-02-10')] });
  const before = JSON.stringify(data);
  lineHi(ctx, 'L1', AFTER_C1);
  assert.equal(JSON.stringify(data), before);
});
