// Asset Registry model: what each category tab shows. Pure functions over a snapshot (see snapshot.js).
// No HTML here. registryTabs.js turns these rows, filters and KPIs into markup with the legacy helpers.
//
// A cell is { text, tone, sort }. tone is a legacy tag colour (g green, a amber, r red, b blue, x neutral) or null
// for plain text. sort is the value the column sorts by.

import { healthIndex } from '../domain/health/healthIndex.js';
import { CONFIG } from '../domain/config.js';

const COMPONENT_CLASSES = ['insulator_string', 'damper', 'conductor', 'earthwire', 'foundation', 'span_corridor_segment'];

export const CATEGORIES = Object.freeze([
  { id: 'lines', title: 'Lines', classes: ['line'] },
  { id: 'towers', title: 'Towers', classes: ['tower'] },
  { id: 'spans', title: 'Spans', classes: ['span'] },
  { id: 'components', title: 'Components', classes: COMPONENT_CLASSES },
  { id: 'substations', title: 'Substations', classes: ['substation', 'bay'] },
  { id: 'transformers', title: 'Transformers', classes: ['power_transformer'] },
]);

const BAND_TONE = { normal: 'g', moderate: 'a', poor: 'r' };
const CONDITION = { 1: 'very poor', 2: 'poor', 3: 'fair', 4: 'good', 5: 'very good' };
const round1 = (n) => Math.round(n * 10) / 10;
const cell = (text, opts = {}) => ({ text: String(text), tone: opts.tone ?? null, sort: opts.sort ?? text });
const none = (text = '-') => cell(text, { sort: -1 });
const cls = (c) => c.replace(/_/g, ' ');

/** "Possible duplicate" chips for a row: they open the link in the Links tab. */
function dupChips(snap, a) {
  const rec = snap.dupRecord.get(a.asset_id);
  if (rec) return [{ text: rec.status === 'proposed' ? 'possible duplicate' : 'duplicate, not merged', tone: rec.status === 'proposed' ? 'a' : 'b', link: rec.link_id, status: rec.status }];
  const orig = snap.dupOriginal.get(a.asset_id);
  if (orig) return [{ text: orig.status === 'proposed' ? 'has a possible duplicate' : 'has a duplicate', tone: orig.status === 'proposed' ? 'a' : 'b', link: orig.link_id, status: orig.status }];
  return [];
}
const nameCell = (snap, a) => ({ ...cell(a.name, { sort: a.name }), chips: dupChips(snap, a) });
const dupCount = (snap, assets) => assets.filter((a) => snap.dupRecord.has(a.asset_id)).length;
const incl = (n) => (n ? ` · incl. ${plural(n, 'possible duplicate')}` : '');

// ---------------------------------------------------------------- lookups

function lineIdOf(snap, a) {
  let cur = a;
  for (let i = 0; i < 5 && cur; i += 1) {
    if (cur.class === 'line') return cur.asset_id;
    cur = cur.parent_id ? snap.byId.get(cur.parent_id) : null;
  }
  return null;
}
const corridorsOf = (snap, a) => a.labels.filter((l) => l.startsWith('corridor:')).map((l) => snap.labelValue.get(l)).filter(Boolean);
const stationOf = (snap, tx) => { const bay = snap.byId.get(tx.parent_id); return bay ? snap.byId.get(bay.parent_id) : null; };

/** Band word used in the filter and the zone: normal, moderate, poor, or "not assessed". */
const bandWord = (res) => (res && res.band ? res.band : 'not assessed');

// ------------------------------------------------------------------ cells

function hiCell(res) {
  if (!res || res.score === null) return { text: 'not assessed', tone: 'x', sort: -1 };
  return { text: `${res.score} ${res.band}`, tone: BAND_TONE[res.band], sort: res.score };
}
function riskCell(r) {
  if (!r || r.score === null) return none();
  return { text: `${Math.round(r.score)} ${r.band}`, tone: { low: 'g', medium: 'b', high: 'a', critical: 'r' }[r.band], sort: r.score };
}
function evidenceCell(res) {
  const f = res?.breakdown?.freshness;
  if (!f?.newestEvidenceDate) return none();
  return f.stale ? { text: `${f.newestEvidenceDate} stale`, tone: 'a', sort: f.newestEvidenceDate } : cell(f.newestEvidenceDate, { sort: f.newestEvidenceDate });
}
function openCell(n, unreviewed = 0) {
  if (!n) return cell('0', { sort: 0 });
  return { text: unreviewed ? `${n} · ${unreviewed} unreviewed` : String(n), tone: 'a', sort: n };
}
function linksCell(snap, id) {
  const c = snap.linkCounts.get(id);
  if (!c || (!c.linked && !c.review)) return none();
  if (c.review) return { text: `${c.review} to review`, tone: 'a', sort: c.review + 1000 };
  return cell(`${c.linked} linked`, { sort: c.linked });
}
function labelsCell(snap, a) {
  const want = ['corridor', 'corrosion_zone', 'design_family', 'manufacturer'];
  const chips = a.labels.filter((l) => want.includes(l.split(':')[0])).map((l) => snap.labelValue.get(l)).filter(Boolean);
  return { text: chips.length ? `${chips[0]}${chips.length > 1 ? ` +${chips.length - 1}` : ''}` : '-', tone: chips.length ? 'b' : null, sort: chips[0] ?? '' };
}

function hiTip(a, res, rk) {
  if (!res || res.score === null) return `${a.name}: not assessed. ${res?.breakdown?.reason ?? ''}`.trim();
  const b = res.breakdown;
  const cap = b.cap?.applied ? ` A group at condition ${b.cap.condition} (${b.cap.causedBy.join(', ')}) limits it; without that it would be ${b.cap.uncappedScore}.` : '';
  const open = b.findingIds ? ` ${b.findingIds.length} open finding${b.findingIds.length === 1 ? '' : 's'}${b.unreviewedFindingIds?.length ? `, ${b.unreviewedFindingIds.length} unreviewed` : ''}.` : '';
  const when = b.freshness?.newestEvidenceDate ? ` Newest evidence ${b.freshness.newestEvidenceDate}${b.freshness.stale ? ' (older than the inspection interval)' : ''}.` : '';
  return `${a.name}: health index ${res.score} (${res.band}).${cap}${open}${when}${rk && rk.score !== null ? ` Risk ${rk.score} (${rk.band}).` : ''}`;
}

const zoneOf = (tokens) => tokens.filter(Boolean).join(' | ');

// ------------------------------------------------------------------- rows

/**
 * @returns {{columns: string[], rows: Array<{id:string, cells: object[], tip:string, zone:string, facets:object}>}}
 */
export function tableFor(snap, categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) throw new Error(`Unknown category ${categoryId}`);
  const assets = snap.assets.filter((a) => cat.classes.includes(a.class)).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  const score = (a) => snap.scores.get(a.asset_id) ?? { hi: null, risk: null };
  const builders = { lines, towers, spans, components, substations, transformers };
  return builders[categoryId](snap, assets, score);
}

function lines(snap, assets, score) {
  const rows = assets.map((a) => {
    const { hi } = score(a);
    const b = hi.breakdown;
    const weak = b.bandCounts ? b.bandCounts.all.moderate + b.bandCounts.all.poor : null;
    const assessed = b.counts ? b.counts.assessedTowers + b.counts.assessedSpans : 0;
    const corr = corridorsOf(snap, a);
    return {
      id: a.asset_id, tip: hiTip(a, hi, null),
      zone: zoneOf([a.asset_id, `${a.voltage_kv} kV`, ...corr, bandWord(hi)]),
      facets: { line: a.asset_id, kv: `${a.voltage_kv} kV`, corridor: corr, band: bandWord(hi) },
      cells: [nameCell(snap, a), cell(corr.join(', ') || '-'), cell(a.voltage_kv, { sort: a.voltage_kv }), cell(a.ext.length_km, { sort: a.ext.length_km }),
        hiCell(hi), weak === null ? none() : { text: `${weak} of ${assessed}`, tone: weak ? 'a' : null, sort: weak },
        openCell(b.findingIds?.length ?? 0, b.unreviewedFindingIds?.length ?? 0), evidenceCell(hi), linksCell(snap, a.asset_id), labelsCell(snap, a)],
    };
  });
  return { columns: ['Line', 'Corridor', 'kV', 'Length km', 'Health index', 'Weak towers and spans', 'Open findings', 'Last evidence', 'Links', 'Labels'], rows };
}

function ownerRows(snap, assets, score, withLength) {
  return assets.map((a) => {
    const { hi, risk } = score(a);
    const line = lineIdOf(snap, a);
    const corr = corridorsOf(snap, a);
    const b = hi.breakdown;
    const cells = [nameCell(snap, a), cell(a.asset_id, { sort: a.asset_id }), cell(line ?? '-'), cell(a.voltage_kv, { sort: a.voltage_kv })];
    if (withLength) cells.push(cell(Math.round(a.ext.length_m), { sort: a.ext.length_m }));
    cells.push(hiCell(hi), riskCell(risk), openCell(b.findingIds?.length ?? 0, b.unreviewedFindingIds?.length ?? 0), evidenceCell(hi), linksCell(snap, a.asset_id), labelsCell(snap, a));
    return { id: a.asset_id, tip: hiTip(a, hi, risk), zone: zoneOf([line, `${a.voltage_kv} kV`, ...corr, bandWord(hi)]), facets: { line, kv: `${a.voltage_kv} kV`, corridor: corr, band: bandWord(hi) }, cells };
  });
}
const towers = (snap, assets, score) => ({ columns: ['Tower', 'ID', 'Line', 'kV', 'Health index', 'Risk', 'Open findings', 'Last evidence', 'Links', 'Labels'], rows: ownerRows(snap, assets, score, false) });
const spans = (snap, assets, score) => ({ columns: ['Span', 'ID', 'Line', 'kV', 'Length m', 'Health index', 'Risk', 'Open findings', 'Last evidence', 'Links', 'Labels'], rows: ownerRows(snap, assets, score, true) });

function components(snap, assets) {
  const rows = assets.map((a) => {
    const f = snap.findingsByAsset.get(a.asset_id) ?? [];
    const worst = f.length ? Math.min(...f.map((x) => x.condition_score)) : null;
    const line = lineIdOf(snap, a);
    const corr = corridorsOf(snap, a);
    const parent = snap.byId.get(a.parent_id);
    const condition = worst === null ? { text: 'no open findings', tone: 'g', sort: 6 } : { text: `${worst} ${CONDITION[worst]}`, tone: worst === 1 ? 'r' : worst === 2 ? 'a' : 'b', sort: worst };
    const unrev = f.filter((x) => x.review_status !== 'confirmed').length;
    return {
      id: a.asset_id,
      tip: worst === null ? `${a.name}${a.ext.manufacturer ? ` (${a.ext.manufacturer})` : ''}: no open findings.` : `${a.name}: ${f.length} open finding${f.length === 1 ? '' : 's'}, worst condition ${worst} (${CONDITION[worst]}).${unrev ? ` ${unrev} not yet confirmed by a reviewer.` : ''}`,
      zone: zoneOf([line, `${a.voltage_kv} kV`, ...corr, cls(a.class), worst === null ? 'clean' : 'with findings']),
      facets: { line, kv: `${a.voltage_kv} kV`, corridor: corr, class: cls(a.class), findings: worst === null ? 'clean' : 'with findings' },
      cells: [nameCell(snap, a), cell(a.asset_id, { sort: a.asset_id }), cell(cls(a.class)), cell(parent ? parent.name : '-'), condition, openCell(f.length, unrev),
        linksCell(snap, a.asset_id), labelsCell(snap, a)],
    };
  });
  return { columns: ['Component', 'ID', 'Class', 'On', 'Condition', 'Open findings', 'Links', 'Labels'], rows };
}

function substations(snap, assets) {
  const live = snap.assets;
  const rows = assets.map((a) => {
    const station = a.class === 'substation' ? a : snap.byId.get(a.parent_id);
    const transformers = a.class === 'substation' ? live.filter((x) => x.class === 'power_transformer' && stationOf(snap, x)?.asset_id === a.asset_id)
      : live.filter((x) => x.asset_id === a.ext?.transformer_id);
    const open = transformers.reduce((n, t) => n + (snap.findingsByOwner.get(t.asset_id)?.length ?? 0), 0);
    const corr = corridorsOf(snap, a);
    const what = a.class === 'substation' ? `${transformers.length} transformers · ${a.ext.lines_terminated.length} lines` : a.ext.role === 'line' ? `line ${a.ext.line_id}` : `transformer ${a.ext.transformer_id}`;
    return {
      id: a.asset_id, tip: `${a.name}: ${what}.`,
      zone: zoneOf([`${a.voltage_kv} kV`, ...corr, cls(a.class), station?.name]),
      facets: { kv: `${a.voltage_kv} kV`, corridor: corr, class: cls(a.class) },
      cells: [cell(a.name, { sort: a.name }), cell(a.asset_id, { sort: a.asset_id }), cell(cls(a.class)), cell(a.voltage_kv, { sort: a.voltage_kv }), cell(station ? station.name : '-'),
        cell(what), openCell(open), linksCell(snap, a.asset_id), labelsCell(snap, a)],
    };
  });
  // bays are shown under their substation, so 12 rows read as 2 substations with 10 bays
  const byRowId = new Map(rows.map((r) => [r.id, r]));
  const ordered = [];
  for (const sub of assets.filter((a) => a.class === 'substation')) {
    ordered.push({ ...byRowId.get(sub.asset_id), level: 'parent' });
    for (const bay of assets.filter((a) => a.class === 'bay' && a.parent_id === sub.asset_id)) {
      const r = byRowId.get(bay.asset_id);
      ordered.push({ ...r, level: 'child', cells: [{ ...r.cells[0], text: `\u21B3 ${r.cells[0].text}` }, ...r.cells.slice(1)] });
    }
  }
  return { columns: ['Name', 'ID', 'Class', 'kV', 'Station', 'Connects', 'Open findings on transformers', 'Links'].concat(['Labels']), rows: ordered, nested: true };
}

function transformers(snap, assets, score) {
  const rows = assets.map((a) => {
    const { hi, risk } = score(a);
    const b = hi.breakdown;
    const station = stationOf(snap, a);
    const corr = corridorsOf(snap, a);
    const weakest = b.inputs ? b.inputs.filter((i) => i.used).sort((x, y) => x.score - y.score)[0] : null;
    const ageIn = b.inputs?.find((i) => i.input === 'age' && i.used);
    const zone = b.duval?.zone ?? null;
    return {
      id: a.asset_id, tip: hiTip(a, hi, risk) + (zone ? ` Latest gas pattern: Duval zone ${zone} (${b.duval.label}).` : ''),
      zone: zoneOf([station?.name, `${a.voltage_kv} kV`, ...corr, bandWord(hi)]),
      facets: { station: station?.name, kv: `${a.voltage_kv} kV`, corridor: corr, band: bandWord(hi) },
      cells: [nameCell(snap, a), cell(a.asset_id, { sort: a.asset_id }), cell(station ? station.name : '-'), cell(a.ext.rating_mva, { sort: a.ext.rating_mva }),
        ageIn ? cell(ageIn.detail.ageYears, { sort: ageIn.detail.ageYears }) : none(), hiCell(hi), riskCell(risk), zone ? { text: zone, tone: 'x', sort: zone } : none(),
        weakest ? { text: `${weakest.input} ${weakest.score}`, tone: weakest.score < 50 ? 'a' : null, sort: weakest.score } : none(),
        openCell(b.findingIds?.length ?? 0, b.unreviewedFindingIds?.length ?? 0), linksCell(snap, a.asset_id)],
    };
  });
  return { columns: ['Transformer', 'ID', 'Station', 'MVA', 'Age y', 'Health index', 'Risk', 'Duval zone', 'Weakest input', 'Open findings', 'Links'], rows };
}

// ---------------------------------------------------------------- filters

const FILTERS = {
  lines: [['Location', [['corridor', 'Corridor'], ['kv', 'Voltage']]], ['Asset', [['band', 'Health band']]]],
  towers: [['Location', [['line', 'Line'], ['kv', 'Voltage'], ['corridor', 'Corridor']]], ['Asset', [['band', 'Health band']]]],
  spans: [['Location', [['line', 'Line'], ['kv', 'Voltage'], ['corridor', 'Corridor']]], ['Asset', [['band', 'Health band']]]],
  components: [['Location', [['line', 'Line'], ['kv', 'Voltage'], ['corridor', 'Corridor']]], ['Asset', [['class', 'Class'], ['findings', 'Findings']]]],
  substations: [['Location', [['kv', 'Voltage'], ['corridor', 'Corridor']]], ['Asset', [['class', 'Class']]]],
  transformers: [['Location', [['station', 'Station'], ['kv', 'Voltage'], ['corridor', 'Corridor']]], ['Asset', [['band', 'Health band']]]],
};
const BAND_ORDER = ['normal', 'moderate', 'poor', 'not assessed'];

/** Filter selects for a category, with the values that really occur in its rows. */
export function filtersFor(categoryId, rows) {
  return FILTERS[categoryId].map(([group, fields]) => ({
    group,
    selects: fields.map(([key, label]) => {
      const values = [...new Set(rows.flatMap((r) => [].concat(r.facets[key] ?? [])).filter(Boolean))];
      values.sort(key === 'band' ? (a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b) : key === 'findings' ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return { key, label, options: values };
    }),
  }));
}

// -------------------------------------------------------------------- KPIs

function statsAt(snap, assets, date) {
  let sum = 0; let assessed = 0; let attention = 0; let poor = 0; let open = 0;
  for (const a of assets) {
    const r = healthIndex(snap.ctx, a.asset_id, date);
    if (r.score === null) continue;
    assessed += 1; sum += r.score; open += r.breakdown.findingIds?.length ?? 0;
    if (r.band !== 'normal') attention += 1;
    if (r.band === 'poor') poor += 1;
  }
  return { assessed, avg: assessed ? round1(sum / assessed) : null, attention, poor, open };
}
/** Series over the campaign dates and today. A single point is drawn flat, never as an invented trend. */
const series = (values) => { const v = values.filter((x) => x !== null && x !== undefined); return v.length > 1 ? v : v.length ? [v[0], v[0]] : [0, 0]; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Four KPI cards for a category tab, in the legacy kpis() shape: { l, v, s, tip, spark, color }. */
export function kpisFor(snap, categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  const assets = snap.assets.filter((a) => cat.classes.includes(a.class));
  const hist = ['lines', 'towers', 'spans', 'transformers'].includes(categoryId) ? snap.dates.map((d) => statsAt(snap, assets, d)) : null;
  const now = hist ? hist[hist.length - 1] : null;
  const unit = { lines: 'line', towers: 'tower', spans: 'span', transformers: 'transformer' }[categoryId];
  const dups = dupCount(snap, assets);

  if (hist) {
    const unreviewed = assets.reduce((n, a) => n + (snap.scores.get(a.asset_id)?.hi.breakdown.unreviewedFindingIds?.length ?? 0), 0);
    const base = [
      { l: CATEGORIES.find((c) => c.id === categoryId).title, v: String(assets.length), s: `${now.assessed} assessed${incl(dups)}`, tip: `${assets.length} ${unit}s in the registry. Only assessed ones have a health index.${dups ? ` The count includes ${plural(dups, 'record')} that look like duplicates of another ${unit}; they stay until merged in Links.` : ''}`, spark: series(hist.map((h) => h.assessed)) },
      { l: 'Average health index', v: now.avg === null ? '-' : String(now.avg), s: `of ${now.assessed} assessed`, tip: 'Mean health index of the assessed assets, at each campaign date and today.', spark: series(hist.map((h) => h.avg)), color: now.avg !== null && now.avg < CONFIG.bands.normalMin ? '#d97706' : undefined },
      { l: 'Needs attention', v: String(now.attention), s: `${now.poor} poor · ${now.attention - now.poor} moderate`, tip: `Health index below ${CONFIG.bands.normalMin}.`, spark: series(hist.map((h) => h.attention)), color: now.attention ? '#d97706' : undefined },
    ];
    if (categoryId === 'transformers') {
      const best = assets.map((a) => ({ a, r: snap.scores.get(a.asset_id)?.risk })).filter((x) => x.r && x.r.score !== null).sort((x, y) => y.r.score - x.r.score)[0];
      return [...base, { l: 'Highest risk', v: best ? String(Math.round(best.r.score)) : '-', s: best ? `${best.a.asset_id} · ${best.r.band}` : '', tip: '(100 - health index) x criticality x consequence, with the linked-asset uplift.', spark: series([best?.r.score]), color: best && ['high', 'critical'].includes(best.r.band) ? '#d14343' : undefined }];
    }
    return [...base, { l: 'Open findings', v: String(now.open), s: `${unreviewed} unreviewed`, tip: 'Confirmed or AI-proposed findings not yet closed by a repair. Rejected ones are left out.', spark: series(hist.map((h) => h.open)), color: now.open ? '#d97706' : undefined }];
  }

  if (categoryId === 'components') {
    const withF = assets.filter((a) => (snap.findingsByAsset.get(a.asset_id) ?? []).length);
    const all = withF.flatMap((a) => snap.findingsByAsset.get(a.asset_id));
    const worst = all.length ? Math.min(...all.map((f) => f.condition_score)) : null;
    const worstClass = worst === null ? '' : cls(all.find((f) => f.condition_score === worst).defect_class);
    const unrev = all.filter((f) => f.review_status !== 'confirmed').length;
    const owners = snap.assets.filter((a) => ['tower', 'span'].includes(a.class));
    const openAt = (d) => owners.reduce((n, o) => n + snap.ctx.findingsFor(o.asset_id, d).counted.filter((f) => f.asset_id !== o.asset_id).length, 0);
    return [
      { l: 'Components', v: String(assets.length), s: `${new Set(assets.map((a) => a.class)).size} classes${incl(dupCount(snap, assets))}`, tip: `Insulator strings, dampers, conductors, earthwires, foundations and corridor segments.${dupCount(snap, assets) ? ' Includes records that look like duplicates; they stay until merged in Links.' : ''}`, spark: series([assets.length]) },
      { l: 'With open findings', v: String(withF.length), s: `${assets.length ? Math.round((withF.length / assets.length) * 100) : 0}% of components`, tip: 'Components with at least one open finding recorded on them.', spark: series(snap.dates.map(openAt)), color: withF.length ? '#d97706' : undefined },
      { l: 'Worst condition', v: worst === null ? '-' : `${worst}`, s: worst === null ? 'none open' : `${CONDITION[worst]} · ${worstClass}`, tip: 'Lowest condition score (1 very poor to 5 very good) among open findings on components.', spark: series([worst]), color: worst !== null && worst <= 2 ? '#d14343' : undefined },
      { l: 'Unreviewed', v: String(unrev), s: 'AI-proposed, not confirmed', tip: 'Open findings on components that no reviewer has confirmed yet. They still count toward scores.', spark: series([unrev]) },
    ];
  }
  if (categoryId === 'substations') {
    const subs = assets.filter((a) => a.class === 'substation');
    const bays = assets.filter((a) => a.class === 'bay');
    const tx = snap.assets.filter((a) => a.class === 'power_transformer');
    const mva = tx.reduce((n, t) => n + (t.ext.rating_mva ?? 0), 0);
    const terminations = snap.links.filter((l) => l.type === 'electrical' && l.relation === 'terminates_at' && l.to_asset.startsWith('SUB-')).length;
    const open = tx.reduce((n, t) => n + (snap.findingsByOwner.get(t.asset_id)?.length ?? 0), 0);
    return [
      { l: 'Stations and bays', v: String(assets.length), s: `${plural(subs.length, 'substation')} · ${plural(bays.length, 'bay')}`, tip: 'Substations and the bays inside them.', spark: series([assets.length]) },
      { l: 'Transformers behind them', v: String(tx.length), s: `${mva} MVA${incl(dupCount(snap, tx))}`, tip: `Power transformers fed through these bays.${dupCount(snap, tx) ? ' The count and the MVA include a record that looks like a duplicate; it stays until merged in Links.' : ''}`, spark: series([tx.length]) },
      { l: 'Line terminations', v: String(terminations), s: 'lines ending at a station', tip: 'Confirmed electrical links from a line to the substation where it ends.', spark: series([terminations]) },
      { l: 'Open findings', v: String(open), s: 'on transformers', tip: 'Visual and thermal findings on transformers and their parts.', spark: series([open]), color: open ? '#d97706' : undefined },
    ];
  }
  throw new Error(`No KPIs for ${categoryId}`);
}

/** KPI cards for the Links tab. They change as decisions are made. */
export function linksKpis(snap) {
  const reviewable = snap.links.filter((l) => ['resemblance', 'rule'].includes(l.source) && !l.obsolete);
  const proposed = reviewable.filter((l) => l.status === 'proposed');
  const auto = reviewable.filter((l) => l.status === 'confirmed' && l.confirmed_by === 'auto-link');
  const decided = reviewable.filter((l) => l.decided_at);
  const accepted = decided.filter((l) => l.status === 'confirmed').length;
  const rules = reviewable.filter((l) => l.source === 'rule').length;
  const kind = (arr, k) => arr.filter((l) => l.from_kind === k).length;
  return [
    { l: 'Awaiting review', v: String(proposed.length), s: `${plural(kind(proposed, 'asset'), 'record')} · ${plural(kind(proposed, 'finding'), 'sighting')}`, tip: 'Proposed links with a score between the review and automatic thresholds. A person confirms or rejects each one.', spark: series([proposed.length]), color: proposed.length ? '#d97706' : undefined },
    { l: 'Linked automatically', v: String(auto.length), s: `score ${CONFIG.linking.autoLinkAtOrAbove} or more`, tip: 'Links the matcher made on its own. Each one is in the audit log.', spark: series([auto.length]) },
    { l: 'Decided by reviewers', v: String(decided.length), s: `${accepted} accepted · ${decided.length - accepted} rejected`, tip: 'Decisions made in this browser. Reset demo data clears them.', spark: series([decided.length]) },
    { l: 'Rule links', v: String(rules), s: 'spatial and electrical', tip: 'Links from fixed rules: a finding to its nearest tower or span, a line end to its substation.', spark: series([rules]) },
  ];
}
