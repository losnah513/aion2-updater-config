-- DB 437 follow-up: cover the actor FK used by retention and member cleanup.
create index if not exists sanctuary_management_schedule_versions_v437_created_by_idx
  on private.sanctuary_management_schedule_versions_v437(created_by_member_id);
