// Reliability v2 shell: left navigation to all ten plan screens, hash routing, a placeholder for the global
// filter bar, and a dark-by-default theme with a light toggle. Plain ES modules, no framework.
//
// Demo and test switches (query string, kept apart from the hash route):
//   ?delay=800   make the Link Review load slowly (to see the loading state)
//   ?fail=1      make the first Link Review load fail (to see the error state and Retry)

import { h, replace } from './dom.js';
import { onRoute, hrefFor } from './router.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';
import { SCREENS, screenById, DEFAULT_SCREEN } from './screens.js';
import { mountLinkReview } from './linkReview.js';
import { repository } from '../data/repository.js';

initTheme();

const query = new URLSearchParams(location.search);
const flags = { delay: Number(query.get('delay')) || 0, fail: query.get('fail') === '1' };

const navLinks = new Map();
const badges = new Map();
let screen = null;

// ---- shell
const themeBtn = h('button', { class: 'btn', type: 'button', id: 'theme-toggle', 'aria-label': 'Switch theme' });
const drawTheme = () => { themeBtn.textContent = currentTheme() === 'dark' ? 'Light theme' : 'Dark theme'; themeBtn.setAttribute('aria-pressed', String(currentTheme() === 'light')); };
themeBtn.addEventListener('click', () => { toggleTheme(); drawTheme(); });
drawTheme();

const filterBar = h('form', { class: 'filterbar', 'aria-label': 'Global filters (placeholder)', onSubmit: (e) => e.preventDefault() },
  h('span', { class: 'chip stub', title: 'Wired up in Phase 4: filters persist across screens and live in the URL' }, 'placeholder'),
  h('label', {}, 'Labels', h('select', { disabled: true }, h('option', {}, 'Any label'))),
  h('label', {}, 'Voltage', h('select', { disabled: true }, h('option', {}, 'Any voltage'))),
  h('label', {}, 'Category', h('select', { disabled: true }, h('option', {}, 'Any category'))),
  h('label', {}, 'Date range', h('input', { type: 'text', disabled: true, placeholder: 'Any date' })));

const nav = h('nav', { class: 'nav', 'aria-label': 'Reliability screens' },
  h('ul', {}, SCREENS.map((s) => {
    const badge = h('span', { class: 'badge', hidden: true, 'aria-label': 'awaiting review' });
    badges.set(s.id, badge);
    const a = h('a', { href: hrefFor(s.id), 'data-testid': `nav-${s.id}` }, h('span', { class: 'label' }, s.title), s.built ? badge : h('span', { class: 'soon', title: 'Coming in Phase 4' }, 'P4'));
    navLinks.set(s.id, a);
    return h('li', {}, a);
  })));

const main = h('main', { id: 'main', tabindex: '-1' });
replace(document.getElementById('app'),
  h('div', { class: 'shell' },
    h('header', { class: 'top' },
      h('a', { class: 'brand', href: '/', 'aria-label': 'NEXUS OS home' }, 'NEXUS OS'),
      h('span', { class: 'product' }, 'Asset Reliability ', h('span', { class: 'muted' }, '/ v2')),
      h('span', { class: 'spacer' }),
      themeBtn),
    filterBar, nav, main));

// ---- screens
function comingSoon(s) {
  return h('section', { class: 'soon-panel', 'aria-labelledby': 'st', 'data-testid': 'coming-soon' },
    h('p', { class: 'chip stub' }, 'Coming in Phase 4'),
    h('h1', { id: 'st' }, s.title),
    h('p', { class: 'lead' }, s.purpose),
    h('h2', {}, 'What it will contain'),
    h('p', {}, s.elements),
    h('p', { class: 'muted' }, 'This screen is not built yet. Link Review is the first finished screen.'),
    h('a', { class: 'btn', href: hrefFor('link-review') }, 'Go to Link Review'));
}

function show(route) {
  const id = route.id || DEFAULT_SCREEN;
  if (screen) { screen.destroy?.(); screen = null; }
  for (const [sid, a] of navLinks) { if (sid === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const s = screenById(id);
  document.title = `${s ? s.title : 'Not found'} · Reliability v2 · NEXUS OS`;
  if (!s) {
    replace(main, h('section', { class: 'soon-panel', 'data-testid': 'not-found' }, h('h1', {}, 'Screen not found'), h('p', { class: 'muted' }, `There is no screen called "${id}".`), h('a', { class: 'btn', href: hrefFor(DEFAULT_SCREEN) }, 'Go to Link Review')));
    return;
  }
  if (!s.built) { replace(main, comingSoon(s)); return; }
  const root = h('div', {});
  replace(main, root);
  screen = mountLinkReview(root, { repo: repository, flags });
}

// The nav badge shows how many links await review, on every screen, and follows every decision.
async function refreshBadge() {
  const n = (await repository.getLinks({ status: 'proposed', source: 'resemblance' })).length;
  const b = badges.get('link-review');
  b.textContent = String(n);
  b.hidden = n === 0;
}
repository.subscribe(refreshBadge);
refreshBadge();

onRoute(show);
