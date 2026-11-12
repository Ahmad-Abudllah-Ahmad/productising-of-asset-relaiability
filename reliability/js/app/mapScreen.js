// Risk Map, rebuilt on the repository data with the vendored Leaflet (reliability/js/vendor/leaflet, loaded on demand).
//
//   spans are drawn as lines coloured by their health index band; towers and substations as markers coloured by band;
//   open findings as clusters; layers can be switched on and off; one managed label can be highlighted (everything that
//   carries it stays bright, the rest fades); a lasso lists the assets inside it with their total risk.
//   A click on a marker opens Asset 360, a click on a finding opens the finding viewer.
//
// Tiles come from outside the site (CONFIG.map.tileUrl). If they fail to load the map keeps working on a plain
// background: ?tiles=off shows that state without trying. The layers and the highlighted label are in the URL hash
// (view=map, layers=..., label=...). The map is built once; theme and data changes restyle it without moving the view.

import { h, replace } from '../ui/dom.js';
import { CONFIG } from '../domain/config.js';
import { spark, tag, plural, humanize, BAND_TONE, RISK_SUB, writeView, field, emptyState, mountScreen } from './screenKit.js';
import { loadMap, parseLayers, layersParam, LAYERS, LAYER_LABEL } from './mapModel.js';
import { palette } from './charts.js';
import { openAsset } from './assetPanel.js';
import { openFinding } from './findingViewer.js';
import { parseView } from './hashState.js';

const BASE = '/reliability/js/vendor/leaflet';
let loading = null;
/** @returns {Promise<any>} the Leaflet global; script and stylesheet are fetched the first time the map is opened */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = `${BASE}/leaflet.css?v=1.9.4`;
      document.head.append(css);
      const s = document.createElement('script');
      s.src = `${BASE}/leaflet.js?v=1.9.4`;
      s.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet loaded but did not register')));
      s.onerror = () => { loading = null; reject(new Error('The map library could not be loaded')); };
      document.head.append(s);
    });
  }
  return loading;
}

export function createMapScreen(deps) {
  return { tabs: [{ name: 'Map', render: () => '<div class="screen hl" data-testid="risk-map" data-hl-root></div>', mount: (stage) => mountMap(stage, deps) }] };
}

const COND_VAR = (n) => `--rel-cond-${n}`;
const NOT_ON = (set, id) => set && !set.has(id);

function mountMap(stage, deps) {
  const flags = deps.flags ?? {};
  let controller = null;
  let kpiHost = null;
  let panelHost = null;

  const cleanup = mountScreen(stage, deps, {
    view: 'map',
    noun: 'the map',
    state(snap) {
      const want = parseView(location.hash);
      const layers = parseLayers(want.layers);
      const label = snap && want.label && snap.assets.some((a) => a.labels.includes(want.label)) ? want.label : '';
      writeView({ view: 'map', layers: layersParam(layers), label: label || null });
      this.last = `${layersParam(layers) ?? ''}|${label}`;
      return { layers, label };
    },
    urlChanged() { const w = parseView(location.hash); return w.view === 'map' && `${w.layers ?? ''}|${w.label ?? ''}` !== this.last; },
    controls(st, snap, redo) {
      if (!snap) return [];
      const set = (patch) => { writeView({ view: 'map', layers: layersParam(st.layers), label: st.label || null, ...patch }); redo({ quiet: true }); };
      const toggle = (l) => { const on = new Set(st.layers); if (on.has(l)) on.delete(l); else on.add(l); set({ layers: layersParam(on) }); };
      const labels = loadMap(snap).labels;
      const kinds = [...new Set(labels.map((l) => l.kindWord))];
      return [
        h('div', { class: 'filter-label' }, 'Layers'),
        ...LAYERS.map((l) => h('label', { class: 'rm-check' }, h('input', { type: 'checkbox', 'data-testid': `layer-${l}`, checked: st.layers.has(l), onChange: () => toggle(l) }), LAYER_LABEL[l])),
        h('div', { class: 'filter-label' }, 'Highlight a label'),
        field('Everything that shares it', h('select', { 'data-testid': 'label-select', 'aria-label': 'Highlight a label', onChange: (e) => set({ label: e.target.value || null }) },
          h('option', { value: '' }, 'None'),
          kinds.map((k) => h('optgroup', { label: k }, labels.filter((l) => l.kindWord === k).map((l) => h('option', { value: l.id, selected: l.id === st.label }, `${l.value} (${l.count})`)))))),
        h('button', { class: 'linkish hl-clear-filters', type: 'button', 'data-testid': 'clear-filters', onClick: () => { controller?.clearSelection(); set({ layers: null, label: null }); } }, 'Reset layers and label'),
      ];
    },
    load: (snap, st) => loadMap(snap, { label: st.label || null }),
    draw(m, ctx) {
      if (m.empty) return [emptyState('map-empty', 'Nothing to draw', 'No tower, span or substation has a position. Import assets with locations, then reload.')];
      kpiHost = h('div', { 'data-testid': 'hl-kpis' });
      kpiHost.innerHTML = kpiCards(m, ctx.deps.kit);
      panelHost = h('aside', { class: 'card hl-card rm-side', 'data-testid': 'map-side' });
      const mapEl = h('div', { class: 'rm-map', 'data-testid': 'map', 'data-basemap': 'loading', role: 'application', 'aria-label': 'Risk map: lines, towers and substations coloured by health index band' });
      const banner = h('div', { class: 'rm-banner', 'data-testid': 'basemap-fallback', role: 'status', hidden: true }, 'Basemap tiles are not available. Showing lines and towers on a plain background.');
      const lassoBtn = h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'lasso', 'aria-pressed': 'false', title: 'Hold the mouse button and drag around the assets to select' }, 'Lasso');
      const tools = h('div', { class: 'rm-tools' }, lassoBtn, h('button', { class: 'lr-btn', type: 'button', 'data-testid': 'clear-selection', onClick: () => controller?.clearSelection() }, 'Clear selection'));
      const wrap = h('div', { class: 'rm-mapwrap' }, mapEl, banner, tools);
      const card = h('section', { class: 'card hl-card rm-card', 'data-testid': 'map-card' }, wrap, legend());
      controller = createController({ mapEl, banner, lassoBtn, panelHost, flags, deps });
      ctx.track(() => { controller?.destroy(); controller = null; });
      controller.update(m, ctx.state);
      controller.renderPanel();
      return [h('div', { class: 'hl-main' }, h('div', { class: 'hl-head', 'data-testid': 'hl-head' }, h('div', {}, h('h2', {}, 'Risk map'), h('p', { class: 'a360-muted a360-small' }, `${plural(m.towers.length, 'tower')}, ${plural(m.spans.length, 'span')}, ${plural(m.stations.length, 'substation')} · scores as of ${m.asOf}`))),
        kpiHost, h('div', { class: 'rm-grid' }, card, panelHost))];
    },
    redraw(m, ctx) {
      if (kpiHost) kpiHost.innerHTML = kpiCards(m, ctx.deps.kit);
      controller?.update(m, ctx.state);
    },
  });
  return () => { cleanup(); controller?.destroy(); controller = null; };
}

function kpiCards(m, kit) {
  const c = m.counts;
  const top = m.top;
  return kit.kpis([
    { l: 'Towers on the map', v: String(c.towers), s: `${c.poor} poor · ${c.moderate} moderate · ${c.none} not assessed`, tone: c.poor ? 'bad' : c.moderate ? 'warn' : 'ok', tip: 'Towers with a position. Duplicate records are not drawn.', spark: spark([c.towers]) },
    { l: 'Highest risk', v: top ? top.name : '-', s: top ? `risk ${Math.round(top.risk)} · ${top.riskBand} · ${top.kind}` : 'nothing scored', tone: top ? RISK_SUB[top.riskBand] : 'neutral', tip: '(100 - health index) x criticality x consequence, with the linked-asset uplift. Click the marker to see why.', spark: spark([top?.risk ?? null]) },
    { l: 'Total risk', v: String(m.totalRisk), s: `over ${m.scoredAssets} towers, spans and transformers`, tone: 'neutral', tip: 'The sum of the risk scores of everything that has one, at each campaign date and today.', spark: spark(m.riskSeries) },
    { l: 'Open findings', v: String(m.findings.length), s: `${m.unreviewedFindings} unreviewed`, tone: m.unreviewedFindings ? 'warn' : 'neutral', tip: 'Findings that no repair has closed and a reviewer has not rejected, each with a GPS point.', spark: spark([m.findings.length]) },
  ]);
}

function legend() {
  const sw = (cls, text) => h('span', {}, h('i', { class: `hl-swatch ${cls}` }), text);
  return h('div', { class: 'hl-legend', 'data-testid': 'map-legend' },
    sw('hl-band-normal', 'normal'), sw('hl-band-moderate', 'moderate'), sw('hl-band-poor', 'poor'), sw('hl-band-none', 'not assessed'),
    h('span', { class: 'a360-muted' }, 'Lines are spans, each coloured by its own health index. Round markers are towers, squares are substations (the band of the worst transformer). Numbers are open findings; click one to zoom in.'));
}

// ------------------------------------------------------------------------------------------------ the Leaflet side

function createController({ mapEl, banner, lassoBtn, panelHost, flags, deps }) {
  let L = null;
  let map = null;
  let model = null;
  let state = null;
  let polygon = null; // the lasso, as [{lat, lng}]
  let selected = new Set();
  let lassoOn = false;
  let drawing = null;
  let destroyed = false;
  const g = {};
  let tiles = null;
  let tileLoads = 0;
  let tileErrors = 0;
  const query = new URLSearchParams(location.search);
  const forceOffline = query.get('tiles') === 'off';

  const setBasemap = (v) => { mapEl.dataset.basemap = v; banner.hidden = v !== 'fallback'; };

  function styleFor() { return palette(mapEl); }

  function applyTiles() {
    if (!map) return;
    const wantTiles = state.layers.has('tiles');
    if (!wantTiles) { if (tiles && map.hasLayer(tiles)) map.removeLayer(tiles); setBasemap('off'); return; }
    if (forceOffline || tileErrors >= CONFIG.map.tileErrorLimit && tileLoads === 0) { if (tiles && map.hasLayer(tiles)) map.removeLayer(tiles); setBasemap('fallback'); return; }
    if (!tiles) {
      tiles = L.tileLayer(CONFIG.map.tileUrl, { attribution: CONFIG.map.attribution, maxZoom: 18, crossOrigin: false });
      tiles.on('tileload', () => { tileLoads += 1; if (!destroyed && mapEl.dataset.basemap !== 'tiles') setBasemap('tiles'); });
      tiles.on('tileerror', () => { tileErrors += 1; if (!destroyed && tileLoads === 0 && tileErrors >= CONFIG.map.tileErrorLimit) applyTiles(); });
    }
    if (!map.hasLayer(tiles)) tiles.addTo(map);
    if (mapEl.dataset.basemap !== 'tiles') setBasemap(tileLoads ? 'tiles' : 'loading');
  }

  function tip(lines) { return h('div', { class: 'rm-tip' }, lines.map((l, i) => h(i ? 'div' : 'b', {}, l))); }

  function drawAll() {
    const p = styleFor();
    for (const k of Object.keys(g)) g[k].clearLayers();
    const hl = model.highlighted;
    const open = (id) => (e) => { L.DomEvent.stopPropagation(e); if (!lassoOn) openAsset(id); };

    if (state.layers.has('spans')) {
      for (const s of model.spans) {
        const dim = NOT_ON(hl, s.id);
        const line = L.polyline(s.coords, { color: p.band[s.band], weight: dim ? 2 : 5, opacity: dim ? 0.3 : 0.95, dashArray: s.band === 'none' ? '3 7' : null, lineCap: 'butt', bubblingMouseEvents: false, className: 'rm-span' });
        line.bindTooltip(tip([`${s.name} · span`, s.hi === null ? 'not assessed' : `health index ${s.hi} (${s.band})`, `${model.lineName(s.lineId)}${s.clearance ? ` · clearance ${s.clearance} m` : ''}`, s.risk === null ? '' : `risk ${Math.round(s.risk)}`]), { sticky: true });
        line.on('click', open(s.id));
        g.spans.addLayer(line);
        if (selected.has(s.id)) g.sel.addLayer(L.polyline(s.coords, { color: p.ink, weight: 9, opacity: 0.35, interactive: false }));
      }
    }
    if (state.layers.has('towers')) {
      for (const t of model.towers) {
        const dim = NOT_ON(hl, t.id);
        const m = L.circleMarker([t.lat, t.lng], { radius: dim ? 3 : hl ? 5 : 6, color: p.stroke, weight: 1.5, fillColor: p.band[t.band], fillOpacity: dim ? 0.3 : 1, opacity: dim ? 0.4 : 1, bubblingMouseEvents: false, className: 'rm-tower' });
        m.bindTooltip(tip([`${t.name} · tower`, t.hi === null ? 'not assessed' : `health index ${t.hi} (${t.band})`, `${model.lineName(t.lineId)}${t.open ? ` · ${plural(t.open, 'open finding')}` : ''}`, t.risk === null ? '' : `risk ${Math.round(t.risk)} (${t.riskBand})`]));
        m.on('click', open(t.id));
        g.towers.addLayer(m);
        if (selected.has(t.id)) g.sel.addLayer(L.circleMarker([t.lat, t.lng], { radius: 11, color: p.ink, weight: 2, fill: false, interactive: false }));
      }
    }
    if (state.layers.has('stations')) {
      for (const s of model.stations) {
        const dim = NOT_ON(hl, s.id);
        const icon = L.divIcon({ className: 'rm-icon', html: `<span class="rm-station hl-band-${s.band}${dim ? ' is-dim' : ''}"></span>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        const m = L.marker([s.lat, s.lng], { icon, keyboard: true, title: `${s.name}, ${s.band === 'none' ? 'not assessed' : s.band}`, bubblingMouseEvents: false });
        m.bindTooltip(tip([`${s.name} · substation`, `worst transformer: ${s.band === 'none' ? 'not assessed' : s.band}`, ...s.transformers.map((t) => `${t.name}: ${t.hi === null ? 'not assessed' : `${t.hi} (${t.band})`}`)]), { direction: 'top', offset: [0, -8] });
        m.on('click', open(s.id));
        m.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') openAsset(s.id); });
        g.stations.addLayer(m);
        if (selected.has(s.id)) g.sel.addLayer(L.circleMarker([s.lat, s.lng], { radius: 16, color: p.ink, weight: 2, fill: false, interactive: false }));
      }
    }
    for (const t of model.transformers) if (selected.has(t.id)) g.sel.addLayer(L.circleMarker([t.lat, t.lng], { radius: 8, color: p.ink, weight: 2, fill: false, interactive: false }));
    drawClusters();
    if (polygon) g.lasso.addLayer(L.polygon(polygon.map((q) => [q.lat, q.lng]), { color: p.blue, weight: 2, dashArray: '6 4', fillOpacity: 0.08, interactive: false }));
  }

  function drawClusters() {
    g.findings.clearLayers();
    if (!state.layers.has('findings') || !map) return;
    const cell = CONFIG.map.clusterPx;
    const z = map.getZoom();
    const buckets = new Map();
    for (const f of model.findings) {
      const pt = map.project([f.lat, f.lng], z);
      const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)).push(f);
    }
    for (const members of buckets.values()) {
      const worst = Math.min(...members.map((f) => f.condition));
      const lat = members.reduce((n, f) => n + f.lat, 0) / members.length;
      const lng = members.reduce((n, f) => n + f.lng, 0) / members.length;
      if (members.length === 1) {
        const f = members[0];
        const m = L.circleMarker([f.lat, f.lng], { radius: 5, color: getComputedStyle(mapEl).getPropertyValue('--rel-shape-line').trim() || '#555', weight: 1.5, fillColor: getComputedStyle(mapEl).getPropertyValue(COND_VAR(worst)).trim(), fillOpacity: 1, bubblingMouseEvents: false, pane: 'markerPane', className: 'rm-finding' });
        m.bindTooltip(tip([`${f.id} · ${humanize(f.defectClass)}`, `${f.severity}${f.unreviewed ? ' · unreviewed' : ''}`, f.ownerName]));
        m.on('click', (e) => { L.DomEvent.stopPropagation(e); if (!lassoOn) openFinding(f.id); });
        g.findings.addLayer(m);
        continue;
      }
      const size = 22 + Math.min(12, Math.round(Math.log2(members.length) * 3));
      const icon = L.divIcon({ className: 'rm-icon', html: `<span class="rm-cluster hl-c${worst}" style="width:${size}px;height:${size}px;line-height:${size - 3}px">${members.length}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      const m = L.marker([lat, lng], { icon, keyboard: true, title: `${members.length} open findings, worst ${members.find((f) => f.condition === worst).severity}`, bubblingMouseEvents: false });
      m.bindTooltip(tip([`${plural(members.length, 'open finding')}`, `worst: ${members.find((f) => f.condition === worst).severity}`, 'click to zoom in']));
      const zoomIn = (e) => {
        if (e) L.DomEvent.stopPropagation(e);
        if (lassoOn) return;
        const bounds = L.latLngBounds(members.map((f) => [f.lat, f.lng]));
        const before = map.getZoom();
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
        if (map.getZoom() === before && before >= 18) openFinding(members[0].id);
      };
      m.on('click', zoomIn);
      m.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') zoomIn(); });
      g.findings.addLayer(m);
    }
  }

  // ---- the lasso
  function setLasso(on) {
    lassoOn = on;
    mapEl.classList.toggle('is-lasso', on);
    lassoBtn.setAttribute('aria-pressed', String(on));
    lassoBtn.classList.toggle('is-on', on);
    if (!map) return;
    if (on) map.dragging.disable(); else map.dragging.enable();
  }
  lassoBtn.addEventListener('click', () => setLasso(!lassoOn));
  const onKey = (e) => { if (e.key === 'Escape' && lassoOn) { drawing?.line.remove(); drawing = null; setLasso(false); } };
  document.addEventListener('keydown', onKey);

  function finishLasso() {
    if (!drawing) return;
    const pts = drawing.pts;
    drawing.line.remove();
    drawing = null;
    if (pts.length < 3) return;
    polygon = pts.map((q) => ({ lat: q.lat, lng: q.lng }));
    selected = new Set(model.select(polygon).items.map((x) => x.id));
    drawAll();
    renderPanel();
  }
  const onUp = () => finishLasso();
  document.addEventListener('mouseup', onUp);

  function clearSelection() {
    polygon = null; selected = new Set();
    if (!model) return;
    drawAll(); renderPanel();
  }

  function renderPanel() {
    const sel = polygon && model ? model.select(polygon) : null;
    if (!sel) {
      replace(panelHost, h('h3', {}, 'Lasso selection'), h('p', { class: 'a360-muted a360-small' }, 'Press Lasso, then hold the mouse button and drag around the assets you want. They are listed here with their total risk. Escape cancels.'), h('p', { class: 'a360-muted', 'data-testid': 'selection-empty' }, 'Nothing selected.'));
      return;
    }
    const rows = sel.items.map((x) => h('tr', { 'data-asset': x.id },
      h('td', {}, h('button', { class: 'a360-link', type: 'button', onClick: (e) => openAsset(x.id, { opener: e.currentTarget }) }, x.name), h('div', { class: 'a360-muted a360-small' }, x.kind)),
      h('td', {}, x.kind === 'station' ? h('span', { class: 'a360-muted' }, '–') : tag(x.band === 'none' ? 'not assessed' : `${x.hi} · ${x.band}`, BAND_TONE[x.band])),
      h('td', { class: 'rm-num' }, x.risk === null ? '–' : String(Math.round(x.risk)))));
    replace(panelHost, h('h3', {}, 'Lasso selection'),
      h('p', { class: 'rm-total', 'data-testid': 'selection-total' }, h('b', {}, `Total risk ${Math.round(sel.total)}`), h('span', { class: 'a360-muted' }, ` over ${plural(sel.scored, 'asset')} with a score`)),
      h('p', { class: 'a360-muted a360-small', 'data-testid': 'selection-summary' }, `${plural(sel.items.length, 'asset')} selected: ${plural(sel.byKind.tower, 'tower')}, ${plural(sel.byKind.span, 'span')}, ${plural(sel.byKind.transformer, 'transformer')}, ${plural(sel.byKind.station, 'substation')}. Spans count when their midpoint is inside.`),
      h('div', { class: 'hl-scroll rm-list' }, h('table', { class: 'a360-table', 'data-testid': 'selection' }, h('thead', {}, h('tr', {}, ...['Asset', 'Health index', 'Risk'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows))),
      h('button', { class: 'lr-btn', type: 'button', onClick: clearSelection }, 'Clear selection'));
  }

  // ---- building the map (once) and restyling it
  const ready = loadLeaflet().then((Lf) => {
    if (destroyed) return;
    L = Lf;
    map = L.map(mapEl, { zoomControl: true, attributionControl: true, minZoom: 5 });
    for (const k of ['spans', 'towers', 'stations', 'findings', 'sel', 'lasso']) g[k] = L.layerGroup().addTo(map);
    map.invalidateSize(false);
    if (model.bounds) map.fitBounds(model.bounds, { padding: [30, 30] });
    else map.setView([40.5, 49.9], 9);
    map.on('zoomend', drawClusters);
    map.on('mousedown', (e) => { if (lassoOn) drawing = { pts: [e.latlng], line: L.polyline([e.latlng], { color: styleFor().blue, weight: 2, dashArray: '4 4', interactive: false }).addTo(map) }; });
    map.on('mousemove', (e) => { if (drawing) { drawing.pts.push(e.latlng); drawing.line.setLatLngs(drawing.pts); } });
    applyTiles();
    drawAll();
    mapEl.__map = map; // for the tests and for debugging in the console
    mapEl.dataset.ready = 'true';
  }).catch((e) => { mapEl.replaceChildren(h('p', { class: 'a360-muted a360-note', role: 'status' }, `The map could not be drawn (${e.message}).`)); mapEl.dataset.ready = 'failed'; });

  return {
    update(m, st) {
      model = m; state = st;
      if (!map) return;
      if (polygon) selected = new Set(m.select(polygon).items.map((x) => x.id));
      applyTiles();
      drawAll();
      renderPanel();
    },
    renderPanel,
    clearSelection,
    destroy() {
      destroyed = true;
      document.removeEventListener('keydown', onKey); document.removeEventListener('mouseup', onUp);
      ready.then(() => { try { map?.remove(); } catch { /* already gone */ } });
    },
  };
}
