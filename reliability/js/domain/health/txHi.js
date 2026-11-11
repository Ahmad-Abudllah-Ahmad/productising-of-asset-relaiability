// Transformer health index from five inputs, each a 0-100 sub-score:
//   dga     latest sample against gas limits, minus a penalty for fast-rising gases
//   oil     moisture, acidity and breakdown voltage
//   age     years in service
//   tests   latest electrical test result
//   visual  worst open visual/thermal finding on the transformer or its parts
// HI = weighted mean of the sub-scores that have data (weights in config; missing inputs are
// listed and their weight is left out). With no DGA, oil, test or visual evidence the HI is null.

import { assertAsOf, round1, clamp, healthBand, freshness, maxDate, notAssessed, daysBetween, yearsBetween } from './common.js';

/** Linear 0..1 position of value between `good` and `poor` (works for either direction). */
function lerpScore(value, good, poor) {
  return clamp(((value - poor) / (good - poor)) * 100, 0, 100);
}

/** Score one gas: 100 up to the condition 1 limit, then down through the condition 2 and 3 limits to 0. */
function gasScore(value, [l1, l2, l3], [s1, s2, s3], zeroFactor) {
  if (value <= l1) return s1;
  if (value <= l2) return s1 + ((value - l1) / (l2 - l1)) * (s2 - s1);
  if (value <= l3) return s2 + ((value - l2) / (l3 - l2)) * (s3 - s2);
  const l4 = l3 * zeroFactor;
  return value >= l4 ? 0 : s3 * (1 - (value - l3) / (l4 - l3));
}

/**
 * Duval triangle 1 zone from CH4, C2H4 and C2H2 (IEC 60599, simplified straight-line boundaries).
 * Data for the screen; it does not change the score.
 * @param {{ch4:number,c2h4:number,c2h2:number}} sample
 */
export function duvalTriangle(sample) {
  const total = sample.ch4 + sample.c2h4 + sample.c2h2;
  if (!(total > 0)) return { zone: null, label: 'No key gases', percent: null, totalPpm: 0 };
  const ch4 = (sample.ch4 / total) * 100;
  const c2h4 = (sample.c2h4 / total) * 100;
  const c2h2 = (sample.c2h2 / total) * 100;
  let zone;
  if (ch4 >= 98) zone = 'PD';
  else if (c2h2 < 4 && c2h4 < 20) zone = 'T1';
  else if (c2h2 < 4 && c2h4 < 50) zone = 'T2';
  else if (c2h2 < 15 && c2h4 >= 50) zone = 'T3';
  else if (c2h2 >= 13 && c2h4 < 23) zone = 'D1';
  else if (c2h2 >= 13 && (c2h4 < 40 || c2h2 >= 29)) zone = 'D2';
  else zone = 'DT';
  const LABELS = {
    PD: 'Partial discharge', T1: 'Thermal fault < 300 C', T2: 'Thermal fault 300-700 C', T3: 'Thermal fault > 700 C',
    D1: 'Low-energy discharge', D2: 'High-energy discharge', DT: 'Thermal and electrical fault',
  };
  const r = (n) => Math.round(n * 10) / 10;
  return { zone, label: LABELS[zone], percent: { ch4: r(ch4), c2h4: r(c2h4), c2h2: r(c2h2) }, totalPpm: r(total) };
}

function dgaInput(ctx, txId, asOf) {
  const cfg = ctx.config.transformer.dga;
  const samples = ctx.dgaSamples(txId).filter((s) => s.date <= asOf);
  if (!samples.length) return null;
  const latest = samples[samples.length - 1];

  const gases = cfg.gases.map((g) => ({ gas: g, ppm: latest[g], score: Math.round(gasScore(latest[g], cfg.limits[g], cfg.scoreAtLimits, cfg.zeroAtTimesLimit3) * 10) / 10 }));
  const worstGas = gases.reduce((w, g) => (g.score < w.score ? g : w));

  // trend: latest against the oldest sample inside the window
  const t = cfg.trend;
  const inWindow = samples.filter((s) => daysBetween(s.date, latest.date) <= t.windowDays);
  const oldest = inWindow[0];
  let worstTrend = { gas: null, ratio: null, penalty: 0 };
  if (oldest && oldest.sample_id !== latest.sample_id) {
    for (const g of cfg.gases) {
      if (latest[g] < t.minLevelFractionOfLimit1 * cfg.limits[g][0]) continue;
      const ratio = latest[g] / Math.max(oldest[g], t.floorPpm);
      const penalty = t.maxPenalty * clamp((ratio - t.minGrowthRatio) / (t.fullPenaltyRatio - t.minGrowthRatio), 0, 1);
      if (penalty > worstTrend.penalty) worstTrend = { gas: g, ratio: Math.round(ratio * 100) / 100, penalty: Math.round(penalty * 10) / 10 };
    }
  }
  const score = Math.max(0, worstGas.score - worstTrend.penalty);
  return {
    score,
    date: latest.date,
    detail: {
      sampleId: latest.sample_id, sampleDate: latest.date, samplesUsed: samples.length, gases, worstGas: worstGas.gas,
      trend: { windowDays: t.windowDays, comparedWith: oldest && oldest !== latest ? oldest.sample_id : null, ...worstTrend },
      duval: duvalTriangle(latest),
    },
  };
}

function oilInput(ctx, tx, asOf) {
  const oil = tx.ext.oil;
  if (!oil || oil.date > asOf) return null;
  const cfg = ctx.config.transformer.oil;
  const parts = Object.keys(cfg).map((k) => ({ parameter: k, value: oil[k], score: Math.round(lerpScore(oil[k], cfg[k].good, cfg[k].poor) * 10) / 10 }));
  return { score: parts.reduce((s, p) => s + p.score, 0) / parts.length, date: oil.date, detail: { sampleDate: oil.date, parameters: parts } };
}

function ageInput(ctx, tx, asOf) {
  if (!tx.install_date) return null;
  const { fullScoreUntilYears: full, zeroAtYears: zero } = ctx.config.transformer.age;
  const years = yearsBetween(tx.install_date, asOf);
  const score = years <= full ? 100 : clamp(100 * (1 - (years - full) / (zero - full)), 0, 100);
  return { score, date: null, detail: { installDate: tx.install_date, ageYears: Math.round(years * 10) / 10 } };
}

function testsInput(ctx, tx, asOf) {
  const t = tx.ext.electrical_tests;
  if (!t || t.date > asOf) return null;
  return { score: ctx.config.transformer.tests[t.result], date: t.date, detail: { testDate: t.date, result: t.result } };
}

function visualInput(ctx, txId, asOf) {
  const f = ctx.findingsFor(txId, asOf);
  if (!f.evidence.length) return null;
  const worst = f.counted.length ? Math.min(...f.counted.map((x) => x.condition_score)) : 5;
  return {
    score: (worst / 5) * 100,
    date: maxDate(f.evidence.map((x) => x.date)),
    detail: {
      worstCondition: worst, findingIds: f.counted.map((x) => x.finding_id).sort(),
      unreviewedFindingIds: f.unreviewed.map((x) => x.finding_id).sort(), closedFindingIds: f.closed.map((x) => x.finding_id).sort(),
      rejectedFindingIds: f.rejected.map((x) => x.finding_id).sort(),
    },
  };
}

/**
 * @returns {import('../types.js').ScoreResult}
 */
export function transformerHi(ctx, txId, asOf) {
  assertAsOf(asOf);
  const key = `tx|${txId}|${asOf}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key);
  const result = compute(ctx, txId, asOf);
  ctx.memo.set(key, result);
  return result;
}

function compute(ctx, txId, asOf) {
  const tx = ctx.asset(txId);
  if (!tx || tx.class !== 'power_transformer') return notAssessed(asOf, 'not a transformer');
  if (ctx.isMerged(txId)) return notAssessed(asOf, `merged into ${tx.mergedInto}`);

  const inputs = {
    dga: dgaInput(ctx, txId, asOf), oil: oilInput(ctx, tx, asOf), age: ageInput(ctx, tx, asOf),
    tests: testsInput(ctx, tx, asOf), visual: visualInput(ctx, txId, asOf),
  };
  const evidenceInputs = ['dga', 'oil', 'tests', 'visual'].filter((k) => inputs[k]);
  if (!evidenceInputs.length) return notAssessed(asOf, 'no DGA, oil, test or visual evidence on or before asOf', { missingInputs: ['dga', 'oil', 'tests', 'visual'] });

  const weights = ctx.config.weights.txInputs;
  const used = Object.keys(weights).filter((k) => inputs[k]);
  const wSum = used.reduce((s, k) => s + weights[k], 0);
  const hi = round1(used.reduce((s, k) => s + weights[k] * inputs[k].score, 0) / wSum);
  const newest = maxDate(evidenceInputs.map((k) => inputs[k].date).filter(Boolean));

  return {
    score: hi,
    band: healthBand(hi, ctx.config),
    breakdown: {
      assessed: true, asOf, assetId: txId, class: 'power_transformer',
      formula: 'HI = sum(weight x sub-score) / sum(weight), over inputs that have data',
      inputs: Object.keys(weights).map((k) => ({
        input: k, weight: weights[k], used: Boolean(inputs[k]),
        score: inputs[k] ? round1(inputs[k].score) : null, detail: inputs[k]?.detail ?? null,
      })),
      missingInputs: Object.keys(weights).filter((k) => !inputs[k]),
      findingIds: inputs.visual?.detail.findingIds ?? [],
      unreviewedFindingIds: inputs.visual?.detail.unreviewedFindingIds ?? [],
      closedFindingIds: inputs.visual?.detail.closedFindingIds ?? [],
      duval: inputs.dga?.detail.duval ?? null,
      freshness: freshness(ctx.config, 'transformer', newest, asOf),
    },
  };
}
