// Asset 360: everything the panel shows about one asset, gathered into one plain object.
// No DOM here. assetPanel.js renders it; the tests read it directly.
//
// All scores are as of the snapshot's date (snap.asOf). Evidence, repairs and links after it are ignored.

import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { risk } from '../domain/risk.js';
import { TYPE_LABELS } from '../ui/linkReviewModel.js';

export const SEVERITY = Object.freeze({
  1: { word: 'critical', condition: 'very poor' },
  2: { word: 'serious', condition: 'poor' },
  3: { word: 'moderate', condition: 'fair' },
  4: { word: 'minor', condition: 'good' },
  5: { word: 'none', condition: 'very good' },
});

const DEFECT_LABEL = Object.fromEntries([...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => [d.id, d.label]));
const humanize = (s) => String(s).replace(/_/g, ' ');
const LINK_ORDER = ['electrical', 'same_asset', 'spatial', 'evidence', 'same_model', 'hierarchy'];

/** How a link reads from this asset's side: [as the from end, as the to end]. */
const PHRASES = {
  part_of: ['part of', 'has part'], terminates_at: ['terminates at', 'terminated by'], feeds: ['feeds', 'fed by'],
  nearest_tower: ['nearest tower', 'nearest finding'], nearest_span: ['nearest span', 'nearest finding'], ends_near: ['ends near', 'has a line end near it'],
  duplicate_of: ['possible duplicate of', 'has a possible duplicate'], same_defect: ['same defect as', 'same defect as'],
};

/** A duplicate link reads "possible" only while it is waiting for a decision. */
function phraseFor(l, outgoing) {
  if (l.relation === 'duplicate_of' && l.status !== 'proposed') return outgoing ? 'duplicate of' : 'has a duplicate';
  return (PHRASES[l.relation] ?? [l.relation ?? l.type, l.relation ?? l.type])[outgoing ? 0 : 1];
}

const KIND_BY_CLASS = {
  tower: 'tower', span: 'span', line: 'line', power_transformer: 'transformer', substation: 'station', bay: 'bay', corridor: 'corridor',
};

const monthsBack = (asOf, n) => {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const conditionOf = (v, [l1, l2, l3]) => (v <= l1 ? 1 : v <= l2 ? 2 : v <= l3 ? 3 : 4);

function descendants(snap, id) {
  const children = new Map();
  for (const a of snap.assets) if (a.parent_id) (children.get(a.parent_id) ?? children.set(a.parent_id, []).get(a.parent_id)).push(a.asset_id);
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) for (const c of children.get(stack.pop()) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
  return out;
}

function findingRow(snap, f, capturesById) {
  const cap = capturesById.get(f.capture_id);
  const a = snap.byId.get(f.asset_id);
  const campaign = snap.campaigns.find((c) => c.campaign_id === f.campaign_id);
  const unreviewed = f.review_status !== 'confirmed';
  return {
    id: f.finding_id, defectClass: f.defect_class, label: DEFECT_LABEL[f.defect_class] ?? humanize(f.defect_class), group: f.group,
    condition: f.condition_score, severity: SEVERITY[f.condition_score].word, conditionLabel: SEVERITY[f.condition_score].condition,
    date: f.date, campaignId: f.campaign_id, campaignName: campaign?.name ?? f.campaign_id, sensor: f.sensor, confidence: f.confidence,
    reviewStatus: f.review_status, unreviewed, assetId: f.asset_id, assetName: a?.name ?? f.asset_id, towerId: f.tower_id, componentHint: f.component_hint,
    image: cap?.image ?? null, captureId: f.capture_id, bbox: f.bbox,
  };
}

/**
 * @param {ReturnType<typeof import('../data/repository.js').createRepository>} repo
 * @param {Awaited<ReturnType<typeof import('./snapshot.js').loadSnapshot>>} snap
 * @param {string} id
 */
export async function loadAssetDetail(repo, snap, id) {
  const asset = snap.byId.get(id);
  if (!asset) return { found: false, id };
  const { ctx, asOf } = snap;
  const kind = KIND_BY_CLASS[asset.class] ?? (['insulator_string', 'damper', 'conductor', 'earthwire', 'foundation', 'span_corridor_segment'].includes(asset.class) ? 'component' : 'other');
  const parent = asset.parent_id ? snap.byId.get(asset.parent_id) : null;
  const labelValue = (l) => snap.labelValue.get(l) ?? l;

  const header = {
    id: asset.asset_id, name: asset.name, class: humanize(asset.class), classId: asset.class, category: humanize(asset.category),
    parent: parent ? { id: parent.asset_id, name: parent.name, class: humanize(parent.class) } : null,
    voltage_kv: asset.voltage_kv, install_date: asset.install_date, criticality: asset.criticality, externalIds: asset.external_ids,
    labels: asset.labels.filter((l) => !l.startsWith('failure_mode:')).map((l) => ({ id: l, kind: l.split(':')[0], value: labelValue(l) })),
    failureModes: asset.labels.filter((l) => l.startsWith('failure_mode:')).map((l) => ({ id: l, value: labelValue(l) })),
  };

  const merged = asset.merged_into ? { into: asset.merged_into, intoName: snap.byId.get(asset.merged_into)?.name ?? asset.merged_into } : null;

  // ---------------------------------------------------------------- scores
  const scored = snap.scores.get(id) ?? (merged ? null : { hi: healthIndex(ctx, id, asOf), risk: null });
  const hi = scored?.hi ?? healthIndex(ctx, id, asOf);
  const rk = scored?.risk ?? null;
  const assessed = hi.score !== null;

  let riskFactors = null;
  if (rk && rk.score !== null) {
    const f = rk.breakdown.factors;
    riskFactors = {
      score: rk.score, band: rk.band, formula: rk.breakdown.formula,
      condition: { hi: f.condition.hi, points: f.condition.conditionPoints, band: f.condition.healthBand },
      criticality: f.criticality.value,
      consequence: { base: f.consequence.base, uplift: f.consequence.uplift, value: f.consequence.value, source: f.consequence.source, capped: f.consequence.cappedAtMax },
      uplift: rk.breakdown.linkedUplift,
    };
  }

  // ------------------------------------------------------------- breakdown
  let breakdown = { type: 'none', reason: 'No health index is defined at this level yet.' };
  if (assessed && (kind === 'tower' || kind === 'span')) breakdown = { type: 'groups', ...hi.breakdown };
  else if (assessed && kind === 'line') breakdown = { type: 'line', ...hi.breakdown };
  else if (assessed && kind === 'transformer') breakdown = { type: 'transformer', ...hi.breakdown };
  else if (!assessed && ['tower', 'span', 'line', 'transformer'].includes(kind)) breakdown = { type: 'not_assessed', reason: hi.breakdown.reason };

  // -------------------------------------------------------------- findings
  const captures = new Map((await repo.getCaptures()).map((c) => [c.capture_id, c]));
  let counted = [];
  let closedIds = [];
  if (kind === 'tower' || kind === 'span' || kind === 'transformer') {
    const f = ctx.findingsFor(id, asOf);
    counted = f.counted; closedIds = f.closed.map((x) => x.finding_id);
  } else if (kind === 'component') counted = snap.findingsByAsset.get(id) ?? [];
  else if (kind === 'line' || kind === 'station' || kind === 'bay') {
    const owners = kind === 'line' ? [...descendants(snap, id)].filter((x) => ['tower', 'span'].includes(snap.byId.get(x)?.class))
      : [...descendants(snap, id)].filter((x) => snap.byId.get(x)?.class === 'power_transformer');
    counted = owners.flatMap((o) => snap.findingsByOwner.get(o) ?? []);
  }
  const findingRows = counted.map((f) => findingRow(snap, f, captures)).sort((a, b) => a.condition - b.condition || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const findings = { total: findingRows.length, unreviewed: findingRows.filter((f) => f.unreviewed).length, closed: closedIds.length, rows: findingRows.slice(0, 25), more: Math.max(0, findingRows.length - 25) };

  // --------------------------------------------------------------- history
  const dates = snap.dates;
  const dateLabel = (d) => snap.campaigns.find((c) => c.end === d)?.name ?? 'Today';
  const history = { dates, labels: dates.map(dateLabel), hi: [], open: [], hasHi: ['tower', 'span', 'line', 'transformer'].includes(kind) };
  for (const d of dates) {
    if (history.hasHi) {
      const r = healthIndex(ctx, id, d);
      history.hi.push(r.score);
      history.open.push(r.breakdown.findingIds?.length ?? r.breakdown.visual ?? 0);
    } else if (kind === 'component') {
      const owner = ctx.ownerOf(id);
      history.hi.push(null);
      history.open.push(owner ? ctx.findingsFor(owner, d).counted.filter((f) => f.asset_id === id).length : 0);
    }
  }

  // ----------------------------------------------------------------- links
  const allLinks = await repo.getLinks({ asset_id: id, include_obsolete: true });
  const findingById = new Map((await repo.getFindings()).map((f) => [f.finding_id, f]));
  const groups = new Map();
  for (const l of allLinks) {
    const outgoing = l.from_asset === id;
    const otherId = outgoing ? l.to_asset : l.from_asset;
    const otherKind = (outgoing ? l.to_kind : l.from_kind) ?? 'asset';
    const otherAsset = otherKind === 'asset' ? snap.byId.get(otherId) : null;
    const otherFinding = otherKind === 'finding' ? findingById.get(otherId) : null;
    const item = {
      linkId: l.link_id, otherId, otherKind, otherName: otherAsset ? otherAsset.name : otherFinding ? `${otherId} ${DEFECT_LABEL[otherFinding.defect_class] ?? ''}`.trim() : otherId,
      otherClass: otherAsset ? humanize(otherAsset.class) : otherKind === 'finding' ? 'finding' : '',
      phrase: phraseFor(l, outgoing), status: l.status, confidence: l.confidence, source: l.source,
      obsolete: Boolean(l.obsolete), merged: Boolean(l.merged),
    };
    (groups.get(l.type) ?? groups.set(l.type, []).get(l.type)).push(item);
  }
  const links = {
    total: allLinks.length,
    groups: [...groups.entries()].sort((a, b) => LINK_ORDER.indexOf(a[0]) - LINK_ORDER.indexOf(b[0])).map(([type, items]) => {
      const ordered = items.sort((a, b) => (a.status === 'proposed' ? -1 : 0) - (b.status === 'proposed' ? -1 : 0) || b.confidence - a.confidence || a.otherId.localeCompare(b.otherId));
      return { type, label: TYPE_LABELS[type] ?? type, total: ordered.length, items: ordered.slice(0, 12), more: Math.max(0, ordered.length - 12) };
    }),
  };

  const dupRec = snap.dupRecord.get(id);
  const dupOrig = snap.dupOriginal.get(id);
  const dupLink = dupRec ?? dupOrig ?? null;
  const duplicate = dupLink ? {
    role: dupRec ? 'record' : 'original', linkId: dupLink.link_id, status: dupLink.status, score: dupLink.confidence,
    otherId: dupRec ? dupLink.to_asset : dupLink.from_asset, otherName: snap.byId.get(dupRec ? dupLink.to_asset : dupLink.from_asset)?.name ?? '',
  } : null;

  // ----------------------------------------------- work orders and repairs
  const subtree = descendants(snap, id);
  const orders = (await repo.getWorkOrders()).filter((w) => subtree.has(w.asset_id));
  const repairs = (await repo.getRepairs()).filter((r) => subtree.has(r.asset_id));
  const nameOf = (x) => snap.byId.get(x)?.name ?? x;
  const work = {
    ordersTotal: orders.length, repairsTotal: repairs.length,
    open: orders.filter((w) => ['open', 'in_progress'].includes(w.status)).length,
    orders: orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12).map((w) => ({
      id: w.work_order_id, status: w.status, type: w.work_type, priority: w.priority, assetId: w.asset_id, assetName: nameOf(w.asset_id),
      findings: w.finding_ids.length, created: w.created_at, planned: w.planned_date, completed: w.completed_at,
    })),
    repairs: repairs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((r) => ({
      id: r.repair_id, workOrderId: r.work_order_id, date: r.date, action: r.action, assetId: r.asset_id, assetName: nameOf(r.asset_id), closes: r.closes_finding_ids.length,
    })),
  };

  // ------------------------------------------------------------ components
  const children = snap.assets.filter((a) => a.parent_id === id);
  const components = children.map((c) => {
    const f = snap.findingsByAsset.get(c.asset_id) ?? [];
    return { id: c.asset_id, name: c.name, class: humanize(c.class), open: f.length, worst: f.length ? Math.min(...f.map((x) => x.condition_score)) : null };
  });

  // ---------------------------------------------------------- transformers
  let transformer = null;
  if (kind === 'transformer') {
    const cfg = CONFIG.transformer.dga;
    const samples = (await repo.getDgaSamples(id)).filter((s) => s.date <= asOf);
    const latest = samples[samples.length - 1] ?? null;
    const dgaInput = breakdown.inputs?.find((i) => i.input === 'dga' && i.used);
    const gasScores = new Map((dgaInput?.detail.gases ?? []).map((g) => [g.gas, g.score]));
    const oilInput = breakdown.inputs?.find((i) => i.input === 'oil' && i.used);
    const ageInput = breakdown.inputs?.find((i) => i.input === 'age' && i.used);
    const tests = asset.ext.electrical_tests && asset.ext.electrical_tests.date <= asOf ? asset.ext.electrical_tests : null;
    const loading = asset.ext.loading_pct_12m ?? [];
    transformer = {
      rating_mva: asset.ext.rating_mva, ratio: asset.ext.voltage_ratio, serial: asset.ext.serial, oil_type: asset.ext.oil_type, manufacturer: asset.ext.manufacturer,
      design_family: asset.ext.design_family, ageYears: ageInput?.detail.ageYears ?? null,
      dga: {
        gases: cfg.gases, samples: samples.map((s) => ({ id: s.sample_id, date: s.date, ...Object.fromEntries(cfg.gases.map((g) => [g, s[g]])) })), latest: latest?.date ?? null,
        table: latest ? cfg.gases.map((g) => ({ gas: g, ppm: latest[g], limits: cfg.limits[g], condition: conditionOf(latest[g], cfg.limits[g]), score: gasScores.get(g) ?? null })) : [],
        trend: dgaInput?.detail.trend ?? null, worstGas: dgaInput?.detail.worstGas ?? null, score: dgaInput?.score ?? null,
      },
      duval: breakdown.duval ?? null,
      oil: oilInput ? { date: oilInput.detail.sampleDate, parameters: oilInput.detail.parameters, score: oilInput.score, type: asset.ext.oil_type } : null,
      tests: tests ? { date: tests.date, result: tests.result, score: breakdown.inputs?.find((i) => i.input === 'tests')?.score ?? null } : null,
      loading: loading.length ? { labels: loading.map((_, i) => monthsBack(asOf, loading.length - 1 - i)), values: loading, latest: loading[loading.length - 1], max: Math.max(...loading), mean: Math.round((loading.reduce((a, b) => a + b, 0) / loading.length) * 10) / 10 } : null,
    };
  }

  // ---------------------------------------------------------- the evidence
  const evidence = {
    assessed,
    reason: assessed ? null : (breakdown.reason ?? hi.breakdown.reason ?? 'No evidence is recorded for this asset.'),
    newest: hi.breakdown.freshness?.newestEvidenceDate ?? null, freshness: hi.breakdown.freshness ?? null,
    hasFindings: findings.total > 0 || findings.closed > 0,
  };

  return {
    found: true, id, asOf, kind, header, merged, scores: { hi: { score: hi.score, band: hi.band }, risk: rk ? { score: rk.score, band: rk.band } : null },
    riskFactors, breakdown, findings, history, links, duplicate, work, components, transformer, evidence,
  };
}
