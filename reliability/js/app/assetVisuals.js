// Asset visuals: one realistic elevation or section drawing per kind of asset, coloured by condition the same way the tower
// structure is (5 very good ... 1 very poor, grey dashed = not assessed). The Asset 360 Components tab shows the drawing for
// the asset it is open on: span, line, transformer and its parts, and every tower component (insulator string, damper,
// conductor, earth wire, foundation, right-of-way corridor).
//
// assetVisual(input) is pure: it takes numbers and returns { title, svg, key, note } or null. No DOM, no data lookups.
//   input = { classId, kind, name, level, groups, inputs, parts, span, line }
//     level   1..5 worst condition of the asset itself (components), null = not assessed
//     groups  { group: score 1..5 }        span / tower health groups
//     inputs  { dga|oil|tests|visual|age: score 0..100 | null }   transformer health inputs
//     parts   { class: worst 1..5 | null }   a transformer's children (bushing, tap_changer, cooling, tank_oil)
//     span    { lengthM, clearanceM, limitM }
//     line    { units: [{ kind: 'tower'|'span', band }] , counts }

import { COND_COLORS, COND_WORDS } from './towerTwin.js';

const INK = '#334155'; const STEEL = '#94a3b8'; const STEEL_D = '#64748b'; const GROUND = '#a98f63'; const NA = '#cbd5e1';
const clampLevel = (v) => (v == null || Number.isNaN(v) ? null : Math.max(1, Math.min(5, Math.round(v))));
const fromScore = (s) => (s == null ? null : s >= 85 ? 5 : s >= 70 ? 4 : s >= 55 ? 3 : s >= 40 ? 2 : 1);
const col = (level) => (level == null ? NA : COND_COLORS[level] || NA);
const dash = (level) => (level == null ? ' stroke-dasharray="4 3"' : '');
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`; };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const word = (level) => (level == null ? 'not assessed' : COND_WORDS[level]);

/** A callout: a leader line from (x1,y) to the margin and "label n" beside it. */
function call(x1, y, label, level, side = 'L', margin = null) {
  const x2 = margin ?? (side === 'L' ? -66 : 426);
  const anchor = side === 'L' ? 'start' : 'end';
  const tx = side === 'L' ? x2 - 2 : x2 + 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${STEEL}" stroke-width="1"/><circle cx="${x1}" cy="${y}" r="2.4" fill="${INK}"/><text x="${tx}" y="${y - 4}" text-anchor="${anchor}" font-size="9.5" fill="#334155">${esc(label)} <tspan font-weight="700">${level == null ? '–' : level}</tspan></text>`;
}
const svg = (w, h, body, label) => `<svg viewBox="-72 0 ${w + 144} ${h}" style="width:100%;max-width:760px;max-height:440px" role="img" aria-label="${esc(label)}" font-family="inherit">${body}</svg>`;
const defs = (id, level) => `<defs><linearGradient id="g${id}" x1="0" x2="1"><stop offset="0" stop-color="${shade(col(level), 0.78)}"/><stop offset=".45" stop-color="${shade(col(level), 1.12)}"/><stop offset="1" stop-color="${shade(col(level), 0.82)}"/></linearGradient></defs>`;

/* ------------------------------------------------------------------------------- tower parts */

function insulatorString({ level }) {
  const c = col(level); const discs = Array.from({ length: 14 }, (_, i) => {
    const y = 78 + i * 17;
    return `<ellipse cx="180" cy="${y + 5}" rx="30" ry="4" fill="${shade(c, 0.7)}"/><path d="M148 ${y} Q180 ${y - 9} 212 ${y} L208 ${y + 6} Q180 ${y + 11} 152 ${y + 6} Z" fill="${c}" stroke="${shade(c, 0.6)}" stroke-width="1"${dash(level)}/><path d="M156 ${y + 1} Q180 ${y - 5} 204 ${y + 1}" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" fill="none"/><rect x="172" y="${y - 6}" width="16" height="7" rx="2" fill="${STEEL}" stroke="${STEEL_D}" stroke-width=".8"/>`;
  }).join('');
  return svg(360, 370, `<rect x="110" y="20" width="140" height="14" rx="2" fill="${STEEL}" stroke="${STEEL_D}"/><text x="180" y="14" text-anchor="middle" font-size="9" fill="#64748b">tower cross-arm</text>
    <rect x="172" y="34" width="16" height="22" rx="3" fill="${STEEL_D}"/><circle cx="180" cy="62" r="7" fill="${STEEL}" stroke="${STEEL_D}"/><line x1="180" y1="56" x2="180" y2="70" stroke="${STEEL_D}" stroke-width="3"/>
    <line x1="180" y1="70" x2="180" y2="316" stroke="${STEEL_D}" stroke-width="5"/>${discs}
    <path d="M160 324 L200 324 L192 342 L168 342 Z" fill="${STEEL}" stroke="${STEEL_D}"/><circle cx="180" cy="352" r="9" fill="none" stroke="${STEEL_D}" stroke-width="5"/><circle cx="180" cy="352" r="4" fill="${STEEL}"/>
    ${call(150, 120, 'cap-and-pin discs', level, 'L', -66)}${call(150, 200, 'string of 14 units', level, 'L', -66)}${call(198, 60, 'ball-and-socket end fitting', null, 'R')}${call(196, 336, 'yoke plate', null, 'R')}${call(190, 352, 'suspension clamp', null, 'R')}`, 'Insulator string coloured by condition');
}

function damper({ level }) {
  const c = col(level); const g = (x) => `<ellipse cx="${x}" cy="190" rx="26" ry="20" fill="url(#g1)" stroke="${shade(c, 0.6)}"${dash(level)}/><path d="M${x - 26} 190 L${x - 38} 190 M${x + 26} 190 L${x + 38} 190" stroke="${STEEL_D}" stroke-width="4"/>`;
  return svg(360, 280, `${defs(1, level)}<line x1="0" y1="120" x2="360" y2="120" stroke="${INK}" stroke-width="9" opacity=".8"/><line x1="0" y1="116" x2="360" y2="116" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
    <rect x="164" y="100" width="32" height="40" rx="5" fill="${STEEL}" stroke="${STEEL_D}" stroke-width="1.5"/><circle cx="172" cy="108" r="2.6" fill="${STEEL_D}"/><circle cx="188" cy="108" r="2.6" fill="${STEEL_D}"/><circle cx="172" cy="132" r="2.6" fill="${STEEL_D}"/><circle cx="188" cy="132" r="2.6" fill="${STEEL_D}"/>
    <path d="M180 140 Q150 170 98 190" stroke="${shade(c, 0.7)}" stroke-width="6" fill="none"${dash(level)}/><path d="M180 140 Q212 170 262 190" stroke="${shade(c, 0.7)}" stroke-width="6" fill="none"${dash(level)}/>
    ${g(76)}${g(286)}
    ${call(180, 100, 'clamp', null, 'R')}${call(130, 176, 'messenger cable', level, 'L', -66)}${call(286, 180, 'weight', level, 'R')}${call(40, 120, 'conductor', null, 'L', -66)}`, 'Stockbridge damper coloured by condition');
}

function conductor({ level }) {
  const c = col(level);
  const ring = (n, r, rad, fill) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx="${(100 + Math.cos(a) * r).toFixed(1)}" cy="${(110 + Math.sin(a) * r).toFixed(1)}" r="${rad}" fill="${fill}" stroke="${shade(fill, 0.6)}" stroke-width=".8"/>`; }).join('');
  const lay = Array.from({ length: 11 }, (_, i) => `<path d="M${200 + i * 14} 62 L${224 + i * 14} 158" stroke="${shade(c, i % 2 ? 0.78 : 1.05)}" stroke-width="9" stroke-linecap="round"${dash(level)}/>`).join('');
  const broken = level != null && level <= 2 ? `<path d="M246 96 Q262 78 284 70" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M246 96 Q262 78 284 70" stroke="#0f172a" stroke-width="1" fill="none" stroke-dasharray="2 3"/>` : '';
  return svg(360, 220, `<circle cx="100" cy="110" r="64" fill="#e2e8f0" stroke="${STEEL_D}"/>${ring(16, 50, 8, c)}${ring(10, 31, 8, c)}${ring(6, 15, 7.5, '#475569')}<circle cx="100" cy="110" r="7.5" fill="#475569"/>
    <clipPath id="cc"><rect x="196" y="60" width="150" height="100" rx="8"/></clipPath><g clip-path="url(#cc)"><rect x="196" y="60" width="150" height="100" fill="#e2e8f0"/>${lay}</g>${broken}<rect x="196" y="60" width="150" height="100" rx="8" fill="none" stroke="${STEEL_D}"/>
    <text x="100" y="196" text-anchor="middle" font-size="9.5" fill="#334155">cross-section · 26 aluminium + 7 steel strands</text><text x="271" y="196" text-anchor="middle" font-size="9.5" fill="#334155">side view · helical lay</text>
    ${call(150, 74, 'aluminium strands', level, 'R', 426)}${call(100, 110, 'steel core', null, 'L', -66)}`, 'Conductor strand construction coloured by condition');
}

function earthwire({ level }) {
  const c = col(level);
  const ring = (n, r, rad, fill) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<circle cx="${(100 + Math.cos(a) * r).toFixed(1)}" cy="${(210 + Math.sin(a) * r).toFixed(1)}" r="${rad}" fill="${fill}" stroke="${shade(fill, 0.6)}" stroke-width=".8"/>`; }).join('');
  return svg(360, 300, `<path d="M180 20 L168 120 L192 120 Z" fill="${STEEL}" stroke="${STEEL_D}"/><line x1="180" y1="120" x2="180" y2="170" stroke="${STEEL_D}" stroke-width="3"/><path d="M60 130 Q180 118 300 130" stroke="${INK}" stroke-width="6" fill="none"/><path d="M60 130 Q180 118 300 130" stroke="${c}" stroke-width="3" fill="none"${dash(level)}/>
    <rect x="170" y="118" width="20" height="14" rx="3" fill="${STEEL}" stroke="${STEEL_D}"/>
    <circle cx="100" cy="210" r="46" fill="#e2e8f0" stroke="${STEEL_D}"/>${ring(12, 33, 7, c)}<circle cx="100" cy="210" r="17" fill="#cbd5e1" stroke="${STEEL_D}"/>${Array.from({ length: 6 }, (_, i) => `<circle cx="${(100 + Math.cos(i * 1.047) * 8).toFixed(1)}" cy="${(210 + Math.sin(i * 1.047) * 8).toFixed(1)}" r="2.6" fill="#2f7de1"/>`).join('')}
    <text x="100" y="274" text-anchor="middle" font-size="9.5" fill="#334155">cross-section · optical core, 12 outer wires</text>
    ${call(180, 24, 'earth-wire peak', null, 'R')}${call(180, 125, 'suspension clamp', null, 'R')}${call(260, 128, 'earth wire / OPGW', level, 'R')}${call(133, 205, 'outer wires', level, 'R')}${call(100, 210, 'optical fibre unit', null, 'R', 426)}`, 'Earth wire coloured by condition');
}

function foundation({ level }) {
  const c = col(level);
  const erosion = level != null && level <= 3 ? `<path d="M196 150 Q214 160 200 176 Q220 186 204 200" stroke="#7c4a1d" stroke-width="3" fill="#7c4a1d" fill-opacity=".35"/>` : '';
  return svg(360, 310, `<rect x="0" y="120" width="360" height="190" fill="#d9c7a3"/><rect x="0" y="180" width="360" height="70" fill="#c3ae86"/><rect x="0" y="250" width="360" height="60" fill="#a8946d"/><line x1="0" y1="120" x2="360" y2="120" stroke="#5b8a3a" stroke-width="5"/><path d="M0 268 Q90 262 180 268 T360 266" stroke="#5aa0d6" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
    <rect x="60" y="215" width="240" height="46" rx="3" fill="${c}" stroke="${shade(c, 0.55)}" stroke-width="1.5"${dash(level)}/><rect x="146" y="96" width="68" height="124" rx="3" fill="${c}" stroke="${shade(c, 0.55)}" stroke-width="1.5"${dash(level)}/>
    ${[78, 104, 130, 230, 256, 282].map((x) => `<line x1="${x}" y1="222" x2="${x}" y2="254" stroke="#334155" stroke-width="2" opacity=".6"/>`).join('')}<line x1="66" y1="236" x2="294" y2="236" stroke="#334155" stroke-width="2" opacity=".6"/><line x1="66" y1="252" x2="294" y2="252" stroke="#334155" stroke-width="2" opacity=".6"/>
    <path d="M162 20 L162 110 M198 20 L198 110" stroke="${STEEL_D}" stroke-width="5"/><path d="M158 20 L202 20" stroke="${STEEL_D}" stroke-width="5"/>${[158, 202].map((x) => `<line x1="${x}" y1="110" x2="${x}" y2="206" stroke="#475569" stroke-width="3"/><rect x="${x - 6}" y="100" width="12" height="5" fill="#475569"/>`).join('')}${erosion}
    ${call(214, 150, 'chimney / stub', level, 'R')}${call(290, 238, 'concrete pad + rebar', level, 'R')}${call(160, 40, 'tower leg stub', null, 'L', -66)}${call(40, 120, 'ground level', null, 'L', -66)}${call(40, 268, 'water table', null, 'L', -66)}`, 'Tower foundation coloured by condition');
}

/* ----------------------------------------------------------------------------------- span / ROW */

function catenary(x1, x2, y, sag, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [x1 + (x2 - x1) * t, y + 4 * sag * t * (1 - t)]; });
}
const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
function towerSil(x, h, c = STEEL_D) {
  const top = 34; const base = 34 + h;
  return `<path d="M${x - 20} ${base} L${x - 6} ${top + 40} L${x - 4} ${top} L${x + 4} ${top} L${x + 6} ${top + 40} L${x + 20} ${base}" fill="none" stroke="${c}" stroke-width="2.4"/><path d="M${x - 16} ${top + 50} L${x + 16} ${top + 50} M${x - 11} ${top + 20} L${x + 11} ${top + 20}" stroke="${c}" stroke-width="1.6"/><path d="M${x - 34} ${top + 22} L${x + 34} ${top + 22}" stroke="${c}" stroke-width="2.6"/><path d="M${x - 26} ${top + 52} L${x + 26} ${top + 52}" stroke="${c}" stroke-width="2.6"/>`;
}

function span({ groups, span: sp }) {
  const lc = clampLevel(groups?.conductor); const la = clampLevel(groups?.conductor_accessories); const lk = clampLevel(groups?.right_of_way ?? groups?.clearance);
  const len = sp?.lengthM; const clr = sp?.clearanceM; const lim = sp?.limitM ?? 7;
  const a = 70; const b = 290; const ph = [[62, 0], [92, 5], [122, 10]];
  const lines = ph.map(([y, dy]) => `<polyline points="${poly(catenary(a + 18, b - 18, y, 70 - dy * 0.4))}" fill="none" stroke="#111827" stroke-width="3.2"/><polyline points="${poly(catenary(a + 18, b - 18, y, 70 - dy * 0.4))}" fill="none" stroke="${col(lc)}" stroke-width="1.6"${dash(lc)}/>`).join('');
  const ew = `<polyline points="${poly(catenary(a, b, 38, 52))}" fill="none" stroke="${STEEL_D}" stroke-width="2"/>`;
  const dampers = [[a + 52, 62, 0.14], [b - 52, 62, 0.86]].map(([x, y, t]) => { const yy = y + 4 * 70 * t * (1 - t) - 4 * 0; return `<g transform="translate(${x} ${yy.toFixed(1)})"><line x1="-7" y1="0" x2="7" y2="0" stroke="${col(la)}" stroke-width="3"/><path d="M-5 0 Q0 10 -12 12 M5 0 Q0 10 12 12" stroke="${col(la)}" stroke-width="2" fill="none"/><circle cx="-13" cy="12" r="3.4" fill="${col(la)}" stroke="${INK}" stroke-width=".7"/><circle cx="13" cy="12" r="3.4" fill="${col(la)}" stroke="${INK}" stroke-width=".7"/></g>`; }).join('');
  const lowY = 122 + 4 * (70 - 4) * 0.25;
  const trees = [150, 178, 206].map((x, i) => `<g transform="translate(${x} ${270 - i * 2})"><rect x="-1.5" y="0" width="3" height="14" fill="#6b4423"/><ellipse cx="0" cy="-8" rx="${10 + i * 2}" ry="${15 + i * 3}" fill="${col(lk)}" opacity=".9"/></g>`).join('');
  return svg(360, 330, `<rect x="0" y="284" width="360" height="46" fill="#d9c7a3"/><path d="M0 284 Q90 280 180 284 T360 282" stroke="#5b8a3a" stroke-width="4" fill="none"/>${towerSil(a, 240)}${towerSil(b, 240)}${ew}${lines}${dampers}${trees}
    <line x1="178" y1="${lowY.toFixed(0)}" x2="178" y2="248" stroke="#e5484d" stroke-width="1.4" stroke-dasharray="3 3"/><path d="M174 ${(lowY + 8).toFixed(0)} L178 ${lowY.toFixed(0)} L182 ${(lowY + 8).toFixed(0)} M174 240 L178 248 L182 240" stroke="#e5484d" fill="none" stroke-width="1.4"/>
    <text x="186" y="${((lowY + 248) / 2).toFixed(0)}" font-size="9.5" fill="#b91c1c" font-weight="700">${clr != null ? `${clr} m` : 'clearance'}</text><text x="186" y="${((lowY + 248) / 2 + 11).toFixed(0)}" font-size="8.5" fill="#64748b">limit ${lim} m</text>
    <line x1="${a}" y1="318" x2="${b}" y2="318" stroke="#94a3b8"/><text x="180" y="327" text-anchor="middle" font-size="9" fill="#64748b">${len != null ? `${Math.round(len)} m span` : 'span'}</text>
    ${call(110, 76, 'phase conductors', lc, 'L', -66)}${call(a + 52, 74, 'vibration dampers', la, 'R', 426)}${call(206, 250, 'right-of-way clearance', lk, 'R', 426)}${call(a, 36, 'earth wire', null, 'L', -66)}`, 'Span: conductors, dampers and ground clearance coloured by condition');
}

function corridor({ level, span: sp }) {
  const lk = clampLevel(level); const clr = sp?.clearanceM; const lim = sp?.limitM ?? 7;
  const trees = [70, 110, 150, 210, 250, 290].map((x, i) => `<g transform="translate(${x} ${262 + (i % 2) * 3})"><rect x="-2" y="0" width="4" height="${18 - (i % 2) * 3}" fill="#6b4423"/><ellipse cx="0" cy="-10" rx="${12 + (i % 3) * 3}" ry="${20 + (i % 3) * 4}" fill="${i === 3 ? col(lk) : '#4f9d5f'}" opacity=".92" stroke="${i === 3 ? shade(col(lk), 0.6) : 'none'}"/></g>`).join('');
  return svg(360, 300, `<rect x="0" y="282" width="360" height="18" fill="#d9c7a3"/><path d="M0 282 Q180 276 360 282" stroke="#5b8a3a" stroke-width="4" fill="none"/>
    <rect x="96" y="282" width="168" height="4" fill="#f0a020" opacity=".7"/><text x="180" y="296" text-anchor="middle" font-size="9" fill="#92400e">right-of-way, cleared strip</text>${trees}
    <polyline points="${poly(catenary(20, 340, 70, 80))}" fill="none" stroke="#111827" stroke-width="3.2"/><polyline points="${poly(catenary(20, 340, 84, 80))}" fill="none" stroke="#111827" stroke-width="3.2"/><polyline points="${poly(catenary(20, 340, 98, 80))}" fill="none" stroke="#111827" stroke-width="3.2"/>
    <line x1="180" y1="170" x2="180" y2="222" stroke="#e5484d" stroke-width="1.4" stroke-dasharray="3 3"/><path d="M176 178 L180 170 L184 178 M176 214 L180 222 L184 214" stroke="#e5484d" fill="none" stroke-width="1.4"/><text x="188" y="200" font-size="10" fill="#b91c1c" font-weight="700">${clr != null ? `${clr} m` : 'clearance'}</text><text x="188" y="212" font-size="8.5" fill="#64748b">limit ${lim} m</text>
    ${call(210, 244, 'vegetation under the line', lk, 'R', 426)}${call(80, 74, 'conductors', null, 'L', -66)}${call(120, 286, 'corridor strip', null, 'L', -66)}`, 'Right-of-way corridor segment coloured by condition');
}

/* ------------------------------------------------------------------------------------ line */

function line({ line: ln, name }) {
  const units = ln?.units ?? []; const towers = units.filter((u) => u.kind === 'tower'); const spans = units.filter((u) => u.kind === 'span');
  const n = Math.min(towers.length, 12); if (!n) return null;
  const step = towers.length / n; const pick = Array.from({ length: n }, (_, i) => towers[Math.min(towers.length - 1, Math.floor(i * step))]);
  const bandCol = (b) => ({ poor: '#dc2626', moderate: '#d97706', normal: '#16a34a' }[b] || NA);
  const xs = pick.map((_, i) => 24 + (i * 312) / (n - 1 || 1));
  const wires = xs.slice(0, -1).map((x, i) => { const sb = spans[Math.floor((i / Math.max(1, n - 1)) * spans.length)]?.band; const c = bandCol(sb); return [62, 76].map((y) => `<polyline points="${poly(catenary(x + 5, xs[i + 1] - 5, y, 22))}" fill="none" stroke="${c}" stroke-width="2.2"/>`).join(''); }).join('');
  const tw = pick.map((t, i) => `<g>${towerSil(xs[i], 90, bandCol(t.band))}</g>`).join('');
  const cnt = ln?.counts ?? {};
  return svg(360, 200, `<rect x="0" y="146" width="360" height="54" fill="#e7ddc4"/><path d="M0 146 Q90 142 180 146 T360 146" stroke="#5b8a3a" stroke-width="4" fill="none"/>${wires}${tw}
    <text x="180" y="170" text-anchor="middle" font-size="10" fill="#334155" font-weight="700">${esc(name)}</text><text x="180" y="184" text-anchor="middle" font-size="9" fill="#64748b">${towers.length} towers · ${spans.length} spans · ${cnt.poor ?? 0} poor · ${cnt.moderate ?? 0} moderate · ${cnt.normal ?? 0} normal</text>`, 'Line: towers and spans coloured by health band');
}

/* ------------------------------------------------------------------------- transformer family */

function bushing(x, y, h, c, level, w = 11) {
  const sheds = Array.from({ length: Math.floor(h / 9) }, (_, i) => `<ellipse cx="${x}" cy="${y + 14 + i * 9}" rx="${w + 5}" ry="3.2" fill="${c}" stroke="${shade(c, 0.6)}" stroke-width=".7"${dash(level)}/>`).join('');
  return `<rect x="${x - w + 3}" y="${y}" width="${(w - 3) * 2}" height="${h}" rx="3" fill="${c}" stroke="${shade(c, 0.6)}" stroke-width=".9"${dash(level)}/>${sheds}<rect x="${x - 3}" y="${y - 12}" width="6" height="12" fill="${STEEL}" stroke="${STEEL_D}" stroke-width=".8"/><circle cx="${x}" cy="${y - 14}" r="4" fill="${STEEL}" stroke="${STEEL_D}"/><rect x="${x - w - 2}" y="${y + h}" width="${(w + 2) * 2}" height="6" fill="${STEEL}" stroke="${STEEL_D}"/>`;
}

function transformer({ inputs, parts, name }) {
  const L = { dga: fromScore(inputs?.dga), oil: fromScore(inputs?.oil), tests: fromScore(inputs?.tests), visual: fromScore(inputs?.visual), age: fromScore(inputs?.age) };
  const part = (k, fallback) => (parts && parts[k] != null ? parts[k] : fallback);
  const lTank = L.dga; const lOil = L.oil; const lBsh = part('bushing', null) ?? L.tests; const lCool = part('cooling', null) ?? L.visual; const lOltc = part('tap_changer', null) ?? L.visual;
  const tank = col(lTank); const oil = col(lOil); const fins = Array.from({ length: 14 }, (_, i) => `<rect x="${252 + i * 7}" y="146" width="5" height="124" rx="1.5" fill="${col(lCool)}" stroke="${shade(col(lCool), 0.6)}" stroke-width=".6"${dash(lCool)}/>`).join('');
  const fans = [262, 296, 330].map((x) => `<circle cx="${x}" cy="296" r="11" fill="#e2e8f0" stroke="${STEEL_D}"/><path d="M${x} 296 m0 -8 l3 8 l-3 8 l-3 -8 z M${x} 296 m-8 0 l8 3 l8 -3 l-8 -3 z" fill="${col(lCool)}" opacity=".85"/>`).join('');
  const ribs = Array.from({ length: 8 }, (_, i) => `<line x1="${86 + i * 22}" y1="150" x2="${86 + i * 22}" y2="268" stroke="${shade(tank, 0.7)}" stroke-width="1.4" opacity=".55"/>`).join('');
  return svg(360, 340, `${defs(2, lTank)}<rect x="0" y="312" width="360" height="28" fill="#cbd5e1"/><rect x="62" y="270" width="176" height="10" fill="#94a3b8" stroke="${STEEL_D}"/><rect x="70" y="280" width="40" height="32" fill="#64748b"/><rect x="190" y="280" width="40" height="32" fill="#64748b"/>
    <rect x="62" y="146" width="176" height="124" rx="6" fill="url(#g2)" stroke="${shade(tank, 0.55)}" stroke-width="1.6"${dash(lTank)}/>${ribs}<rect x="60" y="140" width="180" height="10" rx="3" fill="${shade(tank, 0.85)}" stroke="${shade(tank, 0.55)}"/>
    <rect x="86" y="196" width="40" height="26" rx="3" fill="#f1f5f9" stroke="${STEEL_D}" stroke-width=".9"/><text x="106" y="210" text-anchor="middle" font-size="6.5" fill="#475569">RATING</text><text x="106" y="218" text-anchor="middle" font-size="6.5" fill="#475569">PLATE</text>
    <rect x="22" y="170" width="38" height="70" rx="4" fill="${col(lOltc)}" stroke="${shade(col(lOltc), 0.55)}"${dash(lOltc)}/><rect x="28" y="178" width="26" height="22" rx="2" fill="#e2e8f0" stroke="${STEEL_D}" stroke-width=".8"/><circle cx="41" cy="220" r="6" fill="#e2e8f0" stroke="${STEEL_D}"/>
    <rect x="238" y="156" width="14" height="6" fill="${STEEL}"/><rect x="238" y="252" width="14" height="6" fill="${STEEL}"/>${fins}<rect x="250" y="140" width="102" height="8" rx="2" fill="${STEEL}"/><rect x="250" y="268" width="102" height="8" rx="2" fill="${STEEL}"/>${fans}
    ${bushing(98, 58, 82, col(lBsh), lBsh)}${bushing(130, 58, 82, col(lBsh), lBsh)}${bushing(162, 58, 82, col(lBsh), lBsh)}${bushing(206, 92, 48, col(lBsh), lBsh, 9)}
    <path d="M92 60 L170 60" stroke="#334155" stroke-width="1.2" opacity=".5"/>
    <rect x="188" y="76" width="140" height="28" rx="14" fill="${oil}" stroke="${shade(oil, 0.55)}" stroke-width="1.4"${dash(lOil)}/><path d="M210 104 L210 146" stroke="${STEEL_D}" stroke-width="6"/><rect x="204" y="118" width="12" height="14" rx="3" fill="#e2e8f0" stroke="${STEEL_D}"/><circle cx="310" cy="90" r="8" fill="#f8fafc" stroke="${STEEL_D}"/><path d="M310 90 L314 85" stroke="#dc2626" stroke-width="1.4"/><rect x="326" y="104" width="14" height="22" rx="4" fill="#fde68a" stroke="${STEEL_D}"/><line x1="333" y1="104" x2="333" y2="96" stroke="${STEEL_D}" stroke-width="3"/>
    ${call(100, 70, 'HV / LV bushings', lBsh, 'L', -66)}${call(250, 90, 'conservator + oil', lOil, 'R', 426)}${call(150, 250, 'tank and windings (DGA)', lTank, 'L', -66)}${call(310, 200, 'radiators', lCool, 'R', 426)}${call(41, 190, 'tap changer', lOltc, 'L', -66)}${call(330, 296, 'cooling fans', lCool, 'R', 426)}
    <text x="150" y="330" text-anchor="middle" font-size="9.5" fill="#334155" font-weight="700">${esc(name)}</text>`, 'Power transformer coloured by condition');
}

function bushingPart({ level }) {
  const c = col(level);
  const sheds = Array.from({ length: 12 }, (_, i) => `<ellipse cx="180" cy="${86 + i * 16}" rx="34" ry="6" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/><ellipse cx="180" cy="${90 + i * 16}" rx="22" ry="3" fill="${shade(c, 0.7)}"/>`).join('');
  return svg(360, 320, `<rect x="170" y="26" width="20" height="24" rx="3" fill="${STEEL}" stroke="${STEEL_D}"/><circle cx="180" cy="20" r="8" fill="${STEEL}" stroke="${STEEL_D}"/><rect x="164" y="50" width="32" height="26" rx="3" fill="${STEEL_D}"/><rect x="166" y="70" width="28" height="140" fill="${shade(c, 0.9)}" stroke="${shade(c, 0.55)}"${dash(level)}/>${sheds}
    <rect x="132" y="272" width="96" height="14" fill="${STEEL}" stroke="${STEEL_D}"/><rect x="146" y="286" width="68" height="22" fill="#64748b"/><circle cx="262" cy="214" r="16" fill="#f8fafc" stroke="${STEEL_D}"/><path d="M262 214 L268 206" stroke="#dc2626" stroke-width="1.6"/><line x1="228" y1="214" x2="246" y2="214" stroke="${STEEL_D}" stroke-width="3"/>
    ${call(214, 140, 'porcelain / composite body', level, 'R', 426)}${call(180, 20, 'terminal', null, 'L', -66)}${call(132, 278, 'mounting flange', null, 'L', -66)}${call(262, 214, 'oil-level gauge', null, 'R', 426)}`, 'Transformer bushing coloured by condition');
}

function tapChanger({ level }) {
  const c = col(level);
  const contacts = Array.from({ length: 9 }, (_, i) => `<circle cx="${156 + (i % 3) * 24}" cy="${136 + Math.floor(i / 3) * 28}" r="6" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/>`).join('');
  return svg(360, 320, `<rect x="90" y="60" width="180" height="190" rx="8" fill="#e2e8f0" stroke="${STEEL_D}" stroke-width="2"/><rect x="104" y="74" width="152" height="162" rx="5" fill="#f8fafc" stroke="${STEEL_D}"/>
    <rect x="132" y="108" width="96" height="110" rx="6" fill="#fef3c7" stroke="${STEEL_D}" opacity=".9"/>${contacts}<path d="M144 124 Q180 100 216 124" stroke="${STEEL_D}" stroke-width="3" fill="none"/><line x1="180" y1="100" x2="180" y2="60" stroke="${STEEL_D}" stroke-width="3"/>
    <rect x="124" y="262" width="112" height="34" rx="6" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/><circle cx="150" cy="279" r="9" fill="#e2e8f0" stroke="${STEEL_D}"/><rect x="170" y="272" width="54" height="14" rx="2" fill="#f1f5f9" stroke="${STEEL_D}" stroke-width=".8"/><text x="197" y="282" text-anchor="middle" font-size="7.5" fill="#334155">17 positions</text>
    ${call(216, 150, 'selector / diverter contacts', level, 'R', 426)}${call(236, 279, 'motor drive', level, 'R', 426)}${call(90, 150, 'oil compartment', null, 'L', -66)}`, 'On-load tap changer coloured by condition');
}

function cooling({ level }) {
  const c = col(level);
  const fins = Array.from({ length: 16 }, (_, i) => `<rect x="${70 + i * 14}" y="76" width="9" height="150" rx="2" fill="${c}" stroke="${shade(c, 0.55)}" stroke-width=".8"${dash(level)}/>`).join('');
  const fan = (x) => `<circle cx="${x}" cy="262" r="26" fill="#e2e8f0" stroke="${STEEL_D}" stroke-width="2"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${x} 262 L${(x + Math.cos(i * 1.2566) * 21).toFixed(1)} ${(262 + Math.sin(i * 1.2566) * 21).toFixed(1)}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`).join('')}<circle cx="${x}" cy="262" r="4" fill="${STEEL_D}"/>`;
  return svg(360, 320, `<rect x="56" y="60" width="248" height="14" rx="3" fill="${STEEL}" stroke="${STEEL_D}"/><rect x="56" y="228" width="248" height="14" rx="3" fill="${STEEL}" stroke="${STEEL_D}"/>${fins}${fan(110)}${fan(250)}
    <rect x="20" y="104" width="38" height="14" fill="${STEEL}"/><rect x="20" y="196" width="38" height="14" fill="${STEEL}"/>
    ${call(180, 150, 'radiator fins', level, 'R', 426)}${call(250, 262, 'cooling fans (ONAF)', level, 'R', 426)}${call(58, 110, 'oil header', null, 'L', -66)}`, 'Transformer cooling coloured by condition');
}

function tankOil({ level }) {
  const c = col(level);
  return svg(360, 320, `${defs(3, level)}<rect x="60" y="120" width="240" height="150" rx="8" fill="url(#g3)" stroke="${shade(c, 0.55)}" stroke-width="1.6"${dash(level)}/><rect x="70" y="166" width="220" height="94" rx="4" fill="#fde68a" opacity=".75"/><path d="M70 166 Q130 160 180 166 T290 166" stroke="#b45309" stroke-width="1.5" fill="none"/>
    <rect x="130" y="60" width="100" height="40" rx="20" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/><rect x="170" y="100" width="20" height="20" fill="${STEEL_D}"/><rect x="152" y="104" width="22" height="14" rx="3" fill="#e2e8f0" stroke="${STEEL_D}"/>
    <circle cx="318" cy="150" r="14" fill="#f8fafc" stroke="${STEEL_D}"/><path d="M318 150 L324 142" stroke="#dc2626" stroke-width="1.6"/><rect x="302" y="232" width="20" height="18" fill="${STEEL_D}"/><path d="M302 241 L290 241" stroke="${STEEL_D}" stroke-width="4"/>
    ${call(180, 80, 'conservator', level, 'R', 426)}${call(120, 215, 'insulating oil', level, 'L', -66)}${call(163, 111, 'Buchholz relay', null, 'L', -66)}${call(318, 150, 'oil-level gauge', null, 'R', 426)}${call(312, 241, 'drain valve', null, 'R', 426)}`, 'Transformer tank and oil coloured by condition');
}

/* ----------------------------------------------------------------------- substation / bay */

function bay({ level }) {
  const c = col(level);
  const sw = (x, y, label) => `<rect x="${x - 9}" y="${y}" width="18" height="30" rx="3" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/><text x="${x}" y="${y + 44}" text-anchor="middle" font-size="8" fill="#475569">${label}</text>`;
  return svg(360, 320, `<line x1="30" y1="50" x2="330" y2="50" stroke="#111827" stroke-width="6"/><text x="326" y="42" text-anchor="end" font-size="9" fill="#64748b">busbar</text>
    <line x1="180" y1="50" x2="180" y2="270" stroke="#111827" stroke-width="3"/>${sw(180, 70, 'disconnector')}${sw(180, 128, 'circuit breaker')}<circle cx="180" cy="196" r="11" fill="none" stroke="${c}" stroke-width="3"/><circle cx="180" cy="196" r="5" fill="${c}"/><text x="180" y="222" text-anchor="middle" font-size="8" fill="#475569">current transformer</text>
    <path d="M180 240 L180 270" stroke="#111827" stroke-width="3"/><path d="M166 270 L194 270 L180 290 Z" fill="${STEEL}" stroke="${STEEL_D}"/><text x="180" y="306" text-anchor="middle" font-size="8" fill="#475569">line outlet</text>
    <line x1="180" y1="170" x2="250" y2="170" stroke="#111827" stroke-width="2"/><circle cx="262" cy="170" r="10" fill="none" stroke="${c}" stroke-width="3"/><circle cx="262" cy="170" r="4" fill="${c}"/><text x="262" y="194" text-anchor="middle" font-size="8" fill="#475569">voltage transformer</text>
    ${call(189, 84, 'switchgear', level, 'R', 426)}${call(189, 142, 'circuit breaker', level, 'L', -66)}`, 'Substation bay coloured by condition');
}

function substation({ level, name }) {
  const c = col(level);
  const trf = (x) => `<rect x="${x - 22}" y="150" width="44" height="40" rx="5" fill="${c}" stroke="${shade(c, 0.55)}"${dash(level)}/><circle cx="${x - 6}" cy="170" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="${x + 6}" cy="170" r="9" fill="none" stroke="#fff" stroke-width="2"/>`;
  const baysR = [60, 120, 180, 240, 300].map((x) => `<line x1="${x}" y1="70" x2="${x}" y2="108" stroke="#111827" stroke-width="2"/><rect x="${x - 7}" y="80" width="14" height="18" rx="2" fill="${c}" opacity=".85"${dash(level)}/>`).join('');
  return svg(360, 300, `<rect x="14" y="20" width="332" height="268" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-dasharray="6 4"/><text x="24" y="38" font-size="9" fill="#64748b">${esc(name)} · switchyard</text>
    <line x1="30" y1="68" x2="330" y2="68" stroke="#111827" stroke-width="6"/>${baysR}<line x1="30" y1="214" x2="330" y2="214" stroke="#111827" stroke-width="5"/>${[90, 180, 270].map((x) => `<line x1="${x}" y1="108" x2="${x}" y2="150" stroke="#111827" stroke-width="2"/><line x1="${x}" y1="190" x2="${x}" y2="214" stroke="#111827" stroke-width="2"/>${trf(x)}`).join('')}
    ${call(300, 90, 'line bays', level, 'R', 426)}${call(270, 170, 'transformers', level, 'R', 426)}${call(40, 68, 'high-voltage busbar', null, 'L', -66)}${call(40, 214, 'low-voltage busbar', null, 'L', -66)}`, 'Substation coloured by condition');
}

/* -------------------------------------------------------------------------------- dispatch */

const BUILD = {
  span: { f: span, title: 'Span and components', key: 'groups', note: 'The conductors, the dampers and the ground clearance each take the colour of their scoring group (the worst component in the group).' },
  span_corridor_segment: { f: corridor, title: 'Right-of-way corridor', key: 'level', note: 'The vegetation under the line takes the condition of the corridor segment; the dimension is its measured clearance against the limit.' },
  line: { f: line, title: 'Line overview', key: 'bands', note: 'Towers and spans are coloured by health band: green normal, amber moderate, red poor, grey not assessed.' },
  power_transformer: { f: transformer, title: 'Transformer and components', key: 'inputs', note: 'Each part takes the colour of the evidence that describes it: gas analysis for the tank and windings, oil tests for the conservator, electrical tests for the bushings, visual findings for the cooling.' },
  bushing: { f: bushingPart, title: 'Bushing', key: 'level', note: 'The bushing takes the worst condition of its open findings (hot spot, cracked porcelain, oil leak).' },
  tap_changer: { f: tapChanger, title: 'On-load tap changer', key: 'level', note: 'The contacts and the drive take the worst condition of their open findings.' },
  cooling: { f: cooling, title: 'Cooling system', key: 'level', note: 'The radiators and fans take the worst condition of their open findings (corrosion, leaks).' },
  tank_oil: { f: tankOil, title: 'Tank and oil', key: 'level', note: 'The tank, conservator and oil take the worst condition of their open findings (oil leak, tank damage).' },
  insulator_string: { f: insulatorString, title: 'Insulator string', key: 'level', note: 'The string takes the worst condition of its open findings (cracked disc, contamination, flashover mark, missing disc).' },
  damper: { f: damper, title: 'Vibration damper', key: 'level', note: 'The damper takes the worst condition of its open findings (displaced or damaged damper).' },
  conductor: { f: conductor, title: 'Conductor', key: 'level', note: 'The aluminium strands take the worst condition of the open findings on the conductor (broken strand, corrosion, sag).' },
  earthwire: { f: earthwire, title: 'Earth wire', key: 'level', note: 'The earth wire takes the worst condition of its open findings (damaged earth wire).' },
  foundation: { f: foundation, title: 'Foundation', key: 'level', note: 'The concrete takes the worst condition of the open findings (cracking, erosion around the chimney).' },
  bay: { f: bay, title: 'Bay', key: 'level', note: 'The bay equipment takes the worst condition of its open findings.' },
  substation: { f: substation, title: 'Substation', key: 'level', note: 'The yard equipment takes the worst condition of the open findings in the substation.' },
};

/** @returns {{title: string, svg: string, key: 'levels'|'bands', note: string, levelWords: boolean}|null} */
export function assetVisual(input) {
  const b = BUILD[input?.classId];
  if (!b) return null;
  const out = b.f({ ...input, level: clampLevel(input.level), groups: input.groups });
  if (!out) return null;
  return { title: b.title, svg: out, key: b.key === 'bands' ? 'bands' : 'levels', note: b.note };
}

export const hasAssetVisual = (classId) => classId in BUILD;
export const VISUAL_CLASSES = Object.keys(BUILD);
export { word as conditionWord };
