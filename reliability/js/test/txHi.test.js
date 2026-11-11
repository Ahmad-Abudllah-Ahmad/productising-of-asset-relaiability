import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformerHi, duvalTriangle } from '../domain/health/txHi.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { fixture, F, repair, GAS, POOR_TX, withConfig } from './fixtures.js';

const NOW = '2026-11-11';
const input = (r, name) => r.breakdown.inputs.find((i) => i.input === name);

// TX1 in the fixture: installed 2020 (age score 100), oil at the "good" limits (100), test pass (100).

test('asOf is required', () => {
  assert.throws(() => transformerHi(fixture().ctx, 'TX1'), TypeError);
});

test('no DGA, oil, test or visual evidence: HI null, even though age is known', () => {
  const r = transformerHi(fixture().ctx, 'TX2', NOW); // TX2 has an install date but no oil, tests, DGA or findings
  assert.equal(r.score, null);
  assert.equal(r.band, null);
  assert.deepEqual(r.breakdown.missingInputs, ['dga', 'oil', 'tests', 'visual']);
});

test('evidence dated after asOf is ignored, so an early asOf gives null', () => {
  assert.equal(transformerHi(fixture().ctx, 'TX1', '2026-01-01').score, null);
});

test('missing inputs are listed and their weight is left out', () => {
  const r = transformerHi(fixture().ctx, 'TX1', NOW);
  assert.deepEqual(r.breakdown.missingInputs, ['dga', 'visual']);
  assert.equal(r.score, 100); // oil, age, tests all 100
  assert.equal(input(r, 'dga').used, false);
});

test('equal weights: HI is the mean of the five sub-scores', () => {
  const { ctx } = fixture({
    dga: [GAS('d1', '2026-10-01', { c2h2: 0.2 })],
    findings: [F('F1', 'TX1-BSH', 'tx_visual', 2, '2026-10-10')],
  });
  const r = transformerHi(ctx, 'TX1', NOW);
  assert.deepEqual(r.breakdown.inputs.map((i) => [i.input, i.score]), [['dga', 100], ['oil', 100], ['age', 100], ['tests', 100], ['visual', 40]]);
  assert.equal(r.score, 88); // (100+100+100+100+40)/5
  assert.deepEqual(r.breakdown.missingInputs, []);
});

test('custom weights change the result', () => {
  const cfg = withConfig({ weights: { txInputs: { dga: 1, oil: 1, age: 1, tests: 1, visual: 6 } } });
  const { ctx } = fixture({ dga: [GAS('d1', '2026-10-01')], findings: [F('F1', 'TX1-BSH', 'tx_visual', 2, '2026-10-10')], config: cfg });
  assert.equal(transformerHi(ctx, 'TX1', NOW).score, 64); // (100+100+100+100 + 6*40) / 10
});

// ------------------------------------------------------------- DGA

test('DGA sub-score uses the latest sample on or before asOf', () => {
  const dga = [GAS('d0', '2026-05-01', { c2h2: 0.5 }), GAS('d1', '2026-10-01', { c2h2: 5 })];
  const { ctx } = fixture({ dga });
  assert.equal(input(transformerHi(ctx, 'TX1', '2026-06-01'), 'dga').detail.sampleId, 'd0');
  assert.equal(input(transformerHi(ctx, 'TX1', NOW), 'dga').detail.sampleId, 'd1');
});

test('gas limits: 100 below condition 1, 70 at condition 2, 35 at condition 3, 0 at twice condition 3', () => {
  const score = (c2h2) => {
    const { ctx } = fixture({ dga: [GAS('d1', '2026-10-01', { c2h2 })] });
    return input(transformerHi(ctx, 'TX1', NOW), 'dga').detail.gases.find((g) => g.gas === 'c2h2').score;
  };
  assert.equal(score(1), 100);
  assert.equal(score(9), 70);
  assert.equal(score(35), 35);
  assert.equal(score(70), 0);
  assert.equal(score(5), 85); // halfway between condition 1 (1 ppm) and 2 (9 ppm): 100 -> 70
});

test('DGA trend: a gas that rose fast over the window takes a penalty off the latest-sample score', () => {
  const dga = [GAS('d0', '2025-11-01', { c2h2: 0.2 }), GAS('d1', '2026-10-01', { c2h2: 5 })];
  const { ctx } = fixture({ dga });
  const d = input(transformerHi(ctx, 'TX1', NOW), 'dga');
  assert.equal(d.detail.worstGas, 'c2h2');
  assert.equal(d.detail.trend.gas, 'c2h2');
  assert.equal(d.detail.trend.penalty, 30); // ratio 5 against a 1 ppm floor, full penalty at 3x
  assert.equal(d.score, 55); // 85 - 30
});

test('DGA trend ignores samples older than the window and gases that are still tiny', () => {
  const old = fixture({ dga: [GAS('d0', '2024-01-01', { c2h2: 0.2 }), GAS('d1', '2026-10-01', { c2h2: 5 })] }).ctx;
  assert.equal(input(transformerHi(old, 'TX1', NOW), 'dga').detail.trend.penalty, 0);
  const tiny = fixture({ dga: [GAS('d0', '2025-11-01', { h2: 1 }), GAS('d1', '2026-10-01', { h2: 10 })] }).ctx;
  assert.equal(input(transformerHi(tiny, 'TX1', NOW), 'dga').detail.trend.penalty, 0, 'h2 of 10 ppm is under a quarter of its limit');
});

test('a single DGA sample has no trend', () => {
  const { ctx } = fixture({ dga: [GAS('d1', '2026-10-01')] });
  assert.equal(input(transformerHi(ctx, 'TX1', NOW), 'dga').detail.trend.comparedWith, null);
});

// ------------------------------------------------------- Duval

test('Duval triangle zones for typical gas mixes', () => {
  const zone = (ch4, c2h4, c2h2) => duvalTriangle({ ch4, c2h4, c2h2 }).zone;
  assert.equal(zone(100, 0, 0), 'PD');
  assert.equal(zone(90, 10, 0), 'T1');
  assert.equal(zone(30, 10, 0), 'T2');
  assert.equal(zone(10, 90, 0), 'T3');
  assert.equal(zone(50, 10, 40), 'D1');
  assert.equal(zone(0, 10, 30), 'D2');
  assert.equal(zone(30, 55, 15), 'DT');
  assert.equal(zone(0, 0, 0), null);
});

test('Duval result carries percentages for plotting and appears in the breakdown without changing the score', () => {
  const d = duvalTriangle({ ch4: 30, c2h4: 10, c2h2: 0 });
  assert.deepEqual(d.percent, { ch4: 75, c2h4: 25, c2h2: 0 });
  const { ctx } = fixture({ dga: [GAS('d1', '2026-10-01', { ch4: 30, c2h4: 10, c2h2: 0 })] });
  const r = transformerHi(ctx, 'TX1', NOW);
  assert.equal(r.breakdown.duval.zone, 'T2');
  assert.equal(r.score, 100, 'a T2 zone on its own, with gases under their limits, does not lower the score');
});

// -------------------------------------------------- oil, age, tests

test('oil sub-score is the mean of moisture, acidity and breakdown voltage between their good and poor limits', () => {
  const mid = { oil: { date: '2026-09-01', moisture_ppm: 22.5, acidity_mgkoh_g: 0.125, breakdown_kv: 45 } };
  const { ctx } = fixture({ tx1: { ext: { ...mid, electrical_tests: { date: '2026-06-01', result: 'pass' } } } });
  const o = input(transformerHi(ctx, 'TX1', NOW), 'oil');
  assert.equal(o.score, 50);
  assert.deepEqual(o.detail.parameters.map((p) => p.score), [50, 50, 50]);
});

test('age: full score until 15 years, zero at 50, linear between', () => {
  const ageScore = (install_date) => input(transformerHi(fixture({ tx1: { install_date } }).ctx, 'TX1', NOW), 'age').score;
  assert.equal(ageScore('2020-01-01'), 100);
  assert.equal(ageScore('1976-01-01'), 0);
  const years = (Date.parse('2026-11-11') - Date.parse('2000-01-01')) / 86400000 / 365.25;
  assert.ok(Math.abs(ageScore('2000-01-01') - 100 * (1 - (years - 15) / 35)) < 0.1);
});

test('electrical test result: pass 100, watch 60, fail 20', () => {
  for (const [result, expected] of [['pass', 100], ['watch', 60], ['fail', 20]]) {
    const { ctx } = fixture({ tx1: { ext: { electrical_tests: { date: '2026-06-01', result } } } });
    assert.equal(input(transformerHi(ctx, 'TX1', NOW), 'tests').score, expected);
  }
});

// ------------------------------------------------------- visual

test('visual input: worst open finding on the transformer or its parts; unreviewed ones are flagged', () => {
  const { ctx } = fixture({ findings: [F('F1', 'TX1-BSH', 'tx_visual', 3, '2026-10-10', 'pending'), F('F2', 'TX1', 'tx_visual', 4, '2026-10-10')] });
  const v = input(transformerHi(ctx, 'TX1', NOW), 'visual');
  assert.equal(v.score, 60);
  assert.deepEqual(v.detail.findingIds, ['F1', 'F2']);
  assert.deepEqual(v.detail.unreviewedFindingIds, ['F1']);
});

test('visual input: a repair restores it; rejected findings are not counted; visual findings after asOf are ignored', () => {
  const findings = [F('F1', 'TX1-BSH', 'tx_visual', 2, '2026-10-10'), F('F2', 'TX1', 'tx_visual', 1, '2026-10-12', 'rejected')];
  const { ctx } = fixture({ findings, repairs: [repair('R1', 'TX1-BSH', '2026-10-20', ['F1'])] });
  assert.equal(input(transformerHi(ctx, 'TX1', '2026-10-15'), 'visual').score, 40);
  const after = input(transformerHi(ctx, 'TX1', '2026-10-20'), 'visual');
  assert.equal(after.score, 100);
  assert.deepEqual(after.detail.closedFindingIds, ['F1']);
  assert.deepEqual(after.detail.rejectedFindingIds, ['F2']);
  assert.equal(input(transformerHi(ctx, 'TX1', '2026-10-09'), 'visual').used, false);
});

// ------------------------------------------------- bands and misc

test('a transformer with poor oil, a failed test and old age is in the poor band', () => {
  const { ctx } = fixture({ tx1: POOR_TX });
  const r = transformerHi(ctx, 'TX1', NOW);
  assert.equal(r.score, 6.7); // (0 + 0 + 20) / 3
  assert.equal(r.band, 'poor');
});

test('freshness uses the newest of the evidence dates, never the install date', () => {
  const { ctx } = fixture({ dga: [GAS('d1', '2026-10-01')] });
  const f = transformerHi(ctx, 'TX1', NOW).breakdown.freshness;
  assert.deepEqual([f.newestEvidenceDate, f.intervalDays, f.stale], ['2026-10-01', 365, false]);
});

test('a merged transformer record is ignored; a non-transformer is rejected', () => {
  const merged = fixture({ tx2: { mergedInto: 'TX1' } }).ctx;
  assert.match(transformerHi(merged, 'TX2', NOW).breakdown.reason, /merged into TX1/);
  assert.match(transformerHi(fixture().ctx, 'T2', NOW).breakdown.reason, /not a transformer/);
  assert.equal(healthIndex(fixture().ctx, 'TX1', NOW).score, 100);
});
