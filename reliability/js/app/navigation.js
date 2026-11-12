// Moving around the legacy page from the new code: open a link in the Links tab, open a registry tab with a filter on,
// or open another screen with its selection already in the URL.

import { VIEW_KEYS, hashFor, parseHash } from './hashState.js';

/** Set by openLinkInReview, read once by the Links tab when it mounts. */
export const pendingLink = { id: null, status: null };

/** Switch to Asset Registry > Links with this link selected. Returns false if the page cannot navigate. */
export function openLinkInReview(linkId, status = 'proposed') {
  pendingLink.id = linkId;
  pendingLink.status = status;
  return Boolean(window.NexusReliability?.go('registry', 'Links'));
}

/** Set by openRegistryTab, read once by the category tab when it mounts: { tab, filters: { 'Health band': 'poor' } }. */
export const pendingFilters = { tab: null, filters: null };

/** Switch to Asset Registry > <tab> with filters on (by the label of each filter select). */
export function openRegistryTab(tab, filters = {}) {
  pendingFilters.tab = tab;
  pendingFilters.filters = filters;
  return Boolean(window.NexusReliability?.go('registry', tab));
}

/** Switch to a screen with its selection in the URL: openScreen('lines', null, { line: 'L-132-01' }). Keys not given are cleared. */
export function openScreen(screenId, tabName = null, keys = {}, view = { home: 'dashboard' }[screenId] ?? screenId) {
  const next = Object.fromEntries(VIEW_KEYS.map((k) => [k, null]));
  Object.assign(next, keys, { view });
  history.replaceState(null, '', location.pathname + location.search + hashFor({ ...parseHash(location.hash), ...next }));
  return Boolean(window.NexusReliability?.go(screenId, tabName ?? undefined));
}
