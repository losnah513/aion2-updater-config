CREATE OR REPLACE FUNCTION public.kinojo_automation_admin_save_v377(p_pass_key text, p_job_type text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'cron'
AS $function$
declare
  v_actor record;
  v_key text := lower(trim(coalesce(p_job_type, '')));
  v_running boolean;
  v_job_name text;
begin
  select * into v_actor from public.kinojo_get_updater_actor(p_pass_key) limit 1;
  if not found or coalesce(v_actor.level, 0) < 5 then
    return jsonb_build_object('ok', false, 'code', 'MASTER_ACCESS_REQUIRED', 'message', '자동 실행 ON/OFF는 MASTER만 변경할 수 있습니다.');
  end if;
  if v_key not in ('character_refresh', 'sanctuary_sync') then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_NOT_FOUND', 'message', '자동화 종류를 확인해 주세요.');
  end if;

  select running into v_running
  from public.kinojo_server_automation_settings
  where automation_key = v_key
  for update;

  if v_running is true then
    return jsonb_build_object('ok', false, 'code', 'AUTOMATION_RUNNING', 'message', '자동 작업 진행 중에는 ON/OFF를 변경할 수 없습니다.');
  end if;

  update public.kinojo_server_automation_settings
  set enabled = coalesce(p_enabled, false),
      updated_by = coalesce(v_actor.main_character_name, 'MASTER'),
      updated_at = now()
  where automation_key = v_key;

  v_job_name := case v_key
    when 'character_refresh' then 'kinojo-character-refresh-6h-v377'
    else 'kinojo-sanctuary-sheet-sync-12h-v377'
  end;
  update cron.job set active = coalesce(p_enabled, false) where jobname = v_job_name;

  return jsonb_build_object(
    'ok', true,
    'message', case when p_enabled then '자동 실행을 ON으로 변경했습니다.' else '자동 실행을 OFF로 변경했습니다.' end,
    'status', public.kinojo_automation_admin_status_v377(p_pass_key)
  );
end;
$function$;
