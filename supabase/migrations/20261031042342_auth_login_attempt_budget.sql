-- SQL546: bounded server-only login admission. No PASS KEY/token is retained.
create table private.auth_login_buckets_v546 (
  scope text not null,
  window_start timestamptz not null,
  attempts integer not null check(attempts>0),
  expires_at timestamptz not null,
  primary key(scope,window_start)
);
create index auth_login_buckets_expiry_v546 on private.auth_login_buckets_v546(expires_at);
alter table private.auth_login_buckets_v546 enable row level security;
revoke all on private.auth_login_buckets_v546 from public,anon,authenticated,service_role;
create function public.kinojo_auth_login_admit_v546(p_client_scope text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog set statement_timeout='2s' set lock_timeout='250ms'
as $body$
declare v_now timestamptz:=clock_timestamp();v_global timestamptz;v_client timestamptz;v_count integer;
begin
 if p_client_scope is null or p_client_scope!~'^[0-9a-f]{64}$' then
  return jsonb_build_object('ok',false,'code','AUTH_LIMIT_SCOPE_INVALID');
 end if;
 v_global:=date_trunc('minute',v_now);
 v_client:=to_timestamp(floor(extract(epoch from v_now)/300)*300);
 -- The fixed global bucket caps cost/cardinality even with forged IP headers.
 insert into private.auth_login_buckets_v546 values('global',v_global,1,v_global+interval '15 minutes')
 on conflict(scope,window_start) do update set attempts=least(private.auth_login_buckets_v546.attempts+1,1000000)
 returning attempts into v_count;
 if v_count>120 then return jsonb_build_object('ok',false,'code','AUTH_RATE_LIMITED','retryAfter',greatest(1,ceil(extract(epoch from v_global+interval '1 minute'-v_now))));end if;
 delete from private.auth_login_buckets_v546 where (scope,window_start) in
 (select scope,window_start from private.auth_login_buckets_v546 where expires_at<v_now order by expires_at limit 256);
 insert into private.auth_login_buckets_v546 values(p_client_scope,v_client,1,v_client+interval '15 minutes')
 on conflict(scope,window_start) do update set attempts=least(private.auth_login_buckets_v546.attempts+1,1000000)
 returning attempts into v_count;
 if v_count>20 then return jsonb_build_object('ok',false,'code','AUTH_RATE_LIMITED','retryAfter',greatest(1,ceil(extract(epoch from v_client+interval '5 minutes'-v_now))));end if;
 return jsonb_build_object('ok',true);
end $body$;
revoke all on function public.kinojo_auth_login_admit_v546(text) from public,anon,authenticated;
grant execute on function public.kinojo_auth_login_admit_v546(text) to service_role;
