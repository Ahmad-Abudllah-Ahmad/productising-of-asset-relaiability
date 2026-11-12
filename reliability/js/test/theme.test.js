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

// the condition and band fills carry dark text (a number or word), and each shape has an outline that stands out from the card
const FILLS = ['--rel-cond-1', '--rel-cond-2', '--rel-cond-3', '--rel-cond-4', '--rel-cond-5', '--rel-cond-n', '--rel-wo-progress'];
const ratio3 = (a, b) => ratio(a, b);

for (const [name, T] of [['light', light], ['dark', dark]]) {
  test(`contrast, ${name} theme: dark text on every condition fill reaches 4.5:1 and the outline reaches 3:1 on the card`, () => {
    for (const f of FILLS) {
      assert.match(T[f], /^#[0-9a-f]{6}$/i, `${f} resolves to ${T[f]}`);
      assert.ok(ratio(T['--rel-on-fill'], T[f]) >= 4.5, `${f} ${T[f]} with text ${T['--rel-on-fill']} is ${ratio(T['--rel-on-fill'], T[f]).toFixed(2)}:1`);
    }
    for (const b of ['poor', 'moderate', 'normal', 'none']) assert.equal(T[`--rel-band-${b}`].toLowerCase(), T[{ poor: '--rel-cond-1', moderate: '--rel-cond-3', normal: '--rel-cond-5', none: '--rel-cond-n' }[b]].toLowerCase());
    assert.ok(ratio3(T['--rel-shape-line'], T['--card']) >= 3, `outline on card is ${ratio3(T['--rel-shape-line'], T['--card']).toFixed(2)}:1`);
  });
}

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
  const shared = (k) => ['--muted', '--rel-on-fill', '--rel-wo-progress'].includes(k) || /^--rel-(cond|band)-/.test(k); // the condition palette is one set for both themes
  const l = Object.keys(tokens(mine, ':root')).filter((k) => !shared(k));
  const d = Object.keys(tokens(mine, ':root[data-rel-theme="dark"]'));
  for (const k of l) assert.ok(d.includes(k), `${k} has no dark value`);
});
