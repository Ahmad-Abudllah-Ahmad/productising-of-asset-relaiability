// Maintenance History screen on the NEXUS console: the same cards, tables and charts as the rest of Module 01, driven by
// maintenanceModel.js. One scope (line, asset) is shared by every tab and kept while you move between them:
//
//   Lifecycle      counts by month and campaign, the assets with the most activity; for one asset a row per defect
//                  (sightings, work orders, repairs) and its health index before and after each repair
//   Repairs        every repair with the health index just before and after, and whether the defect came back
//   Work orders    status, how long they took, and which are overdue
//   Open findings  findings no repair has closed, most severe first
//   Before / after the effect of repairs on the health index
//
// Findings open the finding drawer, work orders and repairs the work order drawer, assets Asset 360.

import { buildMaintenance, WO_STATUSES, SEV_FILTERS } from './maintenanceModel.js';

const SEV_C = { critical: '#dc2626', high: '#ea580c', medium: '#f59e0b', low: '#84cc16' };
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', completed: 'Completed' };
const STATUS_TONE = { open: 'warn', in_progress: 'info', completed: 'ok' };
const scope = { line: '', unit: '', show: '', status: '', sev: 'urgent' };

export function createHistoryScreen(net, d) {
  const { ui, ch, fmt, esc, nav, LINE_NAME, SEV_TONE, hiOn, woDrawer, findingDrawer, open360, bandColor } = d;
  const fnum = (x, dp = 1) => (x == null ? '–' : String(Math.round(x * 10 ** dp) / 10 ** dp));
  const dayWord = (x) => (x == null ? '–' : `${fnum(x)} day${x === 1 ? '' : 's'}`);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const link = (attr, id, text) => `<button type="button" class="nx-sub" style="display:inline;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer" ${attr}="${esc(id)}">${esc(text)}</button>`;
  const assetCell = (x) => `${link('data-asset', x.ownerId, x.ownerName)}${x.assetId !== x.ownerId ? `<span class="nx-sub">on ${esc(x.assetName)}</span>` : ''}`;

  const model = () => {
    let m = buildMaintenance(net, scope, hiOn);
    if (scope.unit && !m.units.some((u) => u.id === scope.unit)) { scope.unit = ''; m = buildMaintenance(net, scope, hiOn); }
    return m;
  };

  /* ---------- the shared scope bar */
  const select = (key, label, options, value) => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--nx-muted)">${esc(label)}<select class="nx-select" data-h="${key}" aria-label="${esc(label)}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  function scopeBar(m, kind) {
    const withH = m.units.filter((u) => u.events); const without = m.units.filter((u) => !u.events);
    const opt = (u) => `<option value="${esc(u.id)}"${u.id === scope.unit ? ' selected' : ''}>${esc(u.name)} · ${esc(u.class)}</option>`;
    const unitSel = `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--nx-muted)">Asset<select class="nx-select" data-h="unit" aria-label="Asset"><option value="">All assets</option><optgroup label="With a history (${withH.length})">${withH.map(opt).join('')}</optgroup>${without.length ? `<optgroup label="No history recorded (${without.length})">${without.map(opt).join('')}</optgroup>` : ''}</select></label>`;
    return `<div class="nx-toolbar" data-testid="hist-scope" style="margin-bottom:12px">${select('line', 'Line', [['', 'All lines'], ...net.lines.map((l) => [l.id, LINE_NAME[l.id] || l.id])], scope.line)}${unitSel}
      ${kind === 'repairs' ? select('show', 'Show', [['', 'All repairs'], ['ineffective', 'Ineffective only']], scope.show) : ''}
      ${kind === 'workorders' ? select('status', 'Status', [['', 'All statuses'], ...WO_STATUSES.map((s) => [s, STATUS_LABEL[s]]), ['overdue', 'Overdue']], scope.status) : ''}
      ${kind === 'findings' ? select('sev', 'Severity', SEV_FILTERS, scope.sev) : ''}
      <button type="button" class="nx-btn" data-hclear>Clear filters</button><span class="nx-sub" style="margin:0">Transformers have no line: they are listed under All lines.</span></div>`;
  }
  const head = (m) => `<p class="nx-sub" style="margin:0 0 10px" data-testid="hist-head"><b>${esc(m.unit ? net.byId.get(m.unit)?.name : m.line ? LINE_NAME[m.line] || m.line : 'All lines')}</b> · ${plural(m.findings.length, 'finding')} · ${plural(m.workOrders.length, 'work order')} · ${plural(m.repairs.length, 'repair')} up to ${esc(fmt.date(m.asOf))}</p>`;

  function kpis(m) {
    const t = m.turnaround; const c = m.statusCounts; const bad = m.ineffective.length;
    const sp = (k) => m.series.map((x) => x[k]);
    return ui.kpis([
      { label: 'Work orders', value: String(m.workOrders.length), icon: 'clipboard', tone: m.overdue ? 'warn' : 'info', sub: `${c.open} open · ${c.in_progress} in progress · ${c.completed} completed`, spark: sp('workOrders'), tip: `Work orders raised for the findings of this selection. ${m.overdue} are past their planned date and not done.` },
      { label: 'Finding to repair', value: t.medianDays == null ? '–' : fnum(t.medianDays), unit: t.medianDays == null ? '' : 'days', icon: 'clock', tone: 'violet', sub: t.findings ? `median of ${plural(t.findings, 'finding')} · mean ${fnum(t.meanDays)} · slowest ${t.maxDays}` : 'no repair yet', spark: sp('repairs'), tip: 'Days from the date a finding was recorded to the date of the repair that closed it.' },
      { label: 'Repairs', value: String(m.repairs.length), icon: 'wrench', tone: bad ? 'warn' : 'ok', sub: bad ? `${bad} ineffective · defect seen again` : m.repairs.length ? 'all held so far' : 'none yet', spark: sp('ineffective'), tip: 'A repair is ineffective when the defect it closed is sighted again afterwards.' },
      { label: 'Open findings', value: String(m.open), icon: 'camera', tone: m.overdue || m.unreviewed ? 'warn' : 'info', sub: `${m.unreviewed} unreviewed · ${plural(m.overdue, 'work order')} overdue`, spark: sp('open'), tip: 'Findings on this selection that no repair has closed. Rejected ones are left out.' },
    ]);
  }
  const emptyBlock = (m) => ui.card({ body: ui.empty(m.unit ? `No history for ${net.byId.get(m.unit)?.name}: no finding, work order or repair is recorded for it.` : 'Nothing recorded for this selection. Choose All lines, or press Clear filters.') });

  /* ---------- shared wiring: scope changes, clear, and the links in tables */
  function wire(ctx, kind) {
    ctx.on('change', 'select[data-h]', (e, s) => { const k = s.dataset.h; scope[k] = s.value; if (k === 'line') scope.unit = ''; nav.rerender(); });
    ctx.on('click', '[data-hclear]', () => { Object.assign(scope, { line: '', unit: '', show: '', status: '', sev: 'urgent' }); nav.rerender(); });
    ctx.on('click', '[data-asset]', (e, b) => { e.stopPropagation(); open360(b.dataset.asset); });
    ctx.on('click', '[data-finding]', (e, b) => { e.stopPropagation(); findingDrawer(b.dataset.finding); });
    ctx.on('click', '[data-pick]', (e, b) => { scope.unit = b.dataset.pick; nav.rerender(); });
    ctx.on('click', 'tr[data-wo]', (e, r) => { if (!e.target.closest('[data-asset],[data-finding],[data-pick]')) woDrawer(r.dataset.wo); });
    ctx.on('click', 'tr[data-find]', (e, r) => { if (!e.target.closest('[data-asset]')) findingDrawer(r.dataset.find); });
    return kind;
  }

  /* ---------- Lifecycle */
  function timelineBody(m) {
    if (m.empty) return emptyBlock(m);
    if (m.unit) return defectTimeline(m) + trendCard(m);
    const a = m.aggregate;
    const lines = net.lines.map((l) => l.id).filter((id) => !m.line || id === m.line);
    const programme = ui.card({ title: 'Campaigns and maintenance programme', sub: 'Aerial inspection campaigns and every work order of this selection, on one timeline', body: ui.gantt({ range: ['2026-01-01', '2026-12-31'], now: m.asOf, labelW: 220, rows: [
      { label: 'Aerial inspection', sub: 'RGB · thermal · LiDAR', bars: m.campaigns.map((c) => ({ start: c.start, end: c.end, color: '#0284c7', text: c.name, tip: `${c.name}: ${c.inspected_tower_ids?.length ?? 0} towers` })) },
      ...lines.map((l) => ({ label: LINE_NAME[l] || l, sub: `${m.workOrders.filter((w) => net.workOrders.find((x) => x.id === w.id)?.line === l).length} work orders`, bars: woBars(m, (w) => w.line === l) })),
      ...(m.line ? [] : [{ label: 'Substations', sub: 'Transformer work', bars: woBars(m, (w) => !w.line, '#7c3aed') }]),
    ] }) });
    return `<div class="nx-row nx-c12">${ui.card({ cls: 'nx-s8', title: 'Findings raised vs closed', sub: 'Monthly. Bars = new findings by severity; line = findings closed by repairs.', body: ui.chart('fc', 'lg') })}${ui.card({ cls: 'nx-s4', erp: ['SAP PM', 'workOrders'], title: 'Work by type', sub: 'All work orders, by status', body: ui.chart('wt', 'lg') })}</div>
      <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s6', title: 'Work orders', sub: 'Bars: raised and completed in the month. Line: work orders still open at the end of the month.', body: ui.chart('wom', 'md') })}${ui.card({ cls: 'nx-s6', title: 'Repairs per month', sub: 'Red: the defect it closed was sighted again afterwards.', body: ui.chart('rpm', 'md') })}</div>
      ${programme}${busiestCard(a)}`;
  }
  const woBars = (m, pick, color) => m.workOrders.map((w) => ({ w, raw: net.workOrders.find((x) => x.id === w.id) })).filter((x) => x.raw && pick(x.raw) && x.w.planned)
    .map(({ w }) => ({ id: w.id, start: w.created, end: w.completed || w.planned, color: color || (w.status === 'completed' ? '#16a34a' : w.status === 'in_progress' ? '#2563eb' : '#d97706'), text: '', tip: `${w.id} · ${w.type} · ${w.assetName} · ${STATUS_LABEL[w.status]}` }));

  function busiestCard(a) {
    return ui.card({ title: 'Most activity', sub: 'The ten assets with the most findings and work orders. Pick one to see its timeline: a row for each defect.', flush: true, body: ui.table({ id: 'busiest', rowId: (r) => r.id, rows: a.busiest, cols: [
      { label: 'Asset', sort: (r) => r.name, render: (r) => `${link('data-pick', r.id, r.name)}<span class="nx-sub">${esc(r.class)}${r.line ? ` · ${esc(r.line)}` : ''}</span>` },
      { label: 'Findings', align: 'r', sort: (r) => r.findings, render: (r) => r.findings }, { label: 'Work orders', align: 'r', sort: (r) => r.workOrders, render: (r) => r.workOrders },
      { label: 'Repairs', align: 'r', sort: (r) => r.repairs, render: (r) => r.repairs },
      { label: 'Repair result', sort: (r) => r.ineffective, render: (r) => (r.ineffective ? ui.badge(`${r.ineffective} came back`, 'crit') : '–') },
      { label: 'Open now', align: 'r', sort: (r) => r.open, render: (r) => r.open },
    ] }) });
  }

  function defectTimeline(m) {
    const sevBars = (x) => x.sightings.map((f) => ({ id: f.id, start: f.date, end: f.date, color: f.status === 'rejected' ? '#cbd5e1' : SEV_C[f.severity], text: '', tip: `${f.id} · ${f.label} · ${f.date} · ${f.severity}${f.status === 'rejected' ? ' · rejected' : f.closed ? ' · closed by a repair' : ''}${f.again ? ' · sighted again after a repair' : ''}` }));
    const rows = m.defects.map((x) => ({ label: x.component, sub: `${x.className}${x.cameBack ? ' · came back' : ''}`, bars: [
      ...x.workOrders.map((w) => ({ id: w.id, start: w.created, end: w.to, color: w.completed ? '#16a34a' : w.status === 'in_progress' ? '#2563eb' : '#d97706', text: '', tip: `${w.id} · ${w.type} · ${STATUS_LABEL[w.status]} · raised ${w.created}${w.completed ? `, completed ${w.completed}` : ', still open'}` })),
      ...x.repairs.map((r) => ({ id: r.id, start: r.date, end: r.date, color: r.effective ? '#0f766e' : '#dc2626', text: '◆', tip: `${r.id} · ${r.action} · ${r.date} · ${r.effective ? 'held so far' : 'the defect came back'}` })),
      ...sevBars(x),
    ] }));
    const key = ['critical', 'high', 'medium', 'low'].map((s) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><i style="width:9px;height:9px;border-radius:50%;background:${SEV_C[s]}"></i>${fmt.title(s)}</span>`).join('');
    return ui.card({ title: `Defects of ${net.byId.get(m.unit).name}, over time`, sub: 'A row per defect (component and class). Thin marks: sightings, coloured by severity. Wide bars: work orders, raised to completed. ◆ repair, red when the defect came back.', body: `<div class="nx-sub" style="margin-bottom:8px">${key}</div>${ui.gantt({ range: [`${m.range.from.slice(0, 7)}-01`, m.range.to], now: m.asOf, labelW: 220, rows })}` });
  }
  function trendCard(m) {
    if (!m.trend) return ui.card({ title: 'Health index', body: ui.empty('This asset has no health index of its own.') });
    return ui.card({ title: `Health index of ${m.trend.targetName}`, sub: m.trend.perRepair ? 'At each campaign, and the day before and the day of each repair (dashed). Scores use only evidence and repairs up to each date.' : 'At each campaign.', body: ui.chart('trend', 'lg') });
  }

  function mountTimeline(m, ctx) {
    wire(ctx, 'timeline');
    ctx.on('click', '.nx-gantt-bar[data-row]', (e, b) => {
      const id = b.dataset.row; if (!id) return;
      const rp = net.repairs.find((r) => r.repair_id === id);
      if (net.findingById.has(id)) findingDrawer(id); else woDrawer(rp ? rp.work_order_id : id);
    });
    if (m.empty) return;
    if (m.unit) {
      if (!m.trend) return;
      const pts = m.trend.points;
      ctx.chart('trend', { grid: ch.grid({ top: 30 }), tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: pts.map((p) => p.date), axisLabel: { fontSize: 10 } }, yAxis: { type: 'value', name: 'HI', min: 0, max: 100 },
        series: [{ type: 'line', name: 'Health index', connectNulls: true, symbol: 'circle', symbolSize: 9, lineStyle: { color: '#dc2626', width: 2.5 }, itemStyle: { color: '#dc2626' },
          data: pts.map((p) => (p.hi == null ? null : { value: +p.hi.toFixed(1), itemStyle: p.kind === 'before' ? { color: '#fff', borderColor: '#dc2626', borderWidth: 2 } : { color: p.kind === 'after' ? '#16a34a' : '#dc2626' } })),
          markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#94a3b8' }, label: { show: false }, data: pts.filter((p) => p.kind === 'after').map((p) => ({ xAxis: p.date })) } }] });
      return;
    }
    const a = m.aggregate;
    const labels = a.perMonth.map((x) => new Date(`${x.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
    const sevs = ['critical', 'high', 'medium', 'low'];
    ctx.chart('fc', { ...ch.bar({ x: labels, series: sevs.map((s) => ({ name: fmt.title(s), stack: 'f', color: SEV_C[s], data: a.perMonth.map((x) => m.findings.filter((f) => f.date.startsWith(x.month) && f.severity === s && !f.rejected).length) })), stack: true }),
      series: [...sevs.map((s) => ({ type: 'bar', name: fmt.title(s), stack: 'f', itemStyle: { color: SEV_C[s] }, data: a.perMonth.map((x) => m.findings.filter((f) => f.date.startsWith(x.month) && f.severity === s && !f.rejected).length) })), { type: 'line', name: 'Closed by repair', data: a.perMonth.map((x) => x.closedFindings), smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { color: '#0f172a', width: 2.5 }, itemStyle: { color: '#0f172a' } }] });
    const types = [...new Set(m.workOrders.map((w) => w.type))];
    ctx.chart('wt', ch.bar({ x: types.map(fmt.title), horizontal: true, stack: true, series: WO_STATUSES.map((s) => ({ name: STATUS_LABEL[s], color: { completed: '#16a34a', in_progress: '#2563eb', open: '#d97706' }[s], data: types.map((t) => m.workOrders.filter((w) => w.type === t && w.status === s).length) })), grid: { top: 30 } }));
    ctx.chart('wom', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: labels }, yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', name: 'Raised', itemStyle: { color: '#93c5fd' }, data: a.perMonth.map((x) => x.raised) }, { type: 'bar', name: 'Completed', itemStyle: { color: '#16a34a' }, data: a.perMonth.map((x) => x.completed) }, { type: 'line', name: 'Still open', smooth: true, symbol: 'circle', lineStyle: { color: '#0f172a', width: 2.5 }, itemStyle: { color: '#0f172a' }, data: a.perMonth.map((x) => x.backlog) }] });
    ctx.chart('rpm', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: labels }, yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', stack: 'r', name: 'Held so far', itemStyle: { color: '#16a34a' }, data: a.perMonth.map((x) => x.repairs) }, { type: 'bar', stack: 'r', name: 'Defect came back', itemStyle: { color: '#dc2626' }, data: a.perMonth.map((x) => x.ineffective) }] });
  }

  /* ---------- Repairs */
  const hiText = (r) => (r.hiBefore == null && r.hiAfter == null ? '–' : `${fnum(r.hiBefore)} → ${fnum(r.hiAfter)}`);
  function repairsBody(m) {
    const list = scope.show === 'ineffective' ? m.repairs.filter((r) => !r.effective) : m.repairs;
    if (!list.length) return ui.card({ body: ui.empty(scope.show ? 'No repair in this selection was followed by the same defect. Choose All repairs to see them.' : 'No repair is recorded for this selection.') });
    return ui.card({ erp: ['SAP PM', 'workOrders'], title: `Repair log (${list.length}${list.length !== m.repairs.length ? ` of ${m.repairs.length}` : ''})`, sub: 'The health index of the repaired asset the day before the repair and on the repair day. A repair is ineffective when the defect it closed is sighted again afterwards.', tools: ui.search('#rpt', 'Filter repairs…'), flush: true, body: ui.table({ id: 'rpt', rowId: (r) => r.workOrderId, rows: list, cols: [
      { key: 'date', label: 'Date', render: (r) => fmt.date(r.date) },
      { key: 'id', label: 'Repair', render: (r) => `<b>${esc(r.id)}</b><span class="nx-sub">${esc(fmt.title(r.action))} · ${esc(r.workOrderId)}</span>` },
      { label: 'Asset', sort: (r) => r.ownerName, render: assetCell },
      { label: 'Findings closed (days from finding)', sort: (r) => r.closes.length, render: (r) => r.closes.map((c) => `<div>${link('data-finding', c.id, c.id)} <span class="nx-sub" style="display:inline">${esc(c.label)} · ${c.days} d</span></div>`).join('') || '–' },
      { label: 'Health index before → after', align: 'r', sort: (r) => r.delta ?? -999, render: (r) => `${hiText(r)}${r.delta != null ? `<span class="nx-sub" style="color:${r.delta > 0 ? '#16a34a' : r.delta < 0 ? '#dc2626' : 'inherit'}">${r.delta > 0 ? '+' : ''}${r.delta}</span>` : ''}` },
      { label: 'Result', sort: (r) => (r.effective ? 0 : 1), render: (r) => (r.effective ? ui.badge('Held', 'ok') : `${ui.badge('Ineffective', 'crit')}${r.seenAgain.map((x) => `<span class="nx-sub">seen again ${link('data-finding', x.id, x.id)} ${esc(x.date)} (+${x.daysAfter} d)</span>`).join('')}`) },
    ] }) });
  }

  /* ---------- Work orders */
  function workOrdersBody(m) {
    const st = scope.status;
    const list = st === 'overdue' ? m.workOrders.filter((w) => w.overdue) : st ? m.workOrders.filter((w) => w.status === st) : m.workOrders;
    const t = m.turnaround;
    const summary = `${ui.stats(WO_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: String(m.statusCounts[s]) })).concat([{ label: 'Overdue', value: String(m.overdue), color: m.overdue ? '#dc2626' : undefined }]))}${ui.callout(`Completed work orders took a median of <b>${esc(dayWord(t.woMedianDays))}</b> (mean ${fnum(t.woMeanDays)}) from being raised to being completed. From finding to repair: median ${esc(dayWord(t.medianDays))}, slowest ${t.maxDays ?? '–'} days. ${plural(m.overdue, 'work order')} ${m.overdue === 1 ? 'is' : 'are'} past the planned date and not completed.`, 'info', 'clock')}`;
    if (!list.length) return `${summary}${ui.card({ body: ui.empty('No work order has this status in this selection.') })}`;
    return `${summary}${ui.card({ erp: ['SAP PM', 'workOrders'], title: `Work orders (${list.length}${list.length !== m.workOrders.length ? ` of ${m.workOrders.length}` : ''})`, tools: ui.search('#wot', 'Filter work orders…'), flush: true, body: ui.table({ id: 'wot', rowId: (w) => w.id, rows: list, cols: [
      { key: 'id', label: 'Work order', render: (w) => `<b>${esc(w.id)}</b>` },
      { label: 'Type', sort: (w) => w.type, render: (w) => `${esc(fmt.title(w.type))}<span class="nx-sub">${esc(w.priority)} priority</span>` },
      { label: 'Asset', sort: (w) => w.ownerName, render: assetCell },
      { label: 'Status', sort: (w) => w.status, render: (w) => `${ui.badge(STATUS_LABEL[w.status], STATUS_TONE[w.status])}${w.overdue ? ` ${ui.badge('Overdue', 'crit')}` : ''}` },
      { label: 'Raised', sort: (w) => w.created, render: (w) => fmt.date(w.created) }, { label: 'Planned', sort: (w) => w.planned || '', render: (w) => (w.planned ? fmt.date(w.planned) : '–') },
      { label: 'Completed', sort: (w) => w.completed || '', render: (w) => (w.completed ? fmt.date(w.completed) : '–') }, { label: 'Days open', align: 'r', sort: (w) => w.daysOpen, render: (w) => w.daysOpen },
      { label: 'Findings', sort: false, render: (w) => `${w.findingIds.slice(0, 3).map((id) => link('data-finding', id, id)).join(' ')}${w.findingIds.length > 3 ? ` +${w.findingIds.length - 3}` : ''}` },
      { label: 'Repair', sort: (w) => w.repairId || '', render: (w) => esc(w.repairId || '–') },
    ] }) })}`;
  }

  /* ---------- Open findings */
  function findingsBody(m) {
    const sev = scope.sev;
    const open = m.findings.filter((f) => f.counted);
    const list = open.filter((f) => (sev === 'all' ? true : sev === 'urgent' ? f.condition <= 2 : f.severity === sev)).sort((a, b) => a.condition - b.condition || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    if (!list.length) return ui.card({ body: ui.empty('No open finding has this severity in this selection.') });
    const camp = new Map(m.campaigns.map((c) => [c.campaign_id, c.name]));
    return ui.card({ title: `Open findings (${list.length}${list.length !== open.length ? ` of ${open.length}` : ''})`, sub: 'Findings no repair has closed and no reviewer has rejected, most severe first.', tools: ui.search('#oft', 'Filter findings…'), flush: true, body: ui.table({ id: 'oft', rowId: (f) => f.id, rows: list, cols: [
      { key: 'id', label: 'Finding', render: (f) => link('data-finding', f.id, f.id) },
      { label: 'Severity and class', sort: (f) => f.condition, render: (f) => `${ui.badge(fmt.title(f.severity), SEV_TONE[f.severity])} ${esc(f.label)}` },
      { label: 'Asset', sort: (f) => f.ownerName, render: assetCell },
      { label: 'Seen', sort: (f) => f.date, render: (f) => fmt.date(f.date) }, { label: 'Campaign', sort: (f) => f.campaignId, render: (f) => esc(camp.get(f.campaignId) || f.campaignId) },
      { label: 'Review', sort: (f) => f.status, render: (f) => (f.status === 'confirmed' ? ui.badge('Confirmed', 'ok') : ui.badge('Unreviewed', 'warn')) },
    ] }) });
  }

  /* ---------- Before / after */
  function beforeAfterBody(m) {
    return `<div class="nx-row nx-c2">${ui.card({ title: 'Health index before and after repair', sub: 'Repaired assets: HI the day before the repair vs the day of it', body: ui.chart('ba', 'lg') })}${ui.card({ title: 'Repair effect by work type', sub: 'Mean HI gain (points) per completed repair type', body: ui.chart('gain', 'lg') })}</div>
      <div class="nx-row nx-c12">${ui.card({ cls: 'nx-s4', title: 'Repair outcomes', sub: 'Did the defect stay fixed? Re-sighted = same class seen again on the same asset', body: ui.chart('out', 'md') })}${ui.card({ cls: 'nx-s4', title: 'Defect-to-repair time by work type', sub: 'Days from first sighting to completed repair (min · median · max)', body: ui.chart('ttr', 'md') })}${ui.card({ cls: 'nx-s4', title: 'Repeat defects', sub: 'Repairs whose defect came back: candidates for a design change, not another repair', flush: true, body: '<div data-rep></div>' })}</div>`;
  }
  function mountBeforeAfter(m, st, ctx) {
    wire(ctx, 'beforeafter');
    const scored = m.repairs.filter((r) => r.hiBefore != null && r.hiAfter != null);
    const uniq = [...new Map(scored.map((r) => [r.ownerId, r])).values()].slice(0, 18);
    ctx.chart('ba', { grid: ch.grid({ top: 30 }), legend: { top: 0, right: 0 }, tooltip: ch.tip({ axisPointer: { type: 'shadow' } }), xAxis: { type: 'category', data: uniq.map((r) => r.ownerName), axisLabel: { rotate: 40, fontSize: 10 } }, yAxis: { type: 'value', min: 0, max: 100, name: 'HI' },
      series: [{ type: 'bar', name: 'Before', data: uniq.map((r) => +r.hiBefore.toFixed(1)), itemStyle: { color: '#cbd5e1' } }, { type: 'bar', name: 'After', data: uniq.map((r) => ({ value: +r.hiAfter.toFixed(1), itemStyle: { color: bandColor(net.byId.get(r.ownerId) && (net.towerById.get(r.ownerId)?.band)) } })) }] });
    const by = {};
    for (const r of scored) (by[r.wo?.work_type || r.action] ||= []).push(r.hiAfter - r.hiBefore);
    const ent = Object.entries(by).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]);
    ctx.chart('gain', ch.bar({ x: ent.map((e) => fmt.title(e[0])), series: [{ name: 'Mean HI change', data: ent.map((e) => ({ value: +e[1].toFixed(1), itemStyle: { color: e[1] >= 0 ? '#16a34a' : '#dc2626' } })) }], horizontal: true, labels: true, grid: { top: 6, right: 40 } }));
    ctx.chart('out', ch.donut({ data: [{ name: 'Held so far', value: m.repairs.length - m.ineffective.length, color: '#16a34a' }, { name: 'Defect re-sighted', value: m.ineffective.length, color: '#dc2626' }], center: 'repairs' }));
    const types = [...new Set(m.workOrders.map((w) => w.type))];
    const woRaw = new Map(net.workOrders.map((w) => [w.id, w]));
    const stat = types.map((t) => { const v = m.workOrders.filter((w) => w.type === t && w.completed).map((w) => woRaw.get(w.id)?.ttrDays).filter((x) => x != null && x >= 0).sort((a, b) => a - b); return { t, min: v[0] ?? 0, med: v[Math.floor(v.length / 2)] ?? 0, max: v[v.length - 1] ?? 0, n: v.length }; }).sort((a, b) => b.med - a.med);
    ctx.chart('ttr', { grid: ch.grid({ top: 26 }), legend: { top: 0, right: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => { const s0 = stat[ps[0].dataIndex]; return `<b>${esc(fmt.title(s0.t))}</b> · ${s0.n} repairs<br/>min ${s0.min} d · median <b>${s0.med} d</b> · max ${s0.max} d`; } }, xAxis: { type: 'value', name: 'days' }, yAxis: { type: 'category', inverse: true, data: stat.map((x) => fmt.title(x.t)), axisLabel: { fontSize: 10.5 } },
      series: [{ type: 'bar', name: 'min', stack: 'r', itemStyle: { color: 'transparent' }, data: stat.map((x) => x.min) }, { type: 'bar', name: 'min → median', stack: 'r', itemStyle: { color: '#93c5fd', borderRadius: [4, 0, 0, 4] }, data: stat.map((x) => x.med - x.min) }, { type: 'bar', name: 'median → max', stack: 'r', itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] }, data: stat.map((x) => x.max - x.med) }] });
    st.querySelector('[data-rep]').innerHTML = ui.table({ id: 'rept', rowId: (r) => r.workOrderId, rows: m.ineffective, cols: [{ label: 'Repair', sort: (r) => r.id, render: (r) => `<b>${esc(r.id)}</b><span class="nx-sub">${fmt.date(r.date)}</span>` }, { label: 'Asset', sort: (r) => r.ownerName, render: assetCell }, { label: 'Action', sort: (r) => r.action, render: (r) => esc(fmt.title(r.action)) }], empty: 'No repeat defects: every repair has held.' });
    ctx.on('click', '#rept tr[data-row]', (e, r) => { if (!e.target.closest('[data-asset]')) woDrawer(r.dataset.row); });
  }

  /* ---------- the tabs */
  const tab = (name, icon, kind, body, mount) => ({
    name, icon,
    render: () => { const m = model(); return `<div class="nx-page">${scopeBar(m, kind)}${head(m)}${kpis(m)}${body(m)}</div>`; },
    mount: (st, ctx) => { const m = model(); (mount || ((mm, s, c) => wire(c, kind)))(m, st, ctx); },
  });
  return {
    id: 'history', name: 'Maintenance History', icon: 'history',
    tabs: [
      tab('Lifecycle', 'history', 'timeline', timelineBody, (m, st, ctx) => mountTimeline(m, ctx)),
      tab('Repairs', 'wrench', 'repairs', repairsBody, (m, st, ctx) => { wire(ctx, 'repairs'); ctx.on('click', '#rpt tr[data-row]', (e, r) => { if (!e.target.closest('[data-asset],[data-finding]')) woDrawer(r.dataset.row); }); }),
      tab('Work orders', 'clipboard', 'workorders', workOrdersBody, (m, st, ctx) => { wire(ctx, 'workorders'); ctx.on('click', '#wot tr[data-row]', (e, r) => { if (!e.target.closest('[data-asset],[data-finding]')) woDrawer(r.dataset.row); }); }),
      tab('Open findings', 'camera', 'findings', findingsBody, (m, st, ctx) => { wire(ctx, 'findings'); ctx.on('click', '#oft tr[data-row]', (e, r) => { if (!e.target.closest('[data-asset],[data-finding]')) findingDrawer(r.dataset.row); }); }),
      tab('Before / after', 'scale', 'beforeafter', beforeAfterBody, mountBeforeAfter),
    ],
  };
}
