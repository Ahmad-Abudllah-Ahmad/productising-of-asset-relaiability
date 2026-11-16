// Condition forecast for the screens: the domain forecast (domain/forecast.js) run over a snapshot, with the fleet's spread worked out
// once per snapshot. No DOM here. The Condition Trends tab and the Dashboard card read this; the tests read it directly.
//
// Everything is as of snap.asOf: campaigns, repairs, findings and DGA samples dated after it are not used.

import { CONFIG } from '../domain/config.js';
import { forecastFleet, forecastAsset, fleetSpread, FORECAST_CLASSES, methodText } from '../domain/forecast.js';
import { loadHistory } from './historyModel.js';

const cache = new WeakMap();

/** The forecasts for every live tower, span and transformer (duplicate records left out), keyed by asset id. Cached per snapshot. */
export function loadForecasts(snap) {
  if (cache.has(snap)) return cache.get(snap);
  const dates = snap.campaigns.map((c) => c.end).filter((d) => d <= snap.asOf).sort();
  const ids = snap.allAssets.filter((a) => FORECAST_CLASSES[a.class] && !snap.dupRecord.has(a.asset_id)).map((a) => a.asset_id);
  let ineffectiveIds = null;
  try { ineffectiveIds = new Set(loadHistory(snap).ineffective); } catch { ineffectiveIds = null; }
  const { spread, byAsset } = forecastFleet(snap.ctx, ids, snap.asOf, { dates, ineffectiveIds });
  const out = { dates, ineffectiveIds, spread, byAsset };
  cache.set(snap, out);
  return out;
}

/** The forecast of one asset (any kind: assets that get no forecast return null). */
export function forecastFor(snap, id) {
  const a = snap.byId.get(id);
  if (!a || !FORECAST_CLASSES[a.class]) return null;
  const all = loadForecasts(snap);
  return all.byAsset.get(id) ?? forecastAsset(snap.ctx, id, snap.asOf, { dates: all.dates, spread: all.spread, ineffectiveIds: all.ineffectiveIds });
}

/** Text for the hover on the forecast's heading: the method in one or two sentences, from the config. */
export const methodHover = (kind) => methodText(kind === 'dga' ? 'dga' : 'trend', CONFIG.forecast);

const CLASS_NOUN = { tower: 'tower', span: 'span', power_transformer: 'transformer' };

/** Assets in view (scope filters apply) projected to drop at least one band within the horizon, soonest first. */
export function droppingAssets(snap) {
  const { byAsset } = loadForecasts(snap);
  const rows = [];
  let notEnough = 0; let assessed = 0;
  for (const a of snap.assets) {
    const f = byAsset.get(a.asset_id);
    if (!f) continue;
    if (f.status === 'not_enough_history') { notEnough += 1; continue; }
    assessed += 1;
    if (!f.dropsBand) continue;
    rows.push({ id: a.asset_id, name: a.name, kind: CLASS_NOUN[a.class], hi: f.hi, band: f.band, into: f.crossing.into, date: f.crossing.date, daysAhead: f.crossing.daysAhead, endHi: f.endHi, method: f.method });
  }
  rows.sort((x, y) => x.daysAhead - y.daysAhead || x.id.localeCompare(y.id, undefined, { numeric: true }));
  return { count: rows.length, rows, forecastable: assessed, notEnough, horizonMonths: CONFIG.forecast.horizonMonths, asOf: snap.asOf };
}
export { fleetSpread };
