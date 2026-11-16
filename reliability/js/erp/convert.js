// Raw ERP records -> the dashboard's own record shapes, with the ID mapping between ERP keys and registry assets.
//
// The ID mapping uses the registry's external_ids field: external_ids.sap is the SAP functional location (towers, lines, spans'
// conductors) or equipment number (transformers and their parts). A work order or maintenance plan whose location is in that table
// belongs to that asset. One whose location is not goes to the "unmatched" list, grouped by location, and is held back until a person
// confirms a match in the Links tab (the same review flow as duplicates), or ignores it. Nothing is guessed.

import { mapRows } from './mapping.js';
import { results } from './odata.js';

/** @param {Array<{asset_id: string, external_ids?: Record<string,string>}>} assets */
export function idTable(assets, system = 'sap') {
  const table = new Map();
  for (const a of assets) { const key = a.external_ids?.[system]; if (key) table.set(key, a.asset_id); }
  return table;
}

/**
 * @param {Record<string, any>} raw  adapter output by entity name
 * @param {{warehouses?: object, entities: Record<string, object>}} mapping
 * @param {Array<any>} registryAssets the dashboard's assets (for the ID mapping)
 * @param {{system?: string}} [o]
 */
export function convert(raw, mapping, registryAssets, { system = 'sap' } = {}) {
  const ctx = { warehouses: mapping.warehouses };
  const map = (entity) => (raw[entity] ? mapRows(results(raw[entity]), mapping.entities[entity], ctx) : []);
  const table = idTable(registryAssets, system);

  const assets = map('assets');
  const assetByKey = new Map(assets.map((a) => [a.key, a]));
  const orders = map('workOrders');
  const plans = map('maintenancePlans');

  const workOrders = []; const maintenancePlans = [];
  const groups = new Map(); // functional location -> the unmatched record
  const unmatchedFor = (fl) => {
    if (!groups.has(fl)) {
      const a = assetByKey.get(fl);
      groups.set(fl, { key: fl, system, kind: 'functional_location', name: a?.name ?? fl, class: a?.class ?? 'other', voltage_kv: a?.voltage_kv ?? null, install_date: a?.install_date ?? null,
        location: a?.lat !== null && a?.lat !== undefined ? { type: 'point', lat: a.lat, lng: a.lng } : null, workOrders: [], maintenancePlans: [] });
    }
    return groups.get(fl);
  };
  for (const o of orders) {
    const { functional_location: fl, ...rest } = o;
    const id = table.get(fl);
    if (id) workOrders.push({ ...rest, asset_id: id, source: 'erp', erp_location: fl });
    else if (fl) unmatchedFor(fl).workOrders.push({ ...rest, asset_id: null, source: 'erp', erp_location: fl });
  }
  for (const p of plans) {
    const { functional_location: fl, ...rest } = p;
    const id = table.get(fl);
    if (id) maintenancePlans.push({ ...rest, asset_id: id });
    else if (fl) unmatchedFor(fl).maintenancePlans.push({ ...rest, asset_id: null });
  }

  const warehouses = Object.values(mapping.warehouses ?? {});
  return {
    workOrders, maintenancePlans, notifications: map('notifications'),
    materials: map('materials'), suppliers: map('suppliers'), stock: map('stock'), purchaseOrders: map('purchaseOrders'), reservations: map('reservations'),
    warehouses, unmatched: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)),
    mapping: { system, known: table.size, locations: assets.length, matchedLocations: assets.filter((a) => table.has(a.key)).length },
  };
}
