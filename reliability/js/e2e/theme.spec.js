// Dark theme: toggle, memory per browser, every main view in both themes (screenshots in docs/screens/step3d/).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/step3d';
fs.mkdirSync(SHOTS, { recursive: true });
const rail = (page) => page.locator('[data-go]');
const tab = (page, name) => page.locator('#tabs [data-tab]', { hasText: new RegExp(`^${name}$`) });
const toggle = (page) => page.getByTestId('theme-toggle');
const theme = (page) => page.evaluate(() => document.documentElement.dataset.relTheme ?? 'light');

async function open(page, url = '/reliability') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
async function setTheme(page, want) { if ((await theme(page)) !== want) await toggle(page).click(); await expect.poll(() => theme(page)).toBe(want); }
async function shot(page, name, tall = false) {
  if (tall) await page.setViewportSize({ width: 1440, height: 1250 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  if (tall) await page.setViewportSize({ width: 1440, height: 900 });
}
const both = async (page, name, tall, prepare) => {
  for (const t of ['light', 'dark']) { await setTheme(page, t); if (prepare) await prepare(); await shot(page, `${name}-${t}`, tall); }
};

test.describe('the toggle', () => {
  test('light is the default, the toggle switches, and the choice is remembered per browser', async ({ page }) => {
    const errors = await open(page);
    expect(await theme(page)).toBe('light');
    await expect(toggle(page)).toHaveText('Dark theme');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await toggle(page).click();
    expect(await theme(page)).toBe('dark');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.top')).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await page.reload();
    await expect(rail(page).first()).toBeVisible();
    expect(await theme(page)).toBe('dark');
    await toggle(page).click();
    await page.reload();
    await expect(rail(page).first()).toBeVisible();
    expect(await theme(page)).toBe('light');
    expect(errors).toEqual([]);
  });

  test('the stored theme is applied before the page is drawn (no flash)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nexus.reliability.theme', 'dark'));
    await page.goto('/reliability');
    expect(await page.evaluate(() => document.documentElement.dataset.relTheme)).toBe('dark');
  });

  test('the Asset 360 charts take their colours from the theme, and redraw when it changes', async ({ page }) => {
    await open(page, '/reliability#asset=TX-2C');
    const chart = page.locator('[data-chart="history"]');
    await expect(chart).toHaveAttribute('data-ready', 'true');
    const colour = (t) => page.evaluate(() => window.echarts.getInstanceByDom(document.querySelector('[data-chart="history"]')).getOption().xAxis[0].axisLabel.color);
    const light = await colour();
    await page.evaluate(() => document.getElementById('rel-theme').click()); // the panel makes the page inert, so click through the DOM
    await expect.poll(colour).not.toBe(light);
  });
});

test.describe('every main view, both themes', () => {
  test('legacy screens', async ({ page }) => {
    await open(page);
    for (const [go, name] of [[6, 'dashboard'], [2, 'tower-health'], [3, 'line-health'], [4, 'risk-map'], [5, 'maintenance-history'], [0, 'drawing']]) {
      await rail(page).nth(go).click();
      await both(page, name);
    }
  });

  test('registry, links and Link Review', async ({ page }) => {
    await open(page);
    await rail(page).nth(1).click();
    await tab(page, 'Towers').click();
    await both(page, 'registry-towers');
    await tab(page, 'Transformers').click();
    await both(page, 'registry-transformers');
    await tab(page, 'Links').click();
    await expect(page.getByTestId('queue-row').first()).toBeVisible();
    await both(page, 'link-review', true);
  });

  test('Asset 360 and the finding viewer', async ({ page }) => {
    await open(page, '/reliability#asset=TWR-132-01-011');
    await expect(page.getByTestId('asset-panel')).toBeVisible();
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    for (const t of ['light', 'dark']) {
      if ((await theme(page)) !== t) await page.evaluate(() => document.getElementById('rel-theme').click());
      await expect.poll(() => theme(page)).toBe(t);
      await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
      await shot(page, `asset-360-tower-${t}`, true);
    }
    await page.evaluate(() => document.getElementById('rel-theme').click()); // back to light for the viewer's first picture
    for (const [mode, name] of [['rgb', 'finding-rgb'], ['thermal', 'finding-thermal'], ['compare', 'finding-compare']]) {
      for (const t of ['light', 'dark']) {
        await page.evaluate((v) => localStorage.setItem('nexus.reliability.theme', v), t); // what the toggle stores
        await page.goto(`/reliability#finding=F-0308${mode === 'rgb' ? '' : `&mode=${mode}`}`);
        await page.reload();
        expect(await theme(page)).toBe(t);
        await expect(page.getByTestId('finding-viewer')).toBeVisible();
        await expect(page.getByTestId(mode === 'compare' ? 'compare' : `stage-${mode}`)).toBeVisible();
        await shot(page, `${name}-${t}`, true);
      }
    }
  });
});
