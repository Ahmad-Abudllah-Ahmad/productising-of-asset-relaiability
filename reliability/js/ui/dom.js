// Tiny DOM helper. Builds elements without innerHTML, so data never becomes markup.

/**
 * h('button', { class: 'btn', onClick: fn, disabled: true }, 'Label', otherNode)
 * Props: class, dataset, style (object), text, on<Event> handlers, value/disabled/checked/selected/hidden as properties,
 * anything else as an attribute (true sets an empty attribute, false/null/undefined skips it).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'disabled', 'checked', 'selected', 'hidden'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replace all children of a node. */
export function replace(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

export const fmt = {
  score: (n) => (n === null || n === undefined ? '-' : Number(n).toFixed(2)),
  pct: (n) => `${Math.round(n * 100)}%`,
  coord: (p) => (p && p.lat !== undefined ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '-'),
  time: (iso) => (iso ? iso.replace('T', ' ').replace(/\.\d+Z$|Z$/, '') : '-'),
};
