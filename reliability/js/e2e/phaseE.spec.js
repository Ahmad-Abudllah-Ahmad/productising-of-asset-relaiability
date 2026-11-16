// Phase E: the Condition Trends forecast and the Dashboard card. Screenshots (both themes) go to docs/screens/phaseE/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phaseE';
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
  return errors;
}
const shot = async (page, name, th) => { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/${name}-${th}.png` }); };

/** Open Condition Trends for an asset, wait for the forecast chart (or the not-enough-history note), scroll it into view. */
async function trends(page, id, th) {
  const errors = await visit(page, `/reliability#asset=${id}&atab=trends`, th);
  const section = page.locator('[data-section="forecast"]');
  await expect(section).toBeVisible();
  await expect(section.locator('[data-register="forecast"]')).toBeVisible();
  if (await page.locator('[data-chart="forecast"]').count()) await expect(page.locator('[data-chart="forecast"]')).toHaveAttribute('data-ready', 'true');
  await section.scrollIntoViewIfNeeded();
  await page.locator('.a360-body').evaluate((el, ) => { el.scrollTop = el.scrollHeight; }).catch(() => {});
  return errors;
}

const CASES = [
  ['declining-tower', 'TWR-132-01-010', /Projected to fall into the poor band around 2027-/],
  ['stable-tower', 'TWR-132-01-002', /Stays in the normal band for 12 months/],
  ['repaired-tower', 'TWR-132-01-012', /Projected to fall into the poor band/],
  ['transformer', 'TX-1B', /Stays in the moderate band for 12 months/],
];

for (const th of ['light', 'dark']) {
  test.describe(`forecast on Condition Trends (${th})`, () => {
    for (const [name, id, crossing] of CASES) {
      test(name, async ({ page }) => {
        const errors = await trends(page, id, th);
        await expect(t(page, 'forecast-crossing')).toHaveText(crossing);
        await expect(t(page, 'forecast-heading')).toHaveAttribute('title', /\w+.*\./);
        await expect(t(page, 'forecast-drivers')).toBeVisible();
        await shot(page, name, th);
        expect(errors).toEqual([]);
      });
    }

    test('not enough history', async ({ page }) => {
      const errors = await trends(page, 'TWR-132-01-041', th);
      await expect(t(page, 'forecast-none')).toHaveText('Not enough history to forecast');
      await expect(page.locator('[data-chart="forecast"]')).toHaveCount(0);
      await shot(page, 'not-enough-history', th);
      expect(errors).toEqual([]);
    });

    test('dashboard card and its list', async ({ page }) => {
      const errors = await visit(page, '/reliability', th);
      const card = t(page, 'forecast-card');
      await expect(card).toBeVisible();
      await expect(card.locator('[data-register="forecast"]')).toBeVisible();
      await expect(card).toContainText('Projected to drop a band within 12 months');
      const n = Number(await t(page, 'forecast-count').textContent());
      expect(n).toBeGreaterThan(0);
      await shot(page, 'dashboard-card', th);
      await t(page, 'forecast-count').click();
      await expect(t(page, 'forecast-table').locator('tbody tr')).toHaveCount(n);
      await card.scrollIntoViewIfNeeded();
      await shot(page, 'dashboard-drilldown', th);
      // a row opens the asset on its Condition Trends tab
      await t(page, 'forecast-table').locator('tbody tr').first().click();
      await expect(page).toHaveURL(/atab=trends/);
      await expect(t(page, 'forecast-crossing')).toContainText('Projected to fall into');
      expect(errors).toEqual([]);
    });
  });
}

test('the forecast follows the as-of date and the Experimental badge reads the register', async ({ page }) => {
  await visit(page, '/reliability#asset=TWR-132-01-010&atab=trends');
  await expect(t(page, 'forecast-crossing')).toContainText('Projected to fall into');
  await expect(page.locator('[data-section="forecast"] [data-register="forecast"]')).toHaveAttribute('title', /Experimental.*Validation register entry: forecast/);
});
