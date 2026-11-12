// Light/dark theme for the Reliability page only. Light is the default; the choice is remembered per browser.
// The theme is the data-rel-theme attribute on <html>; the colour tokens for it live in reliability.css.
// index.html applies the stored choice before first paint (see the inline script there), so there is no flash.

export const THEME_KEY = 'nexus.reliability.theme';
export const THEME_EVENT = 'reliability-theme';

export function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
export function currentTheme() { return document.documentElement.dataset.relTheme === 'dark' ? 'dark' : 'light'; }

export function setTheme(theme, { remember = true } = {}) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.relTheme = t;
  document.documentElement.style.colorScheme = t;
  if (remember) { try { localStorage.setItem(THEME_KEY, t); } catch { /* private window: the choice lasts for this page only */ } }
  syncButton();
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: t } }));
  return t;
}

function syncButton() {
  const b = document.getElementById('rel-theme');
  if (!b) return;
  const dark = currentTheme() === 'dark';
  b.setAttribute('aria-pressed', String(dark));
  b.textContent = dark ? 'Light theme' : 'Dark theme';
  b.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
}

function ensureButton() {
  if (document.getElementById('rel-theme')) return;
  const top = document.querySelector('header.top');
  if (!top) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'rel-theme'; b.className = 'rel-theme'; b.dataset.testid = 'theme-toggle';
  b.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  const anchor = top.querySelector('.back');
  top.insertBefore(b, anchor ?? null);
  syncButton();
}

/** Apply the stored theme and keep the toggle in the top bar (the legacy renderer rebuilds the page body on open). */
export function initTheme() {
  setTheme(storedTheme(), { remember: false });
  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true });
}
