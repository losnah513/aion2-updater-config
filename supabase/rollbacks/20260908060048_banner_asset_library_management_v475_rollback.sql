-- Restore Web/Edge first. No operational image data is changed by this rollback.
drop function if exists public.kinojo_banner_asset_format_set_v475(text,bigint,text,text);
CREATE OR REPLACE FUNCTION private.kinojo_banner_asset_ref_count_v384(p_asset_id bigint)
 RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_count bigint := 0;
begin
  if p_asset_id is null or p_asset_id <= 0 then return 0; end if;
  if pg_catalog.to_regclass('public.kinojo_banner_campaign_items') is null then return 0; end if;
  execute 'select count(*) from public.kinojo_banner_campaign_items where asset_id=$1' into v_count using p_asset_id;
  return coalesce(v_count,0);
end;
$function$;
