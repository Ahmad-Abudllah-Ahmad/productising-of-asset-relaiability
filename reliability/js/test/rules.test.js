import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { buildRuleLinks } from '../domain/linking/rules.js';
import { distM, pointToSegmentM, createGrid, anchorOf } from '../domain/linking/geo.js';
import { CONFIG } from '../domain/config.js';

const seed = generateSeed();
const rules = buildRuleLinks(seed);
const byId = new Map(seed.assets.map((a) => [a.asset_id, a]));
const key = (l) => `${l.type}|${l.relation ?? ''}|${l.from_asset}|${l.to_asset}`;

test('geometry helpers: distance, point to segment, grid and anchors', () => {
  const a = { lat: 40, lng: 49 };
  const b = { lat: 40.001, lng: 49 };
  assert.ok(Math.abs(distM(a, b) - 111.32) < 0.5);
  const mid = { lat: 40.0005, lng: 49.0003 };
  assert.ok(Math.abs(pointToSegmentM(mid, a, b) - 0.0003 * 111320 * Math.cos((40 * Math.PI) / 180)) < 0.5);
  assert.ok(pointToSegmentM({ lat: 40.002, lng: 49 }, a, b) > 100, 'beyond the end it measures to the end');
  const grid = createGrid(100);
  grid.insert('near', { lat: 40.0003, lng: 49 });
  grid.insert('far', { lat: 40.01, lng: 49 });
  assert.deepEqual(grid.near(a), ['near']);
  assert.deepEqual(anchorOf({ location: { type: 'line', coordinates: [[0, 0], [2, 4]] } }), { type: 'point', lat: 1, lng: 2 });
  assert.equal(anchorOf({ location: null }), null);
});

test('rules only add links the seed does not already have', () => {
  const existing = new Set(seed.links.map(key));
  for (const l of rules.links) assert.ok(!existing.has(key(l)), `duplicate of an existing link: ${key(l)}`);
  assert.equal(new Set(rules.links.map(key)).size, rules.links.length, 'no duplicates among the new links');
  assert.equal(rules.skippedExisting, 4, 'the four line-to-bay links the seed already has were skipped');
});

test('running the rules again over the data plus their own output adds nothing', () => {
  const again = buildRuleLinks({ ...seed, links: [...seed.links, ...rules.links] });
  assert.equal(again.links.length, 0);
});

test('every link is a confirmed rule link with a valid shape and real endpoints', () => {
  for (const l of rules.links) {
    assert.equal(l.source, 'rule');
    assert.equal(l.status, 'confirmed');
    assert.ok(l.confidence > 0 && l.confidence <= 1);
    assert.ok(/^LNK-R-\d{5}$/.test(l.link_id));
    assert.ok(byId.has(l.to_asset));
    if (l.from_kind === 'finding') assert.ok(seed.findings.some((f) => f.finding_id === l.from_asset));
    else assert.ok(byId.has(l.from_asset));
  }
});

test('spatial: each finding gets at most one link, to a tower or span within the configured distance', () => {
  const sp = rules.links.filter((l) => l.from_kind === 'finding');
  assert.equal(new Set(sp.map((l) => l.from_asset)).size, sp.length, 'one link per finding');
  assert.ok(sp.length >= seed.findings.length * 0.9, `${sp.length} of ${seed.findings.length} findings linked`);
  const max = CONFIG.linking.spatialMaxMeters;
  for (const l of sp) {
    const f = seed.findings.find((x) => x.finding_id === l.from_asset);
    const target = byId.get(l.to_asset);
    if (l.relation === 'nearest_tower') {
      assert.equal(target.class, 'tower');
      assert.ok(distM(f.location, target.location) <= max.findingToTower);
    } else {
      assert.equal(l.relation, 'nearest_span');
      assert.equal(target.class, 'span');
      assert.ok(pointToSegmentM(f.location, byId.get(target.ext.from_tower).location, byId.get(target.ext.to_tower).location) <= max.findingToSpan);
    }
  }
});

test('spatial: a finding is linked to the NEAREST tower, not just any tower in range', () => {
  const sp = rules.links.filter((l) => l.relation === 'nearest_tower');
  const towers = seed.assets.filter((a) => a.class === 'tower');
  for (const l of sp.slice(0, 60)) {
    const f = seed.findings.find((x) => x.finding_id === l.from_asset);
    const best = towers.reduce((m, t) => Math.min(m, distM(f.location, t.location)), Infinity);
    assert.ok(Math.abs(distM(f.location, byId.get(l.to_asset).location) - best) < 1e-6, l.from_asset);
  }
});

test('spatial: mid-span findings (conductor, corridor) link to the span, not a tower', () => {
  const midSpan = seed.findings.filter((f) => ['conductor', 'span_corridor_segment'].includes(byId.get(f.asset_id).class));
  const linked = rules.links.filter((l) => midSpan.some((f) => f.finding_id === l.from_asset));
  assert.ok(linked.length > 0);
  assert.ok(linked.filter((l) => l.relation === 'nearest_span').length >= linked.length * 0.8);
});

test('line ends: every line is linked to the substation at its end, by distance and by topology', () => {
  const ends = rules.links.filter((l) => l.from_asset.startsWith('L-') && l.to_asset.startsWith('SUB-'));
  const spatial = ends.filter((l) => l.type === 'spatial').map((l) => `${l.from_asset}>${l.to_asset}`).sort();
  const electrical = ends.filter((l) => l.type === 'electrical').map((l) => `${l.from_asset}>${l.to_asset}`).sort();
  const expected = ['L-132-01>SUB-S1', 'L-220-03>SUB-S1', 'L-220-03>SUB-S2', 'L-500-01>SUB-S2'];
  assert.deepEqual(spatial, expected);
  assert.deepEqual(electrical, expected);
  assert.ok(ends.filter((l) => l.relation === 'terminates_at').every((l) => l.type === 'electrical'));
});

test('a line end beyond the configured distance is not linked by the spatial rule', () => {
  const tight = { ...CONFIG, linking: { ...CONFIG.linking, spatialMaxMeters: { ...CONFIG.linking.spatialMaxMeters, lineEndToSubstation: 10 } } };
  assert.equal(buildRuleLinks(seed, tight).links.filter((l) => l.type === 'spatial' && l.relation === 'ends_near').length, 0);
});

test('a finding with nothing within range gets no link', () => {
  const far = { ...seed.findings[0], finding_id: 'F-FAR', location: { type: 'point', lat: 0, lng: 0 } };
  const r = buildRuleLinks({ ...seed, findings: [far] });
  assert.equal(r.links.filter((l) => l.from_asset === 'F-FAR').length, 0);
});

test('merged records are not link targets', () => {
  const t = seed.assets.find((a) => a.asset_id === 'TWR-220-03-014');
  const assets = seed.assets.map((a) => (a === t ? { ...a, merged_into: 'X' } : a));
  const r = buildRuleLinks({ ...seed, assets });
  assert.ok(!r.links.some((l) => l.to_asset === 'TWR-220-03-014'));
});
