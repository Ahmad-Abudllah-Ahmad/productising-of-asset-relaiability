// Module 08 — Workforce & Safety.
// Crews, people and certifications, permits-to-work, HSE records, field mobile flow, compliance audit trail and a live
// permit-to-work isolation (LOTO) single-line. Every record is keyed to the shared network (same towers, lines, work
// orders and permits as the other modules). Practice follows EN 50110-1 (five safety rules), ISO 45001 and ISA-18.2.

import { mountApp, ui, ch, live, esc, fmt, icon, drawer, toast, healthColor, SEV, addDays, daysBetween, rng, nav, geo } from '../console.js';
import * as sx from '../schematics.js';
import { loadNetwork, networkLayers, DEFECT_LABEL, SEV_TONE, LINE_NAME } from '../network.js';
import { drawingTabs } from '../drawings.js';
import { models } from '../models.js';
import { erpRequest } from '../erp.js';

const net = await loadNetwork();
const ASOF = net.asOf;
// Predictive heuristics this module shows. All run on simulated demo data and none is validated (see models.js).
models.register([
  { id: 'fatigue-index', name: 'Fatigue-risk index (FRMS)', module: '08 · Workforce & Safety',
    predicts: 'Fatigue-risk score 0–100 per person and the planner flags derived from it (countersign or no night call-out above 60)',
    method: 'Placeholder: a seeded demo value per person. The intended index combines shift pattern, travel and consecutive days; that calculation is not implemented yet.',
    needs: 'Shift rosters, clock-in / clock-out and travel records from HR time recording and vehicle telematics, plus fatigue-related incident history to calibrate the 60 threshold.' },
  { id: 'crew-match', name: 'Crew match score and best-match recommendation', module: '08 · Workforce & Safety',
    predicts: 'Suitability score 0–100 of each crew for a work order, the ranked “best match” and the estimated drive time',
    method: 'Rule-based points: trade match 40, required authorisations with two valid holders 30, distance from depot up to 15 (straight-line km; drive time ≈ km / 0.6 + 10 min), availability up to 15, minus 3 per member above 48 h. Weights are assumptions, not fitted. The competence block itself is a fixed rule on certificate records, not a prediction.',
    needs: 'History of crew assignments with outcomes (job duration, rework, safety events) and real travel times from vehicle telematics.' },
  { id: 'crew-capacity', name: 'Crew capacity by trade, next 2 weeks', module: '08 · Workforce & Safety',
    predicts: 'Crew hours available per trade over the next two weeks, compared with the labour hours on open work orders',
    method: 'Crew size × 40 h × 2 weeks × (1 − 0.6 × current utilisation); demand is the sum of labour-hour estimates on open SAP PM orders.',
    needs: 'Roster, leave and booked-hours history from HR time recording, and planned vs actual labour hours from SAP PM confirmations.' },
  { id: 'loto-switching-sim', name: 'Isolation (LOTO) switching simulation', module: '08 · Workforce & Safety',
    predicts: 'Energised or dead state of the line for a switching sequence, interlock responses, induced voltage and portable-earth current at the work site',
    method: 'Topology rule (the line is alive when Q1, Q0 and Q9 are closed at either end) with fixed interlock rules; induced voltage and earth current are random values in fixed ranges, not a network calculation.',
    needs: 'Switchgear status and measurements from SCADA / EMS, the utility’s interlocking scheme, and an induction study for parallel circuits.' },
]);
// network.js resolves towerOf() to the raw asset record, so some work orders carry the tower id as `line` and no
// coordinates. Normalise from the scored tower list (local workaround; see report).
for (const w of net.workOrders) {
  const tw = net.towerById.get(w.towerId) || (String(w.line || '').startsWith('TWR-') ? net.towerById.get(w.line) : null);
  if (tw) { w.towerId = tw.id; w.towerName = tw.name; w.line = tw.line; w.kv = tw.kv; w.corridor = tw.corridor; if (w.lat == null) { w.lat = tw.lat; w.lng = tw.lng; } }
}
for (const p of net.permits) { const w = p.woRef; p.line = w.line; if (p.lat == null) { p.lat = w.lat; p.lng = w.lng; } }
const R = rng(80808);
const pick = (a) => a[Math.floor(R() * a.length)];
void healthColor; void SEV; void DEFECT_LABEL;

/* ------------------------------------------------------------------ module CSS */
document.head.insertAdjacentHTML('beforeend', `<style id="wfs-css">
.wfs-split { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; }
.wfs-wo { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--nx-line); background: #fff; cursor: pointer; transition: border-color .12s, box-shadow .12s; }
.wfs-wo:hover { border-color: #bfd3fb; }
.wfs-wo.is-sel { border-color: var(--nx-accent); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
.wfs-wo b { font-size: 12.5px; } .wfs-wo span { font-size: 11.5px; color: var(--nx-muted); }
.wfs-wolist { display: flex; flex-direction: column; gap: 8px; max-height: 640px; overflow: auto; padding-right: 4px; }
.wfs-cand { border: 1px solid var(--nx-line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; background: #fff; }
.wfs-cand.is-best { border-color: #93c5fd; background: linear-gradient(180deg, #f5f9ff, #fff); }
.wfs-cand.is-blocked { background: #fffafa; border-color: #fbd5d5; }
.wfs-cand-h { display: flex; align-items: center; gap: 10px; }
.wfs-cand-h b { font-size: 13px; }
.wfs-ring { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; flex: 0 0 auto; }
.wfs-why { display: grid; grid-template-columns: 18px 1fr; gap: 4px 6px; font-size: 12px; color: var(--nx-ink-2); }
.wfs-why svg { width: 14px; height: 14px; margin-top: 2px; }
.wfs-ok { color: #16a34a; } .wfs-no { color: #dc2626; } .wfs-warn { color: #d97706; }
.wfs-bowtie { display: grid; grid-template-columns: 1.1fr 1fr 190px 1fr 1.1fr; gap: 10px; align-items: center; }
.wfs-bt-col { display: flex; flex-direction: column; gap: 10px; }
.wfs-bt { border-radius: 10px; padding: 9px 11px; font-size: 12px; line-height: 1.35; border: 1px solid var(--nx-line); background: #fff; }
.wfs-bt small { display: block; font-size: 10.5px; color: var(--nx-muted); margin-top: 3px; }
.wfs-bt.t-threat { border-left: 4px solid #f59e0b; } .wfs-bt.t-cons { border-left: 4px solid #dc2626; }
.wfs-bt.t-bar { background: #f8fafc; display: flex; flex-direction: column; gap: 5px; }
.wfs-top { aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fb923c, #dc2626 70%); color: #fff; display: grid; place-items: center; text-align: center; padding: 18px; font-weight: 700; font-size: 13px; box-shadow: 0 12px 30px -10px rgba(220,38,38,.6); }
.wfs-top small { display: block; font-weight: 500; font-size: 10.5px; opacity: .85; margin-top: 4px; }
.wfs-hazard { display: block; height: 0; }
.wfs-iso { display: flex; flex: 1 1 auto; min-height: 0; }
.wfs-iso > .nx-hmi { flex: 1 1 auto; min-width: 0; }
.wfs-prog { width: 360px; flex: 0 0 auto; background: #fff; border-left: 1px solid var(--nx-line); display: flex; flex-direction: column; min-height: 0; }
.wfs-prog-h { padding: 14px 16px 12px; border-bottom: 1px solid var(--nx-line-2); }
.wfs-prog-h small { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--nx-muted); font-weight: 600; }
.wfs-prog-h h3 { margin: 3px 0 2px; font-size: 15px; }
.wfs-prog-b { flex: 1; overflow: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.wfs-step { display: grid; grid-template-columns: 26px 1fr; gap: 8px; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--nx-line-2); font-size: 12px; align-items: start; }
.wfs-step i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 700; font-size: 11px; background: #eef2f7; color: var(--nx-muted); }
.wfs-step b { display: block; font-size: 12.5px; } .wfs-step span { color: var(--nx-muted); font-size: 11.5px; }
.wfs-step.is-next { border-color: #93c5fd; background: #f5f9ff; } .wfs-step.is-next i { background: var(--nx-accent); color: #fff; }
.wfs-step.is-done i { background: #16a34a; color: #fff; } .wfs-step.is-done { background: #f6fdf8; border-color: #c9eed7; }
.wfs-step.is-ooo i { background: #d97706; color: #fff; } .wfs-step.is-ooo { background: #fffbeb; border-color: #fde4c3; }
.wfs-step .nx-btn { margin-top: 6px; }
.wfs-lock { transition: opacity .25s; }
.wfs-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
.wfs-ev { border: 1px solid var(--nx-line); border-radius: 12px; overflow: hidden; background: #fff; box-shadow: var(--nx-shadow); }
.wfs-ev-imgs { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; background: #0f172a; }
.wfs-ev-imgs figure { margin: 0; position: relative; height: 140px; overflow: hidden; }
.wfs-ev-imgs img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wfs-ev-imgs figcaption { position: absolute; left: 8px; top: 8px; background: rgba(15,23,42,.8); color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; padding: 2px 7px; border-radius: 5px; }
.wfs-ev-imgs .wfs-geo { position: absolute; left: 8px; bottom: 6px; color: #e2e8f0; font: 10px var(--nx-mono); text-shadow: 0 1px 2px #000; }
.wfs-ev-b { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.wfs-hash { font: 10.5px var(--nx-mono); color: var(--nx-muted); }
/* phone */
.wfs-phone-wrap { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 20px; align-items: start; }
.wfs-app-h { background: linear-gradient(135deg, #0b1220, #14305e); color: #fff; padding: 10px 16px 12px; flex: 0 0 auto; }
.wfs-app-h small { font-size: 10px; letter-spacing: .1em; color: #93c5fd; font-weight: 700; }
.wfs-app-h b { display: block; font-size: 15px; margin-top: 2px; }
.wfs-app-h span { font-size: 11px; color: #94a3b8; }
.wfs-app-b { flex: 1; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.wfs-app-f { padding: 10px 12px 18px; flex: 0 0 auto; display: flex; gap: 8px; background: #fff; border-top: 1px solid var(--nx-line-2); }
.wfs-app-f button { flex: 1; height: 40px; border-radius: 10px; border: 0; background: var(--nx-accent); color: #fff; font-weight: 700; font-size: 13px; }
.wfs-app-f button.is-sec { background: #eef2f7; color: var(--nx-ink); flex: 0 0 72px; }
.wfs-app-f button[disabled] { opacity: .45; }
.wfs-job { background: #fff; border-radius: 12px; padding: 10px 12px; border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
.wfs-job b { font-size: 12.5px; }
.wfs-job span { color: var(--nx-muted); font-size: 11px; }
.wfs-chk { display: flex; gap: 10px; align-items: flex-start; background: #fff; border-radius: 10px; padding: 9px 10px; border: 1px solid var(--nx-line); cursor: pointer; }
.wfs-chk i { width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1; flex: 0 0 auto; display: grid; place-items: center; color: #fff; font-style: normal; font-size: 12px; }
.wfs-chk.is-on i { background: #16a34a; border-color: #16a34a; }
.wfs-shot { border-radius: 12px; overflow: hidden; background: #e2e8f0; height: 118px; position: relative; display: grid; place-items: center; color: var(--nx-muted); border: 2px dashed #cbd5e1; cursor: pointer; }
.wfs-shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.wfs-shot em { position: absolute; left: 8px; bottom: 6px; font: 9.5px var(--nx-mono); color: #fff; font-style: normal; text-shadow: 0 1px 2px #000; }
.wfs-shot b { position: absolute; left: 8px; top: 6px; font-size: 10px; background: rgba(15,23,42,.75); color: #fff; padding: 1px 6px; border-radius: 4px; }
.wfs-sig { height: 92px; border-radius: 10px; border: 1px solid var(--nx-line); background: #fff; display: grid; place-items: center; font: italic 26px Georgia, serif; color: #1e3a8a; }
.wfs-feed { display: flex; flex-direction: column; max-height: 560px; overflow: auto; }
.wfs-feed div { display: grid; grid-template-columns: 64px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--nx-line-2); font-size: 12px; animation: nx-in .2s ease; }
.wfs-feed time { font: 11px var(--nx-mono); color: var(--nx-muted); }
.wfs-feed small { display: block; font: 10.5px var(--nx-mono); color: var(--nx-faint); }
.wfs-scroll { max-height: 560px; overflow: auto; }
.wfs-scroll .nx-table th { top: 0; }
@media (max-width: 1280px) { .wfs-split, .wfs-phone-wrap { grid-template-columns: 1fr; } .wfs-bowtie { grid-template-columns: 1fr; } }
</style>`);

/* ------------------------------------------------------------------ rules: competence per skill (EN 50110 "skilled person") */
const REQ = {
  'live-line': ['HV-AUTH', 'LIVE-LINE', 'WAH'], structures: ['WAH', 'RIGGING'], conductor: ['HV-AUTH', 'WAH', 'RIGGING'], insulators: ['HV-AUTH', 'WAH'],
  civil: ['FIRST-AID'], vegetation: ['CHAINSAW', 'WAH'], substation: ['HV-AUTH', 'SWITCHING', 'SF6'],
};
const MIN_HOLDERS = 2;
const CERT = Object.fromEntries(net.certs.map((c) => [c.id, c]));
const crewById = new Map(net.crews.map((c) => [c.id, c]));
const peopleOf = (crewId) => net.people.filter((p) => p.crew === crewId);
const hasCert = (p, id, okExpiring = true) => p.certs.some((c) => c.id === id && (c.state === 'valid' || (okExpiring && c.state === 'expiring')));
const kmBetween = (a, b) => { const dy = (b.lat - a.lat) * 111.32; const dx = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180); return Math.hypot(dx, dy); };
const depotById = new Map(net.depots.map((d) => [d.id, d]));

/** Score a crew against a work order. Returns { score, blocked, reasons:[[ok|no|warn, text]] }. */
function matchCrew(wo, crew) {
  const req = REQ[wo.skill] || ['HV-AUTH'];
  const ppl = peopleOf(crew.id);
  const reasons = [];
  let score = 0; let blocked = false;
  if (crew.skill === wo.skill) { score += 40; reasons.push(['ok', `Trade matches: ${wo.skill} crew for ${wo.work_type}`]); } else reasons.push(['warn', `Trade is ${crew.skill}; job needs ${wo.skill}`]);
  for (const id of req) {
    const valid = ppl.filter((p) => hasCert(p, id));
    const expired = ppl.filter((p) => p.certs.some((c) => c.id === id && c.state === 'expired'));
    if (valid.length >= MIN_HOLDERS) { score += 30 / req.length; reasons.push(['ok', `${CERT[id].name}: ${valid.length} valid holders${expired.length ? ` (${expired.length} expired, excluded)` : ''}`]); } else {
      blocked = true;
      reasons.push(['no', `${CERT[id].name}: ${valid.length} valid of ${MIN_HOLDERS} required${expired.length ? ` — expired: ${expired.map((p) => `${p.name} (${fmt.short(p.certs.find((c) => c.id === id).expires)})`).join(', ')}` : ''}`]);
    }
  }
  const lead = ppl[0];
  if ((wo.kv || 0) >= 110 && lead && !hasCert(lead, 'HV-AUTH')) { blocked = true; reasons.push(['no', `Crew lead ${lead.name} is not an HV Authorised Person for ${wo.kv} kV`]); } else if (lead) reasons.push(['ok', `Crew lead ${lead.name} authorised for ${wo.kv || '—'} kV`]);
  const base = depotById.get(crew.base);
  const km = wo.lat && base ? kmBetween(base, wo) : 12;
  score += Math.max(0, 15 - km * 0.6);
  reasons.push([km < 15 ? 'ok' : 'warn', `${fmt.n(km, 1)} km from ${base?.short || 'depot'} (≈ ${Math.round(km / 0.6 + 10)} min drive)`]);
  if (crew.status === 'available') { score += 15; reasons.push(['ok', 'Available now']); } else if (crew.status === 'travelling') { score += 6; reasons.push(['warn', 'Travelling — available after current move']); } else reasons.push(['warn', `On site at ${crew.job || 'another job'}`]);
  const tired = ppl.filter((p) => p.hoursWeek > 48);
  if (tired.length) { score -= tired.length * 3; reasons.push(['warn', `${tired.length} member(s) above 48 h this week (working-time limit)`]); }
  return { crew, score: Math.round(Math.max(0, Math.min(100, score))), blocked, reasons };
}
const ranked = (wo) => net.crews.map((c) => matchCrew(wo, c)).sort((a, b) => (a.blocked - b.blocked) || b.score - a.score);

/* ------------------------------------------------------------------ module state */
const openWos = net.workOrders.filter((w) => w.stage !== 'completed').sort((a, b) => (a.sevScore - b.sevScore) || a.id.localeCompare(b.id));
const assigned = new Map(openWos.map((w) => [w.id, w.crew]));
const permitState = new Map(net.permits.map((p) => [p.id, p.state]));
let selWo = openWos[0]?.id;

/* hash-chained audit trail (tamper-evident: each entry hashes the previous) */
function hex(s) { let h1 = 0x811c9dc5; let h2 = 0x1234567; for (let i = 0; i < s.length; i += 1) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519) ^ (h1 >>> 7); } return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).repeat(4); }
const audit = [];
function log(e) {
  const prev = audit[0]?.hash || '0'.repeat(64);
  const rec = { seq: (audit[0]?.seq || 0) + 1, at: e.at || `${ASOF}T${new Date().toTimeString().slice(0, 8)}`, actor: e.actor, action: e.action, object: e.object, detail: e.detail || '', source: e.source || 'NEXUS Field', prev };
  rec.hash = hex(`${prev}|${rec.at}|${rec.actor}|${rec.action}|${rec.object}|${rec.detail}`);
  audit.unshift(rec);
  return rec;
}
(function seedAudit() {
  const ev = [];
  net.permits.forEach((p, i) => {
    const t = (d, h) => `${addDays(p.issued, d)}T${String(6 + h).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
    const leadName = crewById.get(p.crew)?.lead || 'Crew lead';
    ev.push({ at: t(-1, 2), actor: leadName, action: 'Permit requested', object: p.id, detail: `${p.type} for ${p.wo} · ${p.asset}`, source: 'NEXUS Permits' });
    if (p.state !== 'draft') ev.push({ at: t(-1, 5), actor: 'Planner M. Gasimov', action: 'Permit reviewed', object: p.id, detail: 'Method statement & risk assessment attached', source: 'NEXUS Permits' });
    if (['approved', 'pending isolation', 'issued', 'active'].includes(p.state)) ev.push({ at: t(0, 0), actor: p.authorisedBy, action: 'Permit approved', object: p.id, detail: p.isolation, source: 'NEXUS Permits' });
    if (['issued', 'active'].includes(p.state)) ev.push({ at: t(0, 1), actor: 'Control: Dispatcher 2', action: 'Isolation confirmed', object: p.id, detail: 'Switching programme complete; locks applied', source: 'SCADA / EMS' });
    if (p.state === 'active') ev.push({ at: t(0, 2), actor: leadName, action: 'Permit accepted on site', object: p.id, detail: 'Earths visible; toolbox talk recorded (12 signatures)', source: 'NEXUS Field' });
  });
  net.workOrders.filter((w) => w.stage === 'completed').slice(0, 30).forEach((w, i) => {
    ev.push({ at: `${w.completed_at || ASOF}T15:${String((i * 11) % 60).padStart(2, '0')}:00`, actor: crewById.get(w.crew)?.lead || w.crewName, action: 'Evidence attached', object: `EV-${w.id.slice(3)}`, detail: `Before/after photos, ${w.towerName || w.asset}`, source: 'NEXUS Field' });
    ev.push({ at: `${w.completed_at || ASOF}T16:${String((i * 13) % 60).padStart(2, '0')}:00`, actor: 'SAP PM interface', action: 'Work order closed', object: w.id, detail: `TECO in SAP ${w.sap}; Maximo ${w.maximo}`, source: 'SAP PM' });
  });
  net.people.forEach((p) => p.certs.filter((c) => c.state !== 'valid').forEach((c) => ev.push({ at: `${addDays(ASOF, -((p.id.charCodeAt(7) % 9) + 1))}T09:00:00`, actor: 'HR / LMS', action: c.state === 'expired' ? 'Certificate expired' : 'Renewal due', object: p.id, detail: `${c.name} · ${fmt.date(c.expires)}`, source: 'Learning management' })));
  ev.sort((a, b) => a.at.localeCompare(b.at)).forEach(log);
}());

/* ------------------------------------------------------------------ HSE register (deterministic, keyed to real towers) */
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const HSE_TYPES = {
  'Lost-time injury': { color: '#7f1d1d', tone: 'crit', recordable: true, icon: 'alert' },
  'Medical treatment': { color: '#dc2626', tone: 'crit', recordable: true, icon: 'alert' },
  'First aid': { color: '#ea580c', tone: 'high', icon: 'shield' },
  'Near miss': { color: '#d97706', tone: 'warn', icon: 'event' },
  'Property damage': { color: '#b45309', tone: 'warn', icon: 'truck' },
  Hazard: { color: '#0284c7', tone: 'info', icon: 'event' },
  'ROW encroachment': { color: '#7c3aed', tone: 'violet', icon: 'map' },
  'Safety observation': { color: '#16a34a', tone: 'ok', icon: 'eye' },
};
const TEXT = {
  'Lost-time injury': ['Shoulder strain lifting conductor drum chock by hand — 6 days lost; mechanical lifting aid now mandatory.'],
  'Medical treatment': ['Ankle sprain descending tower access ladder on wet steel — X-ray clear, restricted duty 3 days.'],
  'First aid': ['Minor hand laceration handling galvanised angle — gloves upgraded to cut level D.', 'Eye irritation from wind-blown dust during foundation excavation — eye wash used.', 'Wasp sting at tower base during climb preparation — antihistamine given.', 'Heat stress symptoms at 41 °C ambient — work/rest cycle enforced.'],
  'Near miss': ['Shackle dropped from crossarm during damper change — exclusion zone held, no injury.', 'Induced voltage felt on portable earth lead before bonding — earthing sequence re-briefed.', 'Vehicle reversed toward stay wire — banksman stopped the move.', 'Gust above 12 m/s during aerial lift — work paused late; wind limit now read from site anemometer.', 'Wrong circuit tag hung at bay entrance — caught by safety observer at circuit ID check.', 'Crane slew within 6 m of energised 132 kV span — slew limiter set.'],
  'Property damage': ['Crane outrigger cracked farm irrigation pipe — landowner compensated.', 'Access track rutted after rain — reinstated with gravel.'],
  Hazard: ['Anti-climb guard damaged at tower base.', 'Danger plate missing on leg A.', 'Eroded access track — 4×4 only until regraded.', 'Bird nest on crossarm near live jumper.', 'Snake activity reported at foundation chimney.', 'Unfenced excavation from third-party works 30 m from tower.'],
  'Safety observation': ['Correct twin-lanyard use observed during transition at crossarm.', 'Visiting subcontractor had not signed toolbox talk — corrected before start.', 'Portable earth clamps inspected and tagged — good condition.', 'Arc-rated clothing (ATPV 12 cal/cm²) worn correctly by all crew.', 'Rescue kit present and inspected at base of tower.'],
};
const hse = [];
(function seedHse() {
  const mix = [['Safety observation', 32], ['Hazard', 15], ['Near miss', 13], ['First aid', 4], ['Property damage', 2], ['Medical treatment', 1], ['Lost-time injury', 1]];
  const towers = net.towers;
  let k = 0;
  for (const [type, count] of mix) {
    for (let i = 0; i < count; i += 1) {
      const t = towers[Math.floor(R() * towers.length)];
      const m = type === 'Lost-time injury' ? '2026-08' : type === 'Medical treatment' ? '2026-05' : MONTHS[Math.floor(R() * MONTHS.length)];
      const day = String(1 + Math.floor(R() * (m === '2026-11' ? 10 : 27))).padStart(2, '0');
      const crew = net.crews[Math.floor(R() * net.crews.length)];
      const date = `${m}-${day}`;
      hse.push({ id: '', type, date, tower: t.name, towerId: t.id, line: t.line, kv: t.kv, lat: t.lat + (R() - 0.5) * 0.004, lng: t.lng + (R() - 0.5) * 0.004, crew: crew.id, crewName: crew.name, text: pick(TEXT[type]), status: daysBetween(date, ASOF) > 45 ? 'closed' : pick(['open', 'investigating', 'closed']), reporter: pick(net.people).name });
      k += 1;
    }
  }
  // ROW encroachments come from the real LiDAR findings
  net.findings.filter((f) => ['vegetation_encroachment', 'structure_encroachment'].includes(f.defect_class) && f.review_status !== 'rejected' && f.lat).slice(0, 14).forEach((f) => {
    const clearance = (3.2 + R() * 1.6).toFixed(1); const mvcd = f.kv >= 500 ? 6.4 : f.kv >= 220 ? 5.0 : 3.8;
    hse.push({ id: '', type: 'ROW encroachment', date: f.date, tower: f.towerName || f.assetName, towerId: f.tower_id, line: f.line, kv: f.kv, lat: f.lat, lng: f.lng, crew: 'C-06', crewName: 'ROW Vegetation Foxtrot', text: `${f.defect_class === 'vegetation_encroachment' ? 'Vegetation' : 'Structure'} at ${clearance} m from conductor (MVCD ${mvcd} m) — ${f.finding_id}, LiDAR ${f.campaign_id}.`, status: f.review_status === 'confirmed' ? 'investigating' : 'open', reporter: 'LiDAR survey', finding: f.finding_id });
  });
  hse.sort((a, b) => a.date.localeCompare(b.date)).forEach((r, i) => { r.id = `HSE-26-${String(i + 1).padStart(4, '0')}`; });
  void k;
}());
const HOURS = Math.round(net.people.length * 1880 * (10.4 / 12));
const recordables = () => hse.filter((r) => HSE_TYPES[r.type].recordable).length;
const ltis = () => hse.filter((r) => r.type === 'Lost-time injury');
const trir = () => (recordables() * 200000) / HOURS;
const ltifr = () => (ltis().length * 1e6) / HOURS;
const daysSinceLti = () => { const l = ltis().map((r) => r.date).sort().pop(); return l ? daysBetween(l, ASOF) : null; };

/* ------------------------------------------------------------------ shared helpers */
const certTone = { valid: 'ok', expiring: 'warn', expired: 'crit' };
const stageTone = { requested: 'muted', approved: 'info', planned: 'accent', scheduled: 'violet', in_progress: 'warn', completed: 'ok' };
const permitTone = { draft: 'muted', submitted: 'info', approved: 'accent', 'pending isolation': 'warn', issued: 'violet', active: 'ok', cleared: 'ok' };
const PERMIT_FLOW = ['draft', 'submitted', 'approved', 'pending isolation', 'issued', 'active', 'cleared'];
const permitProgress = (p) => { const c = p.checks.filter(([, ok]) => ok).length; return Math.round((c / p.checks.length) * 100); };
const woById = new Map(net.workOrders.map((w) => [w.id, w]));
const certStats = () => { const s = { valid: 0, expiring: 0, expired: 0 }; net.people.forEach((p) => p.certs.forEach((c) => { s[c.state] += 1; })); return s; };
const compliancePct = () => { const s = certStats(); return ((s.valid + s.expiring) / (s.valid + s.expiring + s.expired)) * 100; };
const lineName = (id) => LINE_NAME[id] || id || 'Substation';

/** The task the hero sentence talks about: an active permit whose checks all pass and whose crew is qualified. */
function verifiedTask() {
  const cands = net.permits.filter((p) => permitState.get(p.id) === 'active' && p.checks.every(([, ok]) => ok));
  for (const p of cands) { const wo = woById.get(p.wo); const m = matchCrew(wo, crewById.get(p.crew)); if (!m.blocked) return { p, wo, m }; }
  const p = cands[0] || net.permits[0]; const wo = woById.get(p.wo); return { p, wo, m: matchCrew(wo, crewById.get(p.crew)) };
}

const seeded = (id) => rng(Math.abs([...String(id)].reduce((h, ch2) => (Math.imul(31, h) + ch2.charCodeAt(0)) | 0, 7)));
const auditFor = (pred) => audit.filter(pred).slice(0, 12);
const auditTimeline = (rows) => (rows.length ? ui.timeline(rows.map((a) => ({ when: a.at.replace('T', ' ').slice(0, 16), title: `${a.action} · ${a.object}`, text: `${esc(a.actor)} — ${esc(a.detail)} <span class="wfs-hash">#${a.seq} ${a.hash.slice(0, 10)}…</span>`, tone: /blocked|expired|broken/i.test(a.action) ? 'crit' : /approved|accepted|verified|closed|confirmed/i.test(a.action) ? 'ok' : 'info' }))) : ui.empty('No audit entries for this record yet.'));
const daysTo = (iso) => daysBetween(ASOF, iso);
/** Coordinates as drawn on the map (the network is placed inside Baku city for display). */
const gps = (lat, lng, d = 5) => { if (lat == null) return '—'; const [a, b] = geo.toMap(lat, lng); return `${a.toFixed(d)}, ${b.toFixed(d)}`; };

function personDrawer(id) {
  const p = net.people.find((x) => x.id === id); if (!p) return;
  const crew = crewById.get(p.crew);
  const bad = p.certs.filter((c) => c.state !== 'valid');
  const jobs = openWos.filter((w) => assigned.get(w.id) === p.crew);
  const r = seeded(p.id); const weeks = Array.from({ length: 8 }, (_, i) => `W${38 + i}`); const hrs = weeks.map((_, i) => (i === 7 ? p.hoursWeek : Math.round(p.hoursWeek - 6 + r() * 10)));
  drawer.open({
    icon: 'users', kicker: `${p.id} · ${p.role}`, title: p.name, sub: `${esc(p.crewName)} · ${p.years} years in service · base ${esc(crew?.baseName || '—')}`,
    badges: [[p.crew, 'accent'], ...(bad.length ? [[`${bad.length} authorisation${bad.length > 1 ? 's' : ''} need renewal`, bad.some((c) => c.state === 'expired') ? 'crit' : 'warn']] : [['All authorisations valid', 'ok']]), [p.hoursWeek > 48 ? 'Above 48 h limit' : 'Within working-time', p.hoursWeek > 48 ? 'crit' : 'ok'], [`Fatigue ${p.fatigue}`, p.fatigue > 60 ? 'warn' : 'ok']],
    meta: `Source: HR / LMS · crew telematics · ${fmt.date(ASOF)}`,
    tabs: [
      {
        name: 'Profile',
        body: `<div class="nx-sec"><h4>This week</h4>${ui.stats([{ label: 'Hours booked', value: `${p.hoursWeek} h`, color: p.hoursWeek > 48 ? '#dc2626' : undefined }, { label: 'Fatigue index', value: p.fatigue, color: p.fatigue > 60 ? '#d97706' : '#16a34a' }, { label: 'Years in service', value: p.years }, { label: 'Crew jobs open', value: jobs.length }])}</div>
          <div class="nx-drawer-grid"><div class="nx-sec"><h4>Fatigue risk (FRMS) ${ui.exp()}</h4><div class="nx-chart is-sm" data-chart="pfat"></div><p class="nx-note">fatigue-risk index, simulated on demo data and not validated; the intended inputs are shift pattern, travel and consecutive days. Above 60 a planner must countersign night or emergency call-out.</p></div>
          <div class="nx-sec"><h4>Booked hours · last 8 weeks</h4><div class="nx-chart is-sm" data-chart="phrs"></div><p class="nx-note">Dashed red line: 48 h average working-week limit (EU 2003/88/EC).</p></div></div>
          <div class="nx-sec"><h4>Certifications & authorisations</h4>${p.certs.length ? ui.table({ cols: [{ key: 'name', label: 'Certificate', render: (c) => `<b>${esc(c.name)}</b><span class="nx-sub">${esc(c.id)}</span>` }, { key: 'expires', label: 'Expires', render: (c) => `${fmt.date(c.expires)}<span class="nx-sub">${daysTo(c.expires) >= 0 ? `in ${daysTo(c.expires)} d` : `${-daysTo(c.expires)} d ago`}</span>` }, { key: 'state', label: 'State', render: (c) => ui.badge(c.state, certTone[c.state]) }], rows: p.certs }) : ui.empty('No certificates required for this role.')}</div>`,
        mount: (el, ctx) => {
          ctx.chart('pfat', ch.gauge({ value: p.fatigue, name: 'fatigue', bands: [[0.4, '#16a34a'], [0.6, '#f59e0b'], [1, '#dc2626']] }));
          ctx.chart('phrs', ch.line({ x: weeks, series: [{ name: 'Hours', data: hrs, area: true, color: '#2563eb', symbol: true, markLine: { symbol: 'none', silent: true, data: [{ yAxis: 48 }], lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: '48 h', color: '#dc2626' } } }], yMin: 28, yMax: 58, legend: false, grid: { top: 12 } }));
        },
      },
      {
        name: 'Authorisations',
        body: `<div class="nx-sec"><h4>Days until each authorisation lapses</h4>${p.certs.length ? '<div class="nx-chart is-sm" data-chart="pexp"></div>' : ui.empty('None held.')}<p class="nx-note">Negative = already expired. Expired authorisations are excluded from crew matching until renewed.</p></div>
          <div class="nx-sec"><h4>What the crew's trade requires (${esc(crew?.skill || '—')})</h4><div class="nx-list">${(REQ[crew?.skill] || []).map((cid) => { const h = p.certs.find((c) => c.id === cid); return ui.li({ ic: h?.state === 'valid' ? 'checkCircle' : h ? 'alert' : 'x', color: h?.state === 'valid' ? '#16a34a' : h?.state === 'expiring' ? '#d97706' : '#dc2626', title: CERT[cid].name, sub: h ? `${h.state} · ${fmt.date(h.expires)}` : 'Not held by this person — covered by other crew members', end: ui.badge(cid, 'muted', { dot: false }) }); }).join('')}</div></div>`,
        mount: (el, ctx) => { if (p.certs.length) ctx.chart('pexp', ch.bar({ x: p.certs.map((c) => c.id), horizontal: true, labels: true, legend: false, series: [{ name: 'Days to expiry', data: p.certs.map((c) => ({ value: daysTo(c.expires), itemStyle: { color: c.state === 'expired' ? '#dc2626' : c.state === 'expiring' ? '#f59e0b' : '#16a34a', borderRadius: [0, 4, 4, 0] } })) }], grid: { top: 8, right: 40 } })); },
      },
      {
        name: 'Activity',
        body: `<div class="nx-sec"><h4>Crew work in hand ${ui.erp('SAP PM', 'workOrders')}</h4>${jobs.length ? `<div class="nx-list">${jobs.slice(0, 6).map((w) => ui.li({ ic: 'clipboard', color: SEV[w.severity], title: `${w.id} · ${fmt.title(w.work_type)}`, sub: `${esc(w.towerName || w.asset)} · ${esc(w.line || 'Substation')} · planned ${fmt.short(w.planned_date)}`, end: ui.badge(w.stage.replace('_', ' '), stageTone[w.stage]) })).join('')}</div>` : ui.empty('No open jobs for this crew.')}</div>
          <div class="nx-sec"><h4>Audit trail</h4>${auditTimeline(auditFor((a) => a.object === p.id || a.actor.includes(p.name.split(' ').pop()) || jobs.some((w) => a.object === w.id || a.detail.includes(w.id)) || net.permits.some((x) => x.crew === p.crew && a.object === x.id)))}</div>`,
      },
    ],
    actions: [{ label: 'Book renewal training', icon: 'calendar', onClick: (close) => { log({ actor: 'Planner M. Gasimov', action: 'Training booked', object: p.id, detail: bad.map((c) => c.id).join(', ') || 'refresher' }); toast(`Renewal course booked for ${p.name}`); close(); } }, { label: 'Crew', icon: 'users', onClick: () => crewDrawer(p.crew) }, { label: 'Done', primary: true, onClick: (c) => c() }],
  });
}

function permitDrawer(id) {
  const p = net.permits.find((x) => x.id === id); if (!p) return;
  const st = permitState.get(p.id); const wo = woById.get(p.wo); const m = matchCrew(wo, crewById.get(p.crew));
  const idx = PERMIT_FLOW.indexOf(st);
  const chain = [['Requested', `${p.crewName} lead`], ['Reviewed', 'Planner M. Gasimov'], ['Approved', p.authorisedBy], ['Isolation', 'Control: Dispatcher 2'], ['Issued', p.authorisedBy], ['Accepted on site', `${p.crewName} lead`], ['Cleared & cancelled', 'Senior AP']];
  const hrsLeft = Math.max(0, daysTo(p.expires) * 24 + 18);
  drawer.open({
    icon: 'key', kicker: `${p.type} · ${p.code}`, title: p.id, sub: `${esc(p.wo)} · ${esc(fmt.title(wo.work_type))} at ${esc(p.asset)} · ${esc(lineName(p.line))}`, wide: true,
    badges: [[st, permitTone[st]], [`${permitProgress(p)}% prerequisites`, permitProgress(p) === 100 ? 'ok' : 'warn'], [m.blocked ? 'Crew competence gap' : `Crew qualified · match ${m.score}/100`, m.blocked ? 'crit' : 'ok'], [wo.outage ? 'Outage isolation' : 'Live-line method', wo.outage ? 'warn' : 'info']],
    meta: `Authorised by ${p.authorisedBy} · SAP PM ${wo.sap} · Maximo ${wo.maximo}`,
    tabs: [
      {
        name: 'Overview',
        body: `<div class="nx-sec"><h4>Permit at a glance</h4>${ui.stats([{ label: 'Issued', value: fmt.short(p.issued) }, { label: 'Expires', value: fmt.short(p.expires), color: hrsLeft <= 24 ? '#dc2626' : undefined }, { label: 'Hours left', value: `${hrsLeft} h` }, { label: 'Crew', value: p.crew }, { label: 'Labour', value: `${wo.labourH} h` }])}</div>
          <div class="nx-drawer-grid"><div class="nx-sec"><h4>Prerequisites & safety clearances</h4><div class="nx-chart" style="height:120px" data-chart="pprog"></div><div class="nx-list">${p.checks.map(([label, ok]) => ui.li({ ic: ok ? 'checkCircle' : 'alert', color: ok ? '#16a34a' : '#d97706', title: label, sub: ok ? 'Verified' : 'Outstanding — blocks issue' })).join('')}</div></div>
          <div class="nx-sec"><h4>Approval chain</h4>${ui.timeline(chain.map(([t, who], i) => ({ when: i <= idx ? (i < 2 ? fmt.date(addDays(p.issued, -1)) : fmt.date(p.issued)) : 'Pending', title: t, text: esc(who), tone: i < idx ? 'ok' : i === idx ? 'info' : 'muted' })))}</div></div>
          <div class="nx-sec"><h4>Isolation & earthing</h4>${ui.callout(`<b>${esc(p.isolation)}</b><br/>EN 50110-1 five rules: disconnect · secure against reclosure · verify absence of voltage · earth and short-circuit · protect against adjacent live parts.`, wo.outage ? 'warn' : 'info', 'lock')}</div>`,
        mount: (el, ctx) => { const ok = p.checks.filter(([, v]) => v).length; ctx.chart('pprog', ch.donut({ data: [{ name: 'Verified', value: ok, color: '#16a34a' }, { name: 'Outstanding', value: p.checks.length - ok, color: '#f59e0b' }], center: 'checks', legend: 'right', value: `${ok}/${p.checks.length}` })); },
      },
      {
        name: 'Crew competence',
        body: `<div class="nx-sec"><h4>Competence engine · ${esc(m.crew.id)} ${esc(m.crew.name)}</h4><div class="wfs-why">${m.reasons.map(([k, t]) => `${icon(k === 'ok' ? 'checkCircle' : k === 'no' ? 'x' : 'alert')}<span class="wfs-${k}">${esc(t)}</span>`).join('')}</div></div>
          <div class="nx-sec"><h4>Crew members on this permit</h4>${ui.table({ cols: [{ key: 'name', label: 'Name', render: (x) => `<b>${esc(x.name)}</b><span class="nx-sub">${esc(x.role)}</span>` }, { key: 'certs', label: 'Authorisations', sort: false, render: (x) => x.certs.map((c) => `<span class="nx-badge t-${certTone[c.state]} no-dot" style="margin:1px">${esc(c.id)}</span>`).join('') || '—' }, { key: 'hoursWeek', label: 'Hours', align: 'r' }], rows: peopleOf(p.crew), rowId: (x) => x.id })}</div>`,
        mount: (el, ctx) => ctx.on('click', 'tr[data-row]', (e, r) => personDrawer(r.dataset.row)),
      },
      { name: 'Audit trail', body: `<div class="nx-sec"><h4>Hash-chained history of ${esc(p.id)}</h4>${auditTimeline(auditFor((a) => a.object === p.id))}</div>` },
    ],
    actions: [
      ...(wo.outage ? [{ label: 'Isolation diagram', icon: 'schematic', onClick: (close) => { isoPermit = p.id; close(); nav.go('isolation'); } }] : []),
      ...(idx < PERMIT_FLOW.length - 1 ? [{ label: `Advance to “${PERMIT_FLOW[idx + 1]}”`, primary: true, onClick: (close) => {
        if (PERMIT_FLOW[idx + 1] === 'issued' && (m.blocked || p.checks.some(([, ok]) => !ok))) { toast(`${p.id} cannot be issued: prerequisites or competence outstanding`, 'crit'); return; }
        permitState.set(p.id, PERMIT_FLOW[idx + 1]); log({ actor: p.authorisedBy, action: `Permit → ${PERMIT_FLOW[idx + 1]}`, object: p.id, detail: p.wo, source: 'NEXUS Permits' }); toast(`${p.id} moved to ${PERMIT_FLOW[idx + 1]}`); close(); nav.rerender();
      } }] : []),
    ],
  });
}

function hseDrawer(id) {
  const r = hse.find((x) => x.id === id); if (!r) return;
  const T = HSE_TYPES[r.type];
  const near = hse.filter((x) => x.id !== r.id && (x.towerId === r.towerId || (x.line === r.line && x.type === r.type))).slice(-5).reverse();
  drawer.open({
    icon: T.icon === 'event' ? 'event' : 'shield', kicker: `${r.id} · ${r.type}`, title: `${r.tower} · ${r.line || ''}`, sub: `${fmt.date(r.date)} · reported by ${esc(r.reporter)} · ${esc(r.crewName)}`,
    badges: [[r.type, T.tone], [r.status, r.status === 'closed' ? 'ok' : r.status === 'open' ? 'warn' : 'info'], [T.recordable ? 'OSHA recordable' : 'Not recordable', T.recordable ? 'crit' : 'muted'], ...(r.finding ? [[`LiDAR ${r.finding}`, 'violet']] : [])],
    meta: `ISO 45001 §10.2 · ${daysBetween(r.date, ASOF)} days since report`,
    body: `${ui.callout(esc(r.text), T.tone === 'ok' ? 'ok' : T.tone === 'crit' ? 'crit' : 'warn', T.icon)}
      <div class="nx-drawer-grid"><div class="nx-sec"><h4>Record</h4>${ui.kv([['Location', gps(r.lat, r.lng)], ['Asset', esc(`${r.tower} · ${lineName(r.line)}`)], ['Voltage', r.kv ? `${r.kv} kV` : '—'], ['Crew', esc(r.crewName)], ['Reporter', esc(r.reporter)], ...(r.finding ? [['Linked finding', r.finding]] : [])])}</div>
      <div class="nx-sec"><h4>Corrective & preventive actions</h4>${ui.timeline([{ when: fmt.date(r.date), title: 'Reported & area made safe', tone: 'ok' }, { when: fmt.date(addDays(r.date, 2)), title: r.type === 'Safety observation' ? 'Feedback given to crew' : 'Investigation (5-Why / ICAM)', tone: r.status === 'open' ? 'info' : 'ok' }, { when: fmt.date(addDays(r.date, 7)), title: 'Toolbox talk shared with all crews', tone: r.status === 'closed' ? 'ok' : 'muted' }, { when: fmt.date(addDays(r.date, 14)), title: 'Action verified by HSE advisor', tone: r.status === 'closed' ? 'ok' : 'muted' }])}</div></div>
      <div class="nx-sec"><h4>${esc(r.type)} records by month · all crews</h4><div class="nx-chart is-sm" data-chart="htr"></div></div>
      <div class="nx-sec"><h4>Other records at this location or line</h4>${near.length ? `<div class="nx-list">${near.map((x) => ui.li({ ic: HSE_TYPES[x.type].icon, color: HSE_TYPES[x.type].color, title: `${x.id} · ${x.type}`, sub: `${fmt.short(x.date)} · ${esc(x.tower)} · ${esc(x.text)}`, end: ui.badge(x.status, x.status === 'closed' ? 'ok' : 'warn'), row: x.id })).join('')}</div>` : ui.empty('No other records here.')}</div>`,
    mount: (el, ctx) => {
      ctx.chart('htr', ch.bar({ x: MONTHS.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })), legend: false, series: [{ name: r.type, data: MONTHS.map((m) => ({ value: hse.filter((x) => x.type === r.type && x.date.startsWith(m)).length, itemStyle: { color: r.date.startsWith(m) ? T.color : `${T.color}66`, borderRadius: [4, 4, 0, 0] } })) }], grid: { top: 10 } }));
      ctx.on('click', '.nx-li[data-row]', (e, li) => hseDrawer(li.dataset.row));
    },
    actions: [...(r.status !== 'closed' ? [{ label: 'Close record', primary: true, icon: 'check', onClick: (close) => { r.status = 'closed'; log({ actor: 'HSE advisor A. Valiyeva', action: 'HSE record closed', object: r.id, detail: r.type, source: 'NEXUS HSE' }); toast(`${r.id} closed`); close(); nav.rerender(); } }] : []), { label: 'Crew', icon: 'users', onClick: () => crewDrawer(r.crew) }],
  });
}

function woDrawer(id) {
  const w = woById.get(id); if (!w) return;
  const permit = net.permits.find((p) => p.wo === w.id);
  const cands = ranked(w).slice(0, 3);
  const cur = crewById.get(assigned.get(w.id) || w.crew);
  drawer.open({
    icon: 'clipboard', kicker: `${w.id} · SAP ${w.sap} · Maximo ${w.maximo}`, title: fmt.title(w.work_type), sub: `${esc(w.towerName || w.asset)} · ${esc(lineName(w.line))}`, wide: true,
    badges: [[w.stage.replace('_', ' '), stageTone[w.stage]], [`${w.severity} severity`, SEV_TONE[w.severity]], [w.outage ? 'Outage required' : 'Live-line method', w.outage ? 'warn' : 'info'], [permit ? `${permit.id} · ${permitState.get(permit.id)}` : 'No permit yet', permit ? permitTone[permitState.get(permit.id)] : 'muted'], ['ERP · SAP PM', 'info']],
    meta: `Planned ${fmt.date(w.planned_date)} · trade ${w.skill}`,
    tabs: [
      {
        name: 'Overview',
        body: `<div class="nx-sec"><h4>Job</h4>${ui.stats([{ label: 'Labour', value: `${w.labourH} h` }, { label: 'Estimated cost', value: fmt.money(w.estCost) }, { label: 'Voltage', value: w.kv ? `${w.kv} kV` : '—' }, { label: 'Assigned crew', value: cur?.id || '—' }])}</div>
          <div class="nx-drawer-grid"><div class="nx-sec"><h4>Required authorisations (${esc(w.skill)})</h4><div class="nx-list">${(REQ[w.skill] || []).map((cid) => { const n = cur ? peopleOf(cur.id).filter((x) => hasCert(x, cid)).length : 0; return ui.li({ ic: n >= MIN_HOLDERS ? 'checkCircle' : 'alert', color: n >= MIN_HOLDERS ? '#16a34a' : '#dc2626', title: CERT[cid].name, sub: `${n} valid holder(s) in ${cur?.id || 'no crew'} · minimum ${MIN_HOLDERS}` }); }).join('')}</div></div>
          <div class="nx-sec"><h4>Findings driving this work ${ui.exp('Experimental', 'The confidence on each finding is a detection-model score on simulated data, not tested against real inspections yet. Click for the model validation register.')}</h4>${w.findings.length ? `<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: SEV[f.severity], title: `${f.finding_id} · ${f.label}`, sub: `${f.sensor.toUpperCase()} · model confidence ${Math.round(f.confidence * 100)}% · ${f.review_status}`, end: ui.badge(f.severity, SEV_TONE[f.severity]) })).join('')}</div>` : ui.empty('No linked findings.')}</div></div>`,
      },
      {
        name: 'Crew match',
        body: `<div class="nx-sec"><h4>Match score · top crews ${ui.exp()}</h4><div class="nx-chart is-sm" data-chart="wmatch"></div></div>${cands.map((m2, i) => `<div class="nx-sec"><h4>${i + 1}. ${esc(m2.crew.id)} · ${esc(m2.crew.name)} — ${m2.score}/100 ${m2.blocked ? ui.badge('Blocked', 'crit') : ''}</h4><div class="wfs-why">${m2.reasons.map(([k, t]) => `${icon(k === 'ok' ? 'checkCircle' : k === 'no' ? 'x' : 'alert')}<span class="wfs-${k}">${esc(t)}</span>`).join('')}</div></div>`).join('')}`,
        mount: (el, ctx) => { const all = ranked(w); ctx.chart('wmatch', ch.bar({ x: all.map((m2) => m2.crew.id), legend: false, labels: true, series: [{ name: 'Match score', data: all.map((m2) => ({ value: m2.score, itemStyle: { color: m2.blocked ? '#fca5a5' : m2.score >= 70 ? '#16a34a' : '#f59e0b', borderRadius: [4, 4, 0, 0] } })) }], max: 100, grid: { top: 16 } })); },
      },
      {
        name: 'Permit & safety',
        body: permit ? `<div class="nx-sec"><h4>${esc(permit.id)} · ${esc(permit.type)}</h4>${ui.kv([['State', ui.badge(permitState.get(permit.id), permitTone[permitState.get(permit.id)])], ['Authorised by', esc(permit.authorisedBy)], ['Expires', fmt.date(permit.expires)], ['Isolation', esc(permit.isolation)]])}</div><div class="nx-sec"><h4>Prerequisites</h4><div class="nx-list">${permit.checks.map(([l, ok]) => ui.li({ ic: ok ? 'checkCircle' : 'alert', color: ok ? '#16a34a' : '#d97706', title: l, sub: ok ? 'Verified' : 'Outstanding' })).join('')}</div></div>` : `<div class="nx-sec"><h4>Permit</h4>${ui.callout('No permit raised yet. The permit is drafted when the job reaches planning.', 'info', 'key')}</div>`,
      },
    ],
    actions: [...(permit ? [{ label: 'Permit', icon: 'key', onClick: () => permitDrawer(permit.id) }] : []), { label: 'Open in Crew Assignment', primary: true, onClick: (close) => { selWo = w.id; close(); nav.go('assign'); } }],
  });
}

/* ================================================================== 1. Workforce Dashboard */
const dashboard = {
  id: 'dash', name: 'Workforce Dashboard', icon: 'dashboard',
  tabs: [
    {
      name: 'Overview', icon: 'dashboard',
      render: () => {
        const v = verifiedTask(); const s = certStats();
        const onSite = net.crews.filter((c) => c.status === 'on site').length;
        const active = net.permits.filter((p) => permitState.get(p.id) === 'active').length;
        const expiring = net.people.flatMap((p) => p.certs.filter((c) => c.state !== 'valid').map((c) => ({ ...c, person: p }))).sort((a, b) => a.expires.localeCompare(b.expires));
        return `<div class="nx-page">
          ${ui.hero({ kicker: 'Operational output · work authorisation', icon: 'shield', text: `Repair task <b>${esc(v.wo.id)}</b> (${esc(v.wo.work_type)} at ${esc(v.wo.towerName || v.wo.asset)}, ${esc(v.wo.line || 'substation')}) verified: work authorisation <b>${esc(v.p.id)}</b> approved, qualified high-voltage crew <b>${esc(v.m.crew.name)}</b> assigned, permits cleared.`, meta: [{ label: 'Competence score', value: `${v.m.score}/100` }, { label: 'Prerequisites', value: `${permitProgress(v.p)}%` }], actions: ui.btn('Open permit', { attrs: `data-permit="${esc(v.p.id)}"` }) })}
          ${ui.kpis([
            { label: 'Field workforce', value: net.people.length, sub: `${net.crews.length} crews · ${net.depots.length} depots`, icon: 'users', spark: [41, 42, 44, 43, 45, 46, 46, net.people.length] },
            { label: 'Crews on site now', value: onSite, unit: `/ ${net.crews.length}`, sub: `${net.crews.filter((c) => c.status === 'available').length} available · ${net.crews.filter((c) => c.status === 'travelling').length} travelling`, icon: 'truck', tone: 'info', spark: [2, 3, 4, 3, 5, 4, 3, onSite] },
            { label: 'Certificate compliance', value: fmt.n(compliancePct(), 1), unit: '%', sub: `${s.expired} expired · ${s.expiring} due ≤ 60 d`, icon: 'award', tone: s.expired ? 'warn' : 'ok', delta: -1.4, spark: [97, 96.8, 96.1, 95.4, 95.9, 95.0, 94.6, compliancePct()] },
            { label: 'Active permits-to-work', value: active, sub: `${net.permits.length} open in register`, icon: 'key', tone: 'violet', spark: [3, 4, 6, 5, 4, 6, 5, active] },
            { label: 'TRIR (YTD)', value: fmt.n(trir(), 2), sub: `per 200,000 h · ${fmt.n(HOURS)} h worked`, icon: 'shield', tone: trir() > 2 ? 'warn' : 'ok', delta: -18, deltaInvert: true, spark: [3.9, 3.6, 3.4, 3.1, 2.9, 2.8, 2.6, trir()] },
            { label: 'Days since last LTI', value: daysSinceLti() ?? '—', sub: `LTIFR ${fmt.n(ltifr(), 1)} per 10⁶ h`, icon: 'hardhat', tone: 'ok', spark: [10, 30, 50, 70, 5, 25, 55, daysSinceLti() || 0] },
          ])}
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s8', title: 'Crew utilisation & hours this week', sub: 'Booked hours against 40 h standard; red line is the 48 h working-time limit (EU 2003/88/EC).', body: ui.chart('util', 'md') })}
            ${ui.card({ cls: 'nx-s4', title: 'Certificate status', sub: `${s.valid + s.expiring + s.expired} certificates across ${net.people.length} people`, body: ui.chart('certs', 'md') })}
          </div>
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s5', title: 'Crew roster · live status', sub: 'GPS from vehicle telematics; click a crew for its members.', flush: true, body: `<div style="padding:0 16px 8px" class="nx-list">${net.crews.map((c) => ui.li({ ic: 'users', color: c.status === 'on site' ? '#16a34a' : c.status === 'travelling' ? '#d97706' : '#2563eb', title: `${c.id} · ${c.name}`, sub: `${esc(c.lead)} · ${c.size} people · ${esc(c.baseName)}${c.job ? ` · on ${esc(c.job)}` : ''}`, end: `${ui.badge(c.status, c.status === 'on site' ? 'ok' : c.status === 'travelling' ? 'warn' : 'info')}<div class="nx-note" style="margin-top:3px">${c.utilisation}% utilised</div>`, row: `crew:${c.id}` })).join('')}</div>` })}
            ${ui.card({ cls: 'nx-s7', title: 'Certificates expired or due in 60 days', sub: 'A person with an expired authorisation is excluded from crew matching until renewed.', tools: ui.search('#wfs-exp', 'Filter people or certs…'), flush: true, body: `${ui.table({ id: 'wfs-exp', cols: [{ key: 'person', label: 'Person', render: (r) => `<b>${esc(r.person.name)}</b><span class="nx-sub">${esc(r.person.role)} · ${esc(r.person.crew)}</span>`, sort: (r) => r.person.name }, { key: 'name', label: 'Certificate', render: (r) => esc(r.name) }, { key: 'expires', label: 'Expires', render: (r) => `${fmt.date(r.expires)}<span class="nx-sub">${daysBetween(ASOF, r.expires) >= 0 ? `in ${daysBetween(ASOF, r.expires)} d` : `${-daysBetween(ASOF, r.expires)} d ago`}</span>` }, { key: 'state', label: 'State', render: (r) => ui.badge(r.state, certTone[r.state]) }], rows: expiring, rowId: (r) => `p:${r.person.id}` })}<div style="padding:10px 16px 6px;border-top:1px solid var(--nx-line-2)"><div class="nx-note" style="font-weight:600;color:var(--nx-ink-2)">Renewal exposure by crew — people who drop out of matching if not renewed</div><div class="nx-chart is-sm" data-chart="expcrew"></div></div>` })}
          </div>
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s7', title: 'Safety performance trend', sub: 'Monthly HSE events by class; leading indicators (observations, hazards) vs lagging (injuries).', body: ui.chart('hseTrend', 'md') })}
            ${ui.card({ cls: 'nx-s5', title: 'Permit pipeline', sub: 'Permits by state across the register', body: ui.chart('permitFunnel', 'md') })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        const crews = net.crews;
        const hrs = crews.map((c) => Math.round(peopleOf(c.id).reduce((a, p) => a + p.hoursWeek, 0) / Math.max(1, peopleOf(c.id).length)));
        ctx.chart('util', { ...ch.bar({ grid: { right: 70 }, x: crews.map((c) => c.id), series: [{ name: 'Avg hours / person', data: hrs.map((h) => ({ value: h, itemStyle: { color: h > 48 ? '#dc2626' : h > 44 ? '#f59e0b' : '#3b82f6', borderRadius: [4, 4, 0, 0] } })), markLine: { symbol: 'none', data: [{ yAxis: 48, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: '48 h limit', color: '#dc2626', position: 'end' } }, { yAxis: 40, lineStyle: { color: '#94a3b8', type: 'dashed' }, label: { formatter: '40 h std', color: '#64748b', position: 'end' } }] } }, { name: 'Utilisation %', data: crews.map((c) => c.utilisation), color: '#14b8a6' }], yName: 'h · %' }), legend: { top: 0, right: 0 } });
        const s = certStats();
        ctx.chart('certs', ch.donut({ data: [{ name: 'Valid', value: s.valid, color: '#16a34a' }, { name: 'Due ≤ 60 d', value: s.expiring, color: '#f59e0b' }, { name: 'Expired', value: s.expired, color: '#dc2626' }], center: 'certificates', legend: 'right' }));
        const cls = ['Safety observation', 'Hazard', 'Near miss', 'First aid', 'Medical treatment', 'Lost-time injury'];
        ctx.chart('hseTrend', ch.bar({ x: MONTHS.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })), stack: true, series: cls.map((c) => ({ name: c, data: MONTHS.map((m) => hse.filter((r) => r.type === c && r.date.startsWith(m)).length), color: HSE_TYPES[c].color })) }));
        const fl = PERMIT_FLOW.slice(0, 6).map((s2) => ({ name: s2, value: net.permits.filter((p) => permitState.get(p.id) === s2).length }));
        ctx.chart('permitFunnel', ch.bar({ x: fl.map((f) => fmt.title(f.name)), horizontal: true, labels: true, series: [{ name: 'Permits', data: fl.map((f, i) => ({ value: f.value, itemStyle: { color: ['#94a3b8', '#0ea5e9', '#2563eb', '#f59e0b', '#8b5cf6', '#16a34a'][i], borderRadius: [0, 4, 4, 0] } })) }] }));
        ctx.chart('expcrew', ch.bar({ x: net.crews.map((c) => c.id), stack: true, series: [{ name: 'Expired', color: '#dc2626', data: net.crews.map((c) => crewCnt(c.id, 'expired')) }, { name: 'Due ≤ 60 d', color: '#f59e0b', data: net.crews.map((c) => crewCnt(c.id, 'expiring')) }], grid: { top: 26 }, tooltip: { formatter: (ps) => `<b>${esc(crewById.get(ps[0].name).name)}</b><br/>${ps.map((x) => `${x.marker}${x.seriesName}: <b>${x.value}</b>`).join('<br/>')}` } }));
        ctx.on('click', '[data-permit]', (e, b) => permitDrawer(b.dataset.permit));
        ctx.on('click', '[data-row]', (e, r) => {
          const id = r.dataset.row;
          if (id.startsWith('p:')) personDrawer(id.slice(2));
          if (id.startsWith('crew:')) crewDrawer(id.slice(5));
        });
      },
    },
    {
      name: 'Qualification matrix', icon: 'award',
      render: () => `<div class="nx-page">${ui.callout('Each cell is one person × one authorisation. <b>Green</b> valid, <b>amber</b> due within 60 days, <b>red</b> expired, grey not held. Required authorisations per trade follow EN 50110-1 “skilled person” and the company HV safety rules.', 'info', 'award')}
        ${ui.card({ title: 'Qualification & HV authorisation matrix', sub: `${net.people.length} people × ${net.certs.length} certificates · as of ${fmt.date(ASOF)}`, tools: ui.chips('mxcrew', [['all', 'All crews'], ...net.crews.map((c) => [c.id, c.id])], 'all'), body: '<div class="nx-chart" data-chart="mx" style="height:880px"></div>' })}</div>`,
      mount: (st, ctx) => {
        const draw = (crew) => {
          const ppl = net.people.filter((p) => crew === 'all' || p.crew === crew);
          const data = [];
          ppl.forEach((p, yi) => net.certs.forEach((c, xi) => { const h = p.certs.find((x) => x.id === c.id); data.push([xi, yi, h ? { expired: 1, expiring: 2, valid: 3 }[h.state] : 0]); }));
          const el = st.querySelector('[data-chart="mx"]'); el.style.height = `${Math.max(320, ppl.length * 19 + 110)}px`;
          ctx.chart(el, {
            grid: { left: 8, right: 16, top: 10, bottom: 60, containLabel: true },
            tooltip: { formatter: (p) => { const per = ppl[p.value[1]]; const c = net.certs[p.value[0]]; const h = per.certs.find((x) => x.id === c.id); return `<b>${esc(per.name)}</b> · ${esc(per.role)}<br/>${esc(c.name)}<br/>${h ? `${h.state} · expires ${fmt.date(h.expires)}` : 'not held'}`; } },
            xAxis: { type: 'category', data: net.certs.map((c) => c.id), position: 'top', axisLabel: { color: '#475569', fontSize: 10.5, interval: 0 } },
            yAxis: { type: 'category', data: ppl.map((p) => `${p.name} · ${p.crew}`), inverse: true, axisLabel: { color: '#334155', fontSize: 10.5 } },
            visualMap: { type: 'piecewise', orient: 'horizontal', left: 'center', bottom: 0, pieces: [{ value: 0, label: 'Not held', color: '#eef2f6' }, { value: 1, label: 'Expired', color: '#dc2626' }, { value: 2, label: 'Due ≤ 60 d', color: '#f59e0b' }, { value: 3, label: 'Valid', color: '#16a34a' }], textStyle: { color: '#475569', fontSize: 11 } },
            series: [{ type: 'heatmap', data, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 } }],
          }, { onClick: (p) => personDrawer(ppl[p.value[1]].id) });
        };
        draw('all');
        ctx.onPick('mxcrew', draw);
      },
    },
    {
      name: 'Fatigue & hours', icon: 'clock',
      render: () => {
        const over = net.people.filter((p) => p.hoursWeek > 48 || p.fatigue > 60).sort((a, b) => b.fatigue - a.fatigue);
        return `<div class="nx-page"><div class="nx-row nx-c12">
          ${ui.card({ cls: 'nx-s7', exp: true, title: 'Hours worked vs fatigue index', sub: 'Each dot is a person this week. Upper-right quadrant needs a planner sign-off before call-out.', body: ui.chart('fat', 'lg') })}
          ${ui.card({ cls: 'nx-s5', title: 'Weekly hours by crew · last 12 weeks', sub: 'Average booked hours per person', body: ui.chart('wk', 'lg') })}</div>
          ${ui.card({ exp: true, title: 'People above working-time or fatigue thresholds', sub: '> 48 h this week or fatigue index > 60', flush: true, body: ui.table({ cols: [{ key: 'name', label: 'Person', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.id)} · ${esc(p.role)}</span>` }, { key: 'crew', label: 'Crew', render: (p) => esc(p.crewName) }, { key: 'hoursWeek', label: 'Hours', align: 'r', render: (p) => `<b style="color:${p.hoursWeek > 48 ? '#dc2626' : 'inherit'}">${p.hoursWeek} h</b>` }, { key: 'fatigue', label: 'Fatigue', render: (p) => ui.meter(p.fatigue, 100, p.fatigue > 60 ? '#d97706' : '#16a34a') }, { key: 'action', label: 'Planner action', sort: false, render: (p) => (p.hoursWeek > 48 ? ui.badge('Stand down next shift', 'crit') : ui.badge('No night call-out', 'warn')) }], rows: over, rowId: (p) => p.id }) })}</div>`;
      },
      mount: (st, ctx) => {
        ctx.chart('fat', { grid: ch.grid({ top: 30 }), tooltip: { formatter: (p) => `<b>${esc(p.data[2])}</b><br/>${p.data[0]} h · fatigue ${p.data[1]}` }, legend: { top: 0, right: 0, type: 'scroll' }, xAxis: { type: 'value', name: 'hours / week', min: 28, max: 56 }, yAxis: { type: 'value', name: 'fatigue', min: 0, max: 100 },
          series: net.crews.map((c, i) => ({ type: 'scatter', name: c.id, symbolSize: 11, data: peopleOf(c.id).map((p) => [p.hoursWeek, p.fatigue, p.name, p.id]), itemStyle: { color: ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'][i] },
            markArea: i === 0 ? { silent: true, itemStyle: { color: 'rgba(220,38,38,.06)' }, data: [[{ xAxis: 48, yAxis: 60 }, { xAxis: 56, yAxis: 100 }]] } : undefined,
            markLine: i === 0 ? { symbol: 'none', silent: true, data: [{ xAxis: 48 }, { yAxis: 60 }], lineStyle: { color: '#dc2626', type: 'dashed' }, label: { show: false } } : undefined })) }, { onClick: (p) => personDrawer(p.data[3]) });
        const r2 = rng(99);
        const weeks = Array.from({ length: 12 }, (_, i) => `W${34 + i}`);
        ctx.chart('wk', ch.line({ x: weeks, series: net.crews.slice(0, 6).map((c) => ({ name: c.id, data: weeks.map((_, i) => Math.round(38 + r2() * 8 + (i > 8 ? 3 : 0))) })), yName: 'h', yMin: 30, yMax: 54 }));
        ctx.on('click', 'tr[data-row]', (e, r) => personDrawer(r.dataset.row));
      },
    },
  ],
};

function crewDrawer(id) {
  const c = crewById.get(id); if (!c) return;
  const ppl = peopleOf(id);
  const jobs = openWos.filter((w) => assigned.get(w.id) === id);
  const req = REQ[c.skill] || [];
  const exp = ppl.reduce((a, p) => a + p.certs.filter((x) => x.state === 'expired').length, 0);
  drawer.open({
    icon: 'truck', kicker: `${c.id} · ${c.skill} crew`, title: c.name, sub: `${esc(c.lead)} · ${esc(c.vehicle)}`, wide: true,
    badges: [[c.status, c.status === 'on site' ? 'ok' : c.status === 'travelling' ? 'warn' : 'info'], [`${c.utilisation}% utilised`, c.utilisation > 90 ? 'warn' : 'accent'], [exp ? `${exp} expired authorisation${exp > 1 ? 's' : ''}` : 'Authorisations in date', exp ? 'crit' : 'ok'], [`${jobs.length} open jobs`, 'muted']],
    meta: `Base ${c.baseName} · GPS ${gps(c.lat, c.lng, 4)}`,
    tabs: [
      {
        name: 'Members',
        body: `<div class="nx-sec"><h4>Crew</h4>${ui.stats([{ label: 'Status', value: c.status }, { label: 'Base', value: c.baseName }, { label: 'Size', value: c.size }, { label: 'Current job', value: c.job || '—' }, { label: 'Avg hours', value: `${Math.round(ppl.reduce((a, p) => a + p.hoursWeek, 0) / Math.max(1, ppl.length))} h` }])}</div>
          <div class="nx-sec"><h4>Members · click for profile</h4>${ui.table({ cols: [{ key: 'name', label: 'Name', render: (p) => `<b>${esc(p.name)}</b><span class="nx-sub">${esc(p.id)}</span>` }, { key: 'role', label: 'Role' }, { key: 'certs', label: 'Authorisations', sort: false, render: (p) => p.certs.map((x) => `<span class="nx-badge t-${certTone[x.state]} no-dot" style="margin:1px" data-tip="${esc(`${x.name} · ${x.state} · ${fmt.date(x.expires)}`)}">${esc(x.id)}</span>`).join('') || '—' }, { key: 'hoursWeek', label: 'Hours', align: 'r' }, { key: 'fatigue', label: 'Fatigue', render: (p) => ui.meter(p.fatigue, 100, p.fatigue > 60 ? '#d97706' : '#16a34a') }], rows: ppl, rowId: (p) => p.id })}</div>`,
        mount: (el, ctx) => ctx.on('click', 'tr[data-row]', (e, r) => personDrawer(r.dataset.row)),
      },
      {
        name: 'Competence',
        body: `<div class="nx-drawer-grid"><div class="nx-sec"><h4>Valid holders vs minimum</h4><div class="nx-chart is-md" data-chart="crad"></div></div>
          <div class="nx-sec"><h4>Trade authorisations (${esc(c.skill)})</h4><div class="nx-list">${req.map((cid) => { const n = ppl.filter((p) => hasCert(p, cid)).length; return ui.li({ ic: n >= MIN_HOLDERS ? 'checkCircle' : 'alert', color: n >= MIN_HOLDERS ? '#16a34a' : '#dc2626', title: CERT[cid].name, sub: `${n} valid holder(s) · minimum ${MIN_HOLDERS}`, end: ui.badge(n >= MIN_HOLDERS ? 'covered' : 'gap', n >= MIN_HOLDERS ? 'ok' : 'crit') }); }).join('')}</div></div></div>`,
        mount: (el, ctx) => {
          const ids = [...new Set([...req, ...ppl.flatMap((p) => p.certs.map((x) => x.id))])];
          const mx = Math.max(MIN_HOLDERS + 1, ...ids.map((cid) => ppl.filter((p) => p.certs.some((x) => x.id === cid)).length));
          ctx.chart('crad', { legend: { bottom: 0 }, tooltip: { trigger: 'item' }, radar: { indicator: ids.map((cid) => ({ name: cid, max: mx })), radius: '62%', axisName: { color: '#475569', fontSize: 10 } }, series: [{ type: 'radar', data: [{ name: 'Valid holders', value: ids.map((cid) => ppl.filter((p) => hasCert(p, cid)).length), areaStyle: { color: 'rgba(37,99,235,.18)' }, lineStyle: { color: '#2563eb' }, itemStyle: { color: '#2563eb' } }, { name: 'Minimum', value: ids.map((cid) => (req.includes(cid) ? MIN_HOLDERS : 0)), lineStyle: { color: '#dc2626', type: 'dashed' }, itemStyle: { color: '#dc2626' } }] }] });
        },
      },
      {
        name: 'Workload',
        body: `<div class="nx-sec"><h4>Booked hours per member · this week</h4><div class="nx-chart is-sm" data-chart="cwl"></div></div><div class="nx-sec"><h4>Open jobs ${ui.erp('SAP PM', 'workOrders')}</h4>${jobs.length ? ui.table({ cols: [{ key: 'id', label: 'WO', render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub">${esc(fmt.title(w.work_type))}</span>` }, { key: 'towerName', label: 'Asset', render: (w) => `${esc(w.towerName || w.asset)}<span class="nx-sub">${esc(w.line || 'Substation')}</span>` }, { key: 'severity', label: 'Severity', render: (w) => ui.badge(w.severity, SEV_TONE[w.severity]) }, { key: 'labourH', label: 'Labour', align: 'r', render: (w) => `${w.labourH} h` }, { key: 'planned_date', label: 'Planned', render: (w) => fmt.short(w.planned_date) }], rows: jobs, rowId: (w) => w.id }) : ui.empty('No open jobs assigned.')}</div>`,
        mount: (el, ctx) => {
          ctx.chart('cwl', ch.bar({ x: ppl.map((p) => p.name.split(' ')[0]), legend: false, series: [{ name: 'Hours', data: ppl.map((p) => ({ value: p.hoursWeek, itemStyle: { color: p.hoursWeek > 48 ? '#dc2626' : '#3b82f6', borderRadius: [4, 4, 0, 0] } })), markLine: { symbol: 'none', silent: true, data: [{ yAxis: 48 }], lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: '48 h' } } }], grid: { top: 14 } }));
          ctx.on('click', 'tr[data-row]', (e, r) => woDrawer(r.dataset.row));
        },
      },
    ],
    actions: [{ label: 'Assign work', icon: 'users', onClick: (close) => { close(); nav.go('assign'); } }, { label: 'Done', primary: true, onClick: (cl) => cl() }],
  });
}

/* ================================================================== 2. Crew Assignment */
const assignScreen = {
  id: 'assign', name: 'Crew Assignment', icon: 'users',
  tabs: [
    {
      name: 'Assignment board', icon: 'users',
      render: () => {
        const wo = woById.get(selWo) || openWos[0];
        const list = ranked(wo);
        const cur = assigned.get(wo.id);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Open work orders', value: openWos.length, sub: `${openWos.filter((w) => w.severity === 'critical' || w.severity === 'high').length} high / critical`, icon: 'clipboard' },
            { label: 'Auto-matched & qualified', value: openWos.filter((w) => !matchCrew(w, crewById.get(assigned.get(w.id))).blocked).length, sub: 'assignment passes every competence rule', icon: 'checkCircle', tone: 'ok' },
            { label: 'Blocked by competence', value: openWos.filter((w) => matchCrew(w, crewById.get(assigned.get(w.id))).blocked).length, sub: 'expired or missing authorisation', icon: 'lock', tone: 'crit' },
            { label: 'Average match score', value: Math.round(openWos.reduce((a, w) => a + matchCrew(w, crewById.get(assigned.get(w.id))).score, 0) / openWos.length), unit: '/100', icon: 'target', tone: 'violet', exp: true },
          ])}
          <div class="wfs-split">
            ${ui.card({ exp: true, erp: ['SAP PM', 'workOrders'], title: `${wo.id} · ${fmt.title(wo.work_type)}`, sub: `${wo.towerName || wo.asset} · ${lineName(wo.line)} · ${wo.kv || '—'} kV`, tools: `${ui.badge(`${wo.severity}`, SEV_TONE[wo.severity])}${wo.outage ? ui.badge('Outage', 'warn') : ui.badge('Live-line', 'info')}${ui.btn('Work order', { sm: true, attrs: `data-wo="${esc(wo.id)}"` })}`,
              body: `<div class="nx-row nx-c3" style="margin-bottom:14px">${ui.stats([{ label: 'Trade needed', value: wo.skill }, { label: 'Labour estimate', value: `${wo.labourH} h` }, { label: 'Planned', value: fmt.short(wo.planned_date) }])}${ui.stats([{ label: 'Required authorisations', value: (REQ[wo.skill] || []).join(' · ') }])}${ui.stats([{ label: 'Currently assigned', value: cur || '—' }])}</div>
              <div class="nx-row nx-c2">${list.slice(0, 4).map((m, i) => `<div class="wfs-cand${i === 0 && !m.blocked ? ' is-best' : ''}${m.blocked ? ' is-blocked' : ''}"><div class="wfs-cand-h"><span class="wfs-ring" style="background:${m.blocked ? '#fdecec' : m.score >= 70 ? '#e8f7ee' : '#fff4e5'};color:${m.blocked ? '#b91c1c' : m.score >= 70 ? '#15803d' : '#b45309'}">${m.score}</span><div style="min-width:0"><b>${esc(m.crew.id)} · ${esc(m.crew.name)}</b><div class="nx-note">${esc(m.crew.lead)} · ${m.crew.size} people · ${esc(m.crew.status)}</div></div><span style="margin-left:auto">${m.blocked ? ui.badge('Blocked', 'crit') : i === 0 ? ui.badge('Best match', 'ok') : ''}</span></div>
                <div class="wfs-why">${m.reasons.map(([k, t]) => `${icon(k === 'ok' ? 'checkCircle' : k === 'no' ? 'x' : 'alert')}<span class="wfs-${k}">${esc(t)}</span>`).join('')}</div>
                <div class="nx-toolbar">${ui.btn(cur === m.crew.id ? 'Assigned' : 'Assign crew', { primary: !m.blocked && cur !== m.crew.id, sm: true, attrs: `data-assign="${esc(m.crew.id)}" ${m.blocked || cur === m.crew.id ? 'disabled' : ''}` })}${ui.btn('Members', { sm: true, ghost: true, attrs: `data-crew="${esc(m.crew.id)}"` })}</div></div>`).join('')}</div>` })}
            ${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Work orders awaiting crews', sub: 'Most severe first · click to match', tools: ui.seg('wosort', [['sev', 'Severity'], ['date', 'Date']], 'sev'), body: `<div class="wfs-wolist">${openWos.map((w) => { const m = matchCrew(w, crewById.get(assigned.get(w.id))); return `<div class="wfs-wo${w.id === wo.id ? ' is-sel' : ''}" data-sel="${esc(w.id)}"><div style="display:flex;gap:6px;align-items:center"><b>${esc(w.id)}</b>${ui.badge(w.severity, SEV_TONE[w.severity])}<span style="margin-left:auto">${m.blocked ? ui.badge('blocked', 'crit', { dot: false }) : ui.badge(assigned.get(w.id), 'muted', { dot: false })}</span></div><span>${esc(fmt.title(w.work_type))} · ${esc(w.towerName || w.asset)} · ${esc(w.line || 'Substation')}</span></div>`; }).join('')}</div>` })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        ctx.on('click', '[data-sel]', (e, b) => { selWo = b.dataset.sel; nav.rerender(); });
        ctx.on('click', '[data-crew]', (e, b) => crewDrawer(b.dataset.crew));
        ctx.on('click', '[data-wo]', (e, b) => woDrawer(b.dataset.wo));
        ctx.on('click', '[data-assign]', (e, b) => {
          const wo = woById.get(selWo); const m = matchCrew(wo, crewById.get(b.dataset.assign));
          if (m.blocked) { toast(`Blocked: ${m.reasons.find((r) => r[0] === 'no')?.[1]}`, 'crit'); return; }
          assigned.set(wo.id, m.crew.id);
          const rq = erpRequest('workOrders', `Crew assignment · ${m.crew.id} on ${wo.id} (SAP ${wo.sap})`, { order: wo.sap, workOrder: wo.id, crew: m.crew.id });
          log({ actor: 'Planner M. Gasimov', action: 'Crew assigned', object: wo.id, detail: `${m.crew.id} · match ${m.score}/100 · update request ${rq.ref} sent to SAP PM ${wo.sap}`, source: 'NEXUS Workforce' });
          nav.rerender();
        });
        ctx.onPick('wosort', (v) => { openWos.sort(v === 'date' ? (a, b) => String(a.planned_date).localeCompare(String(b.planned_date)) : (a, b) => (a.sevScore - b.sevScore) || a.id.localeCompare(b.id)); nav.rerender(); });
      },
    },
    {
      name: 'Coverage by trade', icon: 'layers',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s7', title: 'Valid holders per required authorisation', sub: `Each crew against the authorisations its trade needs; dashed line = minimum ${MIN_HOLDERS} holders per crew.`, body: ui.chart('cov', 'lg') })}
        ${ui.card({ cls: 'nx-s5', exp: true, erp: ['SAP PM', 'workOrders'], title: 'Demand vs capacity by trade', sub: 'Open work-order labour hours (SAP PM) vs estimated crew hours available next 2 weeks', body: ui.chart('dem', 'lg') })}</div>
        ${ui.card({ title: 'Crew competence summary', flush: true, body: ui.table({ cols: [{ key: 'id', label: 'Crew', render: (c) => `<b>${esc(c.id)} · ${esc(c.name)}</b><span class="nx-sub">${esc(c.lead)}</span>` }, { key: 'skill', label: 'Trade' }, { key: 'size', label: 'Size', align: 'r' }, { key: 'req', label: 'Required authorisations', sort: false, render: (c) => (REQ[c.skill] || []).map((cid) => { const n = peopleOf(c.id).filter((p) => hasCert(p, cid)).length; return `<span class="nx-badge t-${n >= MIN_HOLDERS ? 'ok' : 'crit'}" style="margin:1px">${esc(cid)} ${n}</span>`; }).join('') }, { key: 'exp', label: 'Expired', align: 'r', render: (c) => { const n = peopleOf(c.id).reduce((a, p) => a + p.certs.filter((x) => x.state === 'expired').length, 0); return n ? `<b style="color:#dc2626">${n}</b>` : '0'; }, sort: (c) => peopleOf(c.id).reduce((a, p) => a + p.certs.filter((x) => x.state === 'expired').length, 0) }, { key: 'open', label: 'Open WOs', align: 'r', render: (c) => openWos.filter((w) => assigned.get(w.id) === c.id).length, sort: (c) => openWos.filter((w) => assigned.get(w.id) === c.id).length }], rows: net.crews, rowId: (c) => c.id }) })}</div>`,
      mount: (st, ctx) => {
        const certIds = [...new Set(Object.values(REQ).flat())];
        ctx.chart('cov', ch.bar({ x: net.crews.map((c) => c.id), series: certIds.map((cid, i) => ({ name: cid, data: net.crews.map((c) => ((REQ[c.skill] || []).includes(cid) ? peopleOf(c.id).filter((p) => hasCert(p, cid)).length : null)), color: ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899'][i % 8], markLine: i === 0 ? { symbol: 'none', data: [{ yAxis: MIN_HOLDERS }], lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'min', color: '#dc2626' } } : undefined })), yName: 'holders' }));
        const trades = Object.keys(REQ);
        ctx.chart('dem', ch.bar({ x: trades, horizontal: true, series: [{ name: 'Demand (h)', data: trades.map((t) => Math.round(openWos.filter((w) => w.skill === t).reduce((a, w) => a + w.labourH, 0))), color: '#f59e0b' }, { name: 'Capacity (h)', data: trades.map((t) => net.crews.filter((c) => c.skill === t).reduce((a, c) => a + c.size * 40 * 2 * (1 - c.utilisation / 100 * 0.6), 0)).map(Math.round), color: '#2563eb' }] }));
        ctx.on('click', 'tr[data-row]', (e, r) => crewDrawer(r.dataset.row));
      },
    },
    {
      name: 'People roster', icon: 'registry',
      render: () => `<div class="nx-page">${ui.kpis([
        { label: 'People', value: net.people.length, icon: 'users', sub: `${net.crews.length} crews · ${new Set(net.people.map((p) => p.role)).size} roles` },
        { label: 'Median experience', value: [...net.people].sort((a, b) => a.years - b.years)[Math.floor(net.people.length / 2)].years, unit: 'yrs', icon: 'award', tone: 'violet', sub: `${net.people.filter((p) => p.years < 3).length} people under 3 years` },
        { label: 'HV authorised persons', value: net.people.filter((p) => hasCert(p, 'HV-AUTH')).length, icon: 'zap', tone: 'info', sub: 'valid HV-AUTH, ≥ 110 kV' },
        { label: 'Average booked hours', value: fmt.n(net.people.reduce((a, p) => a + p.hoursWeek, 0) / net.people.length, 1), unit: 'h', icon: 'clock', tone: 'warn', sub: `${net.people.filter((p) => p.hoursWeek > 48).length} above 48 h` },
      ])}<div class="nx-row nx-c3">${ui.card({ title: 'Role mix', sub: 'Field roles across all crews', body: ui.chart('rmix', 'sm') })}${ui.card({ title: 'Experience profile', sub: 'People by years in service — succession risk sits in the 20+ band', body: ui.chart('rexp', 'sm') })}${ui.card({ title: 'Authorisations held per person', sub: 'Multi-skilled people make crews resilient to absence', body: ui.chart('rauth', 'sm') })}</div>
      ${ui.card({ title: 'Field workforce roster', sub: `${net.people.length} people · click for authorisations and fatigue`, tools: ui.search('#wfs-ppl', 'Search name, role, crew…'), flush: true, body: ui.table({ id: 'wfs-ppl', cols: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name', render: (p) => `<b>${esc(p.name)}</b>` }, { key: 'role', label: 'Role' }, { key: 'crewName', label: 'Crew', render: (p) => `${esc(p.crew)}<span class="nx-sub">${esc(p.crewName)}</span>` }, { key: 'years', label: 'Years', align: 'r' }, { key: 'certs', label: 'Authorisations', sort: (p) => p.certs.length, render: (p) => p.certs.map((x) => `<span class="nx-badge t-${certTone[x.state]} no-dot" style="margin:1px">${esc(x.id)}</span>`).join('') || '<span class="nx-note">—</span>' }, { key: 'hoursWeek', label: 'Hours', align: 'r' }, { key: 'fatigue', label: 'Fatigue', render: (p) => ui.meter(p.fatigue, 100, p.fatigue > 60 ? '#d97706' : '#16a34a') }], rows: net.people, rowId: (p) => p.id, cls: 'wfs-scroll' }) })}</div>`,
      mount: (st, ctx) => {
        const roles = {}; net.people.forEach((p) => { roles[p.role] = (roles[p.role] || 0) + 1; });
        const re = Object.entries(roles).sort((a, b) => b[1] - a[1]); const top = re.slice(0, 7); const rest = re.slice(7).reduce((a, e) => a + e[1], 0);
        ctx.chart('rmix', ch.donut({ data: [...top.map(([name, value]) => ({ name, value })), ...(rest ? [{ name: 'Other roles', value: rest, color: '#cbd5e1' }] : [])], center: 'people', legend: 'right' }));
        const bands = [[0, 2], [3, 5], [6, 10], [11, 15], [16, 20], [21, 40]];
        ctx.chart('rexp', ch.bar({ x: bands.map(([a, b]) => (b === 40 ? `${a}+` : `${a}–${b}`)), legend: false, labels: true, series: [{ name: 'People', data: bands.map(([a, b], i) => ({ value: net.people.filter((p) => p.years >= a && p.years <= b).length, itemStyle: { color: i === 5 ? '#8b5cf6' : '#3b82f6', borderRadius: [4, 4, 0, 0] } })) }], grid: { top: 16 } }));
        const nAuth = [0, 1, 2, 3, 4];
        ctx.chart('rauth', ch.bar({ x: nAuth.map((n) => (n === 4 ? '4+' : String(n))), legend: false, labels: true, series: [{ name: 'People', color: '#14b8a6', data: nAuth.map((n) => net.people.filter((p) => (n === 4 ? p.certs.filter((c) => c.state !== 'expired').length >= 4 : p.certs.filter((c) => c.state !== 'expired').length === n)).length) }], grid: { top: 16 } }));
        ctx.on('click', 'tr[data-row]', (e, r) => personDrawer(r.dataset.row));
      },
    },
  ],
};

/* ================================================================== 3. Safety Management */
const safetyScreen = {
  id: 'safety', name: 'Safety Management', icon: 'shield',
  tabs: [
    {
      name: 'Live safety map', icon: 'map', full: true,
      render: () => '<div class="nx-map is-full" id="wfs-map"></div>',
      mount: (st, ctx) => {
        const infoHse = (r) => () => ({ kicker: `${r.id} · ${r.type}`, title: `${r.tower} · ${r.line || ''}`, sub: `${fmt.date(r.date)} · ${esc(r.crewName)}`, badges: [[r.type, HSE_TYPES[r.type].tone], [r.status, r.status === 'closed' ? 'ok' : 'warn']], html: `<div class="nx-note" style="color:var(--nx-ink-2)">${esc(r.text)}</div>`, fields: [['Reporter', esc(r.reporter)], ['Coordinates', gps(r.lat, r.lng, 4)]], actions: [{ label: 'Open record', primary: true, onClick: () => hseDrawer(r.id) }] });
        const active = net.permits.filter((p) => ['active', 'issued'].includes(permitState.get(p.id)) && p.lat);
        const layers = [
          ...networkLayers(net, { subsInfo: (s) => ({ title: s.name, sub: `${s.levels.join(' / ')} kV`, fields: [['Bays', s.bays], ['Lines', s.lines.join(', ')]] }) }),
          { id: 'permits', name: 'Active permit work sites', color: '#dc2626', shape: 'sq', points: active.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, size: 20, shape: 'sq', icon: 'hardhat', color: permitState.get(p.id) === 'active' ? '#dc2626' : '#8b5cf6', pulse: permitState.get(p.id) === 'active', label: p.id, z: 800, search: `${p.wo} ${p.asset}`, tip: `${p.id} · ${p.type} · ${p.asset}`, info: () => ({ kicker: `${p.type}`, title: p.id, sub: `${esc(p.wo)} · ${esc(p.asset)} · ${esc(p.line || '')}`, badges: [[permitState.get(p.id), permitTone[permitState.get(p.id)]], [`${permitProgress(p)}% prerequisites`, permitProgress(p) === 100 ? 'ok' : 'warn']], fields: [['Crew', esc(p.crewName)], ['Authorised by', esc(p.authorisedBy)], ['Expires', fmt.date(p.expires)], ['Isolation', esc(p.isolation)]], actions: [{ label: 'Permit', primary: true, onClick: () => permitDrawer(p.id) }, ...(woById.get(p.wo)?.outage ? [{ label: 'Isolation diagram', icon: 'schematic', onClick: () => { isoPermit = p.id; nav.go('isolation'); } }] : [])] }) })) },
          { id: 'crews', name: 'Crews (GPS)', color: '#2563eb', points: net.crews.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, size: 22, icon: 'truck', color: c.status === 'on site' ? '#16a34a' : c.status === 'travelling' ? '#d97706' : '#2563eb', label: c.id, z: 700, search: c.name, tip: `${c.name} · ${c.status}`, info: () => ({ kicker: `${c.skill} crew`, title: c.name, sub: `${esc(c.lead)} · ${c.size} people`, badges: [[c.status, c.status === 'on site' ? 'ok' : 'info']], fields: [['Vehicle', esc(c.vehicle)], ['Base', esc(c.baseName)], ['Job', c.job || '—'], ['Utilisation', `${c.utilisation}%`]], spark: { label: 'Speed, last 30 min (km/h)', data: Array.from({ length: 30 }, (_, i) => (c.status === 'travelling' ? Math.round(45 + 25 * Math.sin(i / 3)) : c.status === 'on site' ? 0 : Math.round(i > 25 ? 30 : 0))), color: '#2563eb' }, actions: [{ label: 'Crew members', primary: true, onClick: () => crewDrawer(c.id) }] }) })) },
          { id: 'incidents', name: 'Injuries & first aid', color: '#dc2626', points: hse.filter((r) => ['Lost-time injury', 'Medical treatment', 'First aid'].includes(r.type)).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, size: 15, shape: 'dia', color: HSE_TYPES[r.type].color, search: r.tower, tip: `${r.id} · ${r.type}`, info: infoHse(r) })) },
          { id: 'nearmiss', name: 'Near misses & damage', color: '#d97706', points: hse.filter((r) => ['Near miss', 'Property damage'].includes(r.type)).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, size: 13, shape: 'dia', color: HSE_TYPES[r.type].color, search: r.tower, tip: `${r.id} · ${r.type}`, info: infoHse(r) })) },
          { id: 'hazards', name: 'Hazards', color: '#0284c7', points: hse.filter((r) => r.type === 'Hazard').map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, size: 12, color: '#0284c7', search: r.tower, tip: `${r.id} · ${r.text}`, info: infoHse(r) })) },
          { id: 'row', name: 'ROW encroachments', color: '#7c3aed', points: hse.filter((r) => r.type === 'ROW encroachment').map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, size: 14, shape: 'sq', color: '#7c3aed', search: r.tower, tip: `${r.id} · encroachment`, info: infoHse(r) })) },
          { id: 'obs', name: 'Safety observations', color: '#16a34a', on: false, points: hse.filter((r) => r.type === 'Safety observation').map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, size: 10, color: '#16a34a', search: r.tower, tip: `${r.id} · observation`, info: infoHse(r) })) },
        ];
        ctx.map('#wfs-map', {
          layers,
          legend: [{ label: 'LTI / MTI / first aid', color: '#dc2626' }, { label: 'Near miss', color: '#d97706' }, { label: 'Hazard', color: '#0284c7' }, { label: 'ROW encroachment', color: '#7c3aed' }, { label: 'Crew on site', color: '#16a34a' }, { label: 'Active permit', color: '#dc2626' }],
          stats: [{ label: 'Active permits', value: active.filter((p) => permitState.get(p.id) === 'active').length, color: '#dc2626' }, { label: 'Crews on site', value: net.crews.filter((c) => c.status === 'on site').length }, { label: 'Open HSE records', value: hse.filter((r) => r.status !== 'closed').length, color: '#d97706' }, { label: 'Days since LTI', value: daysSinceLti() }],
        });
      },
    },
    {
      name: 'Incidents & observations', icon: 'event',
      render: () => {
        const open = hse.filter((r) => r.status !== 'closed');
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'TRIR (YTD)', value: fmt.n(trir(), 2), sub: 'recordables × 200,000 / hours', icon: 'shield', tone: 'ok', delta: -18, deltaInvert: true },
            { label: 'LTIFR', value: fmt.n(ltifr(), 1), sub: 'LTIs per 1,000,000 h', icon: 'hardhat', tone: 'warn' },
            { label: 'Near-miss reporting rate', value: fmt.n((hse.filter((r) => r.type === 'Near miss').length * 200000) / HOURS, 1), sub: 'per 200,000 h — higher is healthier', icon: 'event', tone: 'info' },
            { label: 'Leading : lagging ratio', value: `${Math.round(hse.filter((r) => ['Safety observation', 'Hazard', 'Near miss'].includes(r.type)).length / Math.max(1, hse.filter((r) => ['First aid', 'Medical treatment', 'Lost-time injury'].includes(r.type)).length))} : 1`, sub: 'observations + hazards + near misses per injury', icon: 'trend', tone: 'ok' },
            { label: 'Open actions', value: open.length, sub: `${open.filter((r) => daysBetween(r.date, ASOF) > 30).length} older than 30 days`, icon: 'clipboard', tone: open.length > 15 ? 'warn' : 'ok' },
          ])}
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s4', title: 'Safety pyramid (Bird)', sub: 'Year to date, all crews', body: ui.chart('pyr', 'lg') })}
            ${ui.card({ cls: 'nx-s4', title: 'Rolling 12-month TRIR', sub: 'Recordables × 200,000 / hours, trailing 12 months · company target 3.0', body: ui.chart('trir', 'lg') })}
            ${ui.card({ cls: 'nx-s4', title: 'Log a safety observation', sub: 'Adds a record to the HSE register and the audit trail', body: `<form id="wfs-obs" style="display:flex;flex-direction:column;gap:10px">
              <label class="nx-field">Type<select class="nx-select" name="type">${Object.keys(HSE_TYPES).filter((t) => !HSE_TYPES[t].recordable).map((t) => `<option>${t}</option>`).join('')}</select></label>
              <label class="nx-field">Tower<select class="nx-select" name="tower">${net.towers.filter((t, i) => i % 3 === 0).map((t) => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.line)}</option>`).join('')}</select></label>
              <label class="nx-field">Crew<select class="nx-select" name="crew">${net.crews.map((c) => `<option value="${esc(c.id)}">${esc(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label>
              <label class="nx-field">What was observed<textarea class="nx-input" name="text" rows="3" style="height:auto;padding:8px 10px" required placeholder="e.g. Rescue kit present and inspected at base of tower"></textarea></label>
              <button class="nx-btn is-primary" type="submit">${icon('plus')}Submit record</button></form>` })}
          </div>
          ${ui.card({ title: 'HSE register', sub: `${hse.length} records · hazards, incidents, ROW encroachments and observations`, tools: `${ui.search('#wfs-hse', 'Search tower, type, text…')}`, flush: true, body: ui.table({ id: 'wfs-hse', cols: [{ key: 'id', label: 'Record', render: (r) => `<b>${esc(r.id)}</b><span class="nx-sub">${fmt.date(r.date)}</span>` }, { key: 'type', label: 'Type', render: (r) => ui.badge(r.type, HSE_TYPES[r.type].tone) }, { key: 'tower', label: 'Location', render: (r) => `${esc(r.tower)}<span class="nx-sub">${esc(r.line || '')}</span>` }, { key: 'text', label: 'Description', wrap: true, render: (r) => esc(r.text) }, { key: 'crewName', label: 'Crew', render: (r) => esc(r.crew) }, { key: 'status', label: 'Status', render: (r) => ui.badge(r.status, r.status === 'closed' ? 'ok' : r.status === 'open' ? 'warn' : 'info') }], rows: hse.slice().reverse(), rowId: (r) => r.id, cls: 'wfs-scroll' }) })}</div>`;
      },
      mount: (st, ctx) => {
        const cnt = (types) => hse.filter((r) => types.includes(r.type)).length;
        const pyr = [['Lost-time injury', ['Lost-time injury'], '#7f1d1d'], ['Medical treatment', ['Medical treatment'], '#dc2626'], ['First aid', ['First aid'], '#ea580c'], ['Near miss & damage', ['Near miss', 'Property damage'], '#d97706'], ['Hazards & unsafe conditions', ['Hazard', 'ROW encroachment'], '#0284c7'], ['Safety observations', ['Safety observation'], '#16a34a']];
        ctx.chart('pyr', { tooltip: { trigger: 'item', formatter: (p) => `${esc(p.name)}: <b>${p.data.n}</b>` }, series: [{ type: 'funnel', sort: 'none', left: '2%', width: '50%', top: 10, bottom: 10, gap: 3, minSize: '14%', maxSize: '100%', label: { position: 'right', color: '#334155', fontSize: 11.5, formatter: (p) => `{b|${p.data.n}}  ${p.name}`, rich: { b: { fontWeight: 700, fontSize: 13, color: '#0f172a' } } }, labelLine: { show: true, length: 12, lineStyle: { color: '#cbd5e1' } }, itemStyle: { borderColor: '#fff', borderWidth: 1 },
          data: pyr.map(([name, types, color], i) => ({ name, n: cnt(types), value: i + 1, itemStyle: { color } })) }] });
        const rr = rng(4); const months = MONTHS.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
        const tr = MONTHS.map((_, i) => +(trir() * (1.45 - i * 0.045) + (rr() - 0.5) * 0.5).toFixed(2)); tr[tr.length - 1] = +trir().toFixed(2);
        ctx.chart('trir', ch.line({ grid: { right: 56 }, x: months, series: [{ name: 'TRIR', data: tr, area: true, color: '#2563eb', markLine: { symbol: 'none', data: [{ yAxis: 3.0, label: { formatter: 'target 3.0', color: '#16a34a', position: 'end' }, lineStyle: { color: '#16a34a', type: 'dashed' } }] } }], yMin: 0, legend: false }));
        ctx.on('click', 'tr[data-row]', (e, r) => hseDrawer(r.dataset.row));
        ctx.on('submit', '#wfs-obs', (e, f) => {
          e.preventDefault();
          const d = new FormData(f); const t = net.towerById.get(d.get('tower')); const c = crewById.get(d.get('crew'));
          const r = { id: `HSE-26-${String(hse.length + 1).padStart(4, '0')}`, type: d.get('type'), date: ASOF, tower: t.name, towerId: t.id, line: t.line, kv: t.kv, lat: t.lat, lng: t.lng, crew: c.id, crewName: c.name, text: String(d.get('text')).trim(), status: d.get('type') === 'Safety observation' ? 'closed' : 'open', reporter: 'You (Reliability engineer)' };
          hse.push(r);
          log({ actor: 'Reliability engineer', action: 'HSE record created', object: r.id, detail: `${r.type} at ${r.tower}`, source: 'NEXUS HSE' });
          toast(`${r.id} logged — ${r.type} at ${r.tower}`);
          nav.rerender();
        });
      },
    },
    {
      name: 'Bow-tie · contact with live conductor', icon: 'target',
      render: () => {
        const active = net.permits.filter((p) => ['active', 'issued'].includes(permitState.get(p.id)));
        const pct = (label) => { const xs = active.map((p) => p.checks.find(([l]) => l.startsWith(label))?.[1]).filter((x) => x !== undefined); return xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 100) : 100; };
        const barrier = (name, p, note) => `<div><div style="display:flex;justify-content:space-between;font-weight:600"><span>${esc(name)}</span><span style="color:${p >= 95 ? '#16a34a' : p >= 80 ? '#d97706' : '#dc2626'}">${p}%</span></div>${ui.meter(p, 100, p >= 95 ? '#16a34a' : p >= 80 ? '#d97706' : '#dc2626', '')}<small>${esc(note)}</small></div>`;
        const crewOk = Math.round((openWos.filter((w) => !matchCrew(w, crewById.get(assigned.get(w.id))).blocked).length / openWos.length) * 100);
        return `<div class="nx-page">${ui.callout(`Bow-tie for the principal hazard on HV line work. Barrier effectiveness is measured from the <b>${active.length} issued/active permits</b> and the competence engine — not self-assessed.`, 'info', 'target')}
          ${ui.card({ title: 'Top event: contact with an energised or induced conductor', sub: 'Threats → preventive barriers → top event → recovery barriers → consequences', body: `<div class="wfs-bowtie">
            <div class="wfs-bt-col">${['Inadvertent re-energisation from a remote end', 'Induced voltage from parallel 220/500 kV circuit', 'Work on the wrong circuit or tower', 'Approach inside minimum approach distance'].map((t) => `<div class="wfs-bt t-threat">${esc(t)}<small>Threat</small></div>`).join('')}</div>
            <div class="wfs-bt-col">${[barrier('Switching programme & lock-out', pct('Isolation'), 'Q0/Q9 open, locked and tagged both ends'), barrier('Earths both sides of work site', pct('Portable earths'), 'Proved dead, then earthed and short-circuited'), barrier('Circuit identification', 96, 'Tower number plate + GIS check on the app'), barrier('Competent, authorised crew', crewOk, 'HV-AUTH / live-line certs valid')].map((b) => `<div class="wfs-bt t-bar">${b}</div>`).join('')}</div>
            <div class="wfs-top">Contact with energised conductor<small>EN 50110-1 · ISO 45001 §8.1.2</small></div>
            <div class="wfs-bt-col">${[barrier('Arc-rated PPE (≥ 12 cal/cm²)', 98, 'Checked at toolbox talk'), barrier('Tower rescue plan & kit on site', 94, 'Pole-top rescue drill ≤ 6 months'), barrier('Fall arrest twin lanyard', 99, 'Inspected each shift'), barrier('Emergency response < 30 min', 88, 'Nearest trauma centre routing in app')].map((b) => `<div class="wfs-bt t-bar">${b}</div>`).join('')}</div>
            <div class="wfs-bt-col">${['Electric shock / electrocution', 'Arc-flash burns', 'Fall from height after shock', 'Network outage & customer interruption'].map((t) => `<div class="wfs-bt t-cons">${esc(t)}<small>Consequence</small></div>`).join('')}</div></div>` })}
          <div class="nx-row nx-c12">
            ${ui.card({ cls: 'nx-s7', title: 'Preventive barrier effectiveness · last 6 months', sub: 'Share of permits where the barrier was verified before work started', body: ui.chart('bar6', 'md') })}
            ${ui.card({ cls: 'nx-s5', title: 'Near misses traced to a weakened barrier', sub: 'From the HSE register — the barrier each event slipped past', body: `<div class="nx-list">${hse.filter((r) => r.type === 'Near miss').slice(-6).reverse().map((r) => { const b = /earth|induced/i.test(r.text) ? 'Earths both sides of work site' : /circuit tag|wrong/i.test(r.text) ? 'Circuit identification' : /crane|slew|approach/i.test(r.text) ? 'Minimum approach distance' : /gust|wind/i.test(r.text) ? 'Weather window' : 'Exclusion zone'; return ui.li({ ic: 'event', color: '#d97706', title: b, sub: `${esc(r.id)} · ${esc(r.tower)} · ${esc(r.text)}`, row: r.id }); }).join('')}</div>` })}
          </div></div>`;
      },
      mount: (st, ctx) => {
        const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
        const r3 = rng(31);
        const mk = (base) => months.map((_, i) => Math.min(100, Math.round(base + i * 1.2 + (r3() - 0.5) * 6)));
        ctx.chart('bar6', ch.line({ x: months, yMin: 70, yMax: 100, series: [{ name: 'Lock-out', data: mk(92) }, { name: 'Earths both sides', data: mk(80) }, { name: 'Circuit ID', data: mk(90) }, { name: 'Competent crew', data: mk(86) }], yName: '%' }));
        ctx.on('click', '[data-row]', (e, r) => hseDrawer(r.dataset.row));
      },
    },
  ],
};

/* ================================================================== 4. Permit Tracking */
const permitScreen = {
  id: 'permits', name: 'Permit Tracking', icon: 'key',
  tabs: [
    {
      name: 'Permit register', icon: 'key',
      render: () => {
        const by = (s) => net.permits.filter((p) => permitState.get(p.id) === s).length;
        const expSoon = net.permits.filter((p) => ['issued', 'active'].includes(permitState.get(p.id)) && daysBetween(ASOF, p.expires) <= 1);
        return `<div class="nx-page">
          ${ui.kpis([
            { label: 'Active on site', value: by('active'), icon: 'hardhat', tone: 'ok', sub: 'accepted by crew lead' },
            { label: 'Issued, not started', value: by('issued'), icon: 'key', tone: 'violet' },
            { label: 'Awaiting isolation', value: by('pending isolation'), icon: 'lock', tone: 'warn', sub: 'switching programme in control' },
            { label: 'In approval', value: by('submitted') + by('approved'), icon: 'flow', tone: 'info' },
            { label: 'Draft', value: by('draft'), icon: 'doc' },
            { label: 'Expire within 24 h', value: expSoon.length, icon: 'clock', tone: expSoon.length ? 'crit' : 'ok', sub: 'extend or clear & cancel' },
          ])}
          ${ui.card({ title: 'Permit-to-work register', sub: 'Prerequisites, safety clearances and approvals for every live permit', tools: `${ui.search('#wfs-ptw', 'Search permit, WO, tower…')}`, flush: true, body: ui.table({ id: 'wfs-ptw', cols: [
            { key: 'id', label: 'Permit', render: (p) => `<b>${esc(p.id)}</b><span class="nx-sub">${esc(p.type)}</span>` },
            { key: 'wo', label: 'Work order', render: (p) => `${esc(p.wo)}<span class="nx-sub">${esc(fmt.title(p.woRef.work_type))}</span>` },
            { key: 'asset', label: 'Asset', render: (p) => `${esc(p.asset)}<span class="nx-sub">${esc(p.line || 'Substation')}</span>` },
            { key: 'crewName', label: 'Crew', render: (p) => `${esc(p.crew)}<span class="nx-sub">${esc(p.crewName)}</span>` },
            { key: 'prog', label: 'Prerequisites', sort: (p) => permitProgress(p), render: (p) => ui.meter(permitProgress(p), 100, permitProgress(p) === 100 ? '#16a34a' : '#f59e0b', `${p.checks.filter(([, ok]) => ok).length}/${p.checks.length}`) },
            { key: 'state', label: 'State', sort: (p) => PERMIT_FLOW.indexOf(permitState.get(p.id)), render: (p) => ui.badge(permitState.get(p.id), permitTone[permitState.get(p.id)]) },
            { key: 'expires', label: 'Expires', render: (p) => `${fmt.date(p.expires)}<span class="nx-sub">${esc(p.authorisedBy)}</span>` },
          ], rows: net.permits, rowId: (p) => p.id }) })}</div>`;
      },
      mount: (st, ctx) => ctx.on('click', 'tr[data-row]', (e, r) => permitDrawer(r.dataset.row)),
    },
    {
      name: 'Approval workflow', icon: 'flow',
      render: () => `<div class="nx-page">${ui.callout('Permits move left to right. A permit can only be <b>issued</b> when every prerequisite is verified and the crew passes the competence engine.', 'info', 'flow')}<div class="nx-row nx-c12">${ui.card({ cls: 'nx-s5', title: 'Approval cycle time by stage', sub: 'Median hours a permit waits in each stage · bars over SLA turn red', body: ui.chart('apcyc', 'sm') })}${ui.card({ cls: 'nx-s3', title: 'Permits by type', sub: 'Open register', body: ui.chart('aptype', 'sm') })}${ui.card({ cls: 'nx-s4', title: 'Blocking prerequisites', sub: 'Why permits cannot advance today', body: ui.chart('apblock', 'sm') })}</div>${ui.kanban(PERMIT_FLOW.slice(0, 6).map((s, i) => ({ title: fmt.title(s), color: ['#94a3b8', '#0ea5e9', '#2563eb', '#f59e0b', '#8b5cf6', '#16a34a'][i], items: net.permits.filter((p) => permitState.get(p.id) === s).map((p) => ({ id: p.id, title: p.id, badge: ui.badge(`${permitProgress(p)}%`, permitProgress(p) === 100 ? 'ok' : 'warn', { dot: false }), text: `${esc(fmt.title(p.woRef.work_type))} · ${esc(p.asset)}`, meta: `${icon('users', 12)} ${esc(p.crew)} · ${icon('clock', 12)} ${fmt.short(p.expires)}${matchCrew(p.woRef, crewById.get(p.crew)).blocked ? ` · ${ui.badge('competence gap', 'crit', { dot: false })}` : ''}` })) })))}</div>`,
      mount: (st, ctx) => {
        const stages = ['draft', 'submitted', 'approved', 'pending isolation', 'issued'];
        const sla = { draft: 24, submitted: 8, approved: 6, 'pending isolation': 4, issued: 2 };
        const r4 = rng(808); const med = stages.map((s2) => +(sla[s2] * (0.55 + r4() * 0.8)).toFixed(1));
        ctx.chart('apcyc', ch.bar({ x: stages.map(fmt.title), horizontal: true, legend: false, labels: true, series: [{ name: 'Median hours', data: med.map((v, i) => ({ value: v, itemStyle: { color: v > sla[stages[i]] ? '#dc2626' : '#2563eb', borderRadius: [0, 4, 4, 0] } })), labelFmt: (x) => `${x.value} h` }], grid: { top: 6, right: 40 }, tooltip: { formatter: (ps) => `<b>${ps[0].name}</b><br/>Median ${ps[0].value} h · SLA ${sla[stages[ps[0].dataIndex]]} h` } }));
        const types = {}; net.permits.forEach((p) => { types[p.code] = (types[p.code] || 0) + 1; });
        ctx.chart('aptype', ch.donut({ data: Object.entries(types).map(([name, value]) => ({ name, value })), center: 'permits', legend: false }));
        const blocks = {}; net.permits.filter((p) => !['active', 'cleared'].includes(permitState.get(p.id))).forEach((p) => p.checks.filter(([, ok]) => !ok).forEach(([l]) => { blocks[l] = (blocks[l] || 0) + 1; }));
        const be = Object.entries(blocks).sort((a, b) => b[1] - a[1]);
        ctx.chart('apblock', ch.bar({ x: be.map((e) => e[0].replace(/ \(.*\)/, '')), horizontal: true, legend: false, labels: true, series: [{ name: 'Permits blocked', color: '#f59e0b', data: be.map((e) => e[1]) }], grid: { top: 6, right: 30 } }));
        ctx.on('click', '.nx-tile[data-row]', (e, t) => permitDrawer(t.dataset.row));
      },
    },
    {
      name: 'Validity timeline', icon: 'calendar',
      render: () => ui.card({ title: 'Permit validity windows', sub: 'Issue → expiry for every permit; colour by state. Expired-but-not-cleared permits are a stop-work trigger.', body: ui.gantt({ rows: net.permits.slice(0, 32).map((p) => ({ label: p.id, sub: `${p.asset} · ${p.crew}`, bars: [{ start: p.issued, end: addDays(p.expires, 1), color: { draft: '#94a3b8', submitted: '#0ea5e9', approved: '#2563eb', 'pending isolation': '#f59e0b', issued: '#8b5cf6', active: '#16a34a', cleared: '#64748b' }[permitState.get(p.id)], text: permitState.get(p.id), id: p.id, tip: `${p.id} · ${p.type} · ${fmt.date(p.issued)} → ${fmt.date(p.expires)}` }] })), range: [addDays(ASOF, -7), addDays(ASOF, 7)], now: ASOF, ticks: 'day', labelW: 210 }) }),
      mount: (st, ctx) => ctx.on('click', '.nx-gantt-bar[data-row]', (e, b) => permitDrawer(b.dataset.row)),
    },
  ],
};

/* ================================================================== 5. Field Mobile App */
const EVIDENCE = { before: '/assets/custom/power-line-inspection.jpg', after: '/assets/custom/hero-drone-inspection.jpg', thermal: '/assets/custom/thermal-power-plant.jpg', after2: '/assets/custom/hero-power-utilities.jpg' };
const feed = [];
const pushFeed = (t, d, s = 'Online') => { feed.unshift({ at: new Date().toTimeString().slice(0, 8), t, d, s }); if (feed.length > 60) feed.pop(); };
const phone = { crew: net.crews.map((c) => [c.id, openWos.filter((w) => w.crew === c.id).length]).sort((a, b) => b[1] - a[1])[0][0], step: 'list', wo: null, checks: {}, shots: {}, signed: false };
const CHECKS = ['Permit received, read and signed', 'Earths visible at both sides of the work site', 'Limits of approach briefed (EN 50110 Annex A)', 'Arc-rated PPE, class 2 gloves, helmet with visor', 'Fall-arrest harness and twin lanyard inspected', 'Wind < 10 m/s and no lightning within 10 km'];

function phoneScreen() {
  const jobs = openWos.filter((w) => assigned.get(w.id) === phone.crew);
  const crew = crewById.get(phone.crew);
  const wo = phone.wo ? woById.get(phone.wo) : null;
  const permit = wo ? net.permits.find((p) => p.wo === wo.id) : null;
  const status = `<div class="nx-phone-status"><span>${new Date().toTimeString().slice(0, 5)}</span><span>5G · 82%</span></div>`;
  let head = ''; let body = ''; let foot = '';
  if (!wo || phone.step === 'list') {
    head = `<small>NEXUS FIELD · ${esc(crew.id)}</small><b>Today's jobs</b><span>${esc(crew.name)} · ${jobs.length} assigned</span>`;
    body = jobs.length ? jobs.map((w) => `<div class="wfs-job" data-ph="open:${esc(w.id)}"><div style="display:flex;gap:6px;align-items:center"><b>${esc(w.id)}</b><span style="margin-left:auto">${ui.badge(w.severity, SEV_TONE[w.severity], { dot: false })}</span></div><span>${esc(fmt.title(w.work_type))}</span><span>${icon('pin', 11)} ${esc(w.towerName || w.asset)} · ${esc(w.line || 'Substation')}</span></div>`).join('') : '<div class="nx-empty">No jobs assigned to this crew.</div>';
  } else if (phone.step === 'detail') {
    head = `<small>${esc(wo.id)} · SAP ${esc(wo.sap)}</small><b>${esc(fmt.title(wo.work_type))}</b><span>${esc(wo.towerName || wo.asset)} · ${esc(wo.line || '')}</span>`;
    body = `${ui.kv([['Permit', permit ? `${esc(permit.id)}` : 'Not required'], ['State', permit ? esc(permitState.get(permit.id)) : '—'], ['Method', wo.outage ? 'De-energised' : 'Live-line'], ['Labour', `${wo.labourH} h`], ['GPS', gps(wo.lat, wo.lng, 4)]])}<div style="font-weight:700;margin-top:4px">Findings</div>${wo.findings.slice(0, 3).map((f) => `<div class="wfs-job"><b>${esc(f.label)}</b><span>${esc(f.finding_id)} · ${esc(f.sensor.toUpperCase())} · model confidence ${Math.round(f.confidence * 100)}%</span></div>`).join('') || '<span class="nx-note">No linked findings</span>'}${permit && !['active', 'issued'].includes(permitState.get(permit.id)) ? ui.callout(`Permit is <b>${esc(permitState.get(permit.id))}</b>. Work cannot start until it is issued.`, 'warn', 'lock') : ''}`;
    foot = `<button class="is-sec" data-ph="back">Back</button><button data-ph="step:check" ${permit && !['active', 'issued'].includes(permitState.get(permit.id)) ? 'disabled' : ''}>Start LMRA</button>`;
  } else if (phone.step === 'check') {
    const n = CHECKS.filter((c) => phone.checks[c]).length;
    head = `<small>${esc(wo.id)} · Last-minute risk assessment</small><b>Pre-start checks</b><span>${n} of ${CHECKS.length} confirmed</span>`;
    body = CHECKS.map((c) => `<div class="wfs-chk${phone.checks[c] ? ' is-on' : ''}" data-ph="chk:${esc(c)}"><i>${phone.checks[c] ? '✓' : ''}</i><span>${esc(c)}</span></div>`).join('');
    foot = `<button class="is-sec" data-ph="step:detail">Back</button><button data-ph="step:photo" ${n < CHECKS.length ? 'disabled' : ''}>Continue</button>`;
  } else if (phone.step === 'photo') {
    head = `<small>${esc(wo.id)} · Evidence</small><b>Before / after photos</b><span>Geotagged, hashed at capture</span>`;
    body = ['before', 'after'].map((k) => { const s = phone.shots[k]; return `<div class="wfs-shot" data-ph="shot:${k}">${s ? `<img src="${s.src}" alt=""/><b>${k.toUpperCase()}</b><em>${s.geo} · ${s.time}<br/>SHA-256 ${s.hash.slice(0, 12)}…</em>` : `<span>${icon('camera', 22)}<br/>Tap to capture ${k}</span>`}</div>`; }).join('');
    foot = `<button class="is-sec" data-ph="step:check">Back</button><button data-ph="step:sign" ${phone.shots.before && phone.shots.after ? '' : 'disabled'}>Continue</button>`;
  } else if (phone.step === 'sign') {
    head = `<small>${esc(wo.id)} · Sign-off</small><b>Close out task</b><span>${esc(crew.lead)} · crew lead</span>`;
    body = `${ui.kv([['LMRA', `${CHECKS.length}/${CHECKS.length} ✓`], ['Photos', '2 attached'], ['Earths removed', wo.outage ? 'Confirm below' : 'n/a'], ['Permit', permit ? esc(permit.id) : '—']])}<div class="wfs-sig">${phone.signed ? esc(crew.lead) : '<span style="font:12px var(--nx-font);color:var(--nx-muted)">Tap to sign</span>'}</div>`;
    foot = `<button class="is-sec" data-ph="step:photo">Back</button><button data-ph="${phone.signed ? 'done' : 'sign'}">${phone.signed ? 'Submit & sync' : 'Sign'}</button>`;
  } else if (phone.step === 'done') {
    head = `<small>${esc(wo.id)}</small><b>Task verified</b><span>Confirmation sent to SAP PM ${esc(wo.sap)}</span>`;
    body = `<div style="text-align:center;padding:24px 8px"><div style="width:64px;height:64px;border-radius:50%;background:#e8f7ee;color:#16a34a;display:grid;place-items:center;margin:0 auto 12px">${icon('check', 32)}</div><b style="font-size:14px">Repair task verified</b><p class="nx-note">Work authorisation ${permit ? esc(permit.id) : ''} approved, qualified HV crew ${esc(crew.id)} assigned, permits cleared. Evidence chained to the audit log.</p></div>`;
    foot = '<button data-ph="back">Back to jobs</button>';
  }
  return `${status}<div class="wfs-app-h">${head}</div><div class="wfs-app-b">${body}</div>${foot ? `<div class="wfs-app-f">${foot}</div>` : ''}`;
}

const mobileScreen = {
  id: 'mobile', name: 'Field Mobile App', icon: 'phone',
  tabs: [
    {
      name: 'Crew app', icon: 'phone',
      render: () => `<div class="nx-page"><div class="wfs-phone-wrap">
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center"><label class="nx-field" style="width:300px">Signed in as crew<select class="nx-select" id="wfs-phcrew">${net.crews.map((c) => `<option value="${esc(c.id)}" ${c.id === phone.crew ? 'selected' : ''}>${esc(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label>
          <div class="nx-phone"><div class="nx-phone-notch"></div><div class="nx-phone-scr" id="wfs-phone">${phoneScreen()}</div></div></div>
        <div class="nx-page">
          ${ui.card({ title: 'Live sync & audit trail', sub: 'Every tap on the device is written here and to the hash-chained audit log (offline-first, replicated on reconnect).', tools: `<span class="nx-pill is-live"><span class="nx-dot is-pulse"></span>Online · queue <b id="wfs-q">0</b></span>`, body: '<div class="wfs-feed" id="wfs-feed"></div>' })}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Crew position & today\'s job sites', sub: 'Vehicle GPS and the work sites on the crew\'s device', flush: true, body: '<div class="nx-map" id="wfs-phmap" style="height:300px;border-radius:0 0 12px 12px"></div>' })}${ui.card({ cls: 'nx-s5', title: 'Device activity · last 12 h', sub: 'Records synced from the field app per hour, by type', body: ui.chart('phact', 'md') })}</div>
          <div class="nx-row nx-c2">${ui.card({ title: 'Device', body: ui.kv([['Model', 'Rugged Android 14 · IP68 · ATEX zone 2'], ['App', 'NEXUS Field 4.12.0'], ['MDM', 'Compliant · encrypted'], ['Integrations', 'SAP PM · IBM Maximo · Esri']]) })}${ui.card({ title: 'Offline capability', body: ui.kv([['Cached jobs', '14 days'], ['Map tiles', 'Corridor North, Coastal, Inland'], ['Photo hashing', 'SHA-256 at capture'], ['Sync conflicts', '0 open']]) })}</div>
        </div></div></div>`,
      mount: (st, ctx) => {
        const scr = st.querySelector('#wfs-phone');
        const paintFeed = () => { const el = st.querySelector('#wfs-feed'); if (el) el.innerHTML = feed.map((f) => `<div><time>${f.at}</time><span><b>${esc(f.t)}</b><small>${esc(f.d)}</small></span></div>`).join('') || '<span class="nx-note">Waiting for device activity…</span>'; };
        const repaint = () => { scr.innerHTML = phoneScreen(); paintFeed(); };
        if (!feed.length) { pushFeed('Device signed in', `${phone.crew} · MFA OK · cert-pinned TLS`); pushFeed('Jobs downloaded', `${openWos.filter((w) => assigned.get(w.id) === phone.crew).length} work orders · 3 permits`); }
        paintFeed();
        ctx.on('change', '#wfs-phcrew', (e, s) => { phone.crew = s.value; phone.step = 'list'; phone.wo = null; pushFeed('Crew switched', s.value); repaint(); });
        ctx.on('click', '[data-ph]', (e, b) => {
          const [a, v] = b.dataset.ph.split(/:(.*)/s);
          const wo = phone.wo ? woById.get(phone.wo) : null;
          if (a === 'open') { phone.wo = v; phone.step = 'detail'; phone.checks = {}; phone.shots = {}; phone.signed = false; pushFeed('Job opened', `${v} · location verified ${woById.get(v).lat ? 'within 40 m of asset' : ''}`); }
          if (a === 'back') { phone.step = 'list'; phone.wo = null; }
          if (a === 'step') phone.step = v;
          if (a === 'chk') { phone.checks[v] = !phone.checks[v]; pushFeed(phone.checks[v] ? 'LMRA item confirmed' : 'LMRA item cleared', v); }
          if (a === 'shot') {
            const src = k => (k === 'before' ? (wo.work_type === 'transformer repair' || wo.findings.some((f) => f.sensor === 'thermal') ? EVIDENCE.thermal : EVIDENCE.before) : EVIDENCE.after);
            const time = new Date().toTimeString().slice(0, 8); const geoTxt = gps(wo.lat, wo.lng);
            const h = hex(`${wo.id}|${v}|${time}|${geoTxt}`);
            phone.shots[v] = { src: src(v), time, geo: geoTxt, hash: h };
            const rec = log({ actor: `${crewById.get(phone.crew).lead}`, action: `Photo evidence (${v})`, object: `EV-${wo.id.slice(3)}-${v === 'before' ? 'B' : 'A'}`, detail: `${wo.towerName || wo.asset} · ${geoTxt} · SHA-256 ${h.slice(0, 16)}`, source: 'NEXUS Field' });
            pushFeed(`Photo ${v} captured`, `SHA-256 ${h.slice(0, 20)}… · chained ${rec.hash.slice(0, 10)}`);
          }
          if (a === 'sign') { phone.signed = true; pushFeed('Signed by crew lead', crewById.get(phone.crew).lead); }
          if (a === 'done') {
            phone.step = 'done';
            const rq = erpRequest('workOrders', `Completion confirmation · ${wo.id} (SAP ${wo.sap})`, { order: wo.sap, workOrder: wo.id, status: 'CNF' });
            log({ actor: crewById.get(phone.crew).lead, action: 'Task verified & signed off', object: wo.id, detail: `LMRA ${CHECKS.length}/${CHECKS.length}; photos 2; confirmation ${rq.ref} sent to SAP PM ${wo.sap}`, source: 'NEXUS Field' });
            pushFeed('Confirmation sent to SAP PM', `${wo.sap} · status CNF requested · ${rq.ref}`); pushFeed('Synced to IBM Maximo', `${wo.maximo} · COMP`);
          }
          repaint();
        });
        const crewJobs = () => openWos.filter((w) => assigned.get(w.id) === phone.crew && w.lat);
        const c0 = crewById.get(phone.crew);
        ctx.map('#wfs-phmap', { panel: false, padding: [30, 30], layers: [...networkLayers(net, {}), { id: 'jobs', name: 'Job sites', color: '#dc2626', shape: 'dia', points: crewJobs().map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, size: 14, shape: 'dia', color: SEV[w.severity] || '#d97706', label: w.id, tip: `${w.id} · ${w.work_type} · ${w.towerName || ''}`, info: () => ({ kicker: w.severity, title: w.id, sub: `${esc(fmt.title(w.work_type))} · ${esc(w.towerName || w.asset)}`, fields: [['Planned', fmt.date(w.planned_date)], ['Labour', `${w.labourH} h`]], actions: [{ label: 'Work order', primary: true, onClick: () => woDrawer(w.id) }] }) })) }, { id: 'crew', name: 'Crew', color: '#2563eb', points: [{ id: c0.id, lat: c0.lat, lng: c0.lng, size: 24, icon: 'truck', color: '#2563eb', pulse: true, label: c0.id, z: 900, tip: `${c0.name} · ${c0.status}` }] }] });
        const hours = Array.from({ length: 12 }, (_, i) => `${String((new Date().getHours() - 11 + i + 24) % 24).padStart(2, '0')}:00`);
        const r5 = seeded(phone.crew);
        ctx.chart('phact', ch.bar({ x: hours, stack: true, series: [{ name: 'Checklist items', color: '#16a34a', data: hours.map((_, i) => (i > 3 && i < 11 ? Math.round(r5() * 9 + 2) : Math.round(r5() * 2))) }, { name: 'Photos', color: '#8b5cf6', data: hours.map((_, i) => (i > 4 && i < 11 ? Math.round(r5() * 6) : 0)) }, { name: 'GPS pings', color: '#94a3b8', data: hours.map(() => Math.round(8 + r5() * 4)) }], grid: { top: 30 } }));
        ctx.every(6000, () => { const c = crewById.get(phone.crew); pushFeed('Location ping', `${gps(c.lat + (Math.random() - 0.5) * 0.0004, c.lng + (Math.random() - 0.5) * 0.0004)} · ±4 m · 5G`); paintFeed(); });
      },
    },
    {
      name: 'Evidence gallery', icon: 'camera',
      render: () => {
        const done = net.workOrders.filter((w) => w.stage === 'completed').slice(0, 18);
        return `<div class="nx-page">${ui.callout('Before/after photographs captured on the field app. Each image is geotagged and hashed at capture, and the hash is chained into the audit trail so later edits are detectable.', 'info', 'camera')}<div class="wfs-gallery">${done.map((w, i) => { const before = w.work_type === 'transformer repair' || w.findings.some((f) => f.sensor === 'thermal') ? EVIDENCE.thermal : EVIDENCE.before; const afterImg = [EVIDENCE.after, EVIDENCE.after2, '/assets/custom/hero-power-asset-reliability.jpg'][i % 3]; const geoTxt = w.lat ? gps(w.lat, w.lng, 4) : 'Substation'; const h = hex(`${w.id}|ev`); return `<article class="wfs-ev"><div class="wfs-ev-imgs"><figure><img src="${before}" alt="Before repair at ${esc(w.towerName || w.asset)}" loading="lazy"/><figcaption>BEFORE</figcaption><span class="wfs-geo">${geoTxt}</span></figure><figure><img src="${afterImg}" alt="After repair" loading="lazy"/><figcaption>AFTER</figcaption><span class="wfs-geo">${fmt.short(w.completed_at)}</span></figure></div><div class="wfs-ev-b"><div style="display:flex;gap:6px;align-items:center"><b>${esc(w.id)} · ${esc(fmt.title(w.work_type))}</b><span style="margin-left:auto">${ui.badge('verified', 'ok')}</span></div><span class="nx-note">${esc(w.towerName || w.asset)} · ${esc(w.line || 'Substation')} · ${esc(w.crewName)}</span><span class="wfs-hash">SHA-256 ${h.slice(0, 32)}…</span></div></article>`; }).join('')}</div></div>`;
      },
    },
  ],
};

/* ================================================================== 6. Compliance Records */
const complianceScreen = {
  id: 'compliance', name: 'Compliance Records', icon: 'doc',
  tabs: [
    {
      name: 'Audit trail', icon: 'history',
      render: () => `<div class="nx-page">
        ${ui.kpis([{ label: 'Audit entries', value: fmt.n(audit.length), icon: 'doc', sub: 'append-only, hash-chained' }, { label: 'Chain integrity', value: 'Verified', icon: 'lock', tone: 'ok', id: 'wfs-chain', sub: `head ${audit[0].hash.slice(0, 12)}…` }, { label: 'Evidence items', value: audit.filter((a) => /Evidence|Photo/.test(a.action)).length, icon: 'camera', tone: 'info' }, { label: 'Sources', value: new Set(audit.map((a) => a.source)).size, icon: 'link', tone: 'violet', sub: 'SAP PM · SCADA · LMS · Field · Permits' }])}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s4', title: 'Entries by source system', sub: 'Where each record was written', body: ui.chart('ausrc', 'sm') })}${ui.card({ cls: 'nx-s5', title: 'Daily audit volume · last 21 days', sub: 'Entries per day, stacked by action family', body: ui.chart('auday', 'sm') })}${ui.card({ cls: 'nx-s3', title: 'Most active actors', sub: 'Entries written', body: ui.chart('auact', 'sm') })}</div>
        ${ui.card({ title: 'Immutable audit trail', sub: 'Every entry stores the hash of the one before it; changing any row breaks the chain from that point on.', tools: `${ui.search('#wfs-aud', 'Search actor, action, object…')}${ui.btn('Verify chain', { sm: true, ic: 'shield', attrs: 'data-verify' })}`, flush: true, body: ui.table({ id: 'wfs-aud', max: 300, cols: [{ key: 'seq', label: '#', align: 'r' }, { key: 'at', label: 'Timestamp (UTC+4)', render: (a) => `<span class="nx-mono" style="font-size:11.5px">${esc(a.at.replace('T', ' '))}</span>` }, { key: 'actor', label: 'Actor', render: (a) => esc(a.actor) }, { key: 'action', label: 'Action', render: (a) => `<b>${esc(a.action)}</b>` }, { key: 'object', label: 'Object', render: (a) => `<span class="nx-mono">${esc(a.object)}</span>` }, { key: 'detail', label: 'Detail', wrap: true, render: (a) => `<span class="nx-note" style="color:var(--nx-ink-2)">${esc(a.detail)}</span>` }, { key: 'source', label: 'Source', render: (a) => (a.source === 'SAP PM' ? ui.erp('SAP PM', 'workOrders') : ui.badge(a.source, 'muted', { dot: false })) }, { key: 'hash', label: 'Hash', render: (a) => `<span class="wfs-hash" data-tip="prev ${esc(a.prev.slice(0, 16))}…">${esc(a.hash.slice(0, 12))}…</span>` }], rows: audit, cls: 'wfs-scroll' }) })}</div>`,
      mount: (st, ctx) => {
        const src = {}; audit.forEach((a) => { src[a.source] = (src[a.source] || 0) + 1; });
        ctx.chart('ausrc', ch.donut({ data: Object.entries(src).map(([name, value]) => ({ name, value })), center: 'entries', legend: 'right' }));
        const days = Array.from({ length: 21 }, (_, i) => addDays(ASOF, i - 20));
        const fam = [['Permits', /Permit/, '#2563eb'], ['Switching & isolation', /Isolation|Switching/, '#8b5cf6'], ['Evidence & closure', /Evidence|Photo|closed|verified/i, '#16a34a'], ['Training & certs', /Certificate|Renewal|Training/, '#f59e0b']];
        ctx.chart('auday', ch.bar({ x: days.map((d) => fmt.short(d)), stack: true, series: fam.map(([n, re, color]) => ({ name: n, color, data: days.map((d) => audit.filter((a) => a.at.startsWith(d) && re.test(a.action)).length) })), grid: { top: 30 } }));
        const act = {}; audit.forEach((a) => { act[a.actor] = (act[a.actor] || 0) + 1; });
        const ae = Object.entries(act).sort((a, b) => b[1] - a[1]).slice(0, 6).reverse();
        ctx.chart('auact', ch.bar({ x: ae.map((e) => e[0].replace(/^(Control|Senior AP|Planner|HSE advisor): ?/, '').slice(0, 16)), horizontal: false, legend: false, series: [{ name: 'Entries', color: '#0ea5e9', data: ae.map((e) => e[1]) }], grid: { top: 10 }, tooltip: { formatter: (ps) => `<b>${esc(ae[ps[0].dataIndex][0])}</b><br/>${ps[0].value} entries` } }));
        ctx.on('click', '[data-verify]', () => {
          let ok = true;
          for (let i = audit.length - 1; i >= 0; i -= 1) { const a = audit[i]; const prev = audit[i + 1]?.hash || '0'.repeat(64); if (a.prev !== prev || a.hash !== hex(`${prev}|${a.at}|${a.actor}|${a.action}|${a.object}|${a.detail}`)) { ok = false; break; } }
          toast(ok ? `Chain verified: ${audit.length} entries, head ${audit[0].hash.slice(0, 12)}…` : 'Chain broken — investigate tampering', ok ? 'ok' : 'crit');
        });
      },
    },
    {
      name: 'Training & certification', icon: 'award',
      render: () => `<div class="nx-page"><div class="nx-row nx-c12">
        ${ui.card({ cls: 'nx-s7', title: 'Certificate status by authorisation', sub: 'Valid · due within 60 days · expired', body: ui.chart('cert', 'lg') })}
        ${ui.card({ cls: 'nx-s5', title: 'Renewals due · next 12 months', sub: 'Book courses before the month runs out', body: ui.chart('ren', 'lg') })}</div>
        ${ui.card({ title: 'Compliance by crew', flush: true, body: ui.table({ cols: [{ key: 'id', label: 'Crew', render: (c) => `<b>${esc(c.id)}</b><span class="nx-sub">${esc(c.name)}</span>` }, { key: 'pct', label: 'Compliance', sort: (c) => crewPct(c.id), render: (c) => ui.meter(crewPct(c.id), 100, crewPct(c.id) >= 95 ? '#16a34a' : crewPct(c.id) >= 85 ? '#d97706' : '#dc2626', `${fmt.n(crewPct(c.id), 0)}%`) }, { key: 'exp', label: 'Expired', align: 'r', sort: (c) => crewCnt(c.id, 'expired'), render: (c) => crewCnt(c.id, 'expired') }, { key: 'due', label: 'Due ≤ 60 d', align: 'r', sort: (c) => crewCnt(c.id, 'expiring'), render: (c) => crewCnt(c.id, 'expiring') }, { key: 'lead', label: 'Crew lead' }], rows: net.crews, rowId: (c) => c.id }) })}</div>`,
      mount: (st, ctx) => {
        const ids = net.certs.map((c) => c.id);
        const cnt = (id, s) => net.people.reduce((a, p) => a + p.certs.filter((c) => c.id === id && c.state === s).length, 0);
        ctx.chart('cert', ch.bar({ x: ids, stack: true, series: [{ name: 'Valid', data: ids.map((i) => cnt(i, 'valid')), color: '#16a34a' }, { name: 'Due ≤ 60 d', data: ids.map((i) => cnt(i, 'expiring')), color: '#f59e0b' }, { name: 'Expired', data: ids.map((i) => cnt(i, 'expired')), color: '#dc2626' }] }));
        const months = Array.from({ length: 12 }, (_, i) => addDays(`${ASOF.slice(0, 7)}-01`, i * 30.5).slice(0, 7));
        const all = net.people.flatMap((p) => p.certs);
        ctx.chart('ren', ch.bar({ x: months.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })), series: [{ name: 'Renewals', data: months.map((m, i) => all.filter((c) => (i === 0 ? c.expires.slice(0, 7) <= m : c.expires.startsWith(m))).length), color: '#8b5cf6' }], labels: true }));
        ctx.on('click', 'tr[data-row]', (e, r) => crewDrawer(r.dataset.row));
      },
    },
    {
      name: 'ISO 45001 & EN 50110', icon: 'shield',
      render: () => {
        const act = net.permits.filter((p) => ['active', 'issued'].includes(permitState.get(p.id)));
        const rule = (label) => { const xs = act.map((p) => p.checks.find(([l]) => l.startsWith(label))?.[1]).filter((x) => x !== undefined); return xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 100) : 100; };
        const five = [['1. Disconnect completely', rule('Switching')], ['2. Secure against re-connection', rule('Isolation')], ['3. Verify absence of operating voltage', rule('Portable earths')], ['4. Carry out earthing and short-circuiting', rule('Portable earths')], ['5. Protect against adjacent live parts', 97]];
        const iso = [['§5.4', 'Consultation & participation of workers', 'Toolbox talks recorded on every active permit', 'ok', `${hse.filter((r) => r.type === 'Safety observation').length} observations`], ['§6.1.2', 'Hazard identification & risk assessment', 'LMRA in field app; bow-tie for HV contact', 'ok', `${hse.filter((r) => r.type === 'Hazard').length} hazards logged`], ['§7.2', 'Competence', 'Qualification matrix; auto-block of expired authorisations', compliancePct() >= 95 ? 'ok' : 'warn', `${fmt.n(compliancePct(), 1)}% valid`], ['§8.1.2', 'Eliminating hazards & reducing risk', 'Permit-to-work + isolation/LOTO with interlocks', 'ok', `${act.length} permits under control`], ['§8.1.4', 'Procurement / contractors', 'Visiting contractor inducted before toolbox talk', 'warn', '1 finding open'], ['§8.2', 'Emergency preparedness', 'Tower rescue kit and drill ≤ 6 months', 'ok', 'Last drill 14 Oct 2026'], ['§9.1', 'Monitoring & measurement', 'TRIR, LTIFR, leading indicators live', 'ok', `TRIR ${fmt.n(trir(), 2)}`], ['§10.2', 'Incident, nonconformity & corrective action', 'ICAM investigation within 14 days', hse.some((r) => r.status === 'investigating' && daysBetween(r.date, ASOF) > 14) ? 'warn' : 'ok', `${hse.filter((r) => r.status !== 'closed').length} actions open`]];
        return `<div class="nx-page"><div class="nx-row nx-c12">
          ${ui.card({ cls: 'nx-s5', title: 'EN 50110-1 five safety rules', sub: `Measured on ${act.length} issued/active permits`, body: `<div class="nx-list">${five.map(([l, p]) => `<div class="nx-li"><span class="nx-li-ico" style="background:${p >= 95 ? '#e8f7ee' : '#fff4e5'};color:${p >= 95 ? '#16a34a' : '#d97706'}">${icon(p >= 95 ? 'checkCircle' : 'alert')}</span><div class="nx-li-main"><b>${esc(l)}</b>${ui.meter(p, 100, p >= 95 ? '#16a34a' : '#d97706', `${p}%`)}</div></div>`).join('')}</div>` })}
          ${ui.card({ cls: 'nx-s7', title: 'ISO 45001:2018 clause evidence', sub: 'Live evidence linked to each clause for the next surveillance audit', flush: true, body: ui.table({ cols: [{ key: 0, label: 'Clause', render: (r) => `<b>${esc(r[0])}</b>` }, { key: 1, label: 'Requirement', render: (r) => esc(r[1]) }, { key: 2, label: 'Evidence in NEXUS', wrap: true, render: (r) => `<span class="nx-note" style="color:var(--nx-ink-2)">${esc(r[2])}</span><span class="nx-sub">${esc(r[4])}</span>` }, { key: 3, label: 'Status', render: (r) => ui.badge(r[3] === 'ok' ? 'conforming' : 'observation', r[3]) }], rows: iso }) })}</div>
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Five-rule verification rate · last 6 months', sub: 'Share of permits where each EN 50110-1 rule was evidenced before work started', body: ui.chart('isofive', 'md') })}${ui.card({ cls: 'nx-s5', title: 'Audit readiness by clause', sub: 'Evidence items linked per ISO 45001 clause vs auditor sample size', body: ui.chart('isoev', 'md') })}</div></div>`;
      },
      mount: (st, ctx) => {
        const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']; const r6 = rng(4501);
        const tr = (end) => months.map((_, i) => Math.min(100, Math.round(end - (5 - i) * (1.2 + r6()) + (r6() - 0.5) * 3)));
        ctx.chart('isofive', ch.line({ x: months, yMin: 70, yMax: 100, yName: '%', series: [{ name: 'Disconnect', data: tr(100) }, { name: 'Secure', data: tr(99) }, { name: 'Verify dead', data: tr(84) }, { name: 'Earth', data: tr(82) }, { name: 'Adjacent parts', data: tr(97) }], markArea: { silent: true, data: [[{ yAxis: 95, itemStyle: { color: 'rgba(22,163,74,.06)' } }, { yAxis: 100 }]] } }));
        const cl = ['§5.4', '§6.1.2', '§7.2', '§8.1.2', '§8.1.4', '§8.2', '§9.1', '§10.2'];
        const ev = [hse.filter((r) => r.type === 'Safety observation').length, hse.filter((r) => r.type === 'Hazard').length, net.people.reduce((a, p) => a + p.certs.length, 0) / 4, net.permits.length, 6, 9, 14, hse.filter((r) => r.status !== 'closed').length].map(Math.round);
        ctx.chart('isoev', ch.bar({ x: cl, series: [{ name: 'Evidence items', color: '#2563eb', data: ev }, { name: 'Auditor sample', color: '#cbd5e1', data: cl.map(() => 10) }], grid: { top: 30 } }));
      },
    },
  ],
};
const crewCnt = (id, s) => peopleOf(id).reduce((a, p) => a + p.certs.filter((c) => c.state === s).length, 0);
const crewPct = (id) => { const all = peopleOf(id).reduce((a, p) => a + p.certs.length, 0); return all ? ((all - crewCnt(id, 'expired')) / all) * 100 : 100; };

/* ================================================================== 7. Isolation Diagram (LOTO single-line) */
const outagePermits = net.permits.filter((p) => p.woRef.outage && p.line);
let isoPermit = (outagePermits.find((p) => p.code === 'PTW-HV' && permitState.get(p.id) === 'active' && p.line === 'L-220-03') || outagePermits.find((p) => p.code === 'PTW-HV' && p.line === 'L-220-03') || outagePermits.find((p) => permitState.get(p.id) === 'active' && p.line === 'L-220-03') || outagePermits.find((p) => p.line === 'L-220-03') || outagePermits[0] || net.permits[0])?.id;
const iso = { sw: null, proved: false, issued: false, done: {}, ooo: {}, log: [] };

function isoContext() {
  const p = net.permits.find((x) => x.id === isoPermit);
  const wo = woById.get(p.wo);
  const line = net.lines.find((l) => l.id === (p.line || 'L-220-03')) || net.lines[0];
  const subName = (id) => net.substations.find((s) => s.id === id)?.name;
  const [e1, e2] = line.ends;
  return { p, wo, line, kv: line.kv, end1: subName(e1) || 'Substation S-1', end2: subName(e2) || `${line.corridor} remote terminal`, e1: e1 || 'SUB-S1', e2: e2 || 'REMOTE', tower: wo.towerName || 'T-000' };
}
const STEPS = [
  { id: 's1', title: 'Open S1-Q0 circuit-breaker', sub: 'Interrupt load current at the first end', test: (s) => s['S1-Q0'] === 'open' },
  { id: 's2', title: 'Open S2-Q0 circuit-breaker', sub: 'Interrupt at the remote end', test: (s) => s['S2-Q0'] === 'open' },
  { id: 's3', title: 'Open S1-Q9 line disconnector · lock & tag', sub: 'Visible isolation point; padlock + DANGER tag', test: (s) => s['S1-Q9'] === 'open' },
  { id: 's4', title: 'Open S2-Q9 line disconnector · lock & tag', sub: 'Isolate the remote end', test: (s) => s['S2-Q9'] === 'open' },
  { id: 's5', title: 'Verify absence of voltage at the work site', sub: 'Test the detector on a known live source first (prove–test–prove)', test: () => iso.proved, action: 'prove' },
  { id: 's6', title: 'Close S1-Q8 line earthing switch', sub: 'Earth and short-circuit at S-1', test: (s) => s['S1-Q8'] === 'closed' },
  { id: 's7', title: 'Close S2-Q8 line earthing switch', sub: 'Earth and short-circuit at S-2', test: (s) => s['S2-Q8'] === 'closed' },
  { id: 's8', title: 'Apply portable earths PE1 & PE2 at the tower', sub: 'Work-site earths on both sides of the work zone', test: (s) => s.PE1 === 'closed' && s.PE2 === 'closed' },
  { id: 's9', title: 'Issue permit-to-work to the crew lead', sub: 'Isolation certificate attached to the permit', test: () => iso.issued, action: 'issue' },
];
const lineAlive = (s) => (s['S1-Q1'] === 'closed' && s['S1-Q0'] === 'closed' && s['S1-Q9'] === 'closed') || (s['S2-Q1'] === 'closed' && s['S2-Q0'] === 'closed' && s['S2-Q9'] === 'closed');
const earthed = (s) => s['S1-Q8'] === 'closed' || s['S2-Q8'] === 'closed' || s.PE1 === 'closed' || s.PE2 === 'closed';

function isoSvg(c) {
  const W = 1280; const H = 720; const kv = c.kv; const Y0 = 130; const LY = 470;
  const bay = (x, pre, dir) => [
    sx.wire([[x, Y0], [x, 186]], { kv, net: 'BUS' }),
    sx.ds(x, 200, `${pre}-Q1`, { label: 'Q1' }),
    sx.wire([[x, 214], [x, 256]], { kv, net: `${pre}A` }),
    sx.cb(x, 270, `${pre}-Q0`, { kv, net: `${pre}A`, label: 'Q0' }),
    sx.wire([[x, 284], [x, 336]], { kv, net: `${pre}B` }),
    sx.ct(x, 306, { label: 'BI1' }),
    sx.ds(x, 350, `${pre}-Q9`, { label: 'Q9' }),
    sx.wire([[x, 364], [x, LY]], { kv, net: 'LINE' }),
    sx.vt(x, 392, { dir: -dir, label: 'BU1' }),
    sx.la(x, 420, { dir: -dir, label: 'F1' }),
    sx.es(x, 440, `${pre}-Q8`, { dir, label: 'Q8' }),
    sx.relay(x + dir * 70, 300, '21', { from: [x, 306], label: 'distance' }),
    `<g class="wfs-lock" data-lockfor="${pre}-Q9" opacity="0">${lockTag(x + dir * 22, 336, dir)}</g>`,
    `<g class="wfs-lock" data-lockfor="${pre}-Q0" opacity="0">${lockTag(x + dir * 22, 256, dir)}</g>`,
  ].join('');
  const x1 = 150; const x2 = 820; const tx = 485;
  return [
    sx.frame(W, H, { title: `ISOLATION · ${c.p.id}`, dno: `NX-WFS-ISO-${c.p.id.replace(/\D/g, '')}`, rev: 'B', note: 'Permit-to-work isolation. Simulation only.' }),
    sx.text(60, 52, `${c.line.name}`, { cls: 'sx-tb', size: 15 }),
    sx.text(60, 70, `Permit ${c.p.id} · ${c.p.type} · ${c.wo.id} ${fmt.title(c.wo.work_type)} at ${c.tower}`, { cls: 'sx-t' }),
    sx.bus(50, 300, Y0, { kv, net: 'BUS', label: `${c.end1} · ${kv} kV bus`, id: 'BUS1' }),
    sx.bus(670, 920, Y0, { kv, net: 'BUS', label: `${c.end2} · ${kv} kV bus`, id: 'BUS2' }),
    `<text x="282" y="${Y0 + 22}" class="sx-v" text-anchor="end" data-live="ISO.B1">—</text>${sx.text(288, Y0 + 22, 'kV', { cls: 'sx-ts' })}`,
    `<text x="902" y="${Y0 + 22}" class="sx-v" text-anchor="end" data-live="ISO.B2">—</text>${sx.text(908, Y0 + 22, 'kV', { cls: 'sx-ts' })}`,
    bay(x1, 'S1', 1), bay(x2, 'S2', -1),
    sx.wire([[x1, LY], [x2, LY]], { kv, net: 'LINE', flow: 'ISO.P', ref: 200 }),
    // work site
    `<rect x="${tx - 150}" y="${LY - 70}" width="300" height="200" rx="10" fill="rgba(220,38,38,.05)" stroke="#dc2626" stroke-dasharray="6 5"/>`,
    sx.text(tx, LY - 80, `WORK ZONE · ${c.tower}`, { cls: 'sx-tb', anchor: 'middle', color: '#dc2626' }),
    `<g transform="translate(${tx - 22},${LY - 62})" stroke="#9aa8bb" stroke-width="1.6" fill="none"><path d="M22 0 6 56M22 0l16 56M10 40h24M14 24h16M2 10h40M6 56h32"/></g>`,
    sx.ds(tx - 110, LY + 46, 'PE1', { label: 'PE1' }), sx.wire([[tx - 110, LY], [tx - 110, LY + 32]], { kv, net: 'LINE' }), sx.earth(tx - 110, LY + 60),
    sx.ds(tx + 110, LY + 46, 'PE2', { label: 'PE2' }), sx.wire([[tx + 110, LY], [tx + 110, LY + 32]], { kv, net: 'LINE' }), sx.earth(tx + 110, LY + 60),
    sx.readout(tx - 70, LY + 18, [['LINE U', 'ISO.U', 'kV'], ['DETECTOR', 'ISO.VD', ''], ['PE CURRENT', 'ISO.PEI', 'A']], { title: 'WORK-SITE TEST', w: 140, id: 'VD1', accent: '#dc2626' }),
    sx.readout(tx - 65, 250, [['P', 'ISO.P', 'MW'], ['I', 'ISO.I', 'A']], { title: `${c.line.id} FLOW`, w: 130, id: 'FLOW' }),
    // isolation state board (the faceplate opens over this column, never over a bay)
    `<g><rect x="1000" y="96" width="250" height="486" rx="8" fill="#fff" stroke="#cbd5e1"/>${sx.text(1016, 120, 'ISOLATION STATE', { cls: 'sx-tb', size: 11 })}${sx.text(1016, 136, `${c.p.id} · EN 50110-1`, { cls: 'sx-ts' })}${[['S1-Q0', `${c.end1} CB`], ['S1-Q9', `${c.end1} line DS`], ['S1-Q8', `${c.end1} earth`], ['S2-Q0', `${c.end2} CB`], ['S2-Q9', `${c.end2} line DS`], ['S2-Q8', `${c.end2} earth`], ['PE1', 'Portable earth 1'], ['PE2', 'Portable earth 2']].map(([d, l], i) => `<line x1="1012" y1="${150 + i * 34}" x2="1238" y2="${150 + i * 34}" stroke="#eef2f6"/>${sx.text(1016, 168 + i * 34, d, { cls: 'sx-tb', size: 10.5 })}${sx.text(1016, 180 + i * 34, l.length > 26 ? `${l.slice(0, 25)}…` : l, { cls: 'sx-ts' })}<text x="1236" y="172" transform="translate(0 ${i * 34})" text-anchor="end" class="sx-v wfs-dev" data-dev="${d}">—</text>`).join('')}<line x1="1012" y1="424" x2="1238" y2="424" stroke="#cbd5e1"/>${sx.text(1016, 444, 'Line voltage at site', { cls: 'sx-ts' })}<text x="1236" y="444" text-anchor="end" class="sx-v" data-live="ISO.U">—</text>${sx.text(1016, 464, 'Detector', { cls: 'sx-ts' })}<text x="1236" y="464" text-anchor="end" class="sx-v" data-live="ISO.VD">—</text>${sx.text(1016, 484, 'Earth current', { cls: 'sx-ts' })}<text x="1236" y="484" text-anchor="end" class="sx-v" data-live="ISO.PEI">—</text><line x1="1012" y1="498" x2="1238" y2="498" stroke="#cbd5e1"/>${sx.text(1016, 520, 'Programme progress', { cls: 'sx-ts' })}<text x="1236" y="520" text-anchor="end" class="sx-v" id="wfs-progtxt">0 / 9</text><rect x="1016" y="532" width="220" height="8" rx="4" fill="#eef2f6"/><rect x="1016" y="532" width="0" height="8" rx="4" fill="#16a34a" id="wfs-progbar"/>${sx.text(1016, 562, 'Permit', { cls: 'sx-ts' })}<text x="1236" y="562" text-anchor="end" class="sx-v" id="wfs-permst">NOT ISSUED</text></g>`,
    sx.text(60, H - 64, 'Breaker: red filled = closed, green hollow = open. Earthing switches close to the earth symbol.', { cls: 'sx-ts' }),
    sx.text(60, H - 50, 'Interlocks: Q9 operates only with Q0 open · Q8 closes only with Q9 open and line proved dead · PE after proving dead.', { cls: 'sx-ts' }),
  ].join('');
}
function lockTag(x, y, dir) {
  const xx = dir > 0 ? x : x - 64;
  return `<rect x="${xx}" y="${y - 9}" width="64" height="18" rx="3" fill="#dc2626" stroke="#991b1b"/><text x="${xx + 32}" y="${y + 4}" text-anchor="middle" class="sx-ts" style="fill:#ffffff;font-weight:700">LOCKED · DANGER</text>`;
}

const isolationScreen = {
  id: 'isolation', name: 'Isolation Diagram', icon: 'schematic',
  tabs: [
    {
      name: 'Live isolation (LOTO)', icon: 'schematic', full: true, 
      render: () => {
        const c = isoContext();
        return `<div class="wfs-iso"><div id="wfs-hmi"></div><aside class="wfs-prog"><div class="wfs-prog-h"><small>Switching programme · EN 50110-1</small><h3>${esc(c.p.id)}</h3><div class="nx-note">${esc(c.wo.id)} · ${esc(fmt.title(c.wo.work_type))} at ${esc(c.tower)} · ${esc(c.line.id)}</div>
          <label class="nx-field" style="margin-top:10px">Permit<select class="nx-select" id="wfs-isop">${outagePermits.map((p) => `<option value="${esc(p.id)}" ${p.id === c.p.id ? 'selected' : ''}>${esc(p.id)} · ${esc(p.asset)} · ${esc(p.line)}</option>`).join('')}</select></label></div>
          <div class="wfs-prog-b"><div id="wfs-steps"></div><div class="nx-toolbar">${ui.btn('Reset to normal', { sm: true, ic: 'sync', attrs: 'data-isoreset' })}<span class="nx-note">Click a device on the diagram, then Select → Execute.</span></div><div class="nx-sec"><h4>Operator log</h4><div id="wfs-isolog" class="nx-note"></div></div></div></aside></div>`;
      },
      mount: (st, ctx) => {
        const c = isoContext();
        iso.proved = false; iso.issued = false; iso.done = {}; iso.ooo = {}; iso.log = [];
        const sw = { 'S1-Q1': 'closed', 'S1-Q0': 'closed', 'S1-Q9': 'closed', 'S1-Q8': 'open', 'S2-Q1': 'closed', 'S2-Q0': 'closed', 'S2-Q9': 'closed', 'S2-Q8': 'open', PE1: 'open', PE2: 'open' };
        const lt = c.line.id;
        live.define('ISO.B1', { fn: () => live.get(`${lt}.KV`) * 1.002, dec: 1, unit: 'kV', desc: `${c.end1} bus voltage` });
        live.define('ISO.B2', { fn: () => live.get(`${lt}.KV`) * 0.996, dec: 1, unit: 'kV', desc: `${c.end2} bus voltage` });
        live.define('ISO.U', { fn: () => (lineAlive(iso.sw || sw) ? live.get(`${lt}.KV`) : earthed(iso.sw || sw) ? 0.01 + Math.random() * 0.02 : 1.4 + Math.random() * 0.5), dec: 2, unit: 'kV', desc: 'Line voltage at work site' });
        live.define('ISO.VD', { fn: () => (lineAlive(iso.sw || sw) ? 1 : 0), fmt: (v) => (v > 0.5 ? 'LIVE' : 'DEAD'), desc: 'Voltage detector at work site' });
        live.define('ISO.P', { fn: () => (lineAlive(iso.sw || sw) ? live.get(`${lt}.MW`) : 0), dec: 0, unit: 'MW', desc: `${lt} active power` });
        live.define('ISO.I', { fn: () => (lineAlive(iso.sw || sw) ? live.get(`${lt}.I`) : 0), dec: 0, unit: 'A', desc: `${lt} current` });
        live.define('ISO.PEI', { fn: () => ((iso.sw || sw).PE1 === 'closed' && !lineAlive(iso.sw || sw) ? 9 + Math.random() * 4 : 0), dec: 1, unit: 'A', h: 40, desc: 'Induced current in portable earths' });
        const hmiEl = st.querySelector('#wfs-hmi');
        hmiEl.className = 'nx-hmi is-full';
        const eq = (name, type, tags, extra = {}) => ({ name, type, tags, switch: true, ...extra });
        const h = ctx.hmi(hmiEl, {
          title: `Permit isolation · ${c.line.name}`, dno: `NX-WFS-ISO-${c.p.id.replace(/\D/g, '')}`, rev: 'B', w: 1280, h: 720, svg: isoSvg(c),
          switches: sw,
          nets: { BUS: {}, S1A: { requires: ['S1-Q1'], parent: 'BUS' }, S1B: { requires: ['S1-Q0'], parent: 'S1A' }, S2A: { requires: ['S2-Q1'], parent: 'BUS' }, S2B: { requires: ['S2-Q0'], parent: 'S2A' }, F1: { requires: ['S1-Q9'], parent: 'S1B' }, F2: { requires: ['S2-Q9'], parent: 'S2B' }, LINE: { parent: ['F1', 'F2'] } },
          equipment: {
            'S1-Q1': eq(`${c.end1} busbar disconnector Q1`, 'Disconnector', [{ tag: 'ISO.B1', label: 'Bus voltage' }]),
            'S1-Q0': eq(`${c.end1} line circuit-breaker Q0`, 'SF₆ circuit-breaker', [{ tag: 'ISO.I', label: 'Line current' }, { tag: 'ISO.P', label: 'Active power' }], { interlock: 'Trip circuit supervised' }),
            'S1-Q9': eq(`${c.end1} line disconnector Q9`, 'Disconnector', [{ tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Q0 open' }),
            'S1-Q8': eq(`${c.end1} line earthing switch Q8`, 'Earthing switch', [{ tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Q9 open & line dead' }),
            'S2-Q1': eq(`${c.end2} busbar disconnector Q1`, 'Disconnector', [{ tag: 'ISO.B2', label: 'Bus voltage' }]),
            'S2-Q0': eq(`${c.end2} line circuit-breaker Q0`, 'SF₆ circuit-breaker', [{ tag: 'ISO.I', label: 'Line current' }, { tag: 'ISO.P', label: 'Active power' }], { interlock: 'Trip circuit supervised' }),
            'S2-Q9': eq(`${c.end2} line disconnector Q9`, 'Disconnector', [{ tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Q0 open' }),
            'S2-Q8': eq(`${c.end2} line earthing switch Q8`, 'Earthing switch', [{ tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Q9 open & line dead' }),
            PE1: eq(`Portable earth PE1 · ${c.tower} back span`, 'Portable earth (IEC 61230)', [{ tag: 'ISO.PEI', label: 'Earth current' }, { tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Proved dead' }),
            PE2: eq(`Portable earth PE2 · ${c.tower} ahead span`, 'Portable earth (IEC 61230)', [{ tag: 'ISO.PEI', label: 'Earth current' }, { tag: 'ISO.U', label: 'Line voltage' }], { interlock: 'Proved dead' }),
            VD1: { name: `Voltage detector at ${c.tower}`, type: 'Capacitive detector IEC 61243-1', tags: [{ tag: 'ISO.U', label: 'Line voltage' }, { tag: 'ISO.VD', label: 'Indication' }, { tag: 'ISO.PEI', label: 'Earth current' }], desc: 'Prove on a known live source, test the line, prove again.' },
            FLOW: { name: `${c.line.id} power flow`, type: 'EMS measurand', tags: [{ tag: 'ISO.P', label: 'Active power' }, { tag: 'ISO.I', label: 'Current' }] },
            BUS1: { name: `${c.end1} ${c.kv} kV busbar`, type: 'Busbar', tags: [{ tag: 'ISO.B1', label: 'Voltage' }] },
            BUS2: { name: `${c.end2} ${c.kv} kV busbar`, type: 'Busbar', tags: [{ tag: 'ISO.B2', label: 'Voltage' }] },
          },
          legend: [{ label: `${c.kv} kV energised`, color: sx.kvColor(c.kv) }, { label: 'De-energised', color: '#c4ccd8' }, { label: 'Work zone', color: '#dc2626' }],
          alarmFilter: (tag) => tag.startsWith('ISO.') || /^(S1|S2)-Q|^PE/.test(tag),
          onSwitch: (id, state, api) => {
            const s = api.switches; const prev = state === 'open' ? 'closed' : 'open';
            const revert = (msg) => { api.set(id, prev); toast(msg, 'crit'); note(`BLOCKED ${id}: ${msg}`); };
            if (/-Q9$/.test(id) && s[id.replace('Q9', 'Q0')] === 'closed') return revert(`Interlock: ${id} cannot operate on load — open ${id.replace('Q9', 'Q0')} first`);
            if (/-Q1$/.test(id) && s[id.replace('Q1', 'Q0')] === 'closed') return revert(`Interlock: ${id} cannot operate on load — open ${id.replace('Q1', 'Q0')} first`);
            if (/-Q8$/.test(id) && state === 'closed' && (s[id.replace('Q8', 'Q9')] === 'closed' || lineAlive(s))) return revert(`Interlock: ${id} blocked — ${id.replace('Q8', 'Q9')} must be open and the line dead`);
            if (/^PE/.test(id) && state === 'closed' && (lineAlive(s) || !iso.proved)) return revert(`${id} refused — prove the line dead at the work site first`);
            if (/-Q9$/.test(id) && state === 'closed' && earthed(s)) return revert(`Interlock: ${id} blocked — line is earthed; remove earths first`);
            if (/-Q0$/.test(id) && state === 'closed' && earthed(s) && s[id.replace('Q0', 'Q9')] === 'closed') return revert('Interlock: closing onto an earthed line');
            note(`${id} ${state === 'closed' ? (/(Q8|PE)/.test(id) ? 'EARTHED' : 'CLOSED') : 'OPENED'}`);
            if (/-Q9$/.test(id) && state === 'open') toast(`${id} open — padlock applied and DANGER tag hung`, 'warn');
            iso.sw = s; evalSteps();
          },
        });
        iso.sw = h.switches;
        function note(t) { iso.log.unshift(`${new Date().toTimeString().slice(0, 8)}  ${t}`); log({ actor: 'Control: Dispatcher 2', action: 'Switching operation', object: c.p.id, detail: t, source: 'SCADA / EMS' }); const el = st.querySelector('#wfs-isolog'); if (el) el.innerHTML = iso.log.slice(0, 14).map((x) => `<div class="nx-mono" style="font-size:11px;padding:2px 0">${esc(x)}</div>`).join(''); }
        function evalSteps() {
          const s = iso.sw;
          STEPS.forEach((stp, i) => {
            const ok = stp.test(s);
            if (ok && !iso.done[stp.id]) {
              iso.done[stp.id] = true;
              const missed = STEPS.slice(0, i).filter((x) => !iso.done[x.id]);
              if (missed.length) { iso.ooo[stp.id] = true; toast(`Out of sequence: “${stp.title}” before step ${STEPS.indexOf(missed[0]) + 1}`, 'warn'); note(`OUT OF SEQUENCE step ${i + 1}`); }
            } else if (!ok && iso.done[stp.id]) { delete iso.done[stp.id]; delete iso.ooo[stp.id]; toast(`Step ${i + 1} undone — “${stp.title}”`, 'warn'); }
          });
          st.querySelectorAll('.wfs-lock').forEach((g) => { const id = g.getAttribute('data-lockfor'); g.setAttribute('opacity', s[id] === 'open' && (/Q9$/.test(id) || (/Q0$/.test(id) && s[id.replace('Q0', 'Q9')] === 'open')) ? '1' : '0'); });
          paintSteps();
        }
        function paintBoard() {
          const s = iso.sw || {};
          st.querySelectorAll('.wfs-dev').forEach((t) => { const d = t.getAttribute('data-dev'); const v = s[d]; const earthing = /Q8|PE/.test(d); const txt = earthing ? (v === 'closed' ? 'EARTHED' : 'OFF') : (v === 'closed' ? 'CLOSED' : 'OPEN'); t.textContent = /Q9/.test(d) && v === 'open' ? 'OPEN · LOCKED' : txt; t.style.fill = earthing ? (v === 'closed' ? '#16a34a' : '#64748b') : (v === 'closed' ? '#dc2626' : '#16a34a'); });
          const n = STEPS.filter((x) => iso.done[x.id]).length;
          const pt = st.querySelector('#wfs-progtxt'); if (pt) pt.textContent = `${n} / ${STEPS.length}`;
          const pb = st.querySelector('#wfs-progbar'); if (pb) pb.setAttribute('width', String(Math.round((220 * n) / STEPS.length)));
          const ps = st.querySelector('#wfs-permst'); if (ps) { ps.textContent = iso.issued ? 'ISSUED' : 'NOT ISSUED'; ps.style.fill = iso.issued ? '#16a34a' : '#b45309'; }
        }
        function paintSteps() {
          paintBoard();
          const next = STEPS.find((x) => !iso.done[x.id]);
          st.querySelector('#wfs-steps').innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${STEPS.map((x, i) => `<div class="wfs-step${iso.done[x.id] ? (iso.ooo[x.id] ? ' is-ooo' : ' is-done') : x === next ? ' is-next' : ''}"><i>${iso.done[x.id] ? '✓' : i + 1}</i><div><b>${esc(x.title)}</b><span>${esc(x.sub)}</span>${iso.ooo[x.id] ? '<span style="color:#b45309;display:block">Executed out of sequence — supervisor review required</span>' : ''}${x.action && !iso.done[x.id] && x === next ? `<div>${ui.btn(x.action === 'prove' ? 'Prove – test – prove' : 'Issue permit', { primary: true, sm: true, ic: x.action === 'prove' ? 'zap' : 'key', attrs: `data-isoact="${x.action}"` })}</div>` : ''}</div></div>`).join('')}</div>${iso.issued ? ui.callout(`<b>${esc(c.p.id)} issued.</b> Isolation certificate attached; crew lead accepted on site. Repair task verified: work authorisation approved, qualified high-voltage crew assigned, permits cleared.`, 'ok', 'checkCircle') : ''}`;
        }
        ctx.on('click', '[data-isoact]', (e, b) => {
          if (b.dataset.isoact === 'prove') {
            if (lineAlive(iso.sw)) { toast('Detector indicates LIVE — line is not isolated. Do not earth.', 'crit'); note('PROVE DEAD failed — LIVE'); return; }
            iso.proved = true; note(`Proved dead at ${c.tower} (induced ${live.text('ISO.U')} kV below detector threshold)`); toast(`Absence of voltage verified at ${c.tower}`);
          } else {
            if (STEPS.slice(0, 8).some((x) => !iso.done[x.id])) { toast('Complete steps 1–8 before issuing the permit', 'crit'); return; }
            iso.issued = true; permitState.set(c.p.id, 'active'); note(`${c.p.id} issued to ${c.p.crewName}`); toast(`${c.p.id} issued — isolation certificate attached`);
          }
          evalSteps();
        });
        ctx.on('change', '#wfs-isop', (e, s) => { isoPermit = s.value; nav.rerender(); });
        ctx.on('click', '[data-isoreset]', () => nav.rerender());
        paintSteps();
        note(`Programme loaded for ${c.p.id} · line in service`);
      },
    },
    {
      name: 'Switching programme', icon: 'clipboard',
      render: () => {
        const c = isoContext();
        const rows = [
          ['1', 'Control', `${c.end1}`, 'S1-Q0', 'Open', 'Check indication & current = 0'],
          ['2', 'Control', `${c.end2}`, 'S2-Q0', 'Open', 'Check indication & current = 0'],
          ['3', 'Substation AP', `${c.end1}`, 'S1-Q9', 'Open · lock · tag', 'Visible gap; padlock L-117; DANGER tag'],
          ['4', 'Substation AP', `${c.end2}`, 'S2-Q9', 'Open · lock · tag', 'Visible gap; padlock L-118; DANGER tag'],
          ['5', 'Crew lead', c.tower, 'VD1', 'Prove – test – prove', 'Detector IEC 61243-1 on known live source'],
          ['6', 'Substation AP', `${c.end1}`, 'S1-Q8', 'Close (earth)', 'Interlock: Q9 open & line dead'],
          ['7', 'Substation AP', `${c.end2}`, 'S2-Q8', 'Close (earth)', 'Interlock: Q9 open & line dead'],
          ['8', 'Crew lead', c.tower, 'PE1 / PE2', 'Apply portable earths', 'Earth end first; IEC 61230 95 mm² Cu'],
          ['9', 'Senior AP', c.tower, c.p.id, 'Issue permit', 'Crew lead signs acceptance'],
        ];
        const devs = [['S1-Q0', 'Circuit-breaker', 'Closed', 'Open'], ['S1-Q9', 'Line disconnector', 'Closed', 'Open · locked L-117'], ['S1-Q8', 'Earthing switch', 'Open', 'Closed (earthed)'], ['S2-Q0', 'Circuit-breaker', 'Closed', 'Open'], ['S2-Q9', 'Line disconnector', 'Closed', 'Open · locked L-118'], ['S2-Q8', 'Earthing switch', 'Open', 'Closed (earthed)'], ['PE1', 'Portable earth', 'Off', `Applied at ${c.tower}`], ['PE2', 'Portable earth', 'Off', `Applied at ${c.tower}`]];
        return `<div class="nx-page">${ui.callout(`Programme for <b>${esc(c.p.id)}</b> — ${esc(c.p.isolation)}. Restoration is the exact reverse, after the crew lead clears and cancels the permit.`, 'info', 'clipboard')}<div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Planned timing of the programme', sub: 'Minutes per step from control instruction to confirmation · total gives the outage-start time for the crew', body: ui.chart('swt', 'md') })}${ui.card({ cls: 'nx-s5', title: 'Device states · normal vs isolated', sub: `${c.line.id} isolation for ${c.tower}`, flush: true, body: ui.table({ cols: [{ key: 0, label: 'Device', render: (r) => `<b class="nx-mono">${esc(r[0])}</b><span class="nx-sub">${esc(r[1])}</span>` }, { key: 2, label: 'Normal', render: (r) => ui.badge(r[2], 'muted', { dot: false }) }, { key: 3, label: 'Isolated for work', render: (r) => ui.badge(r[3], /Closed|Applied/.test(r[3]) ? 'ok' : 'warn', { dot: false }) }], rows: devs }) })}</div>${ui.card({ title: 'Switching programme', sub: `${c.line.name} · prepared by Control, checked by Senior AP`, flush: true, body: ui.table({ cols: [{ key: 0, label: 'Step', align: 'r' }, { key: 1, label: 'By' }, { key: 2, label: 'Location' }, { key: 3, label: 'Device', render: (r) => `<b class="nx-mono">${esc(r[3])}</b>` }, { key: 4, label: 'Operation' }, { key: 5, label: 'Check', wrap: true, render: (r) => `<span class="nx-note" style="color:var(--nx-ink-2)">${esc(r[5])}</span>` }], rows }) })}</div>`;
      },
      mount: (st, ctx) => {
        const mins = [4, 4, 9, 9, 12, 6, 6, 18, 5]; let t0 = 0;
        const labels = ['1 S1-Q0 open', '2 S2-Q0 open', '3 S1-Q9 lock', '4 S2-Q9 lock', '5 Prove dead', '6 S1-Q8 earth', '7 S2-Q8 earth', '8 Portable earths', '9 Issue permit'];
        const start = mins.map((m) => { const s0 = t0; t0 += m; return s0; });
        ctx.chart('swt', { grid: ch.grid({ top: 10, right: 30 }), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => { const i = ps[0].dataIndex; return `<b>${labels[i]}</b><br/>Starts T+${start[i]} min · ${mins[i]} min`; } }, xAxis: { type: 'value', name: 'minutes from T0', nameLocation: 'middle', nameGap: 24 }, yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { fontSize: 11 } }, series: [{ type: 'bar', stack: 't', data: start, itemStyle: { color: 'transparent' }, emphasis: { disabled: true } }, { type: 'bar', stack: 't', name: 'Duration', data: mins.map((m, i) => ({ value: m, itemStyle: { color: i < 4 ? '#2563eb' : i === 4 ? '#f59e0b' : i < 8 ? '#16a34a' : '#8b5cf6', borderRadius: 4 } })), label: { show: true, position: 'right', formatter: (x) => `${x.value} min`, fontSize: 10, color: '#475569' } }] });
      },
    },
    ...drawingTabs('workforce'),
  ],
};

/* ================================================================== mount */
const screens = [dashboard, assignScreen, safetyScreen, permitScreen, mobileScreen, complianceScreen, isolationScreen];
dashboard.count = null;
permitScreen.count = net.permits.filter((p) => permitState.get(p.id) === 'pending isolation').length || null;

mountApp({
  id: 'workforce', code: '08', product: 'Workforce & Safety', back: '/#module-card-08', asOf: ASOF, screens,
  searchIndex: () => [
    ...net.people.map((p) => ({ label: `${p.name} · ${p.role}`, sub: `${p.id} · ${p.crewName}`, icon: 'users', run: () => personDrawer(p.id) })),
    ...net.crews.map((c) => ({ label: `${c.id} · ${c.name}`, sub: `${c.status} · ${c.baseName}`, icon: 'truck', run: () => crewDrawer(c.id) })),
    ...net.permits.map((p) => ({ label: `${p.id} · ${p.type}`, sub: `${p.wo} · ${p.asset} · ${permitState.get(p.id)}`, icon: 'key', run: () => permitDrawer(p.id) })),
    ...openWos.map((w) => ({ label: `${w.id} · ${w.work_type}`, sub: `${w.towerName || w.asset} · ${w.stage}`, icon: 'clipboard', run: () => { selWo = w.id; nav.go('assign'); } })),
    ...hse.map((r) => ({ label: `${r.id} · ${r.type}`, sub: `${r.tower} · ${r.text.slice(0, 60)}`, icon: 'shield', run: () => hseDrawer(r.id) })),
  ],
});
