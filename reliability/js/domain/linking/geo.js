// Small geometry and spatial-blocking helpers. Pure functions, no I/O.

export const M_PER_DEG = 111320;

/** Metres between two {lat, lng} points (flat-earth approximation, fine at these distances). */
export function distM(a, b) {
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Metres from point p to the segment a-b. */
export function pointToSegmentM(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * M_PER_DEG * k;
  const py = (p.lat - a.lat) * M_PER_DEG;
  const bx = (b.lng - a.lng) * M_PER_DEG * k;
  const by = (b.lat - a.lat) * M_PER_DEG;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Grid cell of a point, in cells of `cellM` metres. */
export function cellOf(p, cellM) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  return [Math.floor((p.lng * M_PER_DEG * k) / cellM), Math.floor((p.lat * M_PER_DEG) / cellM)];
}

/**
 * Spatial hash. `insert(item, point)` for points, `insertBox(item, a, b)` for segments.
 * `near(point)` returns the items in the 3x3 cells around the point, so anything within one cell size is found.
 */
export function createGrid(cellM) {
  const cells = new Map();
  const put = (ix, iy, item) => {
    const key = `${ix},${iy}`;
    (cells.get(key) ?? cells.set(key, []).get(key)).push(item);
  };
  return {
    insert(item, p) { const [ix, iy] = cellOf(p, cellM); put(ix, iy, item); },
    insertBox(item, a, b) {
      const [ax, ay] = cellOf(a, cellM);
      const [bx, by] = cellOf(b, cellM);
      for (let ix = Math.min(ax, bx); ix <= Math.max(ax, bx); ix += 1) {
        for (let iy = Math.min(ay, by); iy <= Math.max(ay, by); iy += 1) put(ix, iy, item);
      }
    },
    near(p) {
      const [ix, iy] = cellOf(p, cellM);
      const out = new Set();
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (const it of cells.get(`${ix + dx},${iy + dy}`) ?? []) out.add(it);
      return [...out];
    },
  };
}

/**
 * A single point to stand for a record's location: the point itself, or the centroid of a line.
 * Lets spans, conductors and lines go through the same distance gate and spatial blocking as towers.
 */
export function anchorOf(record) {
  const loc = record.location;
  if (!loc) return null;
  if (loc.type === 'point') return loc;
  if (loc.type === 'line' && loc.coordinates?.length) {
    const n = loc.coordinates.length;
    return { type: 'point', lat: loc.coordinates.reduce((s, c) => s + c[0], 0) / n, lng: loc.coordinates.reduce((s, c) => s + c[1], 0) / n };
  }
  return null;
}
