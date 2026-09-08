begin;
set local lock_timeout='2s';
create or replace function private.kinojo_history_rollup_guard()
returns trigger language plpgsql security invoker set search_path=''
as $fn$
begin
 if tg_op='INSERT' then
   if new.growth_identity_rolled_up then
     raise exception 'ROLLUP_RECEIPT_SERVER_OWNED';
   end if;
   return new;
 end if;
 if old.growth_identity_rolled_up then
   if new.growth_identity_rolled_up is distinct from true then
     raise exception 'ROLLUP_RECEIPT_SERVER_OWNED';
   end if;
   if row(new.id,new.character_master_id,new.history_date,new.record_type,new.status,new.gear_type,
      new.pve_combat_power,new.pve_item_level,new.pvp_combat_power,new.pvp_item_level,
      new.created_at,new.server_id,new.character_name)
     is distinct from
      row(old.id,old.character_master_id,old.history_date,old.record_type,old.status,old.gear_type,
      old.pve_combat_power,old.pve_item_level,old.pvp_combat_power,old.pvp_item_level,
      old.created_at,old.server_id,old.character_name) then
     raise exception 'ROLLUP_SOURCE_CORRECTION_REQUIRED';
   end if;
 elsif new.growth_identity_rolled_up then
   -- Only the nested, owner-executed rollup writer may claim the receipt.
   -- Not a replacement for table ACL: application roles cannot create triggers.
   if pg_catalog.pg_trigger_depth()<2 or current_user is distinct from (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid='private.kinojo_growth_rollup_history_insert_v424()'::pg_catalog.regprocedure
   ) then
     raise exception 'ROLLUP_RECEIPT_SERVER_OWNED';
   end if;
 end if;
 return new;
end;
$fn$;
revoke all on function private.kinojo_history_rollup_guard() from public;
create trigger trg_character_history_rollup_guard before insert or update on public.character_history
 for each row execute function private.kinojo_history_rollup_guard();
commit;
