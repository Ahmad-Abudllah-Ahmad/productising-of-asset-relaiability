// Simulated LiDAR for one span (assumption A25 in config.js). Pure functions: no DOM, no clock, no Math.random.
// The same input always gives the same cloud (a PRNG seeded from the span id).
//
// Coordinates are metres: x along the span (0 = first tower, length = second), y across it, z up from the tower base.
// Point classes: 1 ground, 2 vegetation, 3 structure (towers), 4 conductor (phases and earthwire).
//
// The cloud is built so that the smallest distance from any ground or vegetation point to the nearest conductor point is the
// span's seed clearance: a tree top is placed exactly that far under the lowest point of the conductors, and every other
// vegetation point is kept at least that far (plus a margin) from the conductors.
//
// A real scan replaces this by returning the same shape from a cloud provider (app/lidarSource.js): { x, y, z, cls } typed arrays.

import { CONFIG } from '../config.js';

export const CLASS = Object.freeze({ GROUND: 1, VEGETATION: 2, STRUCTURE: 3, CONDUCTOR: 4 });
export const CLASS_NAME = Object.freeze({ 1: 'Ground', 2: 'Vegetation', 3: 'Structure', 4: 'Conductor' });

const round1 = (v) => Math.round(v * 10) / 10;
function hashSeed(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Catenary parameter c so that a span of length L has the given sag: sag = c (cosh(L / 2c) - 1). */
export function catenaryC(length, sag) {
  let lo = 1; let hi = 1e6;
  for (let i = 0; i < 80; i += 1) { const c = (lo + hi) / 2; const s = c * (Math.cosh(length / (2 * c)) - 1); if (s > sag) lo = c; else hi = c; }
  return (lo + hi) / 2;
}

/** The limit for a nominal voltage. */
export const minClearanceFor = (kv) => CONFIG.lidar.minClearanceM[kv] ?? CONFIG.lidar.defaultMinClearanceM;

/**
 * @param {{spanId: string, kv: number, lengthM: number, towerHeightM: number, clearanceM: number, vegetationFinding?: boolean, limitM?: number}} p
 */
export function simulateSpan(p) {
  const { spanId, kv, lengthM: L, towerHeightM: H, clearanceM, vegetationFinding = false } = p;
  const limit = p.limitM ?? minClearanceFor(kv);
  const rnd = mulberry32(hashSeed(spanId));
  const between = (a, b) => a + (b - a) * rnd();
  const half = CONFIG.lidar.corridorHalfWidthM[kv] ?? 30;
  const arm = CONFIG.lidar.crossarmHalfWidthM[kv] ?? 5;

  // ---- conductors: three phases in a flat configuration at the crossarm, an earthwire above
  const attach = H - CONFIG.lidar.attachDropM;
  const ewZ = H + 0.5;
  let sag = Math.max(0.008 * L, (L * L) / 12000);
  sag = Math.min(sag, attach - clearanceM - 2.5); // keep room for a tree under the lowest point
  sag = Math.max(sag, 0.3);
  const c = catenaryC(L, sag);
  const ewSag = sag * 0.8;
  const cEw = catenaryC(L, ewSag);
  const zMid = attach - sag;
  const phaseZ = (x) => zMid + c * (Math.cosh((x - L / 2) / c) - 1);
  const ewZat = (x) => ewZ - ewSag + cEw * (Math.cosh((x - L / 2) / cEw) - 1);
  const phaseY = [-arm, 0, arm];

  const xs = []; const ys = []; const zs = []; const cl = [];
  const push = (x, y, z, k) => { xs.push(x); ys.push(y); zs.push(z); cl.push(k); };

  const nStep = 2 * Math.ceil(L / 3); // even, so the midpoint (the lowest point) is a sample
  const cond = []; // conductor sample points, for the clearance measure
  for (let i = 0; i <= nStep; i += 1) {
    const x = (i / nStep) * L;
    for (const y of phaseY) { push(x, y, phaseZ(x), CLASS.CONDUCTOR); cond.push([x, y, phaseZ(x)]); }
    push(x, 0, ewZat(x), CLASS.CONDUCTOR);
  }

  // ---- structures: a lattice tower at each end (four tapering legs, zig-zag bracing, a crossarm, a peak)
  for (const x0 of [0, L]) {
    const base = 2.4 + H * 0.06; const top = 0.6;
    const levels = Math.max(6, Math.round(H / 1.2));
    for (let i = 0; i <= levels; i += 1) {
      const t = i / levels; const z = t * H; const w = base + (top - base) * t;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) push(x0 + sx * w * 0.5, sy * w * 0.5, z, CLASS.STRUCTURE);
      if (i < levels) {
        const t2 = (i + 1) / levels; const w2 = base + (top - base) * t2; const z2 = t2 * H;
        for (let k = 1; k <= 3; k += 1) {
          const u = k / 4;
          push(x0 + (i % 2 ? -1 : 1) * (w * 0.5 + (w2 - w) * 0.5 * u) * (1 - 2 * u), -(w * 0.5 + (w2 - w) * 0.5 * u), z + (z2 - z) * u, CLASS.STRUCTURE);
          push(x0 + (i % 2 ? 1 : -1) * (w * 0.5 + (w2 - w) * 0.5 * u) * (1 - 2 * u), w * 0.5 + (w2 - w) * 0.5 * u, z + (z2 - z) * u, CLASS.STRUCTURE);
        }
      }
    }
    for (let i = -10; i <= 10; i += 1) push(x0, (i / 10) * arm * 1.15, attach + 0.3, CLASS.STRUCTURE); // crossarm
    for (let i = 0; i <= 4; i += 1) push(x0, 0, H + 0.5 - i * 0.12, CLASS.STRUCTURE); // peak
  }

  // ---- ground: a gently varying surface over the corridor
  const ph1 = between(0, 6.28); const ph2 = between(0, 6.28);
  const terrain = (x, y) => 0.7 * Math.sin(x / 61 + ph1) + 0.4 * Math.cos(y / 17 + ph2) + 0.25 * Math.sin((x + 2 * y) / 29);
  const gStepX = Math.max(2.5, L / 90); const gStepY = 4;
  for (let x = 0; x <= L + 1e-6; x += gStepX) for (let y = -half; y <= half + 1e-6; y += gStepY) push(x, y + between(-0.4, 0.4), terrain(x, y) + between(-0.05, 0.05), CLASS.GROUND);

  // ---- vegetation: clumps along the corridor, never closer to the conductors than the clearance
  const margin = 0.12;
  const capAt = (x) => phaseZ(x) - clearanceM - margin; // highest a vegetation point may be at x
  const nClumps = 9 + Math.floor(rnd() * 5) + (vegetationFinding ? 4 : 0);
  const tight = clearanceM < limit + 1.5; // tight spans carry taller growth
  for (let k = 0; k < nClumps; k += 1) {
    const cx = between(0.06 * L, 0.94 * L);
    if (Math.abs(cx - L / 2) < 6) continue; // keep the middle for the controlling tree
    const cy = between(-half * 0.9, half * 0.9);
    const want = between(1.5, 4.5) + (vegetationFinding ? between(2, 5) : 0) + (tight ? between(1, 3) : 0);
    const rad = between(2.5, 6);
    const n = 28 + Math.floor(rnd() * 40);
    for (let i = 0; i < n; i += 1) {
      const a = between(0, 6.2832); const r = rad * Math.sqrt(rnd());
      const x = cx + r * Math.cos(a); const y = cy + r * Math.sin(a);
      if (x < 1 || x > L - 1) continue;
      const crown = want * (1 - (r / rad) ** 2 * 0.6) * between(0.7, 1);
      const z = Math.min(terrain(x, y) + crown, capAt(x));
      if (z > terrain(x, y) + 0.3) push(x, y, z, CLASS.VEGETATION);
    }
  }
  // the controlling tree: its top is exactly `clearanceM` below the lowest conductor point (x = L/2, y = 0)
  const tx = L / 2; const ty = 0;
  const topZ = zMid - clearanceM;
  push(tx, ty, topZ, CLASS.VEGETATION);
  const crownR = between(3, 4.5);
  for (let i = 0; i < 70; i += 1) {
    const a = between(0, 6.2832); const r = crownR * Math.sqrt(rnd());
    const x = tx + r * Math.cos(a); const y = ty + r * Math.sin(a);
    const z = Math.min(topZ - (r / crownR) ** 2 * 2.2 - between(0.05, 0.9), capAt(x));
    if (z > terrain(x, y) + 0.3) push(x, y, z, CLASS.VEGETATION);
  }
  for (let z = terrain(tx, ty) + 0.5; z < topZ - 0.6; z += 0.8) push(tx + between(-0.15, 0.15), ty + between(-0.15, 0.15), z, CLASS.VEGETATION); // trunk

  // ---- clearance of every obstacle point to the nearest conductor point (a grid on x keeps this fast)
  const n = xs.length;
  const clearance = new Float32Array(n).fill(NaN);
  const binW = 6; const bins = new Map();
  cond.forEach((q, i) => { const b = Math.floor(q[0] / binW); if (!bins.has(b)) bins.set(b, []); bins.get(b).push(i); });
  let minC = Infinity; let minAt = -1;
  for (let i = 0; i < n; i += 1) {
    if (cl[i] !== CLASS.GROUND && cl[i] !== CLASS.VEGETATION) continue;
    const b = Math.floor(xs[i] / binW);
    let best = Infinity;
    for (let r = 0; r <= 60; r += 1) {
      if (best < Infinity && (r - 1) * binW > best) break; // nothing farther along x can be nearer
      for (const bb of r === 0 ? [b] : [b - r, b + r]) {
        for (const j of bins.get(bb) ?? []) { const q = cond[j]; const d = Math.hypot(xs[i] - q[0], ys[i] - q[1], zs[i] - q[2]); if (d < best) best = d; }
      }
    }
    clearance[i] = best;
    if (best < minC) { minC = best; minAt = i; }
  }

  // ---- decimate to the point budget (keep conductors, structures and the lowest point whole; thin ground and vegetation evenly)
  const fixed = []; const thin = [];
  for (let i = 0; i < n; i += 1) (cl[i] === CLASS.CONDUCTOR || cl[i] === CLASS.STRUCTURE || i === minAt ? fixed : thin).push(i);
  const room = Math.max(0, CONFIG.lidar.maxPoints - fixed.length);
  const stride = thin.length > room ? thin.length / room : 1;
  const keep = [...fixed];
  for (let k = 0; k < thin.length; k += stride) keep.push(thin[Math.floor(k)]);
  keep.sort((a, b) => a - b);
  const m = keep.length;
  const out = { x: new Float32Array(m), y: new Float32Array(m), z: new Float32Array(m), cls: new Uint8Array(m), clearance: new Float32Array(m) };
  let outMin = -1;
  keep.forEach((i, o) => { out.x[o] = xs[i]; out.y[o] = ys[i]; out.z[o] = zs[i]; out.cls[o] = cl[i]; out.clearance[o] = clearance[i]; if (i === minAt) outMin = o; });

  // ---- the 2D profile along the span: ground, vegetation tops, the conductor line and the limit line
  const stations = 40; const bandW = L / stations / 2;
  const profile = [];
  for (let s = 0; s <= stations; s += 1) {
    const x = (s / stations) * L;
    let veg = null; let near = null;
    for (let o = 0; o < m; o += 1) {
      if (Math.abs(out.x[o] - x) > bandW) continue;
      if (out.cls[o] === CLASS.VEGETATION) veg = veg === null ? out.z[o] : Math.max(veg, out.z[o]);
      if (!Number.isNaN(out.clearance[o])) near = near === null ? out.clearance[o] : Math.min(near, out.clearance[o]);
    }
    profile.push({ x: round1(x), ground: round1(terrain(x, 0)), vegetation: veg === null ? null : round1(veg), conductor: round1(phaseZ(x)), limit: round1(phaseZ(x) - limit), clearance: near === null ? null : round1(near) });
  }

  return {
    source: 'simulated', spanId, kv, lengthM: L, towerHeightM: H, limitM: limit,
    cloud: { ...out, count: m },
    geometry: { attachZ: attach, sag: round1(sag), lowestConductorZ: round1(zMid), earthwireZ: ewZ },
    stats: {
      minClearanceM: round1(minC), seedClearanceM: clearanceM, violation: round1(minC) < limit, limitM: limit,
      lowest: { x: round1(out.x[outMin]), y: round1(out.y[outMin]), z: round1(out.z[outMin]) },
      points: m, byClass: [1, 2, 3, 4].map((k) => ({ cls: k, name: CLASS_NAME[k], n: out.cls.reduce((a, b) => a + (b === k ? 1 : 0), 0) })),
      redPoints: out.clearance.reduce((a, b) => a + (!Number.isNaN(b) && b < limit ? 1 : 0), 0),
    },
    profile,
  };
}
