import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot, AS_OF } from '../app/snapshot.js';
import { CATEGORIES, tableFor, filtersFor, kpisFor, linksKpis } from '../app/registryModel.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { risk } from '../domain/risk.js';

const make = () => createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
const snapOf = async (repo) => loadSnapshot(repo);
const COUNTS = { lines: 3, towers: 155, spans: 147, components: 1346, substations: 12, transformers: 7 };

test('the six categories are lines, towers, spans, components, substations and transformers', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['lines', 'towers', 'spans', 'components', 'substations', 'transformers']);
  assert.equal(AS_OF, '2026-11-11');
});

test('each category lists the assets of its classes, merged records left out', async () => {
  const snap = await snapOf(make());
  for (const [id, n] of Object.entries(COUNTS)) assert.equal(tableFor(snap, id).rows.length, n, id);
  assert.throws(() => tableFor(snap, 'nope'), /Unknown category/);
});

test('every row has as many cells as columns, an id, a hover reason and a filter zone', async () => {
  const snap = await snapOf(make());
  for (const c of CATEGORIES) {
    const { columns, rows } = tableFor(snap, c.id);
    assert.ok(columns.length >= 8, c.id);
    for (const r of rows) {
      assert.equal(r.cells.length, columns.length, `${c.id} ${r.id}`);
      assert.ok(r.id && r.tip && r.zone, r.id);
      for (const cell of r.cells) assert.ok(typeof cell.text === 'string' && cell.sort !== undefined, `${r.id} cell`);
    }
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, `${c.id} ids are unique`);
  }
});

test('towers: the health index and risk cells are the Phase 2 scores', async () => {
  const repo = make();
  const snap = await snapOf(repo);
  const ctx = await repo.getContext();
  const { columns, rows } = tableFor(snap, 'towers');
  const hiCol = columns.indexOf('Health index');
  const riskCol = columns.indexOf('Risk');
  for (const r of rows.slice(0, 80)) {
    const hi = healthIndex(ctx, r.id, AS_OF);
    if (hi.score === null) { assert.equal(r.cells[hiCol].text, 'not assessed'); assert.equal(r.cells[hiCol].tone, 'x'); continue; }
    assert.equal(r.cells[hiCol].text, `${hi.score} ${hi.band}`);
    assert.equal(r.cells[hiCol].tone, { normal: 'g', moderate: 'a', poor: 'r' }[hi.band]);
    assert.equal(r.cells[riskCol].sort, risk(ctx, r.id, AS_OF).score);
  }
  assert.ok(rows.some((r) => r.cells[hiCol].tone === 'r') && rows.some((r) => r.cells[hiCol].tone === 'a') && rows.some((r) => r.cells[hiCol].tone === 'g'));
});

test('a poor tower says why in its hover text: the group that limits it and what it would be without that', async () => {
  const snap = await snapOf(make());
  const { columns, rows } = tableFor(snap, 'towers');
  const hiCol = columns.indexOf('Health index');
  const row = rows.find((r) => r.cells[hiCol].tone === 'r');
  assert.match(row.tip, /health index [\d.]+ \(poor\)\. A group at condition 1 \(.+\) limits it; without that it would be [\d.]+\./);
  assert.match(row.tip, /open finding/);
});

test('a duplicate record is shown, not assessed, and has a link waiting for review', async () => {
  const repo = make();
  const snap = await snapOf(repo);
  const { duplicate } = (await repo.getGroundTruth()).duplicates.find((d) => d.duplicate.startsWith('MX-TOW'));
  const { columns, rows } = tableFor(snap, 'towers');
  const row = rows.find((r) => r.id === duplicate);
  assert.equal(row.cells[columns.indexOf('Health index')].text, 'not assessed');
  assert.match(row.tip, /not assessed/);
  assert.ok(row.cells[columns.indexOf('Links')].text.includes('linked') || row.cells[columns.indexOf('Links')].text.includes('review'));
});

test('components show their worst open condition; clean ones say so', async () => {
  const snap = await snapOf(make());
  const { columns, rows } = tableFor(snap, 'components');
  const cond = columns.indexOf('Condition');
  assert.ok(rows.some((r) => r.cells[cond].text === 'no open findings' && r.cells[cond].tone === 'g'));
  const worst = rows.find((r) => r.cells[cond].text.startsWith('1 '));
  assert.equal(worst.cells[cond].text, '1 very poor');
  assert.equal(worst.cells[cond].tone, 'r');
  assert.match(worst.tip, /worst condition 1 \(very poor\)/);
});

test('transformers show the Duval zone and the weakest input from the health breakdown', async () => {
  const repo = make();
  const snap = await snapOf(repo);
  const { columns, rows } = tableFor(snap, 'transformers');
  const row = rows.find((r) => r.id === 'TX-2C');
  assert.equal(row.cells[columns.indexOf('Duval zone')].text, 'D2');
  assert.match(row.cells[columns.indexOf('Weakest input')].text, /^dga /);
  assert.match(row.tip, /Duval zone D2/);
  assert.equal(row.cells[columns.indexOf('Station')].text, 'Substation S-2');
});

test('filters list only values that occur, in a sensible order, and the zone of each row contains them', async () => {
  const snap = await snapOf(make());
  const { rows } = tableFor(snap, 'towers');
  const groups = filtersFor('towers', rows);
  assert.deepEqual(groups.map((g) => g.group), ['Location', 'Asset']);
  const sel = (label) => groups.flatMap((g) => g.selects).find((s) => s.label === label);
  assert.deepEqual(sel('Line').options, ['L-132-01', 'L-220-03', 'L-500-01']);
  assert.deepEqual(sel('Voltage').options, ['132 kV', '220 kV', '500 kV']);
  assert.deepEqual(sel('Corridor').options, ['Corridor Coastal', 'Corridor Inland', 'Corridor North']);
  assert.deepEqual(sel('Health band').options, ['normal', 'moderate', 'poor', 'not assessed']);
  for (const r of rows.slice(0, 40)) for (const v of [r.facets.line, r.facets.kv, r.facets.band, ...r.facets.corridor]) assert.ok(r.zone.includes(v), `${r.id} zone lacks ${v}`);
  // the legacy shell filters by "zone contains value": no value may be contained in another value's zone token
  const comps = filtersFor('components', tableFor(snap, 'components').rows).flatMap((g) => g.selects).find((s) => s.label === 'Findings');
  assert.deepEqual(comps.options.sort(), ['clean', 'with findings']);
});

test('KPI cards: four per tab, different for each tab, and consistent with the rows', async () => {
  const snap = await snapOf(make());
  const labels = new Map();
  for (const c of CATEGORIES) {
    const k = kpisFor(snap, c.id);
    assert.equal(k.length, 4, c.id);
    for (const x of k) { assert.ok(x.l && x.v !== '' && x.s !== undefined && x.tip, `${c.id} ${x.l}`); assert.ok(x.spark.length >= 2, `${c.id} ${x.l} spark`); }
    labels.set(c.id, k.map((x) => x.l).join('|'));
  }
  assert.ok(new Set(labels.values()).size >= 4, 'tabs do not repeat one strip');
  const towers = kpisFor(snap, 'towers');
  const { columns, rows } = tableFor(snap, 'towers');
  const hi = columns.indexOf('Health index');
  const original = rows.filter((r) => !r.id.startsWith('MX-'));
  assert.equal(towers[0].v, String(rows.length));
  assert.equal(towers[0].s, `${original.length} assessed`);
  const attention = rows.filter((r) => ['a', 'r'].includes(r.cells[hi].tone)).length;
  assert.equal(towers[2].v, String(attention));
  assert.equal(towers[2].s, `${rows.filter((r) => r.cells[hi].tone === 'r').length} poor · ${rows.filter((r) => r.cells[hi].tone === 'a').length} moderate`);
  const tx = kpisFor(snap, 'transformers');
  assert.equal(tx[3].l, 'Highest risk');
  assert.equal(tx[3].s, 'TX-1B · high');
});

test('sparklines come from real scores at each campaign date and today; a single point is drawn flat', async () => {
  const snap = await snapOf(make());
  assert.deepEqual(snap.dates, ['2026-02-25', '2026-05-27', '2026-10-28', '2026-11-11']);
  const avg = kpisFor(snap, 'towers')[1].spark;
  assert.equal(avg.length, 4);
  assert.ok(avg.every((v) => v > 0 && v <= 100));
  const comps = kpisFor(snap, 'components')[0].spark;
  assert.deepEqual(comps, [1346, 1346], 'no history for a count with one value: flat, not an invented trend');
});

test('Links KPIs follow decisions and merges', async () => {
  const repo = make();
  let k = linksKpis(await snapOf(repo));
  assert.deepEqual(k.map((x) => x.l), ['Awaiting review', 'Linked automatically', 'Decided by reviewers', 'Rule links']);
  assert.equal(k[0].v, '30');
  assert.equal(k[0].s, '1 record · 29 sightings');
  assert.equal(k[2].v, '0');
  const [a, b] = (await repo.getLinks({ status: 'proposed' })).filter((l) => l.from_kind === 'finding');
  await repo.confirmLink(a.link_id);
  await repo.rejectLink(b.link_id);
  k = linksKpis(await snapOf(repo));
  assert.deepEqual([k[0].v, k[2].v, k[2].s], ['28', '2', '1 accepted · 1 rejected']);
  await repo.resetDemoData();
  assert.equal(linksKpis(await snapOf(repo))[0].v, '30');
});

test('a merge changes the registry: the duplicate leaves the Towers tab and the KPI counts follow', async () => {
  const repo = make();
  const before = await snapOf(repo);
  assert.equal(tableFor(before, 'towers').rows.length, 155);
  const { original, duplicate } = (await repo.getGroundTruth()).duplicates.find((d) => d.duplicate.startsWith('MX-TOW'));
  await repo.mergeAssets({ from: duplicate, into: original });
  const after = await snapOf(repo);
  const rows = tableFor(after, 'towers').rows;
  assert.equal(rows.length, 154);
  assert.ok(!rows.some((r) => r.id === duplicate));
  assert.equal(kpisFor(after, 'towers')[0].v, '154');
});

test('the substations tab counts stations, bays and the transformers behind them', async () => {
  const snap = await snapOf(make());
  const k = kpisFor(snap, 'substations');
  assert.deepEqual([k[0].v, k[0].s], ['12', '2 substations · 10 bays']);
  assert.equal(k[1].v, '7');
  assert.equal(k[2].v, '4');
  const { rows, columns } = tableFor(snap, 'substations');
  assert.match(rows.find((r) => r.id === 'SUB-S1').cells[columns.indexOf('Connects')].text, /3 transformers · 2 lines/);
});
