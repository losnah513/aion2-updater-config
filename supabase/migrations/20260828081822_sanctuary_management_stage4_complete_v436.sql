-- Sanctuary management Stage 4 completion: participation publishing, monthly
-- occurrences, multi-force support, instant/approval decisions, cancellation,
-- conflict details, and deterministic partial results.
--
-- STAGE4_SUPPORT_SERIALIZATION:
-- Every support submit/decision locks the team row before inspecting capacity.
-- That is the shared serialization boundary used by legacy v412 writers too, so
-- two users racing for the final slot cannot both be placed. Per-item business
-- failures are recorded instead of aborting otherwise valid assignments.
--
-- These SECURITY DEFINER functions are required because all source tables live
-- in the unexposed private schema. They use a pinned search_path, fully qualified
-- relations, and service-role-only public RPC grants. Browser roles must call the
-- sanctuary-management Edge Function and never these RPCs directly.

alter table private.sanctuary_management_support_items_v412
  add column if not exists result_code text,
  add column if not exists result_message text;

alter table private.sanctuary_management_support_items_v412
  drop constraint if exists sanctuary_management_support_items_v412_result_code_check,
  add constraint sanctuary_management_support_items_v412_result_code_check
    check (result_code is null or char_length(result_code) between 1 and 48),
  drop constraint if exists sanctuary_management_support_items_v412_result_message_check,
  add constraint sanctuary_management_support_items_v412_result_message_check
    check (result_message is null or char_length(result_message) <= 500);

create unique index if not exists sanctuary_management_support_items_v436_pending_owner_uq
  on private.sanctuary_management_support_items_v412(force_id, owner_member_id)
  where status = 'PENDING';

create index if not exists sanctuary_management_support_items_v436_batch_status_idx
  on private.sanctuary_management_support_items_v412(support_batch_id, status, support_item_id);

create or replace function private.kinojo_sm_creator_candidates_v436(
  p_team_id bigint,
  p_force_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_list jsonb;
  v_owner_resolved boolean := false;
  v_creator_assigned boolean := false;
  v_candidates jsonb := '[]'::jsonb;
begin
  select t.*
    into v_team
    from private.sanctuary_management_teams_v412 t
    join private.sanctuary_management_forces_v412 f on f.team_id = t.team_id
   where t.team_id = p_team_id
     and f.force_id = p_force_id;

  if v_team.team_id is null then
    return jsonb_build_object(
      'memberId', null,
      'ownerResolved', false,
      'ownerAlreadyAssigned', false,
      'code', 'CREATOR_CANDIDATE_TARGET_INVALID',
      'candidateCount', 0,
      'candidates', '[]'::jsonb
    );
  end if;

  if v_team.team_mode <> 'PARTICIPATION' then
    return private.kinojo_sm_creator_candidates_v431(p_team_id, p_force_id);
  end if;

  v_list := public.kinojo_member_character_list_v334(v_team.creator_member_id);
  v_owner_resolved := coalesce((v_list->>'ownerResolved')::boolean, false);
  if coalesce((v_list->>'ok')::boolean, false) is not true or not v_owner_resolved then
    return jsonb_build_object(
      'memberId', v_team.creator_member_id,
      'ownerResolved', false,
      'ownerAlreadyAssigned', false,
      'code', coalesce(nullif(v_list->>'code', ''), 'CREATOR_OWNER_NOT_RESOLVED'),
      'candidateCount', 0,
      'candidates', '[]'::jsonb
    );
  end if;

  select exists(
    select 1
      from private.sanctuary_management_slots_v412 s
     where s.force_id = p_force_id
       and s.owner_member_id = v_team.creator_member_id
       and s.character_id is not null
  ) into v_creator_assigned;

  if not v_creator_assigned then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'characterId', nullif(character_item->>'characterId', '')::bigint,
          'characterName', character_item->>'characterName',
          'serverId', nullif(character_item->>'serverId', '')::integer,
          'serverName', character_item->>'serverName',
          'className', character_item->>'className',
          'profileImageUrl', character_item->>'officialProfileImageUrl',
          'isMain', coalesce((character_item->>'isMain')::boolean, false),
          'relation', case when coalesce((character_item->>'isMain')::boolean, false) then 'MAIN' else 'ALT' end,
          'mainCharacterId', coalesce(
            nullif(character_item->>'mainCharacterId', '')::bigint,
            nullif(character_item->>'characterId', '')::bigint
          )
        )
        order by candidate_order
      ),
      '[]'::jsonb
    )
      into v_candidates
      from jsonb_array_elements(coalesce(v_list->'characters', '[]'::jsonb))
        with ordinality as candidates(character_item, candidate_order)
     where nullif(character_item->>'characterId', '')::bigint is not null
       and not exists(
         select 1
           from private.sanctuary_management_slots_v412 s
          where s.team_id = p_team_id
            and s.character_id = nullif(character_item->>'characterId', '')::bigint
       );
  end if;

  return jsonb_build_object(
    'memberId', v_team.creator_member_id,
    'ownerResolved', true,
    'ownerAlreadyAssigned', v_creator_assigned,
    'code', case when v_creator_assigned then 'CREATOR_ALREADY_ASSIGNED' else 'READY' end,
    'candidateCount', jsonb_array_length(v_candidates),
    'candidates', v_candidates
  );
end;
$function$;

create or replace function private.kinojo_sm_support_characters_v436(
  p_team_id bigint,
  p_actor_member_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_list jsonb;
  v_character jsonb;
  v_character_id bigint;
  v_root_id bigint;
  v_conflicts jsonb;
  v_used boolean;
  v_available_force_ids jsonb;
  v_characters jsonb := '[]'::jsonb;
  v_disabled_code text;
  v_disabled_message text;
begin
  select * into v_team
    from private.sanctuary_management_teams_v412
   where team_id = p_team_id;
  if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' then
    return jsonb_build_object('ownerResolved', false, 'code', 'TEAM_NOT_PARTICIPATION', 'candidateCount', 0, 'characters', '[]'::jsonb);
  end if;

  v_list := public.kinojo_member_character_list_v334(p_actor_member_id);
  if coalesce((v_list->>'ok')::boolean, false) is not true
     or coalesce((v_list->>'ownerResolved')::boolean, false) is not true then
    return jsonb_build_object(
      'ownerResolved', false,
      'code', coalesce(nullif(v_list->>'code', ''), 'SUPPORT_OWNER_NOT_RESOLVED'),
      'candidateCount', 0,
      'characters', '[]'::jsonb
    );
  end if;

  for v_character in
    select character_item
      from jsonb_array_elements(coalesce(v_list->'characters', '[]'::jsonb))
        with ordinality as character_list(character_item, character_order)
     order by character_order
  loop
    v_character_id := nullif(v_character->>'characterId', '')::bigint;
    if v_character_id is null then
      continue;
    end if;
    v_root_id := coalesce(nullif(v_character->>'mainCharacterId', '')::bigint, v_character_id);
    v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(p_team_id, p_actor_member_id, v_root_id);
    select exists(
      select 1 from private.sanctuary_management_slots_v412 s
       where s.team_id = p_team_id and s.character_id = v_character_id
    ) into v_used;

    select coalesce(jsonb_agg(f.force_id order by f.force_no), '[]'::jsonb)
      into v_available_force_ids
      from private.sanctuary_management_forces_v412 f
     where f.team_id = p_team_id
       and v_team.status in ('ACTIVE', 'FULL')
       and f.status = 'OPEN'
       and not v_used
       and jsonb_array_length(v_conflicts) = 0
       and exists(
         select 1 from private.sanctuary_management_slots_v412 s
          where s.force_id = f.force_id and s.character_id is null
       )
       and not exists(
         select 1 from private.sanctuary_management_slots_v412 s
          where s.force_id = f.force_id and s.owner_member_id = p_actor_member_id and s.character_id is not null
       )
       and not exists(
         select 1
           from private.sanctuary_management_support_items_v412 i
           join private.sanctuary_management_support_batches_v412 b on b.support_batch_id = i.support_batch_id
          where b.team_id = p_team_id
            and b.requester_member_id = p_actor_member_id
            and i.force_id = f.force_id
            and i.status = 'PENDING'
       );

    v_disabled_code := null;
    v_disabled_message := null;
    if v_team.status not in ('ACTIVE', 'FULL') then
      v_disabled_code := 'TEAM_NOT_ACTIVE';
      v_disabled_message := '아직 지원할 수 없는 팀입니다.';
    elsif v_used then
      v_disabled_code := 'CHARACTER_ALREADY_IN_TEAM';
      v_disabled_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
    elsif jsonb_array_length(v_conflicts) > 0 then
      v_disabled_code := 'SCHEDULE_CONFLICT';
      v_disabled_message := v_conflicts->0->>'message';
    elsif jsonb_array_length(v_available_force_ids) = 0 then
      v_disabled_code := 'NO_AVAILABLE_FORCE';
      v_disabled_message := '이 캐릭터로 지원할 수 있는 포스가 없습니다.';
    end if;

    v_characters := v_characters || jsonb_build_array(jsonb_build_object(
      'characterId', v_character_id,
      'characterName', v_character->>'characterName',
      'serverId', nullif(v_character->>'serverId', '')::integer,
      'serverName', v_character->>'serverName',
      'className', v_character->>'className',
      'profileImageUrl', v_character->>'officialProfileImageUrl',
      'isMain', coalesce((v_character->>'isMain')::boolean, false),
      'relation', case when coalesce((v_character->>'isMain')::boolean, false) then 'MAIN' else 'ALT' end,
      'mainCharacterId', v_root_id,
      'availableForceIds', v_available_force_ids,
      'disabledCode', v_disabled_code,
      'disabledMessage', v_disabled_message,
      'conflicts', v_conflicts
    ));
  end loop;

  return jsonb_build_object(
    'ownerResolved', true,
    'code', 'READY',
    'candidateCount', jsonb_array_length(v_characters),
    'characters', v_characters
  );
end;
$function$;

create or replace function private.kinojo_sm_support_batch_payload_v436(p_support_batch_id bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select jsonb_build_object(
    'supportBatchId', b.support_batch_id,
    'teamId', b.team_id,
    'requesterMemberId', b.requester_member_id,
    'status', b.status,
    'decisionMemberId', b.decision_member_id,
    'decisionNote', b.decision_note,
    'decidedAt', b.decided_at,
    'createdAt', b.created_at,
    'itemCount', count(i.support_item_id)::integer,
    'appliedCount', count(*) filter (where i.status = 'APPLIED')::integer,
    'pendingCount', count(*) filter (where i.status = 'PENDING')::integer,
    'rejectedCount', count(*) filter (where i.status = 'REJECTED')::integer,
    'cancelledCount', count(*) filter (where i.status = 'CANCELLED')::integer,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'supportItemId', i.support_item_id,
      'forceId', i.force_id,
      'forceNo', f.force_no,
      'characterId', i.character_id,
      'characterName', c.character_name,
      'serverName', c.server_name,
      'className', c.class_name,
      'status', i.status,
      'appliedSlotId', i.applied_slot_id,
      'resultCode', i.result_code,
      'resultMessage', i.result_message
    ) order by f.force_no, i.support_item_id) filter (where i.support_item_id is not null), '[]'::jsonb)
  )
    from private.sanctuary_management_support_batches_v412 b
    left join private.sanctuary_management_support_items_v412 i on i.support_batch_id = b.support_batch_id
    left join private.sanctuary_management_forces_v412 f on f.force_id = i.force_id
    left join public.character_master c on c.id = i.character_id
   where b.support_batch_id = p_support_batch_id
   group by b.support_batch_id;
$function$;

create or replace function private.kinojo_sm_support_batches_v436(
  p_team_id bigint,
  p_actor_member_id bigint,
  p_can_edit boolean
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select coalesce(jsonb_agg(
    private.kinojo_sm_support_batch_payload_v436(b.support_batch_id)
      || jsonb_build_object('requesterName', coalesce(m.main_character_name, '이용자 ' || b.requester_member_id))
    order by b.created_at desc
  ), '[]'::jsonb)
    from private.sanctuary_management_support_batches_v412 b
    left join public.member_codes m on m.id = b.requester_member_id
   where b.team_id = p_team_id
     and (
       (p_can_edit and (b.status in ('PENDING', 'PARTIAL') or b.created_at >= clock_timestamp() - interval '30 days'))
       or b.requester_member_id = p_actor_member_id
     );
$function$;

create or replace function private.kinojo_sm_force_roster_v436(
  p_team_id bigint,
  p_actor_member_id bigint,
  p_can_edit boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_roster jsonb;
  v_force_item jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force_id bigint;
  v_creator_state jsonb;
  v_viewer_assigned boolean;
  v_viewer_pending boolean;
  v_can_support boolean;
  v_disabled_code text;
  v_disabled_message text;
begin
  select * into v_team from private.sanctuary_management_teams_v412 where team_id = p_team_id;
  v_roster := private.kinojo_sm_force_roster_v430(p_team_id);

  for v_force_item in
    select force_item
      from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb))
        with ordinality as force_list(force_item, force_order)
     order by force_order
  loop
    v_force_id := nullif(v_force_item->>'forceId', '')::bigint;
    if p_can_edit then
      v_creator_state := private.kinojo_sm_creator_candidates_v436(p_team_id, v_force_id);
    else
      v_creator_state := jsonb_build_object(
        'memberId', v_team.creator_member_id,
        'ownerResolved', false,
        'ownerAlreadyAssigned', exists(
          select 1 from private.sanctuary_management_slots_v412 s
           where s.force_id = v_force_id and s.owner_member_id = v_team.creator_member_id and s.character_id is not null
        ),
        'code', 'CREATOR_CANDIDATES_NOT_EXPOSED',
        'candidateCount', 0,
        'candidates', '[]'::jsonb
      );
    end if;

    select exists(
      select 1 from private.sanctuary_management_slots_v412 s
       where s.force_id = v_force_id and s.owner_member_id = p_actor_member_id and s.character_id is not null
    ) into v_viewer_assigned;
    select exists(
      select 1
        from private.sanctuary_management_support_items_v412 i
        join private.sanctuary_management_support_batches_v412 b on b.support_batch_id = i.support_batch_id
       where b.team_id = p_team_id
         and b.requester_member_id = p_actor_member_id
         and i.force_id = v_force_id
         and i.status = 'PENDING'
    ) into v_viewer_pending;

    v_can_support := v_team.team_mode = 'PARTICIPATION'
      and v_team.status in ('ACTIVE', 'FULL')
      and coalesce((v_force_item->>'vacancyCount')::integer, 0) > 0
      and not v_viewer_assigned
      and not v_viewer_pending;
    v_disabled_code := null;
    v_disabled_message := null;
    if v_team.team_mode <> 'PARTICIPATION' then
      v_disabled_code := 'FIXED_TEAM';
      v_disabled_message := '고정 팀은 지원 모집을 사용하지 않습니다.';
    elsif v_team.status not in ('ACTIVE', 'FULL') then
      v_disabled_code := 'TEAM_NOT_ACTIVE';
      v_disabled_message := '아직 지원할 수 없는 팀입니다.';
    elsif v_viewer_assigned then
      v_disabled_code := 'ALREADY_ASSIGNED';
      v_disabled_message := '이미 이 포스에 캐릭터가 참여하고 있습니다.';
    elsif v_viewer_pending then
      v_disabled_code := 'ALREADY_PENDING';
      v_disabled_message := '이 포스의 승인 대기 요청이 있습니다.';
    elsif coalesce((v_force_item->>'vacancyCount')::integer, 0) <= 0 then
      v_disabled_code := 'FORCE_FULL';
      v_disabled_message := '이 포스는 정원이 모두 찼습니다.';
    end if;

    v_forces := v_forces || jsonb_build_array(
      v_force_item || jsonb_build_object(
        'creatorMemberId', nullif(v_creator_state->>'memberId', '')::bigint,
        'creatorOwnerResolved', coalesce((v_creator_state->>'ownerResolved')::boolean, false),
        'creatorAlreadyAssigned', coalesce((v_creator_state->>'ownerAlreadyAssigned')::boolean, false),
        'creatorCandidateCode', v_creator_state->>'code',
        'creatorCandidateCount', coalesce((v_creator_state->>'candidateCount')::integer, 0),
        'creatorCandidates', coalesce(v_creator_state->'candidates', '[]'::jsonb),
        'viewerAlreadyAssigned', v_viewer_assigned,
        'viewerPending', v_viewer_pending,
        'canSupport', v_can_support,
        'supportDisabledCode', v_disabled_code,
        'supportDisabledMessage', v_disabled_message
      )
    );
  end loop;

  return jsonb_set(v_roster, '{forces}', v_forces, true);
end;
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v436(p_credential text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_read boolean;
  v_write boolean;
  v_teams jsonb;
begin
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  select read_enabled, write_enabled into v_read, v_write
    from private.sanctuary_management_settings_v412 where singleton;

  if coalesce(v_read, false) then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teamId', t.team_id,
        'sanctuaryId', t.sanctuary_id,
        'title', t.title,
        'activity', t.activity,
        'mode', t.team_mode,
        'joinPolicy', t.join_policy,
        'status', t.status,
        'creatorMemberId', t.creator_member_id,
        'revision', t.revision,
        'publishedAt', t.published_at,
        'archivedAt', t.archived_at,
        'canEdit', access.can_edit,
        'schedule', jsonb_build_object(
          'scheduleId', r.schedule_id,
          'kind', r.schedule_kind,
          'startsOn', r.starts_on,
          'weekdays', r.weekdays,
          'startsAt', to_char(r.starts_at, 'HH24:MI'),
          'durationMinutes', r.duration_minutes,
          'timezoneName', r.timezone_name,
          'status', r.status,
          'revision', r.revision
        ),
        'supportCharacters', case
          when t.team_mode = 'PARTICIPATION' and t.status in ('ACTIVE', 'FULL')
          then private.kinojo_sm_support_characters_v436(t.team_id, v_actor_id)
          else jsonb_build_object('ownerResolved', true, 'code', 'NOT_OPEN', 'candidateCount', 0, 'characters', '[]'::jsonb)
        end,
        'supportBatches', case
          when t.team_mode = 'PARTICIPATION'
          then private.kinojo_sm_support_batches_v436(t.team_id, v_actor_id, access.can_edit)
          else '[]'::jsonb
        end
      ) || private.kinojo_sm_force_roster_v436(t.team_id, v_actor_id, access.can_edit)
      order by t.created_at desc
    ), '[]'::jsonb)
      into v_teams
      from private.sanctuary_management_teams_v412 t
      join private.sanctuary_management_schedule_rules_v412 r on r.team_id = t.team_id
      cross join lateral (
        select private.kinojo_sm_can_manage_team_v412(v_actor, t.team_id) as can_edit
      ) access
     where t.status <> 'ARCHIVED'
       and (t.status <> 'DRAFT' or access.can_edit);
  else
    v_teams := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'apiVersion', 1,
    'schemaVersion', 436,
    'databaseContract', 436,
    'serverTime', clock_timestamp(),
    'readEnabled', coalesce(v_read, false),
    'writeEnabled', coalesce(v_write, false),
    'actor', v_actor,
    'sanctuaries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'name', s.name,
        'shortName', s.short_name,
        'displayOrder', s.display_order,
        'legacyEnabled', s.enabled,
        'managementVisible', s.management_visible,
        'availableFrom', s.available_from,
        'releaseStatus', coalesce(s.metadata->>'releaseStatus', case when s.enabled then 'OPEN' else 'UPCOMING' end),
        'releaseLabel', s.metadata->>'releaseLabel'
      ) order by s.display_order), '[]'::jsonb)
        from public.sanctuary_master s where s.management_visible
    ),
    'teams', v_teams
  );
end;
$function$;

create or replace function public.kinojo_sanctuary_management_month_v436(
  p_credential text,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor jsonb;
  v_month_start date;
  v_month_end date;
  v_range_start date;
  v_range_end date;
begin
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  if p_month is null then
    raise exception '조회할 월을 선택해 주세요.' using errcode = 'P0001';
  end if;
  v_month_start := date_trunc('month', p_month)::date;
  if extract(year from v_month_start) not between 2025 and 2100 then
    raise exception '조회할 월 범위를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_range_start := v_month_start - ((extract(isodow from v_month_start)::integer - 3 + 7) % 7);
  v_range_end := v_month_end + ((2 - extract(isodow from v_month_end)::integer + 7) % 7);

  return jsonb_build_object(
    'ok', true,
    'schemaVersion', 436,
    'databaseContract', 436,
    'month', to_char(v_month_start, 'YYYY-MM'),
    'weekStartsOn', 'WEDNESDAY',
    'rangeStart', v_range_start,
    'rangeEnd', v_range_end,
    'weekStarts', (
      select coalesce(jsonb_agg(day::date order by day), '[]'::jsonb)
        from generate_series(v_range_start, v_range_end, interval '7 days') day
    ),
    'occurrences', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'teamId', t.team_id,
        'teamTitle', t.title,
        'sanctuaryId', t.sanctuary_id,
        'teamMode', t.team_mode,
        'joinPolicy', t.join_policy,
        'occurrenceDate', occurrence.occurrence_date,
        'weekStart', occurrence.occurrence_date - ((extract(isodow from occurrence.occurrence_date)::integer - 3 + 7) % 7),
        'startAt', occurrence.start_at,
        'endAt', occurrence.end_at,
        'durationMinutes', r.duration_minutes
      ) order by occurrence.start_at, t.team_id), '[]'::jsonb)
        from private.sanctuary_management_teams_v412 t
        join private.sanctuary_management_schedule_rules_v412 r on r.team_id = t.team_id and r.status = 'ACTIVE'
        cross join lateral private.kinojo_sm_rule_occurrences_v412(r.schedule_id, v_range_start, v_range_end) occurrence
       where t.status in ('ACTIVE', 'FULL')
    )
  );
end;
$function$;

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

revoke all on function public.kinojo_sanctuary_management_bootstrap_v436(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v436(text, date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v436(text, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v436(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v436(text, date) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v436(text, text, text, jsonb, bigint) to service_role;

revoke all on function private.kinojo_sm_creator_candidates_v436(bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_characters_v436(bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_batch_payload_v436(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_batches_v436(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v436(bigint, bigint, boolean) from public, anon, authenticated;

comment on function public.kinojo_sanctuary_management_command_v436(text, text, text, jsonb, bigint)
  is 'STAGE4_SUPPORT_SERIALIZATION: service-role Edge entrypoint; team-row lock serializes capacity and per-item results preserve partial outcomes.';
