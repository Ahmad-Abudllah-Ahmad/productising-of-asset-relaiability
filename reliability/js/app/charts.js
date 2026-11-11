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
 * Draw a chart into el. Returns { dispose } or throws if ECharts is unavailable.
 * The chart resizes with its container and is disposed with it.
 */
export async function drawChart(el, buildOption) {
  const echarts = await loadECharts();
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption(buildOption(palette(el)));
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(el);
  return { dispose() { observer.disconnect(); chart.dispose(); } };
}
