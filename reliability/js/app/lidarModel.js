// LiDAR view model: which spans an asset or finding shows, and everything the LiDAR tab draws for one span. No DOM.
// The clearance on every screen is the seed's span clearance (ext.min_clearance_m); the simulated cloud is built to measure exactly that.

import { getCloud } from './lidarSource.js';

export const LABEL_SIMULATED = 'Simulated LiDAR';
export const CLASS_COLORS = Object.freeze({ 1: '#a98f63', 2: '#38a35c', 3: '#8795ab', 4: '#2f7de1' });
export const CLEARANCE_COLORS = Object.freeze({ red: '#e5484d', amber: '#f0a020', green: '#3cb371', neutral: '#8a94a6' });

/** Spans a tower, a span or a finding's owner can show: the span itself, or the spans either side of a tower. */
export function lidarSpansFor(snap, assetId) {
  const a = snap.byId.get(assetId);
  if (!a) return [];
  if (a.class === 'span') return [a];
  if (a.class === 'tower') {
    return [...snap.allAssets].filter((s) => s.class === 'span' && (s.ext?.from_tower === assetId || s.ext?.to_tower === assetId))
      .sort((p, q) => (p.ext.min_clearance_m ?? 99) - (q.ext.min_clearance_m ?? 99) || p.asset_id.localeCompare(q.asset_id));
  }
  return [];
}

/** True when the asset (or its owner, for a finding) has a LiDAR tab. */
export const hasLidar = (snap, assetId) => lidarSpansFor(snap, assetId).length > 0;

/** The owner (tower or span) of a finding's asset, or null. */
export const ownerOfFinding = (snap, f) => snap.ctx.ownerOf(f.asset_id) ?? f.asset_id;

/** @returns {object|null} everything the LiDAR tab shows for one span */
export function loadLidarSpan(snap, spanId) {
  const span = snap.byId.get(spanId);
  if (!span || span.class !== 'span') return null;
  const from = snap.byId.get(span.ext.from_tower); const to = snap.byId.get(span.ext.to_tower);
  const towerHeightM = Math.min(from?.ext?.height_m ?? 30, to?.ext?.height_m ?? 30);
  const vegetationFinding = (snap.findingsByOwner.get(spanId) ?? []).some((f) => f.defect_class === 'vegetation_encroachment');
  const r = getCloud({ spanId, kv: span.voltage_kv, lengthM: span.ext.length_m, towerHeightM, clearanceM: span.ext.min_clearance_m, vegetationFinding });
  const line = snap.byId.get(span.parent_id);
  const rows = r.profile.filter((_, i) => i % 4 === 0).map((p) => ({ x: p.x, ground: p.ground, vegetation: p.vegetation, conductor: p.conductor, limit: p.limit, clearance: p.clearance }));
  return {
    id: spanId, name: span.name, lineName: line?.name ?? span.parent_id, kv: span.voltage_kv, lengthM: span.ext.length_m,
    from: from?.name ?? span.ext.from_tower, to: to?.name ?? span.ext.to_tower,
    label: r.source === 'simulated' ? LABEL_SIMULATED : 'LiDAR scan', source: r.source,
    clearanceM: r.stats.minClearanceM, seedClearanceM: span.ext.min_clearance_m, limitM: r.limitM, violation: r.stats.violation,
    lowest: r.stats.lowest, redPoints: r.stats.redPoints, points: r.stats.points, byClass: r.stats.byClass,
    towerHeightM, cloud: r.cloud, geometry: r.geometry, profile: r.profile, rows, vegetationFinding,
  };
}
