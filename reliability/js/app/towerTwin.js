// The tower structure drawing: one elevation of a lattice tower whose zones take the colour of their scoring group
// (5 = very good ... 1 = very poor). Shared by Tower Health (workspace.js) and the Asset 360 Components tab (assetPanel.js).

export const COND_COLORS = { 5: '#16a34a', 4: '#65a30d', 3: '#d97706', 2: '#ea580c', 1: '#dc2626' };
export const COND_WORDS = { 1: 'very poor', 2: 'poor', 3: 'fair', 4: 'good', 5: 'very good' };
const COND_C = COND_COLORS;
const ZONE = { steel_structure: 'Steel structure', insulators: 'insulator strings', foundation: 'foundation', conductor_accessories: 'conductor hardware', lightning_protection: 'earthwire peak', tower_accessories: 'fittings' };

/** @param {{group: string, score: number}[]} hiGroups  @param {{labels?: boolean}} opts  labels: call out each zone with its score */
export function towerSvg(hiGroups, { labels = false } = {}) {
  const t = { hiGroups: hiGroups || [] };
    const g = Object.fromEntries((t.hiGroups || []).map((x) => [x.group, x.score]));
    const c = (k) => COND_C[Math.round(g[k] ?? 5)] || '#16a34a';
    const steel = c('steel_structure'); const ins = c('insulators'); const fnd = c('foundation'); const acc = c('conductor_accessories'); const lp = c('lightning_protection'); const ta = c('tower_accessories');
    const legs = `<path d="M120 60 L82 330 M120 60 L158 330" stroke="${steel}" stroke-width="5" fill="none"/>`;
    const lattice = [100, 140, 180, 220, 260, 300].map((y, i) => { const w = 7 + (y - 60) * 0.142; return `<path d="M${120 - w} ${y} L${120 + w} ${y}" stroke="${steel}" stroke-width="2.4"/>${i < 5 ? `<path d="M${120 - w} ${y} L${120 + w + 5.6} ${y + 40} M${120 + w} ${y} L${120 - w - 5.6} ${y + 40}" stroke="${steel}" stroke-width="1.4" opacity=".75"/>` : ''}`; }).join('');
    const arms = [[105, 64], [150, 54]].map(([y, w]) => `<path d="M${120 - w} ${y} L${120 + w} ${y} L120 ${y - 14} Z" fill="none" stroke="${steel}" stroke-width="2.6"/>`).join('');
    const strings = [[56, 105], [184, 105], [66, 150], [174, 150]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 30}" stroke="${ins}" stroke-width="3"/>${[0, 1, 2, 3, 4].map((k) => `<ellipse cx="${x}" cy="${y + 5 + k * 5.5}" rx="6" ry="2" fill="${ins}"/>`).join('')}<path d="M${x - 40} ${y + 36} Q${x} ${y + 30} ${x + 40} ${y + 36}" stroke="#94a3b8" stroke-width="1.6" fill="none"/><rect x="${x - 15}" y="${y + 31}" width="7" height="4" rx="1" fill="${acc}"/><rect x="${x + 9}" y="${y + 31}" width="7" height="4" rx="1" fill="${acc}"/>`).join('');
    const peak = `<line x1="120" y1="60" x2="120" y2="36" stroke="${steel}" stroke-width="3"/><circle cx="120" cy="34" r="4" fill="${lp}"/><path d="M60 30 Q120 26 180 30" stroke="${lp}" stroke-width="2" fill="none"/>`;
    const found = `<rect x="66" y="330" width="32" height="18" rx="2" fill="${fnd}" opacity=".9"/><rect x="142" y="330" width="32" height="18" rx="2" fill="${fnd}" opacity=".9"/><line x1="40" y1="331" x2="200" y2="331" stroke="#cbd5e1" stroke-dasharray="4 3"/>`;
    const plate = `<rect x="111" y="250" width="18" height="12" rx="2" fill="${ta}"/>`;
  const score = (k) => Math.round(g[k] ?? 5);
  // callouts: label, score and a leader line from the zone to the margin
  const call = (key, x1, y, side) => `<line x1="${x1}" y1="${y}" x2="${side === 'L' ? 6 : 234}" y2="${y}" stroke="#94a3b8" stroke-width="1"/><text x="${side === 'L' ? 2 : 238}" y="${y - 3}" text-anchor="${side === 'L' ? 'start' : 'end'}" font-size="9.5" fill="#334155">${ZONE[key]} <tspan font-weight="700">${score(key)}</tspan></text>`;
  const callouts = labels ? [call('lightning_protection', 118, 30, 'L'), call('insulators', 56, 112, 'L'), call('conductor_accessories', 70, 170, 'L'), call('tower_accessories', 129, 256, 'R'), call('steel_structure', 150, 296, 'R'), call('foundation', 174, 340, 'R')].join('') : '';
  return labels
    ? `<svg viewBox="-40 0 320 360" style="width:100%;max-width:640px;max-height:440px" role="img" aria-label="Tower structure coloured by component condition">${peak}${arms}${legs}${lattice}${strings}${plate}${found}${callouts}</svg>`
    : `<svg viewBox="0 0 240 360" style="width:100%;max-height:330px">${peak}${arms}${legs}${lattice}${strings}${plate}${found}</svg>`;
}
