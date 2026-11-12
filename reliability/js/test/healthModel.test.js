import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadLineHealth, loadTowerHealth, listLines, listTowers, orderAlong, TOWER_GROUPS } from '../app/healthModel.js';
import { healthIndex } from '../domain/health/healthIndex.js';

const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
const ready = async (repo = make()) => ({ repo, snap: await loadSnapshot(repo) });

test('lines: the three lines, shortest voltage first, with their scores', async () => {
  const { snap } = await ready();
  const lines = listLines(snap);
  assert.deepEqual(lines.map((l) => [l.id, l.kv]), [['L-132-01', 132], ['L-220-03', 220], ['L-500-01', 500]]);
  for (const l of lines) assert.equal(l.hi, snap.scores.get(l.id).hi.score);
});

test('line strip: towers in order along the line with a span between each pair; duplicate records are not drawn', async () => {
  const { snap } = await ready();
  const m = loadLineHealth(snap, 'L-132-01');
  assert.equal(m.found, true);
  assert.deepEqual([m.towers.length, m.spans.length, m.units.length], [44, 43, 87]);
  assert.ok(m.units.every((u, i) => u.index === i && u.kind === (i % 2 ? 'span' : 'tower')), 'towers at even positions, spans at odd');
  assert.deepEqual(m.towers.slice(0, 3).map((u) => u.id), ['TWR-132-01-001', 'TWR-132-01-002', 'TWR-132-01-003']);
  assert.deepEqual(m.towers.slice(-5).map((u) => u.id), ['TWR-132-01-040', 'TWR-132-01-041', 'TWR-132-01-042', 'TWR-132-01-043', 'TWR-132-01-044']);
  assert.deepEqual(m.duplicates.map((d) => d.id).sort(), ['MX-TOW-1044', 'MX-TOW-1156', 'MX-TOW-1212']);
  for (const [i, s] of m.spans.entries()) {
    assert.match(s.id, /^SPN-132-01-/);
    const [a, b] = [m.units[s.index - 1], m.units[s.index + 1]];
    assert.equal(s.id, `SPN-132-01-${a.id.slice(-3)}-${b.id.slice(-3)}`, `span ${i} joins its neighbours`);
    assert.equal(typeof s.clearance, 'number');
  }
});

test('line strip: each unit carries the Phase 2 score and band; not-assessed units are grey, not good', async () => {
  const { snap } = await ready();
  const m = loadLineHealth(snap, 'L-132-01');
  for (const u of m.units) {
    const hi = snap.scores.get(u.id).hi;
    assert.equal(u.hi, hi.score);
    assert.equal(u.band, hi.score === null ? 'none' : hi.band);
    assert.equal(u.assessed, hi.score !== null);
  }
  const na = m.notAssessed.map((n) => n.id);
  assert.deepEqual(na.filter((id) => id.startsWith('TWR-')), ['TWR-132-01-041', 'TWR-132-01-042', 'TWR-132-01-043', 'TWR-132-01-044']);
  assert.equal(na.filter((id) => id.startsWith('SPN-')).length, 4);
  assert.equal(na.length, 8);
  assert.ok(m.units.filter((u) => !u.assessed).every((u) => u.band === 'none' && u.hi === null && u.reason));
});

test('line score: the breakdown of Phase 2, band counts, five worst, coverage, and a history at each campaign', async () => {
  const { snap } = await ready();
  const m = loadLineHealth(snap, 'L-132-01');
  const hi = snap.scores.get('L-132-01').hi;
  assert.deepEqual([m.hi, m.band, m.coverageByLength], [hi.score, hi.band, hi.breakdown.coverageByLength]);
  assert.equal(m.worst.length, 5);
  assert.deepEqual(m.worst.map((w) => w.assetId).slice(0, 2), ['SPN-132-01-009-010', 'TWR-132-01-011']);
  assert.equal(m.bandCounts.all.poor, 2);
  assert.equal(m.attention.poor + m.attention.moderate, m.bandCounts.all.poor + m.bandCounts.all.moderate);
  assert.equal(m.trend.values.length, snap.dates.length);
  assert.deepEqual(m.trend.labels, ['2026 Q1', '2026 Q2', '2026 Q4', 'Today']);
  assert.equal(m.trend.values.at(-1), m.hi);
  m.trend.dates.forEach((d, i) => assert.equal(m.trend.values[i], healthIndex(snap.ctx, 'L-132-01', d).score));
  assert.equal(m.openTotal, m.units.reduce((n, u) => n + u.open, 0));
  assert.equal(m.trend.open.at(-1), m.openTotal);
});

test('line: an unknown id and a tower id are not lines', async () => {
  const { snap } = await ready();
  assert.deepEqual(loadLineHealth(snap, 'L-NOPE'), { found: false, id: 'L-NOPE' });
  assert.equal(loadLineHealth(snap, 'TWR-132-01-011').found, false);
});

test('orderAlong follows the spans, whatever order the towers come in; a tower no span reaches goes last', () => {
  const T = (id) => ({ asset_id: id });
  const S = (a, b) => ({ asset_id: `S-${a}-${b}`, ext: { from_tower: a, to_tower: b } });
  const out = orderAlong([T('c'), T('a'), T('d'), T('b'), T('x')], [S('b', 'c'), S('a', 'b'), S('c', 'd')]);
  assert.deepEqual(out.map((u) => u.tower.asset_id), ['a', 'b', 'c', 'd', 'x']);
  assert.deepEqual(out.map((u) => u.spanAfter?.asset_id ?? null), ['S-a-b', 'S-b-c', 'S-c-d', null, null]);
});

test('tower list: filters by line and band; duplicate records come last and say so', async () => {
  const { snap } = await ready();
  const all = listTowers(snap);
  assert.equal(all.length, 159);
  const firstDup = all.findIndex((t) => t.duplicate);
  assert.ok(all.slice(firstDup).every((t) => t.duplicate) && all.slice(0, firstDup).every((t) => !t.duplicate));
  assert.equal(all[0].id, 'TWR-132-01-001');
  assert.equal(listTowers(snap, { line: 'L-220-03' }).every((t) => t.line === 'L-220-03'), true);
  assert.deepEqual(listTowers(snap, { line: 'L-132-01', band: 'none' }).map((t) => t.id).filter((id) => id.startsWith('TWR-')), ['TWR-132-01-041', 'TWR-132-01-042', 'TWR-132-01-043', 'TWR-132-01-044']);
  assert.ok(listTowers(snap, { band: 'poor' }).every((t) => t.band === 'poor' && t.hi < 40));
});

test('tower: scores, the cap, and the six groups with their zones', async () => {
  const { repo, snap } = await ready();
  const m = await loadTowerHealth(repo, snap, 'TWR-132-01-011');
  assert.deepEqual([m.hi, m.band, m.assessed], [34.6, 'poor', true]);
  assert.deepEqual([m.cap.applied, m.cap.uncappedScore], [true, 86.7]);
  assert.deepEqual(m.groups.map((g) => g.id), TOWER_GROUPS.map((g) => g.id));
  assert.deepEqual(Object.fromEntries(m.groups.map((g) => [g.id, g.score])), { lightning_protection: 1, insulators: 5, conductor_accessories: 5, steel_structure: 5, tower_accessories: 5, foundation: 5 });
  const lp = m.groups.find((g) => g.id === 'lightning_protection');
  assert.deepEqual([lp.findings, lp.worstComponent.id, lp.worstComponent.score], [3, 'EW-132-01-011', 1]);
  const zones = m.groups.flatMap((g) => g.zones);
  assert.deepEqual(zones.sort(), ['body', 'conductor hardware', 'crossarms', 'earthwire peak', 'fittings', 'foundation', 'insulator strings', 'legs']);
  assert.equal(m.findings.total, 3);
  assert.equal(m.worstFinding, 1);
  assert.deepEqual([m.newest, m.ageDays], ['2026-10-28', 14]);
});

test('tower: the campaign comparison has a column per campaign and today, with changes and the repairs between', async () => {
  const { repo, snap } = await ready();
  const m = await loadTowerHealth(repo, snap, 'TWR-132-01-011');
  assert.deepEqual(m.compare.columns.map((c) => c.label), ['2026 Q1', '2026 Q2', '2026 Q4', 'Today']);
  assert.ok(m.compare.columns.every((c) => c.flown));
  m.compare.columns.forEach((c) => assert.equal(c.hi, healthIndex(snap.ctx, 'TWR-132-01-011', c.date).score));
  const ins = m.compare.rows.find((r) => r.id === 'insulators').cells;
  assert.deepEqual(ins.map((c) => c.value), [5, 4, 5, 5]);
  assert.deepEqual(ins.map((c) => c.change), [null, 'worse', 'better', 'same']);
  assert.deepEqual(m.compare.columns.map((c) => c.repairs.map((r) => r.id)), [[], [], ['RPR-0071'], []]);
});

test('tower: a tower that was never inspected is not assessed in every column, and its groups have no score', async () => {
  const { repo, snap } = await ready();
  const m = await loadTowerHealth(repo, snap, 'TWR-132-01-041');
  assert.deepEqual([m.assessed, m.hi, m.band, m.risk], [false, null, 'none', null]);
  assert.match(m.reason, /^No evidence on or before 2026-11-11$/);
  assert.ok(m.groups.every((g) => g.score === null));
  assert.ok(m.compare.columns.every((c) => !c.flown && c.hi === null));
  assert.equal(m.findings.total, 0);
  assert.equal(m.newest, null);
});

test('tower: unknown ids and spans are not towers; a duplicate record is flagged', async () => {
  const { repo, snap } = await ready();
  assert.deepEqual(await loadTowerHealth(repo, snap, 'NOPE'), { found: false, id: 'NOPE' });
  assert.equal((await loadTowerHealth(repo, snap, 'SPN-132-01-009-010')).found, false);
  assert.equal((await loadTowerHealth(repo, snap, 'MX-TOW-1156')).tower.duplicate, true);
});

test('both screens follow a reviewer decision: reject a finding and the tower and its line recompute', async () => {
  const repo = make();
  const before = await ready(repo);
  const t0 = await loadTowerHealth(repo, before.snap, 'TWR-132-01-010');
  const l0 = loadLineHealth(before.snap, 'L-132-01');
  assert.equal(t0.hi, 66.9);
  await repo.rejectFinding('F-0090', { reason: 'Wrong location' });
  const after = await ready(repo);
  const t1 = await loadTowerHealth(repo, after.snap, 'TWR-132-01-010');
  const l1 = loadLineHealth(after.snap, 'L-132-01');
  assert.equal(t1.hi, 100);
  assert.ok(l1.hi > l0.hi);
  assert.equal(t1.findings.total, t0.findings.total - 1);
});
