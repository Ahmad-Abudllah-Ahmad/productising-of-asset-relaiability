import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { ASSET_CATEGORIES, ASSET_CLASSES, LINK_TYPES, LINK_STATUSES, REVIEW_STATUSES } from '../domain/types.js';

const seed = generateSeed();
const { assets, links, labels, campaigns, captures, findings, dga, groundTruth } = seed;
const byId = new Map(assets.map((a) => [a.asset_id, a]));
const dupIds = new Set(groundTruth.duplicates.map((d) => d.duplicate));
const originals = assets.filter((a) => !dupIds.has(a.asset_id));

test('deterministic: same seed gives identical output, different seed differs', () => {
  assert.equal(JSON.stringify(generateSeed()), JSON.stringify(seed));
  assert.notEqual(JSON.stringify(generateSeed({ seed: 1 })), JSON.stringify(seed));
});

test('three lines at 132, 220 and 500 kV with 150 towers in total', () => {
  const lines = assets.filter((a) => a.class === 'line');
  assert.deepEqual(lines.map((l) => l.voltage_kv).sort((a, b) => a - b), [132, 220, 500]);
  const towers = originals.filter((a) => a.class === 'tower');
  assert.equal(towers.length, 150);
  assert.equal(originals.filter((a) => a.class === 'span').length, 147);
});

test('two substations with six transformers, each with bushings, tap changer, cooling and tank', () => {
  assert.equal(assets.filter((a) => a.class === 'substation').length, 2);
  const tx = originals.filter((a) => a.class === 'power_transformer');
  assert.equal(tx.length, 6);
  for (const t of tx) {
    const kids = assets.filter((a) => a.parent_id === t.asset_id).map((a) => a.class);
    assert.equal(kids.filter((c) => c === 'bushing').length, 2, t.asset_id);
    for (const c of ['tap_changer', 'cooling', 'tank_oil']) assert.ok(kids.includes(c), `${t.asset_id} ${c}`);
  }
});

test('ids are unique and every parent exists', () => {
  assert.equal(byId.size, assets.length);
  for (const a of assets) if (a.parent_id) assert.ok(byId.has(a.parent_id), `${a.asset_id} -> ${a.parent_id}`);
});

test('every asset carries the core fields, a known category and class, and a managed label', () => {
  const labelIds = new Set(labels.map((l) => l.label_id));
  for (const a of assets) {
    for (const k of ['asset_id', 'category', 'class', 'parent_id', 'name', 'external_ids', 'location', 'voltage_kv', 'install_date', 'criticality', 'labels', 'health_index', 'health_updated_at']) {
      assert.ok(k in a, `${a.asset_id} missing ${k}`);
    }
    assert.ok(ASSET_CATEGORIES.includes(a.category));
    assert.ok(ASSET_CLASSES[a.category].includes(a.class), `${a.asset_id} ${a.category}/${a.class}`);
    assert.ok(a.criticality >= 1 && a.criticality <= 5);
    for (const l of a.labels) assert.ok(labelIds.has(l), `${a.asset_id} unknown label ${l}`);
  }
});

test('no asset stores evidence; findings are separate and health is not computed yet', () => {
  assert.ok(assets.every((a) => a.category !== 'inspection_evidence'));
  assert.ok(assets.every((a) => a.health_index === null));
});

test('three campaigns with about 400 findings covering all 23 line defect classes', () => {
  assert.equal(campaigns.length, 3);
  assert.equal(findings.length, 400);
  const seen = new Set(findings.map((f) => f.defect_class));
  for (const d of DEFECT_CLASSES) assert.ok(seen.has(d.id), `no finding for ${d.id}`);
  for (const d of TX_DEFECT_CLASSES) assert.ok(seen.has(d.id), `no finding for ${d.id}`);
  for (const c of campaigns) assert.ok(findings.some((f) => f.campaign_id === c.campaign_id));
});

test('findings point at real assets, valid captures, and well-formed boxes and scores', () => {
  const capIds = new Map(captures.map((c) => [c.capture_id, c]));
  assert.equal(new Set(findings.map((f) => f.finding_id)).size, findings.length);
  for (const f of findings) {
    assert.ok(byId.has(f.asset_id), f.finding_id);
    const cap = capIds.get(f.capture_id);
    assert.ok(cap && cap.finding_ids.includes(f.finding_id), f.finding_id);
    assert.equal(cap.campaign_id, f.campaign_id);
    assert.ok([1, 2, 3, 4, 5].includes(f.condition_score));
    assert.ok(REVIEW_STATUSES.includes(f.review_status));
    assert.ok(f.confidence >= 0 && f.confidence <= 1);
    if (f.bbox) {
      const { x, y, w, h } = f.bbox;
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1, f.finding_id);
    } else assert.equal(f.sensor, 'lidar');
  }
});

test('a capture can hold findings for several assets', () => {
  assert.ok(captures.some((c) => new Set(c.finding_ids.map((id) => findings.find((f) => f.finding_id === id).asset_id)).size > 1));
});

test('finding GPS is within the matching distance of its tower, or of its span midpoint for span findings', () => {
  const max = CONFIG.linking.spatialMaxMeters.findingToTower;
  const m = 111320;
  const dist = (a, b) => Math.hypot((a.lat - b.lat) * m, (a.lng - b.lng) * m * Math.cos((b.lat * Math.PI) / 180));
  for (const f of findings.filter((x) => x.tower_id)) {
    const target = byId.get(f.asset_id);
    let ref = byId.get(f.tower_id).location;
    if (target.class === 'conductor' || target.class === 'span_corridor_segment') {
      const span = byId.get(target.parent_id);
      const a = byId.get(span.ext.from_tower).location;
      const b = byId.get(span.ext.to_tower).location;
      ref = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    }
    assert.ok(dist(f.location, ref) < max, `${f.finding_id} is ${dist(f.location, ref).toFixed(0)} m from its reference point`);
  }
});

test('some findings are attached to the tower only (component unresolved) for the matcher to resolve', () => {
  const hinted = findings.filter((f) => f.component_hint);
  assert.ok(hinted.length >= 15);
  for (const f of hinted) assert.equal(f.asset_id, f.tower_id);
});

test('duplicate asset records exist, differ in name and ids, and sit close to the original', () => {
  assert.equal(groundTruth.duplicates.length, 8);
  for (const { original, duplicate } of groundTruth.duplicates) {
    const o = byId.get(original);
    const d = byId.get(duplicate);
    assert.ok(o && d);
    assert.equal(o.class, d.class);
    assert.notEqual(o.name, d.name);
    assert.ok(d.external_ids.maximo && !o.external_ids.maximo);
  }
});

test('repeat sightings: the same physical defect appears in 2-3 campaigns', () => {
  assert.ok(groundTruth.repeatSightings.length >= 30);
  for (const r of groundTruth.repeatSightings) {
    const fs = r.finding_ids.map((id) => findings.find((f) => f.finding_id === id));
    assert.ok(fs.length >= 2 && fs.length <= 3);
    assert.equal(new Set(fs.map((f) => f.campaign_id)).size, fs.length, 'one sighting per campaign');
    assert.equal(new Set(fs.map((f) => f.defect_class)).size, 1);
    for (let i = 1; i < fs.length; i += 1) assert.ok(fs[i].condition_score <= fs[i - 1].condition_score, 'condition does not improve');
  }
});

test('DGA: eight samples per transformer, oldest to newest, with a clear faulty profile', () => {
  const tx = originals.filter((a) => a.class === 'power_transformer');
  for (const t of tx) {
    const s = dga.filter((x) => x.asset_id === t.asset_id);
    assert.equal(s.length, CONFIG.seed.dgaSamplesPerTransformer);
    assert.deepEqual(s.map((x) => x.date), [...s.map((x) => x.date)].sort());
  }
  const first = (id) => dga.find((x) => x.asset_id === id);
  const last = (id) => dga.filter((x) => x.asset_id === id).at(-1);
  assert.ok(last('TX-2C').c2h2 > first('TX-2C').c2h2 + 3, 'arcing profile raises acetylene');
  assert.ok(last('TX-2A').c2h4 > first('TX-2A').c2h4 * 3, 'thermal profile raises ethylene');
  assert.ok(last('TX-1A').h2 < first('TX-1A').h2 * 1.5, 'healthy profile stays flat');
});

test('links: hierarchy for every parent, electrical topology, valid fields', () => {
  assert.equal(links.filter((l) => l.type === 'hierarchy').length, assets.filter((a) => a.parent_id).length);
  assert.ok(links.some((l) => l.type === 'electrical' && l.relation === 'terminates_at'));
  assert.ok(links.some((l) => l.type === 'electrical' && l.relation === 'feeds' && l.to_asset.startsWith('TX-')));
  for (const l of links) {
    assert.ok(LINK_TYPES.includes(l.type) && LINK_STATUSES.includes(l.status));
    assert.ok(byId.has(l.from_asset) && byId.has(l.to_asset), l.link_id);
  }
});

test('labels: managed list is unique and includes every plan kind', () => {
  assert.equal(new Set(labels.map((l) => l.label_id)).size, labels.length);
  const kinds = new Set(labels.map((l) => l.kind));
  for (const k of ['corridor', 'circuit', 'substation', 'region', 'corrosion_zone', 'criticality_class', 'manufacturer', 'design_family', 'failure_mode']) {
    assert.ok(kinds.has(k), k);
  }
});

test('one corridor label selects towers, spans, components, transformers and findings targets together', () => {
  const north = assets.filter((a) => a.labels.includes('corridor:corridor-north'));
  const classes = new Set(north.map((a) => a.class));
  for (const c of ['tower', 'span', 'insulator_string', 'power_transformer']) assert.ok(classes.has(c), c);
});

test('same-model answer key groups transformers by design family', () => {
  const g = groundTruth.sameModel['design_family:ap-400'];
  assert.ok(g.includes('TX-2A') && g.includes('TX-2B') && !g.includes('TX-2C'));
});

test('campaign coverage lists real towers', () => {
  for (const c of campaigns) for (const id of c.inspected_tower_ids) assert.equal(byId.get(id)?.class, 'tower');
});
