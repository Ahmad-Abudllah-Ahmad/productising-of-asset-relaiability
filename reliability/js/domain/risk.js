// Risk = (100 - HI) x criticality x consequence, with a linked-asset uplift on consequence.
//
// Uplift rule (settings in config risk.linkedUplift):
//   - Start from the asset's line (towers and spans use their parent line; a line uses itself) or,
//     for a transformer, the transformer itself.
//   - Follow confirmed electrical links up to maxHops (line -> bay -> transformer, or back).
//   - A line asset collects the transformers it can reach; a transformer collects the lines.
//   - Every collected asset whose HI is in the poor band adds perPoorLinkedAsset to consequence,
//     at most maxUplift, and consequence never exceeds maxConsequence.
//   - Assets that are not assessed, merged, or only linked by unconfirmed links add nothing.

import { assertAsOf, round1, notAssessed } from './health/common.js';
import { healthIndex } from './health/healthIndex.js';

function riskBand(score, config) {
  const b = config.risk.bands;
  if (score >= b.criticalAtOrAbove) return 'critical';
  if (score >= b.highAtOrAbove) return 'high';
  if (score >= b.mediumAtOrAbove) return 'medium';
  return 'low';
}

function baseConsequence(ctx, asset, override) {
  if (override !== undefined) return { value: override, source: 'override' };
  if (asset.ext?.consequence) return { value: asset.ext.consequence, source: 'asset.ext.consequence' };
  const kv = asset.voltage_kv ?? 0;
  const row = ctx.config.risk.consequenceByVoltageKv.find(([min]) => kv >= min);
  return { value: row ? row[1] : 1, source: `voltage ${kv} kV` };
}

/** Assets reachable over confirmed links of the configured types, up to maxHops. */
function reachable(ctx, startId, linkTypes, maxHops) {
  const seen = new Map([[startId, 0]]);
  let frontier = [startId];
  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const type of linkTypes) {
        for (const n of ctx.neighbours(type, id)) {
          if (!seen.has(n)) { seen.set(n, hop); next.push(n); }
        }
      }
    }
    frontier = next;
  }
  seen.delete(startId);
  return seen;
}

function linkedUplift(ctx, asset, asOf) {
  const rule = ctx.config.risk.linkedUplift;
  const info = { rule: describeRule(rule), enabled: rule.enabled, linked: [], poorCount: 0, uplift: 0, maxUplift: rule.maxUplift };
  if (!rule.enabled) return info;

  let start;
  let wantClass;
  if (asset.class === 'power_transformer') { start = asset.asset_id; wantClass = 'line'; }
  else if (asset.class === 'line') { start = asset.asset_id; wantClass = 'power_transformer'; }
  else if (asset.class === 'tower' || asset.class === 'span') { start = asset.parent_id; wantClass = 'power_transformer'; }
  else return info;
  if (!start || ctx.isMerged(start)) return info;

  for (const [id, hops] of reachable(ctx, start, rule.linkTypes, rule.maxHops)) {
    const other = ctx.asset(id);
    if (!other || other.class !== wantClass || id === asset.asset_id) continue;
    const hi = healthIndex(ctx, id, asOf);
    info.linked.push({ assetId: id, class: other.class, hops, hi: hi.score, band: hi.band, counted: hi.band === rule.linkedBand });
  }
  info.linked.sort((a, b) => a.assetId.localeCompare(b.assetId));
  info.poorCount = info.linked.filter((l) => l.counted).length;
  info.uplift = Math.min(rule.maxUplift, info.poorCount * rule.perPoorLinkedAsset);
  return info;
}

function describeRule(r) {
  return `+${r.perPoorLinkedAsset} consequence per linked asset in the ${r.linkedBand} band over confirmed ${r.linkTypes.join('/')} links (max ${r.maxHops} hops), at most +${r.maxUplift}, consequence capped at ${r.maxConsequence}`;
}

/**
 * @param {ReturnType<import('./context.js').createContext>} ctx
 * @param {string} assetId
 * @param {string} asOf  YYYY-MM-DD
 * @param {{consequence?: number}} [options]  override the consequence before uplift
 * @returns {import('./types.js').ScoreResult}
 */
export function risk(ctx, assetId, asOf, options = {}) {
  assertAsOf(asOf);
  const asset = ctx.asset(assetId);
  if (!asset) return notAssessed(asOf, 'unknown asset');
  const health = healthIndex(ctx, assetId, asOf);
  if (health.score === null) {
    return notAssessed(asOf, `not assessed: ${health.breakdown.reason}`, { assetId, health: health.breakdown });
  }

  const rule = ctx.config.risk;
  const criticality = asset.criticality;
  const base = baseConsequence(ctx, asset, options.consequence);
  const uplift = linkedUplift(ctx, asset, asOf);
  const consequence = Math.min(rule.linkedUplift.maxConsequence, base.value + uplift.uplift);
  const score = round1((100 - health.score) * criticality * consequence);

  return {
    score,
    band: riskBand(score, ctx.config),
    breakdown: {
      assessed: true, asOf, assetId,
      formula: 'risk = (100 - HI) x criticality x consequence',
      factors: {
        condition: { hi: health.score, healthBand: health.band, conditionPoints: round1(100 - health.score) },
        criticality: { value: criticality },
        consequence: { base: base.value, source: base.source, uplift: uplift.uplift, value: consequence, cappedAtMax: base.value + uplift.uplift > rule.linkedUplift.maxConsequence },
      },
      linkedUplift: uplift,
      health: health.breakdown,
    },
  };
}
