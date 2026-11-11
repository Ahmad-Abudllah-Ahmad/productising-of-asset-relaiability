// One entry point for "the HI of this asset": picks the right scorer by asset class.

import { assertAsOf, notAssessed } from './common.js';
import { towerHi, spanHi, lineHi } from './lineHi.js';
import { transformerHi } from './txHi.js';

/**
 * @returns {import('../types.js').ScoreResult}
 */
export function healthIndex(ctx, assetId, asOf) {
  assertAsOf(asOf);
  const a = ctx.asset(assetId);
  if (!a) return notAssessed(asOf, 'unknown asset');
  switch (a.class) {
    case 'tower': return towerHi(ctx, assetId, asOf);
    case 'span': return spanHi(ctx, assetId, asOf);
    case 'line': return lineHi(ctx, assetId, asOf);
    case 'power_transformer': return transformerHi(ctx, assetId, asOf);
    default: return notAssessed(asOf, `no health index defined for class ${a.class} yet`);
  }
}
