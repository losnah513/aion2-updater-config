-- Roll back Legion Tree combat-power read field v464 to internal snapshot v461.

create or replace function private.kinojo_legion_tree_source_token_v461()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '1200ms'
set lock_timeout to '200ms'
as $function$
  select md5(jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          mr.legion_name,
          mr.legion_order,
          mr.character_id,
          mr.character_name,
          mr.class_name,
          mr.is_main,
          mr.main_character_id,
          mr.main_character_name,
          mr.server_id,
          mr.server_name,
          mr.list_row
        )
        order by mr.legion_order, mr.list_row, mr.character_id
      )
      from private.kinojo_legion_tree_member_source_v352() mr
    ), '[]'::jsonb),
    'configs', coalesce((
      select jsonb_agg(
        jsonb_build_array(c.legion_name, c.stage_count, c.stage_names, c.revision)
        order by c.legion_name
      )
      from private.legion_tree_configs c
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          r.legion_name,
          r.role_id,
          r.stage_no,
          r.slot_no,
          r.role_name,
          r.max_members,
          r.sort_order
        )
        order by r.legion_name, r.stage_no, r.sort_order, r.slot_no, r.role_id
      )
      from private.legion_tree_roles r
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          a.legion_name,
          a.character_id,
          a.role_id,
          a.parent_role_id,
          a.is_unaffiliated,
          a.sort_order
        )
        order by a.legion_name, a.role_id, a.sort_order, a.character_id
      )
      from private.legion_tree_assignments a
    ), '[]'::jsonb)
  )::text);
$function$;

create or replace function private.kinojo_legion_tree_refresh_snapshot_v461(
  p_source_token text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '3500ms'
set lock_timeout to '250ms'
as $function$
declare
  v_source_token text := coalesce(nullif(p_source_token, ''), private.kinojo_legion_tree_source_token_v461());
  v_payload jsonb;
  v_refreshed_at timestamptz := clock_timestamp();
begin
  v_payload := private.kinojo_legion_tree_build_payload_v461();
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
$function$;

select private.kinojo_legion_tree_refresh_snapshot_v461();

drop function if exists private.kinojo_legion_tree_build_payload_v464();
drop function if exists private.kinojo_legion_tree_source_token_v464();
