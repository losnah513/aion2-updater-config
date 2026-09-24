-- Data detail requires the verified external encrypted backup.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
create or replace function private.kinojo_snapshot_raw_cleanup_v501(p_dry_run boolean default true,p_limit integer default 2000)
returns jsonb language sql security definer set search_path to 'pg_catalog' set statement_timeout to '15s' set lock_timeout to '500ms'
as $function$select private.kinojo_snapshot_diagnostic_cleanup_v508(p_dry_run,least(50,p_limit));$function$;
drop function private.kinojo_payload_evidence_cleanup_v509(boolean,integer);
drop function private.kinojo_payload_evidence_candidates_v509(bigint,integer);
drop function private.kinojo_payload_evidence_v509(jsonb);
drop index public.idx_lookup_target_payload_v509;
commit;
