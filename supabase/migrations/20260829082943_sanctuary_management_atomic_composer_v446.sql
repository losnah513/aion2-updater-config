-- Stage 7 review composer: the modal is a browser-local workspace and sends one
-- SAVE_COMPOSITION command only after the user finishes team, force, slot, and
-- schedule editing. The command is one PostgreSQL transaction, so closing or
-- resetting the modal never leaves a partial Server composition.

create or replace function private.kinojo_sm_composer_characters_v446(p_credential text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_list jsonb;
  v_characters jsonb := '[]'::jsonb;
begin
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then
    return jsonb_build_object('ownerResolved', false, 'code', 'LOGIN_REQUIRED', 'candidateCount', 0, 'characters', '[]'::jsonb);
  end if;

  v_list := public.kinojo_member_character_list_v334(v_actor_id);
  if coalesce((v_list->>'ok')::boolean, false) is not true
     or coalesce((v_list->>'ownerResolved')::boolean, false) is not true then
    return jsonb_build_object(
      'ownerResolved', false,
      'code', coalesce(nullif(v_list->>'code', ''), 'COMPOSER_OWNER_NOT_RESOLVED'),
      'candidateCount', 0,
      'characters', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'characterId', nullif(character_item->>'characterId', '')::bigint,
    'characterName', character_item->>'characterName',
    'serverId', nullif(character_item->>'serverId', '')::integer,
    'serverName', character_item->>'serverName',
    'className', character_item->>'className',
    'profileImageUrl', character_item->>'officialProfileImageUrl',
    'isMain', coalesce((character_item->>'isMain')::boolean, false),
    'relation', case when coalesce((character_item->>'isMain')::boolean, false) then 'MAIN' else 'ALT' end,
    'mainCharacterId', coalesce(nullif(character_item->>'mainCharacterId', '')::bigint, nullif(character_item->>'characterId', '')::bigint),
    'ownerMemberId', v_actor_id
  ) order by candidate_order), '[]'::jsonb)
    into v_characters
    from jsonb_array_elements(coalesce(v_list->'characters', '[]'::jsonb))
      with ordinality as candidates(character_item, candidate_order)
   where nullif(character_item->>'characterId', '')::bigint is not null;

  return jsonb_build_object(
    'ownerResolved', true,
    'code', 'READY',
    'candidateCount', jsonb_array_length(v_characters),
    'characters', v_characters
  );
end;
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v446(p_credential text)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select (base-'notificationPolicy'-'transitionReview'-'composerCharacters')||jsonb_build_object(
    'apiVersion',1.8,'schemaVersion',446,'databaseContract',446,
    'notificationPolicy',coalesce(base->'notificationPolicy','{}'::jsonb)||jsonb_build_object('pilotOnly',false),
    'composerCharacters',private.kinojo_sm_composer_characters_v446(p_credential),
    'transitionReview',coalesce(base->'transitionReview','{}'::jsonb)||coalesce((
      select jsonb_build_object('executed',state in('EXECUTED','SYNC_STOPPED','OPEN','COMPLETE'),'completed',state='COMPLETE','runId',run_id,'stage7State',state)
      from private.sanctuary_management_stage7_runs_v446 order by run_id desc limit 1
    ),jsonb_build_object('executed',false,'completed',false,'stage7State','NOT_STARTED'))
  ) from (select public.kinojo_sanctuary_management_bootstrap_v445(p_credential) base) source
$function$;

create or replace function public.kinojo_sanctuary_management_command_v446(
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
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_actor jsonb;
  v_actor_id bigint;
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_party_id bigint;
  v_character_id bigint;
  v_desired_count integer;
  v_current_count integer;
  v_force_no integer;
  v_party_no integer;
  v_slot_no integer;
  v_mode text;
  v_policy text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_composition jsonb;
  v_force_json jsonb;
  v_slot_json jsonb;
  v_before jsonb;
  v_after jsonb;
  v_conflicts jsonb;
  v_response jsonb;
  v_created boolean := false;
  v_sub_key text;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    return public.kinojo_sanctuary_management_command_v445(p_credential,p_request_key,p_action,p_payload,p_expected_revision)
      || jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
  end if;

  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, v_action);
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode='P0001'; end if;
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode='P0001'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception '팀 저장 형식이 올바르지 않습니다.' using errcode='P0001'; end if;

  v_hash := encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_actor_id||':'||v_request_key,446));
  select * into v_existing from private.sanctuary_management_commands_v412 where actor_member_id=v_actor_id and request_key=v_request_key;
  if v_existing.command_id is not null then
    if v_existing.action<>v_action or v_existing.request_hash<>v_hash then raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='P0001'; end if;
    return v_existing.response_payload||jsonb_build_object('replayed',true,'apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
  end if;

  v_mode := upper(btrim(coalesce(p_payload->>'mode','')));
  v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy','INSTANT')));
  if v_mode not in ('FIXED','PARTICIPATION') or v_policy not in ('INSTANT','APPROVAL') then raise exception '고정·참여 팀과 참가 방식을 다시 선택해 주세요.' using errcode='P0001'; end if;
  if v_mode='FIXED' then v_policy:='INSTANT'; end if;
  if char_length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 80 then raise exception '팀 이름을 1자 이상 80자 이하로 입력해 주세요.' using errcode='P0001'; end if;
  if char_length(btrim(coalesce(p_payload->>'activity',''))) not between 1 and 24 then raise exception '팀 이름을 다시 확인해 주세요.' using errcode='P0001'; end if;

  select * into v_sanctuary from public.sanctuary_master where code=btrim(p_payload->>'sanctuaryCode') and management_visible;
  if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode='P0001'; end if;
  v_kind := upper(coalesce(p_payload->'schedule'->>'kind',''));
  v_starts_on := nullif(p_payload->'schedule'->>'startsOn','')::date;
  v_weekdays := coalesce(array(select distinct weekday::smallint from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays','[]'::jsonb)) weekday order by weekday::smallint),'{}'::smallint[]);
  v_starts_at := nullif(p_payload->'schedule'->>'startsAt','')::time;
  v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes','')::integer,30);
  if v_starts_on is null or v_starts_at is null or v_kind not in ('ONCE','WEEKLY')
     or (v_kind='ONCE' and cardinality(v_weekdays)<>0)
     or (v_kind='WEEKLY' and cardinality(v_weekdays) not between 1 and 7)
     or exists(select 1 from unnest(v_weekdays) weekday where weekday not between 1 and 7)
     or v_duration not in (30,60,120,720) then raise exception '일정과 진행 시간을 다시 확인해 주세요.' using errcode='P0001'; end if;
  if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;

  v_composition := coalesce(p_payload->'composition','[]'::jsonb);
  if jsonb_typeof(v_composition)<>'array' or jsonb_array_length(v_composition) not between 1 and 9 then raise exception '포스를 하나 이상, 최대 9개까지 구성해 주세요.' using errcode='P0001'; end if;
  if exists(
    select 1 from jsonb_array_elements(v_composition) force_item
     where coalesce(jsonb_typeof(force_item->'slots'),'')<>'array'
        or jsonb_array_length(force_item->'slots')<>10
        or exists(select 1 from jsonb_array_elements(force_item->'slots') slot_item
                   where nullif(slot_item->>'partyNo','')::integer not in (1,2)
                      or nullif(slot_item->>'slotNo','')::integer not between 1 and 5
                      or (slot_item->>'characterId' is not null and nullif(slot_item->>'characterId','')::bigint<1))
        or (select count(distinct ((slot_item->>'partyNo')||':'||(slot_item->>'slotNo'))) from jsonb_array_elements(force_item->'slots') slot_item)<>10
  ) then raise exception '각 포스는 1·2파티의 10개 슬롯을 정확히 포함해야 합니다.' using errcode='P0001'; end if;
  if (select count(*)<>count(distinct nullif(slot_item->>'characterId','')::bigint)
        from jsonb_array_elements(v_composition) force_item
        cross join lateral jsonb_array_elements(force_item->'slots') slot_item
       where slot_item->>'characterId' is not null) then raise exception '같은 캐릭터는 한 팀에 중복 배치할 수 없습니다.' using errcode='P0001'; end if;
  if (select count(*)<>count(distinct nullif(force_item->>'sourceForceId','')::bigint)
        from jsonb_array_elements(v_composition) force_item
       where force_item->>'sourceForceId' is not null) then raise exception '같은 포스가 편성안에 중복되었습니다.' using errcode='P0001'; end if;

  v_team_id := nullif(p_payload->>'teamId','')::bigint;
  if v_team_id is null then
    v_sub_key := left(v_request_key||':create',120);
    v_response := public.kinojo_sanctuary_management_command_v436(
      p_credential,v_sub_key,'CREATE_TEAM',coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('mode',v_mode,'joinPolicy',v_policy),null
    );
    v_team_id := nullif(v_response->>'teamId','')::bigint;
    v_created := true;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  else
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '이 팀을 편집할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' or v_team.team_mode<>v_mode then raise exception '현재 편집할 수 없는 팀입니다.' using errcode='P0001'; end if;
    if p_expected_revision is null or v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id,v_team_id,p_payload->>'leaseToken');
  end if;

  select jsonb_build_object(
    'team',to_jsonb(v_team),
    'forceCount',(select count(*) from private.sanctuary_management_forces_v412 where team_id=v_team_id),
    'occupiedCount',(select count(*) from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null)
  ) into v_before;

  if not v_created then
    update private.sanctuary_management_teams_v412 set sanctuary_id=v_sanctuary.id,title=btrim(p_payload->>'title'),activity=btrim(p_payload->>'activity'),join_policy=v_policy,updated_at=clock_timestamp() where team_id=v_team_id returning * into v_team;
    update private.sanctuary_management_schedule_rules_v412 set schedule_kind=v_kind,starts_on=v_starts_on,weekdays=v_weekdays,starts_at=v_starts_at,duration_minutes=v_duration,status='ACTIVE',updated_at=clock_timestamp() where team_id=v_team_id;
    if not found then raise exception '팀 일정을 찾을 수 없습니다.' using errcode='P0001'; end if;

    if exists(
      select 1 from private.sanctuary_management_forces_v412 force_row
       where force_row.team_id=v_team_id
         and not exists(select 1 from jsonb_array_elements(v_composition) force_item where nullif(force_item->>'sourceForceId','')::bigint=force_row.force_id)
         and exists(select 1 from private.sanctuary_management_support_items_v412 support_item where support_item.force_id=force_row.force_id)
    ) then raise exception '지원 이력이 있는 포스는 바로 제거할 수 없습니다.' using errcode='P0001'; end if;
    delete from private.sanctuary_management_forces_v412 force_row
     where force_row.team_id=v_team_id
       and not exists(select 1 from jsonb_array_elements(v_composition) force_item where nullif(force_item->>'sourceForceId','')::bigint=force_row.force_id);

    for v_force_json,v_force_no in select force_item,ordinality::integer from jsonb_array_elements(v_composition) with ordinality as desired(force_item,ordinality) loop
      v_force_id:=nullif(v_force_json->>'sourceForceId','')::bigint;
      if v_force_id is not null then
        if not exists(select 1 from private.sanctuary_management_forces_v412 where team_id=v_team_id and force_id=v_force_id) then raise exception '편집할 포스를 다시 불러와 주세요.' using errcode='40001'; end if;
        update private.sanctuary_management_forces_v412 set force_no=v_force_no where team_id=v_team_id and force_id=v_force_id and force_no<>v_force_no;
      end if;
    end loop;
  end if;

  v_desired_count := jsonb_array_length(v_composition);
  select count(*)::integer into v_current_count from private.sanctuary_management_forces_v412 where team_id=v_team_id;
  while v_current_count<v_desired_count loop
    v_force_no := v_current_count+1;
    insert into private.sanctuary_management_forces_v412(team_id,force_no) values(v_team_id,v_force_no) returning force_id into v_force_id;
    for v_party_no in 1..2 loop
      insert into private.sanctuary_management_parties_v412(team_id,force_id,party_no) values(v_team_id,v_force_id,v_party_no) returning party_id into v_party_id;
      insert into private.sanctuary_management_slots_v412(team_id,force_id,party_id,slot_no) select v_team_id,v_force_id,v_party_id,slot_number from generate_series(1,5) slot_number;
    end loop;
    v_current_count := v_current_count+1;
  end loop;
  while v_current_count>v_desired_count loop
    select force_id into v_force_id from private.sanctuary_management_forces_v412 where team_id=v_team_id order by force_no desc limit 1;
    if exists(select 1 from private.sanctuary_management_support_items_v412 where force_id=v_force_id) then raise exception '지원 이력이 있는 포스는 바로 제거할 수 없습니다.' using errcode='P0001'; end if;
    delete from private.sanctuary_management_forces_v412 where force_id=v_force_id;
    v_current_count := v_current_count-1;
  end loop;

  update private.sanctuary_management_slots_v412 set character_id=null,owner_member_id=null,owner_root_character_id=null,character_relation=null,added_by_member_id=v_actor_id where team_id=v_team_id and character_id is not null;
  for v_force_json,v_force_no in select force_item,ordinality::integer from jsonb_array_elements(v_composition) with ordinality as desired(force_item,ordinality) loop
    select force_id into strict v_force_id from private.sanctuary_management_forces_v412 where team_id=v_team_id and force_no=v_force_no;
    for v_slot_json in select slot_item from jsonb_array_elements(v_force_json->'slots') slot_item loop
      v_character_id := nullif(v_slot_json->>'characterId','')::bigint;
      if v_character_id is not null then
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
        if v_owner.character_id is null then raise exception '캐릭터 %의 소유 관계를 확인할 수 없습니다.',v_character_id using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 slot_row
           set character_id=v_owner.character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.root_character_id,
               character_relation=v_owner.relation,added_by_member_id=v_actor_id
          from private.sanctuary_management_parties_v412 party_row
         where slot_row.team_id=v_team_id and slot_row.force_id=v_force_id and slot_row.party_id=party_row.party_id
           and party_row.party_no=(v_slot_json->>'partyNo')::integer and slot_row.slot_no=(v_slot_json->>'slotNo')::integer;
        if not found then raise exception '캐릭터를 배치할 슬롯을 찾을 수 없습니다.' using errcode='P0001'; end if;
      end if;
    end loop;
  end loop;

  if exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and owner_member_id is not null group by force_id,owner_member_id having count(*)>1) then raise exception '모든 이용자는 각 포스에 본캐·부캐를 합쳐 캐릭터 1개만 배치할 수 있습니다.' using errcode='P0001'; end if;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  if v_team.status='DRAFT' and v_team.team_mode='PARTICIPATION' and exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null and owner_member_id is distinct from v_team.creator_member_id) then raise exception '참여 팀 공개 전에는 생성자의 캐릭터만 선배치할 수 있습니다.' using errcode='P0001'; end if;
  if v_team.status='DRAFT' and not exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null and owner_member_id=v_team.creator_member_id) then raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode='P0001'; end if;

  perform private.kinojo_sm_recompute_status_v412(v_team_id);
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  if v_team.status='DRAFT' then
    v_sub_key := left(v_request_key||':publish',120);
    v_response := public.kinojo_sanctuary_management_command_v412(p_credential,v_sub_key,'PUBLISH_TEAM',jsonb_build_object('teamId',v_team_id),v_team.revision);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  end if;
  v_conflicts := private.kinojo_sm_team_conflicts_v437(v_team_id,current_date,current_date+366);
  if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;

  select jsonb_build_object(
    'team',to_jsonb(v_team),
    'forceCount',(select count(*) from private.sanctuary_management_forces_v412 where team_id=v_team_id),
    'occupiedCount',(select count(*) from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null)
  ) into v_after;
  v_response := jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',v_team.revision,'forceCount',v_desired_count,'occupiedCount',v_after->'occupiedCount','created',v_created,'replayed',false);
  perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,v_before,v_after,v_request_key);
  insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload) values(v_actor_id,v_request_key,v_action,v_hash,v_response);
  return v_response||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
end;
$function$;

comment on function private.kinojo_sm_composer_characters_v446(text) is 'Returns the signed-in member character cards for the browser-local team composer. No credential or passkey is stored.';
comment on function public.kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) is 'Service-role Edge boundary. SAVE_COMPOSITION applies one complete browser-local team composition in one transaction; authorization and lease checks remain mandatory.';

revoke all on function private.kinojo_sm_composer_characters_v446(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v446(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v446(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) to service_role;
