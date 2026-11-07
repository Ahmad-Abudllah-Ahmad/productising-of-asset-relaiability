# Runs Page Report Generation: Current Implementation

This document traces the current report generation feature in `frontend/src/pages/Runs.tsx`, including the frontend flow, browser-side PDF creation, local review state, and the backend APIs that provide the data used by the report.

## Executive Summary

The Runs report generation feature is implemented almost entirely in the frontend. The table, selection, preview, approvals, comments, and assignee state still live in `frontend/src/pages/Runs.tsx`, while the report button, report layout, data preparation, and browser-side PDF export now live in `frontend/src/components/RunsReportGenerator.tsx`.

Users select one or more runs from the Recent Uploads table and click `Generate report`. For each selected run, the child report component builds a PDF in the browser using the run data already loaded from `/api/runs`, optional thermal details fetched from `/api/thermal/batch/results/{job_id}`, media files served from `/results/{job_id}/{filename}`, `html2canvas`, and `jspdf`.

There is no dedicated backend endpoint that generates this specific Runs page PDF. The backend is responsible for storing jobs, exposing normalized run summaries, serving generated image/video/thermal assets, and returning detailed thermal batch analysis payloads.

## Main Files Involved

| Area | File | Role |
| --- | --- | --- |
| Report selection and state | `frontend/src/pages/Runs.tsx` | Owns run table selection, preview state, review approvals, comments, assignee state, and passes those values into the report child component. |
| Report UI and PDF generation | `frontend/src/components/RunsReportGenerator.tsx` | Owns the Generate report button, report data shaping, report HTML assembly, PDF rendering, and download. |
| Shared API base | `frontend/src/api/api.ts` | Defines `API_BASE` and general run-related types/helpers, though `Runs.tsx` directly uses `fetch` for this feature. |
| Detection sidebar/filter utilities | `frontend/src/utils/detectionSidebarBuckets.ts` and `frontend/src/components/DetectionClassFilter.tsx` | Provide class normalization, class filtering, defect/component grouping, and RGB overlay filtering used by preview and report generation. |
| Backend routes | `backend/server.py` | Provides `/api/runs`, `/results/{job_id}/{filename}`, `/api/video/detections/{file_id}`, and thermal route wrappers. |
| Thermal HTTP handlers | `backend/thermal_http.py` | Implements thermal batch start/upload/results, ROI, and CSV handlers. |
| Thermal worker | `backend/thermal_image_worker.py` | Produces thermal result rows, rendered thermal PNGs, saved R-JPEGs, stats, and analysis payloads. |

## User-Facing Flow In `Runs.tsx`

1. `Runs` loads all available runs by calling `fetch("/api/runs")`.
2. The run list refreshes every 5 seconds.
3. The user can filter/search runs, preview a run, approve/cancel individual files, add per-file comments, and assign the batch to a demo assignee.
4. The user selects one or more runs using the table selection state.
5. `Runs.tsx` renders `RunsReportGenerator` and passes the selected runs, review state, comments, assignee map, date helper, and active hidden class keys.
6. The `Generate report` button inside `RunsReportGenerator` calls its internal `generateSelectedReport()`.
7. The function generates one PDF per selected run.
8. Each PDF is downloaded with a filename like:

```text
defect_report_<first-8-run-id-chars>_<yyyy-mm-dd>.pdf
```

## Local Frontend State Used By Reports

The report is not generated from server-side review state. It depends on local browser state stored in `localStorage`.

| Local Storage Key | State Variable | Purpose |
| --- | --- | --- |
| `runs_file_review_status_v1` | `fileReviewStatusByRun` | Tracks whether each file in each run is `approved` or `canceled`. Only approved files are exported. |
| `runs_file_comments_v1` | `fileCommentByRun` | Stores human suggestions/comments per file. Approved comments are inserted into the PDF. |
| `runs_batch_assignee_v1` | `batchAssigneeByRun` | Stores selected demo assignee per run. Inserted into the PDF header. |

Important behavior: report contents are filtered to files marked `approved`. If no files are approved, the PDF contains an empty state saying `No approved needed.`

## Report Generation Entry Point

The main report function is now inside `frontend/src/components/RunsReportGenerator.tsx`:

```ts
const generateSelectedReport = useCallback(async () => { ... })
```

It performs these major steps:

1. Finds selected runs from `runs` using `selectedRunIds`.
2. Loads `/logo-1.png` as a data URL with `fetchAsDataUrl`.
3. Creates a human-readable inspection date and a PDF filename date.
4. Creates one PDF job per selected run.
5. For each selected run:
   - Determines display type with `runDisplayType(run)`.
   - Reads approved file state and comments from local state.
   - Detects whether the run is a DJI thermal batch using `run.thermal_analysis_job`.
   - Builds one or more `defectCards`.
   - Builds a header, summary metrics bar, report body pages, and footer.
   - Writes the report HTML into a hidden iframe.
   - Waits for iframe, images, Tailwind CDN, and `html2canvas`.
   - Rasterizes each `.pdf-page` using `html2canvas`.
   - Adds each rasterized page to a `jsPDF` A4 document.
   - Downloads the PDF with `pdf.save(pdfFilename)`.

## Report Type Handling

### RGB Image Runs

For non-thermal report runs, the code loops through approved image files:

```ts
const imageFiles = run.files.filter((f) => {
  const fileKey = (f.file_id || f.filename || "").trim();
  if (!fileKey) return false;
  if (approvedMap[fileKey] !== "approved") return false;
  return Boolean(f.annotated_url || f.thumb_url);
});
```

For each approved image file:

1. It reads `f.detections`.
2. It filters detections through `filterRowsForRgbPreviewOverlay(..., clsFilter.hiddenSet)`.
3. It ignores hidden/internal class keys from `SIDEBAR_HIDDEN_CLASS_KEYS`.
4. It maps each detection into:
   - Display label
   - Confidence
   - Bounding box
5. It loads the clean/reference image:
   - Preferred: `clean_url`
   - Fallback: `thumb_url`
   - Fallback: `annotated_url`
6. It creates:
   - A full-frame baseline/reference image using `fullImageContainedDataUrl`.
   - A cropped current/detected image with a single drawn bounding box using `cropDataUrlWithSingleAnnotation`.
7. It creates one PDF defect card per detection.

The RGB PDF defect card contains:

- Reference image without annotation overlay.
- Current crop with a single annotation.
- Component name.
- Generated component ID from `safeIdFromLabel`.
- Longitude and latitude from file GPS, run GPS, or nested run metadata GPS.
- Source filename.
- Optional human suggestion/comment.

### Video Runs

Video runs can be selected, but the report generator currently does not create cropped video defect comparisons.

If a selected run has display type `video`, the report includes a warning note:

```text
This batch contains video items. Cropped defect comparisons are generated for image-based detections only.
```

The preview modal can fetch video detections from `/api/video/detections/{file_id}` when embedded detections are missing, but the PDF report generation loop only creates detailed defect cards from image files with `annotated_url` or `thumb_url`.

### DJI Thermal Batch Runs

DJI thermal batch runs are identified by:

```ts
const isThermalReportRun = Boolean(run.thermal_analysis_job);
```

For these runs, report generation fetches detailed thermal batch rows:

```ts
GET /api/thermal/batch/results/{run.run_id}
```

The report then loops through returned `results`, matches each thermal result to a file from `run.files` by `file_id` or `filename`, and only includes rows whose file key is marked `approved`.

Each approved thermal result card is built by:

```ts
buildThermalDefectReportHtml(...)
```

The thermal PDF card contains:

- Thermal visualization image.
- Temperature statistics.
- Component/run/date table.
- Source filename.
- Camera and location metadata.
- Distance and environment values.
- Thermal parameters.
- Optional human suggestion/comment.

Thermal image source priority:

1. `thermal_image_base64_png`, when present.
2. `thermal_visualization_url`.
3. `thermal_image_url`.

The URL is resolved through `resolveThermalFetchUrl`, which prefixes `API_BASE` for relative backend paths when configured.

## Report Helper Functions In `RunsReportGenerator.tsx`

| Function | Purpose |
| --- | --- |
| `resolveThermalFetchUrl` | Converts relative backend asset URLs to absolute URLs when `API_BASE` is configured. |
| `safeIdFromLabel` | Generates a pseudo component ID from the detection label plus a random suffix. |
| `defectBlurb` | Contains canned defect descriptions, but it is not currently used in the active RGB report card markup. |
| `loadImage` | Loads an image into an `HTMLImageElement`, with CORS enabled. |
| `fetchAsDataUrl` | Fetches a URL and converts it to a base64 data URL. Used for logo and thermal image assets. |
| `cropDataUrlWithSingleAnnotation` | Crops around a bounding box and draws a single annotation on a canvas. |
| `fullImageContainedDataUrl` | Converts a full image into a scaled PNG data URL for PDF insertion. |
| `escapeReportHtml` | Escapes unsafe HTML characters before injecting text into report HTML. |
| `buildPdfSummaryMetricsBar` | Builds the top metrics strip for batch ID, inspection date, image count, reviewed findings, and processing time. |
| `buildThermalTemperatureStatsHtml` | Builds thermal min/max/mean/median/std-dev/resolution/range rows. |
| `buildThermalCameraLocationHtml` | Builds camera, serial, timestamp, GPS, tilt, altitude, and resolution rows from thermal analysis metadata. |
| `buildThermalDistanceEnvHtml` | Builds distance, ambient temperature, and humidity rows. |
| `buildThermalParametersHtml` | Builds emissivity and reflected temperature rows. |
| `buildThermalDefectReportHtml` | Builds one full thermal report defect section. |

## PDF Rendering Implementation

The frontend creates HTML first, then converts HTML pages to a PDF.

Current rendering pipeline:

1. Create hidden iframe:

```ts
const pdfIframe = document.createElement("iframe");
pdfIframe.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;height:1400px;border:none;visibility:hidden;";
```

2. Write complete HTML into iframe, including:
   - Tailwind CDN script.
   - `html2canvas` CDN script.
   - Inline report CSS.
   - One or more `.pdf-page` elements.

3. Wait for iframe load and image completion.
4. Dynamically import `jspdf`:

```ts
const { jsPDF } = await import("jspdf");
```

5. Render every `.pdf-page` with `html2canvas`:

```ts
const canvas = await iframeWin.html2canvas(pageEls[pi] as HTMLElement, {
  scale: 2,
  useCORS: true,
  width: 794,
  windowWidth: 794,
  scrollY: 0,
  backgroundColor: "#ffffff",
});
```

6. Convert the canvas to JPEG and add it to the PDF:

```ts
pdf.addImage(imgData, "JPEG", margin, margin, contentW, Math.min(imgH, pageH - margin * 2));
```

7. Save the PDF.

## Frontend API Calls Used By `Runs.tsx`

### `GET /api/runs`

Used by:

```ts
fetchRuns()
```

This is the main API for the Runs table and most report data.

The response is expected to be either:

- An array of run entries.
- Or an object with a `runs` array.

Current backend returns a flat array.

Important fields consumed by report generation:

```ts
type RunEntry = {
  run_id: string;
  type: "image" | "video" | "thermal";
  thermal_analysis_job?: boolean;
  gps?: { lat: number; lng: number };
  status: string;
  total_files: number;
  completed: number;
  total_defects: number;
  needs_review: number;
  avg_confidence: number;
  created_at: number | string;
  _created_ts?: number;
  files: FileInfo[];
};
```

Important file fields consumed by report generation:

```ts
type FileInfo = {
  file_id?: string;
  filename: string;
  source?: string;
  status: string;
  thumb_url?: string;
  annotated_url?: string;
  clean_url?: string;
  video_url?: string;
  original_url?: string;
  frames_url?: string;
  detections?: any[];
  image_width?: number | null;
  image_height?: number | null;
  stats?: {
    total_defects: number;
    avg_confidence: number;
    max_confidence: number;
    min_confidence: number;
    processing_time_ms: number;
  };
  gps?: { lat: number; lng: number } | null;
};
```

### `GET /api/thermal/batch/results/{job_id}`

Used in two places:

1. Thermal report generation for approved DJI thermal batches.
2. Thermal preview modal for the currently opened DJI thermal run.

The response is built by `backend/thermal_http.py`.

Shape:

```json
{
  "job_id": "string",
  "status": "active | complete | ...",
  "total": 0,
  "completed": 0,
  "palette": 2,
  "unit": "Celsius",
  "object_type": "string or null",
  "results": [],
  "file_statuses": {}
}
```

Important thermal result fields consumed by report generation:

```ts
{
  file_id: string;
  filename: string;
  thermal_image_base64_png?: string | null;
  thermal_image_url?: string | null;
  thermal_visualization_url?: string | null;
  thermal_rjpeg_url?: string | null;
  stats?: ThermalStats;
  analysis?: ThermalAnalysisData;
  unit?: string;
  processing_time_ms?: number;
}
```

By default `include_base64` is false, so the backend strips `thermal_image_base64_png` and the frontend generally uses `thermal_image_url`.

### `GET /results/{job_id}/{filename}`

Used indirectly by image URLs returned from `/api/runs` and `/api/thermal/batch/results/{job_id}`.

Examples:

```text
/results/{image_job_id}/{file_id}_thumb.jpg
/results/{image_job_id}/{file_id}_annotated.jpg
/results/{image_job_id}/{file_id}_clean.jpg
/results/{thermal_job_id}/{file_id}_thermal.png
/results/{thermal_job_id}/{file_id}_rjpeg.jpg
/results/{video_file_id}/annotated.mp4
/results/{video_file_id}/original.mp4
/results/{video_file_id}/detections_frames.json
```

For RGB reports, the frontend loads image files from these URLs and converts them into canvas data URLs.

For thermal reports, the frontend may fetch thermal visualization images and convert them to data URLs.

### `GET /api/video/detections/{file_id}`

This endpoint is used by the preview modal when a video file has no embedded detection rows. It is not currently a major input to detailed PDF card generation.

## Backend Data Assembly

### `/api/runs` In `backend/server.py`

The route:

```py
@app.get("/api/runs")
async def get_all_runs():
```

Builds one sorted list from:

1. `jobs` using `_build_run_entry(jid, job, "image")`
2. `video_jobs` using `_build_run_entry(vid, vjob, "video")`
3. `_thermal_jobs_dict` using `_build_thermal_run_entry(tid, tjob)`

The resulting array is sorted by `_created_ts` descending.

### Image Run Payloads

Image worker output includes:

```py
{
  "file_id": file_id,
  "filename": filename,
  "thumb_url": f"/results/{job_id}/{file_id}_thumb.jpg",
  "annotated_url": f"/results/{job_id}/{file_id}_annotated.jpg",
  "clean_url": f"/results/{job_id}/{file_id}_clean.jpg",
  "image_width": int(w),
  "image_height": int(h),
  "detections": dets,
  "stats": stats,
}
```

The report relies on `clean_url`, `thumb_url`, `annotated_url`, `detections`, `stats.processing_time_ms`, and GPS where available.

### Video Run Payloads

Video worker output includes:

```py
{
  "thumb_url": f"/results/{file_id}/thumb.jpg",
  "video_url": f"/results/{file_id}/annotated.mp4",
  "original_url": f"/results/{file_id}/original.mp4",
  "frames_url": f"/results/{file_id}/detections_frames.json",
  "detections": all_detections_list,
}
```

The Runs preview uses these fields heavily. The current PDF report only adds a note for video runs and does not produce detailed video defect pages.

### Thermal Run Payloads

`_build_thermal_run_entry` creates normalized thermal run entries for `/api/runs`.

Important fields:

```py
{
  "run_id": jid,
  "type": "thermal",
  "thermal_analysis_job": True,
  "status": "...",
  "total_files": total_planned,
  "completed": n_completed,
  "files": files_info,
  "gps": _gps_for_map(job, jid),
}
```

Each thermal file row contains:

```py
{
  "file_id": fid,
  "filename": fname,
  "source": "thermal",
  "status": fe_status,
  "thumb_url": thumb,
  "annotated_url": thumb,
  "detections": [],
  "stats": None,
  "gps": fdata.get("gps"),
}
```

The deeper thermal analysis is not embedded in `/api/runs`; it is fetched from `/api/thermal/batch/results/{job_id}` during preview/report generation.

## Thermal Result Production

`backend/thermal_image_worker.py` creates thermal result rows.

For each file, it can save:

- Original R-JPEG:

```text
/results/{job_id}/{file_id}_rjpeg.jpg
```

- Rendered thermal visualization:

```text
/results/{job_id}/{file_id}_thermal.png
```

It returns result fields like:

```py
{
  "file_id": file_id,
  "filename": filename,
  "client_key": ck_str,
  "sha256": sha,
  "thermal_image_base64_png": thermal_image_b64,
  "thermal_image_url": thermal_image_url,
  "thermal_rjpeg_url": thermal_rjpeg_url,
  "stats": stats,
  "analysis": analysis,
  "unit": unit,
  "processing_time_ms": round(elapsed_ms),
}
```

These rows are stored in the thermal job and returned by `/api/thermal/batch/results/{job_id}`.

## Report Data Dependencies By Section

| PDF Section | Data Source |
| --- | --- |
| Batch ID | `run.run_id` from `/api/runs` |
| Inspection date | Browser date at generation time |
| Images processed | `run.total_files` or `run.files.length` |
| Findings reviewed | Count of locally approved files |
| Processing time | Sum of thermal `processing_time_ms` or file `stats.processing_time_ms` |
| Type | `runDisplayType(run)` from `/api/runs` data |
| Created date | `run.created_at` or `_created_ts` |
| Assigned to | Local storage `runs_batch_assignee_v1` |
| RGB reference image | `clean_url`, `thumb_url`, or `annotated_url` |
| RGB current crop | Canvas crop from reference image and detection `bbox` |
| RGB component label | Detection `class_name` or `label`, normalized and formatted |
| RGB GPS | `file.gps`, then `run.gps`, then nested metadata GPS |
| Human suggestion | Local storage `runs_file_comments_v1` |
| Thermal visualization | `thermal_image_base64_png`, `thermal_visualization_url`, or `thermal_image_url` |
| Thermal stats | `row.stats` from `/api/thermal/batch/results/{job_id}` |
| Thermal camera/location | `row.analysis.metadata_extracted` |
| Thermal distance/environment | `row.analysis.distance_meters` and `row.analysis.environment` |
| Thermal parameters | `row.analysis.thermal_parameters` |

## Current Limitations And Important Notes

1. The Runs page report is browser-generated, not backend-generated.
2. Review approvals, comments, and assignee are local to the browser and are not persisted on the backend.
3. Only approved files are included in the exported report.
4. RGB reports create one PDF card per included detection bounding box.
5. The RGB report respects the current class visibility filter through `clsFilter.hiddenSet`.
6. Video runs currently get a note but no detailed cropped defect comparison cards.
7. DJI thermal reports fetch deeper analysis from `/api/thermal/batch/results/{job_id}` at export time.
8. Thermal batch rows in `/api/runs` are lightweight; detailed thermal stats and analysis are intentionally fetched separately.
9. PDF layout depends on loading CDN scripts for Tailwind and `html2canvas` inside the hidden iframe.
10. PDF pages are rasterized images inserted into `jsPDF`, so text in the resulting PDF is not selectable/searchable as real PDF text.
11. Component IDs in the report are generated randomly from labels at export time, so repeated exports can produce different IDs for the same detection.
12. The report uses client-side canvas operations, so image CORS/accessibility matters for successful rendering.

## API Responsibility Summary

The API responsible for providing the report data is mainly:

```text
GET /api/runs
```

This provides the selected run metadata, file metadata, detections, RGB image URLs, processing stats, statuses, and GPS.

For DJI thermal batch reports, the additional required API is:

```text
GET /api/thermal/batch/results/{job_id}
```

This provides detailed thermal result rows, including thermal visualization URLs, temperature stats, extracted metadata, distance/environment values, thermal parameters, unit, and processing time.

Supporting asset/data endpoints are:

```text
GET /results/{job_id}/{filename}
GET /api/video/detections/{file_id}
POST /api/thermal/roi
```

`/results/{job_id}/{filename}` is essential because report images are loaded from returned asset URLs. `/api/video/detections/{file_id}` and `/api/thermal/roi` are primarily preview/detail support in `Runs.tsx`; they are not the main source for the generated PDF report.
