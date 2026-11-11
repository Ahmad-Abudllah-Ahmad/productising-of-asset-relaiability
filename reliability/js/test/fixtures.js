// Small hand-built data sets for scoring tests. Numbers are chosen so expected values are easy to check.
//
// Line L1 (220 kV, criticality 4): towers T1..T4, spans S1 (T1-T2, 400 m) and S2 (T2-T3, 600 m).
//   T4 is never flown and has no findings. T2 owns insulator strings A and B, a damper and a foundation.
//   S1 owns a conductor and a corridor segment.
// Campaigns: C1 ended 2026-03-01 (flew T1, T2, T3); C2 ended 2026-09-01 (flew T1, T2).
// Bay BAY-1 links L1 (terminates_at) and feeds TX1 (confirmed) and TX2 (only proposed).

import { CONFIG } from '../domain/config.js';
import { createContext } from '../domain/context.js';

const A = (asset_id, cls, parent_id, extra = {}) => ({
  asset_id, category: 'line_component', class: cls, parent_id, name: asset_id, external_ids: {}, location: null,
  voltage_kv: 220, install_date: '2010-01-01', criticality: 4, labels: [], health_index: null, health_updated_at: null, ext: {}, ...extra,
});

export const F = (finding_id, asset_id, group, condition_score, date, review_status = 'confirmed', extra = {}) => ({
  finding_id, campaign_id: 'C1', capture_id: 'CAP', defect_class: 'x', group, asset_id, tower_id: null, component_hint: null,
  sensor: 'rgb', date, location: { type: 'point', lat: 0, lng: 0 }, bbox: null, confidence: 0.9, condition_score,
  review_status, confirmed_by: review_status === 'pending' ? null : 'r', ...extra,
});

export const repair = (repair_id, asset_id, date, closes) => ({
  repair_id, work_order_id: `WO-${repair_id}`, asset_id, date, action: 'fix', closes_finding_ids: closes,
});

const TX = (id, extra = {}) => A(id, 'power_transformer', 'BAY-1', {
  category: 'transformer', criticality: 5, install_date: '2020-01-01',
  ext: { oil: { date: '2026-09-01', moisture_ppm: 10, acidity_mgkoh_g: 0.05, breakdown_kv: 60 }, electrical_tests: { date: '2026-06-01', result: 'pass' } }, ...extra,
});

export const POOR_TX = {
  install_date: '1970-01-01',
  ext: { oil: { date: '2026-09-01', moisture_ppm: 40, acidity_mgkoh_g: 0.3, breakdown_kv: 20 }, electrical_tests: { date: '2026-06-01', result: 'fail' } },
};

const link = (id, from, to, relation, status = 'confirmed') => ({
  link_id: id, from_asset: from, to_asset: to, type: 'electrical', relation, source: 'manual', confidence: 1, status, confirmed_by: 'x', created_at: '2026-01-01T00:00:00Z',
});

const gas = (sample_id, date, v) => ({ sample_id, asset_id: 'TX1', date, h2: 50, ch4: 30, c2h6: 20, c2h4: 10, c2h2: 0.2, co: 250, co2: 2500, ...v });

/**
 * @param {{findings?:object[], repairs?:object[], dup?:'none'|'unmerged'|'merged', tx1?:object, tx2?:object, tx3?:boolean,
 *   dga?:object[], config?:object, extraAssets?:object[], links?:object[]}} [o]
 */
export function fixture(o = {}) {
  const assets = [
    A('L1', 'line', null, { category: 'line_network' }),
    ...[1, 2, 3, 4].map((i) => A(`T${i}`, 'tower', 'L1', { category: 'structure', ext: { index: i } })),
    A('S1', 'span', 'L1', { category: 'line_network', ext: { from_tower: 'T1', to_tower: 'T2', length_m: 400 } }),
    A('S2', 'span', 'L1', { category: 'line_network', ext: { from_tower: 'T2', to_tower: 'T3', length_m: 600 } }),
    A('T2-INS-A', 'insulator_string', 'T2'), A('T2-INS-B', 'insulator_string', 'T2'), A('T2-DMP', 'damper', 'T2'),
    A('T2-FND', 'foundation', 'T2', { category: 'structure' }),
    A('S1-CND', 'conductor', 'S1'), A('S1-ROW', 'span_corridor_segment', 'S1', { category: 'right_of_way' }),
    A('BAY-1', 'bay', null, { category: 'substation' }),
    TX('TX1', o.tx1), TX('TX2', o.tx2 ?? { ext: {} }),
    A('TX1-BSH', 'bushing', 'TX1', { category: 'transformer' }),
    ...(o.tx3 ? [TX('TX3', POOR_TX)] : []),
    ...(o.dup && o.dup !== 'none' ? [A('T2-DUP', 'tower', 'L1', { category: 'structure', ext: { index: 2 }, ...(o.dup === 'merged' ? { merged_into: 'T2' } : {}) })] : []),
    ...(o.extraAssets ?? []),
  ];
  const campaigns = [
    { campaign_id: 'C1', name: 'C1', start: '2026-02-01', end: '2026-03-01', inspected_tower_ids: ['T1', 'T2', 'T3'] },
    { campaign_id: 'C2', name: 'C2', start: '2026-08-01', end: '2026-09-01', inspected_tower_ids: ['T1', 'T2'] },
  ];
  const links = o.links ?? [
    link('K1', 'L1', 'BAY-1', 'terminates_at'),
    link('K2', 'BAY-1', 'TX1', 'feeds'),
    link('K3', 'BAY-1', 'TX2', 'feeds', 'proposed'),
    ...(o.tx3 ? [link('K4', 'BAY-1', 'TX3', 'feeds')] : []),
  ];
  const dga = o.dga ?? [];
  const data = { assets, findings: o.findings ?? [], repairs: o.repairs ?? [], campaigns, links, dga };
  return { data, ctx: createContext(data, o.config ?? CONFIG) };
}

export const GAS = gas;

/** CONFIG with scoring or other sections replaced. */
export function withConfig(patch) {
  const merged = { ...CONFIG };
  for (const [k, v] of Object.entries(patch)) merged[k] = { ...CONFIG[k], ...v };
  return merged;
}
