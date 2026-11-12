"""Generates reliability/js/ui/reliability-dark.css from assets/custom/nexus-apps.css.

nexus-apps.css is shared with the other Nexus modules and is not edited. It hard-codes light colours, so for the
Reliability page the dark theme needs an override for each declaration that uses one. This script derives those overrides
mechanically: every declaration in nexus-apps.css that uses a light neutral is re-emitted under
:root[data-rel-theme="dark"] with the neutral replaced by the matching Reliability theme token (defined in reliability.css).
Accent colours (blue, green, red, amber ...) are left alone. Re-run after changing nexus-apps.css:

    python scripts/build-reliability-dark.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'assets/custom/nexus-apps.css').read_text(encoding='utf-8')
out_path = root / 'reliability/js/ui/reliability-dark.css'

# light neutral -> token, by what the declaration paints
BG = {  # backgrounds
    '#fff': 'var(--card)', '#ffffff': 'var(--card)', '#f3f4f6': 'var(--bg)',
    '#f8fafc': 'var(--rel-surface-2)', '#fafbfc': 'var(--rel-surface-2)', '#f7f8fa': 'var(--rel-surface-2)', '#f4f6f8': 'var(--rel-surface-2)',
    '#f2f4f7': 'var(--rel-sunken)', '#eef2f6': 'var(--rel-sunken)', '#eef1f4': 'var(--rel-sunken)', '#f3f5f7': 'var(--rel-sunken)', '#f6f7f9': 'var(--rel-sunken)',
    '#e4e7ec': 'var(--rel-sunken-2)', '#eceff3': 'var(--rel-sunken)',
    '#fdecec': 'var(--rel-bad-bg)', '#fff6e5': 'var(--rel-warn-bg)', '#fff7fb': 'var(--rel-bad-bg)',
}
LINE = {  # borders, rules, strokes
    '#fff': 'var(--card)', '#e4e7ec': 'var(--line)', '#e6e8ee': 'var(--line)', '#d0d5dd': 'var(--line)', '#d8dee8': 'var(--line)', '#d5dbe3': 'var(--line)',
    '#eef1f4': 'var(--line)', '#f2f4f7': 'var(--line)', '#f3f5f7': 'var(--line)', '#f6f7f9': 'var(--line)', '#eceff3': 'var(--line)', '#e7ebf0': 'var(--line)', '#eef2f6': 'var(--line)',
    '#f3c1d8': 'var(--rel-bad-line)', '#98a2b3': 'var(--muted)',
}
TEXT = {  # text and fills
    '#1b2430': 'var(--ink)', '#344054': 'var(--ink)', '#475467': 'var(--ink)', '#667085': 'var(--muted)', '#98a2b3': 'var(--muted)', '#c5cad3': 'var(--muted)',
    '#9d3b68': 'var(--red)', '#b54708': 'var(--amber)',
}
def table_for(prop):
    p = prop.strip().lower()
    if p == 'color' or p in ('fill', 'caret-color'): return TEXT
    if p.startswith('background'): return BG
    if p.startswith(('border', 'outline', 'stroke', 'box-shadow')): return LINE
    return None

def remap(prop, value):
    t = table_for(prop)
    if not t: return None
    new = re.sub(r'#[0-9a-fA-F]{3,6}\b', lambda m: t.get(m.group(0).lower(), m.group(0)), value)
    # 'color: #fff' is text on an accent: keep it. A #fff in a fill/stroke is kept too.
    return new if new != value else None

def parse(text):
    """Yield ('rule', selector, body) and ('at', header, [children]) from a CSS string (comments stripped)."""
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    i, n, items = 0, len(text), []
    while i < n:
        j = text.find('{', i)
        if j < 0: break
        head = text[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {'{': 1, '}': -1}.get(text[k], 0); k += 1
        body = text[j + 1:k - 1]
        items.append(('at', head, parse(body)) if head.startswith('@') else ('rule', head, body))
        i = k
    return items

def used_words():
    """Every word that appears in the Reliability page's own sources: a selector is kept only if its classes and ids are among them."""
    words = set()
    files = [root / 'reliability/index.html'] + [f for f in (root / 'reliability/js').rglob('*.js') if not any(x in f.parts for x in ('vendor', 'test', 'e2e'))]
    for f in files:
        words |= set(re.findall(r'[A-Za-z0-9_-]+', f.read_text(encoding='utf-8', errors='ignore')))
    return words
USED = used_words()
def live(sel):
    return all(w in USED for w in re.findall(r'[.#]([A-Za-z_][\w-]*)', sel))

def emit(items, indent=''):
    out = []
    for it in items:
        if it[0] == 'at':
            if not it[1].startswith(('@media', '@supports')): continue
            inner = emit(it[2], indent + '  ')
            if inner: out.append(f'{indent}{it[1]} {{\n' + '\n'.join(inner) + f'\n{indent}}}')
            continue
        _, sel, body = it
        decls = []
        for d in re.split(r';(?![^(]*\))', body):
            if ':' not in d: continue
            prop, value = d.split(':', 1)
            imp = ' !important' if '!important' in value else ''
            r = remap(prop, value.replace('!important', '').strip())
            if r: decls.append(f'{prop.strip()}: {r}{imp};')
        sels_live = [x for x in sel.split(',') if x.strip() and live(x)]
        if decls and sels_live:
            sels = ',\n'.join(f'{indent}:root[data-rel-theme="dark"] {s.strip()}' for s in sel.split(',') if s.strip() and live(s))
            out.append(f'{sels} {{ ' + ' '.join(decls) + ' }')
    return out

css = ('/* GENERATED by scripts/build-reliability-dark.py from assets/custom/nexus-apps.css. Do not edit by hand.\n'
       '   Dark-theme overrides for the legacy page chrome; the token values are in reliability.css. */\n' + '\n'.join(emit(parse(src))) + '\n')
out_path.write_text(css, encoding='utf-8')
print(f'{out_path.relative_to(root)}: {css.count(chr(10))} lines')
