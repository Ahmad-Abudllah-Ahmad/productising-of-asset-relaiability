import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../domain/config.js';
import { forecastAsset, fleetSpread, slope, percentile, driftYears, bandOfScore, nextBandDown, recurrenceOf, addDays } from '../domain/forecast.js';
import { fixture, F, repair, GAS } from './fixtures.js';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadDashboard } from '../app/dashboardModel.js';
import { forecastFor, droppingAssets, loadForecasts } from '../app/forecastModel.js';
import { loadAssetDetail } from '../app/assetModel.js';

const D = ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'];
const f = (id, cond, date, extra = {}) => F(id, 'T1', 'steel_structure', cond, date, 'confirmed', { defect_class: 'x', ...extra });
const run = (o, asOf, dates = D, opts = {}) => { const { ctx } = fixture(o); return forecastAsset(ctx, 'T1', asOf, { dates: dates.filter((d) => d <= asOf), ...opts }); };
const none = { ...CONFIG.forecast, recurrence: { pointsPerYearEach: 0, maxPerYear: 0 }, openFindings: { ...CONFIG.forecast.openFindings, pointsPerYearEach: 0 } };

// A tower flown at each campaign with nothing serious found
const flat = { findings: [f('F0', 5, '2026-01-01')] };
// A tower whose findings get worse at each campaign
const declining = { findings: [f('A', 4, '2025-12-20'), f('B', 3, '2026-03-20'), f('C', 2, '2026-06-20')] };

test('helpers: slope, percentile, bands, drift years', () => {
  assert.equal(slope([{ x: 0, y: 10 }, { x: 10, y: 8 }, { x: 20, y: 6 }]), -0.2);
  assert.equal(slope([{ x: 1, y: 1 }]), null);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([0, 10], 25), 2.5);
  assert.equal(bandOfScore(70, CONFIG.bands), 'normal');
  assert.equal(bandOfScore(69.9, CONFIG.bands), 'moderate');
  assert.equal(bandOfScore(null, CONFIG.bands), 'none');
  assert.deepEqual(nextBandDown('normal', CONFIG.bands), { band: 'moderate', below: 70 });
  assert.equal(nextBandDown('poor', CONFIG.bands), null);
  assert.equal(driftYears(365.25, 1), 1);
  assert.ok(driftYears(365.25, 0.9) < 1 && driftYears(365.25, 0.9) > 0.5);
});

test('flat history: the line stays flat and the asset stays in its band for 12 months', () => {
  const r = run(flat, '2026-10-01');
  assert.equal(r.status, 'ok');
  assert.equal(r.hi, 100);
  assert.equal(r.drivers.trendPerYear, 0);
  assert.deepEqual([...new Set(r.points.map((p) => p.hi))], [100]);
  assert.equal(r.points.length, CONFIG.forecast.horizonMonths + 1);
  assert.equal(r.points[0].date, '2026-10-01');
  assert.equal(r.points.at(-1).date, '2027-10-01');
  assert.equal(r.crossing.stays, true);
  assert.equal(r.crossing.date, null);
  assert.equal(r.crossing.text, 'Stays in the normal band for 12 months');
  assert.equal(r.dropsBand, false);
});

test('declining history: negative trend, the projection falls and crosses into the next band at a date', () => {
  const r = run(declining, '2026-10-01');
  assert.equal(r.status, 'ok');
  assert.ok(r.history.length >= 3);
  assert.ok(r.history.every((p, i) => i === 0 || p.hi <= r.history[i - 1].hi), 'the history itself declines');
  assert.ok(r.drivers.trendPerYear < 0);
  assert.ok(r.endHi < r.hi);
  assert.ok(r.points.every((p, i) => i === 0 || p.hi <= r.points[i - 1].hi), 'never rises');
  assert.equal(r.dropsBand, true);
  assert.ok(r.crossing.date > '2026-10-01' && r.crossing.date <= '2027-10-01');
  assert.equal(r.crossing.into, nextBandDown(r.band, CONFIG.bands).band);
  assert.match(r.crossing.text, /^Projected to fall into the \w+ band around 2027-/);
  const cut = nextBandDown(r.band, CONFIG.bands).below;
  const after = r.points.find((p) => p.date >= r.crossing.date);
  assert.ok(after.hi < cut);
});

test('an improving history is not projected to rise', () => {
  const up = run({ findings: [f('A', 2, '2025-12-20'), f('B', 4, '2026-03-20')] }, '2026-10-01');
  assert.ok(up.drivers.fittedPerYear === null || up.drivers.trendPerYear <= 0);
  assert.ok(up.points.every((p) => p.hi <= up.hi));
});

test('a repair resets the trend: only history since the repair is used', () => {
  const o = { findings: [...declining.findings], repairs: [repair('R1', 'T1', '2026-07-05', ['A', 'B', 'C'])] };
  // before any campaign after the repair: the trend is flat, and says why
  const justAfter = run(o, '2026-08-01');
  assert.equal(justAfter.resetAt, '2026-07-05');
  assert.equal(justAfter.hi, 100);
  assert.equal(justAfter.drivers.noInspectionSinceRepair, true);
  assert.equal(justAfter.drivers.trendPerYear, 0);
  // the same asset without the repair declines
  const without = run({ findings: declining.findings }, '2026-08-01');
  assert.ok(without.drivers.trendPerYear < 0);
  assert.ok(justAfter.endHi > without.endHi);
  // after a campaign that finds nothing new, the post-repair points are flat
  const later = run(o, '2026-10-01');
  assert.equal(later.drivers.pointsUsed, 2);
  assert.equal(later.drivers.trendPerYear, 0);
  assert.equal(later.endHi, 100);
});

test('recurrence: a defect that came back after a repair adds extra decline', () => {
  const o = {
    findings: [f('A', 3, '2026-01-10', { defect_class: 'clamp_loose' }), f('B', 3, '2026-03-20', { defect_class: 'bent_member' }), f('A2', 3, '2026-08-10', { defect_class: 'clamp_loose' })],
    repairs: [repair('R1', 'T1', '2026-05-01', ['A'])],
  };
  const { ctx } = fixture(o);
  const rec = recurrenceOf(ctx, 'T1', '2026-10-01');
  assert.deepEqual([rec.repairs, rec.recurred, rec.ids], [1, 1, ['R1']]);
  const withRec = forecastAsset(ctx, 'T1', '2026-10-01', { dates: D });
  const noRec = forecastAsset(ctx, 'T1', '2026-10-01', { dates: D, config: none });
  assert.equal(withRec.drivers.recurrence.extraPerYear, CONFIG.forecast.recurrence.pointsPerYearEach);
  assert.equal(noRec.drivers.recurrence.extraPerYear, 0);
  assert.ok(withRec.endHi < noRec.endHi, `${withRec.endHi} should be under ${noRec.endHi}`);
  // the Maintenance History's own judgement overrides the simple rule
  assert.equal(recurrenceOf(ctx, 'T1', '2026-10-01', new Set()).recurred, 0);
  // a repair whose defect did not return adds nothing
  const held = fixture({ findings: [f('A', 3, '2026-01-10', { defect_class: 'clamp_loose' })], repairs: [repair('R1', 'T1', '2026-05-01', ['A'])] });
  assert.equal(recurrenceOf(held.ctx, 'T1', '2026-10-01').recurred, 0);
});

test('open serious findings add a small extra decline, capped', () => {
  const o = { findings: [f('A', 1, '2026-01-10'), f('B', 2, '2026-01-11'), f('C', 2, '2026-01-12'), f('D', 2, '2026-01-13'), f('E', 2, '2026-01-14'), f('G', 4, '2026-01-15')] };
  const r = run(o, '2026-10-01');
  assert.equal(r.drivers.openFindings.severe, 5);
  assert.equal(r.drivers.openFindings.extraPerYear, CONFIG.forecast.openFindings.maxPerYear);
});

test('not enough history: fewer than two campaigns gives no forecast, only the reason', () => {
  const one = run({ findings: [f('A', 3, '2026-02-01')] }, '2026-10-01', ['2026-04-01']);
  assert.equal(one.status, 'not_enough_history');
  assert.equal(one.reason, 'Not enough history to forecast');
  assert.equal(one.points, undefined);
  assert.equal(one.crossing, undefined);
  assert.equal(one.endHi, undefined);
  assert.match(one.detail, /1 campaign/);
  const { ctx } = fixture();
  const t4 = forecastAsset(ctx, 'T4', '2026-10-01', { dates: D });
  assert.equal(t4.status, 'not_enough_history');
  assert.equal(t4.points, undefined);
});

test('transformers: DGA samples drive the line; fewer than two samples is not enough history', () => {
  const g = (i, date, v) => GAS(`G${i}`, date, v);
  const rising = [0, 1, 2, 3, 4].map((i) => g(i, addDays('2026-01-01', i * 60), { h2: 200 + i * 150, ch4: 100 + i * 80, c2h4: 40 + i * 30, c2h2: 0.2 + i * 2, co: 300 + i * 40 }));
  const flatGas = [0, 1, 2, 3, 4].map((i) => g(i, addDays('2026-01-01', i * 60), { h2: 50, ch4: 30, c2h4: 10, c2h2: 0.2, co: 250 }));
  const tx = (dga) => { const { ctx } = fixture({ dga }); return forecastAsset(ctx, 'TX1', '2026-10-01', { dates: D }); };
  const up = tx(rising);
  assert.equal(up.status, 'ok');
  assert.equal(up.method, 'dga');
  assert.ok(up.drivers.fastestGas);
  assert.ok(up.endHi < up.hi, `${up.endHi} < ${up.hi}`);
  const steady = tx(flatGas);
  assert.equal(steady.endHi, steady.hi);
  assert.equal(steady.crossing.stays, true);
  const one = tx([g(0, '2026-01-01', { h2: 50 })]);
  assert.equal(one.status, 'not_enough_history');
  assert.match(one.detail, /1 DGA sample/);
  assert.equal(one.points, undefined);
});

test('as-of: only evidence, repairs and samples dated on or before the date are used', () => {
  const o = { findings: declining.findings, repairs: [repair('R1', 'T1', '2026-09-01', ['A', 'B', 'C'])] };
  const early = run(o, '2026-07-15');
  const late = run(o, '2026-10-01');
  assert.equal(early.resetAt, null, 'a repair dated after the as-of date is ignored');
  assert.equal(late.resetAt, '2026-09-01');
  assert.ok(early.hi < late.hi);
  assert.deepEqual(early.history.map((p) => p.date), ['2026-01-01', '2026-04-01', '2026-07-01']);
  assert.equal(early.points[0].date, '2026-07-15');
  assert.equal(run(o, '2026-02-01').status, 'not_enough_history');
  // later findings do not leak backwards
  const noLeak = run({ findings: [...declining.findings, f('Z', 1, '2026-09-20')] }, '2026-07-15');
  assert.equal(noLeak.hi, early.hi);
  // the same for DGA samples
  const g = (i, date, v) => GAS(`G${i}`, date, v);
  const { ctx } = fixture({ dga: [g(0, '2026-01-01', { h2: 100 }), g(1, '2026-03-01', { h2: 120 }), g(2, '2026-12-01', { h2: 5000 })] });
  assert.equal(forecastAsset(ctx, 'TX1', '2026-10-01', { dates: D }).drivers.samplesUsed, 2);
});

test('range: from the fleet observed changes, absent when there are too few', () => {
  const { ctx } = fixture({ findings: declining.findings });
  const few = fleetSpread(ctx, ['T1', 'T2'], D, '2026-10-01');
  assert.equal(few.tower.available, false);
  assert.equal(few.tower.needed, CONFIG.forecast.range.minChanges);
  const cfg = { ...CONFIG.forecast, range: { ...CONFIG.forecast.range, minChanges: 1 } };
  const some = fleetSpread(ctx, ['T1'], D, '2026-10-01', cfg);
  assert.equal(some.tower.available, true);
  assert.ok(some.tower.low <= 0 && some.tower.high >= 0);
  const r = forecastAsset(ctx, 'T1', '2026-10-01', { dates: D, spread: few });
  assert.equal(r.range.available, false);
  assert.ok(r.points.every((p) => p.lower === null && p.upper === null));
  const withRange = forecastAsset(ctx, 'T1', '2026-10-01', { dates: D, spread: some, config: cfg });
  assert.ok(withRange.points.every((p) => p.lower <= p.hi && p.hi <= p.upper));
});

test('every method parameter is in config.forecast, and a changed setting is followed', () => {
  const c = CONFIG.forecast;
  for (const k of ['horizonMonths', 'minCampaigns', 'minSamples', 'trend', 'recurrence', 'openFindings', 'range']) assert.ok(k in c, k);
  assert.ok(Object.isFrozen(c));
  const { ctx } = fixture({ findings: declining.findings });
  assert.equal(forecastAsset(ctx, 'T1', '2026-10-01', { dates: D, config: { ...c, horizonMonths: 6 } }).points.length, 7);
  assert.equal(forecastAsset(ctx, 'T1', '2026-10-01', { dates: D, config: { ...c, minCampaigns: 9 } }).status, 'not_enough_history');
});

// ------------------------------------------------------------------------------------------------ on the seed

const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });

test('seed: a forecast for every tower, span and transformer that has history, and a reason for those that do not', async () => {
  const repo = make();
  const snap = await loadSnapshot(repo);
  const { byAsset, spread } = loadForecasts(snap);
  assert.equal(spread.tower.available, true);
  assert.equal(spread.power_transformer.available, true);
  assert.ok(spread.tower.low < 0);
  let ok = 0; let missing = 0;
  for (const fc of byAsset.values()) {
    if (fc.status === 'ok') {
      ok += 1;
      assert.equal(fc.points.length, 13);
      assert.ok(fc.endHi <= fc.hi);
      assert.ok(fc.points.every((p) => p.hi >= 0 && p.hi <= 100));
      if (fc.range.available) assert.ok(fc.points.every((p) => p.lower <= p.hi && p.hi <= p.upper));
    } else { missing += 1; assert.equal(fc.status, 'not_enough_history'); assert.equal(fc.points, undefined); }
  }
  assert.ok(ok > 250 && missing >= 5);
  assert.equal([...byAsset.values()].filter((x) => x.method === 'dga').length, 6);
  const never = (await loadAssetDetail(repo, snap, 'TWR-132-01-041')).forecast;
  assert.equal(never.status, 'not_enough_history');
});

test('seed: the dashboard count is the list, and every listed asset really crosses a band within 12 months', async () => {
  const snap = await loadSnapshot(make());
  const d = loadDashboard(snap).forecast;
  assert.equal(d.count, d.rows.length);
  assert.ok(d.count > 0);
  assert.equal(d.horizonMonths, 12);
  for (const r of d.rows) {
    const fc = forecastFor(snap, r.id);
    assert.equal(fc.dropsBand, true);
    assert.equal(fc.crossing.date, r.date);
    assert.ok(r.date > snap.asOf && r.date <= addDays(snap.asOf, 366));
    assert.notEqual(r.into, r.band);
  }
  assert.deepEqual(d.rows.map((r) => r.daysAhead), [...d.rows.map((r) => r.daysAhead)].sort((a, b) => a - b));
  const kv = await loadSnapshot(make(), snap.asOf, { kv: 500 });
  const narrow = droppingAssets(kv);
  assert.ok(narrow.count < d.count);
  assert.ok(narrow.rows.every((r) => kv.byId.get(r.id).voltage_kv === 500));
});

test('seed: moving the as-of date back changes the forecast', async () => {
  const repo = make();
  const now = await loadSnapshot(repo);
  const before = await loadSnapshot(repo, '2026-06-01');
  assert.notDeepEqual(droppingAssets(before).rows.map((r) => r.id), droppingAssets(now).rows.map((r) => r.id));
  assert.ok(loadForecasts(before).dates.every((x) => x <= '2026-06-01'));
  // an as-of date after one campaign leaves towers and spans with nothing to forecast from (transformers still have DGA samples)
  const early = await loadSnapshot(repo, '2026-03-15');
  const { byAsset } = loadForecasts(early);
  assert.ok([...byAsset.values()].filter((x) => x.kind === 'trend').every((x) => x.status === 'not_enough_history'));
  assert.ok([...byAsset.values()].filter((x) => x.kind === 'dga').every((x) => x.status === 'ok'));
});

test('seed: a repair resets the trend; a repaired asset whose defect came back shows the recurrence', async () => {
  const snap = await loadSnapshot(make());
  const { byAsset } = loadForecasts(snap);
  const reset = [...byAsset.values()].filter((x) => x.status === 'ok' && x.method === 'trend' && x.resetAt);
  assert.ok(reset.length > 0);
  for (const x of reset) assert.ok(x.usedPoints.every((p) => p.date >= x.resetAt));
  const recurred = [...byAsset.values()].filter((x) => x.status === 'ok' && x.drivers.recurrence.recurred > 0);
  assert.ok(recurred.length > 0);
  for (const x of recurred) assert.ok(x.drivers.recurrence.extraPerYear > 0);
});
