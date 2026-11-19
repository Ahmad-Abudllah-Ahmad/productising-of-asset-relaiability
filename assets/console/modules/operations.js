// Module 03 — Field Operations Optimization.
// Turns approved defect cases into prioritised work, groups nearby repairs into one visit per corridor / outage
// window, schedules qualified crews, runs the approval chain, tracks field execution and turnaround time, keeps
// SAP PM and IBM Maximo in step, and drives the switching & isolation programme for each grouped visit.
// Every work order, tower, crew and finding here is the same record the other modules show (see network.js).

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, SEV, addDays, daysBetween, rng, clamp } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, SEV_TONE, LINE_NAME } from '../network.js';
import { drawingTabs } from '../drawings.js';
import { models } from '../models.js';
import { erp as erpHub, erpRequest } from '../erp.js';

const net = await loadNetwork();
const AS_OF = net.asOf;
const R = rng(303);

// Planning heuristics and estimates this module shows. All of them run on simulated demo data and none has been tested
// against real data, so their outputs stay labelled / Simulated in the interface (register: models.js).
const MODEL_MODULE = '03 · Field Operations';
models.register([
  { id: 'ops-visit-grouping', name: 'Visit grouping and saving estimate', module: MODEL_MODULE,
    predicts: 'Which open work orders share one visit, how long the visit takes, and the mobilisation, outage-hour and switching savings claimed for grouping',
    method: 'Greedy clustering of open orders within 8 towers on one circuit (at most 6 per visit; the featured visit is the tightest run of five on L-220-03). Saving = avoided trips × a fixed mobilisation cost + avoided outages × a fixed outage cost. Duration = labour hours ÷ (crew size × 9 h).',
    needs: 'Actual mobilisation, travel and outage costs per trip from SAP PM order settlements, and the history of grouped versus single visits.' },
  { id: 'ops-crew-schedule', name: 'Crew schedule and planned crew-day load', module: MODEL_MODULE,
    predicts: 'The crew and window of each grouped visit and the booked hours per crew-day over the next 14 days',
    method: 'First crew holding the visit’s lead skill; outage visits take the line’s next agreed window, live-line visits run on consecutive weekdays. Daily load = visit hours ÷ days ÷ half the crew size, capped at 10 h.',
    needs: 'Time confirmations and actual visit durations per crew from SAP PM (AFRU) and the field app.' },
  { id: 'ops-autolevel', name: 'Workload auto-levelling optimiser', module: MODEL_MODULE,
    predicts: 'Visit moves that flatten the 14-day crew load, and the peak-load reduction they give',
    method: 'Not implemented in the prototype: the button returns a fixed illustrative result and no optimisation is run.',
    needs: 'A real levelling algorithm, then a back-test on historical crew bookings and outage windows.' },
  { id: 'ops-workload', name: 'Labour demand and backlog burn-down projection', module: MODEL_MODULE,
    predicts: 'Labour hours per week by skill against crew capacity (8 weeks), peak load by depot, the skill gap, and the 12-week backlog burn-down with and without contractor crews',
    method: 'Labour hours of the grouped visits by start week plus a flat per-skill allowance from week 4; capacity = a fixed share of crew hours; burn-down = open hours + a constant 48 h/week inflow − capacity.',
    needs: 'Two or more years of planned versus confirmed labour hours and work-order inflow per skill from SAP PM.' },
  { id: 'ops-transfer-margin', name: 'Transfer margin during outage windows', module: MODEL_MODULE,
    predicts: 'Loading of the parallel path while each line is out of service',
    method: 'Fixed illustrative values in the prototype; in production the figures come from the EMS N-1 contingency study.',
    needs: 'EMS contingency-study results per outage window, compared with the loading measured during past outages.' },
  { id: 'ops-wr-priority', name: 'Work-request priority score (P1–P4)', module: MODEL_MODULE,
    predicts: 'Relative urgency of each verified defect that has no work order, and its P1–P4 class',
    method: 'Severity weight × tower criticality × (1 + tower risk score ÷ 400, clamped to 0.2–1.5), with fixed thresholds at 60 / 30 / 15. It inherits the risk score.',
    needs: 'Planner priority decisions and defect-to-failure history to calibrate the weights and thresholds.' },
  { id: 'ops-eta', name: 'Crew ETA', module: MODEL_MODULE,
    predicts: 'Minutes until a travelling crew reaches its next site',
    method: 'Simulated countdown from a fixed starting value per travelling crew; not computed from route, distance or traffic.',
    needs: 'AVL position history and actual arrival times per trip.' },
  { id: 'ops-switching-sim', name: 'Switching and isolation simulation', module: MODEL_MODULE,
    predicts: 'Energised or de-energised state of the line and work zone after each switching step, and the interlock refusals',
    method: 'Rule-based topology: a section is live when its switches are closed back to a busbar; interlocks are fixed rules. Device states and power flows are simulated, not read from SCADA.',
    needs: 'Live switch positions from SCADA / EMS and the substation interlocking scheme, checked against executed switching programmes.' },
]);

/* ================================================================== styles local to this module */
const css = document.createElement('style');
css.id = 'ops-css';
css.textContent = `
.ops-board { display:grid; grid-template-columns: 210px repeat(14, minmax(64px, 1fr)); border:1px solid var(--nx-line); border-radius:10px; overflow:hidden; font-size:11.5px; background:#fff; }
.ops-board > div { border-right:1px solid var(--nx-line-2); border-bottom:1px solid var(--nx-line-2); padding:6px; min-height:58px; }
.ops-board .ops-h { background:#f8fafc; font-weight:700; font-size:10.5px; color:var(--nx-muted); text-transform:uppercase; letter-spacing:.05em; min-height:0; text-align:center; }
.ops-board .ops-h.is-today { color:var(--nx-accent); background:var(--nx-accent-soft); }
.ops-board .ops-h.is-we, .ops-board .is-we { background:#fafbfd; }
.ops-board .ops-crew { position:sticky; left:0; background:#fff; z-index:1; }
.ops-board .ops-crew b { display:block; font-size:12px; }
.ops-board .ops-crew small { color:var(--nx-muted); font-size:11px; }
.ops-chip { display:block; border-radius:6px; padding:3px 6px; color:#fff; font-weight:600; font-size:10.5px; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.ops-chip.is-out { box-shadow: inset 0 0 0 2px rgba(255,255,255,.55); }
.ops-jobs { display:grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap:14px; }
.ops-job { background:#fff; border:1px solid var(--nx-line); border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:10px; cursor:pointer; box-shadow:var(--nx-shadow); transition: box-shadow .15s, border-color .15s; }
.ops-job:hover { box-shadow:0 8px 20px -10px rgba(15,23,42,.3); }
.ops-job.is-sel { border-color:#93c5fd; box-shadow:0 0 0 3px rgba(59,130,246,.18); }
.ops-job-h { display:flex; align-items:center; gap:8px; }
.ops-job-h b { font-size:13px; }
.ops-job .nx-bar { height:8px; }
.ops-steps { display:flex; gap:4px; }
.ops-steps i { flex:1; height:4px; border-radius:2px; background:#e2e8f0; }
.ops-steps i.is-done { background:#16a34a; } .ops-steps i.is-cur { background:#f59e0b; }
.ops-sw { flex:1 1 auto; display:flex; min-height:0; }
.ops-sw > .nx-hmi { flex:1 1 auto; min-width:0; }
.ops-prog { width:340px; flex:0 0 auto; background:#fff; border-left:1px solid var(--nx-line); color:var(--nx-ink-2); display:flex; flex-direction:column; min-height:0; }
.ops-prog-h { padding:14px 16px; border-bottom:1px solid var(--nx-line); }
.ops-prog-h small { font:10.5px var(--nx-mono); color:var(--nx-muted); }
.ops-prog-h h4 { margin:3px 0 0; color:var(--nx-ink); font-size:14px; }
.ops-prog-h p { margin:4px 0 0; font-size:11.5px; color:var(--nx-muted); line-height:1.45; }
.ops-prog-b { flex:1; overflow:auto; padding:10px 12px; display:flex; flex-direction:column; gap:6px; background:#f8fafc; }
.ops-step { display:grid; grid-template-columns: 26px 1fr; gap:8px; padding:8px; border-radius:9px; background:#fff; border:1px solid var(--nx-line); font-size:12px; cursor:pointer; color:var(--nx-ink); }
.ops-step:hover { border-color:#93c5fd; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
.ops-step .ops-n { width:24px; height:24px; border-radius:50%; display:grid; place-items:center; font:700 11px var(--nx-mono); background:#f1f5f9; color:var(--nx-muted); }
.ops-step.is-done { background:#f0fdf4; border-color:#bbf7d0; }
.ops-step.is-done .ops-n { background:#16a34a; color:#fff; }
.ops-step.is-next { border-color:#f59e0b; background:#fffbeb; box-shadow:0 0 0 3px rgba(245,158,11,.12); }
.ops-step.is-next .ops-n { background:#d97706; color:#fff; }
.ops-step small { display:block; color:var(--nx-muted); font:10.5px var(--nx-mono); margin-top:2px; }
.ops-prog-f { padding:12px 14px; border-top:1px solid var(--nx-line); font-size:12px; }
.ops-prog-f .nx-bar { margin:6px 0 8px; }
.ops-ok { padding:10px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#14532d; font-size:12px; line-height:1.45; }
.ops-wait { padding:10px; border-radius:8px; background:#fffbeb; border:1px solid #fde68a; color:#78350f; font-size:12px; line-height:1.45; }
.ops-ev { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.ops-ev figure { margin:0; position:relative; border-radius:10px; overflow:hidden; border:1px solid var(--nx-line); background:#0f172a; }
.ops-ev img { width:100%; height:120px; object-fit:cover; display:block; }
.ops-ev figcaption { position:absolute; left:6px; bottom:6px; background:rgba(15,23,42,.78); color:#fff; font-size:10.5px; padding:2px 7px; border-radius:6px; }
.ops-ev .ops-bbox { position:absolute; border:2px solid #f59e0b; border-radius:3px; box-shadow:0 0 0 1px rgba(0,0,0,.3); }
.ops-scroll { max-height:640px; overflow:auto; }
.ops-visits { display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }
.ops-visit { background:#fff; border:1px solid var(--nx-line); border-radius:12px; box-shadow:var(--nx-shadow); display:flex; flex-direction:column; }
.ops-visit.is-hero { border-color:#93c5fd; box-shadow:0 0 0 3px rgba(59,130,246,.14); }
.ops-visit-h { padding:12px 14px 8px; display:flex; gap:10px; align-items:flex-start; }
.ops-visit-h b { font-size:13.5px; display:block; }
.ops-visit-h span { font-size:11.5px; color:var(--nx-muted); }
.ops-visit ul { list-style:none; margin:0; padding:0 14px; }
.ops-visit li { display:flex; gap:8px; align-items:center; padding:6px 0; border-top:1px dashed var(--nx-line-2); font-size:12px; cursor:pointer; }
.ops-visit li:hover { color:var(--nx-accent); }
.ops-visit li i { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
.ops-visit li em { margin-left:auto; font-style:normal; color:var(--nx-muted); font-variant-numeric:tabular-nums; }
.ops-visit-f { margin-top:auto; padding:10px 14px; border-top:1px solid var(--nx-line-2); display:flex; gap:14px; font-size:11.5px; color:var(--nx-muted); background:#fbfcfe; border-radius:0 0 12px 12px; }
.ops-visit-f b { color:var(--nx-ink); font-variant-numeric:tabular-nums; }
.ops-lanes { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:14px; }
.ops-lane { background:#fff; border:1px solid var(--nx-line); border-radius:12px; padding:14px; box-shadow:var(--nx-shadow); display:flex; flex-direction:column; gap:10px; }
.ops-lane-h { display:flex; align-items:center; gap:10px; }
.ops-lane-h i { width:12px; height:12px; border-radius:3px; }
.ops-lane-h b { font-size:13.5px; }
.ops-phone-li { display:flex; gap:9px; align-items:flex-start; padding:9px 12px; border-bottom:1px solid #eef2f6; font-size:12px; background:#fff; }
.ops-phone-li .ops-tick { width:18px; height:18px; border-radius:50%; border:2px solid #cbd5e1; flex:0 0 auto; display:grid; place-items:center; margin-top:1px; }
.ops-phone-li.is-done .ops-tick { background:#16a34a; border-color:#16a34a; color:#fff; }
.ops-phone-li.is-cur .ops-tick { border-color:#f59e0b; }
.ops-phone-li small { display:block; color:#94a3b8; font-size:10.5px; }
.ops-syncsys { display:flex; align-items:center; gap:12px; padding:14px; border-radius:12px; border:1px solid var(--nx-line); background:#fff; }
.ops-syncsys .ops-logo { width:44px; height:44px; border-radius:10px; display:grid; place-items:center; font:800 13px var(--nx-font); color:#fff; flex:0 0 auto; }
.ops-arrow { display:flex; flex-direction:column; align-items:center; gap:2px; color:var(--nx-muted); font-size:10.5px; }
.ops-arrow svg { width:22px; height:22px; color:var(--nx-accent); }
`;
document.head.appendChild(css);

/* ================================================================== derived operations data */
const STAGES = ['requested', 'approved', 'planned', 'scheduled', 'in_progress', 'completed'];
const STAGE_LABEL = { requested: 'Requested', approved: 'Approved', planned: 'Planned', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed' };
const STAGE_COLOR = { requested: '#94a3b8', approved: '#0ea5e9', planned: '#6366f1', scheduled: '#8b5cf6', in_progress: '#f59e0b', completed: '#16a34a' };
const STAGE_TONE = { requested: 'muted', approved: 'info', planned: 'accent', scheduled: 'violet', in_progress: 'warn', completed: 'ok' };
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRI_TONE = { high: 'crit', medium: 'warn', low: 'muted' };
const CORR_COLOR = { North: '#3b82f6', Coastal: '#14b8a6', Inland: '#a855f7', Substation: '#0f172a' };
const SKILL_LABEL = { 'live-line': 'Live-line', structures: 'Structures', conductor: 'Conductor', insulators: 'Insulators', civil: 'Civil', vegetation: 'Vegetation', substation: 'Substation HV' };

const WO = net.workOrders;
// Conductor, span and corridor-segment orders carry no tower in the shared model: resolve them to the span's
// start tower (or the tower of their source finding) so every order sits on the map and in a corridor.
const CORR_OF = { 'L-132-01': 'Coastal', 'L-220-03': 'North', 'L-500-01': 'Inland' };
for (const w of WO) {
  if (w.towerId) continue;
  let tid = w.findings.find((f) => f.tower_id)?.tower_id;
  if (!tid) {
    let a = net.byId.get(w.asset_id);
    for (let i = 0; i < 3 && a && !tid; i += 1) { if (a.ext?.from_tower) tid = a.ext.from_tower; a = net.byId.get(a.parent_id); }
  }
  const t = tid ? net.towerById.get(tid) : null;
  if (!t) continue;
  Object.assign(w, { towerId: t.id, towerName: w.towerName || `${t.name}`, line: t.line, kv: t.kv, corridor: CORR_OF[t.line], lat: t.lat, lng: t.lng });
}
const woById = new Map(WO.map((w) => [w.id, w]));
const crewById = new Map(net.crews.map((c) => [c.id, c]));
const towerIdx = (w) => net.towerById.get(w.towerId)?.idx ?? 0;
const openWO = WO.filter((w) => w.stage !== 'completed');
const doneWO = WO.filter((w) => w.stage === 'completed');
const age = (w) => daysBetween(w.created_at, AS_OF);
const overdue = (w) => w.stage !== 'completed' && w.planned_date && w.planned_date < AS_OF;
const sevBadge = (s) => ui.badge(fmt.title(s), SEV_TONE[s]);
const stageBadge = (s) => ui.badge(STAGE_LABEL[s] || s, STAGE_TONE[s]);
const lineShort = (id) => (id ? `${id} · ${({ 'L-132-01': 'Coastal', 'L-220-03': 'North', 'L-500-01': 'Inland' })[id]}` : 'Substation');
const firstFindingDate = (w) => w.findings.map((f) => f.date).sort()[0] || w.created_at;

// Outage windows agreed with the control centre (the next six weeks). 2026-11-11 is a Wednesday.
const WINDOWS = {
  'L-220-03': ['2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12'],
  'L-132-01': ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13'],
  'L-500-01': ['2026-11-22', '2026-12-06', '2026-12-20'],
  sub: ['2026-11-17', '2026-12-01', '2026-12-15'],
};
const MOB_COST = 2850; // crew mobilisation per trip: vehicles, travel, set-up
const OUTAGE_COST = 1900; // switching operations + constrained transfer per outage

// Group nearby open repairs into visits. The Corridor North group is the tightest five tasks on L-220-03.
function buildVisits() {
  const visits = [];
  const used = new Set();
  const n220 = openWO.filter((w) => w.line === 'L-220-03' && w.towerId).sort((a, b) => towerIdx(a) - towerIdx(b));
  let best = null;
  for (let i = 0; i + 5 <= n220.length; i += 1) { const win = n220.slice(i, i + 5); const span = towerIdx(win[4]) - towerIdx(win[0]) + (win.some((w) => w.outage) ? 0 : 1000); if (!best || span < best.span) best = { i, span }; }
  const hero = best ? n220.slice(best.i, best.i + 5) : n220.slice(0, 5);
  hero.forEach((w) => used.add(w.id));
  const letter = { 'L-220-03': 'N', 'L-132-01': 'C', 'L-500-01': 'I' };
  const counters = {};
  const mk = (line, wos, isHero) => {
    const key = line || 'sub';
    counters[key] = (counters[key] || 0) + 1;
    const hours = wos.reduce((a, w) => a + w.labourH, 0);
    const cost = wos.reduce((a, w) => a + w.estCost, 0);
    const outage = wos.some((w) => w.outage);
    const ts = wos.map((w) => net.towerById.get(w.towerId)).filter(Boolean).sort((a, b) => a.idx - b.idx);
    const skills = {}; wos.forEach((w) => { skills[w.skill] = (skills[w.skill] || 0) + w.labourH; });
    const lead = Object.entries(skills).sort((a, b) => b[1] - a[1])[0][0];
    const crew = net.crews.find((c) => c.skill === lead) || net.crews[0];
    const days = clamp(Math.ceil(hours / (crew.size * 9)), 1, 4);
    const spacing = { 'L-132-01': 0.3, 'L-220-03': 0.38, 'L-500-01': 0.45 }[line] || 0;
    const sev = wos.reduce((m, w) => Math.min(m, SEV_ORDER[w.severity]), 3);
    return {
      id: `VIS-${letter[line] || 'S'}-${String(counters[key]).padStart(2, '0')}`, line, corridor: line ? wos[0].corridor : 'Substation', wos, hero: !!isHero, hours, cost, outage, crew, days,
      from: ts[0]?.name || wos[0].towerName, to: ts[ts.length - 1]?.name || wos[0].towerName, spanKm: ts.length > 1 ? +((ts[ts.length - 1].idx - ts[0].idx) * spacing).toFixed(1) : 0,
      saving: (wos.length - 1) * MOB_COST + (outage ? Math.max(0, wos.filter((w) => w.outage).length - 1) * OUTAGE_COST : 0),
      severity: ['critical', 'high', 'medium', 'low'][sev], lat: ts.length ? ts.reduce((a, t) => a + t.lat, 0) / ts.length : wos[0].lat, lng: ts.length ? ts.reduce((a, t) => a + t.lng, 0) / ts.length : wos[0].lng,
    };
  };
  if (hero.length) visits.push(mk('L-220-03', hero, true));
  for (const l of net.lines) {
    const ws = openWO.filter((w) => w.line === l.id && w.towerId && !used.has(w.id)).sort((a, b) => towerIdx(a) - towerIdx(b));
    let g = [];
    for (const w of ws) { if (g.length && (towerIdx(w) - towerIdx(g[0]) > 8 || g.length >= 6)) { visits.push(mk(l.id, g)); g = []; } g.push(w); }
    if (g.length) visits.push(mk(l.id, g));
  }
  const subs = openWO.filter((w) => !w.line || !w.towerId).filter((w) => !used.has(w.id));
  if (subs.length) visits.push(mk(null, subs));
  // windows: outage visits take the line's next free window, live-line visits run on weekdays
  const nextW = {}; let wd = 1;
  for (const v of visits.sort((a, b) => (b.hero - a.hero) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity])) {
    const key = v.line || 'sub';
    if (v.outage) { const list = WINDOWS[key]; const k = nextW[key] || 0; v.start = list[Math.min(k, list.length - 1)]; nextW[key] = k + 1; v.window = `${fmt.short(v.start)} · 06:00–18:00 outage`; } else {
      let d = addDays(AS_OF, wd); while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
      v.start = d; wd += v.days; v.window = `${fmt.short(d)} · live-line / no outage`;
    }
    v.end = addDays(v.start, v.days);
  }
  return visits;
}
const visits = buildVisits();
const heroVisit = visits.find((v) => v.hero);
const visitOf = new Map(); visits.forEach((v) => v.wos.forEach((w) => visitOf.set(w.id, v)));

// Confirmed defect cases with no work order yet → candidate work requests, prioritised.
const inWO = new Set(WO.flatMap((w) => w.finding_ids || []));
const closed = new Set(net.repairs.flatMap((r) => r.closes_finding_ids || []));
const SEV_W = { critical: 10, high: 6, medium: 3, low: 1 };
const requests = net.findings.filter((f) => f.review_status === 'confirmed' && !inWO.has(f.finding_id) && !closed.has(f.finding_id) && f.condition_score <= 3).map((f) => {
  const t = f.tower_id ? net.towerById.get(f.tower_id) : null;
  const crit = t?.criticality || 3;
  const riskN = t?.risk != null ? clamp(t.risk / 400, 0.2, 1.5) : 0.6;
  const score = Math.round(SEV_W[f.severity] * crit * (1 + riskN) * 10) / 10;
  return { ...f, tower: t, crit, score, pri: score >= 60 ? 'P1' : score >= 30 ? 'P2' : score >= 15 ? 'P3' : 'P4' };
}).sort((a, b) => b.score - a.score);
// finding id → ERP reference of the work-order request sent for it. The ERP creates and owns the order; this
// workspace keeps only the reference of the request it sent.
const converted = new Map();

// SAP PM holds line assets; IBM Maximo holds substation plant. Both stay the system of record: orders are read in
// through the integration hub, and only requests and status / scheduling updates go back.
const sysOf = (w) => (w.line ? 'SAP PM' : 'IBM Maximo');
const erpSystem = (line) => (line ? 'SAP PM' : 'IBM Maximo');
/** Send a request or a status for a work order to the system that owns it. quiet = no toast (the caller reports). */
function sendToErp(line, what, payload, quiet = false) {
  const opts = { system: erpSystem(line) };
  return quiet ? erpHub.request('workOrders', what, payload, opts) : erpRequest('workOrders', what, payload, opts);
}
/** Ask the ERP to create a work order for a verified defect. Returns the ERP reference of the request. */
function requestWorkOrder(f, quiet = false) {
  if (converted.has(f.finding_id)) { if (!quiet) toast(`${f.finding_id} is already requested in ${erpSystem(f.line)} as ${converted.get(f.finding_id)}`, 'warn'); return converted.get(f.finding_id); }
  const r = sendToErp(f.line, `Work-order request · ${f.finding_id} ${f.label}`, { finding: f.finding_id, asset: f.tower_id || f.asset_id, defect: f.defect_class, priority: f.pri }, quiet);
  converted.set(f.finding_id, r.ref);
  return r.ref;
}
const syncLog = (() => {
  const out = []; const fields = ['status', 'planned date', 'crew', 'priority', 'labour hours', 'materials', 'long text', 'functional location'];
  let t = Date.parse(`${AS_OF}T16:42:00Z`);
  for (let i = 0; i < 34; i += 1) {
    const w = WO[(i * 11 + 5) % WO.length]; t -= (3 + R() * 22) * 60000;
    // outbound = status / scheduling write-back only (status, planned date, crew); every other field is only read from the ERP
    const dir = R() > 0.45 && i % fields.length < 3 ? 'out' : 'in';
    const st = w.sync === 'conflict' && i % 3 === 0 ? 'conflict' : R() > 0.94 ? 'retry' : 'ok';
    out.push({ id: `MSG-${88412 - i * 3}`, time: new Date(t).toISOString().slice(11, 16), date: new Date(t).toISOString().slice(0, 10), wo: w, sys: sysOf(w), dir, field: fields[i % fields.length], st, ms: Math.round(380 + R() * 1400) });
  }
  return out;
})();

// Crew schedule for the next 14 days: grouped visits plus jobs already in progress.
const DAYS = Array.from({ length: 14 }, (_, i) => addDays(AS_OF, i));
const schedule = new Map(net.crews.map((c) => [c.id, DAYS.map(() => [])]));
for (const w of WO.filter((x) => x.stage === 'in_progress')) { const row = schedule.get(w.crew); for (let d = 0; d < 2; d += 1) row[d].push({ kind: 'job', w, hours: 9 }); }
for (const v of visits) {
  const row = schedule.get(v.crew.id);
  const i0 = daysBetween(AS_OF, v.start);
  for (let d = 0; d < v.days; d += 1) { const i = i0 + d; if (i >= 0 && i < 14) row[i].push({ kind: 'visit', v, hours: Math.min(10, v.hours / v.days / Math.max(1, v.crew.size / 2)) }); }
}
const crewHours = (cid, i) => schedule.get(cid)[i].reduce((a, x) => a + x.hours, 0);

/* ================================================================== live tags */
live.define('OPS.UTIL', { base: 81, noise: 0.5, rev: 0.1, min: 50, max: 99, dec: 0, unit: '%', desc: 'Field crew utilisation' });
live.define('OPS.SYNC.LAT', { base: 1.6, noise: 0.15, rev: 0.2, min: 0.4, dec: 1, unit: 's', h: 5, desc: 'SAP PM / Maximo round-trip latency' });
live.define('OPS.SYNC.Q', { base: WO.filter((w) => w.sync === 'pending').length, noise: 0.5, rev: 0.2, min: 0, dec: 0, unit: 'msgs', desc: 'Integration queue depth' });
live.define('SITE.WIND', { base: 6.4, noise: 0.45, rev: 0.07, min: 0, dec: 1, unit: 'm/s', h: 10, hh: 12, desc: `Work-site wind speed (${heroVisit?.from || 'site'} anemometer)` });
live.define('SITE.TEMP', { base: 14.2, noise: 0.05, rev: 0.03, dec: 1, unit: '°C', desc: 'Work-site ambient temperature' });
const inProg = WO.filter((w) => w.stage === 'in_progress');
inProg.forEach((w, i) => {
  const p0 = 18 + ((i * 37) % 62);
  live.define(`JOB.${w.id}.PCT`, { fn: (n) => clamp(p0 + Math.max(0, n) * 0.035, 0, 99), dec: 0, unit: '%', desc: `${w.id} progress` });
  live.define(`JOB.${w.id}.HRS`, { fn: (n) => (w.labourH * clamp(p0 + Math.max(0, n) * 0.035, 0, 99)) / 100, dec: 1, unit: 'h', desc: `${w.id} labour booked` });
});
net.crews.forEach((c, i) => {
  const eta0 = c.status === 'travelling' ? 24 + i * 6 : 0;
  live.define(`CREW.${c.id}.ETA`, { fn: (n) => (eta0 ? Math.max(2, eta0 - (Math.max(0, n) % 900) * 0.04) : 0), dec: 0, unit: 'min', desc: `${c.id} ETA` });
  live.define(`CREW.${c.id}.SPD`, { base: c.status === 'travelling' ? 54 : 0, noise: c.status === 'travelling' ? 4 : 0, rev: 0.2, min: 0, dec: 0, unit: 'km/h', desc: `${c.id} vehicle speed` });
});
live.define('OPS.ACTIVE', { fn: () => inProg.filter((w) => live.get(`JOB.${w.id}.PCT`) < 99).length, dec: 0, desc: 'Jobs active' });

/* ================================================================== drawers */
const reliabilityLink = (towerId) => (towerId ? `/reliability#asset=${encodeURIComponent(towerId)}` : '/reliability');

function woTimeline(w) {
  const f = firstFindingDate(w);
  const items = [
    { when: fmt.date(f), title: 'Defect confirmed by engineering review', text: w.findings.map((x) => `${esc(x.finding_id)} ${esc(x.label)}`).join(' · ') || 'Inspection finding', tone: 'crit' },
    { when: fmt.date(w.created_at), title: `Order created in ${sysOf(w)} → ${esc(w.sap)}`, text: `Priority ${esc(w.priority)} · est. ${fmt.money(w.estCost)}`, tone: 'info' },
    { when: fmt.date(w.planned_date), title: 'Planned in maintenance plan', text: visitOf.get(w.id) ? `Grouped into ${esc(visitOf.get(w.id).id)} · ${esc(visitOf.get(w.id).window)}` : 'Stand-alone task', tone: 'muted' },
  ];
  if (w.stage === 'in_progress') items.push({ when: 'Today', title: `On site — ${esc(w.crewName)}`, text: 'Permit active · job progress reported from the field app', tone: 'warn' });
  if (w.completed_at) items.push({ when: fmt.date(w.completed_at), title: 'Completed and closed in field app', text: `Turnaround ${w.ttrDays} days from defect confirmation`, tone: 'ok' });
  return ui.timeline(items);
}
const EVIDENCE = ['/assets/custom/power-line-inspection.jpg', '/assets/custom/hero-drone-inspection.jpg', '/assets/custom/wind-power-inspection.jpg'];
const evImg = (f, i = 0) => {
  const src = f.sensor === 'thermal' ? '/assets/custom/thermal-power-plant.jpg' : EVIDENCE[(Number(String(f.finding_id).replace(/\D/g, '')) + i) % EVIDENCE.length];
  const b = f.bbox || { x: 0.4, y: 0.4, w: 0.15, h: 0.15 };
  return `<figure><img src="${src}" alt="${esc(f.label)} evidence" loading="lazy"/><span class="ops-bbox" style="left:${(b.x * 100).toFixed(1)}%;top:${(b.y * 100).toFixed(1)}%;width:${Math.max(6, b.w * 100).toFixed(1)}%;height:${Math.max(8, b.h * 100).toFixed(1)}%"></span><figcaption>${esc(f.finding_id)} · ${esc(f.sensor.toUpperCase())} · ${Math.round(f.confidence * 100)}%</figcaption></figure>`;
};
const sec = (title, body) => `<div class="nx-sec"><h4>${esc(title)}</h4>${body}</div>`;
function costBuild(w) {
  const lab = Math.round(w.labourH * ({ 'live-line': 92, structures: 74, conductor: 81, insulators: 78, civil: 58, vegetation: 46, substation: 96 }[w.skill] || 75));
  const mat = w.materials; const eqp = Math.max(0, Math.round(w.estCost - lab - mat));
  return { lab, mat, eqp: Math.max(eqp, Math.round(w.estCost * 0.12)) };
}
function showWO(id) {
  const w = woById.get(id); if (!w) return;
  const v = visitOf.get(w.id);
  const permit = net.permits.find((p) => p.wo === w.id);
  const tw = net.towerById.get(w.towerId);
  const cb = costBuild(w);
  const siblings = WO.filter((x) => x.id !== w.id && (x.towerId === w.towerId || (v && visitOf.get(x.id) === v)));
  const overview = `${ui.stats([{ label: 'Estimate', value: fmt.money(w.estCost) }, { label: 'Labour', value: `${w.labourH} h` }, { label: 'Materials', value: fmt.money(w.materials) }, { label: 'Age', value: `${age(w)} d` }, { label: 'Tower HI', value: tw?.hi != null ? fmt.n(tw.hi, 0) : '—' }])}
    <div class="nx-drawer-grid">${sec('Assignment', ui.kv([['Asset', esc(w.asset)], ['Tower', esc(w.towerName || '—')], ['Line / corridor', esc(lineShort(w.line))], ['Crew', `${esc(w.crew)} · ${esc(SKILL_LABEL[w.skill])}`], ['Planned', `${fmt.date(w.planned_date)}${overdue(w) ? ` <span style="color:#b91c1c">(${daysBetween(w.planned_date, AS_OF)} d late)</span>` : ''}`], ['Visit', v ? `${esc(v.id)}` : 'Stand-alone'], ['Permit', permit ? `${esc(permit.id)} · ${esc(permit.state)}` : '—']]))}
    ${sec('Cost build-up', `<div class="nx-chart" style="height:190px" data-chart="wo-cost"></div>`)}</div>
    ${sec('Lifecycle', woTimeline(w))}`;
  const defects = `${w.findings.length ? `<div class="ops-ev">${w.findings.slice(0, 4).map((f, i) => evImg(f, i)).join('')}</div>` : ''}
    ${sec('Source defects', `<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: `${f.finding_id} · ${f.label}`, sub: `${fmt.date(f.date)} · ${f.sensor.toUpperCase()} · confidence ${Math.round(f.confidence * 100)}% · ${f.review_status} by ${esc(f.confirmed_by || '—')}`, end: sevBadge(f.severity) })).join('') || ui.empty('No linked findings')}</div>`)}
    ${tw ? sec(`Tower ${tw.name} condition`, `<div class="nx-chart" style="height:180px" data-chart="wo-grp"></div><div class="nx-note">Component-group scores (5 = as new). Risk ${tw.risk != null ? `${fmt.n(tw.risk, 0)} ${ui.exp('Experimental')}` : '—'} · ${esc(tw.type || '')} · zone ${esc(tw.zone || '—')}</div>`) : ''}`;
  const erp = `<div class="nx-note" style="margin-bottom:10px">${ui.erp(sysOf(w), 'workOrders')} ${w.line ? esc(erpHub.syncedText('workOrders')) : 'IBM Maximo · read through the integration hub'}. The order is created and owned there; this workspace reads it and sends back only status and requests.</div>
    <div class="nx-drawer-grid">${sec('SAP PM', ui.kv([['Order (AUFNR)', `<span class="nx-mono">${esc(w.sap)}</span>`], ['Order type', w.line ? 'PM02 — corrective' : '—'], ['Functional location', `<span class="nx-mono">${esc(w.line ? `AZ-TL-${w.line.slice(2)}-${(w.towerName || '').replace('T-', '')}` : '—')}</span>`], ['Planner group', 'P-North']]))}
    ${sec('IBM Maximo', ui.kv([['Work order', `<span class="nx-mono">${esc(w.maximo)}</span>`], ['Asset', `<span class="nx-mono">${esc(w.asset)}</span>`], ['Status', esc(STAGE_LABEL[w.stage].toUpperCase())], ['Site', w.line ? 'TRANS' : 'SUBS']]))}</div>
    ${sec('Synchronisation', `${ui.kv([['System of record', sysOf(w)], ['Sync state', ui.badge(w.sync, w.sync === 'synced' ? 'ok' : w.sync === 'pending' ? 'warn' : 'crit')], ['Last change', syncLog.find((m) => m.wo.id === w.id) ? `${syncLog.find((m) => m.wo.id === w.id).time} · ${esc(syncLog.find((m) => m.wo.id === w.id).field)}` : 'Created · 08:12']])}`)}
    ${sec('Sync history', ui.timeline([...syncLog.filter((m) => m.wo.id === w.id).slice(0, 3).map((m) => ({ when: `Today ${m.time}`, title: `${m.dir === 'out' ? `NEXUS → ${m.sys}` : `${m.sys} → NEXUS`} · ${m.field}`, text: `${m.id} · round trip ${fmt.n(m.ms)} ms`, tone: m.st === 'ok' ? 'ok' : m.st === 'retry' ? 'warn' : 'crit' })), ...(w.stage !== 'requested' ? [{ when: fmt.date(addDays(w.created_at, 2)), title: `Status ${STAGE_LABEL[w.stage].toUpperCase()} sent to ${sysOf(w)}`, text: 'Acknowledged by the ERP adapter', tone: 'ok' }] : []), { when: fmt.date(w.created_at), title: `Order created in ${sysOf(w)}`, text: `${w.line ? `Notification M2 → order ${w.sap}` : `Maximo WO ${w.maximo}`} from defect ${w.findings[0]?.finding_id || ''}`, tone: 'info' }]))}
    ${sec(`Related work (${siblings.length})`, `<div class="nx-list">${siblings.slice(0, 6).map((x) => ui.li({ ic: 'clipboard', color: SEV[x.severity], title: `${x.id} · ${fmt.title(x.work_type)}`, sub: `${esc(x.towerName || x.asset)} · ${STAGE_LABEL[x.stage]}`, end: stageBadge(x.stage), row: x.id })).join('') || ui.empty('No other work on this tower or visit')}</div>`)}`;
  drawer.open({
    icon: 'clipboard', kicker: `Work order · ${sysOf(w)} ${w.line ? w.sap : w.maximo}`, title: `${w.id} · ${fmt.title(w.work_type)}`,
    sub: `${esc(w.towerName || w.asset)} · ${esc(lineShort(w.line))}`,
    badges: [[STAGE_LABEL[w.stage], STAGE_TONE[w.stage]], [fmt.title(w.severity), SEV_TONE[w.severity]], [`Priority ${w.priority}`, PRI_TONE[w.priority]], ...(overdue(w) ? [[`Overdue ${daysBetween(w.planned_date, AS_OF)} d`, 'crit']] : []), [w.outage ? 'Needs outage' : 'Live-line', w.outage ? 'violet' : 'info'], [`ERP · ${sysOf(w)}`, 'info']],
    tabs: [
      { name: 'Overview', body: overview, mount: (el, c) => c.chart('[data-chart="wo-cost"]', { ...ch.donut({ data: [{ name: 'Labour', value: cb.lab, color: '#2563eb' }, { name: 'Materials', value: cb.mat, color: '#f59e0b' }, { name: 'Equipment & travel', value: cb.eqp, color: '#14b8a6' }], center: 'estimate', value: fmt.money(w.estCost), legend: 'right' }), tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/><b>${fmt.money(p.value)}</b> (${p.percent}%)` } }) },
      { name: `Defects & evidence (${w.findings.length})`, body: defects, mount: (el, c) => { if (tw) { const g = tw.hiGroups; c.chart('[data-chart="wo-grp"]', { ...ch.bar({ x: g.map((x) => fmt.title(x.group)), series: [{ name: 'Score', data: g.map((x) => ({ value: +x.score.toFixed(1), itemStyle: { color: x.score <= 2 ? '#dc2626' : x.score <= 3 ? '#d97706' : '#16a34a', borderRadius: [0, 4, 4, 0] } })) }], horizontal: true, max: 5, legend: false, grid: { left: 4, top: 4 } }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}<br/>Score <b>${ps[0].value} / 5</b>` } }); } } },
      { name: 'ERP & related', body: erp, mount: (el, c) => c.on('click', '[data-row]', (e, r) => showWO(r.dataset.row)) },
    ],
    actions: [
      { label: 'Asset 360', icon: 'tower', onClick: () => { location.href = reliabilityLink(w.towerId); } },
      { label: `Send status to ${sysOf(w)}`, icon: 'sync', onClick: () => sendToErp(w.line, `Status update · ${w.id} ${STAGE_LABEL[w.stage]} (order ${w.line ? w.sap : w.maximo})`, { order: w.line ? w.sap : w.maximo, status: w.stage }) },
      { label: w.stage === 'in_progress' ? 'Message crew' : 'Assign crew', primary: true, icon: 'users', onClick: (close) => { toast(`${w.crewName} notified on the field app for ${w.id}`); close(); } },
    ],
  });
}
function openCrew(id) {
  const c = crewById.get(id); if (!c) return;
  const members = net.people.filter((p) => p.crew === c.id);
  const jobs = WO.filter((w) => w.crew === c.id && w.stage !== 'completed');
  const done = WO.filter((w) => w.crew === c.id && w.stage === 'completed');
  const certAttn = members.filter((p) => p.certs.some((x) => x.state !== 'valid')).length;
  const days = DAYS.map((d, i) => +Math.min(12, crewHours(c.id, i)).toFixed(1));
  drawer.open({
    icon: 'users', kicker: `Crew · ${SKILL_LABEL[c.skill]}`, title: `${c.id} · ${c.name}`, sub: `${esc(c.lead)} · based at ${esc(c.baseName)} · ${esc(c.vehicle)}`,
    badges: [[c.status, c.status === 'on site' ? 'warn' : c.status === 'travelling' ? 'info' : 'ok'], [`${c.size} people`, 'muted'], [`Utilisation ${c.utilisation}%`, c.utilisation > 88 ? 'high' : 'accent'], [certAttn ? `${certAttn} cert. to renew` : 'All certs valid', certAttn ? 'warn' : 'ok']],
    tabs: [
      { name: 'Overview', body: `${ui.stats([{ label: 'ETA min', value: '—', live: `CREW.${c.id}.ETA` }, { label: 'Speed km/h', value: '—', live: `CREW.${c.id}.SPD` }, { label: 'Hours this week', value: c.hoursWeek }, { label: 'Open jobs', value: jobs.length }, { label: 'Closed (YTD)', value: done.length }])}
        ${sec('Booked hours, next 14 days', `<div class="nx-note" style="margin-bottom:6px">${ui.exp('Experimental')} Bookings follow the grouped-visit schedule and the ETA is a travel-time estimate. Neither is tested against real data.</div><div class="nx-chart" style="height:180px" data-chart="cr-days"></div>`)}
        <div class="nx-drawer-grid">${sec('Current job', c.job ? ui.kv([['Work order', esc(c.job)], ['Asset', esc(woById.get(c.job)?.towerName || '')], ['Progress', `<b data-live="JOB.${esc(c.job)}.PCT">—</b> %`], ['Permit', esc(net.permits.find((p) => p.wo === c.job)?.id || 'LLW')]]) : ui.empty(c.status === 'travelling' ? 'En route to next site' : `Available at ${c.baseName}`))}
        ${sec('Vehicle & kit', ui.kv([['Vehicle', esc(c.vehicle.split(' · ')[0])], ['Registration', `<span class="nx-mono">${esc(c.vehicle.split(' · ')[1] || '—')}</span>`], ['Telematics', 'AVL · 1.5 s'], ['Base', esc(c.baseName)]]))}</div>` ,
        mount: (el, cx) => cx.chart('[data-chart="cr-days"]', { ...ch.bar({ x: DAYS.map(fmt.short), series: [{ name: 'Booked h', data: days.map((h) => ({ value: h, itemStyle: { color: h > 10 ? '#dc2626' : h > 0 ? '#2563eb' : '#cbd5e1', borderRadius: [4, 4, 0, 0] } })) }], legend: false, yName: 'h' }), tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].name}<br/><b>${ps[0].value} h</b> booked of 10 h field day` } }) },
      { name: `Members (${members.length})`, body: `<div class="nx-list">${members.map((p) => ui.li({ ic: 'hardhat', title: `${p.name} · ${p.role}`, sub: `${p.years} y service · ${p.certs.map((x) => x.id).join(' · ') || 'No HV authorisation required'}`, end: p.certs.some((x) => x.state === 'expired') ? ui.badge('Cert expired', 'crit') : p.certs.some((x) => x.state === 'expiring') ? ui.badge('Expiring', 'warn') : ui.badge('Valid', 'ok') })).join('')}</div>` },
      { name: `Work (${jobs.length})`, body: `<div class="nx-list">${jobs.map((w) => ui.li({ ic: 'clipboard', color: SEV[w.severity], title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${STAGE_LABEL[w.stage]} · ${fmt.date(w.planned_date)}`, end: sevBadge(w.severity), row: w.id })).join('') || ui.empty('No open work')}</div>`, mount: (el, cx) => cx.on('click', '[data-row]', (e, r) => showWO(r.dataset.row)) },
    ],
    actions: [{ label: 'Call crew lead', icon: 'phone', onClick: () => toast(`Calling ${c.lead} on the PTT radio channel`) }, { label: 'Dispatch next job', primary: true, icon: 'truck', onClick: (close) => { toast(`${c.id} dispatched — route sent to vehicle tablet`); close(); } }],
  });
}
function openVisit(v) {
  const sep = v.wos.length * MOB_COST + (v.outage ? v.wos.filter((w) => w.outage).length * OUTAGE_COST : 0);
  const grp = MOB_COST + (v.outage ? OUTAGE_COST : 0);
  drawer.open({
    icon: 'layers', kicker: `Grouped visit · ${v.outage ? 'outage window' : 'live-line'}`, title: `${v.id} · ${v.corridor === 'Substation' ? 'Substation plant' : `Corridor ${v.corridor}`}`, wide: true,
    sub: `${v.wos.length} tasks · ${esc(v.from)} → ${esc(v.to)} · ${esc(v.window)}`,
    badges: [[fmt.title(v.severity), SEV_TONE[v.severity]], [v.outage ? 'Outage required' : 'Live-line', v.outage ? 'violet' : 'info'], [`Crew ${v.crew.id}`, 'accent'], ...(v.hero ? [['Featured visit', 'ok']] : []), ['Experimental', 'warn']],
    tabs: [
      { name: 'Plan', body: `${v.hero ? ui.callout(`<b>${v.wos.length} maintenance tasks grouped into one planned inspection-and-repair visit along Corridor ${esc(v.corridor)}.</b> One mobilisation, one switching programme and one permit instead of ${v.wos.length}.`, 'ok', 'checkCircle') : ''}
        ${ui.stats([{ label: 'Tasks', value: v.wos.length }, { label: 'Labour', value: `${fmt.n(v.hours)} h` }, { label: 'Duration', value: `${v.days} d` }, { label: 'Estimate', value: fmt.money(v.cost) }, { label: 'Est. saving', value: fmt.money(v.saving), color: '#15803d' }, { label: 'Section', value: `${v.spanKm} km` }])}
        ${ui.table({ cols: [{ key: 'id', label: 'WO', render: (w) => `<b>${esc(w.id)}</b>` }, { key: 'work_type', label: 'Task', render: (w) => fmt.title(w.work_type) }, { key: 'towerName', label: 'Tower', sort: (w) => towerIdx(w) }, { key: 'severity', label: 'Severity', render: (w) => sevBadge(w.severity), sort: (w) => SEV_ORDER[w.severity] }, { key: 'labourH', label: 'Hours', align: 'r' }, { key: 'estCost', label: 'Estimate', align: 'r', render: (w) => fmt.money(w.estCost) }, { key: 'outage', label: 'Method', render: (w) => (w.outage ? ui.badge('Outage', 'violet', { dot: false }) : ui.badge('Live-line', 'info', { dot: false })) }], rows: v.wos, rowId: (w) => w.id })}`,
        mount: (el, c) => c.on('click', 'tr[data-row]', (e, r) => showWO(r.dataset.row)) },
      { name: 'Cost & savings', body: `<div class="nx-drawer-grid">${sec('Separate trips vs one visit', '<div class="nx-chart" style="height:220px" data-chart="vi-sv"></div>')}${sec('Labour by task', '<div class="nx-chart" style="height:220px" data-chart="vi-lab"></div>')}</div>${sec('How the saving is built', ui.kv([['Mobilisations avoided', `${v.wos.length - 1} × ${fmt.money(MOB_COST)}`], ['Outages avoided', v.outage ? `${Math.max(0, v.wos.filter((w) => w.outage).length - 1)} × ${fmt.money(OUTAGE_COST)}` : 'None — live-line'], ['Estimated saving', `<b style="color:#15803d">${fmt.money(v.saving)}</b> ${ui.exp('Experimental')}`]]))}`,
        mount: (el, c) => { c.chart('[data-chart="vi-sv"]', { ...ch.bar({ x: ['Separate trips', 'Grouped visit'], series: [{ name: 'Overhead', data: [{ value: sep, itemStyle: { color: '#cbd5e1' } }, { value: grp, itemStyle: { color: '#2563eb' } }] }], labels: true, legend: false }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}<br/>Mobilisation + outage overhead <b>${fmt.money(ps[0].value)}</b>` } }); c.chart('[data-chart="vi-lab"]', { ...ch.bar({ x: v.wos.map((w) => w.id), series: [{ name: 'Labour h', data: v.wos.map((w) => ({ value: w.labourH, itemStyle: { color: SEV[w.severity], borderRadius: [4, 4, 0, 0] } })) }], legend: false, yName: 'h' }), tooltip: { trigger: 'axis', formatter: (ps) => { const w = v.wos[ps[0].dataIndex]; return `<b>${w.id}</b> · ${fmt.title(w.work_type)}<br/>${w.labourH} labour-hours · ${fmt.money(w.estCost)}`; } } }); } },
      { name: 'Isolation & permits', body: `${sec('Visit plan', ui.kv([['Crew', `${esc(v.crew.id)} · ${esc(v.crew.name)}`], ['Window', esc(v.window)], ['Mobilise from', esc(v.crew.baseName)], ['Isolation', v.outage ? `${esc(v.line || 'Bay')} — both ends Q0/Q9 open, Q8 earthed, portable earths at work site` : 'None — live-line method'], ['Permits', v.outage ? 'PTW-HV + WAH' : 'LLW + WAH']]))}${sec('Permits on these tasks', `<div class="nx-list">${net.permits.filter((p) => v.wos.some((w) => w.id === p.wo)).map((p) => ui.li({ ic: 'key', title: `${p.id} · ${p.type}`, sub: `${esc(p.wo)} · ${esc(p.authorisedBy)} · expires ${fmt.date(p.expires)}`, end: ui.badge(p.state, p.state === 'active' ? 'ok' : p.state === 'draft' ? 'muted' : 'warn') })).join('') || ui.empty('Permits are raised when the visit is released')}</div>`)}` },
    ],
    actions: [{ label: 'Switching programme', icon: 'schematic', onClick: (close) => { close(); APP.go('switching'); } }, { label: 'Release to crew', primary: true, icon: 'truck', onClick: (close) => { const r = sendToErp(v.line, `Status request · ${v.wos.length} orders of ${v.id} to Scheduled`, { visit: v.id, orders: v.wos.map((w) => (w.line ? w.sap : w.maximo)), status: 'scheduled' }, true); toast(`${v.id} released to ${v.crew.name} · status Scheduled requested in ${erpSystem(v.line)} for ${v.wos.length} orders (${r.ref})`); close(); } }],
  });
}
function openRequest(f) {
  const tw = f.tower || net.towerById.get(f.tower_id);
  const parts = net.parts.filter((p) => p.defects.includes(f.defect_class));
  drawer.open({
    icon: 'camera', kicker: `Verified defect · ${f.campaign_id}`, title: `${f.finding_id} · ${f.label}`, sub: `${esc(f.towerName || f.assetName || '')} · ${esc(f.line || 'Substation')}`,
    badges: [[f.pri, { P1: 'crit', P2: 'high', P3: 'warn', P4: 'muted' }[f.pri]], [fmt.title(f.severity), SEV_TONE[f.severity]], [`${f.sensor.toUpperCase()} · ${Math.round(f.confidence * 100)}%`, 'info'], [converted.has(f.finding_id) ? `Requested in ${erpSystem(f.line)} · ${converted.get(f.finding_id)}` : 'No work order', converted.has(f.finding_id) ? 'ok' : 'warn'], ['', 'warn']],
    body: `${ui.stats([{ label: 'Priority', value: f.pri }, { label: 'Score', value: fmt.n(f.score, 1) }, { label: 'Condition', value: `${f.condition_score} / 5` }, { label: 'Tower criticality', value: f.crit }, { label: 'Days unworked', value: daysBetween(f.date, AS_OF) }])}
      <div class="ops-ev">${evImg(f, 0)}${evImg(f, 1)}</div>
      <div class="nx-drawer-grid">${sec('Inspection record', ui.kv([['Severity', sevBadge(f.severity)], ['Sensor', f.sensor.toUpperCase()], ['Inspected', fmt.date(f.date)], ['Reviewed by', esc(f.confirmed_by || '—')], ['GPS', f.lat ? `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}` : '—']]))}
      ${sec('Proposed work request', ui.kv([['Task', esc(fmt.title(({ insulators: 'insulator replacement', steel_structure: 'steel repair', foundation: 'foundation repair', conductor: 'conductor repair', conductor_accessories: 'fitting replacement', lightning_protection: 'earthwire repair', clearance: 'corridor clearing' })[f.group] || 'fitting replacement'))], ['Plan within', { P1: '14 days', P2: '45 days', P3: 'Next grouped visit', P4: 'Next inspection cycle' }[f.pri]], ['Tower risk', tw?.risk != null ? `${fmt.n(tw.risk, 0)} ${ui.exp('Experimental')}` : '—'], ['Tower HI', tw?.hi != null ? fmt.n(tw.hi, 0) : '—']]))}</div>
      ${sec(`Approved parts (${parts.length})`, `<div class="nx-note" style="margin-bottom:6px">${ui.erp('SAP MM', 'inventory')} ${esc(erpHub.syncedText('inventory'))} · stock, lead time and price are read from the ERP</div><div class="nx-list">${parts.map((p) => ui.li({ ic: 'box', title: `${p.sku} · ${p.name}`, sub: `${p.available} available · lead ${p.lead} d · ${fmt.money(p.unitCost)} / ${p.uom}`, end: p.available > 2 ? ui.badge('In stock', 'ok') : ui.badge('Low', 'warn') })).join('') || ui.empty('No catalogue item mapped')}</div>`)}`,
    actions: [{ label: 'Asset 360', icon: 'tower', onClick: () => { location.href = reliabilityLink(f.tower_id); } }, { label: `Request work order in ${erpSystem(f.line)}`, primary: true, icon: 'plus', onClick: (close) => { requestWorkOrder(f); close(); APP.rerender(); } }],
  });
}
function openLine(l) {
  const ws = openWO.filter((w) => w.line === l.id);
  return {
    kicker: 'Transmission line', title: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers · rating ${l.rating} MVA`,
    badges: [[`HI ${fmt.n(l.hi, 0)}`, l.band === 'normal' ? 'ok' : 'warn'], [`${ws.length} open WOs`, ws.length > 10 ? 'high' : 'accent']],
    fields: [['Loading now', `<span data-live="${l.id}.LOAD">—</span> %`], ['Active power', `<span data-live="${l.id}.MW">—</span> MW`], ['Next outage window', WINDOWS[l.id] ? fmt.date(WINDOWS[l.id][0]) : '—'], ['Visits planned', visits.filter((v) => v.line === l.id).length]],
    spark: { data: live.hist(`${l.id}.LOAD`).slice(-40).map((v) => +v.toFixed(1)), color: l.color, label: 'Loading, last 40 s (%)' },
  };
}

/* ================================================================== map */
function mapCfg(compact) {
  const layers = networkLayers(net, { onLine: openLine, subsInfo: (s) => ({ kicker: 'Substation', title: s.name, sub: `${s.levels.join('/')} kV · ${s.bays} bays`, fields: [['Frequency', `<span data-live="${s.id}.F">—</span> Hz`], ...s.levels.map((kv) => [`${kv} kV bus`, `<span data-live="${s.id}.BUS${kv}">—</span> kV`]), ['Open plant WOs', openWO.filter((w) => !w.line).length]] }) });
  layers.push({
    id: 'visits', name: 'Grouped visits', color: '#2563eb', on: true, count: visits.length,
    circles: visits.filter((v) => v.lat).map((v) => ({ lat: v.lat, lng: v.lng, r: v.hero ? 1700 : 1100, color: v.hero ? '#2563eb' : CORR_COLOR[v.corridor] || '#64748b', opacity: v.hero ? 0.16 : 0.08, weight: v.hero ? 2 : 0 })),
    points: visits.filter((v) => v.lat).map((v) => ({ id: v.id, lat: v.lat + 0.006, lng: v.lng, size: 18, shape: 'dia', icon: 'layers', color: v.hero ? '#2563eb' : '#475569', label: v.hero ? `${v.id} · 5 tasks` : null, z: 700, search: `${v.corridor} visit`, tip: `${v.id} · ${v.wos.length} tasks · ${v.window}`, info: () => ({ kicker: 'Grouped visit', title: `${v.id} · ${v.wos.length} tasks`, sub: `${esc(v.from)} → ${esc(v.to)} · ${esc(v.window)}`, badges: [[v.outage ? 'Outage window' : 'Live-line', v.outage ? 'violet' : 'info'], [`Est. saving ${fmt.money(v.saving)}`, 'ok'], ['Experimental', 'warn']], fields: [['Crew', esc(v.crew.name)], ['Labour', `${fmt.n(v.hours)} h`], ['Estimate', fmt.money(v.cost)], ['Duration', `${v.days} d`]], actions: [{ label: 'Open visit', primary: true, onClick: () => openVisit(v) }] }) })),
  });
  layers.push({
    id: 'wos', name: 'Open work orders', color: '#ea580c', count: openWO.length,
    points: openWO.filter((w) => w.lat).map((w, i) => ({ id: w.id, lat: w.lat + ((i % 3) - 1) * 0.0009, lng: w.lng + ((i % 5) - 2) * 0.0009, size: w.severity === 'critical' ? 15 : w.severity === 'high' ? 13 : 10, color: SEV[w.severity], pulse: w.severity === 'critical' && w.stage === 'in_progress', search: `${w.work_type} ${w.towerName}`, tip: `${w.id} · ${w.work_type} · ${w.towerName || w.asset}`,
      info: () => ({ kicker: `Work order · ${STAGE_LABEL[w.stage]}`, title: `${w.id}`, sub: `${fmt.title(w.work_type)} · ${esc(w.towerName || w.asset)}`, badges: [[fmt.title(w.severity), SEV_TONE[w.severity]], [STAGE_LABEL[w.stage], STAGE_TONE[w.stage]], ...(overdue(w) ? [['Overdue', 'crit']] : []), [`ERP · ${sysOf(w)}`, 'info']], fields: [['Line', esc(lineShort(w.line))], ['Crew', esc(w.crewName)], ['Planned', fmt.date(w.planned_date)], ['Estimate', fmt.money(w.estCost)], ['SAP PM', `<span class="nx-mono">${esc(w.sap)}</span>`], ['Visit', visitOf.get(w.id)?.id || '—']], actions: [{ label: 'Open work order', primary: true, onClick: () => showWO(w.id) }, { label: 'Assign crew', onClick: () => toast(`${w.crewName} assigned to ${w.id}`) }] }) })),
  });
  layers.push({
    id: 'crews', name: 'Crews (AVL)', color: '#7c3aed', count: net.crews.length,
    points: net.crews.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, size: 26, icon: 'truck', color: c.status === 'on site' ? '#d97706' : c.status === 'travelling' ? '#7c3aed' : '#16a34a', label: compact || c.status === 'available' ? null : c.id, z: 1000, search: `${c.name} ${c.lead}`, tip: `${c.id} · ${c.name} · ${c.status}`,
      info: () => ({ kicker: `Crew · ${c.status}`, title: `${c.id} · ${c.name}`, sub: `${esc(c.lead)} · ${c.size} people · ${esc(c.vehicle)}`, badges: [[c.status, c.status === 'on site' ? 'warn' : c.status === 'travelling' ? 'violet' : 'ok'], [SKILL_LABEL[c.skill], 'muted']], fields: [['Current job', c.job ? `<b>${esc(c.job)}</b>` : '—'], ['ETA', `<span data-live="CREW.${c.id}.ETA">—</span> min${c.status === 'travelling' ? ` ${ui.exp('Experimental')}` : ''}`], ['Speed', `<span data-live="CREW.${c.id}.SPD">—</span> km/h`], ['Utilisation', `${c.utilisation}%`], ['Base', esc(c.baseName)]], actions: [{ label: 'Crew details', primary: true, onClick: () => openCrew(c.id) }, ...(c.job ? [{ label: 'Open job', onClick: () => showWO(c.job) }] : [])] }) })),
  });
  layers.push({
    id: 'depots', name: 'Depots & stores', color: '#0284c7', shape: 'sq', count: net.depots.length,
    points: net.depots.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, size: 22, shape: 'sq', icon: 'warehouse', color: '#0284c7', label: compact ? null : d.short, z: 800, tip: `${d.name} · ${d.kind}`, info: () => ({ kicker: 'Depot', title: d.name, sub: d.kind, fields: [['Crews based', net.crews.filter((c) => c.base === d.id).map((c) => c.id).join(', ')], ['Bins', fmt.n(d.bins)]] }) })),
  });
  layers.push({
    id: 'permits', name: 'Active permits', color: '#dc2626', shape: 'dia', on: false, count: net.permits.filter((p) => p.state === 'active').length,
    points: net.permits.filter((p) => p.state === 'active' && p.lat).map((p) => ({ id: p.id, lat: p.lat - 0.0025, lng: p.lng + 0.0025, size: 14, shape: 'dia', color: '#dc2626', tip: `${p.id} · ${p.type}`, info: () => ({ kicker: 'Permit', title: p.id, sub: `${esc(p.type)} · ${esc(p.asset)}`, fields: [['Work order', esc(p.wo)], ['Crew', esc(p.crewName)], ['Authorised by', esc(p.authorisedBy)], ['Isolation', esc(p.isolation)]] }) })),
  });
  return {
    layers,
    legend: [{ label: 'Critical', color: SEV.critical }, { label: 'High', color: SEV.high }, { label: 'Medium', color: SEV.medium }, { label: 'Low', color: SEV.low }, { label: 'Crew on site', color: '#d97706' }, { label: 'Crew travelling', color: '#7c3aed' }, { label: 'Crew available', color: '#16a34a' }],
    stats: compact ? undefined : [{ label: 'Open WOs', value: openWO.length }, { label: 'Crews in field', value: net.crews.filter((c) => c.status !== 'available').length }, { label: 'Jobs active', value: '—', live: 'OPS.ACTIVE' }, { label: 'Site wind m/s', value: '—', live: 'SITE.WIND' }],
  };
}
async function mountMap(ctx, sel, compact) {
  const m = await ctx.map(sel, mapCfg(compact));
  if (!m) return;
  setTimeout(() => { m.map.invalidateSize(); m.fit(); }, 300);
  // AVL: travelling crews move toward their next job; crews on site hold position with GPS jitter.
  const pos = new Map(net.crews.map((c) => [c.id, { lat: c.lat, lng: c.lng }]));
  const target = (c) => { const w = openWO.find((x) => x.crew === c.id && x.lat && x.stage !== 'in_progress'); return w ? { lat: w.lat, lng: w.lng } : null; };
  ctx.every(1500, () => {
    for (const c of net.crews) {
      const p = pos.get(c.id);
      if (c.status === 'travelling') { const t = target(c); if (t) { p.lat += (t.lat - p.lat) * 0.02; p.lng += (t.lng - p.lng) * 0.02; } } else { p.lat += (Math.random() - 0.5) * 0.00008; p.lng += (Math.random() - 0.5) * 0.00008; }
      m.move(c.id, p.lat, p.lng);
    }
  });
}

/* ================================================================== small builders */
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const tatStats = (() => {
  const rows = doneWO.map((w) => {
    const f = firstFindingDate(w);
    return { w, d1: Math.max(0, daysBetween(f, w.created_at)), d2: Math.max(0, daysBetween(w.created_at, w.planned_date)), d3: Math.max(0, daysBetween(w.planned_date, w.completed_at)), total: Math.max(0, daysBetween(f, w.completed_at)) };
  });
  const avg = (arr, k) => (arr.length ? arr.reduce((a, r) => a + r[k], 0) / arr.length : 0);
  const sorted = rows.map((r) => r.total).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  return { rows, avg, median, p90, mean: avg(rows, 'total'), within60: pct(rows.filter((r) => r.total <= 60).length, rows.length) };
})();
const backlogValue = openWO.reduce((a, w) => a + w.estCost, 0);
const syncOk = pct(WO.filter((w) => w.sync === 'synced').length, WO.length);

function kpiRow() {
  const crit = openWO.filter((w) => ['critical', 'high'].includes(w.severity)).length;
  return ui.kpis([
    { label: 'Open work orders', value: openWO.length, icon: 'clipboard', sub: `${openWO.filter(overdue).length} past planned date`, spark: [52, 49, 51, 47, 46, 44, 43, openWO.length], delta: -8.5, deltaInvert: true },
    { label: 'Critical + high open', value: crit, icon: 'event', tone: 'crit', sub: `${openWO.filter((w) => w.severity === 'critical').length} critical`, spark: [14, 15, 13, 12, 12, 11, crit], sparkColor: '#dc2626' },
    { label: 'Jobs active now', value: inProg.length, live: 'OPS.ACTIVE', icon: 'hardhat', tone: 'warn', sub: `${net.crews.filter((c) => c.status === 'on site').length} crews on site` },
    { label: 'Crew utilisation', value: '—', live: 'OPS.UTIL', unit: '%', icon: 'users', tone: 'violet', sub: 'Target 75–88 %', spark: live.hist('OPS.UTIL').slice(-30), sparkColor: '#7c3aed' },
    { label: 'Median turnaround', value: tatStats.median, unit: 'days', icon: 'clock', tone: 'info', sub: `Defect → closure · P90 ${tatStats.p90} d`, spark: [88, 82, 79, 74, 70, 66, tatStats.median], delta: -11.2, deltaInvert: true },
    { label: 'ERP sync health', value: fmt.n(syncOk, 1), unit: '%', icon: 'sync', tone: 'ok', sub: `${WO.filter((w) => w.sync !== 'synced').length} awaiting · latency <span data-live="OPS.SYNC.LAT">—</span> s`, spark: [97, 98, 96, 99, 98, 97, syncOk], sparkColor: '#16a34a' },
  ].map((k) => (k.sub && k.sub.includes('<span') ? { ...k, subHtml: k.sub, sub: undefined } : k)));
}

/* ================================================================== screens */
let APP = null;

const commandCenter = {
  id: 'command', name: 'Operations Command Center', icon: 'dashboard', count: openWO.filter((w) => w.severity === 'critical').length || null,
  tabs: [
    {
      name: 'Overview', icon: 'dashboard',
      render: () => `<div class="nx-page">
        ${ui.hero({ kicker: 'grouped visit', text: `<b>${heroVisit.wos.length} maintenance tasks grouped into one planned inspection-and-repair visit along Corridor North</b> — ${esc(heroVisit.from)} → ${esc(heroVisit.to)} on L-220-03, ${esc(heroVisit.window)}, crew ${esc(heroVisit.crew.id)}. Estimated saving ${fmt.money(heroVisit.saving)} and ${heroVisit.wos.length - 1} fewer mobilisations.`, icon: 'layers', meta: [{ label: 'Tasks', value: heroVisit.wos.length }, { label: 'Labour h', value: fmt.n(heroVisit.hours) }, { label: 'L-220-03 load %', value: '—', live: 'L-220-03.LOAD' }], actions: ui.btn('Open visit', { attrs: 'data-hero' }) })}
        ${kpiRow()}
        <div class="nx-row nx-c12">
          <div class="nx-s8">${ui.card({ title: 'Live field picture', sub: 'Crews (AVL every 1.5 s), open work by severity, grouped visits and depots across the three corridors', tools: ui.btn('Full map', { sm: true, ic: 'map', attrs: 'data-fullmap' }), flush: true, body: '<div class="nx-map" id="ops-map" style="height:560px;border-radius:0 0 12px 12px"></div>' })}</div>
          <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
            ${ui.card({ title: 'Crew status', sub: 'Position and job from the vehicle telematics · the ETA is estimate', body: `<div class="nx-list">${net.crews.map((c) => ui.li({ ic: 'truck', color: c.status === 'on site' ? '#d97706' : c.status === 'travelling' ? '#7c3aed' : '#16a34a', title: `${c.id} · ${c.name}`, sub: c.job ? `On ${c.job} · ${esc(woById.get(c.job)?.towerName || '')}` : c.status === 'travelling' ? `En route · ETA <b data-live="CREW.${c.id}.ETA">—</b> min ${ui.exp('Experimental')}` : `Available at ${esc(c.baseName)}`, end: ui.badge(c.status, c.status === 'on site' ? 'warn' : c.status === 'travelling' ? 'violet' : 'ok'), row: `crew:${c.id}` })).join('')}</div>` })}
          </div>
        </div>
        <div class="nx-row nx-c3">
          ${ui.card({ title: 'Backlog by stage and severity', sub: 'Open work orders through the lifecycle, stacked by worst linked defect', body: ui.chart('stage') })}
          ${ui.card({ title: 'Work mix', sub: 'Open orders by task type', body: ui.chart('mix') })}
          ${ui.card({ title: 'Turnaround time trend', sub: 'Median days from defect confirmation to field closure, by closure month · target 60 d', body: ui.chart('tat') })}
        </div>
        ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Priority queue', sub: 'Open work ranked by severity, then age — click a row for the work-order record', tools: ui.search('#ops-pq', 'Filter queue…'), flush: true, body: ui.table({ id: 'ops-pq', rowId: (w) => w.id, rows: openWO.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || age(b) - age(a)).slice(0, 12), cols: woCols(['id', 'task', 'asset', 'line', 'sev', 'stage', 'crew', 'planned', 'cost', 'sync']) }) })}
      </div>`,
      mount: (st, ctx) => {
        mountMap(ctx, '#ops-map', true);
        const sevs = ['critical', 'high', 'medium', 'low'];
        const stg = STAGES.filter((s) => s !== 'completed');
        ctx.chart('stage', ch.bar({ x: stg.map((s) => STAGE_LABEL[s]), stack: true, series: sevs.map((s) => ({ name: fmt.title(s), color: SEV[s], data: stg.map((g) => openWO.filter((w) => w.stage === g && w.severity === s).length) })) }));
        const types = [...new Set(openWO.map((w) => w.work_type))];
        ctx.chart('mix', ch.donut({ data: types.map((t) => ({ name: fmt.title(t), value: openWO.filter((w) => w.work_type === t).length })).sort((a, b) => b.value - a.value), center: 'open WOs' }));
        const months = [...new Set(doneWO.map((w) => w.completed_at.slice(0, 7)))].sort();
        const med = months.map((m) => { const xs = tatStats.rows.filter((r) => r.w.completed_at.startsWith(m)).map((r) => r.total).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; });
        ctx.chart('tat', ch.line({ x: months.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })), series: [{ name: 'Median TAT (d)', data: med, color: '#2563eb', area: true, symbol: true, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'Target 60 d', color: '#dc2626', fontSize: 10 }, data: [{ yAxis: 60 }] } }], yMin: 0 }));
        ctx.on('click', '[data-row]', (e, r) => { const id = r.dataset.row; if (id.startsWith('crew:')) openCrew(id.slice(5)); else showWO(id); });
        ctx.on('click', '[data-hero]', () => openVisit(heroVisit));
        ctx.on('click', '[data-fullmap]', () => APP.go('command', 'Live map'));
      },
    },
    {
      name: 'Live map', icon: 'map', full: true,
      render: () => '<div class="nx-map is-full" id="ops-fullmap"></div>',
      mount: (st, ctx) => { mountMap(ctx, '#ops-fullmap', false); },
    },
    {
      name: 'Corridor board', icon: 'line',
      render: () => {
        const lanes = [...net.lines.map((l) => ({ key: l.id, name: `Corridor ${l.corridor}`, sub: l.name, color: l.color, ws: openWO.filter((w) => w.line === l.id), load: `${l.id}.LOAD`, win: WINDOWS[l.id] })), { key: 'sub', name: 'Substation plant', sub: 'S-1 / S-2 transformers & bays', color: '#0f172a', ws: openWO.filter((w) => !w.line), load: null, win: WINDOWS.sub }];
        return `<div class="nx-page">
          ${ui.callout('Outages are granted by the control centre only when the remaining corridor can carry the transfer. A line loaded above <b>60 %</b> of its thermal rating is shown as <b>outage at risk</b> — work there is pushed to live-line methods or to the next window.', 'info', 'info')}
          <div class="ops-lanes">${lanes.map((ln) => {
            const vs = visits.filter((v) => (v.line || 'sub') === ln.key);
            return `<div class="ops-lane"><div class="ops-lane-h"><i style="background:${ln.color}"></i><div><b>${esc(ln.name)}</b><div class="nx-note">${esc(ln.sub)}</div></div></div>
              ${ui.stats([{ label: 'Open WOs', value: ln.ws.length }, { label: 'Backlog', value: fmt.money(ln.ws.reduce((a, w) => a + w.estCost, 0)) }, { label: 'Visits', value: vs.length }, { label: 'Overdue', value: ln.ws.filter(overdue).length, color: ln.ws.filter(overdue).length ? '#b91c1c' : undefined }])}
              ${ln.load ? `<div><div class="nx-note" style="display:flex;justify-content:space-between"><span>Live loading vs rating</span><b><span data-live="${ln.load}">—</span> %</b></div><div class="nx-bar" style="height:8px;margin-top:5px"><i data-live-w="${ln.load}" style="background:${ln.color}"></i></div></div>` : `<div class="nx-note">Transformer bays isolated individually; no corridor transfer limit.</div>`}
              <div class="nx-note"><b style="color:var(--nx-ink)">Next outage windows</b><br/>${ln.win.slice(0, 3).map((d) => fmt.date(d)).join(' · ')}</div>
              <div class="nx-list">${vs.slice(0, 4).map((v) => ui.li({ ic: 'layers', color: v.hero ? '#2563eb' : '#64748b', title: `${v.id} · ${v.wos.length} tasks`, sub: `${esc(v.from)}${v.to !== v.from ? ` → ${esc(v.to)}` : ''} · ${esc(v.window)}`, end: sevBadge(v.severity), row: `visit:${v.id}` })).join('')}</div></div>`;
          }).join('')}</div>
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Backlog heatmap', sub: 'Open work orders by corridor and task type', body: ui.chart('heat', 'md') })}
            ${ui.card({ title: 'Ageing of open work', sub: 'Days since the work request was raised, by corridor', body: ui.chart('ageing', 'md') })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        const cors = ['North', 'Coastal', 'Inland', 'Substation'];
        const types = [...new Set(WO.map((w) => w.work_type))];
        ctx.chart('heat', ch.heat({ x: cors, y: types.map(fmt.title), data: types.flatMap((t, yi) => cors.map((c, xi) => [xi, yi, openWO.filter((w) => w.work_type === t && w.corridor === c).length])), label: true, colors: ['#f8fafc', '#bfdbfe', '#3b82f6', '#1e3a8a'] }));
        const buckets = [['< 90 d', 0, 90], ['90–180', 90, 180], ['180–270', 180, 270], ['> 270 d', 270, 9999]];
        ctx.chart('ageing', ch.bar({ x: buckets.map((b) => b[0]), stack: true, series: cors.map((c) => ({ name: c, color: CORR_COLOR[c], data: buckets.map(([, a, b]) => openWO.filter((w) => w.corridor === c && age(w) >= a && age(w) < b).length) })) }));
        ctx.on('click', '[data-row]', (e, r) => { const v = visits.find((x) => `visit:${x.id}` === r.dataset.row); if (v) openVisit(v); });
      },
    },
  ],
};

function woCols(keys) {
  const all = {
    id: { key: 'id', label: 'Work order', render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub nx-mono">${esc(w.line ? w.sap : w.maximo)}</span>` },
    task: { key: 'work_type', label: 'Task', render: (w) => fmt.title(w.work_type) },
    asset: { key: 'towerName', label: 'Asset', render: (w) => `${esc(w.towerName || w.asset)}<span class="nx-sub">${esc(w.asset)}</span>`, sort: (w) => w.towerName || w.asset },
    line: { key: 'line', label: 'Corridor', render: (w) => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${CORR_COLOR[w.corridor]}"></i>${esc(w.corridor)}</span>`, sort: (w) => w.corridor },
    sev: { key: 'severity', label: 'Severity', render: (w) => sevBadge(w.severity), sort: (w) => SEV_ORDER[w.severity] },
    pri: { key: 'priority', label: 'Priority', render: (w) => ui.badge(fmt.title(w.priority), PRI_TONE[w.priority], { dot: false }), sort: (w) => ({ high: 0, medium: 1, low: 2 })[w.priority] },
    stage: { key: 'stage', label: 'Stage', render: (w) => stageBadge(w.stage), sort: (w) => STAGES.indexOf(w.stage) },
    crew: { key: 'crew', label: 'Crew', render: (w) => `${esc(w.crew)}<span class="nx-sub">${esc(SKILL_LABEL[w.skill])}</span>` },
    planned: { key: 'planned_date', label: 'Planned', render: (w) => `${fmt.date(w.planned_date)}${overdue(w) ? `<span class="nx-sub" style="color:#b91c1c">${daysBetween(w.planned_date, AS_OF)} d overdue</span>` : ''}` },
    cost: { key: 'estCost', label: 'Estimate', align: 'r', render: (w) => fmt.money(w.estCost) },
    hours: { key: 'labourH', label: 'Hours', align: 'r' },
    sync: { key: 'sync', label: 'ERP', render: (w) => ui.badge(w.sync, w.sync === 'synced' ? 'ok' : w.sync === 'pending' ? 'warn' : 'crit') },
    age: { key: 'created_at', label: 'Age', align: 'r', render: (w) => `${age(w)} d`, sort: (w) => age(w) },
    visit: { key: 'visit', label: 'Visit', render: (w) => (visitOf.get(w.id) ? `<span class="nx-mono">${esc(visitOf.get(w.id).id)}</span>` : '—'), sort: (w) => visitOf.get(w.id)?.id || 'zz' },
  };
  return keys.map((k) => all[k]);
}

let woFilter = 'open';
const workOrders = {
  id: 'workorders', name: 'Work Orders', icon: 'clipboard', count: openWO.length,
  tabs: [
    {
      name: 'Register', icon: 'clipboard',
      render: () => {
        const rows = woFilter === 'open' ? openWO : woFilter === 'all' ? WO : WO.filter((w) => w.stage === woFilter || (woFilter === 'overdue' && overdue(w)));
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Total work orders', value: WO.length, icon: 'clipboard', sub: `${doneWO.length} completed this year` },
            { label: 'Open backlog value', value: fmt.money(backlogValue), icon: 'dollar', tone: 'violet', sub: `${fmt.n(openWO.reduce((a, w) => a + w.labourH, 0))} labour hours` },
            { label: 'Past planned date', value: openWO.filter(overdue).length, icon: 'clock', tone: 'crit', sub: 'Need re-plan or escalation' },
            { label: 'Needing an outage', value: openWO.filter((w) => w.outage).length, icon: 'outage', tone: 'warn', sub: `${openWO.filter((w) => !w.outage).length} can be done live-line` },
          ])}
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s7', title: 'Throughput: raised vs completed', sub: 'Work orders raised and completed per month — is the backlog shrinking?', body: ui.chart('reg-thr', 'sm') })}
            ${ui.card({ cls: 'nx-s5', title: 'Cost vs effort', sub: 'Each open order: estimate against labour hours, coloured by severity', body: ui.chart('reg-ce', 'sm') })}
          </div>
          ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Work-order register', sub: `Every order is read from SAP PM (lines) and IBM Maximo (substation plant) through the integration layer · ${esc(erpHub.syncedText('workOrders'))}. Nothing is re-entered here. Click a row for the full record.`, tools: `${ui.chips('wof', [['open', `Open · ${openWO.length}`], ['overdue', `Overdue · ${openWO.filter(overdue).length}`], ['in_progress', 'In progress'], ['scheduled', 'Scheduled'], ['completed', 'Completed'], ['all', 'All']], woFilter)}${ui.search('#ops-wo', 'Search WO, tower, crew…')}${ui.btn('Export', { sm: true, ic: 'download', attrs: 'data-export' })}`, flush: true, body: `<div class="ops-scroll">${ui.table({ id: 'ops-wo', rowId: (w) => w.id, rows: rows.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage)), cols: woCols(['id', 'task', 'asset', 'line', 'sev', 'pri', 'stage', 'crew', 'visit', 'planned', 'hours', 'cost', 'sync']) })}</div>` })}
        </div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', 'tr[data-row]', (e, r) => showWO(r.dataset.row));
        ctx.onPick('wof', (v) => { woFilter = v; APP.rerender(); });
        ctx.on('click', '[data-export]', () => toast('Register exported as CSV (simulation) — 127 rows'));
        const ms = [...new Set(WO.map((w) => w.created_at.slice(0, 7)))].sort();
        const mlab = ms.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
        const raised = ms.map((m) => WO.filter((w) => w.created_at.startsWith(m)).length); const compl = ms.map((m) => WO.filter((w) => w.completed_at?.startsWith(m)).length);
        let bl = 0; const backlog = ms.map((_, i) => (bl += raised[i] - compl[i]));
        ctx.chart('reg-thr', { ...ch.bar({ x: mlab, series: [{ name: 'Raised', color: '#94a3b8', data: raised }, { name: 'Completed', color: '#16a34a', data: compl }] }), yAxis: [{ type: 'value', name: 'orders' }, { type: 'value', name: 'backlog', splitLine: { show: false } }], series: [{ type: 'bar', name: 'Raised', data: raised, itemStyle: { color: '#94a3b8', borderRadius: [4, 4, 0, 0] } }, { type: 'bar', name: 'Completed', data: compl, itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] } }, { type: 'line', name: 'Open backlog', yAxisIndex: 1, data: backlog, smooth: true, lineStyle: { color: '#dc2626', width: 2 }, itemStyle: { color: '#dc2626' } }] });
        ctx.chart('reg-ce', { grid: ch.grid({ top: 26 }), legend: { top: 0, right: 0 }, xAxis: { type: 'value', name: 'labour h', nameLocation: 'middle', nameGap: 24 }, yAxis: { type: 'value', name: '$k' }, tooltip: { trigger: 'item', formatter: (q) => `<b>${q.data[2]}</b> · ${q.data[3]}<br/>${q.data[0]} h · ${fmt.money(q.data[1] * 1000)}` }, series: ['critical', 'high', 'medium', 'low'].map((sv) => ({ type: 'scatter', name: fmt.title(sv), itemStyle: { color: SEV[sv], opacity: 0.8 }, symbolSize: 9, data: openWO.filter((w) => w.severity === sv).map((w) => [w.labourH, +(w.estCost / 1000).toFixed(1), w.id, fmt.title(w.work_type)]) })) }, { onClick: (q) => showWO(q.data[2]) });
      },
    },
    {
      name: 'Requests from defects', icon: 'ai',
      render: () => `<div class="nx-page">
        ${ui.hero({ kicker: 'defect → work request', text: `<b>${requests.length} verified defects have no work order yet.</b> Each is scored <span class="nx-mono">severity × tower criticality × (1 + risk)</span> (score, not validated) and proposed as a prioritised work request. The planner sends the request to the ERP, which creates and owns the order; nothing is keyed in here.`, icon: 'ai', meta: [{ label: 'P1', value: requests.filter((r) => r.pri === 'P1').length }, { label: 'P2', value: requests.filter((r) => r.pri === 'P2').length }, { label: 'P3–P4', value: requests.filter((r) => ['P3', 'P4'].includes(r.pri)).length }], actions: ui.btn('Request all P1 in ERP', { attrs: 'data-conv-p1' }) })}
        <div class="nx-row nx-c12">
          <div class="nx-s8">${ui.card({ exp: true, title: 'Prioritised request queue', sub: 'Confirmed, unrepaired findings in engineering review with condition ≤ 3 and no linked work order · a request is sent to the ERP, which creates the order', flush: true, tools: ui.search('#ops-req', 'Filter…'), body: `<div class="ops-scroll" style="max-height:880px">${ui.table({ id: 'ops-req', rowId: (f) => f.finding_id, rows: requests, cols: [
            { key: 'pri', label: 'Priority', render: (f) => ui.badge(f.pri, { P1: 'crit', P2: 'high', P3: 'warn', P4: 'muted' }[f.pri], { dot: false }) },
            { key: 'score', label: 'Score', align: 'r', render: (f) => `<b>${fmt.n(f.score, 1)}</b>` },
            { key: 'finding_id', label: 'Finding', render: (f) => `<b>${esc(f.finding_id)}</b><span class="nx-sub">${esc(f.campaign_id)} · ${fmt.date(f.date)}</span>` },
            { key: 'label', label: 'Defect', render: (f) => `${esc(f.label)}<span class="nx-sub">${esc(f.sensor.toUpperCase())} · ${Math.round(f.confidence * 100)}% conf.</span>` },
            { key: 'towerName', label: 'Asset', render: (f) => `${esc(f.towerName || f.assetName || '—')}<span class="nx-sub">${esc(f.line || 'Substation')}</span>` },
            { key: 'severity', label: 'Severity', render: (f) => sevBadge(f.severity), sort: (f) => SEV_ORDER[f.severity] },
            { key: 'crit', label: 'Crit.', align: 'c' },
            { key: 'act', label: '', sort: false, render: (f) => (converted.has(f.finding_id) ? ui.badge(`${converted.get(f.finding_id)} · requested`, 'ok') : `<button type="button" class="nx-btn is-sm is-primary" data-conv="${esc(f.finding_id)}">${icon('plus', 13)}Request in ${f.line ? 'SAP PM' : 'Maximo'}</button>`) },
          ] })}</div>` })}</div>
          <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
            ${ui.card({ title: 'Requests by defect type', sub: 'Where the unplanned demand comes from', body: ui.chart('rq-type', 'md') })}
            ${ui.card({ title: 'Days left unworked', sub: 'Age of each verified defect without a work order, by priority', body: ui.chart('rq-age', 'sm') })}
            ${ui.card({ title: 'Where the requests are', sub: 'Unworked verified defects per line, by severity', body: ui.chart('rq-line', 'sm') })}
            ${ui.card({ title: 'Conversion rules', sub: 'Applied before a request reaches a planner', body: ui.kv([['P1 (score ≥ 60)', 'Plan within 14 days'], ['P2 (30–60)', 'Plan within 45 days'], ['P3 (15–30)', 'Next grouped visit'], ['P4 (< 15)', 'Next inspection cycle'], ['Grouping radius', '8 towers / same outage'], ['Materials', 'Reservation requested in SAP MM · module 05']]) })}
          </div>
        </div></div>`,
      mount: (st, ctx) => {
        const by = {}; requests.forEach((r) => { by[r.label] = (by[r.label] || 0) + 1; });
        const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 9);
        const ab = [['< 30 d', 0, 30], ['30–90', 30, 90], ['90–180', 90, 180], ['180–270', 180, 270], ['> 270 d', 270, 9999]];
        ctx.chart('rq-age', { ...ch.bar({ x: ab.map((b) => b[0]), stack: true, series: ['P1', 'P2', 'P3', 'P4'].map((pr, i) => ({ name: pr, color: ['#dc2626', '#ea580c', '#f59e0b', '#94a3b8'][i], data: ab.map(([, a, b]) => requests.filter((r) => r.pri === pr && daysBetween(r.date, AS_OF) >= a && daysBetween(r.date, AS_OF) < b).length) })) }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name} unworked<br/>${ps.filter((x) => x.value).map((x) => `${x.marker}${x.seriesName}: <b>${x.value}</b>`).join('<br/>') || 'none'}` } });
        const lns = ['L-220-03', 'L-132-01', 'L-500-01', null];
        ctx.chart('rq-line', ch.bar({ x: lns.map((l) => l || 'Substation'), horizontal: true, stack: true, series: ['critical', 'high', 'medium'].map((sv) => ({ name: fmt.title(sv), color: SEV[sv], data: lns.map((l) => requests.filter((r) => (r.line || null) === l && r.severity === sv).length) })), grid: { left: 4, top: 26 } }));
        ctx.chart('rq-type', ch.bar({ x: top.map((t) => t[0]), horizontal: true, labels: true, series: [{ name: 'Requests', data: top.map((t) => t[1]), color: '#ea580c' }], grid: { left: 4, top: 8 } }));
        ctx.on('click', '[data-conv]', (e, b) => { e.stopPropagation(); const f = requests.find((x) => x.finding_id === b.dataset.conv); if (!f) return; b.outerHTML = ui.badge(`${requestWorkOrder(f)} · requested`, 'ok'); });
        ctx.on('click', '[data-conv-p1]', () => { const p1 = requests.filter((r) => r.pri === 'P1' && !converted.has(r.finding_id)); p1.forEach((r) => requestWorkOrder(r, true)); toast(p1.length ? `${p1.length} P1 work-order requests sent to the ERP (SAP PM / Maximo) — the orders arrive with the next sync` : 'Every P1 defect is already requested in the ERP', p1.length ? 'ok' : 'warn'); APP.rerender(); });
        ctx.on('click', 'tr[data-row]', (e, r) => { if (e.target.closest('[data-conv]')) return; const f = requests.find((x) => x.finding_id === r.dataset.row); if (f) openRequest(f); });
      },
    },
    {
      name: 'SAP PM / Maximo sync', icon: 'sync',
      render: () => {
        const sap = WO.filter((w) => w.line); const mx = WO.filter((w) => !w.line);
        const sysCard = (name, color, list, logo) => `<div class="ops-syncsys"><div class="ops-logo" style="background:${color}">${logo}</div><div style="flex:1"><b style="font-size:14px">${name}</b><div class="nx-note">${list.length} orders · ${list.filter((w) => w.sync === 'synced').length} in step · ${list.filter((w) => w.sync === 'pending').length} pending · ${list.filter((w) => w.sync === 'conflict').length} conflict</div><div class="nx-bar" style="margin-top:8px;height:7px"><i style="width:${pct(list.filter((w) => w.sync === 'synced').length, list.length).toFixed(1)}%;background:#16a34a"></i></div></div></div>`;
        return `<div class="nx-page">
          <div class="nx-row" style="grid-template-columns:1fr auto 1fr auto 1fr;align-items:center">
            ${sysCard('SAP PM · S/4HANA', '#0a6ed1', sap, 'SAP')}
            <div class="ops-arrow">${icon('sync')}<span>OData · IDoc</span></div>
            <div class="ops-syncsys" style="border-color:#93c5fd;background:#f5f9ff"><div class="ops-logo" style="background:linear-gradient(135deg,#3b82f6,#06b6d4)">NX</div><div style="flex:1"><b style="font-size:14px">NEXUS integration hub</b><div class="nx-note">Queue <b data-live="OPS.SYNC.Q">—</b> msgs · latency <b data-live="OPS.SYNC.LAT">—</b> s · last full reconcile 16:40</div></div></div>
            <div class="ops-arrow">${icon('sync')}<span>REST · MIF</span></div>
            ${sysCard('IBM Maximo · MAS 9', '#1f2937', mx, 'MX')}
          </div>
          <div class="nx-row nx-c12">
            <div class="nx-s8">${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Message log', sub: 'Orders read from the ERP, and the status / scheduling updates sent back, most recent first', tools: `${ui.btn('Resolve conflicts', { sm: true, attrs: 'data-resolve' })}${ui.btn('Sync now', { sm: true, primary: true, ic: 'sync', attrs: 'data-sync' })}`, flush: true, body: `<div class="ops-scroll" style="max-height:1090px">${ui.table({ id: 'ops-log', rows: syncLog, rowId: (m) => m.wo.id, cols: [
              { key: 'time', label: 'Time', render: (m) => `<span class="nx-mono">${m.time}</span>` },
              { key: 'id', label: 'Message', render: (m) => `<span class="nx-mono">${m.id}</span>` },
              { key: 'dir', label: 'Direction', render: (m) => (m.dir === 'out' ? `NEXUS → ${m.sys}` : `${m.sys} → NEXUS`) },
              { key: 'wo', label: 'Order', render: (m) => `<b>${esc(m.wo.id)}</b><span class="nx-sub nx-mono">${esc(m.sys === 'SAP PM' ? m.wo.sap : m.wo.maximo)}</span>`, sort: (m) => m.wo.id },
              { key: 'field', label: 'Field changed' },
              { key: 'ms', label: 'Round trip', align: 'r', render: (m) => `${fmt.n(m.ms)} ms` },
              { key: 'st', label: 'Result', render: (m) => ui.badge(m.st === 'ok' ? 'Acknowledged' : m.st === 'retry' ? 'Retried' : 'Conflict', m.st === 'ok' ? 'ok' : m.st === 'retry' ? 'warn' : 'crit') },
            ] })}</div>` })}</div>
            <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
              ${ui.card({ title: 'Round-trip latency', sub: 'Live, seconds (alarm at 5 s)', body: ui.chart('lat', 'sm') })}
              ${ui.card({ title: 'Messages per hour', sub: 'Last 24 h, both systems', body: ui.chart('mph', 'sm') })}
              ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Order state by system', sub: 'Synced, pending and conflicting orders in each ERP', body: ui.chart('sy-st', 'sm') })}
              ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Conflict queue', sub: 'A status or date sent from NEXUS disagrees with the ERP order since the last reconcile · the ERP value wins', body: `<div class="nx-list">${WO.filter((w) => w.sync !== 'synced').slice(0, 6).map((w) => ui.li({ ic: w.sync === 'conflict' ? 'alert' : 'clock', color: w.sync === 'conflict' ? '#dc2626' : '#d97706', title: `${w.id} · ${sysOf(w)}`, sub: w.sync === 'conflict' ? 'Planned date differs: NEXUS vs ERP' : 'Status change waiting for acknowledgement', end: ui.badge(w.sync, w.sync === 'conflict' ? 'crit' : 'warn'), row: w.id })).join('') || ui.empty('All orders in step')}</div>` })}
              ${ui.card({ title: 'Field mapping', sub: 'NEXUS ↔ ERP master fields', body: ui.kv([['Work order', 'AUFNR ↔ WONUM'], ['Functional location', 'TPLNR ↔ LOCATION'], ['Equipment', 'EQUNR ↔ ASSETNUM'], ['Status', 'STAT ↔ STATUS'], ['Planned date', 'GSTRP ↔ SCHEDSTART'], ['Crew', 'ARBPL ↔ CREWID']]) })}
            </div>
          </div></div>`;
      },
      mount: (st, ctx) => {
        const lat = () => ({ ...ch.line({ x: live.hist('OPS.SYNC.LAT').slice(-60).map((_, i) => i), series: [{ name: 'Latency s', data: live.hist('OPS.SYNC.LAT').slice(-60).map((v) => +v.toFixed(2)), color: '#0ea5e9', area: true }], legend: false, yMin: 0, grid: { top: 10 } }), animation: false });
        ctx.chart('lat', lat()).then((c) => ctx.onLive(() => c && !c.isDisposed() && c.setOption(lat())));
        const sysL = ['SAP PM', 'IBM Maximo'];
        ctx.chart('sy-st', ch.bar({ x: sysL, horizontal: true, stack: true, series: [['synced', '#16a34a'], ['pending', '#f59e0b'], ['conflict', '#dc2626']].map(([k, c]) => ({ name: fmt.title(k), color: c, data: sysL.map((sy) => WO.filter((w) => sysOf(w) === sy && w.sync === k).length) })), grid: { left: 4, top: 26 } }));
        const hrs = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
        ctx.chart('mph', ch.bar({ x: hrs, stack: true, series: [{ name: 'SAP PM', color: '#0a6ed1', data: hrs.map((_, i) => Math.round((i > 6 && i < 19 ? 38 : 9) + R() * 14)) }, { name: 'Maximo', color: '#334155', data: hrs.map((_, i) => Math.round((i > 6 && i < 19 ? 14 : 4) + R() * 6)) }] }));
        ctx.on('click', '[data-sync]', () => { const n = WO.filter((w) => w.sync === 'pending').length; WO.forEach((w) => { if (w.sync === 'pending') w.sync = 'synced'; }); live.set('OPS.SYNC.Q', 0); toast(`Sync complete — ${n} pending status updates sent, latest orders read back from the ERP, ${WO.filter((w) => w.sync === 'conflict').length} conflicts left for review`); APP.rerender(); });
        ctx.on('click', '.nx-li[data-row]', (e, r) => showWO(r.dataset.row));
        ctx.on('click', '[data-resolve]', () => { const n = WO.filter((w) => w.sync === 'conflict').length; WO.forEach((w) => { if (w.sync === 'conflict') w.sync = 'synced'; }); toast(n ? `${n} conflicts resolved — ERP values kept (the ERP is the system of record)` : 'No conflicts to resolve', n ? 'ok' : 'warn'); APP.rerender(); });
        ctx.on('click', 'tr[data-row]', (e, r) => showWO(r.dataset.row));
      },
    },
  ],
};

const planner = {
  id: 'planner', name: 'Maintenance Planner', icon: 'layers',
  tabs: [
    {
      name: 'Visit grouping', icon: 'layers', 
      render: () => {
        const total = visits.reduce((a, v) => a + v.saving, 0);
        return `<div class="nx-page">
          ${ui.hero({ kicker: 'visit grouping', text: `<b>${heroVisit.wos.length} maintenance tasks grouped into one planned inspection-and-repair visit along Corridor North.</b> ${openWO.length} open orders become ${visits.length} visits — one mobilisation and one isolation per corridor section and outage window.`, icon: 'layers', meta: [{ label: 'Visits', value: visits.length }, { label: 'Trips avoided', value: openWO.length - visits.length }, { label: 'Est. saving', value: fmt.money(total) }] })}
          <div class="nx-row nx-c12">
            <div class="nx-s7">${ui.card({ title: 'Visit clusters', sub: 'Open orders within 8 towers on the same circuit, sharing an outage window or live-line method', flush: true, body: '<div class="nx-map" id="ops-vmap" style="height:430px;border-radius:0 0 12px 12px"></div>' })}</div>
            <div class="nx-s5">${ui.card({ title: 'Mobilisations: separate vs grouped', sub: 'Trips needed per corridor, and the estimated saving from grouping', body: ui.chart('mob', 'lg') })}</div>
          </div>
          <div class="ops-visits">${visits.map((v) => `<div class="ops-visit${v.hero ? ' is-hero' : ''}" data-visit="${esc(v.id)}"><div class="ops-visit-h"><span class="nx-li-ico" style="background:${CORR_COLOR[v.corridor]}1a;color:${CORR_COLOR[v.corridor]}">${icon('layers')}</span><div style="flex:1;min-width:0"><b>${esc(v.id)} · ${v.corridor === 'Substation' ? 'Substation plant' : `Corridor ${esc(v.corridor)}`}</b><span>${esc(v.from)}${v.to !== v.from ? ` → ${esc(v.to)}` : ''} · ${esc(v.window)}</span></div>${v.hero ? ui.badge('Featured', 'accent') : sevBadge(v.severity)}</div>
            <ul>${v.wos.map((w) => `<li data-wo="${esc(w.id)}"><i style="background:${SEV[w.severity]}"></i><b>${esc(w.id)}</b>${esc(fmt.title(w.work_type))} · ${esc(w.towerName || w.asset)}<em>${w.labourH} h</em></li>`).join('')}</ul>
            <div class="ops-visit-f"><span>Crew <b>${esc(v.crew.id)}</b></span><span>Labour <b>${fmt.n(v.hours)} h</b></span><span>Est. <b>${fmt.money(v.cost)}</b></span><span style="margin-left:auto;color:#15803d">Est. saving <b style="color:#15803d">${fmt.money(v.saving)}</b></span></div></div>`).join('')}</div>
        </div>`;
      },
      mount: (st, ctx) => {
        ctx.map('#ops-vmap', {
          panel: false,
          layers: [...networkLayers(net, { onLine: openLine }), { id: 'v', name: 'Visits', color: '#2563eb', circles: visits.filter((v) => v.lat).map((v) => ({ lat: v.lat, lng: v.lng, r: v.hero ? 1800 : 1200, color: CORR_COLOR[v.corridor], opacity: v.hero ? 0.22 : 0.12, weight: v.hero ? 2 : 1 })), points: openWO.filter((w) => w.lat).map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, size: 9, color: SEV[w.severity], tip: `${w.id} · ${visitOf.get(w.id)?.id || ''}`, info: () => ({ title: w.id, sub: `${fmt.title(w.work_type)} · ${esc(w.towerName || '')}`, fields: [['Visit', visitOf.get(w.id)?.id || '—'], ['Window', visitOf.get(w.id)?.window || '—']], actions: [{ label: 'Open work order', primary: true, onClick: () => showWO(w.id) }] }) })) }],
          legend: [{ label: 'Corridor North', color: CORR_COLOR.North }, { label: 'Coastal', color: CORR_COLOR.Coastal }, { label: 'Inland', color: CORR_COLOR.Inland }],
        });
        const cors = ['North', 'Coastal', 'Inland', 'Substation'];
        ctx.chart('mob', {
          ...ch.bar({ x: cors, series: [{ name: 'Separate trips', color: '#cbd5e1', data: cors.map((c) => openWO.filter((w) => w.corridor === c).length) }, { name: 'Grouped visits', color: '#2563eb', data: cors.map((c) => visits.filter((v) => v.corridor === c).length) }], yName: 'Trips' }),
          yAxis: [{ type: 'value', name: 'Trips' }, { type: 'value', name: 'Saving $k', splitLine: { show: false } }],
          series: [
            { type: 'bar', name: 'Separate trips', data: cors.map((c) => openWO.filter((w) => w.corridor === c).length), itemStyle: { color: '#cbd5e1', borderRadius: [4, 4, 0, 0] } },
            { type: 'bar', name: 'Grouped visits', data: cors.map((c) => visits.filter((v) => v.corridor === c).length), itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] } },
            { type: 'line', name: 'Saving $k', yAxisIndex: 1, data: cors.map((c) => Math.round(visits.filter((v) => v.corridor === c).reduce((a, v) => a + v.saving, 0) / 1000)), itemStyle: { color: '#16a34a' }, lineStyle: { color: '#16a34a', width: 2 }, symbolSize: 8 },
          ],
        });
        ctx.on('click', '[data-wo]', (e, li) => { e.stopPropagation(); showWO(li.dataset.wo); });
        ctx.on('click', '[data-visit]', (e, el) => { if (e.target.closest('[data-wo]')) return; openVisit(visits.find((v) => v.id === el.dataset.visit)); });
      },
    },
    {
      name: 'Outage windows', icon: 'calendar', 
      render: () => {
        const rows = [];
        for (const key of ['L-220-03', 'L-132-01', 'L-500-01', 'sub']) {
          rows.push({ label: key === 'sub' ? 'Substation bays' : LINE_NAME[key], sub: 'Agreed outage windows', bars: WINDOWS[key].map((d) => ({ start: d, end: addDays(d, 1), color: '#cbd5e1', text: '', tip: `Outage window ${fmt.date(d)} 06:00–18:00` })) });
          for (const v of visits.filter((x) => (x.line || 'sub') === key)) rows.push({ label: `${v.id}`, sub: `${v.wos.length} tasks · ${v.crew.id}`, bars: [{ id: v.id, start: v.start, end: v.end, color: v.outage ? '#7c3aed' : CORR_COLOR[v.corridor], text: `${v.wos.length} tasks · ${v.outage ? 'outage' : 'live-line'}`, tip: `${v.id} · ${v.window}` }] });
        }
        return `<div class="nx-page">
          ${ui.callout('Grey blocks are outage windows agreed with the control centre (06:00–18:00). Violet visits need the line out of service and are placed into the next free window; coloured visits use live-line methods and run on weekdays.', 'info', 'calendar')}
          ${ui.card({ title: 'Outage & visit plan — next 6 weeks', sub: 'Click a visit for its task list, isolation and permits', body: `<div style="overflow-x:auto"><div style="min-width:900px">${ui.gantt({ rows, range: [addDays(AS_OF, -2), addDays(AS_OF, 40)], now: AS_OF, ticks: 'week', labelW: 230 })}</div></div>` })}
          <div class="nx-row nx-c2">
            ${ui.card({ title: 'Outage hours requested', sub: 'Per line, grouped vs if every task took its own outage', body: ui.chart('oh') })}
            ${ui.card({ exp: true, title: 'Transfer margin during windows', sub: 'Forecast loading of the parallel path while each line is out · illustrative values, to be replaced by the EMS contingency study', body: ui.chart('tm') })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '.nx-gantt-bar[data-row]', (e, b) => { const v = visits.find((x) => x.id === b.dataset.row); if (v) openVisit(v); });
        const ls = ['L-220-03', 'L-132-01', 'L-500-01'];
        const own = (w) => Math.max(1, Math.ceil(w.labourH / ((crewById.get(w.crew)?.size || 5) * 10))) * 12;
        const grouped = (v) => Math.max(1, Math.ceil(v.wos.filter((w) => w.outage).reduce((a, w) => a + w.labourH, 0) / (v.crew.size * 10))) * 12;
        ctx.chart('oh', { ...ch.bar({ x: ls, series: [{ name: 'One outage per task', color: '#fca5a5', data: ls.map((l) => openWO.filter((w) => w.line === l && w.outage).reduce((a, w) => a + own(w), 0)) }, { name: 'Grouped visits', color: '#7c3aed', data: ls.map((l) => visits.filter((v) => v.line === l && v.outage).reduce((a, v) => a + grouped(v), 0)) }], yName: 'outage hours', labels: true }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}<br/>${ps.map((x) => `${x.marker}${x.seriesName}: <b>${x.value} h</b> line out of service`).join('<br/>')}` } });
        const ws = ['14 Nov', '21 Nov', '28 Nov', '05 Dec', '12 Dec'];
        ctx.chart('tm', ch.line({ x: ws, series: [{ name: 'Parallel path loading %', data: [71, 68, 74, 66, 63], color: '#ea580c', symbol: true, area: true }, { name: 'N-1 limit', data: ws.map(() => 90), color: '#dc2626', dash: true }], yMin: 40, yMax: 100 }));
      },
    },
    {
      name: 'Workload', icon: 'users', 
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">
        <div class="nx-s8">${ui.card({ title: 'Labour demand vs crew capacity', sub: 'Planned labour hours per week by skill, against available crew hours (8 weeks)', body: ui.chart('wl', 'lg') })}</div>
        <div class="nx-s4">${ui.card({ title: 'Capacity by skill', sub: 'Open demand in crew-days vs crews holding the skill', body: ui.chart('cap', 'lg') })}</div></div>
        <div class="nx-row nx-c2">
          ${ui.card({ exp: true, title: 'Backlog burn-down', sub: 'Projected open labour hours over the next 12 weeks: in-house crews only vs with two contractor crews', body: ui.chart('wl-burn') })}
          ${ui.card({ title: 'Peak weekly crew load by depot', sub: 'Demand on each depot’s crews against the hours they can give (8 weeks)', body: ui.chart('wl-dep') })}
        </div>
        ${ui.card({ title: 'Skill gap', sub: 'Where demand outruns qualified crews over the next 8 weeks', flush: true, body: ui.table({ rows: Object.keys(SKILL_LABEL).map((s) => { const dem = openWO.filter((w) => w.skill === s).reduce((a, w) => a + w.labourH, 0); const crews = net.crews.filter((c) => c.skill === s); const cap = crews.reduce((a, c) => a + c.size * 40 * 8 * 0.12, 0); return { s, dem, crews: crews.length, cap, ratio: cap ? dem / cap : 9 }; }), cols: [{ key: 's', label: 'Skill', render: (r) => `<b>${SKILL_LABEL[r.s]}</b>` }, { key: 'crews', label: 'Crews', align: 'r' }, { key: 'dem', label: 'Open demand h', align: 'r', render: (r) => fmt.n(r.dem) }, { key: 'cap', label: 'Allocable h (8 wk)', align: 'r', render: (r) => fmt.n(r.cap) }, { key: 'ratio', label: 'Load', render: (r) => ui.meter(Math.min(r.ratio * 100, 150), 150, r.ratio > 1 ? '#dc2626' : r.ratio > 0.8 ? '#d97706' : '#16a34a', `${fmt.n(r.ratio * 100)}%`) }, { key: 'x', label: 'Action', sort: false, render: (r) => (r.ratio > 1 ? ui.badge('Add contractor crew', 'crit') : r.ratio > 0.8 ? ui.badge('Watch', 'warn') : ui.badge('Covered', 'ok')) }] }) })}
      </div>`,
      mount: (st, ctx) => {
        const weeks = Array.from({ length: 8 }, (_, i) => `W${47 + i}`);
        const skills = Object.keys(SKILL_LABEL);
        const series = skills.map((s, i) => ({ name: SKILL_LABEL[s], stack: 'd', data: weeks.map((_, k) => Math.round(visits.filter((v) => Math.floor(daysBetween(AS_OF, v.start) / 7) === k).flatMap((v) => v.wos).filter((w) => w.skill === s).reduce((a, w) => a + w.labourH, 0) + (k > 2 ? openWO.filter((w) => w.skill === s).length * (3 + i) : 0))) }));
        const capacity = weeks.map(() => Math.round(net.crews.reduce((a, c) => a + c.size * 40, 0) * 0.15));
        ctx.chart('wl', { ...ch.bar({ x: weeks, series, stack: true }), series: [...series.map((s, i) => ({ type: 'bar', stack: 'd', name: s.name, data: s.data, itemStyle: { color: ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#84cc16', '#0f172a'][i] } })), { type: 'line', name: 'Allocable capacity', data: capacity, lineStyle: { color: '#dc2626', type: 'dashed', width: 2 }, itemStyle: { color: '#dc2626' }, symbol: 'none' }] });
        const openH = openWO.reduce((a, w) => a + w.labourH, 0); const inflow = 48; const capW = Math.round(net.crews.reduce((a, c) => a + c.size * 40, 0) * 0.15 * 0.55);
        const wk = Array.from({ length: 13 }, (_, i) => `W${47 + i}`);
        let x1 = openH; let x2 = openH; const a1 = []; const a2 = [];
        wk.forEach(() => { a1.push(Math.round(x1)); a2.push(Math.round(x2)); x1 = Math.max(0, x1 + inflow - capW); x2 = Math.max(0, x2 + inflow - capW - 2 * 6 * 40 * 0.25); });
        ctx.chart('wl-burn', { ...ch.line({ x: wk, series: [{ name: 'In-house only', data: a1, color: '#dc2626', area: true, areaAlpha: '18' }, { name: '+2 contractor crews', data: a2, color: '#2563eb', area: true, areaAlpha: '18' }], yName: 'open labour h', yMin: 0 }), tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt.n(v)} h` } });
        ctx.chart('wl-dep', ch.bar({ x: net.depots.map((d) => d.short), series: [{ name: 'Peak demand h/wk', color: '#f59e0b', data: net.depots.map((d) => Math.round(openWO.filter((w) => crewById.get(w.crew)?.base === d.id).reduce((a, w) => a + w.labourH, 0) / 6)) }, { name: 'Allocable h/wk', color: '#2563eb', data: net.depots.map((d) => Math.round(net.crews.filter((c) => c.base === d.id).reduce((a, c) => a + c.size * 40 * 0.55, 0))) }], yName: 'h / week', labels: true }));
        ctx.chart('cap', { tooltip: {}, radar: { indicator: skills.map((s) => ({ name: SKILL_LABEL[s], max: 30 })), radius: '64%', axisName: { color: '#475569', fontSize: 10.5 }, splitArea: { areaStyle: { color: ['#f8fafc', '#fff'] } } }, legend: { bottom: 0 }, series: [{ type: 'radar', data: [{ name: 'Demand (crew-days)', value: skills.map((s) => Math.round(openWO.filter((w) => w.skill === s).reduce((a, w) => a + w.labourH, 0) / 10)), areaStyle: { color: 'rgba(239,68,68,.18)' }, lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' } }, { name: 'Capacity (crew-days)', value: skills.map((s) => net.crews.filter((c) => c.skill === s).length * 9), areaStyle: { color: 'rgba(37,99,235,.15)' }, lineStyle: { color: '#2563eb' }, itemStyle: { color: '#2563eb' } }] }] });
      },
    },
  ],
};

const scheduling = {
  id: 'crews', name: 'Crew Scheduling', icon: 'calendar',
  tabs: [
    {
      name: 'Crew board', icon: 'calendar',
      render: () => {
        const head = `<div class="ops-h ops-crew" style="text-align:left">Crew</div>${DAYS.map((d, i) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return `<div class="ops-h${i === 0 ? ' is-today' : ''}${dow === 0 || dow === 6 ? ' is-we' : ''}">${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}<br/>${fmt.short(d)}</div>`; }).join('')}`;
        const rows = net.crews.map((c) => `<div class="ops-crew" data-crew="${esc(c.id)}" style="cursor:pointer"><b>${esc(c.id)} · ${esc(c.name.split(' ').slice(0, 2).join(' '))}</b><small>${esc(SKILL_LABEL[c.skill])} · ${c.size} ppl · ${esc(c.baseName)}</small></div>${DAYS.map((d, i) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); const items = schedule.get(c.id)[i]; return `<div class="${dow === 0 || dow === 6 ? 'is-we' : ''}">${items.map((x) => (x.kind === 'job' ? `<span class="ops-chip" style="background:#d97706" data-wo="${esc(x.w.id)}" title="${esc(x.w.id)} in progress">${esc(x.w.id)}</span>` : `<span class="ops-chip${x.v.outage ? ' is-out' : ''}" style="background:${x.v.outage ? '#7c3aed' : CORR_COLOR[x.v.corridor]}" data-visit="${esc(x.v.id)}" title="${esc(x.v.id)} · ${esc(x.v.window)}">${esc(x.v.id)}</span>`)).join('')}</div>`; }).join('')}`).join('');
        const booked = net.crews.reduce((a, c) => a + DAYS.filter((_, i) => schedule.get(c.id)[i].length).length, 0);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Crew-days booked (14 d)', value: booked, icon: 'calendar', sub: `of ${net.crews.length * 10} working crew-days` },
            { label: 'Crews in field today', value: net.crews.filter((c) => c.status !== 'available').length, icon: 'truck', tone: 'warn', sub: `${net.crews.filter((c) => c.status === 'available').length} available at depots` },
            { label: 'Outage visits booked', value: visits.filter((v) => v.outage).length, icon: 'outage', tone: 'violet', sub: 'Need switching programmes' },
            { label: 'Utilisation now', value: '—', live: 'OPS.UTIL', unit: '%', icon: 'gauge', tone: 'ok', sub: 'Planner target 75–88 %' },
          ])}
          ${ui.card({ exp: true, title: 'Crew × day board', sub: 'Next 14 days, as placed by the scheduling heuristic. Amber = job in progress · violet = outage visit · corridor colour = live-line visit. Click any block.', tools: ui.btn('Auto-level workload', { sm: true, ic: 'ai', attrs: 'data-level' }), body: `<div style="overflow-x:auto"><div class="ops-board">${head}${rows}</div></div>` })}
        </div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '[data-wo]', (e, b) => showWO(b.dataset.wo));
        ctx.on('click', '[data-visit]', (e, b) => openVisit(visits.find((v) => v.id === b.dataset.visit)));
        ctx.on('click', '[data-crew]', (e, b) => openCrew(b.dataset.crew));
        ctx.on('click', '[data-level]', () => toast('optimiser (illustrative result, not validated): proposes moving 3 visits, estimated peak crew load 94 % → 86 %. Nothing was changed.'));
      },
    },
    {
      name: 'Utilisation', icon: 'gauge',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">
        <div class="nx-s8">${ui.card({ exp: true, title: 'Planned load per crew-day', sub: 'Booked hours as a share of a 10-hour field day (heat), next 14 days', body: ui.chart('uh', 'lg') })}</div>
        <div class="nx-s4">${ui.card({ title: 'Fleet utilisation', sub: 'Live, from vehicle telematics and time bookings', body: ui.chart('ug', 'lg') })}</div></div>
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Utilisation by crew', sub: 'Productive hours this week vs travel & standby', body: ui.chart('ub', 'md') })}
        ${ui.card({ cls: 'nx-s5', title: 'Why crews stand by', sub: 'Non-productive hours this month by cause', body: ui.chart('us-cause', 'md') })}</div>
        ${ui.card({ title: 'Working-time compliance', sub: 'Hours booked per person this week against the 48 h limit (EU Working Time Directive practice)', body: ui.chart('us-wtd', 'sm') })}</div>`,
      mount: (st, ctx) => {
        ctx.chart('uh', ch.heat({ x: DAYS.map(fmt.short), y: net.crews.map((c) => c.id), data: net.crews.flatMap((c, yi) => DAYS.map((_, xi) => [xi, yi, Math.round(Math.min(120, crewHours(c.id, xi) * 10))])), min: 0, max: 120, label: true, fmtv: (v) => `${v}%`, colors: ['#f8fafc', '#bbf7d0', '#fde68a', '#f97316', '#b91c1c'] }));
        const g = () => ch.gauge({ value: +live.get('OPS.UTIL').toFixed(1), unit: '%', name: 'Utilisation', bands: [[0.6, '#f59e0b'], [0.88, '#16a34a'], [1, '#dc2626']], dec: 0 });
        ctx.chart('ug', g()).then((c) => ctx.onLive(() => c && !c.isDisposed() && c.setOption(g())));
        ctx.chart('us-cause', { ...ch.donut({ data: [{ name: 'Weather (wind > 12 m/s)', value: 46, color: '#0ea5e9' }, { name: 'Waiting for permit / isolation', value: 31, color: '#7c3aed' }, { name: 'Material not on site', value: 18, color: '#f59e0b' }, { name: 'Travel between sites', value: 39, color: '#94a3b8' }, { name: 'Access / landowner', value: 9, color: '#ef4444' }], center: 'hours', legend: 'right' }), tooltip: { trigger: 'item', formatter: (q) => `${q.name}<br/><b>${q.value} h</b> (${q.percent}%)` } });
        const pb = [[0, 32], [32, 36], [36, 40], [40, 44], [44, 48], [48, 99]];
        ctx.chart('us-wtd', { ...ch.bar({ x: pb.map(([a, b]) => (b === 99 ? '> 48 h' : `${a}–${b} h`)), series: [{ name: 'People', data: pb.map(([a, b]) => ({ value: net.people.filter((p) => p.hoursWeek >= a && p.hoursWeek < b).length, itemStyle: { color: a >= 48 ? '#dc2626' : a >= 44 ? '#f59e0b' : '#16a34a', borderRadius: [4, 4, 0, 0] } })) }], labels: true, legend: false, yName: 'people' }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name} booked this week<br/><b>${ps[0].value} people</b>` } });
        ctx.chart('ub', ch.bar({ x: net.crews.map((c) => c.id), stack: true, series: [{ name: 'Productive', color: '#16a34a', data: net.crews.map((c) => Math.round(c.hoursWeek * c.utilisation / 100)) }, { name: 'Travel', color: '#7c3aed', data: net.crews.map((c, i) => Math.round(c.hoursWeek * (0.08 + (i % 3) * 0.03))) }, { name: 'Standby / weather', color: '#cbd5e1', data: net.crews.map((c) => Math.max(0, Math.round(c.hoursWeek * (1 - c.utilisation / 100) - 3))) }], yName: 'h / week' }));
      },
    },
    {
      name: 'Roster', icon: 'users',
      render: () => `<div class="nx-page"><div class="nx-row nx-c4">${net.crews.map((c) => { const m = net.people.filter((p) => p.crew === c.id); const exp = m.filter((p) => p.certs.some((x) => x.state !== 'valid')).length; return ui.card({ title: `${c.id} · ${c.name}`, sub: `${c.lead} · ${c.baseName}`, tools: ui.badge(c.status, c.status === 'on site' ? 'warn' : c.status === 'travelling' ? 'violet' : 'ok'), body: `${ui.kv([['Skill', SKILL_LABEL[c.skill]], ['Vehicle', `<span style="font-weight:500">${esc(c.vehicle)}</span>`], ['Members', m.length], ['Cert. attention', exp ? ui.badge(`${exp} people`, 'warn') : ui.badge('All valid', 'ok')]])}<div class="nx-list" style="margin-top:8px">${m.slice(0, 4).map((p) => ui.li({ ic: 'hardhat', title: p.name, sub: p.role, end: `<span class="nx-note">${p.years} y</span>` })).join('')}</div>`, attrs: `data-crew="${esc(c.id)}" style="cursor:pointer"` }); }).join('')}</div></div>`,
      mount: (st, ctx) => ctx.on('click', '[data-crew]', (e, b) => openCrew(b.dataset.crew)),
    },
  ],
};

const APPROVAL_STEPS = [['Reliability engineer', 'Technical review of defect evidence'], ['Asset manager', 'Cost authority (< $10k area, < $50k region)'], ['Outage planning', 'Window & switching programme (outage jobs)'], ['Dispatch', 'Crew, permits and materials released']];
const approvalOf = (w, i) => {
  const lvl = { requested: 0, approved: 2, planned: 3, scheduled: 4, in_progress: 4, completed: 4 }[w.stage];
  const ageD = Math.max(1, (i * 7) % 19);
  return { lvl, ageD, sla: w.priority === 'high' ? 3 : w.priority === 'medium' ? 7 : 14, approver: ['A. Hasanova (Rel. Eng.)', 'F. Abbasov (Asset Mgr North)', 'Outage Planning Desk', 'Dispatch — Control Room'][Math.min(lvl, 3)] };
};
const approvals = {
  id: 'approvals', name: 'Approval Workflows', icon: 'checkCircle', count: openWO.filter((w) => w.stage === 'requested').length || null,
  tabs: [
    {
      name: 'Approval board', icon: 'flow',
      render: () => {
        const cols = ['requested', 'approved', 'planned', 'scheduled'].map((s) => ({ title: STAGE_LABEL[s], color: STAGE_COLOR[s], items: openWO.filter((w) => w.stage === s).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).map((w) => ({ id: w.id, title: w.id, badge: sevBadge(w.severity), text: `${esc(fmt.title(w.work_type))} · ${esc(w.towerName || w.asset)}`, meta: `<span>${esc(w.corridor)}</span><span>·</span><span>${fmt.money(w.estCost)}</span><span>·</span><span>${esc(w.crew)}</span>${w.outage ? ui.badge('Outage', 'violet', { dot: false }) : ''}${overdue(w) ? ui.badge('Late', 'crit', { dot: false }) : ''}` })) }));
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Awaiting first approval', value: openWO.filter((w) => w.stage === 'requested').length, icon: 'clock', tone: 'warn', sub: 'Reliability engineer queue' },
            { label: 'Median approval cycle', value: '4.2', unit: 'days', icon: 'flow', sub: 'Request → scheduled', delta: -18, deltaInvert: true },
            { label: 'Breaching SLA', value: openWO.filter((w, i) => approvalOf(w, i).ageD > approvalOf(w, i).sla && w.stage === 'requested').length, icon: 'event', tone: 'crit', sub: 'P1 3 d · P2 7 d · P3 14 d' },
            { label: 'Auto-approved', value: '38', unit: '%', icon: 'ai', tone: 'ok', sub: '< $5k, live-line, known defect class' },
          ])}
          ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Approval pipeline', sub: 'Drag-free review: click a card to see its approval chain and approve or return it', body: ui.kanban(cols) })}
        </div>`;
      },
      mount: (st, ctx) => ctx.on('click', '.nx-tile[data-row]', (e, t) => openApproval(t.dataset.row)),
    },
    {
      name: 'Approval chain', icon: 'checkCircle',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">
        <div class="nx-s8">${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Approvals in flight', sub: 'Current step, approver and age against the SLA for each open order', flush: true, tools: ui.search('#ops-ap', 'Filter…'), body: ui.table({ id: 'ops-ap', rowId: (w) => w.id, rows: openWO.filter((w) => w.stage !== 'in_progress'), cols: [
          { key: 'id', label: 'Order', render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub">${esc(fmt.title(w.work_type))}</span>` },
          { key: 'severity', label: 'Severity', render: (w) => sevBadge(w.severity), sort: (w) => SEV_ORDER[w.severity] },
          { key: 'estCost', label: 'Value', align: 'r', render: (w) => fmt.money(w.estCost) },
          { key: 'step', label: 'Chain', sort: (w) => approvalOf(w, WO.indexOf(w)).lvl, render: (w) => { const a = approvalOf(w, WO.indexOf(w)); return `<div class="ops-steps" style="width:120px">${APPROVAL_STEPS.map((_, k) => `<i class="${k < a.lvl ? 'is-done' : k === a.lvl ? 'is-cur' : ''}"></i>`).join('')}</div><span class="nx-sub">${a.lvl >= 4 ? 'Released' : esc(APPROVAL_STEPS[a.lvl][0])}</span>`; } },
          { key: 'approver', label: 'With', render: (w) => esc(approvalOf(w, WO.indexOf(w)).approver) },
          { key: 'age', label: 'Age / SLA', align: 'r', sort: (w) => approvalOf(w, WO.indexOf(w)).ageD, render: (w) => { const a = approvalOf(w, WO.indexOf(w)); const late = a.ageD > a.sla && a.lvl < 4; return `<b style="color:${late ? '#b91c1c' : 'inherit'}">${a.ageD} d</b><span class="nx-sub">SLA ${a.sla} d</span>`; } },
        ] }) })}</div>
        <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
          ${ui.card({ title: 'Where orders wait', sub: 'Open orders by approval step', body: ui.chart('ap-d') })}
          ${ui.card({ title: 'Cycle time per step', sub: 'Median days spent at each approval step, last 90 days', body: ui.chart('ap-c') })}
          ${ui.card({ title: 'Delegation of authority', sub: 'Open orders by value band — who must sign', body: ui.chart('ap-doa', 'sm') })}
          ${ui.card({ title: 'SLA breaches by priority', sub: 'Orders waiting longer than their approval SLA', body: ui.chart('ap-sla', 'sm') })}
        </div></div></div>`,
      mount: (st, ctx) => {
        const counts = [0, 0, 0, 0, 0]; openWO.forEach((w) => { counts[approvalOf(w, WO.indexOf(w)).lvl] += 1; });
        ctx.chart('ap-d', ch.donut({ data: [...APPROVAL_STEPS.map((s, i) => ({ name: s[0], value: counts[i] })), { name: 'Released', value: counts[4] }], center: 'open', colors: ['#94a3b8', '#0ea5e9', '#8b5cf6', '#f59e0b', '#16a34a'] }));
        ctx.chart('ap-c', ch.bar({ x: APPROVAL_STEPS.map((s) => s[0]), horizontal: true, labels: true, series: [{ name: 'Median days', data: [1.4, 2.1, 3.6, 0.8], color: '#6366f1' }], grid: { top: 8 } }));
        const bands = [['< $5k', 0, 5000], ['$5–10k', 5000, 10000], ['$10–50k', 10000, 50000], ['> $50k', 50000, 1e9]];
        ctx.chart('ap-doa', { ...ch.bar({ x: bands.map((b) => b[0]), series: [{ name: 'Open orders', color: '#6366f1', data: bands.map(([, a, b]) => openWO.filter((w) => w.estCost >= a && w.estCost < b).length) }], labels: true, legend: false }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}: <b>${ps[0].value} open orders</b><br/>Signed by ${['auto-approval rules', 'area asset manager', 'regional asset manager', 'head of transmission maintenance'][ps[0].dataIndex]}` } });
        const pr = ['high', 'medium', 'low'];
        ctx.chart('ap-sla', ch.bar({ x: pr.map((x) => `${fmt.title(x)} (SLA ${x === 'high' ? 3 : x === 'medium' ? 7 : 14} d)`), stack: true, series: [{ name: 'Within SLA', color: '#16a34a', data: pr.map((x) => openWO.filter((w) => w.priority === x && (() => { const a = approvalOf(w, WO.indexOf(w)); return a.lvl >= 4 || a.ageD <= a.sla; })()).length) }, { name: 'Breaching', color: '#dc2626', data: pr.map((x) => openWO.filter((w) => w.priority === x && (() => { const a = approvalOf(w, WO.indexOf(w)); return a.lvl < 4 && a.ageD > a.sla; })()).length) }] }));
        ctx.on('click', 'tr[data-row]', (e, r) => openApproval(r.dataset.row));
      },
    },
  ],
};
function openApproval(id) {
  const w = woById.get(id); if (!w) return;
  const a = approvalOf(w, WO.indexOf(w));
  const doa = w.estCost < 10000 ? 'Area asset manager (< $10k)' : w.estCost < 50000 ? 'Regional asset manager (< $50k)' : 'Head of transmission maintenance';
  drawer.open({
    icon: 'checkCircle', kicker: 'Approval chain', title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${fmt.money(w.estCost)} · ${w.outage ? 'needs outage' : 'live-line'}`,
    badges: [[fmt.title(w.severity), SEV_TONE[w.severity]], [STAGE_LABEL[w.stage], STAGE_TONE[w.stage]], [`SLA ${a.sla} d`, a.ageD > a.sla ? 'crit' : 'muted'], [a.lvl >= 4 ? 'Released' : `With ${APPROVAL_STEPS[a.lvl][0]}`, 'accent']],
    body: `${ui.stats([{ label: 'Value', value: fmt.money(w.estCost) }, { label: 'Waiting', value: `${a.ageD} d`, color: a.ageD > a.sla ? '#b91c1c' : undefined }, { label: 'SLA', value: `${a.sla} d` }, { label: 'Steps done', value: `${Math.min(a.lvl, 4)} / 4` }])}
      <div class="nx-drawer-grid">${sec('Chain', ui.timeline(APPROVAL_STEPS.map((s2, k) => ({ when: k < a.lvl ? `Approved · ${fmt.date(addDays(w.created_at, 1 + k * 2))}` : k === a.lvl ? `Waiting ${a.ageD} d` : 'Pending', title: s2[0], text: esc(s2[1]), tone: k < a.lvl ? 'ok' : k === a.lvl ? 'warn' : 'muted' }))))}
      ${sec('Decision basis', `${ui.kv([['Delegated authority', esc(doa)], ['Outage needed', w.outage ? 'Yes — window & switching programme' : 'No — live-line'], ['Crew skill', esc(SKILL_LABEL[w.skill])], ['Grouped in', visitOf.get(w.id)?.id || '—'], ['Auto-approval', w.estCost < 5000 && !w.outage ? 'Eligible' : 'Not eligible']])}<div class="nx-chart" style="height:120px;margin-top:8px" data-chart="ap-age"></div>`)}</div>
      ${sec('Evidence', `${w.findings.length ? `<div class="ops-ev" style="margin-bottom:10px">${w.findings.slice(0, 2).map((f, i) => evImg(f, i)).join('')}</div>` : ''}<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: `${f.finding_id} · ${f.label}`, sub: `${Math.round(f.confidence * 100)}% · reviewed by ${esc(f.confirmed_by || 'pending')}`, end: sevBadge(f.severity) })).join('') || ui.empty('No linked findings')}</div>`)}`,
    mount: (el, c) => c.chart('[data-chart="ap-age"]', { ...ch.bar({ x: ['Waiting now', 'SLA'], series: [{ name: 'Days', data: [{ value: a.ageD, itemStyle: { color: a.ageD > a.sla ? '#dc2626' : '#2563eb' } }, { value: a.sla, itemStyle: { color: '#cbd5e1' } }] }], horizontal: true, legend: false, labels: true, grid: { top: 4, left: 4 } }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}: <b>${ps[0].value} days</b>` } }),
    actions: [{ label: 'Return with comment', icon: 'back', onClick: (close) => { toast(`${w.id} returned to requester`, 'warn'); close(); } }, { label: a.lvl >= 4 ? 'Released' : `Approve as ${APPROVAL_STEPS[Math.min(a.lvl, 3)][0]}`, primary: true, icon: 'check', onClick: (close) => { toast(`${w.id} approved — moved to ${APPROVAL_STEPS[Math.min(a.lvl + 1, 3)][0]}`); close(); } }],
  });
}

let selJob = inProg[0]?.id;
const CHECK = [['Permit verified on site', 'PTW/LLW scanned · Senior AP present'], ['Toolbox talk & risk assessment', 'Signed by all crew members'], ['Isolation proved & earths applied', 'Voltage detector + portable earths'], ['Pre-work photos', 'Geo-tagged, 4 views'], ['Repair task executed', 'Steps per method statement'], ['Torque / test records', 'Values captured on device'], ['After-work photos', 'Same 4 views'], ['Earths removed & permit cancelled', 'Crew withdrawn · line handed back']];
const stepAt = (pctv) => Math.min(CHECK.length, Math.floor((pctv / 100) * CHECK.length));
function phoneHtml(w) {
  if (!w) return '';
  const p = live.get(`JOB.${w.id}.PCT`) || 0; const k = stepAt(p);
  return `<div class="nx-phone"><div class="nx-phone-scr"><div class="nx-phone-notch"></div><div class="nx-phone-status"><span>${new Date().toTimeString().slice(0, 5)}</span><span>5G ▮▮▮</span></div>
    <div style="padding:8px 14px 10px;background:#0b1220;color:#fff"><div style="font-size:10.5px;color:#7dd3fc;letter-spacing:.08em">NEXUS FIELD · ${esc(w.crew)}</div><div style="font-weight:700;font-size:14px;margin-top:2px">${esc(w.id)} · ${esc(fmt.title(w.work_type))}</div><div style="font-size:11px;color:#94a3b8">${esc(w.towerName || w.asset)} · ${esc(lineShort(w.line))}</div>
    <div class="nx-bar" style="margin-top:8px;background:#1e293b"><i data-live-w="JOB.${esc(w.id)}.PCT" style="background:#22c55e"></i></div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;margin-top:4px"><span><b data-live="JOB.${esc(w.id)}.PCT" style="color:#fff">—</b>% complete</span><span>Wind <b data-live="SITE.WIND" style="color:#fff">—</b> m/s</span></div></div>
    <div style="flex:1;overflow:auto">${CHECK.map(([t, s], i) => `<div class="ops-phone-li ${i < k ? 'is-done' : i === k ? 'is-cur' : ''}"><span class="ops-tick">${i < k ? '✓' : ''}</span><div><b>${esc(t)}</b><small>${esc(s)}</small></div></div>`).join('')}</div>
    <div style="padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;gap:6px;background:#fff"><span class="nx-btn is-sm" style="flex:1">${icon('camera')}Photo</span><span class="nx-btn is-sm is-primary" style="flex:1">${icon('check')}Next step</span></div></div></div>`;
}
const execution = {
  id: 'execution', name: 'Field Execution', icon: 'hardhat',
  tabs: [
    {
      name: 'Live jobs', icon: 'pulse',
      render: () => `<div class="nx-page">
        ${ui.kpis([
          { label: 'Jobs active', value: '—', live: 'OPS.ACTIVE', icon: 'hardhat', tone: 'warn', sub: `${inProg.length} started today or earlier` },
          { label: 'Site wind (limit 10 m/s)', value: '—', live: 'SITE.WIND', unit: 'm/s', icon: 'wind', tone: 'info', sub: 'Work at height stops above 12 m/s', spark: live.hist('SITE.WIND').slice(-40), sparkColor: '#0284c7' },
          { label: 'Permits active', value: net.permits.filter((p) => p.state === 'active').length, icon: 'key', tone: 'crit', sub: 'All with earths proved' },
          { label: 'First-time fix rate', value: '92.4', unit: '%', icon: 'checkCircle', tone: 'ok', sub: 'Closed without revisit, 90 d', delta: 2.1 },
        ])}
        <div class="nx-row" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start">
          <div class="ops-jobs">${inProg.map((w) => { const c = crewById.get(w.crew); return `<div class="ops-job${w.id === selJob ? ' is-sel' : ''}" data-job="${esc(w.id)}"><div class="ops-job-h"><span class="nx-li-ico" style="background:${SEV[w.severity]}1a;color:${SEV[w.severity]}">${icon('wrench')}</span><div style="min-width:0;flex:1"><b>${esc(w.id)} · ${esc(fmt.title(w.work_type))}</b><div class="nx-note">${esc(w.towerName || w.asset)} · ${esc(w.corridor)}</div></div>${sevBadge(w.severity)}</div>
            <div><div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--nx-muted)"><span>Progress</span><b style="color:var(--nx-ink)"><span data-live="JOB.${esc(w.id)}.PCT">—</span>%</b></div><div class="nx-bar" style="margin-top:5px"><i data-live-w="JOB.${esc(w.id)}.PCT" style="background:${SEV[w.severity]}"></i></div></div>
            ${ui.kv([['Crew', `${esc(c?.id)} · ${c?.size} ppl`], ['Labour booked', `<span data-live="JOB.${esc(w.id)}.HRS">—</span> / ${w.labourH} h`], ['Permit', esc(net.permits.find((p) => p.wo === w.id)?.id || 'LLW')]])}</div>`; }).join('')}</div>
          <div style="position:sticky;top:0;display:flex;flex-direction:column;gap:16px;align-items:stretch"><div style="display:flex;justify-content:center" id="ops-phone">${phoneHtml(woById.get(selJob))}</div>
            ${ui.card({ title: 'Selected job: progress vs plan', sub: 'Live % complete against the planned straight line', body: ui.chart('job-s', 'sm') })}
            ${ui.card({ title: 'Labour burn today', sub: 'Hours booked on each active job against its estimate', body: ui.chart('job-burn', 'md') })}</div>
        </div></div>`,
      mount: (st, ctx) => {
        ctx.on('click', '[data-job]', (e, el) => { selJob = el.dataset.job; st.querySelectorAll('.ops-job').forEach((x) => x.classList.toggle('is-sel', x === el)); st.querySelector('#ops-phone').innerHTML = phoneHtml(woById.get(selJob)); live.paint(st); });
        const sCurve = () => { const w = woById.get(selJob); if (!w) return null; const h = live.hist(`JOB.${w.id}.PCT`).slice(-60); const p0 = h[0] || 0; return { ...ch.line({ x: h.map((_, i) => `${60 - i}s`), series: [{ name: 'Actual %', data: h.map((v) => +v.toFixed(1)), color: SEV[w.severity], area: true }, { name: 'Plan %', data: h.map((_, i) => +(p0 + (i / 59) * 1.2).toFixed(1)), color: '#94a3b8', dash: true }], yName: '%', grid: { top: 26 } }), animation: false, tooltip: { trigger: 'axis', valueFormatter: (v) => `${v} %` } }; };
        ctx.chart('job-s', sCurve()).then((c) => ctx.onLive(() => { const o = sCurve(); if (c && !c.isDisposed() && o) c.setOption(o); }));
        const burn = () => ({ ...ch.bar({ x: inProg.map((w) => w.id), horizontal: true, series: [{ name: 'Booked h', color: '#f59e0b', data: inProg.map((w) => +(live.get(`JOB.${w.id}.HRS`) || 0).toFixed(1)) }, { name: 'Estimate h', color: '#cbd5e1', data: inProg.map((w) => w.labourH) }], grid: { left: 4, top: 26 } }), animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} h` } });
        ctx.chart('job-burn', burn()).then((c) => ctx.every(3000, () => c && !c.isDisposed() && c.setOption(burn())));
        ctx.on('click', '[data-job]', () => { const o = sCurve(); const el = st.querySelector('[data-chart="job-s"]'); if (o && el) ctx.chart(el, o); });
        let lastK = -1;
        ctx.onLive(() => { const w = woById.get(selJob); if (!w) return; const k = stepAt(live.get(`JOB.${w.id}.PCT`)); if (k !== lastK) { lastK = k; st.querySelector('#ops-phone').innerHTML = phoneHtml(w); live.paint(st.querySelector('#ops-phone')); } });
      },
    },
    {
      name: 'Turnaround time', icon: 'clock',
      render: () => `<div class="nx-page">
        ${ui.kpis([
          { label: 'Median TAT', value: tatStats.median, unit: 'days', icon: 'clock', sub: 'Defect confirmed → field closure' },
          { label: 'Mean TAT', value: fmt.n(tatStats.mean, 0), unit: 'days', icon: 'trend', tone: 'info', sub: `${tatStats.rows.length} closed orders` },
          { label: 'P90 TAT', value: tatStats.p90, unit: 'days', icon: 'event', tone: 'warn', sub: 'Long tail = outage-bound jobs' },
          { label: 'Closed within 60 d', value: fmt.n(tatStats.within60, 0), unit: '%', icon: 'target', tone: 'ok', sub: 'Utility target 70 %' },
        ])}
        <div class="nx-row nx-c2">
          ${ui.card({ title: 'Where the time goes', sub: 'Average days per lifecycle stage, by task type (closed orders)', body: ui.chart('tat-stage', 'lg') })}
          ${ui.card({ title: 'Turnaround distribution', sub: 'Closed orders by days from defect confirmation to closure', body: ui.chart('tat-hist', 'lg') })}
        </div>
        <div class="nx-row nx-c2">
          ${ui.card({ title: 'Lifecycle funnel', sub: 'Defects confirmed this year and how far they have progressed', body: ui.chart('tat-fun', 'lg') })}
          ${ui.card({ title: 'Turnaround by severity vs target', sub: 'Median days to closure per defect severity; dashed = policy target', body: ui.chart('tat-sev', 'lg') })}
        </div>
      </div>`,
      mount: (st, ctx) => {
        const types = [...new Set(doneWO.map((w) => w.work_type))];
        const avgOf = (t, k) => { const rs = tatStats.rows.filter((r) => r.w.work_type === t); return rs.length ? Math.round(rs.reduce((a, r) => a + r[k], 0) / rs.length) : 0; };
        ctx.chart('tat-stage', ch.bar({ x: types.map(fmt.title), horizontal: true, stack: true, series: [{ name: 'Confirm → WO', color: '#94a3b8', data: types.map((t) => avgOf(t, 'd1')) }, { name: 'WO → planned date', color: '#6366f1', data: types.map((t) => avgOf(t, 'd2')) }, { name: 'Planned → closed', color: '#f59e0b', data: types.map((t) => avgOf(t, 'd3')) }], grid: { left: 4 } }));
        const b = [[0, 30], [30, 60], [60, 90], [90, 120], [120, 180], [180, 270], [270, 999]];
        ctx.chart('tat-hist', ch.bar({ x: b.map(([a, c]) => (c === 999 ? `${a}+` : `${a}–${c}`)), series: [{ name: 'Closed orders', data: b.map(([a, c]) => ({ value: tatStats.rows.filter((r) => r.total >= a && r.total < c).length, itemStyle: { color: c <= 60 ? '#16a34a' : c <= 120 ? '#f59e0b' : '#dc2626', borderRadius: [4, 4, 0, 0] } })), labels: true }], labels: true, yName: 'orders' }));
        const sv = ['critical', 'high', 'medium', 'low']; const tgt = { critical: 30, high: 60, medium: 120, low: 180 };
        const medSev = sv.map((x) => { const xs = tatStats.rows.filter((r) => r.w.severity === x).map((r) => r.total).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : 0; });
        ctx.chart('tat-sev', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: sv.map(fmt.title) }, yAxis: { type: 'value', name: 'days' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `${ps[0].name}<br/>Median <b>${ps[0].value} d</b> · target ${ps[1]?.value ?? '—'} d` }, series: [{ type: 'bar', name: 'Median TAT', data: sv.map((x, i) => ({ value: medSev[i], itemStyle: { color: medSev[i] > tgt[x] ? '#dc2626' : '#16a34a', borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: 'top', formatter: '{c} d', fontSize: 11 } }, { type: 'scatter', name: 'Target', data: sv.map((x) => tgt[x]), symbol: 'rect', symbolSize: [46, 3], itemStyle: { color: '#0f172a' }, label: { show: true, position: 'right', formatter: 'target {c} d', fontSize: 10, color: '#475569' } }] });
        const conf = net.findings.filter((f) => f.review_status === 'confirmed');
        const stageOfF = new Map(); WO.forEach((w) => (w.finding_ids || []).forEach((id) => stageOfF.set(id, Math.max(stageOfF.get(id) ?? -1, STAGES.indexOf(w.stage)))));
        const confirmed = conf.length;
        const withWO = conf.filter((f) => stageOfF.has(f.finding_id)).length;
        const planned = conf.filter((f) => (stageOfF.get(f.finding_id) ?? -1) >= 2).length;
        const started = conf.filter((f) => (stageOfF.get(f.finding_id) ?? -1) >= 4).length;
        const closedN = conf.filter((f) => closed.has(f.finding_id)).length;
        ctx.chart('tat-fun', { tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b>' }, series: [{ type: 'funnel', left: '10%', width: '80%', top: 6, bottom: 6, sort: 'descending', gap: 3, label: { position: 'inside', color: '#fff', fontWeight: 600, formatter: '{b}  {c}' }, data: [{ name: 'Defects confirmed', value: confirmed, itemStyle: { color: '#64748b' } }, { name: 'Linked to a work order', value: withWO, itemStyle: { color: '#0ea5e9' } }, { name: 'Planned', value: planned, itemStyle: { color: '#6366f1' } }, { name: 'Work started', value: started, itemStyle: { color: '#f59e0b' } }, { name: 'Closed in field', value: closedN, itemStyle: { color: '#16a34a' } }] }] });
      },
    },
    {
      name: 'Closures', icon: 'checkCircle',
      render: () => {
        const rs = net.repairs.filter((r) => r.wo).sort((a, b) => b.date.localeCompare(a.date));
        return `<div class="nx-page"><div class="nx-row nx-c12">
          <div class="nx-s8">${ui.card({ title: 'Field closures', sub: 'Repairs recorded in the field app and the defects each one closed', flush: true, tools: ui.search('#ops-cl', 'Filter…'), body: `<div class="ops-scroll" style="max-height:1180px">${ui.table({ id: 'ops-cl', rows: rs, rowId: (r) => r.wo.id, cols: [
            { key: 'date', label: 'Closed', render: (r) => fmt.date(r.date) },
            { key: 'repair_id', label: 'Repair', render: (r) => `<b>${esc(r.repair_id)}</b><span class="nx-sub">${esc(r.wo.id)}</span>` },
            { key: 'action', label: 'Action', render: (r) => fmt.title(r.action) },
            { key: 'asset', label: 'Asset', render: (r) => `${esc(r.wo.towerName || r.wo.asset)}<span class="nx-sub">${esc(r.wo.corridor)}</span>`, sort: (r) => r.wo.towerName || '' },
            { key: 'n', label: 'Defects closed', align: 'r', render: (r) => r.closes_finding_ids.length, sort: (r) => r.closes_finding_ids.length },
            { key: 'tat', label: 'TAT', align: 'r', render: (r) => (r.wo.ttrDays != null ? `${r.wo.ttrDays} d` : '—'), sort: (r) => r.wo.ttrDays ?? 0 },
            { key: 'ev', label: 'Evidence', sort: false, render: () => ui.badge('Before/after photos', 'ok', { dot: false }) },
          ] })}</div>` })}</div>
          <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
            ${ui.card({ title: 'Closures per month', sub: 'Repairs completed in the field', body: ui.chart('cl-m') })}
            ${ui.card({ title: 'Before / after evidence', sub: `Latest close-out · ${esc(rs[0]?.wo.id || '')} at ${esc(rs[0]?.wo.towerName || '')}`, body: `<div class="ops-ev"><figure><img src="/assets/custom/power-line-inspection.jpg" alt="Before repair" loading="lazy"/><figcaption>Before · ${fmt.short(rs[0]?.wo.created_at)}</figcaption></figure><figure><img src="/assets/custom/hero-drone-inspection.jpg" alt="After repair" loading="lazy"/><figcaption>After · ${fmt.short(rs[0]?.date)}</figcaption></figure></div>` })}
            ${ui.card({ title: 'Defects closed by repair type', sub: 'How many findings each kind of repair retires', body: ui.chart('cl-act', 'sm') })}
            ${ui.card({ title: 'Latest from the field', sub: 'Most recent close-outs', body: ui.timeline(rs.slice(0, 5).map((r) => ({ when: fmt.date(r.date), title: `${r.wo.id} · ${fmt.title(r.action)}`, text: `${esc(r.wo.towerName || r.wo.asset)} · ${r.closes_finding_ids.length} defects closed by ${esc(r.wo.crewName)}`, tone: 'ok' }))) })}
          </div></div></div>`;
      },
      mount: (st, ctx) => {
        const ms = [...new Set(net.repairs.map((r) => r.date.slice(0, 7)))].sort();
        const acts = {}; net.repairs.forEach((r) => { acts[r.action] = (acts[r.action] || 0) + (r.closes_finding_ids?.length || 0); });
        const ae = Object.entries(acts).sort((a, b) => b[1] - a[1]);
        ctx.chart('cl-act', ch.bar({ x: ae.map((e) => fmt.title(e[0])), horizontal: true, labels: true, legend: false, series: [{ name: 'Defects closed', color: '#0f766e', data: ae.map((e) => e[1]) }], grid: { left: 4, top: 6 } }));
        ctx.chart('cl-m', ch.bar({ x: ms.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })), series: [{ name: 'Repairs', color: '#16a34a', data: ms.map((m) => net.repairs.filter((r) => r.date.startsWith(m)).length) }], labels: true }));
        ctx.on('click', 'tr[data-row]', (e, r) => showWO(r.dataset.row));
      },
    },
  ],
};

/* ================================================================== switching & isolation (live SLD) */
const hv = heroVisit;
const heroPermit = net.permits.find((p) => hv.wos.some((w) => w.id === p.wo) && p.code === 'PTW-HV') || { id: 'PTW-HV-2611' };
const PROG = [
  ['A-Q0', 'open', 'Open CB S-1 =E04 Q0', 'S-1 line bay L-220-03 · load transferred to L-500-01/TX path'],
  ['B-Q0', 'open', 'Open CB S-2 =E02 Q0', 'S-2 line bay L-220-03 · line now de-energised'],
  ['A-Q9', 'open', 'Open line disconnector S-1 Q9', 'Visible isolation point · lock & tag LOTO-114'],
  ['B-Q9', 'open', 'Open line disconnector S-2 Q9', 'Visible isolation point · lock & tag LOTO-115'],
  ['A-Q8', 'closed', 'Close line earthing switch S-1 Q8', 'Interlocked: line must be dead'],
  ['B-Q8', 'closed', 'Close line earthing switch S-2 Q8', 'Interlocked: line must be dead'],
  ['WZ-E1', 'closed', `Apply portable earth at ${hv.from}`, 'Prove dead with HV detector first'],
  ['WZ-E2', 'closed', `Apply portable earth at ${hv.to}`, 'Work zone now bounded by earths'],
];
function sldSvg() {
  const W = 1400; const H = 800;
  const kv = 220;
  let s = '';
  // substation enclosures
  s += `<rect x="40" y="40" width="500" height="470" rx="10" fill="none" stroke="#1f2a3a" stroke-dasharray="6 5"/>${sx.text(56, 500, 'SUBSTATION S-1 · 220/132 kV · =S1', { cls: 'sx-tb' })}`;
  s += `<rect x="860" y="40" width="500" height="470" rx="10" fill="none" stroke="#1f2a3a" stroke-dasharray="6 5"/>${sx.text(876, 500, 'SUBSTATION S-2 · 500/220 kV · =S2', { cls: 'sx-tb' })}`;
  // S-1 busbar + transformer bay
  s += sx.bus(70, 510, 270, { kv, net: 'BUSA', label: '220 kV BB1', id: 'BB-S1', tags: [['U', 'SUB-S1.BUS220', 'kV'], ['f', 'SUB-S1.F', 'Hz']] });
  s += sx.lineExit(150, 116, { label: '132 kV BB · S-1', kv: 132, dir: -1 });
  s += sx.xfmr(150, 150, 'TX-1A', { kv1: 132, kv2: 220, label: 'TX-1A', sub: '150 MVA YNd11' });
  s += sx.wire([[150, 184], [150, 196]], { kv, net: 'TXA' }) + sx.cb(150, 210, 'TXA-Q0', { kv, net: 'TXA', label: 'Q0' }) + sx.wire([[150, 224], [150, 236]], { kv, net: 'TXA' }) + sx.ds(150, 250, 'TXA-Q1', { label: 'Q1' }) + sx.wire([[150, 264], [150, 270]], { kv, net: 'BUSA' });
  s += sx.readout(272, 96, [['Load', 'TX-1A.MVA', 'MVA'], ['Top oil', 'TX-1A.TOT', '°C'], ['Hot spot', 'TX-1A.HST', '°C']], { title: 'TX-1A', id: 'TX-1A' });
  // S-1 line bay L-220-03 (=E04)
  const ax = 420;
  s += sx.wire([[ax, 270], [ax, 286]], { kv, net: 'BUSA' }) + sx.ds(ax, 300, 'A-Q1', { label: 'Q1' }) + sx.wire([[ax, 314], [ax, 336]], { kv, net: 'LBA' }) + sx.cb(ax, 350, 'A-Q0', { kv, net: 'LBA', label: 'Q0' }) + sx.wire([[ax, 364], [ax, 390]], { kv, net: 'LBA', flow: 'L-220-03.MW' }) + sx.ct(ax, 378, {}) + sx.ds(ax, 404, 'A-Q9', { label: 'Q9' }) + sx.wire([[ax, 418], [ax, 640], [980, 640], [980, 418]], { kv, net: 'LINE', flow: 'L-220-03.MW' });
  s += sx.es(ax, 440, 'A-Q8', { dir: 1, label: 'Q8' }) + sx.la(ax, 470, { dir: -1, label: 'F1' });
  s += sx.relay(330, 340, '21', { from: [ax - 9, 350], label: 'Distance' }) + sx.relay(330, 392, '87L', { from: [ax - 6, 378], label: 'Line diff.' }) + sx.relay(330, 444, '50/51', { from: [ax - 6, 382], label: 'O/C' });
  s += sx.readout(452, 300, [['P', 'L-220-03.MW', 'MW'], ['Q', 'L-220-03.MVAR', 'Mvar'], ['I', 'L-220-03.I', 'A'], ['U', 'L-220-03.KV', 'kV']], { title: '=E04 L-220-03', w: 130, id: 'BAY-A' });
  // S-2 busbar, line bay (=E02), transformer bay
  s += sx.bus(890, 1330, 270, { kv, net: 'BUSB', label: '220 kV BB1', id: 'BB-S2', tags: [['U', 'SUB-S2.BUS220', 'kV'], ['f', 'SUB-S2.F', 'Hz']] });
  const bx = 980;
  s += sx.wire([[bx, 270], [bx, 286]], { kv, net: 'BUSB' }) + sx.ds(bx, 300, 'B-Q1', { label: 'Q1' }) + sx.wire([[bx, 314], [bx, 336]], { kv, net: 'LBB' }) + sx.cb(bx, 350, 'B-Q0', { kv, net: 'LBB', label: 'Q0' }) + sx.wire([[bx, 364], [bx, 390]], { kv, net: 'LBB', flow: 'L-220-03.MW' }) + sx.ct(bx, 378, {}) + sx.ds(bx, 404, 'B-Q9', { label: 'Q9' });
  s += sx.es(bx, 440, 'B-Q8', { dir: -1, label: 'Q8' }) + sx.la(bx, 470, { dir: 1, label: 'F1' });
  s += sx.relay(1070, 340, '21', { from: [bx + 9, 350], label: 'Distance' }) + sx.relay(1070, 392, '87L', { from: [bx + 6, 378], label: 'Line diff.' }) + sx.relay(1070, 444, '50/51', { from: [bx + 6, 382], label: 'O/C' });
  s += sx.readout(1100, 300, [['U bus', 'SUB-S2.BUS220', 'kV'], ['f', 'SUB-S2.F', 'Hz']], { title: '=E02 L-220-03', w: 130, id: 'BAY-B' });
  s += sx.lineExit(1250, 116, { label: '500 kV BB · L-500-01', kv: 500, dir: -1 });
  s += sx.xfmr(1250, 150, 'TX-2A', { kv1: 500, kv2: 220, label: 'TX-2A', sub: '400 MVA YNyn0' });
  s += sx.wire([[1250, 184], [1250, 196]], { kv, net: 'TXB' }) + sx.cb(1250, 210, 'TXB-Q0', { kv, net: 'TXB', label: 'Q0' }) + sx.wire([[1250, 224], [1250, 236]], { kv, net: 'TXB' }) + sx.ds(1250, 250, 'TXB-Q1', { label: 'Q1' }) + sx.wire([[1250, 264], [1250, 270]], { kv, net: 'BUSB' });
  s += sx.readout(1080, 96, [['Load', 'TX-2A.MVA', 'MVA'], ['Top oil', 'TX-2A.TOT', '°C'], ['Hot spot', 'TX-2A.HST', '°C']], { title: 'TX-2A', id: 'TX-2A' });
  // overhead line with the grouped work zone
  s += sx.text(700, 566, `L-220-03 · Corridor North · ${net.lines.find((l) => l.id === 'L-220-03').lengthKm} km · ACSR 400/51 twin`, { cls: 'sx-t', anchor: 'middle' });
  const tw = (x, name, hot) => `<g><path d="M${x} 600 l-9 40 M${x} 600 l9 40 M${x - 14} 612 h28 M${x - 6} 626 h12" stroke="${hot ? '#fbbf24' : '#64748b'}" stroke-width="1.6" fill="none"/>${sx.text(x, 662, name, { cls: 'sx-ts', anchor: 'middle', color: hot ? '#fde68a' : undefined })}</g>`;
  const heroT = hv.wos.map((w) => net.towerById.get(w.towerId)).filter(Boolean).sort((a, b) => a.idx - b.idx);
  const uniq = [...new Map(heroT.map((t) => [t.id, t])).values()];
  s += tw(470, 'T-001') + tw(540, '…');
  const zx0 = 610; const ZW = 250; const step = uniq.length > 1 ? ZW / (uniq.length - 1) : 0;
  uniq.forEach((t, i) => { s += tw(zx0 + i * step, t.name, true); });
  s += tw(zx0 + ZW + 45, '…') + tw(935, 'T-060');
  s += `<rect x="${zx0 - 40}" y="580" width="${ZW + 80}" height="96" rx="8" fill="rgba(251,191,36,.06)" stroke="#f59e0b" stroke-dasharray="5 4"/>${sx.text(zx0 - 32, 593, `WORK ZONE · ${hv.id}`, { cls: 'sx-ts', color: '#fbbf24' })}<text id="ops-wz-state" x="${zx0 + ZW + 32}" y="593" class="sx-ts" text-anchor="end" style="fill:#dc2626;font-weight:700">NOT EARTHED</text>`;
  s += sx.wire([[zx0 - 26, 640], [zx0 - 26, 712]], { color: '#475569', width: 1.5 }) + sx.es(zx0 - 26, 712, 'WZ-E1', { dir: 1, label: 'PE-1' });
  s += sx.wire([[zx0 + ZW + 26, 640], [zx0 + ZW + 26, 712]], { color: '#475569', width: 1.5 }) + sx.es(zx0 + ZW + 26, 712, 'WZ-E2', { dir: -1, label: 'PE-2' });
  s += sx.frame(W, H, { title: `L-220-03 ISOLATION FOR ${hv.id}`, dno: 'NX-OPS-SLD-0220-ISO', rev: 'D', note: `Switching programme SP-26-114 · permit ${heroPermit.id} · simulation` });
  return s;
}
function lineAlive(sw) {
  const c = (id) => (sw[id] ?? 'closed') === 'closed';
  return (c('A-Q1') && c('A-Q0') && c('A-Q9')) || (c('B-Q1') && c('B-Q0') && c('B-Q9'));
}
function progHtml(sw) {
  const done = PROG.map(([id, want]) => (sw[id] ?? 'closed') === want);
  const next = done.findIndex((d) => !d);
  const n = done.filter(Boolean).length;
  return `<div class="ops-prog-h"><small>SP-26-114 · ${esc(hv.id)}</small><h4>Switching programme</h4><p>Isolate and earth L-220-03 for the grouped Corridor North visit (${esc(hv.from)} → ${esc(hv.to)}). Click a step to select the device on the diagram.</p></div>
    <div class="ops-prog-b">${PROG.map(([id, want, t, sub], i) => `<div class="ops-step${done[i] ? ' is-done' : ''}${i === next ? ' is-next' : ''}" data-step="${esc(id)}"><span class="ops-n">${done[i] ? '✓' : i + 1}</span><div><b>${esc(t)}</b><small>${esc(id)} → ${want === 'open' ? 'OPEN' : 'CLOSED'} · ${esc(sub)}</small></div></div>`).join('')}</div>
    <div class="ops-prog-f"><div style="display:flex;justify-content:space-between"><span>Progress</span><b>${n} / ${PROG.length}</b></div><div class="nx-bar"><i style="width:${(n / PROG.length) * 100}%;background:${n === PROG.length ? '#22c55e' : '#f59e0b'}"></i></div>
    ${n === PROG.length ? `<div class="ops-ok"><b>Line isolated, earthed and proved dead.</b> Permit ${esc(heroPermit.id)} may be issued to ${esc(hv.crew.name)} for ${hv.wos.length} tasks.</div>` : `<div class="ops-wait">Line is <b>${lineAlive(sw) ? 'ENERGISED' : 'DE-ENERGISED'}</b>. Next: ${esc(PROG[next][2])}. Interlocks follow IEC 62271-102.</div>`}
    <div style="display:flex;gap:6px;margin-top:10px"><button type="button" class="nx-btn is-sm" data-reset style="flex:1">Restore normal</button><button type="button" class="nx-btn is-sm is-primary" data-issue ${n === PROG.length ? '' : 'disabled'} style="flex:1">Issue permit</button></div></div>`;
}
const switching = {
  id: 'switching', name: 'Switching & Isolation', icon: 'schematic',
  tabs: [
    {
      name: 'Live single-line', icon: 'schematic', full: true, 
      render: () => '<div class="ops-sw"><div class="nx-hmi is-full" id="ops-hmi"></div><aside class="ops-prog" id="ops-prog"></aside></div>',
      mount: (st, ctx) => {
        const forced = ['L-220-03.MW', 'L-220-03.MVAR', 'L-220-03.KV'];
        ctx.cleanup(() => forced.forEach((t) => live.force(t, null)));
        const swEq = (name, type, interlock, tags = []) => ({ name, type, switch: true, interlock, tags });
        const lineTags = [{ tag: 'L-220-03.MW', label: 'Active power' }, { tag: 'L-220-03.I', label: 'Current' }, { tag: 'L-220-03.KV', label: 'Line voltage' }];
        const equipment = {
          'A-Q0': swEq('S-1 =E04 circuit-breaker Q0', 'SF₆ circuit-breaker 245 kV 3150 A', 'Q8 open', lineTags), 'B-Q0': swEq('S-2 =E02 circuit-breaker Q0', 'SF₆ circuit-breaker 245 kV 3150 A', 'Q8 open', lineTags),
          'A-Q1': swEq('S-1 =E04 busbar disconnector Q1', 'Disconnector, motor-operated', 'Q0 open'), 'B-Q1': swEq('S-2 =E02 busbar disconnector Q1', 'Disconnector, motor-operated', 'Q0 open'),
          'A-Q9': swEq('S-1 =E04 line disconnector Q9', 'Centre-break disconnector', 'Q0 open'), 'B-Q9': swEq('S-2 =E02 line disconnector Q9', 'Centre-break disconnector', 'Q0 open'),
          'A-Q8': swEq('S-1 =E04 line earthing switch Q8', 'Earthing switch', 'Line dead'), 'B-Q8': swEq('S-2 =E02 line earthing switch Q8', 'Earthing switch', 'Line dead'),
          'WZ-E1': swEq(`Portable earth PE-1 at ${hv.from}`, 'Portable earth set 220 kV', 'Line dead, proved'), 'WZ-E2': swEq(`Portable earth PE-2 at ${hv.to}`, 'Portable earth set 220 kV', 'Line dead, proved'),
          'TXA-Q0': swEq('S-1 TX-1A HV breaker Q0', 'SF₆ circuit-breaker', '—', [{ tag: 'TX-1A.MVA', label: 'Load' }]), 'TXA-Q1': swEq('S-1 TX-1A busbar disconnector', 'Disconnector', 'Q0 open'),
          'TXB-Q0': swEq('S-2 TX-2A LV breaker Q0', 'SF₆ circuit-breaker', '—', [{ tag: 'TX-2A.MVA', label: 'Load' }]), 'TXB-Q1': swEq('S-2 TX-2A busbar disconnector', 'Disconnector', 'Q0 open'),
          'TX-1A': { name: 'TX-1A 150 MVA 220/132 kV', type: 'Power transformer ONAN/ONAF', tags: [{ tag: 'TX-1A.MVA', label: 'Load' }, { tag: 'TX-1A.TOT', label: 'Top-oil' }, { tag: 'TX-1A.HST', label: 'Hot-spot' }, { tag: 'TX-1A.H2', label: 'H₂ (online DGA)' }] },
          'TX-2A': { name: 'TX-2A 400 MVA 500/220 kV', type: 'Power transformer ODAF', tags: [{ tag: 'TX-2A.MVA', label: 'Load' }, { tag: 'TX-2A.TOT', label: 'Top-oil' }, { tag: 'TX-2A.HST', label: 'Hot-spot' }, { tag: 'TX-2A.C2H2', label: 'C₂H₂ (online DGA)' }] },
          'BAY-A': { name: 'S-1 bay =E04 metering', type: 'Bay controller / PMU', tags: lineTags }, 'BAY-B': { name: 'S-2 bay =E02 metering', type: 'Bay controller', tags: [{ tag: 'SUB-S2.BUS220', label: 'Bus voltage' }, { tag: 'SUB-S2.F', label: 'Frequency' }] },
          'BB-S1': { name: 'S-1 220 kV busbar BB1', type: 'Air-insulated busbar', tags: [{ tag: 'SUB-S1.BUS220', label: 'Voltage' }, { tag: 'SUB-S1.F', label: 'Frequency' }] }, 'BB-S2': { name: 'S-2 220 kV busbar BB1', type: 'Air-insulated busbar', tags: [{ tag: 'SUB-S2.BUS220', label: 'Voltage' }, { tag: 'SUB-S2.F', label: 'Frequency' }] },
        };
        const prog = st.querySelector('#ops-prog');
        let hmi = null;
        const earths = ['A-Q8', 'B-Q8', 'WZ-E1', 'WZ-E2'];
        const refresh = () => {
          prog.innerHTML = progHtml(hmi.switches);
          const e = earths.filter((id) => hmi.switches[id] === 'closed').length;
          const t = hmi.svg.querySelector('#ops-wz-state');
          if (t) { t.textContent = e === 4 ? 'EARTHED BOTH SIDES' : e ? `EARTHED ${e}/4` : 'NOT EARTHED'; t.style.fill = e === 4 ? '#16a34a' : e ? '#b45309' : '#dc2626'; }
        };
        hmi = ctx.hmi('#ops-hmi', {
          title: 'L-220-03 isolation — S-1 =E04 ↔ S-2 =E02', dno: 'NX-OPS-SLD-0220-ISO', rev: 'D', w: 1400, h: 800, svg: sldSvg(), equipment,
          switches: { 'A-Q8': 'open', 'B-Q8': 'open', 'WZ-E1': 'open', 'WZ-E2': 'open' },
          nets: {
            BUSA: {}, BUSB: {}, TXA: { requires: ['TXA-Q0', 'TXA-Q1'], parent: 'BUSA' }, TXB: { requires: ['TXB-Q0', 'TXB-Q1'], parent: 'BUSB' },
            LBA: { requires: ['A-Q1', 'A-Q0'], parent: 'BUSA' }, LBB: { requires: ['B-Q1', 'B-Q0'], parent: 'BUSB' },
            LA: { requires: ['A-Q9'], parent: 'LBA' }, LB: { requires: ['B-Q9'], parent: 'LBB' }, LINE: { parent: ['LA', 'LB'], tags: forced },
          },
          legend: [{ label: '500 kV', color: '#a855f7' }, { label: '220 kV', color: '#3b82f6' }, { label: '132 kV', color: '#14b8a6' }, { label: 'De-energised', color: '#3a4658' }],
          onSwitch: (id, state, api) => {
            const sw = api.switches; const prev = state === 'closed' ? 'open' : 'closed';
            const refuse = (why) => { api.set(id, prev); toast(`Interlock — ${why}`, 'crit'); };
            const isDs = /-Q[19]$/.test(id); const bay = id.split('-')[0];
            const lineEarthed = earths.some((e) => sw[e] === 'closed');
            if (isDs && sw[`${bay}-Q0`] === 'closed' && !id.startsWith('TX')) return refuse(`${id} cannot make or break load current. Open ${bay}-Q0 first.`);
            if (/^TX.-Q1$/.test(id) && sw[`${bay}-Q0`] === 'closed') return refuse(`${id} cannot break load current. Open ${bay}-Q0 first.`);
            if (earths.includes(id) && state === 'closed' && lineAlive(sw)) return refuse(`${id} refused: L-220-03 is still energised.`);
            if ((/^[AB]-Q[09]$/.test(id)) && state === 'closed' && lineEarthed && lineAlive(sw)) return refuse(`${id} refused: line earths applied — remove earths before re-energising.`);
            refresh();
          },
        });
        refresh();
        ctx.on('click', '[data-step]', (e, el) => hmi.open(el.dataset.step));
        ctx.on('click', '[data-reset]', () => { ['WZ-E1', 'WZ-E2', 'A-Q8', 'B-Q8'].forEach((id) => hmi.set(id, 'open')); ['A-Q9', 'B-Q9', 'A-Q0', 'B-Q0'].forEach((id) => hmi.set(id, 'closed')); refresh(); toast('Normal running arrangement restored (simulation)'); });
        ctx.on('click', '[data-issue]', () => toast(`${heroPermit.id} issued to ${hv.crew.lead} — ${hv.wos.length} tasks released to the field app`));
      },
    },
    {
      name: 'Switching programmes', icon: 'doc',
      render: () => {
        const progs = visits.filter((v) => v.outage).sort((a, b) => b.hero - a.hero).map((v, i) => ({ id: `SP-26-${114 + i}`, v, state: v.hero ? 'Approved' : i % 3 === 0 ? 'Approved' : i % 3 === 1 ? 'In review' : 'Draft', steps: v.line ? 10 : 6, author: ['L. Rzayeva', 'R. Aliyev', 'Control: Dispatcher 2'][i % 3] }));
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Programmes this period', value: progs.length, icon: 'doc', sub: 'One per grouped outage visit' },
            { label: 'Approved', value: progs.filter((p) => p.state === 'Approved').length, icon: 'checkCircle', tone: 'ok', sub: 'Ready for the control room' },
            { label: 'Switching operations saved', value: (openWO.filter((w) => w.outage).length - progs.length) * 10, icon: 'zap', tone: 'violet', sub: 'Estimate vs one programme per task', exp: true },
            { label: 'Interlock refusals (30 d)', value: 3, icon: 'lock', tone: 'warn', sub: 'All caught before execution' },
          ])}
          <div class="nx-row nx-c12">
            <div class="nx-s7">${ui.card({ title: 'Switching programme register', sub: 'Isolation programmes generated from grouped outage visits', flush: true, body: ui.table({ rows: progs, rowId: (p) => p.v.id, cols: [
              { key: 'id', label: 'Programme', render: (p) => `<b class="nx-mono">${esc(p.id)}</b><span class="nx-sub">${esc(p.v.id)}</span>` },
              { key: 'line', label: 'Circuit', render: (p) => esc(p.v.line || 'S-1/S-2 bays'), sort: (p) => p.v.line || '' },
              { key: 'win', label: 'Window', render: (p) => esc(p.v.window), sort: (p) => p.v.start },
              { key: 'tasks', label: 'Tasks', align: 'r', render: (p) => p.v.wos.length, sort: (p) => p.v.wos.length },
              { key: 'steps', label: 'Steps', align: 'r' },
              { key: 'author', label: 'Author' },
              { key: 'state', label: 'State', render: (p) => ui.badge(p.state, p.state === 'Approved' ? 'ok' : p.state === 'In review' ? 'warn' : 'muted') },
            ] }) })}</div>
            <div class="nx-s5">${ui.card({ title: `SP-26-114 · ${hv.id}`, sub: 'Step sequence for the Corridor North visit', tools: ui.btn('Open live diagram', { sm: true, primary: true, ic: 'schematic', attrs: 'data-live-sld' }), body: ui.timeline(PROG.map(([id, want, t, sub], i) => ({ when: `Step ${i + 1} · ${addDays(hv.start, 0)} ${String(6 + Math.floor(i / 3)).padStart(2, '0')}:${String((i % 3) * 15).padStart(2, '0')}`, title: t, text: `${esc(id)} → ${want.toUpperCase()} · ${esc(sub)}`, tone: i < 4 ? 'info' : 'ok' })).concat([{ when: 'Then', title: `Issue ${heroPermit.id}`, text: `To ${esc(hv.crew.lead)} · ${hv.wos.length} tasks`, tone: 'warn' }])) })}</div>
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', 'tr[data-row]', (e, r) => { const v = visits.find((x) => x.id === r.dataset.row); if (v) openVisit(v); });
        ctx.on('click', '[data-live-sld]', () => APP.go('switching', 0));
      },
    },
    ...drawingTabs('operations'),
  ],
};

/* ================================================================== mount */
APP = mountApp({
  id: 'operations', code: '03', product: 'Field Operations Optimization', back: '/#module-card-03', asOf: AS_OF,
  screens: [commandCenter, workOrders, planner, scheduling, approvals, execution, switching],
  searchIndex: () => [
    ...net.searchIndex.filter((x) => x.kind === 'wo').map((x) => ({ ...x, run: () => showWO(x.id) })),
    ...net.searchIndex.filter((x) => x.kind === 'crew').map((x) => ({ ...x, run: () => openCrew(x.id) })),
    ...visits.map((v) => ({ label: `${v.id} · ${v.wos.length} tasks`, sub: `${v.corridor} · ${v.window}`, icon: 'layers', run: () => openVisit(v) })),
    ...net.searchIndex.filter((x) => x.kind === 'tower').map((x) => ({ ...x, run: () => { location.href = reliabilityLink(x.id); } })),
  ],
});
