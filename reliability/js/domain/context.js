// Scoring context: indexes over a data set so scoring functions stay pure and fast.
// Build once with createContext(data), then pass it to every scoring function.
// Nothing here reads the clock or the DOM. Every query takes an explicit asOf date.

import { CONFIG } from './config.js';

const OWNER_CLASSES = new Set(['tower', 'span', 'power_transformer']);

/**
 * @param {{assets:import('./types.js').Asset[], findings:import('./types.js').Finding[],
 *   repairs?:import('./types.js').Repair[], campaigns?:import('./types.js').Campaign[],
 *   links?:import('./types.js').Link[], dga?:import('./types.js').DgaSample[]}} data
 * @param {typeof CONFIG} [config]
 */
export function createContext(data, config = CONFIG) {
  const assetById = new Map(data.assets.map((a) => [a.asset_id, a]));
  const isMerged = (a) => Boolean(a && a.merged_into);
  const campaigns = data.campaigns ?? [];

  // children, ignoring merged records
  const childrenOf = new Map();
  for (const a of data.assets) {
    if (a.parent_id && !isMerged(a)) (childrenOf.get(a.parent_id) ?? childrenOf.set(a.parent_id, []).get(a.parent_id)).push(a);
  }

  // The scoring unit a component belongs to: tower, span or transformer.
  const ownerMemo = new Map();
  function ownerOf(id) {
    if (ownerMemo.has(id)) return ownerMemo.get(id);
    let cur = assetById.get(id);
    let owner = null;
    while (cur) {
      if (isMerged(cur)) break;
      if (OWNER_CLASSES.has(cur.class)) { owner = cur.asset_id; break; }
      cur = cur.parent_id ? assetById.get(cur.parent_id) : null;
    }
    ownerMemo.set(id, owner);
    return owner;
  }

  const findingsByOwner = new Map();
  for (const f of data.findings) {
    const owner = ownerOf(f.asset_id);
    if (owner) (findingsByOwner.get(owner) ?? findingsByOwner.set(owner, []).get(owner)).push(f);
  }

  // finding_id -> earliest date a repair closed it
  const closedAt = new Map();
  for (const r of data.repairs ?? []) {
    for (const id of r.closes_finding_ids) {
      if (!closedAt.has(id) || r.date < closedAt.get(id)) closedAt.set(id, r.date);
    }
  }
  // repairs grouped by the scoring unit (tower, span, transformer) that owns the repaired asset
  const repairsByOwner = new Map();
  for (const r of data.repairs ?? []) {
    const owner = ownerOf(r.asset_id) ?? r.asset_id;
    (repairsByOwner.get(owner) ?? repairsByOwner.set(owner, []).get(owner)).push(r);
  }

  // tower -> dates of completed campaigns that flew it
  const coverage = new Map();
  for (const c of campaigns) {
    for (const t of c.inspected_tower_ids) (coverage.get(t) ?? coverage.set(t, []).get(t)).push(c.end);
  }

  // confirmed links between assets that are not merged, as undirected adjacency per link type
  const neighbours = new Map();
  for (const l of data.links ?? []) {
    if (l.status !== 'confirmed' || isMerged(assetById.get(l.from_asset)) || isMerged(assetById.get(l.to_asset))) continue;
    for (const [a, b] of [[l.from_asset, l.to_asset], [l.to_asset, l.from_asset]]) {
      const key = `${l.type}|${a}`;
      (neighbours.get(key) ?? neighbours.set(key, []).get(key)).push(b);
    }
  }

  const dgaByAsset = new Map();
  for (const s of [...(data.dga ?? [])].sort((x, y) => x.date.localeCompare(y.date))) {
    (dgaByAsset.get(s.asset_id) ?? dgaByAsset.set(s.asset_id, []).get(s.asset_id)).push(s);
  }

  return {
    config,
    memo: new Map(),
    asset: (id) => assetById.get(id) ?? null,
    isMerged: (id) => isMerged(assetById.get(id)),
    children: (id) => childrenOf.get(id) ?? [],
    ownerOf,
    repairsFor: (ownerId) => repairsByOwner.get(ownerId) ?? [],
    dgaSamples: (id) => dgaByAsset.get(id) ?? [],
    neighbours: (type, id) => neighbours.get(`${type}|${id}`) ?? [],

    /** Dates of completed campaigns (end <= asOf) that flew this tower. */
    coverageDates(towerId, asOf) {
      return (coverage.get(towerId) ?? []).filter((d) => d <= asOf);
    },

    /**
     * Sort the findings of one owner into what counts at asOf.
     *  - evidence:  every finding dated <= asOf, any status (proves the asset was looked at)
     *  - counted:   feeds the score (confirmed, or unreviewed when the setting is on)
     *  - unreviewed: the counted findings that are not confirmed (flagged in breakdowns)
     *  - closed:    closed by a repair dated <= asOf
     *  - rejected / excluded: never counted
     */
    findingsFor(ownerId, asOf) {
      const out = { evidence: [], counted: [], unreviewed: [], closed: [], rejected: [], excluded: [] };
      for (const f of findingsByOwner.get(ownerId) ?? []) {
        if (f.date > asOf) continue;
        out.evidence.push(f);
        if (f.review_status === 'rejected') { out.rejected.push(f); continue; }
        const closed = closedAt.get(f.finding_id);
        if (closed && closed <= asOf) { out.closed.push(f); continue; }
        if (f.review_status === 'confirmed') out.counted.push(f);
        else if (config.scoring.countUnreviewedFindings) { out.counted.push(f); out.unreviewed.push(f); }
        else out.excluded.push(f);
      }
      return out;
    },
  };
}
