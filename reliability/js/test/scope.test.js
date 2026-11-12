import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { parseScope, scopePairs, hasFilters } from '../app/scope.js';
import { hashFor } from '../app/hashState.js';
import { loadDashboard } from '../app/dashboardModel.js';
import { loadHistory } from '../app/historyModel.js';
import { loadMap } from '../app/mapModel.js';
import { freshnessOf } from '../app/freshness.js';

const make = () => createRepository(generateSeed(), { storage: null });
const snapOf = async (asOf, filters) => loadSnapshot(make(), asOf, filters);

test('scope: read from the hash; nonsense is dropped; unset filters write nothing', () => {
  const limits = { first: '2026-02-02', last: '2026-11-11' };
  const s = parseScope('#fkv=220&fcat=towers&asof=2026-05-30', limits);
  assert.equal(s.kv, 220);
  assert.equal(s.category, 'towers');
  assert.equal(s.asOf, '2026-05-30');
  const bad = parseScope('#fkv=110&fcat=nope&asof=2025-01-01', limits);
  assert.equal(bad.kv, null);
  assert.equal(bad.category, null);
  assert.equal(bad.asOf, null);
  assert.equal(hasFilters({ label: null, kv: null, category: null, asOf: '2026-05-30' }), false);
  assert.deepEqual(scopePairs({ label: null, kv: 132, category: null, asOf: null }), [['fkv', '132']]);
});

test('scope in the URL: global filters ride along in every hash', () => {
  const cur = '#view=lines&line=L-132-01&fkv=220&asof=2026-05-30';
  assert.match(hashFor({ asset: 'X' }, cur), /fkv=220/);
  assert.match(hashFor({ view: 'map' }, cur), /asof=2026-05-30/);
  assert.doesNotMatch(hashFor({ fkv: null }, cur), /fkv/);
});

test('a voltage filter narrows lists and every screen model; scores stay whole', async () => {
  const all = await snapOf();
  const f = await snapOf(undefined, { kv: 220 });
  assert.equal(f.allAssets.length, all.allAssets.length);
  assert.ok(f.assets.length < all.assets.length);
  assert.equal(f.scores.get('TWR-132-01-011').hi.score, all.scores.get('TWR-132-01-011').hi.score);
  assert.equal(f.inScope('TWR-132-01-011'), false);
  assert.equal(f.inScope('TWR-220-03-001'), true);
  assert.ok(loadDashboard(f).lines.length < loadDashboard(all).lines.length);
  assert.ok(loadHistory(f).workOrders.length < loadHistory(all).workOrders.length);
  assert.ok(loadMap(f).towers.length < loadMap(all).towers.length);
});

test('an empty combination is empty, not an error', async () => {
  const none = await snapOf(undefined, { kv: 220, label: 'corridor:does-not-exist' });
  assert.equal(none.assets.length, 0);
  assert.equal(loadDashboard(none).empty, true);
});

test('as of: scores are for that date', async () => {
  const early = await snapOf('2026-03-15');
  const now = await snapOf();
  assert.equal(early.asOf, '2026-03-15');
  const differs = [...now.scores.keys()].filter((id) => early.scores.get(id)?.hi.score !== now.scores.get(id).hi.score);
  assert.ok(differs.length > 10, 'rescoring changes many assets');
});

test('freshness: stale only past the inspection interval, at the as-of date', async () => {
  const now = await snapOf();
  const late = await snapOf('2026-09-30');
  const fresh = freshnessOf(now, 'TWR-132-01-011');
  assert.equal(fresh.stale, false);
  assert.ok(fresh.ageDays >= 0);
  const s = freshnessOf(late, 'TWR-132-01-008');
  assert.equal(s.stale, true);
  assert.ok(s.ageDays > 180);
  assert.equal(freshnessOf(now, 'TWR-132-01-041').stale, false, 'no evidence is not assessed, never stale');
});
