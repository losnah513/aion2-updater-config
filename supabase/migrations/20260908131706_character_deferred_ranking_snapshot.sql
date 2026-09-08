-- Separate public Ranking/HOF publication from character refresh completion.
begin;
set local lock_timeout='2s';
create table if not exists private.character_snapshot_requests (
 id bigint generated always as identity primary key,
 session_id text not null unique,
 due_at timestamptz not null,
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 snapshot_id bigint
);
create table if not exists private.character_snapshot_dispatch (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true,
 candidate_id bigint,
 generation bigint not null default 0,
 candidate_generation bigint,
 request_cutoff bigint,
 attempts integer not null default 0,
 retry_at timestamptz,
 last_result jsonb,
 updated_at timestamptz not null default now()
);
alter table private.character_snapshot_requests enable row level security;
alter table private.character_snapshot_dispatch enable row level security;
revoke all on private.character_snapshot_requests,private.character_snapshot_dispatch from public,anon,authenticated;
insert into private.character_snapshot_dispatch(singleton) values(true) on conflict do nothing;
create index if not exists character_snapshot_requests_pending on private.character_snapshot_requests(due_at,id) where completed_at is null;

create or replace function private.kinojo_character_snapshot_enqueue()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $fn$
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 -- Serialize refresh state commits with final publication, not expensive scope builds.
 update private.character_snapshot_dispatch set generation=generation+1 where singleton;
 if new.status in ('completed','partial_success') then
  insert into private.character_snapshot_requests(session_id,due_at)
  values(new.session_id,coalesce(new.started_at,now())+interval '30 minutes')
  on conflict(session_id) do nothing;
 end if;
 return new;
end $fn$;
revoke all on function private.kinojo_character_snapshot_enqueue() from public,anon,authenticated,service_role;
drop trigger if exists kinojo_character_snapshot_enqueue on public.updater_sessions;
create trigger kinojo_character_snapshot_enqueue after insert or update of status on public.updater_sessions
for each row execute function private.kinojo_character_snapshot_enqueue();

create or replace function private.kinojo_character_snapshot_detail_generation()
returns trigger language plpgsql security definer set search_path=pg_catalog,private as $fn$
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 update private.character_snapshot_dispatch set generation=generation+1 where singleton;
 return new;
end $fn$;
revoke all on function private.kinojo_character_snapshot_detail_generation() from public,anon,authenticated,service_role;
drop trigger if exists kinojo_character_snapshot_detail_generation on public.character_detail_refresh_jobs;
create trigger kinojo_character_snapshot_detail_generation after insert or update of status on public.character_detail_refresh_jobs
for each row execute function private.kinojo_character_snapshot_detail_generation();

create or replace function private.kinojo_character_snapshot_detach()
returns trigger language plpgsql set search_path=pg_catalog as $fn$
begin new.postprocess_snapshot_required:=false; return new; end $fn$;
revoke all on function private.kinojo_character_snapshot_detach() from public,anon,authenticated,service_role;
drop trigger if exists kinojo_character_snapshot_detach on public.lookup_batches;
create trigger kinojo_character_snapshot_detach before insert or update of postprocess_snapshot_required on public.lookup_batches
for each row execute function private.kinojo_character_snapshot_detach();

create or replace function private.kinojo_deferred_ranking_snapshot_tick()
returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public
set lock_timeout='2s' set statement_timeout='50s' as $fn$
declare
 s private.character_snapshot_dispatch%rowtype;
 newest bigint; earliest timestamptz; candidate_status text; next_scope_value smallint;
 result jsonb; action_name text; source_name text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('kinojo-deferred-ranking-hof',0)) then
  return jsonb_build_object('ok',true,'state','BUSY');
 end if;
 -- Reuse the existing lease/heartbeat expiry rules; do not infer abandonment.
 perform public.kinojo_expire_updater_lock();
 select * into s from private.character_snapshot_dispatch where singleton;
 if not s.enabled then return jsonb_build_object('ok',true,'state','DISABLED'); end if;
 if s.retry_at>now() then return jsonb_build_object('ok',true,'state','RETRY_WAIT'); end if;
 -- Never publish across an unfinished character refresh or detail refresh.
 if exists(select 1 from public.updater_sessions where status in ('starting','running','paused'))
 or exists(select 1 from public.character_detail_refresh_jobs where status in ('queued','running','waiting','processing')) then
  return jsonb_build_object('ok',true,'state','WAIT_REFRESH');
 end if;
 -- A merged build must also respect the newest included refresh's 30-minute delay.
 select max(id),max(due_at) into newest,earliest from private.character_snapshot_requests where completed_at is null;
 if newest is null then return jsonb_build_object('ok',true,'state','IDLE'); end if;
 if earliest>now() then return jsonb_build_object('ok',true,'state','WAIT_30_MINUTES','dueAt',earliest); end if;
 if s.candidate_id is not null and (s.request_cutoff is distinct from newest or s.candidate_generation is distinct from s.generation) then
  -- Only discard our own unpublished candidate; other callers' candidates are untouched.
  update private.kinojo_ranking_snapshots_v390 set status='FAILED',updated_at=now(),last_error_code='NEW_REFRESH_GENERATION'
  where snapshot_id=s.candidate_id and source_session_id='deferred:'||s.request_cutoff::text and status in ('BUILDING','READY');
  s.candidate_id:=null; s.attempts:=0;
 end if;
 if s.candidate_id is null then
  if exists(select 1 from private.kinojo_ranking_snapshots_v390 where status in ('BUILDING','READY')) then
   return jsonb_build_object('ok',true,'state','OTHER_SNAPSHOT_BUSY');
  end if;
  s.request_cutoff:=newest;
  s.candidate_generation:=s.generation;
  s.candidate_id:=private.kinojo_ranking_snapshot_begin_v390('deferred:'||newest::text);
 end if;
 select status,next_scope,source_session_id into candidate_status,next_scope_value,source_name
 from private.kinojo_ranking_snapshots_v390 where snapshot_id=s.candidate_id;
 if source_name is distinct from 'deferred:'||s.request_cutoff::text then
  return jsonb_build_object('ok',false,'state','CANDIDATE_OWNER_MISMATCH');
 end if;
 begin
  if candidate_status='BUILDING' and next_scope_value<4 then
   action_name:='BUILD_RANKING_AND_HOF';
   result:=private.kinojo_ranking_snapshot_build_step_v390(s.candidate_id);
  elsif candidate_status='BUILDING' and next_scope_value=4 then
   action_name:='VERIFY'; result:=private.kinojo_ranking_snapshot_validate_v390(s.candidate_id);
  elsif candidate_status='READY' then
   -- A concurrent start/status commit either precedes this lock (and is seen below)
   -- or waits until publication finishes. No scope build holds this row lock.
   perform 1 from private.character_snapshot_dispatch where singleton for update;
   if exists(select 1 from private.character_snapshot_dispatch where singleton and generation is distinct from s.candidate_generation)
   or exists(select 1 from public.updater_sessions where status in ('starting','running','paused'))
   or exists(select 1 from public.character_detail_refresh_jobs where status in ('queued','running','waiting','processing')) then
    return jsonb_build_object('ok',true,'state','REFRESH_GENERATION_CHANGED');
   end if;
   action_name:='PUBLISH'; result:=private.kinojo_ranking_snapshot_publish_v390(s.candidate_id);
  elsif candidate_status='PUBLISHED' then
   action_name:='PUBLISH'; result:=jsonb_build_object('ok',true,'alreadyPublished',true);
  else result:=jsonb_build_object('ok',false,'code','CANDIDATE_STATE_INVALID');
  end if;
 exception when query_canceled then result:=jsonb_build_object('ok',false,'code','SNAPSHOT_TIMEOUT');
 when others then result:=jsonb_build_object('ok',false,'code',sqlstate,'message',left(sqlerrm,500));
 end;
 if coalesce((result->>'ok')::boolean,false) then
  s.retry_at:=null;
  if action_name='PUBLISH' then
   s.attempts:=0;
   update private.character_snapshot_requests set completed_at=now(),snapshot_id=s.candidate_id
   where completed_at is null and id<=s.request_cutoff;
   s.candidate_id:=null;
  end if;
 else
  s.attempts:=s.attempts+1;s.retry_at:=now()+interval '5 minutes';
  update private.kinojo_ranking_snapshots_v390 set status='FAILED',updated_at=now(),last_error_code='DEFERRED_BUILD_FAILED'
  where snapshot_id=s.candidate_id and source_session_id='deferred:'||s.request_cutoff::text and status in ('BUILDING','READY');
  s.candidate_id:=null;
  if s.attempts>=3 then s.enabled:=false;end if;
 end if;
 update private.character_snapshot_dispatch set candidate_id=s.candidate_id,request_cutoff=s.request_cutoff,candidate_generation=s.candidate_generation,
 attempts=s.attempts,retry_at=s.retry_at,enabled=s.enabled,last_result=result||jsonb_build_object('action',action_name),updated_at=now()
 where singleton;
 return result||jsonb_build_object('action',action_name,'attempts',s.attempts,'enabled',s.enabled);
end $fn$;
revoke all on function private.kinojo_deferred_ranking_snapshot_tick() from public,anon,authenticated;
grant execute on function private.kinojo_deferred_ranking_snapshot_tick() to service_role;
-- Existing pg_cron and existing snapshot builders are reused; no new Edge function.
select cron.schedule('kinojo-deferred-ranking-hof','* * * * *','set statement_timeout=''50s''; select private.kinojo_deferred_ranking_snapshot_tick();');
commit;
