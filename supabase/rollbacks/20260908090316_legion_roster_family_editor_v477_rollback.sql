-- Roll back Web/Edge first. Preserve saved relationships and audit/override rows.
-- Dropping the guard allows subsequent older worker snapshots to overwrite explicit links.
begin;
drop function if exists public.kinojo_roster_family_read_v477(text,text,bigint);
drop function if exists public.kinojo_roster_family_save_v477(text,text,bigint,bigint[],jsonb);
drop function if exists private.kinojo_roster_family_save_v477(bigint,text,bigint,bigint[],jsonb);
drop function if exists private.kinojo_roster_family_state_v477(bigint);
drop trigger if exists roster_family_override_v477 on public.character_master;
drop function if exists private.kinojo_roster_family_override_v477();
notify pgrst,'reload schema';
commit;
