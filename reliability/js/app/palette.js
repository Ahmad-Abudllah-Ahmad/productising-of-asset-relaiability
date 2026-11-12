// The one condition palette. Condition 1 (very poor) to 5 (very good), the three health bands, the four severities and the
// four risk bands all use the same five fills (--rel-cond-1 .. --rel-cond-5 and --rel-cond-n in reliability.css), with text
// (a number or a word) on every fill and an outline, so colour is never the only signal. These maps give the CSS class of a
// tag for each of them; nothing else in the app picks a colour for a condition.

export const COND_TAG = (n) => (n === null || n === undefined ? 'cond-n' : `cond-${Math.min(5, Math.max(1, Math.round(n)))}`);
/** Health band to tag class: poor is condition 1, moderate 3, normal 5, not assessed grey. */
export const BAND_TAG = Object.freeze({ poor: 'cond-1', moderate: 'cond-3', normal: 'cond-5', none: 'cond-n' });
/** Severity (condition 1 to 4) to tag class. */
export const SEV_TAG = Object.freeze({ critical: 'cond-1', serious: 'cond-2', moderate: 'cond-3', minor: 'cond-4', none: 'cond-5' });
/** Risk band to tag class: critical is the worst fill, low the best. */
export const RISK_TAG = Object.freeze({ critical: 'cond-1', high: 'cond-2', medium: 'cond-3', low: 'cond-5' });
