// Predictive models: the validation register.
//
// Management feedback (12 Nov 2026): predictions must not be presented as validated until they have been tested
// against suitable real data. Until then every condition forecast, risk heatmap and predicted value is labelled
// "Experimental" or "Simulated" in the interface (ui.exp, the card/KPI/tab/screen `exp` flags in console.js).
//
// This file is the record the feedback asks for: one entry per model, what it predicts, the data it runs on today,
// and the data sources it has been TESTED AGAINST. A label may only be removed once the model's entry lists at least
// one real data source in `testedAgainst` and its status is set to 'validated'. Today every list is empty: the whole
// prototype runs on simulated demo data.
//
// Modules add their own models with models.register(); a click on any Experimental marker opens the register.

import { drawer, ui, esc } from './console.js';

/** @typedef {{ source: string, period?: string, records?: string, result?: string, date?: string }} ValidationRun */
/**
 * @typedef {Object} ModelEntry
 * @property {string} id
 * @property {string} name
 * @property {string} module        e.g. '06 · Risk & Maintenance Forecasting'
 * @property {string} predicts      what the model outputs
 * @property {string} method        how it works, in one line
 * @property {string} [runsOn]      the data it runs on today
 * @property {'experimental'|'validated'} [status]
 * @property {ValidationRun[]} [testedAgainst]  real data sources the model was tested against (empty = none yet)
 * @property {string} [needs]       the real data needed to validate it
 */

const SIMULATED = 'Simulated demo data (synthetic network, findings and telemetry)';
const REGISTER = new Map();

export const models = {
  /** Add or update one or more models. */
  register(entries) {
    for (const m of [].concat(entries)) REGISTER.set(m.id, { status: 'experimental', runsOn: SIMULATED, testedAgainst: [], ...REGISTER.get(m.id), ...m });
    return models;
  },
  list: () => [...REGISTER.values()],
  get: (id) => REGISTER.get(id) ?? null,
  /** True only when the model has been tested against real data and signed off. Labels stay until then. */
  isValidated: (id) => { const m = REGISTER.get(id); return Boolean(m && m.status === 'validated' && m.testedAgainst.length); },
  open: openRegister,
};

// Models every module reads through the shared network (network.js). Module-specific models are registered by the module.
models.register([
  { id: 'risk-score', name: 'Risk-priority score and risk heatmap', module: '01 · Asset Reliability', predicts: 'Relative risk of each tower, span and transformer; the likelihood × consequence matrix and the risk colours on every map', method: '(100 − health index) × criticality × consequence, with a consequence uplift for electrically linked poor assets. Likelihood is inferred from the health index, not from failure statistics.', needs: 'Failure and forced-outage history per asset class to calibrate likelihood; an agreed consequence scale from the asset owner.' },
  { id: 'finding-confidence', name: 'Inspection finding detection confidence', module: '02 · AI Inspection & Quality', predicts: 'Confidence (%) that an inspection finding is a real defect, shown wherever findings are listed', method: 'Score carried on each finding by the defect-detection step of the inspection pipeline; the other modules only display it.', needs: 'Field-verified findings (confirmed or rejected by engineers) to measure precision and recall per defect class.' },
  { id: 'hi-decay', name: 'Health-index deterioration forecast', module: '01 · Asset Reliability / 06 · Forecasting', predicts: 'Future health index of a tower (condition trend, forecast risk, due dates)', method: 'Exponential decay per ISO 9223 corrosivity zone with age and open-defect multipliers, plus a storm-loss term.', needs: 'At least three years of repeat inspection scores per tower family, and corrosion-rate measurements per zone.' },
]);

/**
 * Baseline health-index projection shared by Module 01 (Asset 360 · Condition Trends) and Module 06 (forecasts).
 * EXPERIMENTAL: the constants are engineering assumptions, not fitted to real inspection data (see 'hi-decay' above).
 */
export const K_ZONE = { C2: 0.011, C3: 0.017, C4: 0.027, C5: 0.038 };
export const HI_BASELINE = { corrosion: 1, storm: 1 };
/** Annual decay rate for a tower t = { zone, age, open, worst }. */
export function hiDecayRate(t, s = HI_BASELINE) {
  const ageF = 1 + Math.max(0, (t.age ?? 0) - 15) * 0.012;
  const defF = 1 + Math.min(3, t.open ?? 0) * 0.08 + ((t.worst ?? 5) <= 2 ? 0.25 : 0);
  return (K_ZONE[t.zone] ?? 0.017) * (s.corrosion ?? 1) * ageF * defF;
}
/** Predicted health index y years ahead with no intervention; null when the tower has no health index. */
export function projectHi(t, y, s = HI_BASELINE) {
  if (t.hi == null) return null;
  const storm = 0.4 * (s.storm ?? 1) * (t.kv >= 220 ? 1 : 0.85) * y;
  return Math.max(0, Math.min(100, t.hi * Math.exp(-hiDecayRate(t, s) * y) - storm));
}

function openRegister() {
  const rows = models.list();
  const validated = rows.filter((m) => models.isValidated(m.id)).length;
  const body = `<div class="nx-sec">${ui.callout(`<b>${rows.length - validated} of ${rows.length} predictive models on this workspace are experimental.</b> Their outputs are simulated on demo data and have not been tested against real data. Each stays labelled <b>Experimental</b> or <b>Simulated</b> in the interface, in demos and in written material until a validation run against a real data source is recorded here.`, 'warn', 'flask')}</div>
  <div class="nx-sec"><h4>Model validation register</h4>${ui.table({ cols: [
    { label: 'Model', wrap: true, sort: (m) => m.name, render: (m) => `<b>${esc(m.name)}</b><span class="nx-sub">${esc(m.module)}</span>` },
    { label: 'Predicts', wrap: true, sort: false, render: (m) => `${esc(m.predicts)}<span class="nx-sub">${esc(m.method)}</span>` },
    { label: 'Runs on', wrap: true, sort: false, render: (m) => esc(m.runsOn) },
    { label: 'Tested against (real data)', wrap: true, sort: false, render: (m) => (m.testedAgainst.length ? m.testedAgainst.map((v) => `<b>${esc(v.source)}</b>${v.period ? ` · ${esc(v.period)}` : ''}${v.records ? ` · ${esc(v.records)}` : ''}${v.result ? `<span class="nx-sub">${esc(v.result)}${v.date ? ` · ${esc(v.date)}` : ''}</span>` : ''}`).join('<br/>') : `<span style="color:#b45309;font-weight:600">None yet</span>${m.needs ? `<span class="nx-sub">Needs: ${esc(m.needs)}</span>` : ''}`) },
    { label: 'Status', sort: (m) => m.status, render: (m) => (models.isValidated(m.id) ? ui.badge('Validated', 'ok') : ui.exp('Experimental')) },
  ], rows })}</div>
  <div class="nx-sec"><h4>Before a label is removed</h4><div class="nx-list">${[
    ['database', 'Test against real data', 'Run the model on the customer’s own inspection, outage, maintenance or ERP history, not on the demo data.'],
    ['doc', 'Record the data source', 'Add the source, period, record count and result to the model’s entry in this register (models.js · testedAgainst).'],
    ['checkCircle', 'Engineering sign-off', 'Set the status to Validated. Only then are the Experimental markers removed from the screens that use the model.'],
  ].map(([ic, title, sub]) => ui.li({ ic, title, sub })).join('')}</div></div>`;
  drawer.open({ kicker: 'Predictive models', title: 'Model validation register', sub: 'What each model predicts, the data it runs on, and the real data it has been tested against.', icon: 'flask', badges: [[`${rows.length - validated} experimental`, 'warn'], [`${validated} validated`, validated ? 'ok' : 'muted']], body, wide: true, meta: 'Simulated demo data · not validated' });
}

// One handler for every Experimental marker on the page (badges, KPI chips, the banner button).
if (typeof document !== 'undefined' && !window.__nxExpBound) {
  window.__nxExpBound = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-nx-exp]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    openRegister();
  }, true);
}
