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

const query = new URLSearchParams(location.search);
const flags = { delay: Number(query.get('delay')) || 0, fail: query.get('fail') === '1', panelDelay: Number(query.get('paneldelay')) || 0, panelFail: query.get('panelfail') === '1', viewerDelay: Number(query.get('viewerdelay')) || 0, viewerFail: query.get('viewerfail') === '1', healthDelay: Number(query.get('healthdelay')) || 0, healthFail: query.get('healthfail') === '1' };

const state = { snapshot: null };
const listeners = new Set();

async function refresh() {
  state.snapshot = await loadSnapshot(repository);
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
  window.NexusReliability.open('reliability', { screens: { registry: { tabs }, lines: health.lines, towers: health.towers, history: createHistoryScreen(screenDeps), map: createMapScreen(screenDeps), home: createDashboardScreen(screenDeps) } });
  const wanted = parseView(location.hash).view; // a link such as #view=towers&tower=TWR-132-01-011 opens that screen
  if (wanted) window.NexusReliability.go(wanted === 'dashboard' ? 'home' : wanted);
  window.NexusReliability.openAsset = openAsset; // any screen can open an asset's panel
  window.NexusReliability.openFinding = openFinding; // ... or a finding's viewer
  const deps = { repo: repository, getSnapshot: () => state.snapshot, subscribeSnapshot: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, flags };
  initAssetPanel(deps);
  initFindingViewer(deps);
  initTheme();
} catch (error) {
  console.error('Reliability: could not build the registry', error);
  window.NexusReliability.open('reliability');
}
