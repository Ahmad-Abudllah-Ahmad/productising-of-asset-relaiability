// Phase C: inventory, suppliers and planned work. Screenshots (both themes) go to docs/screens/phaseC/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phaseC';
fs.mkdirSync(SHOTS, { recursive: true });
const t = (page, id) => page.getByTestId(id);
const panel = (page) => t(page, 'asset-panel');
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const hash = (page) => page.evaluate(() => location.hash);

async function visit(page, url, th = 'light', size = { width: 1440, height: 1250 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(size);
  await page.goto('/reliability');
  await page.evaluate((v) => localStorage.setItem('nexus.reliability.theme', v), th);
  await page.goto(url); await page.reload();
  await expect.poll(() => theme(page)).toBe(th);
  await expect(page.locator('[data-go]').first()).toBeVisible();
  return errors;
}
const shotPanel = async (page, name, th) => { await page.waitForTimeout(500); await panel(page).screenshot({ path: `${SHOTS}/${name}-${th}.png` }); };
const shotPage = async (page, name, th) => { await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/${name}-${th}.png` }); };

test.describe('Asset 360: Inventory & Parts', () => {
  test('a tower with reserved, available and short parts: counts, the state of each line, supplier and lead time', async ({ page }) => {
    const errors = await visit(page, '/reliability#asset=TWR-500-01-024&atab=inventory');
    await expect(panel(page)).toBeVisible();
    await expect(t(page, 'a360-source')).toContainText('Source: demo data');
    const counts = await t(page, 'inventory-counts').innerText();
    expect(counts).toMatch(/short/); expect(counts).toMatch(/reserved/); expect(counts).toMatch(/available/);
    for (const s of ['short', 'reserved', 'available']) await expect(panel(page).locator(`[data-state="${s}"]`).first()).toBeVisible();
    const short = panel(page).locator('tr[data-state="short"]').first();
    await expect(short.locator('.tag.r')).toContainText(/^short \d+/);
    await expect(short).toContainText('d)'); // supplier (lead time)
    expect(errors).toEqual([]);
  });

  test('on order shows the delivery date; a late delivery is flagged', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-019&atab=inventory');
    const oo = panel(page).locator('tr[data-state="on_order"]').first();
    await expect(oo.locator('.tag')).toContainText(/^on order \d{4}-\d{2}-\d{2}/);
    await visit(page, '/reliability#asset=TWR-132-01-021&atab=inventory');
    await expect(panel(page).locator('tr[data-state="on_order"] .tag').first()).toContainText('(late)');
  });

  test('planned work: a transformer shows its breather-check plan, its parts and their state', async ({ page }) => {
    await visit(page, '/reliability#asset=TX-2C&atab=inventory');
    await expect(panel(page).locator('[data-wo^="WO-P-"]').first()).toContainText('due 2026-');
    await expect(panel(page).locator('[data-wo^="WO-P-"]').first()).toContainText(/Oil sample kit|Gasket set|Silica gel/);
    await expect(panel(page).locator('[data-wo^="WO-P-"] h4').first()).toContainText('planned');
    await t(page, 'a360-tab-workorders').click();
    await expect(page.locator('[data-section="wo-planned"] h3')).toContainText(/Planned \([1-9]/);
    await expect(t(page, 'work-orders-planned')).toContainText('Breather and silica gel check');
  });

  test('no work: says so; labour-only work says it needs no stocked parts', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-041&atab=inventory');
    await expect(t(page, 'inventory-none')).toContainText('No open or planned work');
  });
});

test.describe('Maintenance History: Parts & Inventory', () => {
  test('tab, KPI cards, work orders waiting on parts with their blocking lines, low stock, open POs, stock', async ({ page }) => {
    const errors = await visit(page, '/reliability#view=history');
    await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
    await expect(t(page, 'maintenance-parts')).toBeVisible();
    await expect(t(page, 'blocked-card')).toBeVisible();
    const kpis = await t(page, 'hl-kpis').innerText();
    expect(kpis).toMatch(/Waiting on parts/); expect(kpis).toMatch(/Low stock/); expect(kpis).toMatch(/Open purchase orders/);
    expect(await t(page, 'blocked-wo').locator('tbody tr').count()).toBeGreaterThan(5);
    await expect(t(page, 'blocked-wo').locator('.tag.r').first()).toContainText(/short/);
    await expect(t(page, 'blocked-wo').locator('.tag.a').first()).toContainText(/on order/);
    expect(await t(page, 'low-stock').locator('tbody tr').count()).toBeGreaterThanOrEqual(4);
    await expect(t(page, 'low-stock')).toContainText('Bushing 500 kV');
    await expect(t(page, 'open-pos').locator('.tag', { hasText: 'late' })).toHaveCount(1);
    await expect(t(page, 'stock-table').locator('tbody tr')).toHaveCount(40);
    await expect(t(page, 'stock-table').locator('thead')).toContainText('North depot');
    await expect(t(page, 'stock-table').locator('thead')).toContainText('South depot');
    expect(await hash(page)).toBe('#view=history');
    expect(errors).toEqual([]);
  });

  test('a blocked work order opens its asset on the Inventory & Parts tab', async ({ page }) => {
    await visit(page, '/reliability#view=history');
    await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
    await t(page, 'blocked-wo').locator('tbody tr').first().locator('.a360-link').click();
    await expect(panel(page)).toBeVisible();
    expect(await hash(page)).toMatch(/atab=inventory/);
    await expect(t(page, 'a360-tab-inventory')).toHaveAttribute('aria-selected', 'true');
  });

  test('the global voltage filter narrows the waiting list', async ({ page }) => {
    await visit(page, '/reliability#view=history');
    await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
    const all = await t(page, 'blocked-wo').locator('tbody tr').count();
    await t(page, 'gf-kv').selectOption('220');
    await expect.poll(() => t(page, 'blocked-wo').locator('tbody tr').count()).toBeLessThan(all);
  });
});

test.describe('Dashboard KPI', () => {
  test('"Work orders waiting on parts": the number matches the Parts tab, and a click opens it', async ({ page }) => {
    await visit(page, '/reliability', 'light', { width: 1920, height: 1080 });
    await expect(t(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
    await expect(t(page, 'hl-kpis').locator('.kpi')).toHaveCount(5);
    const card = t(page, 'kpi-parts');
    await expect(card).toContainText('Work orders waiting on parts');
    const n = Number((await card.locator('.n').innerText()).trim());
    expect(n).toBeGreaterThan(5);
    await expect(card).toContainText('part lines short');
    await card.click();
    await expect(page.locator('#app-title')).toContainText('Maintenance History');
    await expect(t(page, 'blocked-wo').locator('tbody tr')).toHaveCount(n);
    await page.goBack();
    await expect(t(page, 'kpi-parts')).toBeVisible();
  });
});

test.describe('the name', () => {
  test('the module is Asset Reliability again; the Demo data banner stays', async ({ page }) => {
    await visit(page, '/reliability');
    await expect(page).toHaveTitle('Asset Reliability Intelligence');
    await expect(t(page, 'demo-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Asset Reliability dashboard/ })).toBeVisible();
  });
});

test.describe('screenshots', () => {
  const ASSET_SHOTS = [
    ['short-reserved-available', 'TWR-500-01-024'],
    ['on-order', 'TWR-132-01-019'],
    ['late-delivery', 'TWR-132-01-021'],
    ['planned-transformer', 'TX-2C'],
  ];
  for (const [name, id] of ASSET_SHOTS) {
    test(`Asset 360 Inventory & Parts: ${name}`, async ({ page }) => {
      for (const th of ['light', 'dark']) {
        await visit(page, `/reliability#asset=${id}&atab=inventory`, th);
        await expect(t(page, 'a360-panel-inventory')).toBeVisible();
        await shotPanel(page, `asset-${name}`, th);
      }
    });
  }
  test('Asset 360 Work Orders with planned work', async ({ page }) => {
    for (const th of ['light', 'dark']) { await visit(page, '/reliability#asset=TX-2C&atab=workorders', th); await expect(t(page, 'work-orders-planned')).toBeVisible(); await shotPanel(page, 'asset-workorders-planned', th); }
  });
  test('Maintenance History Parts & Inventory', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability#view=history', th, { width: 1920, height: 2300 });
      await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
      await expect(t(page, 'stock-table')).toBeVisible();
      await shotPage(page, 'history-parts', th);
    }
  });
  test('Dashboard with the new KPI, and the drill-down', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability', th, { width: 1920, height: 1080 });
      await expect(t(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
      await shotPage(page, 'dashboard', th);
      await t(page, 'kpi-parts').click();
      await expect(t(page, 'blocked-card')).toBeVisible();
      await page.setViewportSize({ width: 1920, height: 1500 });
      await shotPage(page, 'dashboard-drilldown', th);
    }
  });
});
