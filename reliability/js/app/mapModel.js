// Risk Map: what the map draws, as plain objects with latitude and longitude. No DOM and no Leaflet here.
// mapScreen.js draws it; the tests read it directly. Scores are the Phase 2 scores in the snapshot (as of snap.asOf).
//
//   spans      one polyline each, coloured by the span's own health index (a line's score is in its popup)
//   towers     points, coloured by band (grey when not assessed); duplicate records are not drawn
//   stations   points; a substation has no health index, so it takes the band of its worst transformer
//   findings   open findings with a GPS point, for the clusters
//   labels     the managed labels that at least one drawn asset carries, for the highlight
//   select()   the assets inside a polygon, with the total risk of the ones that have a risk score

import { risk } from '../domain/risk.js';
import { assetsWithLabel } from '../domain/labels.js';
import { SEVERITY } from './assetModel.js';

export const LAYERS = Object.freeze(['spans', 'towers', 'stations', 'findings', 'tiles']);
export const LAYER_LABEL = Object.freeze({ spans: 'Lines (spans)', towers: 'Towers', stations: 'Substations', findings: 'Finding clusters', tiles: 'Basemap tiles' });
const KIND_WORD = { corridor: 'Corridor', circuit: 'Circuit', region: 'Region', corrosion_zone: 'Corrosion zone', criticality_class: 'Criticality class', manufacturer: 'Manufacturer', design_family: 'Design family', substation: 'Substation', failure_mode: 'Failure mode' };
const BAND_RANK = { poor: 0, moderate: 1, normal: 2, none: 3 };
const bandOf = (hi) => (!hi || hi.score === null || hi.score === undefined ? 'none' : hi.band);

const point = (a) => (a.location?.type === 'point' ? { lat: a.location.lat, lng: a.location.lng } : null);
const mid = (coords) => { const m = coords[Math.floor(coords.length / 2)]; return { lat: m[0], lng: m[1] }; };

/** Which layers are on: the hash lists them (layers=spans,towers); no key means all. */
export function parseLayers(value) {
  if (!value) return new Set(LAYERS);
  return new Set(String(value).split(',').filter((l) => LAYERS.includes(l)));
}
export const layersParam = (on) => (LAYERS.every((l) => on.has(l)) ? null : LAYERS.filter((l) => on.has(l)).join(','));

/** Ray casting. The polygon is a list of {lat, lng}; fine at this scale (a few kilometres). */
export function inPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]; const b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap */
export function loadMap(snap, { label = null } = {}) {
  const { ctx } = snap;
  const score = (id) => snap.scores.get(id);
  const open = (id) => snap.findingsByOwner.get(id)?.length ?? 0;
  const labelIdsOf = (a) => a.labels.filter((l) => !l.startsWith('failure_mode:'));

  const lineName = (id) => snap.byId.get(id)?.name ?? id;
  const spans = snap.assets.filter((a) => a.class === 'span' && a.location?.type === 'line').map((a) => {
    const s = score(a.asset_id);
    return { id: a.asset_id, kind: 'span', name: a.name, lineId: a.parent_id, coords: a.location.coordinates, hi: s?.hi.score ?? null, band: bandOf(s?.hi), risk: s?.risk?.score ?? null, riskBand: s?.risk?.band ?? null, open: open(a.asset_id), labels: a.labels, centre: mid(a.location.coordinates), clearance: a.ext?.min_clearance_m ?? null };
  });
  const towers = snap.assets.filter((a) => a.class === 'tower' && point(a) && !snap.dupRecord.has(a.asset_id)).map((a) => {
    const s = score(a.asset_id);
    return { id: a.asset_id, kind: 'tower', name: a.name, lineId: a.parent_id, ...point(a), hi: s?.hi.score ?? null, band: bandOf(s?.hi), risk: s?.risk?.score ?? null, riskBand: s?.risk?.band ?? null, open: open(a.asset_id), labels: a.labels };
  });

  // transformers sit in bays of a substation
  const bayStation = new Map(snap.assets.filter((a) => a.class === 'bay').map((a) => [a.asset_id, a.parent_id]));
  const transformers = snap.assets.filter((a) => a.class === 'power_transformer' && point(a)).map((a) => {
    const s = score(a.asset_id);
    return { id: a.asset_id, kind: 'transformer', name: a.name, stationId: bayStation.get(a.parent_id) ?? a.parent_id, ...point(a), hi: s?.hi.score ?? null, band: bandOf(s?.hi), risk: s?.risk?.score ?? null, riskBand: s?.risk?.band ?? null, open: open(a.asset_id), labels: a.labels };
  });
  const stations = snap.assets.filter((a) => a.class === 'substation' && point(a)).map((a) => {
    const t = transformers.filter((x) => x.stationId === a.asset_id);
    const band = t.length ? t.map((x) => x.band).sort((p, q) => BAND_RANK[p] - BAND_RANK[q])[0] : 'none';
    return { id: a.asset_id, kind: 'station', name: a.name, ...point(a), band, transformers: t.map((x) => ({ id: x.id, name: x.name, hi: x.hi, band: x.band, risk: x.risk })), risk: null, hi: null, open: t.reduce((n, x) => n + x.open, 0), labels: a.labels };
  });

  // open findings with a point on the ground
  const findings = [];
  for (const owner of snap.assets.filter((a) => ['tower', 'span', 'power_transformer'].includes(a.class))) {
    for (const f of snap.findingsByOwner.get(owner.asset_id) ?? []) {
      if (f.location) findings.push({ id: f.finding_id, lat: f.location.lat, lng: f.location.lng, condition: f.condition_score, severity: SEVERITY[f.condition_score].word, defectClass: f.defect_class, ownerId: owner.asset_id, ownerName: owner.name, unreviewed: f.review_status !== 'confirmed' });
    }
  }

  const lines = snap.assets.filter((a) => a.class === 'line').map((a) => {
    const s = score(a.asset_id);
    return { id: a.asset_id, name: a.name, kv: a.voltage_kv, hi: s?.hi.score ?? null, band: bandOf(s?.hi) };
  });

  // labels worth highlighting: managed labels that a drawn asset carries
  const drawn = [...spans, ...towers, ...stations, ...transformers];
  const counts = new Map();
  for (const d of drawn) for (const l of labelIdsOf({ labels: d.labels })) counts.set(l, (counts.get(l) ?? 0) + 1);
  const labels = [...counts.entries()].map(([id, n]) => { const [kind] = id.split(':'); return { id, kind, kindWord: KIND_WORD[kind] ?? kind.replace(/_/g, ' '), value: snap.labelValue.get(id) ?? id.split(':')[1], count: n }; })
    .sort((a, b) => a.kindWord.localeCompare(b.kindWord) || a.value.localeCompare(b.value));
  const highlighted = label ? new Set(assetsWithLabel(snap.assets, label).map((a) => a.asset_id)) : null;

  const every = [...towers, ...stations, ...spans.map((s) => s.centre)];
  const lats = every.map((p) => p.lat); const lngs = every.map((p) => p.lng);
  const bounds = every.length ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : null;

  // the total risk of everything with a risk score, at each campaign date and today (for the KPI sparkline)
  const scored = [...towers, ...spans, ...transformers].filter((x) => x.risk !== null);
  const riskSeries = snap.dates.map((d) => snap.assets.filter((a) => ['tower', 'span', 'power_transformer'].includes(a.class) && !snap.dupRecord.has(a.asset_id)).reduce((n, a) => n + (risk(ctx, a.asset_id, d).score ?? 0), 0));
  const totalRisk = scored.reduce((n, x) => n + x.risk, 0);
  const top = [...scored].sort((a, b) => b.risk - a.risk)[0] ?? null;

  /** The assets inside a polygon (spans by their midpoint), highest risk first, with the total risk of those that have one. */
  function select(poly) {
    const items = [...towers, ...transformers, ...stations].filter((p) => inPolygon(p, poly)).concat(spans.filter((s) => inPolygon(s.centre, poly)));
    items.sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1) || a.id.localeCompare(b.id));
    const withRisk = items.filter((x) => x.risk !== null);
    return { items, total: Math.round(withRisk.reduce((n, x) => n + x.risk, 0) * 10) / 10, scored: withRisk.length, byKind: { tower: items.filter((x) => x.kind === 'tower').length, span: items.filter((x) => x.kind === 'span').length, transformer: items.filter((x) => x.kind === 'transformer').length, station: items.filter((x) => x.kind === 'station').length } };
  }

  return {
    found: true, asOf: snap.asOf, lines, spans, towers, stations, transformers, findings, labels, label, highlighted, lineName, bounds,
    counts: { towers: towers.length, poor: towers.filter((t) => t.band === 'poor').length, moderate: towers.filter((t) => t.band === 'moderate').length, none: towers.filter((t) => t.band === 'none').length },
    totalRisk: Math.round(totalRisk), scoredAssets: scored.length, riskSeries, top,
    unreviewedFindings: findings.filter((f) => f.unreviewed).length,
    select,
    empty: !towers.length && !spans.length && !stations.length,
  };
}
