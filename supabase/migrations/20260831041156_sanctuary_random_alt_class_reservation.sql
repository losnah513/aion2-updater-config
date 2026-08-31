-- Team composer random-alt reservation follow-up.
-- A manager may reserve an as-yet-unregistered alternate from an owned main,
-- even when character_master has no linked alternate row yet. The chosen
-- class remains a slot requirement; no fake character_master row is created.

alter table private.sanctuary_management_slots_v412
  drop constraint if exists sanctuary_management_slots_v450_occupancy_ck;

alter table private.sanctuary_management_slots_v412
  add constraint sanctuary_management_slots_v453_occupancy_ck check (
    (
      assignment_kind = 'ACTUAL_CHARACTER'
      and (
        (character_id is null and owner_member_id is null and owner_root_character_id is null and character_relation is null)
        or (character_id is not null and owner_root_character_id is not null and character_relation is not null)
      )
    )
    or (
      assignment_kind = 'RANDOM_ALT'
      and character_id is null
      and owner_member_id is not null
      and owner_root_character_id is not null
      and character_relation = 'ALT'
    )
  );

create or replace function public.kinojo_sanctuary_management_linked_alts_v453(
  p_credential text, p_team_id bigint, p_main_character_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_minimum integer := private.kinojo_sm_team_min_item_level_v452(p_team_id);
  v_main public.character_master%rowtype;
  v_root_id bigint;
  v_owner record;
  v_conflicts jsonb := '[]'::jsonb;
  v_characters jsonb;
  v_random_candidate jsonb;
begin
  if not private.kinojo_sm_can_manage_team_v412(v_actor, p_team_id) then
    raise exception '부캐 목록을 확인할 권한이 없습니다.' using errcode = 'P0001';
  end if;
  select * into v_main
  from public.character_master
  where id = p_main_character_id and coalesce(is_active, true);
  if v_main.id is null then raise exception '본캐를 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  v_root_id := coalesce(v_main.main_character_id, case when v_main.is_main then v_main.id else null end);
  if v_root_id is null then raise exception '본캐 관계가 확인된 캐릭터만 부캐를 선택할 수 있습니다.' using errcode = 'P0001'; end if;
  select * into v_main
  from public.character_master
  where id = v_root_id and coalesce(is_active, true);
  if v_main.id is null then raise exception '본캐를 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_root_id);
  if v_owner.owner_member_id is not null then
    v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(
      p_team_id, v_owner.owner_member_id, v_root_id
    );
  end if;

  -- Keep every active linked character visible. Item-level, current-team and
  -- overlapping-schedule conditions disable placement but never hide a card.
  select coalesce(jsonb_agg(item order by character.character_name, character.id), '[]'::jsonb)
  into v_characters
  from public.character_master character
  cross join lateral jsonb_build_object(
    'characterId', character.id,
    'mainCharacterId', v_root_id,
    'ownerMemberId', v_owner.owner_member_id,
    'characterName', character.character_name,
    'serverId', character.server_id,
    'serverName', character.server_name,
    'className', character.class_name,
    'profileImageUrl', character.profile_image_url,
    'relation', 'ALT',
    'isMain', false,
    'itemLevel', character.latest_pve_item_level,
    'power', character.latest_pve_combat_power,
    'itemLevelEligible', v_minimum is null or coalesce(character.latest_pve_item_level, 0) >= v_minimum,
    'alreadyAssignedToOtherForce', exists (
      select 1 from private.sanctuary_management_slots_v412 slot
      where slot.team_id = p_team_id and slot.character_id = character.id
    ),
    'scheduleConflict', jsonb_array_length(v_conflicts) > 0,
    'disabledCode', case
      when v_minimum is not null and coalesce(character.latest_pve_item_level, 0) < v_minimum then 'ITEM_LEVEL_INSUFFICIENT'
      when exists (
        select 1 from private.sanctuary_management_slots_v412 slot
        where slot.team_id = p_team_id and slot.character_id = character.id
      ) then 'ALREADY_IN_OTHER_FORCE'
      when jsonb_array_length(v_conflicts) > 0 then 'SCHEDULE_CONFLICT'
      else ''
    end,
    'disabledMessage', case
      when v_minimum is not null and coalesce(character.latest_pve_item_level, 0) < v_minimum then '캐릭터의 아이템레벨이 부족합니다'
      when exists (
        select 1 from private.sanctuary_management_slots_v412 slot
        where slot.team_id = p_team_id and slot.character_id = character.id
      ) then '이미 다른 포스에 소속되어 있습니다'
      when jsonb_array_length(v_conflicts) > 0 then '같은 시간 다른 포스에 소속되어있습니다'
      else ''
    end
  ) source(item)
  where character.id <> v_root_id
    and character.main_character_id = v_root_id
    and coalesce(character.is_active, true)
    and not coalesce(character.lookup_excluded, false);

  if v_owner.owner_member_id is not null then
    v_random_candidate := jsonb_build_object(
      'assignmentKind', 'RANDOM_ALT',
      'mainCharacterId', v_root_id,
      'ownerMemberId', v_owner.owner_member_id,
      'characterName', v_main.character_name || '의 랜덤 부캐',
      'serverId', v_main.server_id,
      'serverName', v_main.server_name,
      'relation', 'RANDOM_ALT',
      'isMain', false,
      'isRandomAlt', true,
      'power', null,
      'itemLevel', null
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'apiVersion', 2.2,
    'schemaVersion', 453,
    'databaseContract', 453,
    'minimumItemLevel', v_minimum,
    'mainCharacter', jsonb_build_object(
      'characterId', v_main.id,
      'characterName', v_main.character_name,
      'serverId', v_main.server_id,
      'serverName', v_main.server_name,
      'ownerMemberId', v_owner.owner_member_id
    ),
    'randomCandidate', v_random_candidate,
    'characters', v_characters,
    'characterCount', jsonb_array_length(v_characters)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_command_v453(
  p_credential text, p_request_key text, p_action text, p_payload jsonb,
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
  v_composition jsonb;
  v_response jsonb;
  v_team_id bigint;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_force_no integer;
  v_force_id bigint;
  v_slot_id bigint;
  v_required_class text;
  v_main_character_id bigint;
  v_owner record;
  v_occupied_count integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v452(
      p_credential, p_request_key, p_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object(
      'apiVersion', 2.2, 'schemaVersion', 453, 'databaseContract', 453
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
      and (
        slot_item->>'characterId' is not null
        or nullif(slot_item->>'mainCharacterId', '')::bigint is null
        or upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) not in (
          'ALL', 'TEMPLAR', 'GLADIATOR', 'ASSASSIN', 'RANGER', 'SORCERER',
          'ELEMENTALIST', 'CLERIC', 'CHANTER', 'FIGHTER'
        )
      )
  ) then
    raise exception '랜덤 부캐의 본캐와 클래스를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  -- v452 remains the atomic composer authority. Random reservations are sent
  -- through it as typed empty slots, then restored in this same transaction.
  -- This avoids fabricating a character identity while preserving revision,
  -- lease, idempotency and all existing composition-rule validation.
  select jsonb_agg(
    (force_item - 'slots') || jsonb_build_object('slots', coalesce((
      select jsonb_agg(
        case
          when upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
            then (slot_item - 'mainCharacterId') || jsonb_build_object(
              'assignmentKind', 'ACTUAL_CHARACTER', 'characterId', null
            )
          else slot_item
        end
        order by slot_ordinality
      )
      from jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb))
        with ordinality slots(slot_item, slot_ordinality)
    ), '[]'::jsonb))
    order by force_ordinality
  ) into v_composition
  from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
    with ordinality forces(force_item, force_ordinality);

  v_delegate := (v_payload - 'composition') || jsonb_build_object(
    'composition', coalesce(v_composition, '[]'::jsonb)
  );
  v_response := public.kinojo_sanctuary_management_command_v452(
    p_credential, p_request_key, v_action, v_delegate, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    select force_id into strict v_force_id
    from private.sanctuary_management_forces_v412
    where team_id = v_team_id and force_no = v_force_no;

    for v_slot_item in
      select slot_item
      from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) source(slot_item)
      where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
    loop
      v_required_class := upper(coalesce(v_slot_item->>'requiredClassCode', 'ALL'));
      v_main_character_id := nullif(v_slot_item->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_character_id);
      if v_owner.character_id is null
         or v_owner.root_character_id is distinct from v_main_character_id
         or v_owner.owner_member_id is null then
        raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;

      select slot.slot_id into strict v_slot_id
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.force_id = v_force_id
        and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
        and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;

      update private.sanctuary_management_slots_v412 set
        required_class_code = v_required_class,
        assignment_kind = 'RANDOM_ALT',
        character_id = null,
        owner_member_id = v_owner.owner_member_id,
        owner_root_character_id = v_owner.root_character_id,
        character_relation = 'ALT'
      where slot_id = v_slot_id;
    end loop;
  end loop;

  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  select count(*)::integer into v_occupied_count
  from private.sanctuary_management_slots_v412
  where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');

  return v_response || jsonb_build_object(
    'occupiedCount', v_occupied_count,
    'apiVersion', 2.2, 'schemaVersion', 453, 'databaseContract', 453,
    'randomAltClassReservation', true
  );
end
$function$;

comment on constraint sanctuary_management_slots_v453_occupancy_ck on private.sanctuary_management_slots_v412 is
  'RANDOM_ALT reserves an owned main-character identity and may carry a class requirement without creating a fake character row.';
comment on function public.kinojo_sanctuary_management_linked_alts_v453(text, bigint, bigint) is
  'Manager-only alternate lookup. Owned mains always receive a virtual random-alt option even when no linked alternate row exists.';
comment on function public.kinojo_sanctuary_management_command_v453(text, text, text, jsonb, bigint) is
  'Atomic composer boundary for class-specific random-alt reservations without requiring a pre-existing linked alternate row.';

revoke all on function public.kinojo_sanctuary_management_linked_alts_v453(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v453(text, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_linked_alts_v453(text, bigint, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v453(text, text, text, jsonb, bigint) to service_role;
