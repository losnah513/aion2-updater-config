-- Legion Tree character candidate search: manager-only global PLAYNC rate gate.
-- Candidate lookup remains read-only: this migration creates no Target/Queue rows.

create or replace function private.kinojo_legion_tree_search_authorize_v457(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
declare
  v_session jsonb;
begin
  v_session := public.kinojo_web_session_validate_v320(p_session_token, false);
  if coalesce((v_session->>'ok')::boolean, false) is not true then
    return v_session;
  end if;

  if coalesce((v_session#>>'{profile,canManage}')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'LEGION_TREE_MANAGE_FORBIDDEN',
      'message', '레기온 트리 캐릭터를 조회·추가할 권한이 없습니다.'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'memberId', v_session#>>'{profile,id}'
  );
end;
$function$;

create or replace function private.kinojo_legion_tree_search_rate_acquire_v457(
  p_session_token text,
  p_source text default 'LEGION_TREE_CHARACTER_SEARCH'
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
declare
  v_auth jsonb;
  v_state public.official_lookup_rate_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reserved_at timestamptz;
  v_wait_ms integer := 0;
  v_member_ref text;
begin
  v_auth := private.kinojo_legion_tree_search_authorize_v457(p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is not true then
    return v_auth;
  end if;
  v_member_ref := 'web:' || coalesce(nullif(v_auth->>'memberId', ''), 'unknown');

  insert into public.official_lookup_rate_state(provider)
  values ('plaync')
  on conflict(provider) do nothing;

  select * into v_state
    from public.official_lookup_rate_state
   where provider = 'plaync'
   for update;

  if v_state.paused_until is not null and v_state.paused_until > v_now then
    v_wait_ms := greatest(1, ceil(extract(epoch from (v_state.paused_until - v_now)) * 1000)::integer);
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'allowed', false,
      'rateLimited', true,
      'waitMs', v_wait_ms,
      'pausedUntil', v_state.paused_until,
      'retryAfterSeconds', greatest(1, ceil(v_wait_ms / 1000.0)::integer),
      'message', 'PLAYNC 요청 제한 대기 중입니다.'
    );
  end if;

  v_reserved_at := greatest(coalesce(v_state.next_request_at, v_now), v_now);
  v_wait_ms := greatest(0, ceil(extract(epoch from (v_reserved_at - v_now)) * 1000)::integer);

  update public.official_lookup_rate_state
     set paused_until = null,
         next_request_at = v_reserved_at + interval '700 milliseconds',
         last_session_id = v_member_ref,
         last_source = left(coalesce(nullif(btrim(p_source), ''), 'LEGION_TREE_CHARACTER_SEARCH'), 120),
         updated_at = pg_catalog.now()
   where provider = 'plaync';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'allowed', true,
    'rateLimited', false,
    'waitMs', v_wait_ms,
    'reservedAt', v_reserved_at,
    'minIntervalMs', 700
  );
end;
$function$;

create or replace function private.kinojo_legion_tree_search_rate_success_v457(
  p_session_token text,
  p_source text default 'LEGION_TREE_CHARACTER_SEARCH'
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
declare
  v_auth jsonb;
begin
  v_auth := private.kinojo_legion_tree_search_authorize_v457(p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is not true then
    return v_auth;
  end if;

  update public.official_lookup_rate_state
     set paused_until = case when paused_until is null or paused_until <= pg_catalog.clock_timestamp() then null else paused_until end,
         last_http_status = 200,
         last_retry_after_seconds = case when paused_until is null or paused_until <= pg_catalog.clock_timestamp() then null else last_retry_after_seconds end,
         consecutive_429 = case when paused_until is null or paused_until <= pg_catalog.clock_timestamp() then 0 else consecutive_429 end,
         last_session_id = 'web:' || coalesce(nullif(v_auth->>'memberId', ''), 'unknown'),
         last_source = left(coalesce(nullif(btrim(p_source), ''), 'LEGION_TREE_CHARACTER_SEARCH'), 120),
         last_error = case when paused_until is null or paused_until <= pg_catalog.clock_timestamp() then null else last_error end,
         updated_at = pg_catalog.now()
   where provider = 'plaync';

  return pg_catalog.jsonb_build_object('ok', true, 'rateLimited', false);
end;
$function$;

create or replace function private.kinojo_legion_tree_search_rate_failure_v457(
  p_session_token text,
  p_source text,
  p_http_status integer,
  p_retry_after_seconds integer default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
declare
  v_auth jsonb;
  v_retry integer;
begin
  v_auth := private.kinojo_legion_tree_search_authorize_v457(p_session_token);
  if coalesce((v_auth->>'ok')::boolean, false) is not true then
    return v_auth;
  end if;
  v_retry := case when p_http_status = 429 then least(greatest(coalesce(p_retry_after_seconds, 30), 1), 600) else null end;

  update public.official_lookup_rate_state
     set paused_until = case when p_http_status = 429 then greatest(coalesce(paused_until, pg_catalog.clock_timestamp()), pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => v_retry)) else paused_until end,
         last_http_status = p_http_status,
         last_retry_after_seconds = v_retry,
         consecutive_429 = case when p_http_status = 429 then consecutive_429 + 1 else consecutive_429 end,
         last_session_id = 'web:' || coalesce(nullif(v_auth->>'memberId', ''), 'unknown'),
         last_source = left(coalesce(nullif(btrim(p_source), ''), 'LEGION_TREE_CHARACTER_SEARCH'), 120),
         last_error = left(coalesce(p_error, ''), 1000),
         updated_at = pg_catalog.now()
   where provider = 'plaync';

  return pg_catalog.jsonb_build_object('ok', true, 'rateLimited', p_http_status = 429, 'retryAfterSeconds', v_retry);
end;
$function$;

create or replace function public.kinojo_legion_tree_search_rate_acquire_v457(
  p_session_token text,
  p_source text default 'LEGION_TREE_CHARACTER_SEARCH'
)
returns jsonb
language sql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
  select private.kinojo_legion_tree_search_rate_acquire_v457(p_session_token, p_source);
$function$;

create or replace function public.kinojo_legion_tree_search_rate_success_v457(
  p_session_token text,
  p_source text default 'LEGION_TREE_CHARACTER_SEARCH'
)
returns jsonb
language sql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
  select private.kinojo_legion_tree_search_rate_success_v457(p_session_token, p_source);
$function$;

create or replace function public.kinojo_legion_tree_search_rate_failure_v457(
  p_session_token text,
  p_source text,
  p_http_status integer,
  p_retry_after_seconds integer default null,
  p_error text default null
)
returns jsonb
language sql
security definer
set search_path to pg_catalog, public, private, extensions
as $function$
  select private.kinojo_legion_tree_search_rate_failure_v457(p_session_token, p_source, p_http_status, p_retry_after_seconds, p_error);
$function$;

revoke all on function private.kinojo_legion_tree_search_authorize_v457(text) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_search_rate_acquire_v457(text, text) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_search_rate_success_v457(text, text) from public, anon, authenticated;
revoke all on function private.kinojo_legion_tree_search_rate_failure_v457(text, text, integer, integer, text) from public, anon, authenticated;

revoke all on function public.kinojo_legion_tree_search_rate_acquire_v457(text, text) from public, anon, authenticated;
revoke all on function public.kinojo_legion_tree_search_rate_success_v457(text, text) from public, anon, authenticated;
revoke all on function public.kinojo_legion_tree_search_rate_failure_v457(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_search_rate_acquire_v457(text, text) to service_role;
grant execute on function public.kinojo_legion_tree_search_rate_success_v457(text, text) to service_role;
grant execute on function public.kinojo_legion_tree_search_rate_failure_v457(text, text, integer, integer, text) to service_role;

comment on function public.kinojo_legion_tree_search_rate_acquire_v457(text, text) is
  'Server-only manager session gate and global PLAYNC reservation for read-only Legion Tree candidate search.';
