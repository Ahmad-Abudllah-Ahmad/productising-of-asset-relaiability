import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadItems, loadCounts, resolveEnd, describe, sideBySide, reasonsOf, mergeCheck, scoreBand, thresholds, REVIEW_SOURCES } from '../ui/linkReviewModel.js';

const repo = () => createRepository(generateSeed(), { storage: null });

test('the queue holds proposed matcher links, highest score first, each with reasons', async () => {
  const r = repo();
  const items = await loadItems(r);
  assert.ok(items.length >= 20);
  assert.ok(items.every((l) => l.status === 'proposed' && l.source === 'resemblance' && l.reasons.length >= 3));
  const s = items.map((l) => l.confidence);
  assert.deepEqual(s, [...s].sort((a, b) => b - a));
});

test('filters: by status, by link type; manual seed links are never offered for review', async () => {
  const r = repo();
  assert.ok((await loadItems(r, { status: 'confirmed' })).every((l) => l.status === 'confirmed'));
  assert.equal((await loadItems(r, { status: 'rejected' })).length, 0);
  const spatial = await loadItems(r, { status: 'all', type: 'spatial' });
  assert.ok(spatial.length > 300 && spatial.every((l) => l.type === 'spatial' && l.source === 'rule'));
  const all = await loadItems(r, { status: 'all' });
  assert.ok(all.every((l) => REVIEW_SOURCES.includes(l.source)));
  assert.ok(!all.some((l) => l.type === 'hierarchy'));
});

test('counts per status and per type match what the filters return', async () => {
  const r = repo();
  const c = await loadCounts(r);
  assert.equal(c.byStatus.proposed, (await loadItems(r, { status: 'proposed' })).length);
  assert.equal(c.byStatus.confirmed, (await loadItems(r, { status: 'confirmed' })).length);
  assert.equal(c.byType.spatial, (await loadItems(r, { status: 'all', type: 'spatial' })).length);
  assert.equal(c.byStatus.all, c.byType.all);
  const l = (await loadItems(r))[0];
  await r.rejectLink(l.link_id);
  const c2 = await loadCounts(r);
  assert.deepEqual([c2.byStatus.proposed, c2.byStatus.rejected], [c.byStatus.proposed - 1, 1]);
});

test('side by side: both records, aligned by field, with differing fields marked', async () => {
  const r = repo();
  const link = (await loadItems(r)).find((l) => l.relation === 'duplicate_of');
  const [a, b] = await Promise.all([resolveEnd(r, link.from_asset, 'asset'), resolveEnd(r, link.to_asset, 'asset')]);
  const rows = sideBySide(a, b);
  const get = (label) => rows.find((x) => x.label === label);
  assert.equal(get('Asset').a, link.from_asset);
  assert.equal(get('Asset').b, link.to_asset);
  assert.equal(get('Asset').same, false);
  assert.equal(get('Class').same, true);
  assert.equal(get('Voltage (kV)').same, true);
  assert.ok(rows.some((x) => !x.same) && rows.some((x) => x.same));
  assert.ok(describe(a).some(([k]) => k === 'Labels'));
});

test('findings: described with defect class, campaign, condition and their capture image', async () => {
  const r = repo();
  const link = (await loadItems(r)).find((l) => l.from_kind === 'finding');
  const end = await resolveEnd(r, link.from_asset, 'finding');
  assert.equal(end.kind, 'finding');
  assert.ok(end.capture.image === null || end.capture.image.startsWith('/assets/'));
  const rows = Object.fromEntries(describe(end));
  assert.equal(rows.Finding, link.from_asset);
  for (const k of ['Campaign', 'Defect class', 'Condition (1-5)', 'Confidence', 'Location']) assert.ok(k in rows, k);
  assert.deepEqual(describe({ kind: 'asset', id: 'X', record: null }), [['Record', 'X (not found)']]);
});

test('reasons: the matcher reasons for matcher links, one explanatory line for rule links', async () => {
  const r = repo();
  const m = (await loadItems(r))[0];
  const sum = reasonsOf(m).reasons.reduce((s, x) => s + x.contribution, 0);
  assert.ok(Math.abs(sum - m.confidence) < 0.01);
  const rule = (await loadItems(r, { status: 'all', type: 'spatial' }))[0];
  const rr = reasonsOf(rule);
  assert.equal(rr.reasons.length, 1);
  assert.match(rr.reasons[0].detail, /^Rule:/);
});

test('merge is offered only for two unmerged records of one class joined by a duplicate link', async () => {
  const r = repo();
  const dupLink = (await loadItems(r)).find((l) => l.relation === 'duplicate_of');
  const ends = await Promise.all([resolveEnd(r, dupLink.from_asset, 'asset'), resolveEnd(r, dupLink.to_asset, 'asset')]);
  const ok = mergeCheck(dupLink, ...ends);
  assert.equal(ok.ok, true);
  assert.match(ok.reason, /Merge .* into /);
  const sighting = (await loadItems(r)).find((l) => l.from_kind === 'finding');
  assert.equal(mergeCheck(sighting, ...(await Promise.all([resolveEnd(r, sighting.from_asset, 'finding'), resolveEnd(r, sighting.to_asset, 'finding')]))).ok, false);
  assert.equal(mergeCheck({ ...dupLink, merged: true }, ...ends).ok, false);
  assert.equal(mergeCheck(dupLink, { record: { ...ends[0].record, merged_into: 'X' } }, ends[1]).ok, false);
  assert.equal(mergeCheck(dupLink, ends[0], { record: { ...ends[1].record, class: 'other' } }).ok, false);
  assert.equal(mergeCheck(dupLink, { record: null }, ends[1]).ok, false);
});

test('score bands follow the configured thresholds', () => {
  assert.deepEqual(thresholds(), { auto: 0.9, drop: 0.6 });
  assert.equal(scoreBand(0.95), 'auto-link');
  assert.equal(scoreBand(0.9), 'auto-link');
  assert.equal(scoreBand(0.89), 'review');
  assert.equal(scoreBand(0.6), 'review');
  assert.equal(scoreBand(0.59), 'dropped');
});
