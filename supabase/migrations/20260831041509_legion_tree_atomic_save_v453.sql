-- KINOJO Legion Tree · 타-1~타-9 atomic organization save · DB contract 453

alter table private.legion_tree_configs
  add column if not exists stage_names jsonb not null default '[]'::jsonb;

alter table private.legion_tree_configs
  drop constraint if exists legion_tree_configs_stage_names_array_chk;

alter table private.legion_tree_configs
  add constraint legion_tree_configs_stage_names_array_chk
  check (jsonb_typeof(stage_names) = 'array');

create or replace function private.kinojo_legion_tree_configured_stages_v453(
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
                'groupKey', g.group_id::text,
                'groupName', case when r.stage_no = 1 then r.role_name else pr.role_name end,
                'parentRoleKey', case when r.stage_no = 1 then null else g.group_id::text end,
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
                    and coalesce(a2.parent_role_id, r.role_id) = g.group_id
                ), '[]'::jsonb)
              ) order by g.group_sort, g.group_id
            )
            from (
              select
                coalesce(a.parent_role_id, r.role_id) as group_id,
                min(a.sort_order)::integer as group_sort
              from private.legion_tree_assignments a
              where a.legion_name = p_legion_name
                and a.role_id = r.role_id
              group by coalesce(a.parent_role_id, r.role_id)
            ) g
            left join private.legion_tree_roles pr
              on pr.legion_name = p_legion_name
             and pr.role_id = g.group_id
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

create or replace function private.kinojo_legion_tree_save_core_v453(
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
set statement_timeout = '3s'
set lock_timeout = '500ms'
as $$
declare
  v_actor text := nullif(btrim(p_actor), '');
  v_current_revision bigint;
  v_cas jsonb;
  v_validation jsonb;
  v_role_map jsonb := '{}'::jsonb;
  v_normalized_roles jsonb := '[]'::jsonb;
  v_normalized_assignments jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_key text;
  v_parent_key text;
  v_role_id uuid;
  v_existing_legion text;
  v_idx integer;
begin
  if p_legion_name is null
     or p_legion_name not in ('깡', '낮', '밤', '키나노동조합') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LEGION', 'message', '지원하지 않는 레기온입니다.');
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REVISION', 'message', 'revision 값이 올바르지 않습니다.');
  end if;
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTOR', 'message', '수정 주체가 필요합니다.');
  end if;

  if coalesce(p_reset_to_default, false) then
    select c.revision
      into v_current_revision
      from private.legion_tree_configs c
     where c.legion_name = p_legion_name
     for update;

    if not found then
      if p_expected_revision = 0 then
        return jsonb_build_object(
          'ok', true,
          'code', 'ALREADY_DEFAULT',
          'contract', 'legion-tree-organization-save-v1',
          'databaseContract', '453',
          'legionName', p_legion_name,
          'previousRevision', 0,
          'revision', 0,
          'resetToDefault', true
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'code', 'REVISION_CONFLICT',
        'message', '다른 사용자가 먼저 조직도를 수정했습니다. 최신 상태를 다시 불러와 주세요.',
        'legionName', p_legion_name,
        'expectedRevision', p_expected_revision,
        'currentRevision', 0
      );
    end if;

    if v_current_revision <> p_expected_revision then
      return jsonb_build_object(
        'ok', false,
        'code', 'REVISION_CONFLICT',
        'message', '다른 사용자가 먼저 조직도를 수정했습니다. 최신 상태를 다시 불러와 주세요.',
        'legionName', p_legion_name,
        'expectedRevision', p_expected_revision,
        'currentRevision', v_current_revision
      );
    end if;

    delete from private.legion_tree_assignments where legion_name = p_legion_name;
    delete from private.legion_tree_roles where legion_name = p_legion_name;
    delete from private.legion_tree_configs where legion_name = p_legion_name and revision = v_current_revision;

    return jsonb_build_object(
      'ok', true,
      'code', 'RESET_TO_DEFAULT',
      'contract', 'legion-tree-organization-save-v1',
      'databaseContract', '453',
      'legionName', p_legion_name,
      'previousRevision', v_current_revision,
      'revision', 0,
      'resetToDefault', true
    );
  end if;

  if p_stage_count is null or p_stage_count < 1 or p_stage_count > 50 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STAGE_COUNT', 'message', '단계 수는 1~50 사이여야 합니다.');
  end if;
  if p_stage_names is null
     or jsonb_typeof(p_stage_names) <> 'array'
     or jsonb_array_length(p_stage_names) <> p_stage_count then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STAGE_NAMES', 'message', '단계명 목록을 다시 확인해 주세요.');
  end if;
  for v_entry, v_idx in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_stage_names) with ordinality
  loop
    if jsonb_typeof(v_entry) <> 'string'
       or nullif(btrim(v_entry #>> '{}'), '') is null
       or length(btrim(v_entry #>> '{}')) > 120 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STAGE_NAME', 'path', format('stageNames[%s]', v_idx), 'message', '단계명은 1~120자로 입력해 주세요.');
    end if;
  end loop;
  if p_roles is null or jsonb_typeof(p_roles) <> 'array'
     or jsonb_array_length(p_roles) < p_stage_count
     or jsonb_array_length(p_roles) > 500 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROLES_PAYLOAD', 'message', '직급 목록을 다시 확인해 주세요.');
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
     or jsonb_array_length(p_assignments) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ASSIGNMENTS_PAYLOAD', 'message', '구성원 배치 목록을 다시 확인해 주세요.');
  end if;

  for v_entry, v_idx in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_roles) with ordinality
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ROLE_SHAPE', 'path', format('roles[%s]', v_idx));
    end if;
    v_key := nullif(btrim(v_entry->>'roleKey'), '');
    if v_key is null or length(v_key) > 180 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ROLE_KEY', 'path', format('roles[%s].roleKey', v_idx));
    end if;
    if v_role_map ? v_key then
      return jsonb_build_object('ok', false, 'code', 'DUPLICATE_ROLE_KEY', 'path', format('roles[%s].roleKey', v_idx));
    end if;

    v_role_id := null;
    if pg_input_is_valid(v_key, 'uuid') then
      select r.role_id
        into v_role_id
        from private.legion_tree_roles r
       where r.role_id = v_key::uuid
         and r.legion_name = p_legion_name;
      if v_role_id is null then
        select r.legion_name
          into v_existing_legion
          from private.legion_tree_roles r
         where r.role_id = v_key::uuid;
        if v_existing_legion is not null then
          return jsonb_build_object('ok', false, 'code', 'ROLE_KEY_OWNERSHIP_INVALID', 'path', format('roles[%s].roleKey', v_idx));
        end if;
      end if;
    end if;
    v_role_id := coalesce(v_role_id, gen_random_uuid());
    v_role_map := v_role_map || jsonb_build_object(v_key, v_role_id::text);
    v_normalized_roles := v_normalized_roles || jsonb_build_array(jsonb_build_object(
      'roleId', v_role_id,
      'stageNo', v_entry->'stageNo',
      'slotNo', v_entry->'slotNo',
      'roleName', v_entry->>'roleName',
      'maxMembers', case when v_entry ? 'maxMembers' then v_entry->'maxMembers' else 'null'::jsonb end,
      'sortOrder', coalesce(v_entry->'sortOrder', to_jsonb(v_idx))
    ));
  end loop;

  for v_entry, v_idx in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_assignments) with ordinality
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_ASSIGNMENT_SHAPE', 'path', format('assignments[%s]', v_idx));
    end if;
    v_key := nullif(btrim(v_entry->>'roleKey'), '');
    if v_key is null or not (v_role_map ? v_key) then
      return jsonb_build_object('ok', false, 'code', 'ROLE_NOT_FOUND', 'path', format('assignments[%s].roleKey', v_idx));
    end if;
    v_parent_key := nullif(btrim(v_entry->>'parentRoleKey'), '');
    if v_parent_key is not null and not (v_role_map ? v_parent_key) then
      return jsonb_build_object('ok', false, 'code', 'PARENT_ROLE_NOT_FOUND', 'path', format('assignments[%s].parentRoleKey', v_idx));
    end if;
    v_normalized_assignments := v_normalized_assignments || jsonb_build_array(jsonb_build_object(
      'characterId', v_entry->'characterId',
      'roleId', v_role_map->>v_key,
      'parentRoleId', case when v_parent_key is null then 'null'::jsonb else to_jsonb(v_role_map->>v_parent_key) end,
      'sortOrder', coalesce(v_entry->'sortOrder', to_jsonb(v_idx))
    ));
  end loop;

  v_validation := private.kinojo_legion_tree_validate_v365(
    p_legion_name,
    p_stage_count,
    v_normalized_roles,
    v_normalized_assignments
  );
  if coalesce((v_validation->>'ok')::boolean, false) is not true then
    return v_validation;
  end if;

  if exists (
    select stage_no
      from generate_series(1, p_stage_count) stage_no
     where not exists (
       select 1
         from jsonb_array_elements(v_normalized_roles) r
        where (r->>'stageNo')::integer = stage_no
     )
  ) then
    return jsonb_build_object('ok', false, 'code', 'STAGE_ROLE_REQUIRED', 'message', '각 단계에는 직급이 하나 이상 필요합니다.');
  end if;

  v_cas := private.kinojo_legion_tree_config_cas_v363(
    p_legion_name,
    p_expected_revision,
    p_stage_count::smallint,
    v_actor
  );
  if coalesce((v_cas->>'ok')::boolean, false) is not true then
    return v_cas;
  end if;

  update private.legion_tree_configs
     set stage_names = p_stage_names
   where legion_name = p_legion_name;

  delete from private.legion_tree_assignments where legion_name = p_legion_name;
  delete from private.legion_tree_roles where legion_name = p_legion_name;

  insert into private.legion_tree_roles(
    role_id, legion_name, stage_no, slot_no, role_name, max_members, sort_order
  )
  select
    (r->>'roleId')::uuid,
    p_legion_name,
    (r->>'stageNo')::smallint,
    (r->>'slotNo')::smallint,
    btrim(r->>'roleName'),
    case when jsonb_typeof(r->'maxMembers') = 'null' then null else (r->>'maxMembers')::integer end,
    (r->>'sortOrder')::integer
  from jsonb_array_elements(v_normalized_roles) r;

  insert into private.legion_tree_assignments(
    legion_name, character_id, role_id, sort_order, parent_role_id
  )
  select
    p_legion_name,
    (a->>'characterId')::bigint,
    (a->>'roleId')::uuid,
    (a->>'sortOrder')::integer,
    case when jsonb_typeof(a->'parentRoleId') = 'null' then null else (a->>'parentRoleId')::uuid end
  from jsonb_array_elements(v_normalized_assignments) a;

  return jsonb_build_object(
    'ok', true,
    'code', 'ORGANIZATION_SAVED',
    'contract', 'legion-tree-organization-save-v1',
    'databaseContract', '453',
    'legionName', p_legion_name,
    'previousRevision', p_expected_revision,
    'revision', (v_cas->>'revision')::bigint,
    'roleCount', jsonb_array_length(v_normalized_roles),
    'assignmentCount', jsonb_array_length(v_normalized_assignments),
    'resetToDefault', false
  );
end;
$$;

create or replace function public.kinojo_legion_tree_organization_save_v453(
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
set statement_timeout = '4s'
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
  return private.kinojo_legion_tree_save_core_v453(
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
        when lr.organization_configured then private.kinojo_legion_tree_configured_stages_v453(lr.legion_name, lr.stage_count, lr.stage_names)
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
    'databaseContract', '453',
    'memberSourceContract', '352',
    'fallbackContract', '355',
    'revisionContract', '363',
    'integrityContract', '365',
    'saveContract', '453',
    'source', 'server_legion_tree',
    'generatedAt', current_timestamp,
    'legionOrder', jsonb_build_array('깡', '낮', '밤', '키나노동조합'),
    'structureContract', jsonb_build_object(
      'version', '1',
      'memberPath', 'legions[].stages[].roles[].groups[].members[]',
      'directRoleMembers', false,
      'roleKeyType', 'opaque_string',
      'groupKeyType', 'opaque_string',
      'defaultFallback', '군단장 > 엘리트장교 > 군단병',
      'revisionPath', 'legions[].revision',
      'fallbackRevision', 0,
      'integrityValidation', 'server_precommit',
      'parentContract', 'immediate_upper_required'
    ),
    'legions', v_legions
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'contract', 'web-legion-tree-v1',
    'databaseContract', '453',
    'code', 'LEGION_TREE_READ_FAILED',
    'message', '레기온 트리를 불러오지 못했습니다.'
  );
end;
$$;

revoke all on function private.kinojo_legion_tree_configured_stages_v453(text, integer, jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_save_core_v453(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function private.kinojo_legion_tree_configured_stages_v453(text, integer, jsonb) to postgres, service_role;
grant execute on function private.kinojo_legion_tree_save_core_v453(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

revoke all on function public.kinojo_legion_tree_organization_save_v453(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_organization_save_v453(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

revoke all on function public.kinojo_web_get_legion_tree() from public;
grant execute on function public.kinojo_web_get_legion_tree() to anon, authenticated, service_role;

comment on function public.kinojo_legion_tree_organization_save_v453(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean)
is 'Server-only Legion Tree organization save/reset boundary with KWS session revalidation, revision CAS, validation, and one transaction.';
