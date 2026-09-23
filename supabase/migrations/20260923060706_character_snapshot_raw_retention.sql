-- SQL501: bound full historical detail; preserve current consumers and original parser inputs.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='60s';
CREATE INDEX idx_lookup_snapshot_uid_v501 ON public.lookup_snapshots(snapshot_uid) WHERE snapshot_uid IS NOT NULL;
CREATE INDEX idx_lookup_snapshot_recent_v501 ON public.lookup_snapshots(server_id,character_name,created_at DESC,id DESC);
CREATE INDEX idx_lookup_snapshot_official_recent_v501 ON public.lookup_snapshots(server_id,character_name,created_at DESC,id DESC)
 WHERE status='OK' AND raw_payload->'officialRaw' IS NOT NULL;
CREATE INDEX idx_lookup_snapshot_official_due_v501 ON public.lookup_snapshots(id)
 WHERE status='OK' AND raw_payload->'officialRaw' IS NOT NULL;
CREATE FUNCTION private.kinojo_snapshot_raw_v501(p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SET search_path TO 'pg_catalog'
AS $function$
declare v_out jsonb; k record; v_before text;
begin
 if jsonb_typeof(p_raw)<>'object' or not p_raw ? 'officialRaw' then return p_raw; end if;
 v_out := p_raw - 'officialRaw';
 -- Preserve the existing recursive audit's scalar observations before discarding the detailed object.
 for k in select keys from (values
 (array['characterName','character_name','officialName','official_name']),
 (array['serverId','server_id']),
 (array['className','class_name']),
 (array['charKey','char_key']),
 (array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']),
 (array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level'])
 ) groups(keys) loop
  v_before := private.kinojo_json_find_text_v321(p_raw,k.keys);
  if v_before is distinct from private.kinojo_json_find_text_v321(v_out,k.keys) then
   v_out := jsonb_set(v_out,array[k.keys[1]],to_jsonb(coalesce(v_before,'')),true);
  end if;
 end loop;
 -- Nonstandard nested aliases must never silently change the audit contract.
 for k in select keys from (values
 (array['characterName','character_name','officialName','official_name']),
 (array['serverId','server_id']),
 (array['className','class_name']),
 (array['charKey','char_key']),
 (array['combatPower','combat_power','pveCombatPower','pve_combat_power','pvpCombatPower','pvp_combat_power']),
 (array['itemLevel','item_level','pveItemLevel','pve_item_level','pvpItemLevel','pvp_item_level'])
 ) groups(keys) loop
  if private.kinojo_json_find_text_v321(p_raw,k.keys) is distinct from private.kinojo_json_find_text_v321(v_out,k.keys) then return p_raw; end if;
 end loop;
 return v_out;
end;
$function$;
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
CREATE FUNCTION private.kinojo_snapshot_raw_candidates_v501(p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 2000)
RETURNS TABLE(id bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
WITH protected AS MATERIALIZED (
SELECT s.id FROM public.character_master m JOIN public.lookup_snapshots s ON s.snapshot_uid=m.latest_snapshot_uid
UNION SELECT legion_source_snapshot_id FROM public.character_master WHERE legion_source_snapshot_id IS NOT NULL
UNION SELECT snapshot_id FROM public.character_skill_current_state WHERE snapshot_id IS NOT NULL
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name ORDER BY created_at DESC,id DESC LIMIT 10) s
UNION SELECT s.id FROM public.character_master m CROSS JOIN LATERAL (SELECT id FROM public.lookup_snapshots s WHERE s.server_id=m.server_id AND s.character_name=m.character_name AND s.status='OK' AND s.raw_payload->'officialRaw' IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 10) s
),
synced AS MATERIALIZED (
 select source_snapshot_id from public.extension_character_payloads where source_snapshot_id is not null
 group by source_snapshot_id having bool_and(coalesce(master_sync_status='synced',false))
)
select s.id from public.lookup_snapshots s
join public.updater_sessions u on u.session_id=s.session_id and u.status='completed'
join synced p on p.source_snapshot_id=s.id
where s.id>coalesce(p_after_id,0) and s.status='OK'
 and s.created_at<statement_timestamp()-interval '24 hours'
 and s.raw_payload->'officialRaw' is not null
 and not exists(select 1 from protected k where k.id=s.id)
 and not exists(select 1 from public.lookup_session_targets t where t.snapshot_id=s.id and t.target_status is distinct from 'lookup_done')
order by s.id limit greatest(1,least(coalesce(p_limit,2000),5000));
$function$;
CREATE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 2000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
SET statement_timeout TO '15s' SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[]; v_count integer:=0;
begin
 if not pg_try_advisory_xact_lock(501,501) then return jsonb_build_object('ok',true,'busy',true,'compacted',0); end if;
 begin
  lock table public.character_master,public.character_skill_current_state,public.updater_sessions,
   public.lookup_session_targets,public.extension_character_payloads in share mode nowait;
 exception when lock_not_available then
  return jsonb_build_object('ok',true,'busy',true,'compacted',0);
 end;
 select coalesce(array_agg(d.id),'{}'::bigint[]) into v_ids from (
  select s.id from public.lookup_snapshots s
  join private.kinojo_snapshot_raw_candidates_v501(0,p_limit) c on c.id=s.id
  for update of s skip locked
 ) d;
 if coalesce(p_dry_run,true) is false then
  update public.lookup_snapshots s set raw_payload=private.kinojo_snapshot_raw_v501(s.raw_payload)
  where s.id=any(v_ids) and s.raw_payload is distinct from private.kinojo_snapshot_raw_v501(s.raw_payload);
  get diagnostics v_count=row_count;
 end if;
 return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),'candidates',cardinality(v_ids),'compacted',v_count,
  'retentionHours',24,'preservesCurrentDetail',true,'preservesParserInput',true);
end;
$function$;
REVOKE ALL ON FUNCTION private.kinojo_snapshot_raw_v501(jsonb),private.kinojo_snapshot_raw_candidates_v501(bigint,integer),private.kinojo_snapshot_raw_cleanup_v501(boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
-- Daily 06:40 KST; <=2000 rows, above the current 4 x 191 daily intake.
select cron.schedule('kinojo-snapshot-raw-retention-v501','40 21 * * *','set statement_timeout=''15s''; select private.kinojo_snapshot_raw_cleanup_v501(false,2000);');
commit;
