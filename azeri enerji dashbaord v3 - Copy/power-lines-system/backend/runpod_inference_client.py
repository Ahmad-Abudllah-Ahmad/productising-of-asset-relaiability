"""HTTP client for RunPod pod inference (port 6006). Does not modify pod-side scripts."""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np


class _TensorList(list):
    def tolist(self):
        return list(self)


class _RemoteBox:
    __slots__ = ("cls", "xyxy", "conf")

    def __init__(self, cls_id: int, xyxy: list[float], conf: float):
        self.cls = (cls_id,)
        self.xyxy = (_TensorList(xyxy),)
        self.conf = (conf,)


class _RemoteBoxes:
    __slots__ = ("_boxes",)

    def __init__(self, boxes: list[_RemoteBox]):
        self._boxes = boxes

    def __iter__(self):
        return iter(self._boxes)

    def __len__(self):
        return len(self._boxes)


class _RemoteResult:
    __slots__ = ("boxes",)

    def __init__(self, boxes: _RemoteBoxes):
        self.boxes = boxes


class RemoteYOLO:
    """Proxies Ultralytics-style `.predict()` to the RunPod HTTP inference server."""

    def __init__(self, endpoint_url: str, weights_path: str = ""):
        import requests
        from requests.adapters import HTTPAdapter

        self._requests = requests
        self.endpoint = endpoint_url.rstrip("/")
        self.weights_path = weights_path
        self.names = self._fetch_names()
        self._session = requests.Session()
        pool = max(4, int(os.environ.get("REMOTE_HTTP_POOL", "12")))
        adapter = HTTPAdapter(pool_connections=pool, pool_maxsize=pool, max_retries=0)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)
        max_workers = max(1, int(os.environ.get("REMOTE_PREDICT_PARALLEL", "3")))
        self._chunk_pool = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="podchunk"
        )
        enc_workers = max(1, int(os.environ.get("REMOTE_ENCODE_PARALLEL", "2")))
        self._encode_pool = ThreadPoolExecutor(
            max_workers=enc_workers, thread_name_prefix="podenc"
        )
        self._jpeg_quality = max(
            60, min(95, int(os.environ.get("REMOTE_JPEG_QUALITY", "82")))
        )
        self._read_timeout = max(30, int(os.environ.get("REMOTE_READ_TIMEOUT", "120")))

    def _fetch_names(self) -> dict[int, str]:
        try:
            r = self._requests.get(f"{self.endpoint}/names", timeout=30)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                return {i: str(n) for i, n in enumerate(data)}
            if not isinstance(data, dict):
                return {}
            payload = data.get("names") if isinstance(data.get("names"), dict) else data
            out: dict[int, str] = {}
            for k, v in payload.items():
                if not isinstance(v, (str, int, float)):
                    continue
                try:
                    out[int(k)] = str(v)
                except (TypeError, ValueError):
                    continue
            return out
        except Exception as e:
            print(f"[WARN] Could not fetch class names from {self.endpoint}: {e}")
            return {}

    def to(self, _device):
        return self

    def predict(
        self,
        source,
        conf: float = 0.20,
        imgsz: int = 1280,
        device=None,
        verbose: bool = False,
        half: bool = False,
        **_kw,
    ):
        imgs = source if isinstance(source, (list, tuple)) else [source]
        for img in imgs:
            if not isinstance(img, np.ndarray):
                raise TypeError(f"RemoteYOLO.predict expects numpy arrays, got {type(img)}")

        q = self._jpeg_quality
        encode_flags = [int(cv2.IMWRITE_JPEG_QUALITY), q]

        def _encode_one(frame: np.ndarray) -> bytes:
            ok, buf = cv2.imencode(".jpg", frame, encode_flags)
            if not ok:
                raise RuntimeError("JPEG encode failed for remote inference")
            return buf.tobytes()

        if len(imgs) <= 1:
            encoded = [_encode_one(imgs[0])] if imgs else []
        else:
            encoded = list(self._encode_pool.map(_encode_one, imgs))

        data_form = {"conf": str(conf), "imgsz": str(imgsz), "half": "1" if half else "0"}
        chunk = max(1, int(os.environ.get("REMOTE_PREDICT_CHUNK", "8")))
        chunk_starts = list(range(0, len(encoded), chunk))
        chunk_results: list[list[list[dict]]] = [[] for _ in chunk_starts]

        def _do_chunk(idx: int, ci: int):
            body = self._post_chunk_with_retry(encoded[ci : ci + chunk], data_form, ci)
            chunk_results[idx] = body.get("detections") or []

        if len(chunk_starts) <= 1:
            for idx, ci in enumerate(chunk_starts):
                _do_chunk(idx, ci)
        else:
            futs = [self._chunk_pool.submit(_do_chunk, idx, ci) for idx, ci in enumerate(chunk_starts)]
            for f in futs:
                f.result()

        all_per_image: list[list[dict]] = []
        for per_chunk in chunk_results:
            all_per_image.extend(per_chunk)

        results: list[_RemoteResult] = []
        for dets in all_per_image:
            boxes = [_RemoteBox(int(d["cls"]), list(d["xyxy"]), float(d["conf"])) for d in dets]
            results.append(_RemoteResult(_RemoteBoxes(boxes)))
        while len(results) < len(imgs):
            results.append(_RemoteResult(_RemoteBoxes([])))
        return results

    def _post_chunk_with_retry(self, chunk_bytes: list[bytes], data_form: dict, base_idx: int) -> dict:
        transient = {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
        max_attempts = max(1, int(os.environ.get("REMOTE_PREDICT_RETRIES", "8")))
        last_err: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                files = [
                    ("files", (f"img_{base_idx + i}.jpg", b, "image/jpeg"))
                    for i, b in enumerate(chunk_bytes)
                ]
                r = self._session.post(
                    f"{self.endpoint}/predict",
                    files=files,
                    data=data_form,
                    timeout=(10, self._read_timeout),
                )
                if r.status_code in transient:
                    raise RuntimeError(f"transient {r.status_code} from pod proxy")
                r.raise_for_status()
                return r.json()
            except (self._requests.exceptions.Timeout, self._requests.exceptions.ConnectionError) as e:
                last_err = e
            except Exception as e:
                if "transient" not in str(e) and not isinstance(
                    e, self._requests.exceptions.RequestException
                ):
                    raise
                last_err = e
            if attempt < max_attempts:
                wait = min(2 ** min(attempt, 4), 12)
                print(
                    f"[WARN] pod /predict chunk@{base_idx} attempt {attempt} failed ({last_err}); "
                    f"retrying in {wait}s"
                )
                time.sleep(wait)
        raise RuntimeError(
            f"pod /predict chunk@{base_idx} failed after {max_attempts} attempts: {last_err}"
        )


def connect_remote_yolo(endpoint_url: str, weights_path: str = "") -> RemoteYOLO:
    print(f"[INFO] Connecting to remote YOLO at {endpoint_url} (weights={weights_path}) ...")
    model = RemoteYOLO(endpoint_url, weights_path=weights_path)
    print(f"[INFO] Remote model ready. {len(model.names)} classes")
    return model
