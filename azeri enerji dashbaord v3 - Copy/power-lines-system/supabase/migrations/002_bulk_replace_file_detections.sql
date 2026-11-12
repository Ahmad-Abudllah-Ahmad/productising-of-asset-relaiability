CREATE OR REPLACE FUNCTION public.bulk_replace_file_detections(
  p_run_id text,
  p_file_id text,
  p_rows jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  b class_bucket;
  is_comp boolean;
BEGIN
  ALTER TABLE public.detections DISABLE TRIGGER detections_refresh_stats_trg;
  ALTER TABLE public.detections DISABLE TRIGGER detections_class_flags_trg;
  DELETE FROM public.detections WHERE file_id = p_file_id;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    SELECT dc.bucket INTO b FROM public.detection_classes dc
    WHERE dc.class_id = (r->>'class_id')::int
       OR dc.class_key = public.normalize_class_key(r->>'class_name')
    LIMIT 1;
    is_comp := coalesce(b = 'component', false);

    INSERT INTO public.detections (
      run_id, file_id, frame_index, class_id, class_name, confidence,
      bbox_x1, bbox_y1, bbox_x2, bbox_y2, source, is_component
    ) VALUES (
      p_run_id, p_file_id,
      CASE WHEN r ? 'frame_index' AND r->>'frame_index' IS NOT NULL THEN (r->>'frame_index')::int ELSE NULL END,
      coalesce((r->>'class_id')::int, 0),
      coalesce(r->>'class_name', ''),
      coalesce((r->>'confidence')::real, 0),
      coalesce((r->'bbox'->>0)::real, 0), coalesce((r->'bbox'->>1)::real, 0),
      coalesce((r->'bbox'->>2)::real, 0), coalesce((r->'bbox'->>3)::real, 0),
      CASE WHEN r->>'source' IS NOT NULL AND r->>'source' <> '' THEN (r->>'source')::detection_source ELSE NULL END,
      is_comp
    );
  END LOOP;

  ALTER TABLE public.detections ENABLE TRIGGER detections_refresh_stats_trg;
  ALTER TABLE public.detections ENABLE TRIGGER detections_class_flags_trg;
  PERFORM public.refresh_run_file_stats(p_file_id);
END;
$$;
