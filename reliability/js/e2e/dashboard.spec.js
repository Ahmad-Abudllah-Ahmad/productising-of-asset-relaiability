// The Reliability Dashboard on the repository data. Screenshots (both themes, and the drill-down from each KPI) go to
// docs/screens/phase4c/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phase4c';
fs.mkdirSync(SHOTS, { recursive: true });

const rail = (page) => page.locator('[data-go]');
const byId = (page, id) => page.getByTestId(id);
const panel = (page) => page.getByTestId('asset-panel');
const hash = (page) => page.evaluate(() => location.hash);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const title = (page) => page.locator('#app-title');
const visibleRows = (page) => page.locator('#stage table.reg-table tbody tr:not([hidden])');

async function open(page, url = '/reliability#view=dashboard', size = { width: 1920, height: 1080 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.setViewportSize(size);
  await page.goto(url);
  await page.reload();
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const dashboard = async (page, url) => { const e = await open(page, url); await expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true'); return e; };
async function setTheme(page, want) { if ((await theme(page)) !== want) await byId(page, 'theme-toggle').click(); await expect.poll(() => theme(page)).toBe(want); }
async function both(page, name, ready) {
  for (const t of ['light', 'dark']) {
    await setTheme(page, t);
    if (ready) await ready();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/${name}-${t}.png` });
  }
  await setTheme(page, 'light');
}
const evalChart = (page, fn, arg) => page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.echarts.getInstanceByDom(document.querySelector('[data-testid="trend-chart"]')), a), [fn.toString(), arg]);

test.describe('the dashboard', () => {
  test('opens from the rail: four KPI cards, "Scores as of", the trend, the distribution, ten risks and a row per line', async ({ page }) => {
    const errors = await open(page, '/reliability');
    await rail(page).nth(6).click();
    await expect(title(page)).toContainText('Reliability Dashboard');
    await expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
    expect(await hash(page)).toBe('#view=dashboard');
    await expect(byId(page, 'as-of')).toHaveText('Scores as of 2026-11-11');
    await expect(byId(page, 'hl-kpis').locator('.kpi')).toHaveCount(4);
    await expect(byId(page, 'kpi-assets')).toContainText('26 need attention');
    await expect(byId(page, 'kpi-findings')).toContainText('33');
    await expect(byId(page, 'kpi-findings')).toContainText('10 critical · 23 serious');
    await expect(byId(page, 'kpi-overdue')).toContainText('26');
    await expect(byId(page, 'kpi-links')).toContainText('30');
    await expect(byId(page, 'distribution').locator('.dash-dist')).toHaveCount(4);
    await expect(byId(page, 'risks').locator('tbody tr')).toHaveCount(10);
    await expect(byId(page, 'lines').locator('tbody tr')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('it fits one screen at 1920 x 1080 without scrolling', async ({ page }) => {
    await dashboard(page);
    const m = await page.evaluate(() => { const w = document.querySelector('.hl-main-wrap'); return { sh: w.scrollHeight, ch: w.clientHeight, doc: document.documentElement.scrollHeight, win: innerHeight }; });
    expect(m.sh).toBeLessThanOrEqual(m.ch);
    expect(m.doc).toBeLessThanOrEqual(m.win);
  });

  test('KPI subtitles say what they mean: critical findings are red, overdue work orders amber', async ({ page }) => {
    await dashboard(page);
    await expect(byId(page, 'kpi-findings').locator('.sub')).toHaveClass(/sub-bad/);
    await expect(byId(page, 'kpi-overdue').locator('.sub')).toHaveClass(/sub-warn/);
    await expect(byId(page, 'kpi-links').locator('.sub')).toHaveClass(/sub-warn/);
    await expect(byId(page, 'kpi-assets').locator('.sub')).toHaveClass(/sub-warn/);
  });

  test('KPI "assets by band": a chip opens that category in the registry with the band filter on, and the counts match', async ({ page }) => {
    await dashboard(page);
    await byId(page, 'kpi-assets').locator('[data-cat="towers"][data-band="poor"]').click();
    await expect(title(page)).toContainText('Asset Registry');
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Towers');
    await expect(page.locator('select[aria-label="Health band"]')).toHaveValue('poor');
    await expect(visibleRows(page)).toHaveCount(6);
    await rail(page).nth(6).click();
    await byId(page, 'kpi-assets').locator('[data-cat="transformers"][data-band="normal"]').click();
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Transformers');
    await expect(visibleRows(page)).toHaveCount(6);
    await rail(page).nth(6).click();
    await byId(page, 'kpi-assets').locator('[data-cat="towers"][data-band="none"]').click();
    await expect(visibleRows(page)).toHaveCount(9); // four new towers and the duplicate records
    await rail(page).nth(6).click();
    await byId(page, 'kpi-assets').locator('.dash-rlabel', { hasText: 'Spans' }).click();
    await expect(page.locator('select[aria-label="Health band"]')).toHaveValue('All');
    await expect(visibleRows(page)).toHaveCount(151);
  });

  test('KPI "open critical and serious findings": opens that list, with the count it showed', async ({ page }) => {
    await dashboard(page);
    await byId(page, 'kpi-findings').click();
    await expect(title(page)).toContainText('Maintenance History');
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Open findings');
    expect(await hash(page)).toBe('#view=history&sev=urgent');
    await expect(byId(page, 'open-findings').locator('tbody tr')).toHaveCount(33);
    await expect(byId(page, 'findings-list-card')).toContainText('Open findings (33 of 218)');
    await byId(page, 'sev-select').selectOption('critical');
    await expect(byId(page, 'open-findings').locator('tbody tr')).toHaveCount(10);
    expect(await hash(page)).toBe('#view=history&sev=critical');
    await byId(page, 'open-findings').locator('tbody tr').first().getByRole('button').first().click();
    await expect(byId(page, 'finding-viewer')).toBeVisible();
  });

  test('KPI "overdue work orders": opens the work orders that are past their planned date', async ({ page }) => {
    await dashboard(page);
    await byId(page, 'kpi-overdue').click();
    await expect(title(page)).toContainText('Maintenance History');
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Work orders');
    expect(await hash(page)).toBe('#view=history&status=overdue');
    await expect(byId(page, 'status-select')).toHaveValue('overdue');
    await expect(byId(page, 'workorders').locator('tbody tr')).toHaveCount(26);
    await expect(byId(page, 'workorders').locator('.tag.r', { hasText: 'overdue' })).toHaveCount(26);
  });

  test('KPI "links awaiting review": opens the Links tab with the queue', async ({ page }) => {
    await dashboard(page);
    await byId(page, 'kpi-links').click();
    await expect(title(page)).toContainText('Asset Registry');
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Links');
    await expect(page.getByTestId('queue-row').first()).toBeVisible();
    await expect(page.getByTestId('queue-row')).toHaveCount(30);
  });

  test('the trend chart: four campaigns, a towers bar and a spans bar each, and a click on a segment opens the registry on that band', async ({ page }) => {
    await dashboard(page);
    const o = await evalChart(page, (c) => { const s = c.getOption().series; return { x: c.getOption().xAxis[0].data, towersPoor: s.find((x) => x.name === 'tower poor').data.map((d) => d.value), spansModerate: s.find((x) => x.name === 'span moderate').data.map((d) => d.value) }; });
    expect(o.x).toEqual(['2026 Q1', '2026 Q2', '2026 Q4', 'Today']);
    expect(o.towersPoor.at(-1)).toBe(6);
    expect(o.spansModerate.at(-1)).toBe(3);
    const pt = await evalChart(page, (c) => { const i = c.getOption().series.findIndex((x) => x.name === 'tower poor'); const l = c.getModel().getSeriesByIndex(i).getData().getItemLayout(3); return { x: l.x + l.width / 2, y: l.y + l.height / 2 }; });
    const box = await byId(page, 'trend-chart').boundingBox();
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Towers');
    await expect(page.locator('select[aria-label="Health band"]')).toHaveValue('poor');
    await expect(visibleRows(page)).toHaveCount(6);
  });

  test('the distribution: a segment opens that category on that band; the category name opens the whole list', async ({ page }) => {
    await dashboard(page);
    const seg = byId(page, 'distribution').locator('[data-cat="spans"][data-band="moderate"]');
    await expect(seg).toHaveText('3');
    await seg.click();
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Spans');
    await expect(visibleRows(page)).toHaveCount(3);
    await rail(page).nth(6).click();
    await byId(page, 'distribution').locator('.dash-dist[data-cat="lines"] .dash-rlabel').click();
    await expect(page.locator('#tabs [data-tab].is-on')).toHaveText('Lines');
    await expect(visibleRows(page)).toHaveCount(3);
  });

  test('top 10 risks: a row opens Asset 360, the line opens Line Health on that line, and the factors multiply to the risk', async ({ page }) => {
    await dashboard(page);
    const first = byId(page, 'risks').locator('tbody tr').first();
    await expect(first).toContainText('T-039');
    await expect(first).toContainText('1090');
    const cells = await first.locator('td.dash-num').allInnerTexts();
    const [points, crit, cons] = [cells[1], cells[2], cells[3]].map(Number);
    expect(Math.round(points * crit * cons)).toBe(1090);
    await expect(byId(page, 'risks').locator('tbody tr', { hasText: 'transformer' }).first()).toBeVisible();
    await first.click();
    await expect(panel(page)).toContainText('TWR-220-03-039');
    expect(await hash(page)).toMatch(/^#asset=TWR-220-03-039&view=dashboard$/);
    await page.keyboard.press('Escape');
    await first.getByTestId('risk-line').click();
    await expect(title(page)).toContainText('Line Health');
    expect(await hash(page)).toBe('#view=lines&line=L-220-03');
    await expect(byId(page, 'line-select')).toHaveValue('L-220-03');
  });

  test('lines: a row opens Line Health, the worst tower opens its panel, and the not-assessed count opens the grey towers', async ({ page }) => {
    await dashboard(page);
    const row = byId(page, 'lines').locator('tr[data-line="L-132-01"]');
    await expect(row).toContainText('94.1 · normal');
    await expect(row).toContainText('T-011');
    await expect(row.getByTestId('not-assessed-count')).toHaveText('8');
    await row.getByTestId('worst-tower').click();
    await expect(panel(page)).toContainText('TWR-132-01-011');
    await page.keyboard.press('Escape');
    await row.getByTestId('not-assessed-count').click();
    await expect(title(page)).toContainText('Tower Health');
    expect(await hash(page)).toContain('band=none');
    await expect(byId(page, 'hl-head')).toContainText('T-041');
    await rail(page).nth(6).click();
    await byId(page, 'lines').locator('tr[data-line="L-500-01"]').click();
    await expect(title(page)).toContainText('Line Health');
    await expect(byId(page, 'line-select')).toHaveValue('L-500-01');
  });

  test('a reviewer decision elsewhere changes the numbers: reject F-0090 and moderate towers go from 15 to 14', async ({ page }) => {
    await dashboard(page);
    const chip = byId(page, 'kpi-assets').locator('[data-cat="towers"][data-band="moderate"]');
    await expect(chip).toHaveText('15');
    await page.evaluate(() => window.NexusReliability.openFinding('F-0090'));
    await page.keyboard.press('r');
    await byId(page, 'finding-viewer').getByTestId('reject-yes').click();
    await expect(byId(page, 'finding-viewer').getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chip).toHaveText('14');
  });

  test('the theme toggle redraws the chart and the screen; the dark chart has light text', async ({ page }) => {
    await dashboard(page);
    await byId(page, 'theme-toggle').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
    expect(await evalChart(page, (c) => c.getOption().xAxis[0].axisLabel.color)).not.toBe('#5f6a7b');
  });

  test('a link such as #view=dashboard opens the dashboard from anywhere', async ({ page }) => {
    await open(page, '/reliability#view=dashboard');
    await expect(title(page)).toContainText('Reliability Dashboard');
  });

  test('loading and error states', async ({ page }) => {
    await open(page, '/reliability?healthdelay=1500#view=dashboard');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await expect(byId(page, 'kpi-assets')).toBeVisible();
    await page.goto('/reliability?healthfail=1#view=dashboard');
    await page.reload();
    await expect(byId(page, 'hl-error')).toContainText('Could not load the dashboard');
    await byId(page, 'hl-retry').click();
    await expect(byId(page, 'kpi-assets')).toBeVisible();
  });

  test('if the app scripts fail, the Dashboard rail entry says it could not be loaded', async ({ page }) => {
    await page.route('**/reliability/js/data/seed.js*', (route) => route.abort());
    await page.goto('/reliability');
    await rail(page).nth(6).click();
    await expect(byId(page, 'dashboard-unavailable')).toContainText('could not be loaded');
  });

  test('screenshots, both themes: the dashboard, loading and error', async ({ page }) => {
    await dashboard(page);
    await both(page, 'dashboard', () => expect(byId(page, 'trend-chart')).toHaveAttribute('data-ready', 'true'));
    await open(page, '/reliability?healthdelay=60000#view=dashboard');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await both(page, 'dashboard-loading');
    await page.goto('/reliability?healthfail=1#view=dashboard');
    await page.reload();
    await expect(byId(page, 'hl-error')).toBeVisible();
    await both(page, 'dashboard-error');
  });

  test('screenshots, both themes: the drill-down from each KPI', async ({ page }) => {
    const drills = [
      ['assets', async () => { await byId(page, 'kpi-assets').locator('[data-cat="towers"][data-band="poor"]').click(); await expect(visibleRows(page)).toHaveCount(6); }],
      ['findings', async () => { await byId(page, 'kpi-findings').click(); await expect(byId(page, 'open-findings')).toBeVisible(); }],
      ['overdue', async () => { await byId(page, 'kpi-overdue').click(); await expect(byId(page, 'workorders')).toBeVisible(); }],
      ['links', async () => { await byId(page, 'kpi-links').click(); await expect(page.getByTestId('queue-row').first()).toBeVisible(); }],
    ];
    for (const [name, go] of drills) {
      await dashboard(page);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await go();
      await both(page, `drilldown-${name}`);
    }
  });
});
