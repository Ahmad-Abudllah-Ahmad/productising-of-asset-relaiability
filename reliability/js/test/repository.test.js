import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repository as repo } from '../data/repository.js';

test('getAssets filters by category, class, voltage and parent', async () => {
  assert.equal((await repo.getAssets({ class: 'power_transformer' })).length, 7); // 6 + 1 duplicate record
  assert.equal((await repo.getAssets({ category: 'transformer', class: 'bushing' })).length, 12);
  const l220 = await repo.getAssets({ class: 'tower', voltage_kv: 220 });
  assert.ok(l220.length >= 60 && l220.every((t) => t.voltage_kv === 220));
  const kids = await repo.getAssets({ parent_id: 'L-220-03' });
  assert.ok(kids.length > 100 && kids.every((a) => a.parent_id === 'L-220-03'));
});

test('getAssets label filter requires all labels; q searches name and id', async () => {
  const one = await repo.getAssets({ class: 'tower', label: 'corridor:corridor-north' });
  const two = await repo.getAssets({ class: 'tower', label: ['corridor:corridor-north', 'corrosion_zone:c3'] });
  assert.ok(one.length >= two.length && two.length > 0);
  assert.ok((await repo.getAssets({ q: 'twr-220-03-014' })).some((a) => a.asset_id === 'TWR-220-03-014'));
});

test('getAsset, getChildren and getAncestors walk the hierarchy', async () => {
  assert.equal((await repo.getAsset('nope')), null);
  const ins = await repo.getAsset('INS-220-03-014-A');
  assert.equal(ins.parent_id, 'TWR-220-03-014');
  const anc = (await repo.getAncestors(ins.asset_id)).map((a) => a.asset_id);
  assert.deepEqual(anc, ['TWR-220-03-014', 'L-220-03', 'COR-NORTH']);
  assert.ok((await repo.getChildren('TWR-220-03-014')).length >= 7);
});

test('getLinks matches either end and filters by type', async () => {
  const l = await repo.getLinks({ asset_id: 'TX-2A', type: 'electrical' });
  assert.ok(l.length > 0 && l.every((x) => x.type === 'electrical' && (x.from_asset === 'TX-2A' || x.to_asset === 'TX-2A')));
  const proposed = await repo.getLinks({ status: 'proposed' });
  assert.ok(proposed.length > 0 && proposed.every((x) => x.status === 'proposed' && x.source === 'resemblance'));
});

test('getFindings filters by campaign, class, status and score', async () => {
  const all = await repo.getFindings();
  assert.equal(all.length, 400);
  const q4 = await repo.getFindings({ campaign_id: 'CMP-2026-Q4' });
  assert.ok(q4.length > 0 && q4.every((f) => f.campaign_id === 'CMP-2026-Q4'));
  const poor = await repo.getFindings({ max_condition_score: 2, review_status: ['confirmed', 'pending'] });
  assert.ok(poor.length > 0 && poor.every((f) => f.condition_score <= 2 && f.review_status !== 'rejected'));
  assert.ok((await repo.getFindings({ defect_class: 'oil_leak' })).length > 0);
});

test('getDgaSamples returns one transformer, oldest first', async () => {
  const s = await repo.getDgaSamples('TX-2A');
  assert.equal(s.length, 8);
  assert.ok(s.every((x) => x.asset_id === 'TX-2A'));
  assert.ok(s[0].date < s[7].date);
});

test('labels, campaigns, captures and ground truth are available', async () => {
  assert.ok((await repo.getLabels('manufacturer')).length >= 5);
  assert.equal((await repo.getCampaigns()).length, 3);
  const caps = await repo.getCaptures({ campaign_id: 'CMP-2026-Q1' });
  assert.ok(caps.length > 0 && (await repo.getCapture(caps[0].capture_id)).capture_id === caps[0].capture_id);
  assert.equal((await repo.getGroundTruth()).duplicates.length, 8);
});

test('returned records are frozen so callers cannot change shared data', async () => {
  const a = await repo.getAsset('TX-1A');
  assert.throws(() => { a.name = 'changed'; }, TypeError);
  assert.throws(() => { a.labels.push('x'); }, TypeError);
});

test('getWorkOrders and getRepairs filter by asset, status and work order', async () => {
  const all = await repo.getWorkOrders();
  assert.ok(all.length > 100);
  const done = await repo.getWorkOrders({ status: 'completed' });
  assert.ok(done.length > 0 && done.every((w) => w.status === 'completed'));
  const open = await repo.getWorkOrders({ status: ['open', 'in_progress'] });
  assert.equal(open.length + done.length, all.length);
  const one = done[0];
  assert.deepEqual((await repo.getRepairs({ work_order_id: one.work_order_id })).map((r) => r.asset_id), [one.asset_id]);
  assert.ok((await repo.getWorkOrders({ finding_id: one.finding_ids[0] })).some((w) => w.work_order_id === one.work_order_id));
});

test('getAll returns the full frozen data set for building a scoring context', async () => {
  const data = await repo.getAll();
  for (const k of ['assets', 'findings', 'repairs', 'workOrders', 'campaigns', 'links', 'dga']) assert.ok(Array.isArray(data[k]), k);
  assert.throws(() => data.repairs.push({}), TypeError);
});
