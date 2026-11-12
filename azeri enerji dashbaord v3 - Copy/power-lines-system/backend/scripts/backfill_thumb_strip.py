"""
Pre-render the 48-tile annotated frame strip for one or more file_ids.

Reads `backend/results/<file_id>/annotated.mp4`, samples 48 frame indices
that match the frontend's slot layout exactly:

    fa = frames_analyzed (frontend default = total_frames)
    n  = min(48, fa)
    fi[k] = round(k / (n-1) * (fa-1))    for k in 0..n-1

Each frame is resized to 320 px wide (preserving aspect), encoded as JPEG
quality 70, and uploaded to Supabase Storage as:

    results/<file_id>/thumbs/<kk>.jpg     (kk = "00".."47")

Idempotent: existing thumbs are overwritten via x-upsert. Frontend will load
these instantly via CDN instead of seeking the 4K H.264 stream 48 times.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

import cv2

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import supabase_store as sb  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "results"
SLOT_COUNT = 48
THUMB_WIDTH = 320
JPEG_QUALITY = 70


def _slot_indices(total_frames: int) -> list[int]:
    fa = max(1, total_frames)
    n = min(SLOT_COUNT, fa)
    if n <= 1:
        return [0]
    return [round((k / (n - 1)) * (fa - 1)) for k in range(n)]


def generate_for_file(file_id: str) -> int:
    folder = RESULTS_DIR / file_id
    video_path = folder / "annotated.mp4"
    if not video_path.is_file():
        print(f"[skip] {file_id}: no annotated.mp4")
        return 0

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"[skip] {file_id}: cannot open mp4")
        return 0

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    if total <= 0:
        cap.release()
        print(f"[skip] {file_id}: total_frames=0")
        return 0

    indices = _slot_indices(total)
    uploaded = 0

    with tempfile.TemporaryDirectory(prefix=f"thumbs_{file_id}_") as tmp:
        tmp_dir = Path(tmp)
        for k, fi in enumerate(indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            h, w = frame.shape[:2]
            if w <= 0 or h <= 0:
                continue
            tw = THUMB_WIDTH
            th = max(1, round(h / w * tw))
            small = cv2.resize(frame, (tw, th), interpolation=cv2.INTER_AREA)

            local_jpg = tmp_dir / f"{k:02d}.jpg"
            cv2.imwrite(
                str(local_jpg),
                small,
                [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
            )

            storage_path = f"results/{file_id}/thumbs/{k:02d}.jpg"
            url = sb._upload_to_storage(local_jpg, storage_path)
            if url:
                uploaded += 1
            else:
                print(f"[warn] {file_id} slot {k:02d}: upload failed")

    cap.release()
    print(f"[ok] {file_id}: {uploaded}/{len(indices)} thumbs uploaded")
    return uploaded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-id", action="append", default=[],
                        help="Specific file_id under backend/results/. Repeat for several.")
    parser.add_argument("--run-id", default=None,
                        help="When set, fetches all file_ids of this run from Supabase and processes those.")
    args = parser.parse_args()

    sb._load_env_file()
    if not sb.enabled():
        raise SystemExit("supabase_store not enabled (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")

    file_ids: list[str] = list(args.file_id)
    if args.run_id and not file_ids:
        rows = sb._select(
            "run_files",
            {"select": "file_id", "run_id": f"eq.{args.run_id}", "order": "file_id.asc"},
        )
        file_ids = [r["file_id"] for r in rows]

    if not file_ids:
        raise SystemExit("Provide --run-id or one or more --file-id values.")

    print(f"[backfill_thumb_strip] {len(file_ids)} file(s)")
    total_uploaded = 0
    for fid in file_ids:
        total_uploaded += generate_for_file(fid)
    print(f"[backfill_thumb_strip] done. total uploaded: {total_uploaded}")


if __name__ == "__main__":
    main()
