// Screenshot every screen and tab of the NEXUS OS modules, for before/after comparison of a refactor.
//
//   PORT_DIR=before npx playwright test portCapture     # capture the current state
//   (make the change)
//   PORT_DIR=after  npx playwright test portCapture     # capture again
//   PORT_COMPARE=before,after npx playwright test portCompare
//
// PORT_MODULES limits the modules (comma separated, default: all seven).
// Screenshots go to docs/screens/port/<PORT_DIR>/<module>/SS-TT.png. Skipped unless PORT_DIR is set.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const LABEL = process.env.PORT_DIR;
const MODULES = (process.env.PORT_MODULES || 'reliability,operations,grid,inventory,forecast,finance,workforce').split(',');

test.skip(!LABEL, 'set PORT_DIR=before|after to capture');

for (const mod of MODULES) {
  test(`capture ${mod}`, async ({ page }) => {
    test.setTimeout(240000);
    // same random numbers and same date on every run, so only real differences show up
    await page.addInitScript(() => {
      let a = 0x9e3779b9;
      Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    });
    await page.clock.install({ time: new Date('2026-11-11T09:00:00Z') });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });

    const out = path.join('docs/screens/port', LABEL, mod);
    fs.mkdirSync(out, { recursive: true });
    await page.goto(`/${mod}`);
    await page.locator('[data-go]').first().waitFor();
    const nScreens = await page.locator('[data-go]').count();
    const manifest = [];
    for (let s = 0; s < nScreens; s += 1) {
      await page.locator('[data-go]').nth(s).click();
      await page.waitForTimeout(350);
      const nTabs = await page.locator('[data-tab]').count();
      for (let t = 0; t < nTabs; t += 1) {
        await page.locator('[data-tab]').nth(t).click();
        await page.waitForTimeout(450);
        if (await page.locator('.leaflet-container').count()) {
          await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
        const file = `${String(s).padStart(2, '0')}-${String(t).padStart(2, '0')}.png`;
        await page.screenshot({ path: path.join(out, file) });
        manifest.push({
          file,
          title: await page.locator('#app-title').textContent(),
          tab: (await page.locator('[data-tab]').nth(t).textContent()).trim(),
          stageHeight: await page.locator('#stage').evaluate((el) => el.scrollHeight),
          stageTextLength: await page.locator('#stage').evaluate((el) => el.innerText.length),
        });
      }
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
    expect(manifest.length).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });
}
