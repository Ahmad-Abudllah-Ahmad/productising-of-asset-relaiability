"""
Persist runs, files, detections, and thermal analysis to Supabase (PostgREST).
No-op when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are unset.
All writes run in background threads so inference is not blocked.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

_log = logging.getLogger("supabase_store")
_env_loaded = False


def _load_env_file() -> None:
    global _env_loaded
    if _env_loaded or os.getenv("SUPABASE_URL"):
        _env_loaded = True
        return
    for candidate in (
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent / ".env",
    ):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
        break
    _env_loaded = True


_RUN_STATUS = {
    "active": "active",
    "processing": "processing",
    "complete": "complete",
    "completed": "completed",
    "cancelled": "cancelled",
    "cancelling": "cancelling",
    "error": "error",
}

_FILE_STATUS = {
    "pending": "pending",
    "queued": "queued",
    "uploading": "uploading",
    "processing": "processing",
    "done": "done",
    "error": "error",
}


def enabled() -> bool:
    _load_env_file()
    return bool(
        os.getenv("SUPABASE_URL")
        and (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY"))
    )


def _api_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY") or ""


def _base() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def _headers(prefer: str = "return=minimal") -> dict[str, str]:
    k = _api_key()
    return {
        "apikey": k,
        "Authorization": f"Bearer {k}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _ts(epoch: Optional[float] = None) -> str:
    if epoch is None:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def _fire(fn, *args, **kwargs) -> None:
    if not enabled():
        return

    def _run() -> None:
        try:
            fn(*args, **kwargs)
        except Exception as exc:
            _log.warning("Supabase persist failed: %s", exc, exc_info=True)

    threading.Thread(target=_run, daemon=True).start()


def _upsert(table: str, row: dict, on_conflict: str) -> None:
    url = f"{_base()}/rest/v1/{table}?on_conflict={on_conflict}"
    r = requests.post(
        url,
        headers=_headers("resolution=merge-duplicates,return=minimal"),
        json=row,
        timeout=60,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"upsert {table}: {r.status_code} {r.text[:500]}")


def _patch(table: str, filters: dict, row: dict) -> None:
    """Update-only request — no row is created when nothing matches.

    Use for incremental field updates (status, completed_files, …) so
    background threads cannot insert partial rows that violate NOT NULL
    constraints when they race ahead of the initial upsert.
    """
    if not row:
        return
    qs = "&".join(f"{k}=eq.{v}" for k, v in filters.items())
    url = f"{_base()}/rest/v1/{table}?{qs}"
    r = requests.patch(url, headers=_headers("return=minimal"), json=row, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"patch {table}: {r.status_code} {r.text[:500]}")


_PAGE_ROWS = 1000  # PostgREST default max rows per request


def _select(table: str, params: dict) -> list[dict]:
    """Plain SELECT via PostgREST. Returns [] on any failure (callers tolerate empty).

    Auto-paginates with Range headers to bypass the project max-rows ceiling
    (typically 1000 per request) so callers can request "all matching" rows.
    """
    if not enabled():
        return []
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{_base()}/rest/v1/{table}?{qs}"
    out: list[dict] = []
    offset = 0
    try:
        while True:
            page_size = _PAGE_ROWS
            headers = _headers("count=none")
            headers["Range-Unit"] = "items"
            headers["Range"] = f"{offset}-{offset + page_size - 1}"
            r = requests.get(url, headers=headers, timeout=60)
            if r.status_code in (200, 206):
                batch = r.json() or []
                if not batch:
                    break
                out.extend(batch)
                if len(batch) < page_size:
                    break
                offset += len(batch)
                if offset > 5_000_000:  # safety net
                    break
                continue
            if r.status_code == 416:  # Requested Range Not Satisfiable → no more rows
                break
            _log.warning("supabase select %s: %s %s", table, r.status_code, r.text[:200])
            break
    except Exception as exc:
        _log.warning("supabase select %s failed: %s", table, exc)
    return out


_DASHBOARD_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}
_DASHBOARD_CACHE_TTL = 4.0

_THERMAL_RESULTS_CACHE: dict[str, tuple[float, dict]] = {}
_THERMAL_RESULTS_TTL = 8.0


def fetch_thermal_batch_results(job_id: str, include_base64: bool = False) -> Optional[dict]:
    """Build the same response shape as `_thermal_http.get_thermal_results` from
    persisted Supabase rows so the deployed thermal viewer can show batches that
    are no longer in memory (post-restart) or that were processed elsewhere.

    Returns None when the run does not exist as a thermal batch in Supabase, so
    the route handler can re-raise its original 404 unchanged.
    """
    if not enabled() or not job_id:
        return None

    now = time.time()
    cached = _THERMAL_RESULTS_CACHE.get(job_id)
    if cached and now - cached[0] < _THERMAL_RESULTS_TTL:
        return cached[1]

    runs = _select(
        "runs",
        {
            "select": (
                "job_id,status,total_files,completed_files,run_type,source,"
                "thermal_palette,thermal_unit,thermal_object_type,thermal_analysis_job"
            ),
            "job_id": f"eq.{job_id}",
            "limit": "1",
        },
    )
    if not runs:
        return None
    run = runs[0]
    is_thermal = (
        bool(run.get("thermal_analysis_job"))
        or run.get("source") == "thermal"
        or run.get("run_type") == "thermal"
    )
    if not is_thermal:
        return None

    files = _select(
        "run_files",
        {
            "select": (
                "file_id,filename,status,client_key,sha256,processing_time_ms,"
                "gps_lat,gps_lng,sort_order,created_at"
            ),
            "run_id": f"eq.{job_id}",
            "order": "sort_order.asc,created_at.asc",
        },
    )
    artifacts = _select(
        "run_file_artifacts",
        {
            "select": "file_id,kind,relative_url",
            "run_id": f"eq.{job_id}",
            "limit": "10000",
        },
    )
    analyses = _select(
        "thermal_file_analysis",
        {
            "select": "file_id,palette,unit,object_type,analysis,stats,processing_time_ms",
            "run_id": f"eq.{job_id}",
            "limit": "10000",
        },
    )

    art_by_file: dict[str, dict[str, str]] = {}
    for a in artifacts:
        art_by_file.setdefault(a["file_id"], {})[a["kind"]] = a["relative_url"]
    analysis_by_file: dict[str, dict] = {a["file_id"]: a for a in analyses}

    results: list[dict] = []
    file_statuses: dict[str, dict] = {}
    for f in files:
        fid = f["file_id"]
        art = art_by_file.get(fid, {})
        ana = analysis_by_file.get(fid, {})
        file_statuses[fid] = {
            "status": f.get("status") or "done",
            "filename": f.get("filename") or "",
            "client_key": f.get("client_key") or "",
            "sha256": f.get("sha256") or "",
        }
        # Prefer the rendered thermal PNG; for runs where the SDK couldn't
        # decode the temperature map (no `thermal_png` artifact) fall back to
        # the original DJI R-JPEG so the sidebar grid still shows a thumbnail.
        png_url = art.get("thermal_png")
        rjpeg_url = art.get("thermal_rjpeg")
        results.append(
            {
                "file_id": fid,
                "filename": f.get("filename") or "",
                "client_key": f.get("client_key") or "",
                "sha256": f.get("sha256") or "",
                "thermal_image_base64_png": None if not include_base64 else None,
                "thermal_image_url": png_url or rjpeg_url,
                "thermal_rjpeg_url": rjpeg_url,
                "original_image_url": rjpeg_url,
                "stats": ana.get("stats") or {},
                "analysis": ana.get("analysis") or {},
                "unit": ana.get("unit") or run.get("thermal_unit") or "Celsius",
                "processing_time_ms": ana.get("processing_time_ms") or f.get("processing_time_ms"),
            }
        )

    palette_raw = run.get("thermal_palette") or 2
    try:
        palette_val: int = int(palette_raw)
    except (TypeError, ValueError):
        palette_val = 2

    out = {
        "job_id": job_id,
        "status": run.get("status") or "complete",
        "total": run.get("total_files") or len(files),
        "completed": run.get("completed_files") or len(files),
        "palette": palette_val,
        "unit": run.get("thermal_unit") or "Celsius",
        "object_type": run.get("thermal_object_type"),
        "results": results,
        "file_statuses": file_statuses,
        "_source": "supabase",
    }
    _THERMAL_RESULTS_CACHE[job_id] = (now, out)
    return out


def fetch_dashboard_runs(force: bool = False) -> list[dict]:
    """Return persisted runs in the `_build_run_entry` shape used by /api/runs.

    Heavy per-detection lists are intentionally omitted; the dashboard only
    needs counts + stats for the list view, and individual file detail is
    served by other endpoints. Cached briefly so the dashboard polling loop
    cannot hammer Supabase even at low TTLs.
    """
    if not enabled():
        return []
    now = time.time()
    if not force and (now - _DASHBOARD_CACHE["ts"] < _DASHBOARD_CACHE_TTL):
        return list(_DASHBOARD_CACHE["data"])

    runs = _select(
        "runs",
        {
            "select": (
                "job_id,run_type,source,status,thermal_analysis_job,total_files,"
                "completed_files,findings_count,total_defects,rgb_findings,"
                "thermal_findings,must_review_count,avg_confidence,max_confidence,"
                "map_lat,map_lng,created_at"
            ),
            "order": "created_at.desc",
            "limit": "1000",
        },
    )
    if not runs:
        _DASHBOARD_CACHE["ts"] = now
        _DASHBOARD_CACHE["data"] = []
        return []

    job_ids = [r["job_id"] for r in runs]
    in_filter = "in.(" + ",".join(f'"{j}"' for j in job_ids) + ")"
    files = _select(
        "run_files",
        {
            "select": (
                "file_id,run_id,filename,source,status,gps_lat,gps_lng,"
                "image_width,image_height,duration_sec,fps,frames_analyzed,"
                "total_detections,avg_confidence,max_confidence"
            ),
            "run_id": in_filter,
            "limit": "100000",
        },
    )
    artifacts = _select(
        "run_file_artifacts",
        {
            "select": "file_id,kind,relative_url",
            "run_id": in_filter,
            "limit": "100000",
        },
    )

    art_by_file: dict[str, dict[str, str]] = {}
    for a in artifacts:
        art_by_file.setdefault(a["file_id"], {})[a["kind"]] = a["relative_url"]

    files_by_run: dict[str, list[dict]] = {}
    for f in files:
        files_by_run.setdefault(f["run_id"], []).append(f)

    image_job_ids = {
        r["job_id"]
        for r in runs
        if (r.get("run_type") or "image") == "image"
    }
    dets_by_file = _fetch_run_detections(job_ids, image_job_ids)

    out: list[dict] = []
    for r in runs:
        out.append(
            _run_row_to_entry(
                r,
                files_by_run.get(r["job_id"], []),
                art_by_file,
                dets_by_file,
            )
        )

    _DASHBOARD_CACHE["ts"] = now
    _DASHBOARD_CACHE["data"] = out
    return list(out)


_DB_STATUS_TO_ENTRY = {
    "active": "processing",
    "complete": "completed",
    "completed": "completed",
    "processing": "processing",
    "cancelled": "cancelled",
    "cancelling": "cancelling",
    "error": "error",
}


def _iso_to_epoch(iso: Optional[str]) -> float:
    if not iso:
        return 0.0
    s = iso.replace("Z", "+00:00") if iso.endswith("Z") else iso
    try:
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


_DETS_CACHE: dict[str, Any] = {"ts": 0.0, "by_file": {}}
_DETS_TTL = 60.0


def _fetch_run_detections(
    job_ids: list[str],
    image_job_ids: Optional[set[str]] = None,
) -> dict[str, list[dict]]:
    """Per-file detection lists for /api/runs.

    RGB image runs need real ``bbox`` arrays so the preview canvas overlay can
    draw boxes. Video runs use the aggregated class-summary RPC (boxes come from
    ``detections_frames.json`` on the client). Result is cached for 60 s.
    """
    if not job_ids:
        return {}
    now = time.time()
    cached = _DETS_CACHE.get("by_file") or {}
    if cached and (now - _DETS_CACHE["ts"] < _DETS_TTL):
        return cached

    image_ids = image_job_ids or set()
    video_ids = [j for j in job_ids if j not in image_ids]

    out: dict[str, list[dict]] = {}
    if video_ids:
        out.update(_fetch_run_detections_summary(video_ids))
    if image_ids:
        out.update(_fetch_image_bbox_detections(list(image_ids)))

    _DETS_CACHE["by_file"] = out
    _DETS_CACHE["ts"] = now
    return out


def _fetch_run_detections_summary(job_ids: list[str]) -> dict[str, list[dict]]:
    """Aggregated per-class counts for video runs (no bbox — overlay uses frames JSON)."""
    if not job_ids:
        return {}
    cached = _DETS_CACHE.get("by_file") or {}
    try:
        url = f"{_base()}/rest/v1/rpc/run_detection_class_summary"
        r = requests.post(
            url,
            headers=_headers("count=none"),
            json={"p_run_ids": list(job_ids)},
            timeout=60,
        )
        if r.status_code >= 400:
            _log.warning("dets summary rpc: %s %s", r.status_code, r.text[:200])
            return {}
        rows = r.json() or []
    except Exception as exc:
        _log.warning("dets summary fetch failed: %s", exc)
        return cached if cached else {}

    out: dict[str, list[dict]] = {}
    for row in rows:
        try:
            cnt = int(row.get("cnt") or 0)
        except (TypeError, ValueError):
            cnt = 0
        if cnt <= 0:
            continue
        bucket = out.setdefault(row["file_id"], [])
        cls_id = row.get("class_id") or 0
        cls_name = row.get("class_name") or ""
        conf = float(row.get("avg_conf") or 0)
        entry = {"class_id": cls_id, "class_name": cls_name, "confidence": conf}
        bucket.extend(entry for _ in range(cnt))
    return out


def _fetch_image_bbox_detections(image_job_ids: list[str]) -> dict[str, list[dict]]:
    """Full detection rows with pixel bboxes for RGB image runs."""
    if not image_job_ids:
        return {}
    in_filter = "in.(" + ",".join(f'"{j}"' for j in image_job_ids) + ")"
    rows = _select(
        "detections",
        {
            "select": (
                "file_id,class_id,class_name,confidence,"
                "bbox_x1,bbox_y1,bbox_x2,bbox_y2"
            ),
            "run_id": in_filter,
            "frame_index": "is.null",
            "order": "file_id.asc,id.asc",
            "limit": "1000000",
        },
    )
    out: dict[str, list[dict]] = {}
    for row in rows:
        fid = row.get("file_id")
        if not fid:
            continue
        out.setdefault(fid, []).append(
            {
                "class_id": int(row.get("class_id") or 0),
                "class_name": str(row.get("class_name") or ""),
                "confidence": float(row.get("confidence") or 0),
                "bbox": [
                    float(row.get("bbox_x1") or 0),
                    float(row.get("bbox_y1") or 0),
                    float(row.get("bbox_x2") or 0),
                    float(row.get("bbox_y2") or 0),
                ],
            }
        )
    return out


def _run_row_to_entry(
    run: dict,
    files: list[dict],
    art_by_file: dict[str, dict[str, str]],
    dets_by_file: Optional[dict[str, list[dict]]] = None,
) -> dict:
    rt = run.get("run_type") or "image"
    if run.get("thermal_analysis_job") or run.get("source") == "thermal":
        display_type = "thermal"
    else:
        display_type = rt

    raw_status = run.get("status") or "active"
    entry_status = _DB_STATUS_TO_ENTRY.get(raw_status, raw_status)
    created_iso = run.get("created_at")
    created_ts = _iso_to_epoch(created_iso)

    files_info: list[dict] = []
    dets_lookup = dets_by_file or {}
    for f in files:
        art = art_by_file.get(f["file_id"], {})
        fsrc = f.get("source") or run.get("source") or "rgb"
        file_dets = dets_lookup.get(f["file_id"], [])
        common: dict[str, Any] = {
            "file_id": f["file_id"],
            "filename": f.get("filename") or "",
            "source": fsrc,
            "status": f.get("status") or "done",
            # Fallback chain: image jobs use `thumb`; thermal jobs use the
            # rendered PNG when the SDK produced one, otherwise the original
            # DJI R-JPEG so the sidebar tile still has a real image to show.
            "thumb_url": (
                art.get("thumb")
                or art.get("thermal_png")
                or art.get("thermal_rjpeg")
            ),
            "image_width": f.get("image_width"),
            "image_height": f.get("image_height"),
            "detections": file_dets,
        }
        if rt == "video":
            # Mirrors `_build_run_entry`: video files expose `video_url` (mp4) and
            # `thumb_url` (poster JPG) but never `annotated_url`. The Dashboard
            # slider checks `annotated_url` before `thumb_url` and would try to
            # render the mp4 as an <img>, leaving the recent-uploads tiles blank.
            common.update(
                {
                    "video_url": art.get("video_annotated"),
                    "original_url": art.get("video_original"),
                    "frames_url": art.get("detections_frames_json"),
                    "total_detections": f.get("total_detections", 0),
                    "duration": f.get("duration_sec", 0) or 0,
                    "fps": f.get("fps", 0) or 0,
                    "frames_analyzed": f.get("frames_analyzed", 0) or 0,
                    "avg_confidence": f.get("avg_confidence") or 0,
                    "max_confidence": f.get("max_confidence") or 0,
                }
            )
        else:
            common.update(
                {
                    "annotated_url": art.get("annotated"),
                    "clean_url": art.get("clean"),
                    "stats": {
                        "total_defects": f.get("total_detections", 0),
                        "avg_confidence": f.get("avg_confidence") or 0,
                        "max_confidence": f.get("max_confidence") or 0,
                    },
                }
            )
            if f.get("gps_lat") is not None and f.get("gps_lng") is not None:
                common["gps"] = {"lat": f["gps_lat"], "lng": f["gps_lng"]}
        files_info.append(common)

    gps: Optional[dict] = None
    if run.get("map_lat") is not None and run.get("map_lng") is not None:
        gps = {"lat": run["map_lat"], "lng": run["map_lng"]}

    avg_conf = float(run.get("avg_confidence") or 0)

    return {
        "id": run["job_id"],
        "run_id": run["job_id"],
        "type": display_type,
        "thermal_analysis_job": bool(run.get("thermal_analysis_job")),
        "status": entry_status,
        "total_files": run.get("total_files") or len(files_info),
        "completed": run.get("completed_files") or 0,
        "findings_count": run.get("findings_count") or 0,
        "total_defects": run.get("total_defects") or 0,
        "rgb_findings": run.get("rgb_findings") or 0,
        "thermal_findings": run.get("thermal_findings") or 0,
        "must_review_count": run.get("must_review_count") or 0,
        "needs_review": run.get("must_review_count") or 0,
        "avg_confidence": round(avg_conf, 4),
        "ai_confidence": round(avg_conf, 4),
        "created_at": created_iso,
        "timestamp": created_iso,
        "_created_ts": created_ts,
        "_source": "supabase",
        "files": files_info,
        "gps": gps,
    }


def _rpc(name: str, body: dict) -> None:
    url = f"{_base()}/rest/v1/rpc/{name}"
    r = requests.post(url, headers=_headers(), json=body, timeout=120)
    if r.status_code >= 400:
        raise RuntimeError(f"rpc {name}: {r.status_code} {r.text[:500]}")


def _gps_fields(gps: Any) -> tuple[Optional[float], Optional[float]]:
    if isinstance(gps, dict):
        lat, lng = gps.get("lat"), gps.get("lng")
        if lat is not None and lng is not None:
            return float(lat), float(lng)
    return None, None


def _map_run_status(status: str) -> str:
    return _RUN_STATUS.get(status, "active")


def _map_file_status(status: str) -> str:
    return _FILE_STATUS.get(status, "pending")


def _det_row(
    d: dict,
    *,
    frame_index: Optional[int] = None,
    source: Optional[str] = None,
) -> dict:
    bbox = d.get("bbox") or [0, 0, 0, 0]
    row: dict[str, Any] = {
        "class_id": int(d.get("class_id", 0)),
        "class_name": str(d.get("class_name") or ""),
        "confidence": float(d.get("confidence", 0)),
        "bbox": [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])],
    }
    if frame_index is not None:
        row["frame_index"] = frame_index
    if source:
        row["source"] = source
    return row


def _bulk_detections(run_id: str, file_id: str, rows: list[dict]) -> None:
    """Replace all detections for a file using trigger-aware RPCs.

    All chunks go through plpgsql RPCs that disable the per-row stats refresh
    trigger; otherwise large per-frame batches blow past Postgres' statement
    timeout because every row triggers a full file-wide aggregation scan.
    """
    if not rows:
        _rpc("refresh_run_file_stats", {"p_file_id": file_id})
        return
    chunk = 1500
    for i in range(0, len(rows), chunk):
        part = rows[i : i + chunk]
        rpc_name = "bulk_replace_file_detections" if i == 0 else "bulk_append_file_detections"
        _rpc(rpc_name, {"p_run_id": run_id, "p_file_id": file_id, "p_rows": part})
    if len(rows) > chunk:
        _rpc("refresh_run_file_stats", {"p_file_id": file_id})


import base64 as _base64

_STORAGE_MIME = {
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".json": "application/json",
}

_STORAGE_TUS_THRESHOLD = 40 * 1024 * 1024  # 40 MB
_STORAGE_TUS_CHUNK = 6 * 1024 * 1024


def _tus_metadata(bucket: str, storage_path: str, mime: str) -> str:
    parts = {
        "bucketName": bucket,
        "objectName": storage_path,
        "contentType": mime,
        "cacheControl": "public, max-age=86400",
    }
    return ",".join(
        f"{k} {_base64.b64encode(v.encode()).decode()}" for k, v in parts.items()
    )


def _upload_to_storage_tus(
    local_path: Path, storage_path: str, bucket: str, mime: str
) -> Optional[str]:
    base = _base()
    key = _api_key()
    size = local_path.stat().st_size
    create_headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": str(size),
        "Upload-Metadata": _tus_metadata(bucket, storage_path, mime),
        "X-Upsert": "true",
    }
    try:
        cr = requests.post(
            f"{base}/storage/v1/upload/resumable",
            headers=create_headers,
            timeout=60,
        )
    except Exception as exc:
        _log.warning("tus create %s failed: %s", storage_path, exc)
        return None
    if cr.status_code not in (200, 201):
        _log.warning("tus create %s: %s %s", storage_path, cr.status_code, cr.text[:200])
        return None
    location = cr.headers.get("Location") or cr.headers.get("location")
    if not location:
        return None
    if location.startswith("/"):
        location = f"{base}{location}"

    offset = 0
    with open(local_path, "rb") as fp:
        while offset < size:
            data = fp.read(_STORAGE_TUS_CHUNK)
            if not data:
                break
            try:
                pr = requests.patch(
                    location,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "apikey": key,
                        "Tus-Resumable": "1.0.0",
                        "Upload-Offset": str(offset),
                        "Content-Type": "application/offset+octet-stream",
                    },
                    data=data,
                    timeout=600,
                )
            except Exception as exc:
                _log.warning("tus patch %s @%s failed: %s", storage_path, offset, exc)
                return None
            if pr.status_code not in (200, 204):
                _log.warning(
                    "tus patch %s @%s: %s %s",
                    storage_path, offset, pr.status_code, pr.text[:200],
                )
                return None
            try:
                offset = int(pr.headers.get("Upload-Offset", offset + len(data)))
            except (TypeError, ValueError):
                offset += len(data)
    return f"{base}/storage/v1/object/public/{bucket}/{storage_path}"


def _storage_bucket() -> str:
    return os.getenv("SUPABASE_STORAGE_BUCKET", "").strip()


def _upload_to_storage(local_path: Path, storage_path: str) -> Optional[str]:
    """Upload a local file to Supabase Storage; return its public URL.

    Uses standard POST for small files and TUS resumable for files larger
    than ~40 MB (videos), bypassing Supabase's request body cap.
    Skips silently when SUPABASE_STORAGE_BUCKET is unset or the file is missing.
    """
    bucket = _storage_bucket()
    if not bucket or not local_path.is_file():
        return None
    mime = _STORAGE_MIME.get(local_path.suffix.lower(), "application/octet-stream")
    size = local_path.stat().st_size

    if size >= _STORAGE_TUS_THRESHOLD:
        return _upload_to_storage_tus(local_path, storage_path, bucket, mime)

    base = _base()
    key = _api_key()
    url = f"{base}/storage/v1/object/{bucket}/{storage_path}"
    try:
        with open(local_path, "rb") as fp:
            r = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "apikey": key,
                    "Content-Type": mime,
                    "x-upsert": "true",
                    "Cache-Control": "public, max-age=86400",
                },
                data=fp,
                timeout=600,
            )
        if r.status_code == 413:
            return _upload_to_storage_tus(local_path, storage_path, bucket, mime)
        if r.status_code >= 400:
            _log.warning("storage upload %s: %s %s", storage_path, r.status_code, r.text[:200])
            return None
    except Exception as exc:
        _log.warning("storage upload %s failed: %s", storage_path, exc)
        return None
    return f"{base}/storage/v1/object/public/{bucket}/{storage_path}"


def _resolve_artifact_local(
    relative_url: str,
    file_id: str,
    image_dir: Optional[Path],
    video_dir: Optional[Path],
) -> Optional[Path]:
    """Map a `/results/...` URL back to its local file on this machine."""
    if not relative_url:
        return None
    rel = relative_url.lstrip("/")
    parts = rel.split("/", 2)
    if len(parts) < 3 or parts[0] != "results":
        return None
    sub_id, fname = parts[1], parts[2]
    if image_dir and sub_id != file_id:
        candidate = image_dir / sub_id / fname
        if candidate.is_file():
            return candidate
    if video_dir:
        candidate = video_dir / sub_id / fname
        if candidate.is_file():
            return candidate
    return None


def _upsert_artifacts(
    run_id: str,
    file_id: str,
    urls: dict[str, str],
    *,
    results_dir: Optional[Path] = None,
) -> None:
    kind_map = {
        "thumb_url": "thumb",
        "annotated_url": "annotated",
        "clean_url": "clean",
        "video_url": "video_annotated",
        "original_url": "video_original",
        "thermal_image_url": "thermal_png",
        "thermal_rjpeg_url": "thermal_rjpeg",
        "frames_url": "detections_frames_json",
    }
    bucket = _storage_bucket()

    image_dir = results_dir if results_dir else None
    for key, kind in kind_map.items():
        relative = urls.get(key)
        if not relative:
            continue
        public_url = relative
        if bucket and results_dir is not None:
            local = _resolve_artifact_local(relative, file_id, image_dir, results_dir)
            if local is None:
                local = _results_path_from_url(relative, results_dir)
            if local and local.is_file():
                rel_clean = relative.lstrip("/")
                uploaded = _upload_to_storage(local, rel_clean)
                if uploaded:
                    public_url = uploaded
        _upsert(
            "run_file_artifacts",
            {
                "run_id": run_id,
                "file_id": file_id,
                "kind": kind,
                "relative_url": public_url,
            },
            "file_id,kind",
        )


def _results_path_from_url(relative_url: str, results_dir: Path) -> Optional[Path]:
    """`/results/<sub>/<fname>` → results_dir/<sub>/<fname>."""
    rel = relative_url.lstrip("/")
    parts = rel.split("/", 2)
    if len(parts) < 3 or parts[0] != "results":
        return None
    return results_dir / parts[1] / parts[2]


# ---------------------------------------------------------------------------
# Image (RGB / thermal filename) batch jobs
# ---------------------------------------------------------------------------


def persist_image_job_created(job: dict, model_id: Optional[str] = None) -> None:
    gps = job.get("map_gps")
    lat, lng = _gps_fields(gps)
    source = job.get("source", "rgb")
    _upsert(
        "runs",
        {
            "job_id": job["job_id"],
            "run_type": "image",
            "source": source if source in ("rgb", "thermal") else "rgb",
            "status": _map_run_status(job.get("status", "active")),
            "model_id": model_id or "dota_1000ep_best",
            "total_files": job.get("total", 0),
            "completed_files": job.get("completed", 0),
            "confidence": job.get("confidence", 0.25),
            "slice_size": job.get("slice_size", 1280),
            "overlap": job.get("overlap", 0.25),
            "full_imgsz": job.get("full_imgsz", 1280),
            "nms_iou": job.get("nms_iou", 0.5),
            "sahi_tiled": job.get("sahi_tiled", True),
            "thermal_analysis_job": False,
            "map_lat": lat,
            "map_lng": lng,
            "created_at": _ts(job.get("created_at")),
            "updated_at": _ts(),
        },
        "job_id",
    )


def persist_image_file_uploaded(
    job_id: str, file_id: str, fdata: dict, job: dict
) -> None:
    lat, lng = _gps_fields(fdata.get("gps"))
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": _map_file_status(fdata.get("status", "pending")),
            "source": job.get("source", "rgb"),
            "client_key": fdata.get("client_key"),
            "gps_lat": lat,
            "gps_lng": lng,
            "updated_at": _ts(),
        },
        "file_id",
    )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "total_files": max(job.get("total", 0), len(job.get("files", {}))),
            "updated_at": _ts(),
        },
    )


def persist_image_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    job: dict,
    results_dir: Any = None,
) -> None:
    from pathlib import Path as _P

    base = _P(results_dir) if results_dir is not None else None
    stats = result.get("stats") or {}
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": result.get("filename") or fdata.get("filename", ""),
            "status": "done",
            "image_width": result.get("image_width"),
            "image_height": result.get("image_height"),
            "processing_time_ms": stats.get("processing_time_ms"),
            "updated_at": _ts(),
        },
        "file_id",
    )
    _upsert_artifacts(
        job_id,
        file_id,
        {
            "thumb_url": result.get("thumb_url"),
            "annotated_url": result.get("annotated_url"),
            "clean_url": result.get("clean_url"),
        },
        results_dir=base,
    )
    det_source = "sahi" if job.get("sahi_tiled", True) else "full"
    rows = [_det_row(d, source=det_source) for d in (result.get("detections") or [])]
    _bulk_detections(job_id, file_id, rows)
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "completed_files": job.get("completed", 0),
            "status": _map_run_status(job.get("status", "active")),
            "updated_at": _ts(),
        },
    )


def persist_image_file_error(
    job_id: str, file_id: str, fdata: dict, job: dict, error: str
) -> None:
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": "error",
            "error_message": error[:2000],
            "updated_at": _ts(),
        },
        "file_id",
    )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "completed_files": job.get("completed", 0),
            "updated_at": _ts(),
        },
    )


def persist_image_job_status(job: dict) -> None:
    gps = job.get("map_gps")
    lat, lng = _gps_fields(gps)
    st = _map_run_status(job.get("status", "active"))
    row: dict[str, Any] = {
        "status": st,
        "completed_files": job.get("completed", 0),
        "total_files": max(job.get("total", 0), len(job.get("files", {}))),
        "map_lat": lat,
        "map_lng": lng,
        "updated_at": _ts(),
    }
    if st in ("complete", "completed", "cancelled"):
        row["completed_at"] = _ts()
    _patch("runs", {"job_id": job["job_id"]}, row)


# ---------------------------------------------------------------------------
# Video batch jobs
# ---------------------------------------------------------------------------


def persist_video_job_created(vjob: dict, model_id: Optional[str] = None) -> None:
    lat, lng = _gps_fields(vjob.get("map_gps"))
    _upsert(
        "runs",
        {
            "job_id": vjob["job_id"],
            "run_type": "video",
            "source": "rgb",
            "status": _map_run_status(vjob.get("status", "active")),
            "model_id": model_id or "dota_1000ep_best",
            "total_files": vjob.get("total", 0),
            "completed_files": vjob.get("completed", 0),
            "confidence": vjob.get("confidence", 0.25),
            "slice_size": vjob.get("slice_size", 1280),
            "overlap": vjob.get("overlap", 0.25),
            "full_imgsz": vjob.get("full_imgsz", 1280),
            "frame_interval": vjob.get("frame_interval"),
            "thermal_analysis_job": False,
            "map_lat": lat,
            "map_lng": lng,
            "created_at": _ts(vjob.get("created_at")),
            "updated_at": _ts(),
        },
        "job_id",
    )


def persist_video_file_uploaded(job_id: str, file_id: str, fdata: dict, vjob: dict) -> None:
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": _map_file_status(fdata.get("status", "pending")),
            "source": "rgb",
            "updated_at": _ts(),
        },
        "file_id",
    )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "total_files": max(vjob.get("total", 0), len(vjob.get("files", {}))),
            "updated_at": _ts(),
        },
    )


def persist_video_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    vjob: dict,
    results_dir: Any = None,
) -> None:
    from pathlib import Path

    base = Path(results_dir) if results_dir is not None else Path("results")

    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": "done",
            "duration_sec": result.get("duration"),
            "fps": result.get("fps"),
            "total_frames": result.get("total_frames"),
            "frames_analyzed": result.get("frames_analyzed"),
            "image_width": result.get("video_width"),
            "image_height": result.get("video_height"),
            "updated_at": _ts(),
        },
        "file_id",
    )
    _upsert_artifacts(
        job_id,
        file_id,
        {
            "thumb_url": result.get("thumb_url"),
            "video_url": result.get("video_url"),
            "original_url": result.get("original_url"),
            "frames_url": result.get("frames_url"),
        },
        results_dir=base,
    )

    rows: list[dict] = []
    frames_path = base / file_id / "detections_frames.json"
    if frames_path.is_file():
        try:
            with open(frames_path, encoding="utf-8") as fp:
                frames = json.load(fp)
            for fi, frame_dets in enumerate(frames):
                for d in frame_dets or []:
                    rows.append(_det_row(d, frame_index=fi, source="video_frame"))
        except Exception as exc:
            _log.warning("read detections_frames.json: %s", exc)
    if not rows:
        for d in result.get("detections") or []:
            rows.append(_det_row(d, source="video_frame"))

    _bulk_detections(job_id, file_id, rows)
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "completed_files": vjob.get("completed", 0),
            "status": _map_run_status(vjob.get("status", "active")),
            "updated_at": _ts(),
        },
    )


def persist_video_file_error(
    job_id: str, file_id: str, fdata: dict, vjob: dict, error: str
) -> None:
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": "error",
            "error_message": error[:2000],
            "updated_at": _ts(),
        },
        "file_id",
    )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "completed_files": vjob.get("completed", 0),
            "updated_at": _ts(),
        },
    )


def persist_video_job_status(vjob: dict) -> None:
    lat, lng = _gps_fields(vjob.get("map_gps"))
    st = _map_run_status(vjob.get("status", "active"))
    row: dict[str, Any] = {
        "status": st,
        "completed_files": vjob.get("completed", 0),
        "total_files": max(vjob.get("total", 0), len(vjob.get("files", {}))),
        "map_lat": lat,
        "map_lng": lng,
        "updated_at": _ts(),
    }
    if st in ("complete", "completed", "cancelled"):
        row["completed_at"] = _ts()
    _patch("runs", {"job_id": vjob["job_id"]}, row)


# ---------------------------------------------------------------------------
# Thermal batch jobs
# ---------------------------------------------------------------------------


def persist_thermal_job_created(job: dict) -> None:
    lat, lng = _gps_fields(job.get("map_gps"))
    _upsert(
        "runs",
        {
            "job_id": job["job_id"],
            "run_type": "thermal",
            "source": "thermal",
            "status": _map_run_status(job.get("status", "active")),
            "total_files": job.get("total", 0),
            "completed_files": job.get("completed", 0),
            "thermal_palette": str(job.get("palette", "")),
            "thermal_unit": job.get("unit", "Celsius"),
            "thermal_object_type": job.get("object_type"),
            "thermal_analysis_job": True,
            "map_lat": lat,
            "map_lng": lng,
            "created_at": _ts(job.get("created_at")),
            "updated_at": _ts(),
        },
        "job_id",
    )


def persist_thermal_file_uploaded(job_id: str, file_id: str, fdata: dict, job: dict) -> None:
    lat, lng = _gps_fields(fdata.get("gps"))
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": fdata.get("filename", ""),
            "status": _map_file_status(fdata.get("status", "pending")),
            "source": "thermal",
            "client_key": fdata.get("client_key"),
            "sha256": fdata.get("sha256"),
            "gps_lat": lat,
            "gps_lng": lng,
            "updated_at": _ts(),
        },
        "file_id",
    )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "total_files": max(job.get("total", 0), len(job.get("files", {}))),
            "updated_at": _ts(),
        },
    )


def persist_thermal_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    job: dict,
    results_dir: Any = None,
) -> None:
    _upsert(
        "run_files",
        {
            "file_id": file_id,
            "run_id": job_id,
            "filename": result.get("filename") or fdata.get("filename", ""),
            "status": "done" if "error" not in result else "error",
            "error_message": result.get("error"),
            "processing_time_ms": result.get("processing_time_ms"),
            "updated_at": _ts(),
        },
        "file_id",
    )
    from pathlib import Path as _P

    base = _P(results_dir) if results_dir is not None else None
    _upsert_artifacts(
        job_id,
        file_id,
        {
            "thermal_image_url": result.get("thermal_image_url"),
            "thermal_rjpeg_url": result.get("thermal_rjpeg_url"),
        },
        results_dir=base,
    )
    analysis = result.get("analysis")
    if analysis is not None and "error" not in result:
        _upsert(
            "thermal_file_analysis",
            {
                "file_id": file_id,
                "run_id": job_id,
                "palette": str(job.get("palette", "")),
                "unit": result.get("unit") or job.get("unit"),
                "object_type": job.get("object_type"),
                "analysis": analysis,
                "stats": result.get("stats") or {},
                "processing_time_ms": result.get("processing_time_ms"),
            },
            "file_id",
        )
    _patch(
        "runs",
        {"job_id": job_id},
        {
            "completed_files": job.get("completed", 0),
            "updated_at": _ts(),
        },
    )


def persist_thermal_job_status(job: dict) -> None:
    lat, lng = _gps_fields(job.get("map_gps"))
    st = _map_run_status(job.get("status", "active"))
    row: dict[str, Any] = {
        "status": st,
        "completed_files": job.get("completed", 0),
        "total_files": max(job.get("total", 0), len(job.get("files", {}))),
        "map_lat": lat,
        "map_lng": lng,
        "updated_at": _ts(),
    }
    if st in ("complete", "completed"):
        row["completed_at"] = _ts()
    _patch("runs", {"job_id": job["job_id"]}, row)


# ---------------------------------------------------------------------------
# Public fire-and-forget API
# ---------------------------------------------------------------------------


def fire_image_job_created(job: dict, model_id: Optional[str] = None) -> None:
    _fire(persist_image_job_created, job, model_id)


def fire_image_file_uploaded(job_id: str, file_id: str, fdata: dict, job: dict) -> None:
    _fire(persist_image_file_uploaded, job_id, file_id, fdata, job)


def fire_image_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    job: dict,
    results_dir: Any = None,
) -> None:
    _fire(persist_image_file_result, job_id, file_id, result, fdata, job, results_dir)


def fire_image_file_error(
    job_id: str, file_id: str, fdata: dict, job: dict, error: str
) -> None:
    _fire(persist_image_file_error, job_id, file_id, fdata, job, error)


def fire_image_job_status(job: dict) -> None:
    _fire(persist_image_job_status, job)


def fire_video_job_created(vjob: dict, model_id: Optional[str] = None) -> None:
    _fire(persist_video_job_created, vjob, model_id)


def fire_video_file_uploaded(job_id: str, file_id: str, fdata: dict, vjob: dict) -> None:
    _fire(persist_video_file_uploaded, job_id, file_id, fdata, vjob)


def fire_video_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    vjob: dict,
    results_dir: Any = None,
) -> None:
    _fire(persist_video_file_result, job_id, file_id, result, fdata, vjob, results_dir)


def fire_video_file_error(
    job_id: str, file_id: str, fdata: dict, vjob: dict, error: str
) -> None:
    _fire(persist_video_file_error, job_id, file_id, fdata, vjob, error)


def fire_video_job_status(vjob: dict) -> None:
    _fire(persist_video_job_status, vjob)


def fire_thermal_job_created(job: dict) -> None:
    _fire(persist_thermal_job_created, job)


def fire_thermal_file_uploaded(job_id: str, file_id: str, fdata: dict, job: dict) -> None:
    _fire(persist_thermal_file_uploaded, job_id, file_id, fdata, job)


def fire_thermal_file_result(
    job_id: str,
    file_id: str,
    result: dict,
    fdata: dict,
    job: dict,
    results_dir: Any = None,
) -> None:
    _fire(persist_thermal_file_result, job_id, file_id, result, fdata, job, results_dir)


def fire_thermal_job_status(job: dict) -> None:
    _fire(persist_thermal_job_status, job)
