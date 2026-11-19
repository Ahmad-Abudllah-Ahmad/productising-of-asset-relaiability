// Login hero scenes: one real-time 3D scene per NEXUS OS module, rendered with Three.js (physically based
// materials, soft shadows, image-based lighting, filmic tone mapping and bloom). Everything is built
// procedurally here, so there are no model files to download.
//
//   01 Asset Reliability     lattice towers on a corridor, a condition-scan ring, one failing insulator string
//   02 AI Inspection         a quad-rotor drone orbiting a tower, camera cone and a detection box on a damper
//   03 Field Operations      a bucket truck driving the line road, crews' waypoints pulsing at each tower
//   04 Energy & Grid         two substations, transformers and energy pulses flowing along the circuits
//   05 Supply Chain          a warehouse aisle, racks of crates and cable drums, a forklift moving a pallet
//   06 Forecasting           a risk terrain that evolves with time, towers standing on it, a forecast ribbon
//   07 Financial             a field of budget columns, coin stacks and a glowing cost curve
//   08 Workforce & Safety    a hard hat, safety cones, a lock-out padlock and an orbit of safety checks
//
// mountScene(canvas, key, { accent, onLabel }) -> { dispose }

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------ materials & helpers */
const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.85, roughness: 0.38 }),
  galv: () => new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.3 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.4, roughness: 0.6 }),
  paint: (c, r = 0.45, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r }),
  glass: (c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55, thickness: 0.4 }),
  glow: (c, i = 2.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, metalness: 0, roughness: 0.4 }),
  ground: (c = 0x0b1222) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.92 }),
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rod(a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  m.castShadow = true; m.receiveShadow = true; return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
/** Sagging conductor between two points. */
function catenary(a, b, sag, mat, r = 0.035) {
  const pts = []; for (let i = 0; i <= 24; i += 1) { const t = i / 24; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 6, false), mat); m.castShadow = true; return m;
}
/** Insulator string: a stack of glass/porcelain discs on a rod. Returns { group, bottom }. */
function insulator(top, n, mat, discMat) {
  const g = new THREE.Group(); const len = n * 0.14 + 0.1; const bottom = top.clone(); bottom.y -= len;
  g.add(rod(top, bottom, 0.018, mat));
  for (let i = 0; i < n; i += 1) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 18), discMat); d.position.set(top.x, top.y - 0.08 - i * 0.14, top.z); d.castShadow = true; g.add(d); }
  return { group: g, bottom };
}
/**
 * Double-circuit lattice tower (Y/X bracing, two cross-arms per side, earthwire peak).
 * Returns { group, attach: [Vector3 conductor attachment points], strings: [meshes groups] }
 */
function tower(h = 9, steelMat = M.galv(), opts = {}) {
  const g = new THREE.Group(); const base = 1.5; const waist = 0.45; const top = h;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (y) => { const k = y < h * 0.62 ? base - (base - waist) * (y / (h * 0.62)) : waist; return k; };
  for (const [sx, sz] of legs) g.add(rod(V(sx * base, 0, sz * base), V(sx * waist, h * 0.62, sz * waist), 0.06, steelMat), rod(V(sx * waist, h * 0.62, sz * waist), V(sx * waist * 0.7, top, sz * waist * 0.7), 0.05, steelMat));
  const levels = 9;
  for (let i = 0; i < levels; i += 1) {
    const y0 = (i / levels) * top; const y1 = ((i + 1) / levels) * top; const k0 = at(y0); const k1 = at(y1);
    for (let s = 0; s < 4; s += 1) {
      const [ax, az] = legs[s]; const [bx, bz] = legs[(s + 1) % 4];
      g.add(rod(V(ax * k0, y0, az * k0), V(bx * k1, y1, bz * k1), 0.022, steelMat, 4));
      g.add(rod(V(bx * k0, y0, bz * k0), V(ax * k1, y1, az * k1), 0.022, steelMat, 4));
      g.add(rod(V(ax * k1, y1, az * k1), V(bx * k1, y1, bz * k1), 0.025, steelMat, 4));
    }
  }
  const attach = []; const strings = [];
  const discMat = opts.discMat || new THREE.MeshPhysicalMaterial({ color: 0x9ec9d8, roughness: 0.15, metalness: 0, transmission: 0.25, clearcoat: 1 });
  [[h * 0.72, 2.6], [h * 0.86, 2.0]].forEach(([y, reach]) => {
    for (const side of [-1, 1]) {
      g.add(rod(V(side * waist, y, 0), V(side * reach, y, 0), 0.05, steelMat), rod(V(side * waist, y + 0.55, 0), V(side * reach, y, 0), 0.035, steelMat, 4));
      const ins = insulator(V(side * (reach - 0.12), y, 0), 7, steelMat, discMat); g.add(ins.group); strings.push(ins); attach.push(ins.bottom);
    }
  });
  g.add(rod(V(0, top, 0), V(0, top + 0.8, 0), 0.04, steelMat));
  attach.push(V(0, top + 0.8, 0));
  // concrete pads
  for (const [sx, sz] of legs) g.add(cyl(0.32, 0.38, 0.3, M.paint(0x6b7280, 0.95, 0), sx * base, 0.15, sz * base));
  return { group: g, attach, strings };
}
function groundPlane(size, mat, grid = true, gridColor = 0x22314d) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); p.rotation.x = -Math.PI / 2; p.receiveShadow = true; g.add(p);
  if (grid) { const gh = new THREE.GridHelper(size, size / 2, gridColor, gridColor); gh.material.transparent = true; gh.material.opacity = 0.35; gh.position.y = 0.01; g.add(gh); }
  return g;
}
function pulseRing(color, r = 0.6) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

/* ------------------------------------------------------------------ scenes */
const SCENES = {
  /* 01 Asset Reliability: corridor of towers, a condition scan sweeps the lead tower, one string flags red */
  reliability({ scene, accent, label }) {
    scene.add(groundPlane(80, M.ground()));
    const steel = M.galv(); const towers = [];
    for (let i = 0; i < 4; i += 1) { const t = tower(9, steel); t.group.position.set(i * 11 - 2, 0, -i * 6); t.group.rotation.y = -0.45; scene.add(t.group); towers.push(t); }
    const cond = M.paint(0x8b94a3, 0.35, 0.9);
    for (let i = 0; i < towers.length - 1; i += 1) {
      towers[i].group.updateMatrixWorld(); towers[i + 1].group.updateMatrixWorld();
      towers[i].attach.forEach((p, k) => scene.add(catenary(p.clone().applyMatrix4(towers[i].group.matrixWorld), towers[i + 1].attach[k].clone().applyMatrix4(towers[i + 1].group.matrixWorld), k === 4 ? 0.6 : 1.1, cond, k === 4 ? 0.02 : 0.035)));
    }
    // condition markers per tower (green/amber/red) and the failing string on the lead tower
    const bad = towers[0].strings[1];
    const red = M.glow(0xff3b3b, 3);
    bad.group.children.forEach((c, i) => { if (i > 0) c.material = red; });
    const scan = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.03, 8, 96), M.glow(accent, 3)); scan.rotation.x = Math.PI / 2; towers[0].group.add(scan);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 64, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); towers[0].group.add(halo);
    const tones = [0xff4d4d, 0x22c55e, 0xf59e0b, 0x22c55e];
    towers.forEach((t, i) => { const r = pulseRing(tones[i], 2.2); r.position.y = 0.03; t.group.add(r); t.ring = r; });
    label('T-104 · HI 34.6 · 2 verified structural findings', () => bad.bottom.clone().applyMatrix4(towers[0].group.matrixWorld), 'crit');
    label('T-105 · HI 88.0', () => V(0, 9.6, 0).applyMatrix4(towers[1].group.matrixWorld), 'ok');
    label('T-106 · HI 61.2 · watch', () => V(0, 9.6, 0).applyMatrix4(towers[2].group.matrixWorld), 'warn');
    return {
      camera: { pos: V(-13, 9, 20), look: V(6, 5, -6), orbit: 0.06 },
      update(t) {
        const y = 4.5 + Math.sin(t * 0.9) * 4.2; scan.position.y = y; halo.position.y = y; scan.material.emissiveIntensity = 2.2 + Math.sin(t * 6) * 0.8;
        red.emissiveIntensity = 2 + Math.sin(t * 5) * 1.6;
        towers.forEach((tw, i) => { const s = 1 + ((t * 0.6 + i * 0.25) % 1) * 0.6; tw.ring.scale.setScalar(s); tw.ring.material.opacity = 1 - ((t * 0.6 + i * 0.25) % 1); });
      },
    };
  },

  /* 02 AI Inspection: drone orbiting a tower; camera cone; detection box on a damper */
  inspection({ scene, accent, label }) {
    scene.add(groundPlane(70, M.ground()));
    const t = tower(10, M.galv()); scene.add(t.group);
    const t2 = tower(10, M.galv()); t2.group.position.set(-14, 0, -10); scene.add(t2.group);
    t.group.updateMatrixWorld(); t2.group.updateMatrixWorld();
    const cond = M.paint(0x8b94a3, 0.35, 0.9);
    t.attach.forEach((p, k) => scene.add(catenary(p.clone().applyMatrix4(t.group.matrixWorld), t2.attach[k].clone().applyMatrix4(t2.group.matrixWorld), 1.2, cond, k === 4 ? 0.02 : 0.035)));
    // drone
    const drone = new THREE.Group(); const body = M.paint(0xe5e7eb, 0.35, 0.4); const blk = M.dark();
    drone.add(box(0.7, 0.18, 0.5, body)); drone.add(box(0.45, 0.12, 0.35, blk, 0, 0.12, 0));
    const rotors = [];
    for (const [x, z] of [[-0.55, -0.45], [0.55, -0.45], [0.55, 0.45], [-0.55, 0.45]]) {
      drone.add(rod(V(0, 0, 0), V(x, 0.05, z), 0.03, blk)); drone.add(cyl(0.05, 0.05, 0.12, blk, x, 0.1, z, 12));
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.01, 24), new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.4 })); r.position.set(x, 0.17, z); drone.add(r); rotors.push(r);
    }
    const gimbal = new THREE.Group(); gimbal.position.set(0, -0.18, 0.12); gimbal.add(cyl(0.11, 0.11, 0.16, blk, 0, -0.06, 0, 16)); const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), M.glow(accent, 2)); lens.position.set(0, -0.06, 0.1); gimbal.add(lens); drone.add(gimbal);
    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), M.glow(0xff3b3b, 4)); navL.position.set(-0.6, 0.05, -0.45); drone.add(navL);
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), M.glow(0x22c55e, 4)); navR.position.set(0.6, 0.05, -0.45); drone.add(navR);
    scene.add(drone);
    const target = t.attach[2].clone().applyMatrix4(t.group.matrixWorld);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })); scene.add(cone);
    const det = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 1.2, 0.9)), new THREE.LineBasicMaterial({ color: accent })); det.position.copy(target).add(V(0, 0.45, 0)); scene.add(det);
    const spot = new THREE.SpotLight(accent, 30, 14, 0.35, 0.5, 1.2); spot.target.position.copy(target); scene.add(spot, spot.target);
    label('Damper displaced · 0.93 conf. · 220 kV span', () => det.position.clone().add(V(0, 0.9, 0)), 'accent');
    return {
      camera: { pos: V(-12, 9.5, 18), look: V(-1, 6.2, -1), orbit: 0.05 },
      update(t2s) {
        const a = t2s * 0.35; drone.position.set(Math.cos(a) * 5.2, 8.2 + Math.sin(t2s * 1.3) * 0.4, Math.sin(a) * 5.2);
        drone.lookAt(target.x, drone.position.y, target.z); drone.rotateY(Math.PI);
        rotors.forEach((r, i) => { r.rotation.y += i % 2 ? 1.2 : -1.2; });
        const from = drone.position.clone().add(V(0, -0.25, 0)); const len = from.distanceTo(target);
        cone.scale.set(len * 0.2, len, len * 0.2); cone.position.lerpVectors(from, target, 0.5); cone.lookAt(target); cone.rotateX(Math.PI / 2);
        spot.position.copy(from);
        det.visible = Math.sin(t2s * 4) > -0.6; det.rotation.y = t2s * 0.4;
        navL.material.emissiveIntensity = navR.material.emissiveIntensity = (Math.sin(t2s * 8) > 0.6 ? 6 : 0.5);
      },
    };
  },

  /* 03 Field Operations: bucket truck travelling the line road, waypoints at each tower */
  operations({ scene, accent, label }) {
    scene.add(groundPlane(90, M.ground(0x0c1424)));
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4, 90), M.paint(0x1f2937, 0.9, 0)); road.rotation.x = -Math.PI / 2; road.rotation.z = Math.PI / 2; road.position.set(0, 0.02, 4); road.receiveShadow = true; scene.add(road);
    for (let i = -20; i < 20; i += 1) scene.add(box(1.2, 0.01, 0.12, M.paint(0xfacc15, 0.6, 0), i * 2.2, 0.03, 4));
    const towers = []; const steel = M.galv();
    for (let i = 0; i < 5; i += 1) { const t = tower(8, steel); t.group.position.set(-18 + i * 9, 0, -2); scene.add(t.group); towers.push(t); }
    const cond = M.paint(0x8b94a3, 0.35, 0.9);
    for (let i = 0; i < towers.length - 1; i += 1) { towers[i].group.updateMatrixWorld(); towers[i + 1].group.updateMatrixWorld(); towers[i].attach.forEach((p, k) => scene.add(catenary(p.clone().applyMatrix4(towers[i].group.matrixWorld), towers[i + 1].attach[k].clone().applyMatrix4(towers[i + 1].group.matrixWorld), 0.9, cond, 0.03))); }
    // bucket truck
    const truck = new THREE.Group(); const cab = M.paint(0xf8fafc, 0.35, 0.4); const tank = M.paint(accent, 0.4, 0.4); const tire = M.paint(0x111827, 0.85, 0);
    truck.add(box(1.4, 1.1, 1.6, cab, 1.6, 0.85, 0)); truck.add(box(3.4, 0.7, 1.7, tank, -0.6, 0.65, 0)); truck.add(box(1.0, 0.5, 1.5, M.glass(0x93c5fd), 2.05, 1.05, 0));
    for (const x of [1.6, -0.4, -1.6]) for (const z of [-0.85, 0.85]) { const w = cyl(0.36, 0.36, 0.28, tire, x, 0.36, z, 20); w.rotation.x = Math.PI / 2; truck.add(w); }
    const boom = new THREE.Group(); boom.position.set(-1.2, 1.1, 0); boom.add(rod(V(0, 0, 0), V(0, 3.2, 0), 0.12, M.paint(0xe5e7eb, 0.4, 0.5))); const bucket = box(0.6, 0.6, 0.6, M.paint(0xfacc15, 0.5, 0.2), 0, 3.4, 0); boom.add(bucket); truck.add(boom);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), M.glow(0xf59e0b, 4)); beacon.position.set(1.6, 1.5, 0); truck.add(beacon);
    scene.add(truck);
    const rings = towers.map((tw) => { const r = pulseRing(accent, 1.6); r.position.set(tw.group.position.x, 0.04, tw.group.position.z); scene.add(r); return r; });
    label('Visit VIS-N-01 · 5 tasks · one outage window', () => truck.position.clone().add(V(0, 5, 0)), 'accent');
    return {
      camera: { pos: V(14, 12, 27), look: V(0, 2.2, 1), orbit: 0.04 },
      update(t) {
        const x = ((t * 2.2) % 44) - 22; truck.position.set(x, 0, 4);
        boom.rotation.z = -0.35 + Math.sin(t * 0.8) * 0.25;
        beacon.material.emissiveIntensity = Math.sin(t * 9) > 0 ? 5 : 0.4;
        rings.forEach((r, i) => { const p = (t * 0.7 + i * 0.2) % 1; r.scale.setScalar(1 + p * 0.8); r.material.opacity = (1 - p) * (Math.abs(towers[i].group.position.x - x) < 6 ? 1 : 0.35); });
      },
    };
  },

  /* 04 Energy & Grid: substations with transformers; energy pulses along circuits */
  grid({ scene, accent, label }) {
    scene.add(groundPlane(80, M.ground()));
    const yard = (x, z) => {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      g.add(box(9, 0.12, 6, M.paint(0x334155, 0.95, 0), 0, 0.06, 0));
      for (let i = 0; i < 3; i += 1) {
        const tx = new THREE.Group(); tx.position.set(-3 + i * 3, 0, 0.8);
        tx.add(box(1.6, 1.4, 1.1, M.paint(0x64748b, 0.45, 0.6), 0, 0.85, 0));
        for (let f = 0; f < 6; f += 1) tx.add(box(0.05, 1.1, 0.8, M.paint(0x475569, 0.5, 0.6), -0.95, 0.85, -0.35 + f * 0.14));
        for (let b = 0; b < 3; b += 1) tx.add(cyl(0.06, 0.09, 0.8, M.paint(0xcbd5e1, 0.3, 0.1), -0.45 + b * 0.45, 1.95, 0.0, 12));
        const cons = cyl(0.28, 0.28, 1.1, M.paint(0x64748b, 0.45, 0.6), 0, 1.85, -0.5, 18); cons.rotation.z = Math.PI / 2; tx.add(cons);
        g.add(tx);
      }
      for (let i = 0; i < 4; i += 1) { g.add(rod(V(-4 + i * 2.6, 0, -1.8), V(-4 + i * 2.6, 3, -1.8), 0.08, M.galv())); }
      g.add(rod(V(-4.2, 3, -1.8), V(4.2, 3, -1.8), 0.07, M.glow(accent, 1.2)));
      scene.add(g); return g;
    };
    const a = yard(-12, 0); const b = yard(12, -4);
    const circuits = [];
    for (let k = 0; k < 3; k += 1) {
      const p1 = V(-8, 3 + k * 0.4, -1.8 + k * 0.3); const p2 = V(8, 3 + k * 0.4, -5.8 + k * 0.3);
      const pts = []; for (let i = 0; i <= 30; i += 1) { const t = i / 30; const p = new THREE.Vector3().lerpVectors(p1, p2, t); p.y += Math.sin(t * Math.PI) * 2.6 - 1.2 * 4 * t * (1 - t); pts.push(p); }
      const curve = new THREE.CatmullRomCurve3(pts); scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.04, 6), M.paint(0x8b94a3, 0.35, 0.9)));
      circuits.push(curve);
    }
    const pulses = [];
    const pm = M.glow(accent, 5);
    for (let i = 0; i < 36; i += 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), pm); scene.add(m); pulses.push({ m, c: circuits[i % 3], o: (i / 36) }); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), M.glow(accent, 3)); core.position.set(0, 7.2, -2); scene.add(core);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 8, 80), M.glow(accent, 2.4)); ringA.position.copy(core.position); scene.add(ringA);
    label('L-220-03 · 317 MW · 76 % of rating', () => circuits[1].getPoint(0.5).add(V(0, 1.2, 0)), 'accent');
    label('S-1 · 220/132 kV', () => a.position.clone().add(V(0, 3.8, -1.8)), 'muted');
    label('S-2 · 500/220 kV', () => b.position.clone().add(V(0, 3.8, -1.8)), 'muted');
    return {
      camera: { pos: V(2, 14, 30), look: V(0, 2.8, -2), orbit: 0.07 },
      update(t) {
        pulses.forEach((p) => { p.m.position.copy(p.c.getPoint((p.o + t * 0.18) % 1)); });
        core.rotation.set(t * 0.4, t * 0.6, 0); core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
        ringA.rotation.set(Math.PI / 2 + Math.sin(t) * 0.4, t * 0.8, 0);
      },
    };
  },

  /* 05 Supply Chain: warehouse aisle, racks with crates & cable drums, forklift moving a pallet */
  inventory({ scene, accent, label }) {
    scene.add(groundPlane(70, M.ground(0x101827), true, 0x1f2a3d));
    const frame = M.paint(0x2563eb, 0.45, 0.6); const beam = M.paint(0xf59e0b, 0.45, 0.4);
    const crateMat = [M.paint(0xa16207, 0.8, 0), M.paint(0x92400e, 0.8, 0), M.paint(0x78716c, 0.7, 0.1), M.paint(0x0f766e, 0.6, 0.1)];
    const glowCrates = [];
    for (const z of [-3.2, 3.2]) for (let r = 0; r < 4; r += 1) {
      const x0 = -12 + r * 6;
      for (const x of [x0, x0 + 5]) for (const zz of [z - 0.7, z + 0.7]) scene.add(rod(V(x, 0, zz), V(x, 6, zz), 0.07, frame, 6));
      for (let lvl = 0; lvl < 3; lvl += 1) {
        const y = 0.3 + lvl * 2; scene.add(box(5, 0.12, 0.1, beam, x0 + 2.5, y, z - 0.7), box(5, 0.12, 0.1, beam, x0 + 2.5, y, z + 0.7));
        for (let k = 0; k < 3; k += 1) {
          if ((r + lvl + k) % 5 === 0) {
            const drum = cyl(0.65, 0.65, 0.9, M.paint(0x8b5a2b, 0.8, 0), x0 + 0.9 + k * 1.6, y + 0.72, z, 28); drum.rotation.x = Math.PI / 2; scene.add(drum);
            scene.add(cyl(0.25, 0.25, 0.92, M.paint(0x111827, 0.5, 0.6), x0 + 0.9 + k * 1.6, y + 0.72, z, 16).rotateX(Math.PI / 2));
          } else {
            const c = box(1.3, 1.1, 1.2, crateMat[(r + lvl + k) % 4], x0 + 0.9 + k * 1.6, y + 0.62, z); scene.add(c);
            if ((r * 7 + lvl * 3 + k) % 9 === 2) glowCrates.push(c);
          }
        }
      }
    }
    const tag = M.glow(accent, 2.5);
    glowCrates.forEach((c) => { const t = box(0.5, 0.18, 0.02, tag, 0, 0.1, 0.61); c.add(t); });
    // forklift
    const fl = new THREE.Group(); const yellow = M.paint(0xfacc15, 0.45, 0.3); const black = M.paint(0x111827, 0.8, 0.2);
    fl.add(box(1.6, 0.8, 1.1, yellow, 0, 0.6, 0)); fl.add(box(0.9, 0.1, 1.0, black, -0.2, 1.75, 0));
    for (const [x, z] of [[-0.6, -0.5], [-0.6, 0.5], [0.2, -0.5], [0.2, 0.5]]) fl.add(rod(V(x, 1, z), V(x, 1.8, z), 0.035, black, 6));
    fl.add(box(0.1, 2.6, 0.9, black, 0.95, 1.4, 0));
    const forks = new THREE.Group(); forks.add(box(1.1, 0.07, 0.15, black, 0.5, 0, -0.3), box(1.1, 0.07, 0.15, black, 0.5, 0, 0.3)); const pallet = box(1.2, 0.9, 1.0, M.paint(0x0f766e, 0.6, 0.1), 0.55, 0.5, 0); forks.add(pallet); forks.position.set(1, 0.3, 0); fl.add(forks);
    for (const [x, z] of [[-0.5, -0.6], [-0.5, 0.6], [0.6, -0.6], [0.6, 0.6]]) { const w = cyl(0.28, 0.28, 0.2, black, x, 0.28, z, 16); w.rotation.x = Math.PI / 2; fl.add(w); }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), M.glow(0xf97316, 4)); beacon.position.set(-0.2, 1.9, 0); fl.add(beacon);
    scene.add(fl);
    label('VD-4R-ACSR dampers · 50 on hand · reserved for WO-0108', () => fl.position.clone().add(V(0.6, 3.4, 0)), 'accent');
    return {
      camera: { pos: V(-15, 18, 15), look: V(0, 1.2, 0), orbit: 0.05 },
      update(t) {
        const p = (t * 0.12) % 2; const x = p < 1 ? -10 + p * 20 : 10 - (p - 1) * 20; fl.position.set(x, 0, 0); fl.rotation.y = p < 1 ? 0 : Math.PI;
        forks.position.y = 0.3 + (0.5 + Math.sin(t * 0.9) * 0.5) * 1.6;
        tag.emissiveIntensity = 1.6 + Math.sin(t * 3) * 1.2; beacon.material.emissiveIntensity = Math.sin(t * 8) > 0 ? 5 : 0.5;
      },
    };
  },

  /* 06 Forecasting: an evolving risk terrain with towers on it and a forecast ribbon */
  forecast({ scene, accent, label }) {
    const N = 56; const S = 34; let fr = 0;
    const geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
    const col = new Float32Array(geo.attributes.position.count * 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.75, flatShading: false })); terrain.receiveShadow = true; scene.add(terrain);
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.08 })); scene.add(wire);
    const lo = new THREE.Color(0x14532d); const mid = new THREE.Color(0xd97706); const hi = new THREE.Color(0xdc2626); const tmp = new THREE.Color();
    const height = (x, z, t) => 1.6 * Math.sin(x * 0.22 + t * 0.4) * Math.cos(z * 0.19 - t * 0.25) + 1.1 * Math.sin((x + z) * 0.11 + t * 0.6) + 0.7 * Math.cos(Math.hypot(x - 5, z + 4) * 0.45 - t * 0.9);
    const towers = [];
    for (let i = 0; i < 9; i += 1) { const tw = tower(3.2, M.galv()); tw.group.scale.setScalar(0.55); const x = -12 + i * 3; const z = Math.sin(i * 0.7) * 5; tw.group.userData = { x, z }; scene.add(tw.group); towers.push(tw); }
    const ribbonMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    let ribbon = null;
    const flags = towers.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), M.glow(0xff3b3b, 3)); scene.add(m); return m; });
    label('Q1 2027 · 86 findings forecast for engineering review (P90 101)', () => V(0, 9, -3), 'accent');
    return {
      camera: { pos: V(-18, 19, 26), look: V(0, 0.5, -1), orbit: 0.05 },
      update(t) {
        fr += 1; if (fr % 2) return;
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i += 1) { const x = p.getX(i); const z = p.getZ(i); const y = height(x, z, t); p.setY(i, y); const k = (y + 3.4) / 6.8; if (k < 0.5) tmp.copy(lo).lerp(mid, k * 2); else tmp.copy(mid).lerp(hi, (k - 0.5) * 2); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
        p.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.computeVertexNormals();
        const pts = [];
        towers.forEach((tw, i) => { const { x, z } = tw.group.userData; const y = height(x, z, t); tw.group.position.set(x, y, z); flags[i].position.set(x, y + 2.6, z); flags[i].visible = y > 1.6; flags[i].scale.setScalar(1 + Math.sin(t * 6 + i) * 0.2); pts.push(V(x, y + 3.6 + Math.max(0, y) * 0.3, z)); });
        if (!ribbon || fr % 6 === 0) { if (ribbon) { scene.remove(ribbon); ribbon.geometry.dispose(); } ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.09, 8, false), ribbonMat); scene.add(ribbon); }
      },
    };
  },

  /* 07 Financial: a field of budget columns, coin stacks and a glowing cost curve */
  finance({ scene, accent, label }) {
    scene.add(groundPlane(70, M.ground()));
    const cols = 12; const rows = 5; const bars = [];
    const barMat = (k) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(0.42 - k * 0.07, 0.65, 0.45), metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 });
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), barMat(r)); m.castShadow = true; m.receiveShadow = true; m.position.set(-8.25 + c * 1.5, 0, -3 + r * 1.5); scene.add(m); bars.push({ m, r, c }); }
    const gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 1, roughness: 0.22 });
    const stacks = [];
    [[-11, 4, 9], [-9.6, 4.8, 6], [10.5, 4.2, 12], [11.8, 5.4, 7]].forEach(([x, z, n]) => { const g = new THREE.Group(); for (let i = 0; i < n; i += 1) { const coin = cyl(0.55, 0.55, 0.12, gold, Math.sin(i) * 0.04, 0.06 + i * 0.13, Math.cos(i) * 0.04, 40); g.add(coin); } g.position.set(x, 0, z); scene.add(g); stacks.push(g); });
    const curveMat = M.glow(accent, 3);
    let curve = null;
    const flip = cyl(0.55, 0.55, 0.12, gold, 0, 0, 0, 40); scene.add(flip); let fr = 0;
    label('FY2026 · $831k budget left vs $1.13M backlog', () => V(0, 8.2, -1), 'accent');
    return {
      camera: { pos: V(-15, 13, 21), look: V(0, 2.4, 0), orbit: 0.06 },
      update(t) {
        const tops = [];
        bars.forEach(({ m, r, c }) => { const h = 0.6 + 2.4 * (0.5 + 0.5 * Math.sin(c * 0.55 + r * 0.8 + t * 0.7)) + c * 0.18; m.scale.y = h; m.position.y = h / 2; if (r === rows - 1) tops.push(V(m.position.x, h + 1.4, m.position.z)); });
        fr += 1; if (!curve || fr % 4 === 0) { if (curve) { scene.remove(curve); curve.geometry.dispose(); } curve = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tops), 90, 0.07, 8, false), curveMat); scene.add(curve); }
        const p = (t * 0.5) % 1; flip.position.set(-11 + p * 0.0, 1.4 + Math.sin(p * Math.PI) * 3, 4); flip.rotation.set(p * Math.PI * 4, 0, 0.3);
        stacks.forEach((g, i) => { g.rotation.y = Math.sin(t * 0.5 + i) * 0.15; });
      },
    };
  },

  /* 08 Workforce & Safety: hard hat, cones, lock-out padlock, orbit of safety checks */
  workforce({ scene, accent, label }) {
    scene.add(groundPlane(60, M.ground()));
    const ped = cyl(2.2, 2.4, 0.5, M.paint(0x1e293b, 0.5, 0.4), 0, 0.25, 0, 64); scene.add(ped);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.04, 8, 128), M.glow(accent, 1.4)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.52; scene.add(rim);
    const hat = new THREE.Group(); const shell = new THREE.MeshPhysicalMaterial({ color: 0xd9a406, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.castShadow = true; hat.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.08, 64), shell); brim.position.set(0.12, 0.02, 0); brim.scale.set(1, 1, 0.82); brim.castShadow = true; hat.add(brim);
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 12, 64, Math.PI), shell); ridge.rotation.y = Math.PI / 2; hat.add(ridge);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.255, 0.05, 8, 96), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, emissive: 0xffffff, emissiveIntensity: 0.25, metalness: 0.9, roughness: 0.2 })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.35; stripe.scale.setScalar(0.96); hat.add(stripe);
    hat.position.y = 0.55; scene.add(hat);
    // cones
    const orange = M.paint(0xf97316, 0.5, 0.1); const white = M.paint(0xf8fafc, 0.4, 0.1);
    [[-4, 2], [4.2, 1.6], [-3.4, -3], [3.6, -3.2]].forEach(([x, z]) => { const g = new THREE.Group(); g.add(box(1, 0.08, 1, M.dark(), 0, 0.04, 0)); g.add(cyl(0.06, 0.42, 1.3, orange, 0, 0.73, 0, 32)); g.add(cyl(0.2, 0.27, 0.18, white, 0, 0.85, 0, 32)); g.position.set(x, 0, z); scene.add(g); });
    // padlock (lock-out tag-out)
    const lock = new THREE.Group(); lock.add(box(0.9, 0.8, 0.35, M.paint(0xdc2626, 0.35, 0.3), 0, 0, 0)); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 12, 32, Math.PI), M.galv()); sh.position.y = 0.4; lock.add(sh); lock.add(cyl(0.08, 0.08, 0.37, M.dark(), 0, -0.05, 0, 12).rotateX(Math.PI / 2)); lock.position.set(2.6, 2.2, 1.8); scene.add(lock);
    const tagG = box(0.6, 0.85, 0.02, M.paint(0xfde047, 0.6, 0), 0.1, -0.85, 0); lock.add(tagG);
    // orbit of check badges
    const badges = []; const ok = M.glow(0x22c55e, 2.2);
    for (let i = 0; i < 6; i += 1) { const b = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32), M.glow(accent, 0.45)); disc.rotation.x = Math.PI / 2; b.add(disc); const tick = new THREE.Group(); tick.add(box(0.07, 0.18, 0.04, ok, -0.08, -0.03, 0.05).rotateZ(0.8), box(0.07, 0.34, 0.04, ok, 0.06, 0.03, 0.05).rotateZ(-0.6)); b.add(tick); scene.add(b); badges.push(b); }
    label('PTW-HV-2602 approved · qualified HV crew · permits cleared', () => V(0, 4.6, 0), 'accent');
    return {
      camera: { pos: V(-9, 7, 12), look: V(0, 1.9, 0), orbit: 0.08 }, bloom: { strength: 0.32, threshold: 0.93, radius: 0.5 }, exposure: 0.9,
      update(t) {
        hat.rotation.y = t * 0.45; hat.position.y = 0.6 + Math.sin(t * 1.4) * 0.12;
        lock.rotation.y = Math.sin(t * 0.8) * 0.5; lock.position.y = 2.2 + Math.sin(t * 1.1) * 0.15; sh.position.y = 0.4 + (Math.sin(t * 0.6) > 0.7 ? 0.12 : 0);
        badges.forEach((b, i) => { const a = t * 0.5 + (i / badges.length) * Math.PI * 2; b.position.set(Math.cos(a) * 3.4, 2.4 + Math.sin(a * 2) * 0.4, Math.sin(a) * 3.4); b.lookAt(0, b.position.y, 0); b.rotateY(Math.PI); });
        rim.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5;
      },
    };
  },
};

/* ------------------------------------------------------------------ engine */
export function mountScene(canvas, key, { accent = '#7dd3fc', onLabels } = {}) {
  const build = SCENES[key] || SCENES.reliability;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.FogExp2(0x070b16, 0.028);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0b1020, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.2); sun.position.set(12, 22, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun);
  const rimLight = new THREE.DirectionalLight(new THREE.Color(accent), 1.1); rimLight.position.set(-14, 8, -16); scene.add(rimLight);

  const labels = [];
  const label = (text, at, tone = 'accent') => labels.push({ text, at, tone });
  const accentColor = new THREE.Color(accent);
  const s = build({ scene, accent: accentColor, label, THREE });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bl = s.bloom || {}; const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), bl.strength ?? 0.55, bl.radius ?? 0.6, bl.threshold ?? 0.82); composer.addPass(bloom);
  if (s.exposure) renderer.toneMappingExposure = s.exposure;
  composer.addPass(new OutputPass());

  const host = canvas.parentElement;
  let w = 1; let h = 1;
  let distK = 1;
  const resize = () => {
    w = host.clientWidth; h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h); camera.aspect = w / h;
    distK = Math.min(1.45, Math.max(1, 1.1 / camera.aspect));
    // the headline sits bottom-left: shift the rendered view so the scene's subject reads top-right of it
    if (w > 700) camera.setViewOffset(w, h, -w * 0.1, h * 0.12, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => { const r = host.getBoundingClientRect(); pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  host.addEventListener('pointermove', onMove);

  const cam = s.camera; const base = cam.pos.clone(); const look = cam.look.clone();
  const clock = new THREE.Clock(); let raf = 0; let running = true; let t = 0;
  const v = new THREE.Vector3();
  const frame = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05); if (!reduce) t += dt;
    pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
    const a = (reduce ? 0 : Math.sin(t * cam.orbit * 2) * 0.35) + pointer.x * 0.12;
    const off = base.clone().sub(look).multiplyScalar(distK); off.applyAxisAngle(V(0, 1, 0), a); camera.position.copy(look).add(off); camera.position.y += -pointer.y * 1.2; camera.lookAt(look);
    s.update(t, dt);
    composer.render();
    if (onLabels) onLabels(labels.map((l) => { v.copy(l.at()).project(camera); return { text: l.text, tone: l.tone, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1 }; }));
    raf = requestAnimationFrame(frame);
  };
  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);
  return { dispose: () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis); renderer.dispose(); } };
}
