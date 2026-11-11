// Compare two screenshot captures made by portCapture.spec.js.
//   PORT_COMPARE=before,after npx playwright test portCompare
// Optional: PORT_MODULES, PORT_TOLERANCE (fraction of differing pixels allowed per screenshot, default 0).
// Writes docs/screens/port/compare-<a>-vs-<b>.json and fails on any screenshot above the tolerance.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PAIR = (process.env.PORT_COMPARE || '').split(',');
const MODULES = (process.env.PORT_MODULES || 'reliability,operations,grid,inventory,forecast,finance,workforce').split(',');
const TOLERANCE = Number(process.env.PORT_TOLERANCE || 0);

test.skip(PAIR.length !== 2, 'set PORT_COMPARE=before,after');

test('screenshots match', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('about:blank');
  const [A, B] = PAIR;
  const results = [];
  for (const mod of MODULES) {
    const dirA = path.join('docs/screens/port', A, mod);
    const dirB = path.join('docs/screens/port', B, mod);
    const filesA = fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
    const filesB = fs.readdirSync(dirB).filter((f) => f.endsWith('.png')).sort();
    expect(filesB, `${mod}: same screens and tabs`).toEqual(filesA);
    for (const f of filesA) {
      const a = fs.readFileSync(path.join(dirA, f)).toString('base64');
      const b = fs.readFileSync(path.join(dirB, f)).toString('base64');
      const d = await page.evaluate(async ([x, y]) => {
        const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${s}`; });
        const [ia, ib] = await Promise.all([load(x), load(y)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true, pixels: -1, total: 0 };
        const c = document.createElement('canvas');
        c.width = ia.width; c.height = ia.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(ia, 0, 0);
        const da = ctx.getImageData(0, 0, c.width, c.height).data;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(ib, 0, 0);
        const db = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let minX = c.width; let minY = c.height; let maxX = -1; let maxY = -1;
        for (let i = 0; i < da.length; i += 4) {
          if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) {
            n += 1; const p = i / 4; const px = p % c.width; const py = Math.floor(p / c.width);
            if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
        return { pixels: n, total: c.width * c.height, box: n ? [minX, minY, maxX, maxY] : null };
      }, [a, b]);
      results.push({ module: mod, file: f, ...d, ratio: d.total ? d.pixels / d.total : 1 });
    }
  }
  fs.writeFileSync(`docs/screens/port/compare-${A}-vs-${B}.json`, JSON.stringify(results, null, 1));
  const bad = results.filter((r) => r.sizeMismatch || r.ratio > TOLERANCE);
  console.log(`${results.length} screenshots compared, ${results.length - bad.length} identical within tolerance ${TOLERANCE}, ${bad.length} differ`);
  for (const r of bad.slice(0, 30)) console.log(`  ${r.module}/${r.file}: ${r.pixels} px (${(r.ratio * 100).toFixed(3)}%) box ${JSON.stringify(r.box)}`);
  expect(bad).toEqual([]);
});
