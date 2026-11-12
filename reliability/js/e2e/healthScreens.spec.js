// Line Health and Tower Health on the repository data. Screenshots of both screens in both themes go to docs/screens/phase4a/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phase4a';
fs.mkdirSync(SHOTS, { recursive: true });

const rail = (page) => page.locator('[data-go]');
const byId = (page, id) => page.getByTestId(id);
const panel = (page) => page.getByTestId('asset-panel');
const viewer = (page) => page.getByTestId('finding-viewer');
const hash = (page) => page.evaluate(() => location.hash);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');

async function open(page, url = '/reliability') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const lines = async (page, line = 'L-132-01') => { const e = await open(page, `/reliability#view=lines&line=${line}`); await expect(byId(page, 'strip')).toBeVisible(); return e; };
const tower = async (page, query = 'tower=TWR-132-01-011&line=L-132-01') => { const e = await open(page, `/reliability#view=towers&${query}`); await page.reload(); await expect(byId(page, 'schematic')).toBeVisible(); return e; };
const chartReady = (page) => expect(byId(page, 'profile-chart')).toHaveAttribute('data-ready', 'true');

async function setTheme(page, want) { if ((await theme(page)) !== want) await byId(page, 'theme-toggle').click(); await expect.poll(() => theme(page)).toBe(want); }
/** Screenshot in both themes. The viewport is tall so the whole screen is in the picture. */
async function both(page, name, height = 1500, ready) {
  await page.setViewportSize({ width: 1440, height });
  for (const t of ['light', 'dark']) {
    await setTheme(page, t);
    if (ready) await ready();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/${name}-${t}.png` });
  }
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe('Line Health', () => {
  test('opens from the rail on the first line: KPI cards, "Scores as of", the strip, the chart and the breakdown', async ({ page }) => {
    const errors = await open(page);
    await rail(page).nth(4).click();
    await expect(byId(page, 'strip')).toBeVisible();
    await expect(page.locator('#app-title')).toContainText('Line Health');
    expect(await hash(page)).toBe('#view=lines&line=L-132-01');
    await expect(byId(page, 'as-of')).toHaveText('Scores as of 2026-11-11');
    await expect(byId(page, 'line-select')).toHaveValue('L-132-01');
    const kpis = byId(page, 'hl-kpis').locator('.kpi');
    await expect(kpis).toHaveCount(4);
    await expect(kpis.nth(0)).toContainText('94.1');
    await expect(kpis.nth(1)).toContainText('88.3%');
    await expect(kpis.nth(1)).toContainText('8 units not assessed');
    await expect(kpis.nth(2)).toContainText('2 poor · 5 moderate');
    await chartReady(page);
    await expect(byId(page, 'line-breakdown')).toContainText('length weight');
    expect(errors).toEqual([]);
  });

  test('KPI subtitles say what they mean: a bad count is never green', async ({ page }) => {
    await lines(page);
    const sub = (i) => byId(page, 'hl-kpis').locator('.kpi').nth(i).locator('.sub');
    const colour = (loc) => loc.evaluate((n) => getComputedStyle(n).color);
    const green = await sub(0).evaluate((n) => getComputedStyle(n).color); // normal band: ok = green
    await expect(sub(2)).toHaveClass(/sub-bad/); // 2 poor
    expect(await colour(sub(2))).not.toBe(green);
    await expect(sub(1)).toHaveClass(/sub-warn/); // 8 units not assessed
    await expect(sub(0)).toHaveClass(/sub-ok/);
    await tower(page, 'tower=TWR-132-01-011&line=L-132-01');
    const t = byId(page, 'hl-kpis').locator('.kpi');
    await expect(t.nth(0).locator('.sub')).toHaveClass(/sub-bad/); // poor
    await expect(t.nth(1).locator('.sub')).toHaveClass(/sub-bad/); // critical finding
    await expect(t.nth(2).locator('.sub')).toHaveClass(/sub-bad/); // high risk
    await tower(page, 'tower=TWR-132-01-041&line=L-132-01&band=none');
    await expect(byId(page, 'hl-kpis').locator('.kpi').nth(0).locator('.sub')).toHaveClass(/sub-neutral/);
  });

  test('where the strip wraps, a "continues" marker ends the row and "continued" starts the next', async ({ page }) => {
    await lines(page);
    const rows = await byId(page, 'strip').locator('.hl-seg').evaluateAll((segs) => new Set(segs.map((s) => s.offsetTop)).size);
    expect(rows).toBeGreaterThan(1);
    await expect(byId(page, 'strip').getByTestId('continues')).toHaveCount(rows - 1);
    await expect(byId(page, 'strip').getByTestId('continued')).toHaveCount(rows - 1);
    await page.setViewportSize({ width: 1000, height: 900 }); // narrower: more rows, more markers
    await expect.poll(() => byId(page, 'strip').getByTestId('continues').count()).toBeGreaterThan(rows - 1);
    const inside = await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="strip"]');
      return [...strip.querySelectorAll('.hl-cont')].every((n) => n.offsetLeft >= 0 && n.offsetLeft + n.offsetWidth <= strip.clientWidth + 1);
    });
    expect(inside).toBe(true);
  });

  test('the strip: 44 towers in order with 43 spans between, grey for the new section, clearance under each span', async ({ page }) => {
    await lines(page);
    const towers = byId(page, 'strip').locator('.hl-tower');
    await expect(towers).toHaveCount(44);
    await expect(byId(page, 'strip').locator('.hl-span')).toHaveCount(43);
    await expect(towers.first()).toHaveAttribute('data-asset', 'TWR-132-01-001');
    await expect(towers.last()).toHaveAttribute('data-asset', 'TWR-132-01-044');
    for (const n of ['041', '042', '043', '044']) {
      const t = byId(page, 'strip').locator(`[data-asset="TWR-132-01-${n}"]`);
      await expect(t).toHaveAttribute('data-band', 'none');
      await expect(t).toHaveAttribute('aria-label', /not assessed/);
    }
    await expect(byId(page, 'strip').locator('[data-asset="SPN-132-01-043-044"]')).toHaveAttribute('data-band', 'none');
    await expect(byId(page, 'strip').locator('[data-asset="TWR-132-01-011"]')).toHaveAttribute('data-band', 'poor');
    await expect(byId(page, 'strip').locator('[data-asset="TWR-132-01-019"]')).toHaveAttribute('data-band', 'moderate');
    await expect(byId(page, 'strip').locator('[data-asset="TWR-132-01-001"]')).toHaveAttribute('data-band', 'normal');
    await expect(byId(page, 'strip').locator('[data-asset="SPN-132-01-009-010"]')).toHaveAttribute('data-band', 'poor');
    await expect(byId(page, 'strip').locator('[data-asset="SPN-132-01-009-010"] .hl-clear')).toHaveText('8.6 m');
    await expect(byId(page, 'strip').locator('[data-asset="TWR-132-01-011"] .hl-count')).toHaveText('3');
    await expect(byId(page, 'strip').locator('[data-asset="TWR-132-01-011"] .hl-hi')).toHaveText('35');
  });

  test('clicking a tower or a span opens its Asset 360 panel, and closing it leaves the line selected', async ({ page }) => {
    await lines(page);
    await byId(page, 'strip').locator('[data-asset="TWR-132-01-011"]').click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText('TWR-132-01-011');
    expect(await hash(page)).toBe('#asset=TWR-132-01-011&view=lines&line=L-132-01');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    expect(await hash(page)).toBe('#view=lines&line=L-132-01');
    await byId(page, 'strip').locator('[data-asset="SPN-132-01-009-010"]').click();
    await expect(panel(page)).toContainText('SPN-132-01-009-010');
    await page.keyboard.press('Escape');
    await expect(byId(page, 'strip')).toBeVisible();
  });

  test('the strip is reachable by keyboard: a tower is a button and Enter opens it', async ({ page }) => {
    await lines(page);
    await byId(page, 'strip').locator('[data-asset="TWR-132-01-019"]').focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toContainText('TWR-132-01-019');
  });

  test('the line selector switches the line, keeps it in the URL and survives a reload', async ({ page }) => {
    await lines(page);
    await byId(page, 'line-select').selectOption('L-220-03');
    await expect(byId(page, 'strip').locator('.hl-tower')).toHaveCount(60);
    expect(await hash(page)).toBe('#view=lines&line=L-220-03');
    await expect(byId(page, 'hl-head')).toContainText('220 kV');
    await expect(byId(page, 'not-assessed')).toContainText('Every tower and span has been assessed');
    await page.reload();
    await expect(byId(page, 'strip').locator('.hl-tower')).toHaveCount(60);
    await expect(byId(page, 'line-select')).toHaveValue('L-220-03');
    await byId(page, 'line-select').selectOption('L-500-01');
    await expect(byId(page, 'strip').locator('.hl-tower')).toHaveCount(50);
  });

  test('an unknown line in the URL falls back to the first line', async ({ page }) => {
    await open(page, '/reliability#view=lines&line=L-NOPE');
    await expect(byId(page, 'strip').locator('.hl-tower')).toHaveCount(44);
    expect(await hash(page)).toBe('#view=lines&line=L-132-01');
  });

  test('the profile chart: drawn with ECharts, points for towers and spans, and a click on a point opens that tower', async ({ page }) => {
    await lines(page);
    await chartReady(page);
    const el = byId(page, 'profile-chart');
    const info = await el.evaluate((node) => {
      const chart = window.echarts.getInstanceByDom(node);
      const opt = chart.getOption();
      const towers = opt.series[0].data.filter((d) => d.id);
      const t11 = towers.find((d) => d.id === 'TWR-132-01-011');
      const [x, y] = chart.convertToPixel({ seriesIndex: 0 }, t11.value);
      return { series: opt.series.map((s) => [s.name, s.data.length]), x, y };
    });
    expect(info.series).toEqual([['Towers', 44], ['Spans', 39], ['Not assessed', 8]]);
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await page.mouse.click(box.x + info.x, box.y + info.y);
    await expect(panel(page)).toContainText('TWR-132-01-011');
  });

  test('the breakdown: band counts, the five worst (clickable), and the not-assessed units with the reason', async ({ page }) => {
    await lines(page);
    await expect(byId(page, 'band-counts')).toContainText('All assessed');
    const rows = byId(page, 'band-counts').locator('tbody tr');
    await expect(rows.nth(2).locator('td')).toHaveText(['72', '5', '2']);
    const worst = byId(page, 'worst').locator('li');
    await expect(worst).toHaveCount(5);
    await expect(worst.first()).toContainText('T-009/T-010');
    await expect(worst.first()).toContainText('29.2 · poor');
    await expect(byId(page, 'not-assessed')).toContainText('Not assessed (8)');
    await expect(byId(page, 'not-assessed')).toContainText('no inspection evidence');
    await expect(byId(page, 'not-assessed').locator('li')).toHaveCount(8);
    await worst.nth(1).locator('button').click();
    await expect(panel(page)).toContainText('TWR-132-01-011');
  });

  test('a reviewer decision elsewhere changes the strip: reject F-0090 and T-010 goes from moderate to normal', async ({ page }) => {
    await lines(page);
    const t10 = byId(page, 'strip').locator('[data-asset="TWR-132-01-010"]');
    await expect(t10).toHaveAttribute('data-band', 'moderate');
    await page.evaluate(() => window.NexusReliability.openFinding('F-0090'));
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('r');
    await viewer(page).getByTestId('reject-yes').click();
    await expect(viewer(page).getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(t10).toHaveAttribute('data-band', 'normal');
    await expect(t10.locator('.hl-hi')).toHaveText('100');
  });

  test('loading and error states: a slow load shows a skeleton, a failed one says so and Retry works', async ({ page }) => {
    await open(page, '/reliability?healthdelay=1500#view=lines&line=L-132-01');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await expect(byId(page, 'strip')).toBeVisible();
    await page.goto('/reliability?healthfail=1#view=lines&line=L-132-01');
    await expect(byId(page, 'hl-error')).toContainText('Could not load this line');
    await expect(byId(page, 'hl-error')).toContainText('simulated failure');
    await byId(page, 'hl-retry').click();
    await expect(byId(page, 'strip')).toBeVisible();
  });

  test('leaving the screen takes its keys out of the URL', async ({ page }) => {
    await lines(page);
    await rail(page).nth(2).click();
    await expect(page.locator('#app-title')).toContainText('Asset Registry');
    expect(await hash(page)).toBe('');
  });

  test('screenshots, both themes: the strip with the new section in grey, the chart and the breakdown', async ({ page }) => {
    await lines(page);
    await both(page, 'line-health-L-132-01', 1500, () => chartReady(page));
    await byId(page, 'line-select').selectOption('L-220-03');
    await both(page, 'line-health-L-220-03', 1700, () => chartReady(page));
  });

  test('screenshots, both themes: loading, error, and the panel opened from the strip', async ({ page }) => {
    await open(page, '/reliability?healthdelay=60000#view=lines&line=L-132-01');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await both(page, 'line-health-loading', 900);
    await page.goto('/reliability?healthfail=1#view=lines&line=L-132-01');
    await expect(byId(page, 'hl-error')).toBeVisible();
    await both(page, 'line-health-error', 900);
    await page.goto('/reliability#view=lines&line=L-132-01');
    await expect(byId(page, 'strip')).toBeVisible();
    await byId(page, 'strip').locator('[data-asset="SPN-132-01-009-010"]').click();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    for (const t of ['light', 'dark']) {
      await page.evaluate((want) => { if ((document.documentElement.dataset.relTheme ?? 'light') !== want) document.getElementById('rel-theme').click(); }, t);
      await expect.poll(() => theme(page)).toBe(t);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/line-health-span-panel-${t}.png` });
    }
  });
});

test.describe('Tower Health', () => {
  test('opens from the rail on the first tower of the first line, not on a duplicate record', async ({ page }) => {
    await open(page);
    await rail(page).nth(3).click();
    await expect(byId(page, 'schematic')).toBeVisible();
    await expect(page.locator('#app-title')).toContainText('Tower Health');
    await expect(byId(page, 'hl-head')).toContainText('T-001');
    expect(await hash(page)).toBe('#view=towers&tower=TWR-132-01-001');
    await expect(byId(page, 'as-of')).toHaveText('Scores as of 2026-11-11');
  });

  test('a poor tower: KPI cards, the schematic zones coloured by group, the cap, and the group table', async ({ page }) => {
    const errors = await tower(page);
    const kpis = byId(page, 'hl-kpis').locator('.kpi');
    await expect(kpis).toHaveCount(4);
    await expect(kpis.nth(0)).toContainText('34.6');
    await expect(kpis.nth(0)).toContainText('condition cap applies');
    await expect(kpis.nth(1)).toContainText('3');
    await expect(kpis.nth(1)).toContainText('worst: critical');
    await expect(kpis.nth(2)).toContainText('589');
    await expect(kpis.nth(3)).toContainText('2026-10-28');
    const zone = (z) => byId(page, 'schematic').locator(`[data-zone="${z}"]`);
    await expect(zone('earthwire peak')).toHaveAttribute('data-condition', '1');
    for (const z of ['steel structure', 'insulator strings', 'conductor hardware', 'fittings', 'foundation']) await expect(zone(z)).toHaveAttribute('data-condition', '5');
    await expect(byId(page, 'schematic').locator('[data-zone]')).toHaveCount(6);
    await expect(byId(page, 'schematic')).toContainText('Steel structure');
    await expect(byId(page, 'schematic').locator('[data-zone="steel structure"] .hl-ol')).toHaveCount(1);
    await expect(byId(page, 'schematic-card')).toContainText('Findings do not say where on the tower');
    await expect(zone('earthwire peak')).toHaveAttribute('aria-label', /Lightning protection, condition 1 \(very poor\)/);
    expect(await zone('earthwire peak').evaluate((n) => getComputedStyle(n).fill)).not.toBe(await zone('steel structure').evaluate((n) => getComputedStyle(n).fill));
    await expect(byId(page, 'cap-note')).toContainText('86.7 before the cap, 34.6 after');
    const g = byId(page, 'groups').locator('tbody tr');
    await expect(g).toHaveCount(6);
    await expect(byId(page, 'groups').locator('[data-group="lightning_protection"]')).toContainText('T-011 earthwire');
    await expect(byId(page, 'groups').locator('[data-group="lightning_protection"] td').last()).toHaveText('3');
    await expect(byId(page, 'cond-legend')).toContainText('not assessed');
    expect(errors).toEqual([]);
  });

  test('findings: thumbnails labelled Ref or Placeholder open the finding viewer, which opens over this screen', async ({ page }) => {
    await tower(page);
    const rows = byId(page, 'findings').locator('li');
    await expect(rows).toHaveCount(3);
    const thumb = rows.first().locator('.a360-thumb');
    await expect(thumb).toContainText(/Ref|Demo|Insp/);
    await thumb.click();
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page).getByTestId('demo-label').first()).toHaveText(/Reference photo|Demo image|Inspection image/);
    expect(await hash(page)).toMatch(/^#finding=F-\d+&view=towers&line=L-132-01&tower=TWR-132-01-011$/);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(byId(page, 'schematic')).toBeVisible();
  });

  test('the campaign comparison: a column per campaign and today, changes marked, and the repair between two of them', async ({ page }) => {
    await tower(page);
    const t = byId(page, 'compare');
    const heads = t.locator('thead th');
    await expect(heads).toHaveCount(5);
    for (const [i, want] of [['Group'], ['2026 Q1', '2026-02-25'], ['2026 Q2', '2026-05-27'], ['2026 Q4', '2026-10-28'], ['Today', '2026-11-11']].entries()) for (const w of want) await expect(heads.nth(i)).toContainText(w);
    const ins = t.locator('[data-row="insulators"] td');
    await expect(ins.nth(1)).toContainText('4');
    await expect(ins.nth(1).locator('.hl-worse')).toBeVisible();
    await expect(ins.nth(2).locator('.hl-better')).toBeVisible();
    await expect(t.locator('[data-row="lightning_protection"] td')).toHaveCount(4);
    await expect(t.locator('[data-row="repairs"] td').nth(2)).toContainText('insulator replacement');
    await expect(t.locator('[data-row="hi"] td').first()).toContainText('34.6');
  });

  test('a tower that was never inspected: grey zones, a banner that says why, and not-flown in every column', async ({ page }) => {
    await tower(page, 'tower=TWR-132-01-041&line=L-132-01&band=none');
    await expect(byId(page, 'not-assessed-banner')).toContainText('Not assessed');
    await expect(byId(page, 'not-assessed-banner')).toContainText('not a good score');
    await expect(byId(page, 'not-assessed-banner')).toContainText('No evidence on or before 2026-11-11');
    for (const z of ['earthwire peak', 'steel structure', 'insulator strings', 'conductor hardware', 'fittings', 'foundation']) await expect(byId(page, 'schematic').locator(`[data-zone="${z}"]`)).toHaveAttribute('data-condition', '');
    await expect(byId(page, 'hl-kpis')).toContainText('not assessed');
    await expect(byId(page, 'hl-kpis')).toContainText('never inspected');
    await expect(byId(page, 'compare').locator('[data-row="hi"] td')).toHaveText(['not flown', 'not flown', 'not flown', 'not flown']);
    await expect(byId(page, 'findings-card')).toContainText('has not been inspected');
  });

  test('filters and the selector: line, band and tower are in the URL, and survive a reload', async ({ page }) => {
    await tower(page, 'tower=TWR-132-01-011&line=L-132-01');
    await byId(page, 'band-select').selectOption('poor');
    await expect(byId(page, 'hl-head')).toContainText('T-011');
    expect(await hash(page)).toBe('#view=towers&line=L-132-01&tower=TWR-132-01-011&band=poor');
    await expect(byId(page, 'tower-select').locator('option')).toHaveCount(1);
    await byId(page, 'band-select').selectOption('none');
    await expect(byId(page, 'not-assessed-banner')).toBeVisible();
    expect(await hash(page)).toContain('band=none');
    await byId(page, 'band-select').selectOption('');
    await byId(page, 'tower-select').selectOption('TWR-132-01-019');
    await expect(byId(page, 'hl-head')).toContainText('T-019');
    await page.reload();
    await expect(byId(page, 'hl-head')).toContainText('T-019');
    await expect(byId(page, 'line-select')).toHaveValue('L-132-01');
    await byId(page, 'clear-filters').click();
    expect(await hash(page)).toMatch(/^#view=towers&tower=TWR-132-01-001$/);
    await expect(byId(page, 'line-select')).toHaveValue('');
  });

  test('previous and next step through the filtered list', async ({ page }) => {
    await tower(page, 'tower=TWR-132-01-002&line=L-132-01');
    await byId(page, 'next-tower').click();
    await expect(byId(page, 'hl-head')).toContainText('T-003');
    await byId(page, 'prev-tower').click();
    await byId(page, 'prev-tower').click();
    await expect(byId(page, 'hl-head')).toContainText('T-001');
    await expect(byId(page, 'prev-tower')).toBeDisabled();
  });

  test('empty state: filters that match no tower say so and Clear filters restores the list', async ({ page }) => {
    await open(page, '/reliability#view=towers&line=L-500-01&band=poor');
    await expect(byId(page, 'tower-empty')).toContainText('No tower matches these filters');
    await expect(byId(page, 'next-tower')).toBeDisabled();
    await byId(page, 'clear-filters').click();
    await expect(byId(page, 'schematic')).toBeVisible();
  });

  test('an unknown tower in the URL falls back to the first tower of the list', async ({ page }) => {
    await open(page, '/reliability#view=towers&tower=TWR-NOPE');
    await expect(byId(page, 'hl-head')).toContainText('T-001');
    expect(await hash(page)).toBe('#view=towers&tower=TWR-132-01-001');
  });

  test('a duplicate record can be selected and says it is waiting to be merged', async ({ page }) => {
    await tower(page, 'tower=MX-TOW-1156&line=L-132-01');
    await expect(byId(page, 'hl-head')).toContainText('duplicate record, waiting to be merged');
    await expect(byId(page, 'not-assessed-banner')).toBeVisible();
  });

  test('"Open Asset 360" opens the panel for this tower, and the worst component opens its own', async ({ page }) => {
    await tower(page);
    await byId(page, 'open-asset').click();
    await expect(panel(page)).toContainText('TWR-132-01-011');
    await page.keyboard.press('Escape');
    await byId(page, 'groups').locator('[data-group="lightning_protection"] button').click();
    await expect(panel(page)).toContainText('EW-132-01-011');
  });

  test('a reviewer decision elsewhere changes the tower: reject F-0090 and T-010 recolours', async ({ page }) => {
    await tower(page, 'tower=TWR-132-01-010&line=L-132-01');
    await expect(byId(page, 'hl-kpis')).toContainText('66.9');
    const cond = () => byId(page, 'schematic').locator('[data-zone="conductor hardware"]').getAttribute('data-condition');
    const before = await cond();
    await byId(page, 'findings').locator('.a360-thumb').first().click();
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('r');
    await viewer(page).getByTestId('reject-yes').click();
    await expect(viewer(page).getByTestId('rejected-banner')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(byId(page, 'hl-kpis')).toContainText('100');
    await expect(byId(page, 'findings-card')).toContainText('No open findings');
    expect(before).not.toBe('5');
    expect(await cond()).toBe('5');
  });

  test('a link such as #view=towers&tower=... opens Tower Health from any screen', async ({ page }) => {
    await open(page, '/reliability#view=towers&tower=TWR-132-01-019');
    await expect(page.locator('#app-title')).toContainText('Tower Health');
    await expect(byId(page, 'hl-head')).toContainText('T-019');
  });

  test('loading and error states', async ({ page }) => {
    await open(page, '/reliability?healthdelay=1500#view=towers&tower=TWR-132-01-011');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await expect(byId(page, 'schematic')).toBeVisible();
    await page.goto('/reliability?healthfail=1#view=towers&tower=TWR-132-01-011');
    await expect(byId(page, 'hl-error')).toContainText('Could not load this tower');
    await byId(page, 'hl-retry').click();
    await expect(byId(page, 'schematic')).toBeVisible();
  });

  test('the theme toggle redraws the screen in the other theme and the zones keep their conditions', async ({ page }) => {
    await tower(page);
    const peak = byId(page, 'schematic').locator('[data-zone="earthwire peak"]');
    await byId(page, 'theme-toggle').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await expect(peak).toHaveAttribute('data-condition', '1');
    expect(await byId(page, 'groups').evaluate((n) => getComputedStyle(n).color)).not.toBe('rgb(27, 36, 48)');
  });

  test('screenshots, both themes: a poor tower, a moderate tower, the new towers (not assessed)', async ({ page }) => {
    await tower(page);
    await both(page, 'tower-health-T-011-poor', 1600);
    await tower(page, 'tower=TWR-132-01-010&line=L-132-01');
    await both(page, 'tower-health-T-010-moderate', 1450);
    await tower(page, 'tower=TWR-132-01-041&line=L-132-01&band=none');
    await both(page, 'tower-health-T-041-not-assessed', 1700);
  });

  test('screenshots, both themes: empty, loading, error', async ({ page }) => {
    await open(page, '/reliability#view=towers&line=L-500-01&band=poor');
    await expect(byId(page, 'tower-empty')).toBeVisible();
    await both(page, 'tower-health-empty', 900);
    await open(page, '/reliability?healthdelay=60000#view=towers&tower=TWR-132-01-011');
    await expect(byId(page, 'hl-loading')).toBeVisible();
    await both(page, 'tower-health-loading', 900);
    await page.goto('/reliability?healthfail=1#view=towers&tower=TWR-132-01-011');
    await expect(byId(page, 'hl-error')).toBeVisible();
    await both(page, 'tower-health-error', 900);
  });
});
