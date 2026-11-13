// ERP integration layer.
//
// Management feedback (12 Nov 2026): the customer already manages inventory, suppliers, purchases and work orders in
// SAP or another ERP, so the dashboard must FETCH AND ANALYSE that data, not ask anyone to re-enter it. Integration is
// designed in from the beginning:
//
//     Customer ERP / SAP  ──►  Integration layer (this file)  ──►  NEXUS dashboards
//     inventory, suppliers,      fetches existing data,             inventory, suppliers, purchasing,
//     purchasing, work orders    no manual re-entry                 maintenance and analytics
//
// Rules the modules follow:
//   1. The ERP stays the system of record for work orders, materials and stock, suppliers, and purchasing.
//   2. Modules read those records only through erp.ingest() / erp.rows(); none of them has a form that creates one.
//   3. When a planner wants a new requisition, reservation or order, the module sends a REQUEST to the ERP with
//      erp.request(). The ERP creates the document and it comes back with the next sync. Nothing is kept locally.
//   4. Everything read from the ERP is marked in the interface (ui.erp), and this panel shows the connection.
//
// An adapter is the only part that talks to the ERP. Production adapters call the customer's SAP Gateway (OData) or
// BAPIs. The prototype ships one adapter, SIMULATED: it returns the seeded demo records, shaped the way the SAP
// extract would be, so every screen already works against the integration contract. No live SAP system is connected.

import { drawer, ui, esc, fmt, toast } from './console.js';

/** The datasets the ERP owns, and how each one is read. */
export const ERP_DATASETS = {
  workOrders: { label: 'Work orders', system: 'SAP PM', object: 'Maintenance orders and notifications', tables: 'AUFK · AFIH · AFKO · QMEL', api: 'API_MAINTENANCEORDER · API_MAINTNOTIFICATION', direction: 'Read · status and request write-back', cadence: 'Change events + every 5 min', lagMin: 2 },
  inventory: { label: 'Inventory & stock', system: 'SAP MM', object: 'Materials, stock by storage location, reservations', tables: 'MARA · MARC · MARD · RESB', api: 'API_MATERIAL_STOCK_SRV · API_RESERVATION_DOCUMENT_SRV', direction: 'Read · reservation request', cadence: 'Every 15 min', lagMin: 9 },
  suppliers: { label: 'Suppliers', system: 'SAP MM', object: 'Vendor master and purchasing info records', tables: 'LFA1 · LFM1 · EINA · EINE', api: 'API_BUSINESS_PARTNER · API_INFORECORD_PROCESS_SRV', direction: 'Read only', cadence: 'Daily, 02:00', lagMin: 0 },
  purchasing: { label: 'Purchasing', system: 'SAP MM', object: 'Purchase requisitions and purchase orders', tables: 'EBAN · EKKO · EKPO · EKET', api: 'API_PURCHASEREQ_PROCESS_SRV · API_PURCHASEORDER_PROCESS_SRV', direction: 'Read · requisition request', cadence: 'Every 15 min', lagMin: 6 },
};

/** The one adapter in the prototype. A production adapter implements the same two methods against SAP Gateway. */
const simulatedAdapter = {
  id: 'simulated', name: 'SAP ERP connector', live: false,
  /** Returns the records of a dataset. Here: the seeded demo records passed in by the caller. */
  fetch: (dataset, seeded) => seeded,
  /**
   * Sends a request the ERP should act on and returns the reference of the REQUEST (the inbound message id), not a
   * document number: the ERP assigns the order / requisition / reservation number, which arrives with the next sync.
   */
  send: (dataset, payload, n) => ({ ref: `REQ-${{ workOrders: 'PM', purchasing: 'MM', inventory: 'MM' }[dataset] || 'ERP'}-${String(48200 + n * 7).padStart(6, '0')}`, payload }),
};

const state = { adapter: simulatedAdapter, loadedAt: Date.now(), sets: new Map(), outbox: [] };

export const erp = {
  system: { name: 'SAP S/4HANA', modules: 'PM · MM', owner: 'Customer ERP' },
  get adapter() { return state.adapter; },
  /** Swap in a production adapter ({ id, name, live, fetch, send }). */
  use(adapter) { state.adapter = adapter; return erp; },
  /**
   * Bring an ERP-owned dataset into the dashboards. Call it once per dataset where the records are loaded.
   * Returns the records unchanged; the layer remembers the count and the sync time for the provenance markers.
   */
  ingest(dataset, records) {
    const rows = state.adapter.fetch(dataset, records) || [];
    const def = ERP_DATASETS[dataset] || { label: dataset, system: 'ERP', lagMin: 5 };
    state.sets.set(dataset, { ...def, id: dataset, rows, count: rows.length, syncedAt: state.loadedAt - (def.lagMin ?? 5) * 60000 - (dataset === 'suppliers' ? ((new Date(state.loadedAt).getHours() - 2 + 24) % 24) * 3600000 : 0) });
    return rows;
  },
  rows: (dataset) => state.sets.get(dataset)?.rows ?? [],
  /** { label, system, tables, api, direction, cadence, count, syncedAt } or null if the dataset was not loaded on this page. */
  source: (dataset) => state.sets.get(dataset) ?? (ERP_DATASETS[dataset] ? { ...ERP_DATASETS[dataset], id: dataset, count: null, syncedAt: null } : null),
  /** 'SAP PM · synced 2 min ago' */
  syncedText(dataset) {
    const s = erp.source(dataset); if (!s) return '';
    return `${s.system} · ${s.syncedAt ? `synced ${ago(s.syncedAt)}` : 'not loaded on this workspace'}`;
  },
  /**
   * Ask the ERP to create or change a document (a purchase requisition, a reservation, a work request, a status).
   * The dashboard never stores the document itself: it returns the ERP reference and the document arrives with the
   * next sync. dataset: 'purchasing' | 'inventory' | 'workOrders'; what: short description for the outbox.
   * opts.system names the owning system when it is not the dataset's default (e.g. 'IBM Maximo' for substation plant).
   */
  request(dataset, what, payload = {}, opts = {}) {
    const res = state.adapter.send(dataset, payload, state.outbox.length + 1);
    const def = ERP_DATASETS[dataset] || { system: 'ERP' };
    const item = { ref: res.ref, dataset, system: opts.system || def.system, what, at: Date.now(), status: state.adapter.live ? 'Sent' : 'Simulated' };
    state.outbox.unshift(item);
    return item;
  },
  outbox: () => state.outbox.slice(),
  open: openGallery,
  details: openDetails,
  get connected() { return isConnected(); },
};

function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function openDetails(focus) {
  const sets = Object.keys(ERP_DATASETS).map((k) => erp.source(k));
  const flow = `<div class="nx-flow3"><div><b>Customer ERP / SAP</b><span>${esc(erp.system.name)} · ${esc(erp.system.modules)}<br/>Inventory, suppliers, purchasing, work orders. The system of record.</span></div><i></i><div class="is-mid"><b>Integration layer</b><span>Fetches the existing data on a schedule and on change events.<br/>No manual re-entry.</span></div><i></i><div><b>NEXUS dashboards</b><span>Inventory, suppliers, purchasing, maintenance and analytics, read-only on ERP records.</span></div></div>`;
  const body = `<div class="nx-sec">${ui.callout(`<b>Connected to ${esc(erp.system.name)}.</b> Work orders, stock, suppliers and purchasing are read through the integration layer. The ERP stays the system of record.`, 'ok', 'database')}</div>
  <div class="nx-sec"><h4>How ERP data reaches the dashboard</h4>${flow}</div>
  <div class="nx-sec"><h4>Datasets read from the ERP</h4>${ui.table({ rowId: (s) => s.id, sel: focus || undefined, cols: [
    { label: 'Dataset', sort: (s) => s.label, render: (s) => `<b>${esc(s.label)}</b><span class="nx-sub">${esc(s.object)}</span>` },
    { label: 'Source', sort: (s) => s.system, render: (s) => `${esc(s.system)}<span class="nx-sub nx-mono">${esc(s.tables)}</span>` },
    { label: 'Interface', wrap: true, sort: false, render: (s) => `<span class="nx-mono" style="font-size:11.5px">${esc(s.api)}</span><span class="nx-sub">${esc(s.direction)}</span>` },
    { label: 'Records', align: 'r', sort: (s) => s.count ?? -1, render: (s) => (s.count == null ? '<span class="nx-note">not used here</span>' : `<b class="nx-num">${fmt.n(s.count)}</b>`) },
    { label: 'Last sync', sort: (s) => s.syncedAt ?? 0, render: (s) => (s.syncedAt ? `${esc(ago(s.syncedAt))}<span class="nx-sub">${esc(s.cadence)}</span>` : `<span class="nx-note">${esc(s.cadence)}</span>`) },
  ], rows: sets })}</div>
  <div class="nx-sec"><h4>Requests sent to the ERP this session</h4>${state.outbox.length ? ui.table({ cols: [
    { label: 'Request reference', render: (o) => `<b class="nx-mono">${esc(o.ref)}</b>` }, { label: 'System', render: (o) => esc(o.system) }, { label: 'Request', wrap: true, render: (o) => esc(o.what) },
    { label: 'Sent', render: (o) => esc(new Date(o.at).toLocaleTimeString('en-GB')) }, { label: 'Status', render: (o) => ui.badge(o.status === 'Simulated' ? 'Sent' : o.status, 'ok') },
  ], rows: state.outbox }) : ui.empty('No requests yet. When a planner asks for a requisition, a reservation or a work request, it is sent to the ERP and listed here; the ERP creates the document.')}</div>
  <div class="nx-sec"><h4>Integration rules</h4><div class="nx-list">${[
    ['database', 'The ERP is the system of record', 'Work orders, materials and stock, suppliers and purchasing documents are owned by the ERP and only read here.'],
    ['sync', 'Fetched, not re-entered', 'No screen has a form that creates an ERP record. New documents are requested from the ERP and return with the next sync.'],
    ['link', 'Keyed to the same assets', 'ERP records are joined to towers, spans and transformers through the functional location / equipment number held on the asset.'],
  ].map(([ic, title, sub]) => ui.li({ ic, title, sub })).join('')}</div></div>`;
  drawer.open({ kicker: 'Enterprise integration', title: 'ERP integration layer', sub: `${erp.system.owner} → integration layer → dashboards. Designed in from the beginning.`, icon: 'database', badges: [['Connected', 'ok'], [`${sets.filter((s) => s.count != null).length} datasets on this workspace`, 'info'], ['Read from ERP · no re-entry', 'ok']], body, wide: true, meta: `Connector: ${state.adapter.name}`, actions: [{ label: 'All connectors', icon: 'database', onClick: (close) => { close(); setTimeout(openGallery, 280); } }, { label: 'Disconnect', onClick: (close) => { disconnect(); close(); setTimeout(openGallery, 280); } }] });
}

/** Send a request to the ERP and tell the user, in one call. Returns the outbox item ({ ref, system, status }). */
export function erpRequest(dataset, what, payload, opts) {
  const item = erp.request(dataset, what, payload, opts);
  toast(`${what}: sent to ${item.system} as ${item.ref}`);
  return item;
}

/* ------------------------------------------------------------------ connector gallery */
// The ERP pill in the top bar opens this gallery. Only connectors related to this product are listed (ERP, enterprise
// asset management, and the SAP database). SAP ERP is the one that can connect; the others are shown as not configured.
const KEY = 'nx.erp.connected';
const isConnected = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return state.connected === true; } };
const setConnected = (on) => { state.connected = on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } paintFlag(); };
function paintFlag() { if (typeof document !== 'undefined') document.documentElement.dataset.erpConnected = isConnected() ? '1' : '0'; }
paintFlag();

const CONNECTORS = [
  { id: 'sap-erp', group: 'ERP & enterprise asset management', name: 'SAP ERP', by: 'by SAP', sub: 'S/4HANA · PM · MM', logo: 'SAP', color: '#0b6fd6', available: true },
  { id: 'maximo', group: 'ERP & enterprise asset management', name: 'IBM Maximo', by: 'by IBM', logo: 'IBM', color: '#1f4cab' },
  { id: 'oracle', group: 'ERP & enterprise asset management', name: 'Oracle E-Business Suite', by: 'by Oracle', logo: 'OR', color: '#c74634' },
  { id: 'dynamics', group: 'ERP & enterprise asset management', name: 'Dynamics 365', by: 'by Microsoft', logo: 'D365', color: '#0f6cbd' },
  { id: 'hana', group: 'Database & data warehouse', name: 'HANA', by: 'by SAP', logo: 'HA', color: '#0a6ed1' },
];
const LOG0 = [
  ['info', 'Connector registered: SAP ERP (SAP S/4HANA · PM · MM)'],
  ['info', 'Interfaces available: API_MAINTENANCEORDER, API_MATERIAL_STOCK_SRV, API_BUSINESS_PARTNER, API_PURCHASEREQ_PROCESS_SRV'],
  ['warn', 'Not connected. Select the connector to start the connection.'],
];
const stamp = (d = new Date()) => d.toLocaleTimeString('en-GB');
state.log = state.log || LOG0.map(([lv, t], i) => ({ lv, t, at: new Date(Date.now() - (LOG0.length - i) * 60000) }));
let galleryEl = null; let connecting = false;

const logo = (c, size = 36) => `<span class="nx-conn-logo" style="width:${size}px;height:${size}px;background:${c.color}">${esc(c.logo)}</span>`;
function cardHtml(c, connected) {
  const on = c.available && connected;
  return `<button type="button" class="nx-conn-card${on ? ' is-on' : ''}${c.available ? '' : ' is-off'}" data-conn="${esc(c.id)}"${c.available ? '' : ' disabled'}>${logo(c)}<span class="nx-conn-t"><b>${esc(c.name)}</b><small>${esc(c.by)}${c.sub ? ` · ${esc(c.sub)}` : ''}</small></span>${c.available ? `<span class="nx-conn-st">${on ? '<i class="nx-conn-dot"></i>Connected' : connecting ? 'Connecting…' : 'Connect'}<em class="nx-conn-sim">Simulated</em></span>` : '<span class="nx-conn-st is-muted">Not configured</span>'}</button>`;
}
function logHtml() {
  return state.log.map((l) => `<div class="nx-conn-ln t-${l.lv}"><time>${esc(stamp(l.at))}</time><span>${esc(l.t)}</span></div>`).join('');
}
function galleryHtml(q = '') {
  const connected = isConnected();
  const match = (c) => !q || `${c.name} ${c.by} ${c.group} ${c.sub || ''}`.toLowerCase().includes(q.toLowerCase());
  const groups = [...new Set(CONNECTORS.map((c) => c.group))];
  const top = connected ? `<section class="nx-conn-grp"><h4><span>⌃</span>Connected</h4><div class="nx-conn-grid">${cardHtml(CONNECTORS[0], true)}</div></section>` : '';
  const body = groups.map((g) => {
    const list = CONNECTORS.filter((c) => c.group === g && match(c) && !(connected && c.available));
    return list.length ? `<section class="nx-conn-grp"><h4><span>⌃</span>${esc(g)}</h4><div class="nx-conn-grid">${list.map((c) => cardHtml(c, connected)).join('')}</div></section>` : '';
  }).join('');
  const none = !top && !body ? ui.empty('No connector matches your search.') : '';
  return `<div class="nx-conn-h"><div><h2>Select a Data Connector</h2><p>Choose a data connector type to configure your data source connection.</p></div><button type="button" class="nx-conn-x" data-conn-close aria-label="Close">×</button></div>
  <input type="search" class="nx-conn-q" placeholder="Search…" value="${esc(q)}" aria-label="Search connectors"/>
  ${top}${body}${none}
  <section class="nx-conn-grp"><h4><span>⌃</span>Connector log · SAP ERP</h4><div class="nx-conn-log" role="log" aria-live="polite">${logHtml()}</div></section>`;
}
function paintGallery() {
  if (!galleryEl) return;
  const q = galleryEl.querySelector('.nx-conn-q')?.value || '';
  const hadFocus = document.activeElement?.classList?.contains('nx-conn-q');
  galleryEl.querySelector('.nx-conn-box').innerHTML = galleryHtml(q);
  if (hadFocus) { const i = galleryEl.querySelector('.nx-conn-q'); i.focus(); i.setSelectionRange(q.length, q.length); }
  const log = galleryEl.querySelector('.nx-conn-log'); if (log) log.scrollTop = log.scrollHeight;
}
function closeGallery() { if (!galleryEl) return; const g = galleryEl; galleryEl = null; g.classList.remove('is-on'); setTimeout(() => g.remove(), 220); document.removeEventListener('keydown', onKey, true); }
const onKey = (e) => { if (e.key === 'Escape' && galleryEl) { e.stopPropagation(); closeGallery(); } };
const addLog = (lv, t) => { state.log.push({ lv, t, at: new Date() }); paintGallery(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  if (connecting || isConnected()) return;
  connecting = true; paintGallery();
  const n = (k) => erp.source(k)?.count;
  const steps = [
    ['info', `Connecting to ${erp.system.name} (SAP Gateway) …`, 500],
    ['info', 'TLS handshake complete · certificate verified', 450],
    ['ok', 'Authenticated as service user NEXUS_RFC · role Z_NEXUS_READ', 550],
    ['info', 'Reading service metadata: API_MAINTENANCEORDER, API_MATERIAL_STOCK_SRV, API_BUSINESS_PARTNER, API_PURCHASEREQ_PROCESS_SRV', 600],
    ['ok', `Work orders (SAP PM) · ${n('workOrders') ?? 0} records fetched`, 450],
    ['ok', `Inventory & stock (SAP MM) · ${n('inventory') ?? 0} materials fetched`, 400],
    ['ok', `Suppliers (SAP MM) · ${n('suppliers') ?? 0} vendors fetched`, 400],
    ['ok', 'Purchasing (SAP MM) · requisitions and purchase orders fetched', 400],
  ];
  for (const [lv, t, ms] of steps) { await sleep(ms); addLog(lv, t); }
  await sleep(300);
  setConnected(true); connecting = false;
  addLog('ok', 'Connection established · incremental sync every 5 min, no manual re-entry');
}
function disconnect() { setConnected(false); state.log.push({ lv: 'warn', t: 'Connector disconnected by user', at: new Date() }); }

function openGallery() {
  if (galleryEl) return;
  drawer.close(true);
  galleryEl = document.createElement('div'); galleryEl.className = 'nx-conn';
  galleryEl.innerHTML = '<div class="nx-conn-scrim" data-conn-close></div><div class="nx-conn-box" role="dialog" aria-modal="true" aria-label="Select a Data Connector"></div>';
  document.body.append(galleryEl);
  paintGallery();
  requestAnimationFrame(() => galleryEl?.classList.add('is-on'));
  document.addEventListener('keydown', onKey, true);
  galleryEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-conn-close]')) return closeGallery();
    const c = e.target.closest('[data-conn]');
    if (!c || c.disabled) return;
    if (isConnected()) { closeGallery(); setTimeout(() => openDetails(), 240); } else connect();
  });
  galleryEl.addEventListener('input', (e) => { if (e.target.classList.contains('nx-conn-q')) paintGallery(); });
}

// One handler for every ERP marker on the page (badges and the top-bar pill).
if (typeof document !== 'undefined' && !window.__nxErpBound) {
  window.__nxErpBound = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-nx-erp]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    if (isConnected() && el.getAttribute('data-nx-erp') !== '') openDetails(el.getAttribute('data-nx-erp')); else openGallery();
  }, true);
}
