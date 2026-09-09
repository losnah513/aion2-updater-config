-- Fail closed after any retirement; never reconstruct current profiles or erase history.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.character_master,private.character_historical_identities in share row exclusive mode;
do $guard$
begin
 if exists(select 1 from private.character_historical_identities where retired_at is not null) then
   raise exception 'HISTORICAL_IDENTITIES_RETIRED_ROLL_FORWARD_REQUIRED';
 end if;
end;
$guard$;
alter table public.character_identity_change_history drop constraint character_identity_change_history_character_id_fkey,
 add constraint character_identity_change_history_character_id_fkey foreign key(character_id) references public.character_master(id) on delete cascade;
alter table public.character_identity_recovery_attempts drop constraint character_identity_recovery_attempts_character_id_fkey,
 add constraint character_identity_recovery_attempts_character_id_fkey foreign key(character_id) references public.character_master(id) on delete set null;
alter table private.character_activity_checks drop constraint character_activity_checks_character_id_fkey,
 add constraint character_activity_checks_character_id_fkey foreign key(character_id) references public.character_master(id) on delete restrict;
alter table private.character_activity_lifecycle drop constraint character_activity_lifecycle_character_id_fkey,
 add constraint character_activity_lifecycle_character_id_fkey foreign key(character_id) references public.character_master(id) on delete restrict;
do $patch$
declare prior text;
begin
 prior:=pg_get_functiondef('public.kinojo_hof_weekly_gear_deltas(timestamptz)'::regprocedure);
 if position('join private.kinojo_character_history_identity_scope() cm' in prior)=0 then
   raise exception 'WEEKLY_HISTORY_SCOPE_CONTRACT_CHANGED';
 end if;
 execute replace(prior,'join private.kinojo_character_history_identity_scope() cm','join public.character_master cm');
end;
$patch$;
drop trigger character_historical_identity_guard on public.character_master;
drop trigger character_historical_identity_capture on public.character_master;
drop trigger character_historical_identity_retire on public.character_master;
-- Keep the private identity ledger as audit material. No table/data drops.
revoke insert,update on private.character_historical_identities from service_role;
revoke execute on function private.kinojo_character_historical_identity_guard(),private.kinojo_character_historical_identity_capture(),
 private.kinojo_character_history_identity_scope() from service_role;
commit;
