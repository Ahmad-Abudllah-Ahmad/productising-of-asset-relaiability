// The Asset 360 panel lives in the URL hash: #asset=<asset id>. A link with that hash opens the same asset.
// Pure functions; assetPanel.js does the listening.

/** @returns {{asset: string|null}} */
export function parseHash(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  return { asset: params.get('asset') || null };
}

/** The hash for a state. No asset: an empty string. */
export function hashFor({ asset = null } = {}) {
  return asset ? `#asset=${encodeURIComponent(asset)}` : '';
}
