-- KINOJO Legion Tree · explicit unaffiliated departments · DB contract 459

create or replace function private.kinojo_legion_tree_save_core_v459(
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
  v_legacy_assignments jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if coalesce(p_reset_to_default, false)
     or p_assignments is null
     or jsonb_typeof(p_assignments) <> 'array'
     or p_roles is null
     or jsonb_typeof(p_roles) <> 'array' then
    v_result := private.kinojo_legion_tree_save_core_v453(
      p_actor, p_legion_name, p_expected_revision, p_stage_count,
      p_stage_names, p_roles, p_assignments, p_reset_to_default
    );
    return v_result || jsonb_build_object(
      'databaseContract', '459',
      'affiliationContract', 'immediate_upper_or_explicit_unaffiliated'
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

    v_unaffiliated := coalesce((v_entry->>'unaffiliated')::boolean, false);
    v_parent_key := nullif(btrim(v_entry->>'parentRoleKey'), '');
    if v_unaffiliated and v_parent_key is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'AFFILIATION_CONFLICT',
        'path', format('assignments[%s].parentRoleKey', v_idx),
        'message', '상위 소속과 소속 외를 동시에 지정할 수 없습니다.'
      );
    end if;

    if v_unaffiliated then
      v_role_key := nullif(btrim(v_entry->>'roleKey'), '');
      select case
               when pg_input_is_valid(r.value->>'stageNo', 'integer') then (r.value->>'stageNo')::integer
               else null
             end
        into v_role_stage
        from jsonb_array_elements(p_roles) with ordinality r(value, ordinality)
       where nullif(btrim(r.value->>'roleKey'), '') = v_role_key
       order by r.ordinality
       limit 1;

      if v_role_stage is null then
        return jsonb_build_object('ok', false, 'code', 'ROLE_NOT_FOUND', 'path', format('assignments[%s].roleKey', v_idx));
      end if;
      if v_role_stage = 1 then
        return jsonb_build_object(
          'ok', false,
          'code', 'UNAFFILIATED_NOT_ALLOWED_TOP_STAGE',
          'path', format('assignments[%s].unaffiliated', v_idx),
          'message', '최상위 단계에는 소속 외를 지정할 수 없습니다.'
        );
      end if;

      select nullif(btrim(r.value->>'roleKey'), '')
        into v_parent_key
        from jsonb_array_elements(p_roles) with ordinality r(value, ordinality)
       where pg_input_is_valid(r.value->>'stageNo', 'integer')
         and (r.value->>'stageNo')::integer = v_role_stage - 1
       order by r.ordinality
       limit 1;
      if v_parent_key is null then
        return jsonb_build_object('ok', false, 'code', 'PARENT_ROLE_NOT_FOUND', 'path', format('assignments[%s].unaffiliated', v_idx));
      end if;

      v_legacy_assignments := v_legacy_assignments || jsonb_build_array(
        jsonb_set(v_entry - 'unaffiliated', '{parentRoleKey}', to_jsonb(v_parent_key), true)
      );
    else
      v_legacy_assignments := v_legacy_assignments || jsonb_build_array(v_entry - 'unaffiliated');
    end if;
  end loop;

  v_result := private.kinojo_legion_tree_save_core_v453(
    p_actor,
    p_legion_name,
    p_expected_revision,
    p_stage_count,
    p_stage_names,
    p_roles,
    v_legacy_assignments,
    false
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result || jsonb_build_object(
      'databaseContract', '459',
      'affiliationContract', 'immediate_upper_or_explicit_unaffiliated'
    );
  end if;

  update private.legion_tree_assignments a
     set parent_role_id = null
   where a.legion_name = p_legion_name
     and a.character_id in (
       select (x.value->>'characterId')::bigint
         from jsonb_array_elements(p_assignments) x(value)
        where coalesce((x.value->>'unaffiliated')::boolean, false)
     );

  return v_result || jsonb_build_object(
    'databaseContract', '459',
    'affiliationContract', 'immediate_upper_or_explicit_unaffiliated'
  );
end;
$$;

create or replace function public.kinojo_legion_tree_organization_save_v459(
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
  return private.kinojo_legion_tree_save_core_v459(
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

revoke all on function private.kinojo_legion_tree_save_core_v459(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function private.kinojo_legion_tree_save_core_v459(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

revoke all on function public.kinojo_legion_tree_organization_save_v459(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_organization_save_v459(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;

comment on function public.kinojo_legion_tree_organization_save_v459(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean)
is 'Server-only Legion Tree organization save/reset boundary with explicit unaffiliated department validation and atomic parent-null persistence.';
