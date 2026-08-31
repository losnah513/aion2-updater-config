-- Stage 10 part 1: force-owned difficulty and full-width sanctuary overview.
-- Team difficulty remains only as a transitional read value for v453 and older
-- clients. v454 reads and validates the authoritative value on each force.

alter table private.sanctuary_management_forces_v412
  add column if not exists difficulty text;

update private.sanctuary_management_forces_v412 force
set difficulty = coalesce(team.difficulty, 'NORMAL')
from private.sanctuary_management_teams_v412 team
where team.team_id = force.team_id
  and force.difficulty is null;

alter table private.sanctuary_management_forces_v412
  alter column difficulty set default 'NORMAL',
  alter column difficulty set not null,
  drop constraint if exists sanctuary_management_forces_v412_difficulty_ck,
  add constraint sanctuary_management_forces_v412_difficulty_ck
    check (difficulty in ('NORMAL', 'HARD'));

create or replace function private.kinojo_sm_force_min_item_level_v454(p_force_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select private.kinojo_sm_min_item_level_v452(team.sanctuary_id, force.difficulty)
  from private.sanctuary_management_forces_v412 force
  join private.sanctuary_management_teams_v412 team on team.team_id = force.team_id
  where force.force_id = p_force_id
$function$;

create or replace function private.kinojo_sm_force_roster_v454(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v452(p_team_id);
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
  v_record record;
begin
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    select force.difficulty,
           private.kinojo_sm_force_min_item_level_v454(force.force_id) minimum_item_level
      into v_record
      from private.sanctuary_management_forces_v412 force
     where force.force_id = nullif(v_force->>'forceId', '')::bigint;
    v_forces := v_forces || jsonb_build_array(v_force || jsonb_build_object(
      'difficulty', coalesce(v_record.difficulty, 'NORMAL'),
      'minimumItemLevel', v_record.minimum_item_level
    ));
  end loop;
  return jsonb_set(v_roster, '{forces}', v_forces, true);
end
$function$;

create or replace function private.kinojo_sm_support_characters_v454(
  p_team_id bigint,
  p_actor_member_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb := private.kinojo_sm_support_characters_v450(p_team_id, p_actor_member_id);
  v_characters jsonb := '[]'::jsonb;
  v_character jsonb;
  v_root jsonb;
  v_character_id bigint;
  v_root_id bigint;
  v_item_level integer;
  v_available jsonb;
  v_random_forces jsonb := '[]'::jsonb;
  v_random_count integer := 0;
begin
  for v_character in
    select item from jsonb_array_elements(coalesce(v_base->'characters', '[]'::jsonb)) source(item)
  loop
    v_character_id := nullif(v_character->>'characterId', '')::bigint;
    if upper(coalesce(v_character->>'relation', '')) = 'MAIN' and v_root is null then
      v_root := v_character;
    end if;
    select character.latest_pve_item_level into v_item_level
      from public.character_master character where character.id = v_character_id;
    select coalesce(jsonb_agg(candidate.force_id order by candidate.force_id), '[]'::jsonb)
      into v_available
      from (
        select raw.force_id_text::bigint force_id
        from jsonb_array_elements_text(coalesce(v_character->'availableForceIds', '[]'::jsonb)) raw(force_id_text)
        where private.kinojo_sm_character_eligible_v452(
          v_character_id,
          private.kinojo_sm_force_min_item_level_v454(raw.force_id_text::bigint)
        )
      ) candidate;
    v_character := v_character || jsonb_build_object(
      'itemLevel', v_item_level,
      'availableForceIds', v_available,
      'itemLevelEligible', jsonb_array_length(v_available) > 0
    );
    v_characters := v_characters || jsonb_build_array(v_character);
  end loop;

  if v_root is not null then
    v_root_id := nullif(v_root->>'characterId', '')::bigint;
    select coalesce(jsonb_agg(candidate.force_id order by candidate.force_id), '[]'::jsonb)
      into v_random_forces
      from (
        select raw.force_id_text::bigint force_id
        from jsonb_array_elements_text(coalesce(v_root->'availableForceIds', '[]'::jsonb)) raw(force_id_text)
        where exists (
          select 1
          from private.sanctuary_management_slots_v412 slot
          where slot.force_id = raw.force_id_text::bigint
            and slot.assignment_kind = 'ACTUAL_CHARACTER'
            and slot.character_id is null and slot.owner_member_id is null
            and slot.required_class_code = 'ALL'
        )
          and exists (
            select 1
            from public.character_master alt
            where alt.main_character_id = v_root_id and alt.id <> v_root_id
              and coalesce(alt.is_active, true) and not coalesce(alt.lookup_excluded, false)
              and private.kinojo_sm_character_eligible_v452(
                alt.id,
                private.kinojo_sm_force_min_item_level_v454(raw.force_id_text::bigint)
              )
          )
      ) candidate;
    select count(*)::integer into v_random_count
      from public.character_master alt
     where alt.main_character_id = v_root_id and alt.id <> v_root_id
       and coalesce(alt.is_active, true) and not coalesce(alt.lookup_excluded, false);
  end if;

  return (v_base - 'characters' - 'candidateCount' - 'randomAltCandidate') || jsonb_build_object(
    'characters', v_characters,
    'candidateCount', jsonb_array_length(v_characters),
    'randomAltCandidate', case
      when v_root_id is not null and v_random_count > 0 and jsonb_array_length(v_random_forces) > 0
      then jsonb_build_object(
        'assignmentKind', 'RANDOM_ALT',
        'characterId', v_root_id,
        'mainCharacterId', v_root_id,
        'characterName', coalesce(v_root->>'characterName', '본캐') || '의 랜덤 부캐',
        'serverId', nullif(v_root->>'serverId', '')::integer,
        'serverName', v_root->>'serverName',
        'relation', 'RANDOM_ALT',
        'isMain', false,
        'eligibleAltCount', v_random_count,
        'availableForceIds', v_random_forces
      ) else null end
  );
end
$function$;

create or replace function private.kinojo_sm_enrich_team_v454(p_team jsonb, p_actor_member_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_team_id bigint := nullif(p_team->>'teamId', '')::bigint;
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
  v_viewer_force jsonb;
  v_result jsonb;
begin
  if v_team_id is null then return p_team; end if;
  v_roster := private.kinojo_sm_force_roster_v454(v_team_id);
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    select item into v_viewer_force
      from jsonb_array_elements(coalesce(p_team->'forces', '[]'::jsonb)) source(item)
     where nullif(item->>'forceId', '')::bigint = nullif(v_force->>'forceId', '')::bigint
     limit 1;
    v_forces := v_forces || jsonb_build_array(coalesce(v_viewer_force, '{}'::jsonb) || v_force);
  end loop;
  v_result := (p_team - 'forceCount' - 'slotCount' - 'occupiedCount' - 'vacancyCount' - 'forces')
    || (v_roster - 'forces') || jsonb_build_object('forces', v_forces);
  if p_actor_member_id is not null and p_actor_member_id > 0 and p_team ? 'supportCharacters' then
    v_result := jsonb_set(
      v_result,
      '{supportCharacters}',
      private.kinojo_sm_support_characters_v454(v_team_id, p_actor_member_id),
      true
    );
  end if;
  return v_result;
end
$function$;

create or replace function private.kinojo_sm_enrich_teams_v454(p_teams jsonb, p_actor_member_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(private.kinojo_sm_enrich_team_v454(item, p_actor_member_id) order by ordinality),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v454(p_credential text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v452(p_credential);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
begin
  return (v_base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2,
    'schemaVersion', 454,
    'databaseContract', 454,
    'teams', private.kinojo_sm_enrich_teams_v454(v_base->'teams', v_actor_id)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v454()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2,
    'schemaVersion', 454,
    'databaseContract', 454,
    'teams', private.kinojo_sm_enrich_teams_v454(base->'teams', null)
  )
  from (select public.kinojo_sanctuary_management_public_bootstrap_v452() base) source
$function$;

create or replace function public.kinojo_sanctuary_management_month_v454(p_credential text, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454
  )
  from (select public.kinojo_sanctuary_management_month_v452(p_credential, p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v454(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454
  )
  from (select public.kinojo_sanctuary_management_public_month_v452(p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_linked_alts_v454(
  p_credential text,
  p_team_id bigint,
  p_main_character_id bigint,
  p_force_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_linked_alts_v453(
    p_credential, p_team_id, p_main_character_id
  );
  v_minimum integer;
  v_character jsonb;
  v_characters jsonb := '[]'::jsonb;
  v_character_id bigint;
  v_eligible boolean;
  v_assigned boolean;
  v_conflict boolean;
begin
  if p_force_id is not null and not exists (
    select 1 from private.sanctuary_management_forces_v412 force
    where force.force_id = p_force_id and force.team_id = p_team_id
  ) then
    raise exception '선택한 포스를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  v_minimum := case when p_force_id is null
    then private.kinojo_sm_team_min_item_level_v452(p_team_id)
    else private.kinojo_sm_force_min_item_level_v454(p_force_id)
  end;
  for v_character in
    select item from jsonb_array_elements(coalesce(v_base->'characters', '[]'::jsonb)) source(item)
  loop
    v_character_id := nullif(v_character->>'characterId', '')::bigint;
    v_eligible := private.kinojo_sm_character_eligible_v452(v_character_id, v_minimum);
    v_assigned := coalesce((v_character->>'alreadyAssignedToOtherForce')::boolean, false);
    v_conflict := coalesce((v_character->>'scheduleConflict')::boolean, false);
    v_character := v_character || jsonb_build_object(
      'itemLevelEligible', v_eligible,
      'disabledCode', case
        when not v_eligible then 'ITEM_LEVEL_INSUFFICIENT'
        when v_assigned then 'ALREADY_IN_OTHER_FORCE'
        when v_conflict then 'SCHEDULE_CONFLICT'
        else ''
      end,
      'disabledMessage', case
        when not v_eligible then '캐릭터의 아이템레벨이 부족합니다'
        when v_assigned then '이미 다른 포스에 소속되어 있습니다'
        when v_conflict then '같은 시간 다른 포스에 소속되어있습니다'
        else ''
      end
    );
    v_characters := v_characters || jsonb_build_array(v_character);
  end loop;
  return (v_base - 'characters' - 'characterCount' - 'minimumItemLevel' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || jsonb_build_object(
      'apiVersion', 2.2,
      'schemaVersion', 454,
      'databaseContract', 454,
      'forceId', p_force_id,
      'minimumItemLevel', v_minimum,
      'characters', v_characters,
      'characterCount', jsonb_array_length(v_characters)
    );
end
$function$;

create or replace function private.kinojo_sm_support_payload_v454(
  p_credential text,
  p_request_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_assignment jsonb;
  v_result jsonb := '[]'::jsonb;
  v_used bigint[] := '{}'::bigint[];
  v_kind text;
  v_character_id bigint;
  v_main_id bigint;
  v_force_id bigint;
  v_minimum integer;
  v_owner record;
begin
  for v_assignment in
    select item from jsonb_array_elements(coalesce(p_payload->'assignments', '[]'::jsonb)) source(item)
  loop
    v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
    v_minimum := private.kinojo_sm_force_min_item_level_v454(v_force_id);
    v_kind := upper(coalesce(v_assignment->>'assignmentKind', 'ACTUAL_CHARACTER'));
    if v_kind = 'RANDOM_ALT' then
      v_main_id := nullif(v_assignment->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_id);
      if v_owner.character_id is null
         or v_owner.owner_member_id is distinct from v_actor_id
         or v_owner.root_character_id is distinct from v_main_id then
        raise exception '랜덤 부캐를 신청할 본캐 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;
      select character.id into v_character_id
      from public.character_master character
      where character.main_character_id = v_main_id and character.id <> v_main_id
        and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
        and private.kinojo_sm_character_eligible_v452(character.id, v_minimum)
        and not (character.id = any(v_used))
      order by md5(character.id::text || ':' || coalesce(p_request_key, '') || ':' || coalesce(v_force_id::text, '0'))
      limit 1;
      if v_character_id is null then
        raise exception '해당 포스 아이템레벨을 충족하는 미선택 부캐가 없습니다.' using errcode = 'P0001';
      end if;
    else
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if not private.kinojo_sm_character_eligible_v452(v_character_id, v_minimum) then
        raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
    end if;
    v_used := array_append(v_used, v_character_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'forceId', v_force_id,
      'characterId', v_character_id
    ));
  end loop;
  return (p_payload - 'assignments') || jsonb_build_object('assignments', v_result);
end
$function$;

create or replace function public.kinojo_sanctuary_management_command_v454(
  p_credential text,
  p_request_key text,
  p_action text,
  p_payload jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_delegate jsonb;
  v_response jsonb;
  v_team_id bigint;
  v_force_id bigint;
  v_force_no integer;
  v_force jsonb;
  v_slot jsonb;
  v_rule jsonb;
  v_difficulty text;
  v_minimum integer;
  v_sanctuary public.sanctuary_master%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_all_hard boolean := true;
begin
  if v_action = 'SUBMIT_SUPPORT' then
    v_delegate := private.kinojo_sm_support_payload_v454(p_credential, p_request_key, v_payload);
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_delegate, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'DECIDE_SUPPORT' and upper(coalesce(v_payload->>'decision', '')) = 'APPROVE' then
    if exists (
      select 1
      from private.sanctuary_management_support_batches_v412 batch
      join private.sanctuary_management_support_items_v412 item
        on item.support_batch_id = batch.support_batch_id and item.status = 'PENDING'
      where batch.support_batch_id = nullif(v_payload->>'supportBatchId', '')::bigint
        and not private.kinojo_sm_character_eligible_v452(
          item.character_id,
          private.kinojo_sm_force_min_item_level_v454(item.force_id)
        )
    ) then
      raise exception '현재 포스 아이템레벨을 충족하지 않는 지원 캐릭터가 있습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'SET_SLOT' then
    v_force_id := nullif(v_payload->>'forceId', '')::bigint;
    if v_payload->>'characterId' is not null and not private.kinojo_sm_character_eligible_v452(
      nullif(v_payload->>'characterId', '')::bigint,
      private.kinojo_sm_force_min_item_level_v454(v_force_id)
    ) then
      raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'ADD_FORCE' then
    v_response := public.kinojo_sanctuary_management_command_v453(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    v_force_id := nullif(v_response->>'forceId', '')::bigint;
    v_difficulty := upper(coalesce(nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = nullif(v_response->>'teamId', '')::bigint;
    select * into v_sanctuary
      from public.sanctuary_master
     where id = v_team.sanctuary_id;
    if (v_sanctuary.code = 'kaldrix' and v_difficulty not in ('NORMAL', 'HARD'))
       or (v_sanctuary.code <> 'kaldrix' and v_difficulty <> 'NORMAL') then
      raise exception '선택한 포스 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    update private.sanctuary_management_forces_v412
       set difficulty = v_difficulty, updated_at = clock_timestamp()
     where force_id = v_force_id;
    return v_response || jsonb_build_object(
      'difficulty', v_difficulty, 'apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454
    );
  end if;

  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v453(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  v_team_id := nullif(v_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    select * into v_sanctuary from public.sanctuary_master where id = v_team.sanctuary_id;
  else
    select * into v_sanctuary
      from public.sanctuary_master
     where code = btrim(v_payload->>'sanctuaryCode') and management_visible;
  end if;
  if v_sanctuary.id is null then
    raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  for v_force, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    v_difficulty := upper(coalesce(nullif(v_force->>'difficulty', ''), nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    if (v_sanctuary.code = 'kaldrix' and v_difficulty not in ('NORMAL', 'HARD'))
       or (v_sanctuary.code <> 'kaldrix' and v_difficulty <> 'NORMAL') then
      raise exception '선택한 포스 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    if v_difficulty <> 'HARD' then v_all_hard := false; end if;
    v_minimum := private.kinojo_sm_min_item_level_v452(v_sanctuary.id, v_difficulty);

    for v_slot in
      select slot_item from jsonb_array_elements(coalesce(v_force->'slots', '[]'::jsonb)) source(slot_item)
    loop
      if nullif(v_slot->>'characterId', '')::bigint is not null
         and not private.kinojo_sm_character_eligible_v452(nullif(v_slot->>'characterId', '')::bigint, v_minimum) then
        raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001';
      end if;
      if upper(coalesce(v_slot->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
         and not exists (
           select 1 from public.character_master character
           where character.main_character_id = nullif(v_slot->>'mainCharacterId', '')::bigint
             and character.id <> nullif(v_slot->>'mainCharacterId', '')::bigint
             and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
             and private.kinojo_sm_character_eligible_v452(character.id, v_minimum)
         ) then
        raise exception '해당 포스 아이템레벨을 충족하는 부캐가 없어 랜덤 부캐를 배치할 수 없습니다.' using errcode = 'P0001';
      end if;
    end loop;

    for v_rule in
      select rule_item from jsonb_array_elements(coalesce(v_force->'requirements', '[]'::jsonb)) source(rule_item)
    loop
      if upper(coalesce(v_rule->>'ruleType', '')) = 'ITEM_LEVEL_MIN'
         and v_minimum is not null
         and coalesce(nullif(v_rule->>'itemLevelThreshold', '')::integer, 0) < v_minimum then
        raise exception '포스 아이템레벨 배치 조건은 성역 최소치보다 낮을 수 없습니다.' using errcode = 'P0001';
      end if;
    end loop;
  end loop;

  -- v453 remains the atomic slot/random-reservation authority. Passing the
  -- base Kaldrix difficulty prevents its team-level compatibility check from
  -- rejecting NORMAL forces; the per-force checks above are authoritative.
  v_delegate := (v_payload - 'difficulty') || jsonb_build_object('difficulty', 'NORMAL');
  v_response := public.kinojo_sanctuary_management_command_v453(
    p_credential, p_request_key, v_action, v_delegate, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    v_difficulty := upper(coalesce(nullif(v_force->>'difficulty', ''), nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    update private.sanctuary_management_forces_v412
       set difficulty = v_difficulty, updated_at = clock_timestamp()
     where team_id = v_team_id and force_no = v_force_no;
  end loop;
  update private.sanctuary_management_teams_v412
     set difficulty = case when v_all_hard then 'HARD' else 'NORMAL' end,
         updated_at = clock_timestamp()
   where team_id = v_team_id;

  return v_response || jsonb_build_object(
    'difficultyScope', 'FORCE',
    'apiVersion', 2.2,
    'schemaVersion', 454,
    'databaseContract', 454
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_balance_proposal_v454(
  p_credential text,
  p_team_id bigint,
  p_expected_revision bigint,
  p_lease_token text,
  p_stable_seed text,
  p_proposal_token text,
  p_lock_overrides jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if exists (
    select 1
    from private.sanctuary_management_support_items_v412 item
    join private.sanctuary_management_support_batches_v412 batch
      on batch.support_batch_id = item.support_batch_id
    where batch.team_id = p_team_id and item.status = 'PENDING'
      and not private.kinojo_sm_character_eligible_v452(
        item.character_id,
        private.kinojo_sm_force_min_item_level_v454(item.force_id)
      )
  ) then
    raise exception '포스 아이템레벨 조건이 바뀐 지원자가 있어 지원 현황을 먼저 정리해 주세요.' using errcode = 'P0001';
  end if;
  v_result := public.kinojo_sanctuary_management_balance_proposal_v451(
    p_credential, p_team_id, p_expected_revision, p_lease_token,
    p_stable_seed, p_proposal_token, p_lock_overrides
  );
  return v_result || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
end
$function$;

comment on column private.sanctuary_management_forces_v412.difficulty is
  'Authoritative NORMAL/HARD difficulty for one force. Team difficulty is transitional compatibility only.';
comment on function private.kinojo_sm_force_min_item_level_v454(bigint) is
  'Resolves the authoritative entry threshold from the force difficulty and sanctuary_master metadata.';
comment on function public.kinojo_sanctuary_management_command_v454(text, text, text, jsonb, bigint) is
  'Service-role boundary that validates support, placement, random alts and composition rules per force difficulty.';

revoke all on function private.kinojo_sm_force_min_item_level_v454(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v454(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_characters_v454(bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_team_v454(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_teams_v454(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_payload_v454(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v454(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v454() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v454(text, date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v454(date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_linked_alts_v454(text, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v454(text, text, text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_balance_proposal_v454(text, bigint, bigint, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_bootstrap_v454(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v454() to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v454(text, date) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v454(date) to service_role;
grant execute on function public.kinojo_sanctuary_management_linked_alts_v454(text, bigint, bigint, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v454(text, text, text, jsonb, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_balance_proposal_v454(text, bigint, bigint, text, text, text, jsonb) to service_role;
