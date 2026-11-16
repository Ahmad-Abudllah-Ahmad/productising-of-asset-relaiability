// Phase D: the ERP integration layer in the browser. With no environment variables the API serves the mock SAP adapter.
// Screenshots (both themes) go to docs/screens/phaseD/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phaseD';
fs.mkdirSync(SHOTS, { recursive: true });
const t = (page, id) => page.getByTestId(id);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');

async function visit(page, url, th = 'light', size = { width: 1920, height: 1080 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(size);
  await page.goto('/reliability');
  await page.evaluate((v) => { localStorage.setItem('nexus.reliability.theme', v); localStorage.removeItem('nexus.reliability.source'); localStorage.removeItem('nexus.reliability.demo.v1'); }, th);
  await page.goto(url); await page.reload();
  await expect.poll(() => theme(page)).toBe(th);
  await expect(page.locator('[data-go]').first()).toBeVisible();
  return errors;
}
const shot = async (page, name, th, clip) => { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${name}-${th}.png`, ...(clip ? { clip } : {}) }); };
const links = async (page) => { await page.locator('[data-go]').nth(2).click(); await page.locator('#tabs [data-tab]', { hasText: /^Links$/ }).click(); };

test.describe('the API', () => {
  test('/api/erp/* responds: status, records, raw (OData V2), and refuses writes', async ({ request }) => {
    const st = await request.get('/api/erp/status');
    expect(st.status()).toBe(200);
    const j = await st.json();
    expect([j.adapter, j.readOnly, j.configured]).toEqual(['mock-sap', true, true]);
    expect(j.counts.workOrders).toBeGreaterThan(100);
    const raw = await request.get('/api/erp/raw/work-orders');
    expect((await raw.json()).d.results[0]).toHaveProperty('MaintenanceOrder');
    expect((await request.get('/api/erp/records')).status()).toBe(200);
    expect((await request.post('/api/erp/records')).status()).toBe(405);
    expect((await request.get('/api/erp/raw/nope')).status()).toBe(404);
  });
});

test.describe('the data-source switch and the banner', () => {
  test('default is the demo seed: the Demo data banner, "Source: demo data", no ERP request', async ({ page }) => {
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('/api/erp/')) calls.push(r.url()); });
    await visit(page, '/reliability');
    await expect(t(page, 'demo-banner')).toBeVisible();
    await expect(t(page, 'erp-banner')).toHaveCount(0);
    await expect(t(page, 'source-switch')).toHaveValue('seed');
    await expect(t(page, 'source-badge')).toContainText('Source: demo data');
    expect(calls).toEqual([]);
  });

  test('switching to ERP: the page reloads from the integration API, the Demo data banner goes, the ERP banner and source badges appear, and it is remembered', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      const errors = await visit(page, '/reliability', th);
      await shot(page, 'banner-seed', th, { x: 0, y: 0, width: 1920, height: 330 });
      await t(page, 'source-switch').selectOption('erp');
      await expect(t(page, 'erp-banner')).toBeVisible();
      await expect(t(page, 'demo-banner')).toHaveCount(0);
      await expect(t(page, 'erp-banner')).toContainText('SAP (mock)');
      await expect(t(page, 'erp-banner')).toContainText(/synced \d/);
      await expect(t(page, 'source-switch')).toHaveValue('erp');
      await expect(t(page, 'source-badge').first()).toContainText(/^Work orders and parts · Source: SAP \(mock\) · synced \d/);
      await shot(page, 'banner-erp', th, { x: 0, y: 0, width: 1920, height: 330 });
      await page.reload();
      await expect(t(page, 'erp-banner')).toBeVisible(); // remembered in this browser
      await t(page, 'source-switch').selectOption('seed');
      await expect(t(page, 'demo-banner')).toBeVisible();
      await expect(t(page, 'erp-banner')).toHaveCount(0);
      expect(errors).toEqual([]);
    }
  });

  test('?source=erp for one visit; the Demo data banner is off in erp mode on every screen', async ({ page }) => {
    await visit(page, '/reliability?source=erp');
    for (const i of [0, 1, 2, 3, 4, 5, 6]) {
      await page.locator('[data-go]').nth(i).click();
      await expect(t(page, 'demo-banner')).toHaveCount(0);
      await expect(t(page, 'erp-banner')).toHaveCount(1);
    }
  });

  test('if the API cannot be reached the page falls back to the demo data and says so', async ({ page }) => {
    await page.route('**/api/erp/records', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'down', message: 'The ERP layer is down.' } }) }));
    await visit(page, '/reliability?source=erp');
    await expect(t(page, 'demo-banner')).toBeVisible();
    await expect(t(page, 'erp-error')).toContainText('The ERP layer is down.');
    await expect(t(page, 'source-badge').first()).toContainText('Source: demo data');
    for (const th of ['light', 'dark']) { await visit(page, '/reliability?source=erp', th); await shot(page, 'banner-fallback', th, { x: 0, y: 0, width: 1920, height: 330 }); }
  });
});

test.describe('source badges on ERP-sourced panels', () => {
  test('Asset 360 Maintenance History, Work Orders and Inventory & Parts; Maintenance History Work orders and Parts & Inventory; the dashboard', async ({ page }) => {
    await visit(page, '/reliability?source=erp#asset=TWR-132-01-013&atab=maintenance', 'light', { width: 1440, height: 1250 });
    for (const tab of ['maintenance', 'workorders', 'inventory']) {
      await t(page, `a360-tab-${tab}`).click();
      await expect(t(page, 'a360-source-badge')).toContainText(/^Source: SAP \(mock\) · synced \d/);
    }
    await t(page, 'a360-tab-workorders').click();
    await expect(t(page, 'work-orders-open')).toContainText('WO-0');
    await page.keyboard.press('Escape');
    await visit(page, '/reliability?source=erp#view=history');
    await page.locator('#tabs [data-tab]', { hasText: /^Work orders$/ }).click();
    await expect(t(page, 'hl-head').getByTestId('source-badge')).toContainText('Source: SAP (mock)');
    await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
    await expect(t(page, 'hl-head').getByTestId('source-badge')).toContainText('Source: SAP (mock)');
    await expect(t(page, 'blocked-wo').locator('tbody tr').first()).toBeVisible();
    // the same asset in demo mode says demo data
    await visit(page, '/reliability#asset=TWR-132-01-013&atab=workorders');
    await expect(t(page, 'a360-source-badge')).toContainText('Source: demo data');
  });

  test('screenshots: Asset 360 work orders and the Parts tab in erp mode, both themes', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability?source=erp#asset=TX-2C&atab=workorders', th, { width: 1440, height: 1000 });
      await expect(t(page, 'a360-source-badge')).toBeVisible();
      await page.waitForTimeout(500); await t(page, 'asset-panel').screenshot({ path: `${SHOTS}/asset-source-${th}.png` });
      await visit(page, '/reliability?source=erp#view=history', th, { width: 1920, height: 1080 });
      await page.locator('#tabs [data-tab]', { hasText: /^Parts & Inventory$/ }).click();
      await expect(t(page, 'blocked-wo')).toBeVisible();
      await shot(page, 'parts-source', th);
      await visit(page, '/reliability?source=erp', th);
      await expect(t(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
      await shot(page, 'dashboard-erp', th);
    }
  });
});

test.describe('unmatched ERP records in the Links tab', () => {
  test('three ERP locations await a match, with matcher suggestions; linking one moves its work order onto the asset; ignore and undo work', async ({ page }) => {
    const errors = await visit(page, '/reliability?source=erp');
    await links(page);
    await expect(t(page, 'erp-records')).toBeVisible();
    await expect(t(page, 'erp-records').locator('h3')).toHaveText('ERP records awaiting a match (3)');
    await expect(t(page, 'erp-record')).toHaveCount(3);
    const tower = t(page, 'erp-record').filter({ hasText: 'SAP-TWR-13201120' });
    await expect(tower).toContainText('T-20A');
    await expect(tower.getByTestId('erp-candidate').first()).toContainText('T-020');
    await expect(tower.getByTestId('erp-candidate').first().locator('.erp-score')).toHaveText(/^0\.\d\d$/);
    await expect(t(page, 'erp-records').locator('[data-register="resemblance"]').first()).toBeVisible();
    await expect(t(page, 'erp-record').filter({ hasText: 'SAP-YARD-CRANE-07' }).getByTestId('erp-no-candidate')).toBeVisible();
    for (const th of ['light']) await shot(page, 'unmatched', th);
    await tower.getByTestId('erp-link').first().click();
    await expect(tower.getByTestId('erp-decided')).toContainText('Linked to TWR-132-01-020');
    await expect(t(page, 'erp-records').locator('h3')).toHaveText('ERP records awaiting a match (2)');
    // its work order now belongs to T-020
    await page.goto('/reliability?source=erp#asset=TWR-132-01-020&atab=workorders');
    await expect(t(page, 'work-orders-planned')).toContainText('SAP-42000001'); // due 2026-12-06, so it is listed as planned
    // undo, ignore
    await page.keyboard.press('Escape');
    await page.goto('/reliability?source=erp'); await page.reload(); await links(page);
    const again = t(page, 'erp-record').filter({ hasText: 'SAP-TWR-13201120' });
    await again.getByTestId('erp-reopen').click();
    await expect(again).toHaveAttribute('data-status', 'open');
    await t(page, 'erp-record').filter({ hasText: 'SAP-YARD-CRANE-07' }).getByTestId('erp-ignore').click();
    await expect(t(page, 'erp-record').filter({ hasText: 'SAP-YARD-CRANE-07' })).toHaveAttribute('data-status', 'ignored');
    expect(errors).toEqual([]);
  });

  test('in demo mode the Links tab has no ERP section', async ({ page }) => {
    await visit(page, '/reliability');
    await links(page);
    await expect(t(page, 'erp-records')).toBeHidden();
  });

  test('screenshots: before and after a match, both themes', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability?source=erp', th);
      await links(page);
      await expect(t(page, 'erp-record')).toHaveCount(3);
      await shot(page, 'links-unmatched', th);
      await t(page, 'erp-record').filter({ hasText: 'SAP-TWR-13201120' }).getByTestId('erp-link').first().click();
      await expect(t(page, 'erp-decided')).toHaveCount(1);
      await shot(page, 'links-matched', th);
    }
  });
});
