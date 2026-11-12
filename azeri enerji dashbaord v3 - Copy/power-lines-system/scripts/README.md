# RunPod inference scripts

GPU pod setup for Render (`POD_INFERENCE_URL` → port **6006**).

## One-time setup (on the pod)

```bash
cd /workspace/project/scripts   # or wherever this repo lives on the pod
chmod +x pod_setup_inference_env.sh pod_start_inference.sh
bash pod_setup_inference_env.sh
```

Creates `/workspace/venv-inference`, installs packages from `requirements-pod-inference.txt` (matches `backend/requirements-gpu.txt` inference subset), copies `pod_inference_server.py` → `/workspace/inference_server.py`.

## Start after every pod resume

```bash
bash /workspace/project/scripts/pod_start_inference.sh
```

## Verify

```bash
curl -s http://127.0.0.1:6006/names
curl -s https://YOUR-POD-ID-6006.proxy.runpod.net/names
```

## Weights

Default: `/workspace/project/runs/obb/yolo11x_obb_dota_20260426_060214/weights/best.pt`

Override: `export YOLO_WEIGHTS=/path/to/best.pt` before start.
