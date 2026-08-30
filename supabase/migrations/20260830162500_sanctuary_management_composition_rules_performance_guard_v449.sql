-- Stage 8 part 1 advisor follow-up: cover the two actor foreign keys used by
-- composition-rule audit lookups and parent-row deletion checks.

create index if not exists sanctuary_management_composition_rules_v449_created_by_idx
  on private.sanctuary_management_composition_rules_v449(created_by_member_id)
  where created_by_member_id is not null;

create index if not exists sanctuary_management_composition_rules_v449_updated_by_idx
  on private.sanctuary_management_composition_rules_v449(updated_by_member_id)
  where updated_by_member_id is not null;
