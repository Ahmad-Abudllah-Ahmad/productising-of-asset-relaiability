import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { simulateSpan, CLASS, minClearanceFor } from '../domain/lidar/simulate.js';
import { lidarSpansFor, loadLidarSpan, hasLidar, LABEL_SIMULATED } from '../app/lidarModel.js';
import { registerCloudProvider, decimate, getCloud } from '../app/lidarSource.js';
import { loadLineHealth } from '../app/healthModel.js';
import { loadMap } from '../app/mapModel.js';
import { CONFIG } from '../domain/config.js';

const snapP = loadSnapshot(createRepository(generateSeed(), { storage: null }));

/** The clearance measured again from the points themselves, not taken from the generator's own bookkeeping. */
function measure(cloud) {
  const cond = [];
  for (let i = 0; i < cloud.count; i += 1) if (cloud.cls[i] === CLASS.CONDUCTOR) cond.push([cloud.x[i], cloud.y[i], cloud.z[i]]);
  let min = Infinity;
  for (let i = 0; i < cloud.count; i += 1) {
    if (cloud.cls[i] !== CLASS.GROUND && cloud.cls[i] !== CLASS.VEGETATION) continue;
    for (const q of cond) {
      if (Math.abs(q[0] - cloud.x[i]) > min) continue;
      const d = Math.hypot(cloud.x[i] - q[0], cloud.y[i] - q[1], cloud.z[i] - q[2]);
      if (d < min) min = d;
    }
  }
  return min;
}

test('simulated cloud: deterministic, four classes, capped', () => {
  const p = { spanId: 'SPN-T', kv: 132, lengthM: 300, towerHeightM: 30, clearanceM: 8.4 };
  const a = simulateSpan(p); const b = simulateSpan(p);
  assert.deepEqual(Array.from(a.cloud.z.slice(0, 200)), Array.from(b.cloud.z.slice(0, 200)));
  assert.equal(a.cloud.count, b.cloud.count);
  assert.deepEqual(a.stats.byClass.map((c) => c.cls), [1, 2, 3, 4]);
  assert.ok(a.stats.byClass.every((c) => c.n > 0));
  assert.ok(a.cloud.count <= CONFIG.lidar.maxPoints);
  assert.notDeepEqual(Array.from(simulateSpan({ ...p, spanId: 'SPN-U' }).cloud.z.slice(-80)), Array.from(a.cloud.z.slice(-80)));
});

test('conductors are catenaries: lowest at mid-span, sag grows with the span, towers are at the seed height', () => {
  const s = simulateSpan({ spanId: 'SPN-C', kv: 220, lengthM: 320, towerHeightM: 42, clearanceM: 8 });
  const ph = s.profile.map((q) => q.conductor);
  assert.equal(Math.min(...ph), ph[20]);
  assert.ok(ph[0] > ph[20] && ph[40] > ph[20] && Math.abs(ph[0] - ph[40]) < 0.11);
  assert.equal(s.geometry.attachZ, 42 - CONFIG.lidar.attachDropM);
  const tops = [];
  for (let i = 0; i < s.cloud.count; i += 1) if (s.cloud.cls[i] === CLASS.STRUCTURE) tops.push(s.cloud.z[i]);
  assert.ok(Math.max(...tops) >= 42 && Math.max(...tops) <= 43);
  const short = simulateSpan({ spanId: 'SPN-S', kv: 220, lengthM: 160, towerHeightM: 42, clearanceM: 8 });
  assert.ok(short.geometry.sag < s.geometry.sag);
});

test('every span in the seed: the cloud measures exactly the seed clearance (same value as Line Health and the map)', async () => {
  const snap = await snapP;
  const spans = snap.assets.filter((a) => a.class === 'span');
  assert.equal(spans.length, 151);
  const mp = new Map(loadMap(snap).spans.map((s) => [s.id, s.clearance]));
  const lh = new Map();
  for (const l of snap.assets.filter((a) => a.class === 'line')) {
    for (const u of loadLineHealth(snap, l.asset_id).units) if (u.kind === 'span') lh.set(u.assetId ?? u.id, u.clearance);
  }
  let violations = 0;
  for (const sp of spans) {
    const m = loadLidarSpan(snap, sp.asset_id);
    assert.equal(m.clearanceM, sp.ext.min_clearance_m, sp.asset_id);
    assert.equal(Math.round(measure(m.cloud) * 10) / 10, sp.ext.min_clearance_m, `${sp.asset_id}: measured from the points`);
    assert.equal(mp.get(sp.asset_id), sp.ext.min_clearance_m);
    if (lh.has(sp.asset_id)) assert.equal(lh.get(sp.asset_id), sp.ext.min_clearance_m);
    assert.equal(m.violation, sp.ext.min_clearance_m < minClearanceFor(sp.voltage_kv));
    if (m.violation) { violations += 1; assert.ok(m.redPoints > 0); } else assert.equal(m.redPoints, 0);
    assert.equal(m.label, LABEL_SIMULATED);
  }
  assert.ok(violations > 3 && violations < 40, `${violations} spans in violation`);
  assert.ok(lh.size > 100, `Line Health units compared: ${lh.size}`);
});

test('vegetation grows taller where the seed has a vegetation finding', async () => {
  const snap = await snapP;
  const withF = snap.assets.filter((a) => a.class === 'span' && (snap.findingsByOwner.get(a.asset_id) ?? []).some((f) => f.defect_class === 'vegetation_encroachment'));
  const base = { spanId: 'SPN-VEG', kv: 132, lengthM: 300, towerHeightM: 32, clearanceM: 10 };
  const topOf = (r) => {
    let t = 0;
    for (let i = 0; i < r.cloud.count; i += 1) if (r.cloud.cls[i] === CLASS.VEGETATION && Math.abs(r.cloud.x[i] - 150) > 8) t = Math.max(t, r.cloud.z[i]);
    return t;
  };
  assert.ok(topOf(simulateSpan({ ...base, vegetationFinding: true })) > topOf(simulateSpan(base)));
  if (withF.length) assert.equal(loadLidarSpan(snap, withF[0].asset_id).vegetationFinding, true);
});

test('which assets have a LiDAR tab: spans and towers, not components or lines; a tower shows both of its spans, tightest first', async () => {
  const snap = await snapP;
  assert.equal(hasLidar(snap, 'SPN-132-01-001-002'), true);
  assert.equal(hasLidar(snap, 'L-132-01'), false);
  assert.equal(hasLidar(snap, 'EW-132-01-011'), false);
  const spans = lidarSpansFor(snap, 'TWR-132-01-011');
  assert.equal(spans.length, 2);
  assert.ok(spans[0].ext.min_clearance_m <= spans[1].ext.min_clearance_m);
  assert.equal(lidarSpansFor(snap, 'TWR-132-01-001').length, 1);
});

test('a real scan can replace the simulation: a provider returns the same shape, others fall back', async () => {
  const snap = await snapP;
  const fake = { source: 'scan', cloud: { x: new Float32Array([0]), y: new Float32Array([0]), z: new Float32Array([1]), cls: new Uint8Array([1]), clearance: new Float32Array([NaN]), count: 1 }, profile: [], stats: { minClearanceM: 9, lowest: { x: 0, y: 0, z: 1 }, violation: false, redPoints: 0, points: 1, byClass: [] }, limitM: 7 };
  registerCloudProvider((p) => (p.spanId === 'SPN-132-01-001-002' ? fake : null));
  assert.equal(loadLidarSpan(snap, 'SPN-132-01-001-002').label, 'LiDAR scan');
  assert.equal(loadLidarSpan(snap, 'SPN-132-01-002-003').label, LABEL_SIMULATED);
  const big = getCloud({ spanId: 'SPN-132-01-002-003', kv: 132, lengthM: 300, towerHeightM: 30, clearanceM: 9 }).cloud;
  const small = decimate(big, 500);
  const fixed = Array.from(big.cls).filter((c) => c >= 3).length;
  assert.ok(small.count <= 500 + fixed && small.count < big.count);
});
