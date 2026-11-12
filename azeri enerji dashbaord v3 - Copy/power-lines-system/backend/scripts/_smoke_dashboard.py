import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import supabase_store as sb

sb._load_env_file()
runs = sb.fetch_dashboard_runs(force=True)
target = next((r for r in runs if r["run_id"] == "021111123456"), None)
if not target:
    raise SystemExit("run not found")

f = next(x for x in target["files"] if x["file_id"] == "1f4497da1f")
print("thumb_url   :", f["thumb_url"])
print("video_url   :", f["video_url"])
print("original_url:", f["original_url"])
print("frames_url  :", f.get("frames_url"))
print("detections  :", len(f.get("detections", [])), "rows; sample:", f["detections"][:2])
print()
storage_ok = sum(
    1 for x in target["files"] if "storage/v1/object/public" in (x.get("video_url") or "")
)
frames_ok = sum(
    1 for x in target["files"] if "storage/v1/object/public" in (x.get("frames_url") or "")
)
dets_ok = sum(1 for x in target["files"] if x.get("detections"))
print(f"files with public Supabase video URLs : {storage_ok}/{len(target['files'])}")
print(f"files with public Supabase frame URLs : {frames_ok}/{len(target['files'])}")
print(f"files with embedded detection lists   : {dets_ok}/{len(target['files'])}")
