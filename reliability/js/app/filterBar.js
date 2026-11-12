// The global filter bar, under the top bar of every screen: label, voltage, category and an "as of" date. The state is the
// URL hash (scope.js), so it follows you from screen to screen. The bar only reads and writes the hash and says so with a
// 'rel-scope' event; boot.js reloads the snapshot and the screens redraw from it.

import { h } from '../ui/dom.js';
import { hashFor } from './hashState.js';
import { CATEGORY_OPTIONS, hasFilters } from './scope.js';

export const SCOPE_EVENT = 'rel-scope';
const KINDS = { corridor: 'Corridor', circuit: 'Circuit', region: 'Region', corrosion_zone: 'Corrosion zone', criticality_class: 'Criticality class', manufacturer: 'Manufacturer', design_family: 'Design family', substation: 'Substation', failure_mode: 'Failure mode' };

/**
 * @param {{labels: Array<{id: string, kind: string, value: string}>, limits: {first: string, last: string}, getScope: () => any}} deps
 */
export function createFilterBar({ labels, limits, getScope }) {
  const kinds = [...new Set(labels.filter((l) => l.kind !== 'failure_mode').map((l) => l.kind))];
  const write = (patch) => {
    history.replaceState(history.state, '', location.pathname + location.search + hashFor(patch));
    window.dispatchEvent(new CustomEvent(SCOPE_EVENT));
  };
  const label = h('select', { 'data-testid': 'gf-label', 'aria-label': 'Label', onChange: (e) => write({ flabel: e.target.value || null }) },
    h('option', { value: '' }, 'All labels'),
    kinds.map((k) => h('optgroup', { label: KINDS[k] ?? k }, labels.filter((l) => l.kind === k).map((l) => h('option', { value: l.id }, l.value)))));
  const kv = h('select', { 'data-testid': 'gf-kv', 'aria-label': 'Voltage', onChange: (e) => write({ fkv: e.target.value || null }) },
    h('option', { value: '' }, 'All voltages'), [132, 220, 500].map((v) => h('option', { value: String(v) }, `${v} kV`)));
  const cat = h('select', { 'data-testid': 'gf-category', 'aria-label': 'Category', onChange: (e) => write({ fcat: e.target.value || null }) },
    h('option', { value: '' }, 'All categories'), CATEGORY_OPTIONS.map(([id, text]) => h('option', { value: id }, text)));
  const date = h('input', { type: 'date', 'data-testid': 'gf-asof', 'aria-label': 'As of date', min: limits.first, max: limits.last, value: limits.last,
    onChange: (e) => { const v = e.target.value; write({ asof: !v || v >= limits.last || v < limits.first ? null : v }); } });
  const today = h('button', { class: 'gf-btn', type: 'button', 'data-testid': 'gf-today', onClick: () => write({ asof: null }) }, 'Today');
  const reset = h('button', { class: 'gf-btn', type: 'button', 'data-testid': 'gf-reset', onClick: () => write({ flabel: null, fkv: null, fcat: null, asof: null }) }, 'Reset');
  const note = h('span', { class: 'gf-note', 'data-testid': 'gf-note', role: 'status' });
  const field = (text, control) => h('label', { class: 'gf-field' }, h('span', {}, text), control);
  const root = h('div', { class: 'gf', id: 'rel-filters', role: 'group', 'aria-label': 'Filters for every screen', 'data-testid': 'filter-bar' },
    field('Label', label), field('Voltage', kv), field('Category', cat), field('As of', date), today, reset, note);

  return {
    root,
    /** Show the scope in the controls; `onDrawing` greys the bar out on the screen the filters cannot change. */
    sync(scope, { onDrawing = false } = {}) {
      label.value = scope.label ?? ''; kv.value = scope.kv ? String(scope.kv) : ''; cat.value = scope.category ?? ''; date.value = scope.asOf ?? limits.last;
      root.classList.toggle('is-active', hasFilters(scope) || Boolean(scope.asOf));
      root.classList.toggle('is-off', onDrawing);
      for (const c of [label, kv, cat, date, today, reset]) c.disabled = onDrawing;
      note.textContent = onDrawing ? 'The drawing sheets are fixed; the filters do not change them.' : scope.asOf ? `Everything is rescored as of ${scope.asOf}.` : '';
    },
  };
}
