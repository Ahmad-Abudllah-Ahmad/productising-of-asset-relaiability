// Demo imagery for the finding viewer. There are no real inspection images: the "RGB" view uses the site's
// existing photographs, and everything else here is generated. Every image the viewer shows carries a visible
// "Demo image" label (added by findingViewer.js).
//
//   thermal   a false-colour view generated from the photograph's brightness plus a synthetic hot spot at the
//             marked area. The temperatures are made up, but deterministic for a given finding id.
//   placeholder a plain tile for findings with no photograph (LiDAR).
//   crop      the marked area, enlarged.
//
// Everything is drawn on 640 x 480 canvases (4:3). The photograph is scaled to cover the canvas, so a box given
// as fractions of the canvas lands in the same place in every view.

export const DEMO_LABEL = 'Demo image';
export const SIZE = Object.freeze({ w: 640, h: 480 });

/** Defects that run hot: a synthetic hot spot is stronger for these. */
const HOT = new Set(['clamp_loose', 'bushing_hotspot', 'insulator_contaminated', 'insulator_flashover_mark', 'damper_damaged', 'conductor_corrosion', 'broken_strand']);

const STOPS = [[0, [4, 4, 24]], [0.2, [59, 15, 112]], [0.4, [140, 41, 129]], [0.6, [222, 73, 104]], [0.8, [254, 159, 109]], [1, [252, 253, 191]]];
/** Iron-bow style false-colour palette: t in [0, 1] to [r, g, b]. */
export function falseColour(t) {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    if (x <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const k = (x - a) / (b - a);
      return [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
/** CSS gradient for the temperature scale, hottest at the top. */
export const SCALE_GRADIENT = `linear-gradient(to top, ${STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The synthetic temperatures for a finding: ambient, hot-spot rise, and the box centre. Deterministic. */
export function thermalModel(finding) {
  const h = hash(finding.id);
  const ambient = 18 + (h % 80) / 10;                       // 18.0 - 25.9 C
  const hot = HOT.has(finding.defectClass) || finding.sensor === 'thermal';
  const rise = hot ? 28 + ((h >>> 8) % 400) / 10 : 6 + ((h >>> 8) % 90) / 10;   // hot: +28 to +68 C; otherwise +6 to +15 C
  const b = finding.bbox ?? { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  return { ambient, rise, cx: b.x + b.w / 2, cy: b.y + b.h / 2, sx: Math.max(b.w, 0.06) * 0.5, sy: Math.max(b.h, 0.06) * 0.5, hot };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function cover(ctx, img, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Plain tile for findings with no photograph. */
export function drawPlaceholder(canvas, finding, { w, h } = SIZE) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2c3744'); g.addColorStop(1, '#53606f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(finding.sensor === 'lidar' ? 'LiDAR scan: no photograph for this finding' : 'No photograph for this finding', w / 2, h / 2);
}

/** The photograph, scaled to cover the canvas. Falls back to the placeholder tile when there is none. */
export function drawPhoto(canvas, img, finding, size = SIZE) {
  if (!img) { drawPlaceholder(canvas, finding, size); return; }
  canvas.width = size.w; canvas.height = size.h;
  cover(canvas.getContext('2d'), img, size.w, size.h);
}

/**
 * Generated false-colour thermal view. Returns the readouts: coldest, hottest, and hottest inside the marked area.
 * @returns {{min:number, max:number, boxMax:number|null, ambient:number}}
 */
export function drawThermal(canvas, img, finding, size = SIZE) {
  const { w, h } = size;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tm = thermalModel(finding);
  const lum = new Float32Array(w * h);
  if (img) {
    cover(ctx, img, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i += 1) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  } else {
    const hh = hash(`${finding.id}:field`);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) lum[y * w + x] = 0.5 + 0.25 * Math.sin((x + (hh % 97)) / 53) * Math.cos((y + (hh % 41)) / 37);
  }
  const temp = new Float32Array(w * h);
  let min = Infinity; let max = -Infinity;
  const b = finding.bbox;
  let boxMax = b ? -Infinity : null;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const dx = (x / w - tm.cx) / tm.sx;
      const dy = (y / h - tm.cy) / tm.sy;
      const t = tm.ambient - 6 + lum[i] * 14 + tm.rise * Math.exp(-(dx * dx + dy * dy) / 2);
      temp[i] = t;
      if (t < min) min = t;
      if (t > max) max = t;
      if (b && x / w >= b.x && x / w <= b.x + b.w && y / h >= b.y && y / h <= b.y + b.h && t > boxMax) boxMax = t;
    }
  }
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i += 1) {
    const [r, g, bl] = falseColour((temp[i] - min) / (max - min || 1));
    out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = bl; out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const r1 = (n) => Math.round(n * 10) / 10;
  return { min: r1(min), max: r1(max), boxMax: boxMax === null ? null : r1(boxMax), ambient: r1(tm.ambient) };
}

/** The marked area, enlarged, with some surroundings. */
export function drawCrop(canvas, img, finding, { w, h } = { w: 220, h: 165 }) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const b = finding.bbox;
  if (!img || !b) { drawPlaceholder(canvas, finding, { w, h }); return; }
  const full = document.createElement('canvas');
  drawPhoto(full, img, finding);
  const padX = b.w * 0.35;
  const padY = b.h * 0.35;
  const sx = Math.max(0, b.x - padX) * SIZE.w;
  const sy = Math.max(0, b.y - padY) * SIZE.h;
  const sw = Math.min(1 - Math.max(0, b.x - padX), b.w + 2 * padX) * SIZE.w;
  const sh = Math.min(1 - Math.max(0, b.y - padY), b.h + 2 * padY) * SIZE.h;
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, h);
  const k = Math.min(w / sw, h / sh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, sx, sy, sw, sh, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
  ctx.strokeStyle = '#f0a020'; ctx.lineWidth = 2;
  ctx.strokeRect((w - sw * k) / 2 + (b.x * SIZE.w - sx) * k, (h - sh * k) / 2 + (b.y * SIZE.h - sy) * k, b.w * SIZE.w * k, b.h * SIZE.h * k);
}
