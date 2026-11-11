import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository, STORAGE_KEY } from '../data/repository.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { lineHi } from '../domain/health/lineHi.js';

const NOW = '2026-11-11';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();
const make = (opts = {}, data = generateSeed()) => createRepository(data, { storage: memoryStorage(), clock, ...opts });

async function firstProposed(repo, kind) {
  return (await repo.getLinks({ status: 'proposed', source: 'resemblance' })).find((l) => l.from_kind === kind);
}

// ------------------------------------------------- derived links

test('the repository serves seed links plus rule links plus resemblance links, with a queue to review', async () => {
  const repo = make();
  const all = await repo.getLinks();
  assert.ok(all.some((l) => l.source === 'manual') && all.some((l) => l.source === 'rule') && all.some((l) => l.source === 'resemblance'));
  const queue = await repo.getLinks({ status: 'proposed' });
  assert.ok(queue.length >= 20 && queue.length <= 60, `queue of ${queue.length}`);
  assert.ok(queue.every((l) => l.source === 'resemblance' && l.reasons.length >= 3 && l.confidence >= 0.6 && l.confidence < 0.9));
  const stats = await repo.getLinkStats();
  assert.equal(stats.resemblance.findings.proposed + stats.resemblance.assets.proposed, queue.length);
  assert.ok(stats.rules.skippedExisting > 0);
  assert.equal((await repo.getAuditLog()).filter((e) => e.action === 'auto_link').length, (await repo.getLinks({ status: 'confirmed', source: 'resemblance' })).length);
});

test('the answer key is not part of the data handed out for scoring', async () => {
  const all = await make().getAll();
  assert.equal(all.groundTruth, undefined);
});

// ------------------------------------------------------ confirm / reject

test('confirmLink and rejectLink change status, are logged, and are idempotent', async () => {
  const repo = make();
  const [a, b] = (await repo.getLinks({ status: 'proposed' }));
  const confirmed = await repo.confirmLink(a.link_id, { by: 'ana' });
  assert.deepEqual([confirmed.status, confirmed.confirmed_by], ['confirmed', 'ana']);
  assert.equal((await repo.getLink(a.link_id)).status, 'confirmed');
  const rejected = await repo.rejectLink(b.link_id);
  assert.equal(rejected.status, 'rejected');
  const log = await repo.getAuditLog();
  assert.deepEqual(log.slice(0, 2).map((e) => [e.action, e.link_id]), [['reject', b.link_id], ['confirm', a.link_id]]);
  assert.equal(log[0].actor, 'reviewer');
  const before = (await repo.getAuditLog()).length;
  await repo.confirmLink(a.link_id);
  assert.equal((await repo.getAuditLog()).length, before, 'confirming a confirmed link changes nothing');
  assert.equal((await repo.getLinks({ status: 'proposed' })).length, (await repo.getLinkStats()).resemblance.findings.proposed + (await repo.getLinkStats()).resemblance.assets.proposed - 2);
});

test('a rejected link can be accepted later; an unknown link is an error', async () => {
  const repo = make();
  const l = (await repo.getLinks({ status: 'proposed' }))[0];
  await repo.rejectLink(l.link_id);
  assert.equal((await repo.confirmLink(l.link_id)).status, 'confirmed');
  await assert.rejects(() => repo.confirmLink('LNK-NOPE'), /Unknown link/);
  await assert.rejects(() => repo.rejectLink('LNK-NOPE'), /Unknown link/);
});

// ----------------------------------------------------------------- merge

test('mergeAssets sets merged_into, confirms the link, and logs it', async () => {
  const repo = make();
  const l = await firstProposed(repo, 'asset');
  assert.ok(l, 'the seed has a duplicate pair in the review band');
  const res = await repo.mergeAssets({ from: l.from_asset, into: l.to_asset, link_id: l.link_id, by: 'ana' });
  assert.deepEqual(res, { from: l.from_asset, into: l.to_asset, link_id: l.link_id });
  assert.equal((await repo.getAsset(l.from_asset)).merged_into, l.to_asset);
  assert.equal((await repo.getAsset(l.to_asset)).merged_into, undefined);
  const after = await repo.getLink(l.link_id);
  assert.deepEqual([after.status, after.merged], ['confirmed', true]);
  assert.equal((await repo.getAuditLog())[0].action, 'merge');
  assert.ok(!(await repo.getAssets({ include_merged: false })).some((a) => a.asset_id === l.from_asset));
  await assert.rejects(() => repo.rejectLink(l.link_id), /used to merge/);
});

test('merge guards: same asset, different class, already merged, unknown', async () => {
  const repo = make();
  await assert.rejects(() => repo.mergeAssets({ from: 'TX-2A', into: 'TX-2A' }), /itself/);
  await assert.rejects(() => repo.mergeAssets({ from: 'TX-2A', into: 'TWR-220-03-014' }), /same class/);
  await assert.rejects(() => repo.mergeAssets({ from: 'NOPE', into: 'TX-2A' }), /Unknown asset/);
  await assert.rejects(() => repo.mergeAssets({ from: 'TX-2A', into: 'TX-2B', link_id: 'LNK-NOPE' }), /Unknown link/);
  const dup = (await repo.getGroundTruth()).duplicates[0];
  await repo.mergeAssets({ from: dup.duplicate, into: dup.original });
  await assert.rejects(() => repo.mergeAssets({ from: dup.duplicate, into: dup.original }), /already merged/);
});

test('after a merge, other proposed links that involve the merged record become obsolete and leave the queue', async () => {
  const repo = make();
  const dup = (await repo.getGroundTruth()).duplicates[0];
  const before = (await repo.getLinks({ asset_id: dup.duplicate, status: 'proposed' })).length;
  await repo.mergeAssets({ from: dup.duplicate, into: dup.original });
  assert.equal((await repo.getLinks({ asset_id: dup.duplicate, status: 'proposed' })).length, 0);
  assert.equal((await repo.getLinks({ asset_id: dup.duplicate, status: 'proposed', include_obsolete: true })).length, before);
});

test('scores recompute after a merge: the duplicate stops counting and its evidence moves to the survivor', async () => {
  // Put a poor finding on a duplicate tower so that the duplicate matters to its line.
  const seed = generateSeed();
  const { original, duplicate } = seed.groundTruth.duplicates.find((d) => seed.assets.find((a) => a.asset_id === d.original).class === 'tower');
  const orig = seed.assets.find((a) => a.asset_id === original);
  const f = { finding_id: 'F-9999', campaign_id: 'CMP-2026-Q4', capture_id: seed.captures[0].capture_id, defect_class: 'steel_corrosion', group: 'steel_structure', asset_id: duplicate, tower_id: duplicate, component_hint: null, sensor: 'rgb', date: '2026-10-10', location: orig.location, bbox: null, confidence: 0.9, condition_score: 1, review_status: 'confirmed', confirmed_by: 'r' };
  seed.findings.push(f);
  const line = orig.parent_id;

  // the same data with the finding already on the original, never duplicated: what the merged state should equal
  const ref = generateSeed();
  ref.findings.push({ ...f, asset_id: original, tower_id: original });
  const reference = lineHi(await make({}, ref).getContext(), line, NOW);

  const repo = make({}, seed);
  const ctx0 = await repo.getContext();
  const before = lineHi(ctx0, line, NOW);
  assert.equal(healthIndex(ctx0, duplicate, NOW).breakdown.assessed, true, 'the duplicate is scored on its own before the merge');
  assert.notEqual(before.score, reference.score);

  await repo.mergeAssets({ from: duplicate, into: original });
  const ctx1 = await repo.getContext();
  assert.notEqual(ctx1, ctx0, 'the scoring context is rebuilt after a write');
  const after = lineHi(ctx1, line, NOW);
  assert.equal(after.score, reference.score);
  assert.equal(after.breakdown.counts.towers, before.breakdown.counts.towers - 1);
  assert.equal(healthIndex(ctx1, duplicate, NOW).score, null);
  assert.deepEqual(healthIndex(ctx1, original, NOW).breakdown.findingIds.includes('F-9999'), true, 'the finding now counts on the survivor');
  assert.equal((await repo.getFinding('F-9999')).asset_id, original);
});

test('merging moves repairs and work orders too, and children follow their parent', async () => {
  const seed = generateSeed();
  const { original, duplicate } = seed.groundTruth.duplicates.find((d) => seed.assets.find((a) => a.asset_id === d.original).class === 'insulator_string');
  seed.repairs.push({ repair_id: 'RPR-X', work_order_id: 'WO-X', asset_id: duplicate, date: '2026-10-20', action: 'fix', closes_finding_ids: [] });
  seed.workOrders.push({ work_order_id: 'WO-X', asset_id: duplicate, work_type: 'fix', priority: 'low', status: 'completed', finding_ids: [], created_at: '2026-10-01', planned_date: '2026-10-20', completed_at: '2026-10-20' });
  const repo = make({}, seed);
  await repo.mergeAssets({ from: duplicate, into: original });
  assert.equal((await repo.getRepairs({ asset_id: original })).some((r) => r.repair_id === 'RPR-X'), true);
  assert.equal((await repo.getWorkOrders({ asset_id: original })).some((w) => w.work_order_id === 'WO-X'), true);
});

// -------------------------------------------- persistence and reset

test('decisions are mirrored to storage and survive a new repository (a page reload)', async () => {
  const storage = memoryStorage();
  const repo = make({ storage });
  const [a, b] = (await repo.getLinks({ status: 'proposed' })).filter((l) => l.from_kind === 'finding');
  await repo.confirmLink(a.link_id);
  const m = (await firstProposed(repo, 'asset'));
  await repo.mergeAssets({ from: m.from_asset, into: m.to_asset, link_id: m.link_id });
  assert.ok(storage.getItem(STORAGE_KEY));
  const reloaded = make({ storage });
  assert.equal((await reloaded.getLink(a.link_id)).status, 'confirmed');
  assert.equal((await reloaded.getAsset(m.from_asset)).merged_into, m.to_asset);
  assert.equal((await reloaded.getLink(b.link_id)).status, 'proposed');
  assert.equal((await reloaded.getAuditLog())[0].action, 'merge');
});

test('resetDemoData clears decisions and merges in memory and in storage', async () => {
  const storage = memoryStorage();
  const repo = make({ storage });
  const start = (await repo.getLinks({ status: 'proposed' })).length;
  const m = await firstProposed(repo, 'asset');
  await repo.mergeAssets({ from: m.from_asset, into: m.to_asset, link_id: m.link_id });
  await repo.rejectLink((await repo.getLinks({ status: 'proposed' }))[0].link_id);
  assert.ok((await repo.getLinks({ status: 'proposed' })).length < start);
  const calls = [];
  repo.subscribe((rev) => calls.push(rev));
  await repo.resetDemoData();
  assert.equal((await repo.getLinks({ status: 'proposed' })).length, start);
  assert.equal((await repo.getAsset(m.from_asset)).merged_into, undefined);
  assert.equal(calls.length, 1);
  const log = await repo.getAuditLog();
  assert.equal(log[0].action, 'reset');
  assert.ok(!log.some((e) => e.action === 'merge' || e.action === 'reject'), 'earlier decisions are gone from the log');
  const reloaded = make({ storage });
  assert.equal((await reloaded.getLinks({ status: 'proposed' })).length, start, 'a reload after reset is clean');
  assert.equal((await reloaded.getContext()) !== undefined, true);
});

test('subscribers hear about writes until they unsubscribe', async () => {
  const repo = make();
  const seen = [];
  const off = repo.subscribe((rev) => seen.push(rev));
  const [a, b] = await repo.getLinks({ status: 'proposed' });
  await repo.confirmLink(a.link_id);
  off();
  await repo.rejectLink(b.link_id);
  assert.deepEqual(seen, [1]);
  assert.equal(repo.getRevision(), 2);
});

test('a broken or full storage never breaks the app: state stays in memory', async () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
  const repo = make({ storage: broken });
  const l = (await repo.getLinks({ status: 'proposed' }))[0];
  assert.equal((await repo.confirmLink(l.link_id)).status, 'confirmed');
  await repo.resetDemoData();
  assert.equal((await repo.getLink(l.link_id)).status, 'proposed');
});

test('corrupt, outdated or inconsistent stored state is ignored', async () => {
  for (const raw of ['{not json', '{"version":2}', '{"version":1,"decisions":{"LNK-NOPE":{"status":"confirmed"}},"merges":[{"from":"NOPE","into":"TX-2A"}]}']) {
    const repo = make({ storage: memoryStorage({ [STORAGE_KEY]: raw }) });
    assert.ok((await repo.getLinks({ status: 'proposed' })).length > 20, raw);
    assert.equal((await repo.getAssets({ q: 'TX-2A' })).some((a) => a.merged_into), false);
  }
});

test('with no storage at all (null) the repository still works in memory', async () => {
  const repo = make({ storage: null });
  const l = (await repo.getLinks({ status: 'proposed' }))[0];
  await repo.rejectLink(l.link_id);
  assert.equal((await repo.getLink(l.link_id)).status, 'rejected');
});
