-- SQL543: contain legacy direct-write, definer-view and token-table exposure.
-- No application rows, policies, function bodies, sessions or schedules change.
-- Existing explicit public RPCs keep their authentication and output contracts.
-- Notice/suggestion direct-write compatibility is removed by the next coordinated
-- WEB/RPC patch; do not expand this exception list.
do $surface$
declare r record; a record; v_priv text; v_service text[];
  v_private_tables constant text[] := array[
    'member_codes','code_requests','updater_sessions','extension_sessions',
    'updater_runtime_jobs','updater_runtime_events','updater_lock_state',
    'lookup_batches','lookup_session_targets','lookup_snapshots',
    'extension_character_payloads','master_sync_events','snapshot_intake_events',
    'google_list_sheet_sync_queue','crawl_locks','crawl_status','service_cache',
    'admin_action_logs','operation_logs','kinojo_error_reports',
    'bootstrap_import_events','sheet_import_batches','character_status_history',
    'character_identity_history','character_identity_reviews'
  ];
begin
  if to_regclass('public.character_master') is null
     or to_regclass('public.v_kinojo_admin_members') is null then
    raise exception 'PUBLIC_SURFACE_BASELINE_MISSING';
  end if;
  for r in
    select c.oid,c.relname,c.relkind from pg_class c
    where c.relnamespace='public'::regnamespace
      and c.relkind in ('r','p','v','m')
  loop
    v_service := '{}';
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role',r.oid,v_priv) then
        v_service := array_append(v_service,v_priv);
      end if;
    end loop;
    if r.relkind in ('v','m') or r.relname=any(v_private_tables) then
      execute format('revoke all privileges on table public.%I from public,anon,authenticated',r.relname);
      for a in select attname from pg_attribute where attrelid=r.oid and attnum>0 and not attisdropped and attacl is not null loop
        execute format('revoke all privileges (%I) on table public.%I from public,anon,authenticated',a.attname,r.relname);
      end loop;
    elsif r.relname not in ('announcements','hall_suggestions') then
      execute format('revoke insert,update,delete,truncate,references,trigger on table public.%I from public,anon,authenticated',r.relname);
      for a in select attname from pg_attribute where attrelid=r.oid and attnum>0 and not attisdropped and attacl is not null loop
        execute format('revoke insert (%I),update (%I),references (%I) on table public.%I from public,anon,authenticated',a.attname,a.attname,a.attname,r.relname);
      end loop;
    end if;
    -- Revoking PUBLIC must not silently revoke a previously inherited backend grant.
    if cardinality(v_service)>0 then
      execute format('grant %s on table public.%I to service_role',array_to_string(v_service,','),r.relname);
    end if;
  end loop;
  for r in
    select p.oid,p.oid::regprocedure::text signature,
      has_function_privilege('service_role',p.oid,'execute') service_execute
    from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prokind='f'
      and p.proname in (
        'kinojo_admin_log','kinojo_engine_log_event','kinojo_lookup_step_upsert',
        'kinojo_import_notice_rows','kinojo_import_visit_stats_rows',
        'kinojo_refresh_growth_reviews_from_pool','kinojo_refresh_visit_daily_266',
        'kinojo_pick_review_phrase','kinojo_growth_review_text','kinojo_class_review_text',
        'kinojo_expire_updater_lock'
      )
  loop
    execute format('revoke all privileges on function %s from public,anon,authenticated',r.signature);
    if r.service_execute then execute format('grant execute on function %s to service_role',r.signature); end if;
  end loop;
end;
$surface$;

-- Containment is deliberately not undone automatically: restoring the prior
-- public grants would restore credential/role/queue exposure. Resolve any
-- compatibility issue through the narrow authenticated RPC, not blanket grants.
