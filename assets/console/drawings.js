// Record drawings: the controlled P&ID / single-line / PFD sheets under /pids, shown in an interactive viewer.
// Each sheet is loaded as inline SVG. Every numeric readout (data-live) becomes a live tag that moves around its
// recorded value; every equipment group (id + data-tip, or the pid-/dwg-equipment classes) gets a hover card and a
// click-through faceplate with its readings and a trend. Pan with drag, zoom with the wheel.

import { esc, icon, live, drawChart, clamp, hoverCard, hideHover, ui } from './console.js';

/* ------------------------------------------------------------------ the register */
const M = { reliability: '01', operations: '03', grid: '04', inventory: '05', forecast: '06', finance: '07', workforce: '08' };
export const PID_LIBRARY = [
  // module record drawings (as issued with each module)
  { f: 'nx-ari-sld-0104-corridor-north.svg', mod: 'reliability', title: 'SS-North 220 kV — Corridor North', kind: 'SLD' },
  { f: 'nx-ari-sld-0132-ss-east.svg', mod: 'reliability', title: 'SS-East 132 kV — same corridor', kind: 'SLD' },
  { f: 'nx-ari-sld-0230-east-angle.svg', mod: 'reliability', title: 'East angle — registry cut', kind: 'SLD' },
  { f: 'nx-ari-sld-0110-t110.svg', mod: 'reliability', title: 'T-110 side — outside package', kind: 'SLD' },
  { f: 'nx-ops-pfd-0104-one-visit.svg', mod: 'operations', title: 'One planned visit — Corridor North', kind: 'PFD' },
  { f: 'nx-ops-pid-0301-pumps.svg', mod: 'operations', title: 'Task package — pumping unit', kind: 'P&ID' },
  { f: 'nx-ops-pid-0201-visit.svg', mod: 'operations', title: 'Visit sequence', kind: 'P&ID' },
  { f: 'nx-ops-pid-1001-package.svg', mod: 'operations', title: 'Visit package', kind: 'P&ID' },
  { f: 'nx-grd-sld-0220-corridor-north.svg', mod: 'grid', title: 'SS-North operating record', kind: 'SLD' },
  { f: 'nx-grd-sld-0400-gis.svg', mod: 'grid', title: 'SS-North 220 kV GIS', kind: 'SLD' },
  { f: 'nx-grd-sld-0132-distribution.svg', mod: 'grid', title: 'SS-North yard — distribution', kind: 'SLD' },
  { f: 'nx-grd-sld-0330-corridor.svg', mod: 'grid', title: 'Corridor bus', kind: 'SLD' },
  { f: 'nx-grd-sld-0110-yard.svg', mod: 'grid', title: 'Outage record — yard', kind: 'SLD' },
  { f: 'nx-inv-pfd-0104-hardware.svg', mod: 'inventory', title: 'Replacement hardware flow', kind: 'PFD' },
  { f: 'nx-inv-pfd-1002-stock.svg', mod: 'inventory', title: 'Stock on hand', kind: 'PFD' },
  { f: 'nx-inv-pid-4001-requests.svg', mod: 'inventory', title: 'Three material requests', kind: 'P&ID' },
  { f: 'nx-inv-sld-0011-stores.svg', mod: 'inventory', title: 'Stores supply', kind: 'SLD' },
  { f: 'nx-fct-pfd-0018-reviews.svg', mod: 'forecast', title: 'Reviews next quarter', kind: 'PFD' },
  { f: 'nx-fct-pfd-1001-zones.svg', mod: 'forecast', title: 'Demand by zone', kind: 'PFD' },
  { f: 'nx-fct-pfd-1001-flights.svg', mod: 'forecast', title: 'Risk-based flights', kind: 'PFD' },
  { f: 'nx-fin-pfd-0480-budget.svg', mod: 'finance', title: 'Corridor North budget', kind: 'PFD' },
  { f: 'nx-fin-pfd-1001-cost.svg', mod: 'finance', title: 'Cost of this visit', kind: 'PFD' },
  { f: 'nx-wfs-pfd-0220-authorization.svg', mod: 'workforce', title: 'Work authorisation', kind: 'PFD' },
  { f: 'nx-wfs-pfd-1002-crew.svg', mod: 'workforce', title: 'Qualified crew', kind: 'PFD' },
  // reference substations
  { f: 'SSN-E-SLD-0001-substation-north.svg', mod: 'ref-sub', title: 'Substation North', kind: 'SLD' },
  { f: 'SSE-E-SLD-0001-substation-east.svg', mod: 'ref-sub', title: 'Substation East', kind: 'SLD' },
  { f: 'S12-E-SLD-001-substation-s12.svg', mod: 'ref-sub', title: 'Substation S12', kind: 'SLD' },
  { f: 'S27-E-SLD-001-substation-s27.svg', mod: 'ref-sub', title: 'Substation S27', kind: 'SLD' },
  { f: 'PS1-EL-SLD-001-substation-ps-1.svg', mod: 'ref-sub', title: 'Substation PS-1', kind: 'SLD' },
  { f: 'PS7-EL-SLD-001-substation-ps-7.svg', mod: 'ref-sub', title: 'Substation PS-7', kind: 'SLD' },
  { f: 'CED-E-OL-0001-cedar-substation.svg', mod: 'ref-sub', title: 'Cedar substation', kind: 'One-line' },
  { f: 'RDG-E-OL-0001-ridgeway-substation.svg', mod: 'ref-sub', title: 'Ridgeway substation', kind: 'One-line' },
  { f: 'MSS-E-SLD-0001-mill-main-substation.svg', mod: 'ref-sub', title: 'Mill main substation', kind: 'SLD' },
  // reference process & utilities
  { f: 'PA-GCT-A-PID-1001-gas-compression-train-a.svg', mod: 'ref-proc', title: 'Gas compression train A', kind: 'P&ID' },
  { f: 'NF-OPT-1-PID-2001-oil-processing-train-1.svg', mod: 'ref-proc', title: 'Oil processing train 1', kind: 'P&ID' },
  { f: 'CR-CDU-1-PID-4001-crude-distillation-unit-1.svg', mod: 'ref-proc', title: 'Crude distillation unit 1', kind: 'P&ID' },
  { f: 'PS3-ML-PID-3001-mainline-pumping.svg', mod: 'ref-proc', title: 'Mainline pumping PS-3', kind: 'P&ID' },
  { f: 'UTL-P-PFD-1001-steam-plant.svg', mod: 'ref-proc', title: 'Steam plant', kind: 'PFD' },
  { f: 'UTL-P-PFD-1002-compressed-air-and-cooling.svg', mod: 'ref-proc', title: 'Compressed air & cooling', kind: 'PFD' },
  { f: 'SPN-P-PFD-1001-ring-spinning.svg', mod: 'ref-proc', title: 'Ring spinning', kind: 'PFD' },
  { f: 'WVG-P-PFD-1001-air-jet-weaving.svg', mod: 'ref-proc', title: 'Air-jet weaving', kind: 'PFD' },
  { f: 'WET-P-PFD-1001-dyehouse.svg', mod: 'ref-proc', title: 'Dyehouse', kind: 'PFD' },
  { f: 'WET-P-PFD-1002-finishing-hall.svg', mod: 'ref-proc', title: 'Finishing hall', kind: 'PFD' },
];
const dno = (f) => f.replace(/\.svg$/, '').split('-').slice(0, 4).join('-').toUpperCase();
const GROUPS = [
  ...Object.keys(M).map((m) => [m, `Module ${M[m]} record drawings`]),
  ['ref-sub', 'Reference substations'],
  ['ref-proc', 'Reference process & utilities'],
];

/* ------------------------------------------------------------------ viewer */
const cache = new Map();
const fetchSvg = (f) => { if (!cache.has(f)) cache.set(f, fetch(`/pids/${f}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })); return cache.get(f); };
function parseReading(text) {
  const raw = String(text || '').replace(/ /g, ' ').trim();
  const m = raw.match(/^(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  let num = m[1].replace(/ /g, '');
  if (num.indexOf(',') > num.lastIndexOf('.')) num = num.replace(/\./g, '').replace(',', '.'); else num = num.replace(/,/g, '');
  const v = Number(num); if (!Number.isFinite(v)) return null;
  return { v, unit: m[2].trim(), dec: (num.split('.')[1] || '').length };
}

/** createDrawing(el, { file, title }) -> { dispose } */
export function createDrawing(el, { file, title } = {}) {
  const meta = PID_LIBRARY.find((d) => d.f === file) || { f: file, title: title || file, kind: 'Drawing' };
  const slug = file.replace(/\.svg$/, '');
  el.classList.add('nx-hmi', 'nx-dwg');
  el.innerHTML = `<div class="nx-hmi-bar"><span class="nx-hmi-live"><span class="nx-dot is-pulse"></span>LIVE</span><b>${esc(meta.title)}</b><span class="nx-hmi-dno">${esc(dno(file))} · ${esc(meta.kind)}</span><span class="nx-sp"></span><span class="nx-note" data-dstat>Loading…</span><button type="button" data-z="in" title="Zoom in">＋</button><button type="button" data-z="out" title="Zoom out">－</button><button type="button" data-z="fit">Fit</button><a class="nx-btn is-sm" href="/pids/${esc(file)}" target="_blank" rel="noopener">${icon('download', 14)}SVG</a></div><div class="nx-hmi-canvas" style="bottom:0"></div><div class="nx-hmi-face"></div>`;
  const canvas = el.querySelector('.nx-hmi-canvas'); const face = el.querySelector('.nx-hmi-face'); const stat = el.querySelector('[data-dstat]');
  let alive = true; let svg = null; let vb = null; let W = 1700; let H = 1100; let trend = null; let selId = null; let off = null;
  const equipment = {};
  const applyVb = () => svg?.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const zoom = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => { const nw = clamp(vb.w * f, W * 0.15, W * 1.5); const k = nw / vb.w; vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: nw, h: vb.h * k }; applyVb(); };

  fetchSvg(file).then((txt) => {
    if (!alive) return;
    canvas.innerHTML = txt.replace(/^<\?xml[^>]*>\s*/, '');
    svg = canvas.querySelector('svg');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = '100%'; svg.style.height = '100%'; svg.style.background = '#eef1f5';
    const v = (svg.getAttribute('viewBox') || `0 0 ${W} ${H}`).split(/[\s,]+/).map(Number); W = v[2]; H = v[3];
    vb = { x: v[0], y: v[1], w: W, h: H };

    // live tags from every numeric readout
    const tagNodes = [];
    for (const node of svg.querySelectorAll('[data-live]')) {
      const orig = node.getAttribute('data-live'); const p = parseReading(node.textContent);
      const prev = node.previousElementSibling; const label = prev && /(^|\s)(ol-k|pl-k)(\s|$)/.test(prev.getAttribute('class') || '') ? prev.textContent.trim() : orig.split('.').pop().replace(/_/g, ' ');
      if (!p) { tagNodes.push({ node, orig, key: null, label, raw: node.textContent.trim() }); continue; }
      const key = `${slug}|${orig}`;
      const thr = node.getAttribute('data-state') === 'threshold';
      live.define(key, { base: p.v, noise: Math.max(Math.abs(p.v) * 0.004, 10 ** -Math.max(p.dec, 0) * 0.6), rev: 0.15, dec: p.dec, unit: p.unit, desc: `${meta.title} · ${label}`, h: thr && p.v > 0 ? +(p.v * 1.025).toFixed(p.dec) : undefined, fmt: (x) => `${x.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec })}${p.unit ? ` ${p.unit}` : ''}` });
      node.setAttribute('data-live', key);
      tagNodes.push({ node, orig, key, label });
    }
    // equipment groups
    const groups = [...svg.querySelectorAll('g[id]')].filter((g) => g.hasAttribute('data-tip') || /(pid|dwg)-(equipment|instrument)|dwg-bay/.test(g.getAttribute('class') || ''));
    for (const g of groups) {
      const id = g.id; g.setAttribute('data-eq', id);
      const inside = tagNodes.filter((t) => g.contains(t.node));
      const named = id.length >= 3 ? tagNodes.filter((t) => !g.contains(t.node) && (t.orig === id || t.orig.includes(`.${id}.`) || t.orig.startsWith(`${id}.`) || t.orig.endsWith(`.${id}`))) : [];
      const tags = [...inside, ...named];
      const nameEl = g.querySelector('.ol-name, .pid-name, .pid-tag, .ol-tag');
      equipment[id] = { id, name: nameEl?.textContent?.trim() || id, desc: g.getAttribute('data-tip') || '', tags: tags.filter((t) => t.key).map((t) => ({ tag: t.key, label: t.label })), text: tags.filter((t) => !t.key).map((t) => [t.label, t.raw]) };
    }
    const nTags = tagNodes.filter((t) => t.key).length;
    stat.textContent = `${Object.keys(equipment).length} devices · ${nTags} live readings`;
    live.paint(el);

    svg.addEventListener('mousemove', (e) => {
      const hit = e.target.closest('[data-eq]'); const eq = hit && equipment[hit.getAttribute('data-eq')];
      if (!eq || drag) { hideHover(); return; }
      hoverCard(e, { title: eq.name, sub: `${eq.id} · ${meta.kind}`, desc: eq.desc, rows: [...eq.tags.slice(0, 4).map((t) => [t.label, live.text(t.tag)]), ...eq.text.slice(0, 2), ['', 'Click for readings & trend']] });
    });
    svg.addEventListener('mouseleave', hideHover);
    svg.addEventListener('click', (e) => { const hit = e.target.closest('[data-eq]'); if (hit) { hideHover(); openFace(hit.getAttribute('data-eq')); } });
    off = live.on(() => { if (selId && trend && !trend.isDisposed()) trend.setOption(trendOpt(equipment[selId].tags.slice(0, 2))); });
  }).catch((err) => { if (alive) canvas.innerHTML = `<div style="padding:40px">${ui.callout(`This drawing could not be loaded (${esc(err.message)}).`, 'crit', 'alert')}</div>`; });

  function trendOpt(tags) {
    return { grid: { left: 40, right: 8, top: 20, bottom: 14 }, legend: { top: 0, right: 0, textStyle: { fontSize: 10 }, itemWidth: 8, itemHeight: 8 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', show: false, data: live.hist(tags[0].tag).map((_, i) => i) }, yAxis: { type: 'value', scale: true }, series: tags.map((t) => ({ name: t.label, type: 'line', showSymbol: false, smooth: true, data: live.hist(t.tag).map((x) => +x.toFixed(3)), areaStyle: { opacity: 0.08 } })) };
  }
  function openFace(id) {
    const eq = equipment[id]; if (!eq) return;
    selId = id;
    svg.querySelectorAll('[data-eq].is-sel').forEach((n) => n.classList.remove('is-sel')); svg.querySelector(`[data-eq="${CSS.escape(id)}"]`)?.classList.add('is-sel');
    face.innerHTML = `<div class="nx-hmi-face-h"><small>${esc(id)} · ${esc(dno(file))}</small><h4>${esc(eq.name)}</h4>${eq.desc ? `<p>${esc(eq.desc)}</p>` : ''}<button type="button" class="nx-x" aria-label="Close">×</button></div><div class="nx-hmi-face-b">${eq.tags.length || eq.text.length ? `<div class="nx-hmi-tags">${eq.tags.map((t) => `<div><span>${esc(t.label)}<small>${esc(t.tag.split('|')[1])}</small></span><b data-live="${esc(t.tag)}">${esc(live.text(t.tag))}</b></div>`).join('')}${eq.text.map(([k, v]) => `<div><span>${esc(k)}<small>record value</small></span><b>${esc(v)}</b></div>`).join('')}</div>` : '<div class="nx-note">No readings on this device; see the drawing notes.</div>'}${eq.tags.length ? '<div class="nx-hmi-trend"></div>' : ''}<div class="nx-note">Record drawing ${esc(dno(file))}. Readings follow the historian around their recorded values.</div></div>`;
    face.classList.add('is-on');
    face.querySelector('.nx-x').onclick = () => { face.classList.remove('is-on'); selId = null; trend?.dispose(); trend = null; svg.querySelectorAll('[data-eq].is-sel').forEach((n) => n.classList.remove('is-sel')); };
    trend?.dispose(); trend = null;
    const tEl = face.querySelector('.nx-hmi-trend');
    if (tEl) drawChart(tEl, trendOpt(eq.tags.slice(0, 2))).then((i) => { trend = i; });
  }
  el.querySelector('.nx-hmi-bar').addEventListener('click', (e) => { if (!svg) return; const z = e.target.closest('[data-z]')?.dataset.z; if (z === 'in') zoom(0.8); if (z === 'out') zoom(1.25); if (z === 'fit') { vb = { x: 0, y: 0, w: W, h: H }; applyVb(); } });
  canvas.addEventListener('wheel', (e) => { if (!svg) return; e.preventDefault(); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y); }, { passive: false });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (!svg || e.target.closest('[data-eq]')) return; drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; canvas.classList.add('is-drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const r = svg.getBoundingClientRect(); const s = Math.max(vb.w / r.width, vb.h / r.height); vb = { ...drag.vb, x: drag.vb.x - (e.clientX - drag.x) * s, y: drag.vb.y - (e.clientY - drag.y) * s }; applyVb(); });
  canvas.addEventListener('pointerup', () => { drag = null; canvas.classList.remove('is-drag'); });
  return { dispose: () => { alive = false; off?.(); hideHover(); trend?.dispose(); } };
}

/* ------------------------------------------------------------------ tabs for module screens */
function libraryView(list, { grouped }) {
  const items = grouped ? GROUPS.map(([g, label]) => [label, list.filter((d) => d.mod === g)]).filter(([, l]) => l.length) : [['Record drawings', list]];
  return `<div class="nx-lib"><aside class="nx-lib-list">${items.map(([label, l]) => `<h5>${esc(label)} · ${l.length}</h5>${l.map((d) => `<button type="button" data-dwg="${esc(d.f)}">${icon(d.kind === 'P&ID' ? 'flow' : d.kind === 'PFD' ? 'layers' : 'schematic')}<div style="min-width:0"><b>${esc(d.title)}</b><span>${esc(dno(d.f))} · ${esc(d.kind)}</span></div></button>`).join('')}`).join('')}</aside><div class="nx-lib-view"><div class="nx-hmi is-full" data-dwgview style="flex:1"></div></div></div>`;
}
function mountLibrary(st, ctx, list) {
  let cur = null;
  const open = (f) => { cur?.dispose(); st.querySelectorAll('[data-dwg]').forEach((b) => b.classList.toggle('is-on', b.dataset.dwg === f)); const host = st.querySelector('[data-dwgview]'); host.className = 'nx-hmi is-full'; host.style.flex = '1'; cur = createDrawing(host, { file: f }); };
  ctx.on('click', '[data-dwg]', (e, b) => open(b.dataset.dwg));
  if (list[0]) open(list[0].f);
  return () => cur?.dispose();
}
/** Two tabs for a module's schematic screen: its own record drawings, and the full drawing library. */
export function drawingTabs(moduleId) {
  const own = PID_LIBRARY.filter((d) => d.mod === moduleId);
  const ordered = [...own, ...PID_LIBRARY.filter((d) => d.mod !== moduleId)];
  return [
    { name: `Record drawings (${own.length})`, icon: 'doc', full: true, render: () => libraryView(own, { grouped: false }), mount: (st, ctx) => mountLibrary(st, ctx, own) },
    { name: `Drawing library (${PID_LIBRARY.length})`, icon: 'layers', full: true, render: () => libraryView(ordered, { grouped: true }), mount: (st, ctx) => mountLibrary(st, ctx, ordered) },
  ];
}
