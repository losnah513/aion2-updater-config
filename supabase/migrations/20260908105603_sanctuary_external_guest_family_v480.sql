-- DB480: Sanctuary external character registration keeps membership and family
-- relations separate. A non-member alt remains a GUEST for authorization while
-- its canonical family relation is ALT. Optional list-sheet export is queued
-- after the atomic character/family transaction and can be retried independently.

create table private.sanctuary_character_registration_events_v480 (
  registration_id uuid primary key default gen_random_uuid(),
  actor_member_id bigint not null references public.member_codes(id) on delete restrict,
  team_id bigint references private.sanctuary_management_teams_v412(team_id) on delete set null,
  request_key text not null,
  target_candidate_id uuid not null references private.sanctuary_management_official_candidates_v432(candidate_id) on delete restrict,
  main_candidate_id uuid references private.sanctuary_management_official_candidates_v432(candidate_id) on delete restrict,
  target_character_id bigint references public.character_master(id) on delete set null,
  main_character_id bigint references public.character_master(id) on delete set null,
  family_relation text not null check (family_relation in ('MAIN','ALT')),
  membership_relation text not null check (membership_relation in ('MAIN','ALT','GUEST')),
  list_sync_requested boolean not null default true,
  list_sync_status text not null default 'NOT_REQUESTED'
    check (list_sync_status in ('NOT_REQUESTED','PENDING','SYNCING','SYNCED','FAILED')),
  list_queue_session_id text,
  list_queue_count integer not null default 0 check (list_queue_count >= 0),
  list_sync_attempts integer not null default 0 check (list_sync_attempts >= 0),
  list_sync_code text,
  list_sync_message text,
  list_sync_detail jsonb not null default '{}'::jsonb,
  request_payload jsonb not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  list_synced_at timestamptz,
  unique (actor_member_id, request_key)
);

create index sanctuary_character_registration_events_v480_status_idx
  on private.sanctuary_character_registration_events_v480(list_sync_status, updated_at desc)
  where list_sync_requested;

alter table private.sanctuary_character_registration_events_v480 enable row level security;
revoke all on private.sanctuary_character_registration_events_v480 from public, anon, authenticated;

create or replace function private.kinojo_sm_character_card_v480(p_character_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.kinojo_sm_character_card_v452(character.id)
    || jsonb_build_object(
      'isMain', coalesce(character.is_main, false)
        or coalesce(character.main_character_id, character.id) = character.id,
      'familyRelation', case
        when coalesce(character.is_main, false)
          or coalesce(character.main_character_id, character.id) = character.id then 'MAIN'
        else 'ALT'
      end,
      'membershipRelation', coalesce(
        private.kinojo_sm_character_card_v452(character.id)->>'relation',
        'GUEST'
      )
    )
  from public.character_master character
  where character.id = p_character_id
$function$;

-- The official lookup result now exposes the two explicit choices needed for
-- an external character: independent guest, or an alt linked to a searched main.
create or replace function public.kinojo_sanctuary_management_official_record_v480(
  p_credential text,
  p_team_id bigint,
  p_requested_character_name text,
  p_official_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.kinojo_sanctuary_management_character_search_v480(
  p_credential text,
  p_team_id bigint,
  p_character_name text,
  p_server_name text default '지켈'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function private.kinojo_sm_materialize_candidate_v480(
  p_candidate_id uuid,
  p_actor_member_id bigint,
  p_family_relation text,
  p_main_character_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_character_id bigint;
  v_power integer;
  v_item_level integer;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_candidate
  from private.sanctuary_management_official_candidates_v432
  where candidate_id=p_candidate_id
  for update;

  if v_candidate.candidate_id is null
     or v_candidate.actor_member_id<>p_actor_member_id then
    raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001';
  end if;
  if v_candidate.state='MATERIALIZED' and v_candidate.materialized_character_id is not null then
    if not exists(
      select 1 from public.character_master character
      where character.id=v_candidate.materialized_character_id
        and coalesce(character.main_character_id,character.id)=
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '이미 확정된 캐릭터 관계가 다릅니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    return v_candidate.materialized_character_id;
  end if;
  if v_candidate.state<>'VERIFIED' or v_candidate.expires_at<=v_now then
    update private.sanctuary_management_official_candidates_v432
       set state='EXPIRED',updated_at=v_now
     where candidate_id=p_candidate_id and state='VERIFIED';
    raise exception '공식 조회 결과가 만료되었습니다. 다시 조회해 주세요.' using errcode='P0001';
  end if;
  if upper(coalesce(p_family_relation,'')) not in ('MAIN','ALT')
     or (upper(p_family_relation)='ALT' and p_main_character_id is null) then
    raise exception '본캐·부캐 관계를 다시 확인해 주세요.' using errcode='P0001';
  end if;

  v_power := nullif(v_candidate.official_payload->>'pveCombatPower','')::integer;
  v_item_level := nullif(v_candidate.official_payload->>'pveItemLevel','')::integer;
  perform pg_advisory_xact_lock(hashtextextended(
    'sm-character:'||v_candidate.server_id||':'||public.kinojo_character_identity_key_v298(v_candidate.character_name),480
  ));

  select id into v_character_id
  from public.character_master
  where server_id=v_candidate.server_id
    and public.kinojo_character_identity_key_v298(character_name)
      =public.kinojo_character_identity_key_v298(v_candidate.character_name)
  order by is_active desc,(identity_status='CURRENT') desc,updated_at desc
  limit 1;

  if v_character_id is null then
    insert into public.character_master(
      server_id,server_name,character_name,char_key,profile_image_url,detail_url,
      image_updated_at,status,error_message,main_character_name,is_main,class_name,
      list_row,first_seen_at,last_seen_at,is_active,lookup_excluded,visibility_excluded,
      lookup_failure_streak,lookup_failure_total,last_lookup_success_at,main_character_id,
      identity_status,identity_verified_at,bootstrap_source,bootstrap_imported_at,
      legion_name,legion_updated_at,latest_pve_combat_power,latest_pve_item_level,last_synced_at
    ) values (
      v_candidate.server_id,v_candidate.server_name,v_candidate.character_name,v_candidate.char_key,
      v_candidate.profile_image_url,v_candidate.detail_url,v_now,'OK',null,
      case when upper(p_family_relation)='ALT' then
        (select character_name from public.character_master where id=p_main_character_id)
        else v_candidate.character_name end,
      upper(p_family_relation)='MAIN',v_candidate.class_name,null,v_now,v_now,true,false,false,
      0,0,v_now,case when upper(p_family_relation)='ALT' then p_main_character_id else null end,
      'CURRENT',v_now,'SANCTUARY_MANAGEMENT_OFFICIAL_V480',v_now,v_candidate.legion_name,v_now,
      v_power,v_item_level,v_now
    ) returning id into v_character_id;
  else
    if exists(
      select 1 from public.character_master character
      where character.id=v_character_id and character.is_active and character.identity_status='CURRENT'
        and coalesce(character.main_character_id,character.id)<>
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '조회 후 캐릭터 관계가 변경되었습니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    update public.character_master
       set server_name=v_candidate.server_name,
           char_key=coalesce(nullif(v_candidate.char_key,''),char_key),
           profile_image_url=coalesce(v_candidate.profile_image_url,profile_image_url),
           detail_url=coalesce(nullif(v_candidate.detail_url,''),detail_url),
           class_name=coalesce(nullif(v_candidate.class_name,''),class_name),
           legion_name=v_candidate.legion_name,legion_updated_at=v_now,
           latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),
           latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),
           status='OK',is_active=true,identity_status='CURRENT',identity_verified_at=v_now,
           last_lookup_success_at=v_now,last_synced_at=v_now,updated_at=v_now
     where id=v_character_id;
  end if;

  update private.sanctuary_management_official_candidates_v432
     set state='MATERIALIZED',materialized_character_id=v_character_id,
         materialized_at=v_now,updated_at=v_now
   where candidate_id=p_candidate_id;
  return v_character_id;
end
$function$;

create or replace function public.kinojo_sanctuary_management_official_materialize_v480(
  p_credential text,
  p_team_id bigint,
  p_candidate_id uuid,
  p_relation_type text,
  p_main_character_id bigint default null,
  p_main_candidate_id uuid default null,
  p_list_sync_enabled boolean default true,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '12s'
set lock_timeout = '1500ms'
as $function$
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
$function$;

-- Service-only List hand-off functions. The browser never receives a service
-- credential and cannot mutate queue or registration state directly.
create or replace function public.kinojo_sanctuary_list_sync_prepare_v480(
  p_registration_id uuid,
  p_queue_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event private.sanctuary_character_registration_events_v480%rowtype;
  v_queue_count integer;
begin
  select * into v_event
  from private.sanctuary_character_registration_events_v480
  where registration_id=p_registration_id
  for update;
  if not found or not v_event.list_sync_requested
     or v_event.list_queue_session_id is distinct from p_queue_session_id then
    return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND','message','List 반영 등록 정보를 찾지 못했습니다.');
  end if;
  if v_event.list_sync_status='SYNCED' then
    return jsonb_build_object('ok',true,'alreadySynced',true,'registrationId',p_registration_id,
      'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_event.list_queue_count);
  end if;
  select count(*) into v_queue_count
  from public.google_list_sheet_sync_queue
  where session_id=v_event.list_queue_session_id and sync_status<>'synced';
  if v_queue_count<1 then
    return jsonb_build_object('ok',false,'code','LIST_QUEUE_EMPTY','message','반영할 List Queue가 없습니다.');
  end if;
  update private.sanctuary_character_registration_events_v480
     set list_sync_status='SYNCING',updated_at=clock_timestamp()
   where registration_id=p_registration_id;
  return jsonb_build_object('ok',true,'registrationId',p_registration_id,
    'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_queue_count);
end
$function$;

create or replace function public.kinojo_sanctuary_list_readback_finalize_v480(
  p_registration_id uuid,
  p_mappings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event private.sanctuary_character_registration_events_v480%rowtype;
  v_expected integer;
  v_updated integer;
begin
  if jsonb_typeof(coalesce(p_mappings,'[]'::jsonb))<>'array' then
    return jsonb_build_object('ok',false,'code','LIST_MAPPING_INVALID','message','List 행 확정값이 올바르지 않습니다.');
  end if;
  select * into v_event
  from private.sanctuary_character_registration_events_v480
  where registration_id=p_registration_id
  for update;
  if not found or not v_event.list_sync_requested or v_event.list_queue_session_id is null then
    return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND','message','List 반영 등록 정보를 찾지 못했습니다.');
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_mappings) as mapping(id bigint,row integer)
    left join public.google_list_sheet_sync_queue queue
      on queue.id=mapping.id and queue.session_id=v_event.list_queue_session_id
    where queue.id is null or mapping.row is null or mapping.row<6
  ) then
    return jsonb_build_object('ok',false,'code','LIST_MAPPING_SCOPE_INVALID','message','List 행 확정 범위가 일치하지 않습니다.');
  end if;
  select count(*) into v_expected
  from public.google_list_sheet_sync_queue
  where session_id=v_event.list_queue_session_id and append_if_missing;
  if jsonb_array_length(p_mappings)<>v_expected then
    return jsonb_build_object('ok',false,'code','LIST_MAPPING_INCOMPLETE','message','신규 List 행이 모두 확인되지 않았습니다.');
  end if;
  if (select count(distinct mapping.id) from jsonb_to_recordset(p_mappings) as mapping(id bigint,row integer))<>v_expected
     or (select count(distinct mapping.row) from jsonb_to_recordset(p_mappings) as mapping(id bigint,row integer))<>v_expected then
    return jsonb_build_object('ok',false,'code','LIST_MAPPING_DUPLICATE','message','List 행 확정값이 중복되었습니다.');
  end if;
  update public.character_master character
     set list_row=mapping.row,updated_at=clock_timestamp()
    from jsonb_to_recordset(p_mappings) as mapping(id bigint,row integer)
    join public.google_list_sheet_sync_queue queue
      on queue.id=mapping.id and queue.session_id=v_event.list_queue_session_id
   where character.id=queue.character_id;
  get diagnostics v_updated=row_count;
  return jsonb_build_object('ok',true,'registrationId',p_registration_id,'updatedCount',v_updated);
end
$function$;

create or replace function public.kinojo_sanctuary_list_sync_result_v480(
  p_registration_id uuid,
  p_ok boolean,
  p_code text default null,
  p_message text default null,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event private.sanctuary_character_registration_events_v480%rowtype;
  v_status text;
begin
  select * into v_event
  from private.sanctuary_character_registration_events_v480
  where registration_id=p_registration_id
  for update;
  if not found or not v_event.list_sync_requested then
    return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND','message','List 반영 등록 정보를 찾지 못했습니다.');
  end if;
  if v_event.list_sync_status='SYNCED' then
    return jsonb_build_object('ok',true,'registrationId',p_registration_id,'status','SYNCED',
      'message','List 시트에 이미 반영되었습니다.');
  end if;
  v_status := case when coalesce(p_ok,false) then 'SYNCED' else 'FAILED' end;
  update private.sanctuary_character_registration_events_v480
     set list_sync_status=v_status,list_sync_attempts=list_sync_attempts+1,
         list_sync_code=nullif(btrim(coalesce(p_code,'')),''),
         list_sync_message=nullif(left(btrim(coalesce(p_message,'')),500),''),
         list_sync_detail=case when jsonb_typeof(coalesce(p_detail,'{}'::jsonb))='object' then coalesce(p_detail,'{}'::jsonb) else '{}'::jsonb end,
         list_synced_at=case when v_status='SYNCED' then clock_timestamp() else null end,
         updated_at=clock_timestamp(),
         result=jsonb_set(
           result,'{listSync}',
           jsonb_build_object(
             'requested',true,'status',v_status,'queueCount',list_queue_count,
             'message',coalesce(nullif(left(btrim(coalesce(p_message,'')),500),''),
               case when v_status='SYNCED' then 'List 시트 반영 완료' else 'List 시트 반영 실패' end)
           ),true
         )
   where registration_id=p_registration_id;
  return jsonb_build_object(
    'ok',true,'registrationId',p_registration_id,'status',v_status,
    'message',coalesce(nullif(left(btrim(coalesce(p_message,'')),500),''),
      case when v_status='SYNCED' then 'List 시트 반영 완료' else 'List 시트 반영 실패' end)
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_list_retry_v480(
  p_credential text,
  p_registration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_event private.sanctuary_character_registration_events_v480%rowtype;
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_LIST_RETRY');
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  select * into v_event
  from private.sanctuary_character_registration_events_v480
  where registration_id=p_registration_id
  for update;
  if not found
     or (v_event.actor_member_id<>v_actor_id
       and not coalesce((v_actor->>'canManageAll')::boolean,false)) then
    raise exception 'List 반영 재시도 대상을 찾지 못했습니다.' using errcode='P0001';
  end if;
  if not v_event.list_sync_requested then
    raise exception 'List 반영 안 함으로 등록된 캐릭터입니다.' using errcode='P0001';
  end if;
  if v_event.list_sync_status='SYNCED' then
    return jsonb_build_object('ok',true,'alreadySynced',true,'registrationId',p_registration_id,
      'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_event.list_queue_count,
      'status','SYNCED','message','List 시트에 이미 반영되었습니다.');
  end if;
  update public.google_list_sheet_sync_queue
     set sync_status='queued',error_message=null,updated_at=clock_timestamp()
   where session_id=v_event.list_queue_session_id and sync_status<>'synced';
  update private.sanctuary_character_registration_events_v480
     set list_sync_status='PENDING',updated_at=clock_timestamp()
   where registration_id=p_registration_id;
  return jsonb_build_object('ok',true,'registrationId',p_registration_id,
    'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_event.list_queue_count,
    'status','PENDING','message','List 시트 반영을 다시 시도합니다.');
end
$function$;

-- Read-only service audit: no row is changed automatically. It highlights the
-- old failure shape so an administrator can review ambiguous records manually.
create or replace function public.kinojo_sanctuary_guest_family_audit_v480()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'ok',true,'databaseContract',480,'count',count(*),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'characterId',character.id,'characterName',character.character_name,
      'serverId',character.server_id,'serverName',character.server_name,
      'rootCharacterId',owner.root_character_id,'isMain',character.is_main,
      'listRow',character.list_row,'verificationSource',owner.verification_source
    ) order by owner.updated_at desc) filter (where character.id is not null),'[]'::jsonb)
  )
  from private.sanctuary_character_owners_v412 owner
  join public.character_master character on character.id=owner.character_id
  where owner.owner_member_id is null and owner.relation='GUEST'
    and owner.root_character_id=owner.character_id
    and coalesce(character.is_main,false)
    and character.bootstrap_source like 'SANCTUARY_MANAGEMENT_OFFICIAL_V45%'
$function$;

-- Preserve GUEST as the authorization relation, but expose ALT in every slot
-- when the canonical family root proves that the character is an alt.
create or replace function private.kinojo_sm_normalize_slot_character_relation_v463()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_relation text;
  v_root_character_id bigint;
begin
  if new.character_id is null
     or upper(coalesce(new.assignment_kind,'ACTUAL_CHARACTER'))<>'ACTUAL_CHARACTER' then
    return new;
  end if;
  select case
      when owner.character_id is not null and owner.relation in ('MAIN','ALT') then owner.relation
      when owner.character_id is not null and owner.relation='GUEST'
        and not (coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id) then 'ALT'
      when owner.character_id is not null then 'GUEST'
      when exists(
        select 1 from private.sanctuary_operational_legions_v432 legion
        where legion.is_active
          and lower(btrim(legion.legion_name))=lower(btrim(character.legion_name))
      ) then case
        when coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id then 'MAIN'
        when character.main_character_id is not null then 'ALT'
        else 'GUEST' end
      else case
        when not (coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id) then 'ALT'
        else 'GUEST' end
    end,
    coalesce(character.main_character_id,character.id)
  into v_relation,v_root_character_id
  from public.character_master character
  left join private.sanctuary_character_owners_v412 owner
    on owner.character_id=character.id
  where character.id=new.character_id
    and coalesce(character.is_active,true)
    and coalesce(character.identity_status,'CURRENT')='CURRENT';
  if not found then return new; end if;
  new.character_relation:=v_relation;
  new.owner_root_character_id:=v_root_character_id;
  return new;
end
$function$;

revoke all on function private.kinojo_sm_character_card_v480(bigint) from public,anon,authenticated;
revoke all on function private.kinojo_sm_materialize_candidate_v480(uuid,bigint,text,bigint) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_record_v480(text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_character_search_v480(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v480(text,bigint,uuid,text,bigint,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_list_sync_prepare_v480(uuid,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_list_readback_finalize_v480(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_list_sync_result_v480(uuid,boolean,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_list_retry_v480(text,uuid) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_guest_family_audit_v480() from public,anon,authenticated;
revoke all on function private.kinojo_sm_normalize_slot_character_relation_v463() from public,anon,authenticated;

grant execute on function public.kinojo_sanctuary_management_official_record_v480(text,bigint,text,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_character_search_v480(text,bigint,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v480(text,bigint,uuid,text,bigint,uuid,boolean,text) to service_role;
grant execute on function public.kinojo_sanctuary_list_sync_prepare_v480(uuid,text) to service_role;
grant execute on function public.kinojo_sanctuary_list_readback_finalize_v480(uuid,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_list_sync_result_v480(uuid,boolean,text,text,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_list_retry_v480(text,uuid) to service_role;
grant execute on function public.kinojo_sanctuary_guest_family_audit_v480() to service_role;

comment on table private.sanctuary_character_registration_events_v480 is
  'DB480 idempotency and optional List export state for Sanctuary official character registration.';
comment on function public.kinojo_sanctuary_management_official_materialize_v480(text,bigint,uuid,text,bigint,uuid,boolean,text) is
  'Atomically materializes an official character and optional official main candidate while separating membership from family relation.';
comment on function public.kinojo_sanctuary_guest_family_audit_v480() is
  'Read-only candidates for manual review of legacy self-root Sanctuary guests; never mutates data.';

notify pgrst,'reload schema';
