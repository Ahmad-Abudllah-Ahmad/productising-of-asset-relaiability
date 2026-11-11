import { test } from 'node:test';
import assert from 'node:assert/strict';
import { towerHi, spanHi, lineHi } from '../domain/health/lineHi.js';
import { generateSeed } from '../data/seed.js';
import { fixture, F, repair, withConfig } from './fixtures.js';
import { CONFIG } from '../domain/config.js';

const AFTER_C1 = '2026-03-02';
const ALL = ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection', 'tower_accessories'];
const tower = (findings, config) => towerHi(fixture({ findings, config }).ctx, 'T2', AFTER_C1);

// The cap scales the weighted score into the capped band:
//   poor:     39.9 x uncapped / 100
//   moderate: 40 + (69.9 - 40) x uncapped / 100
// and never raises a score.

test('a single very poor group (condition 1) takes a tower into the poor band, scaled by the rest of its condition', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')]);
  assert.equal(r.breakdown.cap.uncappedScore, 86.7); // five groups at 5, one at 1: (25+1)/30
  assert.equal(r.score, 34.6); // 39.9 x 86.7 / 100
  assert.equal(r.band, 'poor');
  assert.deepEqual(r.breakdown.cap, { applied: true, band: 'poor', condition: 1, causedBy: ['insulators'], uncappedScore: 86.7, bandTop: 39.9, scaledScore: 34.6 });
});

test('a single poor group (condition 2) takes a tower into the moderate band', () => {
  const r = tower([F('F1', 'T2-FND', 'foundation', 2, '2026-02-10')]);
  assert.equal(r.breakdown.cap.uncappedScore, 90);
  assert.equal(r.score, 66.9); // 40 + 29.9 x 90 / 100
  assert.equal(r.band, 'moderate');
  assert.deepEqual(r.breakdown.cap, { applied: true, band: 'moderate', condition: 2, causedBy: ['foundation'], uncappedScore: 90, bandTop: 69.9, scaledScore: 66.9 });
});

test('capped towers are no longer tied: the same worst group, different rest-of-tower condition, different score', () => {
  const clean = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')]);
  const worse = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 3, '2026-02-10'), F('F3', 'T2', 'steel_structure', 3, '2026-02-10')]);
  assert.equal(clean.band, 'poor');
  assert.equal(worse.band, 'poor');
  assert.ok(worse.score < clean.score, `${worse.score} should be below ${clean.score}`);
  assert.notEqual(worse.score, clean.score);
});

test('a group at condition 3 or better does not cap', () => {
  const r = tower([F('F1', 'T2-FND', 'foundation', 3, '2026-02-10')]);
  assert.equal(r.score, 93.3);
  assert.equal(r.breakdown.cap.applied, false);
  assert.equal(r.breakdown.cap.scaledScore, null);
  assert.deepEqual(r.breakdown.cap.causedBy, []);
});

test('with no findings there is no cap', () => {
  const r = tower([]);
  assert.equal(r.score, 100);
  assert.equal(r.breakdown.cap.applied, false);
});

test('with a condition 1 and a condition 2 group, the stronger (poor) cap wins and only its group is named', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 2, '2026-02-10')]);
  assert.equal(r.breakdown.cap.uncappedScore, 76.7); // (1+2+4*5)/30
  assert.equal(r.score, 30.6); // 39.9 x 76.7 / 100
  assert.deepEqual(r.breakdown.cap.causedBy, ['insulators']);
  assert.equal(r.breakdown.cap.condition, 1);
});

test('two groups at the same condition are both named as the cause', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 1, '2026-02-10')]);
  assert.deepEqual(r.breakdown.cap.causedBy.sort(), ['foundation', 'insulators']);
});

test('a cap never raises a score: a poor-condition tower whose average is already low stays at or below it', () => {
  const allTwo = tower(ALL.map((g, i) => F(`F${i}`, 'T2', g, 2, '2026-02-10')));
  assert.equal(allTwo.breakdown.cap.uncappedScore, 40);
  assert.equal(allTwo.score, 40); // scaling 40 into moderate would give 52, so nothing changes
  assert.equal(allTwo.breakdown.cap.applied, false);
  assert.equal(allTwo.breakdown.cap.scaledScore, 52);
  const low = tower(ALL.map((g, i) => F(`F${i}`, 'T2', g, 1, '2026-02-10')));
  assert.equal(low.breakdown.cap.uncappedScore, 20);
  assert.equal(low.score, 8); // 39.9 x 20 / 100 pulls it down, never up
  assert.ok(low.score <= low.breakdown.cap.uncappedScore);
  for (const s of [1, 2, 3, 4]) {
    const r = tower(ALL.map((g, i) => F(`F${i}`, 'T2', g, i === 0 ? s : 5, '2026-02-10')));
    assert.ok(r.score <= r.breakdown.cap.uncappedScore, `condition ${s}`);
  }
});

test('the same cap applies to a span', () => {
  const poor = spanHi(fixture({ findings: [F('F1', 'S1-CND', 'conductor', 1, '2026-02-10')] }).ctx, 'S1', AFTER_C1);
  assert.equal(poor.breakdown.cap.uncappedScore, 73.3);
  assert.equal(poor.score, 29.2);
  assert.equal(poor.band, 'poor');
  assert.deepEqual(poor.breakdown.cap.causedBy, ['conductor']);
  const moderate = spanHi(fixture({ findings: [F('F1', 'S1-ROW', 'right_of_way', 2, '2026-02-10')] }).ctx, 'S1', AFTER_C1);
  assert.equal(moderate.score, 63.9); // uncapped (5+5+2)/15 = 80, so 40 + 29.9 x 80 / 100
  assert.equal(moderate.band, 'moderate');
});

test('the cap lifts when the cause is repaired', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])] });
  assert.equal(towerHi(ctx, 'T2', '2026-03-31').score, 34.6);
  const after = towerHi(ctx, 'T2', '2026-04-01');
  assert.equal(after.score, 100);
  assert.equal(after.breakdown.cap.applied, false);
});

test('the capped band follows the band cut-offs in config', () => {
  const cfg = withConfig({ bands: { normalMin: 80, poorBelow: 50 } });
  assert.equal(tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], cfg).score, 43.3); // 49.9 x 86.7 / 100
  assert.equal(tower([F('F1', 'T2-FND', 'foundation', 2, '2026-02-10')], cfg).score, 76.9); // 50 + 29.9 x 90 / 100
});

test('the mapping is a setting: condition 1 can be mapped to moderate, and the cap can be switched off', () => {
  const soft = withConfig({ scoring: { conditionCap: { 1: 'moderate' } } });
  assert.equal(tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], soft).score, 65.9);
  assert.equal(tower([F('F1', 'T2-FND', 'foundation', 2, '2026-02-10')], soft).breakdown.cap.applied, false);
  const off = withConfig({ scoring: { conditionCap: {} } });
  assert.equal(tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], off).score, 86.7);
});

test('the default mapping is condition 1 -> poor and condition 2 -> moderate, with bands at 70 and 40', () => {
  assert.deepEqual(CONFIG.scoring.conditionCap, { 1: 'poor', 2: 'moderate' });
  assert.equal(CONFIG.bands.normalMin, 70);
  assert.equal(CONFIG.bands.poorBelow, 40);
});

test('line HI is not capped: it is the length-weighted mean of the (capped) tower and span HIs', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')] });
  const r = lineHi(ctx, 'L1', AFTER_C1);
  assert.equal(towerHi(ctx, 'T2', AFTER_C1).score, 34.6);
  // T2 weighs 500 of 2000: 100 - 500 x 65.4 / 2000 = 83.65
  assert.ok(Math.abs(r.score - 83.7) <= 0.1, String(r.score));
  assert.equal(r.band, 'normal');
  assert.equal(r.breakdown.cap, undefined);
  assert.equal(r.breakdown.cappedByWorst, false);
  assert.deepEqual(r.breakdown.worst[0], { assetId: 'T2', name: 'T2', class: 'tower', score: 34.6, band: 'poor' });
});

test('seed severity mix: most findings minor, a small share critical', () => {
  const { findings } = generateSeed();
  const share = (s) => findings.filter((f) => f.condition_score === s).length / findings.length;
  assert.ok(share(1) >= 0.03 && share(1) <= 0.1, `critical share ${share(1)}`);
  assert.ok(share(3) + share(4) >= 0.7, 'moderate and minor findings are the large majority');
  assert.ok(share(4) >= 0.35, 'minor findings are the biggest group');
  assert.equal(share(5), 0, 'a finding is never condition 5');
});
