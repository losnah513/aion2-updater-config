-- SQL513 rollback: stop unbacked cleanup without restoring deleted rows.
-- SQL512 remains installed; its reader may depend on retained payload diagnoses.
begin read write;
set local lock_timeout='2s';
update private.kinojo_snapshot_retention_control_v512
  set enabled=false, backup_waived_at=null
  where singleton;
commit;
