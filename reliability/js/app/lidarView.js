// The LiDAR tab: a 3D point cloud (three.js, loaded only when a LiDAR view opens), a 2D clearance profile (ECharts) and a table.
// Every view is labelled with where the points come from ("Simulated LiDAR" for the generated clouds).
// If WebGL is not available (or ?webgl=off), the table of clearance values is shown instead of the 3D view.

import { h, replace } from '../ui/dom.js';
import { drawChart } from './charts.js';
import { lidarSpansFor, loadLidarSpan, CLASS_COLORS, CLEARANCE_COLORS } from './lidarModel.js';

const THREE_SRC = '/reliability/js/vendor/three/three.module.min.js?v=0.160.1';
let threeLoading = null;
const loadThree = () => (threeLoading ??= import(THREE_SRC).catch((e) => { threeLoading = null; throw e; }));

function webglOk() {
  if (new URLSearchParams(location.search).get('webgl') === 'off') return false;
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const hex = (s) => parseInt(s.slice(1), 16);

/**
 * @param {HTMLElement} host
 * @param {{snap: any, assetId: string, testPrefix?: string}} o  assetId is a tower or a span
 * @returns {() => void} dispose
 */
export function mountLidar(host, { snap, assetId }) {
  const spans = lidarSpansFor(snap, assetId);
  const st = { span: spans[0]?.asset_id ?? null, mode: 'class', size: 2.4 };
  const parts = { three: null, chart: null, off: null, disposed: false };
  const dispose = () => { parts.disposed = true; parts.three?.dispose(); parts.chart?.dispose?.(); parts.three = null; parts.chart = null; };

  function draw() {
    parts.three?.dispose(); parts.chart?.dispose?.(); parts.three = null; parts.chart = null;
    const m = st.span ? loadLidarSpan(snap, st.span) : null;
    if (!m) { replace(host, h('p', { class: 'a360-muted', 'data-testid': 'lidar-none' }, 'No span to show: LiDAR is shown for towers and spans.')); return; }
    const gl = webglOk();

    const status = h('p', { class: 'ld-stats', 'data-testid': 'lidar-stats', role: 'status' },
      h('b', {}, `Clearance ${m.clearanceM} m`), ` · limit ${m.limitM} m · `,
      m.violation ? h('span', { class: 'ld-bad', 'data-testid': 'lidar-violation' }, `violation: ${(m.limitM - m.clearanceM).toFixed(1)} m under the limit`) : h('span', { class: 'ld-ok' }, 'within the limit'),
      h('span', { class: 'a360-muted' }, ` · ${m.lengthM} m span, ${m.points} points${m.redPoints ? `, ${m.redPoints} closer than the limit` : ''}`));

    const picker = spans.length > 1
      ? h('label', { class: 'ld-pick' }, 'Span ', h('select', { 'data-testid': 'lidar-span', 'aria-label': 'Span', onChange: (e) => { st.span = e.target.value; draw(); } },
        spans.map((s) => h('option', { value: s.asset_id, selected: s.asset_id === st.span }, `${s.name} (${s.ext.min_clearance_m} m)`))))
      : h('span', { class: 'a360-muted' }, m.name);

    const head = h('div', { class: 'ld-head' }, h('span', { class: 'ld-badge', 'data-testid': 'lidar-label' }, m.label), picker, h('span', { class: 'a360-muted' }, `${m.lineName} · ${m.kv} kV`));

    const modeBtn = (id, text) => h('button', { type: 'button', class: `ld-btn${st.mode === id ? ' is-on' : ''}`, 'aria-pressed': String(st.mode === id), 'data-testid': `lidar-mode-${id}`, onClick: () => { st.mode = id; parts.three?.setMode(id); controls.querySelectorAll('[data-testid^="lidar-mode-"]').forEach((b) => { const on = b.dataset.testid === `lidar-mode-${id}`; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); legend.replaceChildren(...legendItems(m, id)); } }, text);
    const controls = h('div', { class: 'ld-controls' },
      h('span', { class: 'ld-group', role: 'group', 'aria-label': 'Colour points' }, modeBtn('class', 'By class'), modeBtn('clearance', 'By clearance')),
      h('label', { class: 'ld-size' }, 'Point size ', h('input', { type: 'range', min: '0.8', max: '6', step: '0.2', value: String(st.size), 'data-testid': 'lidar-size', 'aria-label': 'Point size', onInput: (e) => { st.size = Number(e.target.value); parts.three?.setSize(st.size); } })),
      h('span', { class: 'ld-group', role: 'group', 'aria-label': 'View' },
        h('button', { type: 'button', class: 'ld-btn', 'data-testid': 'lidar-zoom-in', 'aria-label': 'Zoom in', onClick: () => parts.three?.zoom(0.8) }, '+'),
        h('button', { type: 'button', class: 'ld-btn', 'data-testid': 'lidar-zoom-out', 'aria-label': 'Zoom out', onClick: () => parts.three?.zoom(1.25) }, '−'),
        h('button', { type: 'button', class: 'ld-btn', 'data-testid': 'lidar-reset', onClick: () => parts.three?.reset() }, 'Reset view')));
    const legend = h('div', { class: 'ld-legend', 'data-testid': 'lidar-legend' }, ...legendItems(m, st.mode));

    const canvasBox = h('div', { class: 'ld-canvas', 'data-testid': 'lidar-canvas', 'data-ready': 'false', role: 'img', 'aria-label': `${m.label}: point cloud of span ${m.name}. Drag to orbit, scroll to zoom. The clearance table below has the same numbers.` });
    const profileBox = h('div', { class: 'ld-profile', 'data-testid': 'lidar-profile', 'data-ready': 'false', role: 'img', 'aria-label': `${m.label}: clearance profile along span ${m.name}, lowest clearance ${m.clearanceM} m at ${m.lowest.x} m` });
    const table = clearanceTable(m);
    const fallback = h('div', { class: 'ld-fallback', 'data-testid': 'lidar-fallback', role: 'status' }, h('p', {}, '3D view unavailable (WebGL is off in this browser). The clearance values are in the table.'), table);

    replace(host, h('div', { class: 'ld', 'data-testid': 'lidar-view' }, head, status,
      gl ? [controls, canvasBox, legend, h('p', { class: 'a360-muted a360-small' }, 'Drag to orbit, scroll to zoom, Shift-drag to pan. Red points are closer to a conductor than the limit; the ring marks the lowest clearance.')] : fallback,
      h('h4', { class: 'ld-h' }, 'Clearance profile along the span'), profileBox,
      gl ? h('details', { class: 'ld-details' }, h('summary', {}, 'Clearance values (table)'), table) : null));

    const mine = {};
    drawChart(profileBox, (p) => profileOption(m, p)).then((c) => { if (parts.disposed || !profileBox.isConnected) { c.dispose(); return; } parts.chart = c; profileBox.dataset.ready = 'true'; })
      .catch(() => { profileBox.dataset.ready = 'error'; profileBox.replaceChildren(h('p', { class: 'a360-muted' }, 'The chart library could not be loaded; the table has the values.')); });
    if (gl) {
      loadThree().then((THREE) => { if (parts.disposed || !canvasBox.isConnected) return; mine.three = createScene(THREE, canvasBox, m, st); parts.three = mine.three; canvasBox.dataset.ready = 'true'; })
        .catch(() => { canvasBox.dataset.ready = 'error'; canvasBox.replaceChildren(h('div', { class: 'ld-fallback', 'data-testid': 'lidar-fallback', role: 'status' }, h('p', {}, '3D view could not be loaded. The clearance values are in the table below.'))); });
    }
  }

  draw();
  return dispose;
}

function legendItems(m, mode) {
  const sw = (c, t) => h('span', { class: 'ld-key' }, h('i', { style: { background: c } }), t);
  return mode === 'class'
    ? [sw(CLASS_COLORS[1], 'Ground'), sw(CLASS_COLORS[2], 'Vegetation'), sw(CLASS_COLORS[3], 'Structure'), sw(CLASS_COLORS[4], 'Conductor')]
    : [sw(CLEARANCE_COLORS.red, `under ${m.limitM} m (violation)`), sw(CLEARANCE_COLORS.amber, `${m.limitM} to ${m.limitM + 2} m`), sw(CLEARANCE_COLORS.green, `over ${m.limitM + 2} m`), sw(CLEARANCE_COLORS.neutral, 'structure and conductor')];
}

function clearanceTable(m) {
  return h('table', { class: 'a360-table ld-table', 'data-testid': 'lidar-table' },
    h('caption', { class: 'a360-muted a360-small' }, `${m.label} · every ${(m.lengthM / 10).toFixed(0)} m along ${m.name}; metres above the tower base`),
    h('thead', {}, h('tr', {}, ['Along (m)', 'Ground', 'Vegetation top', 'Conductor', 'Limit line', 'Clearance'].map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, m.rows.map((r) => h('tr', { class: r.clearance !== null && r.clearance < m.limitM ? 'ld-row-bad' : '' },
      [r.x, r.ground, r.vegetation ?? '–', r.conductor, r.limit, r.clearance ?? '–'].map((v) => h('td', {}, String(v)))))));
}

/** Distance along the span vs height: ground, vegetation tops, the conductor, the limit line, the lowest clearance marked. */
function profileOption(m, p) {
  const xs = m.profile.map((s) => s.x);
  const line = (name, key, color, extra = {}) => ({ name, type: 'line', data: m.profile.map((s) => [s.x, s[key]]), showSymbol: false, lineStyle: { width: 2, color }, itemStyle: { color }, connectNulls: true, ...extra });
  return {
    aria: { enabled: true }, animation: false, textStyle: { color: p.muted, fontSize: 11 },
    grid: { left: 44, right: 16, top: 36, bottom: 42 }, tooltip: { trigger: 'axis', valueFormatter: (v) => (v === null || v === undefined ? '–' : `${v} m`) },
    legend: { top: 0, textStyle: { color: p.muted }, data: ['Ground', 'Vegetation tops', 'Conductor (lowest phase)', 'Minimum-clearance line'] },
    xAxis: { type: 'value', min: 0, max: Math.max(...xs), name: 'distance along span (m)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: p.muted }, axisLabel: { color: p.muted }, axisLine: { lineStyle: { color: p.line } }, splitLine: { show: false } },
    yAxis: { type: 'value', name: 'height (m)', nameTextStyle: { color: p.muted }, axisLabel: { color: p.muted }, splitLine: { lineStyle: { color: p.line } } },
    series: [
      line('Ground', 'ground', '#a98f63', { areaStyle: { color: '#a98f6340' } }),
      line('Vegetation tops', 'vegetation', '#38a35c', { lineStyle: { width: 2, color: '#38a35c' }, areaStyle: { color: '#38a35c33' } }),
      line('Conductor (lowest phase)', 'conductor', '#2f7de1', { lineStyle: { width: 2.5, color: '#2f7de1' } }),
      line('Minimum-clearance line', 'limit', '#e5484d', {
        lineStyle: { width: 1.5, color: '#e5484d', type: 'dashed' },
        markPoint: { symbol: 'pin', symbolSize: 46, itemStyle: { color: m.violation ? '#e5484d' : '#2f7de1' }, label: { color: '#fff', fontSize: 10, formatter: () => `${m.clearanceM}` }, data: [{ name: 'Lowest clearance', coord: [m.lowest.x, m.lowest.z] }] },
      }),
    ],
  };
}

// ------------------------------------------------------------------ the 3D scene

function createScene(THREE, box, m, state) {
  const { cloud } = m;
  const css = getComputedStyle(box);
  const bg = css.getPropertyValue('--rel-sunken').trim() || '#eef1f4';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(bg);
  box.replaceChildren(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);

  // simulation (x along, y across, z up) -> scene (x along, y up, z across), centred on the middle of the span
  const n = cloud.count;
  const pos = new Float32Array(n * 3);
  const cx = m.lengthM / 2;
  for (let i = 0; i < n; i += 1) { pos[i * 3] = cloud.x[i] - cx; pos[i * 3 + 1] = cloud.z[i]; pos[i * 3 + 2] = cloud.y[i]; }
  const colors = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: state.size, sizeAttenuation: false, vertexColors: true });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const tmp = new THREE.Color();
  function paint(mode) {
    for (let i = 0; i < n; i += 1) {
      let c;
      if (mode === 'class') c = CLASS_COLORS[cloud.cls[i]];
      else {
        const d = cloud.clearance[i];
        c = Number.isNaN(d) ? CLEARANCE_COLORS.neutral : d < m.limitM ? CLEARANCE_COLORS.red : d < m.limitM + 2 ? CLEARANCE_COLORS.amber : CLEARANCE_COLORS.green;
      }
      tmp.setHex(hex(c));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.attributes.color.needsUpdate = true;
  }
  paint(state.mode);

  // a ring at the lowest clearance
  const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(2.2, m.lengthM * 0.012), Math.max(0.3, m.lengthM * 0.0014), 8, 32), new THREE.MeshBasicMaterial({ color: m.violation ? 0xe5484d : 0xffffff }));
  ring.position.set(m.lowest.x - cx, m.lowest.z, m.lowest.y);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  // orbit camera: azimuth, elevation, distance around a target
  const target0 = new THREE.Vector3(0, m.towerHeightM * 0.45, 0);
  const view0 = { az: -0.55, el: 0.32, dist: Math.max(m.lengthM * 0.85, 120), target: target0.clone() };
  let view = { ...view0, target: target0.clone() };
  let dirty = true; let raf = 0; let dead = false;
  const place = () => {
    const { az, el, dist, target } = view;
    camera.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
  };
  const resize = () => {
    const w = box.clientWidth || 600; const hgt = box.clientHeight || 360;
    renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix(); dirty = true;
  };
  const frame = () => { raf = 0; if (dead) return; if (dirty) { dirty = false; place(); renderer.render(scene, camera); } };
  const invalidate = () => { dirty = true; if (!raf && !dead) raf = requestAnimationFrame(frame); };
  const ro = new ResizeObserver(() => { resize(); invalidate(); });
  ro.observe(box); resize(); invalidate();

  const el = renderer.domElement;
  let drag = null;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; };
  const move = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = view.dist * 0.0012;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      view.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else { view.az -= dx * 0.006; view.el = Math.max(-0.2, Math.min(1.45, view.el + dy * 0.005)); }
    invalidate();
  };
  const up = (e) => { drag = null; el.style.cursor = 'grab'; try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ } };
  const wheel = (e) => { e.preventDefault(); view.dist = Math.max(15, Math.min(1500, view.dist * (e.deltaY > 0 ? 1.1 : 0.9))); invalidate(); };
  const key = (e) => { if (e.key === '+' || e.key === '=') api.zoom(0.8); else if (e.key === '-') api.zoom(1.25); else if (e.key === '0') api.reset(); else if (e.key === 'ArrowLeft') { view.az += 0.08; invalidate(); } else if (e.key === 'ArrowRight') { view.az -= 0.08; invalidate(); } else return; e.preventDefault(); };
  el.tabIndex = 0;
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('contextmenu', (e) => e.preventDefault()); el.addEventListener('keydown', key);
  const onTheme = () => { renderer.setClearColor(getComputedStyle(box).getPropertyValue('--rel-sunken').trim() || bg); invalidate(); };
  window.addEventListener('reliability-theme', onTheme);

  const api = {
    setMode(mode) { paint(mode); invalidate(); },
    setSize(s) { mat.size = s; invalidate(); },
    zoom(f) { view.dist = Math.max(15, Math.min(1500, view.dist * f)); invalidate(); },
    reset() { view = { ...view0, target: target0.clone() }; invalidate(); },
    /** for tests: the camera distance and azimuth */
    info: () => ({ calls: renderer.info.render.calls, points: renderer.info.render.points, size: [renderer.domElement.width, renderer.domElement.height], cam: camera.position.toArray().map((v) => Math.round(v)), gl: Boolean(renderer.getContext()), lost: renderer.getContext().isContextLost() }),
    state: () => ({ dist: Math.round(view.dist * 10) / 10, az: Math.round(view.az * 1000) / 1000, size: mat.size }),
    dispose() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('reliability-theme', onTheme);
      geo.dispose(); mat.dispose(); ring.geometry.dispose(); ring.material.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
  box.__lidar = api;
  return api;
}
