// Phase B: Asset 360 in six tabs and two groups. Screenshots (panel only, both themes) go to docs/screens/phaseB/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phaseB';
fs.mkdirSync(SHOTS, { recursive: true });
const t = (page, id) => page.getByTestId(id);
const panel = (page) => t(page, 'asset-panel');
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const hash = (page) => page.evaluate(() => location.hash);
const tabBtn = (page, id) => t(page, `a360-tab-${id}`);

async function visit(page, url, th = 'light') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.goto('/reliability');
  await page.evaluate((v) => localStorage.setItem('nexus.reliability.theme', v), th);
  await page.goto(url); await page.reload();
  await expect.poll(() => theme(page)).toBe(th);
  await expect(panel(page)).toBeVisible();
  await expect(t(page, 'asset-id')).toBeVisible();
  return errors;
}

const SIX = ['health', 'components', 'trends', 'maintenance', 'workorders', 'inventory'];

test.describe('structure', () => {
  test('two groups, six tabs; the group names are on the tab bar; LiDAR stays for towers and spans', async ({ page }) => {
    const errors = await visit(page, '/reliability#asset=TWR-132-01-011');
    await expect(t(page, 'a360-group')).toHaveText(['Asset Health', 'Operations']);
    const names = await page.locator('.a360-tab').allInnerTexts();
    expect(names).toEqual(['Health & Risk', 'Components', 'Condition Trends', 'LiDAR', 'Maintenance History', 'Work Orders', 'Inventory & Parts']);
    await expect(page.locator('[data-group="Asset Health"] .a360-tab')).toHaveText(['Health & Risk', 'Components', 'Condition Trends', 'LiDAR']);
    await expect(page.locator('[data-group="Operations"] .a360-tab')).toHaveText(['Maintenance History', 'Work Orders', 'Inventory & Parts']);
    await expect(tabBtn(page, 'health')).toHaveAttribute('aria-selected', 'true');
    for (const id of SIX) await expect(tabBtn(page, id)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a component or a line has the six tabs but no LiDAR tab', async ({ page }) => {
    await visit(page, '/reliability#asset=EW-132-01-011');
    await expect(tabBtn(page, 'lidar')).toHaveCount(0);
    for (const id of SIX) await expect(tabBtn(page, id)).toBeVisible();
    await visit(page, '/reliability#asset=L-132-01');
    await expect(tabBtn(page, 'lidar')).toHaveCount(0);
  });

  test('the selected tab is in the URL and survives a reload; Health & Risk is the default and leaves no key', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011');
    expect(await hash(page)).toBe('#asset=TWR-132-01-011');
    for (const id of ['components', 'trends', 'maintenance', 'workorders', 'inventory']) {
      await tabBtn(page, id).click();
      expect(await hash(page)).toBe(`#asset=TWR-132-01-011&atab=${id}`);
      await expect(tabBtn(page, id)).toHaveAttribute('aria-selected', 'true');
      await expect(t(page, `a360-panel-${id}`)).toBeVisible();
    }
    await page.reload();
    await expect(tabBtn(page, 'inventory')).toHaveAttribute('aria-selected', 'true');
    await tabBtn(page, 'health').click();
    expect(await hash(page)).toBe('#asset=TWR-132-01-011');
    await visit(page, '/reliability#asset=TWR-132-01-011&atab=nonsense');
    await expect(tabBtn(page, 'health')).toHaveAttribute('aria-selected', 'true');
    await visit(page, '/reliability#asset=TWR-132-01-011&atab=components');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    expect(await hash(page)).not.toContain('atab');
  });

  test('a tab named in the URL for a tab the asset does not have falls back to Health & Risk', async ({ page }) => {
    await visit(page, '/reliability#asset=L-132-01&atab=lidar');
    await expect(tabBtn(page, 'health')).toHaveAttribute('aria-selected', 'true');
  });

  test('keyboard: arrow keys move between tabs across both groups, Home and End jump, focus follows, only the selected tab is in the tab order', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011');
    await tabBtn(page, 'health').focus();
    await expect(tabBtn(page, 'health')).toHaveAttribute('tabindex', '0');
    await expect(tabBtn(page, 'components')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowRight');
    await expect(tabBtn(page, 'components')).toBeFocused();
    await expect(tabBtn(page, 'components')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); // trends, lidar
    await page.keyboard.press('ArrowRight'); // first tab of Operations
    await expect(tabBtn(page, 'maintenance')).toBeFocused();
    expect(await hash(page)).toBe('#asset=TWR-132-01-011&atab=maintenance');
    await page.keyboard.press('End');
    await expect(tabBtn(page, 'inventory')).toBeFocused();
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(tabBtn(page, 'health')).toBeFocused();
    await page.keyboard.press('ArrowLeft'); // wraps back
    await expect(tabBtn(page, 'inventory')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabBtn(page, 'health')).toBeFocused();
    await expect(panel(page)).toHaveAttribute('aria-modal', 'true');
    await expect(t(page, 'a360-panel-health')).toHaveAttribute('role', 'tabpanel');
    await expect(t(page, 'a360-panel-health')).toHaveAttribute('aria-labelledby', 'a360-tab-health');
  });
});

test.describe('where the content went', () => {
  test('Health & Risk: breakdown, cap note, open findings, then linked assets at the foot', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011');
    const order = await t(page, 'a360-panel-health').locator('[data-section]').evaluateAll((els) => els.map((e) => e.dataset.section));
    expect(order).toEqual(['breakdown', 'findings', 'links']);
    await expect(t(page, 'cap-note')).toContainText('A condition cap applies');
    await expect(t(page, 'risk-factors')).toBeVisible(); // the scores stay above the tabs
    await expect(page.locator('[data-section="history"]')).toHaveCount(0);
  });

  test('a transformer keeps DGA, Duval, oil, tests and loading under Health & Risk, with linked assets last', async ({ page }) => {
    await visit(page, '/reliability#asset=TX-2C');
    const order = await t(page, 'a360-panel-health').locator('[data-section]').evaluateAll((els) => els.map((e) => e.dataset.section));
    for (const id of ['dga', 'duval', 'oil', 'tests', 'loading']) expect(order).toContain(id);
    expect(order.at(-1)).toBe('links');
    expect(order.indexOf('breakdown')).toBeLessThan(order.indexOf('dga'));
    await expect(tabBtn(page, 'lidar')).toHaveCount(0);
  });

  test('Components: the tower schematic inside the panel, coloured by group, and the components table', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011&atab=components');
    await expect(t(page, 'a360-schematic').locator('svg')).toBeVisible();
    const lp = t(page, 'a360-schematic').locator('[data-group="lightning_protection"]');
    await expect(lp).toHaveAttribute('data-condition', '1');
    await expect(t(page, 'a360-schematic').locator('[data-group="insulators"]')).toHaveAttribute('data-condition', '5');
    await expect(t(page, 'components').locator('tbody tr')).toHaveCount(7);
    await visit(page, '/reliability#asset=TWR-132-01-041&atab=components');
    await expect(t(page, 'a360-schematic').locator('[data-condition=""]')).toHaveCount(6); // never inspected: all zones grey
  });

  test('Condition Trends: the history chart and table, and the forecast placeholder carrying the Experimental badge', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011&atab=trends');
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    await expect(t(page, 'history-table').locator('tbody tr')).toHaveCount(4);
    await expect(t(page, 'forecast-note')).toContainText('Not built yet');
    await expect(t(page, 'forecast-note').locator('[data-register="forecast"]')).toBeVisible();
  });

  test('Maintenance History: defect timeline with thumbnails, repairs, a source line, and a way into the full screen', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-013&atab=maintenance');
    await expect(t(page, 'a360-source')).toContainText('Source: demo data');
    const rows = t(page, 'defect-timeline').locator('tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
    await expect(rows.first().locator('.a360-thumb')).toBeVisible();
    await expect(t(page, 'defect-timeline')).toContainText('closed by RPR-0038');
    await expect(t(page, 'repairs')).toContainText('RPR-0038');
    await t(page, 'open-full-history').click();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('#app-title')).toContainText('Maintenance History');
    expect(await hash(page)).toContain('unit=TWR-132-01-013');
  });

  test('Work Orders: open, planned and completed lists with counts; the empty ones say why', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-013&atab=workorders');
    await expect(t(page, 'a360-source')).toContainText('Source: demo data');
    await expect(page.locator('[data-section="wo-open"] h3')).toHaveText('Open (1)');
    await expect(page.locator('[data-section="wo-planned"] h3')).toHaveText('Planned (0)');
    await expect(page.locator('[data-section="wo-completed"] h3')).toHaveText('Completed (3)');
    await expect(t(page, 'work-orders-open').locator('tbody tr')).toHaveCount(1);
    await expect(t(page, 'work-orders-completed').locator('tbody tr')).toHaveCount(3);
    await expect(t(page, 'work-orders-planned-empty')).toContainText('No planned work');
  });

  test('Inventory & Parts says it is coming in Phase C', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-011&atab=inventory');
    await expect(t(page, 'inventory-coming')).toContainText('Coming in Phase C');
    await expect(t(page, 'a360-source')).toContainText('Source: demo data');
  });
});

// ---- screenshots: one asset of each kind, every tab, both themes
const ASSETS = [
  ['tower', 'TWR-132-01-011', ['health', 'components', 'trends', 'lidar', 'maintenance', 'workorders', 'inventory']],
  ['span', 'SPN-132-01-012-013', ['health', 'components', 'trends', 'lidar', 'maintenance', 'workorders', 'inventory']],
  ['transformer', 'TX-2C', SIX],
  ['duplicate', 'MX-TOW-1156', SIX],
  ['never-inspected', 'TWR-132-01-041', SIX],
];
test.describe('screenshots', () => {
  for (const [name, id, tabs] of ASSETS) {
    test(`${name} (${id}): every tab, both themes`, async ({ page }) => {
      for (const th of ['light', 'dark']) {
        for (const tab of tabs) {
          await visit(page, `/reliability#asset=${id}${tab === 'health' ? '' : `&atab=${tab}`}`, th);
          if (tab === 'trends') await expect(page.locator('[data-chart="history"], [data-section="history"]').first()).toBeVisible();
          if (tab === 'lidar') { await expect(t(page, 'lidar-canvas')).toHaveAttribute('data-ready', 'true'); await expect(t(page, 'lidar-profile')).toHaveAttribute('data-ready', 'true'); }
          await page.waitForTimeout(500);
          await panel(page).screenshot({ path: `${SHOTS}/${name}-${tab}-${th}.png` });
        }
      }
    });
  }
});
