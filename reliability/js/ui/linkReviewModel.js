// Pure model for the Link Review screen: what to list, how to describe each side, and what a person may do.
// No DOM in here, so it is unit-tested in Node.

import { CONFIG } from '../domain/config.js';

/** Links worth a person's attention: from the matcher or from rules. Asset-master imports (manual) are not reviewed here. */
export const REVIEW_SOURCES = Object.freeze(['resemblance', 'rule']);

export const STATUS_OPTIONS = Object.freeze([['proposed', 'Awaiting review'], ['confirmed', 'Accepted'], ['rejected', 'Rejected'], ['all', 'All']]);

export const TYPE_LABELS = Object.freeze({
  same_asset: 'Same asset', spatial: 'Spatial', electrical: 'Electrical', evidence: 'Evidence', same_model: 'Same model', hierarchy: 'Hierarchy',
});

/** Links for the queue, highest score first. */
export async function loadItems(repo, { status = 'proposed', type = 'all', keep = () => true } = {}) {
  const links = await repo.getLinks({ status: status === 'all' ? undefined : status, type: type === 'all' ? undefined : type });
  return links.filter((l) => REVIEW_SOURCES.includes(l.source) && keep(l)).sort((a, b) => b.confidence - a.confidence || a.link_id.localeCompare(b.link_id));
}

/** Counts for the filters: per status (ignoring the type filter) and per type (ignoring the status filter). */
export async function loadCounts(repo, keep = () => true) {
  const links = (await repo.getLinks()).filter((l) => REVIEW_SOURCES.includes(l.source) && keep(l));
  const byStatus = { proposed: 0, confirmed: 0, rejected: 0, all: links.length };
  const byType = { all: links.length };
  for (const l of links) { byStatus[l.status] = (byStatus[l.status] ?? 0) + 1; byType[l.type] = (byType[l.type] ?? 0) + 1; }
  return { byStatus, byType };
}

/** Resolve one end of a link to its record (an asset, or a finding with its capture image). */
export async function resolveEnd(repo, id, kind) {
  if (kind === 'finding') {
    const finding = await repo.getFinding(id);
    const capture = finding ? await repo.getCapture(finding.capture_id) : null;
    return { kind: 'finding', id, record: finding, capture };
  }
  return { kind: 'asset', id, record: await repo.getAsset(id), capture: null };
}

const dash = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
const point = (p) => (p && p.lat !== undefined ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : p?.type === 'line' ? `line, ${p.coordinates.length} points` : '-');
const ids = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '-';

/** Rows describing one record: [label, value]. */
export function describe(end) {
  const r = end.record;
  if (!r) return [['Record', `${end.id} (not found)`]];
  if (end.kind === 'finding') {
    return [
      ['Finding', r.finding_id], ['Campaign', r.campaign_id], ['Date', r.date], ['Defect class', r.defect_class], ['Group', r.group],
      ['Recorded on', r.asset_id], ['Tower', dash(r.tower_id)], ['Component hint', dash(r.component_hint)], ['Sensor', r.sensor],
      ['Condition (1-5)', r.condition_score], ['Confidence', r.confidence], ['Review status', r.review_status], ['Location', point(r.location)],
    ];
  }
  const rows = [
    ['Asset', r.asset_id], ['Name', r.name], ['Class', r.class], ['Category', r.category], ['Parent', dash(r.parent_id)], ['Voltage (kV)', dash(r.voltage_kv)],
    ['Install date', dash(r.install_date)], ['Criticality', r.criticality], ['External IDs', ids(r.external_ids)], ['Location', point(r.location)],
  ];
  for (const k of ['serial', 'manufacturer', 'model', 'phase', 'position', 'tower_type', 'height_m', 'rating_mva', 'design_family']) if (r.ext && k in r.ext) rows.push([k.replace(/_/g, ' '), dash(r.ext[k])]);
  rows.push(['Labels', r.labels.filter((l) => !l.startsWith('failure_mode:')).join(', ') || '-']);
  return rows;
}

/** Two records side by side: [{label, a, b, same}] aligned on label. */
export function sideBySide(endA, endB) {
  const ra = describe(endA);
  const rb = describe(endB);
  const labels = [...new Set([...ra.map((x) => x[0]), ...rb.map((x) => x[0])])];
  const get = (rows, l) => rows.find((x) => x[0] === l)?.[1] ?? '-';
  return labels.map((label) => ({ label, a: get(ra, label), b: get(rb, label), same: String(get(ra, label)) === String(get(rb, label)) }));
}

/** The reasons table. Resemblance links carry their own; rule links get one line saying which rule held. */
export function reasonsOf(link) {
  if (link.reasons?.length) return { reasons: link.reasons, notes: link.notes ?? [] };
  const text = {
    nearest_tower: 'Rule: the finding GPS is within the configured distance of this tower',
    nearest_span: 'Rule: no tower in range; the finding GPS is within the configured distance of this span',
    ends_near: 'Rule: the end tower of the line is within the configured distance of the substation',
    terminates_at: 'Rule: the line lists this substation as an end substation',
  }[link.relation] ?? `Rule: ${link.relation ?? link.type}`;
  return { reasons: [{ signal: 'rule', value: link.confidence, weight: 1, contribution: link.confidence, detail: text }], notes: [] };
}

/** May this link be used to merge two asset records, and if not, why not? */
export function mergeCheck(link, endA, endB) {
  if (link.relation !== 'duplicate_of') return { ok: false, reason: 'Only duplicate-record links can merge assets' };
  if (link.merged) return { ok: false, reason: 'Already merged' };
  if (!endA.record || !endB.record) return { ok: false, reason: 'A record is missing' };
  if (endA.record.merged_into || endB.record.merged_into) return { ok: false, reason: 'One record is already merged' };
  if (endA.record.class !== endB.record.class) return { ok: false, reason: 'Different classes' };
  return { ok: true, reason: `Merge ${link.from_asset} into ${link.to_asset}` };
}

/** Score band label and the marks to draw on the score bar. */
export function scoreBand(score, config = CONFIG) {
  const { autoLinkAtOrAbove: auto, dropBelow: drop } = config.linking;
  return score >= auto ? 'auto-link' : score >= drop ? 'review' : 'dropped';
}
export const thresholds = (config = CONFIG) => ({ auto: config.linking.autoLinkAtOrAbove, drop: config.linking.dropBelow });
