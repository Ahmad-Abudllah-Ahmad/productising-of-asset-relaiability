// The Asset Registry tabs: six category tabs (lines, towers, spans, components, substations, transformers)
// and Links, which hosts the Link Review screen. Markup reuses the legacy look: KPI cards, tags, the filter
// column, the table card. The legacy shell turns every select in the screen into a row filter by matching the
// value against each row's data-zone, so the filter column here needs no code of its own.

import { CATEGORIES, tableFor, filtersFor, kpisFor, linksKpis } from './registryModel.js';
import { mountLinkReview } from '../ui/linkReview.js';

/**
 * @param {{kit: any, repo: any, getSnapshot: () => any, subscribeSnapshot: (fn: () => void) => (() => void), flags?: object}} deps
 * @returns {Array<{name: string, render: () => string, mount?: (stage: HTMLElement) => (() => void)|void}>}
 */
export function createRegistryTabs({ kit, repo, getSnapshot, subscribeSnapshot, flags = {} }) {
  const { esc, tip, kpis } = kit;

  const tag = (c) => (c.tone ? `<span class="tag ${esc(c.tone)}">${esc(c.text)}</span>` : esc(c.text));

  function filterColumn(groups) {
    const blocks = groups.map((g) => `<div class="filter-label">${esc(g.group)}</div>${g.selects.map((s) =>
      `<label>${esc(s.label)}<select aria-label="${esc(s.label)}"><option value="All">All</option>${s.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`).join('')}`).join('');
    return `<aside class="filter-col"><div class="filter-head"><b>Filter</b><button class="linkish clear-filters" type="button">Clear</button></div>${blocks}<div class="banner" data-banner>All</div></aside>`;
  }

  function tableHtml(columns, rows) {
    const head = `<tr>${columns.map((c, i) => `<th scope="col" tabindex="0" data-col="${i}" aria-sort="none">${esc(c)}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr${tip(r.tip)} data-asset="${esc(r.id)}" data-zone="${esc(r.zone)}">${r.cells.map((c) => `<td data-v="${esc(c.sort)}">${tag(c)}</td>`).join('')}</tr>`).join('');
    return `<table class="reg-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  /** Click or Enter on a column heading sorts the rows. Rows hidden by a filter stay hidden. */
  function enableSorting(stage) {
    const table = stage.querySelector('table.reg-table');
    if (!table) return undefined;
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
      const { columns, rows } = tableFor(snap, cat.id);
      return `<div class="screen desk reg" data-testid="registry-${cat.id}">${filterColumn(filtersFor(cat.id, rows))}<div class="desk-main">${kpis(kpisFor(snap, cat.id))}` +
        `<div class="card table-card">${tableHtml(columns, rows)}<div class="empty-note">Nothing matches these filters. Choose All to restore the list.</div></div></div></div>`;
    },
    mount: enableSorting,
  });

  const linksTab = {
    name: 'Links',
    render() {
      return `<div class="screen reg" data-testid="registry-links"><div data-lr-kpis>${kpis(linksKpis(getSnapshot()))}</div><div class="card lr-host" data-lr-host></div></div>`;
    },
    mount(stage) {
      const host = stage.querySelector('[data-lr-host]');
      const kpiHost = stage.querySelector('[data-lr-kpis]');
      const lr = mountLinkReview(host, { repo, flags });
      // The KPI cards above the review screen follow every decision: boot.js rebuilds the snapshot after each
      // repository change and then tells its listeners.
      const off = subscribeSnapshot(() => { kpiHost.innerHTML = kpis(linksKpis(getSnapshot())); });
      return () => { off(); lr.destroy(); };
    },
  };

  return [...CATEGORIES.map(categoryTab), linksTab];
}
