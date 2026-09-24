-- SQL509: retain report diagnostics, not historical equipment detail.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
-- Supports both the successful-link and any-pending-link protection probes.
create index idx_lookup_target_payload_v509 on public.lookup_session_targets(payload_id);

create function private.kinojo_payload_evidence_v509(p_evidence jsonb)
returns jsonb language sql immutable set search_path to 'pg_catalog'
as $function$
 select case when jsonb_typeof(p_evidence)='object' then
  coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_evidence)
   where key=any(array['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount',
    'namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'])),'{}'::jsonb)
 else p_evidence end;
$function$;

create function private.kinojo_payload_evidence_candidates_v509(p_after bigint default 0,p_limit integer default 50)
returns table(id bigint) language sql stable set search_path to 'pg_catalog'
as $function$
 with latest as materialized (
  -- Exactly the ordering and identity used by reprocess_latest_character_lookup.
  select distinct on (coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name)) e.id
  from public.extension_character_payloads e
  order by coalesce(e.server_id,2002),public.kinojo_normalize_character_name(e.character_name),e.received_at desc,e.id desc
 ), protected as materialized (
  select latest_payload_id id from public.character_master union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master union select payload_id from public.character_stat_sources
  union select id from latest
 )
 select p.id from public.extension_character_payloads p
 where p.id>coalesce(p_after,0) and p.master_sync_status='synced'
 and p.received_at<now()-interval '24 hours'
 and jsonb_typeof(p.gear_evidence)='object'
 and p.gear_evidence is distinct from private.kinojo_payload_evidence_v509(p.gear_evidence)
 and not exists(select 1 from protected x where x.id=p.id)
 and exists(select 1 from public.updater_sessions s where s.session_id=p.session_id
   and s.status in ('completed','failed','cancelled','expired','error'))
 and not exists(select 1 from public.updater_runtime_jobs j where j.session_id=p.session_id
   and coalesce(j.status,'') not in ('completed','failed','cancelled','expired','error'))
 and exists(select 1 from public.lookup_session_targets t where t.payload_id=p.id and t.session_id=p.session_id
   and t.server_id is not distinct from p.server_id
   and public.kinojo_normalize_character_name(t.character_name)=public.kinojo_normalize_character_name(p.character_name)
   and t.target_status='lookup_done')
 and not exists(select 1 from public.lookup_session_targets t where
   (t.payload_id=p.id or (t.session_id=p.session_id and t.lookup_order=p.lookup_order))
   and t.target_status is distinct from 'lookup_done')
 order by p.id limit least(5000,greatest(1,coalesce(p_limit,50)));
$function$;

create function private.kinojo_payload_evidence_cleanup_v509(p_dry_run boolean default true,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms'
as $function$
declare v_ids bigint[];v_count integer;
begin
 if not pg_try_advisory_xact_lock(501,501) then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end if;
 begin
  lock table public.extension_character_payloads in share row exclusive mode nowait;
  lock table public.character_master,public.character_stat_sources,public.updater_sessions,
   public.updater_runtime_jobs,public.lookup_session_targets in share mode nowait;
 exception when lock_not_available then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end;
 select array_agg(c.id) into v_ids from private.kinojo_payload_evidence_candidates_v509(0,least(50,greatest(1,coalesce(p_limit,50)))) c;
 if coalesce(array_length(v_ids,1),0)=0 then return jsonb_build_object('ok',true,'candidates',0,'compacted',0);end if;
 if p_dry_run then return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',0);end if;
 with locked as materialized(select p.id from public.extension_character_payloads p where p.id=any(v_ids) for update skip locked)
 update public.extension_character_payloads p set gear_evidence=private.kinojo_payload_evidence_v509(p.gear_evidence)
 from locked x where p.id=x.id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',v_count);
end;$function$;

-- Share the existing 50-row / 15-second job; no additional cron or public API.
create or replace function private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean default true,p_limit integer default 2000)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
set statement_timeout to '15s' set lock_timeout to '500ms'
as $function$
declare v_budget integer:=least(50,greatest(1,coalesce(p_limit,50)));v_snapshot jsonb;v_payload jsonb;
begin
 v_snapshot:=private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run,greatest(1,v_budget/2));
 if v_budget>1 then v_payload:=private.kinojo_payload_evidence_cleanup_v509(p_dry_run,v_budget-greatest(1,v_budget/2));end if;
 return v_snapshot||jsonb_build_object('payload',v_payload);
end;$function$;
revoke all on function private.kinojo_payload_evidence_v509(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_payload_evidence_candidates_v509(bigint,integer) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_payload_evidence_cleanup_v509(boolean,integer) from public,anon,authenticated,service_role;
commit;
