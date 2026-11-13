// Module 06 — Risk & Maintenance Forecasting.
// Forecasts are built on the asset HEALTH scores (health index HI, risk = (100 − HI) × criticality × consequence)
// and the 2026 inspection history in the shared network (network.js). The models are deliberately simple and explained
// on screen: an exponential HI decay per corrosion zone with age and open-defect multipliers, a storm-loss term,
// Weibull wear-out curves per tower family (β assumed, η derived from the findings), and Poisson demand bands for workload.
// : every model here is an engineering assumption running on simulated demo data. None has been tested
// against real data, so each predictive screen, card, KPI, popup and drawer carries / Simulated marker
// and every model is listed in the model validation register (models.register below).

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, healthColor, riskColor, SEV, addDays, daysBetween, rng } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, DEFECT_LABEL, SEV_TONE, LINE_NAME } from '../network.js';
import { drawingTabs } from '../drawings.js';
import { models, K_ZONE, hiDecayRate, projectHi } from '../models.js';

const net = await loadNetwork();
const AS_OF = net.asOf;
const R = rng(6060606);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

/* ================================================================== model validation register */
// Every predictive model or heuristic this module shows. All are and run on simulated demo data; none has
// been tested against real data. ('hi-decay' and 'risk-score' are registered centrally in models.js.)
const M06 = '06 · Risk & Maintenance Forecasting';
models.register([
  { id: 'fct-storm-loss', name: 'Storm-loss term', module: M06, predicts: 'Health-index points lost per year to severe wind and ice, added to the deterioration forecast', method: 'Fixed linear loss of 0.4 HI points per year × storm-frequency factor (× 0.85 below 220 kV). An assumed constant, not derived from outage or weather records.', needs: 'Storm-related damage and forced-outage records per line, with the matching weather history (wind, icing).' },
  { id: 'fct-hi-band', name: 'Forecast uncertainty band (P10–P90)', module: M06, predicts: 'P10 / P50 / P90 band around a tower’s projected health index and around the fleet risk-exposure trajectory', method: 'Re-runs the deterioration forecast with the decay rate (and, per tower, the storm loss) at ±30 %. The ±30 % is an assumption, not a measured confidence interval.', needs: 'Spread of observed health-index change between repeat inspections of the same towers.' },
  { id: 'fct-fast-decay', name: 'Fastest-deteriorating towers (early-warning list)', module: M06, predicts: 'Which towers lose health fastest and the years until each crosses its next health band', method: 'Ranks towers by forecast HI loss over 3 years (top 14 with a loss of 4 points or more); years-to-band steps the deterioration forecast month by month to the HI 70 / 40 threshold.', needs: 'Repeat inspection scores showing which towers actually changed band, and when.' },
  { id: 'fct-survival', name: 'Cohort survival and band-transition projection', module: M06, predicts: 'Share of towers still above HI 40 / HI 70 after t years, median years to band change, band flows and poor-band counts at +1, +3 and +5 years', method: 'Applies the deterioration forecast to every assessed tower with no intervention and counts towers per health band at each horizon. Not a statistical survival fit.', needs: 'Band-transition history from at least three years of repeat inspections.' },
  { id: 'fct-weibull', name: 'Weibull wear-out curves per tower family', module: M06, predicts: 'Survival R(t), hazard h(t), characteristic life η and mean time to first significant defect (MTTF) per tower family', method: 'Shape β fixed at 2.4 by assumption; η solved from one point per family: the share of towers with a confirmed condition ≤ 3 finding at the family’s mean age. MTTF = η·Γ(1+1/β).', needs: 'Dated first-defect and failure records per tower family (age at event, censored survivors) to fit β and η.' },
  { id: 'fct-recurrence', name: 'Defect incidence and recurrence', module: M06, predicts: 'Probability that a defect class seen on a tower is seen again in a later campaign; findings per 100 towers per campaign by component group', method: 'Observed shares from the three 2026 campaigns per tower family (tower × defect pairs present in more than one campaign), read as probabilities. Three campaigns only; repair status is not considered.', needs: 'Multi-year inspection findings linked to repair completion dates from the ERP work orders.' },
  { id: 'fct-rbi-interval', name: 'Risk-based inspection interval rule', module: M06, predicts: 'Inspection interval, next due date and overdue flag per tower; inspections per year and annual cost against a 12-month calendar', method: 'Lookup on the forecast risk band at +12 months (critical 3, high 6, medium 12, low 24 months; 36 for low-risk HI ≥ 90 towers in zone C2), capped at 12 months while findings are unreviewed; cost at an assumed $520 per tower visit.', needs: 'The asset owner’s agreed inspection policy, actual inspection costs, and defect-detection history by interval length.' },
  { id: 'fct-campaign', name: 'Inspection campaign proposal', module: M06, predicts: 'Towers per campaign block, flight days, review days, cost, risk captured as the campaign flies and expected detections by sensor', method: 'Takes every tower due within 120 days, groups by corridor and orders by forecast risk at an assumed 9 towers per drone-team day; detections use the 2026 findings-per-inspection rate and sensor mix of each corridor.', needs: 'Flown campaign logs (towers per day, weather stand-downs) and findings per sensor from real campaigns.' },
  { id: 'fct-workload', name: 'Corrective workload forecast (Poisson bands)', module: M06, predicts: 'New findings, work orders and corrective labour hours per corridor and quarter with a P10–P90 band; split by work type', method: 'Linear trend of findings per campaign blended 55/45 with the campaign mean and lifted by forecast HI loss, then × confirmed share × work orders per confirmed finding × mean hours per work order. Band from a normal approximation of an over-dispersed Poisson (φ ≈ 1.8, assumed).', needs: 'Three or more years of findings per campaign and the linked maintenance orders with confirmed labour hours from SAP PM.' },
  { id: 'fct-review-demand', name: 'Manual review demand', module: M06, predicts: 'Inspection findings needing manual engineering review next quarter (P50 and P90)', method: 'Forecast findings × the share of 2026 findings with detection confidence below 0.8 or still pending review; P90 from a Poisson-style spread (1.2816 × 1.3 × √n).', needs: 'Review-queue history: findings sent to manual review per campaign, and why.' },
  { id: 'fct-crew-demand', name: 'Crew demand and load forecast', module: M06, predicts: 'Labour demand by trade and by crew against capacity, forecast crew load, crew-weeks by zone and quarter', method: 'Forecast corrective hours × the historical labour mix by trade, shared equally between the crews of a trade; capacity = crew size × 36 h × 13 weeks × 32 % wrench time; crew load adds an assumed routine-work share scaled by current utilisation.', needs: 'Time confirmations per crew and trade from SAP PM, and measured wrench time.' },
  { id: 'fct-scenario', name: 'Fleet scenario simulator (what-if)', module: M06, predicts: 'Towers below normal condition, fleet risk exposure, corrective backlog, detection rate and restorations per year over 10 years for a budget / crews / corrosion / storm scenario; lever sensitivity and scenario cost', method: 'Yearly loop: every tower decays by the deterioration model; detection = inspection budget ÷ budget needed for the RBI programme (floor 25 %); crews restore the highest-risk detected towers below HI 70 to HI 88 at 0.45 restorations per crew-year. Cost at an assumed $410k per crew-year.', needs: 'Historical budgets, crew numbers, restorations completed and the resulting condition change, to check the simulator reproduces past years.' },
  { id: 'fct-live-risk', name: 'Live forecast-risk re-score (condition monitoring)', module: M06, predicts: 'Forecast risk of the watch-list tower, updated from live sensor values', method: 'Forecast risk at +12 months × (1 + 0.4 × (tower tilt − 0.45°)). An illustrative scaling on simulated telemetry.', needs: 'Sensor history alongside inspection outcomes for the monitored towers.' },
]);

/* ================================================================== style */
document.head.insertAdjacentHTML('beforeend', `<style id="fct-css">
.fct-map { height: 560px; }
.fct-side { display: flex; flex-direction: column; gap: 0; max-height: 560px; overflow: auto; }
.fct-sl { display: grid; grid-template-columns: 1fr 64px; gap: 4px 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--nx-line-2); }
.fct-sl:last-child { border-bottom: 0; }
.fct-sl label { font-size: 12.5px; font-weight: 600; color: var(--nx-ink); }
.fct-sl small { grid-column: 1 / -1; font-size: 11px; color: var(--nx-muted); }
.fct-sl output { text-align: right; font: 600 13px var(--nx-mono); color: var(--nx-accent-2); }
.fct-sl input[type=range] { grid-column: 1 / -1; width: 100%; accent-color: var(--nx-accent); }
.fct-formula { font: 12px var(--nx-mono); background: #f8fafc; color: #1e293b; border: 1px solid var(--nx-line); border-left: 3px solid var(--nx-accent); padding: 10px 12px; border-radius: 8px; line-height: 1.6; }
.fct-formula b { color: var(--nx-accent-2); font-weight: 700; }
.fct-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.fct-mini > div { background: #f8fafc; border: 1px solid var(--nx-line-2); border-radius: 10px; padding: 9px 11px; }
.fct-mini small { display: block; font-size: 11px; color: var(--nx-muted); }
.fct-mini b { display: block; font-size: 16px; font-variant-numeric: tabular-nums; margin-top: 2px; }
.fct-pill { display: inline-flex; gap: 6px; align-items: center; font-size: 11.5px; color: var(--nx-muted); }
.fct-pill i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.fct-due { font: 600 12px var(--nx-mono); }
.fct-arrow { color: var(--nx-faint); margin: 0 4px; }
</style>`);

/* ================================================================== deterioration model */
// Annual HI decay constant by ISO 9223 atmospheric corrosivity category of the tower site.
const ZONE_NAME = { C2: 'C2 · low (inland, dry)', C3: 'C3 · medium (urban/industrial)', C4: 'C4 · high (coastal, saline)', C5: 'C5 · very high' };
const FAMILY = (t) => `${t.type} · ${t.zone}`;
const BASE = { corrosion: 1, storm: 1, budget: 120, crews: net.crews.length };

// The decay model itself lives in models.js (shared with Asset 360 · Condition Trends in Module 01), next to its
// entry in the model validation register. It is until tested against real inspection history.
const rate = (t, s = BASE) => hiDecayRate(t, s);
/** Predicted health index y years from AS_OF (no intervention). */
const hiAt = (t, y, s = BASE) => projectHi(t, y, s);
const consOf = (t) => t.riskFactors?.consequence?.value ?? ({ 500: 5, 220: 4, 132: 3 }[t.kv] || 2);
const critOf = (t) => t.riskFactors?.criticality?.value ?? t.criticality ?? 3;
const riskOf = (t, hi) => (hi == null ? null : (100 - hi) * critOf(t) * consOf(t));
const riskBand = (r) => (r == null ? null : r >= 1000 ? 'critical' : r >= 500 ? 'high' : r >= 200 ? 'medium' : 'low');
const BR = { normal: 0, moderate: 1, poor: 2 };
const hiBand = (h) => (h == null ? null : h >= 70 ? 'normal' : h >= 40 ? 'moderate' : 'poor');
const RB_COLOR = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };
const RB_TONE = { critical: 'crit', high: 'high', medium: 'warn', low: 'ok' };
const HB_TONE = { normal: 'ok', moderate: 'warn', poor: 'crit' };

/* last inspection per tower from the 2026 campaigns */
const campaigns = [...net.all.campaigns].sort((a, b) => a.end.localeCompare(b.end));
const lastInsp = new Map();
for (const c of campaigns) for (const id of c.inspected_tower_ids || []) lastInsp.set(id, c.end);

/* risk-based inspection interval (months) */
function rbiMonths(t, r12) {
  if (t.hi == null) return 0;
  const rb = riskBand(r12);
  let m = { critical: 3, high: 6, medium: 12, low: 24 }[rb];
  if (rb === 'low' && t.hi >= 90 && t.zone === 'C2') m = 36;
  if (t.unreviewed > 0) m = Math.min(m, 12);
  return m;
}
const addMonths = (iso, m) => addDays(iso, Math.round(m * 30.44));

const towers = net.towers.map((t) => {
  const h12 = hiAt(t, 1); const h36 = hiAt(t, 3); const h60 = hiAt(t, 5);
  const r12 = riskOf(t, h12);
  const months = rbiMonths(t, r12);
  const last = lastInsp.get(t.id) || null;
  const due = last ? addMonths(last, months) : AS_OF;
  return { ...t, h12, h36, h60, r12, rb12: riskBand(r12), hb12: hiBand(h12), crosses: t.hi != null && BR[hiBand(h36)] > BR[hiBand(t.hi)], nextBand: t.hi == null ? null : (hiBand(t.hi) === 'normal' ? 'moderate' : 'poor'), rbi: months, last, due, overdue: due < AS_OF };
});
const assessed = towers.filter((t) => t.hi != null);
// fastest-deteriorating towers: largest forecast HI loss over 3 years (the early-warning list)
for (const t of towers) { t.loss3 = t.hi == null ? 0 : t.hi - t.h36; t.crosses = false; }
assessed.slice().sort((a, b) => b.loss3 - a.loss3).slice(0, 14).forEach((t) => { if (t.loss3 >= 4) t.crosses = true; });
const towerById = new Map(towers.map((t) => [t.id, t]));

/* ================================================================== recurrence & Weibull */
const families = [...new Set(assessed.map(FAMILY))].sort();
const famTowers = (f) => assessed.filter((t) => FAMILY(t) === f);
const GROUPS = [...new Set(net.findings.map((f) => f.group))].filter(Boolean).sort();
const GROUP_NAME = { insulators: 'Insulators', steel_structure: 'Steel structure', foundation: 'Foundation', conductor: 'Conductor', conductor_accessories: 'Conductor accessories', lightning_protection: 'Lightning protection', tower_accessories: 'Tower accessories', row: 'Right of way', vegetation: 'Right of way', transformer: 'Transformer' };
const lineFindings = net.findings.filter((f) => f.review_status !== 'rejected' && f.tower_id && towerById.has(f.tower_id));
// rate: confirmed/pending findings per 100 towers per campaign
const recRate = families.map((fam, xi) => {
  const ts = new Set(famTowers(fam).map((t) => t.id));
  return GROUPS.map((g, yi) => [xi, yi, r1((lineFindings.filter((f) => ts.has(f.tower_id) && f.group === g).length / Math.max(1, ts.size) / campaigns.length) * 100)]);
}).flat();
// recurrence: share of towers where a defect class seen in one campaign is seen again in a later campaign
const recurrence = (() => {
  const seen = new Map();
  for (const f of lineFindings) { const k = `${f.tower_id}|${f.defect_class}`; const s = seen.get(k) || new Set(); s.add(f.campaign_id); seen.set(k, s); }
  const out = {};
  for (const [k, s] of seen) { const [tid, cls] = k.split('|'); const t = towerById.get(tid); if (!t) continue; const fam = FAMILY(t); const o = (out[`${fam}|${cls}`] ||= { fam, cls, n: 0, rec: 0 }); o.n += 1; if (s.size > 1) o.rec += 1; }
  return Object.values(out);
})();
const topClasses = Object.entries(lineFindings.reduce((a, f) => { a[f.defect_class] = (a[f.defect_class] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
// Weibull wear-out (β fixed at 2.4, η from the fraction of towers with a confirmed structural/insulator defect at mean age)
const BETA = 2.4;
const weib = families.map((fam) => {
  const ts = famTowers(fam).filter((t) => t.age > 0);
  const age = ts.reduce((a, t) => a + t.age, 0) / Math.max(1, ts.length);
  const F = clamp(ts.filter((t) => t.findings.some((f) => f.review_status === 'confirmed' && (f.condition_score ?? 5) <= 3)).length / Math.max(1, ts.length), 0.02, 0.95);
  const eta = age / (-Math.log(1 - F)) ** (1 / BETA);
  return { fam, n: ts.length, age: r1(age), F, eta: r1(eta), zone: ts[0]?.zone, type: ts[0]?.type, mttf: r1(eta * 0.8865) };
});
const FAM_COLOR = (i) => ['#ea580c', '#2563eb', '#14b8a6', '#8b5cf6'][i % 4];

/* ================================================================== workload forecast */
const CORRS = ['North', 'Coastal', 'Inland'];
const CORR_LINE = { North: 'L-220-03', Coastal: 'L-132-01', Inland: 'L-500-01' };
const QHIST = ['2026 Q1', '2026 Q2', '2026 Q3', '2026 Q4'];
const QNEXT = ['2027 Q1', '2027 Q2', '2027 Q3', '2027 Q4'];
const CMAP = { 'CMP-2026-Q1': 0, 'CMP-2026-Q2': 1, 'CMP-2026-Q4': 3 };
const histFind = CORRS.map((c) => { const arr = [0, 0, null, 0]; for (const f of lineFindings) if (towerById.get(f.tower_id)?.corridor === c && CMAP[f.campaign_id] != null) arr[CMAP[f.campaign_id]] += 1; return arr; });
const confirmedShare = (() => { const rev = net.findings.filter((f) => f.review_status !== 'pending'); return rev.filter((f) => f.review_status === 'confirmed').length / Math.max(1, rev.length); })();
const woPerConfirmed = net.workOrders.length / Math.max(1, net.findings.filter((f) => f.review_status === 'confirmed').length);
const hoursPerWo = (c) => { const ws = net.workOrders.filter((w) => w.corridor === c); return ws.length ? ws.reduce((a, w) => a + w.labourH, 0) / ws.length : 22; };
function linFit(ys) { const pts = ys.map((y, i) => [i, y]).filter((p) => p[1] != null); const n = pts.length; const mx = pts.reduce((a, p) => a + p[0], 0) / n; const my = pts.reduce((a, p) => a + p[1], 0) / n; const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / Math.max(1e-9, pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)); return (x) => my + b * (x - mx); }
function workload(s = BASE) {
  return CORRS.map((c, ci) => {
    const fit = linFit(histFind[ci]);
    const ts = assessed.filter((t) => t.corridor === c);
    const decayLift = ts.reduce((a, t) => a + (100 - hiAt(t, 1, s)) - (100 - t.hi), 0) / Math.max(1, ts.length); // HI points lost per tower in a year
    const q = QNEXT.map((_, k) => {
      const base = Math.max(4, fit(4 + k) * 0.55 + histFind[ci].filter((v) => v != null).reduce((a, v) => a + v, 0) / 3 * 0.45);
      const findings = base * (1 + decayLift / 40) * (0.85 + 0.15 * s.storm) * (1 + (s.corrosion - 1) * 0.6);
      const wos = findings * confirmedShare * woPerConfirmed;
      const hours = wos * hoursPerWo(c);
      const sd = Math.sqrt(findings) * 1.35 * confirmedShare * woPerConfirmed * hoursPerWo(c);
      return { findings, wos, hours, p10: Math.max(0, hours - 1.2816 * sd), p90: hours + 1.2816 * sd };
    });
    return { corridor: c, q };
  });
}
const WL = workload();
const reviewRate = (() => { const lowConf = net.findings.filter((f) => f.confidence < 0.8 || f.review_status === 'pending').length; return lowConf / net.findings.length; })();
const nextQFindings = WL.reduce((a, c) => a + c.q[0].findings, 0);
const nextQReviews = Math.round(nextQFindings * reviewRate);
const nextQReviewsP90 = Math.round(nextQReviews + 1.2816 * Math.sqrt(nextQReviews) * 1.3);
const dueNextQ = towers.filter((t) => t.due <= addDays(AS_OF, 92)).length;
const northShare = Math.round((WL[0].q[0].findings / nextQFindings) * 100);

// crew capacity (productive hours per quarter by skill)
const SKILLS = [...new Set(net.crews.map((c) => c.skill))];
const SKILL_NAME = { 'live-line': 'Live-line', structures: 'Structures', conductor: 'Conductor & OPGW', insulators: 'Insulators', civil: 'Civil & foundation', vegetation: 'ROW vegetation', substation: 'Substation HV' };
const capBySkill = Object.fromEntries(SKILLS.map((sk) => [sk, net.crews.filter((c) => c.skill === sk).reduce((a, c) => a + c.size * 36 * 13 * 0.32, 0)]));
const mixBySkill = (() => { const m = {}; for (const w of net.workOrders) m[w.skill] = (m[w.skill] || 0) + w.labourH; const tot = Object.values(m).reduce((a, b) => a + b, 0); return Object.fromEntries(SKILLS.map((k) => [k, (m[k] || 0) / tot])); })();

/* ================================================================== fleet scenario simulation */
const RBI_COST = 520; // $ per tower: drone flight, mobilisation, photogrammetry and AI processing
const REVIEW_COST = 95; // $ per manual engineering review
function simulate(s = BASE, years = 10) {
  const hi = new Map(assessed.map((t) => [t.id, t.hi]));
  const need = towers.reduce((a, t) => a + (t.rbi ? 12 / t.rbi : 4), 0) * RBI_COST + nextQReviews * 4 * REVIEW_COST;
  const detect = clamp((s.budget * 1000) / need, 0.25, 1);
  const repairsPerYear = Math.round(s.crews * 0.45 * detect); // major tower restorations (most crew time is routine corrective work)
  const out = { years: [], poor: [], moderate: [], sub: [], exposure: [], backlog: [], detect, need, repairsPerYear };
  for (let y = 0; y <= years; y += 1) {
    if (y > 0) {
      for (const t of assessed) { const k = rate({ ...t, open: t.open }, s); const v = hi.get(t.id); hi.set(t.id, clamp(v * Math.exp(-k) - 0.4 * s.storm * (t.kv >= 220 ? 1 : 0.85), 0, 100)); }
      // repair the worst detected towers first (restored to HI 88)
      const worst = assessed.map((t) => ({ t, v: hi.get(t.id) })).filter((x) => x.v < 70).sort((a, b) => riskOf(b.t, b.v) - riskOf(a.t, a.v)).slice(0, repairsPerYear);
      for (const w of worst) hi.set(w.t.id, Math.max(w.v, 88));
    }
    let poor = 0; let mod = 0; let exp = 0; let back = 0;
    for (const t of assessed) { const v = hi.get(t.id); if (v < 40) poor += 1; else if (v < 70) mod += 1; exp += riskOf(t, v); if (v < 70) back += (70 - v) * 6; }
    out.years.push(2026 + y); out.poor.push(poor); out.moderate.push(mod); out.sub.push(poor + mod); out.exposure.push(Math.round(exp)); out.backlog.push(Math.round(back));
  }
  return out;
}
const SIM0 = simulate();

/* ================================================================== shared helpers */
const sevBadge = (rb) => (rb ? ui.badge(fmt.title(rb), RB_TONE[rb]) : ui.badge('Not assessed', 'muted'));
const hbBadge = (b) => (b ? ui.badge(fmt.title(b), HB_TONE[b]) : ui.badge('Not assessed', 'muted'));
const projSeries = (t, s = BASE) => Array.from({ length: 11 }, (_, y) => (t.hi == null ? null : r1(hiAt(t, y, s))));
const goAsset = (id) => { location.href = `/reliability#asset=${encodeURIComponent(id)}`; };

const SEV_OF = (f) => ({ 1: 'critical', 2: 'high', 3: 'medium' }[f.condition_score] || 'low');
const projBand = (t, f) => Array.from({ length: 11 }, (_, y) => (t.hi == null ? null : r1(clamp(t.hi * Math.exp(-rate(t) * f * y) - 0.4 * f * (t.kv >= 220 ? 1 : 0.85) * y, 0, 100))));
function openTower(t) {
  if (!t) return;
  const proj = projSeries(t); const lo = projBand(t, 1.3); const hi = projBand(t, 0.7);
  const recs = t.findings.slice().sort((a, b) => (a.condition_score ?? 5) - (b.condition_score ?? 5));
  const wos = net.workOrders.filter((w) => w.towerId === t.id);
  const camps = campaigns.map((c) => ({ c, insp: (c.inspected_tower_ids || []).includes(t.id), n: lineFindings.filter((f) => f.tower_id === t.id && f.campaign_id === c.campaign_id).length }));
  const yrsPoor = yearsToPoor(t);
  const fam = weib.find((w) => w.fam === FAMILY(t));
  const peers = assessed.filter((x) => x.line === t.line && x.id !== t.id && Math.abs((x.idx ?? 0) - (t.idx ?? 0)) <= 3).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
  const overview = `${ui.stats([{ label: 'HI today', value: fmt.n(t.hi, 1), color: healthColor(t.hi) }, { label: 'HI +12 mo', value: fmt.n(t.h12, 1), color: healthColor(t.h12) }, { label: 'HI +5 y', value: fmt.n(t.h60, 1), color: healthColor(t.h60) }, { label: 'Risk today', value: fmt.n(t.risk, 0) }, { label: 'Risk +12 mo', value: fmt.n(t.r12, 0), color: RB_COLOR[t.rb12] }, { label: 'RBI interval', value: t.rbi ? `${t.rbi} mo` : 'Due now' }])}
    <div class="nx-sec"><h4>Projected health index — P10 / P50 / P90, no intervention ${ui.exp()}</h4>${ui.chart('tproj', 'md')}<div class="nx-note">The band is an assumed ±30 % on the decay rate k (weather and defect-growth uncertainty), not a measured confidence interval. ${t.hi == null ? 'Not assessed yet — the projection starts after the baseline inspection.' : t.band === 'poor' ? `Already in the poor band; predicted to lose a further <b>${fmt.n(t.hi - t.h60, 1)} HI points</b> in 5 years without intervention.` : yrsPoor >= 10 ? 'Forecast to stay above the next band threshold for 10+ years.' : `Forecast to cross the next band threshold in about <b>${fmt.n(yrsPoor, 1)} years</b>.`}</div></div>
    <div class="nx-drawer-grid"><div class="nx-sec"><h4>Risk build-up at +12 months</h4>${ui.chart('tbuild', 'sm')}</div><div class="nx-sec"><h4>Neighbouring towers (±3 positions)</h4>${ui.chart('tpeer', 'sm')}</div></div>
    <div class="nx-sec"><h4>Model — engineering assumptions, not validated ${ui.exp()}</h4><div class="fct-formula">HI(t) = HI₀ · e<sup>−k·t</sup> − s·t &nbsp; k = <b>${rate(t).toFixed(4)}</b>/y (zone ${esc(t.zone)} ${K_ZONE[t.zone]} × age ${(1 + Math.max(0, t.age - 15) * 0.012).toFixed(2)} × defects ${(1 + Math.min(3, t.open) * 0.08 + (t.worst <= 2 ? 0.25 : 0)).toFixed(2)})<br/>risk = (100 − HI) × criticality <b>${critOf(t)}</b> × consequence <b>${consOf(t)}</b> = <b>${fmt.n(t.r12, 0)}</b> at +12 months</div></div>`;
  const evidence = `<div class="nx-sec"><h4>Inspection history — 2026 campaigns</h4>${ui.timeline(camps.map(({ c, insp, n }) => ({ when: `${fmt.date(c.start)} → ${fmt.date(c.end)}`, title: `${c.name} · ${insp ? 'inspected' : n ? 'sighted from adjacent spans' : 'not flown'}`, text: insp || n ? `${n} finding${n === 1 ? '' : 's'} recorded on this tower${!insp && n ? ' (captured while flying the neighbouring towers)' : ''}` : 'Tower outside the flight plan for this campaign', tone: !insp && !n ? 'muted' : n ? 'warn' : 'ok' })))}</div>
    <div class="nx-drawer-grid"><div class="nx-sec"><h4>Component-group condition (1–5)</h4>${ui.chart('tgrp', 'sm')}</div><div class="nx-sec"><h4>Family wear-out model · ${esc(t.type)} ${ui.exp()}</h4>${fam ? `<div class="fct-mini"><div><small>Characteristic life η</small><b>${fam.eta} y</b></div><div><small>MTTF</small><b>${fam.mttf} y</b></div><div><small>Tower age</small><b>${t.age} y</b></div></div><div style="margin-top:8px">${ui.chart('tweib', 'sm')}</div>` : ui.empty('No family curve.')}</div></div>
    <div class="nx-sec"><h4>Open findings driving the forecast (${recs.length})</h4>${recs.length ? ui.table({ cols: [{ key: 'finding_id', label: 'Finding' }, { label: 'Defect', render: (f) => esc(DEFECT_LABEL[f.defect_class] || f.defect_class) }, { label: 'Severity', render: (f) => ui.badge(fmt.title(SEV_OF(f)), SEV_TONE[SEV_OF(f)] || 'muted') }, { key: 'date', label: 'Seen', render: (f) => fmt.date(f.date) }, { label: 'Conf.', align: 'r', render: (f) => fmt.pct((f.confidence ?? 0) * 100, 0) }, { label: 'Review', render: (f) => ui.badge(fmt.title(f.review_status), f.review_status === 'confirmed' ? 'ok' : 'warn') }], rows: recs }) : ui.empty('No open findings — decay follows the zone baseline only.')}</div>`;
  const plan = `<div class="nx-drawer-grid"><div class="nx-sec"><h4>Inspection plan</h4>${ui.kv([['Last inspected', t.last ? fmt.date(t.last) : 'Never (new build)'], ['Calendar policy', 'Every 12 months'], ['Risk-based interval', `${t.rbi ? `${t.rbi} months` : 'Baseline inspection now'} ${ui.exp()}`], ['Next due', `<span class="fct-due" style="color:${t.overdue ? '#dc2626' : 'inherit'}">${fmt.date(t.due)}${t.overdue ? ' · overdue' : ''}</span> ${ui.exp()}`], ['Manual review likely (estimate)', `${fmt.pct(reviewRate * 100, 0)} of findings`]])}</div><div class="nx-sec"><h4>Next 24 months — calendar vs RBI</h4>${ui.chart('tsched', 'sm')}</div></div>
    <div class="nx-sec"><h4>Work orders on this tower (${wos.length}) ${ui.erp('SAP PM', 'workOrders')}</h4>${wos.length ? ui.table({ cols: [{ key: 'id', label: 'WO', render: (w) => `<b>${esc(w.id)}</b>` }, { key: 'work_type', label: 'Work', render: (w) => fmt.title(w.work_type) }, { key: 'stage', label: 'Stage', render: (w) => ui.badge(fmt.title(w.stage), w.stage === 'completed' ? 'ok' : w.stage === 'in_progress' ? 'info' : 'warn') }, { key: 'crewName', label: 'Crew' }, { key: 'labourH', label: 'Labour h', align: 'r' }, { key: 'estCost', label: 'Est.', align: 'r', render: (w) => fmt.money(w.estCost) }], rows: wos }) : ui.empty('No work orders for this tower in SAP PM.')}</div>`;
  drawer.open({
    kicker: `Tower forecast · ${t.line} · ${t.corridor} corridor`, title: `${t.name} — ${t.type}`, icon: 'tower', wide: true,
    sub: `Corrosivity ${ZONE_NAME[t.zone] || t.zone} · installed ${String(t.install).slice(0, 4)} (${t.age} y) · height ${t.height} m · criticality ${critOf(t)} · consequence ${consOf(t)}`,
    badges: [['Experimental', 'warn'], [`HI ${t.hi == null ? 'n/a' : fmt.n(t.hi, 0)} · ${fmt.title(t.band || 'not assessed')}`, HB_TONE[t.band] || 'muted'], [`Risk +12 mo: ${fmt.title(t.rb12 || 'n/a')}`, RB_TONE[t.rb12] || 'muted'], [`${t.open} open findings`, t.open ? 'warn' : 'ok'], ...(t.overdue ? [['Inspection overdue', 'crit']] : []), ...(t.crosses ? [[`Fast decay −${fmt.n(t.loss3, 1)} HI / 3 y`, 'high']] : [])],
    meta: `as of ${fmt.date(AS_OF)} · zone decay + Weibull · engineering assumptions on simulated data, not validated`,
    tabs: [
      { name: 'Forecast', body: overview, mount: (el, ctx) => {
        const x = Array.from({ length: 11 }, (_, i) => String(2026 + i));
        const band = { silent: true, data: [[{ yAxis: 0, itemStyle: { color: 'rgba(220,38,38,.07)' } }, { yAxis: 40 }], [{ yAxis: 40, itemStyle: { color: 'rgba(217,119,6,.06)' } }, { yAxis: 70 }]] };
        ctx.chart('tproj', { grid: ch.grid({ top: 28 }), legend: { top: 0, right: 0, data: ['P50 predicted HI', 'P10 fast decay', 'P90 slow decay'] }, tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.n(v, 1) }, xAxis: { type: 'category', data: x, boundaryGap: false }, yAxis: { type: 'value', min: 0, max: 100, name: 'HI' }, series: [
          { name: 'base', type: 'line', stack: 'u', data: lo, lineStyle: { opacity: 0 }, showSymbol: false, tooltip: { show: false }, silent: true },
          { name: 'band', type: 'line', stack: 'u', data: hi.map((v, i) => (v == null ? null : r1(v - lo[i]))), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: '#2563eb1f' }, tooltip: { show: false }, silent: true },
          { name: 'P10 fast decay', type: 'line', data: lo, smooth: true, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#93c5fd' }, itemStyle: { color: '#93c5fd' } },
          { name: 'P90 slow decay', type: 'line', data: hi, smooth: true, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#93c5fd' }, itemStyle: { color: '#60a5fa' } },
          { name: 'P50 predicted HI', type: 'line', data: proj, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.6, color: '#2563eb' }, itemStyle: { color: '#2563eb' }, markArea: band },
        ] });
        const f = { c: 100 - (t.h12 ?? 100), cr: critOf(t), co: consOf(t) };
        ctx.chart('tbuild', ch.bar({ x: ['100 − HI', `× crit ${f.cr}`, `× cons ${f.co}`], series: [{ name: 'Cumulative', data: [r1(f.c), r1(f.c * f.cr), r1(f.c * f.cr * f.co)].map((v, i) => ({ value: v, itemStyle: { color: ['#94a3b8', '#f59e0b', RB_COLOR[t.rb12] || '#2563eb'][i] } })) }], labels: true, legend: false }));
        const ps = [...peers.filter((p) => (p.idx ?? 0) < (t.idx ?? 0)), t, ...peers.filter((p) => (p.idx ?? 0) > (t.idx ?? 0))];
        ctx.chart('tpeer', ch.bar({ x: ps.map((p) => p.name), series: [{ name: 'HI today', data: ps.map((p) => ({ value: r1(p.hi ?? 0), itemStyle: { color: p.id === t.id ? '#2563eb' : '#cbd5e1' } })) }, { name: 'HI +12 mo', data: ps.map((p) => ({ value: r1(p.h12 ?? 0), itemStyle: { color: p.id === t.id ? '#7c3aed' : '#e2e8f0' } })) }], yName: 'HI', legend: true }));
      } },
      { name: `Evidence (${recs.length})`, body: evidence, mount: (el, ctx) => {
        const gs = (t.hiGroups || []).slice().sort((a, b) => a.score - b.score);
        ctx.chart('tgrp', ch.bar({ x: gs.map((g) => GROUP_NAME[g.group] || fmt.title(g.group)), horizontal: true, series: [{ name: 'Group score', data: gs.map((g) => ({ value: r1(g.score), itemStyle: { color: g.score <= 2 ? '#dc2626' : g.score <= 3 ? '#f59e0b' : '#16a34a' } })) }], max: 5, labels: true, legend: false, grid: { top: 6, right: 30 } }));
        if (fam) { const ages = Array.from({ length: 51 }, (_, i) => i); ctx.chart('tweib', { grid: ch.grid({ top: 10 }), tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt.n(v * 100, 1)}%` }, xAxis: { type: 'category', data: ages, boundaryGap: false, axisLabel: { interval: 9 }, name: 'age' }, yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v) => `${v * 100}%` } }, series: [{ name: 'R(t) family', type: 'line', smooth: true, showSymbol: false, data: ages.map((a) => +Math.exp(-((a / fam.eta) ** BETA)).toFixed(4)), areaStyle: { color: '#14b8a61f' }, lineStyle: { color: '#14b8a6', width: 2 }, itemStyle: { color: '#14b8a6' }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#dc2626', type: 'dashed' }, data: [{ xAxis: String(Math.min(50, t.age)), label: { formatter: `${t.name} today`, fontSize: 10 } }] } }] }); }
      } },
      { name: `Plan & work (${wos.length})`, body: plan, mount: (el, ctx) => {
        const mos = Array.from({ length: 24 }, (_, i) => addMonths(AS_OF, i).slice(0, 7));
        const calHits = mos.map((m) => { const k = t.last ? Math.round((Date.parse(`${m}-15`) - Date.parse(t.last)) / (30.44 * 864e5)) : 0; return k > 0 && k % 12 === 0 ? 1 : 0; });
        const rbiHits = mos.map((m) => { if (!t.rbi) return m === mos[0] ? 1 : 0; const k = Math.round((Date.parse(`${m}-15`) - Date.parse(t.due)) / (30.44 * 864e5)); return k >= 0 && k % t.rbi === 0 ? 1 : 0; });
        ctx.chart('tsched', ch.bar({ x: mos.map((m) => m.slice(2)), series: [{ name: 'Calendar visit', data: calHits, color: '#cbd5e1' }, { name: 'RBI visit', data: rbiHits, color: '#2563eb' }], yName: 'visits', max: 1 }));
      } },
    ],
    actions: [{ label: 'Open Asset 360', icon: 'eye', onClick: () => goAsset(t.id) }, { label: 'Add to next campaign', primary: true, icon: 'calendar', onClick: (close) => { toast(`${t.name} added to the ${t.corridor} inspection campaign`); close(); } }],
  });
}

function openCrew(c) {
  if (!c) return;
  const members = net.people.filter((p) => p.crew === c.id);
  const wos = net.workOrders.filter((w) => w.crew === c.id && w.stage !== 'completed');
  const cap = c.size * 36 * 13 * 0.32;
  const crewsOfSkill = net.crews.filter((x) => x.skill === c.skill).length;
  const perQ = QNEXT.map((_, i) => Math.round(WL.reduce((a, w) => a + w.q[i].hours, 0) * mixBySkill[c.skill] / Math.max(1, crewsOfSkill)));
  const perQ90 = QNEXT.map((_, i) => Math.round(WL.reduce((a, w) => a + w.q[i].p90, 0) * mixBySkill[c.skill] / Math.max(1, crewsOfSkill)));
  const certs = {}; for (const p of members) for (const ce of p.certs) certs[ce.state] = (certs[ce.state] || 0) + 1;
  drawer.open({
    kicker: `Crew demand · ${SKILL_NAME[c.skill] || c.skill}`, title: `${c.id} · ${c.name}`, icon: 'users', wide: true,
    sub: `Lead ${esc(c.lead)} · ${c.size} people · base ${esc(c.baseName)} · ${esc(c.vehicle)}`,
    badges: [['', 'warn'], [`Forecast Q1 load ${load(c)} %`, load(c) > 100 ? 'crit' : load(c) > 85 ? 'warn' : 'ok'], [fmt.title(c.status), c.status === 'available' ? 'ok' : 'info'], [`${wos.length} open work orders`, wos.length ? 'warn' : 'ok']],
    body: `${ui.stats([{ label: 'Capacity / qtr', value: `${fmt.n(cap, 0)} h` }, { label: 'Demand Q1 (P50)', value: `${fmt.n(perQ[0], 0)} h` }, { label: 'Demand Q1 (P90)', value: `${fmt.n(perQ90[0], 0)} h` }, { label: 'Utilisation now', value: `${c.utilisation} %` }, { label: 'Hours this week', value: `${c.hoursWeek} h` }])}
      <div class="nx-sec"><h4>Forecast load vs capacity — 2027 (routine work + corrective forecast) ${ui.exp()}</h4>${ui.chart('cdem', 'md')}</div>
      <div class="nx-drawer-grid"><div class="nx-sec"><h4>Certification status (${members.length} people)</h4>${ui.chart('ccert', 'sm')}</div><div class="nx-sec"><h4>Open work by type ${ui.erp('SAP PM', 'workOrders')}</h4>${ui.chart('cwork', 'sm')}</div></div>
      <div class="nx-sec"><h4>Members</h4>${ui.table({ cols: [{ key: 'name', label: 'Name', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.id)}</span>` }, { key: 'role', label: 'Role' }, { key: 'years', label: 'Years', align: 'r' }, { key: 'hoursWeek', label: 'h / wk', align: 'r' }, { label: 'Certificates', sort: (p) => p.certs.length, render: (p) => p.certs.map((ce) => ui.badge(ce.id, ce.state === 'valid' ? 'ok' : ce.state === 'expiring' ? 'warn' : 'crit', { dot: false })).join(' ') || '<span class="nx-sub">—</span>' }], rows: members })}</div>`,
    meta: `Capacity = crew size × 36 h × 13 weeks × 32 % wrench time · demand and load are s`,
    mount: (el, ctx) => {
      const routine = Math.max(0, Math.round(cap * (load(c) / 100) - perQ[0]));
      ctx.chart('cdem', { ...ch.bar({ x: QNEXT, stack: true, series: [{ name: 'Routine & planned work', data: QNEXT.map(() => routine), color: '#cbd5e1', stack: 'd' }, { name: 'Forecast corrective (P50)', data: perQ, color: '#2563eb', stack: 'd' }], yName: 'labour h', max: Math.ceil(Math.max(cap, routine + Math.max(...perQ90)) * 1.12 / 100) * 100 }), series: [{ name: 'Routine & planned work', type: 'bar', stack: 'd', data: QNEXT.map(() => routine), itemStyle: { color: '#cbd5e1' }, barWidth: 34 }, { name: 'Forecast corrective (P50)', type: 'bar', stack: 'd', data: perQ, itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] } }, { name: 'Total at P90', type: 'scatter', symbol: 'rect', symbolSize: [40, 3], data: perQ90.map((v) => routine + v), itemStyle: { color: '#0f172a' } }, { name: 'Capacity', type: 'line', data: QNEXT.map(() => Math.round(cap)), lineStyle: { color: '#dc2626', type: 'dashed', width: 1.6 }, itemStyle: { color: '#dc2626' }, showSymbol: false }] });
      ctx.chart('ccert', ch.donut({ data: [['valid', '#16a34a'], ['expiring', '#f59e0b'], ['expired', '#dc2626']].map(([k, col]) => ({ name: fmt.title(k), value: certs[k] || 0, color: col })), center: 'certificates' }));
      const ty = {}; for (const w of wos) ty[w.work_type] = (ty[w.work_type] || 0) + 1;
      const ent = Object.entries(ty);
      ctx.chart('cwork', ent.length ? ch.bar({ x: ent.map((e) => fmt.title(e[0])), series: [{ name: 'Open WOs', data: ent.map((e) => e[1]), color: '#7c3aed' }], horizontal: true, labels: true, legend: false, grid: { top: 6, right: 26 } }) : { title: { text: 'No open work', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 500 } } });
    },
  });
}

function openFamily(w) {
  if (!w) return;
  const ts = famTowers(w.fam).slice().sort((a, b) => (a.hi ?? 101) - (b.hi ?? 101));
  const ages = Array.from({ length: 61 }, (_, i) => i);
  const cls = {}; for (const f of lineFindings) { const t = towerById.get(f.tower_id); if (t && FAMILY(t) === w.fam) cls[f.defect_class] = (cls[f.defect_class] || 0) + 1; }
  const top = Object.entries(cls).sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawer.open({
    kicker: 'Tower family wear-out model', title: `${w.type} · ${ZONE_NAME[w.zone] || w.zone}`, icon: 'tower', wide: true,
    sub: `${w.n} assessed towers · mean age ${w.age} y · Weibull β ${BETA} assumed (wear-out), η derived from the share of towers with a confirmed condition ≤ 3 finding in the simulated inspection data · not validated`,
    badges: [['Experimental', 'warn'], [`η ${w.eta} y`, 'info'], [`MTTF ${w.mttf} y`, 'accent'], [`F(age) ${fmt.pct(w.F * 100, 0)}`, w.F > 0.4 ? 'crit' : w.F > 0.2 ? 'warn' : 'ok']],
    body: `<div class="nx-drawer-grid"><div class="nx-sec"><h4>Survival function R(t) and hazard h(t) ${ui.exp()}</h4>${ui.chart('frel', 'md')}</div><div class="nx-sec"><h4>Defect classes in this family</h4>${ui.chart('fcls', 'md')}</div></div>
      <div class="nx-sec"><h4>HI distribution — today vs +5 years ${ui.exp()}</h4>${ui.chart('fdist', 'sm')}</div>
      <div class="nx-sec"><h4>Towers in this family (${ts.length})</h4><div style="max-height:320px;overflow:auto">${ui.table({ id: 'fam-t', rowId: (t) => t.id, cols: [{ key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b><span class="nx-sub">${esc(t.line)}</span>` }, { key: 'age', label: 'Age', align: 'r' }, { key: 'hi', label: 'HI', align: 'r', render: (t) => ui.score(t.hi == null ? null : r1(t.hi)) }, { key: 'h60', label: '+5 y', align: 'r', render: (t) => ui.score(t.h60 == null ? null : r1(t.h60)) }, { key: 'open', label: 'Open', align: 'r' }, { key: 'rb12', label: 'Risk +12 mo', render: (t) => sevBadge(t.rb12) }], rows: ts })}</div></div>`,
    meta: 'assumed Weibull shape on simulated findings · click a tower for its forecast',
    mount: (el, ctx) => {
      ctx.chart('frel', { grid: ch.grid({ top: 28 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ages, boundaryGap: false, axisLabel: { interval: 9 }, name: 'age' }, yAxis: [{ type: 'value', min: 0, max: 1, axisLabel: { formatter: (v) => `${v * 100}%` } }, { type: 'value', splitLine: { show: false } }], series: [{ name: 'R(t)', type: 'line', smooth: true, showSymbol: false, data: ages.map((a) => +Math.exp(-((a / w.eta) ** BETA)).toFixed(4)), lineStyle: { color: '#2563eb', width: 2.4 }, itemStyle: { color: '#2563eb' }, areaStyle: { color: '#2563eb14' }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#94a3b8', type: 'dashed' }, data: [{ xAxis: String(Math.round(w.age)), label: { formatter: 'mean age', fontSize: 10 } }] } }, { name: 'h(t)', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: ages.map((a) => +((BETA / w.eta) * (a / w.eta) ** (BETA - 1)).toFixed(4)), lineStyle: { color: '#dc2626', type: 'dashed', width: 1.6 }, itemStyle: { color: '#dc2626' } }] });
      ctx.chart('fcls', ch.bar({ x: top.map((e) => DEFECT_LABEL[e[0]] || e[0]), series: [{ name: 'Findings', data: top.map((e) => e[1]), color: '#7c3aed' }], horizontal: true, labels: true, legend: false, grid: { top: 6, right: 30 } }));
      const bins = Array.from({ length: 10 }, (_, i) => i * 10);
      const hist = (k) => bins.map((b) => ts.filter((t) => t[k] != null && t[k] >= b && t[k] < b + 10 + (b === 90 ? 1 : 0)).length);
      ctx.chart('fdist', ch.bar({ x: bins.map((b) => `${b}–${b + 9}`), series: [{ name: 'Today', data: hist('hi'), color: '#94a3b8' }, { name: '+5 years', data: hist('h60'), color: '#ea580c' }], yName: 'towers' }));
      ctx.on('click', '#fam-t tr[data-row]', (e, r) => openTower(towerById.get(r.dataset.row)));
    },
  });
}

/* ================================================================== screen 1: Risk Forecast */
function riskMapInfo(t) {
  return {
    kicker: `${t.line} · ${t.corridor} corridor`, title: `${t.name} · ${t.type}`, sub: `${ZONE_NAME[t.zone] || t.zone} · ${t.age} years in service`,
    badges: [['Experimental', 'warn'], [`Now: ${fmt.title(t.riskBand || 'n/a')}`, RB_TONE[t.riskBand] || 'muted'], [`+12 mo: ${fmt.title(t.rb12 || 'n/a')}`, RB_TONE[t.rb12] || 'muted'], ...(t.crosses ? [[`Fast decay: −${fmt.n(t.loss3, 1)} HI in 3 y`, 'crit']] : [])],
    fields: [['HI today → +12 mo', `${fmt.n(t.hi, 1)} → <b style="color:${healthColor(t.h12)}">${fmt.n(t.h12, 1)}</b>`], ['Risk today → +12 mo', `${fmt.n(t.risk, 0)} → <b style="color:${RB_COLOR[t.rb12] || 'inherit'}">${fmt.n(t.r12, 0)}</b>`], ['Decay constant k', `${rate(t).toFixed(4)} /y`], ['Open findings', `${t.open}${t.unreviewed ? ` · ${t.unreviewed} unreviewed` : ''}`], ['Next inspection (RBI)', `${fmt.date(t.due)}${t.overdue ? ' · overdue' : ''}`]],
    spark: { data: projSeries(t), x: Array.from({ length: 11 }, (_, i) => String(2026 + i)), color: healthColor(t.h60), label: 'Predicted HI, 2026–2036', min: 0, max: 100 },
    actions: [{ label: 'Forecast detail', primary: true, icon: 'forecast', onClick: () => openTower(t) }, { label: 'Asset 360', icon: 'eye', onClick: () => goAsset(t.id) }],
  };
}
function riskForecastMap() {
  const nCross = towers.filter((t) => t.crosses).length;
  const nCrit12 = towers.filter((t) => t.rb12 === 'critical').length;
  const nHigh12 = towers.filter((t) => t.rb12 === 'high').length;
  const exp0 = assessed.reduce((a, t) => a + t.risk, 0); const exp12 = assessed.reduce((a, t) => a + t.r12, 0);
  const top = assessed.slice().sort((a, b) => b.r12 - a.r12).slice(0, 12);
  return {
    render: () => `<div class="nx-page">
      ${ui.hero({ kicker: 'next quarter (2027 Q1)', icon: 'forecast', text: `Model estimate, not validated: about <b>${nextQReviews}</b> inspection findings are forecast to need manual engineering review next quarter (P50; P90 ${nextQReviewsP90}) from ~${dueNextQ} risk-due tower inspections, with Corridor North expected to carry ${northShare}% of the load.`, meta: [{ label: 'Reviews P50 (forecast)', value: nextQReviews }, { label: 'Fast-deteriorating towers (forecast)', value: nCross }, { label: 'L-220-03 loading', value: '—', live: 'L-220-03.LOAD' }] })}
      ${ui.kpis([
        { label: 'Risk exposure +12 mo', exp: true, value: fmt.n(exp12, 0), icon: 'trend', tone: 'crit', delta: ((exp12 - exp0) / exp0) * 100, deltaInvert: true, sub: `from ${fmt.n(exp0, 0)} today`, spark: [0, 0.25, 0.5, 0.75, 1].map((f) => assessed.reduce((a, t) => a + riskOf(t, hiAt(t, f)), 0)) },
        { label: 'Critical-risk towers in 12 mo', exp: true, value: nCrit12, icon: 'alert', tone: 'crit', sub: `${towers.filter((t) => t.riskBand === 'critical').length} today · ${nHigh12} high`, spark: [0, 0.25, 0.5, 0.75, 1].map((f) => assessed.filter((t) => riskBand(riskOf(t, hiAt(t, f))) === 'critical').length), sparkColor: '#dc2626' },
        { label: 'Fleet HI in 12 months', exp: true, value: fmt.n(assessed.reduce((a, t) => a + t.h12, 0) / assessed.length, 1), icon: 'gauge', tone: 'warn', delta: ((assessed.reduce((a, t) => a + t.h12, 0) - assessed.reduce((a, t) => a + t.hi, 0)) / assessed.reduce((a, t) => a + t.hi, 0)) * 100, sub: 'length-unweighted mean', spark: [0, 1, 2, 3, 4, 5].map((y) => assessed.reduce((a, t) => a + hiAt(t, y), 0) / assessed.length) },
        { label: 'Manual reviews next quarter', exp: true, value: nextQReviews, icon: 'eye', tone: 'violet', sub: `${Math.round(reviewRate * 100)}% of ${Math.round(nextQFindings)} expected findings`, spark: [...histFind.reduce((a, c) => a.map((v, i) => v + (c[i] || 0)), [0, 0, 0, 0]).filter((v) => v > 0).map((v) => v * reviewRate), nextQReviews] },
      ])}
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s8', title: 'Forecast risk map — 12 months ahead', exp: true, sub: 'Towers coloured by forecast risk band; halos show risk concentration; pulsing towers are the fastest-deteriorating (largest forecast HI loss over 3 years).', tools: `<span class="fct-pill"><i style="background:#dc2626"></i>Critical</span><span class="fct-pill"><i style="background:#ea580c"></i>High</span><span class="fct-pill"><i style="background:#d97706"></i>Medium</span><span class="fct-pill"><i style="background:#16a34a"></i>Low</span>`, flush: true, body: '<div class="nx-map fct-map" id="fct-map" style="border-radius:0 0 12px 12px"></div>' })}
        ${ui.card({ cls: 'nx-s4', title: 'Highest forecast risk', exp: true, sub: 'Ranked by risk at +12 months · click to inspect', body: `<div class="fct-side nx-list">${top.map((t) => ui.li({ ic: 'tower', color: RB_COLOR[t.rb12], title: `${t.name} · ${t.line}`, sub: `HI ${fmt.n(t.hi, 0)} → ${fmt.n(t.h12, 0)} · ${t.open} open · ${esc(t.zone)}`, end: `<div class="nx-num" style="font-weight:700">${fmt.n(t.r12, 0)}</div>${sevBadge(t.rb12)}`, row: t.id })).join('')}</div>` })}
      </div>
      <div class="nx-row nx-c2">
        ${ui.card({ title: 'Risk band migration, today → +12 months', exp: true, sub: 'Number of assessed towers per risk band now and at the forecast horizon, by corridor.', body: ui.chart('mig', 'md') })}
        ${ui.card({ title: 'Fleet risk exposure trajectory', exp: true, sub: 'Σ risk across assessed towers, no-intervention projection with a P10–P90 band from an assumed ±30 % decay-rate uncertainty.', body: ui.chart('traj', 'md') })}
      </div></div>`,
    mount: (st, ctx) => {
      const pts = assessed.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, size: t.rb12 === 'critical' ? 15 : t.rb12 === 'high' ? 13 : 10, color: RB_COLOR[t.rb12], pulse: t.crosses, search: `${t.name} ${t.line} ${t.corridor}`, tip: `${t.name} · ${t.line} · forecast risk +12 mo ${fmt.n(t.r12, 0)}`, info: () => riskMapInfo(t) }));
      const layers = networkLayers(net, { subsInfo: (s) => ({ title: s.name, sub: `${s.levels.join('/')} kV · ${s.lines.join(', ')}`, fields: net.transformers.filter((x) => x.sub === s.id).map((x) => [x.name, `HI ${fmt.n(x.hi, 0)} · ${x.rating} MVA`]) }) });
      layers.push({ id: 'heat', name: 'Risk concentration', color: '#ef4444', on: true, fit: false, circles: assessed.filter((t) => t.r12 >= 300).map((t) => ({ lat: t.lat, lng: t.lng, r: 260 + Math.sqrt(t.r12) * 18, color: RB_COLOR[t.rb12], opacity: 0.16 })), count: assessed.filter((t) => t.r12 >= 300).length });
      layers.push({ id: 'fc', name: 'Towers · forecast risk', color: '#ea580c', points: pts });
      layers.push({ id: 'new', name: 'New build · not assessed', color: '#94a3b8', points: towers.filter((t) => t.hi == null).map((t) => ({ id: `${t.id}`, lat: t.lat, lng: t.lng, size: 10, color: '#94a3b8', shape: 'dia', tip: `${t.name} · ${t.line} · never inspected — baseline inspection due`, info: () => ({ title: `${t.name} · ${t.line}`, sub: 'Newly built section, never inspected', fields: [['Installed', fmt.date(t.install)], ['RBI action', 'Baseline inspection now']], actions: [{ label: 'Add to next campaign', primary: true, onClick: () => toast(`${t.name} baseline inspection added`) }] }) })) });
      ctx.map('#fct-map', { layers, legend: [{ label: 'Critical ≥ 1000', color: '#dc2626' }, { label: 'High ≥ 500', color: '#ea580c' }, { label: 'Medium ≥ 200', color: '#d97706' }, { label: 'Low', color: '#16a34a' }, { label: 'Pulse: fastest decay', color: '#dc2626', line: true }], stats: [{ label: 'Crit. +12 mo', value: nCrit12, color: '#dc2626' }, { label: 'Fast decay', value: nCross, color: '#ea580c' }, { label: 'Overdue RBI', value: towers.filter((t) => t.overdue).length }] }).then((m) => { ctx.on('click', '.fct-side [data-row]', (e, el) => m?.select(el.dataset.row)); });
      const bands = ['low', 'medium', 'high', 'critical'];
      const cnt = (key) => bands.map((b) => assessed.filter((t) => t[key] === b).length);
      ctx.chart('mig', ch.bar({ x: bands.map(fmt.title), series: [{ name: 'Today', data: cnt('riskBand'), color: '#94a3b8' }, { name: '+12 months', data: cnt('rb12'), color: '#ea580c' }], labels: true }));
      const yrs = [0, 0.5, 1, 1.5, 2, 2.5, 3];
      const p50 = yrs.map((y) => assessed.reduce((a, t) => a + riskOf(t, hiAt(t, y)), 0));
      const lo = yrs.map((y) => assessed.reduce((a, t) => a + riskOf(t, hiAt(t, y, { ...BASE, corrosion: 0.7 })), 0));
      const hi = yrs.map((y) => assessed.reduce((a, t) => a + riskOf(t, hiAt(t, y, { ...BASE, corrosion: 1.3 })), 0));
      ctx.chart('traj', fan(yrs.map((y) => (y === 0 ? 'Now' : `+${y * 12} mo`)), lo, p50, hi, { name: 'Σ risk', color: '#dc2626' }));
    },
  };
}
/** Fan chart: P10/P90 band + P50 line. */
function fan(x, lo, mid, hi, { name = 'P50', color = '#2563eb', extra = [], yName, yMin } = {}) {
  return {
    grid: ch.grid(), tooltip: ch.tip({ valueFormatter: (v) => fmt.n(v, 0) }), legend: { top: 0, right: 0, data: [name, 'P10–P90', ...extra.map((e) => e.name)] },
    xAxis: { type: 'category', data: x, boundaryGap: false }, yAxis: { type: 'value', name: yName, scale: yMin == null, min: yMin },
    series: [
      { name: 'p10', type: 'line', data: lo, stack: 'band', lineStyle: { opacity: 0 }, showSymbol: false, tooltip: { show: false }, silent: true },
      { name: 'P10–P90', type: 'line', data: hi.map((v, i) => v - lo[i]), stack: 'band', lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: `${color}26` }, itemStyle: { color: `${color}55` }, tooltip: { show: false } },
      { name, type: 'line', data: mid, smooth: true, showSymbol: true, symbolSize: 6, lineStyle: { width: 2.4, color }, itemStyle: { color } },
      ...extra.map((e) => ({ type: 'line', smooth: true, showSymbol: false, ...e })),
    ],
  };
}
function riskTrajectory() {
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c12">
      ${ui.card({ cls: 'nx-s7', title: 'Condition vs consequence — today and in 12 months', exp: true, sub: 'Each arrow is a tower: x = HI, y = criticality × consequence. Movement to the left is forecast deterioration; bubbles cross the dashed iso-risk curves (risk 200 / 500 / 1000).', body: ui.chart('mx', 'xl') })}
      ${ui.card({ cls: 'nx-s5', title: 'Fastest-deteriorating towers', exp: true, sub: 'Largest forecast HI loss over 3 years (no intervention) — the early-warning list for interval tightening.', flush: true, body: ui.table({ id: 'fct-cross', cols: [{ key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b><span class="nx-sub">${esc(t.line)} · ${esc(t.zone)}</span>` }, { key: 'hi', label: 'HI now', align: 'r', render: (t) => ui.score(r1(t.hi)) }, { key: 'h12', label: '+1 y', align: 'r', render: (t) => ui.score(r1(t.h12)) }, { key: 'h36', label: '+3 y', align: 'r', render: (t) => ui.score(r1(t.h36)) }, { label: 'Loss 3 y', align: 'r', sort: (t) => t.loss3, render: (t) => `<b class="nx-num" style="color:#dc2626">−${fmt.n(t.loss3, 1)}</b>` }, { label: 'Next band in', sort: (t) => yearsToPoor(t), align: 'r', render: (t) => (yearsToPoor(t) >= 10 ? '> 10 y' : `${fmt.n(yearsToPoor(t), 1)} y`) }], rows: towers.filter((t) => t.crosses).sort((a, b) => b.loss3 - a.loss3), rowId: (t) => t.id, empty: 'No tower is forecast to deteriorate at an accelerated rate.' }) })}
      </div><div class="nx-row nx-c3">
      ${['North', 'Coastal', 'Inland'].map((c) => ui.card({ title: `${c} corridor · ${CORR_LINE[c]}`, exp: true, sub: 'HI distribution: today (grey) vs forecast at +12 months (colour).', body: ui.chart(`hd-${c}`, 'sm') })).join('')}
      </div></div>`,
    mount: (st, ctx) => {
      const data = assessed.map((t) => ({ t, y: critOf(t) * consOf(t) + (R() - 0.5) * 0.9 }));
      const iso = (r) => Array.from({ length: 40 }, (_, i) => { const y = 4 + i * 0.55; return [clamp(100 - r / y, 0, 100), y]; });
      ctx.chart('mx', {
        grid: ch.grid({ top: 30 }), tooltip: { trigger: 'item', formatter: (p) => (p.data?.t ? `<b>${esc(p.data.t.name)}</b> · ${esc(p.data.t.line)}<br/>HI ${fmt.n(p.data.t.hi, 1)} → ${fmt.n(p.data.t.h12, 1)} (forecast)<br/>Risk ${fmt.n(p.data.t.risk, 0)} → ${fmt.n(p.data.t.r12, 0)} (forecast)<br/>not validated` : '') },
        legend: { top: 0, right: 0, data: ['Today', '+12 months'] },
        xAxis: { type: 'value', name: 'Health index', min: 0, max: 100, inverse: false }, yAxis: { type: 'value', name: 'Crit. × cons.', min: 4, max: 26, nameTextStyle: { align: 'left' } },
        series: [
          ...[200, 500, 1000].map((r) => ({ type: 'line', data: iso(r), showSymbol: false, silent: true, lineStyle: { type: 'dashed', color: RB_COLOR[riskBand(r)], width: 1 }, endLabel: { show: true, formatter: `risk ${r}`, color: RB_COLOR[riskBand(r)], fontSize: 10 }, tooltip: { show: false } })),
          { name: 'Today', type: 'scatter', symbolSize: 7, itemStyle: { color: '#94a3b8' }, data: data.map((d) => ({ value: [d.t.hi, d.y], t: d.t })) },
          { name: '+12 months', type: 'scatter', symbolSize: (v, p) => 6 + Math.sqrt(p.data.t.r12) / 5, itemStyle: { color: (p) => RB_COLOR[p.data.t.rb12], opacity: 0.85, borderColor: '#fff' }, data: data.map((d) => ({ value: [d.t.h12, d.y], t: d.t })) },
          { type: 'lines', coordinateSystem: 'cartesian2d', silent: true, lineStyle: { color: '#64748b', width: 1, opacity: 0.6 }, effect: { show: true, symbol: 'arrow', symbolSize: 5, period: 3, trailLength: 0 }, data: data.filter((d) => d.t.hi - d.t.h12 > 2).map((d) => ({ coords: [[d.t.hi, d.y], [d.t.h12, d.y]] })) },
        ],
      }, { onClick: (p) => p.data?.t && openTower(p.data.t) });
      for (const c of ['North', 'Coastal', 'Inland']) {
        const ts = assessed.filter((t) => t.corridor === c); const bins = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
        const h = (k) => bins.map((b) => ts.filter((t) => t[k] >= b && t[k] < b + 10 + (b === 90 ? 1 : 0)).length);
        ctx.chart(`hd-${c}`, { grid: ch.grid({ top: 10 }), tooltip: ch.tip({ axisPointer: { type: 'shadow' } }), xAxis: { type: 'category', data: bins.map((b) => `${b}`) }, yAxis: { type: 'value' }, series: [{ name: 'Today', type: 'bar', data: h('hi'), itemStyle: { color: '#cbd5e1', borderRadius: [3, 3, 0, 0] }, barGap: '-100%' }, { name: '+12 months', type: 'bar', data: h('h12').map((v, i) => ({ value: v, itemStyle: { color: healthColor(bins[i] + 5) } })), barWidth: '45%', itemStyle: { borderRadius: [3, 3, 0, 0] } }] });
      }
      ctx.on('click', '#fct-cross [data-row]', (e, el) => openTower(towerById.get(el.dataset.row)));
    },
  };
}
function yearsToPoor(t) { if (t.hi == null) return 99; const lim = t.hi >= 70 ? 70 : 40; for (let m = 0; m <= 120; m += 1) { if (hiAt(t, m / 12) < lim) return m / 12; } return 10; }

function recurrenceTab() {
  return {
    render: () => `<div class="nx-page">
      ${ui.callout(`Recurrence is measured across the three 2026 aerial campaigns (${campaigns.map((c) => esc(c.name)).join(', ')}). Tower families confound design and environment on this network — Lattice-Y1 sits in coastal C4 air on L-132-01, Lattice-Z2 in C3 on L-220-03, Lattice-X5 in dry C2 on L-500-01 — so read a family as “design × environment”.`, 'info', 'info')}
      <div class="nx-row nx-c2">
        ${ui.card({ title: 'Defect incidence by component group and tower family', sub: 'Confirmed + pending findings per 100 towers per campaign (rejected excluded).', body: ui.chart('rate', 'lg') })}
        ${ui.card({ title: 'Recurrence probability by defect class', exp: true, sub: 'Observed share of tower × defect pairs seen again in a later campaign, used as the recurrence estimate — the repeat-defect signal that drives shorter intervals.', body: ui.chart('rec', 'lg') })}
      </div>
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s7', title: 'Weibull wear-out curves — time to first significant defect', exp: true, sub: `R(t) = exp(−(t/η)^β) with β = ${BETA} assumed (wear-out) and η derived per family from the share of towers carrying a confirmed condition ≤ 3 finding at the family’s mean age.`, body: ui.chart('weib', 'md') })}
        ${ui.card({ cls: 'nx-s5', title: 'Model parameters', exp: true, sub: 'Characteristic life η and mean time to first significant defect (MTTF = η·Γ(1+1/β)).', flush: true, body: `${ui.table({ cols: [{ key: 'fam', label: 'Family', render: (w) => `<b>${esc(w.type)}</b><span class="nx-sub">${esc(ZONE_NAME[w.zone] || w.zone)}</span>` }, { key: 'n', label: 'Towers', align: 'r' }, { key: 'age', label: 'Mean age', align: 'r', render: (w) => `${w.age} y` }, { key: 'F', label: 'F(age)', align: 'r', render: (w) => fmt.pct(w.F * 100, 0) }, { key: 'eta', label: 'η', align: 'r', render: (w) => `<b class="nx-num">${w.eta} y</b>` }, { key: 'mttf', label: 'MTTF', align: 'r', render: (w) => `${w.mttf} y` }], rows: weib, rowId: (w) => w.fam, id: 'fct-weib' })}<div style="padding:10px 16px 14px"><div class="nx-note" style="margin-bottom:4px">Remaining margin to MTTF — mean age vs mean time to first significant defect. Click a family for detail.</div>${ui.chart('margin', 'sm')}</div>` })}
      </div></div>`,
    mount: (st, ctx) => {
      ctx.on('click', '#fct-weib tr[data-row]', (e, r) => openFamily(weib.find((w) => w.fam === r.dataset.row)));
      ctx.chart('margin', ch.bar({ x: weib.map((w) => w.type.replace('Lattice-', 'L-')), horizontal: true, series: [{ name: 'Mean age', data: weib.map((w) => w.age), color: '#94a3b8' }, { name: 'MTTF', data: weib.map((w) => ({ value: w.mttf, itemStyle: { color: w.mttf - w.age < 5 ? '#dc2626' : w.mttf - w.age < 12 ? '#f59e0b' : '#16a34a' } })), color: '#16a34a' }], yName: 'years', grid: { top: 26, right: 16 } }), { onClick: (p) => openFamily(weib[p.dataIndex]) });
      ctx.chart('rate', ch.heat({ x: families.map((f) => f.replace(' · ', '\n')), y: GROUPS.map((g) => GROUP_NAME[g] || fmt.title(g)), data: recRate, label: true, fmtv: (v) => fmt.n(v, 1), grid: { left: 10 } }));
      const fams = families;
      ctx.chart('rec', ch.heat({ x: fams.map((f) => f.replace(' · ', '\n')), y: topClasses.map((c) => DEFECT_LABEL[c] || c), data: fams.flatMap((f, xi) => topClasses.map((c, yi) => { const o = recurrence.find((r) => r.fam === f && r.cls === c); return [xi, yi, o ? Math.round((o.rec / o.n) * 100) : 0]; })), max: 100, label: true, fmtv: (v) => `${fmt.n(v, 0)}%`, colors: ['#f8fafc', '#c7d2fe', '#6366f1', '#312e81'] }));
      const ages = Array.from({ length: 61 }, (_, i) => i);
      ctx.chart('weib', {
        grid: ch.grid(), tooltip: ch.tip({ valueFormatter: (v) => `${fmt.n(v * 100, 1)}%` }), legend: { top: 0, right: 0 },
        xAxis: { type: 'category', data: ages, name: 'Age (years)', boundaryGap: false, axisLabel: { interval: 9 } }, yAxis: [{ type: 'value', name: 'R(t)', min: 0, max: 1, axisLabel: { formatter: (v) => `${v * 100}%` } }, { type: 'value', name: 'hazard h(t)', splitLine: { show: false }, axisLabel: { formatter: (v) => v.toFixed(2) } }],
        series: [
          ...weib.map((w, i) => ({ name: `${w.type} R(t)`, type: 'line', smooth: true, showSymbol: false, data: ages.map((a) => Math.exp(-((a / w.eta) ** BETA))), lineStyle: { width: 2.4, color: FAM_COLOR(i) }, itemStyle: { color: FAM_COLOR(i) }, markLine: i === 0 ? { silent: true, symbol: 'none', lineStyle: { color: '#94a3b8', type: 'dashed' }, data: weib.map((x) => ({ xAxis: String(Math.round(x.age)), label: { formatter: `${x.type.replace('Lattice-', '')} today`, fontSize: 10 } })) } : undefined })),
          ...weib.map((w, i) => ({ name: `${w.type} h(t)`, type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: ages.map((a) => (BETA / w.eta) * (a / w.eta) ** (BETA - 1)), lineStyle: { width: 1.2, type: 'dashed', color: FAM_COLOR(i) }, itemStyle: { color: FAM_COLOR(i) }, tooltip: { valueFormatter: (v) => v.toFixed(3) } })),
        ],
      });
    },
  };
}

/* ================================================================== screen 2: Inspection Planning */
function rbiPlan() {
  const calPerYear = towers.length; // annual calendar policy
  const rbiPerYear = towers.reduce((a, t) => a + (t.rbi ? 12 / t.rbi : 1), 0);
  const calCost = calPerYear * RBI_COST; const rbiCost = rbiPerYear * RBI_COST;
  const overdue = towers.filter((t) => t.overdue);
  const months = Array.from({ length: 12 }, (_, i) => { const y = Number(AS_OF.slice(0, 4)); const m0 = Number(AS_OF.slice(5, 7)) - 1 + i; return `${y + Math.floor(m0 / 12)}-${String((m0 % 12) + 1).padStart(2, '0')}`; });
  return {
    render: () => `<div class="nx-page">
      ${ui.kpis([
        { label: 'Inspections / year · RBI', exp: true, value: fmt.n(rbiPerYear, 0), icon: 'drone', tone: 'accent', sub: `vs ${calPerYear} on a 12-month calendar`, delta: ((rbiPerYear - calPerYear) / calPerYear) * 100, deltaInvert: true },
        { label: 'Annual inspection cost · RBI', exp: true, value: fmt.money(rbiCost), icon: 'dollar', tone: 'ok', sub: `est. saving ${fmt.money(calCost - rbiCost)} vs calendar`, spark: [calCost, calCost * 0.96, (calCost + rbiCost) / 2, rbiCost * 1.02, rbiCost] },
        { label: 'Towers due in 90 days', exp: true, value: dueNextQ, icon: 'calendar', tone: 'warn', sub: `${overdue.length} already overdue` },
        { label: 'Risk covered per inspection', exp: true, value: fmt.n(assessed.reduce((a, t) => a + t.r12 * (t.rbi ? 12 / t.rbi : 1), 0) / rbiPerYear, 0), icon: 'target', tone: 'violet', sub: `${fmt.n(assessed.reduce((a, t) => a + t.r12, 0) / calPerYear, 0)} on calendar — focus on what moves`, deltaSuffix: '' },
      ])}
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s5', title: 'Interval policy', exp: true, sub: 'Risk band at +12 months sets the interval; unreviewed findings cap it at 12 months (re-flight to confirm); new builds get a baseline inspection now.', body: `<div class="fct-formula">interval = f(risk₁₂) &nbsp;→&nbsp; <b>critical 3 mo</b> · high 6 mo · medium 12 mo · low 24 mo<br/>low ∧ HI ≥ 90 ∧ zone C2 → 36 mo<br/>unreviewed findings &gt; 0 → min(interval, 12 mo)</div><div style="margin-top:12px">${ui.chart('pol', 'sm')}</div>` })}
        ${ui.card({ cls: 'nx-s7', title: 'Inspections due per month — calendar vs risk-based', exp: true, sub: 'Calendar policy repeats the 2026 campaign pattern; RBI spreads the load and front-loads the risky towers.', body: ui.chart('due', 'md') })}
      </div>
      ${ui.card({ title: 'Risk-based inspection schedule', exp: true, sub: 'Every tower with its forecast risk, interval and next due date. Sort any column; click a row for the forecast.', tools: ui.search('#fct-rbi', 'Filter towers…'), flush: true, body: `<div style="max-height:520px;overflow:auto">${ui.table({ id: 'fct-rbi', cols: [
        { key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b><span class="nx-sub">${esc(t.line)} · ${esc(t.corridor)}</span>` },
        { key: 'type', label: 'Family', render: (t) => `${esc(t.type)} · ${esc(t.zone)}` },
        { key: 'hi', label: 'HI', align: 'r', render: (t) => ui.score(t.hi == null ? null : r1(t.hi)) },
        { key: 'r12', label: 'Risk +12 mo', align: 'r', render: (t) => (t.r12 == null ? '—' : `<b class="nx-num">${fmt.n(t.r12, 0)}</b>`) },
        { key: 'rb12', label: 'Band', sort: (t) => ({ critical: 4, high: 3, medium: 2, low: 1 }[t.rb12] || 0), render: (t) => sevBadge(t.rb12) },
        { key: 'last', label: 'Last inspected', render: (t) => (t.last ? fmt.date(t.last) : '<span class="nx-sub">never</span>') },
        { key: 'rbi', label: 'Interval', align: 'r', render: (t) => (t.rbi ? `${t.rbi} mo` : 'baseline') },
        { key: 'due', label: 'Next due', render: (t) => `<span class="fct-due" style="color:${t.overdue ? '#dc2626' : t.due <= addDays(AS_OF, 92) ? '#d97706' : 'inherit'}">${fmt.date(t.due)}</span>${t.overdue ? ` ${ui.badge('Overdue', 'crit')}` : ''}` },
        { key: 'open', label: 'Open', align: 'r' },
      ], rows: towers.slice().sort((a, b) => a.due.localeCompare(b.due) || (b.r12 ?? 0) - (a.r12 ?? 0)), rowId: (t) => t.id })}</div>` })}
      </div>`,
    mount: (st, ctx) => {
      const ivals = [0, 3, 6, 12, 24, 36];
      ctx.chart('pol', ch.bar({ x: ivals.map((m) => (m ? `${m} mo` : 'Baseline')), series: [{ name: 'Towers', data: ivals.map((m) => towers.filter((t) => t.rbi === m).length), color: '#6366f1' }], labels: true, legend: false }));
      const calDue = months.map((m) => { const mm = Number(m.slice(5, 7)); return { 2: 0, 5: 0, 10: 0 }[mm] !== undefined ? campaigns.find((c) => Number(c.end.slice(5, 7)) === mm)?.inspected_tower_ids.length || 0 : 0; });
      const rbiDue = months.map((m, i) => towers.filter((t) => (i === 0 ? t.due.slice(0, 7) <= m : t.due.slice(0, 7) === m)).length);
      ctx.chart('due', ch.bar({ x: months.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })), series: [{ name: 'Calendar (12-month)', data: calDue, color: '#cbd5e1' }, { name: 'Risk-based', data: rbiDue, color: '#2563eb' }] }));
      ctx.on('click', '#fct-rbi [data-row]', (e, el) => openTower(towerById.get(el.dataset.row)));
    },
  };
}
function campaignBuilder() {
  const start = addDays(AS_OF, 3);
  const findPerInsp = lineFindings.length / Math.max(1, campaigns.reduce((a, c) => a + (c.inspected_tower_ids?.length || 0), 0));
  const groups = CORRS.map((c) => {
    const due = towers.filter((t) => t.corridor === c && t.due <= addDays(AS_OF, 120)).sort((a, b) => (b.r12 ?? 9999) - (a.r12 ?? 9999));
    const days = Math.max(2, Math.ceil(due.length / 9)); // ~9 towers per drone-team day incl. mobilisation
    return { c, due, days };
  });
  let cursor = start;
  const bars = groups.map((g) => { const s = cursor; const e = addDays(s, g.days); cursor = addDays(e, 2); return { ...g, s, e }; });
  return {
    render: () => `<div class="nx-page">
      ${ui.callout(`Experimental, model-generated proposal (not a validated plan), built from the risk-based schedule: every tower due within 120 days, grouped by corridor and ordered by forecast risk, at ~9 towers per drone-team day. Weather windows assume wind &lt; 10 m/s (Absheron winter northerlies).`, 'ok', 'checkCircle')}
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s8', title: 'Proposed inspection campaign — winter 2026/27', exp: true, sub: 'Flight days per corridor; review days follow each flight block for the manual engineering review queue.', body: `${ui.gantt({ rows: bars.flatMap((b) => [{ label: `${b.c} · ${CORR_LINE[b.c]}`, sub: `${b.due.length} towers`, bars: [{ start: b.s, end: b.e, color: '#2563eb', text: `${b.days} d flights`, id: b.c }, { start: b.e, end: addDays(b.e, Math.max(1, Math.ceil(b.due.length * reviewRate / 6))), color: '#8b5cf6', text: 'QA', id: `${b.c}-r` }] }]), range: [AS_OF, addDays(AS_OF, 24)], now: AS_OF, ticks: 'week', labelW: 190 })}<div style="margin-top:16px">${ui.stats(bars.map((b) => { const r = b.due.reduce((x, t) => x + (t.r12 ?? 0), 0); const tot = bars.reduce((x, bb) => x + bb.due.reduce((y, t) => y + (t.r12 ?? 0), 0), 0) || 1; return { label: `${b.c} · ${b.days} d · ${b.due.filter((t) => t.hi == null).length} baseline`, value: `${fmt.pct((r / tot) * 100, 0)} of risk` }; }))}</div><div class="nx-note" style="margin-top:8px">Share of the campaign’s +12-month forecast risk carried by each corridor block; baseline = new-build towers never inspected.</div>` })}
        ${ui.card({ cls: 'nx-s4', title: 'Campaign summary', exp: true, body: `${ui.stats([{ label: 'Towers', value: bars.reduce((a, b) => a + b.due.length, 0) }, { label: 'Flight days', value: bars.reduce((a, b) => a + b.days, 0) }, { label: 'Est. reviews', value: Math.max(1, Math.round(bars.reduce((a, b) => a + b.due.length, 0) * findPerInsp * reviewRate)) }, { label: 'Cost', value: fmt.money(bars.reduce((a, b) => a + b.due.length, 0) * RBI_COST) }])}<div style="margin-top:12px">${ui.chart('csplit', 'sm')}</div>` })}
      </div>
      <div class="nx-row nx-c3">${bars.map((b) => ui.card({ title: `${b.c} corridor`, exp: true, sub: `${fmt.date(b.s)} → ${fmt.date(b.e)} · ${CORR_LINE[b.c]}`, flush: true, body: `<div style="max-height:320px;overflow:auto">${ui.table({ cols: [{ key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b>` }, { key: 'r12', label: 'Risk', align: 'r', render: (t) => (t.r12 == null ? 'baseline' : fmt.n(t.r12, 0)) }, { label: 'Band', render: (t) => sevBadge(t.rb12) }, { key: 'due', label: 'Due', render: (t) => fmt.short(t.due) }], rows: b.due, rowId: (t) => t.id, empty: 'Nothing due in this window.' })}</div>` })).join('')}</div>
      <div class="nx-row nx-c2">
        ${ui.card({ title: 'Risk captured as the campaign flies', exp: true, sub: 'Cumulative share of the campaign’s +12-month risk inspected after n towers (≈ 9 per flight day), flying in forecast-risk order (proposed) vs tower-number order (calendar habit).', body: ui.chart('capt', 'md') })}
        ${ui.card({ title: 'Sensor payload plan by corridor', exp: true, sub: 'Expected detections by sensor, from the 2026 finding mix of each corridor applied to the towers in this campaign.', body: ui.chart('payload', 'md') })}
      </div></div>`,
    mount: (st, ctx) => {
      const all = bars.flatMap((b) => b.due); const totR = all.reduce((a, t) => a + (t.r12 ?? 0), 0) || 1;
      const nT = all.length;
      const cum = (list) => [0, ...Array.from({ length: nT }, (_, d) => r1((list.slice(0, d + 1).reduce((a, t) => a + (t.r12 ?? 0), 0) / totR) * 100))];
      const byRisk = all.slice().sort((a, b) => (b.r12 ?? 0) - (a.r12 ?? 0)); const byIdx = all.slice().sort((a, b) => a.line.localeCompare(b.line) || (a.idx ?? 0) - (b.idx ?? 0));
      ctx.chart('capt', ch.line({ x: Array.from({ length: nT + 1 }, (_, d) => `${d}${d && d % 9 === 0 ? ' · day end' : ''}`), series: [{ name: 'Risk order (proposed)', data: cum(byRisk), color: '#2563eb', area: true, symbol: true, smooth: false }, { name: 'Tower order (calendar habit)', data: cum(byIdx), color: '#94a3b8', dash: true, symbol: true, smooth: false }], yName: '% of risk inspected', yMin: 0, yMax: 100 }));
      const SENS = ['rgb', 'thermal', 'lidar']; const SC = { rgb: '#2563eb', thermal: '#ea580c', lidar: '#14b8a6' };
      const mix = (c) => { const fs = lineFindings.filter((f) => towerById.get(f.tower_id)?.corridor === c); return Object.fromEntries(SENS.map((k) => [k, fs.filter((f) => f.sensor === k).length / Math.max(1, fs.length)])); };
      ctx.chart('payload', ch.bar({ x: bars.map((b) => `${b.c} · ${b.due.length} towers`), stack: true, series: SENS.map((k) => ({ name: k === 'rgb' ? 'RGB 45 MP' : k === 'thermal' ? 'Thermal TIR-640' : 'LiDAR L2', color: SC[k], data: bars.map((b) => r1(b.due.length * findPerInsp * mix(b.c)[k])) })), yName: 'expected detections' }));
      ctx.chart('csplit', ch.donut({ data: bars.map((b, i) => ({ name: b.c, value: b.due.length, color: ['#3b82f6', '#14b8a6', '#a855f7'][i] })), center: 'towers' }));
      ctx.on('click', '.nx-table [data-row]', (e, el) => { const t = towerById.get(el.dataset.row); if (t) openTower(t); });
    },
  };
}

/* ================================================================== screen 3: Maintenance Demand */
function demandForecast() {
  const tot = (k, i) => WL.reduce((a, c) => a + c.q[i][k], 0);
  const histHours = [0, 1, 2, 3].map((i) => histFind.reduce((a, c, ci) => a + (c[i] == null ? 0 : c[i] * confirmedShare * woPerConfirmed * hoursPerWo(CORRS[ci])), 0));
  const capTot = Object.values(capBySkill).reduce((a, b) => a + b, 0);
  return {
    render: () => `<div class="nx-page">
      ${ui.kpis([
        { label: 'Corrective labour 2027 (P50)', exp: true, value: fmt.n(QNEXT.reduce((a, _, i) => a + tot('hours', i), 0), 0), unit: 'h', icon: 'wrench', tone: 'accent', sub: `P90 ${fmt.n(QNEXT.reduce((a, _, i) => a + tot('p90', i), 0), 0)} h` },
        { label: 'Work orders 2027 (P50)', exp: true, value: fmt.n(QNEXT.reduce((a, _, i) => a + tot('wos', i), 0), 0), icon: 'clipboard', tone: 'violet', sub: `${fmt.n(woPerConfirmed, 2)} WO per confirmed finding` },
        { label: 'New findings 2027', exp: true, value: fmt.n(QNEXT.reduce((a, _, i) => a + tot('findings', i), 0), 0), icon: 'drone', tone: 'warn', sub: `${fmt.pct(confirmedShare * 100)} confirmed historically` },
        { label: 'Peak quarter utilisation', exp: true, value: fmt.pct((Math.max(...QNEXT.map((_, i) => tot('p90', i))) / capTot) * 100, 0), icon: 'users', tone: 'ok', sub: `of ${fmt.n(capTot, 0)} h productive crew capacity / qtr` },
      ])}
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s8', title: 'Corrective maintenance workload — history and 4-quarter forecast', exp: true, sub: 'Labour hours = findings × confirmed share × WO per finding × mean hours per WO (by corridor). Band is P10–P90 from an over-dispersed Poisson with an assumed φ = 1.8. 2026 Q3 had no campaign.', body: ui.chart('wl', 'lg') })}
        ${ui.card({ cls: 'nx-s4', title: 'Forecast by operating zone', exp: true, sub: '2027, P50 labour hours', body: `${ui.chart('zone', 'sm')}${ui.table({ cols: [{ key: 'c', label: 'Zone' }, ...QNEXT.map((q, i) => ({ label: q.slice(5), align: 'r', render: (r) => fmt.n(r.q[i].hours, 0), sort: (r) => r.q[i].hours }))], rows: WL.map((w) => ({ c: w.corridor, q: w.q })) })}` })}
      </div>
      <div class="nx-row nx-c2">
        ${ui.card({ title: 'Forecast work orders by work type', exp: true, sub: '2027 P50, split by the 2026 work-type mix of each corridor.', body: ui.chart('mix', 'md') })}
        ${ui.card({ title: 'Finding-to-repair conversion', sub: '2026 actuals (work-order counts read from SAP PM): how inspection evidence turns into field work. The forecast applies these ratios.', body: ui.chart('funnel', 'md') })}
      </div></div>`,
    mount: (st, ctx) => {
      const x = [...QHIST, ...QNEXT];
      const lo = [null, null, null, histHours[3], ...QNEXT.map((_, i) => tot('p10', i))];
      const hi = [null, null, null, histHours[3], ...QNEXT.map((_, i) => tot('p90', i))];
      const mid = [null, null, null, histHours[3], ...QNEXT.map((_, i) => tot('hours', i))];
      const opt = fan(x, lo.map((v) => v ?? '-'), mid.map((v) => (v == null ? '-' : Math.round(v))), hi.map((v) => v ?? '-'), { name: 'Forecast P50', color: '#2563eb', yName: 'labour h', yMin: 0, extra: [{ name: 'Actual', data: histHours.map((v, i) => (i === 2 ? '-' : Math.round(v))).concat(['-', '-', '-', '-']), lineStyle: { width: 2.4, color: '#0f172a' }, itemStyle: { color: '#0f172a' }, showSymbol: true, symbolSize: 7, smooth: false }] });
      opt.series.push(...CORRS.map((c, ci) => ({ name: c, type: 'bar', stack: 'z', barWidth: 18, data: [...histFind[ci].map((v, i) => (v == null ? '-' : Math.round(v * confirmedShare * woPerConfirmed * hoursPerWo(c)))), ...WL[ci].q.map((q) => Math.round(q.hours))], itemStyle: { color: ['#93c5fd', '#5eead4', '#d8b4fe'][ci], opacity: 0.7 } })));
      opt.legend.data.push(...CORRS);
      ctx.chart('wl', opt);
      const types = [...new Set(net.workOrders.map((w) => w.work_type))];
      const typeShare = (c, ty) => { const ws = net.workOrders.filter((w) => w.corridor === c); return ws.length ? ws.filter((w) => w.work_type === ty).length / ws.length : 0; };
      ctx.chart('mix', ch.bar({ x: QNEXT, stack: true, grid: { top: 64 }, series: types.map((ty) => ({ name: fmt.title(ty), data: QNEXT.map((_, i) => r1(WL.reduce((a, w) => a + w.q[i].wos * typeShare(w.corridor, ty), 0))) })) }));
      const fAll = net.findings.length; const fRev = net.findings.filter((f) => f.review_status !== 'pending').length; const fConf = net.findings.filter((f) => f.review_status === 'confirmed').length;
      const wo = net.workOrders.length; const woOut = net.workOrders.filter((w) => w.outage).length; const done = net.workOrders.filter((w) => w.status === 'completed').length;
      ctx.chart('funnel', { tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b>' }, series: [{ type: 'funnel', left: '8%', width: '84%', top: 10, bottom: 10, minSize: '18%', sort: 'descending', gap: 3, label: { show: true, position: 'inside', formatter: '{b}  {c}', color: '#fff', fontSize: 12, fontWeight: 600 }, itemStyle: { borderColor: '#fff', borderWidth: 1 }, data: [{ name: 'AI findings', value: fAll, itemStyle: { color: '#1e3a8a' } }, { name: 'Reviewed', value: fRev, itemStyle: { color: '#2563eb' } }, { name: 'Confirmed', value: fConf, itemStyle: { color: '#3b82f6' } }, { name: 'Work orders', value: wo, itemStyle: { color: '#8b5cf6' } }, { name: 'Completed', value: done, itemStyle: { color: '#14b8a6' } }, { name: 'Needed an outage', value: woOut, itemStyle: { color: '#f59e0b' } }] }] });
      ctx.chart('zone', ch.donut({ data: WL.map((w, i) => ({ name: `${w.corridor}`, value: Math.round(w.q.reduce((a, q) => a + q.hours, 0)), color: ['#3b82f6', '#14b8a6', '#a855f7'][i] })), center: 'labour h' }));
    },
  };
}
function crewDemand() {
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c2">
      ${ui.card({ title: 'Crew demand vs capacity by trade — 2027 Q1', exp: true, sub: 'Demand = corridor forecast × historical labour mix by trade (P50, P90 whisker). Capacity = crew size × 36 h × 13 weeks × 32 % wrench time.', body: ui.chart('skill', 'lg') })}
      ${ui.card({ title: 'Crew-weeks required by zone and quarter', exp: true, sub: 'P90 labour hours ÷ (5 people × 36 h). Darker cells need more crews mobilised into that zone.', body: ui.chart('cw', 'lg') })}
      </div>
      ${ui.card({ title: 'Crews and depots', sub: 'Current crews from Field Operations with their quarterly productive capacity. The forecast load column is estimate.', flush: true, body: ui.table({ cols: [{ key: 'id', label: 'Crew', render: (c) => `<b>${esc(c.id)}</b><span class="nx-sub">${esc(c.name)}</span>` }, { key: 'skill', label: 'Trade', render: (c) => SKILL_NAME[c.skill] || c.skill }, { key: 'baseName', label: 'Depot' }, { key: 'size', label: 'People', align: 'r' }, { label: 'Capacity / qtr', align: 'r', sort: (c) => c.size * 36 * 13 * 0.32, render: (c) => `${fmt.n(c.size * 36 * 13 * 0.32, 0)} h` }, { label: 'Forecast load Q1', sort: (c) => load(c), render: (c) => ui.meter(load(c), 120, load(c) > 100 ? '#dc2626' : load(c) > 85 ? '#d97706' : '#16a34a', fmt.pct(load(c), 0)) }], rows: net.crews, rowId: (c) => c.id, id: 'fct-crews' }) })}
      </div>`,
    mount: (st, ctx) => {
      const q0 = WL.reduce((a, c) => a + c.q[0].hours, 0); const q0p90 = WL.reduce((a, c) => a + c.q[0].p90, 0);
      const dem = SKILLS.map((k) => Math.round(q0 * mixBySkill[k])); const dem90 = SKILLS.map((k) => Math.round(q0p90 * mixBySkill[k]));
      ctx.chart('skill', { ...ch.bar({ x: SKILLS.map((k) => SKILL_NAME[k] || k), horizontal: true, series: [{ name: 'Capacity', data: SKILLS.map((k) => Math.round(capBySkill[k])), color: '#e2e8f0' }, { name: 'Demand P50', data: dem.map((v, i) => ({ value: v, itemStyle: { color: v > capBySkill[SKILLS[i]] ? '#dc2626' : '#2563eb' } })), color: '#2563eb' }] }), series: [{ name: 'Capacity', type: 'bar', data: SKILLS.map((k) => Math.round(capBySkill[k])), barGap: '-100%', barWidth: 20, itemStyle: { color: '#e2e8f0', borderRadius: [0, 4, 4, 0] } }, { name: 'Demand P50', type: 'bar', barWidth: 10, data: dem.map((v, i) => ({ value: v, itemStyle: { color: v > capBySkill[SKILLS[i]] ? '#dc2626' : '#2563eb', borderRadius: [0, 4, 4, 0] } })) }, { name: 'P90', type: 'scatter', symbol: 'rect', symbolSize: [3, 16], data: dem90, itemStyle: { color: '#0f172a' } }] });
      ctx.on('click', '#fct-crews tr[data-row]', (e, r) => openCrew(net.crews.find((c) => c.id === r.dataset.row)));
      const cells = []; CORRS.forEach((c, yi) => QNEXT.forEach((q, xi) => cells.push([xi, yi, r1(WL[yi].q[xi].p90 / (5 * 36))])));
      ctx.chart('cw', ch.heat({ x: QNEXT, y: CORRS.map((c) => `${c} · ${CORR_LINE[c]}`), data: cells, label: true, fmtv: (v) => `${fmt.n(v, 1)} cw`, colors: ['#ecfeff', '#67e8f9', '#f59e0b', '#dc2626'] }));
    },
  };
}
function load(c) { const q0 = WL.reduce((a, x) => a + x.q[0].hours, 0); const share = q0 * mixBySkill[c.skill] / Math.max(1, net.crews.filter((x) => x.skill === c.skill).length); return Math.round((share / (c.size * 36 * 13 * 0.32)) * 100 + 35 + (c.utilisation - 75) * 0.4); }

/* ================================================================== screen 4: Asset Deterioration */
function decayCurves() {
  const yrs = Array.from({ length: 41 }, (_, i) => i);
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c12">
      ${ui.card({ cls: 'nx-s7', title: 'Health-index decay by corrosivity zone — 20-year cohort projection', exp: true, sub: 'Mean projected HI of today’s assessed towers per ISO 9223 zone (line) with the P10–P90 spread across towers (band). No intervention; storm loss at baseline.', body: ui.chart('decay', 'xl') })}
      ${ui.card({ cls: 'nx-s5', title: 'Model coefficients', exp: true, sub: 'Engineering assumptions, not fitted to real inspection data.', body: `<div class="fct-formula">HI(t) = HI₀ · e<sup>−k·t</sup> − <b>0.4</b>·storm·t<br/>k = k<sub>zone</sub> × (1 + 0.012·max(0, age − 15)) × (1 + 0.08·open + 0.25·[worst ≤ 2])</div><div style="margin-top:12px">${ui.table({ cols: [{ key: 'z', label: 'Zone' }, { key: 'k', label: 'k_zone /y', align: 'r' }, { key: 'half', label: 'HI half-life', align: 'r' }, { key: 'n', label: 'Towers', align: 'r' }], rows: Object.entries(K_ZONE).map(([z, k]) => ({ z: ZONE_NAME[z], k: k.toFixed(3), half: `${fmt.n(Math.log(2) / k, 0)} y`, n: assessed.filter((t) => t.zone === z).length })) })}</div><div style="margin-top:12px">${ui.chart('kdist', 'sm')}</div>` })}
      </div>
      ${ui.card({ title: 'Measured HI vs age — today’s assessed towers', sub: 'Each dot is an assessed tower; size = open findings; colour = corrosivity zone. The wedge widens with age. Shown for context: the decay coefficients above are assumptions and have not been fitted to these points.', body: ui.chart('sc', 'md') })}
      </div>`,
    mount: (st, ctx) => {
      const zones = ['C2', 'C3', 'C4'];
      const zc = { C2: '#14b8a6', C3: '#2563eb', C4: '#ea580c' };
      const yrs20 = Array.from({ length: 21 }, (_, i) => i);
      const pct = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };
      const series = [];
      for (const z of zones) {
        const ts = assessed.filter((t) => t.zone === z);
        const at = yrs20.map((y) => ts.map((t) => hiAt(t, y)));
        const lo = at.map((a) => r1(pct(a, 0.1))); const hi = at.map((a) => r1(pct(a, 0.9))); const mean = at.map((a) => r1(a.reduce((p, v) => p + v, 0) / a.length));
        series.push({ name: `${z} p10`, type: 'line', stack: z, data: lo, lineStyle: { opacity: 0 }, showSymbol: false, tooltip: { show: false }, silent: true });
        series.push({ name: `${z} band`, type: 'line', stack: z, data: hi.map((v, i) => r1(v - lo[i])), lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: `${zc[z]}22` }, tooltip: { show: false }, silent: true });
        series.push({ name: ZONE_NAME[z], type: 'line', data: mean, smooth: true, showSymbol: false, lineStyle: { width: 2.8, color: zc[z] }, itemStyle: { color: zc[z] } });
      }
      series.push({ type: 'line', data: [], markArea: { silent: true, data: [[{ yAxis: 0, itemStyle: { color: 'rgba(220,38,38,.06)' }, label: { show: true, position: 'insideBottomRight', formatter: 'Poor < 40', color: '#b91c1c', fontSize: 10 } }, { yAxis: 40 }], [{ yAxis: 40, itemStyle: { color: 'rgba(217,119,6,.05)' }, label: { show: true, position: 'insideBottomRight', formatter: 'Moderate 40–69', color: '#b45309', fontSize: 10 } }, { yAxis: 70 }]] } });
      ctx.chart('decay', { grid: ch.grid(), tooltip: ch.tip({ valueFormatter: (v) => fmt.n(v, 1) }), legend: { top: 0, right: 0, data: zones.map((z) => ZONE_NAME[z]) }, xAxis: { type: 'category', data: yrs20.map((y) => String(2026 + y)), boundaryGap: false, axisLabel: { interval: 3 } }, yAxis: { type: 'value', name: 'HI', min: 0, max: 100 }, series });
      const ks = assessed.map((t) => rate(t)); const bins = Array.from({ length: 10 }, (_, i) => 0.008 + i * 0.006);
      ctx.chart('kdist', ch.bar({ x: bins.map((b) => b.toFixed(3)), series: [{ name: 'Towers', data: bins.map((b) => ks.filter((k) => k >= b && k < b + 0.006).length), color: '#8b5cf6' }], legend: false }));
      ctx.chart('sc', { grid: ch.grid(), tooltip: { trigger: 'item', formatter: (p) => `<b>${esc(p.data[3])}</b><br/>Age ${fmt.n(p.data[0], 0)} y · HI ${p.data[1]} · ${p.data[2]} open` }, legend: { top: 0, right: 0 }, xAxis: { type: 'value', name: 'Age (years)', min: 0, max: 30 }, yAxis: { type: 'value', name: 'HI', min: 0, max: 100 }, series: zones.map((z) => ({ name: ZONE_NAME[z], type: 'scatter', data: assessed.filter((t) => t.zone === z).map((t) => [t.age + (R() - 0.5) * 0.7, r1(t.hi), t.open, `${t.name} · ${t.line}`]), symbolSize: (d) => 6 + d[2] * 4, itemStyle: { color: zc[z], opacity: 0.7, borderColor: '#fff' } })) });
    },
  };
}
function survival() {
  const yrs = Array.from({ length: 21 }, (_, i) => i);
  const surv = (pred) => yrs.map((y) => r1((assessed.filter(pred).filter((t) => hiAt(t, y) >= 40).length / Math.max(1, assessed.filter(pred).length)) * 100));
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c2">
      ${ui.card({ title: 'Survival curves — forward projection by corrosivity zone', exp: true, sub: 'Share of today’s assessed towers still above the poor threshold (solid, HI ≥ 40) and still normal (dashed, HI ≥ 70) after t years without intervention.', body: ui.chart('surv', 'lg') })}
      ${ui.card({ title: 'Survival by voltage level', exp: true, sub: 'Same projection by circuit. 500 kV towers are youngest and sit in dry inland air.', body: ui.chart('survkv', 'lg') })}
      </div><div class="nx-row nx-c2">
      ${ui.card({ title: 'Median years to band change', exp: true, sub: 'Time until half of each zone cohort falls below HI 70 and HI 40 (no intervention).', body: ui.chart('med', 'sm') })}
      ${ui.card({ title: 'Transformer deterioration signal — online DGA', sub: 'Dissolved gases at S-1 and S-2 transformers (IEC 60599). Rising H₂ / C₂H₂ indicates discharge activity.', body: ui.chart('dga', 'sm') })}
      </div></div>`,
    mount: (st, ctx) => {
      const zc = { C2: '#14b8a6', C3: '#2563eb', C4: '#ea580c' };
      const surv70 = (pred) => yrs.map((y) => r1((assessed.filter(pred).filter((t) => hiAt(t, y) >= 70).length / Math.max(1, assessed.filter(pred).length)) * 100));
      ctx.chart('surv', ch.line({ x: yrs.map(String), series: ['C2', 'C3', 'C4'].flatMap((z) => [{ name: `${z} · HI ≥ 40`, data: surv((t) => t.zone === z), color: zc[z], step: 'end', smooth: false, width: 2.4 }, { name: `${z} · HI ≥ 70`, data: surv70((t) => t.zone === z), color: zc[z], step: 'end', smooth: false, dash: true, width: 1.6 }]), yMin: 0, yMax: 100, yName: '% surviving' }));
      ctx.chart('survkv', ch.line({ x: yrs.map(String), series: [[132, '#14b8a6'], [220, '#3b82f6'], [500, '#a855f7']].map(([kv, c]) => ({ name: `${kv} kV`, data: surv((t) => t.kv === kv), color: c, step: 'end', smooth: false, area: true, areaAlpha: '14' })), yMin: 0, yMax: 100, yName: '% surviving' }));
      const medY = (z, lim) => { const ts = assessed.filter((t) => t.zone === z); for (let y = 0; y <= 40; y += 0.5) { if (ts.filter((t) => hiAt(t, y) >= lim).length / ts.length < 0.5) return y; } return 40; };
      const zs = [['C4', 'C4 coastal'], ['C3', 'C3 urban'], ['C2', 'C2 inland']];
      ctx.chart('med', ch.bar({ x: zs.map((z) => z[1]), horizontal: true, series: [{ name: 'to moderate (HI < 70)', data: zs.map(([z]) => medY(z, 70)), color: '#f59e0b', labelFmt: (p) => (p.value >= 40 ? '> 40 y' : `${p.value} y`) }, { name: 'to poor (HI < 40)', data: zs.map(([z]) => medY(z, 40)), color: '#dc2626', labelFmt: (p) => (p.value >= 40 ? '> 40 y' : `${p.value} y`) }], labels: true }));
      const txs = net.transformers.filter((t) => t.dga?.length);
      ctx.chart('dga', { tooltip: ch.tip(), legend: { bottom: 0, type: 'scroll' }, grid: ch.grid({ bottom: 28 }), xAxis: { type: 'category', data: txs[0].dga.map((d) => d.date.slice(0, 7)), boundaryGap: false }, yAxis: [{ type: 'value', name: 'H₂ ppm' }, { type: 'value', name: 'C₂H₂ ppm', splitLine: { show: false } }], series: [...txs.map((t, i) => ({ name: `${t.name} H₂`, type: 'line', smooth: true, showSymbol: false, data: t.dga.map((d) => d.h2), lineStyle: { width: 1.8 }, itemStyle: { color: ['#2563eb', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444', '#0ea5e9', '#64748b'][i % 7] } })), ...txs.filter((t) => (t.dga.at(-1)?.c2h2 ?? 0) > 2).map((t) => ({ name: `${t.name} C₂H₂`, type: 'line', yAxisIndex: 1, smooth: true, data: t.dga.map((d) => d.c2h2), lineStyle: { type: 'dashed', width: 2, color: '#dc2626' }, itemStyle: { color: '#dc2626' } }))] });
    },
  };
}
function projections() {
  const rows = assessed.slice().sort((a, b) => a.h60 - b.h60);
  return {
    render: () => `<div class="nx-page">
      ${ui.kpis([1, 3, 5].map((y) => { const k = { 1: 'h12', 3: 'h36', 5: 'h60' }[y]; const poor = assessed.filter((t) => t[k] < 40).length; return { label: `Poor-band towers at +${y} y`, exp: true, value: poor, icon: 'trendDown', tone: poor > 20 ? 'crit' : 'warn', sub: `${assessed.filter((t) => t[k] >= 40 && t[k] < 70).length} moderate · mean HI ${fmt.n(assessed.reduce((a, t) => a + t[k], 0) / assessed.length, 1)}` }; }).concat([{ label: 'Poor-band towers today', value: assessed.filter((t) => t.band === 'poor').length, icon: 'tower', tone: 'accent', sub: `${assessed.length} assessed of ${towers.length}` }]))}
      ${ui.card({ title: 'Predicted health index per tower', exp: true, sub: 'No-intervention projection at +1, +3 and +5 years. Sorted by +5-year HI; trend shows 2026→2036.', tools: ui.search('#fct-proj', 'Filter towers…'), flush: true, body: `<div style="max-height:420px;overflow:auto">${ui.table({ id: 'fct-proj', cols: [
        { key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b><span class="nx-sub">${esc(t.line)}</span>` }, { key: 'zone', label: 'Zone' }, { key: 'age', label: 'Age', align: 'r', render: (t) => `${t.age} y` },
        { key: 'hi', label: 'Today', align: 'r', render: (t) => ui.score(r1(t.hi)) }, { key: 'h12', label: '+1 y', align: 'r', render: (t) => ui.score(r1(t.h12)) }, { key: 'h36', label: '+3 y', align: 'r', render: (t) => ui.score(r1(t.h36)) }, { key: 'h60', label: '+5 y', align: 'r', render: (t) => ui.score(r1(t.h60)) },
        { label: '10-year path', sort: false, render: (t) => `<div style="width:140px">${miniSpark(projSeries(t))}</div>` }, { label: 'Band +5 y', sort: (t) => t.h60, render: (t) => hbBadge(hiBand(t.h60)) },
      ], rows, rowId: (t) => t.id })}</div>` })}
      <div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s7', title: 'Band transitions — today → +5 years', exp: true, sub: 'Flow of assessed towers between health bands with no intervention. Width = number of towers.', body: ui.chart('flow', 'lg') })}
        ${ui.card({ cls: 'nx-s5', title: 'Fleet HI spread by horizon', exp: true, sub: 'Box = interquartile range, whiskers = min / max of predicted HI across assessed towers.', body: ui.chart('box', 'lg') })}
      </div></div>`,
    mount: (st, ctx) => {
      ctx.on('click', '#fct-proj [data-row]', (e, el) => openTower(towerById.get(el.dataset.row)));
      const B = ['normal', 'moderate', 'poor']; const BC = { normal: '#16a34a', moderate: '#f59e0b', poor: '#dc2626' };
      const links = []; for (const a of B) for (const b of B) { const v = assessed.filter((t) => hiBand(t.hi) === a && hiBand(t.h60) === b).length; if (v) links.push({ source: `Today · ${a}`, target: `+5 y · ${b}`, value: v }); }
      const nodes = [...B.map((b) => ({ name: `Today · ${b}`, itemStyle: { color: BC[b] } })), ...B.map((b) => ({ name: `+5 y · ${b}`, itemStyle: { color: BC[b] } }))].filter((n) => links.some((l) => l.source === n.name || l.target === n.name));
      ctx.chart('flow', { tooltip: { trigger: 'item', formatter: (p) => (p.dataType === 'edge' ? `${esc(p.data.source)} → ${esc(p.data.target)}<br/><b>${p.data.value} towers</b>` : `${esc(p.name)}<br/><b>${p.value} towers</b>`) }, series: [{ type: 'sankey', left: 10, right: 110, top: 10, bottom: 10, nodeWidth: 16, nodeGap: 14, data: nodes, links, lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 }, label: { color: '#334155', fontSize: 11.5 }, emphasis: { focus: 'adjacency' } }] });
      const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i); return r1(a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo)); };
      const hz = [['Today', 'hi'], ['+1 y', 'h12'], ['+3 y', 'h36'], ['+5 y', 'h60']];
      ctx.chart('box', { grid: ch.grid({ top: 16 }), tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/>max ${p.data[5]} · Q3 ${p.data[4]}<br/>median <b>${p.data[3]}</b><br/>Q1 ${p.data[2]} · min ${p.data[1]}` }, xAxis: { type: 'category', data: hz.map((h) => h[0]) }, yAxis: { type: 'value', min: 0, max: 100, name: 'HI' }, series: [{ type: 'boxplot', data: hz.map(([, k]) => { const v = assessed.map((t) => t[k]); return [q(v, 0), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 1)]; }), itemStyle: { color: '#dbeafe', borderColor: '#2563eb' }, markArea: { silent: true, data: [[{ yAxis: 0, itemStyle: { color: 'rgba(220,38,38,.06)' } }, { yAxis: 40 }]] } }] });
    },
  };
}
function miniSpark(v) { const w = 140; const h = 24; const pts = v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * w} ${h - (y / 100) * h}`).join(' '); const c = healthColor(v[v.length - 1]); return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="0" y1="${h - 0.4 * h}" x2="${w}" y2="${h - 0.4 * h}" stroke="#fecaca" stroke-dasharray="3 3"/><path d="${pts}" fill="none" stroke="${c}" stroke-width="1.8"/></svg>`; }

/* ================================================================== screen 5: Scenario Analysis */
function whatIf() {
  const S = { ...BASE };
  const sliders = [
    ['budget', 'Inspection budget', 'k$/year · drone flights + manual reviews', 30, 300, 5, (v) => `$${v}k`],
    ['crews', 'Maintenance crews', 'Crews available for corrective work', 2, 14, 1, (v) => `${v}`],
    ['corrosion', 'Corrosion acceleration', '× zone decay rate (climate, pollution, coastal spray)', 0.6, 2, 0.05, (v) => `×${Number(v).toFixed(2)}`],
    ['storm', 'Storm frequency', '× baseline severe-wind / ice events per year', 0.5, 3, 0.1, (v) => `×${Number(v).toFixed(1)}`],
  ];
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c12">
      ${ui.card({ cls: 'nx-s3', title: 'Scenario inputs', sub: 'Move a slider — the 10-year fleet simulation reruns instantly.', body: `<div>${sliders.map(([k, l, s, mn, mx, stp, f]) => `<div class="fct-sl"><label for="fct-${k}">${esc(l)}</label><output id="fct-o-${k}">${f(S[k])}</output><input type="range" id="fct-${k}" data-k="${k}" min="${mn}" max="${mx}" step="${stp}" value="${S[k]}"/><small>${esc(s)}</small></div>`).join('')}</div><div class="nx-toolbar" style="margin-top:12px">${ui.btn('Reset to baseline', { sm: true, ic: 'sync', attrs: 'data-reset' })}${ui.btn('Save scenario', { sm: true, primary: true, ic: 'download', attrs: 'data-save' })}</div><div class="nx-note" style="margin-top:12px">Each year: every tower decays by its zone rate; crews restore the highest-risk detected towers below normal (HI &lt; 70) to HI 88, capacity ≈ 0.45 major restorations per crew-year. Detection = budget ÷ budget needed for the RBI programme. These are assumptions of the what-if engine, not derived from real maintenance records.</div><div style="margin-top:14px;border-top:1px solid var(--nx-line-2);padding-top:12px"><b style="font-size:12.5px">Lever sensitivity</b> ${ui.exp('Simulated')}<div class="nx-note">Year-5 Σ risk change for ±25 % on each lever around the current inputs.</div>${ui.chart('tor', 'sm')}</div>` })}
      <div class="nx-s9 nx-page" style="gap:16px">
        <div id="fct-skpi"></div>
        <div class="nx-row nx-c2">
          ${ui.card({ title: 'Towers below normal condition — scenario vs baseline', sub: '10-year fleet simulation: poor (HI < 40) and moderate (40–69) stacked; dashed = baseline total.', body: ui.chart('sp', 'md') })}
          ${ui.card({ title: 'Fleet risk exposure', sub: 'Σ (100 − HI) × criticality × consequence over assessed towers.', body: ui.chart('se', 'md') })}
        </div>
        <div class="nx-row nx-c2">
          ${ui.card({ title: 'What moves year-5 risk exposure', sub: 'Waterfall from baseline to this scenario, one lever at a time.', body: ui.chart('wf', 'md') })}
          ${ui.card({ title: 'Corrective backlog', sub: 'HI-point deficit below 70 × 6 labour h — work the crews could not reach.', body: ui.chart('sb', 'md') })}
        </div>
      </div></div></div>`,
    mount: (st, ctx) => {
      const years = SIM0.years.map(String);
      function draw() {
        const sim = simulate(S);
        const y5 = 5;
        st.querySelector('#fct-skpi').innerHTML = ui.kpis([
          { label: 'Towers below normal in 5 y', value: sim.sub[y5], icon: 'tower', tone: sim.sub[y5] > SIM0.sub[y5] ? 'crit' : 'ok', delta: sim.sub[y5] - SIM0.sub[y5], deltaSuffix: ' towers', deltaInvert: true, sub: `baseline ${SIM0.sub[y5]} · ${sim.poor[y5]} poor` },
          { label: 'Risk exposure in 5 y', value: fmt.n(sim.exposure[y5], 0), icon: 'trend', tone: 'warn', delta: ((sim.exposure[y5] - SIM0.exposure[y5]) / SIM0.exposure[y5]) * 100, deltaInvert: true, sub: `baseline ${fmt.n(SIM0.exposure[y5], 0)}` },
          { label: 'Defect detection', value: fmt.pct(sim.detect * 100, 0), icon: 'drone', tone: sim.detect < 0.9 ? 'warn' : 'ok', sub: `needs ${fmt.money(sim.need)}/y for full RBI` },
          { label: 'Tower restorations / year', value: sim.repairsPerYear, icon: 'wrench', tone: 'violet', sub: `baseline ${SIM0.repairsPerYear}` },
        ]);
        ctx.chart('sp', { ...ch.bar({ x: years, stack: true, series: [{ name: 'Scenario · poor', data: sim.poor, color: '#dc2626' }, { name: 'Scenario · moderate', data: sim.moderate, color: '#f59e0b' }], yName: 'towers' }), series: [{ name: 'Scenario · poor', type: 'bar', stack: 'a', data: sim.poor, itemStyle: { color: '#dc2626' }, barWidth: 16 }, { name: 'Scenario · moderate', type: 'bar', stack: 'a', data: sim.moderate, itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } }, { name: 'Baseline below normal', type: 'line', data: SIM0.sub, lineStyle: { type: 'dashed', color: '#475569', width: 2 }, itemStyle: { color: '#475569' }, symbol: 'circle', symbolSize: 5 }], legend: { top: 0, right: 0 } });
        ctx.chart('se', ch.line({ x: years, series: [{ name: 'Baseline', data: SIM0.exposure, color: '#94a3b8', dash: true }, { name: 'Scenario', data: sim.exposure, color: '#7c3aed', area: true }], yName: 'Σ risk' }));
        ctx.chart('sb', ch.bar({ x: years, series: [{ name: 'Baseline', data: SIM0.backlog, color: '#cbd5e1' }, { name: 'Scenario', data: sim.backlog, color: '#ea580c' }], yName: 'labour h' }));
        // tornado: ±25 % on each lever around the current inputs
        const e0 = simulate(S, 5).exposure[5];
        const lev = [['budget', 'Budget'], ['crews', 'Crews'], ['corrosion', 'Corrosion'], ['storm', 'Storms']].map(([k, n]) => { const lo = simulate({ ...S, [k]: k === 'crews' ? Math.max(1, Math.round(S[k] * 0.75)) : S[k] * 0.75 }, 5).exposure[5] - e0; const hi = simulate({ ...S, [k]: k === 'crews' ? Math.round(S[k] * 1.25) : S[k] * 1.25 }, 5).exposure[5] - e0; return { n, lo: Math.round(lo), hi: Math.round(hi) }; }).sort((a, b) => Math.max(Math.abs(b.lo), Math.abs(b.hi)) - Math.max(Math.abs(a.lo), Math.abs(a.hi)));
        ctx.chart('tor', { grid: { left: 8, right: 14, top: 22, bottom: 4, containLabel: true }, legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10 } }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v > 0 ? '+' : ''}${fmt.n(v, 0)} Σ risk` }, xAxis: { type: 'value', axisLabel: { fontSize: 9 } }, yAxis: { type: 'category', data: lev.map((l) => l.n), inverse: true, axisLabel: { fontSize: 10.5 } }, series: [{ name: '−25 %', type: 'bar', stack: 't', data: lev.map((l) => l.lo), itemStyle: { color: '#16a34a' }, barWidth: 12 }, { name: '+25 %', type: 'bar', stack: 't', data: lev.map((l) => l.hi), itemStyle: { color: '#dc2626' }, barWidth: 12 }], animation: false });
        // waterfall: apply levers one at a time
        const steps = [['Baseline', BASE], ['Corrosion', { ...BASE, corrosion: S.corrosion }], ['Storms', { ...BASE, corrosion: S.corrosion, storm: S.storm }], ['Budget', { ...BASE, corrosion: S.corrosion, storm: S.storm, budget: S.budget }], ['Crews', { ...S }]];
        const vals = steps.map(([, s]) => simulate(s, 5).exposure[5]);
        const base = []; const up = []; const down = [];
        vals.forEach((v, i) => { if (i === 0) { base.push(0); up.push(v); down.push('-'); return; } const d = v - vals[i - 1]; base.push(Math.min(v, vals[i - 1])); up.push(d > 0 ? d : '-'); down.push(d < 0 ? -d : '-'); });
        const xs = [...steps.map((s) => s[0]), 'Scenario']; base.push(0); up.push(vals[vals.length - 1]); down.push('-');
        const floor = Math.floor(Math.min(...vals) * 0.97 / 500) * 500;
        const base2 = base.map((v, i) => (i === 0 || i === xs.length - 1 ? floor : v)); const up2 = up.map((v, i) => (i === 0 || i === xs.length - 1 ? (v === '-' ? v : v - floor) : v));
        base.splice(0, base.length, ...base2); up.splice(0, up.length, ...up2);
        ctx.chart('wf', { grid: ch.grid(), tooltip: ch.tip({ axisPointer: { type: 'shadow' }, formatter: (ps) => { const i = ps[0].dataIndex; const total = i === 0 || i === xs.length - 1 ? vals[i === 0 ? 0 : vals.length - 1] : null; const d = i > 0 && i < xs.length - 1 ? vals[i] - vals[i - 1] : null; return `<b>${esc(xs[i])}</b><br/>${total != null ? `Σ risk year 5: <b>${fmt.n(total, 0)}</b>` : `${d >= 0 ? '+' : '−'}${fmt.n(Math.abs(d), 0)} → ${fmt.n(vals[i], 0)}`}`; } }), xAxis: { type: 'category', data: xs }, yAxis: { type: 'value', min: floor }, series: [{ type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, tooltip: { show: false } }, { name: 'Increase', type: 'bar', stack: 'w', data: up.map((v, i) => (i === 0 || i === xs.length - 1 ? { value: v, itemStyle: { color: '#475569' } } : v)), itemStyle: { color: '#dc2626' }, label: { show: true, position: 'top', fontSize: 10, color: '#475569', formatter: (p) => (p.value === '-' ? '' : fmt.n(p.dataIndex === 0 || p.dataIndex === xs.length - 1 ? p.value + floor : p.value, 0)) } }, { name: 'Decrease', type: 'bar', stack: 'w', data: down, itemStyle: { color: '#16a34a' }, label: { show: true, position: 'bottom', fontSize: 10, color: '#15803d', formatter: (p) => (p.value === '-' ? '' : `−${fmt.n(p.value, 0)}`) } }] });
      }
      ctx.on('input', 'input[type=range]', (e, el) => { const k = el.dataset.k; S[k] = Number(el.value); const def = sliders.find((s) => s[0] === k); st.querySelector(`#fct-o-${k}`).textContent = def[6](S[k]); draw(); });
      ctx.on('click', '[data-reset]', () => { Object.assign(S, BASE); for (const [k] of sliders) { st.querySelector(`#fct-${k}`).value = S[k]; st.querySelector(`#fct-o-${k}`).textContent = sliders.find((s) => s[0] === k)[6](S[k]); } draw(); });
      ctx.on('click', '[data-save]', () => toast(`Scenario saved: budget $${S.budget}k, ${S.crews} crews, corrosion ×${S.corrosion}, storms ×${S.storm}`));
      draw();
    },
  };
}
const PRESETS = [
  { id: 'bau', name: 'Business as usual', note: 'Current $120k inspection budget, 8 crews, today’s climate.', s: { ...BASE } },
  { id: 'cut', name: 'Budget cut 30 %', note: 'Inspection budget −30 %, two crews released.', s: { ...BASE, budget: 84, crews: BASE.crews - 2 } },
  { id: 'rbi', name: 'Accelerated RBI programme', note: 'Full RBI funding plus contingency, four extra crews.', s: { ...BASE, budget: 200, crews: BASE.crews + 4 } },
  { id: 'clim', name: 'Climate stress 2030', note: 'Corrosion ×1.4 and storms ×2, current resources.', s: { ...BASE, corrosion: 1.4, storm: 2 } },
  { id: 'clim2', name: 'Climate stress, mitigated', note: 'Climate stress with accelerated RBI resources.', s: { ...BASE, corrosion: 1.4, storm: 2, budget: 200, crews: BASE.crews + 6 } },
];
function compare() {
  const sims = PRESETS.map((p) => ({ ...p, sim: simulate(p.s) }));
  const cost = (p) => p.s.budget * 1000 + p.s.crews * 410000; // annual crew cost incl. vehicles
  return {
    render: () => `<div class="nx-page"><div class="nx-row nx-c2">
      ${ui.card({ title: 'Towers below normal condition — preset scenarios', sub: '10-year simulation per scenario (HI < 70).', body: ui.chart('cmp', 'lg') })}
      ${ui.card({ title: 'Scenario profile at year 5', sub: 'Normalised to the worst scenario on each axis (outer = worse).', body: ui.chart('radar', 'lg') })}
      </div>
      ${ui.card({ title: 'Scenario comparison', sub: 'Annual cost = inspection budget + crews × $410k (labour, vehicles, tools). Risk avoided relative to business-as-usual.', flush: true, body: ui.table({ cols: [{ key: 'name', label: 'Scenario', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.note)}</span>` }, { label: 'Budget', align: 'r', render: (p) => `$${p.s.budget}k`, sort: (p) => p.s.budget }, { label: 'Crews', align: 'r', render: (p) => p.s.crews, sort: (p) => p.s.crews }, { label: 'Below normal y5', align: 'r', render: (p) => `<b>${p.sim.sub[5]}</b> <span class="nx-sub" style="display:inline">(${p.sim.poor[5]} poor)</span>`, sort: (p) => p.sim.sub[5] }, { label: 'Below normal y10', align: 'r', render: (p) => p.sim.sub[10], sort: (p) => p.sim.sub[10] }, { label: 'Exposure y5', align: 'r', render: (p) => fmt.n(p.sim.exposure[5], 0), sort: (p) => p.sim.exposure[5] }, { label: 'Annual cost', align: 'r', render: (p) => fmt.money(cost(p)), sort: cost }, { label: 'vs BAU exposure', align: 'r', render: (p) => ui.delta(((p.sim.exposure[5] - sims[0].sim.exposure[5]) / sims[0].sim.exposure[5]) * 100, { invert: true }), sort: (p) => p.sim.exposure[5] }], rows: sims, rowId: (p) => p.id, id: 'fct-cmp' }) })}
      </div>`,
    mount: (st, ctx) => {
      const cols = ['#64748b', '#dc2626', '#16a34a', '#ea580c', '#2563eb'];
      ctx.on('click', '#fct-cmp tr[data-row]', (e, r) => openScenario(sims.find((p) => p.id === r.dataset.row), sims[0], cost));
      ctx.chart('cmp', ch.line({ x: SIM0.years.map(String), series: sims.map((p, i) => ({ name: p.name, data: p.sim.sub, color: cols[i], dash: i === 0, symbol: true })), yName: 'towers', yMin: 0 }));
      const dims = [['Sub-normal towers', (p) => p.sim.sub[5]], ['Risk exposure', (p) => p.sim.exposure[5]], ['Backlog', (p) => p.sim.backlog[5]], ['Annual cost', cost], ['Undetected', (p) => 1 - p.sim.detect]];
      const max = dims.map(([, f]) => Math.max(...sims.map(f)) || 1);
      ctx.chart('radar', { legend: { bottom: 0, type: 'scroll' }, tooltip: {}, radar: { indicator: dims.map(([n]) => ({ name: n, max: 1 })), radius: '62%', splitArea: { areaStyle: { color: ['#f8fafc', '#fff'] } }, axisName: { color: '#475569', fontSize: 11 } }, series: [{ type: 'radar', data: sims.map((p, i) => ({ name: p.name, value: dims.map(([, f], k) => r1(f(p) / max[k] * 100) / 100), lineStyle: { color: cols[i], width: 2 }, itemStyle: { color: cols[i] }, areaStyle: { color: `${cols[i]}14` } })) }] });
    },
  };
}

function openScenario(p, bau, cost) {
  if (!p) return;
  const ys = p.sim.years.map(String);
  drawer.open({
    kicker: 'Simulated scenario', title: p.name, icon: 'sliders', wide: true, sub: esc(p.note),
    badges: [['Simulated', 'warn'], [`Detection ${fmt.pct(p.sim.detect * 100, 0)}`, p.sim.detect < 0.9 ? 'warn' : 'ok'], [`${p.sim.repairsPerYear} restorations / y`, 'info'], [`Exposure y5 ${fmt.n(((p.sim.exposure[5] - bau.sim.exposure[5]) / bau.sim.exposure[5]) * 100, 1)} % vs BAU`, p.sim.exposure[5] > bau.sim.exposure[5] ? 'crit' : 'ok']],
    body: `${ui.stats([{ label: 'Inspection budget', value: `$${p.s.budget}k` }, { label: 'Crews', value: p.s.crews }, { label: 'Corrosion', value: `×${p.s.corrosion}` }, { label: 'Storms', value: `×${p.s.storm}` }, { label: 'Annual cost', value: fmt.money(cost(p)) }])}
      <div class="nx-sec"><h4>Towers below normal — this scenario vs business as usual</h4>${ui.chart('sc1', 'md')}</div>
      <div class="nx-drawer-grid"><div class="nx-sec"><h4>Risk exposure</h4>${ui.chart('sc2', 'sm')}</div><div class="nx-sec"><h4>Corrective backlog</h4>${ui.chart('sc3', 'sm')}</div></div>
      <div class="nx-sec"><h4>Assumptions</h4>${ui.kv([['Detection rate', `${fmt.pct(p.sim.detect * 100, 0)} — budget ÷ ${fmt.money(p.sim.need)} needed for full RBI`], ['Restoration capacity', `${p.sim.repairsPerYear} towers / year (0.45 per crew-year × detection)`], ['Decay', `zone rate × ${p.s.corrosion} corrosion · storm loss × ${p.s.storm}`], ['Cost basis', 'inspection budget + crews × $410k (labour, vehicles, tools)']])}</div>`,
    meta: 'What-if simulation on engineering assumptions and simulated demo data · not validated',
    actions: [{ label: 'Load in simulator', primary: true, icon: 'sliders', onClick: (close) => { toast(`${p.name}: set the sliders to $${p.s.budget}k, ${p.s.crews} crews, ×${p.s.corrosion}, ×${p.s.storm}`); close(); } }],
    mount: (el, ctx) => {
      ctx.chart('sc1', { ...ch.bar({ x: ys, stack: true, series: [], yName: 'towers' }), series: [{ name: 'Poor', type: 'bar', stack: 's', data: p.sim.poor, itemStyle: { color: '#dc2626' }, barWidth: 18 }, { name: 'Moderate', type: 'bar', stack: 's', data: p.sim.moderate, itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } }, { name: 'Business as usual (total)', type: 'line', data: bau.sim.sub, lineStyle: { type: 'dashed', color: '#475569', width: 2 }, itemStyle: { color: '#475569' }, symbol: 'circle', symbolSize: 5 }], legend: { top: 0, right: 0 } });
      ctx.chart('sc2', ch.line({ x: ys, series: [{ name: 'Business as usual', data: bau.sim.exposure, color: '#94a3b8', dash: true }, { name: p.name, data: p.sim.exposure, color: '#7c3aed', area: true }], yName: 'Σ risk' }));
      ctx.chart('sc3', ch.line({ x: ys, series: [{ name: 'Business as usual', data: bau.sim.backlog, color: '#94a3b8', dash: true }, { name: p.name, data: p.sim.backlog, color: '#ea580c', area: true }], yName: 'labour h' }));
    },
  });
}

/* ================================================================== screen 6: Condition Monitoring (live HMI) */
const L220 = net.lines.find((l) => l.id === 'L-220-03');
const tw = (n) => L220.towers.find((t) => t.name === n) || L220.towers[0];
const worst220 = L220.towers.filter((t) => t.hi != null).sort((a, b) => a.hi - b.hi)[0];
const MON = [
  { t: tw('T-010'), sensors: [['TT', 'CTM', 'L-220-03.TC', '°C', 'Conductor temperature (CTM)'], ['ZT', 'SAG', 'L-220-03.SAG', 'm', 'Mid-span sag (LiDAR/inclination)'], ['ST', 'W1', 'CM.WX1.WIND', 'm/s', 'Wind speed (met station WX-1)'], ['TT', 'A1', 'CM.WX1.AMB', '°C', 'Ambient air temperature']] },
  { t: tw('T-020'), sensors: [['IT', 'LC', 'CM.T020.LC', 'µA', 'Insulator leakage current'], ['VT', 'AV', 'CM.T020.VIB', 'mm', 'Aeolian vibration amplitude']] },
  { t: tw('T-030'), sensors: [['ZT', 'TL', 'CM.T030.TILT', '°', 'Tower tilt (MEMS inclinometer)'], ['ZT', 'ST', 'CM.T030.SET', 'mm', 'Foundation settlement']] },
  { t: worst220, sensors: [['ZT', 'TL', `CM.${worst220.name.replace('-', '')}.TILT`, '°', 'Tower tilt (MEMS inclinometer)'], ['VT', 'AV', `CM.${worst220.name.replace('-', '')}.VIB`, 'mm', 'Aeolian vibration amplitude'], ['IT', 'LC', `CM.${worst220.name.replace('-', '')}.LC`, 'µA', 'Insulator leakage current']] },
  { t: tw('T-048'), sensors: [['TT', 'CTM', 'CM.T048.TC', '°C', 'Conductor temperature (CTM)'], ['ST', 'W2', 'CM.WX2.WIND', 'm/s', 'Wind speed (met station WX-2)'], ['MT', 'RH', 'CM.WX2.RH', '%', 'Relative humidity']] },
  { t: tw('T-057'), sensors: [['IT', 'LC', 'CM.T057.LC', 'µA', 'Insulator leakage current'], ['VT', 'AV', 'CM.T057.VIB', 'mm', 'Aeolian vibration amplitude']] },
];
const wn = worst220.name.replace('-', '');
live.defineMany({
  'CM.WX1.WIND': { base: 6.8, noise: 0.7, rev: 0.15, min: 0, dec: 1, unit: 'm/s', h: 15, hh: 22, desc: 'WX-1 wind speed' },
  'CM.WX1.AMB': { base: 13.4, noise: 0.06, rev: 0.05, dec: 1, unit: '°C', desc: 'WX-1 ambient' },
  'CM.WX2.WIND': { base: 8.1, noise: 0.8, rev: 0.15, min: 0, dec: 1, unit: 'm/s', h: 15, hh: 22, desc: 'WX-2 wind speed' },
  'CM.WX2.RH': { base: 71, noise: 0.6, rev: 0.06, min: 0, max: 100, dec: 0, unit: '%', h: 90, desc: 'WX-2 humidity' },
  'CM.T020.LC': { base: 62, noise: 3, rev: 0.1, min: 0, dec: 0, unit: 'µA', h: 250, hh: 400, desc: 'T-020 leakage current' },
  'CM.T020.VIB': { base: 0.18, noise: 0.03, rev: 0.12, min: 0, dec: 2, unit: 'mm', h: 0.6, desc: 'T-020 vibration' },
  'CM.T030.TILT': { base: 0.11, noise: 0.005, rev: 0.1, dec: 2, unit: '°', h: 0.5, hh: 0.8, desc: 'T-030 tilt' },
  'CM.T030.SET': { base: 2.4, noise: 0.05, rev: 0.05, dec: 1, unit: 'mm', h: 15, desc: 'T-030 settlement' },
  [`CM.${wn}.TILT`]: { base: 0.49, noise: 0.025, rev: 0.12, dec: 2, unit: '°', h: 0.5, hh: 0.8, desc: `${worst220.name} tilt` },
  [`CM.${wn}.VIB`]: { base: 0.52, noise: 0.08, rev: 0.12, min: 0, dec: 2, unit: 'mm', h: 0.6, hh: 1.0, desc: `${worst220.name} vibration` },
  [`CM.${wn}.LC`]: { base: 228, noise: 14, rev: 0.1, min: 0, dec: 0, unit: 'µA', h: 250, hh: 400, desc: `${worst220.name} leakage current` },
  'CM.T048.TC': { fn: () => live.get('L-220-03.TC') + 1.8 + Math.sin(Date.now() / 9000) * 0.4, dec: 1, unit: '°C', h: 75, hh: 85, desc: 'T-048 conductor temperature' },
  'CM.T057.LC': { base: 88, noise: 4, rev: 0.1, min: 0, dec: 0, unit: 'µA', h: 250, hh: 400, desc: 'T-057 leakage current' },
  'CM.T057.VIB': { base: 0.22, noise: 0.03, rev: 0.12, min: 0, dec: 2, unit: 'mm', h: 0.6, desc: 'T-057 vibration' },
  'CM.RTU.LAT': { base: 38, noise: 3, rev: 0.2, min: 8, dec: 0, unit: 'ms', h: 250, desc: 'RTU backhaul latency' },
  'CM.RTU.PPS': { base: 412, noise: 9, rev: 0.2, min: 0, dec: 0, unit: 'pt/s', desc: 'Historian ingest rate' },
  'CM.RTU.AVAIL': { base: 99.94, noise: 0.01, rev: 0.3, max: 100, dec: 2, unit: '%', l: 99, desc: 'Sensor network availability' },
  'CM.FC.RISK': { fn: () => towers.find((t) => t.id === worst220.id)?.r12 * (1 + (live.get(`CM.${wn}.TILT`) - 0.45) * 0.4), dec: 0, unit: '', desc: 'Forecast risk' },
});

function towerGlyph(x, y, color = '#9aa8bb') {
  return `<g stroke="${color}" stroke-width="1.5" fill="none"><path d="M${x - 14} ${y + 92} L${x - 4} ${y + 8} L${x + 4} ${y + 8} L${x + 14} ${y + 92}"/><path d="M${x - 26} ${y + 18} L${x + 26} ${y + 18} M${x - 20} ${y + 34} L${x + 20} ${y + 34}"/><path d="M${x - 10} ${y + 50} L${x + 10} ${y + 70} M${x + 10} ${y + 50} L${x - 10} ${y + 70} M${x - 8} ${y + 30} L${x + 8} ${y + 46} M${x + 8} ${y + 30} L${x - 8} ${y + 46}"/><path d="M${x - 4} ${y + 8} L${x} ${y} L${x + 4} ${y + 8}"/></g><g stroke="#cbd5e1" stroke-width="1.2"><line x1="${x - 24}" y1="${y + 18}" x2="${x - 24}" y2="${y + 28}"/><line x1="${x + 24}" y1="${y + 18}" x2="${x + 24}" y2="${y + 28}"/></g>`;
}
function monitoringHmi() {
  const W = 1640; const H = 940;
  const s1 = net.substations.find((s) => s.id === 'SUB-S1');
  const txs = net.transformers.filter((t) => t.sub === 'SUB-S1').slice(0, 2);
  let svg = '';
  // substation block
  svg += `<rect x="36" y="64" width="420" height="560" rx="10" fill="none" stroke="#263244" stroke-dasharray="6 4"/>${sx.text(444, 640, `SUBSTATION ${s1.short} · 220/132 kV`, { cls: 'sx-tb', anchor: 'end' })}${sx.text(444, 654, 'Online transformer monitoring · IEC 61850 MMS', { cls: 'sx-ts', anchor: 'end' })}`;
  svg += sx.bus(60, 430, 150, { kv: 220, label: '220 kV BUS', id: 'BUS220' });
  svg += `<text x="300" y="140" class="sx-v" data-live="SUB-S1.BUS220">—</text>${sx.text(352, 140, 'kV', { cls: 'sx-ts' })}`;
  svg += sx.bus(60, 430, 340, { kv: 132, label: '132 kV BUS', id: 'BUS132' });
  txs.forEach((t, i) => {
    const x = 130 + i * 160;
    svg += sx.wire([[x, 150], [x, 177]], { kv: 220 }) + sx.cb(x, 191, `Q0-${t.id}`, { kv: 220 }) + sx.wire([[x, 205], [x, 216]], { kv: 220 });
    svg += sx.xfmr(x, 250, t.id, { kv1: 220, kv2: 132, label: t.name, sub: `${t.rating} MVA` });
    svg += sx.wire([[x, 284], [x, 340]], { kv: 132, flow: `${t.id}.MVA` });
    const ix = x - 50;
    svg += sx.sig([[x - 17, 250], [ix + 12, 250], [ix + 12, 380]]);
    svg += sx.instr(ix + 12, 394, 'AT', `${i + 1}01`, { tag: `${t.id}.H2`, unit: 'ppm', id: `DGA-${t.id}` });
    svg += sx.instr(ix + 12, 434, 'AT', `${i + 1}02`, { tag: `${t.id}.C2H2`, unit: 'ppm', id: `DGA-${t.id}` });
    svg += sx.instr(ix + 12, 474, 'TT', `${i + 1}03`, { tag: `${t.id}.TOT`, unit: '°C', id: `TOT-${t.id}` });
    svg += sx.instr(ix + 12, 514, 'TT', `${i + 1}04`, { tag: `${t.id}.HST`, unit: '°C', id: `TOT-${t.id}` });
    svg += sx.instr(ix + 12, 554, 'MT', `${i + 1}05`, { tag: `${t.id}.MOIST`, unit: 'ppm', id: `DGA-${t.id}` });
    svg += sx.text(ix - 6, 590, `${t.name} monitors`, { cls: 'sx-ts' });
  });
  // feeder to line
  svg += sx.wire([[400, 150], [400, 129]], { kv: 220 }) + sx.cb(400, 115, 'Q0-L220', { kv: 220 }) + sx.wire([[400, 101], [400, 84], [470, 84], [470, 120]], { kv: 220 });
  svg += sx.text(408, 120, 'Q0', { cls: 'sx-ts' });
  // line conductor across towers
  const xs = [560, 740, 920, 1100, 1280, 1460];
  svg += sx.wire([[470, 120], [1600, 120]], { kv: 220, flow: 'L-220-03.MW', width: 3 });
  svg += `${sx.text(480, 112, 'L-220-03 · Corridor North · ACSR 400/51 · 22.4 km', { cls: 'sx-tb', size: 11 })}<text x="1240" y="108" class="sx-v" data-live="L-220-03.MW">—</text>${sx.text(1282, 108, 'MW', { cls: 'sx-ts' })}<text x="1320" y="108" class="sx-v" data-live="L-220-03.I">—</text>${sx.text(1362, 108, 'A', { cls: 'sx-ts' })}<text x="1390" y="108" class="sx-v" data-live="L-220-03.LOAD">—</text>${sx.text(1428, 108, '% rating', { cls: 'sx-ts' })}`;
  svg += sx.lineExit(1600, 120, { kv: 220, dir: 1, label: 'to S-2', sub: '500/220 kV' }).replace('', '');
  const equipment = {
    BUS220: { name: 'S-1 220 kV busbar', type: 'Busbar', tags: [{ tag: 'SUB-S1.BUS220', label: 'Bus voltage' }, { tag: 'SUB-S1.F', label: 'Frequency' }] },
    BUS132: { name: 'S-1 132 kV busbar', type: 'Busbar', tags: [{ tag: 'SUB-S1.BUS132', label: 'Bus voltage' }, { tag: 'SUB-S1.F', label: 'Frequency' }] },
    'Q0-L220': { name: 'L-220-03 line breaker', type: 'SF₆ circuit-breaker', switch: true, tags: [{ tag: 'L-220-03.MW', label: 'Active power' }, { tag: 'L-220-03.I', label: 'Current' }], interlock: 'Q9/Q8 interlock' },
  };
  txs.forEach((t) => {
    equipment[t.id] = { name: `${t.name} power transformer`, type: `${t.rating} MVA · ${t.ratio} kV · ${t.maker}`, desc: `HI ${fmt.n(t.hi, 0)} · Duval ${t.duval?.zone || 'n/a'} ${t.duval?.label || ''}`, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }, { tag: `${t.id}.TOT`, label: 'Top-oil temperature' }, { tag: `${t.id}.HST`, label: 'Winding hot-spot' }, { tag: `${t.id}.H2`, label: 'H₂ (online DGA)' }, { tag: `${t.id}.TAP`, label: 'OLTC tap' }] };
    equipment[`DGA-${t.id}`] = { name: `${t.name} online DGA monitor`, type: 'Multi-gas analyser · IEC 60599', desc: 'Photo-acoustic spectroscopy, 4-hour sample cycle. Alarms per IEEE C57.104 status 2/3.', tags: [{ tag: `${t.id}.H2`, label: 'Hydrogen H₂' }, { tag: `${t.id}.C2H2`, label: 'Acetylene C₂H₂' }, { tag: `${t.id}.MOIST`, label: 'Moisture in oil' }] };
    equipment[`TOT-${t.id}`] = { name: `${t.name} thermal monitor`, type: 'Fibre-optic winding probes · IEC 60076-7', tags: [{ tag: `${t.id}.TOT`, label: 'Top-oil' }, { tag: `${t.id}.HST`, label: 'Hot-spot' }, { tag: `${t.id}.AMB`, label: 'Ambient' }] };
    equipment[`Q0-${t.id}`] = { name: `${t.name} HV breaker`, type: 'SF₆ circuit-breaker', switch: true, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }] };
  });
  // towers with sensor clusters
  MON.forEach((m, i) => {
    const x = xs[i]; const t = m.t; const bad = t.id === worst220.id;
    const col = bad ? '#f87171' : healthColor(t.hi);
    svg += `<g class="sx-hit" data-eq="TW-${t.id}"><rect class="sx-halo" x="${x - 34}" y="112" width="68" height="112" rx="6"/>${towerGlyph(x, 120, bad ? '#f87171' : '#9aa8bb')}</g>`;
    svg += sx.text(x, 240, `${t.name}`, { cls: 'sx-tb', anchor: 'middle' }) + `<text x="${x}" y="254" class="sx-ts" text-anchor="middle" style="fill:${col}">HI ${fmt.n(t.hi, 0)}${bad ? ' · POOR' : ''}</text>`;
    // gateway
    const gy = 272;
    svg += `<g class="sx-hit" data-eq="GW-${t.id}"><rect class="sx-halo" x="${x - 30}" y="${gy - 4}" width="60" height="30" rx="5"/><rect x="${x - 26}" y="${gy}" width="52" height="22" rx="4" fill="#111823" stroke="#475569"/>${sx.text(x, gy + 15, `GW-${t.name.slice(2)}`, { cls: 'sx-ts', anchor: 'middle', color: '#cbd5e1' })}</g>`;
    svg += sx.sig([[x, 224], [x, gy]]);
    m.sensors.forEach(([fn, loop, tag], k) => {
      const y = 340 + k * 54; const bx = x - 52;
      svg += sx.sig([[x, gy + 22], [x, y - 20], [bx, y - 20], [bx, y - 14]]);
      svg += sx.instr(bx, y, fn, loop, { tag, unit: live.spec(tag)?.unit || '', loc: 'field', id: `S-${tag}` });
    });
    svg += sx.sig([[x + 26, gy + 11], [x + 60, gy + 11], [x + 60, 600]]);
    equipment[`TW-${t.id}`] = { name: `${t.name} · ${t.type}`, type: `Tower · ${t.line} · zone ${t.zone}`, desc: `HI ${fmt.n(t.hi, 1)} (${t.band || 'n/a'}) · ${t.open} open findings · ${t.age} y in service`, tags: m.sensors.map(([, , tag, , d]) => ({ tag, label: d })) };
    equipment[`GW-${t.id}`] = { name: `Sensor gateway GW-${t.name.slice(2)}`, type: 'LoRa/IEEE 802.15.4 → OPGW fibre gateway', desc: 'Solar-powered, 15-min reporting, 1 s on alarm.', tags: [{ tag: 'CM.RTU.LAT', label: 'Backhaul latency' }] };
    m.sensors.forEach(([fn, loop, tag, unit, d]) => { equipment[`S-${tag}`] = { name: d, type: `ISA ${fn}-${loop} · ${t.name}`, tags: [{ tag, label: d }] }; });
  });
  // OPGW backhaul and data path
  svg += `<path d="M${xs[0] + 60} 600 L${xs[xs.length - 1] + 60} 600" stroke="#22d3ee" stroke-width="2" fill="none" stroke-dasharray="8 4"/>${sx.text(xs[0] + 70, 594, 'OPGW 48-fibre backhaul (DWDM ch. 21) · IEC 61850-90-5 R-GOOSE / MQTT-SN', { cls: 'sx-ts', color: '#67e8f9' })}`;
  svg += `<path d="M${xs[0] + 60} 600 L470 600 L470 690 L420 690" stroke="#22d3ee" stroke-width="2" fill="none" stroke-dasharray="8 4"/>`;
  // RTU, historian, analytics
  const box = (x, y, w, h, id, title, sub) => `<g class="sx-hit" data-eq="${id}"><rect class="sx-halo" x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="8"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#111823" stroke="#3b82f6"/>${sx.text(x + 12, y + 20, title, { cls: 'sx-tb' })}${sx.text(x + 12, y + 35, sub, { cls: 'sx-ts' })}</g>`;
  svg += box(220, 660, 200, 60, 'RTU', 'RTU / Data concentrator', 'S-1 relay room · IEC 61850 gateway');
  svg += box(220, 760, 200, 60, 'HIST', 'Process historian', 'Time-series store · 1 s / 15 min');
  svg += box(520, 760, 230, 60, 'AI', 'NEXUS forecasting engine', 'HI decay · Weibull · RBI');
  svg += `<path d="M320 720 L320 760" stroke="#64748b" stroke-width="1.5" marker-end="url(#sxarr)"/><path d="M420 790 L520 790" stroke="#64748b" stroke-width="1.5" marker-end="url(#sxarr)"/>`;
  svg += sx.readout(780, 650, [['Latency', 'CM.RTU.LAT', 'ms'], ['Ingest', 'CM.RTU.PPS', 'pt/s'], ['Availability', 'CM.RTU.AVAIL', '%']], { title: 'Backhaul health', w: 190, id: 'RTU' });
  svg += sx.readout(780, 740, [['L-220-03 load', 'L-220-03.LOAD', '%'], ['Conductor temp', 'L-220-03.TC', '°C'], ['Sag', 'L-220-03.SAG', 'm']], { title: 'Dynamic line rating inputs', w: 190, id: 'DLR' });
  svg += sx.readout(1000, 650, [[`${worst220.name} tilt`, `CM.${wn}.TILT`, '°'], [`${worst220.name} vibration`, `CM.${wn}.VIB`, 'mm'], [`${worst220.name} leakage`, `CM.${wn}.LC`, 'µA'], ['Forecast risk', 'CM.FC.RISK', '']], { title: `Watch-list · ${worst220.name}`, w: 220, id: `TW-${worst220.id}`, accent: '#f87171' });
  equipment.RTU = { name: 'S-1 RTU / data concentrator', type: 'IEC 61850 / DNP3 gateway', tags: [{ tag: 'CM.RTU.LAT', label: 'Backhaul latency' }, { tag: 'CM.RTU.PPS', label: 'Ingest rate' }, { tag: 'CM.RTU.AVAIL', label: 'Network availability' }] };
  equipment.HIST = { name: 'Process historian', type: 'Time-series database', desc: 'All sensor and SCADA points; feeds the forecasting models every 15 minutes.', tags: [{ tag: 'CM.RTU.PPS', label: 'Ingest rate' }] };
  equipment.AI = { name: 'NEXUS forecasting engine', type: 'Model service', desc: `Re-scores HI decay and RBI intervals as sensor evidence arrives. ${worst220.name} forecast risk is re-scored live from tower tilt.`, tags: [{ tag: 'CM.FC.RISK', label: `${worst220.name} forecast risk` }, { tag: `CM.${wn}.TILT`, label: `${worst220.name} tilt` }] };
  equipment.DLR = { name: 'Dynamic line rating (CIGRE TB 601)', type: 'Calculated', tags: [{ tag: 'L-220-03.TC', label: 'Conductor temperature' }, { tag: 'L-220-03.SAG', label: 'Sag' }, { tag: 'CM.WX1.WIND', label: 'Wind (WX-1)' }] };
  svg += sx.frame(W, H, { title: 'L-220-03 / S-1 CONDITION MONITORING NETWORK', dno: 'NX-FCT-PID-0601', rev: 'D', sheet: '1 of 1' });
  return { W, H, svg, equipment };
}

/* ================================================================== app */
const cm = monitoringHmi();
const screens = [
  { id: 'risk', name: 'Risk Forecast', icon: 'forecast', exp: true, tabs: [{ name: 'Forecast map', icon: 'map', ...riskForecastMap() }, { name: 'Risk trajectory', icon: 'trend', ...riskTrajectory() }, { name: 'Defect recurrence', icon: 'history', ...recurrenceTab() }] },
  { id: 'inspection', name: 'Inspection Planning', icon: 'calendar', exp: true, tabs: [{ name: 'Risk-based schedule', icon: 'target', ...rbiPlan() }, { name: 'Campaign builder', icon: 'drone', ...campaignBuilder() }] },
  { id: 'demand', name: 'Maintenance Demand', icon: 'wrench', exp: true, tabs: [{ name: 'Workload forecast', icon: 'trend', ...demandForecast() }, { name: 'Crew demand', icon: 'users', ...crewDemand() }] },
  { id: 'deterioration', name: 'Asset Deterioration', icon: 'trendDown', exp: true, tabs: [{ name: 'Decay curves', icon: 'trendDown', ...decayCurves() }, { name: 'Survival analysis', icon: 'pulse', ...survival() }, { name: 'Tower projections', icon: 'tower', ...projections() }] },
  { id: 'scenario', name: 'Scenario Analysis', icon: 'sliders', tabs: [{ name: 'What-if simulator', icon: 'sliders', ...whatIf() }, { name: 'Compare scenarios', icon: 'scale', ...compare() }] },
  { id: 'monitoring', name: 'Condition Monitoring', icon: 'schematic', tabs: [{
    name: 'Sensor network · L-220-03', icon: 'schematic', full: true,
    render: () => '<div class="nx-hmi is-full" id="fct-hmi"></div>',
    mount: (st, ctx) => { ctx.hmi('#fct-hmi', { title: 'L-220-03 / S-1 online condition monitoring', dno: 'NX-FCT-PID-0601', rev: 'D', w: cm.W, h: cm.H, svg: cm.svg, equipment: cm.equipment, legend: [{ label: '220 kV', color: '#3b82f6' }, { label: '132 kV', color: '#14b8a6' }, { label: 'OPGW / data', color: '#22d3ee' }, { label: 'Signal', color: '#64748b' }] }); },
  }, {
    name: 'Sensor trends', icon: 'pulse',
    render: () => `<div class="nx-page">${ui.kpis([
      { label: `${worst220.name} tower tilt`, live: `CM.${wn}.TILT`, unit: '°', icon: 'tower', tone: 'crit', sub: 'H 0.50° · HH 0.80°' },
      { label: `${worst220.name} leakage current`, live: `CM.${wn}.LC`, unit: 'µA', icon: 'zap', tone: 'warn', sub: 'H 250 µA · contamination' },
      { label: 'L-220-03 conductor temp', live: 'L-220-03.TC', unit: '°C', icon: 'thermo', tone: 'accent', sub: 'H 75 °C · design 85 °C' },
      { label: 'Wind at WX-1', live: 'CM.WX1.WIND', unit: 'm/s', icon: 'wind', tone: 'info', sub: 'cooling for dynamic rating' },
    ])}<div class="nx-row nx-c2">${ui.card({ title: `${worst220.name} structural sensors — live`, sub: 'Last 3 minutes, 1 s resolution. Dashed lines are alarm limits.', body: ui.chart('tr1', 'md') })}${ui.card({ title: 'Insulator leakage current — live', sub: 'Rising leakage under humid onshore wind is the precursor to flashover on contaminated strings.', body: ui.chart('tr2', 'md') })}</div>
      <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'L-220-03 dynamic line rating inputs — live', sub: 'Conductor temperature (IEEE 738 heat balance) against wind cooling at WX-1 and line loading. High wind lets the same conductor carry more current.', body: ui.chart('tr3', 'md') })}${ui.card({ cls: 'nx-s5', title: 'Headroom to alarm — every sensor', sub: 'Live value as a share of its H alarm limit. Bars past 100 % are in alarm; this is the list the forecasting engine re-scores first.', body: ui.chart('tr4', 'md') })}</div></div>`,
    mount: (st, ctx) => {
      // first draw creates the chart; later ticks merge new data so an open hover tooltip stays put
      const inst = {};
      const lc = (id, opt) => { const c = inst[id]; if (c && c !== 'pending') { if (!c.isDisposed()) c.setOption(opt, { lazyUpdate: true }); } else if (!c) { inst[id] = 'pending'; ctx.chart(id, opt).then((i) => { inst[id] = i; }); } };
      const draw = () => {
        const n = live.hist(`CM.${wn}.TILT`).length; const x = Array.from({ length: n }, (_, i) => `-${n - i}s`);
        lc('tr1', { ...ch.line({ x, series: [{ name: 'Tilt °', data: live.hist(`CM.${wn}.TILT`).map((v) => +v.toFixed(3)), color: '#dc2626', markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0.5, lineStyle: { color: '#d97706', type: 'dashed' } }, { yAxis: 0.8, lineStyle: { color: '#dc2626', type: 'dashed' } }] } }, { name: 'Vibration mm', data: live.hist(`CM.${wn}.VIB`).map((v) => +v.toFixed(3)), color: '#7c3aed', yAxisIndex: 1 }], y2Name: 'mm', yName: '°' }), animation: false });
        lc('tr2', { ...ch.line({ x, series: [`CM.${wn}.LC`, 'CM.T020.LC', 'CM.T057.LC'].map((tag, i) => ({ name: live.spec(tag).desc, data: live.hist(tag).map((v) => Math.round(v)), color: ['#dc2626', '#2563eb', '#14b8a6'][i], markLine: i === 0 ? { silent: true, symbol: 'none', data: [{ yAxis: 250, lineStyle: { color: '#d97706', type: 'dashed' } }] } : undefined })), yName: 'µA' }), animation: false });
        lc('tr3', { ...ch.line({ x, series: [{ name: 'Conductor °C', data: live.hist('L-220-03.TC').map((v) => +v.toFixed(1)), color: '#dc2626' }, { name: 'Loading %', data: live.hist('L-220-03.LOAD').map((v) => +v.toFixed(1)), color: '#2563eb' }, { name: 'Wind WX-1 m/s', data: live.hist('CM.WX1.WIND').map((v) => +v.toFixed(1)), color: '#14b8a6', yAxisIndex: 1, area: true, areaAlpha: '18' }], yName: '°C / %', y2Name: 'm/s' }), animation: false });
        const sens = MON.flatMap((m) => m.sensors.map(([, , tag, , d]) => ({ tag, d: `${m.t.name} · ${d.replace(/ \(.*\)/, '')}` }))).filter((x) => live.spec(x.tag)?.h).map((x) => ({ ...x, pct: r1((live.get(x.tag) / live.spec(x.tag).h) * 100) })).sort((a, b) => b.pct - a.pct);
        lc('tr4', { ...ch.bar({ x: sens.map((x) => x.d), horizontal: true, series: [{ name: '% of H limit', data: sens.map((x) => ({ value: x.pct, itemStyle: { color: x.pct >= 100 ? '#dc2626' : x.pct >= 80 ? '#f59e0b' : '#16a34a' } })), markLine: { silent: true, symbol: 'none', lineStyle: { color: '#dc2626', type: 'dashed' }, data: [{ xAxis: 100 }] } }], labels: true, legend: false, grid: { top: 6, right: 40 }, tooltip: { valueFormatter: (v) => `${fmt.n(v, 1)} %` } }), animation: false });
      };
      draw(); ctx.onLive(draw);
    },
  }, ...drawingTabs('forecast')] },
];

mountApp({
  id: 'forecast', code: '06', product: 'Risk & Maintenance Forecasting', back: '/#module-card-06', asOf: AS_OF, screens,
  searchIndex: () => net.searchIndex.filter((s) => s.kind === 'tower' || s.kind === 'line' || s.kind === 'transformer').map((s) => ({ ...s, run: () => { const t = towerById.get(s.id); if (t) openTower(t); else toast(`${s.label}: open in Asset Reliability for detail`, 'warn'); } })),
});
