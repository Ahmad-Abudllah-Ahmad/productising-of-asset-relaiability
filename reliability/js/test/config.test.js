import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LINE_GROUPS, TX_INPUTS, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { ASSET_CATEGORIES, ASSET_CLASSES } from '../domain/types.js';

test('there are 23 line defect classes with unique ids, all mapped to a known group', () => {
  assert.equal(DEFECT_CLASSES.length, 23);
  assert.equal(new Set(DEFECT_CLASSES.map((d) => d.id)).size, 23);
  for (const d of DEFECT_CLASSES) assert.ok(LINE_GROUPS.includes(d.group), d.id);
});

test('every one of the eight groups has at least one defect class', () => {
  assert.equal(LINE_GROUPS.length, 8);
  for (const g of LINE_GROUPS) assert.ok(DEFECT_CLASSES.some((d) => d.group === g), g);
});

test('transformer defect classes do not collide with line classes', () => {
  const line = new Set(DEFECT_CLASSES.map((d) => d.id));
  for (const d of TX_DEFECT_CLASSES) assert.ok(!line.has(d.id), d.id);
});

test('weights are equal and cover every group and transformer input', () => {
  assert.deepEqual(Object.keys(CONFIG.weights.lineGroups), [...LINE_GROUPS]);
  assert.deepEqual(Object.keys(CONFIG.weights.txInputs), [...TX_INPUTS]);
  assert.equal(new Set(Object.values(CONFIG.weights.lineGroups)).size, 1);
  assert.equal(new Set(Object.values(CONFIG.weights.txInputs)).size, 1);
});

test('band cut-offs are 70 / 40 and ordered', () => {
  assert.equal(CONFIG.bands.normalMin, 70);
  assert.equal(CONFIG.bands.poorBelow, 40);
  assert.ok(CONFIG.bands.poorBelow < CONFIG.bands.normalMin);
});

test('link thresholds are ordered inside 0-1', () => {
  const { dropBelow, autoLinkAtOrAbove } = CONFIG.linking;
  assert.ok(0 < dropBelow && dropBelow < autoLinkAtOrAbove && autoLinkAtOrAbove <= 1);
});

test('config is frozen', () => {
  assert.throws(() => { CONFIG.bands.normalMin = 1; }, TypeError);
});

test('freshness intervals exist for every category that has a health index', () => {
  for (const c of ['line_network', 'structure', 'line_component', 'right_of_way', 'substation', 'transformer']) {
    assert.ok(CONFIG.freshness.inspectionIntervalDays[c] > 0, c);
  }
});

test('category and class vocabulary is consistent', () => {
  assert.equal(ASSET_CATEGORIES.length, 7);
  for (const c of Object.keys(ASSET_CLASSES)) assert.ok(ASSET_CATEGORIES.includes(c), c);
});

test('scoring settings: unreviewed findings count by default, cap margin 0, uplift rule explicit', () => {
  assert.equal(CONFIG.scoring.countUnreviewedFindings, true);
  assert.equal(CONFIG.scoring.groupCapMargin, 0);
  const u = CONFIG.risk.linkedUplift;
  assert.deepEqual([u.enabled, u.perPoorLinkedAsset, u.maxUplift, u.maxConsequence, u.linkedBand], [true, 1, 2, 5, 'poor']);
});

test('every group has an owner (tower or span) and every component class maps to a known group', () => {
  const owned = new Set([...CONFIG.scoring.ownerGroups.tower, ...CONFIG.scoring.ownerGroups.span]);
  for (const g of LINE_GROUPS) assert.ok(owned.has(g), g);
  for (const g of Object.values(CONFIG.scoring.componentGroupByClass)) assert.ok(LINE_GROUPS.includes(g), g);
});

test('DGA limits are ordered for every scored gas', () => {
  for (const g of CONFIG.transformer.dga.gases) {
    const [a, b, c] = CONFIG.transformer.dga.limits[g];
    assert.ok(a < b && b < c, g);
  }
});

test('the assumptions are listed at the top of config.js', async () => {
  const { readFile } = await import('node:fs/promises');
  const head = (await readFile(new URL('../domain/config.js', import.meta.url), 'utf8')).split('export')[0];
  for (const n of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19']) assert.ok(head.includes(`${n}.`), n);
});
