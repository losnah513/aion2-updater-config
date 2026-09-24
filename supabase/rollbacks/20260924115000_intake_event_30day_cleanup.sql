-- SQL516 rollback stops future deletion; retired events cannot be restored.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512 set enabled=false where singleton;
drop function if exists private.kinojo_intake_event_cleanup_v516(boolean,integer);
drop function if exists private.kinojo_intake_event_candidates_v516(bigint,integer);
commit;
