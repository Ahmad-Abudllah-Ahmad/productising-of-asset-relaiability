// The inventory side of the demo data: parts catalogue, stock in two warehouses, suppliers, purchase order lines, reservations and
// maintenance plans, with the planned work orders the plans raise. Deterministic (a fixed random seed) and shaped like ERP records
// (assumption A26 in config.js). It reads the base seed (assets, findings, work orders) and adds to it; it never changes a base record.
//
//   material       SAP material master / Maximo item
//   stock          SAP material stock / Maximo inventory balance (per warehouse; reserved comes from reservations)
//   supplier       SAP business partner (supplier) / Maximo company
//   purchaseOrder  SAP purchase order item / Maximo PO line
//   reservation    SAP order component reservation / Maximo inventory reservation
//   maintenancePlan SAP maintenance plan / Maximo PM

import { CONFIG } from '../domain/config.js';
import { partsFor, planReservations } from '../domain/inventory.js';

function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pad = (n, w) => String(n).padStart(w, '0');

export const SUPPLIERS = Object.freeze([
  { supplier_id: 'SUP-01', name: 'Caspian Grid Components', lead_time_days: 21 },
  { supplier_id: 'SUP-02', name: 'Absheron Steel Works', lead_time_days: 35 },
  { supplier_id: 'SUP-03', name: 'Nordic Insulators AS', lead_time_days: 60 },
  { supplier_id: 'SUP-04', name: 'Volt Cable and Conductor', lead_time_days: 45 },
  { supplier_id: 'SUP-05', name: 'TransForm Service Co', lead_time_days: 28 },
]);

// id, description, unit, price, group, supplier, reorder point, compatible component classes
const M = [
  ['MAT-01', 'Glass insulator disc U120B (132 kV)', 'ea', 38, 'insulators', 'SUP-03', 12, ['insulator_string']],
  ['MAT-02', 'Glass insulator disc U160BS (220/500 kV)', 'ea', 52, 'insulators', 'SUP-03', 12, ['insulator_string']],
  ['MAT-03', 'Composite insulator, 132 kV', 'ea', 210, 'insulators', 'SUP-03', 4, ['insulator_string']],
  ['MAT-04', 'Cotter pin and R-clip set', 'set', 2.5, 'insulators', 'SUP-01', 40, ['insulator_string', 'tower']],
  ['MAT-05', 'Silicone RTV coating kit', 'kit', 85, 'insulators', 'SUP-03', 6, ['insulator_string']],
  ['MAT-06', 'ACSR repair sleeve (Drake)', 'ea', 24, 'conductor', 'SUP-04', 20, ['conductor']],
  ['MAT-07', 'Armour rod set (Drake)', 'set', 46, 'conductor', 'SUP-04', 10, ['conductor']],
  ['MAT-08', 'ACSR Drake conductor, 500 m reel', 'reel', 3400, 'conductor', 'SUP-04', 1, ['conductor']],
  ['MAT-09', 'Compression tension joint', 'ea', 62, 'conductor', 'SUP-04', 6, ['conductor']],
  ['MAT-10', 'Suspension clamp', 'ea', 31, 'conductor', 'SUP-01', 12, ['conductor']],
  ['MAT-11', 'Bolted clamp and jumper connector', 'ea', 18, 'conductor_accessories', 'SUP-01', 30, ['conductor', 'tower']],
  ['MAT-12', 'Vibration damper (Stockbridge)', 'ea', 44, 'conductor_accessories', 'SUP-01', 10, ['damper']],
  ['MAT-13', 'Spacer damper (bundle)', 'ea', 58, 'conductor_accessories', 'SUP-01', 8, ['conductor']],
  ['MAT-14', 'Aviation marker ball', 'ea', 120, 'conductor_accessories', 'SUP-01', 4, ['conductor']],
  ['MAT-15', 'Earthwire steel 7/3.15 mm, 100 m', 'coil', 190, 'lightning_protection', 'SUP-04', 4, ['earthwire']],
  ['MAT-16', 'Earthwire clamp', 'ea', 22, 'lightning_protection', 'SUP-01', 10, ['earthwire']],
  ['MAT-17', 'Surge arrester 132 kV', 'ea', 640, 'lightning_protection', 'SUP-05', 2, ['tower']],
  ['MAT-18', 'Galvanised bolt set M16', 'set', 6, 'steel_structure', 'SUP-02', 60, ['tower']],
  ['MAT-19', 'Galvanised bolt set M20', 'set', 9, 'steel_structure', 'SUP-02', 40, ['tower']],
  ['MAT-20', 'Angle member L65x6, 3 m', 'ea', 42, 'steel_structure', 'SUP-02', 8, ['tower']],
  ['MAT-21', 'Zinc-rich primer, 20 L', 'can', 150, 'steel_structure', 'SUP-02', 6, ['tower']],
  ['MAT-22', 'Anti-corrosion topcoat, 20 L', 'can', 190, 'steel_structure', 'SUP-02', 6, ['tower']],
  ['MAT-23', 'Anti-climbing device', 'ea', 75, 'steel_structure', 'SUP-02', 4, ['tower']],
  ['MAT-24', 'Step bolt', 'ea', 4, 'steel_structure', 'SUP-02', 50, ['tower']],
  ['MAT-25', 'Concrete repair mortar, 25 kg', 'bag', 28, 'foundation', 'SUP-02', 20, ['foundation']],
  ['MAT-26', 'Rip-rap stone', 't', 35, 'foundation', 'SUP-02', 10, ['foundation']],
  ['MAT-27', 'Anchor bolt set', 'set', 120, 'foundation', 'SUP-02', 3, ['foundation']],
  ['MAT-28', 'Foundation grout, 25 kg', 'bag', 34, 'foundation', 'SUP-02', 12, ['foundation']],
  ['MAT-29', 'Danger sign plate', 'ea', 14, 'tower_accessories', 'SUP-01', 15, ['tower']],
  ['MAT-30', 'Tower number plate', 'ea', 11, 'tower_accessories', 'SUP-01', 15, ['tower']],
  ['MAT-31', 'Bird nest guard', 'ea', 48, 'tower_accessories', 'SUP-01', 6, ['tower']],
  ['MAT-32', 'Bird flight diverter', 'ea', 16, 'tower_accessories', 'SUP-01', 40, ['conductor']],
  ['MAT-33', 'Transformer oil, 200 L drum', 'drum', 520, 'transformer', 'SUP-05', 3, ['tank_oil']],
  ['MAT-34', 'Gasket set (tank and radiator)', 'set', 140, 'transformer', 'SUP-05', 4, ['tank_oil', 'cooling']],
  ['MAT-35', 'Radiator panel', 'ea', 1800, 'transformer', 'SUP-05', 1, ['cooling']],
  ['MAT-36', 'Bushing 500 kV (HV)', 'ea', 14500, 'transformer', 'SUP-05', 1, ['bushing']],
  ['MAT-37', 'Bushing 220 kV', 'ea', 6200, 'transformer', 'SUP-05', 1, ['bushing']],
  ['MAT-38', 'Oil sample kit', 'kit', 35, 'transformer', 'SUP-05', 6, ['tank_oil']],
  ['MAT-39', 'Touch-up paint, transformer grey, 5 L', 'can', 95, 'transformer', 'SUP-05', 4, ['tank_oil', 'cooling']],
  ['MAT-40', 'Silica gel breather', 'ea', 55, 'transformer', 'SUP-05', 4, ['tank_oil']],
];

/** Stock overrides that make the shortages the demo shows: [north, south]. Everything else gets a healthy random level. */
const STOCK_OVERRIDE = {
  'MAT-02': [0, 2], // 220/500 kV discs: almost none, no order -> short
  'MAT-36': [0, 0], // 500 kV bushing: none, one on order -> on order
  'MAT-37': [1, 0],
  'MAT-12': [3, 3], // dampers: below the reorder point
  'MAT-21': [0, 2], // primer: two cans, a delivery on order that covers some of the work -> reserved, on order and short
  'MAT-15': [1, 0], // earthwire: one coil -> the second order short
  'MAT-31': [0, 0], // bird nest guards: none, an order in transit that is already late
};
/** Open purchase order lines: [material, quantity, days from the reference date (negative = late)]. */
const PO_LINES = [
  ['MAT-36', 1, 74], ['MAT-21', 4, 38], ['MAT-12', 12, 20], ['MAT-31', 6, -9], ['MAT-15', 2, 33], ['MAT-18', 120, 26], ['MAT-04', 100, 15], ['MAT-37', 1, 52], ['MAT-26', 20, 41],
];

/**
 * @param {{assets: any[], findings: any[], workOrders: any[]}} base
 * @param {{seed: number, referenceDate: string}} o
 */
export function generateInventory(base, { seed, referenceDate }) {
  const rnd = mulberry32((seed ^ 0x1a7e) >>> 0);
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const today = referenceDate;
  const inv = CONFIG.inventory;

  const materials = M.map(([material_id, description, unit, unit_price, group, supplier_id, reorder_point, component_classes]) => ({ material_id, description, unit, unit_price, group, supplier_id, reorder_point, component_classes }));
  const suppliers = SUPPLIERS.map((s) => ({ ...s }));

  const stock = [];
  for (const m of materials) {
    const o = STOCK_OVERRIDE[m.material_id];
    const level = (i) => (o ? o[i] : Math.max(2, Math.round(m.reorder_point * (1.2 + rnd() * 2.2))));
    inv.warehouses.forEach((w, i) => stock.push({ material_id: m.material_id, warehouse_id: w.id, storage_location: `${w.id}-${pad(between(1, 6), 2)}`, on_hand: level(i) }));
  }

  const supplierOf = new Map(materials.map((m) => [m.material_id, m.supplier_id]));
  const purchaseOrders = PO_LINES.map(([material_id, quantity, days], i) => ({
    po_id: `PO-${4500000 + Math.floor(i / 2) + 1}`, po_line_id: `PO-${4500000 + Math.floor(i / 2) + 1}-${pad((i % 2 + 1) * 10, 2)}`, material_id, supplier_id: supplierOf.get(material_id), quantity,
    delivery_date: addDays(today, days), status: days < 0 ? 'late' : 'open',
  }));

  // maintenance plans: one per template per matching asset (every n-th asset in registry order), first due dates spread over the next year
  const plans = [];
  for (const t of inv.plans) {
    const pool = base.assets.filter((a) => a.class === t.cls && !a.merged_into);
    pool.forEach((a, i) => {
      if (i % t.every !== (t.every > 1 ? Math.min(3, t.every - 1) : 0)) return;
      plans.push({ plan_id: `${t.id}-${a.asset_id}`, template: t.id, asset_id: a.asset_id, task: t.task, interval_days: t.interval, next_due: addDays(today, between(3, 330)), parts: t.parts.map((p) => ({ material_id: p.m, quantity: p.q })) });
    });
  }

  // planned work orders: a plan raises one when it falls due within the horizon
  const horizon = addDays(today, inv.planHorizonDays);
  const planned = plans.filter((p) => p.next_due <= horizon).sort((a, b) => a.next_due.localeCompare(b.next_due) || a.plan_id.localeCompare(b.plan_id)).map((p, k) => ({
    work_order_id: `WO-P-${pad(k + 1, 4)}`, asset_id: p.asset_id, work_type: 'preventive', priority: 'low', status: 'planned', finding_ids: [], created_at: today, planned_date: p.next_due, completed_at: null,
    plan_id: p.plan_id, task: p.task,
  }));

  // one open corrective order for a transformer bushing at 500 kV, so the demo shows "none in stock, one on order" end to end
  const bushing = base.findings.find((f) => f.defect_class === 'bushing_hotspot' && f.review_status === 'confirmed' && (base.assets.find((a) => a.asset_id === f.asset_id)?.voltage_kv ?? null) === 500 && !base.workOrders.some((w) => w.finding_ids.includes(f.finding_id)));
  const added = bushing ? [{
    work_order_id: `WO-${pad(base.workOrders.length + 1, 4)}`, asset_id: bushing.asset_id, work_type: 'transformer repair', priority: 'high', status: 'open', finding_ids: [bushing.finding_id],
    created_at: today, planned_date: addDays(today, 20), completed_at: null,
  }] : [];

  // the parts of every work order that is not done, then the reservations for what is due soon
  const findingsById = new Map(base.findings.map((f) => [f.finding_id, f]));
  const plansById = new Map(plans.map((p) => [p.plan_id, p]));
  const assetsById = new Map(base.assets.map((a) => [a.asset_id, a]));
  const kvOf = (id) => assetsById.get(id)?.voltage_kv ?? null;
  const open = [...base.workOrders, ...added, ...planned].filter((w) => !['completed', 'cancelled'].includes(w.status));
  const lines = open.flatMap((w) => partsFor(w, { findingsById, plansById, kvOf }).map((p) => ({ work_order_id: w.work_order_id, asset_id: w.asset_id, planned_date: w.planned_date, material_id: p.material_id, quantity: p.quantity })));
  const reservations = planReservations(lines, { stock, purchaseOrders }, { today, addDays });

  return { materials, suppliers, stock, purchaseOrders, reservations, maintenancePlans: plans, plannedWorkOrders: [...added, ...planned], warehouses: inv.warehouses.map((w) => ({ ...w })) };
}
