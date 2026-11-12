// What picture goes with a finding. The only source is reliability/assets/inspection/manifest.json, so a real inspection image
// replaces a reference photo by editing one manifest entry (see assets/inspection/README.md).
//
// Every image in the manifest is one of two kinds:
//   reference    a real photograph of this kind of defect from somewhere else (licence and author in the entry). It is NOT a
//                picture of the asset the finding is recorded on, and every screen says so.
//   placeholder  no real image has been found for the class yet; the screens say "Placeholder – no real image yet".
//
// The box (bbox, fractions of the image) is the dataset's own where the source has one ("dataset"), else drawn by hand ("drawn").
// A placeholder has no picture, so it keeps the finding's own box (the AI's proposal) so the box can still be reviewed and edited.
// A finding with several candidate images always gets the same one (a hash of its id). The image belongs to the capture, so it
// follows the class the AI proposed, not a class a reviewer later corrected. A box a reviewer has moved is kept.

export const MANIFEST_URL = '/reliability/assets/inspection/manifest.json';
export const HEALTHY_CLASS = 'healthy_example';
export const DEMO_CAPTION = 'Demo image · a generic site photo, not a picture of this defect';
export const PLACEHOLDER_TEXT = 'Placeholder – no real image yet';

let manifest = null;
let byClass = new Map();

/** Install a parsed manifest (tests pass the file's contents; the page fetches it at boot). */
export function setManifest(m) {
  manifest = m;
  byClass = new Map();
  for (const e of m?.entries ?? []) {
    if (!byClass.has(e.class)) byClass.set(e.class, []);
    byClass.get(e.class).push(e);
  }
  for (const list of byClass.values()) list.sort((a, b) => a.id.localeCompare(b.id));
}
export const hasManifest = () => manifest !== null;

export async function loadManifest(url = MANIFEST_URL) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    setManifest(await res.json());
  } catch (e) {
    setManifest({ entries: [], error: String(e.message ?? e) });
  }
  return manifest;
}

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const same = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs((a?.[k] ?? 0) - (b?.[k] ?? 0)) < 0.0005);

/** The credit line for an entry. */
export function captionOf(entry) {
  if (!entry) return '';
  if (entry.provenance === 'own-inspection') return entry.class === HEALTHY_CLASS ? 'Healthy example · Inspection image' : 'Inspection image';
  if (entry.provenance === 'placeholder') return `${PLACEHOLDER_TEXT} · not from this asset`;
  return `Reference photo · ${entry.author}, ${entry.source}, ${entry.licence} · not from this asset`;
}

/** The manifest entries for a class (real photos first, a placeholder when there are none). */
export const entriesFor = (cls) => byClass.get(cls) ?? [];

/**
 * @param {object} f a finding (effective values; f.edit.original has what the AI proposed)
 * @param {{image?: string|null}|null} [cap] the capture record (used only when no manifest is loaded, i.e. in unit tests)
 * @returns {{image: string|null, bbox: object|null, kind: 'reference'|'placeholder'|'none'|'legacy', entry: object|null, caption: string, short: string}}
 */
export function evidenceOf(f, cap = null) {
  if (!manifest) return { image: cap?.image ?? null, bbox: f.bbox ?? null, kind: 'legacy', entry: null, caption: 'Demo image', short: 'Demo' };
  const cls = f.edit?.original?.defect_class ?? f.defect_class;
  const list = byClass.get(cls) ?? [];
  // LiDAR findings have no picture unless the class has a photo (vegetation does: the photo shows it, the scan measures it)
  if (f.sensor === 'lidar' && !list.length) return { image: null, bbox: null, kind: 'none', entry: null, caption: '', short: '' };
  const entry = list.length ? list[hash(f.finding_id) % list.length] : null;
  // no real photo for this class: show the generic demo image the seed gave the capture (not a picture of this defect) and say so
  if ((!entry || entry.provenance === 'placeholder') && cap?.image) return { image: cap.image, bbox: f.bbox ?? null, kind: 'demo', entry: null, caption: DEMO_CAPTION, short: 'Demo' };
  if (!entry) return { image: null, bbox: f.bbox ?? null, kind: 'placeholder', entry: null, caption: `${PLACEHOLDER_TEXT} · not from this asset`, short: 'Placeholder' };
  const moved = f.edit?.original?.bbox && f.bbox && !same(f.edit.original.bbox, f.bbox);
  const own = entry.provenance === 'own-inspection';
  const burned = entry.bboxSource === 'burned-in';
  return {
    image: entry.file ? `${manifest.base ?? '/reliability/assets/inspection/'}${entry.file}` : null,
    // a burned-in box is part of the picture: no second box is drawn over it
    bbox: burned ? null : moved ? f.bbox : (entry.provenance === 'placeholder' ? (f.bbox ?? null) : (entry.bbox ?? f.bbox ?? null)),
    kind: own ? 'inspection' : entry.provenance === 'placeholder' ? 'placeholder' : 'reference',
    entry, native: entry.native ? { w: entry.width, h: entry.height } : null,
    caption: captionOf(entry), short: own ? 'Insp' : entry.provenance === 'placeholder' ? 'Placeholder' : 'Ref',
  };
}

/** A normal-condition tower picture to show next to a tower with no findings, or null. */
export function healthyExample() {
  const e = (byClass.get(HEALTHY_CLASS) ?? [])[0];
  return e ? { entry: e, image: `${manifest.base ?? '/reliability/assets/inspection/'}${e.file}`, caption: captionOf(e), native: { w: e.width, h: e.height } } : null;
}

/** Everything the credits section lists: one row per real image, and the photographic classes that are still placeholders.
 *  Classes found only by LiDAR have no photograph at all and are not in the manifest. */
export function creditsOf(allClasses) {
  const entries = (manifest?.entries ?? []).filter((e) => e.class !== HEALTHY_CLASS);
  const own = entries.filter((e) => e.provenance === 'own-inspection');
  const real = entries.filter((e) => e.provenance === 'reference' || e.provenance === 'own-inspection');
  const inManifest = new Set(entries.map((e) => e.class));
  const photographic = allClasses.filter((c) => inManifest.has(c.id));
  const covered = new Set(real.map((e) => e.class));
  return {
    images: real, own,
    coverage: photographic.map((c) => ({ ...c, real: real.filter((e) => e.class === c.id).length })),
    placeholders: photographic.filter((c) => !covered.has(c.id)),
  };
}
