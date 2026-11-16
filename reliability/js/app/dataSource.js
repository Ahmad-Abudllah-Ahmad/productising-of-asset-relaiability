// Which data source the page uses: the built-in demo seed, or the ERP through the integration API (/api/erp/*).
//
//   ?source=erp | ?source=seed   in the URL, for this visit only (links and tests)
//   the switch in the banner     remembered in this browser (localStorage)
//   nothing                      the seed: the page works with no server and no environment variables
//
// The browser never talks to an ERP. It asks the integration API, which holds the credentials and the field mapping, and gets
// records already converted into the dashboard's shapes. If the API cannot be reached the page falls back to the seed and says so.

export const SOURCE_KEY = 'nexus.reliability.source';
export const API_BASE = '/api/erp';

export function storedSource() {
  try { return localStorage.getItem(SOURCE_KEY) === 'erp' ? 'erp' : 'seed'; } catch { return 'seed'; }
}
export function rememberSource(value) {
  try { if (value === 'erp') localStorage.setItem(SOURCE_KEY, 'erp'); else localStorage.removeItem(SOURCE_KEY); } catch { /* private window: the choice lasts for this visit only */ }
}

/** @param {URLSearchParams} query */
export function chooseSource(query) {
  const q = query.get('source');
  return q === 'erp' || q === 'seed' ? q : storedSource();
}

/** The converted records from the integration API. Throws a plain Error with a readable message when they cannot be had. */
export async function loadErpRecords(fetchFn = globalThis.fetch, base = API_BASE) {
  let res;
  try { res = await fetchFn(`${base}/records`, { headers: { Accept: 'application/json' } }); } catch { throw new Error('the ERP integration API could not be reached'); }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON: a static host answering with a page */ }
  if (!res.ok) throw new Error(body?.error?.message ?? `the ERP integration API answered ${res.status}`);
  if (!body || !Array.isArray(body.workOrders) || !Array.isArray(body.stock)) throw new Error('the ERP integration API did not return ERP records');
  return body;
}

/** "16 Nov, 09:10" in the viewer's time zone. */
export function syncedText(iso) {
  if (!iso) return 'never synced';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'sync time unknown' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
