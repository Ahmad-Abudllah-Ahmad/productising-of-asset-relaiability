// Read-only data access for the Reliability screens.
// Every method is async and returns plain data, so swapping the seed for an API later
// changes this file only. Records are deep-frozen: callers cannot mutate shared data.
// (Phase 3 adds write methods for link confirmation behind the same interface.)

import { generateSeed } from './seed.js';

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}

const asList = (v) => (v === undefined || v === null ? null : Array.isArray(v) ? v : [v]);

/**
 * @param {ReturnType<typeof generateSeed>} data
 */
export function createRepository(data) {
  const all = deepFreeze(data);
  const { assets, links, labels, campaigns, captures, findings, workOrders, repairs, dga, groundTruth } = all;
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));
  const findingById = new Map(findings.map((f) => [f.finding_id, f]));
  const captureById = new Map(captures.map((c) => [c.capture_id, c]));
  const childrenOf = new Map();
  for (const a of assets) {
    if (a.parent_id) (childrenOf.get(a.parent_id) ?? childrenOf.set(a.parent_id, []).get(a.parent_id)).push(a);
  }

  return {
    /**
     * @param {{category?:string|string[], class?:string|string[], parent_id?:string|null, label?:string|string[],
     *   voltage_kv?:number|number[], ids?:string[], q?:string}} [filter]  label arrays must ALL match
     * @returns {Promise<import('../domain/types.js').Asset[]>}
     */
    async getAssets(filter = {}) {
      const cats = asList(filter.category);
      const classes = asList(filter.class);
      const need = asList(filter.label);
      const volts = asList(filter.voltage_kv);
      const ids = filter.ids ? new Set(filter.ids) : null;
      const q = filter.q ? filter.q.toLowerCase() : null;
      return assets.filter((a) =>
        (!cats || cats.includes(a.category)) &&
        (!classes || classes.includes(a.class)) &&
        (filter.parent_id === undefined || a.parent_id === filter.parent_id) &&
        (!need || need.every((l) => a.labels.includes(l))) &&
        (!volts || volts.includes(a.voltage_kv)) &&
        (!ids || ids.has(a.asset_id)) &&
        (!q || a.name.toLowerCase().includes(q) || a.asset_id.toLowerCase().includes(q)));
    },

    /** @returns {Promise<import('../domain/types.js').Asset|null>} */
    async getAsset(id) { return assetById.get(id) ?? null; },

    /** Direct children of an asset (by parent_id). */
    async getChildren(id) { return childrenOf.get(id) ?? []; },

    /** Walk parent_id upwards; nearest parent first. */
    async getAncestors(id) {
      const out = [];
      let cur = assetById.get(id);
      while (cur && cur.parent_id) {
        cur = assetById.get(cur.parent_id);
        if (cur) out.push(cur);
      }
      return out;
    },

    /**
     * @param {{asset_id?:string, type?:string|string[], status?:string|string[], source?:string|string[]}} [filter]
     *   asset_id matches either end of the link.
     * @returns {Promise<import('../domain/types.js').Link[]>}
     */
    async getLinks(filter = {}) {
      const types = asList(filter.type);
      const statuses = asList(filter.status);
      const sources = asList(filter.source);
      return links.filter((l) =>
        (!filter.asset_id || l.from_asset === filter.asset_id || l.to_asset === filter.asset_id) &&
        (!types || types.includes(l.type)) &&
        (!statuses || statuses.includes(l.status)) &&
        (!sources || sources.includes(l.source)));
    },

    /** @returns {Promise<import('../domain/types.js').Label[]>} */
    async getLabels(kind) { return kind ? labels.filter((l) => l.kind === kind) : labels; },

    /** @returns {Promise<import('../domain/types.js').Campaign[]>} */
    async getCampaigns() { return campaigns; },

    /** @returns {Promise<import('../domain/types.js').Capture[]>} */
    async getCaptures(filter = {}) {
      return captures.filter((c) => (!filter.campaign_id || c.campaign_id === filter.campaign_id));
    },
    async getCapture(id) { return captureById.get(id) ?? null; },

    /**
     * @param {{campaign_id?:string|string[], asset_id?:string|string[], tower_id?:string, defect_class?:string|string[],
     *   group?:string|string[], review_status?:string|string[], max_condition_score?:number}} [filter]
     * @returns {Promise<import('../domain/types.js').Finding[]>}
     */
    async getFindings(filter = {}) {
      const camp = asList(filter.campaign_id);
      const asset = asList(filter.asset_id);
      const cls = asList(filter.defect_class);
      const grp = asList(filter.group);
      const rs = asList(filter.review_status);
      return findings.filter((f) =>
        (!camp || camp.includes(f.campaign_id)) &&
        (!asset || asset.includes(f.asset_id)) &&
        (!filter.tower_id || f.tower_id === filter.tower_id) &&
        (!cls || cls.includes(f.defect_class)) &&
        (!grp || grp.includes(f.group)) &&
        (!rs || rs.includes(f.review_status)) &&
        (filter.max_condition_score === undefined || f.condition_score <= filter.max_condition_score));
    },
    async getFinding(id) { return findingById.get(id) ?? null; },

    /** DGA history for one transformer, oldest first. */
    async getDgaSamples(transformerId) {
      return dga.filter((s) => s.asset_id === transformerId).sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * @param {{asset_id?:string, status?:string|string[], finding_id?:string}} [filter]
     * @returns {Promise<import('../domain/types.js').WorkOrder[]>}
     */
    async getWorkOrders(filter = {}) {
      const st = asList(filter.status);
      return workOrders.filter((w) =>
        (!filter.asset_id || w.asset_id === filter.asset_id) &&
        (!st || st.includes(w.status)) &&
        (!filter.finding_id || w.finding_ids.includes(filter.finding_id)));
    },

    /** @returns {Promise<import('../domain/types.js').Repair[]>} */
    async getRepairs(filter = {}) {
      return repairs.filter((r) =>
        (!filter.asset_id || r.asset_id === filter.asset_id) &&
        (!filter.work_order_id || r.work_order_id === filter.work_order_id));
    },

    /** Whole data set for building a scoring context: createContext(await repo.getAll()). */
    async getAll() { return all; },

    /** Seed answer key. Tests and the resemblance stub only; the real API will not have it. */
    async getGroundTruth() { return groundTruth; },
  };
}

/** Default repository over the fixed-seed demo data. */
export const repository = createRepository(generateSeed());
