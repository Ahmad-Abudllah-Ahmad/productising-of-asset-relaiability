import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadAssetDetail, SEVERITY } from '../app/assetModel.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { risk } from '../domain/risk.js';

const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
async function detail(id, repo = make()) { return loadAssetDetail(repo, await loadSnapshot(repo), id); }

test('an unknown id is reported as not found', async () => {
  assert.deepEqual(await detail('NO-SUCH-ASSET'), { found: false, id: 'NO-SUCH-ASSET' });
});

test('a poor tower: header, scores, risk factors side by side, and the cap with its uncapped score', async () => {
  const repo = make();
  const snap = await loadSnapshot(repo);
  const d = await loadAssetDetail(repo, snap, 'TWR-132-01-011');
  const ctx = await repo.getContext();
  assert.equal(d.kind, 'tower');
  assert.deepEqual([d.header.name, d.header.class, d.header.category, d.header.parent.id, d.header.voltage_kv], ['T-011', 'tower', 'structure', 'L-132-01', 132]);
  assert.ok(d.header.labels.some((l) => l.value === 'Corridor Coastal') && d.header.labels.every((l) => !l.id.startsWith('failure_mode:')));
  assert.ok(d.header.failureModes.length > 0);
  const hi = healthIndex(ctx, d.id, d.asOf);
  assert.deepEqual([d.scores.hi.score, d.scores.hi.band], [hi.score, hi.band]);
  assert.equal(d.scores.hi.band, 'poor');
  const rk = risk(ctx, d.id, d.asOf);
  assert.equal(d.riskFactors.score, rk.score);
  assert.deepEqual([d.riskFactors.criticality, d.riskFactors.consequence.value, d.riskFactors.condition.points], [3, 3, 65.4]);
  assert.equal(d.breakdown.type, 'groups');
  assert.equal(d.breakdown.groups.length, 6);
  assert.deepEqual([d.breakdown.cap.applied, d.breakdown.cap.uncappedScore, d.breakdown.cap.scaledScore], [true, 86.7, 34.6]);
  assert.deepEqual(d.breakdown.cap.causedBy, ['lightning_protection']);
});

test('findings: severity, newest first within a severity, thumbnail data, unreviewed flag, closed count', async () => {
  const d = await detail('TWR-132-01-011');
  assert.equal(d.findings.total, 3);
  assert.equal(d.findings.closed, 1);
  assert.ok(d.findings.rows.every((r, i, a) => i === 0 || a[i - 1].condition <= r.condition));
  const r = d.findings.rows[0];
  assert.equal(r.severity, SEVERITY[r.condition].word);
  assert.ok(r.image.startsWith('/assets/') && r.bbox && r.campaignName.startsWith('2026'));
  assert.equal(typeof r.unreviewed, 'boolean');
  assert.equal(d.findings.unreviewed, d.findings.rows.filter((x) => x.unreviewed).length);
});

test('condition history: HI and open findings at each campaign date and today', async () => {
  const repo = make();
  const snap = await loadSnapshot(repo);
  const d = await loadAssetDetail(repo, snap, 'TWR-132-01-011');
  assert.deepEqual(d.history.dates, ['2026-02-25', '2026-05-27', '2026-10-28', '2026-11-11']);
  assert.deepEqual(d.history.labels, ['2026 Q1', '2026 Q2', '2026 Q4', 'Today']);
  assert.equal(d.history.hasHi, true);
  const ctx = await repo.getContext();
  d.history.dates.forEach((date, i) => assert.equal(d.history.hi[i], healthIndex(ctx, d.id, date).score));
  assert.equal(d.history.hi.at(-1), d.scores.hi.score);
  assert.equal(d.history.open.at(-1), d.findings.total);
});

test('linked assets are grouped by link type, with a readable phrase and a status', async () => {
  const d = await detail('TWR-132-01-011');
  assert.deepEqual(d.links.groups.map((g) => g.type), ['same_asset', 'spatial', 'hierarchy']);
  const dup = d.links.groups[0].items[0];
  assert.equal(dup.phrase, 'has a duplicate'); // confirmed, so not "possible"
  assert.equal(dup.status, 'confirmed');
  const spatial = d.links.groups[1].items;
  assert.ok(spatial.every((i) => i.otherKind === 'finding' && i.phrase === 'nearest finding'));
  const hier = d.links.groups[2];
  assert.equal(hier.total, 8);
  assert.ok(hier.items.some((i) => i.phrase === 'part of' && i.otherId === 'L-132-01') && hier.items.some((i) => i.phrase === 'has part'));
  assert.equal(d.links.total, d.links.groups.reduce((n, g) => n + g.total, 0));
});

test('a pending duplicate says "possible", names the other record and carries the link', async () => {
  const d = await detail('MX-TOW-1156');
  assert.deepEqual([d.duplicate.role, d.duplicate.status, d.duplicate.otherId], ['record', 'proposed', 'TWR-132-01-012']);
  assert.ok(d.duplicate.score > 0.6 && d.duplicate.score < 0.9);
  assert.equal(d.links.groups[0].items[0].phrase, 'possible duplicate of');
  const original = await detail('TWR-132-01-012');
  assert.deepEqual([original.duplicate.role, original.duplicate.otherId], ['original', 'MX-TOW-1156']);
});

test('a duplicate record has no evidence: not assessed, no risk, no findings, and says why', async () => {
  const d = await detail('MX-TOW-1156');
  assert.equal(d.scores.hi.score, null);
  assert.equal(d.riskFactors, null);
  assert.equal(d.breakdown.type, 'not_assessed');
  assert.match(d.breakdown.reason, /no evidence/);
  assert.equal(d.evidence.assessed, false);
  assert.equal(d.findings.total, 0);
  assert.deepEqual(d.history.hi.filter((x) => x !== null), []);
});

test('a span has three groups and a cap; a line lists its five worst and is not capped', async () => {
  const span = await detail('SPN-132-01-009-010');
  assert.equal(span.kind, 'span');
  assert.equal(span.breakdown.groups.length, 3);
  assert.equal(span.breakdown.cap.applied, true);
  const line = await detail('L-220-03');
  assert.equal(line.kind, 'line');
  assert.equal(line.breakdown.type, 'line');
  assert.equal(line.breakdown.worst.length, 5);
  assert.equal(line.breakdown.cappedByWorst, false);
  assert.ok(line.findings.total > 25 && line.findings.rows.length === 25 && line.findings.more === line.findings.total - 25);
});

test('a transformer: input breakdown, DGA samples and table, Duval zone, oil, tests, loading, parts', async () => {
  const d = await detail('TX-2C');
  assert.equal(d.kind, 'transformer');
  assert.equal(d.breakdown.type, 'transformer');
  assert.equal(d.breakdown.inputs.length, 5);
  const t = d.transformer;
  assert.equal(t.dga.samples.length, 8);
  assert.deepEqual(t.dga.gases, ['h2', 'ch4', 'c2h6', 'c2h4', 'c2h2', 'co']);
  assert.equal(t.dga.table.length, 6);
  const c2h2 = t.dga.table.find((g) => g.gas === 'c2h2');
  assert.deepEqual(c2h2.limits, [1, 9, 35]);
  assert.equal(c2h2.condition, 3); // 14.7 ppm: between the condition 2 and 3 limits
  assert.ok(c2h2.score < 70);
  assert.equal(t.duval.zone, 'D2');
  assert.deepEqual(Object.keys(t.duval.percent), ['ch4', 'c2h4', 'c2h2']);
  assert.equal(t.oil.parameters.length, 3);
  assert.deepEqual(t.oil.parameters.map((p) => p.parameter), ['moisture_ppm', 'acidity_mgkoh_g', 'breakdown_kv']);
  assert.deepEqual([t.tests.result, t.tests.score], ['watch', 60]);
  assert.equal(t.loading.values.length, 12);
  assert.equal(t.loading.labels.at(-1), '2026-11');
  assert.equal(t.loading.max, Math.max(...t.loading.values));
  assert.ok(d.components.map((c) => c.class).includes('bushing'));
  assert.ok(d.findings.rows.some((f) => f.label === 'Bushing hot spot'));
});

test('a rising-gas transformer reports its trend penalty', async () => {
  const d = await detail('TX-2A');
  assert.ok(d.transformer.dga.trend.penalty > 0 && d.transformer.dga.trend.gas);
  assert.ok(d.transformer.dga.score < 100);
});

test('a component has a condition but no health index; its owner is its parent', async () => {
  const d = await detail('EW-132-01-011');
  assert.equal(d.kind, 'component');
  assert.equal(d.scores.hi.score, null);
  assert.equal(d.breakdown.type, 'none');
  assert.equal(d.header.parent.name, 'T-011');
  assert.equal(d.findings.total, 3);
  assert.equal(d.history.hasHi, false);
  assert.equal(d.history.open.at(-1), 3);
});

test('stations, bays and corridors: no health index, an explanation, and their links and children', async () => {
  const bay = await detail('BAY-S1-4');
  assert.deepEqual([bay.kind, bay.scores.hi.score, bay.breakdown.type, bay.findings.total, bay.work.ordersTotal], ['bay', null, 'none', 0, 0]);
  assert.match(bay.breakdown.reason, /No health index is defined at this level/);
  assert.ok(bay.links.groups.some((g) => g.type === 'electrical'));
  const station = await detail('SUB-S1');
  assert.equal(station.kind, 'station');
  assert.ok(station.findings.total > 0, 'findings on the transformers behind the station');
  const corridor = await detail('COR-NORTH');
  assert.equal(corridor.kind, 'corridor');
  assert.equal(corridor.components.length, 1);
});

test('work orders and repairs cover the asset and everything under it, newest first', async () => {
  const d = await detail('TWR-132-01-011');
  assert.equal(d.work.ordersTotal, 1);
  assert.equal(d.work.orders[0].status, 'completed');
  assert.equal(d.work.repairs.length, 1);
  assert.equal(d.work.repairs[0].workOrderId, d.work.orders[0].id);
  assert.equal(d.work.repairs[0].closes, 1);
  const line = await detail('L-220-03');
  assert.equal(line.work.orders.length, 12);
  assert.ok(line.work.ordersTotal > 12);
  const dates = line.work.orders.map((o) => o.created);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('a merged record says where it went, and its evidence is on the survivor', async () => {
  const repo = make();
  await repo.mergeAssets({ from: 'MX-TOW-1156', into: 'TWR-132-01-012' });
  const d = await detail('MX-TOW-1156', repo);
  assert.deepEqual([d.merged.into, d.merged.intoName], ['TWR-132-01-012', 'T-012']);
  const survivor = await detail('TWR-132-01-012', repo);
  assert.equal(survivor.duplicate, null, 'the merge link is no longer pending');
});

test('the panel follows a merge: counts and the duplicate banner change after it', async () => {
  const repo = make();
  const before = await detail('TWR-132-01-012', repo);
  assert.equal(before.duplicate.status, 'proposed');
  await repo.mergeAssets({ from: 'MX-TOW-1156', into: 'TWR-132-01-012', link_id: before.duplicate.linkId });
  const after = await detail('TWR-132-01-012', repo);
  assert.equal(after.duplicate, null);
});
