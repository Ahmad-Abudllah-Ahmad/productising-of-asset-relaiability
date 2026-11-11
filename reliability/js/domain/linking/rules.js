// Rule-based links: spatial and electrical. No scoring, no guessing: a rule either holds or it does not.
// Rules only add links the data does not already have (checked by type, relation and endpoints).
//
//   spatial   finding -> nearest tower within findingToTower, else nearest span within findingToSpan
//   spatial   line -> substation when the line's first or last tower is within lineEndToSubstation
//   electrical line -> substation (terminates_at) for the end substations the line lists in ext.end_substations

import { CONFIG } from '../config.js';
import { distM, pointToSegmentM, createGrid } from './geo.js';

const keyOf = (l) => `${l.type}|${l.relation ?? ''}|${l.from_asset}|${l.to_asset}`;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{assets:import('../types.js').Asset[], findings:import('../types.js').Finding[], links:import('../types.js').Link[]}} data
 * @param {typeof CONFIG} [config]
 * @returns {{links: import('../types.js').Link[], skippedExisting: number, counts: Object<string,number>}}
 */
export function buildRuleLinks(data, config = CONFIG) {
  const cfg = config.linking;
  const existing = new Set(data.links.map(keyOf));
  const created = `${config.seed.referenceDate}T00:00:00Z`;
  const live = data.assets.filter((a) => !a.merged_into);
  const byId = new Map(live.map((a) => [a.asset_id, a]));
  const out = [];
  let skipped = 0;
  const counts = { spatial_finding: 0, spatial_line_end: 0, electrical_line_end: 0 };

  const add = (kind, link) => {
    const full = { source: 'rule', status: 'confirmed', created_at: created, ...link };
    if (existing.has(keyOf(full))) { skipped += 1; return; }
    existing.add(keyOf(full));
    out.push(full);
    counts[kind] += 1;
  };

  // ---- spatial: finding -> nearest tower / span
  const cell = Math.max(cfg.spatialMaxMeters.findingToTower, cfg.spatialMaxMeters.findingToSpan) * 2;
  const towerGrid = createGrid(cell);
  const spanGrid = createGrid(cell);
  const pointOf = (a) => (a.location && a.location.type === 'point' ? a.location : null);
  for (const t of live.filter((a) => a.class === 'tower')) if (pointOf(t)) towerGrid.insert(t, pointOf(t));
  const segmentOf = (s) => {
    const a = byId.get(s.ext.from_tower);
    const b = byId.get(s.ext.to_tower);
    return a && b && pointOf(a) && pointOf(b) ? [pointOf(a), pointOf(b)] : null;
  };
  for (const s of live.filter((a) => a.class === 'span')) {
    const seg = segmentOf(s);
    if (seg) spanGrid.insertBox(s, seg[0], seg[1]);
  }
  for (const f of [...data.findings].sort((a, b) => a.finding_id.localeCompare(b.finding_id))) {
    let best = null;
    for (const t of towerGrid.near(f.location)) {
      const d = distM(f.location, pointOf(t));
      if (d <= cfg.spatialMaxMeters.findingToTower && (!best || d < best.d)) best = { asset: t, d, relation: 'nearest_tower', max: cfg.spatialMaxMeters.findingToTower };
    }
    if (!best) {
      for (const s of spanGrid.near(f.location)) {
        const seg = segmentOf(s);
        const d = pointToSegmentM(f.location, seg[0], seg[1]);
        if (d <= cfg.spatialMaxMeters.findingToSpan && (!best || d < best.d)) best = { asset: s, d, relation: 'nearest_span', max: cfg.spatialMaxMeters.findingToSpan };
      }
    }
    if (best) {
      add('spatial_finding', {
        from_asset: f.finding_id, from_kind: 'finding', to_asset: best.asset.asset_id, to_kind: 'asset', type: 'spatial', relation: best.relation,
        confidence: round2(1 - best.d / best.max), confirmed_by: 'rule:spatial',
      });
    }
  }

  // ---- spatial and electrical: line ends and substations
  const substations = live.filter((a) => a.class === 'substation');
  for (const line of live.filter((a) => a.class === 'line')) {
    const towers = live.filter((a) => a.class === 'tower' && a.parent_id === line.asset_id && a.ext?.index !== undefined).sort((a, b) => a.ext.index - b.ext.index);
    const ends = towers.length ? [towers[0], towers[towers.length - 1]] : [];
    for (const sub of substations) {
      const d = Math.min(...ends.filter(pointOf).map((t) => distM(pointOf(t), pointOf(sub))), Infinity);
      if (d <= cfg.spatialMaxMeters.lineEndToSubstation) {
        add('spatial_line_end', {
          from_asset: line.asset_id, from_kind: 'asset', to_asset: sub.asset_id, to_kind: 'asset', type: 'spatial', relation: 'ends_near',
          confidence: round2(1 - d / cfg.spatialMaxMeters.lineEndToSubstation), confirmed_by: 'rule:spatial',
        });
      }
    }
    for (const subId of line.ext?.end_substations ?? []) {
      const sub = byId.get(subId);
      if (!sub || !(sub.ext?.voltage_levels_kv ?? []).includes(line.voltage_kv)) continue;
      add('electrical_line_end', {
        from_asset: line.asset_id, from_kind: 'asset', to_asset: sub.asset_id, to_kind: 'asset', type: 'electrical', relation: 'terminates_at',
        confidence: 1, confirmed_by: 'rule:topology',
      });
    }
  }

  // electrical: line -> its line bay. The seed already has these, so they are skipped; the rule stays
  // so that a data set that lacks them gets them.
  for (const bay of live.filter((a) => a.class === 'bay' && a.ext?.role === 'line' && a.ext.line_id && byId.has(a.ext.line_id))) {
    add('electrical_line_end', {
      from_asset: bay.ext.line_id, from_kind: 'asset', to_asset: bay.asset_id, to_kind: 'asset', type: 'electrical', relation: 'terminates_at',
      confidence: 1, confirmed_by: 'rule:topology',
    });
  }

  out.forEach((l, i) => { l.link_id = `LNK-R-${String(i + 1).padStart(5, '0')}`; });
  return { links: out, skippedExisting: skipped, counts };
}
