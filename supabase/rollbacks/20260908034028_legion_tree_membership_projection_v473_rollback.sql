CREATE OR REPLACE FUNCTION private.kinojo_legion_tree_member_source_v352()
 RETURNS TABLE(legion_name text, legion_order integer, character_id bigint, character_name text, class_name text, is_main boolean, main_character_id bigint, main_character_name text, server_id integer, server_name text, list_row integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  with target_legions(legion_name, legion_order) as (
    values
      ('깡'::text, 1),
      ('낮'::text, 2),
      ('밤'::text, 3),
      ('키나노동조합'::text, 4)
  )
  select
    target_legions.legion_name,
    target_legions.legion_order,
    cm.id as character_id,
    cm.character_name,
    cm.class_name,
    coalesce(cm.is_main, false) as is_main,
    case when coalesce(cm.is_main, false) then cm.id else cm.main_character_id end as main_character_id,
    coalesce(nullif(btrim(cm.main_character_name), ''), cm.character_name) as main_character_name,
    cm.server_id,
    cm.server_name,
    cm.list_row
  from target_legions
  join public.character_master cm
    on nullif(btrim(cm.legion_name), '') = target_legions.legion_name
  where coalesce(cm.is_active, true) = true
    and coalesce(cm.status, 'OK') <> 'DELETED'
    and coalesce(cm.visibility_excluded, false) = false
    and cm.list_row is not null
  order by target_legions.legion_order, cm.list_row, cm.id;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_legion_tree_refresh_snapshot_v461(p_source_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '3500ms'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_source_token text := coalesce(nullif(p_source_token, ''), private.kinojo_legion_tree_source_token_v464());
  v_payload jsonb;
  v_refreshed_at timestamptz := clock_timestamp();
begin
  v_payload := private.kinojo_legion_tree_build_payload_v464();
  insert into private.legion_tree_public_snapshot_v461(snapshot_key, source_token, payload, refreshed_at)
  values (true, v_source_token, v_payload, v_refreshed_at)
  on conflict (snapshot_key) do update
    set source_token = excluded.source_token,
        payload = excluded.payload,
        refreshed_at = excluded.refreshed_at;

  return v_payload || jsonb_build_object(
    'snapshotState', 'REFRESHED',
    'snapshotRefreshedAt', v_refreshed_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_legion_tree_source_token_v461()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '1200ms'
 SET lock_timeout TO '200ms'
AS $function$
  select private.kinojo_legion_tree_source_token_v464();
$function$
;
select private.kinojo_legion_tree_refresh_snapshot_v461()->>'readOptimizationContract';
