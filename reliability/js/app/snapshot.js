// A snapshot of the data the Asset Registry shows, at one date: assets, their Phase 2 scores, open findings
// and links. Built from the repository, so it follows merges and link decisions.
// Everything is computed here once; the registry tabs then render synchronously from it.

import { CONFIG } from '../domain/config.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { risk } from '../domain/risk.js';
import { managedLabels } from '../domain/labels.js';
import { matcher, hasFilters } from './scope.js';
import { CATEGORIES } from './registryModel.js';

/** The date the demo is "today". Scores use only evidence and repairs up to this date. */
export const AS_OF = CONFIG.seed.referenceDate;

const SCORED = new Set(['tower', 'span', 'line', 'power_transformer']);
const OWNERS = new Set(['tower', 'span', 'power_transformer']);

/**
 * @param {ReturnType<typeof import('../data/repository.js').createRepository>} repo
 * @param {string} [asOf]  every score, count and list is for this date
 * @param {{label?: string|null, kv?: number|null, category?: string|null}} [filters]  the global filters (scope.js)
 *
 * snap.assets is the assets in scope (what lists, counts and maps show); snap.allAssets is every live asset, for looking
 * things up (the parent of a tower, the components of a tower in Asset 360). Scores, findings and links are computed for
 * all of them. snap.inScope(id) says whether an asset, or the tower, span or transformer that owns it, is in scope.
 */
export async function loadSnapshot(repo, asOf = AS_OF, filters = {}) {
  const [data, ctx, links, campaigns] = await Promise.all([repo.getAll(), repo.getContext(), repo.getLinks(), repo.getCampaigns()]);
  const assets = data.assets.filter((a) => !a.merged_into);
  const scope = { label: filters.label ?? null, kv: filters.kv ?? null, category: filters.category ?? null };
  const match = matcher(scope, (id) => CATEGORIES.find((c) => c.id === id)?.classes ?? []);
  const inView = assets.filter(match);
  const inViewIds = new Set(inView.map((a) => a.asset_id));
  const inScope = (id) => !hasFilters(scope) || inViewIds.has(id) || inViewIds.has(ctx.ownerOf(id));
  const byId = new Map(data.assets.map((a) => [a.asset_id, a]));

  const scores = new Map();
  for (const a of assets) {
    if (!SCORED.has(a.class)) continue;
    const hi = healthIndex(ctx, a.asset_id, asOf);
    scores.set(a.asset_id, { hi, risk: hi.score === null ? null : risk(ctx, a.asset_id, asOf) });
  }

  // open findings (counted at asOf), by the asset they were recorded on and by the tower/span/transformer that owns it
  const findingsByAsset = new Map();
  const findingsByOwner = new Map();
  const unreviewedByOwner = new Map();
  for (const owner of assets.filter((a) => OWNERS.has(a.class))) {
    const f = ctx.findingsFor(owner.asset_id, asOf);
    findingsByOwner.set(owner.asset_id, f.counted);
    unreviewedByOwner.set(owner.asset_id, f.unreviewed.length);
    for (const x of f.counted) (findingsByAsset.get(x.asset_id) ?? findingsByAsset.set(x.asset_id, []).get(x.asset_id)).push(x);
  }

  // links per asset: confirmed ones, and proposed ones waiting for a person (hierarchy links are structure, not shown)
  const linkCounts = new Map();
  const bump = (id, key) => { const c = linkCounts.get(id) ?? linkCounts.set(id, { linked: 0, review: 0 }).get(id); c[key] += 1; };
  for (const l of links) {
    if (l.type === 'hierarchy' || l.obsolete) continue;
    const key = l.status === 'confirmed' ? 'linked' : l.status === 'proposed' ? 'review' : null;
    if (!key) continue;
    if (l.from_kind !== 'finding') bump(l.from_asset, key);
    if (l.to_kind !== 'finding') bump(l.to_asset, key);
  }

  // Records the matcher thinks are duplicates of another asset: still in the registry until someone merges them.
  // dupRecord: the extra record (link.from_asset); dupOriginal: the record it would be merged into (link.to_asset).
  const dupRecord = new Map();
  const dupOriginal = new Map();
  for (const l of links) {
    if (l.type !== 'same_asset' || l.relation !== 'duplicate_of' || l.obsolete || l.merged || !['proposed', 'confirmed'].includes(l.status)) continue;
    if (!dupRecord.has(l.from_asset) || dupRecord.get(l.from_asset).confidence < l.confidence) dupRecord.set(l.from_asset, l);
    if (!dupOriginal.has(l.to_asset) || dupOriginal.get(l.to_asset).confidence < l.confidence) dupOriginal.set(l.to_asset, l);
  }

  const labelValue = new Map(managedLabels().map((l) => [l.label_id, l.value]));
  const dates = [...new Set([...campaigns.map((c) => c.end), asOf])].filter((d) => d <= asOf).sort();

  const findingsById = new Map(data.findings.map((f) => [f.finding_id, f]));
  const endInScope = (id, kind) => inScope(kind === 'finding' ? (findingsById.get(id)?.asset_id ?? id) : id);
  /** A link is in scope when either end is (a finding counts through the asset it is recorded on). */
  const linkInScope = (l) => !hasFilters(scope) || endInScope(l.from_asset, l.from_kind) || endInScope(l.to_asset, l.to_kind);
  /** The name of a date in a chart: the campaign that ended on it, "Today" for the reference date, else the date. */
  const endLabel = (d) => campaigns.find((c) => c.end === d)?.name ?? (d === AS_OF ? 'Today' : d);
  return { asOf, endLabel, dates, ctx, assets: inView, allAssets: assets, scope, inScope, linkInScope, byId, scores, captures: new Map((await repo.getCaptures()).map((c) => [c.capture_id, c])), findingsById, workOrders: data.workOrders, repairs: data.repairs, findingsByAsset, findingsByOwner, unreviewedByOwner, linkCounts, links, dupRecord, dupOriginal, labelValue, campaigns };
}
