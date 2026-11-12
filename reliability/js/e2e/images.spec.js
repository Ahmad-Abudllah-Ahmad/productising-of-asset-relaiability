// Real reference photos and placeholders in the finding viewer and thumbnail lists. Screenshots go to docs/screens/images/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/images';
fs.mkdirSync(SHOTS, { recursive: true });
const t = (page, id) => page.getByTestId(id);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
/** Open a URL in a theme (the toggle is inert behind the viewer, so the choice is stored before the page loads). */
async function visit(page, url, th) {
  await page.goto('/reliability');
  await page.evaluate((v) => localStorage.setItem('nexus.reliability.theme', v), th);
  await page.goto(url); await page.reload();
  await expect.poll(() => theme(page)).toBe(th);
}

const REAL = [
  ['F-0067', 'TWR-132-01-007', 'insulator_missing_disc', /BGI dataset/],
  ['F-0026', 'TWR-132-01-003', 'bird_nest', /Wikimedia Commons/],
  ['F-0044', 'TWR-500-01-003', 'steel_corrosion', /Wikimedia Commons/],
  ['F-0224', 'TX-1A', 'radiator_corrosion', /Wikimedia Commons/],
];
const PLACEHOLDER = ['F-0308', 'TWR-132-01-011'];

const OWN = [
  ['F-0001', 'TWR-500-01-006', 'broken_strand', 'rgb'],
  ['F-0033', 'TWR-132-01-017', 'steel_corrosion', 'rgb'],
  ['F-0024', 'TWR-220-03-029', 'vegetation_encroachment', 'lidar'],
];

test.describe('reference photos and placeholders', () => {
  test.use({ viewport: { width: 1440, height: 1250 } });
  for (const [id, asset, cls, src] of REAL) {
    test(`${cls}: ${id} shows a labelled, credited reference photo with a box, in both themes`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const th of ['light', 'dark']) {
        await visit(page, `/reliability#asset=${asset}&finding=${id}`, th);
        await expect(t(page, 'stage-rgb')).toHaveAttribute('data-ready', 'true');
        await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Reference photo');
        await expect(t(page, 'credit')).toContainText(src);
        await expect(t(page, 'credit')).toContainText('not from this asset');
        await expect(t(page, 'box-label')).toBeVisible();
        await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${cls}-${th}.png` });
      }
      expect(errors).toEqual([]);
    });
  }

  test('a class with no real image: "Placeholder – no real image yet", no box drawn, honest caption, both themes', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, `/reliability#asset=${PLACEHOLDER[1]}&finding=${PLACEHOLDER[0]}`, th);
      await expect(t(page, 'stage-rgb')).toHaveAttribute('data-ready', 'true');
      await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Placeholder – no real image yet');
      await expect(t(page, 'credit')).toHaveText('Placeholder – no real image yet · not from this asset');
      await expect(t(page, 'box-label')).toBeHidden(); // nothing to mark on a placeholder
      await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/placeholder-${th}.png` });
    }
  });

  test('thumbnails: Asset 360 shows reference photos and placeholder tiles', async ({ page }) => {
    await visit(page, '/reliability#asset=TWR-132-01-007', 'light');
    const real = page.getByTestId('asset-panel').locator('.a360-thumb:not(.a360-thumb-empty)').first();
    await expect(real).toBeVisible();
    await expect(real.locator('.a360-demo')).toHaveText('Ref');
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability#asset=TWR-132-01-011', th);
      await expect(page.getByTestId('asset-panel').locator('.a360-thumb-ph').first()).toHaveText('Placeholder');
      await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/thumbs-${th}.png` });
    }
  });

  test('the credits section lists every real image and every placeholder class', async ({ page }) => {
    await page.goto('/reliability#asset=TWR-132-01-007&finding=F-0067');
    await expect(t(page, 'stage-rgb')).toHaveAttribute('data-ready', 'true');
    await t(page, 'credits').locator('summary').click();
    await expect(t(page, 'credit-list').locator('li')).toHaveCount(9);
    await expect(t(page, 'credit-placeholders')).toContainText('Earthwire damaged');
    await expect(t(page, 'credit-placeholders')).not.toContainText('Bird nest');
    await page.screenshot({ path: `${SHOTS}/credits.png` });
  });

  for (const [id, asset, cls, sensor] of OWN) {
    test(`${cls}: ${id} (${sensor}) shows our own inspection image, captioned "Inspection image", no second box, at native size, both themes`, async ({ page }) => {
      for (const th of ['light', 'dark']) {
        await visit(page, `/reliability#asset=${asset}&finding=${id}`, th);
        await expect(t(page, 'stage-rgb')).toHaveAttribute('data-ready', 'true');
        await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Inspection image');
        await expect(t(page, 'credit')).toHaveText(/^Inspection image/);
        await expect(t(page, 'credit')).not.toContainText('not from this asset');
        await expect(t(page, 'box-label')).toBeHidden(); // the boxes are burned into the picture
        await expect(t(page, 'demo-label-crop')).toHaveCount(0);
        const sz = await t(page, 'stage-rgb').evaluate((el) => { const c = el.querySelector('canvas'); const r = el.getBoundingClientRect(); return { cw: c.width, rw: r.width }; });
        expect(sz.rw).toBeLessThanOrEqual(sz.cw + 2); // never shown larger than the picture itself
        await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/own-${cls}-${th}.png` });
      }
    });
  }

  test('a tower with no findings shows the healthy example, labelled as an example', async ({ page }) => {
    for (const th of ['light', 'dark']) {
      await visit(page, '/reliability#asset=TWR-132-01-006', th);
      const fig = t(page, 'healthy-example');
      await expect(fig).toBeVisible();
      await expect(fig).toContainText('Healthy example');
      await expect(fig).toContainText('not a picture of this tower');
      await fig.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/healthy-${th}.png` });
    }
    await visit(page, '/reliability#asset=TWR-132-01-011', 'light');
    await expect(t(page, 'healthy-example')).toHaveCount(0);
  });
});
