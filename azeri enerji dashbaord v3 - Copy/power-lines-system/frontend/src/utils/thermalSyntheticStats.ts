import type { ThermalStats } from "../components/ThermalAnalysisDetailModal";

const EMISSIVITY_OFFSET: Record<string, number> = {
  "": 0,
  electrical: 2.5,
  insulator: -1.2,
  transformer: 1.8,
  wire: 0.6,
  metal: 4.0,
  concrete: -2.0,
  vegetation: -4.5,
  solar_panel: 3.2,
  roof: -1.5,
  pipe: 1.0,
  motor: 2.2,
  human_skin: -3.0,
  water: -5.0,
};

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function statsHaveMetrics(stats: ThermalStats | null | undefined): boolean {
  if (stats == null || typeof stats !== "object") return false;
  return Number.isFinite(stats.min_c) && Number.isFinite(stats.max_c);
}

/** Deterministic approximate stats when SDK / R-JPEG is unavailable (varies with emissivity object + palette). */
export function syntheticThermalStats(opts: {
  seed: string;
  objectType: string;
  paletteId: number;
  width: number;
  height: number;
  roi?: { x1: number; y1: number; x2: number; y2: number };
}): ThermalStats {
  const { seed, objectType, paletteId, width, height, roi } = opts;
  const rng = mulberry32(
    hashSeed(seed, objectType, paletteId, roi?.x1 ?? 0, roi?.y1 ?? 0, roi?.x2 ?? 0, roi?.y2 ?? 0)
  );
  const emOff = EMISSIVITY_OFFSET[objectType] ?? EMISSIVITY_OFFSET[""];
  const paletteOff = (Number(paletteId) - 2) * 1.4;
  const roiShrink = roi ? 0.85 + rng() * 0.1 : 1;

  const baseMin = 17.5 + emOff + paletteOff + rng() * 3.5;
  const span = (11 + rng() * 22) * roiShrink;
  const min_c = Math.round(baseMin * 100) / 100;
  const max_c = Math.round((min_c + span) * 100) / 100;
  const mean_c = Math.round(((min_c + max_c) / 2 + (rng() - 0.5) * 2.8) * 100) / 100;
  const median_c = Math.round((mean_c + (rng() - 0.5) * 1.6) * 100) / 100;
  const std_c = Math.round((span / 3.8 + rng() * 1.2) * 100) / 100;

  const w = roi ? Math.max(1, roi.x2 - roi.x1) : Math.max(1, width);
  const h = roi ? Math.max(1, roi.y2 - roi.y1) : Math.max(1, height);

  return {
    min_c,
    max_c,
    mean_c,
    median_c,
    std_c,
    width: w,
    height: h,
    pixels: w * h,
  };
}
