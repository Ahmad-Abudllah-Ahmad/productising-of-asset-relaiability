// NEXUS Console runtime: the shell, the UI kit, chart theming, the live tag bus, the asset map and the HMI
// (schematic) viewer shared by every module workspace. ES module, no build step.
//
// A module calls mountApp({ id, code, product, screens }) where each screen is
// { id, name, icon, tabs: [{ name, render(ctx) -> html, mount(stage, ctx) -> cleanup?, full?: bool }] }.
// ctx gives tabs auto-cleaned helpers: ctx.chart(), ctx.map(), ctx.hmi(), ctx.every(), ctx.on().

/* ================================================================== helpers */
export const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = {
  n: (v, d = 0) => (v == null || Number.isNaN(+v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })),
  pct: (v, d = 0) => (v == null ? '—' : `${fmt.n(v, d)}%`),
  money: (v, d = 0) => {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return `$${fmt.n(v / 1e6, a >= 1e7 ? 1 : 2)}M`;
    if (a >= 1e3) return `$${fmt.n(v / 1e3, a >= 1e5 ? 0 : 1)}k`;
    return `$${fmt.n(v, d)}`;
  },
  date: (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'),
  short: (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—'),
  title: (s) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
};
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const addDays = (iso, d) => new Date(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 864e5);

/* ================================================================== icons (24px, stroke) */
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  registry: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
  tower: '<path d="M12 2 7 22M12 2l5 20M8.5 15h7M9.6 10h4.8M5 6h14M7 22h10"/>',
  line: '<path d="M2 8c4 0 6 5 10 5s6-5 10-5"/><path d="M2 14c4 0 6 5 10 5s6-5 10-5" opacity=".5"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  schematic: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a2 2 0 0 1 2 2v7"/><circle cx="6" cy="18" r="3"/><path d="M9 18h6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h6M9 19h3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  flow: '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><rect x="15" y="3" width="6" height="5" rx="1"/><path d="M9 5.5h6M18 8v8"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  grid: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/><circle cx="12" cy="18" r="1.5"/>',
  outage: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/><path d="M3 3l18 18"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  loss: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  event: '<path d="M12 8v5M12 16h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  boxes: '<path d="M3 13h8v8H3zM13 13h8v8h-8zM8 3h8v8H8z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
  factory: '<path d="M2 21V10l6 4V10l6 4V6l8 4v11H2Z"/><path d="M6 17h2M11 17h2M16 17h2"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  forecast: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-6"/><path d="M14 7h5v5" stroke-dasharray="2 2"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  dollar: '<path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2.2 3 5 3.6 5 1.6 5 4-2.2 3.9-5 3.9-5-1.2-5-3.1"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 14h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7ZM19 7l-3 7a3 3 0 0 0 6 0l-3-7ZM8 21h8"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  hardhat: '<path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3"/><path d="M10 8V5h4v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  collapse: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 9l-3 3 3 3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  play: '<path d="M7 4v16l13-8L7 4Z"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>',
  drone: '<circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="10" y="10" width="4" height="4" rx="1"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
  substation: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M7 9V5M12 9V3M17 9V5M7 14h3M14 14h3"/>',
  transformer: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  warehouse: '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  ai: '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18H7Z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
};
export function icon(name, size) {
  const s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${s} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.dashboard}</svg>`;
}
export const ICON_NAMES = Object.keys(P);

/* ================================================================== UI kit (HTML strings) */
const TONES = { ok: 'ok', good: 'ok', normal: 'ok', low: 'ok', warn: 'warn', medium: 'warn', moderate: 'warn', high: 'high', crit: 'crit', critical: 'crit', poor: 'crit', info: 'info', accent: 'accent', violet: 'violet', muted: 'muted' };
export const tone = (t) => TONES[t] || t || 'muted';
export const SEV = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a', info: '#0284c7' };
export const KV_COLOR = { 500: '#a855f7', 330: '#ec4899', 220: '#3b82f6', 132: '#14b8a6', 110: '#14b8a6', 33: '#84cc16', 11: '#eab308' };
export const PALETTE = ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#84cc16', '#ec4899', '#64748b'];

/** A 0–100 health value to a colour (red → amber → green). */
export function healthColor(v) {
  if (v == null) return '#94a3b8';
  if (v < 40) return '#dc2626';
  if (v < 55) return '#ea580c';
  if (v < 70) return '#d97706';
  if (v < 85) return '#65a30d';
  return '#16a34a';
}
export function riskColor(v) { // 0..1
  if (v == null) return '#94a3b8';
  if (v >= 0.6) return '#dc2626';
  if (v >= 0.4) return '#ea580c';
  if (v >= 0.25) return '#d97706';
  return '#16a34a';
}

export function spark(values, color = '#3b82f6', { h = 40, fill = true } = {}) {
  const v = values && values.length > 1 ? values : [1, 1];
  const w = 200; const max = Math.max(...v); const min = Math.min(...v); const span = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, 4 + (1 - (y - min) / span) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = `g${Math.abs(hash(color + v.join(','))).toString(36)}`;
  return `<svg class="nx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#${id})"/>` : ''}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
export function hash(s) { let x = 0; for (let i = 0; i < s.length; i += 1) x = (Math.imul(31, x) + s.charCodeAt(i)) | 0; return x; }

export const ui = {
  badge: (text, t = 'muted', { dot = true, tip } = {}) => `<span class="nx-badge t-${tone(t)}${dot ? '' : ' no-dot'}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(text)}</span>`,
  delta(v, { suffix = '%', invert = false, d = 1 } = {}) {
    if (v == null) return '';
    const good = invert ? v < 0 : v > 0;
    const cls = Math.abs(v) < 1e-9 ? 'is-flat' : good ? 'is-up' : 'is-down';
    return `<span class="nx-delta ${cls}">${v > 0 ? '▲' : v < 0 ? '▼' : '•'} ${fmt.n(Math.abs(v), d)}${suffix}</span>`;
  },
  /** items: [{ label, value, unit, sub, delta, deltaInvert, icon, tone, spark:[...], sparkColor, live:'TAG', tip }] */
  kpis(items, cls = '') {
    return `<div class="nx-kpis ${cls}">${items.map((k) => {
      const color = k.sparkColor || { ok: '#16a34a', warn: '#d97706', crit: '#dc2626', violet: '#7c3aed', info: '#0284c7' }[k.tone] || '#3b82f6';
      const val = k.live ? `<span data-live="${esc(k.live)}">${esc(k.value ?? '—')}</span>` : esc(k.value);
      return `<div class="nx-kpi"${k.tip ? ` data-tip="${esc(k.tip)}"` : ''}${k.id ? ` id="${esc(k.id)}"` : ''}><div class="nx-kpi-top">${k.icon ? `<span class="nx-kpi-ico t-${k.tone || 'accent'}">${icon(k.icon)}</span>` : ''}<span class="nx-kpi-l">${esc(k.label)}</span></div><div class="nx-kpi-v">${val}${k.unit ? `<small>${esc(k.unit)}</small>` : ''}</div><div class="nx-kpi-s">${k.delta != null ? ui.delta(k.delta, { invert: k.deltaInvert, suffix: k.deltaSuffix ?? '%', d: k.deltaDec ?? (Number.isInteger(k.delta) ? 0 : 1) }) : ''}<span>${k.subHtml ?? esc(k.sub ?? '')}</span></div>${k.spark ? spark(k.spark, color) : '<div style="height:14px"></div>'}</div>`;
    }).join('')}</div>`;
  },
  card({ title, sub, tools = '', body = '', foot = '', cls = '', flush = false, id = '', attrs = '' }) {
    const head = title || tools ? `<div class="nx-card-h"><div>${title ? `<h3>${esc(title)}</h3>` : ''}${sub ? `<p>${esc(sub)}</p>` : ''}</div>${tools ? `<div class="nx-card-tools">${tools}</div>` : ''}</div>` : '';
    return `<section class="nx-card ${cls}"${id ? ` id="${esc(id)}"` : ''} ${attrs}>${head}<div class="nx-card-b${flush ? ' is-flush' : ''}">${body}</div>${foot ? `<div class="nx-card-f">${foot}</div>` : ''}</section>`;
  },
  chart: (id, size = '') => `<div class="nx-chart ${size ? `is-${size}` : ''}" data-chart="${esc(id)}"></div>`,
  hero({ kicker = 'Operational output', text, meta = [], icon: ic = 'ai', actions = '' }) {
    return `<div class="nx-hero"><div class="nx-hero-icon">${icon(ic)}</div><div class="nx-hero-text"><small>${esc(kicker)}</small><p>${text}</p></div><div class="nx-hero-meta">${meta.map((m) => `<div><b${m.live ? ` data-live="${esc(m.live)}"` : ''}>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>${actions}</div>`;
  },
  callout: (html, t = 'info', ic = 'info') => `<div class="nx-callout t-${tone(t)}">${icon(ic)}<div>${html}</div></div>`,
  meter(v, max = 100, color, label) {
    const pct = clamp((v / max) * 100, 0, 100);
    return `<div class="nx-meter"><div class="nx-bar"><i style="width:${pct.toFixed(1)}%;background:${color || healthColor(pct)}"></i></div><span>${label ?? fmt.n(v)}</span></div>`;
  },
  score(v, color) {
    const c = color || healthColor(v);
    return `<span class="nx-score" style="background:${c}1f;color:${c}">${v == null ? '—' : fmt.n(v)}</span>`;
  },
  stats: (items) => `<div class="nx-stats">${items.map((s) => `<div><small>${esc(s.label)}</small><b${s.live ? ` data-live="${esc(s.live)}"` : ''}${s.color ? ` style="color:${s.color}"` : ''}>${esc(s.value)}</b></div>`).join('')}</div>`,
  kv: (rows) => `<dl class="nx-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`,
  seg: (name, options, active) => `<div class="nx-seg" data-seg="${esc(name)}">${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-v="${esc(v)}" class="${String(v) === String(active) ? 'is-on' : ''}">${esc(l)}</button>`; }).join('')}</div>`,
  chips: (name, options, active) => `<div class="nx-toolbar" data-chips="${esc(name)}">${options.map((o) => { const [v, l, c] = Array.isArray(o) ? o : [o, o]; return `<button type="button" class="nx-chip ${String(v) === String(active) ? 'is-on' : ''}" data-v="${esc(v)}">${c ? `<i style="background:${c}"></i>` : ''}${esc(l)}</button>`; }).join('')}</div>`,
  btn: (label, { primary, sm, ic, attrs = '', danger, ghost } = {}) => `<button type="button" class="nx-btn${primary ? ' is-primary' : ''}${sm ? ' is-sm' : ''}${danger ? ' is-danger' : ''}${ghost ? ' is-ghost' : ''}" ${attrs}>${ic ? icon(ic) : ''}${esc(label)}</button>`,
  li({ ic = 'info', icTone, title, sub, end = '', row, color }) {
    const st = color ? ` style="background:${color}1a;color:${color}"` : '';
    return `<div class="nx-li"${row ? ` data-row="${esc(row)}"` : ''}><span class="nx-li-ico${icTone ? ` t-${icTone}` : ''}"${st}>${icon(ic)}</span><div class="nx-li-main"><b>${esc(title)}</b><span>${sub ?? ''}</span></div><div class="nx-li-end">${end}</div></div>`;
  },
  timeline: (items) => `<div class="nx-tl">${items.map((i) => `<div class="nx-tl-i t-${tone(i.tone)}"><small>${esc(i.when)}</small><b>${esc(i.title)}</b>${i.text ? `<p>${i.text}</p>` : ''}</div>`).join('')}</div>`,
  empty: (text = 'Nothing to show for this selection.') => `<div class="nx-empty">${esc(text)}</div>`,
  /**
   * cols: [{ key, label, align:'r'|'c', render(row) -> html, sort: true|fn(row) -> value, wrap }]
   * rows: array; rowId(row) -> id makes rows clickable (data-row).
   */
  table({ id = '', cols, rows, rowId, empty = 'No records match.', max = 400, cls = '', sel }) {
    const head = cols.map((c, i) => `<th class="${c.align || ''}"${c.sort !== false ? ` data-sort="${i}"` : ''}>${esc(c.label)}</th>`).join('');
    const body = rows.slice(0, max).map((r) => {
      const rid = rowId ? rowId(r) : null;
      return `<tr${rid != null ? ` data-row="${esc(rid)}"` : ''}${rid != null && rid === sel ? ' class="is-sel"' : ''}>${cols.map((c) => {
        const sv = typeof c.sort === 'function' ? c.sort(r) : (c.key ? r[c.key] : '');
        const html = c.render ? c.render(r) : esc(r[c.key]);
        return `<td class="${c.align || ''}${c.wrap ? ' is-wrap' : ''}"${sv != null && sv !== '' ? ` data-v="${esc(sv)}"` : ''}>${html}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<div class="nx-table-wrap ${cls}"><table class="nx-table"${id ? ` id="${esc(id)}"` : ''}><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="nx-table-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
  },
  search: (target, placeholder = 'Search…') => `<label class="nx-search" style="width:220px;height:32px">${icon('search', 15)}<input type="search" placeholder="${esc(placeholder)}" data-filter-table="${esc(target)}"/></label>`,
  /** rows: [{ label, sub, bars:[{ start, end, color, text, id }] }], range: [startISO, endISO], now: ISO */
  gantt({ rows, range, now, labelW = 200, ticks = 'month' }) {
    const [a, b] = range; const span = daysBetween(a, b) || 1;
    const x = (d) => clamp((daysBetween(a, d) / span) * 100, 0, 100);
    const marks = [];
    let d = a;
    while (d <= b) { marks.push(d); d = ticks === 'week' ? addDays(d, 7) : ticks === 'day' ? addDays(d, 1) : addDays(`${d.slice(0, 7)}-01`, 32).slice(0, 7) + '-01'; }
    const step = 100 / (span / (ticks === 'week' ? 7 : ticks === 'day' ? 1 : 30.4));
    const head = `<div></div><div class="nx-gantt-head">${marks.map((m) => `<span style="left:${x(m)}%">${ticks === 'month' ? new Date(`${m}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : fmt.short(m)}</span>`).join('')}</div>`;
    const body = rows.map((r) => `<div class="nx-gantt-lab"><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div><div class="nx-gantt-track" style="background-size:${step}% 100%">${r.bars.map((bar) => `<div class="nx-gantt-bar" data-row="${esc(bar.id ?? '')}" style="left:${x(bar.start)}%;width:${Math.max(0.8, x(bar.end) - x(bar.start))}%;background:${bar.color || '#3b82f6'}" data-tip="${esc(bar.tip ?? bar.text ?? '')}">${esc(bar.text ?? '')}</div>`).join('')}</div>`).join('');
    const nowLine = now && now >= a && now <= b ? `<div class="nx-gantt-now" style="left:calc(${labelW}px + (100% - ${labelW}px) * ${x(now) / 100})"></div>` : '';
    return `<div class="nx-gantt" style="grid-template-columns:${labelW}px 1fr">${head}${body}${nowLine}</div>`;
  },
  kanban: (cols) => `<div class="nx-kanban">${cols.map((c) => `<div class="nx-col"><div class="nx-col-h"><i style="width:8px;height:8px;border-radius:50%;background:${c.color || '#64748b'}"></i>${esc(c.title)}<span>${c.items.length}</span></div>${c.items.map((t) => `<div class="nx-tile" data-row="${esc(t.id)}"><div style="display:flex;gap:6px;align-items:center"><b>${esc(t.title)}</b><span style="margin-left:auto">${t.badge ?? ''}</span></div>${t.text ? `<div style="color:var(--nx-ink-2)">${t.text}</div>` : ''}<div class="nx-tile-meta">${t.meta ?? ''}</div></div>`).join('') || '<div class="nx-note" style="padding:8px">Empty</div>'}</div>`).join('')}</div>`,
};

/* ================================================================== external libs */
const loaded = new Map();
function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`)); document.head.appendChild(s); });
  loaded.set(src, p);
  return p;
}
function loadCss(href) { if ([...document.styleSheets].some((s) => s.href === href) || document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
export const libs = {
  echarts: () => (window.echarts ? Promise.resolve(window.echarts) : loadScript('/reliability/js/vendor/echarts/echarts.min.js').then(() => { registerTheme(); return window.echarts; })),
  leaflet: () => { loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'); return window.L ? Promise.resolve(window.L) : loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').then(() => window.L); },
};

/* ================================================================== charts */
let themed = false;
function registerTheme() {
  if (themed || !window.echarts) return;
  themed = true;
  const axis = { axisLine: { lineStyle: { color: '#e2e8f0' } }, axisTick: { show: false }, axisLabel: { color: '#64748b', fontSize: 11 }, splitLine: { lineStyle: { color: '#eef2f6', type: 'dashed' } }, nameTextStyle: { color: '#94a3b8', fontSize: 11 } };
  window.echarts.registerTheme('nx', {
    color: PALETTE, backgroundColor: 'transparent', textStyle: { fontFamily: 'DM Sans, Inter, system-ui, sans-serif' },
    categoryAxis: axis, valueAxis: { ...axis, axisLine: { show: false } }, timeAxis: axis, logAxis: axis,
    legend: { textStyle: { color: '#475569', fontSize: 11.5 }, itemWidth: 10, itemHeight: 10, icon: 'roundRect' },
    tooltip: { backgroundColor: 'rgba(15,23,42,.94)', borderWidth: 0, textStyle: { color: '#e2e8f0', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 10px 30px rgba(15,23,42,.3);' },
    line: { symbol: 'circle', symbolSize: 5, smooth: false, lineStyle: { width: 2 } }, bar: { barMaxWidth: 26, itemStyle: { borderRadius: [4, 4, 0, 0] } },
  });
  window.echarts.registerTheme('nx-dark', {
    color: ['#67e8f9', '#a78bfa', '#fbbf24', '#4ade80', '#f87171'], backgroundColor: 'transparent', textStyle: { fontFamily: 'DM Sans, system-ui, sans-serif' },
    categoryAxis: { axisLine: { lineStyle: { color: '#263244' } }, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { show: false } },
    valueAxis: { axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1b2534' } } },
    tooltip: { backgroundColor: '#0b1119', borderColor: '#263244', textStyle: { color: '#e2e8f0', fontSize: 11 } },
  });
}

/** Option builders that follow the house style. All return plain ECharts options; pass extra keys to override. */
export const ch = {
  grid: (o = {}) => ({ left: 8, right: 12, top: 34, bottom: 6, containLabel: true, ...o }),
  tip: (o = {}) => ({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: '#94a3b8', type: 'dashed' } }, ...o }),
  /** x: labels, series: [{ name, data, color, area, dash, smooth, step, yAxisIndex, stack, markLine, type }] */
  line({ x, series, yName, y2Name, yMin, yMax, legend = true, grid, zoom, markArea, xType = 'category', tooltip }) {
    return {
      grid: ch.grid(grid), tooltip: ch.tip(tooltip), legend: legend ? { top: 0, right: 0 } : undefined,
      dataZoom: zoom ? [{ type: 'inside' }] : undefined,
      xAxis: { type: xType, data: xType === 'category' ? x : undefined, boundaryGap: false, axisLabel: { alignMinLabel: 'left', alignMaxLabel: 'right', hideOverlap: true } },
      yAxis: [{ type: 'value', name: yName, min: yMin, max: yMax, scale: yMin == null }, ...(y2Name ? [{ type: 'value', name: y2Name, splitLine: { show: false } }] : [])],
      series: series.map((s, i) => ({
        type: s.type || 'line', name: s.name, data: s.data, smooth: s.smooth ?? true, step: s.step, stack: s.stack, yAxisIndex: s.yAxisIndex || 0, showSymbol: s.symbol ?? false,
        lineStyle: { width: s.width || 2, type: s.dash ? 'dashed' : 'solid', color: s.color || PALETTE[i % PALETTE.length] }, itemStyle: { color: s.color || PALETTE[i % PALETTE.length] },
        areaStyle: s.area ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${s.color || PALETTE[i % PALETTE.length]}${s.areaAlpha || '40'}` }, { offset: 1, color: `${s.color || PALETTE[i % PALETTE.length]}00` }] } } : undefined,
        markLine: s.markLine, markArea: i === 0 ? markArea : s.markArea, markPoint: s.markPoint, z: s.z, emphasis: { focus: 'series' },
      })),
    };
  },
  /** x: labels, series: [{ name, data, color, stack }]; horizontal flips axes */
  bar({ x, series, yName, horizontal = false, legend = true, grid, stack, labels = false, max, colorBy, tooltip, barWidth }) {
    const cat = { type: 'category', data: x, axisLabel: { color: '#475569', fontSize: 11 } };
    const val = { type: 'value', name: yName, max };
    return {
      grid: ch.grid(grid), tooltip: ch.tip({ axisPointer: { type: 'shadow' }, ...(tooltip || {}) }), legend: legend && series.length > 1 ? { top: 0, right: 0 } : undefined,
      xAxis: horizontal ? val : cat, yAxis: horizontal ? { ...cat, inverse: true } : val,
      series: series.map((s, i) => ({
        type: 'bar', name: s.name, data: s.data, stack: s.stack ?? (stack ? 'a' : undefined), barWidth: s.barWidth ?? barWidth, colorBy,
        itemStyle: { color: s.color || PALETTE[i % PALETTE.length], borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        label: labels ? { show: true, position: horizontal ? 'right' : 'top', color: '#475569', fontSize: 11, formatter: s.labelFmt } : undefined,
        markLine: s.markLine, emphasis: { focus: 'series' },
      })),
    };
  },
  donut({ data, center = 'Total', value, radius = ['58%', '80%'], legend = 'bottom', colors }) {
    const total = value ?? data.reduce((a, d) => a + (d.value || 0), 0);
    const side = legend === 'right';
    const cx = side ? '32%' : '50%'; const cy = legend === 'bottom' ? '44%' : '50%';
    return {
      tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
      legend: !legend ? undefined : side ? { orient: 'vertical', right: 4, top: 'middle', icon: 'circle', itemGap: 10 } : { bottom: 0, left: 'center', icon: 'circle', itemGap: 12, itemWidth: 9, itemHeight: 9 },
      title: { text: typeof total === 'number' ? fmt.n(total) : total, subtext: center, left: cx, top: cy, textAlign: 'center', textVerticalAlign: 'middle', itemGap: 2, textStyle: { fontSize: 22, fontWeight: 700, color: '#0f172a' }, subtextStyle: { fontSize: 11, color: '#64748b' } },
      series: [{ type: 'pie', radius: side ? ['50%', '72%'] : radius, center: [cx, cy], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2 }, data: data.map((d, i) => ({ ...d, itemStyle: { color: d.color || (colors || PALETTE)[i % PALETTE.length] } })) }],
    };
  },
  gauge({ value, min = 0, max = 100, name = '', unit = '', bands = [[0.6, '#16a34a'], [0.85, '#f59e0b'], [1, '#dc2626']], dec = 0, compact = false }) {
    return {
      series: [{
        type: 'gauge', min, max, startAngle: 210, endAngle: -30, radius: '92%', center: ['50%', '58%'],
        axisLine: { lineStyle: { width: compact ? 9 : 12, color: bands } }, pointer: { width: compact ? 3 : 4, length: '58%', itemStyle: { color: '#0f172a' } }, anchor: { show: true, size: compact ? 7 : 10, itemStyle: { color: '#0f172a' } },
        axisTick: { show: false }, splitLine: { show: !compact, length: 8, lineStyle: { color: '#fff', width: 2 } }, axisLabel: { show: !compact, color: '#94a3b8', fontSize: 10, distance: 16 },
        title: { offsetCenter: [0, '72%'], fontSize: 11, color: '#64748b' }, detail: { valueAnimation: true, offsetCenter: [0, '40%'], fontSize: compact ? 18 : 22, fontWeight: 700, color: '#0f172a', formatter: (v) => `${fmt.n(v, dec)}${unit}` },
        data: [{ value, name }],
      }],
    };
  },
  /** x, y labels; data [[xi, yi, v]] */
  heat({ x, y, data, min = 0, max, colors = ['#f0fdf4', '#fde68a', '#f97316', '#b91c1c'], label = false, grid, fmtv }) {
    return {
      grid: ch.grid({ top: 8, bottom: 40, ...grid }), tooltip: { position: 'top', formatter: (p) => `${esc(y[p.value[1]])} · ${esc(x[p.value[0]])}<br/><b>${fmtv ? fmtv(p.value[2]) : fmt.n(p.value[2], 1)}</b>` },
      xAxis: { type: 'category', data: x, splitArea: { show: false }, axisLabel: { color: '#64748b', fontSize: 10.5 } }, yAxis: { type: 'category', data: y, axisLabel: { color: '#475569', fontSize: 11 } },
      visualMap: { min, max: max ?? Math.max(...data.map((d) => d[2])), calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, itemWidth: 10, inRange: { color: colors }, textStyle: { color: '#64748b', fontSize: 10 } },
      series: [{ type: 'heatmap', data, label: { show: label, fontSize: 10, color: '#0f172a', formatter: (p) => (fmtv ? fmtv(p.value[2]) : fmt.n(p.value[2], 0)) }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,.2)' } } }],
    };
  },
};

/** Draws an ECharts option into el. Returns the instance; resizes with its box. */
const ITEM_TYPES = new Set(['pie', 'sunburst', 'treemap', 'heatmap', 'scatter', 'effectScatter', 'sankey', 'gauge', 'graph', 'radar', 'funnel', 'boxplot', 'tree', 'map', 'parallel', 'themeRiver', 'custom']);
const TIP_BASE = { show: true, appendToBody: true, confine: false, enterable: false, transitionDuration: 0.12, extraCssText: 'z-index:9999;border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.28);max-width:340px;white-space:normal;line-height:1.5;padding:8px 10px;' };
/** Every chart shows details on hover, and the hover box lives in <body> so a card, drawer or map edge never cuts it off. */
export function withHover(option) {
  if (!option || typeof option !== 'object') return option;
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  const itemish = series.length > 0 && series.every((x) => ITEM_TYPES.has(x.type));
  const t = option.tooltip;
  if (t === undefined || t === null) option.tooltip = { ...TIP_BASE, trigger: itemish ? 'item' : 'axis', axisPointer: itemish ? undefined : { type: series.some((x) => x.type === 'bar') ? 'shadow' : 'line', lineStyle: { color: '#94a3b8', type: 'dashed' }, shadowStyle: { color: 'rgba(148,163,184,.12)' } } };
  else if (Array.isArray(t)) option.tooltip = t.map((x) => ({ ...TIP_BASE, ...x, show: true }));
  else option.tooltip = { ...TIP_BASE, ...t, show: true };
  for (const x of series) if (x && x.emphasis === undefined && x.type !== 'gauge') x.emphasis = { focus: ITEM_TYPES.has(x.type) ? 'self' : 'series' };
  return option;
}
export async function drawChart(el, option, { theme = 'nx', onClick } = {}) {
  if (!el) return null;
  const echarts = await libs.echarts();
  if (!el.isConnected) return null;
  let inst = echarts.getInstanceByDom(el);
  if (!inst) {
    inst = echarts.init(el, theme, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst && !inst.isDisposed() && inst.resize());
    ro.observe(el);
    inst.__ro = ro;
  }
  inst.setOption(withHover({ animationDuration: 600, ...option }), true);
  if (onClick) { inst.off('click'); inst.on('click', onClick); }
  return inst;
}
function disposeChart(inst) { if (!inst || inst.isDisposed?.()) return; inst.__ro?.disconnect(); inst.dispose(); }

/* ================================================================== live tag bus */
// Every live value on screen is a tag: a mean-reverting random walk around its setpoint (or a function of time).
// Elements bind with data-live="TAG"; alarms are raised when a value crosses its H / HH / L / LL limits.
const TAGS = new Map();
const liveListeners = new Set();
const ALARMS = [];
let liveTimer = null;
let REPLAY = null; // while a calculated tag pre-fills its history, live.get returns inputs as they were at this index
let tickN = 0;
let gaussSpare = null;
function gauss() { if (gaussSpare != null) { const g = gaussSpare; gaussSpare = null; return g; } const u = Math.random() || 1e-9; const v = Math.random(); const r = Math.sqrt(-2 * Math.log(u)); gaussSpare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v); }

export const live = {
  /** spec: { v, base, noise, rev, min, max, dec, unit, h, hh, l, ll, fn(t, get), desc, eq } */
  define(tag, spec) {
    const cur = TAGS.get(tag);
    if (cur) { Object.assign(cur, spec, { v: cur.v, hist: cur.hist }); return cur; }
    const v0 = spec.v ?? spec.base ?? 0;
    const t = { base: v0, noise: Math.abs(v0) * 0.01 + 0.01, rev: 0.12, dec: 1, unit: '', ...spec, v: v0, hist: [], state: 'n', forced: null };
    if (t.fn) {
      // a calculated tag replays its inputs' recorded history, so its own strip chart starts populated, not flat
      for (let i = 0; i < 90; i += 1) { REPLAY = i; try { t.v = t.fn(i - 90, live.get); } catch { t.v = v0; } REPLAY = null; t.hist.push(t.v); }
    } else for (let i = 0; i < 90; i += 1) { step(t, i - 90); t.hist.push(t.v); }
    t.v = t.hist[t.hist.length - 1];
    TAGS.set(tag, t);
    return t;
  },
  defineMany(obj) { for (const [k, s] of Object.entries(obj)) live.define(k, s); },
  has: (tag) => TAGS.has(tag),
  get: (tag) => { const t = TAGS.get(tag); if (!t) return null; if (REPLAY != null && t.hist.length > REPLAY) return t.forced ?? t.hist[REPLAY]; return t.forced ?? t.v; },
  spec: (tag) => TAGS.get(tag),
  hist: (tag) => (TAGS.get(tag)?.hist ?? []).slice(),
  set(tag, v) { const t = TAGS.get(tag); if (t) { t.v = v; } },
  setBase(tag, b) { const t = TAGS.get(tag); if (t) t.base = b; },
  force(tag, v) { const t = TAGS.get(tag); if (t) t.forced = v; },
  text(tag) { const t = TAGS.get(tag); if (!t) return '—'; const v = t.forced ?? t.v; return t.fmt ? t.fmt(v) : fmt.n(v, t.dec); },
  state: (tag) => TAGS.get(tag)?.state ?? 'n',
  on(fn) { liveListeners.add(fn); return () => liveListeners.delete(fn); },
  alarms: () => ALARMS.slice(),
  start() { if (!liveTimer) liveTimer = setInterval(tick, 1000); },
  stop() { clearInterval(liveTimer); liveTimer = null; },
  paint: (root) => paintLive(root || document),
};
function step(t, n) {
  if (t.fn) { t.v = t.fn(n, live.get); return; }
  let v = t.v + (t.base - t.v) * t.rev + gauss() * t.noise;
  if (t.min != null) v = Math.max(t.min, v);
  if (t.max != null) v = Math.min(t.max, v);
  t.v = v;
}
function stateOf(t, v) {
  if (t.hh != null && v >= t.hh) return 'hh';
  if (t.ll != null && v <= t.ll) return 'll';
  if (t.h != null && v >= t.h) return 'h';
  if (t.l != null && v <= t.l) return 'l';
  return 'n';
}
function tick() {
  tickN += 1;
  const now = new Date();
  for (const [tag, t] of TAGS) {
    step(t, tickN);
    const v = t.forced ?? t.v;
    t.hist.push(v); if (t.hist.length > 180) t.hist.shift();
    const s = stateOf(t, v);
    if (s !== t.state) {
      if (s !== 'n' && (t.h != null || t.hh != null || t.l != null)) {
        ALARMS.unshift({ time: now.toTimeString().slice(0, 8), tag, state: s, text: `${t.desc || tag} ${s === 'hh' ? 'HIGH-HIGH' : s === 'll' ? 'LOW-LOW' : s === 'h' ? 'HIGH' : 'LOW'} ${live.text(tag)} ${t.unit}`.trim(), isNew: true });
        if (ALARMS.length > 200) ALARMS.pop();
      } else if (t.state !== 'n') {
        ALARMS.unshift({ time: now.toTimeString().slice(0, 8), tag, state: 'ev', text: `${t.desc || tag} returned to normal`, isNew: true });
      }
      t.state = s;
    }
  }
  paintLive(document);
  for (const fn of [...liveListeners]) { try { fn(tickN); } catch (e) { console.error(e); } }
  for (const a of ALARMS) a.isNew = false;
}
function paintLive(root) {
  for (const el of root.querySelectorAll('[data-live]')) {
    const tag = el.getAttribute('data-live');
    const t = TAGS.get(tag); if (!t) continue;
    const txt = live.text(tag);
    if (el.textContent !== txt) el.textContent = txt;
    if (el.classList) { el.classList.toggle('is-h', t.state === 'h' || t.state === 'l'); el.classList.toggle('is-hh', t.state === 'hh' || t.state === 'll'); }
  }
  for (const el of root.querySelectorAll('[data-live-w]')) { // bar width, percent of max
    const t = TAGS.get(el.getAttribute('data-live-w')); if (!t) continue;
    const max = Number(el.getAttribute('data-max')) || t.max || 100; el.style.width = `${clamp(((t.forced ?? t.v) / max) * 100, 0, 100)}%`;
  }
  for (const el of root.querySelectorAll('[data-live-lvl]')) { // svg tank level rect: data-y0 (bottom), data-h (full height)
    const t = TAGS.get(el.getAttribute('data-live-lvl')); if (!t) continue;
    const y0 = Number(el.getAttribute('data-y0')); const H = Number(el.getAttribute('data-h')); const max = Number(el.getAttribute('data-max')) || t.max || 100;
    const hh = clamp(((t.forced ?? t.v) / max) * H, 0, H); el.setAttribute('y', (y0 - hh).toFixed(1)); el.setAttribute('height', hh.toFixed(1));
  }
  for (const el of root.querySelectorAll('[data-live-run]')) { // rotating fan / pump: stops when value <= threshold
    const v = live.get(el.getAttribute('data-live-run')); el.classList.toggle('is-stop', !(v > Number(el.getAttribute('data-thr') || 0.5)));
  }
  for (const el of root.querySelectorAll('[data-live-flow]')) { // animated flow: speed by magnitude, direction by sign
    const tag = el.getAttribute('data-live-flow'); const v = live.get(tag); const ref = Number(el.getAttribute('data-ref')) || TAGS.get(tag)?.base || 1;
    const dead = !(Math.abs(v) > ref * 0.02);
    el.classList.toggle('is-dead', dead); el.classList.toggle('is-rev', v < 0);
    if (!dead) el.style.animationDuration = `${clamp(1.6 / (Math.abs(v) / Math.abs(ref || 1)), 0.35, 4).toFixed(2)}s`;
  }
}

/* ================================================================== overlays: tooltip, toast, drawer */
let tipEl; let toastsEl; let drawerEl; let scrimEl; let drawerCleanup = null;
function ensureOverlays() {
  if (tipEl) return;
  tipEl = document.createElement('div'); tipEl.className = 'nx-tip'; tipEl.id = 'tip'; document.body.appendChild(tipEl);
  toastsEl = document.createElement('div'); toastsEl.className = 'nx-toasts'; document.body.appendChild(toastsEl);
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || !el.getAttribute('data-tip') || el.closest('.nx-hmi-canvas')) { tipEl.style.display = 'none'; return; }
    tipEl.textContent = el.getAttribute('data-tip'); tipEl.style.display = 'block';
  });
  document.addEventListener('mousemove', (e) => {
    if (tipEl.style.display !== 'block') return;
    let x = e.clientX + 14; let y = e.clientY + 16;
    if (x + 290 > innerWidth) x = e.clientX - 290; if (y + 80 > innerHeight) y = e.clientY - 70;
    tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  });
}
export function toast(text, t = 'ok') {
  ensureOverlays();
  const el = document.createElement('div'); el.className = `nx-toast t-${t}`; el.innerHTML = `<i></i><span>${esc(text)}</span>`;
  toastsEl.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3200);
}
/**
 * drawer.open({ kicker, title, sub, icon, badges:[[text, tone]], body (html) | tabs:[{ name, body, mount }], actions:[{ label, primary, icon, onClick(close, el) }],
 *               wide, meta (footer note), mount(bodyEl, ctx) -> cleanup })
 * A floating side sheet: header with icon, title and status chips, optional in-panel tabs, a scrolling body of
 * section cards (.nx-sec), and a sticky action footer. It sizes to its content up to the window height.
 */
export const drawer = {
  open({ kicker = '', title, sub = '', body = '', actions = [], wide = false, mount, icon: ic, badges = [], tabs, meta = '' }) {
    drawer.close(true);
    scrimEl = document.createElement('div'); scrimEl.className = 'nx-scrim';
    drawerEl = document.createElement('aside'); drawerEl.className = `nx-drawer${wide ? ' is-wide' : ''}`; drawerEl.setAttribute('role', 'dialog'); drawerEl.setAttribute('aria-modal', 'true'); drawerEl.setAttribute('aria-label', title);
    const guess = ic || (/work order|WO-/i.test(`${kicker} ${title}`) ? 'clipboard' : /permit|PTW/i.test(`${kicker} ${title}`) ? 'key' : /crew|person|EMP-/i.test(`${kicker} ${title}`) ? 'users' : /tower|T-\d/i.test(`${kicker} ${title}`) ? 'tower' : /transformer|TX-/i.test(`${kicker} ${title}`) ? 'transformer' : /part|SKU|stock|damper|insulator/i.test(`${kicker} ${title}`) ? 'box' : /supplier|PO-|purchase/i.test(`${kicker} ${title}`) ? 'cart' : /finding|F-\d/i.test(`${kicker} ${title}`) ? 'camera' : /incident|hazard|safety/i.test(`${kicker} ${title}`) ? 'shield' : /\$|cost|budget/i.test(`${kicker} ${title}`) ? 'dollar' : 'doc');
    const tabBar = tabs?.length ? `<div class="nx-drawer-tabs" role="tablist">${tabs.map((t, i) => `<button type="button" data-dtab="${i}" class="${i ? '' : 'is-on'}">${esc(t.name)}</button>`).join('')}</div>` : '';
    drawerEl.innerHTML = `<div class="nx-drawer-h${tabBar ? '' : ' no-tabs'}"><div class="nx-drawer-top"><span class="nx-drawer-ico">${icon(guess)}</span><div class="nx-drawer-ttl"><small>${esc(kicker)}</small><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="nx-drawer-tools"><button type="button" class="nx-iconbtn" data-dwide title="${wide ? 'Narrow' : 'Expand'}" aria-label="Expand panel">${icon('layers')}</button><button type="button" class="nx-iconbtn nx-drawer-x" aria-label="Close">${icon('x')}</button></div></div>${badges.length ? `<div class="nx-drawer-badges">${badges.map(([t, tn]) => ui.badge(t, tn)).join('')}</div>` : ''}${tabBar}</div><div class="nx-drawer-b"></div><div class="nx-drawer-f"><span class="nx-drawer-meta">${icon('clock', 13)}${meta ? esc(meta) : `Updated ${new Date().toLocaleTimeString('en-GB')} · Esc to close`}</span>${actions.map((a, i) => `<button type="button" class="nx-btn${a.primary ? ' is-primary' : ''}${a.danger ? ' is-danger' : ''}" data-act="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}${actions.length ? '' : '<button type="button" class="nx-btn" data-dclose>Close</button>'}</div>`;
    document.body.append(scrimEl, drawerEl);
    requestAnimationFrame(() => { scrimEl.classList.add('is-on'); drawerEl.classList.add('is-on'); });
    scrimEl.addEventListener('click', () => drawer.close());
    drawerEl.querySelector('.nx-drawer-x').addEventListener('click', () => drawer.close());
    drawerEl.querySelector('[data-dclose]')?.addEventListener('click', () => drawer.close());
    drawerEl.querySelector('[data-dwide]').addEventListener('click', () => drawerEl.classList.toggle('is-wide'));
    drawerEl.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) actions[Number(b.dataset.act)].onClick?.(() => drawer.close(), drawerEl); });
    const bodyEl = drawerEl.querySelector('.nx-drawer-b');
    let ctx = null;
    const show = (html, m) => {
      ctx?.dispose(); bodyEl.innerHTML = html; bodyEl.scrollTop = 0; ctx = makeCtx(bodyEl);
      if (m) { const c = m(bodyEl, ctx); if (typeof c === 'function') ctx.cleanup(c); }
      paintLive(bodyEl);
    };
    drawerCleanup = () => ctx?.dispose();
    if (tabs?.length) {
      show(tabs[0].body, tabs[0].mount || mount);
      drawerEl.querySelector('.nx-drawer-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-dtab]'); if (!b) return; drawerEl.querySelectorAll('[data-dtab]').forEach((x) => x.classList.toggle('is-on', x === b)); const t = tabs[Number(b.dataset.dtab)]; show(t.body, t.mount); });
    } else show(body, mount);
    drawerEl.querySelector('.nx-drawer-x').focus();
    return drawerEl;
  },
  close(instant) {
    if (!drawerEl) return;
    drawerCleanup?.(); drawerCleanup = null;
    const d = drawerEl; const s = scrimEl; drawerEl = null; scrimEl = null;
    if (instant) { d.remove(); s.remove(); return; }
    d.classList.remove('is-on'); s.classList.remove('is-on'); setTimeout(() => { d.remove(); s.remove(); }, 260);
  },
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerEl && !document.body.classList.contains('fv-open')) drawer.close(); });

/* ================================================================== asset map */
// Display projection. The seed lays the network out at survey scale across the Absheron peninsula (part of the
// 500 kV line would run into the Caspian). On screen it is scaled about its centre and placed inside Baku city,
// so every module draws the same network on city streets. Only the drawing moves; the records keep their
// coordinates, which the linking rules and tests depend on.
const GEO = { c0: [40.459, 49.986], c1: [40.444, 49.882], k: 0.42 };
export const geo = {
  k: GEO.k,
  toMap: (lat, lng) => [GEO.c1[0] + (lat - GEO.c0[0]) * GEO.k, GEO.c1[1] + (lng - GEO.c0[1]) * GEO.k],
  fromMap: (lat, lng) => [GEO.c0[0] + (lat - GEO.c1[0]) / GEO.k, GEO.c0[1] + (lng - GEO.c1[1]) / GEO.k],
  BAKU: [[40.30, 49.66], [40.60, 50.12]],
};
const PJ = (lat, lng) => geo.toMap(lat, lng);
const PJc = (coords) => coords.map((c) => PJ(c[0], c[1]));
const BASES = {
  light: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri', 16, 'Light'],
  streets: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors', 19, 'Streets'],
  satellite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imagery &copy; Esri, Maxar', 19, 'Satellite'],
  dark: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'Tiles &copy; Esri', 16, 'Dark'],
};
/**
 * createMap(el, {
 *   layers: [{ id, name, color, shape:'circle'|'sq'|'dia'|'line', on, points:[{ id, lat, lng, color, size, shape, icon, pulse, label, tip, info }], lines:[{ id, coords, color, weight, dash, opacity, tip, info }], circles:[{ lat, lng, r, color, opacity }] }],
 *   legend: [{ label, color, line }], stats: [{ label, value, live }], base: 'light'|'streets'|'satellite'|'dark', fit: true, search: true, onSelect(item), panel: true
 * })
 * info: { kicker, title, sub, badges:[[text, tone]], fields:[[k, html]], spark:{ data, color, label }, html, actions:[{ label, primary, onClick(item) }] } or (item) => info
 */
export async function createMap(el, cfg) {
  el.classList.add('nx-map');
  el.innerHTML = `<div class="nx-map-canvas"></div><div class="nx-map-offline">Loading map…</div>`;
  // tiles are many external images: start them after the page's load event so they never hold it back
  if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
  let L;
  try { L = await libs.leaflet(); } catch { el.querySelector('.nx-map-offline').textContent = 'Map tiles are unavailable offline.'; return null; }
  if (!el.isConnected) return null;
  el.querySelector('.nx-map-offline').remove();
  const canvas = el.querySelector('.nx-map-canvas');
  const map = L.map(canvas, { zoomControl: false, attributionControl: true, preferCanvas: false, zoomSnap: 0.25, minZoom: 11, maxBounds: geo.BAKU, maxBoundsViscosity: 0.85 });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  let baseLayer = null;
  const setBase = (k) => { if (baseLayer) map.removeLayer(baseLayer); baseLayer = L.tileLayer(BASES[k][0], { attribution: BASES[k][1], maxNativeZoom: BASES[k][2], maxZoom: 19 }).addTo(map); baseLayer.bringToBack(); el.querySelectorAll('.nx-map-base button').forEach((b) => b.classList.toggle('is-on', b.dataset.base === k)); };

  const groups = new Map(); const index = new Map(); const bounds = [];
  let selected = null;
  const markerHtml = (p, layer) => {
    const size = p.size || 12; const shape = p.shape || layer.shape || 'circle';
    const cls = `nx-mk${shape === 'sq' ? ' is-sq' : shape === 'dia' ? ' is-dia' : ''}${p.pulse ? ' is-pulse' : ''}`;
    const inner = p.icon ? `<div class="nx-mk-ico" style="width:100%;height:100%">${icon(p.icon)}</div>` : '';
    return `<div class="${cls}" style="width:${size}px;height:${size}px;background:${p.color || layer.color};--pc:${p.color || layer.color}">${inner}</div>${p.label ? `<div class="nx-mk-label">${esc(p.label)}</div>` : ''}`;
  };
  for (const layer of cfg.layers || []) {
    const g = L.layerGroup(); groups.set(layer.id, { layer, group: g });
    for (const c of layer.circles || []) L.circle(PJ(c.lat, c.lng), { radius: c.r * GEO.k, color: c.color, weight: c.weight ?? 0, fillColor: c.color, fillOpacity: c.opacity ?? 0.18, interactive: false }).addTo(g);
    for (const ln of layer.lines || []) {
      const coords = PJc(ln.coords || []);
      const casing = ln.casing ? L.polyline(coords, { color: '#fff', weight: (ln.weight || 3) + 3, opacity: 0.85, interactive: false }).addTo(g) : null;
      const pl = L.polyline(coords, { color: ln.color || layer.color, weight: ln.weight || 3, opacity: ln.opacity ?? 0.95, dashArray: ln.dash, lineCap: 'round' }).addTo(g);
      if (ln.tip) pl.bindTooltip(ln.tip, { className: 'nx-maptip', sticky: true });
      if (ln.info) pl.on('click', () => select({ ...ln, _layer: layer }));
      if (ln.id) index.set(ln.id, { item: ln, layer, obj: pl, casing });
      if (layer.fit !== false) bounds.push(...coords);
    }
    for (const p of layer.points || []) {
      const size = p.size || 12;
      const mk = L.marker(PJ(p.lat, p.lng), { icon: L.divIcon({ className: '', html: markerHtml(p, layer), iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), riseOnHover: true, keyboard: false, zIndexOffset: p.z || 0 }).addTo(g);
      if (p.tip !== false) mk.bindTooltip(p.tip || p.label || p.id, { className: 'nx-maptip', direction: 'auto', offset: [0, -size / 2 - 2] });
      mk.on('click', () => select({ ...p, _layer: layer }));
      if (p.id) index.set(p.id, { item: p, layer, obj: mk });
      if (layer.fit !== false) bounds.push(PJ(p.lat, p.lng));
    }
    if (layer.on !== false) g.addTo(map);
  }

  // panels
  const layersPanel = cfg.panel === false ? '' : `<div class="nx-map-panel nx-map-layers">${cfg.search !== false ? `<label class="nx-map-search">${icon('search', 14)}<input type="search" placeholder="Find asset, crew, site…"/></label><div class="nx-map-hits"></div>` : ''}<h5>Layers <button type="button" data-fit>Fit all</button></h5>${(cfg.layers || []).filter((l) => !l.hidden).map((l) => `<label><input type="checkbox" data-layer="${esc(l.id)}" ${l.on !== false ? 'checked' : ''}/><i class="${l.shape === 'sq' ? 'is-sq' : l.shape === 'line' ? 'is-line' : ''}" style="background:${l.color}"></i>${esc(l.name)}<em>${l.count ?? (l.points?.length || l.lines?.length || '')}</em></label>`).join('')}${cfg.panelExtra || ''}</div>`;
  const legend = cfg.legend?.length ? `<div class="nx-map-panel nx-map-legend">${cfg.legend.map((g) => `<span><i class="${g.line ? 'is-line' : ''}" style="background:${g.color}"></i>${esc(g.label)}</span>`).join('')}</div>` : '';
  const stats = cfg.stats?.length ? `<div class="nx-map-panel nx-map-stat">${cfg.stats.map((s) => `<div><b${s.live ? ` data-live="${esc(s.live)}"` : ''}${s.color ? ` style="color:${s.color}"` : ''}>${esc(s.value)}</b><small>${esc(s.label)}</small></div>`).join('')}</div>` : '';
  el.insertAdjacentHTML('beforeend', `${layersPanel}<div class="nx-map-panel nx-map-base">${Object.keys(BASES).map((k) => `<button type="button" data-base="${k}">${BASES[k][3]}</button>`).join('')}</div><div class="nx-map-panel nx-map-info"></div>${legend}${stats}`);
  if (stats) { const st = el.querySelector('.nx-map-stat'); if (cfg.layers?.length && cfg.panel !== false) st.style.left = 'calc(50% + 60px)'; }
  setBase(BASES[cfg.base] ? cfg.base : 'light');
  const info = el.querySelector('.nx-map-info');

  function select(item, { fly = false } = {}) {
    if (selected?.obj?.getElement) selected.obj.getElement()?.querySelector('.nx-mk')?.classList.remove('is-sel');
    if (selected?.obj?.setStyle && selected.item) selected.obj.setStyle({ weight: selected.item.weight || 3 });
    const ent = item.id ? index.get(item.id) : null;
    selected = ent;
    if (ent?.obj?.getElement) ent.obj.getElement()?.querySelector('.nx-mk')?.classList.add('is-sel');
    if (ent?.obj?.setStyle) ent.obj.setStyle({ weight: (ent.item.weight || 3) + 3 });
    if (fly && ent) { if (ent.obj.getLatLng) map.flyTo(ent.obj.getLatLng(), Math.max(map.getZoom(), 14), { duration: 0.6 }); else map.flyToBounds(ent.obj.getBounds(), { padding: [60, 60], duration: 0.6 }); }
    const src = item.info ?? ent?.item.info;
    const d = typeof src === 'function' ? src(item) : src;
    cfg.onSelect?.(item);
    if (!d) { info.classList.remove('is-on'); return; }
    const sid = `ms${Math.random().toString(36).slice(2, 8)}`;
    info.innerHTML = `<div class="nx-map-info-h"><small>${esc(d.kicker || item._layer?.name || '')}</small><h4>${esc(d.title || item.label || item.id)}</h4>${d.sub ? `<p>${d.sub}</p>` : ''}<button type="button" class="nx-x" aria-label="Close">×</button></div><div class="nx-map-info-b">${d.badges?.length ? `<div class="nx-toolbar">${d.badges.map(([t, tn]) => ui.badge(t, tn)).join('')}</div>` : ''}${d.fields?.length ? ui.kv(d.fields) : ''}${d.spark ? `<div><div class="nx-note" style="margin-bottom:2px">${esc(d.spark.label || 'Trend')}</div><div class="nx-chart" style="height:${d.spark.height || 90}px" id="${sid}"></div></div>` : ''}${d.html || ''}${d.actions?.length ? `<div class="nx-map-info-acts">${d.actions.map((a, i) => `<button type="button" class="nx-btn is-sm${a.primary ? ' is-primary' : ''}" data-mact="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    info.classList.add('is-on');
    info.querySelector('.nx-x').onclick = () => { info.classList.remove('is-on'); if (selected?.obj?.getElement) selected.obj.getElement()?.querySelector('.nx-mk')?.classList.remove('is-sel'); if (selected?.obj?.setStyle) selected.obj.setStyle({ weight: selected.item.weight || 3 }); selected = null; };
    info.querySelectorAll('[data-mact]').forEach((b) => { b.onclick = () => d.actions[Number(b.dataset.mact)].onClick?.(item); });
    if (d.spark) {
      const s = d.spark;
      drawChart(info.querySelector(`#${sid}`), { grid: { left: 30, right: 6, top: 6, bottom: 18 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: s.x || s.data.map((_, i) => i + 1), axisLabel: { fontSize: 9 } }, yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 9 }, min: s.min, max: s.max }, series: [{ type: s.type || 'line', data: s.data, smooth: true, showSymbol: s.data.length < 12, lineStyle: { color: s.color || '#2563eb', width: 2 }, itemStyle: { color: s.color || '#2563eb' }, areaStyle: s.type === 'bar' ? undefined : { color: `${s.color || '#2563eb'}22` } }] });
    }
    paintLive(info);
  }

  el.addEventListener('change', (e) => {
    const id = e.target.getAttribute?.('data-layer'); if (!id) return;
    const g = groups.get(id); if (!g) return;
    if (e.target.checked) g.group.addTo(map); else map.removeLayer(g.group);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-base]'); if (b) setBase(b.dataset.base);
    if (e.target.closest('[data-fit]')) fit();
    const hit = e.target.closest('[data-hit]'); if (hit) { const ent = index.get(hit.dataset.hit); if (ent) { const g = groups.get(ent.layer.id); if (g && !map.hasLayer(g.group)) { g.group.addTo(map); const cb = el.querySelector(`[data-layer="${ent.layer.id}"]`); if (cb) cb.checked = true; } select({ ...ent.item, _layer: ent.layer }, { fly: true }); } el.querySelector('.nx-map-hits').innerHTML = ''; }
  });
  const sIn = el.querySelector('.nx-map-search input');
  if (sIn) {
    sIn.addEventListener('input', () => {
      const q = sIn.value.trim().toLowerCase(); const hits = el.querySelector('.nx-map-hits');
      if (q.length < 2) { hits.innerHTML = ''; return; }
      const found = [...index.values()].filter((e) => `${e.item.id} ${e.item.label || ''} ${e.item.search || ''}`.toLowerCase().includes(q)).slice(0, 7);
      hits.innerHTML = found.map((f) => `<button type="button" data-hit="${esc(f.item.id)}">${esc(f.item.label || f.item.id)}<small>${esc(f.layer.name)}</small></button>`).join('') || '<span class="nx-note" style="padding:4px 6px">No match</span>';
    });
  }
  el.querySelectorAll('.nx-map-panel').forEach((p) => { L.DomEvent.disableClickPropagation(p); L.DomEvent.disableScrollPropagation(p); });
  function fit() { if (cfg.center) map.setView(PJ(cfg.center[0], cfg.center[1]), cfg.zoom || 13); else if (bounds.length) {
    // keep the network clear of the floating panels: layers on the left, base switch / info card on the right
    const p = cfg.padding || [40, 40]; const narrow = el.clientWidth < 700;
    if (cfg.panel === false || narrow) map.fitBounds(bounds, { padding: p });
    else map.fitBounds(bounds, { paddingTopLeft: [Math.max(262, p[0]), Math.max(64, p[1])], paddingBottomRight: [Math.max(48, Math.min(p[0], 80)), Math.max(56, p[1])] });
  } }
  fit();
  let dead = false;
  setTimeout(() => { if (!dead) map.invalidateSize(); }, 60);
  let refit = true;
  const ro = new ResizeObserver(() => { if (dead || !el.isConnected) return; map.invalidateSize(); if (refit && el.clientHeight > 0) { refit = false; fit(); } }); ro.observe(el);
  return {
    map, L,
    select: (id) => { const ent = index.get(id); if (ent) select({ ...ent.item, _layer: ent.layer }, { fly: true }); },
    show: (id, on) => { const g = groups.get(id); if (!g) return; if (on) g.group.addTo(map); else map.removeLayer(g.group); const cb = el.querySelector(`[data-layer="${id}"]`); if (cb) cb.checked = on; },
    move: (id, lat, lng) => { const ent = index.get(id); if (ent?.obj?.setLatLng) ent.obj.setLatLng(PJ(lat, lng)); },
    project: PJ,
    restyle: (id, style) => { const ent = index.get(id); if (ent?.obj?.setStyle) ent.obj.setStyle(style); },
    fit,
    dispose: () => { if (dead) return; dead = true; ro.disconnect(); try { map.stop(); map.off(); map.remove(); } catch { /* already torn down */ } },
  };
}

/* ================================================================== HMI viewer */
// The HMI is light (ISA-101 grey canvas). Schematic markup written for the earlier dark canvas is remapped here,
// so symbols, readouts and module-specific drawings all follow the same light palette.
const LIGHT = { '#0e141d': '#ffffff', '#0b1119': '#ffffff', '#111823': '#ffffff', '#1a2330': '#ffffff', '#141c28': '#f8fafc', '#172131': '#f1f5f9', '#0a0e15': '#ffffff', '#0f1720': '#ffffff',
  '#cbd5e1': '#334155', '#e2e8f0': '#1e293b', '#f8fafc': '#0f172a', '#d6dee9': '#1e293b', '#9aa8bb': '#475569', '#9fb0c6': '#475569', '#94a3b8': '#64748b', '#8fa1ba': '#64748b', '#b8c4d6': '#475569', '#5b6b82': '#64748b',
  '#263244': '#cbd5e1', '#1f2a3a': '#d5dbe3', '#1b2534': '#dfe4ea', '#3a4658': '#cbd5e1', '#334155': '#cbd5e1', '#2b3a50': '#cbd5e1', '#475569': '#94a3b8',
  '#67e8f9': '#0b4f9c', '#22d3ee': '#0369a1', '#e2f3ff': '#ffffff', '#fca5a5': '#dc2626', '#f87171': '#dc2626', '#4ade80': '#16a34a', '#86efac': '#15803d', '#fbbf24': '#b45309', '#fcd34d': '#b45309', '#fde68a': '#a16207', '#93c5fd': '#1d4ed8', '#60a5fa': '#2563eb', '#a3e635': '#65a30d', '#7c8aa0': '#64748b', '#c4b5fd': '#6d28d9', '#a78bfa': '#7c3aed', '#5eead4': '#0f766e' };
const LIGHT_RE = new RegExp(Object.keys(LIGHT).join('|'), 'gi');
export const lightSvg = (str) => String(str ?? '').replace(LIGHT_RE, (m) => LIGHT[m.toLowerCase()] || m);
let hoverEl = null;
function hmiHover() { if (!hoverEl || !hoverEl.isConnected) { hoverEl = document.createElement('div'); hoverEl.className = 'nx-hmi-hover'; document.body.appendChild(hoverEl); } return hoverEl; }
function placeHover(h, e) { const w = h.offsetWidth || 220; const hh = h.offsetHeight || 80; let x = e.clientX + 16; let y = e.clientY + 14; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + hh > innerHeight - 8) y = e.clientY - hh - 12; h.style.left = `${Math.max(8, x)}px`; h.style.top = `${Math.max(8, y)}px`; }
export function hoverCard(e, { title, sub, desc, rows = [] }) {
  const h = hmiHover();
  h.innerHTML = `${sub ? `<small>${esc(sub)}</small>` : ''}<b>${esc(title)}</b>${desc ? `<p>${esc(desc.length > 160 ? `${desc.slice(0, 159)}…` : desc)}</p>` : ''}${rows.map(([k, v]) => `<div><span>${esc(k)}</span><em>${esc(v)}</em></div>`).join('')}`;
  h.style.display = 'block'; placeHover(h, e);
}
export function hideHover() { if (hoverEl) hoverEl.style.display = 'none'; }
/**
 * createHmi(el, {
 *   title, dno, rev, svg (inner markup), w, h,
 *   equipment: { [id]: { name, type, desc, tags:[{ tag, label }], switch?: true, kind:'cb'|'ds'|'es'|'pump'|'fan'|'valve' } },
 *   switches: { [id]: 'closed'|'open' },
 *   nets: { [name]: { requires:[switchIds], parent?: net, tags:[tags forced to 0 when dead] } },
 *   legend: [{ label, color }], alarmFilter(tag) -> bool, onSwitch(id, state, api)
 * })
 */
export function createHmi(el, cfg) { // eslint-disable-line no-param-reassign
  el.classList.add('nx-hmi');
  const W = cfg.w || 1200; const H = cfg.h || 700;
  const sw = { ...(cfg.switches || {}) };
  const tagsHere = new Set();
  for (const e of Object.values(cfg.equipment || {})) { for (const t of e.tags || []) tagsHere.add(t.tag); if (e.html) e.html = lightSvg(e.html); }
  cfg = { ...cfg, svg: lightSvg(cfg.svg), legend: cfg.legend?.map((l) => ({ ...l, color: lightSvg(l.color) })) };
  el.innerHTML = `<div class="nx-hmi-bar"><span class="nx-hmi-live"><span class="nx-dot is-pulse"></span>LIVE</span><b>${esc(cfg.title || '')}</b><span class="nx-hmi-dno">${esc(cfg.dno || '')}${cfg.rev ? ` · Rev ${esc(cfg.rev)}` : ''}</span><span class="nx-sp"></span>${cfg.toolbar || ''}<button type="button" data-z="in" title="Zoom in">＋</button><button type="button" data-z="out" title="Zoom out">－</button><button type="button" data-z="fit">Fit</button><span class="nx-hmi-clock"></span></div><div class="nx-hmi-canvas"><svg class="sx" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="sxgrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="sx-grid-dot"/></pattern><marker id="sxarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#475569"/></marker></defs><rect x="-2000" y="-2000" width="${W + 4000}" height="${H + 4000}" fill="url(#sxgrid)"/>${cfg.svg}</svg></div>${cfg.legend ? `<div class="nx-hmi-legend">${cfg.legend.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>` : ''}<div class="nx-hmi-face"></div>${cfg.alarms === false ? '' : '<div class="nx-hmi-alarms"></div>'}`;
  const svg = el.querySelector('svg'); const canvas = el.querySelector('.nx-hmi-canvas'); const face = el.querySelector('.nx-hmi-face'); const alarmsEl = el.querySelector('.nx-hmi-alarms');
  if (alarmsEl) canvas.style.bottom = '112px';
  let vb = { x: 0, y: 0, w: W, h: H };
  const applyVb = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const zoom = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => { const nw = clamp(vb.w * f, W * 0.2, W * 1.6); const k = nw / vb.w; vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: nw, h: vb.h * k }; applyVb(); };
  el.querySelector('.nx-hmi-bar').addEventListener('click', (e) => { const z = e.target.closest('[data-z]')?.dataset.z; if (z === 'in') zoom(0.8); if (z === 'out') zoom(1.25); if (z === 'fit') { vb = { x: 0, y: 0, w: W, h: H }; applyVb(); } });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y); void r; }, { passive: false });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.target.closest('.sx-hit')) return; drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; canvas.classList.add('is-drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const r = svg.getBoundingClientRect(); const s = Math.max(vb.w / r.width, vb.h / r.height); vb = { ...drag.vb, x: drag.vb.x - (e.clientX - drag.x) * s, y: drag.vb.y - (e.clientY - drag.y) * s }; applyVb(); });
  canvas.addEventListener('pointerup', () => { drag = null; canvas.classList.remove('is-drag'); });

  // switching state and energisation
  function paintSwitches() {
    for (const node of svg.querySelectorAll('[data-sw]')) {
      const id = node.getAttribute('data-sw'); const st = sw[id] ?? 'closed';
      node.classList.toggle('is-closed', st === 'closed'); node.classList.toggle('is-open', st !== 'closed');
      const blade = node.querySelector('.sx-dis-blade');
      if (blade) blade.setAttribute('transform', st === 'closed' ? '' : `rotate(${blade.getAttribute('data-open') || -32} ${blade.getAttribute('data-px')} ${blade.getAttribute('data-py')})`);
      const lab = node.querySelector('.sx-sw-st'); if (lab) lab.textContent = st === 'closed' ? 'CLOSED' : 'OPEN';
    }
    const alive = {};
    const isAlive = (n) => { if (n in alive) return alive[n]; const d = cfg.nets?.[n]; if (!d) return true; alive[n] = false; const ok = (d.requires || []).every((s) => (sw[s] ?? 'closed') === 'closed') && (!d.parent || (Array.isArray(d.parent) ? d.parent.some(isAlive) : isAlive(d.parent))); alive[n] = ok; return ok; };
    for (const n of Object.keys(cfg.nets || {})) {
      const ok = isAlive(n);
      svg.querySelectorAll(`[data-net="${n}"]`).forEach((x) => x.classList.toggle('is-dead', !ok));
      for (const t of cfg.nets[n].tags || []) live.force(t, ok ? null : 0);
    }
  }
  paintSwitches();

  let selId = null;
  let trend = null;
  let armed = null;
  function openFace(id) {
    const eq = cfg.equipment?.[id]; if (!eq) return;
    selId = id; armed = null;
    svg.querySelectorAll('.sx-hit.is-sel').forEach((n) => n.classList.remove('is-sel'));
    svg.querySelectorAll(`[data-eq="${id}"]`).forEach((n) => n.classList.add('is-sel'));
    const isSw = eq.switch;
    const st = sw[id] ?? 'closed';
    const isValve = eq.kind === 'valve'; const isMotor = /^(pump|fan|motor|compressor)$/.test(eq.kind || '');
    const word = (x) => (isMotor ? (x === 'closed' ? 'RUNNING' : 'STOPPED') : isValve ? (x === 'closed' ? 'OPEN' : 'CLOSED') : (x === 'closed' ? 'CLOSED' : 'OPEN'));
    const nextCmd = st === 'closed' ? 'open' : 'close';
    const cmdWord = isMotor ? (nextCmd === 'open' ? 'STOP' : 'START') : isValve ? (nextCmd === 'open' ? 'CLOSE' : 'OPEN') : nextCmd.toUpperCase();
    face.innerHTML = `<div class="nx-hmi-face-h"><small>${esc(id)} · ${esc(eq.type || '')}</small><h4>${esc(eq.name || id)}</h4>${eq.desc ? `<p>${esc(eq.desc)}</p>` : ''}<button type="button" class="nx-x" aria-label="Close">×</button></div><div class="nx-hmi-face-b">${isSw ? `<div class="nx-hmi-tags"><div><span>Position<small>${esc(id)}.POS</small></span><b style="color:${st === 'closed' ? '#dc2626' : '#16a34a'}">${word(st)}</b></div>${eq.interlock ? `<div><span>Interlock<small>${esc(eq.interlock)}</small></span><b style="color:#16a34a">OK</b></div>` : ''}</div>` : ''}${eq.tags?.length ? `<div class="nx-hmi-tags">${eq.tags.map((t) => { const sp = live.spec(t.tag); return `<div data-ft="${esc(t.tag)}"><span>${esc(t.label)}<small>${esc(t.tag)}${sp?.h != null ? ` · H ${sp.h}` : ''}${sp?.hh != null ? ` · HH ${sp.hh}` : ''}</small></span><b data-live="${esc(t.tag)}">${live.text(t.tag)}</b></div>`; }).join('')}</div><div class="nx-hmi-trend"></div>` : ''}${isSw ? `<div class="nx-hmi-ctl"><button type="button" data-cmd="${nextCmd}" data-word="${cmdWord}">Select ${cmdWord}</button></div><div class="nx-note" style="color:#64748b">Select-before-operate: select, then execute within 10 s. Simulation only — no command leaves this page.</div>` : ''}${eq.html || ''}</div>`;
    face.classList.add('is-on');
    face.querySelector('.nx-x').onclick = closeFace;
    for (const t of eq.tags || []) { const b = face.querySelector(`[data-ft="${CSS.escape(t.tag)}"] b`); if (b) { const s = live.state(t.tag); b.classList.toggle('is-h', s === 'h' || s === 'l'); b.classList.toggle('is-hh', s === 'hh' || s === 'll'); } }
    const tEl = face.querySelector('.nx-hmi-trend');
    disposeChart(trend); trend = null;
    if (tEl && eq.tags?.length) {
      const first = eq.tags.slice(0, 2);
      drawChart(tEl, trendOption(first)).then((inst) => { trend = inst; });
    }
    const cmd = face.querySelector('[data-cmd]');
    if (cmd) cmd.onclick = () => {
      const want = cmd.dataset.cmd;
      if (!armed) { armed = { want, at: Date.now() }; cmd.classList.add('is-arm'); cmd.textContent = `Execute ${cmd.dataset.word}`; setTimeout(() => { if (armed && Date.now() - armed.at >= 9900 && selId === id) openFace(id); }, 10000); return; }
      sw[id] = want === 'open' ? 'open' : 'closed';
      paintSwitches();
      ALARMS.unshift({ time: new Date().toTimeString().slice(0, 8), tag: `${id}.POS`, state: 'ev', text: `${eq.name || id} ${({ OPEN: 'OPENED', CLOSE: 'CLOSED', START: 'STARTED', STOP: 'STOPPED' })[cmd.dataset.word] || cmd.dataset.word} by operator (simulation)`, isNew: true });
      cfg.onSwitch?.(id, sw[id], api);
      paintAlarms();
      openFace(id);
    };
  }
  function trendOption(tags) {
    return { grid: { left: 34, right: 8, top: 18, bottom: 14 }, legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 10 }, itemWidth: 8, itemHeight: 8 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', show: false, data: live.hist(tags[0].tag).map((_, i) => i) }, yAxis: { type: 'value', scale: true }, series: tags.map((t) => ({ name: t.label, type: 'line', showSymbol: false, smooth: true, data: live.hist(t.tag).map((v) => +v.toFixed(2)), lineStyle: { width: 1.6 }, areaStyle: { opacity: 0.08 } })) };
  }
  function closeFace() { face.classList.remove('is-on'); selId = null; svg.querySelectorAll('.sx-hit.is-sel').forEach((n) => n.classList.remove('is-sel')); disposeChart(trend); trend = null; }
  svg.addEventListener('click', (e) => { const hit = e.target.closest('[data-eq]'); if (hit) { hideHover(); openFace(hit.getAttribute('data-eq')); } });
  // hover: name, type and live values of whatever is under the pointer
  svg.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('[data-eq]'); const eq = hit && cfg.equipment?.[hit.getAttribute('data-eq')];
    if (!eq || drag) { hideHover(); return; }
    const id = hit.getAttribute('data-eq');
    hoverCard(e, { title: eq.name || id, sub: `${id}${eq.type ? ` · ${eq.type}` : ''}`, desc: eq.desc, rows: [...(eq.switch ? [['Position', ((s) => (/^(pump|fan|motor|compressor)$/.test(eq.kind || '') ? (s === 'closed' ? 'RUNNING' : 'STOPPED') : eq.kind === 'valve' ? (s === 'closed' ? 'OPEN' : 'CLOSED') : (s === 'closed' ? 'CLOSED' : 'OPEN')))(sw[id] ?? 'closed')]] : []), ...(eq.tags || []).slice(0, 4).map((t) => [t.label, `${live.text(t.tag)} ${live.spec(t.tag)?.unit || ''}`.trim()]), ['', 'Click for faceplate & trend']].filter((r) => r[0] || r[1]) });
  });
  svg.addEventListener('mouseleave', hideHover);

  const filter = cfg.alarmFilter || ((tag) => tagsHere.has(tag) || /\.POS$/.test(tag) && !!cfg.equipment?.[tag.replace(/\.POS$/, '')]);
  function paintAlarms() {
    if (!alarmsEl) return;
    const rows = ALARMS.filter((a) => filter(a.tag)).slice(0, 30);
    alarmsEl.innerHTML = rows.length ? rows.map((a) => `<div class="t-${a.state === 'll' ? 'hh' : a.state}${a.isNew ? ' is-new' : ''}"><span>${a.time}</span><span>${a.state === 'hh' || a.state === 'll' ? 'ALARM' : a.state === 'h' || a.state === 'l' ? 'WARNING' : 'EVENT'}</span><span>${esc(a.text)}</span><span>${a.state === 'ev' ? '' : 'UNACK'}</span></div>`).join('') : '<div class="t-ev"><span>—</span><span>EVENT</span><span>No active alarms on this display. Values update every second from the simulated historian feed.</span><span></span></div>';
  }
  const clock = el.querySelector('.nx-hmi-clock');
  const off = live.on(() => {
    clock.textContent = new Date().toLocaleTimeString('en-GB');
    paintAlarms();
    if (selId && trend && !trend.isDisposed()) { const eq = cfg.equipment[selId]; trend.setOption(trendOption(eq.tags.slice(0, 2))); for (const t of eq.tags || []) { const b = face.querySelector(`[data-ft="${CSS.escape(t.tag)}"] b`); if (b) { const s = live.state(t.tag); b.classList.toggle('is-h', s === 'h' || s === 'l'); b.classList.toggle('is-hh', s === 'hh' || s === 'll'); } } }
  });
  clock.textContent = new Date().toLocaleTimeString('en-GB');
  paintAlarms(); paintLive(el);
  const api = {
    el, svg, open: openFace, close: closeFace, switches: sw,
    set: (id, st) => { sw[id] = st; paintSwitches(); },
    dispose: () => { off(); hideHover(); disposeChart(trend); for (const d of Object.values(cfg.nets || {})) for (const t of d.tags || []) live.force(t, null); },
  };
  return api;
}

/* ================================================================== tab context */
function makeCtx(root) {
  const cleanups = [];
  const charts = [];
  const ctx = {
    root,
    $: (sel) => root.querySelector(sel),
    $$: (sel) => [...root.querySelectorAll(sel)],
    cleanup: (fn) => cleanups.push(fn),
    /** chart('[data-chart=x]' | element, option, opts) -> Promise<instance> */
    chart(target, option, opts) { const el = typeof target === 'string' ? root.querySelector(target.startsWith('[') || target.startsWith('#') || target.startsWith('.') ? target : `[data-chart="${target}"]`) : target; return drawChart(el, option, opts).then((i) => { if (i) charts.push(i); return i; }); },
    map(target, cfg) { const el = typeof target === 'string' ? root.querySelector(target) : target; return createMap(el, cfg).then((m) => { if (m) cleanups.push(m.dispose); return m; }); },
    hmi(target, cfg) { const el = typeof target === 'string' ? root.querySelector(target) : target; const h = createHmi(el, cfg); cleanups.push(h.dispose); return h; },
    every(ms, fn) { const id = setInterval(fn, ms); cleanups.push(() => clearInterval(id)); return id; },
    onLive(fn) { cleanups.push(live.on(fn)); },
    on(type, sel, fn) { const h = (e) => { const t = e.target.closest?.(sel); if (t && root.contains(t)) fn(e, t); }; root.addEventListener(type, h); cleanups.push(() => root.removeEventListener(type, h)); },
    /** segmented control / chips change: fn(value, name) */
    onPick(name, fn) { ctx.on('click', `[data-seg="${name}"] button, [data-chips="${name}"] button`, (e, b) => { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); fn(b.dataset.v, name); }); },
    dispose() { for (const c of charts) disposeChart(c); charts.length = 0; while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } } },
  };
  return ctx;
}

/* generic table sort / filter (works for every .nx-table) */
function sortTable(th) {
  const table = th.closest('table'); const i = Number(th.dataset.sort); const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
  table.querySelectorAll('th').forEach((x) => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', dir);
  const tb = table.tBodies[0]; const rows = [...tb.rows];
  const val = (r) => { const c = r.cells[i]; const v = c?.getAttribute('data-v') ?? c?.textContent ?? ''; const n = Number(v); return v !== '' && !Number.isNaN(n) ? n : String(v).toLowerCase(); };
  rows.sort((a, b) => { const x = val(a); const y = val(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return dir === 'ascending' ? r : -r; });
  tb.append(...rows);
}

/* ================================================================== app shell */
const BRAND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4l16 16V4"/></svg>';
export const MODULES = [
  { code: '01', id: 'reliability', name: 'Asset Reliability Intelligence', href: '/reliability' },
  { code: '02', id: 'inspection', name: 'AI Inspection & Quality', href: '/dashboard' },
  { code: '03', id: 'operations', name: 'Field Operations Optimization', href: '/operations' },
  { code: '04', id: 'grid', name: 'Energy & Grid Performance', href: '/grid' },
  { code: '05', id: 'inventory', name: 'Supply Chain & Inventory', href: '/inventory' },
  { code: '06', id: 'forecast', name: 'Risk & Maintenance Forecasting', href: '/forecast' },
  { code: '07', id: 'finance', name: 'Financial Intelligence', href: '/finance' },
  { code: '08', id: 'workforce', name: 'Workforce & Safety', href: '/workforce' },
];

let APP = null;
/**
 * mountApp({ id, code, product, back, screens, asOf, searchIndex: () => [{ label, sub, run }] })
 * Returns { go(screenId, tabName), rerender() }.
 */
export function mountApp(app) {
  ensureOverlays();
  document.body.classList.add('nx-body');
  document.title = `${app.product} · NEXUS OS`;
  const key = `nx.nav.${app.id}`;
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { /* private mode */ }
  const qs = new URLSearchParams(location.search);
  let cur = Math.max(0, app.screens.findIndex((s) => s.id === (qs.get('screen') || saved.s)));
  let tabI = Number(qs.get('tab') ?? saved.t) || 0;
  if (!app.screens[cur]?.tabs[tabI]) tabI = 0;
  const collapsed = (() => { try { return localStorage.getItem('nx.rail') === '1'; } catch { return false; } })();

  const nav = app.screens.map((s, i) => `<button type="button" data-go="${i}" class="${i === cur ? 'is-on' : ''}" title="${esc(s.name)}" aria-label="${esc(s.name)}">${icon(s.icon)}<span>${esc(s.name)}</span>${s.count ? `<em class="nx-nav-count">${esc(s.count)}</em>` : ''}</button>`).join('');
  document.body.innerHTML = `<div class="nx-app shell${collapsed ? ' is-collapsed' : ''}"><aside class="nx-rail"><a class="nx-brand" href="/" aria-label="NEXUS OS home"><svg class="nx-logo" width="158" height="36" viewBox="0 0 158 36" role="img" aria-label="NEXUS OS"><text class="nx-word" x="0" y="27" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="-0.03em">NEXUS OS</text></svg></a><div class="nx-module"><small>Module ${esc(app.code)}</small><b title="${esc(app.product)}">${esc(app.product)}</b></div><nav class="nx-nav" aria-label="Application screens"><div class="nx-nav-label">Application screens</div>${nav}</nav><div class="nx-rail-foot"><button type="button" data-collapse>${icon('collapse')}<span>Collapse</span></button><a href="${esc(app.back || '/')}">${icon('back')}<span>Back to suite</span></a><button type="button" data-logout>${icon('logout')}<span>Log out</span></button></div></aside><header class="nx-top"><div class="nx-crumb"><small>NEXUS OS · Module ${esc(app.code)} · ${esc(app.product)}</small><h1 id="nx-title"></h1></div><div class="nx-top-spacer"></div><label class="nx-search">${icon('search', 15)}<input type="search" id="nx-gsearch" placeholder="Search towers, lines, work orders…" autocomplete="off"/><kbd>/</kbd></label><span class="nx-pill is-live" data-tip="Telemetry and records refresh every second from the simulated SCADA/EMS historian."><span class="nx-dot is-pulse"></span>Live · <span id="nx-clock" class="nx-num"></span></span><span class="nx-pill" data-tip="Records are scored as of this date.">${icon('calendar', 14)}As of ${esc(fmt.date(app.asOf || '2026-11-11'))}</span><button type="button" class="nx-iconbtn" id="nx-bell" aria-label="Alarms">${icon('bell')}<span class="nx-badge-dot" hidden></span></button><span class="nx-avatar" title="Signed in · Reliability engineer">RE</span></header><main class="nx-main"><div class="nx-tabs" id="tabs" role="tablist"></div><div class="nx-stage" id="stage"></div></main></div><div id="nx-gresults" class="nx-map-panel" style="position:fixed;display:none;z-index:70;width:360px;max-height:380px;overflow:auto;padding:6px"></div>`;

  document.body.append(tipEl, toastsEl); // the shell markup replaced the body; keep the shared overlays
  const shell = document.querySelector('.nx-app');
  const stage = document.getElementById("stage"); const tabsEl = document.getElementById("tabs"); const titleEl = document.getElementById('nx-title');
  let ctx = null;
  let legacyCleanup = null;

  function render() {
    try { sessionStorage.setItem(key, JSON.stringify({ s: app.screens[cur].id, t: tabI })); } catch { /* ignore */ }
    ctx?.dispose(); ctx = null;
    if (legacyCleanup) { try { legacyCleanup(); } catch { /* ignore */ } legacyCleanup = null; }
    drawer.close(true);
    const s = app.screens[cur]; const t = s.tabs[tabI];
    titleEl.textContent = s.name;
    tabsEl.innerHTML = s.tabs.map((x, i) => `<button type="button" role="tab" data-tab="${i}" class="${i === tabI ? 'is-on' : ''}" aria-selected="${i === tabI}">${x.icon ? icon(x.icon, 15) : ''}${esc(x.name)}</button>`).join('') + (s.note ? `<span class="nx-tabs-note">${s.note}</span>` : '');
    stage.className = `nx-stage${t.full ? ' is-full' : ''}${t.legacy ? ' is-legacy' : ''}`;
    stage.scrollTop = 0;
    ctx = makeCtx(stage);
    try {
      stage.innerHTML = t.render(ctx);
      paintLive(stage);
      if (t.mount) { const c = t.mount(stage, ctx); if (typeof c === 'function') { if (t.legacy) legacyCleanup = c; else ctx.cleanup(c); } }
    } catch (e) {
      console.error(e);
      stage.innerHTML = `<div class="nx-card" style="padding:24px">${ui.callout(`This view could not be drawn: ${esc(e.message)}`, 'crit', 'alert')}</div>`;
    }
  }
  document.querySelector('.nx-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    cur = Number(b.dataset.go); tabI = 0;
    document.querySelectorAll('[data-go]').forEach((x) => x.classList.toggle('is-on', x === b));
    render();
  });
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tabI = Number(b.dataset.tab); render(); });
  document.querySelector('[data-collapse]').addEventListener('click', () => { shell.classList.toggle('is-collapsed'); try { localStorage.setItem('nx.rail', shell.classList.contains('is-collapsed') ? '1' : '0'); } catch { /* ignore */ } });
  document.querySelector('[data-logout]').addEventListener('click', () => { try { localStorage.removeItem('nexus-session'); } catch { /* ignore */ } location.assign('/login/'); });
  // the NEXUS OS logo signs out (NEXUS session and the Module 02 server session) and returns to the homepage
  document.querySelector('.nx-brand').addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try { localStorage.removeItem('nexus-session'); } catch { /* ignore */ }
    let done = false;
    const go = () => { if (!done) { done = true; location.assign('/'); } };
    setTimeout(go, 1500);
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include', keepalive: true }).then(go, go);
  });

  // tables: sort + filter; legacy filter column (select -> rows by data-zone)
  stage.addEventListener('click', (e) => {
    const th = e.target.closest('.nx-table th[data-sort]'); if (th) sortTable(th);
    if (e.target.classList?.contains('clear-filters')) { const panel = e.target.closest('.screen'); if (panel) { panel.querySelectorAll('select').forEach((s) => { s.value = 'All'; }); applyCut(panel); } }
  });
  stage.addEventListener('input', (e) => {
    const sel = e.target.getAttribute?.('data-filter-table'); if (!sel) return;
    const q = e.target.value.trim().toLowerCase(); const table = stage.querySelector(sel); if (!table) return;
    for (const r of table.tBodies[0].rows) r.hidden = q && !r.textContent.toLowerCase().includes(q);
  });
  stage.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' && e.target.closest('.filter-col')) { const panel = e.target.closest('.screen'); if (panel) applyCut(panel); } });
  function applyCut(panel) {
    const chosen = [...panel.querySelectorAll('.filter-col select')].map((s) => s.value).filter((v) => v !== 'All');
    const banner = panel.querySelector('[data-banner]'); if (banner) banner.textContent = chosen.length ? chosen.join(' · ') : 'All corridors';
    let shown = 0; const rows = panel.querySelectorAll('tbody tr[data-zone]');
    rows.forEach((r) => { const z = r.getAttribute('data-zone') || ''; const ok = chosen.every((v) => z.indexOf(v) !== -1); r.hidden = !ok; if (ok) shown += 1; });
    const note = panel.querySelector('.empty-note'); if (note) note.classList.toggle('show', rows.length > 0 && shown === 0);
  }

  // global search
  const gIn = document.getElementById('nx-gsearch'); const gRes = document.getElementById('nx-gresults');
  let gItems = [];
  const placeRes = () => { const r = gIn.getBoundingClientRect(); gRes.style.top = `${r.bottom + 8}px`; gRes.style.left = `${Math.max(8, r.right - 360)}px`; };
  gIn.addEventListener('input', () => {
    const q = gIn.value.trim().toLowerCase();
    if (q.length < 2 || !app.searchIndex) { gRes.style.display = 'none'; return; }
    gItems = app.searchIndex().filter((x) => `${x.label} ${x.sub || ''}`.toLowerCase().includes(q)).slice(0, 12);
    gRes.innerHTML = gItems.length ? gItems.map((x, i) => `<button type="button" data-gi="${i}" style="display:flex;width:100%;gap:10px;align-items:center;border:0;background:none;padding:8px 10px;border-radius:8px;text-align:left"><span class="nx-li-ico" style="width:28px;height:28px">${icon(x.icon || 'search')}</span><span style="min-width:0"><b style="display:block;font-size:12.5px">${esc(x.label)}</b><span style="font-size:11.5px;color:var(--nx-muted)">${esc(x.sub || '')}</span></span></button>`).join('') : '<div class="nx-empty" style="padding:16px">No matches</div>';
    placeRes(); gRes.style.display = 'block';
  });
  gRes.addEventListener('mouseover', (e) => { const b = e.target.closest('[data-gi]'); gRes.querySelectorAll('[data-gi]').forEach((x) => { x.style.background = x === b ? '#eef4ff' : 'none'; }); });
  gRes.addEventListener('click', (e) => { const b = e.target.closest('[data-gi]'); if (!b) return; gRes.style.display = 'none'; gIn.value = ''; gItems[Number(b.dataset.gi)].run(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#nx-gresults') && e.target !== gIn) gRes.style.display = 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); gIn.focus(); } });

  // alarms bell
  const bell = document.getElementById('nx-bell');
  bell.addEventListener('click', () => {
    const rows = ALARMS.filter((a) => a.state !== 'ev').slice(0, 60);
    drawer.open({ kicker: 'Alarm & event summary', title: 'Active alarms', sub: 'Process alarms raised by the live tag bus on this workspace (ISA-18.2 priorities).', body: rows.length ? `<div class="nx-list">${rows.map((a) => ui.li({ ic: /hh|ll/.test(a.state) ? 'alert' : 'event', color: /hh|ll/.test(a.state) ? '#dc2626' : '#d97706', title: a.text, sub: `${a.time} · ${a.tag}`, end: ui.badge(/hh|ll/.test(a.state) ? 'Priority 1' : 'Priority 2', /hh|ll/.test(a.state) ? 'crit' : 'warn') })).join('')}</div>` : ui.empty('No active alarms. Every monitored value is inside its limits.') });
  });
  const clockEl = document.getElementById('nx-clock');
  const paintClock = () => { clockEl.textContent = new Date().toLocaleTimeString('en-GB'); bell.querySelector('.nx-badge-dot').hidden = !ALARMS.some((a) => a.state === 'hh' || a.state === 'll'); };
  paintClock(); live.on(paintClock); live.start();

  const go = (screenId, tabName) => {
    const i = app.screens.findIndex((s) => s.id === screenId); if (i < 0) return false;
    cur = i; tabI = 0;
    if (tabName != null) { const f = typeof tabName === 'number' ? tabName : app.screens[i].tabs.findIndex((t) => t.name === tabName); if (f >= 0) tabI = f; }
    document.querySelectorAll('[data-go]').forEach((x, p) => x.classList.toggle('is-on', p === i));
    render(); return true;
  };
  APP = { go, rerender: render, app };
  render();
  return APP;
}
export const nav = { go: (...a) => APP?.go(...a), rerender: () => APP?.rerender() };
