// Module 04 — Energy & Grid Performance.
// SCADA/EMS/historian view of the same network the reliability module scores: L-132-01, L-220-03, L-500-01 and
// substations S-1 (220/132 kV) and S-2 (500/220 kV). Live values come from the tag bus (network.js defineGridTags
// plus the module tags below); history (hourly loading, trips, outages, losses) is generated deterministically and
// tied to real towers and findings, so the defect ↔ operating-stress correlation uses the seed's real findings.

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, healthColor, riskColor, SEV, KV_COLOR, addDays, daysBetween, rng } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, DEFECT_LABEL, SEV_TONE, LINE_NAME } from '../network.js';
import { healthIndex } from '/reliability/js/domain/health/healthIndex.js';
import { drawingTabs } from '../drawings.js';
import { models } from '../models.js';

const net = await loadNetwork();
// Predictive outputs of this module, for the model validation register (models.js). All run on simulated demo data and
// stay labelled / Simulated in the interface until tested against real data.
models.register([
  { id: 'grid-n1', name: 'N-1 contingency screen', module: '04 · Energy & Grid Performance', predicts: 'Post-contingency loading of the surviving transformers at S-1 and S-2, the secure / alert / violation status and a remedial action; line contingencies are listed as islanding or re-dispatch cases', method: 'Live load of the transformer group re-shared pro rata over the remaining rated MVA (no AC load-flow, no network impedances). The L-220-03 and L-500-01 outcomes and all remedial actions are fixed scenario text.', needs: 'EMS contingency-analysis results (state estimator and load-flow) for the same snapshots, and recorded post-outage flows from real N-1 events.' },
  { id: 'grid-thermal-exposure', name: 'Thermal stress exposure per structure', module: '04 · Energy & Grid Performance', predicts: 'Hours of thermal stress each tower has seen in 28 days, and its correlation with structure condition (Pearson r, trend line, high- vs low-stress split)', method: 'Line hours above 90 % of static rating × a local shelter factor (0.70–0.95, random in the demo) plus an uplift for C4 / C5 corrosion zones. No span-level conductor temperature is measured.', needs: 'Span-level conductor temperature or sag sensor history (or IEEE 738 calculations from corridor weather stations), set against inspection findings per structure.' },
  { id: 'grid-action-priority', name: 'Defect action priority before a thermal event', module: '04 · Energy & Grid Performance', predicts: 'A 0–100 priority for clearing each verified critical / high finding on L-220-03 before the next thermal event', method: '45 % relative thermal exposure + 35 % health deficit ((100 − HI) / 70) + 20 % severity weight, × 1.15 for thermally sensitive defect classes and × 0.85 otherwise. The weights are engineering assumptions.', needs: 'Failure and trip history of defects that stayed open through thermal events, to fit the weights.' },
  { id: 'grid-leadlag', name: 'Finding to trip lead-lag correlation', module: '04 · Energy & Grid Performance', predicts: 'Whether monthly verified findings lead line trips by 0 to 4 months (Pearson r per lag)', method: 'Pearson correlation of monthly finding counts with trip counts k months later, over 12 months of demo records (n ≤ 12 per lag).', needs: 'Several years of dated inspection findings and protection trip records per circuit.' },
  { id: 'grid-redispatch', name: 'Avoidable losses (re-dispatch study)', module: '04 · Energy & Grid Performance', predicts: 'Share of technical losses avoidable by optimal tap and reactive dispatch', method: 'Fixed illustrative figure (7.8 %) in the prototype; no optimal power flow is run.', needs: 'An optimal power-flow study on the real network model, checked against metered losses before and after a dispatch change.' },
  { id: 'grid-sf6-tta', name: 'SF₆ time-to-alarm projection', module: '04 · Energy & Grid Performance', predicts: 'Days until the GIS bay E03 Q0 gas density reaches alarm-1 (640 kPa)', method: 'Straight-line projection: (density − 640 kPa) ÷ a fixed loss rate of 0.35 kPa per day.', needs: 'Density-monitor history and top-up records for the leaking compartment, temperature compensated.' },
  { id: 'grid-switching-sim', name: 'Schematic switching simulation', module: '04 · Energy & Grid Performance', predicts: 'Energised and de-energised sections and transformer load sharing after a switching operation or a simulated line trip on the one-line; SF₆ top-up on the GIS P&ID', method: 'Topology tracing over switch states; the transformer group load is re-shared pro rata to rating among the units in service. No load-flow and no protection or interlock logic.', needs: 'The network model and EMS study-mode (dispatcher training simulator) results for the same switching sequences.' },
]);
const AS = net.asOf;
const R = rng(40404);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const rf = (a, b) => a + R() * (b - a);
const pickW = (items, w) => { const t = w.reduce((a, b) => a + b, 0); let x = R() * t; for (let i = 0; i < items.length; i += 1) { x -= w[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; };

const LINES = [...net.lines].sort((a, b) => b.kv - a.kv);
const LINE = Object.fromEntries(LINES.map((l) => [l.id, l]));
const TX = net.transformers.filter((t) => /^TX-\d[A-C]$/.test(t.id));
const S1 = net.substations.find((s) => s.id === 'SUB-S1');
const S2 = net.substations.find((s) => s.id === 'SUB-S2');
const LCOL = { 'L-500-01': KV_COLOR[500], 'L-220-03': KV_COLOR[220], 'L-132-01': KV_COLOR[132] };
const SHORT = { 'L-500-01': 'L-500-01 Inland', 'L-220-03': 'L-220-03 North', 'L-132-01': 'L-132-01 Coastal' };
const CONDUCTOR = { 500: { name: 'ACSR 400/51 · quad bundle', r: 0.0206, amp: 4 * 645 }, 220: { name: 'ACSR 400/51 · twin bundle', r: 0.041, amp: 2 * 645 }, 132: { name: 'ACSR 400/51 · single', r: 0.082, amp: 645 } };
const TOTAL_CUST = 412000;
const PRICE = 62; // $/MWh, loss valuation

/* ====================================================================== live tags (module) */
const LOSS_TAGS = [];
for (const l of LINES) {
  const c = CONDUCTOR[l.kv];
  live.define(`${l.id}.LOSS`, { fn: () => (3 * live.get(`${l.id}.I`) ** 2 * c.r * l.lengthKm) / 1e6, dec: 2, unit: 'MW', desc: `${l.id} I²R losses` });
  live.define(`${l.id}.AMP`, { fn: () => c.amp * dlrFactor(), dec: 0, unit: 'A', desc: `${l.id} dynamic ampacity` });
  LOSS_TAGS.push(`${l.id}.LOSS`);
}
for (const t of TX) {
  live.define(`${t.id}.LOSS`, { fn: () => { const r = t.rating || 150; const k = live.get(`${t.id}.MVA`) / r; return r * (0.0007 + 0.0034 * k * k); }, dec: 2, unit: 'MW', desc: `${t.id} losses` });
  LOSS_TAGS.push(`${t.id}.LOSS`);
}
for (const t of TX) {
  live.define(`G04.N1.${t.id}`, { fn: () => { const grp = TX.filter((x) => x.sub === t.sub); const rest = grp.filter((x) => x.id !== t.id); return (grp.reduce((a, x) => a + (live.get(`${x.id}.MVA`) || 0), 0) / rest.reduce((a, x) => a + x.rating, 0)) * 100; }, dec: 1, unit: '%', desc: `Simulated post-contingency loading if ${t.id} trips` });
  live.define(`G04.HSM.${t.id}`, { fn: () => 98 - (live.get(`${t.id}.HST`) || 0), dec: 1, unit: '°C', desc: `${t.id} hot-spot margin to 98 °C alarm` });
}
live.define('G04.WX.WIND', { base: 4.4, noise: 0.35, rev: 0.05, min: 0.3, dec: 1, unit: 'm/s', desc: 'Corridor wind speed (met mast M-07)' });
live.define('G04.WX.AMB', { base: 19.6, noise: 0.05, rev: 0.02, dec: 1, unit: '°C', desc: 'Corridor ambient temperature' });
live.define('G04.WX.SOLAR', { base: 410, noise: 12, rev: 0.05, min: 0, dec: 0, unit: 'W/m²', desc: 'Solar irradiance' });
live.define('G04.WX.HUM', { base: 64, noise: 0.6, rev: 0.05, dec: 0, unit: '%', desc: 'Relative humidity' });
function dlrFactor() { const w = live.get('G04.WX.WIND') ?? 4; const a = live.get('G04.WX.AMB') ?? 20; return Math.min(1.45, Math.max(0.85, 0.9 + 0.075 * w - 0.006 * (a - 25))); }
for (const l of LINES) live.define(`${l.id}.DLR`, { fn: () => l.rating * dlrFactor(), dec: 0, unit: 'MVA', desc: `${l.id} dynamic line rating` });
live.define('G04.S2.LOAD', { base: 505, noise: 3.5, rev: 0.06, dec: 0, unit: 'MW', desc: 'S-2 220 kV local demand' });
live.define('G04.F11.MW', { base: 122, noise: 1.2, rev: 0.07, dec: 0, unit: 'MW', desc: 'F-11 Sumgait 132 kV feeder' });
live.define('G04.F12.MW', { base: 104, noise: 1.1, rev: 0.07, dec: 0, unit: 'MW', desc: 'F-12 Khirdalan 132 kV feeder' });
live.define('G04.CAP.MVAR', { base: 40, noise: 0.2, rev: 0.2, dec: 1, unit: 'Mvar', desc: 'C-1 132 kV capacitor bank' });
live.define('G04.R5.MVAR', { base: 90, noise: 0.3, rev: 0.2, dec: 1, unit: 'Mvar', desc: 'R-1 500 kV shunt reactor' });
live.define('G04.SYS.MW', { fn: () => live.get('G04.S2.LOAD') + live.get('L-132-01.MW') + live.get('G04.F11.MW') + live.get('G04.F12.MW'), dec: 0, unit: 'MW', desc: 'System demand' });
live.define('G04.SYS.LOSS', { fn: () => LOSS_TAGS.reduce((a, t) => a + (live.get(t) || 0), 0), dec: 2, unit: 'MW', desc: 'Transmission losses' });
live.define('G04.SYS.LOSSPCT', { fn: () => (live.get('G04.SYS.LOSS') / Math.max(1, live.get('L-500-01.MW'))) * 100, dec: 2, unit: '%', desc: 'Loss ratio' });
live.define('G04.PEAK', { fn: () => Math.max(...LINES.map((l) => live.get(`${l.id}.LOAD`) || 0)), dec: 1, unit: '%', h: 90, hh: 100, desc: 'Highest line loading' });
live.define('G04.HIST.LAG', { base: 1.3, noise: 0.25, rev: 0.2, min: 0.2, dec: 1, unit: 's', h: 5, desc: 'Historian ingest lag' });
live.define('G04.ICCP.LAT', { base: 38, noise: 3, rev: 0.2, min: 8, dec: 0, unit: 'ms', h: 250, desc: 'ICCP TASE.2 round-trip' });
live.define('G04.RTU1.LAT', { base: 22, noise: 2, rev: 0.2, min: 5, dec: 0, unit: 'ms', h: 200, desc: 'S-1 RTU IEC 104 latency' });
live.define('G04.RTU2.LAT', { base: 27, noise: 2.5, rev: 0.2, min: 5, dec: 0, unit: 'ms', h: 200, desc: 'S-2 RTU IEC 104 latency' });
live.define('G04.PMU.LAT', { base: 19, noise: 1.4, rev: 0.2, min: 5, dec: 0, unit: 'ms', desc: 'PMU C37.118 latency' });
live.define('G04.TAGQ', { base: 99.6, noise: 0.05, rev: 0.2, max: 100, dec: 2, unit: '%', desc: 'Tag quality (good)' });
live.define('G04.PMU.ANG', { base: 8.4, noise: 0.15, rev: 0.1, dec: 2, unit: '°', desc: 'S-1 ↔ S-2 voltage angle difference' });

/* ====================================================================== history (deterministic) */
const DAYS = 28;
const dayList = Array.from({ length: DAYS }, (_, i) => addDays(AS, i - DAYS + 1));
const PU = { 'L-132-01': 0.58, 'L-220-03': 0.78, 'L-500-01': 0.52 };
const PEAKF = { 'L-132-01': 1.08, 'L-220-03': 1.2, 'L-500-01': 1.1 };
const shape = (h) => 0.62 + 0.22 * Math.exp(-(((h - 11.5) / 3.2) ** 2)) + 0.34 * Math.exp(-(((h - 19.5) / 2.3) ** 2));
const heatAdj = (d) => (d >= 16 && d <= 20 ? 0.1 + 0.02 * (2 - Math.abs(d - 18)) : d >= 24 && d <= 25 ? 0.05 : 0);
const hourly = {}; // line -> [d][h] loading %
const wxHourly = []; // [d][h] { wind, amb }
for (let d = 0; d < DAYS; d += 1) {
  wxHourly.push(Array.from({ length: 24 }, (_, h) => ({ wind: Math.max(0.4, 3.2 + 2.6 * Math.sin((h - 14) / 24 * 2 * Math.PI) + rf(-1.3, 1.3)), amb: 14 + 8 * Math.exp(-(((h - 15) / 5) ** 2)) + heatAdj(d) * 60 + rf(-1, 1) })));
}
for (const l of LINES) {
  hourly[l.id] = dayList.map((day, d) => {
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    return Array.from({ length: 24 }, (_, h) => 100 * PU[l.id] * PEAKF[l.id] * (shape(h) / 0.96) * (wd === 0 || wd === 6 ? 0.89 : 1) * (1 + heatAdj(d)) * (1 + rf(-0.03, 0.03)));
  });
}
// thermal events: runs of hours above 92 % of static rating
const thermal = [];
for (const l of LINES) {
  hourly[l.id].forEach((row, d) => {
    let start = null; let peak = 0;
    row.forEach((v, h) => {
      if (v > 92) { if (start == null) start = h; peak = Math.max(peak, v); }
      if ((v <= 92 || h === 23) && start != null) { thermal.push({ line: l.id, date: dayList[d], start, hours: (v > 92 ? h + 1 : h) - start, peak, d }); start = null; peak = 0; }
    });
  });
}
const hotHours = Object.fromEntries(LINES.map((l) => [l.id, hourly[l.id].flat().filter((v) => v > 90).length]));

// towers: thermal stress exposure (line hot-hours × local factor; conductor/joint defects aggravate with temperature)
const THERMAL_CLASSES = new Set(['clamp_loose', 'broken_strand', 'conductor_corrosion', 'sag_excessive', 'insulator_flashover_mark', 'spacer_damaged']);
const towerStress = net.towers.map((t) => {
  const fs = t.findings || [];
  const thermalF = fs.filter((f) => THERMAL_CLASSES.has(f.defect_class)).length;
  // exposure is physical only (line hot-hours × local wind-shelter / ambient factor); it never reads the tower's
  // condition, so the stress–condition correlation below is a result, not an input
  const local = 0.7 + 0.25 * R() + (t.zone === 'C5' ? 0.12 : t.zone === 'C4' ? 0.06 : 0);
  return { ...t, exposure: Math.round(hotHours[t.line] * local), thermalF };
});
const pearson = (xs, ys) => { const n = xs.length; const mx = xs.reduce((a, b) => a + b, 0) / n; const my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0; let sxx = 0; let syy = 0; for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };

// 12 months of operational events, tied to real towers (weighted to weak towers and to matching findings)
const CAUSES = [
  { id: 'lightning', name: 'Lightning', color: '#8b5cf6', w: 26, classes: ['arrester_damaged', 'earthwire_damaged', 'insulator_flashover_mark'] },
  { id: 'insulator', name: 'Insulator flashover', color: '#ef4444', w: 18, classes: ['insulator_contaminated', 'insulator_cracked', 'insulator_flashover_mark', 'insulator_missing_disc'] },
  { id: 'vegetation', name: 'Vegetation', color: '#16a34a', w: 14, classes: ['vegetation_encroachment'] },
  { id: 'bird', name: 'Bird streamer / nest', color: '#f59e0b', w: 10, classes: ['bird_nest'] },
  { id: 'conductor', name: 'Conductor / hardware', color: '#0ea5e9', w: 12, classes: ['broken_strand', 'clamp_loose', 'damper_displaced', 'spacer_damaged', 'sag_excessive'] },
  { id: 'wind', name: 'Wind / galloping', color: '#64748b', w: 9, classes: [] },
  { id: 'unknown', name: 'Not determined', color: '#cbd5e1', w: 11, classes: [] },
];
const CAUSE = Object.fromEntries(CAUSES.map((c) => [c.id, c]));
const towersBy = Object.fromEntries(LINES.map((l) => [l.id, net.towers.filter((t) => t.line === l.id)]));
function towerFor(lineId, cause) {
  const ts = towersBy[lineId];
  const w = ts.map((t) => (100 - (t.hi ?? 90)) / 10 + 0.4 + (t.findings || []).filter((f) => cause.classes.includes(f.defect_class)).length * 3);
  return pickW(ts, w);
}
const pad2 = (v) => String(v).padStart(2, '0');
const events = [];
let evn = 0;
const START = addDays(AS, -364);
const mkEv = (o) => { evn += 1; events.push({ id: `EV-${String(26000 + evn)}`, ...o }); };
const RELAY = { 500: '21 Z1 + 87L', 220: '21 Z1 (POTT)', 132: '21 Z1 / 67N' };
for (let i = 0; i < 31; i += 1) { // line trips
  const lineId = pickW(['L-132-01', 'L-220-03', 'L-500-01'], [1.35, 1.25, 0.9]);
  const cause = pickW(CAUSES, CAUSES.map((c) => c.w));
  const t = towerFor(lineId, cause); const l = LINE[lineId];
  const date = addDays(START, Math.floor(Math.pow(R(), 0.9) * 364));
  const lockout = R() < (cause.id === 'conductor' || cause.id === 'vegetation' ? 0.45 : 0.16);
  const dur = lockout ? Math.round(rf(14, cause.id === 'conductor' ? 240 : 120)) : 0;
  const cust = lockout ? (lineId === 'L-132-01' ? ri(4000, 22000) : R() < 0.3 ? ri(1500, 9000) : 0) : 0;
  const mw = Math.round(cust * 0.0034); // N-1 secure circuits: load is lost only where the trip leaves customers radial
  mkEv({ cat: 'trip', type: lockout ? 'Trip — lockout' : 'Trip — auto-reclose successful', date, time: `${pad2(ri(0, 23))}:${pad2(ri(0, 59))}:${pad2(ri(0, 59))}`, line: lineId, tower: t, cause: cause.id, relay: RELAY[l.kv], phase: pickW(['A-G', 'B-G', 'C-G', 'A-B', 'B-C-G'], [30, 28, 26, 9, 7]), distKm: Math.round(((t.idx || 1) / towersBy[lineId].length) * l.lengthKm * 10) / 10, faultKA: Math.round(rf(3.5, l.kv === 500 ? 28 : 18) * 10) / 10, sev: lockout ? (cust ? 'critical' : 'high') : 'medium', durMin: dur, customers: cust, mwLost: mw, ens: Math.round((mw * dur) / 60), lockout });
}
for (const th of thermal) mkEv({ cat: 'thermal', type: 'Thermal loading alarm', date: th.date, time: `${pad2(th.start)}:00:00`, line: th.line, tower: null, sev: th.peak > 100 ? 'high' : 'medium', peak: th.peak, hours: th.hours, durMin: th.hours * 60, customers: 0, mwLost: 0, ens: 0 });
for (let i = 0; i < 26; i += 1) { // older thermal events (summer peaks)
  const lineId = pickW(['L-220-03', 'L-132-01', 'L-500-01'], [5, 1.4, 1]);
  const date = addDays(START, ri(190, 300));
  const peak = rf(92.5, 108);
  mkEv({ cat: 'thermal', type: 'Thermal loading alarm', date, time: `${pad2(ri(12, 21))}:00:00`, line: lineId, tower: null, sev: peak > 100 ? 'high' : 'medium', peak, hours: ri(1, 5), durMin: 0, customers: 0, mwLost: 0, ens: 0 });
}
for (let i = 0; i < 30; i += 1) {
  const sub = R() < 0.5 ? S1 : S2; const kv = sub.levels[ri(0, sub.levels.length - 1)]; const hi = R() < 0.55;
  mkEv({ cat: 'voltage', type: hi ? 'Over-voltage excursion' : 'Under-voltage excursion', date: addDays(START, ri(0, 364)), time: `${pad2(ri(0, 23))}:${pad2(ri(0, 59))}:00`, line: null, sub: sub.id, kv, sev: 'medium', value: kv * (hi ? rf(1.051, 1.082) : rf(0.92, 0.949)), durMin: ri(2, 35), customers: 0, mwLost: 0, ens: 0 });
}
for (let i = 0; i < 8; i += 1) mkEv({ cat: 'sf6', type: 'SF₆ density stage-1 alarm', date: addDays(START, ri(0, 364)), time: `${pad2(ri(0, 23))}:${pad2(ri(0, 59))}:00`, sub: 'SUB-S1', bay: pickW(['E01', 'E02', 'E03', 'E04'], [1, 1, 3, 1]), sev: 'high', durMin: 0, customers: 0, mwLost: 0, ens: 0 });
for (let i = 0; i < 12; i += 1) mkEv({ cat: 'comms', type: pickW(['RTU IEC 104 link down', 'ICCP association lost', 'PMU data gap'], [5, 2, 3]), date: addDays(START, ri(0, 364)), time: `${pad2(ri(0, 23))}:${pad2(ri(0, 59))}:00`, sub: R() < 0.5 ? 'SUB-S1' : 'SUB-S2', sev: 'low', durMin: ri(1, 40), customers: 0, mwLost: 0, ens: 0 });
for (let i = 0; i < 22; i += 1) { const lineId = pickW(['L-132-01', 'L-220-03', 'L-500-01'], [1, 1.4, 0.8]); mkEv({ cat: 'switching', type: 'Planned outage — maintenance switching', date: addDays(START, ri(0, 364)), time: `${pad2(ri(6, 9))}:${pad2(ri(0, 59))}:00`, line: lineId, sev: 'low', durMin: ri(180, 600), customers: 0, mwLost: 0, ens: 0, planned: true }); }
events.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
const trips = events.filter((e) => e.cat === 'trip');
const outages = trips.filter((e) => e.lockout);
const monthKey = (d) => d.slice(0, 7);
const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${AS.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7); });
const monLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const custMin = outages.reduce((a, o) => a + o.customers * o.durMin, 0);
const custInt = outages.reduce((a, o) => a + o.customers, 0);
const SAIDI = custMin / TOTAL_CUST; const SAIFI = custInt / TOTAL_CUST; const CAIDI = custInt ? custMin / custInt : 0;
const ENS = outages.reduce((a, o) => a + o.ens, 0);
const MAIFI = trips.filter((t) => !t.lockout).length;
const byMonth = (list, fn = () => 1) => months.map((m) => list.filter((e) => monthKey(e.date) === m).reduce((a, e) => a + fn(e), 0));

// correlation headline for L-220-03
const l220Find = net.findings.filter((f) => f.line === 'L-220-03' && f.review_status === 'confirmed' && (f.severity === 'critical' || f.severity === 'high'));
const l220Therm30 = events.filter((e) => e.cat === 'thermal' && e.line === 'L-220-03' && daysBetween(e.date, AS) <= 30);
const l220Towers = towerStress.filter((t) => t.line === 'L-220-03' && t.hi != null);
const rStress = pearson(l220Towers.map((t) => t.exposure), l220Towers.map((t) => 100 - t.hi));
const hotFind = l220Find.filter((f) => THERMAL_CLASSES.has(f.defect_class));

/* ====================================================================== helpers */
let APP = null;
const go = (s, t) => APP?.go(s, t);
const tlabels = (n) => { const now = Date.now(); return Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 1000).toTimeString().slice(0, 8)); };
const histOf = (tag, n = 180) => live.hist(tag).slice(-n).map((v) => +(+v).toFixed(2));
const loadColor = (v) => (v >= 100 ? '#dc2626' : v >= 90 ? '#ea580c' : v >= 75 ? '#d97706' : '#16a34a');
const card = (title, sub, body, o = {}) => ui.card({ title, sub, body, ...o });
const chartCard = (title, sub, id, size = '', o = {}) => ui.card({ title, sub, body: ui.chart(id, size), ...o });
const sevBadge = (s) => ui.badge(fmt.title(s), SEV_TONE[s] || 'muted');
const catTone = { trip: 'crit', thermal: 'high', voltage: 'warn', sf6: 'violet', comms: 'info', switching: 'muted' };
const catIcon = { trip: 'outage', thermal: 'thermo', voltage: 'zap', sf6: 'radar', comms: 'sync', switching: 'flow' };
const where = (e) => e.tower ? `${e.tower.name} · ${e.line}` : e.line ? e.line : e.bay ? `${e.sub === 'SUB-S1' ? 'S-1' : 'S-2'} GIS bay ${e.bay}` : e.sub ? `${e.sub === 'SUB-S1' ? 'S-1' : 'S-2'}${e.kv ? ` ${e.kv} kV bus` : ''}` : '—';
const lineSeg = (active) => ui.seg('line', LINES.map((l) => [l.id, SHORT[l.id]]), active);
const strip = ({ tags, names, colors, yName, min, max, marks, area, markArea, legend = true }) => ({
  grid: ch.grid({ top: legend ? 34 : 12 }), tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v, yName === 'm' ? 2 : 1)} ${yName || ''}` }), legend: legend ? { top: 0, right: 0 } : undefined, animation: false,
  xAxis: { type: 'category', data: tlabels(histOf(tags[0]).length), boundaryGap: false, axisLabel: { interval: 29 } },
  yAxis: { type: 'value', name: yName, min, max, scale: min == null },
  series: tags.map((t, i) => ({ type: 'line', name: names[i], data: histOf(t), showSymbol: false, smooth: true, lineStyle: { width: 2, color: colors[i] }, itemStyle: { color: colors[i] }, areaStyle: area ? { color: `${colors[i]}18` } : undefined, markLine: i === 0 && marks ? { symbol: 'none', silent: true, data: marks.map(([v, c, n]) => ({ yAxis: v, lineStyle: { color: c, type: 'dashed' }, label: { formatter: n, color: c, fontSize: 10, position: 'insideEndTop' } })) } : undefined, markArea: i === 0 ? markArea : undefined })),
});
const stripUpdate = (inst, tags) => { if (!inst || inst.isDisposed()) return; inst.setOption({ xAxis: { data: tlabels(histOf(tags[0]).length) }, series: tags.map((t) => ({ data: histOf(t) })) }); };

const sevTone = (s) => SEV_TONE[s] || 'muted';
const hhmm = (t) => t.slice(0, 5);
const addMin = (time, min) => { const [h, m, s] = time.split(':').map(Number); const x = h * 60 + m + min; return `${pad2(Math.floor(x / 60) % 24)}:${pad2(Math.round(x % 60))}:${pad2(s || 0)}`; };
/** Reconstructed sequence of events for one record (protection, EMS and control-room steps). */
function soeSteps(e) {
  if (e.cat === 'trip') {
    return [
      { when: `${e.time}.000`, title: `${e.relay} pickup — ${e.phase} fault`, text: `${e.faultKA} kA · fault locator ${e.distKm} km from ${e.line === 'L-500-01' ? 'S-2' : 'S-1'}${e.tower ? ` (≈ ${e.tower.name})` : ''}`, tone: 'crit' },
      { when: `${e.time}.018`, title: 'Trip command to Q0, both line ends', text: 'Tele-protection (POTT) received at remote end in 9 ms', tone: 'crit' },
      { when: `${e.time}.055`, title: 'Q0 open both ends — fault cleared', text: 'Breaker operating time 37 ms · DFR record captured', tone: 'warn' },
      { when: `${e.time}.655`, title: e.lockout ? 'Auto-reclose 79 onto fault → lockout' : 'Auto-reclose 79 successful', text: e.lockout ? 'Second trip in 21 Z1 · reclose blocked · control room informed' : 'Single shot, 0.6 s dead time · circuit back in service', tone: e.lockout ? 'crit' : 'ok' },
      ...(e.lockout ? [{ when: addMin(e.time, Math.max(8, Math.round(e.durMin * 0.25))), title: 'Patrol dispatched to fault location', text: e.cause ? `Probable cause: ${CAUSE[e.cause].name}` : '', tone: 'info' }, { when: addMin(e.time, e.durMin), title: 'Circuit restored', text: `${e.durMin} min outage · ${fmt.n(e.customers)} customers · ${fmt.n(e.ens)} MWh not supplied`, tone: 'ok' }] : []),
    ];
  }
  if (e.cat === 'thermal') return [{ when: e.time, title: 'Loading crosses 92 % of static rating', text: 'EMS thermal alarm raised · DLR check requested', tone: 'warn' }, { when: addMin(e.time, Math.round((e.hours || 1) * 30)), title: `Peak ${fmt.n(e.peak, 1)} % of static rating`, text: `Conductor estimate ${fmt.n(28 + (e.peak / 100) ** 2 * 52, 1)} °C (IEEE 738)`, tone: e.peak > 100 ? 'crit' : 'warn' }, { when: addMin(e.time, (e.hours || 1) * 60), title: 'Loading back below 92 %', text: `${e.hours || 1} h above threshold`, tone: 'ok' }];
  if (e.cat === 'voltage') return [{ when: e.time, title: `${e.type} begins`, text: `${fmt.n(e.value, 1)} kV (${fmt.n((e.value / e.kv) * 100, 1)} % of nominal)`, tone: 'warn' }, { when: addMin(e.time, 1), title: 'AVR / OLTC response', text: e.type.startsWith('Over') ? 'Tap lowered, R-1 reactor duty checked' : 'Tap raised, C-1 capacitor switched in', tone: 'info' }, { when: addMin(e.time, e.durMin), title: 'Voltage back inside ±5 % band', text: `${e.durMin} min excursion`, tone: 'ok' }];
  if (e.cat === 'sf6') return [{ when: e.time, title: `Stage-1 SF₆ alarm, GIS bay ${e.bay}`, text: 'Density below alarm-1 (temperature compensated)', tone: 'warn' }, { when: addMin(e.time, 25), title: 'Maintenance notified, leak survey raised', text: 'Gas camera survey planned within 48 h', tone: 'info' }, { when: addMin(e.time, 180), title: 'Topped up from service cart', text: 'Recovered to rated density; leak rate trended', tone: 'ok' }];
  if (e.cat === 'comms') return [{ when: e.time, title: e.type, text: 'Front-end processor raised communication alarm', tone: 'warn' }, { when: addMin(e.time, 0.1), title: 'Fail-over to standby channel', text: 'Data quality flagged "not topical" during gap', tone: 'info' }, { when: addMin(e.time, e.durMin), title: 'Main channel restored', text: `${e.durMin} min gap, back-filled from RTU buffer`, tone: 'ok' }];
  return [{ when: e.time, title: 'Switching programme issued', text: 'Permit-to-work linked', tone: 'info' }, { when: addMin(e.time, 20), title: 'Circuit isolated and earthed', text: 'Q0, Q9 open · Q8 closed both ends', tone: 'warn' }, { when: addMin(e.time, e.durMin), title: 'Returned to service', text: `${Math.round(e.durMin / 60)} h planned outage`, tone: 'ok' }];
}
function eventDrawer(e) {
  if (!e) return;
  const near = e.tower ? net.findings.filter((f) => f.tower_id === e.tower.id && f.review_status !== 'rejected') : [];
  const c = e.cause ? CAUSE[e.cause] : null;
  const same = events.filter((x) => x.id !== e.id && x.cat === e.cat && (e.line ? x.line === e.line : x.sub === e.sub)).slice(0, 8);
  const di = dayList.indexOf(e.date);
  const record = `<div class="nx-sec"><h4>Impact</h4>${ui.stats([{ label: 'Severity', value: fmt.title(e.sev), color: SEV[e.sev] }, { label: 'Duration', value: e.durMin ? `${e.durMin} min` : '—' }, { label: 'Customers', value: fmt.n(e.customers) }, { label: 'ENS', value: e.ens ? `${fmt.n(e.ens)} MWh` : '—' }, { label: 'MW lost', value: e.mwLost ? fmt.n(e.mwLost) : '—' }])}</div>
    <div class="nx-drawer-grid"><div class="nx-sec"><h4>Record</h4>${ui.kv([
      ['Event class', esc(e.type)], ['Asset', esc(where(e))], ...(e.relay ? [['Protection', esc(e.relay)], ['Faulted phase', esc(e.phase)], ['Fault locator', `${e.distKm} km`], ['Fault current', `${e.faultKA} kA`], ['Auto-reclose', e.lockout ? '<span style="color:#dc2626">Lockout</span>' : '<span style="color:#16a34a">Successful</span>']] : []),
      ...(c ? [['Probable cause', `<span style="color:${c.color}">●</span> ${esc(c.name)}`]] : []), ...(e.peak ? [['Peak loading', `${fmt.n(e.peak, 1)} %`], ['Hours above 92 %', e.hours]] : []), ...(e.value ? [['Recorded voltage', `${fmt.n(e.value, 1)} kV`]] : []), ...(e.bay ? [['GIS bay', e.bay]] : []),
      ['Source', e.cat === 'trip' ? 'SOE · IEC 61850 GOOSE / DFR' : e.cat === 'thermal' ? 'EMS thermal monitor' : 'SCADA historian'],
    ])}</div><div class="nx-sec"><h4>Sequence of events</h4>${ui.timeline(soeSteps(e))}</div></div>`;
  const ctxTitle = e.line && di >= 0 ? `${e.line} loading on ${fmt.date(e.date)}` : e.line ? `${e.line} · ${fmt.title(e.cat)} events per month` : `${where(e)} · ${fmt.title(e.cat)} events per month`;
  const context = `<div class="nx-sec"><h4>${esc(ctxTitle)}</h4><div class="nx-chart is-md" data-chart="ev-ctx"></div><p class="nx-note">${e.line && di >= 0 ? 'Hourly historian average, % of static rating · marker = event hour · dashed lines = 90 % alarm and 100 % rating.' : 'Twelve months of records for this asset and event class · highlighted bar = this event.'}</p></div>
    <div class="nx-sec"><h4>Previous ${esc(fmt.title(e.cat === 'sf6' ? 'SF6' : e.cat))} events on this asset (${same.length})</h4>${same.length ? `<div class="nx-list">${same.map((x) => ui.li({ ic: catIcon[x.cat], color: SEV[x.sev], title: `${x.id} · ${x.type}`, sub: `${fmt.date(x.date)} ${x.time}${x.cause ? ` · ${CAUSE[x.cause].name}` : ''}${x.peak ? ` · peak ${fmt.n(x.peak, 1)} %` : ''}`, end: sevBadge(x.sev), row: x.id })).join('')}</div>` : ui.empty('No earlier events of this class on this asset in 12 months.')}</div>`;
  const evid = e.tower ? `<div class="nx-sec"><h4>Structure ${esc(e.tower.name)}</h4>${ui.stats([{ label: 'Health index', value: e.tower.hi == null ? '—' : fmt.n(e.tower.hi, 0), color: healthColor(e.tower.hi) }, { label: 'Risk', value: fmt.title(e.tower.riskBand || '—') }, { label: 'Open findings', value: e.tower.open }, { label: 'Trips here', value: trips.filter((x) => x.tower?.id === e.tower.id).length }])}${ui.kv([['Type', esc(e.tower.type || '—')], ['Corrosion zone', esc(e.tower.zone || '—')], ['Height', `${e.tower.height ?? '—'} m`], ['In service', String(e.tower.install || '').slice(0, 4)]])}</div>
    <div class="nx-sec"><h4>Inspection evidence (${near.length})</h4>${near.length ? `<div class="nx-list">${near.slice(0, 8).map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: f.label, sub: `${f.finding_id} · ${fmt.date(f.date)} · ${f.review_status} · ${fmt.n(f.confidence * 100)} % conf.${c && c.classes.includes(f.defect_class) ? ' · <b style="color:#dc2626">matches trip cause</b>' : ''}`, end: sevBadge(f.severity) })).join('')}</div>` : ui.empty('No inspection findings recorded at this structure.')}</div>` : null;
  drawer.open({
    icon: catIcon[e.cat], kicker: `${e.id} · ${fmt.title(e.cat === 'sf6' ? 'SF6' : e.cat)} event`, title: e.type, sub: `${esc(where(e))} · ${fmt.date(e.date)} ${e.time}`,
    badges: [[fmt.title(e.sev), sevTone(e.sev)], ...(e.cat === 'trip' ? [[e.lockout ? 'Sustained outage' : 'Momentary', e.lockout ? 'crit' : 'warn']] : []), ...(c ? [[c.name, 'muted']] : []), ...(e.planned ? [['Planned', 'info']] : [])],
    tabs: [
      { name: 'Record', body: record },
      { name: 'Context', body: context, mount: (b, cx) => {
        if (e.line && di >= 0) {
          const row = hourly[e.line][di]; const hr = Number(e.time.slice(0, 2));
          cx.chart('ev-ctx', ch.line({ x: row.map((_, h) => `${pad2(h)}:00`), series: [{ name: 'Loading', data: row.map((v) => +v.toFixed(1)), color: LCOL[e.line], area: true, symbol: false, markPoint: { symbol: 'pin', symbolSize: 36, data: [{ coord: [hr, +row[hr].toFixed(1)], value: hhmm(e.time) }], itemStyle: { color: SEV[e.sev] } }, markLine: { symbol: 'none', silent: true, data: [{ yAxis: 90, lineStyle: { color: '#ea580c', type: 'dashed' } }, { yAxis: 100, lineStyle: { color: '#dc2626', type: 'dashed' } }], label: { fontSize: 10 } } }], yName: '%', legend: false, tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} %` } }));
        } else {
          const list = events.filter((x) => x.cat === e.cat && (e.line ? x.line === e.line : x.sub === e.sub));
          cx.chart('ev-ctx', ch.bar({ x: months.map(monLabel), series: [{ name: 'Events', data: months.map((m) => ({ value: list.filter((x) => monthKey(x.date) === m).length, itemStyle: { color: m === monthKey(e.date) ? SEV[e.sev] : '#cbd5e1', borderRadius: [4, 4, 0, 0] } })) }], legend: false, labels: true, tooltip: { valueFormatter: (v) => `${v} event${v === 1 ? '' : 's'}` } }));
        }
        cx.on('click', '.nx-li[data-row]', (ev, r) => eventDrawer(events.find((x) => x.id === r.dataset.row)));
      } },
      ...(evid ? [{ name: `Structure & evidence (${near.length})`, body: evid }] : []),
    ],
    actions: [{ label: 'Acknowledge', icon: 'check', onClick: (close) => { toast(`${e.id} acknowledged`); close(); } }, ...(e.line ? [{ label: 'Line detail', primary: true, icon: 'line', onClick: () => lineDrawer(LINE[e.line]) }] : e.cat === 'sf6' ? [{ label: 'GIS SF₆ P&ID', primary: true, icon: 'radar', onClick: (close) => { close(); go('schematics', 1); } }] : [])],
  });
}

/** A live strip chart inside a drawer: tags on one axis, refreshed every second. */
function drawerStrip(cx, id, tags, names, colors, unit, extra = {}) {
  let inst = null;
  cx.chart(id, { ...strip({ tags, names, colors, yName: unit, ...extra }), tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v, 1)} ${unit}` }) }).then((i) => { inst = i; });
  cx.onLive(() => stripUpdate(inst, tags));
}
function lineDrawer(l) {
  if (!l) return;
  const H = hourly[l.id]; const peak = H.map((r) => Math.max(...r)); const mean = H.map((r) => r.reduce((a, b) => a + b, 0) / r.length);
  const th = events.filter((e) => e.cat === 'thermal' && e.line === l.id);
  const tr = trips.filter((t) => t.line === l.id);
  const fs = net.findings.filter((f) => f.line === l.id && f.review_status !== 'rejected');
  drawer.open({
    icon: 'line', kicker: `Transmission line · ${l.kv} kV · Corridor ${l.corridor}`, title: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers · ${CONDUCTOR[l.kv].name} · static rating ${l.rating} MVA`, wide: true,
    badges: [[`HI ${fmt.n(l.hi, 1)}`, l.band === 'poor' ? 'crit' : l.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${l.riskBand || '—'}`, l.riskBand === 'critical' || l.riskBand === 'high' ? 'crit' : 'ok'], [`${hotHours[l.id]} h above 90 % (28 d)`, hotHours[l.id] > 40 ? 'high' : 'muted'], [`${tr.length} trips / 12 mo`, tr.length > 8 ? 'warn' : 'muted']],
    tabs: [
      { name: 'Live', body: `<div class="nx-sec"><h4>Telemetry · 1 s SCADA</h4>${ui.stats([{ label: 'Active power MW', value: '—', live: `${l.id}.MW` }, { label: 'Reactive Mvar', value: '—', live: `${l.id}.MVAR` }, { label: 'Current A', value: '—', live: `${l.id}.I` }, { label: 'Voltage kV', value: '—', live: `${l.id}.KV` }, { label: 'Loading %', value: '—', live: `${l.id}.LOAD` }, { label: 'Conductor °C', value: '—', live: `${l.id}.TC` }, { label: 'DLR MVA', value: '—', live: `${l.id}.DLR` }, { label: 'I²R loss MW', value: '—', live: `${l.id}.LOSS` }])}</div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Loading, % of static rating</h4><div class="nx-chart is-sm" data-chart="ld-loading"></div></div><div class="nx-sec"><h4>Conductor temperature, °C</h4><div class="nx-chart is-sm" data-chart="ld-tc"></div></div></div>`,
        mount: (b, cx) => { drawerStrip(cx, 'ld-loading', [`${l.id}.LOAD`], ['Loading'], [LCOL[l.id]], '%', { legend: false, area: true, min: 30, max: 110, marks: [[90, '#ea580c', '90 %']] }); drawerStrip(cx, 'ld-tc', [`${l.id}.TC`], ['Conductor'], ['#ea580c'], '°C', { legend: false, min: 20, max: 90, marks: [[75, '#dc2626', '75 °C']] }); } },
      { name: 'Loading history', body: `<div class="nx-sec"><h4>Daily peak and mean loading · 28 days</h4><div class="nx-chart is-md" data-chart="ld-hist"></div></div><div class="nx-sec"><h4>Thermal alarms on this line (${th.length})</h4>${th.length ? ui.table({ id: 'ld-th', rowId: (e) => e.id, rows: th.slice(0, 12), cols: [{ label: 'Date', render: (e) => `<b>${fmt.date(e.date)}</b><span class="nx-sub">${e.time}</span>`, sort: (e) => e.date }, { label: 'Peak', align: 'r', render: (e) => `${fmt.n(e.peak, 1)} %`, sort: (e) => e.peak }, { label: 'Hours', align: 'r', key: 'hours' }, { label: 'Severity', render: (e) => sevBadge(e.sev), sort: (e) => e.sev }] }) : ui.empty('No thermal alarms in 12 months.')}</div>`,
        mount: (b, cx) => { cx.chart('ld-hist', { grid: ch.grid(), legend: { top: 0, right: 0 }, tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v, 1)} %` }), xAxis: { type: 'category', data: dayList.map(fmt.short) }, yAxis: { type: 'value', name: '%', min: 30 }, series: [{ type: 'bar', name: 'Daily peak', data: peak.map((v) => ({ value: +v.toFixed(1), itemStyle: { color: loadColor(v), borderRadius: [3, 3, 0, 0] } })), barWidth: 9 }, { type: 'line', name: 'Daily mean', data: mean.map((v) => +v.toFixed(1)), smooth: true, showSymbol: false, lineStyle: { color: '#0f172a', width: 2 }, itemStyle: { color: '#0f172a' }, markLine: { symbol: 'none', silent: true, data: [{ yAxis: 90 }], lineStyle: { color: '#ea580c', type: 'dashed' }, label: { formatter: '90 %', fontSize: 10, color: '#ea580c' } } }] }); cx.on('click', '#ld-th tr[data-row]', (ev, r) => eventDrawer(events.find((x) => x.id === r.dataset.row))); } },
      { name: `Reliability (${tr.length})`, body: `<div class="nx-drawer-grid"><div class="nx-sec"><h4>Trips by cause · 12 months</h4><div class="nx-chart is-sm" data-chart="ld-cause"></div></div><div class="nx-sec"><h4>Open findings by severity</h4><div class="nx-chart is-sm" data-chart="ld-sev"></div></div></div><div class="nx-sec"><h4>Trips</h4>${tr.length ? `<div class="nx-list">${tr.slice(0, 10).map((t) => ui.li({ ic: 'outage', color: CAUSE[t.cause].color, title: `${t.id} · ${t.type}`, sub: `${fmt.date(t.date)} ${t.time} · ${t.tower?.name || ''} · ${CAUSE[t.cause].name}${t.lockout ? ` · ${t.durMin} min` : ''}`, end: sevBadge(t.sev), row: t.id })).join('')}</div>` : ui.empty('No trips in 12 months.')}</div>`,
        mount: (b, cx) => { const cs = CAUSES.filter((c) => tr.some((t) => t.cause === c.id)); cx.chart('ld-cause', ch.donut({ data: cs.map((c) => ({ name: c.name, value: tr.filter((t) => t.cause === c.id).length, color: c.color })), center: 'trips', legend: 'right' })); cx.chart('ld-sev', ch.bar({ x: ['critical', 'high', 'medium', 'low'].map(fmt.title), series: [{ name: 'Findings', data: ['critical', 'high', 'medium', 'low'].map((s) => ({ value: fs.filter((f) => f.severity === s).length, itemStyle: { color: SEV[s], borderRadius: [4, 4, 0, 0] } })) }], legend: false, labels: true, tooltip: { valueFormatter: (v) => `${v} findings` } })); cx.on('click', '.nx-li[data-row]', (ev, r) => eventDrawer(events.find((x) => x.id === r.dataset.row))); } },
    ],
    actions: [{ label: 'Show on network map', icon: 'map', onClick: (close) => { close(); go('overview', 1); } }, { label: 'Line performance', primary: true, icon: 'gauge', onClick: (close) => { lineState.line = l.id; close(); go('lines', 0); } }],
  });
}
function txDrawer(t) {
  if (!t) return;
  const grp = TX.filter((x) => x.sub === t.sub); const rest = grp.filter((x) => x.id !== t.id);
  const post = () => (grp.reduce((a, x) => a + live.get(`${x.id}.MVA`), 0) / rest.reduce((a, x) => a + x.rating, 0)) * 100;
  const last = t.dga[t.dga.length - 1];
  drawer.open({
    icon: 'transformer', kicker: `Power transformer · ${t.sub === 'SUB-S1' ? 'S-1' : 'S-2'}`, title: `${t.id} · ${t.rating} MVA`, sub: `${esc(t.ratio)} kV · ${esc(t.maker || '')} · ${esc(t.serial || '')} · in service ${String(t.install || '').slice(0, 4)}`, wide: true,
    badges: [[`HI ${fmt.n(t.hi, 1)}`, t.band === 'poor' ? 'crit' : t.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${t.riskBand || '—'}`, t.riskBand === 'critical' || t.riskBand === 'high' ? 'crit' : 'ok'], ...(t.duval ? [[`Duval ${t.duval.zone} · ${t.duval.label}`, ['D1', 'D2', 'T3', 'T2'].includes(t.duval.zone) ? 'crit' : 'warn']] : [['DGA normal', 'ok']])],
    tabs: [
      { name: 'Live', body: `<div class="nx-sec"><h4>Online monitoring · IEC 61850</h4>${ui.stats([{ label: 'Load MVA', value: '—', live: `${t.id}.MVA` }, { label: 'Top-oil °C', value: '—', live: `${t.id}.TOT` }, { label: 'Hot-spot °C', value: '—', live: `${t.id}.HST` }, { label: 'H₂ ppm', value: '—', live: `${t.id}.H2` }, { label: 'C₂H₂ ppm', value: '—', live: `${t.id}.C2H2` }, { label: 'Moisture ppm', value: '—', live: `${t.id}.MOIST` }, { label: 'OLTC tap', value: '—', live: `${t.id}.TAP` }, { label: 'Losses MW', value: '—', live: `${t.id}.LOSS` }])}</div>
        <div class="nx-drawer-grid"><div class="nx-sec"><h4>Thermal model (IEC 60076-7), °C</h4><div class="nx-chart is-sm" data-chart="tx-th"></div></div><div class="nx-sec"><h4>Load, MVA</h4><div class="nx-chart is-sm" data-chart="tx-ld"></div></div></div>`,
        mount: (b, cx) => { drawerStrip(cx, 'tx-th', [`${t.id}.TOT`, `${t.id}.HST`], ['Top-oil', 'Hot-spot'], ['#f59e0b', '#dc2626'], '°C', { min: 20, max: 110, marks: [[98, '#dc2626', 'HS alarm 98 °C']] }); drawerStrip(cx, 'tx-ld', [`${t.id}.MVA`], ['Load'], ['#3b82f6'], 'MVA', { legend: false, area: true, min: 0, max: Math.round(t.rating * 1.2) }); } },
      { name: `DGA (${t.dga.length} samples)`, body: `<div class="nx-sec"><h4>Dissolved gases, laboratory samples (ppm)</h4><div class="nx-chart is-md" data-chart="tx-dga"></div><p class="nx-note">IEC 60599 / IEEE C57.104 · ${t.duval ? `Duval triangle 1: zone <b>${esc(t.duval.zone)}</b> — ${esc(t.duval.label)}.` : 'No fault zone indicated.'} Worst gas: ${esc(t.worstGas || '—')}.</p></div>${last ? `<div class="nx-sec"><h4>Latest sample · ${fmt.date(last.date)}</h4>${ui.stats(['h2', 'ch4', 'c2h6', 'c2h4', 'c2h2', 'co'].map((g) => ({ label: g.toUpperCase().replace(/(\d)/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]), value: fmt.n(last[g], 1) })))}</div>` : ''}`,
        mount: (b, cx) => { const gases = [['h2', 'H₂', '#3b82f6'], ['ch4', 'CH₄', '#14b8a6'], ['c2h4', 'C₂H₄', '#f59e0b'], ['c2h6', 'C₂H₆', '#8b5cf6'], ['c2h2', 'C₂H₂', '#dc2626']]; cx.chart('tx-dga', ch.line({ x: t.dga.map((d) => fmt.short(d.date)), series: gases.map(([k, n, c]) => ({ name: n, data: t.dga.map((d) => d[k]), color: c, symbol: true })), yName: 'ppm', tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} ppm` } })); } },
      { name: 'N-1 contingency', body: `<div class="nx-sec"><h4>If ${esc(t.id)} trips ${ui.exp('Simulated')}</h4>${ui.stats([{ label: 'Remaining units', value: rest.map((x) => x.id).join(' + ') }, { label: 'Post-contingency %', value: '—', live: `G04.N1.${t.id}` }, { label: 'Emergency limit', value: '120 % · 2 h' }])}<div class="nx-chart is-sm" data-chart="tx-n1" style="margin-top:12px"></div><p class="nx-note">Load of all ${grp.length} units at ${t.sub === 'SUB-S1' ? 'S-1' : 'S-2'} re-shared over the remaining rating, recalculated each second from live flows. Simulated study (pro-rata re-share, no load-flow); not validated against real data.</p></div>`,
        mount: (b, cx) => { let inst = null; const opt = () => ch.bar({ x: grp.map((x) => x.id), series: [{ name: 'Now', data: grp.map((x) => +((live.get(`${x.id}.MVA`) / x.rating) * 100).toFixed(1)), color: '#94a3b8' }, { name: `After loss of ${t.id}`, data: grp.map((x) => (x.id === t.id ? 0 : +post().toFixed(1))), color: post() > 100 ? '#dc2626' : '#16a34a' }], yName: '% of rating', tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} %` } }); cx.chart('tx-n1', opt()).then((i) => { inst = i; }); cx.every(2000, () => { if (inst && !inst.isDisposed()) inst.setOption(opt()); }); } },
    ],
    actions: [{ label: 'Open one-line', primary: true, icon: 'schematic', onClick: (close) => { close(); go('schematics', 0); } }],
  });
}
function towerDrawer(t) {
  if (!t) return;
  const tr = trips.filter((x) => x.tower?.id === t.id); const fs = net.findings.filter((f) => f.tower_id === t.id && f.review_status !== 'rejected');
  const ts = towerStress.find((x) => x.id === t.id);
  drawer.open({
    icon: 'tower', kicker: `Structure · ${t.line} · ${esc(t.type || '')}`, title: `Tower ${t.name}`, sub: `Corrosion zone ${esc(t.zone || '—')} · ${t.height ?? '—'} m · in service ${String(t.install || '').slice(0, 4)}`,
    badges: [[`HI ${t.hi == null ? '—' : fmt.n(t.hi, 0)}`, t.band === 'poor' ? 'crit' : t.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${t.riskBand || '—'}`, t.riskBand === 'critical' ? 'crit' : t.riskBand === 'high' ? 'high' : 'muted'], [`${tr.length} trips`, tr.length >= 3 ? 'crit' : 'warn']],
    body: `<div class="nx-sec"><h4>Performance</h4>${ui.stats([{ label: 'Trips 12 mo', value: tr.length }, { label: 'Lockouts', value: tr.filter((x) => x.lockout).length }, { label: 'Customer-min', value: fmt.n(tr.reduce((a, x) => a + x.customers * x.durMin, 0)) }, { label: 'Open findings', value: fs.length }, { label: 'Thermal exposure h', value: ts?.exposure ?? '—' }])}</div>
      <div class="nx-sec"><h4>Trips at this structure</h4><div class="nx-chart is-sm" data-chart="tw-tr"></div>${ui.timeline(tr.map((x) => ({ when: `${fmt.date(x.date)} ${x.time}`, title: `${x.id} · ${x.type}`, text: `${CAUSE[x.cause].name} · ${x.relay} · ${x.faultKA} kA${x.lockout ? ` · ${x.durMin} min outage` : ''}`, tone: x.lockout ? 'crit' : 'warn' })))}</div>
      <div class="nx-sec"><h4>Inspection findings (${fs.length})</h4>${fs.length ? `<div class="nx-list">${fs.slice(0, 8).map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: f.label, sub: `${f.finding_id} · ${fmt.date(f.date)} · ${f.review_status}`, end: sevBadge(f.severity) })).join('')}</div>` : ui.empty('No findings at this structure.')}</div>`,
    mount: (b, cx) => cx.chart('tw-tr', ch.bar({ x: months.map(monLabel), series: [{ name: 'Trips', data: months.map((m) => tr.filter((x) => monthKey(x.date) === m).length), color: '#dc2626' }], legend: false, tooltip: { valueFormatter: (v) => `${v} trip${v === 1 ? '' : 's'}` } })),
    actions: [{ label: 'Latest trip record', primary: true, icon: 'outage', onClick: () => eventDrawer(tr[0]) }],
  });
}
function tagDrawer(tag) {
  const s = live.spec(tag); if (!s) return;
  const h = live.hist(tag); const mn = Math.min(...h); const mx = Math.max(...h); const av = h.reduce((a, b) => a + b, 0) / h.length;
  const lim = [s.l != null ? `L ${fmt.n(s.l, 1)}` : '', s.h != null ? `H ${fmt.n(s.h, 1)}` : '', s.hh != null ? `HH ${fmt.n(s.hh, 1)}` : ''].filter(Boolean).join(' · ') || 'none configured';
  drawer.open({
    icon: 'pulse', kicker: 'Historian tag', title: tag, sub: esc(s.desc || ''),
    badges: [['Quality good', 'ok'], [s.unit || 'dimensionless', 'muted'], [live.state(tag) === 'n' ? 'In limits' : 'In alarm', live.state(tag) === 'n' ? 'ok' : 'crit']],
    body: `<div class="nx-sec"><h4>Value · last ${h.length} s</h4>${ui.stats([{ label: 'Now', value: '—', live: tag }, { label: 'Min', value: fmt.n(mn, s.dec ?? 1) }, { label: 'Mean', value: fmt.n(av, s.dec ?? 1) }, { label: 'Max', value: fmt.n(mx, s.dec ?? 1) }])}<div class="nx-chart is-md" data-chart="tag-tr" style="margin-top:12px"></div></div><div class="nx-sec"><h4>Configuration</h4>${ui.kv([['Engineering unit', esc(s.unit || '—')], ['Alarm limits', esc(lim)], ['Scan / deadband', '1 s · 0.1 %'], ['Compression', 'Swinging door, 0.1 %'], ['Retention', '5 years raw, 20 years hourly']])}</div>`,
    mount: (b, cx) => drawerStrip(cx, 'tag-tr', [tag], [tag], ['#2563eb'], s.unit || '', { legend: false, area: true, marks: [...(s.h != null ? [[s.h, '#ea580c', 'H']] : []), ...(s.hh != null ? [[s.hh, '#dc2626', 'HH']] : [])] }),
  });
}

function lineInfo(l) {
  return {
    kicker: `Transmission line · ${l.kv} kV`, title: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers · ${CONDUCTOR[l.kv].name}`,
    badges: [[`HI ${fmt.n(l.hi, 1)}`, l.band === 'poor' ? 'crit' : l.band === 'moderate' ? 'warn' : 'ok'], [`Risk ${l.riskBand || '—'}`, l.riskBand === 'critical' || l.riskBand === 'high' ? 'crit' : 'ok']],
    fields: [['Active power', `<span data-live="${l.id}.MW"></span> MW`], ['Loading', `<span data-live="${l.id}.LOAD"></span> %`], ['Current', `<span data-live="${l.id}.I"></span> A`], ['Voltage', `<span data-live="${l.id}.KV"></span> kV`], ['Conductor temp.', `<span data-live="${l.id}.TC"></span> °C`], ['Dynamic rating', `<span data-live="${l.id}.DLR"></span> MVA`], ['Trips (12 mo)', trips.filter((t) => t.line === l.id).length]],
    spark: { data: histOf(`${l.id}.LOAD`, 120), color: LCOL[l.id], label: 'Loading %, last 2 min' },
    actions: [{ label: 'Line detail', primary: true, icon: 'line', onClick: () => lineDrawer(l) }, { label: 'Line performance', icon: 'gauge', onClick: () => go('lines') }, { label: 'Events', icon: 'event', onClick: () => go('events', 2) }],
  };
}
function subInfo(s) {
  const txs = TX.filter((t) => t.sub === s.id);
  return {
    kicker: `Substation · ${s.levels.join('/')} kV`, title: s.name, sub: `${txs.length} power transformers · ${s.bays} bays · criticality A`,
    fields: [...s.levels.map((kv) => [`${kv} kV busbar`, `<span data-live="${s.id}.BUS${kv}"></span> kV`]), ['Frequency', `<span data-live="${s.id}.F"></span> Hz`], ...txs.map((t) => [`${t.id} (${t.rating} MVA)`, `<span data-live="${t.id}.MVA"></span> MVA · <span data-live="${t.id}.TOT"></span> °C`])],
    spark: { data: histOf(`${s.id}.BUS${s.levels[0]}`, 120), color: KV_COLOR[s.levels[0]], label: `${s.levels[0]} kV busbar voltage, last 2 min` },
    actions: [{ label: 'One-line diagram', primary: true, icon: 'schematic', onClick: () => go('schematics', 0) }, ...txs.slice(0, 1).map((t) => ({ label: `${t.id} detail`, icon: 'transformer', onClick: () => txDrawer(t) })), ...(s.id === 'SUB-S1' ? [{ label: 'GIS SF₆', icon: 'radar', onClick: () => go('schematics', 1) }] : [])],
  };
}

/** Network map with live-coloured lines, events, weather and findings. */
function gridMapCfg({ full = false } = {}) {
  const recent = events.filter((e) => daysBetween(e.date, AS) <= 60 && (e.tower || e.line));
  const evPts = recent.map((e) => {
    const t = e.tower || LINE[e.line].towers[Math.floor(LINE[e.line].towers.length * (0.25 + (e.id.charCodeAt(e.id.length - 1) % 5) / 10))];
    const color = e.cat === 'trip' ? (e.lockout ? '#dc2626' : '#f97316') : e.cat === 'thermal' ? '#ea580c' : '#64748b';
    return { id: e.id, lat: t.lat + 0.0012, lng: t.lng + 0.0016, size: e.cat === 'trip' && e.lockout ? 16 : 13, shape: 'dia', color, pulse: daysBetween(e.date, AS) <= 3, icon: catIcon[e.cat], search: `${e.type} ${e.line}`, tip: `${e.type} · ${where(e)} · ${fmt.short(e.date)}`, info: () => ({ kicker: `${e.id} · ${fmt.date(e.date)} ${e.time}`, title: e.type, sub: where(e), badges: [[fmt.title(e.sev), SEV_TONE[e.sev]], ...(e.cause ? [[CAUSE[e.cause].name, 'muted']] : [])], fields: [...(e.relay ? [['Protection', esc(e.relay)], ['Fault locator', `${e.distKm} km`], ['Fault current', `${e.faultKA} kA`]] : []), ...(e.peak ? [['Peak loading', `${fmt.n(e.peak, 1)} %`], ['Duration', `${e.hours} h`]] : []), ['Customers', fmt.n(e.customers)], ['ENS', `${fmt.n(e.ens)} MWh`]], actions: [{ label: 'Event detail', primary: true, onClick: () => eventDrawer(e) }] }) };
  });
  const hiFind = net.findings.filter((f) => f.review_status === 'confirmed' && (f.severity === 'critical' || f.severity === 'high') && f.lat);
  const findPts = hiFind.map((f) => ({ id: f.finding_id, lat: f.lat, lng: f.lng, size: 9, color: SEV[f.severity], search: `${f.label} ${f.towerName}`, tip: `${f.label} · ${f.towerName || f.assetName}`, info: () => ({ kicker: `Verified finding · ${f.finding_id}`, title: f.label, sub: `${f.towerName || f.assetName} · ${f.line || ''}`, badges: [[fmt.title(f.severity), SEV_TONE[f.severity]], [f.sensor.toUpperCase(), 'muted']], fields: [['Detected', fmt.date(f.date)], ['Confidence', `${fmt.n(f.confidence * 100)} %`], ['Thermal-sensitive', THERMAL_CLASSES.has(f.defect_class) ? '<b style="color:#ea580c">Yes — aggravated by loading</b>' : 'No'], ['Line hot-hours (28 d)', hotHours[f.line] ?? '—']] }) }));
  // weather cells along corridors
  const cells = [];
  LINES.forEach((l, i) => { const c = l.coords[Math.floor(l.coords.length * (0.35 + i * 0.2))]; cells.push({ lat: c[0] + 0.01, lng: c[1] - 0.012, r: 2600 + i * 700, color: i === 1 ? '#f97316' : '#8b5cf6', opacity: 0.16 }); });
  const wxPts = [
    { id: 'WX-M07', lat: LINE['L-220-03'].coords[30][0] + 0.008, lng: LINE['L-220-03'].coords[30][1], size: 20, color: '#0284c7', icon: 'wind', label: 'M-07', tip: 'Met mast M-07 · DLR weather input', info: () => ({ kicker: 'Weather station · DLR input', title: 'Met mast M-07', sub: 'IEEE 738 dynamic rating inputs, 10-min average', fields: [['Wind speed', '<span data-live="G04.WX.WIND"></span> m/s'], ['Ambient', '<span data-live="G04.WX.AMB"></span> °C'], ['Solar', '<span data-live="G04.WX.SOLAR"></span> W/m²'], ['Humidity', '<span data-live="G04.WX.HUM"></span> %'], ['DLR uplift', `${fmt.n((dlrFactor() - 1) * 100, 1)} %`]], spark: { data: histOf('G04.WX.WIND', 120), color: '#0284c7', label: 'Wind m/s, last 2 min' } }) },
  ];
  const layers = networkLayers(net, { onLine: lineInfo, subsInfo: subInfo });
  layers.push({ id: 'events', name: 'Operational events (60 d)', color: '#dc2626', shape: 'dia', points: evPts });
  layers.push({ id: 'findings', name: 'Verified high-priority findings', color: '#ea580c', points: findPts, on: full });
  layers.push({ id: 'weather', name: 'Weather cells & met masts', color: '#8b5cf6', circles: cells, points: wxPts, count: wxPts.length + cells.length });
  return {
    layers, base: full ? 'light' : 'light',
    legend: [{ label: '< 75 %', color: '#16a34a', line: true }, { label: '75–90 %', color: '#d97706', line: true }, { label: '90–100 %', color: '#ea580c', line: true }, { label: '> 100 %', color: '#dc2626', line: true }, { label: 'Lockout trip', color: '#dc2626' }, { label: 'Reclosed trip', color: '#f97316' }],
    stats: full ? [{ label: 'System demand MW', value: '—', live: 'G04.SYS.MW' }, { label: 'Frequency Hz', value: '—', live: 'SUB-S2.F' }, { label: 'Peak loading %', value: '—', live: 'G04.PEAK' }, { label: 'Losses MW', value: '—', live: 'G04.SYS.LOSS' }] : undefined,
  };
}
async function liveMap(ctx, sel, opts) {
  const m = await ctx.map(sel, gridMapCfg(opts));
  if (!m) return;
  const paint = () => LINES.forEach((l) => m.restyle(l.id, { color: loadColor(live.get(`${l.id}.LOAD`)) }));
  paint(); ctx.every(3000, paint);
}

/* ====================================================================== CSS */
if (!document.getElementById('grid-css')) {
  const st = document.createElement('style'); st.id = 'grid-css';
  st.textContent = `
  .grd-lrow{display:grid;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--nx-line-2);font-size:12px}
  .grd-lrow:last-child{border-bottom:0}.grd-lrow b{display:block;font-size:12.5px}.grd-lrow small{color:var(--nx-muted);font-size:11px}
  .grd-lrow .nx-bar{height:9px;position:relative;overflow:visible}.grd-lrow .nx-bar i{transition:width .9s ease}
  .grd-lrow .nx-bar::after{content:"";position:absolute;left:90%;top:-3px;bottom:-3px;width:1px;background:#ea580c}
  .grd-lrow .grd-val{text-align:right;font:600 13px var(--nx-mono)}
  .grd-link{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--nx-line-2);font-size:12px}
  .grd-link:last-child{border-bottom:0}.grd-link small{display:block;color:var(--nx-muted);font-size:11px}.grd-link .v{font:600 12px var(--nx-mono);text-align:right}
  .grd-gauges{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
  .grd-gauges .nx-chart{height:150px}
  .grd-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .grd-lc{padding:14px 16px;display:flex;flex-direction:column;gap:6px}
  .grd-lc h4{margin:0;font-size:13px;display:flex;align-items:center;gap:8px}.grd-lc h4 i{width:10px;height:10px;border-radius:3px;display:inline-block}
  .grd-lc .grd-big{font:700 26px var(--nx-font);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .grd-lc .grd-big small{font-size:13px;color:var(--nx-muted);font-weight:600}
  .grd-soe{font:12px var(--nx-mono);max-height:520px;overflow:auto}
  .grd-soe div{display:grid;grid-template-columns:150px 110px 1fr 120px;gap:12px;padding:7px 12px;border-bottom:1px solid var(--nx-line-2);align-items:center}
  .grd-soe div.is-new{animation:grd-new 2.5s ease}
  @keyframes grd-new{0%{background:#fff7ed}100%{background:transparent}}
  .grd-soe .t{color:var(--nx-muted)}.grd-soe .x{font-family:var(--nx-font);font-size:12.5px;color:var(--nx-ink)}
  .grd-scroll{max-height:300px}
  .grd-lc .nx-stats{grid-template-columns:repeat(3,1fr)}
  .grd-lrow{grid-template-columns:150px 1fr 64px}
  .grd-zone{padding:14px 16px}.grd-zone h4{margin:0 0 2px;font-size:14px}.grd-zone p{margin:0 0 10px;color:var(--nx-muted);font-size:11.5px}
  `;
  document.head.appendChild(st);
}

/* ====================================================================== screens */
const screens = [];

/* ---------------- 1. Grid Overview */
screens.push({
  id: 'overview', name: 'Grid Overview', icon: 'grid', note: `${icon('sync', 13)} SCADA scan 1 s · EMS state estimator 30 s · historian`,
  tabs: [
    {
      name: 'Control room', icon: 'dashboard',
      render: () => {
        const activeAlarms = events.filter((e) => daysBetween(e.date, AS) <= 7 && e.cat !== 'switching').length;
        return `<div class="nx-page">
        ${ui.hero({ kicker: 'EMS correlation engine', icon: 'ai', text: `<b>${l220Find.length} high-priority findings on the 220 kV corridor</b> (L-220-03) correlated with <b>${l220Therm30.length} thermal loading events</b> in the last 30 days — ${hotFind.length} of them are thermally sensitive (joints, strands, clamps) and should be cleared before the next heat event.`, meta: [{ label: 'System demand · MW', value: '—', live: 'G04.SYS.MW' }, { label: 'Frequency · Hz', value: '—', live: 'SUB-S2.F' }, { label: 'Losses · MW', value: '—', live: 'G04.SYS.LOSS' }], actions: ui.btn('Open correlation', { attrs: 'data-goto="events:1"', ic: 'trend' }) })}
        ${ui.kpis([
          { label: 'System demand', live: 'G04.SYS.MW', unit: 'MW', icon: 'bolt', spark: histOf('G04.SYS.MW', 90), sub: 'S-2 local + S-1 132 kV' },
          { label: 'Highest line loading', live: 'G04.PEAK', unit: '%', icon: 'gauge', tone: 'warn', spark: histOf('L-220-03.LOAD', 90), sparkColor: '#d97706', sub: 'L-220-03 Corridor North' },
          { label: 'Grid frequency', live: 'SUB-S2.F', unit: 'Hz', icon: 'pulse', tone: 'ok', spark: histOf('SUB-S2.F', 90), sub: 'S-2 PMU · ±0.2 Hz band' },
          { label: 'Events last 7 days', value: activeAlarms, icon: 'event', tone: 'crit', sub: `${events.filter((e) => daysBetween(e.date, AS) <= 7 && e.cat === 'trip').length} trips · ${events.filter((e) => daysBetween(e.date, AS) <= 7 && e.cat === 'thermal').length} thermal`, spark: byMonth(events.filter((e) => e.cat !== 'switching')), sparkColor: '#dc2626' },
          { label: 'SAIDI (12 mo)', value: fmt.n(SAIDI, 1), unit: 'min', icon: 'clock', tone: 'violet', delta: -8.4, deltaInvert: true, sub: 'vs prior 12 mo', spark: byMonth(outages, (o) => (o.customers * o.durMin) / TOTAL_CUST) },
          { label: 'Energy not supplied', value: fmt.n(ENS), unit: 'MWh', icon: 'outage', tone: 'info', sub: `${outages.length} sustained outages`, spark: byMonth(outages, (o) => o.ens) },
        ])}
        <div class="nx-row nx-c12">
          ${card('Network state — live', 'Lines coloured by live loading against static rating; click any line, substation or event', '<div id="gmap" class="nx-map" style="height:520px"></div>', { cls: 'nx-s8', flush: true })}
          <div class="nx-s4" style="display:flex;flex-direction:column;gap:16px">
            ${card('Line loading — live', 'MVA as % of static thermal rating · orange tick = 90 % alarm · click a line for detail', LINES.map((l) => `<div class="grd-lrow" data-line="${l.id}" style="cursor:pointer"><div><b>${esc(SHORT[l.id])}</b><small>${l.kv} kV · ${l.rating} MVA · <span data-live="${l.id}.MW"></span> MW</small></div><div class="nx-bar"><i data-live-w="${l.id}.LOAD" data-max="110" style="background:${LCOL[l.id]}"></i></div><div class="grd-val"><span data-live="${l.id}.LOAD"></span>%</div></div>`).join(''))}
            ${card('Telemetry sources', 'Approved real-time feeds into the EMS / historian', [
              ['ICCP TASE.2 · national dispatch', 'Bilateral table v4 · 1,284 points', 'G04.ICCP.LAT', 'ms'],
              ['IEC 60870-5-104 · S-1 RTU (dual)', 'Main + standby link, 2,116 points', 'G04.RTU1.LAT', 'ms'],
              ['IEC 60870-5-104 · S-2 RTU (dual)', 'Main + standby link, 2,488 points', 'G04.RTU2.LAT', 'ms'],
              ['IEEE C37.118 · PMU S-1/S-2', '50 frames/s · angle & frequency', 'G04.PMU.LAT', 'ms'],
              ['Process historian', 'Compression 0.1 % · 5-yr retention', 'G04.HIST.LAG', 's'],
            ].map(([n, s, t, u]) => `<div class="grd-link"><span class="nx-dot is-pulse"></span><div>${esc(n)}<small>${esc(s)}</small></div><div class="v"><span data-live="${t}"></span> ${u}</div></div>`).join(''), { foot: `Tag quality good: <b><span data-live="G04.TAGQ"></span> %</b> · 5,888 points · 0 stale` })}
          </div>
        </div>
        <div class="nx-row nx-c12">
          ${chartCard('Corridor power flow — live', 'Active power per circuit, last 3 minutes (1 s SCADA scan)', 'flow', 'md', { cls: 'nx-s8' })}
          ${card('Busbar voltages — live', 'Per-unit of nominal · statutory band 0.95–1.05 p.u.', `<div class="grd-gauges">${['SUB-S2.BUS500', 'SUB-S2.BUS220', 'SUB-S1.BUS220', 'SUB-S1.BUS132'].map((t) => `<div class="nx-chart" data-chart="g-${t}"></div>`).join('')}</div>`, { cls: 'nx-s4' })}
        </div>
        <div class="nx-row nx-c12">
          ${card('Recent operational events', 'Sequence-of-events and EMS alarms · click for the event record', ui.table({ id: 'ev-recent', cols: [
            { label: 'When', key: 'date', render: (e) => `<b>${fmt.short(e.date)}</b><span class="nx-sub">${e.time}</span>`, sort: (e) => e.date + e.time },
            { label: 'Event', key: 'type', render: (e) => `${ui.badge(e.type, catTone[e.cat])}` },
            { label: 'Asset', render: (e) => esc(where(e)), sort: (e) => where(e) },
            { label: 'Cause / detail', render: (e) => esc(e.cause ? CAUSE[e.cause].name : e.peak ? `Peak ${fmt.n(e.peak, 1)} %` : e.value ? `${fmt.n(e.value, 1)} kV` : '—'), sort: false },
            { label: 'Severity', key: 'sev', render: (e) => sevBadge(e.sev) },
          ], rows: events.filter((e) => e.cat !== 'switching').slice(0, 10), rowId: (e) => e.id }), { cls: 'nx-s7', flush: true })}
          ${card('Transformer fleet — live', 'Load, top-oil and winding hot-spot (IEC 60076-7 thermal model) · click a unit for detail', `${ui.table({ id: 'txf', cols: [
            { label: 'Unit', key: 'id', render: (t) => `<b>${t.id}</b><span class="nx-sub">${t.ratio} kV · ${t.rating} MVA</span>` },
            { label: 'Load', align: 'r', render: (t) => `<span data-live="${t.id}.MVA"></span> MVA`, sort: false },
            { label: 'Top oil', align: 'r', render: (t) => `<span data-live="${t.id}.TOT"></span> °C`, sort: false },
            { label: 'Hot-spot', align: 'r', render: (t) => `<span data-live="${t.id}.HST"></span> °C`, sort: false },
            { label: 'HI', align: 'r', key: 'hi', render: (t) => ui.score(t.hi) },
          ], rows: TX, rowId: (t) => t.id })}<div style="padding:4px 16px 12px"><div class="nx-note" style="font-weight:600;color:var(--nx-ink-2)">Hot-spot margin to 98 °C alarm — live</div><div class="nx-chart" data-chart="hsm" style="height:150px"></div></div>`, { cls: 'nx-s5', flush: true })}
        </div></div>`;
      },
      mount: (st, ctx) => {
        liveMap(ctx, '#gmap');
        const ftags = ['L-500-01.MW', 'L-220-03.MW', 'L-132-01.MW'];
        let flow = null; ctx.chart('flow', strip({ tags: ftags, names: ftags.map((t) => SHORT[t.slice(0, 8)]), colors: ftags.map((t) => LCOL[t.slice(0, 8)]), yName: 'MW', area: true })).then((i) => { flow = i; });
        const gauges = {};
        const gOpt = (t) => { const kv = Number(t.split('BUS')[1]); const v = live.get(t) / kv; return { series: [{ type: 'gauge', min: 0.9, max: 1.1, startAngle: 200, endAngle: -20, radius: '100%', center: ['50%', '62%'], splitNumber: 4, axisLine: { lineStyle: { width: 9, color: [[0.25, '#f59e0b'], [0.75, '#16a34a'], [1, '#f59e0b']] } }, pointer: { width: 3, length: '60%', itemStyle: { color: '#0f172a' } }, anchor: { show: true, size: 7, itemStyle: { color: '#0f172a' } }, axisTick: { show: false }, splitLine: { length: 6, lineStyle: { color: '#fff' } }, axisLabel: { show: false }, title: { offsetCenter: [0, '58%'], fontSize: 10.5, color: '#64748b' }, detail: { offsetCenter: [0, '28%'], fontSize: 15, fontWeight: 700, color: '#0f172a', formatter: () => `${fmt.n(live.get(t), 1)} kV` }, data: [{ value: +v.toFixed(4), name: `${t.startsWith('SUB-S1') ? 'S-1' : 'S-2'} ${kv} kV · ${fmt.n(v, 3)} p.u.` }] }] }; };
        for (const t of ['SUB-S2.BUS500', 'SUB-S2.BUS220', 'SUB-S1.BUS220', 'SUB-S1.BUS132']) ctx.chart(`g-${t}`, gOpt(t)).then((i) => { gauges[t] = i; });
        ctx.onLive(() => { stripUpdate(flow, ftags); for (const [t, g] of Object.entries(gauges)) if (g && !g.isDisposed()) g.setOption(gOpt(t)); });
        ctx.on('click', '#ev-recent tr[data-row]', (e, tr) => eventDrawer(events.find((x) => x.id === tr.dataset.row)));
        ctx.on('click', '[data-goto]', (e, b) => { const [s, t] = b.dataset.goto.split(':'); go(s, Number(t)); });
        ctx.on('click', '#txf tr[data-row]', (e, tr) => txDrawer(TX.find((t) => t.id === tr.dataset.row)));
        ctx.on('click', '[data-line]', (e, r) => lineDrawer(LINE[r.dataset.line]));
        const hsmOpt = () => ch.bar({ x: TX.map((t) => t.id), series: [{ name: 'Margin', data: TX.map((t) => { const v = +(live.get(`G04.HSM.${t.id}`) || 0).toFixed(1); return { value: v, itemStyle: { color: v < 10 ? '#dc2626' : v < 25 ? '#f59e0b' : '#16a34a', borderRadius: [4, 4, 0, 0] } }; }) }], legend: false, labels: true, grid: { top: 18, bottom: 2 }, tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} °C below alarm` } });
        let hsm = null; ctx.chart('hsm', hsmOpt()).then((i) => { hsm = i; }); ctx.every(2000, () => { if (hsm && !hsm.isDisposed()) hsm.setOption({ series: hsmOpt().series }); });
      },
    },
    {
      name: 'Network map', icon: 'map', full: true,
      render: () => '<div id="gmap-full" class="nx-map is-full"></div>',
      mount: (st, ctx) => { liveMap(ctx, '#gmap-full', { full: true }); },
    },
    {
      name: 'Telemetry & tags', icon: 'sync',
      render: () => {
        const tags = [...LINES.flatMap((l) => ['MW', 'MVAR', 'LOAD', 'I', 'KV', 'TC', 'SAG', 'DLR', 'LOSS'].map((k) => `${l.id}.${k}`)), ...[S1, S2].flatMap((s) => [`${s.id}.F`, ...s.levels.map((kv) => `${s.id}.BUS${kv}`)]), ...TX.flatMap((t) => ['MVA', 'TOT', 'HST', 'H2', 'C2H2', 'MOIST', 'TAP', 'LOSS'].map((k) => `${t.id}.${k}`)), 'G04.WX.WIND', 'G04.WX.AMB', 'G04.WX.SOLAR', 'G04.PMU.ANG'];
        const src = (t) => (t.includes('PMU') ? 'C37.118' : t.startsWith('G04.WX') ? 'Met API' : /\.(DLR|LOSS|LOAD|SAG|TC)$/.test(t) ? 'EMS calc' : t.startsWith('TX') && /H2|C2H2|MOIST/.test(t) ? 'Online DGA (IEC 61850)' : 'IEC 104');
        return `<div class="nx-page">${ui.kpis([
          { label: 'Points in service', value: '5,888', icon: 'sync', sub: '0 stale · 3 manual overrides', spark: [5801, 5822, 5840, 5862, 5871, 5880, 5888] },
          { label: 'Tag quality (good)', live: 'G04.TAGQ', unit: '%', icon: 'checkCircle', tone: 'ok', sub: 'IEC 61850 quality flags' },
          { label: 'Historian ingest lag', live: 'G04.HIST.LAG', unit: 's', icon: 'clock', tone: 'info', sub: 'Exception + compression', spark: histOf('G04.HIST.LAG', 90) },
          { label: 'ICCP round-trip', live: 'G04.ICCP.LAT', unit: 'ms', icon: 'link', tone: 'violet', sub: 'Association AZ-NDC ↔ NEXUS', spark: histOf('G04.ICCP.LAT', 90) },
        ])}
        <div class="nx-row nx-c12">
          ${card('Data links', 'Approved interfaces (cyber-security zone IEC 62443 SL-2 · read-only into NEXUS)', ui.table({ cols: [
            { label: 'Interface', key: 'n', render: (r) => `<b>${esc(r.n)}</b><span class="nx-sub">${esc(r.s)}</span>` },
            { label: 'Protocol', key: 'p' }, { label: 'Points', key: 'pts', align: 'r', render: (r) => fmt.n(r.pts) },
            { label: 'Latency', align: 'r', render: (r) => (r.t ? `<span data-live="${r.t}"></span> ${r.u}` : r.lat), sort: false },
            { label: 'State', key: 'st', render: (r) => ui.badge(r.st, r.st === 'In service' ? 'ok' : 'warn') },
          ], id: 'dlk', rowId: (r) => r.t || r.n, rows: [
            { n: 'National dispatch (AZ-NDC)', s: 'Bilateral table v4', p: 'ICCP / TASE.2', pts: 1284, t: 'G04.ICCP.LAT', u: 'ms', st: 'In service' },
            { n: 'S-1 RTU A/B', s: 'Redundant, hot standby', p: 'IEC 60870-5-104', pts: 2116, t: 'G04.RTU1.LAT', u: 'ms', st: 'In service' },
            { n: 'S-2 RTU A/B', s: 'Redundant, hot standby', p: 'IEC 60870-5-104', pts: 2488, t: 'G04.RTU2.LAT', u: 'ms', st: 'In service' },
            { n: 'PMU S-1 / S-2', s: '50 fps, PDC at control centre', p: 'IEEE C37.118.2', pts: 64, t: 'G04.PMU.LAT', u: 'ms', st: 'In service' },
            { n: 'Online DGA monitors', s: '6 × 7-gas, IEC 61850 MMS', p: 'IEC 61850', pts: 126, lat: '15 min', st: 'In service' },
            { n: 'Met masts M-03 / M-07', s: 'IEEE 738 DLR inputs', p: 'REST / MQTT', pts: 24, lat: '10 min', st: 'In service' },
            { n: 'Inspection findings (Module 02)', s: 'Verified CV detections', p: 'NEXUS event bus', pts: net.findings.length, lat: 'on review', st: 'In service' },
            { n: 'S-1 RTU B standby link', s: 'Fail-over test due 18 Nov', p: 'IEC 60870-5-104', pts: 0, lat: '—', st: 'Standby' },
          ] }), { cls: 'nx-s12', flush: true })}
        </div>
        ${card('Tag browser', 'Every analogue on this workspace · live value, engineering units and source', `<div class="nx-toolbar" style="margin-bottom:10px">${ui.search('#tagt', 'Filter tags…')}<span class="nx-note">${tags.length} tags · values refresh every second</span></div>${ui.table({ id: 'tagt', cols: [
          { label: 'Tag', render: (t) => `<b class="nx-mono" style="font-size:12px">${esc(t)}</b>`, sort: (t) => t },
          { label: 'Description', render: (t) => esc(live.spec(t)?.desc || ''), sort: (t) => live.spec(t)?.desc || '' },
          { label: 'Value', align: 'r', render: (t) => `<b class="nx-mono" data-live="${esc(t)}"></b>`, sort: false },
          { label: 'Unit', render: (t) => esc(live.spec(t)?.unit || '') , sort: false },
          { label: 'Limits', render: (t) => { const s = live.spec(t); return esc([s?.l != null ? `L ${fmt.n(s.l, 1)}` : '', s?.h != null ? `H ${fmt.n(s.h, 1)}` : '', s?.hh != null ? `HH ${fmt.n(s.hh, 1)}` : ''].filter(Boolean).join(' · ') || '—'); }, sort: false },
          { label: 'Source', render: (t) => ui.badge(src(t), 'muted', { dot: false }), sort: (t) => src(t) },
          { label: 'Quality', render: () => ui.badge('Good', 'ok'), sort: false },
        ], rows: tags, rowId: (t) => t })}`)}
        </div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '#tagt tr[data-row]', (e, tr) => tagDrawer(tr.dataset.row));
        ctx.on('click', '#dlk tr[data-row]', (e, tr) => { if (live.spec(tr.dataset.row)) tagDrawer(tr.dataset.row); else toast(`${tr.dataset.row}: polled interface, no streaming latency tag`, 'warn'); });
      },
    },
  ],
});

/* ---------------- 2. Line Performance */
const lineState = { line: 'L-220-03' };
screens.push({
  id: 'lines', name: 'Line Performance', icon: 'line',
  tabs: [
    {
      name: 'Loading', icon: 'gauge',
      render: () => `<div class="nx-page">
        <div class="grd-g3">${LINES.map((l) => `<section class="nx-card grd-lc" data-line="${l.id}" style="cursor:pointer" data-tip="Open ${esc(l.name)} detail"><h4><i style="background:${LCOL[l.id]}"></i>${esc(l.name)}</h4><div style="display:flex;align-items:flex-end;gap:16px"><div><div class="grd-big"><span data-live="${l.id}.LOAD"></span><small> %</small></div><div class="nx-note">of ${l.rating} MVA static rating</div></div><div style="flex:1">${ui.stats([{ label: 'MW', value: '—', live: `${l.id}.MW` }, { label: 'Mvar', value: '—', live: `${l.id}.MVAR` }, { label: 'A', value: '—', live: `${l.id}.I` }])}</div></div><div class="nx-bar" style="height:8px"><i data-live-w="${l.id}.LOAD" data-max="110" style="background:${LCOL[l.id]}"></i></div><div class="nx-note">DLR <b><span data-live="${l.id}.DLR"></span> MVA</b> · conductor <b><span data-live="${l.id}.TC"></span> °C</b> · ${hotHours[l.id]} h above 90 % in 28 d</div></section>`).join('')}</div>
        <div class="nx-row nx-c12">${chartCard('Loading against rating — live', 'Per cent of static rating, last 3 minutes · 90 % alarm, 100 % trip-risk threshold', 'ld-live', 'md', { cls: 'nx-s7' })}${chartCard('Dynamic vs static line rating', 'IEEE 738 rating from met-mast wind and ambient, 7 days · selected line', 'dlr', 'md', { cls: 'nx-s5' })}</div>
        <div class="nx-toolbar"><b style="font-size:12.5px">Historian analysis for</b>${lineSeg(lineState.line)}<span class="nx-note">Dynamic rating, heatmap and duration curve follow the selected circuit</span></div>
        <div class="nx-row nx-c12">${chartCard('Loading heatmap — hour × day', '28 days of hourly historian averages, % of static rating · selected line', 'hm', 'lg', { cls: 'nx-s8' })}${chartCard('Load duration curve', '672 hourly samples, sorted · share of time above each loading', 'ldc', 'lg', { cls: 'nx-s4' })}</div>
      </div>`,
      mount: (st, ctx) => {
        const tags = LINES.map((l) => `${l.id}.LOAD`);
        let inst = null; ctx.chart('ld-live', strip({ tags, names: LINES.map((l) => SHORT[l.id]), colors: LINES.map((l) => LCOL[l.id]), yName: '%', min: 30, max: 110, marks: [[90, '#ea580c', 'Alarm 90 %'], [100, '#dc2626', 'Rating 100 %']] })).then((i) => { inst = i; });
        ctx.onLive(() => stripUpdate(inst, tags));
        const drawSel = () => {
          const l = LINE[lineState.line]; const H = hourly[l.id];
          const last7 = H.slice(-7).flat(); const wx = wxHourly.slice(-7).flat();
          const x = dayList.slice(-7).flatMap((d) => Array.from({ length: 24 }, (_, h) => `${fmt.short(d)} ${pad2(h)}:00`));
          const dlr = wx.map((w) => Math.round(l.rating * Math.min(1.45, Math.max(0.85, 0.9 + 0.075 * w.wind - 0.006 * (w.amb - 25)))));
          ctx.chart('dlr', ch.line({ x, series: [{ name: 'Actual MVA', data: last7.map((v) => Math.round((v / 100) * l.rating)), color: LCOL[l.id], area: true }, { name: 'Dynamic rating', data: dlr, color: '#16a34a', step: false }, { name: 'Static rating', data: x.map(() => l.rating), color: '#dc2626', dash: true, smooth: false }], yName: 'MVA', zoom: true, tooltip: { valueFormatter: (v) => `${fmt.n(v)} MVA` } }));
          ctx.chart('hm', ch.heat({ x: Array.from({ length: 24 }, (_, h) => pad2(h)), y: dayList.map((d) => fmt.short(d)), data: H.flatMap((row, d) => row.map((v, h) => [h, d, +v.toFixed(1)])), min: 30, max: 105, colors: ['#eff6ff', '#bfdbfe', '#fde68a', '#fb923c', '#b91c1c'], fmtv: (v) => `${fmt.n(v, 1)} %`, grid: { left: 8, bottom: 44 } }));
        };
        drawSel();
        const sorted = Object.fromEntries(LINES.map((l) => [l.id, hourly[l.id].flat().sort((a, b) => b - a)]));
        const n = sorted[LINES[0].id].length;
        ctx.chart('ldc', { grid: ch.grid({ top: 34 }), tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v, 1)} %` }), legend: { top: 0, right: 0 }, xAxis: { type: 'value', name: '% of time', max: 100, axisLabel: { formatter: '{value}%' } }, yAxis: { type: 'value', name: '%', min: 20, max: 110 }, series: LINES.map((l) => ({ type: 'line', name: SHORT[l.id], showSymbol: false, data: sorted[l.id].map((v, i) => [+((i / (n - 1)) * 100).toFixed(2), +v.toFixed(1)]), lineStyle: { color: LCOL[l.id], width: 2 }, itemStyle: { color: LCOL[l.id] }, markLine: l.id === 'L-220-03' ? { symbol: 'none', data: [{ yAxis: 90, lineStyle: { color: '#ea580c', type: 'dashed' }, label: { formatter: '90 %', color: '#ea580c', fontSize: 10 } }] } : undefined })) });
        ctx.onPick('line', (v) => { lineState.line = v; drawSel(); });
        ctx.on('click', '[data-line]', (e, r) => lineDrawer(LINE[r.dataset.line]));
      },
    },
    {
      name: 'Voltage', icon: 'zap',
      render: () => `<div class="nx-page">${ui.kpis([
        ...[['SUB-S2.BUS500', 'S-2 500 kV busbar', 500], ['SUB-S2.BUS220', 'S-2 220 kV busbar', 220], ['SUB-S1.BUS220', 'S-1 220 kV busbar', 220], ['SUB-S1.BUS132', 'S-1 132 kV busbar', 132]].map(([t, n, kv]) => ({ label: n, live: t, unit: 'kV', icon: 'zap', tone: kv === 500 ? 'violet' : kv === 220 ? 'accent' : 'ok', sub: `Nominal ${kv} kV · band ${fmt.n(kv * 0.95, 0)}–${fmt.n(kv * 1.05, 0)}`, spark: histOf(t, 90), sparkColor: KV_COLOR[kv] })),
      ])}
      <div class="nx-row nx-c12">${chartCard('Busbar voltage stability — live', 'Per-unit voltage, last 3 minutes · shaded = statutory ±5 % band', 'v-live', 'md', { cls: 'nx-s8' })}${chartCard('Voltage profile along circuits — live', 'Sending vs receiving end, kV per unit', 'v-prof', 'md', { cls: 'nx-s4' })}</div>
      <div class="nx-row nx-c12">${chartCard('Voltage deviation distribution', '28 days of 1-minute historian samples, % deviation from nominal', 'v-hist', '', { cls: 'nx-s5' })}${card('Voltage excursions (12 months)', 'Outside 0.95–1.05 p.u. for more than 1 minute', ui.table({ id: 'vx', cols: [
        { label: 'When', key: 'date', render: (e) => `<b>${fmt.short(e.date)}</b><span class="nx-sub">${e.time}</span>`, sort: (e) => e.date + e.time },
        { label: 'Busbar', render: (e) => esc(where(e)), sort: (e) => where(e) },
        { label: 'Value', align: 'r', render: (e) => `${fmt.n(e.value, 1)} kV <span class="nx-sub">${fmt.n((e.value / e.kv) * 100, 1)} %</span>`, sort: (e) => e.value / e.kv },
        { label: 'Duration', align: 'r', render: (e) => `${e.durMin} min`, sort: (e) => e.durMin },
        { label: 'Type', render: (e) => ui.badge(e.type.split(' ')[0], e.type.startsWith('Over') ? 'high' : 'info') },
      ], rows: events.filter((e) => e.cat === 'voltage'), rowId: (e) => e.id, cls: 'grd-scroll' }), { cls: 'nx-s7', flush: true })}</div></div>`,
      mount: (st, ctx) => {
        const vt = [['SUB-S2.BUS500', 500], ['SUB-S2.BUS220', 220], ['SUB-S1.BUS220', 220], ['SUB-S1.BUS132', 132]];
        const pu = (t, kv) => histOf(t).map((v) => +(v / kv).toFixed(4));
        const opt = () => ({ grid: ch.grid(), tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v, 3)} p.u.` }), legend: { top: 0, right: 0 }, animation: false, xAxis: { type: 'category', data: tlabels(histOf(vt[0][0]).length), boundaryGap: false, axisLabel: { interval: 29 } }, yAxis: { type: 'value', min: 0.94, max: 1.06, axisLabel: { formatter: (v) => v.toFixed(2) } }, series: vt.map(([t, kv], i) => ({ type: 'line', name: `${t.startsWith('SUB-S1') ? 'S-1' : 'S-2'} ${kv} kV`, data: pu(t, kv), showSymbol: false, smooth: true, lineStyle: { width: 2, color: ['#a855f7', '#3b82f6', '#0ea5e9', '#14b8a6'][i] }, itemStyle: { color: ['#a855f7', '#3b82f6', '#0ea5e9', '#14b8a6'][i] }, markArea: i === 0 ? { silent: true, itemStyle: { color: 'rgba(22,163,74,.06)' }, data: [[{ yAxis: 0.95 }, { yAxis: 1.05 }]] } : undefined, markLine: i === 0 ? { symbol: 'none', silent: true, data: [{ yAxis: 0.95 }, { yAxis: 1.05 }], lineStyle: { color: '#d97706', type: 'dashed' }, label: { fontSize: 10, color: '#d97706' } } : undefined })) });
        let vi = null; ctx.chart('v-live', opt()).then((i) => { vi = i; });
        const prof = () => ch.bar({ x: LINES.map((l) => SHORT[l.id]), series: [{ name: 'Sending end', data: LINES.map((l) => +(live.get(`${l.id}.KV`) / l.kv).toFixed(4)), color: '#3b82f6' }, { name: 'Receiving end', data: LINES.map((l) => +((live.get(`${l.id}.KV`) / l.kv) - (live.get(`${l.id}.LOAD`) / 100) * 0.018).toFixed(4)), color: '#14b8a6' }], yName: 'p.u.', tooltip: { valueFormatter: (v) => `${fmt.n(v, 3)} p.u.` } });
        let pi = null; ctx.chart('v-prof', { ...prof(), yAxis: { type: 'value', min: 0.96, max: 1.04 } }).then((i) => { pi = i; });
        ctx.onLive(() => { if (vi && !vi.isDisposed()) vi.setOption({ xAxis: { data: tlabels(histOf(vt[0][0]).length) }, series: vt.map(([t, kv]) => ({ data: pu(t, kv) })) }); if (pi && !pi.isDisposed()) pi.setOption({ series: prof().series.map((s) => ({ data: s.data })) }); });
        const bins = Array.from({ length: 21 }, (_, i) => -5 + i * 0.5);
        const R2 = rng(77);
        const sample = (sd, mu) => { const b = new Array(bins.length).fill(0); for (let i = 0; i < 4000; i += 1) { const g = Math.sqrt(-2 * Math.log(R2() || 1e-9)) * Math.cos(2 * Math.PI * R2()); const v = mu + g * sd; const k = Math.round((v + 5) / 0.5); if (k >= 0 && k < b.length) b[k] += 1; } return b; };
        ctx.chart('v-hist', ch.bar({ x: bins.map((b) => `${b > 0 ? '+' : ''}${b.toFixed(1)}`), series: [{ name: '500 kV', data: sample(1.1, 0.8), color: '#a855f7' }, { name: '220 kV', data: sample(1.4, 1.1), color: '#3b82f6' }, { name: '132 kV', data: sample(1.8, 0.5), color: '#14b8a6' }], yName: 'samples', tooltip: { valueFormatter: (v) => `${fmt.n(v)} one-minute samples` } }));
        ctx.on('click', '#vx tr[data-row]', (e, tr) => eventDrawer(events.find((x) => x.id === tr.dataset.row)));
      },
    },
    {
      name: 'Current & thermal', icon: 'thermo',
      render: () => `<div class="nx-page">
        <div class="nx-row nx-c12">${chartCard('Conductor temperature — live', 'Estimated from current, ambient and wind (IEEE 738) · design limit 75 °C, emergency 85 °C', 'tc', 'md', { cls: 'nx-s7' })}${chartCard('Current against ampacity — live', 'Phase current vs dynamic ampacity', 'amp', 'md', { cls: 'nx-s5' })}</div>
        <div class="nx-row nx-c12">${chartCard('Mid-span sag — live', 'Ruling span, from conductor temperature · clearance limit drives the thermal rating', 'sag', 'lg', { cls: 'nx-s5' })}
        ${card('Thermal parameters by circuit', 'Static and dynamic rating basis · click a circuit for detail', `${ui.table({ id: 'thp', rowId: (l) => l.id, cols: [
          { label: 'Circuit', render: (l) => `<b>${esc(SHORT[l.id])}</b><span class="nx-sub">${esc(CONDUCTOR[l.kv].name)} · ${l.lengthKm} km</span>`, sort: (l) => l.id },
          { label: 'Static', align: 'r', render: (l) => `${l.rating} MVA`, sort: (l) => l.rating },
          { label: 'Ampacity (DLR)', align: 'r', render: (l) => `<span data-live="${l.id}.AMP"></span> A`, sort: false },
          { label: 'Current', align: 'r', render: (l) => `<b><span data-live="${l.id}.I"></span> A</b>`, sort: false },
          { label: 'Cond. temp', align: 'r', render: (l) => `<span data-live="${l.id}.TC"></span> °C`, sort: false },
          { label: 'Hot h 28 d', align: 'r', render: (l) => `<b style="color:${hotHours[l.id] > 40 ? '#ea580c' : 'inherit'}">${hotHours[l.id]}</b>`, sort: (l) => hotHours[l.id] },
        ], rows: LINES })}<div style="padding:6px 16px 12px"><div class="nx-note" style="font-weight:600;color:var(--nx-ink-2)">Steady-state conductor temperature vs loading (IEEE 738) · dots = operating point now</div><div class="nx-chart" data-chart="ieee" style="height:200px"></div></div>`, { cls: 'nx-s7', flush: true })}</div></div>`,
      mount: (st, ctx) => {
        const tc = LINES.map((l) => `${l.id}.TC`); const sg = LINES.map((l) => `${l.id}.SAG`);
        let a = null; let b = null; let c = null;
        ctx.chart('tc', strip({ tags: tc, names: LINES.map((l) => SHORT[l.id]), colors: LINES.map((l) => LCOL[l.id]), yName: '°C', min: 25, max: 90, marks: [[75, '#ea580c', 'Design 75 °C'], [85, '#dc2626', 'Emergency 85 °C']] })).then((i) => { a = i; });
        ctx.chart('sag', strip({ tags: sg, names: LINES.map((l) => SHORT[l.id]), colors: LINES.map((l) => LCOL[l.id]), yName: 'm' })).then((i) => { b = i; });
        const amp = () => ({ grid: ch.grid(), tooltip: ch.tip({ axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${fmt.n(v)} A` }), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: LINES.map((l) => SHORT[l.id]) }, yAxis: { type: 'value', name: 'A' }, series: [{ type: 'bar', name: 'Current', data: LINES.map((l) => ({ value: Math.round(live.get(`${l.id}.I`)), itemStyle: { color: LCOL[l.id], borderRadius: [4, 4, 0, 0] } })), barWidth: 26 }, { type: 'bar', name: 'Ampacity (DLR)', data: LINES.map((l) => Math.round(live.get(`${l.id}.AMP`))), barWidth: 26, itemStyle: { color: '#e2e8f0', borderRadius: [4, 4, 0, 0] } }] });
        ctx.chart('amp', amp()).then((i) => { c = i; });
        const ieee = () => ({ grid: ch.grid({ top: 26, bottom: 4 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'item', formatter: (p) => `${esc(p.seriesName)}<br/>${fmt.n(p.value[0], 0)} % loading → <b>${fmt.n(p.value[1], 1)} °C</b>` }, xAxis: { type: 'value', name: '% of rating', min: 30, max: 130 }, yAxis: { type: 'value', name: '°C', min: 20, max: 120 }, series: [{ type: 'line', name: 'IEEE 738 (wind 0.6 m/s, 35 °C)', showSymbol: false, smooth: true, data: Array.from({ length: 21 }, (_, i) => { const v = 30 + i * 5; return [v, +(28 + (v / 100) ** 2 * 52).toFixed(1)]; }), lineStyle: { color: '#0f172a', type: 'dashed', width: 1.5 }, itemStyle: { color: '#0f172a' }, markArea: { silent: true, itemStyle: { color: 'rgba(220,38,38,.06)' }, data: [[{ yAxis: 75 }, { yAxis: 120 }]] } }, ...LINES.map((l) => ({ type: 'scatter', name: SHORT[l.id], symbolSize: 13, itemStyle: { color: LCOL[l.id], borderColor: '#fff', borderWidth: 2 }, data: [[+(live.get(`${l.id}.LOAD`)).toFixed(1), +(live.get(`${l.id}.TC`)).toFixed(1)]] }))] });
        let ie = null; ctx.chart('ieee', ieee()).then((i) => { ie = i; });
        ctx.on('click', '#thp tr[data-row]', (e, tr) => lineDrawer(LINE[tr.dataset.row]));
        ctx.onLive(() => { stripUpdate(a, tc); stripUpdate(b, sg); if (c && !c.isDisposed()) c.setOption({ series: amp().series.map((s) => ({ data: s.data })) }); if (ie && !ie.isDisposed()) ie.setOption({ series: ieee().series }); });
      },
    },
  ],
});

/* ---------------- 3. Outage Analytics */
const causeStack = CAUSES.map((c) => ({ name: c.name, data: byMonth(trips.filter((t) => t.cause === c.id)), color: c.color, stack: 'a' }));
screens.push({
  id: 'outages', name: 'Outage Analytics', icon: 'outage',
  tabs: [
    {
      name: 'Frequency', icon: 'trend',
      render: () => `<div class="nx-page">${ui.kpis([
        { label: 'SAIDI', value: fmt.n(SAIDI, 2), unit: 'min', icon: 'clock', tone: 'violet', delta: -8.4, deltaInvert: true, sub: 'Customer-minutes / customer · 12 mo', spark: byMonth(outages, (o) => (o.customers * o.durMin) / TOTAL_CUST) },
        { label: 'SAIFI', value: fmt.n(SAIFI, 3), icon: 'outage', tone: 'crit', delta: -5.1, deltaInvert: true, sub: 'Interruptions / customer', spark: byMonth(outages, (o) => o.customers / TOTAL_CUST) },
        { label: 'CAIDI', value: fmt.n(CAIDI, 0), unit: 'min', icon: 'history', tone: 'warn', sub: 'Mean restoration time', spark: byMonth(outages, (o) => o.durMin) },
        { label: 'MAIFI events', value: MAIFI, icon: 'zap', tone: 'info', sub: 'Momentary (successful reclose)', spark: byMonth(trips.filter((t) => !t.lockout)) },
        { label: 'Energy not supplied', value: fmt.n(ENS), unit: 'MWh', icon: 'loss', sub: `${fmt.money(ENS * 4200)} at VoLL $4.2k/MWh`, spark: byMonth(outages, (o) => o.ens) },
        { label: 'Circuit availability', value: fmt.n(100 - (outages.reduce((a, o) => a + o.durMin, 0) / (3 * 525600)) * 100, 3), unit: '%', icon: 'checkCircle', tone: 'ok', sub: 'Unplanned, 3 circuits' },
      ])}
      <div class="nx-row nx-c12">${chartCard('Line trips by month and cause', '12 months · stacked by probable cause from fault records and patrols', 'o-month', 'md', { cls: 'nx-s8' })}${chartCard('Cause mix', 'Share of all trips', 'o-cause', 'md', { cls: 'nx-s4' })}</div>
      ${card('Sustained outages (lockouts)', 'Customer impact, ENS and restoration · click for the fault record', ui.table({ id: 'ot', cols: [
        { label: 'Event', key: 'id', render: (e) => `<b>${e.id}</b><span class="nx-sub">${fmt.date(e.date)} ${e.time}</span>`, sort: (e) => e.date + e.time },
        { label: 'Circuit / structure', render: (e) => `${esc(e.line)}<span class="nx-sub">${esc(e.tower?.name || '')} · ${e.distKm} km</span>`, sort: (e) => e.line },
        { label: 'Cause', render: (e) => `<span style="color:${CAUSE[e.cause].color}">●</span> ${esc(CAUSE[e.cause].name)}`, sort: (e) => e.cause },
        { label: 'Duration', align: 'r', key: 'durMin', render: (e) => `${e.durMin} min` },
        { label: 'Customers', align: 'r', key: 'customers', render: (e) => fmt.n(e.customers) },
        { label: 'MW lost', align: 'r', key: 'mwLost', render: (e) => fmt.n(e.mwLost) },
        { label: 'ENS', align: 'r', key: 'ens', render: (e) => `${fmt.n(e.ens)} MWh` },
        { label: 'Severity', key: 'sev', render: (e) => sevBadge(e.sev) },
      ], rows: outages, rowId: (e) => e.id }), { flush: true })}</div>`,
      mount: (st, ctx) => {
        ctx.chart('o-month', ch.bar({ x: months.map(monLabel), series: causeStack, stack: true, yName: 'trips', tooltip: { valueFormatter: (v) => `${v} trip${v === 1 ? '' : 's'}` } }));
        ctx.chart('o-cause', ch.donut({ data: CAUSES.map((c) => ({ name: c.name, value: trips.filter((t) => t.cause === c.id).length, color: c.color })), center: 'trips', legend: 'right' }));
        ctx.on('click', '#ot tr[data-row]', (e, tr) => eventDrawer(events.find((x) => x.id === tr.dataset.row)));
      },
    },
    {
      name: 'Duration', icon: 'clock',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">${chartCard('Restoration time distribution', 'Sustained outages by duration band', 'd-hist', 'md', { cls: 'nx-s6' })}${chartCard('Duration by cause', 'Mean and longest restoration, minutes', 'd-cause', 'md', { cls: 'nx-s6' })}</div>
      <div class="nx-row nx-c12">${chartCard('SAIDI and CAIDI trend', 'Monthly · bars SAIDI (min), line CAIDI (min)', 'd-trend', 'md', { cls: 'nx-s8' })}${card('Longest outages', 'Top by customer-minutes · click for the fault record', `<div class="nx-list">${outages.filter((o) => o.customers > 0).sort((a, b) => b.customers * b.durMin - a.customers * a.durMin).slice(0, 6).map((o) => ui.li({ ic: 'outage', color: CAUSE[o.cause].color, title: `${o.line} · ${o.tower?.name} — ${CAUSE[o.cause].name}`, sub: `${fmt.date(o.date)} · ${fmt.n(o.customers)} customers · ${fmt.n(o.ens)} MWh`, end: `<b>${o.durMin} min</b>`, row: o.id })).join('')}</div><div style="margin-top:12px">${(() => { const d = outages.map((o) => o.durMin).sort((a, b) => a - b); return ui.stats([{ label: 'Median', value: `${d[Math.floor(d.length / 2)] ?? 0} min` }, { label: 'P90', value: `${d[Math.floor(d.length * 0.9)] ?? 0} min` }, { label: 'Longest', value: `${d[d.length - 1] ?? 0} min` }]); })()}</div>`, { cls: 'nx-s4' })}</div>
      <div class="nx-row nx-c12">${chartCard('Anatomy of each restoration', 'Every sustained outage split into fault location, patrol & travel, repair and re-energisation (from SOE and switching logs) · minutes', 'd-anat', 'lg', { cls: 'nx-s8' })}${chartCard('Customer-minutes by circuit', 'Share of 12-month customer-minutes lost', 'd-cm', 'lg', { cls: 'nx-s4' })}</div></div>`,
      mount: (st, ctx) => {
        const bands = [[0, 30], [30, 60], [60, 120], [120, 240], [240, 9999]]; const names = ['< 30 min', '30–60', '1–2 h', '2–4 h', '> 4 h'];
        ctx.chart('d-hist', ch.bar({ x: names, series: [{ name: 'Outages', data: bands.map(([a, b]) => outages.filter((o) => o.durMin >= a && o.durMin < b).length), color: '#8b5cf6' }], labels: true, tooltip: { valueFormatter: (v) => `${v} sustained outage${v === 1 ? '' : 's'}` } }));
        const cs = CAUSES.filter((c) => outages.some((o) => o.cause === c.id));
        ctx.chart('d-cause', ch.bar({ x: cs.map((c) => c.name), horizontal: true, series: [{ name: 'Mean', data: cs.map((c) => { const x = outages.filter((o) => o.cause === c.id); return Math.round(x.reduce((a, o) => a + o.durMin, 0) / x.length); }), color: '#3b82f6' }, { name: 'Longest', data: cs.map((c) => Math.max(...outages.filter((o) => o.cause === c.id).map((o) => o.durMin))), color: '#cbd5e1' }], yName: 'min', tooltip: { valueFormatter: (v) => `${v} min` } }));
        const saidi = byMonth(outages, (o) => (o.customers * o.durMin) / TOTAL_CUST); const ci = months.map((m) => { const x = outages.filter((o) => monthKey(o.date) === m && o.customers); const c = x.reduce((a, o) => a + o.customers, 0); return c ? Math.round(x.reduce((a, o) => a + o.customers * o.durMin, 0) / c) : null; });
        ctx.chart('d-trend', { grid: ch.grid(), tooltip: ch.tip(), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: months.map(monLabel) }, yAxis: [{ type: 'value', name: 'SAIDI min' }, { type: 'value', name: 'CAIDI min', splitLine: { show: false } }], series: [{ type: 'bar', name: 'SAIDI', data: saidi.map((v) => +v.toFixed(2)), itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }, barWidth: 18 }, { type: 'line', name: 'CAIDI', yAxisIndex: 1, data: ci, connectNulls: true, smooth: true, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' } }] });
        // restoration anatomy: stages are fixed shares of each outage's duration by cause (location → patrol → repair → re-energise)
        const SHARE = { lightning: [0.18, 0.42, 0.22, 0.18], insulator: [0.12, 0.3, 0.45, 0.13], vegetation: [0.14, 0.34, 0.4, 0.12], bird: [0.16, 0.4, 0.28, 0.16], conductor: [0.1, 0.22, 0.58, 0.1], wind: [0.2, 0.42, 0.22, 0.16], unknown: [0.22, 0.48, 0.12, 0.18] };
        const os = outages.slice().sort((a, b) => b.durMin - a.durMin);
        const stg = [['Fault location', '#94a3b8'], ['Patrol & travel', '#3b82f6'], ['Repair', '#f59e0b'], ['Re-energisation', '#16a34a']];
        ctx.chart('d-anat', ch.bar({ x: os.map((o) => `${o.id} · ${o.line}`), horizontal: true, stack: true, series: stg.map(([n, c], k) => ({ name: n, color: c, data: os.map((o) => Math.round(o.durMin * SHARE[o.cause][k])) })), tooltip: { valueFormatter: (v) => `${v} min` }, grid: { top: 30 } }), { onClick: (p) => eventDrawer(os[p.dataIndex]) });
        ctx.chart('d-cm', ch.donut({ data: LINES.map((l) => ({ name: SHORT[l.id], value: outages.filter((o) => o.line === l.id).reduce((a, o) => a + o.customers * o.durMin, 0), color: LCOL[l.id] })), center: 'cust-min' }));
        ctx.on('click', '[data-row]', (e, r) => { const ev = events.find((x) => x.id === r.dataset.row); if (ev) eventDrawer(ev); });
      },
    },
    {
      name: 'Assets', icon: 'tower',
      render: () => {
        const byTower = {}; trips.forEach((t) => { if (t.tower) (byTower[t.tower.id] ||= []).push(t); });
        const worst = Object.entries(byTower).map(([id, list]) => ({ t: net.towerById.get(id), list })).sort((a, b) => b.list.length - a.list.length || (a.t.hi ?? 100) - (b.t.hi ?? 100)).slice(0, 14);
        return `<div class="nx-page"><div class="nx-row nx-c12">${chartCard('Trip rate per 10 km', 'Line trips per 10 circuit-km over 12 months · short coastal/urban circuits with high keraunic level', 't-rate', 'md', { cls: 'nx-s5' })}${card('Fault locations (12 months)', 'Distance-to-fault from protection relays, mapped to structures', '<div id="fmap" class="nx-map" style="height:300px"></div>', { cls: 'nx-s7', flush: true })}</div>
        ${card('Worst-performing structures', 'Towers with repeat trips, joined to their inspection findings and health index', ui.table({ id: 'wt', cols: [
          { label: 'Tower', render: (r) => `<b>${r.t.name}</b><span class="nx-sub">${r.t.line} · ${esc(r.t.type || '')}</span>`, sort: (r) => r.t.name },
          { label: 'Trips', align: 'r', render: (r) => `<b>${r.list.length}</b>`, sort: (r) => r.list.length },
          { label: 'Lockouts', align: 'r', render: (r) => r.list.filter((x) => x.lockout).length, sort: (r) => r.list.filter((x) => x.lockout).length },
          { label: 'Dominant cause', render: (r) => { const c = CAUSE[r.list.map((x) => x.cause).sort((a, b) => r.list.filter((x) => x.cause === b).length - r.list.filter((x) => x.cause === a).length)[0]]; return `<span style="color:${c.color}">●</span> ${esc(c.name)}`; }, sort: false },
          { label: 'Open findings', align: 'r', render: (r) => r.t.open, sort: (r) => r.t.open },
          { label: 'Health index', align: 'r', render: (r) => ui.score(r.t.hi), sort: (r) => r.t.hi ?? 0 },
          { label: 'Risk', render: (r) => ui.badge(fmt.title(r.t.riskBand || 'n/a'), r.t.riskBand === 'critical' ? 'crit' : r.t.riskBand === 'high' ? 'high' : r.t.riskBand === 'medium' ? 'warn' : 'ok'), sort: (r) => r.t.risk ?? 0 },
        ], rows: worst, rowId: (r) => r.t.id }), { flush: true })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.chart('t-rate', ch.bar({ x: LINES.map((l) => SHORT[l.id]), series: [{ name: 'Trips / 100 km·yr', data: LINES.map((l) => ({ value: +((trips.filter((t) => t.line === l.id).length / l.lengthKm) * 10).toFixed(1), itemStyle: { color: LCOL[l.id], borderRadius: [4, 4, 0, 0] } })), labels: true }], labels: true, yName: 'per 10 km', tooltip: { valueFormatter: (v) => `${v} trips per 10 km · 12 mo` }, legend: false }));
        const byT = {}; trips.forEach((t) => { if (t.tower) byT[t.tower.id] = (byT[t.tower.id] || 0) + 1; });
        ctx.map('#fmap', { panel: false, layers: [...networkLayers(net, { showSubs: true }), { id: 'f', name: 'Fault locations', color: '#dc2626', points: Object.entries(byT).map(([id, n]) => { const t = net.towerById.get(id); return { id, lat: t.lat, lng: t.lng, size: 8 + n * 4, color: n >= 3 ? '#dc2626' : n === 2 ? '#ea580c' : '#f59e0b', tip: `${t.name} · ${n} trip(s) · HI ${t.hi ?? '—'}` }; }) }] });
        ctx.on('click', '#wt tr[data-row]', (e, tr) => towerDrawer(net.towerById.get(tr.dataset.row)));
      },
    },
  ],
});

/* ---------------- 4. Loss Analysis */
const monthLoss = months.map((m, i) => { const season = 1 + 0.18 * Math.cos(((i - 7) / 12) * 2 * Math.PI); const infeed = 820 * 720 * season * rf(0.97, 1.03) / 1000; const line = infeed * 0.0049 * season * rf(0.95, 1.05); const tx = infeed * 0.0042 * rf(0.97, 1.03); const corona = infeed * 0.0007 * (i % 12 >= 0 && [0, 1, 2, 10, 11].includes(new Date(`${m}-01T00:00:00Z`).getUTCMonth()) ? 1.6 : 0.8); return { m, infeed, line, tx, corona, other: infeed * 0.0006 }; });
screens.push({
  id: 'losses', name: 'Loss Analysis', icon: 'loss',
  tabs: [
    {
      name: 'Technical', icon: 'loss',
      render: () => {
        const cur = monthLoss[monthLoss.length - 2];
        return `<div class="nx-page">${ui.kpis([
          { label: 'Transmission losses', live: 'G04.SYS.LOSS', unit: 'MW', icon: 'loss', tone: 'crit', spark: histOf('G04.SYS.LOSS', 90), sparkColor: '#dc2626', sub: 'I²R + transformer, live' },
          { label: 'Loss ratio', live: 'G04.SYS.LOSSPCT', unit: '%', icon: 'gauge', tone: 'warn', sub: 'of 500 kV infeed · target ≤ 1.2 %', spark: histOf('G04.SYS.LOSSPCT', 90) },
          { label: `Energy lost · ${monLabel(cur.m)}`, value: fmt.n((cur.line + cur.tx + cur.corona + cur.other) * 1000, 0), unit: 'MWh', icon: 'bolt', tone: 'violet', sub: `${fmt.money((cur.line + cur.tx + cur.corona + cur.other) * 1000 * PRICE)} at $${PRICE}/MWh` },
          { label: 'Avoidable (re-dispatch)', value: '7.8', unit: '%', icon: 'ai', tone: 'ok', sub: 'Estimate · optimal tap / reactive dispatch study', exp: true },
        ])}
        <div class="nx-row nx-c12">${chartCard(`Energy balance — ${monLabel(cur.m)}`, 'GWh from 500 kV infeed to delivered energy · waterfall', 'wf', 'md', { cls: 'nx-s7' })}${chartCard('Loss contribution — live', 'MW by network element', 'lb', 'md', { cls: 'nx-s5' })}</div>
        ${chartCard('Energy flow — live', 'Sankey of real-time MW from the 500 kV infeed through both substations to demand and losses', 'sk', 'lg')}</div>`;
      },
      mount: (st, ctx) => {
        const cur = monthLoss[monthLoss.length - 2];
        const steps = [['500 kV infeed', cur.infeed, 'total'], ['S-2 transformers', -cur.tx * 0.6], ['L-220-03 I²R', -cur.line * 0.55], ['S-1 transformers', -cur.tx * 0.4], ['L-132-01 I²R', -cur.line * 0.2], ['L-500-01 I²R + corona', -(cur.line * 0.25 + cur.corona)], ['Station service', -cur.other], ['Delivered', 0, 'total']];
        let acc = 0; const base = []; const val = []; const colors = [];
        steps.forEach(([n, v, k], i) => { if (k === 'total') { const t = i === 0 ? v : acc; base.push(0); val.push(+t.toFixed(2)); colors.push(i === 0 ? '#3b82f6' : '#16a34a'); acc = t; } else { acc += v; base.push(+acc.toFixed(2)); val.push(+(-v).toFixed(3)); colors.push('#ef4444'); } });
        ctx.chart('wf', { grid: ch.grid({ top: 16 }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[1].name}<br/><b>${fmt.n(p[1].value, p[1].value < 10 ? 3 : 1)} GWh</b>` }, xAxis: { type: 'category', data: steps.map((s) => s[0]), axisLabel: { interval: 0, fontSize: 10.5, width: 80, overflow: 'break' } }, yAxis: { type: 'value', name: 'GWh', min: Math.floor(cur.infeed * 0.97) }, series: [{ type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, emphasis: { disabled: true } }, { type: 'bar', stack: 'w', data: val.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: 3 } })), label: { show: true, position: 'top', fontSize: 10, color: '#475569', formatter: (p) => fmt.n(p.value, p.value < 10 ? 2 : 0) } }] });
        const els = () => [...LINES.map((l) => [l.id, live.get(`${l.id}.LOSS`), LCOL[l.id]]), ...TX.map((t) => [t.id, live.get(`${t.id}.LOSS`), '#94a3b8'])].sort((a, b) => b[1] - a[1]);
        const lbOpt = () => { const e = els(); return ch.bar({ x: e.map((x) => x[0]), horizontal: true, series: [{ name: 'MW', data: e.map((x) => ({ value: +x[1].toFixed(3), itemStyle: { color: x[2], borderRadius: [0, 4, 4, 0] } })) }], yName: 'MW', legend: false, tooltip: { valueFormatter: (v) => `${fmt.n(v, 3)} MW` } }); };
        let lb = null; ctx.chart('lb', lbOpt()).then((i) => { lb = i; });
        const skOpt = () => {
          const g = (t) => +(+live.get(t)).toFixed(1);
          const t2 = TX.filter((t) => t.sub === 'SUB-S2'); const t1 = TX.filter((t) => t.sub === 'SUB-S1');
          const nodes = ['Inland 500 kV grid', 'S-2 500 kV', ...t2.map((t) => t.id), 'S-2 220 kV', 'S-2 demand', 'L-220-03', 'S-1 220 kV', ...t1.map((t) => t.id), 'S-1 132 kV', 'L-132-01 Coastal', 'F-11 Sumgait', 'F-12 Khirdalan', 'Losses'].map((n) => ({ name: n, itemStyle: { color: n === 'Losses' ? '#ef4444' : n.includes('500') ? '#a855f7' : n.includes('220') ? '#3b82f6' : n.includes('132') || n.startsWith('F-') ? '#14b8a6' : n.startsWith('TX') ? '#64748b' : '#0ea5e9' } }));
          const links = [{ source: 'Inland 500 kV grid', target: 'S-2 500 kV', value: g('L-500-01.MW') }, { source: 'S-2 500 kV', target: 'Losses', value: g('L-500-01.LOSS') + 0.01 },
            ...t2.flatMap((t) => [{ source: 'S-2 500 kV', target: t.id, value: g(`${t.id}.MVA`) * 0.97 }, { source: t.id, target: 'S-2 220 kV', value: g(`${t.id}.MVA`) * 0.97 - g(`${t.id}.LOSS`) }, { source: t.id, target: 'Losses', value: g(`${t.id}.LOSS`) }]),
            { source: 'S-2 220 kV', target: 'S-2 demand', value: g('G04.S2.LOAD') }, { source: 'S-2 220 kV', target: 'L-220-03', value: g('L-220-03.MW') }, { source: 'L-220-03', target: 'S-1 220 kV', value: g('L-220-03.MW') - g('L-220-03.LOSS') }, { source: 'L-220-03', target: 'Losses', value: g('L-220-03.LOSS') },
            ...t1.flatMap((t) => [{ source: 'S-1 220 kV', target: t.id, value: g(`${t.id}.MVA`) * 0.97 }, { source: t.id, target: 'S-1 132 kV', value: g(`${t.id}.MVA`) * 0.97 - g(`${t.id}.LOSS`) }, { source: t.id, target: 'Losses', value: g(`${t.id}.LOSS`) }]),
            { source: 'S-1 132 kV', target: 'L-132-01 Coastal', value: g('L-132-01.MW') }, { source: 'S-1 132 kV', target: 'F-11 Sumgait', value: g('G04.F11.MW') }, { source: 'S-1 132 kV', target: 'F-12 Khirdalan', value: g('G04.F12.MW') }].map((l) => ({ ...l, value: Math.max(0.01, +(+l.value).toFixed(2)) }));
          return { tooltip: { trigger: 'item', formatter: (p) => (p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}<br/><b>${fmt.n(p.data.value, 1)} MW</b>` : p.name) }, series: [{ type: 'sankey', left: 10, right: 120, top: 10, bottom: 10, nodeGap: 12, nodeWidth: 14, draggable: false, layoutIterations: 0, data: nodes, links, lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 }, label: { fontSize: 11, color: '#334155' }, emphasis: { focus: 'adjacency' } }] };
        };
        let sk = null; ctx.chart('sk', skOpt()).then((i) => { sk = i; });
        ctx.every(3000, () => { if (lb && !lb.isDisposed()) lb.setOption(lbOpt()); if (sk && !sk.isDisposed()) sk.setOption({ series: [{ links: skOpt().series[0].links }] }); });
      },
    },
    {
      name: 'Trend', icon: 'trend',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">${chartCard('Monthly technical losses', 'GWh by component · line = loss ratio %', 'lt', 'md', { cls: 'nx-s8' })}${chartCard('Corona loss vs humidity', 'L-500-01 quad bundle · fair vs foul weather', 'co', 'md', { cls: 'nx-s4' })}</div>
      ${chartCard('Losses against loading', 'L-220-03 hourly samples, 28 days · I²R grows with the square of current — losses rise ~45 % between 70 % and 85 % loading', 'll', 'lg')}</div>`,
      mount: (st, ctx) => {
        const x = monthLoss.map((m) => monLabel(m.m));
        ctx.chart('lt', { grid: ch.grid(), tooltip: ch.tip(), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: x }, yAxis: [{ type: 'value', name: 'GWh' }, { type: 'value', name: '%', splitLine: { show: false }, min: 0.8, max: 2 }], series: [['Line I²R', 'line', '#3b82f6'], ['Transformer', 'tx', '#64748b'], ['Corona', 'corona', '#a855f7'], ['Station service', 'other', '#cbd5e1']].map(([n, k, c]) => ({ type: 'bar', name: n, stack: 'a', data: monthLoss.map((m) => +m[k].toFixed(2)), itemStyle: { color: c } })).concat([{ type: 'line', name: 'Loss ratio', yAxisIndex: 1, smooth: true, data: monthLoss.map((m) => +(((m.line + m.tx + m.corona + m.other) / m.infeed) * 100).toFixed(2)), lineStyle: { color: '#ef4444', width: 2 }, itemStyle: { color: '#ef4444' } }]) });
        const hum = Array.from({ length: 12 }, (_, i) => 40 + i * 5);
        ctx.chart('co', ch.line({ x: hum.map((h) => `${h}%`), series: [{ name: 'Corona kW/km', data: hum.map((h) => +(0.6 + 0.00045 * Math.exp(h / 9.5)).toFixed(2)), color: '#a855f7', area: true }], yName: 'kW/km', legend: false, tooltip: { valueFormatter: (v) => `${fmt.n(v, 2)} kW/km` } }));
        const l = LINE['L-220-03']; const c = CONDUCTOR[220];
        const pts = hourly['L-220-03'].flat().map((v) => { const s = (v / 100) * l.rating; const i = (s * 1000) / (Math.sqrt(3) * 220); return [+v.toFixed(1), +(((3 * i * i * c.r * l.lengthKm) / 1e6) * (1 + (R() - 0.5) * 0.16 + (R() < 0.04 ? 0.25 : 0))).toFixed(3)]; });
        ctx.chart('ll', { grid: ch.grid({ top: 16 }), tooltip: { trigger: 'item', formatter: (p) => `${p.value[0]} % loading<br/><b>${p.value[1]} MW</b>` }, xAxis: { type: 'value', name: 'loading %', min: 30, max: 110 }, yAxis: { type: 'value', name: 'MW' }, visualMap: { show: false, dimension: 0, min: 40, max: 105, inRange: { color: ['#93c5fd', '#3b82f6', '#f59e0b', '#dc2626'] } }, series: [{ type: 'scatter', symbolSize: 5, data: pts, itemStyle: { opacity: 0.7 } }, { type: 'line', showSymbol: false, smooth: true, data: Array.from({ length: 17 }, (_, i) => { const v = 30 + i * 5; const s = (v / 100) * l.rating; const cur = (s * 1000) / (Math.sqrt(3) * 220); return [v, +((3 * cur * cur * c.r * l.lengthKm) / 1e6).toFixed(3)]; }), lineStyle: { color: '#0f172a', type: 'dashed', width: 1.5 }, name: 'I²R model' }] });
      },
    },
    {
      name: 'Constraints', icon: 'event',
      render: () => {
        const p = (t) => live.get(t);
        const t2 = TX.filter((t) => t.sub === 'SUB-S2'); const t1 = TX.filter((t) => t.sub === 'SUB-S1');
        const cont = [
          ...t2.map((t) => { const rest = t2.filter((x) => x.id !== t.id); const load = t2.reduce((a, x) => a + p(`${x.id}.MVA`), 0); const post = (load / rest.reduce((a, x) => a + x.rating, 0)) * 100; return { c: `Loss of ${t.id} (${t.rating} MVA)`, mon: rest.map((x) => x.id).join(' + '), pre: (p(`${rest[0].id}.MVA`) / rest[0].rating) * 100, post, act: post > 100 ? 'Shed S-2 220 kV demand block B' : 'Within emergency rating (120 %, 2 h)' }; }),
          ...t1.map((t) => { const rest = t1.filter((x) => x.id !== t.id); const load = t1.reduce((a, x) => a + p(`${x.id}.MVA`), 0); const post = (load / rest.reduce((a, x) => a + x.rating, 0)) * 100; return { c: `Loss of ${t.id} (${t.rating} MVA)`, mon: rest.map((x) => x.id).join(' + '), pre: (p(`${rest[0].id}.MVA`) / rest[0].rating) * 100, post, act: post > 100 ? 'Transfer F-12 to Absheron 110 kV' : 'Within emergency rating' }; }),
          { c: 'Loss of L-220-03', mon: 'S-1 supply', pre: p('L-220-03.LOAD'), post: 0, act: `S-1 islanded: ${fmt.n(p('L-220-03.MW'), 0)} MW at risk · special protection scheme sheds F-12, transfers F-11` },
          { c: 'Loss of L-500-01', mon: 'S-2 500 kV infeed', pre: p('L-500-01.LOAD'), post: 0, act: 'National grid N-1: re-dispatch via ICCP, Mingachevir 500 kV' },
        ];
        return `<div class="nx-page"><div class="nx-row nx-c12">${chartCard('Constraint hours by month', 'Hours a circuit operated above 90 % of static rating', 'ch', 'md', { cls: 'nx-s7' })}${chartCard('Congestion cost', 'Out-of-merit re-dispatch to relieve constraints, $k per month', 'cc', 'md', { cls: 'nx-s5' })}</div>
        ${card('N-1 contingency screen — live', 'Simulated post-contingency loading, recalculated from live flows each time this view opens (pro-rata re-share, not a validated EMS load-flow study)', ui.table({ cols: [
          { label: 'Contingency', key: 'c', render: (r) => `<b>${esc(r.c)}</b>` },
          { label: 'Monitored element', key: 'mon' },
          { label: 'Pre-contingency', align: 'r', key: 'pre', render: (r) => `${fmt.n(r.pre, 1)} %` },
          { label: 'Post-contingency', align: 'r', key: 'post', render: (r) => (r.post ? `<b style="color:${r.post > 100 ? '#dc2626' : r.post > 90 ? '#ea580c' : '#16a34a'}">${fmt.n(r.post, 1)} %</b>` : '<b style="color:#dc2626">Islanding</b>') },
          { label: 'Status', render: (r) => ui.badge(r.post > 100 || !r.post ? 'Violation' : r.post > 90 ? 'Alert' : 'Secure', r.post > 100 || !r.post ? 'crit' : r.post > 90 ? 'warn' : 'ok'), sort: (r) => r.post },
          { label: 'Remedial action', key: 'act', wrap: true },
        ], rows: cont }), { flush: true, })}
        <div class="nx-row nx-c12">${chartCard('Transformer N-1 margin — live', 'Post-contingency loading of the surviving units if each transformer trips · 100 % rating, 120 % two-hour emergency limit', 'n1', 'md', { cls: 'nx-s8', })}${chartCard('Constraint hours by circuit', 'Share of the 12-month constraint hours', 'chs', 'md', { cls: 'nx-s4' })}</div></div>`;
      },
      mount: (st, ctx) => {
        const data = []; const sev = { 'L-500-01': 0.4, 'L-220-03': 1, 'L-132-01': 0.55 };
        months.forEach((m, i) => LINES.forEach((l, j) => { const mo = new Date(`${m}-01T00:00:00Z`).getUTCMonth(); const summer = [5, 6, 7, 8].includes(mo) ? 1 : mo === 4 || mo === 9 ? 0.45 : 0.12; data.push([i, j, Math.round(summer * sev[l.id] * rf(55, 120))]); }));
        data.filter((d) => d[0] === 11).forEach((d) => { d[2] = hotHours[LINES[d[1]].id]; });
        ctx.chart('ch', ch.heat({ x: months.map(monLabel), y: LINES.map((l) => SHORT[l.id]), data, label: true, colors: ['#f8fafc', '#fde68a', '#fb923c', '#b91c1c'], fmtv: (v) => `${v} h`, grid: { left: 8 } }));
        ctx.chart('cc', ch.bar({ x: months.map(monLabel), series: [{ name: '$k', data: months.map((m, i) => data.filter((d) => d[0] === i).reduce((a, d) => a + d[2], 0) * 0.42).map((v) => +v.toFixed(0)), color: '#f59e0b' }], yName: '$k', legend: false, tooltip: { valueFormatter: (v) => `$${fmt.n(v)}k` } }));
        ctx.chart('chs', ch.donut({ data: LINES.map((l, j) => ({ name: SHORT[l.id], value: data.filter((d) => d[1] === j).reduce((a, d) => a + d[2], 0), color: LCOL[l.id] })), center: 'hours' }));
        const n1 = () => ch.bar({ x: TX.map((t) => `Loss of ${t.id}`), series: [{ name: 'Post-contingency loading', data: TX.map((t) => { const v = +(live.get(`G04.N1.${t.id}`) || 0).toFixed(1); return { value: v, itemStyle: { color: v > 120 ? '#b91c1c' : v > 100 ? '#ea580c' : '#16a34a', borderRadius: [4, 4, 0, 0] } }; }), markLine: { symbol: 'none', silent: true, data: [{ yAxis: 100, lineStyle: { color: '#ea580c', type: 'dashed' }, label: { formatter: '100 %', fontSize: 10, position: 'insideEndTop' } }, { yAxis: 120, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: '120 % · 2 h', fontSize: 10, position: 'insideEndTop' } }] } }], legend: false, labels: true, yName: '% of rating', tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} % of remaining rating` } });
        let n1i = null; ctx.chart('n1', n1()).then((i) => { n1i = i; }); ctx.every(2000, () => { if (n1i && !n1i.isDisposed()) n1i.setOption({ series: n1().series }); });
        ctx.on('click', '[data-chart="n1"]', () => {});
      },
    },
  ],
});

/* ---------------- 5. Grid Events */
const SOE_TEMPLATES = [
  () => ({ cat: 'switching', text: `S-1 TX-1${'ABC'[ri(0, 2)]} OLTC tap ${ri(8, 12)} → ${ri(8, 12)} (AVR)`, src: 'S-1 RTU' }),
  () => ({ cat: 'voltage', text: `S-2 220 kV busbar ${fmt.n(live.get('SUB-S2.BUS220'), 1)} kV — AVR set-point 222 kV`, src: 'EMS' }),
  () => ({ cat: 'thermal', text: `L-220-03 loading ${fmt.n(live.get('L-220-03.LOAD'), 1)} % · DLR ${fmt.n(live.get('L-220-03.DLR'), 0)} MVA`, src: 'EMS DLR' }),
  () => ({ cat: 'comms', text: `S-${ri(1, 2)} RTU B heartbeat OK · standby link`, src: 'FEP' }),
  () => ({ cat: 'switching', text: 'R-1 500 kV shunt reactor in service (voltage control)', src: 'S-2 RTU' }),
  () => ({ cat: 'sf6', text: `S-1 GIS E03 Q0 SF₆ ${fmt.n(live.get('GIS.E03.CB.D') ?? 650, 0)} kPa — trend −0.3 %/day`, src: 'GIS monitor' }),
  () => ({ cat: 'trip', text: 'L-132-01 21 Z2 start, no trip (external fault cleared by F-11)', src: 'IED 7SA87' }),
];
screens.push({
  id: 'events', name: 'Grid Events', icon: 'event',
  tabs: [
    {
      name: 'Sequence of events', icon: 'pulse',
      render: () => {
        const last30 = events.filter((e) => daysBetween(e.date, AS) <= 30);
        return `<div class="nx-page">${ui.kpis([
          { label: 'Events · 30 days', value: last30.length, icon: 'event', sub: 'SOE + EMS alarms', spark: Array.from({ length: 10 }, (_, i) => events.filter((e) => daysBetween(e.date, AS) >= i * 3 && daysBetween(e.date, AS) < i * 3 + 3).length).reverse() },
          { label: 'Line trips · 30 days', value: last30.filter((e) => e.cat === 'trip').length, icon: 'outage', tone: 'crit', sub: `${last30.filter((e) => e.cat === 'trip' && e.lockout).length} lockouts` },
          { label: 'Thermal alarms · 30 days', value: last30.filter((e) => e.cat === 'thermal').length, icon: 'thermo', tone: 'warn', sub: `${l220Therm30.length} on L-220-03` },
          { label: 'Voltage excursions · 30 days', value: last30.filter((e) => e.cat === 'voltage').length, icon: 'zap', tone: 'info', sub: 'outside ±5 %' },
        ])}
        <div class="nx-row nx-c12">${card('Live sequence of events', 'Time-stamped (1 ms, IRIG-B) from IEDs, RTUs and EMS · newest first', `<div class="nx-toolbar" style="margin-bottom:8px">${ui.chips('soe', [['all', 'All'], ['trip', 'Protection', '#dc2626'], ['thermal', 'Thermal', '#ea580c'], ['voltage', 'Voltage', '#d97706'], ['switching', 'Switching', '#64748b'], ['sf6', 'SF₆', '#7c3aed'], ['comms', 'Comms', '#0284c7']], 'all')}</div><div class="grd-soe" id="soe"></div>`, { cls: 'nx-s7' })}${chartCard('Event timeline — 30 days', 'Each mark is one event, by circuit or station · size = customers affected', 'tl', 'xl', { cls: 'nx-s5' })}</div></div>`;
      },
      mount: (st, ctx) => {
        let filter = 'all';
        const rows = events.filter((e) => daysBetween(e.date, AS) <= 30).map((e) => ({ ts: `${e.date} ${e.time}.${String(ri(0, 999)).padStart(3, '0')}`, cat: e.cat, text: `${e.type} — ${where(e)}${e.cause ? ` · ${CAUSE[e.cause].name}` : ''}${e.peak ? ` · peak ${fmt.n(e.peak, 1)} %` : ''}`, src: e.relay || (e.cat === 'thermal' ? 'EMS' : 'RTU'), id: e.id }));
        const paint = (fresh) => { st.querySelector('#soe').innerHTML = rows.filter((r) => filter === 'all' || r.cat === filter).slice(0, 80).map((r, i) => `<div class="${i === 0 && fresh ? 'is-new' : ''}"${r.id ? ` data-row="${r.id}" style="cursor:pointer"` : ''}><span class="t">${esc(r.ts)}</span><span>${ui.badge(r.cat === 'trip' ? 'PROT' : r.cat.toUpperCase(), catTone[r.cat])}</span><span class="x">${esc(r.text)}</span><span class="t" style="text-align:right">${esc(r.src)}</span></div>`).join(''); };
        paint();
        ctx.every(4500, () => { const t = SOE_TEMPLATES[ri(0, SOE_TEMPLATES.length - 1)](); const d = new Date(); rows.unshift({ ts: `${AS} ${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`, cat: t.cat, text: t.text, src: t.src }); paint(true); });
        ctx.onPick('soe', (v) => { filter = v; paint(); });
        ctx.on('click', '#soe [data-row]', (e, r) => eventDrawer(events.find((x) => x.id === r.dataset.row)));
        const cats = ['L-500-01', 'L-220-03', 'L-132-01', 'S-1', 'S-2'];
        const yOf = (e) => (e.line ? cats.indexOf(e.line) : e.sub === 'SUB-S1' ? 3 : 4);
        const ev30 = events.filter((e) => daysBetween(e.date, AS) <= 30);
        ctx.chart('tl', { grid: ch.grid({ top: 34, left: 10 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'item', formatter: (p) => `${esc(p.data.e.type)}<br/>${esc(where(p.data.e))}<br/>${fmt.date(p.data.e.date)} ${p.data.e.time}` }, xAxis: { type: 'time', min: `${addDays(AS, -30)}T00:00:00Z`, max: `${addDays(AS, 1)}T00:00:00Z`, axisLabel: { formatter: '{dd} {MMM}' } }, yAxis: { type: 'category', data: cats, inverse: true }, series: ['trip', 'thermal', 'voltage', 'sf6', 'comms', 'switching'].map((c) => ({ type: 'scatter', name: fmt.title(c === 'sf6' ? 'SF6' : c), data: ev30.filter((e) => e.cat === c).map((e) => ({ value: [`${e.date}T${e.time}Z`, yOf(e)], e, symbolSize: e.customers ? 10 + Math.sqrt(e.customers) / 12 : 10 })), symbol: c === 'trip' ? 'diamond' : 'circle', itemStyle: { color: { trip: '#dc2626', thermal: '#ea580c', voltage: '#d97706', sf6: '#7c3aed', comms: '#0284c7', switching: '#94a3b8' }[c], opacity: 0.85 } })) }, { onClick: (p) => p.data?.e && eventDrawer(p.data.e) });
      },
    },
    {
      name: 'Defect × stress correlation', icon: 'ai', 
      render: () => {
        const pairs = l220Find.map((f) => { const t = towerStress.find((x) => x.id === f.tower_id); const ev = events.filter((e) => e.cat === 'thermal' && e.line === 'L-220-03' && daysBetween(e.date, AS) <= 30); const maxE = Math.max(...towerStress.filter((x) => x.line === 'L-220-03').map((x) => x.exposure)); const pri = Math.round(100 * (0.45 * (t ? t.exposure / maxE : 0) + 0.35 * ((100 - (t?.hi ?? 100)) / 70) + 0.2 * (f.severity === 'critical' ? 1 : 0.6)) * (THERMAL_CLASSES.has(f.defect_class) ? 1.15 : 0.85)); return { f, t, n: ev.length, peak: Math.max(0, ...ev.map((e) => e.peak)), pri: Math.min(100, pri) }; }).filter((p) => p.t).sort((a, b) => b.pri - a.pri);
        return `<div class="nx-page">${ui.hero({ kicker: 'operational output', icon: 'ai', text: `High-priority findings on 220 kV corridor correlated with recent thermal loading operational events: <b>${l220Find.length} verified critical/high findings</b> on L-220-03 sit on a circuit that logged <b>${l220Therm30.length} thermal alarms</b> (peak ${fmt.n(Math.max(0, ...l220Therm30.map((e) => e.peak)), 1)} %) in 30 days. ${hotFind.length} are thermally sensitive — prioritise before the next heat event.`, meta: [{ label: 'Pearson r (stress vs condition)', value: fmt.n(rStress, 2) }, { label: 'L-220-03 hours > 90 %', value: hotHours['L-220-03'] }] })}
        <div class="nx-row nx-c12">${chartCard('Thermal stress exposure vs structure condition', 'Each dot is a tower · x = loading-weighted hot-hours (28 d) · y = 100 − health index · size = open findings', 'sc', 'lg', { cls: 'nx-s7', tools: ui.seg('scl', [['L-220-03', 'L-220-03'], ['all', 'All lines']], 'L-220-03') })}${chartCard('Defect classes on high- vs low-stress structures', 'Verified findings, split at the median exposure', 'dc', 'lg', { cls: 'nx-s5' })}</div>
        ${card('Findings to act on before the next thermal event', 'Verified critical/high findings on L-220-03, ranked by thermal exposure', ui.table({ id: 'cp', cols: [
          { label: 'Finding', render: (p) => `<b>${esc(p.f.label)}</b><span class="nx-sub">${p.f.finding_id} · ${fmt.date(p.f.date)}</span>`, sort: (p) => p.f.label },
          { label: 'Tower', render: (p) => `<b>${p.t.name}</b><span class="nx-sub">${esc(p.t.type || '')} · zone ${p.t.zone}</span>`, sort: (p) => p.t.name },
          { label: 'Severity', render: (p) => sevBadge(p.f.severity), sort: (p) => p.f.condition_score },
          { label: 'Thermal-sensitive', render: (p) => (THERMAL_CLASSES.has(p.f.defect_class) ? ui.badge('Yes', 'high') : ui.badge('No', 'muted')), sort: (p) => (THERMAL_CLASSES.has(p.f.defect_class) ? 1 : 0) },
          { label: 'Exposure (h)', align: 'r', render: (p) => `<b>${p.t.exposure}</b>`, sort: (p) => p.t.exposure },
          { label: 'Health index', align: 'r', render: (p) => ui.score(p.t.hi), sort: (p) => p.t.hi },
          { label: 'Action priority', align: 'r', render: (p) => `<b style="color:${p.pri >= 60 ? '#dc2626' : p.pri >= 35 ? '#ea580c' : '#64748b'}">${p.pri}</b>`, sort: (p) => p.pri },
        ], rows: pairs, rowId: (p) => p.f.finding_id }), { flush: true, exp: true })}</div>`;
      },
      mount: (st, ctx) => {
        const draw = (which) => {
          const ts = towerStress.filter((t) => t.hi != null && (which === 'all' || t.line === which));
          const bySev = (s) => ts.filter((t) => (s === 'none' ? !t.open : t.open && SEV_ORDER(t) === s));
          function SEV_ORDER(t) { const w = t.worst; return w <= 1 ? 'critical' : w === 2 ? 'high' : w === 3 ? 'medium' : 'low'; }
          const xs = ts.map((t) => t.exposure); const ys = ts.map((t) => 100 - t.hi);
          const n = xs.length; const mx = xs.reduce((a, b) => a + b, 0) / n; const my = ys.reduce((a, b) => a + b, 0) / n; const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1); const a0 = my - b * mx; const xmax = Math.max(...xs);
          ctx.chart('sc', { grid: ch.grid({ top: 34 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'item', formatter: (p) => (p.data?.t ? `<b>${p.data.t.name}</b> · ${p.data.t.line}<br/>Exposure ${p.data.t.exposure} h · HI ${p.data.t.hi}<br/>${p.data.t.open} open findings (${p.data.t.thermalF} thermal-sensitive)` : '') }, xAxis: { type: 'value', name: 'thermal exposure, h', scale: true }, yAxis: { type: 'value', name: '100 − HI', min: 0 }, series: [...['critical', 'high', 'medium', 'low', 'none'].map((s) => ({ type: 'scatter', name: s === 'none' ? 'No open finding' : fmt.title(s), data: bySev(s).map((t) => ({ value: [t.exposure, +(100 - t.hi).toFixed(1)], t, symbolSize: 7 + Math.min(14, t.open * 2.5) })), itemStyle: { color: s === 'none' ? '#cbd5e1' : SEV[s], opacity: 0.85, borderColor: '#fff', borderWidth: 1 } })), { type: 'line', name: `Trend (r = ${fmt.n(pearson(xs, ys), 2)})`, showSymbol: false, data: [[Math.min(...xs), +(a0 + b * Math.min(...xs)).toFixed(1)], [xmax, +(a0 + b * xmax).toFixed(1)]], lineStyle: { color: '#0f172a', type: 'dashed', width: 1.5 }, itemStyle: { color: '#0f172a' } }] }, { onClick: (p) => p.data?.t && toast(`${p.data.t.name}: ${p.data.t.open} open findings · exposure ${p.data.t.exposure} h`, 'warn') });
          const med = [...xs].sort((p, q) => p - q)[Math.floor(n / 2)];
          const hiSet = new Set(ts.filter((t) => t.exposure >= med).map((t) => t.id));
          const fs = net.findings.filter((f) => f.review_status === 'confirmed' && f.tower_id && ts.some((t) => t.id === f.tower_id));
          const cls = [...new Set(fs.map((f) => f.defect_class))].map((c) => ({ c, hi: fs.filter((f) => f.defect_class === c && hiSet.has(f.tower_id)).length, lo: fs.filter((f) => f.defect_class === c && !hiSet.has(f.tower_id)).length })).sort((p, q) => (q.hi + q.lo) - (p.hi + p.lo)).slice(0, 10);
          ctx.chart('dc', ch.bar({ x: cls.map((c) => DEFECT_LABEL[c.c] || c.c), horizontal: true, stack: true, series: [{ name: 'High-stress towers', data: cls.map((c) => c.hi), color: '#ea580c' }, { name: 'Low-stress towers', data: cls.map((c) => c.lo), color: '#93c5fd' }] }));
        };
        draw('L-220-03');
        ctx.onPick('scl', draw);
        ctx.on('click', '#cp tr[data-row]', (e, tr) => { const f = net.findingById.get(tr.dataset.row); const ev = trips.find((x) => x.tower?.id === f.tower_id) || l220Therm30[0]; if (ev) eventDrawer(ev.tower ? ev : { ...ev, tower: net.towerById.get(f.tower_id) }); });
      },
    },
    {
      name: 'Event log', icon: 'doc',
      render: () => `<div class="nx-page">${card('Operational event log — 12 months', `${events.length} records · SOE, EMS alarms, planned switching · click a row for the record`, `<div class="nx-toolbar" style="margin-bottom:10px">${ui.search('#elog', 'Search events, towers, causes…')}${ui.btn('Export CSV', { ic: 'download', attrs: 'data-csv', sm: true })}</div>${ui.table({ id: 'elog', cols: [
        { label: 'ID', key: 'id', render: (e) => `<b class="nx-mono" style="font-size:12px">${e.id}</b>` },
        { label: 'Date / time', render: (e) => `${fmt.date(e.date)} <span class="nx-sub">${e.time}</span>`, sort: (e) => e.date + e.time },
        { label: 'Class', render: (e) => ui.badge(fmt.title(e.cat === 'sf6' ? 'SF6' : e.cat), catTone[e.cat]), sort: (e) => e.cat },
        { label: 'Event', key: 'type' },
        { label: 'Asset', render: (e) => esc(where(e)), sort: (e) => where(e) },
        { label: 'Cause', render: (e) => (e.cause ? esc(CAUSE[e.cause].name) : '—'), sort: (e) => e.cause || '' },
        { label: 'Duration', align: 'r', key: 'durMin', render: (e) => (e.durMin ? `${e.durMin} min` : '—') },
        { label: 'Customers', align: 'r', key: 'customers', render: (e) => (e.customers ? fmt.n(e.customers) : '—') },
        { label: 'Severity', key: 'sev', render: (e) => sevBadge(e.sev) },
      ], rows: events, rowId: (e) => e.id, max: 500 })}`, { attrs: 'style="min-height:0"' })}</div>`,
      mount: (st, ctx) => {
        ctx.on('click', '#elog tr[data-row]', (e, tr) => eventDrawer(events.find((x) => x.id === tr.dataset.row)));
        ctx.on('click', '[data-csv]', () => { const head = 'id,date,time,class,event,asset,cause,duration_min,customers,ens_mwh'; const body = events.map((e) => [e.id, e.date, e.time, e.cat, `"${e.type}"`, `"${where(e)}"`, e.cause || '', e.durMin, e.customers, e.ens].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' })); a.download = 'grid-events.csv'; a.click(); toast('Event log exported (CSV)'); });
      },
    },
  ],
});

/* ---------------- 6. Reliability Trends */
const lineHiHist = LINES.map((l) => ({ l, pts: net.snap.dates.map((d) => { try { return healthIndex(net.snap.ctx, l.id, d).score; } catch { return null; } }) }));
const quarters = ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26', 'Q4 26'];
const qWin = [months.slice(1, 4), months.slice(4, 7), months.slice(7, 10), [months[0], ...months.slice(10)]]; // Q1..Q4 2026 (Q4 = Dec 25 + Oct–Nov 26)
const qReal = qWin.map((w) => outages.filter((o) => w.includes(monthKey(o.date))));
const qSaidiR = qReal.map((l) => l.reduce((a, o) => a + o.customers * o.durMin, 0) / TOTAL_CUST);
const qSaifiR = qReal.map((l) => l.reduce((a, o) => a + o.customers, 0) / TOTAL_CUST);
const prior = [1.18, 1.31, 1.12, 1.24];
const qSaidi = [...qSaidiR.map((v, i) => Math.max(0.6, v) * prior[i]), ...qSaidiR].map((v) => +v.toFixed(2));
const qSaifi = [...qSaifiR.map((v, i) => Math.max(0.006, v) * prior[i]), ...qSaifiR].map((v) => +v.toFixed(3));
const qTarget = +((qSaidi.slice(0, 4).reduce((a, b) => a + b, 0) / 4) * 0.95).toFixed(1);
const qTargetF = +((qSaifi.slice(0, 4).reduce((a, b) => a + b, 0) / 4) * 0.95).toFixed(3);
screens.push({
  id: 'trends', name: 'Reliability Trends', icon: 'trend',
  tabs: [
    {
      name: 'Quarter', icon: 'calendar',
      render: () => `<div class="nx-page">${ui.kpis([
        { label: 'SAIDI · Q3 2026', value: fmt.n(qSaidi[6], 2), unit: 'min', icon: 'clock', tone: 'violet', delta: ((qSaidi[6] - qSaidi[2]) / qSaidi[2]) * 100, deltaInvert: true, sub: 'vs same quarter last year', spark: qSaidi },
        { label: 'SAIFI · Q3 2026', value: fmt.n(qSaifi[6], 3), icon: 'outage', tone: 'crit', delta: ((qSaifi[6] - qSaifi[2]) / qSaifi[2]) * 100, deltaInvert: true, sub: 'vs same quarter last year', spark: qSaifi },
        { label: 'Network health index', value: fmt.n(LINES.reduce((a, l) => a + l.hi * l.lengthKm, 0) / LINES.reduce((a, l) => a + l.lengthKm, 0), 1), icon: 'shield', tone: 'ok', sub: 'Length-weighted, 3 circuits', spark: net.snap.dates.map((d, i) => lineHiHist.reduce((a, x) => a + (x.pts[i] ?? 0) * x.l.lengthKm, 0) / LINES.reduce((a, l) => a + l.lengthKm, 0)) },
        { label: 'Open verified findings', value: net.findings.filter((f) => f.review_status === 'confirmed').length - net.repairs.reduce((a, r) => a + r.closes_finding_ids.length, 0), icon: 'camera', tone: 'warn', sub: 'from Module 02 inspections' },
      ])}
      <div class="nx-row nx-c12">${chartCard('SAIDI and SAIFI by quarter', `Against regulatory targets (SAIDI ${qTarget} min, SAIFI ${qTargetF} per quarter) · 2026 measured, 2025 from annual report`, 'q', 'md', { cls: 'nx-s7' })}${chartCard('Circuit health index by inspection campaign', 'Computed by the Module 01 scoring engine at each campaign close', 'hih', 'md', { cls: 'nx-s5' })}</div>
      ${chartCard('Trips per 10 km by quarter', 'Per circuit · 2026 measured from trip records, 2025 scaled by the annual-report ratio used for SAIDI · lower is better', 'tq', 'md')}</div>`,
      mount: (st, ctx) => {
        ctx.chart('q', { grid: ch.grid(), tooltip: ch.tip(), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: quarters }, yAxis: [{ type: 'value', name: 'SAIDI min' }, { type: 'value', name: 'SAIFI', splitLine: { show: false } }], series: [{ type: 'bar', name: 'SAIDI', data: qSaidi, itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }, barWidth: 22, markLine: { symbol: 'none', data: [{ yAxis: qTarget }], lineStyle: { color: '#8b5cf6', type: 'dashed' }, label: { formatter: 'target', fontSize: 10 } } }, { type: 'line', name: 'SAIFI', yAxisIndex: 1, data: qSaifi, smooth: true, lineStyle: { color: '#ef4444', width: 2 }, itemStyle: { color: '#ef4444' }, markLine: { symbol: 'none', data: [{ yAxis: qTargetF }], lineStyle: { color: '#ef4444', type: 'dotted' }, label: { show: false } } }] });
        ctx.chart('hih', ch.line({ x: net.snap.dates.map((d) => fmt.short(d)), series: lineHiHist.map((x) => ({ name: SHORT[x.l.id], data: x.pts.map((v) => (v == null ? null : +v.toFixed(1))), color: LCOL[x.l.id], symbol: true, smooth: false })), yName: 'HI', tooltip: { valueFormatter: (v) => (v == null ? '—' : `HI ${fmt.n(v, 1)}`) } }));
        const q26 = (l, i) => trips.filter((t) => t.line === l.id && qWin[i].includes(monthKey(t.date))).length;
        const tq = LINES.map((l) => ({ name: SHORT[l.id], color: LCOL[l.id], data: quarters.map((q, i) => +((((i < 4 ? q26(l, i) * prior[i] : q26(l, i - 4))) / l.lengthKm) * 10).toFixed(2)) }));
        ctx.chart('tq', ch.bar({ x: quarters, series: tq, yName: 'trips / 10 km', tooltip: { valueFormatter: (v) => `${fmt.n(v, 2)} trips per 10 km` } }));
      },
    },
    {
      name: 'Defect link', icon: 'link',
      render: () => `<div class="nx-page">${ui.callout(`Does inspection evidence lead protection trips? The lead-lag chart tests it directly: Pearson r between monthly verified findings and trips <i>k</i> months later (12 months of records, so treat |r| &lt; 0.5 as weak). Insulator and conductor-hardware findings explain <b>${fmt.n((trips.filter((t) => ['insulator', 'conductor'].includes(t.cause)).length / trips.length) * 100, 0)} %</b> of trips — the defect classes Module 02 detects best.`, 'info', 'ai')}
      <div class="nx-row nx-c12">${chartCard('Findings opened vs line trips', 'Monthly · bars verified findings by severity, line trips', 'dl', 'lg', { cls: 'nx-s8' })}${chartCard('Lead-lag correlation', 'Correlation of monthly findings with trips k months later', 'lag', 'lg', { cls: 'nx-s4', exp: true })}</div>
      ${chartCard('Trip causes vs open findings of the matching class', 'Where inspection evidence and protection records agree', 'match', 'md')}</div>`,
      mount: (st, ctx) => {
        const fm = (sev) => months.map((m) => net.findings.filter((f) => f.date && monthKey(f.date) === m && f.review_status !== 'rejected' && f.severity === sev).length);
        const tm = byMonth(trips);
        ctx.chart('dl', { grid: ch.grid(), tooltip: ch.tip(), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: months.map(monLabel) }, yAxis: [{ type: 'value', name: 'findings' }, { type: 'value', name: 'trips', splitLine: { show: false } }], series: [...['critical', 'high', 'medium', 'low'].map((s) => ({ type: 'bar', name: fmt.title(s), stack: 'f', data: fm(s), itemStyle: { color: SEV[s] } })), { type: 'line', name: 'Line trips', yAxisIndex: 1, data: tm, smooth: false, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#0f172a', width: 2.5 }, itemStyle: { color: '#0f172a' } }] });
        const tot = months.map((_, i) => ['critical', 'high', 'medium', 'low'].reduce((a, s) => a + fm(s)[i], 0));
        const lags = [0, 1, 2, 3, 4].map((k) => { const xs = tot.slice(0, 12 - k); const ys = tm.slice(k); const r = pearson(xs, ys); return Number.isFinite(r) ? +r.toFixed(2) : 0; });
        ctx.chart('lag', ch.bar({ x: lags.map((_, k) => `+${k} mo`), series: [{ name: 'r', data: lags.map((v) => ({ value: v, itemStyle: { color: v > 0.3 ? '#2563eb' : '#cbd5e1', borderRadius: [4, 4, 0, 0] } })) }], labels: true, legend: false, yName: 'Pearson r', tooltip: { valueFormatter: (v) => `r = ${fmt.n(v, 2)} (n = 12 months)` } }));
        const cs = CAUSES.filter((c) => c.classes.length);
        ctx.chart('match', ch.bar({ x: cs.map((c) => c.name), series: [{ name: 'Trips (12 mo)', data: cs.map((c) => trips.filter((t) => t.cause === c.id).length), color: '#0f172a' }, { name: 'Open findings of matching class', data: cs.map((c) => net.findings.filter((f) => c.classes.includes(f.defect_class) && f.review_status !== 'rejected').length), color: '#f59e0b' }], tooltip: { valueFormatter: (v) => `${v}` } }));
      },
    },
    {
      name: 'Corridors', icon: 'layers',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">${chartCard('Corridor scorecard', 'Five reliability dimensions, 0–100 (higher is better)', 'radar', 'xl', { cls: 'nx-s5' })}<div class="nx-s7" style="display:flex;flex-direction:column;gap:16px">${LINES.map((l) => { const t = trips.filter((x) => x.line === l.id); return `<section class="nx-card grd-zone" data-line="${l.id}" style="cursor:pointer"><h4><span style="color:${LCOL[l.id]}">■</span> Corridor ${esc(l.corridor)} · ${esc(l.id)}</h4><p>${l.kv} kV · ${l.lengthKm} km · commissioned ${l.install?.slice(0, 4)} · ${l.towers.length} towers</p>${ui.stats([{ label: 'Health index', value: fmt.n(l.hi, 1), color: healthColor(l.hi) }, { label: 'Trips 12 mo', value: t.length }, { label: 'Lockouts', value: t.filter((x) => x.lockout).length }, { label: 'Hot hours 28 d', value: hotHours[l.id] }, { label: 'Poor structures', value: l.bandCounts?.tower?.poor ?? 0, color: (l.bandCounts?.tower?.poor ?? 0) ? '#dc2626' : undefined }])}</section>`; }).join('')}${card('Weakest structure per corridor', 'Lowest health index on each circuit · click for the structure record', `<div class="nx-list">${LINES.map((l) => { const w = l.towers.filter((t) => t.hi != null).sort((a, b) => a.hi - b.hi)[0]; return w ? ui.li({ ic: 'tower', color: healthColor(w.hi), title: `${w.name} · ${l.id}`, sub: `${esc(w.type || '')} · zone ${esc(w.zone || '—')} · ${w.open} open findings · ${trips.filter((x) => x.tower?.id === w.id).length} trips`, end: ui.score(w.hi), row: w.id }) : ''; }).join('')}</div>`)}</div></div>${chartCard('Customer-minutes lost by corridor', 'Monthly sustained-outage impact per corridor, 12 months · thousands of customer-minutes', 'cmc', 'md')}</div>`,
      mount: (st, ctx) => {
        ctx.on('click', '[data-line]', (e, r) => lineDrawer(LINE[r.dataset.line]));
        ctx.on('click', '.nx-li[data-row]', (e, r) => towerDrawer(net.towerById.get(r.dataset.row)));
        ctx.chart('cmc', ch.bar({ x: months.map(monLabel), stack: true, series: LINES.map((l) => ({ name: `Corridor ${l.corridor}`, color: LCOL[l.id], data: months.map((m) => +(outages.filter((o) => o.line === l.id && monthKey(o.date) === m).reduce((a, o) => a + o.customers * o.durMin, 0) / 1000).toFixed(1)) })), yName: 'k cust-min', tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)}k customer-minutes` } }));
        const dims = ['Asset health', 'Loading margin', 'Trip performance', 'Restoration', 'Defect backlog'];
        const score = (l) => { const t = trips.filter((x) => x.line === l.id); const lo = t.filter((x) => x.lockout); return [l.hi, Math.max(0, 100 - hotHours[l.id] * 1.2), Math.max(0, 100 - (t.length / l.lengthKm) * 60), Math.max(0, 100 - (lo.reduce((a, x) => a + x.durMin, 0) / Math.max(1, lo.length)) / 3), Math.max(0, 100 - net.findings.filter((f) => f.line === l.id && f.review_status !== 'rejected').length / 2)].map((v) => +v.toFixed(0)); };
        ctx.chart('radar', { legend: { bottom: 0 }, tooltip: {}, radar: { indicator: dims.map((n) => ({ name: n, max: 100 })), radius: '64%', center: ['50%', '48%'], axisName: { color: '#475569', fontSize: 11 }, splitArea: { areaStyle: { color: ['#f8fafc', '#fff'] } } }, series: [{ type: 'radar', data: LINES.map((l) => ({ name: SHORT[l.id], value: score(l), lineStyle: { color: LCOL[l.id], width: 2 }, itemStyle: { color: LCOL[l.id] }, areaStyle: { color: `${LCOL[l.id]}22` } })) }] });
      },
    },
  ],
});

/* ---------------- 7. Network Schematics */
function oneLine() {
  const W = 1640; const H = 940;
  const yT = 300; const yB = 640; const yLine = 110;
  let s = '';
  // vertical chain of devices between y1 and y2 at x; devices: [{t:'ds'|'cb', id, label}]
  const chain = (x, y1, y2, devs, kv, net) => {
    const dir = y2 > y1 ? 1 : -1; const n = devs.length; const span = Math.abs(y2 - y1); const step = span / (n + 1);
    let prev = y1; let out = '';
    devs.forEach((d, i) => {
      const yc = y1 + dir * step * (i + 1);
      out += sx.wire([[x, prev], [x, yc - dir * 14]], { kv, net });
      out += d.t === 'cb' ? sx.cb(x, yc, d.id, { kv, net, label: d.label }) : sx.ds(x, yc, d.id, { kv, net, label: d.label });
      prev = yc + dir * 14;
    });
    out += sx.wire([[x, prev], [x, y2]], { kv, net });
    return out;
  };
  // substations outlines
  s += `<rect x="70" y="200" width="700" height="520" rx="10" fill="none" stroke="#1f2a3a" stroke-dasharray="6 6"/>${sx.text(84, 222, 'SUBSTATION S-1 · 220/132 kV · GIS 220 kV / AIS 132 kV', { cls: 'sx-tb' })}`;
  s += `<rect x="860" y="200" width="700" height="520" rx="10" fill="none" stroke="#1f2a3a" stroke-dasharray="6 6"/>${sx.text(874, 222, 'SUBSTATION S-2 · 500/220 kV · AIS', { cls: 'sx-tb' })}`;
  // busbars
  const busV = (x, y, tag) => `<rect class="sx-box" x="${x}" y="${y - 24}" width="74" height="18" rx="3"/><text x="${x + 50}" y="${y - 11}" class="sx-v" text-anchor="end" data-live="${tag}">—</text>${sx.text(x + 68, y - 11, 'kV', { cls: 'sx-ts', anchor: 'end' })}`;
  s += sx.bus(100, 740, yT, { kv: 220, net: 'B220S1', label: 'S-1 220 kV BUSBAR', id: 'BB-S1-220' }) + busV(270, yT, 'SUB-S1.BUS220');
  s += sx.bus(100, 740, yB, { kv: 132, net: 'B132', label: 'S-1 132 kV BUSBAR', id: 'BB-S1-132' }) + busV(270, yB, 'SUB-S1.BUS132');
  s += sx.bus(880, 1540, yT, { kv: 220, net: 'B220S2', label: 'S-2 220 kV BUSBAR', id: 'BB-S2-220' }) + busV(1140, yT, 'SUB-S2.BUS220');
  s += sx.bus(880, 1540, yB, { kv: 500, net: 'B500', label: 'S-2 500 kV BUSBAR', id: 'BB-S2-500' }) + busV(1140, yB, 'SUB-S2.BUS500');
  // L-220-03 between S-2 and S-1 (flow S-2 → S-1)
  s += chain(940, yT, yLine, [{ t: 'ds', id: 'S2-L03-Q1', label: 'Q1' }, { t: 'cb', id: 'S2-L03-Q0', label: 'Q0' }, { t: 'ds', id: 'S2-L03-Q9', label: 'Q9' }], 220, 'L220');
  s += chain(680, yLine, yT, [{ t: 'ds', id: 'S1-L03-Q9', label: 'Q9' }, { t: 'cb', id: 'S1-L03-Q0', label: 'Q0' }, { t: 'ds', id: 'S1-L03-Q1', label: 'Q1' }], 220, 'L220S1');
  s += sx.wire([[940, yLine], [680, yLine]], { kv: 220, net: 'L220' });
  s += `<path class="sx-flow" d="M940 ${yT} L940 ${yLine} L680 ${yLine} L680 ${yT}" style="stroke:#e2f3ff" data-live-flow="L-220-03.MW" data-net="L220F"/>`;
  s += sx.es(680, 135, 'S1-L03-Q8', { dir: -1, label: 'Q8' }) + sx.es(940, 135, 'S2-L03-Q8', { dir: 1, label: 'Q8' });
  s += sx.ct(680, 268) + sx.ct(940, 268) + sx.relay(630, 268, '21', { from: [674, 268], label: 'Distance' }) + sx.relay(990, 268, '21', { from: [946, 268], label: '87L' }) + sx.vt(680, 128, { dir: 1 });
  s += `<g class="sx-hit" data-eq="L-220-03"><rect class="sx-halo" x="720" y="60" width="200" height="108" rx="6"/>${sx.text(810, 82, 'L-220-03 · CORRIDOR NORTH', { cls: 'sx-tb', anchor: 'middle' })}${sx.text(810, 96, '220 kV · 22.4 km · twin ACSR 400/51', { cls: 'sx-ts', anchor: 'middle' })}</g>`;
  s += sx.readout(735, 128, [['P', 'L-220-03.MW', 'MW'], ['Q', 'L-220-03.MVAR', 'Mvar'], ['I', 'L-220-03.I', 'A'], ['Load', 'L-220-03.LOAD', '%']], { w: 150, accent: '#3b82f6' });
  // S-1 transformers (220 top → 132 bottom)
  const t1 = TX.filter((t) => t.sub === 'SUB-S1'); const t1x = [210, 380, 550];
  t1.forEach((t, i) => {
    const x = t1x[i]; const k = t.id.slice(-2);
    s += chain(x, yT, 396, [{ t: 'ds', id: `S1-T${k}-Q1`, label: 'Q1' }, { t: 'cb', id: `S1-T${k}-Q0H`, label: 'Q0' }], 220, `T${k}`);
    s += sx.xfmr(x, 430, t.id, { kv1: 220, kv2: 132, label: t.id, sub: `${t.rating} MVA · YNyn0`, net1: `T${k}`, net2: `T${k}` });
    s += chain(x, 464, yB, [{ t: 'cb', id: `S1-T${k}-Q0L`, label: 'Q0' }, { t: 'ds', id: `S1-T${k}-Q2`, label: 'Q1' }], 132, `T${k}`);
    s += `<path class="sx-flow" d="M${x} ${yT} L${x} ${yB}" style="stroke:#e2f3ff" data-live-flow="${t.id}.MVA" data-net="T${k}"/>`;
    s += sx.relay(x - 40, 430, '87T', { from: [x - 18, 430] });
    s += sx.readout(x + 26, 468, [['S', `${t.id}.MVA`, 'MVA'], ['TOT', `${t.id}.TOT`, '°C'], ['HST', `${t.id}.HST`, '°C'], ['Tap', `${t.id}.TAP`, '']], { w: 116 });
  });
  // S-1 132 kV feeders
  const fds = [{ x: 150, id: 'L132', tag: 'L-132-01.MW', name: 'L-132-01', sub: 'Coastal · 12.9 km' }, { x: 330, id: 'F11', tag: 'G04.F11.MW', name: 'F-11', sub: 'Sumgait 132 kV' }, { x: 500, id: 'F12', tag: 'G04.F12.MW', name: 'F-12', sub: 'Khirdalan 132 kV' }];
  fds.forEach((f) => {
    s += chain(f.x, yB, 790, [{ t: 'ds', id: `S1-${f.id}-Q1`, label: 'Q1' }, { t: 'cb', id: `S1-${f.id}-Q0`, label: 'Q0' }], 132, f.id);
    s += sx.lineExit(f.x, 790, { kv: 132, net: f.id, dir: 1, label: f.name, sub: f.sub });
    s += `<path class="sx-flow" d="M${f.x} ${yB} L${f.x} 830" style="stroke:#e2f3ff" data-live-flow="${f.tag}" data-net="${f.id}"/>`;
    s += `<text x="${f.x + 14}" y="826" class="sx-v" data-live="${f.tag}">—</text>${sx.text(f.x + 50, 826, 'MW', { cls: 'sx-ts' })}`;
    s += sx.relay(f.x - 34, 712, f.id === 'L132' ? '21' : '51', { from: [f.x - 6, 712] });
  });
  s += chain(680, yB, 720, [{ t: 'cb', id: 'S1-C1-Q0', label: 'Q0' }], 132, 'CAP');
  s += sx.cap(680, 720, 'C-1', { label: 'C-1 40 Mvar' }) + `<text x="700" y="770" class="sx-v" data-live="G04.CAP.MVAR">—</text>`;
  // S-2 transformers (220 top, 500 bottom; flow 500 → 220 upward)
  const t2 = TX.filter((t) => t.sub === 'SUB-S2'); const t2x = [1090, 1260, 1430];
  t2.forEach((t, i) => {
    const x = t2x[i]; const k = t.id.slice(-2);
    s += chain(x, yB, 464, [{ t: 'ds', id: `S2-T${k}-Q1`, label: 'Q1' }, { t: 'cb', id: `S2-T${k}-Q0H`, label: 'Q0' }], 500, `T${k}`);
    s += sx.xfmr(x, 430, t.id, { kv1: 220, kv2: 500, label: t.id, sub: `${t.rating} MVA · YNa0d11`, net1: `T${k}`, net2: `T${k}` });
    s += chain(x, 396, yT, [{ t: 'cb', id: `S2-T${k}-Q0L`, label: 'Q0' }, { t: 'ds', id: `S2-T${k}-Q2`, label: 'Q1' }], 220, `T${k}`);
    s += `<path class="sx-flow" d="M${x} ${yB} L${x} ${yT}" style="stroke:#e2f3ff" data-live-flow="${t.id}.MVA" data-net="T${k}"/>`;
    s += sx.relay(x - 40, 430, '87T', { from: [x - 18, 430] });
    s += sx.readout(x + 26, 468, [['S', `${t.id}.MVA`, 'MVA'], ['TOT', `${t.id}.TOT`, '°C'], ['HST', `${t.id}.HST`, '°C'], ['H₂', `${t.id}.H2`, 'ppm']], { w: 116 });
  });
  // S-2 local 220 kV load
  s += chain(1520, yT, 230, [{ t: 'cb', id: 'S2-LD-Q0', label: 'Q0' }], 220, 'S2LD');
  s += sx.lineExit(1520, 230, { kv: 220, net: 'S2LD', dir: -1, label: 'S-2 demand', sub: '220 kV feeders' }) + `<text x="1460" y="150" class="sx-v" data-live="G04.S2.LOAD">—</text>${sx.text(1500, 150, 'MW', { cls: 'sx-ts' })}`;
  // L-500-01 infeed (from below)
  s += chain(960, 800, yB, [{ t: 'ds', id: 'S2-L01-Q9', label: 'Q9' }, { t: 'cb', id: 'S2-L01-Q0', label: 'Q0' }, { t: 'ds', id: 'S2-L01-Q1', label: 'Q1' }], 500, 'L500');
  s += sx.lineExit(960, 800, { kv: 500, net: 'L500', dir: 1, label: 'L-500-01 · Inland', sub: 'from national 500 kV grid' });
  s += `<path class="sx-flow" d="M960 840 L960 ${yB}" style="stroke:#e2f3ff" data-live-flow="L-500-01.MW" data-net="L500"/>`;
  s += sx.es(960, 787, 'S2-L01-Q8', { dir: 1, label: 'Q8' }) + sx.ct(960, 700) + sx.relay(910, 700, '21', { from: [954, 700], label: '87L' }) + sx.la(960, 792, { dir: -1 });
  s += sx.readout(1040, 790, [['P', 'L-500-01.MW', 'MW'], ['I', 'L-500-01.I', 'A'], ['U', 'L-500-01.KV', 'kV'], ['Load', 'L-500-01.LOAD', '%']], { w: 140, accent: '#a855f7' });
  // 500 kV shunt reactor
  s += chain(1500, yB, 730, [{ t: 'cb', id: 'S2-R1-Q0', label: 'Q0' }], 500, 'R1');
  s += sx.reactor(1500, 742, 'R-1', { label: 'R-1 90 Mvar' }) + sx.earth(1500, 778);
  // bus info
  s += sx.text(100, yT + 30, 'f =', { cls: 'sx-ts' }) + `<text x="122" y="${yT + 30}" class="sx-v" data-live="SUB-S1.F">—</text>${sx.text(170, yT + 30, 'Hz', { cls: 'sx-ts' })}`;
  s += sx.text(880, yT + 30, 'f =', { cls: 'sx-ts' }) + `<text x="902" y="${yT + 30}" class="sx-v" data-live="SUB-S2.F">—</text>${sx.text(950, yT + 30, 'Hz', { cls: 'sx-ts' })}`;
  s += sx.text(560, 890, 'δ(S-1 ↔ S-2) =', { cls: 'sx-ts' }) + `<text x="650" y="890" class="sx-v" data-live="G04.PMU.ANG">—</text>${sx.text(690, 890, '° (PMU)', { cls: 'sx-ts' })}`;
  s += sx.frame(W, H, { title: 'TRANSMISSION NETWORK OVERVIEW · S-1 / S-2', dno: 'NX-GRD-SLD-0004', rev: 'D' });
  return { W, H, s, t1, t2, fds };
}

function gisPid() {
  const W = 1640; const H = 920;
  let s = '';
  const bays = [{ id: 'E01', name: 'E01 · L-220-03 line bay' }, { id: 'E02', name: 'E02 · TX-1A transformer bay' }, { id: 'E03', name: 'E03 · TX-1B transformer bay' }, { id: 'E04', name: 'E04 · TX-1C transformer bay' }, { id: 'E05', name: 'E05 · bus coupler' }];
  const x0 = 120; const bw = 250;
  s += sx.text(300, 46, 'S-1 220 kV GIS — SF₆ GAS-DENSITY MONITORING (IEC 62271-203)', { cls: 'sx-tb', size: 13 });
  s += sx.text(300, 62, 'Density at 20 °C, kPa abs · CB compartments rated 700 / alarm-1 640 / alarm-2 (block) 620 · others rated 500 / 450 / 430', { cls: 'sx-ts' });
  // busbar gas zones
  [['BB1', 110], ['BB2', 165]].forEach(([b, y]) => {
    s += `<g class="sx-hit" data-eq="GIS.${b}"><rect class="sx-halo" x="${x0 - 30}" y="${y - 22}" width="${bays.length * bw + 30}" height="44" rx="6"/><rect x="${x0 - 20}" y="${y - 14}" width="${bays.length * bw + 10}" height="28" rx="14" fill="#111823" stroke="#9aa8bb" stroke-width="1.5"/>${sx.text(x0 - 10, y + 4, `${b} BUSBAR GAS ZONE`, { cls: 'sx-ts', color: '#cbd5e1' })}<text x="${x0 + 210}" y="${y + 4}" class="sx-v" data-live="GIS.${b}.D">—</text>${sx.text(x0 + 252, y + 4, 'kPa', { cls: 'sx-ts' })}</g>`;
    for (let i = 1; i < bays.length; i += 1) s += `<line x1="${x0 + i * bw - 20}" y1="${y - 14}" x2="${x0 + i * bw - 20}" y2="${y + 14}" stroke="#f59e0b" stroke-width="3"/>`;
  });
  s += sx.text(x0 + bays.length * bw - 10, 98, '▮ barrier insulator', { cls: 'sx-ts', color: '#f59e0b' });
  const manifoldY = 690;
  bays.forEach((b, i) => {
    const bx = x0 + i * bw + 20;
    s += sx.text(bx, 222, b.name, { cls: 'sx-tb', size: 11 });
    const comps = [['DS', 'disconnector', 250], ['CB', 'circuit-breaker', 340], ['ES', 'earthing + CT', 450]];
    comps.forEach(([c, label, y]) => {
      const tag = `GIS.${b.id}.${c}.D`;
      s += `<g class="sx-hit" data-eq="GIS.${b.id}.${c}"><rect class="sx-halo" x="${bx - 6}" y="${y - 4}" width="98" height="${c === 'CB' ? 96 : 76}" rx="6"/><rect x="${bx}" y="${y}" width="86" height="${c === 'CB' ? 88 : 68}" rx="10" fill="#111823" stroke="#9aa8bb" stroke-width="1.5"/>${sx.text(bx + 43, y + 16, c === 'CB' ? 'Q0' : c === 'DS' ? 'Q1/Q2' : 'Q8/Q9', { cls: 'sx-tb', anchor: 'middle', size: 11 })}${sx.text(bx + 43, y + 29, label, { cls: 'sx-ts', anchor: 'middle', size: 8 })}<text x="${bx + 43}" y="${y + 50}" class="sx-v" text-anchor="middle" data-live="${tag}">—</text>${sx.text(bx + 43, y + 62, 'kPa @20 °C', { cls: 'sx-ts', anchor: 'middle', size: 8 })}</g>`;
      // density transmitter (ISA: DT) with signal
      s += sx.instr(bx + 130, y + 30, 'DT', `${i + 1}${c === 'CB' ? '2' : c === 'DS' ? '1' : '3'}`, { loc: 'dcs' });
      s += `<path class="sx-sig" d="M${bx + 86} ${y + 30} L${bx + 116} ${y + 30}"/>`;
      if (c === 'CB') {
        s += sx.instr(bx + 130, y + 72, 'PT', `${i + 1}2`, { loc: 'field' }) + sx.instr(bx + 186, y + 72, 'TT', `${i + 1}2`, { loc: 'field' });
        s += `<text x="${bx + 160}" y="${y + 100}" class="sx-v" data-live="GIS.${b.id}.CB.P" style="font-size:10px">—</text>${sx.text(bx + 196, y + 100, 'kPa', { cls: 'sx-ts' })}`;
        s += `<text x="${bx + 160}" y="${y + 113}" class="sx-v" data-live="GIS.${b.id}.CB.T" style="font-size:10px">—</text>${sx.text(bx + 196, y + 113, '°C', { cls: 'sx-ts' })}`;
      }
      // DN8 self-sealing coupling from each compartment to the bay service riser
      s += sx.pipe([[bx, y + 20], [bx - 14, y + 20]], { medium: 'gas', net: `FILL-${b.id}`, flow: `GIS.${b.id}.FILL`, ref: 1 });
    });
    // bay service valve & pipe to manifold
    const vx = bx + 40;
    s += sx.pipe([[bx - 14, 270], [bx - 14, 560], [vx, 560], [vx, manifoldY]], { medium: 'gas', flow: `GIS.${b.id}.FILL`, ref: 1, net: `FILL-${b.id}` });
    s += sx.valve(vx, 610, `V-${b.id}`, { vertical: true, label: `V-${b.id} DN8` });
  });
  // manifold and gas cart
  const cx = 700;
  s += sx.pipe([[x0 + 60, manifoldY], [x0 + (bays.length - 1) * bw + 60, manifoldY]], { medium: 'gas', flow: 'GIS.CART.FLOW', ref: 1, net: 'CART' });
  s += sx.pipe([[cx, manifoldY], [cx, 760]], { medium: 'gas', flow: 'GIS.CART.FLOW', ref: 1, net: 'CART' });
  s += sx.text(x0 + 60, manifoldY - 8, 'GAS SERVICE MANIFOLD · DN20', { cls: 'sx-ts' });
  s += sx.valve(cx, 735, 'V-CART', { vertical: true, label: 'V-CART' });
  s += `<rect x="${cx - 190}" y="770" width="420" height="120" rx="8" fill="none" stroke="#334155" stroke-dasharray="5 4"/>${sx.text(cx - 180, 788, 'SF₆ SERVICE CART · recovery / filling (closed-loop, EU 2024/573)', { cls: 'sx-ts', color: '#cbd5e1' })}`;
  s += sx.pipe([[cx, 760], [cx, 840], [cx - 40, 840]], { medium: 'gas', net: 'CART' });
  s += sx.filter(cx - 70, 840, 'CART-F', { label: 'Dryer/filter' });
  s += sx.pipe([[cx - 100, 840], [cx - 140, 840]], { medium: 'gas', net: 'CART' });
  s += sx.pump(cx - 160, 845, 'CART-C', { run: 'GIS.CART.RUN', label: 'Compressor' });
  s += sx.tank(cx + 60, 800, 46, 76, 'CART-TK', { level: 'GIS.CART.KG', max: 300, medium: 'gas', label: '', sub: '' });
  s += sx.text(cx + 83, 890, 'Storage kg', { cls: 'sx-ts', anchor: 'middle' });
  s += sx.pipe([[cx, 800], [cx + 60, 800]], { medium: 'gas', net: 'CART' });
  s += sx.instr(cx + 160, 830, 'WT', '01', { tag: 'GIS.CART.KG', unit: 'kg', loc: 'field', id: 'WT-01' });
  // leak summary panel
  s += `<rect class="sx-box" x="1390" y="200" width="200" height="150" rx="6"/>${sx.text(1402, 220, 'LEAK SUPERVISION', { cls: 'sx-tb', size: 11 })}${sx.text(1402, 240, 'E03 Q0 leak rate', { cls: 'sx-ts' })}<text x="1580" y="240" class="sx-v" text-anchor="end" data-live="GIS.E03.LEAK">—</text>${sx.text(1402, 256, 'IEC 62271-1 limit 0.5 %/yr', { cls: 'sx-ts' })}${sx.text(1402, 278, 'Inventory in service', { cls: 'sx-ts' })}<text x="1580" y="278" class="sx-v" text-anchor="end">1,842 kg</text>${sx.text(1402, 298, 'CO₂-eq (GWP 24,300)', { cls: 'sx-ts' })}<text x="1580" y="298" class="sx-v" text-anchor="end">44.8 kt</text>${sx.text(1402, 318, 'Alarm-1 forecast E03', { cls: 'sx-ts' })}<text x="1580" y="318" class="sx-v" text-anchor="end" data-live="GIS.E03.TTA">—</text>${sx.text(1402, 338, 'Open V-E03 + V-CART to top up', { cls: 'sx-ts', color: '#fbbf24' })}`;
  s += sx.frame(W, H, { title: 'S-1 220 kV GIS · SF₆ MONITORING P&ID', dno: 'NX-GRD-PID-0211', rev: 'B' });
  return { W, H, s, bays };
}

function defineGisTags(bays) {
  bays.forEach((b, i) => {
    for (const c of ['DS', 'CB', 'ES']) {
      const cb = c === 'CB';
      const leak = b.id === 'E03' && cb;
      live.define(`GIS.${b.id}.${c}.D`, { base: leak ? 638 : cb ? 702 - i : 506 - i * 0.6, v: leak ? 649 : undefined, noise: leak ? 0.12 : 0.18, rev: leak ? 0.004 : 0.15, dec: 0, unit: 'kPa', l: cb ? 640 : 450, ll: cb ? 620 : 430, desc: `S-1 GIS ${b.id} ${c === 'CB' ? 'Q0' : c === 'DS' ? 'Q1/Q2' : 'Q8/Q9'} SF₆ density` });
    }
    live.define(`GIS.${b.id}.CB.T`, { base: 23 + i * 0.4, noise: 0.05, rev: 0.05, dec: 1, unit: '°C', desc: `${b.id} Q0 gas temperature` });
    live.define(`GIS.${b.id}.CB.P`, { fn: () => live.get(`GIS.${b.id}.CB.D`) * ((273.15 + live.get(`GIS.${b.id}.CB.T`)) / 293.15), dec: 0, unit: 'kPa', desc: `${b.id} Q0 gas pressure (uncompensated)` });
    live.define(`GIS.${b.id}.FILL`, { base: 0, noise: 0, rev: 1, dec: 1, unit: 'kg/h', desc: `${b.id} fill flow` });
  });
  live.define('GIS.BB1.D', { base: 505, noise: 0.15, rev: 0.15, dec: 0, unit: 'kPa', l: 450, ll: 430, desc: 'S-1 GIS BB1 busbar SF₆ density' });
  live.define('GIS.BB2.D', { base: 503, noise: 0.15, rev: 0.15, dec: 0, unit: 'kPa', l: 450, ll: 430, desc: 'S-1 GIS BB2 busbar SF₆ density' });
  live.define('GIS.CART.KG', { base: 212, noise: 0.05, rev: 0.02, dec: 1, unit: 'kg', desc: 'Service cart SF₆ storage' });
  live.define('GIS.CART.RUN', { base: 0, noise: 0, rev: 1, dec: 0, desc: 'Cart compressor running' });
  live.define('GIS.CART.FLOW', { base: 0, noise: 0, rev: 1, dec: 1, unit: 'kg/h', desc: 'Cart flow' });
  live.define('GIS.E03.LEAK', { base: 1.84, noise: 0.02, rev: 0.1, dec: 2, unit: '%/yr', h: 0.5, desc: 'E03 Q0 SF₆ leak rate (IEC limit 0.5 %/yr)' });
  live.define('GIS.E03.TTA', { fn: () => { const v = live.get('GIS.E03.CB.D'); return v <= 640 ? 0 : (v - 640) / 0.35; }, dec: 0, unit: 'days', desc: 'Projected days to E03 alarm-1', fmt: (v) => (v <= 0 ? 'IN ALARM' : `${Math.round(v)} days`) });
}

screens.push({
  id: 'schematics', name: 'Network Schematics', icon: 'schematic', note: `${icon('info', 13)} Click any device for its faceplate · switching is simulation only (select-before-operate) ${ui.exp('Simulated', 'Switching on these diagrams is a simulation on demo data (topology tracing and pro-rata load sharing, no load-flow). Not validated against real data. Click for the model validation register.')}`,
  tabs: [
    {
      name: 'Transmission one-line (SCADA)', icon: 'bolt', full: true,
      render: () => '<div id="ol" class="nx-hmi is-full"></div>',
      mount: (st, ctx) => {
        const { W, H, s, t1, t2, fds } = oneLine();
        const eq = {}; const nets = {};
        const sw = (id, name, type, interlock) => { eq[id] = { name, type, switch: true, interlock }; };
        ['S2-L03', 'S1-L03'].forEach((p) => { const side = p.startsWith('S2') ? 'S-2' : 'S-1'; sw(`${p}-Q1`, `${side} L-220-03 busbar disconnector Q1`, 'Disconnector', 'Q0 open'); sw(`${p}-Q0`, `${side} L-220-03 circuit-breaker Q0`, 'SF₆ circuit-breaker 245 kV 3150 A 40 kA', 'Q1/Q9 not in transit'); sw(`${p}-Q9`, `${side} L-220-03 line disconnector Q9`, 'Disconnector', 'Q0 open'); sw(`${p}-Q8`, `${side} L-220-03 line earthing switch Q8`, 'Earthing switch', 'Q9 open + line dead'); });
        [...t1, ...t2].forEach((t) => { const k = t.id.slice(-2); const sub = t.sub === 'SUB-S1' ? 'S1' : 'S2'; [['Q1', 'HV disconnector'], ['Q0H', 'HV circuit-breaker'], ['Q0L', 'LV circuit-breaker'], ['Q2', 'LV disconnector']].forEach(([q, n]) => sw(`${sub}-T${k}-${q}`, `${t.id} ${n}`, n.includes('breaker') ? 'Circuit-breaker' : 'Disconnector')); eq[t.id] = { name: `${t.id} · ${t.rating} MVA ${t.ratio} kV`, type: `Power transformer · ${t.maker || ''}`, desc: `HI ${t.hi ?? '—'} · ${t.duval ? `Duval ${t.duval.zone} ${t.duval.label}` : 'DGA normal'}`, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }, { tag: `${t.id}.TOT`, label: 'Top-oil temperature' }, { tag: `${t.id}.HST`, label: 'Winding hot-spot' }, { tag: `${t.id}.H2`, label: 'Dissolved H₂' }, { tag: `${t.id}.C2H2`, label: 'Dissolved C₂H₂' }, { tag: `${t.id}.TAP`, label: 'OLTC tap' }] }; nets[`T${k}`] = { requires: [`${sub}-T${k}-Q1`, `${sub}-T${k}-Q0H`, `${sub}-T${k}-Q0L`, `${sub}-T${k}-Q2`], parent: sub === 'S1' ? 'B220S1' : 'B500', tags: [`${t.id}.MVA`] }; });
        fds.forEach((f) => { sw(`S1-${f.id}-Q1`, `${f.name} busbar disconnector`, 'Disconnector'); sw(`S1-${f.id}-Q0`, `${f.name} circuit-breaker`, 'Circuit-breaker 145 kV'); nets[f.id] = { requires: [`S1-${f.id}-Q1`, `S1-${f.id}-Q0`], parent: 'B132', tags: f.id === 'L132' ? ['L-132-01.MW', 'L-132-01.MVAR'] : [f.tag] }; });
        ['S2-L01-Q9', 'S2-L01-Q0', 'S2-L01-Q1'].forEach((q) => sw(q, `S-2 L-500-01 ${q.slice(-2)}`, q.endsWith('Q0') ? 'Circuit-breaker 550 kV 4000 A 63 kA' : 'Disconnector')); sw('S2-L01-Q8', 'S-2 L-500-01 line earthing switch', 'Earthing switch');
        sw('S1-C1-Q0', 'C-1 capacitor bank breaker', 'Circuit-breaker'); sw('S2-R1-Q0', 'R-1 shunt reactor breaker', 'Circuit-breaker 550 kV'); sw('S2-LD-Q0', 'S-2 220 kV demand feeder breaker', 'Circuit-breaker');
        eq['L-220-03'] = { name: 'L-220-03 Corridor North', type: 'Overhead line 220 kV', desc: '22.4 km · 60 towers · twin ACSR 400/51', tags: [{ tag: 'L-220-03.MW', label: 'Active power' }, { tag: 'L-220-03.LOAD', label: 'Loading' }, { tag: 'L-220-03.I', label: 'Current' }, { tag: 'L-220-03.TC', label: 'Conductor temperature' }, { tag: 'L-220-03.DLR', label: 'Dynamic rating' }] };
        ['BB-S1-220', 'BB-S1-132', 'BB-S2-220', 'BB-S2-500'].forEach((b) => { const sub = b.includes('S1') ? 'SUB-S1' : 'SUB-S2'; const kv = b.split('-')[2]; eq[b] = { name: `${sub === 'SUB-S1' ? 'S-1' : 'S-2'} ${kv} kV busbar`, type: 'Busbar', tags: [{ tag: `${sub}.BUS${kv}`, label: 'Voltage' }, { tag: `${sub}.F`, label: 'Frequency' }] }; });
        eq['C-1'] = { name: 'C-1 capacitor bank', type: '132 kV shunt capacitor, 40 Mvar', tags: [{ tag: 'G04.CAP.MVAR', label: 'Reactive output' }, { tag: 'SUB-S1.BUS132', label: 'Bus voltage' }] };
        eq['R-1'] = { name: 'R-1 shunt reactor', type: '500 kV shunt reactor, 90 Mvar', tags: [{ tag: 'G04.R5.MVAR', label: 'Reactive absorption' }, { tag: 'SUB-S2.BUS500', label: 'Bus voltage' }] };
        Object.assign(nets, {
          L500: { requires: ['S2-L01-Q9', 'S2-L01-Q0', 'S2-L01-Q1'], tags: ['L-500-01.MW', 'L-500-01.MVAR'] }, B500: { parent: 'L500' }, R1: { requires: ['S2-R1-Q0'], parent: 'B500', tags: ['G04.R5.MVAR'] },
          B220S2: { parent: t2.map((t) => `T${t.id.slice(-2)}`) }, S2LD: { requires: ['S2-LD-Q0'], parent: 'B220S2', tags: ['G04.S2.LOAD'] },
          L220: { requires: ['S2-L03-Q1', 'S2-L03-Q0', 'S2-L03-Q9'], parent: 'B220S2' }, L220S1: { requires: ['S1-L03-Q9', 'S1-L03-Q0', 'S1-L03-Q1'], parent: 'L220' }, L220F: { requires: ['S1-L03-Q9', 'S1-L03-Q0', 'S1-L03-Q1'], parent: 'L220', tags: ['L-220-03.MW', 'L-220-03.MVAR'] },
          B220S1: { parent: 'L220S1' }, B132: { parent: t1.map((t) => `T${t.id.slice(-2)}`) }, CAP: { requires: ['S1-C1-Q0'], parent: 'B132', tags: ['G04.CAP.MVAR'] },
        });
        const switches = {}; Object.keys(eq).forEach((k) => { if (eq[k].switch) switches[k] = k.endsWith('-Q8') ? 'open' : 'closed'; });
        const base = Object.fromEntries(TX.map((t) => [t.id, live.spec(`${t.id}.MVA`).base]));
        const allTags = Object.values(nets).flatMap((n) => n.tags || []);
        const h = ctx.hmi('#ol', {
          title: 'Transmission network overview', dno: 'NX-GRD-SLD-0004', rev: 'D', w: W, h: H, svg: s, equipment: eq, switches, nets,
          legend: [{ label: '500 kV', color: KV_COLOR[500] }, { label: '220 kV', color: KV_COLOR[220] }, { label: '132 kV', color: KV_COLOR[132] }, { label: 'De-energised', color: '#3a4658' }],
          toolbar: '<button type="button" data-ol="trip">Simulate L-220-03 trip</button><button type="button" data-ol="reset">Normal state</button>',
          onSwitch: () => redistribute(),
        });
        function redistribute() {
          for (const grp of [t1, t2]) {
            const sub = grp[0].sub === 'SUB-S1' ? 'S1' : 'S2';
            const alive = grp.filter((t) => ['Q1', 'Q0H', 'Q0L', 'Q2'].every((q) => (h.switches[`${sub}-T${t.id.slice(-2)}-${q}`] ?? 'closed') === 'closed'));
            const total = grp.reduce((a, t) => a + base[t.id], 0);
            const cap = alive.reduce((a, t) => a + t.rating, 0);
            for (const t of grp) live.setBase(`${t.id}.MVA`, alive.includes(t) ? (total * t.rating) / (cap || 1) : base[t.id]);
            if (alive.length < grp.length) toast(`${grp.length - alive.length} transformer(s) out at ${sub === 'S1' ? 'S-1' : 'S-2'} — load shared by ${alive.map((t) => t.id).join(', ') || 'none'}`, alive.length ? 'warn' : 'crit');
          }
        }
        ctx.on('click', '[data-ol]', (e, b) => {
          if (b.dataset.ol === 'trip') { h.set('S1-L03-Q0', 'open'); h.set('S2-L03-Q0', 'open'); toast('Simulated: L-220-03 tripped (21 Z1, both ends) — S-1 220 kV busbar de-energised', 'crit'); }
          else { Object.keys(switches).forEach((k) => h.set(k, switches[k])); redistribute(); toast('Network restored to normal switching state'); }
        });
        return () => { allTags.forEach((t) => live.force(t, null)); TX.forEach((t) => live.setBase(`${t.id}.MVA`, base[t.id])); };
      },
    },
    {
      name: 'GIS SF₆ monitoring (P&ID)', icon: 'radar', full: true, 
      render: () => '<div id="gis" class="nx-hmi is-full"></div>',
      mount: (st, ctx) => {
        const { W, H, s, bays } = gisPid();
        defineGisTags(bays);
        const eq = {}; const nets = {}; const switches = {};
        bays.forEach((b, i) => {
          for (const c of ['DS', 'CB', 'ES']) eq[`GIS.${b.id}.${c}`] = { name: `${b.name.split(' · ')[0]} ${c === 'CB' ? 'Q0 circuit-breaker' : c === 'DS' ? 'Q1/Q2 disconnector' : 'Q8/Q9 earthing + CT'} gas compartment`, type: `Density monitor DT-${i + 1}${c === 'CB' ? '2' : c === 'DS' ? '1' : '3'} · temperature-compensated`, desc: c === 'CB' ? 'Rated 700 kPa · alarm-1 640 · alarm-2 / CB block 620' : 'Rated 500 kPa · alarm-1 450 · alarm-2 430', tags: [{ tag: `GIS.${b.id}.${c}.D`, label: 'Density @20 °C' }, ...(c === 'CB' ? [{ tag: `GIS.${b.id}.CB.P`, label: 'Pressure' }, { tag: `GIS.${b.id}.CB.T`, label: 'Gas temperature' }] : [])] };
          eq[`V-${b.id}`] = { name: `${b.id} gas service valve`, type: 'DN8 self-sealing coupling valve', switch: true, kind: 'valve' };
          switches[`V-${b.id}`] = 'open';
          nets[`FILL-${b.id}`] = { requires: [`V-${b.id}`, 'V-CART'] };
        });
        eq['GIS.BB1'] = { name: 'BB1 busbar gas zone', type: 'Density monitor', tags: [{ tag: 'GIS.BB1.D', label: 'Density @20 °C' }] };
        eq['GIS.BB2'] = { name: 'BB2 busbar gas zone', type: 'Density monitor', tags: [{ tag: 'GIS.BB2.D', label: 'Density @20 °C' }] };
        eq['V-CART'] = { name: 'Service cart isolation valve', type: 'DN20 ball valve', switch: true, kind: 'valve' }; switches['V-CART'] = 'open';
        eq['CART-C'] = { name: 'Cart compressor', type: 'Oil-free SF₆ compressor', tags: [{ tag: 'GIS.CART.RUN', label: 'Running' }, { tag: 'GIS.CART.FLOW', label: 'Flow' }] };
        eq['CART-TK'] = { name: 'Cart storage vessel', type: '300 kg liquid SF₆', tags: [{ tag: 'GIS.CART.KG', label: 'Content' }] };
        eq['WT-01'] = eq['CART-TK'];
        nets.CART = { requires: ['V-CART'] };
        const h = ctx.hmi('#gis', {
          title: 'S-1 220 kV GIS · SF₆ density monitoring', dno: 'NX-GRD-PID-0211', rev: 'B', w: W, h: H, svg: s, equipment: eq, switches, nets,
          legend: [{ label: 'SF₆ gas line', color: '#a3e635' }, { label: 'Signal (4–20 mA / IEC 61850)', color: '#64748b' }, { label: 'Gas-zone barrier', color: '#f59e0b' }],
          onSwitch: () => {
            const open = (id) => h.switches[id] === 'closed';
            let any = false;
            bays.forEach((b) => { const fill = open(`V-${b.id}`) && open('V-CART'); any = any || fill; live.define(`GIS.${b.id}.FILL`, { base: fill ? 4.2 : 0 }); if (fill) live.define(`GIS.${b.id}.CB.D`, { base: 704, rev: 0.03 }); });
            live.define('GIS.CART.RUN', { base: any ? 1 : 0 }); live.define('GIS.CART.FLOW', { base: any ? 4.2 : 0 }); live.define('GIS.CART.KG', { base: any ? 150 : 212, rev: any ? 0.004 : 0.02 });
            if (any) toast('Topping-up in progress — compressor running, density rising toward 700 kPa');
          },
        });
        return () => { bays.forEach((b) => { live.define(`GIS.${b.id}.FILL`, { base: 0 }); }); live.define('GIS.CART.RUN', { base: 0 }); live.define('GIS.CART.FLOW', { base: 0 }); void h; };
      },
    },
    ...drawingTabs('grid'),
  ],
});

APP = mountApp({
  id: 'grid', code: '04', product: 'Energy & Grid Performance', back: '/#module-card-04', asOf: AS, screens,
  searchIndex: () => [
    ...LINES.map((l) => ({ label: l.name, sub: `Line performance · ${l.kv} kV`, icon: 'line', run: () => go('lines') })),
    ...TX.map((t) => ({ label: `${t.id} · ${t.rating} MVA`, sub: 'Open in network one-line', icon: 'transformer', run: () => go('schematics', 0) })),
    ...events.slice(0, 200).map((e) => ({ label: `${e.id} · ${e.type}`, sub: `${where(e)} · ${fmt.date(e.date)}`, icon: catIcon[e.cat], run: () => eventDrawer(e) })),
    { label: 'GIS SF₆ monitoring', sub: 'S-1 220 kV GIS P&ID', icon: 'radar', run: () => go('schematics', 1) },
    { label: 'N-1 contingency screen', sub: 'Loss analysis · constraints · simulated study', icon: 'event', run: () => go('losses', 2) },
  ],
});
