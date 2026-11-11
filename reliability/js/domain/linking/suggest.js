// Suggested assets for a finding: "this finding is recorded on X, but it could be about Y".
// Used by "Link to asset" in the finding viewer. Two signals, both from fixed rules, no image model:
//   spatial   how close the asset is to the finding's GPS point (1 at the point, 0 at the gate)
//   classFit  whether this kind of asset is where this kind of defect is recorded (config linking.suggest.defectTargets);
//             a tower, span or transformer fits weakly: the exact component is not identified
// The asset the finding is currently linked to is always in the list, so the reviewer sees it next to the alternatives.

import { CONFIG } from '../config.js';
import { distM, anchorOf } from './geo.js';

const OWNER_CLASSES = new Set(['tower', 'span', 'power_transformer']);
const r3 = (n) => Math.round(n * 1000) / 1000;
const humanize = (s) => String(s).replace(/_/g, ' ');

/**
 * @param {import('../types.js').Finding} finding
 * @param {import('../types.js').Asset[]} assets
 * @param {{config?: typeof CONFIG}} [options]
 * @returns {Array<{assetId:string, name:string, class:string, score:number, distance:number|null, current:boolean,
 *   reasons:Array<{signal:string,value:number,weight:number,contribution:number,detail:string}>}>}
 */
export function suggestAssets(finding, assets, { config = CONFIG } = {}) {
  const sc = config.linking.suggest;
  const targets = sc.defectTargets[finding.defect_class] ?? [];
  const out = [];
  for (const a of assets) {
    if (a.merged_into || a.category === 'inspection_evidence') continue;
    const current = a.asset_id === finding.asset_id;
    const anchor = anchorOf(a);
    const d = anchor ? distM(finding.location, anchor) : null;
    if (!current && (d === null || d > sc.gateMeters)) continue;
    const fit = targets.includes(a.class) ? 1 : OWNER_CLASSES.has(a.class) ? sc.ownerFit : 0;
    if (!current && fit === 0) continue;
    const spatial = d === null || d > sc.gateMeters ? 0 : 1 - (d / sc.gateMeters) ** 2;
    const wSum = sc.weights.spatial + sc.weights.classFit;
    const reasons = [
      { signal: 'spatial', value: r3(spatial), weight: sc.weights.spatial, contribution: r3((sc.weights.spatial * spatial) / wSum), detail: d === null ? 'no location' : `${d.toFixed(1)} m from the finding's GPS point` },
      { signal: 'class fit', value: r3(fit), weight: sc.weights.classFit, contribution: r3((sc.weights.classFit * fit) / wSum),
        detail: fit === 1 ? `${humanize(finding.defect_class)} is recorded on a ${humanize(a.class)}` : fit > 0 ? `a ${humanize(a.class)}: the exact component would not be identified` : `a ${humanize(a.class)} is not where ${humanize(finding.defect_class)} is usually recorded` },
    ];
    out.push({ assetId: a.asset_id, name: a.name, class: humanize(a.class), score: r3(reasons.reduce((n, x) => n + x.contribution, 0)), distance: d === null ? null : Math.round(d * 10) / 10, current, reasons });
  }
  out.sort((x, y) => y.score - x.score || (x.distance ?? 1e9) - (y.distance ?? 1e9) || x.assetId.localeCompare(y.assetId));
  const top = out.slice(0, sc.maxResults);
  const cur = out.find((x) => x.current);
  if (cur && !top.includes(cur)) top[top.length - 1] = cur;
  return top;
}
