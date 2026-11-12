import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadDashboard, BANDS } from '../app/dashboardModel.js';
import { tableFor, kpisFor, linksKpis } from '../app/registryModel.js';
import { risk } from '../domain/risk.js';

const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
const ready = async (repo = make()) => ({ repo, snap: await loadSnapshot(repo) });

test('dashboard: assets by band add up to the registry rows of each category, so a drill-down list has the same count', async () => {
  const { snap } = await ready();
  const d = loadDashboard(snap);
  for (const c of d.byCategory) {
    const rows = tableFor(snap, c.id).rows;
    assert.equal(rows.length, c.total, c.id);
    assert.equal(BANDS.reduce((n, b) => n + c.counts[b], 0), c.total, `${c.id} bands add up`);
    for (const [band, word] of [['poor', 'poor'], ['moderate', 'moderate'], ['normal', 'normal'], ['none', 'not assessed']]) assert.equal(rows.filter((r) => r.facets.band === word).length, c.counts[band], `${c.id} ${word}`);
  }
  const t = d.byCategory.find((c) => c.id === 'towers').counts;
  assert.deepEqual([t.poor, t.moderate, t.normal, t.none], [6, 15, 129, 9]);
  assert.equal(d.attention, d.byCategory.filter((c) => c.id !== 'lines').reduce((n, c) => n + c.counts.poor + c.counts.moderate, 0));
});

test('dashboard: open critical and serious findings, overdue work orders and links awaiting review', async () => {
  const { snap } = await ready();
  const k = loadDashboard(snap).kpis;
  const open = [...snap.findingsByOwner.values()].flat();
  assert.equal(k.findings.critical, open.filter((f) => f.condition_score === 1).length);
  assert.equal(k.findings.serious, open.filter((f) => f.condition_score === 2).length);
  assert.equal(k.findings.urgent, k.findings.critical + k.findings.serious);
  assert.equal(k.findings.series.at(-1), k.findings.urgent);
  assert.equal(k.overdue.count, 26);
  assert.equal(k.overdue.series.at(-1), k.overdue.count);
  assert.equal(k.overdue.open, 42);
  assert.equal(k.links.awaiting, Number(linksKpis(snap)[0].v));
  assert.equal(k.links.awaiting, snap.links.filter((l) => ['resemblance', 'rule'].includes(l.source) && !l.obsolete && l.status === 'proposed').length);
});

test('dashboard: the trend counts towers and spans by band at each campaign and today, only from their install date', async () => {
  const { snap } = await ready();
  const t = loadDashboard(snap).trend;
  assert.deepEqual(t.labels, ['2026 Q1', '2026 Q2', '2026 Q4', 'Today']);
  const sum = (c) => Object.values(c).reduce((a, b) => a + b, 0);
  t.towers.forEach((c) => assert.ok(sum(c) <= 159));
  assert.equal(sum(t.towers.at(-1)), 159);
  assert.equal(sum(t.towers[0]), 159 - 4, 'the four towers built in November are not counted in February');
  assert.deepEqual(t.towers.at(-1), loadDashboard(snap).byCategory.find((c) => c.id === 'towers').counts);
  assert.equal(sum(t.spans.at(-1)), 151);
});

test('dashboard: top 10 risks are towers and transformers together, highest first, with the three factors', async () => {
  const { snap } = await ready();
  const r = loadDashboard(snap).risks;
  assert.equal(r.length, 10);
  assert.deepEqual(r.map((x) => x.risk), [...r.map((x) => x.risk)].sort((a, b) => b - a));
  assert.ok(r.every((x) => ['tower', 'transformer'].includes(x.kind)) && r.some((x) => x.kind === 'transformer'));
  assert.equal(r[0].id, 'TWR-220-03-039');
  for (const x of r) {
    assert.equal(x.risk, risk(snap.ctx, x.id, snap.asOf).score);
    assert.equal(Math.round((x.points * x.criticality * x.consequence) * 10) / 10 >= 0, true);
    assert.ok(Math.abs(x.points - (100 - x.hi)) < 0.11);
  }
  assert.ok(!r.some((x) => x.id.startsWith('MX-')));
});

test('dashboard: one row per line with the line score, band counts, worst tower and units not assessed', async () => {
  const { snap } = await ready();
  const rows = loadDashboard(snap).lines;
  assert.deepEqual(rows.map((l) => l.id), ['L-132-01', 'L-220-03', 'L-500-01']);
  const l1 = rows[0];
  assert.deepEqual([l1.hi, l1.band, l1.counts.poor, l1.counts.moderate, l1.counts.normal], [94.1, 'normal', 2, 5, 72]);
  assert.equal(l1.worstTower.id, 'TWR-132-01-011');
  assert.equal(l1.notAssessed, 8, 'four new towers and four new spans; duplicate records are not counted');
  assert.equal(l1.notAssessedTowers, 4);
  assert.equal(rows[1].notAssessed, 0);
});

test('dashboard: it follows a reviewer decision', async () => {
  const repo = make();
  const a = loadDashboard((await ready(repo)).snap);
  await repo.rejectFinding('F-0090', { reason: 'Wrong location' });
  const b = loadDashboard((await ready(repo)).snap);
  assert.equal(b.byCategory.find((c) => c.id === 'towers').counts.moderate, a.byCategory.find((c) => c.id === 'towers').counts.moderate - 1);
  assert.ok(b.lines[0].hi > a.lines[0].hi);
});
