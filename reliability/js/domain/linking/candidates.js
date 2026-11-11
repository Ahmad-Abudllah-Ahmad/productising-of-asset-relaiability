// Candidate generation: turn records into proposed or automatic same-asset links without comparing every pair.
//
// Blocking keeps the work small:
//   assets    same class AND near each other (spatial hash), or same class AND same normalised name when
//             the asset has no point location
//   findings  same defect class AND near each other, different campaign, not rejected
// Only blocked pairs are scored. Scores are then sorted into three bands with the thresholds in config:
//   >= autoLinkAtOrAbove          linked automatically, status confirmed, logged
//   >= dropBelow                  proposed: goes to the Link Review queue
//   below dropBelow               dropped (not stored)
// For assets one record keeps at most one automatic partner: a lower-scoring rival for a record that is
// already linked automatically is suppressed.

import { CONFIG } from '../config.js';
import { createGrid, anchorOf } from './geo.js';
import { scorePair, normalizeName, idOf } from './resemblance.js';

const pointOf = anchorOf;

function scoreBlocks(pairs, options, config) {
  return pairs.map(([a, b]) => ({ a, b, ...scorePair(a, b, { ...options, config }) }));
}

function classify(s, rc) {
  if (!s.comparable) return 'not_comparable';
  if (s.score >= rc.auto) return 'auto';
  if (s.score >= rc.drop) return 'proposed';
  return 'dropped';
}

function assetPairs(assets, cell) {
  const pairs = [];
  const seen = new Set();
  const push = (a, b) => {
    const [x, y] = a.asset_id < b.asset_id ? [a, b] : [b, a];
    const k = `${x.asset_id}|${y.asset_id}`;
    if (!seen.has(k)) { seen.add(k); pairs.push([x, y]); }
  };
  const grids = new Map();
  const names = new Map();
  for (const a of assets) {
    const p = pointOf(a);
    if (p) { (grids.get(a.class) ?? grids.set(a.class, createGrid(cell)).get(a.class)).insert(a, p); }
    else { const k = `${a.class}|${normalizeName(a.name)}`; (names.get(k) ?? names.set(k, []).get(k)).push(a); }
  }
  for (const a of assets) {
    const p = pointOf(a);
    if (p) for (const b of grids.get(a.class).near(p)) if (b !== a) push(a, b);
  }
  for (const group of names.values()) for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) push(group[i], group[j]);
  return pairs;
}

function findingPairs(findings, cell) {
  const pairs = [];
  const grids = new Map();
  for (const f of findings) (grids.get(f.defect_class) ?? grids.set(f.defect_class, createGrid(cell)).get(f.defect_class)).insert(f, f.location);
  for (const a of findings) {
    for (const b of grids.get(a.defect_class).near(a.location)) {
      if (a.finding_id < b.finding_id && a.campaign_id !== b.campaign_id) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** The record that survives a merge: the one with a SAP id (the system of record), else the lower id. */
function survivorOf(a, b) {
  const sa = Boolean(a.external_ids?.sap);
  const sb = Boolean(b.external_ids?.sap);
  if (sa !== sb) return sa ? a : b;
  return a.asset_id <= b.asset_id ? a : b;
}

/**
 * @param {{assets:import('../types.js').Asset[], findings:import('../types.js').Finding[], features?:(id:string)=>number[]|null|undefined}} data
 * @param {typeof CONFIG} [config]
 */
export function generateResemblanceLinks(data, config = CONFIG) {
  const cfg = config.linking;
  const rc = { auto: cfg.autoLinkAtOrAbove, drop: cfg.dropBelow };
  const created = `${config.seed.referenceDate}T00:00:00Z`;
  const options = { features: data.features };

  const eligibleAssets = data.assets.filter((a) => !a.merged_into && a.category !== 'inspection_evidence');
  const eligibleFindings = data.findings.filter((f) => f.review_status !== 'rejected');

  const assetScored = scoreBlocks(assetPairs(eligibleAssets, cfg.blocking.cellMeters), options, config);
  const findingScored = scoreBlocks(findingPairs(eligibleFindings, cfg.blocking.cellMeters), options, config);

  const stats = {
    assets: { records: eligibleAssets.length, possiblePairs: (eligibleAssets.length * (eligibleAssets.length - 1)) / 2, scored: assetScored.length, notComparable: 0, auto: 0, proposed: 0, dropped: 0, suppressed: 0 },
    findings: { records: eligibleFindings.length, possiblePairs: (eligibleFindings.length * (eligibleFindings.length - 1)) / 2, scored: findingScored.length, notComparable: 0, auto: 0, proposed: 0, dropped: 0, suppressed: 0 },
  };

  const keep = [];
  // assets: strongest first, one automatic partner per record
  const partner = new Map();
  for (const s of assetScored.sort((x, y) => y.score - x.score || idOf(x.a).localeCompare(idOf(y.a)) || idOf(x.b).localeCompare(idOf(y.b)))) {
    const band = classify(s, rc);
    if (band === 'not_comparable') { stats.assets.notComparable += 1; continue; }
    if (band === 'dropped') { stats.assets.dropped += 1; continue; }
    const ia = idOf(s.a);
    const ib = idOf(s.b);
    if (band !== 'auto' && ((partner.has(ia) && partner.get(ia) !== ib) || (partner.has(ib) && partner.get(ib) !== ia))) { stats.assets.suppressed += 1; continue; }
    if (band === 'auto') { partner.set(ia, ib); partner.set(ib, ia); }
    stats.assets[band] += 1;
    const keepRec = survivorOf(s.a, s.b);
    const dup = keepRec === s.a ? s.b : s.a;
    keep.push({ s, band, kind: 'asset', from: dup, to: keepRec });
  }
  for (const s of findingScored.sort((x, y) => y.score - x.score || idOf(x.a).localeCompare(idOf(y.a)) || idOf(x.b).localeCompare(idOf(y.b)))) {
    const band = classify(s, rc);
    if (band === 'not_comparable') { stats.findings.notComparable += 1; continue; }
    if (band === 'dropped') { stats.findings.dropped += 1; continue; }
    stats.findings[band] += 1;
    const [older, newer] = s.a.date <= s.b.date ? [s.a, s.b] : [s.b, s.a];
    keep.push({ s, band, kind: 'finding', from: newer, to: older });
  }

  keep.sort((x, y) => y.s.score - x.s.score || idOf(x.from).localeCompare(idOf(y.from)) || idOf(x.to).localeCompare(idOf(y.to)));
  const links = [];
  const audit = [];
  keep.forEach(({ s, band, kind, from, to }, i) => {
    const link_id = `LNK-S-${String(i + 1).padStart(5, '0')}`;
    links.push({
      link_id, from_asset: idOf(from), from_kind: kind === 'finding' ? 'finding' : 'asset', to_asset: idOf(to), to_kind: kind === 'finding' ? 'finding' : 'asset',
      type: 'same_asset', relation: kind === 'asset' ? 'duplicate_of' : 'same_defect', source: 'resemblance', confidence: s.score,
      status: band === 'auto' ? 'confirmed' : 'proposed', confirmed_by: band === 'auto' ? 'auto-link' : null, created_at: created,
      reasons: s.reasons, notes: s.notes,
    });
    if (band === 'auto') {
      audit.push({ id: `AUD-A-${String(audit.length + 1).padStart(4, '0')}`, at: created, actor: 'auto-link', action: 'auto_link', link_id, detail: `score ${s.score} at or above ${rc.auto}` });
    }
  });
  return { links, audit, stats };
}
