CREATE OR REPLACE FUNCTION public.kinojo_fill_extension_payload_gear_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.source_snapshot_id is null then
    begin
      new.source_snapshot_id := nullif(new.raw_payload ->> 'snapshotId', '')::bigint;
    exception when others then
      new.source_snapshot_id := null;
    end;
  end if;

  if nullif(upper(trim(coalesce(new.gear_type, ''))), '') is null then
    new.gear_type := case
      when new.pvp_item_level is not null and new.pvp_combat_power is not null
       and new.pve_item_level is null and new.pve_combat_power is null then 'PVP'
      when new.pve_item_level is not null and new.pve_combat_power is not null
       and new.pvp_item_level is null and new.pvp_combat_power is null then 'PVE'
      else 'UNKNOWN'
    end;
  else
    new.gear_type := upper(trim(new.gear_type));
  end if;

  new.gear_parse_status := coalesce(
    nullif(new.gear_parse_status, ''),
    nullif(new.raw_payload ->> 'gearParseStatus', ''),
    nullif(new.raw_payload ->> 'parseStatus', ''),
    case when new.gear_type in ('PVE', 'PVP') then 'LEGACY_INFERRED' else 'UNKNOWN' end
  );

  new.gear_evidence := coalesce(new.gear_evidence, new.raw_payload -> 'gearEvidence', '{}'::jsonb);
  return new;
end;
$function$
;
CREATE TRIGGER trg_extension_payload_gear_meta BEFORE INSERT OR UPDATE OF pve_item_level, pve_combat_power, pvp_item_level, pvp_combat_power, raw_payload, gear_type ON public.extension_character_payloads FOR EACH ROW EXECUTE FUNCTION kinojo_fill_extension_payload_gear_meta();
CREATE OR REPLACE FUNCTION public.kinojo_official_name_case_sync_v298()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_snapshot jsonb := '{}'::jsonb;
  v_official_name text;
  v_target_id bigint;
  v_old_target_name text;
  v_master_id bigint;
  v_master_is_main boolean := false;
begin
  if new.source_snapshot_id is not null then
    select coalesce(s.raw_payload, '{}'::jsonb) into v_snapshot
    from public.lookup_snapshots s where s.id = new.source_snapshot_id;
  end if;
  v_official_name := public.kinojo_strip_server_suffix(
    public.kinojo_json_text(v_snapshot, 'characterName', 'character_name', 'name'));
  if nullif(trim(coalesce(v_official_name, '')), '') is null then return new; end if;
  if public.kinojo_character_identity_key_v298(v_official_name)
     <> public.kinojo_character_identity_key_v298(new.character_name) then return new; end if;

  new.character_name := v_official_name;
  if public.kinojo_character_identity_key_v298(new.main_character_name)
     = public.kinojo_character_identity_key_v298(v_official_name) then
    new.main_character_name := v_official_name;
  end if;
  new.raw_payload := jsonb_set(coalesce(new.raw_payload, '{}'::jsonb), '{characterName}', to_jsonb(v_official_name), true);

  v_target_id := public.kinojo_json_int(new.raw_payload, 'targetId', 'target_id');
  if v_target_id is not null then
    select t.character_name into v_old_target_name from public.lookup_session_targets t
    where t.id = v_target_id and t.session_id = new.session_id;
    update public.lookup_session_targets t
    set character_name = v_official_name,
        main_character_name = case
          when public.kinojo_character_identity_key_v298(t.main_character_name)
               = public.kinojo_character_identity_key_v298(coalesce(v_old_target_name, v_official_name))
          then v_official_name else t.main_character_name end,
        corrected = corrected or coalesce(t.character_name, '') <> v_official_name,
        updated_at = now()
    where t.id = v_target_id and t.session_id = new.session_id;
  end if;

  select cm.id, coalesce(cm.is_main, false) into v_master_id, v_master_is_main
  from public.character_master cm
  where cm.server_id = new.server_id
    and public.kinojo_character_identity_key_v298(cm.character_name)
        = public.kinojo_character_identity_key_v298(v_official_name)
  order by case when cm.main_character_id = cm.id then 0 else 1 end,
           case when coalesce(cm.is_active, true) then 0 else 1 end,
           cm.updated_at desc nulls last, cm.id
  limit 1;

  if v_master_id is not null then
    update public.character_master cm
    set character_name = v_official_name,
        main_character_name = case when cm.id = cm.main_character_id or coalesce(cm.is_main, false)
          then v_official_name else cm.main_character_name end,
        identity_status = 'CURRENT', identity_verified_at = now(),
        sync_status = case when cm.character_name is distinct from v_official_name
          then 'official_case_canonicalized_v298' else cm.sync_status end,
        updated_at = now()
    where cm.id = v_master_id;

    if v_master_is_main then
      update public.character_master child
      set main_character_id = v_master_id, main_character_name = v_official_name, updated_at = now()
      where child.main_character_id = v_master_id
         or public.kinojo_character_identity_key_v298(child.main_character_name)
            = public.kinojo_character_identity_key_v298(coalesce(v_old_target_name, v_official_name));
      update public.member_codes mc
      set main_character_name = v_official_name, updated_at = now()
      where public.kinojo_character_identity_key_v298(mc.main_character_name)
            = public.kinojo_character_identity_key_v298(coalesce(v_old_target_name, v_official_name));
    end if;
  end if;

  update public.lookup_snapshots s set character_name = v_official_name
  where s.id = new.source_snapshot_id
    and public.kinojo_character_identity_key_v298(s.character_name)
        = public.kinojo_character_identity_key_v298(v_official_name);
  return new;
end;
$function$
;
CREATE TRIGGER trg_kinojo_official_name_case_sync_v298 BEFORE INSERT OR UPDATE OF character_name, source_snapshot_id, raw_payload ON public.extension_character_payloads FOR EACH ROW EXECUTE FUNCTION kinojo_official_name_case_sync_v298();
CREATE OR REPLACE FUNCTION public.kinojo_payload_complete_target_v285()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_id bigint;
  v_target public.lookup_session_targets%rowtype;
begin
  if new.tool_name is distinct from 'KINOJO_SERVER_CHARACTER_QUEUE'
     or new.schema_version is distinct from 'kinojo-crawl-v2' then
    return new;
  end if;

  v_target_id := public.kinojo_json_int(new.raw_payload, 'targetId', 'target_id');

  if v_target_id is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.id = v_target_id
      and t.session_id = new.session_id
    for update;
  end if;

  if v_target.id is null and new.lookup_order is not null then
    select * into v_target
    from public.lookup_session_targets t
    where t.session_id = new.session_id
      and t.lookup_order = new.lookup_order
    order by t.id
    limit 1
    for update;
  end if;

  if v_target.id is null then
    raise exception using
      errcode = '23503',
      message = 'TARGET_IDENTITY_NOT_FOUND',
      detail = 'Payload 저장과 연결할 조회 Target이 없습니다.';
  end if;

  if v_target.server_id is distinct from new.server_id
     or public.kinojo_identity_name_v285(v_target.character_name)
        <> public.kinojo_identity_name_v285(new.character_name) then
    raise exception using
      errcode = '23514',
      message = 'TARGET_IDENTITY_MISMATCH',
      detail = 'Payload와 조회 Target의 서버 또는 캐릭터명이 다릅니다.';
  end if;

  update public.lookup_session_targets
     set target_status = 'lookup_done',
         payload_id = new.id,
         snapshot_id = new.source_snapshot_id,
         looked_up_at = coalesce(looked_up_at, now()),
         claimed_at = null,
         last_error = null,
         last_failure_code = null,
         last_failure_retryable = null,
         final_failed_at = null,
         updated_at = now()
   where id = v_target.id;

  return new;
end;
$function$
;
CREATE TRIGGER trg_payload_complete_target_v285 AFTER INSERT ON public.extension_character_payloads FOR EACH ROW EXECUTE FUNCTION kinojo_payload_complete_target_v285();
CREATE OR REPLACE FUNCTION public.kinojo_payload_identity_guard_v285()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_master public.character_master%rowtype;
  v_conflict public.character_master%rowtype;
begin
  if coalesce(trim(new.character_name), '') = ''
     or new.server_id is null
     or coalesce(trim(new.char_key), '') = '' then
    return new;
  end if;

  select * into v_master
  from public.character_master cm
  where cm.server_id = new.server_id
    and public.kinojo_identity_name_v285(cm.character_name)
        = public.kinojo_identity_name_v285(new.character_name)
  order by
    case when cm.character_name = new.character_name then 0 else 1 end,
    case when coalesce(cm.is_active, true) then 0 else 1 end,
    cm.updated_at desc nulls last,
    cm.id desc
  limit 1;

  if found
     and coalesce(trim(v_master.char_key), '') <> ''
     and trim(v_master.char_key) <> trim(new.char_key) then
    raise exception using
      errcode = '23514',
      message = 'CHAR_KEY_CHANGE_REQUIRES_RECOVERY',
      detail = '기존 character_master 고유키와 다른 Payload 저장을 차단했습니다.';
  end if;

  select * into v_conflict
  from public.character_master cm
  where trim(coalesce(cm.char_key, '')) = trim(new.char_key)
    and public.kinojo_identity_name_v285(cm.character_name)
        <> public.kinojo_identity_name_v285(new.character_name)
    and coalesce(cm.is_active, true) is true
    and coalesce(cm.visibility_excluded, false) is false
  order by cm.updated_at desc nulls last, cm.id desc
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = 'CHAR_KEY_ALREADY_BOUND',
      detail = '동일 고유키가 다른 활성 캐릭터에 연결되어 Payload 저장을 차단했습니다.';
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER trg_payload_identity_guard_v285 BEFORE INSERT OR UPDATE OF server_id, character_name, char_key ON public.extension_character_payloads FOR EACH ROW EXECUTE FUNCTION kinojo_payload_identity_guard_v285();
