begin;
CREATE OR REPLACE FUNCTION public.kinojo_admin_server_queue_status_v289(p_pass_key text, p_session_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '1s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_actor record;
begin
  select * into v_actor
  from public.kinojo_get_updater_actor(p_pass_key)
  limit 1;

  if not found or coalesce(v_actor.level, 0) < 3 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LOOKUP_ADMIN_ACCESS_DENIED',
      'message', '관리자 권한이 필요합니다.'
    );
  end if;

  return private.kinojo_admin_server_queue_status_cached_v422(
    v_actor.member_id,
    v_actor.level,
    p_session_id
  );
end;
$function$

;
commit;
