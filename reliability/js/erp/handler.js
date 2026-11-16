// The ERP integration API, as one function used by both servers: server.js locally and the Vercel function in api/erp.js.
//
//   GET /api/erp/status                  which adapter, whether it is configured, when it last synced, what it holds
//   GET /api/erp/records[?refresh=1]     everything converted to the dashboard's record shapes, plus the unmatched records
//   GET /api/erp/raw/<entity>            the adapter's own response (work-orders, notifications, assets, materials, stock,
//                                        purchase-orders, suppliers, reservations, maintenance-plans)
//   GET /api/erp/mapping                 the field mapping of the adapter
//
// Read-only: any other method answers 405. The adapter is chosen by ERP_ADAPTER (mock | sap-s4hana | maximo); with nothing set it is the mock
// SAP adapter, so the app works with no environment variables. Credentials are read by an adapter from its own variables and are never
// returned, logged or put in an error message. The browser only ever calls this API.

import fs from 'node:fs';
import { ErpError, ENTITIES, ENTITY_URL } from './adapter.js';
import { createMockSap } from './mockSap.js';
import { sapS4Hana, maximo } from './stubs.js';
import { convert } from './convert.js';

const MAPPING_DIR = new URL('./mapping/', import.meta.url);
const loadMapping = (file) => JSON.parse(fs.readFileSync(new URL(file, MAPPING_DIR), 'utf8'));
const MAPPING_FILE = { 'mock-sap': 'sap.json', 'sap-s4hana': 'sap.json', maximo: 'maximo.json' };

export const ADAPTER_NAMES = Object.freeze(['mock', 'sap-s4hana', 'maximo']);

/** @returns {Promise<any>} the adapter chosen by the environment (default: the mock SAP adapter) */
export async function selectAdapter(env, loadSeed) {
  const name = String(env.ERP_ADAPTER ?? 'mock').trim().toLowerCase() || 'mock';
  if (name === 'mock' || name === 'mock-sap') return createMockSap({ seed: await loadSeed() });
  if (name === 'sap-s4hana') return sapS4Hana();
  if (name === 'maximo') return maximo();
  throw new ErpError(400, 'unknown_adapter', `ERP_ADAPTER must be one of ${ADAPTER_NAMES.join(', ')}.`);
}

// ---- cache: one entry per adapter name, with the time of the last sync
const cache = new Map();
export const clearCache = () => cache.clear();

async function synced(env, loadSeed, { refresh = false, now = () => new Date() } = {}) {
  const adapter = await selectAdapter(env, loadSeed);
  const ttl = Math.max(0, Number(env.ERP_CACHE_SECONDS ?? 300) || 0);
  const hit = cache.get(adapter.name);
  if (hit && !refresh && now().getTime() - hit.at.getTime() < ttl * 1000) return { adapter, ...hit, cached: true };
  const raw = {};
  for (const e of ENTITIES) raw[e] = await adapter[e](env);
  const seed = await loadSeed();
  const mapping = loadMapping(MAPPING_FILE[adapter.name]);
  const records = convert(raw, mapping, seed.assets);
  const entry = { at: now(), raw, records, mapping };
  cache.set(adapter.name, entry);
  return { adapter, ...entry, cached: false };
}

const iso = (d) => d.toISOString();

/**
 * @param {{method?: string, path: string, query?: Record<string, string>, env?: Record<string, string|undefined>, loadSeed: () => Promise<any>, now?: () => Date}} req
 * @returns {Promise<{status: number, body: any}>}
 */
export async function handle({ method = 'GET', path, query = {}, env = process.env, loadSeed, now = () => new Date() }) {
  try {
    if (method !== 'GET' && method !== 'HEAD') throw new ErpError(405, 'read_only', 'The ERP API is read-only: use GET.');
    const parts = String(path).replace(/^\/+|\/+$/g, '').split('/'); // api/erp/<route>/...
    if (parts[0] === 'api' && parts[1] === 'erp') parts.splice(0, 2);
    const [route, arg] = parts;

    if (route === 'status' || route === undefined || route === '') {
      const adapter = await selectAdapter(env, loadSeed);
      const base = { adapter: adapter.name, label: adapter.label, live: adapter.live, configured: adapter.configured(env), readOnly: true, cacheSeconds: Math.max(0, Number(env.ERP_CACHE_SECONDS ?? 300) || 0) };
      if (!adapter.live || adapter.configured(env)) {
        try {
          const s = await synced(env, loadSeed, { now });
          return { status: 200, body: { ...base, syncedAt: iso(s.at), cached: s.cached, counts: Object.fromEntries(Object.entries(s.records).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])), mapping: s.records.mapping } };
        } catch (e) { if (!(e instanceof ErpError)) throw e; return { status: 200, body: { ...base, syncedAt: null, error: { code: e.code, message: e.message } } }; }
      }
      return { status: 200, body: { ...base, syncedAt: null, error: { code: 'not_configured', message: `Set ${adapter.required?.join(', ') ?? 'its variables'} (see .env.example).` } } };
    }
    if (route === 'records') {
      const s = await synced(env, loadSeed, { refresh: query.refresh === '1' || query.refresh === 'true', now });
      return { status: 200, body: { source: 'erp', adapter: s.adapter.name, label: s.adapter.label, syncedAt: iso(s.at), cached: s.cached, ...s.records } };
    }
    if (route === 'raw') {
      const entity = ENTITY_URL[arg];
      if (!entity) throw new ErpError(404, 'unknown_entity', `Unknown entity "${String(arg).slice(0, 40)}". Use one of: ${Object.keys(ENTITY_URL).join(', ')}.`);
      const s = await synced(env, loadSeed, { now });
      return { status: 200, body: s.raw[entity] };
    }
    if (route === 'mapping') {
      const adapter = await selectAdapter(env, loadSeed);
      return { status: 200, body: loadMapping(MAPPING_FILE[adapter.name]) };
    }
    throw new ErpError(404, 'not_found', 'Routes: /api/erp/status, /records, /raw/<entity>, /mapping.');
  } catch (e) {
    if (e instanceof ErpError) return { status: e.status, body: { error: { code: e.code, message: e.message } } };
    return { status: 500, body: { error: { code: 'internal', message: 'The ERP layer failed. Check the server log.' } } }; // never the raw message: it could carry a URL or a credential
  }
}

/** Node http adapter: the same for server.js and the Vercel function. */
export async function respond(req, res, { path, query, env, loadSeed }) {
  const { status, body } = await handle({ method: req.method, path, query, env, loadSeed });
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(body));
}
