// "ERP records awaiting a match", at the top of the Links tab while the ERP source is on. An ERP work order or maintenance plan whose
// functional location matches no asset in the registry is held back here. The resemblance matcher (the same signals as duplicate review)
// suggests the assets it looks like; a person links the record to one of them, or ignores it. Nothing is linked automatically.

import { h, replace } from '../ui/dom.js';
import { experimentalBadge } from './badge.js';

const KIND = { tower: 'tower', power_transformer: 'transformer', other: 'other equipment' };

/** @param {HTMLElement} host  @param {{repo: any}} deps  @returns {() => void} dispose */
export function mountErpRecords(host, { repo }) {
  if (repo.source !== 'erp') { host.hidden = true; return () => {}; }
  let alive = true;

  async function draw() {
    const rows = await repo.getErpUnmatched();
    if (!alive) return;
    const open = rows.filter((r) => r.status === 'open');
    host.hidden = false;
    replace(host,
      h('h3', {}, `ERP records awaiting a match (${open.length})`),
      h('p', { class: 'a360-muted a360-small' }, 'These ERP locations have no asset in the registry with the same SAP functional location or equipment number. Their work orders and plans stay out of every screen until a person links them. The suggestions come from the resemblance matcher.', ' ', experimentalBadge('resemblance')),
      rows.length ? rows.map(row) : h('p', { class: 'a360-muted', 'data-testid': 'erp-none' }, 'Every ERP location matched an asset.'));
  }

  const row = (r) => h('div', { class: 'erp-rec', 'data-testid': 'erp-record', 'data-key': r.key, 'data-status': r.status },
    h('div', {}, h('b', {}, r.name), h('div', { class: 'a360-muted a360-small' }, `${r.key} · ${KIND[r.class] ?? r.class}${r.voltage_kv ? ` · ${r.voltage_kv} kV` : ''}`),
      h('div', { class: 'a360-muted a360-small' }, `${r.workOrders} work order${r.workOrders === 1 ? '' : 's'}${r.maintenancePlans ? ` · ${r.maintenancePlans} plan${r.maintenancePlans === 1 ? '' : 's'}` : ''} held back`)),
    r.status === 'open' ? h('div', {}, r.candidates.length ? r.candidates.map((c) => h('div', { class: 'erp-cand', 'data-testid': 'erp-candidate' },
      h('span', { class: 'erp-score' }, c.score.toFixed(2)), h('span', {}, c.name, h('span', { class: 'a360-muted a360-small' }, ` ${c.asset_id}`)),
      h('span', { class: 'a360-muted a360-small', title: c.reasons.map((x) => `${x.signal} ${x.value}: ${x.detail}`).join('\n') }, c.reasons.map((x) => `${x.signal} ${x.value}`).join(' · ')),
      h('button', { class: 'lr-btn lr-primary', type: 'button', 'data-testid': 'erp-link', onClick: async () => { await repo.confirmErpMatch(r.key, c.asset_id); draw(); } }, `Link to ${c.name}`)))
      : h('p', { class: 'a360-muted a360-small', 'data-testid': 'erp-no-candidate' }, 'No asset of this kind looks like it. Ignore it, or add the asset to the registry first.'))
      : h('div', { class: 'erp-done', 'data-testid': 'erp-decided' }, r.status === 'matched' ? `Linked to ${r.matched}. Its work orders now belong to that asset.` : 'Ignored.'),
    h('div', {}, r.status === 'open'
      ? h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'erp-ignore', onClick: async () => { await repo.ignoreErpRecord(r.key); draw(); } }, 'Ignore')
      : h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'erp-reopen', onClick: async () => { await repo.reopenErpRecord(r.key); draw(); } }, 'Undo')));

  draw();
  return () => { alive = false; };
}
