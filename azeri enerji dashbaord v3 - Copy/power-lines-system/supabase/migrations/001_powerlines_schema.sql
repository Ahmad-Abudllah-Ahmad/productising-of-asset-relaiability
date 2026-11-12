-- =============================================================================
-- Azeri Energy Power Lines — Supabase schema (v1)
-- Mirrors in-memory jobs + disk artifacts; supports all Dashboard/Runs filters.
-- Apply with: supabase db push  OR  Supabase MCP apply_migration
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ---------------------------------------------------------------------------
-- Enums (aligned with server.py + frontend)
-- ---------------------------------------------------------------------------
CREATE TYPE run_type AS ENUM ('image', 'video', 'thermal');
CREATE TYPE run_source AS ENUM ('rgb', 'thermal');
CREATE TYPE run_status AS ENUM (
  'active', 'processing', 'complete', 'completed',
  'cancelled', 'cancelling', 'error'
);
CREATE TYPE file_status AS ENUM (
  'pending', 'queued', 'uploading', 'processing', 'done', 'error'
);
CREATE TYPE class_bucket AS ENUM ('component', 'defect', 'hidden');
CREATE TYPE detection_source AS ENUM ('full', 'sahi', 'video_frame');
CREATE TYPE artifact_kind AS ENUM (
  'thumb', 'annotated', 'clean',
  'video_annotated', 'video_original',
  'thermal_png', 'thermal_rjpeg',
  'detections_json', 'detections_frames_json'
);
CREATE TYPE review_status AS ENUM ('unreviewed', 'reviewed', 'flagged', 'approved');

-- ---------------------------------------------------------------------------
-- Helpers (match frontend normalizeDetectionClassKey)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_class_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(replace(replace(coalesce(raw, ''), '-', '_'), ' ', '_')));
$$;

-- ---------------------------------------------------------------------------
-- Model catalog (AVAILABLE_MODELS)
-- ---------------------------------------------------------------------------
CREATE TABLE public.detection_models (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  weights_path    text NOT NULL,
  description     text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT false,
  inference_backend text NOT NULL DEFAULT 'local'
    CHECK (inference_backend IN ('local', 'runpod')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX detection_models_one_active
  ON public.detection_models (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- YOLO class registry (filters: component / defect / hidden sidebar)
-- ---------------------------------------------------------------------------
CREATE TABLE public.detection_classes (
  class_id            int PRIMARY KEY,
  class_name          text NOT NULL,
  class_key           text NOT NULL GENERATED ALWAYS AS (public.normalize_class_key(class_name)) STORED,
  bucket              class_bucket NOT NULL DEFAULT 'defect',
  display_label       text,
  shared_filter_keys  text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX detection_classes_key_uq ON public.detection_classes (class_key);
CREATE INDEX detection_classes_bucket_idx ON public.detection_classes (bucket);

-- ---------------------------------------------------------------------------
-- Unified run (image batch / video batch / thermal batch)
-- ---------------------------------------------------------------------------
CREATE TABLE public.runs (
  job_id              text PRIMARY KEY,
  run_type            run_type NOT NULL,
  source              run_source NOT NULL DEFAULT 'rgb',
  status              run_status NOT NULL DEFAULT 'active',
  cancel_requested    boolean NOT NULL DEFAULT false,

  model_id            text REFERENCES public.detection_models(id),
  total_files         int NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  completed_files     int NOT NULL DEFAULT 0 CHECK (completed_files >= 0),

  -- Image / video YOLO params
  confidence          real NOT NULL DEFAULT 0.25,
  slice_size          int NOT NULL DEFAULT 1280,
  overlap             real NOT NULL DEFAULT 0.25,
  full_imgsz          int NOT NULL DEFAULT 1280,
  nms_iou             real NOT NULL DEFAULT 0.5,
  sahi_tiled          boolean NOT NULL DEFAULT true,
  frame_interval      real,

  -- Thermal-only
  thermal_palette     text,
  thermal_unit        text,
  thermal_object_type text,
  thermal_analysis_job boolean NOT NULL DEFAULT false,

  -- Map pin (job-level)
  map_lat             double precision,
  map_lng             double precision,

  -- Rollups (denormalized for fast /api/runs & /api/summary)
  findings_count      int NOT NULL DEFAULT 0,
  total_defects       int NOT NULL DEFAULT 0,
  rgb_findings        int NOT NULL DEFAULT 0,
  thermal_findings    int NOT NULL DEFAULT 0,
  must_review_count   int NOT NULL DEFAULT 0,
  avg_confidence      real,
  max_confidence      real,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX runs_created_at_idx ON public.runs (created_at DESC);
CREATE INDEX runs_type_status_idx ON public.runs (run_type, status);
CREATE INDEX runs_source_idx ON public.runs (source);
CREATE INDEX runs_type_created_idx ON public.runs (run_type, created_at DESC);
CREATE INDEX runs_status_created_idx ON public.runs (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Files within a run
-- ---------------------------------------------------------------------------
CREATE TABLE public.run_files (
  file_id             text PRIMARY KEY,
  run_id              text NOT NULL REFERENCES public.runs(job_id) ON DELETE CASCADE,
  filename            text NOT NULL,
  status              file_status NOT NULL DEFAULT 'pending',
  source              run_source,
  client_key          text,
  sha256              text,
  error_message       text,

  -- Dimensions
  image_width         int,
  image_height        int,

  -- Video metadata
  duration_sec        real,
  fps                 real,
  total_frames        int,
  frames_analyzed     int,

  -- GPS (per file)
  gps_lat             double precision,
  gps_lng             double precision,

  -- Per-file stats (image/video)
  total_detections    int NOT NULL DEFAULT 0,
  defect_type_count   int NOT NULL DEFAULT 0,
  avg_confidence      real,
  max_confidence      real,
  min_confidence      real,
  processing_time_ms  int,

  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX run_files_run_id_idx ON public.run_files (run_id);
CREATE INDEX run_files_run_status_idx ON public.run_files (run_id, status);
CREATE INDEX run_files_filename_trgm_idx ON public.run_files USING gin (filename gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Artifacts (disk paths under /results/…)
-- ---------------------------------------------------------------------------
CREATE TABLE public.run_file_artifacts (
  id              bigserial PRIMARY KEY,
  run_id          text NOT NULL REFERENCES public.runs(job_id) ON DELETE CASCADE,
  file_id         text NOT NULL REFERENCES public.run_files(file_id) ON DELETE CASCADE,
  kind            artifact_kind NOT NULL,
  relative_url    text NOT NULL,
  mime_type       text,
  byte_size       bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, kind)
);

CREATE INDEX run_file_artifacts_run_idx ON public.run_file_artifacts (run_id);
CREATE INDEX run_file_artifacts_file_idx ON public.run_file_artifacts (file_id);

-- ---------------------------------------------------------------------------
-- Detections (image boxes + per-frame video boxes)
-- ---------------------------------------------------------------------------
CREATE TABLE public.detections (
  id                  bigserial PRIMARY KEY,
  run_id              text NOT NULL REFERENCES public.runs(job_id) ON DELETE CASCADE,
  file_id             text NOT NULL REFERENCES public.run_files(file_id) ON DELETE CASCADE,
  frame_index         int,
  class_id            int NOT NULL,
  class_name          text NOT NULL,
  class_key           text NOT NULL GENERATED ALWAYS AS (public.normalize_class_key(class_name)) STORED,
  confidence          real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bbox_x1             real NOT NULL,
  bbox_y1             real NOT NULL,
  bbox_x2             real NOT NULL,
  bbox_y2             real NOT NULL,
  source              detection_source,
  is_component        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX detections_file_idx ON public.detections (file_id);
CREATE INDEX detections_run_idx ON public.detections (run_id);
CREATE INDEX detections_class_key_idx ON public.detections (class_key);
CREATE INDEX detections_confidence_idx ON public.detections (confidence);
CREATE INDEX detections_file_frame_idx ON public.detections (file_id, frame_index);
CREATE INDEX detections_defects_idx ON public.detections (run_id, file_id)
  WHERE is_component = false;
CREATE INDEX detections_run_class_idx ON public.detections (run_id, class_key);

-- ---------------------------------------------------------------------------
-- Thermal analysis payload (JSON from thermal_analyzer)
-- ---------------------------------------------------------------------------
CREATE TABLE public.thermal_file_analysis (
  file_id             text PRIMARY KEY REFERENCES public.run_files(file_id) ON DELETE CASCADE,
  run_id              text NOT NULL REFERENCES public.runs(job_id) ON DELETE CASCADE,
  palette             text,
  unit                text,
  object_type         text,
  analysis            jsonb NOT NULL DEFAULT '{}',
  metadata_extracted  jsonb NOT NULL DEFAULT '{}',
  stats               jsonb NOT NULL DEFAULT '{}',
  roi                 jsonb,
  processing_time_ms  int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX thermal_analysis_run_idx ON public.thermal_file_analysis (run_id);
CREATE INDEX thermal_analysis_gin_idx ON public.thermal_file_analysis USING gin (analysis jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Optional: human review (Runs page localStorage equivalent)
-- ---------------------------------------------------------------------------
CREATE TABLE public.file_reviews (
  run_id          text NOT NULL REFERENCES public.runs(job_id) ON DELETE CASCADE,
  file_id         text NOT NULL REFERENCES public.run_files(file_id) ON DELETE CASCADE,
  review_status   review_status NOT NULL DEFAULT 'unreviewed',
  assignee        text,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, file_id)
);

-- ---------------------------------------------------------------------------
-- Sync class bucket + is_component on insert/update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_detection_class_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  b class_bucket;
BEGIN
  SELECT dc.bucket INTO b
  FROM public.detection_classes dc
  WHERE dc.class_id = NEW.class_id
     OR dc.class_key = public.normalize_class_key(NEW.class_name)
  LIMIT 1;

  NEW.is_component := (b = 'component');
  RETURN NEW;
END;
$$;

CREATE TRIGGER detections_class_flags_trg
  BEFORE INSERT OR UPDATE OF class_id, class_name ON public.detections
  FOR EACH ROW EXECUTE FUNCTION public.sync_detection_class_flags();

-- ---------------------------------------------------------------------------
-- Recompute run_files + runs rollups after detection changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_run_file_stats(p_file_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id text;
  v_defect_types int;
  v_total int;
  v_avg real;
  v_max real;
  v_min real;
BEGIN
  SELECT run_id INTO v_run_id FROM public.run_files WHERE file_id = p_file_id;

  SELECT
    count(*)::int,
    count(DISTINCT d.class_key) FILTER (WHERE NOT d.is_component),
    avg(d.confidence),
    max(d.confidence),
    min(d.confidence)
  INTO v_total, v_defect_types, v_avg, v_max, v_min
  FROM public.detections d
  WHERE d.file_id = p_file_id;

  UPDATE public.run_files SET
    total_detections = coalesce(v_total, 0),
    defect_type_count = coalesce(v_defect_types, 0),
    avg_confidence = v_avg,
    max_confidence = v_max,
    min_confidence = v_min,
    updated_at = now()
  WHERE file_id = p_file_id;

  PERFORM public.refresh_run_rollups(v_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_run_rollups(p_run_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.runs r SET
    completed_files = (
      SELECT count(*)::int FROM public.run_files f
      WHERE f.run_id = p_run_id AND f.status IN ('done', 'error')
    ),
    findings_count = (
      SELECT coalesce(sum(f.defect_type_count), 0)::int
      FROM public.run_files f WHERE f.run_id = p_run_id
    ),
    total_defects = (
      SELECT coalesce(sum(f.total_detections), 0)::int
      FROM public.run_files f WHERE f.run_id = p_run_id
    ),
    avg_confidence = (
      SELECT avg(f.avg_confidence) FROM public.run_files f
      WHERE f.run_id = p_run_id AND f.avg_confidence IS NOT NULL
    ),
    max_confidence = (
      SELECT max(f.max_confidence) FROM public.run_files f
      WHERE f.run_id = p_run_id
    ),
    updated_at = now()
  WHERE r.job_id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detections_refresh_stats_trg_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_run_file_stats(OLD.file_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_run_file_stats(NEW.file_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER detections_refresh_stats_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.detections
  FOR EACH ROW EXECUTE FUNCTION public.detections_refresh_stats_trg_fn();

-- ---------------------------------------------------------------------------
-- Views: filter-ready list (mirrors GET /api/runs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_runs_list AS
SELECT
  r.job_id AS id,
  r.job_id AS run_id,
  CASE
    WHEN r.thermal_analysis_job OR r.source = 'thermal' THEN 'thermal'
    ELSE r.run_type::text
  END AS type,
  r.thermal_analysis_job,
  CASE r.status
    WHEN 'complete' THEN 'completed'
    WHEN 'active' THEN 'processing'
    ELSE r.status::text
  END AS status,
  r.total_files AS total_files,
  r.completed_files AS completed,
  r.findings_count,
  r.total_defects,
  r.rgb_findings,
  r.thermal_findings,
  r.must_review_count,
  (r.must_review_count > 0) AS needs_review,
  r.avg_confidence AS avg_confidence,
  r.avg_confidence AS ai_confidence,
  r.created_at,
  r.created_at AS timestamp,
  extract(epoch FROM r.created_at)::double precision AS _created_ts,
  CASE WHEN r.map_lat IS NOT NULL AND r.map_lng IS NOT NULL
    THEN jsonb_build_object('lat', r.map_lat, 'lng', r.map_lng)
    ELSE NULL
  END AS gps,
  r.confidence,
  r.slice_size,
  r.overlap,
  r.full_imgsz,
  r.nms_iou,
  r.sahi_tiled,
  r.frame_interval,
  r.thermal_palette,
  r.thermal_unit,
  r.thermal_object_type
FROM public.runs r;

CREATE OR REPLACE VIEW public.v_run_files_api AS
SELECT
  f.file_id,
  f.run_id,
  f.filename,
  coalesce(f.source, r.source)::text AS source,
  f.status::text AS status,
  f.image_width,
  f.image_height,
  f.duration_sec AS duration,
  f.fps,
  f.frames_analyzed,
  f.total_detections,
  f.defect_type_count,
  f.avg_confidence,
  f.max_confidence,
  f.error_message AS error,
  CASE WHEN f.gps_lat IS NOT NULL AND f.gps_lng IS NOT NULL
    THEN jsonb_build_object('lat', f.gps_lat, 'lng', f.gps_lng)
    ELSE NULL
  END AS gps,
  (
    SELECT jsonb_object_agg(a.kind::text, a.relative_url)
    FROM public.run_file_artifacts a WHERE a.file_id = f.file_id
  ) AS artifact_urls
FROM public.run_files f
JOIN public.runs r ON r.job_id = f.run_id;

-- Dashboard summary (GET /api/summary)
CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT
  count(*)::int AS towers_total,
  coalesce(sum(r.total_defects), 0)::int AS findings_total,
  coalesce(avg(r.avg_confidence), 0)::real AS avg_ai_confidence,
  count(*) FILTER (WHERE r.total_defects = 0 AND r.status IN ('complete', 'completed'))::int AS healthy_count,
  count(*) FILTER (WHERE r.total_defects BETWEEN 1 AND 5)::int AS monitor_count,
  count(*) FILTER (WHERE r.total_defects > 5)::int AS requires_inspection_count
FROM public.runs r
WHERE r.status IN ('complete', 'completed', 'active', 'processing');

-- ---------------------------------------------------------------------------
-- Filter RPCs (for future backend; no app code change required today)
-- ---------------------------------------------------------------------------

-- Runs page: search + type + status + date range
CREATE OR REPLACE FUNCTION public.filter_runs(
  p_search text DEFAULT NULL,
  p_run_type text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.v_runs_list
LANGUAGE sql
STABLE
AS $$
  SELECT v.*
  FROM public.v_runs_list v
  JOIN public.runs r ON r.job_id = v.run_id
  WHERE
    (p_run_type IS NULL OR p_run_type = 'all' OR v.type = p_run_type)
    AND (
      p_status IS NULL OR p_status = 'all'
      OR (p_status = 'complete' AND v.status IN ('complete', 'completed'))
      OR (p_status = 'active' AND v.status IN ('active', 'processing'))
      OR v.status = p_status
    )
    AND (p_date_from IS NULL OR r.created_at >= p_date_from)
    AND (p_date_to IS NULL OR r.created_at < p_date_to + interval '1 day')
    AND (
      p_search IS NULL OR trim(p_search) = ''
      OR v.run_id ILIKE '%' || trim(p_search) || '%'
      OR EXISTS (
        SELECT 1 FROM public.run_files f
        WHERE f.run_id = r.job_id
          AND f.filename ILIKE '%' || trim(p_search) || '%'
      )
    )
  ORDER BY r.created_at DESC
  LIMIT greatest(p_limit, 1)
  OFFSET greatest(p_offset, 0);
$$;

-- Detection class filter (hidden keys + confidence threshold)
CREATE OR REPLACE FUNCTION public.filter_detections_for_file(
  p_file_id text,
  p_hidden_class_keys text[] DEFAULT '{}',
  p_min_confidence real DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  class_id int,
  class_name text,
  class_key text,
  confidence real,
  bbox_x1 real, bbox_y1 real, bbox_x2 real, bbox_y2 real,
  frame_index int,
  source detection_source,
  is_component boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id, d.class_id, d.class_name, d.class_key, d.confidence,
    d.bbox_x1, d.bbox_y1, d.bbox_x2, d.bbox_y2,
    d.frame_index, d.source, d.is_component
  FROM public.detections d
  WHERE d.file_id = p_file_id
    AND d.confidence >= p_min_confidence
    AND NOT (d.class_key = ANY (coalesce(p_hidden_class_keys, '{}')))
  ORDER BY d.confidence DESC, d.id;
$$;

-- Sidebar partition counts (components vs defects)
CREATE OR REPLACE FUNCTION public.detection_sidebar_counts(p_file_id text)
RETURNS TABLE (class_key text, bucket text, detection_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.class_key,
    CASE WHEN d.is_component THEN 'component' ELSE 'defect' END AS bucket,
    count(*)::bigint AS detection_count
  FROM public.detections d
  WHERE d.file_id = p_file_id
    AND d.class_key NOT IN ('simple_corrosion')
  GROUP BY d.class_key, d.is_component
  ORDER BY count(*) DESC;
$$;

-- Dashboard time-range filter
CREATE OR REPLACE FUNCTION public.runs_in_time_range(
  p_range text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS SETOF public.v_runs_list
LANGUAGE sql
STABLE
AS $$
  SELECT v.*
  FROM public.v_runs_list v
  JOIN public.runs r ON r.job_id = v.run_id
  WHERE
    CASE p_range
      WHEN 'today' THEN r.created_at >= date_trunc('day', now())
      WHEN '7d' THEN r.created_at >= now() - interval '7 days'
      WHEN '30d' THEN r.created_at >= now() - interval '30 days'
      WHEN 'custom' THEN
        (p_from IS NULL OR r.created_at >= p_from)
        AND (p_to IS NULL OR r.created_at <= p_to)
      ELSE true
    END
  ORDER BY r.created_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (backend uses service_role; anon read optional)
-- ---------------------------------------------------------------------------
ALTER TABLE public.detection_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_file_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thermal_file_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.run_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.detections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.run_file_artifacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.detection_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.detection_classes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.thermal_file_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.file_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Read-only for authenticated dashboard (optional; enable when auth is added)
CREATE POLICY "authenticated_read_runs" ON public.runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_files" ON public.run_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_detections" ON public.detections
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Seed: default model + sidebar class buckets (names filled at runtime from /names)
-- ---------------------------------------------------------------------------
INSERT INTO public.detection_models (id, title, weights_path, description, is_active, inference_backend)
VALUES (
  'dota_1000ep_best',
  'DOTA 1000ep · YOLO11x OBB (RunPod H200)',
  '/workspace/project/runs/obb/yolo11x_obb_dota_20260426_060214/weights/best.pt',
  'YOLO inference on RunPod GPU',
  true,
  'runpod'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  weights_path = EXCLUDED.weights_path,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  inference_backend = EXCLUDED.inference_backend,
  updated_at = now();

INSERT INTO public.detection_classes (class_id, class_name, bucket, display_label, shared_filter_keys)
VALUES
  (0, 'insulator', 'component', 'Insulator', '{}'),
  (1, 'foundation_pedestal', 'component', 'Foundation Padesteal', ARRAY['conductor','foundation_pedestal']),
  (2, 'bolted_connection', 'component', 'Bolted Connection', '{}'),
  (3, 'conductor', 'component', 'Foundation Padesteal', ARRAY['conductor','foundation_pedestal']),
  (4, 'vibration_damper', 'component', 'Vibration Damper', '{}'),
  (5, 'suspension_clamp', 'component', 'Suspension Clamp', '{}'),
  (6, 'yoke_plate', 'component', 'Yoke Plate', '{}'),
  (7, 'transmission_corridor', 'component', 'Transmission Corridor', '{}'),
  (8, 'angle_brace', 'component', 'Angle Brace', '{}'),
  (9, 'cross_arm', 'component', 'Cross Arm', '{}'),
  (10, 'two_glass', 'component', 'Two Glass', '{}')
ON CONFLICT (class_id) DO UPDATE SET
  bucket = EXCLUDED.bucket,
  display_label = EXCLUDED.display_label,
  shared_filter_keys = EXCLUDED.shared_filter_keys;

-- Mark hidden sidebar class (still stored in detections)
INSERT INTO public.detection_classes (class_id, class_name, bucket, display_label)
VALUES (-1, 'simple_corrosion', 'hidden', 'Simple Corrosion')
ON CONFLICT (class_id) DO NOTHING;

COMMENT ON TABLE public.runs IS 'Unified batch job: image SAHI, video pipeline, or thermal analysis';
COMMENT ON TABLE public.detections IS 'All bounding boxes; frame_index NULL = image, set = video frame';
COMMENT ON FUNCTION public.filter_runs IS 'Runs page filters: search, type, status, date range';
