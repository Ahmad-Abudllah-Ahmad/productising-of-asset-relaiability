// Smoke tests for /reliability: the legacy screens plus the restructured Asset Registry.
// Each test starts with empty browser storage. Screenshots go to docs/screens/<SHOTS>/ (default step3a).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = `docs/screens/${process.env.SHOTS_DIR || 'step3a'}`;
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const RAIL = ['Reliability Dashboard', 'Drawing', 'Asset Registry', 'Tower Health', 'Line Health', 'Risk Map', 'Maintenance History'];
const REGISTRY_TABS = ['Lines', 'Towers', 'Spans', 'Components', 'Substations', 'Transformers', 'Links'];
const OLD_TABS = ['Production', 'Sourcing', 'Overview', 'Matrix', 'Forecast', 'Issues', 'Entities', 'Recommendations', 'Blackboard', 'Schedule', 'Graph', 'Register', 'Hierarchy'];
// seed: 150 towers + 4 newly built + 5 unmerged duplicates; 151 spans; 2 stations + 10 bays; 6 transformers + 1 duplicate
const ROWS = { Lines: 3, Towers: 159, Spans: 151, Components: 1382, Substations: 12, Transformers: 7 };

const rail = (page) => page.locator('[data-go]');
const tabs = (page) => page.locator('#tabs [data-tab]');
const tab = (page, name) => page.locator('#tabs [data-tab]', { hasText: new RegExp(`^${name}$`) });
const rows = (page) => page.locator('#stage table.reg-table tbody tr');
const queue = (page) => page.getByTestId('queue-row');

async function open(page, url = '/reliability') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const openRegistry = async (page, name) => { await rail(page).nth(2).click(); await tab(page, name).click(); };

test.describe('page structure', () => {
  test('six screens and the drawing, no new navigation entries, no script errors', async ({ page }) => {
    const errors = await open(page);
    await expect(rail(page)).toHaveCount(7);
    for (let i = 0; i < RAIL.length; i += 1) await expect(rail(page).nth(i)).toHaveAttribute('aria-label', RAIL[i]);
    await expect(page).toHaveTitle('Asset Reliability Intelligence');
    expect(errors).toEqual([]);
  });

  test('the page asks for the bumped cache versions, and only this page', async ({ page, request }) => {
    const html = await (await request.get('/reliability')).text();
    expect(html).toContain('nexus-apps.css?v=39');
    expect(html).toContain('nexus-reliability.js?v=2');
    expect(html).toContain('boot.js?v=2');
    for (const m of ['operations', 'grid', 'inventory', 'forecast', 'finance', 'workforce']) {
      expect(await (await request.get(`/${m}`)).text()).toContain('nexus-apps.css?v=38');
    }
  });
});

test.describe('Asset Registry', () => {
  test('the 13 copied tabs are gone; the registry has category tabs and Links', async ({ page }) => {
    await open(page);
    await rail(page).nth(2).click();
    expect(await tabs(page).allTextContents()).toEqual(REGISTRY_TABS);
    for (const old of OLD_TABS) await expect(tab(page, old)).toHaveCount(0);
    await expect(tab(page, 'Lines')).toHaveClass(/is-on/);
  });

  for (const name of Object.keys(ROWS)) {
    test(`${name}: table rows come from the data, with four KPI cards for this tab`, async ({ page }) => {
      const errors = await open(page);
      await openRegistry(page, name);
      await expect(rows(page)).toHaveCount(ROWS[name]);
      await expect(page.locator('#stage .kpi')).toHaveCount(4);
      for (const kpi of await page.locator('#stage .kpi').all()) await expect(kpi.locator('.n')).not.toBeEmpty();
      await shot(page, `registry-${name.toLowerCase()}`);
      expect(errors).toEqual([]);
    });
  }

  test('KPI cards reflect the active tab instead of repeating one strip', async ({ page }) => {
    await open(page);
    const seen = new Map();
    for (const name of [...Object.keys(ROWS), 'Links']) {
      await openRegistry(page, name);
      const labels = (await page.locator('#stage .kpi .k').allTextContents()).join('|');
      seen.set(name, labels);
    }
    expect(new Set(seen.values()).size).toBeGreaterThanOrEqual(5);
    expect(seen.get('Lines')).toContain('Average health index');
    expect(seen.get('Components')).toContain('Worst condition');
    expect(seen.get('Substations')).toContain('Transformers behind them');
    expect(seen.get('Transformers')).toContain('Highest risk');
    expect(seen.get('Links')).toContain('Awaiting review');
    for (const v of seen.values()) expect(v).not.toContain('Towers in view');
  });

  test('health index badges use the Phase 2 scores: poor, moderate and normal towers all exist, each with a reason on hover', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    await expect(rows(page).locator('.tag.cond-1', { hasText: 'poor' }).first()).toBeVisible();
    await expect(rows(page).locator('.tag.cond-3', { hasText: 'moderate' }).first()).toBeVisible();
    await expect(rows(page).locator('.tag.cond-5', { hasText: 'normal' }).first()).toBeVisible();
    const poorRow = rows(page).filter({ has: page.locator('.tag.cond-1', { hasText: 'poor' }) }).first();
    expect(await poorRow.getAttribute('data-tip')).toMatch(/health index [\d.]+ \(poor\)\. A group at condition 1 \(.+\) limits it; without that it would be [\d.]+/);
    await poorRow.hover();
    await expect(page.locator('#tip')).toContainText('health index');
  });

  test('the filter column filters rows by real values, Clear restores them, and an impossible mix shows the empty note', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    const visible = () => page.locator('#stage table.reg-table tbody tr:not([hidden])');
    await expect(visible()).toHaveCount(159);
    await page.locator('#stage select[aria-label="Line"]').selectOption('L-220-03');
    await expect(visible()).toHaveCount(60);
    await page.locator('#stage select[aria-label="Health band"]').selectOption('poor');
    const n = await visible().count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(60);
    await page.locator('#stage select[aria-label="Voltage"]').selectOption('132 kV');
    await expect(visible()).toHaveCount(0);
    await expect(page.locator('#stage .empty-note')).toHaveClass(/show/);
    await page.locator('#stage .clear-filters').click();
    await expect(visible()).toHaveCount(159);
  });

  test('clicking a column heading sorts the table, both ways', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Spans');
    const col = (name) => page.locator('#stage table.reg-table thead th', { hasText: new RegExp(`^${name}$`) });
    const values = async (i) => (await page.locator(`#stage table.reg-table tbody tr td:nth-child(${i})`).evaluateAll((tds) => tds.map((t) => Number(t.dataset.v)))).slice(0, 40);
    const idx = (await page.locator('#stage table.reg-table thead th').allTextContents()).indexOf('Length m') + 1;
    await col('Length m').click();
    const asc = await values(idx);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    await expect(col('Length m')).toHaveAttribute('aria-sort', 'ascending');
    await col('Length m').click();
    const desc = await values(idx);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    await expect(col('Length m')).toHaveAttribute('aria-sort', 'descending');
  });

  test('components show their worst open condition; transformers show Duval zone and weakest input', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Components');
    await expect(rows(page).locator('.tag.cond-1').first()).toContainText('very poor');
    await expect(rows(page).locator('.tag.cond-5', { hasText: 'no open findings' }).first()).toBeVisible();
    await openRegistry(page, 'Transformers');
    const heads = await page.locator('#stage table.reg-table thead th').allTextContents();
    expect(heads).toEqual(expect.arrayContaining(['Health index', 'Risk', 'Duval zone', 'Weakest input']));
    const arcing = rows(page).filter({ hasText: 'TX-2C' });
    await expect(arcing).toContainText('D2');
    await expect(arcing).toContainText('dga');
    await shot(page, 'registry-transformers-detail');
  });

  test('every row carries its asset id, ready for the asset panel', async ({ page }) => {
    await open(page);
    for (const name of Object.keys(ROWS)) {
      await openRegistry(page, name);
      const ids = await rows(page).evaluateAll((trs) => trs.map((t) => t.dataset.asset));
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

test.describe('Links tab (Link Review)', () => {
  test('hosts the queue, sorted by score, with both records and every reason', async ({ page }) => {
    const errors = await open(page);
    await openRegistry(page, 'Links');
    await expect(queue(page).first()).toBeVisible();
    await expect(queue(page)).toHaveCount(30);
    const scores = (await queue(page).locator('.lr-score').allTextContents()).map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await shot(page, 'registry-links');
    const finding = queue(page).filter({ hasText: 'same defect' }).first();
    await finding.click();
    await expect(page.getByTestId('compare').locator('tr.lr-diff').first()).toBeVisible();
    await expect(page.locator('.lr-thumb').first()).toBeVisible();
    for (const s of ['identifier', 'attribute', 'spatial', 'visual']) await expect(page.getByTestId('reasons').getByRole('rowheader', { name: new RegExp(s) })).toBeVisible();
    await expect(page.getByTestId('reasons').locator('.lr-stub')).toBeVisible();
    await page.locator('.lr-detail').screenshot({ path: `${SHOTS}/registry-links-detail.png` });
    expect(errors).toEqual([]);
  });

  test('the KPI cards follow decisions; keyboard accepts, rejects and merges; the audit log records them', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    const kpi = (label) => page.locator('#stage .kpi', { hasText: label }).locator('.n');
    await expect(kpi('Awaiting review')).toHaveText('30');
    await expect(kpi('Decided by reviewers')).toHaveText('0');
    const dup = queue(page).filter({ hasText: 'duplicate of' }).first();
    await dup.click();
    await expect(page.getByTestId('merge')).toBeEnabled();
    await page.keyboard.press('m');
    await expect(queue(page)).toHaveCount(29);
    await expect(kpi('Awaiting review')).toHaveText('29');
    await expect(kpi('Decided by reviewers')).toHaveText('1');
    await queue(page).first().click();
    await page.keyboard.press('a');
    await expect(queue(page)).toHaveCount(28);
    await page.keyboard.press('r');
    await expect(queue(page)).toHaveCount(27);
    await expect(kpi('Awaiting review')).toHaveText('27');
    await page.getByRole('button', { name: /^Audit log/ }).click();
    const audit = page.getByTestId('audit').locator('tbody tr');
    await expect(audit.nth(0)).toContainText('reject');
    await expect(audit.nth(1)).toContainText('confirm');
    await expect(audit.nth(2)).toContainText('merge');
    await shot(page, 'registry-links-audit');
  });

  test('a merge removes the duplicate from the Towers tab', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    await expect(rows(page)).toHaveCount(159);
    await openRegistry(page, 'Links');
    await queue(page).filter({ hasText: 'duplicate of' }).first().click();
    const dupTowerLink = queue(page).filter({ hasText: 'duplicate of' }).filter({ hasText: /T-\d+ ↔ T-0?\d+|Tower/ });
    if (await dupTowerLink.count()) await dupTowerLink.first().click();
    const selectedId = await page.locator('.lr-row.is-on').getAttribute('data-link');
    expect(selectedId).toBeTruthy();
    const cls = await page.getByTestId('compare').locator('tbody tr', { hasText: /^Class/ }).innerText();
    await page.getByTestId('merge').click();
    await expect(queue(page)).toHaveCount(29);
    await openRegistry(page, 'Towers');
    const expected = cls.includes('tower') ? 158 : 159;
    await expect(rows(page)).toHaveCount(expected);
  });

  test('decisions survive a reload; Reset demo data restores the queue and the KPI cards', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    await queue(page).first().click();
    await page.getByTestId('accept').click();
    await expect(queue(page)).toHaveCount(29);
    await page.reload();
    await openRegistry(page, 'Links');
    await expect(queue(page)).toHaveCount(29);
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await expect(queue(page)).toHaveCount(30);
    await expect(page.locator('#stage .kpi', { hasText: 'Awaiting review' }).locator('.n')).toHaveText('30');
  });

  test('empty states: an empty filter result and a fully decided queue', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    await page.getByLabel('Status').selectOption('rejected');
    await expect(page.getByTestId('queue-empty')).toContainText('No links match these filters');
    await shot(page, 'registry-links-empty-filter');
    await page.getByRole('button', { name: 'Show awaiting review' }).click();
    await expect(queue(page).first()).toBeVisible();
    await queue(page).first().click();
    let left = await queue(page).count();
    while (left > 0) {
      await page.keyboard.press('a');
      left -= 1;
      if (left > 0) await expect(queue(page)).toHaveCount(left);
    }
    await expect(page.getByTestId('queue-empty')).toContainText('The queue is empty');
    await shot(page, 'registry-links-queue-empty');
  });

  test('loading state shows skeleton rows; a failed load shows the error with Retry', async ({ page }) => {
    await open(page, '/reliability?delay=1500');
    await openRegistry(page, 'Links');
    await expect(page.locator('.lr-queue .lr-skel').first()).toBeVisible();
    await shot(page, 'registry-links-loading');
    await expect(queue(page).first()).toBeVisible({ timeout: 10000 });

    const p2 = await page.context().newPage();
    await open(p2, '/reliability?fail=1');
    await openRegistry(p2, 'Links');
    await expect(p2.getByTestId('error')).toContainText('simulated failure');
    await shot(p2, 'registry-links-error');
    await p2.getByRole('button', { name: 'Retry' }).click();
    await expect(queue(p2).first()).toBeVisible();
  });

  test('leaving the tab cleans up: no keyboard shortcut fires on another tab', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    await expect(queue(page).first()).toBeVisible();
    await tab(page, 'Towers').click();
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await openRegistry(page, 'Links');
    await expect(queue(page)).toHaveCount(30);
  });
});

test.describe('the other screens keep working', () => {
  test('every other screen and tab opens without errors', async ({ page }) => {
    const errors = await open(page);
    for (const s of [0, 1, 3, 4, 5, 6]) {
      await rail(page).nth(s).click();
      const n = await tabs(page).count();
      for (let t = 0; t < n; t += 1) { await tabs(page).nth(t).click(); await expect(page.locator('#stage')).not.toBeEmpty(); }
    }
    expect(errors).toEqual([]);
  });

  test('if the data modules fail to load, the page still opens and the registry says so', async ({ page }) => {
    await page.route('**/reliability/js/data/seed.js*', (route) => route.abort());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/reliability');
    await expect(rail(page)).toHaveCount(7);
    await rail(page).nth(2).click();
    await expect(page.getByTestId('registry-unavailable')).toContainText('could not be loaded');
    await shot(page, 'registry-unavailable');
    await rail(page).nth(3).click();
    await expect(page.getByTestId('tower-health-unavailable')).toContainText('could not be loaded');
    await rail(page).nth(4).click();
    await expect(page.getByTestId('line-health-unavailable')).toContainText('could not be loaded');
    await rail(page).nth(5).click();
    await expect(page.locator('#stage')).not.toBeEmpty();
  });
});
