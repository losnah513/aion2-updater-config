-- SQL508: bounded historical diagnostic retention. No row deletion or new cron.
-- Current references/recent ten/incomplete work stay protected. Every linked payload must be synced.
begin read write;
set local lock_timeout='2s';
CREATE FUNCTION private.kinojo_snapshot_diagnostic_cache_v508(p_cache jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path TO 'pg_catalog'
AS $function$
declare v_stats jsonb; v_gear jsonb;
begin
 if jsonb_typeof(p_cache) is distinct from 'object' or jsonb_typeof(p_cache->'stats') is distinct from 'object' then return p_cache; end if;
 v_stats := p_cache->'stats';
 v_stats := v_stats-array['equipmentNames','abyssEquipmentNames'];
 if jsonb_typeof(v_stats->'gearEvidence')='object' then
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_gear
  from jsonb_each(v_stats->'gearEvidence') where key=any(array['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount','namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus']);
  v_stats := jsonb_set(v_stats,'{gearEvidence}',v_gear);
 end if;
 return jsonb_set(p_cache,'{stats}',v_stats);
end;$function$;
CREATE FUNCTION private.kinojo_snapshot_diagnostic_candidates_v508(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 2000)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
WITH protected AS MATERIALIZED (
SELECT s.id FROM public.character_master m JOIN public.lookup_snapshots s ON s.snapshot_uid=m.latest_snapshot_uid
UNION SELECT legion_source_snapshot_id FROM public.character_master WHERE legion_source_snapshot_id IS NOT NULL
UNION SELECT snapshot_id FROM public.character_skill_current_state WHERE snapshot_id IS NOT NULL
UNION SELECT snapshot_id FROM public.character_stat_sources WHERE snapshot_id IS NOT NULL
UNION SELECT s.id FROM public.lookup_snapshots s JOIN private.character_snapshot_requests r ON r.snapshot_id::text=s.id::text
UNION SELECT p.source_snapshot_id FROM public.character_master m JOIN public.extension_character_payloads p ON p.id IN (m.latest_payload_id,m.latest_pve_payload_id,m.latest_pvp_payload_id) WHERE p.source_snapshot_id IS NOT NULL
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name ORDER BY created_at DESC FETCH FIRST 10 ROWS WITH TIES) s
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name AND s.status='OK' AND s.raw_payload->'officialRaw' IS NOT NULL ORDER BY created_at DESC FETCH FIRST 10 ROWS WITH TIES) s
),
missing_links AS MATERIALIZED (select distinct session_id from public.extension_character_payloads where source_snapshot_id is null), synced AS MATERIALIZED (
 select source_snapshot_id from public.extension_character_payloads where source_snapshot_id is not null
 group by source_snapshot_id having bool_and(coalesce(master_sync_status='synced',false))
)
select s.id from public.lookup_snapshots s
join public.updater_sessions u on u.session_id=s.session_id and u.status IN ('completed','failed','cancelled','expired','error')
join synced p on p.source_snapshot_id=s.id
where s.id>coalesce(p_after_id,0) and s.status='OK'
 and s.created_at<statement_timestamp()-interval '24 hours'
 and (s.retained_parser_stats_v504 is null or (s.retained_parser_stats_v504->>'characterName'=s.character_name and private.kinojo_snapshot_diagnostic_cache_v508(s.retained_parser_stats_v504) is distinct from s.retained_parser_stats_v504))

 and not exists(select 1 from public.extension_character_payloads p where p.source_snapshot_id=s.id and p.character_name is distinct from s.character_name)
 and not exists(select 1 from missing_links p where p.session_id=s.session_id)
 and not exists(select 1 from protected k where k.id=s.id)
 and not exists(select 1 from public.lookup_session_targets t where t.snapshot_id=s.id and t.target_status is distinct from 'lookup_done')
order by s.id limit greatest(1,least(coalesce(p_limit,2000),5000));
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_character_skill_snapshot_sync_v415()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_character_master_id bigint;
  v_skill_list jsonb;
  v_skills jsonb;
begin
  -- Historical raw removal must not replay current-state observations.
  if tg_op='UPDATE' and new.retained_parser_stats_v504 is not null
     and (old.retained_parser_stats_v504 is null or new.raw_payload is not distinct from old.raw_payload)
     and (to_jsonb(new)-array['raw_payload','retained_parser_stats_v504'])=(to_jsonb(old)-array['raw_payload','retained_parser_stats_v504']) then
    return new;
  end if;

  -- Raw retention must not replay historical skill/legion writes into current state.
  if tg_op='UPDATE' and old.raw_payload ? 'officialRaw'
     and not coalesce(new.raw_payload ? 'officialRaw',false)
     and (to_jsonb(new)-'raw_payload')=(to_jsonb(old)-'raw_payload') then
    return new;
  end if;
  v_skill_list := new.raw_payload #> '{officialRaw,equipment,skill,skillList}';

  if new.status is distinct from 'OK'
     or jsonb_typeof(v_skill_list) is distinct from 'array' then
    return new;
  end if;

  if jsonb_array_length(v_skill_list) = 0 then
    return new;
  end if;

  select cm.id
    into v_character_master_id
    from public.character_master as cm
   where cm.server_id = new.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name) =
         public.kinojo_character_identity_key_v298(new.character_name)
     and coalesce(cm.is_active, true) = true
   order by cm.updated_at desc, cm.id desc
   limit 1;

  if v_character_master_id is null then
    return new;
  end if;

  v_skills := public.kinojo_character_skill_normalize_v415(v_skill_list);

  insert into public.character_skill_current_state (
    character_master_id,
    snapshot_id,
    snapshot_session_id,
    snapshot_refreshed_at,
    snapshot_source_updated_at,
    snapshot_skills,
    updated_at
  )
  values (
    v_character_master_id,
    new.id,
    new.session_id,
    new.created_at,
    new.created_at,
    v_skills,
    clock_timestamp()
  )
  on conflict (character_master_id) do update
     set snapshot_id = excluded.snapshot_id,
         snapshot_session_id = excluded.snapshot_session_id,
         snapshot_refreshed_at = excluded.snapshot_refreshed_at,
         snapshot_source_updated_at = excluded.snapshot_source_updated_at,
         snapshot_skills = excluded.snapshot_skills,
         updated_at = clock_timestamp()
   where excluded.snapshot_id = public.character_skill_current_state.snapshot_id
      or (
        excluded.snapshot_refreshed_at,
        excluded.snapshot_id
      ) > (
        coalesce(public.character_skill_current_state.snapshot_refreshed_at, '-infinity'::timestamptz),
        coalesce(public.character_skill_current_state.snapshot_id, 0)
      );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sync_character_legion_from_snapshot_v296()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_legion text;
begin
  -- Historical raw removal must not replay current-state observations.
  if tg_op='UPDATE' and new.retained_parser_stats_v504 is not null
     and (old.retained_parser_stats_v504 is null or new.raw_payload is not distinct from old.raw_payload)
     and (to_jsonb(new)-array['raw_payload','retained_parser_stats_v504'])=(to_jsonb(old)-array['raw_payload','retained_parser_stats_v504']) then
    return new;
  end if;

  -- Raw retention must not replay historical skill/legion writes into current state.
  if tg_op='UPDATE' and old.raw_payload ? 'officialRaw'
     and not coalesce(new.raw_payload ? 'officialRaw',false)
     and (to_jsonb(new)-'raw_payload')=(to_jsonb(old)-'raw_payload') then
    return new;
  end if;
  if coalesce(new.status, 'OK') <> 'OK' then
    return new;
  end if;

  v_legion := public.kinojo_extract_legion_name(new.raw_payload);
  if v_legion is null then
    return new;
  end if;

  update public.character_master cm
  set legion_name = v_legion,
      legion_updated_at = coalesce(new.created_at, now()),
      legion_source_snapshot_id = new.id
  where cm.server_id = coalesce(new.server_id, cm.server_id)
    and public.kinojo_normalize_character_name(cm.character_name)
      = public.kinojo_normalize_character_name(new.character_name)
    and (cm.legion_source_snapshot_id is null or cm.legion_source_snapshot_id <= new.id);

  return new;
end;
$function$
;
CREATE FUNCTION private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[];v_count integer;
begin
 if not pg_try_advisory_xact_lock(501,501) then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end if;
 begin
  lock table public.lookup_snapshots in share row exclusive mode nowait;
  lock table public.character_master,public.character_skill_current_state,public.character_stat_sources,private.character_snapshot_requests,public.updater_sessions,public.lookup_session_targets,public.extension_character_payloads in share mode nowait;
 exception when lock_not_available then return jsonb_build_object('ok',true,'busy',true,'compacted',0);end;
 select array_agg(s.id) into v_ids from public.lookup_snapshots s join private.kinojo_snapshot_diagnostic_candidates_v508(0,least(50,greatest(1,coalesce(p_limit,50)))) c on c.id=s.id;
 if coalesce(array_length(v_ids,1),0)=0 then return jsonb_build_object('ok',true,'candidates',0,'compacted',0);end if;
 if p_dry_run then return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',0);end if;
 with locked as materialized (select s.* from public.lookup_snapshots s where s.id=any(v_ids) for update skip locked)
 update public.lookup_snapshots s set
  retained_parser_stats_v504=private.kinojo_snapshot_diagnostic_cache_v508(coalesce(x.retained_parser_stats_v504,jsonb_build_object('characterName',x.character_name,'stats',public.kinojo_extract_aion_stats_from_text(public.kinojo_snapshot_parser_text(x.raw_payload),x.character_name,null)))),
  raw_payload=case when x.retained_parser_stats_v504 is null then private.kinojo_snapshot_text_v504(x.raw_payload) else x.raw_payload end
 from locked x where s.id=x.id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'candidates',array_length(v_ids,1),'compacted',v_count);
end;$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 2000)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog' SET statement_timeout TO '15s' SET lock_timeout TO '500ms'
AS $function$select private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run,least(50,p_limit));$function$;
revoke all on function private.kinojo_snapshot_diagnostic_cache_v508(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_snapshot_diagnostic_candidates_v508(bigint,integer) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_snapshot_diagnostic_cleanup_v508(boolean,integer) from public,anon,authenticated,service_role;
commit;
