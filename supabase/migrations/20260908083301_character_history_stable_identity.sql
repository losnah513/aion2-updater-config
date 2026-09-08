-- Stable identity for POWER history and current growth/ranking reads.
-- DB476 candidate generation remains unchanged. No automatic historical data rewrite.
begin;
set local lock_timeout='2s';
alter table public.character_history add column if not exists character_master_id bigint;
alter table public.character_history add column if not exists source_payload_id bigint;
create index if not exists character_history_identity_day_idx
 on public.character_history(character_master_id,history_date desc,created_at desc,id desc)
 where record_type='POWER' and status='OK' and character_master_id is not null;
create or replace function public.kinojo_history_identity_backfill_v1(
 p_after_id bigint default 0,p_limit integer default 200,p_apply boolean default false
) returns jsonb language plpgsql security definer
set search_path='pg_catalog','public'
set statement_timeout='20s'
set lock_timeout='2s'
as $fn$
declare
 h public.character_history%rowtype;
 v_id bigint; v_payload bigint; v_candidates integer;
 v_scanned integer:=0;v_linkable integer:=0;v_linked integer:=0;v_next bigint:=coalesce(p_after_id,0);
begin
 for h in select * from public.character_history
   where id>coalesce(p_after_id,0) and character_master_id is null and record_type='POWER'
   order by id limit greatest(1,least(coalesce(p_limit,200),500))
 loop
  v_scanned:=v_scanned+1;v_next:=h.id;v_id:=null;v_payload:=null;
  with proof as (
   select distinct e.after_data->>'id' as master_id,p.id as payload_id,p.char_key
   from public.master_sync_events e
   join public.extension_character_payloads p on p.id=e.payload_id and p.session_id=e.session_id
   where e.session_id=h.session_id and e.status='synced' and p.master_sync_status='synced'
     and p.server_id=h.server_id
     and public.kinojo_character_identity_key_v298(p.character_name)=public.kinojo_character_identity_key_v298(h.character_name)
     and e.after_data->>'server_id'=h.server_id::text
     and public.kinojo_character_identity_key_v298(e.after_data->>'character_name')=public.kinojo_character_identity_key_v298(h.character_name)
     and e.after_data->>'latest_payload_id'=p.id::text
     and p.char_key ~ '^[0-9]+$'
     and e.after_data->>'char_key'=p.char_key
  ), candidate as (
   select min(master_id) as master_id,min(payload_id) as payload_id,min(char_key) as char_key,
          count(distinct master_id)::int as n,count(distinct char_key)::int as keys
   from proof
  )
  select m.id,c.payload_id,c.n into v_id,v_payload,v_candidates
  from candidate c join public.character_master m on m.id::text=c.master_id and m.char_key=c.char_key
  where c.n=1 and c.keys=1;
  if v_id is not null then
   v_linkable:=v_linkable+1;
   if p_apply is true then
    update public.character_history ch set character_master_id=v_id,source_payload_id=v_payload
     where ch.id=h.id and ch.character_master_id is null
       and ch.session_id is not distinct from h.session_id
       and ch.server_id is not distinct from h.server_id
       and ch.character_name is not distinct from h.character_name;
    if found then v_linked:=v_linked+1; end if;
   end if;
  end if;
 end loop;
 return jsonb_build_object('ok',true,'dryRun',p_apply is not true,'scanned',v_scanned,'linkable',v_linkable,'linked',v_linked,
   'unresolved',v_scanned-v_linkable,'nextAfterId',v_next);
end;
$fn$;
revoke all on function public.kinojo_history_identity_backfill_v1(bigint,integer,boolean) from public,anon,authenticated;
grant execute on function public.kinojo_history_identity_backfill_v1(bigint,integer,boolean) to service_role;

CREATE OR REPLACE FUNCTION public.kinojo_master_sync_payload(p_payload_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload public.extension_character_payloads%rowtype;
  v_character_name text;
  v_main_name text;
  v_is_main boolean;
  v_old jsonb;
  v_after jsonb;
  v_history_date int;
  v_power_total int;
  v_item_total int;
  v_changed boolean := false;
  v_diagnosis jsonb;
  v_mode text;
  v_item int;
  v_power int;
  v_character_id bigint;
  v_snapshot_id bigint;
  v_target public.lookup_session_targets%rowtype;
  v_target_id bigint;
  v_server_id integer;
begin
  select * into v_payload
    from public.extension_character_payloads
   where id = p_payload_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_NOT_FOUND', 'message', 'payload를 찾을 수 없습니다.');
  end if;

  if coalesce(v_payload.master_sync_status, '') = 'synced' then
    return jsonb_build_object('ok', true, 'skipped', true, 'payloadId', p_payload_id, 'message', '이미 Master Sync 처리된 payload입니다.');
  end if;

  v_target_id := public.kinojo_json_int(v_payload.raw_payload, 'targetId', 'target_id');
  if v_target_id is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.id = v_target_id
      and t.session_id = v_payload.session_id
    limit 1;
  end if;

  if v_target.id is null and v_payload.lookup_order is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.session_id = v_payload.session_id
      and t.lookup_order = v_payload.lookup_order
    order by t.id
    limit 1;
  end if;

  if v_target.id is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'TARGET_IDENTITY_NOT_FOUND: 조회 Target을 확인하지 못해 Master 갱신을 차단했습니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object('ok', false, 'retryable', false, 'code', 'TARGET_IDENTITY_NOT_FOUND', 'payloadId', p_payload_id, 'message', '조회 Target을 확인하지 못해 Master 갱신을 차단했습니다.');
  end if;

  v_server_id := v_target.server_id;
  if coalesce(v_payload.server_id, v_server_id) <> v_server_id
     or public.kinojo_character_identity_key_v298(v_payload.character_name)
        <> public.kinojo_character_identity_key_v298(v_target.character_name) then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'TARGET_IDENTITY_MISMATCH: Payload와 조회 Target의 캐릭터/서버가 다릅니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object(
      'ok', false,
      'retryable', false,
      'code', 'TARGET_IDENTITY_MISMATCH',
      'payloadId', p_payload_id,
      'targetId', v_target.id,
      'targetCharacterName', v_target.character_name,
      'targetServerId', v_target.server_id,
      'payloadCharacterName', v_payload.character_name,
      'payloadServerId', v_payload.server_id,
      'message', 'Payload와 조회 Target의 캐릭터/서버가 달라 Master 갱신을 차단했습니다.'
    );
  end if;

  v_character_name := v_target.character_name;
  if v_character_name is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = '캐릭터명이 없습니다.',
           master_synced_at = now()
     where id = p_payload_id;
    return jsonb_build_object('ok', false, 'code', 'MISSING_CHARACTER_NAME', 'message', '캐릭터명이 없습니다.', 'payloadId', p_payload_id);
  end if;

  v_diagnosis := public.kinojo_payload_gear_diagnosis(p_payload_id);
  v_mode := coalesce(public.kinojo_json_text(v_diagnosis, 'detectedGearType'), 'UNKNOWN');
  v_item := public.kinojo_json_int(v_diagnosis, 'itemLevel');
  v_power := public.kinojo_json_int(v_diagnosis, 'combatPower');
  v_snapshot_id := public.kinojo_json_int(v_diagnosis, 'snapshotId');

  if v_mode not in ('PVE', 'PVP') or v_item is null or v_power is null then
    update public.extension_character_payloads
       set master_sync_status = 'failed',
           master_sync_message = 'GEAR_TYPE_UNKNOWN: PVE/PVP 근거가 불완전하여 Master 값을 갱신하지 않았습니다.',
           master_synced_at = now(),
           gear_type = 'UNKNOWN',
           gear_parse_status = coalesce(public.kinojo_json_text(v_diagnosis, 'gearParseStatus'), 'UNKNOWN'),
           gear_evidence = coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb)
     where id = p_payload_id;

    return jsonb_build_object(
      'ok', false,
      'retryable', false,
      'code', 'GEAR_TYPE_UNKNOWN',
      'payloadId', p_payload_id,
      'characterName', v_character_name,
      'diagnosis', v_diagnosis,
      'message', 'PVE/PVP 판정 근거가 불완전하여 기존 PVE/PVP 값을 보존했습니다.'
    );
  end if;

  update public.extension_character_payloads
     set gear_type = v_mode,
         gear_parse_status = 'CONFIRMED',
         gear_evidence = coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb),
         source_snapshot_id = coalesce(v_snapshot_id, source_snapshot_id),
         pve_item_level = case when v_mode = 'PVE' then v_item else null end,
         pve_combat_power = case when v_mode = 'PVE' then v_power else null end,
         pvp_item_level = case when v_mode = 'PVP' then v_item else null end,
         pvp_combat_power = case when v_mode = 'PVP' then v_power else null end
   where id = p_payload_id
   returning * into v_payload;

  v_main_name := coalesce(
    public.kinojo_strip_server_suffix(v_payload.main_character_name),
    public.kinojo_strip_server_suffix(public.kinojo_json_text(v_payload.raw_payload, 'mainCharacterName', 'main_character_name', 'owner', 'main')),
    v_character_name
  );
  v_is_main := public.kinojo_character_identity_key_v298(v_character_name) = public.kinojo_character_identity_key_v298(v_main_name);
  v_history_date := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD')::int;

  select to_jsonb(cm) into v_old
    from public.character_master cm
   where cm.server_id = v_server_id
     and cm.character_name = v_character_name;

  insert into public.character_master (
    server_id, server_name, character_name, char_key, profile_image_url, detail_url, status,
    main_character_name, is_main, class_name, first_seen_at, last_seen_at,
    latest_pve_item_level, latest_pve_combat_power, latest_pvp_item_level, latest_pvp_combat_power,
    latest_item_level_total, latest_power_total, latest_session_id, latest_payload_id,
    latest_snapshot_uid, latest_payload_hash, last_synced_at, sync_status
  ) values (
    v_server_id,
    coalesce(v_target.server_name, v_payload.server_name, public.kinojo_server_name_by_id(v_server_id)),
    v_character_name,
    v_payload.char_key,
    v_payload.profile_image_url,
    v_payload.detail_url,
    coalesce(public.kinojo_json_text(v_payload.raw_payload, 'status', 'crawlStatus'), 'OK'),
    v_main_name,
    v_is_main,
    v_payload.class_name,
    now(),
    now(),
    case when v_mode = 'PVE' then v_item end,
    case when v_mode = 'PVE' then v_power end,
    case when v_mode = 'PVP' then v_item end,
    case when v_mode = 'PVP' then v_power end,
    v_item,
    v_power,
    v_payload.session_id,
    v_payload.id,
    v_payload.snapshot_uid,
    v_payload.payload_hash,
    now(),
    'synced'
  )
  on conflict (server_id, character_name) do update set
    server_name = coalesce(excluded.server_name, public.character_master.server_name),
    char_key = coalesce(excluded.char_key, public.character_master.char_key),
    profile_image_url = coalesce(excluded.profile_image_url, public.character_master.profile_image_url),
    detail_url = coalesce(excluded.detail_url, public.character_master.detail_url),
    status = coalesce(excluded.status, public.character_master.status),
    main_character_name = coalesce(excluded.main_character_name, public.character_master.main_character_name),
    is_main = excluded.is_main,
    class_name = coalesce(excluded.class_name, public.character_master.class_name),
    latest_pve_item_level = case when v_mode = 'PVE' then v_item else public.character_master.latest_pve_item_level end,
    latest_pve_combat_power = case when v_mode = 'PVE' then v_power else public.character_master.latest_pve_combat_power end,
    latest_pvp_item_level = case when v_mode = 'PVP' then v_item else public.character_master.latest_pvp_item_level end,
    latest_pvp_combat_power = case when v_mode = 'PVP' then v_power else public.character_master.latest_pvp_combat_power end,
    latest_item_level_total =
      coalesce(case when v_mode = 'PVE' then v_item else public.character_master.latest_pve_item_level end, 0)
      + coalesce(case when v_mode = 'PVP' then v_item else public.character_master.latest_pvp_item_level end, 0),
    latest_power_total =
      coalesce(case when v_mode = 'PVE' then v_power else public.character_master.latest_pve_combat_power end, 0)
      + coalesce(case when v_mode = 'PVP' then v_power else public.character_master.latest_pvp_combat_power end, 0),
    latest_session_id = excluded.latest_session_id,
    latest_payload_id = excluded.latest_payload_id,
    latest_snapshot_uid = excluded.latest_snapshot_uid,
    latest_payload_hash = excluded.latest_payload_hash,
    last_seen_at = now(),
    last_synced_at = now(),
    sync_status = 'synced'
  returning id into v_character_id;

  insert into public.character_stat_sources (
    character_id, gear_type, item_level, combat_power, payload_id, snapshot_id,
    parser_version, parse_status, evidence, detected_at
  ) values (
    v_character_id,
    v_mode,
    v_item,
    v_power,
    v_payload.id,
    v_snapshot_id,
    public.kinojo_json_text(v_diagnosis, 'parserVersion'),
    'CONFIRMED',
    coalesce(v_diagnosis -> 'gearEvidence', '{}'::jsonb),
    coalesce(v_payload.received_at, now())
  )
  on conflict (character_id, gear_type) do update set
    item_level = excluded.item_level,
    combat_power = excluded.combat_power,
    payload_id = excluded.payload_id,
    snapshot_id = excluded.snapshot_id,
    parser_version = excluded.parser_version,
    parse_status = excluded.parse_status,
    evidence = excluded.evidence,
    detected_at = excluded.detected_at;

  if not exists (
    select 1 from public.character_history h
     where h.session_id = v_payload.session_id
       and coalesce(h.server_id, 2002) = v_server_id
       and h.character_name = v_character_name
       and h.record_type = 'POWER'
  ) then
    insert into public.character_history (
      character_master_id, source_payload_id,
      history_date, character_name, record_type, gear_type,
      pve_item_level, pve_combat_power, pvp_item_level, pvp_combat_power,
      status, session_id, server_id, server_name, updated_at_sheet, memo
    ) values (
      v_character_id, v_payload.id,
      v_history_date,
      v_character_name,
      'POWER',
      v_mode,
      case when v_mode = 'PVE' then v_item end,
      case when v_mode = 'PVE' then v_power end,
      case when v_mode = 'PVP' then v_item end,
      case when v_mode = 'PVP' then v_power end,
      coalesce(public.kinojo_json_text(v_payload.raw_payload, 'status', 'crawlStatus'), 'OK'),
      v_payload.session_id,
      v_server_id,
      coalesce(v_target.server_name, v_payload.server_name, public.kinojo_server_name_by_id(v_server_id)),
      now(),
      '258 Master Sync · ' || v_mode || ' · ' || coalesce(public.kinojo_json_text(v_diagnosis, 'gearReasonCode'), '')
    );
    v_changed := true;
  end if;

  update public.extension_character_payloads
     set intake_status = 'master_synced',
         master_sync_status = 'synced',
         master_sync_message = 'Master Sync 완료 · ' || v_mode,
         master_synced_at = now()
   where id = p_payload_id;

  select to_jsonb(cm), cm.latest_power_total, cm.latest_item_level_total
    into v_after, v_power_total, v_item_total
    from public.character_master cm
   where cm.id = v_character_id;

  insert into public.master_sync_events (
    session_id, payload_id, character_name, main_character_name, event_type, status, message,
    before_data, after_data, raw_payload
  ) values (
    v_payload.session_id,
    v_payload.id,
    v_character_name,
    v_main_name,
    case when v_old is null then 'insert_master' else 'update_master' end,
    'synced',
    'Master Sync 완료 · ' || v_mode,
    coalesce(v_old, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb),
    v_payload.raw_payload || jsonb_build_object('gearDiagnosis', v_diagnosis)
  );

  return jsonb_build_object(
    'ok', true,
    'payloadId', p_payload_id,
    'targetId', v_target.id,
    'listOriginalName', coalesce(v_target.list_original_name, v_target.character_name),
    'serverId', v_server_id,
    'characterName', v_character_name,
    'mainCharacterName', v_main_name,
    'isMain', v_is_main,
    'gearType', v_mode,
    'historyInserted', v_changed,
    'latestPowerTotal', v_power_total,
    'latestItemLevelTotal', v_item_total,
    'diagnosis', v_diagnosis,
    'message', 'Master Sync 완료'
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_growth_review_history(p_history_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current public.character_history%rowtype;
  v_previous public.character_history%rowtype;
  v_master public.character_master%rowtype;
  v_current_gear_type text;
  v_current_power int;
  v_previous_power int;
  v_current_item int;
  v_previous_item int;
  v_power_delta int;
  v_item_delta int;
  v_pve_power_delta int;
  v_pvp_power_delta int;
  v_pve_item_delta int;
  v_pvp_item_delta int;
  v_status text;
  v_label text;
  v_review_text text;
  v_review_id bigint;
begin
  select * into v_current
    from public.character_history
   where id = p_history_id
     and record_type = 'POWER'
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'HISTORY_NOT_FOUND',
      'message', 'POWER 히스토리를 찾을 수 없습니다.',
      'historyId', p_history_id
    );
  end if;

  if v_current.growth_review_id is not null then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'historyId', p_history_id,
      'reviewId', v_current.growth_review_id,
      'message', '이미 성장 리뷰가 생성된 히스토리입니다.'
    );
  end if;

  v_current_gear_type :=
    case
      when upper(coalesce(v_current.gear_type, '')) in ('PVE', 'PVP')
        then upper(v_current.gear_type)
      when v_current.pve_item_level is not null
       and v_current.pve_combat_power is not null
       and v_current.pvp_item_level is null
       and v_current.pvp_combat_power is null
        then 'PVE'
      when v_current.pvp_item_level is not null
       and v_current.pvp_combat_power is not null
       and v_current.pve_item_level is null
       and v_current.pve_combat_power is null
        then 'PVP'
      else 'UNKNOWN'
    end;

  if v_current_gear_type = 'UNKNOWN'
     or coalesce(v_current.status, '') <> 'OK'
     or (
       v_current_gear_type = 'PVE'
       and (
         v_current.pve_item_level is null
         or v_current.pve_combat_power is null
       )
     )
     or (
       v_current_gear_type = 'PVP'
       and (
         v_current.pvp_item_level is null
         or v_current.pvp_combat_power is null
       )
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_GROWTH_HISTORY',
      'message', '성장 리뷰를 생성할 수 있는 정상 PVE/PVP 조회 기록이 아닙니다.',
      'historyId', p_history_id,
      'gearType', v_current_gear_type
    );
  end if;

  if v_current.character_master_id is null then
    return jsonb_build_object('ok',false,'code','HISTORY_IDENTITY_UNVERIFIED','historyId',p_history_id);
  end if;

  select * into v_master
    from public.character_master
   where id = v_current.character_master_id
   limit 1;

  /*
   * 현재 조회일보다 이전인 가장 최근 조회일의 마지막 성공 기록을 선택한다.
   * history_date는 Master Sync 시 Asia/Seoul 기준 YYMMDD로 기록된다.
   */
  select * into v_previous
    from public.character_history h
   where h.record_type = 'POWER'
     and h.status = 'OK'
     and h.character_master_id = v_current.character_master_id
     and h.history_date < v_current.history_date
     and (
       case
         when upper(coalesce(h.gear_type, '')) in ('PVE', 'PVP')
           then upper(h.gear_type)
         when h.pve_item_level is not null
          and h.pve_combat_power is not null
          and h.pvp_item_level is null
          and h.pvp_combat_power is null
           then 'PVE'
         when h.pvp_item_level is not null
          and h.pvp_combat_power is not null
          and h.pve_item_level is null
          and h.pve_combat_power is null
           then 'PVP'
         else 'UNKNOWN'
       end
     ) = v_current_gear_type
     and (
       (
         v_current_gear_type = 'PVE'
         and h.pve_item_level is not null
         and h.pve_combat_power is not null
       )
       or
       (
         v_current_gear_type = 'PVP'
         and h.pvp_item_level is not null
         and h.pvp_combat_power is not null
       )
     )
   order by h.history_date desc, h.created_at desc, h.id desc
   limit 1;

  if v_current_gear_type = 'PVE' then
    v_current_power := v_current.pve_combat_power;
    v_current_item := v_current.pve_item_level;
  else
    v_current_power := v_current.pvp_combat_power;
    v_current_item := v_current.pvp_item_level;
  end if;

  if v_previous.id is null then
    v_previous_power := null;
    v_previous_item := null;
    v_power_delta := null;
    v_item_delta := null;
    v_pve_power_delta := null;
    v_pvp_power_delta := null;
    v_pve_item_delta := null;
    v_pvp_item_delta := null;
  else
    if v_current_gear_type = 'PVE' then
      v_previous_power := v_previous.pve_combat_power;
      v_previous_item := v_previous.pve_item_level;
      v_pve_power_delta := v_current_power - v_previous_power;
      v_pve_item_delta := v_current_item - v_previous_item;
      v_pvp_power_delta := null;
      v_pvp_item_delta := null;
    else
      v_previous_power := v_previous.pvp_combat_power;
      v_previous_item := v_previous.pvp_item_level;
      v_pvp_power_delta := v_current_power - v_previous_power;
      v_pvp_item_delta := v_current_item - v_previous_item;
      v_pve_power_delta := null;
      v_pve_item_delta := null;
    end if;

    v_power_delta := v_current_power - v_previous_power;
    v_item_delta := v_current_item - v_previous_item;
  end if;

  v_status := public.kinojo_growth_status_from_delta(v_previous_power, v_current_power);
  v_label := public.kinojo_growth_label(v_status);
  v_review_text := public.kinojo_growth_review_text(
    v_current.character_name,
    v_status,
    v_power_delta,
    v_item_delta
  );

  insert into public.growth_reviews (
    session_id,
    review_date,
    server_id,
    server_name,
    character_name,
    main_character_name,
    is_main,
    class_name,
    current_history_id,
    previous_history_id,
    current_power_total,
    previous_power_total,
    power_delta,
    current_item_level_total,
    previous_item_level_total,
    item_level_delta,
    pve_power_delta,
    pvp_power_delta,
    pve_item_level_delta,
    pvp_item_level_delta,
    growth_status,
    growth_label,
    review_text,
    raw_current,
    raw_previous
  ) values (
    v_current.session_id,
    coalesce(
      v_current.history_date,
      to_char(now() at time zone 'Asia/Seoul', 'YYMMDD')::int
    ),
    coalesce(v_current.server_id, 2002),
    v_current.server_name,
    v_current.character_name,
    coalesce(v_master.main_character_name, v_current.character_name),
    coalesce(v_master.is_main, false),
    v_master.class_name,
    v_current.id,
    v_previous.id,
    v_current_power,
    v_previous_power,
    v_power_delta,
    v_current_item,
    v_previous_item,
    v_item_delta,
    v_pve_power_delta,
    v_pvp_power_delta,
    v_pve_item_delta,
    v_pvp_item_delta,
    v_status,
    v_label,
    v_review_text,
    to_jsonb(v_current),
    coalesce(to_jsonb(v_previous), '{}'::jsonb)
  )
  on conflict (session_id, server_id, character_name) do update set
    review_date = excluded.review_date,
    server_name = excluded.server_name,
    main_character_name = excluded.main_character_name,
    is_main = excluded.is_main,
    class_name = excluded.class_name,
    current_history_id = excluded.current_history_id,
    previous_history_id = excluded.previous_history_id,
    current_power_total = excluded.current_power_total,
    previous_power_total = excluded.previous_power_total,
    power_delta = excluded.power_delta,
    current_item_level_total = excluded.current_item_level_total,
    previous_item_level_total = excluded.previous_item_level_total,
    item_level_delta = excluded.item_level_delta,
    pve_power_delta = excluded.pve_power_delta,
    pvp_power_delta = excluded.pvp_power_delta,
    pve_item_level_delta = excluded.pve_item_level_delta,
    pvp_item_level_delta = excluded.pvp_item_level_delta,
    growth_status = excluded.growth_status,
    growth_label = excluded.growth_label,
    review_text = excluded.review_text,
    raw_current = excluded.raw_current,
    raw_previous = excluded.raw_previous,
    updated_at = now()
  returning id into v_review_id;

  update public.character_history
     set growth_reviewed_at = now(),
         growth_review_id = v_review_id,
         growth_status = v_status,
         growth_label = v_label,
         power_delta = v_power_delta,
         status = coalesce(status, v_label),
         pve_review_tag = coalesce(pve_review_tag, v_label),
         pvp_review_tag = coalesce(pvp_review_tag, v_label)
   where id = v_current.id;

  update public.extension_character_payloads
     set growth_review_status = 'reviewed',
         growth_review_message = v_label,
         growth_reviewed_at = now()
   where session_id = v_current.session_id
     and coalesce(server_id, 2002) = coalesce(v_current.server_id, 2002)
     and character_name = v_current.character_name;

  return jsonb_build_object(
    'ok', true,
    'historyId', v_current.id,
    'reviewId', v_review_id,
    'characterName', v_current.character_name,
    'gearType', v_current_gear_type,
    'previousHistoryId', v_previous.id,
    'previousHistoryDate', v_previous.history_date,
    'growthStatus', v_status,
    'growthLabel', v_label,
    'powerDelta', v_power_delta,
    'itemLevelDelta', v_item_delta,
    'message', v_review_text
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_ranking_snapshot_scope_payload_v426(p_include_subs boolean, p_include_all_legions boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with params as (
    select
      coalesce(p_include_subs, false)::boolean as include_subs,
      coalesce(p_include_all_legions, false)::boolean as include_all_legions
  ),
  source_all as (
    select
      s.character_id,
      s.server_id,
      s.server_name,
      s.character_name,
      s.main_character_name,
      s.is_main,
      s.class_name,
      s.profile_image_url,
      s.detail_url,
      s.legion_name,
      s.ranking_legion_name,
      s.ranking_owner_character_id,
      s.ranking_owner_character_name,
      s.latest_pve_combat_power as pve_power_total,
      s.latest_pve_item_level as pve_item_level,
      s.latest_pvp_combat_power as pvp_power_total,
      s.latest_pvp_item_level as pvp_item_level,
      s.latest_power_total as power_total,
      s.latest_item_level_total as item_level_total,
      s.last_synced_at as updated_at
    from public.v_kinojo_ranking_character_scope_v296 s, params p
    where (p.include_subs is true or s.is_main is true)
      and (p.include_all_legions is true or s.is_default_ranking_legion is true)
  ),
  history_state as (
    select s.server_id,s.character_name,g.gear_type,
      prev.history_date as previous_history_date,
      case when g.gear_type='PVE' then prev.pve_combat_power else prev.pvp_combat_power end as previous_power,
      case when g.gear_type='PVE' then prev.pve_item_level else prev.pvp_item_level end as previous_item_level
    from source_all s cross join (values('PVE'),('PVP')) g(gear_type)
    left join lateral (
      select h.history_date from public.character_history h
      where h.character_master_id=s.character_id and h.record_type='POWER' and h.status='OK'
        and h.history_date is not null
        and case when g.gear_type='PVE' then h.pve_item_level is not null and h.pve_combat_power is not null
          else h.pvp_item_level is not null and h.pvp_combat_power is not null end
        and (case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end)=g.gear_type
      order by h.history_date desc,h.created_at desc,h.id desc limit 1
    ) latest on true
    left join lateral (
      select h.* from public.character_history h
      where h.character_master_id=s.character_id and h.record_type='POWER' and h.status='OK'
        and case when g.gear_type='PVE' then h.pve_item_level is not null and h.pve_combat_power is not null
          else h.pvp_item_level is not null and h.pvp_combat_power is not null end
        and (case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end)=g.gear_type and h.history_date<latest.history_date
      order by h.history_date desc,h.created_at desc,h.id desc limit 1
    ) prev on true
  ),
  previous_pivot as (
    select
      hs.server_id,
      hs.character_name,
      max(hs.previous_history_date) filter (where hs.gear_type = 'PVE') as previous_pve_date,
      max(hs.previous_power) filter (where hs.gear_type = 'PVE') as previous_pve_power,
      max(hs.previous_item_level) filter (where hs.gear_type = 'PVE') as previous_pve_item,
      max(hs.previous_history_date) filter (where hs.gear_type = 'PVP') as previous_pvp_date,
      max(hs.previous_power) filter (where hs.gear_type = 'PVP') as previous_pvp_power,
      max(hs.previous_item_level) filter (where hs.gear_type = 'PVP') as previous_pvp_item
    from history_state hs
    group by hs.server_id, hs.character_name
  ),
  review_pivot as (
    select
      rr.server_id,
      rr.character_name,
      max(rr.growth_label) filter (where rr.review_mode = 'PVE') as pve_growth_label,
      max(rr.growth_status) filter (where rr.review_mode = 'PVE') as pve_growth_status,
      max(rr.review_text) filter (where rr.review_mode = 'PVE') as pve_review_text,
      max(rr.growth_label) filter (where rr.review_mode = 'PVP') as pvp_growth_label,
      max(rr.growth_status) filter (where rr.review_mode = 'PVP') as pvp_growth_status,
      max(rr.review_text) filter (where rr.review_mode = 'PVP') as pvp_review_text,
      max(rr.source_updated_at) as review_updated_at
    from (
      select distinct on (h.character_master_id,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end))
        s.server_id,s.character_name,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end) as review_mode,
        gr.growth_label,gr.growth_status,gr.review_text,gr.updated_at as source_updated_at
      from public.growth_reviews gr
      join public.character_history h on h.id=gr.current_history_id
      join source_all s on s.character_id=h.character_master_id
      left join public.character_history ph on ph.id=gr.previous_history_id
      where h.character_master_id is not null
        and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      order by h.character_master_id,(case when upper(coalesce(h.gear_type,'')) in ('PVE','PVP') then upper(h.gear_type)
 when h.pve_item_level is not null and h.pve_combat_power is not null and h.pvp_item_level is null and h.pvp_combat_power is null then 'PVE'
 when h.pvp_item_level is not null and h.pvp_combat_power is not null and h.pve_item_level is null and h.pve_combat_power is null then 'PVP' end),gr.created_at desc,gr.id desc
    ) rr
    group by rr.server_id, rr.character_name
  ),
  reactions as (
    select
      rs.character_name,
      coalesce(rs.like_count, 0)::integer as like_count,
      coalesce(rs.dislike_count, 0)::integer as dislike_count,
      coalesce(rs.total_count, 0)::integer as reaction_total,
      rs.comments
    from public.v_reaction_summary rs
  ),
  class_scoped as (
    select
      s.*,
      coalesce(r.like_count, 0)::integer as like_count,
      coalesce(r.dislike_count, 0)::integer as dislike_count,
      coalesce(r.reaction_total, 0)::integer as reaction_total,
      coalesce(r.comments, array[]::text[]) as reaction_comments,
      rp.pve_growth_label, rp.pve_growth_status, rp.pve_review_text,
      rp.pvp_growth_label, rp.pvp_growth_status, rp.pvp_review_text,
      rp.review_updated_at,
      pp.previous_pve_date, pp.previous_pve_power, pp.previous_pve_item,
      pp.previous_pvp_date, pp.previous_pvp_power, pp.previous_pvp_item
    from source_all s
    left join reactions r on r.character_name = s.character_name
    left join review_pivot rp
      on rp.server_id = s.server_id and rp.character_name = s.character_name
    left join previous_pivot pp
      on pp.server_id = s.server_id and pp.character_name = s.character_name
  ),
  previous_pve_ranked as (
    select
      row_number() over (
        order by cs.previous_pve_power desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pve_power, 0) > 0
  ),
  previous_pvp_ranked as (
    select
      row_number() over (
        order by cs.previous_pvp_power desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as previous_rank_no,
      cs.server_id, cs.character_name
    from class_scoped cs
    where coalesce(cs.previous_pvp_power, 0) > 0
  ),
  pve_ranked as (
    select
      row_number() over (
        order by cs.pve_power_total desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as rank_no,
      'PVE'::text as rank_mode,
      coalesce(cs.pve_power_total, 0) as rank_power,
      count(*) over ()::integer as rank_total,
      cs.*,
      ppr.previous_rank_no,
      case
        when ppr.previous_rank_no is null then null
        else ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pve_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer < 0 then 'DOWN'
        else 'SAME'
      end as rank_change_status,
      cs.previous_pve_date as rank_baseline_date,
      case when cs.previous_pve_power is null then null
           else cs.pve_power_total - cs.previous_pve_power end as rank_power_delta,
      case when cs.previous_pve_item is null then null
           else cs.pve_item_level - cs.previous_pve_item end as rank_item_level_delta,
      cs.pve_growth_label as rank_growth_label,
      cs.pve_growth_status as rank_growth_status,
      cs.pve_review_text as rank_review_text
    from class_scoped cs
    left join previous_pve_ranked ppr
      on ppr.server_id = cs.server_id and ppr.character_name = cs.character_name
    where coalesce(cs.pve_power_total, 0) > 0
  ),
  pvp_ranked as (
    select
      row_number() over (
        order by cs.pvp_power_total desc nulls last,
                 cs.is_main desc, cs.character_name asc, cs.server_id asc
      )::integer as rank_no,
      'PVP'::text as rank_mode,
      coalesce(cs.pvp_power_total, 0) as rank_power,
      count(*) over ()::integer as rank_total,
      cs.*,
      ppr.previous_rank_no,
      case
        when ppr.previous_rank_no is null then null
        else ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer
      end as rank_change,
      case
        when ppr.previous_rank_no is null then 'NEW'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer > 0 then 'UP'
        when ppr.previous_rank_no - row_number() over (
          order by cs.pvp_power_total desc nulls last,
                   cs.is_main desc, cs.character_name asc, cs.server_id asc
        )::integer < 0 then 'DOWN'
        else 'SAME'
      end as rank_change_status,
      cs.previous_pvp_date as rank_baseline_date,
      case when cs.previous_pvp_power is null then null
           else cs.pvp_power_total - cs.previous_pvp_power end as rank_power_delta,
      case when cs.previous_pvp_item is null then null
           else cs.pvp_item_level - cs.previous_pvp_item end as rank_item_level_delta,
      cs.pvp_growth_label as rank_growth_label,
      cs.pvp_growth_status as rank_growth_status,
      cs.pvp_review_text as rank_review_text
    from class_scoped cs
    left join previous_pvp_ranked ppr
      on ppr.server_id = cs.server_id and ppr.character_name = cs.character_name
    where coalesce(cs.pvp_power_total, 0) > 0
  ),
  class_counts as (
    select coalesce(jsonb_object_agg(class_name, cnt order by class_name), '{}'::jsonb) counts
    from (
      select coalesce(nullif(s.class_name, ''), '직업 미확인') class_name,
             count(*)::integer cnt
      from source_all s
      group by coalesce(nullif(s.class_name, ''), '직업 미확인')
    ) c
  )
  select jsonb_build_object(
    'ok', true,
    'source', 'snapshot_390_candidate',
    'comparisonRule', 'PREVIOUS_LOOKUP_DAY_LAST_SUCCESS',
    'page', 1,
    'pageSize', greatest(
      (select count(*)::integer from pve_ranked),
      (select count(*)::integer from pvp_ranked),
      1
    ),
    'includeSubs', (select include_subs from params),
    'includeAllLegions', (select include_all_legions from params),
    'defaultLegions', jsonb_build_array('깡','낮','밤','키나노동조합'),
    'className', '전체',
    'search', '',
    'classCounts', (select counts from class_counts),
    'pveTotalCount', (select count(*)::integer from pve_ranked),
    'pvpTotalCount', (select count(*)::integer from pvp_ranked),
    'pveItems', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.rank_no) from pve_ranked x),
      '[]'::jsonb
    ),
    'pvpItems', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.rank_no) from pvp_ranked x),
      '[]'::jsonb
    )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_rebuild_ranking(p_session_id text DEFAULT NULL::text, p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_run_id text := 'rank_' || replace(gen_random_uuid()::text, '-', '');
  v_date int := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD')::int;
  v_limit int := greatest(1, least(coalesce(p_limit, 300), 1000));
  v_total int := 0;
  v_hof_count int := 0;
  v_mvp_count int := 0;
begin
  if p_session_id is not null then
    v_valid := public.kinojo_validate_updater_session(p_session_id, p_session_token);
    if coalesce((v_valid ->> 'ok')::boolean, false) is not true then
      return v_valid;
    end if;

    update public.updater_lock_state
       set status = 'running',
           stage = 'RANKING_REBUILD',
           message = '랭킹/명예의 전당 계산 중',
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where id = 'global';

    update public.updater_sessions
       set status = 'running',
           stage = 'RANKING_REBUILD',
           message = '랭킹/명예의 전당 계산 중',
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where session_id = p_session_id;
  end if;

  insert into public.ranking_runs (
    run_id,
    session_id,
    ranking_date,
    server_id,
    server_name,
    run_type,
    status,
    message
  ) values (
    v_run_id,
    p_session_id,
    v_date,
    2002,
    '지켈',
    case when p_session_id is null then 'FULL' else 'SESSION' end,
    'running',
    '랭킹 계산 시작'
  );

  with latest_reviews as (
    select distinct on (h.character_master_id)
      gr.*, h.character_master_id
    from public.growth_reviews gr
    join public.character_history h on h.id=gr.current_history_id
    left join public.character_history ph on ph.id=gr.previous_history_id
    where h.character_master_id is not null
      and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      and (p_session_id is null or gr.session_id = p_session_id)
    order by h.character_master_id, gr.created_at desc, gr.id desc
  ), ranking_source_raw as (
    select
      coalesce(cm.server_id, 2002) as server_id,
      coalesce(cm.server_name, '지켈') as server_name,
      public.kinojo_hof_clean_character_name(cm.character_name) as character_name,
      coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)) as main_character_name,
      (public.kinojo_hof_clean_character_name(cm.character_name) = coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name))) as is_main,
      cm.class_name,
      cm.profile_image_url,
      cm.detail_url,
      cm.latest_power_total as power_total,
      cm.latest_item_level_total as item_level_total,
      lr.power_delta,
      lr.item_level_delta,
      lr.growth_status,
      lr.growth_label,
      lr.review_text,
      cm.latest_payload_id,
      lr.current_history_id as latest_history_id,
      lr.id as growth_review_id,
      to_jsonb(cm) || jsonb_build_object('growthReview', coalesce(to_jsonb(lr), '{}'::jsonb)) as raw_data
    from public.character_master cm
    left join latest_reviews lr
      on lr.character_master_id = cm.id
    where public.kinojo_hof_clean_character_name(cm.character_name) is not null
      and coalesce(cm.status, 'OK') <> 'DELETED'
      and (p_session_id is null or cm.latest_session_id = p_session_id)
  ), ranking_source as (
    select distinct on (server_id, character_name) *
    from ranking_source_raw
    order by server_id, character_name, is_main desc, power_total desc nulls last, item_level_total desc nulls last
  ), ranked as (
    select
      row_number() over (order by power_total desc nulls last, is_main desc, character_name asc)::int as rank_no,
      count(*) over ()::int as rank_total,
      public.kinojo_rank_tier_for_count(row_number() over (order by power_total desc nulls last, is_main desc, character_name asc)::int, count(*) over ()::int) as rank_tier,
      *
    from ranking_source
    where power_total is not null
  )
  insert into public.ranking_entries (
    run_id,
    session_id,
    ranking_date,
    server_id,
    server_name,
    rank_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    latest_payload_id,
    latest_history_id,
    growth_review_id,
    raw_data
  )
  select
    v_run_id,
    p_session_id,
    v_date,
    server_id,
    server_name,
    'OVERALL',
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    latest_payload_id,
    latest_history_id,
    growth_review_id,
    raw_data
  from ranked
  where rank_no <= v_limit;

  -- Server-first ranking materialization.
  -- 034 is the single source of truth for ranking/order/tier.
  -- GitHub must only render these rows and must not recalculate sort/rank/emblem.
  with latest_reviews as (
    select distinct on (h.character_master_id)
      gr.*, h.character_master_id
    from public.growth_reviews gr
    join public.character_history h on h.id=gr.current_history_id
    left join public.character_history ph on ph.id=gr.previous_history_id
    where h.character_master_id is not null
      and (gr.previous_history_id is null or ph.character_master_id=h.character_master_id)
      and (p_session_id is null or gr.session_id = p_session_id)
    order by h.character_master_id, gr.created_at desc, gr.id desc
  ), base_raw as (
    select
      coalesce(cm.server_id, 2002) as server_id,
      coalesce(cm.server_name, '지켈') as server_name,
      public.kinojo_hof_clean_character_name(cm.character_name) as character_name,
      coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)) as main_character_name,
      coalesce(cm.is_main, public.kinojo_hof_clean_character_name(cm.character_name) = coalesce(public.kinojo_hof_clean_character_name(cm.main_character_name), public.kinojo_hof_clean_character_name(cm.character_name)), false) as is_main,
      cm.class_name,
      cm.profile_image_url,
      cm.detail_url,
      cm.latest_pve_combat_power::int as pve_power,
      cm.latest_pve_item_level::int as pve_item,
      cm.latest_pvp_combat_power::int as pvp_power,
      cm.latest_pvp_item_level::int as pvp_item,
      cm.latest_power_total::int as total_power,
      cm.latest_item_level_total::int as total_item,
      lr.power_delta,
      lr.item_level_delta,
      lr.growth_status,
      lr.growth_label,
      lr.review_text,
      cm.latest_payload_id,
      lr.current_history_id as latest_history_id,
      lr.id as growth_review_id,
      to_jsonb(cm) || jsonb_build_object('growthReview', coalesce(to_jsonb(lr), '{}'::jsonb)) as raw_data
    from public.character_master cm
    left join latest_reviews lr
      on lr.character_master_id = cm.id
    where public.kinojo_hof_clean_character_name(cm.character_name) is not null
      and coalesce(cm.status, 'OK') <> 'DELETED'
      and (p_session_id is null or cm.latest_session_id = p_session_id)
  ), base as (
    select distinct on (server_id, character_name) *
    from base_raw
    order by server_id, character_name, is_main desc, total_power desc nulls last
  ), expanded as (
    select 'PVE_POWER'::text as ranking_type, false::boolean as include_subs, null::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where is_main is true and pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, false::boolean as include_subs, null::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where is_main is true and pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, true::boolean as include_subs, null::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, true::boolean as include_subs, null::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, false::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where is_main is true and pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, false::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where is_main is true and pvp_power is not null
    union all
    select 'PVE_POWER'::text as ranking_type, true::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pve_power as ranking_power, pve_item as ranking_item, * from base where pve_power is not null
    union all
    select 'PVP_POWER'::text as ranking_type, true::boolean as include_subs, coalesce(class_name,'직업 미확인')::text as rank_class, pvp_power as ranking_power, pvp_item as ranking_item, * from base where pvp_power is not null
  ), ranked_server as (
    select
      row_number() over (partition by ranking_type, include_subs, rank_class order by ranking_power desc nulls last, ranking_item desc nulls last, character_name asc)::int as rank_no,
      count(*) over (partition by ranking_type, include_subs, rank_class)::int as rank_total,
      *
    from expanded
  )
  insert into public.ranking_entries (
    run_id, session_id, ranking_date, server_id, server_name, rank_scope, rank_no, rank_total, rank_tier,
    ranking_type, include_subs, rank_class,
    character_name, main_character_name, is_main, class_name, profile_image_url, detail_url,
    power_total, item_level_total, power_delta, item_level_delta, growth_status, growth_label, review_text,
    latest_payload_id, latest_history_id, growth_review_id, raw_data
  )
  select
    v_run_id, p_session_id, v_date, server_id, server_name,
    ranking_type || case when include_subs then '_ALL' else '_MAIN' end || coalesce('_CLASS_' || rank_class, '') as rank_scope,
    rank_no, rank_total, public.kinojo_rank_tier_for_count(rank_no, rank_total),
    ranking_type, include_subs, rank_class,
    character_name, main_character_name, is_main, class_name, profile_image_url, detail_url,
    ranking_power, ranking_item, power_delta, item_level_delta, growth_status, growth_label, review_text,
    latest_payload_id, latest_history_id, growth_review_id,
    raw_data || jsonb_build_object('rankingType', ranking_type, 'includeSubs', include_subs, 'rankClass', rank_class, 'pvePower', pve_power, 'pvpPower', pvp_power, 'pveItemLevel', pve_item, 'pvpItemLevel', pvp_item)
  from ranked_server
  where rank_no <= v_limit;

  select count(*) into v_total
  from public.ranking_entries
  where run_id = v_run_id;


  -- Rebuild current hall across all servers for the latest run.
  -- Do not restrict to the main server; otherwise 타서버 rows from a previous run remain and hit uq_hof_current_scope_character.
  delete from public.hall_of_fame_current where hall_scope = 'OVERALL';

  insert into public.hall_of_fame_current (
    ranking_date,
    server_id,
    server_name,
    hall_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  )
  select
    ranking_date,
    server_id,
    server_name,
    'OVERALL',
    main_rank_no,
    main_rank_total,
    public.kinojo_rank_tier_for_count(main_rank_no, main_rank_total),
    character_name,
    main_character_name,
    is_main,
    class_name,
    profile_image_url,
    detail_url,
    power_total,
    item_level_total,
    power_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  from (
    select
      re.*,
      row_number() over (order by power_total desc nulls last, character_name asc)::int as main_rank_no,
      count(*) over ()::int as main_rank_total
    from public.ranking_entries re
    where run_id = v_run_id
      and rank_scope = 'OVERALL'
      and coalesce(is_main, false) is true
  ) main_ranked
  where main_rank_no <= 100
  order by main_rank_no;

  get diagnostics v_hof_count = row_count;

  -- Rebuild current MVP candidates across all servers for the latest run.
  delete from public.mvp_candidates_current where candidate_scope = 'GROWTH';

  insert into public.mvp_candidates_current (
    ranking_date,
    server_id,
    candidate_scope,
    rank_no,
    rank_total,
    rank_tier,
    character_name,
    main_character_name,
    class_name,
    profile_image_url,
    power_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  )
  select
    ranking_date,
    server_id,
    'GROWTH',
    mvp_rank_no,
    mvp_rank_total,
    public.kinojo_rank_tier_for_count(mvp_rank_no, mvp_rank_total),
    character_name,
    main_character_name,
    class_name,
    profile_image_url,
    power_total,
    power_delta,
    item_level_delta,
    growth_status,
    growth_label,
    review_text,
    run_id,
    session_id
  from (
    select
      re.*,
      row_number() over (order by power_delta desc nulls last, power_total desc nulls last, character_name asc)::int as mvp_rank_no,
      count(*) over ()::int as mvp_rank_total
    from public.ranking_entries re
    where run_id = v_run_id
      and rank_scope = 'OVERALL'
      and coalesce(is_main, false) is true
      and coalesce(power_delta, 0) > 0
  ) mvp_ranked
  where mvp_rank_no <= 20
  order by mvp_rank_no;

  get diagnostics v_mvp_count = row_count;

  update public.ranking_runs
     set status = 'completed',
         total_count = v_total,
         message = '랭킹 계산 완료: ' || v_total || '건, 명예의 전당 ' || v_hof_count || '건, MVP 후보 ' || v_mvp_count || '건'
   where run_id = v_run_id;

  if p_session_id is not null then
    update public.updater_lock_state
       set status = 'running',
           stage = 'RANKING_DONE',
           message = '랭킹/명예의 전당 계산 완료',
           progress_current = greatest(progress_current, progress_total),
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where id = 'global';

    update public.updater_sessions
       set status = 'running',
           stage = 'RANKING_DONE',
           message = '랭킹/명예의 전당 계산 완료',
           progress_current = greatest(progress_current, progress_total),
           last_heartbeat_at = now(),
           expires_at = now() + interval '5 minutes'
     where session_id = p_session_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'runId', v_run_id,
    'sessionId', p_session_id,
    'rankingDate', v_date,
    'rankingCount', v_total,
    'hallOfFameCount', v_hof_count,
    'mvpCandidateCount', v_mvp_count,
    'status', public.kinojo_updater_get_status()
  );
exception when others then
  update public.ranking_runs
     set status = 'failed',
         message = sqlerrm
   where run_id = v_run_id;
  return jsonb_build_object('ok', false, 'code', 'RANKING_REBUILD_EXCEPTION', 'message', sqlerrm, 'runId', v_run_id);
end;
$function$
;
commit;
