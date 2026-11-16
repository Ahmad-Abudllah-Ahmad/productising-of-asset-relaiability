// The adapter interface. One adapter per ERP; each method is read-only and returns the ERP's own response shape (for SAP,
// OData V2: { d: { results: [...] } }; for Maximo, an array of member records). Conversion into the dashboard's shapes happens
// in convert.js using the field mapping of the adapter (mapping/<adapter>.json), never inside the adapter.
//
//   workOrders()        maintenance orders (corrective and preventive), with functional location, priority and status
//   notifications()     maintenance notifications / service requests
//   assets()            functional locations and equipment, for the ID mapping
//   materials()         the material master (items)
//   stock()             stock per material, plant and storage location
//   purchaseOrders()    purchase order items with delivery dates
//   suppliers()         suppliers with their planned delivery time
//   reservations()      reservations / order components (which order holds which part, from stock or from a PO)
//   maintenancePlans()  maintenance plans with cycle, next due date and the parts of the task
//
// Credentials never appear here: an adapter reads its own environment variables (names in .env.example) when it is used.

export const ENTITIES = Object.freeze(['workOrders', 'notifications', 'assets', 'materials', 'stock', 'purchaseOrders', 'suppliers', 'reservations', 'maintenancePlans']);

/** URL names of the entities (/api/erp/raw/<name>). */
export const ENTITY_URL = Object.freeze({
  'work-orders': 'workOrders', notifications: 'notifications', assets: 'assets', materials: 'materials', stock: 'stock',
  'purchase-orders': 'purchaseOrders', suppliers: 'suppliers', reservations: 'reservations', 'maintenance-plans': 'maintenancePlans',
});

export class ErpError extends Error {
  /** @param {number} status  @param {string} code  @param {string} message */
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/** Every adapter has: name, label, live (talks to a real system), configured() (are its environment variables set), and the methods above. */
export function checkAdapter(a) {
  const missing = ENTITIES.filter((e) => typeof a[e] !== 'function');
  if (missing.length) throw new Error(`adapter ${a?.name}: missing ${missing.join(', ')}`);
  return a;
}
