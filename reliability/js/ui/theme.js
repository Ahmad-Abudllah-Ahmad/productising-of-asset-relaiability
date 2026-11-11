// Theme: dark by default (control-room use), light on request. The choice is a per-viewer
// convenience kept in localStorage; the page works without it.

const KEY = 'nexus.reliability.theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  setTheme(saved === 'light' ? 'light' : 'dark', false);
}

export function setTheme(theme, remember = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (remember) { try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ } }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
