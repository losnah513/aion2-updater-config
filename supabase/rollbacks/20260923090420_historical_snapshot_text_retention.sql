-- Stop text removal but retain cached-diagnostic compatibility for archived rows.
-- Restore encrypted raw first before manually removing the compatibility column/functions.
begin;
CREATE OR REPLACE FUNCTION private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 2000)
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
commit;
