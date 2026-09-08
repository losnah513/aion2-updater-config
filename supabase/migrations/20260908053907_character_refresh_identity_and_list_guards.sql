-- Stage 2 draft: local validation only. Deployment gate remains Stage 3.
-- New helpers are service-role-only; existing updater/admin authentication is preserved.
create table if not exists private.character_identity_scan_checkpoints (
  character_id bigint primary key references public.character_master(id),
  char_key text not null, servers jsonb not null, class_name text not null,
  completed jsonb not null default '[]', matches jsonb not null default '[]',
  expires_at timestamptz not null
);
alter table private.character_identity_scan_checkpoints enable row level security;
revoke all on private.character_identity_scan_checkpoints from public, anon, authenticated;
grant select, insert, update on private.character_identity_scan_checkpoints to service_role;

create or replace function public.kinojo_identity_scan_checkpoint_v1(
  p_character_id bigint, p_char_key text, p_servers jsonb,
  p_completed jsonb default null, p_matches jsonb default null
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, private, pg_temp
set lock_timeout = '1s'
as $fn$
declare
  c public.character_master%rowtype;
  s private.character_identity_scan_checkpoints%rowtype;
  all_servers jsonb;
begin
  select * into c from public.character_master where id=p_character_id;
  if not found or nullif(c.char_key,'') is distinct from p_char_key then
    return jsonb_build_object('ok',false,'code','STALE_IDENTITY');
  end if;
  select jsonb_agg(jsonb_build_object('serverId',sm.server_id,'serverName',sm.server_name,
    'serverShortName',sm.server_short_name,'raceId',sm.race_id) order by sm.server_id)
    into all_servers from public.server_master sm
    where coalesce(sm.is_active,true)
      and sm.race_id=(select race_id from public.server_master where server_id=c.server_id);
  if all_servers is distinct from p_servers then
    return jsonb_build_object('ok',false,'code','STALE_SERVER_CATALOG');
  end if;
  insert into private.character_identity_scan_checkpoints(character_id,char_key,servers,class_name,expires_at)
    values(c.id,p_char_key,all_servers,coalesce(c.class_name,''),clock_timestamp()+interval '5 minutes')
    on conflict(character_id) do nothing;
  select * into s from private.character_identity_scan_checkpoints where character_id=c.id for update;
  if s.expires_at<clock_timestamp() or s.char_key<>p_char_key or s.servers<>all_servers
     or s.class_name<>coalesce(c.class_name,'') then
    update private.character_identity_scan_checkpoints set char_key=p_char_key,servers=all_servers,
      class_name=coalesce(c.class_name,''),completed='[]',matches='[]',expires_at=clock_timestamp()+interval '5 minutes'
      where character_id=c.id returning * into s;
    if p_completed is not null then
      return jsonb_build_object('ok',false,'code','SCAN_EXPIRED_RESTART_REQUIRED');
    end if;
  end if;
  if p_completed is not null then
    if jsonb_typeof(p_completed)<>'array' or jsonb_typeof(p_matches) is distinct from 'array'
       or exists(select 1 from jsonb_array_elements(p_completed) x
          where not exists(select 1 from jsonb_array_elements(all_servers) y where y->'serverId'=x))
       or exists(select 1 from jsonb_array_elements(p_matches) x
          where x->>'charKey' is distinct from p_char_key
             or not exists(select 1 from jsonb_array_elements(all_servers) y where y->'serverId'=x->'serverId'))
    then return jsonb_build_object('ok',false,'code','INVALID_SCAN_CHECKPOINT'); end if;
    update private.character_identity_scan_checkpoints set
      completed=(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(s.completed||p_completed) x),
      matches=(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(s.matches||p_matches) x)
      where character_id=c.id returning * into s;
  end if;
  return jsonb_build_object('ok',true,'completed',s.completed,'matches',s.matches);
end;
$fn$;
revoke all on function public.kinojo_identity_scan_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinojo_identity_scan_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb) to service_role;

create or replace function public.kinojo_identity_rate_gate_v1(
  p_http_status integer default null, p_retry_after_seconds integer default null
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp set lock_timeout = '1s'
as $fn$
declare
 s public.official_lookup_rate_state%rowtype;
 t timestamptz; reserved timestamptz; wait_ms integer;
begin
 insert into public.official_lookup_rate_state(provider) values('plaync') on conflict(provider) do nothing;
 select * into s from public.official_lookup_rate_state where provider='plaync' for update;
 t:=clock_timestamp();
 if p_http_status=429 then
   update public.official_lookup_rate_state set
     paused_until=greatest(coalesce(paused_until,t),t+make_interval(secs=>least(21600,greatest(30,coalesce(p_retry_after_seconds,30))))),
     consecutive_429=coalesce(consecutive_429,0)+1,last_http_status=429,last_source='IDENTITY_CHAR_KEY_SCAN',updated_at=now()
     where provider='plaync';
   return jsonb_build_object('ok',true,'allowed',false);
 end if;
 if s.paused_until>t then
   return jsonb_build_object('ok',true,'allowed',false,'waitMs',ceil(extract(epoch from(s.paused_until-t))*1000));
 end if;
 reserved:=greatest(coalesce(s.next_request_at,t),t);
 wait_ms:=greatest(0,ceil(extract(epoch from(reserved-t))*1000));
 -- Do not reserve far-future capacity for a caller that must yield.
 if wait_ms>2000 then return jsonb_build_object('ok',true,'allowed',false,'waitMs',wait_ms); end if;
 update public.official_lookup_rate_state set next_request_at=reserved+interval '700 milliseconds',
   last_source='IDENTITY_CHAR_KEY_SCAN',updated_at=now() where provider='plaync';
 return jsonb_build_object('ok',true,'allowed',true,'waitMs',wait_ms);
end;
$fn$;
revoke all on function public.kinojo_identity_rate_gate_v1(integer,integer) from public,anon,authenticated;
grant execute on function public.kinojo_identity_rate_gate_v1(integer,integer) to service_role;

CREATE OR REPLACE FUNCTION public.kinojo_identity_review_upsert_v287(p_character_id bigint, p_source_session_id text, p_candidate jsonb, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_review_id bigint;
  v_server_id integer := public.kinojo_meter_int_50010(coalesce(p_candidate->>'serverId', p_candidate->>'server_id'));
  v_name text := nullif(trim(coalesce(p_candidate->>'characterName', p_candidate->>'character_name', p_candidate->>'name')), '');
  v_char_key text := nullif(trim(coalesce(p_candidate->>'charKey', p_candidate->>'char_key')), '');
begin
  if not exists(select 1 from public.character_master where id = p_character_id) then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND');
  end if;
  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'CANDIDATE_IDENTITY_REQUIRED');
  end if;

  if not exists(
    select 1 from public.character_master cm
    join public.server_master old_s on old_s.server_id=cm.server_id
    join public.server_master new_s on new_s.server_id=v_server_id
    where cm.id=p_character_id and nullif(trim(cm.char_key),'')=v_char_key
      and public.kinojo_normalize_aion_class_name(cm.class_name)=public.kinojo_normalize_aion_class_name(p_candidate->>'className')
      and old_s.race_id=new_s.race_id and coalesce(new_s.is_active,true)
  ) then return jsonb_build_object('ok',false,'code','IDENTITY_EVIDENCE_MISMATCH'); end if;

  insert into public.character_identity_review_queue(
    character_id, source_session_id, candidate_server_id, candidate_server_name,
    candidate_character_name, candidate_char_key, candidate_detail_url,
    candidate_profile_image_url, candidate_class_name, evidence
  ) values (
    p_character_id, nullif(trim(p_source_session_id), ''), v_server_id,
    nullif(trim(coalesce(p_candidate->>'serverName', p_candidate->>'server_name')), ''),
    v_name, v_char_key,
    nullif(trim(coalesce(p_candidate->>'detailUrl', p_candidate->>'detail_url')), ''),
    nullif(trim(coalesce(p_candidate->>'profileImageUrl', p_candidate->>'profile_image_url')), ''),
    nullif(trim(coalesce(p_candidate->>'className', p_candidate->>'class_name')), ''),
    coalesce(p_evidence, '{}'::jsonb)
  )
  on conflict (
    character_id, candidate_server_id,
    public.kinojo_normalize_character_name(candidate_character_name),
    coalesce(candidate_char_key, '')
  ) where review_status = 'pending'
  do update set
    source_session_id = excluded.source_session_id,
    candidate_server_name = excluded.candidate_server_name,
    candidate_detail_url = excluded.candidate_detail_url,
    candidate_profile_image_url = excluded.candidate_profile_image_url,
    candidate_class_name = excluded.candidate_class_name,
    evidence = excluded.evidence,
    updated_at = now()
  returning review_id into v_review_id;

  update public.character_master
  set identity_status = 'REVIEW_REQUIRED', updated_at = now()
  where id = p_character_id;
  update public.character_identity_recovery_queue
  set queue_status = 'review_required', updated_at = now()
  where character_id = p_character_id
    and queue_status in ('pending', 'retry', 'processing', 'review_required');

  return jsonb_build_object('ok', true, 'reviewId', v_review_id, 'status', 'pending');
end
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_identity_review_decide_v287(p_pass_key text, p_review_id bigint, p_approve boolean, p_memo text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_review public.character_identity_review_queue%rowtype;
  v_character public.character_master%rowtype;
  v_server_name text;
  v_old_display text;
  v_new_display text;
  v_change_type text;
  v_session text;
begin
  select * into v_member from public.kinojo_admin_member_from_credential_v325(p_pass_key) limit 1;
  if not found or coalesce(v_member.level, 0) < 4 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ADMIN_ACCESS_DENIED');
  end if;

  select * into v_review from public.character_identity_review_queue
  where review_id = p_review_id and review_status = 'pending'
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'IDENTITY_REVIEW_NOT_FOUND'); end if;

  if not coalesce(p_approve, false) then
    update public.character_identity_review_queue
    set review_status = 'rejected', reviewed_by = v_member.id,
        review_memo = nullif(trim(p_memo), ''), reviewed_at = now(), updated_at = now()
    where review_id = p_review_id;
    update public.character_master set identity_status = 'CURRENT', updated_at = now()
    where id = v_review.character_id;
    return jsonb_build_object('ok', true, 'approved', false, 'reviewId', p_review_id);
  end if;

  -- Legacy approvals overwrite keys and bypass atomic transfer cleanup.
  -- Reject remains available above; any apply must re-probe through the verified Edge.
  return jsonb_build_object('ok',false,'code','IDENTITY_REPROBE_REQUIRED',
    'message','저장된 이름 후보를 승인할 수 없습니다. 고유키 재조회 후 적용하세요.');

  select * into v_character from public.character_master
  where id = v_review.character_id for update;
  select server_name into v_server_name from public.server_master
  where server_id = v_review.candidate_server_id and coalesce(is_active, true);
  if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER'); end if;
  if exists(
    select 1 from public.character_master cm
    where cm.id <> v_character.id
      and cm.server_id = v_review.candidate_server_id
      and public.kinojo_character_identity_key_v298(cm.character_name)
          = public.kinojo_character_identity_key_v298(v_review.candidate_character_name)
      and coalesce(cm.is_active, true)
  ) then return jsonb_build_object('ok', false, 'code', 'TARGET_IDENTITY_CONFLICT'); end if;

  v_old_display := public.kinojo_list_display_name_v287(v_character.character_name, v_character.server_id);
  v_new_display := public.kinojo_list_display_name_v287(v_review.candidate_character_name, v_review.candidate_server_id);
  v_change_type := case
    when v_character.server_id is distinct from v_review.candidate_server_id
     and public.kinojo_character_identity_key_v298(v_character.character_name)
         <> public.kinojo_character_identity_key_v298(v_review.candidate_character_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_character.server_id is distinct from v_review.candidate_server_id then 'SERVER_TRANSFER'
    else 'CHARACTER_RENAME'
  end;
  v_session := 'admin-identity:' || v_member.id::text || ':' || extract(epoch from clock_timestamp())::bigint::text;

  insert into public.character_identity_change_history(
    character_id, char_key, previous_char_key, current_char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, evidence, verified_at
  ) values (
    v_character.id, coalesce(v_review.candidate_char_key, v_character.char_key),
    v_character.char_key, coalesce(v_review.candidate_char_key, v_character.char_key),
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_review.candidate_server_id, v_server_name, v_review.candidate_character_name,
    v_change_type, 'ADMIN_COMPOSITE_EVIDENCE_APPROVAL', v_session,
    v_review.evidence || jsonb_build_object('reviewId', v_review.review_id, 'adminMemberId', v_member.id, 'memo', p_memo),
    now()
  );

  if coalesce(v_character.is_main, false)
     and public.kinojo_character_identity_key_v298(v_character.character_name)
         <> public.kinojo_character_identity_key_v298(v_review.candidate_character_name) then
    update public.member_codes
    set main_character_name = v_review.candidate_character_name, updated_at = now()
    where public.kinojo_character_identity_key_v298(main_character_name)
          = public.kinojo_character_identity_key_v298(v_character.character_name);
  end if;

  update public.character_master
  set server_id = v_review.candidate_server_id,
      server_name = v_server_name,
      character_name = v_review.candidate_character_name,
      char_key = coalesce(v_review.candidate_char_key, char_key),
      detail_url = coalesce(v_review.candidate_detail_url, detail_url),
      profile_image_url = coalesce(v_review.candidate_profile_image_url, profile_image_url),
      status = 'OK', error_message = null, is_active = true,
      inactive_reason = null, inactive_memo = null, inactivated_at = null,
      restored_at = now(), last_seen_at = now(), last_synced_at = now(), updated_at = now()
  where id = v_character.id;

  insert into public.google_list_sheet_sync_queue(
    session_id, character_id, list_row, list_original_name,
    character_name, server_id, server_name, class_name,
    pve_item_level, pvp_item_level, pve_combat_power, pvp_combat_power,
    latest_power_total, latest_item_level_total,
    identity_changed, previous_character_name, previous_server_id,
    list_display_name, main_character_renamed, sync_status
  ) values (
    v_session, v_character.id, v_character.list_row, v_old_display,
    v_review.candidate_character_name, v_review.candidate_server_id, v_server_name, v_character.class_name,
    v_character.latest_pve_item_level, v_character.latest_pvp_item_level,
    v_character.latest_pve_combat_power, v_character.latest_pvp_combat_power,
    v_character.latest_power_total, v_character.latest_item_level_total,
    true, v_old_display, v_character.server_id, v_new_display,
    coalesce(v_character.is_main, false) and v_old_display <> v_new_display, 'queued'
  );

  update public.character_identity_review_queue
  set review_status = 'approved', reviewed_by = v_member.id,
      review_memo = nullif(trim(p_memo), ''), reviewed_at = now(), updated_at = now()
  where review_id = p_review_id;
  update public.character_identity_recovery_queue
  set queue_status = 'done', completed_at = now(), updated_at = now()
  where character_id = v_character.id
    and queue_status in ('pending', 'retry', 'processing', 'review_required');

  return jsonb_build_object(
    'ok', true, 'approved', true, 'reviewId', p_review_id,
    'changeType', v_change_type, 'characterId', v_character.id,
    'previous', jsonb_build_object(
      'characterName', v_character.character_name, 'serverId', v_character.server_id,
      'serverName', v_character.server_name, 'listDisplayName', v_old_display
    ),
    'current', jsonb_build_object(
      'characterName', v_review.candidate_character_name, 'serverId', v_review.candidate_server_id,
      'serverName', v_server_name, 'listDisplayName', v_new_display,
      'detailUrl', v_review.candidate_detail_url, 'profileImageUrl', v_review.candidate_profile_image_url
    ),
    'listUpdate', jsonb_build_object(
      'id', v_character.id, 'listRow', v_character.list_row,
      'originalListName', v_old_display, 'previousCharacterName', v_old_display,
      'listDisplayName', v_new_display, 'characterName', v_review.candidate_character_name,
      'serverId', v_review.candidate_server_id, 'serverName', v_server_name,
      'className', v_character.class_name,
      'pveItemLevel', v_character.latest_pve_item_level, 'pveCombatPower', v_character.latest_pve_combat_power,
      'pvpItemLevel', v_character.latest_pvp_item_level, 'pvpCombatPower', v_character.latest_pvp_combat_power,
      'latestPowerTotal', v_character.latest_power_total, 'latestItemLevelTotal', v_character.latest_item_level_total,
      'identityChanged', true,
      'mainCharacterRenamed', coalesce(v_character.is_main, false) and v_old_display <> v_new_display
    )
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_character_identity_recovery_apply_v1(p_session_id text, p_session_token text, p_target_id bigint, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_auth jsonb;
  v_target public.lookup_session_targets%rowtype;
  v_character public.character_master%rowtype;
  v_candidate jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_char_key text := nullif(trim(coalesce(v_candidate->>'charKey', v_candidate->>'char_key', '')), '');
  v_server_id integer := public.kinojo_meter_int_50010(coalesce(v_candidate->>'serverId', v_candidate->>'server_id'));
  v_server_name text := nullif(trim(coalesce(v_candidate->>'serverName', v_candidate->>'server_name', '')), '');
  v_name text := nullif(trim(coalesce(v_candidate->>'characterName', v_candidate->>'character_name', v_candidate->>'name', '')), '');
  v_detail_url text := nullif(trim(coalesce(v_candidate->>'detailUrl', v_candidate->>'detail_url', '')), '');
  v_profile_image text := nullif(trim(coalesce(v_candidate->>'profileImageUrl', v_candidate->>'profile_image_url', '')), '');
  v_change_type text;
  v_conflict_id bigint;
  v_server_short_name text;
  v_list_display_name text;
  v_main_renamed boolean := false;
  v_server_transferred boolean := false;
  v_previous_race_id integer;
  v_candidate_race_id integer;
  v_previous_legion_name text;
  v_assignment_legion_name text;
  v_assignment_removed_count integer := 0;
  v_legion_tree_revisions jsonb := '{}'::jsonb;
  v_evidence jsonb;
begin
  v_auth := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is false then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_auth->>'code', 'INVALID_SESSION'),
      'message', coalesce(v_auth->>'message', '유효한 조회 세션이 아닙니다.')
    );
  end if;

  select *
    into v_target
    from public.lookup_session_targets
   where id = p_target_id
     and session_id = p_session_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND', 'message', '복구할 조회 Target을 찾지 못했습니다.');
  end if;

  select *
    into v_character
    from public.character_master cm
   where cm.server_id = v_target.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)
       = public.kinojo_character_identity_key_v298(v_target.character_name)
   order by cm.updated_at desc nulls last
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'LEGION_CHARACTER_NOT_FOUND', 'message', '기존 레기온 character_master 행을 찾지 못했습니다.');
  end if;

  if v_char_key is null
     or nullif(trim(v_character.char_key), '') is null
     or v_char_key <> trim(v_character.char_key) then
    insert into public.character_identity_recovery_attempts(
      session_id, target_id, character_id, char_key,
      previous_server_id, previous_character_name,
      candidate_server_id, candidate_character_name,
      recovery_status, message, evidence
    ) values (
      p_session_id, p_target_id, v_character.id, v_char_key,
      v_character.server_id, v_character.character_name,
      v_server_id, v_name,
      'CHAR_KEY_MISMATCH', '후보 캐릭터의 고유값이 기존 character_master와 일치하지 않습니다.',
      v_candidate || jsonb_build_object('serverTransferApplied', false, 'legionMutationApplied', false)
    );
    return jsonb_build_object('ok', false, 'code', 'CHAR_KEY_MISMATCH', 'message', '동일 캐릭터임을 확인할 수 없어 기존 값을 유지합니다.');
  end if;

  if public.kinojo_normalize_aion_class_name(v_character.class_name) is null
     or public.kinojo_normalize_aion_class_name(v_character.class_name)
       is distinct from public.kinojo_normalize_aion_class_name(v_candidate->>'className') then
    return jsonb_build_object('ok',false,'code','CLASS_MISMATCH');
  end if;

  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_IDENTITY_REQUIRED', 'message', '복구 후보의 현재 서버와 캐릭터명이 필요합니다.');
  end if;

  select sm.server_name, sm.server_short_name, sm.race_id
    into v_server_name, v_server_short_name, v_candidate_race_id
    from public.server_master sm
   where sm.server_id = v_server_id
     and coalesce(sm.is_active, true) is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER', 'message', 'Server Master에 없는 서버입니다.');
  end if;

  select sm.race_id
    into v_previous_race_id
    from public.server_master sm
   where sm.server_id = v_character.server_id;
  if v_previous_race_id is null
     or v_candidate_race_id is null
     or v_previous_race_id is distinct from v_candidate_race_id then
    insert into public.character_identity_recovery_attempts(
      session_id, target_id, character_id, char_key,
      previous_server_id, previous_character_name,
      candidate_server_id, candidate_character_name,
      recovery_status, message, evidence
    ) values (
      p_session_id, p_target_id, v_character.id, v_char_key,
      v_character.server_id, v_character.character_name,
      v_server_id, v_name,
      'SERVER_RACE_MISMATCH', '기존 서버와 후보 서버의 종족이 달라 자동 이전을 적용하지 않습니다.',
      v_candidate || jsonb_build_object(
        'previousRaceId', v_previous_race_id,
        'candidateRaceId', v_candidate_race_id,
        'serverTransferApplied', false,
        'legionMutationApplied', false
      )
    );
    return jsonb_build_object(
      'ok', false,
      'code', 'SERVER_RACE_MISMATCH',
      'message', '기존 서버와 후보 서버의 종족이 달라 동일 캐릭터 서버 이전으로 확정할 수 없습니다.'
    );
  end if;

  v_list_display_name := case
    when v_server_id = 2002 then v_name
    else v_name || '[' || coalesce(v_server_short_name, v_server_name, v_server_id::text) || ']'
  end;

  select cm.id
    into v_conflict_id
    from public.character_master cm
   where cm.id <> v_character.id
     and cm.server_id = v_server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)
       = public.kinojo_character_identity_key_v298(v_name)
     and coalesce(cm.is_active, true) is true
   limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'TARGET_IDENTITY_CONFLICT',
      'message', '변경될 서버/캐릭터명에 이미 다른 character_master 행이 존재합니다. 자동 변경하지 않습니다.',
      'conflictCharacterId', v_conflict_id
    );
  end if;

  v_server_transferred := v_character.server_id is distinct from v_server_id;
  v_previous_legion_name := nullif(btrim(v_character.legion_name), '');
  v_change_type := case
    when v_server_transferred
     and public.kinojo_character_identity_key_v298(v_character.character_name)
       <> public.kinojo_character_identity_key_v298(v_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_server_transferred then 'SERVER_TRANSFER'
    when public.kinojo_character_identity_key_v298(v_character.character_name)
       <> public.kinojo_character_identity_key_v298(v_name)
      then 'CHARACTER_RENAME'
    else 'RESTORED_BY_CHAR_KEY'
  end;

  v_main_renamed := coalesce(v_character.is_main, false) is true
    and public.kinojo_character_identity_key_v298(v_character.character_name)
      <> public.kinojo_character_identity_key_v298(v_name);

  if v_server_transferred then
    select a.legion_name
      into v_assignment_legion_name
      from private.legion_tree_assignments a
     where a.character_id = v_character.id
     for update;

    perform 1
      from private.legion_tree_configs c
     where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
     order by c.legion_name
     for update;

    delete from private.legion_tree_assignments a
     where a.character_id = v_character.id;
    get diagnostics v_assignment_removed_count = row_count;

    with updated as (
      update private.legion_tree_configs c
         set revision = c.revision + 1,
             updated_at = now(),
             updated_by = 'SYSTEM_CHARACTER_SERVER_TRANSFER_V461'
       where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
       returning c.legion_name, c.revision
    )
    select coalesce(jsonb_object_agg(updated.legion_name, updated.revision), '{}'::jsonb)
      into v_legion_tree_revisions
      from updated;
  end if;

  v_evidence := v_candidate || jsonb_build_object(
    'serverTransferApplied', v_server_transferred,
    'previousLegionName', v_previous_legion_name,
    'legionCleared', v_server_transferred,
    'organizationAssignmentRemoved', v_assignment_removed_count > 0,
    'organizationAssignmentRemovedCount', v_assignment_removed_count,
    'legionTreeRevisions', v_legion_tree_revisions,
    'databaseContract', '461'
  );

  insert into public.character_identity_change_history(
    character_id, char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, target_id, evidence
  ) values (
    v_character.id, v_char_key,
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_server_id, v_server_name, v_name,
    v_change_type, 'CHAR_KEY_RECOVERY', p_session_id, p_target_id, v_evidence
  );

  if v_main_renamed then
    update public.character_master set main_character_name=v_name,updated_at=now()
      where id=v_character.id or main_character_id=v_character.id;
    -- Legacy member linkage is name-only. Refuse cross-server namesake propagation.
    update public.member_codes set main_character_name=v_name,updated_at=now()
      where public.kinojo_character_identity_key_v298(main_character_name)
        =public.kinojo_character_identity_key_v298(v_character.character_name)
        and (select count(*) from public.character_master
          where public.kinojo_character_identity_key_v298(character_name)
            =public.kinojo_character_identity_key_v298(v_character.character_name))=1;
  end if;

  update public.character_master
     set previous_name = case
           when public.kinojo_character_identity_key_v298(character_name)
             <> public.kinojo_character_identity_key_v298(v_name)
             then character_name
           else previous_name
         end,
         renamed_to = case
           when public.kinojo_character_identity_key_v298(character_name)
             <> public.kinojo_character_identity_key_v298(v_name)
             then v_name
           else renamed_to
         end,
         server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         detail_url = coalesce(v_detail_url, detail_url),
         profile_image_url = coalesce(v_profile_image, profile_image_url),
         legion_name = case when v_server_transferred then null else legion_name end,
         legion_updated_at = case when v_server_transferred then now() else legion_updated_at end,
         legion_source_snapshot_id = case when v_server_transferred then null else legion_source_snapshot_id end,
         status = 'OK',
         status_updated_at = now(),
         updated_at = now()
   where id = v_character.id;

  update public.lookup_session_targets
     set server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         corrected = true,
         target_status = 'claimed',
         last_error = null,
         last_failure_code = null,
         last_failure_retryable = null,
         final_failed_at = null,
         updated_at = now()
   where id = p_target_id;

  insert into public.google_list_sheet_sync_queue(
    session_id, character_id, list_row, list_original_name,
    character_name, server_id, server_name, class_name,
    pve_item_level, pvp_item_level, pve_combat_power, pvp_combat_power,
    latest_power_total, latest_item_level_total,
    identity_changed, previous_character_name, previous_server_id, list_display_name, main_character_renamed,
    sync_status, created_at, updated_at
  ) values (
    p_session_id, v_character.id, v_target.list_row, coalesce(v_target.list_original_name, v_target.character_name),
    v_name, v_server_id, v_server_name, v_character.class_name,
    v_character.latest_pve_item_level, v_character.latest_pvp_item_level,
    v_character.latest_pve_combat_power, v_character.latest_pvp_combat_power,
    v_character.latest_power_total, v_character.latest_item_level_total,
    true, v_character.character_name, v_character.server_id, v_list_display_name, v_main_renamed,
    'queued', now(), now()
  );

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    p_session_id, p_target_id, v_character.id, v_char_key,
    v_character.server_id, v_character.character_name,
    v_server_id, v_name,
    'APPLIED', v_change_type, v_evidence
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'changeType', v_change_type,
    'characterId', v_character.id,
    'charKey', v_char_key,
    'serverTransferred', v_server_transferred,
    'legionCleared', v_server_transferred,
    'previousLegionName', v_previous_legion_name,
    'organizationAssignmentRemoved', v_assignment_removed_count > 0,
    'legionTreeRevisions', v_legion_tree_revisions,
    'databaseContract', '461',
    'previous', jsonb_build_object(
      'serverId', v_character.server_id,
      'serverName', v_character.server_name,
      'characterName', v_character.character_name,
      'legionName', v_previous_legion_name
    ),
    'current', jsonb_build_object(
      'serverId', v_server_id,
      'serverName', v_server_name,
      'characterName', v_name,
      'detailUrl', v_detail_url,
      'profileImageUrl', v_profile_image,
      'legionName', case when v_server_transferred then null else v_character.legion_name end
    ),
    'listSyncQueued', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_character_identity_apply_v1(p_pass_key text, p_character_id bigint, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_character public.character_master%rowtype;
  v_candidate jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_char_key text := nullif(trim(coalesce(v_candidate->>'charKey', v_candidate->>'char_key', '')), '');
  v_server_id integer := public.kinojo_meter_int_50010(coalesce(v_candidate->>'serverId', v_candidate->>'server_id'));
  v_server_name text;
  v_server_short_name text;
  v_name text := nullif(trim(coalesce(v_candidate->>'characterName', v_candidate->>'character_name', v_candidate->>'name', '')), '');
  v_detail_url text := nullif(trim(coalesce(v_candidate->>'detailUrl', v_candidate->>'detail_url', '')), '');
  v_profile_image text := nullif(trim(coalesce(v_candidate->>'profileImageUrl', v_candidate->>'profile_image_url', '')), '');
  v_change_type text;
  v_conflict_id bigint;
  v_old_display_name text;
  v_new_display_name text;
  v_main_renamed boolean := false;
  v_server_transferred boolean := false;
  v_previous_legion_name text;
  v_assignment_legion_name text;
  v_assignment_removed_count integer := 0;
  v_legion_tree_revisions jsonb := '{}';
begin
  select * into v_member from public.kinojo_admin_member_from_credential_v325(p_pass_key) limit 1;
  if not found or coalesce(v_member.level, 0) < 4 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ADMIN_ACCESS_DENIED', 'message', '서버 이전 반영은 MASTER·SUB_MASTER만 사용할 수 있습니다.');
  end if;

  select * into v_character
  from public.character_master
  where id = p_character_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND', 'message', '대상 캐릭터를 찾지 못했습니다.');
  end if;

  if v_char_key is null or nullif(trim(coalesce(v_character.char_key, '')), '') is null or v_char_key <> trim(v_character.char_key) then
    return jsonb_build_object('ok', false, 'code', 'CHAR_KEY_MISMATCH', 'message', '공식 후보의 고유값이 기존 character_master와 일치하지 않습니다.');
  end if;
  if public.kinojo_normalize_aion_class_name(v_character.class_name) is null
     or public.kinojo_normalize_aion_class_name(v_character.class_name)
       is distinct from public.kinojo_normalize_aion_class_name(v_candidate->>'className') then
    return jsonb_build_object('ok',false,'code','CLASS_MISMATCH');
  end if;

  if v_server_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'code', 'RECOVERY_IDENTITY_REQUIRED', 'message', '현재 서버와 캐릭터명이 필요합니다.');
  end if;

  select server_name, server_short_name
    into v_server_name, v_server_short_name
  from public.server_master
  where server_id = v_server_id and coalesce(is_active, true) is true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SERVER', 'message', 'Server Master에 없는 서버입니다.');
  end if;

  if not exists(select 1 from public.server_master a join public.server_master b on a.race_id=b.race_id
    where a.server_id=v_character.server_id and b.server_id=v_server_id and coalesce(b.is_active,true)) then
    return jsonb_build_object('ok',false,'code','SERVER_RACE_MISMATCH');
  end if;

  select id into v_conflict_id
  from public.character_master cm
  where cm.id <> v_character.id
    and cm.server_id = v_server_id
    and public.kinojo_normalize_character_name(cm.character_name) = public.kinojo_normalize_character_name(v_name)
    and coalesce(cm.is_active, true) is true
  limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object('ok', false, 'code', 'TARGET_IDENTITY_CONFLICT', 'message', '변경될 서버/캐릭터명에 이미 다른 활성 캐릭터가 존재합니다.', 'conflictCharacterId', v_conflict_id);
  end if;

  v_old_display_name := case
    when v_character.server_id = 2002 then v_character.character_name
    else v_character.character_name || '[' || coalesce((select server_short_name from public.server_master where server_id = v_character.server_id), v_character.server_name, v_character.server_id::text) || ']'
  end;
  v_new_display_name := case
    when v_server_id = 2002 then v_name
    else v_name || '[' || coalesce(v_server_short_name, v_server_name, v_server_id::text) || ']'
  end;

  v_change_type := case
    when v_character.server_id is distinct from v_server_id
     and public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name)
      then 'SERVER_TRANSFER_AND_RENAME'
    when v_character.server_id is distinct from v_server_id then 'SERVER_TRANSFER'
    when public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name) then 'CHARACTER_RENAME'
    else 'IDENTITY_REFRESH'
  end;

  v_main_renamed := coalesce(v_character.is_main, false) is true
    and public.kinojo_normalize_character_name(v_character.character_name) <> public.kinojo_normalize_character_name(v_name);

  v_server_transferred := v_character.server_id is distinct from v_server_id;
  v_previous_legion_name := nullif(btrim(v_character.legion_name),'');
  if v_server_transferred then
    select a.legion_name
      into v_assignment_legion_name
      from private.legion_tree_assignments a
     where a.character_id = v_character.id
     for update;

    perform 1
      from private.legion_tree_configs c
     where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
     order by c.legion_name
     for update;

    delete from private.legion_tree_assignments a
     where a.character_id = v_character.id;
    get diagnostics v_assignment_removed_count = row_count;

    with updated as (
      update private.legion_tree_configs c
         set revision = c.revision + 1,
             updated_at = now(),
             updated_by = 'SYSTEM_CHARACTER_SERVER_TRANSFER_V461'
       where c.legion_name = any(array_remove(array[v_previous_legion_name, v_assignment_legion_name], null))
       returning c.legion_name, c.revision
    )
    select coalesce(jsonb_object_agg(updated.legion_name, updated.revision), '{}'::jsonb)
      into v_legion_tree_revisions
      from updated;
  end if;


  insert into public.character_identity_change_history(
    character_id, char_key,
    previous_server_id, previous_server_name, previous_character_name,
    current_server_id, current_server_name, current_character_name,
    change_type, source, session_id, target_id, evidence
  ) values (
    v_character.id, v_char_key,
    v_character.server_id, v_character.server_name, v_character.character_name,
    v_server_id, v_server_name, v_name,
    v_change_type, 'ADMIN_SERVER_IDENTITY_RECOVERY', 'admin:' || v_member.id::text, null,
    v_candidate || jsonb_build_object('adminMemberId', v_member.id, 'adminMainCharacterName', v_member.main_character_name)
  );

  if v_main_renamed then
    update public.character_master set main_character_name=v_name,updated_at=now()
      where id=v_character.id or main_character_id=v_character.id;
    -- Legacy member linkage is name-only. Refuse cross-server namesake propagation.
    update public.member_codes set main_character_name=v_name,updated_at=now()
      where public.kinojo_character_identity_key_v298(main_character_name)
        =public.kinojo_character_identity_key_v298(v_character.character_name)
        and (select count(*) from public.character_master
          where public.kinojo_character_identity_key_v298(character_name)
            =public.kinojo_character_identity_key_v298(v_character.character_name))=1;
  end if;

  update public.character_master
     set previous_name = case
           when public.kinojo_normalize_character_name(character_name) <> public.kinojo_normalize_character_name(v_name)
             then character_name else previous_name end,
         renamed_to = case
           when public.kinojo_normalize_character_name(character_name) <> public.kinojo_normalize_character_name(v_name)
             then v_name else renamed_to end,
         server_id = v_server_id,
         server_name = v_server_name,
         character_name = v_name,
         detail_url = coalesce(v_detail_url, detail_url),
         profile_image_url = coalesce(v_profile_image, profile_image_url),
         legion_name = case when v_server_transferred then null else legion_name end,
         legion_updated_at = case when v_server_transferred then now() else legion_updated_at end,
         legion_source_snapshot_id = case when v_server_transferred then null else legion_source_snapshot_id end,
         status = 'OK',
         error_message = null,
         status_updated_at = now(),
         last_seen_at = now(),
         updated_at = now()
   where id = v_character.id;

  insert into public.character_identity_recovery_attempts(
    session_id, target_id, character_id, char_key,
    previous_server_id, previous_character_name,
    candidate_server_id, candidate_character_name,
    recovery_status, message, evidence
  ) values (
    'admin:' || v_member.id::text || ':' || extract(epoch from clock_timestamp())::bigint::text,
    null, v_character.id, v_char_key,
    v_character.server_id, v_character.character_name,
    v_server_id, v_name,
    'APPLIED', v_change_type,
    v_candidate || jsonb_build_object('surface', 'ADMIN_WEB')
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'serverTransferred',v_server_transferred,'legionCleared',v_server_transferred,
    'organizationAssignmentRemovedCount',v_assignment_removed_count,
    'changeType', v_change_type,
    'characterId', v_character.id,
    'previous', jsonb_build_object('serverId', v_character.server_id, 'serverName', v_character.server_name, 'characterName', v_character.character_name, 'listDisplayName', v_old_display_name),
    'current', jsonb_build_object('serverId', v_server_id, 'serverName', v_server_name, 'characterName', v_name, 'detailUrl', v_detail_url, 'profileImageUrl', v_profile_image, 'listDisplayName', v_new_display_name),
    'listUpdate', jsonb_build_object(
      'id', v_character.id,
      'listRow', v_character.list_row,
      'originalListName', v_old_display_name,
      'listDisplayName', v_new_display_name,
      'characterName', v_name,
      'serverId', v_server_id,
      'serverName', v_server_name,
      'className', v_character.class_name,
      'pveItemLevel', v_character.latest_pve_item_level,
      'pveCombatPower', v_character.latest_pve_combat_power,
      'pvpItemLevel', v_character.latest_pvp_item_level,
      'pvpCombatPower', v_character.latest_pvp_combat_power,
      'latestPowerTotal', v_character.latest_power_total,
      'latestItemLevelTotal', v_character.latest_item_level_total,
      'identityChanged', v_change_type <> 'IDENTITY_REFRESH'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_prepare_lookup_queue_from_list_v296(p_session_id text, p_session_token text, p_list jsonb, p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_compare_total int := 0;
  v_total int := 0;
  v_new int := 0;
  v_existing int := 0;
  v_corrected int := 0;
  v_excluded int := 0;
  v_absent int := 0;
  v_master_only_count int := 0;
  v_queue jsonb := '[]'::jsonb;
  v_item jsonb;
  v_row_no int;
  v_raw_name text;
  v_raw_class text;
  v_raw_main text;
  v_main_name text;
  v_is_main boolean;
  v_class_name text;
  v_name text;
  v_server_id int;
  v_server_name text;
  v_exists boolean;
  v_before_list_row int;
  v_filter jsonb;
  v_filter_classes jsonb;
  v_filter_gear_types jsonb;
  v_filter_races jsonb;
  v_filter_servers jsonb;
  v_filter_character text;
  v_lookup_mode text := 'all';
  v_filter_applied boolean := false;
  v_filter_summary text := '전체 조회';
  v_selected_new int := 0;
  v_selected_existing int := 0;
  v_gear_filter_ignored boolean := false;
  v_admin_reason text;
  v_admin_excluded int := 0;
  v_absent_deactivated int := 0;
  v_auto_restored int := 0;
  v_active_list_master int := 0;
  v_list_coverage numeric := 0;
  v_incoming_max_row integer := 0;
  v_master_max_row integer := 0;
  v_list_row_coverage numeric := 0;
  v_list_absence_sync_accepted boolean := false;
  v_changed int := 0;
  v_duplicate_list_count int := 0;
  v_duplicate_master_count int := 0;
  v_master_id bigint;
  v_master_match_count int := 0;
  v_master_row_found boolean := false;
  v_master_status text;
  v_master_sync_status text;
  v_master_bootstrap_source text;
  v_normalized_name text;
  v_identity jsonb;
  v_identity_status text;
  v_invalid_server_count integer := 0;
  v_invalid_server_rows jsonb := '[]'::jsonb;
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_valid->>'ok')::boolean, false) is not true then
    return v_valid;
  end if;

  if p_list is null or jsonb_typeof(p_list) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIST', 'message', 'p_list는 배열이어야 합니다.');
  end if;

  v_filter := case when jsonb_typeof(coalesce(p_filter, '{}'::jsonb)) = 'object' then coalesce(p_filter, '{}'::jsonb) else '{}'::jsonb end;
  v_filter_classes := case when jsonb_typeof(v_filter->'classes') = 'array' then v_filter->'classes' else '[]'::jsonb end;
  v_filter_gear_types := case when jsonb_typeof(v_filter->'gearTypes') = 'array' then v_filter->'gearTypes' else '[]'::jsonb end;
  v_filter_races := case when jsonb_typeof(v_filter->'races') = 'array' then v_filter->'races' else '[]'::jsonb end;
  v_filter_servers := case when jsonb_typeof(v_filter->'servers') = 'array' then v_filter->'servers' else '[]'::jsonb end;
  v_filter_character := nullif(trim(coalesce(v_filter->>'characterName', '')), '');
  v_lookup_mode := lower(trim(coalesce(v_filter->>'lookupMode', v_filter->>'lookup_mode', 'all')));

  if v_lookup_mode in ('new', 'new_only', 'missing', 'missing_only') then
    v_lookup_mode := 'missing_only';
  elsif v_lookup_mode in ('all', 'full', '') then
    v_lookup_mode := 'all';
  else
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_LOOKUP_MODE',
      'message', 'lookupMode는 all 또는 missing_only만 허용됩니다.',
      'lookupMode', v_lookup_mode
    );
  end if;

  v_filter := jsonb_set(v_filter, '{lookupMode}', to_jsonb(v_lookup_mode), true);

  -- 신규 캐릭터는 기존 Master 장비 이력이 없으므로 장비 유형 조건으로 판정하지 않는다.
  if v_lookup_mode = 'missing_only' and jsonb_array_length(v_filter_gear_types) > 0 then
    v_gear_filter_ignored := true;
    v_filter_gear_types := '[]'::jsonb;
    v_filter := jsonb_set(v_filter, '{gearTypes}', '[]'::jsonb, true);
  end if;

  v_filter_applied :=
       v_lookup_mode = 'missing_only'
    or jsonb_array_length(v_filter_classes) > 0
    or jsonb_array_length(v_filter_gear_types) > 0
    or jsonb_array_length(v_filter_races) > 0
    or jsonb_array_length(v_filter_servers) > 0
    or v_filter_character is not null;

  if v_filter_character is not null then
    v_filter_summary := concat_ws(' · ',
      case when v_lookup_mode = 'missing_only' then '신규 캐릭터만' else null end,
      '캐릭터 ' || public.kinojo_strip_server_suffix(v_filter_character)
    );
  elsif v_filter_applied then
    v_filter_summary := concat_ws(' · ',
      case when v_lookup_mode = 'missing_only' then '신규 캐릭터만' else null end,
      case when jsonb_array_length(v_filter_classes) > 0 then '클래스 ' || jsonb_array_length(v_filter_classes)::text else null end,
      case when jsonb_array_length(v_filter_gear_types) > 0 then '장비 ' || jsonb_array_length(v_filter_gear_types)::text else null end,
      case when jsonb_array_length(v_filter_races) > 0 then '종족 ' || jsonb_array_length(v_filter_races)::text else null end,
      case when jsonb_array_length(v_filter_servers) > 0 then '서버 ' || jsonb_array_length(v_filter_servers)::text else null end
    );
  end if;

  perform public.kinojo_lookup_step_upsert(
    p_session_id, 'LIST_MASTER_COMPARE', 1, 'active', 0, greatest(jsonb_array_length(p_list), 1),
    'Server Engine이 Google list 원본과 character_master를 대조합니다.',
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary
    )
  );

  create temporary table if not exists tmp_kinojo_prepare_list (
    list_row int,
    raw_name text,
    character_name text,
    normalized_name text,
    server_id int,
    server_name text,
    class_name text,
    main_character_name text,
    is_main boolean,
    existed boolean,
    corrected boolean
  ) on commit drop;
  truncate tmp_kinojo_prepare_list;

  delete from public.lookup_session_targets where session_id = p_session_id;

  for v_item in select value from jsonb_array_elements(p_list)
  loop
    v_raw_name := nullif(trim(coalesce(v_item->>'name', v_item->>'characterName', v_item->>'character_name', '')), '');
    if v_raw_name is null then
      v_excluded := v_excluded + 1;
      continue;
    end if;

    v_row_no := case when coalesce(v_item->>'row', '') ~ '^[0-9]+$' then (v_item->>'row')::int else null end;
    v_raw_class := nullif(trim(coalesce(v_item->>'className', v_item->>'class_name', v_item->>'class', '')), '');
    v_class_name := public.kinojo_normalize_aion_class_name(v_raw_class);
    v_raw_main := nullif(trim(coalesce(
      v_item->>'mainCharacterName', v_item->>'main_character_name', v_item->>'owner', v_item->>'main', ''
    )), '');
    if v_raw_main is null then v_raw_main := v_raw_name; end if;

    v_identity := public.kinojo_character_identity_strict_258(
      v_raw_name,
      coalesce(
        case when coalesce(v_item->>'serverId','') ~ '^[0-9]+$' then (v_item->>'serverId')::int else null end,
        case when coalesce(v_item->>'server_id','') ~ '^[0-9]+$' then (v_item->>'server_id')::int else null end,
        2002
      )
    );
    v_identity_status := coalesce(v_identity->>'status', 'IDENTITY_UNAVAILABLE');

    if coalesce((v_identity->>'matchable')::boolean, false) is not true then
      v_invalid_server_count := v_invalid_server_count + 1;
      v_invalid_server_rows := v_invalid_server_rows || jsonb_build_array(jsonb_build_object(
        'row', v_row_no,
        'originalName', v_raw_name,
        'characterName', coalesce(v_identity->>'characterName', public.kinojo_strip_server_suffix(v_raw_name), ''),
        'serverSuffix', coalesce(v_identity->>'serverSuffix', ''),
        'status', v_identity_status,
        'message', case v_identity_status
          when 'UNKNOWN_SERVER_SUFFIX' then '등록되지 않은 서버 태그입니다.'
          when 'AMBIGUOUS_SERVER_SUFFIX' then '여러 서버와 겹치는 서버 태그입니다. 전체 서버명을 사용하세요.'
          when 'DEFAULT_SERVER_NOT_FOUND' then '기본 서버를 server_master에서 찾지 못했습니다.'
          else '캐릭터 서버를 확정하지 못했습니다.'
        end
      ));
      v_excluded := v_excluded + 1;
      continue;
    end if;

    v_name := nullif(v_identity->>'characterName', '');
    v_server_id := nullif(v_identity->>'serverId', '')::integer;
    v_server_name := coalesce(nullif(v_identity->>'serverName', ''), public.kinojo_server_name_by_id(v_server_id), '');
    v_main_name := coalesce(public.kinojo_strip_server_suffix(v_raw_main), v_name);
    v_is_main := public.kinojo_character_identity_key_v298(v_raw_name)
                 = public.kinojo_character_identity_key_v298(v_raw_main);
    v_normalized_name := public.kinojo_character_identity_key_v298(v_name);

    if coalesce(v_normalized_name, '') = '' then
      v_excluded := v_excluded + 1;
      continue;
    end if;

    -- 같은 Server + 정규화 캐릭터가 list에 여러 번 있어도 Target은 한 번만 만든다.
    if exists (
      select 1 from tmp_kinojo_prepare_list t
       where t.server_id = v_server_id
         and t.normalized_name = v_normalized_name
    ) then
      v_duplicate_list_count := v_duplicate_list_count + 1;
      update tmp_kinojo_prepare_list t
         set class_name = coalesce(t.class_name, v_class_name),
             main_character_name = coalesce(t.main_character_name, v_main_name),
             is_main = t.is_main or v_is_main
       where t.server_id = v_server_id
         and t.normalized_name = v_normalized_name;
      continue;
    end if;

    v_exists := false;
    v_master_row_found := false;
    v_before_list_row := null;
    v_master_id := null;
    v_master_match_count := 0;
    v_master_status := null;
    v_master_sync_status := null;
    v_master_bootstrap_source := null;
    select cm.id, cm.list_row, count(*) over(), cm.status, cm.sync_status, cm.bootstrap_source
      into v_master_id, v_before_list_row, v_master_match_count, v_master_status, v_master_sync_status, v_master_bootstrap_source
      from public.character_master cm
     where cm.server_id = v_server_id
       and public.kinojo_character_identity_key_v298(cm.character_name) = v_normalized_name
     order by
       case when cm.character_name = v_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1;
    v_master_row_found := found;
    -- prepare 단계가 만든 WAIT_LOOKUP placeholder는 Master 행이 있어도 아직 조회된 캐릭터가 아니다.
    -- 필터에서 한 번 제외됐거나 이전 회차가 중단돼도 신규 조회에서 다시 잡히게 한다.
    v_exists := v_master_row_found and not (
      coalesce(v_master_status, '') = 'WAIT_LOOKUP'
      and coalesce(v_master_sync_status, '') = 'lookup_queued'
      and coalesce(v_master_bootstrap_source, '') like 'google_list_prepare%'
    );
    v_duplicate_master_count := v_duplicate_master_count + greatest(coalesce(v_master_match_count, 0) - 1, 0);

    -- H is raw state from AppsScript_MASTER. Preserve exclusion before any target/API call.
    if upper(v_name) like '%\_D' escape '\'
       or btrim(coalesce(v_item->>'status',''))='삭제후보' then
      with changed as (
        update public.character_master set lookup_excluded=true,
          exclusion_reason='삭제후보',lookup_excluded_at=coalesce(lookup_excluded_at,now()),
          exclusion_memo='list _D/H 삭제후보 사전 제외',updated_at=now()
        where id=v_master_id and (lookup_excluded is distinct from true or exclusion_reason is distinct from '삭제후보')
        returning character_name,server_id
      )
      insert into public.character_status_history(character_name,server_id,action,reason,memo)
        select character_name,server_id,'LOOKUP_EXCLUDE','삭제후보','list _D/H 삭제후보 사전 제외' from changed;
      v_admin_excluded:=v_admin_excluded+1;
      continue;
    end if;

    -- Google list에서 자동 탈퇴 처리된 캐릭터가 다시 나타나면 자동 복구합니다.
    with restored as (
      update public.character_master cm
         set is_active = true,
             inactive_reason = null,
             inactive_memo = null,
             restored_at = now(),
             status_updated_at = now(),
             status = case when coalesce(cm.status,'') in ('INACTIVE','DELETED') then 'OK' else cm.status end,
             sync_status = 'list_present_auto_restored',
             updated_at = now()
       where cm.id = v_master_id
         and coalesce(cm.is_active,true) is false
         and cm.sync_status = 'list_absent_auto_inactive'
      returning cm.character_name, cm.server_id
    )
    insert into public.character_status_history(character_name, server_id, action, reason, memo, admin_pass_key)
    select character_name, server_id, 'RESTORE_AUTO_LIST_PRESENT', 'LIST_PRESENT', 'Google list에 다시 등록되어 자동 복구', 'SERVER_ENGINE'
    from restored;
    get diagnostics v_changed = row_count;
    v_auto_restored := v_auto_restored + coalesce(v_changed,0);

    v_admin_reason := public.kinojo_lookup_admin_exclusion_reason(v_server_id, v_name);
    if v_admin_reason is not null then
      v_admin_excluded := v_admin_excluded + 1;
      update public.character_master cm
         set list_row = coalesce(v_row_no, cm.list_row),
             last_seen_at = now(),
             sync_status = 'admin_excluded',
             updated_at = now()
       where cm.id = v_master_id;
      continue;
    end if;

    if v_exists then
      v_existing := v_existing + 1;
      if v_row_no is not null and coalesce(v_before_list_row, -1) <> v_row_no then
        v_corrected := v_corrected + 1;
      end if;
    else
      v_new := v_new + 1;
    end if;

    if v_master_row_found then
      update public.character_master cm
         set character_name = v_name,
             server_name = coalesce(v_server_name, cm.server_name),
             list_row = coalesce(v_row_no, cm.list_row),
             class_name = coalesce(v_class_name, cm.class_name),
             main_character_name = coalesce(v_main_name, cm.main_character_name),
             is_main = v_is_main,
             last_seen_at = now(),
             sync_status = case
               when v_lookup_mode = 'missing_only' and v_exists then cm.sync_status
               else 'lookup_queued'
             end,
             status = case
               when v_exists and coalesce(cm.status, '') in ('', 'WAIT_LOOKUP') then 'OK'
               else cm.status
             end,
             updated_at = now()
       where cm.id = v_master_id;
    else
      insert into public.character_master (
        server_id, server_name, character_name, status, main_character_name, is_main, class_name,
        list_row, first_seen_at, last_seen_at, sync_status, bootstrap_source, bootstrap_imported_at
      ) values (
        v_server_id, v_server_name, v_name, 'WAIT_LOOKUP',
        v_main_name, v_is_main, v_class_name, v_row_no, now(), now(), 'lookup_queued',
        case when v_lookup_mode = 'missing_only' then 'google_list_prepare_v8_strict_missing_only' else 'google_list_prepare_v8_strict' end,
        now()
      )
      on conflict (server_id, character_name) do update set
        server_name = coalesce(excluded.server_name, public.character_master.server_name),
        list_row = coalesce(excluded.list_row, public.character_master.list_row),
        class_name = coalesce(excluded.class_name, public.character_master.class_name),
        main_character_name = coalesce(excluded.main_character_name, public.character_master.main_character_name),
        is_main = excluded.is_main,
        last_seen_at = now(),
        sync_status = 'lookup_queued',
        updated_at = now();
    end if;

    insert into tmp_kinojo_prepare_list(list_row, raw_name, character_name, normalized_name, server_id, server_name, class_name, main_character_name, is_main, existed, corrected)
    values(v_row_no, v_raw_name, v_name, v_normalized_name, v_server_id, v_server_name, v_class_name, v_main_name, v_is_main, v_exists, v_exists and v_row_no is not null and coalesce(v_before_list_row, -1) <> v_row_no);
  end loop;

  -- v470: The DB roster remains queryable even without a Google list row.
  -- Insert directly from Master: do not rewrite its identity, family or list row.
  insert into tmp_kinojo_prepare_list(
    list_row,raw_name,character_name,normalized_name,server_id,server_name,
    class_name,main_character_name,is_main,existed,corrected
  )
  select null,cm.character_name,cm.character_name,
    public.kinojo_character_identity_key_v298(cm.character_name),
    cm.server_id,cm.server_name,cm.class_name,cm.main_character_name,cm.is_main,
    not (
      coalesce(cm.status,'')='WAIT_LOOKUP'
      and coalesce(cm.sync_status,'')='lookup_queued'
      and coalesce(cm.bootstrap_source,'') like 'google_list_prepare%'
    ),false
  from public.character_master cm
  where upper(cm.character_name) not like '%\_D' escape '\'
    and coalesce(cm.is_active,true)
    and coalesce(cm.status,'') not in ('DELETED','INACTIVE')
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id,cm.character_name) is null
    and not exists (
      select 1 from tmp_kinojo_prepare_list t
      where t.server_id=cm.server_id
        and t.normalized_name=public.kinojo_character_identity_key_v298(cm.character_name)
    );
  get diagnostics v_master_only_count = row_count;
  select count(*) filter(where not existed),count(*) filter(where existed)
    into v_new,v_existing from tmp_kinojo_prepare_list;

  select count(*) into v_compare_total from tmp_kinojo_prepare_list;

  insert into public.lookup_session_targets(
    session_id, lookup_order, list_row, list_original_name, server_id, server_name, character_name,
    main_character_name, class_name, target_status, target_source, existed_in_master, corrected
  )
  select
    p_session_id,
    row_number() over(order by t.character_name, t.server_id),
    t.list_row,
    t.raw_name,
    t.server_id,
    coalesce(cm.server_name, t.server_name, '지켈'),
    t.character_name,
    coalesce(t.main_character_name, cm.main_character_name, t.character_name),
    coalesce(t.class_name, cm.class_name, ''),
    'queued',
    case
      when v_lookup_mode = 'missing_only' then 'server:list_master_missing_only_owner_v8_strict'
      when v_filter_applied and t.existed then 'server:list_master_existing_filtered_owner_v8_strict'
      when v_filter_applied then 'server:list_master_new_filtered_owner_v8_strict'
      when t.existed then 'server:list_master_existing_owner_v8_strict'
      else 'server:list_master_new_wait_lookup_owner_v8_strict'
    end,
    t.existed,
    t.corrected
  from tmp_kinojo_prepare_list t
  left join lateral (
    select cm.*
      from public.character_master cm
     where cm.server_id = t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name) = t.normalized_name
     order by
       case when cm.character_name = t.character_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1
  ) cm on true
  where
    (v_lookup_mode = 'all' or coalesce(t.existed, false) is false)
    and (
      v_filter_character is null
      or public.kinojo_character_identity_key_v298(t.character_name)
         = public.kinojo_character_identity_key_v298(public.kinojo_strip_server_suffix(v_filter_character))
    )
    and (
      jsonb_array_length(v_filter_classes) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_classes) f(value)
        where public.kinojo_normalize_aion_class_name(f.value)
              = public.kinojo_normalize_aion_class_name(coalesce(t.class_name, cm.class_name, ''))
      )
    )
    and (
      jsonb_array_length(v_filter_races) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_races) f(value)
        where upper(trim(f.value)) = case
          when t.server_id between 1000 and 1999 then 'ELYOS'
          when t.server_id between 2000 and 2999 then 'ASMODIAN'
          else ''
        end
      )
    )
    and (
      jsonb_array_length(v_filter_servers) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_servers) f(value)
        where regexp_replace(f.value, '[^0-9]', '', 'g') = t.server_id::text
      )
    )
    and (
      jsonb_array_length(v_filter_gear_types) = 0
      or jsonb_array_length(v_filter_gear_types) >= 2
      or exists (
        select 1
        from jsonb_array_elements_text(v_filter_gear_types) f(value)
        where
          (upper(trim(f.value)) = 'PVE' and (coalesce(cm.latest_pve_combat_power, 0) > 0 or coalesce(cm.latest_pve_item_level, 0) > 0))
          or
          (upper(trim(f.value)) = 'PVP' and (coalesce(cm.latest_pvp_combat_power, 0) > 0 or coalesce(cm.latest_pvp_item_level, 0) > 0))
      )
    )
  order by t.character_name, t.server_id
  on conflict(session_id, server_id, character_name) do update set
    lookup_order = excluded.lookup_order,
    list_row = excluded.list_row,
    list_original_name = excluded.list_original_name,
    server_name = excluded.server_name,
    main_character_name = excluded.main_character_name,
    class_name = excluded.class_name,
    target_status = 'queued',
    target_source = excluded.target_source,
    existed_in_master = excluded.existed_in_master,
    corrected = excluded.corrected,
    payload_id = null,
    snapshot_id = null,
    last_error = null,
    queued_at = now(),
    claimed_at = null,
    looked_up_at = null,
    updated_at = now();

  select
    count(*)::int,
    count(*) filter (where coalesce(existed_in_master, false) is false)::int,
    count(*) filter (where coalesce(existed_in_master, false) is true)::int
  into v_total, v_selected_new, v_selected_existing
  from public.lookup_session_targets
  where session_id = p_session_id;

  select count(*) into v_absent
  from public.character_master cm
  where coalesce(cm.status, '') not in ('DELETED', 'INACTIVE')
    and coalesce(cm.is_active, true) is true
    and (cm.list_row is not null or coalesce(cm.bootstrap_source, '') like 'google_list%')
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id, cm.character_name) is null
    and not exists (
      select 1 from tmp_kinojo_prepare_list t
      where t.server_id = cm.server_id
        and public.kinojo_character_identity_key_v298(t.character_name) = public.kinojo_character_identity_key_v298(cm.character_name)
    );

  select count(*), coalesce(max(cm.list_row), 0)
  into v_active_list_master, v_master_max_row
  from public.character_master cm
  where coalesce(cm.is_active,true) is true
    and (cm.list_row is not null or coalesce(cm.bootstrap_source,'') like 'google_list%')
    and public.kinojo_lookup_admin_exclusion_reason(cm.server_id, cm.character_name) is null;

  select coalesce(max(t.list_row), 0) into v_incoming_max_row
  from tmp_kinojo_prepare_list t;

  v_list_coverage := case
    when v_active_list_master > 0 then least(1, v_compare_total::numeric / v_active_list_master::numeric)
    else 1
  end;
  v_list_row_coverage := case
    when v_master_max_row > 0 then least(1, v_incoming_max_row::numeric / v_master_max_row::numeric)
    else 1
  end;
  -- v470: list presence is not an administrative exclusion or membership decision.
  v_list_absence_sync_accepted := false;
  v_absent_deactivated := 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'row', t.list_row,
    'name', t.character_name,
    'originalName', coalesce(t.list_original_name, t.character_name),
    'characterName', t.character_name,
    'mainCharacterName', t.main_character_name,
    'serverId', t.server_id::text,
    'serverName', coalesce(t.server_name, '지켈'),
    'className', coalesce(t.class_name, ''),
    'latestPveItemLevel', cm.latest_pve_item_level,
    'latestPveCombatPower', cm.latest_pve_combat_power,
    'latestPvpItemLevel', cm.latest_pvp_item_level,
    'latestPvpCombatPower', cm.latest_pvp_combat_power,
    'source', t.target_source,
    'targetId', t.id
  ) order by t.lookup_order), '[]'::jsonb)
  into v_queue
  from public.lookup_session_targets t
  left join lateral (
    select cm.*
      from public.character_master cm
     where cm.server_id = t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)
           = public.kinojo_character_identity_key_v298(t.character_name)
     order by
       case when cm.character_name = t.character_name then 0 else 1 end,
       case when coalesce(cm.is_active, true) then 0 else 1 end,
       cm.updated_at desc nulls last,
       cm.id desc
     limit 1
  ) cm on true
  where t.session_id = p_session_id;

  perform public.kinojo_lookup_step_upsert(
    p_session_id, 'LIST_MASTER_COMPARE', 1, 'done', v_compare_total, greatest(v_compare_total, 1),
    'Server Engine LIST / MASTER 대조·중복 정리 및 조회 조건 적용 완료',
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'compareCount', v_compare_total,
      'queueCount', v_total,
      'newCount', v_new,
      'existingCount', v_existing,
      'correctedCount', v_corrected,
      'duplicateListCount', v_duplicate_list_count,
      'duplicateMasterCount', v_duplicate_master_count,
      'excludedCount', v_excluded,
      'invalidServerCount', v_invalid_server_count,
      'invalidServerRows', v_invalid_server_rows,
      'adminExcludedCount', v_admin_excluded,
      'absentCandidateCount', v_absent,
      'autoDeactivatedCount', v_absent_deactivated,
      'autoRestoredCount', v_auto_restored,
      'listCoverage', round(v_list_coverage, 4),
      'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
      'listAbsenceCountThreshold', 0.95,
      'listAbsenceRowThreshold', 0.98,
      'listRowCoverage', round(v_list_row_coverage, 4),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'selectedNewCount', v_selected_new,
      'selectedExistingCount', v_selected_existing,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary,
      'persistentTargets', true
    )
  );

  perform public.kinojo_runtime_progress(
    p_session_id, p_session_token, 'LIST_MASTER_COMPARE', null,
    'Server Engine LIST / MASTER 대조·중복 정리 및 조회 조건 적용 완료', v_compare_total, greatest(v_compare_total, 1),
    jsonb_build_object(
      'rawListCount', jsonb_array_length(p_list),
      'compareCount', v_compare_total,
      'queueCount', v_total,
      'newCount', v_new,
      'existingCount', v_existing,
      'correctedCount', v_corrected,
      'duplicateListCount', v_duplicate_list_count,
      'duplicateMasterCount', v_duplicate_master_count,
      'excludedCount', v_excluded,
      'invalidServerCount', v_invalid_server_count,
      'invalidServerRows', v_invalid_server_rows,
      'adminExcludedCount', v_admin_excluded,
      'absentCandidateCount', v_absent,
      'autoDeactivatedCount', v_absent_deactivated,
      'autoRestoredCount', v_auto_restored,
      'listCoverage', round(v_list_coverage, 4),
      'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
      'listAbsenceCountThreshold', 0.95,
      'listAbsenceRowThreshold', 0.98,
      'listRowCoverage', round(v_list_row_coverage, 4),
      'serverOwnedCompare', true,
      'serverOwnedFilter', true,
      'lookupMode', v_lookup_mode,
      'selectedNewCount', v_selected_new,
      'selectedExistingCount', v_selected_existing,
      'gearTypeFilterIgnored', v_gear_filter_ignored,
      'lookupFilter', v_filter,
      'lookupFilterSummary', v_filter_summary,
      'persistentTargets', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'masterOnlyCount',v_master_only_count,
    'sessionId', p_session_id,
    'rawListCount', jsonb_array_length(p_list),
    'compareCount', v_compare_total,
    'queueCount', v_total,
    'lookupMode', v_lookup_mode,
    'filteredCount', v_total,
    'newCharacterCount', v_new,
    'existingMasterCount', v_existing,
    'invalidCount', v_excluded,
    'invalidServerCount', v_invalid_server_count,
    'invalidServerRows', v_invalid_server_rows,
    'selectedNewCount', v_selected_new,
    'selectedExistingCount', v_selected_existing,
    'gearTypeFilterIgnored', v_gear_filter_ignored,
    'newCount', v_new,
    'existingCount', v_existing,
    'correctedCount', v_corrected,
    'duplicateListCount', v_duplicate_list_count,
    'duplicateMasterCount', v_duplicate_master_count,
    'excludedCount', v_excluded,
    'adminExcludedCount', v_admin_excluded,
    'absentCandidateCount', v_absent,
    'autoDeactivatedCount', v_absent_deactivated,
    'autoRestoredCount', v_auto_restored,
    'listCoverage', round(v_list_coverage, 4),
    'listAbsenceSyncAccepted', v_list_absence_sync_accepted,
    'listAbsenceCountThreshold', 0.95,
    'listAbsenceRowThreshold', 0.98,
    'listRowCoverage', round(v_list_row_coverage, 4),
    'filterApplied', v_filter_applied,
    'lookupFilter', v_filter,
    'lookupFilterSummary', v_filter_summary,
    'queue', v_queue,
    'message', case
      when v_lookup_mode = 'missing_only' and v_total = 0
        then '신규 캐릭터가 없습니다. list와 Server Master가 모두 일치합니다.'
      when v_lookup_mode = 'missing_only'
        then 'Server Engine 신규 캐릭터 Target 생성 완료 · 신규 조회 ' || v_total::text || '명 · 관리자 제외 ' || v_admin_excluded::text || '명'
      when v_filter_applied
        then 'Server Engine LIST / MASTER 대조·중복 정리 및 조건 Target 생성 완료 · 관리자 제외 ' || v_admin_excluded::text || '명'
      else 'Server Engine LIST / MASTER 대조·중복 정리 및 전체 Target 생성 완료 · 관리자 제외 ' || v_admin_excluded::text || '명' || case when v_invalid_server_count > 0 then ' · 서버 확인 필요 ' || v_invalid_server_count::text || '명' else '' end
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_server_queue_target_context_v270(p_session_id text, p_session_token text, p_target_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_target public.lookup_session_targets%rowtype;
  v_character public.character_master%rowtype;
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then return v_valid; end if;

  select * into v_target
  from public.lookup_session_targets
  where session_id=p_session_id and id=p_target_id;
  if not found then return jsonb_build_object('ok',false,'code','TARGET_NOT_FOUND','message','Server Queue Target을 찾지 못했습니다.'); end if;

  select * into v_character
  from public.character_master cm
  where cm.server_id=v_target.server_id
    and public.kinojo_normalize_character_name(cm.character_name)=public.kinojo_normalize_character_name(v_target.character_name)
  order by cm.updated_at desc nulls last,cm.id desc
  limit 1;

  if upper(coalesce(v_character.character_name,v_target.character_name,'')) like '%\_D' escape '\'
     or coalesce(v_character.lookup_excluded,false)
     or v_character.exclusion_reason='삭제후보' then
    return jsonb_build_object('ok',false,'code','LOOKUP_EXCLUDED','message','관리 정책에 따라 조회 제외된 캐릭터입니다.');
  end if;

  return jsonb_build_object(
    'ok',true,
    'targetId',v_target.id,
    'lookupOrder',v_target.lookup_order,
    'listRow',v_target.list_row,
    'characterName',v_target.character_name,
    'mainCharacterName',coalesce(v_target.main_character_name,v_target.character_name),
    'serverId',v_target.server_id,
    'serverName',v_target.server_name,
    'className',v_target.class_name,
    'charKey',v_character.char_key,
    'detailUrl',v_character.detail_url,
    'previous',jsonb_build_object(
      'pveItemLevel',v_character.latest_pve_item_level,
      'pveCombatPower',v_character.latest_pve_combat_power,
      'pvpItemLevel',v_character.latest_pvp_item_level,
      'pvpCombatPower',v_character.latest_pvp_combat_power,
      'lastSyncedAt',v_character.last_synced_at
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_queue_list_sheet_sync_session(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_runtime public.updater_sessions%rowtype;
  v_relation jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_target_count integer := 0;
  v_append_count integer := 0;
  v_incomplete_count integer := 0;
  v_incomplete_items jsonb := '[]'::jsonb;
  v_existing_total integer := 0;
  v_existing_synced integer := 0;
  v_existing_pending integer := 0;
  v_existing_failed integer := 0;
begin
  if nullif(coalesce(p_session_id,''),'') is null or nullif(coalesce(p_session_token,''),'') is null then
    return jsonb_build_object('ok',false,'code','MISSING_SESSION','message','session_id/session_token이 필요합니다.');
  end if;

  select * into v_runtime
    from public.updater_sessions
   where session_id=p_session_id and session_token=p_session_token
   limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','SESSION_NOT_FOUND','message','Runtime session을 찾을 수 없습니다.');
  end if;

  v_relation := private.kinojo_legion_tree_finalize_relation_v373(p_session_id);
  if coalesce((v_relation->>'ok')::boolean,false) is not true then
    return v_relation || jsonb_build_object('listQueueCreated',false);
  end if;

  select count(*)::integer,
         count(*) filter(where t.list_row is null)::integer
    into v_target_count,v_append_count
    from public.lookup_session_targets t
   where t.session_id=p_session_id
     and t.target_status='lookup_done'
     and coalesce(t.character_name,'')<>''
     and (
       t.list_row is not null
       or lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%'
     );

  if v_target_count=0 then
    return jsonb_build_object('ok',false,'code','LIST_TARGET_NOT_FOUND','message','list 반영 대상 조회 완료 Target을 찾지 못했습니다.','sessionId',p_session_id);
  end if;

  select count(*)::integer,
         count(*) filter(where sync_status in ('synced','done','completed'))::integer,
         count(*) filter(where sync_status in ('queued','processing','retry'))::integer,
         count(*) filter(where sync_status in ('failed','error'))::integer
    into v_existing_total,v_existing_synced,v_existing_pending,v_existing_failed
    from public.google_list_sheet_sync_queue
   where session_id=p_session_id;

  if v_existing_total=v_target_count and v_existing_total>0 then
    select count(*)::integer into v_append_count
      from public.google_list_sheet_sync_queue where session_id=p_session_id and append_if_missing is true;
    return jsonb_build_object(
      'ok',true,'queued',v_existing_total,'queuedCount',v_existing_total,'targetCount',v_target_count,
      'appendCount',v_append_count,
      'pendingCount',v_existing_pending,'syncedCount',v_existing_synced,'failedCount',v_existing_failed,
      'reusedExistingQueue',true,'identitySource','lookup_session_targets','valueSource','existing_verified_queue',
      'oppositeGearMode','preserve_existing_sheet_value','clearModeSource','explicit_clear_only',
      'relation',v_relation,'message',format('기존 list Queue 상태를 보존했습니다. 전체 %s건 / 완료 %s건 / 재시도 %s건',v_existing_total,v_existing_synced,v_existing_pending+v_existing_failed),
      'noReviewToSheet',true
    );
  end if;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'characterName',t.character_name,'payloadId',p.id,'gearType',p.gear_type,
           'masterSyncStatus',p.master_sync_status,'masterLatestPayloadId',cm.latest_payload_id
         ) order by t.lookup_order),'[]'::jsonb)
    into v_incomplete_count,v_incomplete_items
    from public.lookup_session_targets t
    left join public.extension_character_payloads p on p.id=t.payload_id
    left join lateral (
      select cm.* from public.character_master cm
       where cm.server_id=t.server_id
         and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(t.character_name)
       order by case when cm.character_name=t.character_name then 0 else 1 end,
                case when coalesce(cm.is_active,true) then 0 else 1 end,
                cm.updated_at desc nulls last,cm.id desc limit 1
    ) cm on true
   where t.session_id=p_session_id
     and t.target_status='lookup_done'
     and coalesce(t.character_name,'')<>''
     and (t.list_row is not null or lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%')
     and (
       p.id is null or coalesce(p.master_sync_status,'')<>'synced'
       or upper(coalesce(p.gear_type,'UNKNOWN')) not in ('PVE','PVP')
       or cm.id is null or cm.latest_payload_id is distinct from p.id
     );

  if v_incomplete_count>0 then
    return jsonb_build_object('ok',false,'code','LIST_EXPORT_SOURCE_INCOMPLETE','sessionId',p_session_id,
      'incompleteCount',v_incomplete_count,'incompleteItems',v_incomplete_items,
      'message','Master 반영이 확인되지 않은 조회값이 있어 list Queue 생성을 중단했습니다.');
  end if;

  delete from public.google_list_sheet_sync_queue where session_id=p_session_id;

  insert into public.google_list_sheet_sync_queue(
    session_id,character_id,list_row,list_original_name,character_name,
    server_id,server_name,class_name,main_character_name,append_if_missing,
    pve_item_level,pvp_item_level,pve_combat_power,pvp_combat_power,
    latest_power_total,latest_item_level_total,clear_pve_stats,clear_pvp_stats,
    sync_status,list_display_name,updated_at,identity_changed,previous_character_name,main_character_renamed
  )
  select
    p_session_id,cm.id,t.list_row,
    case when t.list_row is null then public.kinojo_list_display_name_v287(t.character_name,t.server_id)
         else coalesce(t.list_original_name,t.character_name) end,
    t.character_name,t.server_id,coalesce(cm.server_name,t.server_name,public.kinojo_server_name_by_id(t.server_id)),
    coalesce(nullif(public.kinojo_normalize_aion_class_name(cm.class_name),''),nullif(public.kinojo_normalize_aion_class_name(p.class_name),''),nullif(public.kinojo_normalize_aion_class_name(t.class_name),'')),
    case when main_cm.id is not null then public.kinojo_list_display_name_v287(main_cm.character_name,main_cm.server_id)
         when nullif(trim(cm.main_character_name),'') is not null then public.kinojo_list_display_name_v287(cm.main_character_name,cm.server_id)
         else public.kinojo_list_display_name_v287(cm.character_name,cm.server_id) end,
    (t.list_row is null and lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%'),
    case when upper(coalesce(p.gear_type,''))='PVE' then cm.latest_pve_item_level else null end,
    case when upper(coalesce(p.gear_type,''))='PVP' then cm.latest_pvp_item_level else null end,
    case when upper(coalesce(p.gear_type,''))='PVE' then cm.latest_pve_combat_power else null end,
    case when upper(coalesce(p.gear_type,''))='PVP' then cm.latest_pvp_combat_power else null end,
    coalesce(cm.latest_power_total,0),coalesce(cm.latest_item_level_total,0),false,false,'queued',
    public.kinojo_list_display_name_v287(t.character_name,t.server_id),now(),
    coalesce(t.list_original_name,t.character_name) is distinct from public.kinojo_list_display_name_v287(t.character_name,t.server_id),
    t.list_original_name,false
  from public.lookup_session_targets t
  join public.extension_character_payloads p on p.id=t.payload_id and p.master_sync_status='synced'
  join lateral (
    select cm.* from public.character_master cm
     where cm.server_id=t.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(t.character_name)
     order by case when cm.character_name=t.character_name then 0 else 1 end,
              case when coalesce(cm.is_active,true) then 0 else 1 end,
              cm.updated_at desc nulls last,cm.id desc limit 1
  ) cm on cm.latest_payload_id=p.id
  left join public.character_master main_cm on main_cm.id=cm.main_character_id
  where t.session_id=p_session_id and t.target_status='lookup_done' and coalesce(t.character_name,'')<>''
    and (t.list_row is not null or lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%')
  order by t.list_row nulls last,t.lookup_order;

  get diagnostics v_count=row_count;
  if v_count<>v_target_count then
    delete from public.google_list_sheet_sync_queue where session_id=p_session_id;
    return jsonb_build_object('ok',false,'code','LIST_QUEUE_COUNT_MISMATCH','sessionId',p_session_id,
      'targetCount',v_target_count,'queued',v_count,'message','조회 완료 Target 수와 list Queue 수가 일치하지 않아 반영을 중단했습니다.');
  end if;

  select count(*)::integer into v_append_count
    from public.google_list_sheet_sync_queue where session_id=p_session_id and append_if_missing is true;

  return jsonb_build_object(
    'ok',true,'queued',v_count,'queuedCount',v_count,'targetCount',v_target_count,'appendCount',v_append_count,
    'pendingCount',v_count,'syncedCount',0,'failedCount',0,'reusedExistingQueue',false,
    'identitySource','lookup_session_targets','valueSource','verified_character_master_current_gear_only',
    'oppositeGearMode','preserve_existing_sheet_value','clearModeSource','explicit_clear_only',
    'relation',v_relation,'databaseContract','373',
    'message',case when v_append_count>0 then '기존 list Queue와 신규 append Queue를 함께 생성했습니다.' else '기존 list Queue를 생성했습니다.' end,
    'noReviewToSheet',true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_identity_reviews_v287(p_pass_key text, p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_items jsonb := '[]'::jsonb;
begin
  select * into v_member from public.kinojo_admin_member_from_credential_v325(p_pass_key) limit 1;
  if not found or coalesce(v_member.level, 0) < 4 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ADMIN_ACCESS_DENIED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'reviewId', q.review_id,
    'status', q.review_status,
    'characterId', q.character_id,
    'current', jsonb_build_object(
      'characterName', cm.character_name,
      'serverId', cm.server_id,
      'serverName', cm.server_name,
      'className', cm.class_name,
      'charKeyMasked', case when cm.char_key is null then '' else '••••' || right(cm.char_key, 4) end,
      'profileImageUrl', cm.profile_image_url,
      'isMain', cm.is_main,
      'mainCharacterName', cm.main_character_name
    ),
    'candidate', jsonb_build_object(
      'characterName', q.candidate_character_name,
      'serverId', q.candidate_server_id,
      'serverName', q.candidate_server_name,
      'className', q.candidate_class_name,
      'charKeyMasked', case when q.candidate_char_key is null then '' else '••••' || right(q.candidate_char_key, 4) end,
      'profileImageUrl', q.candidate_profile_image_url,
      'detailUrl', q.candidate_detail_url
    ),
    'evidence', q.evidence,
    'createdAt', q.created_at
  ) order by q.created_at desc), '[]'::jsonb)
  into v_items
  from public.character_identity_review_queue q
  join public.character_master cm on cm.id = q.character_id
  where q.review_status = coalesce(nullif(trim(p_status), ''), 'pending')
    and (coalesce(nullif(trim(p_status),''),'pending')<>'pending' or (
      nullif(btrim(q.candidate_char_key),'')=nullif(btrim(cm.char_key),'')
      and public.kinojo_normalize_aion_class_name(q.candidate_class_name)=public.kinojo_normalize_aion_class_name(cm.class_name)
      and exists(select 1 from public.server_master a join public.server_master b on a.race_id=b.race_id
        where a.server_id=cm.server_id and b.server_id=q.candidate_server_id and coalesce(b.is_active,true))
    ));

  return jsonb_build_object('ok', true, 'items', v_items, 'count', jsonb_array_length(v_items));
end
$function$;
