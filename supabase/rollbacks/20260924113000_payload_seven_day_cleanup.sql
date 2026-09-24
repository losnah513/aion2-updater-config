-- SQL515 rollback stops future deletion; deleted payloads cannot be reconstructed.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512 set enabled=false where singleton;
drop function if exists private.kinojo_payload_seven_day_cleanup_v515(boolean,integer);
drop function if exists private.kinojo_payload_seven_day_candidates_v515(bigint,integer);
commit;
