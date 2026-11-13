// Module 05 — Supply Chain & Inventory.
// Maps verified defect classes to approved catalogue items, builds a bill of materials for every open work order,
// allocates warehouse stock depot by depot (home depot first, then transfer), flags shortfalls before dispatch and
// turns them into reservation and requisition REQUESTS to SAP MM. Lead times and supplier performance drive reorder points.
// Materials, stock, reservations, suppliers and purchasing documents are ERP records (SAP MM) and work orders are SAP PM
// records: all are read through the integration layer (erp.js) and none is created or edited here. Forecasts, reorder
// parameters, days of cover and supplier risk are unvalidated model outputs (models.js) and are labelled Experimental.
// The Depot Schematics screen is a live ISA-5.1 P&ID of the Eastern Grid Warehouse oil plant and SF6 store.

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, addDays, daysBetween, rng, nav, clamp } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, DEFECT_LABEL, SEV_TONE } from '../network.js';
import { drawingTabs } from '../drawings.js';
import { models } from '../models.js';
import { erp, erpRequest } from '../erp.js';

const net = await loadNetwork();
const AS_OF = net.asOf;
const R = rng(505);

// Predictive models and heuristics of this module, for the model validation register. None is validated: they run on
// simulated demo data, and every output is labelled / Simulated in the interface until tested on real data.
models.register([
  { id: 'inv-demand', name: 'Spare-part demand forecast', module: '05 · Supply Chain & Inventory',
    predicts: 'Monthly consumption per SKU for the next 6 months with an 80 % band; forecast demand value by category; the campaign uplift',
    method: '12-month mean plus a half-year linear trend, multiplied by fixed seasonal campaign factors; 50 % and 30 % of the open work-order pipeline are added to the first two months. Band = 1.28 × σ × √horizon.',
    needs: 'Two or more years of goods-issue history from SAP MM (MSEG, movement 261) per material, and the inspection campaign calendar.' },
  { id: 'inv-reorder', name: 'Reorder point, safety stock and reorder suggestions', module: '05 · Supply Chain & Inventory',
    predicts: 'Safety stock, reorder point and EOQ per SKU; the items to reorder and the suggested requisition quantities',
    method: 'Safety stock = 1.65 × σ(daily demand) × √quoted lead time (95 % cycle service). ROP = mean daily demand × quoted lead time + safety stock. EOQ with an assumed $85 order cost and 22 %/yr holding cost. Suggested quantity = max(EOQ, gap to ROP + safety stock).',
    needs: 'Goods-issue history and actual replenishment lead times from SAP MM purchase-order history (EKKO · EKBE); agreed ordering and holding costs and target service levels.' },
  { id: 'inv-cover', name: 'Days of cover and projected stock-out date', module: '05 · Supply Chain & Inventory',
    predicts: 'Days of cover per SKU and per depot, the projected stock-out date, the stock-out and watch flags, and the excess-stock suggestions',
    method: 'Free stock after allocation to open work ÷ mean daily use of the last 12 months. Depot cover apportions demand by each depot’s share of open jobs. No trend or seasonality in the run-out date.',
    needs: 'Stock-level and goods-issue history per storage location from SAP MM (MARD · MSEG), with recorded stock-out and backorder events to back-test against.' },
  { id: 'inv-supplier-risk', name: 'Supplier risk score and late-delivery probability', module: '05 · Supply Chain & Inventory',
    predicts: 'Risk score 0–100 per supplier, and the supply-risk matrix',
    method: '(100 − OTD %) × 1.6 + lead-time variability (IQR ÷ quoted lead) × 40 + critical items × 6 + logistics distance class × 6, capped at 100. Late-delivery probability is taken as 100 − OTD %. The weights are assumptions.',
    needs: 'Several years of promised vs actual delivery dates per supplier from SAP MM (EKET · EKBE), and recorded supply disruptions.' },
  { id: 'inv-dispatch-risk', name: 'Material at risk on dispatch day', module: '05 · Supply Chain & Inventory',
    predicts: 'Jobs whose hardware is expected to arrive after the planned dispatch date; the estimated earliest delivery date of a shortfall',
    method: 'Assumes the missing items are ordered today and delivered on the quoted lead time. A job is at risk when the longest quoted lead time among its short items exceeds the days left to dispatch.',
    needs: 'Promised vs actual delivery dates from SAP MM purchase orders (EKET · EKBE), and the dispatch outcomes of past SAP PM work orders.' },
]);

// Open orders whose planned date has already passed are re-baselined into the forward plan (the material plan only
// looks ahead); the original date is kept as origPlanned.
{
  const Rp = rng(5051);
  const AHEAD = { in_progress: [-3, 2], scheduled: [3, 16], planned: [10, 42], approved: [18, 60], requested: [30, 90] };
  for (const w of net.workOrders) {
    if (w.stage !== 'completed' && w.planned_date && w.planned_date < AS_OF) {
      const [a, b] = AHEAD[w.stage] || [10, 40];
      w.origPlanned = w.planned_date; w.planned_date = addDays(AS_OF, Math.round(a + Rp() * (b - a)));
    }
  }
}

/* ================================================================== local styles */
document.head.insertAdjacentHTML('beforeend', `<style id="inv-css">
.inv-stock { display: flex; gap: 4px; align-items: center; }
.inv-stock i { display: inline-block; height: 8px; border-radius: 2px; }
.inv-dep { display: grid; grid-template-columns: 110px 1fr 54px; gap: 8px; align-items: center; font-size: 12px; padding: 4px 0; }
.inv-dep .nx-bar { height: 8px; }
.inv-dep .nx-sub { display: block; font-size: 11px; color: var(--nx-muted); }
.inv-mini { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.inv-mini th { text-align: left; color: var(--nx-muted); font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; padding: 4px 6px; border-bottom: 1px solid var(--nx-line); }
.inv-mini td { padding: 5px 6px; border-bottom: 1px solid var(--nx-line-2); }
.inv-mini td.r, .inv-mini th.r { text-align: right; }
.inv-mini .nx-sub { display: block; font-size: 11px; color: var(--nx-muted); }
.inv-flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.inv-flow > div { background: var(--nx-surface-2); border: 1px solid var(--nx-line); border-radius: 10px; padding: 10px 12px; position: relative; }
.inv-flow > div:not(:last-child)::after { content: "›"; position: absolute; right: -9px; top: 50%; transform: translateY(-50%); color: var(--nx-faint); font-size: 18px; }
.inv-flow small { display: block; color: var(--nx-muted); font-size: 11px; }
.inv-flow b { font-size: 20px; font-variant-numeric: tabular-nums; }
.inv-sku { font-family: var(--nx-mono); font-size: 11.5px; color: var(--nx-ink-2); }
.inv-cover { display: inline-block; min-width: 46px; text-align: center; border-radius: 6px; padding: 1px 6px; font-weight: 700; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.inv-split { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; }
.inv-check { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--nx-line); font-size: 12.5px; }
.inv-check:last-child { border-bottom: 0; }
.inv-check i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; color: #fff; font-style: normal; font-size: 11px; font-weight: 700; }
.inv-check small { display: block; color: var(--nx-muted); font-size: 11.5px; }
.inv-hd { display: flex; align-items: center; gap: 12px; padding: 4px 0 2px; }
.inv-hd .inv-hd-ico { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: #f1f5f9; color: var(--nx-ink-2); }
.inv-hd .inv-hd-ico svg { width: 20px; height: 20px; }
@media (max-width: 1280px) { .inv-split { grid-template-columns: 1fr; } }
</style>`);

/* ================================================================== helpers */
const depots = net.depots;
const depotName = Object.fromEntries(depots.map((d) => [d.id, d.short]));
const partBySku = new Map(net.parts.map((p) => [p.sku, p]));
const supplierById = new Map(net.suppliers.map((s) => [s.id, s]));
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
const nearestDepot = (p) => (p?.lat ? depots.reduce((best, d) => (dist(p, d) < dist(p, best) ? d : best), depots[0]) : depots[2]);
const money = fmt.money;
const STAGE_ORDER = { in_progress: 0, scheduled: 1, planned: 2, approved: 3, requested: 4 };
const STAGE_LABEL = { requested: 'Requested', approved: 'Approved', planned: 'Planned', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed' };
const STAGE_TONE = { requested: 'muted', approved: 'accent', planned: 'info', scheduled: 'violet', in_progress: 'warn', completed: 'ok' };

/* ---------------------------------------------------------------- BOM: defect -> approved catalogue item */
// Primary part per defect class; insulators are chosen by line voltage (disc strings at 132 kV, long-rods above).
// The bill-of-materials rule lives in network.js, shared with Asset 360 · Inventory & Parts in Module 01.
const QTY = net.partQty;
const partFor = net.partFor;

/* ---------------------------------------------------------------- ERP documents on this workspace, and requests sent to the ERP */
// pos / prs: purchase orders and requisitions read from SAP MM (a seeded demo extract, ingested through the ERP layer
// below). The dashboard never creates or edits one. A requisition a planner asks for is SENT to SAP MM (erpRequest):
// SAP MM creates the document, and the request is listed under its ERP reference (`requested`) until the next sync.
// reserved / issued: work order id → ERP reference of the reservation / goods-issue request sent to SAP MM this session.
// prRelease: requisition id → ERP reference of a release request. poReq: purchase order id → { ref, label } of a request.
const state = { reserved: new Map(), issued: new Map(), prRelease: new Map(), poReq: new Map(), prs: [], pos: [], seqPR: 10041, seqPO: 4500212 };

/** Allocate stock to every open work order, depot by depot. Recomputed after each action. */
function allocate() {
  const avail = Object.fromEntries(net.parts.map((p) => [p.sku, { ...p.stock }]));
  // goods received on open POs land in their depot
  for (const po of state.pos) if (po.stage === 'received') avail[po.sku][po.depot] += po.qty;
  const open = net.workOrders.filter((w) => w.stage !== 'completed').sort((a, b) => (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || String(a.planned_date).localeCompare(String(b.planned_date)));
  const jobs = [];
  for (const w of open) {
    const home = nearestDepot(w);
    const need = new Map();
    for (const f of w.findings) {
      if (f.review_status === 'rejected') continue;
      const sku = partFor(f.defect_class, w.kv || f.kv);
      if (!sku) continue;
      const cur = need.get(sku) || { sku, qty: 0, defects: new Set() };
      cur.qty += QTY[sku] || 1; cur.defects.add(f.defect_class);
      need.set(sku, cur);
    }
    const lines = [...need.values()].map((n) => {
      const a = avail[n.sku];
      const fromHome = Math.min(n.qty, a[home.id]); a[home.id] -= fromHome;
      let rest = n.qty - fromHome; const transfers = [];
      for (const d of depots) {
        if (!rest || d.id === home.id) continue;
        const take = Math.min(rest, a[d.id]); if (take > 0) { a[d.id] -= take; rest -= take; transfers.push({ depot: d.id, qty: take }); }
      }
      const part = partBySku.get(n.sku);
      return { sku: n.sku, name: part.name, qty: n.qty, uom: part.uom, unitCost: part.unitCost, value: n.qty * part.unitCost, defects: [...n.defects], fromHome, transfers, short: rest, lead: part.lead };
    });
    const short = lines.reduce((s, l) => s + l.short, 0);
    const xfer = lines.some((l) => l.transfers.length);
    const cover = !lines.length ? 'service' : short ? 'short' : xfer ? 'transfer' : 'covered';
    const mrStatus = w.stage === 'in_progress' || state.issued.has(w.id) ? 'issued' : !lines.length ? 'no material' : w.stage === 'requested' ? 'awaiting approval' : short ? 'backorder' : state.reserved.has(w.id) || w.stage === 'scheduled' ? 'reserved' : 'ready to reserve';
    jobs.push({ wo: w, home, lines, short, cover, mrStatus, value: lines.reduce((s, l) => s + l.value, 0), mr: `MR-${w.id.replace(/\D/g, '').padStart(5, '0')}`, dispatchIn: w.planned_date ? daysBetween(AS_OF, w.planned_date) : null });
  }
  // stock after allocation, and what each SKU is short across the programme
  const shortBySku = {}; const reservedBySku = {};
  for (const j of jobs) for (const l of j.lines) { if (l.short) shortBySku[l.sku] = (shortBySku[l.sku] || 0) + l.short; reservedBySku[l.sku] = (reservedBySku[l.sku] || 0) + (l.qty - l.short); }
  return { jobs, left: avail, shortBySku, reservedBySku };
}
let A = allocate();
const refresh = () => { A = allocate(); };

/* ---------------------------------------------------------------- consumption history and forecast (per SKU) */
const MONTHS = Array.from({ length: 12 }, (_, i) => addDays('2025-11-15', i * 30.4).slice(0, 7));
const FMONTHS = Array.from({ length: 6 }, (_, i) => addDays('2026-11-15', (i + 1) * 30.4).slice(0, 7));
const monLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const SEASON = [0.8, 0.75, 0.9, 1.15, 1.35, 1.2, 0.95, 0.85, 0.95, 1.25, 1.3, 1.0]; // spring + autumn inspection campaigns
const hist = new Map(net.parts.map((p) => {
  const base = Math.max(0.4, p.monthly);
  const h = MONTHS.map((m, i) => Math.max(0, Math.round(base * SEASON[(i + 11) % 12] * (0.7 + R() * 0.6) * 10) / 10));
  return [p.sku, h];
}));
function forecastOf(p) {
  const h = hist.get(p.sku);
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const sd = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length) || mean * 0.2;
  const trend = (h.slice(6).reduce((a, b) => a + b, 0) - h.slice(0, 6).reduce((a, b) => a + b, 0)) / 6 / 6;
  const pipeline = (A.reservedBySku[p.sku] || 0) + (A.shortBySku[p.sku] || 0);
  const f = FMONTHS.map((m, i) => Math.max(0, mean + trend * (i + 1) + (i === 0 ? pipeline * 0.5 : i === 1 ? pipeline * 0.3 : 0)) * SEASON[(i + 11 + 12) % 12]);
  const band = f.map((v, i) => 1.28 * sd * Math.sqrt(i + 1));
  const daily = mean / 30.4; const sdDaily = sd / Math.sqrt(30.4);
  const ss = 1.65 * sdDaily * Math.sqrt(p.lead); // 95 % cycle service level
  const rop = daily * p.lead + ss;
  const onHandNow = depots.reduce((s, d) => s + A.left[p.sku][d.id], 0);
  const cover = daily > 0 ? onHandNow / daily : 999;
  const eoq = Math.max(1, Math.round(Math.sqrt((2 * mean * 12 * 85) / (p.unitCost * 0.22)))); // order cost $85, holding 22 %/yr
  return { h, f, band, mean, sd, daily, ss, rop, cover, onHandNow, eoq, stockout: daily > 0 ? addDays(AS_OF, Math.round(cover)) : null };
}

/* ---------------------------------------------------------------- suppliers: delivery history */
const deliveries = net.suppliers.map((s) => ({ s, d: Array.from({ length: 24 }, () => Math.max(2, Math.round(s.lead * Math.exp((R() - 0.42) * 0.7)))) }));
const quart = (arr) => { const a = [...arr].sort((x, y) => x - y); const q = (p) => { const i = (a.length - 1) * p; const lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); }; return [a[0], q(0.25), q(0.5), q(0.75), a[a.length - 1]]; };

/* ---------------------------------------------------------------- purchasing documents: demo extract of SAP MM purchase orders and requisitions */
(function seedProcurement() {
  const stages = ['rfq', 'po', 'po', 'shipped', 'shipped', 'received'];
  net.parts.forEach((p, i) => {
    if (i % 4 === 3) return;
    const sup = supplierById.get(p.supplier);
    const stage = stages[i % stages.length];
    const created = addDays(AS_OF, -Math.round(5 + R() * 40));
    const qty = Math.max(1, Math.round(p.max * 0.45));
    state.pos.push({ id: `PO-${state.seqPO++}`, sku: p.sku, name: p.name, supplier: sup.id, supplierName: sup.name, qty, value: qty * p.unitCost, depot: p.unitCost > 5000 ? 'DEP-S2' : depots[i % 3].id, stage, created, eta: addDays(created, p.lead), late: addDays(created, p.lead) < AS_OF && stage !== 'received' });
  });
  A = allocate();
  for (const [sku, q] of Object.entries(A.shortBySku).slice(0, 2)) {
    const p = partBySku.get(sku); const sup = supplierById.get(p.supplier);
    state.prs.push({ id: `PR-${state.seqPR++}`, sku, name: p.name, qty: q, uom: p.uom, value: q * p.unitCost, supplier: sup.id, supplierName: sup.name, wo: null, created: addDays(AS_OF, -2), need: addDays(AS_OF, p.lead), stage: 'pr', reason: 'Shortfall on open work (MRP run 09 Nov)' });
  }
  erp.ingest('purchasing', [...state.prs, ...state.pos]); // SAP MM purchase requisitions (EBAN) and purchase orders (EKKO · EKPO)
})();

const kvTone = (v) => (v >= 60 ? 'ok' : v >= 30 ? 'warn' : 'crit');
const coverTone = (c) => (c < 14 ? '#dc2626' : c < 30 ? '#d97706' : c < 90 ? '#16a34a' : '#0284c7');
const coverBadge = (c) => `<span class="inv-cover" style="background:${coverTone(c)}1c;color:${coverTone(c)}">${c >= 999 ? '∞' : `${fmt.n(c)} d`}</span>`;
const COVER_TONE = { covered: 'ok', transfer: 'info', short: 'crit', service: 'muted' };
const COVER_LABEL = { covered: 'Covered at home depot', transfer: 'Covered with transfer', short: 'Shortfall', service: 'Service only' };
const MR_TONE = { issued: 'ok', reserved: 'accent', 'ready to reserve': 'info', backorder: 'crit', 'awaiting approval': 'muted', 'no material': 'muted' };
// A reservation or goods issue asked for from this workspace is a request to SAP MM: it shows its ERP reference until the next sync.
const mrRef = (j) => (j.mrStatus === 'issued' ? state.issued.get(j.wo.id) : j.mrStatus === 'reserved' ? state.reserved.get(j.wo.id) : null) || null;
const mrText = (j) => (!mrRef(j) ? fmt.title(j.mrStatus) : j.mrStatus === 'issued' ? 'Goods issue requested in SAP MM' : 'Reserved (requested in SAP MM)');
const prStatus = (x) => (state.prRelease.has(x.id) ? ['Release requested in SAP MM', 'accent'] : x.requested ? ['Requested · arrives with next sync', 'warn'] : ['Open in SAP MM · awaiting release', 'muted']);
const stockOf = (p) => depots.reduce((s, d) => s + p.stock[d.id], 0);
const depotHealth = (d) => { const below = net.parts.filter((p) => A.left[p.sku][d.id] < p.min / 3).length; return { below, pct: 1 - below / net.parts.length }; };

/* ================================================================== drawers */
const sec = (title, body, extra = '') => `<div class="nx-sec"${extra}><h4>${title}</h4>${body}</div>`;
const SEV_C = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };
const chk = (ok, title, sub, warn) => `<div class="inv-check"><i style="background:${ok ? '#16a34a' : warn ? '#d97706' : '#dc2626'}">${ok ? '✓' : warn ? '!' : '×'}</i><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
let ABC_CACHE = null;
const abcOf = (sku) => { if (!ABC_CACHE) ABC_CACHE = Object.fromEntries(abcRows().map((r) => [r.sku, r.abc])); return ABC_CACHE[sku]; };
const kmBetween = (a, b) => dist(a, b) * 111;
/** Stock movements for an item: goods issues to completed work, purchase orders, and the last cycle count. */
function partHistory(p) {
  const ev = [];
  for (const w of net.workOrders.filter((x) => x.status === 'completed' && x.completed_at)) {
    const n = w.findings.filter((f) => f.review_status !== 'rejected' && partFor(f.defect_class, w.kv || f.kv) === p.sku).length;
    if (n) ev.push({ date: w.completed_at, title: `Goods issue · ${n * (QTY[p.sku] || 1)} ${p.uom}`, text: `${esc(w.id)} ${esc(fmt.title(w.work_type))} at ${esc(w.towerName || w.asset)} · SAP mvt 261 from ${esc(nearestDepot(w).short)}`, tone: 'info' });
  }
  for (const po of state.pos.filter((x) => x.sku === p.sku)) ev.push({ date: po.created, title: `${po.id} · ${po.qty} ${p.uom}`, text: `${esc(po.supplierName)} · ${esc(STAGES.find(([k]) => k === po.stage)[1])} · ETA ${fmt.short(po.eta)}`, tone: po.stage === 'received' ? 'ok' : po.late ? 'warn' : 'accent' });
  for (const pr of state.prs.filter((x) => x.sku === p.sku)) ev.push({ date: pr.created, title: `${pr.id} · ${pr.requested ? 'requisition requested in SAP MM' : 'purchase requisition'} · ${pr.qty} ${p.uom}`, text: esc(pr.reason), tone: 'warn' });
  ev.push({ date: addDays(AS_OF, -3), title: 'Cycle count', text: `Counted at ${depots.map((d) => d.short).join(', ')} · book stock confirmed`, tone: 'ok' });
  return ev.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 14).map((e) => ({ ...e, when: fmt.date(e.date) }));
}

function openPart(sku) {
  const p = partBySku.get(sku); const sup = supplierById.get(p.supplier); const fc = forecastOf(p);
  const jobs = A.jobs.filter((j) => j.lines.some((l) => l.sku === sku));
  const demand = p.defects.map((d) => { const fs = net.findings.filter((f) => f.defect_class === d && f.review_status !== 'rejected'); return { d, n: fs.length, sev: ['critical', 'high', 'medium', 'low'].map((v) => fs.filter((f) => f.severity === v).length) }; });
  const onHand = stockOf(p); const short = A.shortBySku[sku] || 0;
  const pos = state.pos.filter((x) => x.sku === sku); const prs = state.prs.filter((x) => x.sku === sku);
  const inbound = pos.filter((x) => x.stage !== 'received').reduce((a, x) => a + x.qty, 0);
  const abc = abcOf(sku);
  const coverWord = fc.cover < p.lead ? ['Projected stock-out before resupply', 'crit'] : fc.cover < p.lead * 2 ? ['Watch cover', 'warn'] : ['Cover healthy', 'ok'];
  const dl = deliveries.find((d) => d.s.id === sup.id).d;
  const overview = `${ui.stats([{ label: 'On hand', value: fmt.n(onHand) }, { label: 'Free after allocation', value: fmt.n(fc.onHandNow), color: fc.onHandNow < fc.rop ? '#dc2626' : undefined }, { label: 'Inbound on PO', value: fmt.n(inbound) }, { label: 'Reorder point (est.)', value: fmt.n(fc.rop, 1) }, { label: 'Days of cover (est.)', value: fc.cover >= 999 ? '∞' : `${fmt.n(fc.cover)} d`, color: coverTone(fc.cover) }, { label: 'Unit cost', value: money(p.unitCost) }])}
    <p class="nx-note" style="margin:8px 0 12px">${ui.exp()} Reorder point, days of cover, safety stock and EOQ are estimates from an unvalidated demand model. Stock, reservations and orders are records read from SAP MM.</p>
    <div class="nx-drawer-grid">${sec(`Stock position by depot ${ui.erp('SAP MM', 'inventory')}`, `<div class="nx-chart" data-chart="pstk" style="height:190px"></div><p class="nx-note">Bars: reserved for open work and free stock. Dashed line = depot minimum (network min ${p.min} split by depot).</p>`)}
    ${sec(`Item master ${ui.erp('SAP MM', 'inventory')}`, ui.kv([['SKU', `<span class="inv-sku">${esc(p.sku)}</span>`], ['Category / UoM', `${esc(p.cat)} · ${esc(p.uom)}`], ['ABC class', ui.badge(`Class ${abc}`, { A: 'crit', B: 'warn', C: 'ok' }[abc], { dot: false })], ['Criticality', p.critical ? ui.badge('Critical spare', 'high') : 'Standard'], ['Min / max (network)', `${p.min} / ${p.max}`], ['Safety stock (95 %)', `${fmt.n(fc.ss, 1)} ${ui.exp()}`], ['EOQ', `${fmt.n(fc.eoq)} ${esc(p.uom)} ${ui.exp()}`], ['Stock value', money(onHand * p.unitCost)], ['Preferred supplier', esc(sup.name)], ['Quoted lead time', `${p.lead} days`]]))}</div>
    ${sec('Approved for defect classes', `<div class="nx-list">${demand.map((x) => `<div class="nx-li" style="padding:7px 0"><div class="nx-li-main"><b>${esc(DEFECT_LABEL[x.d] || x.d)}</b><span>${x.n} verified / pending findings · ${x.sev[0] + x.sev[1]} critical or high</span></div><div class="nx-li-end" style="width:140px"><div class="nx-bar" style="display:flex;height:8px">${x.sev.map((v, i) => `<i style="width:${x.n ? (v / x.n) * 100 : 0}%;background:${Object.values(SEV_C)[i]};border-radius:0"></i>`).join('')}</div></div></div>`).join('')}</div>`)}`;
  const demandTab = `${sec(`Consumption and 6-month forecast ${ui.exp()}`, `<div class="nx-chart" data-chart="pfc" style="height:250px"></div><p class="nx-note">Bars are goods issues read from SAP MM. The dashed line and the band are an on simulated data, not validated against real consumption.</p>`)}
    <div class="nx-drawer-grid">${sec('Where the demand comes from', '<div class="nx-chart" data-chart="pline" style="height:200px"></div>')}${sec(`Replenishment parameters ${ui.exp()}`, ui.kv([['Mean monthly use', `${fmt.n(fc.mean, 1)} ${esc(p.uom)}`], ['Std. deviation', fmt.n(fc.sd, 1)], ['Daily demand', fmt.n(fc.daily, 2)], ['Lead-time demand', fmt.n(fc.daily * p.lead, 1)], ['Safety stock', fmt.n(fc.ss, 1)], ['Reorder point', fmt.n(fc.rop, 1)], ['Projected stock-out', fc.stockout ? fmt.date(fc.stockout) : 'not in horizon'], ['Programme shortfall', short ? ui.badge(`${short} ${p.uom}`, 'crit') : 'none']]))}</div>`;
  const woTab = `<div class="nx-drawer-grid">${sec('Allocation of demand', '<div class="nx-chart" data-chart="pwo" style="height:190px"></div>')}${sec('Readiness', `${chk(!short, short ? `${short} ${p.uom} short across the programme` : 'All open work covered', short ? `Earliest resupply ${fmt.date(addDays(AS_OF, p.lead))}` : 'From home depots and transfers')}${chk(fc.onHandNow >= fc.rop, fc.onHandNow >= fc.rop ? 'Above reorder point after reservations' : 'Below reorder point after reservations', `Free ${fmt.n(fc.onHandNow)} vs estimated ROP ${fmt.n(fc.rop, 1)}`, true)}${chk(inbound > 0 || fc.onHandNow >= fc.rop, inbound ? `${inbound} ${p.uom} inbound on ${pos.filter((x) => x.stage !== 'received').length} PO(s)` : 'No inbound order', inbound ? `Next ETA ${fmt.date(pos.filter((x) => x.stage !== 'received').map((x) => x.eta).sort()[0])}` : 'Request a purchase requisition in SAP MM if the position falls further', true)}`)}</div>
    ${sec(`Open work orders using this item (${jobs.length}) ${ui.erp('SAP PM', 'workOrders')}`, jobs.length ? `<table class="inv-mini"><thead><tr><th>WO</th><th>Asset</th><th>Planned</th><th>Stage</th><th class="r">Qty</th><th>Source</th></tr></thead><tbody>${jobs.slice(0, 14).map((j) => { const l = j.lines.find((x) => x.sku === sku); return `<tr><td class="inv-sku">${esc(j.wo.id)}</td><td>${esc(j.wo.towerName || j.wo.asset)}<span class="nx-sub">${esc(j.wo.line || 'Substation')}</span></td><td>${fmt.short(j.wo.planned_date)}</td><td>${ui.badge(STAGE_LABEL[j.wo.stage], STAGE_TONE[j.wo.stage])}</td><td class="r">${l.qty}</td><td>${l.short ? ui.badge(`short ${l.short}`, 'crit') : l.transfers.length ? ui.badge(`transfer ${l.transfers.map((t) => depotName[t.depot]).join(', ')}`, 'info') : ui.badge(depotName[j.home.id], 'ok')}</td></tr>`; }).join('')}</tbody></table>` : ui.empty('No open work order needs this item.'))}`;
  const supplyTab = `${ui.stats([{ label: 'Supplier OTD', value: `${sup.otd}%`, color: sup.otd < 85 ? '#dc2626' : sup.otd < 92 ? '#d97706' : '#16a34a' }, { label: 'Quoted lead', value: `${sup.lead} d` }, { label: 'Median actual', value: `${fmt.n(quart(dl)[2])} d` }, { label: 'Quality', value: `${sup.quality}%` }])}
    ${sec(`${esc(sup.name)} — last 24 deliveries ${ui.erp('SAP MM', 'suppliers')}`, '<div class="nx-chart" data-chart="psd" style="height:170px"></div>')}
    ${sec(`Purchase orders and requisitions (${pos.length + prs.length}) ${ui.erp('SAP MM', 'purchasing')}`, pos.length + prs.length ? `<table class="inv-mini"><thead><tr><th>Document</th><th class="r">Qty</th><th class="r">Value</th><th>Deliver to</th><th>ETA / need</th><th>Status</th></tr></thead><tbody>${[...prs.map((x) => `<tr><td class="inv-sku">${esc(x.id)}</td><td class="r">${x.qty}</td><td class="r">${money(x.value)}</td><td>—</td><td>${fmt.short(x.need)}</td><td>${ui.badge(x.requested ? 'Requested in SAP MM' : 'Purchase requisition', x.requested ? 'warn' : 'muted')}</td></tr>`), ...pos.map((x) => `<tr><td class="inv-sku">${esc(x.id)}</td><td class="r">${x.qty}</td><td class="r">${money(x.value)}</td><td>${esc(depotName[x.depot])}</td><td>${fmt.short(x.eta)}${x.late ? ` ${ui.badge('late', 'crit')}` : ''}</td><td>${ui.badge(STAGES.find(([k]) => k === x.stage)[1], { rfq: 'muted', po: 'accent', shipped: 'violet', received: 'ok' }[x.stage])}</td></tr>`)].join('')}</tbody></table>` : ui.empty('No open purchasing documents for this item.'))}`;
  const historyTab = `${sec(`Stock movements and documents ${ui.erp('SAP MM', 'inventory')}`, ui.timeline(partHistory(p)))}`;
  const stockChart = (el, ctx) => {
    const res = depots.map((d) => Math.max(0, p.stock[d.id] - A.left[sku][d.id])); const free = depots.map((d) => Math.max(0, A.left[sku][d.id]));
    ctx.chart('pstk', { grid: ch.grid({ top: 26, right: 16 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(ps[0].name)}</b><br/>${ps.map((x) => `${x.marker}${esc(x.seriesName)}: <b>${x.value} ${esc(p.uom)}</b>`).join('<br/>')}<br/>Depot minimum: ${fmt.n(p.min / 3, 1)}` }, xAxis: { type: 'value' }, yAxis: { type: 'category', data: depots.map((d) => d.short), inverse: true }, series: [{ type: 'bar', name: 'Reserved for work', stack: 's', data: res, itemStyle: { color: '#94a3b8' }, barWidth: 16 }, { type: 'bar', name: 'Free', stack: 's', data: free.map((v) => ({ value: v, itemStyle: { color: v < p.min / 3 ? '#dc2626' : '#2563eb', borderRadius: [0, 4, 4, 0] } })), markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: '#0f172a' }, label: { formatter: 'min', color: '#475569' }, data: [{ xAxis: +(p.min / 3).toFixed(1) }] } }] });
  };
  drawer.open({
    kicker: `${p.cat} · ${p.uom} · approved catalogue item`, title: p.name, sub: `<span class="inv-sku">${esc(p.sku)}</span> · ${esc(sup.name)} · ${p.defects.length} defect class${p.defects.length > 1 ? 'es' : ''}`, icon: 'box', wide: true,
    badges: [[`Class ${abc}`, { A: 'crit', B: 'warn', C: 'ok' }[abc]], ...(p.critical ? [['Critical spare', 'high']] : []), coverWord, ['cover estimate', 'warn'], ...(short ? [[`${short} ${p.uom} short`, 'crit']] : []), [`Lead ${p.lead} d`, 'info'], ['ERP · SAP MM', 'info']],
    meta: `SAP MM material ${p.sku} · plant AZ01 · as of ${fmt.date(AS_OF)}`,
    tabs: [
      { name: 'Overview', body: overview, mount: stockChart },
      { name: 'Demand & forecast', body: demandTab, mount: (el, ctx) => {
        ctx.chart('pfc', forecastChart(p, fc, true));
        const lines = ['L-132-01', 'L-220-03', 'L-500-01', 'Substation'];
        const fs = net.findings.filter((f) => p.defects.includes(f.defect_class) && f.review_status !== 'rejected');
        ctx.chart('pline', ch.bar({ x: lines, stack: true, series: ['critical', 'high', 'medium', 'low'].map((v) => ({ name: fmt.title(v), color: SEV_C[v], data: lines.map((l) => fs.filter((f) => (f.line || 'Substation') === l && f.severity === v).length) })), yName: 'findings', grid: { top: 30 } }));
      } },
      { name: `Work orders (${jobs.length})`, body: woTab, mount: (el, ctx) => {
        const home = jobs.reduce((a, j) => a + (j.lines.find((l) => l.sku === sku)?.fromHome || 0), 0); const xf = jobs.reduce((a, j) => a + (j.lines.find((l) => l.sku === sku)?.transfers.reduce((x, t) => x + t.qty, 0) || 0), 0); const sh = jobs.reduce((a, j) => a + (j.lines.find((l) => l.sku === sku)?.short || 0), 0);
        ctx.chart('pwo', ch.donut({ data: [{ name: 'From home depot', value: home, color: '#16a34a' }, { name: 'By transfer', value: xf, color: '#0284c7' }, { name: 'Short', value: sh, color: '#dc2626' }], center: `${p.uom} needed`, legend: 'right' }));
      } },
      { name: 'Supply', body: supplyTab, mount: (el, ctx) => ctx.chart('psd', deliveryChart(sup, dl)) },
      { name: 'History', body: historyTab },
    ],
    actions: [{ label: 'Request PR in SAP MM', icon: 'cart', onClick: (close) => { raisePR(sku, Math.max(fc.eoq, Math.ceil(short + fc.rop - fc.onHandNow))); close(); } }, { label: 'Open in forecast', icon: 'forecast', onClick: (close) => { close(); nav.go('forecast', 0); setTimeout(() => { const s2 = document.getElementById('inv-fsku'); if (s2) { s2.value = sku; s2.dispatchEvent(new Event('change')); } }, 50); } }],
  });
}
function deliveryChart(sup, dl) {
  return { grid: ch.grid({ top: 14 }), tooltip: { trigger: 'axis', formatter: (ps) => `Delivery ${esc(ps[0].name)}<br/>Actual lead <b>${ps[0].value} d</b> vs quoted ${sup.lead} d<br/>${ps[0].value > sup.lead * 1.15 ? '<span style="color:#fca5a5">Late (more than 15 % over quote)</span>' : 'On time'}` }, xAxis: { type: 'category', data: dl.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 10 } }, yAxis: { type: 'value', name: 'days' }, series: [{ type: 'bar', data: dl.map((v) => ({ value: v, itemStyle: { color: v > sup.lead * 1.15 ? '#ef4444' : '#3b82f6', borderRadius: [3, 3, 0, 0] } })), markLine: { symbol: 'none', data: [{ yAxis: sup.lead, name: 'Quoted' }], lineStyle: { color: '#0f172a', type: 'dashed' }, label: { formatter: 'quoted {c} d', color: '#475569' } } }] };
}
function openJob(woId) {
  const j = A.jobs.find((x) => x.wo.id === woId); if (!j) return;
  const w = j.wo;
  const maxLead = j.short ? Math.max(...j.lines.filter((l) => l.short).map((l) => l.lead)) : 0;
  const late = j.short && j.dispatchIn != null && maxLead > j.dispatchIn;
  const km = w.lat ? kmBetween(w, j.home) : null;
  const xferDepots = [...new Set(j.lines.flatMap((l) => l.transfers.map((t) => depotName[t.depot])))];
  const resRef = j.mrStatus === 'reserved' || j.mrStatus === 'issued' ? state.reserved.get(w.id) : null; const giRef = j.mrStatus === 'issued' ? state.issued.get(w.id) : null; // ERP references of requests sent to SAP MM
  const bom = `${ui.stats([{ label: 'Home depot', value: j.home.short }, { label: 'Planned', value: fmt.short(w.planned_date) }, { label: 'Dispatch in', value: j.dispatchIn == null ? '—' : `${j.dispatchIn} d`, color: late ? '#dc2626' : undefined }, { label: 'Material value', value: money(j.value) }, { label: 'BOM lines', value: j.lines.length }])}
    ${j.lines.length ? sec('Allocation by line', `<div class="nx-chart" data-chart="jalloc" style="height:${Math.max(120, j.lines.length * 34 + 50)}px"></div>`) : ''}
    ${sec('Bill of materials — derived from the verified findings', j.lines.length ? `<table class="inv-mini"><thead><tr><th>SKU</th><th>Item</th><th>For defect</th><th class="r">Qty</th><th class="r">Value</th><th>Allocation</th></tr></thead><tbody>${j.lines.map((l) => `<tr><td class="inv-sku">${esc(l.sku)}</td><td>${esc(l.name)}</td><td>${l.defects.map((d) => esc(DEFECT_LABEL[d] || d)).join(', ')}</td><td class="r">${l.qty} ${esc(l.uom)}</td><td class="r">${money(l.value)}</td><td>${l.fromHome ? ui.badge(`${l.fromHome} @ ${j.home.short}`, 'ok') : ''} ${l.transfers.map((t) => ui.badge(`${t.qty} from ${depotName[t.depot]}`, 'info')).join(' ')} ${l.short ? ui.badge(`${l.short} short · ${l.lead} d lead`, 'crit') : ''}</td></tr>`).join('')}</tbody></table>` : ui.callout('This job is service-only (no stock material). Labour and equipment only.', 'info'))}
    ${j.short ? ui.callout(`<b>${j.short} unit(s) short.</b> Estimated earliest delivery ${fmt.date(addDays(AS_OF, maxLead))} (ordered today, quoted lead time). Planned date ${fmt.date(w.planned_date)} is ${late ? '<b>at risk</b> — expedite, substitute or re-sequence' : 'still achievable'}. ${ui.exp()}`, late ? 'crit' : 'warn', 'alert') : ''}`;
  const assetTab = `<div class="nx-drawer-grid">${sec('Work order', ui.kv([['Work type', esc(fmt.title(w.work_type))], ['Asset', esc(w.towerName || w.asset)], ['Line / voltage', `${esc(w.line || 'Substation')}${w.kv ? ` · ${w.kv} kV` : ''}`], ['Corridor', esc(w.corridor || '—')], ['Crew', esc(w.crewName)], ['Priority', ui.badge(w.priority, w.priority === 'high' ? 'high' : 'muted')], ['SAP PM / Maximo', `${esc(w.sap)} · ${esc(w.maximo)}`], ['Outage needed', w.outage ? 'Yes — planned outage window' : 'No (live-line / off-circuit)']]))}
    ${sec('Severity of findings', '<div class="nx-chart" data-chart="jsev" style="height:200px"></div>')}</div>
    ${sec(`Findings behind this work order (${w.findings.length})`, `<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: SEV_C[f.severity], title: `${f.finding_id} · ${f.label}`, sub: `${esc(f.towerName || f.assetName || '')} · ${f.sensor.toUpperCase()} · conf ${fmt.n(f.confidence * 100)}% · ${f.review_status} · ${fmt.short(f.date)}`, end: ui.badge(f.severity, SEV_TONE[f.severity]) })).join('') || ui.empty()}</div>`)}`;
  const steps = [
    { when: fmt.date(w.created_at), title: `${j.mr} derived from ${w.id}`, text: `${j.lines.length} BOM lines generated from ${w.findings.length} finding(s)`, tone: 'ok' },
    { when: w.stage === 'requested' ? 'Pending' : 'Done', title: 'Work order approved', text: 'Maintenance planner · SAP PM release', tone: w.stage === 'requested' ? 'muted' : 'ok' },
    { when: resRef ? 'Requested' : ['reserved', 'issued'].includes(j.mrStatus) ? 'Done' : j.short ? 'Blocked' : 'Next', title: `Stock reserved at ${j.home.short}`, text: resRef ? `Reservation requested in SAP MM as <span class="inv-sku">${esc(resRef)}</span> · the RESB document arrives with the next sync` : 'SAP MM reservation (RESB), picking list printed', tone: ['reserved', 'issued'].includes(j.mrStatus) ? 'ok' : j.short ? 'crit' : 'warn' },
    ...(xferDepots.length ? [{ when: 'Transfer · 1–2 days', title: `Transfer from ${xferDepots.join(', ')}`, text: 'Stock transport order to the home depot', tone: 'info' }] : []),
    ...(j.short ? [{ when: fmt.date(addDays(AS_OF, maxLead)), title: 'Supplier delivery for shortfall', text: `Longest lead ${maxLead} d`, tone: late ? 'crit' : 'warn' }] : []),
    { when: fmt.date(w.planned_date), title: `Kit issued to ${w.crewName}`, text: `Goods issue mvt 261 · ${km != null ? `${fmt.n(km, 1)} km depot → site` : 'site distance n/a'}${giRef ? ` · requested in SAP MM (ERP request reference <span class="inv-sku">${esc(giRef)}</span>), posted by SAP MM and synced back` : ''}`, tone: j.mrStatus === 'issued' ? 'ok' : 'muted' },
  ];
  const logistics = `<div class="nx-drawer-grid">${sec('Dispatch readiness', `${chk(w.stage !== 'requested', 'Work order approved', STAGE_LABEL[w.stage])}${chk(!j.short, j.short ? `${j.short} unit(s) short` : 'All material available', j.short ? `Waiting on ${j.lines.filter((l) => l.short).map((l) => l.sku).join(', ')}` : `${j.cover === 'transfer' ? 'Includes depot transfer' : 'At home depot'}`)}${chk(['reserved', 'issued'].includes(j.mrStatus), ['reserved', 'issued'].includes(j.mrStatus) ? 'Material reserved' : 'Not yet reserved', mrText(j), true)}${chk(!late, late ? 'Supply arrives after dispatch' : 'Supply in time for dispatch', j.dispatchIn != null ? `Dispatch in ${j.dispatchIn} d · longest lead ${maxLead} d` : '')}${chk(true, `Crew assigned · ${w.crewName}`, w.crew)}`)}
    ${sec('Logistics', ui.kv([['Home depot', esc(j.home.name)], ['Depot → site', km != null ? `${fmt.n(km, 1)} km` : '—'], ['Transfers', xferDepots.length ? esc(xferDepots.join(', ')) : 'none'], ['Vehicle', esc(net.crews.find((c) => c.id === w.crew)?.vehicle || '—')], ['Material weight (est.)', `${fmt.n(j.lines.reduce((a, l) => a + l.qty * (l.unitCost > 5000 ? 800 : l.unitCost > 1000 ? 120 : 4), 0))} kg`]]))}</div>
    ${sec('Material request timeline', ui.timeline(steps))}`;
  drawer.open({
    kicker: `Material request ${j.mr} · SAP PM ${w.sap}`, title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${esc(w.line || 'Substation')} · ${esc(w.crewName)}`, icon: 'clipboard', wide: true,
    badges: [[STAGE_LABEL[w.stage], STAGE_TONE[w.stage]], [COVER_LABEL[j.cover], COVER_TONE[j.cover]], [mrText(j), MR_TONE[j.mrStatus]], [`${w.priority} priority`, w.priority === 'high' ? 'high' : 'muted'], ...(late ? [['Dispatch at risk (est.)', 'crit']] : []), ['ERP · SAP PM', 'info']],
    meta: `Work order from SAP PM · reservations read from SAP MM (RESB) and Maximo inventory usage · ${fmt.date(AS_OF)}`,
    tabs: [
      { name: 'Bill of materials', body: bom, mount: (el, ctx) => { if (!j.lines.length) return; ctx.chart('jalloc', { grid: ch.grid({ top: 26, right: 16 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: { type: 'value', name: 'qty' }, yAxis: { type: 'category', inverse: true, data: j.lines.map((l) => l.sku) }, series: [['From home depot', (l) => l.fromHome, '#16a34a'], ['Transfer', (l) => l.transfers.reduce((a, t) => a + t.qty, 0), '#0284c7'], ['Short', (l) => l.short, '#dc2626']].map(([n, f, c]) => ({ type: 'bar', stack: 'a', name: n, data: j.lines.map(f), itemStyle: { color: c }, barWidth: 14 })) }); } },
      { name: 'Findings & asset', body: assetTab, mount: (el, ctx) => ctx.chart('jsev', ch.donut({ data: ['critical', 'high', 'medium', 'low'].map((v) => ({ name: fmt.title(v), value: w.findings.filter((f) => f.severity === v).length, color: SEV_C[v] })).filter((x) => x.value), center: 'findings', legend: 'right' })) },
      { name: 'Logistics & readiness', body: logistics },
    ],
    actions: [
      ...(j.short ? [{ label: 'Request PR for shortfall in SAP MM', icon: 'cart', onClick: (close) => { j.lines.filter((l) => l.short).forEach((l) => raisePR(l.sku, l.short, w.id)); close(); } }] : []),
      ...(j.mrStatus === 'ready to reserve' ? [{ label: 'Request reservation in SAP MM', icon: 'lock', primary: true, onClick: (close) => { reserve([w.id]); close(); } }] : []),
      ...(j.mrStatus === 'reserved' ? [{ label: 'Request goods issue in SAP MM', icon: 'truck', primary: true, onClick: (close) => { state.issued.set(w.id, erpRequest('inventory', `Goods issue (mvt 261) · ${j.mr} to ${w.crewName} from ${j.home.short}`, { wo: w.id, sap: w.sap, depot: j.home.id, lines: j.lines.map((l) => ({ sku: l.sku, qty: l.qty })) }).ref); refresh(); close(); nav.rerender(); } }] : []),
    ],
  });
}
const otdTrend = (s) => { const r = rng(s.id.charCodeAt(4) * 31); return MONTHS.map((_, i) => clamp(Math.round(s.otd + (r() - 0.5) * 9 + (i - 6) * 0.25), 60, 100)); };
const CONTRACT = { 'SUP-01': ['Vendor-managed inventory', 'DAP Baku · 30 d net', 'VMI-2025-014 · to Dec 2027'], 'SUP-02': ['Frame agreement + call-off', 'FCA Gebze · 45 d net', 'FA-2024-207 · to Jun 2027'], 'SUP-03': ['Frame agreement', 'CIP Baku · 60 d net', 'FA-2025-031 · to Mar 2028'], 'SUP-04': ['Spot + improvement plan', 'DAP Baku · 30 d net', 'PO-by-PO · on watch'], 'SUP-05': ['Service & spares agreement', 'CIP Baku · 60 d net', 'SSA-2023-009 · to Dec 2026'], 'SUP-06': ['Catalogue contract', 'DAP site · 15 d net', 'CC-2025-112 · to Dec 2026'], 'SUP-07': ['Frame agreement', 'CIP Baku · 45 d net', 'FA-2025-058 · to Sep 2027'] };
function openSupplier(id) {
  const s = supplierById.get(id); const parts = net.parts.filter((p) => p.supplier === id); const dl = deliveries.find((d) => d.s.id === id).d; const pos = state.pos.filter((p) => p.supplier === id);
  const late = pos.filter((p) => p.late).length; const openVal = pos.filter((p) => p.stage !== 'received').reduce((a, p) => a + p.value, 0);
  const shortU = parts.reduce((a, p) => a + (A.shortBySku[p.sku] || 0), 0);
  const [ctype, terms, ref] = CONTRACT[id] || ['Spot buy', 'DAP Baku · 30 d net', '—'];
  const perf = `${ui.stats([{ label: 'On-time delivery', value: `${s.otd}%`, color: s.otd < 85 ? '#dc2626' : s.otd < 92 ? '#d97706' : '#16a34a' }, { label: 'Quoted lead', value: `${s.lead} d` }, { label: 'Median actual', value: `${fmt.n(quart(dl)[2])} d` }, { label: 'Quality (accept)', value: `${s.quality}%` }, { label: '12-mo spend', value: money(s.spend) }])}
    ${sec('Last 24 deliveries — actual lead time (days)', '<div class="nx-chart" data-chart="sdl" style="height:180px"></div>')}
    <div class="nx-drawer-grid">${sec('On-time delivery, last 12 months', '<div class="nx-chart" data-chart="sotd" style="height:180px"></div>')}${sec('Lead-time spread', ui.kv([['Fastest', `${quart(dl)[0]} d`], ['Lower quartile', `${fmt.n(quart(dl)[1])} d`], ['Median', `${fmt.n(quart(dl)[2])} d`], ['Upper quartile', `${fmt.n(quart(dl)[3])} d`], ['Slowest', `${quart(dl)[4]} d`], ['Late deliveries', `${dl.filter((v) => v > s.lead * 1.15).length} of ${dl.length}`]]))}</div>`;
  const items = `${sec(`Approved items (${parts.length}) ${ui.erp('SAP MM', 'inventory')}`, `<table class="inv-mini"><thead><tr><th>SKU</th><th>Item</th><th class="r">Unit</th><th class="r">Lead</th><th class="r">On hand</th><th class="r">Shortfall</th></tr></thead><tbody>${parts.map((p) => `<tr><td class="inv-sku">${esc(p.sku)}</td><td>${esc(p.name)}</td><td class="r">${money(p.unitCost)}</td><td class="r">${p.lead} d</td><td class="r">${fmt.n(stockOf(p))}</td><td class="r">${A.shortBySku[p.sku] ? ui.badge(String(A.shortBySku[p.sku]), 'crit') : '—'}</td></tr>`).join('')}</tbody></table>`)}
    ${sec(`Purchase orders (${pos.length}) ${ui.erp('SAP MM', 'purchasing')}`, pos.length ? `<table class="inv-mini"><thead><tr><th>PO</th><th>SKU</th><th class="r">Qty</th><th class="r">Value</th><th>ETA</th><th>Status</th></tr></thead><tbody>${pos.map((x) => `<tr><td class="inv-sku">${esc(x.id)}</td><td class="inv-sku">${esc(x.sku)}</td><td class="r">${x.qty}</td><td class="r">${money(x.value)}</td><td>${fmt.short(x.eta)}${x.late ? ` ${ui.badge('late', 'crit')}` : ''}</td><td>${ui.badge(STAGES.find(([k]) => k === x.stage)[1], { rfq: 'muted', po: 'accent', shipped: 'violet', received: 'ok' }[x.stage])}</td></tr>`).join('')}</tbody></table>` : ui.empty('No purchase orders with this supplier.'))}`;
  const contract = `<div class="nx-drawer-grid">${sec('Commercial terms', ui.kv([['Agreement', esc(ctype)], ['Reference', esc(ref)], ['Incoterms / payment', esc(terms)], ['Category', esc(s.cat)], ['Country', esc(s.country)], ['Open commitments', money(openVal)]]))}
    ${sec('Risk position', `${chk(s.otd >= 90, `On-time delivery ${s.otd}%`, s.otd >= 90 ? 'Within the 90 % target' : 'Below the 90 % target — expediting call in place', s.otd >= 85)}${chk(s.quality >= 98, `Incoming quality ${s.quality}%`, 'Accepted at goods receipt', true)}${chk(!shortU, shortU ? `${shortU} units short on open work` : 'No shortfall exposure', shortU ? 'Items from this supplier block dispatch' : '')}${chk(!late, late ? `${late} PO(s) past promised date` : 'No late purchase orders', '', true)}${chk(s.country === 'Azerbaijan', s.country === 'Azerbaijan' ? 'Domestic supply' : `Import from ${s.country}`, s.country === 'Azerbaijan' ? 'No customs exposure' : 'Customs clearance adds 3–7 days', true)}`)}</div>`;
  drawer.open({
    kicker: `${s.country} · ${s.cat}`, title: s.name, sub: `${s.id} · ${parts.length} approved catalogue items · ${pos.length} purchase orders`, icon: 'factory', wide: true,
    badges: [[`OTD ${s.otd}%`, s.otd < 85 ? 'crit' : s.otd < 92 ? 'warn' : 'ok'], [`Quality ${s.quality}%`, s.quality >= 98 ? 'ok' : 'warn'], [esc(ctype), 'info'], ...(late ? [[`${late} late PO`, 'crit']] : []), ...(shortU ? [[`${shortU} units short`, 'crit']] : []), ['ERP · SAP MM', 'info']],
    meta: `SAP MM vendor master ${s.id} · read through the integration layer · scorecard refreshed weekly`,
    tabs: [
      { name: 'Performance', body: perf, mount: (el, ctx) => { ctx.chart('sdl', deliveryChart(s, dl)); ctx.chart('sotd', ch.line({ x: MONTHS.map(monLabel), series: [{ name: 'OTD %', data: otdTrend(s), color: '#2563eb', area: true, symbol: true }], yMin: 60, yMax: 100, legend: false, markArea: { silent: true, data: [[{ yAxis: 90, itemStyle: { color: 'rgba(22,163,74,.07)' } }, { yAxis: 100 }]] } })); } },
      { name: `Items & orders (${parts.length + pos.length})`, body: items },
      { name: 'Contract & risk', body: contract },
    ],
    actions: [{ label: 'Request expedite in SAP MM', icon: 'clock', onClick: (close) => { const open = pos.filter((x) => x.stage !== 'received'); erpRequest('purchasing', `Expedite · ${open.length} open order(s) with ${s.name}`, { supplier: s.id, orders: open.map((x) => x.id) }); close(); } }, { label: 'Request PR in SAP MM', icon: 'cart', primary: true, onClick: (close) => { const p = parts.slice().sort((x, y) => (A.shortBySku[y.sku] || 0) - (A.shortBySku[x.sku] || 0))[0]; raisePR(p.sku, Math.max(1, A.shortBySku[p.sku] || forecastOf(p).eoq)); close(); } }],
  });
}
function openPO(id) {
  const po = state.pos.find((p) => p.id === id); if (!po) return;
  const i = STAGES.findIndex(([k]) => k === po.stage); const p = partBySku.get(po.sku); const sup = supplierById.get(po.supplier);
  const waiting = A.jobs.filter((j) => j.lines.some((l) => l.sku === po.sku && l.short));
  // The document flow belongs to SAP MM: the next step is requested there and comes back with the sync. Nothing is set here.
  const req = state.poReq.get(po.id);
  const next = { rfq: ['Request PO release in SAP MM', 'purchasing', 'PO release', 'PO release requested in SAP MM'], po: ['Request delivery confirmation in SAP MM', 'purchasing', 'Delivery confirmation', 'Delivery confirmation requested in SAP MM'], shipped: ['Request goods receipt in SAP MM (mvt 101)', 'inventory', 'Goods receipt (mvt 101)', 'Goods receipt requested in SAP MM'] }[po.stage];
  const body = `${req ? ui.callout(`<b>${esc(req.label)}</b> · ERP request reference <span class="inv-sku">${esc(req.ref)}</span>. SAP MM updates the purchase order; the new status arrives with the next sync.`, 'info', 'database') : ''}${ui.stats([{ label: 'Quantity', value: `${po.qty} ${p.uom}` }, { label: 'Value', value: money(po.value) }, { label: 'Deliver to', value: depotName[po.depot] }, { label: 'Promised', value: fmt.short(po.eta), color: po.late ? '#dc2626' : undefined }, { label: 'Days to ETA', value: `${daysBetween(AS_OF, po.eta)} d` }])}
    <div class="nx-drawer-grid">${sec('Document flow', ui.timeline(STAGES.map(([k, l], x) => ({ when: x < i ? 'Done' : x === i ? 'Current' : 'Pending', title: l, text: x === 0 ? `Created ${fmt.date(po.created)}` : x === 2 ? `Released to ${esc(po.supplierName)}` : x === 4 ? `Goods receipt into ${esc(depotName[po.depot])} (mvt 101)` : '', tone: x < i ? 'ok' : x === i ? (po.late ? 'crit' : 'warn') : 'muted' }))))}
    ${sec('Line item', ui.kv([['SKU', `<span class="inv-sku">${esc(po.sku)}</span>`], ['Item', esc(po.name)], ['Unit price', money(p.unitCost)], ['Supplier', esc(po.supplierName)], ['Supplier OTD', `${sup.otd}%`], ['Quoted lead', `${p.lead} d`], ['Incoterms', esc((CONTRACT[po.supplier] || [])[1] || 'DAP Baku')]]))}</div>
    ${sec(`Work orders waiting on this item (${waiting.length}) ${ui.erp('SAP PM', 'workOrders')}`, waiting.length ? `<div class="nx-list">${waiting.slice(0, 8).map((j) => ui.li({ ic: 'clipboard', color: '#dc2626', title: `${j.wo.id} · ${fmt.title(j.wo.work_type)}`, sub: `${esc(j.wo.towerName || j.wo.asset)} · planned ${fmt.short(j.wo.planned_date)} · ${j.lines.find((l) => l.sku === po.sku).short} short`, end: ui.badge(j.home.short, 'muted', { dot: false }) })).join('')}</div>` : `<p class="nx-note" style="margin:0 0 8px">No open work order is waiting on this item — this order replenishes stock. Position after allocation:</p>${depots.map((d) => `<div class="inv-dep"><span>${esc(d.short)}${d.id === po.depot ? ' <b style="color:var(--nx-accent)">← delivery</b>' : ''}</span><div class="nx-bar"><i style="width:${clamp((A.left[po.sku][d.id] / Math.max(1, p.max / 3)) * 100, 0, 100)}%;background:${A.left[po.sku][d.id] < p.min / 3 ? '#dc2626' : '#2563eb'}"></i></div><span class="nx-num" style="text-align:right">${fmt.n(A.left[po.sku][d.id])} free</span></div>`).join('')}`)}`;
  drawer.open({
    kicker: `Purchase order · ${po.supplierName}`, title: po.id, sub: `<span class="inv-sku">${esc(po.sku)}</span> · ${esc(po.name)}`, icon: 'cart',
    badges: [[STAGES[i][1], { rfq: 'muted', po: 'accent', shipped: 'violet', received: 'ok' }[po.stage] || 'muted'], ...(po.late ? [['Past promised date', 'crit']] : []), [depotName[po.depot], 'info'], ...(req ? [[req.label, 'warn']] : []), ['ERP · SAP MM', 'info']],
    meta: `Read from SAP MM (ME23N) · created ${fmt.date(po.created)}`,
    body,
    actions: next && !req ? [{ label: 'Open supplier', icon: 'factory', onClick: () => openSupplier(po.supplier) }, { label: next[0], primary: true, onClick: (close) => { const r = erpRequest(next[1], `${next[2]} · ${po.id} · ${po.qty} × ${po.sku}`, { po: po.id, sku: po.sku, qty: po.qty, depot: po.depot, supplier: po.supplier }); state.poReq.set(po.id, { ref: r.ref, label: next[3] }); close(); nav.rerender(); } }] : [{ label: 'Open supplier', icon: 'factory', onClick: () => openSupplier(po.supplier) }],
  });
}

/* ================================================================== actions: requests to the ERP */
// Nothing below creates or edits an ERP record. Each action sends a REQUEST to SAP MM through the integration layer
// (erpRequest: one request, with its toast; erp.request: the same without a toast, for a batch that reports once).
// SAP MM creates the requisition, reservation or goods issue; the dashboard shows the ERP reference it was given and
// the document itself arrives with the next sync.
const viaConnector = () => (erp.adapter.live ? '' : ' (simulated connector)');
/** The line shown for a requisition request: the ERP reference and what was asked for. Not a document held here. */
const prRequestRow = (r, p, sup, qty, wo, reason) => ({ id: r.ref, sku: p.sku, name: p.name, qty, uom: p.uom, value: qty * p.unitCost, supplier: sup.id, supplierName: sup.name, wo: wo || null, created: AS_OF, need: addDays(AS_OF, p.lead), stage: 'pr', reason, requested: true });
/** Ask SAP MM for a purchase requisition. */
function raisePR(sku, qty, wo) {
  const p = partBySku.get(sku); const sup = supplierById.get(p.supplier);
  qty = Math.max(1, Math.round(qty));
  const r = erpRequest('purchasing', `Purchase requisition · ${qty} × ${sku}`, { sku, qty, uom: p.uom, supplier: sup.id, wo: wo || null, needBy: addDays(AS_OF, p.lead) });
  const pr = prRequestRow(r, p, sup, qty, wo, wo ? `Shortfall on ${wo}` : 'Below reorder point');
  state.prs.unshift(pr);
  nav.rerender();
  return pr;
}
/** Ask SAP MM to reserve the material of the given work orders (one reservation request per work order). */
function reserve(ids) {
  const fresh = ids.filter((id) => !state.reserved.has(id)).map((id) => A.jobs.find((j) => j.wo.id === id)).filter(Boolean);
  const ask = (j, send) => send('inventory', `Reservation · ${j.mr} for ${j.wo.id} at ${j.home.short}`, { wo: j.wo.id, sap: j.wo.sap, depot: j.home.id, lines: j.lines.map((l) => ({ sku: l.sku, qty: l.qty })) }).ref;
  if (fresh.length === 1) state.reserved.set(fresh[0].wo.id, ask(fresh[0], erpRequest));
  else {
    for (const j of fresh) state.reserved.set(j.wo.id, ask(j, erp.request));
    toast(fresh.length ? `${fresh.length} reservation requests sent to SAP MM${viaConnector()}. SAP MM creates the reservations (RESB); they arrive with the next sync.` : 'Nothing new to reserve.');
  }
  refresh();
  nav.rerender();
}
/** Ask SAP MM for a requisition for every item under its estimated reorder point (reorder model, 'inv-reorder'). */
function autoReplenish() {
  const made = [];
  for (const p of net.parts) {
    const fc = forecastOf(p); const short = A.shortBySku[p.sku] || 0;
    const inbound = state.pos.filter((x) => x.sku === p.sku && x.stage !== 'received').reduce((s, x) => s + x.qty, 0) + state.prs.filter((x) => x.sku === p.sku).reduce((s, x) => s + x.qty, 0);
    const position = fc.onHandNow + inbound - short;
    if (position < fc.rop) {
      const qty = Math.max(fc.eoq, Math.ceil(fc.rop - position + fc.ss)); const sup = supplierById.get(p.supplier);
      const pr = prRequestRow(erp.request('purchasing', `Purchase requisition · ${qty} × ${p.sku} (reorder suggestion)`, { sku: p.sku, qty, uom: p.uom, supplier: sup.id, needBy: addDays(AS_OF, p.lead) }), p, sup, qty, null, 'Reorder suggestion (model)');
      state.prs.unshift(pr); made.push(pr);
    }
  }
  toast(made.length ? `${made.length} requisition requests sent to SAP MM${viaConnector()} from the reorder suggestions (${money(made.reduce((s, x) => s + x.value, 0))}). SAP MM creates the requisitions; they arrive with the next sync.` : 'Every item is above its estimated reorder point once open orders arrive.', made.length ? 'warn' : 'ok');
  nav.rerender();
}

/* ================================================================== charts */
function forecastChart(p, fc, compact) {
  const x = [...MONTHS, ...FMONTHS].map(monLabel);
  const hist12 = [...fc.h, ...FMONTHS.map(() => null)];
  const fLine = [...MONTHS.map((_, i) => (i === 11 ? fc.h[11] : null)), ...fc.f.map((v) => +v.toFixed(1))];
  const lo = [...MONTHS.map((_, i) => (i === 11 ? fc.h[11] : null)), ...fc.f.map((v, i) => +Math.max(0, v - fc.band[i]).toFixed(1))];
  const span = [...MONTHS.map((_, i) => (i === 11 ? 0 : null)), ...fc.f.map((v, i) => +(Math.min(v, fc.band[i]) + fc.band[i]).toFixed(1))];
  return {
    grid: ch.grid({ top: compact ? 26 : 36 }), legend: { top: 0, right: 0, data: ['Consumed', 'Forecast', '80 % band', '12-month average'] },
    tooltip: ch.tip({ formatter: (ps) => { const i = ps[0].dataIndex; const k = i - MONTHS.length; const rows = [`<b>${esc(ps[0].name)}</b>`]; if (k < 0) rows.push(`Consumed: <b>${fmt.n(fc.h[i], 1)} ${esc(p.uom)}</b>`); else rows.push(`Forecast: <b>${fmt.n(fc.f[k], 1)} ${esc(p.uom)}</b>`, `80 % range: ${fmt.n(Math.max(0, fc.f[k] - fc.band[k]), 1)} – ${fmt.n(fc.f[k] + fc.band[k], 1)}`); rows.push(`12-month average: ${fmt.n(fc.mean, 1)}`); if (k >= 0 && k < 2) rows.push('<span style="color:#c4b5fd">Includes open work-order pipeline</span>'); return rows.join('<br/>'); } }),
    xAxis: { type: 'category', data: x, boundaryGap: false }, yAxis: { type: 'value', name: p.uom },
    series: [
      { name: 'band-lo', type: 'line', data: lo, stack: 'b', lineStyle: { opacity: 0 }, symbol: 'none', tooltip: { show: false } },
      { name: '80 % band', type: 'line', data: span, stack: 'b', lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: 'rgba(139,92,246,.16)' }, itemStyle: { color: 'rgba(139,92,246,.4)' } },
      { name: 'Consumed', type: 'bar', data: hist12, itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] }, barWidth: 14 },
      { name: 'Forecast', type: 'line', data: fLine, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { color: '#7c3aed', width: 2, type: 'dashed' }, itemStyle: { color: '#7c3aed' } },
      { name: '12-month average', type: 'line', data: x.map(() => +fc.mean.toFixed(1)), symbol: 'none', lineStyle: { color: '#64748b', type: 'dotted', width: 1.5 }, itemStyle: { color: '#64748b' } },
    ],
  };
}

/* ================================================================== screen: Parts Catalog */
const catalogScreen = {
  id: 'catalog', name: 'Parts Catalog', icon: 'box', note: `${net.parts.length} approved items · ${net.suppliers.length} qualified suppliers · catalogue as of ${fmt.date(AS_OF)}`,
  tabs: [
    {
      name: 'Catalogue', icon: 'box',
      render: () => {
        const val = net.parts.reduce((s, p) => s + stockOf(p) * p.unitCost, 0);
        const shortSkus = Object.keys(A.shortBySku).length;
        const mapped = new Set(net.parts.flatMap((p) => p.defects));
        const allDefects = new Set(net.findings.map((f) => f.defect_class));
        const crit = net.parts.filter((p) => p.critical).length;
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Approved catalogue items', value: net.parts.length, icon: 'box', sub: `${cats.length} categories · ${crit} critical spares`, spark: [16, 17, 18, 18, 20, 21, 22] },
            { label: 'Defect classes mapped', value: `${[...allDefects].filter((d) => mapped.has(d)).length}/${allDefects.size}`, icon: 'link', tone: 'ok', sub: 'every CV defect class resolves to a part', spark: [18, 20, 21, 23, 25, 26, 27] },
            { label: 'Stock value on hand', value: money(val), icon: 'wallet', tone: 'violet', sub: 'at standard cost, 3 depots', delta: 4.1, spark: [8, 9, 8.6, 9.4, 9.8, 10.2, 10.5] },
            { label: 'Items short for open work', value: shortSkus, icon: 'event', tone: shortSkus ? 'crit' : 'ok', sub: `${fmt.n(Object.values(A.shortBySku).reduce((a, b) => a + b, 0))} units across the programme`, spark: [3, 4, 3, 5, 4, 5, shortSkus] },
          ])}
          ${ui.card({
            title: 'Approved replacement-part catalogue', erp: ['SAP MM', 'inventory'], sub: 'Each item is approved for the CV defect classes it repairs. Click a row for stock, forecast and the work orders that draw on it.',
            tools: `${ui.chips('cat', [['All', 'All'], ...cats.map((c) => [c, c])], 'All')}${ui.search('#inv-cat', 'Search SKU, item, defect…')}`, flush: true,
            body: ui.table({ id: 'inv-cat', rowId: (p) => p.sku, rows: net.parts, cols: [
              { label: 'SKU', key: 'sku', render: (p) => `<span class="inv-sku">${esc(p.sku)}</span>${p.critical ? ` ${ui.badge('critical', 'high', { dot: false })}` : ''}` },
              { label: 'Item', key: 'name', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.cat)} · ${esc(p.uom)}</span>` },
              { label: 'Repairs defect classes', sort: (p) => p.defects.length, wrap: true, render: (p) => p.defects.map((d) => `<span class="nx-badge t-muted no-dot" style="margin:1px">${esc(DEFECT_LABEL[d] || d)}</span>`).join('') },
              { label: 'Network demand', align: 'r', sort: (p) => p.demand, render: (p) => `<b>${p.demand}</b><span class="nx-sub">findings</span>` },
              { label: 'On hand', align: 'r', sort: (p) => stockOf(p), render: (p) => `${fmt.n(stockOf(p))}<span class="nx-sub">min ${p.min} · max ${p.max}</span>` },
              { label: 'Free', align: 'r', sort: (p) => depots.reduce((s, d) => s + A.left[p.sku][d.id], 0), render: (p) => { const f = depots.reduce((s, d) => s + A.left[p.sku][d.id], 0); return `<b style="color:${f < p.min / 2 ? '#dc2626' : 'inherit'}">${fmt.n(f)}</b>${A.shortBySku[p.sku] ? `<span class="nx-sub" style="color:#dc2626">short ${A.shortBySku[p.sku]}</span>` : ''}`; } },
              { label: 'Unit cost', align: 'r', key: 'unitCost', render: (p) => money(p.unitCost) },
              { label: 'Lead', align: 'r', key: 'lead', render: (p) => `${p.lead} d` },
              { label: 'Supplier', key: 'supplierName', render: (p) => `${esc(p.supplierName)}<span class="nx-sub">${esc(p.supplier)}</span>` },
            ] }),
          })}
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Network demand by category', sub: 'Open findings the catalogue must answer, grouped by part category', body: ui.chart('catdemand') })}
            ${ui.card({ title: 'Stock value by category', erp: ['SAP MM', 'inventory'], sub: 'On-hand value at standard cost (treemap — click to drill into SKUs)', body: ui.chart('cattree') })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#inv-cat tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        ctx.onPick('cat', (v) => { for (const tr of st.querySelectorAll('#inv-cat tbody tr')) { const p = partBySku.get(tr.dataset.row); tr.hidden = v !== 'All' && p?.cat !== v; } });
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        ctx.chart('catdemand', ch.bar({ x: cats, horizontal: true, labels: true, series: [{ name: 'Findings', data: cats.map((c) => net.parts.filter((p) => p.cat === c).reduce((s, p) => s + p.demand, 0)), color: '#2563eb' }] }));
        ctx.chart('cattree', { tooltip: { formatter: (i) => `${esc(i.name)}<br/><b>${money(i.value)}</b>` }, series: [{ type: 'treemap', roam: false, nodeClick: 'zoomToNode', breadcrumb: { show: true, bottom: 0, itemStyle: { color: '#f1f5f9', textStyle: { color: '#475569' } } }, top: 4, left: 4, right: 4, bottom: 28, label: { fontSize: 11, formatter: (i) => `${i.name}\n${money(i.value)}` }, upperLabel: { show: true, height: 20, color: '#fff', fontSize: 11 }, levels: [{ itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3 } }, { colorSaturation: [0.35, 0.6], itemStyle: { gapWidth: 1, borderColorSaturation: 0.7 } }], data: cats.map((c, i) => ({ name: c, itemStyle: { color: ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'][i % 8] }, children: net.parts.filter((p) => p.cat === c).map((p) => ({ name: p.sku, value: Math.round(stockOf(p) * p.unitCost) })) })) }] });
      },
    },
    {
      name: 'Defect → part mapping', icon: 'link',
      render: () => `<div class="nx-page">
        ${ui.callout('Every verified CV finding resolves to an approved catalogue item through its defect class. Insulator defects pick the item by line voltage: glass disc strings at 132 kV, composite long-rods at 220 kV and 500 kV. Flow width is the number of findings (confirmed + pending review) that will draw on that item.', 'info', 'ai')}
        ${ui.card({ title: 'Defect class → approved replacement item', sub: 'Sankey of open network demand · rejected findings excluded', body: '<div class="nx-chart" data-chart="sankey" style="height:640px"></div>' })}
        ${ui.card({ title: 'Mapping register', sub: 'One row per defect class, with the item a work order BOM will call for', flush: true, body: ui.table({ id: 'inv-map', rows: mappingRows(), rowId: (r) => r.sku || r.defect, cols: [
          { label: 'Defect class', key: 'label', render: (r) => `<b>${esc(r.label)}</b><span class="nx-sub inv-sku">${esc(r.defect)}</span>` },
          { label: 'Findings', align: 'r', key: 'n' },
          { label: 'Critical / high', align: 'r', key: 'crit', render: (r) => (r.crit ? ui.badge(String(r.crit), 'crit') : '—') },
          { label: 'Primary item', key: 'sku', render: (r) => (r.sku ? `<span class="inv-sku">${esc(r.sku)}</span><span class="nx-sub">${esc(r.name)}</span>` : ui.badge('service only', 'muted')) },
          { label: 'Qty / finding', align: 'r', key: 'qty' },
          { label: 'Alternates', wrap: true, render: (r) => r.alts.map((a) => `<span class="inv-sku">${esc(a)}</span>`).join(', ') || '—' },
        ] }) })}</div>`,
      mount: (st, ctx) => {
        ctx.on('click', '#inv-map tr[data-row]', (e, tr) => { if (partBySku.has(tr.dataset.row)) openPart(tr.dataset.row); });
        const links = new Map();
        for (const f of net.findings) {
          if (f.review_status === 'rejected') continue;
          const sku = partFor(f.defect_class, f.kv); if (!sku) continue;
          const k = `${f.label}|${sku}`; links.set(k, (links.get(k) || 0) + 1);
        }
        const nodes = new Set(); const data = [];
        for (const [k, v] of links) { const [s, t] = k.split('|'); nodes.add(s); nodes.add(t); data.push({ source: s, target: t, value: v }); }
        ctx.chart('sankey', { tooltip: { trigger: 'item' }, series: [{ type: 'sankey', left: 8, right: 160, top: 8, bottom: 8, nodeGap: 7, nodeWidth: 12, draggable: false, emphasis: { focus: 'adjacency' }, data: [...nodes].map((n) => ({ name: n, itemStyle: { color: partBySku.has(n) ? '#0f172a' : '#3b82f6' }, label: { color: '#334155', fontSize: 11, formatter: partBySku.has(n) ? `${n}` : n } })), links: data, lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 } }] }, { onClick: (p) => { if (p.dataType === 'node' && partBySku.has(p.name)) openPart(p.name); } });
      },
    },
    {
      name: 'ABC analysis', icon: 'trend',
      render: () => {
        const rows = abcRows();
        const cls = (c) => rows.filter((r) => r.abc === c);
        return `<div class="nx-page">
          ${ui.kpis(['A', 'B', 'C'].map((c, i) => ({ label: `Class ${c} items`, value: cls(c).length, icon: 'layers', tone: ['crit', 'warn', 'ok'][i], sub: `${fmt.n((cls(c).reduce((s, r) => s + r.annual, 0) / rows.reduce((s, r) => s + r.annual, 0)) * 100)}% of annual consumption value · review ${['weekly', 'monthly', 'quarterly'][i]}` })))}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Pareto of annual consumption value', erp: ['SAP MM', 'inventory'], sub: 'Annual usage × standard cost. Class A = first 80 % of value, B = next 15 %, C = last 5 %.', body: ui.chart('pareto', 'lg') })}
          ${ui.card({ cls: 'nx-s4', title: 'ABC × XYZ policy matrix', erp: ['SAP MM', 'inventory'], sub: 'Value class × demand variability (X: CV < 0.25 steady, Y: < 0.5, Z: erratic). Cell = items.', body: ui.chart('abcxyz', 'lg') })}</div>
          ${ui.card({ title: 'Classification and stocking policy', erp: ['SAP MM', 'inventory'], flush: true, body: ui.table({ id: 'inv-abc', rows, rowId: (r) => r.sku, cols: [
            { label: 'Class', key: 'abc', render: (r) => ui.badge(r.abc, { A: 'crit', B: 'warn', C: 'ok' }[r.abc], { dot: false }) },
            { label: 'SKU', key: 'sku', render: (r) => `<span class="inv-sku">${esc(r.sku)}</span>` }, { label: 'Item', key: 'name' },
            { label: 'Annual usage', align: 'r', key: 'usage', render: (r) => `${fmt.n(r.usage, 0)} ${esc(r.uom)}` },
            { label: 'Annual value', align: 'r', key: 'annual', render: (r) => money(r.annual) },
            { label: 'Cumulative', align: 'r', key: 'cum', render: (r) => fmt.pct(r.cum * 100, 1) },
            { label: 'Policy', render: (r) => ({ A: 'Continuous review · 98 % service · vendor-managed', B: 'Periodic review (monthly) · 95 %', C: 'Two-bin / min-max · 90 %' }[r.abc]) },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        const rows = abcRows();
        ctx.on('click', '#inv-abc tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        const xyz = (sku) => { const h = hist.get(sku); const m = h.reduce((a, b) => a + b, 0) / h.length; const sd = Math.sqrt(h.reduce((a, b) => a + (b - m) ** 2, 0) / h.length); const cv = m ? sd / m : 1; return cv < 0.25 ? 'X' : cv < 0.5 ? 'Y' : 'Z'; };
        const cells = []; const lists = {};
        ['A', 'B', 'C'].forEach((a, y) => ['X', 'Y', 'Z'].forEach((z, x) => { const its = rows.filter((r) => r.abc === a && xyz(r.sku) === z); lists[`${x}-${y}`] = its.map((r) => r.sku); cells.push([x, y, its.length]); }));
        const POL = { 'A-X': 'Continuous review, VMI', 'A-Y': 'Continuous review, buffer', 'A-Z': 'Make-to-need, expedite', 'B-X': 'Periodic review', 'B-Y': 'Periodic review + SS', 'B-Z': 'Order on demand', 'C-X': 'Two-bin', 'C-Y': 'Two-bin', 'C-Z': 'Order on demand' };
        ctx.chart('abcxyz', { grid: { left: 60, right: 10, top: 10, bottom: 40 }, tooltip: { formatter: (p) => { const [x, y, v] = p.value; const k = `${['A', 'B', 'C'][y]}-${['X', 'Y', 'Z'][x]}`; return `<b>Class ${k}</b> · ${v} item(s)<br/>Policy: ${POL[k]}<br/>${lists[`${x}-${y}`].slice(0, 6).join(', ')}`; } }, xAxis: { type: 'category', data: ['X steady', 'Y variable', 'Z erratic'] }, yAxis: { type: 'category', data: ['A', 'B', 'C'], inverse: true, axisLabel: { formatter: (v) => `Class ${v}` } }, visualMap: { show: false, min: 0, max: Math.max(...cells.map((c) => c[2])), inRange: { color: ['#f8fafc', '#93c5fd', '#1d4ed8'] } }, series: [{ type: 'heatmap', data: cells, label: { show: true, fontSize: 16, fontWeight: 700, formatter: (p) => p.value[2] || '' }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 } }] });
        ctx.chart('pareto', { grid: ch.grid({ top: 40, bottom: 10 }), tooltip: ch.tip({ axisPointer: { type: 'shadow' } }), legend: { top: 0, left: 0 }, xAxis: { type: 'category', data: rows.map((r) => r.sku), axisLabel: { rotate: 40, fontSize: 10, color: '#475569' } }, yAxis: [{ type: 'value', name: 'Annual value', axisLabel: { formatter: (v) => money(v) } }, { type: 'value', name: 'Cumulative %', max: 100, splitLine: { show: false }, axisLabel: { formatter: '{value}%' } }], series: [{ name: 'Annual value', type: 'bar', data: rows.map((r) => ({ value: Math.round(r.annual), itemStyle: { color: { A: '#dc2626', B: '#f59e0b', C: '#16a34a' }[r.abc], borderRadius: [4, 4, 0, 0] } })) }, { name: 'Cumulative %', type: 'line', yAxisIndex: 1, data: rows.map((r) => +(r.cum * 100).toFixed(1)), smooth: true, lineStyle: { color: '#0f172a', width: 2 }, itemStyle: { color: '#0f172a' }, markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: '#94a3b8' }, data: [{ yAxis: 80, label: { formatter: 'A | 80 %' } }, { yAxis: 95, label: { formatter: 'B | 95 %' } }] } }] }, { onClick: (p) => openPart(p.name) });
      },
    },
  ],
};
function mappingRows() {
  const classes = [...new Set(net.findings.map((f) => f.defect_class))];
  return classes.map((d) => {
    const fs = net.findings.filter((f) => f.defect_class === d && f.review_status !== 'rejected');
    const sku = partFor(d, 220); const p = partBySku.get(sku);
    return { defect: d, label: DEFECT_LABEL[d] || d, n: fs.length, crit: fs.filter((f) => f.severity === 'critical' || f.severity === 'high').length, sku, name: p?.name, qty: sku ? QTY[sku] || 1 : '—', alts: net.parts.filter((x) => x.defects.includes(d) && x.sku !== sku).map((x) => x.sku) };
  }).sort((a, b) => b.n - a.n);
}
function abcRows() {
  const rows = net.parts.map((p) => { const usage = hist.get(p.sku).reduce((a, b) => a + b, 0); return { sku: p.sku, name: p.name, uom: p.uom, usage, annual: usage * p.unitCost }; }).sort((a, b) => b.annual - a.annual);
  const total = rows.reduce((s, r) => s + r.annual, 0); let cum = 0;
  for (const r of rows) { cum += r.annual; r.cum = cum / total; r.abc = r.cum - r.annual / total < 0.8 ? 'A' : r.cum - r.annual / total < 0.95 ? 'B' : 'C'; }
  return rows;
}

/* ================================================================== screen: Inventory Dashboard */
function dashboardMapCfg(selectDepot) {
  const openJobs = A.jobs.filter((j) => j.lines.length && j.wo.lat);
  const depotInfo = (d) => {
    const h = depotHealth(d); const val = net.parts.reduce((s, p) => s + p.stock[d.id] * p.unitCost, 0);
    const jobs = A.jobs.filter((j) => j.home.id === d.id && j.lines.length);
    const low = net.parts.map((p) => ({ p, free: A.left[p.sku][d.id] })).sort((a, b) => a.free / Math.max(1, a.p.min) - b.free / Math.max(1, b.p.min)).slice(0, 6);
    return {
      kicker: `${d.kind} · ${d.bins} bin locations`, title: d.name, sub: `${d.id} · ${fmt.n(d.lat, 4)}, ${fmt.n(d.lng, 4)}`,
      badges: [[h.below ? `${h.below} items below min` : 'All items above min', h.below > 4 ? 'crit' : h.below ? 'warn' : 'ok'], [`${jobs.length} jobs supplied`, 'accent'], ['ERP · SAP MM', 'info']],
      fields: [['Stock value', money(val)], ['Reserved for jobs', money(jobs.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.fromHome * l.unitCost, 0), 0))], ['Shortfall jobs', String(jobs.filter((j) => j.short).length)], ['Warehouse temp', `<span data-live="INV.${d.id}.T">—</span> °C`], ['Relative humidity', `<span data-live="INV.${d.id}.RH">—</span> %`]],
      html: `<table class="inv-mini"><thead><tr><th>Lowest cover</th><th class="r">Free</th><th class="r">Min</th></tr></thead><tbody>${low.map((x) => `<tr><td class="inv-sku">${esc(x.p.sku)}</td><td class="r" style="color:${x.free < x.p.min / 3 ? '#dc2626' : 'inherit'}">${x.free}</td><td class="r">${Math.round(x.p.min / 3)}</td></tr>`).join('')}</tbody></table>`,
      actions: [{ label: 'Stock audit', primary: true, icon: 'clipboard', onClick: () => nav.go('dashboard', 'Stock audit') }, { label: 'Request replenishment in SAP MM', icon: 'cart', onClick: () => autoReplenish() }],
    };
  };
  const jobInfo = (j) => ({
    kicker: `${j.mr} · ${j.wo.crewName}`, title: `${j.wo.id} · ${fmt.title(j.wo.work_type)}`, sub: `${esc(j.wo.towerName || j.wo.asset)} · ${esc(j.wo.line || '')} · planned ${fmt.short(j.wo.planned_date)}`,
    badges: [[COVER_LABEL[j.cover], COVER_TONE[j.cover]], [STAGE_LABEL[j.wo.stage], STAGE_TONE[j.wo.stage]], ['ERP · SAP PM', 'info']],
    fields: [['Home depot', j.home.short], ['Material value', money(j.value)], ['Dispatch in', j.dispatchIn == null ? '—' : `${j.dispatchIn} days`]],
    html: `<table class="inv-mini"><thead><tr><th>SKU</th><th class="r">Qty</th><th>Source</th></tr></thead><tbody>${j.lines.map((l) => `<tr><td class="inv-sku">${esc(l.sku)}</td><td class="r">${l.qty}</td><td>${l.short ? `<span style="color:#dc2626">short ${l.short}</span>` : l.transfers.length ? `xfer ${l.transfers.map((t) => depotName[t.depot]).join(',')}` : depotName[j.home.id]}</td></tr>`).join('')}</tbody></table>`,
    actions: [{ label: 'Open material request', primary: true, icon: 'clipboard', onClick: () => openJob(j.wo.id) }, ...(j.mrStatus === 'ready to reserve' ? [{ label: 'Request reservation', icon: 'lock', onClick: () => reserve([j.wo.id]) }] : [])],
  });
  return {
    layers: [
      ...networkLayers(net, { subsInfo: (s) => ({ title: s.name, sub: `${s.levels.join('/')} kV`, fields: [['Lines', s.lines.join(', ')], ['Transformers', String(net.transformers.filter((t) => t.sub === s.id).length)]] }) }),
      { id: 'depots', name: 'Depots & warehouses', color: '#0f766e', shape: 'sq', points: depots.map((d) => { const h = depotHealth(d); return { id: d.id, lat: d.lat, lng: d.lng, size: 30, shape: 'sq', icon: 'warehouse', color: h.below > 4 ? '#dc2626' : h.below ? '#d97706' : '#0f766e', label: d.short, z: 1000, pulse: h.below > 4, search: d.name, tip: `${d.name} · ${h.below} items below min`, info: () => depotInfo(d) }; }) },
      { id: 'jobs', name: 'Work sites needing material', color: '#2563eb', shape: 'dia', points: openJobs.map((j) => ({ id: j.wo.id, lat: j.wo.lat, lng: j.wo.lng, size: 13, shape: 'dia', color: { covered: '#16a34a', transfer: '#0284c7', short: '#dc2626' }[j.cover], pulse: j.cover === 'short' && j.dispatchIn != null && j.dispatchIn < 21, search: `${j.mr} ${j.wo.towerName}`, tip: `${j.wo.id} · ${j.wo.towerName || ''} · ${COVER_LABEL[j.cover]}`, info: () => jobInfo(j) })) },
      { id: 'crews', name: 'Crews', color: '#7c3aed', points: net.crews.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, size: 20, icon: 'truck', color: '#7c3aed', search: c.name, tip: `${c.id} · ${c.name} · ${c.status}`, info: () => ({ kicker: c.status, title: `${c.id} · ${c.name}`, sub: `Lead ${esc(c.lead)} · ${c.size} people · base ${esc(c.baseName)}`, fields: [['Vehicle', esc(c.vehicle)], ['Current job', c.job || '—'], ['Material on van', c.job ? 'Issued kit (MR attached)' : 'Standard van stock']] }) })) },
      { id: 'routes', name: 'Transfer routes', color: '#0284c7', shape: 'line', on: true, fit: false, lines: transferRoutes() },
    ],
    legend: [{ label: 'Covered at home depot', color: '#16a34a' }, { label: 'Covered with transfer', color: '#0284c7' }, { label: 'Shortfall', color: '#dc2626' }, { label: 'Depot (colour = stock health)', color: '#0f766e' }, { label: 'Transfer route', color: '#0284c7', line: true }],
    padding: [250, 50],
    stats: [{ label: 'Jobs needing material', value: String(openJobs.length) }, { label: 'Shortfall jobs', value: String(openJobs.filter((j) => j.cover === 'short').length), color: '#dc2626' }, { label: 'Transfers', value: String(transferRoutes().length) }],
  };
}
function transferRoutes() {
  const pairs = new Map();
  for (const j of A.jobs) for (const l of j.lines) for (const t of l.transfers) { const k = `${t.depot}>${j.home.id}`; pairs.set(k, (pairs.get(k) || 0) + t.qty * l.unitCost); }
  return [...pairs].map(([k, v]) => { const [a, b] = k.split('>'); const da = depots.find((d) => d.id === a); const db = depots.find((d) => d.id === b); return { id: `RT-${a}-${b}`, coords: [[da.lat, da.lng], [db.lat, db.lng]], color: '#0284c7', weight: 3, dash: '6 6', tip: `Proposed stock transfer ${depotName[a]} → ${depotName[b]} · ${money(v)}` }; });
}
const dashboardScreen = {
  id: 'dashboard', name: 'Inventory Dashboard', icon: 'warehouse',
  tabs: [
    {
      name: 'Overview', icon: 'dashboard',
      render: () => {
        const approved = A.jobs.filter((j) => ['approved', 'planned', 'scheduled'].includes(j.wo.stage) && j.lines.length);
        const ready = approved.filter((j) => j.cover !== 'short');
        const sel = ready.slice(0, 3);
        const val = net.parts.reduce((s, p) => s + stockOf(p) * p.unitCost, 0);
        const fill = A.jobs.filter((j) => j.lines.length).length ? (A.jobs.filter((j) => j.lines.length && j.cover !== 'short').length / A.jobs.filter((j) => j.lines.length).length) * 100 : 100;
        const below = net.parts.filter((p) => forecastOf(p).onHandNow < forecastOf(p).rop).length;
        return `<div class="nx-page">
          ${ui.hero({ kicker: 'Operational output · material readiness', text: `Replacement hardware requested for <b>${sel.length === 3 ? 'three' : sel.length} approved repair jobs</b> (${sel.map((j) => esc(j.wo.id)).join(', ')}); warehouse availability confirmed at ${[...new Set(sel.map((j) => esc(j.home.short)))].join(' and ')}.`, icon: 'boxes', meta: [{ label: 'Approved jobs ready', value: `${ready.length}/${approved.length}` }, { label: 'Fill rate', value: fmt.pct(fill) }], actions: ui.btn('Request reservations in SAP MM', { attrs: 'data-reserve-all' }) })}
          ${ui.kpis([
            { label: 'Inventory value', value: money(val), icon: 'wallet', sub: '3 depots · standard cost', delta: 3.6, spark: [5.2, 5.4, 5.3, 5.6, 5.8, 5.7, val / 1e5] },
            { label: 'Work-order fill rate', value: fmt.n(fill, 1), unit: '%', icon: 'checkCircle', tone: fill > 85 ? 'ok' : 'warn', sub: 'jobs fully kitted from stock', delta: 2.4, spark: [78, 81, 80, 84, 83, 86, fill] },
            { label: 'Below reorder point', value: below, icon: 'event', tone: below > 4 ? 'crit' : 'warn', sub: 'estimated ROP · after open-work reservations', exp: true, spark: [3, 5, 4, 6, 5, 7, below] },
            { label: 'Inventory turns', value: '3.8', unit: '×/yr', icon: 'sync', tone: 'violet', sub: 'MRO benchmark 2.5–4.0', delta: 0.4, deltaSuffix: '', spark: [3.1, 3.3, 3.2, 3.5, 3.6, 3.7, 3.8] },
            { label: 'Open shortfall value', value: money(A.jobs.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.short * l.unitCost, 0), 0)), icon: 'cart', tone: 'crit', sub: `${A.jobs.filter((j) => j.short).length} jobs waiting on supply`, deltaInvert: true, delta: -6.2, spark: [62, 58, 66, 54, 49, 44, 41] },
          ])}
          <div class="inv-split">
            ${ui.card({ title: 'Depots, work sites and transfer routes', erp: ['SAP MM', 'inventory'], sub: 'Click a depot for its stock position, a diamond for the job’s bill of materials', body: '<div id="inv-map" class="nx-map" style="height:560px"></div>', flush: true })}
            <div class="nx-page">
              ${ui.card({ title: 'Stock health by depot', erp: ['SAP MM', 'inventory'], sub: 'Share of catalogue items above minimum after reservations', body: depots.map((d) => { const h = depotHealth(d); return `<div class="inv-dep" style="grid-template-columns:120px 1fr 60px"><span><b>${esc(d.short)}</b><span class="nx-sub">${h.below} below min</span></span><div class="nx-bar"><i style="width:${(h.pct * 100).toFixed(0)}%;background:${h.pct > 0.85 ? '#16a34a' : h.pct > 0.7 ? '#d97706' : '#dc2626'}"></i></div><span class="nx-num" style="text-align:right;font-weight:700">${fmt.pct(h.pct * 100)}</span></div>`; }).join('') })}
              ${ui.card({ title: 'Kitting status of open jobs', erp: ['SAP PM', 'workOrders'], body: `${ui.chart('cover', 'sm')}<div class="nx-map-legend" style="position:static;display:flex;gap:12px;font-size:11px;justify-content:center;flex-wrap:wrap">${['covered', 'transfer', 'short'].map((c) => `<span style="display:inline-flex;gap:5px;align-items:center"><i style="width:9px;height:9px;border-radius:50%;display:inline-block;background:${{ covered: '#16a34a', transfer: '#0284c7', short: '#dc2626' }[c]}"></i>${COVER_LABEL[c]} · ${A.jobs.filter((j) => j.lines.length && j.cover === c).length}</span>`).join('')}</div>` })}
              ${ui.card({ title: 'Warehouse conditions', sub: 'Live from depot BMS sensors', body: ui.stats(depots.map((d) => ({ label: `${d.short} · °C / %RH`, value: '—', live: `INV.${d.id}.T` }))) })}
            </div>
          </div>
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Stock value — depot × category', erp: ['SAP MM', 'inventory'], sub: 'Where the money sits ($k at standard cost)', body: ui.chart('heat', 'md') })}
            ${ui.card({ title: 'Critical spares at risk', erp: ['SAP MM', 'inventory'], exp: true, sub: 'Free stock after reservations (SAP MM) vs the estimated reorder point and days of cover', flush: true, body: ui.table({ id: 'inv-risk', rowId: (p) => p.sku, rows: net.parts.map((p) => ({ ...p, fc: forecastOf(p) })).sort((a, b) => a.fc.cover - b.fc.cover).slice(0, 8), cols: [
              { label: 'SKU', key: 'sku', render: (p) => `<span class="inv-sku">${esc(p.sku)}</span><span class="nx-sub">${esc(p.name)}</span>` },
              { label: 'Free', align: 'r', sort: (p) => p.fc.onHandNow, render: (p) => fmt.n(p.fc.onHandNow) },
              { label: 'ROP', align: 'r', sort: (p) => p.fc.rop, render: (p) => fmt.n(p.fc.rop, 1) },
              { label: 'Cover', align: 'r', sort: (p) => p.fc.cover, render: (p) => coverBadge(p.fc.cover) },
              { label: 'Lead', align: 'r', key: 'lead', render: (p) => `${p.lead} d` },
            ] }) })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.map('#inv-map', dashboardMapCfg());
        ctx.on('click', '[data-reserve-all]', () => reserve(A.jobs.filter((j) => j.mrStatus === 'ready to reserve').map((j) => j.wo.id)));
        ctx.on('click', '#inv-risk tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        const withMat = A.jobs.filter((j) => j.lines.length);
        ctx.chart('cover', ch.donut({ data: ['covered', 'transfer', 'short'].map((c) => ({ name: COVER_LABEL[c], value: withMat.filter((j) => j.cover === c).length, color: { covered: '#16a34a', transfer: '#0284c7', short: '#dc2626' }[c] })), center: 'open jobs', radius: ['58%', '80%'], legend: false }));
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        const data = []; cats.forEach((c, x) => depots.forEach((d, y) => data.push([x, y, Math.round(net.parts.filter((p) => p.cat === c).reduce((s, p) => s + p.stock[d.id] * p.unitCost, 0) / 1000)])));
        ctx.chart('heat', ch.heat({ x: cats, y: depots.map((d) => d.short), data, label: true, colors: ['#eff6ff', '#93c5fd', '#2563eb', '#1e3a8a'], fmtv: (v) => `$${fmt.n(v)}k` }));
      },
    },
    {
      name: 'Stock audit', icon: 'clipboard',
      render: () => {
        const rows = [];
        for (const p of net.parts) for (const d of depots) {
          const res = A.jobs.reduce((s, j) => s + (j.home.id === d.id ? j.lines.filter((l) => l.sku === p.sku).reduce((a, l) => a + l.fromHome, 0) : 0) + j.lines.filter((l) => l.sku === p.sku).reduce((a, l) => a + l.transfers.filter((t) => t.depot === d.id).reduce((x, t) => x + t.qty, 0), 0), 0);
          const shortHere = A.jobs.filter((j) => j.home.id === d.id).reduce((s, j) => s + j.lines.filter((l) => l.sku === p.sku).reduce((a, l) => a + l.short, 0), 0);
          if (!p.stock[d.id] && !res && !shortHere) continue;
          const hv = [...(p.sku + d.id)].reduce((a, c) => a + c.charCodeAt(0), 0); const counted = p.stock[d.id] ? p.stock[d.id] + (hv % 9 === 0 ? -1 : hv % 13 === 0 ? 1 : 0) : 0;
          rows.push({ key: `${p.sku}@${d.id}`, p, d, book: p.stock[d.id], counted, res, free: A.left[p.sku][d.id], short: shortHere });
        }
        const variance = rows.filter((r) => r.counted !== r.book);
        return `<div class="nx-page">
          ${ui.callout(`Audit of book stock against the bill of materials of every open work order (${A.jobs.filter((j) => j.lines.length).length} jobs). Reservations are taken from the depot nearest the job first, then transferred from the other depots. Last cycle count ${fmt.date(addDays(AS_OF, -3))}: <b>${variance.length} bin variances</b> on ${rows.length} positions (accuracy ${fmt.pct((1 - variance.length / rows.length) * 100, 1)}).`, variance.length ? 'warn' : 'ok', 'clipboard')}
          ${ui.card({ title: 'Book stock vs planned maintenance demand', erp: ['SAP MM', 'inventory'], sub: 'One row per item and depot. Sort by shortfall to see what blocks dispatch.', tools: `${ui.chips('aud', [['all', 'All'], ['short', 'Shortfall only'], ['var', 'Count variance']], 'all')}${ui.search('#inv-aud', 'Filter…')}`, flush: true, body: ui.table({ id: 'inv-aud', rows, rowId: (r) => r.key, cols: [
            { label: 'Depot', sort: (r) => r.d.short, render: (r) => `<b>${esc(r.d.short)}</b><span class="nx-sub">${esc(r.d.id)}</span>` },
            { label: 'SKU', sort: (r) => r.p.sku, render: (r) => `<span class="inv-sku">${esc(r.p.sku)}</span><span class="nx-sub">${esc(r.p.name)}</span>` },
            { label: 'Book', align: 'r', key: 'book' },
            { label: 'Counted', align: 'r', key: 'counted', render: (r) => (r.counted !== r.book ? `<b style="color:#d97706">${r.counted}</b>` : String(r.counted)) },
            { label: 'Reserved for WOs', align: 'r', key: 'res' },
            { label: 'Free', align: 'r', key: 'free', render: (r) => `<b>${r.free}</b>` },
            { label: 'Shortfall', align: 'r', key: 'short', render: (r) => (r.short ? ui.badge(String(r.short), 'crit') : '—') },
            { label: 'Position', sort: (r) => r.free - r.p.min / 3, render: (r) => ui.meter(r.book ? (r.free / Math.max(1, r.book)) * 100 : 0, 100, r.short ? '#dc2626' : r.free < r.p.min / 3 ? '#d97706' : '#16a34a', `${r.book ? fmt.n((r.free / r.book) * 100) : 0}%`) },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#inv-aud tr[data-row]', (e, tr) => openPart(tr.dataset.row.split('@')[0]));
        ctx.onPick('aud', (v) => { for (const tr of st.querySelectorAll('#inv-aud tbody tr')) { const c = tr.cells; const short = c[6]?.textContent.trim() !== '—'; const vr = c[2]?.textContent !== c[3]?.textContent; tr.hidden = (v === 'short' && !short) || (v === 'var' && !vr); } });
      },
    },
    {
      name: 'Stock value', icon: 'layers',
      render: () => {
        const val = net.parts.reduce((a, p) => a + stockOf(p) * p.unitCost, 0);
        const excess = net.parts.map((p) => ({ p, fc: forecastOf(p) })).map((x) => ({ ...x, ex: Math.max(0, x.fc.onHandNow - x.p.max * 0.8) })).filter((x) => x.ex > 0 || x.fc.cover > 240);
        const exVal = excess.reduce((a, x) => a + Math.max(x.ex, 0) * x.p.unitCost, 0);
        return `<div class="nx-page">${ui.kpis([
          { label: 'Inventory value', value: money(val), icon: 'wallet', sub: 'standard cost · 3 depots', spark: [5.1, 5.3, 5.2, 5.5, 5.7, 5.8, val / 1e5] },
          { label: 'Carrying cost', value: money(val * 0.22), unit: '/yr', icon: 'dollar', tone: 'violet', sub: '22 % of value: capital, storage, insurance, shrinkage' },
          { label: 'Excess / slow-moving value', value: money(exVal), icon: 'event', tone: 'warn', sub: `${excess.length} items above 80 % of max or > 240 d cover` },
          { label: 'Stock older than 12 months', value: '$84k', icon: 'clock', tone: 'crit', sub: '10 % of value · review for disposal or reallocation' },
        ])}<div class="nx-row nx-c2">
        ${ui.card({ title: 'Inventory value trend', erp: ['SAP MM', 'inventory'], sub: 'Month-end value by depot ($k)', body: ui.chart('vtrend', 'md') })}
        ${ui.card({ title: 'Ageing of stock', erp: ['SAP MM', 'inventory'], sub: 'Value by months since last movement', body: ui.chart('ageing', 'md') })}
        </div>${ui.card({ title: 'Value by item', erp: ['SAP MM', 'inventory'], sub: 'On-hand value, coloured by category', body: ui.chart('vbar', 'lg') })}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s4', title: 'Value by depot', erp: ['SAP MM', 'inventory'], sub: 'Share of on-hand value at standard cost', body: ui.chart('vdep', 'md') })}
        ${ui.card({ cls: 'nx-s8', title: 'Excess and slow-moving items', erp: ['SAP MM', 'inventory'], exp: true, sub: 'Candidates to transfer to another depot, return to vendor or stop reordering. Cover and the suggested action are model estimates.', flush: true, body: ui.table({ id: 'inv-excess', rowId: (x) => x.p.sku, rows: excess.sort((a, b) => b.ex * b.p.unitCost - a.ex * a.p.unitCost).slice(0, 8), empty: 'No excess stock.', cols: [
          { label: 'SKU', sort: (x) => x.p.sku, render: (x) => `<span class="inv-sku">${esc(x.p.sku)}</span><span class="nx-sub">${esc(x.p.name)}</span>` },
          { label: 'Free', align: 'r', sort: (x) => x.fc.onHandNow, render: (x) => fmt.n(x.fc.onHandNow) },
          { label: 'Max', align: 'r', sort: (x) => x.p.max, render: (x) => fmt.n(x.p.max) },
          { label: 'Cover', align: 'r', sort: (x) => x.fc.cover, render: (x) => coverBadge(x.fc.cover) },
          { label: 'Excess value', align: 'r', sort: (x) => x.ex * x.p.unitCost, render: (x) => money(x.ex * x.p.unitCost) },
          { label: 'Suggested action', sort: false, render: (x) => (x.fc.cover > 360 ? ui.badge('Stop reorder', 'warn') : x.ex > 0 ? ui.badge('Transfer to short depot', 'info') : ui.badge('Review', 'muted')) },
        ] }) })}</div></div>`;
      },
      mount: (st, ctx) => {
        const r2 = rng(77);
        ctx.on('click', '#inv-excess tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        ctx.chart('vdep', ch.donut({ data: depots.map((d, i) => ({ name: d.short, value: Math.round(net.parts.reduce((a, p) => a + p.stock[d.id] * p.unitCost, 0)), color: ['#2563eb', '#14b8a6', '#8b5cf6'][i] })), center: 'on hand', value: money(net.parts.reduce((a, p) => a + stockOf(p) * p.unitCost, 0)) }));
        ctx.chart('vtrend', ch.line({ x: MONTHS.map(monLabel), series: depots.map((d, i) => ({ name: d.short, stack: 'v', area: true, data: MONTHS.map((_, k) => Math.round((net.parts.reduce((s, p) => s + p.stock[d.id] * p.unitCost, 0) / 1000) * (0.82 + k * 0.016 + r2() * 0.05))), color: ['#2563eb', '#14b8a6', '#8b5cf6'][i] })) }));
        ctx.chart('ageing', ch.bar({ x: ['0–3 m', '3–6 m', '6–12 m', '12–24 m', '> 24 m'], series: [{ name: 'Value ($k)', data: [412, 236, 148, 61, 23].map((v, i) => ({ value: v, itemStyle: { color: ['#16a34a', '#65a30d', '#d97706', '#ea580c', '#dc2626'][i], borderRadius: [4, 4, 0, 0] } })) }], labels: true }));
        const sorted = [...net.parts].sort((a, b) => stockOf(b) * b.unitCost - stockOf(a) * a.unitCost);
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        ctx.chart('vbar', ch.bar({ x: sorted.map((p) => p.sku), series: [{ name: 'Value', data: sorted.map((p) => ({ value: Math.round(stockOf(p) * p.unitCost), itemStyle: { color: ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'][cats.indexOf(p.cat) % 8], borderRadius: [4, 4, 0, 0] } })) }], grid: { bottom: 10 } }), { onClick: (p) => openPart(p.name) }).then((i) => i?.setOption({ xAxis: { axisLabel: { rotate: 40, fontSize: 10 } }, yAxis: { axisLabel: { formatter: (v) => money(v) } } }));
      },
    },
  ],
};

/* ================================================================== screen: Material Requests */
const requestsScreen = {
  id: 'requests', name: 'Material Requests', icon: 'clipboard',
  tabs: [
    {
      name: 'Requests board', icon: 'flow',
      render: () => {
        const cols = ['awaiting approval', 'ready to reserve', 'reserved', 'backorder', 'issued'];
        const jobs = A.jobs.filter((j) => j.lines.length);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Open material requests', value: jobs.length, icon: 'clipboard', sub: `${fmt.n(jobs.reduce((s, j) => s + j.lines.length, 0))} BOM lines · ${money(jobs.reduce((s, j) => s + j.value, 0))}` },
            { label: 'Ready to reserve', value: jobs.filter((j) => j.mrStatus === 'ready to reserve').length, icon: 'lock', tone: 'info', sub: 'approved, fully available' },
            { label: 'Reserved', value: jobs.filter((j) => j.mrStatus === 'reserved').length, icon: 'checkCircle', tone: 'ok', sub: 'held in bin, picking list printed' },
            { label: 'Backordered', value: jobs.filter((j) => j.mrStatus === 'backorder').length, icon: 'event', tone: 'crit', sub: 'waiting on purchase orders' },
          ])}
          ${ui.card({ title: 'Material request pipeline', erp: ['SAP MM', 'inventory'], sub: 'One material requirement per SAP PM work order, derived from its verified findings. Reservations and goods issues are SAP MM documents: a request from here is sent to SAP MM and arrives with the next sync. Click a card for the BOM.', tools: `${ui.erp('SAP PM', 'workOrders')}${ui.btn('Request reservations in SAP MM', { primary: true, ic: 'lock', attrs: 'data-reserve-all' })}`, body: ui.kanban(cols.map((c) => ({ title: fmt.title(c), color: { 'awaiting approval': '#94a3b8', 'ready to reserve': '#0284c7', reserved: '#2563eb', backorder: '#dc2626', issued: '#16a34a' }[c], items: jobs.filter((j) => j.mrStatus === c).slice(0, 14).map((j) => ({ id: j.wo.id, title: j.mr, badge: ui.badge(j.wo.priority, j.wo.priority === 'high' ? 'high' : 'muted', { dot: false }), text: `${esc(j.wo.id)} · ${esc(fmt.title(j.wo.work_type))}<br/><span style="color:var(--nx-muted)">${esc(j.wo.towerName || j.wo.asset)} · ${esc(j.wo.line || 'Substation')}</span>`, meta: `${icon('warehouse', 12)} ${esc(j.home.short)} · ${j.lines.length} lines · ${money(j.value)}${j.short ? ` · <b style="color:#dc2626">${j.short} short</b>` : ''}${mrRef(j) ? ` · <span class="inv-sku">${esc(mrRef(j))}</span> requested in SAP MM` : ''}` })) }))) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '.nx-tile[data-row]', (e, t) => openJob(t.dataset.row));
        ctx.on('click', '[data-reserve-all]', () => reserve(A.jobs.filter((j) => j.mrStatus === 'ready to reserve').map((j) => j.wo.id)));
      },
    },
    {
      name: 'Register', icon: 'doc',
      render: () => ui.card({ title: 'Material request register', erp: ['SAP MM', 'inventory'], sub: 'Reservations read from SAP MM (RESB) and Maximo inventory usage through the integration layer. A reservation requested here shows its ERP reference until the next sync.', tools: `${ui.erp('SAP PM', 'workOrders')}${ui.search('#inv-mr', 'Search MR, WO, tower…')}${ui.btn('Export CSV', { ic: 'download', sm: true, attrs: 'data-csv' })}`, flush: true, body: ui.table({ id: 'inv-mr', rows: A.jobs.filter((j) => j.lines.length), rowId: (j) => j.wo.id, cols: [
        { label: 'Request', sort: (j) => j.mr, render: (j) => `<b class="inv-sku">${esc(j.mr)}</b><span class="nx-sub">${esc(j.wo.id)} · SAP ${esc(j.wo.sap)}</span>` },
        { label: 'Work', sort: (j) => j.wo.work_type, render: (j) => `${esc(fmt.title(j.wo.work_type))}<span class="nx-sub">${esc(j.wo.towerName || j.wo.asset)} · ${esc(j.wo.line || 'Substation')}</span>` },
        { label: 'Stage', sort: (j) => STAGE_ORDER[j.wo.stage], render: (j) => ui.badge(STAGE_LABEL[j.wo.stage], STAGE_TONE[j.wo.stage]) },
        { label: 'Planned', sort: (j) => j.wo.planned_date, render: (j) => `${fmt.short(j.wo.planned_date)}<span class="nx-sub">${j.dispatchIn == null ? '' : j.dispatchIn < 0 ? `${-j.dispatchIn} d overdue` : `in ${j.dispatchIn} d`}</span>` },
        { label: 'Depot', sort: (j) => j.home.short, render: (j) => esc(j.home.short) },
        { label: 'Lines', align: 'r', sort: (j) => j.lines.length, render: (j) => String(j.lines.length) },
        { label: 'Value', align: 'r', sort: (j) => j.value, render: (j) => money(j.value) },
        { label: 'Availability', sort: (j) => j.cover, render: (j) => ui.badge(COVER_LABEL[j.cover], COVER_TONE[j.cover]) },
        { label: 'Status', sort: (j) => j.mrStatus, render: (j) => `${ui.badge(mrText(j), MR_TONE[j.mrStatus])}${mrRef(j) ? `<span class="nx-sub inv-sku">${esc(mrRef(j))} · next sync</span>` : ''}` },
      ] }) }),
      mount: (st, ctx) => {
        ctx.on('click', '#inv-mr tr[data-row]', (e, tr) => openJob(tr.dataset.row));
        ctx.on('click', '[data-csv]', () => {
          const rows = [['MR', 'WO', 'SKU', 'Qty', 'UoM', 'Depot', 'Short'], ...A.jobs.flatMap((j) => j.lines.map((l) => [j.mr, j.wo.id, l.sku, l.qty, l.uom, j.home.id, l.short]))];
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })); a.download = `material-requests-${AS_OF}.csv`; a.click(); toast('Material request register exported.');
        });
      },
    },
    {
      name: 'Pre-dispatch check', icon: 'truck',
      render: () => {
        const soon = A.jobs.filter((j) => j.lines.length && j.wo.stage !== 'in_progress' && j.dispatchIn != null && j.dispatchIn <= 45).sort((a, b) => a.dispatchIn - b.dispatchIn);
        const atRisk = soon.filter((j) => j.short && Math.max(...j.lines.filter((l) => l.short).map((l) => l.lead)) > j.dispatchIn);
        const ready = soon.filter((j) => !j.short); const xfer = soon.filter((j) => j.cover === 'transfer');
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Jobs dispatching ≤ 45 days', value: soon.length, icon: 'truck', sub: `${money(soon.reduce((a, j) => a + j.value, 0))} of material` },
            { label: 'Fully kitted', value: ready.length, icon: 'checkCircle', tone: 'ok', sub: `${fmt.pct(soon.length ? (ready.length / soon.length) * 100 : 100)} of the window` },
            { label: 'Need a depot transfer', value: xfer.length, icon: 'sync', tone: 'info', sub: 'stock transport order before dispatch' },
            { label: 'At risk on dispatch day', value: atRisk.length, icon: 'alert', tone: atRisk.length ? 'crit' : 'ok', sub: 'quoted supplier lead time exceeds time left', exp: true },
          ])}
          ${atRisk.length ? ui.callout(`${ui.exp()} <b>${atRisk.length} job(s) are projected not to have hardware on dispatch day</b> — the quoted supplier lead time is longer than the time left: ${atRisk.slice(0, 5).map((j) => `${esc(j.wo.id)} (${esc(j.wo.towerName || j.wo.asset)}, ${j.dispatchIn} d)`).join(', ')}. Expedite, substitute an alternate item, or re-sequence the work plan.`, 'crit', 'alert') : ui.callout('Every job dispatching in the next 45 days has its hardware in stock or due in time on quoted lead times.', 'ok', 'checkCircle')}
          ${ui.card({ title: 'Jobs dispatching in the next 45 days', erp: ['SAP PM', 'workOrders'], sub: 'Shortages flagged against quoted supplier lead time before the crew leaves the depot', body: ui.gantt({ range: [addDays(AS_OF, -7), addDays(AS_OF, 60)], now: AS_OF, ticks: 'week', labelW: 230, rows: soon.slice(0, 18).map((j) => { const lead = j.short ? Math.max(...j.lines.filter((l) => l.short).map((l) => l.lead)) : 0; return { label: `${j.wo.id} · ${j.wo.towerName || j.wo.asset}`, sub: `${fmt.title(j.wo.work_type)} · ${j.home.short}`, bars: [...(j.short ? [{ id: j.wo.id, start: AS_OF, end: addDays(AS_OF, lead), color: lead > j.dispatchIn ? '#fca5a5' : '#bfdbfe', text: `supply ${lead} d`, tip: `Estimated earliest delivery ${fmt.date(addDays(AS_OF, lead))} (quoted lead time)` }] : []), { id: j.wo.id, start: j.wo.planned_date, end: addDays(j.wo.planned_date, 4), color: j.short ? (lead > j.dispatchIn ? '#dc2626' : '#d97706') : '#16a34a', text: 'go', tip: `${j.wo.id} dispatch ${fmt.date(j.wo.planned_date)}` }] }; }) }) })}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Readiness by dispatch week', erp: ['SAP PM', 'workOrders'], sub: 'Jobs leaving each week, by kitting status', body: ui.chart('rdy', 'md') })}
          ${ui.card({ cls: 'nx-s5', title: 'Items blocking dispatch', erp: ['SAP MM', 'inventory'], sub: 'Short SKUs on jobs in the 45-day window', flush: true, body: ui.table({ id: 'inv-block', rowId: (r) => r.sku, empty: 'Nothing is blocking dispatch.', rows: Object.values(soon.flatMap((j) => j.lines.filter((l) => l.short).map((l) => ({ l, j }))).reduce((m, { l, j }) => { (m[l.sku] ||= { sku: l.sku, name: l.name, short: 0, jobs: 0, lead: l.lead, first: j.dispatchIn }); m[l.sku].short += l.short; m[l.sku].jobs += 1; m[l.sku].first = Math.min(m[l.sku].first, j.dispatchIn); return m; }, {})), cols: [
            { label: 'SKU', key: 'sku', render: (r) => `<span class="inv-sku">${esc(r.sku)}</span><span class="nx-sub">${esc(r.name)}</span>` },
            { label: 'Short', align: 'r', key: 'short', render: (r) => ui.badge(String(r.short), 'crit') }, { label: 'Jobs', align: 'r', key: 'jobs' },
            { label: 'First dispatch', align: 'r', key: 'first', render: (r) => `${r.first} d` }, { label: 'Lead', align: 'r', key: 'lead', render: (r) => `<b style="color:${r.lead > r.first ? '#dc2626' : 'inherit'}">${r.lead} d</b>` },
          ] }) })}</div>
        </div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '.nx-gantt-bar[data-row]', (e, b) => openJob(b.dataset.row));
        ctx.on('click', '#inv-block tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        const soon = A.jobs.filter((j) => j.lines.length && j.wo.stage !== 'in_progress' && j.dispatchIn != null && j.dispatchIn <= 45);
        const wk = Array.from({ length: 7 }, (_, i) => i);
        const inWk = (j, i) => Math.floor(Math.max(0, j.dispatchIn) / 7) === i;
        ctx.chart('rdy', ch.bar({ x: wk.map((i) => `Wk ${i + 1} · ${fmt.short(addDays(AS_OF, i * 7))}`), stack: true, series: [['covered', 'Covered at home', '#16a34a'], ['transfer', 'Covered with transfer', '#0284c7'], ['short', 'Shortfall', '#dc2626']].map(([c, n, col]) => ({ name: n, color: col, data: wk.map((i) => soon.filter((j) => j.cover === c && inWk(j, i)).length) })), yName: 'jobs' }));
      },
    },
  ],
};

/* ================================================================== screen: Supplier Management */
const suppliersScreen = {
  id: 'suppliers', name: 'Supplier Management', icon: 'factory',
  tabs: [
    {
      name: 'Scorecard', icon: 'award',
      render: () => {
        const score = (s) => Math.round(s.otd * 0.45 + s.quality * 0.35 + clamp(100 - (quart(deliveries.find((d) => d.s.id === s.id).d)[2] / s.lead - 1) * 200, 0, 100) * 0.2);
        const rows = net.suppliers.map((s) => ({ ...s, score: score(s), med: quart(deliveries.find((d) => d.s.id === s.id).d)[2], short: net.parts.filter((p) => p.supplier === s.id).reduce((a, p) => a + (A.shortBySku[p.sku] || 0), 0), open: state.pos.filter((p) => p.supplier === s.id && p.stage !== 'received').length }));
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Qualified suppliers', value: rows.length, icon: 'factory', sub: `${new Set(rows.map((r) => r.country)).size} countries · ${rows.filter((r) => r.country === 'Azerbaijan').length} local` },
            { label: 'Weighted on-time delivery', value: fmt.n(rows.reduce((s, r) => s + r.otd * r.spend, 0) / rows.reduce((s, r) => s + r.spend, 0), 1), unit: '%', icon: 'clock', tone: 'ok', delta: 1.8, spark: [86, 87, 89, 88, 90, 91, 92] },
            { label: 'Incoming quality', value: fmt.n(rows.reduce((s, r) => s + r.quality, 0) / rows.length, 1), unit: '%', icon: 'shield', tone: 'violet', sub: 'accepted at goods receipt' },
            { label: 'Suppliers on watch', value: rows.filter((r) => r.score < 88).length, icon: 'event', tone: 'warn', sub: 'composite score below 88' },
          ])}
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Lead time vs reliability', erp: ['SAP MM', 'suppliers'], sub: 'Bubble size = 12-month spend. Upper-left is where you want suppliers.', body: ui.chart('bub', 'md') })}
            ${ui.card({ title: 'Supplier capability profile', erp: ['SAP MM', 'suppliers'], sub: 'OTD, quality, lead-time adherence, responsiveness, local content', body: ui.chart('radar', 'md') })}
          </div>
          ${ui.card({ title: 'Supplier scorecard', erp: ['SAP MM', 'suppliers'], sub: 'Composite = 45 % OTD + 35 % quality + 20 % lead-time adherence', flush: true, body: ui.table({ id: 'inv-sup', rows: rows.sort((a, b) => b.score - a.score), rowId: (s) => s.id, cols: [
            { label: 'Supplier', key: 'name', render: (s) => `<b>${esc(s.name)}</b><span class="nx-sub">${esc(s.id)} · ${esc(s.country)}</span>` },
            { label: 'Category', key: 'cat' },
            { label: 'Score', align: 'r', key: 'score', render: (s) => ui.score(s.score, s.score >= 92 ? '#16a34a' : s.score >= 88 ? '#d97706' : '#dc2626') },
            { label: 'OTD', align: 'r', key: 'otd', render: (s) => ui.meter(s.otd, 100, s.otd >= 92 ? '#16a34a' : s.otd >= 85 ? '#d97706' : '#dc2626', `${s.otd}%`) },
            { label: 'Quality', align: 'r', key: 'quality', render: (s) => `${s.quality}%` },
            { label: 'Quoted / median lead', align: 'r', key: 'lead', render: (s) => `${s.lead} d / <b style="color:${s.med > s.lead * 1.1 ? '#dc2626' : 'inherit'}">${fmt.n(s.med)} d</b>` },
            { label: 'Open POs', align: 'r', key: 'open' },
            { label: 'Shortfall exposure', align: 'r', key: 'short', render: (s) => (s.short ? ui.badge(`${s.short} units`, 'crit') : '—') },
            { label: '12-mo spend', align: 'r', key: 'spend', render: (s) => money(s.spend) },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#inv-sup tr[data-row]', (e, tr) => openSupplier(tr.dataset.row));
        const maxSpend = Math.max(...net.suppliers.map((s) => s.spend));
        ctx.chart('bub', { grid: ch.grid({ top: 20 }), tooltip: { formatter: (p) => `<b>${esc(p.data.name)}</b><br/>Lead ${p.data.value[0]} d · OTD ${p.data.value[1]}%<br/>Spend ${money(p.data.value[2])}` }, xAxis: { type: 'value', name: 'Quoted lead time (d)', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'On-time %', min: 70, max: 100 }, series: [{ type: 'scatter', data: net.suppliers.map((s, i) => ({ name: s.name, value: [s.lead, s.otd, s.spend], symbolSize: 14 + (s.spend / maxSpend) * 44, itemStyle: { color: s.otd < 85 ? '#ef4444cc' : s.otd < 92 ? '#f59e0bcc' : '#16a34acc', borderColor: '#fff', borderWidth: 2 }, label: { show: true, position: 'right', formatter: s.name.split(' ')[0], fontSize: 10.5, color: '#334155' } })), markArea: { silent: true, itemStyle: { color: 'rgba(22,163,74,.05)' }, data: [[{ xAxis: 0, yAxis: 92 }, { xAxis: 30, yAxis: 100 }]] } }] }, { onClick: (p) => { const s = net.suppliers.find((x) => x.name === p.data.name); if (s) openSupplier(s.id); } });
        const top = net.suppliers.slice(0, 4);
        ctx.chart('radar', { legend: { bottom: 0, data: top.map((s) => s.name) }, tooltip: {}, radar: { radius: '62%', center: ['50%', '46%'], indicator: [{ name: 'OTD', max: 100 }, { name: 'Quality', max: 100 }, { name: 'Lead adherence', max: 100 }, { name: 'Responsiveness', max: 100 }, { name: 'Local content', max: 100 }], axisName: { color: '#475569', fontSize: 11 }, splitLine: { lineStyle: { color: '#e2e8f0' } }, splitArea: { areaStyle: { color: ['#fff', '#f8fafc'] } } }, series: [{ type: 'radar', data: top.map((s, i) => ({ name: s.name, value: [s.otd, s.quality, clamp(100 - (quart(deliveries[i].d)[2] / s.lead - 1) * 200, 40, 100), 70 + ((i * 13) % 25), s.country === 'Azerbaijan' ? 95 : 35], areaStyle: { opacity: 0.12 } })) }] });
      },
    },
    {
      name: 'Lead times', icon: 'clock',
      render: () => `<div class="nx-page">
        ${ui.card({ title: 'Actual lead-time distribution by supplier', erp: ['SAP MM', 'suppliers'], sub: 'Box = interquartile range of the last 24 deliveries; dot = quoted lead time. Wide boxes need more safety stock.', body: ui.chart('box', 'lg') })}
        <div class="nx-row nx-c2">
          ${ui.card({ title: 'Lead time vs required-by date', erp: ['SAP PM', 'workOrders'], sub: 'Open shortfalls: days until the job dispatches vs supplier lead time', body: ui.chart('need', 'md') })}
          ${ui.card({ title: 'Hardware shortage watch-list', erp: ['SAP MM', 'inventory'], exp: true, sub: 'The nine items with the least estimated cover beyond their lead time — a negative gap means stock is projected to run out first', flush: true, body: ui.table({ id: 'inv-watch', rowId: (r) => r.sku, rows: net.parts.map((p) => ({ ...p, fc: forecastOf(p) })).sort((a, b) => a.fc.cover - a.lead - (b.fc.cover - b.lead)).slice(0, 9), cols: [
            { label: 'SKU', key: 'sku', render: (p) => `<span class="inv-sku">${esc(p.sku)}</span><span class="nx-sub">${esc(p.supplierName)}</span>` },
            { label: 'Cover', align: 'r', sort: (p) => p.fc.cover, render: (p) => coverBadge(p.fc.cover) },
            { label: 'Lead', align: 'r', key: 'lead', render: (p) => `${p.lead} d` },
            { label: 'Gap', align: 'r', sort: (p) => p.fc.cover - p.lead, render: (p) => { const g = Math.round(p.fc.cover - p.lead); return `<b style="color:${g < 0 ? '#dc2626' : '#16a34a'}">${g > 0 ? '+' : ''}${g} d</b>`; } },
            { label: 'Stock-out', sort: (p) => p.fc.stockout, render: (p) => (p.fc.stockout ? fmt.short(p.fc.stockout) : '—') },
          ] }) })}
        </div>
        ${ui.card({ title: 'Lead-time drift — quoted vs actual', erp: ['SAP MM', 'suppliers'], sub: 'Quoted lead time against the median and 90th percentile of the last 24 deliveries. The gap is what safety stock has to absorb.', body: ui.chart('drift', 'md') })}</div>`,
      mount: (st, ctx) => {
        ctx.on('click', '#inv-watch tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        const p90 = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(0.9 * (a.length - 1))]; };
        ctx.chart('drift', ch.bar({ x: deliveries.map((d) => d.s.name.split(' ')[0]), series: [{ name: 'Quoted', data: deliveries.map((d) => d.s.lead), color: '#94a3b8' }, { name: 'Median actual', data: deliveries.map((d) => +quart(d.d)[2].toFixed(1)), color: '#2563eb' }, { name: 'P90 actual', data: deliveries.map((d) => p90(d.d)), color: '#dc2626' }], yName: 'days', labels: false }));
        ctx.chart('box', { grid: ch.grid({ top: 20, left: 12 }), tooltip: { trigger: 'item' }, xAxis: { type: 'category', data: deliveries.map((d) => d.s.name), axisLabel: { interval: 0, fontSize: 10.5, color: '#475569', formatter: (v) => v.replace(/ (LLC|GmbH|Co\.|Works|Services|Supplies|Fabrication)$/, '').replace(' ', '\n') } }, yAxis: { type: 'value', name: 'days' }, series: [{ name: 'Actual lead', type: 'boxplot', data: deliveries.map((d) => quart(d.d).map((v) => +v.toFixed(1))), itemStyle: { color: '#dbeafe', borderColor: '#2563eb', borderWidth: 1.5 } }, { name: 'Quoted', type: 'scatter', data: deliveries.map((d) => d.s.lead), symbolSize: 11, itemStyle: { color: '#0f172a' } }] });
        const pts = A.jobs.flatMap((j) => j.lines.filter((l) => l.short && j.dispatchIn != null).map((l) => ({ name: `${j.wo.id} · ${l.sku}`, value: [j.dispatchIn, l.lead], late: l.lead > j.dispatchIn })));
        ctx.chart('need', { grid: ch.grid({ top: 20 }), tooltip: { formatter: (p) => `${esc(p.data.name)}<br/>Dispatch in ${p.data.value[0]} d · lead ${p.data.value[1]} d` }, xAxis: { type: 'value', name: 'Days to dispatch', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'Lead time (d)' }, series: [{ type: 'scatter', symbolSize: 12, data: pts.map((p) => ({ ...p, itemStyle: { color: p.late ? '#dc2626' : '#16a34a' } })), markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#94a3b8' }, label: { formatter: 'lead = time left' }, data: [[{ coord: [0, 0] }, { coord: [120, 120] }]] } }] });
      },
    },
    {
      name: 'Supply risk', icon: 'shield',
      render: () => {
        const risk = net.suppliers.map((s) => { const parts = net.parts.filter((p) => p.supplier === s.id); const sole = parts.length; const crit = parts.filter((p) => p.critical).length; const dl = quart(deliveries.find((d) => d.s.id === s.id).d); const variability = (dl[3] - dl[1]) / s.lead; const geo = s.country === 'Azerbaijan' ? 1 : ['Türkiye', 'UAE'].includes(s.country) ? 2 : 3; const r = Math.round(clamp((100 - s.otd) * 1.6 + variability * 40 + crit * 6 + geo * 6, 0, 100)); return { s, sole, crit, variability, geo, r }; }).sort((a, b) => b.r - a.r);
        const critSingle = net.parts.filter((p) => p.critical).length;
        const importSpend = net.suppliers.filter((x) => x.country !== 'Azerbaijan').reduce((a, x) => a + x.spend, 0) / net.suppliers.reduce((a, x) => a + x.spend, 0);
        return `<div class="nx-page">${ui.kpis([
          { label: 'Single-sourced items', value: `${net.parts.length}/${net.parts.length}`, icon: 'link', tone: 'warn', sub: 'every item has one approved supplier today' },
          { label: 'Critical spares single-sourced', value: critSingle, icon: 'alert', tone: 'crit', sub: 'second-source qualification programme' },
          { label: 'Imported share of spend', value: fmt.pct(importSpend * 100), icon: 'cart', tone: 'info', sub: 'customs adds 3–7 days to lead time' },
          { label: 'Highest supplier risk', value: risk[0].r, icon: 'shield', tone: risk[0].r >= 50 ? 'crit' : 'warn', sub: risk[0].s.name, exp: true },
        ])}<div class="nx-row nx-c12">
          ${ui.card({ cls: 'nx-s5', title: 'Supply-risk matrix', exp: true, sub: 'Estimated probability of a late delivery (100 − OTD) × impact on critical spares', body: ui.chart('rmx', 'md') })}
          ${ui.card({ cls: 'nx-s3', title: 'Spend by supplier country', erp: ['SAP MM', 'suppliers'], sub: 'Geographic concentration of 12-month spend', body: ui.chart('ctry', 'md') })}
          ${ui.card({ cls: 'nx-s4', title: 'Mitigations in place', body: ui.timeline([
            { when: 'Active', title: 'Vendor-managed inventory — Caspian Line Hardware', text: 'Dampers, clamps and cotter pins replenished weekly to North Depot against min/max.', tone: 'ok' },
            { when: 'Active', title: 'Frame agreement — Anatolia Insulator Works', text: 'Long-rod insulators held at supplier for 6 weeks of demand; call-off within 10 days.', tone: 'ok' },
            { when: 'In negotiation', title: 'Second source for 245 kV bushings', text: 'Single-source exposure on TX-BSH-245 (84 d lead). Qualification samples due Q1 2027.', tone: 'warn' },
            { when: 'Watch', title: 'Kura Steel Fabrication on improvement plan', text: `OTD ${supplierById.get('SUP-04').otd}% — weekly expediting call; galvanising capacity added Dec.`, tone: 'crit' },
          ]) })}
          </div>
          ${ui.card({ title: 'Supplier risk register', erp: ['SAP MM', 'suppliers'], exp: true, sub: 'Heuristic risk score from late-delivery rate, lead-time variability, critical items and logistics distance. The weights are assumptions, not fitted to delivery history.', flush: true, body: ui.table({ id: 'inv-srisk', rows: risk, rowId: (r) => r.s.id, cols: [
            { label: 'Supplier', sort: (r) => r.s.name, render: (r) => `<b>${esc(r.s.name)}</b><span class="nx-sub">${esc(r.s.country)}</span>` },
            { label: 'Risk', align: 'r', sort: (r) => r.r, render: (r) => ui.score(r.r, r.r >= 50 ? '#dc2626' : r.r >= 30 ? '#d97706' : '#16a34a') },
            { label: 'Items sourced', align: 'r', sort: (r) => r.sole, render: (r) => String(r.sole) },
            { label: 'Critical items', align: 'r', sort: (r) => r.crit, render: (r) => (r.crit ? ui.badge(String(r.crit), 'high') : '—') },
            { label: 'Lead variability (IQR / quoted)', align: 'r', sort: (r) => r.variability, render: (r) => fmt.pct(r.variability * 100) },
            { label: 'Logistics distance', sort: (r) => r.geo, render: (r) => ['', 'Domestic', 'Regional', 'International'][r.geo] },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#inv-srisk tr[data-row]', (e, tr) => openSupplier(tr.dataset.row));
        const byC = {}; for (const x of net.suppliers) byC[x.country] = (byC[x.country] || 0) + x.spend;
        ctx.chart('ctry', ch.donut({ data: Object.entries(byC).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, value: Math.round(v) })), center: 'spend', value: money(Object.values(byC).reduce((a, b) => a + b, 0)) }));
        ctx.chart('rmx', { grid: ch.grid({ top: 20 }), tooltip: { trigger: 'item', formatter: (p) => (p.data?.name ? `<b>${esc(p.data.name)}</b><br/>Estimated late-delivery probability ${fmt.n(p.data.value[0], 0)} %<br/>Critical spares supplied: ${Math.round(p.data.value[1] - 0.4)}` : '') }, xAxis: { type: 'value', name: 'Est. late-delivery probability %', min: 0, max: 30, nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'Impact (critical spares)', min: 0, max: 6 }, visualMap: { show: false, dimension: 0, min: 0, max: 30, inRange: { color: ['#16a34a', '#f59e0b', '#dc2626'] } }, series: [{ type: 'scatter', symbolSize: 22, data: net.suppliers.map((s) => ({ name: s.name, value: [100 - s.otd, net.parts.filter((p) => p.supplier === s.id && p.critical).length + 0.4], label: { show: true, position: 'right', formatter: s.name.split(' ')[0], fontSize: 10.5, color: '#334155' } })), markArea: { silent: true, data: [[{ xAxis: 0, yAxis: 0, itemStyle: { color: 'rgba(22,163,74,.06)' } }, { xAxis: 10, yAxis: 2 }], [{ xAxis: 10, yAxis: 2, itemStyle: { color: 'rgba(245,158,11,.07)' } }, { xAxis: 20, yAxis: 4 }], [{ xAxis: 20, yAxis: 4, itemStyle: { color: 'rgba(220,38,38,.07)' } }, { xAxis: 30, yAxis: 6 }]] } }] });
      },
    },
  ],
};

/* ================================================================== screen: Procurement */
const STAGES = [['pr', 'Purchase request'], ['rfq', 'RFQ / sourcing'], ['po', 'PO released'], ['shipped', 'In transit'], ['received', 'Goods received']];
const procurementScreen = {
  id: 'procurement', name: 'Procurement', icon: 'cart',
  tabs: [
    {
      name: 'Pipeline', icon: 'flow',
      render: () => {
        const all = [...state.prs, ...state.pos];
        const by = Object.fromEntries(STAGES.map(([k]) => [k, all.filter((x) => x.stage === k)]));
        const late = state.pos.filter((p) => p.late).length;
        return `<div class="nx-page">
          <div class="inv-flow">${STAGES.map(([k, l]) => `<div><small>${esc(l)}</small><b>${by[k].length}</b><div class="nx-note">${money(by[k].reduce((s, x) => s + x.value, 0))}</div></div>`).join('')}</div>
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Procure-to-pay funnel', erp: ['SAP MM', 'purchasing'], sub: 'Document value at each step (requisition → goods receipt)', body: ui.chart('funnel', 'md') })}
            ${ui.card({ title: 'Inbound deliveries — next 12 weeks', erp: ['SAP MM', 'purchasing'], sub: 'Promised receipts (purchase-order delivery dates) by week and depot', body: ui.chart('inbound', 'md') })}
          </div>
          ${late ? ui.callout(`<b>${late} purchase order(s) past their promised date.</b> Expedite with the supplier or call off from the frame agreement.`, 'warn', 'clock') : ''}
          ${ui.card({ title: 'Purchase orders', erp: ['SAP MM', 'purchasing'], sub: `${erp.syncedText('purchasing')} · ME2N · read-only here`, tools: ui.search('#inv-po', 'Search PO, SKU, supplier…'), flush: true, body: ui.table({ id: 'inv-po', rows: state.pos, rowId: (p) => p.id, cols: [
            { label: 'PO', key: 'id', render: (p) => `<b class="inv-sku">${esc(p.id)}</b><span class="nx-sub">created ${fmt.short(p.created)}</span>` },
            { label: 'Item', key: 'sku', render: (p) => `<span class="inv-sku">${esc(p.sku)}</span><span class="nx-sub">${esc(p.name)}</span>` },
            { label: 'Supplier', key: 'supplierName' },
            { label: 'Qty', align: 'r', key: 'qty' },
            { label: 'Value', align: 'r', key: 'value', render: (p) => money(p.value) },
            { label: 'Deliver to', key: 'depot', render: (p) => esc(depotName[p.depot]) },
            { label: 'ETA', key: 'eta', render: (p) => `${fmt.short(p.eta)}${p.late ? ` ${ui.badge('late', 'crit')}` : ''}` },
            { label: 'Status', sort: (p) => STAGES.findIndex(([k]) => k === p.stage), render: (p) => ui.badge(STAGES.find(([k]) => k === p.stage)[1], { rfq: 'muted', po: 'accent', shipped: 'violet', received: 'ok' }[p.stage]) },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        const all = [...state.prs, ...state.pos];
        const cum = STAGES.map(([k], i) => all.filter((x) => STAGES.findIndex(([s]) => s === x.stage) >= i).reduce((s, x) => s + x.value, 0));
        ctx.chart('funnel', { tooltip: { formatter: (p) => `${esc(p.name)}<br/><b>${money(p.value)}</b>` }, series: [{ type: 'funnel', left: '8%', width: '84%', top: 8, bottom: 8, sort: 'none', gap: 3, label: { position: 'inside', formatter: (p) => `${p.name}\n${money(p.value)}`, fontSize: 11, color: '#fff' }, data: STAGES.map(([k, l], i) => ({ name: l, value: Math.round(cum[i]) || 1, itemStyle: { color: ['#94a3b8', '#64748b', '#2563eb', '#7c3aed', '#16a34a'][i] } })) }] });
        const weeks = Array.from({ length: 12 }, (_, i) => addDays(AS_OF, i * 7));
        ctx.chart('inbound', ch.bar({ x: weeks.map((w) => fmt.short(w)), stack: true, series: depots.map((d, i) => ({ name: d.short, data: weeks.map((w) => Math.round(state.pos.filter((p) => p.depot === d.id && p.stage !== 'received' && p.eta >= w && p.eta < addDays(w, 7)).reduce((s, p) => s + p.value, 0) / 1000)), color: ['#2563eb', '#14b8a6', '#8b5cf6'][i] })), yName: '$k' }));
        ctx.on('click', '#inv-po tr[data-row]', (e, tr) => openPO(tr.dataset.row));
      },
    },
    {
      name: 'Purchase requests', icon: 'doc',
      render: () => {
        const sugg = net.parts.map((p) => { const fc = forecastOf(p); const inbound = state.pos.filter((x) => x.sku === p.sku && x.stage !== 'received').reduce((s, x) => s + x.qty, 0) + state.prs.filter((x) => x.sku === p.sku).reduce((s, x) => s + x.qty, 0); const pos = fc.onHandNow + inbound - (A.shortBySku[p.sku] || 0); return { p, fc, inbound, pos, qty: Math.max(fc.eoq, Math.ceil(fc.rop - pos + fc.ss)), need: pos < fc.rop }; }).filter((x) => x.need);
        const openPO = state.pos.filter((x) => x.stage !== 'received');
        const DOA = [['Planner', 0, 10000], ['Maintenance manager', 10000, 50000], ['Head of asset management', 50000, 250000], ['Director (CAPEX board)', 250000, Infinity]];
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'PRs awaiting release', value: state.prs.length, icon: 'doc', tone: 'warn', sub: `${money(state.prs.reduce((a, x) => a + x.value, 0))} · released in SAP MM` },
            { label: 'Reorder suggestions', value: sugg.length, icon: 'ai', tone: sugg.length ? 'info' : 'ok', sub: 'items below estimated reorder point', exp: true },
            { label: 'PR → PO cycle time', value: '4.6', unit: 'days', icon: 'clock', tone: 'ok', delta: -0.8, deltaInvert: true, deltaSuffix: ' d', sub: 'median, last 12 weeks · target 5 d', spark: [6.8, 6.1, 5.9, 5.4, 5.6, 5.0, 4.8, 4.6] },
            { label: 'Open commitments', value: money(openPO.reduce((a, x) => a + x.value, 0)), icon: 'wallet', tone: 'violet', sub: `${openPO.length} open purchase orders` },
          ])}
          ${ui.card({ title: 'Reorder suggestions', exp: true, sub: 'Inventory position (free + inbound − shortfall) below the estimated reorder point. Quantity = max(EOQ, gap to ROP + safety stock). A request asks SAP MM to create the requisition; nothing is created here.', tools: ui.btn(`Request ${sugg.length} requisitions in SAP MM`, { primary: true, ic: 'ai', attrs: 'data-auto' }), flush: true, body: ui.table({ id: 'inv-sugg', rows: sugg, rowId: (x) => x.p.sku, empty: 'No item is below its estimated reorder point.', cols: [
            { label: 'SKU', sort: (x) => x.p.sku, render: (x) => `<span class="inv-sku">${esc(x.p.sku)}</span><span class="nx-sub">${esc(x.p.name)}</span>` },
            { label: 'Position', align: 'r', sort: (x) => x.pos, render: (x) => fmt.n(x.pos) },
            { label: 'Reorder point', align: 'r', sort: (x) => x.fc.rop, render: (x) => fmt.n(x.fc.rop, 1) },
            { label: 'Inbound', align: 'r', key: 'inbound', sort: (x) => x.inbound, render: (x) => fmt.n(x.inbound) },
            { label: 'Suggest qty', align: 'r', sort: (x) => x.qty, render: (x) => `<b>${x.qty}</b> ${esc(x.p.uom)}` },
            { label: 'Value', align: 'r', sort: (x) => x.qty * x.p.unitCost, render: (x) => money(x.qty * x.p.unitCost) },
            { label: 'Supplier', sort: (x) => x.p.supplierName, render: (x) => `${esc(x.p.supplierName)}<span class="nx-sub">lead ${x.p.lead} d</span>` },
            { label: '', sort: false, render: (x) => ui.btn('Request PR', { sm: true, attrs: `data-pr="${esc(x.p.sku)}" data-q="${x.qty}"` }) },
          ] }) })}
          ${ui.card({ title: `Purchase requisitions in SAP MM (${state.prs.length})`, erp: ['SAP MM', 'purchasing'], sub: 'Open requisitions read from SAP MM, and requisition requests sent to SAP MM from this workspace (ERP reference and status). SAP MM creates and releases the documents; none is kept or edited here.', flush: true, body: ui.table({ id: 'inv-pr', rows: state.prs, rowId: (x) => x.id, empty: 'No open requisition in SAP MM and no request sent from this workspace.', cols: [
            { label: 'ERP reference', key: 'id', render: (x) => `<b class="inv-sku">${esc(x.id)}</b>` }, { label: 'Item', key: 'sku', render: (x) => `<span class="inv-sku">${esc(x.sku)}</span><span class="nx-sub">${esc(x.name)}</span>` },
            { label: 'Qty', align: 'r', key: 'qty' }, { label: 'Value', align: 'r', key: 'value', render: (x) => money(x.value) }, { label: 'Supplier', key: 'supplierName' }, { label: 'Reason', key: 'reason' }, { label: 'Need by', key: 'need', render: (x) => fmt.short(x.need) },
            { label: 'Status', sort: (x) => prStatus(x)[0], render: (x) => ui.badge(...prStatus(x)) },
            { label: '', sort: false, render: (x) => (x.requested || state.prRelease.has(x.id) ? '' : ui.btn('Request release in SAP MM', { sm: true, primary: true, attrs: `data-po="${esc(x.id)}"` })) },
          ] }) })}
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s5', title: 'Requisition-to-PO cycle time', erp: ['SAP MM', 'purchasing'], sub: 'Median days from PR creation to PO release, weekly', body: ui.chart('cyc', 'md') })}
            ${ui.card({ cls: 'nx-s4', title: 'Open commitments by category', erp: ['SAP MM', 'purchasing'], sub: 'Value on released, not yet received POs', body: ui.chart('commit', 'md') })}
            ${ui.card({ cls: 'nx-s3', title: 'Release authority (DoA)', sub: 'Who releases each requisition in SAP MM', body: `<div class="nx-list">${DOA.map(([who, lo, hi]) => { const n = state.prs.filter((x) => x.value >= lo && x.value < hi).length; return ui.li({ ic: 'key', title: who, sub: hi === Infinity ? `≥ ${money(lo)}` : `${money(lo)} – ${money(hi)}`, end: ui.badge(`${n} PR`, n ? 'warn' : 'muted', { dot: false }) }); }).join('')}</div>` })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '[data-auto]', () => autoReplenish());
        const r3 = rng(4242); const wks = Array.from({ length: 12 }, (_, i) => addDays(AS_OF, (i - 11) * 7));
        ctx.chart('cyc', ch.line({ x: wks.map((w) => fmt.short(w)), series: [{ name: 'Median cycle time (d)', data: wks.map((_, i) => +(7.2 - i * 0.22 + (r3() - 0.5) * 1.1).toFixed(1)), color: '#2563eb', area: true, symbol: true, markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: '#16a34a' }, label: { formatter: 'target 5 d', color: '#16a34a', position: 'insideEndTop' }, data: [{ yAxis: 5 }] } }], yName: 'days', legend: false, yMin: 0 }));
        const cats = [...new Set(net.parts.map((x) => x.cat))];
        const cv = cats.map((c) => ({ c, v: state.pos.filter((x) => x.stage !== 'received' && partBySku.get(x.sku)?.cat === c).reduce((a, x) => a + x.value, 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
        ctx.chart('commit', ch.bar({ x: cv.map((x) => x.c), horizontal: true, series: [{ name: 'Open PO value', data: cv.map((x) => Math.round(x.v)), color: '#7c3aed', labelFmt: (q) => money(q.value) }], labels: true, grid: { top: 6, right: 50 }, tooltip: { valueFormatter: (v) => money(v) } }));
        ctx.on('click', '[data-pr]', (e, b) => { e.stopPropagation(); raisePR(b.dataset.pr, Number(b.dataset.q)); });
        ctx.on('click', '[data-po]', (e, b) => {
          e.stopPropagation();
          // Releasing a requisition to a purchase order is a purchasing decision taken in SAP MM: ask for it there.
          // The purchase order is created by SAP MM and arrives with the next sync; none is built here.
          const pr = state.prs.find((x) => x.id === b.dataset.po); if (!pr || state.prRelease.has(pr.id)) return;
          state.prRelease.set(pr.id, erpRequest('purchasing', `Release requisition ${pr.id} to purchase order · ${pr.qty} × ${pr.sku}`, { requisition: pr.id, sku: pr.sku, qty: pr.qty, supplier: pr.supplier }).ref);
          nav.rerender();
        });
      },
    },
    {
      name: 'Spend', icon: 'dollar',
      render: () => {
        const tot = net.suppliers.reduce((a, x) => a + x.spend, 0);
        const ytd = MONTHS.slice(2).reduce((a, _, i) => a + net.parts.reduce((b, p) => b + hist.get(p.sku)[i + 2] * p.unitCost, 0) * 1.15, 0);
        return `<div class="nx-page">${ui.kpis([
          { label: '12-month spend', value: money(tot), icon: 'dollar', sub: `${net.suppliers.length} suppliers`, spark: [62, 71, 68, 80, 77, 84, 90] },
          { label: 'Under contract', value: fmt.pct((net.suppliers.filter((x) => !/Spot/.test((CONTRACT[x.id] || ['Spot'])[0])).reduce((a, x) => a + x.spend, 0) / tot) * 100), icon: 'doc', tone: 'ok', sub: 'frame, VMI or catalogue agreements' },
          { label: 'Purchase price variance', value: '+2.4', unit: '%', icon: 'trend', tone: 'warn', sub: 'actual vs standard cost, YTD', delta: 2.4, deltaInvert: true },
          { label: 'Budget used (FY 2026)', value: fmt.n((ytd / 610000) * 100, 0), unit: '%', icon: 'wallet', tone: ytd > 610000 * 0.9 ? 'warn' : 'violet', sub: `${money(ytd)} of the $610k MRO materials budget` },
        ])}<div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s5', title: 'Spend by supplier', erp: ['SAP MM', 'suppliers'], sub: '12-month committed spend', body: ui.chart('sps', 'md') })}
        ${ui.card({ cls: 'nx-s7', title: 'Spend by category and month', erp: ['SAP MM', 'inventory'], sub: 'Material consumption at standard cost ($k)', body: ui.chart('spm', 'md') })}
        </div><div class="nx-row nx-c3">
        ${ui.card({ title: 'Budget burn, FY 2026', sub: 'Materials spend against the approved MRO budget', body: ui.chart('burn', 'lg') })}
        ${ui.card({ title: 'Contract coverage', erp: ['SAP MM', 'suppliers'], sub: 'Spend by agreement type', body: ui.chart('ctype', 'lg') })}
        ${ui.card({ title: 'Price variance by category', erp: ['SAP MM', 'purchasing'], sub: 'Paid vs standard cost, % (positive = paid more)', body: ui.chart('ppv', 'lg') })}
        </div></div>`;
      },
      mount: (st, ctx) => {
        const s = [...net.suppliers].sort((a, b) => b.spend - a.spend);
        ctx.chart('sps', ch.donut({ data: s.map((x) => ({ name: x.name, value: Math.round(x.spend) })), center: '12-mo spend', value: money(s.reduce((a, x) => a + x.spend, 0)), legend: 'right' }));
        const budget = 610000; const ytdMonths = MONTHS.slice(2); let cum = 0;
        const mspend = ytdMonths.map((m, i) => { cum += net.parts.reduce((a, p) => a + hist.get(p.sku)[i + 2] * p.unitCost, 0) * 1.15; return Math.round(cum / 1000); });
        ctx.chart('burn', ch.line({ x: ytdMonths.map(monLabel), series: [{ name: 'Actual cumulative ($k)', data: mspend, color: '#7c3aed', area: true, symbol: true }, { name: 'Budget profile ($k)', data: ytdMonths.map((_, i) => Math.round((budget / 1000) * ((i + 1) / 12))), color: '#94a3b8', dash: true }], yName: '$k', yMin: 0 }));
        const types = {}; for (const x of net.suppliers) { const t = (CONTRACT[x.id] || ['Spot buy'])[0]; types[t] = (types[t] || 0) + x.spend; }
        ctx.chart('ctype', ch.donut({ data: Object.entries(types).map(([k, v]) => ({ name: k, value: Math.round(v) })), center: 'spend', value: money(Object.values(types).reduce((a, b) => a + b, 0)), legend: 'bottom', colors: ['#2563eb', '#14b8a6', '#8b5cf6', '#f59e0b', '#64748b', '#ec4899', '#0ea5e9'] }));
        const pc = [...new Set(net.parts.map((x) => x.cat))]; const r5 = rng(909);
        const ppv = pc.map((c) => +((r5() - 0.35) * 9).toFixed(1));
        ctx.chart('ppv', ch.bar({ x: pc, horizontal: true, series: [{ name: 'PPV %', data: ppv.map((v) => ({ value: v, itemStyle: { color: v > 0 ? '#dc2626' : '#16a34a', borderRadius: v > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })), labelFmt: (q) => `${q.value > 0 ? '+' : ''}${q.value}%` }], labels: true, grid: { top: 6, right: 40 } }));
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        ctx.chart('spm', ch.bar({ x: MONTHS.map(monLabel), stack: true, yName: '$k', series: cats.map((c) => ({ name: c, data: MONTHS.map((_, i) => Math.round(net.parts.filter((p) => p.cat === c).reduce((a, p) => a + hist.get(p.sku)[i] * p.unitCost, 0) / 1000)) })) }));
      },
    },
  ],
};

/* ================================================================== screen: Stock Forecast */
const forecastScreen = {
  id: 'forecast', name: 'Stock Forecast', icon: 'forecast', exp: true,
  tabs: [
    {
      name: 'Demand forecast', icon: 'forecast',
      render: () => {
        const opts = [...net.parts].sort((a, b) => b.demand - a.demand);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Forecast demand · next 6 months', value: money(net.parts.reduce((s, p) => s + forecastOf(p).f.reduce((a, b) => a + b, 0) * p.unitCost, 0)), icon: 'forecast', tone: 'violet', sub: 'at standard cost, all items', exp: true },
            { label: 'Forecast error (MAPE)', value: '14.2', unit: '%', icon: 'target', tone: 'ok', sub: 'back-test on simulated demo data, not on real consumption', delta: -2.1, deltaInvert: true, },
            { label: 'Items projected to stock out', value: net.parts.filter((p) => forecastOf(p).cover < p.lead).length, icon: 'event', tone: 'crit', sub: 'before replenishment can arrive', exp: true },
            { label: 'Campaign uplift', value: '+31', unit: '%', icon: 'drone', sub: 'assumed spring inspection campaign effect', exp: true },
          ])}
          ${ui.card({ title: 'Consumption history and forecast', erp: ['SAP MM', 'inventory'], exp: true, sub: 'Monthly issues read from SAP MM, and 6-month forecast with 80 % interval. Next two months include the open work-order pipeline.', tools: `<select class="nx-select" id="inv-fsku">${opts.map((p) => `<option value="${esc(p.sku)}">${esc(p.sku)} — ${esc(p.name)}</option>`).join('')}</select>`, body: `<div class="nx-row" style="grid-template-columns:minmax(0,1fr) 260px"><div class="nx-chart is-lg" data-chart="fc"></div><div id="inv-fstats"></div></div>` })}
          ${ui.card({ title: 'Forecast demand by category', exp: true, sub: 'Next 6 months, units converted to value ($k)', body: ui.chart('fcat', 'md') })}</div>`;
      },
      mount: (st, ctx) => {
        const sel = st.querySelector('#inv-fsku');
        const draw = () => {
          const p = partBySku.get(sel.value); const fc = forecastOf(p);
          ctx.chart('fc', forecastChart(p, fc));
          st.querySelector('#inv-fstats').innerHTML = `${ui.kv([['Mean monthly use', `${fmt.n(fc.mean, 1)} ${esc(p.uom)}`], ['Std. deviation', fmt.n(fc.sd, 1)], ['Lead time', `${p.lead} d`], ['Safety stock (95 %)', fmt.n(fc.ss, 1)], ['Reorder point', fmt.n(fc.rop, 1)], ['EOQ', fmt.n(fc.eoq)], ['Free stock', fmt.n(fc.onHandNow)], ['Days of cover', coverBadge(fc.cover)], ['Projected stock-out', fc.stockout ? fmt.date(fc.stockout) : '—']])}<div style="margin-top:12px">${ui.btn('Open item', { sm: true, attrs: `data-open="${esc(p.sku)}"` })} ${ui.btn('Request PR in SAP MM', { sm: true, primary: true, attrs: `data-pr2="${esc(p.sku)}" data-q="${fc.eoq}"` })}</div>`;
        };
        sel.addEventListener('change', draw); draw();
        ctx.on('click', '[data-open]', (e, b) => openPart(b.dataset.open));
        ctx.on('click', '[data-pr2]', (e, b) => raisePR(b.dataset.pr2, Number(b.dataset.q)));
        const cats = [...new Set(net.parts.map((p) => p.cat))];
        ctx.chart('fcat', ch.bar({ x: FMONTHS.map(monLabel), stack: true, yName: '$k', series: cats.map((c) => ({ name: c, data: FMONTHS.map((_, i) => Math.round(net.parts.filter((p) => p.cat === c).reduce((a, p) => a + forecastOf(p).f[i] * p.unitCost, 0) / 1000)) })) }));
      },
    },
    {
      name: 'Reorder planning', icon: 'sliders',
      render: () => {
        const rows = net.parts.map((p) => ({ p, fc: forecastOf(p) }));
        const now = rows.filter((r) => r.fc.onHandNow < r.fc.rop); const watch = rows.filter((r) => r.fc.onHandNow >= r.fc.rop && r.fc.cover < r.p.lead * 2);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Reorder now', value: now.length, icon: 'alert', tone: now.length ? 'crit' : 'ok', sub: 'free stock below estimated reorder point', exp: true },
            { label: 'Watch', value: watch.length, icon: 'event', tone: 'warn', sub: 'cover under two lead times' },
            { label: 'Total safety stock value', value: money(rows.reduce((a, r) => a + r.fc.ss * r.p.unitCost, 0)), icon: 'shield', tone: 'violet', sub: '95 % cycle service level' },
            { label: 'Average order cycle', value: fmt.n(rows.reduce((a, r) => a + (r.fc.daily > 0 ? r.fc.eoq / r.fc.daily : 0), 0) / rows.length, 0), unit: 'days', icon: 'sync', sub: 'EOQ ÷ daily demand' },
          ])}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Days of cover vs supplier lead time', sub: 'Below the diagonal the stock is projected to run out before an order placed today would arrive. Size = item value on hand.', body: ui.chart('cvl', 'md') })}
          ${ui.card({ cls: 'nx-s4', title: 'Inventory position vs reorder point', sub: 'Items closest to their trigger', body: ui.chart('posrop', 'md') })}</div>
          ${ui.card({ title: 'Reorder parameters', exp: true, sub: 'Safety stock = z·σ·√L (z = 1.65, 95 % cycle service). ROP = daily demand × lead + SS. EOQ with $85 order cost and 22 %/yr holding.', flush: true, body: ui.table({ id: 'inv-rop', rows, rowId: (r) => r.p.sku, cols: [
            { label: 'SKU', sort: (r) => r.p.sku, render: (r) => `<span class="inv-sku">${esc(r.p.sku)}</span><span class="nx-sub">${esc(r.p.name)}</span>` },
            { label: 'Daily demand', align: 'r', sort: (r) => r.fc.daily, render: (r) => fmt.n(r.fc.daily, 2) },
            { label: 'Lead', align: 'r', sort: (r) => r.p.lead, render: (r) => `${r.p.lead} d` },
            { label: 'Safety stock', align: 'r', sort: (r) => r.fc.ss, render: (r) => fmt.n(r.fc.ss, 1) },
            { label: 'ROP', align: 'r', sort: (r) => r.fc.rop, render: (r) => `<b>${fmt.n(r.fc.rop, 1)}</b>` },
            { label: 'Current min / max', align: 'r', sort: (r) => r.p.min, render: (r) => `${r.p.min} / ${r.p.max}` },
            { label: 'EOQ', align: 'r', sort: (r) => r.fc.eoq, render: (r) => fmt.n(r.fc.eoq) },
            { label: 'Free stock', align: 'r', sort: (r) => r.fc.onHandNow, render: (r) => `<b style="color:${r.fc.onHandNow < r.fc.rop ? '#dc2626' : 'inherit'}">${fmt.n(r.fc.onHandNow)}</b>` },
            { label: 'Days of cover', align: 'r', sort: (r) => r.fc.cover, render: (r) => coverBadge(r.fc.cover) },
            { label: 'Action', sort: (r) => (r.fc.onHandNow < r.fc.rop ? 0 : 1), render: (r) => (r.fc.onHandNow < r.fc.rop ? ui.badge('Reorder now', 'crit') : r.fc.cover < r.p.lead * 2 ? ui.badge('Watch', 'warn') : ui.badge('OK', 'ok')) },
          ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#inv-rop tr[data-row]', (e, tr) => openPart(tr.dataset.row));
        const rows = net.parts.map((p) => ({ p, fc: forecastOf(p) }));
        const mv = Math.max(...rows.map((r) => stockOf(r.p) * r.p.unitCost));
        ctx.chart('cvl', { grid: ch.grid({ top: 20 }), tooltip: { trigger: 'item', formatter: (q) => `<b>${esc(q.data.sku)}</b><br/>${esc(q.data.nm)}<br/>Cover ${q.data.value[0] >= 400 ? '400+' : q.data.value[0]} d · lead ${q.data.value[1]} d<br/>Value on hand ${money(q.data.v)}` }, xAxis: { type: 'value', name: 'Days of cover', nameLocation: 'middle', nameGap: 26, max: 400 }, yAxis: { type: 'value', name: 'Lead time (d)' }, series: [{ type: 'scatter', data: rows.map((r) => ({ sku: r.p.sku, nm: r.p.name, v: stockOf(r.p) * r.p.unitCost, value: [Math.min(400, Math.round(r.fc.cover)), r.p.lead], symbolSize: 8 + Math.sqrt((stockOf(r.p) * r.p.unitCost) / mv) * 30, itemStyle: { color: r.fc.cover < r.p.lead ? '#dc2626' : r.fc.cover < r.p.lead * 2 ? '#f59e0b' : '#16a34a', opacity: 0.8, borderColor: '#fff' } })), markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#94a3b8' }, label: { formatter: 'cover = lead' }, data: [[{ coord: [0, 0] }, { coord: [120, 120] }]] } }] }, { onClick: (q) => openPart(q.data.sku) });
        const near = rows.map((r) => ({ ...r, ratio: r.fc.rop ? r.fc.onHandNow / r.fc.rop : 9 })).sort((a, b) => a.ratio - b.ratio).slice(0, 8);
        ctx.chart('posrop', ch.bar({ x: near.map((r) => r.p.sku), horizontal: true, series: [{ name: 'Free stock', data: near.map((r) => +r.fc.onHandNow.toFixed(1)), color: '#2563eb' }, { name: 'Reorder point', data: near.map((r) => +r.fc.rop.toFixed(1)), color: '#f59e0b' }], grid: { top: 28 } }), { onClick: (q) => openPart(q.name) });
      },
    },
    {
      name: 'Days of cover', icon: 'calendar',
      render: () => {
        const outs = net.parts.map((p) => ({ p, fc: forecastOf(p) })).filter((x) => x.fc.stockout && x.fc.cover < 365).sort((a, b) => a.fc.cover - b.fc.cover);
        return `<div class="nx-page"><div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Projected days of cover — item × depot', exp: true, sub: 'Free stock after reservations ÷ forecast daily use, apportioned by depot share of jobs. Red cells are projected to run out before a replenishment order can arrive.', body: '<div class="nx-chart" data-chart="dheat" style="height:620px"></div>' })}
        ${ui.card({ cls: 'nx-s4', title: 'Stock-out calendar', sub: 'Projected network stock-out date in the next 12 months, against the date an order placed today would land', body: `${ui.chart('cband', 'sm')}${outs.length ? ui.timeline(outs.slice(0, 8).map((x) => ({ when: `${fmt.date(x.fc.stockout)} · ${fmt.n(x.fc.cover)} d`, title: `${x.p.sku} · ${x.p.name}`, text: `An order placed today is due ${fmt.date(addDays(AS_OF, x.p.lead))} on quoted lead time — ${x.fc.cover < x.p.lead ? `<b style="color:#dc2626">${fmt.n(x.p.lead - x.fc.cover)} d gap, expedite</b>` : 'in time if ordered this week'}`, tone: x.fc.cover < x.p.lead ? 'crit' : 'warn' }))) : ui.empty('No stock-out projected in the next 12 months.')}` })}</div></div>`;
      },
      mount: (st, ctx) => {
        const bands = [['< lead', (x) => x.fc.cover < x.p.lead, '#dc2626'], ['< 2× lead', (x) => x.fc.cover >= x.p.lead && x.fc.cover < x.p.lead * 2, '#f59e0b'], ['< 180 d', (x) => x.fc.cover >= x.p.lead * 2 && x.fc.cover < 180, '#84cc16'], ['≥ 180 d', (x) => x.fc.cover >= x.p.lead * 2 && x.fc.cover >= 180, '#16a34a']];
        const all = net.parts.map((p) => ({ p, fc: forecastOf(p) }));
        ctx.chart('cband', ch.bar({ x: bands.map((b) => b[0]), series: [{ name: 'Items', data: bands.map(([, f, c]) => ({ value: all.filter(f).length, itemStyle: { color: c, borderRadius: [4, 4, 0, 0] } })) }], labels: true, legend: false, grid: { top: 16 } }));
        const share = Object.fromEntries(depots.map((d) => [d.id, Math.max(0.15, A.jobs.filter((j) => j.home.id === d.id).length / Math.max(1, A.jobs.length))]));
        const parts = [...net.parts].sort((a, b) => forecastOf(a).cover - forecastOf(b).cover);
        const data = []; parts.forEach((p, y) => depots.forEach((d, x) => { const fc = forecastOf(p); const daily = fc.daily * share[d.id]; data.push([x, y, Math.round(Math.min(365, daily > 0 ? A.left[p.sku][d.id] / daily : 365))]); }));
        ctx.chart('dheat', ch.heat({ x: depots.map((d) => d.short), y: parts.map((p) => p.sku), data, min: 0, max: 180, label: true, colors: ['#b91c1c', '#f97316', '#fde68a', '#bbf7d0', '#16a34a'], fmtv: (v) => (v >= 365 ? '365+' : `${v} d`), grid: { left: 10 } }));
      },
    },
  ],
};

/* ================================================================== screen: Depot Schematics (live P&ID) */
// Oil plant state: valves and pumps held by the HMI ('closed' = flow path open / motor running).
const plant = { 'V-101': 'closed', 'V-102': 'closed', 'V-201': 'open', 'V-103': 'closed', 'V-301': 'closed', 'V-401': 'closed', 'P-101': 'closed', 'P-102': 'closed', 'P-401': 'closed', 'VP-101': 'closed', 'H-101': 'closed' };
(function defineOilTags() {
  const SPEED = 1 / 120; // one HMI second = 30 plant seconds, so levels move visibly
  const lv = { 'TK-101': 17.8, 'TK-102': 5.6, 'TK-201': 9.2, 'TK-301': 11.5 };
  const sources = () => ['TK-101', 'TK-102', 'TK-201'].filter((t) => plant[{ 'TK-101': 'V-101', 'TK-102': 'V-102', 'TK-201': 'V-201' }[t]] === 'closed' && lv[t] > 0.6);
  live.define('OTP.FT101', { base: 6.4, noise: 0.12, rev: 0.15, dec: 2, unit: 'm³/h', desc: 'FT-101 transfer flow' });
  live.define('OTP.FT102', { base: 6.1, noise: 0.1, rev: 0.15, dec: 2, unit: 'm³/h', desc: 'FT-102 treated-oil flow' });
  live.define('OTP.FT401', { base: 3.2, noise: 0.08, rev: 0.2, dec: 2, unit: 'm³/h', desc: 'FT-401 IBC filling flow' });
  for (const k of ['P101', 'P102', 'P401', 'VP101', 'H101']) live.define(`OTP.${k}.RUN`, { base: 1, noise: 0, rev: 0, dec: 0 });
  live.define('OTP.P101.A', { fn: () => (live.get('OTP.P101.RUN') > 0.5 ? 18.4 + live.get('OTP.FT101') * 0.9 + (Math.random() - 0.5) * 0.4 : 0), dec: 1, unit: 'A', desc: 'P-101 motor current' });
  live.define('OTP.P102.A', { fn: () => (live.get('OTP.P102.RUN') > 0.5 ? 15.1 + live.get('OTP.FT102') * 0.8 + (Math.random() - 0.5) * 0.4 : 0), dec: 1, unit: 'A', desc: 'P-102 motor current' });
  live.define('OTP.H101.KW', { fn: () => (live.get('OTP.H101.RUN') > 0.5 && live.get('OTP.FT101') > 0.1 ? 42 + (Math.random() - 0.5) * 2 : 0), dec: 1, unit: 'kW', desc: 'H-101 heater power' });
  let tt = 61; live.define('OTP.TT101', { fn: () => { const on = live.get('OTP.H101.KW') > 1; tt += ((on ? 62 : 24) - tt) * 0.06 + (Math.random() - 0.5) * 0.2; return tt; }, dec: 1, unit: '°C', h: 70, hh: 78, l: 50, desc: 'TT-101 oil outlet temperature' });
  live.define('OTP.PT101', { fn: () => (live.get('OTP.FT101') > 0.1 ? 0.62 + live.get('OTP.FT101') * 0.035 + (Math.random() - 0.5) * 0.03 : 0.02), dec: 2, unit: 'bar', h: 1.2, hh: 1.6, desc: 'PDT-101 filter differential pressure' });
  let vac = 1.1; live.define('OTP.PT102', { fn: () => { const run = live.get('OTP.VP101.RUN') > 0.5; vac += run ? (1.05 - vac) * 0.18 + (Math.random() - 0.5) * 0.05 : (95 - vac) * 0.04; return Math.max(0.6, vac); }, dec: 1, unit: 'mbar', h: 5, hh: 20, desc: 'PT-102 degasser vacuum' });
  let lt = 46; live.define('OTP.LT102', { fn: () => { lt += (live.get('OTP.FT101') - live.get('OTP.FT102')) * 0.6 + (Math.random() - 0.5) * 0.3; lt += (48 - lt) * 0.05; return clamp(lt, 5, 95); }, dec: 0, unit: '%', h: 80, l: 20, desc: 'LT-102 degasser level' });
  let moist = 6; live.define('OTP.AT101', { fn: () => { moist += ((4.5 + (live.get('OTP.PT102') - 1) * 0.35 + (live.get('OTP.TT101') < 50 ? 6 : 0)) - moist) * 0.08 + (Math.random() - 0.5) * 0.15; return Math.max(1, moist); }, dec: 1, unit: 'ppm', h: 10, hh: 20, desc: 'AT-101 moisture in treated oil' });
  live.define('OTP.AT102', { fn: () => 82 - live.get('OTP.AT101') * 1.4 + (Math.random() - 0.5) * 0.6, dec: 1, unit: 'kV', l: 60, ll: 50, desc: 'AT-102 breakdown voltage (IEC 60156)' });
  live.define('OTP.CV101', { fn: () => clamp(55 + (live.get('OTP.LT102') - 48) * 1.6, 0, 100), dec: 0, unit: '%', desc: 'CV-101 level control valve position' });
  let ibc = 412; live.define('OTP.FQ401', { fn: () => { ibc += live.get('OTP.FT401') * SPEED * 1000 / 60; if (ibc >= 1000) ibc = 0; return ibc; }, dec: 0, unit: 'L', desc: 'FQ-401 IBC batch totaliser' });
  const lvlTag = (t, spec) => live.define(`OTP.${t}.LVL`, { ...spec, dec: 1, unit: 'm³', fn: () => {
    const src = sources();
    const draw = src.includes(t) ? live.get('OTP.FT101') / src.length : 0;
    if (t === 'TK-301') lv[t] += (live.get('OTP.FT102') - live.get('OTP.FT401')) * SPEED;
    else lv[t] -= draw * SPEED;
    lv[t] = clamp(lv[t], 0.3, t === 'TK-301' ? 29.5 : 24.8); return lv[t];
  } });
  lvlTag('TK-101', { max: 25, l: 5, ll: 2.5, desc: 'TK-101 new-oil stock' });
  lvlTag('TK-102', { max: 25, l: 5, ll: 2.5, desc: 'TK-102 new-oil stock (low-stock alarm)' });
  lvlTag('TK-201', { max: 15, h: 13.5, desc: 'TK-201 used-oil level' });
  lvlTag('TK-301', { max: 30, h: 27, hh: 29, desc: 'TK-301 treated-oil level' });
  live.define('OTP.STOCK', { fn: () => live.get('OTP.TK-101.LVL') + live.get('OTP.TK-102.LVL') + live.get('OTP.TK-301.LVL'), dec: 1, unit: 'm³', desc: 'Serviceable oil stock' });
  live.define('OTP.IBCEQ', { fn: () => Math.floor(live.get('OTP.STOCK')), dec: 0, unit: 'IBC' });
  // warehouse environment, per depot (used by the map and overview)
  depots.forEach((d, i) => { live.define(`INV.${d.id}.T`, { base: 19.5 + i * 1.2, noise: 0.05, rev: 0.05, dec: 1, unit: '°C', desc: `${d.short} temperature` }); live.define(`INV.${d.id}.RH`, { base: 41 + i * 4, noise: 0.3, rev: 0.05, dec: 0, unit: '%', h: 60, desc: `${d.short} humidity` }); });
  // SF6 store
  live.define('SF6.FN501.RUN', { base: 1, noise: 0, rev: 0 }); live.define('SF6.FN502.RUN', { base: 1, noise: 0, rev: 0 }); live.define('SF6.GR501.RUN', { base: 1, noise: 0, rev: 0 }); live.define('SF6.DH501.RUN', { base: 1, noise: 0, rev: 0 });
  let ppm = 38; live.define('SF6.AT501', { fn: () => { const ext = (live.get('SF6.FN501.RUN') > 0.5 ? 1 : 0) + (live.get('SF6.FN502.RUN') > 0.5 ? 1 : 0); ppm += (4 + (ext ? 0 : 22)) - ppm * (0.02 + ext * 0.09) + (Math.random() - 0.5) * 2; return Math.max(0, ppm); }, dec: 0, unit: 'ppmv', h: 500, hh: 1000, desc: 'AT-501 SF₆ in air (low level)' });
  live.define('SF6.AT502', { fn: () => 20.9 - live.get('SF6.AT501') / 10000 * 20.9 + (Math.random() - 0.5) * 0.02, dec: 2, unit: '%vol', l: 19.5, ll: 18, desc: 'AT-502 oxygen' });
  live.define('SF6.TT503', { base: 18.6, noise: 0.05, rev: 0.05, dec: 1, unit: '°C', h: 35, desc: 'TT-503 store temperature' });
  let rh = 44; live.define('SF6.MT504', { fn: () => { rh += ((live.get('SF6.DH501.RUN') > 0.5 ? 42 : 66) - rh) * 0.03 + (Math.random() - 0.5) * 0.3; return rh; }, dec: 0, unit: '%RH', h: 60, desc: 'MT-504 store humidity' });
  live.define('SF6.PT505', { fn: () => (live.get('SF6.GR501.RUN') > 0.5 ? 38 + (Math.random() - 0.5) * 0.8 : 0.4), dec: 1, unit: 'bar', h: 48, desc: 'PT-505 recovery discharge' });
  const cyl = [51.6, 48.9, 22.4, 50.8, 9.7, 52.0];
  cyl.forEach((m, i) => live.define(`SF6.WT${511 + i}`, { base: m, noise: 0.01, rev: 0.5, dec: 1, unit: 'kg', l: 12, desc: `WT-${511 + i} SF₆ cylinder mass` }));
  live.define('SF6.WT511', { fn: () => { cyl[0] += live.get('SF6.GR501.RUN') > 0.5 ? 0.004 : 0; if (cyl[0] > 52) cyl[0] = 30; return cyl[0]; }, dec: 2, unit: 'kg', desc: 'WT-511 recovery cylinder (filling)' });
  live.define('SF6.STOCK', { fn: () => [512, 513, 514, 515, 516].reduce((s, k) => s + live.get(`SF6.WT${k}`), 0), dec: 1, unit: 'kg', l: 150, desc: 'SF₆ serviceable stock' });
})();

function oilPlantHmi() {
  const W = 1560; const H = 950;
  const s = [];
  // tanks
  s.push(sx.text(44, 382, 'BULK STORAGE · BUNDED AREA B-1 (110 % CONTAINMENT)', { cls: 'sx-ts' }));
  s.push('<rect x="30" y="60" width="420" height="330" rx="6" fill="none" stroke="#263244" stroke-dasharray="6 4"/>');
  s.push(sx.tank(60, 120, 90, 220, 'TK-101', { level: 'OTP.TK-101.LVL', max: 25, label: 'TK-101', sub: 'New oil · 25 m³', lPct: 0.2 }));
  s.push(sx.tank(200, 120, 90, 220, 'TK-102', { level: 'OTP.TK-102.LVL', max: 25, label: 'TK-102', sub: 'New oil · 25 m³', lPct: 0.2 }));
  s.push(sx.tank(340, 170, 90, 170, 'TK-201', { level: 'OTP.TK-201.LVL', max: 15, label: 'TK-201', sub: 'Used oil · 15 m³', hhPct: 0.9 }));
  // outlets to header
  s.push(sx.pipe([[105, 340], [105, 455]], { net: 'SRC1' }), sx.pipe([[245, 340], [245, 455]], { net: 'SRC2' }), sx.pipe([[385, 340], [385, 455]], { net: 'SRC3' }));
  s.push(sx.valve(105, 410, 'V-101', { vertical: true, label: 'V-101' }), sx.valve(245, 410, 'V-102', { vertical: true, label: 'V-102' }), sx.valve(385, 410, 'V-201', { vertical: true, label: 'V-201' }));
  s.push(sx.pipe([[105, 455], [505, 455]], { net: 'HDR', flow: 'OTP.FT101', ref: 6.4 }));
  s.push(sx.text(130, 474, 'SUCTION HEADER 80NB · OIL', { cls: 'sx-ts' }));
  // P-101
  s.push(sx.pump(520, 455, 'P-101', { run: 'OTP.P101.RUN', label: 'P-101 transfer pump' }));
  s.push(sx.pipe([[544, 440], [900, 440], [900, 300], [930, 300]], { net: 'PROC', flow: 'OTP.FT101', ref: 6.4 }));
  s.push(sx.instr(600, 380, 'FT', '101', { tag: 'OTP.FT101', unit: 'm³/h', id: 'FT-101' }), sx.sig([[600, 394], [600, 440]]));
  s.push(sx.valve(655, 440, 'V-103', { label: 'V-103' }));
  s.push(sx.filter(730, 440, 'F-101', { label: 'F-101 · 1 µm' }));
  s.push(sx.instr(730, 360, 'PDT', '101', { tag: 'OTP.PT101', unit: 'bar', id: 'PDT-101' }), sx.sig([[730, 374], [730, 425]]));
  s.push(sx.heater(820, 440, 'H-101', { label: 'H-101 · 45 kW', run: 'OTP.H101.RUN' }));
  s.push(sx.instr(860, 360, 'TT', '101', { tag: 'OTP.TT101', unit: '°C', id: 'TT-101' }), sx.sig([[860, 374], [860, 440]]));
  // degasser column
  s.push(sx.tank(930, 210, 80, 250, 'VD-101', { label: 'VD-101', sub: 'Vacuum degasser' }));
  s.push(sx.instr(1050, 300, 'LT', '102', { tag: 'OTP.LT102', unit: '%', id: 'LT-102' }), sx.sig([[1010, 300], [1036, 300]]));
  s.push('<path d="M940 300 h60 M940 318 h60 M940 336 h60" stroke="#475569" stroke-dasharray="4 3"/>');
  s.push(sx.pipe([[970, 210], [970, 150], [1080, 150]], { medium: 'air', net: 'VAC' }));
  s.push(sx.pump(1095, 165, 'VP-101', { run: 'OTP.VP101.RUN', label: 'VP-101' }));
  s.push(sx.pipe([[1119, 150], [1170, 150], [1170, 110]], { medium: 'air', arrow: true }));
  s.push(sx.text(1150, 100, 'TO VENT / CONDENSATE TRAP', { cls: 'sx-ts' }));
  s.push(sx.instr(900, 150, 'PT', '102', { tag: 'OTP.PT102', unit: 'mbar', id: 'PT-102', side: -1 }), sx.sig([[914, 150], [970, 150]]));
  // P-102 to treated tank
  s.push(sx.pipe([[970, 460], [970, 545], [995, 545]], { net: 'DEG', flow: 'OTP.FT102', ref: 6 }));
  s.push(sx.pump(1010, 545, 'P-102', { run: 'OTP.P102.RUN', label: 'P-102 discharge pump' }));
  s.push(sx.pipe([[1034, 530], [1280, 530], [1280, 300], [1310, 300]], { net: 'TRT', flow: 'OTP.FT102', ref: 6 }));
  s.push(sx.instr(1090, 470, 'AT', '101', { tag: 'OTP.AT101', unit: 'ppm', id: 'AT-101' }), sx.sig([[1090, 484], [1090, 530]]));
  s.push(sx.instr(1090, 600, 'AT', '102', { tag: 'OTP.AT102', unit: 'kV', id: 'AT-102' }), sx.sig([[1090, 586], [1090, 530]]));
  s.push(sx.cv(1215, 530, 'CV-101', { pos: 'OTP.CV101', label: 'CV-101' }));
  s.push(sx.sig([[1064, 300], [1180, 300], [1180, 490], [1215, 490]]), sx.text(1120, 292, 'LIC-102', { cls: 'sx-ts' }));
  s.push(sx.valve(1255, 530, 'V-301', { label: 'V-301' }));
  s.push(sx.text(1150, 548, 'FT-102', { cls: 'sx-ts' }), `<text x="1150" y="562" class="sx-v" data-live="OTP.FT102">—</text>`);
  // treated tank + IBC
  s.push(sx.tank(1310, 200, 100, 250, 'TK-301', { level: 'OTP.TK-301.LVL', max: 30, label: 'TK-301', sub: 'Treated oil · 30 m³', hhPct: 0.93 }));
  s.push(sx.pipe([[1360, 450], [1360, 660], [1385, 660]], { net: 'IBCN', flow: 'OTP.FT401', ref: 3 }));
  s.push(sx.valve(1360, 560, 'V-401', { vertical: true, label: 'V-401' }));
  s.push(sx.pump(1400, 660, 'P-401', { run: 'OTP.P401.RUN', label: 'P-401 filling' }));
  s.push(sx.pipe([[1424, 645], [1480, 645], [1480, 700]], { net: 'IBCN', flow: 'OTP.FT401', ref: 3 }));
  s.push('<g class="sx-hit" data-eq="IBC-401"><rect class="sx-halo" x="1440" y="696" width="84" height="84" rx="6"/><rect x="1448" y="704" width="68" height="68" rx="3" fill="#111823" stroke="#9aa8bb" stroke-width="1.5"/><path d="M1448 721 h68 M1448 738 h68 M1448 755 h68 M1465 704 v68 M1482 704 v68 M1499 704 v68" stroke="#475569"/></g>');
  s.push(sx.text(1482, 796, 'IBC FILLING STATION', { cls: 'sx-ts', anchor: 'middle' }));
  s.push(sx.readout(1290, 730, [['Batch FQ-401', 'OTP.FQ401', 'L'], ['Flow FT-401', 'OTP.FT401', 'm³/h']], { title: 'IBC-401', w: 140, id: 'FQ-401' }));
  // summary readouts
  s.push(sx.readout(40, 560, [['Serviceable oil stock', 'OTP.STOCK', 'm³'], ['IBC equivalents', 'OTP.IBCEQ', ''], ['TK-102 (low-stock alarm)', 'OTP.TK-102.LVL', 'm³']], { title: 'STOCK POSITION · TX-OIL-IEC', w: 260 }));
  s.push(sx.readout(40, 680, [['Moisture out', 'OTP.AT101', 'ppm'], ['Breakdown voltage', 'OTP.AT102', 'kV'], ['Oil temperature', 'OTP.TT101', '°C'], ['Degasser vacuum', 'OTP.PT102', 'mbar']], { title: 'TREATED-OIL QUALITY · IEC 60296', w: 260 }));
  s.push(sx.readout(330, 560, [['P-101 current', 'OTP.P101.A', 'A'], ['P-102 current', 'OTP.P102.A', 'A'], ['H-101 power', 'OTP.H101.KW', 'kW']], { title: 'DRIVES', w: 200 }));
  s.push(sx.frame(W, H, { title: 'EAST WAREHOUSE · TRANSFORMER-OIL STORAGE & TREATMENT', dno: 'NX-INV-PID-2201', rev: 'D' }));
  const eq = {
    'TK-101': { name: 'New-oil bulk tank TK-101', type: 'Atmospheric tank · 25 m³ · IEC 60296 inhibited oil', tags: [{ tag: 'OTP.TK-101.LVL', label: 'Level' }] },
    'TK-102': { name: 'New-oil bulk tank TK-102', type: 'Atmospheric tank · 25 m³', desc: 'Low-stock alarm at 5 m³ prompts a replenishment requisition request to SAP MM for TX-OIL-IEC.', tags: [{ tag: 'OTP.TK-102.LVL', label: 'Level' }] },
    'TK-201': { name: 'Used-oil tank TK-201', type: 'Atmospheric tank · 15 m³', desc: 'Drained oil from transformer repairs, reconditioned through VD-101.', tags: [{ tag: 'OTP.TK-201.LVL', label: 'Level' }] },
    'TK-301': { name: 'Treated-oil tank TK-301', type: 'Nitrogen-blanketed tank · 30 m³', tags: [{ tag: 'OTP.TK-301.LVL', label: 'Level' }, { tag: 'OTP.FT102', label: 'Inflow' }] },
    'LT-101': { name: 'LT-101 level transmitter', type: 'Radar, 4–20 mA HART', tags: [{ tag: 'OTP.TK-101.LVL', label: 'Level' }] },
    'V-101': { name: 'TK-101 outlet valve', type: 'MOV · ball valve DN80', switch: true, kind: 'valve', interlock: 'LSLL-101' },
    'V-102': { name: 'TK-102 outlet valve', type: 'MOV · ball valve DN80', switch: true, kind: 'valve', interlock: 'LSLL-102' },
    'V-201': { name: 'TK-201 outlet valve', type: 'MOV · ball valve DN80', switch: true, kind: 'valve', desc: 'Open to recondition used oil.' },
    'V-103': { name: 'Filter inlet valve', type: 'MOV · DN65', switch: true, kind: 'valve' },
    'V-301': { name: 'TK-301 inlet valve', type: 'MOV · DN65', switch: true, kind: 'valve', interlock: 'LSHH-301' },
    'V-401': { name: 'IBC filling valve', type: 'MOV · DN50', switch: true, kind: 'valve' },
    'P-101': { name: 'Transfer pump P-101', type: 'Centrifugal · 8 m³/h · 7.5 kW', switch: true, kind: 'pump', desc: 'Trips on low suction pressure when all tank outlets are shut.', tags: [{ tag: 'OTP.FT101', label: 'Flow' }, { tag: 'OTP.P101.A', label: 'Motor current' }] },
    'P-102': { name: 'Discharge pump P-102', type: 'Gear pump · 8 m³/h · 5.5 kW', switch: true, kind: 'pump', tags: [{ tag: 'OTP.FT102', label: 'Flow' }, { tag: 'OTP.P102.A', label: 'Motor current' }] },
    'P-401': { name: 'IBC filling pump P-401', type: 'Gear pump · 4 m³/h', switch: true, kind: 'pump', tags: [{ tag: 'OTP.FT401', label: 'Flow' }, { tag: 'OTP.FQ401', label: 'Batch' }] },
    'VP-101': { name: 'Vacuum pump VP-101', type: 'Roots + rotary-vane · 0.5 mbar', switch: true, kind: 'pump', tags: [{ tag: 'OTP.PT102', label: 'Vacuum' }, { tag: 'OTP.AT101', label: 'Moisture out' }] },
    'H-101': { name: 'Oil heater H-101', type: 'Electric · 45 kW · thyristor-controlled', switch: true, kind: 'motor', tags: [{ tag: 'OTP.TT101', label: 'Outlet temp' }, { tag: 'OTP.H101.KW', label: 'Power' }] },
    'FT-101': { name: 'FT-101 flow transmitter', type: 'Coriolis', tags: [{ tag: 'OTP.FT101', label: 'Flow' }] },
    'PDT-101': { name: 'PDT-101 filter ΔP', type: 'Differential pressure', desc: 'Change F-101 cartridges above 1.2 bar.', tags: [{ tag: 'OTP.PT101', label: 'ΔP' }] },
    'TT-101': { name: 'TT-101 heater outlet', type: 'RTD Pt100', tags: [{ tag: 'OTP.TT101', label: 'Temperature' }] },
    'F-101': { name: 'Cartridge filter F-101', type: '1 µm absolute', tags: [{ tag: 'OTP.PT101', label: 'ΔP' }] },
    'VD-101': { name: 'Vacuum degasser VD-101', type: 'Thin-film column', tags: [{ tag: 'OTP.LT102', label: 'Level' }, { tag: 'OTP.PT102', label: 'Vacuum' }] },
    'LT-102': { name: 'LT-102 degasser level', type: 'DP level', tags: [{ tag: 'OTP.LT102', label: 'Level' }, { tag: 'OTP.CV101', label: 'CV-101 output' }] },
    'PT-102': { name: 'PT-102 vacuum', type: 'Pirani gauge', tags: [{ tag: 'OTP.PT102', label: 'Absolute pressure' }] },
    'AT-101': { name: 'AT-101 moisture analyser', type: 'Capacitive · ppm', desc: 'IEC 60422 limit for ≥ 170 kV equipment: ≤ 10 ppm.', tags: [{ tag: 'OTP.AT101', label: 'Moisture' }, { tag: 'OTP.AT102', label: 'Breakdown' }] },
    'AT-102': { name: 'AT-102 breakdown voltage', type: 'Online BDV · IEC 60156', tags: [{ tag: 'OTP.AT102', label: 'BDV' }, { tag: 'OTP.AT101', label: 'Moisture' }] },
    'CV-101': { name: 'CV-101 level control valve', type: 'Globe valve · fail-closed', tags: [{ tag: 'OTP.CV101', label: 'Position' }, { tag: 'OTP.LT102', label: 'PV (LT-102)' }] },
    'IBC-401': { name: 'IBC filling station', type: '1,000 L IBC on weigh scale', tags: [{ tag: 'OTP.FQ401', label: 'Batch' }, { tag: 'OTP.FT401', label: 'Flow' }] },
    'FQ-401': { name: 'FQ-401 batch totaliser', type: 'Preset batch 1,000 L', tags: [{ tag: 'OTP.FQ401', label: 'Batch' }] },
  };
  const nets = {
    SRC1: { requires: ['V-101'] }, SRC2: { requires: ['V-102'] }, SRC3: { requires: ['V-201'] },
    HDR: { parent: ['SRC1', 'SRC2', 'SRC3'] },
    SUCT: { parent: 'HDR', requires: ['P-101'], tags: ['OTP.P101.RUN'] },
    PROC: { parent: 'SUCT', requires: ['V-103'], tags: ['OTP.FT101'] },
    HTR: { parent: 'PROC', requires: ['H-101'], tags: ['OTP.H101.RUN'] },
    VAC: { requires: ['VP-101'], tags: ['OTP.VP101.RUN'] },
    DEG: { requires: ['P-102'], tags: ['OTP.P102.RUN'] },
    TRT: { parent: 'DEG', requires: ['V-301'], tags: ['OTP.FT102'] },
    IBCN: { requires: ['V-401', 'P-401'], tags: ['OTP.FT401', 'OTP.P401.RUN'] },
  };
  return { title: 'Transformer-oil storage & treatment plant', dno: 'NX-INV-PID-2201', rev: 'D', w: W, h: H, svg: s.join(''), equipment: eq, nets, switches: plant, legend: [{ label: 'Insulating oil', color: '#b08d3b' }, { label: 'Vacuum / vent', color: '#94a3b8' }, { label: 'Signal (ISA-5.1)', color: '#64748b' }], toolbar: '<button type="button" data-pr-oil>Request oil PR in SAP MM</button>' };
}

function sf6StoreHmi() {
  const W = 1400; const H = 860; const s = [];
  s.push('<rect x="40" y="70" width="860" height="560" rx="8" fill="#0b1119" stroke="#334155" stroke-width="2"/>');
  s.push(sx.text(60, 96, 'SF₆ GAS STORE · BUILDING E-4 · CLASS 2.2 GASES', { cls: 'sx-tb' }), sx.text(60, 112, 'Low-level extraction (SF₆ is 5× denser than air) · O₂ depletion monitoring · F-gas register (EU 2024/573)', { cls: 'sx-ts' }));
  const cyl = [512, 513, 514, 515, 516];
  cyl.forEach((k, i) => {
    const x = 90 + i * 120; const y = 180;
    s.push(`<g class="sx-hit" data-eq="WT-${k}"><rect class="sx-halo" x="${x - 8}" y="${y - 30}" width="76" height="232" rx="6"/><rect x="${x + 6}" y="${y}" width="48" height="150" rx="22" fill="#14532d" fill-opacity=".35" stroke="#9aa8bb" stroke-width="1.5"/><rect x="${x + 22}" y="${y - 18}" width="16" height="18" rx="3" fill="#1a2330" stroke="#9aa8bb"/><rect x="${x}" y="${y + 154}" width="60" height="8" fill="#334155"/>${sx.text(x + 30, y - 24, `CYL-${k}`, { cls: 'sx-ts', anchor: 'middle' })}<rect class="sx-box" x="${x - 2}" y="${y + 168}" width="64" height="20" rx="3"/><text x="${x + 44}" y="${y + 182}" class="sx-v" text-anchor="end" data-live="SF6.WT${k}">—</text>${sx.text(x + 58, y + 182, 'kg', { cls: 'sx-ts', anchor: 'end' })}</g>`);
  });
  s.push(sx.text(90, 400, 'WEIGH SCALES WT-512…516 · 52 kg nominal fill · low-mass alarm 12 kg', { cls: 'sx-ts' }));
  // recovery unit
  s.push(sx.pump(720, 260, 'GR-501', { run: 'SF6.GR501.RUN', label: 'GR-501 recovery compressor' }));
  s.push(sx.pipe([[744, 245], [800, 245], [800, 180]], { medium: 'gas', net: 'GR', flow: 'SF6.PT505', ref: 38 }));
  s.push(`<g class="sx-hit" data-eq="WT-511"><rect class="sx-halo" x="772" y="120" width="56" height="62" rx="6"/><rect x="780" y="128" width="40" height="50" rx="16" fill="#14532d" fill-opacity=".35" stroke="#9aa8bb" stroke-width="1.5"/></g>`, sx.text(830, 150, 'CYL-511 (recovery)', { cls: 'sx-ts' }), `<text x="830" y="166" class="sx-v" data-live="SF6.WT511">—</text>`);
  s.push(sx.pipe([[640, 260], [705, 260]], { medium: 'gas', net: 'GR' }), sx.text(642, 284, 'FROM GIS BAYS', { cls: 'sx-ts' }));
  s.push(sx.instr(720, 340, 'PT', '505', { tag: 'SF6.PT505', unit: 'bar', id: 'PT-505' }), sx.sig([[720, 326], [720, 278]]));
  // detectors low level
  s.push(sx.instr(150, 560, 'AT', '501', { tag: 'SF6.AT501', unit: 'ppmv', id: 'AT-501' }), sx.text(150, 594, '0.3 m above floor', { cls: 'sx-ts', anchor: 'middle' }));
  s.push(sx.instr(380, 560, 'AT', '502', { tag: 'SF6.AT502', unit: '%vol', id: 'AT-502' }), sx.text(380, 594, 'O₂ depletion', { cls: 'sx-ts', anchor: 'middle' }));
  s.push(sx.instr(600, 470, 'TT', '503', { tag: 'SF6.TT503', unit: '°C', id: 'TT-503' }), sx.instr(600, 540, 'MT', '504', { tag: 'SF6.MT504', unit: '%RH', id: 'MT-504' }));
  // extraction
  s.push(sx.pipe([[60, 610], [880, 610], [880, 660], [1000, 660]], { medium: 'air', net: 'EXT', flow: 'SF6.FN501.RUN', ref: 1 }));
  s.push(sx.text(70, 604, 'LOW-LEVEL EXTRACTION DUCT', { cls: 'sx-ts' }));
  s.push(sx.fan(1030, 660, 'FN-501', { run: 'SF6.FN501.RUN', label: 'FN-501 duty' }), sx.fan(1100, 660, 'FN-502', { run: 'SF6.FN502.RUN', label: 'FN-502 standby' }));
  s.push(sx.pipe([[1130, 660], [1200, 660], [1200, 600]], { medium: 'air', arrow: true }), sx.text(1180, 590, 'TO ATMOSPHERE (12 m stack)', { cls: 'sx-ts' }));
  s.push(sx.heater(980, 470, 'DH-501', { label: 'DH-501 dehumidifier', run: 'SF6.DH501.RUN' }));
  s.push(sx.readout(980, 120, [['Serviceable SF₆', 'SF6.STOCK', 'kg'], ['SF₆ in air', 'SF6.AT501', 'ppmv'], ['Oxygen', 'SF6.AT502', '%vol'], ['Humidity', 'SF6.MT504', '%RH']], { title: 'STORE STATUS', w: 260 }));
  s.push(sx.readout(980, 260, depots.flatMap((d) => [[`${d.short} temp`, `INV.${d.id}.T`, '°C'], [`${d.short} RH`, `INV.${d.id}.RH`, '%']]), { title: 'WAREHOUSE BMS', w: 260 }));
  s.push(sx.frame(W, H, { title: 'EAST WAREHOUSE · SF₆ GAS STORE & ENVIRONMENT', dno: 'NX-INV-PID-2205', rev: 'B' }));
  const eq = Object.fromEntries([
    ...cyl.map((k) => [`WT-${k}`, { name: `SF₆ cylinder CYL-${k}`, type: 'Weigh scale · 0–80 kg', tags: [{ tag: `SF6.WT${k}`, label: 'Gas mass' }, { tag: 'SF6.STOCK', label: 'Store total' }] }]),
    ['WT-511', { name: 'Recovery cylinder CYL-511', type: 'Weigh scale', tags: [{ tag: 'SF6.WT511', label: 'Gas mass' }, { tag: 'SF6.PT505', label: 'Fill pressure' }] }],
    ['GR-501', { name: 'SF₆ recovery compressor', type: 'Oil-free · 50 bar', switch: true, kind: 'compressor', tags: [{ tag: 'SF6.PT505', label: 'Discharge' }] }],
    ['PT-505', { name: 'PT-505 recovery discharge', type: 'Pressure transmitter', tags: [{ tag: 'SF6.PT505', label: 'Pressure' }] }],
    ['AT-501', { name: 'AT-501 SF₆ detector', type: 'NDIR · low level', desc: 'Workplace exposure limit 1,000 ppmv (8-h TWA). Stop either extraction fan to watch it rise.', tags: [{ tag: 'SF6.AT501', label: 'SF₆' }, { tag: 'SF6.AT502', label: 'O₂' }] }],
    ['AT-502', { name: 'AT-502 oxygen monitor', type: 'Electrochemical', tags: [{ tag: 'SF6.AT502', label: 'O₂' }] }],
    ['TT-503', { name: 'TT-503 store temperature', type: 'RTD', tags: [{ tag: 'SF6.TT503', label: 'Temperature' }] }],
    ['MT-504', { name: 'MT-504 store humidity', type: 'Capacitive', tags: [{ tag: 'SF6.MT504', label: 'RH' }] }],
    ['FN-501', { name: 'Extraction fan FN-501 (duty)', type: '1.1 kW · 2,400 m³/h', switch: true, kind: 'fan', tags: [{ tag: 'SF6.AT501', label: 'SF₆ in air' }] }],
    ['FN-502', { name: 'Extraction fan FN-502 (standby)', type: '1.1 kW · 2,400 m³/h', switch: true, kind: 'fan', tags: [{ tag: 'SF6.AT501', label: 'SF₆ in air' }] }],
    ['DH-501', { name: 'Dehumidifier DH-501', type: 'Desiccant rotor', switch: true, kind: 'motor', tags: [{ tag: 'SF6.MT504', label: 'RH' }] }],
  ]);
  const nets = { GR: { requires: ['GR-501'], tags: ['SF6.GR501.RUN'] }, F1: { requires: ['FN-501'], tags: ['SF6.FN501.RUN'] }, F2: { requires: ['FN-502'], tags: ['SF6.FN502.RUN'] }, DH: { requires: ['DH-501'], tags: ['SF6.DH501.RUN'] }, EXT: { parent: ['F1', 'F2'] } };
  return { title: 'SF₆ gas store & warehouse environment', dno: 'NX-INV-PID-2205', rev: 'B', w: W, h: H, svg: s.join(''), equipment: eq, nets, switches: { 'GR-501': 'closed', 'FN-501': 'closed', 'FN-502': 'open', 'DH-501': 'closed' }, legend: [{ label: 'SF₆ gas', color: '#a3e635' }, { label: 'Extract air', color: '#94a3b8' }] };
}

const schematicsScreen = {
  id: 'schematics', name: 'Depot Schematics', icon: 'schematic',
  tabs: [
    {
      name: 'Oil storage & treatment P&ID', icon: 'schematic', full: true,
      render: () => '<div class="nx-hmi is-full" id="inv-oil"></div>',
      mount: (st, ctx) => {
        ctx.hmi('#inv-oil', { ...oilPlantHmi(), onSwitch: (id, v) => { plant[id] = v; } });
        ctx.on('click', '[data-pr-oil]', () => raisePR('TX-OIL-IEC', Math.max(4, Math.ceil(25 - live.get('OTP.TK-102.LVL')))));
      },
    },
    {
      name: 'SF₆ store & environment', icon: 'shield', full: true,
      render: () => '<div class="nx-hmi is-full" id="inv-sf6"></div>',
      mount: (st, ctx) => { ctx.hmi('#inv-sf6', sf6StoreHmi()); },
    },
    ...drawingTabs('inventory'),
  ],
};

/* ================================================================== mount */
const screens = [catalogScreen, dashboardScreen, requestsScreen, suppliersScreen, procurementScreen, forecastScreen, schematicsScreen];
mountApp({
  id: 'inventory', code: '05', product: 'Supply Chain & Inventory', back: '/#module-card-05', asOf: AS_OF, screens,
  searchIndex: () => [
    ...net.parts.map((p) => ({ label: `${p.sku} · ${p.name}`, sub: `${p.cat} · ${fmt.n(stockOf(p))} on hand`, icon: 'box', run: () => { nav.go('catalog', 0); openPart(p.sku); } })),
    ...A.jobs.filter((j) => j.lines.length).map((j) => ({ label: `${j.mr} · ${j.wo.id}`, sub: `${fmt.title(j.wo.work_type)} · ${j.wo.towerName || j.wo.asset} · ${j.mrStatus}`, icon: 'clipboard', run: () => { nav.go('requests', 1); openJob(j.wo.id); } })),
    ...net.suppliers.map((s) => ({ label: s.name, sub: `${s.id} · ${s.cat}`, icon: 'factory', run: () => { nav.go('suppliers', 0); openSupplier(s.id); } })),
    ...depots.map((d) => ({ label: d.name, sub: d.id, icon: 'warehouse', run: () => nav.go('dashboard', 0) })),
  ],
});
