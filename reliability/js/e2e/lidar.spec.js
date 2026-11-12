// Simulated LiDAR: the tab in Asset 360 (towers and spans), the tab in the finding viewer, the colour modes, the controls,
// the profile and the table fallback. Screenshots go to docs/screens/lidar/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/lidar';
fs.mkdirSync(SHOTS, { recursive: true });
const t = (page, id) => page.getByTestId(id);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const VIOLATION = 'SPN-132-01-012-013'; // clearance 6.8 m, limit 7.0 m
const GOOD = 'SPN-132-01-026-027'; // 9.8 m

async function visit(page, url, th = 'light') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/reliability');
  await page.evaluate((v) => localStorage.setItem('nexus.reliability.theme', v), th);
  await page.goto(url); await page.reload();
  await expect.poll(() => theme(page)).toBe(th);
  return errors;
}
const ready = async (page) => { await expect(t(page, 'lidar-canvas')).toHaveAttribute('data-ready', 'true'); await expect(t(page, 'lidar-profile')).toHaveAttribute('data-ready', 'true'); await page.waitForTimeout(400); };
const cam = (page) => t(page, 'lidar-canvas').evaluate((el) => el.__lidar.state());
const panelEl = (page) => page.getByTestId('asset-panel');

test.describe('simulated LiDAR', () => {
  test('a span with a violation: labelled "Simulated LiDAR", numbers match, red in clearance mode, profile marks the lowest point, both themes', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      const errors = await visit(page, `/reliability#asset=${VIOLATION}&atab=lidar`, th);
      await ready(page);
      await expect(t(page, 'lidar-label')).toHaveText('Simulated LiDAR');
      await expect(t(page, 'lidar-stats')).toContainText('Clearance 6.8 m');
      await expect(t(page, 'lidar-stats')).toContainText('limit 7 m');
      await expect(t(page, 'lidar-violation')).toContainText('violation');
      await t(page, 'lidar-canvas').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/span-class-${th}.png` });
      await t(page, 'lidar-mode-clearance').click();
      await expect(t(page, 'lidar-mode-clearance')).toHaveAttribute('aria-pressed', 'true');
      await expect(t(page, 'lidar-legend')).toContainText('violation');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/span-clearance-${th}.png` });
      await t(page, 'lidar-profile').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/span-profile-${th}.png` });
      expect(errors).toEqual([]);
    }
  });

  test('a span within the limit says so and has no red points', async ({ page }) => {
    await visit(page, `/reliability#asset=${GOOD}&atab=lidar`);
    await ready(page);
    await expect(t(page, 'lidar-stats')).toContainText('Clearance 9.8 m');
    await expect(t(page, 'lidar-stats')).toContainText('within the limit');
    await expect(t(page, 'lidar-violation')).toHaveCount(0);
  });

  test('controls: zoom, reset, point size, orbit by dragging, colour mode', async ({ page }) => {
    await visit(page, `/reliability#asset=${GOOD}&atab=lidar`);
    await ready(page);
    const c0 = await cam(page);
    await t(page, 'lidar-zoom-in').click();
    expect((await cam(page)).dist).toBeLessThan(c0.dist);
    await t(page, 'lidar-zoom-out').click(); await t(page, 'lidar-zoom-out').click();
    expect((await cam(page)).dist).toBeGreaterThan(c0.dist);
    await t(page, 'lidar-size').fill('5');
    expect((await cam(page)).size).toBe(5);
    const box = await t(page, 'lidar-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    expect((await cam(page)).az).not.toBe(c0.az);
    await t(page, 'lidar-reset').click();
    const c1 = await cam(page);
    expect([c1.dist, c1.az]).toEqual([c0.dist, c0.az]);
    await t(page, 'lidar-mode-class').click();
    await expect(t(page, 'lidar-legend')).toContainText('Vegetation');
  });

  test('a tower: the LiDAR tab offers both of its spans, tightest first; the tab is in the URL; Overview returns', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-013');
    await expect(t(page, 'a360-tab-lidar')).toBeVisible();
    await t(page, 'a360-tab-lidar').click();
    await expect(page).toHaveURL(/atab=lidar/);
    await ready(page);
    const options = await t(page, 'lidar-span').locator('option').allTextContents();
    expect(options).toHaveLength(2);
    expect(options[0]).toBe('T-012/T-013 (6.8 m)');
    await t(page, 'a360-tab-overview').click();
    await expect(page).not.toHaveURL(/atab/);
    await expect(t(page, 'findings')).toBeVisible();
  });

  test('components and lines have no LiDAR tab', async ({ page }) => {
    await visit(page, '/reliability#asset=EW-132-01-011');
    await expect(panelEl(page)).toBeVisible();
    await expect(t(page, 'a360-tab-lidar')).toHaveCount(0);
  });

  test('the finding viewer has a LiDAR tab for a finding on a tower or span; a vegetation finding shows its photo on RGB and the scan on LiDAR', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability#finding=F-0024', th);
      await expect(t(page, 'stage-rgb')).toHaveAttribute('data-ready', 'true');
      await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Inspection image');
      await page.getByRole('tab', { name: /LiDAR/ }).click();
      await expect(page).toHaveURL(/mode=lidar/);
      await ready(page);
      await expect(t(page, 'lidar-label')).toHaveText('Simulated LiDAR');
      await page.screenshot({ path: `${SHOTS}/finding-${th}.png` });
    }
  });

  test('without WebGL the table of clearance values is shown instead of the 3D view', async ({ page }) => {
    await visit(page, `/reliability?webgl=off#asset=${VIOLATION}&atab=lidar`);
    await expect(t(page, 'lidar-fallback')).toBeVisible();
    await expect(t(page, 'lidar-canvas')).toHaveCount(0);
    await expect(t(page, 'lidar-label')).toHaveText('Simulated LiDAR');
    await expect(t(page, 'lidar-table')).toBeVisible();
    const rows = await t(page, 'lidar-table').locator('tbody tr').count();
    expect(rows).toBeGreaterThan(8);
    await expect(t(page, 'lidar-table').locator('.ld-row-bad').first()).toBeVisible();
    await expect(t(page, 'lidar-profile')).toHaveAttribute('data-ready', 'true');
    for (const th of ['light', 'dark']) {
      await visit(page, `/reliability?webgl=off#asset=${VIOLATION}&atab=lidar`, th);
      await expect(t(page, 'lidar-fallback')).toBeVisible(); await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/fallback-${th}.png` });
    }
  });

  test('three.js is loaded only when a LiDAR view opens', async ({ page }) => {
    const seen = [];
    page.on('request', (r) => { if (/three\.module/.test(r.url())) seen.push(r.url()); });
    await visit(page, `/reliability#asset=${GOOD}`);
    await expect(t(page, 'a360-tab-lidar')).toBeVisible();
    await page.waitForTimeout(600);
    expect(seen).toHaveLength(0);
    await t(page, 'a360-tab-lidar').click(); await ready(page);
    expect(seen.length).toBe(1);
  });
});
