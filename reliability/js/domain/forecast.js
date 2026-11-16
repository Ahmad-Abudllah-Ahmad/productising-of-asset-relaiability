// Condition forecast (Phase E): project the health index of a tower, span or transformer 12 months ahead.
//
// Pure functions: no clock, no DOM, no storage. Every query takes an explicit asOf date, and only evidence, repairs and DGA samples
// dated on or before it are used, so moving the "as of" date back gives the forecast that could have been made then.
// All method parameters are in CONFIG.forecast (assumptions A27 to A33 in config.js). The method is deliberately simple, so it can
// be explained in two sentences and checked by hand:
//
//   towers and spans   a straight line fitted to the health index at each campaign (only since the last completed repair),
//                      never rising; plus extra decline for defects that came back after earlier repairs, and for open
//                      serious findings.
//   transformers       each dissolved gas is carried forward at its observed generation rate (ppm per day) and the transformer is
//                      scored again at each future date with the same health-index rules; campaign findings do not drive the line.
//   range              the 10th and 90th percentile of the fleet's observed yearly changes in the same asset class, relative
//                      to the median change, applied for the time ahead. Not invented: with too few observed changes there is no range.
//
// An asset with fewer than two campaigns (two DGA samples for a transformer) gets status 'not_enough_history', never a guess.

import { healthIndex } from './health/healthIndex.js';

const DAY = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
export const addDays = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const YEAR = 365.25;

/** Asset classes that get a forecast, and the kind of method each uses. */
export const FORECAST_CLASSES = Object.freeze({ tower: 'trend', span: 'trend', power_transformer: 'dga' });

/** Band of a score under the configured cut-offs; null score is 'none' (not assessed). */
export function bandOfScore(score, bands) {
  if (score === null || score === undefined) return 'none';
  return score >= bands.normalMin ? 'normal' : score >= bands.poorBelow ? 'moderate' : 'poor';
}
/** The next band down, and the score below which an asset is in it. */
export function nextBandDown(band, bands) {
  if (band === 'normal') return { band: 'moderate', below: bands.normalMin };
  if (band === 'moderate') return { band: 'poor', below: bands.poorBelow };
  return null;
}

/** Least-squares slope of y on x, or null with fewer than two distinct x. */
export function slope(points) {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  return points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
}

/** Linear-interpolated percentile (p in 0-100) of a list of numbers. */
export function percentile(values, p) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const k = (v.length - 1) * (p / 100);
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return v[lo] + (v[hi] - v[lo]) * (k - lo);
}

/**
 * Years of drift counted after `days` days when each month's drift is `damping` times the month before (a damped trend: a steep
 * recent fall is not assumed to continue at full speed for a year). damping 1 is a straight line. Used for the trend and the range.
 */
export function driftYears(days, damping) {
  const months = days / (YEAR / 12);
  if (months <= 0) return 0;
  const m = damping >= 1 ? months : (1 - damping ** months) / (1 - damping);
  return m / 12;
}

// ------------------------------------------------------------------------------------------------------------------ history

/** The campaign points of an asset: health index at each campaign end (<= asOf) where it was assessed. */
export function campaignPoints(ctx, assetId, dates, asOf) {
  const out = [];
  for (const d of dates) {
    if (d > asOf) continue;
    const s = healthIndex(ctx, assetId, d).score;
    if (s !== null) out.push({ date: d, hi: s });
  }
  return out;
}

const repairsUpTo = (ctx, assetId, asOf) => ctx.repairsFor(assetId).filter((r) => r.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));

// ------------------------------------------------------------------------------------------------------------- recurrence

/**
 * Repairs on this asset whose defect came back, as of asOf. `ineffectiveIds` (the Maintenance History's judgement, by repair id) is
 * used when given; otherwise a repair counts as ineffective when a finding of the same defect class is sighted again on the same
 * component after the repair date.
 * @returns {{repairs: number, recurred: number, ids: string[]}}
 */
export function recurrenceOf(ctx, assetId, asOf, ineffectiveIds = null) {
  const repairs = repairsUpTo(ctx, assetId, asOf);
  const evidence = ctx.findingsFor(assetId, asOf).evidence.filter((f) => f.review_status !== 'rejected');
  const ids = [];
  for (const r of repairs) {
    let again;
    if (ineffectiveIds) again = ineffectiveIds.has(r.repair_id);
    else {
      const closed = evidence.filter((f) => r.closes_finding_ids.includes(f.finding_id));
      again = closed.some((c) => evidence.some((f) => f.finding_id !== c.finding_id && f.defect_class === c.defect_class && f.asset_id === c.asset_id && f.date > r.date));
    }
    if (again) ids.push(r.repair_id);
  }
  return { repairs: repairs.length, recurred: ids.length, ids };
}

// ------------------------------------------------------------------------------------------------------------------ range

/**
 * How far the fleet's changes spread around their typical change, per asset class.
 * Each observed change is the move in health index between two consecutive campaigns of one asset, expressed per year; intervals
 * that contain a repair are left out (a repair is a jump, not a drift). Returns, per class, the deviation per year of the low and the
 * high percentile from the median, or null when fewer than config.range.minChanges changes were observed.
 * @param {*} ctx
 * @param {string[]} assetIds  the assets to learn from
 * @param {string[]} dates  campaign end dates
 * @param {string} asOf
 */
export function fleetSpread(ctx, assetIds, dates, asOf, config = ctx.config.forecast) {
  const byClass = new Map();
  for (const id of assetIds) {
    const a = ctx.asset(id);
    const kind = FORECAST_CLASSES[a?.class];
    if (!kind) continue;
    const reps = repairsUpTo(ctx, id, asOf);
    const pts = kind === 'dga' ? dgaPoints(ctx, id, dates, asOf) : campaignPoints(ctx, id, dates, asOf);
    for (let i = 1; i < pts.length; i += 1) {
      const gap = daysBetween(pts[i - 1].date, pts[i].date);
      if (gap <= 0 || reps.some((r) => r.date > pts[i - 1].date && r.date <= pts[i].date)) continue;
      (byClass.get(a.class) ?? byClass.set(a.class, []).get(a.class)).push(((pts[i].hi - pts[i - 1].hi) / gap) * YEAR);
    }
  }
  const out = {};
  for (const cls of Object.keys(FORECAST_CLASSES)) {
    const changes = byClass.get(cls) ?? [];
    if (changes.length < config.range.minChanges) { out[cls] = { available: false, changes: changes.length, needed: config.range.minChanges }; continue; }
    const med = percentile(changes, 50);
    const [lo, hi] = config.range.percentiles;
    out[cls] = { available: true, changes: changes.length, median: r1(med), low: percentile(changes, lo) - med, high: percentile(changes, hi) - med, percentiles: [lo, hi] };
  }
  return out;
}

/** A transformer's health at each campaign date it had DGA evidence for (the series the fleet spread learns from). */
function dgaPoints(ctx, id, dates, asOf) {
  return campaignPoints(ctx, id, dates, asOf);
}

// ------------------------------------------------------------------------------------------------------------- transformers

/** Gas generation rate in ppm per day for each gas: least-squares slope over the samples inside the window (never negative). */
export function gasRates(samples, cfg) {
  const last = samples[samples.length - 1];
  const win = samples.filter((s) => daysBetween(s.date, last.date) <= cfg.trend.windowDays);
  const rates = {};
  for (const g of cfg.gases) {
    const sl = slope(win.map((s) => ({ x: daysBetween(win[0].date, s.date), y: s[g] })));
    rates[g] = Math.max(0, sl ?? 0);
  }
  return { rates, from: win[0].date, samplesUsed: win.length };
}

/**
 * The transformer's health index at each future date. Each gas is carried forward at its generation rate as a monthly series of
 * projected samples, so the scorer sees the same kind of history it sees today (gas limits, the rising-gas penalty, age).
 */
function txScores(ctx, txId, samples, rates, dates) {
  const last = samples[samples.length - 1];
  const synthetic = [];
  return dates.map((date) => {
    // projected samples at every month point after the last real sample, up to this date
    for (let d = synthetic.length ? addDays(synthetic.at(-1).date, 30) : addDays(last.date, 30); d <= date; d = addDays(d, 30)) {
      const ahead = daysBetween(last.date, d);
      const s = { ...last, sample_id: `FORECAST-${d}`, date: d };
      for (const g of Object.keys(rates)) s[g] = r1(last[g] + rates[g] * ahead);
      synthetic.push(s);
    }
    const upTo = synthetic.filter((x) => x.date <= date);
    const ahead = daysBetween(last.date, date);
    const at = upTo.at(-1)?.date === date || ahead <= 0 ? upTo : [...upTo, (() => { const s = { ...last, sample_id: `FORECAST-${date}`, date }; for (const g of Object.keys(rates)) s[g] = r1(last[g] + rates[g] * ahead); return s; })()];
    const view = { ...ctx, memo: new Map(), dgaSamples: (id) => (id === txId ? [...samples, ...at] : ctx.dgaSamples(id)) };
    return healthIndex(view, txId, date).score;
  });
}

// ------------------------------------------------------------------------------------------------------------------ the forecast

/**
 * @param {*} ctx  scoring context (domain/context.js)
 * @param {string} assetId  a tower, span or power transformer
 * @param {string} asOf  YYYY-MM-DD
 * @param {{dates: string[], spread?: ReturnType<typeof fleetSpread>, ineffectiveIds?: Set<string>|null, config?: object}} opts
 *   dates: campaign end dates, as known on asOf
 */
export function forecastAsset(ctx, assetId, asOf, { dates, spread = null, ineffectiveIds = null, config = ctx.config.forecast } = {}) {
  const asset = ctx.asset(assetId);
  const kind = FORECAST_CLASSES[asset?.class];
  const bands = ctx.config.bands;
  const base = { assetId, asOf, kind, horizonMonths: config.horizonMonths };
  if (!kind) return { ...base, status: 'unsupported', reason: 'No forecast for this kind of asset.' };

  const now = healthIndex(ctx, assetId, asOf);
  if (now.score === null) return { ...base, status: 'not_enough_history', reason: 'Not enough history to forecast', detail: `Not assessed yet: no inspection evidence on or before ${asOf}.`, history: [] };

  // ---- history, and whether there is enough of it
  const history = campaignPoints(ctx, assetId, dates, asOf);
  let samples = [];
  if (kind === 'dga') {
    samples = ctx.dgaSamples(assetId).filter((s) => s.date <= asOf);
    if (samples.length < config.minSamples) return { ...base, status: 'not_enough_history', reason: 'Not enough history to forecast', detail: `${samples.length} DGA sample${samples.length === 1 ? '' : 's'} on or before ${asOf}; at least ${config.minSamples} are needed.`, history };
  } else if (history.length < config.minCampaigns) {
    return { ...base, status: 'not_enough_history', reason: 'Not enough history to forecast', detail: `Assessed in ${history.length} campaign${history.length === 1 ? '' : 's'} on or before ${asOf}; at least ${config.minCampaigns} are needed.`, history };
  }

  // ---- the three drivers
  const repairs = repairsUpTo(ctx, assetId, asOf);
  const lastRepair = repairs.length ? repairs[repairs.length - 1] : null;
  const rec = recurrenceOf(ctx, assetId, asOf, ineffectiveIds);
  const recurrencePerYear = Math.min(config.recurrence.maxPerYear, rec.recurred * config.recurrence.pointsPerYearEach);
  const severe = ctx.findingsFor(assetId, asOf).counted.filter((f) => f.condition_score <= config.openFindings.severeAtOrBelow).length;
  const openPerYear = Math.min(config.openFindings.maxPerYear, severe * config.openFindings.pointsPerYearEach);

  // ---- project
  const monthDates = Array.from({ length: config.horizonMonths + 1 }, (_, m) => addDays(asOf, Math.round((m * YEAR) / 12)));
  let line;
  let driver;
  let usedPoints = history;
  let resetAt = null;
  if (kind === 'trend') {
    usedPoints = history;
    if (lastRepair) {
      resetAt = lastRepair.date;
      const at = healthIndex(ctx, assetId, lastRepair.date).score;
      usedPoints = [...(at === null ? [] : [{ date: lastRepair.date, hi: at, repair: lastRepair.repair_id }]), ...history.filter((p) => p.date > lastRepair.date)];
    }
    const sl = usedPoints.length >= 2 ? slope(usedPoints.map((p) => ({ x: daysBetween(usedPoints[0].date, p.date), y: p.hi }))) : null;
    const perYear = sl === null ? 0 : sl * YEAR;
    const trendPerYear = config.trend.allowRise ? perYear : Math.min(0, perYear);
    const totalPerYear = trendPerYear - recurrencePerYear - openPerYear;   // the decline in the first year if nothing slowed it
    driver = { method: 'trend', trendPerYear: r1(trendPerYear), fittedPerYear: sl === null ? null : r1(perYear), pointsUsed: usedPoints.length, noInspectionSinceRepair: Boolean(lastRepair) && usedPoints.length < 2, totalPerYear: r1(totalPerYear) };
    line = monthDates.map((d) => {
      const days = daysBetween(asOf, d);
      return clamp(now.score + trendPerYear * driftYears(days, config.trend.damping) + (-recurrencePerYear - openPerYear) * (days / YEAR), 0, 100);
    });
  } else {
    const { rates, from, samplesUsed } = gasRates(samples, ctx.config.transformer.dga);
    const projected = txScores(ctx, assetId, samples, rates, monthDates);
    const extra = recurrencePerYear + openPerYear;
    line = projected.map((s, i) => clamp((s ?? now.score) - (extra * daysBetween(asOf, monthDates[i])) / YEAR, 0, 100));
    // the projection starts from today's score, which may include a visual finding or an oil result the gas rates do not know about
    const shift = line[0] - now.score;
    line = line.map((v) => clamp(v - shift, 0, 100));
    // never rising, as for towers and spans: a better score is not assumed without a repair
    if (!config.trend.allowRise) { let low = line[0]; line = line.map((v) => { low = Math.min(low, v); return low; }); }
    const fastest = Object.entries(rates).map(([g, v]) => ({ gas: g, ppmPerDay: v, relative: samples[samples.length - 1][g] > 0 ? (v * YEAR) / samples[samples.length - 1][g] : 0 })).sort((a, b) => b.relative - a.relative)[0];
    driver = { method: 'dga', samplesUsed, windowFrom: from, fastestGas: fastest?.gas ?? null, fastestGrowthPerYear: fastest ? r1(fastest.relative * 100) : null, totalPerYear: r1(((line.at(-1) ?? now.score) - now.score)) };
    usedPoints = samples.map((s) => ({ date: s.date, hi: null }));
  }

  // ---- range from the fleet
  const sp = spread?.[asset.class] ?? null;
  const range = sp?.available
    ? { available: true, changes: sp.changes, percentiles: sp.percentiles, lowPerYear: r1(sp.low), highPerYear: r1(sp.high) }
    : { available: false, changes: sp?.changes ?? 0, needed: sp?.needed ?? config.range.minChanges };
  const points = monthDates.map((date, i) => {
    const t = driftYears(daysBetween(asOf, date), kind === 'trend' ? config.trend.damping : 1);
    const hi = r1(line[i]);
    return { date, hi, lower: range.available ? r1(clamp(line[i] + sp.low * t, 0, 100)) : null, upper: range.available ? r1(clamp(line[i] + sp.high * t, 0, 100)) : null };
  });

  // ---- band crossing
  const band = bandOfScore(now.score, bands);
  const nxt = nextBandDown(band, bands);
  const cross = (key) => {
    if (!nxt) return null;
    for (let i = 1; i < points.length; i += 1) {
      const a = key === 'hi' ? points[i - 1].hi : points[i - 1][key];
      const b = key === 'hi' ? points[i].hi : points[i][key];
      if (a === null || b === null) return null;
      if (b < nxt.below) {
        const f = a < nxt.below ? 0 : (a - nxt.below) / (a - b);
        return addDays(points[i - 1].date, Math.max(1, Math.round(f * daysBetween(points[i - 1].date, points[i].date))));
      }
    }
    return null;
  };
  const crossingDate = cross('hi');
  const earliest = range.available ? cross('lower') : null;
  const end = points.at(-1);
  const stays = nxt ? crossingDate === null : true;
  const crossing = {
    from: band, into: nxt?.band ?? null, date: crossingDate, daysAhead: crossingDate ? daysBetween(asOf, crossingDate) : null,
    earliestDate: earliest, stays, lowestBand: !nxt,
    text: !nxt ? 'Already in the lowest band' : crossingDate ? `Projected to fall into the ${nxt.band} band around ${crossingDate}` : `Stays in the ${band} band for ${config.horizonMonths} months`,
  };

  return {
    ...base, status: 'ok', method: kind, band, hi: now.score, endHi: end.hi, endBand: bandOfScore(end.hi, bands),
    history, usedPoints, resetAt, resetRepairId: lastRepair?.repair_id ?? null, resetPoint: kind === 'trend' ? (usedPoints.find((x) => x.repair) ?? null) : null,
    drivers: { ...driver, recurrence: { ...rec, extraPerYear: r1(recurrencePerYear) }, openFindings: { severe, extraPerYear: r1(openPerYear) } },
    range, points, crossing, dropsBand: Boolean(crossingDate),
  };
}

/**
 * Forecasts for a set of assets, with the fleet spread worked out once from all of them.
 * @returns {{spread: ReturnType<typeof fleetSpread>, byAsset: Map<string, ReturnType<typeof forecastAsset>>}}
 */
export function forecastFleet(ctx, assetIds, asOf, { dates, ineffectiveIds = null, config = ctx.config.forecast } = {}) {
  const ids = assetIds.filter((id) => FORECAST_CLASSES[ctx.asset(id)?.class]);
  const spread = fleetSpread(ctx, ids, dates, asOf, config);
  const byAsset = new Map(ids.map((id) => [id, forecastAsset(ctx, id, asOf, { dates, spread, ineffectiveIds, config })]));
  return { spread, byAsset };
}

/** Plain-language method text, built from the config so the hover and the docs cannot drift from the numbers. */
export function methodText(kind, config) {
  const range = `The range is the spread (${config.range.percentiles[0]}th to ${config.range.percentiles[1]}th percentile) of changes seen across the fleet.`;
  if (kind === 'dga') return `Each dissolved gas is carried forward at the rate it has been rising, and the transformer is scored again at each future date; recurring defects and open serious findings add decline. ${range}`;
  return `A straight line through this asset's health index at each campaign (only since its last repair, never rising), plus extra decline for defects that came back after repair and for open serious findings. ${range}`;
}
