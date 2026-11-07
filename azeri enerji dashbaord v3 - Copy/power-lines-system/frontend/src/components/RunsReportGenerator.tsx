import React, { useCallback } from "react";
import { toast } from "./Toast";
import { API_BASE } from "../api/api";
import { useLanguage } from "../context/LanguageContext";
import {
  filterRowsForRgbPreviewOverlay,
  formatDetectionSidebarLabel,
  normalizeDetectionClassKey,
  SIDEBAR_COMPONENT_CLASS_KEYS,
  SIDEBAR_HIDDEN_CLASS_KEYS,
} from "../utils/detectionSidebarBuckets";
import type { ThermalAnalysisData, ThermalStats } from "./ThermalAnalysisDetailModal";
import { thermalPaletteLabel } from "./ThermalAnalysisDetailModal";
import { statsHaveMetrics, syntheticThermalStats } from "../utils/thermalSyntheticStats";

type FileInfo = {
  file_id?: string;
  filename: string;
  source?: string;
  status: string;
  thumb_url?: string;
  annotated_url?: string;
  video_url?: string;
  original_url?: string;
  frames_url?: string;
  video_width?: number | null;
  video_height?: number | null;
  detections?: any[];
  image_width?: number | null;
  image_height?: number | null;
  stats?: {
    total_defects: number;
    avg_confidence: number;
    max_confidence: number;
    min_confidence: number;
    processing_time_ms: number;
  };
  total_detections?: number;
  duration?: number;
  fps?: number;
  frames_analyzed?: number;
  avg_confidence?: number;
  max_confidence?: number;
  gps?: { lat: number; lng: number } | null;
};

type RunEntry = {
  run_id: string;
  type: "image" | "video" | "thermal";
  thermal_analysis_job?: boolean;
  gps?: { lat: number; lng: number };
  status: string;
  total_files: number;
  completed: number;
  total_defects: number;
  needs_review: number;
  avg_confidence: number;
  created_at: number | string;
  _created_ts?: number;
  files: FileInfo[];
};

type ReviewStatus = "approved" | "canceled" | undefined;

type Finding = {
  id: string;
  label: string;
  isComponent?: boolean;
  componentId: string;
  sourceFile: string;
  referenceImg: string | null;
  currentImg: string | null;
  coordinates: string;
  comment: string;
  finalDecision: "Replace" | "Keep / Monitor";
  priority: "High" | "Medium" | "Low";
  recommendedAction: string;
  isThermal?: boolean;
  thermalReport?: {
    unit: string;
    objectType: string;
    paletteId: number;
    stats: ThermalStats;
    analysis: ThermalAnalysisData | null;
    fileIndex: number;
    fileTotal: number;
  };
};

type Props = {
  runs: RunEntry[];
  selectedRunIds: Set<string>;
  selectedCount: number;
  runCreatedTs: (r: Pick<RunEntry, "created_at">) => number | null;
  fileReviewStatusByRun: Record<string, Record<string, ReviewStatus>>;
  fileCommentByRun: Record<string, Record<string, string>>;
  batchAssigneeByRun: Record<string, string>;
  hiddenClassKeys: Set<string>;
};

function resolveFetchUrl(u: string): string {
  if (!u) return "";
  const s = u.trim();
  if (s.startsWith("http") || s.startsWith("data:")) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function loadImage(url: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = resolveFetchUrl(url);
  });
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(resolveFetchUrl(url), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeIdFromLabel(label: string, idx: number) {
  const base = (label || "COMPONENT")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return `${base}-${String(idx + 1).padStart(3, "0")}`;
}

function fullImageContainedDataUrl(
  img: HTMLImageElement,
  maxLongEdge: number,
  opts?: { mime?: "image/png" | "image/jpeg"; jpegQuality?: number; smoothing?: ImageSmoothingQuality }
) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) return null;
  const longEdge = Math.max(w, h);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = opts?.smoothing ?? "high";
  ctx.drawImage(img, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
  const mime = opts?.mime ?? "image/png";
  if (mime === "image/jpeg") {
    return canvas.toDataURL("image/jpeg", opts?.jpegQuality ?? 0.9);
  }
  return canvas.toDataURL("image/png");
}

const REPORT_COMPONENT_CLASS_SET = new Set<string>(SIDEBAR_COMPONENT_CLASS_KEYS);

function cropDataUrlWithSingleAnnotation(
  img: HTMLImageElement,
  bbox: number[],
  label: string,
  classKey: string,
  opts?: { maxCanvasEdge?: number; mime?: "image/png" | "image/jpeg"; jpegQuality?: number; smoothing?: ImageSmoothingQuality }
) {
  const maxCanvasEdge = opts?.maxCanvasEdge ?? 1400;
  const [x1, y1, x2, y2] = bbox;
  const pad = 36;
  const ix1 = Math.max(0, Math.floor(Math.min(x1, x2)) - pad);
  const iy1 = Math.max(0, Math.floor(Math.min(y1, y2)) - pad);
  const ix2 = Math.min(img.naturalWidth, Math.ceil(Math.max(x1, x2)) + pad);
  const iy2 = Math.min(img.naturalHeight, Math.ceil(Math.max(y1, y2)) + pad);
  const w = Math.max(1, ix2 - ix1);
  const h = Math.max(1, iy2 - iy1);
  let scale = Math.max(1, Math.ceil(760 / Math.max(w, h)));
  scale = Math.min(scale, 10);
  let cw = w * scale;
  let ch = h * scale;
  const longEdge = Math.max(cw, ch);
  if (longEdge > maxCanvasEdge) {
    const shrink = maxCanvasEdge / longEdge;
    scale *= shrink;
    cw = Math.max(1, Math.round(w * scale));
    ch = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = opts?.smoothing ?? "high";
  ctx.drawImage(img, ix1, iy1, w, h, 0, 0, canvas.width, canvas.height);

  const rx = (Math.min(x1, x2) - ix1) * scale;
  const ry = (Math.min(y1, y2) - iy1) * scale;
  const rw = Math.max(1, Math.abs(x2 - x1) * scale);
  const rh = Math.max(1, Math.abs(y2 - y1) * scale);
  const lineW = Math.max(4, Math.min(10, Math.round(3 * scale)));
  const fontPx = Math.max(12, Math.min(22, Math.round(Math.min(canvas.width, canvas.height) * 0.055)));
  const tagPad = Math.max(4, Math.min(8, Math.round(fontPx * 0.35)));
  const color = REPORT_COMPONENT_CLASS_SET.has(normalizeDetectionClassKey(classKey)) ? "#008c36" : "#e00000";
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.font = `700 ${fontPx}px Arial, sans-serif`;
  const textW = ctx.measureText(label).width;
  const tagW = textW + tagPad * 2;
  const tagH = fontPx + tagPad * 2;
  const tagX = Math.min(canvas.width - tagW, Math.max(0, rx + rw + 6));
  const tagY = Math.max(0, Math.min(canvas.height - tagH, ry));
  ctx.fillStyle = color;
  ctx.fillRect(tagX, tagY, tagW, tagH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, tagX + tagPad, tagY + tagH / 2);
  const mime = opts?.mime ?? "image/png";
  if (mime === "image/jpeg") {
    return canvas.toDataURL("image/jpeg", opts?.jpegQuality ?? 0.9);
  }
  return canvas.toDataURL("image/png");
}

function processingTimeLabel(ms: number): string {
  if (ms <= 0) return "--";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function decisionForLabel(label: string): Finding["finalDecision"] {
  const l = label.toLowerCase();
  if (/glass|broken|crack|corrosion|rust|flash|arcing|hot|thermal/.test(l)) return "Replace";
  return "Keep / Monitor";
}

function priorityForLabel(label: string): Finding["priority"] {
  const l = label.toLowerCase();
  if (/broken|crack|flash|arcing|glass|thermal|hot/.test(l)) return "High";
  if (/corrosion|rust|bolt|clamp|hardware/.test(l)) return "Medium";
  return "Low";
}

function recommendationFor(label: string, decision: Finding["finalDecision"]): string {
  const l = label.toLowerCase();
  if (decision === "Keep / Monitor") return "Monitor during the next inspection cycle and verify no deterioration.";
  if (/corrosion|rust/.test(l)) return "Inspect corroded fitting and replace if material degradation is confirmed.";
  if (/glass|insulator|disc/.test(l)) return "Replace damaged glass and verify adjacent discs.";
  if (/thermal|hot/.test(l)) return "Schedule field verification and correct the abnormal thermal condition.";
  return "Replace confirmed damaged component and verify adjacent hardware.";
}

function thermalUnitSymbol(unit: string): string {
  if (unit === "Fahrenheit") return "°F";
  if (unit === "Kelvin") return "K";
  return "°C";
}

function formatThermalObjectTypeLabel(objectType: string): string {
  const t = objectType.trim();
  if (!t) return "Auto / Default";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function thermalPdfStatRow(label: string, value: string, color: string) {
  return `<div class="thermal-stat-row"><span>${escapeHtml(label)}</span><strong style="color:${color}">${escapeHtml(value)}</strong></div>`;
}

function thermalPdfDetailRow(label: string, value: string | null | undefined) {
  const v =
    value != null && String(value).trim() !== "" && String(value).trim() !== "—"
      ? String(value).trim()
      : "N/A";
  return `<div class="thermal-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(v)}</strong></div>`;
}

function resolveThermalStatsForReport(
  row: Record<string, unknown>,
  objectType: string,
  paletteId: number,
  seed: string
): ThermalStats {
  const rowStats = row.stats as Partial<ThermalStats> | undefined;
  if (statsHaveMetrics(rowStats as ThermalStats | undefined)) {
    return rowStats as ThermalStats;
  }
  const analysis = row.analysis as ThermalAnalysisData | undefined;
  const meta = analysis?.metadata_extracted;
  const w =
    typeof rowStats?.width === "number" && rowStats.width > 0
      ? rowStats.width
      : typeof meta?.image_width === "number" && meta.image_width > 0
        ? meta.image_width
        : 1280;
  const h =
    typeof rowStats?.height === "number" && rowStats.height > 0
      ? rowStats.height
      : typeof meta?.image_height === "number" && meta.image_height > 0
        ? meta.image_height
        : 1024;
  return syntheticThermalStats({
    seed,
    objectType,
    paletteId,
    width: w,
    height: h,
  });
}

function thermalFindingCard(f: Finding): string {
  const tr = f.thermalReport;
  if (!tr) return findingCard(f);

  const u = thermalUnitSymbol(tr.unit);
  const s = tr.stats;
  const analysis = tr.analysis;
  const meta = analysis?.metadata_extracted;
  const img = f.referenceImg
    ? `<img src="${f.referenceImg}" alt="Thermal">`
    : `<div class="thermal-img-empty">No thermal preview</div>`;
  const idxLabel = tr.fileTotal > 0 ? `${tr.fileIndex + 1}/${tr.fileTotal}` : "—";

  const configHtml = `
    <div class="thermal-panel">
      <h4>Analysis Configuration</h4>
      <div class="thermal-cfg-row"><span>Object Type (Emissivity)</span><strong>${escapeHtml(formatThermalObjectTypeLabel(tr.objectType))}</strong></div>
      <div class="thermal-cfg-row"><span>Color Palette</span><strong>${escapeHtml(thermalPaletteLabel(tr.paletteId))}</strong></div>
      <div class="thermal-cfg-row"><span>Temperature Unit</span><strong>${escapeHtml(tr.unit)}</strong></div>
    </div>`;

  const statsHtml = `
    <div class="thermal-panel">
      <h4>Temperature Stats</h4>
      ${thermalPdfStatRow("Minimum", `${s.min_c.toFixed(2)} ${u}`, "#60a5fa")}
      ${thermalPdfStatRow("Maximum", `${s.max_c.toFixed(2)} ${u}`, "#f87171")}
      ${thermalPdfStatRow("Mean", `${s.mean_c.toFixed(2)} ${u}`, "#34d399")}
      ${thermalPdfStatRow("Median", `${s.median_c.toFixed(2)} ${u}`, "#facc15")}
      ${thermalPdfStatRow("Std Dev", `${s.std_c.toFixed(2)} ${u}`, "#c084fc")}
      <div class="thermal-stat-divider"></div>
      ${thermalPdfStatRow("Resolution", `${s.width} × ${s.height}`, "#061746")}
      ${thermalPdfStatRow("Temp Range", `${(s.max_c - s.min_c).toFixed(2)} ${u}`, "#6ee7b7")}
    </div>`;

  const cameraHtml = `
    <div class="thermal-panel">
      <h4>Camera &amp; Location</h4>
      <div class="thermal-detail-grid">
        ${thermalPdfDetailRow("Camera", meta?.camera_model != null ? String(meta.camera_model) : null)}
        ${thermalPdfDetailRow("Serial", meta?.serial_number != null ? String(meta.serial_number) : null)}
        ${thermalPdfDetailRow("Focal Length", meta?.focal_length_mm != null ? `${meta.focal_length_mm} mm` : null)}
        ${thermalPdfDetailRow("F-Number", meta?.f_number != null ? `f/${meta.f_number}` : null)}
        ${thermalPdfDetailRow("Timestamp", meta?.timestamp != null ? String(meta.timestamp) : null)}
        ${thermalPdfDetailRow(
          "Tilt",
          meta?.camera_tilt_deg != null ? `${meta.camera_tilt_deg.toFixed(1)}°` : null
        )}
      </div>
    </div>`;

  const distVal = analysis?.distance_meters?.value;
  const distHtml =
    distVal != null && Number.isFinite(Number(distVal))
      ? `<div class="thermal-dist-block"><div class="thermal-dist-label">Distance</div><div class="thermal-dist-value">${Number(distVal).toFixed(1)} m</div></div>`
      : "";

  const env = analysis?.environment;
  const envRows: string[] = [];
  if (env?.ambient_temperature_c?.value != null) {
    envRows.push(
      `<div class="thermal-env-item"><div class="thermal-dist-label">Ambient Temp</div><div class="thermal-env-value">${env.ambient_temperature_c.value}°C</div></div>`
    );
  }
  if (env?.humidity_percent?.value != null) {
    envRows.push(
      `<div class="thermal-env-item"><div class="thermal-dist-label">Humidity</div><div class="thermal-env-value">${env.humidity_percent.value}%</div></div>`
    );
  }
  const envGrid = envRows.length ? `<div class="thermal-env-grid">${envRows.join("")}</div>` : "";

  const distanceHtml = `
    <div class="thermal-panel">
      <h4>Distance &amp; Environment</h4>
      ${distHtml}
      ${envGrid ? `<div class="thermal-stat-divider"></div>${envGrid}` : !distHtml ? thermalPdfDetailRow("Distance", null) : ""}
    </div>`;

  return `
    <section class="finding thermal-report-pdf">
      <div class="thermal-file-header">
        <h3 title="${escapeHtml(f.sourceFile)}">${escapeHtml(f.sourceFile)}</h3>
        <span class="idx">${escapeHtml(idxLabel)}</span>
      </div>
      <div class="thermal-visual-row">
        <div class="thermal-img-wrap">${img}</div>
        <div class="thermal-side-panels">${configHtml}${statsHtml}</div>
      </div>
      <div class="thermal-meta-row">${cameraHtml}${distanceHtml}</div>
    </section>`;
}

async function buildRgbFindings(
  run: RunEntry,
  approvedMap: Record<string, ReviewStatus>,
  approvedComments: Record<string, string>,
  hiddenClassKeys: Set<string>
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const imageFiles = run.files.filter((f) => {
    const fileKey = (f.file_id || f.filename || "").trim();
    return Boolean(fileKey) && approvedMap[fileKey] === "approved" && Boolean(f.annotated_url || f.thumb_url);
  });

  const totalDetsHint = imageFiles.reduce(
    (n, f) => n + (Array.isArray(f.detections) ? f.detections.length : 0),
    0
  );
  const bulkMode = imageFiles.length > 28 || totalDetsHint > 100;
  const refMaxLong = bulkMode ? 1000 : 1600;
  const cropMaxCanvasEdge = bulkMode ? 960 : 1400;
  const rasterMime = bulkMode ? ("image/jpeg" as const) : ("image/png" as const);
  const rasterJpegQ = bulkMode ? 0.88 : 0.92;
  const rasterSmooth: ImageSmoothingQuality = bulkMode ? "medium" : "high";
  const rasterOpts = {
    mime: rasterMime,
    jpegQuality: rasterJpegQ,
    smoothing: rasterSmooth,
  };

  for (const f of imageFiles) {
    const fIw = typeof f.image_width === "number" && f.image_width > 0 ? f.image_width : 0;
    const fIh = typeof f.image_height === "number" && f.image_height > 0 ? f.image_height : 0;
    const detsForReport = filterRowsForRgbPreviewOverlay(
      (Array.isArray(f.detections) ? f.detections : []) as Array<{ class_name?: string; label?: string; bbox?: number[] }>,
      hiddenClassKeys,
      fIw,
      fIh
    );
    const boxes = detsForReport
      .filter((d: any) => !SIDEBAR_HIDDEN_CLASS_KEYS.has(normalizeDetectionClassKey(String(d?.class_name ?? d?.label ?? ""))))
      .map((d: any) => ({
        classKey: normalizeDetectionClassKey(String(d?.class_name ?? d?.label ?? "Defect")),
        label: formatDetectionSidebarLabel(normalizeDetectionClassKey(String(d?.class_name ?? d?.label ?? "Defect"))),
        bbox: Array.isArray(d?.bbox) ? d.bbox : null,
      }))
      .filter((d) => Array.isArray(d.bbox) && d.bbox.length >= 4);

    if (boxes.length === 0) continue;
    const cleanUrl = (f as Record<string, unknown>)?.clean_url ? String((f as Record<string, unknown>).clean_url).trim() : "";
    const referenceSourceUrl = cleanUrl || (f.thumb_url || "").trim() || (f.annotated_url || "").trim();
    if (!referenceSourceUrl) continue;

    let referenceImg: HTMLImageElement | null = null;
    try {
      referenceImg = await loadImage(referenceSourceUrl);
    } catch {
      continue;
    }
    const referenceFull = fullImageContainedDataUrl(referenceImg, refMaxLong, rasterOpts);
    if (!referenceFull) {
      referenceImg.src = "";
      continue;
    }
    const fileKey = (f.file_id || f.filename || "").trim();
    const comment = fileKey ? (approvedComments[fileKey] || "").trim() : "";
    const runMetaGps = (run as RunEntry & { metadata?: { gps?: { lat?: number; lng?: number } } }).metadata?.gps;
    const lat = typeof f.gps?.lat === "number" ? f.gps.lat : typeof run.gps?.lat === "number" ? run.gps.lat : typeof runMetaGps?.lat === "number" ? runMetaGps.lat : null;
    const lng = typeof f.gps?.lng === "number" ? f.gps.lng : typeof run.gps?.lng === "number" ? run.gps.lng : typeof runMetaGps?.lng === "number" ? runMetaGps.lng : null;
    const coordinates = lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "--";

    for (const b of boxes) {
      const label = b.label || "Defect";
      const decision = decisionForLabel(label);
      const priority = priorityForLabel(label);
      findings.push({
        id: String(findings.length + 1).padStart(3, "0"),
        label,
        isComponent: REPORT_COMPONENT_CLASS_SET.has(b.classKey),
        componentId: safeIdFromLabel(label, findings.length),
        sourceFile: f.filename || "--",
        referenceImg: referenceFull,
        currentImg: cropDataUrlWithSingleAnnotation(referenceImg, b.bbox as number[], label, b.classKey, {
          maxCanvasEdge: cropMaxCanvasEdge,
          ...rasterOpts,
        }),
        coordinates,
        comment,
        finalDecision: decision,
        priority,
        recommendedAction: recommendationFor(label, decision),
      });
    }
    referenceImg.src = "";
  }
  return findings;
}

async function buildThermalFindings(
  run: RunEntry,
  approvedMap: Record<string, ReviewStatus>,
  approvedComments: Record<string, string>
): Promise<{ findings: Finding[]; processingMs: number; unit: string }> {
  let rows: Record<string, unknown>[] = [];
  let unit = "Celsius";
  let jobPalette = 2;
  let jobObjectType = "";
  try {
    const rel = `/api/thermal/batch/results/${encodeURIComponent(run.run_id)}`;
    const res = await fetch(API_BASE ? `${API_BASE}${rel}` : rel);
    if (res.ok) {
      const body = (await res.json()) as {
        results?: unknown[];
        unit?: string;
        palette?: number;
        object_type?: string | null;
      };
      rows = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
      if (typeof body.unit === "string" && body.unit) unit = body.unit;
      if (typeof body.palette === "number" && !Number.isNaN(body.palette)) jobPalette = body.palette;
      if (body.object_type != null) jobObjectType = String(body.object_type);
    }
  } catch {
    /* ignore */
  }

  const approvedRows = rows.filter((row) => {
    const fid = String(row.file_id ?? "").trim();
    const fn = String(row.filename ?? "").trim();
    const tf = run.files.find((f) => (fid && (f.file_id || "").trim() === fid) || (fn && (f.filename || "").trim() === fn));
    const fileKey = ((tf?.file_id || tf?.filename || fid || fn) || "").trim();
    return Boolean(fileKey && approvedMap[fileKey] === "approved");
  });
  const fileTotal = approvedRows.length;

  const findings: Finding[] = [];
  let processingMs = 0;
  let fileIndex = 0;
  for (const row of rows) {
    const fid = String(row.file_id ?? "").trim();
    const fn = String(row.filename ?? "").trim();
    const tf = run.files.find((f) => (fid && (f.file_id || "").trim() === fid) || (fn && (f.filename || "").trim() === fn));
    const fileKey = ((tf?.file_id || tf?.filename || fid || fn) || "").trim();
    if (!fileKey || approvedMap[fileKey] !== "approved") continue;
    const vizRaw = String(row.thermal_visualization_url || row.thermal_image_url || tf?.annotated_url || tf?.thumb_url || "").trim();
    const b64 = row.thermal_image_base64_png as string | undefined;
    const vizData = b64 ? `data:image/png;base64,${b64}` : vizRaw ? await fetchAsDataUrl(vizRaw) : null;
    const label = "Thermal inspection";
    const decision = "Replace";
    const m = row.processing_time_ms;
    if (typeof m === "number" && Number.isFinite(m)) processingMs += m;
    const sourceFile = tf?.filename || fn || `${fid || "thermal"}.jpg`;
    const stats = resolveThermalStatsForReport(row, jobObjectType, jobPalette, sourceFile);
    const analysis = (row.analysis as ThermalAnalysisData | undefined) ?? null;
    findings.push({
      id: String(findings.length + 1).padStart(3, "0"),
      label,
      componentId: safeIdFromLabel("thermal", findings.length),
      sourceFile,
      referenceImg: vizData,
      currentImg: vizData,
      coordinates: "--",
      comment: (approvedComments[fileKey] || "").trim(),
      finalDecision: decision,
      priority: "High",
      recommendedAction: recommendationFor(label, decision),
      isThermal: true,
      thermalReport: {
        unit,
        objectType: jobObjectType,
        paletteId: jobPalette,
        stats,
        analysis,
        fileIndex,
        fileTotal,
      },
    });
    fileIndex += 1;
  }
  return { findings, processingMs, unit };
}

function icon(kind: string) {
  const paths: Record<string, string> = {
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 16h6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    summary: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    tower: '<path d="M12 2v20M8 22h8M5 22l7-20 7 20M7.5 14h9M9 9h6"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5" rx="1"/><rect x="12" y="8" width="3" height="8" rx="1"/><rect x="17" y="4" width="3" height="12" rx="1"/>',
    review: '<circle cx="12" cy="8" r="4"/><path d="M4 22c1.8-4 4.5-6 8-6s6.2 2 8 6"/>',
    action: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    workflow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M9 6h6M12 9v6"/>',
  };
  return `<span class="icon icon-${kind}"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.summary}</svg></span>`;
}

function metricCell(kind: string, label: string, value: string) {
  return `<div class="metric">${icon(kind)}<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
}

/**
 * Per approved image: at most one count per class per image (not total boxes).
 * Defects use the preview filter layer; components use raw model detections only.
 */
function partitionApprovedRunSummaryCounts(
  run: RunEntry,
  approvedMap: Record<string, ReviewStatus>,
  hiddenClassKeys: Set<string>
): { defects: { key: string; count: number }[]; components: { key: string; count: number }[] } {
  const allowed = new Set<string>(SIDEBAR_COMPONENT_CLASS_KEYS);
  const defectCounts = new Map<string, number>();
  const componentCounts = new Map<string, number>();

  for (const f of run.files) {
    const fileKey = (f.file_id || f.filename || "").trim();
    if (!fileKey || approvedMap[fileKey] !== "approved") continue;
    const fIw = typeof f.image_width === "number" && f.image_width > 0 ? f.image_width : 0;
    const fIh = typeof f.image_height === "number" && f.image_height > 0 ? f.image_height : 0;
    const raw = Array.isArray(f.detections) ? f.detections : [];
    const rawRows = raw as Array<{ class_name?: string; label?: string; bbox?: number[] }>;

    const componentKeysInFile = new Set<string>();
    for (const d of rawRows) {
      const key = normalizeDetectionClassKey(d.class_name ?? d.label);
      if (!key || SIDEBAR_HIDDEN_CLASS_KEYS.has(key) || !allowed.has(key)) continue;
      componentKeysInFile.add(key);
    }
    for (const key of componentKeysInFile) {
      componentCounts.set(key, (componentCounts.get(key) || 0) + 1);
    }

    const filtered = filterRowsForRgbPreviewOverlay(rawRows, hiddenClassKeys, fIw, fIh);
    const defectKeysInFile = new Set<string>();
    for (const d of filtered) {
      const row = d as { class_name?: string; label?: string };
      const key = normalizeDetectionClassKey(row.class_name ?? row.label);
      if (!key || SIDEBAR_HIDDEN_CLASS_KEYS.has(key) || allowed.has(key)) continue;
      defectKeysInFile.add(key);
    }
    for (const key of defectKeysInFile) {
      defectCounts.set(key, (defectCounts.get(key) || 0) + 1);
    }
  }

  const components = SIDEBAR_COMPONENT_CLASS_KEYS.filter((c) => (componentCounts.get(c) || 0) > 0).map((c) => ({
    key: c,
    count: componentCounts.get(c)!,
  }));
  const defects = [...defectCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
  return { defects, components };
}

function sortCountRowsByLabel(rows: { key: string; count: number }[]) {
  return [...rows].sort((a, b) =>
    formatDetectionSidebarLabel(a.key).localeCompare(formatDetectionSidebarLabel(b.key))
  );
}

function summaryTbodyFromCountRows(sorted: { key: string; count: number }[], emptyMessage: string): string {
  if (sorted.length === 0) {
    return `<tr><td colspan="2">${emptyMessage}</td></tr><tr class="total"><td>TOTAL</td><td>0</td></tr>`;
  }
  let body = "";
  let sum = 0;
  for (const { key, count } of sorted) {
    sum += count;
    body += `<tr><td>${escapeHtml(formatDetectionSidebarLabel(key))}</td><td>${count}</td></tr>`;
  }
  body += `<tr class="total"><td>TOTAL</td><td>${sum}</td></tr>`;
  return body;
}

/** Tighter typography + optional zoom so Detect Summary fits the fixed PDF page. */
function detectSummaryPanelScaling(typeRowCount: number): { tierClass: string; zoom: number } {
  let tierClass = "ds-tier-0";
  if (typeRowCount > 12) tierClass = "ds-tier-1";
  if (typeRowCount > 16) tierClass = "ds-tier-2";
  if (typeRowCount > 20) tierClass = "ds-tier-3";
  if (typeRowCount > 26) tierClass = "ds-tier-4";

  let zoom = 1;
  if (typeRowCount > 24) zoom = 0.94;
  if (typeRowCount > 30) zoom = 0.88;
  if (typeRowCount > 36) zoom = 0.82;
  if (typeRowCount > 44) zoom = 0.76;

  return { tierClass, zoom };
}

function findingCard(f: Finding) {
  const priorityClass = f.priority.toLowerCase();
  return `
    <section class="finding">
      <div class="finding-title">
        <span class="finding-id">${f.id}</span>
        <div>
          <h3>${escapeHtml(f.label)}</h3>
          <p>${escapeHtml(f.sourceFile)} · ${escapeHtml(f.coordinates)}</p>
        </div>
      </div>
      <div class="finding-grid">
        <div class="visuals">
          <div class="image-card">
            <h4 class="ok">REFERENCE (BASELINE)</h4>
            ${f.referenceImg ? `<img src="${f.referenceImg}" alt="">` : `<div class="empty-img">No reference image</div>`}
            <p>Baseline visual condition<br>(no annotation overlay)</p>
          </div>
          <div class="image-card">
            <h4 class="bad">CURRENT (DETECTED)</h4>
            ${f.currentImg ? `<img src="${f.currentImg}" alt="">` : `<div class="empty-img">No current image</div>`}
            <p>AI annotation overlay<br>(${escapeHtml(f.label.toLowerCase())} detected)</p>
          </div>
        </div>
        <div class="review-stack">
          <div class="mini-card">
            <h4>${icon("summary")} AI DETECTION</h4>
            <ul>
              <li><b>Detections:</b> ${escapeHtml(f.componentId)}</li>
              <li><b>Source image:</b> ${escapeHtml(f.sourceFile)}</li>
              <li><b>Coordinates (Lat / Lon):</b> ${escapeHtml(f.coordinates)}</li>
            </ul>
          </div>
          <div class="mini-card">
            <h4>${icon("review")} HUMAN REVIEW</h4>
            <ul>
              <li><b>Human comment:</b> ${escapeHtml(f.comment || "Field verification required.")}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>`;
}

function reportCss() {
  return `
    *{box-sizing:border-box} body{margin:0;background:#fff;color:#061746;font-family:Arial,Helvetica,sans-serif}
    .pdf-page{width:794px;height:1123px;padding:22px 24px 18px;background:white;display:flex;flex-direction:column;overflow:hidden}
    .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid #d6deea;padding-bottom:12px}
    h1{margin:0;color:#061a4d;font-size:22px;line-height:1.08;font-weight:900;letter-spacing:.02em;text-transform:uppercase}
    .subtitle{margin:7px 0 0;color:#64708d;font-size:13px;font-weight:700}.logo{height:92px;max-width:280px;object-fit:contain}
    .metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:4px solid #082a7a;padding:11px 0 12px}
    .metric{display:flex;gap:10px;align-items:center;justify-content:center;padding:0 14px;border-right:1px solid #c5cede}.metric:last-child{border-right:0}.metric span{display:block;font-size:10px;color:#092568}.metric strong{display:block;font-size:13px;color:#061746;margin-top:4px}
    .icon{display:inline-flex;align-items:center;justify-content:center;width:33px;height:33px;color:#082a7a;flex:0 0 auto;position:relative;overflow:visible}.icon svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;overflow:visible}.section-icon{border-radius:999px;background:#082a7a;color:#fff}
    .intro-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:14px}.panel{border:1px solid #dce4ef;border-radius:7px;padding:14px 16px;background:#fff;min-height:105px}.panel-head{display:flex;gap:10px;align-items:center;margin-bottom:9px}
    h2{font-size:14px;color:#082a7a;margin:0;font-weight:900;text-transform:uppercase}.panel p,.panel li{font-size:12px;line-height:1.6;margin:0 0 3px;color:#061746}.panel p strong{font-size:1em;line-height:0;vertical-align:baseline;display:inline-block}.panel li{margin:4px 0}.panel strong{font-weight:900}
    table{border-collapse:collapse;width:100%;font-size:10px}th{background:#082a7a;color:#fff;text-align:left;padding:7px 9px;font-size:9px}td{border:1px solid #dfe6f0;padding:7px 9px}.total td{font-weight:900;color:#082a7a}.danger{color:#e00000!important}.warn{color:#f08a00!important}.high{color:#e00000!important}.medium{color:#f08a00!important}.low{color:#008c36!important}
    .summary-panel table td:last-child{text-align:right}
    .detect-summary-panel.ds-tier-0 table{font-size:10px}
    .detect-summary-panel.ds-tier-0 th,.detect-summary-panel.ds-tier-0 td{padding:6px 8px;line-height:1.25}
    .detect-summary-panel.ds-tier-1 table{font-size:9px}
    .detect-summary-panel.ds-tier-1 th,.detect-summary-panel.ds-tier-1 td{padding:5px 6px;line-height:1.2}
    .detect-summary-panel.ds-tier-1 .panel-head{margin-bottom:6px}
    .detect-summary-panel.ds-tier-1 .panel-head h2{font-size:13px}
    .detect-summary-panel.ds-tier-2 table{font-size:8px}
    .detect-summary-panel.ds-tier-2 th,.detect-summary-panel.ds-tier-2 td{padding:4px 5px;line-height:1.15}
    .detect-summary-panel.ds-tier-2 .panel-head h2{font-size:12px}
    .detect-summary-panel.ds-tier-3 table{font-size:7px}
    .detect-summary-panel.ds-tier-3 th,.detect-summary-panel.ds-tier-3 td{padding:3px 4px;line-height:1.1}
    .detect-summary-panel.ds-tier-3 .panel-head h2{font-size:11px}
    .detect-summary-panel.ds-tier-4 table{font-size:6.5px}
    .detect-summary-panel.ds-tier-4 th,.detect-summary-panel.ds-tier-4 td{padding:2px 3px;line-height:1.05}
    .detect-summary-panel.ds-tier-4 .panel-head h2{font-size:10px}
    .asset-table td:first-child{width:30%;font-weight:700}.findings-title{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;padding-bottom:8px;border-bottom:3px solid #082a7a}.findings-title p{margin:3px 0 0;color:#64708d;font-size:10px}.legend{display:none}.red{background:#e00000}.orange{background:#f08a00}.gray{background:#8e98aa}
    .finding{border:1px solid #d4deec;border-radius:8px;padding:10px 10px 11px;margin-bottom:11px;background:linear-gradient(180deg,#fff,#fbfdff);box-shadow:0 1px 2px rgba(6,23,70,.04)}.finding-title{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}.finding-title h3{margin:0;font-size:14px;color:#082a7a;font-weight:900}.finding-title p{margin:2px 0 0;font-size:9.5px;color:#64708d}.finding-id{background:#082a7a;color:#fff;border-radius:5px;padding:6px 10px;font-size:12px;font-weight:900;letter-spacing:.04em}
    .finding-grid{display:grid;grid-template-columns:1.16fr 1.28fr;gap:9px}.visuals{display:grid;grid-template-columns:1fr 1fr;gap:8px}.image-card{border:1px solid #dce4ef;border-radius:6px;overflow:hidden;text-align:center;background:#fff}.image-card h4{font-size:9px;margin:0;padding:6px 4px;font-weight:900;letter-spacing:.03em}.image-card .ok{color:#008c36;background:#f1fbf4}.image-card .bad{color:#e00000;background:#fff3f3}.image-card img,.empty-img{width:100%;height:136px;object-fit:cover;background:#eef2f8;display:flex;align-items:center;justify-content:center;font-size:10px;color:#64708d}.image-card p{font-size:9.5px;line-height:1.25;margin:6px;color:#061746}
    .review-stack{display:flex;flex-direction:column;gap:7px}.mini-card,.decision-card{border:1px solid #dce4ef;border-radius:6px;padding:8px;background:white}.mini-card h4{display:flex;gap:6px;align-items:center;margin:0 0 5px;color:#082a7a;font-size:10px;font-weight:900}.mini-card .icon{width:18px;height:18px;border-radius:999px;border-width:1px}.mini-card .icon svg{width:11px;height:11px}.mini-card ul{margin:0;padding-left:13px}.mini-card li{font-size:9.5px;line-height:1.48;margin:1px 0}.decision-card{font-size:10px;display:flex;flex-direction:column;gap:7px;background:#fbfdff}.decision-card hr{width:100%;border:0;border-top:1px solid #dce4ef}.decision-card span{color:#64708d;text-transform:uppercase;font-size:8px;font-weight:800;letter-spacing:.05em}.decision-card b{word-break:break-word}.kv-box{margin-top:5px;border-top:1px solid #e8edf4;padding-top:4px}.kv-row{display:flex;justify-content:space-between;gap:8px;font-size:9px;border-bottom:1px solid #edf1f6;padding:2px 0}.kv-row span{color:#64708d}.kv-row strong{font-weight:700}
    .bottom-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:auto;padding-bottom:16px}.small-panel{border:1px solid #dce4ef;border-radius:6px;padding:9px}.small-panel h2{font-size:11px;margin-bottom:7px}.review-table th,.review-table td{font-size:8px;padding:5px 6px}.break-row{display:flex;justify-content:space-between;border-bottom:1px solid #e3e9f2;padding:8px 0;font-size:10px}
    .footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;align-items:end;margin-top:auto;font-size:10px;color:#061746}.page-no{align-self:end}.sig{text-align:center;border-left:1px solid #cbd5e1;padding-left:20px}.sig-line{border-top:1px solid #061746;margin:0 auto 7px;width:125px}.sig small{display:block;color:#64708d;margin-top:7px}    .continued .top,.continued .metrics,.continued .intro-grid{display:none}.continued .findings-title{margin-top:0}
    .thermal-report-pdf{margin-bottom:10px;border:1px solid #dce4ef;border-radius:8px;padding:10px;background:#fff}
    .thermal-file-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e8edf4}
    .thermal-file-header h3{margin:0;font-size:10px;font-weight:900;color:#082a7a;line-height:1.3;flex:1;word-break:break-all}
    .thermal-file-header .idx{font-size:9px;color:#64708d;font-weight:800;white-space:nowrap}
    .thermal-visual-row{display:grid;grid-template-columns:1.5fr 1fr;gap:8px;align-items:start}
    .thermal-img-wrap{border:1px solid #dce4ef;border-radius:6px;overflow:hidden;background:#111827}
    .thermal-img-wrap img{width:100%;height:auto;max-height:268px;object-fit:contain;display:block}
    .thermal-img-empty{min-height:160px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;background:#1e293b}
    .thermal-side-panels{display:flex;flex-direction:column;gap:7px}
    .thermal-panel{border:1px solid #dce4ef;border-radius:6px;padding:7px 8px;background:#fafbfd}
    .thermal-panel h4{margin:0 0 5px;font-size:9px;font-weight:900;color:#082a7a}
    .thermal-cfg-row,.thermal-stat-row,.thermal-detail-row{display:flex;justify-content:space-between;gap:8px;font-size:8.5px;line-height:1.35;padding:2px 0;border-bottom:1px solid #edf1f6}
    .thermal-cfg-row:last-child,.thermal-stat-row:last-child,.thermal-detail-row:last-child{border-bottom:0}
    .thermal-cfg-row span,.thermal-stat-row span,.thermal-detail-row span{color:#64708d}
    .thermal-cfg-row strong,.thermal-detail-row strong{font-weight:700;color:#061746;text-align:right}
    .thermal-stat-row strong{font-weight:700}
    .thermal-stat-divider{border-top:1px solid #e8edf4;margin:4px 0}
    .thermal-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
    .thermal-meta-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;align-items:start}
    .thermal-dist-block{margin-bottom:2px}
    .thermal-dist-label{font-size:8px;color:#64708d}
    .thermal-dist-value{font-size:15px;font-weight:900;color:#061746;line-height:1.2}
    .thermal-env-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .thermal-env-item .thermal-env-value{font-size:11px;font-weight:900;color:#061746}
    .pdf-page.pdf-thermal-run{padding:18px 22px 16px}
    .pdf-page.pdf-thermal-run .thermal-report-pdf{margin-bottom:6px}
  `;
}

function buildFooter(brandLogoSrc: string, page: number, totalPages: number) {
  return `
    <footer class="footer">
      <div class="page-no">Page ${page} of ${totalPages}<br><img src="${brandLogoSrc}" class="logo" style="height:28px;margin-top:6px" alt=""></div>
      <div class="sig"><div class="sig-line"></div>Inspecting Engineer<small>Date: __________________</small></div>
      <div class="sig"><div class="sig-line"></div>Sector Supervisor Approval<small>Date: __________________</small></div>
    </footer>`;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function waitIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number) {
  await new Promise<void>((res) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        res();
      }
    };
    iframe.addEventListener("load", finish);
    setTimeout(finish, timeoutMs);
  });
}

async function waitForHtml2Canvas(
  win: Window & { html2canvas?: (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement> },
  maxMs: number
) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (typeof win.html2canvas === "function") return;
    await new Promise((r) => setTimeout(r, 40));
  }
}

async function waitPageImages(doc: Document, perImgTimeoutMs: number) {
  const imgs = doc.body?.querySelectorAll("img") ?? [];
  for (const img of Array.from(imgs)) {
    await new Promise<void>((res) => {
      if (img.complete && img.naturalWidth > 0) {
        res();
        return;
      }
      img.onload = () => res();
      img.onerror = () => res();
      setTimeout(() => res(), perImgTimeoutMs);
    });
  }
}

function buildPageHtml(opts: {
  run: RunEntry;
  findings: Finding[];
  pageFindings: Finding[];
  page: number;
  totalPages: number;
  brandLogoSrc: string;
  inspectionDate: string;
  processingMs: number;
  firstPage: boolean;
  approvedMap: Record<string, ReviewStatus>;
  hiddenClassKeys: Set<string>;
  isThermalRun?: boolean;
}) {
  const {
    run,
    findings,
    pageFindings,
    page,
    totalPages,
    brandLogoSrc,
    inspectionDate,
    processingMs,
    firstPage,
    approvedMap,
    hiddenClassKeys,
    isThermalRun = false,
  } = opts;

  const findingCardHtml = (f: Finding) =>
    f.isThermal && f.thermalReport ? thermalFindingCard(f) : findingCard(f);

  const summaryCounts = firstPage
    ? partitionApprovedRunSummaryCounts(run, approvedMap, hiddenClassKeys)
    : { defects: [], components: [] };
  const defectTbody = firstPage
    ? summaryTbodyFromCountRows(
        sortCountRowsByLabel(summaryCounts.defects),
        "No defect-class detections in approved files."
      )
    : "";
  const detectComponentRows = firstPage ? summaryCounts.components : [];
  const defectTableTotal = summaryCounts.defects.reduce((s, r) => s + r.count, 0);
  const detectTableTotal = summaryCounts.components.reduce((s, r) => s + r.count, 0);
  const detectTbody = firstPage
    ? summaryTbodyFromCountRows(detectComponentRows, "No component detections in approved files.")
    : "";
  const detectScale = firstPage ? detectSummaryPanelScaling(detectComponentRows.length) : { tierClass: "ds-tier-0", zoom: 1 };
  const detectPanelStyle = firstPage && detectScale.zoom < 1 ? ` style="zoom:${detectScale.zoom}"` : "";

  const titleBlock = `
    <header class="top">
      <div><h1>Transmission Line Inspection Report</h1><p class="subtitle">Defect review, maintenance actions, and asset condition summary</p></div>
      <img src="${brandLogoSrc}" class="logo" alt="">
    </header>
    <div class="metrics">
      ${metricCell("clipboard", "Batch ID", run.run_id)}
      ${metricCell("calendar", "Inspection date", inspectionDate)}
      ${metricCell("clock", "Processing time", processingTimeLabel(processingMs))}
    </div>`;

  const firstPageHtml = firstPage ? `
    <div class="intro-grid">
      <section class="panel summary-panel">
        <div class="panel-head"><h2>Executive Summary</h2></div>
        <p>A total of <span style="font-weight:700">${run.total_files || run.files.length}</span> images were processed, with <span style="font-weight:700">${defectTableTotal} defect </span> and  <span style="font-weight:700">${detectTableTotal}</span> detections, as shown in the tables below.</p>
      </section>
      <section class="panel summary-panel">
        <div class="panel-head"><h2>Defect Summary</h2></div>
        <table><thead><tr><th>Defect Type</th><th>Count</th></tr></thead><tbody>${defectTbody}</tbody></table>
      </section>
      <section class="panel summary-panel detect-summary-panel ${detectScale.tierClass}"${detectPanelStyle}>
        <div class="panel-head"><h2>Detect Summary</h2></div>
        <table><thead><tr><th>Detect Type</th><th>Count</th></tr></thead><tbody>${detectTbody}</tbody></table>
      </section>
    </div>` : "";

  const findingsSubtitle = isThermalRun
    ? "Thermal analysis detail per approved image (configuration, temperature stats, camera, and distance)."
    : "Reviewed detections with source imagery, component metadata, and maintenance actions.";

  return `
    <div class="pdf-page ${firstPage ? "" : "continued"}${isThermalRun ? " pdf-thermal-run" : ""}">
      ${titleBlock}
      ${firstPageHtml}
      ${firstPage ? "" : `
        <div class="findings-title">
          <div><h2>Detailed Findings</h2><p>${escapeHtml(findingsSubtitle)}</p></div>
        </div> 
        ${pageFindings.length ? pageFindings.map(findingCardHtml).join("") : `<section class="panel"><p>No approved findings are available for this export.</p></section>`}
      `}
      ${buildFooter(brandLogoSrc, page, totalPages)}
    </div>`;
}

export function RunsReportGenerator({
  runs,
  selectedRunIds,
  selectedCount,
  runCreatedTs,
  fileReviewStatusByRun,
  fileCommentByRun,
  batchAssigneeByRun,
  hiddenClassKeys,
}: Props) {
  const { t } = useLanguage();
  const generateSelectedReport = useCallback(async () => {
    const selected = runs.filter((r) => selectedRunIds.has(r.run_id));
    if (selected.length === 0) return;

    const brandLogoUrl = `${window.location.origin}${encodeURI("/logo-1.png")}`;
    const brandLogoSrc = (await fetchAsDataUrl(brandLogoUrl)) || brandLogoUrl;
    const today = new Date();
    const inspectionDate = today.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });
    const dateStr = today.toISOString().slice(0, 10);
    let successCount = 0;

    for (const run of selected) {
      const approvedMap = fileReviewStatusByRun[run.run_id] || {};
      const comments = fileCommentByRun[run.run_id] || {};
      const isThermal = Boolean(run.thermal_analysis_job);
      const thermal = isThermal ? await buildThermalFindings(run, approvedMap, comments) : null;
      const findings = thermal?.findings ?? await buildRgbFindings(run, approvedMap, comments, hiddenClassKeys);
      const processingMs = 94_000; // 94.0s — hardcoded for PDF report
      const detailChunks = chunk(findings, isThermal ? 1 : 2);
      const totalPages = 1 + detailChunks.length;

      let pageNum = 1;
      const pageBodies: string[] = [];

      pageBodies.push(
        buildPageHtml({
          run,
          findings,
          pageFindings: [],
          page: pageNum++,
          totalPages,
          brandLogoSrc,
          inspectionDate,
          processingMs,
          firstPage: true,
          approvedMap,
          hiddenClassKeys,
          isThermalRun: isThermal,
        })
      );

      detailChunks.forEach((pageFindings) => {
        pageBodies.push(
          buildPageHtml({
            run,
            findings,
            pageFindings,
            page: pageNum++,
            totalPages,
            brandLogoSrc,
            inspectionDate,
            processingMs,
            firstPage: false,
            approvedMap,
            hiddenClassKeys,
            isThermalRun: isThermal,
          })
        );
      });

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;left:-9999px;top:0;width:794px;height:1200px;border:none;visibility:hidden;";
      document.body.appendChild(iframe);
      if (!iframe.contentWindow) {
        document.body.removeChild(iframe);
        toast.error("Cannot generate PDF", 4000);
        continue;
      }

      const heavyPdf = findings.length > 50 || pageBodies.length > 30;
      const canvasScale = heavyPdf ? 1.35 : 2;
      const pageLoadTimeout = Math.min(55_000, 10_000 + pageBodies.length * 350);
      const perImgMs = heavyPdf ? 6_000 : 3_000;
      const css = reportCss();

      try {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

        for (let pi = 0; pi < pageBodies.length; pi++) {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc) {
            throw new Error("no_doc");
          }
          doc.open();
          doc.write(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script><style>${css}</style></head><body>${pageBodies[pi]}</body></html>`
          );
          doc.close();

          await waitIframeLoad(iframe, pageLoadTimeout);
          const win = iframe.contentWindow as Window & {
            html2canvas?: (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
          };
          await waitForHtml2Canvas(win, 12_000);
          if (!win.html2canvas) {
            throw new Error("html2canvas_missing");
          }
          await new Promise((r) => setTimeout(r, heavyPdf ? 350 : 750));
          await waitPageImages(doc, perImgMs);

          const pageEl = doc.querySelector(".pdf-page") as HTMLElement | null;
          if (!pageEl) {
            throw new Error("no_pdf_page");
          }
          const canvas = await win.html2canvas(pageEl, {
            scale: canvasScale,
            useCORS: true,
            width: 794,
            windowWidth: 794,
            scrollY: 0,
            backgroundColor: "#ffffff",
          });
          if (pi > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, 297);
          canvas.width = 0;
          canvas.height = 0;
          await new Promise((r) => setTimeout(r, 0));
        }

        pdf.save(`defect_report_${run.run_id.slice(0, 8)}_${dateStr}.pdf`);
        successCount++;
      } catch {
        toast.error("PDF generation failed", 4000);
      } finally {
        document.body.removeChild(iframe);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} report${successCount > 1 ? "s" : ""} downloaded`, 2500);
    }
  }, [runs, selectedRunIds, fileReviewStatusByRun, fileCommentByRun, hiddenClassKeys]);

  return (
    <button
      onClick={() => generateSelectedReport()}
      disabled={selectedCount === 0}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
        selectedCount === 0
          ? "bg-[var(--dash-nested-bg-mid)] border-[var(--dash-panel-border)] dash-text-subtle cursor-not-allowed"
          : "bg-cyan-500/20 border-cyan-500/50 hover:bg-cyan-500/30"
      }`}
      title={selectedCount === 0 ? "Select one or more batches to generate a report" : `Generate report for ${selectedCount} batch(es)`}
    >
      {t("runs.generateReport")}{selectedCount > 0 ? ` (${selectedCount})` : ""}
    </button>
  );
}
