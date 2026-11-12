// Moving around the legacy page from the new code: open a link in the Links tab, open a registry tab with a filter on,
// or open another screen with its selection already in the URL.
//
// Each of these is a step in the browser's history, so Back returns to the screen you came from (the Dashboard, say), with
// its URL. The screen and tab are kept in history.state.rel; installBackSupport() listens for Back and Forward and shows
// that screen again. Panels and viewers already use the URL hash and are not affected.

import { VIEW_KEYS, hashFor } from './hashState.js';

/** Set by openLinkInReview, read once by the Links tab when it mounts. */
export const pendingLink = { id: null, status: null };
/** Set by openRegistryTab, read once by the category tab when it mounts: { tab, filters: { 'Health band': 'poor' } }. */
export const pendingFilters = { tab: null, filters: null };

const where = () => window.NexusReliability?.where?.() ?? null;
const here = () => location.pathname + location.search;
const noViews = () => Object.fromEntries(VIEW_KEYS.map((k) => [k, null]));
/** The hash with the screen keys and any panel taken out and the global filters kept: where the registry opens. */
const filtersOnly = () => hashFor({ asset: null, finding: null, ...noViews() }, location.hash);

/** Record the screen we are leaving on the current history entry, then add an entry for the one we are going to. */
function step(url, dest) {
  const origin = where();
  if (origin) history.replaceState({ ...(history.state ?? {}), rel: origin }, '');
  history.pushState({ rel: dest }, '', url);
  return Boolean(window.NexusReliability?.go(dest.screen, dest.tab ?? undefined));
}

/** Switch to Asset Registry > Links with this link selected. Returns false if the page cannot navigate. */
export function openLinkInReview(linkId, status = 'proposed') {
  pendingLink.id = linkId;
  pendingLink.status = status;
  return step(here() + filtersOnly(), { screen: 'registry', tab: 'Links' });
}

/** Switch to Asset Registry > <tab> with filters on (by the label of each filter select). */
export function openRegistryTab(tab, filters = {}) {
  pendingFilters.tab = tab;
  pendingFilters.filters = filters;
  return step(here() + filtersOnly(), { screen: 'registry', tab, filters });
}

/** Switch to a screen with its selection in the URL: openScreen('lines', null, { line: 'L-132-01' }). Keys not given are cleared. */
export function openScreen(screenId, tabName = null, keys = {}, view = { home: 'dashboard' }[screenId] ?? screenId) {
  const next = { ...noViews(), ...keys, view };
  return step(here() + hashFor({ asset: null, finding: null, ...next }, location.hash), { screen: screenId, tab: tabName });
}

/** Back and Forward show the screen recorded on the history entry they land on. Call once. */
export function installBackSupport() {
  window.addEventListener('popstate', (e) => {
    const rel = e.state?.rel;
    if (!rel) return;
    const now = where();
    if (now && now.screen === rel.screen && (rel.tab == null || rel.tab === now.tab)) return;
    if (rel.filters) { pendingFilters.tab = rel.tab; pendingFilters.filters = rel.filters; }
    window.NexusReliability?.go(rel.screen, rel.tab ?? undefined);
  });
}
