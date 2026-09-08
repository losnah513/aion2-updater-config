-- Stop only this dispatcher. Keep request/audit rows and published snapshots.
-- Run when refresh work is idle; existing detached batches are not rewritten.
begin;
set local lock_timeout='2s';
select pg_advisory_xact_lock(hashtextextended('kinojo-deferred-ranking-hof',0));
select cron.unschedule(jobid) from cron.job where jobname='kinojo-deferred-ranking-hof';
update private.character_snapshot_dispatch set enabled=false,updated_at=now() where singleton;
update private.kinojo_ranking_snapshots_v390 r set status='FAILED',updated_at=now(),last_error_code='DEFERRED_ROLLBACK'
from private.character_snapshot_dispatch s
where s.singleton and r.snapshot_id=s.candidate_id
and r.source_session_id='deferred:'||s.request_cutoff::text and r.status in ('BUILDING','READY');
drop trigger if exists kinojo_character_snapshot_detach on public.lookup_batches;
drop trigger if exists kinojo_character_snapshot_enqueue on public.updater_sessions;
drop trigger if exists kinojo_character_snapshot_detail_generation on public.character_detail_refresh_jobs;
commit;
