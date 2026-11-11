// Smoke tests: the shell and the Link Review screen. Each test starts with empty browser storage.
// Screenshots go to docs/screens/phase3/.
import { test, expect } from '@playwright/test';

const SHOTS = 'docs/screens/phase3';
const shot = (page, name, options = {}) => page.screenshot({ path: `${SHOTS}/${name}.png`, ...options });

const SCREEN_TITLES = [
  'Reliability Dashboard', 'Asset Registry', 'Asset 360', 'Line Health', 'Tower Health',
  'Transformer Health', 'Visual Inspection Viewer', 'Risk Map', 'Link Review', 'Maintenance History',
];

const rows = (page) => page.getByTestId('queue-row');
const scores = async (page) => (await rows(page).locator('.score').allTextContents()).map(Number);

async function openReview(page, url = '/reliability-v2/') {
  await page.goto(url);
  await expect(rows(page).first()).toBeVisible();
}

// ------------------------------------------------------------------ shell

test.describe('shell', () => {
  test('lists all ten plan screens and opens Link Review by default', async ({ page }) => {
    await page.goto('/reliability-v2/');
    const nav = page.getByRole('navigation', { name: 'Reliability screens' });
    await expect(nav.getByRole('link')).toHaveCount(10);
    for (const t of SCREEN_TITLES) await expect(nav.getByRole('link', { name: new RegExp(`^${t}`) })).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Link Review/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Link Review', level: 1 })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Link Review/ }).locator('.badge')).toBeVisible();
    await shot(page, '01-link-review-dark');
  });

  test('global filter bar is a disabled placeholder', async ({ page }) => {
    await page.goto('/reliability-v2/');
    const bar = page.getByRole('form', { name: /Global filters/ });
    await expect(bar).toBeVisible();
    for (const c of await bar.locator('select, input').all()) await expect(c).toBeDisabled();
    await expect(bar.getByText('placeholder')).toBeVisible();
  });

  test('hash routing: unbuilt screens show "Coming in Phase 4"; back and unknown routes work', async ({ page }) => {
    await page.goto('/reliability-v2/');
    const nav = page.getByRole('navigation', { name: 'Reliability screens' });
    await nav.getByRole('link', { name: /^Reliability Dashboard/ }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.getByTestId('coming-soon')).toContainText('Coming in Phase 4');
    await expect(page.getByTestId('coming-soon')).toContainText('KPI cards');
    await expect(page).toHaveTitle(/Reliability Dashboard/);
    await shot(page, '03-coming-in-phase-4');
    for (const id of ['asset-registry', 'asset-360', 'line-health', 'tower-health', 'transformer-health', 'visual-inspection', 'risk-map', 'maintenance-history']) {
      await page.goto(`/reliability-v2/#/${id}`);
      await expect(page.getByTestId('coming-soon')).toBeVisible();
    }
    await page.goto('/reliability-v2/#/link-review');
    await expect(rows(page).first()).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('coming-soon')).toBeVisible();
    await page.goto('/reliability-v2/#/nope');
    await expect(page.getByTestId('not-found')).toContainText('Screen not found');
  });

  test('dark by default, light on toggle, and the choice is remembered', async ({ page }) => {
    await page.goto('/reliability-v2/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByRole('button', { name: 'Switch theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).not.toBe(darkBg);
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().click();
    await expect(page.getByTestId('compare')).toBeVisible();
    await shot(page, '02-link-review-light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Switch theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});

// ------------------------------------------------------------ Link Review

test.describe('Link Review', () => {
  test('the queue is sorted by score, and a link shows both records and every reason', async ({ page }) => {
    await openReview(page);
    const s = await scores(page);
    expect(s.length).toBeGreaterThanOrEqual(20);
    expect(s).toEqual([...s].sort((a, b) => b - a));
    expect(Math.max(...s)).toBeLessThan(0.9);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0.6);

    const finding = rows(page).filter({ hasText: 'same defect' }).first();
    await finding.click();
    await expect(finding).toHaveAttribute('aria-selected', 'true');
    const compare = page.getByTestId('compare');
    await expect(compare.locator('tbody tr').first()).toBeVisible();
    await expect(compare.locator('tr.diff').first()).toBeVisible();
    await expect(page.locator('.thumb img').first()).toBeVisible();
    const reasons = page.getByTestId('reasons');
    for (const signal of ['identifier', 'attribute', 'spatial', 'visual']) await expect(reasons.getByRole('rowheader', { name: new RegExp(signal) })).toBeVisible();
    await expect(reasons.locator('.chip.stub')).toBeVisible();
    // contributions add up to the score
    const contrib = (await reasons.locator('tbody tr td:nth-child(4)').allTextContents()).map((t) => Number(t.replace('+', '')));
    const total = Number(await reasons.locator('tfoot td').first().textContent());
    expect(Math.abs(contrib.reduce((a, b) => a + b, 0) - total)).toBeLessThan(0.02);
    await shot(page, '04-link-review-finding-pair');
    await page.locator('.lr-detail').screenshot({ path: `${SHOTS}/04b-finding-pair-detail-and-reasons.png` });
  });

  test('a duplicate asset record can be merged with the keyboard; scores and the audit log follow', async ({ page }) => {
    await openReview(page);
    const before = await rows(page).count();
    const dup = rows(page).filter({ hasText: 'duplicate of' }).first();
    await dup.click();
    await expect(page.getByTestId('merge')).toBeEnabled();
    await expect(page.getByTestId('compare')).toContainText('MX-');
    await shot(page, '05-link-review-duplicate-pair');
    await page.locator('.lr-detail').screenshot({ path: `${SHOTS}/05b-duplicate-pair-detail-and-reasons.png` });
    await page.keyboard.press('m');
    await expect(page.locator('.toast.show')).toContainText('Merged');
    await expect(rows(page)).toHaveCount(before - 1);
    await expect(page.getByTestId('audit').locator('tbody tr').first()).toContainText('merge');
    await shot(page, '06-link-review-after-merge');
  });

  test('keyboard: j/k move, a accepts, r rejects, ? shows shortcuts; everything lands in the audit log', async ({ page }) => {
    await openReview(page);
    const n = await rows(page).count();
    const first = await rows(page).first().getAttribute('data-link');
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('j');
    await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('k');
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await shot(page, '07-link-review-shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();

    await page.keyboard.press('a');
    await expect(rows(page)).toHaveCount(n - 1);
    await expect(page.locator(`[data-link="${first}"]`)).toHaveCount(0);
    await page.keyboard.press('r');
    await expect(rows(page)).toHaveCount(n - 2);
    const audit = page.getByTestId('audit').locator('tbody tr');
    await expect(audit.nth(0)).toContainText('reject');
    await expect(audit.nth(1)).toContainText('confirm');
    await expect(page.getByRole('navigation').getByRole('link', { name: /^Link Review/ }).locator('.badge')).toHaveText(String(n - 2));

    // the accepted link is under "Accepted"
    await page.getByLabel('Status').selectOption('confirmed');
    await expect(rows(page).filter({ has: page.locator(`[data-x]`) })).toHaveCount(0);
    await expect(page.locator(`[data-link="${first}"]`)).toHaveCount(1);
  });

  test('decisions survive a reload; Reset demo data brings the queue back', async ({ page }) => {
    await openReview(page);
    const n = await rows(page).count();
    await rows(page).first().click();
    await page.getByTestId('accept').click();
    await expect(rows(page)).toHaveCount(n - 1);
    await page.reload();
    await expect(rows(page)).toHaveCount(n - 1);
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.getByText('Clear every decision and merge?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await expect(rows(page)).toHaveCount(n);
    await expect(page.getByTestId('audit').locator('tbody tr').first()).toContainText('reset');
    await page.reload();
    await expect(rows(page)).toHaveCount(n);
  });

  test('filters by status and link type; an empty filter shows an empty state', async ({ page }) => {
    await openReview(page);
    await page.getByLabel('Status').selectOption('rejected');
    await expect(page.getByTestId('queue-empty')).toContainText('No links match these filters');
    await shot(page, '08-link-review-empty-filter');
    await page.getByRole('button', { name: 'Show awaiting review' }).click();
    await expect(rows(page).first()).toBeVisible();
    await page.getByLabel('Status').selectOption('confirmed');
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).first().locator('.chip')).toHaveText('confirmed');
    await page.getByLabel('Link type').selectOption('spatial');
    await expect(rows(page).first()).toContainText('Spatial');
    await rows(page).first().click();
    await expect(page.getByTestId('reasons')).toContainText('Rule:');
  });

  test('deciding every link leaves an empty queue with a way back', async ({ page }) => {
    await openReview(page);
    let left = await rows(page).count();
    while (left > 0) {
      await page.keyboard.press('a');
      left -= 1;
      if (left > 0) await expect(rows(page)).toHaveCount(left);
    }
    await expect(page.getByTestId('queue-empty')).toContainText('The queue is empty');
    await expect(page.getByRole('navigation').getByRole('link', { name: /^Link Review/ }).locator('.badge')).toBeHidden();
    await shot(page, '09-link-review-queue-empty');
    await page.getByRole('button', { name: 'Show all links' }).click();
    await expect(rows(page).first()).toBeVisible();
  });

  test('loading state: skeleton rows while the links load', async ({ page }) => {
    await page.goto('/reliability-v2/?delay=1500#/link-review');
    await expect(page.locator('.lr-queue .skeleton').first()).toBeVisible();
    await expect(page.locator('.lr-queue')).toHaveAttribute('aria-busy', 'true');
    await shot(page, '10-link-review-loading');
    await expect(rows(page).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.lr-queue')).toHaveAttribute('aria-busy', 'false');
  });

  test('error state: a failed load shows the message and Retry recovers', async ({ page }) => {
    await page.goto('/reliability-v2/?fail=1#/link-review');
    const err = page.getByTestId('error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Could not load the links');
    await expect(err).toContainText('simulated failure');
    await shot(page, '11-link-review-error');
    await err.getByRole('button', { name: 'Retry' }).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByTestId('error')).toHaveCount(0);
  });

  test('no script errors on any route', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const id of ['link-review', 'dashboard', 'risk-map', 'nope']) {
      await page.goto(`/reliability-v2/#/${id}`);
      await page.waitForTimeout(300);
    }
    expect(errors).toEqual([]);
  });
});
