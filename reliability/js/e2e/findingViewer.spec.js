// Smoke tests for the finding viewer, plus the newly built towers shown as "not assessed".
// Screenshots go to docs/screens/step3c/.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screens/step3c';
fs.mkdirSync(SHOTS, { recursive: true });

const rail = (page) => page.locator('[data-go]');
const tab = (page, name) => page.locator('#tabs [data-tab]', { hasText: new RegExp(`^${name}$`) });
const rows = (page) => page.locator('#stage table.reg-table tbody tr');
const panel = (page) => page.getByTestId('asset-panel');
const viewer = (page) => page.getByTestId('finding-viewer');
const t = (page, id) => viewer(page).getByTestId(id);
const queue = (page) => page.getByTestId('queue-row');

async function open(page, url = '/reliability') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await expect(rail(page).first()).toBeVisible();
  return errors;
}
const ready = async (page, mode = 'rgb') => { await expect(viewer(page)).toBeVisible(); await expect(t(page, `stage-${mode}`)).toHaveAttribute('data-ready', 'true'); };
/** A tall window so the whole modal is in the picture. */
async function shot(page, name) {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
}
const num = async (loc) => Number((await loc.innerText()).replace(/[^\d.\-]/g, ''));

test.describe('opening the viewer', () => {
  test('a real reference photo: labelled, credited, with the dataset box; the credits section lists every image and the placeholder classes', async ({ page }) => {
    const errors = await open(page, '/reliability#asset=TWR-132-01-007&finding=F-0067');
    await ready(page);
    await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Reference photo');
    await expect(t(page, 'credit')).toContainText(/^Reference photo · .+, BGI dataset.+, CC BY 4\.0 · not from this asset/);
    await expect(t(page, 'box-label')).toBeVisible();
    const credits = t(page, 'credits');
    await credits.locator('summary').click();
    await expect(t(page, 'credit-list').locator('li').first()).toContainText('CC BY');
    await expect(t(page, 'credit-placeholders')).toContainText('No real photo yet');
    await shot(page, 'reference-photo');
    expect(errors).toEqual([]);
  });

  test('from a thumbnail in Asset 360: the AI box, class, confidence and severity; a class with no real photo shows a generic demo image labelled "Demo image"', async ({ page }) => {
    const errors = await open(page, '/reliability#asset=TWR-132-01-011');
    await expect(panel(page)).toBeVisible();
    const thumb = panel(page).locator('[data-finding="F-0308"]');
    await expect(thumb.locator('.a360-demo')).toHaveText('Demo');
    await thumb.click();
    await ready(page);
    await expect(page).toHaveURL(/#asset=TWR-132-01-011&finding=F-0308$/);
    await expect(viewer(page).getByRole('heading', { level: 2 })).toHaveText('Earthwire damaged');
    await expect(t(page, 'severity')).toHaveText('critical');
    await expect(t(page, 'review-status')).toHaveText('confirmed');
    await expect(t(page, 'box-label')).toContainText('Earthwire damaged');
    await expect(t(page, 'box-label')).toContainText('0.89');
    await expect(t(page, 'fact-class')).toHaveText('Earthwire damaged');
    await expect(t(page, 'fact-severity')).toContainText('critical');
    await expect(t(page, 'fact-confidence')).toHaveText('0.89');
    await expect(t(page, 'owner-hi')).toContainText('34.6');
    // every image carries the label
    await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toHaveText('Demo image');
    await expect(t(page, 'demo-label-crop')).toHaveText('Demo image');
    await expect(t(page, 'credit')).toContainText('Demo image · a generic site photo, not a picture of this defect');
    for (const el of await viewer(page).locator('[data-demo="true"]').all()) await expect(el.locator('.fv-demo')).toBeVisible();
    await shot(page, 'rgb');
    expect(errors).toEqual([]);
  });

  test('from a thumbnail in Link Review; the open function is exposed for other screens', async ({ page }) => {
    await open(page);
    await rail(page).nth(2).click();
    await tab(page, 'Links').click();
    await queue(page).filter({ hasText: 'same defect' }).first().click();
    await page.locator('.lr-thumb').first().click();
    await ready(page);
    await expect(page).toHaveURL(/#finding=F-\d+$/);
    await page.keyboard.press('a'); // Link Review shortcuts are off while the viewer is open
    await expect(queue(page)).toHaveCount(30);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/finding=/);
    const exposed = await page.evaluate(() => { window.NexusReliability.openFinding('F-0308', { mode: 'thermal' }); return typeof window.NexusReliability.openFinding; });
    expect(exposed).toBe('function');
    await ready(page, 'thermal');
    await expect(page).toHaveURL(/#finding=F-0308&mode=thermal$/);
  });

  test('the URL is the state: a link opens the same finding in the same mode, and Escape clears it', async ({ page }) => {
    await open(page, '/reliability#finding=F-0308&mode=compare');
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page).locator('.fv-tab[aria-selected="true"]')).toHaveText(/Compare/);
    await expect(panel(page)).toHaveCount(0);
    await page.reload();
    await expect(t(page, 'compare')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/finding=|mode=/);
  });

  test('a LiDAR finding has no photograph and no box, and says so', async ({ page }) => {
    await open(page, '/reliability#finding=F-0029');
    await ready(page);
    await expect(t(page, 'box-label')).toBeHidden();
    await expect(viewer(page)).toContainText('LiDAR findings are positions, not pictures');
    await expect(t(page, 'stage-rgb').getByTestId('demo-label')).toBeVisible();
  });
});

test.describe('RGB and thermal', () => {
  test('the toggle switches to a generated thermal view with a scale and readouts, all labelled "Demo image"', async ({ page }) => {
    await open(page, '/reliability#finding=F-0032');
    await ready(page);
    await expect(t(page, 'thermal-readouts')).toHaveCount(0);
    await viewer(page).getByRole('tab', { name: /Thermal/ }).click();
    await expect(page).toHaveURL(/#finding=F-0032&mode=thermal$/);
    await ready(page, 'thermal');
    await expect(t(page, 'temp-max')).toContainText('°C');
    const max = await num(t(page, 'temp-max'));
    const min = await num(t(page, 'temp-min'));
    const box = await num(t(page, 'temp-box'));
    expect(max).toBeGreaterThan(min);
    expect(box).toBeLessThanOrEqual(max);
    expect(box).toBeGreaterThan(38); // a clamp finding runs hot
    await expect(t(page, 'scale-max')).toHaveText(`${max}°`);
    await expect(t(page, 'scale-min')).toHaveText(`${min}°`);
    await expect(t(page, 'stage-thermal').getByTestId('demo-label')).toHaveText('Demo image');
    await expect(t(page, 'demo-label-scale')).toHaveText('Demo image');
    await expect(t(page, 'demo-label-crop')).toHaveText('Demo image');
    await expect(t(page, 'box-label')).toBeVisible();
    await shot(page, 'thermal');
    // it really is a different picture, and the same every time
    const centre = () => t(page, 'stage-thermal').locator('canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data));
    const first = await centre();
    await page.reload();
    await ready(page, 'thermal');
    expect(await centre()).toEqual(first);
    expect(await num(t(page, 'temp-max'))).toBe(max);
    await viewer(page).getByRole('tab', { name: /RGB/ }).click();
    await ready(page);
    const rgbCentre = await t(page, 'stage-rgb').locator('canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data));
    expect(rgbCentre).not.toEqual(first);
  });

  test('the number keys switch views', async ({ page }) => {
    await open(page, '/reliability#finding=F-0308');
    await ready(page);
    await page.keyboard.press('2');
    await ready(page, 'thermal');
    await page.keyboard.press('3');
    await expect(t(page, 'compare')).toBeVisible();
    await page.keyboard.press('1');
    await ready(page);
    await expect(page).toHaveURL(/#finding=F-0308$/);
  });
});

test.describe('campaign compare', () => {
  test('the same defect across campaigns: condition at each, repairs between, side by side', async ({ page }) => {
    await open(page, '/reliability#finding=F-0308&mode=compare');
    await expect(t(page, 'compare')).toBeVisible();
    await expect(t(page, 'timeline').locator('.fv-tl')).toHaveCount(3);
    await expect(t(page, 'timeline').locator('.fv-tl').nth(2)).toHaveClass(/is-current/);
    await expect(t(page, 'pane-a')).toContainText('2026 Q2');
    await expect(t(page, 'pane-b')).toContainText('2026 Q4');
    await expect(t(page, 'cond-a')).toHaveText('condition 1');
    await expect(t(page, 'cond-b')).toHaveText('condition 1');
    await expect(t(page, 'cmp-change')).toContainText('Condition 1 → 1: unchanged between 2026 Q2 and 2026 Q4');
    await expect(t(page, 'cmp-repairs')).toContainText('RPR-0071');
    await expect(t(page, 'cmp-repairs')).toContainText('a different finding on the same asset');
    for (const pane of ['pane-a', 'pane-b']) await expect(t(page, pane).getByTestId('demo-label')).toBeVisible();
    await expect(t(page, 'timeline')).toContainText('1 repair');
    await shot(page, 'campaign-compare');
    // any two sightings can be compared
    await t(page, 'cmp-a').selectOption({ label: '2026 Q1 · 2026-02-09' });
    await expect(t(page, 'pane-a')).toContainText('2026 Q1');
    await expect(t(page, 'cmp-change')).toContainText('between 2026 Q1 and 2026 Q4');
    await expect(t(page, 'cmp-repairs')).toContainText('RPR-0071');
    await t(page, 'cmp-b').selectOption({ label: '2026 Q2 · 2026-05-25' });
    await expect(t(page, 'cmp-repairs')).toContainText('No repair between these two campaigns');
  });

  test('a finding with no linked sightings says there is nothing to compare', async ({ page }) => {
    await open(page, '/reliability#finding=F-0002&mode=compare');
    await expect(t(page, 'compare-empty')).toContainText('No other sightings');
    await expect(t(page, 'compare-empty')).toContainText('Proposed links wait in the Links tab');
  });
});

test.describe('keyboard and focus', () => {
  test('arrows move between findings of the same asset; Escape closes the viewer but not the panel, and focus returns to the thumbnail', async ({ page }) => {
    await open(page, '/reliability#asset=TWR-132-01-011');
    const thumb = panel(page).locator('[data-finding="F-0308"]');
    await thumb.focus();
    await page.keyboard.press('Enter');
    await ready(page);
    await expect(t(page, 'position')).toHaveText('1 of 6 on T-011');
    const first = await viewer(page).locator('.fv-id').first().innerText();
    await page.keyboard.press('ArrowRight');
    await expect(t(page, 'position')).toHaveText('2 of 6 on T-011');
    const second = await viewer(page).locator('.fv-id').first().innerText();
    expect(second).not.toBe(first);
    await expect(page).toHaveURL(new RegExp(`finding=${second}$`));
    await page.keyboard.press('ArrowLeft');
    await expect(viewer(page).locator('.fv-id').first()).toHaveText(first);
    await page.keyboard.press('ArrowLeft'); // wraps round
    await expect(t(page, 'position')).toHaveText('6 of 6 on T-011');
    await t(page, 'next').click();
    await expect(t(page, 'position')).toHaveText('1 of 6 on T-011');
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(panel(page)).toBeVisible();
    await expect(page).toHaveURL(/#asset=TWR-132-01-011$/);
    await expect(thumb).toBeFocused();
  });

  test('focus stays inside the viewer, and the panel and page behind it are inert', async ({ page }) => {
    await open(page, '/reliability#asset=TWR-132-01-011&finding=F-0308');
    await ready(page);
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
    await expect(page.locator('.a360-root')).toHaveAttribute('inert', '');
    const inside = () => page.evaluate(() => document.querySelector('[data-testid="finding-viewer"]').contains(document.activeElement));
    for (let i = 0; i < 40; i += 1) { await page.keyboard.press('Tab'); expect(await inside(), `Tab ${i}`).toBe(true); }
    for (let i = 0; i < 10; i += 1) { await page.keyboard.press('Shift+Tab'); expect(await inside(), `Shift+Tab ${i}`).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(page.locator('.a360-root')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.shell')).toHaveAttribute('inert', ''); // the panel is still open
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('.shell')).not.toHaveAttribute('inert', '');
  });

  test('the close button and the backdrop close it', async ({ page }) => {
    await open(page, '/reliability#finding=F-0308');
    await ready(page);
    await viewer(page).getByRole('button', { name: 'Close finding viewer' }).click();
    await expect(viewer(page)).toBeHidden();
    await page.goto('/reliability#finding=F-0036');
    await ready(page);
    await page.mouse.click(10, 10);
    await expect(viewer(page)).toBeHidden();
  });
});

test.describe('reviewer actions', () => {
  test('confirm: an unreviewed finding becomes confirmed, and it stays that way after a reload', async ({ page }) => {
    await open(page, '/reliability#finding=F-0023');
    await ready(page);
    await expect(t(page, 'review-status')).toHaveText('unreviewed');
    await expect(viewer(page)).toContainText('no reviewer has confirmed it');
    await page.keyboard.press('c');
    await expect(t(page, 'review-status')).toHaveText('confirmed');
    await expect(viewer(page)).not.toContainText('no reviewer has confirmed it');
    await expect(t(page, 'confirm')).toBeDisabled();
    await page.reload();
    await expect(t(page, 'review-status')).toHaveText('confirmed');
  });

  test('reject: the finding stops counting, the owner recomputes, and a rejected finding can be brought back', async ({ page }) => {
    await open(page, '/reliability#finding=F-0090');
    await ready(page);
    await expect(t(page, 'owner-hi')).toContainText('66.9');
    await page.keyboard.press('r');
    await expect(t(page, 'reject-confirm')).toBeVisible();
    await t(page, 'reject-reason').selectOption('Wrong location');
    await t(page, 'reject-yes').click();
    await expect(t(page, 'rejected-banner')).toContainText('no longer counts toward any score');
    await expect(t(page, 'rejected-banner')).toContainText('Wrong location');
    await expect(t(page, 'review-status')).toHaveText('rejected');
    await expect(t(page, 'owner-hi')).toContainText('100');
    await expect(viewer(page).locator('.fv-toast')).toContainText('Scores recomputed: T-010 health index 66.9 → 100 (normal)');
    await expect(t(page, 'reject')).toBeDisabled();
    await expect(t(page, 'correct')).toBeDisabled();
    await shot(page, 'rejected');
    // it is still in the viewer's list, but no longer in Asset 360's open findings
    await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = '#asset=TWR-132-01-010'; });
    await expect(panel(page).getByTestId('hi-band')).toHaveText('normal');
    await expect(panel(page).locator('[data-section="findings"]')).toContainText('No open findings');
    await page.evaluate(() => { location.hash = '#asset=TWR-132-01-010&finding=F-0090'; });
    await ready(page);
    await t(page, 'confirm').click();
    await expect(t(page, 'review-status')).toHaveText('confirmed');
    await expect(t(page, 'owner-hi')).toContainText('66.9');
  });

  test('a rejected finding no longer waits in the Link Review queue', async ({ page }) => {
    await open(page);
    await rail(page).nth(2).click();
    await tab(page, 'Links').click();
    await expect(queue(page)).toHaveCount(30);
    const link = queue(page).filter({ hasText: 'same defect' }).first();
    const finding = (await link.locator('.lr-pair').innerText()).split(' ')[0];
    await page.evaluate((id) => window.NexusReliability.openFinding(id), finding);
    await ready(page);
    await page.keyboard.press('r');
    await t(page, 'reject-yes').click();
    await expect(t(page, 'review-status')).toHaveText('rejected');
    await page.keyboard.press('Escape');
    await expect(queue(page)).toHaveCount(29);
  });

  test('review history: every action shows in the viewer with time, who and the reason, newest last', async ({ page }) => {
    await open(page, '/reliability#finding=F-0090');
    await ready(page);
    await expect(t(page, 'history')).toContainText('No reviewer has acted');
    await page.keyboard.press('r');
    await t(page, 'reject-reason').selectOption('Wrong location');
    await t(page, 'reject-yes').click();
    await expect(t(page, 'rejected-banner')).toBeVisible();
    await t(page, 'revert').click();
    await expect(t(page, 'rejected-banner')).toHaveCount(0);
    await page.keyboard.press('e');
    await t(page, 'edit-severity').selectOption('4');
    await t(page, 'edit-reason').fill('Looks minor on the close-up');
    await t(page, 'save-correction').click();
    await expect(t(page, 'corrected-banner')).toBeVisible();
    const items = t(page, 'history').locator('li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Rejected');
    await expect(items.nth(0)).toContainText('Reason: Wrong location');
    await expect(items.nth(1)).toContainText('Reverted to the AI proposal');
    await expect(items.nth(2)).toContainText('Corrected');
    await expect(items.nth(2)).toContainText('Reason: Looks minor on the close-up');
    await expect(items.nth(0).locator('time')).toHaveAttribute('datetime', /^\d{4}-\d\d-\d\dT/);
    await expect(items.nth(0)).toContainText('reviewer');
    await t(page, 'history').scrollIntoViewIfNeeded();
    await shot(page, 'review-history');
  });

  test('correct: change class, severity and box; typing keeps focus; invalid boxes are refused; the score recomputes', async ({ page }) => {
    await open(page, '/reliability#finding=F-0090');
    await ready(page);
    await expect(t(page, 'fact-severity')).toContainText('serious');
    await page.keyboard.press('e');
    await expect(t(page, 'edit-form')).toBeVisible();
    await expect(t(page, 'save-correction')).toBeDisabled();
    await expect(t(page, 'edit-summary')).toHaveText('No change yet.');
    await t(page, 'edit-severity').selectOption('4');
    await t(page, 'edit-class').selectOption('spacer_damaged');
    await expect(t(page, 'box-label')).toContainText('Spacer damaged');
    await expect(t(page, 'save-correction')).toBeEnabled();
    // typing in a box field does not lose focus
    const x = t(page, 'box-x');
    await x.click();
    const before = await x.inputValue();
    await x.fill('12.5');
    await expect(x).toBeFocused();
    await x.pressSequentially('5');
    await expect(x).toBeFocused();
    await expect(x).toHaveValue('12.55');
    // dragging the corner handle changes the width
    const w0 = Number(await t(page, 'box-w').inputValue());
    const h = viewer(page).locator('.fv-handle');
    const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2 + 10, { steps: 5 });
    await page.mouse.up();
    expect(Number(await t(page, 'box-w').inputValue())).toBeGreaterThan(w0);
    // dragging the box moves it
    const x1 = Number(await x.inputValue());
    const hit = viewer(page).locator('.fv-hit');
    const bb = await hit.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 25, bb.y + bb.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await x.inputValue())).toBeGreaterThan(x1);
    expect(before).not.toBe(await x.inputValue());
    // an impossible box
    await t(page, 'box-w').fill('99');
    await expect(t(page, 'edit-problems')).toContainText('inside the image');
    await expect(t(page, 'save-correction')).toBeDisabled();
    await t(page, 'box-w').fill('20');
    await expect(t(page, 'edit-problems')).toHaveText('');
    await expect(t(page, 'edit-summary')).toContainText('class, severity, box');
    await shot(page, 'correction-in-progress');
    // Escape cancels the edit but keeps the viewer open
    await page.keyboard.press('Escape');
    await expect(t(page, 'edit-form')).toHaveCount(0);
    await expect(viewer(page)).toBeVisible();
    await expect(t(page, 'fact-severity')).toContainText('serious');
    // do it again and save
    await t(page, 'correct').click();
    await t(page, 'edit-severity').selectOption('4');
    await t(page, 'edit-class').selectOption('spacer_damaged');
    await t(page, 'save-correction').click();
    await expect(t(page, 'corrected-banner')).toContainText('class Damper displaced → Spacer damaged');
    await expect(t(page, 'corrected-banner')).toContainText('severity 2 (serious) → 4 (minor)');
    await expect(t(page, 'fact-class')).toHaveText('Spacer damaged');
    await expect(t(page, 'severity')).toHaveText('minor');
    await expect(t(page, 'owner-hi')).toContainText('96.7');
    await expect(viewer(page).locator('.fv-toast')).toContainText('Scores recomputed: T-010 health index 66.9 → 96.7');
    await expect(t(page, 'revert')).toBeVisible();
    await t(page, 'revert').click();
    await expect(t(page, 'fact-class')).toHaveText('Damper displaced');
    await expect(t(page, 'owner-hi')).toContainText('66.9');
  });

  test('a correction changes the box on the image after saving', async ({ page }) => {
    await open(page, '/reliability#finding=F-0067');
    await ready(page);
    const rect = () => t(page, 'stage-rgb').locator('.fv-bbox');
    const before = await rect().getAttribute('x');
    await t(page, 'correct').click();
    await t(page, 'box-w').fill('30');
    await t(page, 'box-x').fill('55');
    await t(page, 'save-correction').click();
    await expect(t(page, 'corrected-banner')).toContainText('box adjusted');
    await expect(rect()).not.toHaveAttribute('x', before);
    await expect(rect()).toHaveAttribute('x', '0.55');
  });

  test('link to asset: the current asset and the matcher\'s suggestions with scores; picking one moves the finding', async ({ page }) => {
    await open(page, '/reliability#finding=F-0308');
    await ready(page);
    await expect(t(page, 'link-asset')).toContainText('Recorded on T-011 earthwire');
    await t(page, 'link-toggle').click();
    const items = t(page, 'suggestions').locator(':scope > li');
    await expect(items).toHaveCount(2); // the duplicate record T-11 (MX-TOW-1212) is not offered
    await expect(t(page, 'suggestions')).not.toContainText('MX-TOW-1212');
    await expect(items.first()).toHaveClass(/is-current/);
    await expect(items.first()).toContainText('current');
    const scores = (await items.locator('.fv-sugg-score').allInnerTexts()).map((s) => Number(s));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await items.first().locator('summary').click();
    await expect(items.first()).toContainText('spatial');
    await expect(items.first()).toContainText('class fit');
    await shot(page, 'link-to-asset');
    await items.filter({ hasText: 'TWR-132-01-011' }).getByRole('button', { name: 'Link here' }).click();
    await expect(t(page, 'link-asset')).toContainText('Recorded on T-011 (tower)');
    await expect(t(page, 'fact-class')).toHaveText('Earthwire damaged');
    await expect(viewer(page).getByText('relinked')).toBeVisible();
    await expect(viewer(page).locator('.fv-toast')).toContainText('Scores recomputed');
  });
});

test.describe('states', () => {
  test('loading: a skeleton while the finding loads', async ({ page }) => {
    await open(page, '/reliability?viewerdelay=1500#finding=F-0308');
    await expect(t(page, 'viewer-loading')).toBeVisible();
    await expect(viewer(page)).toHaveAttribute('aria-busy', 'true');
    await shot(page, 'loading');
    await expect(t(page, 'severity')).toBeVisible({ timeout: 8000 });
    await expect(viewer(page)).toHaveAttribute('aria-busy', 'false');
  });

  test('error: the message and Retry', async ({ page }) => {
    await open(page, '/reliability?viewerfail=1#finding=F-0308');
    await expect(t(page, 'viewer-error')).toContainText('simulated failure');
    await shot(page, 'error');
    await t(page, 'viewer-error').getByRole('button', { name: 'Retry' }).click();
    await ready(page);
  });

  test('not found: an id that does not exist', async ({ page }) => {
    await open(page, '/reliability#finding=F-NOPE');
    await expect(t(page, 'viewer-missing')).toContainText('Finding not found');
    await shot(page, 'not-found');
    await t(page, 'viewer-missing').getByRole('button', { name: 'Close' }).click();
    await expect(viewer(page)).toBeHidden();
  });
});

test.describe('newly built towers', () => {
  test('four towers and four spans, built after the last campaign, are "not assessed" in the registry', async ({ page }) => {
    const errors = await open(page);
    await rail(page).nth(2).click();
    await tab(page, 'Towers').click();
    await expect(rows(page)).toHaveCount(159);
    await page.locator('#stage select[aria-label="Health band"]').selectOption('not assessed');
    const shown = page.locator('#stage table.reg-table tbody tr:not([hidden])');
    await expect(shown).toHaveCount(9); // 5 duplicate records and the 4 new towers
    for (const n of [41, 42, 43, 44]) await expect(shown.filter({ hasText: `TWR-132-01-0${n}` }).locator('.tag.cond-n')).toHaveText('not assessed');
    await expect(page.locator('#stage .kpi', { hasText: 'Towers' }).first()).toContainText('150 assessed');
    await page.screenshot({ path: `${SHOTS}/not-assessed-new-towers.png` });
    await tab(page, 'Spans').click();
    await page.locator('#stage select[aria-label="Health band"]').selectOption('not assessed');
    await expect(page.locator('#stage table.reg-table tbody tr:not([hidden])')).toHaveCount(4);
    await expect(page.locator('#stage table.reg-table tbody tr:not([hidden])').filter({ hasText: 'SPN-132-01-040-041' })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a new tower\'s panel: not assessed because it was built after the last inspection', async ({ page }) => {
    await open(page, '/reliability#asset=TWR-132-01-041');
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText('installed 2026-11-02');
    await expect(panel(page).locator('.a360-n').first()).toHaveText('not assessed');
    await expect(panel(page).locator('[data-section="breakdown"]')).toContainText('no evidence on or before 2026-11-11');
    await expect(panel(page).locator('[data-section="findings"]')).toContainText('No open findings');
    await expect(panel(page).locator('[data-section="history"]')).toContainText('no history to chart');
    await expect(panel(page).locator('[data-section="work"]')).toContainText('No work orders');
    await panel(page).evaluate((el) => { el.scrollTop = 0; });
    await page.setViewportSize({ width: 1440, height: 1500 });
    await panel(page).screenshot({ path: `${SHOTS}/not-assessed-new-tower-panel.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    // the line says which of its towers and spans it left out
    await page.evaluate(() => { location.hash = '#asset=L-132-01'; });
    await expect(page.getByTestId('line-bands')).toContainText('assessed');
    await expect(panel(page).locator('[data-section="breakdown"]')).toContainText('40 of 47 towers and 39 of 43 spans assessed');
  });
});
