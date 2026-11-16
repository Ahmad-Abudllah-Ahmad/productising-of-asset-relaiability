// Validation register: every model or score the module shows, and whether it has been tested against real data.
//
// Two labels, used the same way everywhere:
//   Simulated     the data was generated (the seed, the simulated LiDAR, the generated thermal view, demo images)
//   Experimental  a model's output that has not been tested against suitable real data
//
// An entry is experimental until someone records what it was tested against and the result. Every Experimental badge on a screen
// reads this register (app/badge.js), so a label cannot be removed on one screen and forgotten on another: change the status here,
// with the evidence, and every badge for that entry goes. A unit test fails if an entry is "validated" without testedAgainst and result.
//
//   status          'experimental' | 'validated'
//   testedAgainst   what real data it was compared with (null until it was)
//   result          what that comparison showed (null until it was)
//   date            when (YYYY-MM-DD, null until it was)
//   approvedBy      who signed it off (null until it was)

/** @typedef {{id: string, name: string, status: 'experimental'|'validated', why: string, testedAgainst: string|null, result: string|null, date: string|null, approvedBy: string|null}} RegisterEntry */

/** @type {ReadonlyArray<RegisterEntry>} */
export const REGISTER = Object.freeze([
  {
    id: 'health_index', name: 'Health index',
    why: 'The group weights (equal), the band cut-offs (70 and 40) and the condition cap are assumptions A1 to A6 in config.js, not values agreed with engineering.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
  {
    id: 'risk', name: 'Risk score',
    why: 'Risk is (100 - health index) x criticality x consequence. Criticality and consequence are invented from voltage and redundancy rules (assumptions A7 and A8), on top of an unvalidated health index.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
  {
    id: 'risk_map', name: 'Risk Map colouring',
    why: 'The map colours lines, towers and clusters by the health index and risk score, which are both experimental.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
  {
    id: 'resemblance', name: 'Resemblance (match) scores',
    why: 'Identifier, attribute and spatial signals are rules; the visual signal is a stub over seeded feature vectors until the image-similarity model is connected. Thresholds are assumption A21.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
  {
    id: 'finding_confidence', name: 'AI finding class and confidence',
    why: 'The class and confidence of a finding come from a detector whose accuracy on this network has not been recorded. In this demo the findings are generated.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
  {
    id: 'forecast', name: 'Condition forecast',
    why: 'Planned, not built yet (Phase E). When it exists it is a projection from a few campaigns and stays experimental until tested against later inspections.',
    status: 'experimental', testedAgainst: null, result: null, date: null, approvedBy: null,
  },
]);

const byId = new Map(REGISTER.map((e) => [e.id, e]));

/** @returns {RegisterEntry|null} */
export const entryFor = (id) => byId.get(id) ?? null;

/** True when the entry still needs the Experimental label. An unknown id is treated as experimental, never silently unlabelled. */
export const isExperimental = (id) => (byId.get(id)?.status ?? 'experimental') !== 'validated';

/** The text a badge shows on hover: why it is experimental, and which register entry it reads. */
export function explain(id) {
  const e = byId.get(id);
  if (!e) return `Experimental: "${id}" has no entry in the validation register (reliability/js/domain/validation.js).`;
  const tested = e.testedAgainst ? `Tested against: ${e.testedAgainst}.` : 'Not yet tested against real data.';
  return `Experimental. ${e.why} ${tested} Validation register entry: ${e.id} (reliability/js/domain/validation.js).`;
}

/** Problems in the register itself; an empty list means it is consistent. A test asserts this. */
export function checkRegister(register = REGISTER) {
  const problems = [];
  const seen = new Set();
  for (const e of register) {
    if (seen.has(e.id)) problems.push(`${e.id}: listed twice`);
    seen.add(e.id);
    if (!['experimental', 'validated'].includes(e.status)) problems.push(`${e.id}: status must be experimental or validated`);
    if (e.status === 'validated') {
      if (!e.testedAgainst) problems.push(`${e.id}: validated without testedAgainst`);
      if (!e.result) problems.push(`${e.id}: validated without a result`);
    }
  }
  return problems;
}
