// Where a span's point cloud comes from. Today there is one source: the simulator (domain/lidar/simulate.js).
//
// To use a real scan, register a provider. It gets the same parameters the simulator gets and returns either null (no scan for this
// span: the next provider is tried, ending with the simulator) or a cloud in the same shape:
//
//   { source: 'scan', cloud: { x, y, z, cls, clearance?, count }, profile?, stats?, geometry? }
//
// x, y, z are metres in the span frame (x along the span from tower A, y across, z up from the tower base); cls is 1 ground,
// 2 vegetation, 3 structure, 4 conductor (a .las classification code map goes in the provider). Large scans are thinned with
// decimate() before drawing. Whatever the source, the label on screen says where the points came from ("Simulated LiDAR" or "LiDAR scan").

import { simulateSpan } from '../domain/lidar/simulate.js';

const providers = [];
const cache = new Map();

/** @param {(params: object) => (object|null)} fn */
export function registerCloudProvider(fn) { providers.unshift(fn); cache.clear(); }

export function getCloud(params) {
  const key = `${params.spanId}|${params.clearanceM}|${params.towerHeightM}|${params.lengthM}|${params.vegetationFinding ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  for (const p of providers) { out = p(params); if (out) break; }
  out ??= simulateSpan(params);
  cache.set(key, out);
  return out;
}

/** Keep at most `max` points, evenly, always keeping conductors and structures. For real scans. */
export function decimate(cloud, max) {
  if (cloud.count <= max) return cloud;
  const keep = [];
  const rest = [];
  for (let i = 0; i < cloud.count; i += 1) (cloud.cls[i] >= 3 ? keep : rest).push(i);
  const room = Math.max(0, max - keep.length);
  const stride = rest.length > room ? rest.length / room : 1;
  for (let k = 0; k < rest.length; k += stride) keep.push(rest[Math.floor(k)]);
  keep.sort((a, b) => a - b);
  const pick = (arr) => Float32Array.from(keep, (i) => arr[i]);
  return { x: pick(cloud.x), y: pick(cloud.y), z: pick(cloud.z), cls: Uint8Array.from(keep, (i) => cloud.cls[i]), clearance: cloud.clearance ? pick(cloud.clearance) : undefined, count: keep.length };
}
