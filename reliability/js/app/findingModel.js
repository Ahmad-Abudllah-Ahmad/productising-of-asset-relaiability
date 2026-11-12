// Finding viewer: everything the modal shows about one finding, gathered into one plain object.
// No DOM here. findingViewer.js draws it; the tests read it directly.
//
// Scores are as of the snapshot's date. The finding, its class, severity, box and asset are the EFFECTIVE values:
// what a reviewer has confirmed, corrected, rejected or relinked is already applied. The AI's original proposal
// stays available as `original` so the viewer can show what changed.

import { DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { suggestAssets } from '../domain/linking/suggest.js';
import { SEVERITY } from './assetModel.js';

export const DEFECT_OPTIONS = Object.freeze([...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => ({ id: d.id, label: d.label, group: d.group })));
const LABEL = Object.fromEntries(DEFECT_OPTIONS.map((d) => [d.id, d.label]));
const humanize = (s) => String(s).replace(/_/g, ' ');

function view(snap, f, capturesById, { current = false } = {}) {
  const cap = capturesById.get(f.capture_id);
  const campaign = snap.campaigns.find((c) => c.campaign_id === f.campaign_id);
  const asset = snap.byId.get(f.asset_id);
  return {
    id: f.finding_id, defectClass: f.defect_class, label: LABEL[f.defect_class] ?? humanize(f.defect_class), group: f.group,
    condition: f.condition_score, severity: SEVERITY[f.condition_score].word, conditionLabel: SEVERITY[f.condition_score].condition,
    confidence: f.confidence, reviewStatus: f.review_status, unreviewed: f.review_status === 'pending', rejected: f.review_status === 'rejected',
    sensor: f.sensor, date: f.date, campaignId: f.campaign_id, campaignName: campaign?.name ?? f.campaign_id, bbox: f.bbox,
    captureId: f.capture_id, image: cap?.image ?? null, captureType: cap?.type ?? f.sensor, location: f.location,
    assetId: f.asset_id, assetName: asset?.name ?? f.asset_id, assetClass: asset ? humanize(asset.class) : '', towerId: f.tower_id, componentHint: f.component_hint,
    edit: f.edit ?? null, current,
  };
}

/**
 * @param {ReturnType<typeof import('../data/repository.js').createRepository>} repo
 * @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap
 * @param {string} id
 */
export async function loadFindingDetail(repo, snap, id) {
  const f = await repo.getFinding(id);
  if (!f) return { found: false, id };
  const { ctx, asOf } = snap;
  const captures = new Map((await repo.getCaptures()).map((c) => [c.capture_id, c]));
  const finding = view(snap, f, captures, { current: true });

  // ---- the AI's original proposal, when a reviewer has changed anything
  let original = null;
  if (f.edit) {
    const o = f.edit.original;
    original = {
      defectClass: o.defect_class, label: LABEL[o.defect_class] ?? humanize(o.defect_class), condition: o.condition_score, severity: SEVERITY[o.condition_score].word,
      conditionLabel: SEVERITY[o.condition_score].condition, bbox: o.bbox, assetId: o.asset_id, assetName: snap.byId.get(o.asset_id)?.name ?? o.asset_id, reviewStatus: o.review_status,
      changed: {
        defectClass: o.defect_class !== f.defect_class, condition: o.condition_score !== f.condition_score, asset: o.asset_id !== f.asset_id,
        bbox: JSON.stringify(o.bbox) !== JSON.stringify(f.bbox), reviewStatus: o.review_status !== f.review_status,
      },
    };
  }

  // ---- the asset it is recorded on, and the tower, span or transformer that owns it
  const ownerId = ctx.ownerOf(f.asset_id);
  const ownerAsset = ownerId ? snap.byId.get(ownerId) : null;
  const ownerScore = ownerId ? (snap.scores.get(ownerId)?.hi ?? healthIndex(ctx, ownerId, asOf)) : null;
  const owner = ownerAsset ? { id: ownerId, name: ownerAsset.name, class: humanize(ownerAsset.class), hi: ownerScore.score, band: ownerScore.band } : null;

  // ---- the other findings on the same owner, for the arrow keys
  const siblingRows = (ownerId ? ctx.findingsFor(ownerId, asOf).evidence : [f]).map((x) => (x.finding_id === id ? f : x));
  if (!siblingRows.some((x) => x.finding_id === id)) siblingRows.push(f);
  const siblings = siblingRows
    .map((x) => view(snap, x, captures, { current: x.finding_id === id }))
    .sort((a, b) => a.condition - b.condition || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const index = siblings.findIndex((x) => x.current);

  // ---- the same defect in other campaigns: confirmed and auto-linked repeat-sighting links
  const sameDefect = (await repo.getLinks({ type: 'same_asset', status: 'confirmed' })).filter((l) => l.relation === 'same_defect' && l.from_kind === 'finding');
  const adjacent = new Map();
  for (const l of sameDefect) {
    (adjacent.get(l.from_asset) ?? adjacent.set(l.from_asset, new Set()).get(l.from_asset)).add(l.to_asset);
    (adjacent.get(l.to_asset) ?? adjacent.set(l.to_asset, new Set()).get(l.to_asset)).add(l.from_asset);
  }
  const chain = new Set([id]);
  const stack = [id];
  while (stack.length) for (const n of adjacent.get(stack.pop()) ?? []) if (!chain.has(n)) { chain.add(n); stack.push(n); }
  const all = new Map((await repo.getFindings()).map((x) => [x.finding_id, x]));
  const repairs = await repo.getRepairs();
  const sightings = [...chain].map((x) => all.get(x)).filter((x) => x && (x.finding_id === id || x.review_status !== 'rejected'))
    .map((x) => {
      const closedBy = repairs.find((r) => r.closes_finding_ids.includes(x.finding_id) && r.date <= asOf) ?? null;
      return { ...view(snap, x, captures, { current: x.finding_id === id }), closedBy: closedBy ? { id: closedBy.repair_id, date: closedBy.date, action: closedBy.action } : null };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const between = [];
  for (let i = 0; i + 1 < sightings.length; i += 1) {
    const a = sightings[i];
    const b = sightings[i + 1];
    const aOwner = ctx.ownerOf(a.assetId);
    const items = repairs.filter((r) => r.date > a.date && r.date <= b.date && (r.closes_finding_ids.includes(a.id) || ctx.ownerOf(r.asset_id) === aOwner))
      .map((r) => ({ id: r.repair_id, date: r.date, action: r.action, workOrderId: r.work_order_id, assetName: snap.byId.get(r.asset_id)?.name ?? r.asset_id, closesThis: r.closes_finding_ids.includes(a.id), closes: r.closes_finding_ids.length }));
    between.push({ from: a.id, to: b.id, items });
  }

  return {
    found: true, id, asOf, finding, original, owner, siblings, index,
    compare: { sightings, between },
    history: (await repo.getAuditLog()).filter((e) => e.finding_id === id).reverse(),
    suggestions: suggestAssets(f, snap.allAssets, { exclude: new Set(snap.dupRecord.keys()) }),
    classes: DEFECT_OPTIONS,
    imageKind: finding.image ? 'photo' : 'placeholder',
  };
}
