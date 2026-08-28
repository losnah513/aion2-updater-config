-- Sanctuary management Stage 3 completion contract.
--
-- CODEX_ADMIN_ROLE: ADMIN is a raw, non-assignable service account role. It is
-- intentionally normalized to MASTER for authorization, but member-list v433
-- hides its row unless the viewer's *raw* role is MASTER. Never store or print
-- the dedicated pass key in source, migrations, logs, tests, or documentation.

create or replace function public.kinojo_normalize_role(p_role text, p_level integer default 0)
returns text
language sql
immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select case
    when upper(replace(coalesce(p_role, ''), ' ', '_')) in ('MASTER', 'ADMIN') then 'MASTER'
    when upper(replace(coalesce(p_role, ''), ' ', '_')) in ('SUB_MASTER', 'SUBMASTER') then 'SUB_MASTER'
    when upper(replace(coalesce(p_role, ''), ' ', '_')) = 'MANAGER' then 'MANAGER'
    when upper(replace(coalesce(p_role, ''), ' ', '_')) = 'STAFF' then 'STAFF'
    when upper(replace(coalesce(p_role, ''), ' ', '_')) in ('MEMBER', 'TESTER') then 'MEMBER'
    when upper(replace(coalesce(p_role, ''), ' ', '_')) = 'GUEST' then 'GUEST'
    else public.kinojo_member_role_from_level(p_level)
  end;
$function$;

create or replace function public.kinojo_admin_member_list_v433(
  p_pass_key text,
  p_limit integer default 20,
  p_cursor text default null,
  p_query text default null,
  p_role text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_result jsonb;
  v_actor_id bigint;
  v_actor_raw_role text;
  v_accounts jsonb;
  v_removed integer := 0;
begin
  v_result := public.kinojo_admin_member_list_v428(p_pass_key, p_limit, p_cursor, p_query, p_role);
  v_actor_id := nullif(v_result->'actor'->>'memberId', '')::bigint;

  select upper(replace(coalesce(role, ''), ' ', '_'))
    into v_actor_raw_role
    from public.member_codes
   where id = v_actor_id;

  if v_actor_raw_role = 'MASTER' then
    return jsonb_set(v_result, '{databaseContract}', to_jsonb(433), true);
  end if;

  select count(*)::integer
    into v_removed
    from jsonb_array_elements(coalesce(v_result->'accounts', '[]'::jsonb))
      with ordinality as listed(account_item, account_order)
    join public.member_codes mc
      on mc.id = nullif(account_item->>'memberId', '')::bigint
   where upper(replace(coalesce(mc.role, ''), ' ', '_')) = 'ADMIN';

  select coalesce(jsonb_agg(account_item order by account_order), '[]'::jsonb)
    into v_accounts
    from jsonb_array_elements(coalesce(v_result->'accounts', '[]'::jsonb))
      with ordinality as listed(account_item, account_order)
   where not exists(
     select 1
       from public.member_codes mc
      where mc.id = nullif(account_item->>'memberId', '')::bigint
        and upper(replace(coalesce(mc.role, ''), ' ', '_')) = 'ADMIN'
   );

  v_result := jsonb_set(v_result, '{accounts}', v_accounts, true);
  v_result := jsonb_set(
    v_result,
    '{pageInfo,returnedCount}',
    to_jsonb(jsonb_array_length(v_accounts)),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{pageInfo,totalCount}',
    to_jsonb(greatest(coalesce((v_result->'pageInfo'->>'totalCount')::integer, 0) - v_removed, 0)),
    true
  );
  return jsonb_set(v_result, '{databaseContract}', to_jsonb(433), true);
end;
$function$;

create or replace function private.kinojo_sm_team_conflicts_v433(p_team_id bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select coalesce(jsonb_agg(conflict_item order by slot_id, conflict_order), '[]'::jsonb)
  from (
    select slot.slot_id,
           conflict_order,
           conflict_item
    from private.sanctuary_management_slots_v412 slot
    cross join lateral jsonb_array_elements(
      private.kinojo_sm_conflicts_for_participant_v412(
        p_team_id,
        slot.owner_member_id,
        slot.owner_root_character_id
      )
    ) with ordinality as conflict(conflict_item, conflict_order)
    where slot.team_id = p_team_id
      and slot.character_id is not null
  ) conflicts;
$function$;

create or replace function private.kinojo_sm_assert_lease_v433(
  p_actor_member_id bigint,
  p_team_id bigint,
  p_lease_token text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
declare
  v_hash text;
begin
  if char_length(btrim(coalesce(p_lease_token, ''))) < 32 then
    raise exception '편집 잠금 토큰이 올바르지 않습니다.' using errcode = 'P0001';
  end if;

  v_hash := encode(sha256(convert_to(p_lease_token, 'UTF8')), 'hex');
  if not exists(
    select 1
      from private.sanctuary_management_edit_leases_v412 lease
     where lease.team_id = p_team_id
       and lease.actor_member_id = p_actor_member_id
       and lease.lease_token_hash = v_hash
       and lease.expires_at > clock_timestamp()
  ) then
    raise exception '편집 잠금이 만료되었습니다. 다시 열어 주세요.' using errcode = '55P03';
  end if;
end;
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v433(p_credential text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_response jsonb;
  v_actor jsonb;
  v_teams jsonb;
begin
  v_response := public.kinojo_sanctuary_management_bootstrap_v432(p_credential);
  v_actor := coalesce(v_response->'actor', '{}'::jsonb);

  if coalesce((v_response->>'readEnabled')::boolean, false) then
    select coalesce(
      jsonb_agg(
        team_item || jsonb_build_object(
          'canEdit', private.kinojo_sm_can_manage_team_v412(v_actor, (team_item->>'teamId')::bigint)
        )
        order by team_order
      ),
      '[]'::jsonb
    )
      into v_teams
      from jsonb_array_elements(coalesce(v_response->'teams', '[]'::jsonb))
        with ordinality as team_list(team_item, team_order);
    v_response := jsonb_set(v_response, '{teams}', v_teams, true);
  end if;

  return jsonb_set(v_response, '{schemaVersion}', to_jsonb(433), true);
end;
$function$;

create or replace function public.kinojo_sanctuary_management_command_v433(
  p_credential text,
  p_request_key text,
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype;
  v_schedule private.sanctuary_management_schedule_rules_v412%rowtype;
  v_source private.sanctuary_management_slots_v412%rowtype;
  v_target private.sanctuary_management_slots_v412%rowtype;
  v_team_id bigint;
  v_source_slot_id bigint;
  v_target_slot_id bigint;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_conflicts jsonb;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
  v_lease_token text;
begin
  if v_action = 'UPDATE_TEAM_DRAFT' then
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_response := public.kinojo_sanctuary_management_command_v432(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    );
    v_conflicts := private.kinojo_sm_team_conflicts_v433((v_response->>'teamId')::bigint);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    return v_response;
  end if;

  if v_action = 'PUBLISH_TEAM' then
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '팀을 공개할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.team_mode = 'FIXED'
       and not exists(
         select 1 from private.sanctuary_management_slots_v412 slot
          where slot.team_id = v_team_id
            and slot.character_id is not null
            and slot.owner_member_id = v_team.creator_member_id
       ) then
      raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    return public.kinojo_sanctuary_management_command_v432(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    );
  end if;

  if v_action in ('ADD_FORCE', 'SET_SLOT') then
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    return public.kinojo_sanctuary_management_command_v432(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    );
  end if;

  if v_action not in ('UPDATE_FIXED_TEAM', 'MOVE_SLOT') then
    return public.kinojo_sanctuary_management_command_v432(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    );
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then
    raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception '팀 revision이 필요합니다.' using errcode = 'P0001';
  end if;

  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 433));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id
     and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload || jsonb_build_object('replayed', true);
  end if;

  v_team_id := nullif(p_payload->>'teamId', '')::bigint;
  v_lease_token := p_payload->>'leaseToken';
  select * into v_team
    from private.sanctuary_management_teams_v412
   where team_id = v_team_id
   for update;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
    raise exception '고정 팀을 수정할 권한이 없습니다.' using errcode = 'P0001';
  end if;
  if v_team.team_mode <> 'FIXED' or v_team.status not in ('DRAFT', 'ACTIVE', 'FULL') then
    raise exception '현재 편집할 수 없는 고정 팀입니다.' using errcode = 'P0001';
  end if;
  if v_team.revision <> p_expected_revision then
    raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
  end if;
  perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, v_lease_token);

  if v_action = 'UPDATE_FIXED_TEAM' then
    select * into v_sanctuary
      from public.sanctuary_master
     where code = btrim(p_payload->>'sanctuaryCode')
       and management_visible;
    if v_sanctuary.id is null then
      raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_payload->>'title', ''))) not between 1 and 80
       or char_length(btrim(coalesce(p_payload->>'activity', ''))) not between 1 and 24 then
      raise exception '팀 제목과 진행 내용을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;

    v_kind := upper(coalesce(p_payload->'schedule'->>'kind', ''));
    v_starts_on := nullif(p_payload->'schedule'->>'startsOn', '')::date;
    v_weekdays := coalesce(
      array(
        select distinct weekday::smallint
          from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays', '[]'::jsonb)) weekday
         order by weekday::smallint
      ),
      '{}'::smallint[]
    );
    v_starts_at := nullif(p_payload->'schedule'->>'startsAt', '')::time;
    v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes', '')::integer, 30);
    if v_starts_on is null or v_starts_at is null
       or v_kind not in ('ONCE', 'WEEKLY')
       or (v_kind = 'ONCE' and cardinality(v_weekdays) <> 0)
       or (v_kind = 'WEEKLY' and cardinality(v_weekdays) not between 1 and 7) then
      raise exception '1회성 또는 반복 일정을 올바르게 입력해 주세요.' using errcode = 'P0001';
    end if;
    if v_duration not between 30 and 720 or v_duration % 30 <> 0 then
      raise exception '진행 시간은 30분부터 30분 단위로 입력해 주세요.' using errcode = 'P0001';
    end if;
    if v_sanctuary.available_from is not null and v_starts_on < v_sanctuary.available_from then
      raise exception '% 일정은 %부터 등록할 수 있습니다.', v_sanctuary.short_name, v_sanctuary.available_from using errcode = 'P0001';
    end if;

    select to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(schedule_row))
      into v_before
      from private.sanctuary_management_schedule_rules_v412 schedule_row
     where schedule_row.team_id = v_team_id;

    update private.sanctuary_management_teams_v412
       set sanctuary_id = v_sanctuary.id,
           title = btrim(p_payload->>'title'),
           activity = btrim(p_payload->>'activity'),
           updated_at = clock_timestamp()
     where team_id = v_team_id
     returning * into v_team;
    update private.sanctuary_management_schedule_rules_v412
       set schedule_kind = v_kind,
           starts_on = v_starts_on,
           weekdays = v_weekdays,
           starts_at = v_starts_at,
           duration_minutes = v_duration,
           status = 'ACTIVE'
     where team_id = v_team_id
     returning * into v_schedule;
    if v_schedule.schedule_id is null then
      raise exception '팀 일정을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    v_after := to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(v_schedule));
    v_response := jsonb_build_object(
      'ok', true,
      'action', v_action,
      'teamId', v_team_id,
      'revision', v_team.revision,
      'scheduleRevision', v_schedule.revision
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, v_action, v_before, v_after, v_request_key);
  else
    v_source_slot_id := nullif(p_payload->>'fromSlotId', '')::bigint;
    v_target_slot_id := nullif(p_payload->>'toSlotId', '')::bigint;
    if v_source_slot_id is null or v_target_slot_id is null or v_source_slot_id = v_target_slot_id then
      raise exception '이동할 출발 슬롯과 도착 슬롯을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;

    perform 1
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id
       and slot_id in (v_source_slot_id, v_target_slot_id)
     order by slot_id
     for update;
    select * into v_source from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_source_slot_id;
    select * into v_target from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_target_slot_id;
    if v_source.slot_id is null or v_target.slot_id is null then
      raise exception '선택한 슬롯을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if v_source.character_id is null then
      raise exception '캐릭터가 있는 슬롯을 먼저 선택해 주세요.' using errcode = 'P0001';
    end if;
    v_before := jsonb_build_object('from', to_jsonb(v_source), 'to', to_jsonb(v_target));

    update private.sanctuary_management_slots_v412
       set character_id = null,
           owner_member_id = null,
           owner_root_character_id = null,
           character_relation = null,
           added_by_member_id = v_actor_id
     where slot_id in (v_source_slot_id, v_target_slot_id);
    update private.sanctuary_management_slots_v412
       set character_id = v_source.character_id,
           owner_member_id = v_source.owner_member_id,
           owner_root_character_id = v_source.owner_root_character_id,
           character_relation = v_source.character_relation,
           added_by_member_id = v_source.added_by_member_id
     where slot_id = v_target_slot_id;
    if v_target.character_id is not null then
      update private.sanctuary_management_slots_v412
         set character_id = v_target.character_id,
             owner_member_id = v_target.owner_member_id,
             owner_root_character_id = v_target.owner_root_character_id,
             character_relation = v_target.character_relation,
             added_by_member_id = v_target.added_by_member_id
       where slot_id = v_source_slot_id;
    end if;

    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    update private.sanctuary_management_teams_v412
       set updated_at = clock_timestamp()
     where team_id = v_team_id
     returning * into v_team;
    v_after := jsonb_build_object(
      'from', (select to_jsonb(slot) from private.sanctuary_management_slots_v412 slot where slot.slot_id = v_source_slot_id),
      'to', (select to_jsonb(slot) from private.sanctuary_management_slots_v412 slot where slot.slot_id = v_target_slot_id)
    );
    v_response := jsonb_build_object(
      'ok', true,
      'action', v_action,
      'teamId', v_team_id,
      'fromSlotId', v_source_slot_id,
      'toSlotId', v_target_slot_id,
      'revision', v_team.revision
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SLOT', v_target_slot_id, v_action, v_before, v_after, v_request_key);
  end if;

  insert into private.sanctuary_management_commands_v412(
    actor_member_id, request_key, action, request_hash, response_payload
  ) values (
    v_actor_id, v_request_key, v_action, v_hash, v_response
  );
  return v_response || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.kinojo_admin_member_list_v433(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_list_v433(text, integer, text, text, text) to service_role;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v433(text) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v433(text) to service_role;
revoke all on function public.kinojo_sanctuary_management_command_v433(text, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_command_v433(text, text, text, jsonb, bigint) to service_role;
revoke all on function private.kinojo_sm_team_conflicts_v433(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_assert_lease_v433(bigint, bigint, text) from public, anon, authenticated;

update private.sanctuary_management_settings_v412
   set read_enabled = true,
       write_enabled = true,
       updated_at = clock_timestamp()
 where singleton;
