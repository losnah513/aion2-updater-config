-- KINOJO Legion Tree · public read snapshot resilience · internal contract 461

create index if not exists idx_character_master_legion_tree_source_v461
  on public.character_master (
    (nullif(btrim(legion_name), '')),
    list_row,
    id
  )
  include (
    character_name,
    class_name,
    is_main,
    main_character_id,
    main_character_name,
    server_id,
    server_name
  )
  where coalesce(is_active, true) = true
    and coalesce(status, 'OK') <> 'DELETED'
    and coalesce(visibility_excluded, false) = false
    and list_row is not null;

create table if not exists private.legion_tree_public_snapshot_v461 (
  snapshot_key boolean primary key default true check (snapshot_key),
  source_token text not null,
  payload jsonb not null,
  refreshed_at timestamptz not null default clock_timestamp()
);

revoke all on table private.legion_tree_public_snapshot_v461 from public, anon, authenticated;

create or replace function private.kinojo_legion_tree_source_token_v461()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '1200ms'
set lock_timeout = '200ms'
as $$
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
$$;

create or replace function private.kinojo_legion_tree_configured_stages_v461(
  p_legion_name text,
  p_stage_count integer,
  p_stage_names jsonb,
  p_members jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $$
declare
  v_stages jsonb := '[]'::jsonb;
  v_stage_no integer;
  v_roles jsonb;
begin
  if p_legion_name is null
     or p_legion_name not in ('깡', '낮', '밤', '키나노동조합')
     or p_stage_count is null
     or p_stage_count < 1
     or p_stage_count > 50
     or p_stage_names is null
     or jsonb_typeof(p_stage_names) <> 'array'
     or p_members is null
     or jsonb_typeof(p_members) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_stage_no in 1..p_stage_count loop
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'roleKey', r.role_id::text,
          'roleName', r.role_name,
          'slotNo', r.slot_no,
          'maxMembers', r.max_members,
          'groups', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'groupKey', g.group_key,
                'groupName', case
                  when r.stage_no = 1 then r.role_name
                  when g.is_unaffiliated then '소속 외'
                  when g.parent_role_id is null then r.role_name
                  else pr.role_name
                end,
                'parentRoleKey', case when g.parent_role_id is null then null else g.parent_role_id::text end,
                'unaffiliated', g.is_unaffiliated,
                'defaultAffiliation', g.parent_role_id is null and not g.is_unaffiliated,
                'sortOrder', g.group_sort + 1,
                'members', coalesce((
                  select jsonb_agg(
                    member.value
                    order by a2.sort_order,
                      (member.value->>'listRow')::integer,
                      (member.value->>'characterId')::bigint
                  )
                  from private.legion_tree_assignments a2
                  join lateral jsonb_array_elements(p_members) member(value)
                    on (member.value->>'characterId')::bigint = a2.character_id
                  where a2.legion_name = p_legion_name
                    and a2.role_id = r.role_id
                    and a2.parent_role_id is not distinct from g.parent_role_id
                    and a2.is_unaffiliated = g.is_unaffiliated
                ), '[]'::jsonb)
              )
              order by g.group_sort, g.group_key
            )
            from (
              select
                case
                  when a.parent_role_id is not null then a.parent_role_id::text
                  when a.is_unaffiliated then 'unaffiliated:' || r.role_id::text
                  else 'default:' || r.role_id::text
                end as group_key,
                a.parent_role_id,
                a.is_unaffiliated,
                min(a.sort_order)::integer as group_sort
              from private.legion_tree_assignments a
              where a.legion_name = p_legion_name
                and a.role_id = r.role_id
              group by a.parent_role_id, a.is_unaffiliated
            ) g
            left join private.legion_tree_roles pr
              on pr.legion_name = p_legion_name
             and pr.role_id = g.parent_role_id
          ), '[]'::jsonb)
        )
        order by r.sort_order, r.slot_no, r.role_id
      ),
      '[]'::jsonb
    )
      into v_roles
      from private.legion_tree_roles r
     where r.legion_name = p_legion_name
       and r.stage_no = v_stage_no;

    v_stages := v_stages || jsonb_build_array(jsonb_build_object(
      'stageNo', v_stage_no,
      'stageName', coalesce(nullif(btrim(p_stage_names->>(v_stage_no - 1)), ''), v_stage_no::text || '단계'),
      'roles', v_roles
    ));
  end loop;

  return v_stages;
end;
$$;

create or replace function private.kinojo_legion_tree_build_payload_v461()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '3s'
set lock_timeout = '250ms'
as $$
declare
  v_legions jsonb := '[]'::jsonb;
begin
  with legion_catalog(legion_name, legion_order) as (
    values ('깡'::text, 1), ('낮'::text, 2), ('밤'::text, 3), ('키나노동조합'::text, 4)
  ), member_rows as materialized (
    select * from private.kinojo_legion_tree_member_source_v352()
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
          'listRow', mr.list_row
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
    'readOptimizationContract', '461',
    'snapshotContract', 'source-token-stale-fallback-v461',
    'affiliationContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated',
    'source', 'server_legion_tree',
    'generatedAt', current_timestamp,
    'legionOrder', jsonb_build_array('깡', '낮', '밤', '키나노동조합'),
    'structureContract', jsonb_build_object(
      'version', '2',
      'memberPath', 'legions[].stages[].roles[].groups[].members[]',
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
$$;

create or replace function private.kinojo_legion_tree_refresh_snapshot_v461(
  p_source_token text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '3500ms'
set lock_timeout = '250ms'
as $$
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
$$;

create or replace function public.kinojo_web_get_legion_tree()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '4s'
set lock_timeout = '250ms'
as $$
declare
  v_cached_payload jsonb;
  v_cached_token text;
  v_cached_at timestamptz;
  v_source_token text;
  v_refreshed jsonb;
begin
  select s.payload, s.source_token, s.refreshed_at
    into v_cached_payload, v_cached_token, v_cached_at
    from private.legion_tree_public_snapshot_v461 s
   where s.snapshot_key = true;

  begin
    v_source_token := private.kinojo_legion_tree_source_token_v461();
  exception
    when query_canceled then
      if v_cached_payload is not null then
        return v_cached_payload || jsonb_build_object(
          'snapshotState', 'STALE_TIMEOUT',
          'snapshotRefreshedAt', v_cached_at
        );
      end if;
      raise;
  end;

  if v_cached_payload is not null and v_cached_token = v_source_token then
    return v_cached_payload || jsonb_build_object(
      'snapshotState', 'HIT',
      'snapshotRefreshedAt', v_cached_at
    );
  end if;

  if not pg_try_advisory_xact_lock(461, 1) then
    if v_cached_payload is not null then
      return v_cached_payload || jsonb_build_object(
        'snapshotState', 'STALE_REFRESHING',
        'snapshotRefreshedAt', v_cached_at
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'contract', 'web-legion-tree-v1',
      'databaseContract', '460',
      'readOptimizationContract', '461',
      'code', 'LEGION_TREE_SNAPSHOT_REFRESHING',
      'message', '레기온 트리를 준비하고 있습니다.'
    );
  end if;

  begin
    v_refreshed := private.kinojo_legion_tree_refresh_snapshot_v461(v_source_token);
    return v_refreshed;
  exception
    when query_canceled then
      if v_cached_payload is not null then
        return v_cached_payload || jsonb_build_object(
          'snapshotState', 'STALE_TIMEOUT',
          'snapshotRefreshedAt', v_cached_at
        );
      end if;
      raise;
    when others then
      if v_cached_payload is not null then
        return v_cached_payload || jsonb_build_object(
          'snapshotState', 'STALE_ERROR',
          'snapshotRefreshedAt', v_cached_at
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'contract', 'web-legion-tree-v1',
        'databaseContract', '460',
        'readOptimizationContract', '461',
        'code', 'LEGION_TREE_READ_FAILED',
        'message', '레기온 트리를 불러오지 못했습니다.'
      );
  end;
end;
$$;

create or replace function public.kinojo_legion_tree_organization_save_v460(
  p_session_token text,
  p_legion_name text,
  p_expected_revision bigint,
  p_stage_count integer,
  p_stage_names jsonb,
  p_roles jsonb,
  p_assignments jsonb,
  p_reset_to_default boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '5s'
set lock_timeout = '500ms'
as $$
declare
  v_session jsonb;
  v_profile jsonb;
  v_actor text;
  v_result jsonb;
begin
  v_session := public.kinojo_web_session_validate_v320(p_session_token, true);
  if coalesce((v_session->>'ok')::boolean, false) is not true then
    return v_session;
  end if;
  v_profile := coalesce(v_session->'profile', '{}'::jsonb);
  if coalesce((v_profile->>'canManage')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'ORGANIZATION_SAVE_FORBIDDEN', 'message', '조직도를 저장할 권한이 없습니다.');
  end if;
  v_actor := 'member:' || coalesce(nullif(v_profile->>'id', ''), 'unknown');
  v_result := private.kinojo_legion_tree_save_core_v460(
    v_actor,
    p_legion_name,
    p_expected_revision,
    p_stage_count,
    p_stage_names,
    p_roles,
    p_assignments,
    p_reset_to_default
  );
  if coalesce((v_result->>'ok')::boolean, false) is true then
    begin
      perform private.kinojo_legion_tree_refresh_snapshot_v461();
    exception
      when query_canceled then null;
      when others then null;
    end;
  end if;
  return v_result || jsonb_build_object('readOptimizationContract', '461');
end;
$$;

revoke all on function private.kinojo_legion_tree_source_token_v461() from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_configured_stages_v461(text, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_build_payload_v461() from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_refresh_snapshot_v461(text) from public, anon, authenticated;
grant execute on function private.kinojo_legion_tree_source_token_v461() to postgres, service_role;
grant execute on function private.kinojo_legion_tree_configured_stages_v461(text, integer, jsonb, jsonb) to postgres, service_role;
grant execute on function private.kinojo_legion_tree_build_payload_v461() to postgres, service_role;
grant execute on function private.kinojo_legion_tree_refresh_snapshot_v461(text) to postgres, service_role;

revoke all on function public.kinojo_web_get_legion_tree() from public;
grant execute on function public.kinojo_web_get_legion_tree() to anon, authenticated, service_role;

revoke all on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

select private.kinojo_legion_tree_refresh_snapshot_v461();

comment on table private.legion_tree_public_snapshot_v461
is 'Single-row public Legion Tree payload cache keyed by an exact source token; public reads can serve the last valid payload during transient database saturation.';

comment on function public.kinojo_web_get_legion_tree()
is 'Public DB460 Legion Tree contract with internal v461 source-token snapshot, single refresher advisory lock, and stale payload fallback on query cancellation.';
