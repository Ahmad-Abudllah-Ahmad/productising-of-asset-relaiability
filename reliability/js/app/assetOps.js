// Asset 360, the operational side: what turns Asset Health into Asset Reliability.
//
// assetModel.js gathers the condition of one asset (health index, risk, components, findings, history). This file adds
// the operational records for the same asset, read from the shared network (assets/console/network.js):
//   - work orders        open and planned work, from the ERP (SAP PM)
//   - inventory & parts  the materials that work needs, their stock and suppliers, from the ERP (SAP MM)
//   - condition forecast the EXPERIMENTAL health-index projection (assets/console/models.js)
// No DOM here. assetPanel.js renders it; the tests read it directly.

import { projectHi } from '/assets/console/models.js';

const BAND = (hi) => (hi == null ? null : hi >= 70 ? 'normal' : hi >= 40 ? 'moderate' : 'poor');
const FORECAST_YEARS = [1, 2, 3, 4, 5];

/**
 * @param {Awaited<ReturnType<typeof import('./assetModel.js').loadAssetDetail>>} d  the asset detail (found === true)
 * @param {object|null} net  the shared network; null when it could not be loaded
 */
export function assetOperations(d, net) {
  if (!net) return { available: false, workOrders: { rows: [], source: null }, parts: { rows: [], suppliers: [], source: null }, forecast: { available: false, reason: 'The shared network could not be loaded.' } };

  // ------------------------------------------------------------ work orders (ERP · SAP PM)
  const woById = new Map(net.workOrders.map((w) => [w.id, w]));
  const rows = d.work.orders.map((o) => {
    const w = woById.get(o.id) ?? {};
    return { ...o, sap: w.sap ?? null, stage: w.stage ?? o.status, crew: w.crewName ?? null, estCost: w.estCost ?? null, sync: w.sync ?? null, workType: w.work_type ?? o.type ?? null, outage: Boolean(w.outage) };
  });
  const isOpen = (o) => !['completed', 'cancelled'].includes(o.status);
  const workOrders = {
    rows, total: d.work.ordersTotal, open: rows.filter(isOpen).length, completed: rows.filter((o) => o.status === 'completed').length,
    committed: rows.filter(isOpen).reduce((a, o) => a + (o.estCost ?? 0), 0),
    source: net.erp?.source('workOrders') ?? null, synced: net.erp?.syncedText('workOrders') ?? '',
  };

  // ------------------------------------------------------------ inventory & parts (ERP · SAP MM)
  const kv = d.header.voltage_kv;
  const partBySku = new Map(net.parts.map((p) => [p.sku, p]));
  const supplierById = new Map(net.suppliers.map((s) => [s.id, s]));
  const depotName = new Map(net.depots.map((x) => [x.id, x.short]));
  const need = new Map();
  for (const f of d.findings.rows) {
    const sku = net.partFor(f.defectClass, kv);
    if (!sku) continue;
    const cur = need.get(sku) ?? { sku, qty: 0, defects: new Map() };
    cur.qty += net.partQty[sku] ?? 1;
    cur.defects.set(f.defectClass, f.label);
    need.set(sku, cur);
  }
  const partRows = [...need.values()].map((n) => {
    const p = partBySku.get(n.sku);
    const sup = supplierById.get(p.supplier);
    const short = Math.max(0, n.qty - p.available);
    return {
      sku: p.sku, name: p.name, category: p.cat, uom: p.uom, qty: n.qty, defects: [...n.defects.values()],
      onHand: p.onHand, reserved: p.reserved, available: p.available, short, status: short ? (p.available > 0 ? 'partial' : 'out') : 'in_stock',
      stock: Object.entries(p.stock).map(([depot, q]) => ({ depot, name: depotName.get(depot) ?? depot, qty: q })),
      unitCost: p.unitCost, leadDays: p.lead, critical: p.critical, supplierId: p.supplier, supplierName: sup?.name ?? p.supplierName,
    };
  }).sort((a, b) => b.short - a.short || Number(b.critical) - Number(a.critical) || a.sku.localeCompare(b.sku));
  const suppliers = [...new Set(partRows.map((r) => r.supplierId))].map((id) => supplierById.get(id)).filter(Boolean)
    .map((s) => ({ id: s.id, name: s.name, country: s.country, category: s.cat, onTime: s.otd, leadDays: s.lead, quality: s.quality, items: partRows.filter((r) => r.supplierId === s.id).length }));
  const parts = {
    rows: partRows, suppliers, short: partRows.filter((r) => r.short).length, value: partRows.reduce((a, r) => a + r.qty * r.unitCost, 0),
    basis: d.findings.rows.length, more: d.findings.more,
    source: net.erp?.source('inventory') ?? null, synced: net.erp?.syncedText('inventory') ?? '', suppliersSynced: net.erp?.syncedText('suppliers') ?? '',
  };

  // ------------------------------------------------------------ condition forecast (EXPERIMENTAL)
  const tower = d.kind === 'tower' ? net.towerById.get(d.id) : null;
  let forecast;
  if (!tower) forecast = { available: false, reason: d.kind === 'tower' ? 'This tower has no position in the network, so it is outside the forecast.' : 'There is no forecast model for this asset class yet. Only towers have one.' };
  else if (tower.hi == null) forecast = { available: false, reason: 'Not assessed, so there is no health index to project.' };
  else {
    const points = FORECAST_YEARS.map((y) => { const hi = Math.round(projectHi(tower, y) * 10) / 10; return { years: y, label: `+${y} y`, hi, band: BAND(hi) }; });
    let poorIn = null;
    if (BAND(tower.hi) !== 'poor') for (let m = 1; m <= 180; m += 1) if (projectHi(tower, m / 12) < 40) { poorIn = Math.round((m / 12) * 10) / 10; break; }
    forecast = { available: true, modelId: 'hi-decay', now: Math.round(tower.hi * 10) / 10, band: BAND(tower.hi), zone: tower.zone ?? null, age: tower.age ?? null, points, poorIn };
  }

  return { available: true, workOrders, parts, forecast };
}
