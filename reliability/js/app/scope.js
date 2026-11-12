// The global filters of the page: a label, a voltage, a category and an "as of" date. They live in the URL hash
// (flabel, fkv, fcat, asof), so they follow you from screen to screen and a link carries them.
//
//   label     a managed label, e.g. corridor:corridor-coastal; assets that carry it
//   kv        a voltage, 132 / 220 / 500; assets at that voltage
//   category  lines, towers, spans, components, substations or transformers (the registry categories)
//   asOf      a date from the first campaign to the reference date; every score, count and chart is for that date
//
// An asset is in scope when it passes every filter that is set. Scores of a container (a line's health index) stay the
// container's own: a filter picks which assets are listed and counted, it does not re-weight a line from part of its towers.
// Everything here is pure: the snapshot applies it, boot.js and the filter bar read and write it.

export const SCOPE_KEYS = Object.freeze(['flabel', 'fkv', 'fcat', 'asof']);
export const CATEGORY_OPTIONS = Object.freeze([
  ['lines', 'Lines'], ['towers', 'Towers'], ['spans', 'Spans'], ['components', 'Components'], ['substations', 'Substations'], ['transformers', 'Transformers'],
]);
const KVS = new Set([132, 220, 500]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the filters from a hash. Anything that does not make sense is dropped (an unknown category, a date outside the range).
 * @param {string} hash
 * @param {{first: string, last: string, labels?: Iterable<string>}} limits first and last "as of" dates, and the labels that exist
 * @returns {{label: string|null, kv: number|null, category: string|null, asOf: string|null}} asOf is null for "today"
 */
export function parseScope(hash = '', { first, last, labels = null } = {}) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''));
  const label = p.get('flabel');
  const kv = Number(p.get('fkv'));
  const cat = p.get('fcat');
  const asof = p.get('asof');
  const known = labels ? new Set(labels) : null;
  return {
    label: label && (!known || known.has(label)) ? label : null,
    kv: KVS.has(kv) ? kv : null,
    category: CATEGORY_OPTIONS.some(([id]) => id === cat) ? cat : null,
    asOf: asof && DATE.test(asof) && (!first || asof >= first) && (!last || asof < last) ? asof : null,
  };
}

/** The hash pairs (key, value) for a scope; unset filters are left out. */
export function scopePairs(scope) {
  const out = [];
  if (scope.label) out.push(['flabel', scope.label]);
  if (scope.kv) out.push(['fkv', String(scope.kv)]);
  if (scope.category) out.push(['fcat', scope.category]);
  if (scope.asOf) out.push(['asof', scope.asOf]);
  return out;
}

export const hasFilters = (scope) => Boolean(scope.label || scope.kv || scope.category);

/** A function that says whether an asset is in scope. `classesOf(categoryId)` gives the asset classes of a category. */
export function matcher(scope, classesOf) {
  const classes = scope.category ? new Set(classesOf(scope.category)) : null;
  return (a) => (!classes || classes.has(a.class)) && (!scope.kv || a.voltage_kv === scope.kv) && (!scope.label || a.labels.includes(scope.label));
}

/** One line for a screen's empty state: what the filters are. */
export function describeScope(scope, labelText = (id) => id) {
  const bits = [];
  if (scope.label) bits.push(`label ${labelText(scope.label)}`);
  if (scope.kv) bits.push(`${scope.kv} kV`);
  if (scope.category) bits.push(`category ${CATEGORY_OPTIONS.find(([id]) => id === scope.category)?.[1] ?? scope.category}`);
  return bits.join(', ');
}
