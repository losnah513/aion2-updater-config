-- SQL547: ranking request IDs are not raw lookup snapshot IDs.
-- Keep all real raw/current/history protections and existing seven-day/30-day policies.
-- Existing dispatcher, generation fence and refresh delay are reused.
CREATE OR REPLACE FUNCTION private.kinojo_payload_seven_day_candidates_v515(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
with eligible as materialized (
  select p.id,p.session_id,p.source_snapshot_id,p.lookup_order
  from public.extension_character_payloads p
  join public.updater_sessions s on s.session_id=p.session_id
  where p.id>coalesce(p_after_id,0)
    and p.received_at<statement_timestamp()-interval '7 days'
    and p.master_sync_status='synced' and p.growth_review_status='reviewed'
    and s.status in ('completed','failed','cancelled','expired','error')
    and s.finished_at<statement_timestamp()-interval '30 days'
), latest as materialized (
  select distinct on (coalesce(e.server_id,2002),
    public.kinojo_normalize_character_name(e.character_name)) e.id
  from public.extension_character_payloads e
  order by coalesce(e.server_id,2002),
    public.kinojo_normalize_character_name(e.character_name),e.received_at desc,e.id desc
), protected as materialized (
  select latest_payload_id id from public.character_master
  union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master
  union select payload_id from public.character_stat_sources
  union select latest_payload_id from public.ranking_entries
  union select payload_id from public.lookup_session_targets
  union select source_payload_id from public.character_history
  union select id from latest
), protected_snapshots as materialized (
  select s.id from public.lookup_snapshots s join public.character_master m on s.snapshot_uid=m.latest_snapshot_uid
  union select legion_source_snapshot_id from public.character_master
  union select snapshot_id from public.character_skill_current_state
  union select snapshot_id from public.character_stat_sources
), protected_sessions as materialized (
  select session_id from public.updater_runtime_jobs
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.lookup_batches
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.google_list_sheet_sync_queue
    where sync_status not in ('synced','obsolete')
)
select p.id from eligible p
where not exists(select 1 from protected k where k.id=p.id)
  and not exists(select 1 from protected_snapshots k where k.id=p.source_snapshot_id)
  and not exists(select 1 from protected_sessions k where k.session_id=p.session_id)
  and not exists(select 1 from public.lookup_session_targets t
    where t.session_id=p.session_id and t.lookup_order=p.lookup_order
      and t.target_status is distinct from 'lookup_done')
order by p.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_payload_seven_day_cleanup_v515(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[];v_deleted integer:=0;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_waived_at is not null) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','deleted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end if;
  begin
    lock table public.extension_character_payloads in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,
      public.lookup_snapshots,public.ranking_entries,public.character_history,
      public.lookup_session_targets,public.updater_sessions,
      public.updater_runtime_jobs,public.lookup_batches,
      public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_payload_seven_day_candidates_v515(0,p_limit) c;
  if coalesce(p_dry_run,true) is false and cardinality(v_ids)>0 then
    delete from public.extension_character_payloads p where p.id=any(v_ids);
    get diagnostics v_deleted=row_count;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'deleted',v_deleted,'retentionDays',7);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_candidates_v514(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
with protected_payloads as materialized (
  select latest_payload_id id from public.character_master
  union select latest_pve_payload_id from public.character_master
  union select latest_pvp_payload_id from public.character_master
  union select payload_id from public.character_stat_sources
  union select latest_payload_id from public.ranking_entries
), protected_snapshots as materialized (
  select s.id from public.lookup_snapshots s join public.character_master m on m.latest_snapshot_uid=s.snapshot_uid
  union select legion_source_snapshot_id from public.character_master
  union select snapshot_id from public.character_skill_current_state
  union select snapshot_id from public.character_stat_sources
  union select p.source_snapshot_id from public.extension_character_payloads p
    where p.master_sync_status is distinct from 'synced'
      or exists(select 1 from protected_payloads k where k.id=p.id)
), protected_sessions as materialized (
  select session_id from public.extension_character_payloads
    where source_snapshot_id is null and master_sync_status is distinct from 'synced'
  union select session_id from public.updater_runtime_jobs
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.lookup_batches
    where coalesce(status,'') not in ('completed','failed','cancelled','expired','error')
  union select session_id from public.google_list_sheet_sync_queue
    where sync_status not in ('synced','obsolete')
), eligible as materialized (
  select s.id from public.lookup_snapshots s
  join public.updater_sessions u on u.session_id=s.session_id
  where s.id>coalesce(p_after_id,0)
    and s.created_at<statement_timestamp()-interval '7 days' and s.status='OK'
    and s.raw_payload is not null
    and s.raw_payload->>'retainedSummaryVersion' is distinct from '514'
    and u.status in ('completed','failed','cancelled','expired','error') and u.finished_at is not null
    and not exists(select 1 from protected_snapshots k where k.id=s.id)
    and not exists(select 1 from protected_sessions k where k.session_id=s.session_id)
    and exists(select 1 from public.lookup_snapshots newer
      where newer.server_id=s.server_id and newer.character_name=s.character_name
        and (newer.created_at,newer.id)>(s.created_at,s.id))
)
select e.id from eligible e
order by e.id limit least(50,greatest(1,coalesce(p_limit,50)));
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v514(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[];v_cached integer:=0;v_compacted integer:=0;v_id bigint;v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled and backup_waived_at is not null) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','compacted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end if;
  begin
    lock table public.lookup_snapshots in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,
      public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,
      public.extension_character_payloads,public.ranking_entries,
      public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'compacted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_snapshot_raw_candidates_v514(0,p_limit) c;
  if coalesce(p_dry_run,true) is false then
    foreach v_id in array v_ids loop
      update public.extension_character_payloads p
      set retained_diagnosis_v512=private.kinojo_payload_diagnosis_summary_v512(p.id)
      from public.lookup_snapshots s
      where s.id=v_id and p.master_sync_status='synced'
        and p.retained_diagnosis_v512 is null
        and (p.source_snapshot_id=v_id or (p.source_snapshot_id is null
          and p.session_id=s.session_id
          and coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
          and public.kinojo_normalize_character_name(p.character_name)
            =public.kinojo_normalize_character_name(s.character_name)));
      get diagnostics v_n=row_count;v_cached:=v_cached+v_n;
      update public.lookup_snapshots s
      set raw_payload=private.kinojo_snapshot_raw_summary_v514(s.raw_payload)
      where s.id=v_id;
      get diagnostics v_n=row_count;v_compacted:=v_compacted+v_n;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'compacted',v_compacted,'cachedPayloads',v_cached,
    'retentionDays',7);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_superseded_snapshot_candidates_v512(p_after_id bigint DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 WITH latest_success AS MATERIALIZED (
  -- Exact snapshot identity and tuple ordering; NULL never matches the original equality/greater-than predicates.
  SELECT DISTINCT ON (server_id,character_name) server_id,character_name,created_at,id
  FROM public.lookup_snapshots
  WHERE status='OK' AND server_id IS NOT NULL AND character_name IS NOT NULL AND created_at IS NOT NULL
  ORDER BY server_id,character_name,created_at DESC,id DESC
 ), protected_payloads AS MATERIALIZED (
  SELECT latest_payload_id id FROM public.character_master
  UNION SELECT latest_pve_payload_id FROM public.character_master
  UNION SELECT latest_pvp_payload_id FROM public.character_master
  UNION SELECT payload_id FROM public.character_stat_sources
  UNION SELECT latest_payload_id FROM public.ranking_entries
 ), protected_snapshots AS MATERIALIZED (
  SELECT legion_source_snapshot_id id FROM public.character_master
  UNION SELECT s.id FROM public.lookup_snapshots s JOIN public.character_master m ON m.latest_snapshot_uid=s.snapshot_uid
  UNION SELECT snapshot_id FROM public.character_skill_current_state
  UNION SELECT snapshot_id FROM public.character_stat_sources
  UNION SELECT snapshot_id FROM public.lookup_session_targets
  UNION SELECT p.source_snapshot_id FROM public.extension_character_payloads p
    WHERE p.master_sync_status IS DISTINCT FROM 'synced'
       OR EXISTS(SELECT 1 FROM protected_payloads x WHERE x.id=p.id)
 ), blocked_sessions AS MATERIALIZED (
  SELECT session_id FROM public.updater_runtime_jobs WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.lookup_batches WHERE coalesce(status,'') NOT IN ('completed','failed','cancelled','expired','error')
  UNION SELECT session_id FROM public.extension_character_payloads WHERE source_snapshot_id IS NULL AND master_sync_status IS DISTINCT FROM 'synced'
  -- Preserve NOT IN's treatment of NULL queue status.
  UNION SELECT session_id FROM public.google_list_sheet_sync_queue WHERE sync_status NOT IN ('synced','obsolete')
 )
 SELECT s.id FROM public.lookup_snapshots s
 JOIN public.updater_sessions u ON u.session_id=s.session_id
 JOIN latest_success newer ON newer.server_id=s.server_id AND newer.character_name=s.character_name
   AND (newer.created_at,newer.id)>(s.created_at,s.id)
 WHERE s.id>coalesce(p_after_id,0)
  AND u.status IN ('completed','failed','cancelled','expired','error') AND u.finished_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM blocked_sessions x WHERE x.session_id=s.session_id)
  AND NOT EXISTS(SELECT 1 FROM protected_snapshots x WHERE x.id=s.id)
 ORDER BY s.id LIMIT least(50,greatest(1,coalesce(p_limit,50)));
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_superseded_snapshot_cleanup_v512(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '500ms'
AS $function$
declare v_ids bigint[]; v_count integer:=0; v_cached integer:=0; v_id bigint; v_n integer;
begin
  if coalesce(p_dry_run,true) is false and not exists(
    select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and enabled
      and (backup_verified_at is not null or backup_waived_at is not null)) then
    return jsonb_build_object('ok',false,'code','RETENTION_NOT_ENABLED','deleted',0);
  end if;
  if not pg_try_advisory_xact_lock(501,501) then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end if;
  begin
    lock table public.lookup_snapshots in share row exclusive mode nowait;
    lock table public.character_master,public.character_skill_current_state,
      public.character_stat_sources,
      public.updater_sessions,public.updater_runtime_jobs,public.lookup_batches,
      public.lookup_session_targets,public.extension_character_payloads,
      public.ranking_entries,public.google_list_sheet_sync_queue in share mode nowait;
  exception when lock_not_available then
    return jsonb_build_object('ok',true,'busy',true,'deleted',0);
  end;
  select coalesce(array_agg(c.id),'{}'::bigint[]) into v_ids
  from private.kinojo_superseded_snapshot_candidates_v512(0,p_limit) c;
  if coalesce(p_dry_run,true) is false and cardinality(v_ids)>0 then
    foreach v_id in array v_ids loop
      update public.extension_character_payloads p
      set retained_diagnosis_v512=coalesce(p.retained_diagnosis_v512,
            private.kinojo_payload_diagnosis_summary_v512(p.id)),
          source_snapshot_id=case when p.source_snapshot_id=v_id then null
            else p.source_snapshot_id end
      from public.lookup_snapshots s
      where s.id=v_id and p.master_sync_status='synced'
        and (p.source_snapshot_id=v_id or (p.source_snapshot_id is null
          and p.session_id=s.session_id
          and coalesce(p.server_id,2002)=coalesce(s.server_id,2002)
          and public.kinojo_normalize_character_name(p.character_name)
            =public.kinojo_normalize_character_name(s.character_name)))
        and (p.source_snapshot_id=v_id or p.retained_diagnosis_v512 is null);
      get diagnostics v_n=row_count; v_cached:=v_cached+v_n;
      delete from public.lookup_snapshots s where s.id=v_id;
      get diagnostics v_n=row_count; v_count:=v_count+v_n;
    end loop;
  end if;
  return jsonb_build_object('ok',true,'dryRun',coalesce(p_dry_run,true),
    'candidates',cardinality(v_ids),'deleted',v_count,'cachedPayloads',v_cached,
    'policy','superseded-by-success-and-unreferenced');
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_roster_family_save_v487(p_actor bigint, p_request_id text, p_main bigint, p_alts bigint[], p_expected jsonb, p_detached bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_ids bigint[]; v_requested bigint[]; v_state jsonb; v_before jsonb:='[]'; v_payload jsonb; v_result jsonb; v_event record;
 v_group jsonb; v_root bigint; v_all bigint[]:='{}'; v_owners bigint[]; v_owner bigint; v_main public.character_master%rowtype;v_relationship_changed boolean;
begin
 if p_request_id is null or p_request_id!~'^[A-Za-z0-9_-]{16,80}$' or p_main is null or p_alts is null
 or p_detached is null or cardinality(p_detached)>99 or cardinality(p_alts)+cardinality(p_detached)>99
 or cardinality(p_alts)>99 or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_expected) not between 1 and 100 then
  return jsonb_build_object('ok',false,'code','FAMILY_INPUT_INVALID','message','연결할 캐릭터를 다시 확인해 주세요.');
 end if;
 v_ids:=array_append(p_alts,p_main); v_requested:=v_ids||p_detached;
 if exists(select 1 from unnest(v_requested) id where id is null or id<1) or (select count(distinct id) from unnest(v_requested) id)<>cardinality(v_requested) then
  return jsonb_build_object('ok',false,'code','FAMILY_DUPLICATE','message','같은 캐릭터를 중복 등록할 수 없습니다.'); end if;
 v_payload:=jsonb_build_object('main',p_main,'alts',to_jsonb(p_alts),'expected',p_expected);
 if cardinality(p_detached)>0 then v_payload:=v_payload||jsonb_build_object('detached',to_jsonb(p_detached)); end if;
 -- Short bounded lock also excludes concurrent worker relationship rewrites and new family members.
 lock table public.character_master in share row exclusive mode;
 select * into v_event from private.roster_family_events_v477 where actor_member_id=p_actor and request_id=p_request_id;
 if found then
  if v_event.request_payload<>v_payload then return jsonb_build_object('ok',false,'code','REQUEST_REUSED','message','요청 정보가 변경되었습니다. 다시 불러와 주세요.'); end if;
  return v_event.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.character_master c where c.id=any(v_requested) and (not coalesce(c.is_active,true) or coalesce(c.status,'OK')='DELETED' or coalesce(c.visibility_excluded,false))) then
  return jsonb_build_object('ok',false,'code','FAMILY_UNAVAILABLE','message','비활성 캐릭터가 포함되어 있습니다. 다시 불러와 주세요.'); end if;
 for v_group in select value from jsonb_array_elements(p_expected) loop
  if coalesce(v_group->>'rootId','')!~'^[1-9][0-9]{0,17}$' then return jsonb_build_object('ok',false,'code','FAMILY_INPUT_INVALID','message','다시 불러와 주세요.'); end if;
  v_root:=(v_group->>'rootId')::bigint;
  v_state:=private.kinojo_roster_family_state_v477(v_root);
  if v_state is null or v_state->>'revision' is distinct from v_group->>'revision' then
   return jsonb_build_object('ok',false,'code','FAMILY_CONFLICT','message','캐릭터 관계가 변경되었습니다. 닫은 뒤 다시 불러와 주세요.'); end if;
  v_before:=v_before||jsonb_build_array(v_state);
  v_all:=v_all||array(select (value->>'characterId')::bigint from jsonb_array_elements(v_state->'items'));
 end loop;
 if (select array_agg(id order by id) from unnest(v_all) id) is distinct from (select array_agg(id order by id) from unnest(v_requested) id) then
  return jsonb_build_object('ok',false,'code','FAMILY_INCOMPLETE','message','불러온 캐릭터를 모두 배치하거나 연결 해제를 확인해 주세요.'); end if;
 if exists(select 1 from public.character_master c where c.id=any(v_ids) and (not coalesce(c.is_active,true) or coalesce(c.status,'OK')='DELETED' or coalesce(c.visibility_excluded,false))) then
  return jsonb_build_object('ok',false,'code','FAMILY_UNAVAILABLE','message','비활성 캐릭터가 포함되어 있습니다. 상태를 먼저 확인해 주세요.'); end if;
 -- Detached cards become individual canonical roots; no character records are deleted.
 select * into strict v_main from public.character_master where id=p_main;
 lock table public.member_codes,private.sanctuary_character_owners_v412,private.sanctuary_management_slots_v412 in share row exclusive mode;
 select array_agg(distinct id) into v_owners from (
  select m.id from public.member_codes m join public.character_master c on public.kinojo_character_identity_key_v298(m.main_character_name)=public.kinojo_character_identity_key_v298(c.character_name) where c.id=any(v_ids)
  union select o.owner_member_id from private.sanctuary_character_owners_v412 o where o.character_id=any(v_ids) and o.owner_member_id is not null
 ) owners;
 if cardinality(v_owners)>1 then return jsonb_build_object('ok',false,'code','FAMILY_OWNER_CONFLICT','message','서로 다른 회원 계정에 연결된 캐릭터입니다. 회원 연결을 먼저 확인해 주세요.'); end if;
 v_owner:=v_owners[1];
 if v_owner is not null and exists(select 1 from public.member_codes m join public.character_master c on public.kinojo_character_identity_key_v298(c.character_name)=public.kinojo_character_identity_key_v298(m.main_character_name) where m.id=v_owner and not c.id=any(v_ids)) then
  return jsonb_build_object('ok',false,'code','FAMILY_OWNER_AMBIGUOUS','message','동명이인 회원 연결이 있어 자동 변경할 수 없습니다.'); end if;
 if exists(select 1 from private.sanctuary_management_slots_v412 s where s.character_id=any(v_ids) group by s.force_id having count(*)>1) then
  return jsonb_build_object('ok',false,'code','FAMILY_FORCE_CONFLICT','message','같은 포스에 두 캐릭터가 배치되어 있습니다. 성역 배치를 먼저 정리해 주세요.'); end if;
 select exists(select 1 from public.character_master c where
   (c.id=any(p_detached) and (c.main_character_id is distinct from c.id or c.is_main is distinct from true))
   or (c.id=any(v_ids) and (c.main_character_id is distinct from p_main or c.main_character_name is distinct from v_main.character_name or c.is_main is distinct from (c.id=p_main))))
 into v_relationship_changed;
 insert into private.roster_family_overrides_v477(character_id,main_character_id)
 select id,id from unnest(p_detached) id on conflict(character_id) do update set main_character_id=excluded.main_character_id,updated_at=now();
 update public.character_master set main_character_id=id,main_character_name=character_name,is_main=true where id=any(p_detached);
 update private.sanctuary_character_owners_v412 set root_character_id=character_id,relation=case when owner_member_id is null then 'GUEST' else 'MAIN' end,updated_at=now() where character_id=any(p_detached);
 update private.sanctuary_management_slots_v412 set owner_root_character_id=character_id,character_relation='MAIN',revision=revision+1 where character_id=any(p_detached);
 insert into private.roster_family_overrides_v477(character_id,main_character_id)
 select id,p_main from unnest(v_ids) id on conflict(character_id) do update set main_character_id=excluded.main_character_id,updated_at=now();
 update public.character_master set main_character_id=p_main,main_character_name=v_main.character_name,is_main=id=p_main where id=any(v_ids);
 if v_owner is not null then update public.member_codes set main_character_name=v_main.character_name where id=v_owner; end if;
 update private.sanctuary_character_owners_v412 set root_character_id=p_main,relation=case when owner_member_id is null then 'GUEST' when character_id=p_main then 'MAIN' else 'ALT' end,updated_at=now() where character_id=any(v_ids);
 update private.sanctuary_management_slots_v412 set owner_root_character_id=p_main,character_relation=case when character_id=p_main then 'MAIN' else 'ALT' end,revision=revision+1 where character_id=any(v_ids);
 if v_relationship_changed then
  -- The generation write serializes relation commit with final publication.
  update private.character_snapshot_dispatch set generation=generation+1 where singleton;
  insert into private.character_snapshot_requests(session_id,due_at)
  values('family:'||p_actor::text||':'||p_request_id,clock_timestamp())
  on conflict(session_id) do nothing;
 end if;
 v_result:=jsonb_build_object('ok',true,'family',private.kinojo_roster_family_state_v477(p_main),'detachedCharacterIds',to_jsonb(p_detached),'rankingRefreshQueued',v_relationship_changed);
 insert into private.roster_family_events_v477(actor_member_id,request_id,request_payload,before_state,result) values(p_actor,p_request_id,v_payload,v_before,v_result);
 return v_result;
end $function$
;
