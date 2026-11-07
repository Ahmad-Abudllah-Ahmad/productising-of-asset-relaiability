import json
import urllib.request

req = urllib.request.Request(
    "https://powerlines-management.onrender.com/api/runs",
    headers={"User-Agent": "ady-smoke/1.0"},
)
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.loads(r.read())

for t in data:
    if not (t.get("thermal_analysis_job") or t.get("type") == "thermal"):
        continue
    files = t.get("files", [])
    with_thumb = sum(1 for f in files if f.get("thumb_url"))
    on_cdn = sum(1 for f in files if "storage/v1/object/public" in (f.get("thumb_url") or ""))
    print(f"{t['run_id']}: files={len(files)} with_thumb={with_thumb} on_cdn={on_cdn}")
