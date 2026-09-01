-- Legion Tree member combat-power read field.
-- Keeps the public DB460 shape backward compatible while advancing the
-- internal snapshot content contract to v464.

create or replace function private.kinojo_legion_tree_source_token_v464()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '1200ms'
set lock_timeout to '200ms'
as $function$
  with member_rows as materialized (
    select mr.*, cm.latest_pve_combat_power as combat_power
      from private.kinojo_legion_tree_member_source_v352() mr
      join public.character_master cm on cm.id = mr.character_id
  )
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
          mr.list_row,
          mr.combat_power
        )
        order by mr.legion_order, mr.list_row, mr.character_id
      )
      from member_rows mr
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

create or replace function private.kinojo_legion_tree_build_payload_v464()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '3s'
set lock_timeout to '250ms'
as $function$
declare
  v_legions jsonb := '[]'::jsonb;
begin
  with legion_catalog(legion_name, legion_order) as (
    values ('깡'::text, 1), ('낮'::text, 2), ('밤'::text, 3), ('키나노동조합'::text, 4)
  ), member_rows as materialized (
    select mr.*, cm.latest_pve_combat_power as combat_power
      from private.kinojo_legion_tree_member_source_v352() mr
      join public.character_master cm on cm.id = mr.character_id
  ), legion_rows as (
    select
      lc.legion_name,
      lc.legion_order,
      cfg.stage_count,
      cfg.stage_names,
      coalesce(cfg.revision, 0::bigint) as revision,
      cfg.legion_name is not null as organization_configured,
      count(mr.character_id)::integer as member_count,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'characterId', mr.character_id,
          'characterName', mr.character_name,
          'className', mr.class_name,
          'isMain', mr.is_main,
          'mainCharacterId', mr.main_character_id,
          'mainCharacterName', mr.main_character_name,
          'serverId', mr.server_id,
          'serverName', mr.server_name,
          'listRow', mr.list_row,
          'combatPower', mr.combat_power
        ) order by mr.list_row, mr.character_id
      ) filter (where mr.character_id is not null), '[]'::jsonb) as members
    from legion_catalog lc
    left join member_rows mr
      on mr.legion_name = lc.legion_name and mr.legion_order = lc.legion_order
    left join private.legion_tree_configs cfg on cfg.legion_name = lc.legion_name
    group by lc.legion_name, lc.legion_order, cfg.legion_name, cfg.stage_count, cfg.stage_names, cfg.revision
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'legionName', lr.legion_name,
      'legionOrder', lr.legion_order,
      'revision', lr.revision,
      'treeState', case when lr.organization_configured then 'CONFIGURED' else 'DEFAULT_FALLBACK' end,
      'organizationConfigured', lr.organization_configured,
      'fallbackApplied', not lr.organization_configured,
      'stageCount', case when lr.organization_configured then lr.stage_count else 3 end,
      'memberCount', lr.member_count,
      'stages', case
        when lr.organization_configured then private.kinojo_legion_tree_configured_stages_v461(
          lr.legion_name,
          lr.stage_count,
          lr.stage_names,
          lr.members
        )
        else private.kinojo_legion_tree_default_stages_v355(lr.members)
      end,
      'unassignedMembers', case when lr.organization_configured then coalesce((
        select jsonb_agg(member order by (member->>'listRow')::integer, (member->>'characterId')::bigint)
          from jsonb_array_elements(lr.members) member
         where not exists (
           select 1 from private.legion_tree_assignments a
            where a.legion_name = lr.legion_name
              and a.character_id = (member->>'characterId')::bigint
         )
      ), '[]'::jsonb) else '[]'::jsonb end
    )
    order by lr.legion_order
  ), '[]'::jsonb)
    into v_legions
    from legion_rows lr;

  return jsonb_build_object(
    'ok', true,
    'contract', 'web-legion-tree-v1',
    'databaseContract', '460',
    'memberSourceContract', '352',
    'fallbackContract', '355',
    'revisionContract', '363',
    'integrityContract', '365',
    'saveContract', '460',
    'readOptimizationContract', '464',
    'memberOrderContract', 'combat-power-desc-client-v464',
    'snapshotContract', 'source-token-stale-fallback-v464',
    'affiliationContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated',
    'source', 'server_legion_tree',
    'generatedAt', current_timestamp,
    'legionOrder', jsonb_build_array('깡', '낮', '밤', '키나노동조합'),
    'structureContract', jsonb_build_object(
      'version', '2',
      'memberPath', 'legions[].stages[].roles[].groups[].members[]',
      'memberCombatPowerPath', 'combatPower',
      'directRoleMembers', false,
      'roleKeyType', 'opaque_string',
      'groupKeyType', 'opaque_string',
      'defaultFallback', '군단장 > 엘리트장교 > 군단병',
      'revisionPath', 'legions[].revision',
      'fallbackRevision', 0,
      'integrityValidation', 'server_precommit',
      'parentContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated'
    ),
    'legions', v_legions
  );
end;
$function$;

create or replace function private.kinojo_legion_tree_source_token_v461()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '1200ms'
set lock_timeout to '200ms'
as $function$
  select private.kinojo_legion_tree_source_token_v464();
$function$;

create or replace function private.kinojo_legion_tree_refresh_snapshot_v461(
  p_source_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '3500ms'
set lock_timeout to '250ms'
as $function$
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
$function$;

revoke all on function private.kinojo_legion_tree_source_token_v464() from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_build_payload_v464() from public, anon, authenticated;
grant execute on function private.kinojo_legion_tree_source_token_v464() to service_role;
grant execute on function private.kinojo_legion_tree_build_payload_v464() to service_role;

comment on function private.kinojo_legion_tree_source_token_v464() is
  'Internal v464 Legion Tree snapshot source token including latest PVE combat power.';
comment on function private.kinojo_legion_tree_build_payload_v464() is
  'Internal v464 Legion Tree payload builder exposing combatPower for deterministic client display ordering.';
comment on function private.kinojo_legion_tree_refresh_snapshot_v461(text) is
  'Refreshes the existing v461 snapshot table with v464 combat-power payload content.';

select private.kinojo_legion_tree_refresh_snapshot_v461();
