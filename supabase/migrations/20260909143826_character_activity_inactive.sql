-- DB-only inactivity; no Sheet writes, deletes, history rewiring or new scheduler.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
alter table public.character_master add column activity_inactive_at timestamptz,
 add column activity_inactive_previous jsonb;
alter function private.kinojo_character_lookup_policy(bigint,timestamptz) rename to kinojo_character_lookup_policy_before_inactive;
create function private.kinojo_character_lookup_policy(p_character_id bigint,p_at timestamptz default now())
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private as $$
declare p jsonb; inactive_at timestamptz;
begin
 p:=private.kinojo_character_lookup_policy_before_inactive(p_character_id,p_at);
 select activity_inactive_at into inactive_at from public.character_master where id=p_character_id;
 return p||jsonb_build_object('inactive',inactive_at is not null,'inactiveAt',inactive_at,
 'eligible',case when inactive_at is not null then false else coalesce((p->>'eligible')::boolean,false) end,
 'reason',case when inactive_at is not null then 'AUTO_INACTIVE' else p->>'reason' end,
 'relationshipReason',p->>'reason');
end;
$$;
alter function private.kinojo_character_activity_reconcile(bigint,timestamptz) rename to kinojo_character_activity_reconcile_before_inactive;
-- The previous reconciler must evaluate relationships, not the inactivity override.
do $$declare d text;begin
 d:=pg_get_functiondef('private.kinojo_character_activity_reconcile_before_inactive(bigint,timestamptz)'::regprocedure);
 execute replace(d,'private.kinojo_character_lookup_policy(','private.kinojo_character_lookup_policy_before_inactive(');
end$$;
create function private.kinojo_character_activity_reconcile(p_character_id bigint,p_at timestamptz default now())
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
 elsif c.activity_inactive_at is null and p->>'reason'='AUTO_NO_ACTIVITY' and l.state='EXCLUDED'
   and l.cleanup_candidate_at<=p_at and coalesce(c.is_active,true) then
   -- Every family witness must have just been officially checked. Missing/failed
   -- evidence or large families that cannot fit the bounded batch stay excluded.
   select not exists(select 1 from public.character_master f
     left join private.character_activity_checks r on r.character_id=f.id
     where coalesce(f.main_character_id,f.id)=coalesce(c.main_character_id,c.id)
     and (r.outcome is distinct from 'VERIFIED' or r.checked_at is null
       or r.checked_at<p_at-interval '10 minutes' or r.checked_at>p_at
       or not private.kinojo_character_activity_evidence(f.id,p_at))) into fresh;
   if fresh and not exists(select 1 from public.google_list_sheet_sync_queue q where q.character_id=c.id
       and q.sync_status in ('queued','failed','error','retry','processing'))
     and not exists(select 1 from public.lookup_session_targets t join public.updater_sessions s using(session_id)
       where t.server_id=c.server_id and lower(t.character_name)=lower(c.character_name)
       and s.status in ('starting','running','paused','processing') and t.target_status in ('queued','retry_queued','claimed')) then
     update public.character_master set activity_inactive_at=p_at,
       activity_inactive_previous=jsonb_build_object('is_active',is_active,'visibility_excluded',visibility_excluded,'inactive_reason',inactive_reason),
       is_active=false,visibility_excluded=true,inactive_reason='활동 관계 종료 · 자동 비활성' where id=c.id;
     insert into private.character_activity_events(character_id,episode,state,reason,happened_at)
       values(c.id,l.episode,'INACTIVE','AUTO_NO_ACTIVITY',p_at);
   end if;
 end if;
 return private.kinojo_character_lookup_policy(c.id,p_at)||jsonb_build_object('ok',true);
end;
$$;
create function private.kinojo_character_inactive_write_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,private as $$
begin
 if tg_table_name='google_list_sheet_sync_queue' then
   perform 1 from public.character_master where id=new.character_id for share;
   if exists(select 1 from public.character_master where id=new.character_id and activity_inactive_at is not null)
     then raise exception 'CHARACTER_INACTIVE_LIST_WRITE_BLOCKED';end if;
 else
   if tg_op='INSERT' and exists(select 1 from public.character_master c where c.activity_inactive_at is not null
      and ((nullif(new.char_key,'') is not null and c.char_key=new.char_key)
       or (nullif(new.char_key,'') is null and c.server_id=new.server_id
        and lower(regexp_replace(c.character_name,'\s','','g'))=lower(regexp_replace(new.character_name,'\s','','g'))))) then
     raise exception 'CHARACTER_INACTIVE_REIMPORT_BLOCKED';
   end if;
   if new.activity_inactive_at is not null then new.is_active:=false;new.visibility_excluded:=true;end if;
 end if;
 return new;
end;
$$;
create trigger zz_character_inactive_guard before insert or update on public.character_master
 for each row execute function private.kinojo_character_inactive_write_guard();
create trigger character_inactive_list_guard before insert or update on public.google_list_sheet_sync_queue
 for each row execute function private.kinojo_character_inactive_write_guard();
-- Reuse the existing bounded periodic official recheck for inactive returns.
do $$declare d text;begin
 d:=pg_get_functiondef('public.kinojo_character_activity_claim(text,text)'::regprocedure);
 if position('p->>''reason''=''AUTO_NO_ACTIVITY''' in d)=0 then raise exception 'ACTIVITY_CLAIM_CONTRACT_CHANGED';end if;
 execute replace(d,'p->>''reason''=''AUTO_NO_ACTIVITY''','p->>''reason'' in (''AUTO_NO_ACTIVITY'',''AUTO_INACTIVE'')');
end$$;
do $$declare d text;begin
 d:=pg_get_functiondef('public.kinojo_character_activity_complete(text,text,bigint,uuid,jsonb,text)'::regprocedure);
 if position('(''AUTO_NO_ACTIVITY'',''ACTIVITY_REVIEW_WAIT'',''ACTIVITY_REVIEW_DUE'')' in d)=0 then raise exception 'ACTIVITY_COMPLETE_CONTRACT_CHANGED';end if;
 execute replace(d,'(''AUTO_NO_ACTIVITY'',''ACTIVITY_REVIEW_WAIT'',''ACTIVITY_REVIEW_DUE'')',
  '(''AUTO_NO_ACTIVITY'',''AUTO_INACTIVE'',''ACTIVITY_REVIEW_WAIT'',''ACTIVITY_REVIEW_DUE'')');
end$$;
-- Existing authenticated admin policy update is the explicit restore action.
do $$declare d text;begin
 d:=pg_get_functiondef('public.kinojo_admin_character_lookup_policy_update(text,bigint,text,text,text,text)'::regprocedure);
 if position('target_id:=case' in d)=0 or position('return jsonb_build_object(''ok'',true,''policy''' in d)=0 then raise exception 'ADMIN_POLICY_CONTRACT_CHANGED';end if;
 d:=replace(d,'target_id:=case','perform private.kinojo_character_activity_lock(); target_id:=case');
 d:=replace(d,'return jsonb_build_object(''ok'',true,''policy''',
  'perform private.kinojo_character_activity_reconcile(f.id) from public.character_master f where coalesce(f.main_character_id,f.id)=coalesce(c.main_character_id,c.id); return jsonb_build_object(''ok'',true,''policy''');
 execute d;
end$$;
revoke all on function private.kinojo_character_lookup_policy(bigint,timestamptz),
 private.kinojo_character_activity_reconcile(bigint,timestamptz),private.kinojo_character_inactive_write_guard() from public,anon,authenticated;
grant execute on function private.kinojo_character_lookup_policy(bigint,timestamptz),
 private.kinojo_character_activity_reconcile(bigint,timestamptz),private.kinojo_character_inactive_write_guard() to service_role;
commit;
