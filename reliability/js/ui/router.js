// Hash routing: #/screen-id or #/screen-id?key=value. No history API, so it works on any static host.

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { id: path || '', params: Object.fromEntries(new URLSearchParams(query)) };
}

export function hrefFor(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  return `#/${id}${q ? `?${q}` : ''}`;
}

/** Calls fn(route) now and on every hash change. Returns a function that stops listening. */
export function onRoute(fn) {
  const run = () => fn(parseHash());
  window.addEventListener('hashchange', run);
  run();
  return () => window.removeEventListener('hashchange', run);
}
