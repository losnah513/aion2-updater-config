-- KINOJO Legion Tree · terminal role default affiliation · DB contract 460

alter table private.legion_tree_assignments
  add column if not exists is_unaffiliated boolean not null default false;

create or replace function private.kinojo_legion_tree_configured_stages_v460(
  p_legion_name text,
  p_stage_count integer,
  p_stage_names jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '1s'
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
     or jsonb_typeof(p_stage_names) <> 'array' then
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
                    ) order by a2.sort_order, mr.list_row, mr.character_id
                  )
                  from private.legion_tree_assignments a2
                  join private.kinojo_legion_tree_member_source_v352() mr
                    on mr.legion_name = a2.legion_name
                   and mr.character_id = a2.character_id
                  where a2.legion_name = p_legion_name
                    and a2.role_id = r.role_id
                    and a2.parent_role_id is not distinct from g.parent_role_id
                    and a2.is_unaffiliated = g.is_unaffiliated
                ), '[]'::jsonb)
                ) order by g.group_sort, g.group_key
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
        ) order by r.sort_order, r.slot_no, r.role_id
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

create or replace function private.kinojo_legion_tree_save_core_v460(
  p_actor text,
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
set statement_timeout = '4s'
set lock_timeout = '500ms'
as $$
declare
  v_entry jsonb;
  v_idx integer;
  v_role_key text;
  v_parent_key text;
  v_role_stage integer;
  v_unaffiliated boolean;
  v_rewritten_assignments jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if coalesce(p_reset_to_default, false)
     or p_assignments is null
     or jsonb_typeof(p_assignments) <> 'array'
     or p_roles is null
     or jsonb_typeof(p_roles) <> 'array' then
    v_result := private.kinojo_legion_tree_save_core_v459(
      p_actor, p_legion_name, p_expected_revision, p_stage_count,
      p_stage_names, p_roles, p_assignments, p_reset_to_default
    );
    return v_result || jsonb_build_object(
      'databaseContract', '460',
      'affiliationContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated'
    );
  end if;

  for v_entry, v_idx in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_assignments) with ordinality
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ASSIGNMENT_SHAPE', 'path', format('assignments[%s]', v_idx));
    end if;
    if v_entry ? 'unaffiliated' and jsonb_typeof(v_entry->'unaffiliated') <> 'boolean' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_UNAFFILIATED_FLAG', 'path', format('assignments[%s].unaffiliated', v_idx));
    end if;

    v_role_key := nullif(btrim(v_entry->>'roleKey'), '');
    v_parent_key := nullif(btrim(v_entry->>'parentRoleKey'), '');
    v_unaffiliated := coalesce((v_entry->>'unaffiliated')::boolean, false);
    v_role_stage := null;

    select case
             when pg_input_is_valid(r.value->>'stageNo', 'integer') then (r.value->>'stageNo')::integer
             else null
           end
      into v_role_stage
      from jsonb_array_elements(p_roles) with ordinality r(value, ordinality)
     where nullif(btrim(r.value->>'roleKey'), '') = v_role_key
     order by r.ordinality
     limit 1;

    if not v_unaffiliated
       and v_parent_key is null
       and v_role_stage = p_stage_count
       and v_role_stage > 1 then
      select nullif(btrim(r.value->>'roleKey'), '')
        into v_parent_key
        from jsonb_array_elements(p_roles) with ordinality r(value, ordinality)
       where pg_input_is_valid(r.value->>'stageNo', 'integer')
         and (r.value->>'stageNo')::integer = v_role_stage - 1
       order by r.ordinality
       limit 1;
      if v_parent_key is null then
        return jsonb_build_object('ok', false, 'code', 'PARENT_ROLE_NOT_FOUND', 'path', format('assignments[%s].parentRoleKey', v_idx));
      end if;
      v_rewritten_assignments := v_rewritten_assignments || jsonb_build_array(
        jsonb_set(v_entry, '{parentRoleKey}', to_jsonb(v_parent_key), true)
      );
    else
      v_rewritten_assignments := v_rewritten_assignments || jsonb_build_array(v_entry);
    end if;
  end loop;

  v_result := private.kinojo_legion_tree_save_core_v459(
    p_actor,
    p_legion_name,
    p_expected_revision,
    p_stage_count,
    p_stage_names,
    p_roles,
    v_rewritten_assignments,
    false
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result || jsonb_build_object(
      'databaseContract', '460',
      'affiliationContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated'
    );
  end if;

  for v_entry in select value from jsonb_array_elements(p_assignments)
  loop
    v_role_key := nullif(btrim(v_entry->>'roleKey'), '');
    v_parent_key := nullif(btrim(v_entry->>'parentRoleKey'), '');
    v_unaffiliated := coalesce((v_entry->>'unaffiliated')::boolean, false);
    v_role_stage := null;
    select case
             when pg_input_is_valid(r.value->>'stageNo', 'integer') then (r.value->>'stageNo')::integer
             else null
           end
      into v_role_stage
      from jsonb_array_elements(p_roles) with ordinality r(value, ordinality)
     where nullif(btrim(r.value->>'roleKey'), '') = v_role_key
     order by r.ordinality
     limit 1;

    update private.legion_tree_assignments a
       set parent_role_id = case
             when v_unaffiliated or (v_parent_key is null and v_role_stage = p_stage_count) then null
             else a.parent_role_id
           end,
           is_unaffiliated = v_unaffiliated
     where a.legion_name = p_legion_name
       and a.character_id = (v_entry->>'characterId')::bigint;
  end loop;

  return v_result || jsonb_build_object(
    'databaseContract', '460',
    'affiliationContract', 'immediate_upper_or_terminal_default_or_explicit_unaffiliated'
  );
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
  return private.kinojo_legion_tree_save_core_v460(
    v_actor,
    p_legion_name,
    p_expected_revision,
    p_stage_count,
    p_stage_names,
    p_roles,
    p_assignments,
    p_reset_to_default
  );
end;
$$;

create or replace function public.kinojo_web_get_legion_tree()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $$
declare
  v_legions jsonb := '[]'::jsonb;
begin
  with legion_catalog(legion_name, legion_order) as (
    values ('깡'::text, 1), ('낮'::text, 2), ('밤'::text, 3), ('키나노동조합'::text, 4)
  ), member_rows as (
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
        when lr.organization_configured then private.kinojo_legion_tree_configured_stages_v460(lr.legion_name, lr.stage_count, lr.stage_names)
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
    ) order by lr.legion_order
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
exception when others then
  return jsonb_build_object(
    'ok', false,
    'contract', 'web-legion-tree-v1',
    'databaseContract', '460',
    'code', 'LEGION_TREE_READ_FAILED',
    'message', '레기온 트리를 불러오지 못했습니다.'
  );
end;
$$;

revoke all on function private.kinojo_legion_tree_configured_stages_v460(text, integer, jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_save_core_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function private.kinojo_legion_tree_configured_stages_v460(text, integer, jsonb) to postgres, service_role;
grant execute on function private.kinojo_legion_tree_save_core_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

revoke all on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

revoke all on function public.kinojo_web_get_legion_tree() from public;
grant execute on function public.kinojo_web_get_legion_tree() to anon, authenticated, service_role;

comment on column private.legion_tree_assignments.is_unaffiliated
is 'True only for an explicit independent department; null parent with false is the terminal role default affiliation.';

comment on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean)
is 'Server-only organization save where terminal members default to their terminal role unless a parent or explicit unaffiliated department is selected.';
