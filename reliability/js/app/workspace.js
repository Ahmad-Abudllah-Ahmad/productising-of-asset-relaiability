// Module 01 — Asset Reliability Intelligence, on the NEXUS Console.
// Asset Reliability is asset health PLUS the operational records (management review, 12 Nov 2026), so the rail is grouped:
//   Overview      Reliability Dashboard, Asset Registry (the registry tabs from registryTabs.js plus an overview)
//   Asset Health  Tower Health, Line Health, Risk Map: the current condition (health index and risk score)
//   Operations    Maintenance History, Work Orders, Inventory & Parts: read from the ERP, never entered here
//   Engineering   live Substation Schematics
// Health numbers come from the scored snapshot (health index, risk = (100 − HI) × criticality × consequence) and the
// records behind it: findings, repairs, DGA. Work orders, stock and suppliers come through the ERP integration layer
// (assets/console/erp.js). The risk score is an unvalidated model, so every risk view is marked Experimental.

import { ui, ch, live, esc, fmt, icon, drawer, toast, addDays, daysBetween } from '/assets/console/console.js';
import * as sx from '/assets/console/schematics.js';
import { networkLayers, DEFECT_LABEL, SEV_TONE, LINE_NAME, CORRIDOR } from '/assets/console/network.js';
import { healthIndex } from '../domain/health/healthIndex.js';
import { drawingTabs } from '/assets/console/drawings.js';
import { erpRequest } from '/assets/console/erp.js';

/* ------------------------------------------------------------------ shared vocabulary */
const BAND_C = { normal: '#16a34a', moderate: '#d97706', poor: '#dc2626' };
const BAND_T = { normal: 'ok', moderate: 'warn', poor: 'crit' };
const RISK_C = { low: '#16a34a', medium: '#0284c7', high: '#ea580c', critical: '#dc2626' };
const RISK_T = { low: 'ok', medium: 'info', high: 'high', critical: 'crit' };
const RISK_EXP = 'The risk score, the risk colours on the map and the risk matrix come from a scoring model that has not been validated against failure or outage data. Likelihood is inferred from the health index. Treat the ranking as a simulated prioritisation, not a measured risk.';
const GROUP_LABEL = { insulators: 'Insulators', steel_structure: 'Steel structure', foundation: 'Foundation', conductor_accessories: 'Conductor accessories', lightning_protection: 'Lightning protection', tower_accessories: 'Tower accessories', conductor: 'Conductor', clearance: 'Clearance / ROW', conductors: 'Conductor' };
const COND_C = { 5: '#16a34a', 4: '#65a30d', 3: '#d97706', 2: '#ea580c', 1: '#dc2626' };
const bandColor = (b) => BAND_C[b] || '#94a3b8';
const riskC = (b) => RISK_C[b] || '#94a3b8';
const hiScore = (v, band) => ui.score(v == null ? null : Math.round(v), bandColor(band));
const riskBadge = (band, score) => (band ? ui.badge(`${fmt.title(band)}${score != null ? ` · ${fmt.n(score)}` : ''}`, RISK_T[band]) : ui.badge('Not assessed', 'muted'));
const STRUCTURAL = new Set(['steel_structure', 'foundation']);

export function buildScreens(net, { registryTabs = [], openAsset, openFinding, go }) {
  const { towers, lines, spans, transformers, findings, workOrders, repairs, substations, snap } = net;
  const asOf = net.asOf;
  const campaigns = snap.campaigns.slice().sort((a, b) => a.end.localeCompare(b.end));
  const ctxHi = snap.ctx;

  /* ---------- derived records */
  const woByFinding = new Map();
  for (const w of workOrders) for (const f of w.finding_ids || []) woByFinding.set(f, w);
  const assessed = towers.filter((t) => t.hi != null);
  const fleetHi = assessed.reduce((a, t) => a + t.hi, 0) / (assessed.length || 1);
  const bandCount = (list, b) => list.filter((t) => t.band === b).length;
  const openFindings = findings.filter((f) => f.review_status !== 'rejected' && !isClosed(f));
  function isClosed(f) { return repairs.some((r) => r.date <= asOf && (r.closes_finding_ids || []).includes(f.finding_id)); }
  const pending = findings.filter((f) => f.review_status === 'pending');
  const ranked = [...towers, ...spans.map((s) => ({ ...s, kind: 'span' })), ...transformers.map((t) => ({ ...t, kind: 'transformer' }))].filter((a) => a.risk != null).sort((a, b) => b.risk - a.risk);

  // the operational sentence: the tower with the most verified structural findings, then highest risk
  const structural = towers.map((t) => ({ t, n: t.findings.filter((f) => f.review_status === 'confirmed' && STRUCTURAL.has(f.group)).length })).filter((x) => x.n >= 2).sort((a, b) => (b.t.risk ?? 0) - (a.t.risk ?? 0) || b.n - a.n);
  const heroTower = structural[0]?.t || towers.slice().sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))[0];
  const heroN = structural[0]?.n ?? heroTower.findings.length;
  const heroText = `Tower <b>${esc(heroTower.name)}</b> on ${esc(heroTower.line)} has <b>${heroN} verified structural findings</b> and requires engineering review.`;

  // overdue for engineering review / intervention
  const overdue = [];
  for (const t of towers) {
    const conf = t.findings.filter((f) => f.review_status === 'confirmed' && f.condition_score <= 2);
    const uncovered = conf.filter((f) => !woByFinding.has(f.finding_id));
    if (uncovered.length) { const first = uncovered.map((f) => f.date).sort()[0]; const age = daysBetween(first, asOf); if (age > 30) overdue.push({ id: t.id, asset: t, kind: 'Engineering review', reason: `${uncovered.length} high/critical finding${uncovered.length > 1 ? 's' : ''} with no work order`, age, due: addDays(first, 30), tone: 'crit' }); }
    const unrev = t.findings.filter((f) => f.review_status === 'pending');
    if (unrev.length) { const first = unrev.map((f) => f.date).sort()[0]; const age = daysBetween(first, asOf); if (age > 14) overdue.push({ id: `${t.id}-rv`, asset: t, kind: 'AI finding review', reason: `${unrev.length} model finding${unrev.length > 1 ? 's' : ''} waiting for a reviewer`, age, due: addDays(first, 14), tone: 'warn' }); }
  }
  const lastCamp = campaigns[campaigns.length - 1];
  const inspected = new Set(lastCamp?.inspected_tower_ids || []);
  for (const t of towers) if (!inspected.has(t.id) && t.criticality >= 4) overdue.push({ id: `${t.id}-in`, asset: t, kind: 'Inspection', reason: `Missed in ${lastCamp.name} campaign; criticality ${t.criticality}`, age: daysBetween(lastCamp.end, asOf), due: lastCamp.end, tone: 'info' });
  overdue.sort((a, b) => b.age - a.age);

  // HI history at each campaign end, for trends
  const hiAt = new Map();
  const histFor = (id) => { if (!hiAt.has(id)) hiAt.set(id, campaigns.map((c) => { try { return healthIndex(ctxHi, id, c.end).score; } catch { return null; } })); return hiAt.get(id); };

  const towerName = (id) => net.towerById.get(id)?.name || id;
  const open360 = (id) => openAsset?.(id);

  /* ---------- drawers */
  function findingDrawer(fid) {
    const f = net.findingById.get(fid); if (!f) return;
    const wo = woByFinding.get(fid);
    const tw = f.tower_id ? net.towerById.get(f.tower_id) : null;
    const same = findings.filter((x) => x.finding_id !== fid && x.tower_id && x.tower_id === f.tower_id).sort((a, b2) => b2.date.localeCompare(a.date));
    const repeat = findings.filter((x) => x.finding_id !== fid && x.asset_id === f.asset_id && x.defect_class === f.defect_class);
    drawer.open({
      icon: 'camera', kicker: `${f.finding_id} · ${f.campaign_id} · ${f.sensor.toUpperCase()}`, title: f.label, sub: `${esc(f.towerName || f.assetName)} · ${esc(f.line || '')} · captured ${fmt.date(f.date)}`,
      badges: [[fmt.title(f.severity), SEV_TONE[f.severity]], [`Review: ${f.review_status}`, f.review_status === 'confirmed' ? 'ok' : f.review_status === 'pending' ? 'warn' : 'muted'], [`${Math.round(f.confidence * 100)}% model confidence`, 'info'], [wo ? `${wo.id} · ${wo.status}` : 'No work order', wo ? 'accent' : 'crit']],
      tabs: [
        { name: 'Finding', body: `${ui.stats([{ label: 'Condition', value: `${f.condition_score} / 5`, color: COND_C[f.condition_score] }, { label: 'Confidence', value: fmt.pct(f.confidence * 100) }, { label: 'Tower HI', value: tw?.hi == null ? '—' : fmt.n(tw.hi, 1), color: bandColor(tw?.band) }, { label: 'Age', value: `${daysBetween(f.date, asOf)} d` }])}
          <div class="nx-drawer-grid"><div class="nx-sec"><h4>Defect</h4>${ui.kv([['Class', esc(f.label)], ['Component group', esc(GROUP_LABEL[f.group] || f.group)], ['Recorded on', esc(f.assetName || f.asset_id)], ['Sensor', `${f.sensor.toUpperCase()} · ${({ rgb: 'RGB-45MP', thermal: 'TIR-640', lidar: 'LiDAR-L2' })[f.sensor] || ''}`], ['Reviewer', esc(f.confirmed_by || '—')]])}</div>
          <div class="nx-sec"><h4>Location</h4>${ui.kv([['Tower', esc(f.towerName || '—')], ['Line', esc(f.line || '—')], ['Corridor', esc(CORRIDOR[f.line] || '—')], ['Latitude', f.lat?.toFixed(5) ?? '—'], ['Longitude', f.lng?.toFixed(5) ?? '—']])}</div></div>
          <div class="nx-sec"><h4>Tower condition across campaigns</h4><div class="nx-chart" style="height:170px" data-chart="fhist"></div></div>
          <div class="nx-sec"><h4>Work</h4>${wo ? ui.kv([['Work order', `<b>${esc(wo.id)}</b> · ${esc(fmt.title(wo.work_type))}`], ['Status', ui.badge(fmt.title(wo.status), wo.status === 'completed' ? 'ok' : 'warn')], ['Planned', fmt.date(wo.planned_date)], ['Crew', esc(wo.crewName)], ['SAP PM / Maximo', `${esc(wo.sap)} · ${esc(wo.maximo)}`]]) : ui.callout(`No work order covers this finding. ${f.condition_score <= 2 ? 'High/critical findings need a work request within 30 days.' : 'Monitor at the next campaign.'}`, f.condition_score <= 2 ? 'crit' : 'warn', 'alert')}</div>`,
          mount: (el, c) => { if (tw) c.chart('fhist', ch.line({ x: campaigns.map((x) => x.name), series: [{ name: `${tw.name} HI`, data: histFor(tw.id).map((v) => (v == null ? null : +v.toFixed(1))), color: bandColor(tw.band), symbol: true, area: true }], yName: 'HI', yMin: 0, yMax: 100, legend: false, grid: { top: 24 } })); } },
        { name: `Same tower (${same.length})`, body: `${repeat.length ? ui.callout(`<b>Repeat defect:</b> ${repeat.length} earlier sighting${repeat.length > 1 ? 's' : ''} of the same class on the same component (${repeat.map((r) => r.finding_id).join(', ')}).`, 'warn', 'sync') : ''}<div class="nx-sec"><h4>Other findings on ${esc(f.towerName || 'this tower')}</h4>${same.length ? `<div class="nx-list">${same.map((x) => ui.li({ ic: 'camera', color: COND_C[x.condition_score], title: `${x.finding_id} · ${x.label}`, sub: `${x.campaign_id} · ${fmt.date(x.date)} · ${x.review_status}`, end: ui.badge(fmt.title(x.severity), SEV_TONE[x.severity]), row: x.finding_id })).join('')}</div>` : ui.empty('No other findings on this tower.')}</div>`, mount: (el, c) => c.on('click', '.nx-li[data-row]', (e, r) => findingDrawer(r.dataset.row)) },
      ],
      actions: [{ label: 'Image evidence', icon: 'camera', onClick: () => { drawer.close(); openFinding?.(fid); } }, ...(wo ? [{ label: wo.id, icon: 'clipboard', onClick: () => woDrawer(wo.id) }] : []), { label: 'Open Asset 360', primary: true, icon: 'eye', onClick: () => { drawer.close(); open360(f.tower_id || f.asset_id); } }],
    });
  }

  /* ---------- tower elevation (digital twin of component condition) */
  function towerTwin(t) {
    const g = Object.fromEntries((t.hiGroups || []).map((x) => [x.group, x.score]));
    const c = (k) => COND_C[Math.round(g[k] ?? 5)] || '#16a34a';
    const steel = c('steel_structure'); const ins = c('insulators'); const fnd = c('foundation'); const acc = c('conductor_accessories'); const lp = c('lightning_protection'); const ta = c('tower_accessories');
    const legs = `<path d="M120 60 L82 330 M120 60 L158 330" stroke="${steel}" stroke-width="5" fill="none"/>`;
    const lattice = [100, 140, 180, 220, 260, 300].map((y, i) => { const w = 7 + (y - 60) * 0.142; return `<path d="M${120 - w} ${y} L${120 + w} ${y}" stroke="${steel}" stroke-width="2.4"/>${i < 5 ? `<path d="M${120 - w} ${y} L${120 + w + 5.6} ${y + 40} M${120 + w} ${y} L${120 - w - 5.6} ${y + 40}" stroke="${steel}" stroke-width="1.4" opacity=".75"/>` : ''}`; }).join('');
    const arms = [[105, 64], [150, 54]].map(([y, w]) => `<path d="M${120 - w} ${y} L${120 + w} ${y} L120 ${y - 14} Z" fill="none" stroke="${steel}" stroke-width="2.6"/>`).join('');
    const strings = [[56, 105], [184, 105], [66, 150], [174, 150]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 30}" stroke="${ins}" stroke-width="3"/>${[0, 1, 2, 3, 4].map((k) => `<ellipse cx="${x}" cy="${y + 5 + k * 5.5}" rx="6" ry="2" fill="${ins}"/>`).join('')}<path d="M${x - 40} ${y + 36} Q${x} ${y + 30} ${x + 40} ${y + 36}" stroke="#94a3b8" stroke-width="1.6" fill="none"/><rect x="${x - 15}" y="${y + 31}" width="7" height="4" rx="1" fill="${acc}"/><rect x="${x + 9}" y="${y + 31}" width="7" height="4" rx="1" fill="${acc}"/>`).join('');
    const peak = `<line x1="120" y1="60" x2="120" y2="36" stroke="${steel}" stroke-width="3"/><circle cx="120" cy="34" r="4" fill="${lp}"/><path d="M60 30 Q120 26 180 30" stroke="${lp}" stroke-width="2" fill="none"/>`;
    const found = `<rect x="66" y="330" width="32" height="18" rx="2" fill="${fnd}" opacity=".9"/><rect x="142" y="330" width="32" height="18" rx="2" fill="${fnd}" opacity=".9"/><line x1="40" y1="331" x2="200" y2="331" stroke="#cbd5e1" stroke-dasharray="4 3"/>`;
    const plate = `<rect x="111" y="250" width="18" height="12" rx="2" fill="${ta}"/>`;
    const legend = (t.hiGroups || []).map((x) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--nx-line-2)"><i style="width:10px;height:10px;border-radius:3px;background:${COND_C[Math.round(x.score)]}"></i><span style="flex:1">${esc(GROUP_LABEL[x.group] || x.group)}</span><b class="nx-num">${fmt.n(x.score, 1)}</b><span class="nx-note">/5</span>${x.findingIds?.length ? ui.badge(`${x.findingIds.length} finding${x.findingIds.length > 1 ? 's' : ''}`, x.score <= 2 ? 'crit' : 'warn', { dot: false }) : ''}</div>`).join('');
    return `<div style="display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center"><svg viewBox="0 0 240 360" style="width:100%;max-height:330px">${peak}${arms}${legs}${lattice}${strings}${plate}${found}</svg><div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><b style="font-size:20px">${esc(t.name)}</b>${hiScore(t.hi, t.band)}${riskBadge(t.riskBand, t.risk)}</div><div class="nx-note" style="margin-bottom:8px">${esc(t.type || '')} · ${t.height ?? '—'} m · corrosion zone ${esc(t.zone || '—')} · built ${String(t.install).slice(0, 4)} · ${esc(t.line)}</div>${legend || ui.empty('Not assessed')}<div class="nx-toolbar" style="margin-top:10px">${ui.btn('Asset 360', { sm: true, primary: true, ic: 'eye', attrs: `data-a360="${esc(t.id)}"` })}${t.findings[0] ? ui.btn('Worst finding', { sm: true, ic: 'camera', attrs: `data-fv="${esc(t.findings.slice().sort((a, b) => a.condition_score - b.condition_score)[0].finding_id)}"` }) : ''}</div></div></div>`;
  }

  /* ================================================================ screens */
  const screens = [];

  /* ---------- Asset Registry */
  screens.push({
    id: 'registry', name: 'Asset Registry', icon: 'registry',
    tabs: [{
      name: 'Overview', icon: 'dashboard',
      render: () => {
        const cls = {}; for (const a of snap.assets) cls[a.class] = (cls[a.class] || 0) + 1;
        const dup = snap.dupRecord.size; const linksReview = snap.links.filter((l) => l.status === 'proposed' && !l.obsolete).length;
        return `<div class="nx-page">${ui.kpis([
          { label: 'Registered assets', value: fmt.n(snap.assets.length), icon: 'registry', sub: `${Object.keys(cls).length} asset classes`, spark: [1510, 1580, 1640, 1690, 1720, snap.assets.length] },
          { label: 'Towers / spans', value: `${towers.length} / ${spans.length}`, icon: 'tower', tone: 'info', sub: `${lines.length} lines · ${fmt.n(lines.reduce((a, l) => a + (l.lengthKm || 0), 0), 1)} km` },
          { label: 'Substations · transformers', value: `${substations.length} · ${transformers.length}`, icon: 'substation', tone: 'violet', sub: `${fmt.n(transformers.reduce((a, t) => a + (t.rating || 0), 0))} MVA installed` },
          { label: 'Links to review', value: fmt.n(linksReview), icon: 'link', tone: 'warn', sub: `${dup} possible duplicate records`, spark: [210, 180, 160, 150, 130, linksReview] },
          { label: 'Data completeness', value: fmt.pct((snap.assets.filter((a) => a.external_ids?.sap || a.external_ids?.gis).length / snap.assets.length) * 100, 1), icon: 'checkCircle', tone: 'ok', sub: 'SAP or GIS key present' },
        ])}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s5', title: 'Asset hierarchy', sub: 'Corridor → line → tower, coloured by health band. Click a segment to drill.', body: ui.chart('sun', 'lg') })}
        ${ui.card({ cls: 'nx-s4', title: 'Assets by class', sub: 'Registered records, merged duplicates excluded', body: ui.chart('cls', 'lg') })}
        ${ui.card({ cls: 'nx-s3', title: 'Register health', sub: 'Master-data quality checks', body: `<div class="nx-list">${[
          ['checkCircle', 'Towers with GIS position', `${towers.length}/${towers.length}`, 'ok'], ['link', 'Findings linked to an asset', fmt.pct((findings.filter((f) => f.asset_id).length / findings.length) * 100), 'ok'],
          ['alert', 'Possible duplicate records', fmt.n(dup), dup ? 'warn' : 'ok'], ['flow', 'Proposed links awaiting decision', fmt.n(linksReview), linksReview ? 'warn' : 'ok'],
          ['calendar', `Inspected in ${lastCamp.name}`, `${inspected.size}/${towers.length}`, 'info'], ['doc', 'Transformers with DGA < 12 months', `${transformers.filter((t) => t.dga.length && daysBetween(t.dga[t.dga.length - 1].date, asOf) < 365).length}/${transformers.length}`, 'ok']].map(([ic, t, v, tn]) => ui.li({ ic, title: t, sub: '', end: ui.badge(v, tn, { dot: false }), color: { ok: '#16a34a', warn: '#d97706', info: '#0284c7' }[tn] })).join('')}</div>`, foot: `${ui.btn('Open link review', { sm: true, ic: 'link', attrs: 'data-golinks' })}` })}</div>
        <div class="nx-row nx-c3">${lines.map((l) => ui.card({ title: l.name, sub: `${l.towers.length} towers · ${l.spans.length} spans · ${l.lengthKm} km · in service ${String(l.install).slice(0, 4)}`, tools: hiScore(l.hi, l.band), body: `${ui.stats([{ label: 'Normal', value: l.bandCounts?.all?.normal ?? '—', color: BAND_C.normal }, { label: 'Moderate', value: l.bandCounts?.all?.moderate ?? '—', color: BAND_C.moderate }, { label: 'Poor', value: l.bandCounts?.all?.poor ?? '—', color: BAND_C.poor }])}`, foot: `<span>${esc(l.corridor)} corridor · criticality ${l.criticality} · risk ${riskBadge(l.riskBand, l.risk)}</span><span style="margin-left:auto">${ui.btn('Towers', { sm: true, attrs: `data-goreg="Towers"` })}</span>` })).join('')}</div></div>`;
      },
      mount: (st, ctx) => {
        const kids = lines.map((l) => ({ name: l.corridor, itemStyle: { color: l.color }, children: [{ name: l.id, itemStyle: { color: l.color }, children: ['normal', 'moderate', 'poor'].map((b) => ({ name: fmt.title(b), value: l.towers.filter((t) => t.band === b).length, itemStyle: { color: BAND_C[b] } })).filter((x) => x.value) }] }));
        ctx.chart('sun', { tooltip: { formatter: (p) => `${esc(p.treePathInfo.map((x) => x.name).filter(Boolean).join(' › '))}<br/><b>${p.value} towers</b>` }, series: [{ type: 'sunburst', data: kids, radius: ['14%', '92%'], sort: null, itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { color: '#fff', fontSize: 11, minAngle: 8 }, levels: [{}, { r0: '14%', r: '40%', label: { fontWeight: 700 } }, { r0: '40%', r: '66%', label: { fontSize: 10.5 } }, { r0: '66%', r: '92%', label: { fontSize: 10 } }] }] });
        const cls = {}; for (const a of snap.assets) cls[a.class] = (cls[a.class] || 0) + 1;
        const data = Object.entries(cls).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: fmt.title(k), value: v }));
        ctx.chart('cls', ch.bar({ x: data.map((d) => d.name), series: [{ name: 'Records', data: data.map((d) => d.value), color: '#3b82f6' }], horizontal: true, labels: true, grid: { top: 6, right: 30 } }));
        ctx.on('click', '[data-golinks]', () => go('registry', 'Links'));
        ctx.on('click', '[data-goreg]', (e, b) => go('registry', b.dataset.goreg));
      },
    }, ...registryTabs.map((t) => ({ ...t, legacy: true }))],
  });

  /* ---------- Tower Health */
  let twinId = heroTower.id;
  screens.push({
    id: 'tower', name: 'Tower Health', icon: 'tower',
    tabs: [
      {
        name: 'Fleet health', icon: 'dashboard',
        render: () => {
          const poor = towers.filter((t) => t.band === 'poor');
          return `<div class="nx-page">${ui.kpis([
            { label: 'Fleet health index', value: fmt.n(fleetHi, 1), unit: '/ 100', icon: 'gauge', tone: 'ok', spark: campaigns.map((c, i) => [93.1, 92.4, fleetHi][i] ?? fleetHi), sub: `${assessed.length} of ${towers.length} towers assessed` },
            { label: 'Poor band (HI < 40)', value: poor.length, icon: 'alert', tone: 'crit', sub: poor.map((t) => t.name).slice(0, 4).join(', ') },
            { label: 'Moderate band (40–69)', value: bandCount(towers, 'moderate'), icon: 'event', tone: 'warn', sub: 'watch list' },
            { label: 'Open tower findings', value: towers.reduce((a, t) => a + t.open, 0), icon: 'camera', tone: 'info', sub: `${towers.reduce((a, t) => a + t.unreviewed, 0)} unreviewed` },
            { label: 'Median tower age', value: [...towers].sort((a, b) => a.age - b.age)[Math.floor(towers.length / 2)].age, unit: 'yrs', icon: 'clock', tone: 'violet', sub: 'by commissioning date' },
          ])}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Component condition — digital twin', sub: 'Each part of the structure is coloured by its component-group score (5 = as new, 1 = failed). Pick any tower.', tools: `<select class="nx-select" data-twin>${towers.slice().sort((a, b) => (a.hi ?? 101) - (b.hi ?? 101)).map((t) => `<option value="${esc(t.id)}" ${t.id === twinId ? 'selected' : ''}>${esc(t.name)} · ${esc(t.line)} · HI ${t.hi == null ? '—' : Math.round(t.hi)}</option>`).join('')}</select>`, body: `<div data-twin-body>${towerTwin(net.towerById.get(twinId))}</div>` })}
          ${ui.card({ cls: 'nx-s5', title: 'Health index distribution', sub: 'Towers per 10-point HI bucket, coloured by band (normal ≥ 70, poor < 40)', body: ui.chart('hist', 'md') })}</div>
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Worst-condition towers', sub: 'Lowest health index first. Click a row for Asset 360.', tools: ui.search('#tw-worst', 'Filter towers…'), flush: true, body: ui.table({ id: 'tw-worst', rowId: (t) => t.id, rows: towers.filter((t) => t.hi != null).sort((a, b) => a.hi - b.hi).slice(0, 25), cols: [
            { key: 'name', label: 'Tower', render: (t) => `<b>${esc(t.name)}</b><span class="nx-sub">${esc(t.line)} · ${esc(t.type || '')}</span>` },
            { key: 'hi', label: 'HI', align: 'r', render: (t) => hiScore(t.hi, t.band) },
            { label: 'Weakest group', sort: (t) => Math.min(...t.hiGroups.map((g) => g.score)), render: (t) => { const w = t.hiGroups.slice().sort((a, b) => a.score - b.score)[0]; return w ? `${esc(GROUP_LABEL[w.group] || w.group)} <span class="nx-note">(${fmt.n(w.score, 1)})</span>` : '—'; } },
            { key: 'open', label: 'Open', align: 'r' }, { key: 'zone', label: 'Zone', align: 'c' }, { key: 'age', label: 'Age', align: 'r' },
            { key: 'risk', label: 'Risk', render: (t) => riskBadge(t.riskBand, t.risk) },
          ] }) })}
          ${ui.card({ cls: 'nx-s5', title: 'Health vs age', sub: 'Each dot a tower; colour = corrosion zone (ISO 9223 C3–C5). Coastal C5 towers decay faster.', body: ui.chart('age', 'lg') })}</div></div>`;
        },
        mount: (st, ctx) => {
          const buckets = Array.from({ length: 10 }, (_, i) => i * 10);
          ctx.chart('hist', ch.bar({ x: buckets.map((b) => `${b}–${b + 9}`), series: [{ name: 'Towers', data: buckets.map((b) => ({ value: assessed.filter((t) => t.hi >= b && t.hi < b + 10 + (b === 90 ? 1 : 0)).length, itemStyle: { color: b < 40 ? BAND_C.poor : b < 70 ? BAND_C.moderate : BAND_C.normal } })) }], labels: true }));
          const zones = [...new Set(assessed.map((t) => t.zone))].sort();
          const zc = { C3: '#0ea5e9', C4: '#8b5cf6', C5: '#ef4444', C2: '#14b8a6' };
          ctx.chart('age', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: { formatter: (p) => `<b>${esc(p.data[2])}</b><br/>Age ${p.data[0]} y · HI ${fmt.n(p.data[1], 1)}` }, xAxis: { type: 'value', name: 'Age (years)', nameLocation: 'middle', nameGap: 26, scale: true }, yAxis: { type: 'value', name: 'HI', min: 0, max: 100 }, series: zones.map((z) => ({ type: 'scatter', name: `Zone ${z}`, symbolSize: 9, itemStyle: { color: zc[z] || '#64748b', opacity: 0.8 }, data: assessed.filter((t) => t.zone === z).map((t) => [+(t.age + (((t.idx || 0) * 37) % 17) / 10 - 0.8).toFixed(2), t.hi, t.name, t.id]), markLine: z === zones[0] ? { silent: true, symbol: 'none', lineStyle: { color: '#dc2626', type: 'dashed' }, data: [{ yAxis: 40, label: { formatter: 'Poor', color: '#dc2626' } }, { yAxis: 70, lineStyle: { color: '#d97706' }, label: { formatter: 'Normal', color: '#d97706' } }] } : undefined })) }, { onClick: (p) => { twinId = p.data[3]; st.querySelector('[data-twin]').value = twinId; st.querySelector('[data-twin-body]').innerHTML = towerTwin(net.towerById.get(twinId)); } });
          ctx.on('change', '[data-twin]', (e, s) => { twinId = s.value; st.querySelector('[data-twin-body]').innerHTML = towerTwin(net.towerById.get(twinId)); });
          ctx.on('click', '[data-a360]', (e, b) => open360(b.dataset.a360));
          ctx.on('click', '[data-fv]', (e, b) => openFinding?.(b.dataset.fv));
          ctx.on('click', '#tw-worst tr[data-row]', (e, r) => open360(r.dataset.row));
        },
      },
      {
        name: 'Component heatmap', icon: 'grid',
        render: () => `<div class="nx-page">${ui.callout('Rows are the 30 towers with the lowest health index; columns are the CIGRE-style component groups that make up the tower health index. Cell = group score (5 good → 1 failed). A red cell caps the tower’s index regardless of the others.', 'info')}${ui.card({ title: 'Component-group condition, worst 30 towers', sub: 'Group score = worst unresolved finding per component, averaged with untouched components', tools: ui.seg('hm-line', [['all', 'All lines'], ...lines.map((l) => [l.id, l.id])], 'all'), body: ui.chart('hm', 'xl') })}</div>`,
        mount: (st, ctx) => {
          const groups = ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection', 'tower_accessories'];
          const draw = (line) => {
            const rows = assessed.filter((t) => line === 'all' || t.line === line).sort((a, b) => a.hi - b.hi).slice(0, 30).reverse();
            const data = []; rows.forEach((t, yi) => groups.forEach((g, xi) => { const s = t.hiGroups.find((x) => x.group === g); data.push([xi, yi, s ? +s.score.toFixed(1) : 5]); }));
            const hmEl = st.querySelector('[data-chart="hm"]'); hmEl.style.height = `${rows.length * 24 + 70}px`;
            const ho = ch.heat({ x: groups.map((g) => GROUP_LABEL[g]), y: rows.map((t) => `${t.name} · ${t.line.slice(2)}`), data, min: 1, max: 5, colors: ['#b91c1c', '#f97316', '#fbbf24', '#bef264', '#16a34a'], label: true, fmtv: (v) => fmt.n(v, 1) }); ho.yAxis.axisLabel.interval = 0; ho.grid.left = 10;
            ctx.chart('hm', ho, { onClick: (p) => open360(rows[p.value[1]].id) });
          };
          draw('all'); ctx.onPick('hm-line', draw);
        },
      },
      {
        name: 'Condition trend', icon: 'trend',
        render: () => `<div class="nx-page"><div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Health index across inspection campaigns', sub: `Re-scored at the end of each aerial campaign (${campaigns.map((c) => c.name).join(' → ')}). The 12 towers that deteriorated most.`, body: ui.chart('tr', 'lg') })}${ui.card({ cls: 'nx-s4', title: 'Movement since first campaign', sub: 'Towers by change in HI', body: ui.chart('mv', 'lg') })}</div>${ui.card({ title: 'Largest deteriorations', sub: 'Condition history over repeated aerial inspections', flush: true, body: '<div data-trtable></div>' })}</div>`,
        mount: (st, ctx) => {
          const rows = assessed.map((t) => { const h = histFor(t.id); const first = h.find((v) => v != null); const last = h[h.length - 1]; return { t, h, d: first != null && last != null ? last - first : 0 }; });
          const worst = rows.slice().sort((a, b) => a.d - b.d).slice(0, 12);
          ctx.chart('tr', ch.line({ x: campaigns.map((c) => `${c.name}\n${fmt.short(c.end)}`), series: worst.map((r) => ({ name: r.t.name, data: r.h.map((v) => (v == null ? null : +v.toFixed(1))), smooth: false, symbol: true })), yName: 'HI', yMin: 0, yMax: 100, legend: true, grid: { top: 60, right: 40 }, markArea: { silent: true, data: [[{ yAxis: 0, itemStyle: { color: 'rgba(220,38,38,.06)' } }, { yAxis: 40 }], [{ yAxis: 40, itemStyle: { color: 'rgba(217,119,6,.05)' } }, { yAxis: 70 }]] } }));
          const bins = [['Improved', (d) => d > 2, '#16a34a'], ['Stable ±2', (d) => d >= -2 && d <= 2, '#94a3b8'], ['−2 to −15', (d) => d < -2 && d >= -15, '#d97706'], ['−15 to −30', (d) => d < -15 && d >= -30, '#ea580c'], ['Worse than −30', (d) => d < -30, '#dc2626']];
          ctx.chart('mv', ch.donut({ data: bins.map(([n, f, c]) => ({ name: n, value: rows.filter((r) => f(r.d)).length, color: c })), center: 'towers' }));
          st.querySelector('[data-trtable]').innerHTML = ui.table({ id: 'trt', rowId: (r) => r.t.id, rows: worst, cols: [{ label: 'Tower', sort: (r) => r.t.name, render: (r) => `<b>${esc(r.t.name)}</b><span class="nx-sub">${esc(r.t.line)}</span>` }, ...campaigns.map((c, i) => ({ label: c.name, align: 'r', sort: (r) => r.h[i], render: (r) => hiScore(r.h[i], r.h[i] == null ? null : r.h[i] < 40 ? 'poor' : r.h[i] < 70 ? 'moderate' : 'normal') })), { label: 'Change', align: 'r', sort: (r) => r.d, render: (r) => ui.delta(r.d, { suffix: '', d: 1 }) }, { label: 'Open findings', align: 'r', sort: (r) => r.t.open, render: (r) => r.t.open }, { label: 'Risk', sort: (r) => r.t.risk, render: (r) => riskBadge(r.t.riskBand, r.t.risk) }] });
          ctx.on('click', '#trt tr[data-row]', (e, r) => open360(r.dataset.row));
        },
      },
    ],
  });

  /* ---------- Line Health */
  let lineSel = 'L-220-03';
  screens.push({
    id: 'line', name: 'Line Health', icon: 'line',
    tabs: [
      {
        name: 'Corridors', icon: 'dashboard',
        render: () => `<div class="nx-page"><div class="nx-row nx-c3">${lines.map((l) => ui.card({ title: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers · rating ${l.rating} MVA`, tools: ui.badge(`${l.kv} kV`, 'accent', { dot: false }), body: `<div style="display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:center"><div class="nx-chart" style="height:130px" data-g="${esc(l.id)}"></div><div>${ui.kv([['Health index', hiScore(l.hi, l.band)], ['Risk', riskBadge(l.riskBand, l.risk)], ['Loading now', `<b data-live="${esc(l.id)}.LOAD">—</b> %`], ['Conductor temp.', `<b data-live="${esc(l.id)}.TC">—</b> °C`], ['Open findings', fmt.n(l.towers.reduce((a, t) => a + t.open, 0) + l.spans.reduce((a, s) => a + s.open, 0))]])}</div></div>`, foot: `<span>Poor: <b style="color:${BAND_C.poor}">${l.bandCounts?.all?.poor ?? 0}</b> · Moderate: <b style="color:${BAND_C.moderate}">${l.bandCounts?.all?.moderate ?? 0}</b></span><span style="margin-left:auto">${ui.btn('Profile', { sm: true, attrs: `data-prof="${esc(l.id)}"` })}</span>` })).join('')}</div>
        ${ui.card({ title: 'Condition profile along the line', sub: 'Health index of every tower (bars) and span (line) from start substation to end. Red bands are poor-condition sections that set the line’s risk.', tools: ui.seg('prof', lines.map((l) => [l.id, l.id]), lineSel), body: ui.chart('prof', 'lg') })}
        <div class="nx-row nx-c2">${ui.card({ title: 'Findings by component group', sub: 'Open, non-rejected findings per line', body: ui.chart('grp', 'md') })}${ui.card({ title: 'Weak sections', sub: 'Consecutive towers/spans below HI 70 — candidates for one grouped outage', flush: true, body: '<div data-weak></div>' })}</div></div>`,
        mount: (st, ctx) => {
          for (const l of lines) ctx.chart(`[data-g="${l.id}"]`, ch.gauge({ value: +(l.hi ?? 0).toFixed(1), name: 'HI', bands: [[0.4, '#dc2626'], [0.7, '#d97706'], [1, '#16a34a']], dec: 1, compact: true }));
          const drawProf = (id) => {
            lineSel = id; const l = lines.find((x) => x.id === id);
            const ts = l.towers; const sp = new Map(l.spans.map((s) => [s.from, s]));
            ctx.chart('prof', { grid: ch.grid({ top: 34, bottom: 30 }), legend: { top: 0, right: 0 }, tooltip: ch.tip(), dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 0 }], xAxis: { type: 'category', data: ts.map((t) => t.name) }, yAxis: { type: 'value', min: 0, max: 100, name: 'HI' }, series: [{ name: 'Tower HI', type: 'bar', barMaxWidth: 10, data: ts.map((t) => ({ value: t.hi == null ? null : +t.hi.toFixed(1), itemStyle: { color: bandColor(t.band), borderRadius: [2, 2, 0, 0] } })) }, { name: 'Span HI', type: 'line', step: 'middle', showSymbol: false, lineStyle: { color: '#0f172a', width: 1.5 }, data: ts.map((t) => { const s = sp.get(t.id); return s?.hi == null ? null : +s.hi.toFixed(1); }), markLine: { silent: true, symbol: 'none', label: { formatter: '{c}', color: '#64748b', fontSize: 10 }, data: [{ yAxis: 40, lineStyle: { color: '#dc2626', type: 'dashed' } }, { yAxis: 70, lineStyle: { color: '#d97706', type: 'dashed' } }] } }] }, { onClick: (p) => open360(ts[p.dataIndex].id) });
            // weak sections
            const secs = []; let cur = null;
            ts.forEach((t, i) => { const s = sp.get(t.id); const weak = (t.hi ?? 100) < 70 || (s?.hi ?? 100) < 70; if (weak) { if (!cur) cur = { from: t, to: t, items: [] }; cur.to = t; cur.items.push(t); } else if (cur) { secs.push(cur); cur = null; } if (i === ts.length - 1 && cur) secs.push(cur); });
            st.querySelector('[data-weak]').innerHTML = ui.table({ id: 'weak', rows: secs.sort((a, b) => b.items.length - a.items.length), rowId: (s) => s.from.id, cols: [{ label: 'Section', render: (s) => `<b>${esc(s.from.name)} → ${esc(s.to.name)}</b><span class="nx-sub">${s.items.length} tower${s.items.length > 1 ? 's' : ''}</span>`, sort: (s) => s.from.idx }, { label: 'Min HI', align: 'r', sort: (s) => Math.min(...s.items.map((t) => t.hi ?? 100)), render: (s) => { const m = s.items.slice().sort((a, b) => (a.hi ?? 100) - (b.hi ?? 100))[0]; return hiScore(m.hi, m.band); } }, { label: 'Findings', align: 'r', sort: (s) => s.items.reduce((a, t) => a + t.open, 0), render: (s) => s.items.reduce((a, t) => a + t.open, 0) }, { label: 'Suggested', render: (s) => (s.items.length >= 3 ? ui.badge('Group outage', 'warn') : ui.badge('Single visit', 'muted')) }], empty: 'No weak sections on this line.' });
          };
          drawProf(lineSel); ctx.onPick('prof', drawProf);
          ctx.on('click', '[data-prof]', (e, b) => { st.querySelector(`[data-seg="prof"] [data-v="${b.dataset.prof}"]`)?.click(); st.querySelector('[data-chart="prof"]').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
          ctx.on('click', '#weak tr[data-row]', (e, r) => open360(r.dataset.row));
          const groups = ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'conductor', 'lightning_protection', 'tower_accessories', 'clearance'];
          const of = openFindings;
          ctx.chart('grp', ch.bar({ x: groups.map((g) => GROUP_LABEL[g] || g), series: lines.map((l) => ({ name: l.id, color: l.color, stack: 's', data: groups.map((g) => of.filter((f) => f.line === l.id && f.group === g).length) })), stack: true, horizontal: true, grid: { top: 30 } }));
        },
      },
      {
        name: 'Spans', icon: 'line',
        render: () => `<div class="nx-page"><div class="nx-row nx-c12">${ui.card({ cls: 'nx-s5', title: 'Span length vs ground clearance', sub: 'LiDAR minimum clearance per span; dashed = statutory minimum for 220 kV (7.0 m). Size = open findings.', body: ui.chart('clr', 'lg') })}${ui.card({ cls: 'nx-s7', title: 'Span register', sub: 'Every span with geometry, clearance and condition', tools: ui.search('#spt', 'Filter spans…'), flush: true, body: `<div style="max-height:400px;overflow:auto">${ui.table({ id: 'spt', rowId: (s) => s.id, rows: spans.slice().sort((a, b) => (a.hi ?? 101) - (b.hi ?? 101)), cols: [{ key: 'name', label: 'Span', render: (s) => `<b>${esc(s.name)}</b><span class="nx-sub">${esc(s.line)}</span>` }, { key: 'length', label: 'Length m', align: 'r', render: (s) => fmt.n(s.length, 0) }, { key: 'clearance', label: 'Clearance m', align: 'r', render: (s) => `<span style="color:${s.clearance < 7.5 ? '#dc2626' : 'inherit'};font-weight:${s.clearance < 7.5 ? 700 : 400}">${fmt.n(s.clearance, 1)}</span>` }, { key: 'hi', label: 'HI', align: 'r', render: (s) => hiScore(s.hi, s.band) }, { key: 'open', label: 'Open', align: 'r' }, { key: 'risk', label: 'Risk', render: (s) => riskBadge(s.riskBand, s.risk) }] })}</div>` })}</div>
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s4', title: 'Ground clearance distribution', sub: 'Spans per 1 m clearance band, stacked by line', body: ui.chart('cdist', 'md') })}${ui.card({ cls: 'nx-s3', title: 'Span length distribution', sub: 'Ruling-span design check, 50 m bands', body: ui.chart('ldist', 'md') })}${ui.card({ cls: 'nx-s5', title: 'LiDAR clearance watch-list', sub: 'Spans under 8.0 m minimum clearance or with ROW findings — vegetation & encroachment patrol', flush: true, body: ui.table({ id: 'watch', rowId: (x) => x.id, rows: spans.filter((x) => x.clearance < 8 || findings.some((f) => f.asset_id?.startsWith('ROW') && f.tower_id === x.from)).sort((a, b) => a.clearance - b.clearance).slice(0, 8), cols: [{ label: 'Span', sort: (x) => x.name, render: (x) => `<b>${esc(x.name)}</b><span class="nx-sub">${esc(x.line)}</span>` }, { label: 'Clearance', align: 'r', sort: (x) => x.clearance, render: (x) => `<b style="color:${x.clearance < 7.5 ? '#dc2626' : '#d97706'}">${fmt.n(x.clearance, 1)} m</b>` }, { label: 'Margin', align: 'r', sort: (x) => x.clearance - 7, render: (x) => `${fmt.n(x.clearance - 7, 1)} m` }, { label: 'Action', sort: false, render: (x) => (x.clearance < 7.5 ? ui.badge('Patrol < 14 d', 'crit') : ui.badge('Next campaign', 'warn')) }], empty: 'All spans clear.' }) })}</div></div>`,
        mount: (st, ctx) => {
          ctx.chart('clr', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: { formatter: (p) => `<b>${esc(p.data[3])}</b><br/>${fmt.n(p.data[0], 0)} m span · ${fmt.n(p.data[1], 1)} m clearance` }, xAxis: { type: 'value', name: 'Span length (m)', nameLocation: 'middle', nameGap: 26, scale: true }, yAxis: { type: 'value', name: 'Clearance (m)', scale: true }, series: lines.map((l, i) => ({ type: 'scatter', name: l.id, itemStyle: { color: l.color, opacity: 0.75 }, symbolSize: (d) => 7 + d[2] * 4, data: l.spans.map((s) => [s.length, s.clearance, s.open, s.name, s.id]), markLine: i === 0 ? { silent: true, symbol: 'none', data: [{ yAxis: 7, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'Min 7.0 m', color: '#dc2626' } }] } : undefined })) }, { onClick: (p) => open360(p.data[4]) });
          ctx.on('click', '#spt tr[data-row]', (e, r) => open360(r.dataset.row));
          const bins = [6, 7, 8, 9, 10, 11, 12];
          ctx.chart('cdist', ch.bar({ x: bins.map((b) => `${b}–${b + 1} m`), series: lines.map((l) => ({ name: l.id, color: l.color, stack: 'c', data: bins.map((b) => l.spans.filter((x) => x.clearance >= b && x.clearance < b + 1).length) })), stack: true, yName: 'spans' }));
          const lb = [250, 300, 350, 400, 450, 500];
          ctx.chart('ldist', ch.bar({ x: lb.map((b) => `${b}–${b + 49}`), series: lines.map((l) => ({ name: l.id, color: l.color, data: lb.map((b) => l.spans.filter((x) => x.length >= b && x.length < b + 50).length) })), yName: 'spans' }));
          ctx.on('click', '#watch tr[data-row]', (e, r) => open360(r.dataset.row));
        },
      },
      {
        name: 'Live loading', icon: 'pulse',
        render: () => `<div class="nx-page">${ui.callout('Operating stress from the SCADA/EMS historian (1 s). Conductor temperature follows IEEE 738 steady-state heat balance from loading; sag from the ruling-span thermal expansion. These feed the consequence and deterioration models.', 'info', 'pulse')}<div class="nx-row nx-c3">${lines.map((l) => ui.card({ title: l.id, sub: `${l.corridor} corridor · ${l.rating} MVA rating`, body: ui.stats([{ label: 'MW', value: '—', live: `${l.id}.MW` }, { label: 'Loading %', value: '—', live: `${l.id}.LOAD` }, { label: 'Current A', value: '—', live: `${l.id}.I` }, { label: 'Voltage kV', value: '—', live: `${l.id}.KV` }, { label: 'Cond. °C', value: '—', live: `${l.id}.TC` }, { label: 'Sag m', value: '—', live: `${l.id}.SAG` }]) })).join('')}</div>
        <div class="nx-row nx-c2">${ui.card({ title: 'Loading, % of thermal rating', sub: 'Last 3 minutes, all lines · 90 % alarm', body: ui.chart('ld', 'md') })}${ui.card({ title: 'Conductor temperature', sub: 'Design limit 75 °C (ACSR), emergency 85 °C', body: ui.chart('tc', 'md') })}</div>
        <div class="nx-row nx-c3">${ui.card({ title: 'Thermal headroom now', sub: 'MVA left before each line reaches its static rating', body: ui.chart('hr', 'md') })}${ui.card({ title: 'Sag vs conductor temperature', sub: 'Every 1 s sample — the clearance cost of heat', body: ui.chart('sag', 'md') })}${ui.card({ title: 'Sending-end voltage', sub: 'Per-unit of nominal, ±5 % operating band', body: ui.chart('pu', 'md') })}</div></div>`,
        mount: (st, ctx) => {
          const draw = () => {
            const n = live.hist('L-220-03.LOAD').length; const x = Array.from({ length: n }, (_, i) => `${n - i}s`);
            ctx.chart('ld', ch.line({ x, series: lines.map((l) => ({ name: l.id, data: live.hist(`${l.id}.LOAD`).map((v) => +v.toFixed(1)), color: l.color, area: true, areaAlpha: '22' })), yName: '%', yMin: 0, yMax: 110, markArea: { silent: true, data: [[{ yAxis: 90, itemStyle: { color: 'rgba(220,38,38,.07)' } }, { yAxis: 110 }]] } }));
            ctx.chart('tc', ch.line({ x, series: lines.map((l) => ({ name: l.id, data: live.hist(`${l.id}.TC`).map((v) => +v.toFixed(1)), color: l.color })), yName: '°C', markArea: { silent: true, data: [[{ yAxis: 75, itemStyle: { color: 'rgba(217,119,6,.08)' } }, { yAxis: 90 }]] } }));
            ctx.chart('hr', ch.bar({ x: lines.map((l) => l.id), series: [{ name: 'Used MVA', stack: 'h', color: '#3b82f6', data: lines.map((l) => Math.round(Math.hypot(live.get(`${l.id}.MW`), live.get(`${l.id}.MVAR`)))) }, { name: 'Headroom MVA', stack: 'h', color: '#bbf7d0', data: lines.map((l) => Math.max(0, Math.round(l.rating - Math.hypot(live.get(`${l.id}.MW`), live.get(`${l.id}.MVAR`))))) }], horizontal: true, stack: true, yName: 'MVA' }));
            ctx.chart('sag', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'item', formatter: (p) => `${esc(p.seriesName)}<br/>${p.value[0]} °C → sag <b>${p.value[1]} m</b>` }, xAxis: { type: 'value', name: '°C', scale: true }, yAxis: { type: 'value', name: 'sag m', scale: true }, series: lines.map((l) => ({ type: 'scatter', name: l.id, symbolSize: 5, itemStyle: { color: l.color, opacity: 0.6 }, data: live.hist(`${l.id}.TC`).map((t, i) => [+t.toFixed(1), +(live.hist(`${l.id}.SAG`)[i] ?? 0).toFixed(2)]) })) });
            ctx.chart('pu', ch.line({ x, series: lines.map((l) => ({ name: l.id, color: l.color, data: live.hist(`${l.id}.KV`).map((v) => +(v / l.kv).toFixed(4)) })), yName: 'p.u.', yMin: 0.94, yMax: 1.06, markArea: { silent: true, data: [[{ yAxis: 0.95, itemStyle: { color: 'rgba(22,163,74,.06)' } }, { yAxis: 1.05 }]] } }));
          };
          draw(); ctx.every(2000, draw);
        },
      },
    ],
  });

  /* ---------- Risk Map */
  const towerInfo = (t) => {
    const f = t.riskFactors; const hist = histFor(t.id);
    return {
      kicker: `${t.line} · ${t.corridor} corridor`, title: `Tower ${t.name}`, sub: `${esc(t.type || '')} · ${t.height ?? '—'} m · zone ${esc(t.zone || '—')} · built ${String(t.install).slice(0, 4)}`,
      badges: [[`HI ${t.hi == null ? '—' : fmt.n(t.hi, 1)}`, BAND_T[t.band] || 'muted'], [`Risk ${t.riskBand || '—'}`, RISK_T[t.riskBand] || 'muted'], [`${t.open} open findings`, t.open ? 'warn' : 'ok']],
      fields: f ? [['Condition (100 − HI)', fmt.n(f.condition.conditionPoints, 1)], ['× Criticality', f.criticality.value], ['× Consequence', `${f.consequence.value}${f.consequence.uplift ? ` <span class="nx-note">(+${f.consequence.uplift} linked)</span>` : ''}`], ['= Risk score', `<b>${fmt.n(t.risk)}</b>`], ['Unreviewed findings', t.unreviewed]] : [['Status', 'Not assessed']],
      spark: { label: 'Health index by campaign', data: hist.map((v) => (v == null ? null : +v.toFixed(1))), x: campaigns.map((c) => c.name), color: bandColor(t.band), min: 0, max: 100 },
      html: t.findings.length ? `<div class="nx-list">${t.findings.slice().sort((a, b) => a.condition_score - b.condition_score).slice(0, 4).map((x) => { const ff = net.findingById.get(x.finding_id); return `<div class="nx-li" data-fd="${esc(x.finding_id)}" style="cursor:pointer;padding:6px 0"><span class="nx-li-ico" style="width:26px;height:26px;background:${COND_C[x.condition_score]}1a;color:${COND_C[x.condition_score]}">${icon('camera')}</span><div class="nx-li-main"><b>${esc(ff?.label || x.defect_class)}</b><span>${x.finding_id} · ${x.review_status} · ${fmt.short(x.date)}</span></div></div>`; }).join('')}</div>` : '',
      actions: [{ label: 'Asset 360', primary: true, icon: 'eye', onClick: () => open360(t.id) }, ...(t.findings[0] ? [{ label: 'Evidence', icon: 'camera', onClick: () => openFinding?.(t.findings.slice().sort((a, b) => a.condition_score - b.condition_score)[0].finding_id) }] : [])],
    };
  };
  const txInfo = (t) => ({ kicker: `Power transformer · ${t.sub}`, title: `${t.name} · ${t.rating} MVA`, sub: `${esc(t.ratio)} kV · ${esc(t.maker || '')} · ${esc(t.serial || '')}`, badges: [[`HI ${t.hi == null ? '—' : fmt.n(t.hi, 1)}`, BAND_T[t.band] || 'muted'], [`Risk ${t.riskBand || '—'}`, RISK_T[t.riskBand] || 'muted'], ...(t.duval ? [[`Duval ${t.duval.zone}`, ['D1', 'D2', 'T3'].includes(t.duval.zone) ? 'crit' : t.duval.zone === 'N' ? 'ok' : 'warn']] : [])], fields: [['Load now', `<b data-live="${t.id}.MVA">—</b> MVA`], ['Top oil', `<b data-live="${t.id}.TOT">—</b> °C`], ['Hot spot', `<b data-live="${t.id}.HST">—</b> °C`], ['Online H₂', `<b data-live="${t.id}.H2">—</b> ppm`], ['Duval', esc(t.duval?.label || '—')]], spark: { label: 'Dissolved H₂ (lab DGA), ppm', data: t.dga.map((d) => d.h2), x: t.dga.map((d) => d.date.slice(2, 7)), color: '#7c3aed' }, actions: [{ label: 'Asset 360', primary: true, icon: 'eye', onClick: () => open360(t.id) }, { label: 'Live P&ID', icon: 'schematic', onClick: () => go('schem', 'TX cooling & DGA P&ID') }] });
  const lineInfo = (l) => ({ kicker: `${l.kv} kV transmission line`, title: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers · ${l.ends.filter(Boolean).join(' → ')}`, badges: [[`HI ${fmt.n(l.hi, 1)}`, BAND_T[l.band] || 'muted'], [`Risk ${l.riskBand || '—'}`, RISK_T[l.riskBand] || 'muted']], fields: [['Loading', `<b data-live="${l.id}.LOAD">—</b> %`], ['Power', `<b data-live="${l.id}.MW">—</b> MW`], ['Conductor', `<b data-live="${l.id}.TC">—</b> °C`], ['Poor / moderate', `${l.bandCounts?.all?.poor ?? 0} / ${l.bandCounts?.all?.moderate ?? 0}`]], spark: { label: 'Tower HI along the line', data: l.towers.map((t) => (t.hi == null ? null : Math.round(t.hi))), color: l.color, type: 'bar', min: 0, max: 100 }, actions: [{ label: 'Line health', primary: true, onClick: () => { lineSel = l.id; go('line', 'Corridors'); } }] });

  screens.push({
    id: 'riskmap', name: 'Risk Map', icon: 'map',
    tabs: [
      {
        name: 'Corridor map', icon: 'map', full: true, exp: RISK_EXP,
        render: () => '<div class="nx-map is-full" id="rm"></div>',
        mount: (st, ctx) => {
          const sev = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d' };
          const layers = networkLayers(net, { onLine: lineInfo, subsInfo: (s) => ({ kicker: 'Substation', title: s.name, sub: `${s.levels.join(' / ')} kV · ${s.bays} bays`, fields: [['Frequency', `<b data-live="${s.id}.F">—</b> Hz`], ...s.levels.map((kv) => [`${kv} kV bus`, `<b data-live="${s.id}.BUS${kv}">—</b> kV`]), ['Lines', s.lines.join(', ')]], actions: [{ label: 'Single-line', primary: true, icon: 'schematic', onClick: () => go('schem', 0) }] }) });
          layers.push({ id: 'spans', name: 'Spans by condition', color: '#d97706', shape: 'line', lines: spans.filter((s) => s.band && s.band !== 'normal').map((s) => ({ id: s.id, coords: s.coords, color: bandColor(s.band), weight: 6, opacity: 0.85, tip: `Span ${s.name} · HI ${fmt.n(s.hi, 0)} · ${s.clearance} m clearance`, info: () => ({ kicker: `Span · ${s.line}`, title: s.name, badges: [[`HI ${fmt.n(s.hi, 1)}`, BAND_T[s.band]], [`Risk ${s.riskBand}`, RISK_T[s.riskBand] || 'muted']], fields: [['Length', `${fmt.n(s.length)} m`], ['Min clearance', `${s.clearance} m`], ['Open findings', s.open]], actions: [{ label: 'Asset 360', primary: true, onClick: () => open360(s.id) }] }) })) });
          layers.push({ id: 'towers', name: 'Towers by risk', color: '#16a34a', points: towers.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, size: t.riskBand === 'critical' ? 16 : t.riskBand === 'high' ? 13 : 9, color: riskC(t.riskBand), pulse: t.riskBand === 'critical', label: t.riskBand === 'critical' ? t.name : null, z: t.riskBand === 'critical' ? 600 : 0, search: `${t.name} ${t.line} tower`, tip: `${t.name} · ${t.line} · HI ${t.hi == null ? '—' : Math.round(t.hi)} · risk ${t.riskBand || '—'}`, info: () => towerInfo(t) })) });
          layers.push({ id: 'findings', name: 'Open findings', color: '#ea580c', shape: 'dia', on: false, points: openFindings.filter((f) => f.lat).map((f) => ({ id: f.finding_id, lat: f.lat + 0.0004, lng: f.lng + 0.0004, size: 9, shape: 'dia', color: sev[f.severity], search: `${f.finding_id} ${f.label}`, tip: `${f.finding_id} · ${f.label} · ${f.severity}`, info: () => ({ kicker: `${f.finding_id} · ${f.campaign_id}`, title: f.label, sub: `${esc(f.towerName || f.assetName)} · ${esc(f.line || '')}`, badges: [[f.severity, SEV_TONE[f.severity]], [f.review_status, f.review_status === 'confirmed' ? 'ok' : 'warn'], [`${Math.round(f.confidence * 100)}% conf.`, 'info']], fields: [['Sensor', f.sensor.toUpperCase()], ['Date', fmt.date(f.date)], ['Work order', woByFinding.get(f.finding_id)?.id || '<span style="color:#dc2626">none</span>']], actions: [{ label: 'Image evidence', primary: true, icon: 'camera', onClick: () => openFinding?.(f.finding_id) }, { label: 'Details', onClick: () => findingDrawer(f.finding_id) }] }) })) });
          layers.push({ id: 'tx', name: 'Transformers', color: '#7c3aed', shape: 'sq', points: transformers.filter((t) => t.lat).map((t, i) => ({ id: t.id, lat: t.lat + (i % 3) * 0.0012 - 0.0012, lng: t.lng + 0.0025, size: 14, shape: 'sq', color: riskC(t.riskBand), icon: 'transformer', search: `${t.name} transformer`, tip: `${t.name} · ${t.rating} MVA · HI ${fmt.n(t.hi, 0)}`, info: () => txInfo(t) })) });
          layers.push({ id: 'overdue', name: 'Overdue for review', color: '#dc2626', shape: 'circle', on: false, points: overdue.filter((o) => o.kind === 'Engineering review').map((o) => ({ id: `od-${o.id}`, lat: o.asset.lat, lng: o.asset.lng, size: 22, color: 'rgba(220,38,38,.25)', pulse: true, tip: `${o.asset.name}: ${o.reason} · ${o.age} days`, info: () => towerInfo(o.asset) })) });
          const crit = towers.filter((t) => t.riskBand === 'critical').length;
          ctx.map('#rm', { layers, legend: [{ label: 'Critical', color: RISK_C.critical }, { label: 'High', color: RISK_C.high }, { label: 'Medium', color: RISK_C.medium }, { label: 'Low', color: RISK_C.low }, { label: '500 kV', color: '#a855f7', line: true }, { label: '220 kV', color: '#3b82f6', line: true }, { label: '132 kV', color: '#14b8a6', line: true }], stats: [{ label: 'Critical towers', value: crit, color: RISK_C.critical }, { label: 'High', value: towers.filter((t) => t.riskBand === 'high').length, color: RISK_C.high }, { label: 'Open findings', value: openFindings.length }, { label: 'Overdue reviews', value: overdue.filter((o) => o.kind === 'Engineering review').length, color: '#dc2626' }, { label: 'L-220-03 load %', value: '—', live: 'L-220-03.LOAD' }] }).then((m) => { if (m) { m.map.on('popupopen', () => {}); st.addEventListener('click', (e) => { const fd = e.target.closest('[data-fd]'); if (fd) openFinding?.(fd.dataset.fd); }); if (location.hash.includes('focus=')) m.select(decodeURIComponent(location.hash.split('focus=')[1])); } });
        },
      },
      {
        name: 'Priority ranking', icon: 'target', exp: RISK_EXP,
        render: () => `<div class="nx-page">${ui.callout(`Risk-priority score = <b>Condition (100 − HI) × Criticality (1–5) × Consequence (1–5)</b>. Consequence starts from voltage class (500 kV = 5, 220 kV = 4, 132 kV = 3) and rises by one for each poor-condition asset it is electrically linked to. Bands: medium ≥ 200, high ≥ 500, critical ≥ 1,000.`, 'info', 'scale')}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', exp: true, title: 'Explainable risk ranking', sub: 'Top 30 assets. Each bar shows how the three factors build the score.', flush: true, tools: ui.search('#prio', 'Filter…'), body: ui.table({ id: 'prio', rowId: (a) => a.id, rows: ranked.slice(0, 30), cols: [
          { label: '#', align: 'r', sort: (a) => ranked.indexOf(a), render: (a) => `<span class="nx-note">${ranked.indexOf(a) + 1}</span>` },
          { label: 'Asset', sort: (a) => a.name, render: (a) => `<b>${esc(a.kind === 'span' ? `Span ${a.name}` : a.kind === 'transformer' ? a.name : `Tower ${a.name}`)}</b><span class="nx-sub">${esc(a.line || a.sub || '')}</span>` },
          { label: 'Condition', align: 'r', sort: (a) => 100 - a.hi, render: (a) => `<span class="nx-num">${fmt.n(100 - a.hi, 0)}</span>` },
          { label: '× Crit.', align: 'c', sort: (a) => net.byId.get(a.id)?.criticality, render: (a) => net.byId.get(a.id)?.criticality ?? '—' },
          { label: '× Cons.', align: 'c', sort: (a) => snap.scores.get(a.id)?.risk?.breakdown?.factors?.consequence?.value, render: (a) => snap.scores.get(a.id)?.risk?.breakdown?.factors?.consequence?.value ?? '—' },
          { label: 'Score', align: 'r', sort: (a) => a.risk, render: (a) => `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div class="nx-bar" style="width:90px"><i style="width:${Math.min(100, (a.risk / 2500) * 100)}%;background:${riskC(a.riskBand)}"></i></div><b class="nx-num">${fmt.n(a.risk)}</b></div>` },
          { label: 'Band', sort: (a) => a.risk, render: (a) => riskBadge(a.riskBand) },
          { label: 'Why', wrap: true, sort: false, render: (a) => esc(explain(a)) },
        ] }) })}
        ${ui.card({ cls: 'nx-s4', exp: true, title: 'Risk matrix', sub: 'Likelihood (inferred from HI, not from failure statistics) × consequence class — count of towers and spans', body: ui.chart('mx', 'lg') })}</div></div>`,
        mount: (st, ctx) => {
          ctx.on('click', '#prio tr[data-row]', (e, r) => open360(r.dataset.row));
          const L = (hi) => (hi < 40 ? 4 : hi < 55 ? 3 : hi < 70 ? 2 : hi < 85 ? 1 : 0);
          const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
          for (const a of [...towers, ...spans]) { if (a.hi == null) continue; const c = snap.scores.get(a.id)?.risk?.breakdown?.factors; if (!c) continue; const cons = Math.min(5, Math.round((c.criticality.value * c.consequence.value) / 5)); grid[L(a.hi)][Math.max(0, cons - 1)] += 1; }
          const data = []; grid.forEach((row, y) => row.forEach((v, x) => data.push({ value: [x, y, v], itemStyle: { color: ['#dcfce7', '#bbf7d0', '#fef08a', '#fdba74', '#fca5a5', '#f87171'][Math.min(5, x + y - 1 < 0 ? 0 : Math.floor((x + y) / 1.6))] } })));
          ctx.chart('mx', { grid: { left: 96, right: 10, top: 10, bottom: 40 }, tooltip: { formatter: (p) => `${p.value[2]} assets` }, xAxis: { type: 'category', name: 'Consequence →', nameLocation: 'middle', nameGap: 26, data: ['1', '2', '3', '4', '5'] }, yAxis: { type: 'category', data: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'], name: '', axisLabel: { fontSize: 10.5 } }, series: [{ type: 'heatmap', data, label: { show: true, fontSize: 13, fontWeight: 700, color: '#0f172a', formatter: (p) => (p.value[2] || '') }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 } }] });
        },
      },
      {
        name: 'Overdue review', icon: 'clock',
        render: () => `<div class="nx-page">${ui.kpis([
          { label: 'Engineering reviews overdue', value: overdue.filter((o) => o.kind === 'Engineering review').length, icon: 'alert', tone: 'crit', sub: 'high/critical findings > 30 days without a work order' },
          { label: 'AI findings awaiting review', value: overdue.filter((o) => o.kind === 'AI finding review').length, icon: 'ai', tone: 'warn', sub: 'assets with model findings > 14 days unreviewed' },
          { label: 'Inspections missed', value: overdue.filter((o) => o.kind === 'Inspection').length, icon: 'drone', tone: 'info', sub: `criticality ≥ 4 towers missed in ${lastCamp.name}` },
          { label: 'Oldest item', value: overdue[0]?.age ?? 0, unit: 'days', icon: 'clock', tone: 'violet', sub: overdue[0] ? `${overdue[0].asset.name} · ${overdue[0].kind}` : '' },
        ])}${ui.card({ title: 'Transmission assets overdue for engineering review or intervention', sub: 'Ordered by days overdue. Click a row to open the asset.', tools: ui.chips('od', [['all', 'All'], ['Engineering review', 'Engineering review', '#dc2626'], ['AI finding review', 'AI review', '#d97706'], ['Inspection', 'Inspection', '#0284c7']], 'all'), flush: true, body: '<div data-od></div>' })}</div>`,
        mount: (st, ctx) => {
          const draw = (k) => { st.querySelector('[data-od]').innerHTML = ui.table({ id: 'odt', rowId: (o) => o.asset.id, rows: overdue.filter((o) => k === 'all' || o.kind === k), cols: [{ label: 'Asset', sort: (o) => o.asset.name, render: (o) => `<b>Tower ${esc(o.asset.name)}</b><span class="nx-sub">${esc(o.asset.line)} · criticality ${o.asset.criticality}</span>` }, { label: 'Type', sort: (o) => o.kind, render: (o) => ui.badge(o.kind, o.tone) }, { label: 'Reason', wrap: true, sort: false, render: (o) => esc(o.reason) }, { label: 'Due', sort: (o) => o.due, render: (o) => fmt.date(o.due) }, { label: 'Overdue', align: 'r', sort: (o) => o.age, render: (o) => `<b style="color:${o.age > 90 ? '#dc2626' : o.age > 45 ? '#ea580c' : '#d97706'}">${o.age} d</b>` }, { label: 'HI', align: 'r', sort: (o) => o.asset.hi, render: (o) => hiScore(o.asset.hi, o.asset.band) }, { label: '', sort: false, render: (o) => ui.btn(o.kind === 'AI finding review' ? 'Review' : 'Request WO in SAP PM', { sm: true, attrs: `data-act="${esc(o.id)}"` }) }] }); };
          draw('all'); ctx.onPick('od', draw);
          ctx.on('click', '[data-act]', (e, b) => { e.stopPropagation(); const o = overdue.find((x) => x.id === b.dataset.act); if (o.kind === 'AI finding review') { const f = o.asset.findings.find((x) => x.review_status === 'pending'); if (f) openFinding?.(f.finding_id); } else { const r = erpRequest('workOrders', `Work order request · Tower ${o.asset.name} · ${o.reason}`, { asset: o.asset.id, sap: o.asset.sap, reason: o.reason }); b.outerHTML = ui.badge(`${r.ref} · requested in SAP PM`, 'ok'); } });
          ctx.on('click', '#odt tr[data-row]', (e, r) => { if (!e.target.closest('button')) open360(r.dataset.row); });
        },
      },
    ],
  });
  function explain(a) {
    if (a.kind === 'transformer') return `${a.duval?.label || 'DGA trend'}; ${a.rating} MVA unit at ${a.sub}.`;
    const t = a.kind === 'span' ? null : a;
    if (!t) return `Span HI ${fmt.n(a.hi, 0)}; ${a.clearance} m clearance; ${a.open} open findings.`;
    const w = t.hiGroups.slice().sort((x, y) => x.score - y.score)[0];
    const conf = t.findings.filter((f) => f.review_status === 'confirmed').length;
    return `${conf} verified finding${conf === 1 ? '' : 's'}; weakest ${GROUP_LABEL[w?.group] || '—'} (${fmt.n(w?.score, 1)}/5) on a ${t.kv} kV criticality-${t.criticality} line.`;
  }

  /* ---------- Maintenance History */
  screens.push({
    id: 'history', name: 'Maintenance History', icon: 'history',
    tabs: [
      {
        name: 'Lifecycle', icon: 'history',
        render: () => {
          const done = workOrders.filter((w) => w.status === 'completed');
          const ttr = done.map((w) => w.ttrDays).filter((v) => v != null && v >= 0);
          const med = ttr.sort((a, b) => a - b)[Math.floor(ttr.length / 2)] ?? 0;
          const reopened = repairs.filter((r) => findings.some((f) => f.date > r.date && (r.closes_finding_ids || []).some((id) => net.findingById.get(id)?.asset_id === f.asset_id && net.findingById.get(id)?.defect_class === f.defect_class))).length;
          return `<div class="nx-page">${ui.kpis([
            { label: 'Inspection campaigns', value: campaigns.length, icon: 'drone', sub: campaigns.map((c) => c.name).join(' · '), tone: 'info' },
            { label: 'Findings recorded', value: fmt.n(findings.length), icon: 'camera', sub: `${findings.filter((f) => f.review_status === 'rejected').length} rejected by reviewers`, spark: campaigns.map((c) => findings.filter((f) => f.campaign_id === c.campaign_id).length) },
            { label: 'Work orders completed', value: `${done.length}/${workOrders.length}`, icon: 'wrench', tone: 'ok', sub: `${repairs.length} repairs recorded` },
            { label: 'Median defect-to-repair', value: med, unit: 'days', icon: 'clock', tone: 'violet', sub: 'finding date → completion' },
            { label: 'Repeat defects after repair', value: reopened, icon: 'sync', tone: reopened ? 'warn' : 'ok', sub: 'same class re-sighted on same asset' },
          ])}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Findings raised vs closed', sub: 'Monthly. Bars = new findings by severity; line = findings closed by repairs.', body: ui.chart('fc', 'lg') })}${ui.card({ cls: 'nx-s4', erp: ['SAP PM', 'workOrders'], title: 'Work by type', sub: 'All work orders, by status', body: ui.chart('wt', 'lg') })}</div>
          ${ui.card({ title: 'Campaigns and maintenance programme', sub: 'Aerial inspection campaigns and every grouped repair visit, on one timeline', body: ui.gantt({ range: ['2026-01-01', '2026-12-31'], now: asOf, labelW: 220, rows: [
            { label: 'Aerial inspection', sub: 'RGB · thermal · LiDAR', bars: campaigns.map((c) => ({ start: c.start, end: c.end, color: '#0284c7', text: c.name, tip: `${c.name}: ${c.inspected_tower_ids.length} towers` })) },
            ...['L-132-01', 'L-220-03', 'L-500-01'].map((l) => ({ label: LINE_NAME[l], sub: `${workOrders.filter((w) => w.line === l).length} work orders`, bars: workOrders.filter((w) => w.line === l && w.planned_date).map((w) => ({ id: w.id, start: w.created_at, end: w.completed_at || w.planned_date, color: w.status === 'completed' ? '#16a34a' : w.status === 'in_progress' ? '#2563eb' : '#d97706', text: '', tip: `${w.id} · ${w.work_type} · ${w.towerName || w.asset} · ${w.status}` })) })),
            { label: 'Substations', sub: 'Transformer work', bars: workOrders.filter((w) => !w.line).map((w) => ({ id: w.id, start: w.created_at, end: w.completed_at || w.planned_date, color: '#7c3aed', text: '', tip: `${w.id} · ${w.work_type} · ${w.asset}` })) },
          ] }) })}</div>`;
        },
        mount: (st, ctx) => {
          const months = Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
          const sevs = ['critical', 'high', 'medium', 'low'];
          const closed = months.map((m) => repairs.filter((r) => r.date.startsWith(m)).reduce((a, r) => a + (r.closes_finding_ids?.length || 0), 0));
          ctx.chart('fc', { ...ch.bar({ x: months.map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })), series: sevs.map((s) => ({ name: fmt.title(s), stack: 'f', color: { critical: '#dc2626', high: '#ea580c', medium: '#f59e0b', low: '#84cc16' }[s], data: months.map((m) => findings.filter((f) => f.date.startsWith(m) && f.severity === s && f.review_status !== 'rejected').length) })), stack: true }), series: [...sevs.map((s) => ({ type: 'bar', name: fmt.title(s), stack: 'f', itemStyle: { color: { critical: '#dc2626', high: '#ea580c', medium: '#f59e0b', low: '#84cc16' }[s] }, data: months.map((m) => findings.filter((f) => f.date.startsWith(m) && f.severity === s && f.review_status !== 'rejected').length) })), { type: 'line', name: 'Closed by repair', data: closed, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { color: '#0f172a', width: 2.5 }, itemStyle: { color: '#0f172a' } }] });
          const types = [...new Set(workOrders.map((w) => w.work_type))];
          ctx.chart('wt', ch.bar({ x: types.map(fmt.title), horizontal: true, stack: true, series: [['completed', '#16a34a'], ['in_progress', '#2563eb'], ['open', '#d97706']].map(([s, c]) => ({ name: fmt.title(s), color: c, data: types.map((t) => workOrders.filter((w) => w.work_type === t && w.status === s).length) })), grid: { top: 30 } }));
          ctx.on('click', '.nx-gantt-bar[data-row]', (e, b) => woDrawer(b.dataset.row));
        },
      },
      {
        name: 'Repairs', icon: 'wrench',
        render: () => `<div class="nx-page">${ui.card({ erp: ['SAP PM', 'workOrders'], title: 'Repair log', sub: 'Every repair confirmed on a work order, with the findings it closed and whether the defect came back', tools: ui.search('#rpt', 'Filter repairs…'), flush: true, body: ui.table({ id: 'rpt', rowId: (r) => r.work_order_id, rows: repairs.slice().sort((a, b) => b.date.localeCompare(a.date)), cols: [
          { key: 'date', label: 'Date', render: (r) => fmt.date(r.date) }, { key: 'repair_id', label: 'Repair', render: (r) => `<b>${esc(r.repair_id)}</b><span class="nx-sub">${esc(r.work_order_id)}</span>` },
          { label: 'Asset', sort: (r) => r.wo?.towerName, render: (r) => `${esc(r.wo?.towerName || r.asset_id)}<span class="nx-sub">${esc(r.wo?.line || 'Substation')}</span>` }, { key: 'action', label: 'Action', render: (r) => esc(fmt.title(r.action)) },
          { label: 'Findings closed', align: 'r', sort: (r) => r.closes_finding_ids?.length, render: (r) => r.closes_finding_ids?.length || 0 },
          { label: 'Days to repair', align: 'r', sort: (r) => r.wo?.ttrDays, render: (r) => (r.wo?.ttrDays != null ? r.wo.ttrDays : '—') },
          { label: 'Outcome', sort: false, render: (r) => { const again = findings.some((f) => f.date > r.date && (r.closes_finding_ids || []).some((id) => { const c = net.findingById.get(id); return c && c.asset_id === f.asset_id && c.defect_class === f.defect_class; })); return again ? ui.badge('Defect re-sighted', 'crit') : r.date > asOf ? ui.badge('Scheduled', 'info') : ui.badge('Effective', 'ok'); } },
        ] }) })}</div>`,
        mount: (st, ctx) => { ctx.on('click', '#rpt tr[data-row]', (e, r) => woDrawer(r.dataset.row)); },
      },
      {
        name: 'Before / after', icon: 'scale',
        render: () => `<div class="nx-page"><div class="nx-row nx-c2">${ui.card({ title: 'Health index before and after repair', sub: 'Towers with a completed repair: HI at the campaign before vs the latest score', body: ui.chart('ba', 'lg') })}${ui.card({ title: 'Repair effect by work type', sub: 'Mean HI gain (points) per completed repair type', body: ui.chart('gain', 'lg') })}</div>
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s4', title: 'Repair outcomes', sub: 'Did the defect stay fixed? Re-sighted = same class seen again on the same asset', body: ui.chart('out', 'md') })}${ui.card({ cls: 'nx-s4', title: 'Defect-to-repair time by work type', sub: 'Days from first sighting to completed repair (min · median · max)', body: ui.chart('ttr', 'md') })}${ui.card({ cls: 'nx-s4', title: 'Repeat defects', sub: 'Repairs whose defect came back — candidates for a design change, not another repair', flush: true, body: '<div data-rep></div>' })}</div></div>`,
        mount: (st, ctx) => {
          const rows = [];
          for (const r of repairs) { const tw = r.wo?.towerId; if (!tw || r.date > asOf) continue; const h = histFor(tw); const before = h.slice().reverse().find((v, i) => v != null && campaigns[h.length - 1 - i].end <= r.date) ?? h[0]; const t = net.towerById.get(tw); if (before == null || t?.hi == null) continue; rows.push({ t, before, after: t.hi, type: r.wo.work_type }); }
          const uniq = [...new Map(rows.map((r) => [r.t.id, r])).values()].slice(0, 18);
          ctx.chart('ba', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: ch.tip({ axisPointer: { type: 'shadow' } }), xAxis: { type: 'category', data: uniq.map((r) => r.t.name), axisLabel: { rotate: 40, fontSize: 10 } }, yAxis: { type: 'value', min: 0, max: 100, name: 'HI' }, series: [{ type: 'bar', name: 'Before', data: uniq.map((r) => +r.before.toFixed(1)), itemStyle: { color: '#cbd5e1' } }, { type: 'bar', name: 'After', data: uniq.map((r) => ({ value: +r.after.toFixed(1), itemStyle: { color: bandColor(r.t.band) } })) }] });
          const by = {}; for (const r of rows) { (by[r.type] ||= []).push(r.after - r.before); }
          const ent = Object.entries(by).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
          ctx.chart('gain', ch.bar({ x: ent.map((e) => fmt.title(e[0])), series: [{ name: 'Mean HI change', data: ent.map((e) => ({ value: +e[1].toFixed(1), itemStyle: { color: e[1] >= 0 ? '#16a34a' : '#dc2626' } })) }], horizontal: true, labels: true, grid: { top: 6, right: 40 } }));
          const again = (r) => findings.some((f) => f.date > r.date && (r.closes_finding_ids || []).some((fid) => { const c = net.findingById.get(fid); return c && c.asset_id === f.asset_id && c.defect_class === f.defect_class; }));
          const done = repairs.filter((r) => r.date <= asOf); const reps = done.filter(again);
          ctx.chart('out', ch.donut({ data: [{ name: 'Effective', value: done.length - reps.length, color: '#16a34a' }, { name: 'Defect re-sighted', value: reps.length, color: '#dc2626' }, { name: 'Scheduled (future)', value: repairs.length - done.length, color: '#94a3b8' }], center: 'repairs' }));
          const types = [...new Set(workOrders.filter((w) => w.ttrDays != null).map((w) => w.work_type))];
          const stat = types.map((t) => { const v = workOrders.filter((w) => w.work_type === t && w.ttrDays != null && w.ttrDays >= 0).map((w) => w.ttrDays).sort((a, b) => a - b); return { t, min: v[0] ?? 0, med: v[Math.floor(v.length / 2)] ?? 0, max: v[v.length - 1] ?? 0, n: v.length }; }).sort((a, b) => b.med - a.med);
          ctx.chart('ttr', { grid: ch.grid({ top: 26 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => { const s0 = stat[ps[0].dataIndex]; return `<b>${esc(fmt.title(s0.t))}</b> · ${s0.n} repairs<br/>min ${s0.min} d · median <b>${s0.med} d</b> · max ${s0.max} d`; } }, xAxis: { type: 'value', name: 'days' }, yAxis: { type: 'category', inverse: true, data: stat.map((x) => fmt.title(x.t)), axisLabel: { fontSize: 10.5 } }, series: [{ type: 'bar', name: 'min', stack: 'r', itemStyle: { color: 'transparent' }, data: stat.map((x) => x.min) }, { type: 'bar', name: 'min → median', stack: 'r', itemStyle: { color: '#93c5fd', borderRadius: [4, 0, 0, 4] }, data: stat.map((x) => x.med - x.min) }, { type: 'bar', name: 'median → max', stack: 'r', itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] }, data: stat.map((x) => x.max - x.med) }] });
          st.querySelector('[data-rep]').innerHTML = ui.table({ id: 'rept', rowId: (r) => r.work_order_id, rows: reps, cols: [{ label: 'Repair', sort: (r) => r.repair_id, render: (r) => `<b>${esc(r.repair_id)}</b><span class="nx-sub">${fmt.date(r.date)}</span>` }, { label: 'Asset', sort: (r) => r.wo?.towerName, render: (r) => `${esc(r.wo?.towerName || r.asset_id)}<span class="nx-sub">${esc(r.wo?.line || '')}</span>` }, { label: 'Action', sort: (r) => r.action, render: (r) => esc(fmt.title(r.action)) }], empty: 'No repeat defects — every repair has held.' });
          ctx.on('click', '#rept tr[data-row]', (e, r) => woDrawer(r.dataset.row));
        },
      },
    ],
  });
  function woDrawer(id) {
    const w = workOrders.find((x) => x.id === id); if (!w) return;
    const rp = repairs.filter((r) => r.work_order_id === id);
    const tw = w.towerId ? net.towerById.get(w.towerId) : null;
    const labourCost = Math.round(w.estCost - w.materials);
    drawer.open({
      icon: 'clipboard', kicker: `${w.id} · SAP PM ${w.sap} · Maximo ${w.maximo}`, title: fmt.title(w.work_type), sub: `${esc(w.towerName || w.asset)} · ${esc(w.line ? LINE_NAME[w.line] || w.line : 'Substation')}`,
      badges: [[fmt.title(w.status), w.status === 'completed' ? 'ok' : w.status === 'in_progress' ? 'info' : 'warn'], [`Priority ${w.priority}`, w.priority === 'high' ? 'crit' : w.priority === 'medium' ? 'warn' : 'muted'], [w.crewName, 'accent'], [w.outage ? 'Outage required' : 'Live-line / no outage', w.outage ? 'high' : 'ok'], [`ERP · SAP PM · ${w.sync}`, w.sync === 'synced' ? 'ok' : 'warn']],
      tabs: [
        { name: 'Overview', body: `${ui.stats([{ label: 'Estimate', value: fmt.money(w.estCost) }, { label: 'Labour', value: `${w.labourH} h` }, { label: 'Materials', value: fmt.money(w.materials) }, { label: 'Defect → closure', value: w.ttrDays != null ? `${w.ttrDays} d` : 'open' }])}
          <div class="nx-drawer-grid"><div class="nx-sec"><h4>Cost build-up</h4><div class="nx-chart" style="height:170px" data-chart="wcost"></div></div>
          <div class="nx-sec"><h4>Asset</h4>${ui.kv([['Asset', esc(w.asset)], ['Tower', esc(w.towerName || '—')], ['Tower HI', tw?.hi == null ? '—' : hiScore(tw.hi, tw.band)], ['Risk', tw ? riskBadge(tw.riskBand, tw.risk) : '—'], ['Created', fmt.date(w.created_at)], ['Planned', fmt.date(w.planned_date)]])}</div></div>
          <div class="nx-sec"><h4>Lifecycle</h4>${ui.timeline([...w.findings.map((f) => ({ when: fmt.date(f.date), title: `${f.finding_id} detected — ${f.label}`, text: `${f.sensor.toUpperCase()} · condition ${f.condition_score}/5 · ${f.review_status}`, tone: SEV_TONE[f.severity] })), { when: fmt.date(w.created_at), title: 'Work order created in SAP PM', text: `Estimated ${fmt.money(w.estCost)} · ${w.labourH} labour-hours`, tone: 'info' }, { when: fmt.date(w.planned_date), title: 'Planned visit', text: esc(w.crewName), tone: 'muted' }, ...rp.map((r) => ({ when: fmt.date(r.date), title: `${r.repair_id} — ${fmt.title(r.action)}`, text: `Closed ${r.closes_finding_ids?.length || 0} finding(s)`, tone: 'ok' }))])}</div>`,
          mount: (el, c) => c.chart('wcost', ch.donut({ data: [{ name: 'Labour & equipment', value: labourCost, color: '#3b82f6' }, { name: 'Materials', value: w.materials, color: '#f59e0b' }], center: 'estimate', value: fmt.money(w.estCost), legend: 'right' })) },
        { name: `Findings (${w.findings.length})`, body: `<div class="nx-sec"><h4>Findings this order closes</h4>${w.findings.length ? `<div class="nx-list">${w.findings.map((f) => ui.li({ ic: 'camera', color: COND_C[f.condition_score], title: `${f.finding_id} · ${f.label}`, sub: `${f.campaign_id} · ${fmt.date(f.date)} · ${Math.round(f.confidence * 100)}% conf.`, end: ui.badge(fmt.title(f.severity), SEV_TONE[f.severity]), row: f.finding_id })).join('')}</div>` : ui.empty('Raised from a planned programme, not a finding.')}</div>`, mount: (el, c) => c.on('click', '.nx-li[data-row]', (e, r) => findingDrawer(r.dataset.row)) },
      ],
      actions: [{ label: 'Open Asset 360', primary: true, icon: 'eye', onClick: () => { drawer.close(); open360(w.towerId || w.asset_id); } }],
    });
  }

  /* ---------- Work Orders (Operations): open and planned work, read from the ERP */
  const STAGE_T = { requested: 'muted', approved: 'accent', planned: 'info', scheduled: 'violet', in_progress: 'warn', completed: 'ok', open: 'warn' };
  const openWos = workOrders.filter((w) => w.status !== 'completed').sort((a, b) => (net.towerById.get(b.towerId)?.risk ?? 0) - (net.towerById.get(a.towerId)?.risk ?? 0) || String(a.planned_date).localeCompare(String(b.planned_date)));
  const woAssets = new Set(openWos.map((w) => w.towerId || w.asset_id));
  const poorNoWo = towers.filter((t) => t.band === 'poor' && !woAssets.has(t.id));
  const erpLink = (href, label) => `<a href="${href}" style="font-weight:600;color:inherit;text-decoration:underline">${label}</a>`;
  screens.push({
    id: 'work', name: 'Work Orders', icon: 'clipboard',
    tabs: [{
      name: 'Open and planned work', icon: 'clipboard',
      render: () => {
        const late = openWos.filter((w) => w.planned_date && w.planned_date < asOf);
        return `<div class="nx-page">${ui.callout(`Work orders are <b>read from the ERP</b> (${esc(net.erp.syncedText('workOrders'))}) through the integration layer and joined to the same towers, spans and transformers as the health scores. They are created and changed in SAP PM, never entered here. Planning and scheduling: ${erpLink('/operations/', 'Field Operations')}.`, 'info', 'database')}
        ${ui.kpis([
          { label: 'Open work orders', value: openWos.length, icon: 'clipboard', tone: 'info', sub: `${openWos.filter((w) => w.status === 'in_progress').length} in progress` },
          { label: 'Past planned date', value: late.length, icon: 'clock', tone: late.length ? 'crit' : 'ok', sub: late.length ? `oldest ${fmt.date(late.map((w) => w.planned_date).sort()[0])}` : 'none overdue' },
          { label: 'Estimate on open orders', value: fmt.money(openWos.reduce((a, w) => a + (w.estCost || 0), 0)), icon: 'dollar', tone: 'violet', sub: `${fmt.n(openWos.reduce((a, w) => a + (w.labourH || 0), 0))} labour-hours` },
          { label: 'Assets with open work', value: woAssets.size, icon: 'tower', tone: 'ok', sub: `${openWos.filter((w) => w.outage).length} orders need an outage` },
          { label: 'Poor-band towers without an order', value: poorNoWo.length, icon: 'alert', tone: poorNoWo.length ? 'warn' : 'ok', sub: poorNoWo.length ? poorNoWo.slice(0, 3).map((t) => t.name).join(', ') : 'every poor tower is covered' },
        ])}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', erp: ['SAP PM', 'workOrders'], title: 'Open and planned work orders', sub: 'Every order that is not completed, highest-risk asset first. Click a row for the order.', tools: ui.search('#wo-open', 'Filter work orders…'), flush: true, body: ui.table({ id: 'wo-open', rowId: (w) => w.id, rows: openWos, empty: 'No open work orders in SAP PM.', cols: [
          { label: 'Work order', sort: (w) => w.id, render: (w) => `<b>${esc(w.id)}</b><span class="nx-sub nx-mono">SAP ${esc(w.sap)}</span>` },
          { label: 'Asset', sort: (w) => w.towerName || w.asset, render: (w) => `${esc(w.towerName || w.asset)}<span class="nx-sub">${esc(w.line || 'Substation')}</span>` },
          { label: 'Work', sort: (w) => w.work_type, render: (w) => esc(fmt.title(w.work_type)) },
          { label: 'Status', sort: (w) => w.stage, render: (w) => ui.badge(fmt.title(w.stage), STAGE_T[w.stage] || 'muted') },
          { label: 'Priority', sort: (w) => ({ high: 0, medium: 1, low: 2 }[w.priority] ?? 3), render: (w) => ui.badge(fmt.title(w.priority), w.priority === 'high' ? 'crit' : w.priority === 'medium' ? 'warn' : 'muted', { dot: false }) },
          { label: 'Tower HI', align: 'r', sort: (w) => net.towerById.get(w.towerId)?.hi ?? 101, render: (w) => { const t = net.towerById.get(w.towerId); return t?.hi == null ? '—' : hiScore(t.hi, t.band); } },
          { label: 'Crew', sort: (w) => w.crewName, render: (w) => esc(w.crewName) },
          { label: 'Planned', sort: (w) => w.planned_date, render: (w) => (w.planned_date && w.planned_date < asOf ? `<span style="color:#dc2626;font-weight:600">${fmt.short(w.planned_date)}</span>` : fmt.short(w.planned_date)) },
          { label: 'Estimate', align: 'r', sort: (w) => w.estCost, render: (w) => `<span class="nx-num">${fmt.money(w.estCost)}</span>` },
        ] }) })}
        ${ui.card({ cls: 'nx-s4', erp: ['SAP PM', 'workOrders'], title: 'Open work by status and type', sub: 'Order status in SAP PM', body: ui.chart('wstage', 'lg') })}</div></div>`;
      },
      mount: (st, ctx) => {
        const stages = ['requested', 'approved', 'planned', 'scheduled', 'in_progress'];
        const types = [...new Set(openWos.map((w) => w.work_type))];
        ctx.chart('wstage', ch.bar({ x: types.map(fmt.title), horizontal: true, stack: true, series: stages.map((sg, i) => ({ name: fmt.title(sg), color: ['#94a3b8', '#60a5fa', '#0284c7', '#8b5cf6', '#f59e0b'][i], data: types.map((t) => openWos.filter((w) => w.work_type === t && w.stage === sg).length) })), grid: { top: 44 } }));
        ctx.on('click', '#wo-open tr[data-row]', (e, r) => woDrawer(r.dataset.row));
      },
    }],
  });

  /* ---------- Inventory & Parts (Operations): the materials the open findings need, read from the ERP */
  const partNeed = new Map();
  for (const f of openFindings) {
    const sku = net.partFor(f.defect_class, f.kv); if (!sku) continue;
    const c = partNeed.get(sku) || { qty: 0, findings: 0, assets: new Set() };
    c.qty += net.partQty[sku] || 1; c.findings += 1; c.assets.add(f.tower_id || f.asset_id); partNeed.set(sku, c);
  }
  const partRows = net.parts.filter((p) => partNeed.has(p.sku)).map((p) => { const n = partNeed.get(p.sku); return { ...p, need: n.qty, nFindings: n.findings, nAssets: n.assets.size, short: Math.max(0, n.qty - p.available) }; }).sort((a, b) => b.short * b.unitCost - a.short * a.unitCost || b.need * b.unitCost - a.need * a.unitCost);
  const partSuppliers = net.suppliers.map((sp) => ({ ...sp, items: partRows.filter((r) => r.supplier === sp.id), short: partRows.filter((r) => r.supplier === sp.id && r.short).length })).filter((sp) => sp.items.length);
  screens.push({
    id: 'parts', name: 'Inventory & Parts', icon: 'boxes',
    tabs: [{
      name: 'Parts for open findings', icon: 'box',
      render: () => {
        const short = partRows.filter((r) => r.short);
        return `<div class="nx-page">${ui.callout(`Materials, stock and suppliers are <b>read from the ERP</b> (${esc(net.erp.syncedText('inventory'))}) through the integration layer. Stock is kept in SAP MM and is not re-entered here; this view only matches it against the parts the open findings need. Reservations and purchase requests: ${erpLink('/inventory/', 'Supply Chain & Inventory')}.`, 'info', 'database')}
        ${ui.kpis([
          { label: 'Catalogue items needed', value: partRows.length, icon: 'box', tone: 'info', sub: `for ${openFindings.length} open findings` },
          { label: 'Items short of stock', value: short.length, icon: 'alert', tone: short.length ? 'crit' : 'ok', sub: short.length ? short.slice(0, 2).map((r) => r.sku).join(', ') : 'all needs covered' },
          { label: 'Material value needed', value: fmt.money(partRows.reduce((a, r) => a + r.need * r.unitCost, 0)), icon: 'dollar', tone: 'violet', sub: 'at standard cost' },
          { label: 'Longest lead time (short items)', value: short.length ? Math.max(...short.map((r) => r.lead)) : 0, unit: 'days', icon: 'clock', tone: 'warn', sub: short.length ? short.slice().sort((a, b) => b.lead - a.lead)[0].supplierName : 'nothing to order' },
          { label: 'Suppliers involved', value: partSuppliers.length, icon: 'factory', tone: 'ok', sub: `${partSuppliers.filter((sp) => sp.short).length} with a short item` },
        ])}
        <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', erp: ['SAP MM', 'inventory'], title: 'Parts needed for open findings', sub: 'Bill of materials for every open finding against available stock (on hand minus reserved), largest shortfall first', tools: ui.search('#parts-need', 'Filter parts…'), flush: true, body: ui.table({ id: 'parts-need', rows: partRows, empty: 'No open finding needs a catalogue part.', cols: [
          { label: 'Material', sort: (r) => r.sku, render: (r) => `<b class="nx-mono">${esc(r.sku)}</b><span class="nx-sub">${esc(r.name)}</span>` },
          { label: 'Needed for', sort: (r) => r.nFindings, render: (r) => `${r.nFindings} finding${r.nFindings === 1 ? '' : 's'}<span class="nx-sub">${r.nAssets} asset${r.nAssets === 1 ? '' : 's'}</span>` },
          { label: 'Need', align: 'r', sort: (r) => r.need, render: (r) => `<span class="nx-num">${fmt.n(r.need)}</span> ${esc(r.uom)}` },
          { label: 'Available', align: 'r', sort: (r) => r.available, render: (r) => `<span class="nx-num">${fmt.n(r.available)}</span><span class="nx-sub">${fmt.n(r.onHand)} on hand · ${fmt.n(r.reserved)} reserved</span>` },
          { label: 'Cover', sort: (r) => r.short, render: (r) => (r.short ? ui.badge(`Short by ${fmt.n(r.short)}`, r.available > 0 ? 'warn' : 'crit') : ui.badge('In stock', 'ok')) },
          { label: 'Lead time', align: 'r', sort: (r) => r.lead, render: (r) => `${r.lead} d` },
          { label: 'Supplier', sort: (r) => r.supplierName, render: (r) => esc(r.supplierName) },
        ] }) })}
        ${ui.card({ cls: 'nx-s4', erp: ['SAP MM', 'inventory'], title: 'Need vs available stock', sub: 'The ten items with the highest need', body: ui.chart('pneed', 'lg') })}</div>
        ${ui.card({ erp: ['SAP MM', 'suppliers'], title: 'Suppliers of these parts', sub: `Vendor master and delivery performance · ${esc(net.erp.syncedText('suppliers'))}`, flush: true, body: ui.table({ id: 'parts-sup', rows: partSuppliers, cols: [
          { label: 'Supplier', sort: (x) => x.name, render: (x) => `<b>${esc(x.name)}</b><span class="nx-sub">${esc(x.id)} · ${esc(x.country)}</span>` },
          { label: 'Supplies', sort: (x) => x.cat, render: (x) => esc(x.cat) },
          { label: 'Items needed', align: 'r', sort: (x) => x.items.length, render: (x) => `${x.items.length}${x.short ? ` <span class="nx-note">(${x.short} short)</span>` : ''}` },
          { label: 'On-time delivery', align: 'r', sort: (x) => x.otd, render: (x) => ui.badge(`${x.otd}%`, x.otd >= 92 ? 'ok' : x.otd >= 85 ? 'warn' : 'crit', { dot: false }) },
          { label: 'Lead time', align: 'r', sort: (x) => x.lead, render: (x) => `${x.lead} d` },
          { label: 'Quality', align: 'r', sort: (x) => x.quality, render: (x) => `${x.quality}%` },
        ] }) })}</div>`;
      },
      mount: (st, ctx) => {
        const top = partRows.slice().sort((a, b) => b.need - a.need).slice(0, 10);
        ctx.chart('pneed', ch.bar({ x: top.map((r) => r.sku), horizontal: true, series: [{ name: 'Need', color: '#f59e0b', data: top.map((r) => r.need) }, { name: 'Available', color: '#3b82f6', data: top.map((r) => r.available) }], grid: { top: 30 } }));
      },
    }],
  });

  /* ---------- Reliability Dashboard */
  screens.push({
    id: 'dashboard', name: 'Reliability Dashboard', icon: 'pulse',
    tabs: [
      {
        name: 'Executive overview', icon: 'dashboard',
        render: () => {
          const critN = ranked.filter((a) => a.riskBand === 'critical').length;
          return `<div class="nx-page">${ui.hero({ text: heroText, meta: [{ label: 'Risk score', value: fmt.n(heroTower.risk) }, { label: 'Health index', value: fmt.n(heroTower.hi, 1) }, { label: 'L-220-03 loading %', value: '—', live: 'L-220-03.LOAD' }], actions: `<button type="button" class="nx-btn" data-a360="${esc(heroTower.id)}">${icon('eye')}Open Asset 360</button>` })}
          ${ui.kpis([
            { label: 'Fleet health index', value: fmt.n(fleetHi, 1), unit: '/100', icon: 'gauge', tone: 'ok', delta: -0.8, sub: 'vs Q2 campaign', spark: [93.6, 93.4, 93.1, 92.9, 92.7, fleetHi] },
            { label: 'Critical-risk assets', exp: true, value: critN, icon: 'alert', tone: 'crit', delta: 1, deltaSuffix: '', deltaInvert: true, sub: `${ranked.filter((a) => a.riskBand === 'high').length} high`, spark: [3, 4, 4, 5, 5, critN] },
            { label: 'Open findings', value: openFindings.length, icon: 'camera', tone: 'warn', sub: `${pending.length} awaiting review`, spark: campaigns.map((c) => findings.filter((f) => f.campaign_id === c.campaign_id).length) },
            { label: 'Overdue reviews', value: overdue.filter((o) => o.kind !== 'Inspection').length, icon: 'clock', tone: 'crit', sub: `oldest ${overdue[0]?.age ?? 0} days` },
            { label: 'Work orders open', value: workOrders.filter((w) => w.status !== 'completed').length, icon: 'wrench', tone: 'info', sub: `${workOrders.filter((w) => w.status === 'in_progress').length} in progress` },
            { label: 'Transformer fleet HI', value: fmt.n(transformers.reduce((a, t) => a + (t.hi || 0), 0) / transformers.length, 1), icon: 'transformer', tone: 'violet', sub: `${transformers.filter((t) => t.duval && t.duval.zone !== 'N' && t.duval.zone !== 'PD').length} with DGA fault zone` },
          ])}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s5', exp: true, title: 'Where the risk is', sub: 'Towers by risk band on the corridors — click a dot', flush: true, body: '<div class="nx-map" id="dmap" style="height:380px;border-radius:0 0 12px 12px"></div>' })}
          ${ui.card({ cls: 'nx-s4', exp: true, title: 'Top risks', sub: 'Condition × criticality × consequence', flush: true, body: `<div class="nx-list" style="padding:0 16px">${ranked.slice(0, 7).map((a) => ui.li({ ic: a.kind === 'transformer' ? 'transformer' : a.kind === 'span' ? 'line' : 'tower', color: riskC(a.riskBand), title: `${a.kind === 'transformer' ? a.name : a.kind === 'span' ? `Span ${a.name}` : `Tower ${a.name}`} · ${a.line || a.sub || ''}`, sub: esc(explain(a)), end: `<b class="nx-num" style="color:${riskC(a.riskBand)}">${fmt.n(a.risk)}</b>`, row: a.id })).join('')}</div>` })}
          ${ui.card({ cls: 'nx-s3', exp: true, title: 'Risk distribution', sub: 'Scored towers, spans, transformers', body: ui.chart('rd', 'md') })}</div>
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s5', title: 'Line health by campaign', sub: 'Length-weighted line health index, re-scored at each campaign end', body: ui.chart('lh', 'md') })}${ui.card({ cls: 'nx-s4', title: 'Defect Pareto', sub: 'Open findings by defect class — the vital few', body: ui.chart('par', 'md') })}${ui.card({ cls: 'nx-s3', title: 'Transformer condition', sub: 'Online DGA & HI', flush: true, body: `<div class="nx-list" style="padding:0 16px">${transformers.map((t) => ui.li({ ic: 'transformer', color: bandColor(t.band), title: `${t.name} · ${t.rating} MVA`, sub: `${esc(t.duval?.label || 'Normal ageing')} · H₂ <span data-live="${t.id}.H2">—</span> ppm`, end: hiScore(t.hi, t.band), row: t.id })).join('')}</div>` })}</div></div>`;
        },
        mount: (st, ctx) => {
          ctx.on('click', '[data-a360]', (e, b) => open360(b.dataset.a360));
          ctx.on('click', '.nx-li[data-row]', (e, r) => open360(r.dataset.row));
          const rb = ['critical', 'high', 'medium', 'low'];
          ctx.chart('rd', ch.donut({ data: rb.map((b) => ({ name: fmt.title(b), value: ranked.filter((a) => a.riskBand === b).length, color: RISK_C[b] })), center: 'assets', legend: false, radius: ['58%', '82%'] }));
          ctx.chart('lh', ch.line({ x: campaigns.map((c) => c.name), series: lines.map((l) => ({ name: l.id, color: l.color, symbol: true, smooth: false, data: histFor(l.id).map((v) => (v == null ? null : +v.toFixed(1))) })), yName: 'HI', yMin: 80, yMax: 100 }));
          const by = {}; for (const f of openFindings) by[f.label] = (by[f.label] || 0) + 1;
          const ent = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8); const tot = ent.reduce((a, e) => a + e[1], 0); let cum = 0;
          ctx.chart('par', { grid: ch.grid({ top: 26, bottom: 4 }), tooltip: ch.tip({ axisPointer: { type: 'shadow' } }), xAxis: { type: 'category', data: ent.map((e) => e[0].replace(/ /, '\n')), axisLabel: { fontSize: 9.5, interval: 0 } }, yAxis: [{ type: 'value' }, { type: 'value', max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { show: false } }], series: [{ type: 'bar', name: 'Findings', data: ent.map((e) => e[1]), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } }, { type: 'line', name: 'Cumulative %', yAxisIndex: 1, data: ent.map((e) => { cum += e[1]; return +((cum / tot) * 100).toFixed(1); }), lineStyle: { color: '#ea580c' }, itemStyle: { color: '#ea580c' }, symbol: 'circle' }] });
          const layers = networkLayers(net, { onLine: lineInfo, towers: true, towerColor: (t) => riskC(t.riskBand), towerInfo });
          ctx.map('#dmap', { layers, panel: false, padding: [20, 20] });
        },
      },
      {
        name: 'Case: engineering review', icon: 'doc',
        render: () => {
          const t = heroTower; const f = t.findings.slice().sort((a, b) => a.condition_score - b.condition_score);
          return `<div class="nx-page">${ui.hero({ kicker: 'Engineering review case', icon: 'doc', text: heroText, meta: [{ label: 'Opened', value: fmt.short(asOf) }, { label: 'Priority', value: fmt.title(t.riskBand || '—') }] })}
          <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s7', title: 'Structure condition', sub: 'Component groups on the tower elevation', body: towerTwin(t) })}${ui.card({ exp: true, cls: 'nx-s5', title: 'Why this tower is at the top', sub: 'Explainable risk build-up', body: `<div class="nx-chart is-md" data-chart="wf"></div>${ui.callout(`Recommendation: structural engineer to review ${esc(t.name)} within 10 working days; raise a grouped work order with the adjacent weak spans on ${esc(t.line)} for the next outage window.`, 'warn', 'wrench')}` })}</div>
          ${ui.card({ title: 'Evidence', sub: 'Findings on this tower across campaigns', flush: true, body: ui.table({ id: 'ev', rowId: (x) => x.finding_id, rows: f, cols: [{ key: 'finding_id', label: 'Finding', render: (x) => `<b>${esc(x.finding_id)}</b>` }, { label: 'Defect', sort: (x) => x.defect_class, render: (x) => esc(DEFECT_LABEL[x.defect_class] || x.defect_class) }, { label: 'Group', sort: (x) => x.group, render: (x) => esc(GROUP_LABEL[x.group] || x.group) }, { key: 'condition_score', label: 'Condition', align: 'c', render: (x) => `<span class="nx-score" style="background:${COND_C[x.condition_score]}1f;color:${COND_C[x.condition_score]}">${x.condition_score}</span>` }, { key: 'review_status', label: 'Review', render: (x) => ui.badge(x.review_status, x.review_status === 'confirmed' ? 'ok' : 'warn') }, { key: 'date', label: 'Date', render: (x) => fmt.date(x.date) }, { label: 'Confidence', align: 'r', sort: (x) => x.confidence, render: (x) => fmt.pct(x.confidence * 100) }, { label: '', sort: false, render: (x) => ui.btn('Image', { sm: true, ic: 'camera', attrs: `data-fv="${esc(x.finding_id)}"` }) }] }) })}
          <div class="nx-row nx-c3">${ui.card({ title: `Condition history of ${esc(t.name)}`, sub: 'HI at each campaign end and findings sighted per campaign', body: ui.chart('chist', 'md') })}${ui.card({ title: 'Neighbouring structures', sub: `Health index of the five towers either side on ${esc(t.line)}`, body: ui.chart('nbr', 'md') })}${ui.card({ title: `Operating stress on ${esc(t.line)}`, sub: 'Live — loading drives conductor and fitting temperature at this structure', body: `${ui.stats([{ label: 'Loading %', value: '—', live: `${t.line}.LOAD` }, { label: 'Conductor °C', value: '—', live: `${t.line}.TC` }, { label: 'Current A', value: '—', live: `${t.line}.I` }])}<div class="nx-chart" style="height:190px" data-chart="cstress"></div>` })}</div>
          ${ui.card({ title: 'Proposed grouped work package', sub: `Open findings within five towers of ${esc(t.name)} that one outage on ${esc(t.line)} can clear`, flush: true, body: '<div data-pkg></div>' })}</div>`;
        },
        mount: (st, ctx) => {
          const f = heroTower.riskFactors;
          if (f) {
            const c = f.condition.conditionPoints; const a = c * f.criticality.value; const r = a * f.consequence.value;
            ctx.chart('wf', ch.bar({ x: ['Condition\n100 − HI', `× Criticality\n${f.criticality.value}`, `× Consequence\n${f.consequence.value}`], series: [{ name: 'Score', data: [{ value: +c.toFixed(1), itemStyle: { color: '#94a3b8' } }, { value: +a.toFixed(1), itemStyle: { color: '#f59e0b' } }, { value: +r.toFixed(1), itemStyle: { color: riskC(heroTower.riskBand) } }], labelFmt: (p) => fmt.n(p.value) }], labels: true, legend: false }));
          }
          ctx.on('click', '[data-fv]', (e, b) => openFinding?.(b.dataset.fv));
          ctx.on('click', '[data-a360]', (e, b) => open360(b.dataset.a360));
          const t = heroTower;
          ctx.chart('chist', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: campaigns.map((c) => c.name) }, yAxis: [{ type: 'value', name: 'HI', min: 0, max: 100 }, { type: 'value', name: 'findings', splitLine: { show: false }, minInterval: 1 }], series: [{ type: 'line', name: 'Health index', data: histFor(t.id).map((v) => (v == null ? null : +v.toFixed(1))), symbol: 'circle', symbolSize: 8, lineStyle: { color: '#dc2626', width: 2.5 }, itemStyle: { color: '#dc2626' } }, { type: 'bar', name: 'Findings sighted', yAxisIndex: 1, barWidth: 26, itemStyle: { color: '#fdba74', borderRadius: [4, 4, 0, 0] }, data: campaigns.map((c) => findings.filter((f) => f.tower_id === t.id && f.campaign_id === c.campaign_id).length) }] });
          const lt = lines.find((l) => l.id === t.line)?.towers || []; const i0 = lt.findIndex((x) => x.id === t.id); const nb = lt.slice(Math.max(0, i0 - 5), i0 + 6);
          ctx.chart('nbr', ch.bar({ x: nb.map((x) => x.name), series: [{ name: 'HI', data: nb.map((x) => ({ value: x.hi == null ? null : +x.hi.toFixed(1), itemStyle: { color: bandColor(x.band), opacity: x.id === t.id ? 1 : 0.55, borderColor: x.id === t.id ? '#0f172a' : undefined, borderWidth: x.id === t.id ? 2 : 0 } })) }], yName: 'HI', legend: false, max: 100 }), { onClick: (p) => open360(nb[p.dataIndex].id) });
          const drawS = () => { const h = live.hist(`${t.line}.LOAD`); ctx.chart('cstress', ch.line({ x: h.map((_, i) => `${h.length - i}s`), series: [{ name: 'Loading %', data: h.map((v) => +v.toFixed(1)), color: '#3b82f6', area: true }, { name: 'Conductor °C', data: live.hist(`${t.line}.TC`).map((v) => +v.toFixed(1)), color: '#ea580c', yAxisIndex: 1 }], y2Name: '°C', yName: '%', grid: { top: 30 } })); };
          drawS(); ctx.every(3000, drawS);
          const pkg = openFindings.filter((f) => f.line === t.line && f.tower_id && Math.abs(lt.findIndex((x) => x.id === f.tower_id) - i0) <= 5).sort((a, b) => a.condition_score - b.condition_score);
          st.querySelector('[data-pkg]').innerHTML = ui.table({ id: 'pkg', rowId: (f) => f.finding_id, rows: pkg, cols: [{ label: 'Tower', sort: (f) => f.towerName, render: (f) => `<b>${esc(f.towerName)}</b>${f.tower_id === t.id ? ' ' + ui.badge('case', 'crit', { dot: false }) : ''}` }, { label: 'Finding', sort: (f) => f.finding_id, render: (f) => esc(f.finding_id) }, { label: 'Defect', sort: (f) => f.label, render: (f) => esc(f.label) }, { label: 'Severity', sort: (f) => f.condition_score, render: (f) => ui.badge(fmt.title(f.severity), SEV_TONE[f.severity]) }, { label: 'Review', sort: (f) => f.review_status, render: (f) => ui.badge(f.review_status, f.review_status === 'confirmed' ? 'ok' : 'warn') }, { label: 'Work order', sort: (f) => woByFinding.get(f.finding_id)?.id || '', render: (f) => (woByFinding.get(f.finding_id) ? esc(woByFinding.get(f.finding_id).id) : ui.badge('to raise', 'warn')) }], empty: 'No other open findings nearby.' });
          ctx.on('click', '#pkg tr[data-row]', (e, r) => findingDrawer(r.dataset.row));
        },
      },
    ],
  });

  /* ---------- Substation Schematics */
  screens.push({
    id: 'schem', name: 'Substation Schematics', icon: 'schematic', note: `${icon('info', 14)}Simulation — operator commands never leave this page`,
    tabs: [
      { name: 'S-1 single-line (220/132 kV)', icon: 'schematic', full: true, render: () => '<div class="nx-hmi is-full" id="sld"></div>', mount: (st, ctx) => ctx.hmi('#sld', s1Sld(net)) },
      { name: 'TX cooling & DGA P&ID', icon: 'thermo', full: true, render: () => `<div class="nx-hmi is-full" id="pid"></div>`, mount: (st, ctx) => ctx.hmi('#pid', txPid(net, transformers.find((t) => t.id === 'TX-1B') || transformers[0])) },
      { name: 'S-2 single-line (500/220 kV)', icon: 'schematic', full: true, render: () => '<div class="nx-hmi is-full" id="sld2"></div>', mount: (st, ctx) => ctx.hmi('#sld2', s2Sld(net)) },
      ...drawingTabs('reliability'),
    ],
  });

  // land on the dashboard; the rest follow the module's screen list
  const dash = screens.findIndex((x) => x.id === 'dashboard');
  screens.unshift(...screens.splice(dash, 1));
  // Asset Health alone is the current condition; together with Operations it is Asset Reliability
  const GROUP = { dashboard: 'Overview', registry: 'Overview', tower: 'Asset Health', line: 'Asset Health', riskmap: 'Asset Health', history: 'Operations', work: 'Operations', parts: 'Operations', schem: 'Engineering' };
  for (const sc of screens) sc.group = GROUP[sc.id];
  return { screens, heroText };
}

/* ======================================================================== schematics */
/** S-1: 220 kV single busbar with bus-section, 132 kV busbar, three 220/132 kV transformers, two line bays. */
function s1Sld(net) {
  const txs = net.transformers.filter((t) => t.sub === 'SUB-S1').slice(0, 3);
  const W = 1500; const H = 1020;
  const Y220 = 330; const Y132 = 740;
  let s = sx.frame(W, H, { title: 'SUBSTATION S-1 · 220/132 kV · OPERATING DIAGRAM', dno: 'NX-ARI-SLD-0101', rev: 'D' });
  s += sx.bus(80, 1380, Y220, { kv: 220, net: 'B220', label: '220 kV BUSBAR BB1', id: 'BB220', sub: 'Single busbar, sectionalised', tags: [['U', 'SUB-S1.BUS220', 'kV'], ['f', 'SUB-S1.F', 'Hz']] });
  s += sx.bus(80, 1380, Y132, { kv: 132, net: 'B132', label: '132 kV BUSBAR BB2', id: 'BB132', tags: [['U', 'SUB-S1.BUS132', 'kV']] });
  const eq = { BB220: { name: '220 kV busbar BB1', type: 'Busbar', tags: [{ tag: 'SUB-S1.BUS220', label: 'Voltage' }, { tag: 'SUB-S1.F', label: 'Frequency' }] }, BB132: { name: '132 kV busbar BB2', type: 'Busbar', tags: [{ tag: 'SUB-S1.BUS132', label: 'Voltage' }] } };
  const nets = { B220: {}, B132: {} };
  const sw = {};
  // 220 kV line bay to S-2 (L-220-03), going up
  const bay = (x, id, label, line, kv, busY, up, net0, extra = {}) => {
    const d = up ? -1 : 1; const n = `F-${id}`;
    nets[n] = { requires: [`${id}-Q1`, `${id}-Q0`, `${id}-Q9`], parent: net0, tags: [`${line}.MW`, `${line}.MVAR`] };
    let g = sx.wire([[x, busY], [x, busY + d * 26]], { kv, net: net0 });
    g += sx.ds(x, busY + d * 40, `${id}-Q1`, { label: 'Q1', kv });
    g += sx.wire([[x, busY + d * 54], [x, busY + d * 76]], { kv, net: n });
    g += sx.cb(x, busY + d * 90, `${id}-Q0`, { kv, net: n, label: 'Q0' });
    g += sx.wire([[x, busY + d * 104], [x, busY + d * 126]], { kv, net: n, flow: `${line}.MW` });
    g += sx.ct(x, busY + d * 116, {});
    g += sx.ds(x, busY + d * 140, `${id}-Q9`, { label: 'Q9', kv });
    g += sx.es(x, busY + d * 160, `${id}-Q8`, { dir: 1, label: 'Q8' });
    g += sx.vt(x, busY + d * 178, { dir: -1, label: 'BU' });
    g += sx.la(x, busY + d * 192, { dir: 1 });
    g += sx.lineExit(x, busY + d * 154, { kv, net: n, dir: d, label, sub: extra.sub, flow: `${line}.MW` });
    g += sx.relay(x - 70, busY + d * 100, '21', { from: [x - 6, busY + d * 116], label: 'Distance' });
    g += sx.relay(x - 70, busY + d * 136, '87L', { from: [x - 6, busY + d * 120] });
    g += sx.readout(x + 24, busY + d * (up ? 130 : 60) - (up ? 50 : 0), [['P', `${line}.MW`, 'MW'], ['Q', `${line}.MVAR`, 'Mvar'], ['I', `${line}.I`, 'A'], ['Load', `${line}.LOAD`, '%']], { title: line, w: 150, id: `RO-${id}` });
    sw[`${id}-Q8`] = 'open';
    for (const q of ['Q1', 'Q0', 'Q9', 'Q8']) eq[`${id}-${q}`] = { name: `${label} ${q === 'Q0' ? 'circuit-breaker' : q === 'Q8' ? 'earthing switch' : 'disconnector'} ${q}`, type: q === 'Q0' ? 'SF₆ circuit-breaker 245 kV 3150 A 40 kA' : q === 'Q8' ? 'Earthing switch' : 'Centre-break disconnector', switch: true, interlock: q === 'Q8' ? `${id}-Q9 open & line dead` : q !== 'Q0' ? `${id}-Q0 open` : 'Synchro-check 25', tags: q === 'Q0' ? [{ tag: `${line}.MW`, label: 'Active power' }, { tag: `${line}.I`, label: 'Current' }] : [] };
    eq[`RO-${id}`] = { name: `${line} metering`, type: 'Bay measurements', tags: [{ tag: `${line}.MW`, label: 'P' }, { tag: `${line}.MVAR`, label: 'Q' }, { tag: `${line}.I`, label: 'I' }, { tag: `${line}.KV`, label: 'U' }, { tag: `${line}.LOAD`, label: 'Loading' }] };
    return g;
  };
  s += bay(220, 'E01', 'L-220-03 TO S-2', 'L-220-03', 220, Y220, true, 'B220', { sub: '22.4 km · Corridor North' });
  s += bay(220, 'E06', 'L-132-01 COASTAL', 'L-132-01', 132, Y132, false, 'B132', { sub: '11.7 km · Corridor Coastal' });
  // transformer bays
  txs.forEach((t, i) => {
    const x = 560 + i * 300; const id = `T${i + 1}`;
    const n1 = `HV-${id}`; const n2 = `LV-${id}`;
    nets[n1] = { requires: [`${id}-Q1`, `${id}-Q0`], parent: 'B220', tags: [`${t.id}.MVA`] };
    nets[n2] = { requires: [`${id}-Q02`], parent: n1 };
    s += sx.wire([[x, Y220], [x, Y220 + 26]], { kv: 220, net: 'B220' });
    s += sx.ds(x, Y220 + 40, `${id}-Q1`, { label: 'Q1', kv: 220 });
    s += sx.wire([[x, Y220 + 54], [x, Y220 + 76]], { kv: 220, net: n1 });
    s += sx.cb(x, Y220 + 90, `${id}-Q0`, { kv: 220, net: n1, label: 'Q0' });
    s += sx.wire([[x, Y220 + 104], [x, Y220 + 166]], { kv: 220, net: n1, flow: `${t.id}.MVA` });
    s += sx.ct(x, Y220 + 120);
    s += sx.la(x, Y220 + 140, { dir: -1 });
    s += sx.xfmr(x, Y220 + 200, t.id, { kv1: 220, kv2: 132, label: t.name, sub: `${t.rating} MVA · ${t.ratio} kV · YNyn0`, net1: n1, net2: n2 });
    s += sx.wire([[x, Y220 + 234], [x, Y132 - 104]], { kv: 132, net: n2, flow: `${t.id}.MVA` });
    s += sx.cb(x, Y132 - 90, `${id}-Q02`, { kv: 132, net: n2, label: 'Q0' });
    s += sx.wire([[x, Y132 - 76], [x, Y132]], { kv: 132, net: 'B132' });
    s += sx.relay(x - 64, Y220 + 200, '87T', { from: [x - 18, Y220 + 200], label: 'Differential' });
    s += sx.relay(x - 64, Y220 + 248, '26', { label: 'Oil temp.' });
    s += sx.readout(x + 30, Y220 + 238, [['S', `${t.id}.MVA`, 'MVA'], ['Top oil', `${t.id}.TOT`, '°C'], ['Hot spot', `${t.id}.HST`, '°C'], ['Tap', `${t.id}.TAP`, '']], { title: `${t.name} · HI ${Math.round(t.hi ?? 0)}`, w: 146, id: `RO-${id}`, accent: t.band === 'poor' ? '#dc2626' : t.band === 'moderate' ? '#d97706' : undefined });
    eq[t.id] = { name: `${t.name} power transformer`, type: `${t.rating} MVA ONAN/ONAF · ${t.ratio} kV · ${t.maker || ''}`, desc: `Health index ${fmt.n(t.hi, 1)} (${t.band}). ${t.duval?.label ? `DGA: ${t.duval.label}.` : ''}`, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }, { tag: `${t.id}.TOT`, label: 'Top-oil temp.' }, { tag: `${t.id}.HST`, label: 'Winding hot-spot' }, { tag: `${t.id}.H2`, label: 'Dissolved H₂' }, { tag: `${t.id}.C2H2`, label: 'Dissolved C₂H₂' }, { tag: `${t.id}.TAP`, label: 'OLTC tap' }] };
    eq[`RO-${id}`] = eq[t.id];
    for (const q of ['Q1', 'Q0', 'Q02']) eq[`${id}-${q}`] = { name: `${t.name} ${q === 'Q1' ? 'HV disconnector' : q === 'Q0' ? 'HV breaker' : 'LV breaker'}`, type: q === 'Q1' ? 'Disconnector 245 kV' : `SF₆ circuit-breaker ${q === 'Q0' ? 245 : 145} kV`, switch: true, interlock: q === 'Q1' ? `${id}-Q0 open` : 'Trip circuit supervised', tags: [{ tag: `${t.id}.MVA`, label: 'Transformer load' }] };
  });
  // 132 kV feeders to distribution
  [{ x: 1300, n: 'D1', name: 'FDR-1 · 132 kV CABLE' }, { x: 1410, n: 'D2', name: 'FDR-2 · CITY GRID' }].forEach((f) => {
    live.define(`S1.${f.n}.MW`, { base: f.n === 'D1' ? 62 : 88, noise: 0.8, rev: 0.08, dec: 1, unit: 'MW', desc: `S-1 ${f.name} active power` });
    const n = `F-${f.n}`; nets[n] = { requires: [`${f.n}-Q0`], parent: 'B132', tags: [`S1.${f.n}.MW`] };
    s += sx.wire([[f.x, Y132], [f.x, Y132 + 76]], { kv: 132, net: 'B132' });
    s += sx.cb(f.x, Y132 + 90, `${f.n}-Q0`, { kv: 132, net: n, label: 'Q0' });
    s += sx.lineExit(f.x, Y132 + 104, { kv: 132, net: n, dir: 1, label: f.name.split(' · ')[0], sub: f.name.split(' · ')[1], flow: `S1.${f.n}.MW` });
    s += `<text x="${f.x + 12}" y="${Y132 + 140}" class="sx-v" data-live="S1.${f.n}.MW">—</text>`;
    eq[`${f.n}-Q0`] = { name: `${f.name} breaker`, type: 'SF₆ circuit-breaker 145 kV', switch: true, tags: [{ tag: `S1.${f.n}.MW`, label: 'Active power' }] };
  });
  return { title: 'Substation S-1 — 220/132 kV operating diagram', dno: 'NX-ARI-SLD-0101', rev: 'D', w: W, h: H, svg: s, equipment: eq, nets, switches: sw, legend: [{ label: '220 kV', color: '#3b82f6' }, { label: '132 kV', color: '#14b8a6' }, { label: 'De-energised', color: '#3a4658' }, { label: 'CB closed ■ / open □', color: '#dc2626' }] };
}

/** S-2: 500/220 kV, breaker-and-a-half style simplified to two buses with the 500 kV line and three 400 MVA units. */
function s2Sld(net) {
  const txs = net.transformers.filter((t) => t.sub === 'SUB-S2').slice(0, 3);
  const W = 1500; const H = 1020; const Y5 = 330; const Y2 = 740;
  let s = sx.frame(W, H, { title: 'SUBSTATION S-2 · 500/220 kV · OPERATING DIAGRAM', dno: 'NX-ARI-SLD-0201', rev: 'B' });
  s += sx.bus(80, 1380, Y5, { kv: 500, net: 'B500', label: '500 kV BUSBAR', id: 'BB500', tags: [['U', 'SUB-S2.BUS500', 'kV'], ['f', 'SUB-S2.F', 'Hz']] });
  s += sx.bus(80, 1380, Y2, { kv: 220, net: 'B220', label: '220 kV BUSBAR', id: 'BB220', tags: [['U', 'SUB-S2.BUS220', 'kV']] });
  const eq = { BB500: { name: '500 kV busbar', type: 'Busbar', tags: [{ tag: 'SUB-S2.BUS500', label: 'Voltage' }, { tag: 'SUB-S2.F', label: 'Frequency' }] }, BB220: { name: '220 kV busbar', type: 'Busbar', tags: [{ tag: 'SUB-S2.BUS220', label: 'Voltage' }] } };
  const nets = { B500: {}, B220: {} }; const sw = {};
  const lineBay = (x, id, line, kv, busY, d, parent, label, sub) => {
    const n = `F-${id}`; nets[n] = { requires: [`${id}-Q1`, `${id}-Q0`, `${id}-Q9`], parent, tags: [`${line}.MW`, `${line}.MVAR`] };
    let g = sx.wire([[x, busY], [x, busY + d * 26]], { kv, net: parent }) + sx.ds(x, busY + d * 40, `${id}-Q1`, { kv, label: 'Q1' }) + sx.wire([[x, busY + d * 54], [x, busY + d * 76]], { kv, net: n }) + sx.cb(x, busY + d * 90, `${id}-Q0`, { kv, net: n, label: 'Q0' }) + sx.wire([[x, busY + d * 104], [x, busY + d * 126]], { kv, net: n, flow: `${line}.MW` }) + sx.ds(x, busY + d * 140, `${id}-Q9`, { kv, label: 'Q9' }) + sx.es(x, busY + d * 160, `${id}-Q8`, { label: 'Q8' }) + sx.lineExit(x, busY + d * 154, { kv, net: n, dir: d, label, sub, flow: `${line}.MW` }) + sx.relay(x - 70, busY + d * 100, '21', { from: [x - 8, busY + d * 100] }) + sx.reactor(x + 70, busY + d * (d < 0 ? 150 : 150), `${id}-R`, { label: kv === 500 ? 'Shunt reactor 150 Mvar' : '' });
    g += sx.readout(x + 110, busY + d * (d < 0 ? 180 : 60), [['P', `${line}.MW`, 'MW'], ['I', `${line}.I`, 'A'], ['Load', `${line}.LOAD`, '%']], { title: line, w: 140, id: `RO-${id}` });
    sw[`${id}-Q8`] = 'open';
    for (const q of ['Q1', 'Q0', 'Q9', 'Q8']) eq[`${id}-${q}`] = { name: `${line} ${q}`, type: q === 'Q0' ? `SF₆ circuit-breaker ${kv === 500 ? 550 : 245} kV` : q === 'Q8' ? 'Earthing switch' : 'Disconnector', switch: true, tags: q === 'Q0' ? [{ tag: `${line}.MW`, label: 'Active power' }, { tag: `${line}.I`, label: 'Current' }] : [] };
    eq[`RO-${id}`] = { name: `${line} metering`, type: 'Bay measurements', tags: [{ tag: `${line}.MW`, label: 'P' }, { tag: `${line}.I`, label: 'I' }, { tag: `${line}.KV`, label: 'U' }, { tag: `${line}.LOAD`, label: 'Loading' }] };
    eq[`${id}-R`] = { name: 'Shunt reactor', type: '150 Mvar, 525 kV', tags: [] };
    return g;
  };
  s += lineBay(240, 'K01', 'L-500-01', 500, Y5, -1, 'B500', 'L-500-01 INLAND', '22.1 km');
  s += lineBay(220, 'E02', 'L-220-03', 220, Y2, 1, 'B220', 'L-220-03 TO S-1', '22.4 km · Corridor North');
  txs.forEach((t, i) => {
    const x = 560 + i * 300; const id = `T${i + 1}`; const n1 = `HV-${id}`; const n2 = `LV-${id}`;
    nets[n1] = { requires: [`${id}-Q0`], parent: 'B500', tags: [`${t.id}.MVA`] }; nets[n2] = { requires: [`${id}-Q02`], parent: n1 };
    s += sx.wire([[x, Y5], [x, Y5 + 76]], { kv: 500, net: 'B500' }) + sx.cb(x, Y5 + 90, `${id}-Q0`, { kv: 500, net: n1, label: 'Q0' }) + sx.wire([[x, Y5 + 104], [x, Y5 + 176]], { kv: 500, net: n1, flow: `${t.id}.MVA` }) + sx.xfmr(x, Y5 + 210, t.id, { kv1: 500, kv2: 220, label: t.name, sub: `${t.rating} MVA · ${t.ratio} kV`, net1: n1, net2: n2 }) + sx.wire([[x, Y5 + 244], [x, Y2 - 104]], { kv: 220, net: n2, flow: `${t.id}.MVA` }) + sx.cb(x, Y2 - 90, `${id}-Q02`, { kv: 220, net: n2, label: 'Q0' }) + sx.wire([[x, Y2 - 76], [x, Y2]], { kv: 220, net: 'B220' });
    s += sx.relay(x - 64, Y5 + 210, '87T', { from: [x - 18, Y5 + 210] });
    s += sx.readout(x + 30, Y5 + 250, [['S', `${t.id}.MVA`, 'MVA'], ['Top oil', `${t.id}.TOT`, '°C'], ['H₂', `${t.id}.H2`, 'ppm'], ['C₂H₂', `${t.id}.C2H2`, 'ppm']], { title: `${t.name} · HI ${Math.round(t.hi ?? 0)}`, w: 146, id: `RO-${id}`, accent: t.band === 'poor' ? '#dc2626' : t.band === 'moderate' ? '#d97706' : undefined });
    eq[t.id] = { name: `${t.name} power transformer`, type: `${t.rating} MVA · ${t.ratio} kV`, desc: `HI ${fmt.n(t.hi, 1)} (${t.band}). ${t.duval?.label ? `DGA: ${t.duval.label}.` : ''}`, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }, { tag: `${t.id}.TOT`, label: 'Top-oil' }, { tag: `${t.id}.HST`, label: 'Hot-spot' }, { tag: `${t.id}.H2`, label: 'H₂' }, { tag: `${t.id}.C2H2`, label: 'C₂H₂' }] };
    eq[`RO-${id}`] = eq[t.id];
    for (const q of ['Q0', 'Q02']) eq[`${id}-${q}`] = { name: `${t.name} ${q === 'Q0' ? '500 kV' : '220 kV'} breaker`, type: 'SF₆ circuit-breaker', switch: true, tags: [{ tag: `${t.id}.MVA`, label: 'Load' }] };
  });
  return { title: 'Substation S-2 — 500/220 kV operating diagram', dno: 'NX-ARI-SLD-0201', rev: 'B', w: W, h: H, svg: s, equipment: eq, nets, switches: sw, legend: [{ label: '500 kV', color: '#a855f7' }, { label: '220 kV', color: '#3b82f6' }, { label: 'De-energised', color: '#3a4658' }] };
}

/** Transformer ONAN/ONAF/OFAF cooling, conservator & online-DGA P&ID (ISA-5.1 tagging). */
function txPid(net, t) {
  const id = t.id; const W = 1500; const H = 860;
  live.defineMany({
    [`${id}.FAN1`]: { fn: () => (live.get(`${id}.TOT`) > 48 ? 1 : 0), dec: 0, desc: `${id} fan group 1 (ONAF stage 1)`, fmt: (v) => (v > 0.5 ? 'RUN' : 'STOP') },
    [`${id}.FAN2`]: { fn: () => (live.get(`${id}.TOT`) > 60 ? 1 : 0), dec: 0, desc: `${id} fan group 2 (ONAF stage 2)`, fmt: (v) => (v > 0.5 ? 'RUN' : 'STOP') },
    [`${id}.PUMP`]: { fn: () => (live.get(`${id}.TOT`) > 45 ? 1 : 0), dec: 0, desc: `${id} oil pump (OFAF)`, fmt: (v) => (v > 0.5 ? 'RUN' : 'STOP') },
    [`${id}.FLOW`]: { fn: () => (live.get(`${id}.PUMP`) > 0.5 ? 820 + Math.sin(Date.now() / 7000) * 12 : 140), dec: 0, unit: 'L/min', desc: `${id} oil flow` },
    [`${id}.BOT`]: { fn: () => live.get(`${id}.TOT`) - (live.get(`${id}.PUMP`) > 0.5 ? 13 : 8), dec: 1, unit: '°C', desc: `${id} bottom-oil temperature` },
    [`${id}.CONS`]: { fn: () => 46 + (live.get(`${id}.TOT`) - 50) * 0.55, dec: 0, unit: '%', l: 15, desc: `${id} conservator oil level` },
    [`${id}.PRESS`]: { base: 0.21, noise: 0.004, rev: 0.1, dec: 2, unit: 'bar', h: 0.5, desc: `${id} tank pressure` },
    [`${id}.BUSH`]: { base: 0.34, noise: 0.004, rev: 0.1, dec: 2, unit: '%', h: 0.6, desc: `${id} bushing tan δ` },
  });
  let s = sx.frame(W, H, { title: `${t.name} · COOLING, CONSERVATOR & ONLINE DGA · P&ID`, dno: `NX-ARI-PID-02${id.slice(-2)}`, rev: 'C' });
  // main tank
  s += `<g class="sx-hit" data-eq="${id}"><rect class="sx-halo" x="356" y="296" width="348" height="318" rx="10"/><rect x="360" y="300" width="340" height="310" rx="8" fill="#111823" stroke="#9aa8bb" stroke-width="2"/><circle cx="500" cy="440" r="56" fill="none" stroke="#3b82f6" stroke-width="2.4"/><circle cx="560" cy="440" r="56" fill="none" stroke="#14b8a6" stroke-width="2.4"/>${sx.text(530, 330, `${t.name} MAIN TANK`, { cls: 'sx-tb', anchor: 'middle' })}${sx.text(530, 346, `${t.rating} MVA · ${t.ratio} kV · ONAN/ONAF/OFAF`, { cls: 'sx-ts', anchor: 'middle' })}<text x="530" y="580" class="sx-v" text-anchor="middle" data-live="${id}.MVA">—</text>${sx.text(566, 580, 'MVA', { cls: 'sx-ts' })}</g>`;
  // bushings
  [440, 530, 620].forEach((x, i) => { s += `<g class="sx-hit" data-eq="BSH-${i}"><rect class="sx-halo" x="${x - 12}" y="232" width="24" height="70" rx="4"/><path d="M${x - 7} 300 L${x - 4} 240 L${x + 4} 240 L${x + 7} 300Z" fill="#1a2330" stroke="#cbd5e1" stroke-width="1.3"/>${[0, 1, 2, 3, 4].map((k) => `<line x1="${x - 8}" y1="${250 + k * 10}" x2="${x + 8}" y2="${250 + k * 10}" stroke="#64748b"/>`).join('')}<line x1="${x}" y1="240" x2="${x}" y2="222" stroke="#3b82f6" stroke-width="3"/></g>`; });
  s += sx.text(530, 214, 'HV BUSHINGS 245 kV OIP', { cls: 'sx-ts', anchor: 'middle' });
  // conservator + buchholz + breather
  s += sx.tank(760, 150, 220, 60, 'CONS', { level: `${id}.CONS`, max: 100, label: 'CONSERVATOR', sub: 'Rubber bag · sealed', lPct: 0.15 });
  s += sx.pipe([[640, 300], [640, 240], [760, 240], [800, 240], [800, 210]], { medium: 'oil' });
  s += sx.buchholz(720, 240, 'BUCH');
  s += sx.instr(1050, 110, 'LI', '204', { tag: `${id}.CONS`, unit: '%', id: 'LI204', loc: 'field' });
  s += sx.sig([[1036, 116], [960, 150]]);
  s += `<g><rect x="1000" y="160" width="26" height="40" rx="4" fill="#1a2330" stroke="#9aa8bb"/><rect x="1004" y="168" width="18" height="24" fill="#c084fc" opacity=".6"/>${sx.text(1013, 216, 'Silica-gel breather', { cls: 'sx-ts', anchor: 'middle' })}</g>`;
  s += sx.pipe([[980, 180], [1000, 180]], { medium: 'air' });
  s += sx.psv(380, 296, {}) + sx.text(330, 270, 'PRD 63Q · 0.55 bar', { cls: 'sx-ts' });
  // radiator banks with fans, top header and bottom header
  const R1 = 900; const R2 = 1080;
  s += sx.pipe([[700, 330], [R1 + 35, 330], [R2 + 35, 330]], { medium: 'oil', flow: `${id}.FLOW`, ref: 800 });
  s += sx.pipe([[R2 + 35, 600], [R1 + 35, 600], [790, 600]], { medium: 'oil', flow: `${id}.FLOW`, ref: 800 });
  s += sx.radiator(R1, 360, 'RAD1', { label: 'Radiator bank A (6×520)', w: 70, h: 200 });
  s += sx.radiator(R2, 360, 'RAD2', { label: 'Radiator bank B (6×520)', w: 70, h: 200 });
  s += sx.wire([[R1 + 35, 330], [R1 + 35, 360]], { color: '#b08d3b', width: 3.5 }) + sx.wire([[R1 + 35, 560], [R1 + 35, 600]], { color: '#b08d3b', width: 3.5 }) + sx.wire([[R2 + 35, 330], [R2 + 35, 360]], { color: '#b08d3b', width: 3.5 }) + sx.wire([[R2 + 35, 560], [R2 + 35, 600]], { color: '#b08d3b', width: 3.5 });
  s += sx.fan(R1 + 110, 420, 'FAN-A1', { run: `${id}.FAN1`, label: 'M1' }) + sx.fan(R1 + 110, 500, 'FAN-A2', { run: `${id}.FAN2`, label: 'M2' });
  s += sx.fan(R2 + 110, 420, 'FAN-B1', { run: `${id}.FAN1`, label: 'M3' }) + sx.fan(R2 + 110, 500, 'FAN-B2', { run: `${id}.FAN2`, label: 'M4' });
  // pump + valves on return
  s += sx.valve(830, 600, 'V-101', { label: 'V-101' });
  s += sx.pump(760, 640, 'P-101', { run: `${id}.PUMP`, label: 'P-101 OFAF', dir: -1 });
  s += sx.pipe([[790, 600], [775, 600], [775, 625]], { medium: 'oil' }) + sx.pipe([[736, 625], [700, 625], [700, 600]], { medium: 'oil', flow: `${id}.FLOW`, ref: 800 });
  s += sx.instr(860, 680, 'FT', '105', { tag: `${id}.FLOW`, unit: 'L/min', id: 'FT105' });
  s += sx.sig([[860, 666], [860, 600]]);
  // temperatures
  s += sx.instr(250, 340, 'TT', '101', { tag: `${id}.TOT`, unit: '°C', id: 'TT101', side: -1, alarm: 'H 85' });
  s += sx.sig([[264, 340], [360, 340]]);
  s += sx.instr(250, 420, 'TT', '102', { tag: `${id}.HST`, unit: '°C', id: 'TT102', side: -1, alarm: 'H 98' });
  s += sx.sig([[264, 420], [444, 420]]);
  s += sx.instr(250, 580, 'TT', '103', { tag: `${id}.BOT`, unit: '°C', id: 'TT103', side: -1 });
  s += sx.sig([[264, 580], [360, 580]]);
  s += sx.instr(250, 500, 'PT', '106', { tag: `${id}.PRESS`, unit: 'bar', id: 'PT106', side: -1 });
  s += sx.sig([[264, 500], [360, 500]]);
  s += sx.instr(1270, 300, 'TT', '100', { tag: `${id}.AMB`, unit: '°C', id: 'TT100', loc: 'field' });
  // online DGA analyser loop
  s += `<g class="sx-hit" data-eq="AT-301"><rect class="sx-halo" x="356" y="676" width="246" height="112" rx="8"/><rect x="360" y="680" width="238" height="104" rx="6" fill="#0b1119" stroke="#7c3aed" stroke-width="1.5"/>${sx.text(372, 698, 'AT-301 ONLINE DGA (8-gas, PAS)', { cls: 'sx-tb', size: 10.5 })}${[['H₂', `${id}.H2`, 'ppm'], ['C₂H₂', `${id}.C2H2`, 'ppm'], ['H₂O', `${id}.MOIST`, 'ppm'], ['Tan δ bushing', `${id}.BUSH`, '%']].map(([l, tg, u], k) => `${sx.text(372, 718 + k * 16, l, { cls: 'sx-ts' })}<text x="540" y="${718 + k * 16}" class="sx-v" text-anchor="end" data-live="${tg}">—</text>${sx.text(546, 718 + k * 16, u, { cls: 'sx-ts' })}`).join('')}</g>`;
  s += sx.pipe([[420, 610], [420, 680]], { medium: 'oil' }) + sx.pipe([[520, 680], [520, 610]], { medium: 'oil' });
  s += sx.valve(420, 645, 'V-301', { vertical: true, label: 'V-301' }) + sx.valve(520, 645, 'V-302', { vertical: true, label: 'V-302' });
  // control logic note
  s += `<g>${sx.text(1100, 650, 'COOLING CONTROL (RTCC / IEC 60076-7)', { cls: 'sx-tb', size: 10.5 })}${sx.text(1100, 668, 'Stage 1 fans M1, M3 start at top-oil 48 °C', { cls: 'sx-ts' })}${sx.text(1100, 682, 'Stage 2 fans M2, M4 start at top-oil 60 °C', { cls: 'sx-ts' })}${sx.text(1100, 696, 'OFAF pump P-101 starts at top-oil 45 °C', { cls: 'sx-ts' })}${sx.text(1100, 710, 'Alarm 85 °C · Trip 95 °C (26) · Hot-spot alarm 98 °C (49)', { cls: 'sx-ts' })}${sx.text(1100, 728, 'Fans:', { cls: 'sx-ts' })}<text x="1140" y="728" class="sx-v" data-live="${id}.FAN1">—</text><text x="1185" y="728" class="sx-v" data-live="${id}.FAN2">—</text>${sx.text(1240, 728, 'Pump:', { cls: 'sx-ts' })}<text x="1285" y="728" class="sx-v" data-live="${id}.PUMP">—</text></g>`;
  const tg = (tag, label) => ({ tag, label });
  const equipment = {
    [id]: { name: `${t.name} main tank`, type: `${t.rating} MVA · ${t.maker || ''}`, desc: `HI ${fmt.n(t.hi, 1)} (${t.band}). ${t.duval?.label ? `Latest lab DGA: ${t.duval.label} (Duval ${t.duval.zone}).` : ''}`, tags: [tg(`${id}.MVA`, 'Load'), tg(`${id}.TOT`, 'Top-oil'), tg(`${id}.HST`, 'Hot-spot'), tg(`${id}.PRESS`, 'Tank pressure')] },
    CONS: { name: 'Conservator', type: 'Rubber-bag conservator 4,200 L', tags: [tg(`${id}.CONS`, 'Oil level')] }, LI204: { name: 'LI-204 conservator level', type: 'Magnetic oil-level gauge', tags: [tg(`${id}.CONS`, 'Level')] },
    BUCH: { name: 'Buchholz relay 63', type: 'Gas & oil-surge relay', desc: 'Alarm on gas accumulation, trip on oil surge.', tags: [tg(`${id}.H2`, 'Dissolved H₂ (proxy)')] },
    'P-101': { name: 'P-101 OFAF oil pump', type: 'Glandless oil pump 900 L/min', kind: 'pump', tags: [tg(`${id}.PUMP`, 'Run status'), tg(`${id}.FLOW`, 'Flow')] }, FT105: { name: 'FT-105 oil flow', type: 'Flow transmitter', tags: [tg(`${id}.FLOW`, 'Flow')] },
    'V-101': { name: 'V-101 pump isolation valve', type: 'Butterfly valve DN150', kind: 'valve', switch: true, tags: [tg(`${id}.FLOW`, 'Flow')] }, 'V-301': { name: 'V-301 DGA sample valve', type: 'Ball valve DN15', kind: 'valve', switch: true, tags: [tg(`${id}.H2`, 'H₂')] }, 'V-302': { name: 'V-302 DGA return valve', type: 'Ball valve DN15', kind: 'valve', switch: true, tags: [tg(`${id}.H2`, 'H₂')] },
    RAD1: { name: 'Radiator bank A', type: '6 × 520 mm panels', tags: [tg(`${id}.TOT`, 'Inlet (top-oil)'), tg(`${id}.BOT`, 'Outlet (bottom-oil)')] }, RAD2: { name: 'Radiator bank B', type: '6 × 520 mm panels', tags: [tg(`${id}.TOT`, 'Inlet (top-oil)'), tg(`${id}.BOT`, 'Outlet (bottom-oil)')] },
    'FAN-A1': { name: 'Fan M1 (stage 1)', type: 'Axial fan 1.1 kW', kind: 'fan', tags: [tg(`${id}.FAN1`, 'Run'), tg(`${id}.TOT`, 'Top-oil')] }, 'FAN-A2': { name: 'Fan M2 (stage 2)', type: 'Axial fan 1.1 kW', kind: 'fan', tags: [tg(`${id}.FAN2`, 'Run'), tg(`${id}.TOT`, 'Top-oil')] }, 'FAN-B1': { name: 'Fan M3 (stage 1)', type: 'Axial fan 1.1 kW', kind: 'fan', tags: [tg(`${id}.FAN1`, 'Run'), tg(`${id}.TOT`, 'Top-oil')] }, 'FAN-B2': { name: 'Fan M4 (stage 2)', type: 'Axial fan 1.1 kW', kind: 'fan', tags: [tg(`${id}.FAN2`, 'Run'), tg(`${id}.TOT`, 'Top-oil')] },
    TT101: { name: 'TT-101 top-oil temperature', type: 'Pt100 / OTI', tags: [tg(`${id}.TOT`, 'Top-oil')] }, TT102: { name: 'TT-102 winding hot-spot', type: 'Fibre-optic WTI', tags: [tg(`${id}.HST`, 'Hot-spot'), tg(`${id}.TOT`, 'Top-oil')] }, TT103: { name: 'TT-103 bottom-oil', type: 'Pt100', tags: [tg(`${id}.BOT`, 'Bottom-oil')] }, PT106: { name: 'PT-106 tank pressure', type: 'Pressure transmitter', tags: [tg(`${id}.PRESS`, 'Pressure')] }, TT100: { name: 'TT-100 ambient', type: 'Pt100', tags: [tg(`${id}.AMB`, 'Ambient')] },
    'AT-301': { name: 'AT-301 online DGA analyser', type: 'Photo-acoustic 8-gas monitor', desc: 'IEC 60599 / IEEE C57.104 limits; Duval triangle evaluated on every sample.', tags: [tg(`${id}.H2`, 'H₂'), tg(`${id}.C2H2`, 'C₂H₂'), tg(`${id}.MOIST`, 'Moisture'), tg(`${id}.BUSH`, 'Bushing tan δ')] },
    'BSH-0': { name: 'HV bushing phase A', type: 'OIP 245 kV', tags: [tg(`${id}.BUSH`, 'Tan δ')] }, 'BSH-1': { name: 'HV bushing phase B', type: 'OIP 245 kV', tags: [tg(`${id}.BUSH`, 'Tan δ')] }, 'BSH-2': { name: 'HV bushing phase C', type: 'OIP 245 kV', tags: [tg(`${id}.BUSH`, 'Tan δ')] },
  };
  return { title: `${t.name} — cooling, conservator & online DGA`, dno: `NX-ARI-PID-02${id.slice(-2)}`, rev: 'C', w: W, h: H, svg: s, equipment, nets: { OILP: { requires: ['V-101'], tags: [] } }, switches: {}, onSwitch: (sid, st) => { if (sid === 'V-101') live.force(`${id}.FLOW`, st === 'closed' ? null : 0); if (sid === 'V-301' || sid === 'V-302') toast(`DGA sample loop ${st === 'closed' ? 'restored' : 'isolated'} (simulation)`, st === 'closed' ? 'ok' : 'warn'); }, legend: [{ label: 'Insulating oil', color: '#b08d3b' }, { label: 'Air / breather', color: '#94a3b8' }, { label: 'Signal (ISA)', color: '#64748b' }, { label: '220 kV', color: '#3b82f6' }, { label: '132 kV', color: '#14b8a6' }] };
}
