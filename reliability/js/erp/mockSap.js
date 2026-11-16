// Mock SAP adapter: the demo default, and the only adapter that needs no environment variables. It answers like SAP S/4HANA's OData V2
// services ({ d: { results: [...] } }, dates as /Date(ms)/, SAP field names and codes), built from the demo seed, so the whole path
// (API, field mapping, conversion, ID mapping, unmatched records, cache) is the real one and a customer's SAP only changes the source.
//
// The service and field names follow the standard APIs (see docs/management-feedback-plan.md):
//   A_MaintenanceOrder (API_MAINTENANCEORDER)   A_MaintenanceNotification (API_MAINTNOTIFICATION)
//   A_FunctionalLocation / A_Equipment          A_Product (API_PRODUCT_SRV)            A_MaterialStock (API_MATERIAL_STOCK_SRV)
//   A_PurchaseOrderItem (API_PURCHASEORDER_PROCESS_SRV)   A_Supplier (API_BUSINESS_PARTNER)
//   A_ReservationDocumentItem                   A_MaintenancePlan
// Fields that standard SAP does not have are named ZZ_...: they stand for what a real system holds elsewhere (the finding links, the
// plan's component list) and are what a customer's field mapping would point at their own source for.
//
// The mock also contains three functional locations the dashboard's registry does not know, each with a work order, so the "unmatched
// ERP records" flow has something to show: a near-duplicate of a tower, a renamed transformer, and a yard crane that matches nothing.

import { checkAdapter } from './adapter.js';
import { wrap, toODataDate } from './odata.js';

const PRIORITY = { high: '1', medium: '2', low: '3' };
const STATUS = { open: 'CRTD', in_progress: 'REL', completed: 'TECO', cancelled: 'CNCL', planned: 'CRTD' };
const PLANT = { 'WH-N': '1010', 'WH-S': '1020' };
const pad = (n, w) => String(n).padStart(w, '0');
const digits = (id) => String(id).replace(/\D/g, '');

/** SAP order number: 4000nnnn corrective, 4100nnnn planned (from a maintenance plan), 4200nnnn the three orders on unmatched locations. */
export const orderNo = (id) => (id.startsWith('WO-P-') ? `4100${digits(id)}` : `4000${digits(id)}`);
export const materialNo = (id) => `1000${digits(id)}`; // MAT-01 -> 100001
export const supplierNo = (id) => `17000${digits(id)}`; // SUP-01 -> 1700001
const planNo = (i) => `8000${pad(i + 1, 4)}`;

function shift(lat, lng, metres, bearingDeg) {
  const r = (bearingDeg * Math.PI) / 180;
  return { lat: lat + (metres * Math.cos(r)) / 111320, lng: lng + (metres * Math.sin(r)) / (111320 * Math.cos((lat * Math.PI) / 180)) };
}

/** The locations the registry does not know, with the order each carries. */
function unmatchedLocations(seed) {
  const byId = new Map(seed.assets.map((a) => [a.asset_id, a]));
  const tower = byId.get('TWR-132-01-020'); const tx = byId.get('TX-1A');
  const t = shift(tower.location.lat, tower.location.lng, 12, 40);
  const x = shift(tx.location.lat, tx.location.lng, 6, 200);
  return [
    { FunctionalLocation: 'SAP-TWR-13201120', FunctionalLocationName: 'T-20A', ObjectType: 'TOWER', ZZ_NominalVoltage_kV: 132, ConstructionDate: toODataDate(tower.install_date), GeoLatitude: t.lat, GeoLongitude: t.lng, ZZ_Order: { no: '42000001', desc: 'Bird nest guard fitting', type: 'PM02', status: 'CRTD', priority: '2', start: '2026-12-06' } },
    { FunctionalLocation: 'SAP-EQ-TX1A-B', FunctionalLocationName: 'TX1A', ObjectType: 'TRANSFORMER', ZZ_NominalVoltage_kV: 220, ConstructionDate: toODataDate(tx.install_date), GeoLatitude: x.lat, GeoLongitude: x.lng, ZZ_Order: { no: '42000002', desc: 'Oil sampling', type: 'PM03', status: 'CRTD', priority: '3', start: '2026-12-15' } },
    { FunctionalLocation: 'SAP-YARD-CRANE-07', FunctionalLocationName: 'Depot yard crane 7', ObjectType: 'OTHER', ZZ_NominalVoltage_kV: null, ConstructionDate: toODataDate('2012-04-02'), GeoLatitude: 40.43211, GeoLongitude: 49.61874, ZZ_Order: { no: '42000003', desc: 'Annual crane inspection', type: 'PM03', status: 'CRTD', priority: '3', start: '2027-01-20' } },
  ];
}

/** @param {{seed: ReturnType<typeof import('../data/seed.js').generateSeed>}} o */
export function createMockSap({ seed }) {
  const byId = new Map(seed.assets.map((a) => [a.asset_id, a]));
  /** The functional location SAP knows for an asset: its own, or the nearest parent that has one. */
  const flOf = (assetId) => { for (let a = byId.get(assetId), i = 0; a && i < 8; a = a.parent_id ? byId.get(a.parent_id) : null, i += 1) if (a.external_ids?.sap) return a.external_ids.sap; return null; };
  const planIndex = new Map(seed.maintenancePlans.map((p, i) => [p.plan_id, i]));
  const extras = unmatchedLocations(seed);

  const adapter = {
    name: 'mock-sap', label: 'SAP (mock)', live: false,
    configured: () => true,

    async workOrders() {
      const rows = seed.workOrders.map((w) => ({
        MaintenanceOrder: orderNo(w.work_order_id), MaintenanceOrderType: w.status === 'planned' || w.work_type === 'preventive' ? 'PM03' : 'PM02', MaintenanceOrderDesc: w.task ?? w.work_type,
        FunctionalLocation: flOf(w.asset_id), MaintPriority: PRIORITY[w.priority] ?? '3', MaintenanceOrderStatus: STATUS[w.status] ?? 'CRTD',
        MaintenancePlan: w.plan_id ? planNo(planIndex.get(w.plan_id)) : '', CreationDate: toODataDate(w.created_at), MaintOrdBasicStartDate: toODataDate(w.planned_date), ActualEndDate: toODataDate(w.completed_at),
        ZZ_FindingRefs: (w.finding_ids ?? []).join(','),
      }));
      for (const e of extras) rows.push({ MaintenanceOrder: e.ZZ_Order.no, MaintenanceOrderType: e.ZZ_Order.type, MaintenanceOrderDesc: e.ZZ_Order.desc, FunctionalLocation: e.FunctionalLocation, MaintPriority: e.ZZ_Order.priority, MaintenanceOrderStatus: e.ZZ_Order.status, MaintenancePlan: '', CreationDate: toODataDate('2026-11-10'), MaintOrdBasicStartDate: toODataDate(e.ZZ_Order.start), ActualEndDate: null, ZZ_FindingRefs: '' });
      return wrap(rows);
    },

    async notifications() {
      return wrap(seed.workOrders.filter((w) => !w.plan_id).map((w) => ({
        MaintenanceNotification: `3000${digits(w.work_order_id)}`, NotificationType: 'M2', NotificationText: w.work_type, FunctionalLocation: flOf(w.asset_id),
        MaintenanceOrder: orderNo(w.work_order_id), NotificationCreationDate: toODataDate(w.created_at),
      })));
    },

    async assets() {
      const rows = seed.assets.filter((a) => a.external_ids?.sap).map((a) => ({
        FunctionalLocation: a.external_ids.sap, FunctionalLocationName: a.name, ObjectType: a.class.toUpperCase(), ZZ_NominalVoltage_kV: a.voltage_kv ?? null,
        ConstructionDate: toODataDate(a.install_date), GeoLatitude: a.location?.type === 'point' ? a.location.lat : null, GeoLongitude: a.location?.type === 'point' ? a.location.lng : null,
      }));
      for (const e of extras) { const { ZZ_Order, ...rec } = e; rows.push(rec); }
      return wrap(rows);
    },

    async materials() {
      return wrap(seed.materials.map((m) => ({ Product: materialNo(m.material_id), ProductDescription: m.description, BaseUnit: m.unit, StandardPrice: m.unit_price, ProductGroup: m.group, ZZ_ReorderPoint: m.reorder_point, PreferredSupplier: supplierNo(m.supplier_id) })));
    },

    async stock() {
      return wrap(seed.stock.map((s) => ({ Material: materialNo(s.material_id), Plant: PLANT[s.warehouse_id], StorageLocation: s.storage_location, MatlWrhsStkQtyInMatlBaseUnit: s.on_hand })));
    },

    async purchaseOrders() {
      return wrap(seed.purchaseOrders.map((l) => ({
        PurchaseOrder: l.po_id.replace('PO-', ''), PurchaseOrderItem: l.po_line_id.split('-').pop(), Material: materialNo(l.material_id), Supplier: supplierNo(l.supplier_id),
        OrderQuantity: l.quantity, ScheduleLineDeliveryDate: toODataDate(l.delivery_date), IsCompletelyDelivered: l.status === 'closed',
      })));
    },

    async suppliers() {
      return wrap(seed.suppliers.map((s) => ({ Supplier: supplierNo(s.supplier_id), SupplierName: s.name, PlannedDeliveryDurationInDays: s.lead_time_days })));
    },

    async reservations() {
      return wrap(seed.reservations.map((r) => ({
        Reservation: r.reservation_id.replace('RES-', ''), ReservationItem: '0001', Material: materialNo(r.material_id), OrderID: orderNo(r.work_order_id), ResvnItmRequiredQtyInBaseUnit: r.quantity,
        Plant: r.warehouse_id ? PLANT[r.warehouse_id] : '', PurchaseOrder: r.po_line_id ? r.po_line_id.split('-')[1] : '', PurchaseOrderItem: r.po_line_id ? r.po_line_id.split('-').pop() : '', CreationDate: toODataDate(r.created_at),
      })));
    },

    async maintenancePlans() {
      return wrap(seed.maintenancePlans.map((p, i) => ({
        MaintenancePlan: planNo(i), MaintenancePlanDesc: p.task, MaintenancePlanCycleInDays: p.interval_days, NextPlannedDate: toODataDate(p.next_due), FunctionalLocation: flOf(p.asset_id),
        ZZ_Components: p.parts.map((x) => ({ Material: materialNo(x.material_id), Quantity: x.quantity })),
      })));
    },
  };
  return checkAdapter(adapter);
}
