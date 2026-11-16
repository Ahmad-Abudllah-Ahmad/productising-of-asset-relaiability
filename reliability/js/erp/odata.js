// OData V2 helpers for the mock SAP adapter and the converter. SAP S/4HANA's classic OData services answer
// { d: { results: [...] } } and write dates as "/Date(1699660800000)/".

export const wrap = (results) => ({ d: { results } });
export const results = (raw) => (Array.isArray(raw) ? raw : raw?.d?.results ?? raw?.member ?? []);

export const toODataDate = (iso) => (iso ? `/Date(${Date.parse(`${iso}T00:00:00Z`)})/` : null);
export function fromODataDate(v) {
  if (!v) return null;
  const m = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(String(v));
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null; // already an ISO date (Maximo)
}
