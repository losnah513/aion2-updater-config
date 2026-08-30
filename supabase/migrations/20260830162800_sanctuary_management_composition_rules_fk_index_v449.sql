-- The Supabase FK advisor requires a full leading-column index; replace the
-- partial actor indexes from the immediate follow-up with full FK indexes.

drop index if exists private.sanctuary_management_composition_rules_v449_created_by_idx;
drop index if exists private.sanctuary_management_composition_rules_v449_updated_by_idx;

create index sanctuary_management_composition_rules_v449_created_by_idx
  on private.sanctuary_management_composition_rules_v449(created_by_member_id);

create index sanctuary_management_composition_rules_v449_updated_by_idx
  on private.sanctuary_management_composition_rules_v449(updated_by_member_id);
