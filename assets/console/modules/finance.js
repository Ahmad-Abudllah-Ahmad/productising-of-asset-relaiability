// Module 07 — Financial Intelligence.
// Costs every work order bottom-up (labour × crew × rate, equipment day-rates, materials, switching, contingency),
// tracks FY2026 maintenance spend against the approved budget by corridor, category and month, models repair versus
// replacement over the asset life (NPV / EAC with risk cost from the health index), and ranks capital projects by
// risk reduction per dollar. The Cost Flow display puts a price on the power each line and transformer carries.
//
// All costs are USD, FY = calendar 2026, as of the network snapshot date. Rates are planning rates, not tariffs.

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, healthColor, riskColor, SEV, addDays, daysBetween, rng, nav, hash } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, DEFECT_LABEL, SEV_TONE, LINE_NAME } from '../network.js';
import { drawingTabs } from '../drawings.js';
import { models } from '../models.js';
import { erp, erpRequest } from '../erp.js';

const net = await loadNetwork();

// Work orders are SAP PM records read through the ERP integration layer (network.js → erp.ingest); this module costs and
// analyses them, it does not create or own them. Every predictive figure below comes from one of these heuristics. None
// is validated: each stays labelled / Simulated in the interface until tested against real data (models.js).
models.register([
  { id: 'fin-outturn', name: 'Year-end spend forecast (outturn)', module: '07 · Financial Intelligence', predicts: 'Maintenance spend at year end and the position against the approved budget', method: 'Spend to date + rest-of-year routine programme at planned utilisation + in-progress work orders at planned cost + a fixed 55 % of the scheduled/planned backlog assumed deliverable; straight line from today to December.', needs: 'Three or more closed financial years of monthly actuals and commitments from the ERP (SAP PM / CO) to fit the delivery rate and the phasing.' },
  { id: 'fin-budget-request', name: 'Next-year budget request (driver what-if)', module: '07 · Financial Intelligence', predicts: 'FY2027 maintenance budget request by line, from the escalation, backlog-clearance, vegetation-scope and reserve drivers', method: 'FY2026 budget lines × cost escalation; open backlog × share to clear; corrective line grown by an assumed 4 %/yr rise in findings; reserve as a % of the total. A what-if calculator, not a fitted forecast.', needs: 'Finding-arrival and corrective-cost history per year, and actual cost-escalation indices for labour and materials.' },
  { id: 'fin-opex-outlook', name: 'Five-year opex outlook', module: '07 · Financial Intelligence', predicts: 'Routine and corrective maintenance opex 2026–2031, with and without the capital plan', method: 'Routine lines compounded at the escalation driver; corrective spend grows 8 %/yr above escalation if nothing is replaced, or falls 8 points a year (capped at 32 %) with the capital plan. Both rates are assumptions.', needs: 'Corrective spend history before and after past replacement and refurbishment programmes.' },
  { id: 'fin-pfail', name: 'Failure probability from health index', module: '07 · Financial Intelligence', predicts: 'Annual probability of functional failure of a tower, line or transformer', method: 'p = 0.004 + 0.18 · e^(−HI/18): a fixed curve on the health index, not fitted to failure statistics.', needs: 'Failure and forced-outage records per asset class, with the health index at the time of failure.' },
  { id: 'fin-expected-loss', name: 'Risk cost (expected loss) and risk-weighted value flow', module: '07 · Financial Intelligence', predicts: 'Expected loss per asset in $/yr, risk exposure per line and for the network, and the $/h risk figures on Cost Flow', method: 'Failure probability × consequence; consequence = load at risk × assumed restoration time (36 h line, 720 h transformer) × value of lost load ($6,000/MWh) × un-transferable share (8 % / 4 %) + emergency works as a share of replacement cost.', needs: 'Outage durations and energy not supplied from the outage log; an agreed value of lost load and consequence scale from the asset owner.' },
  { id: 'fin-replace-cost', name: 'Replacement cost estimate', module: '07 · Financial Intelligence', predicts: 'Cost to replace a tower or transformer, and the lifetime-cost-to-replacement ratio', method: 'Planning unit rates: $185k / $310k / $640k per tower at 132 / 220 / 500 kV; transformer $14.5k per MVA + $520k installation.', needs: 'Awarded contract prices or final costs of recent replacement projects from the ERP.' },
  { id: 'fin-rvr', name: 'Repair-versus-replace life-cycle model', module: '07 · Financial Intelligence', predicts: 'NPV and equivalent annual cost of repairing versus replacing an asset, break-even year, further repair cycles, and the repair/replace indication', method: 'Year-by-year discounted cash flow: the health index declines at the deterioration assumption (a repair resets it when it falls below 45), routine cost scales with condition, risk cost = failure probability × consequence, replacement gets a residual value. Assumptions are set by the sliders.', needs: 'Repeat health-index history after repairs and replacements, actual repair and replacement costs, and failure records.' },
  { id: 'fin-capex-benefit', name: 'Capital project benefit (PV of risk avoided)', module: '07 · Financial Intelligence', predicts: 'Present value of risk avoided, benefit-to-cost ratio, avoided loss per year, discounted payback and energy not supplied avoided per capital project', method: 'Change in failure probability (health index today vs an assumed index after the project) × consequence, as a 20-year annuity at 7 % real; some projects add fixed assumed benefits (e.g. 22 % from earlier detection, avoided corrective spend).', needs: 'Condition and failure records after completed replacement and refurbishment projects.' },
  { id: 'fin-capex-portfolio', name: 'Capital portfolio optimisation and five-year plan', module: '07 · Financial Intelligence', predicts: 'Which projects are funded within the envelope, the five-year phasing, and the network risk trajectory with and without the plan', method: 'Greedy selection by benefit-to-cost ratio until the envelope is spent; projects scheduled by rank under an annual envelope (large ones over two years); do-nothing risk assumed to grow 7 %/yr.', needs: 'Validated project benefits (above), real delivery constraints and outage windows, and the observed risk trend.' },
]);
const AS_OF = net.asOf;
const TXS = net.transformers.filter((t) => /^TX-/.test(t.name)); // the registry's suspected duplicate record is left out of the ledger
const YEAR = 2026;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_M = Number(AS_OF.slice(5, 7)) - 1; // 10 = Nov
const ELAPSED = (daysBetween(`${YEAR}-01-01`, AS_OF) + 1) / 365;

/* ======================================================================== rates and cost build-up */
const LABOUR_RATE = { 'live-line': 96, structures: 78, conductor: 84, insulators: 76, civil: 64, vegetation: 52, substation: 112 }; // $/person-hour, burdened
const EQUIP = {
  'fitting replacement': ['Insulated aerial lift', 1450], 'corridor clearing': ['Mulcher + chipper', 980], 'insulator replacement': ['Aerial lift 32 m', 1350], 'earthwire repair': ['Line truck + winch', 1600],
  'conductor repair': ['Tensioner / puller set', 3200], 'foundation repair': ['Excavator + mixer', 1250], 'steel repair': ['Crane truck 25 t', 2600], 'transformer repair': ['Oil-processing trailer', 2400],
};
const CREW = new Map(net.crews.map((c) => [c.id, c]));
const CORRIDORS = ['North', 'Coastal', 'Inland', 'Substation'];
const CORR_COLOR = { North: '#3b82f6', Coastal: '#14b8a6', Inland: '#a855f7', Substation: '#f59e0b' };
const WT_COLOR = ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'];
const WORK_TYPES = [...new Set(net.workOrders.map((w) => w.work_type))];
const r01 = (id, salt = 0) => { const R = rng(Math.abs(hash(`${id}:${salt}`))); return R(); };

const costCache = new Map();
/** Bottom-up cost of a work order. */
function woCost(w) {
  if (costCache.has(w.id)) return costCache.get(w.id);
  const crew = CREW.get(w.crew);
  const size = crew?.size || 5;
  const rate = LABOUR_RATE[w.skill] || 80;
  const labour = Math.round(w.labourH * size * rate);
  const [eqName, eqRate] = EQUIP[w.work_type] || ['Line truck', 1200];
  const days = Math.max(1, Math.ceil(w.labourH / 10));
  const equipment = eqRate * days;
  const materials = w.materials;
  const mobilisation = Math.round(labour * 0.06 + 420);
  const switching = w.outage ? 1850 : 0;
  const sub = labour + equipment + materials + mobilisation + switching;
  const contingency = Math.round(sub * 0.1);
  const total = sub + contingency;
  const variance = 0.87 + r01(w.id, 1) * 0.3; // completed jobs: actual / plan
  const actual = w.stage === 'completed' ? Math.round(total * variance) : null;
  const c = { labour, equipment, eqName, eqRate, days, materials, mobilisation, switching, contingency, total, size, rate, actual, variance };
  costCache.set(w.id, c);
  return c;
}
const KV_CORR = { 132: 'Coastal', 220: 'North', 500: 'Inland' };
const lineOf = (w) => { if (w.line) return w.line; const m = String(w.asset_id || '').match(/-(132|220|500)-(\d\d)/); return m ? `L-${m[1]}-${m[2]}` : 'Substation'; };
const corrOf = (w) => { if (CORRIDORS.includes(w.corridor) && w.corridor !== 'Substation') return w.corridor; if (w.work_type === 'transformer repair' || /^TX|^BSH|^OLTC|^COOL|^TNK/.test(w.asset_id || '')) return 'Substation'; const m = String(w.asset_id || '').match(/-(132|220|500)-/); return m ? KV_CORR[m[1]] : 'Substation'; };
const monthOf = (iso) => (iso && iso.startsWith(String(YEAR)) ? Number(iso.slice(5, 7)) - 1 : null);
const done = net.workOrders.filter((w) => w.stage === 'completed');
const inProg = net.workOrders.filter((w) => w.stage === 'in_progress');
const backlog = net.workOrders.filter((w) => w.stage !== 'completed');
const sum = (a, f) => a.reduce((s, x, i) => s + (f(x, i) || 0), 0);
const money = (v) => (v < 0 ? `−${fmt.money(-v)}` : fmt.money(v));

/* ======================================================================== FY2026 budget model */
// Routine programme lines are planned monthly; corrective repairs are the work orders above.
const ROUTINE = [
  { id: 'insp', name: 'Aerial inspection campaigns', monthly: null, campaigns: { 1: 96000, 4: 96000, 9: 104000 } },
  { id: 'row', name: 'ROW vegetation management', monthly: 38000, season: [0.6, 0.7, 1.1, 1.4, 1.5, 1.3, 1.1, 1.0, 0.9, 0.9, 0.8, 0.7] },
  { id: 'sub', name: 'Substation routine & testing', monthly: 27500 },
  { id: 'cbm', name: 'Condition monitoring & DGA', monthly: 9200 },
  { id: 'em', name: 'Emergency response reserve', monthly: 20800, use: 0.58 },
];
const correctiveTotal = sum(net.workOrders, (w) => woCost(w).total);
const CORRECTIVE_BUDGET = Math.round((correctiveTotal * 0.86) / 50000) * 50000;
// Corrective budget phasing follows the inspection campaigns (findings arrive Feb, May, Oct).
const CORR_PHASE = (() => { const flat = [0.03, 0.06, 0.1, 0.1, 0.08, 0.11, 0.11, 0.09, 0.08, 0.07, 0.1, 0.07]; const byM = MONTHS.map((_, m) => net.workOrders.filter((w) => w.stage === 'completed' && w.completed_at?.startsWith(`${YEAR}-${String(m + 1).padStart(2, '0')}`)).reduce((a, w) => a + woCost(w).total, 0)); const tot = byM.reduce((a, b) => a + b, 0) || 1; const raw = flat.map((f, m) => 0.45 * f + 0.55 * (m <= NOW_M ? byM[m] / tot : 0) * 0.88 + (m > NOW_M ? 0.55 * 0.06 : 0)); const t2 = raw.reduce((a, b) => a + b, 0); return raw.map((v) => v / t2); })();
const CORR_SHARE = { North: 0.42, Coastal: 0.2, Inland: 0.26, Substation: 0.12 };

function routineMonth(r, m) {
  if (r.campaigns) return r.campaigns[m] || 0;
  return r.monthly * (r.season ? r.season[m] : 1);
}
const budgetByMonth = MONTHS.map((_, m) => ({
  corrective: CORRECTIVE_BUDGET * CORR_PHASE[m],
  ...Object.fromEntries(ROUTINE.map((r) => [r.id, routineMonth(r, m)])),
}));
const actualCorrectiveByMonth = MONTHS.map((_, m) => sum(done.filter((w) => monthOf(w.completed_at) === m), (w) => woCost(w).actual));
const routineActual = (r, m) => {
  if (m > NOW_M) return 0;
  const frac = m === NOW_M ? (Number(AS_OF.slice(8, 10)) / 30) : 1;
  return routineMonth(r, m) * (r.use || 1) * (0.88 + r01(r.id, m) * 0.24) * frac;
};
const actualByMonth = MONTHS.map((_, m) => ({ corrective: m <= NOW_M ? actualCorrectiveByMonth[m] : 0, ...Object.fromEntries(ROUTINE.map((r) => [r.id, routineActual(r, m)])) }));
const monthTotal = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const BUDGET = Math.round(sum(budgetByMonth, monthTotal) / 10000) * 10000;
const YTD = sum(actualByMonth, monthTotal);
const committed = sum(inProg, (w) => woCost(w).total);
const backlogCost = sum(backlog.filter((w) => w.stage !== 'in_progress'), (w) => woCost(w).total);
const remaining = BUDGET - YTD;
const gap = remaining - committed - backlogCost;
// forecast at completion: YTD + rest-of-year routine + committed + the share of backlog the crews can still deliver
const restRoutine = sum(MONTHS.map((_, m) => m), (m) => (m > NOW_M ? sum(ROUTINE, (r) => routineMonth(r, m) * (r.use || 1)) : m === NOW_M ? sum(ROUTINE, (r) => routineMonth(r, m) * (r.use || 1)) - sum(ROUTINE, (r) => routineActual(r, m)) : 0));
const deliverable = sum(backlog.filter((w) => ['scheduled', 'planned'].includes(w.stage)), (w) => woCost(w).total) * 0.55;
const EAC_FY = YTD + restRoutine + committed + deliverable;

const spendByCorr = Object.fromEntries(CORRIDORS.map((c) => [c, {
  actual: sum(done.filter((w) => corrOf(w) === c && monthOf(w.completed_at) != null), (w) => woCost(w).actual) + (c === 'Substation' ? sum(actualByMonth, (o) => o.sub + o.cbm) : sum(actualByMonth, (o) => (o.row + o.insp) * ({ North: 0.42, Coastal: 0.25, Inland: 0.33 }[c] || 0) + o.em * CORR_SHARE[c])),
  budget: CORRECTIVE_BUDGET * CORR_SHARE[c] + (c === 'Substation' ? sum(budgetByMonth, (o) => o.sub + o.cbm) : sum(budgetByMonth, (o) => (o.row + o.insp) * ({ North: 0.42, Coastal: 0.25, Inland: 0.33 }[c] || 0) + o.em * CORR_SHARE[c])),
  backlog: sum(backlog.filter((w) => corrOf(w) === c), (w) => woCost(w).total),
}]));

/* ======================================================================== risk economics */
const pFail = (hi) => (hi == null ? 0.01 : 0.004 + 0.18 * Math.exp(-hi / 18)); // annual probability of functional failure
const VOLL = 6000; // $/MWh, value of lost load used for planning
const TARIFF = 58; // $/MWh, transmission value of energy delivered (use-of-system + energy margin)
const lineById = new Map(net.lines.map((l) => [l.id, l]));
const lineMW = (id) => live.spec(`${id}.MW`)?.base ?? 200;
const towerReplace = (kv) => ({ 132: 185000, 220: 310000, 500: 640000 }[kv] || 300000);
const txReplace = (mva) => Math.round(((mva || 150) * 14500 + 520000) / 10000) * 10000;
function consequence(asset) { // $ per functional failure
  if (asset.kind === 'tx') return (asset.rating || 150) * 0.85 * 720 * VOLL * 0.04 + txReplace(asset.rating) * 0.6;
  return lineMW(asset.line) * 36 * VOLL * 0.08 + towerReplace(asset.kv) * 0.35;
}
const towerWO = new Map();
for (const w of net.workOrders) if (w.towerId) (towerWO.get(w.towerId) || towerWO.set(w.towerId, []).get(w.towerId)).push(w);
const txWO = new Map();
for (const w of net.workOrders) { const t = TXS.find((x) => x.name === w.towerName); if (t) (txWO.get(t.id) || txWO.set(t.id, []).get(t.id)).push(w); }

/** Every costed physical asset: towers and transformers, with lifetime cost history. */
const assets = [
  ...net.towers.map((t) => ({ ...t, kind: 'tower', title: `${t.name} · ${t.line}`, wos: towerWO.get(t.id) || [] })),
  ...TXS.map((t) => ({ ...t, kind: 'tx', line: null, kv: Number(String(t.ratio).split('/')[0]) || 220, title: `${t.name} · ${t.rating} MVA`, wos: txWO.get(t.id) || [], age: YEAR - Number(String(t.install).slice(0, 4)) })),
];
for (const a of assets) {
  const routine = a.kind === 'tx' ? 16000 : 900 + (a.kv || 132) * 2.2;
  a.history = [2021, 2022, 2023, 2024, 2025].map((y, i) => Math.round(routine * (0.7 + r01(a.id, y) * 0.8) + (a.band === 'poor' ? routine * 0.6 * i : a.band === 'moderate' ? routine * 0.25 * i : 0)));
  a.fy = sum(a.wos.filter((w) => w.stage === 'completed'), (w) => woCost(w).actual) + routine * 0.9;
  a.history.push(Math.round(a.fy));
  a.lifetime = sum(a.history, (x) => x) + routine * Math.max(0, (a.age || 10) - 6);
  a.openCost = sum(a.wos.filter((w) => w.stage !== 'completed'), (w) => woCost(w).total);
  a.exposure = pFail(a.hi) * consequence(a); // $/yr expected loss
  a.replace = a.kind === 'tx' ? txReplace(a.rating) : towerReplace(a.kv);
}
const assetById = new Map(assets.map((a) => [a.id, a]));

/* ======================================================================== shared UI bits */
const css = document.createElement('style');
css.id = 'fin-css';
css.textContent = `
.fin-slider { display:grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items:center; font-size:12px; }
.fin-slider label { color: var(--nx-ink-2); font-weight:600; }
.fin-slider output { font: 600 12px var(--nx-mono); color: var(--nx-accent-2); text-align:right; }
.fin-slider input[type=range] { grid-column: 1 / -1; width:100%; accent-color: var(--nx-accent); margin: 0 0 6px; }
.fin-rec { display:flex; gap:14px; align-items:center; padding:14px 16px; border-radius:12px; background:linear-gradient(110deg,#0b1220,#13254a); color:#e2e8f0; }
.fin-rec b { font-size:18px; color:#fff; display:block; }
.fin-rec small { font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#7dd3fc; font-weight:600; }
.fin-rec .fin-rec-x { margin-left:auto; text-align:right; }
.fin-build { display:flex; height:12px; border-radius:6px; overflow:hidden; background:#eef2f7; }
.fin-build i { display:block; height:100%; }
.fin-legend { display:flex; gap:12px; flex-wrap:wrap; font-size:11px; color:var(--nx-muted); margin-top:6px; }
.fin-legend span { display:inline-flex; align-items:center; gap:5px; }
.fin-legend i { width:9px; height:9px; border-radius:3px; display:inline-block; }
.fin-big { font-size:30px; font-weight:700; letter-spacing:-.02em; font-variant-numeric: tabular-nums; }
.fin-sel { width:100%; }
.fin-case p { margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: var(--nx-ink-2); }
.fin-case h4 { margin: 14px 0 6px; font-size: 12px; letter-spacing:.08em; text-transform:uppercase; color: var(--nx-muted); }
.fin-tag { font: 600 11px var(--nx-mono); color: var(--nx-muted); }
.nx-drawer-b > * { flex-shrink: 0; }
`;
document.head.appendChild(css);

const BUILD_COLORS = { labour: '#2563eb', equipment: '#14b8a6', materials: '#f59e0b', mobilisation: '#8b5cf6', switching: '#ef4444', contingency: '#94a3b8' };
function buildBar(c) {
  const parts = ['labour', 'equipment', 'materials', 'mobilisation', 'switching', 'contingency'];
  return `<div class="fin-build">${parts.map((p) => `<i style="width:${((c[p] / c.total) * 100).toFixed(1)}%;background:${BUILD_COLORS[p]}" title="${p} ${fmt.money(c[p])}"></i>`).join('')}</div>`;
}
const stageTone = { completed: 'ok', in_progress: 'accent', scheduled: 'info', planned: 'violet', approved: 'warn', requested: 'muted' };
const stageBadge = (s) => ui.badge(fmt.title(s), stageTone[s]);

const SYNC_TONE = { synced: 'ok', pending: 'warn', conflict: 'crit' };
const prioTone = (p) => (p === 'high' ? 'crit' : p === 'medium' ? 'warn' : 'muted');
const pct = (arr, q) => { const v = [...arr].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))]; };

function openWO(w) {
  const c = woCost(w);
  const rows = [
    ['Labour', `${fmt.n(w.labourH)} h × ${c.size} crew × $${c.rate}/h`, c.labour, 'labour'],
    ['Equipment', `${c.eqName} · ${c.days} d × ${fmt.money(c.eqRate)}`, c.equipment, 'equipment'],
    ['Materials', `Catalogue items for ${w.findings.map((f) => DEFECT_LABEL[f.defect_class] || f.defect_class).slice(0, 2).join(', ') || w.work_type}`, c.materials, 'materials'],
    ['Mobilisation & access', 'Travel, access tracks, welfare (6% labour + $420)', c.mobilisation, 'mobilisation'],
    ['Switching & outage', w.outage ? 'Switching programme, standby dispatcher' : 'Live-line method — no outage', c.switching, 'switching'],
    ['Contingency', '10% of direct cost', c.contingency, 'contingency'],
  ];
  const peers = net.workOrders.filter((x) => x.work_type === w.work_type).map((x) => woCost(x).total);
  const avg = sum(peers, (x) => x) / peers.length;
  const tl = [
    ...w.findings.map((f) => ({ when: fmt.date(f.date), title: `${f.finding_id} detected — ${f.label}`, text: `${String(f.sensor || '').toUpperCase()} · condition ${f.condition_score}/5 · ${f.review_status}`, tone: SEV_TONE[f.severity] })),
    { when: fmt.date(w.created_at), title: 'Work order created in SAP PM, costed bottom-up', text: `Bottom-up estimate ${fmt.money(c.total)} · SAP PM ${esc(w.sap)}`, tone: 'info' },
    { when: fmt.date(w.planned_date), title: 'Planned execution window', text: `${c.days} job day(s) · ${esc(w.crewName)}${w.outage ? ' · outage booked' : ' · live-line'}`, tone: 'muted' },
    ...(w.completed_at ? [{ when: fmt.date(w.completed_at), title: 'Completed and cost-settled', text: `Actual ${fmt.money(c.actual)} (${c.variance >= 1 ? '+' : ''}${fmt.n((c.variance - 1) * 100, 1)}% vs plan)`, tone: c.variance > 1.05 ? 'warn' : 'ok' }] : []),
  ];
  const days = Array.from({ length: c.days + 1 }, (_, i) => i);
  const dayCost = days.map((d) => ({ labour: d ? c.labour / c.days : 0, equipment: d ? c.eqRate : 0, materials: d === 0 ? c.materials : 0, mobilisation: d === 0 ? c.mobilisation : 0, switching: d === 0 ? c.switching : 0, contingency: c.contingency / (c.days + 1) }));
  drawer.open({
    icon: 'dollar', kicker: `Work order cost · SAP ${w.sap} · Maximo ${w.maximo}`, title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${esc(lineOf(w))} · ${esc(w.crewName)}`,
    badges: [[fmt.title(w.stage), stageTone[w.stage]], [`Priority ${w.priority}`, prioTone(w.priority)], [`ERP · SAP PM · ${w.sync}`, SYNC_TONE[w.sync] || 'muted'], [w.outage ? 'Outage required' : 'Live-line method', w.outage ? 'warn' : 'info'], [`${corrOf(w)} corridor`, 'accent']],
    meta: `Planning rates FY${YEAR} · ${c.size}-person crew`,
    tabs: [
      {
        name: 'Cost build-up',
        body: `${ui.stats([{ label: 'Planned cost', value: fmt.money(c.total) }, { label: c.actual ? 'Actual cost' : 'Labour hours', value: c.actual ? fmt.money(c.actual) : `${fmt.n(w.labourH)} h` }, { label: c.actual ? 'Variance' : 'Job days', value: c.actual ? `${c.variance >= 1 ? '+' : ''}${fmt.n((c.variance - 1) * 100, 1)}%` : c.days, color: c.actual ? (c.variance > 1.05 ? '#dc2626' : '#16a34a') : undefined }, { label: 'vs type average', value: `${c.total >= avg ? '+' : '−'}${fmt.n(Math.abs((c.total / avg - 1) * 100), 0)}%`, color: c.total > avg * 1.2 ? '#d97706' : undefined }])}
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Element mix</h4><div class="nx-chart" data-chart="wo-mix" style="height:210px"></div></div><div class="nx-sec"><h4>Against ${peers.length} ${esc(w.work_type)} jobs</h4><div class="nx-chart" data-chart="wo-peer" style="height:210px"></div></div></div>
        <div class="nx-sec"><h4>Estimate lines</h4>${buildBar(c)}<div class="fin-legend">${Object.entries(BUILD_COLORS).map(([k, v]) => `<span><i style="background:${v}"></i>${fmt.title(k)}</span>`).join('')}</div><div style="margin-top:10px">${ui.table({ cols: [{ key: 0, label: 'Element', render: (r) => `<b>${esc(r[0])}</b><span class="nx-sub">${esc(r[1])}</span>` }, { key: 2, label: 'Cost', align: 'r', render: (r) => `<b>${fmt.money(r[2], 0)}</b>`, sort: (r) => r[2] }, { key: 3, label: 'Share', align: 'r', render: (r) => fmt.pct((r[2] / c.total) * 100, 0), sort: (r) => r[2] }], rows })}</div></div>`,
        mount: (b, ctx) => {
          ctx.chart('wo-mix', { ...ch.donut({ data: rows.map((r) => ({ name: r[0], value: r[2], color: BUILD_COLORS[r[3]] })).filter((d) => d.value > 0), center: 'planned', value: fmt.money(c.total), legend: false, radius: ['55%', '80%'] }), tooltip: { trigger: 'item', formatter: (q) => `${q.name}<br/><b>${fmt.money(q.value)}</b> · ${q.percent}%` } });
          ctx.chart('wo-peer', { ...ch.bar({ x: ['Lowest', 'Median', 'Average', 'P90', w.id], legend: false, series: [{ name: 'Planned cost', data: [pct(peers, 0), pct(peers, 0.5), avg, pct(peers, 0.9), c.total].map((v, i) => ({ value: Math.round(v), itemStyle: { color: i === 4 ? '#2563eb' : '#cbd5e1', borderRadius: [4, 4, 0, 0] } })), labelFmt: (q) => fmt.money(q.value) }], labels: true, grid: { top: 22 } }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.money(v) } });
        },
      },
      {
        name: 'Findings & timeline',
        body: `<div class="nx-drawer-grid"><div class="nx-sec"><h4>Lifecycle</h4>${ui.timeline(tl)}</div><div class="nx-sec"><h4>Linked findings · ${w.findings.length}</h4>${w.findings.length ? `<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: `${f.finding_id} · ${f.label}`, sub: `${esc(f.towerName || f.assetName || '')} · ${fmt.date(f.date)} · ${fmt.n(f.confidence * 100)}% conf.`, end: ui.badge(f.severity, SEV_TONE[f.severity]) })).join('')}</div>` : ui.empty('No findings linked — planned preventive work.')}</div></div>
        <div class="nx-sec"><h4>Location, crew and systems ${ui.erp('SAP PM', 'workOrders')}</h4><div class="nx-drawer-grid">${ui.kv([['Asset', esc(w.towerName || w.asset)], ['Line', esc(lineOf(w))], ['Corridor', esc(corrOf(w))], ['Voltage', w.kv ? `${w.kv} kV` : '—']])}${ui.kv([['Crew', esc(w.crewName)], ['Skill', esc(fmt.title(w.skill))], ['SAP PM order', esc(w.sap)], ['IBM Maximo', esc(w.maximo)]])}</div></div>`,
      },
      {
        name: 'Spend profile',
        body: `<div class="nx-sec"><h4>Cash-out by job day</h4><div class="nx-chart" data-chart="wo-days" style="height:260px"></div><div class="nx-note">Day 0 carries materials, mobilisation and switching; labour and equipment accrue per job day; contingency is spread evenly.</div></div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Rates applied</h4>${ui.kv([['Labour rate', `$${c.rate}/person-h (${esc(w.skill)})`], ['Crew size', `${c.size} people`], ['Equipment', `${esc(c.eqName)} · ${fmt.money(c.eqRate)}/day`], ['Contingency', '10% of direct cost']])}</div><div class="nx-sec"><h4>Budget line</h4>${ui.kv([['Charged to', 'Corrective repairs (opex)'], ['Corridor allocation', esc(corrOf(w))], ['FY budget remaining', fmt.money(remaining)], ['Share of remaining', fmt.pct((c.total / Math.max(1, remaining)) * 100, 1)]])}</div></div>`,
        mount: (b, ctx) => {
          const el = ['labour', 'equipment', 'materials', 'mobilisation', 'switching', 'contingency'];
          let run = 0; const cum = dayCost.map((d) => { run += el.reduce((q, k) => q + d[k], 0); return Math.round(run); });
          ctx.chart('wo-days', { ...ch.bar({ x: days.map((d) => (d ? `Day ${d}` : 'Day 0')), stack: true, series: el.map((k) => ({ name: fmt.title(k), color: BUILD_COLORS[k], data: dayCost.map((d) => Math.round(d[k])) })), grid: { top: 34 } }), series: [...el.map((k) => ({ type: 'bar', stack: 'd', name: fmt.title(k), itemStyle: { color: BUILD_COLORS[k] }, data: dayCost.map((d) => Math.round(d[k])) })), { type: 'line', name: 'Cumulative', yAxisIndex: 1, data: cum, symbol: 'circle', lineStyle: { color: '#0f172a', width: 2 }, itemStyle: { color: '#0f172a' } }], yAxis: [{ type: 'value', name: 'per day', axisLabel: { formatter: (v) => fmt.money(v) } }, { type: 'value', name: 'cumulative', axisLabel: { formatter: (v) => fmt.money(v) }, splitLine: { show: false } }], tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.money(v) } });
        },
      },
    ],
    actions: [{ label: 'Export cost sheet', icon: 'download', onClick: () => toast(`Cost sheet for ${w.id} exported (CSV)`) }, { label: 'Request estimate update in SAP PM', icon: 'sync', primary: true, onClick: () => erpRequest('workOrders', `Cost estimate update · ${w.id} · SAP PM order ${w.sap} · ${fmt.money(c.total)}`, { workOrder: w.id, order: w.sap, plannedCost: c.total, labour: c.labour, equipment: c.equipment, materials: c.materials }) }],
  });
}

/** Asset cost file: lifetime cost, work, and the repair-vs-replace answer for one tower or transformer. */
function openAssetCost(a) {
  const m = rvModel(a);
  const better = m.npvB < m.npvA ? 'Replace' : 'Repair';
  const yrs = ['2021', '2022', '2023', '2024', '2025', '2026'];
  let run = Math.max(0, a.lifetime - sum(a.history, (x) => x));
  const cumH = a.history.map((v) => { run += v; return Math.round(run); });
  drawer.open({
    icon: a.kind === 'tx' ? 'transformer' : 'tower', kicker: a.kind === 'tx' ? `Asset cost file · power transformer · ${a.sub}` : `Asset cost file · tower · ${a.line}`,
    title: a.kind === 'tx' ? `${a.name} · ${a.rating} MVA ${a.ratio} kV` : `${a.name} · ${a.type || 'Lattice'} · ${a.kv} kV`,
    sub: a.kind === 'tx' ? `${esc(a.maker || '')} · installed ${String(a.install).slice(0, 4)} · ${a.age} years` : `${esc(a.corridor)} corridor · ${a.age} years · corrosion zone ${esc(a.zone || '—')}`,
    badges: [[`HI ${a.hi ?? '—'} · ${a.band || 'not assessed'}`, a.band === 'poor' ? 'crit' : a.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${a.riskBand || '—'}`, a.riskBand === 'critical' ? 'crit' : a.riskBand === 'high' ? 'high' : a.riskBand === 'medium' ? 'warn' : 'ok'], [`${better} indicated`, better === 'Replace' ? 'crit' : 'ok'], [`${a.wos.length} work orders`, 'accent']],
    tabs: [
      {
        name: 'Cost history',
        body: `${ui.stats([{ label: 'Lifetime maintenance', value: fmt.money(a.lifetime) }, { label: 'FY2026 spend', value: fmt.money(a.fy) }, { label: 'Open backlog', value: a.openCost ? fmt.money(a.openCost) : '—' }, { label: 'Risk $/yr', value: fmt.money(a.exposure), color: '#dc2626' }, { label: 'Replacement (estimate)', value: fmt.money(a.replace) }])}
        <div class="nx-sec"><h4>Maintenance cost by year, and cumulative vs replacement cost</h4><div class="nx-chart" data-chart="ac-hist" style="height:250px"></div></div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Risk economics ${ui.exp()}</h4>${ui.kv([['P(failure) per year', fmt.pct(pFail(a.hi) * 100, 2)], ['Consequence per failure', fmt.money(consequence(a))], ['Expected loss', `${fmt.money(a.exposure)}/yr`], ['Cost-to-replace ratio', fmt.pct((a.lifetime / a.replace) * 100, 1)]])}</div><div class="nx-sec"><h4>Condition</h4>${ui.kv([['Health index', ui.score(a.hi)], ['Health band', esc(a.band || '—')], ['Open findings', a.open ?? 0], ['Criticality', a.criticality ?? '—']])}</div></div>`,
        mount: (b, ctx) => ctx.chart('ac-hist', { grid: ch.grid({ top: 34 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.money(v) }, xAxis: { type: 'category', data: yrs }, yAxis: [{ type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) }, splitLine: { show: false } }], series: [{ type: 'bar', name: 'Annual maintenance', data: a.history, itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] }, barWidth: 22 }, { type: 'line', name: 'Cumulative lifetime', yAxisIndex: 1, data: cumH, symbol: 'circle', lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, markLine: { symbol: 'none', data: [{ yAxis: a.replace, label: { formatter: `Replacement est. ${fmt.money(a.replace)}`, color: '#dc2626', position: 'insideEndTop' }, lineStyle: { color: '#dc2626', type: 'dashed' } }] } }] }),
      },
      {
        name: `Work orders (${a.wos.length})`,
        body: a.wos.length ? `<div class="nx-sec"><h4>Planned vs actual by work order ${ui.erp('SAP PM', 'workOrders')}</h4><div class="nx-chart" data-chart="ac-wo" style="height:${Math.max(160, a.wos.length * 34 + 60)}px"></div></div>${ui.table({ id: 'ac-wot', rowId: (x) => x.id, rows: [...a.wos].sort((x, y) => woCost(y).total - woCost(x).total), cols: [{ key: 'id', label: 'WO', render: (x) => `<b>${esc(x.id)}</b><span class="nx-sub">${esc(fmt.title(x.work_type))}</span>` }, { key: 'stage', label: 'Stage', render: (x) => stageBadge(x.stage) }, { label: 'Planned', align: 'r', render: (x) => fmt.money(woCost(x).total), sort: (x) => woCost(x).total }, { label: 'Actual', align: 'r', render: (x) => (woCost(x).actual ? `<b>${fmt.money(woCost(x).actual)}</b>` : '—'), sort: (x) => woCost(x).actual || 0 }] })}` : `<div class="nx-sec">${ui.empty('No work orders on this asset — routine maintenance only.')}</div>`,
        mount: (b, ctx) => {
          if (!a.wos.length) return;
          const ws = [...a.wos].sort((x, y) => woCost(y).total - woCost(x).total);
          ctx.chart('ac-wo', ch.bar({ x: ws.map((x) => x.id), horizontal: true, series: [{ name: 'Planned', data: ws.map((x) => woCost(x).total), color: '#cbd5e1' }, { name: 'Actual', data: ws.map((x) => woCost(x).actual || 0), color: '#2563eb' }], tooltip: { valueFormatter: (v) => fmt.money(v) }, grid: { top: 26 } }));
          ctx.on('click', '#ac-wot tr[data-row]', (e, tr) => { const w = net.workOrders.find((x) => x.id === tr.dataset.row); if (w) openWO(w); });
        },
      },
      {
        name: 'Repair or replace',
        body: `${ui.callout(`${ui.exp()} Model estimate, not validated: <b>${better}</b> is cheaper over ${rv.n} years at ${rv.r}% real: repair NPV ${fmt.money(m.npvA)} vs replace NPV ${fmt.money(m.npvB)} — a difference of <b>${fmt.money(Math.abs(m.npvA - m.npvB))}</b>.${m.be != null ? ` Estimated break-even for replacement: year ${m.be}.` : ''}`, better === 'Replace' ? 'warn' : 'ok', 'scale')}
        <div class="nx-sec"><h4>Cumulative discounted life-cycle cost</h4><div class="nx-chart" data-chart="ac-rv" style="height:240px"></div></div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>A · Repair</h4>${ui.kv([['First repair', fmt.money(m.repairCost)], ['Further repair cycles', m.repairs], ['EAC', `${fmt.money(m.eacA)}/yr`]])}</div><div class="nx-sec"><h4>B · Replace</h4>${ui.kv([['Capex', fmt.money(m.C)], ['Consequence avoided', fmt.money(m.conseq)], ['EAC', `${fmt.money(m.eacB)}/yr`]])}</div></div>`,
        mount: (b, ctx) => ctx.chart('ac-rv', { ...ch.line({ x: m.rows.map((x) => String(YEAR + x.y)), series: [{ name: 'A · Repair', data: m.rows.map((x) => Math.round(x.cumA)), color: '#f59e0b', area: true, smooth: false }, { name: 'B · Replace', data: m.rows.map((x) => Math.round(x.cumB)), color: '#2563eb', area: true, smooth: false }] }), yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.money(v) } }),
      },
    ],
    actions: [{ label: 'Open life-cycle model', icon: 'scale', primary: true, onClick: (close) => { close(); rvrAsset = a.id; nav.go('rvr'); } }],
  });
}

/* ======================================================================== 1. Maintenance Cost Dashboard */
function dashOverview() {
  const burn = (YTD / BUDGET) * 100;
  const kp = [
    { label: 'FY2026 approved budget', value: fmt.money(BUDGET), icon: 'wallet', sub: `${ROUTINE.length + 1} budget lines · 4 corridors`, spark: MONTHS.map((_, m) => sum(budgetByMonth.slice(0, m + 1), monthTotal)) },
    { label: 'Spent year-to-date', value: fmt.money(YTD), icon: 'dollar', tone: burn > ELAPSED * 100 + 3 ? 'warn' : 'ok', subHtml: `${fmt.pct(burn, 1)} burn vs ${fmt.pct(ELAPSED * 100, 0)} of year elapsed`, spark: actualByMonth.slice(0, NOW_M + 1).map(monthTotal) },
    { label: 'Committed (in progress)', value: fmt.money(committed), icon: 'clipboard', tone: 'info', sub: `${inProg.length} work orders on site`, spark: inProg.map((w) => woCost(w).total) },
    { label: 'Repair backlog (not started)', value: fmt.money(backlogCost), icon: 'event', tone: 'warn', sub: `${backlog.length - inProg.length} work orders · ${backlog.filter((w) => w.priority === 'high' && w.stage !== 'in_progress').length} high priority`, spark: CORRIDORS.map((c) => spendByCorr[c].backlog) },
    { label: 'Forecast at year end', exp: true, value: fmt.money(EAC_FY), icon: 'forecast', tone: EAC_FY > BUDGET ? 'crit' : 'ok', delta: ((EAC_FY - BUDGET) / BUDGET) * 100, deltaInvert: true, sub: 'vs budget', spark: MONTHS.map((_, m) => (m <= NOW_M ? sum(actualByMonth.slice(0, m + 1), monthTotal) : YTD + ((EAC_FY - YTD) * (m - NOW_M)) / (11 - NOW_M))) },
  ];
  const gapTxt = gap >= 0 ? `headroom of <b>${fmt.money(gap)}</b> even if the whole backlog is delivered this year` : `a shortfall of <b>${fmt.money(-gap)}</b> if the whole backlog were delivered this year`;
  return `<div class="nx-page">
  ${ui.hero({ kicker: 'Operational output · budget vs backlog', icon: 'scale', text: `Approved maintenance budget remaining is <b>${fmt.money(remaining)}</b> against an estimated <b>${fmt.money(backlogCost + committed)}</b> to clear the remaining repair backlog (${backlog.length} work orders) — ${gapTxt}.`, meta: [{ label: 'Budget burn', value: fmt.pct(burn, 1) }, { label: 'Year elapsed', value: fmt.pct(ELAPSED * 100, 0) }, { label: 'Backlog / remaining', value: `${fmt.n((backlogCost + committed) / Math.max(1, remaining), 2)}×` }] })}
  ${ui.kpis(kp)}
  <div class="nx-row nx-c12">
    <div class="nx-s8">${ui.card({ title: 'Actual vs budget, FY2026', sub: 'Monthly spend (bars) and cumulative position (lines). Nov is month-to-date; Dec is plan only.', tools: ui.seg('cumview', [['m', 'Monthly'], ['c', 'Cumulative']], 'm'), body: ui.chart('avb', 'md') })}</div>
    <div class="nx-s4">${ui.card({ title: 'Budget burn', sub: 'Spend to date as a share of the annual budget; marker = share of year elapsed.', body: ui.chart('burn', 'md') })}</div>
  </div>
  <div class="nx-row nx-c12">
    <div class="nx-s7">${ui.card({ title: 'Budget to forecast bridge', exp: true, sub: 'How the approved budget is consumed: spent, committed, the share of backlog assumed deliverable and the forecast position at year end.', body: ui.chart('wf', 'md') })}</div>
    <div class="nx-s5">${ui.card({ title: 'Corrective spend by work type', erp: ['SAP PM', 'workOrders'], sub: 'Completed work orders, actual cost FY2026', body: ui.chart('wt', 'md') })}</div>
  </div>
  <div class="nx-row nx-c12">
    <div class="nx-s6">${ui.card({ title: 'Spend by transmission corridor', sub: 'Actual vs budget vs open backlog, all budget lines allocated', body: `${ui.chart('corr', 'md')}<div class="nx-list" style="margin-top:6px">${CORRIDORS.map((c) => { const x = spendByCorr[c]; const u = (x.actual / x.budget) * 100; return `<div class="nx-li" style="padding:7px 0"><span class="nx-li-ico" style="width:26px;height:26px;background:${CORR_COLOR[c]}1a;color:${CORR_COLOR[c]}">${icon(c === 'Substation' ? 'substation' : 'line')}</span><div class="nx-li-main"><b>${c === 'Substation' ? 'Substations' : `Corridor ${c}`}</b><span>${fmt.money(x.actual)} of ${fmt.money(x.budget)} · backlog ${fmt.money(x.backlog)}</span></div><div style="width:160px">${ui.meter(u, 100, u > ELAPSED * 100 + 5 ? '#f59e0b' : CORR_COLOR[c], fmt.pct(u, 0))}</div></div>`; }).join('')}</div>` })}</div>
    <div class="nx-s6">${ui.card({ title: 'Highest-cost open work orders', erp: ['SAP PM', 'workOrders'], sub: 'Planned cost, bottom-up estimate. Click for the build-up.', flush: true, body: ui.table({ cols: [{ key: 'id', label: 'WO', render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub">${esc(fmt.title(w.work_type))}</span>` }, { key: 'towerName', label: 'Asset', render: (w) => `${esc(w.towerName || w.asset)}<span class="nx-sub">${esc(lineOf(w))}</span>` }, { key: 'stage', label: 'Stage', render: (w) => stageBadge(w.stage) }, { label: 'Planned', align: 'r', render: (w) => `<b>${fmt.money(woCost(w).total)}</b>`, sort: (w) => woCost(w).total }], rows: [...backlog].sort((a, b) => woCost(b).total - woCost(a).total).slice(0, 10), rowId: (w) => w.id }) })}</div>
  </div></div>`;
}
function mountOverview(st, ctx) {
  const budM = budgetByMonth.map(monthTotal); const actM = actualByMonth.map((o, m) => (m <= NOW_M ? monthTotal(o) : null));
  const cumB = budM.map((_, m) => sum(budM.slice(0, m + 1), (x) => x));
  const cumA = actM.map((_, m) => (m <= NOW_M ? sum(actM.slice(0, m + 1), (x) => x) : null));
  const cumF = MONTHS.map((_, m) => (m < NOW_M ? null : m === NOW_M ? cumA[m] : cumA[NOW_M] + ((EAC_FY - YTD) * (m - NOW_M)) / (11 - NOW_M)));
  const k = (v) => (v == null ? null : Math.round(v / 1000));
  const draw = (mode) => ctx.chart('avb', mode === 'c' ? {
    ...ch.line({ x: MONTHS, yName: '$k', series: [{ name: 'Budget (cumulative)', data: cumB.map(k), color: '#94a3b8', dash: true }, { name: 'Actual (cumulative)', data: cumA.map(k), color: '#2563eb', area: true }, { name: 'Forecast', data: cumF.map(k), color: '#f59e0b', dash: true }] }),
  } : {
    ...ch.bar({ x: MONTHS, yName: '$k', series: [{ name: 'Budget', data: budM.map(k), color: '#cbd5e1' }, { name: 'Actual', data: actM.map(k), color: '#2563eb' }] }),
    series: [{ type: 'bar', name: 'Budget', data: budM.map(k), itemStyle: { color: '#dbe3ee', borderRadius: [4, 4, 0, 0] }, barGap: '-100%', barWidth: 22 }, { type: 'bar', name: 'Actual', data: actM.map((v, m) => ({ value: k(v), itemStyle: { color: v > budM[m] * 1.08 ? '#ef4444' : '#2563eb', borderRadius: [4, 4, 0, 0] } })), barWidth: 12 }],
  });
  draw('m'); ctx.onPick('cumview', draw);
  ctx.chart('burn', {
    series: [
      { type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '92%', center: ['50%', '56%'], progress: { show: true, width: 16, itemStyle: { color: YTD / BUDGET > ELAPSED + 0.03 ? '#f59e0b' : '#2563eb' } }, axisLine: { lineStyle: { width: 16, color: [[1, '#eef2f7']] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { offsetCenter: [0, '30%'], fontSize: 11, color: '#64748b' }, detail: { offsetCenter: [0, '-2%'], fontSize: 30, fontWeight: 700, color: '#0f172a', formatter: '{value}%' }, data: [{ value: +((YTD / BUDGET) * 100).toFixed(1), name: `${fmt.money(YTD)} of ${fmt.money(BUDGET)}` }] },
      { type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '92%', center: ['50%', '56%'], axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { show: false }, pointer: { icon: 'rect', width: 3, length: '22%', offsetCenter: [0, '-78%'], itemStyle: { color: '#0f172a' } }, data: [{ value: +(ELAPSED * 100).toFixed(1) }] },
    ],
    graphic: [{ type: 'text', left: 'center', bottom: 6, style: { text: `Year elapsed ${fmt.pct(ELAPSED * 100, 0)} · ${fmt.money(EAC_FY)}`, fill: '#64748b', fontSize: 11 } }],
  });
  // waterfall: budget → spent → committed → deliverable backlog → remaining
  const steps = [['Approved budget', BUDGET, 'total'], ['Spent YTD', -YTD], ['Routine to year end', -restRoutine], ['Committed WOs', -committed], ['Deliverable backlog', -deliverable], ['Position at year end', BUDGET - EAC_FY, 'total']];
  let run = 0; const base = []; const val = []; const col = [];
  for (const [, v, t] of steps) {
    if (t === 'total') { base.push(Math.min(0, v)); val.push(Math.abs(v)); col.push(v >= 0 ? '#0f172a' : '#dc2626'); run = v; } else { const nr = run + v; base.push(Math.min(run, nr)); val.push(Math.abs(v)); col.push(v < 0 ? '#f59e0b' : '#16a34a'); run = nr; }
  }
  ctx.chart('wf', { grid: ch.grid({ top: 16 }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[1].name}<br/><b>${money(steps[p[1].dataIndex][1])}</b>` }, xAxis: { type: 'category', data: steps.map((s) => s[0]), axisLabel: { interval: 0, fontSize: 10.5, color: '#475569' } }, yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, series: [{ type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, emphasis: { disabled: true } }, { type: 'bar', stack: 'w', data: val.map((v, i) => ({ value: v, itemStyle: { color: col[i], borderRadius: 4 } })), barWidth: 38, label: { show: true, position: 'top', fontSize: 11, color: '#334155', formatter: (p) => money(steps[p.dataIndex][1]) } }] });
  const byWt = WORK_TYPES.map((t, i) => ({ name: fmt.title(t), value: Math.round(sum(done.filter((w) => w.work_type === t), (w) => woCost(w).actual)), color: WT_COLOR[i % 8] })).sort((a, b) => b.value - a.value);
  ctx.chart('wt', { ...ch.donut({ data: byWt, center: 'FY2026 corrective', value: fmt.money(sum(byWt, (d) => d.value)) }), tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/><b>${fmt.money(p.value)}</b> (${p.percent}%)` } });
  ctx.chart('corr', ch.bar({ x: CORRIDORS.map((c) => (c === 'Substation' ? 'Substations' : `Corridor ${c}`)), yName: '$k', labels: false, series: [{ name: 'Budget', data: CORRIDORS.map((c) => Math.round(spendByCorr[c].budget / 1000)), color: '#cbd5e1' }, { name: 'Actual', data: CORRIDORS.map((c) => Math.round(spendByCorr[c].actual / 1000)), color: '#2563eb' }, { name: 'Open backlog', data: CORRIDORS.map((c) => Math.round(spendByCorr[c].backlog / 1000)), color: '#f59e0b' }] }));
  ctx.on('click', 'tr[data-row]', (e, tr) => { const w = net.workOrders.find((x) => x.id === tr.dataset.row); if (w) openWO(w); });
}

let planFilter = 'open';
function dashCosting() {
  return `<div class="nx-page">
  ${ui.callout('Every repair plan is costed bottom-up: <b>labour</b> (job hours × crew size × burdened skill rate), <b>equipment</b> (day-rate × job days), <b>materials</b> (catalogue items for the linked findings), mobilisation, switching for outage jobs and 10% contingency. Rates: ' + Object.entries(LABOUR_RATE).map(([k, v]) => `${k} $${v}/h`).join(' · ') + '.', 'info', 'info')}
  <div class="nx-row nx-c12">
    <div class="nx-s8">${ui.card({ title: 'Cost build-up of proposed repair plans', erp: ['SAP PM', 'workOrders'], sub: 'Stacked by cost element, top 18 by planned cost', tools: ui.seg('planf', [['open', 'Not started'], ['in_progress', 'In progress'], ['all', 'All open']], planFilter), body: ui.chart('build', 'lg') })}</div>
    <div class="nx-s4">${ui.card({ title: 'Portfolio cost mix', erp: ['SAP PM', 'workOrders'], sub: 'Share of each element across the selection', body: ui.chart('mix', 'lg') })}</div>
  </div>
  ${ui.card({ title: 'Repair plan cost sheet', erp: ['SAP PM', 'workOrders'], sub: `Every open work order (${erp.syncedText('workOrders')}) with its bottom-up estimate. Click a row for the full build-up.`, tools: ui.search('#fin-plan', 'Filter WO, tower, line…'), flush: true, body: `<div style="max-height:520px;overflow:auto">${planTable()}</div>` })}
  </div>`;
}
const planRows = () => backlog.filter((w) => (planFilter === 'all' ? true : planFilter === 'open' ? w.stage !== 'in_progress' : w.stage === 'in_progress'));
function planTable() {
  return ui.table({ id: 'fin-plan', rowId: (w) => w.id, rows: [...planRows()].sort((a, b) => woCost(b).total - woCost(a).total), cols: [
    { key: 'id', label: 'Work order', render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub">SAP ${esc(w.sap)}</span>` },
    { key: 'work_type', label: 'Work type', render: (w) => `${esc(fmt.title(w.work_type))}<span class="nx-sub">${w.outage ? 'Outage required' : 'Live-line'}</span>` },
    { key: 'towerName', label: 'Asset', render: (w) => `${esc(w.towerName || w.asset)}<span class="nx-sub">${esc(lineOf(w))}</span>` },
    { key: 'crewName', label: 'Crew', render: (w) => `${esc(w.crew)}<span class="nx-sub">${woCost(w).size} × $${woCost(w).rate}/h</span>` },
    { key: 'priority', label: 'Priority', render: (w) => ui.badge(w.priority, w.priority === 'high' ? 'crit' : w.priority === 'medium' ? 'warn' : 'muted') },
    { label: 'Labour', align: 'r', render: (w) => fmt.money(woCost(w).labour), sort: (w) => woCost(w).labour },
    { label: 'Equipment', align: 'r', render: (w) => fmt.money(woCost(w).equipment), sort: (w) => woCost(w).equipment },
    { label: 'Materials', align: 'r', render: (w) => fmt.money(woCost(w).materials), sort: (w) => woCost(w).materials },
    { label: 'Build-up', render: (w) => `<div style="width:120px">${buildBar(woCost(w))}</div>`, sort: false },
    { label: 'Total', align: 'r', render: (w) => `<b>${fmt.money(woCost(w).total)}</b>`, sort: (w) => woCost(w).total },
  ] });
}
function mountCosting(st, ctx) {
  const draw = () => {
    const rows = [...planRows()].sort((a, b) => woCost(b).total - woCost(a).total).slice(0, 18);
    const el = ['labour', 'equipment', 'materials', 'mobilisation', 'switching', 'contingency'];
    ctx.chart('build', ch.bar({ x: rows.map((w) => `${w.id} · ${String(w.towerName || w.asset).slice(0, 14)}`), horizontal: true, stack: true, grid: { left: 4 }, series: el.map((k) => ({ name: fmt.title(k), data: rows.map((w) => woCost(w)[k]), color: BUILD_COLORS[k] })), tooltip: { valueFormatter: (v) => fmt.money(v) } }), { onClick: (p) => openWO(rows[p.dataIndex]) });
    const all = planRows();
    ctx.chart('mix', { ...ch.donut({ data: el.map((k) => ({ name: fmt.title(k), value: sum(all, (w) => woCost(w)[k]), color: BUILD_COLORS[k] })), center: `${all.length} work orders`, value: fmt.money(sum(all, (w) => woCost(w).total)), legend: false }), legend: { bottom: 0, icon: 'circle' } });
  };
  draw();
  ctx.onPick('planf', (v) => { planFilter = v; draw(); const host = st.querySelector('#fin-plan')?.closest('.nx-table-wrap')?.parentElement; if (host) host.innerHTML = planTable(); });
  ctx.on('click', 'tr[data-row]', (e, tr) => { const w = net.workOrders.find((x) => x.id === tr.dataset.row); if (w) openWO(w); });
}

function dashVariance() {
  const rows = done.filter((w) => w.completed_at);
  const over = rows.filter((w) => woCost(w).variance > 1.05);
  const tot = sum(rows, (w) => woCost(w).actual); const plan = sum(rows, (w) => woCost(w).total);
  return `<div class="nx-page">
  ${ui.kpis([
    { label: 'Completed work orders', value: rows.length, icon: 'checkCircle', tone: 'ok', sub: `${fmt.money(tot)} actual cost` },
    { label: 'Portfolio cost variance', value: `${tot >= plan ? '+' : ''}${fmt.n(((tot - plan) / plan) * 100, 1)}%`, icon: 'scale', tone: tot > plan * 1.03 ? 'warn' : 'ok', sub: `${fmt.money(tot - plan)} vs bottom-up plan` },
    { label: 'Jobs over plan by > 5%', value: over.length, icon: 'trend', tone: 'crit', sub: `${fmt.money(sum(over, (w) => woCost(w).actual - woCost(w).total))} overrun` },
    { label: 'Average turnaround', value: fmt.n(sum(rows, (w) => w.ttrDays || 0) / Math.max(1, rows.filter((w) => w.ttrDays != null).length), 0), unit: 'days', icon: 'clock', sub: 'finding → repair closed' },
  ])}
  <div class="nx-row nx-c2">
    ${ui.card({ title: 'Planned vs actual cost, completed jobs', erp: ['SAP PM', 'workOrders'], sub: 'Points above the diagonal overran. Colour = work type, size = labour hours.', body: ui.chart('pa', 'lg') })}
    ${ui.card({ title: 'Variance by work type', erp: ['SAP PM', 'workOrders'], sub: 'Actual minus plan, $k (red = overrun)', body: ui.chart('vw', 'lg') })}
  </div>
  ${ui.card({ title: 'Largest overruns', erp: ['SAP PM', 'workOrders'], sub: 'Completed jobs ranked by $ overrun', flush: true, body: ui.table({ rowId: (w) => w.id, rows: [...rows].sort((a, b) => (woCost(b).actual - woCost(b).total) - (woCost(a).actual - woCost(a).total)).slice(0, 10), cols: [
    { key: 'id', label: 'WO', render: (w) => `<b>${esc(w.id)}</b>` }, { key: 'work_type', label: 'Work type', render: (w) => esc(fmt.title(w.work_type)) }, { key: 'towerName', label: 'Asset', render: (w) => esc(w.towerName || w.asset) }, { key: 'completed_at', label: 'Closed', render: (w) => fmt.date(w.completed_at) },
    { label: 'Plan', align: 'r', render: (w) => fmt.money(woCost(w).total), sort: (w) => woCost(w).total }, { label: 'Actual', align: 'r', render: (w) => fmt.money(woCost(w).actual), sort: (w) => woCost(w).actual },
    { label: 'Variance', align: 'r', render: (w) => { const v = (woCost(w).variance - 1) * 100; return `<b style="color:${v > 5 ? '#dc2626' : v < -3 ? '#16a34a' : '#475569'}">${v >= 0 ? '+' : ''}${fmt.n(v, 1)}%</b>`; }, sort: (w) => woCost(w).variance },
  ] }) })}
  </div>`;
}
function mountVariance(st, ctx) {
  const rows = done.filter((w) => w.completed_at);
  const mx = Math.max(...rows.map((w) => woCost(w).actual)) / 1000;
  ctx.chart('pa', {
    grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0, type: 'scroll' }, tooltip: { formatter: (p) => `${p.data[3]}<br/>Plan ${fmt.money(p.data[0] * 1000)} · Actual ${fmt.money(p.data[1] * 1000)}` },
    xAxis: { type: 'value', name: 'Plan $k', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'Actual $k' },
    series: [...WORK_TYPES.map((t, i) => ({ type: 'scatter', name: fmt.title(t), symbolSize: (d) => 6 + Math.sqrt(d[2]) * 1.4, itemStyle: { color: WT_COLOR[i % 8], opacity: 0.8 }, data: rows.filter((w) => w.work_type === t).map((w) => [woCost(w).total / 1000, woCost(w).actual / 1000, w.labourH, `${w.id} · ${w.towerName || w.asset}`]) })),
      { type: 'line', name: 'Plan = actual', data: [[0, 0], [mx, mx]], showSymbol: false, lineStyle: { type: 'dashed', color: '#94a3b8' }, tooltip: { show: false } }],
  });
  const vv = WORK_TYPES.map((t) => ({ t, v: sum(rows.filter((w) => w.work_type === t), (w) => woCost(w).actual - woCost(w).total) })).sort((a, b) => b.v - a.v);
  ctx.chart('vw', { ...ch.bar({ x: vv.map((x) => fmt.title(x.t)), horizontal: true, series: [{ name: 'Variance', data: vv.map((x) => ({ value: Math.round(x.v / 100) / 10, itemStyle: { color: x.v > 0 ? '#ef4444' : '#16a34a', borderRadius: x.v > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }], tooltip: { valueFormatter: (v) => `$${v}k` } }) });
  ctx.on('click', 'tr[data-row]', (e, tr) => { const w = net.workOrders.find((x) => x.id === tr.dataset.row); if (w) openWO(w); });
}

/* ======================================================================== 2. Budget Planning */
const plan = { inflation: 6.5, clear: 70, reserve: 8, row: 100 };
function fy27() {
  const inf = 1 + plan.inflation / 100;
  const routine = ROUTINE.filter((r) => r.id !== 'em').map((r) => ({ id: r.id, name: r.name, fy26: sum(MONTHS, (_, m) => routineMonth(r, m)), fy27: sum(MONTHS, (_, m) => routineMonth(r, m)) * inf * (r.id === 'row' ? plan.row / 100 : 1) }));
  const carry = (backlogCost + committed) * (plan.clear / 100) * inf;
  const newCorr = CORRECTIVE_BUDGET * inf * 1.04; // condition trend: findings rising ~4%/yr
  const base = sum(routine, (r) => r.fy27) + carry + newCorr;
  const reserve = base * (plan.reserve / 100);
  return { routine, carry, newCorr, reserve, total: base + reserve };
}
function budgetAnnual() {
  const f = fy27();
  const slider = (k, label, min, max, step, unit) => `<div class="fin-slider"><label for="fin-${k}">${label}</label><output id="fin-o-${k}">${plan[k]}${unit}</output><input type="range" id="fin-${k}" data-k="${k}" data-u="${unit}" min="${min}" max="${max}" step="${step}" value="${plan[k]}"/></div>`;
  return `<div class="nx-page">
  <div class="nx-row nx-c12">
    <div class="nx-s4">${ui.card({ title: 'FY2027 budget drivers', sub: 'Move a driver; the request and its justification update at once.', body: `${slider('inflation', 'Cost escalation (labour + materials)', 0, 15, 0.5, '%')}${slider('clear', 'Share of FY2026 backlog to clear in FY2027', 0, 100, 5, '%')}${slider('row', 'ROW vegetation programme scope', 60, 140, 5, '%')}${slider('reserve', 'Emergency & risk reserve', 0, 20, 1, '%')}<div class="nx-sec" style="margin-top:8px"><h4>Request</h4><div class="fin-big" id="fin-total">${fmt.money(f.total)}</div><div class="nx-note" id="fin-delta"></div></div><div class="nx-sec" style="margin-top:12px"><h4>Change vs FY2026 by line</h4><div class="nx-chart" data-chart="req-delta" style="height:190px"></div></div>` })}</div>
    <div class="nx-s8">${ui.card({ title: 'FY2027 maintenance budget request', sub: 'Build-up from FY2026 budget lines, escalation, backlog carry-over and reserve', body: '<div class="nx-chart" data-chart="req" style="height:610px"></div>' })}</div>
  </div>
  <div class="nx-row nx-c2">
    ${ui.card({ title: 'Budget lines, FY2026 approved vs FY2027 request', flush: true, body: `<div id="fin-lines">${budgetLines()}</div>` })}
    ${ui.card({ title: 'Five-year opex outlook', exp: true, sub: 'Projected maintenance opex at current drivers; replacement of poor-band assets (Capital Planning) is assumed to bend the corrective line down', body: ui.chart('outlook', 'md') })}
  </div></div>`;
}
function budgetLines() {
  const f = fy27();
  const rows = [...f.routine.map((r) => ({ name: r.name, a: r.fy26, b: r.fy27 })), { name: 'Corrective repairs — new findings', a: CORRECTIVE_BUDGET, b: f.newCorr }, { name: 'Backlog carry-over', a: 0, b: f.carry }, { name: 'Emergency & risk reserve', a: sum(MONTHS, (_, m) => routineMonth(ROUTINE[4], m)), b: f.reserve }];
  rows.push({ name: 'Total', a: sum(rows, (r) => r.a), b: sum(rows, (r) => r.b), total: true });
  return ui.table({ cols: [{ key: 'name', label: 'Budget line', render: (r) => (r.total ? `<b>${esc(r.name)}</b>` : esc(r.name)) }, { label: 'FY2026', align: 'r', render: (r) => fmt.money(r.a), sort: (r) => r.a }, { label: 'FY2027', align: 'r', render: (r) => `<b>${fmt.money(r.b)}</b>`, sort: (r) => r.b }, { label: 'Change', align: 'r', render: (r) => (r.a ? ui.delta(((r.b - r.a) / r.a) * 100, { invert: true }) : ui.badge('new', 'info')), sort: (r) => (r.a ? r.b / r.a : 9) }], rows });
}
function mountAnnual(st, ctx) {
  const draw = () => {
    const f = fy27();
    const items = [...f.routine.map((r) => [r.name, r.fy27]), ['Corrective — new findings', f.newCorr], ['Backlog carry-over', f.carry], ['Reserve', f.reserve]];
    let run = 0; const base = []; const vals = [];
    for (const [, v] of items) { base.push(run); vals.push(v); run += v; }
    ctx.chart('req', { grid: ch.grid({ top: 16 }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[1].name}<br/><b>${fmt.money(p[1].value)}</b>` }, xAxis: { type: 'category', data: [...items.map((i) => i[0]), 'FY2027 request'], axisLabel: { interval: 0, fontSize: 10, width: 90, overflow: 'break', color: '#475569' } }, yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, series: [{ type: 'bar', stack: 's', data: [...base, 0], itemStyle: { color: 'transparent' } }, { type: 'bar', stack: 's', barWidth: 36, data: [...vals.map((v, i) => ({ value: Math.round(v), itemStyle: { color: WT_COLOR[i % 8], borderRadius: 4 } })), { value: Math.round(f.total), itemStyle: { color: '#0f172a', borderRadius: 4 } }], label: { show: true, position: 'top', fontSize: 10.5, color: '#334155', formatter: (p) => fmt.money(p.value) } }] });
    st.querySelector('#fin-total').textContent = fmt.money(f.total);
    const d = ((f.total - BUDGET) / BUDGET) * 100;
    st.querySelector('#fin-delta').innerHTML = `${ui.delta(d, { invert: true })} vs FY2026 approved ${fmt.money(BUDGET)}. Clears ${plan.clear}% of the ${fmt.money(backlogCost + committed)} backlog.`;
    st.querySelector('#fin-lines').innerHTML = budgetLines();
    const dl = [...f.routine.map((r) => [r.name.replace(' management', '').replace(' campaigns', '').replace(' & DGA', '').replace(' & testing', ''), r.fy27 - r.fy26]), ['Corrective (new)', f.newCorr - CORRECTIVE_BUDGET], ['Backlog carry-over', f.carry], ['Reserve', f.reserve - sum(MONTHS, (_, m) => routineMonth(ROUTINE[4], m))]].sort((x, y) => y[1] - x[1]);
    ctx.chart('req-delta', { ...ch.bar({ x: dl.map((d) => d[0]), horizontal: true, legend: false, series: [{ name: 'Change', data: dl.map((d) => ({ value: Math.round(d[1]), itemStyle: { color: d[1] >= 0 ? '#ef4444' : '#16a34a', borderRadius: d[1] >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }], grid: { top: 4, right: 16, left: 4 } }), xAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v), fontSize: 9.5 } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v >= 0 ? '+' : '−'}${fmt.money(Math.abs(v))}` } });
    const yrs = [2026, 2027, 2028, 2029, 2030, 2031];
    const inf = 1 + plan.inflation / 100;
    const routineY = yrs.map((y, i) => sum(ROUTINE.filter((r) => r.id !== 'em'), (r) => sum(MONTHS, (_, m) => routineMonth(r, m))) * inf ** i);
    const corrDN = yrs.map((y, i) => CORRECTIVE_BUDGET * (1.08 * inf) ** i);
    const corrPlan = yrs.map((y, i) => CORRECTIVE_BUDGET * inf ** i * (1 - Math.min(0.32, i * 0.08)));
    ctx.chart('outlook', ch.line({ x: yrs.map(String), yName: '$M', series: [{ name: 'Routine programme', data: routineY.map((v) => +(v / 1e6).toFixed(2)), color: '#14b8a6', area: true, stack: 'a' }, { name: 'Corrective — do nothing', data: corrDN.map((v) => +(v / 1e6).toFixed(2)), color: '#ef4444', dash: true }, { name: 'Corrective — with capital plan', data: corrPlan.map((v) => +(v / 1e6).toFixed(2)), color: '#2563eb' }] }));
  };
  draw();
  ctx.on('input', 'input[type=range]', (e, inp) => { plan[inp.dataset.k] = Number(inp.value); st.querySelector(`#fin-o-${inp.dataset.k}`).textContent = `${inp.value}${inp.dataset.u}`; draw(); });
}

function budgetBacklog() {
  const pr = ['high', 'medium', 'low'];
  const byP = pr.map((p) => sum(backlog.filter((w) => w.priority === p), (w) => woCost(w).total));
  let acc = remaining; const fundable = [];
  for (const w of [...backlog].sort((a, b) => (b.sevScore === a.sevScore ? 0 : a.sevScore - b.sevScore) || pr.indexOf(a.priority) - pr.indexOf(b.priority))) { const c = woCost(w).total; fundable.push({ w, ok: acc - c >= 0 }); if (acc - c >= 0) acc -= c; }
  const unfunded = fundable.filter((x) => !x.ok);
  return `<div class="nx-page">
  ${ui.kpis([
    { label: 'Budget remaining FY2026', value: fmt.money(remaining), icon: 'wallet', sub: `${fmt.pct((remaining / BUDGET) * 100, 1)} of approved` },
    { label: 'High-priority backlog', value: fmt.money(byP[0]), icon: 'alert', tone: 'crit', sub: `${backlog.filter((w) => w.priority === 'high').length} work orders` },
    { label: 'Fundable this year', value: fundable.filter((x) => x.ok).length, unit: `of ${backlog.length}`, icon: 'checkCircle', tone: 'ok', sub: 'in severity order within remaining budget' },
    { label: 'Unfunded backlog', value: fmt.money(sum(unfunded, (x) => woCost(x.w).total)), icon: 'event', tone: unfunded.length ? 'warn' : 'ok', sub: `${unfunded.length} work orders carry into FY2027` },
  ])}
  <div class="nx-row nx-c12">
    <div class="nx-s7">${ui.card({ title: 'Backlog funding curve', erp: ['SAP PM', 'workOrders'], sub: 'Open work orders in severity order (worst condition first); cumulative cost against the remaining budget line', body: ui.chart('fund', 'lg') })}</div>
    <div class="nx-s5">${ui.card({ title: 'Backlog by corridor and priority', erp: ['SAP PM', 'workOrders'], sub: 'Planned cost, $k', body: ui.chart('bcp', 'lg') })}</div>
  </div>
  ${ui.card({ title: 'Work that does not fit this year', erp: ['SAP PM', 'workOrders'], sub: 'Carries into the FY2027 request as backlog carry-over', flush: true, body: unfunded.length ? ui.table({ rowId: (x) => x.w.id, rows: unfunded, cols: [{ label: 'WO', render: (x) => `<b>${esc(x.w.id)}</b>`, sort: (x) => x.w.id }, { label: 'Work type', render: (x) => esc(fmt.title(x.w.work_type)), sort: (x) => x.w.work_type }, { label: 'Asset', render: (x) => `${esc(x.w.towerName || x.w.asset)}<span class="nx-sub">${esc(lineOf(x.w))}</span>`, sort: (x) => x.w.towerName }, { label: 'Severity', render: (x) => ui.badge(x.w.severity, SEV_TONE[x.w.severity]), sort: (x) => x.w.sevScore }, { label: 'Cost', align: 'r', render: (x) => `<b>${fmt.money(woCost(x.w).total)}</b>`, sort: (x) => woCost(x.w).total }] }) : ui.empty('The whole backlog fits in the remaining FY2026 budget.') })}
  </div>`;
}
function mountBacklog(st, ctx) {
  const pr = ['high', 'medium', 'low'];
  const rows = [...backlog].sort((a, b) => a.sevScore - b.sevScore || pr.indexOf(a.priority) - pr.indexOf(b.priority));
  let c = 0; const cum = rows.map((w) => { c += woCost(w).total; return Math.round(c / 1000); });
  ctx.chart('fund', {
    grid: ch.grid({ top: 30 }), tooltip: { trigger: 'axis', formatter: (p) => { const w = rows[p[0].dataIndex]; return `${w.id} · ${fmt.title(w.work_type)}<br/>${esc(w.towerName || w.asset)} · ${w.severity}<br/>Cumulative <b>$${fmt.n(p[0].value)}k</b>`; } },
    xAxis: { type: 'category', data: rows.map((w) => w.id), axisLabel: { show: false }, name: 'Open work orders, worst first', nameLocation: 'middle', nameGap: 10 }, yAxis: { type: 'value', name: '$k' },
    series: [{ type: 'bar', data: rows.map((w) => ({ value: Math.round(woCost(w).total / 1000), itemStyle: { color: SEV[w.severity] } })), barWidth: '70%', name: 'Job' }, { type: 'line', data: cum, showSymbol: false, lineStyle: { color: '#0f172a', width: 2 }, name: 'Cumulative', markLine: { symbol: 'none', label: { formatter: `Remaining budget ${fmt.money(remaining)}`, position: 'insideStartTop', color: '#16a34a' }, lineStyle: { color: '#16a34a', type: 'dashed', width: 2 }, data: [{ yAxis: Math.round(remaining / 1000) }] } }],
  });
  ctx.chart('bcp', ch.bar({ x: CORRIDORS.map((c2) => (c2 === 'Substation' ? 'Substations' : c2)), stack: true, yName: '$k', series: pr.map((p, i) => ({ name: fmt.title(p), data: CORRIDORS.map((c2) => Math.round(sum(backlog.filter((w) => corrOf(w) === c2 && w.priority === p), (w) => woCost(w).total) / 1000)), color: ['#dc2626', '#f59e0b', '#94a3b8'][i] })) }));
  ctx.on('click', 'tr[data-row]', (e, tr) => { const w = net.workOrders.find((x) => x.id === tr.dataset.row); if (w) openWO(w); });
}

const phaseLines = () => [{ id: 'corrective', name: 'Corrective repairs (work orders)' }, ...ROUTINE].map((r) => { const b = sum(budgetByMonth.slice(0, NOW_M + 1), (o) => o[r.id]); const a = sum(actualByMonth, (o) => o[r.id]); return { id: r.id, name: r.name, b, a, fy: sum(budgetByMonth, (o) => o[r.id]) }; });
function budgetPhasing() {
  const rows = phaseLines();
  return `<div class="nx-page">${ui.card({ title: 'Budget phasing by line and month', sub: 'FY2026 approved phasing ($k). Corrective work follows the inspection campaigns in Feb, May and Oct.', body: ui.chart('ph', 'lg') })}
  <div class="nx-row nx-c12"><div class="nx-s8">${ui.card({ title: 'Actual vs phased budget by line, year-to-date', sub: 'Variance of spend to date against the budget phased to date. Click a line for its monthly profile.', flush: true, body: ui.table({ id: 'fin-ph', rowId: (r) => r.id, rows, cols: [{ key: 'name', label: 'Budget line' }, { label: 'FY budget', align: 'r', render: (r) => fmt.money(r.fy), sort: (r) => r.fy }, { label: 'Phased to date', align: 'r', render: (r) => fmt.money(r.b), sort: (r) => r.b }, { label: 'Actual to date', align: 'r', render: (r) => `<b>${fmt.money(r.a)}</b>`, sort: (r) => r.a }, { label: 'Variance', align: 'r', render: (r) => `<b style="color:${r.a > r.b ? '#dc2626' : '#16a34a'}">${r.a > r.b ? '+' : '−'}${fmt.money(Math.abs(r.a - r.b))}</b>`, sort: (r) => r.a - r.b }, { label: 'Used', render: (r) => ui.meter((r.a / r.fy) * 100, 100, r.a / r.fy > ELAPSED + 0.05 ? '#f59e0b' : '#2563eb', fmt.pct((r.a / r.fy) * 100, 0)), sort: (r) => r.a / r.fy }] }) })}</div>
  <div class="nx-s4">${ui.card({ title: 'Variance to date by line', sub: 'Actual minus phased budget (red = over)', body: '<div class="nx-chart" data-chart="phv" style="height:250px"></div>' })}</div></div></div>`;
}
function openBudgetLine(id) {
  const r = phaseLines().find((x) => x.id === id); if (!r) return;
  const bud = budgetByMonth.map((o) => Math.round(o[id])); const act = actualByMonth.map((o, m) => (m <= NOW_M ? Math.round(o[id]) : null));
  let cb = 0; let ca = 0; const cumB = bud.map((v) => (cb += v)); const cumA = act.map((v) => (v == null ? null : (ca += v)));
  const over = r.a > r.b;
  drawer.open({
    icon: 'wallet', kicker: `Budget line · FY${YEAR}`, title: r.name, sub: `Approved ${fmt.money(r.fy)} · phased to date ${fmt.money(r.b)} · actual ${fmt.money(r.a)}`,
    badges: [[over ? 'Over phased budget' : 'Within phased budget', over ? 'crit' : 'ok'], [`${fmt.pct((r.a / r.fy) * 100, 0)} of annual used`, r.a / r.fy > ELAPSED + 0.05 ? 'warn' : 'info'], [`${fmt.pct(ELAPSED * 100, 0)} of year elapsed`, 'muted']],
    body: `${ui.stats([{ label: 'FY budget', value: fmt.money(r.fy) }, { label: 'Phased to date', value: fmt.money(r.b) }, { label: 'Actual to date', value: fmt.money(r.a) }, { label: 'Variance', value: `${over ? '+' : '−'}${fmt.money(Math.abs(r.a - r.b))}`, color: over ? '#dc2626' : '#16a34a' }, { label: 'Left for Dec', value: fmt.money(Math.max(0, r.fy - r.a)) }])}
    <div class="nx-sec"><h4>Monthly budget and actual</h4><div class="nx-chart" data-chart="bl-m" style="height:240px"></div></div>
    <div class="nx-sec"><h4>Cumulative position</h4><div class="nx-chart" data-chart="bl-c" style="height:200px"></div></div>
    <div class="nx-sec"><h4>Controller's note</h4><p class="nx-note" style="font-size:12.5px;color:var(--nx-ink-2)">${over ? `Spend is running ahead of phasing by ${fmt.money(r.a - r.b)}. Hold discretionary work on this line or release from the emergency reserve; review at the next monthly cost meeting.` : `Spend is ${fmt.money(r.b - r.a)} behind phasing. Check for deferred work or late invoicing before releasing the underspend to the repair backlog.`}</p></div>`,
    mount: (b, ctx) => {
      ctx.chart('bl-m', { ...ch.bar({ x: MONTHS, series: [{ name: 'Budget', data: bud, color: '#cbd5e1' }, { name: 'Actual', data: act, color: over ? '#ef4444' : '#2563eb' }] }), yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (v == null ? '—' : fmt.money(v)) } });
      ctx.chart('bl-c', { ...ch.line({ x: MONTHS, series: [{ name: 'Budget (cumulative)', data: cumB, color: '#94a3b8', dash: true }, { name: 'Actual (cumulative)', data: cumA, color: '#2563eb', area: true }] }), yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : fmt.money(v)) } });
    },
    actions: [{ label: 'Export line report', icon: 'download', onClick: () => toast(`${r.name}: FY${YEAR} phasing report exported`) }],
  });
}
function mountPhasing(st, ctx) {
  const lines = [{ id: 'corrective', name: 'Corrective repairs' }, ...ROUTINE];
  const data = []; lines.forEach((l, y) => MONTHS.forEach((_, x) => data.push([x, y, Math.round(budgetByMonth[x][l.id] / 1000)])));
  const ho = ch.heat({ x: MONTHS, y: lines.map((l) => l.name), data, label: true, colors: ['#f8fafc', '#bfdbfe', '#3b82f6', '#1e3a8a'], fmtv: (v) => `$${v}k` });
  ho.series[0].label = { show: true, fontSize: 10.5, fontWeight: 600, color: '#0f172a', textBorderColor: '#fff', textBorderWidth: 2.5, formatter: (q) => q.value[2] };
  ho.visualMap.itemWidth = 12; ho.visualMap.itemHeight = 220; ho.visualMap.text = ['$k high', 'low'];
  ctx.chart('ph', ho);
  const pl = phaseLines().map((r) => ({ ...r, v: r.a - r.b })).sort((x, y) => y.v - x.v);
  ctx.chart('phv', { ...ch.bar({ x: pl.map((r) => r.name.replace(' (work orders)', '').replace('management', 'mgmt')), horizontal: true, legend: false, series: [{ name: 'Variance', data: pl.map((r) => ({ value: Math.round(r.v), itemStyle: { color: r.v > 0 ? '#ef4444' : '#16a34a', borderRadius: r.v > 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }], grid: { top: 6, right: 16 } }), xAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v), fontSize: 9.5 } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v > 0 ? 'over by ' : 'under by '}${fmt.money(Math.abs(v))}` } });
  ctx.on('click', '#fin-ph tr[data-row]', (e, tr) => openBudgetLine(tr.dataset.row));
}

/* ======================================================================== 3. Cost per Asset */
let rvrAsset = null; // set by the map or ranking, read by Repair vs Replace
function assetInfo(a) {
  return {
    kicker: a.kind === 'tx' ? 'Power transformer' : `Tower · ${a.line}`, title: a.kind === 'tx' ? `${a.name} · ${a.rating} MVA ${a.ratio} kV` : `${a.name} · ${a.type || 'Lattice'}`,
    sub: a.kind === 'tx' ? `${esc(a.maker || '')} · installed ${String(a.install).slice(0, 4)}` : `${a.kv} kV · ${a.corridor} corridor · ${a.age} years`,
    badges: [[`HI ${a.hi ?? '—'} · ${a.band || 'not assessed'}`, a.band === 'poor' ? 'crit' : a.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${a.riskBand || '—'}`, a.riskBand === 'critical' ? 'crit' : a.riskBand === 'high' ? 'high' : a.riskBand === 'medium' ? 'warn' : 'ok']],
    fields: [['Lifetime maintenance', `<b>${fmt.money(a.lifetime)}</b>`], ['FY2026 spend', fmt.money(a.fy)], ['Open repair backlog', fmt.money(a.openCost)], ['Expected loss (risk)', `${fmt.money(a.exposure)}/yr ${ui.exp()}`], ['Replacement cost', `${fmt.money(a.replace)} ${ui.exp()}`], ['Cost-to-replace ratio', fmt.pct((a.lifetime / a.replace) * 100, 1)]],
    spark: { data: a.history, x: ['2021', '2022', '2023', '2024', '2025', '2026'], label: 'Maintenance cost by year ($)', type: 'bar', color: '#2563eb', height: 100 },
    actions: [{ label: 'Cost file', primary: true, icon: 'doc', onClick: () => openAssetCost(a) }, { label: 'Repair vs replace', icon: 'scale', onClick: () => { rvrAsset = a.id; nav.go('rvr'); } }, ...(a.wos.length ? [{ label: `${a.wos.length} work orders`, icon: 'clipboard', onClick: () => openWO(a.wos.sort((x, y) => woCost(y).total - woCost(x).total)[0]) }] : [])],
  };
}
let mapMetric = 'cost';
const qs = (arr, q) => { const v = [...arr].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
const RATIO_Q = [0.5, 0.75, 0.9, 0.97].map((q) => qs(assets.map((a) => a.lifetime / a.replace), q));
const RISK_Q = [0.5, 0.75, 0.9].map((q) => qs(assets.map((a) => a.exposure), q));
function costColor(a) {
  if (mapMetric === 'risk') { const e = a.exposure; return e >= RISK_Q[2] ? '#dc2626' : e >= RISK_Q[1] ? '#ea580c' : e >= RISK_Q[0] ? '#d97706' : '#16a34a'; }
  const r = a.lifetime / a.replace;
  return r >= RATIO_Q[3] ? '#dc2626' : r >= RATIO_Q[2] ? '#ea580c' : r >= RATIO_Q[1] ? '#d97706' : r >= RATIO_Q[0] ? '#65a30d' : '#16a34a';
}
function cpaMap() { return `<div class="nx-map is-full" id="fin-map"></div>`; }
function mountCpaMap(st, ctx) {
  const tw = assets.filter((a) => a.kind === 'tower');
  const maxLife = Math.max(...tw.map((a) => a.lifetime));
  const layers = networkLayers(net, { subsInfo: (s) => ({ kicker: 'Substation', title: s.name, sub: `${s.levels.join('/')} kV`, fields: TXS.filter((t) => t.sub === s.id).map((t) => [t.name, `${fmt.money(assetById.get(t.id).lifetime)} lifetime`]) }) });
  layers.push({ id: 'twcost', name: 'Towers — cost-to-replace', color: '#d97706', points: tw.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, size: 8 + Math.round((a.lifetime / maxLife) * 14), color: costColor(a), pulse: a.band === 'poor', search: `${a.name} ${a.line}`, tip: `${a.name} · ${a.line} · ${fmt.money(a.lifetime)} lifetime · ${fmt.money(a.exposure)}/yr risk`, info: () => assetInfo(a) })) });
  layers.push({ id: 'txcost', name: 'Transformers', color: '#7c3aed', shape: 'dia', points: assets.filter((a) => a.kind === 'tx' && a.lat).map((a, i) => ({ id: a.id, lat: a.lat + 0.003 * (i % 3) - 0.003, lng: a.lng + 0.004 * (i % 2 ? 1 : -1), size: 16, shape: 'dia', color: costColor(a), icon: 'transformer', search: a.name, tip: `${a.name} · ${fmt.money(a.lifetime)} lifetime`, info: () => assetInfo(a) })) });
  const open = backlog.filter((w) => w.lat);
  layers.push({ id: 'wo', name: 'Open work orders ($)', color: '#2563eb', on: false, points: open.map((w) => ({ id: `wo-${w.id}`, lat: w.lat + 0.0012, lng: w.lng - 0.0012, size: 10, shape: 'sq', color: '#2563eb', search: w.id, tip: `${w.id} · ${fmt.title(w.work_type)} · ${fmt.money(woCost(w).total)}`, info: () => ({ kicker: 'Open work order', title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${esc(w.crewName)}`, badges: [[w.stage, stageTone[w.stage]], [w.priority, w.priority === 'high' ? 'crit' : 'warn'], ['ERP · SAP PM', 'info']], fields: [['Labour', fmt.money(woCost(w).labour)], ['Equipment', fmt.money(woCost(w).equipment)], ['Materials', fmt.money(woCost(w).materials)], ['Total', `<b>${fmt.money(woCost(w).total)}</b>`]], actions: [{ label: 'Cost build-up', primary: true, onClick: () => openWO(w) }] }) })) });
  const totLife = sum(assets, (a) => a.lifetime);
  ctx.map('#fin-map', {
    layers, legend: mapMetric === 'risk' ? [{ label: `expected loss < ${fmt.money(RISK_Q[0])}/yr`, color: '#16a34a' }, { label: `${fmt.money(RISK_Q[0])}–${fmt.money(RISK_Q[1])}`, color: '#d97706' }, { label: `${fmt.money(RISK_Q[1])}–${fmt.money(RISK_Q[2])}`, color: '#ea580c' }, { label: `> ${fmt.money(RISK_Q[2])}/yr (top 10%)`, color: '#dc2626' }] : [{ label: `Lifetime cost / replacement < ${fmt.pct(RATIO_Q[0] * 100, 0)}`, color: '#16a34a' }, { label: `${fmt.pct(RATIO_Q[0] * 100, 0)}–${fmt.pct(RATIO_Q[1] * 100, 0)}`, color: '#65a30d' }, { label: `${fmt.pct(RATIO_Q[1] * 100, 0)}–${fmt.pct(RATIO_Q[2] * 100, 0)}`, color: '#d97706' }, { label: `${fmt.pct(RATIO_Q[2] * 100, 0)}–${fmt.pct(RATIO_Q[3] * 100, 0)}`, color: '#ea580c' }, { label: `> ${fmt.pct(RATIO_Q[3] * 100, 0)} (replace candidate)`, color: '#dc2626' }],
    stats: [{ label: 'Lifetime maintenance', value: fmt.money(totLife) }, { label: 'FY2026 spend', value: fmt.money(sum(assets, (a) => a.fy)) }, { label: 'Risk exposure / yr', value: fmt.money(sum(assets, (a) => a.exposure)), color: '#dc2626' }, { label: 'Open backlog', value: fmt.money(backlogCost + committed) }],
    panelExtra: `<h5 style="margin-top:10px">Colour by</h5><div class="nx-seg" data-seg="mapm" style="width:100%"><button type="button" data-v="cost" class="${mapMetric === 'cost' ? 'is-on' : ''}" style="flex:1">Cost / replace</button><button type="button" data-v="risk" class="${mapMetric === 'risk' ? 'is-on' : ''}" style="flex:1">Risk $/yr</button></div>`,
  }).then((m) => {
    if (!m) return;
    st.querySelector('[data-seg="mapm"]')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.v === mapMetric) return; mapMetric = b.dataset.v; nav.rerender(); });
    if (rvrAsset && assetById.get(rvrAsset)) setTimeout(() => m.select(rvrAsset), 300);
  });
}

function cpaRanking() {
  const rows = [...assets].sort((a, b) => b.lifetime - a.lifetime);
  return `<div class="nx-page"><div class="nx-row nx-c12">
    <div class="nx-s7">${ui.card({ title: 'Where maintenance money goes', sub: 'Lifetime maintenance cost: corridor → line → asset class. Area = $.', body: ui.chart('tree', 'xl') })}</div>
    <div class="nx-s5">${ui.card({ title: 'Cost versus condition', sub: 'Each tower: lifetime cost vs health index. Top-left = paying a lot for a poor asset.', body: ui.chart('cvh', 'xl') })}</div></div>
    ${ui.card({ title: 'Asset cost register', sub: 'Every tower and transformer with its lifetime and current-year cost. Click a row for the asset cost file. Risk $/yr and replacement cost are estimates.', tools: ui.search('#fin-reg', 'Filter assets…'), flush: true, body: `<div style="max-height:520px;overflow:auto">${ui.table({ id: 'fin-reg', rowId: (a) => a.id, rows, cols: [
      { key: 'name', label: 'Asset', render: (a) => `<b>${esc(a.name)}</b><span class="nx-sub">${a.kind === 'tx' ? `${a.rating} MVA transformer` : `${esc(a.line)} · ${a.kv} kV`}</span>` },
      { key: 'corridor', label: 'Corridor', render: (a) => esc(a.kind === 'tx' ? 'Substation' : a.corridor) },
      { key: 'age', label: 'Age', align: 'r', render: (a) => `${a.age ?? '—'} y` },
      { key: 'hi', label: 'HI', align: 'r', render: (a) => ui.score(a.hi) },
      { label: 'Lifetime cost', align: 'r', render: (a) => `<b>${fmt.money(a.lifetime)}</b>`, sort: (a) => a.lifetime },
      { label: 'FY2026', align: 'r', render: (a) => fmt.money(a.fy), sort: (a) => a.fy },
      { label: 'Open backlog', align: 'r', render: (a) => (a.openCost ? fmt.money(a.openCost) : '—'), sort: (a) => a.openCost },
      { label: 'Risk $/yr', align: 'r', render: (a) => `<span style="color:${riskColor(a.exposure / 400000)};font-weight:600">${fmt.money(a.exposure)}</span>`, sort: (a) => a.exposure },
      { label: 'Cost / replacement est.', render: (a) => ui.meter((a.lifetime / a.replace) * 100, 50, costColor(a), fmt.pct((a.lifetime / a.replace) * 100, 0)), sort: (a) => a.lifetime / a.replace },
    ] })}</div>` })}</div>`;
}
function mountRanking(st, ctx) {
  const tree = ['North', 'Coastal', 'Inland'].map((c) => ({ name: `Corridor ${c}`, itemStyle: { color: CORR_COLOR[c] }, children: net.lines.filter((l) => l.corridor === c).map((l) => ({ name: l.id, children: [{ name: 'Towers & spans', value: Math.round(sum(assets.filter((a) => a.line === l.id), (a) => a.lifetime)) }, { name: 'ROW & inspection', value: Math.round(sum(actualByMonth, (o) => o.row + o.insp) * ({ North: 0.42, Coastal: 0.25, Inland: 0.33 }[c]) * 5) }] })) }));
  tree.push({ name: 'Substations', itemStyle: { color: CORR_COLOR.Substation }, children: net.substations.map((s) => ({ name: s.short, children: assets.filter((a) => a.kind === 'tx' && a.sub === s.id).map((a) => ({ name: a.name, value: Math.round(a.lifetime) })) })) });
  ctx.chart('tree', { tooltip: { formatter: (p) => `${p.treePathInfo.map((x) => x.name).filter(Boolean).join(' › ')}<br/><b>${fmt.money(p.value)}</b>` }, series: [{ type: 'treemap', roam: false, nodeClick: 'zoomToNode', breadcrumb: { bottom: 0, itemStyle: { color: '#f1f5f9', borderColor: '#e2e8f0', textStyle: { color: '#334155' } } }, top: 4, left: 0, right: 0, bottom: 28, label: { formatter: (p) => `${p.name}\n${fmt.money(p.value)}`, fontSize: 11 }, upperLabel: { show: true, height: 22, color: '#fff', fontWeight: 600 }, levels: [{ itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3 } }, { itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 }, colorSaturation: [0.35, 0.6] }, { colorSaturation: [0.3, 0.55], itemStyle: { borderColor: '#fff', borderWidth: 1, gapWidth: 1 } }], data: tree }] });
  const tw = assets.filter((a) => a.kind === 'tower' && a.hi != null);
  ctx.chart('cvh', { grid: ch.grid({ top: 30, bottom: 20 }), legend: { top: 0, right: 0 }, tooltip: { formatter: (p) => `${p.data[2]}<br/>HI ${p.data[0]} · lifetime ${fmt.money(p.data[1] * 1000)}` }, xAxis: { type: 'value', name: 'Health index', min: 20, max: 100, nameLocation: 'middle', nameGap: 24 }, yAxis: { type: 'value', name: 'Lifetime $k' }, series: net.lines.map((l) => ({ type: 'scatter', name: l.id, itemStyle: { color: l.color, opacity: 0.8 }, symbolSize: (d) => 6 + d[3] * 2, data: tw.filter((a) => a.line === l.id).map((a) => [a.hi, Math.round(a.lifetime / 100) / 10, `${a.name} · ${a.line}`, a.open, a.id]) })), markArea: undefined }, { onClick: (p) => { rvrAsset = p.data[4]; nav.go('rvr'); } });
  ctx.on('click', 'tr[data-row]', (e, tr) => { const a = assetById.get(tr.dataset.row); if (a) openAssetCost(a); });
}

function cpaUnit() {
  const lineRows = net.lines.map((l) => { const a = assets.filter((x) => x.line === l.id); const fy = sum(a, (x) => x.fy); return { l, fy, perKm: fy / l.lengthKm, perTower: fy / a.length, life: sum(a, (x) => x.lifetime) / a.length, exposure: sum(a, (x) => x.exposure) }; });
  return `<div class="nx-page">${ui.kpis(lineRows.map((r) => ({ label: `${r.l.id} · ${r.l.kv} kV`, value: fmt.money(r.perKm), unit: '/km·yr', icon: 'line', sparkColor: r.l.color, sub: `${fmt.money(r.perTower)} per tower · ${r.l.lengthKm} km`, spark: r.l.towers.map((t) => assetById.get(t.id).lifetime).sort((x, y) => y - x) })))}
  <div class="nx-row nx-c2">${ui.card({ title: 'Unit maintenance cost by line', sub: 'FY2026 $ per km and per structure, against a typical utility benchmark band', body: ui.chart('unit', 'md') })}${ui.card({ title: 'Cost per tower by age band', sub: 'Average annual maintenance cost of a structure, by decade of installation', body: ui.chart('age', 'md') })}</div>
  <div class="nx-row nx-c12"><div class="nx-s8">${ui.card({ title: 'Line economics', sub: 'FY2026 spend, unit cost and risk per transmission line', flush: true, body: ui.table({ rows: lineRows, cols: [{ label: 'Line', render: (r) => `<b>${esc(r.l.name)}</b>`, sort: (r) => r.l.id }, { label: 'Length', align: 'r', render: (r) => `${r.l.lengthKm} km`, sort: (r) => r.l.lengthKm }, { label: 'Structures', align: 'r', render: (r) => r.l.towers.length, sort: (r) => r.l.towers.length }, { label: 'FY2026 spend', align: 'r', render: (r) => fmt.money(r.fy), sort: (r) => r.fy }, { label: '$ / km', align: 'r', render: (r) => `<b>${fmt.money(r.perKm)}</b>`, sort: (r) => r.perKm }, { label: 'Avg lifetime / tower', align: 'r', render: (r) => fmt.money(r.life), sort: (r) => r.life }, { label: 'Risk exposure / yr', align: 'r', render: (r) => fmt.money(r.exposure), sort: (r) => r.exposure }, { label: 'Line HI', align: 'r', render: (r) => ui.score(r.l.hi), sort: (r) => r.l.hi }] }) })}</div>
  <div class="nx-s4">${ui.card({ title: 'FY2026 cost per km by work type', sub: 'Completed corrective work and routine upkeep, $ per route-km', body: ui.chart('perkm', 'md') })}</div></div></div>`;
}
function mountUnit(st, ctx) {
  const rows = net.lines.map((l) => { const a = assets.filter((x) => x.line === l.id); const fy = sum(a, (x) => x.fy); return { l, perKm: fy / l.lengthKm, perTower: fy / a.length }; });
  ctx.chart('unit', { ...ch.bar({ x: rows.map((r) => r.l.id), yName: '$', series: [{ name: '$ per km', data: rows.map((r) => ({ value: Math.round(r.perKm), itemStyle: { color: r.l.color, borderRadius: [4, 4, 0, 0] } })), markLine: { symbol: 'none', data: [{ yAxis: 2400, label: { formatter: 'Benchmark low $2.4k/km' } }, { yAxis: 4200, label: { formatter: 'Benchmark high $4.2k/km' } }], lineStyle: { type: 'dashed', color: '#94a3b8' }, label: { color: '#64748b', fontSize: 10, position: 'insideEndTop' } } }, { name: '$ per structure', data: rows.map((r) => Math.round(r.perTower)), color: '#cbd5e1' }] }) });
  const bands = ['1995–2004', '2005–2014', '2015–2026'];
  const bandOf = (y) => (y < 2005 ? 0 : y < 2015 ? 1 : 2);
  const wts = WORK_TYPES.filter((t) => t !== 'transformer repair');
  const lineDone = (l, t) => sum(done.filter((w) => lineOf(w) === l.id && w.work_type === t && monthOf(w.completed_at) != null), (w) => woCost(w).actual) / l.lengthKm;
  const routineKm = (l) => Math.max(0, sum(assets.filter((a) => a.line === l.id), (a) => a.fy) / l.lengthKm - sum(wts, (t) => lineDone(l, t)));
  ctx.chart('perkm', { ...ch.bar({ x: net.lines.map((l) => l.id), stack: true, horizontal: true, series: [...wts.map((t, i) => ({ name: fmt.title(t), color: WT_COLOR[i % 8], data: net.lines.map((l) => Math.round(lineDone(l, t))) })), { name: 'Routine upkeep', color: '#cbd5e1', data: net.lines.map((l) => Math.round(routineKm(l))) }], legend: true, grid: { top: 60 } }), legend: { top: 0, left: 0, type: 'scroll', itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 10 } }, xAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v), fontSize: 9.5 } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${fmt.money(v)}/km` } });
  ctx.chart('age', ch.bar({ x: bands, yName: '$/yr', series: ['North', 'Coastal', 'Inland'].map((c) => ({ name: `Corridor ${c}`, color: CORR_COLOR[c], data: bands.map((_, i) => { const a = assets.filter((x) => x.kind === 'tower' && x.corridor === c && bandOf(Number(String(x.install).slice(0, 4))) === i); return a.length ? Math.round(sum(a, (x) => x.fy) / a.length) : 0; }) })) }));
}

/* ======================================================================== 4. Repair vs Replace */
const rv = { r: 7, n: 25, voll: VOLL, rest: null, det: 2.2 };
const candidates = [...assets].filter((a) => a.hi != null && (a.kind === 'tx' || a.band !== 'normal')).sort((a, b) => b.exposure - a.exposure);
function rvModel(a) {
  const r = rv.r / 100; const N = rv.n; const restH = rv.rest ?? (a.kind === 'tx' ? 720 : 36);
  const mw = a.kind === 'tx' ? (a.rating || 150) * 0.85 : lineMW(a.line);
  const share = a.kind === 'tx' ? 0.04 : 0.08;
  const repairCost = Math.max(a.openCost, a.kind === 'tx' ? 160000 : 18000 + (a.kv || 132) * 60);
  const C = a.replace; const life = a.kind === 'tx' ? 45 : 60;
  const conseq = mw * restH * rv.voll * share + (a.kind === 'tx' ? C * 0.6 : C * 0.35);
  const routine = a.kind === 'tx' ? 16000 : 900 + (a.kv || 132) * 2.2;
  const rows = []; let hiA = Math.min((a.hi ?? 60) + 22, 88); let hiB = 100; let cumA = repairCost; let cumB = C * 1.04; let repairs = 1;
  const disc = (y) => (1 + r) ** -y;
  rows.push({ y: 0, a: repairCost, b: C * 1.04, pa: pFail(a.hi), pb: pFail(a.hi), cumA, cumB, hiA: a.hi, hiB: a.hi });
  for (let y = 1; y <= N; y += 1) {
    hiA -= rv.det * (1 + (100 - hiA) / 120); hiB -= rv.det * 0.55;
    let extraA = 0;
    if (hiA < 45) { extraA = repairCost * 1.08 ** repairs; repairs += 1; hiA = Math.min(hiA + 20, 80); }
    const pa = pFail(hiA); const pb = pFail(hiB);
    const costA = (routine * (1 + (100 - hiA) / 100) + extraA + pa * conseq) * disc(y);
    let costB = (routine * 0.6 + pb * conseq) * disc(y);
    if (y === N) costB -= C * Math.max(0, 1 - N / life) * disc(y);
    cumA += costA; cumB += costB;
    rows.push({ y, a: costA, b: costB, pa, pb, cumA, cumB, hiA, hiB, extraA });
  }
  const crf = r / (1 - (1 + r) ** -N);
  const be = rows.find((x) => x.y > 0 && x.cumB <= x.cumA)?.y ?? null;
  return { rows, npvA: cumA, npvB: cumB, eacA: cumA * crf, eacB: cumB * crf, be, repairCost, C, conseq, repairs: repairs - 1, restH, mw };
}
function rvrView() {
  if (!rvrAsset || !assetById.get(rvrAsset)) rvrAsset = candidates[0]?.id;
  const a = assetById.get(rvrAsset);
  const slider = (k, label, min, max, step, val, unit) => `<div class="fin-slider"><label for="rv-${k}">${label}</label><output id="rv-o-${k}">${val}${unit}</output><input type="range" id="rv-${k}" data-k="${k}" data-u="${unit}" min="${min}" max="${max}" step="${step}" value="${val}"/></div>`;
  return `<div class="nx-page"><div class="nx-row nx-c12">
    <div class="nx-s3" style="display:flex;flex-direction:column;gap:16px">${ui.card({ title: 'Asset and assumptions', sub: 'Pick an asset; move an assumption to re-run the life-cycle model.', body: `<label class="nx-field">Asset<select class="nx-select fin-sel" id="rv-asset">${candidates.map((x) => `<option value="${esc(x.id)}" ${x.id === a.id ? 'selected' : ''}>${esc(x.kind === 'tx' ? `${x.name} · ${x.rating} MVA` : `${x.name} · ${x.line}`)} — HI ${x.hi}</option>`).join('')}</select></label><div style="height:12px"></div>
      ${slider('r', 'Discount rate (real, WACC)', 3, 12, 0.5, rv.r, '%')}${slider('n', 'Evaluation horizon', 10, 40, 1, rv.n, ' y')}${slider('voll', 'Value of lost load', 1000, 20000, 500, rv.voll, ' $/MWh')}${slider('rest', 'Restoration time after failure', a.kind === 'tx' ? 168 : 8, a.kind === 'tx' ? 2160 : 240, a.kind === 'tx' ? 24 : 4, rv.rest ?? (a.kind === 'tx' ? 720 : 36), ' h')}${slider('det', 'Deterioration (HI points / yr)', 0.5, 5, 0.1, rv.det, '')}` })}
      ${ui.card({ title: 'Asset', body: `<div id="rv-asset-kv"></div>` })}
      ${ui.card({ title: 'What moves the answer', sub: 'NPV advantage of replacing (repair − replace) at the low/high end of each assumption', body: '<div class="nx-chart" data-chart="rvtor" style="height:330px"></div>' })}</div>
    <div class="nx-s9" style="display:flex;flex-direction:column;gap:16px">
      <div id="rv-rec"></div>
      <div id="rv-kpis"></div>
      <div class="nx-row nx-c2">${ui.card({ title: 'Cumulative discounted life-cycle cost', sub: 'Capex, routine and corrective maintenance and risk cost (probability × consequence), present value', body: ui.chart('rvcum', 'md') })}${ui.card({ title: 'Annual failure probability', sub: 'From the projected health index under each option', body: ui.chart('rvp', 'md') })}</div>
      ${ui.card({ title: 'Cash-flow schedule (present value)', flush: true, body: `<div id="rv-table" style="max-height:300px;overflow:auto"></div>` })}
    </div></div></div>`;
}
function mountRvr(st, ctx) {
  const draw = () => {
    const a = assetById.get(rvrAsset); const m = rvModel(a);
    const better = m.npvB < m.npvA ? 'B' : 'A';
    const save = Math.abs(m.npvA - m.npvB);
    st.querySelector('#rv-rec').innerHTML = `<div class="fin-rec"><span class="nx-hero-icon">${icon('scale')}</span><div><small>Simulated model output · not validated · ${esc(a.name)}</small><b>${better === 'B' ? 'Model favours replacement' : 'Model favours repair, keep in service'}</b><span style="font-size:12.5px;color:#cbd5e1">${better === 'B' ? `The model estimates replacement is cheaper over ${rv.n} years by ${fmt.money(save)} (PV) once failure risk is priced in${m.be != null ? `; estimated payback in year ${m.be}` : ''}.` : `The model estimates repair is cheaper over ${rv.n} years by ${fmt.money(save)} (PV); ${m.repairs} further repair cycle${m.repairs === 1 ? '' : 's'} projected. Re-test when HI falls below 45.`}</span></div><div class="fin-rec-x"><small>Estimated NPV saving</small><b>${fmt.money(save)}</b></div></div>`;
    st.querySelector('#rv-kpis').innerHTML = ui.kpis([
      { label: 'A · Repair — NPV', value: fmt.money(m.npvA), icon: 'wrench', tone: better === 'A' ? 'ok' : 'warn', sub: `EAC ${fmt.money(m.eacA)}/yr · first repair ${fmt.money(m.repairCost)}` },
      { label: 'B · Replace — NPV', value: fmt.money(m.npvB), icon: 'factory', tone: better === 'B' ? 'ok' : 'warn', sub: `EAC ${fmt.money(m.eacB)}/yr · capex ${fmt.money(m.C)}` },
      { label: 'Consequence of failure', value: fmt.money(m.conseq), icon: 'outage', tone: 'crit', sub: `${fmt.n(m.mw)} MW × ${m.restH} h × VoLL, + emergency works` },
      { label: 'Break-even', value: m.be != null ? `Year ${m.be}` : 'None', icon: 'target', tone: 'info', sub: m.be != null ? 'replacement cumulative cost drops below repair' : `repair stays cheaper over ${rv.n} y` },
    ]);
    st.querySelector('#rv-asset-kv').innerHTML = ui.kv([['Class', a.kind === 'tx' ? 'Power transformer' : `${a.type || 'Lattice'} tower`], ['Line / substation', esc(a.line || a.sub)], ['Age', `${a.age} y`], ['Health index', ui.score(a.hi)], ['Risk band', ui.badge(a.riskBand || '—', a.riskBand === 'critical' ? 'crit' : a.riskBand === 'high' ? 'high' : 'warn')], ['P(failure) now', `${fmt.pct(pFail(a.hi) * 100, 2)} ${ui.exp()}`], ['Lifetime maint.', fmt.money(a.lifetime)], ['Open findings', a.open ?? 0]]);
    const yrs = m.rows.map((x) => String(YEAR + x.y));
    const keep = { ...rv }; const base = m.npvA - m.npvB; const tor = [];
    for (const [k, lab, lo, hi] of [['r', 'Discount rate', 4, 10], ['n', 'Horizon (y)', 15, 35], ['voll', 'VoLL ($/MWh)', 3000, 12000], ['rest', 'Restoration (h)', Math.round(m.restH * 0.5), Math.round(m.restH * 2)], ['det', 'Deterioration', 1, 4]]) {
      rv[k] = lo; const a1 = rvModel(a); rv[k] = hi; const a2 = rvModel(a); Object.assign(rv, keep);
      tor.push({ lab: `${lab} ${lo}–${hi}`, lo: a1.npvA - a1.npvB, hi: a2.npvA - a2.npvB });
    }
    tor.sort((x, y) => Math.abs(y.hi - y.lo) - Math.abs(x.hi - x.lo));
    ctx.chart('rvtor', { grid: { top: 30, left: 6, right: 14, bottom: 22, containLabel: false }, legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v >= 0 ? 'replace better by ' : 'repair better by '}${fmt.money(Math.abs(v))}` }, xAxis: { type: 'value', splitNumber: 3, axisLabel: { formatter: (v) => fmt.money(v), fontSize: 9.5 } }, yAxis: { type: 'category', data: tor.map((x) => x.lab), inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { inside: true, verticalAlign: 'bottom', padding: [0, 0, 10, 0], fontSize: 10, color: '#475569' }, z: 10 }, series: [{ type: 'bar', name: 'Low value', data: tor.map((x) => Math.round(x.lo)), itemStyle: { color: '#93c5fd', borderRadius: 3 }, barGap: '-100%', barWidth: 14, markLine: { symbol: 'none', silent: true, data: [{ xAxis: Math.round(base) }], lineStyle: { color: '#0f172a', type: 'dashed' }, label: { formatter: 'today', fontSize: 9.5 } } }, { type: 'bar', name: 'High value', data: tor.map((x) => Math.round(x.hi)), itemStyle: { color: '#2563eb', borderRadius: 3 }, barWidth: 8 }] });
    ctx.chart('rvcum', { ...ch.line({ x: yrs, yName: '$M (PV)', series: [{ name: 'A · Repair', data: m.rows.map((x) => +(x.cumA / 1e6).toFixed(3)), color: '#f59e0b', area: true, smooth: false }, { name: 'B · Replace', data: m.rows.map((x) => +(x.cumB / 1e6).toFixed(3)), color: '#2563eb', area: true, smooth: false }] }), tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.money(v * 1e6) } });
    ctx.chart('rvp', ch.line({ x: yrs, yName: '%', series: [{ name: 'A · Repair', data: m.rows.map((x) => +(x.pa * 100).toFixed(2)), color: '#f59e0b', step: 'end', smooth: false }, { name: 'B · Replace', data: m.rows.map((x) => +(x.pb * 100).toFixed(2)), color: '#2563eb', smooth: false }] }));
    st.querySelector('#rv-table').innerHTML = ui.table({ rows: m.rows.slice(0, 16), cols: [{ label: 'Year', render: (x) => `<b>${YEAR + x.y}</b>`, sort: (x) => x.y }, { label: 'HI · repair', align: 'r', render: (x) => fmt.n(x.hiA, 0), sort: (x) => x.hiA }, { label: 'A · cost (PV)', align: 'r', render: (x) => `${fmt.money(x.a)}${x.extraA ? ' ' + ui.badge('repair', 'warn', { dot: false }) : ''}`, sort: (x) => x.a }, { label: 'A · cumulative', align: 'r', render: (x) => fmt.money(x.cumA), sort: (x) => x.cumA }, { label: 'HI · replace', align: 'r', render: (x) => fmt.n(x.hiB, 0), sort: (x) => x.hiB }, { label: 'B · cost (PV)', align: 'r', render: (x) => fmt.money(x.b), sort: (x) => x.b }, { label: 'B · cumulative', align: 'r', render: (x) => `<b>${fmt.money(x.cumB)}</b>`, sort: (x) => x.cumB }] });
  };
  draw();
  ctx.on('change', '#rv-asset', (e, s) => { rvrAsset = s.value; rv.rest = null; nav.rerender(); });
  ctx.on('input', 'input[type=range]', (e, inp) => { rv[inp.dataset.k] = Number(inp.value); st.querySelector(`#rv-o-${inp.dataset.k}`).textContent = `${inp.value}${inp.dataset.u}`; draw(); });
}

function rvrFleet() {
  const rows = candidates.map((a) => ({ a, m: rvModel(a) }));
  const rep = rows.filter((x) => x.m.npvB < x.m.npvA);
  return `<div class="nx-page">${ui.kpis([
    { label: 'Assets evaluated', value: rows.length, icon: 'layers', sub: 'moderate/poor towers + all transformers' },
    { label: 'Replace is cheaper', exp: true, value: rep.length, icon: 'factory', tone: 'crit', sub: `${fmt.money(sum(rep, (x) => x.m.C))} capex` },
    { label: 'NPV benefit of replacing those', exp: true, value: fmt.money(sum(rep, (x) => x.m.npvA - x.m.npvB)), icon: 'trend', tone: 'ok', sub: `${rv.r}% real, ${rv.n} years` },
    { label: 'Repair is cheaper', exp: true, value: rows.length - rep.length, icon: 'wrench', tone: 'info', sub: 'keep in service, repair on condition' },
  ])}
  <div class="nx-row nx-c2">${ui.card({ title: 'Repair vs replace, every candidate', exp: true, sub: 'NPV of repairing (x) vs replacing (y). Below the diagonal → replace. Bubble = risk $/yr.', body: ui.chart('fleet', 'lg') })}
  ${ui.card({ title: 'Decision register', exp: true, flush: true, body: `<div style="max-height:420px;overflow:auto">${ui.table({ rowId: (x) => x.a.id, rows: rows.sort((p, q) => (q.m.npvA - q.m.npvB) - (p.m.npvA - p.m.npvB)), cols: [{ label: 'Asset', render: (x) => `<b>${esc(x.a.name)}</b><span class="nx-sub">${esc(x.a.line || x.a.sub)}</span>`, sort: (x) => x.a.name }, { label: 'HI', align: 'r', render: (x) => ui.score(x.a.hi), sort: (x) => x.a.hi }, { label: 'Repair NPV', align: 'r', render: (x) => fmt.money(x.m.npvA), sort: (x) => x.m.npvA }, { label: 'Replace NPV', align: 'r', render: (x) => fmt.money(x.m.npvB), sort: (x) => x.m.npvB }, { label: 'Decision', render: (x) => (x.m.npvB < x.m.npvA ? ui.badge('Replace', 'crit') : ui.badge('Repair', 'ok')), sort: (x) => x.m.npvA - x.m.npvB }, { label: 'Δ NPV', align: 'r', render: (x) => `<b>${fmt.money(Math.abs(x.m.npvA - x.m.npvB))}</b>`, sort: (x) => Math.abs(x.m.npvA - x.m.npvB) }] })}</div>` })}</div></div>`;
}
function mountFleet(st, ctx) {
  const rows = candidates.map((a) => ({ a, m: rvModel(a) }));
  const mx = Math.max(...rows.map((x) => Math.max(x.m.npvA, x.m.npvB))) / 1e6;
  ctx.chart('fleet', { grid: ch.grid({ top: 30, bottom: 24 }), legend: { top: 0, right: 0 }, tooltip: { formatter: (p) => (p.data[3] ? `${p.data[3]}<br/>Repair ${fmt.money(p.data[0] * 1e6)} · Replace ${fmt.money(p.data[1] * 1e6)}` : '') }, xAxis: { type: 'log', name: 'Repair NPV $M', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'log', name: 'Replace NPV $M' }, series: [{ type: 'scatter', name: 'Towers', itemStyle: { color: '#3b82f6', opacity: 0.8 }, symbolSize: (d) => 8 + Math.sqrt(d[2] / 2000), data: rows.filter((x) => x.a.kind === 'tower').map((x) => [x.m.npvA / 1e6, x.m.npvB / 1e6, x.a.exposure, `${x.a.name} · ${x.a.line}`, x.a.id]) }, { type: 'scatter', name: 'Transformers', symbol: 'diamond', itemStyle: { color: '#7c3aed', opacity: 0.85 }, symbolSize: (d) => 10 + Math.sqrt(d[2] / 4000), data: rows.filter((x) => x.a.kind === 'tx').map((x) => [x.m.npvA / 1e6, x.m.npvB / 1e6, x.a.exposure, x.a.name, x.a.id]) }, { type: 'line', data: [[0.01, 0.01], [mx * 1.2, mx * 1.2]], showSymbol: false, lineStyle: { type: 'dashed', color: '#94a3b8' }, name: 'Indifference', tooltip: { show: false } }] }, { onClick: (p) => { if (p.data[4]) { rvrAsset = p.data[4]; nav.go('rvr'); } } });
  ctx.on('click', 'tr[data-row]', (e, tr) => { const a = assetById.get(tr.dataset.row); if (a) openAssetCost(a); });
}

/* ======================================================================== 5. Capital Planning */
const benefitPV = (assetsAffected, hiAfter, years = 20, r = 0.07) => { const dY = sum(assetsAffected, (a) => (pFail(a.hi) - pFail(hiAfter)) * consequence(a)); return dY * ((1 - (1 + r) ** -years) / r); };
const poorT = assets.filter((a) => a.kind === 'tower' && a.band === 'poor');
const modT = assets.filter((a) => a.kind === 'tower' && a.band === 'moderate');
const worstTx = [...assets.filter((a) => a.kind === 'tx')].sort((a, b) => (a.hi ?? 100) - (b.hi ?? 100));
const coastal = assets.filter((a) => a.line === 'L-132-01');
const l500 = assets.filter((a) => a.line === 'L-500-01');
const l220 = assets.filter((a) => a.line === 'L-220-03');
const PROJECTS = [
  ...poorT.map((a) => ({ id: `CP-${a.id.replace('TWR-', 'T')}`, name: `Replace ${a.name} (${a.line})`, cat: 'Tower replacement', capex: towerReplace(a.kv), benefit: benefitPV([a], 100) + a.openCost, assets: [a.id], driver: `HI ${a.hi}, ${a.open} open findings` })),
  { id: 'CP-TX-01', name: `Replace ${worstTx[0].name} (${worstTx[0].rating} MVA)`, cat: 'Transformer', capex: txReplace(worstTx[0].rating), benefit: benefitPV([worstTx[0]], 100), assets: [worstTx[0].id], driver: `DGA ${worstTx[0].duval?.label || 'fault gases'}; HI ${worstTx[0].hi}` },
  { id: 'CP-TX-02', name: `Refurbish ${worstTx[1].name}: OLTC overhaul + bushings`, cat: 'Transformer', capex: 640000, benefit: benefitPV([worstTx[1]], Math.min(90, (worstTx[1].hi ?? 70) + 18)), assets: [worstTx[1].id], driver: `HI ${worstTx[1].hi}` },
  { id: 'CP-MON-01', name: 'Online DGA + bushing monitors, 6 transformers', cat: 'Monitoring', capex: 540000, benefit: benefitPV(assets.filter((a) => a.kind === 'tx'), 0) * 0 + sum(assets.filter((a) => a.kind === 'tx'), (a) => a.exposure * 0.22) * 10.6, assets: assets.filter((a) => a.kind === 'tx').map((a) => a.id), driver: 'Earlier detection cuts failure consequence ~22%' },
  { id: 'CP-INS-132', name: 'L-132-01 coastal insulator programme (composite, RTV)', cat: 'Line refurbishment', capex: Math.round(coastal.length * 3 * 410 * 2.6 / 1000) * 1000 + 95000, benefit: benefitPV(coastal.filter((a) => a.band !== 'normal'), 85) + sum(coastal, (a) => a.exposure * 0.12) * 10.6, assets: coastal.map((a) => a.id), driver: 'C4/C5 contamination, flashover marks' },
  { id: 'CP-RCD-220', name: 'L-220-03 reconductoring T-030–T-045 (HTLS, ACCC)', cat: 'Line refurbishment', capex: 4200000, benefit: benefitPV(l220.filter((a) => a.idx >= 30 && a.idx <= 45), 92) + 1850000, assets: l220.filter((a) => a.idx >= 30 && a.idx <= 45).map((a) => a.id), driver: 'Thermal limit at 78–92% loading; sag findings' },
  { id: 'CP-FND-500', name: 'L-500-01 foundation remediation programme', cat: 'Civil', capex: 910000, benefit: benefitPV(l500.filter((a) => a.band !== 'normal'), 88) + sum(l500, (a) => a.exposure * 0.08) * 10.6, assets: l500.map((a) => a.id), driver: 'Erosion and cracked foundations on the inland route' },
  { id: 'CP-OPGW-500', name: 'L-500-01 OPGW retrofit (48-fibre)', cat: 'Line refurbishment', capex: 3100000, benefit: 1400000 + sum(l500, (a) => a.exposure * 0.05) * 10.6, assets: l500.map((a) => a.id), driver: 'Earthwire damage + protection signalling' },
  { id: 'CP-COAT', name: `Corrosion recoat, ${modT.length} moderate-band towers`, cat: 'Line refurbishment', capex: modT.length * 14000, benefit: benefitPV(modT, 82), assets: modT.map((a) => a.id), driver: 'Steel corrosion slowing HI decline' },
  { id: 'CP-BIRD', name: 'Bird diverters & anti-climb, all lines', cat: 'Monitoring', capex: 118000, benefit: 410000, assets: [], driver: 'Bird-nest findings, public safety' },
].map((p) => ({ ...p, bcr: p.benefit / p.capex }));
const CAT_COLOR = { 'Tower replacement': '#ef4444', Transformer: '#7c3aed', Monitoring: '#0ea5e9', 'Line refurbishment': '#2563eb', Civil: '#f59e0b' };
let capCap = 6_500_000;
function portfolio() {
  const sorted = [...PROJECTS].sort((a, b) => b.bcr - a.bcr);
  let c = 0; return sorted.map((p) => { const ok = c + p.capex <= capCap; if (ok) c += p.capex; return { ...p, sel: ok }; });
}
function capPortfolio() {
  return `<div class="nx-page">
  <div class="nx-row nx-c12"><div class="nx-s8">${ui.card({ title: 'Efficient frontier', exp: true, sub: 'Projects in order of estimated risk reduction per $ (benefit/cost). Cumulative capex vs cumulative PV of risk avoided; the budget line marks what is funded.', body: '<div class="nx-chart" data-chart="front" style="height:560px"></div>' })}</div>
  <div class="nx-s4">${ui.card({ title: 'Capital envelope', sub: 'FY2027 capex available for reliability', body: `<div class="fin-slider"><label for="cap">Envelope</label><output id="cap-o">${fmt.money(capCap)}</output><input type="range" id="cap" min="1000000" max="16000000" step="250000" value="${capCap}"/></div><div id="cap-stats"></div><div class="nx-sec" style="margin-top:12px"><h4>Funded capex by category</h4><div class="nx-chart" data-chart="capmix" style="height:230px"></div></div>` })}</div></div>
  ${ui.card({ title: 'Ranked capital projects', exp: true, sub: 'Benefit = present value of avoided risk cost (probability × consequence) over 20 years at 7% real, plus avoided corrective spend', flush: true, body: '<div id="cap-table"></div>' })}</div>`;
}
function mountPortfolio(st, ctx) {
  const draw = () => {
    const pf = portfolio();
    let cx = 0; let cy = 0; const pts = [[0, 0]]; pf.forEach((p) => { cx += p.capex; cy += p.benefit; pts.push([cx / 1e6, cy / 1e6, p.name, p.sel]); });
    const selCap = sum(pf.filter((p) => p.sel), (p) => p.capex); const selBen = sum(pf.filter((p) => p.sel), (p) => p.benefit);
    ctx.chart('front', { grid: ch.grid({ top: 20, bottom: 24 }), tooltip: { trigger: 'item', formatter: (p) => (p.data[2] ? `${p.data[2]}<br/>Cumulative capex ${fmt.money(p.data[0] * 1e6)} · benefit ${fmt.money(p.data[1] * 1e6)}` : '') }, xAxis: { type: 'value', name: 'Cumulative capex $M', nameLocation: 'middle', nameGap: 26 }, yAxis: { type: 'value', name: 'PV risk avoided $M' }, series: [{ type: 'line', data: pts, smooth: false, symbolSize: 9, lineStyle: { color: '#2563eb', width: 2.5 }, areaStyle: { color: 'rgba(37,99,235,.08)' }, itemStyle: { color: (p) => (p.data[3] === false ? '#cbd5e1' : '#2563eb'), borderColor: '#fff', borderWidth: 2 }, markLine: { symbol: 'none', data: [{ xAxis: capCap / 1e6 }], lineStyle: { color: '#16a34a', type: 'dashed', width: 2 }, label: { formatter: `Envelope ${fmt.money(capCap)}`, color: '#16a34a' } } }] });
    st.querySelector('#cap-stats').innerHTML = `<div style="height:8px"></div>${ui.stats([{ label: 'Funded projects', value: `${pf.filter((p) => p.sel).length} / ${pf.length}` }, { label: 'Capex committed', value: fmt.money(selCap) }, { label: 'PV risk avoided', value: fmt.money(selBen), color: '#16a34a' }, { label: 'Portfolio B/C', value: `${fmt.n(selBen / Math.max(1, selCap), 2)}×` }])}<div class="nx-note" style="margin-top:10px">Projects are funded greedily by benefit-to-cost ratio until the envelope is spent — the knapsack optimum for divisible programmes; indivisible projects that do not fit are skipped.</div>`;
    const fpf = pf.filter((p) => p.sel);
    ctx.chart('capmix', { ...ch.donut({ data: Object.keys(CAT_COLOR).map((c) => ({ name: c, value: Math.round(sum(fpf.filter((p) => p.cat === c), (p) => p.capex)), color: CAT_COLOR[c] })).filter((d) => d.value > 0), center: 'funded', value: fmt.money(selCap), radius: ['52%', '76%'] }), tooltip: { trigger: 'item', formatter: (q) => `${q.name}<br/><b>${fmt.money(q.value)}</b> · ${q.percent}%` } });
    st.querySelector('#cap-table').innerHTML = ui.table({ id: 'cap-t', rowId: (p) => p.id, rows: pf, cols: [{ label: '#', render: (p) => `<span class="fin-tag">${pf.indexOf(p) + 1}</span>`, sort: (p) => pf.indexOf(p) }, { label: 'Project', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.id)} · ${esc(p.driver)}</span>`, sort: (p) => p.name, wrap: true }, { label: 'Category', render: (p) => `<span class="nx-badge no-dot" style="background:${CAT_COLOR[p.cat]}1a;color:${CAT_COLOR[p.cat]}">${esc(p.cat)}</span>`, sort: (p) => p.cat }, { label: 'Capex', align: 'r', render: (p) => fmt.money(p.capex), sort: (p) => p.capex }, { label: 'PV benefit', align: 'r', render: (p) => fmt.money(p.benefit), sort: (p) => p.benefit }, { label: 'B/C', align: 'r', render: (p) => `<b style="color:${p.bcr >= 1.5 ? '#16a34a' : p.bcr >= 1 ? '#d97706' : '#dc2626'}">${fmt.n(p.bcr, 2)}×</b>`, sort: (p) => p.bcr }, { label: 'Status', render: (p) => (p.sel ? ui.badge('Funded', 'ok') : ui.badge('Deferred', 'muted')), sort: (p) => (p.sel ? 1 : 0) }] });
  };
  draw();
  ctx.on('input', '#cap', (e, inp) => { capCap = Number(inp.value); st.querySelector('#cap-o').textContent = fmt.money(capCap); draw(); });
  ctx.on('click', '#cap-t tr[data-row]', (e, tr) => openProject(tr.dataset.row));
}
function openProject(id) {
  const pf = portfolio(); const p = pf.find((x) => x.id === id); if (!p) return;
  const rank = pf.indexOf(p) + 1;
  const inScope = p.assets.map((x) => assetById.get(x)).filter(Boolean).sort((x, y) => (x.hi ?? 100) - (y.hi ?? 100));
  const annual = p.benefit / 10.6; // 20 y annuity factor at 7%
  const yrs = Array.from({ length: 21 }, (_, i) => i);
  const cumBen = yrs.map((y) => Math.round(annual * ((1 - 1.07 ** -y) / 0.07)));
  const payback = yrs.find((y) => cumBen[y] >= p.capex);
  drawer.open({
    icon: 'building', kicker: `Capital project · ${p.id} · rank ${rank} of ${pf.length}`, title: p.name, sub: esc(p.driver),
    badges: [[p.sel ? 'Funded in envelope' : 'Deferred — outside envelope', p.sel ? 'ok' : 'muted'], [p.cat, 'accent'], [`B/C ${fmt.n(p.bcr, 2)}×`, p.bcr >= 1 ? 'ok' : 'crit'], [payback != null ? `Payback ${payback} y` : 'No payback in 20 y', payback != null && payback <= 8 ? 'ok' : 'warn'], ['Experimental', 'warn']],
    tabs: [
      {
        name: 'Economics',
        body: `${ui.stats([{ label: 'Capex', value: fmt.money(p.capex) }, { label: 'PV risk avoided', value: fmt.money(p.benefit), color: '#16a34a' }, { label: 'Benefit / cost', value: `${fmt.n(p.bcr, 2)}×` }, { label: 'Avoided loss / yr', value: fmt.money(annual) }, { label: 'Discounted payback', value: payback != null ? `${payback} y` : '> 20 y' }])}
        <div class="nx-sec"><h4>Cumulative discounted benefit vs capex</h4><div class="nx-chart" data-chart="pj-pb" style="height:250px"></div></div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Basis</h4>${ui.kv([['Category', esc(p.cat)], ['Assets in scope', p.assets.length || 'network-wide'], ['Evaluation', '20 years · 7% real'], ['Risk model', 'p(fail | HI) × consequence']])}</div><div class="nx-sec"><h4>Portfolio position</h4>${ui.kv([['Rank by B/C', `${rank} / ${pf.length}`], ['Envelope', fmt.money(capCap)], ['Status', p.sel ? 'Funded FY2027' : 'Candidate FY2028+'], ['Business case', 'Capital Planning › Business case']])}</div></div>`,
        mount: (b, ctx) => ctx.chart('pj-pb', { ...ch.line({ x: yrs.map((y) => `Y${y}`), series: [{ name: 'Cumulative PV benefit', data: cumBen, color: '#16a34a', area: true, smooth: true }, { name: 'Capex', data: yrs.map(() => p.capex), color: '#dc2626', dash: true }] }), yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.money(v) } }),
      },
      {
        name: `Assets in scope (${inScope.length})`,
        body: inScope.length ? `<div class="nx-sec"><h4>Health and risk of the assets this project addresses</h4><div class="nx-chart" data-chart="pj-hi" style="height:${Math.min(320, 60 + Math.min(inScope.length, 12) * 22)}px"></div></div>${ui.table({ id: 'pj-at', rowId: (x) => x.id, rows: inScope.slice(0, 40), cols: [{ label: 'Asset', render: (x) => `<b>${esc(x.name)}</b><span class="nx-sub">${esc(x.line || x.sub || '')}</span>`, sort: (x) => x.name }, { label: 'HI', align: 'r', render: (x) => ui.score(x.hi), sort: (x) => x.hi }, { label: 'Risk $/yr', align: 'r', render: (x) => fmt.money(x.exposure), sort: (x) => x.exposure }, { label: 'Lifetime cost', align: 'r', render: (x) => fmt.money(x.lifetime), sort: (x) => x.lifetime }] })}${inScope.length <= 3 ? inScope.map((x) => `<div class="nx-sec"><h4>${esc(x.name)} · cost and condition</h4><div class="nx-drawer-grid">${ui.kv([['Health index', ui.score(x.hi)], ['Open findings', x.open ?? 0], ['P(failure) / yr', fmt.pct(pFail(x.hi) * 100, 2)], ['Consequence', fmt.money(consequence(x))]])}${ui.kv([['Lifetime maintenance', fmt.money(x.lifetime)], ['FY2026 spend', fmt.money(x.fy)], ['Open backlog', x.openCost ? fmt.money(x.openCost) : '—'], ['Replacement', fmt.money(x.replace)]])}</div><div class="nx-chart" data-chart="pj-h-${esc(x.id)}" style="height:170px;margin-top:8px"></div></div>`).join('') : ''}` : `<div class="nx-sec">${ui.empty('Network-wide programme — no single asset list.')}</div>`,
        mount: (b, ctx) => {
          if (!inScope.length) return;
          const top = inScope.slice(0, 12);
          ctx.chart('pj-hi', { ...ch.bar({ x: top.map((x) => x.name), horizontal: true, legend: false, series: [{ name: 'Risk $/yr', data: top.map((x) => ({ value: Math.round(x.exposure), itemStyle: { color: healthColor(x.hi), borderRadius: [0, 4, 4, 0] } })) }], grid: { top: 6, right: 20 } }), xAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v), fontSize: 9.5 } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (q) => { const x = top[q[0].dataIndex]; return `<b>${esc(x.name)}</b> · HI ${x.hi}<br/>Expected loss ${fmt.money(x.exposure)}/yr` } } });
          ctx.on('click', '#pj-at tr[data-row]', (e, tr) => { const x = assetById.get(tr.dataset.row); if (x) openAssetCost(x); });
          if (inScope.length <= 3) for (const x of inScope) ctx.chart(`[data-chart="pj-h-${x.id}"]`, { ...ch.bar({ x: ['2021', '2022', '2023', '2024', '2025', '2026'], legend: false, series: [{ name: 'Maintenance cost', data: x.history, color: '#2563eb' }], grid: { top: 10 } }), yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt.money(v) } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.money(v) } });
        },
      },
    ],
    actions: [{ label: p.sel ? 'Add to FY2027 submission' : 'Request envelope increase', icon: 'doc', primary: true, onClick: () => toast(`${p.id} ${p.sel ? 'added to the FY2027 capital submission' : 'flagged for envelope review'}`) }],
  });
}
function capPlan() {
  return `<div class="nx-page">${ui.card({ title: 'Five-year capital replacement plan, 2027–2031', exp: true, sub: 'Projects scheduled by rank under an annual envelope; large projects are phased over two years', body: ui.chart('plan5', 'lg') })}
  <div class="nx-row nx-c2">${ui.card({ title: 'Network risk exposure, with and without the plan', exp: true, sub: 'Expected annual loss from asset failure ($M/yr). Do-nothing assumes current deterioration.', body: ui.chart('risktraj', 'md') })}${ui.card({ title: 'Capex by category', exp: true, body: ui.chart('capcat', 'md') })}</div></div>`;
}
function schedule() {
  const env = Math.max(2_500_000, capCap * 0.5); const years = [2027, 2028, 2029, 2030, 2031]; const left = years.map(() => env); const out = [];
  for (const p of [...PROJECTS].sort((a, b) => b.bcr - a.bcr)) {
    const split = p.capex > env * 0.5 ? 2 : 1; const part = p.capex / split;
    let yi = left.findIndex((v, i) => v >= part && (split === 1 || (left[i + 1] ?? 0) >= part));
    if (yi < 0) yi = left.indexOf(Math.max(...left));
    for (let k = 0; k < split; k += 1) { const y = Math.min(4, yi + k); left[y] -= part; out.push({ p, year: years[y], amount: part }); }
  }
  return { years, out };
}
function mountPlan(st, ctx) {
  const { years, out } = schedule();
  const cats = Object.keys(CAT_COLOR);
  ctx.chart('plan5', ch.bar({ x: years.map(String), stack: true, yName: '$M', series: cats.map((c) => ({ name: c, color: CAT_COLOR[c], data: years.map((y) => +(sum(out.filter((o) => o.year === y && o.p.cat === c), (o) => o.amount) / 1e6).toFixed(2)) })), tooltip: { valueFormatter: (v) => `$${v}M` } }));
  const base = sum(assets, (a) => a.exposure);
  const done2 = new Set(); const withPlan = [base]; const dn = [base];
  years.forEach((y, i) => { out.filter((o) => o.year === y).forEach((o) => done2.add(o.p.id)); const red = sum(PROJECTS.filter((p) => done2.has(p.id)), (p) => p.benefit / 10.6); dn.push(base * 1.07 ** (i + 1)); withPlan.push(Math.max(base * 0.25, base * 1.07 ** (i + 1) - red)); });
  ctx.chart('risktraj', ch.line({ x: ['2026', ...years.map(String)], yName: '$M/yr', series: [{ name: 'Do nothing', data: dn.map((v) => +(v / 1e6).toFixed(2)), color: '#ef4444', dash: true }, { name: 'With capital plan', data: withPlan.map((v) => +(v / 1e6).toFixed(2)), color: '#16a34a', area: true }] }));
  ctx.chart('capcat', { ...ch.donut({ data: cats.map((c) => ({ name: c, value: Math.round(sum(out.filter((o) => o.p.cat === c), (o) => o.amount)), color: CAT_COLOR[c] })), center: '5-year capex', value: fmt.money(sum(out, (o) => o.amount)) }), tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/><b>${fmt.money(p.value)}</b> (${p.percent}%)` } });
}
function mountCase(st, ctx) { ctx.on('click', '.nx-li[data-row]', (e, li) => openProject(li.dataset.row)); }
function capCase() {
  const pf = portfolio().filter((p) => p.sel);
  const cap = sum(pf, (p) => p.capex); const ben = sum(pf, (p) => p.benefit); const base = sum(assets, (a) => a.exposure);
  const ens = sum(pf, (p) => p.benefit) / 10.6 / VOLL;
  return `<div class="nx-page">${ui.kpis([
    { label: 'Programme capex', exp: true, value: fmt.money(cap), icon: 'building', sub: `${pf.length} projects, FY2027 envelope` },
    { label: 'PV of risk avoided', exp: true, value: fmt.money(ben), icon: 'shield', tone: 'ok', sub: '20 y, 7% real' },
    { label: 'Benefit / cost', exp: true, value: `${fmt.n(ben / Math.max(1, cap), 2)}×`, icon: 'scale', tone: 'ok', sub: 'regulatory threshold 1.0×' },
    { label: 'Energy not supplied avoided', exp: true, value: fmt.n(ens, 0), unit: 'MWh/yr', icon: 'zap', tone: 'info', sub: `at VoLL ${fmt.money(VOLL)}/MWh` },
  ])}
  <div class="nx-row nx-c12"><div class="nx-s8">${ui.card({ title: 'Business case summary — FY2027 reliability capex', exp: true, sub: 'Generated from the asset register, health indices and the ranked portfolio', body: `<div class="fin-case">
    <h4>Need</h4><p>Of ${net.towers.length} structures on ${net.lines.length} transmission lines, <b>${poorT.length}</b> are in the poor health band and <b>${modT.length}</b> in the moderate band. ${esc(worstTx[0].name)} shows ${esc(worstTx[0].duval?.label || 'elevated fault gases')} in dissolved-gas analysis (HI ${worstTx[0].hi}). The expected annual loss from asset failure across the network is estimated at <b>${fmt.money(base)}</b> per year (risk model), with an assumed rise of ~7% a year at current deterioration.</p>
    <h4>Options considered</h4><p>(1) Do nothing beyond corrective repair; (2) repair on condition; (3) the ranked replacement and refurbishment portfolio. Repair-versus-replace was modelled asset by asset on 20–25-year life-cycle cost including the priced risk of failure (Repair vs Replace screen).</p>
    <h4>Recommendation</h4><p>Fund the ${pf.length} highest benefit-to-cost projects within the ${fmt.money(capCap)} envelope: ${pf.slice(0, 4).map((p) => esc(p.name)).join('; ')}${pf.length > 4 ? '; and others listed on the Portfolio tab' : ''}. Capex <b>${fmt.money(cap)}</b> is estimated to avoid <b>${fmt.money(ben)}</b> of risk cost in present value — a benefit-to-cost ratio of <b>${fmt.n(ben / Math.max(1, cap), 2)}</b> — and is expected to reduce FY2027–2031 corrective opex as shown on Budget Planning.</p>
    <h4>Assumptions</h4><p>Failure probability from health index p = 0.004 + 0.18·e<sup>−HI/18</sup>; consequence = load at risk × restoration time × VoLL × un-transferable share + emergency works; tower replacement $185k/$310k/$640k at 132/220/500 kV; transformer $14.5k/MVA + $520k installation; real discount rate 7%. These are planning assumptions.</p></div>` })}</div>
  <div class="nx-s4">${ui.card({ title: 'Funded projects', exp: true, sub: 'Click a project for its economics', flush: true, body: `<div class="nx-list" style="padding:0 16px">${pf.map((p) => ui.li({ row: p.id, ic: p.cat === 'Transformer' ? 'transformer' : p.cat === 'Monitoring' ? 'radar' : p.cat === 'Civil' ? 'building' : 'tower', color: CAT_COLOR[p.cat], title: p.name, sub: `${fmt.money(p.capex)} · B/C ${fmt.n(p.bcr, 2)}×`, end: '' })).join('')}</div>` })}</div></div></div>`;
}

/* ======================================================================== 6. Cost Flow (live HMI) */
const FLOW_ASSETS = [];
function flowTags() {
  for (const l of net.lines) {
    const p = pFail(l.hi);
    live.define(`FIN.${l.id}.VAL`, { fn: () => Math.max(0, live.get(`${l.id}.MW`)) * TARIFF, dec: 0, unit: '$/h', desc: `${l.id} energy value delivered` });
    live.define(`FIN.${l.id}.VAR`, { fn: () => (p * Math.max(0, live.get(`${l.id}.MW`)) * 36 * VOLL * 0.08) / 8760 + (p * towerReplace(l.kv) * 0.35 * l.towers.length * 0.05) / 8760, dec: 1, unit: '$/h', h: 60, desc: `${l.id} risk-weighted expected loss` });
    FLOW_ASSETS.push(l.id);
  }
  for (const t of TXS) {
    const p = pFail(t.hi);
    live.define(`FIN.${t.id}.VAL`, { fn: () => Math.max(0, live.get(`${t.id}.MVA`)) * 0.95 * TARIFF * 0.35, dec: 0, unit: '$/h', desc: `${t.id} transformation value` });
    live.define(`FIN.${t.id}.VAR`, { fn: () => (p * (Math.max(0, live.get(`${t.id}.MVA`)) * 720 * VOLL * 0.04 + txReplace(t.rating) * 0.6)) / 8760, dec: 1, unit: '$/h', h: 65, hh: 130, desc: `${t.id} risk-weighted expected loss` });
  }
  live.define('FIN.TOT.VAL', { fn: () => sum(net.lines, (l) => live.get(`FIN.${l.id}.VAL`)), dec: 0, unit: '$/h', desc: 'Network energy value delivered' });
  live.define('FIN.TOT.VAR', { fn: () => sum(net.lines, (l) => live.get(`FIN.${l.id}.VAR`)) + sum(TXS, (t) => live.get(`FIN.${t.id}.VAR`)), dec: 1, unit: '$/h', desc: 'Network risk-weighted expected loss' });
  live.define('FIN.TOT.YR', { fn: () => (live.get('FIN.TOT.VAR') * 8760) / 1e6, dec: 2, unit: '$M/yr', desc: 'Annualised risk exposure' });
  live.define('FIN.TOT.MW', { fn: () => sum(net.lines, (l) => Math.max(0, live.get(`${l.id}.MW`))), dec: 0, unit: 'MW', desc: 'Total transmitted' });
}
flowTags();
function costFlowSvg() {
  const W = 1520; const H = 880; let s = '';
  const s1 = net.substations.find((x) => x.id === 'SUB-S1'); const s2 = net.substations.find((x) => x.id === 'SUB-S2');
  const tx1 = TXS.filter((t) => t.sub === 'SUB-S1').slice(0, 3); const tx2 = TXS.filter((t) => t.sub === 'SUB-S2').slice(0, 3);
  const busU = (x, y, tag) => `${sx.text(x - 92, y - 10, 'U', { cls: 'sx-ts' })}<text x="${x - 30}" y="${y - 10}" class="sx-v" text-anchor="end" data-live="${tag}">—</text>${sx.text(x - 26, y - 10, 'kV', { cls: 'sx-ts' })}`;
  // S-1
  s += sx.text(180, 150, `${s1.name.toUpperCase()} · 220/132 kV`, { cls: 'sx-tb', size: 13 });
  s += sx.bus(180, 720, 200, { kv: 220, net: 'B1H', label: '220 kV BUSBAR', sub: 'BB-220 · S-1' }) + busU(620, 200, 'SUB-S1.BUS220');
  s += sx.bus(180, 720, 560, { kv: 132, net: 'B1L', label: '132 kV BUSBAR', sub: 'BB-132 · S-1' }) + busU(620, 560, 'SUB-S1.BUS132');
  const txCol = (t, x, top, bot, kvH, kvL, netH, netL) => {
    const nid = `N-${t.id}`;
    let o = sx.wire([[x, top], [x, top + 46]], { kv: kvH, net: netH });
    o += sx.cb(x, top + 60, `Q0-${t.id}-HV`, { kv: kvH, net: nid, label: 'Q0' });
    o += sx.wire([[x, top + 74], [x, top + 136]], { kv: kvH, net: nid, flow: `${t.id}.MVA` });
    o += sx.xfmr(x, top + 170, t.id, { kv1: kvH, kv2: kvL, label: t.name, net1: nid, net2: nid });
    o += sx.wire([[x, top + 204], [x, bot - 74]], { kv: kvL, net: nid, flow: `${t.id}.MVA` });
    o += sx.cb(x, bot - 60, `Q0-${t.id}-LV`, { kv: kvL, net: nid, label: 'Q0' });
    o += sx.wire([[x, bot - 46], [x, bot]], { kv: kvL, net: netL });
    o += sx.readout(x + 12, top + 214, [['MVA', `${t.id}.MVA`, ''], ['Value', `FIN.${t.id}.VAL`, '$/h'], ['Risk', `FIN.${t.id}.VAR`, '$/h']], { w: 116, id: `RO-${t.id}`, accent: riskColor(assetById.get(t.id).exposure / 400000) });
    return o;
  };
  tx1.forEach((t, i) => { s += txCol(t, 250 + i * 140, 200, 560, 220, 132, 'B1H', 'B1L'); });
  // L-132-01 exits S-1 132 kV bus downwards
  s += sx.wire([[660, 560], [660, 596]], { kv: 132, net: 'B1L' });
  s += sx.cb(660, 610, 'Q0-L132', { kv: 132, net: 'L132', label: 'Q0' });
  s += sx.lineExit(660, 624, { kv: 132, net: 'L132', dir: 1, label: 'L-132-01', sub: 'Coastal corridor', flow: 'L-132-01.MW', id: 'L-132-01' });
  s += sx.readout(730, 600, [['P', 'L-132-01.MW', 'MW'], ['Load', 'L-132-01.LOAD', '%'], ['Value', 'FIN.L-132-01.VAL', '$/h'], ['Risk', 'FIN.L-132-01.VAR', '$/h']], { w: 150, title: 'L-132-01 · COASTAL', id: 'RO-L-132-01', accent: '#14b8a6' });
  // L-220-03 S-1 220 kV bus → S-2 220 kV bus
  s += sx.wire([[690, 200], [690, 164]], { kv: 220, net: 'B1H' });
  s += sx.cb(690, 150, 'Q0-L220-S1', { kv: 220, net: 'L220', label: 'Q0' });
  s += sx.wire([[690, 136], [690, 96], [900, 96], [900, 470], [960, 470], [960, 664]], { kv: 220, net: 'L220', flow: 'L-220-03.MW' });
  s += sx.cb(960, 678, 'Q0-L220-S2', { kv: 220, net: 'L220', label: 'Q0' });
  s += sx.wire([[960, 692], [960, 720]], { kv: 220, net: 'L220' });
  s += sx.readout(730, 230, [['P', 'L-220-03.MW', 'MW'], ['Load', 'L-220-03.LOAD', '%'], ['Cond. temp', 'L-220-03.TC', '°C'], ['Value', 'FIN.L-220-03.VAL', '$/h'], ['Risk', 'FIN.L-220-03.VAR', '$/h']], { w: 158, title: 'L-220-03 · NORTH', id: 'RO-L-220-03', accent: '#3b82f6' });
  s += sx.text(910, 330, 'L-220-03', { cls: 'sx-tb' }) + sx.text(910, 344, `${lineById.get('L-220-03').lengthKm} km`, { cls: 'sx-ts' }) + sx.text(910, 356, `${lineById.get('L-220-03').towers.length} towers`, { cls: 'sx-ts' });
  // S-2
  s += sx.text(1000, 150, `${s2.name.toUpperCase()} · 500/220 kV`, { cls: 'sx-tb', size: 13 });
  s += sx.bus(1000, 1460, 200, { kv: 500, net: 'B2H', label: '500 kV BUSBAR', sub: 'BB-500 · S-2' }) + busU(1340, 200, 'SUB-S2.BUS500');
  s += sx.bus(870, 1460, 720, { kv: 220, net: 'B2L', label: '220 kV BUSBAR', sub: 'BB-220 · S-2' }) + busU(1400, 720, 'SUB-S2.BUS220');
  tx2.forEach((t, i) => { s += txCol(t, 1060 + i * 140, 200, 720, 500, 220, 'B2H', 'B2L'); });
  // L-500-01 exits S-2 500 kV bus upwards
  s += sx.wire([[1420, 200], [1420, 164]], { kv: 500, net: 'B2H' });
  s += sx.cb(1420, 150, 'Q0-L500', { kv: 500, net: 'L500', label: 'Q0' });
  s += sx.lineExit(1420, 136, { kv: 500, net: 'L500', dir: -1, label: 'L-500-01', sub: 'Inland corridor', id: 'L-500-01', flow: 'L-500-01.MW' });
  s += sx.readout(1190, 28, [['P', 'L-500-01.MW', 'MW'], ['Value', 'FIN.L-500-01.VAL', '$/h'], ['Risk', 'FIN.L-500-01.VAR', '$/h']], { w: 130, title: 'L-500-01 · INLAND', id: 'RO-L-500-01', accent: '#a855f7' });
  // network totals
  s += sx.readout(180, 650, [['Transmitted', 'FIN.TOT.MW', 'MW'], ['Value delivered', 'FIN.TOT.VAL', '$/h'], ['Expected loss (risk)', 'FIN.TOT.VAR', '$/h'], ['Annualised exposure', 'FIN.TOT.YR', '$M']], { w: 250, title: 'NETWORK VALUE FLOW', id: 'RO-TOT', accent: '#67e8f9' });
  s += sx.text(180, 760, `Tariff ${fmt.money(TARIFF)}/MWh · VoLL ${fmt.money(VOLL)}/MWh`, { cls: 'sx-ts' }) + sx.text(180, 774, 'estimate: expected loss = P(fail | HI) × load at risk × restoration × VoLL ÷ 8,760', { cls: 'sx-ts' }) + sx.text(180, 788, 'Opening a breaker removes the value flow and its risk.', { cls: 'sx-ts' });
  s += sx.frame(W, H, { title: 'NETWORK VALUE FLOW · FINANCIAL OVERLAY', dno: 'NX-FIN-SLD-0700', rev: 'B' });
  return { s, W, H, tx1, tx2 };
}
function flowEquipment(tx1, tx2) {
  const eq = {};
  for (const l of net.lines) {
    const a = l;
    const e = { name: `${l.name}`, type: 'Overhead line · value flow', desc: `${l.lengthKm} km · ${l.towers.length} structures · HI ${a.hi} · P(fail) ${fmt.pct(pFail(a.hi) * 100, 2)}/yr`, tags: [{ tag: `FIN.${l.id}.VAR`, label: 'Expected loss' }, { tag: `FIN.${l.id}.VAL`, label: 'Value delivered' }, { tag: `${l.id}.MW`, label: 'Active power' }, { tag: `${l.id}.LOAD`, label: 'Loading' }] };
    eq[l.id] = e; eq[`RO-${l.id}`] = e;
  }
  for (const t of [...tx1, ...tx2]) {
    const a = assetById.get(t.id);
    const e = { name: `${t.name} · ${t.rating} MVA ${t.ratio} kV`, type: 'Power transformer · value flow', desc: `HI ${t.hi} · P(fail) ${fmt.pct(pFail(t.hi) * 100, 2)}/yr · lifetime maintenance ${fmt.money(a.lifetime)}`, tags: [{ tag: `FIN.${t.id}.VAR`, label: 'Expected loss' }, { tag: `${t.id}.MVA`, label: 'Load' }, { tag: `FIN.${t.id}.VAL`, label: 'Value' }, { tag: `${t.id}.HST`, label: 'Winding hot-spot' }] };
    eq[t.id] = e; eq[`RO-${t.id}`] = e;
    for (const side of ['HV', 'LV']) eq[`Q0-${t.id}-${side}`] = { name: `${t.name} ${side} circuit-breaker`, type: 'SF₆ circuit-breaker', switch: true, interlock: 'Q1/Q2 position', tags: [{ tag: `${t.id}.MVA`, label: 'Load through' }, { tag: `FIN.${t.id}.VAL`, label: 'Value at stake' }] };
  }
  eq['Q0-L132'] = { name: 'L-132-01 line breaker (S-1)', type: 'SF₆ circuit-breaker', switch: true, interlock: 'Q9/Q8', tags: [{ tag: 'L-132-01.MW', label: 'Active power' }, { tag: 'FIN.L-132-01.VAL', label: 'Value at stake' }] };
  eq['Q0-L220-S1'] = { name: 'L-220-03 line breaker (S-1 end)', type: 'SF₆ circuit-breaker', switch: true, interlock: 'Q9/Q8', tags: [{ tag: 'L-220-03.MW', label: 'Active power' }, { tag: 'FIN.L-220-03.VAL', label: 'Value at stake' }] };
  eq['Q0-L220-S2'] = { name: 'L-220-03 line breaker (S-2 end)', type: 'SF₆ circuit-breaker', switch: true, interlock: 'Q9/Q8', tags: [{ tag: 'L-220-03.MW', label: 'Active power' }, { tag: 'FIN.L-220-03.VAL', label: 'Value at stake' }] };
  eq['Q0-L500'] = { name: 'L-500-01 line breaker (S-2)', type: 'SF₆ circuit-breaker', switch: true, interlock: 'Q9/Q8', tags: [{ tag: 'L-500-01.MW', label: 'Active power' }, { tag: 'FIN.L-500-01.VAL', label: 'Value at stake' }] };
  eq['RO-TOT'] = { name: 'Network value flow', type: 'Financial overlay', desc: 'Sum of all lines and transformers on this display', tags: [{ tag: 'FIN.TOT.VAR', label: 'Expected loss' }, { tag: 'FIN.TOT.VAL', label: 'Value delivered' }, { tag: 'FIN.TOT.MW', label: 'Transmitted' }, { tag: 'FIN.TOT.YR', label: 'Annualised exposure' }] };
  return eq;
}
function mountFlow(st, ctx) {
  const { s, W, H, tx1, tx2 } = costFlowSvg();
  const nets = {
    L132: { requires: ['Q0-L132'], parent: 'B1L', tags: ['L-132-01.MW', 'L-132-01.MVAR'] },
    L220: { requires: ['Q0-L220-S1', 'Q0-L220-S2'], parent: 'B1H', tags: ['L-220-03.MW', 'L-220-03.MVAR'] },
    L500: { requires: ['Q0-L500'], parent: 'B2H', tags: ['L-500-01.MW', 'L-500-01.MVAR'] },
  };
  for (const t of [...tx1, ...tx2]) nets[`N-${t.id}`] = { requires: [`Q0-${t.id}-HV`, `Q0-${t.id}-LV`], tags: [`${t.id}.MVA`] };
  const forced = Object.values(nets).flatMap((n) => n.tags);
  ctx.cleanup(() => forced.forEach((t) => live.force(t, null)));
  ctx.hmi('#fin-hmi', {
    title: 'Network value flow — S-1 / S-2', dno: 'NX-FIN-SLD-0700', rev: 'B', w: W, h: H, svg: s, equipment: flowEquipment(tx1, tx2), nets,
    legend: [{ label: '500 kV', color: '#a855f7' }, { label: '220 kV', color: '#3b82f6' }, { label: '132 kV', color: '#14b8a6' }, { label: 'De-energised', color: '#3a4658' }],
    toolbar: `<span style="color:#8fa1ba;font-size:11.5px">Risk exposure <b style="color:#fca5a5;font-family:var(--nx-mono)" data-live="FIN.TOT.VAR">—</b> $/h · <b style="color:#67e8f9;font-family:var(--nx-mono)" data-live="FIN.TOT.YR">—</b> $M/yr</span>`,
    alarmFilter: (tag) => tag.startsWith('FIN.') || /\.POS$/.test(tag),
    onSwitch: (id, state) => toast(`${id} ${state === 'closed' ? 'closed' : 'opened'} — value flow ${state === 'closed' ? 'restored' : 'interrupted'} (simulation)`, state === 'closed' ? 'ok' : 'warn'),
  });
}
function flowLedger() {
  const rows = [...net.lines.map((l) => ({ id: l.id, name: l.name, kind: 'Line', hi: l.hi })), ...TXS.map((t) => ({ id: t.id, name: `${t.name} · ${t.rating} MVA`, kind: 'Transformer', hi: t.hi }))];
  return `<div class="nx-page">${ui.kpis([
    { label: 'Transmitted now', live: 'FIN.TOT.MW', unit: 'MW', icon: 'zap', tone: 'info', sub: 'sum of line flows' },
    { label: 'Energy value delivered', live: 'FIN.TOT.VAL', unit: '$/h', icon: 'dollar', tone: 'ok', sub: `at ${fmt.money(TARIFF)}/MWh` },
    { label: 'Risk-weighted expected loss', exp: true, live: 'FIN.TOT.VAR', unit: '$/h', icon: 'alert', tone: 'crit', sub: 'probability × consequence' },
    { label: 'Annualised exposure', exp: true, live: 'FIN.TOT.YR', unit: '$M/yr', icon: 'forecast', tone: 'warn', sub: 'if conditions persist' },
  ])}
  <div class="nx-row nx-c2">${ui.card({ title: 'Live value and risk by asset', exp: true, sub: 'Updates every second from the SCADA/EMS historian feed', body: ui.chart('vbar', 'lg') })}${ui.card({ title: 'Network risk exposure, last 3 minutes', exp: true, sub: 'Expected loss rate, $/h', body: ui.chart('vtrend', 'lg') })}</div>
  ${ui.card({ title: 'Value ledger', sub: 'Click an asset for its live value and risk trace. P(fail) and expected loss are estimates; load is the live feed.', flush: true, body: ui.table({ id: 'fin-led', rowId: (r) => r.id, rows, cols: [{ label: 'Asset', render: (r) => `<b>${esc(r.name)}</b><span class="nx-sub">${r.kind}</span>`, sort: (r) => r.name }, { label: 'HI', align: 'r', render: (r) => ui.score(r.hi), sort: (r) => r.hi }, { label: 'P(fail)/yr', align: 'r', render: (r) => fmt.pct(pFail(r.hi) * 100, 2), sort: (r) => pFail(r.hi) }, { label: 'Load', align: 'r', render: (r) => `<span class="nx-num" data-live="${r.kind === 'Line' ? `${r.id}.MW` : `${r.id}.MVA`}">—</span> ${r.kind === 'Line' ? 'MW' : 'MVA'}`, sort: false }, { label: 'Value $/h', align: 'r', render: (r) => `<b class="nx-num" data-live="FIN.${r.id}.VAL">—</b>`, sort: false }, { label: 'Expected loss $/h', align: 'r', render: (r) => `<b class="nx-num" style="color:#dc2626" data-live="FIN.${r.id}.VAR">—</b>`, sort: false }] }) })}</div>`;
}
function mountLedger(st, ctx) {
  const ids = [...net.lines.map((l) => l.id), ...TXS.map((t) => t.id)];
  const draw = () => ctx.chart('vbar', ch.bar({ x: ids, horizontal: true, series: [{ name: 'Expected loss $/h', data: ids.map((i) => +live.get(`FIN.${i}.VAR`).toFixed(1)), color: '#ef4444' }], legend: false, tooltip: { valueFormatter: (v) => `$${v}/h` } }));
  const tr = () => ctx.chart('vtrend', ch.line({ x: live.hist('FIN.TOT.VAR').map((_, i) => i), yName: '$/h', legend: false, series: [{ name: 'Expected loss', data: live.hist('FIN.TOT.VAR').map((v) => +v.toFixed(1)), color: '#ef4444', area: true }] }));
  draw(); tr();
  ctx.every(3000, () => { draw(); tr(); });
  ctx.on('click', '#fin-led tr[data-row]', (e, row) => openFlowAsset(row.dataset.row));
}
function openFlowAsset(id) {
  const line = lineById.get(id); const tx = TXS.find((t) => t.id === id);
  const loadTag = line ? `${id}.MW` : `${id}.MVA`; const hi = line ? line.hi : tx?.hi;
  drawer.open({
    icon: line ? 'line' : 'transformer', kicker: `Live value ledger · ${line ? 'transmission line' : 'power transformer'}`, title: line ? line.name : `${tx.name} · ${tx.rating} MVA`, sub: line ? `${line.lengthKm} km · ${line.towers.length} towers · ${line.kv} kV` : `${esc(tx.ratio)} kV · ${esc(tx.sub)}`,
    badges: [[`HI ${hi ?? '—'}`, (hi ?? 100) < 40 ? 'crit' : (hi ?? 100) < 70 ? 'warn' : 'ok'], [`P(fail) ${fmt.pct(pFail(hi) * 100, 2)}/yr`, 'info'], ['Live · 1 s', 'ok']],
    body: `${ui.stats([{ label: line ? 'Active power MW' : 'Load MVA', value: '—', live: loadTag }, { label: 'Value $/h', value: '—', live: `FIN.${id}.VAL` }, { label: 'Expected loss $/h', value: '—', live: `FIN.${id}.VAR`, color: '#dc2626' }])}
    <div class="nx-sec"><h4>Value delivered and expected loss, last 3 minutes</h4><div class="nx-chart" data-chart="fl-tr" style="height:260px"></div></div>
    <div class="nx-drawer-grid"><div class="nx-sec"><h4>How the value is priced</h4>${ui.kv([['Tariff', `${fmt.money(TARIFF)}/MWh`], ['VoLL', `${fmt.money(VOLL)}/MWh`], [line ? 'Restoration' : 'Restoration', line ? '36 h' : '720 h'], ['Un-transferable share', line ? '8%' : '4%']])}</div><div class="nx-sec"><h4>Annualised</h4>${ui.kv([['Value delivered', `${fmt.money(live.get(`FIN.${id}.VAL`) * 8760)}/yr`], ['Risk exposure', `${fmt.money(live.get(`FIN.${id}.VAR`) * 8760)}/yr ${ui.exp()}`], ['Risk / value', fmt.pct((live.get(`FIN.${id}.VAR`) / Math.max(1, live.get(`FIN.${id}.VAL`))) * 100, 2)]])}</div></div>`,
    mount: (b, ctx) => {
      const draw = () => { const v = live.hist(`FIN.${id}.VAL`); const r = live.hist(`FIN.${id}.VAR`); ctx.chart('fl-tr', { grid: ch.grid({ top: 34 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', valueFormatter: (x) => `$${fmt.n(x, 1)}/h` }, xAxis: { type: 'category', data: v.map((_, i) => `${v.length - i}s`), boundaryGap: false }, yAxis: [{ type: 'value', name: 'Value $/h', scale: true }, { type: 'value', name: 'Loss $/h', scale: true, splitLine: { show: false } }], series: [{ type: 'line', name: 'Value delivered', data: v.map((x) => +x.toFixed(0)), showSymbol: false, lineStyle: { color: '#16a34a' }, itemStyle: { color: '#16a34a' }, areaStyle: { color: 'rgba(22,163,74,.08)' } }, { type: 'line', name: 'Expected loss', yAxisIndex: 1, data: r.map((x) => +x.toFixed(2)), showSymbol: false, lineStyle: { color: '#dc2626' }, itemStyle: { color: '#dc2626' } }] }); };
      draw(); ctx.every(2000, draw);
    },
    actions: [{ label: line ? 'Open single-line' : 'Open single-line', icon: 'schematic', primary: true, onClick: (close) => { close(); nav.go('flow', 0); } }],
  });
}

/* ======================================================================== app */
const t = (name, render, mount, extra = {}) => ({ name, render, mount, ...extra });
const screens = [
  { id: 'cost', name: 'Maintenance Cost Dashboard', icon: 'dashboard', note: `FY${YEAR} · USD · as of ${fmt.date(AS_OF)}`, tabs: [t('Overview', dashOverview, mountOverview), t('Repair plan costing', dashCosting, mountCosting), t('Cost variance', dashVariance, mountVariance)] },
  { id: 'budget', name: 'Budget Planning', icon: 'wallet', tabs: [t('FY2027 request', budgetAnnual, mountAnnual, { }), t('Backlog funding', budgetBacklog, mountBacklog), t('Phasing', budgetPhasing, mountPhasing)] },
  { id: 'asset', name: 'Cost per Asset', icon: 'map', tabs: [t('Cost map', cpaMap, mountCpaMap, { full: true, }), t('Cost register', cpaRanking, mountRanking), t('Unit costs', cpaUnit, mountUnit)] },
  { id: 'rvr', name: 'Repair vs Replace', icon: 'scale', tabs: [t('Life-cycle model', rvrView, mountRvr), t('Fleet decisions', rvrFleet, mountFleet)] },
  { id: 'capital', name: 'Capital Planning', icon: 'building', tabs: [t('Portfolio', capPortfolio, mountPortfolio), t('Five-year plan', capPlan, mountPlan), t('Business case', capCase, mountCase)] },
  { id: 'flow', name: 'Cost Flow', icon: 'schematic', tabs: [t('Value-flow single-line', () => '<div class="nx-hmi is-full" id="fin-hmi"></div>', mountFlow, { full: true, }), t('Value ledger', flowLedger, mountLedger), ...drawingTabs('finance')] },
];
const searchIndex = () => [
  ...assets.map((a) => ({ label: a.kind === 'tx' ? `${a.name} · ${a.rating} MVA` : `${a.name} · ${a.line}`, sub: `Lifetime ${fmt.money(a.lifetime)} · risk ${fmt.money(a.exposure)}/yr`, icon: a.kind === 'tx' ? 'transformer' : 'tower', run: () => { rvrAsset = a.id; nav.go('asset', 0); } })),
  ...net.workOrders.map((w) => ({ label: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${w.towerName || w.asset} · ${fmt.money(woCost(w).total)} · ${w.stage}`, icon: 'clipboard', run: () => openWO(w) })),
  ...PROJECTS.map((p) => ({ label: p.name, sub: `${p.id} · capex ${fmt.money(p.capex)} · B/C ${fmt.n(p.bcr, 2)}×`, icon: 'building', run: () => nav.go('capital', 0) })),
];
mountApp({ id: 'finance', code: '07', product: 'Financial Intelligence', back: '/#module-card-07', asOf: AS_OF, screens, searchIndex });
