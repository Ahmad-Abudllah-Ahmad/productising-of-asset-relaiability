// Data access for the Reliability screens.
//
// Every method is async and returns plain, frozen data, so swapping the seed for an API later changes
// this file only. Reads come from a "view": the seed, plus the links the rules and the resemblance matcher
// derived from it, plus the user's decisions.
//
// Decisions (confirm, reject, merge) live in an overlay. The overlay is kept in memory and mirrored to
// browser storage (localStorage) when it is available, so a reload keeps the demo state. resetDemoData()
// clears both. Reviewer actions on findings (confirm, reject, correct, relink, revert) live in the same overlay.
// A finding's effective review status, class, condition, box and asset come from the overlay; scores recompute
// from getContext(). Rejected findings are left out of scores. Merging sets merged_into on the duplicate record and moves its evidence to the survivor,
// and scores are recomputed from the new view (getContext()).

import { generateSeed } from './seed.js';
import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { createContext } from '../domain/context.js';
import { buildRuleLinks } from '../domain/linking/rules.js';
import { generateResemblanceLinks } from '../domain/linking/candidates.js';

export const STORAGE_KEY = 'nexus.reliability.demo.v1';

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}

const withoutKey = ({ groundTruth, ...rest }) => rest;
const asList = (v) => (v === undefined || v === null ? null : Array.isArray(v) ? v : [v]);
const freshOverlay = () => ({ version: 1, seq: 0, decisions: {}, merges: [], audit: [], findingEdits: {} });

const DEFECT_GROUP = new Map([...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => [d.id, d.group]));
const validBox = (b) => b && ['x', 'y', 'w', 'h'].every((k) => typeof b[k] === 'number' && Number.isFinite(b[k]))
  && b.x >= 0 && b.y >= 0 && b.w > 0.005 && b.h > 0.005 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001;
const round3 = (n) => Math.round(n * 1000) / 1000;
const EDIT_KEYS = ['review_status', 'defect_class', 'condition_score', 'bbox', 'asset_id', 'tower_id', 'reason', 'by', 'at', 'corrected', 'relinked', 'original'];

function browserStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.setItem('__nexus_probe', '1');
    ls.removeItem('__nexus_probe');
    return ls;
  } catch { return null; }
}

/**
 * @param {ReturnType<typeof generateSeed>} data
 * @param {{storage?: {getItem:Function,setItem:Function,removeItem:Function}|null, clock?: () => string, config?: typeof CONFIG}} [options]
 *   storage: where to mirror the overlay (default: localStorage if usable, else memory only; null = memory only)
 *   clock: returns an ISO timestamp for audit entries (default: the real clock)
 */
export function createRepository(data, options = {}) {
  const config = options.config ?? CONFIG;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const clock = options.clock ?? (() => new Date().toISOString());
  const base = deepFreeze(data);

  // ---- derived links: rules and resemblance, computed once from the seed
  const features = (id) => base.visualFeatures?.[id];
  const rules = buildRuleLinks({ assets: base.assets, findings: base.findings, links: base.links }, config);
  const resemblance = generateResemblanceLinks({ assets: base.assets, findings: base.findings, features }, config);
  const allLinks = deepFreeze([...base.links, ...rules.links, ...resemblance.links]);
  const linkIds = new Set(allLinks.map((l) => l.link_id));
  const assetIds = new Set(base.assets.map((a) => a.asset_id));
  const baseAudit = deepFreeze(resemblance.audit);

  // ---- overlay: decisions and merges
  let overlay = loadOverlay();
  const listeners = new Set();
  let revision = 0;
  let view = null;
  let ctx = null;

  function loadOverlay() {
    const o = freshOverlay();
    if (!storage) return o;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return o;
      const saved = JSON.parse(raw);
      if (saved?.version !== 1) return o;
      for (const [id, d] of Object.entries(saved.decisions ?? {})) if (linkIds.has(id) && ['confirmed', 'rejected'].includes(d?.status)) o.decisions[id] = d;
      const gone = new Set();
      for (const m of saved.merges ?? []) {
        if (assetIds.has(m.from) && assetIds.has(m.into) && m.from !== m.into && !gone.has(m.from) && !gone.has(m.into)) { o.merges.push(m); gone.add(m.from); }
      }
      o.audit = Array.isArray(saved.audit) ? saved.audit : [];
      const known = new Set(base.findings.map((f) => f.finding_id));
      for (const [id, e] of Object.entries(saved.findingEdits ?? {})) {
        if (!known.has(id) || !e || typeof e !== 'object' || !e.original) continue;
        if (e.review_status && !['confirmed', 'rejected', 'pending'].includes(e.review_status)) continue;
        if (e.defect_class && !DEFECT_GROUP.has(e.defect_class)) continue;
        if (e.condition_score && ![1, 2, 3, 4].includes(e.condition_score)) continue;
        if (e.bbox && !validBox(e.bbox)) continue;
        if (e.asset_id && !assetIds.has(e.asset_id)) continue;
        o.findingEdits[id] = Object.fromEntries(Object.entries(e).filter(([k]) => EDIT_KEYS.includes(k)));
      }
      o.seq = Number(saved.seq) || o.audit.length;
    } catch { /* a corrupt overlay is ignored: start clean */ }
    return o;
  }

  function persist() {
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(overlay)); } catch { /* storage full or blocked: stay in memory */ }
  }

  function changed() {
    view = null;
    ctx = null;
    revision += 1;
    persist();
    for (const fn of [...listeners]) { try { fn(revision); } catch { /* a bad listener must not break writes */ } }
  }

  function resolver() {
    const into = new Map(overlay.merges.map((m) => [m.from, m.into]));
    const resolve = (id) => { let cur = id; for (let i = 0; i < 10 && into.has(cur); i += 1) cur = into.get(cur); return cur; };
    return { into, resolve };
  }

  function buildView() {
    const { into, resolve } = resolver();
    const assets = base.assets.map((a) => {
      const merged = into.has(a.asset_id) ? resolve(a.asset_id) : null;
      const parent = a.parent_id && into.has(a.parent_id) ? resolve(a.parent_id) : a.parent_id;
      return merged || parent !== a.parent_id ? Object.freeze({ ...a, parent_id: parent, ...(merged ? { merged_into: merged } : {}) }) : a;
    });
    const findings = base.findings.map((f) => {
      const e = overlay.findingEdits[f.finding_id];
      const remap = into.has(f.asset_id) || into.has(f.tower_id);
      if (!e && !remap) return f;
      const g = remap ? { ...f, asset_id: resolve(f.asset_id), tower_id: f.tower_id ? resolve(f.tower_id) : f.tower_id } : { ...f };
      if (e) {
        if (e.review_status) { g.review_status = e.review_status; g.confirmed_by = e.review_status === 'pending' ? null : e.by; }
        if (e.defect_class) { g.defect_class = e.defect_class; g.group = DEFECT_GROUP.get(e.defect_class); }
        if (e.condition_score) g.condition_score = e.condition_score;
        if (e.bbox) g.bbox = e.bbox;
        if (e.asset_id) { g.asset_id = resolve(e.asset_id); g.tower_id = e.tower_id ?? null; g.component_hint = null; }
        g.edit = { corrected: Boolean(e.corrected), relinked: Boolean(e.relinked), rejected_reason: e.reason ?? null, by: e.by, at: e.at, original: e.original };
      }
      return Object.freeze(g);
    });
    const findingStatus = new Map(findings.map((f) => [f.finding_id, f.review_status]));
    const repairs = base.repairs.map((r) => (into.has(r.asset_id) ? Object.freeze({ ...r, asset_id: resolve(r.asset_id) }) : r));
    const workOrders = base.workOrders.map((w) => (into.has(w.asset_id) ? Object.freeze({ ...w, asset_id: resolve(w.asset_id) }) : w));
    const links = allLinks.map((l) => {
      const d = overlay.decisions[l.link_id];
      const obsolete = (l.from_kind === 'asset' && into.has(l.from_asset)) || (l.to_kind === 'asset' && into.has(l.to_asset))
        || (l.from_kind === 'finding' && findingStatus.get(l.from_asset) === 'rejected') || (l.to_kind === 'finding' && findingStatus.get(l.to_asset) === 'rejected');
      const merged = overlay.merges.some((m) => m.link_id === l.link_id);
      if (!d && !(obsolete && l.status === 'proposed')) return l;
      return Object.freeze({
        ...l, ...(d ? { status: d.status, confirmed_by: d.by, decided_at: d.at } : {}),
        ...(obsolete && !merged ? { obsolete: true } : {}), ...(merged ? { merged: true } : {}),
      });
    });
    [assets, findings, repairs, workOrders, links].forEach((arr) => Object.freeze(arr));
    const byId = new Map(assets.map((a) => [a.asset_id, a]));
    const children = new Map();
    for (const a of assets) if (a.parent_id) (children.get(a.parent_id) ?? children.set(a.parent_id, []).get(a.parent_id)).push(a);
    return {
      assets, links, findings, repairs, workOrders, byId, children,
      findingById: new Map(findings.map((f) => [f.finding_id, f])), linkById: new Map(links.map((l) => [l.link_id, l])),
      // the answer key stays out of the data handed to scoring and screens
      all: Object.freeze({ ...withoutKey(base), assets, links, findings, repairs, workOrders }),
    };
  }
  const v = () => (view ??= buildView());

  function audit(entry) {
    overlay.seq += 1;
    overlay.audit.push({ id: `AUD-U-${String(overlay.seq).padStart(4, '0')}`, at: clock(), actor: entry.by ?? 'reviewer', action: entry.action, link_id: entry.link_id ?? null, ...(entry.finding_id ? { finding_id: entry.finding_id } : {}), detail: entry.detail });
  }

  function decide(link_id, status, by) {
    const link = v().linkById.get(link_id);
    if (!link) throw new Error(`Unknown link ${link_id}`);
    if (link.merged) throw new Error(`Link ${link_id} was used to merge assets; reset the demo data to undo it`);
    if (link.status === status) return link;
    overlay.decisions[link_id] = { status, by, at: clock() };
    audit({ by, action: status === 'confirmed' ? 'confirm' : 'reject', link_id, detail: `${status === 'confirmed' ? 'Accepted' : 'Rejected'} ${link.from_asset} / ${link.to_asset} (score ${link.confidence})` });
    changed();
    return v().linkById.get(link_id);
  }

  // ---- reviewer actions on findings
  function baseFinding(id) {
    const f = base.findings.find((x) => x.finding_id === id);
    if (!f) throw new Error(`Unknown finding ${id}`);
    return f;
  }
  function editOf(id) {
    const f = baseFinding(id);
    return (overlay.findingEdits[id] ??= {
      original: { review_status: f.review_status, defect_class: f.defect_class, condition_score: f.condition_score, bbox: f.bbox, asset_id: f.asset_id, tower_id: f.tower_id, component_hint: f.component_hint },
    });
  }
  function towerOf(assetId) {
    let cur = v().byId.get(assetId);
    for (let i = 0; i < 6 && cur; i += 1) {
      if (cur.class === 'tower') return cur.asset_id;
      if (cur.class === 'span') return cur.ext.from_tower;
      cur = cur.parent_id ? v().byId.get(cur.parent_id) : null;
    }
    return null;
  }
  function stamp(e, by) { e.by = by; e.at = clock(); }

  return {
    // ----------------------------------------------------------------- reads

    /**
     * @param {{category?:string|string[], class?:string|string[], parent_id?:string|null, label?:string|string[],
     *   voltage_kv?:number|number[], ids?:string[], q?:string, include_merged?:boolean}} [filter]  label arrays must ALL match
     * @returns {Promise<import('../domain/types.js').Asset[]>}
     */
    async getAssets(filter = {}) {
      const cats = asList(filter.category);
      const classes = asList(filter.class);
      const need = asList(filter.label);
      const volts = asList(filter.voltage_kv);
      const ids = filter.ids ? new Set(filter.ids) : null;
      const q = filter.q ? filter.q.toLowerCase() : null;
      return v().assets.filter((a) =>
        (filter.include_merged !== false || !a.merged_into) &&
        (!cats || cats.includes(a.category)) &&
        (!classes || classes.includes(a.class)) &&
        (filter.parent_id === undefined || a.parent_id === filter.parent_id) &&
        (!need || need.every((l) => a.labels.includes(l))) &&
        (!volts || volts.includes(a.voltage_kv)) &&
        (!ids || ids.has(a.asset_id)) &&
        (!q || a.name.toLowerCase().includes(q) || a.asset_id.toLowerCase().includes(q)));
    },

    /** @returns {Promise<import('../domain/types.js').Asset|null>} */
    async getAsset(id) { return v().byId.get(id) ?? null; },

    /** Direct children of an asset (by parent_id). */
    async getChildren(id) { return v().children.get(id) ?? []; },

    /** Walk parent_id upwards; nearest parent first. */
    async getAncestors(id) {
      const out = [];
      let cur = v().byId.get(id);
      while (cur && cur.parent_id) {
        cur = v().byId.get(cur.parent_id);
        if (cur) out.push(cur);
      }
      return out;
    },

    /**
     * @param {{asset_id?:string, type?:string|string[], status?:string|string[], source?:string|string[], relation?:string,
     *   include_obsolete?:boolean}} [filter]  asset_id matches either end of the link. Proposed links whose asset
     *   was merged away are marked obsolete and left out unless include_obsolete is true.
     * @returns {Promise<import('../domain/types.js').Link[]>}
     */
    async getLinks(filter = {}) {
      const types = asList(filter.type);
      const statuses = asList(filter.status);
      const sources = asList(filter.source);
      return v().links.filter((l) =>
        (!filter.asset_id || l.from_asset === filter.asset_id || l.to_asset === filter.asset_id) &&
        (!types || types.includes(l.type)) &&
        (!statuses || statuses.includes(l.status)) &&
        (!sources || sources.includes(l.source)) &&
        (!filter.relation || l.relation === filter.relation) &&
        (filter.include_obsolete || !l.obsolete));
    },
    async getLink(id) { return v().linkById.get(id) ?? null; },

    /** @returns {Promise<import('../domain/types.js').Label[]>} */
    async getLabels(kind) { return kind ? base.labels.filter((l) => l.kind === kind) : base.labels; },

    /** @returns {Promise<import('../domain/types.js').Campaign[]>} */
    async getCampaigns() { return base.campaigns; },

    /** @returns {Promise<import('../domain/types.js').Capture[]>} */
    async getCaptures(filter = {}) {
      return base.captures.filter((c) => (!filter.campaign_id || c.campaign_id === filter.campaign_id));
    },
    async getCapture(id) { return base.captures.find((c) => c.capture_id === id) ?? null; },

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
      return v().findings.filter((f) =>
        (!camp || camp.includes(f.campaign_id)) &&
        (!asset || asset.includes(f.asset_id)) &&
        (!filter.tower_id || f.tower_id === filter.tower_id) &&
        (!cls || cls.includes(f.defect_class)) &&
        (!grp || grp.includes(f.group)) &&
        (!rs || rs.includes(f.review_status)) &&
        (filter.max_condition_score === undefined || f.condition_score <= filter.max_condition_score));
    },
    async getFinding(id) { return v().findingById.get(id) ?? null; },

    /** DGA history for one transformer, oldest first. */
    async getDgaSamples(transformerId) {
      return base.dga.filter((s) => s.asset_id === transformerId).sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * @param {{asset_id?:string, status?:string|string[], finding_id?:string}} [filter]
     * @returns {Promise<import('../domain/types.js').WorkOrder[]>}
     */
    async getWorkOrders(filter = {}) {
      const st = asList(filter.status);
      return v().workOrders.filter((w) =>
        (!filter.asset_id || w.asset_id === filter.asset_id) &&
        (!st || st.includes(w.status)) &&
        (!filter.finding_id || w.finding_ids.includes(filter.finding_id)));
    },

    /** @returns {Promise<import('../domain/types.js').Repair[]>} */
    async getRepairs(filter = {}) {
      return v().repairs.filter((r) =>
        (!filter.asset_id || r.asset_id === filter.asset_id) &&
        (!filter.work_order_id || r.work_order_id === filter.work_order_id));
    },

    /** Whole data set (current view) for building a scoring context: createContext(await repo.getAll()). */
    async getAll() { return v().all; },

    /**
     * Scoring context over the current view. It is rebuilt after any write, so scores recompute after a merge:
     *   healthIndex(await repo.getContext(), 'L-220-03', asOf)
     */
    async getContext() { return (ctx ??= createContext(v().all, config)); },

    /** Visual feature lookup (STUB data; see visualStub.js). */
    async getVisualFeatures() { return features; },

    /** How the derived links were made: counts per band and how few pairs were compared. */
    async getLinkStats() { return { rules: { counts: rules.counts, skippedExisting: rules.skippedExisting }, resemblance: resemblance.stats }; },

    /** Audit log, newest first: automatic links, then the user's decisions. */
    async getAuditLog() { return [...baseAudit, ...overlay.audit].map((e, i) => ({ e, i })).sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i).map((x) => x.e); },

    /** Number that changes after every write; lets a screen know to redraw. */
    getRevision() { return revision; },

    /** Call fn after every write or reset. Returns a function that stops the calls. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Seed answer key. Tests only; the real API will not have it, and no scoring or linking code reads it. */
    async getGroundTruth() { return base.groundTruth; },

    // ---------------------------------------------------------------- writes

    /** Accept a proposed link. Idempotent on a link that is already confirmed. */
    async confirmLink(link_id, { by = 'reviewer' } = {}) { return decide(link_id, 'confirmed', by); },

    /** Reject a link. */
    async rejectLink(link_id, { by = 'reviewer' } = {}) { return decide(link_id, 'rejected', by); },

    /**
     * Merge a duplicate record into the surviving one: sets merged_into on `from`, moves its findings,
     * repairs, work orders and child records to `into`, and confirms the link when link_id is given.
     * Scores ignore the merged record and recompute from getContext().
     */
    async mergeAssets({ from, into, link_id = null, by = 'reviewer' }) {
      const a = v().byId.get(from);
      const b = v().byId.get(into);
      if (!a || !b) throw new Error('Unknown asset');
      if (from === into) throw new Error('Cannot merge an asset into itself');
      if (a.class !== b.class) throw new Error(`Only assets of the same class can be merged (${a.class} / ${b.class})`);
      if (a.merged_into || b.merged_into) throw new Error('One of the assets is already merged');
      if (link_id && !v().linkById.has(link_id)) throw new Error(`Unknown link ${link_id}`);
      const at = clock();
      overlay.merges.push({ from, into, link_id, by, at });
      if (link_id) overlay.decisions[link_id] = { status: 'confirmed', by, at };
      audit({ by, action: 'merge', link_id, detail: `Merged ${from} into ${into}` });
      changed();
      return { from, into, link_id };
    },

    /** Confirm a finding as a real defect. Idempotent on a finding that is already confirmed. */
    async confirmFinding(id, { by = 'reviewer' } = {}) {
      baseFinding(id);
      const now = v().findingById.get(id);
      if (now.review_status === 'confirmed') return now;
      const e = editOf(id);
      e.review_status = 'confirmed'; stamp(e, by);
      audit({ by, action: 'finding_confirm', finding_id: id, detail: `Confirmed ${id} (${now.defect_class.replace(/_/g, ' ')})` });
      changed();
      return v().findingById.get(id);
    },

    /** Reject a finding: it is not a defect. It no longer counts toward any score. */
    async rejectFinding(id, { by = 'reviewer', reason = null } = {}) {
      baseFinding(id);
      const now = v().findingById.get(id);
      if (now.review_status === 'rejected') return now;
      const e = editOf(id);
      e.review_status = 'rejected'; e.reason = reason; stamp(e, by);
      audit({ by, action: 'finding_reject', finding_id: id, detail: `Rejected ${id}${reason ? `: ${reason}` : ''}` });
      changed();
      return v().findingById.get(id);
    },

    /**
     * Correct what the AI proposed: its class, severity (condition 1-4) or box. A correction also confirms the finding.
     * @param {{defect_class?: string, condition_score?: number, bbox?: {x:number,y:number,w:number,h:number}}} changes
     */
    async correctFinding(id, changes, { by = 'reviewer' } = {}) {
      baseFinding(id);
      const now = v().findingById.get(id);
      const c = {};
      if (changes.defect_class !== undefined && changes.defect_class !== now.defect_class) {
        if (!DEFECT_GROUP.has(changes.defect_class)) throw new Error(`Unknown defect class ${changes.defect_class}`);
        c.defect_class = changes.defect_class;
      }
      if (changes.condition_score !== undefined && changes.condition_score !== now.condition_score) {
        if (![1, 2, 3, 4].includes(changes.condition_score)) throw new Error('Severity must be a condition from 1 (critical) to 4 (minor)');
        c.condition_score = changes.condition_score;
      }
      if (changes.bbox !== undefined) {
        if (!validBox(changes.bbox)) throw new Error('The box must lie inside the image');
        const b = { x: round3(changes.bbox.x), y: round3(changes.bbox.y), w: round3(changes.bbox.w), h: round3(changes.bbox.h) };
        if (!now.bbox || ['x', 'y', 'w', 'h'].some((k) => Math.abs(now.bbox[k] - b[k]) > 0.0005)) c.bbox = b;
      }
      if (!Object.keys(c).length) throw new Error('Nothing to change');
      const e = editOf(id);
      Object.assign(e, c);
      e.corrected = true; e.review_status = 'confirmed'; stamp(e, by);
      const parts = [];
      if (c.defect_class) parts.push(`class ${now.defect_class.replace(/_/g, ' ')} to ${c.defect_class.replace(/_/g, ' ')}`);
      if (c.condition_score) parts.push(`severity ${now.condition_score} to ${c.condition_score}`);
      if (c.bbox) parts.push('box adjusted');
      audit({ by, action: 'finding_correct', finding_id: id, detail: `Corrected ${id}: ${parts.join(', ')}` });
      changed();
      return v().findingById.get(id);
    },

    /** Link a finding to a different asset. The scores of both assets recompute. */
    async relinkFinding(id, assetId, { by = 'reviewer' } = {}) {
      baseFinding(id);
      const now = v().findingById.get(id);
      const target = v().byId.get(assetId);
      if (!target) throw new Error(`Unknown asset ${assetId}`);
      if (target.merged_into) throw new Error(`${assetId} was merged into ${target.merged_into}`);
      if (assetId === now.asset_id) return now;
      const e = editOf(id);
      e.asset_id = assetId; e.tower_id = towerOf(assetId); e.relinked = true;
      if (now.review_status === 'pending') e.review_status = 'confirmed';
      stamp(e, by);
      audit({ by, action: 'finding_relink', finding_id: id, detail: `Linked ${id} to ${assetId} (was ${now.asset_id})` });
      changed();
      return v().findingById.get(id);
    },

    /** Put a finding back exactly as the AI proposed it. */
    async revertFinding(id, { by = 'reviewer' } = {}) {
      baseFinding(id);
      if (!overlay.findingEdits[id]) return v().findingById.get(id);
      delete overlay.findingEdits[id];
      audit({ by, action: 'finding_revert', finding_id: id, detail: `Reverted ${id} to the AI proposal` });
      changed();
      return v().findingById.get(id);
    },

    /** Forget every decision and merge, in memory and in browser storage. */
    async resetDemoData({ by = 'reviewer' } = {}) {
      overlay = freshOverlay();
      if (storage) { try { storage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
      audit({ by, action: 'reset', detail: 'Demo data reset' });
      changed();
    },
  };
}

/** Default repository over the fixed-seed demo data. */
export const repository = createRepository(generateSeed());
