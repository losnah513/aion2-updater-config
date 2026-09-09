-- Stage14 rollback: restore pre-cutover function bodies/entrypoint permissions.
-- Captured read-only 2026-09-09. Run only after restoring the corresponding Edge/WEB.
-- Existing operators, audits, role choices and legacy personal exceptions are preserved.
begin;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_archive_preview_v437(p_credential text, p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_actor jsonb; v_team private.sanctuary_management_teams_v412%rowtype; v_schedule_id bigint; v_pending integer; v_future integer; v_recurring boolean;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then raise exception '팀 해산 영향을 확인할 권한이 없습니다.' using errcode='P0001'; end if;
  select schedule_id,(schedule_kind='WEEKLY') into v_schedule_id,v_recurring from private.sanctuary_management_schedule_rules_v412 where team_id=p_team_id;
  select count(*)::integer into v_pending from private.sanctuary_management_support_items_v412 i
    join private.sanctuary_management_support_batches_v412 b on b.support_batch_id=i.support_batch_id
    where b.team_id=p_team_id and i.status='PENDING';
  select count(*)::integer into v_future from private.kinojo_sm_rule_occurrences_v437(v_schedule_id,current_date,current_date+366) o;
  return jsonb_build_object('ok',true,'schemaVersion',437,'teamId',p_team_id,'teamTitle',v_team.title,'revision',v_team.revision,
    'canArchive',true,'futureOccurrenceCount',v_future,'futureWindowDays',366,'recurringSchedule',coalesce(v_recurring,false),
    'pendingSupportCount',v_pending,'historyPreserved',true,'message','팀 편성·감사 이력은 보존하고 이후 일정과 승인 대기 지원을 종료합니다.');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_balance_proposal_v451(p_credential text, p_team_id bigint, p_expected_revision bigint, p_lease_token text, p_stable_seed text, p_proposal_token text, p_lock_overrides jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_balance_proposal_v452(p_credential text, p_team_id bigint, p_expected_revision bigint, p_lease_token text, p_stable_seed text, p_proposal_token text, p_lock_overrides jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_balance_proposal_v454(p_credential text, p_team_id bigint, p_expected_revision bigint, p_lease_token text, p_stable_seed text, p_proposal_token text, p_lock_overrides jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_character_search_v432(p_credential text, p_team_id bigint, p_character_name text, p_server_name text DEFAULT '지켈'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_name text:=btrim(coalesce(p_character_name,''));
  v_server_name text:=btrim(coalesce(p_server_name,'지켈'));
  v_server public.server_master%rowtype;
  v_character public.character_master%rowtype;
  v_card jsonb;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  if char_length(v_name) not between 1 and 16 then
    raise exception '캐릭터 이름은 1~16자로 입력해 주세요.' using errcode='P0001';
  end if;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then
    raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001';
  end if;
  if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;

  select * into v_server from public.server_master s
  where s.is_active and (
    public.kinojo_character_identity_key_v298(s.server_name)=public.kinojo_character_identity_key_v298(v_server_name)
    or public.kinojo_character_identity_key_v298(s.server_short_name)=public.kinojo_character_identity_key_v298(v_server_name)
  ) order by (s.server_name=v_server_name) desc limit 1;
  if v_server.server_id is null then raise exception '입력한 서버를 찾을 수 없습니다.' using errcode='P0001'; end if;

  select * into v_character from public.character_master c
  where c.server_id=v_server.server_id
    and public.kinojo_character_identity_key_v298(c.character_name)=public.kinojo_character_identity_key_v298(v_name)
    and c.is_active and c.identity_status='CURRENT'
  order by c.updated_at desc limit 1;
  if v_character.id is not null then
    v_card:=private.kinojo_sm_character_card_v432(v_character.id);
    return jsonb_build_object('ok',true,'schemaVersion',432,'source','CHARACTER_MASTER','officialLookupRequired',false,'character',v_card);
  end if;
  return jsonb_build_object(
    'ok',true,'schemaVersion',432,'source','OFFICIAL_REQUIRED','officialLookupRequired',true,
    'request',jsonb_build_object('characterName',v_name,'serverId',v_server.server_id,'serverName',v_server.server_name,'raceId',v_server.race_id)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_character_search_v452(p_credential text, p_team_id bigint, p_character_name text, p_server_name text DEFAULT '지켈'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_character_search_v457(p_credential text, p_team_id bigint, p_character_name text, p_server_name text DEFAULT '지켈'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_name text := btrim(coalesce(p_character_name, ''));
  v_server_name text := btrim(coalesce(p_server_name, '지켈'));
  v_server public.server_master%rowtype;
  v_character public.character_master%rowtype;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_character_search_v452(
      p_credential,p_team_id,p_character_name,p_server_name
    ) || jsonb_build_object('apiVersion',2.3,'schemaVersion',457,'databaseContract',457);
  end if;

  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 캐릭터를 조회해 주세요.' using errcode='P0001'; end if;
  if char_length(v_name) not between 1 and 16 then raise exception '캐릭터 이름은 1~16자로 입력해 주세요.' using errcode='P0001'; end if;

  select * into v_server
    from public.server_master server
   where server.is_active
     and (
       public.kinojo_character_identity_key_v298(server.server_name)=public.kinojo_character_identity_key_v298(v_server_name)
       or public.kinojo_character_identity_key_v298(server.server_short_name)=public.kinojo_character_identity_key_v298(v_server_name)
     )
   order by (server.server_name=v_server_name) desc
   limit 1;
  if v_server.server_id is null then raise exception '입력한 서버를 찾을 수 없습니다.' using errcode='P0001'; end if;

  select * into v_character
    from public.character_master character
   where character.server_id=v_server.server_id
     and public.kinojo_character_identity_key_v298(character.character_name)=public.kinojo_character_identity_key_v298(v_name)
     and character.is_active and character.identity_status='CURRENT'
   order by character.updated_at desc
   limit 1;

  if v_character.id is not null
     and v_character.latest_pve_combat_power is not null
     and v_character.latest_pve_item_level is not null then
    return jsonb_build_object(
      'ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,
      'source','CHARACTER_MASTER','officialLookupRequired',false,
      'character',private.kinojo_sm_character_card_v452(v_character.id)
    );
  end if;

  return jsonb_build_object(
    'ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,
    'source','OFFICIAL_REQUIRED','officialLookupRequired',true,
    'request',jsonb_build_object(
      'characterName',coalesce(v_character.character_name,v_name),
      'serverId',v_server.server_id,'serverName',v_server.server_name,'raceId',v_server.race_id
    )
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_character_search_v480(p_credential text, p_team_id bigint, p_character_name text, p_server_name text DEFAULT '지켈'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_character_id bigint;
begin
  v_result := public.kinojo_sanctuary_management_character_search_v457(
    p_credential,p_team_id,p_character_name,p_server_name
  );
  v_character_id := nullif(v_result->'character'->>'characterId','')::bigint;
  if v_character_id is not null then
    v_result := jsonb_set(v_result,'{character}',private.kinojo_sm_character_card_v480(v_character_id),true);
  end if;
  return v_result || jsonb_build_object('apiVersion',2.5,'schemaVersion',480,'databaseContract',480);
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_linked_alts_v450(p_credential text, p_team_id bigint, p_main_character_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_linked_alts_v452(p_credential text, p_team_id bigint, p_main_character_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_linked_alts_v453(p_credential text, p_team_id bigint, p_main_character_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_linked_alts_v454(p_credential text, p_team_id bigint, p_main_character_id bigint, p_force_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_linked_alts_v457(p_credential text, p_team_id bigint, p_main_character_id bigint, p_force_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_main public.character_master%rowtype; v_root_id bigint; v_owner record;
  v_characters jsonb; v_random_candidate jsonb;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_linked_alts_v454(p_credential,p_team_id,p_main_character_id,p_force_id)
      || jsonb_build_object('apiVersion',2.3,'schemaVersion',457,'databaseContract',457);
  end if;
  if p_force_id is not null then raise exception '팀 생성 중 포스 식별값을 Server에 보낼 수 없습니다.' using errcode='P0001'; end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'LINKED_ALTS');
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 부캐를 확인해 주세요.' using errcode='P0001'; end if;
  select * into v_main from public.character_master where id=p_main_character_id and coalesce(is_active,true);
  if v_main.id is null then raise exception '본캐를 찾을 수 없습니다.' using errcode='P0001'; end if;
  v_root_id:=coalesce(v_main.main_character_id,case when v_main.is_main then v_main.id else null end);
  if v_root_id is null then raise exception '본캐 관계가 확인된 캐릭터만 부캐를 선택할 수 있습니다.' using errcode='P0001'; end if;
  select * into v_main from public.character_master where id=v_root_id and coalesce(is_active,true);
  select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_root_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'characterId',character.id,'mainCharacterId',v_root_id,'ownerMemberId',v_owner.owner_member_id,
    'characterName',character.character_name,'serverId',character.server_id,'serverName',character.server_name,
    'className',character.class_name,'profileImageUrl',character.profile_image_url,'relation','ALT','isMain',false,
    'itemLevel',character.latest_pve_item_level,'power',character.latest_pve_combat_power,
    'itemLevelEligible',true,'alreadyAssignedToOtherForce',false,'scheduleConflict',false,'disabledCode','','disabledMessage',''
  ) order by character.character_name,character.id),'[]'::jsonb)
  into v_characters
  from public.character_master character
  where character.id<>v_root_id and character.main_character_id=v_root_id
    and coalesce(character.is_active,true) and not coalesce(character.lookup_excluded,false);
  if v_owner.owner_member_id is not null then
    v_random_candidate:=jsonb_build_object('assignmentKind','RANDOM_ALT','mainCharacterId',v_root_id,'ownerMemberId',v_owner.owner_member_id,'characterName',v_main.character_name||'의 랜덤 부캐','serverId',v_main.server_id,'serverName',v_main.server_name,'relation','RANDOM_ALT','isMain',false,'isRandomAlt',true,'power',null,'itemLevel',null);
  end if;
  return jsonb_build_object(
    'ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,'forceId',null,'minimumItemLevel',null,
    'mainCharacter',jsonb_build_object('characterId',v_main.id,'characterName',v_main.character_name,'serverId',v_main.server_id,'serverName',v_main.server_name,'ownerMemberId',v_owner.owner_member_id),
    'randomCandidate',v_random_candidate,'characters',v_characters,'characterCount',jsonb_array_length(v_characters)
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_gate_v432(p_credential text, p_team_id bigint, p_http_status integer, p_retry_after_seconds integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_actor jsonb; v_now timestamptz:=clock_timestamp(); v_pause integer;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  if not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
  v_pause:=case when p_http_status=429 then least(600,greatest(5,coalesce(p_retry_after_seconds,30))) else null end;
  update public.official_lookup_rate_state set
    last_http_status=p_http_status,last_retry_after_seconds=p_retry_after_seconds,
    consecutive_429=case when p_http_status=429 then consecutive_429+1 else 0 end,
    paused_until=case when p_http_status=429 then v_now+make_interval(secs=>v_pause) else paused_until end,
    last_error=left(nullif(btrim(p_error),''),1000),updated_at=v_now
  where provider='plaync';
  return jsonb_build_object('ok',true,'pausedSeconds',v_pause);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_gate_v457(p_credential text, p_team_id bigint, p_http_status integer, p_retry_after_seconds integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_now timestamptz:=clock_timestamp(); v_pause integer;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_official_gate_v432(p_credential,p_team_id,p_http_status,p_retry_after_seconds,p_error)
      || jsonb_build_object('schemaVersion',457,'databaseContract',457);
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
  v_actor := private.kinojo_sm_actor_v412(p_credential); v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 캐릭터를 조회해 주세요.' using errcode='P0001'; end if;
  v_pause := case when p_http_status=429 then least(600,greatest(5,coalesce(p_retry_after_seconds,30))) else null end;
  update public.official_lookup_rate_state set
    last_http_status=p_http_status,last_retry_after_seconds=p_retry_after_seconds,
    consecutive_429=case when p_http_status=429 then consecutive_429+1 else 0 end,
    paused_until=case when p_http_status=429 then v_now+make_interval(secs=>v_pause) else paused_until end,
    last_error=left(nullif(btrim(p_error),''),1000),updated_at=v_now
  where provider='plaync';
  return jsonb_build_object('ok',true,'pausedSeconds',v_pause,'schemaVersion',457,'databaseContract',457);
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_materialize_v432(p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text, p_main_character_id bigint DEFAULT NULL::bigint, p_request_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_team private.sanctuary_management_teams_v412%rowtype; v_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_relation text:=upper(btrim(coalesce(p_relation_type,''))); v_operational boolean; v_main public.character_master%rowtype; v_owner record; v_member_id bigint; v_id bigint; v_now timestamptz:=clock_timestamp();
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id=(v_actor->>'memberId')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id for update;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
  select * into v_candidate from private.sanctuary_management_official_candidates_v432 where candidate_id=p_candidate_id for update;
  if v_candidate.candidate_id is null or v_candidate.actor_member_id<>v_actor_id or v_candidate.team_id<>p_team_id then raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001'; end if;
  if v_candidate.state='MATERIALIZED' and v_candidate.materialized_character_id is not null then return jsonb_build_object('ok',true,'idempotent',true,'character',private.kinojo_sm_character_card_v432(v_candidate.materialized_character_id)); end if;
  if v_candidate.state<>'VERIFIED' or v_candidate.expires_at<=v_now then update private.sanctuary_management_official_candidates_v432 set state='EXPIRED',updated_at=v_now where candidate_id=p_candidate_id and state='VERIFIED'; raise exception '공식 조회 결과가 만료되었습니다. 다시 조회해 주세요.' using errcode='P0001'; end if;
  v_operational:=exists(select 1 from private.sanctuary_operational_legions_v432 where is_active and public.kinojo_normalize_legion_name(legion_name)=public.kinojo_normalize_legion_name(v_candidate.legion_name));
  if (v_operational and v_relation not in('MAIN','ALT')) or (not v_operational and v_relation<>'GUEST') then raise exception '레기온 확인 결과에 맞는 본캐·부캐·게스트 관계를 선택해 주세요.' using errcode='P0001'; end if;
  if v_relation='MAIN' then
    select id into v_member_id from public.member_codes where is_active and public.kinojo_character_identity_key_v298(main_character_name)=public.kinojo_character_identity_key_v298(v_candidate.character_name) order by id limit 1;
    if v_member_id is null then raise exception '본캐 이름과 일치하는 레기온 이용자를 찾을 수 없습니다.' using errcode='P0001'; end if;
  elsif v_relation='ALT' then
    select * into v_main from public.character_master where id=p_main_character_id and is_active and is_main and identity_status='CURRENT';
    if v_main.id is null then raise exception '부캐에 연결할 본캐를 먼저 공식 확인해 주세요.' using errcode='P0001'; end if;
    select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main.id);
    if v_owner.owner_member_id is null or v_owner.relation<>'MAIN' then raise exception '선택한 본캐의 이용자 관계를 확인할 수 없습니다.' using errcode='P0001'; end if;
    v_member_id:=v_owner.owner_member_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sm-character:'||v_candidate.server_id||':'||public.kinojo_character_identity_key_v298(v_candidate.character_name),432));
  select id into v_id from public.character_master where server_id=v_candidate.server_id and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_candidate.character_name) order by is_active desc,updated_at desc limit 1;
  if v_id is null then
    insert into public.character_master(server_id,server_name,character_name,char_key,profile_image_url,detail_url,image_updated_at,status,error_message,main_character_name,is_main,class_name,list_row,first_seen_at,last_seen_at,is_active,lookup_excluded,visibility_excluded,lookup_failure_streak,lookup_failure_total,last_lookup_success_at,main_character_id,identity_status,identity_verified_at,bootstrap_source,bootstrap_imported_at,legion_name,legion_updated_at)
    values(v_candidate.server_id,v_candidate.server_name,v_candidate.character_name,v_candidate.char_key,v_candidate.profile_image_url,v_candidate.detail_url,v_now,'OK',null,case when v_relation='ALT' then v_main.character_name else v_candidate.character_name end,v_relation<>'ALT',v_candidate.class_name,null,v_now,v_now,true,false,false,0,0,v_now,case when v_relation='ALT' then v_main.id else null end,'CURRENT',v_now,'SANCTUARY_MANAGEMENT_OFFICIAL_V432',v_now,v_candidate.legion_name,v_now)
    returning id into v_id;
  end if;
  insert into private.sanctuary_character_owners_v412(character_id,owner_member_id,root_character_id,relation,verification_source,legion_name_snapshot,verified_by_member_id,verified_at,updated_at)
  values(v_id,case when v_relation='GUEST' then null else v_member_id end,case when v_relation='ALT' then v_main.id else v_id end,v_relation,'OFFICIAL_CONFIRMED',v_candidate.legion_name,v_actor_id,v_now,v_now)
  on conflict(character_id) do update set owner_member_id=excluded.owner_member_id,root_character_id=excluded.root_character_id,relation=excluded.relation,verification_source=excluded.verification_source,legion_name_snapshot=excluded.legion_name_snapshot,verified_by_member_id=excluded.verified_by_member_id,verified_at=excluded.verified_at,updated_at=excluded.updated_at;
  update private.sanctuary_management_official_candidates_v432 set state='MATERIALIZED',materialized_character_id=v_id,materialized_at=v_now,updated_at=v_now where candidate_id=p_candidate_id;
  perform private.kinojo_sm_audit_v412(v_actor_id,p_team_id,'CHARACTER',v_id,'REGISTER_OFFICIAL_CHARACTER',null,jsonb_build_object('relation',v_relation,'candidateId',p_candidate_id),nullif(btrim(p_request_key),''));
  return jsonb_build_object('ok',true,'schemaVersion',432,'character',private.kinojo_sm_character_card_v432(v_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_materialize_v439(p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text, p_main_character_id bigint, p_request_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, 'CHARACTER_REGISTER');
  return public.kinojo_sanctuary_management_official_materialize_v432(
    p_credential, p_team_id, p_candidate_id, p_relation_type, p_main_character_id, p_request_key
  ) || jsonb_build_object('apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_materialize_v452(p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text, p_main_character_id bigint DEFAULT NULL::bigint, p_request_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_materialize_v457(p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text, p_main_character_id bigint DEFAULT NULL::bigint, p_request_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_relation text:=upper(btrim(coalesce(p_relation_type,''))); v_operational boolean;
  v_main public.character_master%rowtype; v_owner record; v_member_id bigint; v_id bigint;
  v_now timestamptz:=clock_timestamp(); v_power integer; v_item_level integer;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_official_materialize_v452(p_credential,p_team_id,p_candidate_id,p_relation_type,p_main_character_id,p_request_key)
      || jsonb_build_object('apiVersion',2.3,'schemaVersion',457,'databaseContract',457);
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_REGISTER');
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 캐릭터를 등록해 주세요.' using errcode='P0001'; end if;
  perform private.kinojo_sm_assert_write_enabled_v412();
  select * into v_candidate from private.sanctuary_management_official_candidates_v432 where candidate_id=p_candidate_id for update;
  if v_candidate.candidate_id is null or v_candidate.actor_member_id<>v_actor_id or v_candidate.team_id is not null then raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001'; end if;
  if v_candidate.state='MATERIALIZED' and v_candidate.materialized_character_id is not null then return jsonb_build_object('ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,'idempotent',true,'character',private.kinojo_sm_character_card_v452(v_candidate.materialized_character_id)); end if;
  if v_candidate.state<>'VERIFIED' or v_candidate.expires_at<=v_now then update private.sanctuary_management_official_candidates_v432 set state='EXPIRED',updated_at=v_now where candidate_id=p_candidate_id and state='VERIFIED'; raise exception '공식 조회 결과가 만료되었습니다. 다시 조회해 주세요.' using errcode='P0001'; end if;
  v_operational:=exists(select 1 from private.sanctuary_operational_legions_v432 where is_active and public.kinojo_normalize_legion_name(legion_name)=public.kinojo_normalize_legion_name(v_candidate.legion_name));
  if (v_operational and v_relation not in('MAIN','ALT')) or (not v_operational and v_relation<>'GUEST') then raise exception '레기온 확인 결과에 맞는 본캐·부캐·게스트 관계를 선택해 주세요.' using errcode='P0001'; end if;
  if v_relation='MAIN' then
    select id into v_member_id from public.member_codes where is_active and public.kinojo_character_identity_key_v298(main_character_name)=public.kinojo_character_identity_key_v298(v_candidate.character_name) order by id limit 1;
    if v_member_id is null then raise exception '본캐 이름과 일치하는 레기온 이용자를 찾을 수 없습니다.' using errcode='P0001'; end if;
  elsif v_relation='ALT' then
    select * into v_main from public.character_master where id=p_main_character_id and is_active and is_main and identity_status='CURRENT';
    if v_main.id is null then raise exception '부캐에 연결할 본캐를 먼저 공식 확인해 주세요.' using errcode='P0001'; end if;
    select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main.id);
    if v_owner.owner_member_id is null or v_owner.relation<>'MAIN' then raise exception '선택한 본캐의 이용자 관계를 확인할 수 없습니다.' using errcode='P0001'; end if;
    v_member_id:=v_owner.owner_member_id;
  end if;
  v_power:=nullif(v_candidate.official_payload->>'pveCombatPower','')::integer;
  v_item_level:=nullif(v_candidate.official_payload->>'pveItemLevel','')::integer;
  perform pg_advisory_xact_lock(hashtextextended('sm-character:'||v_candidate.server_id||':'||public.kinojo_character_identity_key_v298(v_candidate.character_name),457));
  select id into v_id from public.character_master where server_id=v_candidate.server_id and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_candidate.character_name) order by is_active desc,updated_at desc limit 1;
  if v_id is null then
    insert into public.character_master(server_id,server_name,character_name,char_key,profile_image_url,detail_url,image_updated_at,status,error_message,main_character_name,is_main,class_name,list_row,first_seen_at,last_seen_at,is_active,lookup_excluded,visibility_excluded,lookup_failure_streak,lookup_failure_total,last_lookup_success_at,main_character_id,identity_status,identity_verified_at,bootstrap_source,bootstrap_imported_at,legion_name,legion_updated_at,latest_pve_combat_power,latest_pve_item_level,last_synced_at)
    values(v_candidate.server_id,v_candidate.server_name,v_candidate.character_name,v_candidate.char_key,v_candidate.profile_image_url,v_candidate.detail_url,v_now,'OK',null,case when v_relation='ALT' then v_main.character_name else v_candidate.character_name end,v_relation<>'ALT',v_candidate.class_name,null,v_now,v_now,true,false,false,0,0,v_now,case when v_relation='ALT' then v_main.id else null end,'CURRENT',v_now,'SANCTUARY_MANAGEMENT_OFFICIAL_V457',v_now,v_candidate.legion_name,v_now,v_power,v_item_level,v_now)
    returning id into v_id;
  else
    update public.character_master set latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),last_synced_at=v_now,updated_at=v_now where id=v_id;
  end if;
  insert into private.sanctuary_character_owners_v412(character_id,owner_member_id,root_character_id,relation,verification_source,legion_name_snapshot,verified_by_member_id,verified_at,updated_at)
  values(v_id,case when v_relation='GUEST' then null else v_member_id end,case when v_relation='ALT' then v_main.id else v_id end,v_relation,'OFFICIAL_CONFIRMED',v_candidate.legion_name,v_actor_id,v_now,v_now)
  on conflict(character_id) do update set owner_member_id=excluded.owner_member_id,root_character_id=excluded.root_character_id,relation=excluded.relation,verification_source=excluded.verification_source,legion_name_snapshot=excluded.legion_name_snapshot,verified_by_member_id=excluded.verified_by_member_id,verified_at=excluded.verified_at,updated_at=excluded.updated_at;
  update private.sanctuary_management_official_candidates_v432 set state='MATERIALIZED',materialized_character_id=v_id,materialized_at=v_now,updated_at=v_now where candidate_id=p_candidate_id;
  perform private.kinojo_sm_audit_v412(v_actor_id,null,'CHARACTER',v_id,'REGISTER_OFFICIAL_CHARACTER',null,jsonb_build_object('relation',v_relation,'candidateId',p_candidate_id),nullif(btrim(p_request_key),''));
  return jsonb_build_object('ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,'character',private.kinojo_sm_character_card_v452(v_id));
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_materialize_v480(p_credential text, p_team_id bigint, p_candidate_id uuid, p_relation_type text, p_main_character_id bigint DEFAULT NULL::bigint, p_main_candidate_id uuid DEFAULT NULL::uuid, p_list_sync_enabled boolean DEFAULT true, p_request_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '12s'
 SET lock_timeout TO '1500ms'
AS $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_target_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_main_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_target public.character_master%rowtype;
  v_main public.character_master%rowtype;
  v_main_owner record;
  v_target_owner_member_id bigint;
  v_main_owner_member_id bigint;
  v_membership_relation text;
  v_family_relation text;
  v_relation text := upper(btrim(coalesce(p_relation_type,'')));
  v_operational boolean;
  v_registration_id uuid;
  v_queue_session_id text;
  v_queue_count integer := 0;
  v_list_status text;
  v_payload jsonb;
  v_result jsonb;
  v_existing private.sanctuary_character_registration_events_v480%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_REGISTER');
  perform private.kinojo_sm_assert_write_enabled_v412();
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then
    raise exception '로그인 후 캐릭터를 등록해 주세요.' using errcode='P0001';
  end if;
  if p_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then
      raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001';
    end if;
  end if;
  if nullif(btrim(coalesce(p_request_key,'')),'') is null
     or p_request_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
    raise exception '중복 요청 방지 키를 다시 만들어 주세요.' using errcode='P0001';
  end if;
  if v_relation not in ('MAIN','ALT','GUEST') then
    raise exception '본캐·부캐·게스트 관계를 다시 선택해 주세요.' using errcode='P0001';
  end if;

  v_payload := jsonb_build_object(
    'candidateId',p_candidate_id,'relationType',v_relation,
    'mainCharacterId',p_main_character_id,'mainCandidateId',p_main_candidate_id,
    'listSyncEnabled',coalesce(p_list_sync_enabled,true)
  );
  select * into v_existing
  from private.sanctuary_character_registration_events_v480
  where actor_member_id=v_actor_id and request_key=p_request_key;
  if found then
    if v_existing.request_payload<>v_payload then
      raise exception '같은 요청 키의 등록 정보가 달라졌습니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    return coalesce(v_existing.result,'{}'::jsonb) || jsonb_build_object(
      'ok',true,'idempotent',true,'registrationId',v_existing.registration_id,
      'listSync',jsonb_build_object(
        'requested',v_existing.list_sync_requested,'status',v_existing.list_sync_status,
        'queueCount',v_existing.list_queue_count,'message',v_existing.list_sync_message
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'sm-registration:'||least(p_candidate_id::text,coalesce(p_main_candidate_id::text,p_candidate_id::text))
      ||':'||greatest(p_candidate_id::text,coalesce(p_main_candidate_id::text,p_candidate_id::text)),480
  ));
  select * into v_existing
  from private.sanctuary_character_registration_events_v480
  where actor_member_id=v_actor_id and request_key=p_request_key;
  if found then
    if v_existing.request_payload<>v_payload then
      raise exception '같은 요청 키의 등록 정보가 달라졌습니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    return coalesce(v_existing.result,'{}'::jsonb) || jsonb_build_object(
      'ok',true,'idempotent',true,'registrationId',v_existing.registration_id,
      'listSync',jsonb_build_object(
        'requested',v_existing.list_sync_requested,'status',v_existing.list_sync_status,
        'queueCount',v_existing.list_queue_count,'message',v_existing.list_sync_message
      )
    );
  end if;
  lock table public.character_master in share row exclusive mode;

  select * into v_target_candidate
  from private.sanctuary_management_official_candidates_v432
  where candidate_id=p_candidate_id;
  if v_target_candidate.candidate_id is null
     or v_target_candidate.actor_member_id<>v_actor_id
     or v_target_candidate.team_id is distinct from p_team_id then
    raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001';
  end if;
  v_operational := exists(
    select 1 from private.sanctuary_operational_legions_v432
    where is_active
      and public.kinojo_normalize_legion_name(legion_name)
        =public.kinojo_normalize_legion_name(v_target_candidate.legion_name)
  );
  if (v_operational and v_relation not in ('MAIN','ALT'))
     or (not v_operational and v_relation not in ('GUEST','ALT')) then
    raise exception '레기온 확인 결과에 맞는 등록 방식을 선택해 주세요.' using errcode='P0001';
  end if;

  v_family_relation := case when v_relation='ALT' then 'ALT' else 'MAIN' end;
  if v_family_relation='ALT' then
    if (p_main_character_id is null)=(p_main_candidate_id is null) then
      raise exception '부캐에 연결할 본캐 하나를 선택해 주세요.' using errcode='P0001';
    end if;
    if p_main_candidate_id is not null then
      select * into v_main_candidate
      from private.sanctuary_management_official_candidates_v432
      where candidate_id=p_main_candidate_id;
      if v_main_candidate.candidate_id is null
         or v_main_candidate.actor_member_id<>v_actor_id
         or v_main_candidate.team_id is distinct from p_team_id then
        raise exception '본캐 공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001';
      end if;
      if v_main_candidate.server_id=v_target_candidate.server_id
         and public.kinojo_character_identity_key_v298(v_main_candidate.character_name)
           =public.kinojo_character_identity_key_v298(v_target_candidate.character_name) then
        raise exception '같은 캐릭터를 본캐와 부캐로 연결할 수 없습니다.' using errcode='P0001';
      end if;
      p_main_character_id := private.kinojo_sm_materialize_candidate_v480(
        p_main_candidate_id,v_actor_id,'MAIN',null
      );
    end if;
    select * into v_main
    from public.character_master
    where id=p_main_character_id and is_active and identity_status='CURRENT'
    for update;
    if v_main.id is null
       or not (coalesce(v_main.is_main,false)
         or coalesce(v_main.main_character_id,v_main.id)=v_main.id) then
      raise exception '선택한 캐릭터는 연결할 본캐가 아닙니다.' using errcode='P0001';
    end if;
  end if;

  select * into v_target
  from public.character_master
  where id=private.kinojo_sm_materialize_candidate_v480(
    p_candidate_id,v_actor_id,v_family_relation,
    case when v_family_relation='ALT' then p_main_character_id else null end
  );

  if v_family_relation='ALT' and v_target.id=v_main.id then
    raise exception '같은 캐릭터를 본캐와 부캐로 연결할 수 없습니다.' using errcode='P0001';
  end if;
  if v_family_relation='ALT' and exists(
    select 1 from public.character_master child
    where child.id<>v_target.id and child.main_character_id=v_target.id
      and coalesce(child.is_active,true)
  ) then
    raise exception '이미 다른 부캐가 연결된 본캐입니다. 명부에서 가족 관계를 먼저 확인해 주세요.' using errcode='P0001';
  end if;

  if v_family_relation='MAIN' then
    v_main := v_target;
    p_main_character_id := v_target.id;
  end if;

  select owner_member_id into v_main_owner_member_id
  from private.kinojo_sm_resolve_character_owner_v412(p_main_character_id)
  limit 1;
  if v_family_relation='MAIN' and v_operational then
    select id into v_main_owner_member_id
    from public.member_codes
    where is_active
      and public.kinojo_character_identity_key_v298(main_character_name)
        =public.kinojo_character_identity_key_v298(v_main.character_name)
    order by id limit 1;
    if v_relation='MAIN' and v_main_owner_member_id is null then
      raise exception '본캐 이름과 일치하는 레기온 이용자를 찾을 수 없습니다.' using errcode='P0001';
    end if;
  end if;

  -- A newly materialized main candidate receives an explicit owner row. An
  -- unowned external main stays GUEST, but is still the canonical family root.
  if p_main_candidate_id is not null or v_family_relation='MAIN' then
    insert into private.sanctuary_character_owners_v412(
      character_id,owner_member_id,root_character_id,relation,verification_source,
      legion_name_snapshot,verified_by_member_id,verified_at,updated_at
    ) values (
      p_main_character_id,v_main_owner_member_id,p_main_character_id,
      case when v_main_owner_member_id is null then 'GUEST' else 'MAIN' end,
      'OFFICIAL_CONFIRMED',v_main.legion_name,v_actor_id,v_now,v_now
    ) on conflict(character_id) do update set
      owner_member_id=excluded.owner_member_id,root_character_id=excluded.root_character_id,
      relation=excluded.relation,verification_source=excluded.verification_source,
      legion_name_snapshot=excluded.legion_name_snapshot,
      verified_by_member_id=excluded.verified_by_member_id,
      verified_at=excluded.verified_at,updated_at=excluded.updated_at;
  end if;

  v_target_owner_member_id := case
    when v_family_relation='ALT' then v_main_owner_member_id
    else v_main_owner_member_id
  end;
  v_membership_relation := case
    when v_target_owner_member_id is null then 'GUEST'
    when v_family_relation='ALT' then 'ALT'
    else 'MAIN'
  end;

  insert into private.roster_family_overrides_v477(character_id,main_character_id)
  values(p_main_character_id,p_main_character_id)
  on conflict(character_id) do update
    set main_character_id=excluded.main_character_id,updated_at=v_now;
  insert into private.roster_family_overrides_v477(character_id,main_character_id)
  values(v_target.id,p_main_character_id)
  on conflict(character_id) do update
    set main_character_id=excluded.main_character_id,updated_at=v_now;

  update public.character_master
     set main_character_id=p_main_character_id,
         main_character_name=v_main.character_name,
         is_main=(id=p_main_character_id),updated_at=v_now
   where id in (p_main_character_id,v_target.id);

  insert into private.sanctuary_character_owners_v412(
    character_id,owner_member_id,root_character_id,relation,verification_source,
    legion_name_snapshot,verified_by_member_id,verified_at,updated_at
  ) values (
    v_target.id,v_target_owner_member_id,p_main_character_id,v_membership_relation,
    'OFFICIAL_CONFIRMED',v_target_candidate.legion_name,v_actor_id,v_now,v_now
  ) on conflict(character_id) do update set
    owner_member_id=excluded.owner_member_id,root_character_id=excluded.root_character_id,
    relation=excluded.relation,verification_source=excluded.verification_source,
    legion_name_snapshot=excluded.legion_name_snapshot,
    verified_by_member_id=excluded.verified_by_member_id,
    verified_at=excluded.verified_at,updated_at=excluded.updated_at;

  -- Existing placements are corrected immediately; future writes are kept
  -- canonical by the v480 normalization trigger below.
  update private.sanctuary_management_slots_v412
     set owner_member_id=v_target_owner_member_id,
         owner_root_character_id=p_main_character_id,
         character_relation=v_family_relation,
         revision=revision+1,updated_at=v_now
   where character_id=v_target.id;

  insert into private.sanctuary_character_registration_events_v480(
    actor_member_id,team_id,request_key,target_candidate_id,main_candidate_id,
    target_character_id,main_character_id,family_relation,membership_relation,
    list_sync_requested,list_sync_status,list_queue_session_id,request_payload
  ) values (
    v_actor_id,p_team_id,p_request_key,p_candidate_id,p_main_candidate_id,
    v_target.id,p_main_character_id,v_family_relation,v_membership_relation,
    coalesce(p_list_sync_enabled,true),'NOT_REQUESTED',null,v_payload
  ) returning registration_id into v_registration_id;

  if coalesce(p_list_sync_enabled,true) then
    v_queue_session_id := 'sanctuary-registration:'||v_registration_id::text;
    insert into public.google_list_sheet_sync_queue(
      session_id,character_id,list_row,list_original_name,character_name,
      server_id,server_name,class_name,main_character_name,append_if_missing,
      list_display_name,pve_item_level,pvp_item_level,pve_combat_power,pvp_combat_power,
      latest_power_total,latest_item_level_total,sync_status,created_at,updated_at
    )
    select v_queue_session_id,character.id,character.list_row,
      public.kinojo_list_display_name_v287(character.character_name,character.server_id),
      character.character_name,character.server_id,character.server_name,character.class_name,
      v_main.character_name,true,
      public.kinojo_list_display_name_v287(character.character_name,character.server_id),
      character.latest_pve_item_level,character.latest_pvp_item_level,
      character.latest_pve_combat_power,character.latest_pvp_combat_power,
      character.latest_power_total,character.latest_item_level_total,'queued',v_now,v_now
    from public.character_master character
    where character.id in (v_target.id,p_main_character_id)
      and character.list_row is null
    on conflict(session_id,character_name,server_id) do nothing;
    get diagnostics v_queue_count=row_count;
    v_list_status := case when v_queue_count>0 then 'PENDING' else 'SYNCED' end;
  else
    v_list_status := 'NOT_REQUESTED';
  end if;

  v_result := jsonb_build_object(
    'ok',true,'apiVersion',2.5,'schemaVersion',480,'databaseContract',480,
    'registrationId',v_registration_id,
    'character',private.kinojo_sm_character_card_v480(v_target.id),
    'familyRelation',v_family_relation,'membershipRelation',v_membership_relation,
    'listSync',jsonb_build_object(
      'requested',coalesce(p_list_sync_enabled,true),'status',v_list_status,
      'queueCount',v_queue_count,
      'message',case
        when v_list_status='NOT_REQUESTED' then 'List 시트 반영 안 함'
        when v_list_status='SYNCED' then 'List 시트에 이미 등록되어 있습니다.'
        else 'List 시트 반영 대기 중' end
    )
  );
  update private.sanctuary_character_registration_events_v480
     set list_sync_status=v_list_status,list_queue_session_id=v_queue_session_id,
         list_queue_count=v_queue_count,result=v_result,updated_at=v_now,
         list_synced_at=case when v_list_status='SYNCED' then v_now else null end
   where registration_id=v_registration_id;

  perform private.kinojo_sm_audit_v412(
    v_actor_id,null,'CHARACTER',v_target.id,'REGISTER_OFFICIAL_CHARACTER_V480',null,
    jsonb_build_object(
      'registrationId',v_registration_id,'familyRelation',v_family_relation,
      'membershipRelation',v_membership_relation,'mainCharacterId',p_main_character_id,
      'listSyncEnabled',coalesce(p_list_sync_enabled,true)
    ),p_request_key
  );
  return v_result;
exception
  when lock_not_available or query_canceled then
    raise exception '다른 캐릭터 관계 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.' using errcode='P0001';
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_prepare_all_v458(p_credential text, p_team_id bigint, p_character_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_state public.official_lookup_rate_state%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reserved_at timestamptz;
  v_wait_ms integer;
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then
    raise exception '로그인 후 캐릭터를 조회해 주세요.' using errcode='P0001';
  end if;
  if not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then
    raise exception '다른 캐릭터를 추가할 권한이 없습니다.' using errcode='P0001';
  end if;
  if char_length(btrim(coalesce(p_character_name,''))) not between 1 and 12 then
    raise exception '캐릭터 이름은 1~12자로 입력해 주세요.' using errcode='P0001';
  end if;

  insert into public.official_lookup_rate_state(provider) values('plaync') on conflict(provider) do nothing;
  select * into v_state from public.official_lookup_rate_state where provider='plaync' for update;
  if v_state.paused_until is not null and v_state.paused_until>v_now then
    v_wait_ms := greatest(1,ceil(extract(epoch from(v_state.paused_until-v_now))*1000)::integer);
    return jsonb_build_object('ok',true,'allowed',false,'waitMs',v_wait_ms,'retryAfterSeconds',greatest(1,ceil(v_wait_ms/1000.0)::integer),'pausedUntil',v_state.paused_until,'schemaVersion',458,'databaseContract',458);
  end if;
  v_reserved_at := greatest(v_state.next_request_at,v_now);
  v_wait_ms := greatest(0,ceil(extract(epoch from(v_reserved_at-v_now))*1000)::integer);
  update public.official_lookup_rate_state
     set paused_until=null,next_request_at=v_reserved_at+interval '700 milliseconds',
         last_session_id='sm-v458:all:'||v_actor_id,last_source='SANCTUARY_MANAGEMENT_OFFICIAL_ALL_V458',updated_at=v_now
   where provider='plaync';
  return jsonb_build_object('ok',true,'allowed',true,'waitMs',v_wait_ms,'reservedAt',v_reserved_at,'schemaVersion',458,'databaseContract',458);
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_prepare_v432(p_credential text, p_team_id bigint, p_server_id integer, p_character_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb; v_team private.sanctuary_management_teams_v412%rowtype; v_state public.official_lookup_rate_state%rowtype;
  v_now timestamptz:=clock_timestamp(); v_reserved_at timestamptz; v_wait_ms integer; v_actor_id bigint;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id=(v_actor->>'memberId')::bigint;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
  if char_length(btrim(coalesce(p_character_name,''))) not between 1 and 16 then raise exception '캐릭터 이름은 1~16자로 입력해 주세요.' using errcode='P0001'; end if;
  if not exists(select 1 from public.server_master where server_id=p_server_id and is_active) then raise exception '활성 서버가 아닙니다.' using errcode='P0001'; end if;
  insert into public.official_lookup_rate_state(provider) values('plaync') on conflict(provider) do nothing;
  select * into v_state from public.official_lookup_rate_state where provider='plaync' for update;
  if v_state.paused_until is not null and v_state.paused_until>v_now then
    v_wait_ms:=greatest(1,ceil(extract(epoch from(v_state.paused_until-v_now))*1000)::integer);
    return jsonb_build_object('ok',true,'allowed',false,'waitMs',v_wait_ms,'retryAfterSeconds',greatest(1,ceil(v_wait_ms/1000.0)::integer),'pausedUntil',v_state.paused_until);
  end if;
  v_reserved_at:=greatest(v_state.next_request_at,v_now); v_wait_ms:=greatest(0,ceil(extract(epoch from(v_reserved_at-v_now))*1000)::integer);
  update public.official_lookup_rate_state set paused_until=null,next_request_at=v_reserved_at+interval '700 milliseconds',last_session_id='sm-v432:'||v_actor_id,last_source='SANCTUARY_MANAGEMENT_OFFICIAL_V432',updated_at=v_now where provider='plaync';
  return jsonb_build_object('ok',true,'allowed',true,'waitMs',v_wait_ms,'reservedAt',v_reserved_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_prepare_v457(p_credential text, p_team_id bigint, p_server_id integer, p_character_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb; v_actor_id bigint;
  v_state public.official_lookup_rate_state%rowtype;
  v_now timestamptz := clock_timestamp(); v_reserved_at timestamptz; v_wait_ms integer;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_official_prepare_v432(p_credential,p_team_id,p_server_id,p_character_name)
      || jsonb_build_object('schemaVersion',457,'databaseContract',457);
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
  v_actor := private.kinojo_sm_actor_v412(p_credential); v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 캐릭터를 조회해 주세요.' using errcode='P0001'; end if;
  if char_length(btrim(coalesce(p_character_name,''))) not between 1 and 16 then raise exception '캐릭터 이름은 1~16자로 입력해 주세요.' using errcode='P0001'; end if;
  if not exists(select 1 from public.server_master where server_id=p_server_id and is_active) then raise exception '활성 서버가 아닙니다.' using errcode='P0001'; end if;
  insert into public.official_lookup_rate_state(provider) values('plaync') on conflict(provider) do nothing;
  select * into v_state from public.official_lookup_rate_state where provider='plaync' for update;
  if v_state.paused_until is not null and v_state.paused_until>v_now then
    v_wait_ms := greatest(1,ceil(extract(epoch from(v_state.paused_until-v_now))*1000)::integer);
    return jsonb_build_object('ok',true,'allowed',false,'waitMs',v_wait_ms,'retryAfterSeconds',greatest(1,ceil(v_wait_ms/1000.0)::integer),'pausedUntil',v_state.paused_until,'schemaVersion',457,'databaseContract',457);
  end if;
  v_reserved_at := greatest(v_state.next_request_at,v_now);
  v_wait_ms := greatest(0,ceil(extract(epoch from(v_reserved_at-v_now))*1000)::integer);
  update public.official_lookup_rate_state
     set paused_until=null,next_request_at=v_reserved_at+interval '700 milliseconds',
         last_session_id='sm-v457:create:'||v_actor_id,last_source='SANCTUARY_MANAGEMENT_OFFICIAL_V457',updated_at=v_now
   where provider='plaync';
  return jsonb_build_object('ok',true,'allowed',true,'waitMs',v_wait_ms,'reservedAt',v_reserved_at,'schemaVersion',457,'databaseContract',457);
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_record_v432(p_credential text, p_team_id bigint, p_requested_character_name text, p_official_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_team private.sanctuary_management_teams_v412%rowtype; v_server public.server_master%rowtype;
  v_name text:=btrim(coalesce(p_official_payload->>'characterName','')); v_server_id integer; v_race_id integer;
  v_class text:=btrim(coalesce(p_official_payload->>'className','')); v_legion text:=nullif(btrim(coalesce(p_official_payload->>'legionName','')),'');
  v_char_key text:=btrim(coalesce(p_official_payload->>'charKey','')); v_official_id text:=btrim(coalesce(p_official_payload->>'characterId',''));
  v_detail text:=btrim(coalesce(p_official_payload->>'detailUrl','')); v_existing public.character_master%rowtype; v_candidate uuid; v_operational boolean;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id=(v_actor->>'memberId')::bigint;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
  begin v_server_id:=(p_official_payload->>'serverId')::integer; v_race_id:=(p_official_payload->>'raceId')::integer; exception when others then raise exception '공식 조회 식별값이 올바르지 않습니다.' using errcode='P0001'; end;
  select * into v_server from public.server_master where server_id=v_server_id and race_id=v_race_id and is_active;
  if v_server.server_id is null or v_server.server_name<>btrim(coalesce(p_official_payload->>'serverName','')) then raise exception '공식 조회 서버 정보가 일치하지 않습니다.' using errcode='P0001'; end if;
  if public.kinojo_character_identity_key_v298(v_name)<>public.kinojo_character_identity_key_v298(p_requested_character_name) then raise exception '공식 조회 캐릭터명이 입력값과 다릅니다.' using errcode='P0001'; end if;
  if char_length(v_name) not between 1 and 16 or v_class='' or v_char_key='' or v_official_id='' or v_detail='' then raise exception '공식 조회 결과에 필수 신원 정보가 없습니다.' using errcode='P0001'; end if;
  if exists(select 1 from public.character_master where nullif(btrim(char_key),'')=v_char_key and (server_id<>v_server_id or public.kinojo_character_identity_key_v298(character_name)<>public.kinojo_character_identity_key_v298(v_name))) then raise exception '같은 공식 고유값이 다른 캐릭터에 연결되어 있습니다.' using errcode='P0001'; end if;
  select * into v_existing from public.character_master where server_id=v_server_id and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_name) and is_active order by updated_at desc limit 1;
  if v_existing.id is not null then return jsonb_build_object('ok',true,'schemaVersion',432,'source','CHARACTER_MASTER','alreadyRegistered',true,'character',private.kinojo_sm_character_card_v432(v_existing.id)); end if;
  v_operational:=exists(select 1 from private.sanctuary_operational_legions_v432 where is_active and public.kinojo_normalize_legion_name(legion_name)=public.kinojo_normalize_legion_name(v_legion));
  insert into private.sanctuary_management_official_candidates_v432(actor_member_id,team_id,requested_character_name,character_name,server_id,server_name,race_id,class_name,legion_name,char_key,official_character_id,profile_image_url,detail_url,official_payload)
  values(v_actor_id,p_team_id,btrim(p_requested_character_name),v_name,v_server_id,v_server.server_name,v_race_id,v_class,v_legion,v_char_key,v_official_id,nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),v_detail,p_official_payload)
  returning candidate_id into v_candidate;
  return jsonb_build_object('ok',true,'schemaVersion',432,'source','OFFICIAL','alreadyRegistered',false,'relationRequired',true,'candidate',jsonb_build_object('candidateId',v_candidate,'characterName',v_name,'serverId',v_server_id,'serverName',v_server.server_name,'raceId',v_race_id,'className',v_class,'legionName',v_legion,'profileImageUrl',nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),'isOperationalLegion',v_operational,'allowedRelations',case when v_operational then jsonb_build_array('MAIN','ALT') else jsonb_build_array('GUEST') end));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_record_v452(p_credential text, p_team_id bigint, p_requested_character_name text, p_official_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_record_v457(p_credential text, p_team_id bigint, p_requested_character_name text, p_official_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_server public.server_master%rowtype;
  v_name text:=btrim(coalesce(p_official_payload->>'characterName','')); v_server_id integer; v_race_id integer;
  v_class text:=btrim(coalesce(p_official_payload->>'className','')); v_legion text:=nullif(btrim(coalesce(p_official_payload->>'legionName','')),'');
  v_char_key text:=btrim(coalesce(p_official_payload->>'charKey','')); v_official_id text:=btrim(coalesce(p_official_payload->>'characterId',''));
  v_detail text:=btrim(coalesce(p_official_payload->>'detailUrl','')); v_existing public.character_master%rowtype;
  v_candidate uuid; v_operational boolean; v_power integer; v_item_level integer;
begin
  if p_team_id is not null then
    return public.kinojo_sanctuary_management_official_record_v452(p_credential,p_team_id,p_requested_character_name,p_official_payload)
      || jsonb_build_object('apiVersion',2.3,'schemaVersion',457,'databaseContract',457);
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_REGISTER');
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then raise exception '로그인 후 캐릭터를 등록해 주세요.' using errcode='P0001'; end if;
  begin
    v_server_id:=(p_official_payload->>'serverId')::integer;
    v_race_id:=(p_official_payload->>'raceId')::integer;
    v_power:=nullif(p_official_payload->>'pveCombatPower','')::integer;
    v_item_level:=nullif(p_official_payload->>'pveItemLevel','')::integer;
  exception when others then raise exception '공식 조회 식별값이 올바르지 않습니다.' using errcode='P0001'; end;
  select * into v_server from public.server_master where server_id=v_server_id and race_id=v_race_id and is_active;
  if v_server.server_id is null or v_server.server_name<>btrim(coalesce(p_official_payload->>'serverName','')) then raise exception '공식 조회 서버 정보가 일치하지 않습니다.' using errcode='P0001'; end if;
  if public.kinojo_character_identity_key_v298(v_name)<>public.kinojo_character_identity_key_v298(p_requested_character_name) then raise exception '공식 조회 캐릭터명이 입력값과 다릅니다.' using errcode='P0001'; end if;
  if char_length(v_name) not between 1 and 16 or v_class='' or v_char_key='' or v_official_id='' or v_detail='' then raise exception '공식 조회 결과에 필수 신원 정보가 없습니다.' using errcode='P0001'; end if;
  if exists(select 1 from public.character_master where nullif(btrim(char_key),'')=v_char_key and (server_id<>v_server_id or public.kinojo_character_identity_key_v298(character_name)<>public.kinojo_character_identity_key_v298(v_name))) then raise exception '같은 공식 고유값이 다른 캐릭터에 연결되어 있습니다.' using errcode='P0001'; end if;
  select * into v_existing from public.character_master where server_id=v_server_id and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_name) and is_active order by updated_at desc limit 1;
  if v_existing.id is not null then
    update public.character_master set latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),last_synced_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_existing.id;
    return jsonb_build_object('ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,'source','CHARACTER_MASTER','alreadyRegistered',true,'character',private.kinojo_sm_character_card_v452(v_existing.id));
  end if;
  v_operational:=exists(select 1 from private.sanctuary_operational_legions_v432 where is_active and public.kinojo_normalize_legion_name(legion_name)=public.kinojo_normalize_legion_name(v_legion));
  insert into private.sanctuary_management_official_candidates_v432(actor_member_id,team_id,requested_character_name,character_name,server_id,server_name,race_id,class_name,legion_name,char_key,official_character_id,profile_image_url,detail_url,official_payload)
  values(v_actor_id,null,btrim(p_requested_character_name),v_name,v_server_id,v_server.server_name,v_race_id,v_class,v_legion,v_char_key,v_official_id,nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),v_detail,p_official_payload)
  returning candidate_id into v_candidate;
  return jsonb_build_object(
    'ok',true,'apiVersion',2.3,'schemaVersion',457,'databaseContract',457,'source','OFFICIAL','alreadyRegistered',false,'relationRequired',true,
    'candidate',jsonb_build_object('candidateId',v_candidate,'characterName',v_name,'serverId',v_server_id,'serverName',v_server.server_name,'raceId',v_race_id,'className',v_class,'legionName',v_legion,'profileImageUrl',nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),'power',v_power,'itemLevel',v_item_level,'isOperationalLegion',v_operational,'allowedRelations',case when v_operational then jsonb_build_array('MAIN','ALT') else jsonb_build_array('GUEST') end)
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_official_record_v480(p_credential text, p_team_id bigint, p_requested_character_name text, p_official_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_server public.server_master%rowtype;
  v_name text := btrim(coalesce(p_official_payload->>'characterName',''));
  v_server_id integer;
  v_race_id integer;
  v_class text := btrim(coalesce(p_official_payload->>'className',''));
  v_legion text := nullif(btrim(coalesce(p_official_payload->>'legionName','')),'');
  v_char_key text := btrim(coalesce(p_official_payload->>'charKey',''));
  v_official_id text := btrim(coalesce(p_official_payload->>'characterId',''));
  v_detail text := btrim(coalesce(p_official_payload->>'detailUrl',''));
  v_existing public.character_master%rowtype;
  v_candidate uuid;
  v_operational boolean;
  v_power integer;
  v_item_level integer;
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_REGISTER');
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then
    raise exception '로그인 후 캐릭터를 등록해 주세요.' using errcode='P0001';
  end if;
  if p_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then
      raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001';
    end if;
  end if;

  begin
    v_server_id := (p_official_payload->>'serverId')::integer;
    v_race_id := (p_official_payload->>'raceId')::integer;
    v_power := nullif(p_official_payload->>'pveCombatPower','')::integer;
    v_item_level := nullif(p_official_payload->>'pveItemLevel','')::integer;
  exception when others then
    raise exception '공식 조회 식별값이 올바르지 않습니다.' using errcode='P0001';
  end;

  select * into v_server
  from public.server_master
  where server_id=v_server_id and race_id=v_race_id and is_active;
  if v_server.server_id is null
     or v_server.server_name<>btrim(coalesce(p_official_payload->>'serverName','')) then
    raise exception '공식 조회 서버 정보가 일치하지 않습니다.' using errcode='P0001';
  end if;
  if public.kinojo_character_identity_key_v298(v_name)
     <> public.kinojo_character_identity_key_v298(p_requested_character_name) then
    raise exception '공식 조회 캐릭터명이 입력값과 다릅니다.' using errcode='P0001';
  end if;
  if char_length(v_name) not between 1 and 16
     or v_class='' or v_char_key='' or v_official_id='' or v_detail='' then
    raise exception '공식 조회 결과에 필수 신원 정보가 없습니다.' using errcode='P0001';
  end if;
  if exists(
    select 1 from public.character_master
    where nullif(btrim(char_key),'')=v_char_key
      and (server_id<>v_server_id
        or public.kinojo_character_identity_key_v298(character_name)
          <> public.kinojo_character_identity_key_v298(v_name))
  ) then
    raise exception '같은 공식 고유값이 다른 캐릭터에 연결되어 있습니다.' using errcode='P0001';
  end if;

  select * into v_existing
  from public.character_master
  where server_id=v_server_id
    and public.kinojo_character_identity_key_v298(character_name)
      =public.kinojo_character_identity_key_v298(v_name)
    and is_active
  order by (identity_status='CURRENT') desc, updated_at desc
  limit 1;

  if v_existing.id is not null and v_existing.identity_status='CURRENT' then
    update public.character_master
       set latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),
           latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),
           class_name=coalesce(nullif(v_class,''),class_name),
           profile_image_url=coalesce(nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),profile_image_url),
           last_synced_at=clock_timestamp(),updated_at=clock_timestamp()
     where id=v_existing.id;
    return jsonb_build_object(
      'ok',true,'apiVersion',2.5,'schemaVersion',480,'databaseContract',480,
      'source','CHARACTER_MASTER','alreadyRegistered',true,
      'character',private.kinojo_sm_character_card_v480(v_existing.id)
    );
  end if;

  v_operational := exists(
    select 1 from private.sanctuary_operational_legions_v432
    where is_active
      and public.kinojo_normalize_legion_name(legion_name)
        =public.kinojo_normalize_legion_name(v_legion)
  );

  insert into private.sanctuary_management_official_candidates_v432(
    actor_member_id,team_id,requested_character_name,character_name,server_id,
    server_name,race_id,class_name,legion_name,char_key,official_character_id,
    profile_image_url,detail_url,official_payload
  ) values (
    v_actor_id,p_team_id,btrim(p_requested_character_name),v_name,v_server_id,
    v_server.server_name,v_race_id,v_class,v_legion,v_char_key,v_official_id,
    nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),v_detail,p_official_payload
  ) returning candidate_id into v_candidate;

  return jsonb_build_object(
    'ok',true,'apiVersion',2.5,'schemaVersion',480,'databaseContract',480,
    'source','OFFICIAL','alreadyRegistered',false,'relationRequired',true,
    'candidate',jsonb_build_object(
      'candidateId',v_candidate,'characterName',v_name,'serverId',v_server_id,
      'serverName',v_server.server_name,'raceId',v_race_id,'className',v_class,
      'legionName',v_legion,'profileImageUrl',nullif(btrim(coalesce(p_official_payload->>'profileImageUrl','')),''),
      'power',v_power,'itemLevel',v_item_level,'isOperationalLegion',v_operational,
      'membershipRelation',case when v_operational then null else 'GUEST' end,
      'allowedRelations',case when v_operational
        then jsonb_build_array('MAIN','ALT')
        else jsonb_build_array('GUEST','ALT') end
    )
  );
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_can_manage_team_v412(p_actor jsonb, p_team_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  select exists(
    select 1 from private.sanctuary_management_teams_v412 t
    where t.team_id=p_team_id and (
      t.creator_member_id=nullif(p_actor->>'memberId','')::bigint
      or coalesce((p_actor->>'canManageAll')::boolean,false)
      or coalesce((p_actor->>'canManageAssigned')::boolean,false)
    )
  )
$function$
;
revoke all on function private.kinojo_sm_support_command_v450(text,text,text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.kinojo_admin_sanctuary_role_permission_set(p_pass_key text, p_role_key text, p_permission_key text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_role text;
  v_target_role text := public.kinojo_normalize_role(p_role_key,0);
begin
  select * into v_member
  from public.kinojo_member_from_web_credential_v326(p_pass_key)
  limit 1;
  if not found then raise exception '로그인 세션을 확인하지 못했습니다.' using errcode='P0001'; end if;
  v_role := public.kinojo_normalize_role(v_member.role,coalesce(v_member.level,0));
  if v_role <> 'MASTER' then raise exception '등급별 권한 설정은 MASTER만 변경할 수 있습니다.' using errcode='P0001'; end if;
  if v_target_role not in ('MEMBER','STAFF','MANAGER','SUB_MASTER') then raise exception 'MASTER 권한은 항상 활성화되며 변경할 수 없습니다.' using errcode='P0001'; end if;
  if not exists(select 1 from public.sanctuary_permission_catalog where permission_key=trim(coalesce(p_permission_key,'')) and enabled is true) then raise exception '권한 항목을 찾을 수 없습니다.' using errcode='P0001'; end if;

  insert into public.sanctuary_role_permissions(role_key,permission_key,enabled,updated_by_member_id,updated_by_character)
  values(v_target_role,trim(p_permission_key),coalesce(p_enabled,false),v_member.id,coalesce(v_member.main_character_name,''))
  on conflict(role_key,permission_key) do update set enabled=excluded.enabled,updated_by_member_id=excluded.updated_by_member_id,updated_by_character=excluded.updated_by_character,updated_at=now();

  return public.kinojo_admin_sanctuary_role_permissions(p_pass_key);
end;
$function$
;
revoke all on function kinojo_sanctuary_management_bootstrap_v412(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v412(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v413(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v413(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v414(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v414(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v429(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v429(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v430(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v430(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v431(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v431(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v432(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v432(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v433(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v433(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v435(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v435(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v436(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v436(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v437(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v437(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v439(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v439(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v445(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v445(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v446(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v446(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v449(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v449(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v450(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v450(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v451(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v451(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v452(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v452(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v454(text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v454(text) to service_role;
revoke all on function kinojo_sanctuary_management_bootstrap_v456(text,text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_bootstrap_v456(text,text) to service_role;
revoke all on function kinojo_sanctuary_management_command_v412(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v412(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v413(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v413(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v414(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v414(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v429(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v429(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v430(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v430(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v431(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v431(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v432(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v432(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v433(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v433(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v435(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v435(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v436(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v436(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v437(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v437(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v439(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v439(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v445(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v445(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v449(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v449(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v450(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v450(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v451(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v451(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v452(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v452(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_command_v454(text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_command_v454(text,text,text,jsonb,bigint) to service_role;
revoke all on function kinojo_sanctuary_management_lease_v412(text,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_lease_v412(text,bigint,text,text) to service_role;
revoke all on function kinojo_sanctuary_management_lease_v439(text,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_lease_v439(text,bigint,text,text) to service_role;
revoke all on function kinojo_sanctuary_management_lease_v445(text,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_lease_v445(text,bigint,text,text) to service_role;
revoke all on function kinojo_sanctuary_management_lease_v446(text,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function kinojo_sanctuary_management_lease_v446(text,bigint,text,text) to service_role;
update public.sanctuary_permission_catalog set enabled=false where permission_key in ('sanctuary_team_create','sanctuary_info_manage_assigned','sanctuary_info_manage_all','sanctuary_support_manage_assigned','sanctuary_support_manage_all','sanctuary_archive_manage_assigned','sanctuary_archive_manage_all');
do $$ declare f record; begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('kinojo_admin_sanctuary_permissions_v2','kinojo_admin_sanctuary_permission_set_v2','kinojo_admin_sanctuary_operators_v2','kinojo_admin_sanctuary_operator_set_v2','kinojo_sanctuary_management_command_v2','kinojo_sanctuary_management_bootstrap_v2','kinojo_sanctuary_management_revision_v2','kinojo_sanctuary_management_lease_v2') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop; end; $$;
notify pgrst,'reload schema';
commit;
