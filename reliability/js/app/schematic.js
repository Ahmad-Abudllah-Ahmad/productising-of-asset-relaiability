// The tower drawing used by Tower Health and by the Components tab of Asset 360: six zones, each tied to one scoring group.
import { h } from '../ui/dom.js';
import { COND_CLASS, condWord } from './screenKit.js';
import { SEVERITY } from './assetModel.js';

// ---- schematic

// crossarms, body and legs: one scoring group, so one shape with one outline
const STEEL = '<rect x="40" y="70" width="220" height="10"/><rect x="55" y="120" width="190" height="10"/><rect x="70" y="170" width="160" height="10"/><polygon points="125,60 175,60 200,300 100,300"/><polygon points="100,300 118,300 92,372 70,372"/><polygon points="182,300 200,300 230,372 208,372"/>';
/** The tower drawing: six zones, each tied to one scoring group, coloured by that group's condition. */
export function schematicSvg(m) {
  const score = Object.fromEntries(m.groups.map((g) => [g.id, g.score]));
  const gl = Object.fromEntries(m.groups.map((g) => [g.id, g.label]));
  const zones = [
    { id: 'earthwire peak', group: 'lightning_protection', side: 'L', ly: 34, px: 268, shape: '<polygon points="150,12 137,60 163,60"/><line x1="112" y1="38" x2="188" y2="38" class="hl-wirel"/>' },
    { id: 'insulator strings', group: 'insulators', side: 'L', ly: 126, px: 180, shape: '<rect x="45" y="82" width="8" height="36"/><rect x="247" y="82" width="8" height="36"/><rect x="60" y="132" width="8" height="36"/><rect x="232" y="132" width="8" height="36"/><rect x="75" y="182" width="8" height="36"/><rect x="217" y="182" width="8" height="36"/>' },
    { id: 'conductor hardware', group: 'conductor_accessories', side: 'L', ly: 176, px: 188, shape: '<circle cx="49" cy="124" r="6"/><circle cx="251" cy="124" r="6"/><circle cx="64" cy="174" r="6"/><circle cx="236" cy="174" r="6"/><circle cx="79" cy="224" r="6"/><circle cx="221" cy="224" r="6"/>' },
    { id: 'steel structure', group: 'steel_structure', side: 'R', ly: 292, px: 330, outline: true, shape: STEEL },
    { id: 'fittings', group: 'tower_accessories', side: 'R', ly: 240, px: 292, shape: '<rect x="138" y="230" width="24" height="18"/>' },
    { id: 'foundation', group: 'foundation', side: 'R', ly: 384, px: 372, shape: '<rect x="58" y="372" width="44" height="16"/><rect x="198" y="372" width="44" height="16"/>' },
  ];
  const bracing = '<g class="hl-brace"><line x1="125" y1="60" x2="200" y2="300"/><line x1="175" y1="60" x2="100" y2="300"/><line x1="115" y1="130" x2="185" y2="130"/><line x1="108" y1="200" x2="192" y2="200"/></g>';
  zones.sort((a, b) => (b.outline ? 1 : 0) - (a.outline ? 1 : 0));
  const parts = zones.map((z) => {
    const s = score[z.group] ?? null;
    const label = `${z.id}: ${gl[z.group]}, ${s === null ? 'not assessed' : `condition ${s} (${condWord(s)})`}`;
    const text = s === null ? '–' : String(s);
    const x = z.side === 'L' ? 150 : 410;
    const anchor = z.side === 'L' ? 'end' : 'start';
    const leaderX = z.side === 'L' ? 156 : 404;
    return `<g class="hl-zone ${COND_CLASS(s)}" data-zone="${z.id}" data-group="${z.group}" data-condition="${s ?? ''}" role="img" aria-label="${label}" tabindex="0"><title>${label}</title><g transform="translate(130,0)">${z.outline ? `<g class="hl-ol">${z.shape}</g><g class="hl-fl">${z.shape}</g>` : z.shape}</g></g>` +
      `<line class="hl-leader" x1="${leaderX}" y1="${z.ly}" x2="${z.px}" y2="${z.ly}"/>` +
      `<text class="hl-zlabel" x="${x}" y="${z.ly + 4}" text-anchor="${anchor}">${z.outline ? 'Steel structure' : z.id} <tspan class="hl-zval">${text}</tspan></text>`;
  });
  const svg = `<svg class="hl-svg" viewBox="0 0 560 410" role="group" aria-label="Schematic of ${m.tower.name}: each zone coloured by the condition of its group" data-testid="schematic"><line class="hl-ground" x1="40" y1="390" x2="520" y2="390"/>${parts.join('')}<g transform="translate(130,0)">${bracing}</g></svg>`;
  const wrap = h('div', { class: 'hl-svgwrap' });
  wrap.innerHTML = svg;
  return wrap;
}

export function conditionLegend() {
  return h('div', { class: 'hl-legend', 'data-testid': 'cond-legend' },
    ...[1, 2, 3, 4, 5].map((n) => h('span', {}, h('i', { class: `hl-swatch ${COND_CLASS(n)}` }, String(n)), `${SEVERITY[n].condition}`)),
    h('span', {}, h('i', { class: 'hl-swatch hl-cn' }, '–'), 'not assessed'));
}

