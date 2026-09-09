-- SQL487: reuse verified delivery derivatives even without content layers.
-- No rows, schedules, original assets, signatures or privileges are changed.
DO $patch$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('private.kinojo_banner_manifest_internal_v396(text,text,timestamptz)'::regprocedure);
  IF position($before$when i.composite_object_path is not null$before$ in definition)=0 THEN
    RAISE EXCEPTION 'BANNER_DELIVERY_PATCH_BASE_MISMATCH';
  END IF;
  EXECUTE replace(definition,$before$when i.composite_object_path is not null$before$,$after$when private.kinojo_banner_content_enabled_v396(i.content_overlays)
       and i.composite_object_path is not null$after$);
END;
$patch$;

