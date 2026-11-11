// Evaluation helpers. TESTS ONLY: this is the one place ground truth meets the linking output.
// Nothing under domain/ or data/repository.js imports this file or reads the answer key.

export const pairKey = (a, b) => [a, b].sort().join('|');

/** All unordered pairs inside each group. */
function pairsOf(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) out.push(pairKey(ids[i], ids[j]));
  return out;
}

/** True duplicate record pairs (original, duplicate). */
export function duplicateTruth(groundTruth) {
  return new Set(groundTruth.duplicates.map((d) => pairKey(d.original, d.duplicate)));
}

/**
 * True repeat-sighting pairs. Rejected findings are left out: the matcher is never asked to link a finding
 * a reviewer has already rejected.
 */
export function repeatTruth(groundTruth, findings) {
  const rejected = new Set(findings.filter((f) => f.review_status === 'rejected').map((f) => f.finding_id));
  const out = new Set();
  for (const g of groundTruth.repeatSightings) for (const k of pairsOf(g.finding_ids.filter((id) => !rejected.has(id)))) out.add(k);
  return out;
}

/** Precision and recall of predicted pair keys against true pair keys. */
export function precisionRecall(predicted, truth) {
  const pred = new Set(predicted);
  let tp = 0;
  for (const k of pred) if (truth.has(k)) tp += 1;
  return { predicted: pred.size, truth: truth.size, truePositives: tp, precision: pred.size ? tp / pred.size : 1, recall: truth.size ? tp / truth.size : 1 };
}

/** Pair keys of links of one kind at or above a score. */
export function linkKeys(links, kind, minScore, maxScoreExclusive = Infinity) {
  return links
    .filter((l) => l.source === 'resemblance' && l.from_kind === kind && l.confidence >= minScore && l.confidence < maxScoreExclusive)
    .map((l) => pairKey(l.from_asset, l.to_asset));
}
