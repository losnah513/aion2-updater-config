-- Sanctuary 4 (비탄의 설원) publishes three force-owned difficulties.
-- The metadata remains the authoritative threshold source for every roster,
-- support, linked-alt and random-placement eligibility path.

update public.sanctuary_master
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'entryModes', jsonb_build_array(
    jsonb_build_object('key', 'easy', 'label', '쉬움', 'sortOrder', 1, 'minItemLevel', 5800),
    jsonb_build_object('key', 'normal', 'label', '보통', 'sortOrder', 2, 'minItemLevel', 6000),
    jsonb_build_object('key', 'hard', 'label', '어려움', 'sortOrder', 3, 'minItemLevel', 6200)
  ),
  'waitlistDefaultMode', 'normal'
)
where code = 'sanctuary4';

alter table private.sanctuary_management_forces_v412
  drop constraint if exists sanctuary_management_forces_v412_difficulty_ck,
  add constraint sanctuary_management_forces_v412_difficulty_ck
    check (difficulty in ('EASY', 'NORMAL', 'HARD'));

create or replace function private.kinojo_sm_min_item_level_v452(
  p_sanctuary_id bigint,
  p_difficulty text default 'NORMAL'
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select sanctuary.code,
           coalesce(sanctuary.metadata->'entryModes', '[]'::jsonb) entry_modes,
           upper(coalesce(p_difficulty, 'NORMAL')) difficulty
    from public.sanctuary_master sanctuary
    where sanctuary.id = p_sanctuary_id
  )
  select nullif(mode->>'minItemLevel', '')::integer
  from target
  cross join lateral jsonb_array_elements(target.entry_modes) mode
  where lower(coalesce(mode->>'key', 'default')) = case target.difficulty
    when 'EASY' then 'easy'
    when 'HARD' then 'hard'
    else case
      when exists (
        select 1
        from jsonb_array_elements(target.entry_modes) candidate
        where lower(coalesce(candidate->>'key', 'default')) = 'normal'
      ) then 'normal'
      else 'default'
    end
  end
  order by coalesce(nullif(mode->>'sortOrder', '')::integer, 1)
  limit 1
$function$;

create or replace function private.kinojo_sm_difficulty_allowed_v464(
  p_sanctuary_id bigint,
  p_difficulty text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select coalesce(sanctuary.metadata->'entryModes', '[]'::jsonb) entry_modes,
           upper(coalesce(p_difficulty, 'NORMAL')) difficulty
    from public.sanctuary_master sanctuary
    where sanctuary.id = p_sanctuary_id
  )
  select exists (
    select 1
    from target
    cross join lateral jsonb_array_elements(target.entry_modes) mode
    where lower(coalesce(mode->>'key', 'default')) = case target.difficulty
      when 'EASY' then 'easy'
      when 'HARD' then 'hard'
      when 'NORMAL' then case
        when exists (
          select 1
          from jsonb_array_elements(target.entry_modes) candidate
          where lower(coalesce(candidate->>'key', 'default')) = 'normal'
        ) then 'normal'
        else 'default'
      end
      else '__invalid__'
    end
  )
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
    -- v453 only understands the legacy team-level NORMAL/HARD contract.
    -- Insert with NORMAL and persist the force-owned value after validation.
    v_delegate := (v_payload - 'difficulty') || jsonb_build_object('difficulty', 'NORMAL');
    v_response := public.kinojo_sanctuary_management_command_v453(
      p_credential, p_request_key, v_action, v_delegate, p_expected_revision
    );
    v_force_id := nullif(v_response->>'forceId', '')::bigint;
    v_difficulty := upper(coalesce(nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = nullif(v_response->>'teamId', '')::bigint;
    select * into v_sanctuary
      from public.sanctuary_master
     where id = v_team.sanctuary_id;
    if not private.kinojo_sm_difficulty_allowed_v464(v_sanctuary.id, v_difficulty) then
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
    if not private.kinojo_sm_difficulty_allowed_v464(v_sanctuary.id, v_difficulty) then
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

comment on column private.sanctuary_management_forces_v412.difficulty is
  'Authoritative EASY/NORMAL/HARD difficulty for one force. EASY is currently valid for Sanctuary 4 only.';
comment on function private.kinojo_sm_min_item_level_v452(bigint, text) is
  'Reads the authoritative minimum from sanctuary_master.metadata.entryModes for EASY/NORMAL/HARD force difficulty.';
comment on function private.kinojo_sm_difficulty_allowed_v464(bigint, text) is
  'Checks whether a force difficulty has an authoritative sanctuary entry mode.';
comment on function public.kinojo_sanctuary_management_command_v454(text, text, text, jsonb, bigint) is
  'Service-role boundary for per-force EASY/NORMAL/HARD validation, item-level eligibility and composition writes.';

revoke all on function private.kinojo_sm_difficulty_allowed_v464(bigint, text) from public, anon, authenticated;
