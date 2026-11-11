// Reliability page entry. Loads the data layer, builds the snapshot the registry reads, and opens Module 01 in the
// NEXUS Console shell: the Asset Registry tabs (registryTabs.js) plus the reliability screens (workspace.js).
// The legacy bundle is still loaded for its rendering kit (KPI cards, tags), which the registry tabs reuse.
//
// Demo and test switches in the query string:  ?delay=800 slows the Link Review load,  ?fail=1 makes it fail once;
// ?paneldelay=1200 slows the asset panel,  ?panelfail=1 makes its first load fail;
// ?viewerdelay=1200 and ?viewerfail=1 do the same for the finding viewer.

import { repository } from '../data/repository.js';
import { loadSnapshot } from './snapshot.js';
import { createRegistryTabs } from './registryTabs.js';
import { initAssetPanel, openAsset } from './assetPanel.js';
import { initFindingViewer, openFinding } from './findingViewer.js';
import { mountApp, ui, esc } from '/assets/console/console.js';
import { loadNetwork } from '/assets/console/network.js';
import { buildScreens } from './workspace.js';

const query = new URLSearchParams(location.search);
const flags = { delay: Number(query.get('delay')) || 0, fail: query.get('fail') === '1', panelDelay: Number(query.get('paneldelay')) || 0, panelFail: query.get('panelfail') === '1', viewerDelay: Number(query.get('viewerdelay')) || 0, viewerFail: query.get('viewerfail') === '1' };

const state = { snapshot: null };
const listeners = new Set();
const subscribeSnapshot = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

async function refresh() {
  state.snapshot = await loadSnapshot(repository);
  for (const fn of [...listeners]) { try { fn(); } catch { /* a bad listener must not stop the others */ } }
}

const NR = window.NexusReliability || {};
window.NexusReliability = NR;
let app = null;
NR.go = (screenId, tabName) => Boolean(app?.go(screenId, tabName));
NR.openAsset = openAsset;   // any screen can open an asset's panel
NR.openFinding = openFinding; // ... or a finding's viewer

try {
  await refresh();
  repository.subscribe(refresh);
  const net = await loadNetwork();
  const registryTabs = createRegistryTabs({ kit: NR.kit, repo: repository, getSnapshot: () => state.snapshot, subscribeSnapshot, flags });
  const { screens } = buildScreens(net, { registryTabs, openAsset: (id) => openAsset(id), openFinding: (id) => openFinding(id), go: (s, t) => app?.go(s, t) });
  app = mountApp({
    id: 'reliability', code: '01', product: 'Asset Reliability Intelligence', back: '/#module-card-01', asOf: net.asOf, screens,
    searchIndex: () => net.searchIndex.filter((x) => x.kind !== 'crew').map((x) => ({ ...x, run: () => (x.kind === 'wo' ? app.go('history', 0) : x.kind === 'line' ? app.go('line', 0) : openAsset(x.id)) })),
  });
  const deps = { repo: repository, getSnapshot: () => state.snapshot, subscribeSnapshot, flags };
  initAssetPanel(deps);
  initFindingViewer(deps);
} catch (error) {
  console.error('Reliability: could not open the workspace', error);
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">${ui.callout(`The reliability workspace could not be loaded: ${esc(error.message)}`, 'crit', 'alert')}</div>`;
}
