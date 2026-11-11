// Smoke tests for the Asset 360 panel, the registry fixes (duplicate chips, nested bays, "scores as of") and the
// Components tab performance. Screenshots go to docs/screens/step3b/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/step3b';
fs.mkdirSync(SHOTS, { recursive: true });

const rail = (page) => page.locator('[data-go]');
const tab = (page, name) => page.locator('#tabs [data-tab]', { hasText: new RegExp(`^${name}$`) });
const rows = (page) => page.locator('#stage table.reg-table tbody tr');
const panel = (page) => page.getByTestId('asset-panel');
const section = (page, id) => panel(page).locator(`[data-section="${id}"]`);
const queue = (page) => page.getByTestId('queue-row');

async function open(page, url = '/reliability') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const openRegistry = async (page, name) => { await rail(page).nth(1).click(); await tab(page, name).click(); };
/** Whole-panel screenshot: the page is made tall enough that the panel does not scroll. */
async function shotPanel(page, name) {
  await page.setViewportSize({ width: 1440, height: 2600 });
  await page.waitForTimeout(250);
  await panel(page).screenshot({ path: `${SHOTS}/${name}.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe('registry fixes', () => {
  test('rows with a pending duplicate link have a "possible duplicate" chip that opens that link in the Links tab', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    const chip = rows(page).locator('.reg-chip', { hasText: 'possible duplicate' }).first();
    await expect(chip).toBeVisible();
    const link = await chip.getAttribute('data-link');
    await chip.click();
    await expect(tab(page, 'Links')).toHaveClass(/is-on/);
    await expect(page.locator(`.lr-row[data-link="${link}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('compare')).toContainText('MX-TOW');
    await expect(panel(page)).toHaveCount(0);
  });

  test('a confirmed but unmerged duplicate says so, and its chip opens the link under "Accepted"', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    const chip = rows(page).locator('.reg-chip', { hasText: 'duplicate, not merged' }).first();
    await expect(chip).toBeVisible();
    const link = await chip.getAttribute('data-link');
    await chip.click();
    await expect(page.locator(`.lr-row[data-link="${link}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Status')).toHaveValue('confirmed');
  });

  test('KPI cards say what they include', async ({ page }) => {
    await open(page);
    const kpi = (label) => page.locator('#stage .kpi', { hasText: label });
    await openRegistry(page, 'Transformers');
    await expect(kpi('Transformers').first()).toContainText('incl. 1 possible duplicate');
    await expect(kpi('Transformers').first().locator('.n')).toHaveText('7');
    await openRegistry(page, 'Towers');
    await expect(kpi('Towers').first()).toContainText('incl. 5 possible duplicates');
    await openRegistry(page, 'Components');
    await expect(kpi('Components').first()).toContainText('incl. 2 possible duplicates');
    await openRegistry(page, 'Substations');
    await expect(kpi('Transformers behind them')).toContainText('incl. 1 possible duplicate');
  });

  test('Substations: bays are nested under their substation', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Substations');
    await expect(rows(page)).toHaveCount(12);
    await expect(page.locator('#stage tr.reg-parent')).toHaveCount(2);
    await expect(page.locator('#stage tr.reg-child')).toHaveCount(10);
    const names = await rows(page).evaluateAll((trs) => trs.map((t) => [t.className, t.cells[0].innerText.trim()]));
    expect(names[0]).toEqual(['reg-parent', 'Substation S-1']);
    expect(names[1][0]).toBe('reg-child');
    expect(names[1][1].startsWith('↳')).toBe(true);
    expect(names.findIndex((n) => n[1] === 'Substation S-2')).toBe(6);
    await expect(page.locator('#stage table.reg-table thead th[aria-sort]')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/registry-substations-nested.png` });
  });

  test('"Scores as of" is visible on the registry and in the panel', async ({ page }) => {
    await open(page);
    for (const name of ['Lines', 'Towers', 'Components', 'Transformers']) {
      await openRegistry(page, name);
      await expect(page.getByTestId('as-of')).toHaveText('Scores as of 2026-11-11');
    }
    await openRegistry(page, 'Towers');
    await rows(page).first().click();
    await expect(panel(page)).toContainText('Scores as of 2026-11-11');
  });

  test('Components (1,382 rows): sorting, filtering and scrolling stay fast', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Components');
    const t = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const time = async (fn) => { const s = performance.now(); fn(); await frame(); return Math.round(performance.now() - s); };
      const th = [...document.querySelectorAll('#stage table.reg-table thead th')];
      const sel = document.querySelector('#stage select[aria-label="Class"]');
      const card = document.querySelector('#stage .table-card');
      const out = { rows: document.querySelectorAll('#stage table.reg-table tbody tr').length };
      out.sort = await time(() => th[0].click());
      out.sortBack = await time(() => th[0].click());
      out.filter = await time(() => { sel.value = 'damper'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      out.unfilter = await time(() => { sel.value = 'All'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      const frames = [];
      for (let y = 0; y < card.scrollHeight; y += 1200) { frames.push(await time(() => { card.scrollTop = y; })); }
      out.scrollWorst = Math.max(...frames);
      return out;
    });
    expect(t.rows).toBe(1382);
    // generous bounds: this is about "not janky", and CI machines vary
    for (const k of ['sort', 'sortBack', 'filter', 'unfilter']) expect(t[k], k).toBeLessThan(500);
    expect(t.scrollWorst).toBeLessThan(120);
  });
});

test.describe('Asset 360 panel', () => {
  test('a click on a tower row opens the panel: header, risk factors, and every section', async ({ page }) => {
    const errors = await open(page);
    await openRegistry(page, 'Towers');
    await rows(page).filter({ hasText: 'TWR-132-01-011' }).click();
    await expect(panel(page)).toBeVisible();
    await expect(page).toHaveURL(/#asset=TWR-132-01-011$/);
    await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('T-011');
    await expect(page.getByTestId('asset-id')).toHaveText('TWR-132-01-011');
    await expect(panel(page)).toContainText('tower');
    await expect(panel(page)).toContainText('structure');
    await expect(panel(page).locator('.a360-chips .tag').first()).toContainText('Corridor Coastal');
    await expect(page.getByTestId('hi-band')).toHaveText('poor');
    await expect(panel(page).locator('.a360-n').first()).toHaveText('34.6');
    const rf = page.getByTestId('risk-factors');
    await expect(rf).toContainText('65.4');
    await expect(rf).toContainText('Criticality');
    await expect(rf).toContainText('Consequence');
    await expect(rf).toContainText('Risk');
    for (const id of ['breakdown', 'findings', 'history', 'components', 'links', 'work']) await expect(section(page, id)).toBeVisible();
    // breakdown: groups, and the cap with its uncapped score
    await expect(page.getByTestId('breakdown-groups').locator('tbody tr')).toHaveCount(6);
    await expect(page.getByTestId('cap-note')).toContainText('A condition cap applies');
    await expect(page.getByTestId('cap-note')).toContainText('86.7');
    await expect(page.getByTestId('cap-note')).toContainText('34.6');
    // findings: severity chip, thumbnail, id
    const f = page.getByTestId('findings').locator('li').first();
    await expect(f.locator('.tag').first()).toHaveText(/critical|serious|moderate|minor/);
    await expect(f.locator('.a360-thumb')).toBeVisible();
    await expect(page.getByTestId('findings').locator('li')).toHaveCount(3);
    // history: a table row per campaign date and a chart
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(4);
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('[data-chart="history"] canvas')).toBeVisible();
    // linked assets grouped by type, work orders
    await expect(panel(page).locator('[data-link-type]')).toHaveCount(3);
    for (const t of ['same_asset', 'spatial', 'hierarchy']) await expect(panel(page).locator(`[data-link-type="${t}"]`)).toBeVisible();
    await expect(page.getByTestId('work-orders')).toBeVisible();
    await expect(page.getByTestId('repairs')).toBeVisible();
    await shotPanel(page, 'tower');
    expect(errors).toEqual([]);
  });

  test('a span: opened from its hash, with the same sections and a cap', async ({ page }) => {
    const errors = await open(page, '/reliability#asset=SPN-132-01-009-010');
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('asset-id')).toHaveText('SPN-132-01-009-010');
    await expect(page.getByTestId('hi-band')).toHaveText('poor');
    await expect(page.getByTestId('breakdown-groups').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('cap-note')).toContainText('A condition cap applies');
    await expect(section(page, 'findings')).toContainText('Open findings (1)');
    await expect(section(page, 'components')).toContainText('conductor');
    await shotPanel(page, 'span');
    expect(errors).toEqual([]);
  });

  test('a transformer: DGA trends, Duval zone, oil quality, electrical tests, loading and the input breakdown', async ({ page }) => {
    const errors = await open(page, '/reliability#asset=TX-2C');
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('hi-band')).toHaveText('normal');
    await expect(page.getByTestId('breakdown-inputs').locator('tbody tr')).toHaveCount(5);
    await expect(page.getByTestId('breakdown-inputs')).toContainText('dga');
    for (const id of ['dga', 'duval', 'oil', 'tests', 'loading']) await expect(section(page, id)).toBeVisible();
    await expect(page.locator('[data-chart="dga"]')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('[data-chart="dga"] canvas')).toBeVisible();
    await expect(page.locator('[data-chart="loading"] canvas')).toBeVisible();
    await expect(page.getByTestId('dga-table').locator('tbody tr')).toHaveCount(6);
    await expect(page.getByTestId('duval')).toContainText('Zone D2');
    await expect(page.getByTestId('duval').locator('svg')).toBeVisible();
    await expect(page.getByTestId('oil-table').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('test-result')).toHaveText('watch');
    await expect(section(page, 'loading')).toContainText('12-month mean');
    await expect(section(page, 'components')).toContainText('bushing');
    await shotPanel(page, 'transformer');
    expect(errors).toEqual([]);
  });

  test('a duplicate record: not assessed, with a banner that opens its link in the Links tab', async ({ page }) => {
    await open(page, '/reliability#asset=MX-TOW-1156');
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('duplicate-banner')).toContainText('Possible duplicate of');
    await expect(page.getByTestId('duplicate-banner')).toContainText('T-012');
    await expect(page.getByTestId('duplicate-banner')).toContainText('0.89');
    await expect(panel(page).locator('.a360-n').first()).toHaveText('not assessed');
    await expect(section(page, 'breakdown')).toContainText('no evidence on or before 2026-11-11');
    await expect(section(page, 'history')).toContainText('no history to chart');
    await expect(page.locator('[data-chart="history"]')).toHaveCount(0);
    await expect(section(page, 'findings')).toContainText('No open findings');
    await shotPanel(page, 'duplicate');
    await page.getByTestId('duplicate-banner').getByRole('button', { name: 'Review in Links' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(page).not.toHaveURL(/asset=/);
    await expect(tab(page, 'Links')).toHaveClass(/is-on/);
    await expect(page.locator('.lr-row[aria-selected="true"]')).toContainText('T-12');
  });

  test('an asset with no evidence: no health index, empty sections say so', async ({ page }) => {
    await open(page, '/reliability#asset=BAY-S1-4');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('.a360-n').first()).toHaveText('n/a');
    await expect(section(page, 'breakdown')).toContainText('No health index is defined');
    await expect(section(page, 'findings')).toContainText('No open findings');
    await expect(section(page, 'history')).toContainText('no history to chart');
    await expect(section(page, 'work')).toContainText('No work orders or repairs');
    await expect(section(page, 'links')).toContainText('Electrical');
    await shotPanel(page, 'no-evidence');
  });

  test('a line: bands, the five worst towers and spans, not capped by the worst', async ({ page }) => {
    await open(page, '/reliability#asset=L-220-03');
    await expect(page.getByTestId('line-bands')).toContainText('poor');
    await expect(page.getByTestId('line-worst').locator('tbody tr')).toHaveCount(5);
    await expect(section(page, 'breakdown')).toContainText('not capped by the worst one');
    await shotPanel(page, 'line');
  });

  test('a component: its worst open condition, and its owner as the parent', async ({ page }) => {
    await open(page, '/reliability#asset=EW-132-01-011');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator('.a360-k').first()).toHaveText('Condition');
    await expect(panel(page)).toContainText('in T-011');
    await shotPanel(page, 'component');
  });

  test('the URL hash is the panel state: reload, Back, and linked assets', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    await rows(page).filter({ hasText: 'TWR-132-01-011' }).click();
    await expect(page).toHaveURL(/#asset=TWR-132-01-011$/);
    await page.reload();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('asset-id')).toHaveText('TWR-132-01-011');
    await panel(page).getByTestId('findings').locator('.a360-link').first().click();
    await expect(page.getByTestId('asset-id')).not.toHaveText('TWR-132-01-011');
    const second = await page.getByTestId('asset-id').innerText();
    await expect(page).toHaveURL(new RegExp(`#asset=${second}$`));
    await page.goBack();
    await expect(page.getByTestId('asset-id')).toHaveText('TWR-132-01-011');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(page).not.toHaveURL(/asset=/);
    await page.goBack();
    await expect(panel(page)).toBeVisible();
  });

  test('Escape closes the panel and focus returns to the row; Tab stays inside while it is open', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Towers');
    const row = rows(page).filter({ hasText: 'TWR-132-01-011' });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    const inside = () => page.evaluate(() => document.querySelector('[data-testid="asset-panel"]').contains(document.activeElement));
    for (let i = 0; i < 40; i += 1) { await page.keyboard.press('Tab'); expect(await inside(), `Tab ${i}`).toBe(true); }
    for (let i = 0; i < 10; i += 1) { await page.keyboard.press('Shift+Tab'); expect(await inside(), `Shift+Tab ${i}`).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('.shell')).not.toHaveAttribute('inert', '');
    await expect(row).toBeFocused();
  });

  test('the close button and the backdrop close the panel', async ({ page }) => {
    await open(page, '/reliability#asset=TX-1A');
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Close asset panel' }).click();
    await expect(panel(page)).toBeHidden();
    await page.goto('/reliability#asset=TX-1B');
    await expect(panel(page)).toBeVisible();
    await page.mouse.click(40, 400);
    await expect(panel(page)).toBeHidden();
  });

  test('keyboard shortcuts of Link Review do nothing while the panel is open', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    await expect(queue(page)).toHaveCount(30);
    await page.evaluate(() => { location.hash = '#asset=TX-1A'; });
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(queue(page)).toHaveCount(30);
  });

  test('loading state: a skeleton while the asset loads', async ({ page }) => {
    await open(page, '/reliability?paneldelay=1500#asset=TWR-132-01-011');
    await expect(page.getByTestId('panel-loading')).toBeVisible();
    await expect(panel(page)).toHaveAttribute('aria-busy', 'true');
    await shotPanel(page, 'loading');
    await expect(page.getByTestId('asset-id')).toBeVisible({ timeout: 8000 });
    await expect(panel(page)).toHaveAttribute('aria-busy', 'false');
  });

  test('error state: the message and Retry', async ({ page }) => {
    await open(page, '/reliability?panelfail=1#asset=TWR-132-01-011');
    await expect(page.getByTestId('panel-error')).toContainText('simulated failure');
    await shotPanel(page, 'error');
    await page.getByTestId('panel-error').getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('asset-id')).toHaveText('TWR-132-01-011');
  });

  test('not found: an id that does not exist', async ({ page }) => {
    await open(page, '/reliability#asset=NO-SUCH-ASSET');
    await expect(page.getByTestId('panel-missing')).toContainText('Asset not found');
    await expect(page.getByTestId('panel-missing')).toContainText('NO-SUCH-ASSET');
    await shotPanel(page, 'not-found');
    await page.getByTestId('panel-missing').getByRole('button', { name: 'Close' }).click();
    await expect(panel(page)).toBeHidden();
  });

  test('a merged record points to the asset it was merged into', async ({ page }) => {
    await open(page);
    await openRegistry(page, 'Links');
    await queue(page).filter({ hasText: 'duplicate of' }).first().click();
    await page.keyboard.press('m');
    await expect(queue(page)).toHaveCount(29);
    await page.evaluate(() => { location.hash = '#asset=MX-TOW-1156'; });
    await expect(page.getByTestId('merged-banner')).toContainText('merged into');
    await expect(page.getByTestId('merged-banner')).toContainText('T-012');
    await shotPanel(page, 'merged');
    await page.getByTestId('merged-banner').getByRole('button', { name: 'T-012' }).click();
    await expect(page.getByTestId('asset-id')).toHaveText('TWR-132-01-012');
  });

  test('if the chart library cannot load, the values are still there', async ({ page }) => {
    await page.route('**/vendor/echarts/echarts.min.js*', (route) => route.abort());
    await open(page, '/reliability#asset=TWR-132-01-011');
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'failed');
    await expect(page.locator('[data-chart="history"]')).toContainText('could not be drawn');
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(4);
  });

  test('the page itself loads no chart library until a chart is needed', async ({ page }) => {
    const seen = [];
    page.on('request', (r) => { if (r.url().includes('echarts')) seen.push(r.url()); });
    await open(page);
    await openRegistry(page, 'Towers');
    await page.waitForTimeout(300);
    expect(seen).toEqual([]);
    await rows(page).filter({ hasText: 'TWR-132-01-011' }).click();
    await expect(page.locator('[data-chart="history"]')).toHaveAttribute('data-ready', 'true');
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain('/reliability/js/vendor/echarts/');
  });
});
