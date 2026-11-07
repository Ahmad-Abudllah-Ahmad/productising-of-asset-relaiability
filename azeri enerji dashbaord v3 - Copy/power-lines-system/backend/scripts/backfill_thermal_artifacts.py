"""
One-off: upload thermal artifact JPGs/PNGs that are still on local disk
(`backend/results/<job_id>/<file_id>_rjpeg.jpg`,
 `backend/results/<job_id>/<file_id>_thermal.png`)
to Supabase Storage so the deployed thermal sidebar can render them.

Usage:
    python backend/scripts/backfill_thermal_artifacts.py --run-id 2d40579a4acd
    python backend/scripts/backfill_thermal_artifacts.py --all-thermal
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import supabase_store as sb  # noqa: E402

RESULTS_DIR = BACKEND_DIR / "results"


def backfill_run(job_id: str) -> None:
    files = sb._select(
        "run_files",
        {"select": "file_id,filename", "run_id": f"eq.{job_id}", "limit": "10000"},
    )
    if not files:
        print(f"[skip] {job_id}: no run_files in DB")
        return
    print(f"[run] {job_id}: {len(files)} thermal files")
    job_dir = RESULTS_DIR / job_id
    if not job_dir.is_dir():
        print(f"  warning: local folder {job_dir} not found; relative URLs cannot be resolved")
    for f in files:
        fid = f["file_id"]
        sb._upsert_artifacts(
            job_id,
            fid,
            {
                "thermal_image_url": f"/results/{job_id}/{fid}_thermal.png",
                "thermal_rjpeg_url": f"/results/{job_id}/{fid}_rjpeg.jpg",
            },
            results_dir=RESULTS_DIR,
        )
    print(f"  done: artifact rows refreshed for {len(files)} files")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", action="append", default=[],
                        help="Specific thermal run job_id. Repeat for several.")
    parser.add_argument("--all-thermal", action="store_true",
                        help="Backfill every thermal run found in Supabase.")
    args = parser.parse_args()

    sb._load_env_file()
    if not sb.enabled():
        raise SystemExit("supabase_store not enabled.")

    job_ids: list[str] = list(args.run_id)
    if args.all_thermal:
        rows = sb._select(
            "runs",
            {"select": "job_id", "thermal_analysis_job": "eq.true", "limit": "1000"},
        )
        job_ids.extend(r["job_id"] for r in rows)

    if not job_ids:
        raise SystemExit("Provide --run-id or --all-thermal.")

    seen: set[str] = set()
    for jid in job_ids:
        if jid in seen:
            continue
        seen.add(jid)
        backfill_run(jid)


if __name__ == "__main__":
    main()
