-- Historical identity only: no equipment, powers, profile URLs or session data.
-- No cleanup writer, schedule or current-character deletion is activated here.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.character_master in share row exclusive mode;
create table private.character_historical_identities (
 character_id bigint primary key,
 char_key text,
 server_id integer,
 character_name text not null,
 retired_at timestamptz,
 captured_at timestamptz not null default now()
);
alter table private.character_historical_identities enable row level security;
revoke all on private.character_historical_identities from public,anon,authenticated;
grant select,insert,update on private.character_historical_identities to service_role;
create index character_historical_retired_key on private.character_historical_identities(char_key)
 where retired_at is not null and char_key is not null;
create index character_historical_retired_name on private.character_historical_identities
 (server_id,lower(regexp_replace(character_name,'\s','','g'))) where retired_at is not null;
insert into private.character_historical_identities(character_id,char_key,server_id,character_name)
 select id,char_key,server_id,character_name from public.character_master;

create function private.kinojo_character_historical_identity_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
declare v_retired_at timestamptz;
begin
 perform pg_advisory_xact_lock(51720,1);
 -- Lock matching ledger rows as well: a concurrent retirement must be visible,
 -- or PostgreSQL must reject a stale repeatable-read transaction.
 for v_retired_at in select h.retired_at from private.character_historical_identities h
 where h.character_id=new.id or (nullif(new.char_key,'') is not null and h.char_key=new.char_key)
    or (nullif(new.char_key,'') is null and h.server_id=new.server_id
      and lower(regexp_replace(h.character_name,'\s','','g'))=lower(regexp_replace(new.character_name,'\s','','g')))
    or exists(
      select 1 from public.character_identity_change_history e where e.character_id=h.character_id
      and ((nullif(new.char_key,'') is not null and new.char_key in(e.char_key,e.previous_char_key,e.current_char_key))
       or (nullif(new.char_key,'') is null and
        ((e.previous_server_id=new.server_id and lower(regexp_replace(e.previous_character_name,'\s','','g'))=lower(regexp_replace(new.character_name,'\s','','g')))
         or (e.current_server_id=new.server_id and lower(regexp_replace(e.current_character_name,'\s','','g'))=lower(regexp_replace(new.character_name,'\s','','g')))))))
 for share loop
   if v_retired_at is not null then
     raise exception using errcode='23514',message='RETIRED_CHARACTER_REQUIRES_REVIEW';
   end if;
 end loop;
 return new;
end;
$fn$;
create function private.kinojo_character_historical_identity_capture()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
begin
 if tg_op='DELETE' then
   perform pg_advisory_xact_lock(51720,1);
   -- The existing unverified legion-tree Queue abort is not a retired character.
   -- Confirmed keys/history get a durable fence against old Queue/LIST replay.
   update private.character_historical_identities set char_key=old.char_key,server_id=old.server_id,
     character_name=old.character_name,retired_at=case
       when (old.char_key ~ '^[0-9]{10,}$' and old.last_lookup_success_at is not null)
         or exists(select 1 from public.character_identity_change_history where character_id=old.id)
       then coalesce(retired_at,statement_timestamp()) else retired_at end,
     captured_at=statement_timestamp() where character_id=old.id;
   return old;
 end if;
 insert into private.character_historical_identities(character_id,char_key,server_id,character_name)
 values(new.id,new.char_key,new.server_id,new.character_name)
 on conflict(character_id) do update set char_key=excluded.char_key,server_id=excluded.server_id,
   character_name=excluded.character_name,captured_at=statement_timestamp()
 where character_historical_identities.retired_at is null;
 return new;
end;
$fn$;
revoke all on function private.kinojo_character_historical_identity_guard(),
 private.kinojo_character_historical_identity_capture() from public,anon,authenticated;
grant execute on function private.kinojo_character_historical_identity_guard(),
 private.kinojo_character_historical_identity_capture() to service_role;
create trigger character_historical_identity_guard before insert or update of char_key,server_id,character_name
 on public.character_master for each row execute function private.kinojo_character_historical_identity_guard();
create trigger character_historical_identity_capture after insert or update of char_key,server_id,character_name
 on public.character_master for each row execute function private.kinojo_character_historical_identity_capture();
create trigger character_historical_identity_retire before delete
 on public.character_master for each row execute function private.kinojo_character_historical_identity_capture();

-- Preserve existing IDs and rows. No CASCADE or SET NULL on these audit paths.
alter table public.character_identity_change_history drop constraint character_identity_change_history_character_id_fkey,
 add constraint character_identity_change_history_character_id_fkey foreign key(character_id)
 references private.character_historical_identities(character_id) on delete restrict;
alter table public.character_identity_recovery_attempts drop constraint character_identity_recovery_attempts_character_id_fkey,
 add constraint character_identity_recovery_attempts_character_id_fkey foreign key(character_id)
 references private.character_historical_identities(character_id) on delete restrict;
alter table private.character_activity_checks drop constraint character_activity_checks_character_id_fkey,
 add constraint character_activity_checks_character_id_fkey foreign key(character_id)
 references private.character_historical_identities(character_id) on delete restrict;
alter table private.character_activity_lifecycle drop constraint character_activity_lifecycle_character_id_fkey,
 add constraint character_activity_lifecycle_character_id_fkey foreign key(character_id)
 references private.character_historical_identities(character_id) on delete restrict;

create function private.kinojo_character_history_identity_scope()
returns table(id bigint,char_key text,server_id integer,character_name text)
language sql stable security invoker set search_path=pg_catalog,public,private as $fn$
 select c.id,c.char_key,c.server_id,c.character_name from public.character_master c
 union all
 select h.character_id,h.char_key,h.server_id,h.character_name from private.character_historical_identities h
 where h.retired_at is not null and not exists(select 1 from public.character_master c where c.id=h.character_id);
$fn$;
revoke all on function private.kinojo_character_history_identity_scope() from public,anon,authenticated;
grant execute on function private.kinojo_character_history_identity_scope() to service_role;

-- Preserve the existing SQL/ACL/query plan and change only the historical join.
do $patch$
declare prior text; next_def text;
begin
 prior:=pg_get_functiondef('public.kinojo_hof_weekly_gear_deltas(timestamptz)'::regprocedure);
 if (length(prior)-length(replace(prior,'join public.character_master cm','')))/length('join public.character_master cm')<>1 then
   raise exception 'WEEKLY_HISTORY_SCOPE_CONTRACT_CHANGED';
 end if;
 next_def:=replace(prior,'join public.character_master cm','join private.kinojo_character_history_identity_scope() cm');
 execute next_def;
end;
$patch$;
commit;
