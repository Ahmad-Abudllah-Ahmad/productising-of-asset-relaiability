// Maintenance History > Parts & Inventory: stock across the network, low stock, open purchase order lines, and the work orders
// that cannot start for want of parts. The same numbers the Asset 360 tab and the dashboard KPI read (inventoryModel.js).

import { h } from '../ui/dom.js';
import { emptyState, drillKpis, tag, plural, scopeNote } from './screenKit.js';
import { stockRows, blockedWorkOrders, STOCK_NOTE } from './inventoryModel.js';
import { STATE_WORD } from '../domain/inventory.js';
import { openAsset } from './assetPanel.js';
import { sourceBadge } from './badge.js';

export const STATE_TONE = { reserved: 'b', available: 'g', on_order: 'a', short: 'r' };
const fnum = (x) => String(Math.round(x * 100) / 100);

/** One part line as a tag: "short", "on order 2026-12-19", "reserved"... */
export function stateTag(l) {
  const text = l.state === 'on_order' ? `on order ${l.detail.delivery_date}${l.late ? ' (late)' : ''}` : l.state === 'short' ? `short ${l.detail.shortfall}` : STATE_WORD[l.state];
  const title = l.state === 'reserved' ? `Held for this work order in ${l.detail.warehouses.join(', ')}.`
    : l.state === 'available' ? `Free stock in ${l.detail.warehouse_id} would cover it; it is not reserved yet.`
      : l.state === 'on_order' ? `${l.detail.po_id}: a delivery on ${l.detail.delivery_date} would cover it${l.late ? ' (the delivery is late)' : ''}${l.detail.reserved ? ' and is reserved for this order' : ''}.`
        : `Neither free stock nor an open purchase order covers it: ${l.detail.shortfall} ${l.unit} short.`;
  return h('span', { class: `tag ${STATE_TONE[l.state]}`, title, 'data-state': l.state }, text);
}

/**
 * The model of the Parts & Inventory tab. With a line or an asset chosen (the same filters as the other Maintenance History tabs)
 * the work orders are those of the selection, and the stock tables show the materials those work orders need.
 * @param {any} snap  @param {{line?: string, unit?: string}} st  @param {{workOrders: Array<{id: string}>}} hist  loadHistory for the same selection
 */
export function loadParts(snap, st, hist) {
  const inv = snap.inventory;
  const scoped = Boolean(st.line || st.unit);
  const ids = new Set(hist.workOrders.map((w) => w.id));
  const needed = scoped ? new Set(inv.lines.filter((l) => ids.has(l.work_order_id)).map((l) => l.material_id)) : null;
  const rows = stockRows(inv).filter((r) => !needed || needed.has(r.material_id));
  const blocked = blockedWorkOrders(snap).filter((b) => !scoped || ids.has(b.work_order_id));
  const low = rows.filter((r) => r.low).sort((a, b) => Number(b.empty) - Number(a.empty) || (a.available / Math.max(1, a.reorder_point)) - (b.available / Math.max(1, b.reorder_point)));
  const pos = inv.purchaseOrders.filter((l) => l.status !== 'closed' && (!needed || needed.has(l.material_id))).map((l) => ({ ...l, description: inv.materialById.get(l.material_id)?.description ?? l.material_id, supplier: inv.supplierById.get(l.supplier_id)?.name ?? l.supplier_id, late: l.delivery_date < snap.asOf })).sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  return { available: inv.available, scoped, rows, low, pos, blocked, shortLines: blocked.reduce((n, b) => n + b.short, 0), onOrderLines: blocked.reduce((n, b) => n + b.onOrder, 0), latePos: pos.filter((p) => p.late).length, empties: low.filter((r) => r.empty).length, warehouses: inv.warehouses };
}

export function drawParts(m, ctx) {
  const kit = ctx.deps.kit;
  if (!m.available) return [emptyState('parts-empty', 'No inventory data', 'The data source has no materials, stock or purchase orders.')];
  const kpiHost = h('div', { 'data-testid': 'hl-kpis' });
  kpiHost.innerHTML = kit.kpis([
    { spark: [m.blocked.length, m.blocked.length], l: 'Waiting on parts', v: String(m.blocked.length), s: `${m.shortLines} short · ${m.onOrderLines} on order`, tone: m.shortLines ? 'bad' : m.blocked.length ? 'warn' : 'ok', tip: 'Open and planned work orders with a part that is on order or short.' },
    { spark: [m.low.length, m.low.length], l: 'Low stock', v: String(m.low.length), s: `${m.empties} with none free`, tone: m.empties ? 'bad' : m.low.length ? 'warn' : 'ok', tip: 'Materials whose free stock (on hand less reserved) is under the reorder point.' },
    { spark: [m.pos.length, m.pos.length], l: 'Open purchase orders', v: String(m.pos.length), s: `${m.latePos} late`, tone: m.latePos ? 'warn' : 'neutral', tip: 'Purchase order lines not yet delivered.' },
    { spark: [m.rows.length, m.rows.length], l: 'Materials', v: String(m.rows.length), s: `${m.warehouses.length} warehouses`, tone: 'neutral', tip: 'Materials in the catalogue.' },
  ]);
  drillKpis(kpiHost, {});
  const head = h('div', { class: 'hl-head', 'data-testid': 'hl-head' }, h('div', {}, h('h2', {}, 'Parts & Inventory'),
    h('p', { class: 'a360-muted a360-small' }, `${plural(m.rows.length, 'material')}${m.scoped ? ' needed by this selection' : ''} in ${m.warehouses.map((w) => w.name).join(' and ')} · ${plural(m.blocked.length, 'work order')} waiting on parts`),
    h('p', { class: 'pt-asof', 'data-testid': 'stock-asof' }, STOCK_NOTE), h('p', { class: 'a360-small' }, sourceBadge(ctx.deps.repo, { what: 'Stock, purchase orders, work orders' }))));

  const open = (id) => (e) => openAsset(id, { opener: e.currentTarget, tab: 'inventory' });
  const blocked = m.blocked.length
    ? h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'blocked-wo' },
      h('thead', {}, h('tr', {}, ...['Work order', 'On', 'Due', 'Parts that block it'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, m.blocked.map((b) => h('tr', { 'data-wo': b.work_order_id },
        h('th', { scope: 'row' }, b.work_order_id, b.planned_work ? h('div', { class: 'a360-muted a360-small' }, b.task) : null),
        h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: open(b.assetId) }, b.assetName)),
        h('td', {}, b.planned),
        h('td', {}, b.lines.map((l) => h('div', { class: 'pt-line' }, stateTag(l), ' ', `${l.quantity} × ${l.description}`)))))))
    )
    : h('p', { class: 'a360-muted', 'data-testid': 'blocked-empty' }, `No work order is waiting on parts.${scopeNote(ctx.snap)}`);
  const lowTable = m.low.length
    ? h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'low-stock' },
      h('thead', {}, h('tr', {}, ...['Material', 'Free', 'Reorder point', 'On order', 'Supplier (lead time)'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, m.low.map((r) => h('tr', { 'data-material': r.material_id }, h('th', { scope: 'row' }, r.description, h('div', { class: 'a360-muted a360-small' }, r.material_id)),
        h('td', { class: r.empty ? 'pt-bad' : '' }, `${fnum(r.available)} ${r.unit}`), h('td', {}, String(r.reorder_point)), h('td', {}, r.onOrder ? `${r.onOrder}${r.nextDelivery ? ` (${r.nextDelivery})` : ''}` : '–'), h('td', {}, `${r.supplier} (${r.leadTimeDays} d)`))))))
    : h('p', { class: 'a360-muted' }, 'No material is under its reorder point.');
  const poTable = h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'open-pos' },
    h('thead', {}, h('tr', {}, ...['Purchase order', 'Material', 'Supplier', 'Quantity', 'Delivery'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, m.pos.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.po_line_id), h('td', {}, p.description), h('td', {}, p.supplier), h('td', {}, String(p.quantity)), h('td', {}, p.delivery_date, ' ', p.late ? tag('late', 'r') : null))))));
  const stock = h('div', { class: 'hl-scroll' }, h('table', { class: 'a360-table mh-table', 'data-testid': 'stock-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Material'), ...m.warehouses.map((w) => h('th', { scope: 'col', title: 'on hand / reserved' }, `${w.name} (on hand / reserved)`)), ...['Free', 'On order', 'Status'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, m.rows.map((r) => h('tr', { 'data-material': r.material_id }, h('th', { scope: 'row' }, r.description, h('div', { class: 'a360-muted a360-small' }, `${r.material_id} · ${r.group.replace(/_/g, ' ')}`)),
      ...m.warehouses.map((w) => { const x = r.perWh.find((p) => p.warehouse_id === w.id); return h('td', {}, x ? `${x.on_hand} / ${x.reserved}` : '–'); }),
      h('td', {}, `${fnum(r.available)} ${r.unit}`), h('td', {}, r.onOrder ? String(r.onOrder) : '–'), h('td', {}, r.empty ? tag('none free', 'r') : r.low ? tag('low', 'a') : tag('ok', 'g')))))));
  const card = (id, title, note, body) => h('section', { class: 'card hl-card', 'data-testid': id }, h('h3', {}, title), note ? h('p', { class: 'a360-muted a360-small' }, note) : null, body);
  return [h('div', { class: 'hl-main' }, head, kpiHost,
    card('blocked-card', `Work orders waiting on parts (${m.blocked.length})`, 'A work order waits when a part it needs is on order (with its delivery date) or short. Click an asset to see its parts.', blocked),
    card('low-card', `Low stock (${m.low.length})`, STOCK_NOTE, lowTable),
    card('po-card', `Open purchase order lines (${m.pos.length})`, `${STOCK_NOTE} Delivery dates are the orders' own.`, poTable),
    card('stock-card', `Stock (${m.rows.length} materials)`, `On hand and reserved per warehouse; free is on hand less reserved. ${STOCK_NOTE}`, stock))];
}
