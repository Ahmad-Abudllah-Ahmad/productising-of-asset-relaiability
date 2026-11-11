// Behaviour parity of the /reliability port.
//
// Loads the ORIGINAL renderer (assets/custom/nexus-apps.js as it was before the port, taken from git commit
// f714359) on a throw-away page, and the ported one on /reliability. Both get the same seeded randomness and
// fixed clock, then run the same scripted sweep: every screen and tab, every filter select, every clickable
// widget, and tooltip hovers. What each step produces (the text of the stage and of the tooltip) must be equal.
//
// Skipped if that commit is not available (for example in a shallow clone).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const BASE_COMMIT = 'f714359';
let originalSource = null;
try { originalSource = execFileSync('git', ['show', `${BASE_COMMIT}:assets/custom/nexus-apps.js`], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); } catch { /* not available */ }

test.skip(!originalSource, `git commit ${BASE_COMMIT} is not available`);

const CLICKABLE = [
  '#stage button', '#stage [data-prd-sort]', '#stage tr[data-opt-row]', '#stage [data-mx-node]', '#stage [data-mx-view]', '#stage [data-ent-type]',
  '#stage [data-ent-view]', '#stage [data-ent-z]', '#stage [data-iss-tab]', '#stage [data-bb]', '#stage .bb-node', '#stage .bb-acc-h', '#stage .ent-node',
  '#stage tr[data-rec]', '#stage .scenario-btn', '#stage [data-pln-explain]', '#stage [data-src-apply]', '#stage .filter-col .linkish',
].join(',');

async function sweep(page) {
  return page.evaluate(async (clickable) => {
    const sig = (s) => { let h = 5381; for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return `${s.length}:${h}`; };
    const stage = () => document.getElementById('stage');
    const tip = () => { const t = document.getElementById('tip'); return t ? `${t.hidden ? 'hidden' : 'shown'}|${t.textContent}` : 'none'; };
    const state = () => `${document.getElementById('app-title').textContent}|${sig(stage().innerText)}|${tip()}`;
    const out = [];
    const rail = [...document.querySelectorAll('[data-go]')];
    for (let s = 0; s < rail.length; s += 1) {
      document.querySelectorAll('[data-go]')[s].click();
      const nTabs = document.querySelectorAll('[data-tab]').length;
      for (let t = 0; t < nTabs; t += 1) {
        const reset = () => { document.querySelectorAll('[data-go]')[s].click(); document.querySelectorAll('[data-tab]')[t].click(); };
        reset();
        out.push(`s${s}t${t} ${state()}`);
        const tabName = document.querySelectorAll('[data-tab]')[t].textContent;
        if (s === 0) continue; // drawings load asynchronously; their tabs are covered by the screenshots
        // filters
        const nSel = stage().querySelectorAll('.filter-col select, .prd select, .src select').length;
        for (let i = 0; i < nSel; i += 1) {
          reset();
          const sel = stage().querySelectorAll('.filter-col select, .prd select, .src select')[i];
          if (sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          out.push(`s${s}t${t}[${tabName}] select${i} ${state()}`);
        }
        // clickable widgets, each from a fresh state
        const n = Math.min(40, stage().querySelectorAll(clickable).length);
        for (let i = 0; i < n; i += 1) {
          reset();
          const el = stage().querySelectorAll(clickable)[i];
          if (!el) { out.push(`s${s}t${t} click${i} gone`); continue; }
          el.click();
          out.push(`s${s}t${t}[${tabName}] click${i} ${state()}`);
        }
        // tooltips
        reset();
        const tips = [...stage().querySelectorAll('[data-tip]')].slice(0, 6);
        for (let i = 0; i < tips.length; i += 1) {
          tips[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 200, clientY: 200 }));
          tips[i].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
          out.push(`s${s}t${t}[${tabName}] tip${i} ${state()}`);
        }
      }
    }
    return out;
  }, CLICKABLE);
}

async function prepare(page) {
  await page.addInitScript(() => {
    let a = 0x9e3779b9;
    Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await page.clock.install({ time: new Date('2026-11-11T09:00:00Z') });
}

test('the ported renderer behaves like the original on every screen and tab', async ({ browser }) => {
  test.setTimeout(240000);

  // original: a throw-away page that loads the pre-port script
  const oldCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const oldPage = await oldCtx.newPage();
  await prepare(oldPage);
  await oldPage.route('**/__original/page', (route) => route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/custom/nexus-apps.css?v=38"></head><body><script src="/__original/nexus-apps.js"></script><script>NexusApps.open("reliability");</script></body></html>' }));
  await oldPage.route('**/__original/nexus-apps.js', (route) => route.fulfill({ contentType: 'application/javascript', body: originalSource }));
  const oldErrors = [];
  oldPage.on('pageerror', (e) => oldErrors.push(e.message));
  await oldPage.goto('http://localhost:3100/__original/page');
  await oldPage.locator('[data-go]').first().waitFor();
  const before = await sweep(oldPage);

  // ported: the real page
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await prepare(page);
  const errors = [];
  const requested = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/reliability');
  await page.locator('[data-go]').first().waitFor();
  const after = await sweep(page);

  expect(oldErrors).toEqual([]);
  expect(errors).toEqual([]);
  expect(before.length).toBeGreaterThan(300);
  // the sweep must actually do something: clicks and selects change the page, so there are many distinct states
  expect(new Set(before.map((b) => b.slice(b.indexOf(' ') + 1))).size).toBeGreaterThan(150);
  expect(after.length).toBe(before.length);
  const diffs = before.map((b, i) => (b === after[i] ? null : `#${i}\n  original: ${b.slice(0, 160)}\n  ported:   ${after[i].slice(0, 160)}`)).filter(Boolean);
  expect(diffs.slice(0, 5)).toEqual([]);

  // the ported page no longer loads the shared script
  expect(requested).toContain('/reliability/js/legacy/nexus-reliability.js');
  expect(requested).not.toContain('/assets/custom/nexus-apps.js');
  console.log(`${before.length} interaction steps compared, all equal`);
});

test('nexus-apps.js no longer contains the Reliability renderer, and the other modules still load', async ({ page, request }) => {
  const js = await (await request.get('/assets/custom/nexus-apps.js')).text();
  expect(js).not.toContain('function reliability(');
  expect(js).not.toMatch(/reliability:\s*\{\s*product/);
  expect(js).toContain('function operations(');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const m of ['operations', 'grid', 'inventory', 'forecast', 'finance', 'workforce']) {
    await page.goto(`/${m}`);
    await expect(page.locator('[data-go]').first()).toBeVisible();
    await expect(page.locator('#stage')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});
