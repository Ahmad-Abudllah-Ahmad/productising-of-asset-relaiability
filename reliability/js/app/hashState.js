// The URL hash holds the state of the two overlays:
//   #asset=<id>                      the Asset 360 panel
//   #finding=<id>[&mode=thermal]     the finding viewer (mode: rgb by default, thermal or compare)
//   #asset=<id>&finding=<id>         the viewer opened from inside the panel
// A link with that hash opens the same thing. Pure functions; assetPanel.js and findingViewer.js do the listening.
//
// The Line Health and Tower Health screens keep their selection in the same hash, next to the overlays:
//   view=lines|towers|history|map   line=<line id>  tower=<tower id>  band=normal|moderate|poor|none
//   view=dashboard (no other keys)   sev=urgent|critical|serious|moderate|minor (history, Open findings tab)
//   unit=<asset id> (history)  show=ineffective  status=<work order status>  layers=lines,towers,...  label=<label id> (map)
// Opening or closing a panel keeps those keys, and changing them keeps the panel keys.
// The global filters (flabel, fkv, fcat, asof; see scope.js) are in every hash: hashFor keeps them from the current hash unless the state
// sets them (null removes one), and screen changes never clear them.

import { SCOPE_KEYS } from './scope.js';

const MODES = new Set(['rgb', 'thermal', 'compare']);

/** @returns {{asset: string|null, finding: string|null, mode: 'rgb'|'thermal'|'compare'}} */
export function parseHash(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const mode = params.get('mode');
  return { asset: params.get('asset') || null, finding: params.get('finding') || null, mode: MODES.has(mode) ? mode : 'rgb' };
}

/** The screens that keep a selection in the hash, and the keys they use (each screen uses some of them). */
export const VIEW_KEYS = ['view', 'line', 'tower', 'band', 'unit', 'show', 'status', 'layers', 'label', 'sev'];
const VIEWS = new Set(['lines', 'towers', 'history', 'map', 'dashboard']);

/** @returns {Record<string, string|null>} view is one of lines, towers, history, map or null; the other keys are strings or null */
export function parseView(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const view = params.get('view');
  return Object.fromEntries(VIEW_KEYS.map((k) => [k, k === 'view' ? (VIEWS.has(view) ? view : null) : (params.get(k) || null)]));
}

/**
 * The hash for a state. Nothing open: an empty string. The default mode is left out.
 * The screen keys (view, line, tower, band) are taken from the state when it has them (null removes one);
 * otherwise they are kept from `current`, the hash as it is now.
 */
export function hashFor(state = {}, current = typeof location === 'undefined' ? '' : location.hash) {
  const { asset = null, finding = null, mode = 'rgb' } = state;
  const parts = [];
  if (asset) parts.push(`asset=${encodeURIComponent(asset)}`);
  if (finding) {
    parts.push(`finding=${encodeURIComponent(finding)}`);
    if (mode && mode !== 'rgb' && MODES.has(mode)) parts.push(`mode=${mode}`);
  }
  const kept = parseView(current);
  for (const k of VIEW_KEYS) {
    const v = k in state ? state[k] : kept[k];
    if (v) parts.push(`${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`); // commas stay readable (layers=spans,towers)
  }
  const keptScope = new URLSearchParams(String(current).replace(/^#/, ''));
  for (const k of SCOPE_KEYS) {
    const v = k in state ? state[k] : keptScope.get(k);
    if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `#${parts.join('&')}` : '';
}
