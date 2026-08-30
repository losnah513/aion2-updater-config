-- Stage 8 part 2: per-slot class restrictions and linked/random alternate cards.
-- RANDOM_ALT is a virtual reservation only. It never creates a character_master
-- row and remains excluded from combat-power and composition-rule calculations.

alter table private.sanctuary_management_slots_v412
  add column if not exists required_class_code text not null default 'ALL',
  add column if not exists assignment_kind text not null default 'ACTUAL_CHARACTER';

alter table private.sanctuary_management_slots_v412
  drop constraint if exists sanctuary_management_slots_v412_check;

alter table private.sanctuary_management_slots_v412
  add constraint sanctuary_management_slots_v450_required_class_ck check (
    required_class_code in (
      'ALL', 'TEMPLAR', 'GLADIATOR', 'ASSASSIN', 'RANGER', 'SORCERER',
      'ELEMENTALIST', 'CLERIC', 'CHANTER', 'FIGHTER'
    )
  ),
  add constraint sanctuary_management_slots_v450_assignment_kind_ck check (
    assignment_kind in ('ACTUAL_CHARACTER', 'RANDOM_ALT')
  ),
  add constraint sanctuary_management_slots_v450_occupancy_ck check (
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
      and required_class_code = 'ALL'
    )
  );

create index if not exists sanctuary_management_slots_v450_force_class_vacancy_idx
  on private.sanctuary_management_slots_v412(force_id, required_class_code, party_id, slot_no)
  where assignment_kind = 'ACTUAL_CHARACTER' and character_id is null;

create or replace function private.kinojo_sm_class_code_v450(p_class_name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  select case regexp_replace(upper(coalesce(p_class_name, '')), '[[:space:]\u200B-\u200D\uFEFF]+', '', 'g')
    when '수호성' then 'TEMPLAR' when 'TEMPLAR' then 'TEMPLAR'
    when '검성' then 'GLADIATOR' when 'GLADIATOR' then 'GLADIATOR'
    when '살성' then 'ASSASSIN' when 'ASSASSIN' then 'ASSASSIN'
    when '궁성' then 'RANGER' when 'RANGER' then 'RANGER'
    when '마도성' then 'SORCERER' when 'SORCERER' then 'SORCERER'
    when '정령성' then 'ELEMENTALIST' when 'ELEMENTALIST' then 'ELEMENTALIST'
    when '치유성' then 'CLERIC' when 'CLERIC' then 'CLERIC'
    when '호법성' then 'CHANTER' when 'CHANTER' then 'CHANTER'
    when '권성' then 'FIGHTER' when 'FIGHTER' then 'FIGHTER' when 'BRAWLER' then 'FIGHTER'
    else null
  end
$function$;

create or replace function private.kinojo_sm_class_label_v450(p_class_code text)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  select case upper(coalesce(p_class_code, 'ALL'))
    when 'ALL' then '전체 클래스' when 'TEMPLAR' then '수호성' when 'GLADIATOR' then '검성'
    when 'ASSASSIN' then '살성' when 'RANGER' then '궁성' when 'SORCERER' then '마도성'
    when 'ELEMENTALIST' then '정령성' when 'CLERIC' then '치유성' when 'CHANTER' then '호법성'
    when 'FIGHTER' then '권성' else '전체 클래스'
  end
$function$;

create or replace function private.kinojo_sm_slot_assignment_guard_v450()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.character_master%rowtype;
  v_owner record;
begin
  select * into v_character from public.character_master where id = new.character_id;
  if new.assignment_kind = 'ACTUAL_CHARACTER' and new.character_id is not null then
    if v_character.id is null then
      raise exception '배치할 캐릭터를 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if new.required_class_code <> 'ALL'
       and private.kinojo_sm_class_code_v450(v_character.class_name) is distinct from new.required_class_code then
      raise exception '% 전용 슬롯에는 % 캐릭터를 배치할 수 없습니다.',
        private.kinojo_sm_class_label_v450(new.required_class_code), coalesce(v_character.class_name, '클래스 미확인')
        using errcode = 'P0001';
    end if;
  elsif new.assignment_kind = 'RANDOM_ALT' then
    select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(new.owner_root_character_id);
    if v_owner.character_id is null
       or v_owner.root_character_id is distinct from new.owner_root_character_id
       or v_owner.owner_member_id is distinct from new.owner_member_id then
      raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists sanctuary_management_slot_assignment_guard_v450
  on private.sanctuary_management_slots_v412;
create constraint trigger sanctuary_management_slot_assignment_guard_v450
after insert or update of character_id, owner_member_id, owner_root_character_id, character_relation, required_class_code, assignment_kind
on private.sanctuary_management_slots_v412
deferrable initially deferred
for each row execute function private.kinojo_sm_slot_assignment_guard_v450();

create or replace function private.kinojo_sm_force_roster_v450(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v449(p_team_id);
  v_forces jsonb := '[]'::jsonb;
  v_parties jsonb;
  v_slots jsonb;
  v_force jsonb;
  v_party jsonb;
  v_slot jsonb;
  v_slot_row private.sanctuary_management_slots_v412%rowtype;
  v_root public.character_master%rowtype;
  v_party_occupied integer;
  v_force_occupied integer;
  v_total_occupied integer := 0;
  v_slot_payload jsonb;
begin
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    v_parties := '[]'::jsonb;
    v_force_occupied := 0;
    for v_party in
      select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item)
    loop
      v_slots := '[]'::jsonb;
      v_party_occupied := 0;
      for v_slot in
        select item from jsonb_array_elements(coalesce(v_party->'slots', '[]'::jsonb)) source(item)
      loop
        select * into strict v_slot_row
          from private.sanctuary_management_slots_v412
         where slot_id = nullif(v_slot->>'slotId', '')::bigint;
        v_slot_payload := v_slot || jsonb_build_object(
          'requiredClassCode', v_slot_row.required_class_code,
          'requiredClassName', private.kinojo_sm_class_label_v450(v_slot_row.required_class_code),
          'assignmentKind', v_slot_row.assignment_kind
        );
        if v_slot_row.assignment_kind = 'RANDOM_ALT' then
          select * into strict v_root from public.character_master where id = v_slot_row.owner_root_character_id;
          v_slot_payload := (v_slot_payload - 'occupied' - 'character') || jsonb_build_object(
            'occupied', true,
            'character', jsonb_build_object(
              'characterId', null,
              'mainCharacterId', v_root.id,
              'ownerMemberId', v_slot_row.owner_member_id,
              'name', v_root.character_name || '의 랜덤 부캐',
              'characterName', v_root.character_name || '의 랜덤 부캐',
              'mainCharacterName', v_root.character_name,
              'serverId', v_root.server_id,
              'serverName', v_root.server_name,
              'className', null,
              'profileImageUrl', null,
              'relation', 'ALT',
              'isMain', false,
              'isRandomAlt', true,
              'assignmentKind', 'RANDOM_ALT',
              'power', null
            )
          );
        else
          v_slot_payload := jsonb_set(
            v_slot_payload,
            '{character}',
            case when v_slot_row.character_id is null then 'null'::jsonb
              else coalesce(v_slot_payload->'character', '{}'::jsonb) || jsonb_build_object(
                'isRandomAlt', false, 'assignmentKind', 'ACTUAL_CHARACTER'
              ) end,
            true
          );
        end if;
        if coalesce((v_slot_payload->>'occupied')::boolean, false) then
          v_party_occupied := v_party_occupied + 1;
        end if;
        v_slots := v_slots || jsonb_build_array(v_slot_payload);
      end loop;
      v_force_occupied := v_force_occupied + v_party_occupied;
      v_parties := v_parties || jsonb_build_array(
        (v_party - 'slots' - 'occupiedCount' - 'vacancyCount') || jsonb_build_object(
          'slots', v_slots,
          'occupiedCount', v_party_occupied,
          'vacancyCount', 5 - v_party_occupied
        )
      );
    end loop;
    v_total_occupied := v_total_occupied + v_force_occupied;
    v_forces := v_forces || jsonb_build_array(
      (v_force - 'parties' - 'occupiedCount' - 'vacancyCount') || jsonb_build_object(
        'parties', v_parties,
        'occupiedCount', v_force_occupied,
        'vacancyCount', 10 - v_force_occupied
      )
    );
  end loop;
  return (v_roster - 'forces' - 'occupiedCount' - 'vacancyCount') || jsonb_build_object(
    'forces', v_forces,
    'occupiedCount', v_total_occupied,
    'vacancyCount', coalesce((v_roster->>'slotCount')::integer, 0) - v_total_occupied
  );
end
$function$;

create or replace function private.kinojo_sm_support_characters_v450(
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
  v_base jsonb := private.kinojo_sm_support_characters_v436(p_team_id, p_actor_member_id);
  v_characters jsonb := '[]'::jsonb;
  v_character jsonb;
  v_force_ids jsonb;
  v_class_code text;
begin
  for v_character in
    select item from jsonb_array_elements(coalesce(v_base->'characters', '[]'::jsonb)) source(item)
  loop
    v_class_code := private.kinojo_sm_class_code_v450(v_character->>'className');
    select coalesce(jsonb_agg(force_id order by force_id), '[]'::jsonb) into v_force_ids
    from (
      select candidate.force_id
      from jsonb_array_elements_text(coalesce(v_character->'availableForceIds', '[]'::jsonb)) raw(force_id_text)
      cross join lateral (select raw.force_id_text::bigint force_id) candidate
      where exists (
        select 1
        from private.sanctuary_management_slots_v412 slot
        where slot.force_id = candidate.force_id
          and slot.assignment_kind = 'ACTUAL_CHARACTER'
          and slot.character_id is null
          and slot.owner_member_id is null
          and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
      )
    ) eligible;
    v_characters := v_characters || jsonb_build_array(
      v_character || jsonb_build_object(
        'classCode', v_class_code,
        'availableForceIds', v_force_ids,
        'disabledCode', case
          when jsonb_array_length(v_force_ids) = 0 and coalesce(v_character->>'disabledCode', '') = '' then 'NO_CLASS_ELIGIBLE_SLOT'
          else nullif(v_character->>'disabledCode', '')
        end,
        'disabledMessage', case
          when jsonb_array_length(v_force_ids) = 0 and coalesce(v_character->>'disabledCode', '') = '' then '현재 이 클래스가 지원할 수 있는 빈 슬롯이 없습니다.'
          else nullif(v_character->>'disabledMessage', '')
        end
      )
    );
  end loop;
  return (v_base - 'characters' - 'candidateCount') || jsonb_build_object(
    'characters', v_characters,
    'candidateCount', jsonb_array_length(v_characters)
  );
end
$function$;

create or replace function private.kinojo_sm_enrich_team_v450(p_team jsonb, p_actor_member_id bigint)
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
  v_roster := private.kinojo_sm_force_roster_v450(v_team_id);
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
    v_result := jsonb_set(v_result, '{supportCharacters}', private.kinojo_sm_support_characters_v450(v_team_id, p_actor_member_id), true);
  end if;
  return v_result;
end
$function$;

create or replace function private.kinojo_sm_enrich_teams_v450(p_teams jsonb, p_actor_member_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(private.kinojo_sm_enrich_team_v450(item, p_actor_member_id) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v450(p_credential text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v449(p_credential);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
begin
  return (v_base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.0,
    'schemaVersion', 450,
    'databaseContract', 450,
    'teams', private.kinojo_sm_enrich_teams_v450(v_base->'teams', v_actor_id)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v450()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.0,
    'schemaVersion', 450,
    'databaseContract', 450,
    'teams', private.kinojo_sm_enrich_teams_v450(base->'teams', null)
  )
  from (select public.kinojo_sanctuary_management_public_bootstrap_v449() base) source
$function$;

create or replace function public.kinojo_sanctuary_management_month_v450(p_credential text, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450
  ) from (select public.kinojo_sanctuary_management_month_v449(p_credential, p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v450(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450
  ) from (select public.kinojo_sanctuary_management_public_month_v449(p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_linked_alts_v450(
  p_credential text,
  p_team_id bigint,
  p_main_character_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_main public.character_master%rowtype;
  v_root_id bigint;
  v_owner record;
  v_characters jsonb;
begin
  if not private.kinojo_sm_can_manage_team_v412(v_actor, p_team_id) then
    raise exception '부캐 목록을 확인할 권한이 없습니다.' using errcode = 'P0001';
  end if;
  select * into v_main from public.character_master where id = p_main_character_id and coalesce(is_active, true);
  if v_main.id is null then raise exception '본캐를 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  v_root_id := coalesce(v_main.main_character_id, case when v_main.is_main then v_main.id else null end);
  if v_root_id is null then raise exception '본캐 관계가 확인된 캐릭터만 부캐를 선택할 수 있습니다.' using errcode = 'P0001'; end if;
  select * into v_main from public.character_master where id = v_root_id and coalesce(is_active, true);
  select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_root_id);
  if v_main.id is null or v_owner.character_id is null then
    raise exception '본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
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
    'power', character.latest_pve_combat_power
  ) order by character.character_name, character.id), '[]'::jsonb) into v_characters
  from public.character_master character
  where character.id <> v_root_id
    and character.main_character_id = v_root_id
    and coalesce(character.is_active, true)
    and not coalesce(character.lookup_excluded, false);
  return jsonb_build_object(
    'ok', true,
    'apiVersion', 2.0,
    'schemaVersion', 450,
    'databaseContract', 450,
    'mainCharacter', jsonb_build_object(
      'characterId', v_main.id,
      'characterName', v_main.character_name,
      'serverId', v_main.server_id,
      'serverName', v_main.server_name,
      'ownerMemberId', v_owner.owner_member_id
    ),
    'randomCandidate', jsonb_build_object(
      'assignmentKind', 'RANDOM_ALT',
      'mainCharacterId', v_main.id,
      'ownerMemberId', v_owner.owner_member_id,
      'characterName', v_main.character_name || '의 랜덤 부캐',
      'serverId', v_main.server_id,
      'serverName', v_main.server_name,
      'relation', 'ALT',
      'isMain', false,
      'isRandomAlt', true,
      'power', null
    ),
    'characters', v_characters,
    'characterCount', jsonb_array_length(v_characters)
  );
end
$function$;

create or replace function private.kinojo_sm_recompute_status_v450(p_team_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_total integer;
  v_occupied integer;
begin
  select count(*)::integer,
         count(*) filter (where character_id is not null or assignment_kind = 'RANDOM_ALT')::integer
    into v_total, v_occupied
    from private.sanctuary_management_slots_v412
   where team_id = p_team_id;
  update private.sanctuary_management_teams_v412
     set status = case when v_total > 0 and v_total = v_occupied then 'FULL' else 'ACTIVE' end,
         updated_at = clock_timestamp()
   where team_id = p_team_id and status in ('ACTIVE', 'FULL');
end
$function$;

create or replace function private.kinojo_sm_support_command_v450(
  p_credential text,
  p_request_key text,
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_batch private.sanctuary_management_support_batches_v412%rowtype;
  v_item private.sanctuary_management_support_items_v412%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_character_id bigint;
  v_batch_id bigint;
  v_slot_id bigint;
  v_assignment jsonb;
  v_assignments jsonb;
  v_decision text;
  v_class_code text;
  v_result_code text;
  v_result_message text;
  v_conflicts jsonb;
  v_applied_count integer;
  v_pending_count integer;
  v_rejected_count integer;
  v_cancelled_count integer;
  v_batch_status text;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  if v_action not in ('SUBMIT_SUPPORT', 'DECIDE_SUPPORT') then
    raise exception '지원 처리 작업이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, v_action);
  perform private.kinojo_sm_assert_write_enabled_v412();
  if v_actor_id is null then raise exception '로그인 후 지원 기능을 이용해 주세요.' using errcode = 'P0001'; end if;
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 450));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload || jsonb_build_object('replayed', true, 'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
  end if;

  if v_action = 'SUBMIT_SUPPORT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '현재 지원할 수 없는 팀입니다.' using errcode = 'P0001';
    end if;
    v_assignments := coalesce(p_payload->'assignments', '[]'::jsonb);
    if jsonb_typeof(v_assignments) <> 'array' or jsonb_array_length(v_assignments) not between 1 and 9 then
      raise exception '지원할 포스와 캐릭터를 하나 이상 선택해 주세요.' using errcode = 'P0001';
    end if;
    if (select count(distinct nullif(item->>'forceId', '')::bigint) <> count(*)
             or count(distinct nullif(item->>'characterId', '')::bigint) <> count(*)
          from jsonb_array_elements(v_assignments) item) then
      raise exception '포스와 캐릭터는 1:1로 중복 없이 선택해 주세요.' using errcode = 'P0001';
    end if;

    insert into private.sanctuary_management_support_batches_v412(team_id, requester_member_id, request_key, status)
    values (v_team_id, v_actor_id, v_request_key, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end)
    returning * into v_batch;
    v_batch_id := v_batch.support_batch_id;

    for v_assignment in
      select item from jsonb_array_elements(v_assignments) with ordinality source(item, ordinality) order by ordinality
    loop
      v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if v_force_id is null or v_character_id is null or not exists (
        select 1 from private.sanctuary_management_forces_v412 where force_id = v_force_id and team_id = v_team_id
      ) then raise exception '지원할 포스와 캐릭터 식별값을 다시 확인해 주세요.' using errcode = 'P0001'; end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id then
        raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
      select private.kinojo_sm_class_code_v450(class_name) into v_class_code from public.character_master where id = v_character_id;
      if v_class_code is null then raise exception '캐릭터 클래스를 확인할 수 없습니다.' using errcode = 'P0001'; end if;
      v_result_code := null; v_result_message := null; v_slot_id := null;
      if exists(select 1 from private.sanctuary_management_slots_v412 where team_id = v_team_id and character_id = v_character_id) then
        v_result_code := 'CHARACTER_ALREADY_IN_TEAM'; v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
      elsif exists(select 1 from private.sanctuary_management_slots_v412 where force_id = v_force_id and owner_member_id = v_actor_id) then
        v_result_code := 'OWNER_ALREADY_IN_FORCE'; v_result_message := '이 포스에는 이미 본인의 캐릭터가 참여하고 있습니다.';
      elsif exists(
        select 1 from private.sanctuary_management_support_items_v412 item
        join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
        where batch.team_id = v_team_id and batch.requester_member_id = v_actor_id and item.force_id = v_force_id and item.status = 'PENDING'
      ) then
        v_result_code := 'SUPPORT_ALREADY_PENDING'; v_result_message := '이 포스에는 이미 승인 대기 중인 지원이 있습니다.';
      else
        v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_actor_id, v_owner.root_character_id);
        if jsonb_array_length(v_conflicts) > 0 then
          v_result_code := 'SCHEDULE_CONFLICT'; v_result_message := v_conflicts->0->>'message';
        elsif not exists (
          select 1 from private.sanctuary_management_slots_v412 slot
          where slot.force_id = v_force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
            and slot.character_id is null and slot.owner_member_id is null
            and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
        ) then
          v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '현재 이 클래스가 지원할 수 있는 빈 슬롯이 없습니다.';
        end if;
      end if;
      if v_result_code is null and v_team.join_policy = 'INSTANT' then
        select slot.slot_id into v_slot_id
          from private.sanctuary_management_slots_v412 slot
          join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
         where slot.force_id = v_force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
           and slot.character_id is null and slot.owner_member_id is null
           and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
         order by party.party_no, slot.slot_no limit 1 for update of slot;
        if v_slot_id is null then
          v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '지원 처리 중 이 클래스가 들어갈 빈 슬롯이 없어졌습니다.';
        else
          update private.sanctuary_management_slots_v412 set
            character_id = v_character_id, owner_member_id = v_actor_id,
            owner_root_character_id = v_owner.root_character_id, character_relation = v_owner.relation,
            added_by_member_id = v_actor_id, assignment_kind = 'ACTUAL_CHARACTER'
          where slot_id = v_slot_id;
        end if;
      end if;
      insert into private.sanctuary_management_support_items_v412(
        support_batch_id, force_id, character_id, owner_member_id, owner_root_character_id,
        status, applied_slot_id, result_code, result_message
      ) values (
        v_batch_id, v_force_id, v_character_id, v_actor_id, v_owner.root_character_id,
        case when v_result_code is not null then 'REJECTED' when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end,
        v_slot_id,
        coalesce(v_result_code, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING_APPROVAL' end),
        coalesce(v_result_message, case when v_team.join_policy = 'INSTANT' then '클래스 조건에 맞는 빈 슬롯에 즉시 배치했습니다.' else '팀 승인을 기다리고 있습니다.' end)
      );
    end loop;
    select count(*) filter(where status = 'APPLIED')::integer,
           count(*) filter(where status = 'PENDING')::integer,
           count(*) filter(where status = 'REJECTED')::integer
      into v_applied_count, v_pending_count, v_rejected_count
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_team.join_policy = 'INSTANT' and v_applied_count > 0 and v_rejected_count = 0 then 'APPLIED'
      when v_team.join_policy = 'APPROVAL' and v_pending_count > 0 and v_rejected_count = 0 then 'PENDING'
      when (v_applied_count > 0 or v_pending_count > 0) and v_rejected_count > 0 then 'PARTIAL'
      else 'REJECTED' end;
    update private.sanctuary_management_support_batches_v412 set status = v_batch_status, updated_at = clock_timestamp() where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v450(v_team_id);
    v_response := jsonb_build_object('ok', true, 'action', v_action, 'teamId', v_team_id, 'joinPolicy', v_team.join_policy, 'batch', private.kinojo_sm_support_batch_payload_v436(v_batch_id));
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, null, v_response, v_request_key);
  else
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    v_decision := upper(btrim(coalesce(p_payload->>'decision', '')));
    if v_decision not in ('APPROVE', 'REJECT') then raise exception '승인 또는 거절을 선택해 주세요.' using errcode = 'P0001'; end if;
    select * into v_batch from private.sanctuary_management_support_batches_v412 where support_batch_id = v_batch_id for update;
    if v_batch.support_batch_id is null then raise exception '지원 요청을 찾을 수 없습니다.' using errcode = 'P0001'; end if;
    v_team_id := v_batch.team_id;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode = 'P0001'; end if;
    if v_batch.status not in ('PENDING', 'PARTIAL') or not exists(
      select 1 from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id and status = 'PENDING'
    ) then raise exception '이미 처리가 끝난 지원 요청입니다.' using errcode = 'P0001'; end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    if v_decision = 'REJECT' then
      update private.sanctuary_management_support_items_v412 set
        status = 'REJECTED', result_code = 'REJECTED_BY_MANAGER',
        result_message = coalesce(nullif(left(btrim(p_payload->>'note'), 240), ''), '팀 운영자가 지원을 거절했습니다.'),
        updated_at = clock_timestamp()
      where support_batch_id = v_batch_id and status = 'PENDING';
    else
      for v_item in
        select * from private.sanctuary_management_support_items_v412
        where support_batch_id = v_batch_id and status = 'PENDING' order by support_item_id for update
      loop
        v_result_code := null; v_result_message := null; v_slot_id := null;
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_item.character_id);
        select private.kinojo_sm_class_code_v450(class_name) into v_class_code from public.character_master where id = v_item.character_id;
        if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_item.owner_member_id then
          v_result_code := 'CHARACTER_OWNERSHIP_CHANGED'; v_result_message := '캐릭터 소유 관계가 변경되어 승인할 수 없습니다.';
        elsif v_class_code is null then
          v_result_code := 'CHARACTER_CLASS_UNKNOWN'; v_result_message := '캐릭터 클래스를 확인할 수 없어 승인할 수 없습니다.';
        elsif exists(select 1 from private.sanctuary_management_slots_v412 where team_id = v_team_id and character_id = v_item.character_id) then
          v_result_code := 'CHARACTER_ALREADY_IN_TEAM'; v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
        elsif exists(select 1 from private.sanctuary_management_slots_v412 where force_id = v_item.force_id and owner_member_id = v_item.owner_member_id) then
          v_result_code := 'OWNER_ALREADY_IN_FORCE'; v_result_message := '이 포스에는 이미 같은 이용자의 캐릭터가 참여하고 있습니다.';
        else
          v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_item.owner_member_id, v_item.owner_root_character_id);
          if jsonb_array_length(v_conflicts) > 0 then v_result_code := 'SCHEDULE_CONFLICT'; v_result_message := v_conflicts->0->>'message'; end if;
        end if;
        if v_result_code is null then
          select slot.slot_id into v_slot_id
            from private.sanctuary_management_slots_v412 slot
            join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
           where slot.force_id = v_item.force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
             and slot.character_id is null and slot.owner_member_id is null
             and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
           order by party.party_no, slot.slot_no limit 1 for update of slot;
          if v_slot_id is null then
            v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '승인 시점에 이 클래스가 들어갈 빈 슬롯이 없습니다.';
          else
            update private.sanctuary_management_slots_v412 set
              character_id = v_item.character_id, owner_member_id = v_item.owner_member_id,
              owner_root_character_id = v_item.owner_root_character_id, character_relation = v_owner.relation,
              added_by_member_id = v_actor_id, assignment_kind = 'ACTUAL_CHARACTER'
            where slot_id = v_slot_id;
          end if;
        end if;
        update private.sanctuary_management_support_items_v412 set
          status = case when v_result_code is null then 'APPLIED' else 'REJECTED' end,
          applied_slot_id = v_slot_id, result_code = coalesce(v_result_code, 'APPROVED'),
          result_message = coalesce(v_result_message, '팀 승인을 완료하고 클래스 조건에 맞는 빈 슬롯에 배치했습니다.'),
          updated_at = clock_timestamp()
        where support_item_id = v_item.support_item_id;
      end loop;
    end if;
    select count(*) filter(where status = 'APPLIED')::integer,
           count(*) filter(where status = 'PENDING')::integer,
           count(*) filter(where status = 'REJECTED')::integer,
           count(*) filter(where status = 'CANCELLED')::integer
      into v_applied_count, v_pending_count, v_rejected_count, v_cancelled_count
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
    v_batch_status := case when v_pending_count > 0 then 'PARTIAL'
      when v_applied_count > 0 and (v_rejected_count > 0 or v_cancelled_count > 0) then 'PARTIAL'
      when v_applied_count > 0 then 'APPLIED' else 'REJECTED' end;
    update private.sanctuary_management_support_batches_v412 set
      status = v_batch_status, decision_member_id = v_actor_id,
      decision_note = nullif(left(btrim(p_payload->>'note'), 240), ''), decided_at = clock_timestamp(), updated_at = clock_timestamp()
    where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v450(v_team_id);
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object('ok', true, 'action', v_action, 'teamId', v_team_id, 'decision', v_decision, 'batch', v_after);
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);
  end if;
  insert into private.sanctuary_management_commands_v412(actor_member_id, request_key, action, request_hash, response_payload)
  values (v_actor_id, v_request_key, v_action, v_hash, v_response);
  return v_response || jsonb_build_object('replayed', false, 'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
end
$function$;

create or replace function public.kinojo_sanctuary_management_command_v450(
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
  v_actor jsonb;
  v_actor_id bigint;
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_response jsonb;
  v_team_id bigint;
  v_force_id bigint;
  v_slot_id bigint;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_force_no integer;
  v_required_class text;
  v_assignment_kind text;
  v_character_id bigint;
  v_main_character_id bigint;
  v_owner record;
  v_occupied_count integer;
begin
  if v_action in ('SUBMIT_SUPPORT', 'DECIDE_SUPPORT') then
    return private.kinojo_sm_support_command_v450(p_credential, p_request_key, v_action, p_payload);
  end if;
  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v449(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    if v_team_id is not null and v_action in ('SET_SLOT', 'MOVE_SLOT') and coalesce((v_response->>'replayed')::boolean, false) is not true then
      perform private.kinojo_sm_recompute_status_v450(v_team_id);
    end if;
    return v_response || jsonb_build_object('apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) not in (
      'ALL', 'TEMPLAR', 'GLADIATOR', 'ASSASSIN', 'RANGER', 'SORCERER',
      'ELEMENTALIST', 'CLERIC', 'CHANTER', 'FIGHTER'
    )
      or upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) not in ('ACTUAL_CHARACTER', 'RANDOM_ALT')
      or (
        upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
        and (
          slot_item->>'characterId' is not null
          or nullif(slot_item->>'mainCharacterId', '')::bigint is null
          or upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) <> 'ALL'
        )
      )
  ) then
    raise exception '슬롯 클래스 제한 또는 랜덤 부캐 편성 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = btrim(coalesce(p_request_key, ''));
  if v_existing.command_id is not null then
    if v_existing.action <> v_action or v_existing.request_hash <> v_hash then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v449(
      p_credential, p_request_key, p_action, p_payload, p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    select count(*)::integer into v_occupied_count
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');
    return v_response || jsonb_build_object(
      'replayed', true, 'occupiedCount', v_occupied_count,
      'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450, 'slotContractVersion', 1
    );
  end if;

  v_team_id := nullif(p_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    update private.sanctuary_management_slots_v412
       set assignment_kind = 'ACTUAL_CHARACTER', character_id = null, owner_member_id = null,
           owner_root_character_id = null, character_relation = null, added_by_member_id = v_actor_id
     where team_id = v_team_id and assignment_kind = 'RANDOM_ALT';
  end if;

  v_response := public.kinojo_sanctuary_management_command_v449(
    p_credential, p_request_key, p_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb))
      with ordinality force_source(force_item, ordinality)
  loop
    select force_id into strict v_force_id
      from private.sanctuary_management_forces_v412
     where team_id = v_team_id and force_no = v_force_no;
    for v_slot_item in
      select slot_item from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    loop
      v_required_class := upper(coalesce(v_slot_item->>'requiredClassCode', 'ALL'));
      v_assignment_kind := upper(coalesce(v_slot_item->>'assignmentKind', 'ACTUAL_CHARACTER'));
      v_character_id := nullif(v_slot_item->>'characterId', '')::bigint;
      v_main_character_id := nullif(v_slot_item->>'mainCharacterId', '')::bigint;
      select slot.slot_id into strict v_slot_id
        from private.sanctuary_management_slots_v412 slot
        join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
       where slot.force_id = v_force_id
         and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
         and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;
      if v_assignment_kind = 'RANDOM_ALT' then
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_character_id);
        if v_owner.character_id is null or v_owner.root_character_id is distinct from v_main_character_id then
          raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
        end if;
        update private.sanctuary_management_slots_v412 set
          required_class_code = 'ALL', assignment_kind = 'RANDOM_ALT', character_id = null,
          owner_member_id = v_owner.owner_member_id, owner_root_character_id = v_owner.root_character_id,
          character_relation = 'ALT', added_by_member_id = v_actor_id
        where slot_id = v_slot_id;
      else
        update private.sanctuary_management_slots_v412 set
          required_class_code = v_required_class, assignment_kind = 'ACTUAL_CHARACTER'
        where slot_id = v_slot_id;
      end if;
    end loop;
  end loop;

  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  select count(*)::integer into v_occupied_count
    from private.sanctuary_management_slots_v412
   where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');
  return v_response || jsonb_build_object(
    'occupiedCount', v_occupied_count,
    'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450, 'slotContractVersion', 1
  );
end
$function$;

comment on column private.sanctuary_management_slots_v412.required_class_code is
  'ALL or one canonical class code. Server validation applies to save, manual placement, movement, instant support and approval.';
comment on column private.sanctuary_management_slots_v412.assignment_kind is
  'ACTUAL_CHARACTER stores a character_master identity; RANDOM_ALT stores only an owner/root reservation and never fabricates a character row.';
comment on function public.kinojo_sanctuary_management_linked_alts_v450(text, bigint, bigint) is
  'Manager-only linked alternate lookup. Returns actual linked characters plus one virtual RANDOM_ALT choice.';
comment on function public.kinojo_sanctuary_management_command_v450(text, text, text, jsonb, bigint) is
  'Service-role Edge boundary for atomic slot restrictions, actual/virtual assignments and class-aware support approval.';

revoke all on function private.kinojo_sm_class_code_v450(text) from public, anon, authenticated;
revoke all on function private.kinojo_sm_class_label_v450(text) from public, anon, authenticated;
revoke all on function private.kinojo_sm_slot_assignment_guard_v450() from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v450(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_characters_v450(bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_team_v450(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_teams_v450(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_recompute_status_v450(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_command_v450(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v450(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v450() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v450(text, date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v450(date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_linked_alts_v450(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v450(text, text, text, jsonb, bigint) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_bootstrap_v450(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v450() to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v450(text, date) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v450(date) to service_role;
grant execute on function public.kinojo_sanctuary_management_linked_alts_v450(text, bigint, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v450(text, text, text, jsonb, bigint) to service_role;
