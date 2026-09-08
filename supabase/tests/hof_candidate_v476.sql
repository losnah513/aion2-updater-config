-- Execute against DB476. No production data changes survive this test.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '2s';
DO $test$
declare sid bigint; r jsonb; pointer_before bigint; i integer; s record; original jsonb;
  bad jsonb; mutation text; check_count integer:=0;
begin
 select snapshot_id into pointer_before from private.kinojo_ranking_snapshot_pointer_v390 where singleton;
 if exists(select 1 from private.kinojo_ranking_snapshots_v390 where status in ('BUILDING','READY')) then
   raise exception 'CONCURRENT_CANDIDATE_STOP'; end if;
 sid:=private.kinojo_ranking_snapshot_begin_v390('hof476-transaction-test');
 for i in 1..4 loop
   r:=private.kinojo_ranking_snapshot_build_step_v390(sid);
   if r->>'ok'<>'true' then raise exception 'BUILD %: %',i,r; end if;
 end loop;
 r:=private.kinojo_ranking_snapshot_validate_v390(sid);
 if r->>'ok'<>'true' then raise exception 'VALIDATE %',r; end if;
 for s in select * from private.kinojo_ranking_snapshot_scopes_v390 where snapshot_id=sid loop
   if (s.hof_payload->>'hofBuildContract')<>'476' then raise exception 'BUILD_CONTRACT'; end if;
   -- Current eligibility, not a hard-coded character exclusion.
   if exists(
     select 1 from jsonb_array_elements(s.hof_payload->'pveTop'||(s.hof_payload->'pvpTop')) j
     left join public.v_kinojo_ranking_character_scope_v296 c on c.character_id=(j->>'characterId')::bigint
     where c.character_id is null or (not s.include_subs and not c.is_main)
       or (not s.include_all_legions and not c.is_default_ranking_legion)
   ) then raise exception 'MEMBERSHIP_MISMATCH'; end if;
   check_count:=check_count+1;
 end loop;
 if check_count<>4 then raise exception 'SCOPE_COUNT'; end if;
 select hof_payload into original from private.kinojo_ranking_snapshot_scopes_v390
   where snapshot_id=sid and not include_subs and not include_all_legions;
 foreach mutation in array array['score','legion','rank','missing','stale','period','award'] loop
   bad:=case mutation
     when 'score' then jsonb_set(original,'{pveTop,0,pvePower}','-1')
     when 'legion' then jsonb_set(original,'{pveTop,0,legionName}','"OUTSIDE"')
     when 'rank' then jsonb_set(original,'{pveTop,0,rank}','99')
     when 'missing' then jsonb_set(original,'{pveTop}','[]')
     when 'stale' then original-'hofBuildContract'
     when 'period' then jsonb_set(original,'{rankingPeriod,startAt}','"2000-01-01T00:00:00Z"')
     when 'award' then jsonb_set(original,'{weeklyAwards,bulkUp}','[]')
   end;
   -- Ensure award corruption is meaningful even for an empty award.
   if mutation='award' and original#>'{weeklyAwards,bulkUp}'='[]'::jsonb then
     bad:=jsonb_set(original,'{weeklyAwards,bulkUp}','[{"characterId":-1}]');
   end if;
   update private.kinojo_ranking_snapshot_scopes_v390 set hof_payload=bad
     where snapshot_id=sid and not include_subs and not include_all_legions;
   update private.kinojo_ranking_snapshots_v390 set status='BUILDING' where snapshot_id=sid;
   r:=private.kinojo_ranking_snapshot_validate_v390(sid);
   if r->>'ok'='true' then raise exception 'CORRUPTION_ACCEPTED %',mutation; end if;
   r:=private.kinojo_ranking_snapshot_publish_v390(sid);
   if r->>'ok'='true' then raise exception 'INVALID_PUBLISHED %',mutation; end if;
   if (select snapshot_id from private.kinojo_ranking_snapshot_pointer_v390 where singleton)<>pointer_before then
     raise exception 'POINTER_CHANGED %',mutation; end if;
 end loop;
 update private.kinojo_ranking_snapshot_scopes_v390 set hof_payload=original
   where snapshot_id=sid and not include_subs and not include_all_legions;
 update private.kinojo_ranking_snapshots_v390 set status='BUILDING' where snapshot_id=sid;
 r:=private.kinojo_ranking_snapshot_validate_v390(sid);
 if r->>'ok'<>'true' then raise exception 'RESTORED_CANDIDATE_FAILED %',r; end if;
 if has_function_privilege('anon','private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz)','EXECUTE')
 or has_function_privilege('authenticated','private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz)','EXECUTE')
 then raise exception 'PRIVATE_HELPER_EXPOSED'; end if;
end $test$;
select snapshot_id, status, build_stats, validation_report from private.kinojo_ranking_snapshots_v390
 where source_session_id='hof476-transaction-test';
ROLLBACK;
