import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setManifest, evidenceOf, captionOf, creditsOf, hasManifest, PLACEHOLDER_TEXT } from '../app/evidence.js';
import { DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';

const DIR = path.resolve('reliability/assets/inspection');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const ALLOWED = /^(CC0|CC BY 4\.0|CC BY 3\.0|CC BY 2\.0|CC BY 2\.5 AU|CC BY-SA 4\.0|CC BY-SA 3\.0|CC BY-SA 2\.5|CC BY-SA 2\.0|Public domain)$/;
const classes = [...DEFECT_CLASSES, ...TX_DEFECT_CLASSES];

test('manifest: every real entry has its file, credit, an allowed licence and a box inside the image', () => {
  assert.ok(manifest.entries.length > 0);
  for (const e of manifest.entries) {
    assert.ok(classes.some((c) => c.id === e.class) || e.class === 'healthy_example', `known class: ${e.class}`);
    assert.ok(['reference', 'placeholder', 'own-inspection'].includes(e.provenance), `${e.id} provenance`);
    if (e.provenance === 'placeholder') continue;
    assert.ok(fs.existsSync(path.join(DIR, e.file)), `${e.file} exists`);
    if (e.provenance === 'own-inspection') {
      assert.equal(e.bboxSource, 'burned-in');
      assert.equal(e.bbox, null, 'a burned-in box is never drawn a second time');
      assert.equal(e.native, true);
      const dim = fs.readFileSync(path.join(DIR, e.file));
      assert.ok(e.width > 0 && e.height > 0 && dim.length > 0);
      assert.ok(!e.author && !e.licence, 'no external credit');
      continue;
    }
    assert.ok(e.author && e.source && e.pageUrl && e.licenceUrl, `${e.id} has a full credit`);
    assert.match(e.licence, ALLOWED, `${e.id}: ${e.licence}`);
    assert.doesNotMatch(e.licence, /NC|ND/, 'never NC or ND');
    assert.ok(['dataset', 'drawn'].includes(e.bboxSource));
    const b = e.bbox;
    assert.ok(b.x >= 0 && b.y >= 0 && b.w > 0.02 && b.h > 0.02 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, `${e.id} box inside`);
    assert.ok(Math.abs(e.width / e.height - 4 / 3) < 0.01, `${e.id} is 4:3`);
    assert.ok(e.width <= 1024);
  }
  const files = fs.readdirSync(DIR, { recursive: true }).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => f.replaceAll('\\', '/'));
  const listed = new Set(manifest.entries.map((e) => e.file));
  assert.deepEqual(files.filter((f) => !listed.has(f)), [], 'no image sits in the folder without a manifest entry');
});

test('evidenceOf: same finding, same picture; the AI class decides, a moved box is kept, LiDAR has none', () => {
  setManifest(manifest);
  assert.equal(hasManifest(), true);
  const cls = manifest.entries.find((e) => e.provenance === 'reference').class;
  const f = { finding_id: 'F-1', defect_class: cls, sensor: 'rgb', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } };
  const a = evidenceOf(f); const b = evidenceOf({ ...f });
  assert.equal(a.image, b.image);
  assert.equal(a.kind, 'reference');
  assert.deepEqual(a.bbox, a.entry.bbox, 'the manifest box, not the seed box');
  assert.match(a.caption, /^Reference photo · .+, .+, .+ · not from this asset$/);
  // a reviewer corrected the class and moved the box: the picture still belongs to the capture
  const moved = { ...f, defect_class: 'sign_missing', bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, edit: { original: { defect_class: cls, bbox: f.bbox } } };
  const m = evidenceOf(moved);
  assert.equal(m.image, a.image);
  assert.deepEqual(m.bbox, moved.bbox);
  assert.equal(evidenceOf({ ...f, defect_class: 'sag_excessive', sensor: 'lidar' }).kind, 'none');
});

test('a class with no real image is a placeholder, never another defect\'s photo', () => {
  setManifest(manifest);
  const covered = new Set(manifest.entries.filter((e) => e.provenance !== 'placeholder').map((e) => e.class));
  const none = classes.find((c) => !covered.has(c.id));
  assert.ok(none, 'some class is still on placeholder');
  const ev = evidenceOf({ finding_id: 'F-2', defect_class: none.id, sensor: 'rgb', bbox: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 } });
  assert.equal(ev.kind, 'placeholder');
  assert.equal(ev.image, null);
  assert.deepEqual(ev.bbox, { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'the finding keeps its own box');
  assert.match(ev.caption, new RegExp(`^${PLACEHOLDER_TEXT}`));
});

test('credits: one row per real image; the placeholder classes are the ones without any', () => {
  setManifest(manifest);
  const c = creditsOf(classes.map((x) => ({ id: x.id, label: x.label })));
  assert.equal(c.images.length, manifest.entries.filter((e) => e.provenance !== 'placeholder' && e.class !== 'healthy_example').length);
  const lidarOnly = ['structure_encroachment', 'sag_excessive'];
  assert.equal(c.coverage.length, classes.length - lidarOnly.length, 'LiDAR-only classes have no photograph and no entry');
  assert.ok(lidarOnly.every((id) => !manifest.entries.some((e) => e.class === id)));
  assert.ok(c.placeholders.every((p) => !c.images.some((i) => i.class === p.id)));
  assert.equal(captionOf(null), '');
});

test('own inspection images: caption, no second box, native size, vegetation carries a photo for LiDAR findings, healthy example is not a defect', async () => {
  const { healthyExample } = await import('../app/evidence.js');
  setManifest(manifest);
  const veg = evidenceOf({ finding_id: 'F-9', defect_class: 'vegetation_encroachment', sensor: 'lidar', bbox: null });
  assert.equal(veg.kind, 'inspection');
  assert.equal(veg.caption, 'Inspection image');
  assert.equal(veg.bbox, null);
  assert.deepEqual(veg.native, { w: veg.entry.width, h: veg.entry.height });
  const strand = evidenceOf({ finding_id: 'F-8', defect_class: 'broken_strand', sensor: 'rgb', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
  assert.equal(strand.kind, 'inspection');
  assert.equal(strand.bbox, null, 'the burned-in box is not drawn again, and the seed box is not used');
  assert.equal(evidenceOf({ finding_id: 'F-7', defect_class: 'structure_encroachment', sensor: 'lidar' }).kind, 'none', 'other LiDAR classes still have no picture');
  const hx = healthyExample();
  assert.equal(hx.caption, 'Healthy example · Inspection image');
  assert.ok(!classes.some((c) => c.id === 'healthy_example'));
});
