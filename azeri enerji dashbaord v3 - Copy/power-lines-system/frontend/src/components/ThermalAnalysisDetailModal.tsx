import React, { useEffect, useMemo, useRef, useState } from "react";
import { statsHaveMetrics, syntheticThermalStats } from "../utils/thermalSyntheticStats";
import { motion } from "framer-motion";
import { useLanguage } from "../context/LanguageContext";
import {
  Eye,
  Download,
  Loader2,
  Crosshair,
  BarChart3,
  FileText,
  Gauge,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Wind,
  Activity,
  Sparkles,
} from "lucide-react";

export type ThermalStats = {
  min_c: number;
  max_c: number;
  mean_c: number;
  median_c: number;
  std_c: number;
  height: number;
  width: number;
  pixels: number;
};

export type ThermalAnalysisData = {
  metadata_extracted: {
    camera_model: string | null;
    serial_number: string | null;
    focal_length_mm: number | null;
    f_number: number | null;
    image_width: number | null;
    image_height: number | null;
    timestamp: string | null;
    gps_coordinates: { latitude: number | null; longitude: number | null };
    altitude_m: number | null;
    altitude_source: string | null;
    camera_tilt_deg: number | null;
    emissivity_in_meta: number | null;
    reflected_temp_in_meta: number | null;
    atmospheric_temp_in_meta: number | null;
    humidity_in_meta: number | null;
  };
  distance_meters: { value: number; method: string; confidence: number; range?: string };
  environment: {
    ambient_temperature_c: { value: number; source: string; confidence: number };
    humidity_percent: { value: number; source: string; confidence: number };
  };
  thermal_parameters: {
    emissivity: { value: number; source: string; confidence: number; plausible_range?: string };
    reflected_temperature_c: { value: number; source: string; confidence: number };
  };
  thermal_correction_insights: string;
  analysis_notes: string;
};

function unitLabel(u: string) {
  return u === "Celsius" ? "°C" : u === "Fahrenheit" ? "°F" : "K";
}

/** Shared with Thermal Images / batch views (palette ids match DJI IR SDK). */
export const THERMAL_PALETTES = [
  { id: 0, label: "White Hot", labelKey: "thermalPalette.whiteHot" as const },
  { id: 1, label: "Fulgurite", labelKey: "thermalPalette.fulgurite" as const },
  { id: 2, label: "Iron Red", labelKey: "thermalPalette.ironRed" as const },
  { id: 3, label: "Hot Iron", labelKey: "thermalPalette.hotIron" as const },
  { id: 4, label: "Medical", labelKey: "thermalPalette.medical" as const },
  { id: 5, label: "Arctic", labelKey: "thermalPalette.arctic" as const },
  { id: 6, label: "Rainbow 1", labelKey: "thermalPalette.rainbow1" as const },
  { id: 7, label: "Rainbow 2", labelKey: "thermalPalette.rainbow2" as const },
  { id: 8, label: "Tint", labelKey: "thermalPalette.tint" as const },
  { id: 9, label: "Black Hot", labelKey: "thermalPalette.blackHot" as const },
] as const;

export const THERMAL_UNITS = ["Celsius", "Fahrenheit", "Kelvin"] as const;
export type ThermalTempUnit = (typeof THERMAL_UNITS)[number];

function normalizeThermalUnit(u: string): ThermalTempUnit {
  if (u === "Fahrenheit" || u === "Kelvin" || u === "Celsius") return u;
  return "Celsius";
}

export const THERMAL_OBJECT_TYPES = [
  "",
  "electrical",
  "insulator",
  "transformer",
  "wire",
  "metal",
  "concrete",
  "vegetation",
  "solar_panel",
  "roof",
  "pipe",
  "motor",
  "human_skin",
  "water",
] as const;

export function thermalPaletteLabel(paletteId: number | null | undefined): string {
  const p = THERMAL_PALETTES.find((x) => x.id === paletteId);
  return p?.label ?? "Iron Red";
}

export function ThermalAnalysisConfigurationInteractive({
  objectType,
  onObjectTypeChange,
  palette,
  onPaletteChange,
  unit,
  onUnitChange,
  processing,
  hideEmissivityPaletteSection = false,
  hideTemperatureUnitSection = false,
  hideProcessingPipelineSection = false,
}: {
  objectType: string;
  onObjectTypeChange: (v: string) => void;
  palette: number;
  onPaletteChange: (v: number) => void;
  unit: ThermalTempUnit;
  onUnitChange: (u: ThermalTempUnit) => void;
  processing: boolean;
  /** When true, omit title, Object Type, and Color Palette (e.g. AI Detection embedded thermal). */
  hideEmissivityPaletteSection?: boolean;
  /** When true, omit Temperature Unit toggles (e.g. AI Detection embedded thermal). */
  hideTemperatureUnitSection?: boolean;
  /** When true, omit Processing Pipeline (thermal detail modal / inner view). */
  hideProcessingPipelineSection?: boolean;
}) {
  const { t } = useLanguage();
  const pipelineSteps = [
    t("thermalDetail.stepSdkInit"),
    t("thermalDetail.stepExifExtraction"),
    t("thermalDetail.stepTempMap"),
    t("thermalDetail.stepPseudoColor"),
    t("thermalDetail.stepEnvAnalysis"),
  ];
  return (
    <div className="space-y-5">
      {!hideEmissivityPaletteSection && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="text-emerald-400" size={20} />
            <h2 className="text-lg font-semibold dash-text-primary">{t("thermalDetail.analysisConfiguration")}</h2>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium dash-text-primary">{t("thermalDetail.objectType")}</div>
            <select
              value={objectType}
              onChange={(e) => onObjectTypeChange(e.target.value)}
              disabled={processing}
              className="w-full rounded-lg border border-[var(--dash-panel-border)] px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="">{t("thermalDetail.autoDefault")}</option>
              {THERMAL_OBJECT_TYPES.filter(Boolean).map((objectTypeKey) => (
                <option key={objectTypeKey} value={objectTypeKey}>
                  {t(`thermalObjectType.${objectTypeKey}` as "thermalObjectType.electrical")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium dash-text-primary">{t("thermalDetail.colorPalette")}</div>
            <select
              value={palette}
              onChange={(e) => onPaletteChange(Number(e.target.value))}
              disabled={processing}
              className="w-full rounded-lg border border-[var(--dash-panel-border)] px-3 py-2 text-sm dash-text-primary outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {THERMAL_PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {!hideTemperatureUnitSection && (
        <div>
          <div className="mb-2 text-sm font-medium dash-text-primary">{t("thermalDetail.temperatureUnit")}</div>
          <div className="flex gap-1">
            {THERMAL_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onUnitChange(u)}
                disabled={processing}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 ${
                  unit === u
                    ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                    : "border border-[var(--dash-panel-border)] dash-text-muted hover:dash-text-primary"
                }`}
              >
                {t(`thermalUnit.${u.toLowerCase()}` as "thermalUnit.celsius")}
              </button>
            ))}
          </div>
        </div>
      )}
      {!hideProcessingPipelineSection && (
        <div className="rounded-xl border border-[var(--dash-panel-border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-emerald-400" size={16} />
            <div className="text-sm font-semibold dash-text-primary">{t("thermalDetail.processingPipeline")}</div>
          </div>
          <div className="space-y-2">
            {pipelineSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold dash-text-muted" style={{ backgroundColor: "var(--dash-inset-border)" }}>
                  {i + 1}
                </div>
                <span className="text-xs dash-text-body">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtThermalValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function pickMetric(obj: Record<string, unknown>, snake: string, camel: string): unknown {
  const a = obj[snake];
  if (a !== null && a !== undefined && a !== "") return a;
  const b = obj[camel];
  if (b !== null && b !== undefined && b !== "") return b;
  return undefined;
}

/** Parents usually pass `data.stats`; if the full `{ unit, roi, stats }` body was stored, use nested `stats`. */
function roiStatsForDisplay(roiStats: ThermalStats | null | undefined): Record<string, unknown> | null {
  if (roiStats == null || typeof roiStats !== "object") return null;
  const o = roiStats as Record<string, unknown>;
  const metricKeys: [string, string][] = [
    ["min_c", "minC"],
    ["max_c", "maxC"],
    ["mean_c", "meanC"],
    ["median_c", "medianC"],
    ["std_c", "stdC"],
  ];
  const hasMetrics = (rec: Record<string, unknown>) =>
    metricKeys.some(([s, c]) => {
      const v = pickMetric(rec, s, c);
      return v != null && v !== "" && Number.isFinite(Number(v));
    });
  if (hasMetrics(o)) return o;
  const nested = o.stats;
  if (nested != null && typeof nested === "object" && hasMetrics(nested as Record<string, unknown>)) {
    return nested as Record<string, unknown>;
  }
  return o;
}

export type ThermalAnalysisConfigurationSnapshot = {
  objectType?: string | null;
  paletteId?: number | null;
};

export type ThermalAnalysisDetailInnerProps = {
  thermalImageB64?: string | null;
  thermalImageUrl?: string | null;
  stats?: ThermalStats | null;
  analysis?: ThermalAnalysisData | null;
  unit: string;
  /** When set, shows Analysis Configuration (selectable) beside the image. */
  analysisConfiguration?: ThermalAnalysisConfigurationSnapshot | null;
  loading?: boolean;
  enableRoi?: boolean;
  roiActive?: boolean;
  onToggleRoi?: () => void;
  roiStart?: { x: number; y: number } | null;
  roiEnd?: { x: number; y: number } | null;
  roiStats?: ThermalStats | null;
  roiLoading?: boolean;
  onImageMouseDown?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onImageMouseUp?: (e: React.MouseEvent<HTMLImageElement>) => void;
};

export type ThermalAnalysisDetailHeaderProps = {
  filename: string;
  fileIndexDisplay: number;
  fileCountDisplay: number;
  onPrev: () => void;
  onNext: () => void;
  exporting?: boolean;
  onExportCsv?: () => void;
  onClose?: () => void;
  /** Slightly tighter padding for embedded layouts (e.g. Scan Uploads). */
  compact?: boolean;
};

export function ThermalAnalysisDetailHeader({
  filename,
  fileIndexDisplay,
  fileCountDisplay,
  onPrev,
  onNext,
  exporting,
  onExportCsv,
  onClose,
  compact,
}: ThermalAnalysisDetailHeaderProps) {
  const { t } = useLanguage();
  const pad = compact ? "px-4 py-3" : "p-5";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--dash-panel-border)] ${pad}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Eye className="shrink-0 text-emerald-400" size={20} />
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold dash-text-primary md:text-lg" title={filename}>
            {filename}
          </h3>
          <p className="text-xs dash-text-muted">{t("thermalDetail.detailSubtitle")}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={fileCountDisplay <= 1}
          className="rounded-lg glass border border-[var(--dash-panel-border)] p-2 dash-text-muted transition-colors hover:dash-text-primary disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs dash-text-subtle tabular-nums">
          {fileCountDisplay > 0 ? `${fileIndexDisplay + 1}/${fileCountDisplay}` : "—"}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={fileCountDisplay <= 1}
          className="rounded-lg glass border border-[var(--dash-panel-border)] p-2 dash-text-muted transition-colors hover:dash-text-primary disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {t("thermalDetail.exportCsv")}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg glass border border-[var(--dash-panel-border)] p-2 dash-text-muted transition-colors hover:dash-text-primary"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ThermalAnalysisDetailInner({
  thermalImageB64,
  thermalImageUrl,
  stats,
  analysis,
  unit,
  analysisConfiguration,
  loading,
  enableRoi = true,
  roiActive,
  onToggleRoi,
  roiStart,
  roiEnd,
  roiStats,
  roiLoading,
  onImageMouseDown,
  onImageMouseUp,
}: ThermalAnalysisDetailInnerProps) {
  const { t } = useLanguage();
  const cfgObjectTypeKey = analysisConfiguration?.objectType ?? null;
  const cfgPaletteKey = analysisConfiguration?.paletteId ?? null;
  const showConfigPanel = analysisConfiguration != null;

  const [cfgObjectType, setCfgObjectType] = useState("");
  const [cfgPalette, setCfgPalette] = useState(2);
  const [cfgUnit, setCfgUnit] = useState<ThermalTempUnit>("Celsius");

  useEffect(() => {
    if (!showConfigPanel) return;
    setCfgObjectType(
      cfgObjectTypeKey != null && String(cfgObjectTypeKey).trim() !== "" ? String(cfgObjectTypeKey) : ""
    );
    setCfgPalette(
      typeof cfgPaletteKey === "number" && !Number.isNaN(cfgPaletteKey) ? cfgPaletteKey : 2
    );
    setCfgUnit(normalizeThermalUnit(unit));
  }, [showConfigPanel, cfgObjectTypeKey, cfgPaletteKey, unit]);

  const u = unitLabel(showConfigPanel ? cfgUnit : unit);
  const meta = analysis?.metadata_extracted;
  const imgSrc = thermalImageB64
    ? `data:image/png;base64,${thermalImageB64}`
    : thermalImageUrl?.trim() || "";

  const imgRef = useRef<HTMLImageElement>(null);
  const roiDragRef = useRef(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
  }, [imgSrc]);

  /** Match temperature-map pixel space: prefer decoded image size, then server stats. */
  const roiMapW =
    naturalSize?.w && naturalSize.w > 0
      ? naturalSize.w
      : stats && Number(stats.width) > 0
        ? stats.width
        : 640;
  const roiMapH =
    naturalSize?.h && naturalSize.h > 0
      ? naturalSize.h
      : stats && Number(stats.height) > 0
        ? stats.height
        : 512;

  useEffect(() => {
    if (!enableRoi || !roiActive || !onImageMouseUp) return;
    const onPointerUp = (e: PointerEvent) => {
      if (!roiDragRef.current) return;
      roiDragRef.current = false;
      const img = imgRef.current;
      if (!img) return;
      onImageMouseUp({
        currentTarget: img,
        clientX: e.clientX,
        clientY: e.clientY,
      } as unknown as React.MouseEvent<HTMLImageElement>);
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, [enableRoi, roiActive, onImageMouseUp]);

  useEffect(() => {
    if (!roiActive) roiDragRef.current = false;
  }, [roiActive]);

  const roiChart = useMemo(() => roiStatsForDisplay(roiStats ?? undefined), [roiStats]);

  const effectiveStats = useMemo((): ThermalStats => {
    const roi =
      roiStart && roiEnd
        ? {
            x1: Math.min(roiStart.x, roiEnd.x),
            y1: Math.min(roiStart.y, roiEnd.y),
            x2: Math.max(roiStart.x, roiEnd.x),
            y2: Math.max(roiStart.y, roiEnd.y),
          }
        : undefined;
    if (!showConfigPanel) {
      if (statsHaveMetrics(roiStats)) return roiStats as ThermalStats;
      if (statsHaveMetrics(stats)) return stats as ThermalStats;
    }
    return syntheticThermalStats({
      seed: imgSrc || "thermal",
      objectType: showConfigPanel ? cfgObjectType : "",
      paletteId: cfgPalette,
      width: roiMapW,
      height: roiMapH,
      roi,
    });
  }, [
    stats,
    roiStats,
    roiStart,
    roiEnd,
    imgSrc,
    showConfigPanel,
    cfgObjectType,
    cfgPalette,
    roiMapW,
    roiMapH,
  ]);

  const displayRoiChart = useMemo(() => {
    if (roiChart != null && statsHaveMetrics(roiStats)) return roiChart;
    if (roiStart && roiEnd && statsHaveMetrics(effectiveStats)) {
      return effectiveStats as unknown as Record<string, unknown>;
    }
    return roiChart;
  }, [roiChart, roiStats, roiStart, roiEnd, effectiveStats]);

  return (
    <div className="space-y-5 p-4 md:p-5">
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 dash-text-muted md:py-24">
          <Loader2 className="animate-spin" size={32} />
          <span className="text-sm">{t("thermalDetail.loading")}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {imgSrc ? (
              <div className="relative isolate w-full self-start overflow-hidden rounded-xl border border-[var(--dash-panel-border)] md:col-span-2" style={{ backgroundColor: "var(--dash-media-bg)" }}>
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Thermal"
                  className={`relative z-0 block h-auto w-full ${roiActive && enableRoi ? "cursor-crosshair" : ""}`}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                    }
                  }}
                  onPointerDown={
                    enableRoi && onImageMouseDown
                      ? (e) => {
                          roiDragRef.current = true;
                          onImageMouseDown(e as unknown as React.MouseEvent<HTMLImageElement>);
                        }
                      : undefined
                  }
                  draggable={false}
                />
                {enableRoi && roiActive && roiStart && roiEnd && (
                  <div
                    className="pointer-events-none absolute z-20 border-2 border-emerald-400 bg-emerald-400/10"
                    style={{
                      left: `${(Math.min(roiStart.x, roiEnd.x) / roiMapW) * 100}%`,
                      top: `${(Math.min(roiStart.y, roiEnd.y) / roiMapH) * 100}%`,
                      width: `${(Math.abs(roiEnd.x - roiStart.x) / roiMapW) * 100}%`,
                      height: `${(Math.abs(roiEnd.y - roiStart.y) / roiMapH) * 100}%`,
                    }}
                  />
                )}
                {enableRoi && !roiActive && (
                  <span className="glass absolute right-[4.5rem] top-2 z-20 rounded-md border border-neutral-600/50 px-2 py-1 text-[10px] font-semibold dash-text-primary backdrop-blur-md" style={{ backgroundColor: "var(--dash-nested-bg-soft)" }}>
                    {t("thermalDetail.fullRoi")}
                  </span>
                )}
                {enableRoi && onToggleRoi && (
                  <button
                    type="button"
                    onClick={onToggleRoi}
                    className={`absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      roiActive
                        ? "border border-emerald-400 bg-emerald-500/80 text-white"
                        : "glass border border-neutral-600/50 bg-[var(--dash-nested-bg-soft)] dash-text-primary backdrop-blur-md hover:bg-white/15"
                    }`}
                  >
                    <Crosshair size={11} />
                    {t("thermalDetail.roi")}
                  </button>
                )}
                {enableRoi && roiActive && (
                  <div className="glass absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-300 backdrop-blur-md">
                    <Crosshair size={10} /> {t("thermalDetail.dragToSelect")}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[200px] w-full items-center justify-center self-start rounded-xl border border-[var(--dash-panel-border)] text-sm dash-text-subtle md:col-span-2" style={{ backgroundColor: "var(--dash-nested-bg)" }}>
                {t("thermalDetail.noPreview")}
              </div>
            )}
            {(analysisConfiguration != null || effectiveStats || roiLoading || roiStats) && (
              <div className="flex flex-col gap-4">
                {analysisConfiguration != null && (
                  <div className="rounded-xl border p-4">
                    <ThermalAnalysisConfigurationInteractive
                      objectType={cfgObjectType}
                      onObjectTypeChange={setCfgObjectType}
                      palette={cfgPalette}
                      onPaletteChange={setCfgPalette}
                      unit={cfgUnit}
                      onUnitChange={setCfgUnit}
                      processing={Boolean(loading)}
                      hideProcessingPipelineSection
                    />
                  </div>
                )}
                {(effectiveStats || roiLoading || roiStats) && (
                  <div className="rounded-xl border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <BarChart3 className="text-emerald-400" size={16} />
                      <h4 className="text-sm font-semibold dash-text-primary">{t("thermalDetail.temperatureStats")}</h4>
                    </div>
                    <div className="space-y-2.5">
                      <StatRow label={t("thermalDetail.minimum")} value={`${effectiveStats.min_c.toFixed(2)} ${u}`} color="text-blue-400" />
                      <StatRow label={t("thermalDetail.maximum")} value={`${effectiveStats.max_c.toFixed(2)} ${u}`} color="text-red-400" />
                      <StatRow label={t("thermalDetail.mean")} value={`${effectiveStats.mean_c.toFixed(2)} ${u}`} color="text-emerald-400" />
                      <StatRow label={t("thermalDetail.median")} value={`${effectiveStats.median_c.toFixed(2)} ${u}`} color="text-yellow-400" />
                      <StatRow label={t("thermalDetail.stdDev")} value={`${effectiveStats.std_c.toFixed(2)} ${u}`} color="text-purple-400" />
                      <div className="my-2 border-t border-[var(--dash-panel-border)]" />
                      <StatRow
                        label={t("thermalDetail.resolution")}
                        value={`${effectiveStats.width} × ${effectiveStats.height}`}
                        color="dash-text-body"
                      />
                      <StatRow
                        label={t("thermalDetail.tempRange")}
                        value={`${(effectiveStats.max_c - effectiveStats.min_c).toFixed(2)} ${u}`}
                        color="text-emerald-300"
                      />
                    </div>
                    {roiLoading && (
                      <div className="mt-3 flex items-center gap-2 border-t border-[var(--dash-panel-border)] pt-3 text-xs text-emerald-400">
                        <Loader2 size={12} className="animate-spin" /> {t("thermalDetail.computingRoi")}
                      </div>
                    )}
                    {displayRoiChart != null && roiStart && roiEnd && !roiLoading && (
                      <div className="mt-3 border-t border-[var(--dash-panel-border)] pt-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Crosshair className="text-emerald-400" size={12} />
                          <span className="text-xs font-semibold text-emerald-400">{t("thermalDetail.roiStatistics")}</span>
                        </div>
                        <div className="space-y-1.5">
                          <StatRow
                            label={t("thermalDetail.roiMin")}
                            value={`${fmtThermalValue(pickMetric(displayRoiChart, "min_c", "minC"))} ${u}`}
                            color="text-blue-400"
                          />
                          <StatRow
                            label={t("thermalDetail.roiMax")}
                            value={`${fmtThermalValue(pickMetric(displayRoiChart, "max_c", "maxC"))} ${u}`}
                            color="text-red-400"
                          />
                          <StatRow
                            label={t("thermalDetail.roiMean")}
                            value={`${fmtThermalValue(pickMetric(displayRoiChart, "mean_c", "meanC"))} ${u}`}
                            color="text-emerald-400"
                          />
                          <StatRow
                            label={t("thermalDetail.roiStd")}
                            value={`${fmtThermalValue(pickMetric(displayRoiChart, "std_c", "stdC"))} ${u}`}
                            color="text-purple-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {analysis && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Camera className="text-emerald-400" size={16} />
                  <h4 className="text-sm font-semibold dash-text-primary">{t("thermalDetail.cameraLocation")}</h4>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <DetailRow label={t("thermalDetail.camera")} value={meta?.camera_model} />
                  <DetailRow label={t("thermalDetail.serial")} value={meta?.serial_number} />
                  <DetailRow label={t("thermalDetail.focalLength")} value={meta?.focal_length_mm ? `${meta.focal_length_mm} mm` : null} />
                  <DetailRow label={t("thermalDetail.fNumber")} value={meta?.f_number ? `f/${meta.f_number}` : null} />
                  <DetailRow label={t("thermalDetail.timestamp")} value={meta?.timestamp} />
                  <DetailRow label={t("thermalDetail.tilt")} value={meta?.camera_tilt_deg != null ? `${meta.camera_tilt_deg.toFixed(1)}°` : null} />
                  <DetailRow label={t("thermalDetail.latitude")} value={meta?.gps_coordinates?.latitude != null ? meta.gps_coordinates.latitude.toFixed(6) : null} />
                  <DetailRow label={t("thermalDetail.longitude")} value={meta?.gps_coordinates?.longitude != null ? meta.gps_coordinates.longitude.toFixed(6) : null} />
                  <DetailRow label={t("thermalDetail.altitude")} value={meta?.altitude_m != null ? `${meta.altitude_m.toFixed(1)} m` : null} />
                  <DetailRow label={t("thermalDetail.resolution")} value={meta?.image_width && meta?.image_height ? `${meta.image_width}×${meta.image_height}` : null} />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Wind className="text-emerald-400" size={16} />
                  <h4 className="text-sm font-semibold dash-text-primary">{t("thermalDetail.distanceEnvironment")}</h4>
                </div>
                <div className="space-y-3">
                  {analysis.distance_meters?.value != null && (
                    <div>
                      <span className="text-xs dash-text-muted">{t("thermalDetail.distance")}</span>
                      <div className="text-lg font-bold dash-text-primary">{analysis.distance_meters.value.toFixed(1)} m</div>
                      
                    </div>
                  )}
                  <div className="border-t border-[var(--dash-panel-border)]" />
                  <div className="grid grid-cols-2 gap-3">
                    {analysis.environment?.ambient_temperature_c?.value != null && (
                      <div>
                        <div className="mb-0.5">
                          <span className="text-xs dash-text-muted">{t("thermalDetail.ambientTemp")}</span>
                        </div>
                        <span className="text-base font-bold dash-text-primary">{analysis.environment.ambient_temperature_c.value}°C</span>
                      </div>
                    )}
                    {analysis.environment?.humidity_percent?.value != null && (
                      <div>
                        <div className="mb-0.5">
                          <span className="text-xs dash-text-muted">{t("thermalDetail.humidity")}</span>
                        </div>
                        <span className="text-base font-bold dash-text-primary">{analysis.environment.humidity_percent.value}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {analysis.thermal_parameters && (
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Gauge className="text-emerald-400" size={16} />
                    <h4 className="text-sm font-semibold dash-text-primary">{t("thermalDetail.thermalParameters")}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {analysis.thermal_parameters.emissivity && (
                      <div>
                        <div className="mb-0.5">
                          <span className="text-xs dash-text-muted">{t("thermalDetail.emissivity")}</span>
                        </div>
                        <span className="text-lg font-bold dash-text-primary">
                          {analysis.thermal_parameters.emissivity.value != null ? analysis.thermal_parameters.emissivity.value.toFixed(3) : "—"}
                        </span>
                        
                      </div>
                    )}
                    {analysis.thermal_parameters.reflected_temperature_c && (
                      <div>
                        <div className="mb-0.5">
                          <span className="text-xs dash-text-muted">{t("thermalDetail.reflectedTemp")}</span>
                        </div>
                        <span className="text-lg font-bold dash-text-primary">
                          {analysis.thermal_parameters.reflected_temperature_c.value != null
                            ? `${analysis.thermal_parameters.reflected_temperature_c.value.toFixed(1)}°C`
                            : "—"}
                        </span>
                        
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export type ThermalAnalysisDetailModalProps = {
  open: boolean;
  onClose: () => void;
  filename: string;
  thermalImageB64?: string | null;
  thermalImageUrl?: string | null;
  stats?: ThermalStats | null;
  analysis?: ThermalAnalysisData | null;
  unit: string;
  fileIndexDisplay: number;
  fileCountDisplay: number;
  onPrev: () => void;
  onNext: () => void;
  exporting?: boolean;
  onExportCsv?: () => void;
  enableRoi?: boolean;
  roiActive?: boolean;
  onToggleRoi?: () => void;
  roiStart?: { x: number; y: number } | null;
  roiEnd?: { x: number; y: number } | null;
  roiStats?: ThermalStats | null;
  roiLoading?: boolean;
  onImageMouseDown?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onImageMouseUp?: (e: React.MouseEvent<HTMLImageElement>) => void;
  loading?: boolean;
  analysisConfiguration?: ThermalAnalysisConfigurationSnapshot | null;
};

export function ThermalAnalysisDetailModal({
  open,
  onClose,
  filename,
  thermalImageB64,
  thermalImageUrl,
  stats,
  analysis,
  unit,
  fileIndexDisplay,
  fileCountDisplay,
  onPrev,
  onNext,
  exporting,
  onExportCsv,
  enableRoi = true,
  roiActive,
  onToggleRoi,
  roiStart,
  roiEnd,
  roiStats,
  roiLoading,
  onImageMouseDown,
  onImageMouseUp,
  loading,
  analysisConfiguration,
}: ThermalAnalysisDetailModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[var(--dash-overlay-scrim)] px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="glass relative w-full max-w-5xl rounded-2xl border border-[var(--dash-panel-border)] shadow-premium-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <ThermalAnalysisDetailHeader
          filename={filename}
          fileIndexDisplay={fileIndexDisplay}
          fileCountDisplay={fileCountDisplay}
          onPrev={onPrev}
          onNext={onNext}
          exporting={exporting}
          onExportCsv={onExportCsv}
          onClose={onClose}
        />
        <ThermalAnalysisDetailInner
          thermalImageB64={thermalImageB64}
          thermalImageUrl={thermalImageUrl}
          stats={stats}
          analysis={analysis}
          unit={unit}
          analysisConfiguration={analysisConfiguration}
          loading={loading}
          enableRoi={enableRoi}
          roiActive={roiActive}
          onToggleRoi={onToggleRoi}
          roiStart={roiStart}
          roiEnd={roiEnd}
          roiStats={roiStats}
          roiLoading={roiLoading}
          onImageMouseDown={onImageMouseDown}
          onImageMouseUp={onImageMouseUp}
        />
      </motion.div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs dash-text-muted">{label}</span>
      <span className={`text-sm font-Poppins font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-start justify-between py-0.5 gap-1">
      <span className="text-[11px] dash-text-subtle shrink-0">{label}</span>
      <span className="text-[11px] dash-text-primary font-medium text-right truncate">{value ?? <span className="text-neutral-600 italic">{t("thermalDetail.na")}</span>}</span>
    </div>
  );
}
