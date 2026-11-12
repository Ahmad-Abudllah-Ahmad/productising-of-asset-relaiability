// Trend charts for the Asset 360 panel, drawn with the vendored ECharts (reliability/js/vendor/echarts).
// ECharts is loaded on demand, the first time a chart is needed. Colours come from the page's CSS variables,
// so a theme change needs no chart code. If ECharts cannot be loaded, callers show the numbers as a table.

const SRC = '/reliability/js/vendor/echarts/echarts.min.js?v=5.6.0';
let loading = null;

/** @returns {Promise<any>} the echarts global */
export function loadECharts() {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.onload = () => (window.echarts ? resolve(window.echarts) : reject(new Error('ECharts loaded but did not register')));
      s.onerror = () => { loading = null; reject(new Error('ECharts could not be loaded')); };
      document.head.append(s);
    });
  }
  return loading;
}

/** Theme colours read from the element's CSS variables. */
export function palette(el) {
  const css = getComputedStyle(el);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#1b2430'), muted: v('--muted', '#667085'), line: v('--line', '#e4e7ec'), card: v('--card', '#ffffff'),
    blue: v('--blue', '#1f6feb'), green: v('--green', '#178a4c'), red: v('--red', '#d14343'), amber: v('--amber', '#b7791f'),
    band: { normal: v('--rel-band-normal', '#55c38a'), moderate: v('--rel-band-moderate', '#efc24a'), poor: v('--rel-band-poor', '#ef6a6a'), none: v('--rel-band-none', '#aab4c3') },
    stroke: v('--rel-shape-line', '#5f6a7b'),
    cond: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, v(`--rel-cond-${n}`, '#aab4c3')])),
  };
}

const GAS_COLORS = ['#1f6feb', '#0f766e', '#7c3aed', '#d97706', '#d14343', '#64748b'];
const GAS_NAMES = { h2: 'H2', ch4: 'CH4', c2h6: 'C2H6', c2h4: 'C2H4', c2h2: 'C2H2', co: 'CO' };
const base = (p) => ({ aria: { enabled: true }, textStyle: { color: p.muted, fontSize: 11 }, animation: false });

/** Health index over the campaign dates, with open findings as bars. */
export function historyOption(history, p) {
  const series = [{ name: 'Open findings', type: 'bar', yAxisIndex: 1, data: history.open, barMaxWidth: 26, itemStyle: { color: `${p.amber}55`, borderColor: p.amber } }];
  if (history.hasHi) {
    series.push({
      name: 'Health index', type: 'line', data: history.hi, symbolSize: 9, connectNulls: false, lineStyle: { width: 2.5, color: p.blue }, itemStyle: { color: p.blue },
      markLine: { silent: true, symbol: 'none', label: { color: p.muted, fontSize: 10, position: 'insideStartTop', formatter: ({ value }) => (value === 70 ? 'normal from 70' : 'poor below 40') }, lineStyle: { color: p.muted, type: 'dashed' }, data: [{ yAxis: 70 }, { yAxis: 40 }] },
    });
  }
  return {
    ...base(p), grid: { left: 38, right: 38, top: 34, bottom: 26 }, tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: p.muted }, data: series.map((s) => s.name) },
    xAxis: { type: 'category', data: history.labels, axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: [{ type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted }, show: history.hasHi }, { type: 'value', minInterval: 1, min: 0, max: Math.max(4, Math.max(...history.open, 0) * 2), splitLine: { show: false }, axisLabel: { color: p.muted } }],
    series,
  };
}

/** Dissolved gas concentrations over the samples, log scale because the gases differ by orders of magnitude. */
export function dgaOption(dga, p) {
  return {
    ...base(p), grid: { left: 46, right: 14, top: 40, bottom: 26 }, tooltip: { trigger: 'axis', valueFormatter: (x) => `${x} ppm` },
    legend: { top: 0, type: 'scroll', textStyle: { color: p.muted } },
    xAxis: { type: 'category', data: dga.samples.map((s) => s.date.slice(0, 7)), axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: { type: 'log', min: 0.1, name: 'ppm', nameTextStyle: { color: p.muted }, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series: dga.gases.map((g, i) => ({
      name: GAS_NAMES[g] ?? g, type: 'line', symbolSize: 6, lineStyle: { width: 2 }, itemStyle: { color: GAS_COLORS[i % GAS_COLORS.length] },
      data: dga.samples.map((s) => Math.max(s[g], 0.1)),
    })),
  };
}

/** Transformer loading, percent of rating, by month. */
export function loadingOption(loading, p) {
  return {
    ...base(p), grid: { left: 38, right: 14, top: 22, bottom: 26 }, tooltip: { trigger: 'axis', valueFormatter: (x) => `${x}%` },
    xAxis: { type: 'category', data: loading.labels, axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted, formatter: '{value}%' } },
    series: [{ name: 'Loading', type: 'line', data: loading.values, smooth: false, symbolSize: 5, areaStyle: { color: `${p.blue}22` }, lineStyle: { color: p.blue, width: 2 }, itemStyle: { color: p.blue } }],
  };
}

/**
 * Health index along a line (Line Health). x is the position along the line: towers at even positions, the span
 * after a tower at the odd position after it, so units.index is the x value. Towers are joined by a thin line and
 * each point takes its band's colour; spans are diamonds; units with no score sit on the baseline as grey rings.
 * Each point carries { id } so a click can open that asset.
 */
export function profileOption(view, p) {
  const n = view.units.length;
  const towers = view.towers;
  const step = Math.max(1, Math.ceil(towers.length / 14));
  const names = new Map(view.units.map((u) => [u.index, u.name]));
  const pt = (u) => ({ value: [u.index, u.hi], id: u.id, name: u.name, band: u.band, itemStyle: { color: p.band[u.band], borderColor: p.stroke, borderWidth: 1 } });
  const tip = (x) => {
    const d = x.data;
    return `<b>${d.name}</b><br/>${d.band === 'none' ? 'not assessed' : `health index ${d.value[1]} (${d.band})`}`;
  };
  return {
    ...base(p), grid: { left: 40, right: 16, top: 30, bottom: 30 }, tooltip: { trigger: 'item', formatter: tip },
    legend: { top: 0, textStyle: { color: p.muted }, data: ['Towers', 'Spans', 'Not assessed'] },
    xAxis: { type: 'value', min: 0, max: Math.max(n - 1, 1), interval: 2 * step, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: p.muted, hideOverlap: true, formatter: (v) => names.get(v) ?? '' } },
    yAxis: { type: 'value', min: 0, max: 100, name: 'Health index', nameTextStyle: { color: p.muted, align: 'left' }, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series: [
      { name: 'Towers', type: 'line', symbol: 'circle', symbolSize: 9, connectNulls: false, lineStyle: { width: 1.5, color: p.muted, opacity: 0.6 }, itemStyle: { color: p.band.normal },
        data: towers.map((u) => (u.assessed ? pt(u) : { value: [u.index, null] })),
        markLine: { silent: true, symbol: 'none', label: { color: p.muted, fontSize: 10, position: 'insideEndTop', formatter: ({ value }) => (value === 70 ? 'normal from 70' : 'poor below 40') }, lineStyle: { color: p.muted, type: 'dashed' }, data: [{ yAxis: 70 }, { yAxis: 40 }] } },
      { name: 'Spans', type: 'scatter', symbol: 'diamond', symbolSize: 9, data: view.spans.filter((u) => u.assessed).map(pt) },
      { name: 'Not assessed', type: 'scatter', symbol: 'circle', symbolSize: 9, itemStyle: { color: 'transparent', borderColor: p.band.none, borderWidth: 2 },
        data: view.units.filter((u) => !u.assessed).map((u) => ({ value: [u.index, 1], id: u.id, name: u.name, band: 'none', itemStyle: { color: 'transparent', borderColor: p.stroke, borderWidth: 1.5 } })) },
    ],
  };
}

/**
 * Health index of one asset (before and after each repair) or one line (at each campaign), on a time axis.
 * Hollow points are the day before a repair, filled points the day of it; dashed vertical lines are repairs.
 */
export function historyTrendOption(trend, model, p) {
  const bandColour = (hi) => (hi === null ? p.band.none : hi >= 70 ? p.band.normal : hi >= 40 ? p.band.moderate : p.band.poor);
  const pts = trend.points.filter((x) => x.hi !== null);
  const data = pts.map((x) => ({ value: [x.date, x.hi], kind: x.kind, repairId: x.repairId ?? null, itemStyle: { color: x.kind === 'before' ? p.card : bandColour(x.hi), borderColor: p.stroke, borderWidth: x.kind === 'before' ? 2 : 1 } }));
  const repairLines = trend.perRepair ? model.repairs.map((r) => ({ xAxis: r.date, label: { formatter: r.id, color: p.muted, fontSize: 9, position: 'insideEndTop', rotate: 90 }, lineStyle: { color: r.effective ? p.muted : p.band.poor, type: 'dashed' } })) : [];
  return {
    ...base(p), grid: { left: 40, right: 16, top: 34, bottom: 28 },
    tooltip: { trigger: 'item', formatter: (x) => `${x.data.value[0]}<br/>health index ${x.data.value[1]}${x.data.kind === 'before' ? ` (before ${x.data.repairId})` : x.data.kind === 'after' ? ` (after ${x.data.repairId})` : ''}` },
    xAxis: { type: 'time', min: model.range.from, max: model.range.to, axisLine: { lineStyle: { color: p.line } }, splitLine: { show: false }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', min: 0, max: 100, name: 'Health index', nameTextStyle: { color: p.muted, align: 'left' }, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series: [{ type: 'line', step: 'end', symbol: 'circle', symbolSize: 9, lineStyle: { width: 1.5, color: p.muted }, data,
      markLine: { silent: true, symbol: 'none', data: [{ yAxis: 70, label: { formatter: 'normal from 70', color: p.muted, fontSize: 10, position: 'insideStartTop' }, lineStyle: { color: p.muted, type: 'dotted' } }, { yAxis: 40, label: { formatter: 'poor below 40', color: p.muted, fontSize: 10, position: 'insideStartTop' }, lineStyle: { color: p.muted, type: 'dotted' } }, ...repairLines] } }],
  };
}

const mixWhite = (hex, k) => { const n = parseInt(hex.slice(1), 16); const m = (c) => Math.round(c + (255 - c) * k); return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`; };
const isDark = () => document.documentElement.dataset.relTheme === 'dark';
/** The "closed by a repair" tint of a severity colour: pale on light (a wash), clearly lighter than the solid colour on dark (a light tint). */
const closedTint = (hex) => (isDark() ? mixWhite(hex, 0.6) : alpha(hex, 0.42));
const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
const SEVERITY_WORD = { 1: 'critical', 2: 'serious', 3: 'moderate', 4: 'minor' };

/**
 * Maintenance History, fleet or line: findings per campaign as stacked bars by severity. Each severity has an open part
 * (solid) and a part closed by a repair (pale, dashed outline). The total sits above each bar.
 */
export function campaignFindingsOption(agg, p) {
  const names = agg.perCampaign.map((c) => c.name);
  const series = [];
  for (const n of [1, 2, 3, 4]) {
    series.push({ name: `${SEVERITY_WORD[n]} open`, type: 'bar', stack: 'f', barMaxWidth: 70, itemStyle: { color: p.cond[n], borderColor: p.stroke, borderWidth: 1 }, data: agg.perCampaign.map((c) => c.counts[n].open) });
    series.push({ name: `${SEVERITY_WORD[n]} closed by a repair`, type: 'bar', stack: 'f', barMaxWidth: 70, itemStyle: { color: closedTint(p.cond[n]), borderColor: isDark() ? '#ffffff' : p.cond[n], borderWidth: 1, borderType: 'dashed' }, data: agg.perCampaign.map((c) => c.counts[n].closed) });
  }
  series.push({ name: 'total', type: 'bar', stack: 'f', silent: true, tooltip: { show: false }, itemStyle: { color: 'transparent' }, data: agg.perCampaign.map(() => 0), label: { show: true, position: 'top', color: p.ink, fontWeight: 600, formatter: (x) => String(agg.perCampaign[x.dataIndex].total) } });
  return {
    ...base(p), grid: { left: 40, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (items) => {
      const i = items[0].dataIndex; const c = agg.perCampaign[i];
      return `<b>${c.name}</b> (${c.start} to ${c.end})<br/>${[1, 2, 3, 4].map((n) => `${SEVERITY_WORD[n]}: ${c.counts[n].open} open, ${c.counts[n].closed} closed by a repair`).join('<br/>')}<br/>${c.total} findings${c.rejected ? ` (${c.rejected} rejected, not counted)` : ''}`;
    } },
    xAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series,
  };
}

/** Work orders by month: raised and completed as small bars, and the open backlog at the end of each month as a line. */
export function workOrdersOption(agg, p) {
  const months = agg.perMonth.map((m) => m.month);
  return {
    ...base(p), grid: { left: 40, right: 16, top: 34, bottom: 28 }, tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: p.muted }, data: ['Raised', 'Completed', 'Open backlog'] },
    xAxis: { type: 'category', data: months, axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series: [
      { name: 'Raised', type: 'bar', barMaxWidth: 12, itemStyle: { color: p.blue }, data: agg.perMonth.map((m) => m.raised) },
      { name: 'Completed', type: 'bar', barMaxWidth: 12, itemStyle: { color: p.band.normal, borderColor: p.stroke, borderWidth: 1 }, data: agg.perMonth.map((m) => m.completed) },
      { name: 'Open backlog', type: 'line', symbolSize: 7, lineStyle: { width: 2.5, color: p.ink }, itemStyle: { color: p.ink }, data: agg.perMonth.map((m) => m.backlog) },
    ],
  };
}

/** Repairs by month; the ones where the defect came back are red. */
export function repairsMonthlyOption(agg, p) {
  return {
    ...base(p), grid: { left: 40, right: 16, top: 34, bottom: 28 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: p.muted }, data: ['Held so far', 'Ineffective (defect came back)'] },
    xAxis: { type: 'category', data: agg.perMonth.map((m) => m.month), axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series: [
      { name: 'Held so far', type: 'bar', stack: 'r', barMaxWidth: 28, itemStyle: { color: p.band.normal, borderColor: p.stroke, borderWidth: 1 }, data: agg.perMonth.map((m) => m.repairs) },
      { name: 'Ineffective (defect came back)', type: 'bar', stack: 'r', barMaxWidth: 28, itemStyle: { color: p.band.poor, borderColor: p.stroke, borderWidth: 1 }, data: agg.perMonth.map((m) => m.ineffective) },
    ],
  };
}

/**
 * Dashboard: towers and spans by health band at each campaign date and today. Each date has two bars side by side
 * (towers on the left, spans on the right), each stacked by band. A segment carries { cls, band } so a click can open the
 * registry on it. An empty bar tagged T or S above it names the stack.
 */
export function dashboardTrendOption(trend, p) {
  const BANDS = ['normal', 'moderate', 'poor', 'none'];
  const WORD = { normal: 'normal', moderate: 'moderate', poor: 'poor', none: 'not assessed' };
  const series = [];
  for (const [cls, key, tagLetter] of [['tower', 'towers', 'T'], ['span', 'spans', 'S']]) {
    for (const b of BANDS) {
      series.push({ name: `${cls} ${WORD[b]}`, type: 'bar', stack: cls, barMaxWidth: 46, barGap: '8%', itemStyle: { color: p.band[b], borderColor: p.stroke, borderWidth: 1, borderType: b === 'none' ? 'dashed' : 'solid' },
        emphasis: { focus: 'self' }, data: trend[key].map((c) => ({ value: c[b], cls: key, band: b })) });
    }
    series.push({ name: `${cls} label`, type: 'bar', stack: cls, silent: true, tooltip: { show: false }, itemStyle: { color: 'transparent' }, data: trend[key].map(() => 0), label: { show: true, position: 'top', color: p.muted, fontSize: 10, formatter: tagLetter } });
  }
  return {
    ...base(p), grid: { left: 40, right: 12, top: 18, bottom: 26 },
    tooltip: { trigger: 'item', formatter: (x) => {
      const d = x.data; const i = x.dataIndex; const noun = d.cls;
      const today = trend.dates[i] === trend.asOf;
      return `<b>${trend.labels[i]}</b> (${trend.dates[i]})<br/>${d.value} ${noun}: ${WORD[d.band]}<br/><span style="opacity:.75">${today ? 'Click to open the registry on this band' : `Click opens the registry on this band as of ${trend.asOf}`}</span>`;
    } },
    xAxis: { type: 'category', data: trend.labels, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.muted } },
    series,
  };
}

/**
 * Draw a chart into el. Returns { dispose } or throws if ECharts is unavailable.
 * The chart resizes with its container and is disposed with it.
 */
export async function drawChart(el, buildOption, { onClick } = {}) {
  const echarts = await loadECharts();
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption(buildOption(palette(el)));
  if (onClick) chart.on('click', onClick);
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(el);
  return { dispose() { observer.disconnect(); chart.dispose(); } };
}
