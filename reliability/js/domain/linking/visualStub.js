// =====================================================================================
// STUB: VISUAL SIMILARITY. REPLACE WITH MUSHARRAF'S MODEL.
//
// This is NOT an image model. It compares the seeded 8-number feature vectors that the seed
// attaches to each finding (see seed.js, "STUB visual features"). Those vectors only imitate
// what an image embedding would give: sightings of the same defect look alike, others do not.
//
// To plug in the real model, keep this signature:
//     visualSimilarity(featuresA, featuresB, config) -> number in [0, 1], or null when unavailable
// and make the `features` lookup passed to scorePair() return real embeddings.
// =====================================================================================

import { CONFIG } from '../config.js';

export const VISUAL_IS_STUB = true;

/** Cosine similarity mapped to 0-1 through the configured min/full cosines. */
export function visualSimilarity(a, b, config = CONFIG) {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return null;
  const cos = dot / Math.sqrt(na * nb);
  const { minCosine, fullCosine } = config.linking.resemblance.visual;
  return Math.max(0, Math.min(1, (cos - minCosine) / (fullCosine - minCosine)));
}
