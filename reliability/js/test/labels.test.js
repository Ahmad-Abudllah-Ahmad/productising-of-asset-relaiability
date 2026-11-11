import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { CONFIG, LABEL_KINDS, MANAGED_LABELS } from '../domain/config.js';
import { managedLabels, isManagedLabel, assetsWithLabel, assetsSharingLabel, categoryCountsForLabel } from '../domain/labels.js';

const seed = generateSeed();

test('the managed label list is in config and covers every kind the plan names', () => {
  assert.deepEqual([...LABEL_KINDS], ['corridor', 'circuit', 'substation', 'region', 'corrosion_zone', 'criticality_class', 'manufacturer', 'design_family', 'failure_mode']);
  for (const k of LABEL_KINDS) assert.ok(MANAGED_LABELS[k].length > 0, k);
  assert.equal(CONFIG.labels, MANAGED_LABELS);
  assert.throws(() => { MANAGED_LABELS.corridor.push('x'); }, TypeError, 'the list is frozen');
});

test('the seed publishes exactly the managed list, and every label on every asset is in it', () => {
  assert.deepEqual(seed.labels.map((l) => l.label_id).sort(), managedLabels().map((l) => l.label_id).sort());
  for (const a of seed.assets) for (const l of a.labels) assert.ok(isManagedLabel(l), `${a.asset_id} has unmanaged label ${l}`);
});

test('assets are labelled with corridor, circuit, region, corrosion zone, criticality class, manufacturer and design family', () => {
  const kindsOf = (id) => new Set(seed.assets.find((a) => a.asset_id === id).labels.map((l) => l.split(':')[0]));
  const tower = kindsOf('TWR-220-03-014');
  for (const k of ['corridor', 'circuit', 'region', 'corrosion_zone', 'criticality_class', 'design_family']) assert.ok(tower.has(k), `tower lacks ${k}`);
  const string = kindsOf('INS-220-03-014-A');
  assert.ok(string.has('manufacturer') && string.has('circuit'));
  const tx = kindsOf('TX-2A');
  for (const k of ['substation', 'corridor', 'manufacturer', 'design_family', 'criticality_class']) assert.ok(tx.has(k), `transformer lacks ${k}`);
});

test('all assets of any category sharing a label: one corridor gives towers, spans, components, right of way, substations and transformers', () => {
  const north = assetsWithLabel(seed.assets, 'corridor:corridor-north');
  const counts = categoryCountsForLabel(seed.assets, 'corridor:corridor-north');
  for (const c of ['line_network', 'structure', 'line_component', 'right_of_way', 'substation', 'transformer']) assert.ok(counts[c] > 0, c);
  assert.equal(north.length, Object.values(counts).reduce((s, n) => s + n, 0));
  assert.ok(north.some((a) => a.class === 'power_transformer'), 'end-substation transformers are included');
});

test('several labels: all must match by default, any with mode any', () => {
  const both = assetsWithLabel(seed.assets, ['corridor:corridor-north', 'corrosion_zone:c3']);
  const either = assetsWithLabel(seed.assets, ['corridor:corridor-north', 'corrosion_zone:c4'], { mode: 'any' });
  assert.ok(both.length > 0 && both.every((a) => a.labels.includes('corridor:corridor-north') && a.labels.includes('corrosion_zone:c3')));
  assert.ok(either.length > assetsWithLabel(seed.assets, 'corridor:corridor-north').length);
});

test('merged records are left out unless asked for', () => {
  const assets = seed.assets.map((a) => (a.asset_id === 'TWR-220-03-014' ? { ...a, merged_into: 'X' } : a));
  assert.ok(!assetsWithLabel(assets, 'circuit:l-220-03').some((a) => a.asset_id === 'TWR-220-03-014'));
  assert.ok(assetsWithLabel(assets, 'circuit:l-220-03', { includeMerged: true }).some((a) => a.asset_id === 'TWR-220-03-014'));
});

test('assetsSharingLabel lists what an asset shares with others, optionally by label kind', () => {
  const all = assetsSharingLabel(seed.assets, 'TX-2A');
  assert.ok(all.length > 0 && all.every((x) => x.shared.length > 0 && x.asset.asset_id !== 'TX-2A'));
  const sameFamily = assetsSharingLabel(seed.assets, 'TX-2A', { kinds: ['design_family'] });
  assert.ok(sameFamily.some((x) => x.asset.asset_id === 'TX-2B'), 'same design family');
  assert.ok(sameFamily.every((x) => x.shared.every((l) => l.startsWith('design_family:'))));
  assert.deepEqual(assetsSharingLabel(seed.assets, 'nope'), []);
});

test('unknown labels are rejected when the seed is built (the list is managed, not free text)', async () => {
  assert.equal(isManagedLabel('corridor:corridor-north'), true);
  assert.equal(isManagedLabel('corridor:made-up'), false);
});
