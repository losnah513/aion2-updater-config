-- Stage 8 part 1: combat-power summaries and non-blocking composition rules.
-- Rules are stored separately from team/force/party/slot rows. A rule can be
-- unmet without preventing team creation or editing; the read model reports
-- the warning state so the browser can render it consistently.
-- 조건 미충족이어도 팀은 저장·생성되며 Server는 경고 상태만 반환한다.

create table if not exists private.sanctuary_management_composition_rules_v449 (
  composition_rule_id bigint generated always as identity primary key,
  team_id bigint not null references private.sanctuary_management_teams_v412(team_id) on delete cascade,
  force_id bigint references private.sanctuary_management_forces_v412(force_id) on delete cascade,
  party_id bigint references private.sanctuary_management_parties_v412(party_id) on delete cascade,
  scope_type text not null,
  rule_type text not null,
  minimum_count smallint not null,
  power_threshold integer,
  revision bigint not null default 1,
  created_by_member_id bigint references public.member_codes(id) on delete set null,
  updated_by_member_id bigint references public.member_codes(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint sanctuary_management_composition_rules_v449_scope_ck check (
    (scope_type = 'FORCE' and force_id is not null and party_id is null)
    or (scope_type = 'PARTY' and force_id is not null and party_id is not null)
  ),
  constraint sanctuary_management_composition_rules_v449_type_ck check (rule_type in ('MAIN_MIN', 'POWER_MIN')),
  constraint sanctuary_management_composition_rules_v449_count_ck check (minimum_count between 1 and 10),
  constraint sanctuary_management_composition_rules_v449_power_ck check (
    (rule_type = 'MAIN_MIN' and power_threshold is null)
    or (rule_type = 'POWER_MIN' and power_threshold between 1000 and 1000000000)
  )
);

create unique index if not exists sanctuary_management_composition_rules_v449_force_rule_uq
  on private.sanctuary_management_composition_rules_v449(force_id, rule_type)
  where scope_type = 'FORCE';

create unique index if not exists sanctuary_management_composition_rules_v449_party_rule_uq
  on private.sanctuary_management_composition_rules_v449(party_id, rule_type)
  where scope_type = 'PARTY';

create index if not exists sanctuary_management_composition_rules_v449_team_idx
  on private.sanctuary_management_composition_rules_v449(team_id, force_id, party_id);

revoke all on table private.sanctuary_management_composition_rules_v449 from public, anon, authenticated;

create or replace function private.kinojo_sm_combat_power_v449(
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
  select jsonb_build_object(
    'average', coalesce(round(avg(character.latest_pve_combat_power))::bigint, 0),
    'total', coalesce(sum(character.latest_pve_combat_power), 0)::bigint,
    'knownCount', count(character.latest_pve_combat_power)::integer,
    'occupiedCount', count(slot.character_id)::integer,
    'unknownCount', (count(slot.character_id) - count(character.latest_pve_combat_power))::integer
  )
  from private.sanctuary_management_slots_v412 slot
  left join public.character_master character on character.id = slot.character_id
  where slot.team_id = p_team_id
    and slot.force_id = p_force_id
    and (p_party_id is null or slot.party_id = p_party_id)
$function$;

create or replace function private.kinojo_sm_scope_requirements_v449(
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
  ),
  evaluated as (
    select
      rule.composition_rule_id,
      rule.scope_type,
      rule.rule_type,
      rule.minimum_count,
      rule.power_threshold,
      count(slot.character_id) filter (
        where slot.character_id is not null
          and (
            (rule.rule_type = 'MAIN_MIN' and (slot.character_relation = 'MAIN' or coalesce(character.is_main, false)))
            or (rule.rule_type = 'POWER_MIN' and character.latest_pve_combat_power >= rule.power_threshold)
          )
      )::integer as matching_count
    from scoped_rules rule
    left join private.sanctuary_management_slots_v412 slot
      on slot.team_id = p_team_id
     and slot.force_id = p_force_id
     and (p_party_id is null or slot.party_id = p_party_id)
    left join public.character_master character on character.id = slot.character_id
    group by rule.composition_rule_id, rule.scope_type, rule.rule_type, rule.minimum_count, rule.power_threshold
  )
  select jsonb_build_object(
    'satisfied', coalesce(bool_and(evaluated.matching_count >= evaluated.minimum_count), true),
    'ruleCount', count(evaluated.composition_rule_id)::integer,
    'unsatisfiedCount', count(evaluated.composition_rule_id) filter (where evaluated.matching_count < evaluated.minimum_count)::integer,
    'rules', coalesce(jsonb_agg(jsonb_build_object(
      'compositionRuleId', evaluated.composition_rule_id,
      'scopeType', evaluated.scope_type,
      'ruleType', evaluated.rule_type,
      'minimumCount', evaluated.minimum_count,
      'powerThreshold', evaluated.power_threshold,
      'matchingCount', evaluated.matching_count,
      'satisfied', evaluated.matching_count >= evaluated.minimum_count,
      'message', case
        when evaluated.rule_type = 'MAIN_MIN' then '본캐 ' || evaluated.minimum_count || '명 이상'
        else '전투력 ' || trim(to_char(evaluated.power_threshold / 1000.0, 'FM999999990.0')) || 'K 이상 ' || evaluated.minimum_count || '명 이상'
      end
    ) order by evaluated.rule_type), '[]'::jsonb)
  )
  from evaluated
$function$;

create or replace function private.kinojo_sm_force_roster_v449(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
  v_parties jsonb;
  v_party jsonb;
  v_force_id bigint;
  v_party_id bigint;
begin
  v_roster := private.kinojo_sm_force_roster_v430(p_team_id);
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    v_force_id := nullif(v_force->>'forceId', '')::bigint;
    v_parties := '[]'::jsonb;
    for v_party in
      select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item)
    loop
      v_party_id := nullif(v_party->>'partyId', '')::bigint;
      v_parties := v_parties || jsonb_build_array(v_party || jsonb_build_object(
        'combatPower', private.kinojo_sm_combat_power_v449(p_team_id, v_force_id, v_party_id),
        'requirements', private.kinojo_sm_scope_requirements_v449(p_team_id, v_force_id, v_party_id)
      ));
    end loop;
    v_forces := v_forces || jsonb_build_array((v_force - 'parties') || jsonb_build_object(
      'parties', v_parties,
      'combatPower', private.kinojo_sm_combat_power_v449(p_team_id, v_force_id, null),
      'requirements', private.kinojo_sm_scope_requirements_v449(p_team_id, v_force_id, null)
    ));
  end loop;
  return jsonb_set(v_roster, '{forces}', v_forces, true);
end
$function$;

create or replace function private.kinojo_sm_enrich_team_v449(p_team jsonb)
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
begin
  if v_team_id is null then return p_team; end if;
  v_roster := private.kinojo_sm_force_roster_v449(v_team_id);
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    select item into v_viewer_force
      from jsonb_array_elements(coalesce(p_team->'forces', '[]'::jsonb)) source(item)
     where nullif(item->>'forceId', '')::bigint = nullif(v_force->>'forceId', '')::bigint
     limit 1;
    v_forces := v_forces || jsonb_build_array(coalesce(v_viewer_force, '{}'::jsonb) || v_force);
  end loop;
  return (p_team - 'forceCount' - 'slotCount' - 'occupiedCount' - 'vacancyCount' - 'forces')
    || (v_roster - 'forces') || jsonb_build_object('forces', v_forces);
end
$function$;

create or replace function private.kinojo_sm_enrich_teams_v449(p_teams jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(private.kinojo_sm_enrich_team_v449(item) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
$function$;

create or replace function private.kinojo_sm_enrich_composer_v449(p_composer jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (coalesce(p_composer, '{}'::jsonb) - 'characters') || jsonb_build_object(
    'characters', coalesce(jsonb_agg(
      item || jsonb_build_object('power', character.latest_pve_combat_power)
      order by ordinality
    ) filter (where item is not null), '[]'::jsonb)
  )
  from jsonb_array_elements(coalesce(p_composer->'characters', '[]'::jsonb)) with ordinality source(item, ordinality)
  left join public.character_master character on character.id = nullif(item->>'characterId', '')::bigint
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v449(p_credential text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'teams' - 'composerCharacters' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || jsonb_build_object(
      'apiVersion', 1.9,
      'schemaVersion', 449,
      'databaseContract', 449,
      'teams', private.kinojo_sm_enrich_teams_v449(base->'teams'),
      'composerCharacters', private.kinojo_sm_enrich_composer_v449(base->'composerCharacters')
    )
  from (select public.kinojo_sanctuary_management_bootstrap_v446(p_credential) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v449()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || jsonb_build_object(
      'apiVersion', 1.9,
      'schemaVersion', 449,
      'databaseContract', 449,
      'teams', private.kinojo_sm_enrich_teams_v449(base->'teams')
    )
  from (select public.kinojo_sanctuary_management_public_bootstrap_v448() base) source
$function$;

create or replace function public.kinojo_sanctuary_management_month_v449(p_credential text, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || jsonb_build_object('apiVersion', 1.9, 'schemaVersion', 449, 'databaseContract', 449)
  from (select public.kinojo_sanctuary_management_month_v446(p_credential, p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v449(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || jsonb_build_object('apiVersion', 1.9, 'schemaVersion', 449, 'databaseContract', 449)
  from (select public.kinojo_sanctuary_management_public_month_v448(p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_command_v449(
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
  v_rules_version integer := coalesce(nullif(p_payload->>'compositionRulesVersion', '')::integer, 0);
  v_response jsonb;
  v_actor jsonb;
  v_actor_id bigint;
  v_team_id bigint;
  v_force_id bigint;
  v_party_id bigint;
  v_force_item jsonb;
  v_rule_item jsonb;
  v_force_no integer;
  v_scope_type text;
  v_rule_type text;
  v_party_no integer;
  v_minimum_count integer;
  v_power_threshold integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    return public.kinojo_sanctuary_management_command_v446(p_credential, p_request_key, p_action, p_payload, p_expected_revision)
      || jsonb_build_object('apiVersion', 1.9, 'schemaVersion', 449, 'databaseContract', 449);
  end if;

  if v_rules_version not in (0, 1) then
    raise exception '포스 구성 조건 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  if v_rules_version = 1 and exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    where jsonb_typeof(coalesce(force_item->'requirements', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(force_item->'requirements', '[]'::jsonb)) > 6
      or exists (
        select 1
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(coalesce(rule_item->>'scopeType', '')) not in ('FORCE', 'PARTY')
          or upper(coalesce(rule_item->>'ruleType', '')) not in ('MAIN_MIN', 'POWER_MIN')
          or nullif(rule_item->>'minimumCount', '')::integer not between 1 and case when upper(rule_item->>'scopeType') = 'PARTY' then 5 else 10 end
          or (upper(rule_item->>'scopeType') = 'FORCE' and rule_item->>'partyNo' is not null)
          or (upper(rule_item->>'scopeType') = 'PARTY' and nullif(rule_item->>'partyNo', '')::integer not in (1, 2))
          or (upper(rule_item->>'ruleType') = 'MAIN_MIN' and rule_item->>'powerThreshold' is not null)
          or (upper(rule_item->>'ruleType') = 'POWER_MIN' and nullif(rule_item->>'powerThreshold', '')::integer not between 1000 and 1000000000)
      )
      or (
        select count(*) <> count(distinct upper(rule_item->>'scopeType') || ':' || coalesce(rule_item->>'partyNo', '0') || ':' || upper(rule_item->>'ruleType'))
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
      )
  ) then
    raise exception '본캐·전투력 배치 조건을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  v_response := public.kinojo_sanctuary_management_command_v446(
    p_credential, p_request_key, p_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if v_rules_version = 1 and coalesce((v_response->>'replayed')::boolean, false) is not true then
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    delete from private.sanctuary_management_composition_rules_v449 where team_id = v_team_id;

    for v_force_item, v_force_no in
      select force_item, ordinality::integer
      from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb))
        with ordinality force_source(force_item, ordinality)
    loop
      select force.force_id into strict v_force_id
      from private.sanctuary_management_forces_v412 force
      where force.team_id = v_team_id and force.force_no = v_force_no;

      for v_rule_item in
        select rule_item from jsonb_array_elements(coalesce(v_force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
      loop
        v_scope_type := upper(v_rule_item->>'scopeType');
        v_rule_type := upper(v_rule_item->>'ruleType');
        v_party_no := nullif(v_rule_item->>'partyNo', '')::integer;
        v_minimum_count := nullif(v_rule_item->>'minimumCount', '')::integer;
        v_power_threshold := nullif(v_rule_item->>'powerThreshold', '')::integer;
        v_party_id := null;
        if v_scope_type = 'PARTY' then
          select party.party_id into strict v_party_id
          from private.sanctuary_management_parties_v412 party
          where party.force_id = v_force_id and party.party_no = v_party_no;
        end if;
        insert into private.sanctuary_management_composition_rules_v449(
          team_id, force_id, party_id, scope_type, rule_type, minimum_count,
          power_threshold, created_by_member_id, updated_by_member_id
        ) values (
          v_team_id, v_force_id, v_party_id, v_scope_type, v_rule_type, v_minimum_count,
          case when v_rule_type = 'POWER_MIN' then v_power_threshold else null end,
          v_actor_id, v_actor_id
        );
      end loop;
    end loop;
  end if;
  return v_response || jsonb_build_object(
    'apiVersion', 1.9,
    'schemaVersion', 449,
    'databaseContract', 449,
    'compositionRulesVersion', v_rules_version
  );
end
$function$;

comment on table private.sanctuary_management_composition_rules_v449 is
  'Optional non-blocking MAIN_MIN and POWER_MIN rules for one force or party. Unmet rules remain publishable and are reported as warnings.';
comment on function private.kinojo_sm_force_roster_v449(bigint) is
  'Read model for character PvE power, force/party averages and evaluated composition requirements.';
comment on function public.kinojo_sanctuary_management_command_v449(text, text, text, jsonb, bigint) is
  'Service-role Edge boundary. SAVE_COMPOSITION persists the local roster and optional non-blocking requirements in one PostgreSQL transaction.';

revoke all on function private.kinojo_sm_combat_power_v449(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_scope_requirements_v449(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v449(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_team_v449(jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_teams_v449(jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_composer_v449(jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v449(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v449() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v449(text, date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v449(date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v449(text, text, text, jsonb, bigint) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_bootstrap_v449(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v449() to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v449(text, date) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v449(date) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v449(text, text, text, jsonb, bigint) to service_role;
