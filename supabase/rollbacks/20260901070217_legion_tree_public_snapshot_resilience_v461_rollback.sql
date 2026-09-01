-- Roll back Legion Tree internal read optimization 461 to organization DB460.

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

revoke all on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_organization_save_v460(text, text, bigint, integer, jsonb, jsonb, jsonb, boolean) to postgres, service_role;
revoke all on function public.kinojo_web_get_legion_tree() from public;
grant execute on function public.kinojo_web_get_legion_tree() to anon, authenticated, service_role;

drop function if exists private.kinojo_legion_tree_refresh_snapshot_v461(text);
drop function if exists private.kinojo_legion_tree_build_payload_v461();
drop function if exists private.kinojo_legion_tree_configured_stages_v461(text, integer, jsonb, jsonb);
drop function if exists private.kinojo_legion_tree_source_token_v461();
drop table if exists private.legion_tree_public_snapshot_v461;
drop index if exists public.idx_character_master_legion_tree_source_v461;

comment on function public.kinojo_web_get_legion_tree()
is 'Public organization DB460 read contract without the internal v461 snapshot optimization.';
