// Parts for work orders and their availability (assumption A26 in config.js). Pure functions: no DOM, no clock.
//
//   partsFor(wo, ctx)            the parts a work order needs: from its maintenance plan, or from the defect class of each finding
//   availability(lines, data)    for each part line: reserved | available | on_order | short, with the detail behind it
//   planReservations(lines, d)   the reservations the seed makes for work that is due soon (same rules as availability)
//   waiting(lines)               the work orders that cannot start for want of parts (a line is on order or short)

import { CONFIG } from './config.js';

export const STATES = Object.freeze(['reserved', 'available', 'on_order', 'short']);
export const STATE_WORD = Object.freeze({ reserved: 'reserved', available: 'available', on_order: 'on order', short: 'short' });

/**
 * @param {{work_order_id: string, plan_id?: string|null, finding_ids: string[], asset_id: string}} wo
 * @param {{findingsById: Map<string, any>, plansById: Map<string, any>, kvOf: (assetId: string) => number|null, defectParts?: object}} ctx
 * @returns {Array<{material_id: string, quantity: number}>}
 */
export function partsFor(wo, ctx) {
  const table = ctx.defectParts ?? CONFIG.inventory.defectParts;
  const sum = new Map();
  const add = (m, q) => sum.set(m, (sum.get(m) ?? 0) + q);
  if (wo.plan_id) {
    for (const p of ctx.plansById.get(wo.plan_id)?.parts ?? []) add(p.material_id, p.quantity);
  } else {
    const kv = ctx.kvOf(wo.asset_id);
    for (const id of wo.finding_ids ?? []) {
      const f = ctx.findingsById.get(id);
      if (!f) continue;
      // the AI class decides, unless a reviewer corrected it (the finding then carries the corrected class)
      for (const p of table[f.defect_class] ?? []) if (!p.kv || kv === null || p.kv.includes(kv)) add(p.m, p.q);
    }
  }
  return [...sum.entries()].map(([material_id, quantity]) => ({ material_id, quantity })).sort((a, b) => a.material_id.localeCompare(b.material_id));
}

const byDue = (a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? '') || a.work_order_id.localeCompare(b.work_order_id) || a.material_id.localeCompare(b.material_id);

/**
 * Walk the part lines in due-date order and give each a state.
 * @param {Array<{work_order_id: string, material_id: string, quantity: number, planned_date?: string}>} lines
 * @param {{stock: any[], purchaseOrders: any[], reservations: any[]}} data
 */
export function availability(lines, { stock, purchaseOrders, reservations }) {
  const onHand = new Map(); // material -> warehouse -> on hand
  for (const s of stock) { if (!onHand.has(s.material_id)) onHand.set(s.material_id, new Map()); onHand.get(s.material_id).set(s.warehouse_id, (onHand.get(s.material_id).get(s.warehouse_id) ?? 0) + s.on_hand); }
  const heldStock = new Map(); // material|warehouse -> reserved
  const heldPo = new Map(); // po line id -> reserved
  const resFor = new Map(); // wo|material -> reservations
  for (const r of reservations) {
    if (r.source === 'stock') heldStock.set(`${r.material_id}|${r.warehouse_id}`, (heldStock.get(`${r.material_id}|${r.warehouse_id}`) ?? 0) + r.quantity);
    else heldPo.set(r.po_line_id, (heldPo.get(r.po_line_id) ?? 0) + r.quantity);
    const k = `${r.work_order_id}|${r.material_id}`;
    resFor.set(k, [...(resFor.get(k) ?? []), r]);
  }
  const free = (m, wh) => (onHand.get(m)?.get(wh) ?? 0) - (heldStock.get(`${m}|${wh}`) ?? 0);
  const poLeft = new Map(purchaseOrders.filter((l) => l.status !== 'closed').map((l) => [l.po_line_id, l.quantity - (heldPo.get(l.po_line_id) ?? 0)]));
  const poByMaterial = new Map();
  for (const l of [...purchaseOrders].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || a.po_line_id.localeCompare(b.po_line_id))) {
    if (l.status === 'closed') continue;
    if (!poByMaterial.has(l.material_id)) poByMaterial.set(l.material_id, []);
    poByMaterial.get(l.material_id).push(l);
  }
  const poById = new Map(purchaseOrders.map((l) => [l.po_line_id, l]));
  const taken = new Map(); // material|warehouse -> tentatively allocated to "available" lines
  const freeNow = (m, wh) => free(m, wh) - (taken.get(`${m}|${wh}`) ?? 0);

  return [...lines].sort(byDue).map((ln) => {
    const mine = resFor.get(`${ln.work_order_id}|${ln.material_id}`) ?? [];
    const fromStock = mine.filter((r) => r.source === 'stock');
    const fromPo = mine.filter((r) => r.source === 'po');
    const heldQty = (a) => a.reduce((n, r) => n + r.quantity, 0);
    if (heldQty(fromStock) >= ln.quantity) return { ...ln, state: 'reserved', detail: { warehouses: [...new Set(fromStock.map((r) => r.warehouse_id))] } };
    if (heldQty(fromPo) + heldQty(fromStock) >= ln.quantity && fromPo.length) {
      const l = poById.get(fromPo[0].po_line_id);
      return { ...ln, state: 'on_order', detail: { po_id: l?.po_id ?? null, po_line_id: l?.po_line_id ?? null, delivery_date: l?.delivery_date ?? null, reserved: true } };
    }
    const need = ln.quantity - heldQty(fromStock);
    // free stock in one warehouse, the one with the most
    const whs = [...(onHand.get(ln.material_id)?.keys() ?? [])].sort((a, b) => freeNow(ln.material_id, b) - freeNow(ln.material_id, a) || a.localeCompare(b));
    const wh = whs.find((w) => freeNow(ln.material_id, w) >= need);
    if (wh) { taken.set(`${ln.material_id}|${wh}`, (taken.get(`${ln.material_id}|${wh}`) ?? 0) + need); return { ...ln, state: 'available', detail: { warehouse_id: wh, split: [{ warehouse_id: wh, quantity: need }] } }; }
    // no single warehouse has enough: take it from several when together they do
    const totalFree = whs.reduce((n, w) => n + Math.max(0, freeNow(ln.material_id, w)), 0);
    if (totalFree >= need && need > 0) {
      let left = need; const split = [];
      for (const w of whs) { const q = Math.min(left, Math.max(0, freeNow(ln.material_id, w))); if (q > 0) { split.push({ warehouse_id: w, quantity: q }); taken.set(`${ln.material_id}|${w}`, (taken.get(`${ln.material_id}|${w}`) ?? 0) + q); left -= q; } if (!left) break; }
      return { ...ln, state: 'available', detail: { warehouse_id: split[0].warehouse_id, split } };
    }
    const line = (poByMaterial.get(ln.material_id) ?? []).find((l) => (poLeft.get(l.po_line_id) ?? 0) >= need);
    if (line) { poLeft.set(line.po_line_id, poLeft.get(line.po_line_id) - need); return { ...ln, state: 'on_order', detail: { po_id: line.po_id, po_line_id: line.po_line_id, delivery_date: line.delivery_date, reserved: false } }; }
    const have = whs.reduce((n, w) => n + Math.max(0, freeNow(ln.material_id, w)), 0);
    return { ...ln, state: 'short', detail: { shortfall: Math.max(0, need - have), free: have } };
  });
}

/**
 * The reservations for work that is due within `days` of `today`: a line that would be "available" is reserved from its
 * warehouse, one that would be "on order" from the PO line. Short lines get none.
 * @returns {Array<{reservation_id: string, work_order_id: string, material_id: string, quantity: number, source: 'stock'|'po', warehouse_id: string|null, po_line_id: string|null, created_at: string}>}
 */
export function planReservations(lines, { stock, purchaseOrders }, { today, days = CONFIG.inventory.reserveWithinDays, addDays }) {
  const limit = addDays(today, days);
  const out = [];
  const eligible = [...lines].filter((l) => l.planned_date <= limit).sort(byDue);
  // allocate one line at a time so each sees what the earlier ones took
  for (const ln of eligible) {
    const [r] = availability([ln], { stock, purchaseOrders, reservations: out });
    if (r.state === 'available') for (const part of r.detail.split) out.push({ reservation_id: `RES-${String(out.length + 1).padStart(5, '0')}`, work_order_id: ln.work_order_id, material_id: ln.material_id, quantity: part.quantity, source: 'stock', warehouse_id: part.warehouse_id, po_line_id: null, created_at: today });
    else if (r.state === 'on_order') out.push({ reservation_id: `RES-${String(out.length + 1).padStart(5, '0')}`, work_order_id: ln.work_order_id, material_id: ln.material_id, quantity: ln.quantity, source: 'po', warehouse_id: null, po_line_id: r.detail.po_line_id, created_at: today });
  }
  return out;
}

/** Work orders with at least one line that is on order or short. */
export function waiting(lines) {
  const by = new Map();
  for (const l of lines) {
    if (l.state !== 'on_order' && l.state !== 'short') continue;
    if (!by.has(l.work_order_id)) by.set(l.work_order_id, { work_order_id: l.work_order_id, lines: [] });
    by.get(l.work_order_id).lines.push(l);
  }
  return [...by.values()];
}
