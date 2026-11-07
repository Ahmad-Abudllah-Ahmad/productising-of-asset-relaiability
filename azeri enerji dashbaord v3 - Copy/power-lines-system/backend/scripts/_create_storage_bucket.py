"""One-off: create the Supabase Storage bucket used for artifact uploads."""
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
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_SECRET_KEY"]

resp = requests.post(
    f"{base}/storage/v1/bucket",
    headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"},
    json={
        "id": bucket,
        "name": bucket,
        "public": True,
    },
    timeout=30,
)
print("create bucket:", resp.status_code, resp.text[:300])
