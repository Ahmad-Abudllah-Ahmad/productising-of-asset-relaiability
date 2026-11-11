// Link Review screen: a queue of proposed links, a side-by-side view of both records with the reasons
// behind the score, and accept / reject / merge with keyboard shortcuts. An audit log sits underneath.
//
// States handled: loading (skeleton), error (message and Retry), empty queue, empty filter result.

import { h, replace, fmt } from './dom.js';
import { loadItems, loadCounts, resolveEnd, sideBySide, reasonsOf, mergeCheck, scoreBand, thresholds, STATUS_OPTIONS, TYPE_LABELS } from './linkReviewModel.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typing = (el) => el && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable);

/**
 * @param {HTMLElement} root
 * @param {{repo: any, flags?: {delay?: number, fail?: boolean}, onBadge?: (n: number) => void}} deps
 * @returns {{destroy: () => void}}
 */
export function mountLinkReview(root, { repo, flags = {}, onBadge = () => {} }) {
  const state = {
    status: 'proposed', type: 'all', items: null, counts: null, labels: new Map(), selected: null, detail: null,
    audit: [], loading: true, error: null, confirmReset: false, toast: '', help: false,
  };
  let request = 0;
  let destroyed = false;
  let toastTimer = null;
  const detailCache = new Map();

  // ------------------------------------------------------------------ data

  async function load({ quiet = false } = {}) {
    const mine = ++request;
    if (!quiet) { state.loading = true; state.error = null; draw(); }
    try {
      if (flags.delay) await sleep(flags.delay);
      if (flags.fail) throw new Error('The link service did not respond (simulated failure).');
      const [counts, items, audit] = await Promise.all([loadCounts(repo), loadItems(repo, { status: state.status, type: state.type }), repo.getAuditLog()]);
      if (mine !== request || destroyed) return;
      state.counts = counts;
      state.items = items;
      state.audit = audit;
      onBadge(counts.byStatus.proposed ?? 0);
      const ends = await Promise.all(items.slice(0, 300).flatMap((l) => [resolveEnd(repo, l.from_asset, l.from_kind ?? 'asset'), resolveEnd(repo, l.to_asset, l.to_kind ?? 'asset')]));
      if (mine !== request || destroyed) return;
      state.labels = new Map(ends.map((e) => [e.id, e.record ? (e.kind === 'finding' ? `${e.record.finding_id} ${e.record.defect_class}` : e.record.name) : e.id]));
      if (!items.some((l) => l.link_id === state.selected)) state.selected = items[Math.min(state.lastIndex ?? 0, items.length - 1)]?.link_id ?? null;
      state.error = null;
      await loadDetail();
    } catch (e) {
      if (mine !== request || destroyed) return;
      state.error = e;
    } finally {
      if (mine === request && !destroyed) { state.loading = false; draw(); }
    }
  }

  async function loadDetail() {
    const link = state.items?.find((l) => l.link_id === state.selected);
    if (!link) { state.detail = null; return; }
    const key = `${link.link_id}|${link.status}|${link.merged ?? ''}`;
    if (!detailCache.has(key)) {
      const [a, b] = await Promise.all([resolveEnd(repo, link.from_asset, link.from_kind ?? 'asset'), resolveEnd(repo, link.to_asset, link.to_kind ?? 'asset')]);
      detailCache.set(key, { link, a, b, rows: sideBySide(a, b), why: reasonsOf(link), merge: mergeCheck(link, a, b) });
    }
    state.detail = detailCache.get(key);
  }

  const index = () => (state.items ?? []).findIndex((l) => l.link_id === state.selected);

  async function select(id) {
    state.selected = id;
    state.lastIndex = Math.max(0, index());
    try { await loadDetail(); } catch (e) { state.error = e; }
    draw();
    root.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function move(delta) {
    const list = state.items ?? [];
    if (!list.length) return;
    const next = Math.max(0, Math.min(list.length - 1, (index() < 0 ? 0 : index()) + delta));
    select(list[next].link_id);
  }

  function toast(text) {
    state.toast = text;
    drawToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; drawToast(); }, 4000);
  }

  async function act(kind) {
    const d = state.detail;
    if (!d || state.busy) return;
    state.lastIndex = Math.max(0, index());
    try {
      state.busy = true;
      if (kind === 'accept') { await repo.confirmLink(d.link.link_id); toast(`Accepted ${d.link.link_id}`); }
      else if (kind === 'reject') { await repo.rejectLink(d.link.link_id); toast(`Rejected ${d.link.link_id}`); }
      else if (kind === 'merge') {
        if (!d.merge.ok) { toast(d.merge.reason); return; }
        await repo.mergeAssets({ from: d.link.from_asset, into: d.link.to_asset, link_id: d.link.link_id });
        toast(`Merged ${d.link.from_asset} into ${d.link.to_asset}`);
      }
    } catch (e) {
      toast(`Could not ${kind}: ${e.message}`);
    } finally {
      state.busy = false;
    }
  }

  // The repository tells us after every write; reload quietly so the queue, counts and log stay true.
  const unsubscribe = repo.subscribe(() => { detailCache.clear(); load({ quiet: true }); });

  // -------------------------------------------------------------- keyboard

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); move(-1); }
    else if (k === 'a') act('accept');
    else if (k === 'r') act('reject');
    else if (k === 'm') act('merge');
    else if (k === '?') { state.help = !state.help; drawHelp(); }
    else if (k === 'Escape' && state.help) { state.help = false; drawHelp(); }
  }
  document.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------ view

  const el = {
    status: h('select', { id: 'lr-status', 'aria-label': 'Status', onChange: (e) => { state.status = e.target.value; state.selected = null; load(); } }),
    type: h('select', { id: 'lr-type', 'aria-label': 'Link type', onChange: (e) => { state.type = e.target.value; state.selected = null; load(); } }),
    summary: h('p', { class: 'muted lr-summary', 'aria-live': 'polite' }),
    reset: h('span', { class: 'lr-reset' }),
    queue: h('div', { class: 'lr-queue', role: 'listbox', tabindex: '0', 'aria-label': 'Link queue, sorted by score' }),
    detail: h('div', { class: 'lr-detail' }),
    audit: h('div', { class: 'lr-audit-body' }),
    toast: h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }),
    help: h('div', { class: 'lr-help', role: 'dialog', 'aria-label': 'Keyboard shortcuts', hidden: true }),
  };

  const head = h('header', { class: 'lr-head' },
    h('div', {},
      h('h1', { id: 'lr-title' }, 'Link Review'),
      h('p', { class: 'muted' }, 'Proposed links, highest score first. Accept or reject each one, or merge duplicate records.')),
    h('div', { class: 'lr-tools' },
      h('label', {}, 'Status', el.status),
      h('label', {}, 'Link type', el.type),
      h('button', { class: 'btn', type: 'button', onClick: () => { state.help = !state.help; drawHelp(); } }, 'Shortcuts ', h('kbd', {}, '?')),
      el.reset),
    el.summary);

  const auditBox = h('details', { class: 'lr-audit', open: true }, h('summary', {}, 'Audit log'), el.audit);
  replace(root, h('section', { class: 'lr', 'aria-labelledby': 'lr-title' }, head, h('div', { class: 'lr-body' }, el.queue, el.detail), auditBox, el.toast, el.help));

  function drawFilters() {
    const c = state.counts;
    replace(el.status, STATUS_OPTIONS.map(([v, label]) => h('option', { value: v, selected: v === state.status }, `${label}${c ? ` (${c.byStatus[v] ?? 0})` : ''}`)));
    const types = ['all', ...Object.keys(c?.byType ?? {}).filter((t) => t !== 'all')];
    replace(el.type, types.map((t) => h('option', { value: t, selected: t === state.type }, `${t === 'all' ? 'All types' : TYPE_LABELS[t] ?? t}${c ? ` (${c.byType[t] ?? 0})` : ''}`)));
  }

  function drawReset() {
    replace(el.reset, state.confirmReset
      ? [h('span', { class: 'muted' }, 'Clear every decision and merge? '),
        h('button', { class: 'btn danger', type: 'button', onClick: async () => { state.confirmReset = false; await repo.resetDemoData(); toast('Demo data reset'); } }, 'Yes, reset'),
        h('button', { class: 'btn', type: 'button', onClick: () => { state.confirmReset = false; drawReset(); } }, 'Cancel')]
      : h('button', { class: 'btn', type: 'button', onClick: () => { state.confirmReset = true; drawReset(); } }, 'Reset demo data'));
  }

  function drawQueue() {
    el.queue.setAttribute('aria-busy', String(state.loading));
    if (state.loading && !state.items) {
      replace(el.queue, Array.from({ length: 7 }, () => h('div', { class: 'skeleton row' })));
      return;
    }
    const items = state.items ?? [];
    if (!items.length) {
      const filtered = state.status !== 'proposed' || state.type !== 'all';
      replace(el.queue, h('div', { class: 'empty', role: 'status', 'data-testid': 'queue-empty' },
        h('h2', {}, filtered ? 'No links match these filters' : 'The queue is empty'),
        h('p', { class: 'muted' }, filtered ? 'Try another status or link type.' : 'Every proposed link has been decided. Nothing is waiting for review.'),
        filtered ? h('button', { class: 'btn', type: 'button', onClick: () => { state.status = 'proposed'; state.type = 'all'; load(); } }, 'Show awaiting review')
          : h('button', { class: 'btn', type: 'button', onClick: () => { state.status = 'all'; load(); } }, 'Show all links')));
      return;
    }
    replace(el.queue, items.map((l) => {
      const on = l.link_id === state.selected;
      const band = scoreBand(l.confidence);
      return h('div', {
        class: `row${on ? ' on' : ''}`, role: 'option', id: `row-${l.link_id}`, 'aria-selected': String(on), 'data-testid': 'queue-row', dataset: { link: l.link_id, status: l.status },
        onClick: () => select(l.link_id),
      },
      h('span', { class: `score ${band}` }, l.confidence.toFixed(2)),
      h('span', { class: 'who' },
        h('span', { class: 'pair' }, state.labels.get(l.from_asset) ?? l.from_asset, ' ↔ ', state.labels.get(l.to_asset) ?? l.to_asset),
        h('span', { class: 'muted small' }, `${TYPE_LABELS[l.type] ?? l.type} · ${(l.relation ?? '').replace(/_/g, ' ')} · ${l.link_id}`)),
      h('span', { class: `chip ${l.status}` }, l.status === 'proposed' ? 'review' : l.status));
    }));
  }

  const track = (score) => {
    const t = thresholds();
    return h('span', { class: 'track', role: 'img', 'aria-label': `score ${score.toFixed(2)}; review from ${t.drop}, automatic from ${t.auto}` },
      h('span', { class: 'fill', style: { width: `${Math.round(score * 100)}%` } }),
      h('span', { class: 'mark', style: { left: `${t.drop * 100}%` }, title: `review from ${t.drop}` }),
      h('span', { class: 'mark', style: { left: `${t.auto * 100}%` }, title: `automatic from ${t.auto}` }));
  };

  function endCard(end, title) {
    const r = end.record;
    const img = end.kind === 'finding' && end.capture?.image
      ? h('div', { class: 'thumb' },
        h('img', { src: end.capture.image, alt: `Capture ${end.capture.capture_id}, ${r.defect_class}`, loading: 'lazy' }),
        r.bbox ? h('span', { class: 'box', style: { left: `${r.bbox.x * 100}%`, top: `${r.bbox.y * 100}%`, width: `${r.bbox.w * 100}%`, height: `${r.bbox.h * 100}%` }, title: `confidence ${r.confidence}` }) : null)
      : null;
    return h('div', { class: 'card' }, h('h3', {}, title), img);
  }

  function drawDetail() {
    const d = state.detail;
    if (state.loading && !d) { replace(el.detail, h('div', { class: 'skeleton block' }), h('div', { class: 'skeleton block' })); return; }
    if (!d) { replace(el.detail, h('div', { class: 'empty' }, h('p', { class: 'muted' }, state.items?.length ? 'Select a link to compare its records.' : 'Nothing selected.'))); return; }
    const { link, a, b, rows, why, merge } = d;
    const done = link.status !== 'proposed';
    const locked = Boolean(link.merged || link.obsolete);
    const aTitle = link.relation === 'duplicate_of' ? `A · duplicate record (merged away)` : link.from_kind === 'finding' ? 'A · newer sighting' : 'A';
    const bTitle = link.relation === 'duplicate_of' ? `B · record kept (system of record)` : link.to_kind === 'finding' ? 'B · older sighting' : 'B';
    replace(el.detail,
      h('div', { class: 'summary' },
        h('div', { class: `bigscore ${scoreBand(link.confidence)}` }, link.confidence.toFixed(2)),
        h('div', {},
          h('div', {}, track(link.confidence)),
          h('p', { class: 'muted' }, `${scoreBand(link.confidence) === 'review' ? 'In the review band' : scoreBand(link.confidence) === 'auto-link' ? 'At or above the automatic threshold' : 'Below the review band'} · ${TYPE_LABELS[link.type] ?? link.type} · ${link.link_id} · ${link.source}`),
          h('span', { class: `chip ${link.status}` }, link.merged ? 'merged' : link.status),
          link.decided_at ? h('span', { class: 'muted small' }, ` by ${link.confirmed_by ?? '-'} at ${fmt.time(link.decided_at)}`) : null),
        h('div', { class: 'actions', role: 'group', 'aria-label': 'Decide' },
          h('button', { class: 'btn primary', type: 'button', 'data-testid': 'accept', disabled: locked || link.status === 'confirmed' || state.busy, onClick: () => act('accept') }, 'Accept ', h('kbd', {}, 'a')),
          h('button', { class: 'btn danger', type: 'button', 'data-testid': 'reject', disabled: locked || link.status === 'rejected' || state.busy, onClick: () => act('reject') }, 'Reject ', h('kbd', {}, 'r')),
          h('button', { class: 'btn', type: 'button', 'data-testid': 'merge', disabled: !merge.ok || state.busy, title: merge.reason, onClick: () => act('merge') }, 'Merge ', h('kbd', {}, 'm')))),
      done && !link.merged ? h('p', { class: 'muted small' }, `Already ${link.status}. You can still change the decision${link.relation === 'duplicate_of' ? ' or merge' : ''}.`) : null,
      h('div', { class: 'sbs' },
        endCard(a, aTitle), endCard(b, bTitle),
        h('table', { class: 'grid', 'data-testid': 'compare' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'A'), h('th', {}, 'B'))),
          h('tbody', {}, rows.map((r) => h('tr', { class: r.same ? '' : 'diff' }, h('th', { scope: 'row' }, r.label), h('td', {}, String(r.a)), h('td', {}, String(r.b))))))),
      h('p', { class: 'muted small' }, 'Highlighted rows differ between the two records.'),
      h('h3', {}, 'Why this score'),
      h('table', { class: 'grid reasons', 'data-testid': 'reasons' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Match'), h('th', {}, 'Weight'), h('th', {}, 'Contribution'), h('th', {}, 'Detail'))),
        h('tbody', {}, why.reasons.map((r) => h('tr', {},
          h('th', { scope: 'row' }, r.signal, r.signal === 'visual' ? h('span', { class: 'chip stub', title: 'Seeded feature vectors, not an image model' }, 'stub') : null),
          h('td', {}, h('span', { class: 'bar' }, h('span', { style: { width: `${Math.round(r.value * 100)}%` } })), ' ', fmt.score(r.value)),
          h('td', {}, String(r.weight)),
          h('td', {}, `+${fmt.score(r.contribution)}`),
          h('td', { class: 'small' }, r.detail)))),
        h('tfoot', {}, h('tr', {}, h('th', { colspan: '3' }, 'Score'), h('td', {}, fmt.score(link.confidence)), h('td', {}, '')))),
      why.notes.map((n) => h('p', { class: 'note' }, n)));
  }

  function drawAudit() {
    const rows = state.audit.slice(0, 40);
    if (!rows.length) { replace(el.audit, h('p', { class: 'muted empty-note' }, 'No decisions yet.')); return; }
    replace(el.audit, h('table', { class: 'grid', 'data-testid': 'audit' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Who'), h('th', {}, 'Action'), h('th', {}, 'Detail'))),
      h('tbody', {}, rows.map((e) => h('tr', {}, h('td', {}, fmt.time(e.at)), h('td', {}, e.actor), h('td', {}, e.action.replace('_', '-')), h('td', {}, e.detail))))));
  }

  function drawToast() { el.toast.textContent = state.toast; el.toast.classList.toggle('show', Boolean(state.toast)); }

  function drawHelp() {
    el.help.hidden = !state.help;
    if (!state.help) return;
    replace(el.help, h('h2', {}, 'Keyboard shortcuts'),
      h('dl', {}, [['j / ↓', 'Next link'], ['k / ↑', 'Previous link'], ['a', 'Accept'], ['r', 'Reject'], ['m', 'Merge duplicate records'], ['?', 'Show or hide this list'], ['Esc', 'Close']].flatMap(([k, t]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, t)])),
      h('button', { class: 'btn', type: 'button', onClick: () => { state.help = false; drawHelp(); } }, 'Close'));
  }

  function draw() {
    if (destroyed) return;
    drawFilters();
    drawReset();
    drawAudit();
    drawToast();
    drawHelp();
    el.summary.textContent = state.items ? `${state.items.length} shown · ${state.counts?.byStatus.proposed ?? 0} awaiting review` : state.loading ? 'Loading links...' : '';
    if (state.error) {
      replace(el.queue, h('div', { class: 'error', role: 'alert', 'data-testid': 'error' },
        h('h2', {}, 'Could not load the links'),
        h('p', {}, state.error.message || String(state.error)),
        h('button', { class: 'btn primary', type: 'button', onClick: () => { flags.fail = false; load(); } }, 'Retry')));
      replace(el.detail);
      return;
    }
    drawQueue();
    drawDetail();
  }

  draw();
  load();

  return {
    destroy() {
      destroyed = true;
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      clearTimeout(toastTimer);
    },
  };
}
