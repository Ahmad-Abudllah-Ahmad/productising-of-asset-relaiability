import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateSeed } from '../data/seed.js';
import { createRepository, repository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { handle, clearCache, selectAdapter } from '../erp/handler.js';
import { createMockSap, orderNo } from '../erp/mockSap.js';
import { convert, idTable } from '../erp/convert.js';
import { evalSpec, mapRow } from '../erp/mapping.js';
import { fromODataDate, toODataDate, wrap } from '../erp/odata.js';
import { ENTITIES } from '../erp/adapter.js';
import { chooseSource, loadErpRecords } from '../app/dataSource.js';
import { loadDashboard } from '../app/dashboardModel.js';
import { blockedWorkOrders } from '../app/inventoryModel.js';

const seed = generateSeed();
const loadSeed = async () => seed;
const call = (path, env = {}, extra = {}) => handle({ path, env, loadSeed, ...extra });
const MAPPING = JSON.parse(fs.readFileSync(new URL('../erp/mapping/sap.json', import.meta.url), 'utf8'));
const records = (async () => (await call('/api/erp/records')).body)();
const erpRepo = async () => createRepository(generateSeed(), { storage: null, erp: await records });

// ------------------------------------------------------------------ mapping conversion
test('OData dates and the field-mapping interpreter', () => {
  assert.equal(toODataDate('2026-11-11'), '/Date(1794355200000)/');
  assert.equal(fromODataDate('/Date(1794355200000)/'), '2026-11-11');
  assert.equal(fromODataDate('2026-11-11T09:00:00Z'), '2026-11-11');
  assert.equal(fromODataDate(null), null);
  assert.deepEqual(wrap([1]), { d: { results: [1] } });
  assert.equal(evalSpec({ from: 'A', transform: 'regex', rules: [{ pattern: '^4000(\\d{4})$', template: 'WO-$1' }] }, { A: '40000004' }), 'WO-0004');
  assert.equal(evalSpec({ from: 'A', transform: 'regex', rules: [{ pattern: '^x$', template: 'y' }] }, { A: 'q' }), null, 'no rule matches: null, never a guess');
  assert.equal(evalSpec({ template: 'PO-{P}-{I}' }, { P: '45', I: '10' }), 'PO-45-10');
  assert.equal(evalSpec({ template: 'PO-{P}', emptyIfBlank: 'P' }, { P: ' ' }), null);
  assert.equal(evalSpec({ from: 'S', transform: 'map', map: { A: 'x' }, default: 'z' }, { S: 'B' }), 'z');
  assert.deepEqual(evalSpec({ from: 'L', transform: 'list' }, { L: 'a, b,,c' }), ['a', 'b', 'c']);
  assert.equal(evalSpec({ rules: [{ when: { field: 'P', nonEmpty: true, allOf: [{ field: 'S', in: ['CRTD'] }] }, value: { const: 'planned' } }], default: { const: 'open' } }, { P: '8', S: 'CRTD' }), 'planned');
  assert.equal(evalSpec({ rules: [{ when: { field: 'P', nonEmpty: true, allOf: [{ field: 'S', in: ['CRTD'] }] }, value: { const: 'planned' } }], default: { const: 'open' } }, { P: '8', S: 'REL' }), 'open');
  assert.deepEqual(mapRow({ Q: '3' }, { q: { from: 'Q', transform: 'number' } }), { q: 3 });
});

test('the SAP-shaped responses are OData V2, and converting them gives back exactly the dashboard records', async () => {
  const sap = createMockSap({ seed });
  for (const e of ENTITIES) assert.ok(Array.isArray((await sap[e]()).d.results), e);
  const wo = (await sap.workOrders()).d.results.find((w) => w.MaintenanceOrder === orderNo('WO-0004'));
  assert.deepEqual([wo.MaintenanceOrder, wo.MaintenanceOrderStatus, wo.MaintPriority, wo.MaintOrdBasicStartDate], ['40000004', 'REL', '2', toODataDate('2026-03-03')]);
  const r = await records;
  assert.equal(r.workOrders.length + r.unmatched.reduce((n, u) => n + u.workOrders.length, 0), seed.workOrders.length + 3);
  for (const w of seed.workOrders) {
    const x = r.workOrders.find((y) => y.work_order_id === w.work_order_id);
    assert.ok(x, w.work_order_id);
    for (const k of ['work_type', 'priority', 'status', 'created_at', 'planned_date', 'completed_at']) assert.equal(x[k], w[k] ?? null, `${w.work_order_id} ${k}`);
    assert.deepEqual(x.finding_ids, w.finding_ids ?? []);
    assert.equal(x.plan_id ? x.plan_id.startsWith('MP-') : !w.plan_id, true);
  }
  assert.deepEqual(r.stock.map((s) => [s.material_id, s.warehouse_id, s.on_hand]), seed.stock.map((s) => [s.material_id, s.warehouse_id, s.on_hand]));
  assert.deepEqual(r.reservations, seed.reservations.map((x) => ({ ...x })), 'reservations survive the round trip');
  assert.deepEqual(r.purchaseOrders.map((p) => [p.po_line_id, p.material_id, p.supplier_id, p.quantity, p.delivery_date]), seed.purchaseOrders.map((p) => [p.po_line_id, p.material_id, p.supplier_id, p.quantity, p.delivery_date]));
  assert.deepEqual(r.suppliers, seed.suppliers);
  assert.deepEqual(r.materials.map((m) => [m.material_id, m.supplier_id, m.reorder_point]), seed.materials.map((m) => [m.material_id, m.supplier_id, m.reorder_point]));
  assert.equal(r.maintenancePlans.length, seed.maintenancePlans.length);
  assert.deepEqual(r.maintenancePlans[0].parts, seed.maintenancePlans[0].parts);
  assert.equal(r.mapping.matchedLocations, r.mapping.locations - 3);
});

// ------------------------------------------------------------------ unmatched ERP records
test('unmatched: a location the registry does not know is held back with its work order, never guessed', async () => {
  const r = await records;
  assert.deepEqual(r.unmatched.map((u) => [u.key, u.workOrders.length, u.class]), [['SAP-EQ-TX1A-B', 1, 'power_transformer'], ['SAP-TWR-13201120', 1, 'tower'], ['SAP-YARD-CRANE-07', 1, 'other']]);
  assert.ok(r.unmatched.every((u) => u.workOrders.every((w) => w.asset_id === null)));
  assert.ok(!r.workOrders.some((w) => w.work_order_id.startsWith('SAP-')), 'held-back orders are in no list yet');
  const table = idTable(seed.assets);
  assert.equal(table.get('SAP-TWR-13201112') ?? null, null);
  assert.equal(table.get('SAP-TWR-13201012'), 'TWR-132-01-012');
});

test('unmatched: suggestions come from the matcher; a person links one, and the work order then belongs to that asset; ignore and undo work; it survives a reload', async () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const make = async () => createRepository(generateSeed(), { storage, erp: await records });
  const repo = await make();
  const rows = await repo.getErpUnmatched();
  const tower = rows.find((x) => x.key === 'SAP-TWR-13201120');
  assert.equal(tower.status, 'open');
  assert.equal(tower.candidates[0].asset_id, 'TWR-132-01-020');
  assert.ok(tower.candidates[0].score > 0.3 && tower.candidates[0].reasons.some((x) => x.signal === 'spatial'));
  assert.ok((await repo.getErpUnmatched()).find((x) => x.key === 'SAP-EQ-TX1A-B').candidates[0].asset_id === 'TX-1A');
  assert.deepEqual((await repo.getErpUnmatched()).find((x) => x.key === 'SAP-YARD-CRANE-07').candidates, [], 'nothing looks like a crane');
  const before = (await repo.getWorkOrders()).length;
  await repo.confirmErpMatch('SAP-TWR-13201120', 'TWR-132-01-020');
  const orders = await repo.getWorkOrders({ asset_id: 'TWR-132-01-020' });
  assert.ok(orders.some((w) => w.work_order_id === 'SAP-42000001' && w.status === 'open'));
  assert.equal((await repo.getWorkOrders()).length, before + 1);
  assert.equal((await repo.getErpUnmatched()).find((x) => x.key === 'SAP-TWR-13201120').matched, 'TWR-132-01-020');
  assert.ok((await repo.getAuditLog()).some((e) => e.action === 'erp_match' && /SAP-TWR-13201120/.test(e.detail)));
  const again = await make();
  assert.equal((await again.getWorkOrders()).length, before + 1, 'the match is remembered');
  await again.ignoreErpRecord('SAP-YARD-CRANE-07');
  assert.equal((await again.getErpUnmatched()).find((x) => x.key === 'SAP-YARD-CRANE-07').status, 'ignored');
  await again.reopenErpRecord('SAP-TWR-13201120');
  assert.equal((await again.getWorkOrders()).length, before);
  await assert.rejects(() => again.confirmErpMatch('SAP-NOPE', 'TWR-132-01-020'));
  await assert.rejects(() => again.confirmErpMatch('SAP-TWR-13201120', 'NOPE'));
});

// ------------------------------------------------------------------ the data-source switch
test('data source: seed is the default and has no ERP; erp reads the ERP records, keeps the same screens and numbers, and is labelled', async () => {
  assert.equal(repository.source, 'seed');
  assert.deepEqual(repository.sourceInfo(), { source: 'seed', label: 'demo data', adapter: null, syncedAt: null });
  assert.deepEqual(await repository.getErpUnmatched(), []);
  const repo = await erpRepo();
  assert.equal(repo.source, 'erp');
  const info = repo.sourceInfo();
  assert.deepEqual([info.source, info.label, info.adapter], ['erp', 'SAP (mock)', 'mock-sap']);
  assert.match(info.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
  // the screens read the same snapshot shape; with the mock the numbers equal the seed's
  const a = await loadSnapshot(repository); const b = await loadSnapshot(repo);
  assert.equal(loadDashboard(b).kpis.parts.waiting, loadDashboard(a).kpis.parts.waiting);
  assert.equal(blockedWorkOrders(b).length, blockedWorkOrders(a).length);
  assert.deepEqual([...b.scores.keys()].length, [...a.scores.keys()].length);
  assert.equal(loadDashboard(b).kpis.overdue.count, loadDashboard(a).kpis.overdue.count);
  // work orders in ERP mode are the ERP's: tagged with their source
  assert.ok((await repo.getWorkOrders()).every((w) => w.source === 'erp'));
  assert.ok((await repository.getWorkOrders()).every((w) => !w.source));
});

test('data source: the choice comes from ?source= first, then the stored setting, then the seed; a failing API is reported in plain words', async () => {
  assert.equal(chooseSource(new URLSearchParams('')), 'seed');
  assert.equal(chooseSource(new URLSearchParams('source=erp')), 'erp');
  assert.equal(chooseSource(new URLSearchParams('source=seed')), 'seed');
  assert.equal(chooseSource(new URLSearchParams('source=nonsense')), 'seed');
  await assert.rejects(() => loadErpRecords(async () => { throw new Error('offline'); }), /could not be reached/);
  await assert.rejects(() => loadErpRecords(async () => ({ ok: false, status: 404, json: async () => { throw new Error('html'); } })), /answered 404/);
  await assert.rejects(() => loadErpRecords(async () => ({ ok: true, status: 200, json: async () => ({ hello: 1 }) })), /did not return ERP records/);
  const ok = await loadErpRecords(async () => ({ ok: true, status: 200, json: async () => await records }));
  assert.ok(ok.workOrders.length > 100);
});

// ------------------------------------------------------------------ the API
test('API: with no environment variables the mock SAP adapter answers; status, records, raw and mapping routes', async () => {
  clearCache();
  const st = await call('/api/erp/status', {});
  assert.equal(st.status, 200);
  assert.deepEqual([st.body.adapter, st.body.live, st.body.configured, st.body.readOnly], ['mock-sap', false, true, true]);
  assert.ok(st.body.counts.workOrders > 100 && st.body.counts.unmatched === 3);
  assert.equal((await call('/api/erp')).status, 200);
  const raw = await call('/api/erp/raw/work-orders');
  assert.equal(raw.status, 200);
  assert.ok(raw.body.d.results[0].MaintenanceOrder);
  assert.equal((await call('/api/erp/raw/maintenance-plans')).status, 200);
  assert.equal((await call('/api/erp/mapping')).body.adapter, 'mock-sap');
  assert.equal((await call('/api/erp/raw/nope')).status, 404);
  assert.equal((await call('/api/erp/bogus')).status, 404);
});

test('API: read-only (anything but GET is 405), unknown adapter is 400, internal errors never leak their message', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call('/api/erp/records', {}, { method })).status, 405, method);
  assert.equal((await call('/api/erp/status', { ERP_ADAPTER: 'oops' })).status, 400);
  const boom = await handle({ path: '/api/erp/records', env: {}, loadSeed: async () => { throw new Error('connect ECONNREFUSED https://internal.example:8443 token=ABC'); } });
  assert.equal(boom.status, 500);
  assert.doesNotMatch(JSON.stringify(boom.body), /ECONNREFUSED|internal\.example|token/);
});

test('API: the cache keeps a sync for ERP_CACHE_SECONDS and ?refresh=1 syncs again; the sync time is reported', async () => {
  clearCache();
  let t = Date.parse('2026-11-16T09:10:00Z');
  const now = () => new Date(t);
  const a = (await call('/api/erp/records', { ERP_CACHE_SECONDS: '60' }, { now })).body;
  assert.deepEqual([a.cached, a.syncedAt], [false, '2026-11-16T09:10:00.000Z']);
  t += 30000;
  assert.equal((await call('/api/erp/records', { ERP_CACHE_SECONDS: '60' }, { now })).body.cached, true);
  t += 60000;
  const c = (await call('/api/erp/records', { ERP_CACHE_SECONDS: '60' }, { now })).body;
  assert.deepEqual([c.cached, c.syncedAt], [false, '2026-11-16T09:11:30.000Z']);
  assert.equal((await call('/api/erp/records', { ERP_CACHE_SECONDS: '600' }, { now })).body.cached, true);
  assert.equal((await call('/api/erp/records', { ERP_CACHE_SECONDS: '600' }, { now, query: { refresh: '1' } })).body.cached, false, 'refresh=1 syncs again');
});

test('API: the SAP S/4HANA and Maximo stubs say "not configured" or "not implemented", make no calls and never return a credential', async () => {
  clearCache();
  for (const [adapter, vars] of [['sap-s4hana', { SAP_BASE_URL: 'https://erp.invalid', SAP_AUTH_TYPE: 'basic', SAP_PASSWORD: 'SECRET-VALUE-123' }], ['maximo', { MAXIMO_BASE_URL: 'https://max.invalid', MAXIMO_API_KEY: 'SECRET-VALUE-123' }]]) {
    const none = await call('/api/erp/records', { ERP_ADAPTER: adapter });
    assert.deepEqual([none.status, none.body.error.code], [501, 'not_configured'], adapter);
    const some = await call('/api/erp/records', { ERP_ADAPTER: adapter, ...vars });
    assert.deepEqual([some.status, some.body.error.code], [501, 'not_implemented'], adapter);
    assert.match(some.body.error.message, /TODO/);
    const st = await call('/api/erp/status', { ERP_ADAPTER: adapter, ...vars });
    assert.equal(st.body.configured, true);
    for (const res of [none, some, st]) assert.doesNotMatch(JSON.stringify(res.body), /SECRET-VALUE-123|erp\.invalid|max\.invalid/);
  }
  assert.equal((await selectAdapter({}, loadSeed)).name, 'mock-sap');
  assert.equal((await selectAdapter({ ERP_ADAPTER: '' }, loadSeed)).name, 'mock-sap');
});

// ------------------------------------------------------------------ no credentials in the repository
const ROOT = path.resolve('.');
const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor', 'assets', 'docs', 'public', 'azeri enerji dashbaord v3 - Copy'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(js|mjs|cjs|json|md|html)$/.test(f.name)) out.push(p);
  }
  return out;
};

test('.env.example has names only; .env is git-ignored; no source file carries a credential or a customer hostname', () => {
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const lines = example.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  assert.ok(lines.length >= 10);
  for (const l of lines) {
    const [k, v] = l.split('=');
    assert.match(k, /^[A-Z][A-Z0-9_]+$/, l);
    assert.ok(v === '' || ['mock', '300'].includes(v), `${k} must be empty or a harmless default, not a value`);
  }
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^\*\*\/\.env$/m);
  assert.match(ignore, /^!\*\*\/\.env\.example$/m);
  const bad = [];
  for (const f of [...walk(path.join(ROOT, 'reliability')), path.join(ROOT, 'server.js'), path.join(ROOT, 'api/erp.js'), path.join(ROOT, 'vercel.json'), path.join(ROOT, '.env.example')]) {
    if (f.includes(`${path.sep}test${path.sep}`)) continue; // tests use obvious fake values
    const text = fs.readFileSync(f, 'utf8');
    for (const re of [/(password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{6,}["']/i, /https?:\/\/[a-z0-9.-]*(\.hana\.ondemand\.com|\.s4hana\.cloud\.sap|\.maximo|\.mro\.com)/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/]) {
      if (re.test(text)) bad.push(`${path.relative(ROOT, f)}: ${re}`);
    }
  }
  assert.deepEqual(bad, []);
});
