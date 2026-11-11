// Small shared helpers for the scoring modules.

/** Throws unless asOf is a valid YYYY-MM-DD date. Every scoring function calls this first. */
export function assertAsOf(asOf) {
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
    throw new TypeError(`asOf must be a YYYY-MM-DD date string, got ${JSON.stringify(asOf)}`);
  }
}

export const round1 = (n) => Math.round(n * 10) / 10;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const yearsBetween = (from, to) => daysBetween(from, to) / 365.25;

/** Health band for an HI. null stays null (not assessed). */
export function healthBand(hi, config) {
  if (hi === null || hi === undefined) return null;
  if (hi >= config.bands.normalMin) return 'normal';
  if (hi < config.bands.poorBelow) return 'poor';
  return 'moderate';
}

/** Newest evidence date and whether it is older than the category's inspection interval. */
export function freshness(config, category, newestEvidenceDate, asOf) {
  const intervalDays = config.freshness.inspectionIntervalDays[category] ?? null;
  if (!newestEvidenceDate) return { newestEvidenceDate: null, ageDays: null, intervalDays, stale: null };
  const ageDays = daysBetween(newestEvidenceDate, asOf);
  return { newestEvidenceDate, ageDays, intervalDays, stale: intervalDays === null ? null : ageDays > intervalDays };
}

export const maxDate = (dates) => dates.reduce((m, d) => (m === null || d > m ? d : m), null);

export function notAssessed(asOf, reason, extra = {}) {
  return { score: null, band: null, breakdown: { assessed: false, asOf, reason, ...extra } };
}
