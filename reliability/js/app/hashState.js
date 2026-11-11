// The URL hash holds the state of the two overlays:
//   #asset=<id>                      the Asset 360 panel
//   #finding=<id>[&mode=thermal]     the finding viewer (mode: rgb by default, thermal or compare)
//   #asset=<id>&finding=<id>         the viewer opened from inside the panel
// A link with that hash opens the same thing. Pure functions; assetPanel.js and findingViewer.js do the listening.

const MODES = new Set(['rgb', 'thermal', 'compare']);

/** @returns {{asset: string|null, finding: string|null, mode: 'rgb'|'thermal'|'compare'}} */
export function parseHash(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const mode = params.get('mode');
  return { asset: params.get('asset') || null, finding: params.get('finding') || null, mode: MODES.has(mode) ? mode : 'rgb' };
}

/** The hash for a state. Nothing open: an empty string. The default mode is left out. */
export function hashFor({ asset = null, finding = null, mode = 'rgb' } = {}) {
  const parts = [];
  if (asset) parts.push(`asset=${encodeURIComponent(asset)}`);
  if (finding) {
    parts.push(`finding=${encodeURIComponent(finding)}`);
    if (mode && mode !== 'rgb' && MODES.has(mode)) parts.push(`mode=${mode}`);
  }
  return parts.length ? `#${parts.join('&')}` : '';
}
