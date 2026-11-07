"""
One-off backfill: push a locally-processed video run to Supabase so it appears
on the deployed dashboard alongside cloud-processed runs.

Usage (from repo root):
    python backend/scripts/backfill_supabase_run.py --run-id 021111123456 --count 18

Reads existing artifacts under backend/results/<file_id>/ (annotated.mp4,
original.mp4, thumb.jpg, detections.json, detections_frames.json) and writes
runs / run_files / run_file_artifacts / detections rows via the same
backend.supabase_store module that the live server uses, so production stays
the only source of truth and the backfilled rows match its schema exactly.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import supabase_store as sb  # type: ignore  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "results"
DEFAULT_FPS = 30.0


def _candidate_file_ids(results_dir: Path) -> list[str]:
    candidates: list[tuple[float, str]] = []
    for d in results_dir.iterdir():
        if not d.is_dir():
            continue
        det = d / "detections.json"
        frames = d / "detections_frames.json"
        annotated = d / "annotated.mp4"
        original = d / "original.mp4"
        thumb = d / "thumb.jpg"
        if not (det.is_file() and frames.is_file() and annotated.is_file()
                and original.is_file() and thumb.is_file()):
            continue
        candidates.append((annotated.stat().st_mtime, d.name))
    candidates.sort(reverse=True)
    return [name for _, name in candidates]


def _pick_file_ids(file_ids_arg: list[str], count: int) -> list[str]:
    if file_ids_arg:
        return file_ids_arg[:count] if count else file_ids_arg
    found = _candidate_file_ids(RESULTS_DIR)
    if not found:
        raise SystemExit(f"No fully-processed result folders found under {RESULTS_DIR}")
    return found[:count]


def _build_video_result(file_id: str) -> tuple[dict, dict]:
    folder = RESULTS_DIR / file_id
    with open(folder / "detections_frames.json", encoding="utf-8") as fp:
        frames = json.load(fp)
    with open(folder / "detections.json", encoding="utf-8") as fp:
        flat = json.load(fp)

    total_frames = len(frames) if isinstance(frames, list) else 0
    total_dets = sum(len(fr) for fr in (frames or []))
    confs: list[float] = []
    for fr in frames or []:
        for d in fr or []:
            try:
                confs.append(float(d.get("confidence", 0)))
            except (TypeError, ValueError):
                continue
    avg_conf = (sum(confs) / len(confs)) if confs else 0.0
    max_conf = max(confs) if confs else 0.0

    fps = DEFAULT_FPS
    duration = round(total_frames / fps, 2) if fps else 0.0

    result = {
        "total_frames": total_frames,
        "frames_analyzed": total_frames,
        "duration": duration,
        "fps": fps,
        "video_width": 0,
        "video_height": 0,
        "total_detections": total_dets,
        "avg_confidence": round(avg_conf, 4),
        "max_confidence": round(max_conf, 4),
        "thumb_url": f"/results/{file_id}/thumb.jpg",
        "video_url": f"/results/{file_id}/annotated.mp4",
        "original_url": f"/results/{file_id}/original.mp4",
        "frames_url": f"/results/{file_id}/detections_frames.json",
        "detections": flat or [],
    }

    fdata = {
        "filename": f"video_{file_id}.mp4",
        "status": "done",
    }
    return result, fdata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True, help="Supabase runs.job_id to create or upsert.")
    parser.add_argument("--count", type=int, default=18, help="Max file_ids to backfill (default 18).")
    parser.add_argument("--file-id", action="append", default=[],
                        help="Explicit file_id under backend/results/. Repeat to provide several.")
    parser.add_argument("--total", type=int, help="Override total_files for the run row.")
    parser.add_argument("--lat", type=float, default=40.4093, help="Map latitude (Azerbaijan default).")
    parser.add_argument("--lng", type=float, default=49.8671, help="Map longitude.")
    args = parser.parse_args()

    if not sb.enabled():
        raise SystemExit(
            "supabase_store is not enabled. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(in repo .env or shell env) and re-run."
        )

    file_ids = _pick_file_ids(args.file_id, args.count)
    total_files = args.total if args.total is not None else len(file_ids)

    print(f"[backfill] run_id={args.run_id} count={len(file_ids)} total_files={total_files}")
    for fid in file_ids:
        print(f"  - {fid}")

    vjob = {
        "job_id": args.run_id,
        "total": total_files,
        "completed": 0,
        "confidence": 0.25,
        "slice_size": 1280,
        "overlap": 0.25,
        "full_imgsz": 1280,
        "frame_interval": 1,
        "files": {},
        "status": "active",
        "created_at": time.time(),
        "map_gps": {"lat": args.lat, "lng": args.lng},
    }

    print("[backfill] persist_video_job_created")
    sb.persist_video_job_created(vjob, model_id="dota_1000ep_best")

    for i, fid in enumerate(file_ids, start=1):
        try:
            result, fdata = _build_video_result(fid)
        except FileNotFoundError as exc:
            print(f"[backfill] skip {fid}: {exc}")
            continue

        vjob["files"][fid] = {**fdata, "status": "pending"}
        print(f"[backfill] {i}/{len(file_ids)} persist_video_file_uploaded {fid}")
        sb.persist_video_file_uploaded(args.run_id, fid, vjob["files"][fid], vjob)

        vjob["files"][fid]["status"] = "done"
        vjob["completed"] = i

        print(f"[backfill] {i}/{len(file_ids)} persist_video_file_result   {fid}"
              f" frames={result['total_frames']} dets={result['total_detections']}")
        sb.persist_video_file_result(
            args.run_id, fid, result, vjob["files"][fid], vjob, results_dir=RESULTS_DIR
        )

    vjob["status"] = "complete"
    vjob["total"] = max(total_files, len(vjob["files"]))
    print("[backfill] persist_video_job_status (complete)")
    sb.persist_video_job_status(vjob)

    print(f"[backfill] done. run_id={args.run_id} completed_files={vjob['completed']}")


if __name__ == "__main__":
    main()
