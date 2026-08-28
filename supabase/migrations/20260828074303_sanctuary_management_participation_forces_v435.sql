-- Sanctuary management Stage 4-1: participation-team DRAFT and 1..9 forces.
--
-- PARTICIPATION_FORCE_BOUNDARY:
-- - CREATE_TEAM remains the single transaction that creates a team, its schedule,
--   force 1, parties 1..2, and slots 1..5 for each party.
-- - ADD_FORCE remains serialized by the v412 team-row lock and rejects force 10.
-- - v435 verifies the resulting topology before returning so a partial force can
--   never become an accepted Server response.
-- - These RPCs are Edge-only. Browser roles must never execute them directly.

create or replace function public.kinojo_sanctuary_management_bootstrap_v435(p_credential text)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select public.kinojo_sanctuary_management_bootstrap_v433(p_credential)
    || jsonb_build_object('schemaVersion', 435, 'databaseContract', 435);
$function$;

create or replace function public.kinojo_sanctuary_management_command_v435(
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
  v_team_id bigint;
  v_mode text;
  v_policy text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_force_count integer;
  v_party_count integer;
  v_slot_count integer;
  v_conflicts jsonb;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  if v_action = 'CREATE_TEAM' then
    v_mode := upper(btrim(coalesce(p_payload->>'mode', '')));
    v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy', 'INSTANT')));
    if v_mode not in ('FIXED', 'PARTICIPATION') then
      raise exception '고정 팀 또는 참여 팀 생성 방식을 선택해 주세요.' using errcode = 'P0001';
    end if;
    if v_policy not in ('INSTANT', 'APPROVAL') then
      raise exception '즉시 참가 또는 승인 참가 방식을 선택해 주세요.' using errcode = 'P0001';
    end if;

    v_response := public.kinojo_sanctuary_management_command_v433(
      p_credential,
      p_request_key,
      v_action,
      coalesce(p_payload, '{}'::jsonb)
        || jsonb_build_object(
          'mode', v_mode,
          'joinPolicy', case when v_mode = 'FIXED' then 'INSTANT' else v_policy end
        ),
      p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;

    select count(*)::integer into v_force_count
      from private.sanctuary_management_forces_v412
     where team_id = v_team_id;
    select count(*)::integer into v_party_count
      from private.sanctuary_management_parties_v412
     where team_id = v_team_id;
    select count(*)::integer into v_slot_count
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id;
    if v_force_count <> 1 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '첫 포스 구성이 완전하게 생성되지 않았습니다.' using errcode = 'P0001';
    end if;

    return v_response || jsonb_build_object(
      'teamMode', v_mode,
      'joinPolicy', case when v_mode = 'FIXED' then 'INSTANT' else v_policy end,
      'forceCount', v_force_count,
      'schemaVersion', 435,
      'databaseContract', 435
    );
  end if;

  if v_action = 'ADD_FORCE' then
    v_response := public.kinojo_sanctuary_management_command_v433(
      p_credential,
      p_request_key,
      v_action,
      coalesce(p_payload, '{}'::jsonb),
      p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;

    select count(*)::integer into v_force_count
      from private.sanctuary_management_forces_v412
     where team_id = v_team_id;
    select count(*)::integer into v_party_count
      from private.sanctuary_management_parties_v412
     where force_id = nullif(v_response->>'forceId', '')::bigint;
    select count(*)::integer into v_slot_count
      from private.sanctuary_management_slots_v412
     where force_id = nullif(v_response->>'forceId', '')::bigint;
    if v_force_count not between 1 and 9 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '추가한 포스 구성이 올바르지 않습니다.' using errcode = 'P0001';
    end if;

    return v_response || jsonb_build_object(
      'forceCount', v_force_count,
      'schemaVersion', 435,
      'databaseContract', 435
    );
  end if;

  if v_action <> 'UPDATE_PARTICIPATION_TEAM_DRAFT' then
    return public.kinojo_sanctuary_management_command_v433(
      p_credential,
      p_request_key,
      v_action,
      coalesce(p_payload, '{}'::jsonb),
      p_expected_revision
    ) || jsonb_build_object('schemaVersion', 435, 'databaseContract', 435);
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then
    raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception '참여 팀 초안 revision이 필요합니다.' using errcode = 'P0001';
  end if;

  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 435));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id
     and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload
      || jsonb_build_object('replayed', true, 'schemaVersion', 435, 'databaseContract', 435);
  end if;

  v_team_id := nullif(p_payload->>'teamId', '')::bigint;
  select * into v_team
    from private.sanctuary_management_teams_v412
   where team_id = v_team_id
   for update;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
    raise exception '참여 팀 초안을 수정할 권한이 없습니다.' using errcode = 'P0001';
  end if;
  if v_team.status <> 'DRAFT' or v_team.team_mode <> 'PARTICIPATION' then
    raise exception '참여 팀 DRAFT만 이 작업으로 수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_team.revision <> p_expected_revision then
    raise exception '다른 사용자가 먼저 참여 팀 초안을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
  end if;
  perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');

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

  v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy', 'INSTANT')));
  if v_policy not in ('INSTANT', 'APPROVAL') then
    raise exception '즉시 참가 또는 승인 참가 방식을 선택해 주세요.' using errcode = 'P0001';
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
         join_policy = v_policy,
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
    raise exception '참여 팀 초안 일정을 찾을 수 없습니다.' using errcode = 'P0001';
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
    'scheduleRevision', v_schedule.revision,
    'joinPolicy', v_team.join_policy,
    'schemaVersion', 435,
    'databaseContract', 435
  );
  perform private.kinojo_sm_audit_v412(
    v_actor_id,
    v_team_id,
    'TEAM',
    v_team_id,
    v_action,
    v_before,
    v_after,
    v_request_key
  );
  insert into private.sanctuary_management_commands_v412(
    actor_member_id,
    request_key,
    action,
    request_hash,
    response_payload
  ) values (
    v_actor_id,
    v_request_key,
    v_action,
    v_hash,
    v_response
  );
  return v_response || jsonb_build_object('replayed', false);
end;
$function$;

revoke all on function public.kinojo_sanctuary_management_bootstrap_v435(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v435(text, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v435(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v435(text, text, text, jsonb, bigint) to service_role;
