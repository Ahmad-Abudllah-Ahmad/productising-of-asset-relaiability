// Reliability page entry. Loads the data layer, builds the snapshot the registry reads, and opens the page
// with the new Asset Registry tabs. If anything fails, the page still opens; the registry tab then says
// it could not be loaded (see the fallback tab in the legacy bundle).
//
// Demo and test switches in the query string:  ?delay=800 slows the Link Review load,  ?fail=1 makes it fail once;
// ?paneldelay=1200 slows the asset panel,  ?panelfail=1 makes its first load fail;
// ?viewerdelay=1200 and ?viewerfail=1 do the same for the finding viewer;
// ?healthdelay=1200 and ?healthfail=1 do the same for Line Health and Tower Health.

import { repository } from '../data/repository.js';
import { loadSnapshot } from './snapshot.js';
import { createRegistryTabs } from './registryTabs.js';
import { initAssetPanel, openAsset } from './assetPanel.js';
import { initFindingViewer, openFinding } from './findingViewer.js';
import { initTheme } from './theme.js';
import { createHealthScreens } from './healthScreens.js';
import { createHistoryScreen } from './historyScreens.js';
import { createMapScreen } from './mapScreen.js';
import { createDashboardScreen } from './dashboardScreen.js';
import { parseView } from './hashState.js';
import { installBackSupport } from './navigation.js';
import { parseScope } from './scope.js';
import { createFilterBar, SCOPE_EVENT } from './filterBar.js';
import { managedLabels } from '../domain/labels.js';
import { AS_OF } from './snapshot.js';

const query = new URLSearchParams(location.search);
const flags = { delay: Number(query.get('delay')) || 0, fail: query.get('fail') === '1', panelDelay: Number(query.get('paneldelay')) || 0, panelFail: query.get('panelfail') === '1', viewerDelay: Number(query.get('viewerdelay')) || 0, viewerFail: query.get('viewerfail') === '1', healthDelay: Number(query.get('healthdelay')) || 0, healthFail: query.get('healthfail') === '1' };

const state = { snapshot: null };
const listeners = new Set();

// the global filters (scope.js): read from the hash, applied by the snapshot
const campaigns = await repository.getCampaigns();
const limits = { first: campaigns.map((c) => c.start).sort()[0] ?? AS_OF, last: AS_OF };
const labels = managedLabels();
const currentScope = () => parseScope(location.hash, { ...limits, labels: labels.map((l) => l.label_id) });
const scopeKey = (sc) => JSON.stringify([sc.label, sc.kv, sc.category, sc.asOf]);
let applied = scopeKey(currentScope());
let serial = 0;

async function refresh() {
  const mine = ++serial;
  const sc = currentScope();
  const snap = await loadSnapshot(repository, sc.asOf ?? AS_OF, sc);
  if (mine !== serial) return; // a newer refresh is on its way
  state.snapshot = snap;
  applied = scopeKey(sc);
  for (const fn of [...listeners]) { try { fn(); } catch { /* a bad listener must not stop the others */ } }
}

try {
  await refresh();
  repository.subscribe(refresh);
  const screenDeps = {
    kit: window.NexusReliability.kit,
    repo: repository,
    getSnapshot: () => state.snapshot,
    subscribeSnapshot: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    flags,
  };
  const tabs = createRegistryTabs(screenDeps);
  const health = createHealthScreens(screenDeps);
  const landing = location.hash;
  const bar = createBar(); // the filter bar goes in before any screen draws, so no screen is moved after it was laid out // the first screen (the dashboard) clears other screens' keys when it mounts, so keep the link as it came
  window.NexusReliability.open('reliability', { screens: { registry: { tabs }, lines: health.lines, towers: health.towers, history: createHistoryScreen(screenDeps), map: createMapScreen(screenDeps), home: createDashboardScreen(screenDeps) } });
  bar.install();
  const wanted = parseView(landing).view; // a link such as #view=towers&tower=TWR-132-01-011 opens that screen
  if (wanted && wanted !== 'dashboard') {
    history.replaceState(history.state, '', location.pathname + location.search + landing);
    window.NexusReliability.go(wanted);
  } else if (wanted === 'dashboard') history.replaceState(history.state, '', location.pathname + location.search + landing);
  window.NexusReliability.openAsset = openAsset; // any screen can open an asset's panel
  window.NexusReliability.openFinding = openFinding; // ... or a finding's viewer
  const deps = { repo: repository, getSnapshot: () => state.snapshot, subscribeSnapshot: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, flags };
  initAssetPanel(deps);
  initFindingViewer(deps);
  initTheme();
  installBackSupport();
} catch (error) {
  console.error('Reliability: could not build the registry', error);
  window.NexusReliability.open('reliability');
}

/** The filter bar sits under the top bar; the legacy shell rebuilds the page on open, so it is put back if it is gone. */
function createBar() {
  const bar = createFilterBar({ labels: labels.map((l) => ({ id: l.label_id, kind: l.kind, value: l.value })), limits, getScope: currentScope });
  const sync = () => bar.sync(currentScope(), { onDrawing: window.NexusReliability.where?.()?.screen === 'drawing' });
  const place = () => {
    const work = document.querySelector('main.work');
    if (work && !work.contains(bar.root)) work.insertBefore(bar.root, document.getElementById('stage'));
    sync();
  };
  const install = () => {
    place();
    new MutationObserver(place).observe(document.body, { childList: true });
    new MutationObserver(sync).observe(document.getElementById('app-title'), { childList: true, subtree: true, characterData: true }); // the screen changed
  };
  const apply = async () => {
    if (scopeKey(currentScope()) === applied) { sync(); return; }
    await refresh();
    sync();
    const at = window.NexusReliability.where?.();
    if (at && at.screen === 'registry') window.NexusReliability.go(at.screen, at.tab); // the registry draws once from the snapshot, so draw it again
  };
  window.addEventListener(SCOPE_EVENT, apply);
  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);
  return { install };
}
