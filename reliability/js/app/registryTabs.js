// The Asset Registry tabs: six category tabs (lines, towers, spans, components, substations, transformers)
// and Links, which hosts the Link Review screen. Markup reuses the legacy look: KPI cards, tags, the filter
// column, the table card. The legacy shell turns every select in the screen into a row filter by matching the
// value against each row's data-zone, so the filter column here needs no code of its own.
//
// A click or Enter on a row opens the Asset 360 panel for that asset. A "possible duplicate" chip opens the
// matching link in the Links tab instead.

import { CATEGORIES, tableFor, filtersFor, kpisFor, linksKpis } from './registryModel.js';
import { mountLinkReview } from '../ui/linkReview.js';
import { openAsset } from './assetPanel.js';
import { pendingLink, pendingFilters, openLinkInReview, openScreen } from './navigation.js';
import { drillKpis } from './screenKit.js';

/**
 * @param {{kit: any, repo: any, getSnapshot: () => any, subscribeSnapshot: (fn: () => void) => (() => void), flags?: object}} deps
 * @returns {Array<{name: string, render: () => string, mount?: (stage: HTMLElement) => (() => void)|void}>}
 */
export function createRegistryTabs({ kit, repo, getSnapshot, subscribeSnapshot, flags = {} }) {
  const { esc, tip, kpis } = kit;

  const tag = (c) => {
    const main = c.tone ? `<span class="tag ${esc(c.tone)}${c.stale ? ' is-stale' : ''}"${c.stale ? ' title="Older than the inspection interval: this score is stale"' : ''}>${esc(c.text)}</span>` : esc(c.text);
    const chips = (c.chips ?? []).map((x) => `<button type="button" class="tag ${esc(x.tone)} reg-chip" data-link="${esc(x.link)}" data-link-status="${esc(x.status)}" title="Open this link in the Links tab">${esc(x.text)}</button>`).join('');
    return chips ? `${main} ${chips}` : main;
  };

  function filterColumn(groups) {
    const blocks = groups.map((g) => `<div class="filter-label">${esc(g.group)}</div>${g.selects.map((s) =>
      `<label>${esc(s.label)}<select aria-label="${esc(s.label)}"><option value="All">All</option>${s.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`).join('')}`).join('');
    return `<aside class="filter-col"><div class="filter-head"><b>Filter</b><button class="linkish clear-filters" type="button">Clear</button></div>${blocks}<div class="banner" data-banner>All</div>` +
      `<div class="asof" data-testid="as-of" title="The demo's fixed reference date. Scores use only evidence and repairs up to this date.">Scores as of ${esc(getSnapshot().asOf)}</div></aside>`;
  }

  function tableHtml(columns, rows, nested) {
    const head = `<tr>${columns.map((c, i) => (nested ? `<th scope="col" data-col="${i}">${esc(c)}</th>` : `<th scope="col" tabindex="0" data-col="${i}" aria-sort="none">${esc(c)}</th>`)).join('')}</tr>`;
    const body = rows.map((r) => `<tr${tip(r.tip)} data-asset="${esc(r.id)}" data-zone="${esc(r.zone)}" tabindex="0"${r.level ? ` class="reg-${r.level}"` : ''}>${r.cells.map((c) => `<td data-v="${esc(c.sort)}">${tag(c)}</td>`).join('')}</tr>`).join('');
    return `<table class="reg-table${nested ? ' is-nested' : ''}"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  /** A click or Enter on a row opens that asset's panel; a duplicate chip opens its link in the Links tab. */
  function enableRows(stage) {
    const table = stage.querySelector('table.reg-table');
    if (!table) return undefined;
    const body = table.tBodies[0];
    const open = (e) => {
      const chip = e.target.closest('.reg-chip');
      if (chip) { e.stopPropagation(); openLinkInReview(chip.dataset.link, chip.dataset.linkStatus); return; }
      const tr = e.target.closest('tr[data-asset]');
      if (tr && body.contains(tr)) openAsset(tr.dataset.asset, { opener: tr });
    };
    const key = (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-asset]')) open(e); };
    body.addEventListener('click', open);
    body.addEventListener('keydown', key);
    return () => { body.removeEventListener('click', open); body.removeEventListener('keydown', key); };
  }

  /** Click or Enter on a column heading sorts the rows. Rows hidden by a filter stay hidden. */
  function enableSorting(stage) {
    const table = stage.querySelector('table.reg-table');
    if (!table || table.classList.contains('is-nested')) return undefined;
    const sortBy = (th) => {
      const col = Number(th.dataset.col);
      const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      table.querySelectorAll('th').forEach((h) => h.setAttribute('aria-sort', 'none'));
      th.setAttribute('aria-sort', dir);
      const body = table.tBodies[0];
      const rows = [...body.rows];
      const val = (r) => r.cells[col].dataset.v;
      const num = (v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
      rows.sort((a, b) => {
        const x = val(a); const y = val(b);
        const nx = num(x); const ny = num(y);
        const c = nx !== null && ny !== null ? nx - ny : String(x).localeCompare(String(y), undefined, { numeric: true });
        return dir === 'ascending' ? c : -c;
      });
      rows.forEach((r) => body.append(r));
    };
    const onClick = (e) => { const th = e.target.closest('th'); if (th && table.contains(th)) sortBy(th); };
    const onKey = (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const th = e.target.closest('th'); if (th && table.contains(th)) { e.preventDefault(); sortBy(th); } };
    table.tHead.addEventListener('click', onClick);
    table.tHead.addEventListener('keydown', onKey);
    return () => { table.tHead.removeEventListener('click', onClick); table.tHead.removeEventListener('keydown', onKey); };
  }

  const categoryTab = (cat) => ({
    name: cat.title,
    render() {
      const snap = getSnapshot();
      const { columns, rows, nested } = tableFor(snap, cat.id);
      return `<div class="screen desk reg" data-testid="registry-${cat.id}">${filterColumn(filtersFor(cat.id, rows))}<div class="desk-main">${kpis(kpisFor(snap, cat.id))}` +
        `<div class="card table-card">${tableHtml(columns, rows, nested)}<div class="empty-note">Nothing matches these filters. Choose All to restore the list.</div></div></div></div>`;
    },
    mount(stage) {
      // a drill-down from another screen (the Dashboard) arrives with filters to switch on
      if (pendingFilters.tab === cat.title && pendingFilters.filters) {
        for (const [label, value] of Object.entries(pendingFilters.filters)) {
          const sel = [...stage.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === label);
          if (sel && [...sel.options].some((o) => o.value === value)) { sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      }
      pendingFilters.tab = null; pendingFilters.filters = null;
      const band = stage.querySelector('select[aria-label="Health band"]');
      drillKpis(stage, {
        'Average health index': () => openScreen('home'), 'Highest risk': () => openScreen('home'),
        'Open findings': () => openScreen('history', 'Open findings', { sev: 'all' }),
        'Needs attention': band ? () => { band.value = 'poor'; band.dispatchEvent(new Event('change', { bubbles: true })); } : null,
      });
      const offSort = enableSorting(stage);
      const offRows = enableRows(stage);
      return () => { offSort?.(); offRows?.(); };
    },
  });

  const linksTab = {
    name: 'Links',
    render() {
      return `<div class="screen reg" data-testid="registry-links"><div data-lr-kpis>${kpis(linksKpis(getSnapshot()))}</div><div class="card lr-host" data-lr-host></div></div>`;
    },
    mount(stage) {
      const host = stage.querySelector('[data-lr-host]');
      const kpiHost = stage.querySelector('[data-lr-kpis]');
      const select = pendingLink.id ? { id: pendingLink.id, status: pendingLink.status } : null;
      pendingLink.id = null;
      const lr = mountLinkReview(host, { repo, flags, select, asOf: getSnapshot().asOf, keep: (l) => getSnapshot().linkInScope(l) });
      // The KPI cards above the review screen follow every decision: boot.js rebuilds the snapshot after each
      // repository change and then tells its listeners.
      const off = subscribeSnapshot(() => { kpiHost.innerHTML = kpis(linksKpis(getSnapshot())); });
      return () => { off(); lr.destroy(); };
    },
  };

  return [...CATEGORIES.map(categoryTab), linksTab];
}
