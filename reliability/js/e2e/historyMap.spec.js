// Maintenance History and the Risk Map on the repository data. Screenshots of both screens in both themes go to
// docs/screens/phase4b/. There is no network in the tests: map tiles are either blocked (the offline basemap) or answered
// with a plain generated tile, so the "tiles" pictures show a solid colour where a real basemap would be.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';

const SHOTS = 'docs/screens/phase4b';
fs.mkdirSync(SHOTS, { recursive: true });

const rail = (page) => page.locator('[data-go]');
const byId = (page, id) => page.getByTestId(id);
const panel = (page) => page.getByTestId('asset-panel');
const viewer = (page) => page.getByTestId('finding-viewer');
const hash = (page) => page.evaluate(() => location.hash);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const tab = (page, name) => page.locator('#tabs [data-tab]', { hasText: new RegExp(`^${name}$`) });

/** A 256 x 256 PNG of one colour, for tiles. */
function tilePng([r, g, b]) {
  const crc = (buf) => { let c; const t = []; for (let n = 0; n < 256; n += 1) { c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const byte of buf) x = t[(x ^ byte) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 256 }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: 256 }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const TILE = tilePng([214, 226, 214]);

async function open(page, url = '/reliability', { tiles = 'blocked' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  if (tiles === 'blocked') await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  if (tiles === 'ok') await page.route('**/tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const reopen = async (page, url, opts) => { const e = await open(page, url, opts); await page.reload(); await expect(rail(page).first()).toBeVisible(); return e; };
const history = async (page, query = '', tabName = 'Timeline', opts) => { const e = await reopen(page, `/reliability#view=history${query}`, opts); if (tabName !== 'Timeline') await tab(page, tabName).click(); await expect(byId(page, 'hl-head')).toBeVisible(); return e; };
const mapPage = async (page, query = '', opts) => { const e = await reopen(page, `/reliability#view=map${query}`, opts); await expect(byId(page, 'map')).toHaveAttribute('data-ready', 'true'); return e; };
const evalMap = (page, fn, arg) => page.evaluate(([src, a]) => { const m = document.querySelector('[data-testid="map"]').__map; return (0, eval)(`(${src})`)(m, a); }, [fn.toString(), arg]);

async function setTheme(page, want) { if ((await theme(page)) !== want) await byId(page, 'theme-toggle').click(); await expect.poll(() => theme(page)).toBe(want); }
async function both(page, name, height = 1300, ready) {
  await page.setViewportSize({ width: 1440, height });
  for (const t of ['light', 'dark']) {
    await setTheme(page, t);
    if (ready) await ready();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${name}-${t}.png` });
  }
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
}

// ======================================================================================== Maintenance History

test.describe('Maintenance History', () => {
  test('opens from the rail with three tabs, KPI cards, "Scores as of" and its selection in the URL', async ({ page }) => {
    const errors = await open(page);
    await rail(page).nth(5).click();
    await expect(page.locator('#app-title')).toContainText('Maintenance History');
    await expect(page.locator('#tabs [data-tab]')).toHaveText(['Timeline', 'Repairs', 'Work orders']);
    await expect(byId(page, 'findings-card')).toBeVisible();
    expect(await hash(page)).toBe('#view=history');
    await expect(byId(page, 'as-of')).toHaveText('Scores as of 2026-11-11');
    const kpis = byId(page, 'hl-kpis').locator('.kpi');
    await expect(kpis).toHaveCount(4);
    await expect(kpis.nth(0)).toContainText('127');
    await expect(kpis.nth(0)).toContainText('26 open · 16 in progress · 85 completed');
    await expect(kpis.nth(1)).toContainText('22.5 days');
    await expect(kpis.nth(2)).toContainText('85');
    await expect(kpis.nth(2)).toContainText('13 ineffective');
    await expect(kpis.nth(3)).toContainText('218');
    expect(errors).toEqual([]);
  });

  test('KPI subtitles say what they mean: ineffective repairs are red, overdue work orders amber, never green', async ({ page }) => {
    await history(page);
    const sub = (i) => byId(page, 'hl-kpis').locator('.kpi').nth(i).locator('.sub');
    await expect(sub(2)).toHaveClass(/sub-bad/);
    await expect(sub(0)).toHaveClass(/sub-warn/);
    await expect(sub(3)).toHaveClass(/sub-warn/);
    await history(page, '&unit=TWR-132-01-011');
    await expect(sub(2)).toHaveClass(/sub-ok/); // the one repair on T-011 held
  });

  test('fleet view: three charts and a table, and nothing drawn one by one', async ({ page }) => {
    await history(page);
    for (const c of ['findings', 'workorders', 'repairs']) await expect(byId(page, `${c}-chart`)).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.mh-dot, .mh-bar, .mh-diamond')).toHaveCount(0);
    await expect(byId(page, 'severity-legend').locator('span')).toHaveText(['critical', 'serious', 'moderate', 'minor']);
    const f = await byId(page, 'findings-chart').evaluate((el) => window.echarts.getInstanceByDom(el).getOption());
    expect(f.xAxis[0].data).toEqual(['2026 Q1', '2026 Q2', '2026 Q4']);
    const totals = [74, 119, 137];
    expect(f.series.some((x) => x.name === 'total')).toBe(true);
    const stacked = f.series.filter((x) => x.stack === 'f' && x.name !== 'total');
    expect(stacked).toHaveLength(8); // four severities, each open and closed by a repair
    for (let i = 0; i < 3; i += 1) expect(stacked.reduce((n, x) => n + x.data[i], 0)).toBe(totals[i]);
    const w = await byId(page, 'workorders-chart').evaluate((el) => window.echarts.getInstanceByDom(el).getOption().series.map((x) => [x.name, x.type, x.data.length]));
    expect(w).toEqual([['Raised', 'bar', 10], ['Completed', 'bar', 10], ['Open backlog', 'line', 10]]);
    const r = await byId(page, 'repairs-chart').evaluate((el) => window.echarts.getInstanceByDom(el).getOption().series.map((x) => [x.name, x.data.reduce((a, b) => a + b, 0)]));
    expect(r).toEqual([['Held so far', 72], ['Ineffective (defect came back)', 13]]);
    await expect(byId(page, 'busiest').locator('tbody tr')).toHaveCount(10);
    await expect(byId(page, 'busiest').locator('tbody tr').first()).toContainText('T-007');
    await expect(byId(page, 'timeline-key')).toHaveCount(0);
  });

  test('fleet view: the ineffective repairs are red in the chart, and the closed part of a bar is pale with a dashed outline', async ({ page }) => {
    await history(page);
    await expect(byId(page, 'repairs-chart')).toHaveAttribute('data-ready', 'true');
    const style = await byId(page, 'findings-chart').evaluate((el) => {
      const s = window.echarts.getInstanceByDom(el).getOption().series;
      return { open: s.find((x) => x.name === 'critical open').itemStyle, closed: s.find((x) => x.name === 'critical closed by a repair').itemStyle };
    });
    expect(style.closed.borderType).toBe('dashed');
    expect(style.closed.color).toMatch(/^rgba\(/);
    expect(style.open.color).toMatch(/^#/);
  });

  test('"Most activity": a click opens that asset\'s timeline, with its URL', async ({ page }) => {
    await history(page);
    await byId(page, 'busiest').locator('tbody tr').first().getByTestId('open-timeline').click();
    await expect(byId(page, 'timeline')).toBeVisible();
    await expect(byId(page, 'hl-head')).toContainText('T-007');
    expect(await hash(page)).toBe('#view=history&unit=TWR-500-01-007');
    await expect(byId(page, 'unit-select')).toHaveValue('TWR-500-01-007');
    await expect(byId(page, 'findings-chart')).toHaveCount(0);
  });

  test('clicking a finding opens the viewer, a work order or repair opens its asset', async ({ page }) => {
    await history(page, '&unit=TWR-132-01-011');
    await byId(page, 'timeline').locator('[data-finding="F-0308"]').click();
    await expect(viewer(page)).toBeVisible();
    expect(await hash(page)).toMatch(/^#finding=F-0308&view=history&unit=TWR-132-01-011$/);
    await page.keyboard.press('Escape');
    await byId(page, 'timeline').locator('[data-repair="RPR-0071"]').click();
    await expect(panel(page)).toContainText('TWR-132-01-011');
    await page.keyboard.press('Escape');
    await byId(page, 'timeline').locator('.mh-bar').first().click();
    await expect(panel(page)).toBeVisible();
  });

  test('one asset: its health index before and after the repair, drawn with ECharts', async ({ page }) => {
    await history(page, '&unit=TWR-132-01-011');
    await expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
    const pts = await byId(page, 'trend-chart').evaluate((el) => window.echarts.getInstanceByDom(el).getOption().series[0].data.map((d) => [d.value[0], d.value[1], d.kind]));
    expect(pts).toEqual([['2026-02-25', 34.6, 'campaign'], ['2026-05-27', 33.2, 'campaign'], ['2026-06-24', 33.2, 'before'], ['2026-06-25', 34.6, 'after'], ['2026-10-28', 34.6, 'campaign'], ['2026-11-11', 34.6, 'today']]);
  });

  test('a line: the same fleet charts for that line, and the busiest assets are on it', async ({ page }) => {
    await history(page, '&line=L-132-01');
    await expect(byId(page, 'findings-chart')).toHaveAttribute('data-ready', 'true');
    const sums = await byId(page, 'findings-chart').evaluate((el) => window.echarts.getInstanceByDom(el).getOption().series.filter((x) => x.stack === 'f' && x.name !== 'total').reduce((n, x) => n + x.data.reduce((a, b) => a + b, 0), 0));
    expect(sums).toBeLessThan(330);
    const rows = byId(page, 'busiest').locator('tbody tr');
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText('T-013');
    for (const t of await rows.locator('td:first-child .a360-muted').allInnerTexts()) expect(t).toContain('L-132-01');
  });

  test('one asset: a labelled row per defect, with sightings, the work order and the repair', async ({ page }) => {
    await history(page, '&unit=TWR-132-01-013');
    const rows = byId(page, 'timeline').locator('.mh-defect');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Earthwire damaged');
    const steel = rows.nth(1);
    await expect(steel.locator('.mh-dlabel')).toContainText('T-013');
    await expect(steel.locator('.mh-dlabel')).toContainText('Steel corrosion');
    await expect(steel.locator('.mh-dlabel .tag')).toHaveText('came back');
    await expect(steel.locator('.mh-dot')).toHaveCount(2);
    await expect(steel.locator('.mh-dot.is-again')).toHaveCount(1);
    await expect(steel.locator('.mh-bar')).toHaveCount(2);
    await expect(steel.locator('.mh-diamond.is-bad')).toHaveCount(1);
    await expect(steel.locator('.mh-diamond.is-ok')).toHaveCount(1);
    await expect(steel).toHaveClass(/is-bad/);
    await expect(rows.nth(2).locator('.mh-diamond.is-ok')).toHaveCount(1);
    await expect(rows.nth(2).locator('.mh-dot.is-closed')).toHaveCount(1);
    await expect(byId(page, 'severity-legend').locator('span')).toHaveCount(4);
    await expect(byId(page, 'timeline-key')).toContainText('Hollow: closed by a repair. Dashed: rejected.');
    await expect(byId(page, 'timeline-key')).toContainText('Diamond: repair');
    await expect(byId(page, 'timeline').locator('.mh-dot, .mh-bar, .mh-diamond').first()).toBeVisible();
    await expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
  });

  test('one asset: a rejected sighting is dashed, and rejecting from the viewer updates the row', async ({ page }) => {
    await history(page, '&unit=TWR-132-01-010');
    await expect(byId(page, 'timeline').locator('.mh-defect')).toHaveCount(1);
    await byId(page, 'timeline').locator('[data-finding="F-0090"]').click();
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('r');
    await viewer(page).getByTestId('reject-yes').click();
    await expect(viewer(page).getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(byId(page, 'timeline').locator('[data-finding="F-0090"]')).toHaveClass(/is-rejected/);
  });

  test('filters: line and asset narrow every tab, are kept in the URL, and survive a tab change and a reload', async ({ page }) => {
    await history(page);
    await byId(page, 'line-select').selectOption('L-132-01');
    await expect(byId(page, 'unit-select').locator('option')).toHaveCount(88); // all assets + the 87 towers and spans of the line
    expect(await hash(page)).toBe('#view=history&line=L-132-01');
    await expect(byId(page, 'busiest').locator('tbody tr').first()).toContainText('L-132-01');
    await byId(page, 'unit-select').selectOption('TWR-132-01-011');
    await expect(byId(page, 'hl-head')).toContainText('T-011');
    expect(await hash(page)).toBe('#view=history&line=L-132-01&unit=TWR-132-01-011');
    await tab(page, 'Repairs').click();
    await expect(byId(page, 'hl-head')).toContainText('T-011');
    await expect(byId(page, 'repairs').locator('tbody tr')).toHaveCount(1);
    expect(await hash(page)).toBe('#view=history&line=L-132-01&unit=TWR-132-01-011');
    await page.reload();
    await expect(byId(page, 'hl-head')).toContainText('T-011');
    await byId(page, 'line-select').selectOption('');
    await expect(byId(page, 'unit-select')).toHaveValue('');
    await byId(page, 'clear-filters').click();
    expect(await hash(page)).toBe('#view=history');
  });

  test('a unit that is not on the chosen line is dropped from the URL', async ({ page }) => {
    await history(page, '&line=L-220-03&unit=TWR-132-01-011');
    expect(await hash(page)).toBe('#view=history&line=L-220-03');
  });

  test('Repairs: every repair with the health index before and after, and whether it held', async ({ page }) => {
    await history(page, '', 'Repairs');
    await expect(byId(page, 'repairs').locator('tbody tr')).toHaveCount(85);
    await expect(byId(page, 'repairs').locator('tbody tr.is-bad')).toHaveCount(13);
    await history(page, '&unit=TWR-132-01-011', 'Repairs');
    const row = byId(page, 'repairs').locator('tr[data-repair="RPR-0071"]');
    await expect(row.getByTestId('hi-change')).toContainText('33.2 → 34.6');
    await expect(row.getByTestId('hi-change')).toContainText('+1.4');
    await expect(row).toContainText('held');
    await expect(row).toContainText('F-0100');
  });

  test('Repairs: "Ineffective only" shows the repairs where the defect came back, with the later sighting', async ({ page }) => {
    await history(page, '', 'Repairs');
    await byId(page, 'show-select').selectOption('ineffective');
    expect(await hash(page)).toBe('#view=history&show=ineffective');
    const rows = byId(page, 'repairs').locator('tbody tr');
    await expect(rows).toHaveCount(13);
    await expect(rows.first()).toContainText('ineffective');
    await expect(rows.first()).toContainText('seen again');
    await rows.first().locator('td').last().locator('button').first().click();
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(byId(page, 'repairs-card')).toContainText('Repairs (13 of 85)');
  });

  test('Work orders: status counts, turnaround, overdue ones flagged, and a status filter', async ({ page }) => {
    await history(page, '', 'Work orders');
    await expect(byId(page, 'status-bar').locator('[data-status="open"]')).toContainText('26 open');
    await expect(byId(page, 'status-bar').locator('[data-status="in_progress"]')).toContainText('16 in progress');
    await expect(byId(page, 'status-bar').locator('[data-status="completed"]')).toContainText('85 completed');
    await expect(byId(page, 'turnaround')).toContainText('median of 24 days');
    await expect(byId(page, 'turnaround')).toContainText('median 22.5 days');
    await expect(byId(page, 'turnaround')).toContainText('26 work orders are past the planned date');
    await expect(byId(page, 'workorders').locator('tbody tr')).toHaveCount(127);
    await expect(byId(page, 'workorders').locator('.tag.r', { hasText: 'overdue' })).toHaveCount(26);
    await byId(page, 'status-select').selectOption('in_progress');
    await expect(byId(page, 'workorders').locator('tbody tr')).toHaveCount(16);
    expect(await hash(page)).toBe('#view=history&status=in_progress');
    await byId(page, 'workorders').locator('tbody tr').first().locator('.a360-link').first().click();
    await expect(panel(page)).toBeVisible();
  });

  test('an asset with no history: it is offered in its own group, and says why there is nothing to show', async ({ page }) => {
    await history(page, '&line=L-132-01&unit=TWR-132-01-041');
    expect(await hash(page)).toBe('#view=history&line=L-132-01&unit=TWR-132-01-041');
    await expect(byId(page, 'history-empty')).toContainText('No history for T-041');
    await expect(byId(page, 'history-empty')).toContainText('installed on 2026-11-02');
    await expect(byId(page, 'history-empty')).toContainText('no inspection campaign has flown it yet');
    await expect(byId(page, 'unit-select').locator('optgroup').nth(1)).toHaveAttribute('label', /No history recorded/);
    await expect(byId(page, 'unit-select')).toHaveValue('TWR-132-01-041');
    await expect(page.locator('.mh-dot')).toHaveCount(0);
  });

  test('a reviewer decision elsewhere changes the numbers: reject F-0090 and T-010 has one open finding fewer', async ({ page }) => {
    await history(page, '&unit=TWR-132-01-010');
    await expect(byId(page, 'hl-kpis').locator('.kpi').nth(3)).toContainText('1');
    await byId(page, 'timeline').locator('[data-finding="F-0090"]').click();
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('r');
    await viewer(page).getByTestId('reject-yes').click();
    await expect(viewer(page).getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(byId(page, 'hl-kpis').locator('.kpi').nth(3).locator('.n')).toHaveText('0');
    await expect(byId(page, 'timeline').locator('[data-finding="F-0090"]')).toHaveClass(/is-rejected/);
  });

  test('loading and error states', async ({ page }) => {
    await reopen(page, '/reliability?healthdelay=1500#view=history');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await expect(byId(page, 'findings-card')).toBeVisible();
    await page.goto('/reliability?healthfail=1#view=history');
    await page.reload();
    await expect(byId(page, 'hl-error')).toContainText('Could not load the maintenance history');
    await byId(page, 'hl-retry').click();
    await expect(byId(page, 'findings-card')).toBeVisible();
  });

  test('screenshots, both themes: the timeline of the fleet, of one line, of a busy asset, of an asset with an ineffective repair, of an asset with no history', async ({ page }) => {
    const charts = async () => { for (const c of ['findings', 'workorders', 'repairs']) await expect(byId(page, `${c}-chart`)).toHaveAttribute('data-ready', 'true'); };
    await history(page);
    await both(page, 'history-timeline-fleet', 1650, charts);
    await history(page, '&line=L-132-01');
    await both(page, 'history-timeline-line', 1650, charts);
    await history(page, '&unit=TWR-132-01-013');
    await both(page, 'history-timeline-busy-asset', 1150, () => expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true'));
    await history(page, '&unit=TWR-500-01-003');
    await both(page, 'history-timeline-ineffective-repair', 1150, () => expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true'));
    await history(page, '&line=L-132-01&unit=TWR-132-01-041');
    await both(page, 'history-timeline-no-history', 800);
  });

  test('screenshots, both themes: repairs (all, and ineffective only), work orders', async ({ page }) => {
    await history(page, '&line=L-220-03', 'Repairs');
    await both(page, 'history-repairs', 1100);
    await byId(page, 'show-select').selectOption('ineffective');
    await both(page, 'history-repairs-ineffective', 1000);
    await history(page, '&line=L-220-03', 'Work orders');
    await both(page, 'history-workorders', 1100);
  });

  test('screenshots, both themes: loading, error, and a finding opened from the timeline', async ({ page }) => {
    await reopen(page, '/reliability?healthdelay=60000#view=history');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await both(page, 'history-loading', 900);
    await page.goto('/reliability?healthfail=1#view=history');
    await page.reload();
    await expect(byId(page, 'hl-error')).toBeVisible();
    await both(page, 'history-error', 900);
    await history(page, '&unit=TWR-132-01-011');
    await byId(page, 'timeline').locator('[data-finding="F-0308"]').click();
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page).getByTestId('stage-rgb')).toHaveAttribute('data-ready', 'true');
    for (const t of ['light', 'dark']) {
      await page.evaluate((want) => { if ((document.documentElement.dataset.relTheme ?? 'light') !== want) document.getElementById('rel-theme').click(); }, t);
      await expect.poll(() => theme(page)).toBe(t);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/history-finding-viewer-${t}.png` });
    }
  });
});

// ============================================================================================== Risk Map

test.describe('Risk Map', () => {
  test('opens from the rail: KPI cards, "Scores as of", layers and the map', async ({ page }) => {
    const errors = await open(page);
    await rail(page).nth(4).click();
    await expect(page.locator('#app-title')).toContainText('Risk Map');
    await expect(byId(page, 'map')).toHaveAttribute('data-ready', 'true');
    expect(await hash(page)).toBe('#view=map');
    await expect(byId(page, 'as-of')).toHaveText('Scores as of 2026-11-11');
    const kpis = byId(page, 'hl-kpis').locator('.kpi');
    await expect(kpis).toHaveCount(4);
    await expect(kpis.nth(0)).toContainText('154');
    await expect(kpis.nth(0)).toContainText('6 poor · 15 moderate · 4 not assessed');
    await expect(kpis.nth(0).locator('.sub')).toHaveClass(/sub-bad/);
    await expect(kpis.nth(1)).toContainText('T-039');
    await expect(kpis.nth(2)).toContainText('28309');
    await expect(kpis.nth(3)).toContainText('218');
    expect(errors).toEqual([]);
  });

  test('Leaflet is the vendored copy: no request goes to a CDN, only tiles go outside the site', async ({ page }) => {
    const hosts = new Set();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    await mapPage(page);
    await expect(byId(page, 'map').locator('.leaflet-container, .leaflet-pane').first()).toBeAttached();
    const external = [...hosts].filter((h) => !/^localhost/.test(h));
    expect(external.every((h) => h === 'tile.openstreetmap.org' || h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'), `external hosts: ${external}`).toBe(true);
    expect(await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /leaflet/.test(s)))).toEqual([expect.stringContaining('/reliability/js/vendor/leaflet/leaflet.js')]);
  });

  test('the network is drawn: a line for every span, a marker for every tower, two substations and finding clusters', async ({ page }) => {
    await mapPage(page);
    const map = byId(page, 'map');
    await expect(map.locator('.rm-span')).toHaveCount(151);
    await expect(map.locator('.rm-tower')).toHaveCount(154);
    await expect(map.locator('.rm-station')).toHaveCount(2);
    expect(await map.locator('.rm-cluster, .rm-finding').count()).toBeGreaterThan(0);
    const totalFindings = await map.locator('.rm-cluster').evaluateAll((els) => els.reduce((n, e) => n + Number(e.textContent), 0));
    expect(totalFindings + (await map.locator('.rm-finding').count())).toBe(218);
  });

  test('markers are coloured by band, and not-assessed towers are grey', async ({ page }) => {
    await mapPage(page, '&layers=towers');
    const fills = await byId(page, 'map').locator('.rm-tower').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
    expect(new Set(fills).size).toBe(4); // normal, moderate, poor, not assessed
  });

  test('layers: each checkbox shows or hides its layer and is kept in the URL', async ({ page }) => {
    await mapPage(page);
    const map = byId(page, 'map');
    await byId(page, 'layer-spans').uncheck();
    await expect(map.locator('.rm-span')).toHaveCount(0);
    expect(await hash(page)).toBe('#view=map&layers=towers,stations,findings,tiles');
    await byId(page, 'layer-towers').uncheck();
    await byId(page, 'layer-findings').uncheck();
    await byId(page, 'layer-stations').uncheck();
    await expect(map.locator('.rm-tower')).toHaveCount(0);
    await expect(map.locator('.rm-station')).toHaveCount(0);
    await expect(map.locator('.rm-cluster')).toHaveCount(0);
    expect(await hash(page)).toBe('#view=map&layers=tiles');
    await page.reload();
    await expect(byId(page, 'layer-towers')).not.toBeChecked();
    await expect(byId(page, 'layer-tiles')).toBeChecked();
    await byId(page, 'clear-filters').click();
    await expect(map.locator('.rm-tower')).toHaveCount(154);
    expect(await hash(page)).toBe('#view=map');
  });

  test('toggling a layer keeps the view: the map is not rebuilt', async ({ page }) => {
    await mapPage(page);
    await evalMap(page, (m) => m.setView([40.505, 49.795], 14, { animate: false }));
    await byId(page, 'layer-spans').uncheck();
    await byId(page, 'layer-spans').check();
    const v = await evalMap(page, (m) => ({ z: m.getZoom(), c: m.getCenter() }));
    expect(v.z).toBe(14);
    expect(Math.abs(v.c.lat - 40.505)).toBeLessThan(0.0005);
  });

  test('basemap: when tiles fail to load the map falls back to a plain background and says so', async ({ page }) => {
    await mapPage(page, '', { tiles: 'blocked' });
    await expect(byId(page, 'map')).toHaveAttribute('data-basemap', 'fallback');
    await expect(byId(page, 'basemap-fallback')).toBeVisible();
    await expect(byId(page, 'basemap-fallback')).toContainText('plain background');
    await expect(byId(page, 'map').locator('.rm-span')).toHaveCount(151);
    await expect(byId(page, 'map').locator('.leaflet-tile-loaded')).toHaveCount(0);
  });

  test('basemap: when tiles load there is no banner', async ({ page }) => {
    await mapPage(page, '', { tiles: 'ok' });
    await expect(byId(page, 'map')).toHaveAttribute('data-basemap', 'tiles');
    await expect(byId(page, 'basemap-fallback')).toBeHidden();
    expect(await byId(page, 'map').locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  });

  test('basemap: ?tiles=off shows the offline state without asking for a single tile, and the checkbox turns tiles off by choice', async ({ page }) => {
    let asked = 0;
    page.on('request', (r) => { if (/tile\.openstreetmap/.test(r.url())) asked += 1; });
    await reopen(page, '/reliability?tiles=off#view=map', { tiles: 'none' });
    await expect(byId(page, 'map')).toHaveAttribute('data-basemap', 'fallback');
    expect(asked).toBe(0);
    await page.goto('/reliability#view=map');
    await page.reload();
    await mapPage(page, '', { tiles: 'ok' });
    await byId(page, 'layer-tiles').uncheck();
    await expect(byId(page, 'map')).toHaveAttribute('data-basemap', 'off');
    await expect(byId(page, 'basemap-fallback')).toBeHidden();
  });

  test('a click on a tower or a substation opens its Asset 360 panel', async ({ page }) => {
    await mapPage(page, '&layers=towers,stations');
    await evalMap(page, (m) => m.setView([40.5, 49.8], 15, { animate: false }));
    await byId(page, 'map').locator('.rm-station').first().click();
    await expect(panel(page)).toContainText('SUB-S1');
    expect(await hash(page)).toBe('#asset=SUB-S1&view=map&layers=towers,stations');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await evalMap(page, (m) => m.setView([40.528047, 49.788384], 17, { animate: false }));
    const centre = await byId(page, 'map').boundingBox();
    await page.mouse.click(centre.x + centre.width / 2, centre.y + centre.height / 2);
    await expect(panel(page)).toContainText('TWR-132-01-');
  });

  test('finding clusters: a click zooms in, and a single finding opens the viewer', async ({ page }) => {
    await mapPage(page, '&layers=findings');
    const z0 = await evalMap(page, (m) => m.getZoom());
    await byId(page, 'map').locator('.rm-cluster').first().click();
    await expect.poll(() => evalMap(page, (m) => m.getZoom())).toBeGreaterThan(z0);
    await evalMap(page, (m) => m.setView([40.528809, 49.78825], 19, { animate: false })); // F-0308
    await expect.poll(() => byId(page, 'map').locator('.rm-finding').count()).toBeGreaterThan(0);
    await byId(page, 'map').locator('.rm-finding').first().click();
    await expect(viewer(page)).toBeVisible();
  });

  test('label highlight: everything that carries the label stays bright, the rest fades, and it is kept in the URL', async ({ page }) => {
    await mapPage(page, '&layers=towers');
    await byId(page, 'label-select').selectOption('corridor:corridor-coastal');
    expect(await hash(page)).toBe('#view=map&layers=towers&label=corridor%3Acorridor-coastal');
    const ops = await byId(page, 'map').locator('.rm-tower').evaluateAll((els) => els.map((e) => e.getAttribute('fill-opacity')));
    const bright = ops.filter((o) => o === '1').length;
    expect(bright).toBeGreaterThan(0);
    expect(bright).toBeLessThan(ops.length);
    expect(ops.filter((o) => o === '0.3').length).toBe(ops.length - bright);
    await page.reload();
    await expect(byId(page, 'label-select')).toHaveValue('corridor:corridor-coastal');
    await byId(page, 'label-select').selectOption('');
    const after = await byId(page, 'map').locator('.rm-tower').evaluateAll((els) => els.map((e) => e.getAttribute('fill-opacity')));
    expect(new Set(after)).toEqual(new Set(['1']));
  });

  test('lasso: draw around assets and they are listed with their total risk; a row opens the asset; Escape cancels; clear empties it', async ({ page }) => {
    await mapPage(page, '&layers=spans,towers');
    await expect(byId(page, 'selection-empty')).toBeVisible();
    // fit the view to towers 10 to 12 of L-132-01 and draw a box round them (they have a risk score)
    const box = await evalMap(page, (m) => {
      const ids = [[40.5255, 49.7869], [40.5308, 49.7895]]; // around T-010..T-012, where the risk is
      m.fitBounds(ids, { animate: false, padding: [60, 60] });
      const a = m.latLngToContainerPoint(ids[0]); const b = m.latLngToContainerPoint(ids[1]);
      return { x0: Math.min(a.x, b.x) - 25, y0: Math.min(a.y, b.y) - 25, x1: Math.max(a.x, b.x) + 25, y1: Math.max(a.y, b.y) + 25 };
    });
    const el = await byId(page, 'map').boundingBox();
    await byId(page, 'lasso').click();
    await expect(byId(page, 'lasso')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(el.x + box.x0, el.y + box.y0);
    await page.mouse.down();
    for (const [x, y] of [[box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [box.x0, box.y0 + 4]]) await page.mouse.move(el.x + x, el.y + y, { steps: 6 });
    await page.mouse.up();
    await expect(byId(page, 'selection')).toBeVisible();
    const rows = byId(page, 'selection').locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
    const risks = (await rows.locator('td.rm-num').allInnerTexts()).map((t) => (t === '–' ? null : Number(t)));
    const total = risks.filter((x) => x !== null).reduce((a, b) => a + b, 0);
    await expect(byId(page, 'selection-total')).toContainText('Total risk');
    const shown = Number((await byId(page, 'selection-total').innerText()).match(/Total risk ([\d.]+)/)[1]);
    expect(Math.abs(shown - total)).toBeLessThan(count); // the rows are rounded, the total is the sum of the exact scores
    expect(risks.filter((x) => x !== null)).toEqual([...risks.filter((x) => x !== null)].sort((a, b) => b - a));
    await expect(byId(page, 'selection-summary')).toContainText('selected');
    await rows.first().locator('.a360-link').click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await byId(page, 'clear-selection').click();
    await expect(byId(page, 'selection-empty')).toBeVisible();
    // Escape while drawing cancels the lasso
    await byId(page, 'lasso').click();
    await page.keyboard.press('Escape');
    await expect(byId(page, 'lasso')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a reviewer decision elsewhere changes the map: reject F-0090 and T-010 turns from moderate to normal', async ({ page }) => {
    await mapPage(page, '&layers=towers');
    const fill = () => byId(page, 'map').locator('.rm-tower').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
    const before = await fill();
    await page.evaluate(() => window.NexusReliability.openFinding('F-0090'));
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('r');
    await viewer(page).getByTestId('reject-yes').click();
    await expect(viewer(page).getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await fill()).join()).not.toBe(before.join());
  });

  test('theme: switching redraws the map in the other theme without moving the view', async ({ page }) => {
    await mapPage(page, '&layers=spans,towers');
    await evalMap(page, (m) => m.setView([40.52, 49.79], 13, { animate: false }));
    const light = await byId(page, 'map').evaluate((e) => getComputedStyle(e).backgroundColor);
    await byId(page, 'theme-toggle').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await expect.poll(() => byId(page, 'map').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(light);
    expect(await evalMap(page, (m) => m.getZoom())).toBe(13);
  });

  test('loading and error states', async ({ page }) => {
    await reopen(page, '/reliability?healthdelay=1500#view=map');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await expect(byId(page, 'map')).toBeVisible();
    await page.goto('/reliability?healthfail=1#view=map');
    await page.reload();
    await expect(byId(page, 'hl-error')).toContainText('Could not load the map');
    await byId(page, 'hl-retry').click();
    await expect(byId(page, 'map')).toBeVisible();
  });

  test('screenshots, both themes: the offline basemap, and the same map with tiles', async ({ page }) => {
    await mapPage(page, '', { tiles: 'blocked' });
    await both(page, 'map-offline-basemap', 1250, () => expect(byId(page, 'basemap-fallback')).toBeVisible());
    await mapPage(page, '', { tiles: 'ok' });
    await expect(byId(page, 'map')).toHaveAttribute('data-basemap', 'tiles');
    await both(page, 'map-with-tiles', 1250);
  });

  test('screenshots, both themes: zoomed in on a line, label highlight, layers off, lasso', async ({ page }) => {
    await mapPage(page, '', { tiles: 'blocked' });
    await evalMap(page, (m) => m.fitBounds([[40.4985, 49.7455], [40.6125, 49.8075]], { animate: false }));
    await byId(page, 'layer-findings').uncheck();
    await both(page, 'map-zoomed-line', 1250);
    await evalMap(page, (m) => m.fitBounds([[40.3, 49.74], [40.62, 50.23]], { animate: false }));
    await byId(page, 'label-select').selectOption('corridor:corridor-coastal');
    await both(page, 'map-label-highlight', 1250);
    await byId(page, 'label-select').selectOption('');
    for (const l of ['towers', 'stations', 'findings']) await byId(page, `layer-${l}`).uncheck();
    await both(page, 'map-layers-spans-only', 1250);
    for (const l of ['towers', 'stations', 'findings']) await byId(page, `layer-${l}`).check();
    await byId(page, 'layer-findings').uncheck();
    const box = await evalMap(page, (m) => {
      const ids = [[40.5255, 49.7869], [40.5308, 49.7895]];
      m.fitBounds(ids, { animate: false, padding: [90, 90] });
      const a = m.latLngToContainerPoint(ids[0]); const b = m.latLngToContainerPoint(ids[1]);
      return { x0: Math.min(a.x, b.x) - 30, y0: Math.min(a.y, b.y) - 30, x1: Math.max(a.x, b.x) + 30, y1: Math.max(a.y, b.y) + 30 };
    });
    const el = await byId(page, 'map').boundingBox();
    await byId(page, 'lasso').click();
    await page.mouse.move(el.x + box.x0, el.y + box.y0);
    await page.mouse.down();
    for (const [x, y] of [[box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [box.x0, box.y0 + 4]]) await page.mouse.move(el.x + x, el.y + y, { steps: 6 });
    await page.mouse.up();
    await expect(byId(page, 'selection')).toBeVisible();
    await both(page, 'map-lasso', 1250, () => expect(byId(page, 'selection')).toBeVisible());
  });

  test('screenshots, both themes: loading, error, and the panel opened from a tower', async ({ page }) => {
    await reopen(page, '/reliability?healthdelay=60000#view=map');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await both(page, 'map-loading', 900);
    await page.goto('/reliability?healthfail=1#view=map');
    await page.reload();
    await expect(byId(page, 'hl-error')).toBeVisible();
    await both(page, 'map-error', 900);
    await mapPage(page, '&layers=towers,stations', { tiles: 'blocked' });
    await evalMap(page, (m) => m.setView([40.528047, 49.788384], 17, { animate: false }));
    const box = await byId(page, 'map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    for (const t of ['light', 'dark']) {
      await page.evaluate((want) => { if ((document.documentElement.dataset.relTheme ?? 'light') !== want) document.getElementById('rel-theme').click(); }, t);
      await expect.poll(() => theme(page)).toBe(t);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/map-tower-panel-${t}.png` });
    }
  });
});
