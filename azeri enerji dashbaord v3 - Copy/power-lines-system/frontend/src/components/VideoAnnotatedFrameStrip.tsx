import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  SIDEBAR_COMPONENT_CLASS_KEYS,
  SIDEBAR_HIDDEN_CLASS_KEYS,
  normalizeDetectionClassKey,
} from "../utils/detectionSidebarBuckets";

const PREVIEW_FRAME_GRID_MAX = 48;

const COMPONENT_CLASS_SET = new Set<string>(SIDEBAR_COMPONENT_CLASS_KEYS);
const NO_HIDDEN_CLASSES: ReadonlySet<string> = new Set();

type FrameDetection = { class_name?: string };

function frameHasVisibleSidebarDefect(
  dets: FrameDetection[],
  hiddenClassKeys: ReadonlySet<string>
): boolean {
  for (const d of dets) {
    const key = normalizeDetectionClassKey(d.class_name);
    if (!key) continue;
    if (SIDEBAR_HIDDEN_CLASS_KEYS.has(key)) continue;
    if (COMPONENT_CLASS_SET.has(key)) continue;
    if (hiddenClassKeys.has(key)) continue;
    return true;
  }
  return false;
}

function formatTimeSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export type VideoAnnotatedFrameStripProps = {
  videoUrl: string;
  duration: number;
  fps: number;
  framesAnalyzed: number;
  mainVideoRef: React.RefObject<HTMLVideoElement | null>;
  /** Per-frame detections JSON (same as video overlay); when missing, defect outlines are off. */
  framesUrl?: string;
  /** Sidebar class filter: hidden defect classes are ignored for red frame outline. */
  hiddenClassKeys?: ReadonlySet<string>;
};

/**
 * Scrollable grid of annotated frame thumbnails (from the same MP4), between the main player and a stats panel.
 * Clicking a cell pauses the main video and seeks to that timestamp.
 */
export function VideoAnnotatedFrameStrip({
  videoUrl,
  duration,
  fps,
  framesAnalyzed,
  mainVideoRef,
  framesUrl,
  hiddenClassKeys = NO_HIDDEN_CLASSES,
}: VideoAnnotatedFrameStripProps) {
  const { t } = useLanguage();
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  thumbsRef.current = thumbs;
  const [perFrameDets, setPerFrameDets] = useState<FrameDetection[][] | null>(null);

  useEffect(() => {
    if (!framesUrl) {
      setPerFrameDets(null);
      return;
    }
    let cancelled = false;
    fetch(framesUrl, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setPerFrameDets(Array.isArray(data) ? (data as FrameDetection[][]) : []);
      })
      .catch(() => {
        if (!cancelled) setPerFrameDets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [framesUrl]);

  const slots = useMemo(() => {
    if (!videoUrl) return [];
    const dur = duration || 0;
    const fp = Math.max(0.001, fps || 30);
    const estimated = Math.max(1, Math.round(dur * fp));
    const fa = Math.max(1, framesAnalyzed || estimated);
    const n = Math.min(PREVIEW_FRAME_GRID_MAX, fa);
    return Array.from({ length: n }, (_, k) => {
      const fi = n <= 1 ? 0 : Math.round((k / (n - 1)) * (fa - 1));
      let t = fi / fp;
      if (dur > 0) t = Math.min(Math.max(0, t), Math.max(0, dur - 0.05));
      return { k, fi, t };
    });
  }, [videoUrl, duration, fps, framesAnalyzed]);

  /**
   * Pre-rendered thumbnail strip URL pattern, derived from videoUrl.
   * Server side `backfill_thumb_strip.py` writes JPGs at:
   *   <results-base>/<file_id>/thumbs/<kk>.jpg  (kk = "00".."47")
   * If those exist (e.g. on Supabase Storage CDN for backfilled / persisted
   * runs), they render instantly and avoid 48 cross-origin video seeks of a
   * 4K H.264 stream that frequently time out and leave blank skeletons.
   */
  const thumbBaseUrl = useMemo(() => {
    if (!videoUrl) return null;
    const m = videoUrl.match(/^(.*\/results\/[^/]+)\/annotated\.mp4(?:\?.*)?$/);
    if (!m) return null;
    return `${m[1]}/thumbs`;
  }, [videoUrl]);
  const [missingPrefetched, setMissingPrefetched] = useState<Set<string>>(() => new Set());

  const defectSlotKeys = useMemo(() => {
    const out = new Set<string>();
    if (!perFrameDets || perFrameDets.length === 0) return out;
    for (const slot of slots) {
      const row = perFrameDets[slot.fi];
      if (row && frameHasVisibleSidebarDefect(row, hiddenClassKeys)) {
        out.add(String(slot.k));
      }
    }
    return out;
  }, [slots, perFrameDets, hiddenClassKeys]);

  useEffect(() => {
    setMissingPrefetched(new Set());
  }, [videoUrl]);

  useEffect(() => {
    if (!videoUrl || slots.length === 0) {
      setThumbs({});
      return;
    }
    const cap = captureVideoRef.current;
    if (!cap) return;

    let cancelled = false;
    setThumbs({});

    const waitMeta = () =>
      new Promise<void>((resolve) => {
        if (cap.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
          return;
        }
        const done = () => {
          cap.removeEventListener("loadedmetadata", done);
          resolve();
        };
        cap.addEventListener("loadedmetadata", done);
      });

    /** Skip canvas capture for slots whose pre-rendered JPG already loaded. */
    const hasPrerendered = (key: string): boolean => {
      const v = thumbsRef.current[key];
      return Boolean(v);
    };

    const captureAt = (t: number, key: string) =>
      new Promise<void>((resolve) => {
        if (cancelled) {
          resolve();
          return;
        }
        const applyFrame = () => {
          if (cancelled) return;
          try {
            const vw = cap.videoWidth;
            const vh = cap.videoHeight;
            if (vw < 2 || vh < 2) return;
            const canvas = document.createElement("canvas");
            const tw = 128;
            const th = Math.max(1, Math.round((vh / vw) * tw));
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(cap, 0, 0, tw, th);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.58);
            setThumbs((prev) => ({ ...prev, [key]: dataUrl }));
          } catch {
            /* canvas taint / decode */
          }
        };

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        if (Math.abs(cap.currentTime - t) < 0.04 && cap.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          applyFrame();
          finish();
          return;
        }

        const onSeeked = () => {
          cap.removeEventListener("seeked", onSeeked);
          applyFrame();
          finish();
        };
        cap.addEventListener("seeked", onSeeked);
        cap.currentTime = t;
        // 5s gives a cross-origin 4K H.264 stream enough time to seek and
        // decode a keyframe over CDN; the previous 900ms left most thumbs
        // blank for backfilled videos hosted on Supabase Storage.
        window.setTimeout(() => {
          cap.removeEventListener("seeked", onSeeked);
          finish();
        }, 5000);
      });

    void (async () => {
      await waitMeta();
      if (cancelled) return;
      // Give the parallel pre-rendered JPG fetch a brief head start so we
      // don't waste cross-origin video seeks on slots that already loaded.
      await new Promise((r) => window.setTimeout(r, 600));
      if (cancelled) return;
      for (const slot of slots) {
        if (cancelled) break;
        const key = String(slot.k);
        if (hasPrerendered(key)) continue;
        await captureAt(slot.t, key);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoUrl, slots, thumbBaseUrl, missingPrefetched]);

  /** Try server-pre-rendered JPGs first; cheap, fully-decoded already. */
  useEffect(() => {
    if (!thumbBaseUrl || slots.length === 0) return;
    let cancelled = false;
    const pending: string[] = [];
    for (const slot of slots) {
      const key = String(slot.k);
      if (missingPrefetched.has(key)) continue;
      const url = `${thumbBaseUrl}/${String(slot.k).padStart(2, "0")}.jpg`;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (cancelled) return;
        setThumbs((prev) => (prev[key] ? prev : { ...prev, [key]: url }));
      };
      img.onerror = () => {
        if (cancelled) return;
        setMissingPrefetched((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      };
      img.src = url;
      pending.push(url);
    }
    return () => {
      cancelled = true;
    };
  }, [thumbBaseUrl, slots, missingPrefetched]);

  if (!videoUrl || slots.length === 0) return null;

  return (
    <>
      <video
        ref={captureVideoRef}
        src={videoUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      />
      <div
        className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-l"
        style={{ borderColor: "var(--dash-panel-border)", backgroundColor: "var(--dash-thumb-strip-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b px-2 py-2 text-[11px] font-medium" style={{ borderColor: "var(--dash-panel-border)", color: "var(--dash-muted)" }}>
          {t("videoAnnotated.frames")}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          <div className="grid grid-cols-2 gap-2">
            {slots.map((slot) => {
              const defectOutline = defectSlotKeys.has(String(slot.k));
              return (
              <button
                key={slot.k}
                type="button"
                className={`group overflow-hidden rounded-lg border text-left transition-colors hover:border-cyan-500/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
                  defectOutline ? "outline outline-2 outline-red-500 outline-offset-0" : ""
                }`}
                style={{ borderColor: "var(--dash-panel-border)", backgroundColor: "var(--dash-nested-bg)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  const v = mainVideoRef.current;
                  if (!v) return;
                  v.pause();
                  v.currentTime = slot.t;
                }}
              >
                <div className="aspect-video" style={{ backgroundColor: "var(--dash-inset-bg)" }}>
                  {thumbs[String(slot.k)] ? (
                    <img
                      src={thumbs[String(slot.k)]}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse" style={{ backgroundColor: "var(--dash-skeleton)" }} />
                  )}
                </div>
                <div className="px-1 py-1 text-center font-Poppins text-[10px] dash-text-body group-hover:dash-text-primary">
                  {formatTimeSec(slot.t)}
                </div>
              </button>
            );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
