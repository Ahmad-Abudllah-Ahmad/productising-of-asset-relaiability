import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { partsFor, availability, planReservations, waiting } from '../domain/inventory.js';
import { addDays } from '../data/inventory.js';
import { stockRows, blockedWorkOrders } from '../app/inventoryModel.js';
import { loadDashboard } from '../app/dashboardModel.js';
import { loadHistory } from '../app/historyModel.js';
import { loadAssetDetail } from '../app/assetModel.js';

const seed = generateSeed();
const repo = () => createRepository(generateSeed(), { storage: null });
const snapP = (async () => loadSnapshot(repo()))();

// ---------------------------------------------------------------- the four states, on small fixtures
const stock = [{ material_id: 'M', warehouse_id: 'A', on_hand: 5 }, { material_id: 'M', warehouse_id: 'B', on_hand: 2 }, { material_id: 'Z', warehouse_id: 'A', on_hand: 0 }];
const pos = [{ po_id: 'P1', po_line_id: 'P1-10', material_id: 'Z', quantity: 3, delivery_date: '2026-12-20', status: 'open' }];
const line = (wo, m, q, due = '2026-11-20') => ({ work_order_id: wo, asset_id: 'X', material_id: m, quantity: q, planned_date: due });

test('availability: reserved, available, on order (with its date) and short', () => {
  const reservations = [{ reservation_id: 'R1', work_order_id: 'W1', material_id: 'M', quantity: 2, source: 'stock', warehouse_id: 'A', po_line_id: null }];
  const r = availability([line('W1', 'M', 2), line('W2', 'M', 3), line('W3', 'Z', 2), line('W4', 'Z', 5), line('W5', 'M', 9)], { stock, purchaseOrders: pos, reservations });
  const by = Object.fromEntries(r.map((x) => [x.work_order_id, x]));
  assert.equal(by.W1.state, 'reserved');
  assert.deepEqual(by.W1.detail.warehouses, ['A']);
  assert.equal(by.W2.state, 'available'); // 5 on hand, 2 reserved, 3 free in A
  assert.equal(by.W2.detail.warehouse_id, 'A');
  assert.equal(by.W3.state, 'on_order');
  assert.equal(by.W3.detail.delivery_date, '2026-12-20');
  assert.equal(by.W4.state, 'short'); // the one PO line (3) is taken by W3 first, and 5 is more than it holds
  assert.deepEqual([by.W4.detail.shortfall, by.W4.detail.free], [5, 0]);
  assert.equal(by.W5.state, 'short');
  assert.deepEqual(waiting(r).map((w) => w.work_order_id).sort(), ['W3', 'W4', 'W5']);
});

test('availability: a line can be filled from two warehouses when neither has enough alone', () => {
  const r = availability([line('W', 'M', 6)], { stock: [{ material_id: 'M', warehouse_id: 'A', on_hand: 4 }, { material_id: 'M', warehouse_id: 'B', on_hand: 3 }], purchaseOrders: [], reservations: [] });
  assert.equal(r[0].state, 'available');
  assert.deepEqual(r[0].detail.split, [{ warehouse_id: 'A', quantity: 4 }, { warehouse_id: 'B', quantity: 2 }]);
  const res = planReservations([line('W', 'M', 6)], { stock: [{ material_id: 'M', warehouse_id: 'A', on_hand: 4 }, { material_id: 'M', warehouse_id: 'B', on_hand: 3 }], purchaseOrders: [] }, { today: '2026-11-11', days: 30, addDays });
  assert.deepEqual(res.map((x) => [x.warehouse_id, x.quantity]), [['A', 4], ['B', 2]]);
  assert.equal(availability([line('W', 'M', 6)], { stock: [{ material_id: 'M', warehouse_id: 'A', on_hand: 4 }, { material_id: 'M', warehouse_id: 'B', on_hand: 3 }], purchaseOrders: [], reservations: res })[0].state, 'reserved');
});

test('availability: earlier work gets the stock first; two lines cannot both take the same units', () => {
  const r = availability([line('LATE', 'M', 3, '2026-12-30'), line('SOON', 'M', 3, '2026-11-15'), line('MID', 'M', 3, '2026-12-01')], { stock: [{ material_id: 'M', warehouse_id: 'A', on_hand: 4 }, { material_id: 'M', warehouse_id: 'B', on_hand: 3 }], purchaseOrders: [], reservations: [] });
  assert.deepEqual(r.map((x) => [x.work_order_id, x.state]), [['SOON', 'available'], ['MID', 'available'], ['LATE', 'short']]);
});

test('planReservations: due-soon lines are reserved from stock or from a PO line, short lines get none, nothing is over-reserved', () => {
  const lines = [line('W1', 'M', 4, '2026-11-20'), line('W2', 'M', 4, '2026-11-25'), line('W3', 'Z', 2, '2026-11-22'), line('W4', 'M', 1, '2027-03-01')];
  const res = planReservations(lines, { stock, purchaseOrders: pos }, { today: '2026-11-11', days: 30, addDays });
  assert.deepEqual(res.map((r) => [r.work_order_id, r.source]).sort(), [['W1', 'stock'], ['W3', 'po']]); // W4 is too far out; W2 needs 4 and only 1 + 2 = 3 are free across both warehouses, so it is short and gets nothing
  const used = res.filter((r) => r.source === 'stock').reduce((n, r) => n + r.quantity, 0);
  assert.ok(used <= 7);
});

// ---------------------------------------------------------------- the mapping
test('defect to parts: every defect class is in the table, every part exists, voltage picks the right disc and bushing', () => {
  const mats = new Set(seed.materials.map((m) => m.material_id));
  for (const c of [...DEFECT_CLASSES, ...TX_DEFECT_CLASSES]) assert.ok(c.id in CONFIG.inventory.defectParts, `${c.id} is mapped (an empty list means labour only)`);
  for (const [cls, parts] of Object.entries(CONFIG.inventory.defectParts)) for (const p of parts) assert.ok(mats.has(p.m) && p.q > 0, `${cls}: ${p.m}`);
  const ctx = (kv) => ({ findingsById: new Map([['F', { defect_class: 'insulator_missing_disc' }]]), plansById: new Map(), kvOf: () => kv });
  const wo = { work_order_id: 'W', asset_id: 'T', finding_ids: ['F'] };
  assert.deepEqual(partsFor(wo, ctx(132)).map((p) => p.material_id), ['MAT-01', 'MAT-04']);
  assert.deepEqual(partsFor(wo, ctx(500)).map((p) => p.material_id), ['MAT-02', 'MAT-04']);
  const two = { ...wo, finding_ids: ['F', 'F'] };
  assert.equal(partsFor(two, ctx(132)).find((p) => p.material_id === 'MAT-01').quantity, 4, 'two findings need two repairs of parts');
  assert.deepEqual(partsFor({ ...wo, finding_ids: [] , plan_id: 'PX' }, { ...ctx(132), plansById: new Map([['PX', { parts: [{ material_id: 'MAT-38', quantity: 2 }] }]]) }), [{ material_id: 'MAT-38', quantity: 2 }], 'a planned order takes its plan\'s parts');
  assert.deepEqual(partsFor({ ...wo, finding_ids: ['V'] }, { ...ctx(132), findingsById: new Map([['V', { defect_class: 'vegetation_encroachment' }]]) }), [], 'clearing needs no stock');
});

// ---------------------------------------------------------------- the seed
test('seed: about 40 materials, two warehouses, five suppliers, purchase orders, reservations, plans; deterministic', () => {
  assert.equal(seed.materials.length, 40);
  assert.equal(seed.suppliers.length, 5);
  assert.ok(seed.suppliers.every((s) => s.lead_time_days >= 14));
  assert.deepEqual([...new Set(seed.stock.map((s) => s.warehouse_id))].sort(), ['WH-N', 'WH-S']);
  assert.equal(seed.stock.length, 80);
  assert.ok(seed.purchaseOrders.length >= 8 && seed.reservations.length > 20 && seed.maintenancePlans.length > 40);
  assert.ok(seed.materials.every((m) => seed.suppliers.some((s) => s.supplier_id === m.supplier_id)));
  assert.deepEqual(generateSeed().reservations, seed.reservations);
  assert.deepEqual(generateSeed().maintenancePlans.map((p) => p.next_due), seed.maintenancePlans.map((p) => p.next_due));
});

test('seed: no stock is reserved twice over, and every reservation points at a real work order and part', () => {
  const held = new Map();
  for (const r of seed.reservations.filter((x) => x.source === 'stock')) held.set(`${r.material_id}|${r.warehouse_id}`, (held.get(`${r.material_id}|${r.warehouse_id}`) ?? 0) + r.quantity);
  for (const [k, q] of held) { const [m, w] = k.split('|'); assert.ok(q <= seed.stock.find((s) => s.material_id === m && s.warehouse_id === w).on_hand, `${k} reserved ${q}`); }
  const heldPo = new Map();
  for (const r of seed.reservations.filter((x) => x.source === 'po')) heldPo.set(r.po_line_id, (heldPo.get(r.po_line_id) ?? 0) + r.quantity);
  for (const [id, q] of heldPo) assert.ok(q <= seed.purchaseOrders.find((l) => l.po_line_id === id).quantity, id);
  const wos = new Set(seed.workOrders.map((w) => w.work_order_id));
  assert.ok(seed.reservations.every((r) => wos.has(r.work_order_id) && seed.materials.some((m) => m.material_id === r.material_id)));
});

test('planned work: each planned work order comes from a maintenance plan that falls due within the horizon', () => {
  const planned = seed.workOrders.filter((w) => w.status === 'planned');
  assert.ok(planned.length >= 20);
  const horizon = addDays(CONFIG.seed.referenceDate, CONFIG.inventory.planHorizonDays);
  const plans = new Map(seed.maintenancePlans.map((p) => [p.plan_id, p]));
  for (const w of planned) {
    const p = plans.get(w.plan_id);
    assert.ok(p, `${w.work_order_id} has a plan`);
    assert.equal(w.planned_date, p.next_due);
    assert.equal(w.asset_id, p.asset_id);
    assert.ok(w.planned_date <= horizon && w.planned_date > CONFIG.seed.referenceDate);
    assert.equal(w.work_type, 'preventive');
  }
  // every plan inside the horizon raised one, none outside did
  assert.equal(planned.length, seed.maintenancePlans.filter((p) => p.next_due <= horizon).length);
  assert.ok(seed.maintenancePlans.some((p) => p.next_due > horizon), 'later plans are listed but have raised nothing yet');
});

test('the demo has something to show: all four states and deliberate shortages, including a late delivery', async () => {
  const snap = await snapP;
  const inv = snap.inventory;
  assert.equal(inv.available, true);
  const states = new Set(inv.lines.map((l) => l.state));
  assert.deepEqual([...states].sort(), ['available', 'on_order', 'reserved', 'short']);
  const short = inv.lines.filter((l) => l.state === 'short');
  assert.ok(short.length >= 5 && short.every((l) => l.detail.shortfall > 0));
  assert.ok(inv.lines.some((l) => l.state === 'on_order' && l.late), 'a late delivery');
  const bl = inv.lines.find((l) => l.material_id === 'MAT-36');
  assert.deepEqual([bl.state, bl.asset_id.startsWith('TX-2C'), bl.detail.delivery_date], ['on_order', true, '2027-01-24'], 'an open transformer work order needs the 500 kV bushing: none in stock, one on order');
  const rows = stockRows(inv);
  const bushing = rows.find((r) => r.material_id === 'MAT-36');
  assert.deepEqual([bushing.onHand, bushing.onOrder, bushing.empty], [0, 1, true], 'the 500 kV bushing: none in stock, one on order');
  assert.ok(rows.filter((r) => r.low).length >= 4 && rows.some((r) => r.empty));
  assert.ok(rows.every((r) => r.available === r.onHand - r.reserved));
});

test('the dashboard KPI, the Parts & Inventory list and Asset 360 count the same work orders waiting on parts', async () => {
  const snap = await snapP;
  const blocked = blockedWorkOrders(snap);
  const d = loadDashboard(snap);
  assert.equal(d.kpis.parts.waiting, blocked.length);
  assert.equal(d.kpis.parts.short, blocked.reduce((n, b) => n + b.short, 0));
  assert.ok(blocked.length > 5);
  // each blocked work order's lines appear, with the same states, in the Asset 360 tab of its asset
  for (const b of blocked.slice(0, 8)) {
    const a = await loadAssetDetail(snap.repo ?? repo(), snap, b.assetId).catch(() => null);
    if (!a) continue;
    for (const l of b.lines) assert.ok(a.inventory.lines.some((x) => x.work_order_id === l.work_order_id && x.material_id === l.material_id && x.state === l.state), `${l.work_order_id} ${l.material_id}`);
  }
  // global filters narrow it
  const f = await loadSnapshot(repo(), undefined, { kv: 220 });
  assert.ok(blockedWorkOrders(f).length < blocked.length);
  assert.equal(loadDashboard(f).kpis.parts.waiting, blockedWorkOrders(f).length);
});

test('planned work is not "open": it stays out of the overdue count and the backlog, and shows as its own status', async () => {
  const snap = await snapP;
  const d = loadDashboard(snap);
  assert.equal(d.kpis.overdue.open, 43);
  const h = loadHistory(snap);
  assert.ok(h.statusCounts.planned >= 20);
  assert.equal(h.workOrders.filter((w) => w.status === 'planned').length, h.statusCounts.planned);
  assert.ok(h.workOrders.filter((w) => w.status === 'planned').every((w) => !w.overdue));
});

test('Asset 360: planned work from a plan shows under Planned, with its task and parts; an earlier as-of date has none', async () => {
  const snap = await snapP;
  const w = seed.workOrders.find((x) => x.status === 'planned' && !snap.byId.get(x.asset_id)?.merged_into && x.plan_id.startsWith('PM-TX-OIL'));
  const r = repo();
  const d = await loadAssetDetail(r, snap, w.asset_id);
  assert.ok(d.work.groups.planned.rows.some((o) => o.id === w.work_order_id && o.task === w.task && o.planId === w.plan_id));
  assert.ok(d.inventory.lines.some((l) => l.work_order_id === w.work_order_id && ['MAT-38', 'MAT-34'].includes(l.material_id)));
  const early = await loadSnapshot(r, '2026-03-15');
  const e = await loadAssetDetail(r, early, w.asset_id);
  assert.equal(e.work.groups.planned.rows.filter((o) => o.id === w.work_order_id).length, 0);
});
