-- Stage 9: dense support cards, Server-owned item-level eligibility and
-- Sanctuary 3 difficulty. Entry thresholds remain in sanctuary_master metadata;
-- WEB receives them as read-only data and every mutating path validates again.

alter table private.sanctuary_management_teams_v412
  add column if not exists difficulty text not null default 'NORMAL';

alter table private.sanctuary_management_teams_v412
  drop constraint if exists sanctuary_management_teams_v412_difficulty_ck,
  add constraint sanctuary_management_teams_v412_difficulty_ck
    check (difficulty in ('NORMAL', 'HARD'));

alter table private.sanctuary_management_composition_rules_v449
  add column if not exists item_level_threshold integer;

alter table private.sanctuary_management_composition_rules_v449
  drop constraint if exists sanctuary_management_composition_rules_v449_type_ck,
  drop constraint if exists sanctuary_management_composition_rules_v449_power_ck,
  add constraint sanctuary_management_composition_rules_v449_type_ck
    check (rule_type in ('MAIN_MIN', 'POWER_MIN', 'ITEM_LEVEL_MIN')),
  add constraint sanctuary_management_composition_rules_v449_threshold_ck check (
    (rule_type = 'MAIN_MIN' and power_threshold is null and item_level_threshold is null)
    or (rule_type = 'POWER_MIN' and power_threshold between 1000 and 1000000000 and item_level_threshold is null)
    or (rule_type = 'ITEM_LEVEL_MIN' and power_threshold is null and item_level_threshold between 1 and 100000)
  );

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
  select nullif(mode->>'minItemLevel', '')::integer
  from public.sanctuary_master sanctuary
  cross join lateral jsonb_array_elements(coalesce(sanctuary.metadata->'entryModes', '[]'::jsonb)) mode
  where sanctuary.id = p_sanctuary_id
    and lower(coalesce(mode->>'key', 'default')) = case
      when sanctuary.code = 'kaldrix' and upper(coalesce(p_difficulty, 'NORMAL')) = 'HARD' then 'hard'
      when sanctuary.code = 'kaldrix' then 'normal'
      else 'default'
    end
  order by coalesce(nullif(mode->>'sortOrder', '')::integer, 1)
  limit 1
$function$;

create or replace function private.kinojo_sm_team_min_item_level_v452(p_team_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select private.kinojo_sm_min_item_level_v452(team.sanctuary_id, team.difficulty)
  from private.sanctuary_management_teams_v412 team
  where team.team_id = p_team_id
$function$;

create or replace function private.kinojo_sm_character_eligible_v452(
  p_character_id bigint,
  p_minimum_item_level integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.character_master character
    where character.id = p_character_id
      and coalesce(character.is_active, true)
      and not coalesce(character.lookup_excluded, false)
      and (p_minimum_item_level is null or character.latest_pve_item_level >= p_minimum_item_level)
  )
$function$;

create or replace function private.kinojo_sm_character_card_v452(p_character_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(private.kinojo_sm_character_card_v432(p_character_id), '{}'::jsonb)
    || jsonb_build_object(
      'power', character.latest_pve_combat_power,
      'itemLevel', character.latest_pve_item_level,
      -- Do not infer alt availability from member ownership. Guest/external roots
      -- imported before Stage 7 can still have real linked character_master rows.
      'canSelectAlts', exists (
        select 1
        from public.character_master alt
        where alt.id <> character.id
          and alt.main_character_id = character.id
          and coalesce(alt.is_active, true)
          and not coalesce(alt.lookup_excluded, false)
      )
    )
  from public.character_master character
  where character.id = p_character_id
$function$;

create or replace function private.kinojo_sm_scope_requirements_v452(
  p_team_id bigint,
  p_force_id bigint,
  p_party_id bigint default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with scoped_rules as (
    select rule.*
    from private.sanctuary_management_composition_rules_v449 rule
    where rule.team_id = p_team_id
      and rule.force_id = p_force_id
      and (
        (p_party_id is null and rule.scope_type = 'FORCE' and rule.party_id is null)
        or (p_party_id is not null and rule.scope_type = 'PARTY' and rule.party_id = p_party_id)
      )
  ), evaluated as (
    select rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold,
      count(slot.character_id) filter (
        where slot.character_id is not null and (
          (rule.rule_type = 'MAIN_MIN' and (slot.character_relation = 'MAIN' or coalesce(character.is_main, false)))
          or (rule.rule_type = 'POWER_MIN' and character.latest_pve_combat_power >= rule.power_threshold)
          or (rule.rule_type = 'ITEM_LEVEL_MIN' and character.latest_pve_item_level >= rule.item_level_threshold)
        )
      )::integer matching_count
    from scoped_rules rule
    left join private.sanctuary_management_slots_v412 slot
      on slot.team_id = p_team_id and slot.force_id = p_force_id
     and (p_party_id is null or slot.party_id = p_party_id)
    left join public.character_master character on character.id = slot.character_id
    group by rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold
  )
  select jsonb_build_object(
    'satisfied', coalesce(bool_and(matching_count >= minimum_count), true),
    'ruleCount', count(composition_rule_id)::integer,
    'unsatisfiedCount', count(composition_rule_id) filter (where matching_count < minimum_count)::integer,
    'rules', coalesce(jsonb_agg(jsonb_build_object(
      'compositionRuleId', composition_rule_id,
      'scopeType', scope_type,
      'ruleType', rule_type,
      'minimumCount', minimum_count,
      'powerThreshold', power_threshold,
      'itemLevelThreshold', item_level_threshold,
      'matchingCount', matching_count,
      'satisfied', matching_count >= minimum_count,
      'message', case
        when rule_type = 'MAIN_MIN' then '본캐 ' || minimum_count || '명 이상'
        when rule_type = 'POWER_MIN' then '전투력 ' || trim(to_char(power_threshold / 1000.0, 'FM999999990.0')) || 'K 이상 ' || minimum_count || '명 이상'
        else '아이템레벨 ' || item_level_threshold || ' 이상 ' || minimum_count || '명 이상'
      end
    ) order by rule_type), '[]'::jsonb)
  ) from evaluated
$function$;

create or replace function private.kinojo_sm_force_roster_v452(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v451(p_team_id);
  v_forces jsonb := '[]'::jsonb; v_parties jsonb; v_slots jsonb;
  v_force jsonb; v_party jsonb; v_slot jsonb; v_character jsonb;
  v_force_id bigint; v_party_id bigint; v_character_id bigint;
begin
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    v_force_id := nullif(v_force->>'forceId', '')::bigint; v_parties := '[]'::jsonb;
    for v_party in select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item) loop
      v_party_id := nullif(v_party->>'partyId', '')::bigint; v_slots := '[]'::jsonb;
      for v_slot in select item from jsonb_array_elements(coalesce(v_party->'slots', '[]'::jsonb)) source(item) loop
        v_character := v_slot->'character';
        v_character_id := nullif(v_character->>'characterId', '')::bigint;
        if v_character_id is not null then
          select v_character || jsonb_build_object(
            'power', character.latest_pve_combat_power,
            'itemLevel', character.latest_pve_item_level
          ) into v_character from public.character_master character where character.id = v_character_id;
          v_slot := jsonb_set(v_slot, '{character}', coalesce(v_character, v_slot->'character'), true);
        end if;
        v_slots := v_slots || jsonb_build_array(v_slot);
      end loop;
      v_parties := v_parties || jsonb_build_array((v_party - 'slots' - 'requirements') || jsonb_build_object(
        'slots', v_slots,
        'requirements', private.kinojo_sm_scope_requirements_v452(p_team_id, v_force_id, v_party_id)
      ));
    end loop;
    v_forces := v_forces || jsonb_build_array((v_force - 'parties' - 'requirements') || jsonb_build_object(
      'parties', v_parties,
      'requirements', private.kinojo_sm_scope_requirements_v452(p_team_id, v_force_id, null)
    ));
  end loop;
  return jsonb_set(v_roster, '{forces}', v_forces, true);
end
$function$;

create or replace function private.kinojo_sm_support_characters_v452(
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
  v_minimum integer := private.kinojo_sm_team_min_item_level_v452(p_team_id);
  v_characters jsonb := '[]'::jsonb; v_character jsonb; v_root jsonb;
  v_character_id bigint; v_root_id bigint; v_item_level integer; v_alt_count integer := 0;
  v_force_ids jsonb := '[]'::jsonb;
begin
  for v_character in select item from jsonb_array_elements(coalesce(v_base->'characters', '[]'::jsonb)) source(item) loop
    v_character_id := nullif(v_character->>'characterId', '')::bigint;
    select latest_pve_item_level into v_item_level from public.character_master where id = v_character_id;
    if v_minimum is null or v_item_level >= v_minimum then
      v_characters := v_characters || jsonb_build_array(v_character || jsonb_build_object('itemLevel', v_item_level));
    end if;
    if upper(coalesce(v_character->>'relation', '')) = 'MAIN' and v_root is null then v_root := v_character; end if;
  end loop;
  if v_root is not null then
    v_root_id := nullif(v_root->>'characterId', '')::bigint;
    select count(*)::integer into v_alt_count from public.character_master character
    where character.main_character_id = v_root_id and character.id <> v_root_id
      and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
      and (v_minimum is null or character.latest_pve_item_level >= v_minimum);
    if v_alt_count > 0 then
      select coalesce(jsonb_agg(candidate.force_id order by candidate.force_id), '[]'::jsonb) into v_force_ids
      from (
        select raw.force_id_text::bigint force_id
        from jsonb_array_elements_text(coalesce(v_root->'availableForceIds', '[]'::jsonb)) raw(force_id_text)
        where exists (
          select 1 from private.sanctuary_management_slots_v412 slot
          where slot.force_id = raw.force_id_text::bigint and slot.assignment_kind = 'ACTUAL_CHARACTER'
            and slot.character_id is null and slot.owner_member_id is null and slot.required_class_code = 'ALL'
        )
      ) candidate;
    end if;
  end if;
  return (v_base - 'characters' - 'candidateCount') || jsonb_build_object(
    'characters', v_characters,
    'candidateCount', jsonb_array_length(v_characters),
    'minimumItemLevel', v_minimum,
    'randomAltCandidate', case when v_alt_count > 0 then jsonb_build_object(
      'assignmentKind', 'RANDOM_ALT', 'characterId', v_root_id, 'mainCharacterId', v_root_id,
      'characterName', coalesce(v_root->>'characterName', '본캐') || '의 랜덤 부캐',
      'serverId', nullif(v_root->>'serverId', '')::integer, 'serverName', v_root->>'serverName',
      'relation', 'RANDOM_ALT', 'isMain', false, 'eligibleAltCount', v_alt_count,
      'availableForceIds', v_force_ids
    ) else null end
  );
end
$function$;

create or replace function private.kinojo_sm_enrich_team_v452(p_team jsonb, p_actor_member_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_team_id bigint := nullif(p_team->>'teamId', '')::bigint; v_team record;
  v_roster jsonb; v_forces jsonb := '[]'::jsonb; v_force jsonb; v_viewer_force jsonb; v_result jsonb;
begin
  if v_team_id is null then return p_team; end if;
  select team.difficulty, private.kinojo_sm_team_min_item_level_v452(team.team_id) minimum_item_level
    into v_team from private.sanctuary_management_teams_v412 team where team.team_id = v_team_id;
  v_roster := private.kinojo_sm_force_roster_v452(v_team_id);
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    select item into v_viewer_force from jsonb_array_elements(coalesce(p_team->'forces', '[]'::jsonb)) source(item)
      where nullif(item->>'forceId', '')::bigint = nullif(v_force->>'forceId', '')::bigint limit 1;
    v_forces := v_forces || jsonb_build_array(coalesce(v_viewer_force, '{}'::jsonb) || v_force);
  end loop;
  v_result := (p_team - 'forceCount' - 'slotCount' - 'occupiedCount' - 'vacancyCount' - 'forces')
    || (v_roster - 'forces') || jsonb_build_object(
      'forces', v_forces, 'difficulty', coalesce(v_team.difficulty, 'NORMAL'),
      'minimumItemLevel', v_team.minimum_item_level
    );
  if p_actor_member_id is not null and p_actor_member_id > 0 and p_team ? 'supportCharacters' then
    v_result := jsonb_set(v_result, '{supportCharacters}', private.kinojo_sm_support_characters_v452(v_team_id, p_actor_member_id), true);
  end if;
  return v_result;
end
$function$;

create or replace function private.kinojo_sm_enrich_teams_v452(p_teams jsonb, p_actor_member_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(private.kinojo_sm_enrich_team_v452(item, p_actor_member_id) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
$function$;

create or replace function private.kinojo_sm_enrich_composer_v452(p_composer jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (coalesce(p_composer, '{}'::jsonb) - 'characters') || jsonb_build_object(
    'characters', coalesce(jsonb_agg(item || jsonb_build_object(
      'power', character.latest_pve_combat_power,
      'itemLevel', character.latest_pve_item_level
    ) order by ordinality) filter (where item is not null), '[]'::jsonb)
  )
  from jsonb_array_elements(coalesce(p_composer->'characters', '[]'::jsonb)) with ordinality source(item, ordinality)
  left join public.character_master character on character.id = nullif(item->>'characterId', '')::bigint
$function$;

create or replace function private.kinojo_sm_sanctuaries_v452(p_sanctuaries jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'entryModes', coalesce(master.metadata->'entryModes', '[]'::jsonb),
    'defaultDifficulty', case when master.code = 'kaldrix' then upper(coalesce(master.metadata->>'waitlistDefaultMode', 'normal')) else 'NORMAL' end
  ) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_sanctuaries, '[]'::jsonb)) with ordinality source(item, ordinality)
  left join public.sanctuary_master master on master.id = nullif(item->>'id', '')::bigint
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v452(p_credential text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v451(p_credential);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
begin
  return (v_base - 'teams' - 'sanctuaries' - 'composerCharacters' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452,
    'teams', private.kinojo_sm_enrich_teams_v452(v_base->'teams', v_actor_id),
    'sanctuaries', private.kinojo_sm_sanctuaries_v452(v_base->'sanctuaries'),
    'composerCharacters', private.kinojo_sm_enrich_composer_v452(v_base->'composerCharacters')
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v452()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'teams' - 'sanctuaries' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452,
    'teams', private.kinojo_sm_enrich_teams_v452(base->'teams', null),
    'sanctuaries', private.kinojo_sm_sanctuaries_v452(base->'sanctuaries')
  ) from (select public.kinojo_sanctuary_management_public_bootstrap_v451() base) source
$function$;

create or replace function public.kinojo_sanctuary_management_month_v452(p_credential text, p_month date)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452)
  from (select public.kinojo_sanctuary_management_month_v451(p_credential, p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v452(p_month date)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452)
  from (select public.kinojo_sanctuary_management_public_month_v451(p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_linked_alts_v452(
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

  select coalesce(jsonb_agg(item || jsonb_build_object(
    'itemLevel', character.latest_pve_item_level,
    'power', character.latest_pve_combat_power
  ) order by character.character_name, character.id), '[]'::jsonb) into v_characters
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
    'isMain', false
  ) source(item)
  where character.id <> v_root_id
    and character.main_character_id = v_root_id
    and coalesce(character.is_active, true)
    and not coalesce(character.lookup_excluded, false)
    and (v_minimum is null or character.latest_pve_item_level >= v_minimum);

  -- A random-alt reservation needs an actual owner because later support and
  -- slot invariants enforce one real character per member/force. Linked guest
  -- alts remain selectable individually even when no member owner is known.
  if v_owner.owner_member_id is not null and jsonb_array_length(v_characters) > 0 then
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
    'schemaVersion', 452,
    'databaseContract', 452,
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

create or replace function public.kinojo_sanctuary_management_character_search_v452(
  p_credential text, p_team_id bigint, p_character_name text, p_server_name text default '지켈'
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_character_search_v432(p_credential, p_team_id, p_character_name, p_server_name);
  v_character_id bigint; v_character public.character_master%rowtype; v_server public.server_master%rowtype;
begin
  v_character_id := nullif(v_base->'character'->>'characterId', '')::bigint;
  if v_character_id is null then return v_base || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452); end if;
  select * into v_character from public.character_master where id = v_character_id;
  if v_character.latest_pve_combat_power is not null and v_character.latest_pve_item_level is not null then
    return (v_base - 'character') || jsonb_build_object(
      'character', private.kinojo_sm_character_card_v452(v_character_id),
      'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452
    );
  end if;
  select * into v_server from public.server_master where server_id = v_character.server_id;
  return jsonb_build_object(
    'ok', true, 'source', 'OFFICIAL_REQUIRED', 'officialLookupRequired', true,
    'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452,
    'request', jsonb_build_object('characterName', v_character.character_name, 'serverId', v_character.server_id, 'serverName', coalesce(v_character.server_name, v_server.server_name), 'raceId', v_server.race_id)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_official_record_v452(
  p_credential text, p_team_id bigint, p_requested_character_name text, p_official_payload jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_result jsonb; v_character_id bigint; v_server_id integer; v_name text;
  v_power integer := nullif(p_official_payload->>'pveCombatPower', '')::integer;
  v_item_level integer := nullif(p_official_payload->>'pveItemLevel', '')::integer;
begin
  v_result := public.kinojo_sanctuary_management_official_record_v432(p_credential, p_team_id, p_requested_character_name, p_official_payload);
  v_character_id := nullif(v_result->'character'->>'characterId', '')::bigint;
  v_server_id := nullif(p_official_payload->>'serverId', '')::integer;
  v_name := btrim(coalesce(p_official_payload->>'characterName', ''));
  if v_character_id is not null then
    update public.character_master set
      latest_pve_combat_power = coalesce(v_power, latest_pve_combat_power),
      latest_pve_item_level = coalesce(v_item_level, latest_pve_item_level),
      last_synced_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_character_id;
    v_result := jsonb_set(v_result, '{character}', private.kinojo_sm_character_card_v452(v_character_id), true);
  elsif v_result ? 'candidate' then
    v_result := jsonb_set(v_result, '{candidate}', (v_result->'candidate') || jsonb_build_object('power', v_power, 'itemLevel', v_item_level), true);
  end if;
  return v_result || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
end
$function$;

create or replace function public.kinojo_sanctuary_management_official_materialize_v452(
  p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text,
  p_main_character_id bigint default null, p_request_key text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare
  v_result jsonb; v_character_id bigint; v_payload jsonb; v_power integer; v_item_level integer;
begin
  select official_payload into v_payload from private.sanctuary_management_official_candidates_v432 where candidate_id = p_candidate_id;
  v_result := public.kinojo_sanctuary_management_official_materialize_v446(p_credential, p_team_id, p_candidate_id, p_relation_type, p_main_character_id, p_request_key);
  v_character_id := nullif(v_result->'character'->>'characterId', '')::bigint;
  v_power := nullif(v_payload->>'pveCombatPower', '')::integer;
  v_item_level := nullif(v_payload->>'pveItemLevel', '')::integer;
  if v_character_id is not null then
    update public.character_master set
      latest_pve_combat_power = coalesce(v_power, latest_pve_combat_power),
      latest_pve_item_level = coalesce(v_item_level, latest_pve_item_level),
      last_synced_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_character_id;
    v_result := jsonb_set(v_result, '{character}', private.kinojo_sm_character_card_v452(v_character_id), true);
  end if;
  return v_result || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
end
$function$;

create or replace function private.kinojo_sm_support_payload_v452(
  p_credential text, p_request_key text, p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential); v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_team_id bigint := nullif(p_payload->>'teamId', '')::bigint; v_minimum integer;
  v_assignment jsonb; v_result jsonb := '[]'::jsonb; v_used bigint[] := '{}'::bigint[];
  v_kind text; v_character_id bigint; v_main_id bigint; v_force_id bigint; v_owner record;
begin
  v_minimum := private.kinojo_sm_team_min_item_level_v452(v_team_id);
  for v_assignment in select item from jsonb_array_elements(coalesce(p_payload->'assignments', '[]'::jsonb)) source(item) loop
    v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
    v_kind := upper(coalesce(v_assignment->>'assignmentKind', 'ACTUAL_CHARACTER'));
    if v_kind = 'RANDOM_ALT' then
      v_main_id := nullif(v_assignment->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id or v_owner.root_character_id is distinct from v_main_id then
        raise exception '랜덤 부캐를 신청할 본캐 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;
      select character.id into v_character_id
      from public.character_master character
      where character.main_character_id = v_main_id and character.id <> v_main_id
        and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
        and (v_minimum is null or character.latest_pve_item_level >= v_minimum)
        and not (character.id = any(v_used))
      order by md5(character.id::text || ':' || coalesce(p_request_key, '') || ':' || coalesce(v_force_id::text, '0'))
      limit 1;
      if v_character_id is null then raise exception '해당 성역 아이템레벨을 충족하는 미선택 부캐가 없습니다.' using errcode = 'P0001'; end if;
    else
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if not private.kinojo_sm_character_eligible_v452(v_character_id, v_minimum) then
        raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
    end if;
    v_used := array_append(v_used, v_character_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object('forceId', v_force_id, 'characterId', v_character_id));
  end loop;
  return (p_payload - 'assignments') || jsonb_build_object('assignments', v_result);
end
$function$;

create or replace function public.kinojo_sanctuary_management_command_v452(
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
  v_action text := upper(btrim(coalesce(p_action, ''))); v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_delegate jsonb; v_response jsonb; v_team_id bigint; v_team private.sanctuary_management_teams_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype; v_difficulty text; v_minimum integer;
  v_force jsonb; v_rule jsonb; v_force_no integer; v_force_id bigint; v_party_id bigint;
  v_scope text; v_type text; v_party_no integer; v_count integer; v_item_threshold integer;
begin
  if v_action = 'SUBMIT_SUPPORT' then
    v_delegate := private.kinojo_sm_support_payload_v452(p_credential, p_request_key, v_payload);
    v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_delegate, p_expected_revision);
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
  end if;
  if v_action = 'DECIDE_SUPPORT' and upper(coalesce(v_payload->>'decision', '')) = 'APPROVE' and exists (
    select 1
    from private.sanctuary_management_support_batches_v412 batch
    join private.sanctuary_management_support_items_v412 item on item.support_batch_id = batch.support_batch_id and item.status = 'PENDING'
    where batch.support_batch_id = nullif(v_payload->>'supportBatchId', '')::bigint
      and not private.kinojo_sm_character_eligible_v452(item.character_id, private.kinojo_sm_team_min_item_level_v452(batch.team_id))
  ) then raise exception '현재 성역 아이템레벨을 충족하지 않는 지원 캐릭터가 있습니다.' using errcode = 'P0001'; end if;

  if v_action <> 'SAVE_COMPOSITION' then
    if v_action = 'SET_SLOT' then
      v_team_id := nullif(v_payload->>'teamId', '')::bigint;
      if v_payload->>'characterId' is not null and not private.kinojo_sm_character_eligible_v452(
        nullif(v_payload->>'characterId', '')::bigint, private.kinojo_sm_team_min_item_level_v452(v_team_id)
      ) then raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001'; end if;
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_payload, p_expected_revision);
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
  end if;

  v_team_id := nullif(v_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    select * into v_sanctuary from public.sanctuary_master where id = v_team.sanctuary_id;
  else
    select * into v_sanctuary from public.sanctuary_master where code = btrim(v_payload->>'sanctuaryCode') and management_visible;
  end if;
  if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  v_difficulty := upper(coalesce(nullif(v_payload->>'difficulty', ''), case when v_sanctuary.code = 'kaldrix' then 'NORMAL' else 'NORMAL' end));
  if (v_sanctuary.code = 'kaldrix' and v_difficulty not in ('NORMAL', 'HARD'))
     or (v_sanctuary.code <> 'kaldrix' and v_difficulty <> 'NORMAL') then
    raise exception '선택한 성역 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  v_minimum := private.kinojo_sm_min_item_level_v452(v_sanctuary.id, v_difficulty);
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where nullif(slot_item->>'characterId', '')::bigint is not null
      and not private.kinojo_sm_character_eligible_v452(nullif(slot_item->>'characterId', '')::bigint, v_minimum)
  ) then raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
      and not exists (
        select 1 from public.character_master character
        where character.main_character_id = nullif(slot_item->>'mainCharacterId', '')::bigint
          and character.id <> nullif(slot_item->>'mainCharacterId', '')::bigint
          and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
          and (v_minimum is null or character.latest_pve_item_level >= v_minimum)
      )
  ) then raise exception '해당 성역 아이템레벨을 충족하는 부캐가 없어 랜덤 부캐를 배치할 수 없습니다.' using errcode = 'P0001'; end if;

  if coalesce(nullif(v_payload->>'compositionRulesVersion', '')::integer, 0) not in (0, 1, 2) then
    raise exception '포스 구성 조건 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    where jsonb_typeof(coalesce(force_item->'requirements', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(force_item->'requirements', '[]'::jsonb)) > 6
      or exists (
        select 1 from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(coalesce(rule_item->>'ruleType', '')) not in ('MAIN_MIN', 'POWER_MIN', 'ITEM_LEVEL_MIN')
          or upper(coalesce(rule_item->>'scopeType', '')) not in ('FORCE', 'PARTY')
          or nullif(rule_item->>'minimumCount', '')::integer is null
          or nullif(rule_item->>'minimumCount', '')::integer not between 1 and
            case when upper(coalesce(rule_item->>'scopeType', '')) = 'PARTY' then 5 else 10 end
          or (upper(coalesce(rule_item->>'scopeType', '')) = 'FORCE' and rule_item->>'partyNo' is not null)
          or (upper(coalesce(rule_item->>'scopeType', '')) = 'PARTY' and
            coalesce(nullif(rule_item->>'partyNo', '')::integer, 0) not in (1, 2))
          or (upper(coalesce(rule_item->>'ruleType', '')) = 'MAIN_MIN' and (
            rule_item->>'powerThreshold' is not null or rule_item->>'itemLevelThreshold' is not null
          ))
          or (upper(coalesce(rule_item->>'ruleType', '')) = 'POWER_MIN' and (
            nullif(rule_item->>'powerThreshold', '')::integer is null
            or nullif(rule_item->>'powerThreshold', '')::integer not between 1000 and 1000000000
            or rule_item->>'itemLevelThreshold' is not null
          ))
          or (upper(rule_item->>'ruleType') = 'ITEM_LEVEL_MIN' and (
            nullif(rule_item->>'itemLevelThreshold', '')::integer is null
            or nullif(rule_item->>'itemLevelThreshold', '')::integer not between 1 and 100000
            or (v_minimum is not null and nullif(rule_item->>'itemLevelThreshold', '')::integer < v_minimum)
            or rule_item->>'powerThreshold' is not null
          ))
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        group by upper(coalesce(rule_item->>'scopeType', '')),
          coalesce(rule_item->>'partyNo', '0'), upper(coalesce(rule_item->>'ruleType', ''))
        having count(*) > 1
      )
      or exists (
        select 1 from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(rule_item->>'ruleType') in ('POWER_MIN', 'ITEM_LEVEL_MIN')
        group by upper(rule_item->>'scopeType'), coalesce(rule_item->>'partyNo', '0') having count(*) > 1
      )
  ) then raise exception '본캐·전투력·아이템레벨 배치 조건을 다시 확인해 주세요.' using errcode = 'P0001'; end if;

  select jsonb_agg((force_item - 'requirements') || jsonb_build_object('requirements', coalesce((
    select jsonb_agg(rule_item order by rule_ordinality)
    from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) with ordinality rules(rule_item, rule_ordinality)
    where upper(coalesce(rule_item->>'ruleType', '')) <> 'ITEM_LEVEL_MIN'
  ), '[]'::jsonb)) order by force_ordinality) into v_delegate
  from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) with ordinality forces(force_item, force_ordinality);
  v_delegate := (v_payload - 'composition' - 'compositionRulesVersion') || jsonb_build_object(
    'composition', coalesce(v_delegate, '[]'::jsonb), 'compositionRulesVersion', 1
  );
  v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_delegate, p_expected_revision);
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if coalesce((v_response->>'replayed')::boolean, false) is not true then
    update private.sanctuary_management_teams_v412 set difficulty = v_difficulty, updated_at = clock_timestamp() where team_id = v_team_id;
    for v_force, v_force_no in
      select force_item, ordinality::integer from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) with ordinality source(force_item, ordinality)
    loop
      select force_id into strict v_force_id from private.sanctuary_management_forces_v412 where team_id = v_team_id and force_no = v_force_no;
      for v_rule in select rule_item from jsonb_array_elements(coalesce(v_force->'requirements', '[]'::jsonb)) source(rule_item)
      loop
        v_type := upper(v_rule->>'ruleType');
        if v_type = 'ITEM_LEVEL_MIN' then
          v_scope := upper(v_rule->>'scopeType'); v_party_no := nullif(v_rule->>'partyNo', '')::integer;
          v_count := nullif(v_rule->>'minimumCount', '')::integer; v_item_threshold := nullif(v_rule->>'itemLevelThreshold', '')::integer;
          v_party_id := null;
          if v_scope = 'PARTY' then select party_id into strict v_party_id from private.sanctuary_management_parties_v412 where force_id = v_force_id and party_no = v_party_no; end if;
          insert into private.sanctuary_management_composition_rules_v449(
            team_id, force_id, party_id, scope_type, rule_type, minimum_count,
            power_threshold, item_level_threshold, created_by_member_id, updated_by_member_id
          ) values (
            v_team_id, v_force_id, v_party_id, v_scope, v_type, v_count,
            null, v_item_threshold, nullif(private.kinojo_sm_actor_v412(p_credential)->>'memberId', '')::bigint,
            nullif(private.kinojo_sm_actor_v412(p_credential)->>'memberId', '')::bigint
          );
        end if;
      end loop;
    end loop;
  end if;
  return v_response || jsonb_build_object(
    'difficulty', v_difficulty, 'minimumItemLevel', v_minimum, 'compositionRulesVersion', 2,
    'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_balance_proposal_v452(
  p_credential text, p_team_id bigint, p_expected_revision bigint, p_lease_token text,
  p_stable_seed text, p_proposal_token text, p_lock_overrides jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare v_minimum integer := private.kinojo_sm_team_min_item_level_v452(p_team_id); v_result jsonb;
begin
  if exists (
    select 1 from private.sanctuary_management_support_items_v412 item
    join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
    where batch.team_id = p_team_id and item.status = 'PENDING'
      and not private.kinojo_sm_character_eligible_v452(item.character_id, v_minimum)
  ) then raise exception '아이템레벨 조건이 바뀐 지원자가 있어 지원 현황을 먼저 정리해 주세요.' using errcode = 'P0001'; end if;
  v_result := public.kinojo_sanctuary_management_balance_proposal_v451(
    p_credential, p_team_id, p_expected_revision, p_lease_token, p_stable_seed, p_proposal_token, p_lock_overrides
  );
  return v_result || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
end
$function$;

comment on column private.sanctuary_management_teams_v412.difficulty is 'NORMAL or HARD. HARD is valid only for Sanctuary 3 and is revalidated by the v452 command boundary.';
comment on function private.kinojo_sm_min_item_level_v452(bigint, text) is 'Reads the authoritative minimum from sanctuary_master.metadata.entryModes. No WEB threshold fallback.';
comment on function public.kinojo_sanctuary_management_command_v452(text, text, text, jsonb, bigint) is 'Service-role boundary for difficulty, automatic item-level eligibility, mutually exclusive power/item-level rules and stable random-alt support selection.';

revoke all on function private.kinojo_sm_min_item_level_v452(bigint, text) from public, anon, authenticated;
revoke all on function private.kinojo_sm_team_min_item_level_v452(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_character_eligible_v452(bigint, integer) from public, anon, authenticated;
revoke all on function private.kinojo_sm_character_card_v452(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_scope_requirements_v452(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v452(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_characters_v452(bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_team_v452(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_teams_v452(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_composer_v452(jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_sanctuaries_v452(jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_support_payload_v452(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v452(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v452() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v452(text, date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v452(date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_linked_alts_v452(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_character_search_v452(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_official_record_v452(text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v452(text, bigint, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v452(text, text, text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_balance_proposal_v452(text, bigint, bigint, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_bootstrap_v452(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v452() to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v452(text, date) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v452(date) to service_role;
grant execute on function public.kinojo_sanctuary_management_linked_alts_v452(text, bigint, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_character_search_v452(text, bigint, text, text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_record_v452(text, bigint, text, jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v452(text, bigint, uuid, text, bigint, text) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v452(text, text, text, jsonb, bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_balance_proposal_v452(text, bigint, bigint, text, text, text, jsonb) to service_role;
