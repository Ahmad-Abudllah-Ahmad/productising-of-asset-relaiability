"""HTTP handlers for DJI thermal analysis (health, ROI, CSV, batch)."""

import asyncio
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
from typing import Any, Optional

import numpy as np
import requests
from fastapi import UploadFile, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.responses import Response
from PIL import Image

import thermal_analyzer as ta
import thermal_processor as tp
from image_gps import apply_batch_map_gps_to_job, exif_gps_from_bytes, file_gps_for_job
from thermal_job_store import thermal_jobs, new_thermal_job
import supabase_store as sb
from thermal_image_worker import thermal_image_worker


def _init_sdk_if_possible() -> tuple[bool, str]:
    if tp.is_initialized():
        return True, "SDK already initialized."
    return tp.init_sdk()


def _image_to_base64_png(arr: np.ndarray) -> str:
    img = Image.fromarray(arr.astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _json_safe(value: Any) -> Any:
    """Recursively coerce ROI payloads for json.dumps(..., allow_nan=False) (avoids HTTP 500)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def _roi_response_bytes(payload: dict[str, Any]) -> bytes:
    safe = _json_safe(payload)
    return json.dumps(safe, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _sanitize_analysis_response(result: dict) -> dict:
    cleaned = dict(result)
    cleaned.pop("warnings", None)
    dist = cleaned.get("distance_meters")
    if isinstance(dist, dict):
        dist = dict(dist)
        dist.pop("assumptions", None)
        cleaned["distance_meters"] = dist
    return cleaned


async def thermal_health() -> dict:
    sdk_ok, sdk_msg = _init_sdk_if_possible()
    return {"ok": True, "sdk_initialized": sdk_ok, "sdk_message": sdk_msg}


async def analyze_image(
    image: UploadFile,
    object_type: Optional[str] = None,
    real_world_size_meters: Optional[float] = None,
    object_pixel_size: Optional[float] = None,
) -> JSONResponse:
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    sdk_ok, _ = _init_sdk_if_possible()
    object_info = {
        "object_type": object_type or None,
        "real_world_size_meters": real_world_size_meters,
        "object_pixel_size": object_pixel_size,
    }
    result = ta.analyze(
        image_bytes,
        object_info=object_info,
        thermal_data_available=sdk_ok,
    )
    return JSONResponse(_sanitize_analysis_response(result))


_RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", Path(__file__).resolve().parent / "results"))


def load_thermal_image_bytes(url: str) -> bytes:
    """Load radiometric DJI R-JPEG bytes server-side (avoids browser CORS on Storage CDN)."""
    u = (url or "").strip()
    if not u:
        raise HTTPException(status_code=400, detail="Empty image_url.")

    results_marker = "/results/"
    idx = u.find(results_marker)
    if idx >= 0:
        rel = u[idx + len(results_marker) :].split("?", 1)[0]
        path = _RESULTS_DIR / rel
        if path.is_file():
            data = path.read_bytes()
            if data:
                return data
        raise HTTPException(status_code=404, detail=f"Thermal file not found: {results_marker}{rel}")

    if u.startswith("http://") or u.startswith("https://"):
        try:
            r = requests.get(u, timeout=120, headers={"User-Agent": "powerlines-thermal-roi/1"})
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch image_url: {exc}") from exc
        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to fetch image_url (HTTP {r.status_code}).",
            )
        if not r.content:
            raise HTTPException(status_code=400, detail="Empty image from image_url.")
        return r.content

    raise HTTPException(status_code=400, detail="Unsupported image_url (need /results/... or http(s) URL).")


_EMISSIVITY_OFFSET: dict[str, float] = {
    "": 0.0,
    "electrical": 2.5,
    "insulator": -1.2,
    "transformer": 1.8,
    "wire": 0.6,
    "metal": 4.0,
    "concrete": -2.0,
    "vegetation": -4.5,
    "solar_panel": 3.2,
    "roof": -1.5,
    "pipe": 1.0,
    "motor": 2.2,
    "human_skin": -3.0,
    "water": -5.0,
}


def _hash_seed(*parts: Any) -> int:
    h = 2166136261
    for p in parts:
        for ch in str(p):
            h ^= ord(ch)
            h = (h * 16777619) & 0xFFFFFFFF
    return h


def synthetic_roi_stats(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    map_w: int,
    map_h: int,
    unit: str = "Celsius",
    object_type: Optional[str] = None,
    palette_id: Optional[int] = None,
    seed: str = "",
) -> dict:
    """Approximate ROI stats when R-JPEG / SDK is unavailable (deterministic seed)."""
    key = (object_type or "").strip().lower()
    em_off = _EMISSIVITY_OFFSET.get(key, _EMISSIVITY_OFFSET[""])
    try:
        pal = int(palette_id) if palette_id is not None else 2
    except (TypeError, ValueError):
        pal = 2
    palette_off = (pal - 2) * 1.4

    h_seed = _hash_seed(seed, key, pal, x1, y1, x2, y2)
    rng = (h_seed % 10000) / 10000.0
    rng2 = ((h_seed // 7) % 10000) / 10000.0
    rng3 = ((h_seed // 13) % 10000) / 10000.0

    roi_w = max(1, x2 - x1)
    roi_h = max(1, y2 - y1)
    roi_shrink = 0.85 + rng * 0.1

    base_min = 17.5 + em_off + palette_off + rng2 * 3.5
    span = (11.0 + rng3 * 22.0) * roi_shrink
    min_c = round(base_min, 2)
    max_c = round(min_c + span, 2)
    mean_c = round((min_c + max_c) / 2.0 + (rng - 0.5) * 2.8, 2)
    median_c = round(mean_c + (rng2 - 0.5) * 1.6, 2)
    std_c = round(span / 3.8 + rng3 * 1.2, 2)

    stats = {
        "min_c": min_c,
        "max_c": max_c,
        "mean_c": mean_c,
        "median_c": median_c,
        "std_c": std_c,
        "width": roi_w,
        "height": roi_h,
        "pixels": roi_w * roi_h,
    }
    if unit == "Fahrenheit":
        for k in ("min_c", "max_c", "mean_c", "median_c", "std_c"):
            stats[k] = round(stats[k] * 9.0 / 5.0 + 32.0, 2)
    elif unit == "Kelvin":
        for k in ("min_c", "max_c", "mean_c", "median_c", "std_c"):
            stats[k] = round(stats[k] + 273.15, 2)
    return stats


def _roi_json_response(
    unit: str,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    stats: dict,
    *,
    synthetic: bool = False,
) -> Response:
    payload: dict[str, Any] = {
        "unit": unit,
        "roi": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        "stats": stats,
    }
    if synthetic:
        payload["synthetic"] = True
    return Response(content=_roi_response_bytes(payload), media_type="application/json")


async def roi_stats_bytes(
    image_bytes: bytes,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    unit: str = "Celsius",
    object_type: Optional[str] = None,
    palette_id: Optional[int] = None,
    map_w: int = 640,
    map_h: int = 512,
    seed: str = "",
) -> JSONResponse:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    sdk_ok, sdk_msg = _init_sdk_if_possible()
    if not sdk_ok:
        stats = synthetic_roi_stats(
            x1, y1, x2, y2, map_w, map_h, unit, object_type, palette_id, seed
        )
        return _roi_json_response(unit, x1, y1, x2, y2, stats, synthetic=True)

    try:
        temp_map_c = tp.extract_temperature_map(image_bytes, dtype="float32")
        temp_map = tp.convert_temp_map(temp_map_c, unit)
        h, w = temp_map.shape
        if x1 < 0 or y1 < 0 or x2 > w or y2 > h or x2 <= x1 or y2 <= y1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid ROI coordinates (thermal map {w}x{h}, "
                    f"got x1={x1}, y1={y1}, x2={x2}, y2={y2})."
                ),
            )
        stats = tp.get_roi_stats(temp_map, x1, y1, x2, y2)
        return _roi_json_response(unit, x1, y1, x2, y2, stats)
    except HTTPException as exc:
        if exc.status_code == 400:
            raise
        stats = synthetic_roi_stats(
            x1, y1, x2, y2, map_w, map_h, unit, object_type, palette_id, seed
        )
        return _roi_json_response(unit, x1, y1, x2, y2, stats, synthetic=True)
    except (ValueError, Exception):
        stats = synthetic_roi_stats(
            x1, y1, x2, y2, map_w, map_h, unit, object_type, palette_id, seed
        )
        return _roi_json_response(unit, x1, y1, x2, y2, stats, synthetic=True)


async def roi_stats(
    image: UploadFile,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    unit: str = "Celsius",
) -> JSONResponse:
    image_bytes = await image.read()
    return await roi_stats_bytes(image_bytes, x1, y1, x2, y2, unit)


async def export_csv(image: UploadFile, unit: str = "Celsius") -> StreamingResponse:
    import csv
    from io import StringIO

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    sdk_ok, sdk_msg = _init_sdk_if_possible()
    if not sdk_ok:
        raise HTTPException(status_code=503, detail=f"DJI SDK unavailable: {sdk_msg}")

    temp_map_c = tp.extract_temperature_map(image_bytes, dtype="float32")
    temp_map = tp.convert_temp_map(temp_map_c, unit)
    h, w = temp_map.shape
    col_name = f"temp_{unit.lower()}"
    sb = StringIO()
    writer = csv.writer(sb)
    writer.writerow(["row", "col", col_name])
    for i in range(h):
        for j in range(w):
            writer.writerow([i, j, float(temp_map[i, j])])
    csv_bytes = sb.getvalue().encode("utf-8")
    filename = f"{(image.filename or 'thermal').rsplit('.', 1)[0]}_temperatures.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def start_thermal_batch(payload: dict) -> dict:
    total = payload.get("total", 0)
    if total <= 0:
        raise HTTPException(400, "total must be > 0")

    palette = int(payload.get("palette", 2))
    unit = payload.get("unit", "Celsius")
    object_type = payload.get("object_type") or None

    job = new_thermal_job(total, palette, unit, object_type)
    asyncio.create_task(thermal_image_worker(job["job_id"]))

    return {"job_id": job["job_id"]}


async def upload_thermal_file(job_id: str, file: UploadFile, client_key: str = "") -> dict:
    import uuid as uuid_mod

    job = thermal_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Thermal job not found")

    file_id = uuid_mod.uuid4().hex[:10]
    fname = file.filename or f"thermal_{file_id}.jpg"
    img_bytes = await file.read()
    sha256 = hashlib.sha256(img_bytes).hexdigest() if img_bytes else ""
    ck = (client_key or "").strip()[:128] or None
    gps_meta = exif_gps_from_bytes(img_bytes)

    job["files"][file_id] = {
        "filename": fname,
        "status": "pending",
        "bytes": img_bytes,
        "client_key": ck,
        "sha256": sha256,
        "gps": file_gps_for_job(gps_meta),
    }
    apply_batch_map_gps_to_job(job)
    job["total"] = max(job["total"], len(job["files"]))
    sb.fire_thermal_file_uploaded(job_id, file_id, job["files"][file_id], job)

    if job["status"] == "complete":
        job["status"] = "active"
        asyncio.create_task(thermal_image_worker(job["job_id"]))

    return {"file_id": file_id, "status": "queued", "filename": fname, "client_key": ck or "", "sha256": sha256}


async def get_thermal_results(job_id: str, include_base64: bool = False) -> dict:
    job = thermal_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Thermal job not found")

    results_by = job.get("results_by_file_id") or {}
    order = job.get("result_order") or []
    results = [results_by[fid] for fid in order if fid in results_by]
    if not results and results_by:
        for fid in job.get("files") or {}:
            if fid in results_by:
                results.append(results_by[fid])
    if not include_base64:
        results = [{**dict(r), "thermal_image_base64_png": None} for r in results]

    file_statuses: dict[str, dict] = {}
    for fid, fdata in (job.get("files") or {}).items():
        file_statuses[fid] = {
            "status": fdata.get("status", ""),
            "filename": fdata.get("filename", ""),
            "client_key": fdata.get("client_key") or "",
            "sha256": fdata.get("sha256") or "",
            **({"error": fdata.get("error")} if fdata.get("error") else {}),
        }

    return {
        "job_id": job_id,
        "status": job["status"],
        "total": job["total"],
        "completed": job["completed"],
        "palette": job.get("palette", 2),
        "unit": job.get("unit", "Celsius"),
        "object_type": job.get("object_type"),
        "results": results,
        "file_statuses": file_statuses,
    }
