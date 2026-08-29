-- Stage 7 promotes the long-lived v412 settings row to the final v446 contract.
-- The previous equality check intentionally blocked an accidental version bump;
-- the v446 transition state machine is now the only writer that sets 446.

alter table private.sanctuary_management_settings_v412
  drop constraint sanctuary_management_settings_v412_schema_version_check;

alter table private.sanctuary_management_settings_v412
  add constraint sanctuary_management_settings_v412_schema_version_check
  check(schema_version in (412,446));
