-- SQL517: keep the verified bounded retention jobs running after this cleanup.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='30s';

do $fn$
begin
  if not exists(select 1 from private.kinojo_snapshot_retention_control_v512
    where singleton and backup_waived_at is not null) then
    raise exception 'BACKUP_WAIVER_NOT_RECORDED';
  end if;
end;
$fn$;

select cron.schedule('kinojo-snapshot-seven-day-summary-v514',
  '2,12,22,32,42,52 * * * *',
  $job$set statement_timeout='15s'; select private.kinojo_snapshot_raw_cleanup_v514(false,50);$job$);
select cron.schedule('kinojo-payload-post-detail-cleanup-v515',
  '4,14,24,34,44,54 * * * *',
  $job$set statement_timeout='15s'; select private.kinojo_payload_seven_day_cleanup_v515(false,50);$job$);
select cron.schedule('kinojo-intake-post-detail-cleanup-v516',
  '6,16,26,36,46,56 * * * *',
  $job$set statement_timeout='15s'; select private.kinojo_intake_event_cleanup_v516(false,50);$job$);

-- The already-installed v512 job is gated by the same control.
update private.kinojo_snapshot_retention_control_v512
  set enabled=true where singleton and backup_waived_at is not null;
commit;
