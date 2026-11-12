import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository, STORAGE_KEY } from '../data/repository.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadFindingDetail, DEFECT_OPTIONS } from '../app/findingModel.js';
import { suggestAssets } from '../domain/linking/suggest.js';
import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { thermalModel, falseColour, hash, SCALE_GRADIENT, SIZE, DEMO_LABEL } from '../app/demoImage.js';
import { parseHash, parseView, hashFor } from '../app/hashState.js';

const NOW = '2026-11-11';
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();
const memory = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};
const make = (storage = memory()) => createRepository(generateSeed(), { storage, clock });
const hi = async (repo, id, asOf = NOW) => healthIndex(await repo.getContext(), id, asOf);

// F-0090 is the only open finding behind tower T-010's moderate score (66.9): its group is at condition 2.
const LONE = 'F-0090';
const TOWER = 'TWR-132-01-010';

// ------------------------------------------------------------ hash state

test('hash state: the asset panel, the finding viewer and its mode', () => {
  assert.deepEqual(parseHash('#asset=TWR-132-01-011'), { asset: 'TWR-132-01-011', finding: null, mode: 'rgb' });
  assert.deepEqual(parseHash('#finding=F-0308&mode=thermal'), { asset: null, finding: 'F-0308', mode: 'thermal' });
  assert.deepEqual(parseHash('#asset=TX-2C&finding=F-0086&mode=compare'), { asset: 'TX-2C', finding: 'F-0086', mode: 'compare' });
  assert.equal(parseHash('#finding=F-1&mode=nonsense').mode, 'rgb');
  assert.deepEqual(parseHash(''), { asset: null, finding: null, mode: 'rgb' });
  assert.equal(hashFor({ asset: 'A/B', finding: 'F-1', mode: 'thermal' }), '#asset=A%2FB&finding=F-1&mode=thermal');
  assert.equal(hashFor({ finding: 'F-1' }), '#finding=F-1', 'rgb is the default and is left out');
  assert.equal(hashFor({ asset: 'X', mode: 'thermal' }), '#asset=X', 'a mode means nothing without a finding');
  assert.equal(hashFor({}), '');
  for (const s of [{ asset: 'TX-2C', finding: 'F-0086', mode: 'compare' }, { asset: null, finding: 'F-9', mode: 'rgb' }, { asset: 'A', finding: null, mode: 'rgb' }]) assert.deepEqual(parseHash(hashFor(s)), s);
});

// --------------------------------------------------------------- confirm

test('confirm: a pending finding becomes confirmed, it is logged, and a second confirm changes nothing', async () => {
  const repo = make();
  assert.equal((await repo.getFinding('F-0023')).review_status, 'pending');
  const f = await repo.confirmFinding('F-0023', { by: 'ana' });
  assert.deepEqual([f.review_status, f.confirmed_by], ['confirmed', 'ana']);
  assert.equal(f.edit.corrected, false);
  assert.equal(f.edit.original.review_status, 'pending');
  const log = await repo.getAuditLog();
  assert.deepEqual([log[0].action, log[0].finding_id, log[0].actor], ['finding_confirm', 'F-0023', 'ana']);
  const n = log.length;
  await repo.confirmFinding('F-0023');
  assert.equal((await repo.getAuditLog()).length, n);
  await assert.rejects(() => repo.confirmFinding('F-NOPE'), /Unknown finding/);
});

// ---------------------------------------------------------------- reject

test('reject: the finding stops counting and the owner\'s health index and risk recompute', async () => {
  const repo = make();
  const before = await hi(repo, TOWER);
  assert.deepEqual([before.score, before.band], [66.9, 'moderate']);
  assert.deepEqual(before.breakdown.findingIds, [LONE]);
  const f = await repo.rejectFinding(LONE, { reason: 'Not a defect' });
  assert.equal(f.review_status, 'rejected');
  assert.equal(f.edit.rejected_reason, 'Not a defect');
  const after = await hi(repo, TOWER);
  assert.equal(after.score, 100);
  assert.deepEqual(after.breakdown.findingIds, []);
  assert.deepEqual(after.breakdown.rejectedFindingIds, [LONE]);
  assert.equal((await repo.getAuditLog())[0].detail, `Rejected ${LONE}: Not a defect`);
});

test('reject: links that waited on the finding leave the review queue (they become obsolete)', async () => {
  const repo = make();
  const link = (await repo.getLinks({ status: 'proposed' })).find((l) => l.from_kind === 'finding');
  const queue = (await repo.getLinks({ status: 'proposed' })).length;
  await repo.rejectFinding(link.from_asset);
  assert.equal((await repo.getLinks({ status: 'proposed' })).length, queue - 1);
  assert.equal((await repo.getLinks({ status: 'proposed', include_obsolete: true })).length, queue);
});

test('a rejected finding can be confirmed again, which brings it back into the scores', async () => {
  const repo = make();
  await repo.rejectFinding(LONE);
  await repo.confirmFinding(LONE);
  assert.equal((await hi(repo, TOWER)).score, 66.9);
});

// --------------------------------------------------------------- correct

test('correct severity: the score moves, the finding is confirmed, and the AI proposal is kept', async () => {
  const repo = make();
  const orig = await repo.getFinding(LONE);
  assert.equal(orig.condition_score, 2);
  const f = await repo.correctFinding(LONE, { condition_score: 4 });
  assert.deepEqual([f.condition_score, f.review_status, f.edit.corrected], [4, 'confirmed', true]);
  assert.equal(f.edit.original.condition_score, 2);
  assert.equal((await hi(repo, TOWER)).score, 96.7); // (4 + 5*5) / 30
  assert.equal((await repo.getAuditLog())[0].detail, `Corrected ${LONE}: severity 2 to 4`);
});

test('correct class: the defect group follows, so a different group of the tower is scored', async () => {
  const repo = make();
  const f = await repo.correctFinding(LONE, { defect_class: 'steel_corrosion' });
  assert.deepEqual([f.defect_class, f.group], ['steel_corrosion', 'steel_structure']);
  const groups = (await hi(repo, TOWER)).breakdown.groups;
  assert.equal(groups.find((g) => g.group === 'steel_structure').score, 2);
  assert.equal(groups.find((g) => g.group === 'conductor_accessories').score, 5);
});

test('correct box: stored to three decimals; invalid boxes, classes and severities are refused; nothing to change is an error', async () => {
  const repo = make();
  const f = await repo.correctFinding(LONE, { bbox: { x: 0.12345, y: 0.2, w: 0.3, h: 0.25 } });
  assert.deepEqual(f.bbox, { x: 0.123, y: 0.2, w: 0.3, h: 0.25 });
  await assert.rejects(() => repo.correctFinding(LONE, { bbox: { x: 0.9, y: 0.2, w: 0.3, h: 0.25 } }), /inside the image/);
  await assert.rejects(() => repo.correctFinding(LONE, { bbox: { x: 0.1, y: 0.1, w: 0, h: 0.2 } }), /inside the image/);
  await assert.rejects(() => repo.correctFinding(LONE, { defect_class: 'not_a_class' }), /Unknown defect class/);
  await assert.rejects(() => repo.correctFinding(LONE, { condition_score: 5 }), /condition from 1/);
  await assert.rejects(() => repo.correctFinding(LONE, { condition_score: 4.5 }), /condition from 1/);
  await assert.rejects(() => repo.correctFinding(LONE, {}), /Nothing to change/);
  const current = (await repo.getFinding(LONE)).condition_score;
  await assert.rejects(() => repo.correctFinding(LONE, { condition_score: current }), /Nothing to change/);
});

test('several corrections add up; revert puts the finding back exactly as the AI proposed it', async () => {
  const repo = make();
  const orig = await repo.getFinding(LONE);
  await repo.correctFinding(LONE, { condition_score: 3 });
  const f = await repo.correctFinding(LONE, { defect_class: 'bent_member' });
  assert.deepEqual([f.condition_score, f.defect_class], [3, 'bent_member']);
  assert.equal(f.edit.original.condition_score, orig.condition_score, 'the original is always the AI proposal, not the previous edit');
  const back = await repo.revertFinding(LONE);
  assert.deepEqual([back.defect_class, back.condition_score, back.review_status, back.edit], [orig.defect_class, orig.condition_score, orig.review_status, undefined]);
  assert.equal((await hi(repo, TOWER)).score, 66.9);
  assert.equal((await repo.getAuditLog())[0].action, 'finding_revert');
  await repo.revertFinding(LONE); // nothing to revert: no error, no new log entry
});

// ---------------------------------------------------------------- relink

test('relink: the finding moves to another asset, both owners recompute, and the box and class stay', async () => {
  const repo = make();
  const f0 = await repo.getFinding(LONE);
  const before = { from: (await hi(repo, TOWER)).score, to: (await hi(repo, 'TWR-132-01-011')).score };
  const f = await repo.relinkFinding(LONE, 'TWR-132-01-011');
  assert.equal(f.asset_id, 'TWR-132-01-011');
  assert.equal(f.tower_id, 'TWR-132-01-011');
  assert.equal(f.component_hint, null);
  assert.deepEqual([f.defect_class, f.bbox], [f0.defect_class, f0.bbox]);
  assert.equal((await hi(repo, TOWER)).score, 100, 'the old owner loses it');
  const to = await hi(repo, 'TWR-132-01-011');
  assert.ok(to.breakdown.findingIds.includes(LONE));
  assert.notEqual(before.from, 100);
  assert.ok(before.to <= to.score + 100);
  assert.match((await repo.getAuditLog())[0].detail, new RegExp(`Linked ${LONE} to TWR-132-01-011`));
});

test('relink: a span asset gives its from-tower; unknown and merged assets are refused; the same asset is a no-op', async () => {
  const repo = make();
  const f = await repo.relinkFinding(LONE, 'CND-132-01-010');
  assert.equal(f.tower_id, 'TWR-132-01-010');
  assert.equal((await repo.relinkFinding(LONE, 'CND-132-01-010')).asset_id, 'CND-132-01-010');
  await assert.rejects(() => repo.relinkFinding(LONE, 'NOPE'), /Unknown asset/);
  await repo.mergeAssets({ from: 'MX-TOW-1156', into: 'TWR-132-01-012' });
  await assert.rejects(() => repo.relinkFinding(LONE, 'MX-TOW-1156'), /merged into/);
});

test('relink: an unreviewed finding is confirmed by the reviewer; a rejected one stays rejected', async () => {
  const repo = make();
  assert.equal((await repo.relinkFinding('F-0023', 'TWR-220-03-036')).review_status, 'confirmed');
  await repo.rejectFinding(LONE);
  assert.equal((await repo.relinkFinding(LONE, 'TWR-132-01-011')).review_status, 'rejected');
});

// ---------------------------------------------------------- persistence

test('review actions are mirrored to storage and survive a reload; reset clears them', async () => {
  const storage = memory();
  const repo = make(storage);
  await repo.correctFinding(LONE, { condition_score: 4 });
  await repo.rejectFinding('F-0023');
  await repo.relinkFinding('F-0001', 'CND-500-01-007');
  assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).findingEdits[LONE]);
  const again = make(storage);
  assert.equal((await again.getFinding(LONE)).condition_score, 4);
  assert.equal((await again.getFinding('F-0023')).review_status, 'rejected');
  assert.equal((await again.getFinding('F-0001')).asset_id, 'CND-500-01-007');
  assert.equal((await hi(again, TOWER)).score, 96.7);
  await again.resetDemoData();
  assert.equal((await again.getFinding(LONE)).condition_score, 2);
  assert.equal((await again.getFinding(LONE)).edit, undefined);
  assert.equal((await hi(again, TOWER)).score, 66.9);
  assert.equal((await make(storage).getFinding('F-0023')).review_status, 'pending');
});

test('stored edits that make no sense are ignored, the rest are kept', async () => {
  const good = { original: { review_status: 'confirmed', defect_class: 'sag_excessive', condition_score: 2, bbox: null, asset_id: 'CND-132-01-010', tower_id: null, component_hint: null }, review_status: 'rejected', by: 'x', at: 't' };
  const raw = JSON.stringify({ version: 1, findingEdits: {
    [LONE]: { ...good, defect_class: 'not_a_class' }, 'F-NOPE': good, 'F-0023': { ...good, bbox: { x: 2, y: 0, w: 1, h: 1 } },
    'F-0001': { ...good, asset_id: 'NOPE' }, 'F-0002': { ...good, condition_score: 9 }, 'F-0003': good, 'F-0004': { review_status: 'rejected' },
  } });
  const repo = make(memory({ [STORAGE_KEY]: raw }));
  assert.equal((await repo.getFinding(LONE)).edit, undefined);
  assert.equal((await repo.getFinding('F-0023')).edit, undefined);
  assert.equal((await repo.getFinding('F-0001')).edit, undefined);
  assert.equal((await repo.getFinding('F-0002')).edit, undefined);
  assert.equal((await repo.getFinding('F-0004')).edit, undefined, 'an edit without the AI original is dropped');
  assert.equal((await repo.getFinding('F-0003')).review_status, 'rejected');
});

test('review actions notify subscribers, so scores and screens can refresh', async () => {
  const repo = make();
  const seen = [];
  repo.subscribe((rev) => seen.push(rev));
  await repo.confirmFinding('F-0023');
  await repo.rejectFinding(LONE);
  assert.deepEqual(seen, [1, 2]);
  const before = (await repo.getContext());
  await repo.revertFinding(LONE);
  assert.notEqual(await repo.getContext(), before, 'the scoring context is rebuilt');
});

// ------------------------------------------------------------ the viewer model

test('viewer model: effective values, the AI original after a correction, and the owner score', async () => {
  const repo = make();
  let d = await loadFindingDetail(repo, await loadSnapshot(repo), LONE);
  assert.equal(d.found, true);
  assert.deepEqual([d.finding.condition, d.finding.severity, d.original], [2, 'serious', null]);
  assert.deepEqual([d.owner.id, d.owner.hi, d.owner.band], [TOWER, 66.9, 'moderate']);
  await repo.correctFinding(LONE, { condition_score: 4, defect_class: 'spacer_damaged' });
  d = await loadFindingDetail(repo, await loadSnapshot(repo), LONE);
  assert.deepEqual([d.finding.condition, d.finding.severity, d.finding.label], [4, 'minor', 'Spacer damaged']);
  assert.deepEqual([d.original.condition, d.original.changed.condition, d.original.changed.defectClass, d.original.changed.bbox], [2, true, true, false]);
  assert.equal(d.owner.hi, 96.7);
  assert.equal((await loadFindingDetail(repo, await loadSnapshot(repo), 'F-NOPE')).found, false);
});

test('viewer model: findings of the same owner for the arrow keys, ordered by severity, the current one marked', async () => {
  const repo = make();
  const d = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0308');
  assert.equal(d.siblings.length, 6);
  assert.equal(d.siblings.filter((s) => s.current).length, 1);
  assert.equal(d.siblings[d.index].id, 'F-0308');
  assert.ok(d.siblings.every((s, i, a) => i === 0 || a[i - 1].condition <= s.condition));
  assert.ok(d.siblings.every((s) => s.assetId.startsWith('EW-132-01-011') || s.assetId.includes('132-01-011')));
});

test('viewer model: a rejected finding stays in the list of siblings, but no longer in the compare chain of the others', async () => {
  const repo = make();
  await repo.rejectFinding('F-0145');
  const d = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0308');
  assert.ok(d.siblings.some((s) => s.id === 'F-0145' && s.rejected));
  assert.deepEqual(d.compare.sightings.map((s) => s.id), ['F-0036', 'F-0308'], 'the Q2 sighting was rejected, so it is not a sighting any more');
  const own = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0145');
  assert.equal(own.compare.sightings.some((s) => s.id === 'F-0145'), true, 'but its own viewer still shows it');
});

test('viewer model, compare: the chain over confirmed links, oldest first, with the repair between sightings', async () => {
  const repo = make();
  const d = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0308');
  assert.deepEqual(d.compare.sightings.map((s) => [s.id, s.campaignName, s.condition]), [['F-0036', '2026 Q1', 1], ['F-0145', '2026 Q2', 1], ['F-0308', '2026 Q4', 1]]);
  assert.equal(d.compare.sightings.filter((s) => s.current).length, 1);
  assert.equal(d.compare.between.length, 2);
  assert.deepEqual(d.compare.between[0].items, []);
  const repair = d.compare.between[1].items[0];
  assert.deepEqual([repair.id, repair.date, repair.closesThis], ['RPR-0071', '2026-06-25', false]);
  // the same chain from any member
  const other = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0036');
  assert.deepEqual(other.compare.sightings.map((s) => s.id), ['F-0036', 'F-0145', 'F-0308']);
  const lone = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0002');
  assert.deepEqual(lone.compare.sightings.map((s) => s.id), ['F-0002']);
});

test('viewer model, compare: proposed links are not used, a repair that closed a sighting says so', async () => {
  const repo = make();
  // a proposed link whose two findings are not already joined through other confirmed links
  let proposed = null;
  let d = null;
  for (const l of (await repo.getLinks({ status: 'proposed' })).filter((x) => x.relation === 'same_defect')) {
    const det = await loadFindingDetail(repo, await loadSnapshot(repo), l.from_asset);
    if (!det.compare.sightings.some((s) => s.id === l.to_asset)) { proposed = l; d = det; break; }
  }
  assert.ok(proposed, 'the seed has such a link');
  assert.ok(!d.compare.sightings.some((s) => s.id === proposed.to_asset), 'waiting for a decision: not shown');
  await repo.confirmLink(proposed.link_id);
  const after = await loadFindingDetail(repo, await loadSnapshot(repo), proposed.from_asset);
  assert.ok(after.compare.sightings.some((s) => s.id === proposed.to_asset), 'confirmed by a reviewer: shown');
  const closed = (await repo.getRepairs()).find((r) => r.closes_finding_ids.length);
  const c = await loadFindingDetail(repo, await loadSnapshot(repo), closed.closes_finding_ids[0]);
  assert.equal(c.compare.sightings.find((s) => s.id === closed.closes_finding_ids[0]).closedBy.id, closed.repair_id);
});

test('viewer model: suggestions come with scores and reasons; the current asset is always listed', async () => {
  const repo = make();
  const d = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0308');
  assert.equal(d.suggestions.filter((s) => s.current).length, 1);
  assert.equal(d.suggestions[0].assetId, 'EW-132-01-011');
  const scores = d.suggestions.map((s) => s.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  for (const s of d.suggestions) assert.deepEqual(s.reasons.map((r) => r.signal), ['spatial', 'class fit']);
  assert.equal(d.classes.length, 27);
});

// --------------------------------------------------------------- suggestions

test('suggestions: close assets of the right class score highest; far assets are not offered; the current one always is', () => {
  const seed = generateSeed();
  const f = seed.findings.find((x) => x.finding_id === 'F-0002'); // insulator_flashover_mark, recorded on a tower only
  assert.equal(f.component_hint, 'insulator_string');
  const s = suggestAssets(f, seed.assets);
  assert.ok(s.length <= CONFIG.linking.suggest.maxResults);
  const strings = s.filter((x) => x.class === 'insulator string');
  assert.equal(strings.length, 3, 'all three strings of that tower fit');
  assert.ok(strings.every((x) => x.score > s.find((y) => y.current).score), 'better than the tower it is recorded on');
  assert.ok(s.every((x) => x.current || x.distance <= CONFIG.linking.suggest.gateMeters));
  assert.equal(s.filter((x) => x.current).length, 1);
  // far away: only the current asset remains
  const far = { ...f, location: { type: 'point', lat: 0, lng: 0 } };
  assert.deepEqual(suggestAssets(far, seed.assets).map((x) => x.current), [true]);
  // merged records are never suggested
  const merged = seed.assets.map((a) => (a.asset_id === 'INS-220-03-037-A' ? { ...a, merged_into: 'INS-220-03-037-B' } : a));
  assert.ok(!suggestAssets(f, merged).some((x) => x.assetId === 'INS-220-03-037-A'));
});

test('suggestions: the configured defect targets agree with where the seed records each defect', () => {
  const seed = generateSeed();
  const byId = new Map(seed.assets.map((a) => [a.asset_id, a]));
  const targets = CONFIG.linking.suggest.defectTargets;
  assert.deepEqual(Object.keys(targets).sort(), [...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => d.id).sort());
  for (const f of seed.findings.filter((x) => !x.component_hint)) assert.ok(targets[f.defect_class].includes(byId.get(f.asset_id).class), `${f.finding_id} ${f.defect_class} on ${byId.get(f.asset_id).class}`);
  assert.equal(DEFECT_OPTIONS.length, 27);
});

// --------------------------------------------------------------- demo images

test('demo images: thermal values are deterministic per finding, hot defects run hotter, the label is "Demo image"', () => {
  const f = (id, defectClass, sensor = 'rgb') => ({ id, defectClass, sensor, bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } });
  assert.deepEqual(thermalModel(f('F-0001', 'clamp_loose')), thermalModel(f('F-0001', 'clamp_loose')));
  assert.notDeepEqual(thermalModel(f('F-0001', 'clamp_loose')), thermalModel(f('F-0002', 'clamp_loose')));
  for (let i = 0; i < 40; i += 1) {
    const hot = thermalModel(f(`F-${i}`, 'bushing_hotspot'));
    const cold = thermalModel(f(`F-${i}`, 'bird_nest'));
    assert.ok(hot.rise >= 28 && hot.rise <= 68 && cold.rise >= 6 && cold.rise <= 15);
    assert.ok(hot.ambient >= 18 && hot.ambient < 26);
  }
  assert.equal(thermalModel(f('F-1', 'bird_nest', 'thermal')).hot, true, 'anything seen by the thermal sensor runs hot');
  const t = thermalModel({ id: 'F-1', defectClass: 'x', sensor: 'rgb', bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.2 } });
  assert.ok(Math.abs(t.cx - 0.3) < 1e-9 && Math.abs(t.cy - 0.3) < 1e-9);
  assert.equal(DEMO_LABEL, 'Demo image');
  assert.deepEqual([SIZE.w, SIZE.h], [640, 480]);
  assert.equal(hash('a'), hash('a'));
  assert.notEqual(hash('a'), hash('b'));
});

test('demo images: the false-colour palette runs dark to bright and stays in range', () => {
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  assert.ok(lum(falseColour(0)) < 20 && lum(falseColour(1)) > 220);
  let last = -1;
  for (let t = 0; t <= 1; t += 0.05) { const c = falseColour(t); assert.ok(c.every((v) => v >= 0 && v <= 255)); assert.ok(lum(c) >= last - 1); last = lum(c); }
  assert.deepEqual(falseColour(-5), falseColour(0));
  assert.deepEqual(falseColour(7), falseColour(1));
  assert.match(SCALE_GRADIENT, /^linear-gradient\(to top, rgb\(4,4,24\) 0%.*rgb\(252,253,191\) 100%\)$/);
});

test('audit log: every reviewer action is recorded with actor, timestamp, reason and the change', async () => {
  const repo = createRepository(generateSeed(), { storage: null, clock: () => '2026-11-12T09:00:00.000Z' });
  await repo.rejectFinding('F-0090', { reason: 'Wrong location', by: 'sam' });
  await repo.revertFinding('F-0090', { by: 'sam', reason: 'Rejected by mistake' });
  await repo.correctFinding('F-0090', { condition_score: 4 }, { by: 'sam', reason: 'Looks minor' });
  await repo.confirmFinding('F-0023', { by: 'sam' });
  await repo.relinkFinding('F-0002', 'TWR-132-01-012', { by: 'sam', reason: 'Closer tower' });
  const log = (await repo.getAuditLog()).filter((e) => e.finding_id);
  const by = (a, id) => log.find((e) => e.action === a && e.finding_id === id);
  assert.equal(by('finding_reject', 'F-0090').reason, 'Wrong location');
  assert.equal(by('finding_revert', 'F-0090').reason, 'Rejected by mistake');
  const c = by('finding_correct', 'F-0090');
  assert.deepEqual([c.reason, c.changes.condition_score.to], ['Looks minor', 4]);
  assert.ok(by('finding_confirm', 'F-0023') && by('finding_relink', 'F-0002').reason === 'Closer tower');
  for (const e of log) assert.ok(e.at === '2026-11-12T09:00:00.000Z' && e.actor === 'sam' && e.detail && 'reason' in e, e.action);
  const d = await loadFindingDetail(repo, await loadSnapshot(repo), 'F-0090');
  assert.deepEqual(d.history.map((e) => e.action), ['finding_reject', 'finding_revert', 'finding_correct'], 'oldest first');
});

test('the new section: ids are unique, it follows T-040 on its line, and Line Health counts it as not assessed', async () => {
  const repo = createRepository(generateSeed(), { storage: null });
  const snap = await loadSnapshot(repo);
  const ids = snap.assets.map((a) => a.asset_id);
  assert.equal(new Set(ids).size, ids.length);
  const line = snap.assets.filter((a) => a.class === 'tower' && a.parent_id === 'L-132-01' && /^TWR-/.test(a.asset_id)).map((a) => a.asset_id);
  assert.deepEqual(line.slice(-5), ['TWR-132-01-040', 'TWR-132-01-041', 'TWR-132-01-042', 'TWR-132-01-043', 'TWR-132-01-044']);
  assert.ok(snap.byId.has('SPN-132-01-040-041') && snap.byId.has('SPN-132-01-043-044'));
  const nots = new Set(snap.scores.get('L-132-01').hi.breakdown.notAssessed.map((n) => n.id ?? n.asset_id ?? n));
  for (const n of ['041', '042', '043', '044']) assert.ok(nots.has(`TWR-132-01-${n}`), n);
});

test('suggestions never offer a duplicate record that is waiting to be merged, but still list it when the finding is on it', async () => {
  const repo = createRepository(generateSeed(), { storage: null });
  const snap = await loadSnapshot(repo);
  assert.ok(snap.dupRecord.size > 0);
  const f = (await repo.getFinding('F-0308'));
  const before = suggestAssets(f, snap.assets).map((x) => x.assetId);
  assert.ok(before.includes('MX-TOW-1212'), 'the duplicate T-11 record was offered before the fix');
  const d = await loadFindingDetail(repo, snap, 'F-0308');
  const ids = d.suggestions.map((x) => x.assetId);
  assert.ok(!ids.some((id) => snap.dupRecord.has(id)));
  assert.ok(ids.includes('TWR-132-01-011') && ids.some((id) => id.startsWith('EW-')), 'real targets stay');
  const cur = suggestAssets({ ...f, asset_id: 'MX-TOW-1212' }, snap.assets, { exclude: new Set(['MX-TOW-1212']) });
  assert.ok(cur.some((x) => x.assetId === 'MX-TOW-1212' && x.current));
});

test('hash state: the screen keys (view, line, tower, band) sit next to the overlay keys and each survives the other', () => {
  assert.deepEqual(parseView('#view=towers&line=L-132-01&tower=TWR-132-01-011&band=poor'), { view: 'towers', line: 'L-132-01', tower: 'TWR-132-01-011', band: 'poor' });
  assert.deepEqual(parseView('#view=nonsense'), { view: null, line: null, tower: null, band: null });
  const now = '#view=lines&line=L-220-03';
  assert.equal(hashFor({ asset: 'X' }, now), '#asset=X&view=lines&line=L-220-03', 'opening a panel keeps the screen keys');
  assert.equal(hashFor({ asset: null, finding: null }, '#asset=X&view=lines&line=L-220-03'), now, 'closing it keeps them too');
  assert.equal(hashFor({ ...parseHash('#asset=X'), view: 'towers', tower: 'T', line: null }, '#asset=X&view=lines&line=L-1'), '#asset=X&view=towers&tower=T', 'changing the screen keys keeps the panel');
  assert.equal(hashFor({ view: null, line: null, tower: null, band: null }, '#view=towers&tower=T&band=none'), '');
});
