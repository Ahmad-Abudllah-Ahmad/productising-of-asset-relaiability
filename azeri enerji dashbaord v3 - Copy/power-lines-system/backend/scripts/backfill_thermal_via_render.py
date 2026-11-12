"""
Pull thermal artifacts from the deployed Render server (which may still have
them on its ephemeral disk) and upload them to Supabase Storage so they
survive future restarts and show up on the deployed dashboard sidebar.

Usage:
    python backend/scripts/backfill_thermal_via_render.py \
        --base https://powerlines-management.onrender.com \
        --run-id 2d40579a4acd
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

import requests

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import supabase_store as sb  # noqa: E402

KIND_TO_SUFFIX = {
    "thermal_png": "_thermal.png",
    "thermal_rjpeg": "_rjpeg.jpg",
}


def backfill_run(base_url: str, run_id: str) -> None:
    files = sb._select(
        "run_files",
        {"select": "file_id,filename", "run_id": f"eq.{run_id}", "limit": "10000"},
    )
    artifacts = sb._select(
        "run_file_artifacts",
        {"select": "file_id,kind,relative_url", "run_id": f"eq.{run_id}", "limit": "10000"},
    )
    if not files or not artifacts:
        print(f"[skip] {run_id}: nothing in DB")
        return

    art_by_file: dict[str, dict[str, str]] = {}
    for a in artifacts:
        art_by_file.setdefault(a["file_id"], {})[a["kind"]] = a["relative_url"]

    uploaded = 0
    skipped = 0
    fetched = 0
    print(f"[run] {run_id}: {len(files)} files, {len(artifacts)} artifacts")

    with tempfile.TemporaryDirectory(prefix=f"thermal_{run_id}_") as tmp:
        tmp_dir = Path(tmp)
        for f in files:
            fid = f["file_id"]
            arts = art_by_file.get(fid, {})
            for kind, suffix in KIND_TO_SUFFIX.items():
                rel = arts.get(kind)
                if not rel or rel.startswith("http"):
                    skipped += 1
                    continue
                rel_path = rel.lstrip("/")
                src = f"{base_url.rstrip('/')}/{rel_path}"
                try:
                    r = requests.get(src, stream=True, timeout=60,
                                     headers={"User-Agent": "ady-backfill/1.0"})
                except Exception as exc:
                    print(f"  [{kind}] {fid}: fetch error {exc}")
                    continue
                if r.status_code != 200:
                    print(f"  [{kind}] {fid}: {r.status_code} on {src[-60:]}")
                    continue
                fetched += 1
                local = tmp_dir / f"{fid}{suffix}"
                with open(local, "wb") as out:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            out.write(chunk)
                public_url = sb._upload_to_storage(local, rel_path)
                if not public_url:
                    print(f"  [{kind}] {fid}: storage upload failed")
                    continue
                sb._upsert(
                    "run_file_artifacts",
                    {
                        "run_id": run_id,
                        "file_id": fid,
                        "kind": kind,
                        "relative_url": public_url,
                    },
                    "file_id,kind",
                )
                uploaded += 1

    print(f"[done] {run_id}: fetched={fetched} uploaded={uploaded} skipped(already-cdn-or-missing)={skipped}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://powerlines-management.onrender.com",
                        help="Root URL serving /results/... assets.")
    parser.add_argument("--run-id", action="append", required=True,
                        help="Repeat --run-id for several runs.")
    args = parser.parse_args()

    sb._load_env_file()
    if not sb.enabled():
        raise SystemExit("supabase_store not enabled.")

    for jid in args.run_id:
        backfill_run(args.base, jid)


if __name__ == "__main__":
    main()
