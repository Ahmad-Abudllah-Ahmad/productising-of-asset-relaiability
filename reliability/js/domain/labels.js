// Label helpers. Labels come from one managed list (config MANAGED_LABELS), so they stay matchable.

import { CONFIG, LABEL_KINDS } from './config.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every label in the managed list, as {label_id, kind, value}. */
export function managedLabels(config = CONFIG) {
  return LABEL_KINDS.flatMap((kind) => config.labels[kind].map((value) => ({ label_id: `${kind}:${slug(value)}`, kind, value })));
}

export const isManagedLabel = (labelId, config = CONFIG) => managedLabels(config).some((l) => l.label_id === labelId);

/**
 * All assets, of any category, that carry the label (or all of several labels).
 * @param {import('./types.js').Asset[]} assets
 * @param {string|string[]} labelIds
 * @param {{mode?: 'all'|'any', includeMerged?: boolean}} [options]
 */
export function assetsWithLabel(assets, labelIds, { mode = 'all', includeMerged = false } = {}) {
  const need = Array.isArray(labelIds) ? labelIds : [labelIds];
  return assets.filter((a) => (includeMerged || !a.merged_into) && (mode === 'all' ? need.every((l) => a.labels.includes(l)) : need.some((l) => a.labels.includes(l))));
}

/**
 * Assets that share at least one label with the given asset, with the labels they share.
 * Optionally limited to some label kinds, e.g. ['corridor'] to find everything on the same corridor.
 * @returns {Array<{asset: import('./types.js').Asset, shared: string[]}>}
 */
export function assetsSharingLabel(assets, assetId, { kinds } = {}) {
  const me = assets.find((a) => a.asset_id === assetId);
  if (!me) return [];
  const mine = me.labels.filter((l) => !kinds || kinds.includes(l.split(':')[0]));
  const out = [];
  for (const a of assets) {
    if (a.asset_id === assetId || a.merged_into) continue;
    const shared = a.labels.filter((l) => mine.includes(l));
    if (shared.length) out.push({ asset: a, shared });
  }
  return out;
}

/** Count of assets per category for a label: what "everything on Corridor North" is made of. */
export function categoryCountsForLabel(assets, labelId) {
  const counts = {};
  for (const a of assetsWithLabel(assets, labelId)) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return counts;
}
