// How old the newest evidence behind a score is, and whether the score is stale: older than the inspection interval for its
// category (config freshness.inspectionIntervalDays, assumption A9). A stale score is still shown, greyed out and marked
// "stale", so nobody reads an old score as a current one. Ages are in days, as of the snapshot date.

/**
 * @param {{scores: Map<string, any>}} snap
 * @returns {{date: string|null, ageDays: number|null, intervalDays: number|null, stale: boolean, short: string, text: string}}
 */
export function freshnessOf(snap, id) {
  const f = snap.scores.get(id)?.hi?.breakdown?.freshness ?? null;
  if (!f || !f.newestEvidenceDate) return { date: null, ageDays: null, intervalDays: f?.intervalDays ?? null, stale: false, short: '–', text: 'No inspection evidence yet.' };
  const stale = Boolean(f.stale);
  const ago = f.ageDays === 0 ? 'today' : `${f.ageDays} day${f.ageDays === 1 ? '' : 's'} ago`;
  return {
    date: f.newestEvidenceDate, ageDays: f.ageDays, intervalDays: f.intervalDays, stale,
    short: f.ageDays === 0 ? 'today' : `${f.ageDays} d`,
    text: `Newest evidence ${f.newestEvidenceDate} (${ago})${stale ? `: older than the ${f.intervalDays}-day inspection interval, so this score is stale` : ''}.`,
  };
}

/** A small "stale" marker for text; null when the score is fresh. */
export const STALE_WORD = 'stale';
