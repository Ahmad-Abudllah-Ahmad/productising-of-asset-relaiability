import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import supabase_store as sb

sb._load_env_file()
sb._DASHBOARD_CACHE["ts"] = 0
runs = sb.fetch_dashboard_runs(force=True)
for r in runs:
    if not (r.get("thermal_analysis_job") or r.get("type") == "thermal"):
        continue
    print(r["run_id"], "files:", len(r.get("files", [])))
    for f in r.get("files", [])[:2]:
        thumb = f.get("thumb_url") or ""
        print("  ", f["file_id"], "thumb:", thumb[:90])
