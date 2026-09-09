-- Local implementation. No Cron, deletion, public RPC or data backfill.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create table private.character_activity_lifecycle (
 character_id bigint primary key references public.character_master(id) on delete restrict,
 state text not null check(state in ('EXCLUDED','RESTORED','HELD')),
 episode integer not null default 1,
 excluded_at timestamptz,
 cleanup_candidate_at timestamptz,
 evaluated_at timestamptz not null,
 reason text not null,
 check (state<>'EXCLUDED' or (excluded_at is not null and cleanup_candidate_at is not null)),
 check (state='EXCLUDED' or cleanup_candidate_at is null),
 check (state<>'RESTORED' or excluded_at is null)
);
alter table private.character_activity_lifecycle enable row level security;
revoke all on private.character_activity_lifecycle from public,anon,authenticated;
grant select,insert,update on private.character_activity_lifecycle to service_role;
create table private.character_activity_events (
 id bigint generated always as identity primary key,
 character_id bigint not null,
 episode integer not null,
 state text not null,
 reason text not null,
 happened_at timestamptz not null
);
alter table private.character_activity_events enable row level security;
revoke all on private.character_activity_events from public,anon,authenticated;
grant select,insert on private.character_activity_events to service_role;
grant usage,select on sequence private.character_activity_events_id_seq to service_role;

create function private.kinojo_character_current_sanctuary(p_character_id bigint,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog,public,private as $fn$
select exists(
     select 1 from private.sanctuary_management_slots_v412 sl
     join private.sanctuary_management_teams_v412 t on t.team_id=sl.team_id and t.status in ('ACTIVE','FULL')
     join private.sanctuary_management_schedule_rules_v412 r on r.team_id=t.team_id and r.status='ACTIVE'
     where sl.character_id=p_character_id and exists(
       select 1 from private.sanctuary_management_schedule_versions_v437 v
       where v.schedule_id=r.schedule_id and v.status='ACTIVE'
       and v.effective_from <= (p_at at time zone v.timezone_name)::date
       and coalesce(v.effective_to,'infinity'::date) >= (p_at at time zone v.timezone_name)::date
       and ((v.schedule_kind='WEEKLY' and v.starts_on <= (p_at at time zone v.timezone_name)::date)
         or (v.schedule_kind='ONCE' and exists(
           select 1 from private.kinojo_sm_rule_occurrences_v437(r.schedule_id,
             least(v.starts_on,(p_at at time zone v.timezone_name)::date),
             greatest(v.starts_on,coalesce((select max(e.moved_to_date) from private.sanctuary_management_schedule_exceptions_v412 e where e.schedule_id=r.schedule_id and e.occurrence_date=v.starts_on and e.exception_type='MOVE'),v.starts_on))) o
           where o.end_at>p_at)))
     )
   );
$fn$;

-- The existing Server-linked official snapshot, not a UI claim or stale legion string.
create function private.kinojo_character_activity_evidence(p_character_id bigint,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog,public,private as $fn$
 select exists(select 1 from public.character_master c
 join public.lookup_snapshots s on s.id=c.legion_source_snapshot_id
 where c.id=p_character_id and c.last_lookup_success_at is not null
 and c.last_lookup_success_at<=p_at and c.legion_updated_at<=p_at
 and c.legion_updated_at>=c.last_lookup_success_at
 and (c.last_lookup_failed_at is null or c.last_lookup_failed_at<=c.last_lookup_success_at)
 and s.status='OK' and s.server_id=c.server_id
 and lower(regexp_replace(s.character_name,'\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g'))
 and jsonb_typeof(s.raw_payload#>'{officialRaw,info,profile,regionName}')='string'
 and s.raw_payload#>>'{officialRaw,info,profile,regionName}'=coalesce(c.legion_name,'')
 and s.raw_payload#>>'{officialRaw,info,profile,serverId}'=c.server_id::text
 and lower(regexp_replace(s.raw_payload#>>'{officialRaw,info,profile,characterName}','\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g')));
$fn$;

CREATE OR REPLACE FUNCTION private.kinojo_character_lookup_policy(p_character_id bigint, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare c public.character_master%rowtype; root public.character_master%rowtype;
 mode text; scope text; reason text; eligible boolean:=false; current_sanctuary boolean:=false;
 due_at timestamptz; family_sanctuary boolean:=false; confirmed_absence boolean:=false;
 lifecycle private.character_activity_lifecycle%rowtype;
begin
 select * into c from public.character_master where id=p_character_id;
 if not found then return jsonb_build_object('eligible',false,'reason','CHARACTER_NOT_FOUND'); end if;
 select * into root from public.character_master where id=coalesce(c.main_character_id,c.id);
 mode:=case when c.lookup_policy<>'INHERIT' then c.lookup_policy else coalesce(root.lookup_group_policy,'AUTO') end;
 scope:=case when c.lookup_policy<>'INHERIT' then 'CHARACTER' else 'GROUP' end;
 due_at:=coalesce(c.relation_review_attempted_at,c.last_lookup_success_at,'-infinity'::timestamptz)+interval '7 days';
 if upper(c.character_name) like '%\_D' escape '\' or c.exclusion_reason='삭제후보' then reason:='DELETION_CANDIDATE';
 elsif coalesce(c.lookup_excluded,false) then reason:='ADMIN_EXCLUDED';
 elsif coalesce(c.inactive_reason,'') in ('중복','헤더','캐릭터 삭제') then reason:='ARCHIVED_RECORD';
 elsif mode='EXCLUDE' then reason:='ADMIN_EXCLUDED';
 elsif mode='INCLUDE' then eligible:=true; reason:='ADMIN_INCLUDED';
 else
   -- Use canonical schedule occurrence calculation, including cancellations/moves.
   -- Repeating schedules must have started; one-off inclusion is an unexpired actual occurrence.
   current_sanctuary:=private.kinojo_character_current_sanctuary(c.id,p_at);
   select exists(select 1 from (select f.* from public.character_master f
 where coalesce(f.main_character_id,f.id)=coalesce(root.id,c.id)
 and not coalesce(f.lookup_excluded,false)
 and upper(f.character_name) not like '%\_D' escape '\'
 and coalesce(f.exclusion_reason,'')<>'삭제후보'
 and coalesce(f.inactive_reason,'') not in ('중복','헤더','캐릭터 삭제')
 and case when f.lookup_policy<>'INHERIT' then f.lookup_policy else coalesce(root.lookup_group_policy,'AUTO') end<>'EXCLUDE') f where private.kinojo_character_current_sanctuary(f.id,p_at)) into family_sanctuary;
   if current_sanctuary then eligible:=true;reason:='CURRENT_SANCTUARY';
   elsif family_sanctuary then eligible:=true;reason:='CURRENT_SANCTUARY_FAMILY';
   elsif c.server_id=2002 and c.legion_name in ('깡','키나노동조합','낮','밤') then
     eligible:=true;reason:='MANAGED_LEGION';
   elsif exists (
     -- Canonical family IDs only; reuse the existing PK/main_character_id indexes.
     select 1 from public.character_master f
     where (f.id=coalesce(root.id,c.id) or f.main_character_id=coalesce(root.id,c.id))
       and coalesce(f.main_character_id,f.id)=coalesce(root.id,c.id)
       and f.server_id=2002 and f.legion_name in ('깡','키나노동조합','낮','밤')
       and not coalesce(f.lookup_excluded,false)
       and upper(f.character_name) not like '%\_D' escape '\'
       and coalesce(f.exclusion_reason,'')<>'삭제후보'
       and coalesce(f.inactive_reason,'') not in ('중복','헤더','캐릭터 삭제')
       and case when f.lookup_policy<>'INHERIT' then f.lookup_policy
                else coalesce(root.lookup_group_policy,'AUTO') end <> 'EXCLUDE'
   ) then eligible:=true;reason:='MANAGED_LEGION_FAMILY';
   else
     select count(*)>0 and coalesce(bool_and(private.kinojo_character_activity_evidence(f.id,p_at)),false)
       into confirmed_absence from (select f.* from public.character_master f
 where coalesce(f.main_character_id,f.id)=coalesce(root.id,c.id)
 and not coalesce(f.lookup_excluded,false)
 and upper(f.character_name) not like '%\_D' escape '\'
 and coalesce(f.exclusion_reason,'')<>'삭제후보'
 and coalesce(f.inactive_reason,'') not in ('중복','헤더','캐릭터 삭제')
 and case when f.lookup_policy<>'INHERIT' then f.lookup_policy else coalesce(root.lookup_group_policy,'AUTO') end<>'EXCLUDE') f;
     if confirmed_absence then eligible:=false;reason:='AUTO_NO_ACTIVITY';
     else eligible:=due_at<=p_at;reason:=case when eligible then 'ACTIVITY_REVIEW_DUE' else 'ACTIVITY_REVIEW_WAIT' end;
     end if;
   end if;
 end if;
 select * into lifecycle from private.character_activity_lifecycle where character_id=c.id;
 return jsonb_build_object('eligible',eligible,'reason',reason,'mode',mode,'scope',scope,
 'individualMode',c.lookup_policy,'groupMode',coalesce(root.lookup_group_policy,'AUTO'),
 'characterRevision',coalesce(c.lookup_policy_updated_at::text,''),'groupRevision',coalesce(root.id,c.id)::text||'/'||coalesce(root.lookup_policy_updated_at::text,''),
 'rootCharacterId',coalesce(root.id,c.id),'currentSanctuary',current_sanctuary,
 'familySanctuary',family_sanctuary,'activityEvidenceComplete',confirmed_absence,
 'activityReasonCodes',case when reason='AUTO_NO_ACTIVITY' then
   jsonb_build_array('NO_MANAGED_LEGION','NO_CURRENT_SANCTUARY') ||
   case when c.previous_server_id is not null and c.previous_server_id<>c.server_id
     then jsonb_build_array('SERVER_TRANSFER') else '[]'::jsonb end
   else '[]'::jsonb end,
 'autoExcludedAt',case when reason='AUTO_NO_ACTIVITY' and lifecycle.state='EXCLUDED' then lifecycle.excluded_at else null end,
 'cleanupCandidateAt',case when reason='AUTO_NO_ACTIVITY' and lifecycle.state='EXCLUDED' then lifecycle.cleanup_candidate_at else null end,
 'reviewDueAt',case when reason<>'AUTO_NO_ACTIVITY' and isfinite(due_at) then to_jsonb(due_at) else null end,
 'actorId',case when scope='CHARACTER' then c.lookup_policy_actor_id else root.lookup_policy_actor_id end,
 'checkedAt',case when scope='CHARACTER' then c.lookup_policy_updated_at else root.lookup_policy_updated_at end);
end;
$function$;

-- A separate write entry point. Read-only policy evaluation never creates exclusion timestamps.
create function private.kinojo_character_activity_reconcile(p_character_id bigint,p_at timestamptz default now())
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private as $fn$
declare p jsonb; prior private.character_activity_lifecycle%rowtype; next_state text;
 next_episode integer; next_excluded timestamptz; next_due timestamptz;
begin
 if p_at is null then raise exception 'ACTIVITY_TIME_REQUIRED'; end if;
 perform 1 from public.character_master where id=p_character_id for update;
 if not found then return jsonb_build_object('ok',false,'code','CHARACTER_NOT_FOUND');end if;
 select * into prior from private.character_activity_lifecycle where character_id=p_character_id for update;
 if prior.evaluated_at>p_at then return jsonb_build_object('ok',false,'code','STALE_ACTIVITY_EVALUATION');end if;
 p:=private.kinojo_character_lookup_policy(p_character_id,p_at);
 next_state:=case when p->>'reason'='AUTO_NO_ACTIVITY' then 'EXCLUDED'
 when p->>'reason' in ('MANAGED_LEGION','MANAGED_LEGION_FAMILY','CURRENT_SANCTUARY','CURRENT_SANCTUARY_FAMILY','ADMIN_INCLUDED') then 'RESTORED'
 else 'HELD' end;
 if prior.character_id is null and next_state<>'EXCLUDED' then return p||jsonb_build_object('ok',true,'changed',false);end if;
 next_episode:=coalesce(prior.episode,0)+case when next_state='EXCLUDED' and prior.excluded_at is null then 1 else 0 end;
 if next_state='EXCLUDED' then
 next_excluded:=coalesce(prior.excluded_at,p_at);
 next_due:=(date_trunc('month',next_excluded at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul';
 elsif next_state='HELD' then next_excluded:=prior.excluded_at;
 end if;
 insert into private.character_activity_lifecycle values(p_character_id,next_state,next_episode,next_excluded,next_due,p_at,p->>'reason')
 on conflict(character_id) do update set state=excluded.state,episode=excluded.episode,
 excluded_at=excluded.excluded_at,cleanup_candidate_at=excluded.cleanup_candidate_at,
 evaluated_at=excluded.evaluated_at,reason=excluded.reason;
 if prior.state is distinct from next_state or prior.reason is distinct from p->>'reason' then
 insert into private.character_activity_events(character_id,episode,state,reason,happened_at)
 values(p_character_id,next_episode,next_state,p->>'reason',p_at);
 end if;
 return private.kinojo_character_lookup_policy(p_character_id,p_at)||jsonb_build_object('ok',true,'changed',prior.state is distinct from next_state);
end;
$fn$;
revoke all on function private.kinojo_character_current_sanctuary(bigint,timestamptz),private.kinojo_character_activity_evidence(bigint,timestamptz),private.kinojo_character_activity_reconcile(bigint,timestamptz) from public,anon,authenticated;
grant execute on function private.kinojo_character_current_sanctuary(bigint,timestamptz),private.kinojo_character_activity_evidence(bigint,timestamptz),private.kinojo_character_activity_reconcile(bigint,timestamptz) to service_role;
commit;
