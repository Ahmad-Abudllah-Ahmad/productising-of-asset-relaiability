// Schematic symbol library for the HMI viewer (createHmi in console.js).
// Electrical symbols follow IEC 60617 / IEC 81346 designations (Q0 circuit-breaker, Q1/Q2 busbar disconnectors,
// Q9 line disconnector, Q8 earthing switch, T1 transformer, BI current transformer, BU voltage transformer).
// Process symbols follow ISA-5.1 (instrument bubbles: TT temperature transmitter, PT pressure, LT level, FT flow,
// AT analyser; letters per ISA-5.1 table 1). Colours follow ISA-101: grey equipment, colour for voltage level and
// abnormal state only.
//
// Every function returns an SVG string. Clickable equipment is wrapped in <g class="sx-hit" data-eq="ID">;
// operable devices carry data-sw="ID" (state is held by the HMI: 'closed' = conducting path).
// Live values bind through data-live / data-live-flow / data-live-lvl / data-live-run (see live in console.js).

import { esc, KV_COLOR } from './console.js';

export const kvColor = (kv) => KV_COLOR[kv] || '#94a3b8';
const n = (v) => Number(v).toFixed(1);
const netAttr = (net) => (net ? ` data-net="${esc(net)}"` : '');

function hit(id, x, y, w, h, inner, extra = '') {
  if (!id) return `<g${extra}>${inner}</g>`;
  return `<g class="sx-hit" data-eq="${esc(id)}"${extra}><rect class="sx-halo" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6"/>${inner}</g>`;
}

/* ------------------------------------------------------------- generic */
export const text = (x, y, s, { cls = 'sx-t', anchor = 'start', live, size, color, weight } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}"${live ? ` data-live="${esc(live)}"` : ''}${size || color || weight ? ` style="${size ? `font-size:${size}px;` : ''}${color ? `fill:${color};` : ''}${weight ? `font-weight:${weight};` : ''}"` : ''}>${esc(s)}</text>`;

/** A title block, sheet border and zone markers so every display reads like a controlled drawing. */
export function frame(W, H, { title, dno, rev = 'C', sheet = '1 of 1', date = '2026-11-11', by = 'NXS', chk = 'PE', note = 'For operations. Not for construction.' } = {}) {
  const tbw = 400; const tbh = 78; const x = W - tbw - 14; const y = H - tbh - 14;
  return `<g opacity=".95"><rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#1f2a3a" stroke-width="1"/>
  <rect x="${x}" y="${y}" width="${tbw}" height="${tbh}" fill="#0b1119" stroke="#263244"/>
  <line x1="${x}" y1="${y + 26}" x2="${x + tbw}" y2="${y + 26}" stroke="#263244"/><line x1="${x}" y1="${y + 50}" x2="${x + tbw}" y2="${y + 50}" stroke="#263244"/>
  <line x1="${x + 240}" y1="${y + 26}" x2="${x + 240}" y2="${y + 50}" stroke="#263244"/><line x1="${x + 310}" y1="${y + 26}" x2="${x + 310}" y2="${y + 50}" stroke="#263244"/>
  ${text(x + 10, y + 17, title || '', { cls: 'sx-tb' })}
  ${text(x + 10, y + 36, 'DRAWING NO.', { cls: 'sx-ts' })}${text(x + 10, y + 46, dno || '', { cls: 'sx-ts', color: '#cbd5e1' })}
  ${text(x + 248, y + 36, 'REV', { cls: 'sx-ts' })}${text(x + 248, y + 46, rev, { cls: 'sx-ts', color: '#cbd5e1' })}
  ${text(x + 318, y + 36, 'SHEET', { cls: 'sx-ts' })}${text(x + 318, y + 46, sheet, { cls: 'sx-ts', color: '#cbd5e1' })}
  ${text(x + 10, y + 62, `DATE ${date} · BY ${by} · CHK ${chk} · SYMBOLS IEC 60617 / ISA-5.1`, { cls: 'sx-ts' })}${text(x + 10, y + 73, note.length > 72 ? `${note.slice(0, 71)}…` : note, { cls: 'sx-ts', color: '#94a3b8' })}</g>`;
}

/** Data block: a small boxed readout. rows: [[label, tag, unit]] */
export function readout(x, y, rows, { title, w = 128, id, accent } = {}) {
  const h = (title ? 18 : 6) + rows.length * 15 + 4;
  const body = `<rect class="sx-box" x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="3"${accent ? ` style="stroke:${accent}"` : ''}/>${title ? text(x + 7, y + 13, title, { cls: 'sx-tb', size: 10.5 }) : ''}${rows.map(([l, tag, unit], i) => {
    const yy = y + (title ? 30 : 17) + i * 15;
    return `${text(x + 7, yy, l, { cls: 'sx-ts' })}<text x="${n(x + w - 7 - (unit ? 26 : 0))}" y="${n(yy)}" class="sx-v" text-anchor="end" data-live="${esc(tag)}">—</text>${unit ? text(x + w - 7, yy, unit, { cls: 'sx-ts', anchor: 'end' }) : ''}`;
  }).join('')}`;
  return id ? hit(id, x - 3, y - 3, w + 6, h + 6, body) : body;
}

/* ------------------------------------------------------------- electrical (IEC 60617) */
/** Conductor. points: [[x,y],...]. flow: tag for animated power flow (sign = direction). */
export function wire(points, { kv, net, flow, ref, color, width } = {}) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join(' ');
  const c = color || kvColor(kv);
  return `<path class="sx-wire" d="${d}" style="stroke:${c}${width ? `;stroke-width:${width}` : ''}"${netAttr(net)}/>${flow ? `<path class="sx-flow" d="${d}" style="stroke:#e2f3ff" data-live-flow="${esc(flow)}"${ref ? ` data-ref="${ref}"` : ''}${netAttr(net)}/>` : ''}`;
}
export function bus(x1, x2, y, { kv, net, label, sub, id, tags } = {}) {
  const c = kvColor(kv);
  const body = `<line class="sx-bus" x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" style="stroke:${c}"${netAttr(net)}/>${label ? text(x1, y - 10, label, { cls: 'sx-tb' }) : ''}${sub ? text(x1, y + 18, sub, { cls: 'sx-ts' }) : ''}${tags ? tags.map(([l, tag, u], i) => { const bx = x2 - 92 * tags.length + i * 92; return `${text(bx, y - 10, l, { cls: 'sx-ts' })}<text x="${n(bx + 60)}" y="${n(y - 10)}" class="sx-v" text-anchor="end" data-live="${esc(tag)}">—</text>${text(bx + 64, y - 10, u || '', { cls: 'sx-ts' })}`; }).join('') : ''}`;
  return id ? hit(id, x1 - 4, y - 24, x2 - x1 + 8, 34, body) : body;
}
/** Circuit-breaker (IEC: square). Terminals at y-14 / y+14. */
export function cb(x, y, id, { net, label, kv } = {}) {
  const c = kvColor(kv);
  const inner = `<line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y - 9}" style="stroke:${c}" stroke-width="3"${netAttr(net)} class="sx-wire"/><line x1="${x}" y1="${y + 9}" x2="${x}" y2="${y + 14}" style="stroke:${c}" stroke-width="3"${netAttr(net)} class="sx-wire"/><g data-sw="${esc(id)}"><rect class="sx-cb" x="${x - 9}" y="${y - 9}" width="18" height="18" rx="2"/></g>${label ? text(x + 14, y + 4, label, { cls: 'sx-ts' }) : ''}`;
  return hit(id, x - 13, y - 14, 60, 28, inner);
}
/** Disconnector (isolator). Pivot at the bottom terminal; blade swings open. Terminals y-14 / y+14. */
export function ds(x, y, id, { net, label, kv, horizontal } = {}) {
  const c = kvColor(kv);
  if (horizontal) {
    const inner = `<g data-sw="${esc(id)}"><line x1="${x + 12}" y1="${y - 6}" x2="${x + 12}" y2="${y + 6}" stroke="#cbd5e1" stroke-width="2"/><line class="sx-dis-blade" data-px="${x - 12}" data-py="${y}" data-open="32" x1="${x - 12}" y1="${y}" x2="${x + 12}" y2="${y}" stroke="#cbd5e1"/><circle cx="${x - 12}" cy="${y}" r="2.4" fill="#cbd5e1"/></g>${label ? text(x - 10, y - 10, label, { cls: 'sx-ts' }) : ''}`;
    return hit(id, x - 16, y - 14, 32, 28, inner);
  }
  const inner = `<g data-sw="${esc(id)}"><line x1="${x - 6}" y1="${y - 12}" x2="${x + 6}" y2="${y - 12}" stroke="#cbd5e1" stroke-width="2"/><line class="sx-dis-blade" data-px="${x}" data-py="${y + 12}" x1="${x}" y1="${y + 12}" x2="${x}" y2="${y - 12}" stroke="#cbd5e1"/><circle cx="${x}" cy="${y + 12}" r="2.4" fill="#cbd5e1"/></g>${label ? text(x + 10, y + 4, label, { cls: 'sx-ts' }) : ''}${netAttr(net) && c ? '' : ''}`;
  return hit(id, x - 10, y - 16, 44, 32, inner);
}
/** Earthing switch, drawn to the side of a conductor at (x,y). dir: -1 left, 1 right. */
export function es(x, y, id, { dir = 1, label } = {}) {
  const x2 = x + dir * 30;
  const inner = `<line x1="${x}" y1="${y}" x2="${x + dir * 8}" y2="${y}" stroke="#64748b" stroke-width="1.6"/><g data-sw="${esc(id)}"><line class="sx-dis-blade sx-earth" data-px="${x + dir * 26}" data-py="${y}" data-open="${dir * 30}" x1="${x + dir * 26}" y1="${y}" x2="${x + dir * 8}" y2="${y}"/></g>${earth(x + dir * 30, y)}${label ? text(x2 + dir * 4, y - 8, label, { cls: 'sx-ts', anchor: dir > 0 ? 'start' : 'end' }) : ''}`;
  return hit(id, Math.min(x, x2) - 6, y - 14, 42, 34, inner);
}
export function earth(x, y) { return `<g stroke="#64748b" stroke-width="1.6"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 8}"/><line x1="${x - 8}" y1="${y + 8}" x2="${x + 8}" y2="${y + 8}"/><line x1="${x - 5}" y1="${y + 12}" x2="${x + 5}" y2="${y + 12}"/><line x1="${x - 2}" y1="${y + 16}" x2="${x + 2}" y2="${y + 16}"/></g>`; }
/** Two-winding transformer. Terminals at y-34 / y+34. */
export function xfmr(x, y, id, { kv1, kv2, label, sub, net1, net2, oltc = true } = {}) {
  const inner = `<circle cx="${x}" cy="${y - 10}" r="17" fill="none" stroke="${kvColor(kv1)}" stroke-width="2.2"${netAttr(net1)} class="sx-wire"/><circle cx="${x}" cy="${y + 10}" r="17" fill="none" stroke="${kvColor(kv2)}" stroke-width="2.2"${netAttr(net2)} class="sx-wire"/>${oltc ? `<line x1="${x - 22}" y1="${y + 18}" x2="${x + 22}" y2="${y - 18}" stroke="#cbd5e1" stroke-width="1.4" marker-end="url(#sxarr)"/>` : ''}<line x1="${x}" y1="${y - 34}" x2="${x}" y2="${y - 27}" stroke="${kvColor(kv1)}" stroke-width="3"/><line x1="${x}" y1="${y + 27}" x2="${x}" y2="${y + 34}" stroke="${kvColor(kv2)}" stroke-width="3"/>${label ? text(x + 26, y - 6, label, { cls: 'sx-tb' }) : ''}${sub ? text(x + 26, y + 8, sub, { cls: 'sx-ts' }) : ''}`;
  return hit(id, x - 26, y - 34, 120, 68, inner);
}
export function ct(x, y, { label } = {}) { return `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#cbd5e1" stroke-width="1.4"/>${label ? text(x + 10, y + 3, label, { cls: 'sx-ts' }) : ''}`; }
export function vt(x, y, { dir = 1, label } = {}) { const x1 = x + dir * 10; return `<line x1="${x}" y1="${y}" x2="${x1}" y2="${y}" stroke="#cbd5e1" stroke-width="1.4"/><circle cx="${x1 + dir * 7}" cy="${y}" r="7" fill="none" stroke="#cbd5e1" stroke-width="1.4"/><circle cx="${x1 + dir * 16}" cy="${y}" r="7" fill="none" stroke="#cbd5e1" stroke-width="1.4"/>${label ? text(x1 + dir * 28, y + 3, label, { cls: 'sx-ts', anchor: dir > 0 ? 'start' : 'end' }) : ''}`; }
/** Surge arrester to earth, off the conductor at (x,y). */
export function la(x, y, { dir = -1, label } = {}) { const x1 = x + dir * 22; return `<line x1="${x}" y1="${y}" x2="${x1}" y2="${y}" stroke="#64748b" stroke-width="1.4"/><rect x="${x1 - 5}" y="${y}" width="10" height="16" fill="none" stroke="#cbd5e1" stroke-width="1.3"/><path d="M${x1} ${y + 2} L${x1} ${y + 13} M${x1 - 3} ${y + 9} L${x1} ${y + 13} L${x1 + 3} ${y + 9}" stroke="#cbd5e1" fill="none" stroke-width="1.1"/>${earth(x1, y + 16)}${label ? text(x1 + dir * 10, y + 12, label, { cls: 'sx-ts', anchor: dir > 0 ? 'start' : 'end' }) : ''}`; }
/** Protection relay function (ANSI/IEEE C37.2 device number), joined to the primary by a dashed signal line. */
export function relay(x, y, code, { from, label } = {}) { return `${from ? `<path class="sx-sig" d="M${from[0]} ${from[1]} L${x} ${y}"/>` : ''}<circle cx="${x}" cy="${y}" r="13" fill="#0e141d" stroke="#94a3b8" stroke-width="1.2"/>${text(x, y + 3.5, code, { cls: 'sx-isa-t', anchor: 'middle' })}${label ? text(x, y + 25, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`; }
/** Overhead line exit with an arrow and a name. */
export function lineExit(x, y, { label, sub, kv, net, dir = -1, id, flow } = {}) {
  const y2 = y + dir * 40;
  const body = `${wire([[x, y], [x, y2]], { kv, net, flow })}<path d="M${x - 7} ${y2 + dir * -2} L${x} ${y2 + dir * 10} L${x + 7} ${y2 + dir * -2}" fill="${kvColor(kv)}"${netAttr(net)} class="sx-wire" style="stroke:none"/>${label ? text(x, y2 + dir * 22 + (dir < 0 ? 0 : 6), label, { cls: 'sx-tb', anchor: 'middle' }) : ''}${sub ? text(x, y2 + dir * 22 + (dir < 0 ? 13 : 19), sub, { cls: 'sx-ts', anchor: 'middle' }) : ''}`;
  return id ? hit(id, x - 50, Math.min(y, y2 + dir * 30) - 4, 100, Math.abs(y2 - y) + 46, body) : body;
}
export function gen(x, y, id, { label, kv } = {}) { return hit(id, x - 22, y - 22, 44, 44, `<circle cx="${x}" cy="${y}" r="18" class="sx-eqf" style="stroke:${kvColor(kv)}"/><path d="M${x - 9} ${y} q4.5 -8 9 0 t9 0" fill="none" stroke="#e2e8f0" stroke-width="1.6"/>${label ? text(x, y + 34, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`); }
export function cap(x, y, id, { label } = {}) { return hit(id, x - 16, y - 6, 32, 40, `<line x1="${x - 12}" y1="${y + 8}" x2="${x + 12}" y2="${y + 8}" stroke="#cbd5e1" stroke-width="2.2"/><path d="M${x - 12} ${y + 16} q12 -6 24 0" stroke="#cbd5e1" fill="none" stroke-width="2.2"/>${earth(x, y + 18)}${label ? text(x + 16, y + 14, label, { cls: 'sx-ts' }) : ''}`); }
export function reactor(x, y, id, { label } = {}) { return hit(id, x - 14, y - 14, 28, 46, `<path d="M${x} ${y - 12} v4 a8 8 0 1 1 -8 8 h8 v18" fill="none" stroke="#cbd5e1" stroke-width="1.8"/>${label ? text(x + 14, y + 6, label, { cls: 'sx-ts' }) : ''}`); }

/* ------------------------------------------------------------- process (ISA-5.1) */
export function pipe(points, { medium = 'oil', flow, ref, net, arrow } = {}) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join(' ');
  return `<path class="sx-pipe ${medium}" d="${d}"${netAttr(net)}${arrow ? ' marker-end="url(#sxarr)"' : ''}/>${flow ? `<path class="sx-pflow" d="${d}" data-live-flow="${esc(flow)}"${ref ? ` data-ref="${ref}"` : ''}${netAttr(net)}/>` : ''}`;
}
export function sig(points) { return `<path class="sx-sig" d="${points.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join(' ')}"/>`; }
/** Centrifugal pump; impeller turns while `run` > 0.5. Suction left, discharge up-right. */
export function pump(x, y, id, { run, label, dir = 1 } = {}) {
  const vanes = [0, 90, 180, 270].map((a) => { const r = a * Math.PI / 180; return `<path d="M${x} ${y} q${(6 * Math.cos(r + 0.9)).toFixed(1)} ${(6 * Math.sin(r + 0.9)).toFixed(1)} ${(10 * Math.cos(r)).toFixed(1)} ${(10 * Math.sin(r)).toFixed(1)}" stroke="#cbd5e1" stroke-width="2" fill="none" stroke-linecap="round"/>`; }).join('');
  const inner = `<path d="M${x} ${y - 15} L${x + dir * 24} ${y - 15} L${x + dir * 24} ${y - 7} L${x + dir * 13} ${y - 7}" fill="#1a2330" stroke="#9aa8bb" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="15" class="sx-eqf"/><g class="sx-rot"${run ? ` data-live-run="${esc(run)}"` : ''}>${vanes}</g><circle cx="${x}" cy="${y}" r="2.4" fill="#e2e8f0"/><path d="M${x - 12} ${y + 19} L${x + 12} ${y + 19} M${x - 8} ${y + 14} L${x - 11} ${y + 19} M${x + 8} ${y + 14} L${x + 11} ${y + 19}" stroke="#9aa8bb" stroke-width="1.8"/>${label ? text(x, y + 33, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`;
  return hit(id, x - 20, y - 20, 48, 58, inner);
}
/** Axial fan (cooler). Spins while `run` > 0.5. */
export function fan(x, y, id, { run, label, r = 13 } = {}) {
  const blades = [0, 120, 240].map((a) => `<path d="M${x} ${y} q${(r * 0.9 * Math.cos((a - 25) * Math.PI / 180)).toFixed(1)} ${(r * 0.9 * Math.sin((a - 25) * Math.PI / 180)).toFixed(1)} ${(r * 0.85 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(r * 0.85 * Math.sin(a * Math.PI / 180)).toFixed(1)}" stroke="#cbd5e1" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('');
  const inner = `<circle cx="${x}" cy="${y}" r="${r}" class="sx-eqf"/><g class="sx-rot"${run ? ` data-live-run="${esc(run)}"` : ''}>${blades}</g><circle cx="${x}" cy="${y}" r="2.2" fill="#e2e8f0"/>${label ? text(x, y + r + 13, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`;
  return hit(id, x - r - 4, y - r - 4, 2 * r + 8, 2 * r + 20, inner);
}
/** Manual / motor-operated isolating valve (bow-tie). Operable valves use data-sw (closed = flow path open). */
export function valve(x, y, id, { vertical, label, operable = true } = {}) {
  const s = 9;
  const shape = vertical ? `M${x - s} ${y - s} L${x + s} ${y - s} L${x - s} ${y + s} L${x + s} ${y + s}Z` : `M${x - s} ${y - s} L${x + s} ${y + s} L${x + s} ${y - s} L${x - s} ${y + s}Z`;
  const inner = `<g ${operable ? `data-sw="${esc(id)}"` : ''} class="sx-valve"><path d="${shape}" stroke="#cbd5e1" stroke-width="1.5"/></g>${label ? text(x + (vertical ? 13 : 0), y + (vertical ? 4 : -13), label, { cls: 'sx-ts', anchor: vertical ? 'start' : 'middle' }) : ''}`;
  return hit(id, x - 13, y - 13, 26, 26, inner);
}
/** Control valve with diaphragm actuator; position tag shown above. */
export function cv(x, y, id, { pos, label } = {}) {
  const s = 9;
  const inner = `<path d="M${x - s} ${y - s} L${x + s} ${y + s} L${x + s} ${y - s} L${x - s} ${y + s}Z" fill="#1a2330" stroke="#cbd5e1" stroke-width="1.5"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 18}" stroke="#cbd5e1" stroke-width="1.4"/><path d="M${x - 10} ${y - 18} a10 8 0 0 1 20 0Z" fill="#1a2330" stroke="#cbd5e1" stroke-width="1.4"/>${pos ? `<text x="${x}" y="${y - 30}" class="sx-v" text-anchor="middle" data-live="${esc(pos)}">—</text>` : ''}${label ? text(x, y + 22, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`;
  return hit(id, x - 14, y - 40, 28, 68, inner);
}
/** Vertical vessel / tank with a live level. */
export function tank(x, y, w, h, id, { level, max = 100, label, sub, medium = 'oil', hhPct, lPct } = {}) {
  const fillC = { oil: '#a16207', water: '#1d4ed8', gas: '#4d7c0f', sf6: '#4d7c0f' }[medium] || '#475569';
  const inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, w / 4)}" fill="#111823" stroke="#9aa8bb" stroke-width="1.6"/><clipPath id="clip-${esc(id)}"><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="${Math.min(12, w / 4)}"/></clipPath><g clip-path="url(#clip-${esc(id)})"><rect class="sx-lvl" x="${x + 2}" y="${y + h - 2}" width="${w - 4}" height="0" fill="${fillC}" opacity=".55"${level ? ` data-live-lvl="${esc(level)}" data-y0="${y + h - 2}" data-h="${h - 4}" data-max="${max}"` : ''}/></g>${hhPct ? `<line x1="${x - 5}" y1="${y + h * (1 - hhPct)}" x2="${x}" y2="${y + h * (1 - hhPct)}" stroke="#f87171" stroke-width="1.5"/>` : ''}${lPct ? `<line x1="${x - 5}" y1="${y + h * (1 - lPct)}" x2="${x}" y2="${y + h * (1 - lPct)}" stroke="#fbbf24" stroke-width="1.5"/>` : ''}${label ? text(x + w / 2, y - 18, label, { cls: 'sx-tb', anchor: 'middle' }) : ''}${sub ? text(x + w / 2, y - 6, sub, { cls: 'sx-ts', anchor: 'middle' }) : ''}${level ? `<text x="${x + w / 2}" y="${y + h / 2 + 4}" class="sx-v" text-anchor="middle" data-live="${esc(level)}">—</text>` : ''}`;
  return hit(id, x - 8, y - 30, w + 16, h + 38, inner);
}
/** Plate radiator / heat exchanger bank. */
export function radiator(x, y, id, { label, fins = 6, w = 70, h = 90 } = {}) {
  const step = w / (fins + 1);
  const finsSvg = Array.from({ length: fins }, (_, i) => `<line x1="${(x + step * (i + 1)).toFixed(1)}" y1="${y + 8}" x2="${(x + step * (i + 1)).toFixed(1)}" y2="${y + h - 8}" stroke="#64748b" stroke-width="3"/>`).join('');
  return hit(id, x - 4, y - 4, w + 8, h + 22, `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#111823" stroke="#9aa8bb" stroke-width="1.5"/>${finsSvg}${label ? text(x + w / 2, y + h + 14, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`);
}
export function hx(x, y, id, { label } = {}) { return hit(id, x - 24, y - 24, 48, 60, `<circle cx="${x}" cy="${y}" r="20" class="sx-eqf"/><path d="M${x - 20} ${y} L${x - 10} ${y - 8} L${x} ${y + 8} L${x + 10} ${y - 8} L${x + 20} ${y}" stroke="#cbd5e1" fill="none" stroke-width="1.5"/>${label ? text(x, y + 34, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`); }
export function filter(x, y, id, { label } = {}) { return hit(id, x - 14, y - 18, 28, 50, `<path d="M${x - 12} ${y - 14} h24 l-8 14 v14 h-8 v-14Z" class="sx-eqf"/><line x1="${x - 9}" y1="${y - 8}" x2="${x + 9}" y2="${y - 8}" stroke="#cbd5e1" stroke-dasharray="2 2"/>${label ? text(x, y + 28, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`); }
export function heater(x, y, id, { label, run } = {}) { return hit(id, x - 20, y - 16, 40, 46, `<rect x="${x - 16}" y="${y - 12}" width="32" height="24" rx="3" class="sx-eqf"/><path d="M${x - 10} ${y} q2.5 -6 5 0 t5 0 t5 0 t5 0" stroke="#fb923c" fill="none" stroke-width="1.6"${run ? ` data-live-run="${esc(run)}"` : ''}/>${label ? text(x, y + 26, label, { cls: 'sx-ts', anchor: 'middle' }) : ''}`); }
export function psv(x, y, { label } = {}) { return `<path d="M${x - 7} ${y} L${x + 7} ${y} L${x} ${y - 10}Z M${x} ${y - 10} L${x} ${y - 16} M${x - 5} ${y - 14} L${x + 5} ${y - 18}" stroke="#cbd5e1" fill="#1a2330" stroke-width="1.3"/>${label ? text(x + 10, y - 6, label, { cls: 'sx-ts' }) : ''}`; }
/** ISA-5.1 instrument bubble. loc: 'field' (plain), 'panel' (line), 'dcs' (square around). Shows the live value beside. */
export function instr(x, y, func, loop, { tag, unit = '', loc = 'dcs', id, side = 1, alarm } = {}) {
  const r = 14;
  const body = `${loc === 'dcs' ? `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="none" stroke="#64748b" stroke-width="1"/>` : ''}<circle cx="${x}" cy="${y}" r="${r}" class="sx-isa"/>${loc !== 'field' ? `<line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}" stroke="#cbd5e1" stroke-width="1"/>` : ''}${text(x, y - (loc !== 'field' ? 3 : -3), func, { cls: 'sx-isa-t', anchor: 'middle' })}${text(x, y + 10, loop, { cls: 'sx-isa-t', anchor: 'middle', size: 8 })}${tag ? `<rect class="sx-box" x="${side > 0 ? x + r + 4 : x - r - 66}" y="${y - 9}" width="62" height="18" rx="3"/><text x="${side > 0 ? x + r + 40 : x - r - 30}" y="${y + 4}" class="sx-v" text-anchor="end" data-live="${esc(tag)}">—</text>${text(side > 0 ? x + r + 62 : x - r - 8, y + 4, unit, { cls: 'sx-ts', anchor: 'end' })}` : ''}${alarm ? `<text x="${x + r - 2}" y="${y - r + 2}" class="sx-ts" style="fill:#f87171">${esc(alarm)}</text>` : ''}`;
  return id ? hit(id, x - r - 4, y - r - 4, 2 * r + 8 + (tag ? 70 : 0) - (side < 0 && tag ? 0 : 0), 2 * r + 8, body) : body;
}
/** Buchholz (gas-and-oil) relay on the conservator pipe. */
export function buchholz(x, y, id, { label = 'Buchholz' } = {}) { return hit(id, x - 12, y - 10, 24, 34, `<rect x="${x - 9}" y="${y - 7}" width="18" height="14" rx="2" class="sx-eqf"/><text x="${x}" y="${y + 3.5}" class="sx-isa-t" text-anchor="middle">63</text>${text(x, y + 20, label, { cls: 'sx-ts', anchor: 'middle' })}`); }
/** Alarm lamp beside a symbol, blinks while the bound tag is in alarm (painted by data-live class). */
export function lamp(x, y, tag) { return `<text x="${x}" y="${y}" class="sx-v" data-live="${esc(tag)}" style="font-size:9px">—</text>`; }
