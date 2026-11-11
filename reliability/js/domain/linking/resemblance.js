// Resemblance matching: how likely are two records to be the same thing?
//
//   scorePair(a, b, options) -> { score, reasons[], comparable, notes[] }
//
// a and b are both assets (duplicate records of one physical asset) or both findings (sightings of the
// same physical defect in different campaigns). Four signals, each 0-1, combined as a weighted mean of
// the signals that exist for the pair:
//
//   identifier  names, serials, external ids (assets); resolved component / tower (findings)
//   attribute   class, voltage, install year, criticality, labels, extra fields (assets); condition, sensor (findings)
//   spatial     distance between the two locations; beyond the gate the pair is not comparable
//   visual      STUB. Seeded feature vectors, not an image model. See visualStub.js.
//
// Every reason carries its value, its weight and its contribution to the score, so a person can see why.
// This module never reads ground truth. It knows nothing about how the seed was built.

import { CONFIG } from '../config.js';
import { distM, anchorOf } from './geo.js';
import { visualSimilarity } from './visualStub.js';

export const isFinding = (r) => r && typeof r === 'object' && 'finding_id' in r;
export const idOf = (r) => (isFinding(r) ? r.finding_id : r.asset_id);

const r3 = (n) => Math.round(n * 1000) / 1000;
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// ---------------------------------------------------------------- names

/** Lower-case, expand abbreviations, join prefix and number, drop leading zeros: "Tower 014" and "T-14" both give "t14". */
export function normalizeName(name) {
  let s = String(name ?? '').toLowerCase();
  s = s.replace(/\btower\b/g, 't').replace(/\btransformer\b/g, 'tx').replace(/\bstr\./g, 'string');
  s = s.replace(/([a-z]+)[\s-]+(\d)/g, '$1$2');
  s = s.replace(/\d+/g, (d) => String(parseInt(d, 10)));
  return s;
}
const tokens = (name) => normalizeName(name).split(/[^a-z0-9]+/).filter(Boolean);

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i += 1) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
}
function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  for (const [k, n] of A) shared += Math.min(n, B.get(k) ?? 0);
  const total = Math.max(1, a.length - 1) + Math.max(1, b.length - 1);
  return (2 * shared) / total;
}

/** Same tokens: equal. A differing short or numeric token (string A vs B, TX-2A vs TX-2B): distinct. Otherwise fuzzy. */
export function nameSimilarity(nameA, nameB) {
  const ta = tokens(nameA);
  const tb = tokens(nameB);
  if (ta.join(' ') === tb.join(' ')) return { kind: 'equal', value: 1 };
  const diff = [...ta.filter((t) => !tb.includes(t)), ...tb.filter((t) => !ta.includes(t))];
  if (diff.some((t) => /\d/.test(t) || t.length <= 3)) return { kind: 'distinct', value: 0.15, diff };
  return { kind: 'fuzzy', value: dice(ta.join(''), tb.join('')) * 0.7 };
}

// ------------------------------------------------------------ assets

function identifierAsset(a, b, rc) {
  const sharedExt = Object.keys(a.external_ids ?? {}).filter((k) => a.external_ids[k] && a.external_ids[k] === b.external_ids?.[k]);
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const serialMatch = a.ext?.serial && b.ext?.serial && norm(a.ext.serial) === norm(b.ext.serial);
  const name = nameSimilarity(a.name, b.name);
  const strong = sharedExt.length > 0 || serialMatch;
  let value = name.kind === 'equal' ? rc.nameOnlyIdentifierScore : name.value;
  const parts = [`names "${a.name}" / "${b.name}": ${name.kind}`];
  if (sharedExt.length) { value = 1; parts.push(`same ${sharedExt.join(', ')} id ${a.external_ids[sharedExt[0]]}`); }
  if (serialMatch) { value = 1; parts.push(`same serial ${a.ext.serial} / ${b.ext.serial}`); }
  return { value, distinct: !strong && name.kind === 'distinct', detail: parts.join('; ') };
}

function attributeAsset(a, b) {
  const items = [];
  const note = [];
  const add = (label, v, text) => { items.push(v); note.push(`${label}: ${text}`); };
  if (a.voltage_kv != null && b.voltage_kv != null) add('voltage', a.voltage_kv === b.voltage_kv ? 1 : 0, `${a.voltage_kv} / ${b.voltage_kv} kV`);
  if (a.install_date && b.install_date) {
    const dy = Math.abs(Number(a.install_date.slice(0, 4)) - Number(b.install_date.slice(0, 4)));
    add('install year', dy === 0 ? 1 : dy === 1 ? 0.5 : 0, `${a.install_date.slice(0, 4)} / ${b.install_date.slice(0, 4)}`);
  }
  const dc = Math.abs(a.criticality - b.criticality);
  add('criticality', dc === 0 ? 1 : dc === 1 ? 0.5 : 0, `${a.criticality} / ${b.criticality}`);
  const la = a.labels.filter((l) => !l.startsWith('failure_mode:'));
  const lb = b.labels.filter((l) => !l.startsWith('failure_mode:'));
  const union = new Set([...la, ...lb]).size;
  if (union) add('labels', la.filter((l) => lb.includes(l)).length / union, 'label overlap');
  const skip = new Set(['serial', 'oil', 'electrical_tests', 'loading_pct_12m']);
  for (const k of Object.keys(a.ext ?? {})) {
    if (skip.has(k) || !(k in (b.ext ?? {}))) continue;
    const x = a.ext[k];
    const y = b.ext[k];
    if (x === null || y === null || typeof x === 'object' || typeof y === 'object') continue;
    const same = typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 0.05 * Math.max(Math.abs(x), Math.abs(y), 1e-9) : x === y;
    add(k, same ? 1 : 0, `${x} / ${y}`);
  }
  return { value: items.length ? mean(items) : null, detail: note.join('; ') };
}

const pointOf = anchorOf;

function spatial(a, b, gate) {
  const pa = pointOf(a);
  const pb = pointOf(b);
  if (!pa || !pb) return null;
  const d = distM(pa, pb);
  if (d > gate) return { gated: true, distance: d };
  return { value: 1 - (d / gate) ** 2, distance: d };
}

// ---------------------------------------------------------- findings

const resolved = (f) => !f.component_hint;

function identifierFinding(a, b) {
  if (resolved(a) && resolved(b)) {
    return a.asset_id === b.asset_id
      ? { value: 1, distinct: false, detail: `both recorded on ${a.asset_id}` }
      : { value: 0, distinct: true, detail: `recorded on different assets: ${a.asset_id} / ${b.asset_id}` };
  }
  if (a.tower_id && a.tower_id === b.tower_id) {
    return { value: 0.6, distinct: false, detail: `same tower ${a.tower_id}; one sighting is not resolved to a component` };
  }
  return { value: 0, distinct: true, detail: `different towers: ${a.tower_id} / ${b.tower_id}` };
}

function attributeFinding(a, b) {
  const dc = Math.abs(a.condition_score - b.condition_score);
  const cond = dc === 0 ? 1 : dc === 1 ? 0.75 : dc === 2 ? 0.4 : 0;
  const sensor = a.sensor === b.sensor ? 1 : 0.5;
  return { value: mean([cond, sensor, 1]), detail: `same defect class ${a.defect_class}; condition ${a.condition_score} / ${b.condition_score}; sensor ${a.sensor} / ${b.sensor}` };
}

// ------------------------------------------------------------- score

const notComparable = (reason) => ({ score: 0, comparable: false, reasons: [{ signal: 'gate', value: 0, weight: 0, contribution: 0, detail: reason }], notes: [reason] });

/**
 * @param {import('../types.js').Asset|import('../types.js').Finding} a
 * @param {import('../types.js').Asset|import('../types.js').Finding} b
 * @param {{config?: typeof CONFIG, features?: (id: string) => number[]|null|undefined}} [options]
 *   features: lookup of visual feature vectors by finding id (STUB data, or real embeddings later)
 * @returns {{score:number, comparable:boolean, reasons:Array<{signal:string,value:number,weight:number,contribution:number,detail:string}>, notes:string[]}}
 */
export function scorePair(a, b, options = {}) {
  const config = options.config ?? CONFIG;
  const rc = config.linking.resemblance;
  const kind = isFinding(a) ? 'finding' : 'asset';
  if (isFinding(b) !== (kind === 'finding')) return notComparable('an asset and a finding cannot be compared');
  if (idOf(a) === idOf(b)) return notComparable('same record');

  const signals = [];
  let distinct = null;
  if (kind === 'asset') {
    if (a.merged_into || b.merged_into) return notComparable('one record is already merged');
    if (a.class !== b.class) return notComparable(`different classes: ${a.class} / ${b.class}`);
    const sp = spatial(a, b, rc.spatialGateMeters.asset);
    if (sp?.gated) return notComparable(`${sp.distance.toFixed(0)} m apart, beyond the ${rc.spatialGateMeters.asset} m gate`);
    const id = identifierAsset(a, b, rc);
    if (id.distinct) distinct = id.detail;
    signals.push({ signal: 'identifier', value: id.value, detail: id.detail });
    const at = attributeAsset(a, b);
    signals.push({ signal: 'attribute', value: at.value, detail: at.detail });
    signals.push({ signal: 'spatial', value: sp ? sp.value : null, detail: sp ? `${sp.distance.toFixed(1)} m apart` : 'no point location' });
  } else {
    if (a.defect_class !== b.defect_class) return notComparable(`different defect classes: ${a.defect_class} / ${b.defect_class}`);
    if (a.campaign_id === b.campaign_id) return notComparable('same campaign: a defect is sighted once per campaign');
    const sp = spatial(a, b, rc.spatialGateMeters.finding);
    if (sp?.gated) return notComparable(`${sp.distance.toFixed(0)} m apart, beyond the ${rc.spatialGateMeters.finding} m gate`);
    const id = identifierFinding(a, b);
    if (id.distinct) distinct = id.detail;
    signals.push({ signal: 'identifier', value: id.value, detail: id.detail });
    const at = attributeFinding(a, b);
    signals.push({ signal: 'attribute', value: at.value, detail: at.detail });
    signals.push({ signal: 'spatial', value: sp ? sp.value : null, detail: sp ? `${sp.distance.toFixed(1)} m apart` : 'no location' });
    const fa = options.features?.(a.finding_id);
    const fb = options.features?.(b.finding_id);
    const vis = visualSimilarity(fa, fb, config);
    signals.push({ signal: 'visual', value: vis, detail: vis === null ? 'no features' : 'STUB: seeded feature vectors, not an image model' });
  }

  const weights = rc.weights[kind];
  const present = signals.filter((s) => s.value !== null && s.value !== undefined);
  const wSum = present.reduce((s, x) => s + weights[x.signal], 0);
  const reasons = present.map((s) => ({
    signal: s.signal, value: r3(s.value), weight: weights[s.signal], contribution: r3((weights[s.signal] * s.value) / wSum), detail: s.detail,
  }));
  let score = reasons.reduce((s, r) => s + r.contribution, 0);
  const notes = [];
  if (distinct && score > rc.distinctIdentifierCap) {
    notes.push(`Capped at ${rc.distinctIdentifierCap}: identifiers differ (${distinct})`);
    score = rc.distinctIdentifierCap;
  }
  return { score: r3(score), comparable: true, reasons, notes };
}
