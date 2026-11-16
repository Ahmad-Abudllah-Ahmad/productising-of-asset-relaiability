// Inventory as the screens need it: the parts of every open or planned work order with their availability, the stock
// table, low stock, open purchase order lines and the work orders waiting on parts. No DOM. Stock, reservations and purchase
// orders are the current position (they are not dated); a work order is open or planned as of the snapshot's date.
//
// buildInventory runs once per snapshot (snapshot.js). The Asset 360 tab, the Maintenance History tab and the dashboard KPI
// all read what it returns, so they always agree.

import { partsFor, availability, waiting, STATE_WORD } from '../domain/inventory.js';

const empty = () => ({ available: false, materials: [], suppliers: [], stock: [], purchaseOrders: [], reservations: [], maintenancePlans: [], warehouses: [], lines: [], byWorkOrder: new Map(), materialById: new Map(), supplierById: new Map() });

/** An unfinished work order as of a date: created by then, not completed or cancelled by then. */
export const isUnfinished = (w, asOf) => w.created_at <= asOf && w.status !== 'cancelled' && !(w.completed_at && w.completed_at <= asOf);

export function buildInventory(data, inv, asOf) {
  if (!inv?.materials?.length) return empty();
  const findingsById = new Map(data.findings.map((f) => [f.finding_id, f]));
  const assetsById = new Map(data.assets.map((a) => [a.asset_id, a]));
  const plansById = new Map(inv.maintenancePlans.map((p) => [p.plan_id, p]));
  const kvOf = (id) => assetsById.get(id)?.voltage_kv ?? null;
  const materialById = new Map(inv.materials.map((m) => [m.material_id, m]));
  const supplierById = new Map(inv.suppliers.map((s) => [s.supplier_id, s]));
  const wos = data.workOrders.filter((w) => isUnfinished(w, asOf));
  const raw = wos.flatMap((w) => partsFor(w, { findingsById, plansById, kvOf }).map((p) => ({ work_order_id: w.work_order_id, asset_id: w.asset_id, planned_date: w.planned_date, material_id: p.material_id, quantity: p.quantity })));
  const lines = availability(raw, inv).map((l) => {
    const m = materialById.get(l.material_id);
    const sup = supplierById.get(m?.supplier_id);
    return { ...l, description: m?.description ?? l.material_id, unit: m?.unit ?? '', supplier: sup?.name ?? null, leadTimeDays: sup?.lead_time_days ?? null, late: l.state === 'on_order' && l.detail.delivery_date < asOf };
  });
  const byWorkOrder = new Map();
  for (const l of lines) (byWorkOrder.get(l.work_order_id) ?? byWorkOrder.set(l.work_order_id, []).get(l.work_order_id)).push(l);
  return { available: true, ...inv, lines, byWorkOrder, materialById, supplierById, asOf };
}

/** Stock per material: on hand, reserved, free, what is on order, and whether free stock is under the reorder point. */
export function stockRows(inv) {
  if (!inv.available) return [];
  const rows = inv.materials.map((m) => {
    const here = inv.stock.filter((s) => s.material_id === m.material_id);
    const reserved = (wh) => inv.reservations.filter((r) => r.source === 'stock' && r.material_id === m.material_id && r.warehouse_id === wh).reduce((n, r) => n + r.quantity, 0);
    const perWh = here.map((s) => ({ warehouse_id: s.warehouse_id, on_hand: s.on_hand, reserved: reserved(s.warehouse_id), available: s.on_hand - reserved(s.warehouse_id) }));
    const onHand = perWh.reduce((n, x) => n + x.on_hand, 0); const reservedAll = perWh.reduce((n, x) => n + x.reserved, 0);
    const lines = inv.purchaseOrders.filter((l) => l.material_id === m.material_id && l.status !== 'closed');
    const onOrder = lines.reduce((n, l) => n + l.quantity, 0);
    const sup = inv.supplierById.get(m.supplier_id);
    const free = onHand - reservedAll;
    return { material_id: m.material_id, description: m.description, unit: m.unit, group: m.group, unit_price: m.unit_price, reorder_point: m.reorder_point, supplier: sup?.name ?? '', leadTimeDays: sup?.lead_time_days ?? null, perWh, onHand, reserved: reservedAll, available: free, onOrder, nextDelivery: lines.map((l) => l.delivery_date).sort()[0] ?? null, low: free < m.reorder_point, empty: free <= 0 };
  });
  return rows;
}

/** The work orders that cannot start for want of parts, with the lines that block them. */
export function blockedWorkOrders(snap) {
  const inv = snap.inventory;
  if (!inv.available) return [];
  const wo = new Map(snap.workOrders.map((w) => [w.work_order_id, w]));
  return waiting(inv.lines).filter((b) => snap.inScope(wo.get(b.work_order_id)?.asset_id)).map((b) => {
    const w = wo.get(b.work_order_id);
    return { ...b, assetId: w.asset_id, assetName: snap.byId.get(w.asset_id)?.name ?? w.asset_id, status: w.status, planned: w.planned_date, priority: w.priority, planned_work: w.status === 'planned', task: w.task ?? null, short: b.lines.filter((l) => l.state === 'short').length, onOrder: b.lines.filter((l) => l.state === 'on_order').length };
  }).sort((a, b) => a.planned.localeCompare(b.planned) || a.work_order_id.localeCompare(b.work_order_id));
}

/** Part lines for one asset and the assets under it (a tower and its components). */
export function linesForAsset(snap, assetId, subtree) {
  const inv = snap.inventory;
  if (!inv.available) return [];
  const ids = subtree ?? new Set([assetId]);
  return inv.lines.filter((l) => ids.has(l.asset_id));
}

export { STATE_WORD };
