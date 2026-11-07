#!/usr/bin/env bash
# Start inference HTTP server on 0.0.0.0:6006 (after pod_setup_inference_env.sh).
set -euo pipefail

VENV="${POD_INFERENCE_VENV:-/workspace/venv-inference}"
SERVER="${POD_INFERENCE_SERVER:-/workspace/inference_server.py}"
LOG="${POD_INFERENCE_LOG:-/workspace/inference_server.log}"
PORT="${POD_INFERENCE_PORT:-6006}"

if [[ ! -d "${VENV}" ]]; then
  echo "[start] venv missing — run: bash $(dirname "$0")/pod_setup_inference_env.sh"
  exit 1
fi
if [[ ! -f "${SERVER}" ]]; then
  echo "[start] server script missing: ${SERVER}"
  exit 1
fi

pkill -f 'inference_server.py' 2>/dev/null || true
sleep 2

# shellcheck source=/dev/null
source "${VENV}/bin/activate"
export YOLO_WEIGHTS="${YOLO_WEIGHTS:-/workspace/project/runs/obb/yolo11x_obb_dota_20260426_060214/weights/best.pt}"
export PORT

cd /workspace
nohup python -u "${SERVER}" > "${LOG}" 2>&1 &
echo "[start] PID=$! port=${PORT} weights=${YOLO_WEIGHTS}"
echo "[start] log: ${LOG}"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "[start] Server responding on :${PORT}"
    curl -fsS "http://127.0.0.1:${PORT}/names" | head -c 200 || true
    echo ""
    exit 0
  fi
  sleep 5
done

echo "[start] Server not ready yet — check log:"
tail -40 "${LOG}" || true
exit 1
