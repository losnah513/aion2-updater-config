-- Exact existing policy used by the restricted caller regression.
CREATE OR REPLACE FUNCTION public.kinojo_legion_tree_listless_policy_v455(p_session_id text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '5s'
 SET lock_timeout TO '1s'
AS $function$
declare
  v_valid jsonb;
  v_session public.updater_sessions%rowtype;
  v_target_count integer := 0;
  v_exact_target_count integer := 0;
  v_list_queue_count integer := 0;
  v_allowed boolean := false;
begin
  v_valid:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then
    return v_valid;
  end if;

  select * into v_session
    from public.updater_sessions s
   where s.session_id=p_session_id;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_QUEUE_SESSION_NOT_FOUND','message','Server Queue 세션을 찾지 못했습니다.');
  end if;

  select count(*),
         count(*) filter (where t.target_source='server:legion_tree_character_add_v455')
    into v_target_count,v_exact_target_count
    from public.lookup_session_targets t
   where t.session_id=p_session_id;

  select count(*) into v_list_queue_count
    from public.google_list_sheet_sync_queue q
   where q.session_id=p_session_id;

  v_allowed:=v_target_count=1
    and v_exact_target_count=1
    and coalesce(v_session.raw_payload->>'requestedSurface','')='LEGION_TREE_CHARACTER_ADD'
    and coalesce(v_session.raw_payload->>'databaseContract','')='455';

  return jsonb_build_object(
    'ok',true,
    'skipListWrite',v_allowed or not v_session.list_sheet_sync_enabled,
    'listSheetSyncEnabled',v_session.list_sheet_sync_enabled,
    'listSkipReason',case when v_allowed then 'LEGION_TREE_CHARACTER_ADD' when not v_session.list_sheet_sync_enabled then 'USER_DISABLED' else null end,
    'listlessCharacterAdd',v_allowed,
    'targetCount',v_target_count,
    'exactTargetCount',v_exact_target_count,
    'listQueueCount',v_list_queue_count,
    'targetSource',case when v_allowed then 'server:legion_tree_character_add_v455' else null end,
    'terminalStage',case when v_allowed or not v_session.list_sheet_sync_enabled then 'SERVER_QUEUE_CHARACTER_MASTER_DONE' else null end,
    'databaseContract','455',
    'message',case when v_allowed
      then '레기온 트리 캐릭터 추가 세션 · Google list 쓰기·readback 생략'
      when not v_session.list_sheet_sync_enabled then '실행 설정에 따라 Google list 쓰기·readback 생략'
      else '기존 Server Queue Google list 계약 유지' end
  );
end;
$function$

