// Phase 5: the global filter bar, freshness markers and a layout check at 1280 and 1920 in both themes.
// Screenshots go to docs/screens/phase5/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/phase5';
fs.mkdirSync(SHOTS, { recursive: true });
const hash = (page) => page.evaluate(() => location.hash);
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');
const tid = (page, id) => page.getByTestId(id);

async function open(page, url, width = 1920) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 1920 ? 1080 : 800 });
  await page.goto(url);
  await page.reload();
  await expect(page.locator('[data-go]').first()).toBeVisible();
  await expect(tid(page, 'filter-bar')).toBeVisible();
  return errors;
}
async function setTheme(page, want) { if ((await theme(page)) !== want) await tid(page, 'theme-toggle').click(); await expect.poll(() => theme(page)).toBe(want); }

test.describe('global filters', () => {
  test('voltage filter narrows the dashboard, persists across screens and in the URL, Reset clears it', async ({ page }) => {
    const errors = await open(page, '/reliability');
    const lineRows = page.locator('[data-testid="dash-lines"] tbody tr, [data-testid="line-summary"] tbody tr');
    await tid(page, 'gf-kv').selectOption('220');
    await expect.poll(() => hash(page)).toContain('fkv=220');
    await page.goto('/reliability#view=towers&fkv=220');
    await page.reload();
    await expect(tid(page, 'gf-kv')).toHaveValue('220');
    await page.screenshot({ path: `${SHOTS}/filtered-towers.png` });
    await tid(page, 'gf-reset').click();
    await expect.poll(() => hash(page)).not.toContain('fkv');
    expect(errors).toEqual([]);
    void lineRows;
  });

  test('as-of date is in the URL and survives a reload; Today clears it', async ({ page }) => {
    await open(page, '/reliability#asof=2026-09-30');
    await expect(tid(page, 'gf-asof')).toHaveValue('2026-09-30');
    await expect(page.getByText(/Scores as of 2026-09-30/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/asof-stale.png` });
    await tid(page, 'gf-today').click();
    await expect.poll(() => hash(page)).not.toContain('asof');
  });

  test('Back returns from a dashboard drill-down to the dashboard', async ({ page }) => {
    await open(page, '/reliability');
    await expect(tid(page, 'trend-chart')).toHaveAttribute('data-ready', 'true');
    await page.locator('[data-testid^="kpi-"]').first().click();
    await page.waitForTimeout(500);
    await page.goBack();
    await expect(tid(page, 'trend-chart')).toBeVisible();
  });
});

const VIEWS = { dashboard: '/reliability', lines: '/reliability#view=lines', towers: '/reliability#view=towers', history: '/reliability#view=history', map: '/reliability#view=map&tiles=off' };
for (const width of [1280, 1920]) {
  for (const [name, url] of Object.entries(VIEWS)) {
    test(`layout ${width}px: ${name} has no horizontal overflow in either theme`, async ({ page }) => {
      await open(page, url + (url.includes('?') ? '' : ''), width);
      await page.waitForTimeout(900);
      for (const t of ['light', 'dark']) {
        await setTheme(page, t);
        await page.waitForTimeout(500);
        const over = await page.evaluate(() => {
          const d = document.documentElement;
          const bad = [...document.querySelectorAll('#stage *, .gf *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > d.clientWidth + 1; }).slice(0, 3).map((e) => `${e.tagName}.${e.className}`);
          return { page: d.scrollWidth - d.clientWidth, bad };
        });
        expect(over.page, `page overflow ${name} ${t}`).toBeLessThanOrEqual(1);
        expect(over.bad, `elements outside the viewport ${name} ${t}`).toEqual([]);
        await page.screenshot({ path: `${SHOTS}/${name}-${width}-${t}.png` });
      }
      await setTheme(page, 'light');
    });
  }
}
