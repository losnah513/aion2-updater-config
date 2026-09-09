-- Recovery freeze: stop NEW automatic inactivity. Preserve existing inactive states,
-- write fences, columns and audit history; explicit/verified return remains available.
-- Keep the inactive admin tab deployed while any inactive records remain.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create or replace function private.kinojo_character_activity_reconcile(p_character_id bigint,p_at timestamptz default now())
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $$
declare p jsonb; c public.character_master%rowtype; l private.character_activity_lifecycle%rowtype; fresh boolean;
begin
 p:=private.kinojo_character_activity_reconcile_before_inactive(p_character_id,p_at);
 if p->>'ok'<>'true' then return p;end if;
 select * into c from public.character_master where id=p_character_id for update;
 select * into l from private.character_activity_lifecycle where character_id=p_character_id;
 if c.activity_inactive_at is not null and p->>'reason' in
 ('MANAGED_LEGION','MANAGED_LEGION_FAMILY','CURRENT_SANCTUARY','CURRENT_SANCTUARY_FAMILY','ADMIN_INCLUDED') then
   update public.character_master set activity_inactive_at=null,activity_inactive_previous=null,
    is_active=coalesce((c.activity_inactive_previous->>'is_active')::boolean,true),
    visibility_excluded=coalesce((c.activity_inactive_previous->>'visibility_excluded')::boolean,false),
    inactive_reason=c.activity_inactive_previous->>'inactive_reason' where id=c.id;
   insert into private.character_activity_events(character_id,episode,state,reason,happened_at)
    values(c.id,l.episode,'REACTIVATED',p->>'reason',p_at);
 end if;
 return private.kinojo_character_lookup_policy(c.id,p_at)||jsonb_build_object('ok',true);
end;
$$;
commit;
