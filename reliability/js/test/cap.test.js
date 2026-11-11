import { test } from 'node:test';
import assert from 'node:assert/strict';
import { towerHi, spanHi, lineHi } from '../domain/health/lineHi.js';
import { generateSeed } from '../data/seed.js';
import { fixture, F, repair, withConfig } from './fixtures.js';
import { CONFIG } from '../domain/config.js';

const AFTER_C1 = '2026-03-02';
const ALL = ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection', 'tower_accessories'];
const tower = (findings, config) => towerHi(fixture({ findings, config }).ctx, 'T2', AFTER_C1);

test('a single very poor group (condition 1) drops a tower to poor, whatever the other groups say', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')]);
  assert.equal(r.breakdown.cap.uncappedScore, 86.7); // five groups at 5, one at 1: (25+1)/30
  assert.equal(r.score, 39.9);
  assert.equal(r.band, 'poor');
  assert.deepEqual(r.breakdown.cap, { applied: true, limit: 39.9, band: 'poor', condition: 1, causedBy: ['insulators'], uncappedScore: 86.7 });
});

test('a single poor group (condition 2) holds a tower at moderate', () => {
  const r = tower([F('F1', 'T2-FND', 'foundation', 2, '2026-02-10')]);
  assert.equal(r.breakdown.cap.uncappedScore, 90);
  assert.equal(r.score, 69.9);
  assert.equal(r.band, 'moderate');
  assert.deepEqual(r.breakdown.cap, { applied: true, limit: 69.9, band: 'moderate', condition: 2, causedBy: ['foundation'], uncappedScore: 90 });
});

test('a group at condition 3 or better does not cap', () => {
  const r = tower([F('F1', 'T2-FND', 'foundation', 3, '2026-02-10')]);
  assert.equal(r.score, 93.3);
  assert.equal(r.breakdown.cap.applied, false);
  assert.equal(r.breakdown.cap.limit, null);
  assert.deepEqual(r.breakdown.cap.causedBy, []);
});

test('with no findings there is no cap', () => {
  const r = tower([]);
  assert.equal(r.score, 100);
  assert.equal(r.breakdown.cap.applied, false);
});

test('with a condition 1 and a condition 2 group, the stronger cap wins and only its group is named', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 2, '2026-02-10')]);
  assert.equal(r.score, 39.9);
  assert.deepEqual(r.breakdown.cap.causedBy, ['insulators']);
  assert.equal(r.breakdown.cap.condition, 1);
});

test('two groups at the same condition are both named as the cause', () => {
  const r = tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10'), F('F2', 'T2-FND', 'foundation', 1, '2026-02-10')]);
  assert.deepEqual(r.breakdown.cap.causedBy.sort(), ['foundation', 'insulators']);
});

test('a cap only ever lowers a score: when the average is already below the cap, nothing changes', () => {
  const r = tower(ALL.map((g, i) => F(`F${i}`, 'T2', g, 1, '2026-02-10')));
  assert.equal(r.score, 20);
  assert.equal(r.breakdown.cap.applied, false);
  assert.equal(r.breakdown.cap.limit, 39.9, 'the limit is still reported');
  assert.equal(r.breakdown.cap.causedBy.length, 6);
  const mid = tower(ALL.map((g, i) => F(`F${i}`, 'T2', g, 2, '2026-02-10')));
  assert.equal(mid.score, 40); // average 40 is already below the 69.9 cap
  assert.equal(mid.breakdown.cap.applied, false);
});

test('the same cap applies to a span', () => {
  const poor = spanHi(fixture({ findings: [F('F1', 'S1-CND', 'conductor', 1, '2026-02-10')] }).ctx, 'S1', AFTER_C1);
  assert.equal(poor.score, 39.9);
  assert.equal(poor.band, 'poor');
  assert.deepEqual(poor.breakdown.cap.causedBy, ['conductor']);
  const moderate = spanHi(fixture({ findings: [F('F1', 'S1-ROW', 'right_of_way', 2, '2026-02-10')] }).ctx, 'S1', AFTER_C1);
  assert.equal(moderate.score, 69.9);
  assert.equal(moderate.band, 'moderate');
});

test('the cap lifts when the cause is repaired', () => {
  const { ctx } = fixture({ findings: [F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], repairs: [repair('R1', 'T2-INS-A', '2026-04-01', ['F1'])] });
  assert.equal(towerHi(ctx, 'T2', '2026-03-31').score, 39.9);
  const after = towerHi(ctx, 'T2', '2026-04-01');
  assert.equal(after.score, 100);
  assert.equal(after.breakdown.cap.applied, false);
});

test('the cap values follow the band cut-offs in config', () => {
  const cfg = withConfig({ bands: { normalMin: 80, poorBelow: 50 } });
  assert.equal(tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], cfg).score, 49.9);
  assert.equal(tower([F('F1', 'T2-FND', 'foundation', 2, '2026-02-10')], cfg).score, 79.9);
});

test('the mapping is a setting: condition 1 can be mapped to moderate, and the cap can be switched off', () => {
  const soft = withConfig({ scoring: { conditionCap: { 1: 'moderate' } } });
  assert.equal(tower([F('F1', 'T2-INS-A', 'insulators', 1, '2026-02-10')], soft).score, 69.9);
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
  assert.equal(towerHi(ctx, 'T2', AFTER_C1).score, 39.9);
  // T2 weighs 500 of 2000: 100 - 500 * 60.1 / 2000 = 84.975
  assert.equal(r.score, 85);
  assert.equal(r.band, 'normal');
  assert.equal(r.breakdown.cap, undefined);
  assert.equal(r.breakdown.cappedByWorst, false);
  assert.deepEqual(r.breakdown.worst[0], { assetId: 'T2', name: 'T2', class: 'tower', score: 39.9, band: 'poor' });
});

test('seed severity mix: most findings minor, a small share critical', () => {
  const { findings } = generateSeed();
  const share = (s) => findings.filter((f) => f.condition_score === s).length / findings.length;
  assert.ok(share(1) >= 0.03 && share(1) <= 0.1, `critical share ${share(1)}`);
  assert.ok(share(3) + share(4) >= 0.7, 'moderate and minor findings are the large majority');
  assert.ok(share(4) >= 0.35, 'minor findings are the biggest group');
  assert.equal(share(5), 0, 'a finding is never condition 5');
});
