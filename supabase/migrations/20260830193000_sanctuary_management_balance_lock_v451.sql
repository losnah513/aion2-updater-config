-- Stage 8 part 3: placement locks and deterministic, expiring balance proposals.
-- Proposals are service-only metadata. Operational roster/support rows change only
-- when SAVE_COMPOSITION validates and consumes the proposal in one transaction.

alter table private.sanctuary_management_slots_v412
  add column if not exists placement_locked boolean not null default false;

create index if not exists sanctuary_management_slots_v451_team_locked_idx
  on private.sanctuary_management_slots_v412(team_id, force_id, party_id, slot_no)
  where placement_locked;

create table if not exists private.sanctuary_management_balance_proposals_v451 (
  proposal_id bigint generated always as identity primary key,
  team_id bigint not null references private.sanctuary_management_teams_v412(team_id) on delete cascade,
  actor_member_id bigint not null references public.member_codes(id) on delete cascade,
  team_revision bigint not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  stable_seed text not null check (char_length(stable_seed) between 8 and 120),
  candidate_hash text not null check (char_length(candidate_hash) = 64),
  composition_hash text not null check (char_length(composition_hash) = 64),
  lock_overrides jsonb not null default '[]'::jsonb check (jsonb_typeof(lock_overrides) = 'array'),
  assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(assignments) = 'array'),
  excluded jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded) = 'array'),
  before_averages jsonb not null default '[]'::jsonb check (jsonb_typeof(before_averages) = 'array'),
  after_averages jsonb not null default '[]'::jsonb check (jsonb_typeof(after_averages) = 'array'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_request_key text,
  created_at timestamptz not null default clock_timestamp(),
  check (consumed_request_key is null or char_length(consumed_request_key) between 8 and 120)
);

alter table private.sanctuary_management_balance_proposals_v451 enable row level security;

create index if not exists sanctuary_management_balance_v451_team_actor_expiry_idx
  on private.sanctuary_management_balance_proposals_v451(team_id, actor_member_id, expires_at desc);
create index if not exists sanctuary_management_balance_v451_actor_created_idx
  on private.sanctuary_management_balance_proposals_v451(actor_member_id, created_at desc);

create or replace function private.kinojo_sm_lock_value_v451(
  p_slot_id bigint,
  p_lock_overrides jsonb,
  p_fallback boolean
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select case lower(coalesce(item->>'locked', 'false'))
        when 'true' then true when 'false' then false else null end
      from jsonb_array_elements(coalesce(p_lock_overrides, '[]'::jsonb)) source(item)
      where nullif(item->>'slotId', '')::bigint = p_slot_id
      limit 1
    ),
    coalesce(p_fallback, false)
  )
$function$;

create or replace function private.kinojo_sm_balance_candidate_hash_v451(
  p_team_id bigint,
  p_lock_overrides jsonb default '[]'::jsonb
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  with team_state as (
    select jsonb_build_object(
      'teamId', team.team_id,
      'revision', team.revision,
      'status', team.status,
      'mode', team.team_mode,
      'joinPolicy', team.join_policy
    ) payload
    from private.sanctuary_management_teams_v412 team
    where team.team_id = p_team_id
  ), slot_state as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'slotId', slot.slot_id,
      'forceId', slot.force_id,
      'partyNo', party.party_no,
      'slotNo', slot.slot_no,
      'revision', slot.revision,
      'characterId', slot.character_id,
      'ownerMemberId', slot.owner_member_id,
      'rootCharacterId', slot.owner_root_character_id,
      'relation', slot.character_relation,
      'assignmentKind', slot.assignment_kind,
      'requiredClassCode', slot.required_class_code,
      'placementLocked', private.kinojo_sm_lock_value_v451(slot.slot_id, p_lock_overrides, slot.placement_locked)
    ) order by force.force_no, party.party_no, slot.slot_no), '[]'::jsonb) payload
    from private.sanctuary_management_slots_v412 slot
    join private.sanctuary_management_forces_v412 force on force.force_id = slot.force_id
    join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
    where slot.team_id = p_team_id
  ), support_state as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'supportItemId', item.support_item_id,
      'supportBatchId', item.support_batch_id,
      'forceId', item.force_id,
      'characterId', item.character_id,
      'ownerMemberId', item.owner_member_id,
      'rootCharacterId', item.owner_root_character_id,
      'itemStatus', item.status,
      'batchStatus', batch.status,
      'classCode', private.kinojo_sm_class_code_v450(character.class_name),
      'power', coalesce(character.latest_pve_combat_power, 0),
      'conflicts', private.kinojo_sm_conflicts_for_participant_v412(
        p_team_id, item.owner_member_id, item.owner_root_character_id
      )
    ) order by item.support_item_id), '[]'::jsonb) payload
    from private.sanctuary_management_support_items_v412 item
    join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
    join public.character_master character on character.id = item.character_id
    where batch.team_id = p_team_id and item.status = 'PENDING'
  )
  select encode(sha256(convert_to(jsonb_build_object(
    'team', coalesce((select payload from team_state), '{}'::jsonb),
    'slots', (select payload from slot_state),
    'pendingSupport', (select payload from support_state)
  )::text, 'UTF8')), 'hex')
$function$;

create or replace function private.kinojo_sm_composition_hash_v451(
  p_composition jsonb
)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  with normalized_forces as (
    select ordinality::integer force_no,
      nullif(force_item->>'sourceForceId', '')::bigint source_force_id,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'partyNo', nullif(slot_item->>'partyNo', '')::integer,
          'slotNo', nullif(slot_item->>'slotNo', '')::integer,
          'characterId', nullif(slot_item->>'characterId', '')::bigint,
          'mainCharacterId', nullif(slot_item->>'mainCharacterId', '')::bigint,
          'assignmentKind', upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')),
          'requiredClassCode', upper(coalesce(slot_item->>'requiredClassCode', 'ALL')),
          'placementLocked', coalesce((slot_item->>'placementLocked')::boolean, false)
        ) order by nullif(slot_item->>'partyNo', '')::integer, nullif(slot_item->>'slotNo', '')::integer), '[]'::jsonb)
        from jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slots(slot_item)
      ) slots
    from jsonb_array_elements(coalesce(p_composition, '[]'::jsonb)) with ordinality forces(force_item, ordinality)
  )
  select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
    'forceNo', force_no,
    'sourceForceId', source_force_id,
    'slots', slots
  ) order by force_no), '[]'::jsonb)::text, 'UTF8')), 'hex')
  from normalized_forces
$function$;

create or replace function private.kinojo_sm_force_roster_v451(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v450(p_team_id);
  v_forces jsonb := '[]'::jsonb;
  v_parties jsonb;
  v_slots jsonb;
  v_force jsonb;
  v_party jsonb;
  v_slot jsonb;
  v_locked boolean;
begin
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    v_parties := '[]'::jsonb;
    for v_party in select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item) loop
      v_slots := '[]'::jsonb;
      for v_slot in select item from jsonb_array_elements(coalesce(v_party->'slots', '[]'::jsonb)) source(item) loop
        select placement_locked into strict v_locked
        from private.sanctuary_management_slots_v412
        where slot_id = nullif(v_slot->>'slotId', '')::bigint;
        v_slots := v_slots || jsonb_build_array(v_slot || jsonb_build_object('placementLocked', v_locked));
      end loop;
      v_parties := v_parties || jsonb_build_array((v_party - 'slots') || jsonb_build_object('slots', v_slots));
    end loop;
    v_forces := v_forces || jsonb_build_array((v_force - 'parties') || jsonb_build_object('parties', v_parties));
  end loop;
  return (v_roster - 'forces') || jsonb_build_object('forces', v_forces);
end
$function$;

create or replace function private.kinojo_sm_enrich_team_v451(p_team jsonb, p_actor_member_id bigint)
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
  v_roster := private.kinojo_sm_force_roster_v451(v_team_id);
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    select item into v_viewer_force
    from jsonb_array_elements(coalesce(p_team->'forces', '[]'::jsonb)) source(item)
    where nullif(item->>'forceId', '')::bigint = nullif(v_force->>'forceId', '')::bigint limit 1;
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

create or replace function private.kinojo_sm_enrich_teams_v451(p_teams jsonb, p_actor_member_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(private.kinojo_sm_enrich_team_v451(item, p_actor_member_id) order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
$function$;

create or replace function public.kinojo_sanctuary_management_balance_proposal_v451(
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
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_candidate record;
  v_slot record;
  v_assignments jsonb := '[]'::jsonb;
  v_excluded jsonb := '[]'::jsonb;
  v_before jsonb;
  v_after jsonb;
  v_composition jsonb;
  v_candidate_hash text;
  v_composition_hash text;
  v_token_hash text;
  v_class_code text;
  v_conflicts jsonb;
  v_reason_code text;
  v_reason_message text;
  v_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, 'BALANCE_PROPOSAL');
  perform private.kinojo_sm_assert_write_enabled_v412();
  if v_actor_id is null then raise exception '로그인 후 균형 배치를 이용해 주세요.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_stable_seed, ''))) not between 8 and 120
     or char_length(btrim(coalesce(p_proposal_token, ''))) not between 32 and 180 then
    raise exception '균형 배치 제안 식별값을 다시 만들어 주세요.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_lock_overrides, '[]'::jsonb)) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(coalesce(p_lock_overrides, '[]'::jsonb)) item
       where nullif(item->>'slotId', '')::bigint is null
          or lower(coalesce(item->>'locked', '')) not in ('true', 'false')
     )
     or (select count(*) <> count(distinct nullif(item->>'slotId', '')::bigint)
           from jsonb_array_elements(coalesce(p_lock_overrides, '[]'::jsonb)) item) then
    raise exception '배치 잠금 상태를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lock_overrides, '[]'::jsonb)) item
    where not exists (
      select 1 from private.sanctuary_management_slots_v412 slot
      where slot.slot_id = nullif(item->>'slotId', '')::bigint and slot.team_id = p_team_id
    )
  ) then raise exception '잠금 대상 슬롯이 현재 팀과 일치하지 않습니다.' using errcode = '40001'; end if;

  select * into v_team from private.sanctuary_management_teams_v412 where team_id = p_team_id for update;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, p_team_id) then
    raise exception '균형 배치를 제안할 권한이 없습니다.' using errcode = 'P0001';
  end if;
  if v_team.status not in ('ACTIVE', 'FULL') then raise exception '운영 중인 팀에서만 균형 배치를 제안할 수 있습니다.' using errcode = 'P0001'; end if;
  if p_expected_revision is null or v_team.revision <> p_expected_revision then
    raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
  end if;
  perform private.kinojo_sm_assert_lease_v433(v_actor_id, p_team_id, p_lease_token);

  v_candidate_hash := private.kinojo_sm_balance_candidate_hash_v451(p_team_id, p_lock_overrides);
  select coalesce(jsonb_agg(jsonb_build_object(
    'forceId', force.force_id,
    'forceNo', force.force_no,
    'average', coalesce(nullif(power.payload->>'average', '')::bigint, 0),
    'knownCount', coalesce(nullif(power.payload->>'knownCount', '')::integer, 0),
    'occupiedCount', coalesce(nullif(power.payload->>'occupiedCount', '')::integer, 0)
  ) order by force.force_no), '[]'::jsonb)
  into v_before
  from private.sanctuary_management_forces_v412 force
  cross join lateral (select private.kinojo_sm_combat_power_v449(p_team_id, force.force_id, null) payload) power
  where force.team_id = p_team_id;

  for v_candidate in
    select item.support_item_id, item.support_batch_id, item.force_id, force.force_no,
      item.character_id, item.owner_member_id, item.owner_root_character_id,
      character.character_name, character.server_name, character.class_name,
      coalesce(character.latest_pve_combat_power, 0)::bigint power
    from private.sanctuary_management_support_items_v412 item
    join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
    join private.sanctuary_management_forces_v412 force on force.force_id = item.force_id
    join public.character_master character on character.id = item.character_id
    where batch.team_id = p_team_id and item.status = 'PENDING'
    order by coalesce(character.latest_pve_combat_power, 0) desc,
      md5(btrim(p_stable_seed) || ':' || item.support_item_id::text), item.support_item_id
  loop
    v_reason_code := null; v_reason_message := null;
    v_class_code := private.kinojo_sm_class_code_v450(v_candidate.class_name);
    v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(
      p_team_id, v_candidate.owner_member_id, v_candidate.owner_root_character_id
    );
    if v_class_code is null then
      v_reason_code := 'CHARACTER_CLASS_UNKNOWN'; v_reason_message := '캐릭터 클래스를 확인할 수 없습니다.';
    elsif exists (select 1 from private.sanctuary_management_slots_v412 where team_id = p_team_id and character_id = v_candidate.character_id) then
      v_reason_code := 'CHARACTER_ALREADY_IN_TEAM'; v_reason_message := '이 캐릭터가 이미 팀에 배치되어 있습니다.';
    elsif exists (select 1 from private.sanctuary_management_slots_v412 where force_id = v_candidate.force_id and owner_member_id = v_candidate.owner_member_id) then
      v_reason_code := 'OWNER_ALREADY_IN_FORCE'; v_reason_message := '지원한 포스에 같은 이용자의 캐릭터가 이미 있습니다.';
    elsif jsonb_array_length(v_conflicts) > 0 then
      v_reason_code := 'SCHEDULE_CONFLICT'; v_reason_message := v_conflicts->0->>'message';
    else
      select slot.slot_id, slot.force_id, force.force_no, party.party_no, slot.slot_no
      into v_slot
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_forces_v412 force on force.force_id = slot.force_id
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.team_id = p_team_id and slot.force_id = v_candidate.force_id
        and slot.assignment_kind = 'ACTUAL_CHARACTER' and slot.character_id is null and slot.owner_member_id is null
        and not private.kinojo_sm_lock_value_v451(slot.slot_id, p_lock_overrides, slot.placement_locked)
        and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
        and not exists (
          select 1 from jsonb_array_elements(v_assignments) proposed
          where nullif(proposed->>'slotId', '')::bigint = slot.slot_id
        )
      order by (
        select count(*) from private.sanctuary_management_slots_v412 occupied
        where occupied.party_id = slot.party_id and (occupied.character_id is not null or occupied.assignment_kind = 'RANDOM_ALT')
      ), md5(btrim(p_stable_seed) || ':slot:' || slot.slot_id::text), party.party_no, slot.slot_no
      limit 1;
      if v_slot.slot_id is null then
        v_reason_code := 'NO_ELIGIBLE_UNLOCKED_SLOT'; v_reason_message := '지원 클래스가 들어갈 잠금 해제 빈 슬롯이 없습니다.';
      end if;
    end if;
    if v_reason_code is not null then
      v_excluded := v_excluded || jsonb_build_array(jsonb_build_object(
        'supportItemId', v_candidate.support_item_id, 'forceId', v_candidate.force_id,
        'forceNo', v_candidate.force_no, 'characterId', v_candidate.character_id,
        'characterName', v_candidate.character_name, 'reasonCode', v_reason_code,
        'reasonMessage', v_reason_message
      ));
    else
      v_assignments := v_assignments || jsonb_build_array(jsonb_build_object(
        'supportItemId', v_candidate.support_item_id,
        'supportBatchId', v_candidate.support_batch_id,
        'slotId', v_slot.slot_id,
        'forceId', v_slot.force_id,
        'forceNo', v_slot.force_no,
        'partyNo', v_slot.party_no,
        'slotNo', v_slot.slot_no,
        'characterId', v_candidate.character_id,
        'ownerMemberId', v_candidate.owner_member_id,
        'mainCharacterId', v_candidate.owner_root_character_id,
        'characterName', v_candidate.character_name,
        'serverName', v_candidate.server_name,
        'className', v_candidate.class_name,
        'relation', case when v_candidate.character_id = v_candidate.owner_root_character_id then 'MAIN' else 'ALT' end,
        'power', v_candidate.power
      ));
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'forceId', force.force_id,
    'forceNo', force.force_no,
    'average', case when coalesce(nullif(base.payload->>'knownCount', '')::integer, 0) + added.known_count > 0
      then round((coalesce(nullif(base.payload->>'total', '')::bigint, 0) + added.total)::numeric
        / (coalesce(nullif(base.payload->>'knownCount', '')::integer, 0) + added.known_count))::bigint else 0 end,
    'knownCount', coalesce(nullif(base.payload->>'knownCount', '')::integer, 0) + added.known_count,
    'occupiedCount', coalesce(nullif(base.payload->>'occupiedCount', '')::integer, 0) + added.added_count
  ) order by force.force_no), '[]'::jsonb)
  into v_after
  from private.sanctuary_management_forces_v412 force
  cross join lateral (select private.kinojo_sm_combat_power_v449(p_team_id, force.force_id, null) payload) base
  cross join lateral (
    select coalesce(sum(nullif(proposed->>'power', '')::bigint), 0)::bigint total,
      count(*) filter (where nullif(proposed->>'power', '')::bigint > 0)::integer known_count,
      count(*)::integer added_count
    from jsonb_array_elements(v_assignments) proposed
    where nullif(proposed->>'forceId', '')::bigint = force.force_id
  ) added
  where force.team_id = p_team_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceForceId', force.force_id,
    'slots', (
      select jsonb_agg(jsonb_build_object(
        'partyNo', party.party_no,
        'slotNo', slot.slot_no,
        'characterId', case when proposed.item is not null then nullif(proposed.item->>'characterId', '')::bigint else slot.character_id end,
        'mainCharacterId', case when proposed.item is not null then null
          when slot.assignment_kind = 'RANDOM_ALT' then slot.owner_root_character_id else null end,
        'assignmentKind', case when proposed.item is not null then 'ACTUAL_CHARACTER' else slot.assignment_kind end,
        'requiredClassCode', slot.required_class_code,
        'placementLocked', private.kinojo_sm_lock_value_v451(slot.slot_id, p_lock_overrides, slot.placement_locked)
      ) order by party.party_no, slot.slot_no)
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      left join lateral (
        select item from jsonb_array_elements(v_assignments) source(item)
        where nullif(item->>'slotId', '')::bigint = slot.slot_id limit 1
      ) proposed on true
      where slot.force_id = force.force_id
    )
  ) order by force.force_no), '[]'::jsonb)
  into v_composition
  from private.sanctuary_management_forces_v412 force
  where force.team_id = p_team_id;

  v_composition_hash := private.kinojo_sm_composition_hash_v451(v_composition);
  v_token_hash := encode(sha256(convert_to(btrim(p_proposal_token), 'UTF8')), 'hex');
  delete from private.sanctuary_management_balance_proposals_v451
  where actor_member_id = v_actor_id and (expires_at < clock_timestamp() - interval '1 day' or consumed_at < clock_timestamp() - interval '1 day');
  insert into private.sanctuary_management_balance_proposals_v451(
    team_id, actor_member_id, team_revision, token_hash, stable_seed, candidate_hash,
    composition_hash, lock_overrides, assignments, excluded, before_averages,
    after_averages, expires_at
  ) values (
    p_team_id, v_actor_id, v_team.revision, v_token_hash, btrim(p_stable_seed), v_candidate_hash,
    v_composition_hash, p_lock_overrides, v_assignments, v_excluded, v_before, v_after, v_expires_at
  );
  perform private.kinojo_sm_audit_v412(v_actor_id, p_team_id, 'TEAM', p_team_id, 'BALANCE_PROPOSAL',
    null, jsonb_build_object('assignmentCount', jsonb_array_length(v_assignments), 'excludedCount', jsonb_array_length(v_excluded), 'expiresAt', v_expires_at),
    'balance-proposal:' || left(v_token_hash, 24));
  return jsonb_build_object(
    'ok', true, 'teamId', p_team_id, 'revision', v_team.revision,
    'proposalToken', btrim(p_proposal_token), 'expiresAt', v_expires_at,
    'stableSeed', btrim(p_stable_seed), 'strategy', 'REQUESTED_FORCE_POWER_DESC_STABLE_SLOT',
    'assignments', v_assignments, 'excluded', v_excluded,
    'beforeAverages', v_before, 'afterAverages', v_after,
    'assignmentCount', jsonb_array_length(v_assignments), 'excludedCount', jsonb_array_length(v_excluded),
    'compositionHash', v_composition_hash,
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_command_v451(
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
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_team_id bigint := nullif(p_payload->>'teamId', '')::bigint;
  v_proposal private.sanctuary_management_balance_proposals_v451%rowtype;
  v_proposal_token text := btrim(coalesce(p_payload->>'balanceProposalToken', ''));
  v_response jsonb;
  v_before_locks jsonb;
  v_after_locks jsonb;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_assignment jsonb;
  v_force_id bigint;
  v_slot_id bigint;
  v_force_no integer;
  v_locked boolean;
  v_batch_id bigint;
  v_pending integer;
  v_applied integer;
  v_rejected integer;
  v_cancelled integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    if v_action = 'SET_SLOT' and exists (
      select 1 from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.team_id = v_team_id and slot.force_id = nullif(p_payload->>'forceId', '')::bigint
        and party.party_no = nullif(p_payload->>'partyNo', '')::integer
        and slot.slot_no = nullif(p_payload->>'slotNo', '')::integer and slot.placement_locked
    ) then raise exception '배치 잠금된 슬롯입니다. 잠금을 해제한 뒤 변경해 주세요.' using errcode = 'P0001'; end if;
    if v_action = 'MOVE_SLOT' and exists (
      select 1 from private.sanctuary_management_slots_v412
      where slot_id in (nullif(p_payload->>'fromSlotId', '')::bigint, nullif(p_payload->>'toSlotId', '')::bigint)
        and placement_locked
    ) then raise exception '배치 잠금된 카드는 이동하거나 교환할 수 없습니다.' using errcode = 'P0001'; end if;
    v_response := public.kinojo_sanctuary_management_command_v450(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where lower(coalesce(slot_item->>'placementLocked', 'false')) not in ('true', 'false')
  ) then raise exception '배치 잠금 상태를 다시 확인해 주세요.' using errcode = 'P0001'; end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || btrim(coalesce(p_request_key, '')), 451));
  select * into v_existing from private.sanctuary_management_commands_v412
  where actor_member_id = v_actor_id and request_key = btrim(coalesce(p_request_key, ''));
  if v_existing.command_id is not null then
    if v_existing.action <> v_action or v_existing.request_hash <> v_hash then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v450(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('replayed', true, 'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '이 팀을 편집할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    if exists (
      select 1
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.team_id = v_team_id and slot.placement_locked
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
          cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
          where nullif(force_item->>'sourceForceId', '')::bigint = slot.force_id
            and nullif(slot_item->>'partyNo', '')::integer = party.party_no
            and nullif(slot_item->>'slotNo', '')::integer = slot.slot_no
            and upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = slot.assignment_kind
            and (
              slot.assignment_kind = 'RANDOM_ALT' and nullif(slot_item->>'mainCharacterId', '')::bigint = slot.owner_root_character_id
              or slot.assignment_kind = 'ACTUAL_CHARACTER' and nullif(slot_item->>'characterId', '')::bigint = slot.character_id
            )
        )
    ) then raise exception '배치 잠금된 카드는 잠금을 해제하기 전까지 위치와 캐릭터를 유지해야 합니다.' using errcode = 'P0001'; end if;
  end if;

  if v_proposal_token <> '' then
    if v_team_id is null then raise exception '새 팀에는 균형 배치 제안 토큰을 사용할 수 없습니다.' using errcode = 'P0001'; end if;
    select * into v_proposal
    from private.sanctuary_management_balance_proposals_v451
    where token_hash = encode(sha256(convert_to(v_proposal_token, 'UTF8')), 'hex') for update;
    if v_proposal.proposal_id is null or v_proposal.team_id <> v_team_id or v_proposal.actor_member_id <> v_actor_id then
      raise exception '균형 배치 제안을 다시 만들어 주세요.' using errcode = 'P0001';
    end if;
    if v_proposal.consumed_at is not null then raise exception '이미 저장에 사용한 균형 배치 제안입니다.' using errcode = 'P0001'; end if;
    if v_proposal.expires_at <= clock_timestamp() then raise exception '균형 배치 제안이 만료되었습니다. 다시 계산해 주세요.' using errcode = '40001'; end if;
    if v_proposal.team_revision <> p_expected_revision
       or v_proposal.candidate_hash <> private.kinojo_sm_balance_candidate_hash_v451(v_team_id, v_proposal.lock_overrides) then
      raise exception '지원자 또는 편성 상태가 바뀌었습니다. 새로고침 후 균형 배치를 다시 계산해 주세요.' using errcode = '40001';
    end if;
    if v_proposal.composition_hash <> private.kinojo_sm_composition_hash_v451(p_payload->'composition') then
      raise exception '균형 배치 제안 이후 편성안이 바뀌었습니다. 제안을 다시 적용해 주세요.' using errcode = '40001';
    end if;
  end if;

  if v_team_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('slotId', slot_id, 'locked', placement_locked) order by slot_id), '[]'::jsonb)
    into v_before_locks from private.sanctuary_management_slots_v412 where team_id = v_team_id;
    update private.sanctuary_management_slots_v412 set placement_locked = false where team_id = v_team_id and placement_locked;
  end if;

  v_response := public.kinojo_sanctuary_management_command_v450(
    p_credential, p_request_key, v_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if coalesce((v_response->>'replayed')::boolean, false) then
    return v_response || jsonb_build_object('apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) with ordinality source(force_item, ordinality)
  loop
    select force_id into strict v_force_id from private.sanctuary_management_forces_v412
    where team_id = v_team_id and force_no = v_force_no;
    for v_slot_item in select slot_item from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) source(slot_item) loop
      v_locked := coalesce((v_slot_item->>'placementLocked')::boolean, false);
      select slot.slot_id into strict v_slot_id
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.force_id = v_force_id
        and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
        and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;
      if v_locked and not exists (
        select 1 from private.sanctuary_management_slots_v412
        where slot_id = v_slot_id and (character_id is not null or assignment_kind = 'RANDOM_ALT')
      ) then raise exception '빈 슬롯은 배치 잠금할 수 없습니다.' using errcode = 'P0001'; end if;
      update private.sanctuary_management_slots_v412
      set placement_locked = v_locked, revision = revision + case when placement_locked is distinct from v_locked then 1 else 0 end,
          updated_at = case when placement_locked is distinct from v_locked then clock_timestamp() else updated_at end
      where slot_id = v_slot_id;
    end loop;
  end loop;

  if v_proposal.proposal_id is not null then
    for v_assignment in select item from jsonb_array_elements(v_proposal.assignments) source(item) loop
      v_slot_id := nullif(v_assignment->>'slotId', '')::bigint;
      if not exists (
        select 1 from private.sanctuary_management_slots_v412 slot
        where slot.slot_id = v_slot_id and slot.team_id = v_team_id
          and slot.force_id = nullif(v_assignment->>'forceId', '')::bigint
          and slot.character_id = nullif(v_assignment->>'characterId', '')::bigint
      ) then raise exception '균형 배치 저장 결과가 제안과 일치하지 않습니다.' using errcode = '40001'; end if;
      update private.sanctuary_management_support_items_v412 set
        status = 'APPLIED', applied_slot_id = v_slot_id, result_code = 'BALANCE_APPLIED',
        result_message = '전투력 균형 배치 제안으로 클래스 조건에 맞는 슬롯에 배치했습니다.', updated_at = clock_timestamp()
      where support_item_id = nullif(v_assignment->>'supportItemId', '')::bigint
        and status = 'PENDING' and force_id = nullif(v_assignment->>'forceId', '')::bigint;
      if not found then raise exception '지원 후보 상태가 바뀌었습니다. 균형 배치를 다시 계산해 주세요.' using errcode = '40001'; end if;
    end loop;
    for v_batch_id in select distinct nullif(item->>'supportBatchId', '')::bigint from jsonb_array_elements(v_proposal.assignments) source(item) loop
      select count(*) filter(where status = 'PENDING')::integer,
             count(*) filter(where status = 'APPLIED')::integer,
             count(*) filter(where status = 'REJECTED')::integer,
             count(*) filter(where status = 'CANCELLED')::integer
      into v_pending, v_applied, v_rejected, v_cancelled
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
      update private.sanctuary_management_support_batches_v412 set
        status = case when v_pending > 0 then 'PARTIAL'
          when v_applied > 0 and (v_rejected > 0 or v_cancelled > 0) then 'PARTIAL'
          when v_applied > 0 then 'APPLIED' else 'REJECTED' end,
        decision_member_id = v_actor_id, decision_note = '균형 배치 저장',
        decided_at = coalesce(decided_at, clock_timestamp()), updated_at = clock_timestamp()
      where support_batch_id = v_batch_id;
    end loop;
    update private.sanctuary_management_balance_proposals_v451 set
      consumed_at = clock_timestamp(), consumed_request_key = btrim(p_request_key)
    where proposal_id = v_proposal.proposal_id;
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, 'BALANCE_APPLY',
      jsonb_build_object('proposalId', v_proposal.proposal_id, 'beforeAverages', v_proposal.before_averages),
      jsonb_build_object('assignmentCount', jsonb_array_length(v_proposal.assignments), 'afterAverages', v_proposal.after_averages), p_request_key);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('slotId', slot_id, 'locked', placement_locked) order by slot_id), '[]'::jsonb)
  into v_after_locks from private.sanctuary_management_slots_v412 where team_id = v_team_id;
  if v_before_locks is distinct from v_after_locks then
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, 'PLACEMENT_LOCK_SAVE', v_before_locks, v_after_locks, p_request_key);
  end if;
  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  return v_response || jsonb_build_object(
    'placementLockedCount', (select count(*) from private.sanctuary_management_slots_v412 where team_id = v_team_id and placement_locked),
    'balanceApplied', v_proposal.proposal_id is not null,
    'balanceAssignmentCount', case when v_proposal.proposal_id is null then 0 else jsonb_array_length(v_proposal.assignments) end,
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451, 'slotContractVersion', 2
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v451(p_credential text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v450(p_credential);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
begin
  return (v_base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451,
    'teams', private.kinojo_sm_enrich_teams_v451(v_base->'teams', v_actor_id)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v451()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451,
    'teams', private.kinojo_sm_enrich_teams_v451(base->'teams', null)
  ) from (select public.kinojo_sanctuary_management_public_bootstrap_v450() base) source
$function$;

create or replace function public.kinojo_sanctuary_management_month_v451(p_credential text, p_month date)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451
  ) from (select public.kinojo_sanctuary_management_month_v450(p_credential, p_month) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v451(p_month date)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select (base - 'apiVersion' - 'schemaVersion' - 'databaseContract') || jsonb_build_object(
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451
  ) from (select public.kinojo_sanctuary_management_public_month_v450(p_month) base) source
$function$;

comment on column private.sanctuary_management_slots_v412.placement_locked is
  'Manager-controlled placement lock. Locked occupied cards must retain their slot and identity until explicitly unlocked and saved.';
comment on table private.sanctuary_management_balance_proposals_v451 is
  'Service-only, expiring proposal metadata binding actor, team revision, candidate state and final composition hash.';
comment on function public.kinojo_sanctuary_management_balance_proposal_v451(text,bigint,bigint,text,text,text,jsonb) is
  'Manager-only deterministic proposal. Respects requested force, class restrictions, schedule conflicts, one owner per force and local lock overrides.';
comment on function public.kinojo_sanctuary_management_command_v451(text,text,text,jsonb,bigint) is
  'Atomic save boundary for placement locks and optional balance proposal consumption; stale or partial states roll back completely.';

revoke all on table private.sanctuary_management_balance_proposals_v451 from public, anon, authenticated;
revoke all on function private.kinojo_sm_lock_value_v451(bigint,jsonb,boolean) from public, anon, authenticated;
revoke all on function private.kinojo_sm_balance_candidate_hash_v451(bigint,jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_composition_hash_v451(jsonb) from public, anon, authenticated;
revoke all on function private.kinojo_sm_force_roster_v451(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_team_v451(jsonb,bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_enrich_teams_v451(jsonb,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_balance_proposal_v451(text,bigint,bigint,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v451(text,text,text,jsonb,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v451(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v451() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v451(text,date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v451(date) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_balance_proposal_v451(text,bigint,bigint,text,text,text,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v451(text,text,text,jsonb,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v451(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v451() to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v451(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v451(date) to service_role;
