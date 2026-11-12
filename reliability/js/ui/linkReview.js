// Link Review, hosted by the Links tab of the Asset Registry.
// A queue of proposed links (highest score first), a side-by-side view of both records with every reason
// behind the score, accept / reject / merge with keyboard shortcuts, and an audit log.
// States: loading (skeleton rows), error (message and Retry), empty queue, empty filter result.
// All classes are prefixed lr- so nothing here collides with the legacy page styles (see reliability.css).

import { evidenceOf } from '../app/evidence.js';
import { h, replace, fmt } from './dom.js';
import { loadItems, loadCounts, resolveEnd, sideBySide, reasonsOf, mergeCheck, scoreBand, thresholds, STATUS_OPTIONS, TYPE_LABELS } from './linkReviewModel.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typing = (el) => el && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable);
const STATUS_TONE = { proposed: 'a', confirmed: 'g', rejected: 'r', merged: 'b' };
const BAND_CLASS = { 'auto-link': 'is-auto', review: 'is-review', dropped: 'is-drop' };

/**
 * @param {HTMLElement} root
 * @param {{repo: any, flags?: {delay?: number, fail?: boolean}, select?: {id: string, status?: string}|null}} deps
 *   keep: (link) => boolean, the global filters: only links that pass are listed and counted
 *   select: a link to show first (the Links tab is opened from a "possible duplicate" chip)
 * @returns {{destroy: () => void}}
 */
export function mountLinkReview(root, { repo, flags = {}, select: first = null, keep = () => true }) {
  const state = {
    view: 'review', status: first?.status === 'confirmed' ? 'confirmed' : 'proposed', type: 'all', items: null, counts: null, labels: new Map(), selected: first?.id ?? null, detail: null,
    audit: [], loading: true, error: null, confirmReset: false, toast: '', help: false, busy: false, lastIndex: 0,
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
      const [counts, items, audit] = await Promise.all([loadCounts(repo, keep), loadItems(repo, { status: state.status, type: state.type, keep }), repo.getAuditLog()]);
      if (mine !== request || destroyed) return;
      state.counts = counts;
      state.items = items;
      state.audit = audit;
      const ends = await Promise.all(items.slice(0, 300).flatMap((l) => [resolveEnd(repo, l.from_asset, l.from_kind ?? 'asset'), resolveEnd(repo, l.to_asset, l.to_kind ?? 'asset')]));
      if (mine !== request || destroyed) return;
      state.labels = new Map(ends.map((e) => [e.id, e.record ? (e.kind === 'finding' ? `${e.record.finding_id} ${e.record.defect_class.replace(/_/g, ' ')}` : e.record.name) : e.id]));
      if (!items.some((l) => l.link_id === state.selected)) state.selected = items[Math.min(state.lastIndex, items.length - 1)]?.link_id ?? null;
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
    el.queue.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function move(delta) {
    const list = state.items ?? [];
    if (!list.length || state.view !== 'review') return;
    select(list[Math.max(0, Math.min(list.length - 1, (index() < 0 ? 0 : index()) + delta))].link_id);
  }

  function toast(text) {
    state.toast = text;
    drawToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; drawToast(); }, 4000);
  }

  async function act(kind) {
    const d = state.detail;
    if (!d || state.busy || state.view !== 'review') return;
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
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.body.classList.contains('a360-open') || document.body.classList.contains('fv-open')) return;
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
    status: h('select', { 'aria-label': 'Status', onChange: (e) => { state.status = e.target.value; state.selected = null; load(); } }),
    type: h('select', { 'aria-label': 'Link type', onChange: (e) => { state.type = e.target.value; state.selected = null; load(); } }),
    count: h('span', { class: 'lr-count lr-muted', 'aria-live': 'polite' }),
    seg: h('span', { class: 'lr-seg', role: 'group', 'aria-label': 'View' }),
    reset: h('span', { class: 'lr-reset' }),
    filters: h('span', { class: 'lr-filters' }),
    queue: h('div', { class: 'lr-queue', role: 'listbox', tabindex: '0', 'aria-label': 'Link queue, sorted by score' }),
    detail: h('div', { class: 'lr-detail' }),
    audit: h('div', { class: 'lr-audit', hidden: true, 'data-testid': 'audit-view' }),
    body: h('div', { class: 'lr-body' }),
    toast: h('div', { class: 'lr-toast', role: 'status', 'aria-live': 'polite' }),
    help: h('div', { class: 'lr-help', role: 'dialog', 'aria-label': 'Keyboard shortcuts', hidden: true }),
  };
  el.filters.append(h('label', {}, 'Status ', el.status), h('label', {}, 'Link type ', el.type));
  replace(el.body, el.queue, el.detail);
  replace(root, h('div', { class: 'lr' },
    h('div', { class: 'lr-bar' }, el.seg, el.filters, el.count, h('span', { class: 'lr-spacer' }),
      h('button', { class: 'lr-btn', type: 'button', onClick: () => { state.help = !state.help; drawHelp(); } }, 'Shortcuts ', h('kbd', {}, '?')), el.reset),
    el.body, el.audit, el.toast, el.help));

  function drawBar() {
    const c = state.counts;
    replace(el.status, STATUS_OPTIONS.map(([v, label]) => h('option', { value: v, selected: v === state.status }, `${label}${c ? ` (${c.byStatus[v] ?? 0})` : ''}`)));
    const types = ['all', ...Object.keys(c?.byType ?? {}).filter((t) => t !== 'all')];
    replace(el.type, types.map((t) => h('option', { value: t, selected: t === state.type }, `${t === 'all' ? 'All types' : TYPE_LABELS[t] ?? t}${c ? ` (${c.byType[t] ?? 0})` : ''}`)));
    replace(el.seg, [['review', 'Review'], ['audit', `Audit log${state.audit.length ? ` (${state.audit.length})` : ''}`]].map(([v, label]) =>
      h('button', { class: `lr-btn${state.view === v ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(state.view === v), 'data-view': v, onClick: () => { state.view = v; draw(); } }, label)));
    el.filters.hidden = state.view !== 'review';
    el.count.textContent = state.items ? `${state.items.length} shown · ${state.counts?.byStatus.proposed ?? 0} awaiting review` : state.loading ? 'Loading links...' : '';
  }

  function drawReset() {
    replace(el.reset, state.confirmReset
      ? [h('span', { class: 'lr-muted' }, 'Clear every decision and merge? '),
        h('button', { class: 'lr-btn lr-danger', type: 'button', onClick: async () => { state.confirmReset = false; await repo.resetDemoData(); toast('Demo data reset'); } }, 'Yes, reset'),
        h('button', { class: 'lr-btn', type: 'button', onClick: () => { state.confirmReset = false; drawReset(); } }, 'Cancel')]
      : h('button', { class: 'lr-btn', type: 'button', onClick: () => { state.confirmReset = true; drawReset(); } }, 'Reset demo data'));
  }

  function drawQueue() {
    el.queue.setAttribute('aria-busy', String(state.loading));
    if (state.loading && !state.items) { replace(el.queue, Array.from({ length: 7 }, () => h('div', { class: 'lr-skel lr-skel-row' }))); return; }
    const items = state.items ?? [];
    if (!items.length) {
      const filtered = state.status !== 'proposed' || state.type !== 'all';
      replace(el.queue, h('div', { class: 'lr-empty', role: 'status', 'data-testid': 'queue-empty' },
        h('h3', {}, filtered ? 'No links match these filters' : 'The queue is empty'),
        h('p', { class: 'lr-muted' }, filtered ? 'Try another status or link type.' : 'Every proposed link has been decided. Nothing is waiting for review.'),
        h('button', { class: 'lr-btn', type: 'button', onClick: () => { state.status = filtered ? 'proposed' : 'all'; state.type = 'all'; load(); } }, filtered ? 'Show awaiting review' : 'Show all links')));
      return;
    }
    replace(el.queue, items.map((l) => {
      const on = l.link_id === state.selected;
      return h('div', { class: `lr-row${on ? ' is-on' : ''}`, role: 'option', 'aria-selected': String(on), 'data-testid': 'queue-row', dataset: { link: l.link_id, status: l.status }, onClick: () => select(l.link_id) },
        h('span', { class: `lr-score ${BAND_CLASS[scoreBand(l.confidence)]}` }, l.confidence.toFixed(2)),
        h('span', { class: 'lr-who' },
          h('span', { class: 'lr-pair' }, state.labels.get(l.from_asset) ?? l.from_asset, ' ↔ ', state.labels.get(l.to_asset) ?? l.to_asset),
          h('span', { class: 'lr-muted lr-small' }, `${TYPE_LABELS[l.type] ?? l.type} · ${(l.relation ?? '').replace(/_/g, ' ')} · ${l.link_id}`)),
        h('span', { class: `tag ${STATUS_TONE[l.status]}` }, l.status === 'proposed' ? 'review' : l.status));
    }));
  }

  const meter = (score) => {
    const t = thresholds();
    return h('span', { class: 'lr-meter', role: 'img', 'aria-label': `score ${score.toFixed(2)}; review from ${t.drop}, automatic from ${t.auto}` },
      h('span', { class: 'lr-fill', style: { width: `${Math.round(score * 100)}%` } }),
      h('span', { class: 'lr-mark', style: { left: `${t.drop * 100}%` }, title: `review from ${t.drop}` }),
      h('span', { class: 'lr-mark', style: { left: `${t.auto * 100}%` }, title: `automatic from ${t.auto}` }));
  };

  function endCard(end, title) {
    const r = end.record;
    const ev = end.kind === 'finding' ? evidenceOf(r, end.capture) : null;
    const img = ev && (ev.image || ev.kind === 'placeholder')
      ? h('button', { class: 'lr-thumb', type: 'button', style: ev.native ? { maxWidth: `${Math.min(340, ev.native.w)}px`, aspectRatio: `${ev.native.w} / ${ev.native.h}` } : {}, 'data-finding': r.finding_id, title: `Open the finding viewer (${ev.kind === 'reference' ? 'reference photo, not from this asset' : ev.kind === 'inspection' ? 'inspection image' : 'demo image'})`, 'aria-label': `Open finding ${r.finding_id}`, onClick: (ev) => window.NexusReliability?.openFinding?.(r.finding_id, { opener: ev.currentTarget }) },
        ev.image ? h('img', { src: ev.image, alt: `Capture ${end.capture.capture_id}, ${r.defect_class.replace(/_/g, ' ')}`, loading: 'lazy' }) : h('span', { class: 'lr-ph' }, 'Placeholder – no real image yet'),
        ev.bbox && ev.image ? h('span', { class: 'lr-box', style: { left: `${ev.bbox.x * 100}%`, top: `${ev.bbox.y * 100}%`, width: `${ev.bbox.w * 100}%`, height: `${ev.bbox.h * 100}%` }, title: `confidence ${r.confidence}` }) : null,
        h('span', { class: 'lr-demo' }, ev.short))
      : null;
    return h('div', { class: 'lr-card' }, h('h4', {}, title), img);
  }

  function drawDetail() {
    const d = state.detail;
    if (state.loading && !d) { replace(el.detail, h('div', { class: 'lr-skel lr-skel-block' }), h('div', { class: 'lr-skel lr-skel-block' })); return; }
    if (!d) { replace(el.detail, h('div', { class: 'lr-empty' }, h('p', { class: 'lr-muted' }, state.items?.length ? 'Select a link to compare its records.' : 'Nothing selected.'))); return; }
    const { link, a, b, rows, why, merge } = d;
    const locked = Boolean(link.merged || link.obsolete);
    const band = scoreBand(link.confidence);
    const aTitle = link.relation === 'duplicate_of' ? 'A · duplicate record (merged away)' : link.from_kind === 'finding' ? 'A · newer sighting' : 'A';
    const bTitle = link.relation === 'duplicate_of' ? 'B · record kept (system of record)' : link.to_kind === 'finding' ? 'B · older sighting' : 'B';
    replace(el.detail,
      h('div', { class: 'lr-summary' },
        h('div', { class: `lr-bigscore ${BAND_CLASS[band]}` }, link.confidence.toFixed(2)),
        h('div', {},
          meter(link.confidence),
          h('p', { class: 'lr-muted lr-small' }, `${band === 'review' ? 'In the review band' : band === 'auto-link' ? 'At or above the automatic threshold' : 'Below the review band'} · ${TYPE_LABELS[link.type] ?? link.type} · ${link.link_id} · ${link.source}`),
          h('span', { class: `tag ${STATUS_TONE[link.merged ? 'merged' : link.status]}` }, link.merged ? 'merged' : link.status),
          link.decided_at ? h('span', { class: 'lr-muted lr-small' }, ` by ${link.confirmed_by ?? '-'} at ${fmt.time(link.decided_at)}`) : null),
        h('div', { class: 'lr-actions', role: 'group', 'aria-label': 'Decide' },
          h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'accept', disabled: locked || link.status === 'confirmed' || state.busy, onClick: () => act('accept') }, 'Accept ', h('kbd', {}, 'a')),
          h('button', { class: 'lr-btn lr-danger', type: 'button', 'data-testid': 'reject', disabled: locked || link.status === 'rejected' || state.busy, onClick: () => act('reject') }, 'Reject ', h('kbd', {}, 'r')),
          h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'merge', disabled: !merge.ok || state.busy, title: merge.reason, onClick: () => act('merge') }, 'Merge ', h('kbd', {}, 'm')))),
      h('div', { class: 'lr-sbs' },
        endCard(a, aTitle), endCard(b, bTitle),
        h('table', { class: 'lr-grid', 'data-testid': 'compare' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'A'), h('th', {}, 'B'))),
          h('tbody', {}, rows.map((r) => h('tr', { class: r.same ? '' : 'lr-diff' }, h('th', { scope: 'row' }, r.label), h('td', {}, String(r.a)), h('td', {}, String(r.b))))))),
      h('p', { class: 'lr-muted lr-small' }, 'Highlighted rows differ between the two records.'),
      h('h4', {}, 'Why this score'),
      h('table', { class: 'lr-grid lr-reasons', 'data-testid': 'reasons' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Match'), h('th', {}, 'Weight'), h('th', {}, 'Contribution'), h('th', {}, 'Detail'))),
        h('tbody', {}, why.reasons.map((r) => h('tr', {},
          h('th', { scope: 'row' }, r.signal, r.signal === 'visual' ? h('span', { class: 'tag a lr-stub', title: 'Seeded feature vectors, not an image model' }, 'stub') : null),
          h('td', {}, h('span', { class: 'lr-mini' }, h('span', { style: { width: `${Math.round(r.value * 100)}%` } })), ' ', fmt.score(r.value)),
          h('td', {}, String(r.weight)),
          h('td', {}, `+${fmt.score(r.contribution)}`),
          h('td', { class: 'lr-small' }, r.detail)))),
        h('tfoot', {}, h('tr', {}, h('th', { colspan: '3' }, 'Score'), h('td', {}, fmt.score(link.confidence)), h('td', {}, '')))),
      why.notes.map((n) => h('p', { class: 'lr-note' }, n)));
  }

  function drawAudit() {
    const rows = state.audit.slice(0, 60);
    if (!rows.length) { replace(el.audit, h('p', { class: 'lr-muted lr-pad' }, 'No decisions yet.')); return; }
    replace(el.audit, h('table', { class: 'lr-grid', 'data-testid': 'audit' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Who'), h('th', {}, 'Action'), h('th', {}, 'Detail'))),
      h('tbody', {}, rows.map((e) => h('tr', {}, h('td', {}, fmt.time(e.at)), h('td', {}, e.actor), h('td', {}, e.action.replace('_', '-')), h('td', {}, e.detail))))));
  }

  function drawToast() { el.toast.textContent = state.toast; el.toast.classList.toggle('is-show', Boolean(state.toast)); }

  function drawHelp() {
    el.help.hidden = !state.help;
    if (!state.help) return;
    replace(el.help, h('h3', {}, 'Keyboard shortcuts'),
      h('dl', {}, [['j / ↓', 'Next link'], ['k / ↑', 'Previous link'], ['a', 'Accept'], ['r', 'Reject'], ['m', 'Merge duplicate records'], ['?', 'Show or hide this list'], ['Esc', 'Close']].flatMap(([k, t]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, t)])),
      h('button', { class: 'lr-btn', type: 'button', onClick: () => { state.help = false; drawHelp(); } }, 'Close'));
  }

  function draw() {
    if (destroyed) return;
    drawBar();
    drawReset();
    drawAudit();
    drawToast();
    drawHelp();
    const review = state.view === 'review';
    el.body.hidden = !review;
    el.audit.hidden = review;
    if (state.error) {
      replace(el.queue, h('div', { class: 'lr-error', role: 'alert', 'data-testid': 'error' },
        h('h3', {}, 'Could not load the links'),
        h('p', {}, state.error.message || String(state.error)),
        h('button', { class: 'lr-btn lr-primary', type: 'button', onClick: () => { flags.fail = false; load(); } }, 'Retry')));
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
