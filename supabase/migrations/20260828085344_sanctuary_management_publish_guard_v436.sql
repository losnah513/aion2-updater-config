-- Keep the final fixed-team creator and schedule-conflict publish guards in
-- production after the initial Stage 4 migration was applied.
-- This repeats only the v436 command definition; the public contract stays 436.

create or replace function public.kinojo_sanctuary_management_command_v436(
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
  v_schedule private.sanctuary_management_schedule_rules_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype;
  v_source private.sanctuary_management_slots_v412%rowtype;
  v_target private.sanctuary_management_slots_v412%rowtype;
  v_batch private.sanctuary_management_support_batches_v412%rowtype;
  v_item private.sanctuary_management_support_items_v412%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_character_id bigint;
  v_batch_id bigint;
  v_slot_id bigint;
  v_source_slot_id bigint;
  v_target_slot_id bigint;
  v_assignment jsonb;
  v_assignments jsonb;
  v_decision text;
  v_policy text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_force_count integer;
  v_party_count integer;
  v_slot_count integer;
  v_ready_force_count integer;
  v_distinct_creator_count integer;
  v_applied_count integer;
  v_pending_count integer;
  v_rejected_count integer;
  v_cancelled_count integer;
  v_batch_status text;
  v_result_code text;
  v_result_message text;
  v_conflicts jsonb;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  -- STAGE4_CREATOR_COMMAND_GATE: v413 intentionally made the first rollout
  -- manager-only. Stage 4 opens creation to every signed-in member, so creator
  -- commands use the original per-team v412 authorization after validating the
  -- stricter v435 topology and schedule contract here.
  if v_action = 'CREATE_TEAM' then
    v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy', 'INSTANT')));
    if upper(btrim(coalesce(p_payload->>'mode', ''))) not in ('FIXED', 'PARTICIPATION')
       or v_policy not in ('INSTANT', 'APPROVAL') then
      raise exception '고정·참여 팀과 참가 방식을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_payload->>'title', ''))) not between 1 and 80
       or char_length(btrim(coalesce(p_payload->>'activity', ''))) not between 1 and 24 then
      raise exception '팀 제목과 진행 내용을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    v_kind := upper(coalesce(p_payload->'schedule'->>'kind', ''));
    v_starts_on := nullif(p_payload->'schedule'->>'startsOn', '')::date;
    v_weekdays := coalesce(array(
      select distinct weekday::smallint
        from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays', '[]'::jsonb)) weekday
       order by weekday::smallint
    ), '{}'::smallint[]);
    v_starts_at := nullif(p_payload->'schedule'->>'startsAt', '')::time;
    v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes', '')::integer, 30);
    if v_starts_on is null or v_starts_at is null
       or v_kind not in ('ONCE', 'WEEKLY')
       or (v_kind = 'ONCE' and cardinality(v_weekdays) <> 0)
       or (v_kind = 'WEEKLY' and cardinality(v_weekdays) not between 1 and 7)
       or exists(select 1 from unnest(v_weekdays) weekday where weekday not between 1 and 7)
       or v_duration not between 30 and 720 or v_duration % 30 <> 0 then
      raise exception '1회성 또는 반복 일정과 30분 단위 진행 시간을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action,
      coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
        'joinPolicy', case when upper(p_payload->>'mode') = 'FIXED' then 'INSTANT' else v_policy end
      ), p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    select count(*)::integer into v_force_count from private.sanctuary_management_forces_v412 where team_id = v_team_id;
    select count(*)::integer into v_party_count from private.sanctuary_management_parties_v412 where team_id = v_team_id;
    select count(*)::integer into v_slot_count from private.sanctuary_management_slots_v412 where team_id = v_team_id;
    if v_force_count <> 1 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '첫 포스 구성이 완전하게 생성되지 않았습니다.' using errcode = 'P0001';
    end if;
    return v_response || jsonb_build_object('forceCount', 1, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'ADD_FORCE' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '포스를 추가할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.status <> 'DRAFT' then
      raise exception '팀 공개 전 DRAFT에서만 포스를 추가할 수 있습니다.' using errcode = 'P0001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_response := public.kinojo_sanctuary_management_command_v412(p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision);
    select count(*)::integer into v_force_count from private.sanctuary_management_forces_v412 where team_id = v_team_id;
    select count(*)::integer into v_party_count from private.sanctuary_management_parties_v412 where force_id = nullif(v_response->>'forceId', '')::bigint;
    select count(*)::integer into v_slot_count from private.sanctuary_management_slots_v412 where force_id = nullif(v_response->>'forceId', '')::bigint;
    if v_force_count not between 1 and 9 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '추가한 포스 구성이 올바르지 않습니다.' using errcode = 'P0001';
    end if;
    return v_response || jsonb_build_object('forceCount', v_force_count, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'PUBLISH_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is not null and v_team.team_mode = 'PARTICIPATION' then
      v_actor := private.kinojo_sm_actor_v412(p_credential);
      if not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
        raise exception '참여 팀을 공개할 권한이 없습니다.' using errcode = 'P0001';
      end if;
      if v_team.status <> 'DRAFT' then
        raise exception 'DRAFT 참여 팀만 처음 공개할 수 있습니다.' using errcode = 'P0001';
      end if;
      if p_expected_revision is null or v_team.revision <> p_expected_revision then
        raise exception '다른 사용자가 먼저 참여 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
      end if;

      select count(*)::integer,
             count(*) filter (where force_creator_count = 1)::integer,
             count(distinct creator_character_id)::integer
        into v_force_count, v_ready_force_count, v_distinct_creator_count
        from (
          select f.force_id,
                 count(s.character_id) filter (where s.owner_member_id = v_team.creator_member_id) as force_creator_count,
                 min(s.character_id) filter (where s.owner_member_id = v_team.creator_member_id) as creator_character_id
            from private.sanctuary_management_forces_v412 f
            left join private.sanctuary_management_slots_v412 s on s.force_id = f.force_id and s.character_id is not null
           where f.team_id = v_team_id
           group by f.force_id
        ) creator_forces;
      if v_force_count not between 1 and 9
         or v_ready_force_count <> v_force_count
         or v_distinct_creator_count <> v_force_count then
        raise exception '참여 팀은 포스마다 서로 다른 생성자 캐릭터 1개를 먼저 추가해야 합니다.' using errcode = 'P0001';
      end if;
      v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
      if jsonb_array_length(v_conflicts) > 0 then
        raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
      end if;
      v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
      perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
      return public.kinojo_sanctuary_management_command_v412(
        p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
      ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
    end if;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '팀을 공개할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.status <> 'DRAFT' or p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    if v_team.team_mode = 'FIXED' and not exists(
      select 1 from private.sanctuary_management_slots_v412 s
       where s.team_id = v_team_id
         and s.character_id is not null
         and s.owner_member_id = v_team.creator_member_id
    ) then
      raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode = 'P0001';
    end if;
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'SET_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is not null and v_team.team_mode = 'PARTICIPATION' and v_team.status = 'DRAFT'
       and p_payload->>'characterId' is not null then
      v_actor := private.kinojo_sm_actor_v412(p_credential);
      if not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
        raise exception '참여 팀 편성을 수정할 권한이 없습니다.' using errcode = 'P0001';
      end if;
      v_character_id := nullif(p_payload->>'characterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_team.creator_member_id then
        raise exception '참여 팀 공개 전에는 팀 생성자의 캐릭터만 선배치할 수 있습니다.' using errcode = 'P0001';
      end if;
      if exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.team_id = v_team_id and s.character_id = v_character_id
      ) then
        raise exception '각 포스에는 서로 다른 생성자 캐릭터를 추가해 주세요.' using errcode = 'P0001';
      end if;
    end if;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'ARCHIVE_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '팀을 해산할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'MOVE_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' then
      return public.kinojo_sanctuary_management_command_v435(
        p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
      ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
    end if;
  elsif v_action not in ('UPDATE_PARTICIPATION_TEAM', 'SUBMIT_SUPPORT', 'DECIDE_SUPPORT', 'CANCEL_SUPPORT') then
    return public.kinojo_sanctuary_management_command_v435(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then
    raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 436));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload || jsonb_build_object('replayed', true, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'UPDATE_PARTICIPATION_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '참여 팀을 수정할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '운영 중인 참여 팀만 이 작업으로 수정할 수 있습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 참여 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');

    select * into v_sanctuary
      from public.sanctuary_master
     where code = btrim(p_payload->>'sanctuaryCode') and management_visible;
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
    v_weekdays := coalesce(array(
      select distinct weekday::smallint
        from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays', '[]'::jsonb)) weekday
       order by weekday::smallint
    ), '{}'::smallint[]);
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

    select to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(r)) into v_before
      from private.sanctuary_management_schedule_rules_v412 r where r.team_id = v_team_id;
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
           status = 'ACTIVE',
           updated_at = clock_timestamp()
     where team_id = v_team_id
     returning * into v_schedule;
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    v_after := to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(v_schedule));
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'revision', v_team.revision, 'scheduleRevision', v_schedule.revision, 'joinPolicy', v_team.join_policy
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'MOVE_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '참여 팀 편성을 수정할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('DRAFT', 'ACTIVE', 'FULL') then
      raise exception '현재 편집할 수 없는 참여 팀입니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_source_slot_id := nullif(p_payload->>'fromSlotId', '')::bigint;
    v_target_slot_id := nullif(p_payload->>'toSlotId', '')::bigint;
    if v_source_slot_id is null or v_target_slot_id is null or v_source_slot_id = v_target_slot_id then
      raise exception '이동할 출발 슬롯과 도착 슬롯을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    perform 1
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id and slot_id in (v_source_slot_id, v_target_slot_id)
     order by slot_id for update;
    select * into v_source from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_source_slot_id;
    select * into v_target from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_target_slot_id;
    if v_source.slot_id is null or v_target.slot_id is null or v_source.character_id is null then
      raise exception '이동할 캐릭터와 대상 슬롯을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    v_before := jsonb_build_object('from', to_jsonb(v_source), 'to', to_jsonb(v_target));
    update private.sanctuary_management_slots_v412
       set character_id = null, owner_member_id = null, owner_root_character_id = null,
           character_relation = null, added_by_member_id = v_actor_id
     where slot_id in (v_source_slot_id, v_target_slot_id);
    update private.sanctuary_management_slots_v412
       set character_id = v_source.character_id, owner_member_id = v_source.owner_member_id,
           owner_root_character_id = v_source.owner_root_character_id, character_relation = v_source.character_relation,
           added_by_member_id = v_source.added_by_member_id
     where slot_id = v_target_slot_id;
    if v_target.character_id is not null then
      update private.sanctuary_management_slots_v412
         set character_id = v_target.character_id, owner_member_id = v_target.owner_member_id,
             owner_root_character_id = v_target.owner_root_character_id, character_relation = v_target.character_relation,
             added_by_member_id = v_target.added_by_member_id
       where slot_id = v_source_slot_id;
    end if;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    update private.sanctuary_management_teams_v412 set updated_at = clock_timestamp()
     where team_id = v_team_id returning * into v_team;
    v_after := jsonb_build_object(
      'from', (select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id = v_source_slot_id),
      'to', (select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id = v_target_slot_id)
    );
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'fromSlotId', v_source_slot_id, 'toSlotId', v_target_slot_id, 'revision', v_team.revision
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SLOT', v_target_slot_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'SUBMIT_SUPPORT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '현재 지원할 수 없는 팀입니다.' using errcode = 'P0001';
    end if;
    v_assignments := coalesce(p_payload->'assignments', '[]'::jsonb);
    if jsonb_typeof(v_assignments) <> 'array' or jsonb_array_length(v_assignments) not between 1 and 9 then
      raise exception '지원할 포스와 캐릭터를 하나 이상 선택해 주세요.' using errcode = 'P0001';
    end if;
    if (
      select count(distinct nullif(item->>'forceId', '')::bigint) <> count(*)
          or count(distinct nullif(item->>'characterId', '')::bigint) <> count(*)
        from jsonb_array_elements(v_assignments) item
    ) then
      raise exception '포스와 캐릭터는 1:1로 중복 없이 선택해 주세요.' using errcode = 'P0001';
    end if;

    insert into private.sanctuary_management_support_batches_v412(
      team_id, requester_member_id, request_key, status
    ) values (
      v_team_id, v_actor_id, v_request_key, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end
    ) returning * into v_batch;
    v_batch_id := v_batch.support_batch_id;

    for v_assignment in
      select item from jsonb_array_elements(v_assignments) with ordinality as assignment_list(item, assignment_order)
       order by assignment_order
    loop
      v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if v_force_id is null or v_character_id is null
         or not exists(
           select 1 from private.sanctuary_management_forces_v412 f
            where f.force_id = v_force_id and f.team_id = v_team_id
         ) then
        raise exception '지원할 포스와 캐릭터 식별값을 다시 확인해 주세요.' using errcode = 'P0001';
      end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id then
        raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;

      v_result_code := null;
      v_result_message := null;
      v_slot_id := null;
      if exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.team_id = v_team_id and s.character_id = v_character_id
      ) then
        v_result_code := 'CHARACTER_ALREADY_IN_TEAM';
        v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
      elsif exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.force_id = v_force_id and s.owner_member_id = v_actor_id and s.character_id is not null
      ) then
        v_result_code := 'OWNER_ALREADY_IN_FORCE';
        v_result_message := '이 포스에는 이미 본인의 캐릭터가 참여하고 있습니다.';
      elsif exists(
        select 1
          from private.sanctuary_management_support_items_v412 i
          join private.sanctuary_management_support_batches_v412 b on b.support_batch_id = i.support_batch_id
         where b.team_id = v_team_id
           and b.requester_member_id = v_actor_id
           and i.force_id = v_force_id
           and i.status = 'PENDING'
      ) then
        v_result_code := 'SUPPORT_ALREADY_PENDING';
        v_result_message := '이 포스에는 이미 승인 대기 중인 지원이 있습니다.';
      else
        v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_actor_id, v_owner.root_character_id);
        if jsonb_array_length(v_conflicts) > 0 then
          v_result_code := 'SCHEDULE_CONFLICT';
          v_result_message := v_conflicts->0->>'message';
        end if;
      end if;

      if v_result_code is null and v_team.join_policy = 'INSTANT' then
        select s.slot_id into v_slot_id
          from private.sanctuary_management_slots_v412 s
          join private.sanctuary_management_parties_v412 p on p.party_id = s.party_id
         where s.force_id = v_force_id and s.character_id is null
         order by p.party_no, s.slot_no
         limit 1
         for update of s;
        if v_slot_id is null then
          v_result_code := 'FORCE_FULL';
          v_result_message := '선택한 포스의 빈자리가 없습니다.';
        else
          update private.sanctuary_management_slots_v412
             set character_id = v_character_id,
                 owner_member_id = v_actor_id,
                 owner_root_character_id = v_owner.root_character_id,
                 character_relation = v_owner.relation,
                 added_by_member_id = v_actor_id
           where slot_id = v_slot_id;
        end if;
      end if;

      insert into private.sanctuary_management_support_items_v412(
        support_batch_id, force_id, character_id, owner_member_id, owner_root_character_id,
        status, applied_slot_id, result_code, result_message
      ) values (
        v_batch_id, v_force_id, v_character_id, v_actor_id, v_owner.root_character_id,
        case
          when v_result_code is not null then 'REJECTED'
          when v_team.join_policy = 'INSTANT' then 'APPLIED'
          else 'PENDING'
        end,
        v_slot_id,
        coalesce(v_result_code, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING_APPROVAL' end),
        coalesce(v_result_message, case when v_team.join_policy = 'INSTANT' then '빈 슬롯에 즉시 배치했습니다.' else '팀 승인을 기다리고 있습니다.' end)
      );
    end loop;

    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'PENDING')::integer,
           count(*) filter (where status = 'REJECTED')::integer
      into v_applied_count, v_pending_count, v_rejected_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_team.join_policy = 'INSTANT' and v_applied_count > 0 and v_rejected_count = 0 then 'APPLIED'
      when v_team.join_policy = 'APPROVAL' and v_pending_count > 0 and v_rejected_count = 0 then 'PENDING'
      when (v_applied_count > 0 or v_pending_count > 0) and v_rejected_count > 0 then 'PARTIAL'
      else 'REJECTED'
    end;
    update private.sanctuary_management_support_batches_v412
       set status = v_batch_status, updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'joinPolicy', v_team.join_policy, 'batch', private.kinojo_sm_support_batch_payload_v436(v_batch_id)
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, null, v_response, v_request_key);

  elsif v_action = 'DECIDE_SUPPORT' then
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    v_decision := upper(btrim(coalesce(p_payload->>'decision', '')));
    if v_decision not in ('APPROVE', 'REJECT') then
      raise exception '승인 또는 거절을 선택해 주세요.' using errcode = 'P0001';
    end if;
    select * into v_batch
      from private.sanctuary_management_support_batches_v412
     where support_batch_id = v_batch_id
     for update;
    if v_batch.support_batch_id is null then
      raise exception '지원 요청을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    v_team_id := v_batch.team_id;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_batch.status not in ('PENDING', 'PARTIAL')
       or not exists(
         select 1 from private.sanctuary_management_support_items_v412 i
          where i.support_batch_id = v_batch_id and i.status = 'PENDING'
       ) then
      raise exception '이미 처리가 끝난 지원 요청입니다.' using errcode = 'P0001';
    end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);

    if v_decision = 'REJECT' then
      update private.sanctuary_management_support_items_v412
         set status = 'REJECTED',
             result_code = 'REJECTED_BY_MANAGER',
             result_message = coalesce(nullif(left(btrim(p_payload->>'note'), 240), ''), '팀 운영자가 지원을 거절했습니다.'),
             updated_at = clock_timestamp()
       where support_batch_id = v_batch_id and status = 'PENDING';
    else
      for v_item in
        select *
          from private.sanctuary_management_support_items_v412
         where support_batch_id = v_batch_id and status = 'PENDING'
         order by support_item_id
         for update
      loop
        v_result_code := null;
        v_result_message := null;
        v_slot_id := null;
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_item.character_id);
        if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_item.owner_member_id then
          v_result_code := 'CHARACTER_OWNERSHIP_CHANGED';
          v_result_message := '캐릭터 소유 관계가 변경되어 승인할 수 없습니다.';
        elsif exists(
          select 1 from private.sanctuary_management_slots_v412 s
           where s.team_id = v_team_id and s.character_id = v_item.character_id
        ) then
          v_result_code := 'CHARACTER_ALREADY_IN_TEAM';
          v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
        elsif exists(
          select 1 from private.sanctuary_management_slots_v412 s
           where s.force_id = v_item.force_id and s.owner_member_id = v_item.owner_member_id and s.character_id is not null
        ) then
          v_result_code := 'OWNER_ALREADY_IN_FORCE';
          v_result_message := '이 포스에는 이미 같은 이용자의 캐릭터가 참여하고 있습니다.';
        else
          v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_item.owner_member_id, v_item.owner_root_character_id);
          if jsonb_array_length(v_conflicts) > 0 then
            v_result_code := 'SCHEDULE_CONFLICT';
            v_result_message := v_conflicts->0->>'message';
          end if;
        end if;

        if v_result_code is null then
          select s.slot_id into v_slot_id
            from private.sanctuary_management_slots_v412 s
            join private.sanctuary_management_parties_v412 p on p.party_id = s.party_id
           where s.force_id = v_item.force_id and s.character_id is null
           order by p.party_no, s.slot_no
           limit 1
           for update of s;
          if v_slot_id is null then
            v_result_code := 'FORCE_FULL';
            v_result_message := '승인 시점에 포스의 빈자리가 모두 찼습니다.';
          else
            update private.sanctuary_management_slots_v412
               set character_id = v_item.character_id,
                   owner_member_id = v_item.owner_member_id,
                   owner_root_character_id = v_item.owner_root_character_id,
                   character_relation = v_owner.relation,
                   added_by_member_id = v_actor_id
             where slot_id = v_slot_id;
          end if;
        end if;

        update private.sanctuary_management_support_items_v412
           set status = case when v_result_code is null then 'APPLIED' else 'REJECTED' end,
               applied_slot_id = v_slot_id,
               result_code = coalesce(v_result_code, 'APPROVED'),
               result_message = coalesce(v_result_message, '팀 승인을 완료하고 빈 슬롯에 배치했습니다.'),
               updated_at = clock_timestamp()
         where support_item_id = v_item.support_item_id;
      end loop;
    end if;

    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'PENDING')::integer,
           count(*) filter (where status = 'REJECTED')::integer,
           count(*) filter (where status = 'CANCELLED')::integer
      into v_applied_count, v_pending_count, v_rejected_count, v_cancelled_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_pending_count > 0 then 'PARTIAL'
      when v_applied_count > 0 and (v_rejected_count > 0 or v_cancelled_count > 0) then 'PARTIAL'
      when v_applied_count > 0 then 'APPLIED'
      else 'REJECTED'
    end;
    update private.sanctuary_management_support_batches_v412
       set status = v_batch_status,
           decision_member_id = v_actor_id,
           decision_note = nullif(left(btrim(p_payload->>'note'), 240), ''),
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'decision', v_decision, 'batch', v_after
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'CANCEL_SUPPORT' then
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    select * into v_batch
      from private.sanctuary_management_support_batches_v412
     where support_batch_id = v_batch_id
     for update;
    if v_batch.support_batch_id is null or v_batch.requester_member_id <> v_actor_id then
      raise exception '본인의 지원 요청만 취소할 수 있습니다.' using errcode = 'P0001';
    end if;
    v_team_id := v_batch.team_id;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if not exists(
      select 1 from private.sanctuary_management_support_items_v412 i
       where i.support_batch_id = v_batch_id and i.status = 'PENDING'
    ) then
      raise exception '취소할 승인 대기 지원이 없습니다.' using errcode = 'P0001';
    end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    update private.sanctuary_management_support_items_v412
       set status = 'CANCELLED',
           result_code = 'CANCELLED_BY_REQUESTER',
           result_message = '지원자가 승인 대기 요청을 취소했습니다.',
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id and status = 'PENDING';
    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'REJECTED')::integer
      into v_applied_count, v_rejected_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    update private.sanctuary_management_support_batches_v412
       set status = case when v_applied_count > 0 or v_rejected_count > 0 then 'PARTIAL' else 'CANCELLED' end,
           decision_member_id = v_actor_id,
           decision_note = '지원자 취소',
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id, 'batch', v_after
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);
  end if;

  insert into private.sanctuary_management_commands_v412(
    actor_member_id, request_key, action, request_hash, response_payload
  ) values (
    v_actor_id, v_request_key, v_action, v_hash, v_response
  );
  return v_response || jsonb_build_object('replayed', false, 'schemaVersion', 436, 'databaseContract', 436);
end;
$function$;
