#!/usr/bin/env bash
# Create /workspace/venv-inference and install deps for inference_server.py (GPU pod).
# Run on the RunPod pod after resume: bash /workspace/project/scripts/pod_setup_inference_env.sh
set -euo pipefail

VENV="${POD_INFERENCE_VENV:-/workspace/venv-inference}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQ="${SCRIPT_DIR}/requirements-pod-inference.txt"
SERVER_SRC="${SCRIPT_DIR}/pod_inference_server.py"
SERVER_DST="${POD_INFERENCE_SERVER:-/workspace/inference_server.py}"

echo "[setup] Python: $(command -v python3 || command -v python)"
python3 -c "import torch; print('[setup] torch', torch.__version__, 'cuda=', torch.cuda.is_available())" \
  || { echo "[setup] ERROR: torch not available — use RunPod PyTorch image"; exit 1; }

echo "[setup] Creating venv at ${VENV}"
python3 -m venv "${VENV}"
# shellcheck source=/dev/null
source "${VENV}/bin/activate"
pip install -U pip wheel

echo "[setup] Installing inference requirements (no torch reinstall)"
pip install --no-cache-dir -r "${REQ}"

echo "[setup] Verifying imports"
python -c "
import cv2, numpy, torch, fastapi, uvicorn, PIL
from ultralytics import YOLO
print('cv2', cv2.__version__)
print('torch', torch.__version__, 'cuda', torch.cuda.is_available())
print('ultralytics OK')
print('deps OK')
"

if [[ -f "${SERVER_SRC}" ]]; then
  cp -f "${SERVER_SRC}" "${SERVER_DST}"
  echo "[setup] Copied ${SERVER_SRC} -> ${SERVER_DST}"
fi

WEIGHTS="/workspace/project/runs/obb/yolo11x_obb_dota_20260426_060214/weights/best.pt"
if [[ -f "${WEIGHTS}" ]]; then
  echo "[setup] Weights found: ${WEIGHTS}"
else
  echo "[setup] WARN: weights missing: ${WEIGHTS}"
  find /workspace -name 'best.pt' 2>/dev/null | head -5 || true
fi

echo "[setup] Done. Start with:"
echo "  source ${VENV}/bin/activate"
echo "  nohup python -u ${SERVER_DST} > /workspace/inference_server.log 2>&1 &"
