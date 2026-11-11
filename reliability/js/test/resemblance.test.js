import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { scorePair, normalizeName, nameSimilarity } from '../domain/linking/resemblance.js';
import { visualSimilarity, VISUAL_IS_STUB } from '../domain/linking/visualStub.js';
import { generateResemblanceLinks } from '../domain/linking/candidates.js';
import { CONFIG } from '../domain/config.js';
import { duplicateTruth, repeatTruth, precisionRecall, linkKeys } from './evaluate.js';

const seed = generateSeed();
const A = (id) => seed.assets.find((a) => a.asset_id === id);
const F = (id) => seed.findings.find((f) => f.finding_id === id);
const features = (id) => seed.visualFeatures[id];
const byReason = (r, signal) => r.reasons.find((x) => x.signal === signal);
const sum = (r) => r.reasons.reduce((s, x) => s + x.contribution, 0);

// the seed's own duplicate pairs, by the fields they differ in
const dupOf = (original) => A(seed.groundTruth.duplicates.find((d) => d.original === original).duplicate);

// ------------------------------------------------------------ names

test('names: abbreviations, hyphens and leading zeros normalise to the same thing', () => {
  for (const v of ['T-014', 'T14', 'Tower 14', 'T 014', 't-14']) assert.equal(normalizeName(v), 't14', v);
  for (const v of ['TX-2A', 'TX2A', 'Transformer 2A', 'tx-2a']) assert.equal(normalizeName(v), 'tx2a', v);
  assert.equal(normalizeName('T-014 str. B'), normalizeName('T-014 string B'));
});

test('names: a differing short or numeric token makes two identifiers distinct, not "nearly the same"', () => {
  assert.equal(nameSimilarity('T-014 string A', 'T-014 string B').kind, 'distinct');
  assert.equal(nameSimilarity('TX-2A', 'TX-2B').kind, 'distinct');
  assert.equal(nameSimilarity('TX-2A BSH-HV', 'TX-2A BSH-LV').kind, 'distinct');
  assert.equal(nameSimilarity('T-014 damper 1', 'T-014 damper 2').kind, 'distinct');
  assert.equal(nameSimilarity('Tower 14', 'T-014').kind, 'equal');
  assert.equal(nameSimilarity('Dryden substation', 'Dryden substaton').kind, 'fuzzy', 'a typo in a long word is fuzzy');
});

// ----------------------------------------------------------- assets

test('a duplicate tower scores high, with identifier, attribute and spatial reasons that add up to the score', () => {
  const dup = seed.groundTruth.duplicates.find((d) => A(d.original).class === 'tower');
  const r = scorePair(A(dup.original), A(dup.duplicate));
  assert.equal(r.comparable, true);
  assert.ok(r.score >= 0.85, String(r.score));
  assert.deepEqual(r.reasons.map((x) => x.signal), ['identifier', 'attribute', 'spatial']);
  assert.ok(Math.abs(sum(r) - r.score) < 0.01, 'contributions add up to the score');
  for (const x of r.reasons) { assert.ok(x.value >= 0 && x.value <= 1 && x.weight > 0 && x.contribution >= 0 && x.detail.length > 0); }
  assert.equal(byReason(r, 'visual'), undefined, 'assets have no images to compare');
});

test('a shared external id or serial raises the identifier signal to 1; a name alone gives 0.85', () => {
  const tx = scorePair(A('TX-2A'), dupOf('TX-2A'));
  assert.equal(byReason(tx, 'identifier').value, 1);
  assert.match(byReason(tx, 'identifier').detail, /same serial/);
  const original = A('TWR-132-01-012');
  const noShared = { ...dupOf('TWR-132-01-012'), external_ids: { maximo: 'MX-X' } };
  assert.equal(byReason(scorePair(original, noShared), 'identifier').value, CONFIG.linking.resemblance.nameOnlyIdentifierScore);
  const shared = { ...noShared, external_ids: { maximo: 'MX-X', gis: original.external_ids.gis } };
  assert.equal(byReason(scorePair(original, shared), 'identifier').value, 1);
  assert.ok(scorePair(original, shared).score > scorePair(original, noShared).score);
});

test('two different insulator strings on one tower are capped below the review band, whatever else matches', () => {
  const r = scorePair(A('INS-132-01-010-A'), A('INS-132-01-010-B'));
  assert.ok(r.score <= CONFIG.linking.resemblance.distinctIdentifierCap);
  assert.ok(r.score < CONFIG.linking.dropBelow);
  assert.match(r.notes[0], /Capped at 0.45: identifiers differ/);
});

test('the same insulator string recorded twice is not capped', () => {
  const r = scorePair(A('INS-132-01-010-A'), dupOf('INS-132-01-010-A'));
  assert.deepEqual(r.notes, []);
  assert.ok(r.score >= 0.85, String(r.score));
});

test('not comparable: different class, too far apart, same record, already merged', () => {
  assert.equal(scorePair(A('TWR-220-03-014'), A('INS-220-03-014-A')).comparable, false);
  assert.match(scorePair(A('TWR-220-03-014'), A('INS-220-03-014-A')).notes[0], /different classes/);
  const far = scorePair(A('TWR-220-03-014'), A('TWR-132-01-014'));
  assert.equal(far.comparable, false);
  assert.match(far.notes[0], /beyond the 50 m gate/, 'same name on another line is a different tower');
  assert.equal(far.score, 0);
  assert.match(scorePair(A('TX-2A'), A('TX-2A')).notes[0], /same record/);
  assert.match(scorePair(A('TX-2A'), { ...dupOf('TX-2A'), merged_into: 'TX-2A' }).notes[0], /already merged/);
  assert.equal(scorePair(A('TX-2A'), F('F-0001')).comparable, false);
});

test('scoring is symmetric', () => {
  const dup = seed.groundTruth.duplicates[0];
  assert.equal(scorePair(A(dup.original), A(dup.duplicate)).score, scorePair(A(dup.duplicate), A(dup.original)).score);
});

// --------------------------------------------------------- findings

const group = seed.groundTruth.repeatSightings.find((g) => g.finding_ids.length === 2 && g.finding_ids.every((id) => F(id).review_status !== 'rejected' && !F(id).component_hint));

test('two sightings of one defect: high score with identifier, attribute, spatial and visual reasons', () => {
  const [x, y] = group.finding_ids.map(F);
  const r = scorePair(x, y, { features });
  assert.equal(r.comparable, true);
  assert.ok(r.score >= 0.9, String(r.score));
  assert.deepEqual(r.reasons.map((s) => s.signal), ['identifier', 'attribute', 'spatial', 'visual']);
  assert.ok(Math.abs(sum(r) - r.score) < 0.01);
  assert.match(byReason(r, 'visual').detail, /STUB/);
});

test('findings that are not the same defect score low: different asset, or a different look', () => {
  const [x] = group.finding_ids.map(F);
  const other = seed.findings.find((f) => f.defect_class === x.defect_class && f.campaign_id !== x.campaign_id && f.asset_id !== x.asset_id && !group.finding_ids.includes(f.finding_id));
  const farAway = scorePair(x, other, { features });
  assert.equal(farAway.score < CONFIG.linking.dropBelow, true);
  // same place and class but a different appearance: visual pulls the score down
  const [a, b] = group.finding_ids.map(F);
  const lookAlike = scorePair(a, b, { features });
  const lookDifferent = scorePair(a, b, { features: (id) => (id === b.finding_id ? features(b.finding_id).map((v, i) => (i % 2 ? -v : v)) : features(id)) });
  assert.ok(lookDifferent.score < lookAlike.score);
});

test('findings: same campaign and different defect class are not comparable; different resolved assets are capped', () => {
  const [x, y] = group.finding_ids.map(F);
  assert.match(scorePair(x, { ...y, campaign_id: x.campaign_id }, { features }).notes[0], /same campaign/);
  assert.match(scorePair(x, { ...y, defect_class: 'bird_nest' }, { features }).notes[0], /different defect classes/);
  const split = scorePair(x, { ...y, asset_id: 'SOMETHING-ELSE' }, { features });
  assert.ok(split.score <= CONFIG.linking.resemblance.distinctIdentifierCap);
  assert.match(split.notes[0], /recorded on different assets/);
});

test('findings: an unresolved sighting on the same tower is a partial identifier match (0.6)', () => {
  const [x, y] = group.finding_ids.map(F);
  const r = scorePair(x, { ...y, component_hint: x.defect_class, asset_id: y.tower_id }, { features });
  assert.equal(byReason(r, 'identifier').value, 0.6);
  assert.deepEqual(r.notes, []);
});

test('without feature vectors the visual signal is dropped and the other weights are rescaled', () => {
  const [x, y] = group.finding_ids.map(F);
  const r = scorePair(x, y);
  assert.deepEqual(r.reasons.map((s) => s.signal), ['identifier', 'attribute', 'spatial']);
  assert.ok(Math.abs(sum(r) - r.score) < 0.01);
});

test('the visual signal is a marked stub: it compares seeded vectors and says so', () => {
  assert.equal(VISUAL_IS_STUB, true);
  assert.equal(visualSimilarity([1, 0], [1, 0]), 1);
  assert.equal(visualSimilarity([1, 0], [0, 1]), 0);
  assert.equal(visualSimilarity(null, [1]), null);
  assert.equal(visualSimilarity([1, 2], [1]), null);
  assert.equal(seed.visualFeatures[seed.findings[0].finding_id].length, 8);
});

// ------------------------------------------------ candidate generation

const gen = generateResemblanceLinks({ assets: seed.assets, findings: seed.findings, features });

test('blocking: only a tiny fraction of all possible pairs is ever scored', () => {
  assert.ok(gen.stats.assets.scored < gen.stats.assets.possiblePairs * 0.001, `${gen.stats.assets.scored} of ${gen.stats.assets.possiblePairs}`);
  assert.ok(gen.stats.findings.scored < gen.stats.findings.possiblePairs * 0.01, `${gen.stats.findings.scored} of ${gen.stats.findings.possiblePairs}`);
  assert.ok(gen.stats.assets.records > 1500 && gen.stats.assets.possiblePairs > 1e6);
});

test('blocking: linked assets share a class and sit within the spatial gate; linked findings share a defect class and differ in campaign', () => {
  const byAsset = new Map(seed.assets.map((a) => [a.asset_id, a]));
  const byFinding = new Map(seed.findings.map((f) => [f.finding_id, f]));
  for (const l of gen.links) {
    if (l.from_kind === 'asset') assert.equal(byAsset.get(l.from_asset).class, byAsset.get(l.to_asset).class);
    else {
      const [x, y] = [byFinding.get(l.from_asset), byFinding.get(l.to_asset)];
      assert.equal(x.defect_class, y.defect_class);
      assert.notEqual(x.campaign_id, y.campaign_id);
      assert.notEqual(x.review_status, 'rejected');
    }
  }
});

test('thresholds: auto-link at 0.90 or above, review queue from 0.60 to 0.90, nothing below 0.60 is kept', () => {
  assert.equal(CONFIG.linking.autoLinkAtOrAbove, 0.9);
  assert.equal(CONFIG.linking.dropBelow, 0.6);
  for (const l of gen.links) {
    assert.ok(l.confidence >= 0.6, l.link_id);
    if (l.confidence >= 0.9) assert.deepEqual([l.status, l.confirmed_by], ['confirmed', 'auto-link']);
    else assert.deepEqual([l.status, l.confirmed_by], ['proposed', null]);
  }
  assert.ok(gen.links.some((l) => l.status === 'proposed') && gen.links.some((l) => l.status === 'confirmed'));
});

test('thresholds are settings: raising the auto-link threshold moves links into the review queue', () => {
  const strict = { ...CONFIG, linking: { ...CONFIG.linking, autoLinkAtOrAbove: 0.99 } };
  const r = generateResemblanceLinks({ assets: seed.assets, findings: seed.findings, features }, strict);
  assert.ok(r.stats.findings.auto < gen.stats.findings.auto);
  assert.equal(r.links.length, gen.links.length);
});

test('every link carries its reasons, sorted by score, with unique ids; auto-links are logged', () => {
  assert.ok(gen.links.every((l) => l.reasons.length >= 3 && l.type === 'same_asset' && l.source === 'resemblance'));
  const scores = gen.links.map((l) => l.confidence);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(new Set(gen.links.map((l) => l.link_id)).size, gen.links.length);
  const autos = gen.links.filter((l) => l.status === 'confirmed');
  assert.equal(gen.audit.length, autos.length);
  assert.ok(gen.audit.every((e) => e.action === 'auto_link' && autos.some((l) => l.link_id === e.link_id)));
});

test('a duplicate record keeps at most one automatic partner', () => {
  const autos = gen.links.filter((l) => l.status === 'confirmed' && l.from_kind === 'asset');
  assert.equal(new Set(autos.map((l) => l.from_asset)).size, autos.length);
});

test('orientation: the duplicate points at the record that survives (the one with the SAP id)', () => {
  for (const l of gen.links.filter((x) => x.from_kind === 'asset')) {
    const from = seed.assets.find((a) => a.asset_id === l.from_asset);
    const to = seed.assets.find((a) => a.asset_id === l.to_asset);
    assert.ok(!from.external_ids.sap && to.external_ids.sap, `${l.from_asset} should not be the system of record, ${l.to_asset} should`);
  }
});

test('merged records and rejected findings are not matched', () => {
  const dup = seed.groundTruth.duplicates[0].duplicate;
  const assets = seed.assets.map((a) => (a.asset_id === dup ? { ...a, merged_into: seed.groundTruth.duplicates[0].original } : a));
  const r = generateResemblanceLinks({ assets, findings: seed.findings, features });
  assert.ok(!r.links.some((l) => l.from_asset === dup || l.to_asset === dup));
  const rejected = new Set(seed.findings.filter((f) => f.review_status === 'rejected').map((f) => f.finding_id));
  assert.ok(!gen.links.some((l) => rejected.has(l.from_asset) || rejected.has(l.to_asset)));
});

// ---------------------------------- evaluation against ground truth
// The answer key is read here and nowhere in domain/ or the repository.

test('evaluation: duplicate records, precision and recall at the chosen thresholds', (t) => {
  const truth = duplicateTruth(seed.groundTruth);
  const auto = precisionRecall(linkKeys(gen.links, 'asset', 0.9), truth);
  const candidates = precisionRecall(linkKeys(gen.links, 'asset', 0.6), truth);
  t.diagnostic(`duplicates auto>=0.90: precision ${auto.precision.toFixed(3)} recall ${auto.recall.toFixed(3)} (${auto.truePositives}/${auto.predicted} predicted, ${auto.truth} true)`);
  t.diagnostic(`duplicates >=0.60 (auto + review): precision ${candidates.precision.toFixed(3)} recall ${candidates.recall.toFixed(3)} (${candidates.truePositives}/${candidates.predicted} predicted)`);
  assert.equal(auto.truth, 8);
  assert.ok(auto.precision >= 0.95, `auto precision ${auto.precision}`);
  assert.ok(auto.recall >= 0.8, `auto recall ${auto.recall}`);
  assert.ok(candidates.precision >= 0.95, `candidate precision ${candidates.precision}`);
  assert.ok(candidates.recall >= 0.95, `candidate recall ${candidates.recall}`);
});

test('evaluation: repeat sightings, precision and recall at the chosen thresholds', (t) => {
  const truth = repeatTruth(seed.groundTruth, seed.findings);
  const auto = precisionRecall(linkKeys(gen.links, 'finding', 0.9), truth);
  const candidates = precisionRecall(linkKeys(gen.links, 'finding', 0.6), truth);
  t.diagnostic(`repeat sightings auto>=0.90: precision ${auto.precision.toFixed(3)} recall ${auto.recall.toFixed(3)} (${auto.truePositives}/${auto.predicted} predicted, ${auto.truth} true)`);
  t.diagnostic(`repeat sightings >=0.60 (auto + review): precision ${candidates.precision.toFixed(3)} recall ${candidates.recall.toFixed(3)} (${candidates.truePositives}/${candidates.predicted} predicted)`);
  assert.ok(truth.size > 100);
  assert.ok(auto.precision >= 0.95, `auto precision ${auto.precision}`);
  assert.ok(auto.recall >= 0.7, `auto recall ${auto.recall}`);
  assert.ok(candidates.precision >= 0.9, `candidate precision ${candidates.precision}`);
  assert.ok(candidates.recall >= 0.95, `candidate recall ${candidates.recall}`);
});

test('the answer key is not used by the linking or scoring code', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = new URL('../domain/', import.meta.url);
  const files = [];
  const walk = async (dir) => { for (const e of await readdir(dir, { withFileTypes: true })) { const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir); if (e.isDirectory()) await walk(u); else files.push(u); } };
  await walk(root);
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(!/groundTruth|getGroundTruth/.test(await readFile(f, 'utf8')), `${f.pathname} mentions the answer key`);
});
