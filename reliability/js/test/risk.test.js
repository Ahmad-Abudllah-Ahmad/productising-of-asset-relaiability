import { test } from 'node:test';
import assert from 'node:assert/strict';
import { risk } from '../domain/risk.js';
import { fixture, F, repair, POOR_TX, withConfig } from './fixtures.js';
import { CONFIG } from '../domain/config.js';

const AFTER_C1 = '2026-03-02';
const LATE = '2026-11-01'; // after the transformer oil and test dates in the fixture
const finding = F('F1', 'T2-INS-A', 'insulators', 3, '2026-02-10'); // T2 HI = 93.3 (condition 3: no cap)
const uplift = (patch) => withConfig({ risk: { linkedUplift: { ...CONFIG.risk.linkedUplift, ...patch } } });

test('asOf is required', () => {
  assert.throws(() => risk(fixture().ctx, 'T2'), TypeError);
});

test('risk = (100 - HI) x criticality x consequence, with the three factors side by side', () => {
  const { ctx } = fixture({ findings: [finding] });
  const r = risk(ctx, 'T2', AFTER_C1);
  // HI 93.3, criticality 4, consequence 4 (220 kV), no poor linked asset: 6.7 x 4 x 4
  assert.equal(r.score, 107.2);
  assert.equal(r.band, 'low');
  const f = r.breakdown.factors;
  assert.deepEqual([f.condition.hi, f.condition.conditionPoints, f.criticality.value, f.consequence.base, f.consequence.uplift, f.consequence.value], [93.3, 6.7, 4, 4, 0, 4]);
  assert.equal(f.consequence.source, 'voltage 220 kV');
  assert.equal(r.breakdown.health.assetId, 'T2', 'the HI breakdown is carried along');
});

test('an asset that is not assessed has no risk, and says why', () => {
  const r = risk(fixture().ctx, 'T4', AFTER_C1);
  assert.equal(r.score, null);
  assert.equal(r.band, null);
  assert.match(r.breakdown.reason, /not assessed/);
});

test('a fully healthy asset has risk 0', () => {
  assert.equal(risk(fixture().ctx, 'T2', AFTER_C1).score, 0);
});

test('a repair lowers risk: the same tower before and after the repair date', () => {
  const { ctx } = fixture({ findings: [finding], repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])] });
  const before = risk(ctx, 'T2', '2026-03-31');
  const after = risk(ctx, 'T2', '2026-04-01');
  assert.equal(before.score, 107.2);
  assert.equal(after.score, 0);
  assert.ok(after.score < before.score);
});

test('findings after asOf are ignored; a finding dated asOf is included', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 3, '2026-10-01')] });
  assert.equal(risk(ctx, 'T2', '2026-09-30').score, 0);
  assert.equal(risk(ctx, 'T2', '2026-10-01').score, 107.2);
});

test('consequence can be overridden, and comes from the asset when it has one', () => {
  const { ctx } = fixture({ findings: [finding] });
  assert.equal(risk(ctx, 'T2', AFTER_C1, { consequence: 2 }).score, 53.6);
  const own = fixture({ findings: [finding] });
  own.data.assets.find((a) => a.asset_id === 'T2').ext.consequence = 5;
  const r = risk(own.ctx, 'T2', AFTER_C1);
  assert.equal(r.score, 134); // 6.7 x 4 x 5
  assert.equal(r.breakdown.factors.consequence.source, 'asset.ext.consequence');
});

test('risk bands use the configured thresholds', () => {
  const band = (patch) => risk(fixture({ findings: [finding], config: withConfig({ risk: { bands: patch } }) }).ctx, 'T2', AFTER_C1).band;
  assert.equal(band({ mediumAtOrAbove: 100, highAtOrAbove: 500, criticalAtOrAbove: 1000 }), 'medium');
  assert.equal(band({ mediumAtOrAbove: 50, highAtOrAbove: 100, criticalAtOrAbove: 1000 }), 'high');
  assert.equal(band({ mediumAtOrAbove: 50, highAtOrAbove: 100, criticalAtOrAbove: 107 }), 'critical');
  assert.equal(band({ mediumAtOrAbove: 200, highAtOrAbove: 500, criticalAtOrAbove: 1000 }), 'low');
});

// -------------------------------------------------------- linked uplift

test('linked uplift: a poor transformer behind the line adds 1 to the tower consequence', () => {
  const healthy = risk(fixture({ findings: [finding] }).ctx, 'T2', LATE);
  const poor = risk(fixture({ findings: [finding], tx1: POOR_TX }).ctx, 'T2', LATE);
  assert.equal(healthy.score, 107.2);
  assert.equal(poor.score, 134); // consequence 4 -> 5
  assert.ok(poor.score > healthy.score, 'a poor tower on a line feeding a poor transformer ranks higher');
  const u = poor.breakdown.linkedUplift;
  assert.deepEqual([u.poorCount, u.uplift], [1, 1]);
  assert.deepEqual(u.linked.map((l) => [l.assetId, l.band, l.counted, l.hops]), [['TX1', 'poor', true, 2]]);
  assert.match(u.rule, /per linked asset in the poor band/);
});

test('linked uplift: only confirmed links count (TX2 is linked by a proposed link only)', () => {
  const r = risk(fixture({ findings: [finding], tx2: { ...POOR_TX } }).ctx, 'T2', LATE);
  assert.equal(r.breakdown.linkedUplift.linked.some((l) => l.assetId === 'TX2'), false);
  assert.equal(r.breakdown.linkedUplift.uplift, 0);
});

test('linked uplift is capped at +2 and consequence at 5', () => {
  const { ctx } = fixture({ findings: [finding], tx1: POOR_TX, tx3: true });
  const low = risk(ctx, 'T2', LATE, { consequence: 2 });
  assert.equal(low.breakdown.linkedUplift.poorCount, 2);
  assert.equal(low.breakdown.factors.consequence.value, 4); // 2 + 2
  const capped = risk(ctx, 'T2', LATE); // 4 + 2 would be 6
  assert.equal(capped.breakdown.factors.consequence.value, 5);
  assert.equal(capped.breakdown.factors.consequence.cappedAtMax, true);
  const oneMax = fixture({ findings: [finding], tx1: POOR_TX, tx3: true, config: uplift({ maxUplift: 1 }) });
  assert.equal(risk(oneMax.ctx, 'T2', LATE, { consequence: 2 }).breakdown.factors.consequence.uplift, 1);
});

test('linked uplift can be switched off in config', () => {
  const r = risk(fixture({ findings: [finding], tx1: POOR_TX, config: uplift({ enabled: false }) }).ctx, 'T2', LATE);
  assert.equal(r.score, 107.2);
  assert.equal(r.breakdown.linkedUplift.enabled, false);
});

test('a transformer collects the lines that feed it; a normal line adds nothing', () => {
  const { ctx } = fixture({ findings: [finding] });
  const r = risk(ctx, 'TX1', '2026-11-11');
  assert.deepEqual(r.breakdown.linkedUplift.linked.map((l) => l.assetId), ['L1']);
  assert.equal(r.breakdown.linkedUplift.uplift, 0);
  assert.equal(r.breakdown.factors.criticality.value, 5);
});

test('repairing the transformer removes the uplift it gave the tower, so the tower risk drops', () => {
  // TX1's only counted input is a poor visual finding: DGA, oil, age and tests are weighted 0
  const cfg = withConfig({ weights: { txInputs: { dga: 0, oil: 0, age: 0, tests: 0, visual: 1 } } });
  const base = { findings: [finding, F('FV', 'TX1-BSH', 'tx_visual', 1, '2026-10-10')], config: cfg };
  const before = risk(fixture(base).ctx, 'T2', '2026-11-01');
  const after = risk(fixture({ ...base, repairs: [repair('R1', 'TX1-BSH', '2026-10-20', ['FV'])] }).ctx, 'T2', '2026-11-01');
  assert.equal(before.breakdown.linkedUplift.poorCount, 1);
  assert.equal(after.breakdown.linkedUplift.poorCount, 0);
  assert.ok(after.score < before.score, `${after.score} should be below ${before.score}`);
});

test('merged assets are ignored by the uplift', () => {
  const { ctx } = fixture({ findings: [finding], tx1: { ...POOR_TX, merged_into: 'TX2' } });
  assert.equal(risk(ctx, 'T2', AFTER_C1).breakdown.linkedUplift.linked.length, 0);
});
