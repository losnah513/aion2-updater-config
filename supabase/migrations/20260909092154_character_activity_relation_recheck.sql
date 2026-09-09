-- Limited relationship-only maintenance. No equipment, LIST, identity or deletion writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
-- No token/key columns or authentication-setting writes are granted. UPDATE of
-- the two message columns permits FOR UPDATE row locks without session mutation.
grant select(automation_key,running,active_session_id) on public.kinojo_server_automation_settings to service_role;
grant update(last_message) on public.kinojo_server_automation_settings to service_role;
grant select(session_id,tool_name,client_id,status) on public.updater_sessions to service_role;
grant update(message) on public.updater_sessions to service_role;
grant select on private.sanctuary_management_schedule_versions_v437 to service_role;
-- PostgreSQL17 MAINTAIN authorizes the absence fence, not snapshot/schedule DML.
grant maintain on public.lookup_snapshots,private.sanctuary_management_schedule_versions_v437 to service_role;
create table private.character_activity_checks (
 character_id bigint primary key references public.character_master(id) on delete restrict,
 session_id text not null,
 claim_id uuid not null,
 claimed_at timestamptz not null,
 lease_until timestamptz not null,
 next_check_at timestamptz not null,
 source_revision jsonb not null,
 checked_at timestamptz,
 outcome text not null check(outcome in ('CLAIMED','VERIFIED','HELD','STALE')),
 code text,
 profile jsonb
);
alter table private.character_activity_checks enable row level security;
revoke all on private.character_activity_checks from public,anon,authenticated;
grant select,insert,update on private.character_activity_checks to service_role;
create index character_activity_checks_due on private.character_activity_checks(next_check_at,character_id);

-- A newer maintenance failure supersedes an older successful snapshot for absence.
-- Positive Sanctuary/manual inclusion still wins in the existing policy.
create or replace function private.kinojo_character_activity_evidence(p_character_id bigint,p_at timestamptz)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public,private as $fn$
declare c public.character_master%rowtype; r private.character_activity_checks%rowtype;
begin
 select * into c from public.character_master where id=p_character_id;
 select * into r from private.character_activity_checks where character_id=p_character_id;
 if r.claimed_at<=p_at and r.claimed_at>=coalesce(c.last_lookup_success_at,'-infinity'::timestamptz) then
   return coalesce(r.outcome='VERIFIED' and r.checked_at<=p_at
     and r.profile->>'serverId'=c.server_id::text
     and lower(regexp_replace(r.profile->>'characterName','\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g'))
     and r.profile->>'regionName'=coalesce(c.legion_name,'')
     and r.source_revision->>'char_key'=c.char_key
     and r.source_revision->>'class_name'=c.class_name
     and coalesce(c.last_lookup_failed_at,'-infinity'::timestamptz)<=r.checked_at,false);
 end if;
 return exists(select 1 from public.lookup_snapshots s where s.id=c.legion_source_snapshot_id
   and c.last_lookup_success_at is not null and c.last_lookup_success_at<=p_at
   and c.legion_updated_at<=p_at and c.legion_updated_at>=c.last_lookup_success_at
   and (c.last_lookup_failed_at is null or c.last_lookup_failed_at<=c.last_lookup_success_at)
   and s.status='OK' and s.server_id=c.server_id
   and lower(regexp_replace(s.character_name,'\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g'))
   and jsonb_typeof(s.raw_payload#>'{officialRaw,info,profile,regionName}')='string'
   and s.raw_payload#>>'{officialRaw,info,profile,regionName}'=coalesce(c.legion_name,'')
   and s.raw_payload#>>'{officialRaw,info,profile,serverId}'=c.server_id::text
   and lower(regexp_replace(s.raw_payload#>>'{officialRaw,info,profile,characterName}','\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g')));
end;
$fn$;

create function private.kinojo_character_activity_session(p_session_id text,p_session_token text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
declare v jsonb;
begin
 v:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
 if coalesce((v->>'ok')::boolean,false) is not true then return false;end if;
 perform 1 from public.kinojo_server_automation_settings where automation_key='character_refresh' for update nowait;
 perform 1 from public.updater_sessions where session_id=p_session_id for update nowait;
 return coalesce((v->>'ok')::boolean,false) and exists(
   select 1 from public.kinojo_server_automation_settings a join public.updater_sessions s on s.session_id=a.active_session_id
   where a.automation_key='character_refresh' and a.running and a.active_session_id=p_session_id
   and s.tool_name='KINOJO_SERVER_AUTOMATION' and s.client_id='SYSTEM_CRON_CHARACTER_REFRESH'
   and s.status='starting');
end;
$fn$;

create function public.kinojo_character_activity_claim(p_session_id text,p_session_token text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
declare c public.character_master%rowtype; p jsonb; result jsonb:='[]'; v_id uuid; n integer:=0;
begin
 if not private.kinojo_character_activity_session(p_session_id,p_session_token) then
   return jsonb_build_object('ok',false,'code','ACTIVITY_SESSION_INVALID');end if;
 perform private.kinojo_character_activity_lock();
 -- A repeated call in the same scheduled run never consumes another batch.
 if exists(select 1 from private.character_activity_checks where session_id=p_session_id) then
   return jsonb_build_object('ok',true,'targets',result,'repeated',true);end if;
 -- Establish exclusion episodes before any pending claim invalidates family evidence.
 for c in select m.* from public.character_master m order by m.id loop
   if private.kinojo_character_lookup_policy(c.id)->>'reason'='AUTO_NO_ACTIVITY'
     or exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id) then
     perform private.kinojo_character_activity_reconcile(c.id);
   end if;
 end loop;
 for c in select m.* from public.character_master m left join private.character_activity_checks r on r.character_id=m.id
   where coalesce(r.next_check_at,'-infinity'::timestamptz)<=now()
   order by coalesce(r.next_check_at,'-infinity'::timestamptz),m.id
 loop
   p:=private.kinojo_character_lookup_policy(c.id);
   if p->>'reason'='AUTO_NO_ACTIVITY' or (p->>'reason' in ('ACTIVITY_REVIEW_WAIT','ACTIVITY_REVIEW_DUE')
     and exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id and l.excluded_at is not null)) then
     v_id:=gen_random_uuid();
     insert into private.character_activity_checks(character_id,session_id,claim_id,claimed_at,lease_until,next_check_at,source_revision,outcome)
       values(c.id,p_session_id,v_id,now(),now()+interval '100 seconds',now()+interval '7 days',to_jsonb(c),'CLAIMED')
     on conflict(character_id) do update set session_id=excluded.session_id,claim_id=excluded.claim_id,claimed_at=excluded.claimed_at,
       lease_until=excluded.lease_until,next_check_at=excluded.next_check_at,source_revision=excluded.source_revision,
       checked_at=null,outcome='CLAIMED',code=null,profile=null;
     perform private.kinojo_character_activity_reconcile(c.id);
     result:=result||jsonb_build_array(jsonb_build_object('characterId',c.id,'claimId',v_id,'serverId',c.server_id,
       'characterName',c.character_name,'charKey',c.char_key,'detailUrl',c.detail_url,'className',c.class_name));
     n:=n+1;exit when n>=5;
   elsif exists(select 1 from private.character_activity_lifecycle l where l.character_id=c.id) then
     perform private.kinojo_character_activity_reconcile(c.id);
   end if;
 end loop;
 return jsonb_build_object('ok',true,'targets',result,'batchLimit',5,'intervalDays',7);
exception when lock_not_available then
 return jsonb_build_object('ok',false,'code','ACTIVITY_RELATION_BUSY','retryable',true);
end;
$fn$;

create function public.kinojo_character_activity_complete(p_session_id text,p_session_token text,
 p_character_id bigint,p_claim_id uuid,p_info jsonb,p_error_code text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
declare c public.character_master%rowtype; r private.character_activity_checks%rowtype;
 p jsonb; v_code text; key text; race integer; f bigint; result jsonb;
begin
 if not private.kinojo_character_activity_session(p_session_id,p_session_token) then
   return jsonb_build_object('ok',false,'code','ACTIVITY_SESSION_INVALID');end if;
 perform private.kinojo_character_activity_lock();
 select * into r from private.character_activity_checks where character_id=p_character_id for update nowait;
 if r.claim_id is distinct from p_claim_id or r.session_id is distinct from p_session_id then
   return jsonb_build_object('ok',false,'code','ACTIVITY_CLAIM_INVALID');end if;
 if r.outcome<>'CLAIMED' then return jsonb_build_object('ok',true,'repeated',true,'outcome',r.outcome);end if;
 select * into c from public.character_master where id=p_character_id;
 p:=private.kinojo_character_lookup_policy(c.id);
 if r.lease_until<clock_timestamp() or r.source_revision is distinct from to_jsonb(c)
   or p->>'reason' not in ('AUTO_NO_ACTIVITY','ACTIVITY_REVIEW_WAIT','ACTIVITY_REVIEW_DUE') then
   update private.character_activity_checks set outcome='STALE',code='ACTIVITY_CONTEXT_CHANGED',checked_at=now() where character_id=c.id;
   result:=private.kinojo_character_activity_reconcile(c.id);
   return jsonb_build_object('ok',true,'outcome','STALE','policy',result);end if;
 p:=p_info->'profile';
 key:=substring(coalesce(p->>'profileImage',p->>'profileImageUrl','') from '[?&]charKey=([0-9]{10,})');
 select race_id into race from public.server_master where server_id=c.server_id and is_active;
 v_code:=nullif(left(p_error_code,120),'');
 if v_code is null and (c.char_key is null or c.char_key!~'^[0-9]{10,}$' or key is distinct from c.char_key
   or p->>'serverId' is distinct from c.server_id::text
   or lower(regexp_replace(p->>'characterName','\s','','g')) is distinct from lower(regexp_replace(c.character_name,'\s','','g'))
   or nullif(c.class_name,'') is null or p->>'className' is distinct from c.class_name
   or race is null or p->>'raceId' is distinct from race::text) then v_code:='ACTIVITY_IDENTITY_UNCONFIRMED';end if;
 if v_code is null and jsonb_typeof(p->'regionName') is distinct from 'string' then v_code:='ACTIVITY_LEGION_MISSING';end if;
 if v_code is null then
   -- Preserve stats/success/failure counters and immutable snapshot attribution.
   update public.character_master set legion_name=nullif(p->>'regionName',''),legion_updated_at=now(),legion_source_snapshot_id=null where id=c.id;
 end if;
 update private.character_activity_checks set outcome=case when v_code is null then 'VERIFIED' else 'HELD' end,
   code=v_code,profile=case when v_code is null then p else null end,checked_at=now() where character_id=c.id;
 for f in select id from public.character_master where coalesce(main_character_id,id)=coalesce(c.main_character_id,c.id) order by id loop
   result:=private.kinojo_character_activity_reconcile(f);
 end loop;
 return jsonb_build_object('ok',true,'outcome',case when v_code is null then 'VERIFIED' else 'HELD' end,'code',v_code,
   'policy',private.kinojo_character_lookup_policy(c.id));
exception when lock_not_available then
 return jsonb_build_object('ok',false,'code','ACTIVITY_RELATION_BUSY','retryable',true);
end;
$fn$;
revoke all on function private.kinojo_character_activity_session(text,text),public.kinojo_character_activity_claim(text,text),
 public.kinojo_character_activity_complete(text,text,bigint,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.kinojo_character_activity_session(text,text),public.kinojo_character_activity_claim(text,text),
 public.kinojo_character_activity_complete(text,text,bigint,uuid,jsonb,text) to service_role;
commit;
