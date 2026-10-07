-- Production column definitions and actual registration functions captured 2026-10-07.
-- No production rows or credentials. Auth/permission/card/audit are narrow test adapters.
create schema private;
create sequence character_master_id_seq;
create sequence google_list_sheet_sync_queue_id_seq;
create table private.sanctuary_character_owners_v412 (
character_id bigint not null,
owner_member_id bigint,
root_character_id bigint not null,
relation text not null,
verification_source text not null,
legion_name_snapshot text,
verified_by_member_id bigint,
verified_at timestamp with time zone not null default clock_timestamp(),
updated_at timestamp with time zone not null default clock_timestamp()
);
create table private.sanctuary_character_registration_events_v480 (
registration_id uuid not null default gen_random_uuid(),
actor_member_id bigint not null,
team_id bigint,
request_key text not null,
target_candidate_id uuid not null,
main_candidate_id uuid,
target_character_id bigint,
main_character_id bigint,
family_relation text not null,
membership_relation text not null,
list_sync_requested boolean not null default true,
list_sync_status text not null default 'NOT_REQUESTED'::text,
list_queue_session_id text,
list_queue_count integer not null default 0,
list_sync_attempts integer not null default 0,
list_sync_code text,
list_sync_message text,
list_sync_detail jsonb not null default '{}'::jsonb,
request_payload jsonb not null,
result jsonb not null default '{}'::jsonb,
created_at timestamp with time zone not null default clock_timestamp(),
updated_at timestamp with time zone not null default clock_timestamp(),
list_synced_at timestamp with time zone
);
create table private.sanctuary_management_official_candidates_v432 (
candidate_id uuid not null default gen_random_uuid(),
actor_member_id bigint not null,
team_id bigint,
requested_character_name text not null,
character_name text not null,
server_id integer not null,
server_name text not null,
race_id integer not null,
class_name text not null,
legion_name text,
char_key text not null,
official_character_id text not null,
profile_image_url text,
detail_url text not null,
official_payload jsonb not null,
state text not null default 'VERIFIED'::text,
materialized_character_id bigint,
expires_at timestamp with time zone not null default (clock_timestamp() + '00:10:00'::interval),
materialized_at timestamp with time zone,
created_at timestamp with time zone not null default clock_timestamp(),
updated_at timestamp with time zone not null default clock_timestamp()
);
create table public.character_master (
id bigint not null default nextval('character_master_id_seq'::regclass),
server_id integer not null default 2002,
server_name text,
character_name text not null,
char_key text,
profile_image_url text,
detail_url text,
image_updated_at timestamp with time zone,
status text default 'OK'::text,
error_message text,
main_character_name text,
is_main boolean not null default false,
class_name text,
list_row integer,
first_seen_at timestamp with time zone,
last_seen_at timestamp with time zone,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
latest_pve_item_level integer,
latest_pve_combat_power integer,
latest_pvp_item_level integer,
latest_pvp_combat_power integer,
latest_item_level_total integer,
latest_power_total integer,
latest_session_id text,
latest_payload_id bigint,
latest_snapshot_uid text,
latest_payload_hash text,
last_synced_at timestamp with time zone,
sync_status text default 'idle'::text,
bootstrap_source text,
bootstrap_imported_at timestamp with time zone,
is_active boolean not null default true,
inactive_reason text,
inactive_memo text,
inactivated_at timestamp with time zone,
restored_at timestamp with time zone,
previous_name text,
renamed_to text,
status_updated_at timestamp with time zone,
lookup_excluded boolean not null default false,
visibility_excluded boolean not null default false,
exclusion_reason text,
exclusion_memo text,
lookup_excluded_at timestamp with time zone,
visibility_excluded_at timestamp with time zone,
lookup_failure_streak integer not null default 0,
lookup_failure_total integer not null default 0,
last_lookup_failure_code text,
last_lookup_failure_session_id text,
last_lookup_failed_at timestamp with time zone,
last_lookup_success_at timestamp with time zone,
latest_pve_payload_id bigint,
latest_pvp_payload_id bigint,
main_character_id bigint,
previous_character_name text,
previous_server_id integer,
previous_server_name text,
previous_char_key text,
previous_profile_url text,
identity_change_type text,
identity_status text not null default 'CURRENT'::text,
identity_changed_at timestamp with time zone,
identity_verified_at timestamp with time zone,
legion_name text,
legion_updated_at timestamp with time zone,
legion_source_snapshot_id bigint,
lookup_policy text not null default 'INHERIT'::text,
lookup_group_policy text not null default 'AUTO'::text,
lookup_policy_reason text,
lookup_policy_actor_id bigint,
lookup_policy_updated_at timestamp with time zone,
relation_review_attempted_at timestamp with time zone,
relation_review_session_id text,
activity_inactive_at timestamp with time zone,
activity_inactive_previous jsonb
);
create table public.google_list_sheet_sync_queue (
id bigint not null default nextval('google_list_sheet_sync_queue_id_seq'::regclass),
session_id text not null,
character_id bigint,
list_row integer,
character_name text not null,
server_id integer,
server_name text,
pve_item_level numeric,
pvp_item_level numeric,
pve_combat_power numeric,
pvp_combat_power numeric,
latest_power_total numeric,
latest_item_level_total numeric,
sync_status text not null default 'queued'::text,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
synced_at timestamp with time zone,
error_message text,
list_original_name text,
class_name text,
clear_pve_stats boolean not null default false,
clear_pvp_stats boolean not null default false,
identity_changed boolean not null default false,
previous_character_name text,
previous_server_id integer,
list_display_name text,
main_character_renamed boolean not null default false,
main_character_name text,
append_if_missing boolean not null default false,
list_status text
);

alter table character_master add primary key(id);
alter table private.sanctuary_character_owners_v412 add primary key(character_id);
alter table private.sanctuary_management_official_candidates_v432 add primary key(candidate_id);
alter table private.sanctuary_character_registration_events_v480 add primary key(registration_id);
alter table private.sanctuary_character_registration_events_v480 add unique(actor_member_id,request_key);
alter table google_list_sheet_sync_queue add unique(session_id,character_name,server_id);
create table member_codes(id bigint primary key, main_character_name text, is_active boolean);
create table private.sanctuary_management_teams_v412(team_id bigint primary key);
insert into private.sanctuary_management_teams_v412 values(1);
create table private.sanctuary_operational_legions_v432(legion_name text,is_active boolean);
insert into private.sanctuary_operational_legions_v432 values('synthetic-legion',true);
create table private.roster_family_overrides_v477(character_id bigint primary key,main_character_id bigint,updated_at timestamptz);
create table private.sanctuary_management_slots_v412(character_id bigint,owner_member_id bigint,owner_root_character_id bigint,character_relation text,revision int,updated_at timestamptz);
create function private.kinojo_sm_require_roster_scope(text,bigint,boolean) returns void language plpgsql as $$begin if $1<>'synthetic-authorized' then raise exception 'FIXTURE_DENIED'; end if; end$$;
create function private.kinojo_sm_assert_pilot_write_v439(text,text) returns void language sql as $$select$$;
create function private.kinojo_sm_assert_write_enabled_v412() returns void language sql as $$select$$;
create function private.kinojo_sm_actor_v412(text) returns jsonb language sql as $$select '{"memberId":1}'::jsonb$$;
create function private.kinojo_sm_can_manage_team_v412(jsonb,bigint) returns boolean language sql as $$select $2=1$$;
create function public.kinojo_character_identity_key_v298(text) returns text language sql immutable as $$select lower($1)$$;
create function public.kinojo_normalize_legion_name(text) returns text language sql immutable as $$select lower($1)$$;
create function private.kinojo_sm_resolve_character_owner_v412(bigint) returns table(owner_member_id bigint,relation text) language sql as $$select o.owner_member_id,o.relation from private.sanctuary_character_owners_v412 o where o.character_id=$1$$;
create function public.kinojo_list_display_name_v287(text,integer) returns text language sql as $$select $1$$;
create function private.kinojo_sm_character_card_v480(bigint) returns jsonb language sql as $$select jsonb_build_object('characterId',id,'characterName',character_name,'power',latest_pve_combat_power,'itemLevel',latest_pve_item_level) from public.character_master where id=$1$$;
create function private.kinojo_sm_audit_v412(bigint,bigint,text,bigint,text,jsonb,jsonb,text) returns void language plpgsql as $$begin if current_setting('test.fail_audit',true)='yes' then raise exception 'FIXTURE_LATE_FAILURE';end if;end$$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_materialize_candidate_v480(p_candidate_id uuid, p_actor_member_id bigint, p_family_relation text, p_main_character_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform private.kinojo_sm_require_roster_scope(p_credential,p_team_id,false);
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

