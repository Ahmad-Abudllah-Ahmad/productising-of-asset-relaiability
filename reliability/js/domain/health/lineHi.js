// Line, tower and span health index.
//
//   component score  = lowest condition (1-5) among its open findings; no finding = 5
//   group score      = min(mean of its components, worst component + groupCapMargin)   [margin 0: the worst component]
//   tower/span HI    = ( sum_g w_g * S_g ) / ( 5 * sum_g w_g ) * 100, then limited by the worst group:
//                      a group at condition 1 scales the score into the poor band, condition 2 into the
//                      moderate band (config scoring.conditionCap); a cap never raises a score
//   line HI          = length-weighted mean of assessed tower and span HIs (not capped by the worst)
//
// Every function takes asOf and uses only evidence and repairs dated on or before it.

import { assertAsOf, round1, healthBand, freshness, maxDate, notAssessed, bandTop } from './common.js';

const TOP = 5;

function groupScore(ctx, owner, group, findings) {
  const cfg = ctx.config.scoring;
  const known = [];
  if ((cfg.ownerSelfGroups[owner.class] ?? []).includes(group)) known.push(owner.asset_id);
  for (const c of ctx.children(owner.asset_id)) if (cfg.componentGroupByClass[c.class] === group) known.push(c.asset_id);
  const knownSet = new Set(known);

  const byComponent = new Map();
  for (const f of findings.filter((x) => x.group === group)) {
    (byComponent.get(f.asset_id) ?? byComponent.set(f.asset_id, []).get(f.asset_id)).push(f);
  }
  const components = [...byComponent.entries()].map(([id, fs]) => ({
    componentId: id,
    score: Math.min(...fs.map((f) => f.condition_score)),
    findingIds: fs.map((f) => f.finding_id).sort(),
    // finding attached to a tower or span only, so the exact component is not known
    unresolved: !knownSet.has(id) || fs.some((f) => f.component_hint),
  })).sort((a, b) => a.componentId.localeCompare(b.componentId));

  const untouched = known.filter((id) => !byComponent.has(id));
  const all = components.length + untouched.length;
  if (!components.length) {
    return { group, score: TOP, mean: TOP, worst: null, capped: false, components: [], untouchedComponents: untouched.length, findingIds: [] };
  }
  const sum = components.reduce((s, c) => s + c.score, 0) + TOP * untouched.length;
  const mean = sum / all;
  const worst = Math.min(...components.map((c) => c.score));
  const score = Math.min(TOP, mean, worst + cfg.groupCapMargin);
  return {
    group, score: Math.round(score * 100) / 100, mean: Math.round(mean * 100) / 100, worst, capped: score < mean - 1e-9,
    components, untouchedComponents: untouched.length, findingIds: components.flatMap((c) => c.findingIds).sort(),
  };
}

/**
 * Condition-limiting cap. The weighted score is scaled into the capped band, so two assets with the
 * same worst group still differ by the rest of their condition:
 *   poor:     capped = bandTop(poor) x uncapped / 100
 *   moderate: capped = poorBelow + (bandTop(moderate) - poorBelow) x uncapped / 100
 * The strongest (lowest) result among the groups that trigger a cap wins. A cap never raises a score.
 */
function scaleIntoBand(config, band, uncapped) {
  const top = bandTop(config, band);
  const bottom = band === 'moderate' ? config.bands.poorBelow : 0;
  return round1(bottom + ((top - bottom) * uncapped) / 100);
}

function conditionCap(ctx, scoredGroups, weighted) {
  const mapping = ctx.config.scoring.conditionCap;
  const candidates = scoredGroups
    .map((g) => ({ group: g.group, condition: Math.round(g.score), band: mapping[Math.round(g.score)] }))
    .filter((c) => c.band)
    .map((c) => ({ ...c, scaled: scaleIntoBand(ctx.config, c.band, weighted) }));
  if (!candidates.length) {
    return { applied: false, band: null, condition: null, causedBy: [], uncappedScore: weighted, bandTop: null, scaledScore: null };
  }
  const lowest = Math.min(...candidates.map((c) => c.scaled));
  const causes = candidates.filter((c) => c.scaled === lowest);
  return {
    applied: lowest < weighted, band: causes[0].band, condition: causes[0].condition, causedBy: causes.map((c) => c.group),
    uncappedScore: weighted, bandTop: bandTop(ctx.config, causes[0].band), scaledScore: lowest,
  };
}

/** HI of one tower or span. */
function ownerHi(ctx, ownerId, asOf) {
  assertAsOf(asOf);
  const key = `hi|${ownerId}|${asOf}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key);
  const result = computeOwnerHi(ctx, ownerId, asOf);
  ctx.memo.set(key, result);
  return result;
}

function computeOwnerHi(ctx, ownerId, asOf) {
  const owner = ctx.asset(ownerId);
  if (!owner) return notAssessed(asOf, 'unknown asset');
  if (ctx.isMerged(ownerId)) return notAssessed(asOf, `merged into ${owner.merged_into}`);
  const groups = ctx.config.scoring.ownerGroups[owner.class];
  if (!groups) return notAssessed(asOf, `no line health index for class ${owner.class}`);

  const f = ctx.findingsFor(ownerId, asOf);
  const flown = owner.class === 'tower'
    ? ctx.coverageDates(ownerId, asOf)
    : [owner.ext.from_tower, owner.ext.to_tower].filter((t) => t && !ctx.isMerged(t)).flatMap((t) => ctx.coverageDates(t, asOf));
  const newest = maxDate([...f.evidence.map((x) => x.date), ...flown]);
  if (!f.evidence.length && !flown.length) return notAssessed(asOf, 'no evidence on or before asOf', { closedFindingIds: [] });

  const weights = ctx.config.weights.lineGroups;
  const scored = groups.map((g) => ({ ...groupScore(ctx, owner, g, f.counted), weight: weights[g] }));
  const wSum = scored.reduce((s, g) => s + g.weight, 0);
  const weighted = round1((scored.reduce((s, g) => s + g.weight * g.score, 0) / (TOP * wSum)) * 100);
  const cap = conditionCap(ctx, scored, weighted);
  const hi = cap.applied ? cap.scaledScore : weighted;
  const lastRepair = ctx.repairsFor(ownerId).filter((r) => r.date <= asOf).map((r) => r.date).sort().at(-1) ?? null;

  return {
    score: hi,
    band: healthBand(hi, ctx.config),
    breakdown: {
      assessed: true, asOf, assetId: ownerId, class: owner.class,
      formula: 'HI = min(cap, sum(weight x group score) / (5 x sum(weight)) x 100)',
      groups: scored,
      cap,
      findingIds: f.counted.map((x) => x.finding_id).sort(),
      unreviewedFindingIds: f.unreviewed.map((x) => x.finding_id).sort(),
      closedFindingIds: f.closed.map((x) => x.finding_id).sort(),
      rejectedFindingIds: f.rejected.map((x) => x.finding_id).sort(),
      excludedUnreviewedFindingIds: f.excluded.map((x) => x.finding_id).sort(),
      lastRepairDate: lastRepair,
      freshness: freshness(ctx.config, owner.category, newest, asOf),
    },
  };
}

/** @returns {import('../types.js').ScoreResult} */
export function towerHi(ctx, towerId, asOf) { return ownerHi(ctx, towerId, asOf); }

/** @returns {import('../types.js').ScoreResult} */
export function spanHi(ctx, spanId, asOf) { return ownerHi(ctx, spanId, asOf); }

/**
 * Length-weighted HI for a line.
 * @returns {import('../types.js').ScoreResult}
 */
export function lineHi(ctx, lineId, asOf) {
  assertAsOf(asOf);
  const key = `line|${lineId}|${asOf}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key);
  const result = computeLineHi(ctx, lineId, asOf);
  ctx.memo.set(key, result);
  return result;
}

function computeLineHi(ctx, lineId, asOf) {
  const line = ctx.asset(lineId);
  if (!line || line.class !== 'line') return notAssessed(asOf, 'not a line');
  if (ctx.isMerged(lineId)) return notAssessed(asOf, `merged into ${line.merged_into}`);

  const kids = ctx.children(lineId);
  const spans = kids.filter((a) => a.class === 'span');
  const towers = kids.filter((a) => a.class === 'tower');
  const meanLen = spans.length ? spans.reduce((s, a) => s + (a.ext.length_m ?? 0), 0) / spans.length : 1;
  const lenOf = (sp) => sp.ext.length_m ?? meanLen;

  // A tower weighs half of each adjoining span. Towers are keyed by their position in the line, so a
  // second (unmerged) record of the same tower gets the same weight as the original.
  const indexOfTower = (id) => ctx.asset(id)?.ext?.index;
  const towerWeightByIndex = new Map();
  for (const sp of spans) {
    for (const t of [sp.ext.from_tower, sp.ext.to_tower]) {
      const i = indexOfTower(t);
      if (i !== undefined) towerWeightByIndex.set(i, (towerWeightByIndex.get(i) ?? 0) + lenOf(sp) / 2);
    }
  }

  const items = [
    ...towers.map((t) => ({ asset: t, weight: towerWeightByIndex.get(t.ext.index) ?? meanLen / 2 })),
    ...spans.map((s) => ({ asset: s, weight: lenOf(s) })),
  ].map((it) => ({ ...it, result: ownerHi(ctx, it.asset.asset_id, asOf) }));

  const assessed = items.filter((it) => it.result.score !== null);
  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  const assessedWeight = assessed.reduce((s, it) => s + it.weight, 0);
  if (!assessed.length) return notAssessed(asOf, 'no assessed towers or spans', { towers: towers.length, spans: spans.length });

  const hi = round1(assessed.reduce((s, it) => s + it.weight * it.result.score, 0) / assessedWeight);
  const zero = () => ({ normal: 0, moderate: 0, poor: 0 });
  const bandCounts = { all: zero(), tower: zero(), span: zero() };
  for (const it of assessed) {
    bandCounts.all[it.result.band] += 1;
    bandCounts[it.asset.class][it.result.band] += 1;
  }
  const worst = [...assessed]
    .sort((a, b) => a.result.score - b.result.score || a.asset.asset_id.localeCompare(b.asset.asset_id))
    .slice(0, 5)
    .map((it) => ({ assetId: it.asset.asset_id, name: it.asset.name, class: it.asset.class, score: it.result.score, band: it.result.band }));
  const newest = maxDate(assessed.map((it) => it.result.breakdown.freshness.newestEvidenceDate).filter(Boolean));
  const dedupe = (key) => [...new Set(assessed.flatMap((it) => it.result.breakdown[key]))].sort();

  return {
    score: hi,
    band: healthBand(hi, ctx.config),
    breakdown: {
      assessed: true, asOf, assetId: lineId, class: 'line',
      formula: 'HI = sum(length weight x asset HI) / sum(length weight), over assessed towers and spans',
      cappedByWorst: false,
      counts: { towers: towers.length, spans: spans.length, assessedTowers: assessed.filter((i) => i.asset.class === 'tower').length, assessedSpans: assessed.filter((i) => i.asset.class === 'span').length },
      notAssessed: items.filter((it) => it.result.score === null).map((it) => it.asset.asset_id).sort(),
      coverageByLength: Math.round((assessedWeight / totalWeight) * 1000) / 1000,
      bandCounts,
      worst,
      findingIds: dedupe('findingIds'),
      unreviewedFindingIds: dedupe('unreviewedFindingIds'),
      closedFindingIds: dedupe('closedFindingIds'),
      freshness: freshness(ctx.config, 'line_network', newest, asOf),
    },
  };
}
