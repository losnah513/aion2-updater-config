-- Sanctuary management composer v457.
--
-- - Team creation may be saved without placing the creator's character.
-- - Existing teams may switch between FIXED and PARTICIPATION in the atomic
--   composer transaction. Pending participation requests are cancelled when
--   switching to FIXED so they cannot be applied to a non-recruiting team.
-- - Character lookup/registration and linked-alt lookup also accept a null
--   team while the browser-local creation draft does not have a team id yet.

alter table private.sanctuary_management_official_candidates_v432
  alter column team_id drop not null;

-- The v454/v453/v452 command chain still delegates atomic composition writes
-- to v446. Patch that single authority in place, and fail the migration if an
-- expected guard is no longer present instead of silently weakening a future
-- implementation.
do $migration$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'kinojo_sanctuary_management_command_v446'
     and p.oid::regprocedure::text = 'kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint)';

  if v_definition is null then
    raise exception 'kinojo_sanctuary_management_command_v446 was not found';
  end if;

  v_original := v_definition;
  v_definition := replace(
    v_definition,
    'if v_team.status=''ARCHIVED'' or v_team.team_mode<>v_mode then raise exception ''현재 편집할 수 없는 팀입니다.'' using errcode=''P0001''; end if;',
    'if v_team.status=''ARCHIVED'' then raise exception ''현재 편집할 수 없는 팀입니다.'' using errcode=''P0001''; end if;'
  );
  if v_definition = v_original then raise exception 'v446 mode guard patch target was not found'; end if;

  v_original := v_definition;
  v_definition := replace(
    v_definition,
    'update private.sanctuary_management_teams_v412 set sanctuary_id=v_sanctuary.id,title=btrim(p_payload->>''title''),activity=btrim(p_payload->>''activity''),join_policy=v_policy,updated_at=clock_timestamp() where team_id=v_team_id returning * into v_team;',
    'if v_team.team_mode<>v_mode and v_mode=''FIXED'' then
      update private.sanctuary_management_support_items_v412 support_item
         set status=''CANCELLED''
        from private.sanctuary_management_support_batches_v412 support_batch
       where support_batch.team_id=v_team_id
         and support_batch.support_batch_id=support_item.support_batch_id
         and support_item.status=''PENDING'';
      update private.sanctuary_management_support_batches_v412
         set status=''CANCELLED'',decision_member_id=v_actor_id,decided_at=clock_timestamp()
       where team_id=v_team_id and status=''PENDING'';
    end if;
    update private.sanctuary_management_teams_v412 set sanctuary_id=v_sanctuary.id,title=btrim(p_payload->>''title''),activity=btrim(p_payload->>''activity''),team_mode=v_mode,join_policy=v_policy,updated_at=clock_timestamp() where team_id=v_team_id returning * into v_team;'
  );
  if v_definition = v_original then raise exception 'v446 team update patch target was not found'; end if;

  v_original := v_definition;
  v_definition := replace(
    v_definition,
    '  if v_team.status=''DRAFT'' and v_team.team_mode=''PARTICIPATION'' and exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null and owner_member_id is distinct from v_team.creator_member_id) then raise exception ''참여 팀 공개 전에는 생성자의 캐릭터만 선배치할 수 있습니다.'' using errcode=''P0001''; end if;
  if v_team.status=''DRAFT'' and not exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null and owner_member_id=v_team.creator_member_id) then raise exception ''최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.'' using errcode=''P0001''; end if;
',
    ''
  );
  if v_definition = v_original then raise exception 'v446 creator placement guards were not found'; end if;

  v_original := v_definition;
  v_definition := replace(
    v_definition,
    '  if v_team.status=''DRAFT'' then
    v_sub_key := left(v_request_key||'':publish'',120);
    v_response := public.kinojo_sanctuary_management_command_v412(p_credential,v_sub_key,''PUBLISH_TEAM'',jsonb_build_object(''teamId'',v_team_id),v_team.revision);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  end if;',
    '  if v_team.status=''DRAFT'' then
    v_sub_key := left(v_request_key||'':publish'',120);
    v_response := to_jsonb(v_team);
    update private.sanctuary_management_teams_v412
       set published_at=coalesce(published_at,clock_timestamp()),status=''ACTIVE'',updated_at=clock_timestamp()
     where team_id=v_team_id returning * into v_team;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,''TEAM'',v_team_id,''PUBLISH_TEAM'',v_response,to_jsonb(v_team),v_sub_key);
  end if;'
  );
  if v_definition = v_original then raise exception 'v446 publish patch target was not found'; end if;

  execute v_definition;
end
$migration$;

create or replace function public.kinojo_sanctuary_management_character_search_v457(
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
$function$;

create or replace function public.kinojo_sanctuary_management_official_prepare_v457(
  p_credential text,p_team_id bigint,p_server_id integer,p_character_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.kinojo_sanctuary_management_official_gate_v457(
  p_credential text,p_team_id bigint,p_http_status integer,p_retry_after_seconds integer default null,p_error text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.kinojo_sanctuary_management_official_record_v457(
  p_credential text,p_team_id bigint,p_requested_character_name text,p_official_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.kinojo_sanctuary_management_official_materialize_v457(
  p_credential text,p_team_id bigint,p_candidate_id uuid,p_relation_type text,
  p_main_character_id bigint default null,p_request_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.kinojo_sanctuary_management_linked_alts_v457(
  p_credential text,p_team_id bigint,p_main_character_id bigint,p_force_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
$function$;

comment on function public.kinojo_sanctuary_management_character_search_v457(text,bigint,text,text) is 'Service-role character lookup for existing teams and browser-local creation drafts without a team id.';
comment on function public.kinojo_sanctuary_management_official_materialize_v457(text,bigint,uuid,text,bigint,text) is 'Service-role official character materialization for existing teams and browser-local creation drafts.';
comment on function public.kinojo_sanctuary_management_linked_alts_v457(text,bigint,bigint,bigint) is 'Service-role linked-alt lookup for existing teams and browser-local creation drafts.';

revoke all on function public.kinojo_sanctuary_management_character_search_v457(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_prepare_v457(text,bigint,integer,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_gate_v457(text,bigint,integer,integer,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_record_v457(text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v457(text,bigint,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_linked_alts_v457(text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_management_character_search_v457(text,bigint,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_prepare_v457(text,bigint,integer,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_gate_v457(text,bigint,integer,integer,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_record_v457(text,bigint,text,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v457(text,bigint,uuid,text,bigint,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_linked_alts_v457(text,bigint,bigint,bigint) to service_role;
