// Reliability page entry. Loads the data layer, builds the snapshot the registry reads, and opens the page
// with the new Asset Registry tabs. If anything fails, the page still opens; the registry tab then says
// it could not be loaded (see the fallback tab in the legacy bundle).
//
// Demo and test switches in the query string:  ?delay=800 slows the Link Review load,  ?fail=1 makes it fail once.

import { repository } from '../data/repository.js';
import { loadSnapshot } from './snapshot.js';
import { createRegistryTabs } from './registryTabs.js';

const query = new URLSearchParams(location.search);
const flags = { delay: Number(query.get('delay')) || 0, fail: query.get('fail') === '1' };

const state = { snapshot: null };
const listeners = new Set();

async function refresh() {
  state.snapshot = await loadSnapshot(repository);
  for (const fn of [...listeners]) { try { fn(); } catch { /* a bad listener must not stop the others */ } }
}

try {
  await refresh();
  repository.subscribe(refresh);
  const tabs = createRegistryTabs({
    kit: window.NexusReliability.kit,
    repo: repository,
    getSnapshot: () => state.snapshot,
    subscribeSnapshot: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    flags,
  });
  window.NexusReliability.open('reliability', { screens: { registry: { tabs } } });
} catch (error) {
  console.error('Reliability: could not build the registry', error);
  window.NexusReliability.open('reliability');
}
