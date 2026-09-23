CREATE OR REPLACE FUNCTION public.kinojo_updater_build_run_report(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.updater_runtime_jobs%rowtype;
  v_run_date date;
  v_run_no int := 1;
  v_elapsed_seconds int := 0;
  v_extension_version text;
  v_filter_summary text;
  v_filter jsonb := '{}'::jsonb;
  v_details jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_report_id bigint;
  v_total int := 0;
  v_lookup_done int := 0;
  v_changed int := 0;
  v_unchanged int := 0;
  v_no_comparison int := 0;
  v_pve_updated int := 0;
  v_pvp_updated int := 0;
  v_new int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_list_synced int := 0;
begin
  if coalesce(trim(p_session_id), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'MISSING_SESSION_ID', 'message', 'session_id가 필요합니다.');
  end if;

  select * into v_job
  from public.updater_runtime_jobs
  where session_id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUNTIME_JOB_NOT_FOUND', 'message', '조회 Runtime 기록을 찾을 수 없습니다.', 'sessionId', p_session_id);
  end if;

  v_run_date := (coalesce(v_job.finished_at, v_job.updated_at, now()) at time zone 'Asia/Seoul')::date;
  v_elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (coalesce(v_job.finished_at, v_job.updated_at, now()) - coalesce(v_job.started_at, v_job.created_at))))::int
  );

  select count(*)::int + 1 into v_run_no
  from public.updater_runtime_jobs j
  where j.finished_at is not null
    and (j.finished_at at time zone 'Asia/Seoul')::date = v_run_date
    and (coalesce(j.started_at, j.created_at), j.session_id)
        < (coalesce(v_job.started_at, v_job.created_at), v_job.session_id);

  v_extension_version := coalesce(
    public.kinojo_json_text(v_job.raw_payload, 'clientVersion', 'extensionVersion', 'version'),
    public.kinojo_json_text(v_job.summary, 'clientVersion', 'extensionVersion', 'version')
  );
  v_filter_summary := coalesce(
    public.kinojo_json_text(v_job.raw_payload, 'lookupFilterSummary'),
    '전체 조회'
  );
  v_filter := coalesce(v_job.raw_payload -> 'lookupFilter', '{}'::jsonb);

  with item_source as (
    select
      t.id,
      t.lookup_order,
      t.list_row,
      t.server_id,
      coalesce(t.server_name, ecp.server_name, '지켈') as server_name,
      t.character_name,
      coalesce(t.main_character_name, t.character_name) as main_character_name,
      coalesce(t.class_name, ecp.class_name, '') as class_name,
      t.target_status,
      t.existed_in_master,
      t.last_error,
      t.payload_id,
      ecp.gear_type,
      ecp.master_sync_status,
      ecp.master_sync_message,
      mse.event_type,
      mse.status as sync_event_status,
      mse.before_data,
      mse.after_data,
      public.kinojo_json_int(mse.before_data, 'latest_pve_item_level') as before_pve_item_level,
      public.kinojo_json_int(mse.before_data, 'latest_pve_combat_power') as before_pve_combat_power,
      public.kinojo_json_int(mse.before_data, 'latest_pvp_item_level') as before_pvp_item_level,
      public.kinojo_json_int(mse.before_data, 'latest_pvp_combat_power') as before_pvp_combat_power,
      public.kinojo_json_int(mse.after_data, 'latest_pve_item_level') as after_pve_item_level,
      public.kinojo_json_int(mse.after_data, 'latest_pve_combat_power') as after_pve_combat_power,
      public.kinojo_json_int(mse.after_data, 'latest_pvp_item_level') as after_pvp_item_level,
      public.kinojo_json_int(mse.after_data, 'latest_pvp_combat_power') as after_pvp_combat_power
    from public.lookup_session_targets t
    left join public.extension_character_payloads ecp
      on ecp.id = t.payload_id
    left join lateral (
      select m.*
      from public.master_sync_events m
      where m.session_id = t.session_id
        and (
          m.payload_id = t.payload_id
          or (
            m.payload_id is null
            and public.kinojo_normalize_character_name(m.character_name)
                = public.kinojo_normalize_character_name(t.character_name)
          )
        )
      order by m.created_at desc, m.id desc
      limit 1
    ) mse on true
    where t.session_id = p_session_id
  ), classified as (
    select
      s.*,
      (coalesce(s.existed_in_master, false) is false or s.event_type = 'insert_master') as is_new,
      (
        s.target_status = 'lookup_done'
        and coalesce(s.master_sync_status, '') = 'synced'
        and coalesce(s.sync_event_status, 'synced') = 'synced'
        and s.after_data is not null
      ) as sync_ok,
      (
        s.before_data is not null
        and s.before_data <> '{}'::jsonb
        and s.after_data is not null
      ) as has_comparison,
      (
        s.before_pve_item_level is distinct from s.after_pve_item_level
        or s.before_pve_combat_power is distinct from s.after_pve_combat_power
        or s.before_pvp_item_level is distinct from s.after_pvp_item_level
        or s.before_pvp_combat_power is distinct from s.after_pvp_combat_power
      ) as stats_differ,
      case
        when s.target_status not in ('lookup_done', 'skipped') then coalesce(nullif(s.last_error, ''), '조회 미완료: ' || coalesce(s.target_status, 'unknown'))
        when s.target_status = 'lookup_done' and s.payload_id is null then '조회 payload가 없습니다.'
        when s.target_status = 'lookup_done' and coalesce(s.master_sync_status, '') = 'failed' then coalesce(nullif(s.master_sync_message, ''), 'Master Sync 실패')
        else null
      end as failure_reason
    from item_source s
  ), normalized as (
    select
      c.*,
      (c.sync_ok and c.has_comparison and not c.is_new and c.stats_differ) as is_changed,
      (c.sync_ok and c.has_comparison and not c.is_new and not c.stats_differ) as is_unchanged,
      (
        c.target_status = 'lookup_done'
        and not c.is_new
        and c.failure_reason is null
        and (not c.sync_ok or not c.has_comparison)
      ) as is_no_comparison,
      (c.sync_ok and upper(coalesce(c.gear_type, '')) = 'PVE') as is_pve_updated,
      (c.sync_ok and upper(coalesce(c.gear_type, '')) = 'PVP') as is_pvp_updated,
      (c.failure_reason is not null) as is_failed,
      jsonb_strip_nulls(jsonb_build_object(
        'targetId', c.id,
        'lookupOrder', c.lookup_order,
        'listRow', c.list_row,
        'serverId', c.server_id,
        'serverName', c.server_name,
        'characterName', c.character_name,
        'mainCharacterName', c.main_character_name,
        'className', nullif(c.class_name, ''),
        'targetStatus', c.target_status,
        'gearType', nullif(upper(coalesce(c.gear_type, '')), ''),
        'before', jsonb_build_object(
          'pveItemLevel', c.before_pve_item_level,
          'pveCombatPower', c.before_pve_combat_power,
          'pvpItemLevel', c.before_pvp_item_level,
          'pvpCombatPower', c.before_pvp_combat_power
        ),
        'after', jsonb_build_object(
          'pveItemLevel', c.after_pve_item_level,
          'pveCombatPower', c.after_pve_combat_power,
          'pvpItemLevel', c.after_pvp_item_level,
          'pvpCombatPower', c.after_pvp_combat_power
        ),
        'changeSummary', nullif(concat_ws(' · ',
          case when c.before_pve_item_level is distinct from c.after_pve_item_level then 'PVE 아이템레벨 ' || coalesce(c.before_pve_item_level::text, '-') || '→' || coalesce(c.after_pve_item_level::text, '-') end,
          case when c.before_pve_combat_power is distinct from c.after_pve_combat_power then 'PVE 전투력 ' || coalesce(c.before_pve_combat_power::text, '-') || '→' || coalesce(c.after_pve_combat_power::text, '-') end,
          case when c.before_pvp_item_level is distinct from c.after_pvp_item_level then 'PVP 아이템레벨 ' || coalesce(c.before_pvp_item_level::text, '-') || '→' || coalesce(c.after_pvp_item_level::text, '-') end,
          case when c.before_pvp_combat_power is distinct from c.after_pvp_combat_power then 'PVP 전투력 ' || coalesce(c.before_pvp_combat_power::text, '-') || '→' || coalesce(c.after_pvp_combat_power::text, '-') end
        ), ''),
        'reason', c.failure_reason,
        'adminExcluded', c.target_status = 'skipped' and coalesce(c.last_error, '') like 'ADMIN_EXCLUDED:%'
      )) as item_json
    from classified c
  ), aggregated as (
    select
      count(*)::int as total_count,
      count(*) filter(where target_status = 'lookup_done')::int as lookup_done_count,
      count(*) filter(where is_changed)::int as changed_count,
      count(*) filter(where is_unchanged)::int as unchanged_count,
      count(*) filter(where is_no_comparison)::int as no_comparison_count,
      count(*) filter(where is_pve_updated)::int as pve_updated_count,
      count(*) filter(where is_pvp_updated)::int as pvp_updated_count,
      count(*) filter(where is_new and sync_ok)::int as new_count,
      count(*) filter(where is_failed)::int as failed_count,
      count(*) filter(where target_status = 'skipped')::int as skipped_count,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_changed), '[]'::jsonb) as changed_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_unchanged), '[]'::jsonb) as unchanged_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_no_comparison), '[]'::jsonb) as no_comparison_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_pve_updated), '[]'::jsonb) as pve_updated_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_pvp_updated), '[]'::jsonb) as pvp_updated_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_new and sync_ok), '[]'::jsonb) as new_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where is_failed), '[]'::jsonb) as failed_items,
      coalesce(jsonb_agg(item_json order by lookup_order) filter(where target_status = 'skipped'), '[]'::jsonb) as skipped_items
    from normalized
  )
  select
    a.total_count,
    a.lookup_done_count,
    a.changed_count,
    a.unchanged_count,
    a.no_comparison_count,
    a.pve_updated_count,
    a.pvp_updated_count,
    a.new_count,
    a.failed_count,
    a.skipped_count,
    jsonb_build_object(
      'changedItems', a.changed_items,
      'unchangedItems', a.unchanged_items,
      'noComparisonItems', a.no_comparison_items,
      'pveUpdatedItems', a.pve_updated_items,
      'pvpUpdatedItems', a.pvp_updated_items,
      'newItems', a.new_items,
      'failedItems', a.failed_items,
      'skippedItems', a.skipped_items
    )
  into
    v_total,
    v_lookup_done,
    v_changed,
    v_unchanged,
    v_no_comparison,
    v_pve_updated,
    v_pvp_updated,
    v_new,
    v_failed,
    v_skipped,
    v_details
  from aggregated a;

  select count(*)::int into v_list_synced
  from public.google_list_sheet_sync_queue q
  where q.session_id = p_session_id
    and q.sync_status = 'synced';

  v_counts := jsonb_build_object(
    'total', coalesce(v_total, 0),
    'lookupDone', coalesce(v_lookup_done, 0),
    'changed', coalesce(v_changed, 0),
    'unchanged', coalesce(v_unchanged, 0),
    'noComparison', coalesce(v_no_comparison, 0),
    'pveUpdated', coalesce(v_pve_updated, 0),
    'pvpUpdated', coalesce(v_pvp_updated, 0),
    'new', coalesce(v_new, 0),
    'failed', coalesce(v_failed, 0),
    'skipped', coalesce(v_skipped, 0),
    'listSynced', coalesce(v_list_synced, 0)
  );

  v_summary := jsonb_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'runDate', v_run_date::text,
    'runNo', v_run_no,
    'displayLabel', to_char(v_run_date, 'YYYY-MM-DD') || ' ' || v_run_no::text || '차 조회',
    'status', coalesce(v_job.status, 'completed'),
    'requestedBy', v_job.requested_by_character,
    'requestedRole', v_job.requested_by_role,
    'startedAt', v_job.started_at,
    'finishedAt', coalesce(v_job.finished_at, v_job.updated_at),
    'elapsedSeconds', v_elapsed_seconds,
    'extensionVersion', v_extension_version,
    'lookupFilterSummary', v_filter_summary,
    'lookupFilter', v_filter,
    'counts', v_counts
  );

  insert into public.updater_run_reports (
    session_id, job_id, run_date, run_no, status,
    requested_by_character, requested_by_role,
    extension_version, lookup_filter_summary, lookup_filter,
    started_at, finished_at, elapsed_seconds,
    total_count, lookup_done_count, changed_count, unchanged_count, no_comparison_count,
    pve_updated_count, pvp_updated_count, new_count, failed_count, skipped_count, list_synced_count,
    summary, details
  ) values (
    p_session_id, v_job.job_id, v_run_date, v_run_no, coalesce(v_job.status, 'completed'),
    v_job.requested_by_character, v_job.requested_by_role,
    v_extension_version, v_filter_summary, v_filter,
    v_job.started_at, coalesce(v_job.finished_at, v_job.updated_at), v_elapsed_seconds,
    coalesce(v_total, 0), coalesce(v_lookup_done, 0), coalesce(v_changed, 0), coalesce(v_unchanged, 0), coalesce(v_no_comparison, 0),
    coalesce(v_pve_updated, 0), coalesce(v_pvp_updated, 0), coalesce(v_new, 0), coalesce(v_failed, 0), coalesce(v_skipped, 0), coalesce(v_list_synced, 0),
    v_summary, coalesce(v_details, '{}'::jsonb)
  )
  on conflict(session_id) do update set
    job_id = excluded.job_id,
    run_date = excluded.run_date,
    run_no = excluded.run_no,
    status = excluded.status,
    requested_by_character = excluded.requested_by_character,
    requested_by_role = excluded.requested_by_role,
    extension_version = excluded.extension_version,
    lookup_filter_summary = excluded.lookup_filter_summary,
    lookup_filter = excluded.lookup_filter,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    elapsed_seconds = excluded.elapsed_seconds,
    total_count = excluded.total_count,
    lookup_done_count = excluded.lookup_done_count,
    changed_count = excluded.changed_count,
    unchanged_count = excluded.unchanged_count,
    no_comparison_count = excluded.no_comparison_count,
    pve_updated_count = excluded.pve_updated_count,
    pvp_updated_count = excluded.pvp_updated_count,
    new_count = excluded.new_count,
    failed_count = excluded.failed_count,
    skipped_count = excluded.skipped_count,
    list_synced_count = excluded.list_synced_count,
    summary = excluded.summary,
    details = excluded.details,
    updated_at = now()
  returning id into v_report_id;

  return v_summary || jsonb_build_object(
    'reportId', v_report_id,
    'details', coalesce(v_details, '{}'::jsonb)
  );
end;
$function$;
