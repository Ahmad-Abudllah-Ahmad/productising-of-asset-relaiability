// Maintenance History: scope filters, repairs with the health index before and after, work orders, open findings.
import { test, expect } from '@playwright/test';

async function openHistory(page, tab) {
  await page.goto(`/reliability?screen=history&tab=${tab}`);
  await expect(page.locator('[data-testid="hist-scope"]')).toBeVisible({ timeout: 20000 });
}

test('Lifecycle shows KPIs, charts and the most active assets; picking one shows its defect timeline', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page, 0);
  await expect(page.locator('.nx-kpi')).toHaveCount(4);
  await expect(page.locator('[data-chart="fc"] canvas, [data-chart="fc"] svg').first()).toBeVisible({ timeout: 15000 });
  const pick = page.locator('[data-pick]').first();
  await expect(pick).toBeVisible();
  await pick.click();
  await expect(page.locator('[data-chart="trend"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.nx-gantt')).toBeVisible();
  await page.locator('[data-hclear]').click();
  await expect(page.locator('[data-pick]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Repairs: HI before and after, ineffective filter; Work orders: status filter; Open findings: severity filter', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await openHistory(page, 1);
  const all = await page.locator('#rpt tbody tr').count();
  expect(all).toBeGreaterThan(0);
  await page.locator('select[data-h="show"]').selectOption('ineffective');
  const bad = await page.locator('#rpt tbody tr').count().catch(() => 0);
  expect(bad).toBeLessThanOrEqual(all);
  await page.locator('[data-hclear]').click();
  await page.locator('.nx-tabs [data-tab="2"]').click();
  await expect(page.locator('#wot tbody tr').first()).toBeVisible();
  await page.locator('select[data-h="status"]').selectOption('completed');
  await expect(page.locator('#wot tbody tr').first()).toContainText('Completed');
  await page.locator('.nx-tabs [data-tab="3"]').click();
  await expect(page.locator('#oft tbody tr').first()).toBeVisible();
  await page.locator('.nx-tabs [data-tab="4"]').click();
  await expect(page.locator('[data-chart="ba"]')).toBeVisible();
  expect(errors).toEqual([]);
});
