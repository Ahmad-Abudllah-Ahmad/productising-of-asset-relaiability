import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const legacy = read('../../../assets/custom/nexus-apps.css');
const mine = read('../ui/reliability.css');

function tokens(css, selector) {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `no ${selector} block`);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('\n}', i));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
function resolve(map) {
  const out = { ...map };
  for (let n = 0; n < 5; n += 1) for (const [k, v] of Object.entries(out)) out[k] = v.replace(/var\((--[\w-]+)\)/g, (_, r) => out[r] ?? `var(${r})`);
  return out;
}
const light = resolve({ ...tokens(legacy, ':root'), ...tokens(mine, ':root') });
const dark = resolve({ ...tokens(legacy, ':root'), ...tokens(mine, ':root'), ...tokens(mine, ':root[data-rel-theme="dark"]') });

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// text colour on the surface it is drawn on: the condition palette (chips) and the body text
const PAIRS = [
  ['--ink', '--card'], ['--ink', '--bg'], ['--ink', '--rel-sunken'], ['--muted', '--card'], ['--muted', '--bg'], ['--muted', '--rel-sunken'], ['--muted', '--rel-surface-2'],
  ['--rel-text-green', '--green-soft'], ['--rel-text-red', '--rel-bad-bg'], ['--rel-text-amber', '--rel-warn-bg'], ['--rel-text-blue', '--blue-soft'],
  ['--rel-text-green', '--card'], ['--rel-text-red', '--card'], ['--rel-text-amber', '--card'], ['--rel-text-blue', '--card'],
  ['--blue', '--card'], ['--red', '--card'],
];

for (const [name, T] of [['light', light], ['dark', dark]]) {
  test(`contrast, ${name} theme: body text and the condition palette reach WCAG AA (4.5:1)`, () => {
    for (const [fg, bg] of PAIRS) {
      assert.match(T[fg], /^#[0-9a-f]{6}$/i, `${fg} resolves to ${T[fg]}`);
      assert.match(T[bg], /^#[0-9a-f]{6}$/i, `${bg} resolves to ${T[bg]}`);
      const r = ratio(T[fg], T[bg]);
      assert.ok(r >= 4.5, `${fg} ${T[fg]} on ${bg} ${T[bg]} is ${r.toFixed(2)}:1`);
    }
  });
}

test('the dark theme redefines every token the light theme adds', () => {
  const l = Object.keys(tokens(mine, ':root')).filter((k) => !['--muted'].includes(k));
  const d = Object.keys(tokens(mine, ':root[data-rel-theme="dark"]'));
  for (const k of l) assert.ok(d.includes(k), `${k} has no dark value`);
});
