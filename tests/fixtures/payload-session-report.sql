CREATE OR REPLACE FUNCTION public.kinojo_lookup_session_detail_report(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valid jsonb;
  v_session jsonb := '{}'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_prepare_detail jsonb := '{}'::jsonb;
begin
  v_valid := public.kinojo_validate_updater_session(p_session_id, p_session_token);
  if coalesce((v_valid ->> 'ok')::boolean, false) is not true then
    return v_valid;
  end if;

  -- 현재 런타임 Job을 우선하여 과거 updater_sessions의 running 잔존값을 보정한다.
  select coalesce(to_jsonb(s) - 'session_token', '{}'::jsonb)
         || jsonb_strip_nulls(jsonb_build_object(
           'status', j.status,
           'stage', j.current_stage,
           'message', j.message,
           'progress_current', j.progress_current,
           'progress_total', j.progress_total,
           'started_at', j.started_at,
           'last_heartbeat_at', j.last_heartbeat_at,
           'finished_at', j.finished_at,
           'updated_at', j.updated_at
         ))
    into v_session
    from public.updater_sessions s
    left join public.updater_runtime_jobs j on j.session_id = s.session_id
   where s.session_id = p_session_id
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'stepKey', st.step_key,
    'stepOrder', st.step_order,
    'status', st.status,
    'progressCurrent', st.progress_current,
    'progressTotal', st.progress_total,
    'message', st.message,
    'detail', st.detail,
    'startedAt', st.started_at,
    'finishedAt', st.finished_at,
    'updatedAt', st.updated_at
  ) order by st.step_order, st.id), '[]'::jsonb)
  into v_steps
  from public.lookup_session_steps st
  where st.session_id = p_session_id;

  select coalesce(st.detail, '{}'::jsonb)
    into v_prepare_detail
    from public.lookup_session_steps st
   where st.session_id = p_session_id
     and st.step_key = 'LIST_MASTER_COMPARE'
   order by st.updated_at desc, st.id desc
   limit 1;

  with target_rows as (
    select
      t.*,
      p.id as payload_join_id,
      p.gear_type,
      p.gear_parse_status,
      p.gear_evidence,
      p.parsed_item_level,
      p.parsed_combat_power,
      p.pve_item_level,
      p.pve_combat_power,
      p.pvp_item_level,
      p.pvp_combat_power,
      p.master_sync_status,
      p.master_sync_message,
      p.received_at as payload_received_at,
      cm.id as master_id,
      cm.latest_payload_id as master_latest_payload_id,
      cm.latest_pve_item_level as master_pve_item_level,
      cm.latest_pve_combat_power as master_pve_combat_power,
      cm.latest_pvp_item_level as master_pvp_item_level,
      cm.latest_pvp_combat_power as master_pvp_combat_power,
      q.id as sheet_queue_id,
      q.sync_status as sheet_sync_status,
      q.error_message as sheet_error_message,
      q.updated_at as sheet_updated_at
    from public.lookup_session_targets t
    left join public.extension_character_payloads p on p.id = t.payload_id
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
    left join lateral (
      select q.*
        from public.google_list_sheet_sync_queue q
       where q.session_id = t.session_id
         and q.server_id = t.server_id
         and public.kinojo_character_identity_key_v298(q.character_name)
             = public.kinojo_character_identity_key_v298(t.character_name)
       order by q.updated_at desc nulls last, q.id desc
       limit 1
    ) q on true
    where t.session_id = p_session_id
  ), normalized as (
    select
      r.*,
      coalesce(r.gear_evidence ->> 'gearReasonCode', '') as gear_reason_code,
      coalesce(public.kinojo_json_int(r.gear_evidence, 'visibleEquipmentSlotCount'), 0) as visible_slot_count,
      coalesce(public.kinojo_json_int(r.gear_evidence, 'populatedEquipmentSlotCount', 'namedEquipmentSlotCount'), 0) as populated_slot_count,
      coalesce(public.kinojo_json_int(r.gear_evidence, 'abyssEquipmentSlotCount'), 0) as abyss_slot_count,
      (coalesce(r.master_sync_status, '') = 'synced' and r.master_latest_payload_id = r.payload_join_id) as master_applied,
      case
        when r.target_status = 'skipped' then 'SKIPPED'
        when r.target_status in ('failed','error','missing','final_failed') then 'LOOKUP_FAILED'
        when r.payload_join_id is null then 'PAYLOAD_MISSING'
        when upper(coalesce(r.gear_type, 'UNKNOWN')) not in ('PVE','PVP') then 'GEAR_UNRESOLVED'
        when coalesce(r.master_sync_status, '') not in ('', 'synced') then 'MASTER_FAILED'
        when r.master_latest_payload_id is distinct from r.payload_join_id and coalesce(r.master_sync_status, '') = 'synced' then 'MASTER_VERIFY_FAILED'
        when coalesce(r.sheet_sync_status, '') in ('failed','error') then 'LIST_SYNC_FAILED'
        when coalesce(r.sheet_sync_status, '') in ('synced','done','completed') then 'COMPLETED'
        when coalesce(r.master_sync_status, '') = 'synced' then 'MASTER_SYNCED'
        when r.target_status = 'lookup_done' then 'PAYLOAD_STORED'
        else upper(coalesce(r.target_status, 'QUEUED'))
      end as pipeline_status
    from target_rows r
  )
  select
    jsonb_build_object(
      'targetTotal', count(*)::int,
      'queued', count(*) filter (where target_status in ('queued','claimed','retry_queued'))::int,
      'lookupDone', count(*) filter (where target_status = 'lookup_done')::int,
      'lookupFailed', count(*) filter (where target_status in ('failed','error','missing','final_failed'))::int,
      'finalFailed', count(*) filter (where target_status = 'final_failed')::int,
      'skipped', count(*) filter (where target_status = 'skipped')::int,
      'payloadStored', count(*) filter (where payload_join_id is not null)::int,
      'pve', count(*) filter (where upper(coalesce(gear_type,'')) = 'PVE')::int,
      'pvp', count(*) filter (where upper(coalesce(gear_type,'')) = 'PVP')::int,
      'gearUnknown', count(*) filter (where payload_join_id is not null and upper(coalesce(gear_type,'UNKNOWN')) not in ('PVE','PVP'))::int,
      'masterSynced', count(*) filter (where master_applied)::int,
      'masterFailed', count(*) filter (where payload_join_id is not null and not master_applied and target_status = 'lookup_done')::int,
      'listSynced', count(*) filter (where coalesce(sheet_sync_status,'') in ('synced','done','completed'))::int,
      'listFailed', count(*) filter (where coalesce(sheet_sync_status,'') in ('failed','error'))::int,
      'duplicateListCount', coalesce(public.kinojo_json_int(v_prepare_detail, 'duplicateListCount'), 0),
      'duplicateMasterCount', coalesce(public.kinojo_json_int(v_prepare_detail, 'duplicateMasterCount'), 0)
    ),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'targetId', id,
      'lookupOrder', lookup_order,
      'listRow', list_row,
      'listOriginalName', list_original_name,
      'serverId', server_id,
      'serverName', server_name,
      'characterName', character_name,
      'targetStatus', target_status,
      'targetSource', target_source,
      'lastError', last_error,
      'payloadId', payload_join_id,
      'payloadReceivedAt', payload_received_at,
      'gearType', gear_type,
      'gearParseStatus', gear_parse_status,
      'gearReasonCode', gear_reason_code,
      'visibleEquipmentSlotCount', visible_slot_count,
      'populatedEquipmentSlotCount', populated_slot_count,
      'abyssEquipmentSlotCount', abyss_slot_count,
      'itemLevel', parsed_item_level,
      'combatPower', parsed_combat_power,
      'pveItemLevel', pve_item_level,
      'pveCombatPower', pve_combat_power,
      'pvpItemLevel', pvp_item_level,
      'pvpCombatPower', pvp_combat_power,
      'masterId', master_id,
      'masterSyncStatus', master_sync_status,
      'masterSyncMessage', master_sync_message,
      'masterLatestPayloadId', master_latest_payload_id,
      'masterApplied', master_applied,
      'masterPveItemLevel', master_pve_item_level,
      'masterPveCombatPower', master_pve_combat_power,
      'masterPvpItemLevel', master_pvp_item_level,
      'masterPvpCombatPower', master_pvp_combat_power,
      'sheetQueueId', sheet_queue_id,
      'sheetSyncStatus', sheet_sync_status,
      'sheetErrorMessage', sheet_error_message,
      'sheetUpdatedAt', sheet_updated_at,
      'pipelineStatus', pipeline_status
    )) order by lookup_order, id), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'listOriginalName', coalesce(list_original_name, character_name),
      'serverId', server_id,
      'serverName', server_name,
      'characterName', character_name,
      'pipelineStatus', pipeline_status,
      'targetStatus', target_status,
      'lastError', last_error,
      'gearType', gear_type,
      'gearReasonCode', gear_reason_code,
      'masterSyncStatus', master_sync_status,
      'masterSyncMessage', master_sync_message,
      'sheetSyncStatus', sheet_sync_status,
      'sheetErrorMessage', sheet_error_message
    )) order by lookup_order, id) filter (where pipeline_status in (
      'LOOKUP_FAILED','PAYLOAD_MISSING','GEAR_UNRESOLVED','MASTER_FAILED','MASTER_VERIFY_FAILED','LIST_SYNC_FAILED'
    ) or coalesce(last_error,'') <> ''), '[]'::jsonb)
  into v_counts, v_items, v_issues
  from normalized;

  return jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'generatedAt', now(),
    'session', coalesce(v_session, '{}'::jsonb),
    'prepareDetail', coalesce(v_prepare_detail, '{}'::jsonb),
    'counts', coalesce(v_counts, '{}'::jsonb),
    'steps', coalesce(v_steps, '[]'::jsonb),
    'items', coalesce(v_items, '[]'::jsonb),
    'issues', coalesce(v_issues, '[]'::jsonb)
  );
end;
$function$

