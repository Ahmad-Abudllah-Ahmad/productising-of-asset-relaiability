"""One-off: remove all Supabase Storage objects for a list of file_ids."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import supabase_store as sb  # noqa: E402

sb._load_env_file()
bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "powerlines-artifacts")
base = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
headers = {"Authorization": f"Bearer {key}", "apikey": key}


def list_objects(prefix: str) -> list[str]:
    out: list[str] = []
    offset = 0
    while True:
        r = requests.post(
            f"{base}/storage/v1/object/list/{bucket}",
            headers={**headers, "Content-Type": "application/json"},
            json={"prefix": prefix, "limit": 1000, "offset": offset},
            timeout=30,
        )
        if r.status_code >= 400:
            print(f"list {prefix}: {r.status_code} {r.text[:200]}")
            return out
        rows = r.json() or []
        if not rows:
            break
        out.extend(f"{prefix}{row['name']}" for row in rows if row.get("name"))
        if len(rows) < 1000:
            break
        offset += len(rows)
    return out


def remove_paths(paths: list[str]) -> int:
    if not paths:
        return 0
    r = requests.delete(
        f"{base}/storage/v1/object/{bucket}",
        headers={**headers, "Content-Type": "application/json"},
        json={"prefixes": paths},
        timeout=60,
    )
    if r.status_code >= 400:
        print(f"delete: {r.status_code} {r.text[:200]}")
        return 0
    body = r.json()
    return len(body) if isinstance(body, list) else 0


def purge_file_id(file_id: str) -> None:
    keys: list[str] = []
    for sub in (f"results/{file_id}/", f"results/{file_id}/thumbs/"):
        keys.extend(list_objects(sub))
    if not keys:
        print(f"  {file_id}: no objects found")
        return
    deleted = remove_paths(keys)
    print(f"  {file_id}: deleted {deleted}/{len(keys)} objects")


if __name__ == "__main__":
    targets = sys.argv[1:]
    if not targets:
        raise SystemExit("usage: _purge_storage_files.py <file_id> [<file_id> ...]")
    print(f"Purging Storage objects for {len(targets)} file_id(s) from bucket={bucket}")
    for fid in targets:
        purge_file_id(fid)
