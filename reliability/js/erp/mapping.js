// Field mapping: a small interpreter for mapping/<adapter>.json. The mapping is data, so a customer's field names and number ranges
// change a JSON file, not code. See the note at the top of mapping/sap.json for the spec forms.

import { fromODataDate } from './odata.js';

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

const TRANSFORMS = {
  string: (v) => (blank(v) ? null : String(v).trim()),
  number: (v) => (blank(v) ? null : Number(v)),
  date: (v) => fromODataDate(v),
  list: (v) => (blank(v) ? [] : String(v).split(',').map((x) => x.trim()).filter(Boolean)),
  nonEmpty: (v) => !blank(v),
};

function matches(when, row) {
  const v = row[when.field];
  if (when.nonEmpty !== undefined && blank(v) === when.nonEmpty) return false;
  if (when.equals !== undefined && v !== when.equals) return false;
  if (when.in && !when.in.includes(v)) return false;
  return (when.allOf ?? []).every((w) => matches(w, row));
}

/** Evaluate one field spec against one raw row. `ctx` carries the warehouse table of the mapping. */
export function evalSpec(spec, row, ctx = {}) {
  if (typeof spec === 'string') return TRANSFORMS.string(row[spec]);
  if ('const' in spec) return spec.const;
  if (spec.rules && !spec.transform) {
    for (const r of spec.rules) if (matches(r.when, row)) return evalSpec(r.value, row, ctx);
    return evalSpec(spec.default ?? { const: null }, row, ctx);
  }
  if (spec.switch) return evalSpec(spec.cases?.[row[spec.switch]] ?? spec.default, row, ctx);
  if (spec.template) {
    if (spec.emptyIfBlank && blank(row[spec.emptyIfBlank])) return null;
    return spec.template.replace(/\{(\w+)\}/g, (_, k) => String(row[k] ?? ''));
  }
  const v = row[spec.from];
  switch (spec.transform) {
    case 'regex': { const s = String(v ?? ''); for (const r of spec.rules) { const re = new RegExp(r.pattern); if (re.test(s)) return s.replace(re, r.template); } return null; }
    case 'map': return blank(v) ? (spec.default ?? null) : (spec.map[String(v)] ?? spec.default ?? null);
    case 'plant': return spec.emptyIfBlank && blank(row[spec.emptyIfBlank]) ? null : (ctx.warehouses?.[String(v)]?.id ?? null);
    case 'nested': return (Array.isArray(v) ? v : []).map((x) => mapRow(x, spec.fields, ctx));
    default: return (TRANSFORMS[spec.transform ?? 'string'] ?? TRANSFORMS.string)(v);
  }
}

export function mapRow(row, fields, ctx = {}) {
  const out = {};
  for (const [k, spec] of Object.entries(fields)) out[k] = evalSpec(spec, row, ctx);
  return out;
}

export const mapRows = (rows, fields, ctx) => rows.map((r) => mapRow(r, fields, ctx));
